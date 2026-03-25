import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';
import { createClient } from 'npm:@supabase/supabase-js@2.39.3';

const WORK_ORDER_HISTORY_SELECT = 'id, vehicle_id, stage, status, description, ro_number, wo_number, est_number, inv_number, crinv_number, scheduled_date, created_date, total_amount, odometer';

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

    return Response.json({
      success: true,
      workOrders: data || []
    });
  } catch (error) {
    console.error('Error in getVehicleWorkOrderHistory:', error);
    return Response.json({
      success: false,
      error: error.message
    }, { status: 500 });
  }
});