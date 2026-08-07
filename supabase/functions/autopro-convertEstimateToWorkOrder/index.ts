import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "*",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};

function getMountainDateString() {
  const now = new Date();
  const mountainString = now.toLocaleString('sv-SE', {
    timeZone: 'America/Edmonton',
    hour12: false,
  });
  return mountainString.split(' ')[0];
}

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
    const user = authData.user;

    const { workOrderId } = await req.json();
    if (!workOrderId) {
      return new Response(JSON.stringify({ error: 'Work Order ID is required' }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const { data: workOrder, error: workOrderError } = await supabaseAdmin
      .from('WorkOrder')
      .select('*')
      .eq('id', workOrderId)
      .maybeSingle();

    if (workOrderError) {
      return new Response(JSON.stringify({ error: 'Failed to fetch work order', details: workOrderError.message }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    if (!workOrder) {
      return new Response(JSON.stringify({ error: 'Work Order not found' }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Fetch Suppliers for lookup
    let supplierMap = new Map();
    try {
      const { data: suppliers } = await supabaseAdmin.from('Supplier').select('id, name');
      supplierMap = new Map((suppliers || []).map(s => [s.id, s.name]));
    } catch (e) {
      console.error('Error fetching suppliers:', e);
    }

    // Parse line items
    let lineItems = [];
    try {
      lineItems = workOrder.line_items
        ? (typeof workOrder.line_items === 'string' ? JSON.parse(workOrder.line_items) : workOrder.line_items)
        : [];
    } catch (e) {
      return new Response(JSON.stringify({ error: 'Invalid line items data' }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const updatedLineItems = [];

    // Process line items for inventory updates sequentially
    for (const line of lineItems) {
      const qtyQuoted = parseFloat(line.qty_quoted) || 0;

      // Quoted parts (Estimate stage only allows Quoted, never On Order) are finalized to real on-order
      // quantities on conversion - estimates can't place real orders, so this is where that commitment happens.
      if (qtyQuoted > 0 && line.inventory_item_id) {
        try {
          const { data: inventoryItem } = await supabaseAdmin
            .from('InventoryItem')
            .select('*')
            .eq('id', line.inventory_item_id)
            .maybeSingle();

          if (!inventoryItem) {
            updatedLineItems.push(line);
            continue;
          }

          const currentQOH = parseFloat(inventoryItem.quantity_on_hand) || 0;
          const currentQOO = parseFloat(inventoryItem.quantity_on_order) || 0;
          const newQOO = currentQOO + qtyQuoted;

          const { error: rpcError } = await supabaseAdmin.rpc('update_inventory_with_audit', {
            p_item_id: line.inventory_item_id,
            p_qoh: currentQOH,
            p_qoo: newQOO,
            p_ro_number: workOrder.ro_number || null,
            p_supplier_inv: null,
            p_source_action: 'autopro-convertEstimateToWorkOrder',
            p_tx_type: 'Ordered',
            p_description: `Quote finalized to order on conversion of EST ${workOrder.ro_number} to WO - ${line.description || line.part_number}`,
            p_user_id: user.id || null,
            p_user_name: user.email || null,
            p_source_record_id: workOrder.id
          });
          if (rpcError) console.error(`Error finalizing quoted part ${line.inventory_item_id}:`, rpcError);

          updatedLineItems.push({
            ...line,
            qty_on_order: (parseFloat(line.qty_on_order) || 0) + qtyQuoted,
            qty_quoted: 0
          });
        } catch (err) {
          console.error(`Error finalizing quoted line for item ${line.inventory_item_id}:`, err);
          updatedLineItems.push(line);
        }
        continue;
      }

      if (line.inventory_item_id && !line.inventory_processed && parseFloat(line.qty) > 0) {
        const requestedQuantity = parseFloat(line.qty);
        const inventoryItemId = line.inventory_item_id;

        try {
          const { data: inventoryItem } = await supabaseAdmin
            .from('InventoryItem')
            .select('*')
            .eq('id', inventoryItemId)
            .maybeSingle();

          if (!inventoryItem) {
            updatedLineItems.push(line);
            continue;
          }

          const currentQOH = parseFloat(inventoryItem.quantity_on_hand) || 0;
          const currentQOO = parseFloat(inventoryItem.quantity_on_order) || 0;

          let qtyTakenFromHand = 0;
          let qtyPlacedOnOrder = 0;

          // Determine split based on QOH
          if (currentQOH >= requestedQuantity) {
            qtyTakenFromHand = requestedQuantity;
            qtyPlacedOnOrder = 0;
          } else if (currentQOH > 0) {
            qtyTakenFromHand = currentQOH;
            qtyPlacedOnOrder = requestedQuantity - currentQOH;
          } else {
            qtyTakenFromHand = 0;
            qtyPlacedOnOrder = requestedQuantity;
          }

          // Issue from hand (QOH decrease) — updates InventoryItem + fires the audit trigger
          if (qtyTakenFromHand > 0) {
            const newQOH = currentQOH - qtyTakenFromHand;
            const { error: rpcError } = await supabaseAdmin.rpc('update_inventory_with_audit', {
              p_item_id: inventoryItemId,
              p_qoh: newQOH,
              p_qoo: currentQOO,
              p_ro_number: workOrder.ro_number || null,
              p_supplier_inv: null,
              p_source_action: 'autopro-convertEstimateToWorkOrder',
              p_tx_type: 'Issued to WO',
              p_description: `Allocated ${qtyTakenFromHand} to WO ${workOrder.ro_number} (Conversion)`,
              p_user_id: user.id || null,
              p_user_name: user.email || null,
              p_source_record_id: workOrder.id
            });
            if (rpcError) console.error(`Error issuing from hand for item ${inventoryItemId}:`, rpcError);
          }

          // Place on order (QOO increase) — separate update so the trigger records this delta on its own row
          if (qtyPlacedOnOrder > 0) {
            const supplierName = supplierMap.get(inventoryItem.supplier_id) || '';
            const newQOO = currentQOO + qtyPlacedOnOrder;
            const newQOHAfterFirstStep = qtyTakenFromHand > 0 ? currentQOH - qtyTakenFromHand : currentQOH;
            const { error: rpcError } = await supabaseAdmin.rpc('update_inventory_with_audit', {
              p_item_id: inventoryItemId,
              p_qoh: newQOHAfterFirstStep,
              p_qoo: newQOO,
              p_ro_number: workOrder.ro_number || null,
              p_supplier_inv: null,
              p_source_action: 'autopro-convertEstimateToWorkOrder',
              p_tx_type: 'Ordered',
              p_description: `Placed ${qtyPlacedOnOrder} on order for WO ${workOrder.ro_number} (Conversion)${supplierName ? ` — Supplier: ${supplierName}` : ''}`,
              p_user_id: user.id || null,
              p_user_name: user.email || null,
              p_source_record_id: workOrder.id
            });
            if (rpcError) console.error(`Error placing on order for item ${inventoryItemId}:`, rpcError);
          }

          updatedLineItems.push({
            ...line,
            qty_on_order: qtyPlacedOnOrder,
            inventory_processed: true
          });

        } catch (err) {
          console.error(`Error processing inventory for item ${inventoryItemId}:`, err);
          updatedLineItems.push(line);
        }
      } else {
        updatedLineItems.push(line);
      }
    }

    // Update Work Order
    const updateData = {
      stage: 'work_order',
      line_items: updatedLineItems,
      wo_date: getMountainDateString(),
      LockedByUser: null,
      locked_timestamp: null
    };

    if (!workOrder.wo_number && workOrder.ro_number) {
      const roNumericPart = workOrder.ro_number.replace(/\D/g, '');
      updateData.wo_number = `WO${roNumericPart}`;
    }

    const { data: updatedWorkOrder, error: updateError } = await supabaseAdmin
      .from('WorkOrder')
      .update(updateData)
      .eq('id', workOrderId)
      .select('*')
      .maybeSingle();

    if (updateError) {
      return new Response(JSON.stringify({ error: 'Failed to update work order during conversion', details: updateError.message }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    if (!updatedWorkOrder) {
      return new Response(JSON.stringify({ error: 'Work Order not found during update' }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    return new Response(JSON.stringify({ success: true, data: updatedWorkOrder }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (error) {
    console.error('Error converting estimate:', error);
    return new Response(JSON.stringify({ error: error.message }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
