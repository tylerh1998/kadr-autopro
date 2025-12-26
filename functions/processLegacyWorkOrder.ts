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

        const { customer_id, vehicle_id, invoice_details, line_items, totals, new_parts } = payload;

        if (!customer_id || !vehicle_id) {
            return Response.json({ error: 'Customer or Vehicle ID is missing.' }, { status: 400 });
        }

        // --- Step 1: Handle New Inventory Items ---
        // If the frontend identified new parts and the user chose to create them
        if (new_parts && new_parts.length > 0) {
            for (const part of new_parts) {
                // Check if part already exists to avoid duplicates
                const existing = await base44.asServiceRole.entities.InventoryItem.filter({ part_number: part.part_number });
                if (existing.length === 0) {
                    await base44.asServiceRole.entities.InventoryItem.create({
                        part_number: part.part_number,
                        description: part.description,
                        cost: parseFloat(part.cost) || 0,
                        selling_price: parseFloat(part.selling_price) || 0,
                        quantity_on_hand: parseFloat(part.quantity_on_hand) || 0, // Initial count
                        unit: 'ea',
                        category: 'other',
                        stocked_item: true
                    });
                }
            }
        }

        // --- Step 2: Process Line Items ---
        const processedLineItems = line_items.map((item, index) => {
            return {
                id: Date.now() + index, // Generate unique ID for React keys
                description: item.description,
                part_number: item.part_number || '',
                qty: item.quantity,
                parts_ea: item.unit_price,
                cost_ea: item.inventory_match?.cost || item.cost || 0,
                tot_parts: (item.is_labor || item.is_other_charge) ? 0 : item.total_price, 
                labour: item.is_labor ? item.total_price : 0,    
                is_other_charge: item.is_other_charge || false,
                oc_total: item.is_other_charge ? item.total_price : 0,
                gl_account: item.gl_account || '',
                tx: item.is_taxable ? 'Y' : 'N',
                total: item.total_price,
                hrs: item.is_labor ? item.quantity : '', 
                complete: false,
                bold: false,
                is_legacy_import: true 
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
            description: invoice_details.description || `Imported Legacy Work Order ${invoice_details.invoice_number || ''}`,
            po_number: invoice_details.po_number || '',
            odometer: invoice_details.odometer || 0,
            
            // Financials
            total_amount: totals.total_amount,
            tax_amount: totals.tax_amount,
            parts_total: totals.subtotal, // Approximation, refined by line items in UI usually
            labor_total: 0, // Will be calculated by UI from line items usually, but setting 0 for now
            shop_supply_total: 0,
            
            line_items: JSON.stringify(processedLineItems),
            
            // Legacy reference
            internal_notes: `Imported from Legacy System. Original Invoice #: ${invoice_details.invoice_number || 'N/A'}`
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