import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';
import { createClient } from 'npm:@supabase/supabase-js@2.39.3';

const PAGE_SIZE = 1000;
const CUSTOMER_REPORT_SELECT = 'customer_id, total_amount, invoice_date';

const createSupabaseClient = () => {
    const supabaseUrl = Deno.env.get('Supabase_project_url');
    const supabaseSecret = Deno.env.get('Supabase_Secret_Key');

    if (!supabaseUrl || !supabaseSecret) {
        throw new Error('Supabase credentials not configured');
    }

    return createClient(supabaseUrl, supabaseSecret, {
        auth: { persistSession: false }
    });
};

const fetchAllRows = async (queryFactory) => {
    const rows = [];
    let from = 0;

    while (true) {
        const { data, error } = await queryFactory(from, from + PAGE_SIZE - 1);
        if (error) throw error;

        const batch = data || [];
        rows.push(...batch);

        if (batch.length < PAGE_SIZE) {
            break;
        }

        from += PAGE_SIZE;
    }

    return rows;
};

export const getCustomerReportData = async (req) => {
    const base44 = createClientFromRequest(req);
    
    try {
        const user = await base44.auth.me();
        if (!user) {
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { dateFrom, dateTo } = await req.json();

        const supabase = createSupabaseClient();

        const workOrders = await fetchAllRows((from, to) => {
            let query = supabase
                .from('WorkOrder')
                .select(CUSTOMER_REPORT_SELECT)
                .in('stage', ['invoice', 'credit_invoice']);

            if (dateFrom && dateTo) {
                query = query.gte('invoice_date', dateFrom).lte('invoice_date', dateTo);
            }

            return query
                .order('invoice_date', { ascending: false, nullsFirst: false })
                .range(from, to);
        });

        // Aggregate Data
        const customerStats = {};
        const customerIds = new Set();

        workOrders.forEach(wo => {
            if (!wo.customer_id) return;

            if (!customerStats[wo.customer_id]) {
                customerStats[wo.customer_id] = {
                    count: 0,
                    totalSales: 0
                };
                customerIds.add(wo.customer_id);
            }

            const stats = customerStats[wo.customer_id];
            stats.count += 1;
            
            // Calculate total sales
            // Handle number or string format
            let amount = 0;
            if (typeof wo.total_amount === 'number') {
                amount = wo.total_amount;
            } else if (typeof wo.total_amount === 'string') {
                amount = parseFloat(wo.total_amount.replace(/[$,]/g, '')) || 0;
            }
            stats.totalSales += amount;
        });

        // Fetch Customers
        // If we have many customers, we might need to batch or fetch all
        // For now, let's try fetching all active customers or just the ones we need
        // Fetching all is usually safer if we can't do complex $in queries with many IDs
        const customers = await base44.entities.Customer.list();
        const customerMap = {};
        customers.forEach(c => {
            customerMap[c.id] = c;
        });

        // Build Final Report List
        const report = [];

        Object.keys(customerStats).forEach(customerId => {
            const stats = customerStats[customerId];
            const customer = customerMap[customerId];

            // Filter out 0 total sales as requested
            if (Math.abs(stats.totalSales) < 0.01) return;

            const name = customer 
                ? (customer.org_name || `${customer.first_name || ''} ${customer.last_name || ''}`.trim())
                : 'Unknown Customer';

            report.push({
                customerId,
                name,
                workOrderCount: stats.count,
                totalSales: stats.totalSales,
                averageTotal: stats.count > 0 ? stats.totalSales / stats.count : 0
            });
        });

        // Sort by Total Sales DESC
        report.sort((a, b) => b.totalSales - a.totalSales);

        return Response.json({
            data: report,
            count: report.length
        });

    } catch (error) {
        console.error("Error generating customer report:", error);
        return Response.json({ error: error.message }, { status: 500 });
    }
};

Deno.serve(getCustomerReportData);