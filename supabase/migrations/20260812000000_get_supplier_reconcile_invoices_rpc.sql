-- Backs the ReconcileSupplier feature's "AutoPro side" read. Groups every
-- SupplierInvoiceLine for a supplier into conceptual invoices (same shape as
-- get_supplier_transactions_optimized) FIRST, then filters the aggregated
-- result, not individual lines. Filtering per-line was an earlier bug: a
-- multi-line invoice with one already-paid line would show only its unpaid
-- lines (understating the subtotal), and a legitimate multi-line invoice
-- containing one $0 line (e.g. a $0 GST line) would have that line dropped
-- even though the invoice as a whole isn't blank. Both rules below are
-- invoice-wide judgments instead:
--   - "not fully paid": ABS(balance_due) > 0.005
--   - "not blank": NOT (subtotal AND tax_amount both ~0)
CREATE OR REPLACE FUNCTION public.get_supplier_reconcile_invoices(p_supplier_id text)
RETURNS jsonb
LANGUAGE plpgsql
AS $function$
DECLARE
    v_conceptual_invoices JSONB;
BEGIN
    WITH enriched_lines AS (
        SELECT
            sil.id,
            sil.supplier_id,
            sil.invoice_number,
            sil.invoice_date,
            sil.inventory_item_id,
            sil.description,
            COALESCE(NULLIF(sil.purchase_amount::text, ''), '0')::numeric AS purchase_amount,
            COALESCE(NULLIF(sil.gst_amount::text, ''), '0')::numeric AS gst_amount,
            COALESCE(NULLIF(sil.paid_amount::text, ''), '0')::numeric AS paid_amount,
            sil.gl_account,
            sil.inventory,
            sil.gst_override,
            sil.inventory_credit,
            ROUND(COALESCE(NULLIF(sil.purchase_amount::text, ''), '0')::numeric, 2) AS charge,
            ROUND(COALESCE(NULLIF(sil.gst_amount::text, ''), '0')::numeric, 2) AS gst,
            ROUND((COALESCE(NULLIF(sil.purchase_amount::text, ''), '0')::numeric + COALESCE(NULLIF(sil.gst_amount::text, ''), '0')::numeric)::numeric, 2) AS line_total
        FROM "SupplierInvoiceLine" sil
        WHERE sil.supplier_id = p_supplier_id
    ),
    conceptual_invoices_raw AS (
        SELECT
            el.supplier_id,
            el.invoice_number,
            el.invoice_date,
            COUNT(el.id) AS line_count,
            ROUND(SUM(el.charge)::numeric, 2) AS subtotal,
            ROUND(SUM(el.gst)::numeric, 2) AS tax_amount,
            ROUND(SUM(el.line_total)::numeric, 2) AS total_amount,
            ROUND(SUM(el.paid_amount)::numeric, 2) AS amount_paid,
            ROUND(SUM(el.line_total - el.paid_amount)::numeric, 2) AS balance_due,
            json_agg(
                json_build_object(
                    'id', el.id,
                    'supplier_id', el.supplier_id,
                    'invoice_number', el.invoice_number,
                    'invoice_date', el.invoice_date,
                    'inventory_item_id', el.inventory_item_id,
                    'description', el.description,
                    'purchase_amount', el.purchase_amount,
                    'gst_amount', el.gst_amount,
                    'paid_amount', el.paid_amount,
                    'gl_account', el.gl_account,
                    'inventory', el.inventory,
                    'gst_override', el.gst_override,
                    'inventory_credit', el.inventory_credit,
                    'charge', el.charge,
                    'gst', el.gst,
                    'line_total', el.line_total
                ) ORDER BY el.invoice_date, el.invoice_number
            ) AS lines
        FROM enriched_lines el
        GROUP BY el.supplier_id, el.invoice_number, el.invoice_date
    )
    SELECT COALESCE(json_agg(cir ORDER BY cir.invoice_date, cir.invoice_number), '[]'::json)
    INTO v_conceptual_invoices
    FROM conceptual_invoices_raw cir
    WHERE ABS(cir.balance_due) > 0.005
      AND NOT (ABS(cir.subtotal) < 0.005 AND ABS(cir.tax_amount) < 0.005);

    RETURN json_build_object('conceptualInvoices', COALESCE(v_conceptual_invoices, '[]'::jsonb));
END;
$function$;
