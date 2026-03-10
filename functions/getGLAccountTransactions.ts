import { createClientFromRequest } from 'npm:@base44/sdk@0.7.1';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    
    // Authenticate user
    const user = await base44.auth.me();
    if (!user) {
      return Response.json({ 
        success: false, 
        error: 'Unauthorized' 
      }, { status: 401 });
    }

    // Get parameters from request
    const { accountNumber, appliedStartDate, appliedEndDate } = await req.json();

    // Validate required parameters
    if (!accountNumber || !appliedStartDate || !appliedEndDate) {
      return Response.json({
        success: false,
        error: 'Missing required parameters: accountNumber, appliedStartDate, appliedEndDate'
      }, { status: 400 });
    }

    console.log(`Fetching transactions for account ${accountNumber}, range: ${appliedStartDate} to ${appliedEndDate}`);

    // Fetch ALL transactions for this account
    const allTransactions = await base44.asServiceRole.entities.GLTransaction.filter(
      { account_number: accountNumber },
      'transaction_date', // Primary sort by date
      10000
    );

    // Secondary sort by created_date for same-date transactions
    allTransactions.sort((a, b) => {
      const dateCompare = (a.transaction_date || '').localeCompare(b.transaction_date || '');
      if (dateCompare !== 0) return dateCompare;
      return (a.created_date || '').localeCompare(b.created_date || '');
    });

    console.log(`Total transactions fetched: ${allTransactions.length}`);

    // Calculate opening balance and collect transactions in range
    let openingBalance = 0;
    const transactionsInRange = [];

    for (const tx of allTransactions) {
      if (!tx.transaction_date) continue; // Skip transactions without dates

      const txDateStr = tx.transaction_date.split('T')[0];

      if (txDateStr < appliedStartDate) {
        // Transaction is before our filter range - add to opening balance
        openingBalance += (tx.debit_amount || 0) - (tx.credit_amount || 0);
      } else if (txDateStr >= appliedStartDate && txDateStr <= appliedEndDate) {
        // Transaction is in our filter range - collect for processing
        transactionsInRange.push(tx);
      }
      // Transactions after appliedEndDate are ignored
    }

    console.log(`Opening balance: ${openingBalance}`);
    console.log(`Transactions in range: ${transactionsInRange.length}`);

    // Calculate running balance for transactions in range, starting from opening balance
    let runningBalance = openingBalance;
    const processedTransactions = transactionsInRange.map(tx => {
      runningBalance += (tx.debit_amount || 0) - (tx.credit_amount || 0);
      return {
        ...tx,
        balance: runningBalance
      };
    });

    // Reverse to display newest first (frontend expects this order)
    processedTransactions.reverse();

    console.log(`Processed ${processedTransactions.length} transactions`);

    return Response.json({
      success: true,
      transactions: processedTransactions,
      openingBalance: openingBalance,
      totalCount: processedTransactions.length
    });

  } catch (error) {
    console.error('Error in getGLAccountTransactions:', error);
    return Response.json({
      success: false,
      error: error.message || 'Internal server error'
    }, { status: 500 });
  }
});