CREATE OR REPLACE FUNCTION generate_autopro_audit_report(start_date DATE, end_date DATE)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  stage1_imbalances json;
  stage2_anomalies json;
  stage3_discrepancies json;
  stage4_negatives json;
  stage4_orphans json;
  stage5_ar json;
  stage6_gst_collected json;
  stage7_inventory json;
  stage8_bank json;
  
  total_inventory_value numeric;
  gl_inventory_value numeric;
BEGIN
  -- Create temporary table
  CREATE TEMP TABLE IF NOT EXISTS CleanedGL ON COMMIT DROP AS
  SELECT 
    account_number,
    debit_amount,
    credit_amount,
    transaction_date,
    created_date,
    reference,
    description,
    TRIM(REVERSE(SPLIT_PART(REVERSE(REGEXP_REPLACE(reference, '^(Adjustment GST:|Adjustment:|Credit:|REVERSAL:)\s*', '', 'i')), ' - ', 1))) AS base_ref
  FROM "GLTransaction"
  WHERE transaction_date >= (start_date - INTERVAL '60 days') AND transaction_date <= end_date;

  -- Stage 1: Structural Balance Audit
  SELECT json_agg(row_to_json(t)) INTO stage1_imbalances
  FROM (
    SELECT base_ref, MAX(transaction_date) AS last_date, STRING_AGG(DISTINCT account_number, ', ') AS accounts,
           ROUND(SUM(COALESCE(debit_amount::numeric, 0)), 2) AS total_debit, ROUND(SUM(COALESCE(credit_amount::numeric, 0)), 2) AS total_credit
    FROM CleanedGL WHERE transaction_date >= start_date AND transaction_date <= end_date
    GROUP BY base_ref HAVING ABS(ROUND(SUM(COALESCE(debit_amount::numeric, 0)), 2) - ROUND(SUM(COALESCE(credit_amount::numeric, 0)), 2)) > 0.001
  ) t;

  -- Stage 2: Inventory Adjustments Audit (Accounts 5003, 5004)
  SELECT json_agg(row_to_json(t)) INTO stage2_anomalies
  FROM (
    SELECT transaction_date AS date, reference, account_number, debit_amount, credit_amount, description,
           (COALESCE(debit_amount, 0) + COALESCE(credit_amount, 0)) AS abs_impact
    FROM CleanedGL WHERE account_number IN ('5003', '5004') AND transaction_date >= start_date AND transaction_date <= end_date
    ORDER BY abs_impact DESC LIMIT 10
  ) t;

  -- Stage 3: Supplier Invoices (AP/GST Paid)
  WITH SIL_Agg AS (
    SELECT invoice_number, MAX(invoice_date::DATE) AS last_date, SUM(COALESCE(purchase_amount, 0)) AS exp_purchase, SUM(COALESCE(gst_amount, 0)) AS exp_gst
    FROM "SupplierInvoiceLine"
    WHERE invoice_date::DATE >= (start_date - INTERVAL '60 days') AND invoice_date::DATE <= end_date AND invoice_number NOT LIKE 'MV%'
    GROUP BY invoice_number
  ),
  GL_AP AS (
    SELECT base_ref, MAX(transaction_date) AS last_date, SUM(COALESCE(credit_amount, 0) - COALESCE(debit_amount, 0)) AS net_ap
    FROM CleanedGL WHERE account_number = '2000' GROUP BY base_ref
  ),
  GL_GST AS (
    SELECT base_ref, MAX(transaction_date) AS last_date, SUM(COALESCE(debit_amount, 0) - COALESCE(credit_amount, 0)) AS net_gst
    FROM CleanedGL WHERE account_number = '2003' AND base_ref NOT LIKE 'GST-%' GROUP BY base_ref
  )
  SELECT json_agg(row_to_json(t)) INTO stage3_discrepancies
  FROM (
    SELECT COALESCE(s.invoice_number, a.base_ref, g.base_ref) AS target_ref, COALESCE(s.last_date, a.last_date, g.last_date) AS activity_date,
      ROUND((COALESCE(s.exp_purchase, 0) + COALESCE(s.exp_gst, 0))::numeric, 2) AS expected_ap, ROUND(COALESCE(a.net_ap, 0)::numeric, 2) AS ledger_net_ap,
      ROUND(COALESCE(s.exp_gst, 0)::numeric, 2) AS expected_gst, ROUND(COALESCE(g.net_gst, 0)::numeric, 2) AS ledger_net_gst
    FROM SIL_Agg s FULL OUTER JOIN GL_AP a ON s.invoice_number = a.base_ref FULL OUTER JOIN GL_GST g ON s.invoice_number = g.base_ref
    WHERE ABS(ROUND((COALESCE(s.exp_purchase, 0) + COALESCE(s.exp_gst, 0))::numeric, 2) - ROUND(COALESCE(a.net_ap, 0)::numeric, 2)) > 0.001
       OR ABS(ROUND(COALESCE(s.exp_gst, 0)::numeric, 2) - ROUND(COALESCE(g.net_gst, 0)::numeric, 2)) > 0.001
  ) t;

  -- Stage 4: Oddities
  SELECT json_agg(row_to_json(t)) INTO stage4_negatives FROM (SELECT transaction_date AS date, reference, account_number, debit_amount, credit_amount FROM CleanedGL WHERE (debit_amount < 0 OR credit_amount < 0) AND transaction_date >= start_date AND transaction_date <= end_date) t;
  SELECT json_agg(row_to_json(t)) INTO stage4_orphans FROM (SELECT transaction_date AS date, reference, account_number, debit_amount, credit_amount, description FROM CleanedGL WHERE (reference IS NULL OR reference = '') AND transaction_date >= start_date AND transaction_date <= end_date AND account_number NOT IN ('1001', '1002', '1100', '2006', '3001', '4010')) t;

  -- Stage 5: Accounts Receivable (Account 1100) vs Sub-Ledger
  -- AR is defined as on_account payments (debt) minus ar_paid, plus manual AR adjustments.
  DECLARE
    ar_cp numeric;
    ar_adj numeric;
    total_sub_ar numeric;
    total_gl_ar numeric;
  BEGIN
    SELECT SUM(COALESCE(amount, 0) - COALESCE(ar_paid, 0)) INTO ar_cp
    FROM "CustomerPayments" WHERE payment_method = 'on_account';
    
    SELECT SUM(COALESCE(amount, 0) - COALESCE(ar_paid, 0)) INTO ar_adj
    FROM "CustomerARAdjustment";
    
    total_sub_ar := COALESCE(ar_cp, 0) + COALESCE(ar_adj, 0);
    
    SELECT SUM(COALESCE(debit_amount, 0) - COALESCE(credit_amount, 0)) INTO total_gl_ar
    FROM "GLTransaction" WHERE account_number = '1100';
    
    stage5_ar := json_build_object(
      'sub_ledger_ar', ROUND(total_sub_ar, 2),
      'gl_ar', ROUND(total_gl_ar, 2),
      'discrepancy', ROUND(total_sub_ar - total_gl_ar, 2)
    );
  END;

  DROP TABLE IF EXISTS CleanedGL;

  RETURN json_build_object(
    'stage1_imbalances', COALESCE(stage1_imbalances, '[]'::json),
    'stage2_anomalies', COALESCE(stage2_anomalies, '[]'::json),
    'stage3_discrepancies', COALESCE(stage3_discrepancies, '[]'::json),
    'stage4_negatives', COALESCE(stage4_negatives, '[]'::json),
    'stage4_orphans', COALESCE(stage4_orphans, '[]'::json),
    'stage5_ar', COALESCE(stage5_ar, '{}'::json)
  );
END;
$$;
