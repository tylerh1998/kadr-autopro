import { createClientFromRequest } from 'npm:@base44/sdk@0.8.4';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { workOrderId, newStatus, kanbanOrder } = await req.json();

    if (!workOrderId) {
      return Response.json({ error: 'Missing workOrderId' }, { status: 400 });
    }

    // 1. Get the Work Order
    const workOrder = await base44.asServiceRole.entities.WorkOrder.get(workOrderId);

    if (!workOrder) {
      return Response.json({ error: 'Work Order not found' }, { status: 404 });
    }

    // 2. Check for Lock
    if (workOrder.LockedByUser && workOrder.LockedByUser !== user.email) {
      return Response.json({ 
        error: `Work Order is locked by ${workOrder.LockedByUser}. Cannot move.`,
        locked: true 
      }, { status: 409 }); // 409 Conflict
    }

    // 3. Update Status and/or Order
    const updateData = {};
    if (newStatus && newStatus !== workOrder.status) {
        updateData.status = newStatus;
    }
    if (kanbanOrder !== undefined) {
        updateData.kanban_order = kanbanOrder;
    }

    if (Object.keys(updateData).length > 0) {
        await base44.asServiceRole.entities.WorkOrder.update(workOrderId, updateData);
    }

    return Response.json({ success: true, status: newStatus || workOrder.status });

  } catch (error) {
    console.error('Error updating work order status:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});