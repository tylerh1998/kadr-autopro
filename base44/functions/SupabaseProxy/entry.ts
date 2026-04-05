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

        const reqBody = await req.json().catch(() => ({}));
        console.log("DEBUG SupabaseProxy received payload:", JSON.stringify(reqBody));
        const { action = 'read', id, data: payloadData, table = 'SalesClass', match, params } = reqBody;

        let result;
        
        if (action === 'read' || action === 'list') {
            let query = supabase.from(table).select('*');
            if (match) {
                query = query.match(match);
            }
            result = await query;
        } else if (action === 'filter') {
            let query = supabase.from(table).select('*');
            if (params) {
                query = query.match(params);
            }
            result = await query;
        } else if (action === 'create') {
            const newId = crypto.randomUUID().replace(/-/g, '').substring(0, 24);
            const now = new Date().toISOString();
            const insertData = {
                id: newId,
                created_date: now,
                updated_date: now,
                created_by: user.email,
                ...payloadData
            };
            result = await supabase.from(table).insert([insertData]).select();
        } else if (action === 'update') {
            const updateData = {
                updated_date: new Date().toISOString(),
                ...payloadData
            };
            result = await supabase.from(table).update(updateData).eq('id', id).select();
        } else if (action === 'delete') {
            result = await supabase.from(table).delete().eq('id', id);
        }

        if (result.error) {
            console.error("Supabase error:", result.error);
            return Response.json({ error: 'Failed to perform Supabase operation', details: result.error }, { status: 500 });
        }
        
        return Response.json({ data: result.data });
    } catch (error) {
        console.error("SupabaseProxy error:", error);
        return Response.json({ error: error.message }, { status: 500 });
    }
});