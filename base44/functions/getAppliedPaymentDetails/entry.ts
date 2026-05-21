import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';
import { createClient } from 'npm:@supabase/supabase-js@2.39.3';

const WORK_ORDER_LOOKUP_SELECT = 'id, customer_id, description, ro_number, wo_number, est_number, inv_number, crinv_number, stage';

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

const resolveWorkOrdersMap = async (supabase, lookupValues, customerId) => {
  const values = [...new Set((lookupValues || []).filter(Boolean))];
  const workOrdersMap = {};

  if (values.length === 0 || !customerId) {
    return workOrdersMap;
  }

  const { data: directMatches, error: directError } = await supabase
    .from('WorkOrder')
    .select(WORK_ORDER_LOOKUP_SELECT)
    .eq('customer_id', customerId)
    .in('id', values);

  if (directError) throw directError;

  (directMatches || []).forEach((wo) => {
    workOrdersMap[wo.id] = wo;
  });

  const fields = ['ro_number', 'wo_number', 'est_number', 'inv_number', 'crinv_number'];

  for (const field of fields) {
    const unresolvedValues = values.filter((value) => !workOrdersMap[value]);
    if (unresolvedValues.length === 0) break;

    const { data, error } = await supabase
      .from('WorkOrder')
      .select(WORK_ORDER_LOOKUP_SELECT)
      .eq('customer_id', customerId)
      .in(field, unresolvedValues);

    if (error) throw error;

    (data || []).forEach((wo) => {
      if (wo[field] && !workOrdersMap[wo[field]]) {
        workOrdersMap[wo[field]] = wo;
      }
    });
  }

  return workOrdersMap;
};

const getWorkOrderLookupNumber = (workOrder) => {
  return workOrder?.ro_number || workOrder?.wo_number || workOrder?.est_number || workOrder?.crinv_number || null;
};

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { paymentId, arApplyTo, customerId } = await req.json();

    let targetArApplyTo = arApplyTo || '';
    let targetCustomerId = customerId || null;

    if (paymentId) {
      const paymentRes = await base44.functions.invoke('supabaseCustomerPayments', { action: 'get', id: paymentId });
      const payment = paymentRes?.data?.data;

      if (!payment) {
        return Response.json({ error: 'Payment not found' }, { status: 404 });
      }

      targetArApplyTo = payment.ar_applyto || '';
      targetCustomerId = targetCustomerId || payment.customer_id || null;
    }

    if (!targetArApplyTo) {
      return Response.json({ success: true, appliedDetails: [] });
    }

    const entries = targetArApplyTo.split(',').filter((entry) => entry.trim());
    const recordIds = entries
      .map((entry) => entry.split(':')[0])
      .filter(Boolean);

    const supabase = createSupabaseClient();

    const [paymentsResponse, adjustmentsResponse] = await Promise.all([
      supabase.from('CustomerPayments').select('*').in('id', recordIds),
      supabase.from('CustomerARAdjustment').select('*').in('id', recordIds)
    ]);

    if (paymentsResponse.error) throw paymentsResponse.error;
    if (adjustmentsResponse.error) throw adjustmentsResponse.error;

    const paymentsMap = Object.fromEntries((paymentsResponse.data || []).map((record) => [record.id, record]));
    const adjustmentsMap = Object.fromEntries((adjustmentsResponse.data || []).map((record) => [record.id, record]));

    const workOrderLookupValues = [
      ...(paymentsResponse.data || []).map((payment) => payment?.work_order_id),
      ...(paymentsResponse.data || []).map((payment) => payment?.invoice_number),
      ...(adjustmentsResponse.data || []).map((adjustment) => adjustment?.work_order_id)
    ];

    const workOrdersMap = await resolveWorkOrdersMap(supabase, workOrderLookupValues, targetCustomerId);

    const appliedDetails = entries.reduce((details, entry) => {
      const [recordId, amountStr] = entry.split(':');
      const amount = parseFloat(amountStr);

      if (!recordId || Number.isNaN(amount)) {
        return details;
      }

      const customerPayment = paymentsMap[recordId];
      if (customerPayment) {
        const workOrder = workOrdersMap[customerPayment.work_order_id] || workOrdersMap[customerPayment.invoice_number] || null;
        const description = workOrder?.description || customerPayment.notes || 'Invoice';
        const reference = workOrder?.inv_number || customerPayment.invoice_number || getWorkOrderLookupNumber(workOrder) || '';

        details.push({
          id: recordId,
          type: 'Invoice',
          reference,
          date: customerPayment.payment_date || null,
          description,
          amountApplied: amount,
          isOverpayment: false,
          source: 'customer_payment'
        });
        return details;
      }

      const adjustment = adjustmentsMap[recordId];
      if (adjustment) {
        const workOrder = workOrdersMap[adjustment.work_order_id] || null;
        const isOverpayment = adjustment.amount < 0 && adjustment.reference && adjustment.reference.startsWith('OVERPMT');

        details.push({
          id: recordId,
          type: isOverpayment ? 'Overpayment Credit' : (adjustment.amount > 0 ? 'Charge' : 'Credit'),
          reference: adjustment.reference || '',
          date: adjustment.adjustment_date || null,
          description: workOrder?.description || adjustment.description || '',
          amountApplied: amount,
          isOverpayment,
          source: 'customer_ar_adjustment'
        });
      }

      return details;
    }, []);

    appliedDetails.sort((a, b) => {
      const dateA = a?.date ? new Date(a.date) : null;
      const dateB = b?.date ? new Date(b.date) : null;
      const timeA = dateA && !Number.isNaN(dateA.getTime()) ? dateA.getTime() : Number.MAX_SAFE_INTEGER;
      const timeB = dateB && !Number.isNaN(dateB.getTime()) ? dateB.getTime() : Number.MAX_SAFE_INTEGER;
      return timeA - timeB;
    });

    return Response.json({ success: true, appliedDetails });
  } catch (error) {
    console.error('Error in getAppliedPaymentDetails:', error);
    return Response.json({ error: error.message || 'Internal server error' }, { status: 500 });
  }
});