-- Phase 1C — 30 RLS policies (3 per table x 10 PayPro_* tables)
--
-- Deviation from phase_1_implementation_plan.md: the plan's DROP POLICY
-- statements used %L for the policy name (a string literal), which is
-- invalid syntax for DROP POLICY (it needs an identifier). Fixed to %I here.
-- ENABLE ROW LEVEL SECURITY is included even though prod already has it via
-- the ensure_rls trigger - idempotent, and makes this migration also correct
-- on dev where that trigger does not exist (L4).
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'PayPro_Employee','PayPro_PayStub','PayPro_Remittance',
    'PayPro_EmployeeDeduction','PayPro_EmployeePayType','PayPro_EmployeeFile',
    'PayPro_TrainingRecord','PayPro_ValidPayType','PayPro_TaxYearConstant',
    'PayPro_PayrollSetting'
  ] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);

    -- base permissive grant
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I',
                   'Enable all operations for all users', t);
    EXECUTE format($f$CREATE POLICY "Enable all operations for all users"
      ON public.%I FOR ALL TO authenticated USING (true) WITH CHECK (true)$f$, t);

    -- restrictive gate 1: AAL2 / passkey
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'Requires strong auth', t);
    EXECUTE format($f$CREATE POLICY "Requires strong auth"
      ON public.%I AS RESTRICTIVE FOR ALL TO authenticated
      USING (public.staff_strong_auth()) WITH CHECK (public.staff_strong_auth())$f$, t);

    -- restrictive gate 2: paypro_user  (NEW for this module)
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'Requires paypro access', t);
    EXECUTE format($f$CREATE POLICY "Requires paypro access"
      ON public.%I AS RESTRICTIVE FOR ALL TO authenticated
      USING (public.is_paypro_user()) WITH CHECK (public.is_paypro_user())$f$, t);
  END LOOP;
END $$;
