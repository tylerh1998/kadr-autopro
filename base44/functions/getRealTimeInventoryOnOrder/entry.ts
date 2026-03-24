import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';
import { createClient } from 'npm:@supabase/supabase-js@2.39.3';

const PAGE_SIZE = 1000;
const INVENTORY_ON_ORDER_SELECT = 'id, line_items, ro_number, wo_date, created_date';
const SUPPLIER_SELECT = 'id, name';

const createSupabaseClient = () => {
    const supabaseUrl = Deno.env.get('Supabase_project_url');
    const supabaseSecret = Deno.env.get('Supabase_Secret_Key');

    if (!supabaseUrl || !supabaseSecret) {
        throw new Error('Supabase credentials not configured');
    }

    return createClient(supabaseUrl, supabaseSecret, {
        auth: { persistSession: false }
    });
};

const fetchAllRows = async (queryFactory) => {
    const rows = [];
    let from = 0;

    while (true) {
        const { data, error } = await queryFactory(from, from + PAGE_SIZE - 1);
        if (error) throw error;

        const batch = data || [];
        rows.push(...batch);

        if (batch.length < PAGE_SIZE) {
            break;
        }

        from += PAGE_SIZE;
    }

    return rows;
};

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        
        const supabase = createSupabaseClient();

        // 1. Fetch active Work Orders
        // We only care about active WOs where parts might be on order. 
        // 'work_order' stage is the primary one. 'estimate' usually doesn't trigger "on order" until converted.
        const activeWorkOrders = await fetchAllRows((from, to) =>
            supabase
                .from('WorkOrder')
                .select(INVENTORY_ON_ORDER_SELECT)
                .eq('stage', 'work_order')
                .order('wo_date', { ascending: false, nullsFirst: false })
                .range(from, to)
        );

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
        
        const suppliers = await fetchAllRows((from, to) =>
            supabase
                .from('Supplier')
                .select(SUPPLIER_SELECT)
                .order('name', { ascending: true, nullsFirst: false })
                .range(from, to)
        );
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