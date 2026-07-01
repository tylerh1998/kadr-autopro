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

    const allAccounts = await base44.entities.ChartOfAccount.list(null, 10000);
    const revenueAccounts = allAccounts.filter((acc) => acc.account_type === 'Revenue' && acc.is_active);
    const expenseAccounts = allAccounts.filter((acc) => acc.account_type === 'Expense' && acc.is_active);

    console.log('Found accounts - Revenue:', revenueAccounts.length, 'Expense:', expenseAccounts.length);

    const { data: allTransactions, error: transactionsError } = await supabase
      .from('GLTransaction')
      .select('id, account_number, transaction_date, debit_amount, credit_amount')
      .gte('transaction_date', startDate)
      .lte('transaction_date', endDate);

    if (transactionsError) {
      throw new Error(`Failed to fetch GLTransaction rows from Supabase: ${transactionsError.message}`);
    }

    const knownAccountNumbers = new Set(allAccounts.map((acc) => acc.account_number));
    const invalidTransactions = [];

    const validTransactions = (allTransactions || []).filter((tx) => {
      if (!tx.transaction_date) return false;
      const txDateStr = String(tx.transaction_date).split('T')[0];
      if (txDateStr < startDate || txDateStr > endDate) return false;

      if (!knownAccountNumbers.has(tx.account_number)) {
        console.error(`CRITICAL ERROR: Transaction ${tx.id} references unknown account: ${tx.account_number}`);
        invalidTransactions.push(tx);
        return false;
      }
      return true;
    });

    console.log('Found', validTransactions.length, 'valid transactions in date range');

    const calculateAccountBalance = (accountNumber, transactions) => {
      const accountTransactions = transactions.filter((tx) => tx.account_number === accountNumber);

      let totalCredits = 0;
      let totalDebits = 0;

      accountTransactions.forEach((tx) => {
        totalCredits += Number(tx.credit_amount) || 0;
        totalDebits += Number(tx.debit_amount) || 0;
      });

      return {
        credits: totalCredits,
        debits: totalDebits,
        transactionCount: accountTransactions.length
      };
    };

    const accountMap = {};

    allAccounts.forEach((account) => {
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
      const { credits, debits, transactionCount } = calculateAccountBalance(accNode.account_number, validTransactions);

      accNode.credits = credits;
      accNode.debits = debits;
      accNode.transactionCount = transactionCount;

      if (accNode.account_type === 'Revenue') {
        accNode.own_amount = credits - debits;
      } else if (accNode.account_type === 'Expense') {
        accNode.own_amount = debits - credits;
      } else if (['Asset', 'Expense'].includes(accNode.account_type)) {
        accNode.own_amount = debits - credits;
      } else {
        accNode.own_amount = credits - debits;
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