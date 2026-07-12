-- Function: get_vehicle_work_order_history
-- Description: Retrieves and merges native WorkOrder records and LankarWOInfo historical records for a given vehicle.

CREATE OR REPLACE FUNCTION get_vehicle_work_order_history(p_vehicle_id TEXT)
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
BEGIN
  RETURN QUERY
  
  -- 1. Native Work Orders
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

  -- 2. Lankar Historical Work Orders
  SELECT 
    'lankar-' || l.woid as id,
    p_vehicle_id as vehicle_id,
    -- Map Stage
    CASE 
      WHEN UPPER(NULLIF(TRIM(l."WOorPWOorEorINVorCRED"), '')) IN ('UINVOICE', 'UPINVOICE') THEN 'invoice'
      ELSE 'work_order'
    END as stage,
    -- Map Status
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
    -- Map Dates (invoice date takes precedence, fallback to wodate)
    COALESCE(
      CAST(NULLIF(TRIM(l.invoicedate), '') AS TIMESTAMP WITH TIME ZONE),
      CAST(NULLIF(TRIM(l.wodate), '') AS TIMESTAMP WITH TIME ZONE)
    ) as created_date,
    -- Map Totals & Odometer
    CAST(NULLIF(TRIM(l.totalinvoiceamt), '') AS NUMERIC) as total_amount,
    CAST(NULLIF(TRIM(l."txtOdometer"), '') AS INTEGER) as odometer,
    true as "isLankar",
    l.woid as "originalWoid",
    NULL::TIMESTAMP WITH TIME ZONE as scheduled_date
  FROM "LankarWOInfo" l
  WHERE l.vehid = p_vehicle_id
  
  -- Sort combined results
  ORDER BY created_date DESC;
END;
$$;

-------------------------------------------------------------------
-- TEST SCRIPT
-- Instructions: Run the following block in the Supabase SQL Editor 
-- replacing the placeholder UUID with a real vehicle ID from your database.
-------------------------------------------------------------------

/*
-- Example Test Execution:

-- 1. Find a vehicle that has Lankar history
SELECT id, year, make, model FROM "Vehicle" 
WHERE id IN (SELECT vehid FROM "LankarWOInfo" LIMIT 10);

-- 2. Run the function with that ID (replace the ID)
SELECT * FROM get_vehicle_work_order_history('69562a128758b75c1e37dac7');
*/
