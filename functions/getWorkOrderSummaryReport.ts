import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Fetch Active Work Orders and Estimates
    // We want all open stuff.
    const activeDocs = await base44.entities.WorkOrder.filter({
      stage: { "$in": ["work_order", "estimate"] }
    });

    // Fetch Invoiced WOs from last 30 days for comparison
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const thirtyDaysAgoStr = thirtyDaysAgo.toISOString().split('T')[0];

    const recentInvoices = await base44.entities.WorkOrder.filter({
        stage: { "$in": ["invoice", "credit_invoice"] },
        invoice_date: { "$gte": thirtyDaysAgoStr }
    });

    let closedRevenue = 0;
    for (const inv of recentInvoices) {
        // total_amount is typically tax inclusive, but usually sales reports want pre-tax?
        // However, standard "Sales" usually refers to Revenue. 
        // Let's stick to total_amount (which is revenue + tax usually) OR calculate pre-tax if we want consistency with WIP Revenue (which is pre-tax in my previous calc: wipRevenue.total = totalAmount - taxAmount).
        // Let's calculate pre-tax for consistency.
        const total = inv.total_amount || 0;
        const tax = inv.tax_amount || 0;
        closedRevenue += (total - tax);
    }

    let summary = {
        totalWorkOrders: 0,
        totalEstimates: 0,
        inventoryValueInWIP: 0,
        wipRevenue: {
            parts: 0,
            labor: 0,
            shopSupplies: 0,
            otherCharges: 0,
            total: 0
        },
        wipCost: {
            parts: 0,
            labor: 0 // We'll try to estimate or sum manual logs
        },
        aging: {
            "0-7 Days": 0,
            "8-14 Days": 0,
            "15-30 Days": 0,
            "30+ Days": 0
        },
        closedLast30Days: recentInvoices.length,
        closedRevenueLast30Days: closedRevenue
    };

    const now = new Date();

    for (const doc of activeDocs) {
        if (doc.stage === 'estimate') {
            summary.totalEstimates++;
            continue; // We generally don't include estimates in WIP value/aging, or do we?
            // "Inventory value in WIP" usually implies committed stock (Work Orders).
            // "Age report" usually implies active WOs.
            // I'll exclude Estimates from WIP calculations but keep count.
        }

        summary.totalWorkOrders++;

        // Aging
        const dateStr = doc.wo_date || doc.created_date;
        if (dateStr) {
            const docDate = new Date(dateStr);
            const diffTime = Math.abs(now - docDate);
            const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)); 
            
            if (diffDays <= 7) summary.aging["0-7 Days"]++;
            else if (diffDays <= 14) summary.aging["8-14 Days"]++;
            else if (diffDays <= 30) summary.aging["15-30 Days"]++;
            else summary.aging["30+ Days"]++;
        }

        // Revenue Breakdown
        // Using fields for consistency
        const partsRev = doc.parts_total || 0;
        const laborRev = doc.labor_total || 0;
        const suppliesRev = doc.shop_supply_total || 0;
        const totalAmount = doc.total_amount || 0;
        const taxAmount = doc.tax_amount || 0;
        
        // Calculate Other Charges as residual: Total - Tax - (Parts + Labor + Supplies)
        // Note: total_amount includes tax.
        const subtotalCalculated = partsRev + laborRev + suppliesRev;
        const otherRev = Math.max(0, (totalAmount - taxAmount) - subtotalCalculated);

        summary.wipRevenue.parts += partsRev;
        summary.wipRevenue.labor += laborRev;
        summary.wipRevenue.shopSupplies += suppliesRev;
        summary.wipRevenue.otherCharges += otherRev;
        summary.wipRevenue.total += (totalAmount - taxAmount); // Pre-tax total

        // Inventory Value (Cost Analysis)
        if (doc.line_items) {
            try {
                const items = JSON.parse(doc.line_items);
                items.forEach(item => {
                    const qty = Number(item.qty) || 0;
                    const cost = Number(item.cost_ea) || Number(item.cost) || 0; // Handle different naming conventions
                    const totalCost = qty * cost;

                    // If it's a part (usually has part_number), add to Inventory Value
                    // We assume line items are primarily parts or labor.
                    // If it has a cost, we count it.
                    // We might want to separate Labor Cost if possible.
                    // Often labor lines have 'type' or are identified.
                    // But for "Inventory Value in WIP", we specifically want PARTS cost.
                    // Checking if item has `part_number` or `inventory_item_id` is a good heuristic.
                    
                    const isLabor = item.type === 'labor' || (!item.part_number && item.description?.toLowerCase().includes('labor'));
                    
                    if (!isLabor) {
                         summary.inventoryValueInWIP += totalCost;
                         summary.wipCost.parts += totalCost;
                    } else {
                         summary.wipCost.labor += totalCost;
                    }
                });
            } catch (e) {
                console.error("Error parsing line items for WO", doc.id);
            }
        }
    }

    // Calculate Margins
    const totalWipRevenue = summary.wipRevenue.total;
    const totalWipCost = summary.wipCost.parts + summary.wipCost.labor;
    const wipGrossProfit = totalWipRevenue - totalWipCost;
    const wipMargin = totalWipRevenue > 0 ? (wipGrossProfit / totalWipRevenue) * 100 : 0;

    summary.margins = {
        grossProfit: wipGrossProfit,
        marginPercent: wipMargin
    };

    return Response.json(summary);

  } catch (error) {
    console.error('Work Order Summary Error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});