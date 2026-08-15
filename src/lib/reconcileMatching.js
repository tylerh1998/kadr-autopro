// Pure matching logic for the Supplier Statement Reconciliation feature.
// Kept dependency-free (no React, no Supabase) so it can be reasoned about/tested in isolation.

const AMOUNT_TOLERANCE = 0.005;

export const normalizeInvoiceNumber = (value) => String(value || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');

const round2 = (value) => Math.round((parseFloat(value) || 0) * 100) / 100;

const dayDiff = (dateA, dateB) => {
  if (!dateA || !dateB) return Infinity;
  const a = new Date(`${dateA}T00:00:00`);
  const b = new Date(`${dateB}T00:00:00`);
  if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) return Infinity;
  return Math.abs(a.getTime() - b.getTime()) / 86400000;
};

// statementInvoices: [{ invoice_number, invoice_date, amount }] (from autopro-processSupplierStatementOCR)
// autoproConceptualInvoices: [{ invoice_number, invoice_date, total_amount, ... }] (from autopro-getSupplierReconcileInvoices)
// Returns { matched: [{ statement, autopro, dateMismatch }], notInAutoPro: [statement...], notOnStatement: [autopro...] }
export function matchStatementToAutoPro(statementInvoices, autoproConceptualInvoices) {
  const pool = (autoproConceptualInvoices || []).map((invoice, index) => ({ invoice, index, consumed: false }));
  const matched = [];
  const notInAutoPro = [];

  (statementInvoices || []).forEach((statementInvoice) => {
    const targetAmount = round2(statementInvoice.amount);
    const statementNormNumber = normalizeInvoiceNumber(statementInvoice.invoice_number);

    const candidates = pool.filter((entry) => !entry.consumed && Math.abs(round2(entry.invoice.total_amount) - targetAmount) < AMOUNT_TOLERANCE);

    if (candidates.length === 0) {
      notInAutoPro.push(statementInvoice);
      return;
    }

    let best = candidates[0];
    if (candidates.length > 1) {
      const numberMatches = candidates.filter((entry) => statementNormNumber && normalizeInvoiceNumber(entry.invoice.invoice_number) === statementNormNumber);
      const tieBreakPool = numberMatches.length > 0 ? numberMatches : candidates;
      best = tieBreakPool.reduce((closest, entry) => {
        return dayDiff(entry.invoice.invoice_date, statementInvoice.invoice_date) < dayDiff(closest.invoice.invoice_date, statementInvoice.invoice_date)
          ? entry
          : closest;
      }, tieBreakPool[0]);
    }

    best.consumed = true;
    const dateMismatch = !!(statementInvoice.invoice_date && best.invoice.invoice_date && statementInvoice.invoice_date !== best.invoice.invoice_date);
    matched.push({ statement: statementInvoice, autopro: best.invoice, dateMismatch });
  });

  const notOnStatement = pool.filter((entry) => !entry.consumed).map((entry) => entry.invoice);

  return { matched, notInAutoPro, notOnStatement };
}

const FUZZY_ABS_TOLERANCE = 2.0;
const FUZZY_PCT_TOLERANCE = 0.02;

const isFuzzyAmountMatch = (a, b) => {
  const diff = Math.abs(a - b);
  if (diff < AMOUNT_TOLERANCE) return false;
  const tolerance = Math.max(FUZZY_ABS_TOLERANCE, Math.max(Math.abs(a), Math.abs(b)) * FUZZY_PCT_TOLERANCE);
  return diff <= tolerance;
};

const toCents = (amount) => Math.round(Math.abs(amount) * 100);

const digitMultiset = (value) => String(value).split('').sort().join('');

const isDigitTransposition = (a, b) => {
  const centsA = toCents(a);
  const centsB = toCents(b);
  if (centsA === centsB) return false;
  const strA = String(centsA);
  const strB = String(centsB);
  if (strA.length !== strB.length) return false;
  return digitMultiset(strA) === digitMultiset(strB);
};

const isDecimalShift = (a, b) => {
  const absA = Math.abs(a);
  const absB = Math.abs(b);
  if (absA < AMOUNT_TOLERANCE || absB < AMOUNT_TOLERANCE) return false;
  const ratio = absA > absB ? absA / absB : absB / absA;
  return Math.abs(ratio - 10) < 0.02 || Math.abs(ratio - 100) < 0.2;
};

const buildDiscrepancyReason = (statementAmount, autoproAmount, invoiceNumberMatched) => {
  const transposition = isDigitTransposition(statementAmount, autoproAmount);
  const decimalShift = isDecimalShift(statementAmount, autoproAmount);

  let primary;
  if (invoiceNumberMatched) primary = 'Invoice Total Mismatch';
  else if (transposition) primary = 'Possible Digit Transposition';
  else if (decimalShift) primary = 'Possible Decimal Shift';
  else primary = 'Close Amount Match — Verify';

  const hints = [];
  if (invoiceNumberMatched && transposition) hints.push('possible digit transposition');
  if (invoiceNumberMatched && decimalShift) hints.push('possible decimal shift');

  return hints.length > 0 ? `${primary} (${hints.join(', ')})` : primary;
};

// Second pass over pass-1's leftovers, looking for pairs that are almost certainly the
// same invoice despite not matching exactly on total. See Phase F in
// reconcilesupplier_implementation_plan.md for the full tier design/rationale.
// notInAutoPro: statement rows left over from matchStatementToAutoPro
// notOnStatement: AutoPro conceptual invoices left over from matchStatementToAutoPro
// Returns { errors: [{ key, statement, autopro, reason, difference }], notInAutoPro, notOnStatement } (both arrays pruned of consumed entries)
export function findDiscrepancies(notInAutoPro, notOnStatement) {
  const pool = (notOnStatement || []).map((invoice, index) => ({ invoice, index, consumed: false }));
  const errors = [];
  const remainingNotInAutoPro = [];

  (notInAutoPro || []).forEach((statementInvoice) => {
    const statementAmount = round2(statementInvoice.amount);
    const statementNormNumber = normalizeInvoiceNumber(statementInvoice.invoice_number);

    const numberMatches = statementNormNumber
      ? pool.filter((entry) => !entry.consumed && normalizeInvoiceNumber(entry.invoice.invoice_number) === statementNormNumber)
      : [];

    let candidatePool = numberMatches;
    const matchedByNumber = numberMatches.length > 0;

    if (candidatePool.length === 0) {
      candidatePool = pool.filter((entry) => {
        if (entry.consumed) return false;
        const autoproAmount = round2(entry.invoice.total_amount);
        return isDigitTransposition(statementAmount, autoproAmount)
          || isDecimalShift(statementAmount, autoproAmount)
          || isFuzzyAmountMatch(statementAmount, autoproAmount);
      });
    }

    if (candidatePool.length === 0) {
      remainingNotInAutoPro.push(statementInvoice);
      return;
    }

    const best = candidatePool.reduce((closest, entry) => {
      const diffEntry = Math.abs(round2(entry.invoice.total_amount) - statementAmount);
      const diffClosest = Math.abs(round2(closest.invoice.total_amount) - statementAmount);
      if (diffEntry !== diffClosest) return diffEntry < diffClosest ? entry : closest;
      return dayDiff(entry.invoice.invoice_date, statementInvoice.invoice_date) < dayDiff(closest.invoice.invoice_date, statementInvoice.invoice_date)
        ? entry
        : closest;
    }, candidatePool[0]);

    best.consumed = true;
    const autoproAmount = round2(best.invoice.total_amount);
    errors.push({
      key: `err_${errors.length}`,
      statement: statementInvoice,
      autopro: best.invoice,
      reason: buildDiscrepancyReason(statementAmount, autoproAmount, matchedByNumber),
      difference: round2(statementAmount - autoproAmount),
    });
  });

  const remainingNotOnStatement = pool.filter((entry) => !entry.consumed).map((entry) => entry.invoice);

  return { errors, notInAutoPro: remainingNotInAutoPro, notOnStatement: remainingNotOnStatement };
}
