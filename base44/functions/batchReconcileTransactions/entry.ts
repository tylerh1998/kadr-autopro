import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';
import moment from 'npm:moment-timezone@0.5.48';
import { createClient } from 'npm:@supabase/supabase-js@2.39.3';

const getCurrentMountainTimestamp = () => moment.tz('America/Edmonton').format();

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

        const supabaseUrl = Deno.env.get('Supabase_project_url');
        const supabaseSecret = Deno.env.get('Supabase_Secret_Key');

        if (!supabaseUrl || !supabaseSecret) {
            return Response.json({ error: 'Supabase credentials not configured' }, { status: 500 });
        }

        const supabase = createClient(supabaseUrl, supabaseSecret, {
            auth: { persistSession: false }
        });

        console.log(`Processing batch reconciliation for ${transactionIds.length} transactions. ID: ${reconciliationId}`);

        const updatedTimestamp = getCurrentMountainTimestamp();
        const { data, error } = await supabase
            .from('BankTransaction')
            .update({
                reconciled: true,
                reconciliation_id: reconciliationId,
                cleared: true,
                updated_date: updatedTimestamp
            })
            .in('id', transactionIds)
            .select('id');

        if (error) {
            console.error('Failed to update reconciled transactions:', error);
            return Response.json({ error: error.message }, { status: 500 });
        }

        const processedCount = Array.isArray(data) ? data.length : 0;

        if (processedCount !== transactionIds.length) {
            return Response.json({
                success: false,
                message: `Only reconciled ${processedCount} of ${transactionIds.length} transactions`,
                count: processedCount
            }, { status: 207 });
        }

        return Response.json({
            success: true,
            message: `Successfully reconciled ${processedCount} transactions`,
            count: processedCount
        });

    } catch (error) {
        console.error('Error in batchReconcileTransactions:', error);
        return Response.json({ error: error.message }, { status: 500 });
    }
});