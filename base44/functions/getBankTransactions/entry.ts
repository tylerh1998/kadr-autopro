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

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const payload = await req.json().catch(() => ({}));
    const { bankAccountId, fromDate, toDate, isReconciled, searchText } = payload;

    if (!bankAccountId) {
      return Response.json({ error: 'Missing bankAccountId' }, { status: 400 });
    }

    const effectiveFromDate = normalizeDateInput(fromDate) || getDefaultFromDateMountain();
    const effectiveToDate = normalizeDateInput(toDate) || getMountainDateString();
    const isReconciledProvided = Object.prototype.hasOwnProperty.call(payload, 'isReconciled') && isReconciled !== null;

    const transactions = await base44.entities.BankTransaction.filter(
      { bank_account_id: bankAccountId },
      'transaction_date',
      2000
    );

    const filteredTransactions = transactions
      .filter((tx) => tx.is_reversed !== true)
      .filter((tx) => {
        const txDate = normalizeDateInput(tx.transaction_date);
        if (!txDate) return false;
        return txDate >= effectiveFromDate && txDate <= effectiveToDate;
      })
      .filter((tx) => matchesReconciledFilter(tx, isReconciledProvided, isReconciled))
      .filter((tx) => matchesSearch(tx, searchText))
      .sort((a, b) => {
        const aDate = normalizeDateInput(a.transaction_date) || '';
        const bDate = normalizeDateInput(b.transaction_date) || '';
        return aDate.localeCompare(bDate);
      });

    return Response.json({
      transactions: filteredTransactions,
      meta: {
        bankAccountId,
        fromDate: effectiveFromDate,
        toDate: effectiveToDate,
        isReconciled: isReconciledProvided ? isReconciled : null,
        searchText: searchText || '',
        count: filteredTransactions.length
      }
    });
  } catch (error) {
    console.error('getBankTransactions error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});