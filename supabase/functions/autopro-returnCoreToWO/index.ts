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
    const supabaseAdmin = createClient(Deno.env.get("SUPABASE_URL"), Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"));
    const supabaseClient = createClient(Deno.env.get("SUPABASE_URL"), Deno.env.get("SUPABASE_ANON_KEY"));

    const authHeader = req.headers.get("Authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ success: false, error: "Missing or invalid Authorization header" }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const token = authHeader.substring(7);
    const { data: authData, error: authError } = await supabaseClient.auth.getUser(token);
    if (authError || !authData?.user) {
      return new Response(JSON.stringify({ success: false, error: "Unauthorized user session" }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const { part_number, work_order_id, quantity } = await req.json();

    const normalizedPartNumber = String(part_number || '').trim();
    const normalizedWorkOrderId = String(work_order_id || '').trim();
    const normalizedQuantity = Number(quantity);

    if (!normalizedPartNumber || !normalizedWorkOrderId || !Number.isFinite(normalizedQuantity) || normalizedQuantity <= 0) {
      return new Response(JSON.stringify({
        success: false,
        error: 'Missing or invalid required parameters: part_number, work_order_id, quantity'
      }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Lock-ownership backstop - independent of ROCoreModal.jsx's own client-side check.
    const { data: lockCheckWorkOrder } = await supabaseAdmin
      .from('WorkOrder')
      .select('LockedByUser')
      .eq('id', normalizedWorkOrderId)
      .maybeSingle();
    if (lockCheckWorkOrder?.LockedByUser && lockCheckWorkOrder.LockedByUser !== authData.user.email) {
      return new Response(JSON.stringify({ success: false, error: `Work order is currently locked by ${lockCheckWorkOrder.LockedByUser}` }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const { data: matchingRecords, error: fetchError } = await supabaseAdmin
      .from('InventoryReturn')
      .select('*')
      .eq('part_number', normalizedPartNumber)
      .eq('work_order_id', normalizedWorkOrderId)
      .eq('status', 'On-site')
      .limit(1000);

    if (fetchError) {
      return new Response(JSON.stringify({ success: false, error: fetchError.message }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const sortedRecords = [...(matchingRecords || [])].sort((a, b) => {
      const dateCompare = String(a.return_date || '').localeCompare(String(b.return_date || ''));
      if (dateCompare !== 0) return dateCompare;
      return String(a.created_date || '').localeCompare(String(b.created_date || ''));
    });

    const totalAvailable = sortedRecords.reduce((sum, record) => {
      return sum + (Number(record.quantity_returned) || 0);
    }, 0);

    if (totalAvailable < normalizedQuantity) {
      return new Response(JSON.stringify({
        success: false,
        error: 'Not enough quantity in Inventory Return. Off-site Inventory must be changed to on-site before performing this. Double check the Inventory Return page.',
        total_available: totalAvailable,
        requested_quantity: normalizedQuantity,
        matched_records: sortedRecords.length
      }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    let remainingToProcess = normalizedQuantity;
    const actions = [];

    for (const record of sortedRecords) {
      if (remainingToProcess <= 0) break;

      const recordQuantity = Number(record.quantity_returned) || 0;
      const costPerUnit = Number(record.cost_per_unit) || 0;

      if (recordQuantity <= remainingToProcess) {
        const { error: deleteError } = await supabaseAdmin.from('InventoryReturn').delete().eq('id', record.id);
        if (deleteError) throw deleteError;
        remainingToProcess -= recordQuantity;

        actions.push({
          id: record.id,
          action: 'delete',
          quantity_removed: recordQuantity,
          quantity_remaining_on_record: 0
        });
      } else {
        const newQuantity = recordQuantity - remainingToProcess;
        const newTotalCost = Number((costPerUnit * newQuantity).toFixed(2));

        const { error: updateError } = await supabaseAdmin
          .from('InventoryReturn')
          .update({ quantity_returned: newQuantity, total_cost: newTotalCost, updated_date: new Date().toISOString() })
          .eq('id', record.id);
        if (updateError) throw updateError;

        actions.push({
          id: record.id,
          action: 'update',
          quantity_removed: remainingToProcess,
          quantity_remaining_on_record: newQuantity,
          new_total_cost: newTotalCost
        });

        remainingToProcess = 0;
      }
    }

    return new Response(JSON.stringify({
      success: true,
      message: 'Core quantity returned to work order successfully.',
      part_number: normalizedPartNumber,
      work_order_id: normalizedWorkOrderId,
      quantity_processed: normalizedQuantity,
      matched_records: sortedRecords.length,
      actions
    }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (error) {
    console.error('Error in autopro-returnCoreToWO:', error);
    return new Response(JSON.stringify({ success: false, error: error.message || 'Internal server error' }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
