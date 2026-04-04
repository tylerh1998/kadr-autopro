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
        result = await supabase.from('CustomerPayments').select('*').order('payment_date', { ascending: false });
        break;
      case 'filter':
        result = await supabase.from('CustomerPayments').select('*').match(match || {});
        break;
      case 'get':
        result = await supabase.from('CustomerPayments').select('*').eq('id', id).single();
        break;
      case 'create':
        if (!data.id) data.id = crypto.randomUUID();
        if (!data.created_date) data.created_date = new Date().toISOString();
        if (!data.updated_date) data.updated_date = new Date().toISOString();
        result = await supabase.from('CustomerPayments').insert(data).select().single();
        break;
      case 'update':
        if (!data.updated_date) data.updated_date = new Date().toISOString();
        result = await supabase.from('CustomerPayments').update(data).eq('id', id).select().single();
        break;
      case 'delete':
        result = await supabase.from('CustomerPayments').delete().eq('id', id);
        break;
      default:
        return Response.json({ error: 'Invalid action' }, { status: 400 });
    }

    if (result.error) throw result.error;
    return Response.json({ data: result.data || result });
  } catch (error) {
    console.error('Supabase CustomerPayments error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});