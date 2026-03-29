import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';
import { createClient } from 'npm:@supabase/supabase-js@2.39.3';

function getMountainTxDate() {
  const formatter = new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'America/Edmonton',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });

  const parts = formatter.formatToParts(new Date());
  const map = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${map.year}-${map.month}-${map.day}T${map.hour}:${map.minute}:${map.second}-06:00`;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    
    // Authenticate user
    const user = await base44.auth.me();
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabaseUrl = Deno.env.get('Supabase_project_url');
    const supabaseSecret = Deno.env.get('Supabase_Secret_Key');

    if (!supabaseUrl || !supabaseSecret) {
      return Response.json({ error: 'Supabase credentials not configured' }, { status: 500 });
    }

    const supabase = createClient(supabaseUrl, supabaseSecret, {
      auth: { persistSession: false }
    });

    // Parse request body
    const { workOrderId, roNumber, lineItemId, receivedQuantity } = await req.json();

    // Validate inputs
    if ((!workOrderId && !roNumber) || !lineItemId || !receivedQuantity || receivedQuantity <= 0) {
      return Response.json({ 
        error: 'Invalid input parameters' 
      }, { status: 400 });
    }

    // Fetch the work order from Supabase
    const workOrderQuery = supabase
      .from('WorkOrder')
      .select('*')
      .limit(1);

    const { data: workOrder, error: workOrderError } = roNumber
      ? await workOrderQuery.eq('ro_number', roNumber).maybeSingle()
      : await workOrderQuery.eq('id', workOrderId).maybeSingle();

    if (workOrderError) {
      console.error('processWorkOrderPartReceive work order fetch error:', workOrderError);
      return Response.json({ error: 'Failed to fetch work order', details: workOrderError.message }, { status: 500 });
    }

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

    const resolvedInventoryItemId = lineItem.inventory_item_id;

    // Validate received quantity doesn't exceed qty_on_order
    const currentQtyOnOrder = parseFloat(lineItem.qty_on_order) || 0;
    if (receivedQuantity > currentQtyOnOrder) {
      return Response.json({ 
        error: `Cannot receive ${receivedQuantity} units. Only ${currentQtyOnOrder} units are on order for this line.` 
      }, { status: 400 });
    }

    const { data: inventoryItem, error: inventoryItemError } = await supabase
      .from('InventoryItem')
      .select('*')
      .eq('id', resolvedInventoryItemId)
      .maybeSingle();

    if (inventoryItemError) {
      console.error('processWorkOrderPartReceive inventory fetch error:', inventoryItemError);
      return Response.json({ error: 'Failed to fetch inventory item', details: inventoryItemError.message }, { status: 500 });
    }

    if (!inventoryItem) {
      return Response.json({ error: `Inventory item not found for line item id ${lineItem.id}` }, { status: 404 });
    }

    const effectiveInventoryItemId = inventoryItem.id;

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
      inventory_processed: true,
      cost_ea: inventoryItem.cost || 0
    };

    const { error: workOrderUpdateError } = await supabase
      .from('WorkOrder')
      .update({ line_items: JSON.stringify(lineItems) })
      .eq('ro_number', workOrder.ro_number);

    if (workOrderUpdateError) {
      console.error('processWorkOrderPartReceive work order update error:', workOrderUpdateError);
      return Response.json({ error: 'Failed to update work order', details: workOrderUpdateError.message }, { status: 500 });
    }

    // 2. Update the inventory item
    const newQOH = currentQOH - receivedQuantity;
    const newInventoryQOO = Math.max(0, (parseFloat(inventoryItem.quantity_on_order) || 0) - receivedQuantity);

    const inventoryUpdateResponse = await base44.functions.invoke('inventoryUpdate', {
      itemId: effectiveInventoryItemId,
      updates: {
        quantity_on_hand: newQOH,
        quantity_on_order: newInventoryQOO
      }
    });

    if (!inventoryUpdateResponse.data?.success) {
      return Response.json({
        error: 'Failed to update inventory item',
        details: inventoryUpdateResponse.data?.error || 'inventoryUpdate did not return success'
      }, { status: 500 });
    }

    // 3. Create the inventory transaction record
    const txDate = getMountainTxDate();
    const description = `Issued to ${workOrder.ro_number} - ${lineItem.description || lineItem.part_number}`;
    
    await base44.asServiceRole.entities.InventoryTxs.create({
      inventory_item_id: effectiveInventoryItemId,
      part_num: lineItem.part_number || inventoryItem.part_number,
      tx_date: txDate,
      tx_type: 'Issued to WO',
      quantity_change: -receivedQuantity,
      quantity_ordered_change: 0,
      ro_number: workOrder.ro_number,
      source_record_id: workOrder.id,
      description: description
    });

    return Response.json({
      success: true,
      message: `Successfully received ${receivedQuantity} unit(s) and issued to work order`,
      updatedLineItem: lineItems[lineItemIndex],
      newInventoryQOH: newQOH,
      newInventoryQOO: inventoryUpdateResponse.data?.data?.quantity_on_order ?? newInventoryQOO
    });

  } catch (error) {
    console.error('Error in processWorkOrderPartReceive:', error);
    return Response.json({ 
      error: error.message || 'Internal server error' 
    }, { status: 500 });
  }
});