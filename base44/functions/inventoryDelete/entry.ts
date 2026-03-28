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
        const itemId = body.itemId;

        if (!itemId) {
            return Response.json({ error: 'itemId is required' }, { status: 400 });
        }

        const supabase = createClient(supabaseUrl, supabaseSecret, {
            auth: { persistSession: false },
        });

        const { error } = await supabase
            .from('InventoryItem')
            .delete()
            .eq('id', itemId);

        if (error) {
            console.error('Supabase InventoryItem delete error:', error);
            return Response.json({ error: 'Failed to delete inventory item', details: error.message }, { status: 500 });
        }

        return Response.json({ success: true });
    } catch (error) {
        console.error('Error in inventoryDelete:', error);
        return Response.json({ error: error.message }, { status: 500 });
    }
});