CREATE TABLE IF NOT EXISTS "CashDrawerAdjustment" (
  id text PRIMARY KEY,
  adjustment_date text,
  amount double precision,
  type text,
  payment_method text,
  description text,
  reference text,
  gl_transactions jsonb,
  status text,
  deposited boolean,
  deposit_date text,
  deposit_batch_id text,
  created_date timestamp with time zone,
  updated_date timestamp with time zone,
  created_by text,
  created_by_id text,
  is_sample boolean
);

CREATE TABLE IF NOT EXISTS "DepositSlipBreakdown" (
  id text PRIMARY KEY,
  deposit_batch_id text,
  bank_transaction_id text,
  deposit_date text,
  bills_5 bigint,
  bills_10 bigint,
  bills_20 bigint,
  bills_50 bigint,
  bills_100 bigint,
  coins_5 bigint,
  coins_10 bigint,
  coins_25 bigint,
  coins_100 bigint,
  coins_200 bigint,
  rolled_coin bigint,
  total_cash double precision,
  total_cheques double precision,
  deposit_amount double precision,
  cheques_data jsonb,
  bank_account_number bigint,
  bank_account_name text,
  created_date timestamp with time zone,
  updated_date timestamp with time zone,
  created_by text,
  created_by_id text,
  is_sample boolean
);

ALTER TABLE "CashDrawerAdjustment" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Enable all operations for all users" ON "CashDrawerAdjustment";
CREATE POLICY "Enable all operations for all users" ON "CashDrawerAdjustment"
  FOR ALL TO public USING (true) WITH CHECK (true);

ALTER TABLE "DepositSlipBreakdown" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Enable all operations for all users" ON "DepositSlipBreakdown";
CREATE POLICY "Enable all operations for all users" ON "DepositSlipBreakdown"
  FOR ALL TO public USING (true) WITH CHECK (true);
