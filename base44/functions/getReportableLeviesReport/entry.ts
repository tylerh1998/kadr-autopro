import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';
import { createClient } from 'npm:@supabase/supabase-js@2.39.3';

const WORK_ORDER_LOOKUP_SELECT = 'id, ro_number, wo_number, est_number, inv_number, crinv_number';

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

const resolveWorkOrdersMap = async (supabase, workOrderIds) => {
  const ids = [...new Set(workOrderIds.filter(Boolean))];
  const workOrdersMap = {};

  if (ids.length === 0) {
    return workOrdersMap;
  }

  const { data: directMatches, error: directError } = await supabase
    .from('WorkOrder')
    .select(WORK_ORDER_LOOKUP_SELECT)
    .in('id', ids);

  if (directError) throw directError;

  (directMatches || []).forEach((wo) => {
    workOrdersMap[wo.id] = wo;
  });

  const unresolvedIds = ids.filter((id) => !workOrdersMap[id]);

  for (const unresolvedId of unresolvedIds) {
    const fields = ['ro_number', 'wo_number', 'est_number', 'inv_number', 'crinv_number'];

    for (const field of fields) {
      const { data, error } = await supabase
        .from('WorkOrder')
        .select(WORK_ORDER_LOOKUP_SELECT)
        .eq(field, unresolvedId)
        .limit(1);

      if (error) throw error;

      if (data && data.length > 0) {
        workOrdersMap[unresolvedId] = data[0];
        break;
      }
    }
  }

  return workOrdersMap;
};

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const payload = await req.json();
    const { startDate, endDate } = payload;

    if (!startDate || !endDate) {
      return Response.json({ success: false, error: 'Start date and end date are required' }, { status: 400 });
    }

    // 1. Fetch Levies within date range
    // Note: Levies.date_applied is datetime string. 
    // We'll filter client side or fetch slightly more and filter? 
    // Or we can try to filter by range if the SDK supports it for string dates. 
    // Usually simple string comparison works for ISO dates.
    
    // We'll fetch all levies and filter in memory if the dataset isn't huge, 
    // or use query if possible. Let's try simple string comparison query first if supported, 
    // or just fetch all if we assume volume is manageable for now.
    // However, for a report, it's better to be efficient.
    
    // Let's assume we can fetch all for now or filter by date string.
    // Since base44 filter usually does exact match, we might need to fetch all and filter JS side 
    // OR use advanced filtering if available (e.g. $gte).
    // The prompt says "Use query filter to get specific entities... e.g. {"age": {"$gte": 18}}".
    // So we can use $gte and $lte.
    
    const levies = await base44.asServiceRole.entities.Levies.filter({
      date_applied: {
        "$gte": new Date(startDate).toISOString(),
        "$lte": new Date(endDate + 'T23:59:59.999Z').toISOString() // Ensure end of day
      }
    });

    // 2. Fetch related data
    const workOrderIds = [...new Set(levies.map(l => l.work_order_id).filter(Boolean))];
    const supabase = createSupabaseClient();

    const workOrdersMap = await resolveWorkOrdersMap(supabase, workOrderIds);

    // Fetch OtherChargeList (usually small list, can fetch all)
    const otherCharges = await base44.asServiceRole.entities.OtherChargeList.list();
    const otherChargesMap = {};
    otherCharges.forEach(oc => {
      otherChargesMap[oc.id] = oc;
    });

    // 3. Assemble data
    const reportData = levies.map(levy => {
      const wo = workOrdersMap[levy.work_order_id];
      const oc = otherChargesMap[levy.other_charge_id];

      return {
        id: levy.id,
        date_applied: levy.date_applied,
        ro_number: wo ? (wo.ro_number || wo.wo_number || wo.est_number) : 'Unknown',
        description: oc ? oc.description : 'Unknown Levy',
        qty: levy.qty,
        base_amount: levy.base_amount,
        total_amount: levy.total_amount,
        supplier_invoice_line_id: levy.supplier_invoice_line_id
      };
    });

    // Sort by date desc
    reportData.sort((a, b) => new Date(b.date_applied) - new Date(a.date_applied));

    return Response.json({ success: true, data: reportData });

  } catch (error) {
    console.error('Error generating reportable levies report:', error);
    return Response.json({ success: false, error: error.message }, { status: 500 });
  }
});