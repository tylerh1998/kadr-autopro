import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';
import { createClient } from 'npm:@supabase/supabase-js@2.39.3';

const WORK_ORDER_HISTORY_SELECT = 'id, vehicle_id, stage, status, description, ro_number, wo_number, est_number, inv_number, crinv_number, created_date, total_amount, odometer';

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

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { vehicleId } = await req.json();

    if (!vehicleId) {
      return Response.json({ error: 'Vehicle ID is required' }, { status: 400 });
    }

    const supabase = createSupabaseClient();

    const { data, error } = await supabase
      .from('WorkOrder')
      .select(WORK_ORDER_HISTORY_SELECT)
      .eq('vehicle_id', vehicleId)
      .order('created_date', { ascending: false });

    if (error) {
      throw error;
    }

    const { data: lankarData, error: lankarError } = await supabase
      .from('LankarWOInfo')
      .select('woid, wodate, invoicedate, txtOdometer, Summary, totalinvoiceamt, invoiceid, WOorPWOorEorINVorCRED, WOdeleted')
      .eq('vehid', vehicleId);

    if (lankarError) {
      throw lankarError;
    }

    const mappedLankar = (lankarData || []).map((lwo) => {
      let stage = 'work_order';
      let status = 'Completed';
      
      const normalizedStage = String(lwo.WOorPWOorEorINVorCRED || '').toUpperCase();
      if (normalizedStage === 'UINVOICE' || normalizedStage === 'UPINVOICE') {
        stage = 'invoice';
      }
      
      // If WOdeleted is truthy and not '0' or 'false', it's void
      if (lwo.WOdeleted && String(lwo.WOdeleted) !== '0' && String(lwo.WOdeleted) !== 'false') {
        status = 'Void';
      }

      return {
        id: `lankar-${lwo.woid}`,
        vehicle_id: vehicleId,
        stage,
        status,
        description: lwo.Summary,
        ro_number: lwo.woid,
        wo_number: lwo.woid,
        est_number: null,
        inv_number: lwo.invoiceid,
        crinv_number: null,
        created_date: lwo.invoicedate || lwo.wodate,
        total_amount: lwo.totalinvoiceamt ? parseFloat(lwo.totalinvoiceamt) : 0,
        odometer: lwo.txtOdometer ? parseInt(lwo.txtOdometer, 10) : null,
        isLankar: true,
        originalWoid: lwo.woid,
        scheduled_date: null
      };
    });

    const nativeMapped = (data || []).map((workOrder) => ({
      ...workOrder,
      scheduled_date: null
    }));

    const combined = [...nativeMapped, ...mappedLankar].sort((a, b) => {
      const dateA = a.created_date ? new Date(a.created_date).getTime() : 0;
      const dateB = b.created_date ? new Date(b.created_date).getTime() : 0;
      return dateB - dateA;
    });

    return Response.json({
      success: true,
      workOrders: combined
    });
  } catch (error) {
    console.error('Error in getVehicleWorkOrderHistory:', error);
    return Response.json({
      success: false,
      error: error.message
    }, { status: 500 });
  }
});