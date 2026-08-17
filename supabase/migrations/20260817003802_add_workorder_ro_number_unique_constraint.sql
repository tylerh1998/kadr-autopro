-- Prevent duplicate ro_number values on WorkOrder.
-- Two rows previously shared ro_number 'RO51566' (dev-db counter reset),
-- which broke autopro-saveworkorderdata's .maybeSingle() lookup by ro_number.
ALTER TABLE "WorkOrder"
  ADD CONSTRAINT workorder_ro_number_unique UNIQUE (ro_number);
