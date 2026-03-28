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

        let query = supabase
            .from('InventoryItem')
            .select('*', { count: 'exact' })
            .eq('is_active', true);

        if (filter === 'stocked') {
            query = query.eq('stocked_item', true);
        } else if (filter === 'non-stocked') {
            query = query.eq('stocked_item', false);
        } else if (filter === 'non-zero') {
            query = query.gt('quantity_on_hand', 0);
        } else if (filter === 'inventory-count') {
            query = query.not('location', 'is', null).neq('location', '');
        } else if (filter === 'no-location') {
            query = query.or('location.is.null,location.eq.').gt('quantity_on_hand', 0);
        }

        if (normalizedSearchTerm) {
            const escapedSearchTerm = normalizedSearchTerm
                .replace(/,/g, '\\,')
                .replace(/\(/g, '\\(')
                .replace(/\)/g, '\\)');

            query = query.or(
                `part_number.ilike.%${escapedSearchTerm}%,description.ilike.%${escapedSearchTerm}%,manufacturer.ilike.%${escapedSearchTerm}%`
            );
        }

        query = query.order(safeSortBy, { ascending, nullsFirst: false });
        query = query.range(safeOffset, safeOffset + safeLimit - 1);

        const { data, error, count } = await query;

        console.log('searchInventory query payload:', {
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