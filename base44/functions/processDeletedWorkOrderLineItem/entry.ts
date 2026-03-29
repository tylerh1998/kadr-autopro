import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';
import { createClient } from 'npm:@supabase/supabase-js@2.39.3';

function getMountainTimestampParts() {
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
  const dateTime = `${map.year}-${map.month}-${map.day}T${map.hour}:${map.minute}:${map.second}`;
  return {
    txDate: `${dateTime}-06:00`,
  };
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { inventoryItemId, workOrderId, roNumber, partNumber, totalQty = 0, qtyOnOrder = 0 } = await req.json();

    if (!inventoryItemId) {
      return Response.json({ error: 'inventoryItemId is required' }, { status: 400 });
    }

    const parsedTotalQty = parseFloat(totalQty) || 0;
    const parsedQtyOnOrder = parseFloat(qtyOnOrder) || 0;
    const qtyToReturnToStock = Math.max(0, parsedTotalQty - parsedQtyOnOrder);
    const qtyToCancelOnOrder = Math.max(0, parsedQtyOnOrder);

    if (qtyToReturnToStock === 0 && qtyToCancelOnOrder === 0) {
      return Response.json({
        success: true,
        data: {
          quantity_on_hand_change: 0,
          quantity_on_order_change: 0,
          txs_created: 0,
        },
      });
    }

    const supabaseUrl = Deno.env.get('Supabase_project_url');
    const supabaseSecret = Deno.env.get('Supabase_Secret_Key');
    const supabase = createClient(supabaseUrl, supabaseSecret, { auth: { persistSession: false } });

    const { data: inventoryItem, error: inventoryError } = await supabase
      .from('InventoryItem')
      .select('*')
      .eq('id', inventoryItemId)
      .maybeSingle();

    if (inventoryError || !inventoryItem) {
      return Response.json({ error: 'Inventory item not found', details: inventoryError?.message }, { status: 404 });
    }

    const currentQOH = parseFloat(inventoryItem.quantity_on_hand) || 0;
    const currentQOO = parseFloat(inventoryItem.quantity_on_order) || 0;
    const newQOH = currentQOH + qtyToReturnToStock;
    const newQOO = Math.max(0, currentQOO - qtyToCancelOnOrder);

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

    const { txDate } = getMountainTimestampParts();
    const txs = [];
    const resolvedPartNumber = partNumber || inventoryItem.part_number || '';

    if (qtyToReturnToStock > 0) {
      txs.push(await base44.entities.InventoryTxs.create({
        inventory_item_id: inventoryItemId,
        ro_number: roNumber || '',
        part_num: resolvedPartNumber,
        tx_date: txDate,
        tx_type: 'Returned from WO',
        quantity_change: qtyToReturnToStock,
        quantity_ordered_change: 0,
        source_record_id: workOrderId || '',
        description: `Returned ${qtyToReturnToStock} units to inventory from deleted line on ${roNumber || 'work order'}`,
      }));
    }

    if (qtyToCancelOnOrder > 0) {
      txs.push(await base44.entities.InventoryTxs.create({
        inventory_item_id: inventoryItemId,
        ro_number: roNumber || '',
        part_num: resolvedPartNumber,
        tx_date: txDate,
        tx_type: 'Order Cancelled',
        quantity_change: 0,
        quantity_ordered_change: -qtyToCancelOnOrder,
        source_record_id: workOrderId || '',
        description: `Cancelled ${qtyToCancelOnOrder} on order from deleted line on ${roNumber || 'work order'}`,
      }));
    }

    return Response.json({
      success: true,
      data: {
        quantity_on_hand: newQOH,
        quantity_on_order: newQOO,
        quantity_on_hand_change: qtyToReturnToStock,
        quantity_on_order_change: -qtyToCancelOnOrder,
        txs_created: txs.length,
      },
    });
  } catch (error) {
    console.error('processDeletedWorkOrderLineItem error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});