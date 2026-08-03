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
      return new Response(JSON.stringify({ error: 'Cannot merge a customer into itself' }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const supabase = createClient(Deno.env.get('SUPABASE_URL'), Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'));

    const [{ data: masterCustomer }, { data: duplicateCustomer }] = await Promise.all([
      supabase.from('Customer').select('*').eq('id', masterId).single(),
      supabase.from('Customer').select('*').eq('id', duplicateId).single()
    ]);
    if (!masterCustomer || !duplicateCustomer) {
      return new Response(JSON.stringify({ error: 'One or both customers not found' }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const fieldsToMerge = ['org_name', 'first_name', 'last_name', 'phone', 'secondary_phone', 'email', 'address', 'city', 'state', 'zip_code', 'default_taxable'];
    const isEmpty = (val) => val === null || val === undefined || val === '';
    const updatesToMaster = {};
    fieldsToMerge.forEach(field => {
      if (isEmpty(masterCustomer[field]) && !isEmpty(duplicateCustomer[field])) updatesToMaster[field] = duplicateCustomer[field];
    });
    if (!isEmpty(duplicateCustomer.notes)) {
      const separator = masterCustomer.notes ? '\n\n' : '';
      updatesToMaster.notes = (masterCustomer.notes || '') + separator +
        `--- Merged Data from ${duplicateCustomer.first_name || ''} ${duplicateCustomer.last_name || ''} (${duplicateCustomer.org_name || ''}) ---\n` + duplicateCustomer.notes;
    }

    const now = new Date().toISOString();
    if (Object.keys(updatesToMaster).length > 0) {
      updatesToMaster.updated_date = now;
      const { error } = await supabase.from('Customer').update(updatesToMaster).eq('id', masterId);
      if (error) throw error;
    }

    const [
      { data: vehiclesData, error: vehiclesError },
      { data: workOrdersData, error: workOrdersError },
      { data: paymentsData, error: paymentsError },
      { data: adjustmentsData, error: adjustmentsError }
    ] = await Promise.all([
      supabase.from('Vehicle').update({ customer_id: masterId, updated_date: now }).eq('customer_id', duplicateId).select('id'),
      supabase.from('WorkOrder').update({ customer_id: masterId, updated_at: now }).eq('customer_id', duplicateId).select('id'),
      supabase.from('CustomerPayments').update({ customer_id: masterId, updated_date: now }).eq('customer_id', duplicateId).select('id'),
      supabase.from('CustomerARAdjustment').update({ customer_id: masterId, updated_date: now }).eq('customer_id', duplicateId).select('id')
    ]);
    if (vehiclesError) throw vehiclesError;
    if (workOrdersError) throw workOrdersError;
    if (paymentsError) throw paymentsError;
    if (adjustmentsError) throw adjustmentsError;

    const masterName = masterCustomer.org_name || `${masterCustomer.first_name || ''} ${masterCustomer.last_name || ''}`;
    const auditNote = `merged into ${masterName.trim()} - ${masterId} for audit trail creation`;
    const currentNotes = duplicateCustomer.notes || '';
    const newNotes = currentNotes ? `${currentNotes}\n\n${auditNote}` : auditNote;
    const { error: dupError } = await supabase.from('Customer').update({ is_active: false, notes: newNotes, updated_date: now }).eq('id', duplicateId);
    if (dupError) throw dupError;

    return new Response(JSON.stringify({
      success: true, message: 'Customers merged successfully',
      mergedCount: { vehicles: vehiclesData?.length || 0, workOrders: workOrdersData?.length || 0, payments: paymentsData?.length || 0, adjustments: adjustmentsData?.length || 0 }
    }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
