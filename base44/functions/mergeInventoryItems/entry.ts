import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';
import { createClient } from 'npm:@supabase/supabase-js@2.39.3';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabaseUrl = Deno.env.get('Supabase_project_url');
    const supabaseSecret = Deno.env.get('Supabase_Secret_Key');
    if (!supabaseUrl || !supabaseSecret) {
      return Response.json({ error: 'Supabase credentials missing' }, { status: 500 });
    }

    const supabase = createClient(supabaseUrl, supabaseSecret, { auth: { persistSession: false } });

    // Parse payload
    const body = await req.json();
    const { masterId, duplicateId } = body;

    if (!masterId || !duplicateId) {
      return Response.json({ error: 'masterId and duplicateId are required' }, { status: 400 });
    }

    if (masterId === duplicateId) {
      return Response.json({ error: 'Cannot merge an item into itself' }, { status: 400 });
    }

    // 1. Fetch Master and Duplicate Items from Supabase
    const [masterItemResult, duplicateItemResult] = await Promise.all([
        supabase.from('InventoryItem').select('*').eq('id', masterId).single(),
        supabase.from('InventoryItem').select('*').eq('id', duplicateId).single()
    ]);

    const masterItem = masterItemResult.data;
    const duplicateItem = duplicateItemResult.data;

    if (!masterItem) {
      return Response.json({ error: 'Master item not found' }, { status: 404 });
    }
    if (!duplicateItem) {
      return Response.json({ error: 'Duplicate item not found' }, { status: 404 });
    }
    
    // Check if duplicate is already merged
    if (duplicateItem.master_inventory_item_id) {
       return Response.json({ error: 'Duplicate item is already merged' }, { status: 400 });
    }

    const logs = [];
    logs.push(`Merging duplicate item ${duplicateItem.part_number} (${duplicateId}) into master item ${masterItem.part_number} (${masterId})`);

    // 2. Update Work Orders in Supabase
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

    // 3. Update Inventory Transactions (InventoryTxs) - Still in Base44
    const txsToUpdate = await base44.entities.InventoryTxs.filter({
        inventory_item_id: duplicateId
    });
    
    logs.push(`Found ${txsToUpdate.length} inventory transactions to update`);

    for (const tx of txsToUpdate) {
        await base44.entities.InventoryTxs.update(tx.id, {
            inventory_item_id: masterId,
            part_num: masterItem.part_number
        });
    }

    // 4. Update Master Inventory Item in Supabase
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

    // 5. Update Duplicate Inventory Item in Supabase
    await supabase.from('InventoryItem').update({
        is_active: false,
        master_inventory_item_id: masterId,
        quantity_on_hand: 0,
        quantity_on_order: 0
    }).eq('id', duplicateId);
    
    logs.push(`Updated Duplicate Item: Marked inactive, QOH set to 0, linked to master`);

    return Response.json({ 
        success: true, 
        message: 'Merge completed successfully',
        logs 
    });

  } catch (error) {
    console.error('Merge error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});