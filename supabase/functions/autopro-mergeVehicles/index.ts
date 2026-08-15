import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "*",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const { masterId, duplicateId } = await req.json();
    if (!masterId || !duplicateId) {
      return new Response(JSON.stringify({ error: 'Master ID and Duplicate ID are required' }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    if (masterId === duplicateId) {
      return new Response(JSON.stringify({ error: 'Cannot merge a vehicle into itself' }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const supabase = createClient(Deno.env.get('SUPABASE_URL'), Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'));

    const [{ data: masterVehicle }, { data: duplicateVehicle }] = await Promise.all([
      supabase.from('Vehicle').select('*').eq('id', masterId).single(),
      supabase.from('Vehicle').select('*').eq('id', duplicateId).single()
    ]);
    if (!masterVehicle || !duplicateVehicle) {
      return new Response(JSON.stringify({ error: 'One or both vehicles not found' }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const fieldsToMerge = ['year', 'make', 'model', 'trim', 'vin', 'license_plate', 'unit_number', 'color', 'engine', 'customer_id'];
    const isEmpty = (val) => val === null || val === undefined || val === '';
    const updatesToMaster = {};
    fieldsToMerge.forEach(field => {
      if (isEmpty(masterVehicle[field]) && !isEmpty(duplicateVehicle[field])) updatesToMaster[field] = duplicateVehicle[field];
    });

    const masterMileage = parseFloat(masterVehicle.mileage) || 0;
    const duplicateMileage = parseFloat(duplicateVehicle.mileage) || 0;
    if (duplicateMileage > masterMileage) updatesToMaster.mileage = duplicateMileage;

    const masterDate = masterVehicle.odometer_date ? new Date(masterVehicle.odometer_date).getTime() : 0;
    const duplicateDate = duplicateVehicle.odometer_date ? new Date(duplicateVehicle.odometer_date).getTime() : 0;
    if (duplicateDate > masterDate) updatesToMaster.odometer_date = duplicateVehicle.odometer_date;

    if (!isEmpty(duplicateVehicle.notes)) {
      const separator = masterVehicle.notes ? '\n\n' : '';
      const duplicateInfo = `${duplicateVehicle.year || ''} ${duplicateVehicle.make || ''} ${duplicateVehicle.model || ''}`;
      updatesToMaster.notes = (masterVehicle.notes || '') + separator +
        `--- Merged Data from ${duplicateInfo.trim()} (${duplicateVehicle.vin || 'No VIN'}) ---\n` + duplicateVehicle.notes;
    }

    const now = new Date().toISOString();
    if (Object.keys(updatesToMaster).length > 0) {
      updatesToMaster.updated_date = now;
      const { error } = await supabase.from('Vehicle').update(updatesToMaster).eq('id', masterId);
      if (error) throw error;
    }

    const { data: workOrdersData, error: workOrdersError } = await supabase
      .from('WorkOrder').update({ vehicle_id: masterId, updated_at: now }).eq('vehicle_id', duplicateId).select('id');
    if (workOrdersError) throw workOrdersError;

    const { data: appointmentsData, error: appointmentsError } = await supabase
      .from('Appointment').update({ vehicle_id: masterId }).eq('vehicle_id', duplicateId).select('id');
    if (appointmentsError) throw appointmentsError;
    const appointments = appointmentsData || [];

    const masterInfo = `${masterVehicle.year || ''} ${masterVehicle.make || ''} ${masterVehicle.model || ''}`;
    const auditNote = `merged into ${masterInfo.trim()} - ${masterId} for audit trail creation`;
    const currentNotes = duplicateVehicle.notes || '';
    const newNotes = currentNotes ? `${currentNotes}\n\n${auditNote}` : auditNote;
    const { error: dupError } = await supabase.from('Vehicle').update({ is_active: false, notes: newNotes, updated_date: now }).eq('id', duplicateId);
    if (dupError) throw dupError;

    return new Response(JSON.stringify({
      success: true, message: 'Vehicles merged successfully',
      mergedCount: { workOrders: workOrdersData?.length || 0, appointments: appointments.length }
    }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
