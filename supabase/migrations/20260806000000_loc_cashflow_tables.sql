CREATE TABLE IF NOT EXISTS "LinesOfCredit" (
  id text PRIMARY KEY,
  name text NOT NULL,
  institution_name text NOT NULL,
  account_number text,
  credit_limit bigint NOT NULL,
  current_balance double precision DEFAULT 0,
  available_credit double precision DEFAULT 0,
  interest_rate double precision DEFAULT 0,
  gl_account bigint,
  is_active boolean DEFAULT true,
  notes text,
  last_recalculated_date timestamp with time zone,
  locked_by_user text,
  locked_timestamp text,
  created_date timestamp with time zone,
  updated_date timestamp with time zone,
  created_by text,
  created_by_id text,
  is_sample boolean
);

CREATE TABLE IF NOT EXISTS "LinesOfCreditTransaction" (
  id text PRIMARY KEY,
  line_of_credit_id text NOT NULL REFERENCES "LinesOfCredit"(id) ON UPDATE CASCADE ON DELETE RESTRICT,
  transaction_date text NOT NULL,
  description text NOT NULL,
  reference text,
  charge_amount double precision DEFAULT 0,
  credit_amount double precision DEFAULT 0,
  payment_amount double precision DEFAULT 0,
  balance text,
  source_type text,
  source_id text,
  payment_applied_data text,
  is_reversed boolean DEFAULT false,
  reversed_by_id text,
  created_date timestamp with time zone,
  updated_date timestamp with time zone,
  created_by text,
  created_by_id text,
  is_sample boolean
);

CREATE TABLE IF NOT EXISTS "CashFlowEntry" (
  id text PRIMARY KEY,
  supplier_id text,
  loc_id text,
  supplier text,
  amount double precision,
  amount_paid double precision DEFAULT 0,
  due_date text,
  date_paid text,
  chq_number text,
  method text,
  comment text,
  bg_colour text,
  row_status text,
  sort_order bigint DEFAULT 0,
  created_date timestamp with time zone,
  updated_date timestamp with time zone,
  created_by text,
  created_by_id text,
  is_sample boolean
);

ALTER TABLE "LinesOfCredit" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Enable all operations for all users" ON "LinesOfCredit";
CREATE POLICY "Enable all operations for all users" ON "LinesOfCredit"
  FOR ALL TO public USING (true) WITH CHECK (true);

ALTER TABLE "LinesOfCreditTransaction" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Enable all operations for all users" ON "LinesOfCreditTransaction";
CREATE POLICY "Enable all operations for all users" ON "LinesOfCreditTransaction"
  FOR ALL TO public USING (true) WITH CHECK (true);

ALTER TABLE "CashFlowEntry" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Enable all operations for all users" ON "CashFlowEntry";
CREATE POLICY "Enable all operations for all users" ON "CashFlowEntry"
  FOR ALL TO public USING (true) WITH CHECK (true);
