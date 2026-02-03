import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
    const base44 = createClientFromRequest(req);
    
    try {
        const user = await base44.auth.me();
        if (user?.role !== 'admin') {
            return Response.json({ error: 'Unauthorized: Admin access required' }, { status: 403 });
        }

        console.log("Starting emergency reset...");

        // Fetch all transactions with pagination to ensure we get everything
        let allTxs = [];
        let hasMore = true;
        let skip = 0;
        const fetchLimit = 1000;

        while (hasMore) {
            const txs = await base44.asServiceRole.entities.BankTransaction.list(null, fetchLimit, skip);
            if (txs.length > 0) {
                allTxs = allTxs.concat(txs);
                skip += txs.length;
                if (txs.length < fetchLimit) hasMore = false;
            } else {
                hasMore = false;
            }
        }
        
        console.log(`Fetched ${allTxs.length} transactions total.`);

        // Filter for transactions that need resetting
        const toReset = allTxs.filter(tx => tx.reconciled === true || tx.cleared === true || tx.reconciliation_id);
        
        if (toReset.length === 0) {
            return Response.json({ success: true, message: 'No transactions found to reset.' });
        }

        console.log(`Found ${toReset.length} transactions to reset.`);

        // Use update with filter for efficiency
        const batchSize = 100; 
        let processed = 0;
        const idsToReset = toReset.map(tx => tx.id);

        for (let i = 0; i < idsToReset.length; i += batchSize) {
            const batchIds = idsToReset.slice(i, i + batchSize);
            
            await base44.asServiceRole.entities.BankTransaction.update(
                { id: { $in: batchIds } },
                {
                    reconciled: false,
                    cleared: false,
                    reconciliation_id: null
                }
            );
            
            processed += batchIds.length;
            console.log(`Reset batch ${Math.floor(i / batchSize) + 1}: ${processed} transactions.`);
        }

        return Response.json({ 
            success: true, 
            message: `Successfully reset ${processed} transactions.` 
        });

    } catch (error) {
        console.error("Error in emergencyResetReconciliation:", error);
        return Response.json({ error: error.message }, { status: 500 });
    }
});