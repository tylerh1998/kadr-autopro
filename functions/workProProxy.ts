import { createClientFromRequest } from 'npm:@base44/sdk@0.8.4';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();
        
        if (!user) {
            return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { 'Content-Type': 'application/json' } });
        }

        const { entityName, method, params, id, sort, limit } = await req.json();

        const WORKPRO_API_KEY = Deno.env.get("WORKPRO_API_KEY");
        const WORKPRO_APP_ID = '68b3caadfc9d9a1ea34d2018'; // Hardcoded from existing Layout.js

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
                // The SDK invoke passes a single body object.
                // If using params object for list options:
                const listSort = params?.sort || sort;
                const listLimit = params?.limit || limit;
                
                if (listSort) url += `?sort=${encodeURIComponent(listSort)}`;
                if (listLimit) url += `${listSort ? '&' : '?'}limit=${listLimit}`;
                
                options.method = 'GET';
                const listResponse = await fetch(url, options);
                if (!listResponse.ok) {
                    const errorText = await listResponse.text();
                    throw new Error(`WorkPRO API List Error: ${listResponse.status} ${errorText}`);
                }
                responseData = await listResponse.json();
                break;
            case 'filter':
                // For filter, params is the query object
                url += '/filter';
                // Check if sort/limit are provided for filter
                const filterSort = sort || (params && params._sort); // Check separate prop or inside params
                const filterLimit = limit || (params && params._limit);

                if (filterSort) url += `?sort=${encodeURIComponent(filterSort)}`;
                if (filterLimit) url += `${filterSort ? '&' : '?'}limit=${filterLimit}`;

                options.method = 'POST';
                // Remove special params from body if they were mixed in
                const filterBody = { ...params };
                delete filterBody._sort;
                delete filterBody._limit;
                
                options.body = JSON.stringify(filterBody || {});
                const filterResponse = await fetch(url, options);
                if (!filterResponse.ok) {
                    const errorText = await filterResponse.text();
                    throw new Error(`WorkPRO API Filter Error: ${filterResponse.status} ${errorText}`);
                }
                responseData = await filterResponse.json();
                break;
            case 'get':
                // For get, id is required
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
                // For update, id and params (data) are required
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
                // For create, params (data) are required
                options.method = 'POST';
                options.body = JSON.stringify(params || {});
                const createResponse = await fetch(url, options);
                if (!createResponse.ok) {
                    const errorText = await createResponse.text();
                    throw new Error(`WorkPRO API Create Error: ${createResponse.status} ${errorText}`);
                }
                responseData = await createResponse.json();
                break;
            case 'delete':
                // For delete, id is required
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
        console.error("WorkPRO Proxy Error:", error.message);
        return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { 'Content-Type': 'application/json' } });
    }
});