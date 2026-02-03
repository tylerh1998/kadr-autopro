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

        // Process in batches to respect backend rate limits
        // Reduced batch size to 5 to avoid 429s even with service role
        const batchSize = 5; 
        let processedCount = 0;
        const errors = [];

        // We use service role to ensure we have permission and throughput, 
        // but we already verified the user is authenticated above.
        
        for (let i = 0; i < transactionIds.length; i += batchSize) {
            const batch = transactionIds.slice(i, i + batchSize);
            
            // Use service role for updates to bypass user rate limits
            const results = await Promise.allSettled(batch.map(txId => 
                base44.asServiceRole.entities.BankTransaction.update(txId, {
                    reconciled: true,
                    reconciliation_id: reconciliationId,
                    cleared: true
                })
            ));
            
            // Check for failures
            results.forEach((result, index) => {
                if (result.status === 'rejected') {
                    console.error(`Failed to update tx ${batch[index]}:`, result.reason);
                    errors.push({ id: batch[index], error: result.reason.message });
                }
            });

            processedCount += batch.length;
            
            // Small delay between batches to be nice to the rate limiter
            if (i + batchSize < transactionIds.length) {
                await new Promise(resolve => setTimeout(resolve, 200));
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