import { createClientFromRequest } from 'npm:@base44/sdk@0.8.24';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const { startDate, endDate } = await req.json();

    const accounts = await base44.asServiceRole.entities.ChartOfAccount.filter({ account_number: "2051" }, undefined, 5000);
    
    // Fetch all GL transactions up to endDate with pagination
    const allTransactions = [];
    let skip = 0;
    while(true) {
      const batch = await base44.asServiceRole.entities.GLTransaction.filter({account_number: "2051"}, undefined, 5000, skip);
      if (batch.length === 0) break;
      allTransactions.push(...batch);
      if (batch.length < 5000) break;
      skip += 5000;
    }

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
      acc2051: Object.values(accountMap)[0]
    });

  } catch (error) {
    return Response.json({ success: false, error: error.message }, { status: 500 });
  }
});