import { createClientFromRequest } from 'npm:@base44/sdk@0.8.3';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    
    let allTransactions = [];
    let skip = 0;
    const limit = 5000;
    let hasMore = true;
    
    while (hasMore) {
        const batch = await base44.entities.GLTransaction.list(null, limit, skip);
        allTransactions = allTransactions.concat(batch);
        if (batch.length < limit) {
            hasMore = false;
        } else {
            skip += limit;
        }
    }
    
    let totalDebits = 0;
    let totalCredits = 0;
    
    // Group by source_id to find unbalanced entries
    const groupedTxs = {};
    
    allTransactions.forEach(tx => {
      const debit = parseFloat(tx.debit_amount) || 0;
      const credit = parseFloat(tx.credit_amount) || 0;
      
      totalDebits += debit;
      totalCredits += credit;
      
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
    
    return Response.json({
      total_transactions: allTransactions.length,
      total_debits: totalDebits,
      total_credits: totalCredits,
      database_difference: Math.abs(totalDebits - totalCredits),
      unbalancedGroupsCount: unbalancedGroups.length,
      topUnbalancedGroups: unbalancedGroups.slice(0, 5).map(g => ({
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