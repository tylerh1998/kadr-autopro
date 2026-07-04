import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';
import { createClient } from 'npm:@supabase/supabase-js@2.39.3';

const WORK_ORDER_LOOKUP_SELECT = 'id, customer_id, description, ro_number, wo_number, est_number, inv_number, crinv_number, stage, total_amount, amount_paid, payments';

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

const getWorkOrderLookupNumber = (workOrder) => {
  return workOrder?.inv_number || workOrder?.ro_number || workOrder?.wo_number || workOrder?.est_number || workOrder?.crinv_number || null;
};

const toDateString = (value) => {
  if (!value) return new Date().toISOString().slice(0, 10);
  if (typeof value === 'string') return value.slice(0, 10);
  return new Date(value).toISOString().slice(0, 10);
};

const sumAppliedData = (appliedData) => {
  if (!Array.isArray(appliedData)) return 0;
  return appliedData.reduce((sum, item) => sum + (Number(item?.amount) || 0), 0);
};

const sumAppliedString = (value) => {
  if (!value || typeof value !== 'string') return 0;
  return value.split(',').reduce((sum, item) => {
    const [, amount] = item.split(':');
    return sum + (Number(amount) || 0);
  }, 0);
};

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { customerId, dateFrom, dateTo, searchTerm } = await req.json();

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

    const [paymentsResponse, adjustmentsResponse, directPaymentsResponse] = await Promise.all([
      paymentIds.length
        ? supabase.from('CustomerPayments').select('*').in('id', paymentIds)
        : Promise.resolve({ data: [], error: null }),
      adjustmentIds.length
        ? supabase.from('CustomerARAdjustment').select('*').in('id', adjustmentIds)
        : Promise.resolve({ data: [], error: null }),
      supabase
        .from('CustomerPayments')
        .select('*')
        .eq('customer_id', customerId)
        .eq('ar_pmt', true)
        .not('payment_method', 'eq', 'on_account')
    ]);

    if (paymentsResponse.error) throw paymentsResponse.error;
    if (adjustmentsResponse.error) throw adjustmentsResponse.error;
    if (directPaymentsResponse.error) throw directPaymentsResponse.error;

    const paymentsMap = Object.fromEntries((paymentsResponse.data || []).map((record) => [record.id, record]));
    const adjustmentsMap = Object.fromEntries((adjustmentsResponse.data || []).map((record) => [record.id, record]));
    const directPayments = directPaymentsResponse.data || [];

    const workOrderLookupValues = [
      ...(paymentsResponse.data || []).map((payment) => payment?.work_order_id),
      ...(paymentsResponse.data || []).map((payment) => payment?.invoice_number),
      ...directPayments.map((payment) => payment?.work_order_id),
      ...directPayments.map((payment) => payment?.invoice_number),
      ...(adjustmentsResponse.data || []).map((adjustment) => adjustment?.work_order_id)
    ];

    const workOrdersMap = await resolveWorkOrdersMap(supabase, workOrderLookupValues, customerId);

    const transactions = (rawTransactions || []).map((row) => {
      const date = toDateString(row.txn_date);

      if (row.transaction_type === 'payment') {
        const paymentRecord = paymentsMap[row.transaction_id] || null;
        const paymentMethod = paymentRecord?.payment_method || '';
        const isOnAccount = paymentMethod === 'on_account';
        const workOrder = workOrdersMap[paymentRecord?.work_order_id] || workOrdersMap[paymentRecord?.invoice_number] || null;
        const totalAmount = Number(row.amount) || 0;
        const paidAmount = Number(row.paid) || 0;
        const appliedAmount = sumAppliedData(row.applied_data);
        const remainingUnapplied = Math.max(0, totalAmount - appliedAmount);

        return {
          date,
          type: isOnAccount ? 'Invoice' : 'Payment',
          description: isOnAccount
            ? (workOrder?.description || row.description || paymentRecord?.notes || '')
            : (paymentRecord?.notes || row.description || workOrder?.description || ''),
          reference: row.reference || workOrder?.inv_number || paymentRecord?.invoice_number || getWorkOrderLookupNumber(workOrder) || '',
          amount: isOnAccount ? totalAmount : 0,
          payment: isOnAccount ? paidAmount : totalAmount,
          balance: isOnAccount ? (Number(row.balance) || 0) : (remainingUnapplied > 0.009 ? -remainingUnapplied : 0),
          source: isOnAccount ? 'on_account' : 'payment',
          sourceId: row.transaction_id,
          workOrderId: workOrder?.id || paymentRecord?.work_order_id || null,
          work_order_id: workOrder?.id || paymentRecord?.work_order_id || null,
          workOrderLookupNumber: getWorkOrderLookupNumber(workOrder),
          work_order: workOrder || null,
          cp_id: null,
          ar_pmt: paymentRecord?.ar_pmt === true,
          payment_method: paymentMethod,
          lankar_invoice: paymentRecord?.lankar_invoice || null,
          applied_data: Array.isArray(row.applied_data) ? row.applied_data : [],
          customer_id: paymentRecord?.customer_id || customerId
        };
      }

      const adjustmentRecord = adjustmentsMap[row.transaction_id] || null;
      const workOrder = workOrdersMap[adjustmentRecord?.work_order_id] || null;
      const amount = Number(row.amount) || 0;
      const paidAmount = Number(row.paid) || 0;

      return {
        date,
        type: amount > 0 ? 'Charge' : 'Credit',
        description: row.description || workOrder?.description || adjustmentRecord?.description || 'Adjustment',
        reference: row.reference || adjustmentRecord?.reference || '',
        amount: amount > 0 ? amount : 0,
        payment: amount > 0 ? paidAmount : Math.abs(amount),
        balance: Number(row.balance) || 0,
        source: 'adjustment',
        sourceId: row.transaction_id,
        workOrderId: workOrder?.id || adjustmentRecord?.work_order_id || null,
        work_order_id: workOrder?.id || adjustmentRecord?.work_order_id || null,
        workOrderLookupNumber: getWorkOrderLookupNumber(workOrder),
        work_order: workOrder || null,
        cp_id: null,
        ar_pmt: false,
        payment_method: '',
        lankar_invoice: null,
        applied_data: [],
        customer_id: adjustmentRecord?.customer_id || customerId
      };
    });

    const existingPaymentIds = new Set(
      transactions
        .filter((transaction) => transaction.sourceId)
        .map((transaction) => transaction.sourceId)
    );

    const supplementalPayments = directPayments
      .filter((paymentRecord) => !existingPaymentIds.has(paymentRecord.id))
      .map((paymentRecord) => {
        const workOrder = workOrdersMap[paymentRecord?.work_order_id] || workOrdersMap[paymentRecord?.invoice_number] || null;
        const totalAmount = Number(paymentRecord?.amount) || 0;
        const appliedAmount = sumAppliedString(paymentRecord?.ar_applyto);
        const remainingUnapplied = Math.max(0, totalAmount - appliedAmount);

        return {
          date: toDateString(paymentRecord?.payment_date || paymentRecord?.created_date),
          type: 'Payment',
          description: paymentRecord?.notes || workOrder?.description || '',
          reference: paymentRecord?.reference || workOrder?.inv_number || paymentRecord?.invoice_number || getWorkOrderLookupNumber(workOrder) || '',
          amount: 0,
          payment: totalAmount,
          balance: remainingUnapplied > 0.009 ? -remainingUnapplied : 0,
          source: 'payment',
          sourceId: paymentRecord.id,
          workOrderId: workOrder?.id || paymentRecord?.work_order_id || null,
          work_order_id: workOrder?.id || paymentRecord?.work_order_id || null,
          workOrderLookupNumber: getWorkOrderLookupNumber(workOrder),
          work_order: workOrder || null,
          cp_id: null,
          ar_pmt: true,
          payment_method: paymentRecord?.payment_method || '',
          lankar_invoice: paymentRecord?.lankar_invoice || null,
          applied_data: [],
          customer_id: paymentRecord?.customer_id || customerId
        };
      });

    transactions.push(...supplementalPayments);

    transactions.sort((a, b) => {
      const dateCompare = a.date.localeCompare(b.date);
      if (dateCompare !== 0) return dateCompare;
      return (a.reference || '').localeCompare(b.reference || '');
    });

    const arLedgerTransactions = transactions.filter((transaction) =>
      transaction.source === 'on_account' || transaction.source === 'adjustment'
    );

    const paymentTransactions = transactions.filter((transaction) => transaction.ar_pmt === true);

    const allTimeBalance = arLedgerTransactions.reduce((total, transaction) => total + (Number(transaction.balance) || 0), 0);

    const fromDate = dateFrom ? String(dateFrom).slice(0, 10) : null;
    const toDate = dateTo ? String(dateTo).slice(0, 10) : null;

    let openingBalance = 0;
    if (fromDate) {
      openingBalance = arLedgerTransactions
        .filter((transaction) => transaction.date < fromDate)
        .reduce((total, transaction) => total + (Number(transaction.balance) || 0), 0);
    }

    const inDateRange = (transaction) => (!fromDate || transaction.date >= fromDate) && (!toDate || transaction.date <= toDate);
    const matchesSearch = (transaction) => {
      if (!searchTerm || !String(searchTerm).trim()) return true;
      const searchValue = String(searchTerm).toLowerCase().trim();
      return (
        (transaction.reference || '').toLowerCase().includes(searchValue) ||
        (transaction.description || '').toLowerCase().includes(searchValue) ||
        (Number(transaction.amount) || 0).toFixed(2).includes(searchValue) ||
        (Number(transaction.payment) || 0).toFixed(2).includes(searchValue) ||
        (Number(transaction.balance) || 0).toFixed(2).includes(searchValue)
      );
    };

    const transactionsTab = arLedgerTransactions.filter((transaction) => inDateRange(transaction) && matchesSearch(transaction));

    const paymentsTab = paymentTransactions.filter((transaction) => inDateRange(transaction) && matchesSearch(transaction));

    return Response.json({
      success: true,
      allTimeBalance,
      openingBalance,
      transactionsTab,
      paymentsTab,
      summary: {
        total_balance: allTimeBalance
      }
    });
  } catch (error) {
    console.error('Error in getCustomerARData:', error);
    return Response.json({
      success: false,
      error: error.message || 'Internal server error'
    }, { status: 500 });
  }
});