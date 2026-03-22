import { createClientFromRequest } from 'npm:@base44/sdk@0.8.4';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const payload = await req.json();
    const { startDate, endDate } = payload;

    if (!startDate || !endDate) {
      return Response.json({ success: false, error: 'Start date and end date are required' }, { status: 400 });
    }

    // 1. Fetch Levies within date range
    // Note: Levies.date_applied is datetime string. 
    // We'll filter client side or fetch slightly more and filter? 
    // Or we can try to filter by range if the SDK supports it for string dates. 
    // Usually simple string comparison works for ISO dates.
    
    // We'll fetch all levies and filter in memory if the dataset isn't huge, 
    // or use query if possible. Let's try simple string comparison query first if supported, 
    // or just fetch all if we assume volume is manageable for now.
    // However, for a report, it's better to be efficient.
    
    // Let's assume we can fetch all for now or filter by date string.
    // Since base44 filter usually does exact match, we might need to fetch all and filter JS side 
    // OR use advanced filtering if available (e.g. $gte).
    // The prompt says "Use query filter to get specific entities... e.g. {"age": {"$gte": 18}}".
    // So we can use $gte and $lte.
    
    const levies = await base44.asServiceRole.entities.Levies.filter({
      date_applied: {
        "$gte": new Date(startDate).toISOString(),
        "$lte": new Date(endDate + 'T23:59:59.999Z').toISOString() // Ensure end of day
      }
    });

    // 2. Fetch related data
    // We need unique IDs to fetch related records efficiently
    const workOrderIds = [...new Set(levies.map(l => l.work_order_id).filter(Boolean))];
    const otherChargeIds = [...new Set(levies.map(l => l.other_charge_id).filter(Boolean))];

    // Fetch WorkOrders
    // We can't do bulk get by ID list easily in one call unless we loop or use $in if supported.
    // If $in is not supported, we loop. Documentation doesn't explicitly mention $in.
    // Let's loop for now, or fetch all active work orders if that's too many.
    // Actually, for a report, we might have many IDs. 
    // Best effort: fetch them in parallel batches or just loop.
    
    const workOrdersMap = {};
    const batchSize = 10;
    for (let i = 0; i < workOrderIds.length; i += batchSize) {
      const batch = workOrderIds.slice(i, i + batchSize);
      await Promise.all(batch.map(async (id) => {
        try {
          const wo = await base44.asServiceRole.entities.WorkOrder.get(id);
          if (wo) workOrdersMap[id] = wo;
        } catch (e) {
          console.error(`Failed to fetch WO ${id}`, e);
        }
      }));
    }

    // Fetch OtherChargeList (usually small list, can fetch all)
    const otherCharges = await base44.asServiceRole.entities.OtherChargeList.list();
    const otherChargesMap = {};
    otherCharges.forEach(oc => {
      otherChargesMap[oc.id] = oc;
    });

    // 3. Assemble data
    const reportData = levies.map(levy => {
      const wo = workOrdersMap[levy.work_order_id];
      const oc = otherChargesMap[levy.other_charge_id];

      return {
        id: levy.id,
        date_applied: levy.date_applied,
        ro_number: wo ? (wo.ro_number || wo.wo_number || wo.est_number) : 'Unknown',
        description: oc ? oc.description : 'Unknown Levy',
        qty: levy.qty,
        base_amount: levy.base_amount,
        total_amount: levy.total_amount,
        supplier_invoice_line_id: levy.supplier_invoice_line_id
      };
    });

    // Sort by date desc
    reportData.sort((a, b) => new Date(b.date_applied) - new Date(a.date_applied));

    return Response.json({ success: true, data: reportData });

  } catch (error) {
    console.error('Error generating reportable levies report:', error);
    return Response.json({ success: false, error: error.message }, { status: 500 });
  }
});