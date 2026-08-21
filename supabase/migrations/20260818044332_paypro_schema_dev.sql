-- ===========================================================================
-- Phase 1D — PayPRO schema replication onto dev
-- Target: sitihbdnuxifwibontcm (DEV)
-- Post-1A/1B types from prod (hbcrwkmgsazqrvsrmxyr), post-is_sample-drop.
-- ===========================================================================

CREATE TABLE IF NOT EXISTS public."PayPro_Employee" (
  id text PRIMARY KEY,
  end_date text,
  federal_td1_basic numeric,
  vacation_pay_rate double precision,
  notes text,
  date_of_birth text,
  pay_frequency text,
  is_ei_exempt boolean,
  provincial_td1_basic numeric,
  banked_vacation_pay_balance double precision,
  province text,
  sin text,
  first_name text,
  email text,
  start_date text,
  advance_balance numeric,
  address text,
  town text,
  is_cpp_exempt boolean,
  last_name text,
  employee_type text,
  emerg_contact_phone_num text,
  employee_id text,
  is_vacation_banked boolean,
  phone_number text,
  position text,
  kadr_email text,
  postal_code text,
  emergency_contact text,
  status text,
  created_date timestamptz,
  updated_date timestamptz,
  created_by_id text,
  created_by text,
  employee_db_id text
);

COMMENT ON COLUMN public."PayPro_Employee".employee_db_id IS
  'Stringified public."Employee".id. ADDITIVE ONLY - participates in no PayPRO join. '
  'employee_id remains the join key used by PayPro_PayStub. Nullable by design: '
  'payroll employees with no AutoPRO Employee row (bus drivers, terminated staff) carry null.';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'paypro_employee_employee_id_unique'
  ) THEN
    ALTER TABLE public."PayPro_Employee"
      ADD CONSTRAINT paypro_employee_employee_id_unique UNIQUE (employee_id);
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public."PayPro_EmployeeDeduction" (
  id text PRIMARY KEY,
  employee_id_ref text,
  deduction_name text,
  amount numeric,
  deduction_type text,
  gl_account text,
  is_active boolean,
  created_date timestamptz,
  updated_date timestamptz,
  created_by_id text,
  created_by text
);

CREATE TABLE IF NOT EXISTS public."PayPro_EmployeeFile" (
  id text PRIMARY KEY,
  document_date text,
  file_url text,
  notes text,
  file_name text,
  employee_id text,
  upload_date text,
  created_date timestamptz,
  updated_date timestamptz,
  created_by_id text,
  created_by text
);

CREATE TABLE IF NOT EXISTS public."PayPro_EmployeePayType" (
  id text PRIMARY KEY,
  unit text,
  workpro_type text,
  employee_id_ref text,
  rate double precision,
  pay_type_name text,
  created_date timestamptz,
  updated_date timestamptz,
  created_by_id text,
  created_by text
);

CREATE TABLE IF NOT EXISTS public."PayPro_PayStub" (
  id text PRIMARY KEY,
  paid_via text,
  pay_date text,
  pay_period_start text,
  year bigint,
  ytd_cpp2 double precision,
  provincial_tax double precision,
  gross_pay double precision,
  cpp_deduction double precision,
  net_pay double precision,
  paycheque_number text,
  ytd_federal_tax double precision,
  cpp2_deduction double precision,
  vacation_pay_balance_forward double precision,
  total_deductions double precision,
  is_paid boolean,
  federal_tax double precision,
  vacation_pay_this_period double precision,
  additional_deductions jsonb,
  ytd_gross double precision,
  comments text,
  pay_period_end text,
  ytd_ei double precision,
  ytd_provincial_tax double precision,
  ytd_net double precision,
  employee_id text,
  ei_deduction double precision,
  income_breakdown jsonb,
  is_cancelled boolean,
  ytd_cpp double precision,
  created_date timestamptz,
  updated_date timestamptz,
  created_by_id text,
  created_by text
);

CREATE TABLE IF NOT EXISTS public."PayPro_PayrollSetting" (
  id text PRIMARY KEY,
  key text,
  value text,
  created_date timestamptz,
  updated_date timestamptz,
  created_by_id text,
  created_by text
);

CREATE TABLE IF NOT EXISTS public."PayPro_Remittance" (
  id text PRIMARY KEY,
  period_end text,
  total_gross_pay double precision,
  pay_stub_ids jsonb,
  period_start text,
  total_ei_employer double precision,
  total_cpp_employer double precision,
  total_income_tax double precision,
  total_ei_employee double precision,
  total_remittance double precision,
  total_cpp_employee double precision,
  remittance_date text,
  status text,
  created_date timestamptz,
  updated_date timestamptz,
  created_by_id text,
  created_by text
);

CREATE TABLE IF NOT EXISTS public."PayPro_TaxYearConstant" (
  id text PRIMARY KEY,
  year bigint,
  ei_max_insurable_earnings numeric,
  cpp_max_pensionable_earnings numeric,
  cpp_basic_exemption numeric,
  ei_rate_employee double precision,
  ei_rate_employer_multiplier double precision,
  cpp_rate_employee double precision,
  federal_basic_personal_amount numeric,
  provincial_basic_personal_amount numeric,
  federal_tax_brackets jsonb,
  provincial_tax_brackets_ab jsonb,
  cpp2_max_pensionable_earnings numeric,
  cpp2_rate_employee double precision,
  created_date timestamptz,
  updated_date timestamptz,
  created_by_id text,
  created_by text
);

CREATE TABLE IF NOT EXISTS public."PayPro_TrainingRecord" (
  id text PRIMARY KEY,
  employee_id_ref text,
  course_name text,
  completed_date text,
  expiry_date text,
  created_date timestamptz,
  updated_date timestamptz,
  created_by_id text,
  created_by text
);

CREATE TABLE IF NOT EXISTS public."PayPro_ValidPayType" (
  id text PRIMARY KEY,
  name text,
  workpro_type text,
  created_date timestamptz,
  updated_date timestamptz,
  created_by_id text,
  created_by text
);

-- L4 (explicit, defense-in-depth even though ensure_rls also covers CREATE TABLE on both projects):
ALTER TABLE public."PayPro_Employee"           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."PayPro_EmployeeDeduction"  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."PayPro_EmployeeFile"       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."PayPro_EmployeePayType"    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."PayPro_PayStub"            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."PayPro_PayrollSetting"     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."PayPro_Remittance"         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."PayPro_TaxYearConstant"    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."PayPro_TrainingRecord"     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."PayPro_ValidPayType"       ENABLE ROW LEVEL SECURITY;

-- PayPeriods widening (dev also has bigint here - confirmed via introspection)
DO $$
BEGIN
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
