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

        // Fetch Suppliers for lookup
        let supplierMap = new Map();
        try {
            const suppliers = await base44.entities.Supplier.list();
            supplierMap = new Map(suppliers.map(s => [s.id, s.name]));
        } catch (e) {
            console.error('Error fetching suppliers:', e);
        }

        // Parse line items
        let lineItems = [];
        try {
            lineItems = workOrder.line_items ? JSON.parse(workOrder.line_items) : [];
        } catch (e) {
            console.error('Error parsing line items:', e);
            return Response.json({ error: 'Invalid line items data' }, { status: 500 });
        }

        const updatedLineItems = [];

        // Process line items for inventory updates sequentially
        for (const line of lineItems) {
            if (line.inventory_item_id && !line.inventory_processed && parseFloat(line.qty) > 0) {
                const requestedQuantity = parseFloat(line.qty);
                const inventoryItemId = line.inventory_item_id;

                try {
                    // Fetch fresh inventory item
                    const inventoryItem = await base44.entities.InventoryItem.get(inventoryItemId);
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
                        // Scenario 1: Sufficient QOH
                        qtyTakenFromHand = requestedQuantity;
                        qtyPlacedOnOrder = 0;
                    } else if (currentQOH > 0) {
                        // Scenario 2: Partial QOH
                        qtyTakenFromHand = currentQOH;
                        qtyPlacedOnOrder = requestedQuantity - currentQOH;
                    } else {
                        // Scenario 3: No QOH
                        qtyTakenFromHand = 0;
                        qtyPlacedOnOrder = requestedQuantity;
                    }

                    // Prepare Inventory Update
                    const updateData = {};
                    if (qtyTakenFromHand > 0) {
                        updateData.quantity_on_hand = currentQOH - qtyTakenFromHand;
                    }
                    if (qtyPlacedOnOrder > 0) {
                        updateData.quantity_on_order = currentQOO + qtyPlacedOnOrder;
                    }

                    // Perform Inventory Update if needed
                    if (Object.keys(updateData).length > 0) {
                        await base44.asServiceRole.entities.InventoryItem.update(inventoryItemId, updateData);
                    }

                    // Create Transaction for Taking from Hand
                    if (qtyTakenFromHand > 0) {
                        await base44.asServiceRole.entities.InventoryTxs.create({
                            inventory_item_id: inventoryItemId,
                            part_num: inventoryItem.part_number,
                            tx_date: new Date().toISOString(),
                            tx_type: 'Issued to WO',
                            quantity_change: -qtyTakenFromHand,
                            quantity_ordered_change: 0,
                            ro_number: workOrder.ro_number,
                            source_record_id: workOrder.id,
                            description: `Allocated ${qtyTakenFromHand} to WO ${workOrder.ro_number} (Conversion)`
                        });
                    }

                    // Create Transaction for Placing on Order
                    if (qtyPlacedOnOrder > 0) {
                        const supplierName = supplierMap.get(inventoryItem.supplier_id) || '';
                        
                        await base44.asServiceRole.entities.InventoryTxs.create({
                            inventory_item_id: inventoryItemId,
                            part_num: inventoryItem.part_number,
                            tx_date: new Date().toISOString(),
                            tx_type: 'Ordered',
                            quantity_change: 0,
                            quantity_ordered_change: qtyPlacedOnOrder,
                            ro_number: workOrder.ro_number,
                            source_record_id: workOrder.id,
                            supplier_name: supplierName,
                            description: `Placed ${qtyPlacedOnOrder} on order for WO ${workOrder.ro_number} (Conversion)`
                        });
                    }

                    // Mark line as processed with updated qty_on_order
                    updatedLineItems.push({
                        ...line,
                        qty_on_order: qtyPlacedOnOrder,
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