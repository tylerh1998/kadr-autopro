-- Backstop against malformed invoice_date values reaching SupplierInvoiceLine, following
-- the STAPLES Business Depot incident where a row was saved with invoice_date = '07/15/2026'
-- (MM/DD/YYYY) instead of ISO 'YYYY-MM-DD'. date-fns's parseISO/format in SupplierPaymentModal
-- can't parse that format and throws during render, white-screening SupplierTx's "Make Payment"
-- flow for any supplier with a malformed invoice_date among its outstanding invoices.
--
-- Client-side (SupplierTx.jsx handleSaveAll) and the autopro-saveSupplierInvoiceTransactions edge
-- function were both hardened to normalize/reject non-ISO dates before they reach this table; this
-- constraint is the last line of defense against any other write path (future UI, admin tooling,
-- direct API calls).
--
-- Added NOT VALID: one existing row (id 7c30415c330840f783c120fe, supplier STAPLES Business Depot)
-- still has invoice_date = '07/15/2026' and has not yet been corrected. NOT VALID lets this
-- constraint apply to all new inserts/updates immediately without requiring that row be fixed
-- first. Once it's corrected, run:
--   ALTER TABLE "SupplierInvoiceLine" VALIDATE CONSTRAINT invoice_date_iso_format;
-- to confirm the whole table conforms.
ALTER TABLE "SupplierInvoiceLine"
  ADD CONSTRAINT invoice_date_iso_format
  CHECK (invoice_date IS NULL OR invoice_date ~ '^\d{4}-\d{2}-\d{2}$') NOT VALID;
