import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';
import { createClient } from 'npm:@supabase/supabase-js@2.39.3';

const JSON_FIELDS = ['line_items', 'payments', 'accounting_details', 'tech_time'];
const IMMUTABLE_FIELDS = ['id', 'created_date', 'updated_date', 'created_by', 'created_by_id'];

const normalizeWorkOrder = (row) => {
  if (!row) return row;
  const normalized = { ...row };

  JSON_FIELDS.forEach((field) => {
    if (normalized[field] && typeof normalized[field] !== 'string') {
      normalized[field] = JSON.stringify(normalized[field]);
    }
  });

  return normalized;
};

const normalizePayload = (payload) => {
  const normalized = { ...payload };

  IMMUTABLE_FIELDS.forEach((field) => {
    delete normalized[field];
  });

  JSON_FIELDS.forEach((field) => {
    if (normalized[field] && typeof normalized[field] !== 'string') {
      normalized[field] = JSON.stringify(normalized[field]);
    }
  });

  Object.keys(normalized).forEach((key) => {
    if (normalized[key] === undefined) {
      delete normalized[key];
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

    const { ro_number, data } = await req.json().catch(() => ({}));

    if (!ro_number) {
      return Response.json({ error: 'ro_number is required' }, { status: 400 });
    }

    if (!data || typeof data !== 'object') {
      return Response.json({ error: 'data is required' }, { status: 400 });
    }

    const supabase = createClient(supabaseUrl, supabaseSecret, {
      auth: { persistSession: false }
    });

    const payload = normalizePayload(data);

    const result = await supabase
      .from('WorkOrder')
      .update(payload)
      .eq('ro_number', ro_number)
      .select('*');

    if (result.error) {
      console.error('saveworkorderdata supabase error:', result.error);
      return Response.json({ error: 'Failed to save work order', details: result.error.message }, { status: 500 });
    }

    const savedRow = Array.isArray(result.data) ? result.data[0] : result.data;

    if (!savedRow) {
      return Response.json({ error: 'Work order not found in Supabase' }, { status: 404 });
    }

    return Response.json({ data: normalizeWorkOrder(savedRow) });
  } catch (error) {
    console.error('saveworkorderdata error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});