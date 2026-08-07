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
    const { workOrderId, roNumber, lineItemIds } = await req.json();

    if ((!workOrderId && !roNumber) || !Array.isArray(lineItemIds) || lineItemIds.length === 0) {
      return new Response(JSON.stringify({ error: 'Invalid input parameters' }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    const workOrderQuery = supabaseAdmin.from('WorkOrder').select('*').limit(1);
    const { data: workOrder, error: workOrderError } = roNumber
      ? await workOrderQuery.eq('ro_number', roNumber).maybeSingle()
      : await workOrderQuery.eq('id', workOrderId).maybeSingle();

    if (workOrderError || !workOrder) {
      return new Response(JSON.stringify({ error: 'Work order not found', details: workOrderError?.message }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    let lineItems = [];
    try {
      lineItems = typeof workOrder.line_items === 'string'
        ? JSON.parse(workOrder.line_items || '[]')
        : (Array.isArray(workOrder.line_items) ? workOrder.line_items : []);
    } catch (e) {
      return new Response(JSON.stringify({ error: 'Failed to parse work order line items' }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    // IDs are compared as strings - line_items[].id is often a raw JS number (Date.now() + Math.random())
    // from client-side line creation, while lineItemIds arrives here having passed through object-key
    // coercion on the frontend (e.g. Object.keys() on a checked-state map), which stringifies numbers.
    const selectedIdSet = new Set(lineItemIds.map(String));
    const targetIndexes = [];
    lineItems.forEach((li, idx) => {
      if (selectedIdSet.has(String(li.id)) && (parseFloat(li.qty_quoted) || 0) > 0) {
        targetIndexes.push(idx);
      }
    });

    if (targetIndexes.length === 0) {
      return new Response(JSON.stringify({ error: 'None of the selected line items currently have a quoted quantity' }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    // Batch-fetch every distinct InventoryItem touched by the selected lines
    const inventoryItemIds = [...new Set(
      targetIndexes.map(idx => lineItems[idx].inventory_item_id).filter(Boolean)
    )];

    const skipped = [];
    let validTargetIndexes = targetIndexes;
    let inventoryItemsMap = new Map();

    if (inventoryItemIds.length > 0) {
      const { data: inventoryItems, error: inventoryError } = await supabaseAdmin
        .from('InventoryItem')
        .select('*')
        .in('id', inventoryItemIds);

      if (inventoryError) {
        return new Response(JSON.stringify({ error: 'Failed to fetch inventory items', details: inventoryError.message }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }

      (inventoryItems || []).forEach(item => inventoryItemsMap.set(item.id, item));
    }

    // Running per-item QOO total, so two selected lines sharing the same inventory_item_id don't race each other
    const runningQOO = new Map();
    inventoryItemsMap.forEach((item, id) => {
      runningQOO.set(id, parseFloat(item.quantity_on_order) || 0);
    });

    const rpcCalls = [];

    validTargetIndexes = targetIndexes.filter(idx => {
      const line = lineItems[idx];
      const invItem = inventoryItemsMap.get(line.inventory_item_id);
      if (!line.inventory_item_id || !invItem) {
        skipped.push({ lineItemId: line.id, reason: 'No matching inventory item found' });
        return false;
      }
      return true;
    });

    validTargetIndexes.forEach(idx => {
      const line = lineItems[idx];
      const qtyQuoted = parseFloat(line.qty_quoted) || 0;
      const invItem = inventoryItemsMap.get(line.inventory_item_id);

      const currentRunning = runningQOO.get(line.inventory_item_id) ?? (parseFloat(invItem.quantity_on_order) || 0);
      const newRunning = currentRunning + qtyQuoted;
      runningQOO.set(line.inventory_item_id, newRunning);

      lineItems[idx] = {
        ...line,
        qty_on_order: (parseFloat(line.qty_on_order) || 0) + qtyQuoted,
        qty_quoted: 0,
        inventory_processed: true,
        cost_ea: invItem.cost || line.cost_ea || 0
      };

      rpcCalls.push({
        itemId: line.inventory_item_id,
        newQOO: newRunning,
        description: `Marked as ordered from quote for WO ${workOrder.ro_number} - ${line.description || line.part_number}`
      });
    });

    if (rpcCalls.length === 0) {
      return new Response(JSON.stringify({ error: 'No valid quoted line items to mark as ordered', skipped }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    const { error: workOrderUpdateError } = await supabaseAdmin
      .from('WorkOrder')
      .update({ line_items: JSON.stringify(lineItems) })
      .eq('ro_number', workOrder.ro_number);

    if (workOrderUpdateError) {
      return new Response(JSON.stringify({ error: 'Failed to update work order', details: workOrderUpdateError.message }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    // Sequential, not Promise.all - each call must see the previous call's write for the running-total math to hold
    for (const call of rpcCalls) {
      const invItem = inventoryItemsMap.get(call.itemId);
      const { error: rpcError } = await supabaseAdmin.rpc('update_inventory_with_audit', {
        p_item_id: call.itemId,
        p_qoh: parseFloat(invItem.quantity_on_hand) || 0,
        p_qoo: call.newQOO,
        p_ro_number: workOrder.ro_number,
        p_supplier_inv: null,
        p_source_action: 'autopro-processWorkOrderMarkQuotedOrdered',
        p_tx_type: 'Ordered',
        p_description: call.description,
        p_user_id: user.id || null,
        p_user_name: user.email || null,
        p_source_record_id: workOrder.id || null
      });

      if (rpcError) {
        return new Response(JSON.stringify({
          error: 'Failed to update inventory item via RPC',
          details: rpcError.message,
          partiallyApplied: true
        }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }
    }

    return new Response(JSON.stringify({
      success: true,
      message: `Marked ${validTargetIndexes.length} line item(s) as ordered`,
      updatedLineItems: validTargetIndexes.map(idx => lineItems[idx]),
      skipped
    }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });

  } catch (error) {
    console.error('Error in processWorkOrderMarkQuotedOrdered:', error);
    return new Response(JSON.stringify({
      error: error.message || 'Internal server error'
    }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }
});
