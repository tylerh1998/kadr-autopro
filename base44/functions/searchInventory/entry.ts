import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();

        if (!user) {
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const supabaseUrl = Deno.env.get("Supabase_project_url");
        const supabaseSecret = Deno.env.get("Supabase_Secret_Key");

        if (!supabaseUrl || !supabaseSecret) {
            return Response.json({ error: 'Supabase credentials not configured' }, { status: 500 });
        }

        const { createClient } = await import('npm:@supabase/supabase-js@2.39.3');
        const supabase = createClient(supabaseUrl, supabaseSecret, {
            auth: {
                persistSession: false,
            },
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
            limit = body.limit || 50;
            offset = body.offset || 0;
        } catch {
            console.log('No JSON body, using defaults');
        }

        let query = supabase
            .from('InventoryItem')
            .select('*')
            .eq('is_active', true);

        if (filter === 'stocked') {
            query = query.eq('stocked_item', true);
        } else if (filter === 'non-stocked') {
            query = query.eq('stocked_item', false);
        }

        const { data: allMatchingItems, error } = await query;

        if (error) {
            console.error('Supabase InventoryItem query error:', error);
            return Response.json({ error: 'Failed to fetch inventory', details: error }, { status: 500 });
        }

        let filteredItems = allMatchingItems || [];
        let hasSearchTerm = false;

        if (searchTerm && searchTerm.trim() !== '') {
            hasSearchTerm = true;
            const searchLower = searchTerm.trim().toLowerCase();
            filteredItems = filteredItems.filter(item => {
                const partNumber = (item.part_number || '').toLowerCase();
                const description = (item.description || '').toLowerCase();
                const manufacturer = (item.manufacturer || '').toLowerCase();

                return partNumber.includes(searchLower) ||
                    description.includes(searchLower) ||
                    manufacturer.includes(searchLower);
            });

            filteredItems = filteredItems.map(item => {
                const partNumber = (item.part_number || '').toLowerCase();
                const description = (item.description || '').toLowerCase();
                const manufacturer = (item.manufacturer || '').toLowerCase();

                let relevancyScore = 0;

                if (partNumber === searchLower) {
                    relevancyScore = 100;
                } else if (partNumber.startsWith(searchLower)) {
                    relevancyScore = 80;
                } else if (partNumber.includes(searchLower)) {
                    relevancyScore = 60;
                } else if (description.startsWith(searchLower)) {
                    relevancyScore = 40;
                } else if (description.includes(searchLower)) {
                    relevancyScore = 20;
                } else if (manufacturer.includes(searchLower)) {
                    relevancyScore = 10;
                }

                return { ...item, _relevancyScore: relevancyScore };
            });
        }

        if (filter === 'no-location') {
            filteredItems = filteredItems.filter(item => {
                const hasNoLocation = !item.location || item.location.trim() === '';
                const hasQOH = (item.quantity_on_hand || 0) > 0;
                return hasNoLocation && hasQOH;
            });
        }

        if (filter === 'non-zero') {
            filteredItems = filteredItems.filter(item => (item.quantity_on_hand || 0) > 0);
        }

        if (filter === 'inventory-count') {
            filteredItems = filteredItems.filter(item => item.location && item.location.trim() !== '');
        }

        filteredItems.sort((a, b) => {
            if (hasSearchTerm) {
                const aScore = a._relevancyScore || 0;
                const bScore = b._relevancyScore || 0;

                if (aScore !== bScore) {
                    return bScore - aScore;
                }

                const aPartNum = (a.part_number || '').toLowerCase();
                const bPartNum = (b.part_number || '').toLowerCase();
                return aPartNum < bPartNum ? -1 : aPartNum > bPartNum ? 1 : 0;
            }

            let aVal = a[sortBy];
            let bVal = b[sortBy];

            if (sortBy === 'location') {
                const aEmpty = !aVal || aVal.trim() === '';
                const bEmpty = !bVal || bVal.trim() === '';

                if (aEmpty && !bEmpty) return 1;
                if (!aEmpty && bEmpty) return -1;
            }

            if (aVal == null && bVal == null) return 0;
            if (aVal == null) return 1;
            if (bVal == null) return -1;

            const aIsNumber = typeof aVal === 'number';
            const bIsNumber = typeof bVal === 'number';

            if (aIsNumber && bIsNumber) {
                return sortDirection === 'asc' ? aVal - bVal : bVal - aVal;
            }

            aVal = String(aVal).toLowerCase();
            bVal = String(bVal).toLowerCase();

            if (sortDirection === 'asc') {
                return aVal < bVal ? -1 : aVal > bVal ? 1 : 0;
            }

            return aVal > bVal ? -1 : aVal < bVal ? 1 : 0;
        });

        if (hasSearchTerm) {
            filteredItems = filteredItems.map(({ _relevancyScore, ...item }) => item);
        }

        const totalCount = filteredItems.length;
        const paginatedItems = filteredItems.slice(offset, offset + limit);

        return Response.json({
            records: paginatedItems,
            totalCount,
        });
    } catch (error) {
        console.error('Error in searchInventory:', error);
        return Response.json({
            error: error.message,
            stack: error.stack,
        }, { status: 500 });
    }
});