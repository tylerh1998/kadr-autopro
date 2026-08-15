import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const WORK_ORDER_LOOKUP_SELECT = 'id, ro_number, wo_number, est_number, inv_number, crinv_number';

async function resolveWorkOrdersMap(supabase: any, workOrderIds: string[]) {
  const ids = [...new Set(workOrderIds.filter(Boolean))];
  const workOrdersMap: Record<string, any> = {};

  if (ids.length === 0) {
    return workOrdersMap;
  }

  const { data: directMatches, error: directError } = await supabase
    .from('WorkOrder')
    .select(WORK_ORDER_LOOKUP_SELECT)
    .in('id', ids);

  if (directError) throw directError;

  (directMatches || []).forEach((wo: any) => {
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
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const res = (data: any) => {
    return new Response(JSON.stringify(data), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  };

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseSecret = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!supabaseUrl || !supabaseSecret) {
      return res({ success: false, error: 'Supabase configuration is missing' });
    }

    const supabase = createClient(supabaseUrl, supabaseSecret, {
      auth: { persistSession: false }
    });

    const payload = await req.json();
    const { startDate, endDate } = payload;

    if (!startDate || !endDate) {
      return res({ success: false, error: 'Start date and end date are required' });
    }

    // 1. Fetch Levies within date range
    const { data: levies, error: leviesError } = await supabase
      .from('Levies')
      .select('*')
      .gte('date_applied', new Date(startDate).toISOString())
      .lte('date_applied', new Date(endDate + 'T23:59:59.999Z').toISOString());

    if (leviesError) throw leviesError;

    // 2. Fetch related data
    const workOrderIds = [...new Set((levies || []).map((l: any) => l.work_order_id).filter(Boolean))];
    const workOrdersMap = await resolveWorkOrdersMap(supabase, workOrderIds as string[]);

    // Fetch OtherChargeList (small list, fetch all)
    const { data: otherCharges, error: otherChargesError } = await supabase
      .from('OtherChargeList')
      .select('*');

    if (otherChargesError) throw otherChargesError;

    const otherChargesMap: Record<string, any> = {};
    (otherCharges || []).forEach((oc: any) => {
      otherChargesMap[oc.id] = oc;
    });

    // 3. Assemble data
    const reportData = (levies || []).map((levy: any) => {
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
    reportData.sort((a: any, b: any) => new Date(b.date_applied).getTime() - new Date(a.date_applied).getTime());

    return res({ success: true, data: reportData });

  } catch (error: any) {
    console.error('Error generating reportable levies report:', error);
    return res({ success: false, error: error.message });
  }
});
