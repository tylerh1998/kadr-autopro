-- Prod's Appointment.id was still uuid while dev had already moved to text.
-- Legacy (Base44-migrated) appointment records use non-UUID string ids, so the
-- primary key must be text with a uuid-shaped default for new rows, matching dev.
ALTER TABLE "Appointment" ALTER COLUMN id DROP DEFAULT;
ALTER TABLE "Appointment" ALTER COLUMN id TYPE text USING id::text;
ALTER TABLE "Appointment" ALTER COLUMN id SET DEFAULT (gen_random_uuid())::text;
