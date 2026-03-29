import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';
import { createClient } from 'npm:@supabase/supabase-js@2.39.3';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();

        if (!user) {
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const supabaseUrl = Deno.env.get('Supabase_project_url');
        const supabaseSecret = Deno.env.get('Supabase_Secret_Key');

        if (!supabaseUrl || !supabaseSecret) {
            return Response.json({ error: 'Supabase credentials not configured' }, { status: 500 });
        }

        const supabase = createClient(supabaseUrl, supabaseSecret, {
            auth: { persistSession: false },
        });

        const { data, error } = await supabase.rpc('get_populated_inventory');

        if (error) {
            console.error('Supabase get_populated_inventory rpc error:', error);
            return Response.json({
                error: 'Failed to fetch populated inventory',
                details: error.message
            }, { status: 500 });
        }

        const records = data || [];
        const totalCount = records.length > 0 ? Number(records[0].total_matching_records || 0) : 0;
        
        // Clean up the total_matching_records from the items
        const cleanedRecords = records.map(({ total_matching_records, ...item }) => item);

        return Response.json({
            records: cleanedRecords,
            totalCount,
        });
    } catch (error) {
        console.error('Error in getPopulatedInventory:', error);
        return Response.json({
            error: error.message,
            stack: error.stack,
        }, { status: 500 });
    }
});