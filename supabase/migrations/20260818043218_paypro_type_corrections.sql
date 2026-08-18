-- ===========================================================================
-- Phase 1A — PayPRO column type corrections + is_sample cleanup
-- Target: hbcrwkmgsazqrvsrmxyr (PRODUCTION)
--
-- Context: the ten PayPro_* tables are an inert staging snapshot imported
-- 2026-08-17. Base44-hosted PayPRO remains the live system of record and no
-- AutoPRO code reads these tables yet, so this migration affects nothing live.
--
-- All 15 type changes are WIDENINGS - every existing value fits the target
-- type, so no data is lost or rounded.
--
-- Idempotent: each ALTER runs only if the column is still its original type.
-- Safe to re-run. See master_blueprint.md §7 lesson 22.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- PART 1: Type corrections (15 columns)
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  ------------------------------------------------------------------ PayStub --
  -- 1. cpp2_deduction : bigint -> double precision   (R19)
  --    Inferred integer because CPP2 has never fired (0 non-zero rows).
  IF (SELECT data_type FROM information_schema.columns
      WHERE table_schema='public' AND table_name='PayPro_PayStub'
        AND column_name='cpp2_deduction') = 'bigint' THEN
    ALTER TABLE public."PayPro_PayStub"
      ALTER COLUMN cpp2_deduction TYPE double precision
      USING cpp2_deduction::double precision;
  END IF;

  -- 2. ytd_cpp2 : text -> double precision           (R19)
  --    Inferred text because every value is blank. Every other ytd_* column
  --    is already double precision - this one is the odd one out.
  --    THIS is the statement that makes the IF-wrappers mandatory.
  IF (SELECT data_type FROM information_schema.columns
      WHERE table_schema='public' AND table_name='PayPro_PayStub'
        AND column_name='ytd_cpp2') = 'text' THEN
    ALTER TABLE public."PayPro_PayStub"
      ALTER COLUMN ytd_cpp2 TYPE double precision
      USING NULLIF(btrim(ytd_cpp2), '')::double precision;
  END IF;

  --------------------------------------------------------- EmployeeDeduction --
  -- 3. amount : bigint -> numeric                    (R20)
  --    Holds BOTH dollar amounts and percentages (the live Garnishment row
  --    is 30, meaning 30%). A 2.5% or $12.50 deduction is impossible today.
  IF (SELECT data_type FROM information_schema.columns
      WHERE table_schema='public' AND table_name='PayPro_EmployeeDeduction'
        AND column_name='amount') = 'bigint' THEN
    ALTER TABLE public."PayPro_EmployeeDeduction"
      ALTER COLUMN amount TYPE numeric USING amount::numeric;
  END IF;

  -- 4. gl_account : bigint -> text                   (L6)
  --    Every GL-account column storing a *selected* account is text
  --    project-wide. As bigint it hits the documented Radix <Select>
  --    blank-trigger trap. NULL is preserved as NULL.
  IF (SELECT data_type FROM information_schema.columns
      WHERE table_schema='public' AND table_name='PayPro_EmployeeDeduction'
        AND column_name='gl_account') = 'bigint' THEN
    ALTER TABLE public."PayPro_EmployeeDeduction"
      ALTER COLUMN gl_account TYPE text USING gl_account::text;
  END IF;

  ----------------------------------------------------------------- Employee --
  -- 5. federal_td1_basic : bigint -> numeric  (TD1 amounts can carry cents)
  IF (SELECT data_type FROM information_schema.columns
      WHERE table_schema='public' AND table_name='PayPro_Employee'
        AND column_name='federal_td1_basic') = 'bigint' THEN
    ALTER TABLE public."PayPro_Employee"
      ALTER COLUMN federal_td1_basic TYPE numeric USING federal_td1_basic::numeric;
  END IF;

  -- 6. provincial_td1_basic : bigint -> numeric
  IF (SELECT data_type FROM information_schema.columns
      WHERE table_schema='public' AND table_name='PayPro_Employee'
        AND column_name='provincial_td1_basic') = 'bigint' THEN
    ALTER TABLE public."PayPro_Employee"
      ALTER COLUMN provincial_td1_basic TYPE numeric USING provincial_td1_basic::numeric;
  END IF;

  -- 7. advance_balance : bigint -> numeric  (money)
  IF (SELECT data_type FROM information_schema.columns
      WHERE table_schema='public' AND table_name='PayPro_Employee'
        AND column_name='advance_balance') = 'bigint' THEN
    ALTER TABLE public."PayPro_Employee"
      ALTER COLUMN advance_balance TYPE numeric USING advance_balance::numeric;
  END IF;

  --------------------------------------------------------- TaxYearConstant --
  -- 8-13. Six CRA constant columns : bigint -> numeric (can carry cents)
  IF (SELECT data_type FROM information_schema.columns
      WHERE table_schema='public' AND table_name='PayPro_TaxYearConstant'
        AND column_name='ei_max_insurable_earnings') = 'bigint' THEN
    ALTER TABLE public."PayPro_TaxYearConstant"
      ALTER COLUMN ei_max_insurable_earnings TYPE numeric
      USING ei_max_insurable_earnings::numeric;
  END IF;

  IF (SELECT data_type FROM information_schema.columns
      WHERE table_schema='public' AND table_name='PayPro_TaxYearConstant'
        AND column_name='cpp_max_pensionable_earnings') = 'bigint' THEN
    ALTER TABLE public."PayPro_TaxYearConstant"
      ALTER COLUMN cpp_max_pensionable_earnings TYPE numeric
      USING cpp_max_pensionable_earnings::numeric;
  END IF;

  IF (SELECT data_type FROM information_schema.columns
      WHERE table_schema='public' AND table_name='PayPro_TaxYearConstant'
        AND column_name='cpp_basic_exemption') = 'bigint' THEN
    ALTER TABLE public."PayPro_TaxYearConstant"
      ALTER COLUMN cpp_basic_exemption TYPE numeric
      USING cpp_basic_exemption::numeric;
  END IF;

  IF (SELECT data_type FROM information_schema.columns
      WHERE table_schema='public' AND table_name='PayPro_TaxYearConstant'
        AND column_name='federal_basic_personal_amount') = 'bigint' THEN
    ALTER TABLE public."PayPro_TaxYearConstant"
      ALTER COLUMN federal_basic_personal_amount TYPE numeric
      USING federal_basic_personal_amount::numeric;
  END IF;

  IF (SELECT data_type FROM information_schema.columns
      WHERE table_schema='public' AND table_name='PayPro_TaxYearConstant'
        AND column_name='provincial_basic_personal_amount') = 'bigint' THEN
    ALTER TABLE public."PayPro_TaxYearConstant"
      ALTER COLUMN provincial_basic_personal_amount TYPE numeric
      USING provincial_basic_personal_amount::numeric;
  END IF;

  IF (SELECT data_type FROM information_schema.columns
      WHERE table_schema='public' AND table_name='PayPro_TaxYearConstant'
        AND column_name='cpp2_max_pensionable_earnings') = 'bigint' THEN
    ALTER TABLE public."PayPro_TaxYearConstant"
      ALTER COLUMN cpp2_max_pensionable_earnings TYPE numeric
      USING cpp2_max_pensionable_earnings::numeric;
  END IF;

  --------------------------------------------------------------- PayPeriods --
  -- 14-15. Fractional hours (blueprint S4). Flagged in master_context.md §3
  --        as a latent bug "not yet fixed because neither is reachable" -
  --        Phase 4 makes them reachable via LockPeriodModal.
  IF (SELECT data_type FROM information_schema.columns
      WHERE table_schema='public' AND table_name='PayPeriods'
        AND column_name='total_pto_hours') = 'bigint' THEN
    ALTER TABLE public."PayPeriods"
      ALTER COLUMN total_pto_hours TYPE double precision
      USING total_pto_hours::double precision;
  END IF;

  IF (SELECT data_type FROM information_schema.columns
      WHERE table_schema='public' AND table_name='PayPeriods'
        AND column_name='total_stat_hours') = 'bigint' THEN
    ALTER TABLE public."PayPeriods"
      ALTER COLUMN total_stat_hours TYPE double precision
      USING total_stat_hours::double precision;
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- PART 2: Drop the base44 is_sample artifact (Q2) - 10 tables
-- DROP COLUMN IF EXISTS is naturally idempotent.
-- ---------------------------------------------------------------------------
ALTER TABLE public."PayPro_Employee"           DROP COLUMN IF EXISTS is_sample;
ALTER TABLE public."PayPro_PayStub"            DROP COLUMN IF EXISTS is_sample;
ALTER TABLE public."PayPro_Remittance"         DROP COLUMN IF EXISTS is_sample;
ALTER TABLE public."PayPro_EmployeeDeduction"  DROP COLUMN IF EXISTS is_sample;
ALTER TABLE public."PayPro_EmployeePayType"    DROP COLUMN IF EXISTS is_sample;
ALTER TABLE public."PayPro_EmployeeFile"       DROP COLUMN IF EXISTS is_sample;
ALTER TABLE public."PayPro_TrainingRecord"     DROP COLUMN IF EXISTS is_sample;
ALTER TABLE public."PayPro_ValidPayType"       DROP COLUMN IF EXISTS is_sample;
ALTER TABLE public."PayPro_TaxYearConstant"    DROP COLUMN IF EXISTS is_sample;
ALTER TABLE public."PayPro_PayrollSetting"     DROP COLUMN IF EXISTS is_sample;
