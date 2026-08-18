-- Widen TimeRecord.pto_hours/stat_hours from bigint to double precision.
-- Phase 4 (Time Records) Q2: AddTimeRecordModal/EditTimeRecordModal use
-- <Input type="number" step="0.25"> for these fields, but bigint rejects any
-- fractional write with Postgres 22P02, often with no visible error surfaced
-- (master_context.md §4). Mirrors Phase 1's identical treatment of
-- PayPeriods.total_pto_hours/total_stat_hours one level up in the same
-- feature's own summary table.
--
-- Confirmed on dev (sitihbdnuxifwibontcm) before applying: 21 PayPeriods rows
-- and 1,609 TimeRecord rows, all currently whole-number/null pto_hours/
-- stat_hours - no data-loss risk in widening. Dev only, per this phase's
-- dev-first sequencing (Plans and Context/phase_4_implementation_plan.md §3.1).

alter table "TimeRecord" alter column pto_hours type double precision using pto_hours::double precision;
alter table "TimeRecord" alter column stat_hours type double precision using stat_hours::double precision;
