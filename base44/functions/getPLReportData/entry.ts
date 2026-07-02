import { createClientFromRequest } from 'npm:@base44/sdk@0.8.3';
import { createClient } from 'npm:@supabase/supabase-js@2.39.3';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { startDate, endDate } = await req.json();

    if (!startDate || !endDate) {
      return Response.json({ error: 'Start date and end date are required' }, { status: 400 });
    }

    console.log('Fetching P&L data for date range:', startDate, 'to', endDate);

    const supabaseUrl = Deno.env.get('Supabase_project_url');
    const supabaseSecret = Deno.env.get('Supabase_Secret_Key');
    if (!supabaseUrl || !supabaseSecret) {
      return Response.json({ error: 'Supabase credentials not configured' }, { status: 500 });
    }

    const supabase = createClient(supabaseUrl, supabaseSecret, {
      auth: { persistSession: false }
    });

    const callRpcWithCandidates = async (functionName, candidates) => {
      let lastError = null;

      for (const args of candidates) {
        const { data, error } = await supabase.rpc(functionName, args);
        if (!error) {
          return data || [];
        }
        lastError = error;
      }

      throw new Error(`Failed to run ${functionName}: ${lastError?.message || 'Unknown RPC error'}`);
    };

    const allAccounts = await base44.entities.ChartOfAccount.list(null, 10000);
    const normalizedAccounts = (allAccounts || []).map((account) => ({
      ...account,
      account_number: account.account_number != null ? String(account.account_number) : '',
      parent_account: account.parent_account != null ? String(account.parent_account) : null
    }));

    console.log('Found total accounts:', normalizedAccounts.length);

    const aggregatedRows = await callRpcWithCandidates('get_pl_report_data', [
      { start_date: startDate, end_date: endDate },
      { p_start_date: startDate, p_end_date: endDate },
      { startDate, endDate }
    ]);

    const totalsByAccount = {};
    (aggregatedRows || []).forEach((row) => {
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

    const knownAccountNumbers = new Set(normalizedAccounts.map((acc) => acc.account_number).filter(Boolean));
    const invalidTransactions = (transactionAuditRows || [])
      .filter((tx) => {
        if (!tx.transaction_date) return false;
        const txDateStr = String(tx.transaction_date).split('T')[0];
        if (txDateStr < startDate || txDateStr > endDate) return false;

        const accountNumber = tx.account_number != null ? String(tx.account_number) : '';
        return accountNumber && !knownAccountNumbers.has(accountNumber);
      })
      .map((tx) => ({
        ...tx,
        account_number: tx.account_number != null ? String(tx.account_number) : ''
      }));

    invalidTransactions.forEach((tx) => {
      console.error(`CRITICAL ERROR: Transaction ${tx.id} references unknown account: ${tx.account_number}`);
    });

    const accountMap = {};

    normalizedAccounts.forEach((account) => {
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

    Object.values(accountMap).forEach((accNode) => {
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

    const roots = [];
    Object.values(accountMap).forEach((accNode) => {
      if (accNode.parent_account && accountMap[accNode.parent_account]) {
        accountMap[accNode.parent_account].children.push(accNode);
      } else {
        roots.push(accNode);
      }
    });

    const calculateTotals = (node) => {
      let childTotal = 0;
      node.children.forEach((child) => {
        childTotal += calculateTotals(child);
      });
      node.total_amount = node.own_amount + childTotal;
      return node.total_amount;
    };

    roots.forEach((root) => calculateTotals(root));

    const transformNode = (node) => {
      node.children.sort((a, b) => a.account_number.localeCompare(b.account_number));
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

    const filterHierarchy = (nodes) => {
      return nodes.reduce((acc, node) => {
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

    const revenueData = filterHierarchy(roots.filter((r) => r.account_type === 'Revenue'));
    const expenseData = filterHierarchy(roots.filter((r) => r.account_type === 'Expense'));

    revenueData.sort((a, b) => a.account_number.localeCompare(b.account_number));
    expenseData.sort((a, b) => a.account_number.localeCompare(b.account_number));

    const totalRevenue = revenueData.reduce((sum, acc) => sum + acc.amount, 0);
    const totalExpenses = expenseData.reduce((sum, acc) => sum + acc.amount, 0);
    const netIncome = totalRevenue - totalExpenses;

    console.log('P&L Summary - Revenue:', totalRevenue, 'Expenses:', totalExpenses, 'Net Income:', netIncome);

    return Response.json({
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
  } catch (error) {
    console.error('Error generating P&L report:', error);
    return Response.json({
      error: error.message || 'Failed to generate P&L report',
      details: error.stack
    }, { status: 500 });
  }
});