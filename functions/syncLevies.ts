import { createClientFromRequest } from 'npm:@base44/sdk@0.8.3';

export default Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        
        const user = await base44.auth.me();
        if (!user) {
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { workOrderId, lineItems } = await req.json();

        if (!workOrderId || !lineItems) {
            return Response.json({ error: 'Missing required parameters' }, { status: 400 });
        }

        // 1. Fetch all OtherChargeList items to identify reportable levies
        const otherCharges = await base44.asServiceRole.entities.OtherChargeList.list(null, 1000);
        const reportableLevyMap = new Map();
        
        otherCharges.forEach(oc => {
            if (oc.reportable_levy) {
                reportableLevyMap.set(oc.id, oc);
            }
        });

        // 2. Identify line items that are reportable levies
        const reportableLineItems = [];
        const reportableLineItemIds = new Set();

        for (const line of lineItems) {
            // Check if it's an other charge
            if (line.is_other_charge && line.other_charge_id) {
                const oc = reportableLevyMap.get(line.other_charge_id);
                if (oc) {
                    reportableLineItems.push({
                        line,
                        otherCharge: oc
                    });
                    reportableLineItemIds.add(line.id);
                }
            }
        }

        // 3. Fetch existing Levies records for this Work Order
        const existingLevies = await base44.asServiceRole.entities.Levies.filter({ work_order_id: workOrderId }, null, 1000);
        
        const existingLeviesMap = new Map();
        existingLevies.forEach(l => existingLeviesMap.set(l.line_item_id, l));

        // 4. Sync: Create/Update
        for (const { line, otherCharge } of reportableLineItems) {
            // Ensure ID is a string
            const lineId = String(line.id);
            
            const levyData = {
                work_order_id: workOrderId,
                other_charge_id: otherCharge.id,
                line_item_id: lineId,
                qty: parseFloat(line.qty || 0),
                base_amount: parseFloat(line.oc_total || 0) / (parseFloat(line.qty) || 1), // implied base amount
                total_amount: parseFloat(line.oc_total || 0),
                supplier_invoice_line_id: line.supplier_invoice_line_id || null
            };

            if (existingLeviesMap.has(lineId)) {
                // Update if changed
                const existing = existingLeviesMap.get(lineId);
                if (existing.qty !== levyData.qty || existing.total_amount !== levyData.total_amount) {
                    await base44.asServiceRole.entities.Levies.update(existing.id, {
                        qty: levyData.qty,
                        base_amount: levyData.base_amount,
                        total_amount: levyData.total_amount,
                        supplier_invoice_line_id: levyData.supplier_invoice_line_id
                    });
                }
                // Remove from map to track processed
                existingLeviesMap.delete(lineId);
            } else {
                // Create new
                await base44.asServiceRole.entities.Levies.create({
                    ...levyData,
                    date_applied: new Date().toISOString()
                });
            }
        }

        // 5. Sync: Delete orphans
        // Any items remaining in existingLeviesMap are no longer in the reportable line items list
        for (const [lineId, orphanLevy] of existingLeviesMap) {
            await base44.asServiceRole.entities.Levies.delete(orphanLevy.id);
        }

        return Response.json({ success: true, message: 'Levies synced successfully' });

    } catch (error) {
        console.error('Error in syncLevies:', error);
        return Response.json({ 
            success: false,
            error: error.message || 'Failed to sync levies' 
        }, { status: 500 });
    }
});