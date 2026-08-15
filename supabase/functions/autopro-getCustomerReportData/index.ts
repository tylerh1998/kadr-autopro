import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.6";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
const jsonHeaders = { ...corsHeaders, 'Content-Type': 'application/json' };

const PAGE_SIZE = 1000;
const CUSTOMER_REPORT_SELECT = 'customer_id, total_amount, invoice_date';

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

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const supabase = createClient(supabaseUrl, supabaseKey);

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Missing Authorization header' }), { status: 200, headers: jsonHeaders });
    }
    const { data: { user }, error: authError } = await supabase.auth.getUser(authHeader.replace('Bearer ', ''));
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 200, headers: jsonHeaders });
    }

    const { dateFrom, dateTo } = await req.json().catch(() => ({}));

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

      let amount = 0;
      if (typeof wo.total_amount === 'number') {
        amount = wo.total_amount;
      } else if (typeof wo.total_amount === 'string') {
        amount = parseFloat(wo.total_amount.replace(/[$,]/g, '')) || 0;
      }
      stats.totalSales += amount;
    });

    // Fetch Customers
    const customerIdsArray = Array.from(customerIds);
    const customers = [];
    const chunkSize = 200;

    for (let i = 0; i < customerIdsArray.length; i += chunkSize) {
      const chunk = customerIdsArray.slice(i, i + chunkSize);
      const { data, error } = await supabase
        .from('Customer')
        .select('id, org_name, first_name, last_name')
        .in('id', chunk);

      if (error) {
        console.error("Error fetching customers chunk:", error);
      } else if (data) {
        customers.push(...data);
      }
    }

    const customerMap = {};
    customers.forEach(c => {
      customerMap[c.id] = c;
    });

    // Build Final Report List
    const report = [];

    Object.keys(customerStats).forEach(customerId => {
      const stats = customerStats[customerId];
      const customer = customerMap[customerId];

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

    report.sort((a, b) => b.totalSales - a.totalSales);

    const top50 = report.slice(0, 50);

    return new Response(JSON.stringify({
      data: top50,
      count: top50.length
    }), { status: 200, headers: jsonHeaders });

  } catch (error) {
    console.error("Error generating customer report:", error);
    return new Response(JSON.stringify({ error: error.message }), { status: 200, headers: jsonHeaders });
  }
});
