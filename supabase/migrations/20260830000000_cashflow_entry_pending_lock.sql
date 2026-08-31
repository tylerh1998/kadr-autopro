ALTER TABLE "LinesOfCreditTransaction"
  ADD COLUMN IF NOT EXISTS pending_cash_flow_entry_id text REFERENCES "CashFlowEntry"(id) ON DELETE SET NULL;

ALTER TABLE "SupplierInvoiceLine"
  ADD COLUMN IF NOT EXISTS pending_cash_flow_entry_id text REFERENCES "CashFlowEntry"(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_loc_transaction_pending_cfe
  ON "LinesOfCreditTransaction"(pending_cash_flow_entry_id)
  WHERE pending_cash_flow_entry_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_supplier_invoice_line_pending_cfe
  ON "SupplierInvoiceLine"(pending_cash_flow_entry_id)
  WHERE pending_cash_flow_entry_id IS NOT NULL;
