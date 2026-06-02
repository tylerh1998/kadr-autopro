import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

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

const matchesSearch = (tx, searchText) => {
  if (!searchText) return true;

  const needle = searchText.toLowerCase();
  const description = (tx.description || '').toLowerCase();
  const reference = (tx.reference || '').toLowerCase();

  return description.includes(needle) || reference.includes(needle);
};

const isReversedTransaction = (value) => value === true || value === 'true';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const payload = await req.json().catch(() => ({}));
    const { bankAccountId, fromDate, toDate, isReconciled, searchText, sourceType, sourceId, sortField, sortDirection } = payload;

    const effectiveFromDate = normalizeDateInput(fromDate) || getDefaultFromDateMountain();
    const effectiveToDate = normalizeDateInput(toDate) || getMountainDateString();
    const isReconciledProvided = Object.prototype.hasOwnProperty.call(payload, 'isReconciled') && isReconciled !== null;
    const allowedSortFields = new Set(['transaction_date', 'created_date', 'updated_date', 'reference', 'description', 'source_id', 'source_type']);
    const effectiveSortField = allowedSortFields.has(sortField) ? sortField : 'transaction_date';
    const effectiveSortDirection = sortDirection === 'desc' ? 'desc' : 'asc';

    const supabaseUrl = Deno.env.get('Supabase_project_url');
    const supabaseKey = Deno.env.get('Supabase_Secret_Key');

    if (!supabaseUrl || !supabaseKey) {
      throw new Error('Missing Supabase credentials');
    }

    const queryUrl = new URL(`${supabaseUrl}/rest/v1/BankTransaction`);
    queryUrl.searchParams.set('select', '*');
    queryUrl.searchParams.set('limit', '2000');
    queryUrl.searchParams.set('order', `${effectiveSortField}.${effectiveSortDirection}`);

    if (bankAccountId) {
      queryUrl.searchParams.set('bank_account_id', `eq.${bankAccountId}`);
    }

    if (sourceType) {
      queryUrl.searchParams.set('source_type', `eq.${sourceType}`);
    }

    if (sourceId) {
      queryUrl.searchParams.set('source_id', `eq.${sourceId}`);
    }

    const supabaseResponse = await fetch(queryUrl.toString(), {
      headers: {
        apikey: supabaseKey,
        Authorization: `Bearer ${supabaseKey}`
      }
    });

    if (!supabaseResponse.ok) {
      const errorText = await supabaseResponse.text();
      throw new Error(`Supabase query failed: ${supabaseResponse.status} ${errorText}`);
    }

    const transactions = await supabaseResponse.json();
    console.log('getBankTransactions raw count:', Array.isArray(transactions) ? transactions.length : 0);

    const filteredTransactions = transactions
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
      });

    return Response.json({
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
    });
  } catch (error) {
    console.error('getBankTransactions error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});