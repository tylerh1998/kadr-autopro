import { createClientFromRequest } from 'npm:@base44/sdk@0.8.24';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const allTransactions = [];
    let skip = 0;
    while(true) {
      const batch = await base44.asServiceRole.entities.GLTransaction.filter({ }, undefined, 5000, skip);
      if (batch.length === 0) break;
      allTransactions.push(...batch);
      if (batch.length < 5000) break;
      skip += 5000;
    }
    
    let bal2052 = 0;
    let bal2053 = 0;
    let bal2054 = 0;
    
    allTransactions.forEach(tx => {
      const cr = tx.credit_amount || 0;
      const dr = tx.debit_amount || 0;
      const amount = cr - dr; // liability normal balance
      
      if (tx.account_number === "2052") bal2052 += amount;
      if (tx.account_number === "2053") bal2053 += amount;
      if (tx.account_number === "2054") bal2054 += amount;
    });

    return Response.json({
      success: true,
      bal2052,
      bal2053,
      bal2054,
      totalChildren: bal2052 + bal2053 + bal2054
    });

  } catch (error) {
    return Response.json({ success: false, error: error.message }, { status: 500 });
  }
});