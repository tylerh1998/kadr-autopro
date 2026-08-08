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
    const { workOrderId, roNumber, lineItemId, receivedQuantity } = await req.json();

    if ((!workOrderId && !roNumber) || !lineItemId || !receivedQuantity || receivedQuantity <= 0) {
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

    // String-normalized - line ids from newly-added batch parts are raw JS numbers, and the caller may
    // pass either type depending on how it read the id off the line object.
    const lineItemIndex = lineItems.findIndex(item => String(item.id) === String(lineItemId));
    if (lineItemIndex === -1) {
      return new Response(JSON.stringify({ error: 'Line item not found in work order' }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    const lineItem = lineItems[lineItemIndex];
    const resolvedInventoryItemId = lineItem.inventory_item_id;

    const currentQtyQuoted = parseFloat(lineItem.qty_quoted) || 0;
    if (receivedQuantity > currentQtyQuoted) {
      return new Response(JSON.stringify({
        error: `Cannot receive ${receivedQuantity} units. Only ${currentQtyQuoted} units are quoted for this line.`
      }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    const { data: inventoryItem, error: inventoryItemError } = await supabaseAdmin
      .from('InventoryItem')
      .select('*')
      .eq('id', resolvedInventoryItemId)
      .maybeSingle();

    if (inventoryItemError || !inventoryItem) {
      return new Response(JSON.stringify({ error: `Inventory item not found for line item id ${lineItem.id}`, details: inventoryItemError?.message }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    const effectiveInventoryItemId = inventoryItem.id;
    const currentQOH = parseFloat(inventoryItem.quantity_on_hand) || 0;

    if (currentQOH < receivedQuantity) {
      return new Response(JSON.stringify({
        error: `Insufficient inventory. Only ${currentQOH} units available in stock.`
      }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    const newQtyQuoted = Math.max(0, currentQtyQuoted - receivedQuantity);
    lineItems[lineItemIndex] = {
      ...lineItem,
      qty_quoted: newQtyQuoted,
      inventory_processed: true,
      cost_ea: inventoryItem.cost || 0
    };

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

    // Quantity on order is untouched - a quoted line was never counted as on order in the first place,
    // there's nothing to unwind there. Only QOH moves, since this is a straight pull from existing stock.
    const newQOH = currentQOH - receivedQuantity;
    const currentQOO = parseFloat(inventoryItem.quantity_on_order) || 0;

    const description = `Issued to ${workOrder.ro_number} from quote - ${lineItem.description || lineItem.part_number}`;

    const { error: rpcError } = await supabaseAdmin.rpc('update_inventory_with_audit', {
      p_item_id: effectiveInventoryItemId,
      p_qoh: newQOH,
      p_qoo: currentQOO,
      p_ro_number: workOrder.ro_number,
      p_supplier_inv: null,
      p_source_action: 'autopro-processWorkOrderReceiveQuotedPart',
      p_tx_type: 'Issued to WO',
      p_description: description,
      p_user_id: user.id || null,
      p_user_name: user.email || null,
      p_source_record_id: workOrder.id || null
    });

    if (rpcError) {
      return new Response(JSON.stringify({
        error: 'Failed to update inventory item via RPC',
        details: rpcError.message
      }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    return new Response(JSON.stringify({
      success: true,
      message: `Successfully issued ${receivedQuantity} unit(s) from quote to work order`,
      updatedLineItem: lineItems[lineItemIndex],
      newInventoryQOH: newQOH
    }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });

  } catch (error) {
    console.error('Error in processWorkOrderReceiveQuotedPart:', error);
    return new Response(JSON.stringify({
      error: error.message || 'Internal server error'
    }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }
});
