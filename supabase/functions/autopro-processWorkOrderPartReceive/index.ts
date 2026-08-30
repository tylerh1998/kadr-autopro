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
    const { workOrderId, roNumber, receipts } = await req.json();

    // receipts: [{ lineItemId, quantity }] - replaces the old single { lineItemId, receivedQuantity } shape.
    if ((!workOrderId && !roNumber) || !Array.isArray(receipts) || receipts.length === 0) {
      return new Response(JSON.stringify({ error: 'Invalid input parameters' }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    // String-normalized, same reasoning as the sibling bulk function: lineItemIds arriving from the
    // frontend may be raw JS numbers or have passed through object-key coercion depending on the caller.
    const receiptMap = new Map();
    receipts.forEach(r => {
      const qty = parseFloat(r?.quantity);
      if (r?.lineItemId !== undefined && r?.lineItemId !== null && !isNaN(qty) && qty > 0) {
        receiptMap.set(String(r.lineItemId), qty);
      }
    });

    if (receiptMap.size === 0) {
      return new Response(JSON.stringify({ error: 'No valid receipt quantities provided' }), {
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

    // Lock-ownership backstop - independent of ReceivePartModal.jsx's own client-side check.
    if (workOrder.LockedByUser && workOrder.LockedByUser !== user.email) {
      return new Response(JSON.stringify({ error: `Work order is currently locked by ${workOrder.LockedByUser}` }), {
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

    // Preserve payload/array order - determines skip priority when shared-item stock runs out mid-batch.
    const targetIndexes = [];
    lineItems.forEach((li, idx) => {
      if (receiptMap.has(String(li.id))) targetIndexes.push(idx);
    });

    if (targetIndexes.length === 0) {
      return new Response(JSON.stringify({ error: 'None of the requested line items were found on this work order' }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    const inventoryItemIds = [...new Set(
      targetIndexes.map(idx => lineItems[idx].inventory_item_id).filter(Boolean)
    )];

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

    // Running per-item QOH/QOO, seeded from live DB values - decremented as each line in THIS batch is
    // applied, so two selected lines sharing one inventory_item_id can't both spend the same physical stock.
    const runningQOH = new Map();
    const runningQOO = new Map();
    inventoryItemsMap.forEach((item, id) => {
      runningQOH.set(id, parseFloat(item.quantity_on_hand) || 0);
      runningQOO.set(id, parseFloat(item.quantity_on_order) || 0);
    });

    const skipped = [];
    const rpcCalls = [];

    targetIndexes.forEach(idx => {
      const line = lineItems[idx];
      const requestedQty = receiptMap.get(String(line.id));
      const invItem = inventoryItemsMap.get(line.inventory_item_id);

      if (!line.inventory_item_id || !invItem) {
        skipped.push({ lineItemId: line.id, reason: 'No matching inventory item found' });
        return;
      }

      const qtyOnOrder = parseFloat(line.qty_on_order) || 0;
      const qtyQuoted = parseFloat(line.qty_quoted) || 0;
      // Same precedence the per-line context menu already uses today: on-order first.
      const source = qtyOnOrder > 0 ? 'on_order' : (qtyQuoted > 0 ? 'quoted' : null);

      if (!source) {
        skipped.push({ lineItemId: line.id, reason: 'Line has no on-order or quoted quantity remaining' });
        return;
      }

      const sourceQty = source === 'on_order' ? qtyOnOrder : qtyQuoted;
      if (requestedQty > sourceQty) {
        skipped.push({
          lineItemId: line.id,
          reason: `Requested ${requestedQty} exceeds ${source === 'on_order' ? 'on-order' : 'quoted'} quantity (${sourceQty})`
        });
        return;
      }

      const currentRunningQOH = runningQOH.get(line.inventory_item_id);
      if (requestedQty > currentRunningQOH) {
        skipped.push({
          lineItemId: line.id,
          reason: `Insufficient inventory - only ${currentRunningQOH} unit(s) remain available for this item after other selected lines in this batch`
        });
        return;
      }

      const newQOH = currentRunningQOH - requestedQty;
      runningQOH.set(line.inventory_item_id, newQOH);

      let newQOO = runningQOO.get(line.inventory_item_id);
      if (source === 'on_order') {
        newQOO = Math.max(0, newQOO - requestedQty);
        runningQOO.set(line.inventory_item_id, newQOO);
      }

      lineItems[idx] = {
        ...line,
        ...(source === 'on_order'
          ? { qty_on_order: Math.max(0, sourceQty - requestedQty) }
          : { qty_quoted: Math.max(0, sourceQty - requestedQty) }),
        inventory_processed: true,
        cost_ea: invItem.cost || line.cost_ea || 0
      };

      rpcCalls.push({
        itemId: line.inventory_item_id,
        newQOH,
        newQOO,
        description: source === 'on_order'
          ? `Issued to ${workOrder.ro_number} - ${line.description || line.part_number}`
          : `Issued to ${workOrder.ro_number} from quote - ${line.description || line.part_number}`
      });
    });

    if (rpcCalls.length === 0) {
      return new Response(JSON.stringify({ error: 'No line items could be received', skipped }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    const { error: workOrderUpdateError } = await supabaseAdmin
      .from('WorkOrder')
      .update({ line_items: lineItems })
      .eq('ro_number', workOrder.ro_number);

    if (workOrderUpdateError) {
      return new Response(JSON.stringify({ error: 'Failed to update work order', details: workOrderUpdateError.message }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    // Sequential, not Promise.all - same reasoning as autopro-processWorkOrderMarkQuotedOrdered: each
    // call must land before the next reads/writes the same item, and this also gives one audit row per
    // WO line received even when several lines share one inventory_item_id.
    for (const call of rpcCalls) {
      const { error: rpcError } = await supabaseAdmin.rpc('update_inventory_with_audit', {
        p_item_id: call.itemId,
        p_qoh: call.newQOH,
        p_qoo: call.newQOO,
        p_ro_number: workOrder.ro_number,
        p_supplier_inv: null,
        p_source_action: 'autopro-processWorkOrderPartReceive',
        p_tx_type: 'Issued to WO',
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
      message: `Received ${rpcCalls.length} of ${targetIndexes.length} selected line item(s)`,
      updatedLineItems: targetIndexes.map(idx => lineItems[idx]),
      skipped
    }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });

  } catch (error) {
    console.error('Error in processWorkOrderPartReceive:', error);
    return new Response(JSON.stringify({
      error: error.message || 'Internal server error'
    }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }
});
