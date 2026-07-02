CREATE OR REPLACE FUNCTION public.get_pl_report_data(start_date DATE, end_date DATE)
RETURNS TABLE (
    account_number TEXT,
    account_name TEXT,
    account_type TEXT,
    parent_account TEXT,
    total_debits NUMERIC,
    total_credits NUMERIC,
    transaction_count BIGINT
)
LANGUAGE plpgsql
AS $$
BEGIN
    RETURN QUERY
    SELECT
        coa.account_number::text AS account_number,
        coa.account_name::text AS account_name,
        coa.account_type::text AS account_type,
        coa.parent_account::text AS parent_account,
        COALESCE(SUM(gl.debit_amount), 0)::NUMERIC AS total_debits,
        COALESCE(SUM(gl.credit_amount), 0)::NUMERIC AS total_credits,
        COUNT(gl.id)::BIGINT AS transaction_count
    FROM "ChartOfAccount" coa
    LEFT JOIN "GLTransaction" gl
        ON coa.account_number::text = gl.account_number::text
        AND gl.transaction_date >= start_date
        AND gl.transaction_date <= end_date
    WHERE coa.account_type IN ('Revenue', 'Expense')
    GROUP BY coa.account_number, coa.account_name, coa.account_type, coa.parent_account;
END;
$$;