import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';
import { createClient } from 'npm:@supabase/supabase-js@2.39.3';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();

        if (!user) {
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const supabaseUrl = Deno.env.get('Supabase_project_url');
        const supabaseSecret = Deno.env.get('Supabase_Secret_Key');

        if (!supabaseUrl || !supabaseSecret) {
            return Response.json({ error: 'Supabase credentials not configured' }, { status: 500 });
        }

        const body = await req.json();
        const itemData = body.itemData;

        if (!itemData || typeof itemData !== 'object' || Array.isArray(itemData)) {
            return Response.json({ error: 'itemData must be an object' }, { status: 400 });
        }

        const supabase = createClient(supabaseUrl, supabaseSecret, {
            auth: { persistSession: false },
        });

        const { data, error } = await supabase
            .from('InventoryItem')
            .insert(itemData)
            .select()
            .single();

        if (error) {
            console.error('Supabase InventoryItem insert error:', error);
            return Response.json({ error: 'Failed to create inventory item', details: error.message }, { status: 500 });
        }

        return Response.json({ success: true, data });
    } catch (error) {
        console.error('Error in inventoryAdd:', error);
        return Response.json({ error: error.message }, { status: 500 });
    }
});