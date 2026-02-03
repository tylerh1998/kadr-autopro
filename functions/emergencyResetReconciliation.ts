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

        const updates = toReset.map(tx => ({
            id: tx.id,
            data: {
                reconciled: false,
                cleared: false,
                reconciliation_id: null
            }
        }));

        const batchSize = 100;
        let processed = 0;

        for (let i = 0; i < updates.length; i += batchSize) {
            const batch = updates.slice(i, i + batchSize);
            await base44.asServiceRole.entities.BankTransaction.bulkUpdate(batch);
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