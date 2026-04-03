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

    const { ro_number, lockAction, lockedByUser } = await req.json().catch(() => ({}));

    if (!ro_number) {
      return Response.json({ error: 'ro_number is required' }, { status: 400 });
    }

    const supabase = createClient(supabaseUrl, supabaseSecret, {
      auth: { persistSession: false }
    });

    if (lockAction) {
      if (!['apply', 'release', 'none'].includes(lockAction)) {
        return Response.json({ error: 'lockAction must be apply, release, or none' }, { status: 400 });
      }

      if (lockAction === 'apply' && !lockedByUser) {
        return Response.json({ error: 'lockedByUser is required when applying a lock' }, { status: 400 });
      }

      if (lockAction !== 'none') {
        const lockResult = await supabase.rpc('set_workorder_lock', {
          p_ro_number: ro_number,
          p_action: lockAction,
          p_locked_by_user: lockAction === 'apply' ? lockedByUser : null
        });

        if (lockResult.error) {
          console.error('getworkorderdata lock rpc error:', lockResult.error);
          return Response.json({ error: 'Failed to update work order lock', details: lockResult.error.message }, { status: 500 });
        }

        const lockedRow = Array.isArray(lockResult.data) ? lockResult.data[0] : lockResult.data;
        return Response.json({ data: normalizeWorkOrder(lockedRow) || null });
      }
    }

    const { data: workOrderData, error: workOrderError } = await supabase
      .from('WorkOrder')
      .select('*')
      .eq('ro_number', ro_number)
      .limit(1)
      .maybeSingle();

    if (workOrderError) {
      console.error('getworkorderdata supabase error fetching WorkOrder:', workOrderError);
      return Response.json({ error: 'Failed to fetch work order', details: workOrderError.message }, { status: 500 });
    }

    if (!workOrderData) {
      return Response.json({ data: null });
    }

    let customerData = null;
    if (workOrderData.customer_id) {
      const { data, error } = await supabase
        .from('Customer')
        .select('*')
        .eq('id', workOrderData.customer_id)
        .limit(1)
        .maybeSingle();
      if (error) console.error('getworkorderdata supabase error fetching Customer:', error);
      customerData = data;
    }

    let vehicleData = null;
    if (workOrderData.vehicle_id) {
      const { data, error } = await supabase
        .from('Vehicle')
        .select('*')
        .eq('id', workOrderData.vehicle_id)
        .limit(1)
        .maybeSingle();
      if (error) console.error('getworkorderdata supabase error fetching Vehicle:', error);
      vehicleData = data;
    }

    const combinedData = {
      ...workOrderData,
      customer_details: customerData,
      vehicle_details: vehicleData,
    };

    return Response.json({ data: normalizeWorkOrder(combinedData) || null });
  } catch (error) {
    console.error('getworkorderdata error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});