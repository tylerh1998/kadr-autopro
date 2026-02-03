import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        
        // Verify authentication
        const user = await base44.auth.me();
        if (!user) {
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { transactionIds, reconciliationId } = await req.json();

        if (!transactionIds || !Array.isArray(transactionIds) || transactionIds.length === 0) {
             return Response.json({ error: 'No transaction IDs provided' }, { status: 400 });
        }
        
        if (!reconciliationId) {
             return Response.json({ error: 'Reconciliation ID is required' }, { status: 400 });
        }

        console.log(`Processing batch reconciliation for ${transactionIds.length} transactions. ID: ${reconciliationId}`);

        // Use bulkUpdate to update multiple records in a single request per batch.
        // This avoids N requests and rate limits.
        const batchSize = 100;
        let processedCount = 0;
        const errors = [];

        for (let i = 0; i < transactionIds.length; i += batchSize) {
            const batchIds = transactionIds.slice(i, i + batchSize);
            
            // Prepare objects for bulkUpdate (id + fields to update)
            const batchData = batchIds.map(id => ({
                id: id,
                reconciled: true,
                reconciliation_id: reconciliationId,
                cleared: true
            }));
            
            try {
                // bulkUpdate sends a single request for the whole batch
                await base44.asServiceRole.entities.BankTransaction.bulkUpdate(batchData);
                processedCount += batchIds.length;
                console.log(`Batch ${i / batchSize + 1} processed: ${batchIds.length} records`);
            } catch (error) {
                console.error(`Failed to update batch starting at ${i}:`, error);
                // If the bulk update fails, we add all IDs in this batch to errors
                batchIds.forEach(id => errors.push({ id, error: error.message }));
            }
        }

        if (errors.length > 0) {
            return Response.json({ 
                success: false, 
                message: `Completed with ${errors.length} errors`,
                errors: errors,
                processed: processedCount
            }, { status: 207 });
        }

        return Response.json({ 
            success: true, 
            message: `Successfully reconciled ${transactionIds.length} transactions`,
            count: transactionIds.length 
        });

    } catch (error) {
        console.error('Error in batchReconcileTransactions:', error);
        return Response.json({ error: error.message }, { status: 500 });
    }
});