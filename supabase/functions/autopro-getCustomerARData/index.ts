import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "*",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};

const WORK_ORDER_SELECT = 'id, customer_id, stage, ro_number, wo_number, est_number, inv_number, total_amount, amount_paid, payments, est_date, wo_date, invoice_date';

const normalizeDate = (value) => {
  if (!value) return null;
  return String(value).slice(0, 10);
};

const getWorkOrderAuthoritativeDate = (workOrder) => {
  if (!workOrder) return null;

  if (workOrder.stage === 'estimate') {
    return normalizeDate(workOrder.est_date || workOrder.wo_date || workOrder.invoice_date);
  }

  if (workOrder.stage === 'work_order') {
    return normalizeDate(workOrder.wo_date || workOrder.invoice_date || workOrder.est_date);
  }

  return normalizeDate(workOrder.invoice_date || workOrder.wo_date || workOrder.est_date);
};

const getMountainToday = () => {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Edmonton',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(new Date());

  const getPart = (type) => parts.find((part) => part.type === type)?.value || '';
  return `${getPart('year')}-${getPart('month')}-${getPart('day')}`;
};

const addDays = (dateString, days) => {
  const date = new Date(`${dateString}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const supabase = createClient(Deno.env.get('SUPABASE_URL'), Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'));

    const { customerId, dateFrom, dateTo, searchTerm } = await req.json();

    if (!customerId) {
      return new Response(JSON.stringify({ success: false, error: 'Customer ID is required' }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const fromDate = normalizeDate(dateFrom) || '1900-01-01';
    const toDate = normalizeDate(dateTo) || '2999-12-31';
    const currentBalanceDate = addDays(getMountainToday(), 1);

    const [transactionsResponse, openingBalanceResponse, currentBalanceResponse] = await Promise.all([
      supabase.rpc('get_customer_ar_data_v2', {
        p_customer_id: customerId,
        p_start_date: fromDate,
        p_end_date: toDate
      }),
      supabase.rpc('get_customer_ar_opening_balance', {
        p_customer_id: customerId,
        p_start_date: fromDate
      }),
      supabase.rpc('get_customer_ar_opening_balance', {
        p_customer_id: customerId,
        p_start_date: currentBalanceDate
      })
    ]);

    if (transactionsResponse.error) throw transactionsResponse.error;
    if (openingBalanceResponse.error) throw openingBalanceResponse.error;
    if (currentBalanceResponse.error) throw currentBalanceResponse.error;

    const rawTransactions = transactionsResponse.data || [];
    const workOrderIds = [...new Set(rawTransactions.map((row) => row?.work_order_id).filter(Boolean))];
    const paymentSourceIds = [...new Set(rawTransactions
      .filter((row) => row?.source === 'payment' && row?.sourceId)
      .map((row) => row.sourceId))];
    const adjustmentSourceIds = [...new Set(rawTransactions
      .filter((row) => row?.source === 'adjustment' && row?.sourceId)
      .map((row) => row.sourceId))];

    const [workOrdersResponse, customerPaymentsResponse, customerAdjustmentsResponse] = await Promise.all([
      workOrderIds.length
        ? await supabase.from('WorkOrder').select(WORK_ORDER_SELECT).in('id', workOrderIds)
        : { data: [], error: null },
      paymentSourceIds.length
        ? await supabase.from('CustomerPayments').select('id, payment_date').in('id', paymentSourceIds)
        : { data: [], error: null },
      adjustmentSourceIds.length
        ? await supabase.from('CustomerARAdjustment').select('id, adjustment_date').in('id', adjustmentSourceIds)
        : { data: [], error: null }
    ]);

    if (workOrdersResponse.error) throw workOrdersResponse.error;
    if (customerPaymentsResponse.error) throw customerPaymentsResponse.error;
    if (customerAdjustmentsResponse.error) throw customerAdjustmentsResponse.error;

    const workOrdersMap = Object.fromEntries((workOrdersResponse.data || []).map((workOrder) => [workOrder.id, workOrder]));
    const customerPaymentDateMap = Object.fromEntries((customerPaymentsResponse.data || []).map((payment) => [payment.id, normalizeDate(payment.payment_date)]));
    const customerAdjustmentDateMap = Object.fromEntries((customerAdjustmentsResponse.data || []).map((adjustment) => [adjustment.id, normalizeDate(adjustment.adjustment_date)]));

    const transactions = rawTransactions.map((row) => ({
      sourceId: row.sourceId,
      source: row.source,
      date: row.source === 'payment'
        ? customerPaymentDateMap[row.sourceId] || normalizeDate(row.date)
        : row.source === 'adjustment'
          ? customerAdjustmentDateMap[row.sourceId] || normalizeDate(row.date)
          : row.source === 'charge'
            ? getWorkOrderAuthoritativeDate(workOrdersMap[row.work_order_id]) || normalizeDate(row.date)
            : normalizeDate(row.date),
      description: row.description || '',
      reference: row.reference || '',
      amount: Number(row.amount) || 0,
      payment: Number(row.payment) || 0,
      balance: Number(row.owing) || 0,
      payment_method: row.payment_method || '',
      is_on_account: row.is_on_account === true,
      work_order_id: row.work_order_id || null,
      workOrderLookupNumber: row.workOrderLookupNumber || null,
      work_order: row.work_order_id ? workOrdersMap[row.work_order_id] || null : null
    }));

    transactions.sort((a, b) => {
      const dateCompare = (a.date || '').localeCompare(b.date || '');
      if (dateCompare !== 0) return dateCompare;
      return (a.reference || '').localeCompare(b.reference || '');
    });

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

    const filteredTransactions = transactions.filter(matchesSearch);
    const transactionsTab = filteredTransactions.filter((transaction) => transaction.source === 'charge' || transaction.source === 'adjustment');
    const paymentsTab = filteredTransactions.filter((transaction) => transaction.source === 'payment');
    const openingBalance = Number(openingBalanceResponse.data) || 0;
    const allTimeBalance = Number(currentBalanceResponse.data) || 0;

    return new Response(JSON.stringify({
      success: true,
      allTimeBalance,
      openingBalance,
      transactionsTab,
      paymentsTab,
      summary: {
        total_balance: allTimeBalance
      }
    }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (error) {
    return new Response(JSON.stringify({ success: false, error: error.message }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
