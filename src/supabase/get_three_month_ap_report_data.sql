CREATE OR REPLACE FUNCTION public.get_three_month_ap_report_data(
    m1_start DATE, m1_end DATE,
    m2_start DATE, m2_end DATE,
    m3_start DATE, m3_end DATE
)
RETURNS TABLE (
    supplier_id TEXT,
    supplier_name TEXT,
    month1_ap NUMERIC,
    month2_ap NUMERIC,
    month3_ap NUMERIC,
    average_ap NUMERIC
)
LANGUAGE plpgsql
AS $$
BEGIN
    RETURN QUERY
    SELECT
        sup.id::text AS supplier_id,
        sup.name::text AS supplier_name,
        COALESCE(SUM(CASE WHEN sil.invoice_date >= m1_start::text AND sil.invoice_date <= m1_end::text THEN (sil.purchase_amount + sil.gst_amount) ELSE 0 END), 0)::NUMERIC AS month1_ap,
        COALESCE(SUM(CASE WHEN sil.invoice_date >= m2_start::text AND sil.invoice_date <= m2_end::text THEN (sil.purchase_amount + sil.gst_amount) ELSE 0 END), 0)::NUMERIC AS month2_ap,
        COALESCE(SUM(CASE WHEN sil.invoice_date >= m3_start::text AND sil.invoice_date <= m3_end::text THEN (sil.purchase_amount + sil.gst_amount) ELSE 0 END), 0)::NUMERIC AS month3_ap,
        (
            COALESCE(SUM(CASE WHEN sil.invoice_date >= m1_start::text AND sil.invoice_date <= m1_end::text THEN (sil.purchase_amount + sil.gst_amount) ELSE 0 END), 0) +
            COALESCE(SUM(CASE WHEN sil.invoice_date >= m2_start::text AND sil.invoice_date <= m2_end::text THEN (sil.purchase_amount + sil.gst_amount) ELSE 0 END), 0) +
            COALESCE(SUM(CASE WHEN sil.invoice_date >= m3_start::text AND sil.invoice_date <= m3_end::text THEN (sil.purchase_amount + sil.gst_amount) ELSE 0 END), 0)
        )::NUMERIC / 3.0 AS average_ap
    FROM "SupplierInvoiceLine" sil
    JOIN "Supplier" sup ON sil.supplier_id::text = sup.id::text
    WHERE sil.invoice_date >= m1_start::text
      AND sil.invoice_date <= m3_end::text
    GROUP BY sup.id, sup.name;
END;
$$;
