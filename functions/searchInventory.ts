import { createClientFromRequest } from 'npm:@base44/sdk@0.8.4';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();

        if (!user) {
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
        }

        // Parse request body
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
        } catch (e) {
            console.log('No JSON body, using defaults');
        }

        // Build base query - only active items
        let query = { is_active: true };

        // Add stocked/non-stocked filter
        if (filter === 'stocked') {
            query.stocked_item = true;
        } else if (filter === 'non-stocked') {
            query.stocked_item = false;
        }

        // Fetch ALL matching records based on basic filters
        // Note: We'll handle sorting in JavaScript to properly handle location sorting
        const allMatchingItems = await base44.asServiceRole.entities.InventoryItem.filter(
            query,
            'part_number' // Default fetch order
        );

        // Apply search filter in JavaScript (more reliable than regex in query)
        let filteredItems = allMatchingItems;
        let hasSearchTerm = false;
        if (searchTerm && searchTerm.trim() !== '') {
            hasSearchTerm = true;
            const searchLower = searchTerm.trim().toLowerCase();
            filteredItems = allMatchingItems.filter(item => {
                const partNumber = (item.part_number || '').toLowerCase();
                const description = (item.description || '').toLowerCase();
                const manufacturer = (item.manufacturer || '').toLowerCase();
                
                return partNumber.includes(searchLower) || 
                       description.includes(searchLower) || 
                       manufacturer.includes(searchLower);
            });

            // Calculate relevancy score for each item
            filteredItems = filteredItems.map(item => {
                const partNumber = (item.part_number || '').toLowerCase();
                const description = (item.description || '').toLowerCase();
                const manufacturer = (item.manufacturer || '').toLowerCase();
                
                let relevancyScore = 0;
                
                // Exact match in part_number (highest priority)
                if (partNumber === searchLower) {
                    relevancyScore = 100;
                }
                // Part number starts with search term
                else if (partNumber.startsWith(searchLower)) {
                    relevancyScore = 80;
                }
                // Part number contains search term
                else if (partNumber.includes(searchLower)) {
                    relevancyScore = 60;
                }
                // Description starts with search term
                else if (description.startsWith(searchLower)) {
                    relevancyScore = 40;
                }
                // Description contains search term
                else if (description.includes(searchLower)) {
                    relevancyScore = 20;
                }
                // Manufacturer contains search term
                else if (manufacturer.includes(searchLower)) {
                    relevancyScore = 10;
                }
                
                return { ...item, _relevancyScore: relevancyScore };
            });
        }

        // Apply no-location filter (after search filter)
        if (filter === 'no-location') {
            filteredItems = filteredItems.filter(item => {
                const hasNoLocation = !item.location || item.location.trim() === '';
                const hasQOH = (item.quantity_on_hand || 0) > 0;
                return hasNoLocation && hasQOH;
            });
        }

        // Apply non-zero QOH filter (after search filter)
        if (filter === 'non-zero') {
            filteredItems = filteredItems.filter(item => {
                return (item.quantity_on_hand || 0) > 0;
            });
        }

        // Apply inventory-count filter (items with location only)
        if (filter === 'inventory-count') {
            filteredItems = filteredItems.filter(item => {
                const hasLocation = item.location && item.location.trim() !== '';
                return hasLocation;
            });
        }

        // Apply sorting in JavaScript
        filteredItems.sort((a, b) => {
            // If search term provided, sort by relevancy first
            if (hasSearchTerm) {
                const aScore = a._relevancyScore || 0;
                const bScore = b._relevancyScore || 0;
                
                // Higher score comes first
                if (aScore !== bScore) {
                    return bScore - aScore;
                }
                
                // Same relevancy score - fall back to part_number ascending
                const aPartNum = (a.part_number || '').toLowerCase();
                const bPartNum = (b.part_number || '').toLowerCase();
                return aPartNum < bPartNum ? -1 : aPartNum > bPartNum ? 1 : 0;
            }

            // No search term - use standard sorting
            let aVal = a[sortBy];
            let bVal = b[sortBy];

            // Special handling for location field - push empty locations to bottom
            if (sortBy === 'location') {
                const aEmpty = !aVal || aVal.trim() === '';
                const bEmpty = !bVal || bVal.trim() === '';
                
                // If one is empty and the other isn't, empty goes to bottom
                if (aEmpty && !bEmpty) return 1;
                if (!aEmpty && bEmpty) return -1;
                
                // If both empty or both have values, continue with normal sorting
            }

            // Handle null/undefined values
            if (aVal == null && bVal == null) return 0;
            if (aVal == null) return 1;
            if (bVal == null) return -1;

            // Convert to string for comparison
            aVal = String(aVal).toLowerCase();
            bVal = String(bVal).toLowerCase();

            // Apply sort direction
            if (sortDirection === 'asc') {
                return aVal < bVal ? -1 : aVal > bVal ? 1 : 0;
            } else {
                return aVal > bVal ? -1 : aVal < bVal ? 1 : 0;
            }
        });

        // Remove the temporary relevancy score before returning
        if (hasSearchTerm) {
            filteredItems = filteredItems.map(({ _relevancyScore, ...item }) => item);
        }

        // Get total count
        const totalCount = filteredItems.length;

        // Apply pagination
        const paginatedItems = filteredItems.slice(offset, offset + limit);

        return Response.json({ 
            records: paginatedItems, 
            totalCount: totalCount 
        });

    } catch (error) {
        console.error('Error in searchInventory:', error);
        return Response.json({ 
            error: error.message,
            stack: error.stack 
        }, { status: 500 });
    }
});