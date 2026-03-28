import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';
import { createClient } from 'npm:@supabase/supabase-js@2.39.3';

const ALLOWED_SORT_FIELDS = new Set([
    'part_number',
    'description',
    'manufacturer',
    'category',
    'location',
    'cost',
    'selling_price',
    'quantity_on_hand',
    'quantity_on_order',
    'minimum_quantity',
    'maximum_quantity',
    'created_date',
    'updated_date'
]);

function applyInventoryFilter(query, filter) {
    if (filter === 'stocked') {
        return query.eq('stocked_item', true);
    }

    if (filter === 'non-stocked') {
        return query.eq('stocked_item', false);
    }

    if (filter === 'non-zero') {
        return query.gt('quantity_on_hand', 0);
    }

    if (filter === 'inventory-count') {
        return query.not('location', 'is', null).neq('location', '');
    }

    if (filter === 'no-location') {
        return query.or('location.is.null,location.eq.').gt('quantity_on_hand', 0);
    }

    return query;
}

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
            auth: { persistSession: false },
        });

        let searchTerm = '';
        let filter = 'all';
        let sortBy = 'part_number';
        let sortDirection = 'asc';
        let limit = 50;
        let offset = 0;

        try {
            const body = await req.json();
            searchTerm = body.searchTerm || '';
            filter = body.filter || 'all';
            sortBy = body.sortBy || 'part_number';
            sortDirection = body.sortDirection || 'asc';
            limit = Number(body.limit || 50);
            offset = Number(body.offset || 0);
        } catch {
            console.log('No JSON body, using defaults');
        }

        const normalizedSearchTerm = searchTerm.trim();
        const safeSortBy = ALLOWED_SORT_FIELDS.has(sortBy) ? sortBy : 'part_number';
        const ascending = sortDirection !== 'desc';
        const safeLimit = Math.max(1, Math.min(limit, 200));
        const safeOffset = Math.max(0, offset);

        if (normalizedSearchTerm) {
            const rpcPayload = {
                p_search_term: normalizedSearchTerm,
                p_filter: filter,
                p_sort_by: safeSortBy,
                p_sort_direction: ascending ? 'asc' : 'desc',
                p_limit: safeLimit,
                p_offset: safeOffset,
            };

            const { data, error } = await supabase.rpc('search_inventory_ranked', rpcPayload);

            console.log('searchInventory rpc payload:', rpcPayload);

            if (error) {
                console.error('Supabase search_inventory_ranked rpc error:', error);
                return Response.json({
                    error: 'Failed to fetch inventory',
                    details: error.message,
                    rpc_name: 'search_inventory_ranked'
                }, { status: 500 });
            }

            const records = data || [];
            const totalCount = records.length > 0 ? Number(records[0].total_count || 0) : 0;
            const cleanedRecords = records.map(({ total_count, match_rank, ...item }) => item);

            return Response.json({
                records: cleanedRecords,
                totalCount,
            });
        }

        let query = supabase
            .from('InventoryItem')
            .select('*', { count: 'exact' })
            .eq('is_active', true);

        query = applyInventoryFilter(query, filter);
        query = query.order(safeSortBy, { ascending, nullsFirst: false });
        query = query.range(safeOffset, safeOffset + safeLimit - 1);

        const { data, error, count } = await query;

        console.log('searchInventory standard query payload:', {
            searchTerm: normalizedSearchTerm,
            filter,
            sortBy: safeSortBy,
            sortDirection: ascending ? 'asc' : 'desc',
            limit: safeLimit,
            offset: safeOffset,
            returnedCount: data?.length || 0,
            totalCount: count || 0,
        });

        if (error) {
            console.error('Supabase InventoryItem query error:', error);
            return Response.json({ error: 'Failed to fetch inventory', details: error.message }, { status: 500 });
        }

        return Response.json({
            records: data || [],
            totalCount: count || 0,
        });
    } catch (error) {
        console.error('Error in searchInventory:', error);
        return Response.json({
            error: error.message,
            stack: error.stack,
        }, { status: 500 });
    }
});