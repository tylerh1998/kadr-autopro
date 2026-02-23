import { createClientFromRequest } from 'npm:@base44/sdk@0.8.4';

export const getPartsMovementReport = async (req) => {
    const base44 = createClientFromRequest(req);
    
    try {
        const user = await base44.auth.me();
        if (!user) {
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { dateFrom, dateTo, search } = await req.json();

        // Build query for Work Orders
        const query = {
            stage: { $in: ['invoice', 'credit_invoice'] }
        };

        if (dateFrom && dateTo) {
            query.invoice_date = {
                $gte: dateFrom,
                $lte: dateTo
            };
        }

        // Fetch Work Orders
        // Limit 5000 should cover a reasonable timeframe. 
        // For very large datasets, we'd need more complex batching.
        const workOrders = await base44.entities.WorkOrder.filter(query, '-invoice_date', 5000);

        // Aggregate Data
        // Map: inventory_item_id -> { qty: 0, salesCount: 0 }
        // salesCount = number of times it appeared on a line? Or total qty?
        // User said "# of Sales". Usually means Quantity Sold in movement reports.
        // I will track both: totalQty and transactionCount just in case.
        const partStats = {};
        const inventoryIds = new Set();

        workOrders.forEach(wo => {
            if (!wo.line_items) return;
            try {
                const lines = JSON.parse(wo.line_items);
                if (!Array.isArray(lines)) return;

                lines.forEach(line => {
                    if (!line.inventory_item_id) return;

                    const id = line.inventory_item_id;
                    const qty = parseFloat(line.qty) || 0;

                    if (!partStats[id]) {
                        partStats[id] = {
                            qty: 0,
                            transactions: 0
                        };
                        inventoryIds.add(id);
                    }

                    partStats[id].qty += qty;
                    partStats[id].transactions += 1;
                });
            } catch (e) {
                // ignore parse error
            }
        });

        if (inventoryIds.size === 0) {
            return Response.json({ data: [] });
        }

        // Fetch Inventory Item Details
        // We need to fetch details for all these IDs.
        // Base44 filter with $in has limits? Usually safe for a few hundred.
        // If thousands, we might need to batch or list all.
        // Let's try listing all active items first if the set is large, or just filter.
        // Safer to fetch all items if ID count is high, or batch.
        // Let's assume fetching all inventory items is okay for now (usually < 10k items).
        // Or better: filter by IDs.
        
        const idsArray = Array.from(inventoryIds);
        let inventoryItems = [];
        
        // Batch fetch in chunks of 100 to be safe
        const chunkSize = 100;
        for (let i = 0; i < idsArray.length; i += chunkSize) {
            const chunk = idsArray.slice(i, i + chunkSize);
            const batch = await base44.entities.InventoryItem.filter({ id: { $in: chunk } }, '', 1000);
            inventoryItems = inventoryItems.concat(batch);
        }
        
        // Map Inventory Details
        const inventoryMap = {};
        inventoryItems.forEach(item => {
            inventoryMap[item.id] = item;
        });

        // Build Report List
        let report = [];

        Object.keys(partStats).forEach(id => {
            const stats = partStats[id];
            const item = inventoryMap[id];
            
            // If item deleted/not found, we might still want to show it with unknown info or skip?
            // Let's show it if we have stats, but maybe with fallback text.
            // Actually, if we can't find the item, we can't show Part # or Desc unless we saved it in line items.
            // But the requirements say "Columns: Part #, Description..." from inventory item.
            // The line item usually has a snapshot of part_number and description.
            // But we didn't store that in partStats loop.
            // Let's only show items we found in inventory for now to ensure we have current Category/Price.
            if (!item) return;

            report.push({
                id: item.id,
                partNumber: item.part_number,
                description: item.description,
                category: item.category,
                listPrice: item.selling_price,
                salesCount: stats.qty // "# of Sales" -> Quantity
            });
        });

        // Filter by Search (if provided)
        if (search) {
            const searchLower = search.toLowerCase();
            report = report.filter(item => 
                (item.partNumber && item.partNumber.toLowerCase().includes(searchLower)) ||
                (item.description && item.description.toLowerCase().includes(searchLower)) ||
                (item.category && item.category.toLowerCase().includes(searchLower))
            );
        }

        // Sort by # of Sales DESC
        report.sort((a, b) => b.salesCount - a.salesCount);

        return Response.json({
            data: report,
            count: report.length
        });

    } catch (error) {
        console.error("Error generating parts movement report:", error);
        return Response.json({ error: error.message }, { status: 500 });
    }
};

Deno.serve(getPartsMovementReport);