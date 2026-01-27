import { createClientFromRequest } from 'npm:@base44/sdk@0.8.4';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        let user;
        try {
            user = await base44.auth.me();
        } catch (e) {
            console.error("Auth error:", e);
            return new Response(JSON.stringify({ error: 'Authentication failed', details: e.message }), { status: 401, headers: { 'Content-Type': 'application/json' } });
        }
        
        if (!user) {
            return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { 'Content-Type': 'application/json' } });
        }

        let body;
        try {
            body = await req.json();
        } catch (e) {
            console.error("JSON parse error:", e);
            return new Response(JSON.stringify({ error: 'Invalid JSON body', details: e.message }), { status: 400, headers: { 'Content-Type': 'application/json' } });
        }

        const { entityName, method, params, id, sort, limit } = body;
        console.log(`WorkProProxy Request: ${method} ${entityName}`, { params, id, sort, limit });

        const WORKPRO_API_KEY = Deno.env.get("WORKPRO_API_KEY");
        const WORKPRO_APP_ID = Deno.env.get("WORKPRO_APP_ID") || '68b3caadfc9d9a1ea34d2018'; // Use secret or fallback for now

        if (!WORKPRO_API_KEY) {
            return new Response(JSON.stringify({ error: 'WORKPRO_API_KEY not set' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
        }

        const API_BASE_URL = `https://app.base44.com/api/apps/${WORKPRO_APP_ID}/entities`;
        let url = `${API_BASE_URL}/${entityName}`;
        let options = {
            headers: {
                'api_key': WORKPRO_API_KEY,
                'Content-Type': 'application/json'
            }
        };

        let responseData;

        switch (method) {
            case 'list':
                // For list, params can be sort order and limit passed in the body or separate properties
                const listSort = params?.sort || sort;
                const listLimit = params?.limit || limit;
                const listSkip = params?.skip;
                const listQuery = params?.query;
                
                const queryParams = new URLSearchParams();
                if (listSort) queryParams.append('sort', listSort);
                if (listLimit) queryParams.append('limit', listLimit);
                if (listSkip) queryParams.append('skip', listSkip);
                if (listQuery) queryParams.append('query', JSON.stringify(listQuery));
                
                if (Array.from(queryParams).length > 0) {
                    url += `?${queryParams.toString()}`;
                }
                
                options.method = 'GET';
                const listResponse = await fetch(url, options);
                if (!listResponse.ok) {
                    const errorText = await listResponse.text();
                    throw new Error(`WorkPRO API List Error: ${listResponse.status} ${errorText}`);
                }
                responseData = await listResponse.json();
                break;
            case 'filter':
                // Fetch all data first, then filter in memory as requested by user
                // Using a high limit to ensure we get enough records
                url += `?limit=2000&sort=-created_date`;
                options.method = 'GET';
                
                const fetchResponse = await fetch(url, options);
                if (!fetchResponse.ok) {
                    const errorText = await fetchResponse.text();
                    throw new Error(`WorkPRO API List (for Filter) Error: ${fetchResponse.status} ${errorText}`);
                }
                
                const allRecords = await fetchResponse.json();
                let filteredRecords = Array.isArray(allRecords) ? allRecords : (allRecords.records || []);

                // Apply filters from params
                if (params && Object.keys(params).length > 0) {
                    filteredRecords = filteredRecords.filter(record => {
                        return Object.entries(params).every(([key, value]) => {
                            // Skip _sort and _limit in params if they exist (though we handle them separately)
                            if (key === '_sort' || key === '_limit') return true;

                            // Handle $ne operator
                            if (typeof value === 'object' && value !== null && '$ne' in value) {
                                return record[key] != value['$ne'];
                            }
                            
                            // Loose equality to handle potential type mismatches
                            return record[key] == value;
                        });
                    });
                }

                // In-memory Sort
                const requestedSort = sort || (params && params._sort);
                if (requestedSort) {
                    const desc = requestedSort.startsWith('-');
                    const field = desc ? requestedSort.substring(1) : requestedSort;
                    
                    filteredRecords.sort((a, b) => {
                        const valA = a[field] || '';
                        const valB = b[field] || '';
                        
                        if (valA < valB) return desc ? 1 : -1;
                        if (valA > valB) return desc ? -1 : 1;
                        return 0;
                    });
                }

                // In-memory Limit
                const requestedLimit = limit || (params && params._limit);
                if (requestedLimit) {
                    filteredRecords = filteredRecords.slice(0, parseInt(requestedLimit));
                }

                responseData = filteredRecords;
                break;
            case 'get':
                if (!id) throw new Error('ID is required for get method');
                url += `/${id}`;
                options.method = 'GET';
                const getResponse = await fetch(url, options);
                if (!getResponse.ok) {
                    const errorText = await getResponse.text();
                    throw new Error(`WorkPRO API Get Error: ${getResponse.status} ${errorText}`);
                }
                responseData = await getResponse.json();
                break;
            case 'update':
                if (!id) throw new Error('ID is required for update method');
                url += `/${id}`;
                options.method = 'PUT';
                options.body = JSON.stringify(params || {});
                const updateResponse = await fetch(url, options);
                if (!updateResponse.ok) {
                    const errorText = await updateResponse.text();
                    throw new Error(`WorkPRO API Update Error: ${updateResponse.status} ${errorText}`);
                }
                responseData = await updateResponse.json();
                break;
            case 'create':
                let createParams = params || {};
                
                // Explicitly log for debugging
                if (entityName === 'TimeRecord') {
                    console.log(`[WorkProProxy] Attempting to set created_by for TimeRecord. Auth User: ${user?.email} (${user?.id})`);
                }

                if (entityName === 'TimeRecord' && user && user.email) {
                    createParams.created_by = user.email;
                    // Also try setting created_by_id if we can map it, but email should suffice if supported
                    console.log(`[WorkProProxy] Overriding created_by to: ${createParams.created_by}`);
                }
                
                if (entityName === 'TimeRecord') {
                     console.log('[WorkProProxy] Final Create Payload:', JSON.stringify(createParams));
                }

                options.method = 'POST';
                options.body = JSON.stringify(createParams);
                const createResponse = await fetch(url, options);
                if (!createResponse.ok) {
                    const errorText = await createResponse.text();
                    throw new Error(`WorkPRO API Create Error: ${createResponse.status} ${errorText}`);
                }
                responseData = await createResponse.json();
                break;
            case 'delete':
                if (!id) throw new Error('ID is required for delete method');
                url += `/${id}`;
                options.method = 'DELETE';
                const deleteResponse = await fetch(url, options);
                if (!deleteResponse.ok) {
                    const errorText = await deleteResponse.text();
                    throw new Error(`WorkPRO API Delete Error: ${deleteResponse.status} ${errorText}`);
                }
                responseData = await deleteResponse.json();
                break;
            default:
                return new Response(JSON.stringify({ error: `Unsupported method: ${method}` }), { status: 400, headers: { 'Content-Type': 'application/json' } });
        }

        return new Response(JSON.stringify({ success: true, data: responseData }), { status: 200, headers: { 'Content-Type': 'application/json' } });

    } catch (error) {
        console.error("WorkPRO Proxy Error:", error);
        return new Response(JSON.stringify({ error: error.message, stack: error.stack }), { status: 500, headers: { 'Content-Type': 'application/json' } });
    }
});