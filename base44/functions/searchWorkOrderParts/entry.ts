import { createClientFromRequest } from 'npm:@base44/sdk@0.8.4';

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

        // Fetch recent work orders. 
        // We limit to 2000 to prevent timeout/memory issues, but sort by newest first.
        const workOrdersList = await base44.asServiceRole.entities.WorkOrder.list('-created_date', 2000);

        const results = [];

        for (const wo of workOrdersList) {
            if (!wo.line_items) continue;
            
            let lineItems = [];
            try {
                lineItems = JSON.parse(wo.line_items);
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
                        wo_date: wo.wo_date || wo.created_date,
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

        // Fetch customers for the results to display names
        if (results.length > 0) {
            const customerIds = [...new Set(results.map(r => r.customer_id).filter(Boolean))];
            // Fetch customers in chunks if too many, but for now assuming < 100 unique customers in results
            if (customerIds.length > 0) {
                 // The SDK might not support $in with huge arrays, but 100 is usually fine.
                 // We'll try to fetch all needed customers.
                 // If there are many, we might skip or do multiple queries. 
                 // For now, let's assume filtering 2000 WOs won't yield too many unique customers to break the query.
                 const customers = await base44.asServiceRole.entities.Customer.filter({ id: { $in: customerIds } });
                 const customerMap = {};
                 customers.forEach(c => {
                     const name = c.org_name ? c.org_name : `${c.first_name || ''} ${c.last_name || ''}`.trim();
                     customerMap[c.id] = name;
                 });
                 results.forEach(r => {
                     r.customer_name = customerMap[r.customer_id] || 'Unknown';
                 });
            }
        }

        return Response.json({ records: results });
    } catch (error) {
        console.error('Search error:', error);
        return Response.json({ error: error.message }, { status: 500 });
    }
});