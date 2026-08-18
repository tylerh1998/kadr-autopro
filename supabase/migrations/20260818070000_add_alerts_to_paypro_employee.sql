-- Phase 3C / decision D1 -- PayPRO's OtherTab.jsx reads/writes Employee.alerts (a
-- rich-text field rendered as a purple alert box when processing a paycheque). It
-- was a real, declared field in base44's Employee entity but never part of the CSV
-- import (sparse/empty data at export time hiding it, same failure mode as the 15
-- mis-typed columns Phase 1 found). Dev only; production counterpart applied
-- separately once dev is verified, per master_context.md's migration-versioning rule.
alter table "PayPro_Employee" add column if not exists alerts text;
