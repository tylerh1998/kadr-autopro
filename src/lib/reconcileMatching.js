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
