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

        // Use filtering to update all transactions in one go, similar to how bulkCreate works in processDataImport.
        // This avoids making N individual requests and hitting rate limits.
        
        // We'll process in chunks of 100 just to be safe with payload sizes, 
        // but using 'update' with a filter means 1 request per chunk instead of 100.
        const batchSize = 100;
        let processedCount = 0;
        const errors = [];

        for (let i = 0; i < transactionIds.length; i += batchSize) {
            const batch = transactionIds.slice(i, i + batchSize);
            
            try {
                // Using the filter syntax to update multiple records at once
                await base44.asServiceRole.entities.BankTransaction.update(
                    { id: { $in: batch } },
                    {
                        reconciled: true,
                        reconciliation_id: reconciliationId,
                        cleared: true
                    }
                );
                processedCount += batch.length;
            } catch (error) {
                console.error(`Failed to update batch ${i}:`, error);
                // If the bulk update fails, we add all IDs in this batch to errors
                batch.forEach(id => errors.push({ id, error: error.message }));
            }
        }

        if (errors.length > 0) {
            return Response.json({ 
                success: false, 
                message: `Completed with ${errors.length} errors`,
                errors: errors,
                processed: processedCount
            }, { status: 207 }); // 207 Multi-Status
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