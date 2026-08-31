-- Production counterpart of 20260818060000_widen_timerecord_pto_stat_hours.sql.
-- Same content, applied separately to hbcrwkmgsazqrvsrmxyr (production) which assigned
-- its own migration version, distinct from dev's (sitihbdnuxifwibontcm) - see
-- master_context.md's note on the two Supabase projects having independent migration
-- histories. Confirmed still bigint on production before writing this (audit,
-- 2026-08-31) - the original migration was scoped dev-only pending this follow-up,
-- which never happened until now.
alter table "TimeRecord" alter column pto_hours type double precision using pto_hours::double precision;
alter table "TimeRecord" alter column stat_hours type double precision using stat_hours::double precision;
