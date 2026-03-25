import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';
import { createClient } from 'npm:@supabase/supabase-js@2.39.3';

const WORK_ORDER_LOOKUP_SELECT = 'id, customer_id, description, ro_number, wo_number, est_number, inv_number, crinv_number';

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
  const values = [...new Set(lookupValues.filter(Boolean))];
  const workOrdersMap = {};

  if (values.length === 0) {
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
    if (unresolvedValues.length === 0) {
      break;
    }

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

    const { customerId, dateFrom, dateTo, searchTerm } = await req.json();

    if (!customerId) {
      return Response.json({ error: 'Customer ID is required' }, { status: 400 });
    }

    const supabase = createSupabaseClient();

    const [allPayments, allAdjustments] = await Promise.all([
      base44.entities.CustomerPayments.filter({ customer_id: customerId }),
      base44.entities.CustomerARAdjustment.filter({ customer_id: customerId })
    ]);

    const workOrderLookupValues = [
      ...allPayments.map((payment) => payment?.work_order_id),
      ...allPayments.map((payment) => payment?.invoice_number),
      ...allAdjustments.map((adj) => adj?.work_order_id)
    ];

    const workOrdersMap = await resolveWorkOrdersMap(supabase, workOrderLookupValues, customerId);
    const transactions = [];

    allPayments
      .filter(payment => payment && payment.payment_method === 'on_account')
      .forEach(payment => {
        const amount = payment.amount || 0;
        const arPaid = payment.ar_paid || 0;
        const workOrder = workOrdersMap[payment.work_order_id] || workOrdersMap[payment.invoice_number] || null;
        const description = workOrder?.description || payment.notes || `Invoice ${payment.invoice_number || ''}`;

        transactions.push({
          date: payment.payment_date || new Date().toISOString(),
          type: 'Invoice',
          description,
          reference: workOrder?.inv_number || payment.invoice_number || getWorkOrderLookupNumber(workOrder) || '',
          amount,
          payment: arPaid,
          balance: amount - arPaid,
          source: 'on_account',
          sourceId: payment.id || 'unknown',
          workOrderId: workOrder?.id || payment.work_order_id || null,
          workOrderLookupNumber: getWorkOrderLookupNumber(workOrder),
          cp_id: workOrder?.cp_id || null,
          ar_pmt: payment.ar_pmt || false,
          payment_method: payment.payment_method || '',
          lankar_invoice: payment.lankar_invoice || null
        });
      });

    allPayments
      .filter(payment => payment && payment.ar_pmt === true && payment.payment_method !== 'on_account')
      .forEach(payment => {
        const workOrder = workOrdersMap[payment.work_order_id] || workOrdersMap[payment.invoice_number] || null;
        const description = workOrder?.description || payment.notes || `${(payment.payment_method || 'unknown').replace('_', ' ').toUpperCase()} Payment`;

        let appliedAmount = 0;
        if (payment.ar_applyto) {
          const entries = payment.ar_applyto.split(',');
          entries.forEach(entry => {
            const parts = entry.split(':');
            if (parts.length >= 2) {
              appliedAmount += parseFloat(parts[1]) || 0;
            }
          });
        }

        const totalAmount = payment.amount || 0;
        const unapplied = Math.max(0, totalAmount - appliedAmount);
        const effectiveUnapplied = unapplied < 0.01 ? 0 : unapplied;

        transactions.push({
          date: payment.payment_date || new Date().toISOString(),
          type: 'Payment',
          description,
          reference: payment.reference || '',
          amount: 0,
          payment: totalAmount,
          balance: -effectiveUnapplied,
          source: 'payment',
          sourceId: payment.id || 'unknown',
          workOrderId: workOrder?.id || payment.work_order_id || null,
          workOrderLookupNumber: getWorkOrderLookupNumber(workOrder),
          cp_id: workOrder?.cp_id || null,
          ar_pmt: true,
          originalPaymentRecord: payment,
          payment_method: payment.payment_method || ''
        });
      });

    allAdjustments.forEach(adj => {
      if (!adj) return;

      const adjAmount = adj.amount || 0;
      const arPaid = adj.ar_paid || 0;
      const isCharge = adjAmount > 0;
      const workOrder = workOrdersMap[adj.work_order_id] || null;
      const description = workOrder?.description || adj.description || 'Adjustment';

      transactions.push({
        date: adj.adjustment_date || new Date().toISOString(),
        type: isCharge ? 'Charge' : 'Credit',
        description,
        reference: adj.reference || '',
        amount: isCharge ? adjAmount : 0,
        payment: isCharge ? arPaid : Math.abs(adjAmount),
        balance: adj.overpayment ? adjAmount : (isCharge ? (adjAmount - arPaid) : adjAmount),
        source: 'adjustment',
        sourceId: adj.id || 'unknown',
        workOrderId: workOrder?.id || adj.work_order_id || null,
        workOrderLookupNumber: getWorkOrderLookupNumber(workOrder),
        cp_id: workOrder?.cp_id || null,
        ar_pmt: false,
        payment_method: ''
      });
    });

    transactions.sort((a, b) => {
      const dateA = new Date(a.date);
      const dateB = new Date(b.date);
      if (isNaN(dateA.getTime())) return 1;
      if (isNaN(dateB.getTime())) return -1;
      return dateA - dateB;
    });

    const allTimeBalance = transactions.reduce((total, t) => total + (t.balance || 0), 0);

    let filtered = transactions;
    let openingBalance = 0;

    if (dateFrom || dateTo) {
      const fromDate = dateFrom ? new Date(dateFrom) : null;
      if (fromDate) fromDate.setHours(0, 0, 0, 0);

      const toDate = dateTo ? new Date(dateTo) : null;
      if (toDate) toDate.setHours(23, 59, 59, 999);

      if (fromDate) {
        openingBalance = transactions
          .filter(t => new Date(t.date) < fromDate)
          .reduce((total, t) => total + (t.balance || 0), 0);
      }

      filtered = filtered.filter(t => {
        const transactionDate = new Date(t.date);
        return (!fromDate || transactionDate >= fromDate) && (!toDate || transactionDate <= toDate);
      });
    }

    if (searchTerm && searchTerm.trim()) {
      const searchLower = searchTerm.toLowerCase().trim();
      filtered = filtered.filter(t => {
        const referenceMatch = (t.reference || '').toLowerCase().includes(searchLower);
        const descriptionMatch = (t.description || '').toLowerCase().includes(searchLower);
        const amountMatch = (t.amount || 0).toFixed(2).includes(searchLower) ||
          (t.payment || 0).toFixed(2).includes(searchLower) ||
          (t.balance || 0).toFixed(2).includes(searchLower);
        return referenceMatch || descriptionMatch || amountMatch;
      });
    }

    const transactionsTab = filtered.filter(t => t.ar_pmt !== true);
    const paymentsTab = filtered.filter(t => t.ar_pmt === true);

    return Response.json({
      success: true,
      allTimeBalance,
      openingBalance,
      transactionsTab,
      paymentsTab
    });

  } catch (error) {
    console.error('Error in getCustomerARTransactions:', error);
    return Response.json({
      success: false,
      error: error.message
    }, { status: 500 });
  }
});