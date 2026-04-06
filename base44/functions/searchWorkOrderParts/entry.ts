import { createClientFromRequest } from 'npm:@base44/sdk@0.8.24';
import { createClient } from 'npm:@supabase/supabase-js@2.39.3';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();

        if (!user) {
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { searchTerm, searchType, filterType } = await req.json();

        if (!searchTerm) {
            return Response.json({ records: [] });
        }

        const term = searchTerm.toLowerCase();

        const supabaseUrl = Deno.env.get('Supabase_project_url');
        const supabaseSecret = Deno.env.get('Supabase_Secret_Key');
        if (!supabaseUrl || !supabaseSecret) {
            return Response.json({ error: 'Supabase credentials missing' }, { status: 500 });
        }

        const supabase = createClient(supabaseUrl, supabaseSecret, { auth: { persistSession: false } });

        // Fetch recent work orders from Supabase
        const { data: workOrdersList, error: woError } = await supabase
            .from('WorkOrder')
            .select('id, ro_number, wo_date, created_at, customer_id, vehicle_id, line_items')
            .order('created_at', { ascending: false })
            .limit(2000);

        if (woError) {
            console.error('Error fetching work orders from Supabase:', woError);
            return Response.json({ error: 'Failed to fetch work orders' }, { status: 500 });
        }

        const results = [];

        for (const wo of workOrdersList || []) {
            if (!wo.line_items) continue;
            
            let lineItems = [];
            try {
                // Supabase might return JSONB as an object/array already, but if it's string, we parse it
                lineItems = typeof wo.line_items === 'string' ? JSON.parse(wo.line_items) : wo.line_items;
            } catch (e) {
                continue;
            }

            if (!Array.isArray(lineItems)) continue;

            for (const item of lineItems) {
                let match = false;
                let valueToCheck = '';

                if (searchType === 'part_number') {
                    valueToCheck = (item.part_number || '').toLowerCase();
                } else if (searchType === 'serial_number') {
                    valueToCheck = (item.serial_num || '').toLowerCase();
                }

                if (!valueToCheck) continue;

                if (filterType === 'contains') {
                    match = valueToCheck.includes(term);
                } else if (filterType === 'startsWith') {
                    match = valueToCheck.startsWith(term);
                } else if (filterType === 'endsWith') {
                    match = valueToCheck.endsWith(term);
                } else if (filterType === 'exact') {
                     match = valueToCheck === term;
                }

                if (match) {
                    results.push({
                        work_order_id: wo.id,
                        ro_number: wo.ro_number,
                        wo_date: wo.wo_date || wo.created_at,
                        customer_id: wo.customer_id,
                        vehicle_id: wo.vehicle_id,
                        description: item.description,
                        part_number: item.part_number,
                        serial_num: item.serial_num,
                        line_item_id: item.id
                    });
                }
            }
        }

        // Fetch customers from Supabase for the results to display names
        if (results.length > 0) {
            const customerIds = [...new Set(results.map(r => r.customer_id).filter(Boolean))];
            
            if (customerIds.length > 0) {
                 const { data: customers, error: custError } = await supabase
                    .from('Customers')
                    .select('id, first_name, last_name, org_name')
                    .in('id', customerIds);

                 if (!custError && customers) {
                     const customerMap = {};
                     customers.forEach(c => {
                         const name = c.org_name ? c.org_name : `${c.first_name || ''} ${c.last_name || ''}`.trim();
                         customerMap[c.id] = name;
                     });
                     results.forEach(r => {
                         r.customer_name = customerMap[r.customer_id] || 'Unknown';
                     });
                 } else {
                     results.forEach(r => {
                         r.customer_name = 'Unknown';
                     });
                 }
            }
        }

        return Response.json({ records: results });
    } catch (error) {
        console.error('Search error:', error);
        return Response.json({ error: error.message }, { status: 500 });
    }
});