import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "*",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};

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

    const { data, error } = await supabase.rpc('get_customer_ar_transaction_page', {
      p_customer_id: customerId,
      p_start_date: fromDate,
      p_end_date: toDate
    }).single();

    if (error) throw error;

    const rawTransactions = data?.transactions || [];

    const transactions = rawTransactions.map((row) => ({
      sourceId: row.sourceId,
      source: row.source,
      date: row.source === 'charge'
        ? getWorkOrderAuthoritativeDate(row.work_order) || normalizeDate(row.date)
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
      work_order: row.work_order || null
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
    const openingBalance = Number(data?.opening_balance) || 0;
    const allTimeBalance = Number(data?.current_balance) || 0;

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
