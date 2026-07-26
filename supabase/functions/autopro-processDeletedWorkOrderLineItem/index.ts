import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "*",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS, PUT, DELETE",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY");

    if (!supabaseUrl || !supabaseServiceKey || !supabaseAnonKey) {
      throw new Error("Missing system environment variables on Supabase.");
    }

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);
    const supabaseClient = createClient(supabaseUrl, supabaseAnonKey);

    const authHeader = req.headers.get("Authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Missing or invalid Authorization header" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const token = authHeader.substring(7);
    const { data: authData, error: authError } = await supabaseClient.auth.getUser(token);

    if (authError || !authData?.user) {
      return new Response(JSON.stringify({ error: "Unauthorized user session" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const user = authData.user;
    const body = await req.json();
    const { inventoryItemId, workOrderId, roNumber, partNumber, totalQty = 0, qtyOnOrder = 0 } = body;

    if (!inventoryItemId) {
      return new Response(JSON.stringify({ error: "inventoryItemId is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    const parsedTotalQty = parseFloat(totalQty) || 0;
    const parsedQtyOnOrder = parseFloat(qtyOnOrder) || 0;
    const qtyToReturnToStock = Math.max(0, parsedTotalQty - parsedQtyOnOrder);
    const qtyToCancelOnOrder = Math.max(0, parsedQtyOnOrder);

    if (qtyToReturnToStock === 0 && qtyToCancelOnOrder === 0) {
      return new Response(JSON.stringify({
        success: true,
        data: {
          quantity_on_hand_change: 0,
          quantity_on_order_change: 0,
          txs_created: 0,
        },
      }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    const { data: inventoryItem, error: inventoryError } = await supabaseAdmin
      .from('InventoryItem')
      .select('*')
      .eq('id', inventoryItemId)
      .maybeSingle();

    if (inventoryError || !inventoryItem) {
      return new Response(JSON.stringify({ error: 'Inventory item not found', details: inventoryError?.message }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    const currentQOH = parseFloat(inventoryItem.quantity_on_hand) || 0;
    const currentQOO = parseFloat(inventoryItem.quantity_on_order) || 0;
    
    // We update atomically via RPC to record the audit log
    let newQOH = currentQOH;
    let newQOO = currentQOO;
    let txsCreated = 0;
    let hasError = false;
    let rpcErrorObj = null;
    const debug_errors = [];

    // 1. Returned to Stock
    if (qtyToReturnToStock > 0) {
      newQOH = currentQOH + qtyToReturnToStock;
      
      const { error: rpcError } = await supabaseAdmin.rpc('update_inventory_with_audit', {
        p_item_id: inventoryItemId,
        p_qoh: newQOH, // Intermediate QOH
        p_qoo: currentQOO,
        p_ro_number: roNumber || null,
        p_supplier_inv: null,
        p_source_action: 'autopro-processDeletedWorkOrderLineItem',
        p_tx_type: 'Returned from WO',
        p_description: `Returned ${qtyToReturnToStock} units to inventory from deleted line on ${roNumber || 'work order'}`,
        p_user_id: user.id || null,
        p_user_name: user.email || null,
        p_source_record_id: workOrderId || null
      });

      if (rpcError) {
        hasError = true;
        rpcErrorObj = rpcError;
        debug_errors.push({ reason: 'rpcError (Return)', error: rpcError });
      } else {
        txsCreated++;
      }
    }

    // 2. Order Cancelled
    if (qtyToCancelOnOrder > 0 && !hasError) {
      newQOO = Math.max(0, currentQOO - qtyToCancelOnOrder);

      const { error: rpcError } = await supabaseAdmin.rpc('update_inventory_with_audit', {
        p_item_id: inventoryItemId,
        p_qoh: newQOH, // Current updated QOH
        p_qoo: newQOO, // New updated QOO
        p_ro_number: roNumber || null,
        p_supplier_inv: null,
        p_source_action: 'autopro-processDeletedWorkOrderLineItem',
        p_tx_type: 'Order Cancelled',
        p_description: `Cancelled ${qtyToCancelOnOrder} on order from deleted line on ${roNumber || 'work order'}`,
        p_user_id: user.id || null,
        p_user_name: user.email || null,
        p_source_record_id: workOrderId || null
      });

      if (rpcError) {
        hasError = true;
        rpcErrorObj = rpcError;
        debug_errors.push({ reason: 'rpcError (Cancel)', error: rpcError });
      } else {
        txsCreated++;
      }
    }

    if (hasError) {
      return new Response(JSON.stringify({ 
        error: "Failed to process inventory update via RPC",
        details: rpcErrorObj?.message,
        debug_errors 
      }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    return new Response(JSON.stringify({
      success: true,
      data: {
        quantity_on_hand: newQOH,
        quantity_on_order: newQOO,
        quantity_on_hand_change: qtyToReturnToStock,
        quantity_on_order_change: -qtyToCancelOnOrder,
        txs_created: txsCreated,
      },
    }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  } catch (error) {
    console.error('processDeletedWorkOrderLineItem error:', error);
    return new Response(JSON.stringify({ error: error.message || 'Internal Server Error' }), { 
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }
});
