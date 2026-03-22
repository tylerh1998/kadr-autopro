import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();

        if (!user) {
            return Response.json({ success: false, error: 'Unauthorized' }, { status: 401 });
        }

        const rawBody = await req.text();
        const payload = rawBody ? JSON.parse(rawBody) : {};
        const {
            asOfDate = null,
            startDate = '1900-01-01',
            endDate = asOfDate,
            supplierIdFilter = null,
        } = payload;

        const supabaseUrl = Deno.env.get('Supabase_project_url');
        const supabaseSecret = Deno.env.get('Supabase_Secret_Key');

        if (!supabaseUrl || !supabaseSecret) {
            return Response.json({ success: false, error: 'Supabase credentials not configured' }, { status: 500 });
        }

        const { createClient } = await import('npm:@supabase/supabase-js@2.39.3');
        const supabase = createClient(supabaseUrl, supabaseSecret, {
            auth: { persistSession: false }
        });

        const { data, error } = await supabase.rpc('get_ap_summary_data', {
            _as_of_date: asOfDate,
            _start_date: startDate,
            _end_date: endDate,
            _supplier_id_filter: supplierIdFilter,
        });

        if (error) {
            throw new Error(`Failed to fetch AP summary: ${error.message}`);
        }

        const filteredData = (data || []).filter((row) => Math.abs(Number(row.current_balance || 0)) > 0.01);

        return Response.json({
            success: true,
            data: filteredData,
        });
    } catch (error) {
        console.error('Error in getAPSummary:', error);
        return Response.json({
            success: false,
            error: error.message || 'Internal server error'
        }, { status: 500 });
    }
});