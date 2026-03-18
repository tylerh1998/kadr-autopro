import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';
import { createClient } from 'npm:@supabase/supabase-js@2.39.3';

const normalizeWorkOrder = (row) => {
  if (!row) return row;

  const jsonFields = ['line_items', 'payments', 'accounting_details', 'tech_time'];
  const normalized = { ...row };

  jsonFields.forEach((field) => {
    if (normalized[field] && typeof normalized[field] !== 'string') {
      normalized[field] = JSON.stringify(normalized[field]);
    }
  });

  return normalized;
};

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

    const { ro_number } = await req.json().catch(() => ({}));

    if (!ro_number) {
      return Response.json({ error: 'ro_number is required' }, { status: 400 });
    }

    const supabase = createClient(supabaseUrl, supabaseSecret, {
      auth: { persistSession: false }
    });

    const result = await supabase
      .from('WorkOrder')
      .select('*')
      .eq('ro_number', ro_number)
      .limit(1)
      .maybeSingle();

    if (result.error) {
      console.error('getworkorderdata supabase error:', result.error);
      return Response.json({ error: 'Failed to fetch work order', details: result.error.message }, { status: 500 });
    }

    return Response.json({ data: normalizeWorkOrder(result.data) || null });
  } catch (error) {
    console.error('getworkorderdata error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});