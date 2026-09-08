-- Schedules the GL Audit to run every Friday at 12:00 AM MST.
-- Note: 12:00 AM MST is 7:00 AM UTC. So cron is 0 7 * * 5.

select cron.schedule(
  'autopro-generate-gl-audit-report',
  '0 7 * * 5',
  $$
  select net.http_post(
    url := 'https://hbcrwkmgsazqrvsrmxyr.supabase.co/functions/v1/autopro-generateGLAuditReport',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'autopro_cron_secret')
    ),
    body := '{}'::jsonb
  );
  $$
);
