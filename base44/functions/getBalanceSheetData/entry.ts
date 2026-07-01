import { createClientFromRequest } from 'npm:@base44/sdk@0.8.3';
import { createClient } from 'npm:@supabase/supabase-js@2.39.3';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { asOfDate } = await req.json();

    if (!asOfDate) {
      return Response.json({ error: 'As-of date is required' }, { status: 400 });
    }

    console.log('Fetching Balance Sheet data as of:', asOfDate);

    const supabaseUrl = Deno.env.get('Supabase_project_url');
    const supabaseSecret = Deno.env.get('Supabase_Secret_Key');
    if (!supabaseUrl || !supabaseSecret) {
      return Response.json({ error: 'Supabase credentials not configured' }, { status: 500 });
    }

    const supabase = createClient(supabaseUrl, supabaseSecret, {
      auth: { persistSession: false }
    });

    const allAccounts = await base44.entities.ChartOfAccount.list(null, 10000);
    console.log('Found accounts:', allAccounts.length);

    const { data: allTransactions, error: transactionsError } = await supabase
      .from('GLTransaction')
      .select('id, account_number, transaction_date, debit_amount, credit_amount')
      .lte('transaction_date', asOfDate);

    if (transactionsError) {
      throw new Error(`Failed to fetch GLTransaction rows from Supabase: ${transactionsError.message}`);
    }

    const transactions = allTransactions || [];
    const knownAccountNumbers = new Set(allAccounts.map((acc) => acc.account_number));
    const accountsWithKnownType = new Set(allAccounts.filter((acc) => acc.account_type).map((acc) => acc.account_number));
    const invalidTransactions = [];
    const unknownAccountNumbers = new Set();

    const validTransactions = transactions.filter((tx) => {
      if (!tx.transaction_date) return false;
      const txDateStr = String(tx.transaction_date).split('T')[0];
      if (txDateStr > asOfDate) return false;

      if (!knownAccountNumbers.has(tx.account_number)) {
        invalidTransactions.push(tx);
        return false;
      }
      if (!accountsWithKnownType.has(tx.account_number)) {
        unknownAccountNumbers.add(tx.account_number);
        return false;
      }
      return true;
    });

    let unclassifiedBalance = 0;
    transactions.forEach((tx) => {
      if (!tx.transaction_date) return;
      const txDateStr = String(tx.transaction_date).split('T')[0];
      if (txDateStr > asOfDate) return;

      if (unknownAccountNumbers.has(tx.account_number)) {
        unclassifiedBalance += (Number(tx.credit_amount) || 0) - (Number(tx.debit_amount) || 0);
      }
    });

    let unclassifiedWarning = null;
    if (invalidTransactions.length > 0) {
      unclassifiedWarning = `Found ${invalidTransactions.length} transactions referencing non-existent GL accounts.`;
    }
    if (unknownAccountNumbers.size > 0) {
      if (unclassifiedWarning) {
        unclassifiedWarning += ' Additionally, ';
      } else {
        unclassifiedWarning = '';
      }
      unclassifiedWarning += `Found ${unknownAccountNumbers.size} GL accounts with missing or unknown 'account_type'. Total unclassified balance: $${unclassifiedBalance.toFixed(2)}.`;
    }

    console.log('Found', validTransactions.length, 'valid transactions up to', asOfDate);

    const calculateAccountBalance = (accountNumber, items) => {
      const accountTransactions = items.filter((tx) => tx.account_number === accountNumber);

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
        own_balance: 0,
        total_balance: 0,
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

      if (accNode.account_type === 'Asset' || accNode.account_type === 'Expense') {
        accNode.own_balance = debits - credits;
      } else {
        accNode.own_balance = credits - debits;
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
      node.total_balance = node.own_balance + childTotal;
      node.balance = node.total_balance;
      return node.total_balance;
    };

    roots.forEach((root) => calculateTotals(root));

    const transformNode = (node) => {
      node.children.sort((a, b) => a.account_number.localeCompare(b.account_number));
      node.children.forEach(transformNode);

      if (node.children.length > 0 && Math.abs(node.own_balance) > 0.001) {
        const syntheticChild = {
          ...node,
          account_name: `${node.account_name} (Direct)`,
          balance: node.own_balance,
          children: [],
          is_synthetic: true,
          parent_account: node.account_number
        };
        node.children.unshift(syntheticChild);
      }
    };

    roots.forEach(transformNode);

    const filterHierarchy = (nodes) => {
      return nodes.reduce((acc, node) => {
        if (node.children && node.children.length > 0) {
          node.children = filterHierarchy(node.children);
        }

        const hasBalance = Math.abs(node.balance) > 0.001;
        const hasActivity = node.transactionCount > 0;
        const hasChildren = node.children && node.children.length > 0;

        if (hasBalance || hasActivity || hasChildren) {
          acc.push(node);
        }
        return acc;
      }, []);
    };

    const assetData = filterHierarchy(roots.filter((r) => r.account_type === 'Asset'));
    const liabilityData = filterHierarchy(roots.filter((r) => r.account_type === 'Liability'));
    const equityData = filterHierarchy(roots.filter((r) => r.account_type === 'Equity'));

    assetData.sort((a, b) => a.account_number.localeCompare(b.account_number));
    liabilityData.sort((a, b) => a.account_number.localeCompare(b.account_number));
    equityData.sort((a, b) => a.account_number.localeCompare(b.account_number));

    if (Math.abs(unclassifiedBalance) > 0.001) {
      equityData.push({
        account_number: '',
        account_name: 'Unclassified Accounts Balance (System Adjustment)',
        balance: unclassifiedBalance,
        children: [],
        is_synthetic: true,
        transactionCount: 0,
        account_type: 'Equity'
      });
    }

    const currentYear = new Date(asOfDate).getUTCFullYear();
    const startOfYearStr = `${currentYear}-01-01`;

    const revenueAccountNums = new Set(allAccounts.filter((acc) => acc.account_type === 'Revenue').map((a) => a.account_number));
    const expenseAccountNums = new Set(allAccounts.filter((acc) => acc.account_type === 'Expense').map((a) => a.account_number));

    let yearToDateRevenue = 0;
    let yearToDateExpenses = 0;
    validTransactions.forEach((tx) => {
      if (!tx.transaction_date) return;
      const txDateStr = String(tx.transaction_date).split('T')[0];
      if (txDateStr >= startOfYearStr) {
        if (revenueAccountNums.has(tx.account_number)) {
          yearToDateRevenue += (Number(tx.credit_amount) || 0) - (Number(tx.debit_amount) || 0);
        } else if (expenseAccountNums.has(tx.account_number)) {
          yearToDateExpenses += (Number(tx.debit_amount) || 0) - (Number(tx.credit_amount) || 0);
        }
      }
    });

    const netIncome = yearToDateRevenue - yearToDateExpenses;

    let retainedEarningsRevenue = 0;
    let retainedEarningsExpenses = 0;
    validTransactions.forEach((tx) => {
      if (!tx.transaction_date) return;
      const txDateStr = String(tx.transaction_date).split('T')[0];
      if (txDateStr < startOfYearStr) {
        if (revenueAccountNums.has(tx.account_number)) {
          retainedEarningsRevenue += (Number(tx.credit_amount) || 0) - (Number(tx.debit_amount) || 0);
        } else if (expenseAccountNums.has(tx.account_number)) {
          retainedEarningsExpenses += (Number(tx.debit_amount) || 0) - (Number(tx.credit_amount) || 0);
        }
      }
    });

    const retainedEarnings = retainedEarningsRevenue - retainedEarningsExpenses;

    if (Math.abs(netIncome) > 0.001) {
      equityData.push({
        account_number: '',
        account_name: 'Net Income',
        balance: netIncome,
        children: [],
        is_synthetic: true,
        transactionCount: 0,
        account_type: 'Equity'
      });
    }

    const hasExistingRetainedEarningsGLAccount = allAccounts.some(
      (acc) => acc.account_type === 'Equity' && acc.account_name.toLowerCase().includes('retained earnings') && acc.transactionCount > 0
    );

    if (!hasExistingRetainedEarningsGLAccount && Math.abs(retainedEarnings) > 0.001) {
      equityData.push({
        account_number: '',
        account_name: "Retained Earnings (Prior Years' P&L)",
        balance: retainedEarnings,
        children: [],
        is_synthetic: true,
        transactionCount: 0,
        account_type: 'Equity'
      });
    }

    const totalAssets = assetData.reduce((sum, acc) => sum + acc.balance, 0);
    const totalLiabilities = liabilityData.reduce((sum, acc) => sum + acc.balance, 0);
    const totalEquity = equityData.reduce((sum, acc) => sum + acc.balance, 0);
    const totalLiabilitiesAndEquity = totalLiabilities + totalEquity;
    const isBalanced = Math.abs(totalAssets - totalLiabilitiesAndEquity) < 0.01;

    console.log('Balance Sheet Summary - Assets:', totalAssets, 'Liabilities:', totalLiabilities, 'Equity:', totalEquity, 'Net Income:', netIncome, 'Balanced:', isBalanced);

    return Response.json({
      success: true,
      warnings: unclassifiedWarning,
      invalidTransactions,
      data: {
        assets: assetData,
        liabilities: liabilityData,
        equity: equityData,
        summary: {
          totalAssets,
          totalLiabilities,
          totalEquity,
          totalLiabilitiesAndEquity,
          isBalanced
        },
        asOfDate
      }
    });
  } catch (error) {
    console.error('Error generating Balance Sheet:', error);
    return Response.json({
      error: error.message || 'Failed to generate Balance Sheet',
      details: error.stack
    }, { status: 500 });
  }
});