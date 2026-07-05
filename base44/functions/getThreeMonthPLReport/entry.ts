import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';
import { createClient } from 'npm:@supabase/supabase-js@2.39.3';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { endDate } = await req.json();
    const isValidDateString = (value) => /^\d{4}-\d{2}-\d{2}$/.test(value || '');

    if (!isValidDateString(endDate)) {
      return Response.json({ error: 'A valid endDate is required' }, { status: 400 });
    }

    const parseDateOnly = (dateStr) => {
      const [year, month, day] = String(dateStr).split('-').map(Number);
      return new Date(Date.UTC(year, month - 1, day));
    };

    const formatDateOnly = (date) => date.toISOString().split('T')[0];
    const getMonthStart = (date) => new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
    const getMonthEnd = (date) => new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0));
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const formatMonthLabel = (date) => `${monthNames[date.getUTCMonth()]} ${date.getUTCFullYear()}`;
    const roundAmount = (value) => Math.round((value || 0) * 100) / 100;
    const getVariancePercent = (month1, month3) => {
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

    const overallStart = months[0].start;
    const overallEnd = months[2].end;

    const supabaseUrl = Deno.env.get('Supabase_project_url');
    const supabaseSecret = Deno.env.get('Supabase_Secret_Key');
    if (!supabaseUrl || !supabaseSecret) {
      return Response.json({ error: 'Supabase credentials not configured' }, { status: 500 });
    }

    const supabase = createClient(supabaseUrl, supabaseSecret, {
      auth: { persistSession: false }
    });

    const allAccounts = await base44.asServiceRole.entities.ChartOfAccount.list(null, 10000);
    const plAccounts = allAccounts.filter((account) => ['Revenue', 'Expense'].includes(account.account_type) && account.is_active !== false);

    const callRpcForMonth = async (start_date, end_date) => {
      const { data, error } = await supabase.rpc('get_pl_report_data', { start_date, end_date });
      if (error) throw new Error(`RPC error for ${start_date}: ${error.message}`);
      return data || [];
    };

    const [m1Rows, m2Rows, m3Rows] = await Promise.all([
      callRpcForMonth(months[0].start, months[0].end),
      callRpcForMonth(months[1].start, months[1].end),
      callRpcForMonth(months[2].start, months[2].end)
    ]);

    const accountMap = {};

    plAccounts.forEach((account) => {
      accountMap[account.account_number] = {
        ...account,
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

    const processRpcRows = (rows, monthKey) => {
      rows.forEach((row) => {
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

    const roots = [];
    Object.values(accountMap).forEach((node) => {
      if (node.parent_account && accountMap[node.parent_account]) {
        accountMap[node.parent_account].children.push(node);
      } else {
        roots.push(node);
      }
    });

    const calculateTotals = (node) => {
      let month1Children = 0;
      let month2Children = 0;
      let month3Children = 0;

      node.children.forEach((child) => {
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

    const transformNode = (node) => {
      node.children.sort((a, b) => a.account_number.localeCompare(b.account_number));
      node.children.forEach(transformNode);

      const hasOwnBalance = [node.month1_own, node.month2_own, node.month3_own].some((value) => Math.abs(value) > 0.005);

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

    const filterHierarchy = (nodes) => {
      return nodes.reduce((acc, node) => {
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

    const revenueRows = filterHierarchy(roots.filter((root) => root.account_type === 'Revenue')).sort((a, b) => a.account_number.localeCompare(b.account_number));
    const expenseRows = filterHierarchy(roots.filter((root) => root.account_type === 'Expense')).sort((a, b) => a.account_number.localeCompare(b.account_number));

    const summarizeRows = (rows) => {
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
    const netIncome = {
      month1: roundAmount(totalRevenue.month1 - totalExpenses.month1),
      month2: roundAmount(totalRevenue.month2 - totalExpenses.month2),
      month3: roundAmount(totalRevenue.month3 - totalExpenses.month3)
    };
    netIncome.variance_pct = getVariancePercent(netIncome.month1, netIncome.month3);

    return Response.json({
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
  } catch (error) {
    console.error('Error generating three month P&L report:', error);
    return Response.json({ error: error.message || 'Failed to generate three month P&L report' }, { status: 500 });
  }
});