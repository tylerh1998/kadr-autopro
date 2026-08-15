-- Phase 10A: production replay of SystemSettings, CashFlowSummary, OtherChargeList, GSTReturn
-- All 4 tables already exist on dev (sitihbdnuxifwibontcm) with real data; this is a genuinely
-- fresh CREATE TABLE on production. Schema matches dev exactly (information_schema.columns, 2026-08-03).

CREATE TABLE IF NOT EXISTS "SystemSettings" (
  id text PRIMARY KEY,
  shop_supplies_gl_account bigint,
  shop_supply_rate bigint,
  next_inv_number bigint,
  default_taxable boolean,
  tax_rate double precision,
  default_message text,
  gst_paid_account_number bigint,
  next_ro_number bigint,
  gst_payable_receivable_account_number bigint,
  kanban_view_1 jsonb,
  wip_legal text,
  training_enviro boolean,
  gst_collected_account_number bigint,
  created_date timestamp with time zone,
  updated_date timestamp with time zone,
  created_by_id text,
  created_by text,
  is_sample boolean
);

CREATE TABLE IF NOT EXISTS "CashFlowSummary" (
  id text PRIMARY KEY,
  pad_registries_total bigint,
  est_first_payroll bigint,
  est_payroll_remit bigint,
  last_updated timestamp with time zone,
  etransfer_daily bigint,
  expected_deposits bigint,
  payroll_remit bigint,
  etransfer_weekly bigint,
  upcoming_payroll bigint,
  current_bank_balance double precision,
  fiscal_cushion bigint,
  etransfer_monthly bigint,
  pad_registries_details jsonb,
  month_end timestamp with time zone,
  etransfer_per_tx bigint,
  est_second_payroll bigint,
  gst_remit double precision,
  overhead_items jsonb,
  created_date timestamp with time zone,
  updated_date timestamp with time zone,
  created_by_id text,
  created_by text,
  is_sample boolean
);

CREATE TABLE IF NOT EXISTS "OtherChargeList" (
  id text PRIMARY KEY,
  linked_supplier_id text,
  apply_cost boolean,
  is_active boolean,
  description text,
  base_amount double precision,
  reportable_levy boolean,
  gl_account bigint,
  is_taxable boolean,
  levy boolean,
  created_date timestamp with time zone,
  updated_date timestamp with time zone,
  created_by_id text,
  created_by text,
  is_sample boolean
);

CREATE TABLE IF NOT EXISTS "GSTReturn" (
  id text PRIMARY KEY,
  period_start_date text,
  period_end_date text,
  total_sales double precision,
  total_purchases double precision,
  gst_collected double precision,
  gst_paid double precision,
  net_gst_due double precision,
  status text,
  posted_date text,
  posted_by text,
  paid_date text,
  paid_by text,
  bank_account_id text,
  created_date timestamp with time zone,
  updated_date timestamp with time zone,
  created_by_id text,
  created_by text,
  is_sample boolean
);

ALTER TABLE "SystemSettings" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Enable all operations for all users" ON "SystemSettings"
  FOR ALL TO public USING (true) WITH CHECK (true);

ALTER TABLE "CashFlowSummary" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Enable all operations for all users" ON "CashFlowSummary"
  FOR ALL TO public USING (true) WITH CHECK (true);

ALTER TABLE "OtherChargeList" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Enable all operations for all users" ON "OtherChargeList"
  FOR ALL TO public USING (true) WITH CHECK (true);

ALTER TABLE "GSTReturn" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Enable all operations for all users" ON "GSTReturn"
  FOR ALL TO public USING (true) WITH CHECK (true);
