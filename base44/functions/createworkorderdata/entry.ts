import { createClientFromRequest } from 'npm:@base44/sdk@0.8.21';
import { createClient } from 'npm:@supabase/supabase-js@2.39.3';

const JSON_FIELDS = ['line_items', 'payments', 'accounting_details', 'tech_time'];
const ALLOWED_FIELDS = new Set([
  'ro_number',
  'wo_number',
  'est_number',
  'inv_number',
  'crinv_number',
  'customer_id',
  'vehicle_id',
  'status',
  'kanban_order',
  'priority',
  'stage',
  'approval',
  'converted',
  'LockedByUser',
  'locked_timestamp',
  'description',
  'odometer',
  'labor_rate',
  'estimated_hours',
  'parts_total',
  'labor_total',
  'shop_supply_total',
  'tax_amount',
  'total_amount',
  'est_date',
  'wo_date',
  'completed_date',
  'invoice_date',
  'internal_notes',
  'line_items',
  'payments',
  'amount_paid',
  'notes_to_customer',
  'po_number',
  'cvip',
  'default_taxable',
  'accounting_details',
  'tech_time',
  'last_updated',
  'last_updated_by',
  'completed_by',
  'cp_id'
]);

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
    if (!ALLOWED_FIELDS.has(key) || value === undefined) return;
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

    const { data } = await req.json().catch(() => ({}));

    if (!data || typeof data !== 'object') {
      return Response.json({ error: 'data is required' }, { status: 400 });
    }

    const payload = normalizePayload(data);

    if (!payload.ro_number || !payload.customer_id || !payload.vehicle_id) {
      return Response.json({ error: 'ro_number, customer_id, and vehicle_id are required' }, { status: 400 });
    }

    const now = new Date().toISOString();
    const insertData = {
      id: crypto.randomUUID().replace(/-/g, '').substring(0, 24),
      created_date: now,
      updated_date: now,
      created_by: user.email,
      created_by_id: user.id,
      ...payload
    };

    const supabase = createClient(supabaseUrl, supabaseSecret, {
      auth: { persistSession: false }
    });

    const result = await supabase
      .from('WorkOrder')
      .insert([insertData])
      .select('*')
      .single();

    if (result.error) {
      console.error('createworkorderdata supabase error:', result.error);
      return Response.json({ error: 'Failed to create work order', details: result.error.message }, { status: 500 });
    }

    return Response.json({ data: normalizeWorkOrder(result.data) });
  } catch (error) {
    console.error('createworkorderdata error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});