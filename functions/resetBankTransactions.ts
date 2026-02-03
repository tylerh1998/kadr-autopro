import { createClientFromRequest } from 'npm:@base44/sdk@0.8.11';

Deno.serve(async (req) => {
    const base44 = createClientFromRequest(req);
    
    try {
        // Authenticate (admin only for safety)
        const user = await base44.auth.me();
        if (user?.role !== 'admin') {
            return Response.json({ error: 'Unauthorized: Admin access required' }, { status: 403 });
        }

        // Fetch all transactions
        // Note: In a production app with millions of rows, we'd want to paginate or filter.
        // Assuming manageable size here or filtering for those that need reset.
        const allTxs = await base44.asServiceRole.entities.BankTransaction.list();
        
        // Filter for transactions that are currently marked as cleared or reconciled
        const toReset = allTxs.filter(tx => tx.reconciled === true || tx.cleared === true || tx.reconciliation_id);
        
        if (toReset.length === 0) {
            return Response.json({ success: true, message: 'No transactions found to reset.' });
        }

        console.log(`Resetting ${toReset.length} transactions...`);

        // Prepare updates
        const updates = toReset.map(tx => ({
            id: tx.id,
            data: {
                reconciled: false,
                cleared: false,
                reconciliation_id: null
            }
        }));

        // Perform bulk update in batches to avoid payload size issues
        const batchSize = 100;
        let processed = 0;

        for (let i = 0; i < updates.length; i += batchSize) {
            const batch = updates.slice(i, i + batchSize);
            await base44.asServiceRole.entities.BankTransaction.bulkUpdate(batch);
            processed += batch.length;
            console.log(`Processed ${processed}/${updates.length}`);
        }

        return Response.json({ 
            success: true, 
            message: `Successfully reset ${processed} transactions.` 
        });

    } catch (error) {
        console.error('Error resetting transactions:', error);
        return Response.json({ error: error.message }, { status: 500 });
    }
});