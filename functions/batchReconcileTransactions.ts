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

        // Use update with a filter to update multiple records in a single request.
        // This is much more efficient than looping or even bulkUpdate if bulkUpdate isn't supported.
        const batchSize = 100;
        let processedCount = 0;
        const errors = [];

        for (let i = 0; i < transactionIds.length; i += batchSize) {
            const batchIds = transactionIds.slice(i, i + batchSize);
            
            try {
                // Update all transactions in this batch with a single query
                // We use the $in operator to match all IDs in the batch
                await base44.asServiceRole.entities.BankTransaction.update(
                    { id: { $in: batchIds } },
                    {
                        reconciled: true,
                        reconciliation_id: reconciliationId,
                        cleared: true
                    }
                );
                
                processedCount += batchIds.length;
                console.log(`Batch ${Math.floor(i / batchSize) + 1} processed: ${batchIds.length} records`);
            } catch (error) {
                console.error(`Failed to update batch starting at ${i}:`, error);
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