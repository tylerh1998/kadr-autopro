import { createClientFromRequest } from 'npm:@base44/sdk@0.8.24';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    
    const allTransactions = await base44.asServiceRole.entities.GLTransaction.filter({}, undefined, 100000);
    const txs2051 = allTransactions.filter(tx => tx.account_number === "2051");

    return Response.json({
      success: true,
      totalCount: allTransactions.length,
      txs2051Count: txs2051.length,
      txs: txs2051
    });

  } catch (error) {
    return Response.json({ success: false, error: error.message }, { status: 500 });
  }
});