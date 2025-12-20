import { createClientFromRequest } from 'npm:@base44/sdk@0.8.4';

const WORKPRO_APP_ID = '68b3caadfc9d9a1ea34d2018';
const WORKPRO_API_KEY = '835a11119e7d4b84a59f8f7a180b7e61';
const API_BASE_URL = `https://app.base44.com/api/apps/${WORKPRO_APP_ID}/entities`;

Deno.serve(async (req) => {
    try {
        const response = await fetch(`${API_BASE_URL}/UnassignedTimeRecord?limit=1`, {
            headers: { 'api_key': WORKPRO_API_KEY }
        });

        if (response.ok) {
            const data = await response.json();
            return Response.json({ success: true, data });
        } else {
            return Response.json({ success: false, status: response.status, statusText: response.statusText });
        }
    } catch (error) {
        return Response.json({ error: error.message });
    }
});