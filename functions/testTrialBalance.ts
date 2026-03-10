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
    
    // Group by Date + Reference to find the exact unbalanced entry
    const groupedTxs = {};
    
    allTransactions.forEach(tx => {
      const debit = parseFloat(tx.debit_amount) || 0;
      const credit = parseFloat(tx.credit_amount) || 0;
      
      // Group strictly by Date and Reference (or description if no reference)
      const key = `${tx.transaction_date}_${tx.reference || tx.description}`;
      
      if (!groupedTxs[key]) {
        groupedTxs[key] = { debits: 0, credits: 0, txs: [], date: tx.transaction_date, ref: tx.reference || tx.description };
      }
      groupedTxs[key].debits += debit;
      groupedTxs[key].credits += credit;
      groupedTxs[key].txs.push(tx);
    });
    
    let unbalancedGroups = [];
    
    for (const [key, group] of Object.entries(groupedTxs)) {
      const diff = Math.abs(group.debits - group.credits);
      if (diff > 0.01) {
        unbalancedGroups.push({
          key,
          date: group.date,
          ref: group.ref,
          debits: group.debits,
          credits: group.credits,
          diff: diff,
          txs: group.txs.map(t => ({ id: t.id, acc: t.account_number, dr: t.debit_amount, cr: t.credit_amount }))
        });
      }
    }
    
    // Sort by difference
    unbalancedGroups.sort((a, b) => b.diff - a.diff);
    
    // Find exact match for 115.51
    const exactMatch = unbalancedGroups.find(g => Math.abs(g.diff - 115.51) < 0.01);
    
    return Response.json({
      exactMatch: exactMatch || null,
      unbalancedGroupsCount: unbalancedGroups.length,
      topUnbalancedGroups: unbalancedGroups.slice(0, 10)
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});