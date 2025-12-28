import { createClientFromRequest } from 'npm:@base44/sdk@0.7.1';

// These are the credentials for the external WorkPRO application
const WORKPRO_APP_ID = '68b3caadfc9d9a1ea34d2018';
const API_BASE_URL = `https://app.base44.com/api/apps/${WORKPRO_APP_ID}/entities`;

Deno.serve(async (req) => {
    try {
        // First, authenticate the user making the request from our own app's frontend
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();
        if (!user) {
            return new Response(JSON.stringify({ error: 'Unauthorized' }), {
                status: 401,
                headers: { 'Content-Type': 'application/json' },
            });
        }

        const WORKPRO_API_KEY = Deno.env.get("WORKPRO_API_KEY");
        if (!WORKPRO_API_KEY) {
            return new Response(JSON.stringify({ error: 'WORKPRO_API_KEY not set' }), { status: 500 });
        }

        // If authenticated, proceed to fetch data from the external WorkPRO app on the server-side
        const response = await fetch(`${API_BASE_URL}/ChatMessage`, {
            headers: {
                'api_key': WORKPRO_API_KEY,
                'Content-Type': 'application/json'
            }
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error(`Error from WorkPRO API: ${response.status} ${response.statusText}`, errorText);
            return new Response(JSON.stringify({ error: `Failed to fetch messages from WorkPRO: ${response.statusText}` }), {
                status: response.status,
                headers: { 'Content-Type': 'application/json' },
            });
        }

        const data = await response.json();

        // Return the fetched data to our frontend
        return new Response(JSON.stringify(data), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
        });

    } catch (error) {
        console.error('Error in getWorkProMessages function:', error);
        return new Response(JSON.stringify({ error: error.message }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' },
        });
    }
});