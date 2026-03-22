import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
    const base44 = createClientFromRequest(req);
    
    try {
        const user = await base44.auth.me();
        if (user?.role !== 'admin') {
            return Response.json({ error: 'Unauthorized: Admin access required' }, { status: 403 });
        }

        console.log("Starting emergency reset...");

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

        const toReset = allTxs.filter(tx => tx.reconciled === true || tx.cleared === true || tx.reconciliation_id);
        
        if (toReset.length === 0) {
            return Response.json({ success: true, message: 'No transactions found to reset.' });
        }

        console.log(`Found ${toReset.length} transactions to reset.`);

        // Robust sequential processing with limited concurrency
        const concurrency = 5;
        let processed = 0;
        const errors = [];
        
        const idsToReset = toReset.map(tx => tx.id);

        const processItem = async (id) => {
            try {
                await base44.asServiceRole.entities.BankTransaction.update(id, {
                    reconciled: false,
                    cleared: false,
                    reconciliation_id: null
                });
                return { success: true };
            } catch (error) {
                console.error(`Failed to reset tx ${id}:`, error);
                return { success: false, error: error.message };
            }
        };

        for (let i = 0; i < idsToReset.length; i += concurrency) {
            const batchIds = idsToReset.slice(i, i + concurrency);
            
            const results = await Promise.all(batchIds.map(id => processItem(id)));
            
            const successCount = results.filter(r => r.success).length;
            processed += successCount;
            
            if (i + concurrency < idsToReset.length) {
                await new Promise(resolve => setTimeout(resolve, 200));
            }
            
            console.log(`Reset batch ${Math.floor(i / concurrency) + 1} processed.`);
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