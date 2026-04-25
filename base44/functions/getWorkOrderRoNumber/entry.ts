import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';
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
      return Response.json({ error: 'Supabase credentials missing' }, { status: 500 });
    }

    const { workOrderId } = await req.json();
    if (!workOrderId) {
      return Response.json({ error: 'workOrderId is required' }, { status: 400 });
    }

    const supabase = createClient(supabaseUrl, supabaseSecret, { auth: { persistSession: false } });
    const result = await supabase
      .from('WorkOrder')
      .select('ro_number')
      .eq('id', workOrderId)
      .single();

    if (result.error) throw result.error;
    if (!result.data?.ro_number) {
      return Response.json({ error: 'Work order not found' }, { status: 404 });
    }

    return Response.json({ ro_number: result.data.ro_number });
  } catch (error) {
    console.error('Get WorkOrder RO number error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});