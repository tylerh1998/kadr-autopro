CREATE OR REPLACE FUNCTION add_to_cash_flow_atomic(
  p_entry jsonb,
  p_loc_transaction_ids text[] DEFAULT '{}',
  p_supplier_invoice_line_ids text[] DEFAULT '{}'
) RETURNS text
LANGUAGE plpgsql
AS $$
DECLARE
  v_entry_id text;
BEGIN
  INSERT INTO "CashFlowEntry" (
    id, supplier, supplier_id, loc_id, amount, due_date, amount_paid, created_date, updated_date
  )
  SELECT
    p_entry->>'id',
    p_entry->>'supplier',
    p_entry->>'supplier_id',
    p_entry->>'loc_id',
    (p_entry->>'amount')::double precision,
    p_entry->>'due_date',
    0,
    (p_entry->>'created_date')::timestamptz,
    (p_entry->>'updated_date')::timestamptz
  RETURNING id INTO v_entry_id;

  IF array_length(p_loc_transaction_ids, 1) > 0 THEN
    UPDATE "LinesOfCreditTransaction"
    SET pending_cash_flow_entry_id = v_entry_id
    WHERE id = ANY(p_loc_transaction_ids) AND pending_cash_flow_entry_id IS NULL;
  END IF;

  IF array_length(p_supplier_invoice_line_ids, 1) > 0 THEN
    UPDATE "SupplierInvoiceLine"
    SET pending_cash_flow_entry_id = v_entry_id
    WHERE id = ANY(p_supplier_invoice_line_ids) AND pending_cash_flow_entry_id IS NULL;
  END IF;

  RETURN v_entry_id;
END;
$$;
