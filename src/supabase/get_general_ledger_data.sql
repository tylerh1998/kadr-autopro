CREATE OR REPLACE FUNCTION public.get_general_ledger_data(start_date DATE, end_date DATE)
RETURNS TABLE (
    account_number TEXT,
    account_name TEXT,
    account_type TEXT,
    parent_account TEXT,
    is_active BOOLEAN,
    controlled BOOLEAN,
    description TEXT,
    own_balance NUMERIC,
    "transactionCount" BIGINT
)
LANGUAGE plpgsql
AS $$
BEGIN
    RETURN QUERY
    SELECT
        coa.account_number::text,
        coa.account_name::text,
        coa.account_type::text,
        coa.parent_account::text,
        coa.is_active,
        coa.controlled,
        coa.description::text,
        COALESCE(SUM(
            CASE 
                WHEN coa.account_type IN ('Asset', 'Expense') THEN (gl.debit_amount - gl.credit_amount)
                ELSE (gl.credit_amount - gl.debit_amount)
            END
        ), 0)::NUMERIC AS own_balance,
        COUNT(CASE WHEN gl.transaction_date >= start_date THEN 1 END)::BIGINT AS "transactionCount"
    FROM "ChartOfAccount" coa
    LEFT JOIN "GLTransaction" gl
        ON coa.account_number::text = gl.account_number::text
        AND gl.transaction_date <= end_date
    WHERE coa.is_active = true
    GROUP BY coa.account_number, coa.account_name, coa.account_type, coa.parent_account, coa.is_active, coa.controlled, coa.description;
END;
$$;
