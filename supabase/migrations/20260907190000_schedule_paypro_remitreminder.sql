-- Schedules the paypro-remitreminder edge function to run on the 10th day of every month at 8:00 AM UTC (2:00 AM MST / 3:00 AM MDT).
-- Cron schedule: '0 8 10 * *'

select cron.schedule(
  'paypro-remitreminder-cron',
  '0 8 10 * *',
  $$
  select net.http_post(
    url := 'https://hbcrwkmgsazqrvsrmxyr.supabase.co/functions/v1/paypro-remitreminder',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'autopro_cron_secret')
    ),
    body := '{}'::jsonb
  );
  $$
);
