CREATE OR REPLACE FUNCTION public.get_customer_ar_summary(
  p_as_of_date date,
  p_search_term text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
AS $function$
DECLARE
  v_result jsonb;
  v_search text := NULLIF(TRIM(p_search_term), '');
BEGIN
  SELECT COALESCE(jsonb_agg(to_jsonb(c) ORDER BY c.sort_name), '[]'::jsonb) INTO v_result
  FROM (
    SELECT
      cust.id,
      cust.first_name,
      cust.last_name,
      cust.org_name,
      cust.phone,
      cust.email,
      lower(COALESCE(NULLIF(cust.org_name, ''), cust.first_name || ' ' || cust.last_name)) AS sort_name,
      SUM(age.owing) AS total_balance,
      CASE WHEN SUM(age.owing) < -0.01 THEN SUM(age.owing)
           ELSE SUM(CASE WHEN age.days_old <= 30 THEN age.owing ELSE 0 END)
      END AS balance_0_30,
      CASE WHEN SUM(age.owing) < -0.01 THEN 0
           ELSE SUM(CASE WHEN age.days_old BETWEEN 31 AND 60 THEN age.owing ELSE 0 END)
      END AS balance_31_60,
      CASE WHEN SUM(age.owing) < -0.01 THEN 0
           ELSE SUM(CASE WHEN age.days_old > 60 THEN age.owing ELSE 0 END)
      END AS balance_60_plus
    FROM "Customer" cust
    JOIN LATERAL (
      SELECT (p_as_of_date - COALESCE(cp.payment_date::date, p_as_of_date)) AS days_old,
             (COALESCE(cp.amount, 0) - COALESCE(cp.ar_paid, 0)) AS owing
      FROM "CustomerPayments" cp
      WHERE cp.customer_id = cust.id
        AND cp.payment_method = 'on_account'
        AND (cp.payment_date IS NULL OR cp.payment_date::date <= p_as_of_date)

      UNION ALL

      SELECT (p_as_of_date - COALESCE(ca.adjustment_date::date, p_as_of_date)),
             (COALESCE(ca.amount, 0) - COALESCE(ca.ar_paid, 0))
      FROM "CustomerARAdjustment" ca
      WHERE ca.customer_id = cust.id
        AND (ca.adjustment_date IS NULL OR ca.adjustment_date::date <= p_as_of_date)
    ) age ON true
    WHERE
      v_search IS NULL
      OR cust.first_name ILIKE '%' || v_search || '%'
      OR cust.last_name  ILIKE '%' || v_search || '%'
      OR cust.org_name   ILIKE '%' || v_search || '%'
      OR cust.phone      ILIKE '%' || v_search || '%'
      OR cust.email      ILIKE '%' || v_search || '%'
    GROUP BY cust.id, cust.first_name, cust.last_name, cust.org_name, cust.phone, cust.email
    HAVING ABS(SUM(age.owing)) > 0.01
  ) c;

  RETURN v_result;
END;
$function$;
