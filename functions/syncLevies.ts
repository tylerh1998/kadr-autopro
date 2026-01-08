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

        // 1. Fetch OtherChargeList to identify reportable levies
        const otherCharges = await base44.asServiceRole.entities.OtherChargeList.list(null, 1000);
        const reportableLevyMap = new Map();
        otherCharges.forEach(oc => {
            if (oc.reportable_levy) reportableLevyMap.set(oc.id, oc);
        });

        // 2. Build Target State (What should be on the Work Order)
        // Map: line_item_id -> { qty, amount, other_charge_id, ... }
        const targetState = new Map();
        
        for (const line of lineItems) {
            if (line.is_other_charge && line.other_charge_id) {
                const oc = reportableLevyMap.get(line.other_charge_id);
                if (oc) {
                    const lid = String(line.id);
                    targetState.set(lid, {
                        other_charge_id: oc.id,
                        qty: parseFloat(line.qty || 0),
                        amount: parseFloat(line.oc_total || 0),
                        base_amount: parseFloat(line.oc_total || 0) / (parseFloat(line.qty) || 1), // implied base amount
                        supplier_invoice_line_id: line.supplier_invoice_line_id || null
                    });
                }
            }
        }

        // 3. Build Current DB Ledger State (Net effect of all transactions so far)
        // Map: line_item_id -> { net_qty, net_amount, sample_record }
        const existingLevies = await base44.asServiceRole.entities.Levies.filter({ work_order_id: workOrderId }, null, 1000);
        const dbState = new Map();

        for (const levy of existingLevies) {
            const lid = String(levy.line_item_id);
            if (!dbState.has(lid)) {
                dbState.set(lid, { net_qty: 0, net_amount: 0, sample_record: levy });
            }
            const state = dbState.get(lid);
            state.net_qty += (parseFloat(levy.qty) || 0);
            state.net_amount += (parseFloat(levy.total_amount) || 0);
        }

        const actions = [];

        // 4. Reconcile Target vs DB (Additions & Modifications)
        for (const [lineId, target] of targetState) {
            const db = dbState.get(lineId) || { net_qty: 0, net_amount: 0, sample_record: null };
            
            const diffQty = target.qty - db.net_qty;
            const diffAmt = target.amount - db.net_amount;

            // Check if there is a material difference (accounting for float precision)
            const hasChange = Math.abs(diffQty) > 0.001 || Math.abs(diffAmt) > 0.005;

            if (hasChange) {
                // Create a delta record (positive or negative adjustment)
                actions.push({
                    work_order_id: workOrderId,
                    other_charge_id: target.other_charge_id,
                    line_item_id: lineId,
                    qty: diffQty,
                    base_amount: target.base_amount,
                    total_amount: diffAmt,
                    supplier_invoice_line_id: target.supplier_invoice_line_id,
                    date_applied: new Date().toISOString()
                });
            }
            
            // Remove processed line from dbState tracker
            dbState.delete(lineId);
        }

        // 5. Reconcile Remaining DB items (Deletions)
        // Any lines left in dbState are in the DB (non-zero net) but NOT in the current WO -> They were deleted.
        for (const [lineId, db] of dbState) {
            const isNonZero = Math.abs(db.net_qty) > 0.001 || Math.abs(db.net_amount) > 0.005;
            
            if (isNonZero) {
                // Create a negative balancing record to zero out the ledger
                actions.push({
                    work_order_id: workOrderId,
                    other_charge_id: db.sample_record?.other_charge_id, // Use metadata from history
                    line_item_id: lineId,
                    qty: -db.net_qty, // Reverse the net quantity
                    base_amount: db.sample_record?.base_amount || 0,
                    total_amount: -db.net_amount, // Reverse the net amount
                    supplier_invoice_line_id: db.sample_record?.supplier_invoice_line_id || null,
                    date_applied: new Date().toISOString()
                });
            }
        }

        // 6. Execute Transaction Log
        for (const action of actions) {
            await base44.asServiceRole.entities.Levies.create(action);
        }

        return Response.json({ 
            success: true, 
            message: 'Levies ledger synced successfully',
            records_created: actions.length
        });

    } catch (error) {
        console.error('Error in syncLevies:', error);
        return Response.json({ 
            success: false,
            error: error.message || 'Failed to sync levies' 
        }, { status: 500 });
    }
});