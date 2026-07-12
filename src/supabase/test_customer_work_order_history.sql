-- Test scripts for get_customer_work_order_history
-- Test customer id with known history:
-- 695627c698ddf5629dafe285

-- 1) Confirm the customer record and whether a legacy cusid exists.
SELECT
  c.id,
  c.first_name,
  c.last_name,
  c.org_name,
  c.cusid
FROM public."Customer" c
WHERE c.id::TEXT = '695627c698ddf5629dafe285';

-- 2) Count native WorkOrder rows for the customer.
SELECT COUNT(*) AS native_work_order_count
FROM public."WorkOrder" w
WHERE w.customer_id = '695627c698ddf5629dafe285';

-- 3) Count matching legacy Lankar rows using the customer's cusid.
WITH target_customer AS (
  SELECT NULLIF(BTRIM(c.cusid), '') AS cusid
  FROM public."Customer" c
  WHERE c.id::TEXT = '695627c698ddf5629dafe285'
)
SELECT
  tc.cusid,
  COUNT(l.woid) AS legacy_lankar_count
FROM target_customer tc
LEFT JOIN public."LankarWOInfo" l
  ON tc.cusid IS NOT NULL
 AND NULLIF(BTRIM(l.cusid), '') = tc.cusid
GROUP BY tc.cusid;

-- 4) Smoke test: default behavior (last 365 days in Mountain Time when no explicit dates are passed).
SELECT
  h.id,
  h.stage,
  h.status,
  h.ro_number,
  h.inv_number,
  h.description,
  h.created_date,
  h."isLankar"
FROM get_customer_work_order_history('695627c698ddf5629dafe285') h
ORDER BY h.created_date DESC NULLS LAST
LIMIT 50;

-- 5) Full-history summary with no days-back cap.
SELECT
  h."isLankar",
  COUNT(*) AS row_count,
  MIN(h.created_date) AS oldest_row,
  MAX(h.created_date) AS newest_row
FROM get_customer_work_order_history(
  p_customer_id => '695627c698ddf5629dafe285',
  p_days_back => NULL,
  p_from_date => NULL,
  p_to_date => NULL,
  p_search_term => NULL
) h
GROUP BY h."isLankar"
ORDER BY h."isLankar";

-- 6) Validation: native + legacy source counts should equal the full-history function count.
WITH target_customer AS (
  SELECT NULLIF(BTRIM(c.cusid), '') AS cusid
  FROM public."Customer" c
  WHERE c.id::TEXT = '695627c698ddf5629dafe285'
),
native_count AS (
  SELECT COUNT(*) AS native_rows
  FROM public."WorkOrder" w
  WHERE w.customer_id = '695627c698ddf5629dafe285'
),
legacy_count AS (
  SELECT COUNT(l.woid) AS legacy_rows
  FROM target_customer tc
  LEFT JOIN public."LankarWOInfo" l
    ON tc.cusid IS NOT NULL
   AND NULLIF(BTRIM(l.cusid), '') = tc.cusid
),
function_count AS (
  SELECT COUNT(*) AS function_rows
  FROM get_customer_work_order_history(
    p_customer_id => '695627c698ddf5629dafe285',
    p_days_back => NULL,
    p_from_date => NULL,
    p_to_date => NULL,
    p_search_term => NULL
  )
)
SELECT
  nc.native_rows,
  lc.legacy_rows,
  fc.function_rows,
  (nc.native_rows + lc.legacy_rows) AS expected_total,
  ((nc.native_rows + lc.legacy_rows) = fc.function_rows) AS counts_match
FROM native_count nc
CROSS JOIN legacy_count lc
CROSS JOIN function_count fc;

-- 7) Optional search test. Replace the search term with a known RO number, invoice number, or keyword from the customer's history.
SELECT
  h.id,
  h.ro_number,
  h.inv_number,
  h.description,
  h.created_date,
  h."isLankar"
FROM get_customer_work_order_history(
  p_customer_id => '695627c698ddf5629dafe285',
  p_days_back => NULL,
  p_from_date => NULL,
  p_to_date => NULL,
  p_search_term => 'REPLACE_ME'
) h
ORDER BY h.created_date DESC NULLS LAST;