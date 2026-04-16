import { createClientFromRequest } from 'npm:@base44/sdk@0.8.4';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();

        if (!user) {
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { inventory_item_id, new_quantity_on_hand, notes, system_issue } = await req.json();

        if (!inventory_item_id || new_quantity_on_hand === undefined || new_quantity_on_hand === null) {
            return Response.json({ 
                error: 'Missing required fields: inventory_item_id and new_quantity_on_hand' 
            }, { status: 400 });
        }

        // Fetch the inventory item to get current QOH and cost
        const proxyResponse = await base44.functions.invoke('SupabaseProxy', {
            action: 'read',
            table: 'InventoryItem',
            match: { id: inventory_item_id }
        });
        const inventoryItem = proxyResponse.data?.data && proxyResponse.data.data.length > 0 ? proxyResponse.data.data[0] : null;
        
        if (!inventoryItem) {
            return Response.json({ error: 'Inventory item not found' }, { status: 404 });
        }

        const old_quantity_on_hand = parseFloat(inventoryItem.quantity_on_hand || 0);
        const quantity_change = new_quantity_on_hand - old_quantity_on_hand;
        const item_cost = inventoryItem.cost || 0;
        const value_change = quantity_change * item_cost;

        // Update inventory item QOH
        await base44.functions.invoke('inventoryUpdate', {
            itemId: inventory_item_id,
            updates: { quantity_on_hand: new_quantity_on_hand }
        });

        // Create inventory transaction record
        const inventoryTx = await base44.asServiceRole.entities.InventoryTxs.create({
            inventory_item_id: inventory_item_id,
            part_num: inventoryItem.part_number,
            tx_date: new Date().toISOString(),
            tx_type: 'QOH Adjusted',
            quantity_change: quantity_change,
            quantity_ordered_change: 0,
            description: notes || `Manual QOH adjustment from ${old_quantity_on_hand} to ${new_quantity_on_hand}.`
        });

        if (system_issue) {
            const mountainDateTime = new Date().toLocaleString('en-US', {
                timeZone: 'America/Edmonton',
                year: 'numeric',
                month: '2-digit',
                day: '2-digit',
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit',
                hour12: true
            });

            const emailBody = `
                <p><strong>Part #:</strong> ${inventoryItem.part_number || ''}</p>
                <p><strong>Date:</strong> ${mountainDateTime}</p>
                <p><strong>Adjusted By:</strong> ${user.full_name || user.email || ''}</p>
                <p><strong>Current QOH:</strong> ${old_quantity_on_hand}</p>
                <p><strong>New QOH:</strong> ${new_quantity_on_hand}</p>
                <p><strong>Notes:</strong> ${notes || ''}</p>
            `;

            await base44.asServiceRole.functions.invoke('sendEmailViaSMTP', {
                to: 'tyler@kensauto.ca',
                subject: 'QOH Adjustment - System Issue',
                body: emailBody,
                from_name: "Ken's Auto & Diesel Repair"
            });

            if (user.email) {
                await base44.asServiceRole.functions.invoke('sendEmailViaSMTP', {
                    to: user.email,
                    subject: 'QOH Adjustment - System Issue',
                    body: emailBody,
                    from_name: "Ken's Auto & Diesel Repair"
                });
            }
        }

        // Create GL transactions only if there is a value change
        if (value_change !== 0) {
            const absoluteValueChange = Math.abs(value_change);
            const adjustmentDescription = `Inventory QOH Adjustment - ${inventoryItem.part_number}`;
            const transactionDate = new Date().toISOString().split('T')[0]; // YYYY-MM-DD format

            if (value_change > 0) {
                // Inventory increased - Debit 1200 (Asset increases), Credit 5003 (Expense/contra-account)
                await base44.asServiceRole.entities.GLTransaction.create({
                    account_number: '1200',
                    transaction_date: transactionDate,
                    description: adjustmentDescription,
                    reference: inventoryTx.id,
                    debit_amount: absoluteValueChange,
                    credit_amount: 0,
                    source_type: 'adjustment',
                    source_id: inventoryTx.id
                });

                await base44.asServiceRole.entities.GLTransaction.create({
                    account_number: '5003',
                    transaction_date: transactionDate,
                    description: adjustmentDescription,
                    reference: inventoryTx.id,
                    debit_amount: 0,
                    credit_amount: absoluteValueChange,
                    source_type: 'adjustment',
                    source_id: inventoryTx.id
                });
            } else {
                // Inventory decreased - Credit 1200 (Asset decreases), Debit 5003 (Expense increases)
                await base44.asServiceRole.entities.GLTransaction.create({
                    account_number: '1200',
                    transaction_date: transactionDate,
                    description: adjustmentDescription,
                    reference: inventoryTx.id,
                    debit_amount: 0,
                    credit_amount: absoluteValueChange,
                    source_type: 'adjustment',
                    source_id: inventoryTx.id
                });

                await base44.asServiceRole.entities.GLTransaction.create({
                    account_number: '5003',
                    transaction_date: transactionDate,
                    description: adjustmentDescription,
                    reference: inventoryTx.id,
                    debit_amount: absoluteValueChange,
                    credit_amount: 0,
                    source_type: 'adjustment',
                    source_id: inventoryTx.id
                });
            }
        }

        return Response.json({ 
            success: true, 
            message: 'QOH adjusted successfully',
            inventory_tx_id: inventoryTx.id,
            value_change: value_change,
            gl_posted: value_change !== 0
        });

    } catch (error) {
        console.error('Error in processQOHAdjustment:', error);
        return Response.json({ 
            error: error.message,
            stack: error.stack 
        }, { status: 500 });
    }
});