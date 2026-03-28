import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';
import { createClient } from 'npm:@supabase/supabase-js@2.39.3';

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
      return Response.json({ error: 'Supabase credentials not configured' }, { status: 500 });
    }

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
    } = body || {};

    if (!inventoryItemId) {
      return Response.json({ error: 'inventoryItemId is required' }, { status: 400 });
    }

    const supabase = createClient(supabaseUrl, supabaseSecret, {
      auth: { persistSession: false },
    });

    const { data: inventoryItem, error: inventoryError } = await supabase
      .from('InventoryItem')
      .select('*')
      .eq('id', inventoryItemId)
      .single();

    if (inventoryError || !inventoryItem) {
      return Response.json({ error: 'Inventory item not found', details: inventoryError?.message }, { status: 404 });
    }

    const currentQOH = parseFloat(inventoryItem.quantity_on_hand) || 0;
    const currentQOO = parseFloat(inventoryItem.quantity_on_order) || 0;
    const parsedTotalQty = parseFloat(totalQty) || 0;
    const parsedQtyOnOrder = parseFloat(qtyOnOrder) || 0;
    const parsedQtyToReturn = parseFloat(qtyToReturn) || 0;

    const issuedFromQOH = parsedQtyToReturn > 0 ? parsedQtyToReturn : Math.max(0, parsedTotalQty - parsedQtyOnOrder);
    const cancelledOnOrder = parsedQtyToReturn > 0 ? 0 : parsedQtyOnOrder;

    const newQOH = currentQOH + issuedFromQOH;
    const newQOO = Math.max(0, currentQOO - cancelledOnOrder);

    const inventoryUpdateResponse = await base44.functions.invoke('inventoryUpdate', {
      itemId: inventoryItemId,
      updates: {
        quantity_on_hand: newQOH,
        quantity_on_order: newQOO,
      },
    });

    if (!inventoryUpdateResponse.data?.success) {
      return Response.json({
        error: 'Failed to update inventory item',
        details: inventoryUpdateResponse.data?.error || 'inventoryUpdate did not return success',
      }, { status: 500 });
    }

    const { txDateTime, returnDate } = getMountainNow();
    const txResults = [];

    if (issuedFromQOH > 0) {
      const returnedTx = await base44.entities.InventoryTxs.create({
        inventory_item_id: inventoryItemId,
        part_num: partNumber || inventoryItem.part_number,
        tx_date: txDateTime,
        tx_type: 'Returned from WO',
        quantity_change: issuedFromQOH,
        quantity_ordered_change: 0,
        ro_number: roNumber || '',
        source_record_id: workOrderId || '',
        description: createInventoryReturn
          ? `Returned ${issuedFromQOH} units to inventory from ${roNumber || 'work order'}. Reason: ${returnReason}. Notes: ${returnNotes || ''}`
          : `Returned ${issuedFromQOH} units to inventory from deleted line on ${roNumber || 'work order'}`,
      });
      txResults.push(returnedTx);
    }

    if (cancelledOnOrder > 0) {
      const cancelledTx = await base44.entities.InventoryTxs.create({
        inventory_item_id: inventoryItemId,
        part_num: partNumber || inventoryItem.part_number,
        tx_date: txDateTime,
        tx_type: 'Order Cancelled',
        quantity_change: 0,
        quantity_ordered_change: -cancelledOnOrder,
        ro_number: roNumber || '',
        source_record_id: workOrderId || '',
        description: `Cancelled ${cancelledOnOrder} on order from deleted line on ${roNumber || 'work order'}`,
      });
      txResults.push(cancelledTx);
    }

    let inventoryReturnRecord = null;

    if (createInventoryReturn) {
      let supplier = null;

      if (inventoryItem.supplier_id) {
        const { data: supplierData } = await supabase
          .from('Supplier')
          .select('*')
          .eq('id', inventoryItem.supplier_id)
          .maybeSingle();
        supplier = supplierData;
      }

      inventoryReturnRecord = await base44.entities.InventoryReturn.create({
        part_number: partNumber || inventoryItem.part_number || 'UNKNOWN',
        description: description || inventoryItem.description || '',
        supplier: supplier?.id || inventoryItem.supplier_id || 'UNKNOWN',
        quantity_returned: parsedQtyToReturn,
        return_type: 'return',
        return_reason: returnReason,
        cost_per_unit: parseFloat(costEach) || parseFloat(inventoryItem.cost) || 0,
        total_cost: (parseFloat(costEach) || parseFloat(inventoryItem.cost) || 0) * parsedQtyToReturn,
        return_date: returnDate,
        status: 'On-site',
        work_order_id: workOrderId || '',
        inventory_item_id: inventoryItemId,
        notes: returnNotes || `Returned from Work Order ${roNumber || 'Unknown'}. ${returnReason}`,
      });
    }

    return Response.json({
      success: true,
      data: {
        inventory_item_id: inventoryItemId,
        quantity_on_hand: newQOH,
        quantity_on_order: newQOO,
        inventoryReturnRecord,
        txResults,
      },
    });
  } catch (error) {
    console.error('processWorkOrderPartReturn error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});