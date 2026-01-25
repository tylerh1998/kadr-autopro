import { createClientFromRequest } from 'npm:@base44/sdk@0.8.4';

const PORTAL_APP_ID = '68c2336578e56a2a43619143';
const PORTAL_API_KEY = '835a11119e7d4b84a59f8f7a180b7e61';
const BASE_URL = `https://app.base44.com/api/apps/${PORTAL_APP_ID}/entities/Approvals`;

Deno.serve(async (req) => {
    try {
        // Authenticate the user making the request
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();
        
        if (!user) {
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { work_order_id } = await req.json();

        if (!work_order_id) {
            return Response.json({ error: 'work_order_id is required' }, { status: 400 });
        }

        // Construct the external API URL with query parameters
        const url = new URL(BASE_URL);
        const query = { work_order_id: work_order_id.trim() };
        url.searchParams.append('query', JSON.stringify(query));
        url.searchParams.append('sort', '-created_date');
        console.log(`Request URL: ${url.toString()}`);

        console.log(`Fetching portal approvals for WO: ${work_order_id}`);

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
        
        return Response.json({ success: true, data: data });

    } catch (error) {
        console.error('Error in getPortalApprovals:', error);
        return Response.json({ error: error.message }, { status: 500 });
    }
});