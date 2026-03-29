import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';
import { createClient } from 'npm:@supabase/supabase-js@2.39.3';
import { format } from 'npm:date-fns@3.6.0';
import { toZonedTime } from 'npm:date-fns-tz@3.1.3';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();

        if (!user) {
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const supabaseUrl = Deno.env.get('Supabase_project_url');
        const supabaseSecret = Deno.env.get('Supabase_Secret_Key');

        if (!supabaseUrl || !supabaseSecret) {
            return Response.json({ error: 'Supabase credentials not configured' }, { status: 500 });
        }

        const supabase = createClient(supabaseUrl, supabaseSecret, {
            auth: { persistSession: false }
        });

        const { workOrderId } = await req.json();

        if (!workOrderId) {
            return Response.json({ error: 'Work Order ID is required' }, { status: 400 });
        }

        const workOrderResult = await supabase
            .from('WorkOrder')
            .select('*')
            .eq('id', workOrderId)
            .maybeSingle();

        if (workOrderResult.error) {
            console.error('convertEstimateToWorkOrder fetch error:', workOrderResult.error);
            return Response.json({ error: 'Failed to fetch work order', details: workOrderResult.error.message }, { status: 500 });
        }

        if (!workOrderResult.data) {
            return Response.json({ error: 'Work Order not found' }, { status: 404 });
        }

        const workOrder = workOrderResult.data;

        // Fetch Suppliers for lookup
        let supplierMap = new Map();
        try {
            const suppliers = await base44.entities.Supplier.list();
            supplierMap = new Map(suppliers.map(s => [s.id, s.name]));
        } catch (e) {
            console.error('Error fetching suppliers:', e);
        }

        // Parse line items
        let lineItems = [];
        try {
            lineItems = workOrder.line_items ? JSON.parse(workOrder.line_items) : [];
        } catch (e) {
            console.error('Error parsing line items:', e);
            return Response.json({ error: 'Invalid line items data' }, { status: 500 });
        }

        const updatedLineItems = [];

        // Process line items for inventory updates sequentially
        for (const line of lineItems) {
            if (line.inventory_item_id && !line.inventory_processed && parseFloat(line.qty) > 0) {
                const requestedQuantity = parseFloat(line.qty);
                const inventoryItemId = line.inventory_item_id;

                try {
                    // Fetch fresh inventory item using SupabaseProxy
                    const proxyResponse = await base44.functions.invoke('SupabaseProxy', {
                        action: 'read',
                        table: 'InventoryItem',
                        match: { id: inventoryItemId }
                    });
                    
                    let inventoryItem = null;
                    if (proxyResponse.data && proxyResponse.data.data && proxyResponse.data.data.length > 0) {
                        inventoryItem = proxyResponse.data.data[0];
                    }

                    if (!inventoryItem) {
                        updatedLineItems.push(line);
                        continue;
                    }

                    const currentQOH = parseFloat(inventoryItem.quantity_on_hand) || 0;
                    const currentQOO = parseFloat(inventoryItem.quantity_on_order) || 0;

                    let qtyTakenFromHand = 0;
                    let qtyPlacedOnOrder = 0;
                    
                    // Determine split based on QOH
                    if (currentQOH >= requestedQuantity) {
                        // Scenario 1: Sufficient QOH
                        qtyTakenFromHand = requestedQuantity;
                        qtyPlacedOnOrder = 0;
                    } else if (currentQOH > 0) {
                        // Scenario 2: Partial QOH
                        qtyTakenFromHand = currentQOH;
                        qtyPlacedOnOrder = requestedQuantity - currentQOH;
                    } else {
                        // Scenario 3: No QOH
                        qtyTakenFromHand = 0;
                        qtyPlacedOnOrder = requestedQuantity;
                    }

                    // Prepare Inventory Update
                    const updateData = {};
                    if (qtyTakenFromHand > 0) {
                        updateData.quantity_on_hand = currentQOH - qtyTakenFromHand;
                    }
                    if (qtyPlacedOnOrder > 0) {
                        updateData.quantity_on_order = currentQOO + qtyPlacedOnOrder;
                    }

                    // Perform Inventory Update if needed
                    if (Object.keys(updateData).length > 0) {
                        await base44.functions.invoke('inventoryUpdate', {
                            itemId: inventoryItemId,
                            updates: updateData
                        });
                    }

                    // Create Transaction for Taking from Hand
                    if (qtyTakenFromHand > 0) {
                        await base44.asServiceRole.entities.InventoryTxs.create({
                            inventory_item_id: inventoryItemId,
                            part_num: inventoryItem.part_number,
                            tx_date: new Date().toISOString(),
                            tx_type: 'Issued to WO',
                            quantity_change: -qtyTakenFromHand,
                            quantity_ordered_change: 0,
                            ro_number: workOrder.ro_number,
                            source_record_id: workOrder.id,
                            description: `Allocated ${qtyTakenFromHand} to WO ${workOrder.ro_number} (Conversion)`
                        });
                    }

                    // Create Transaction for Placing on Order
                    if (qtyPlacedOnOrder > 0) {
                        const supplierName = supplierMap.get(inventoryItem.supplier_id) || '';
                        
                        await base44.asServiceRole.entities.InventoryTxs.create({
                            inventory_item_id: inventoryItemId,
                            part_num: inventoryItem.part_number,
                            tx_date: new Date().toISOString(),
                            tx_type: 'Ordered',
                            quantity_change: 0,
                            quantity_ordered_change: qtyPlacedOnOrder,
                            ro_number: workOrder.ro_number,
                            source_record_id: workOrder.id,
                            supplier_name: supplierName,
                            description: `Placed ${qtyPlacedOnOrder} on order for WO ${workOrder.ro_number} (Conversion)`
                        });
                    }

                    // Mark line as processed with updated qty_on_order
                    updatedLineItems.push({
                        ...line,
                        qty_on_order: qtyPlacedOnOrder,
                        inventory_processed: true
                    });

                } catch (err) {
                    console.error(`Error processing inventory for item ${inventoryItemId}:`, err);
                    updatedLineItems.push(line); // Keep original if error
                }
            } else {
                updatedLineItems.push(line); // Keep original if not an unprocessed inventory item
            }
        }

        // Update Work Order
        const mountainNow = toZonedTime(new Date(), 'America/Edmonton');
        const updateData = {
            stage: 'work_order',
            line_items: JSON.stringify(updatedLineItems),
            wo_date: format(mountainNow, 'yyyy-MM-dd'),
            LockedByUser: null,
            locked_timestamp: null
        };

        if (!workOrder.wo_number && workOrder.ro_number) {
            const roNumericPart = workOrder.ro_number.replace(/\D/g, '');
            updateData.wo_number = `WO${roNumericPart}`;
        }

        const updateResult = await supabase
            .from('WorkOrder')
            .update(updateData)
            .eq('id', workOrderId)
            .select('*')
            .maybeSingle();

        if (updateResult.error) {
            console.error('convertEstimateToWorkOrder update error:', updateResult.error);
            return Response.json({ error: 'Failed to update work order during conversion', details: updateResult.error.message }, { status: 500 });
        }

        if (!updateResult.data) {
            return Response.json({ error: 'Work Order not found during update' }, { status: 404 });
        }

        return Response.json({ success: true, data: updateResult.data });

    } catch (error) {
        console.error('Error converting estimate:', error);
        return Response.json({ error: error.message }, { status: 500 });
    }
});