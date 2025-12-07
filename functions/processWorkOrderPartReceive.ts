import { createClientFromRequest } from 'npm:@base44/sdk@0.8.4';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    
    // Authenticate user
    const user = await base44.auth.me();
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Parse request body
    const { workOrderId, lineItemId, receivedQuantity } = await req.json();

    // Validate inputs
    if (!workOrderId || !lineItemId || !receivedQuantity || receivedQuantity <= 0) {
      return Response.json({ 
        error: 'Invalid input parameters' 
      }, { status: 400 });
    }

    // Fetch the work order
    const workOrder = await base44.entities.WorkOrder.get(workOrderId);
    if (!workOrder) {
      return Response.json({ error: 'Work order not found' }, { status: 404 });
    }

    // Parse line items from work order
    let lineItems = [];
    try {
      lineItems = JSON.parse(workOrder.line_items || '[]');
    } catch (e) {
      return Response.json({ error: 'Failed to parse work order line items' }, { status: 500 });
    }

    // Find the specific line item
    const lineItemIndex = lineItems.findIndex(item => item.id === lineItemId);
    if (lineItemIndex === -1) {
      return Response.json({ error: 'Line item not found in work order' }, { status: 404 });
    }

    const lineItem = lineItems[lineItemIndex];

    // Validate that line item has an inventory item
    if (!lineItem.inventory_item_id) {
      return Response.json({ 
        error: 'Line item does not have an associated inventory item' 
      }, { status: 400 });
    }

    // Validate received quantity doesn't exceed qty_on_order
    const currentQtyOnOrder = parseFloat(lineItem.qty_on_order) || 0;
    if (receivedQuantity > currentQtyOnOrder) {
      return Response.json({ 
        error: `Cannot receive ${receivedQuantity} units. Only ${currentQtyOnOrder} units are on order for this line.` 
      }, { status: 400 });
    }

    // Fetch the inventory item
    const inventoryItem = await base44.entities.InventoryItem.get(lineItem.inventory_item_id);
    if (!inventoryItem) {
      return Response.json({ error: 'Inventory item not found' }, { status: 404 });
    }

    // Validate inventory has sufficient quantity on hand
    const currentQOH = parseFloat(inventoryItem.quantity_on_hand) || 0;
    if (currentQOH < receivedQuantity) {
      return Response.json({ 
        error: `Insufficient inventory. Only ${currentQOH} units available in stock.` 
      }, { status: 400 });
    }

    // Perform updates
    
    // 1. Update the line item in the work order
    const newQtyOnOrder = Math.max(0, currentQtyOnOrder - receivedQuantity);
    lineItems[lineItemIndex] = {
      ...lineItem,
      qty_on_order: newQtyOnOrder,
      inventory_processed: true
    };

    await base44.asServiceRole.entities.WorkOrder.update(workOrderId, {
      line_items: JSON.stringify(lineItems)
    });

    // 2. Update the inventory item
    const newQOH = currentQOH - receivedQuantity;
    await base44.asServiceRole.entities.InventoryItem.update(lineItem.inventory_item_id, {
      quantity_on_hand: newQOH
    });

    // 3. Create the inventory transaction record
    const txDate = new Date().toISOString();
    const description = `Issued to WO ${workOrder.ro_number} - ${lineItem.description || lineItem.part_number}`;
    
    await base44.asServiceRole.entities.InventoryTxs.create({
      inventory_item_id: lineItem.inventory_item_id,
      part_num: lineItem.part_number || inventoryItem.part_number,
      tx_date: txDate,
      tx_type: 'Issued to Work Order',
      quantity_change: -receivedQuantity,
      quantity_ordered_change: 0,
      ro_number: workOrder.ro_number,
      source_record_id: workOrderId,
      description: description
    });

    return Response.json({
      success: true,
      message: `Successfully received ${receivedQuantity} unit(s) and issued to work order`,
      updatedLineItem: lineItems[lineItemIndex],
      newInventoryQOH: newQOH
    });

  } catch (error) {
    console.error('Error in processWorkOrderPartReceive:', error);
    return Response.json({ 
      error: error.message || 'Internal server error' 
    }, { status: 500 });
  }
});