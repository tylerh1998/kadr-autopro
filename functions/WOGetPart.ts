import { createClientFromRequest } from 'npm:@base44/sdk@0.7.1';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();

        if (!user) {
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const body = await req.json();
        const {
            inventoryItemId,
            requestedQuantity,
            workOrderId,
            roNumber,
            lineDescription,
            linePartNumber
        } = body;

        // Validate inputs
        if (!inventoryItemId || !requestedQuantity || !workOrderId || !roNumber) {
            return Response.json({
                success: false,
                message: 'Missing required parameters'
            }, { status: 400 });
        }

        // Fetch the inventory item
        const inventoryItem = await base44.asServiceRole.entities.InventoryItem.get(inventoryItemId);
        
        if (!inventoryItem) {
            return Response.json({
                success: false,
                message: 'Inventory item not found'
            }, { status: 404 });
        }

        // Calculate quantities to issue and order
        const currentQOH = inventoryItem.quantity_on_hand || 0;
        const currentQOO = inventoryItem.quantity_on_order || 0;
        const qty_to_issue = Math.min(requestedQuantity, currentQOH);
        const qty_to_order = Math.max(0, requestedQuantity - qty_to_issue);

        // Calculate new values
        const updatedQOH = currentQOH - qty_to_issue;
        const updatedQOO = currentQOO + qty_to_order;

        // Update the inventory item
        await base44.asServiceRole.entities.InventoryItem.update(inventoryItemId, {
            quantity_on_hand: updatedQOH,
            quantity_on_order: updatedQOO
        });

        const now = new Date().toISOString();
        const partNum = linePartNumber || inventoryItem.part_number;
        const description = lineDescription || inventoryItem.description;

        // Create InventoryTxs record for issued quantity (if any)
        if (qty_to_issue > 0) {
            await base44.asServiceRole.entities.InventoryTxs.create({
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
        }

        // Create InventoryTxs record for ordered quantity (if any)
        if (qty_to_order > 0) {
            await base44.asServiceRole.entities.InventoryTxs.create({
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
        }

        return Response.json({
            success: true,
            message: 'Inventory adjusted successfully',
            issuedQuantity: qty_to_issue,
            onOrderQuantity: qty_to_order,
            newInventoryQOH: updatedQOH,
            newInventoryQOO: updatedQOO
        });

    } catch (error) {
        console.error('Error in WOGetPart:', error);
        return Response.json({
            success: false,
            message: error.message || 'An error occurred while adjusting inventory'
        }, { status: 500 });
    }
});