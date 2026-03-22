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

        console.log(`Fetching portal approvals for WO: ${work_order_id}`);

        // WORKAROUND: The external API seems to return empty results when using ?query= parameter
        // So we fetch the latest 100 approvals and filter manually in memory.
        const url = new URL(BASE_URL);
        url.searchParams.append('sort', '-created_date');
        url.searchParams.append('limit', '100');

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

        const allApprovals = await response.json();
        
        // Filter manually
        const filteredApprovals = allApprovals.filter(approval => 
            approval.work_order_id === work_order_id || 
            // Also try trimming just in case
            (approval.work_order_id && approval.work_order_id.trim() === work_order_id.trim())
        );
        
        console.log(`Fetched ${allApprovals.length} total, found ${filteredApprovals.length} matching.`);

        return Response.json({ success: true, data: filteredApprovals });

    } catch (error) {
        console.error('Error in getPortalApprovals:', error);
        return Response.json({ error: error.message }, { status: 500 });
    }
});