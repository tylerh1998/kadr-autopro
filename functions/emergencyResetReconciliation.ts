import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
    const base44 = createClientFromRequest(req);
    
    try {
        const user = await base44.auth.me();
        if (user?.role !== 'admin') {
            return Response.json({ error: 'Unauthorized: Admin access required' }, { status: 403 });
        }

        const allTxs = await base44.asServiceRole.entities.BankTransaction.list();
        
        const toReset = allTxs.filter(tx => tx.reconciled === true || tx.cleared === true || tx.reconciliation_id);
        
        if (toReset.length === 0) {
            return Response.json({ success: true, message: 'No transactions found to reset.' });
        }

        // Force redeploy - Process updates in smaller batches using individual update calls
        // since bulkUpdate might not be available in this SDK version
        const batchSize = 10; 
        let processed = 0;

        for (let i = 0; i < toReset.length; i += batchSize) {
            const batch = toReset.slice(i, i + batchSize);
            
            await Promise.all(batch.map(tx => 
                base44.asServiceRole.entities.BankTransaction.update(tx.id, {
                    reconciled: false,
                    cleared: false,
                    reconciliation_id: null
                })
            ));
            
            processed += batch.length;
        }

        return Response.json({ 
            success: true, 
            message: `Successfully reset ${processed} transactions.` 
        });

    } catch (error) {
        return Response.json({ error: error.message }, { status: 500 });
    }
});