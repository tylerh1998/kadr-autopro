import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';
import { createClient } from 'npm:@supabase/supabase-js@2.39.3';

const createSupabaseClient = () => {
  const supabaseUrl = Deno.env.get('Supabase_project_url');
  const supabaseSecret = Deno.env.get('Supabase_Secret_Key');

  if (!supabaseUrl || !supabaseSecret) {
    throw new Error('Supabase credentials not configured');
  }

  return createClient(supabaseUrl, supabaseSecret, {
    auth: { persistSession: false }
  });
};

const sanitizeDescription = (value) => String(value || '')
  .replace(/:/g, '-')
  .replace(/\s+/g, ' ')
  .trim();

const parseArApplyTo = (value) => {
  if (!value) return [];
  return String(value).split(',').map(entry => entry.trim()).filter(Boolean).map(entry => {
    const [id, type, amount, ...descParts] = entry.split(':');
    return { id, type, amount: Number(amount) || 0, description: descParts.join(':') };
  });
};

const buildArApplyTo = (entries) => {
  return entries.map(e => `${e.id}:${e.type}:${(Number(e.amount) || 0).toFixed(2)}:${sanitizeDescription(e.description)}`).join(',');
};

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { paymentId, arApplyTo, customerId } = await req.json();
    const supabase = createSupabaseClient();

    let targetCustomerId = customerId || null;
    let fallbackArApplyTo = arApplyTo || '';

    if (paymentId) {
      const { data: payment, error: paymentError } = await supabase
        .from('CustomerPayments')
        .select('id, customer_id, ar_applyto')
        .eq('id', paymentId)
        .single();

      if (paymentError) throw paymentError;
      if (!payment) {
        return Response.json({ error: 'Payment not found' }, { status: 404 });
      }

      targetCustomerId = payment.customer_id || targetCustomerId;
      fallbackArApplyTo = payment.ar_applyto || fallbackArApplyTo;
    }

    if (!targetCustomerId) {
      return Response.json({ success: true, appliedDetails: [] });
    }

    const { data: customerData, error: customerDataError } = await supabase.rpc('get_customer_ar_data', {
      customer_id_val: targetCustomerId
    });

    if (customerDataError) throw customerDataError;

    const rowMap = Object.fromEntries((customerData || []).map((row) => [row.transaction_id, row]));
    const paymentRow = paymentId ? rowMap[paymentId] : null;
    const parsedAppliedData = Array.isArray(paymentRow?.applied_data) && paymentRow.applied_data.length
      ? paymentRow.applied_data
      : parseArApplyTo(fallbackArApplyTo);

    const appliedDetails = parsedAppliedData
      .map((item) => {
        const id = item?.id;
        const amountApplied = Number(item?.amount) || 0;
        if (!id) return null;

        const row = rowMap[id];
        if (!row) {
          return {
            id,
            type: 'Unknown',
            reference: '',
            date: null,
            description: '',
            amountApplied,
            isOverpayment: false,
            source: 'unknown'
          };
        }

        const numericAmount = Number(row.amount) || 0;
        const isOverpayment = row.transaction_type === 'adjustment' && String(row.reference || '').startsWith('OVERPMT');

        return {
          id,
          type: row.transaction_type === 'payment'
            ? 'Invoice'
            : isOverpayment
              ? 'Overpayment Credit'
              : numericAmount > 0
                ? 'Charge'
                : 'Credit',
          reference: row.reference || '',
          date: row.txn_date ? String(row.txn_date).slice(0, 10) : null,
          description: row.description || '',
          amountApplied,
          isOverpayment,
          source: row.transaction_type === 'payment' ? 'customer_payment' : 'customer_ar_adjustment'
        };
      })
      .filter(Boolean)
      .sort((a, b) => {
        const dateA = a.date || '9999-12-31';
        const dateB = b.date || '9999-12-31';
        return dateA.localeCompare(dateB);
      });

    return Response.json({ success: true, appliedDetails });
  } catch (error) {
    console.error('Error in getAppliedPaymentDetails:', error);
    return Response.json({ error: error.message || 'Internal server error' }, { status: 500 });
  }
});