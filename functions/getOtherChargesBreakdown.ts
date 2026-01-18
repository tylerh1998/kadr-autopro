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

    // Fetch invoices and work orders within the date range
    const workOrders = await base44.entities.WorkOrder.filter({
      $or: [
        {
          stage: { $in: ['invoice', 'credit_invoice'] },
          invoice_date: { $gte: startDate, $lte: endDate }
        },
        {
          stage: 'work_order',
          wo_date: { $gte: startDate, $lte: endDate }
        }
      ]
    });

    // Fetch customers for the work orders
    const customerIds = [...new Set(workOrders.map(wo => wo.customer_id).filter(Boolean))];
    let customerMap = {};
    
    if (customerIds.length > 0) {
      const customers = await base44.entities.Customer.filter({ id: { $in: customerIds } });
      customerMap = customers.reduce((acc, c) => {
        acc[c.id] = c;
        return acc;
      }, {});
    }

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

      // Determine customer name
      let customerName = 'Unknown';
      const customer = customerMap[wo.customer_id];
      if (customer) {
        customerName = customer.org_name || `${customer.first_name || ''} ${customer.last_name || ''}`.trim();
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
            count: 0,
            details: []
          };
        }

        chargesMap[key].total_amount += ocTotal;
        chargesMap[key].count += 1;
        
        // Add detail record
        chargesMap[key].details.push({
          ro_number: wo.ro_number,
          work_order_id: wo.id,
          date: wo.invoice_date || wo.wo_date,
          stage: wo.stage,
          customer_name: customerName,
          amount: ocTotal
        });
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