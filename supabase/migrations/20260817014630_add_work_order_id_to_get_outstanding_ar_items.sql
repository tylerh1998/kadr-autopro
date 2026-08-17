-- Adds work_order_id to get_outstanding_ar_items so statement/portal transactions
-- can be traced back to their source Work Order (previously undocumented gap, see
-- master_context.md §2 Customer Portal note).
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
