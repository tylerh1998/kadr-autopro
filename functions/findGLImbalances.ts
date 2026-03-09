import { createClientFromRequest } from 'npm:@base44/sdk@0.8.3';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    // Optional: pass year and month (1-12) to filter, or leave blank for all time
    const { year, month } = body; 

    const allTransactions = await base44.entities.GLTransaction.list();
    
    // 1. Filter transactions
    const filteredTransactions = allTransactions.filter(tx => {
      if (!year || !month) return true; 
      const date = new Date(tx.transaction_date);
      // JS getUTCMonth is 0-indexed (0 = Jan, 1 = Feb)
      return date.getUTCMonth() === (month - 1) && date.getUTCFullYear() === year;
    });

    // 2. Group them by source_id, reference, or description
    const transactionBlocks = {};
    filteredTransactions.forEach(tx => {
      const key = tx.source_id || tx.reference || tx.description || 'Unknown'; 
      
      if (!transactionBlocks[key]) {
        transactionBlocks[key] = { debits: 0, credits: 0, count: 0, transactions: [] };
      }
      
      transactionBlocks[key].debits += parseFloat(tx.debit_amount) || 0;
      transactionBlocks[key].credits += parseFloat(tx.credit_amount) || 0;
      transactionBlocks[key].count += 1;
      
      // Keep track of the actual rows so we can see what caused the imbalance
      transactionBlocks[key].transactions.push({
        id: tx.id,
        date: tx.transaction_date,
        account: tx.account_number,
        debit: parseFloat(tx.debit_amount) || 0,
        credit: parseFloat(tx.credit_amount) || 0,
        desc: tx.description
      });
    });

    // 3. Find any block where Debits minus Credits is not 0
    const imbalances = [];
    let totalImbalance = 0;

    for (const [key, data] of Object.entries(transactionBlocks)) {
      const diff = data.debits - data.credits;
      
      // Use 0.001 to avoid Javascript floating point math errors
      if (Math.abs(diff) > 0.001) { 
        imbalances.push({
          key,
          debits: data.debits,
          credits: data.credits,
          difference: diff,
          count: data.count,
          transactions: data.transactions
        });
        totalImbalance += diff;
      }
    }

    return Response.json({
      success: true,
      data: {
        scannedCount: filteredTransactions.length,
        imbalancesFound: imbalances.length,
        totalImbalance,
        imbalances
      }
    });

  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});