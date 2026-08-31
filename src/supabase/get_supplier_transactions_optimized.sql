CREATE OR REPLACE FUNCTION public.get_supplier_transactions_optimized(p_supplier_id text, p_from_date date, p_to_date date)
 RETURNS jsonb
 LANGUAGE plpgsql
AS $function$DECLARE
    v_supplier_data JSONB;
    v_all_lines_enriched JSONB;
    v_conceptual_invoices_materialized JSONB;
    v_conceptual_invoices_all_dates JSONB;
    v_conceptual_invoices_date_range JSONB;
    v_invoice_lines_date_range JSONB;
    v_total_current_balance NUMERIC;
    v_date_range_total NUMERIC;
    v_chart_of_accounts JSONB;
BEGIN
    SELECT json_build_object(
        'id', s.id,
        'name', s.name,
        'default_gl_account', s.default_gl_account,
        'default_taxable', s.default_taxable,
        'LockedByUser', s."LockedByUser"
    ) INTO v_supplier_data
    FROM "Supplier" s
    WHERE s.id = p_supplier_id;

    IF v_supplier_data IS NULL THEN
        RETURN json_build_object('error', 'Supplier not found');
    END IF;

    -- pending_cash_flow_entry_id is included in every line projection below so the frontend's
    -- lock/edit-guard (isLineLocked in SupplierTx.jsx) can see it without a separate fetch.
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
            sil.pending_cash_flow_entry_id,
            sil.created_date,
            sil.updated_date,
            sil.created_by,
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
                    'pending_cash_flow_entry_id', el.pending_cash_flow_entry_id,
                    'created_date', el.created_date,
                    'updated_date', el.updated_date,
                    'created_by', el.created_by,
                    'charge', el.charge,
                    'gst', el.gst,
                    'line_total', el.line_total
                ) ORDER BY el.invoice_date, el.invoice_number
            ) AS lines
        FROM enriched_lines el
        GROUP BY el.supplier_id, el.invoice_number, el.invoice_date
    )
    SELECT json_agg(cir)
    INTO v_conceptual_invoices_materialized
    FROM conceptual_invoices_raw cir;

    v_conceptual_invoices_all_dates := v_conceptual_invoices_materialized;

   SELECT ROUND(COALESCE(SUM((COALESCE(NULLIF(elem->>'total_amount', ''), '0')::numeric) - (COALESCE(NULLIF(elem->>'amount_paid', ''), '0')::numeric)), 0)::numeric, 2)
INTO v_total_current_balance
FROM jsonb_array_elements(v_conceptual_invoices_materialized) AS elem;

    SELECT json_agg(elem)
    INTO v_conceptual_invoices_date_range
    FROM jsonb_array_elements(v_conceptual_invoices_materialized) AS elem
    WHERE (elem->>'invoice_date')::DATE >= p_from_date AND (elem->>'invoice_date')::DATE <= p_to_date;

    WITH temp_enriched_lines AS (
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
            sil.pending_cash_flow_entry_id,
            sil.created_date,
            sil.updated_date,
            sil.created_by,
            ROUND(COALESCE(NULLIF(sil.purchase_amount::text, ''), '0')::numeric, 2) AS charge,
            ROUND(COALESCE(NULLIF(sil.gst_amount::text, ''), '0')::numeric, 2) AS gst,
            ROUND((COALESCE(NULLIF(sil.purchase_amount::text, ''), '0')::numeric + COALESCE(NULLIF(sil.gst_amount::text, ''), '0')::numeric)::numeric, 2) AS line_total
        FROM "SupplierInvoiceLine" sil
        WHERE sil.supplier_id = p_supplier_id AND sil.invoice_date::DATE >= p_from_date AND sil.invoice_date::DATE <= p_to_date
    )
    SELECT json_agg(el)
    INTO v_invoice_lines_date_range
    FROM temp_enriched_lines el;

    WITH temp_enriched_lines AS (
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
            sil.pending_cash_flow_entry_id,
            sil.created_date,
            sil.updated_date,
            sil.created_by,
            ROUND(COALESCE(NULLIF(sil.purchase_amount::text, ''), '0')::numeric, 2) AS charge,
            ROUND(COALESCE(NULLIF(sil.gst_amount::text, ''), '0')::numeric, 2) AS gst,
            ROUND((COALESCE(NULLIF(sil.purchase_amount::text, ''), '0')::numeric + COALESCE(NULLIF(sil.gst_amount::text, ''), '0')::numeric)::numeric, 2) AS line_total
        FROM "SupplierInvoiceLine" sil
        WHERE sil.supplier_id = p_supplier_id AND sil.invoice_date::DATE >= p_from_date AND sil.invoice_date::DATE <= p_to_date
    )
    SELECT ROUND(COALESCE(SUM(el.line_total), 0)::numeric, 2)
    INTO v_date_range_total
    FROM temp_enriched_lines el;

    WITH all_enriched_lines AS (
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
            sil.pending_cash_flow_entry_id,
            sil.created_date,
            sil.updated_date,
            sil.created_by,
            ROUND(COALESCE(NULLIF(sil.purchase_amount::text, ''), '0')::numeric, 2) AS charge,
            ROUND(COALESCE(NULLIF(sil.gst_amount::text, ''), '0')::numeric, 2) AS gst,
            ROUND((COALESCE(NULLIF(sil.purchase_amount::text, ''), '0')::numeric + COALESCE(NULLIF(sil.gst_amount::text, ''), '0')::numeric)::numeric, 2) AS line_total
        FROM "SupplierInvoiceLine" sil
        WHERE sil.supplier_id = p_supplier_id
    )
    SELECT json_agg(el)
    INTO v_all_lines_enriched
    FROM all_enriched_lines el;

    SELECT json_agg(
        json_build_object(
            'id', coa.id,
            'account_number', coa.account_number,
            'account_name', coa.account_name,
            'account_type', coa.account_type,
            'description', coa.description,
            'is_active', coa.is_active,
            'controlled', coa.controlled,
            'created_date', coa.created_date,
            'updated_date', coa.updated_date,
            'created_by', coa.created_by
        ) ORDER BY coa.account_number
    ) INTO v_chart_of_accounts
    FROM "ChartOfAccount" coa;

    RETURN json_build_object(
        'supplier', v_supplier_data,
        'payments', '[]'::jsonb,
        'allConceptualInvoices', COALESCE(v_conceptual_invoices_all_dates, '[]'::jsonb),
        'conceptualInvoices', COALESCE(v_conceptual_invoices_date_range, '[]'::jsonb),
        'allInvoiceLines', COALESCE(v_all_lines_enriched, '[]'::jsonb),
        'invoiceLines', COALESCE(v_invoice_lines_date_range, '[]'::jsonb),
        'currentBalance', v_total_current_balance,
        'dateRangeTotal', v_date_range_total,
        'chartOfAccounts', COALESCE(v_chart_of_accounts, '[]'::jsonb)
    );
END;$function$
