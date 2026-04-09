import { createClientFromRequest } from 'npm:@base44/sdk@0.8.24';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    
    const allTransactions = await base44.asServiceRole.entities.GLTransaction.filter({ account_number: "2051" }, undefined, 100000);
    
    let bal = 0;
    allTransactions.forEach(tx => {
      const isDebitNormal = false;
      const dr = tx.debit_amount || 0;
      const cr = tx.credit_amount || 0;
      bal += isDebitNormal ? (dr - cr) : (cr - dr);
    });

    return Response.json({
      success: true,
      count: allTransactions.length,
      bal,
      transactions: allTransactions.map(tx => ({ date: tx.transaction_date, desc: tx.description, dr: tx.debit_amount, cr: tx.credit_amount }))
    });

  } catch (error) {
    return Response.json({ success: false, error: error.message }, { status: 500 });
  }
});