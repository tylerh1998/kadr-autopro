import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';
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

  if (!values.length || !customerId) {
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
    if (!unresolvedValues.length) break;

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

const toDateString = (value) => {
  if (!value) return new Date().toISOString().slice(0, 10);
  if (typeof value === 'string') return value.slice(0, 10);
  return new Date(value).toISOString().slice(0, 10);
};

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { customerId } = await req.json();

    if (!customerId) {
      return Response.json({ error: 'Customer ID is required' }, { status: 400 });
    }

    const supabase = createSupabaseClient();

    const { data: rawTransactions, error: rawTransactionsError } = await supabase.rpc('get_customer_ar_data', {
      customer_id_val: customerId
    });

    if (rawTransactionsError) throw rawTransactionsError;

    const paymentIds = (rawTransactions || [])
      .filter((row) => row?.transaction_type === 'payment')
      .map((row) => row.transaction_id)
      .filter(Boolean);

    const adjustmentIds = (rawTransactions || [])
      .filter((row) => row?.transaction_type === 'adjustment')
      .map((row) => row.transaction_id)
      .filter(Boolean);

    const [paymentsResponse, adjustmentsResponse] = await Promise.all([
      paymentIds.length
        ? supabase.from('CustomerPayments').select('*').in('id', paymentIds)
        : Promise.resolve({ data: [], error: null }),
      adjustmentIds.length
        ? supabase.from('CustomerARAdjustment').select('*').in('id', adjustmentIds)
        : Promise.resolve({ data: [], error: null })
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

    const workOrdersMap = await resolveWorkOrdersMap(supabase, workOrderLookupValues, customerId);

    const items = [];

    (rawTransactions || []).forEach((row) => {
      const date = toDateString(row.txn_date);

      if (row.transaction_type === 'payment') {
        const paymentRecord = paymentsMap[row.transaction_id] || null;
        if (!paymentRecord || paymentRecord.payment_method !== 'on_account') {
          return;
        }

        const balance = Number(row.balance) || 0;
        if (balance <= 0.01) {
          return;
        }

        const workOrder = workOrdersMap[paymentRecord.work_order_id] || workOrdersMap[paymentRecord.invoice_number] || null;

        items.push({
          id: row.transaction_id,
          type: 'invoice',
          reference: row.reference || workOrder?.inv_number || paymentRecord.invoice_number || '',
          date,
          amount: Number(row.amount) || 0,
          ar_paid: Number(row.paid) || 0,
          balance,
          description: workOrder?.description || row.description || paymentRecord.notes || ''
        });
        return;
      }

      const adjustmentRecord = adjustmentsMap[row.transaction_id] || null;
      const balance = Number(row.balance) || 0;
      if (Math.abs(balance) <= 0.01) {
        return;
      }

      items.push({
        id: row.transaction_id,
        type: 'adjustment',
        reference: row.reference || adjustmentRecord?.reference || adjustmentRecord?.description || '',
        date,
        amount: Number(row.amount) || 0,
        ar_paid: Number(row.paid) || 0,
        balance,
        description: row.description || adjustmentRecord?.description || ''
      });
    });

    items.sort((a, b) => a.date.localeCompare(b.date));

    return Response.json({
      success: true,
      items
    });
  } catch (error) {
    console.error('Error in getOutstandingARItems:', error);
    return Response.json({
      success: false,
      error: error.message || 'Internal server error'
    }, { status: 500 });
  }
});