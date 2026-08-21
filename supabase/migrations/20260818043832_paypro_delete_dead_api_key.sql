-- Phase 1C (Q3) — remove the dead workpro_api_key credential row.
-- Deleted here rather than at go-live, closing the window where it would be
-- readable through the new policies.
DELETE FROM public."PayPro_PayrollSetting" WHERE key = 'workpro_api_key';
