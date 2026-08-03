import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const res = (data: any, options: any = {}) => {
    return new Response(JSON.stringify(data), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json', ...(options.headers || {}) }
    });
  };

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseSecret = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !supabaseSecret) {
      return res({ error: 'Supabase credentials not configured' });
    }

    const supabase = createClient(supabaseUrl, supabaseSecret, {
      auth: { persistSession: false }
    });

    const { endDate } = await req.json();
    const isValidDateString = (value: any) => /^\d{4}-\d{2}-\d{2}$/.test(value || '');

    if (!isValidDateString(endDate)) {
      return res({ error: 'A valid endDate is required' });
    }

    const parseDateOnly = (dateStr: string) => {
      const [year, month, day] = String(dateStr).split('-').map(Number);
      return new Date(Date.UTC(year, month - 1, day));
    };

    const formatDateOnly = (date: Date) => date.toISOString().split('T')[0];
    const getMonthStart = (date: Date) => new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
    const getMonthEnd = (date: Date) => new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0));
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const formatMonthLabel = (date: Date) => `${monthNames[date.getUTCMonth()]} ${date.getUTCFullYear()}`;
    const roundAmount = (value: any) => Math.round((value || 0) * 100) / 100;
    const getVariancePercent = (month1: number, month3: number) => {
      if (Math.abs(month1) < 0.005) return null;
      return ((month3 - month1) / month1) * 100;
    };

    const anchorDate = parseDateOnly(endDate);
    const month3Start = getMonthStart(anchorDate);
    const month2Start = new Date(Date.UTC(month3Start.getUTCFullYear(), month3Start.getUTCMonth() - 1, 1));
    const month1Start = new Date(Date.UTC(month3Start.getUTCFullYear(), month3Start.getUTCMonth() - 2, 1));

    const months = [
      { key: 'month1', label: formatMonthLabel(month1Start), start: formatDateOnly(month1Start), end: formatDateOnly(getMonthEnd(month1Start)) },
      { key: 'month2', label: formatMonthLabel(month2Start), start: formatDateOnly(month2Start), end: formatDateOnly(getMonthEnd(month2Start)) },
      { key: 'month3', label: formatMonthLabel(month3Start), start: formatDateOnly(month3Start), end: formatDateOnly(getMonthEnd(month3Start)) }
    ];

    const { data: allAccounts, error: accountsError } = await supabase
      .from('ChartOfAccount')
      .select('*')
      .limit(10000);
    if (accountsError) throw new Error(accountsError.message);

    const plAccounts = (allAccounts || []).filter((account: any) => ['Revenue', 'Expense'].includes(account.account_type) && account.is_active !== false);

    const callRpcForMonth = async (start_date: string, end_date: string) => {
      const { data, error } = await supabase.rpc('get_pl_report_data', { start_date, end_date });
      if (error) throw new Error(`RPC error for ${start_date}: ${error.message}`);
      return data || [];
    };

    const [m1Rows, m2Rows, m3Rows] = await Promise.all([
      callRpcForMonth(months[0].start, months[0].end),
      callRpcForMonth(months[1].start, months[1].end),
      callRpcForMonth(months[2].start, months[2].end)
    ]);

    const accountMap: any = {};

    plAccounts.forEach((account: any) => {
      accountMap[String(account.account_number)] = {
        ...account,
        account_number: String(account.account_number),
        parent_account: account.parent_account != null ? String(account.parent_account) : null,
        children: [],
        month1_own: 0,
        month2_own: 0,
        month3_own: 0,
        month1_total: 0,
        month2_total: 0,
        month3_total: 0,
        month1: 0,
        month2: 0,
        month3: 0,
        variance_pct: null,
        transactionCount: 0,
        amount: 0
      };
    });

    const processRpcRows = (rows: any[], monthKey: string) => {
      rows.forEach((row: any) => {
        const accNum = String(row.account_number || '');
        const node = accountMap[accNum];
        if (!node) return;

        const creditAmount = Number(row.total_credits) || 0;
        const debitAmount = Number(row.total_debits) || 0;
        const signedAmount = node.account_type === 'Revenue' ? creditAmount - debitAmount : debitAmount - creditAmount;

        node[`${monthKey}_own`] += signedAmount;
        node.transactionCount += Number(row.transaction_count) || 0;
      });
    };

    processRpcRows(m1Rows, 'month1');
    processRpcRows(m2Rows, 'month2');
    processRpcRows(m3Rows, 'month3');

    const roots: any[] = [];
    Object.values(accountMap).forEach((node: any) => {
      if (node.parent_account && accountMap[node.parent_account]) {
        accountMap[node.parent_account].children.push(node);
      } else {
        roots.push(node);
      }
    });

    const calculateTotals = (node: any) => {
      let month1Children = 0;
      let month2Children = 0;
      let month3Children = 0;

      node.children.forEach((child: any) => {
        calculateTotals(child);
        month1Children += child.month1_total;
        month2Children += child.month2_total;
        month3Children += child.month3_total;
      });

      node.month1_total = node.month1_own + month1Children;
      node.month2_total = node.month2_own + month2Children;
      node.month3_total = node.month3_own + month3Children;
      return node;
    };

    roots.forEach(calculateTotals);

    const transformNode = (node: any) => {
      node.children.sort((a: any, b: any) => a.account_number.localeCompare(b.account_number));
      node.children.forEach(transformNode);

      const hasOwnBalance = [node.month1_own, node.month2_own, node.month3_own].some((value: number) => Math.abs(value) > 0.005);

      if (node.children.length > 0 && hasOwnBalance) {
        node.children.unshift({
          ...node,
          account_name: `${node.account_name} (Direct)`,
          children: [],
          is_synthetic: true,
          parent_account: node.account_number,
          month1: roundAmount(node.month1_own),
          month2: roundAmount(node.month2_own),
          month3: roundAmount(node.month3_own),
          amount: roundAmount(node.month3_own),
          variance_pct: getVariancePercent(roundAmount(node.month1_own), roundAmount(node.month3_own))
        });
      }

      node.month1 = roundAmount(node.month1_total);
      node.month2 = roundAmount(node.month2_total);
      node.month3 = roundAmount(node.month3_total);
      node.amount = node.month3;
      node.variance_pct = getVariancePercent(node.month1, node.month3);
    };

    roots.forEach(transformNode);

    const filterHierarchy = (nodes: any[]): any[] => {
      return nodes.reduce((acc: any[], node: any) => {
        if (node.children && node.children.length > 0) {
          node.children = filterHierarchy(node.children);
        }

        const hasBalance = Math.abs(node.month1) > 0.005 || Math.abs(node.month2) > 0.005 || Math.abs(node.month3) > 0.005;
        const hasActivity = node.transactionCount > 0;
        const hasChildren = node.children && node.children.length > 0;

        if (hasBalance || hasActivity || hasChildren) {
          acc.push(node);
        }

        return acc;
      }, []);
    };

    const revenueRows = filterHierarchy(roots.filter((root: any) => root.account_type === 'Revenue')).sort((a: any, b: any) => a.account_number.localeCompare(b.account_number));
    const expenseRows = filterHierarchy(roots.filter((root: any) => root.account_type === 'Expense')).sort((a: any, b: any) => a.account_number.localeCompare(b.account_number));

    const summarizeRows = (rows: any[]) => {
      const month1 = roundAmount(rows.reduce((sum, row) => sum + row.month1, 0));
      const month2 = roundAmount(rows.reduce((sum, row) => sum + row.month2, 0));
      const month3 = roundAmount(rows.reduce((sum, row) => sum + row.month3, 0));
      return {
        month1,
        month2,
        month3,
        variance_pct: getVariancePercent(month1, month3)
      };
    };

    const totalRevenue = summarizeRows(revenueRows);
    const totalExpenses = summarizeRows(expenseRows);
    const netIncome: any = {
      month1: roundAmount(totalRevenue.month1 - totalExpenses.month1),
      month2: roundAmount(totalRevenue.month2 - totalExpenses.month2),
      month3: roundAmount(totalRevenue.month3 - totalExpenses.month3)
    };
    netIncome.variance_pct = getVariancePercent(netIncome.month1, netIncome.month3);

    return res({
      success: true,
      data: {
        endDate,
        months,
        revenueRows,
        expenseRows,
        summary: {
          totalRevenue,
          totalExpenses,
          netIncome
        }
      }
    });
  } catch (error: any) {
    console.error('Error generating three month P&L report:', error);
    return res({ error: error.message || 'Failed to generate three month P&L report' });
  }
});
