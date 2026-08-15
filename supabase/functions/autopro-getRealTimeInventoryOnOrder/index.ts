import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.6";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
const jsonHeaders = { ...corsHeaders, 'Content-Type': 'application/json' };

const PAGE_SIZE = 1000;
const INVENTORY_ON_ORDER_SELECT = 'id, line_items, ro_number, wo_date, created_date';
const SUPPLIER_SELECT = 'id, name';

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

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Deliberate security improvement over the base44 original (which had zero auth
    // gating) — matches every sibling autopro-* function's convention. See plan 3.6.
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Missing Authorization header' }), { status: 200, headers: jsonHeaders });
    }
    const { data: { user }, error: authError } = await supabase.auth.getUser(authHeader.replace('Bearer ', ''));
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 200, headers: jsonHeaders });
    }

    // 1. Fetch active Work Orders
    const activeWorkOrders = await fetchAllRows((from, to) =>
      supabase
        .from('WorkOrder')
        .select(INVENTORY_ON_ORDER_SELECT)
        .eq('stage', 'work_order')
        .order('wo_date', { ascending: false, nullsFirst: false })
        .range(from, to)
    );

    // 2. Aggregate counts from Line Items
    const itemsMap = {};
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

          if (itemId) {
            if (!itemsMap[itemId]) {
              itemsMap[itemId] = {
                inventory_item_id: itemId,
                qty_on_order: 0,
                part_number: line.part_number,
                description: line.description,
                last_ordered_date: wo.wo_date || wo.created_date,
                last_ordered_ro: wo.ro_number,
                wos: []
              };
              missingInventoryIds.add(itemId);
            }

            itemsMap[itemId].qty_on_order += qtyOnOrder;

            const currentWoDate = new Date(wo.wo_date || wo.created_date).getTime();
            const storedDate = new Date(itemsMap[itemId].last_ordered_date).getTime();

            if (currentWoDate > storedDate) {
              itemsMap[itemId].last_ordered_date = wo.wo_date || wo.created_date;
              itemsMap[itemId].last_ordered_ro = wo.ro_number;
            }

            itemsMap[itemId].wos.push(wo.ro_number);
          }
        }
      }
    }

    const aggregatedItems = Object.values(itemsMap);

    if (aggregatedItems.length === 0) {
      return new Response(JSON.stringify({ success: true, data: [] }), { status: 200, headers: jsonHeaders });
    }

    // 3. Fetch Inventory Item Details and Suppliers (InventoryItem is fully native)
    const inventoryIds = Array.from(missingInventoryIds);
    let inventoryItems = [];
    const chunkSize = 200;
    for (let i = 0; i < inventoryIds.length; i += chunkSize) {
      const chunk = inventoryIds.slice(i, i + chunkSize);
      const { data, error: invError } = await supabase
        .from('InventoryItem')
        .select('*')
        .in('id', chunk);
      if (invError) throw invError;
      inventoryItems.push(...(data || []));
    }

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
          ...invItem,
          quantity_on_order: aggItem.qty_on_order,
          last_ordered_date: aggItem.last_ordered_date,
          last_ordered_ro: aggItem.last_ordered_ro,
          supplier_name: supplierName,
          total_value: (aggItem.qty_on_order * (invItem.cost || 0))
        };
      } else {
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

    return new Response(JSON.stringify({ success: true, data: enrichedItems }), { status: 200, headers: jsonHeaders });

  } catch (error) {
    console.error('getRealTimeInventoryOnOrder error:', error);
    return new Response(JSON.stringify({ error: error.message }), { status: 200, headers: jsonHeaders });
  }
});
