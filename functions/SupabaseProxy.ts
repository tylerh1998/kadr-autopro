import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();
        
        if (!user) {
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const supabaseUrl = Deno.env.get("Supabase_project_url");
        const supabaseKey = Deno.env.get("Supabase_Publishable_key");
        const supabaseSecret = Deno.env.get("Supabase_Secret_Key");

        if (!supabaseUrl || !supabaseKey || !supabaseSecret) {
            return Response.json({ error: 'Supabase credentials not configured' }, { status: 500 });
        }

        // Remove trailing slash if present
        const baseUrl = supabaseUrl.replace(/\/$/, '');
        const url = `${baseUrl}/rest/v1/SalesClass?select=*`;

        const response = await fetch(url, {
            method: 'GET',
            headers: {
                'apikey': supabaseKey,
                'Authorization': `Bearer ${supabaseSecret}`,
                'Content-Type': 'application/json'
            }
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error("Supabase error:", errorText);
            return Response.json({ error: 'Failed to fetch from Supabase', details: errorText }, { status: response.status });
        }

        const data = await response.json();
        
        return Response.json({ data });
    } catch (error) {
        console.error("SupabaseProxy error:", error);
        return Response.json({ error: error.message }, { status: 500 });
    }
});