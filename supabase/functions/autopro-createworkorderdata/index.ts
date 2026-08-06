import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "*",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};

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
  'completed_by'
]);

const normalizeWorkOrder = (row: any) => {
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

const normalizePayload = (payload: any) => {
  const normalized: Record<string, any> = {};

  Object.entries(payload || {}).forEach(([key, value]) => {
    if (!ALLOWED_FIELDS.has(key) || value === undefined) return;
    normalized[key] = JSON_FIELDS.includes(key) && value && typeof value !== 'string' ? JSON.stringify(value) : value;
  });

  return normalized;
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY");
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const supabaseClient = createClient(supabaseUrl, supabaseAnonKey);

    const authHeader = req.headers.get("Authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Missing or invalid Authorization header" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const token = authHeader.substring(7);
    const { data: authData, error: authError } = await supabaseClient.auth.getUser(token);
    if (authError || !authData?.user) {
      return new Response(JSON.stringify({ error: "Unauthorized user session" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const { data } = await req.json().catch(() => ({}));

    if (!data || typeof data !== 'object') {
      return new Response(JSON.stringify({ error: 'data is required' }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const payload = normalizePayload(data);

    if (!payload.ro_number || !payload.customer_id || !payload.vehicle_id) {
      return new Response(JSON.stringify({ error: 'ro_number, customer_id, and vehicle_id are required' }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const now = new Date().toISOString();
    const insertData = {
      id: crypto.randomUUID().replace(/-/g, '').substring(0, 24),
      created_date: now,
      created_by: authData.user.email,
      ...payload
    };

    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { persistSession: false }
    });

    const result = await supabase
      .from('WorkOrder')
      .insert([insertData])
      .select('*')
      .single();

    if (result.error) {
      console.error('autopro-createworkorderdata supabase error:', result.error);
      return new Response(JSON.stringify({ error: 'Failed to create work order', details: result.error.message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    return new Response(JSON.stringify({ data: normalizeWorkOrder(result.data) }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (error: any) {
    console.error('autopro-createworkorderdata error:', error);
    return new Response(JSON.stringify({ error: error.message || 'Internal server error' }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
