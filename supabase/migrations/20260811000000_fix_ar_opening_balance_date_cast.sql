-- payment_date/adjustment_date are stored as plain 'YYYY-MM-DD' text (confirmed: 0 rows
-- with a time component). Casting through ::TIMESTAMPTZ AT TIME ZONE 'America/Edmonton'
-- interprets the date as UTC midnight, which shifts it back to the previous calendar day
-- once converted to Mountain time (UTC-6 in August) - an off-by-one bug affecting any
-- transaction near an as-of-date boundary. Plain ::DATE cast removes the spurious shift.
CREATE OR REPLACE FUNCTION public.get_customer_ar_opening_balance(p_customer_id text, p_start_date date)
 RETURNS numeric
 LANGUAGE plpgsql
AS $function$
DECLARE
    v_opening_balance NUMERIC := 0;
BEGIN
    SELECT COALESCE(SUM(calc_owing), 0) INTO v_opening_balance
    FROM (
        SELECT (COALESCE(amount, 0) - COALESCE(ar_paid, 0)) AS calc_owing
        FROM "CustomerPayments"
        WHERE customer_id = p_customer_id
          AND payment_method = 'on_account'
          AND payment_date::DATE < p_start_date

        UNION ALL

        SELECT (COALESCE(amount, 0) - COALESCE(ar_paid, 0)) AS calc_owing
        FROM "CustomerARAdjustment"
        WHERE customer_id = p_customer_id
          AND adjustment_date::DATE < p_start_date
    ) prior_transactions;

    RETURN v_opening_balance;
END;
$function$;
