import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';
import { createClient } from 'npm:@supabase/supabase-js@2.39.3';

const VALID_TYPES = new Set(['pmt', 'adj']);

const getCurrentMountainTimeISO = () => {
  const mountainNow = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Edmonton' }));
  return mountainNow.toISOString();
};

const sanitizeDescription = (value) => String(value || '')
  .replace(/:/g, '-')
  .replace(/\s+/g, ' ')
  .trim();

const parseArApplyTo = (value) => {
  if (!value) return [];

  return String(value)
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => {
      const parts = entry.split(':');

      if (parts.length >= 4 && VALID_TYPES.has(parts[1])) {
        return {
          raw: entry,
          id: parts[0],
          type: parts[1],
          amount: Number(parts[2]) || 0,
          description: parts.slice(3).join(':')
        };
      }

      if (parts.length === 3 && VALID_TYPES.has(parts[1])) {
        return {
          raw: entry,
          id: parts[0],
          type: parts[1],
          amount: Number(parts[2]) || 0,
          description: ''
        };
      }

      if (parts.length >= 3) {
        return {
          raw: entry,
          id: parts[0],
          type: null,
          amount: Number(parts[1]) || 0,
          description: parts.slice(2).join(':')
        };
      }

      return {
        raw: entry,
        id: parts[0],
        type: null,
        amount: Number(parts[1]) || 0,
        description: ''
      };
    })
    .filter((item) => item.id);
};

const formatArApplyToEntry = ({ id, type, amount, description }) => {
  return `${id}:${type}:${(Number(amount) || 0).toFixed(2)}:${sanitizeDescription(description)}`;
};

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (user.role !== 'admin') {
      return Response.json({ error: 'Forbidden' }, { status: 403 });
    }

    const supabaseUrl = Deno.env.get('Supabase_project_url');
    const supabaseSecret = Deno.env.get('Supabase_Secret_Key');

    if (!supabaseUrl || !supabaseSecret) {
      return Response.json({ error: 'Supabase credentials missing' }, { status: 500 });
    }

    const payload = await req.json().catch(() => ({}));
    const mode = payload.mode === 'edit' ? 'edit' : 'view';
    const limit = Math.min(Math.max(Number(payload.limit) || 100, 1), 500);
    const offset = Math.max(Number(payload.offset) || 0, 0);
    const paymentId = payload.paymentId || null;

    const supabase = createClient(supabaseUrl, supabaseSecret, {
      auth: { persistSession: false }
    });

    let paymentsQuery = supabase
      .from('CustomerPayments')
      .select('id, customer_id, ar_applyto, work_order_id, notes, ar_pmt, updated_date', { count: 'exact' })
      .eq('ar_pmt', true)
      .not('ar_applyto', 'is', null)
      .order('created_date', { ascending: true })
      .range(offset, offset + limit - 1);

    if (paymentId) {
      paymentsQuery = supabase
        .from('CustomerPayments')
        .select('id, customer_id, ar_applyto, work_order_id, notes, ar_pmt, updated_date', { count: 'exact' })
        .eq('id', paymentId)
        .eq('ar_pmt', true)
        .not('ar_applyto', 'is', null)
        .limit(1);
    }

    const { data: paymentRows, error: paymentsError, count: totalRows } = await paymentsQuery;
    if (paymentsError) throw paymentsError;

    const candidatePayments = (paymentRows || []).filter((row) => String(row.ar_applyto || '').trim());

    const referencedIds = [...new Set(
      candidatePayments.flatMap((row) => parseArApplyTo(row.ar_applyto).map((entry) => entry.id)).filter(Boolean)
    )];

    const { data: referencedPayments, error: referencedPaymentsError } = referencedIds.length
      ? await supabase
          .from('CustomerPayments')
          .select('id, work_order_id, notes')
          .in('id', referencedIds)
      : { data: [], error: null };
    if (referencedPaymentsError) throw referencedPaymentsError;

    const { data: referencedAdjustments, error: referencedAdjustmentsError } = referencedIds.length
      ? await supabase
          .from('CustomerARAdjustment')
          .select('id, description')
          .in('id', referencedIds)
      : { data: [], error: null };
    if (referencedAdjustmentsError) throw referencedAdjustmentsError;

    const workOrderIds = [...new Set(
      (referencedPayments || []).map((row) => row.work_order_id).filter(Boolean)
    )];

    const { data: workOrders, error: workOrdersError } = workOrderIds.length
      ? await supabase
          .from('WorkOrder')
          .select('id, description')
          .in('id', workOrderIds)
      : { data: [], error: null };
    if (workOrdersError) throw workOrdersError;

    const paymentMap = new Map((referencedPayments || []).map((row) => [row.id, row]));
    const adjustmentMap = new Map((referencedAdjustments || []).map((row) => [row.id, row]));
    const workOrderMap = new Map((workOrders || []).map((row) => [row.id, row]));

    const rows = [];
    let updatedCount = 0;

    for (const payment of candidatePayments) {
      const parsedEntries = parseArApplyTo(payment.ar_applyto);
      const issues = [];

      const rebuiltEntries = parsedEntries.map((entry) => {
        let resolvedType = entry.type;
        let resolvedDescription = sanitizeDescription(entry.description);

        const referencedPayment = paymentMap.get(entry.id);
        const referencedAdjustment = adjustmentMap.get(entry.id);

        if (!resolvedType) {
          if (referencedPayment) resolvedType = 'pmt';
          else if (referencedAdjustment) resolvedType = 'adj';
        }

        if (resolvedType === 'pmt') {
          if (!referencedPayment) {
            issues.push(`Referenced payment not found: ${entry.id}`);
          } else {
            const workOrder = referencedPayment.work_order_id ? workOrderMap.get(referencedPayment.work_order_id) : null;
            const workOrderDescription = sanitizeDescription(workOrder?.description || '');
            const notesDescription = sanitizeDescription(referencedPayment.notes || '');
            resolvedDescription = workOrderDescription || notesDescription || resolvedDescription;
          }
        } else if (resolvedType === 'adj') {
          if (!referencedAdjustment) {
            issues.push(`Referenced adjustment not found: ${entry.id}`);
          } else {
            resolvedDescription = sanitizeDescription(referencedAdjustment.description || '') || resolvedDescription;
          }
        } else {
          issues.push(`Unable to determine type for: ${entry.id}`);
        }

        return {
          id: entry.id,
          type: resolvedType || 'unknown',
          amount: entry.amount,
          description: resolvedDescription
        };
      });

      const newArApplyTo = rebuiltEntries.map(formatArApplyToEntry).join(',');
      const willUpdate = newArApplyTo !== String(payment.ar_applyto || '');

      if (mode === 'edit' && willUpdate) {
        const { error: updateError } = await supabase
          .from('CustomerPayments')
          .update({
            ar_applyto: newArApplyTo,
            updated_date: getCurrentMountainTimeISO()
          })
          .eq('id', payment.id);

        if (updateError) throw updateError;
        updatedCount += 1;
      }

      rows.push({
        payment_id: payment.id,
        customer_id: payment.customer_id || null,
        old_ar_applyto: payment.ar_applyto || '',
        new_ar_applyto: newArApplyTo,
        will_update: willUpdate,
        issues,
        entries: rebuiltEntries
      });
    }

    return Response.json({
      success: true,
      mode,
      summary: {
        total_rows_fetched: candidatePayments.length,
        total_query_count: totalRows ?? candidatePayments.length,
        offset,
        limit,
        rows_needing_update: rows.filter((row) => row.will_update).length,
        rows_updated: updatedCount
      },
      rows
    });
  } catch (error) {
    console.error('Error in backfillArApplyTo:', error);
    return Response.json({ error: error.message || 'Internal server error' }, { status: 500 });
  }
});