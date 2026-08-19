-- Company Settings tab (Setup > General > Company Settings): single source of truth
-- for employer identity + tax IDs, replacing the hardcoded values in
-- src/components/paypro/t4/companyInfo.js over time. Purely additive/nullable -
-- existing SystemSettings row and all current readers are unaffected.

ALTER TABLE "SystemSettings"
  ADD COLUMN IF NOT EXISTS company_name text,
  ADD COLUMN IF NOT EXISTS company_address text,
  ADD COLUMN IF NOT EXISTS company_town text,
  ADD COLUMN IF NOT EXISTS company_province text,
  ADD COLUMN IF NOT EXISTS company_postal_code text,
  ADD COLUMN IF NOT EXISTS company_country text,
  ADD COLUMN IF NOT EXISTS company_phone text,
  ADD COLUMN IF NOT EXISTS company_email text,
  ADD COLUMN IF NOT EXISTS payroll_account_number text,
  ADD COLUMN IF NOT EXISTS gst_business_number text;
