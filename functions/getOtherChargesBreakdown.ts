import { createClientFromRequest } from 'npm:@base44/sdk@0.8.4';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { startDate, endDate } = await req.json();

    if (!startDate || !endDate) {
      return Response.json({ error: 'startDate and endDate are required' }, { status: 400 });
    }

    // Fetch all invoices within the date range
    const workOrders = await base44.entities.WorkOrder.filter({
      stage: 'invoice',
      invoice_date: { $gte: startDate, $lte: endDate }
    });

    // Aggregate other charges by description
    const chargesMap = {};

    for (const wo of workOrders) {
      if (!wo.line_items) continue;

      let lineItems = [];
      try {
        lineItems = JSON.parse(wo.line_items);
      } catch (e) {
        console.error(`Failed to parse line_items for WO ${wo.ro_number}:`, e);
        continue;
      }

      for (const line of lineItems) {
        const ocTotal = parseFloat(line.oc_total) || 0;
        if (ocTotal === 0) continue;

        const description = line.description || 'Unknown Charge';
        const glAccount = line.gl_account || '';
        const otherChargeId = line.other_charge_id;

        // Group by other_charge_id if available, otherwise by description+gl
        const key = otherChargeId ? `ID::${otherChargeId}` : `${description}|||${glAccount}`;

        if (!chargesMap[key]) {
          chargesMap[key] = {
            description: description,
            gl_account: glAccount,
            other_charge_id: otherChargeId,
            total_amount: 0,
            count: 0
          };
        }
        
        // If we grouped by ID, keep the first description we found, or maybe update it?
        // Let's stick to the first one for consistency, or maybe the most frequent one?
        // For now, simple aggregation.

        chargesMap[key].total_amount += ocTotal;
        chargesMap[key].count += 1;
      }
    }

    // Convert map to array and sort by total amount descending
    const charges = Object.values(chargesMap).sort((a, b) => b.total_amount - a.total_amount);

    // Calculate grand total
    const grandTotal = charges.reduce((sum, c) => sum + c.total_amount, 0);

    return Response.json({
      success: true,
      charges,
      grandTotal,
      invoiceCount: workOrders.length,
      startDate,
      endDate
    });

  } catch (error) {
    console.error('Error generating other charges breakdown:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});