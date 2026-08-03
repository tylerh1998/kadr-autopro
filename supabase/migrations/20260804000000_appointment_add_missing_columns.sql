ALTER TABLE "Appointment" RENAME COLUMN created_at TO created_date;

ALTER TABLE "Appointment"
  ADD COLUMN employee_id bigint,
  ADD COLUMN status text DEFAULT 'Scheduled',
  ADD COLUMN reminders_email boolean DEFAULT false,
  ADD COLUMN reminders_text boolean DEFAULT false,
  ADD COLUMN reminder_email_address text,
  ADD COLUMN reminders_phone text,
  ADD COLUMN reminder_days_before integer DEFAULT 1,
  ADD COLUMN updated_date timestamp with time zone DEFAULT now(),
  ADD COLUMN created_by text,
  ADD COLUMN created_by_id text;
