-- Employee.pay_rate was bigint, silently rejecting decimal pay rates (Postgres 22P02)
-- the moment anyone entered a non-whole-dollar rate via TechDirectory.jsx's
-- step="0.01" input. Widened to numeric(10,2) -- lossless for existing whole-number
-- data, and PostgREST serializes numeric as a genuine JSON number (confirmed via
-- direct REST call), so no frontend/report-function regression.
-- Pre_go-live_plan.md P3. Dev-verified 2026-08-14 before promotion to production.
ALTER TABLE "Employee" ALTER COLUMN pay_rate TYPE numeric(10,2);
