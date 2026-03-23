const toNumber = (value, fallback = 0) => {
  const parsed = typeof value === 'number' ? value : parseFloat(value ?? fallback);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const normalizeInvoiceItem = (item, fallbackAmount) => {
  if (typeof item === 'string') {
    const trimmed = item.trim();
    return trimmed ? { invoice_number: trimmed, amount_applied: fallbackAmount } : null;
  }

  if (!item || typeof item !== 'object') return null;

  const invoiceNumber = item.invoice_number ?? item.invoiceNumber ?? item.invoice ?? item.number ?? '';
  const trimmedInvoiceNumber = String(invoiceNumber || '').trim();

  if (!trimmedInvoiceNumber) return null;

  return {
    invoice_number: trimmedInvoiceNumber,
    amount_applied: toNumber(
      item.amount_applied ?? item.amountApplied ?? item.amount,
      fallbackAmount
    )
  };
};

export const parseSupplierPaymentInvoices = (rawInvoiceValue, paymentAmount = 0) => {
  if (!rawInvoiceValue) return [];

  if (Array.isArray(rawInvoiceValue)) {
    return rawInvoiceValue
      .map((item) => normalizeInvoiceItem(item, paymentAmount))
      .filter(Boolean);
  }

  if (typeof rawInvoiceValue === 'object') {
    if (Array.isArray(rawInvoiceValue.appliedInvoices)) {
      return parseSupplierPaymentInvoices(rawInvoiceValue.appliedInvoices, paymentAmount);
    }

    const normalized = normalizeInvoiceItem(rawInvoiceValue, paymentAmount);
    return normalized ? [normalized] : [];
  }

  if (typeof rawInvoiceValue === 'string') {
    const trimmed = rawInvoiceValue.trim();
    if (!trimmed) return [];

    try {
      return parseSupplierPaymentInvoices(JSON.parse(trimmed), paymentAmount);
    } catch {
      return trimmed === 'On Account'
        ? []
        : [{ invoice_number: trimmed, amount_applied: paymentAmount }];
    }
  }

  return [];
};