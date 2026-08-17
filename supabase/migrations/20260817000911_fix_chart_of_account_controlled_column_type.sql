-- ChartOfAccount.controlled was a stringy-boolean text column (values seen:
-- null, 'true', 'false') -- the exact recurring trap master_context.md already
-- documents for Customer.is_active/Vehicle.is_active, and a real risk here
-- specifically because every consuming component (AccountForm.jsx and others)
-- already treats it as a genuine JS boolean with no defensive .or()/string
-- check, unlike the is_active call sites. Widened to a real boolean column.
-- Postgres casts 'true'/'false' text directly to boolean natively; no CASE
-- needed given the clean value set confirmed live before this ran.
--
-- Applied to hbcrwkmgsazqrvsrmxyr (production) only as of this writing --
-- sitihbdnuxifwibontcm (dev) still has this column as text. Confirmed via
-- direct schema comparison while backfilling this migration file's own
-- tracking gap (2026-08-17) -- flagging in master_context.md rather than
-- fixing dev here, since that wasn't part of what this migration did on
-- production and shouldn't be silently bundled into its backfill.
alter table "ChartOfAccount"
  alter column controlled type boolean using (controlled::boolean);
