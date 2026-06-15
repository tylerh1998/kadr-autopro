import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const { part_number, work_order_id, quantity } = await req.json();

    const normalizedPartNumber = String(part_number || '').trim();
    const normalizedWorkOrderId = String(work_order_id || '').trim();
    const normalizedQuantity = Number(quantity);

    if (!normalizedPartNumber || !normalizedWorkOrderId || !Number.isFinite(normalizedQuantity) || normalizedQuantity <= 0) {
      return Response.json({
        success: false,
        error: 'Missing or invalid required parameters: part_number, work_order_id, quantity'
      }, { status: 400 });
    }

    const matchingRecords = await base44.asServiceRole.entities.InventoryReturn.filter(
      {
        part_number: normalizedPartNumber,
        work_order_id: normalizedWorkOrderId,
        status: 'On-site'
      },
      'return_date',
      1000
    );

    const sortedRecords = [...matchingRecords].sort((a, b) => {
      const dateCompare = String(a.return_date || '').localeCompare(String(b.return_date || ''));
      if (dateCompare !== 0) return dateCompare;
      return String(a.created_date || '').localeCompare(String(b.created_date || ''));
    });

    const totalAvailable = sortedRecords.reduce((sum, record) => {
      return sum + (Number(record.quantity_returned) || 0);
    }, 0);

    if (totalAvailable < normalizedQuantity) {
      return Response.json({
        success: false,
        error: 'Not enough quantity in Inventory Return. Off-site Inventory must be changed to on-site before performing this. Double check the Inventory Return page.',
        total_available: totalAvailable,
        requested_quantity: normalizedQuantity,
        matched_records: sortedRecords.length
      }, { status: 400 });
    }

    let remainingToProcess = normalizedQuantity;
    const actions = [];

    for (const record of sortedRecords) {
      if (remainingToProcess <= 0) break;

      const recordQuantity = Number(record.quantity_returned) || 0;
      const costPerUnit = Number(record.cost_per_unit) || 0;

      if (recordQuantity <= remainingToProcess) {
        await base44.asServiceRole.entities.InventoryReturn.delete(record.id);
        remainingToProcess -= recordQuantity;

        actions.push({
          id: record.id,
          action: 'delete',
          quantity_removed: recordQuantity,
          quantity_remaining_on_record: 0
        });
      } else {
        const newQuantity = recordQuantity - remainingToProcess;
        const newTotalCost = Number((costPerUnit * newQuantity).toFixed(2));

        await base44.asServiceRole.entities.InventoryReturn.update(record.id, {
          quantity_returned: newQuantity,
          total_cost: newTotalCost
        });

        actions.push({
          id: record.id,
          action: 'update',
          quantity_removed: remainingToProcess,
          quantity_remaining_on_record: newQuantity,
          new_total_cost: newTotalCost
        });

        remainingToProcess = 0;
      }
    }

    return Response.json({
      success: true,
      message: 'Core quantity returned to work order successfully.',
      part_number: normalizedPartNumber,
      work_order_id: normalizedWorkOrderId,
      quantity_processed: normalizedQuantity,
      matched_records: sortedRecords.length,
      actions
    });
  } catch (error) {
    console.error('Error in ReturnCoretoWO:', error);
    return Response.json({
      success: false,
      error: error.message || 'Internal server error'
    }, { status: 500 });
  }
});