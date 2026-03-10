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
    const { asOfDate } = body;

    if (!asOfDate) {
      return Response.json({ 
        error: 'As-of date is required' 
      }, { status: 400 });
    }

    console.log('Fetching Balance Sheet data as of:', asOfDate);

    // Fetch all accounts
    const allAccounts = await base44.entities.ChartOfAccount.list(null, 10000);
    const activeAccounts = allAccounts.filter(acc => acc.is_active);

    console.log('Found accounts:', activeAccounts.length);

    // Fetch all GL transactions up to the as-of date
    const allTransactions = await base44.entities.GLTransaction.list(null, 10000);
    const filteredTransactions = allTransactions.filter(tx => {
      if (!tx.transaction_date) return false;
      const txDateStr = tx.transaction_date.split('T')[0];
      return txDateStr <= asOfDate;
    });

    console.log('Found', filteredTransactions.length, 'transactions up to', asOfDate);

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

    // --- Build Hierarchy Logic ---

    // 1. Initialize map
    const accountMap = {};
    activeAccounts.forEach(account => {
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

    // 2. Calculate own balances
    Object.values(accountMap).forEach(accNode => {
      const { credits, debits, transactionCount } = calculateAccountBalance(
        accNode.account_number, 
        filteredTransactions
      );
      
      accNode.credits = credits;
      accNode.debits = debits;
      accNode.transactionCount = transactionCount;

      // Determine balance based on type
      if (accNode.account_type === 'Asset') {
        accNode.own_balance = debits - credits;
      } else if (['Liability', 'Equity', 'Revenue', 'Expense'].includes(accNode.account_type)) {
        accNode.own_balance = credits - debits;
      } else {
        // Fallback for unknown types (treat as Credit balance for safety in BS, but usually Assets are Debit)
        accNode.own_balance = credits - debits;
      }
    });

    // 3. Build Tree
    const roots = [];
    Object.values(accountMap).forEach(accNode => {
      if (accNode.parent_account && accountMap[accNode.parent_account]) {
        accountMap[accNode.parent_account].children.push(accNode);
      } else {
        roots.push(accNode);
      }
    });

    // 4. Recursive Totals
    const calculateTotals = (node) => {
      let childTotal = 0;
      node.children.forEach(child => {
        childTotal += calculateTotals(child);
      });
      node.total_balance = node.own_balance + childTotal;
      
      // Use 'balance' property for frontend compatibility
      node.balance = node.total_balance; 
      
      return node.total_balance;
    };
    roots.forEach(root => calculateTotals(root));

    // 5. Transform Nodes (Synthetic children, sorting)
    const transformNode = (node) => {
      node.children.sort((a, b) => a.account_number.localeCompare(b.account_number));
      node.children.forEach(transformNode);

      // If parent has own balance AND children, create synthetic child
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

    // 6. Filter Hierarchy (Remove empty trees)
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

    // Separate and Filter
    const assetData = filterHierarchy(roots.filter(r => r.account_type === 'Asset'));
    const liabilityData = filterHierarchy(roots.filter(r => r.account_type === 'Liability'));
    const equityData = filterHierarchy(roots.filter(r => r.account_type === 'Equity'));

    // Sort roots
    assetData.sort((a, b) => a.account_number.localeCompare(b.account_number));
    liabilityData.sort((a, b) => a.account_number.localeCompare(b.account_number));
    equityData.sort((a, b) => a.account_number.localeCompare(b.account_number));

    // --- Calculate Net Income for the Current Year (up to asOfDate) ---
    const asOfDateObj = new Date(asOfDate);
    const currentYear = asOfDateObj.getUTCFullYear();
    const startOfYear = new Date(Date.UTC(currentYear, 0, 1)); // Jan 1st of the as-of year
    
    // Find revenue and expense accounts
    const revenueAccountNums = new Set(activeAccounts.filter(acc => acc.account_type === 'Revenue').map(a => a.account_number));
    const expenseAccountNums = new Set(activeAccounts.filter(acc => acc.account_type === 'Expense').map(a => a.account_number));

    let yearToDateRevenue = 0;
    let yearToDateExpenses = 0;

    // Iterate through filteredTransactions (which are already <= asOfDate)
    // and sum up those that are >= startOfYear and are Rev/Exp.
    const startOfYearStr = `${currentYear}-01-01`;
    filteredTransactions.forEach(tx => {
        if (!tx.transaction_date) return;
        const txDateStr = tx.transaction_date.split('T')[0];
        if (txDateStr >= startOfYearStr) {
            if (revenueAccountNums.has(tx.account_number)) {
                yearToDateRevenue += (parseFloat(tx.credit_amount) || 0) - (parseFloat(tx.debit_amount) || 0);
            } else if (expenseAccountNums.has(tx.account_number)) {
                yearToDateExpenses += (parseFloat(tx.debit_amount) || 0) - (parseFloat(tx.credit_amount) || 0);
            }
        }
    });

    const netIncome = yearToDateRevenue - yearToDateExpenses;
    
    // Add Net Income to Equity section
    if (Math.abs(netIncome) > 0.001) {
        equityData.push({
            account_number: "", // No number
            account_name: "Net Income",
            balance: netIncome,
            children: [],
            is_synthetic: true, // For styling if handled
            transactionCount: 0, // Not really relevant as it's a calculated summary
            account_type: 'Equity'
        });
    }

    // Calculate report totals (sum of roots)
    const totalAssets = assetData.reduce((sum, acc) => sum + acc.balance, 0);
    const totalLiabilities = liabilityData.reduce((sum, acc) => sum + acc.balance, 0);
    // totalEquity now includes the Net Income row we just pushed
    const totalEquity = equityData.reduce((sum, acc) => sum + acc.balance, 0);

    // NEW LOGIC: Calculate the other side by summing EVERYTHING ELSE
    // This ensures that even if a transaction is "split" between a liability 
    // and a revenue account, it is captured in this single total.
    const totalLiabilitiesAndEquity = activeAccounts
      .filter(acc => acc.account_type !== 'Asset')
      .reduce((sum, acc) => {
        const { credits, debits } = calculateAccountBalance(acc.account_number, filteredTransactions);
        // Since these are Credit-normal accounts, we use credits - debits
        return sum + (credits - debits);
      }, 0);
    
    // Check if balanced (Assets = Liabilities + Equity)
    const isBalanced = Math.abs(totalAssets - totalLiabilitiesAndEquity) < 0.01; // Allow for small rounding differences

    console.log('Balance Sheet Summary - Assets:', totalAssets, 'Liabilities:', totalLiabilities, 'Equity:', totalEquity, 'Net Income:', netIncome, 'Balanced:', isBalanced);

    return Response.json({
      success: true,
      data: {
        assets: assetData,
        liabilities: liabilityData,
        equity: equityData,
        summary: {
          totalAssets: totalAssets,
          totalLiabilities: totalLiabilities,
          totalEquity: totalEquity,
          totalLiabilitiesAndEquity: totalLiabilitiesAndEquity,
          isBalanced: isBalanced
        },
        asOfDate: asOfDate
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