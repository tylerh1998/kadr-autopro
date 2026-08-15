-- Enables pg_cron, needed to schedule the native appointment reminder functions
-- (autopro-sendAppointmentReminders / autopro-sendTextReminders) to run automatically.
-- First use of pg_cron in this project. pg_net (needed for the cron job to call an
-- Edge Function over HTTP) is already installed.
CREATE EXTENSION IF NOT EXISTS pg_cron;
