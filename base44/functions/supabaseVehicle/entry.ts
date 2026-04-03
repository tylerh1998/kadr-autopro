import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';
import { createClient } from 'npm:@supabase/supabase-js@2.39.3';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const supabaseUrl = Deno.env.get('Supabase_project_url');
    const supabaseSecret = Deno.env.get('Supabase_Secret_Key');
    if (!supabaseUrl || !supabaseSecret) {
      return Response.json({ error: 'Supabase credentials missing' }, { status: 500 });
    }

    const supabase = createClient(supabaseUrl, supabaseSecret, { auth: { persistSession: false } });
    const { action, id, data, match } = await req.json().catch(() => ({}));

    let result;
    switch (action) {
      case 'list':
        result = await supabase.from('Vehicle').select('*').order('year', { ascending: false });
        break;
      case 'filter':
        result = await supabase.from('Vehicle').select('*').match(match || {});
        break;
      case 'get':
        result = await supabase.from('Vehicle').select('*').eq('id', id).single();
        break;
      case 'create':
        if (!data.id) data.id = crypto.randomUUID();
        result = await supabase.from('Vehicle').insert(data).select().single();
        break;
      case 'update':
        result = await supabase.from('Vehicle').update(data).eq('id', id).select().single();
        break;
      case 'delete':
        result = await supabase.from('Vehicle').delete().eq('id', id);
        break;
      default:
        return Response.json({ error: 'Invalid action' }, { status: 400 });
    }

    if (result.error) throw result.error;
    return Response.json({ data: result.data });
  } catch (error) {
    console.error('Supabase vehicle error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});