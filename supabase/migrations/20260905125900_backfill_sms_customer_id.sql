-- Backfill customer_id in SmsMessage table
UPDATE public."SmsMessage" m
SET customer_id = c.id::text
FROM public."Customer" c
WHERE m.customer_id IS NULL
AND (
  (m.direction = 'inbound' AND (c.phone = m.from_phone OR c.secondary_phone = m.from_phone))
  OR
  (m.direction = 'outbound' AND (c.phone = m.to_phone OR c.secondary_phone = m.to_phone))
);
