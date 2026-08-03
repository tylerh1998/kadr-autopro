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

    const { startDate, endDate } = await req.json();

    if (!startDate || !endDate) {
      return res({ error: 'Start date and end date are required' });
    }

    console.log('Fetching P&L data for date range:', startDate, 'to', endDate);

    const { data: allAccounts, error: accountsError } = await supabase
      .from('ChartOfAccount')
      .select('*')
      .limit(10000);
    if (accountsError) throw new Error(accountsError.message);

    const normalizedAccounts = (allAccounts || []).map((account: any) => ({
      ...account,
      account_number: account.account_number != null ? String(account.account_number) : '',
      parent_account: account.parent_account != null ? String(account.parent_account) : null
    }));

    console.log('Found total accounts:', normalizedAccounts.length);

    const { data: aggregatedRowsData, error: rpcError } = await supabase.rpc('get_pl_report_data', {
      start_date: startDate,
      end_date: endDate
    });
    if (rpcError) {
      throw new Error(`Failed to run get_pl_report_data: ${rpcError.message}`);
    }
    const aggregatedRows = aggregatedRowsData || [];

    const totalsByAccount: any = {};
    aggregatedRows.forEach((row: any) => {
      const accountNumber = row.account_number != null ? String(row.account_number) : '';
      if (!accountNumber) return;

      totalsByAccount[accountNumber] = {
        debits: Number(row.total_debits) || 0,
        credits: Number(row.total_credits) || 0,
        transactionCount: Number(row.transaction_count) || 0
      };
    });

    const { data: transactionAuditRows, error: transactionsError } = await supabase
      .from('GLTransaction')
      .select('id, account_number, transaction_date')
      .gte('transaction_date', startDate)
      .lte('transaction_date', endDate);

    if (transactionsError) {
      throw new Error(`Failed to fetch GLTransaction audit rows from Supabase: ${transactionsError.message}`);
    }

    const knownAccountNumbers = new Set(normalizedAccounts.map((acc: any) => acc.account_number).filter(Boolean));
    const invalidTransactions = (transactionAuditRows || [])
      .filter((tx: any) => {
        if (!tx.transaction_date) return false;
        const txDateStr = String(tx.transaction_date).split('T')[0];
        if (txDateStr < startDate || txDateStr > endDate) return false;

        const accountNumber = tx.account_number != null ? String(tx.account_number) : '';
        return accountNumber && !knownAccountNumbers.has(accountNumber);
      })
      .map((tx: any) => ({
        ...tx,
        account_number: tx.account_number != null ? String(tx.account_number) : ''
      }));

    invalidTransactions.forEach((tx: any) => {
      console.error(`CRITICAL ERROR: Transaction ${tx.id} references unknown account: ${tx.account_number}`);
    });

    const accountMap: any = {};

    normalizedAccounts.forEach((account: any) => {
      if (!account.account_number) return;
      accountMap[account.account_number] = {
        ...account,
        children: [],
        own_amount: 0,
        total_amount: 0,
        credits: 0,
        debits: 0,
        transactionCount: 0
      };
    });

    Object.values(accountMap).forEach((accNode: any) => {
      const totals = totalsByAccount[accNode.account_number] || {
        credits: 0,
        debits: 0,
        transactionCount: 0
      };

      accNode.credits = totals.credits;
      accNode.debits = totals.debits;
      accNode.transactionCount = totals.transactionCount;

      if (accNode.account_type === 'Revenue') {
        accNode.own_amount = accNode.credits - accNode.debits;
      } else if (accNode.account_type === 'Expense') {
        accNode.own_amount = accNode.debits - accNode.credits;
      } else if (['Asset', 'Expense'].includes(accNode.account_type)) {
        accNode.own_amount = accNode.debits - accNode.credits;
      } else {
        accNode.own_amount = accNode.credits - accNode.debits;
      }
    });

    const roots: any[] = [];
    Object.values(accountMap).forEach((accNode: any) => {
      if (accNode.parent_account && accountMap[accNode.parent_account]) {
        accountMap[accNode.parent_account].children.push(accNode);
      } else {
        roots.push(accNode);
      }
    });

    const calculateTotals = (node: any): number => {
      let childTotal = 0;
      node.children.forEach((child: any) => {
        childTotal += calculateTotals(child);
      });
      node.total_amount = node.own_amount + childTotal;
      return node.total_amount;
    };

    roots.forEach((root) => calculateTotals(root));

    const transformNode = (node: any) => {
      node.children.sort((a: any, b: any) => a.account_number.localeCompare(b.account_number));
      node.children.forEach(transformNode);

      if (node.children.length > 0 && Math.abs(node.own_amount) > 0.001) {
        const syntheticChild = {
          ...node,
          account_name: `${node.account_name} (Direct)`,
          amount: node.own_amount,
          children: [],
          is_synthetic: true,
          parent_account: node.account_number
        };
        node.children.unshift(syntheticChild);
      }

      node.amount = node.total_amount;
    };

    roots.forEach(transformNode);

    const filterHierarchy = (nodes: any[]): any[] => {
      return nodes.reduce((acc: any[], node: any) => {
        if (node.children && node.children.length > 0) {
          node.children = filterHierarchy(node.children);
        }

        const hasBalance = Math.abs(node.amount) > 0.001;
        const hasActivity = node.transactionCount > 0;
        const hasChildren = node.children && node.children.length > 0;

        if (hasBalance || hasActivity || hasChildren) {
          acc.push(node);
        }
        return acc;
      }, []);
    };

    const revenueData = filterHierarchy(roots.filter((r: any) => r.account_type === 'Revenue'));
    const expenseData = filterHierarchy(roots.filter((r: any) => r.account_type === 'Expense'));

    revenueData.sort((a: any, b: any) => a.account_number.localeCompare(b.account_number));
    expenseData.sort((a: any, b: any) => a.account_number.localeCompare(b.account_number));

    const totalRevenue = revenueData.reduce((sum: number, acc: any) => sum + acc.amount, 0);
    const totalExpenses = expenseData.reduce((sum: number, acc: any) => sum + acc.amount, 0);
    const netIncome = totalRevenue - totalExpenses;

    console.log('P&L Summary - Revenue:', totalRevenue, 'Expenses:', totalExpenses, 'Net Income:', netIncome);

    return res({
      success: true,
      warnings: invalidTransactions.length > 0 ? `Found ${invalidTransactions.length} transactions with unknown accounts. Check server logs.` : null,
      invalidTransactions,
      data: {
        revenue: revenueData,
        expenses: expenseData,
        summary: {
          totalRevenue,
          totalExpenses,
          netIncome
        },
        dateRange: {
          startDate,
          endDate
        }
      }
    });
  } catch (error: any) {
    console.error('Error generating P&L report:', error);
    return res({
      error: error.message || 'Failed to generate P&L report',
      details: error.stack
    });
  }
});
