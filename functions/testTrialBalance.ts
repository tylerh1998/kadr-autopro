import { createClientFromRequest } from 'npm:@base44/sdk@0.8.3';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    
    const txs = await base44.entities.GLTransaction.filter({
      source_id: "695c2a9ac74b535d3c22e3df"
    });
    
    let debits = 0;
    let credits = 0;
    
    const formattedTxs = txs.map(tx => {
      debits += parseFloat(tx.debit_amount) || 0;
      credits += parseFloat(tx.credit_amount) || 0;
      return {
        id: tx.id,
        account: tx.account_number,
        description: tx.description,
        debit: tx.debit_amount,
        credit: tx.credit_amount
      };
    });
    
    return Response.json({
      invoice: "INV40121",
      total_debits: debits,
      total_credits: credits,
      difference: Math.abs(debits - credits),
      transactions: formattedTxs
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});