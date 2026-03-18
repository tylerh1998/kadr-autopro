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
      if (!['apply', 'release'].includes(lockAction)) {
        return Response.json({ error: 'lockAction must be apply or release' }, { status: 400 });
      }

      if (lockAction === 'apply' && !lockedByUser) {
        return Response.json({ error: 'lockedByUser is required when applying a lock' }, { status: 400 });
      }

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