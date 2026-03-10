import { createClientFromRequest } from 'npm:@base44/sdk@0.8.3';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const allTransactions = await base44.entities.GLTransaction.list(null, 10000);
    
    // Group by source_id to find unbalanced entries
    const groupedTxs = {};
    
    allTransactions.forEach(tx => {
      const debit = parseFloat(tx.debit_amount) || 0;
      const credit = parseFloat(tx.credit_amount) || 0;
      
      // Use source_id, or if null, use reference, or if null, use date+description
      const key = tx.source_id || tx.reference || `${tx.transaction_date}-${tx.description}`;
      
      if (!groupedTxs[key]) {
        groupedTxs[key] = { debits: 0, credits: 0, txs: [], source_type: tx.source_type, date: tx.transaction_date };
      }
      groupedTxs[key].debits += debit;
      groupedTxs[key].credits += credit;
      groupedTxs[key].txs.push(tx);
    });
    
    let unbalancedGroups = [];
    
    for (const [key, group] of Object.entries(groupedTxs)) {
      const diff = Math.abs(group.debits - group.credits);
      // Ignore tiny floating point differences
      if (diff > 0.01) {
        unbalancedGroups.push({
          key,
          source_type: group.source_type,
          date: group.date,
          debits: group.debits,
          credits: group.credits,
          diff: diff,
          txs: group.txs
        });
      }
    }
    
    // Sort by difference
    unbalancedGroups.sort((a, b) => b.diff - a.diff);
    
    // Find groups that sum up to exactly 601.69 or are exactly 601.69
    const exactMatch = unbalancedGroups.find(g => Math.abs(g.diff - 601.69) < 0.01);
    
    return Response.json({
      exactMatch: exactMatch || null,
      unbalancedGroupsCount: unbalancedGroups.length,
      topUnbalancedGroups: unbalancedGroups.slice(0, 20).map(g => ({
        key: g.key,
        type: g.source_type,
        date: g.date,
        debits: g.debits,
        credits: g.credits,
        diff: g.diff
      }))
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});