import { createClientFromRequest } from 'npm:@base44/sdk@0.8.4';
import { format } from 'npm:date-fns@3.6.0';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();

        if (!user) {
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { workOrderId } = await req.json();

        if (!workOrderId) {
            return Response.json({ error: 'Work Order ID is required' }, { status: 400 });
        }

        // Fetch Work Order
        const workOrder = await base44.entities.WorkOrder.get(workOrderId);
        if (!workOrder) {
            return Response.json({ error: 'Work Order not found' }, { status: 404 });
        }

        // Parse line items
        let lineItems = [];
        try {
            lineItems = workOrder.line_items ? JSON.parse(workOrder.line_items) : [];
        } catch (e) {
            console.error('Error parsing line items:', e);
            return Response.json({ error: 'Invalid line items data' }, { status: 500 });
        }

        const updates = [];
        const inventoryTxs = [];
        const updatedLineItems = [];

        // Process line items for inventory updates
        for (const line of lineItems) {
            if (line.inventory_item_id && !line.inventory_processed && parseFloat(line.qty) > 0) {
                const requestedQuantity = parseFloat(line.qty);
                const inventoryItemId = line.inventory_item_id;

                try {
                    const inventoryItem = await base44.entities.InventoryItem.get(inventoryItemId);
                    if (!inventoryItem) continue;

                    const currentQOH = inventoryItem.quantity_on_hand || 0;
                    const currentQOO = inventoryItem.quantity_on_order || 0;

                    let issuedQuantity = 0;
                    let onOrderQuantity = 0;

                    if (currentQOH >= requestedQuantity) {
                        issuedQuantity = requestedQuantity;
                        onOrderQuantity = 0;
                    } else {
                        issuedQuantity = currentQOH;
                        onOrderQuantity = requestedQuantity - currentQOH;
                    }

                    const newQOH = Math.max(0, currentQOH - issuedQuantity);
                    const newQOO = currentQOO + onOrderQuantity;

                    // Queue Inventory Update
                    updates.push(base44.asServiceRole.entities.InventoryItem.update(inventoryItemId, {
                        quantity_on_hand: newQOH,
                        quantity_on_order: newQOO
                    }));

                    // Queue Inventory Transaction
                    inventoryTxs.push(base44.asServiceRole.entities.InventoryTxs.create({
                        inventory_item_id: inventoryItemId,
                        part_num: inventoryItem.part_number,
                        tx_date: new Date().toISOString(),
                        tx_type: 'Issued to WO',
                        quantity_change: -issuedQuantity,
                        quantity_ordered_change: onOrderQuantity,
                        ro_number: workOrder.ro_number,
                        source_record_id: workOrder.id,
                        description: `Issued to WO ${workOrder.ro_number} (Conversion from Estimate)`
                    }));

                    // Mark line as processed
                    updatedLineItems.push({
                        ...line,
                        qty_on_order: onOrderQuantity,
                        inventory_processed: true
                    });

                } catch (err) {
                    console.error(`Error processing inventory for item ${inventoryItemId}:`, err);
                    updatedLineItems.push(line); // Keep original if error
                }
            } else {
                updatedLineItems.push(line); // Keep original if not an unprocessed inventory item
            }
        }

        // Execute all inventory updates
        await Promise.all(updates);
        await Promise.all(inventoryTxs);

        // Update Work Order
        const updateData = {
            stage: 'work_order',
            line_items: JSON.stringify(updatedLineItems),
            wo_date: format(new Date(), 'yyyy-MM-dd')
        };

        if (!workOrder.wo_number && workOrder.ro_number) {
            const roNumericPart = workOrder.ro_number.replace(/\D/g, '');
            updateData.wo_number = `WO${roNumericPart}`;
        }

        await base44.asServiceRole.entities.WorkOrder.update(workOrderId, updateData);

        return Response.json({ success: true });

    } catch (error) {
        console.error('Error converting estimate:', error);
        return Response.json({ error: error.message }, { status: 500 });
    }
});