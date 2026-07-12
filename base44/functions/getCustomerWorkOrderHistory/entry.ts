import { createClientFromRequest } from 'npm:@base44/sdk@0.8.38';
import { createClient } from 'npm:@supabase/supabase-js@2.39.3';

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

    const { customerId, daysBack, fromDate, toDate, searchTerm } = await req.json();

    if (!customerId) {
      return Response.json({ error: 'Customer ID is required' }, { status: 400 });
    }

    const supabase = createSupabaseClient();

    const { data: historyData, error: historyError } = await supabase.rpc('get_customer_work_order_history', {
      p_customer_id: customerId,
      p_days_back: daysBack ?? 365,
      p_from_date: fromDate || null,
      p_to_date: toDate || null,
      p_search_term: searchTerm || null
    });

    if (historyError) {
      throw historyError;
    }

    const { data: vehicleData, error: vehicleError } = await supabase
      .from('Vehicle')
      .select('id, year, make, model')
      .eq('customer_id', customerId);

    if (vehicleError) {
      throw vehicleError;
    }

    const vehicleMap = new Map((vehicleData || []).map((vehicle) => [String(vehicle.id), vehicle]));
    const workOrders = (historyData || []).map((workOrder) => ({
      ...workOrder,
      vehicle: workOrder.vehicle_id ? vehicleMap.get(String(workOrder.vehicle_id)) || null : null
    }));

    return Response.json({
      success: true,
      workOrders
    });
  } catch (error) {
    console.error('Error in getCustomerWorkOrderHistory:', error);
    return Response.json({
      success: false,
      error: error.message
    }, { status: 500 });
  }
});