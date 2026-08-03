-- Phase 10D: CashFlowSummary's money-estimate fields were bigint, which silently
-- rejected any value with cents (PostgREST 22P02), causing CashFlow.jsx saves to
-- fail with zero user-visible feedback. Widen to double precision to match
-- current_bank_balance/gst_remit, which already accept cents.
ALTER TABLE "CashFlowSummary"
  ALTER COLUMN pad_registries_total TYPE double precision,
  ALTER COLUMN upcoming_payroll TYPE double precision,
  ALTER COLUMN payroll_remit TYPE double precision,
  ALTER COLUMN fiscal_cushion TYPE double precision,
  ALTER COLUMN expected_deposits TYPE double precision,
  ALTER COLUMN est_first_payroll TYPE double precision,
  ALTER COLUMN est_second_payroll TYPE double precision,
  ALTER COLUMN est_payroll_remit TYPE double precision,
  ALTER COLUMN etransfer_per_tx TYPE double precision,
  ALTER COLUMN etransfer_daily TYPE double precision,
  ALTER COLUMN etransfer_weekly TYPE double precision,
  ALTER COLUMN etransfer_monthly TYPE double precision;
