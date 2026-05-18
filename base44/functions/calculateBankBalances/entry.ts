import { createClientFromRequest } from 'npm:@base44/sdk@0.7.1';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    
    // Verify authentication
    const user = await base44.auth.me();
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { bankAccountId } = await req.json();

    if (!bankAccountId) {
      return Response.json({ 
        success: false, 
        error: 'bankAccountId is required' 
      }, { status: 400 });
    }

    // Fetch all transactions for this bank account, sorted by date
    const transactions = await base44.asServiceRole.entities.BankTransaction.filter(
      { bank_account_id: bankAccountId },
      'transaction_date'
    );

    const balanceTransactions = transactions.filter((transaction) => transaction.is_reversed !== true);

    // Calculate the final running balance (sum of all credits minus debits)
    let runningBalance = 0;
    for (const transaction of balanceTransactions) {
      const credit = transaction.credit_amount || 0;
      const debit = transaction.debit_amount || 0;
      runningBalance += credit - debit;
    }

    // Update ONLY the BankAccount's current_balance and last_recalculated_date
    const now = new Date().toISOString();
    await base44.asServiceRole.entities.BankAccount.update(bankAccountId, {
      current_balance: runningBalance,
      last_recalculated_date: now
    });

    console.log(`Balance recalculated for bank account ${bankAccountId}: ${runningBalance}`);

    return Response.json({
      success: true,
      bankAccountId: bankAccountId,
      finalBalance: runningBalance,
      last_recalculated_date: now,
      transactionCount: balanceTransactions.length
    });

  } catch (error) {
    console.error('Error in calculateBankBalances:', error);
    return Response.json({ 
      success: false, 
      error: error.message 
    }, { status: 500 });
  }
});