import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
    try {
        console.log('--- processLegacyWorkOrder: Starting ---');

        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();

        if (!user) {
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const payload = await req.json();
        // console.log('Received payload:', JSON.stringify(payload, null, 2));

        const { customer_id, vehicle_id, invoice_details, line_items, totals, new_parts, odometer } = payload;

        if (!customer_id || !vehicle_id) {
            return Response.json({ error: 'Customer or Vehicle ID is missing.' }, { status: 400 });
        }

        // --- Step 1: Handle New Inventory Items ---
        const createdPartIds = {}; // Map part_number -> new item ID

        if (new_parts && new_parts.length > 0) {
            for (const part of new_parts) {
                // Check if part already exists to avoid duplicates
                const existing = await base44.asServiceRole.entities.InventoryItem.filter({ part_number: part.part_number });
                let itemId;
                
                if (existing.length === 0) {
                    const newItem = await base44.asServiceRole.entities.InventoryItem.create({
                        part_number: part.part_number,
                        description: part.description,
                        cost: parseFloat(part.cost) || 0,
                        selling_price: parseFloat(part.selling_price) || 0,
                        quantity_on_hand: parseFloat(part.quantity_on_hand) || 0, // Initial count
                        unit: 'ea',
                        category: 'other',
                        stocked_item: false // Requirement: false for all new imports
                    });
                    itemId = newItem.id;
                } else {
                    itemId = existing[0].id;
                }
                createdPartIds[part.part_number] = itemId;
            }
        }

        // --- Step 2: Process Line Items ---
        const processedLineItems = line_items.map((item, index) => {
            const isLabor = item.is_labor;
            const isOtherCharge = item.is_other_charge;
            const isPart = !isLabor && !isOtherCharge;
            
            let inventoryItemId = null;
            if (isPart) {
                if (item.inventory_match) {
                    inventoryItemId = item.inventory_match.id;
                } else if (item.part_number && createdPartIds[item.part_number]) {
                    inventoryItemId = createdPartIds[item.part_number];
                }
            }

            // Determine core cost to subtract from unit price
            const coreCost = parseFloat(item.core_cost || (item.inventory_match?.core_cost) || 0);
            
            // Calculate adjusted unit price (subtracting core if present)
            const adjustedPartsEa = isPart ? (item.unit_price - coreCost) : 0;

            return {
                id: Date.now() + index, // Generate unique ID for React keys
                description: item.description,
                part_number: item.part_number || '',
                // Requirement: Labour qty unneeded (if 1). 
                qty: isLabor ? 0 : item.quantity,
                parts_ea: adjustedPartsEa,
                cost_ea: isPart ? (item.inventory_match?.cost || item.cost || 0) : 0,
                tot_parts: isPart ? item.total_price : 0, 
                labour: isLabor ? item.total_price : 0,    
                is_other_charge: isOtherCharge || false,
                oc_total: isOtherCharge ? item.total_price : 0,
                gl_account: item.gl_account || '',
                tx: item.is_taxable ? 'Y' : 'N',
                total: item.total_price,
                hrs: isLabor ? item.quantity : 0, 
                inventory_item_id: inventoryItemId,
                inventory_processed: isPart ? true : false, // Requirement: true for all parts imported
                complete: false,
                bold: false,
                is_legacy_import: true,
                Core_num: item.core_num || 0,
                core_cost: coreCost,
                core_osamt: item.core_osamt || 0,
                qty_on_order: item.qty_on_order || 0
            };
        });

        // --- Step 3: Create the Work Order ---
        // Fetch next RO number
        const settingsList = await base44.asServiceRole.entities.SystemSettings.list();
        const settings = settingsList[0];
        
        // Use a safe default if settings aren't initialized
        let nextRo = settings?.next_ro_number || 1001;

        // Create the Work Order
        const newWorkOrderData = {
            ro_number: `RO${nextRo}`,
            wo_number: `WO${nextRo}`,
            customer_id: customer_id,
            vehicle_id: vehicle_id,
            status: "Open", // Default status
            stage: "work_order", // Directly to WO stage
            wo_date: invoice_details.invoice_date || new Date().toISOString().split('T')[0],
            // Requirement: Don't put anything in description
            description: '',
            po_number: invoice_details.po_number || '',
            // Requirement: Add odometer field
            odometer: typeof odometer !== 'undefined' ? odometer : (invoice_details.odometer || 0),
            
            // Financials
            total_amount: totals.total_amount,
            tax_amount: totals.tax_amount,
            parts_total: totals.subtotal, // Approximation, refined by line items in UI usually
            labor_total: 0, // Will be calculated by UI from line items usually, but setting 0 for now
            shop_supply_total: 0,
            
            line_items: JSON.stringify(processedLineItems),
            
            // Requirement: "Lankar WO# {document}" in internal notes
            internal_notes: `Lankar WO# ${invoice_details.invoice_number || 'N/A'}`
        };

        const createdWorkOrder = await base44.asServiceRole.entities.WorkOrder.create(newWorkOrderData);

        // Update RO number
        if (settings) {
            await base44.asServiceRole.entities.SystemSettings.update(settings.id, { next_ro_number: nextRo + 1 });
        }

        return Response.json({ success: true, workOrder: createdWorkOrder });

    } catch (error) {
        console.error('Error processing legacy work order:', error);
        return Response.json({ error: error.message }, { status: 500 });
    }
});