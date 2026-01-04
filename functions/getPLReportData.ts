import { createClientFromRequest } from 'npm:@base44/sdk@0.8.3';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    
    // Authenticate user
    const user = await base44.auth.me();
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get request body
    const body = await req.json();
    const { startDate, endDate } = body;

    if (!startDate || !endDate) {
      return Response.json({ 
        error: 'Start date and end date are required' 
      }, { status: 400 });
    }

    console.log('Fetching P&L data for date range:', startDate, 'to', endDate);

    // Fetch all Revenue and Expense accounts
    const allAccounts = await base44.entities.ChartOfAccount.list();
    const revenueAccounts = allAccounts.filter(acc => acc.account_type === 'Revenue' && acc.is_active);
    const expenseAccounts = allAccounts.filter(acc => acc.account_type === 'Expense' && acc.is_active);

    console.log('Found accounts - Revenue:', revenueAccounts.length, 'Expense:', expenseAccounts.length);

    // Fetch all GL transactions in date range
    const allTransactions = await base44.entities.GLTransaction.list();
    const filteredTransactions = allTransactions.filter(tx => {
      const txDate = new Date(tx.transaction_date);
      const start = new Date(startDate);
      const end = new Date(endDate);
      return txDate >= start && txDate <= end;
    });

    console.log('Found', filteredTransactions.length, 'transactions in date range');

    // Helper function to calculate account balance
    const calculateAccountBalance = (accountNumber, transactions) => {
      const accountTransactions = transactions.filter(tx => tx.account_number === accountNumber);
      
      let totalCredits = 0;
      let totalDebits = 0;
      
      accountTransactions.forEach(tx => {
        totalCredits += parseFloat(tx.credit_amount) || 0;
        totalDebits += parseFloat(tx.debit_amount) || 0;
      });
      
      return {
        credits: totalCredits,
        debits: totalDebits,
        transactionCount: accountTransactions.length
      };
    };

    // Calculate base data for all accounts
    const accountMap = {};
    
    // Initialize map with all accounts
    allAccounts.forEach(account => {
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

    // Calculate own balances for all accounts (regardless of type for now)
    Object.values(accountMap).forEach(accNode => {
      const { credits, debits, transactionCount } = calculateAccountBalance(
        accNode.account_number, 
        filteredTransactions
      );
      
      accNode.credits = credits;
      accNode.debits = debits;
      accNode.transactionCount = transactionCount;

      // Determine net amount based on type
      if (accNode.account_type === 'Revenue') {
        accNode.own_amount = credits - debits;
      } else if (accNode.account_type === 'Expense') {
        accNode.own_amount = debits - credits;
      } else {
        // For other types, standard approach (Asset/Exp=Dr, Liab/Rev/Eq=Cr)
        // This report mainly focuses on Rev/Exp, but if others are included:
        if (['Asset', 'Expense'].includes(accNode.account_type)) {
           accNode.own_amount = debits - credits;
        } else {
           accNode.own_amount = credits - debits;
        }
      }
    });

    // Build Hierarchy
    const roots = [];
    Object.values(accountMap).forEach(accNode => {
      // If parent exists in map, add to children
      if (accNode.parent_account && accountMap[accNode.parent_account]) {
        accountMap[accNode.parent_account].children.push(accNode);
      } else {
        // Otherwise it's a root
        roots.push(accNode);
      }
    });

    // Recursive function to calculate totals
    const calculateTotals = (node) => {
      let childTotal = 0;
      node.children.forEach(child => {
        childTotal += calculateTotals(child);
      });
      node.total_amount = node.own_amount + childTotal;
      return node.total_amount;
    };

    // Calculate totals for all roots
    roots.forEach(root => calculateTotals(root));

    // Transform nodes: Insert synthetic child if parent has own balance, and sort children
    const transformNode = (node) => {
      // Sort children by account number
      node.children.sort((a, b) => a.account_number.localeCompare(b.account_number));
      
      // Recursively transform children
      node.children.forEach(transformNode);

      // "If the parent account has a balance of it's own, have it appear as a child account"
      if (node.children.length > 0 && Math.abs(node.own_amount) > 0.001) {
        const syntheticChild = {
          ...node,
          account_name: `${node.account_name} (Direct)`,
          amount: node.own_amount, // Display amount is own amount
          children: [],
          is_synthetic: true,
          // Unset parent to avoid confusion in recursion if any (though we are done with hierarchy building)
          parent_account: node.account_number 
        };
        // Add to children (at top)
        node.children.unshift(syntheticChild);
      }

      // Set the display amount for this node to its total (rolled up) amount
      node.amount = node.total_amount;
    };

    roots.forEach(transformNode);

    // Recursive filter function to remove nodes with no balance/activity/children
    const filterHierarchy = (nodes) => {
      return nodes.reduce((acc, node) => {
        // Recursive step: filter children first
        if (node.children && node.children.length > 0) {
          node.children = filterHierarchy(node.children);
        }

        // Check if node should be kept
        // It should be kept if it has a non-zero balance (amount), 
        // OR it has transaction count (activity this period),
        // OR it has remaining children.
        const hasBalance = Math.abs(node.amount) > 0.001;
        const hasActivity = node.transactionCount > 0;
        const hasChildren = node.children && node.children.length > 0;

        if (hasBalance || hasActivity || hasChildren) {
          acc.push(node);
        }
        return acc;
      }, []);
    };

    const revenueData = filterHierarchy(roots.filter(r => r.account_type === 'Revenue'));
    const expenseData = filterHierarchy(roots.filter(r => r.account_type === 'Expense'));

    // Sort roots
    revenueData.sort((a, b) => a.account_number.localeCompare(b.account_number));
    expenseData.sort((a, b) => a.account_number.localeCompare(b.account_number));

    // Calculate report totals
    const totalRevenue = revenueData.reduce((sum, acc) => sum + acc.amount, 0);
    const totalExpenses = expenseData.reduce((sum, acc) => sum + acc.amount, 0);
    const netIncome = totalRevenue - totalExpenses;

    console.log('P&L Summary - Revenue:', totalRevenue, 'Expenses:', totalExpenses, 'Net Income:', netIncome);

    return Response.json({
      success: true,
      data: {
        revenue: revenueData,
        expenses: expenseData,
        summary: {
          totalRevenue: totalRevenue,
          totalExpenses: totalExpenses,
          netIncome: netIncome
        },
        dateRange: {
          startDate: startDate,
          endDate: endDate
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