-- Function: get_customer_work_order_history
-- Description: Retrieves and merges native WorkOrder records and legacy LankarWOInfo historical records for a given customer,
-- with optional Mountain Time aware days-back, date-range, and search filtering.

DROP FUNCTION IF EXISTS get_customer_work_order_history(TEXT);
DROP FUNCTION IF EXISTS get_customer_work_order_history(TEXT, INTEGER, DATE, DATE, TEXT);

CREATE OR REPLACE FUNCTION get_customer_work_order_history(
  p_customer_id TEXT,
  p_days_back INTEGER DEFAULT 365,
  p_from_date DATE DEFAULT NULL,
  p_to_date DATE DEFAULT NULL,
  p_search_term TEXT DEFAULT NULL
)
RETURNS TABLE (
  id TEXT,
  customer_id TEXT,
  vehicle_id TEXT,
  stage TEXT,
  status TEXT,
  description TEXT,
  ro_number TEXT,
  wo_number TEXT,
  est_number TEXT,
  inv_number TEXT,
  crinv_number TEXT,
  created_date TIMESTAMP WITH TIME ZONE,
  total_amount NUMERIC,
  odometer INTEGER,
  "isLankar" BOOLEAN,
  "originalWoid" TEXT,
  scheduled_date TIMESTAMP WITH TIME ZONE,
  vehicle_year BIGINT,
  vehicle_make TEXT,
  vehicle_model TEXT
)
LANGUAGE plpgsql
AS $$
DECLARE
  v_today_mt DATE := (NOW() AT TIME ZONE 'America/Edmonton')::DATE;
  v_effective_from DATE := NULL;
  v_effective_to DATE := NULL;
  v_search_term TEXT := NULLIF(BTRIM(p_search_term), '');
  v_legacy_cusid TEXT := NULL;
BEGIN
  IF p_from_date IS NOT NULL OR p_to_date IS NOT NULL THEN
    v_effective_from := p_from_date;
    v_effective_to := p_to_date;
  ELSIF p_days_back IS NOT NULL THEN
    v_effective_to := v_today_mt;
    v_effective_from := v_today_mt - GREATEST(p_days_back, 0);
  END IF;

  SELECT NULLIF(BTRIM(c.cusid), '')
  INTO v_legacy_cusid
  FROM public."Customer" c
  WHERE c.id::TEXT = p_customer_id
  LIMIT 1;

  RETURN QUERY
  WITH combined_history AS (
    SELECT
      w.id::TEXT AS id,
      w.customer_id::TEXT AS customer_id,
      w.vehicle_id::TEXT AS vehicle_id,
      w.stage,
      w.status,
      w.description,
      w.ro_number,
      w.wo_number,
      w.est_number,
      w.inv_number,
      w.crinv_number,
      w.created_date AS created_date,
      w.total_amount,
      w.odometer,
      false AS "isLankar",
      NULL::TEXT AS "originalWoid",
      NULL::TIMESTAMP WITH TIME ZONE AS scheduled_date,
      veh.year AS vehicle_year,
      veh.make AS vehicle_make,
      veh.model AS vehicle_model
    FROM public."WorkOrder" w
    LEFT JOIN public."Vehicle" veh
      ON veh.id::TEXT = w.vehicle_id::TEXT
    WHERE w.customer_id = p_customer_id

    UNION ALL

    SELECT
      'lankar-' || l.woid AS id,
      p_customer_id AS customer_id,
      NULL::TEXT AS vehicle_id,
      CASE
        WHEN UPPER(NULLIF(TRIM(l."WOorPWOorEorINVorCRED"), '')) IN ('UINVOICE', 'UPINVOICE') THEN 'invoice'
        ELSE 'work_order'
      END AS stage,
      CASE
        WHEN NULLIF(TRIM(l."WOdeleted"), '') IS NOT NULL
             AND TRIM(l."WOdeleted") NOT IN ('0', 'false') THEN 'Void'
        ELSE 'Completed'
      END AS status,
      l."Summary" AS description,
      l.woid AS ro_number,
      l.woid AS wo_number,
      NULL::TEXT AS est_number,
      l.invoiceid AS inv_number,
      NULL::TEXT AS crinv_number,
      COALESCE(
        CAST(NULLIF(TRIM(l.invoicedate), '') AS TIMESTAMP WITH TIME ZONE),
        CAST(NULLIF(TRIM(l.wodate), '') AS TIMESTAMP WITH TIME ZONE)
      ) AS created_date,
      CAST(NULLIF(TRIM(l.totalinvoiceamt), '') AS NUMERIC) AS total_amount,
      CAST(NULLIF(TRIM(l."txtOdometer"), '') AS INTEGER) AS odometer,
      true AS "isLankar",
      l.woid AS "originalWoid",
      NULL::TIMESTAMP WITH TIME ZONE AS scheduled_date,
      veh.year AS vehicle_year,
      veh.make AS vehicle_make,
      veh.model AS vehicle_model
    FROM public."LankarWOInfo" l
    LEFT JOIN public."Vehicle" veh
      ON NULLIF(BTRIM(veh.vehid), '') = NULLIF(BTRIM(l.vehid), '')
    WHERE v_legacy_cusid IS NOT NULL
      AND NULLIF(BTRIM(l.cusid), '') = v_legacy_cusid
  )
  SELECT
    ch.id,
    ch.customer_id,
    ch.vehicle_id,
    ch.stage,
    ch.status,
    ch.description,
    ch.ro_number,
    ch.wo_number,
    ch.est_number,
    ch.inv_number,
    ch.crinv_number,
    ch.created_date,
    ch.total_amount,
    ch.odometer,
    ch."isLankar",
    ch."originalWoid",
    ch.scheduled_date,
    ch.vehicle_year,
    ch.vehicle_make,
    ch.vehicle_model
  FROM combined_history ch
  WHERE (
      v_search_term IS NOT NULL
      AND (
        COALESCE(ch.description, '') ILIKE '%' || v_search_term || '%'
        OR COALESCE(ch.ro_number, '') ILIKE '%' || v_search_term || '%'
        OR COALESCE(ch.wo_number, '') ILIKE '%' || v_search_term || '%'
        OR COALESCE(ch.est_number, '') ILIKE '%' || v_search_term || '%'
        OR COALESCE(ch.inv_number, '') ILIKE '%' || v_search_term || '%'
        OR COALESCE(ch.crinv_number, '') ILIKE '%' || v_search_term || '%'
      )
    )
    OR (
      v_search_term IS NULL
      AND (
        v_effective_from IS NULL
        OR (ch.created_date AT TIME ZONE 'America/Edmonton')::DATE >= v_effective_from
      )
      AND (
        v_effective_to IS NULL
        OR (ch.created_date AT TIME ZONE 'America/Edmonton')::DATE <= v_effective_to
      )
    )
  ORDER BY ch.created_date DESC NULLS LAST;
END;
$$;