import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';
import { createClient } from 'npm:@supabase/supabase-js@2.39.3';

const getCustomerName = (customer) => {
  if (!customer) return '';
  return customer.org_name?.trim() || `${customer.first_name || ''} ${customer.last_name || ''}`.trim() || '';
};

const getVehicleName = (vehicle) => {
  if (!vehicle) return '';
  return [vehicle.year, vehicle.make, vehicle.model].filter(Boolean).join(' ') || vehicle.vin || '';
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
      .select('id, title, comment, customer_id, vehicle_id, work_order_id, colour, updated_at, created_at')
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

    const cards = (notes || []).map((note) => {
      const workOrder = note.work_order_id ? workOrderMap.get(note.work_order_id) || null : null;
      const customerId = note.customer_id || workOrder?.customer_id || '';
      const vehicleId = note.vehicle_id || workOrder?.vehicle_id || '';
      const customer = customerMap.get(customerId) || null;
      const vehicle = vehicleMap.get(vehicleId) || null;
      const woNumber = workOrder?.wo_number || workOrder?.ro_number || '';

      return {
        id: note.id,
        noteId: note.id,
        workOrder,
        workOrderId: workOrder?.id || '',
        customerId,
        vehicleId,
        hasCustomer: !!customerId,
        hasVehicle: !!vehicleId,
        hasWorkOrder: !!workOrder,
        title: note.title?.trim() || '',
        comment: note.comment?.trim() || 'No comment added yet.',
        customer: getCustomerName(customer),
        vehicle: getVehicleName(vehicle),
        woNumber,
        colour: note.colour || 'white'
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