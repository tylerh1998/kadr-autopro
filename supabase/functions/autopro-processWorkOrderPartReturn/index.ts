import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "*",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS, PUT, DELETE",
};

const getMountainNow = () => {
  const now = new Date();
  const mountainString = now.toLocaleString('sv-SE', {
    timeZone: 'America/Edmonton',
    hour12: false,
  }).replace(' ', 'T');

  return {
    txDateTime: `${mountainString}-07:00`,
    returnDate: mountainString.split('T')[0],
  };
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
    const {
      inventoryItemId,
      workOrderId,
      roNumber,
      partNumber,
      description,
      totalQty = 0,
      qtyOnOrder = 0,
      qtyToReturn = 0,
      createInventoryReturn = false,
      returnReason = '',
      returnNotes = '',
      costEach = 0,
      coreCostEach = 0,
    } = body || {};

    if (!inventoryItemId) {
      return new Response(JSON.stringify({ error: 'inventoryItemId is required' }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    const { data: inventoryItem, error: inventoryError } = await supabaseAdmin
      .from('InventoryItem')
      .select('*')
      .eq('id', inventoryItemId)
      .single();

    if (inventoryError || !inventoryItem) {
      return new Response(JSON.stringify({ error: 'Inventory item not found', details: inventoryError?.message }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    const currentQOH = parseFloat(inventoryItem.quantity_on_hand) || 0;
    const currentQOO = parseFloat(inventoryItem.quantity_on_order) || 0;
    const parsedTotalQty = parseFloat(totalQty) || 0;
    const parsedQtyOnOrder = parseFloat(qtyOnOrder) || 0;
    const parsedQtyToReturn = parseFloat(qtyToReturn) || 0;

    const issuedFromQOH = parsedQtyToReturn > 0 ? parsedQtyToReturn : Math.max(0, parsedTotalQty - parsedQtyOnOrder);
    const cancelledOnOrder = parsedQtyToReturn > 0 ? 0 : parsedQtyOnOrder;

    const newQOH = createInventoryReturn ? currentQOH : currentQOH + issuedFromQOH;
    const newQOO = Math.max(0, currentQOO - cancelledOnOrder);

    let hasError = false;
    let rpcErrorObj = null;

    if (issuedFromQOH > 0) {
      const txType = createInventoryReturn ? 'Returned to Supplier' : 'Returned from WO';
      const desc = createInventoryReturn
        ? `Returned ${issuedFromQOH} units to supplier from ${roNumber || 'work order'}. Reason: ${returnReason}. Notes: ${returnNotes || ''}`
        : `Returned ${issuedFromQOH} units to inventory from deleted line on ${roNumber || 'work order'}`;

      if (!createInventoryReturn) {
        // If not returning to supplier, update inventory and let trigger handle audit log
        const { error: rpcError } = await supabaseAdmin.rpc('update_inventory_with_audit', {
          p_item_id: inventoryItemId,
          p_qoh: newQOH,
          p_qoo: currentQOO,
          p_ro_number: roNumber || null,
          p_supplier_inv: null,
          p_source_action: 'autopro-processWorkOrderPartReturn',
          p_tx_type: txType,
          p_description: desc,
          p_user_id: user.id || null,
          p_user_name: user.email || null,
          p_source_record_id: workOrderId || null
        });

        if (rpcError) {
          hasError = true;
          rpcErrorObj = rpcError;
        }
      } else {
        // For Return to Supplier, QOH doesn't change on InventoryItem, so trigger won't fire.
        // We manually insert the audit log record.
        let supplierName = null;
        if (inventoryItem.supplier_id) {
          const { data: supplierData } = await supabaseAdmin
            .from('Supplier')
            .select('name')
            .eq('id', inventoryItem.supplier_id)
            .maybeSingle();
          supplierName = supplierData?.name || null;
        }

        const { error: auditError } = await supabaseAdmin
          .from('InventoryAuditLog')
          .insert([{
            id: crypto.randomUUID(),
            inventory_item_id: inventoryItemId,
            part_num: partNumber || inventoryItem.part_number || 'UNKNOWN',
            old_quantity: currentQOH,
            new_quantity: currentQOH,
            old_quantity_on_order: currentQOO,
            new_quantity_on_order: currentQOO,
            quantity_change: "0",
            quantity_ordered_change: "0",
            ro_number: roNumber || null,
            supplier_inv: null,
            supplier_name: supplierName,
            source_record_id: workOrderId || null,
            description: desc,
            tx_type: txType,
            source_function: 'autopro-processWorkOrderPartReturn',
            tx_date: new Date().toISOString(),
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            created_by_id: user.id || null,
            created_by: user.email || null
          }]);

        if (auditError) {
          console.error('Error inserting manual InventoryAuditLog:', auditError);
          hasError = true;
          rpcErrorObj = auditError;
        }
      }
    }

    if (cancelledOnOrder > 0 && !hasError) {
      const { error: rpcError } = await supabaseAdmin.rpc('update_inventory_with_audit', {
        p_item_id: inventoryItemId,
        p_qoh: newQOH, // from previous step or current
        p_qoo: newQOO,
        p_ro_number: roNumber || null,
        p_supplier_inv: null,
        p_source_action: 'autopro-processWorkOrderPartReturn',
        p_tx_type: 'Order Cancelled',
        p_description: `Cancelled ${cancelledOnOrder} on order from deleted line on ${roNumber || 'work order'}`,
        p_user_id: user.id || null,
        p_user_name: user.email || null,
        p_source_record_id: workOrderId || null
      });

      if (rpcError) {
        hasError = true;
        rpcErrorObj = rpcError;
      }
    }

    if (hasError) {
      return new Response(JSON.stringify({ 
        error: 'Failed to update inventory item', 
        details: rpcErrorObj?.message 
      }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    let inventoryReturnRecord = null;
    const { returnDate } = getMountainNow();

    if (createInventoryReturn) {
      let supplier = null;

      if (inventoryItem.supplier_id) {
        const { data: supplierData } = await supabaseAdmin
          .from('Supplier')
          .select('*')
          .eq('id', inventoryItem.supplier_id)
          .maybeSingle();
        supplier = supplierData;
      }

      // Generate a uuid for the return
      const returnId = crypto.randomUUID();

      const costPerUnit = parseFloat(costEach) || parseFloat(inventoryItem.cost) || 0;
      const corePerUnit = parseFloat(coreCostEach) || 0;

      const insertPayload = {
        id: returnId,
        part_number: partNumber || inventoryItem.part_number || 'UNKNOWN',
        description: description || inventoryItem.description || '',
        supplier: supplier?.id || inventoryItem.supplier_id || 'UNKNOWN',
        quantity_returned: parsedQtyToReturn,
        return_type: corePerUnit > 0 ? 'part_core' : 'return',
        return_reason: returnReason,
        cost_per_unit: costPerUnit,
        core_per_unit: corePerUnit,
        total_cost: (costPerUnit + corePerUnit) * parsedQtyToReturn,
        return_date: returnDate,
        status: 'On-site',
        work_order_id: workOrderId || null,
        inventory_item_id: inventoryItemId,
        notes: returnNotes || `Returned from Work Order ${roNumber || 'Unknown'}. ${returnReason}`,
        created_by_id: user.id || null,
        created_by: user.email || null,
        date_returned: returnDate,
        created_date: new Date().toISOString(),
        updated_date: new Date().toISOString()
      };

      const { data: insertedReturn, error: insertError } = await supabaseAdmin
        .from('InventoryReturn')
        .insert([insertPayload])
        .select()
        .single();

      if (insertError) {
        console.error('Error inserting InventoryReturn:', insertError);
        // Continue even if return record fails, inventory is updated.
      } else {
        inventoryReturnRecord = insertedReturn;
      }
    }

    return new Response(JSON.stringify({
      success: true,
      data: {
        inventory_item_id: inventoryItemId,
        quantity_on_hand: newQOH,
        quantity_on_order: newQOO,
        inventoryReturnRecord,
      },
    }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });

  } catch (error) {
    console.error('processWorkOrderPartReturn error:', error);
    return new Response(JSON.stringify({ error: error.message }), { 
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }
});
