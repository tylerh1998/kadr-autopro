import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';
import { createClient } from 'npm:@supabase/supabase-js@2.39.3';

const getCustomerName = (customer) => {
  if (!customer) return 'No customer linked';
  return customer.org_name?.trim() || `${customer.first_name || ''} ${customer.last_name || ''}`.trim() || 'No customer linked';
};

const getVehicleName = (vehicle) => {
  if (!vehicle) return 'No vehicle linked';
  return [vehicle.year, vehicle.make, vehicle.model].filter(Boolean).join(' ') || vehicle.vin || 'Vehicle linked';
};

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const supabaseUrl = Deno.env.get('Supabase_project_url');
    const supabaseSecret = Deno.env.get('Supabase_Secret_Key');
    if (!supabaseUrl || !supabaseSecret) {
      return Response.json({ error: 'Supabase credentials not configured' }, { status: 500 });
    }

    const supabase = createClient(supabaseUrl, supabaseSecret, {
      auth: { persistSession: false }
    });

    const body = await req.json().catch(() => ({}));
    const searchTerm = (body.searchTerm || '').trim().toLowerCase();

    const { data: notes, error: notesError } = await supabase
      .from('Note')
      .select('id, title, comment, customer_id, vehicle_id, work_order_id, updated_at, created_at')
      .order('updated_at', { ascending: false, nullsFirst: false })
      .order('created_at', { ascending: false, nullsFirst: false });

    if (notesError) {
      return Response.json({ error: notesError.message }, { status: 500 });
    }

    const workOrderIds = [...new Set((notes || []).map((note) => note.work_order_id).filter(Boolean))];

    let workOrders = [];
    if (workOrderIds.length > 0) {
      const { data, error } = await supabase
        .from('WorkOrder')
        .select('id, ro_number, wo_number, customer_id, vehicle_id, description')
        .in('id', workOrderIds);

      if (error) {
        return Response.json({ error: error.message }, { status: 500 });
      }

      workOrders = data || [];
    }

    const workOrderMap = new Map(workOrders.map((workOrder) => [workOrder.id, workOrder]));

    const customerIds = [...new Set([
      ...(notes || []).map((note) => note.customer_id),
      ...workOrders.map((workOrder) => workOrder.customer_id)
    ].filter(Boolean))];

    const vehicleIds = [...new Set([
      ...(notes || []).map((note) => note.vehicle_id),
      ...workOrders.map((workOrder) => workOrder.vehicle_id)
    ].filter(Boolean))];

    let customers = [];
    if (customerIds.length > 0) {
      const { data, error } = await supabase
        .from('Customer')
        .select('id, first_name, last_name, org_name')
        .in('id', customerIds);

      if (error) {
        return Response.json({ error: error.message }, { status: 500 });
      }

      customers = data || [];
    }

    let vehicles = [];
    if (vehicleIds.length > 0) {
      const { data, error } = await supabase
        .from('Vehicle')
        .select('id, year, make, model, vin')
        .in('id', vehicleIds);

      if (error) {
        return Response.json({ error: error.message }, { status: 500 });
      }

      vehicles = data || [];
    }

    const customerMap = new Map(customers.map((customer) => [customer.id, customer]));
    const vehicleMap = new Map(vehicles.map((vehicle) => [vehicle.id, vehicle]));

    const cards = (notes || []).map((note, index) => {
      const workOrder = note.work_order_id ? workOrderMap.get(note.work_order_id) || null : null;
      const customer = customerMap.get(note.customer_id || workOrder?.customer_id) || null;
      const vehicle = vehicleMap.get(note.vehicle_id || workOrder?.vehicle_id) || null;
      const woNumber = workOrder?.wo_number || workOrder?.ro_number || 'Unassigned';

      return {
        id: note.id,
        noteId: note.id,
        workOrder,
        title: note.title?.trim() || workOrder?.description || `Untitled Note ${index + 1}`,
        comment: note.comment?.trim() || 'No comment added yet.',
        customer: getCustomerName(customer),
        vehicle: getVehicleName(vehicle),
        woNumber
      };
    }).filter((card) => {
      if (!searchTerm) return true;
      const haystack = [card.title, card.comment, card.customer, card.vehicle, card.woNumber]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return haystack.includes(searchTerm);
    });

    return Response.json({ data: cards });
  } catch (error) {
    console.error('getNotesBoardData error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});