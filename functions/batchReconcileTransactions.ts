import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        
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

        // Robust sequential processing with limited concurrency
        // This ensures reliability over speed, as requested by the user.
        // 1 concurrent request at a time (strictly sequential), with a longer delay.
        const concurrency = 1;
        let processedCount = 0;
        const errors = [];
        
        // Helper to process a single item
        const processItem = async (id) => {
            try {
                await base44.asServiceRole.entities.BankTransaction.update(id, {
                    reconciled: true,
                    reconciliation_id: reconciliationId,
                    cleared: true
                });
                return { success: true, id };
            } catch (error) {
                console.error(`Failed to update tx ${id}:`, error);
                return { success: false, id, error: error.message };
            }
        };

        // Process in chunks of 'concurrency' size
        for (let i = 0; i < transactionIds.length; i += concurrency) {
            const batch = transactionIds.slice(i, i + concurrency);
            
            // Execute batch in parallel
            const results = await Promise.all(batch.map(id => processItem(id)));
            
            // Collect results
            results.forEach(res => {
                if (res.success) {
                    processedCount++;
                } else {
                    errors.push({ id: res.id, error: res.error });
                }
            });

            // Delay to respect rate limits (500ms)
            if (i + concurrency < transactionIds.length) {
                await new Promise(resolve => setTimeout(resolve, 500));
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