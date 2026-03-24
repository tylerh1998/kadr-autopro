import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';
import { createClient } from 'npm:@supabase/supabase-js@2.39.3';

const JSON_FIELDS = ['line_items', 'payments', 'accounting_details', 'tech_time'];
const DATE_FIELDS = new Set(['est_date', 'wo_date', 'completed_date', 'invoice_date']);
const IMMUTABLE_FIELDS = ['id', 'ro_number', 'created_at', 'updated_at', 'created_date', 'updated_date', 'created_by', 'created_by_id'];
const ALLOWED_FIELDS = new Set(['wo_number', 'est_number', 'inv_number', 'crinv_number', 'customer_id', 'vehicle_id', 'status', 'kanban_order', 'priority', 'stage', 'approval', 'converted', 'LockedByUser', 'locked_timestamp', 'description', 'odometer', 'labor_rate', 'parts_total', 'labor_total', 'shop_supply_total', 'tax_amount', 'total_amount', 'est_date', 'wo_date', 'completed_date', 'invoice_date', 'internal_notes', 'line_items', 'payments', 'amount_paid', 'notes_to_customer', 'po_number', 'cvip', 'default_taxable', 'accounting_details', 'cp_id', 'tech_time', 'last_updated', 'last_updated_by', 'completed_by']);

const normalizeWorkOrder = (row) => {
  if (!row) return row;
  const normalized = { ...row };

  if (normalized.created_at && !normalized.created_date) normalized.created_date = normalized.created_at;
  if (normalized.updated_at && !normalized.updated_date) normalized.updated_date = normalized.updated_at;

  JSON_FIELDS.forEach((field) => {
    if (normalized[field] && typeof normalized[field] !== 'string') {
      normalized[field] = JSON.stringify(normalized[field]);
    }
  });

  return normalized;
};

const normalizePayload = (payload) => {
  const normalized = {};

  Object.entries(payload || {}).forEach(([key, value]) => {
    if (!ALLOWED_FIELDS.has(key) || IMMUTABLE_FIELDS.includes(key) || value === undefined) return;
    if (DATE_FIELDS.has(key) && value === '') {
      normalized[key] = null;
      return;
    }
    normalized[key] = JSON_FIELDS.includes(key) && value && typeof value !== 'string' ? JSON.stringify(value) : value;
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
      .select('id')
      .maybeSingle();

    if (result.error) {
      console.error('saveworkorderdata supabase error:', result.error);
      return Response.json({ error: 'Failed to save work order', details: result.error.message }, { status: 500 });
    }

    if (!result.data?.id) {
      return Response.json({ error: 'Work order not found in Supabase' }, { status: 404 });
    }

    return Response.json({ success: true, id: result.data.id });
  } catch (error) {
    console.error('saveworkorderdata error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});