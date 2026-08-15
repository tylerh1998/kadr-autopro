-- Schedules the two native appointment reminder functions to run every weekday.
-- 0 15 * * 1-5 = 8:00 AM MST (fixed -7h offset, matches the functions' own non-DST-aware
-- assumption, ported 1:1 from the original base44 functions - see implementation_plan.md).
-- Auth uses a shared secret stored in Vault (name: autopro_cron_secret), not inlined here,
-- to avoid repeating the plaintext-JWT-in-a-DB-object anti-pattern already flagged elsewhere
-- in this project (sync_customer_to_google / WorkOrder_Broadcast triggers).

select cron.schedule(
  'autopro-send-appointment-email-reminders',
  '0 15 * * 1-5',
  $$
  select net.http_post(
    url := 'https://hbcrwkmgsazqrvsrmxyr.supabase.co/functions/v1/autopro-sendAppointmentReminders',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'autopro_cron_secret')
    ),
    body := '{}'::jsonb
  );
  $$
);

select cron.schedule(
  'autopro-send-appointment-text-reminders',
  '0 15 * * 1-5',
  $$
  select net.http_post(
    url := 'https://hbcrwkmgsazqrvsrmxyr.supabase.co/functions/v1/autopro-sendTextReminders',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'autopro_cron_secret')
    ),
    body := '{}'::jsonb
  );
  $$
);
