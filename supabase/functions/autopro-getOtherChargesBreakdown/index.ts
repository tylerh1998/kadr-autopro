import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.6";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
const jsonHeaders = { ...corsHeaders, 'Content-Type': 'application/json' };

const PAGE_SIZE = 1000;
const OTHER_CHARGES_SELECT = 'id, customer_id, line_items, ro_number, invoice_date, wo_date, stage';

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

    const { startDate, endDate } = await req.json().catch(() => ({}));

    if (!startDate || !endDate) {
      return new Response(JSON.stringify({ error: 'startDate and endDate are required' }), { status: 200, headers: jsonHeaders });
    }

    const invoicedDocs = await fetchAllRows((from, to) =>
      supabase
        .from('WorkOrder')
        .select(OTHER_CHARGES_SELECT)
        .in('stage', ['invoice', 'credit_invoice'])
        .gte('invoice_date', startDate)
        .lte('invoice_date', endDate)
        .order('invoice_date', { ascending: false, nullsFirst: false })
        .range(from, to)
    );

    const openWorkOrders = await fetchAllRows((from, to) =>
      supabase
        .from('WorkOrder')
        .select(OTHER_CHARGES_SELECT)
        .eq('stage', 'work_order')
        .gte('wo_date', startDate)
        .lte('wo_date', endDate)
        .order('wo_date', { ascending: false, nullsFirst: false })
        .range(from, to)
    );

    const workOrders = [...invoicedDocs, ...openWorkOrders];

    // Fetch customers for the work orders (chunked, Customer is fully native)
    const customerIds = [...new Set(workOrders.map(wo => wo.customer_id).filter(Boolean))];
    const customerMap = {};
    const chunkSize = 200;
    for (let i = 0; i < customerIds.length; i += chunkSize) {
      const chunk = customerIds.slice(i, i + chunkSize);
      const { data, error } = await supabase.from('Customer').select('id, org_name, first_name, last_name').in('id', chunk);
      if (error) { console.error('Error fetching customers chunk:', error); continue; }
      (data || []).forEach(c => { customerMap[c.id] = c; });
    }

    // Aggregate other charges by description
    const chargesMap = {};

    for (const wo of workOrders) {
      if (!wo.line_items) continue;

      let lineItems = [];
      try {
        lineItems = JSON.parse(wo.line_items);
      } catch (e) {
        console.error(`Failed to parse line_items for WO ${wo.ro_number}:`, e);
        continue;
      }

      let customerName = 'Unknown';
      const customer = customerMap[wo.customer_id];
      if (customer) {
        customerName = customer.org_name || `${customer.first_name || ''} ${customer.last_name || ''}`.trim();
      }

      for (const line of lineItems) {
        const ocTotal = parseFloat(line.oc_total) || 0;
        if (ocTotal === 0) continue;

        const description = line.description || 'Unknown Charge';
        const glAccount = line.gl_account || '';
        const otherChargeId = line.other_charge_id;

        const key = otherChargeId ? `ID::${otherChargeId}` : `${description}|||${glAccount}`;

        if (!chargesMap[key]) {
          chargesMap[key] = {
            description: description,
            gl_account: glAccount,
            other_charge_id: otherChargeId,
            total_amount: 0,
            count: 0,
            details: []
          };
        }

        chargesMap[key].total_amount += ocTotal;
        chargesMap[key].count += 1;

        chargesMap[key].details.push({
          ro_number: wo.ro_number,
          work_order_id: wo.id,
          date: wo.invoice_date || wo.wo_date,
          stage: wo.stage,
          customer_name: customerName,
          amount: ocTotal
        });
      }
    }

    const charges = Object.values(chargesMap).sort((a, b) => b.total_amount - a.total_amount);
    const grandTotal = charges.reduce((sum, c) => sum + c.total_amount, 0);

    return new Response(JSON.stringify({
      success: true,
      charges,
      grandTotal,
      invoiceCount: workOrders.length,
      startDate,
      endDate
    }), { status: 200, headers: jsonHeaders });

  } catch (error) {
    console.error('Error generating other charges breakdown:', error);
    return new Response(JSON.stringify({ error: error.message }), { status: 200, headers: jsonHeaders });
  }
});
