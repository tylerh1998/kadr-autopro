-- process_payment_atomic: only insert a BankTransaction when the payload actually
-- carries a bank_account_id.
--
-- Background: autopro-executeSupplierPayment calls this RPC for BOTH bank/cheque
-- payments (payload has bank_account_id) and Line-of-Credit payments (payload has
-- line_of_credit_id and NO bank_account_id). The original body inserted a
-- BankTransaction unconditionally, so every LOC supplier payment produced a junk
-- zero-dollar BankTransaction with bank_account_id = NULL and
-- source_type = 'supplier_payment'. Those rows are never cleaned up on cancel and
-- pollute BankTransaction / any source_type = 'supplier_payment' aggregate.
--
-- This is a straight CREATE OR REPLACE of the live definition with step 3 guarded.
-- The RPC was previously created out-of-band (no tracked migration); this file also
-- brings it under version control.

CREATE OR REPLACE FUNCTION public.process_payment_atomic(
    p_payment_id text,
    p_gl_entries jsonb,
    p_bank_tx jsonb
)
RETURNS void
LANGUAGE plpgsql
AS $function$
DECLARE
    v_payment_date DATE;
BEGIN
    -- 1. Fetch the validated date directly from the SupplierPayment record
    SELECT (payment_date::date) INTO v_payment_date
    FROM public."SupplierPayment"
    WHERE id = p_payment_id;

    -- 2. Insert GL Transactions using the anchored payment_date
    INSERT INTO public."GLTransaction" (
        id, account_number, transaction_date, description, reference,
        debit_amount, credit_amount, source_type, source_id
    )
    SELECT
        gen_random_uuid()::text,
        (entry->>'account_number')::text,
        v_payment_date,
        (entry->>'description')::text,
        (entry->>'reference')::text,
        COALESCE((entry->>'debit')::numeric, 0),
        COALESCE((entry->>'credit')::numeric, 0),
        (entry->>'source_type')::text,
        p_payment_id
    FROM jsonb_array_elements(p_gl_entries) AS entry;

    -- 3. Insert Bank Transaction using the anchored payment_date --
    --    ONLY when a real bank_account_id is present (bank/cheque payments).
    --    Line-of-Credit payments pass line_of_credit_id instead and must NOT
    --    create a BankTransaction here.
    IF NULLIF(p_bank_tx->>'bank_account_id', '') IS NOT NULL THEN
        INSERT INTO public."BankTransaction" (
            id, bank_account_id, transaction_date, description,
            credit_amount, debit_amount, source_type, source_id
        )
        VALUES (
            gen_random_uuid()::text,
            (p_bank_tx->>'bank_account_id')::text,
            v_payment_date::text,
            (p_bank_tx->>'description')::text,
            COALESCE((p_bank_tx->>'credit')::double precision, 0),
            COALESCE((p_bank_tx->>'debit')::double precision, 0),
            (p_bank_tx->>'source_type')::text,
            p_payment_id
        );
    END IF;

    -- 4. Finalize status
    UPDATE public."SupplierPayment"
    SET status = 'completed', updated_date = now()
    WHERE id = p_payment_id;
END;
$function$;
