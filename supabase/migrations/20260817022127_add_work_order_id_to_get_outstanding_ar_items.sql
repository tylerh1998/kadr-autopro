-- Production counterpart of 20260817014630_add_work_order_id_to_get_outstanding_ar_items.sql.
-- Same content, applied separately to hbcrwkmgsazqrvsrmxyr (production) which assigned
-- its own migration version, distinct from dev's (sitihbdnuxifwibontcm) — see
-- master_context.md's note on the two Supabase projects having independent migration
-- histories that can diverge even for the same logical change.
DROP FUNCTION IF EXISTS public.get_outstanding_ar_items(text);

CREATE FUNCTION public.get_outstanding_ar_items(customer_id_val text)
 RETURNS TABLE(id text, type text, reference text, date date, amount numeric, ar_paid numeric, balance numeric, description text, age_days integer, work_order_id text)
 LANGUAGE plpgsql
AS $function$
BEGIN
    RETURN QUERY
    SELECT
        cp.id::text,
        'invoice'::TEXT as type,
        COALESCE(wo.inv_number, cp.invoice_number, '') as reference,
        cp.payment_date::DATE as date,
        COALESCE(cp.amount, 0)::NUMERIC as amount,
        COALESCE(cp.ar_paid, 0)::NUMERIC as ar_paid,
        (COALESCE(cp.amount, 0) - COALESCE(cp.ar_paid, 0))::NUMERIC as balance,
        COALESCE(wo.description, cp.notes, 'AR Transaction')::TEXT as description,
        ((CURRENT_TIMESTAMP AT TIME ZONE 'America/Edmonton')::DATE - cp.payment_date::DATE)::INTEGER as age_days,
        cp.work_order_id::TEXT as work_order_id
    FROM "CustomerPayments" cp
    LEFT JOIN "WorkOrder" wo ON cp.work_order_id = wo.id
    WHERE cp.customer_id = customer_id_val
      AND cp.payment_method = 'on_account'
      AND (COALESCE(cp.amount, 0) - COALESCE(cp.ar_paid, 0)) > 0.01

    UNION ALL

    SELECT
        ca.id::text,
        'adjustment'::TEXT as type,
        COALESCE(ca.reference, ca.description, '') as reference,
        ca.adjustment_date::DATE as date,
        COALESCE(ca.amount, 0)::NUMERIC as amount,
        COALESCE(ca.ar_paid, 0)::NUMERIC as ar_paid,
        (COALESCE(ca.amount, 0) - COALESCE(ca.ar_paid, 0))::NUMERIC as balance,
        COALESCE(ca.description, 'Adjustment')::TEXT as description,
        ((CURRENT_TIMESTAMP AT TIME ZONE 'America/Edmonton')::DATE - ca.adjustment_date::DATE)::INTEGER as age_days,
        NULL::TEXT as work_order_id
    FROM "CustomerARAdjustment" ca
    WHERE ca.customer_id = customer_id_val
      AND ABS(COALESCE(ca.amount, 0) - COALESCE(ca.ar_paid, 0)) > 0.01;
END;
$function$
