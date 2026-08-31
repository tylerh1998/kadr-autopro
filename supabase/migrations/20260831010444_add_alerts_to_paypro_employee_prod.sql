-- Production counterpart of 20260818070000_add_alerts_to_paypro_employee.sql.
-- Same content, applied separately to hbcrwkmgsazqrvsrmxyr (production) which assigned
-- its own migration version, distinct from dev's (sitihbdnuxifwibontcm) - see
-- master_context.md's note on the two Supabase projects having independent migration
-- histories. Confirmed missing on production before writing this (audit, 2026-08-31) -
-- the original migration was scoped dev-only pending this follow-up, which never
-- happened until now.
alter table "PayPro_Employee" add column if not exists alerts text;
