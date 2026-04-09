import { createClientFromRequest } from 'npm:@base44/sdk@0.8.24';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ success: false, error: 'Unauthorized' }, { status: 401 });

    const { startDate, endDate } = await req.json();

    const accounts = await base44.asServiceRole.entities.ChartOfAccount.filter({ is_active: true }, undefined, 5000);
    
    // Fetch all GL transactions up to endDate
    const allTransactions = await base44.asServiceRole.entities.GLTransaction.filter({}, undefined, 100000);

    const accountMap = {};
    accounts.forEach(account => {
      accountMap[account.account_number] = {
        ...account,
        own_balance: 0,
        transactionCount: 0
      };
    });

    allTransactions.forEach(tx => {
      if (!tx.account_number || !accountMap[tx.account_number]) return;
      if (!tx.transaction_date) return;
      
      const txDate = tx.transaction_date.split('T')[0];
      const acc = accountMap[tx.account_number];
      const isDebitNormal = ['Asset', 'Expense'].includes(acc.account_type);
      
      if (txDate <= endDate) {
        const dr = tx.debit_amount || 0;
        const cr = tx.credit_amount || 0;
        
        acc.own_balance += isDebitNormal ? (dr - cr) : (cr - dr);
        
        if (txDate >= startDate) {
          acc.transactionCount++;
        }
      }
    });

    return Response.json({
      success: true,
      accounts: Object.values(accountMap)
    });

  } catch (error) {
    return Response.json({ success: false, error: error.message }, { status: 500 });
  }
});