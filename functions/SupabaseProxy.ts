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

        // Use the official Supabase client
        const { createClient } = await import('npm:@supabase/supabase-js@2.39.3');
        
        // We use the secret key to bypass RLS if needed, or publishable key
        // The user mentioned they are using publishable and secret API keys.
        const supabase = createClient(supabaseUrl, supabaseSecret, {
            auth: {
                persistSession: false
            }
        });

        const { data, error } = await supabase
            .from('SalesClass')
            .select('*');

        if (error) {
            console.error("Supabase error:", error);
            return Response.json({ error: 'Failed to fetch from Supabase', details: error }, { status: 500 });
        }
        
        return Response.json({ data });
    } catch (error) {
        console.error("SupabaseProxy error:", error);
        return Response.json({ error: error.message }, { status: 500 });
    }
});