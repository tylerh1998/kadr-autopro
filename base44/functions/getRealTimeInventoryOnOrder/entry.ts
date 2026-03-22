import { createClientFromRequest } from 'npm:@base44/sdk@0.8.3';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        
        // 1. Fetch active Work Orders
        // We only care about active WOs where parts might be on order. 
        // 'work_order' stage is the primary one. 'estimate' usually doesn't trigger "on order" until converted.
        const activeWorkOrders = await base44.entities.WorkOrder.filter({ 
            stage: 'work_order' 
        });

        // 2. Aggregate counts from Line Items
        const itemsMap = {}; // inventory_item_id -> { qty_on_order, wos: [] }
        const missingInventoryIds = new Set();

        for (const wo of activeWorkOrders) {
            let lines = [];
            try {
                lines = typeof wo.line_items === 'string' ? JSON.parse(wo.line_items) : wo.line_items;
            } catch (e) {
                console.warn(`Failed to parse line items for WO ${wo.ro_number}`, e);
                continue;
            }

            if (!lines || !Array.isArray(lines)) continue;

            for (const line of lines) {
                const qtyOnOrder = parseFloat(line.qty_on_order) || 0;
                
                if (qtyOnOrder > 0) {
                    const itemId = line.inventory_item_id;
                    
                    // We primarily track items linked to inventory
                    if (itemId) {
                        if (!itemsMap[itemId]) {
                            itemsMap[itemId] = {
                                inventory_item_id: itemId,
                                qty_on_order: 0,
                                part_number: line.part_number, // Fallback
                                description: line.description, // Fallback
                                last_ordered_date: wo.wo_date || wo.created_date,
                                last_ordered_ro: wo.ro_number,
                                wos: []
                            };
                            missingInventoryIds.add(itemId);
                        }

                        itemsMap[itemId].qty_on_order += qtyOnOrder;
                        
                        // Track which WO has the most recent date for "Last Ordered" logic
                        const currentWoDate = new Date(wo.wo_date || wo.created_date).getTime();
                        const storedDate = new Date(itemsMap[itemId].last_ordered_date).getTime();
                        
                        if (currentWoDate > storedDate) {
                            itemsMap[itemId].last_ordered_date = wo.wo_date || wo.created_date;
                            itemsMap[itemId].last_ordered_ro = wo.ro_number;
                        }
                        
                        // Keep track of all WOs for this item (optional, good for debugging or advanced view)
                        itemsMap[itemId].wos.push(wo.ro_number);
                    }
                }
            }
        }

        const aggregatedItems = Object.values(itemsMap);
        
        if (aggregatedItems.length === 0) {
             return Response.json({ success: true, data: [] });
        }

        // 3. Fetch Inventory Item Details and Suppliers
        const inventoryIds = Array.from(missingInventoryIds);
        // Fetch in chunks if too many (basic implementation here assumes manageable size)
        const inventoryItems = await base44.entities.InventoryItem.filter({
            id: { $in: inventoryIds }
        });
        
        const suppliersResponse = await base44.asServiceRole.functions.invoke('SupabaseProxy', {
            action: 'read',
            table: 'Supplier'
        });
        const suppliers = suppliersResponse?.data?.data || [];
        const supplierMap = Object.fromEntries(suppliers.map(s => [s.id, s.name]));

        // 4. Merge Data
        const enrichedItems = aggregatedItems.map(aggItem => {
            const invItem = inventoryItems.find(i => i.id === aggItem.inventory_item_id);
            
            if (invItem) {
                const supplierName = supplierMap[invItem.supplier_id] || 'No Supplier';
                return {
                    ...invItem, // Keep all inventory fields
                    quantity_on_order: aggItem.qty_on_order, // OVERWRITE with calculated value
                    last_ordered_date: aggItem.last_ordered_date,
                    last_ordered_ro: aggItem.last_ordered_ro,
                    supplier_name: supplierName,
                    total_value: (aggItem.qty_on_order * (invItem.cost || 0))
                };
            } else {
                // Item might have been deleted but still referenced in WO
                return {
                    id: aggItem.inventory_item_id,
                    part_number: aggItem.part_number,
                    description: aggItem.description,
                    quantity_on_order: aggItem.qty_on_order,
                    last_ordered_date: aggItem.last_ordered_date,
                    last_ordered_ro: aggItem.last_ordered_ro,
                    supplier_name: 'Unknown (Deleted Item)',
                    total_value: 0
                };
            }
        });

        return Response.json({ success: true, data: enrichedItems });

    } catch (error) {
        console.error('getRealTimeInventoryOnOrder error:', error);
        return Response.json({ error: error.message }, { status: 500 });
    }
});