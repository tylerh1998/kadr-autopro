import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "*",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};

const getCustomerName = (customer) => {
  if (!customer) return '';
  return customer.org_name?.trim() || `${customer.first_name || ''} ${customer.last_name || ''}`.trim() || '';
};

const getVehicleName = (vehicle) => {
  if (!vehicle) return '';
  return [vehicle.year, vehicle.make, vehicle.model].filter(Boolean).join(' ') || vehicle.vin || '';
};

const formatPhone = (phone) => {
  if (!phone) return '';
  const digits = String(phone).replace(/\D/g, '').slice(0, 10);
  if (digits.length <= 3) return digits;
  if (digits.length <= 6) return `${digits.slice(0, 3)} ${digits.slice(3)}`;
  return `${digits.slice(0, 3)} ${digits.slice(3, 6)} ${digits.slice(6)}`;
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY");
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);
    const supabaseClient = createClient(supabaseUrl, supabaseAnonKey);

    const authHeader = req.headers.get("Authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Missing or invalid Authorization header" }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const token = authHeader.substring(7);
    const { data: authData, error: authError } = await supabaseClient.auth.getUser(token);
    if (authError || !authData?.user) {
      return new Response(JSON.stringify({ error: "Unauthorized user session" }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const body = await req.json().catch(() => ({}));
    const searchTerm = (body.searchTerm || '').trim().toLowerCase();

    const { data: notes, error: notesError } = await supabaseAdmin
      .from('Note')
      .select('id, title, comment, customer_id, vehicle_id, work_order_id, colour, board_column, board_order, status, is_archived, created_by, updated_at, created_at')
      .order('updated_at', { ascending: false, nullsFirst: false })
      .order('created_at', { ascending: false, nullsFirst: false });

    if (notesError) {
      return new Response(JSON.stringify({ error: notesError.message }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const workOrderIds = [...new Set((notes || []).map((note) => note.work_order_id).filter(Boolean))];

    let workOrders = [];
    if (workOrderIds.length > 0) {
      const { data, error } = await supabaseAdmin
        .from('WorkOrder')
        .select('id, ro_number, wo_number, customer_id, vehicle_id, description')
        .in('id', workOrderIds);

      if (error) {
        return new Response(JSON.stringify({ error: error.message }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
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
      const { data, error } = await supabaseAdmin
        .from('Customer')
        .select('id, first_name, last_name, org_name, phone')
        .in('id', customerIds);

      if (error) {
        return new Response(JSON.stringify({ error: error.message }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      customers = data || [];
    }

    let vehicles = [];
    if (vehicleIds.length > 0) {
      const { data, error } = await supabaseAdmin
        .from('Vehicle')
        .select('id, year, make, model, vin, unit_number')
        .in('id', vehicleIds);

      if (error) {
        return new Response(JSON.stringify({ error: error.message }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      vehicles = data || [];
    }

    const customerMap = new Map(customers.map((customer) => [customer.id, customer]));
    const vehicleMap = new Map(vehicles.map((vehicle) => [vehicle.id, vehicle]));
    const fallbackColumnCounts = {
      column_1: 0,
      column_2: 0,
      column_3: 0
    };

    const cards = (notes || []).map((note, index) => {
      const workOrder = note.work_order_id ? workOrderMap.get(note.work_order_id) || null : null;
      const customerId = note.customer_id || workOrder?.customer_id || '';
      const vehicleId = note.vehicle_id || workOrder?.vehicle_id || '';
      const customer = customerMap.get(customerId) || null;
      const vehicle = vehicleMap.get(vehicleId) || null;
      const woNumber = workOrder?.wo_number || workOrder?.ro_number || '';
      const fallbackColumn = `column_${(index % 3) + 1}`;
      const boardColumn = ['column_1', 'column_2', 'column_3'].includes(note.board_column) ? note.board_column : fallbackColumn;
      const fallbackOrder = fallbackColumnCounts[boardColumn]++;
      const parsedBoardOrder = Number(note.board_order);
      const boardOrder = Number.isFinite(parsedBoardOrder) ? parsedBoardOrder : fallbackOrder;

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
        customerPhone: formatPhone(customer?.phone || ''),
        vehicle: getVehicleName(vehicle),
        vehicleUnitNumber: vehicle?.unit_number ? String(vehicle.unit_number).trim() : '',
        woNumber,
        colour: note.colour || 'white',
        status: note.status || '',
        isArchived: note.is_archived === true || note.is_archived === 'true',
        createdBy: note.created_by || '',
        boardColumn,
        boardOrder
      };
    }).filter((card) => {
      if (!searchTerm) return true;
      const haystack = [card.title, card.comment, card.customer, card.vehicle, card.woNumber]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return haystack.includes(searchTerm);
    });

    return new Response(JSON.stringify({ data: cards }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (error) {
    console.error('getNotesBoardData error:', error);
    return new Response(JSON.stringify({ error: error.message }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
