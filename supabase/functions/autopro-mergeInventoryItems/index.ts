import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS, PUT, DELETE',
};

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!supabaseUrl || !supabaseServiceKey) {
      return new Response(JSON.stringify({ error: 'Missing Supabase configuration' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json', ...corsHeaders }
      });
    }

    // Initialize Supabase client with service role for guaranteed updates
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get Auth Token
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Missing Authorization header' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json', ...corsHeaders }
      });
    }

    const token = authHeader.replace(/^Bearer\s+/i, '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized', details: authError?.message }), {
        status: 401,
        headers: { 'Content-Type': 'application/json', ...corsHeaders }
      });
    }

    // Parse payload
    let bodyData;
    try {
      bodyData = await req.json();
    } catch (jsonError) {
      console.error('Error parsing request JSON:', jsonError);
      return new Response(JSON.stringify({ error: 'Invalid JSON payload', details: jsonError.message }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', ...corsHeaders }
      });
    }

    const payload = bodyData.body || bodyData;
    const { masterId, duplicateId } = payload;

    if (!masterId || !duplicateId) {
      return new Response(JSON.stringify({ error: 'masterId and duplicateId are required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', ...corsHeaders }
      });
    }

    if (masterId === duplicateId) {
      return new Response(JSON.stringify({ error: 'Cannot merge an item into itself' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', ...corsHeaders }
      });
    }

    const logs = [];
    logs.push(`Starting merge: duplicate ${duplicateId} into master ${masterId}`);

    // 1. Fetch Master and Duplicate Items
    const [masterItemResult, duplicateItemResult] = await Promise.all([
        supabase.from('InventoryItem').select('*').eq('id', masterId).single(),
        supabase.from('InventoryItem').select('*').eq('id', duplicateId).single()
    ]);

    const masterItem = masterItemResult.data;
    const duplicateItem = duplicateItemResult.data;

    if (!masterItem) {
      return new Response(JSON.stringify({ error: 'Master item not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json', ...corsHeaders }
      });
    }
    if (!duplicateItem) {
      return new Response(JSON.stringify({ error: 'Duplicate item not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json', ...corsHeaders }
      });
    }
    
    // Check if duplicate is already merged
    if (duplicateItem.master_inventory_item_id) {
      return new Response(JSON.stringify({ error: 'Duplicate item is already merged' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', ...corsHeaders }
      });
    }

    // 2. Update Work Orders
    const { data: allWorkOrders, error: woError } = await supabase
      .from('WorkOrder')
      .select('id, wo_number, ro_number, line_items')
      .not('line_items', 'is', null);

    if (woError) {
      console.error("Error fetching work orders:", woError);
      logs.push(`Error fetching work orders: ${woError.message}`);
    } else {
      const workOrdersToUpdate = (allWorkOrders || []).filter(wo => {
          try {
              const itemsStr = typeof wo.line_items === 'string' ? wo.line_items : JSON.stringify(wo.line_items);
              return itemsStr.includes(duplicateId);
          } catch(e) {
              return false;
          }
      });
      logs.push(`Found ${workOrdersToUpdate.length} work orders to update`);

      for (const wo of workOrdersToUpdate) {
          if (!wo.line_items) continue;
          
          try {
              let lineItems = typeof wo.line_items === 'string' ? JSON.parse(wo.line_items) : wo.line_items;
              let woUpdated = false;

              lineItems = lineItems.map(item => {
                  if (item.inventory_item_id === duplicateId) {
                      woUpdated = true;
                      return { ...item, inventory_item_id: masterId };
                  }
                  return item;
              });

              if (woUpdated) {
                  await supabase.from('WorkOrder').update({
                      line_items: lineItems
                  }).eq('id', wo.id);
                  logs.push(`Updated WorkOrder ${wo.wo_number || wo.ro_number}`);
              }
          } catch (e) {
              console.error(`Error processing WO ${wo.id}:`, e);
              logs.push(`Failed to process WO ${wo.id}: ${e.message}`);
          }
      }
    }

    // 3. Update Audit Logs and Supplier Invoices natively
    const { error: auditError } = await supabase
      .from('InventoryAuditLog')
      .update({ inventory_item_id: masterId })
      .eq('inventory_item_id', duplicateId);
      
    if (auditError) {
      logs.push(`Error updating InventoryAuditLog: ${auditError.message}`);
    } else {
      logs.push(`Updated InventoryAuditLog references`);
    }

    const { error: invoiceError } = await supabase
      .from('SupplierInvoiceLine')
      .update({ inventory_item_id: masterId })
      .eq('inventory_item_id', duplicateId);

    if (invoiceError) {
      logs.push(`Error updating SupplierInvoiceLine: ${invoiceError.message}`);
    } else {
      logs.push(`Updated SupplierInvoiceLine references`);
    }

    // 4. Update Master Inventory Item
    const newQoh = (masterItem.quantity_on_hand || 0) + (duplicateItem.quantity_on_hand || 0);
    const newQoo = (masterItem.quantity_on_order || 0) + (duplicateItem.quantity_on_order || 0);
    const newCost = Math.max((masterItem.cost || 0), (duplicateItem.cost || 0));

    let currentDuplicates = masterItem.duplicate_inventory_item_ids;
    if (typeof currentDuplicates === 'string') {
        try { currentDuplicates = JSON.parse(currentDuplicates); } catch (e) { currentDuplicates = []; }
    }
    if (!Array.isArray(currentDuplicates)) currentDuplicates = [];

    if (!currentDuplicates.includes(duplicateId)) {
        currentDuplicates.push(duplicateId);
    }

    await supabase.from('InventoryItem').update({
        quantity_on_hand: newQoh,
        quantity_on_order: newQoo,
        cost: newCost,
        duplicate_inventory_item_ids: currentDuplicates
    }).eq('id', masterId);
    
    logs.push(`Updated Master Item: QOH ${masterItem.quantity_on_hand} -> ${newQoh}, Cost ${masterItem.cost} -> ${newCost}`);

    // 5. Update Duplicate Inventory Item
    await supabase.from('InventoryItem').update({
        is_active: false,
        master_inventory_item_id: masterId,
        quantity_on_hand: 0,
        quantity_on_order: 0
    }).eq('id', duplicateId);
    
    logs.push(`Updated Duplicate Item: Marked inactive, QOH set to 0, linked to master`);

    return new Response(JSON.stringify({ 
        success: true, 
        message: 'Merge completed successfully',
        logs 
    }), {
        status: 200,
        headers: { 'Content-Type': 'application/json', ...corsHeaders }
    });

  } catch (error) {
    console.error('Merge error:', error);
    return new Response(JSON.stringify({ error: error.message || 'Unknown error' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json', ...corsHeaders }
    });
  }
});
