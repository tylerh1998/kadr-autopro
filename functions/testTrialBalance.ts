import { createClientFromRequest } from 'npm:@base44/sdk@0.8.3';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const allTransactions = await base44.entities.GLTransaction.list(null, 10000);
    
    let totalDebits = 0;
    let totalCredits = 0;
    let unbalancedTransactions = [];
    
    // Group by source_id or reference to find unbalanced entries
    const groupedTxs = {};
    
    allTransactions.forEach(tx => {
      const debit = parseFloat(tx.debit_amount) || 0;
      const credit = parseFloat(tx.credit_amount) || 0;
      
      totalDebits += debit;
      totalCredits += credit;
      
      const key = tx.source_id || tx.reference || tx.transaction_date;
      if (!groupedTxs[key]) {
        groupedTxs[key] = { debits: 0, credits: 0, txs: [] };
      }
      groupedTxs[key].debits += debit;
      groupedTxs[key].credits += credit;
      groupedTxs[key].txs.push(tx);
    });
    
    for (const [key, group] of Object.entries(groupedTxs)) {
      if (Math.abs(group.debits - group.credits) > 0.01) {
        unbalancedTransactions.push({
          key,
          debits: group.debits,
          credits: group.credits,
          diff: Math.abs(group.debits - group.credits),
          txs: group.txs
        });
      }
    }
    
    return Response.json({
      totalDebits,
      totalCredits,
      difference: Math.abs(totalDebits - totalCredits),
      unbalancedGroupsCount: unbalancedTransactions.length,
      unbalancedTransactions: unbalancedTransactions.slice(0, 10) // Show first 10
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});