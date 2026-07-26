import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.6";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    
    if (!supabaseUrl || !supabaseKey) {
      throw new Error("Missing Supabase environment variables");
    }

    // Initialize Supabase client
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get user from auth header
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      throw new Error("Missing Authorization header");
    }

    const { data: { user }, error: authError } = await supabase.auth.getUser(authHeader.replace('Bearer ', ''));
    if (authError || !user) {
      throw new Error("Unauthorized");
    }

    const { items, workOrderId, roNumber } = await req.json();

    if (!items || !Array.isArray(items)) {
      throw new Error("Missing or invalid items array");
    }

    const results = [];
    const debug_errors = [];

    // Process each item
    for (const item of items) {
      const inventoryItemId = item.inventory_item_id || item.inventoryItemId;
      const requestedQuantity = parseFloat(item.qty || item.requestedQuantity);
      const lineDescription = item.description || item.lineDescription || '';
      const linePartNumber = item.part_number || item.linePartNumber || '';
      const existingQtyOnOrder = parseFloat(item.qty_on_order || item.lineQtyOnOrder) || 0;

      if (!inventoryItemId || isNaN(requestedQuantity)) {
        debug_errors.push({ item, reason: 'Missing inventoryItemId or invalid requestedQuantity' });
        continue;
      }

      // Fetch the current inventory item
      const { data: invItem, error: fetchError } = await supabase
        .from('InventoryItem')
        .select('quantity_on_hand, quantity_on_order, part_number, description')
        .eq('id', inventoryItemId)
        .single();

      if (fetchError || !invItem) {
        console.error(`Failed to fetch inventory item ${inventoryItemId}:`, fetchError);
        debug_errors.push({ item, reason: 'fetchError', error: fetchError });
        continue; // Skip this one on error
      }

      const currentQOH = Number(invItem.quantity_on_hand) || 0;
      const currentQOO = Number(invItem.quantity_on_order) || 0;
      
      let newQOH = currentQOH;
      let qtyToOrder = 0;
      let qtyIssued = 0;
      let newQOO = currentQOO;

      if (currentQOH >= requestedQuantity) {
        qtyIssued = requestedQuantity;
        newQOH = currentQOH - requestedQuantity;
      } else if (currentQOH > 0) {
        qtyIssued = currentQOH;
        qtyToOrder = requestedQuantity - currentQOH;
        newQOH = 0;
        newQOO = currentQOO + qtyToOrder;
      } else {
        qtyToOrder = requestedQuantity;
        newQOO = currentQOO + requestedQuantity;
      }

      let hasError = false;

      // 1. Log Issued if qtyIssued > 0
      if (qtyIssued > 0) {
        const { error: rpcError } = await supabase.rpc('update_inventory_with_audit', {
          p_item_id: inventoryItemId,
          p_qoh: currentQOH - qtyIssued, // Intermediate QOH for this step
          p_qoo: currentQOO,             // QOO hasn't changed yet
          p_ro_number: roNumber || null,
          p_supplier_inv: null,
          p_source_action: 'autopro-WOBulkGetParts',
          p_tx_type: 'Issued to WO',
          p_description: `Issued to ${roNumber || workOrderId}`,
          p_user_id: user.id || null,
          p_user_name: user.email || null,
          p_source_record_id: workOrderId || null
        });

        if (rpcError) {
          console.error(`Issued RPC failed for ${inventoryItemId}:`, rpcError);
          debug_errors.push({ item, reason: 'rpcError (Issued)', error: rpcError });
          hasError = true;
        }
      }

      // 2. Log Ordered if qtyToOrder > 0
      if (qtyToOrder > 0 && !hasError) {
        const { error: rpcError } = await supabase.rpc('update_inventory_with_audit', {
          p_item_id: inventoryItemId,
          p_qoh: newQOH, // Final QOH
          p_qoo: newQOO, // Final QOO
          p_ro_number: roNumber || null,
          p_supplier_inv: null,
          p_source_action: 'autopro-WOBulkGetParts',
          p_tx_type: 'Ordered',
          p_description: `Ordered for ${roNumber || workOrderId}`,
          p_user_id: user.id || null,
          p_user_name: user.email || null,
          p_source_record_id: workOrderId || null
        });

        if (rpcError) {
          console.error(`Ordered RPC failed for ${inventoryItemId}:`, rpcError);
          debug_errors.push({ item, reason: 'rpcError (Ordered)', error: rpcError });
          hasError = true;
        }
      }

      if (hasError) {
        // Continue with other items even if one failed
        continue;
      }

      // Record successful result so frontend can update its state
      results.push({
        id: item.id, // return the line item ID if it was passed, so frontend can map it back
        inventory_item_id: inventoryItemId,
        part_number: linePartNumber,
        requested_quantity: requestedQuantity,
        issued_quantity: qtyIssued,
        ordered_quantity: qtyToOrder,
        qty_on_order: qtyToOrder + existingQtyOnOrder, // New QOO for this line item specifically
        success: true
      });
    }

    return new Response(JSON.stringify({ 
      success: true, 
      processed_count: results.length,
      items: results,
      debug_errors
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });

  } catch (error) {
    return new Response(JSON.stringify({ success: false, error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    });
  }
});
