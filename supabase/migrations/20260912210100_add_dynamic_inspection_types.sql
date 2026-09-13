-- Add inspection_type to Project table to track which inspection template is used
ALTER TABLE "Project" ADD COLUMN IF NOT EXISTS "inspection_type" text;

-- Set default inspection_type for existing oil_change projects
UPDATE "Project" 
SET "inspection_type" = 'oil_change' 
WHERE "project_type" = 'oil_change' AND "inspection_type" IS NULL;

-- Add insp_type to InspectionSection table to differentiate templates
ALTER TABLE "InspectionSection" ADD COLUMN IF NOT EXISTS "insp_type" text;

-- Set default insp_type for existing inspection sections
UPDATE "InspectionSection" 
SET "insp_type" = 'oil_change' 
WHERE "insp_type" IS NULL;

-- Set default for future inserts
ALTER TABLE "InspectionSection" ALTER COLUMN "insp_type" SET DEFAULT 'oil_change';
