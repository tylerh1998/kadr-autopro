import { createClientFromRequest } from 'npm:@base44/sdk@0.8.4';

const PORTAL_APP_ID = '68c2336578e56a2a43619143';
const PORTAL_API_KEY = '835a11119e7d4b84a59f8f7a180b7e61';
const BASE_URL = `https://app.base44.com/api/apps/${PORTAL_APP_ID}/entities/Approvals`;

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();
        
        if (!user) {
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { work_order_id } = await req.json();

        if (!work_order_id) {
            return Response.json({ error: 'work_order_id is required' }, { status: 400 });
        }

        console.log(`Fetching portal approvals for WO: ${work_order_id}`);

        const url = new URL(BASE_URL);
        
        // TEST: Query by specific ID to verify query mechanism
        // The ID comes from the record we saw in the dump
        const knownId = "695d9297e17ba5e19880dfae";
        
        // Use standard query param construction
        const query = { id: knownId };
        
        // If this works, then 'work_order_id' is the problem (maybe indexing?)
        // If this fails, then passing 'query' param is the problem
        url.searchParams.append('query', JSON.stringify(query));
        
        console.error(`Request URL: ${url.toString()}`);

        const response = await fetch(url.toString(), {
            method: 'GET',
            headers: {
                'api_key': PORTAL_API_KEY,
                'Content-Type': 'application/json'
            }
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error('Portal API Error:', errorText);
            throw new Error(`Portal API responded with ${response.status}: ${errorText}`);
        }

        const data = await response.json();
        console.log(`Found ${data.length} records`);

        // If we found the record by ID, then try by work_order_id
        if (data.length > 0) {
            console.log("Query by ID worked! Now trying by work_order_id...");
            
            const url2 = new URL(BASE_URL);
            url2.searchParams.append('query', JSON.stringify({ work_order_id: work_order_id }));
            url2.searchParams.append('sort', '-created_date');
            
            const resp2 = await fetch(url2.toString(), {
                method: 'GET',
                headers: { 'api_key': PORTAL_API_KEY }
            });
            const data2 = await resp2.json();
            console.log(`Query by work_order_id found ${data2.length} records`);
            
            return Response.json({ success: true, data: data2 });
        } else {
            console.error("Query by ID FAILED. Returning empty.");
            return Response.json({ success: true, data: [] });
        }

    } catch (error) {
        console.error('Error in getPortalApprovals:', error);
        return Response.json({ error: error.message }, { status: 500 });
    }
});