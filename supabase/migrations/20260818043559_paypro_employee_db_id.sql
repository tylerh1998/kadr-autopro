-- Phase 1B — additive Employee linkage + protect the paystub join key

ALTER TABLE public."PayPro_Employee"
  ADD COLUMN IF NOT EXISTS employee_db_id text;

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

UPDATE public."PayPro_Employee" p
SET employee_db_id = v.db_id
FROM (VALUES
  ('EMP001', '9999999'),      -- Ryley Bates
  ('EMP002', '888888888'),    -- Elisa Haney
  ('EMP003', '99999999999'),  -- Tyler Haney
  ('EMP005', '555555555'),    -- Glenda Millhouse
  ('EMP008', '111111111'),    -- Annika Gelech
  ('EMP009', '77777777777'),  -- Marshall Johnston
  ('EMP011', '222222222')     -- Marley Jacobs
) AS v(emp_id, db_id)
WHERE p.employee_id = v.emp_id;
-- EMP004 Cheryl Lawrence (Bus Driver, active) -> null, no Employee row
-- EMP006 Cruise Bensmiller (inactive)         -> null
-- EMP007 Samantha Eyben   (inactive)          -> null
-- EMP010 Anne Fehr        (active)            -> null
