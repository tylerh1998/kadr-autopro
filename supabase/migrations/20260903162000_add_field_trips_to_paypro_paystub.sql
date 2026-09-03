-- Add field_trips column to PayPro_PayStub to store trip date, times, comments, hours, rate, amount
ALTER TABLE "PayPro_PayStub" ADD COLUMN IF NOT EXISTS field_trips jsonb;

COMMENT ON COLUMN "PayPro_PayStub".field_trips IS
  'JSON array of detailed field trips for bus drivers: date, times, comments, hours, rate, amount.';
