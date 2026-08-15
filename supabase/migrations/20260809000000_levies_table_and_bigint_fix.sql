-- Phase 10E: Levies domain
-- 1. Dev: widen Levies.total_amount/base_amount from bigint to double precision
--    (same shape of bug 10D found/fixed in CashFlowSummary — preemptive fix, no fractional
--    levy values have been written yet but OtherChargeList has fractional base_amount rows
--    that could plausibly become reportable in the future).
-- 2. Production: Levies did not exist at all — fresh CREATE TABLE with the corrected types
--    baked in, plus the standard "Enable all operations for all users" RLS policy.

-- Dev branch (table already exists, 153 real rows):
ALTER TABLE "Levies" ALTER COLUMN total_amount TYPE double precision;
ALTER TABLE "Levies" ALTER COLUMN base_amount TYPE double precision;

-- Production (table did not exist at all — fresh create, run only there):
-- CREATE TABLE "Levies" (
--   id text PRIMARY KEY,
--   line_item_id text,
--   work_order_id text,
--   other_charge_id text,
--   supplier_invoice_line_id text,
--   total_amount double precision,
--   base_amount double precision,
--   qty bigint,
--   date_applied timestamptz,
--   created_date timestamptz,
--   updated_date timestamptz,
--   created_by text,
--   created_by_id text,
--   is_sample boolean
-- );
-- ALTER TABLE "Levies" ENABLE ROW LEVEL SECURITY;
-- CREATE POLICY "Enable all operations for all users" ON "Levies" FOR ALL TO public USING (true) WITH CHECK (true);

-- Production OtherChargeList was replayed as an empty schema in 10A but never seeded with
-- data — seeded here with dev's real 42 rows (fetched live at execution time, not reused
-- from earlier research), same "seed before deploy" lesson as 10C's SystemSettings gap.
