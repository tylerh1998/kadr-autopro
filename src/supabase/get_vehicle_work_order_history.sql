-- Function: get_vehicle_work_order_history
-- Description: Retrieves and merges native WorkOrder records and LankarWOInfo historical records for a given vehicle,
-- with optional Mountain Time aware days-back, date-range, and search filtering.

DROP FUNCTION IF EXISTS get_vehicle_work_order_history(TEXT);
DROP FUNCTION IF EXISTS get_vehicle_work_order_history(TEXT, INTEGER, DATE, DATE, TEXT);

CREATE OR REPLACE FUNCTION get_vehicle_work_order_history(
  p_vehicle_id TEXT,
  p_days_back INTEGER DEFAULT 365,
  p_from_date DATE DEFAULT NULL,
  p_to_date DATE DEFAULT NULL,
  p_search_term TEXT DEFAULT NULL
)
RETURNS TABLE (
  id TEXT,
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
  scheduled_date TIMESTAMP WITH TIME ZONE
)
LANGUAGE plpgsql
AS $$
DECLARE
  v_today_mt DATE := (NOW() AT TIME ZONE 'America/Edmonton')::DATE;
  v_effective_from DATE := NULL;
  v_effective_to DATE := NULL;
  v_search_term TEXT := NULLIF(BTRIM(p_search_term), '');
BEGIN
  IF p_from_date IS NOT NULL OR p_to_date IS NOT NULL THEN
    v_effective_from := p_from_date;
    v_effective_to := p_to_date;
  ELSIF p_days_back IS NOT NULL THEN
    v_effective_to := v_today_mt;
    v_effective_from := v_today_mt - GREATEST(p_days_back, 0);
  END IF;

  RETURN QUERY
  WITH combined_history AS (
    SELECT 
      w.id::TEXT as id,
      w.vehicle_id,
      w.stage,
      w.status,
      w.description,
      w.ro_number,
      w.wo_number,
      w.est_number,
      w.inv_number,
      w.crinv_number,
      w.created_date,
      w.total_amount,
      w.odometer,
      false as "isLankar",
      NULL::TEXT as "originalWoid",
      NULL::TIMESTAMP WITH TIME ZONE as scheduled_date
    FROM "WorkOrder" w
    WHERE w.vehicle_id = p_vehicle_id

    UNION ALL

    SELECT 
      'lankar-' || l.woid as id,
      p_vehicle_id as vehicle_id,
      CASE 
        WHEN UPPER(NULLIF(TRIM(l."WOorPWOorEorINVorCRED"), '')) IN ('UINVOICE', 'UPINVOICE') THEN 'invoice'
        ELSE 'work_order'
      END as stage,
      CASE 
        WHEN NULLIF(TRIM(l."WOdeleted"), '') IS NOT NULL 
             AND TRIM(l."WOdeleted") NOT IN ('0', 'false') THEN 'Void'
        ELSE 'Completed'
      END as status,
      l."Summary" as description,
      l.woid as ro_number,
      l.woid as wo_number,
      NULL::TEXT as est_number,
      l.invoiceid as inv_number,
      NULL::TEXT as crinv_number,
      COALESCE(
        CAST(NULLIF(TRIM(l.invoicedate), '') AS TIMESTAMP WITH TIME ZONE),
        CAST(NULLIF(TRIM(l.wodate), '') AS TIMESTAMP WITH TIME ZONE)
      ) as created_date,
      CAST(NULLIF(TRIM(l.totalinvoiceamt), '') AS NUMERIC) as total_amount,
      CAST(NULLIF(TRIM(l."txtOdometer"), '') AS INTEGER) as odometer,
      true as "isLankar",
      l.woid as "originalWoid",
      NULL::TIMESTAMP WITH TIME ZONE as scheduled_date
    FROM "LankarWOInfo" l
    WHERE l.vehid = p_vehicle_id
  )
  SELECT
    ch.id,
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
    ch.scheduled_date
  FROM combined_history ch
  WHERE (v_effective_from IS NULL OR (ch.created_date AT TIME ZONE 'America/Edmonton')::DATE >= v_effective_from)
    AND (v_effective_to IS NULL OR (ch.created_date AT TIME ZONE 'America/Edmonton')::DATE <= v_effective_to)
    AND (
      v_search_term IS NULL
      OR COALESCE(ch.description, '') ILIKE '%' || v_search_term || '%'
      OR COALESCE(ch.ro_number, '') ILIKE '%' || v_search_term || '%'
      OR COALESCE(ch.wo_number, '') ILIKE '%' || v_search_term || '%'
      OR COALESCE(ch.est_number, '') ILIKE '%' || v_search_term || '%'
      OR COALESCE(ch.inv_number, '') ILIKE '%' || v_search_term || '%'
      OR COALESCE(ch.crinv_number, '') ILIKE '%' || v_search_term || '%'
    )
  ORDER BY ch.created_date DESC NULLS LAST;
END;
$$;