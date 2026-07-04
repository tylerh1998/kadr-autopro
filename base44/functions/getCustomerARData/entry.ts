import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';
import { createClient } from 'npm:@supabase/supabase-js@2.39.3';

const WORK_ORDER_SELECT = 'id, customer_id, stage, ro_number, wo_number, est_number, inv_number, total_amount, amount_paid, payments';

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

const normalizeDate = (value) => {
  if (!value) return null;
  return String(value).slice(0, 10);
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

    const workOrdersResponse = workOrderIds.length
      ? await supabase.from('WorkOrder').select(WORK_ORDER_SELECT).in('id', workOrderIds)
      : { data: [], error: null };

    if (workOrdersResponse.error) throw workOrdersResponse.error;

    const workOrdersMap = Object.fromEntries((workOrdersResponse.data || []).map((workOrder) => [workOrder.id, workOrder]));

    const transactions = rawTransactions.map((row) => ({
      sourceId: row.sourceId,
      source: row.source,
      date: normalizeDate(row.date),
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