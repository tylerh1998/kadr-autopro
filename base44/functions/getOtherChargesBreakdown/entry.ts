import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';
import { createClient } from 'npm:@supabase/supabase-js@2.39.3';

const PAGE_SIZE = 1000;
const OTHER_CHARGES_SELECT = 'id, customer_id, customer_snapshot, line_items, ro_number, invoice_date, wo_date, stage';

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

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { startDate, endDate } = await req.json();

    if (!startDate || !endDate) {
      return Response.json({ error: 'startDate and endDate are required' }, { status: 400 });
    }

    const supabase = createSupabaseClient();

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

    // Fetch customers for the work orders
    const customerIds = [...new Set(workOrders.map(wo => wo.customer_id).filter(Boolean))];
    let customerMap = {};
    
    if (customerIds.length > 0) {
      // Fetch customers with a high limit to avoid missing names
      // If there are more than 1000 customers, we might need batching, but 1000 is a safe upper bound for a report period usually
      const customers = await base44.entities.Customer.filter({ id: { $in: customerIds } }, undefined, 1000);
      customerMap = customers.reduce((acc, c) => {
        acc[c.id] = c;
        return acc;
      }, {});
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

      // Determine customer name
      let customerName = 'Unknown';
      const customer = customerMap[wo.customer_id];
      if (customer) {
        customerName = customer.org_name || `${customer.first_name || ''} ${customer.last_name || ''}`.trim();
      } else if (wo.customer_snapshot) {
        // Fallback to snapshot if customer not found in map (e.g. deleted or limit reached)
        try {
          const snapshot = JSON.parse(wo.customer_snapshot);
          // Snapshot structure might vary, try to find best name
          if (snapshot.name) {
             customerName = snapshot.name;
          } else if (snapshot.org_name) {
             customerName = snapshot.org_name;
          } else if (snapshot.first_name || snapshot.last_name) {
             customerName = `${snapshot.first_name || ''} ${snapshot.last_name || ''}`.trim();
          }
        } catch (e) {
          // ignore parse error
        }
      }

      for (const line of lineItems) {
        const ocTotal = parseFloat(line.oc_total) || 0;
        if (ocTotal === 0) continue;

        const description = line.description || 'Unknown Charge';
        const glAccount = line.gl_account || '';
        const otherChargeId = line.other_charge_id;

        // Group by other_charge_id if available, otherwise by description+gl
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
        
        // Add detail record
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

    // Convert map to array and sort by total amount descending
    const charges = Object.values(chargesMap).sort((a, b) => b.total_amount - a.total_amount);

    // Calculate grand total
    const grandTotal = charges.reduce((sum, c) => sum + c.total_amount, 0);

    return Response.json({
      success: true,
      charges,
      grandTotal,
      invoiceCount: workOrders.length,
      startDate,
      endDate
    });

  } catch (error) {
    console.error('Error generating other charges breakdown:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});