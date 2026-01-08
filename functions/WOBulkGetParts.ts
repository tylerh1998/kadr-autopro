import { createClientFromRequest } from 'npm:@base44/sdk@0.7.1';

export default Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();

        if (!user) {
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const body = await req.json();
        const {
            items,
            workOrderId,
            roNumber
        } = body;

        // Validate inputs
        if (!items || !Array.isArray(items) || items.length === 0 || !workOrderId || !roNumber) {
            return Response.json({
                success: false,
                message: 'Missing required parameters'
            }, { status: 400 });
        }

        const rollbackActions = [];
        const results = [];

        try {
            // Process items sequentially
            for (const item of items) {
                const { inventoryItemId, requestedQuantity, lineDescription, linePartNumber } = item;
                
                // Fetch the inventory item
                const inventoryItem = await base44.asServiceRole.entities.InventoryItem.get(inventoryItemId);
                
                if (!inventoryItem) {
                    throw new Error(`Inventory item not found: ${inventoryItemId}`);
                }

                const originalQOH = inventoryItem.quantity_on_hand || 0;
                const originalQOO = inventoryItem.quantity_on_order || 0;

                // Calculate quantities to issue and order
                const qty_to_issue = Math.min(requestedQuantity, originalQOH);
                const qty_to_order = Math.max(0, requestedQuantity - qty_to_issue);

                // Calculate new values
                const updatedQOH = originalQOH - qty_to_issue;
                const updatedQOO = originalQOO + qty_to_order;

                // Update the inventory item
                await base44.asServiceRole.entities.InventoryItem.update(inventoryItemId, {
                    quantity_on_hand: updatedQOH,
                    quantity_on_order: updatedQOO
                });

                // Add to rollback actions
                rollbackActions.push({
                    type: 'update_inventory',
                    id: inventoryItemId,
                    originalQOH,
                    originalQOO
                });

                const now = new Date().toISOString();
                const partNum = linePartNumber || inventoryItem.part_number;
                const description = lineDescription || inventoryItem.description;

                // Create InventoryTxs record for issued quantity (if any)
                if (qty_to_issue > 0) {
                    const tx = await base44.asServiceRole.entities.InventoryTxs.create({
                        inventory_item_id: inventoryItemId,
                        ro_number: roNumber,
                        part_num: partNum,
                        tx_date: now,
                        tx_type: 'Issued to WO',
                        quantity_change: -qty_to_issue,
                        quantity_ordered_change: 0,
                        source_record_id: workOrderId,
                        description: `Issued to WO ${roNumber} - ${description}`
                    });
                    
                    rollbackActions.push({
                        type: 'delete_tx',
                        id: tx.id
                    });
                }

                // Create InventoryTxs record for ordered quantity (if any)
                if (qty_to_order > 0) {
                    const tx = await base44.asServiceRole.entities.InventoryTxs.create({
                        inventory_item_id: inventoryItemId,
                        ro_number: roNumber,
                        part_num: partNum,
                        tx_date: now,
                        tx_type: 'Ordered',
                        quantity_change: 0,
                        quantity_ordered_change: qty_to_order,
                        source_record_id: workOrderId,
                        supplier_id: inventoryItem.supplier_id,
                        description: `Ordered for WO ${roNumber} - ${description}`
                    });

                    rollbackActions.push({
                        type: 'delete_tx',
                        id: tx.id
                    });
                }

                results.push({
                    inventoryItemId,
                    issuedQuantity: qty_to_issue,
                    onOrderQuantity: qty_to_order,
                    newInventoryQOH: updatedQOH,
                    newInventoryQOO: updatedQOO,
                    cost: inventoryItem.cost || 0,
                    // Pass through original item details needed for line item construction if needed, 
                    // though frontend usually has them.
                    unit: inventoryItem.unit,
                    part_number: inventoryItem.part_number,
                    description: inventoryItem.description,
                    core: inventoryItem.core,
                    core_cost: inventoryItem.core_cost,
                    tag_along_id: inventoryItem.tag_along_id
                });
            }

            // All succeeded
            return Response.json({
                success: true,
                message: 'All parts processed successfully',
                results
            });

        } catch (processError) {
            console.error('Error during bulk processing, initiating rollback:', processError);

            // Execute rollback actions in reverse order
            for (let i = rollbackActions.length - 1; i >= 0; i--) {
                const action = rollbackActions[i];
                try {
                    if (action.type === 'update_inventory') {
                        await base44.asServiceRole.entities.InventoryItem.update(action.id, {
                            quantity_on_hand: action.originalQOH,
                            quantity_on_order: action.originalQOO
                        });
                    } else if (action.type === 'delete_tx') {
                        await base44.asServiceRole.entities.InventoryTxs.delete(action.id);
                    }
                } catch (rollbackError) {
                    console.error('Critical Rollback Error:', rollbackError, 'Action:', action);
                    // Continue attempting other rollbacks even if one fails
                }
            }

            return Response.json({
                success: false,
                message: processError.message || 'Transaction failed, changes reverted'
            }, { status: 500 });
        }

    } catch (error) {
        console.error('Error in WOBulkGetParts:', error);
        return Response.json({
            success: false,
            message: error.message || 'An error occurred while processing parts'
        }, { status: 500 });
    }
});