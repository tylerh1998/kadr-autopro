import { createClientFromRequest } from 'npm:@base44/sdk@0.8.21';
import { createClient } from 'npm:@supabase/supabase-js@2.39.3';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (user?.role !== 'admin') {
      return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
    }

    const supabaseUrl = Deno.env.get('Supabase_project_url');
    const supabaseSecret = Deno.env.get('Supabase_Secret_Key');

    if (!supabaseUrl || !supabaseSecret) {
      return Response.json({ error: 'Supabase credentials not configured' }, { status: 500 });
    }

    const supabase = createClient(supabaseUrl, supabaseSecret, {
      auth: { persistSession: false }
    });

    const beforeResult = await supabase
      .from('WorkOrder')
      .select('id', { count: 'exact', head: true });

    if (beforeResult.error) {
      return Response.json({ error: beforeResult.error.message }, { status: 500 });
    }

    const deleteResult = await supabase
      .from('WorkOrder')
      .delete()
      .not('id', 'is', null);

    if (deleteResult.error) {
      return Response.json({ error: deleteResult.error.message }, { status: 500 });
    }

    return Response.json({
      success: true,
      deletedCount: beforeResult.count || 0,
      entitySchemaDeleted: true,
      table: 'WorkOrder'
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});