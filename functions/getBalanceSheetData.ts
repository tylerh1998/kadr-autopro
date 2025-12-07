import { createClientFromRequest } from 'npm:@base44/sdk@0.7.1';

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

    // Fetch all Asset, Liability, and Equity accounts
    const allAccounts = await base44.entities.ChartOfAccount.list();
    const assetAccounts = allAccounts.filter(acc => acc.account_type === 'Asset' && acc.is_active);
    const liabilityAccounts = allAccounts.filter(acc => acc.account_type === 'Liability' && acc.is_active);
    const equityAccounts = allAccounts.filter(acc => acc.account_type === 'Equity' && acc.is_active);

    console.log('Found accounts - Assets:', assetAccounts.length, 'Liabilities:', liabilityAccounts.length, 'Equity:', equityAccounts.length);

    // Fetch all GL transactions up to the as-of date
    const allTransactions = await base44.entities.GLTransaction.list();
    const filteredTransactions = allTransactions.filter(tx => {
      const txDate = new Date(tx.transaction_date);
      const asOf = new Date(asOfDate);
      return txDate <= asOf;
    });

    console.log('Found', filteredTransactions.length, 'transactions up to', asOfDate);

    // Helper function to calculate account balance
    const calculateAccountBalance = (accountNumber, transactions, accountType) => {
      const accountTransactions = transactions.filter(tx => tx.account_number === accountNumber);
      
      let totalCredits = 0;
      let totalDebits = 0;
      
      accountTransactions.forEach(tx => {
        totalCredits += parseFloat(tx.credit_amount) || 0;
        totalDebits += parseFloat(tx.debit_amount) || 0;
      });
      
      let balance = 0;
      
      // Assets: Debit increases, Credit decreases (normal debit balance)
      if (accountType === 'Asset') {
        balance = totalDebits - totalCredits;
      }
      // Liabilities and Equity: Credit increases, Debit decreases (normal credit balance)
      else if (accountType === 'Liability' || accountType === 'Equity') {
        balance = totalCredits - totalDebits;
      }
      
      return {
        credits: totalCredits,
        debits: totalDebits,
        balance: balance,
        transactionCount: accountTransactions.length
      };
    };

    // Process Asset accounts
    const assetData = assetAccounts.map(account => {
      const { credits, debits, balance, transactionCount } = calculateAccountBalance(
        account.account_number, 
        filteredTransactions,
        'Asset'
      );
      
      return {
        account_number: account.account_number,
        account_name: account.account_name,
        credits: credits,
        debits: debits,
        balance: balance,
        transactionCount: transactionCount
      };
    }).filter(acc => acc.balance !== 0 || acc.transactionCount > 0); // Only include accounts with activity

    // Process Liability accounts
    const liabilityData = liabilityAccounts.map(account => {
      const { credits, debits, balance, transactionCount } = calculateAccountBalance(
        account.account_number, 
        filteredTransactions,
        'Liability'
      );
      
      return {
        account_number: account.account_number,
        account_name: account.account_name,
        credits: credits,
        debits: debits,
        balance: balance,
        transactionCount: transactionCount
      };
    }).filter(acc => acc.balance !== 0 || acc.transactionCount > 0);

    // Process Equity accounts
    const equityData = equityAccounts.map(account => {
      const { credits, debits, balance, transactionCount } = calculateAccountBalance(
        account.account_number, 
        filteredTransactions,
        'Equity'
      );
      
      return {
        account_number: account.account_number,
        account_name: account.account_name,
        credits: credits,
        debits: debits,
        balance: balance,
        transactionCount: transactionCount
      };
    }).filter(acc => acc.balance !== 0 || acc.transactionCount > 0);

    // Sort by account number
    assetData.sort((a, b) => a.account_number.localeCompare(b.account_number));
    liabilityData.sort((a, b) => a.account_number.localeCompare(b.account_number));
    equityData.sort((a, b) => a.account_number.localeCompare(b.account_number));

    // Calculate totals
    const totalAssets = assetData.reduce((sum, acc) => sum + acc.balance, 0);
    const totalLiabilities = liabilityData.reduce((sum, acc) => sum + acc.balance, 0);
    const totalEquity = equityData.reduce((sum, acc) => sum + acc.balance, 0);
    const totalLiabilitiesAndEquity = totalLiabilities + totalEquity;
    
    // Check if balanced (Assets = Liabilities + Equity)
    const isBalanced = Math.abs(totalAssets - totalLiabilitiesAndEquity) < 0.01; // Allow for small rounding differences

    console.log('Balance Sheet Summary - Assets:', totalAssets, 'Liabilities:', totalLiabilities, 'Equity:', totalEquity, 'Balanced:', isBalanced);

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