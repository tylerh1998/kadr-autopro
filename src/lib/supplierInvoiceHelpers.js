// Resolves a "conceptual invoice" (a group of one or more real SupplierInvoiceLine rows sharing
// a supplier_id/invoice_number/invoice_date) down to the real underlying row ids and the amount
// outstanding on each - the same resolution real payments already use (SupplierPaymentModal's
// processPaymentLogic) and now also what "Add to Cash Flow" uses to know which specific rows to
// lock, so both stages resolve "which invoice" identically instead of drifting apart.
export const buildAppliedDetailsFromConceptualInvoice = (invoice) => {
  const invoiceBalance = Math.round((parseFloat(invoice?.balance_due) || 0) * 100) / 100;
  const lineDetails = Array.isArray(invoice?.lines)
    ? invoice.lines
        .map((line) => {
          const charge = parseFloat(line?.line_total) || ((parseFloat(line?.charge ?? line?.purchase_amount) || 0) + (parseFloat(line?.gst ?? line?.gst_amount) || 0));
          const paid = parseFloat(line?.paid_amount) || 0;
          const amountApplied = Math.round((charge - paid) * 100) / 100;

          if (Math.abs(amountApplied) <= 0.005) return null;

          return {
            id: line?.id || undefined,
            invoice_number: line?.invoice_number || invoice?.invoice_number,
            invoice_date: line?.invoice_date || invoice?.invoice_date,
            amount_applied: amountApplied
          };
        })
        .filter(Boolean)
    : [];

  if (lineDetails.length === 0) {
    return [{
      invoice_number: invoice?.invoice_number,
      invoice_date: invoice?.invoice_date,
      amount_applied: invoiceBalance
    }];
  }

  const detailTotal = Math.round(lineDetails.reduce((sum, line) => sum + line.amount_applied, 0) * 100) / 100;
  const roundingDifference = Math.round((invoiceBalance - detailTotal) * 100) / 100;

  if (Math.abs(roundingDifference) > 0.005) {
    const lastIndex = lineDetails.length - 1;
    lineDetails[lastIndex] = {
      ...lineDetails[lastIndex],
      amount_applied: Math.round((lineDetails[lastIndex].amount_applied + roundingDifference) * 100) / 100
    };
  }

  return lineDetails;
};
