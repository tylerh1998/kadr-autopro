import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "*",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};

const getMountainDateParts = (date = new Date()) => {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Edmonton',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(date);

  const year = parts.find((part) => part.type === 'year')?.value;
  const month = parts.find((part) => part.type === 'month')?.value;
  const day = parts.find((part) => part.type === 'day')?.value;

  return { year, month, day };
};

const getMountainDateString = (date = new Date()) => {
  const { year, month, day } = getMountainDateParts(date);
  return `${year}-${month}-${day}`;
};

const getDefaultFromDateMountain = () => {
  const now = new Date();
  const { year, month, day } = getMountainDateParts(now);
  const mountainMiddayUtc = new Date(`${year}-${month}-${day}T12:00:00Z`);
  mountainMiddayUtc.setUTCDate(mountainMiddayUtc.getUTCDate() - 365);
  return getMountainDateString(mountainMiddayUtc);
};

const normalizeDateInput = (value) => {
  if (!value) return null;
  if (typeof value !== 'string') return null;
  return value.slice(0, 10);
};

const matchesReconciledFilter = (tx, isReconciledProvided, isReconciled) => {
  if (!isReconciledProvided) return true;

  if (isReconciled === true) {
    return tx.reconciled === true;
  }

  return tx.reconciled === false || tx.reconciled === null || tx.reconciled === undefined;
};

const formatAmountForSearch = (value) => {
  const num = Number(value);
  return Number.isFinite(num) ? num.toFixed(2) : '';
};

const matchesSearch = (tx, searchText) => {
  if (!searchText) return true;

  const needle = searchText.toLowerCase().trim().replace(/^\$/, '');
  const description = (tx.description || '').toLowerCase();
  const reference = (tx.reference || '').toLowerCase();
  const creditAmount = formatAmountForSearch(tx.credit_amount);
  const debitAmount = formatAmountForSearch(tx.debit_amount);

  return description.includes(needle)
    || reference.includes(needle)
    || creditAmount.includes(needle)
    || debitAmount.includes(needle);
};

const isReversedTransaction = (value) => value === true || value === 'true';

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const payload = await req.json().catch(() => ({}));
    const { bankAccountId, fromDate, toDate, isReconciled, searchText, sourceType, sourceId, sortField, sortDirection } = payload;

    const effectiveFromDate = normalizeDateInput(fromDate) || getDefaultFromDateMountain();
    const effectiveToDate = normalizeDateInput(toDate) || getMountainDateString();
    const isReconciledProvided = Object.prototype.hasOwnProperty.call(payload, 'isReconciled') && isReconciled !== null;
    const allowedSortFields = new Set(['transaction_date', 'created_date', 'updated_date', 'reference', 'description', 'source_id', 'source_type']);
    const effectiveSortField = allowedSortFields.has(sortField) ? sortField : 'transaction_date';
    const effectiveSortDirection = sortDirection === 'desc' ? 'desc' : 'asc';

    const supabase = createClient(Deno.env.get('SUPABASE_URL'), Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'));

    let query = supabase
      .from('BankTransaction')
      .select('*')
      .order(effectiveSortField, { ascending: effectiveSortDirection === 'asc' })
      .limit(2000);

    if (bankAccountId) query = query.eq('bank_account_id', bankAccountId);
    if (sourceType) query = query.eq('source_type', sourceType);
    if (sourceId) query = query.eq('source_id', sourceId);

    const { data: transactions, error: transactionsError } = await query;
    if (transactionsError) throw new Error(transactionsError.message);

    console.log('getBankTransactions raw count:', Array.isArray(transactions) ? transactions.length : 0);

    const bankAccountIds = [...new Set((transactions || []).map((tx) => tx.bank_account_id).filter(Boolean))];
    let bankAccountMap = {};

    if (bankAccountIds.length > 0) {
      const { data: bankAccounts, error: bankAccountsError } = await supabase
        .from('BankAccount')
        .select('id,name,bank_name')
        .in('id', bankAccountIds);

      if (bankAccountsError) throw new Error(bankAccountsError.message);

      bankAccountMap = (bankAccounts || []).reduce((acc, account) => {
        acc[account.id] = account;
        return acc;
      }, {});
    }

    const filteredTransactions = (transactions || [])
      .filter((tx) => !isReversedTransaction(tx.is_reversed))
      .filter((tx) => {
        const txDate = normalizeDateInput(tx.transaction_date);
        if (!txDate) return false;
        return txDate >= effectiveFromDate && txDate <= effectiveToDate;
      })
      .filter((tx) => matchesReconciledFilter(tx, isReconciledProvided, isReconciled))
      .filter((tx) => matchesSearch(tx, searchText))
      .sort((a, b) => {
        const aValue = effectiveSortField === 'transaction_date'
          ? (normalizeDateInput(a.transaction_date) || '')
          : String(a[effectiveSortField] || '');
        const bValue = effectiveSortField === 'transaction_date'
          ? (normalizeDateInput(b.transaction_date) || '')
          : String(b[effectiveSortField] || '');
        const comparison = aValue.localeCompare(bValue);
        return effectiveSortDirection === 'desc' ? -comparison : comparison;
      })
      .map((tx) => ({
        ...tx,
        bank_account_name: bankAccountMap[tx.bank_account_id]?.name || null,
        bank_name: bankAccountMap[tx.bank_account_id]?.bank_name || null
      }));

    return new Response(JSON.stringify({
      transactions: filteredTransactions,
      meta: {
        bankAccountId: bankAccountId || null,
        fromDate: effectiveFromDate,
        toDate: effectiveToDate,
        isReconciled: isReconciledProvided ? isReconciled : null,
        searchText: searchText || '',
        sourceType: sourceType || null,
        sourceId: sourceId || null,
        sortField: effectiveSortField,
        sortDirection: effectiveSortDirection,
        count: filteredTransactions.length
      }
    }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (error) {
    console.error('getBankTransactions error:', error);
    return new Response(JSON.stringify({ error: error.message }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
