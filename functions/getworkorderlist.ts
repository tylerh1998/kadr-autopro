import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';
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

    const supabase = createClient(supabaseUrl, supabaseSecret, {
      auth: { persistSession: false }
    });

    const body = await req.json().catch(() => ({}));
    const { match, limit } = body;

    let query = supabase
      .from('WorkOrder')
      .select('id, ro_number, wo_number, est_number, inv_number, crinv_number, customer_id, vehicle_id, status, kanban_order, priority, stage, approval, converted, LockedByUser, locked_timestamp, description, odometer, labor_rate, estimated_hours, parts_total, labor_total, shop_supply_total, tax_amount, total_amount, est_date, wo_date, completed_date, invoice_date, amount_paid, po_number, cvip, default_taxable, last_updated, last_updated_by, completed_by, cp_id');

    if (match && typeof match === 'object') {
      query = query.match(match);
    }

    if (limit && Number.isFinite(Number(limit))) {
      query = query.limit(Number(limit));
    }

    const result = await query;

    if (result.error) {
      console.error('getworkorderlist supabase error:', result.error);
      return Response.json({ error: 'Failed to fetch work orders', details: result.error.message }, { status: 500 });
    }

    return Response.json({ data: result.data || [] });
  } catch (error) {
    console.error('getworkorderlist error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});