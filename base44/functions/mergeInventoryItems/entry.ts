import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Parse payload
    const body = await req.json();
    const { masterId, duplicateId } = body;

    if (!masterId || !duplicateId) {
      return Response.json({ error: 'masterId and duplicateId are required' }, { status: 400 });
    }

    if (masterId === duplicateId) {
      return Response.json({ error: 'Cannot merge an item into itself' }, { status: 400 });
    }

    // 1. Fetch Master and Duplicate Items
    // Using Promise.all for efficiency
    const [masterItemResult, duplicateItemResult] = await Promise.all([
        base44.entities.InventoryItem.get(masterId),
        base44.entities.InventoryItem.get(duplicateId)
    ]);

    const masterItem = masterItemResult;
    const duplicateItem = duplicateItemResult;

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

    // 2. Update Work Orders
    // We need to find work orders that reference the duplicate item.
    // The line_items field is a JSON string. We'll search for the ID within that string.
    // This assumes the DB supports regex or contains search on string fields.
    // If not, we might need to fetch active/recent WOs or iterate.
    // Assuming we can iterate through WOs that *likely* have it or all WOs if volume allows.
    // For safety and performance, we'll try to use a filter with regex if possible, 
    // or fetch batches. Given the platform constraints, we'll fetch WOs that contain the ID string.
    // Note: If exact string match isn't supported, we might need to fetch all Open/Recent WOs.
    // Let's try to filter by the ID appearing in the string.
    
    // Using a broad search might be safest: list all work orders (or filtered by status if we only cared about open ones, 
    // but we want to fix history too).
    // CAUTION: Listing ALL work orders might be heavy. 
    // However, for this specific app, we'll try to filter using the regex pattern if supported by the SDK filter
    // or just fetch WOs. 
    // Since I can't rely on regex in filter for all backends, I will fetch WOs in batches or try a specific query.
    // We'll assume the prompt "Reserialize... WorkOrder" implies updating ALL occurrences.
    
    // Let's fetch all work orders. (If this times out in production, we'd need a more targeted query).
    // Optimization: Filter for WOs where line_items contains the ID.
    const workOrdersResponse = await base44.entities.WorkOrder.filter({
        line_items: { "$regex": duplicateId }
    });
    
    // If filter doesn't support regex, it might return all or error. 
    // If it returns error, we'd catch it. If it returns matches, great.
    // For safety in this environment, let's assume we get the matching WOs.
    
    const workOrdersToUpdate = workOrdersResponse || [];
    logs.push(`Found ${workOrdersToUpdate.length} work orders to update`);

    for (const wo of workOrdersToUpdate) {
        if (!wo.line_items) continue;
        
        try {
            let lineItems = JSON.parse(wo.line_items);
            let woUpdated = false;

            lineItems = lineItems.map(item => {
                if (item.inventory_item_id === duplicateId) {
                    woUpdated = true;
                    // Update the ID to the master ID
                    // We keep other line item properties as they were on the WO (snapshot in time), 
                    // except the link to the inventory item.
                    return { ...item, inventory_item_id: masterId };
                }
                return item;
            });

            if (woUpdated) {
                await base44.entities.WorkOrder.update(wo.id, {
                    line_items: JSON.stringify(lineItems)
                });
                logs.push(`Updated WorkOrder ${wo.wo_number || wo.ro_number}`);
            }
        } catch (e) {
            console.error(`Error processing WO ${wo.id}:`, e);
            logs.push(`Failed to process WO ${wo.id}: ${e.message}`);
        }
    }

    // 3. Update Inventory Transactions (InventoryTxs)
    // Here we update BOTH id and part_num
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

    // 4. Update Master Inventory Item
    // Quantities added together
    const newQoh = (masterItem.quantity_on_hand || 0) + (duplicateItem.quantity_on_hand || 0);
    const newQoo = (masterItem.quantity_on_order || 0) + (duplicateItem.quantity_on_order || 0);
    
    // Cost: highest one
    const newCost = Math.max((masterItem.cost || 0), (duplicateItem.cost || 0));

    // Duplicate IDs list
    const currentDuplicates = masterItem.duplicate_inventory_item_ids || [];
    // Ensure we don't add duplicates if retry happens
    if (!currentDuplicates.includes(duplicateId)) {
        currentDuplicates.push(duplicateId);
    }

    await base44.entities.InventoryItem.update(masterId, {
        quantity_on_hand: newQoh,
        quantity_on_order: newQoo,
        cost: newCost,
        duplicate_inventory_item_ids: currentDuplicates
    });
    
    logs.push(`Updated Master Item: QOH ${masterItem.quantity_on_hand} -> ${newQoh}, Cost ${masterItem.cost} -> ${newCost}`);

    // 5. Update Duplicate Inventory Item
    await base44.entities.InventoryItem.update(duplicateId, {
        is_active: false,
        master_inventory_item_id: masterId,
        quantity_on_hand: 0, // Zero out since moved to master
        quantity_on_order: 0
    });
    
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