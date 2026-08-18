-- Report Issue attachment uploader (PDF/image, incl. paste-screenshot) — see
-- Plans and Context/report_issue_attachment_uploader_assessment.md. Shared by both
-- kadr-autopro and WorkPro2, which share this Supabase project.
--
-- Bucket-level policies here mirror the existing per-bucket PERMISSIVE pattern already
-- used by kadr-digital_invoice_uploads/project-photos/vin-plate-photos (bucket_id-scoped
-- INSERT/SELECT policies) — storage.objects' blanket "Requires strong auth" RESTRICTIVE
-- policy narrows these, it does not itself grant access, so a new bucket needs its own
-- explicit PERMISSIVE policies or nobody (not even AAL2 staff) can read/write it.
-- Made idempotent (ON CONFLICT / DROP POLICY IF EXISTS / ADD COLUMN IF NOT EXISTS) as insurance --
-- see the production counterpart file for why this matters even for a version already recognized
-- as applied on dev.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'kadr-issue-report-attachments',
  'kadr-issue-report-attachments',
  false,
  10485760,
  array['image/png','image/jpeg','image/webp','application/pdf']
)
on conflict (id) do nothing;

drop policy if exists "Allow authenticated uploads on issue report attachments" on storage.objects;
create policy "Allow authenticated uploads on issue report attachments"
on storage.objects for insert to authenticated
with check (bucket_id = 'kadr-issue-report-attachments');

drop policy if exists "Allow authenticated reads on issue report attachments" on storage.objects;
create policy "Allow authenticated reads on issue report attachments"
on storage.objects for select to authenticated
using (bucket_id = 'kadr-issue-report-attachments');

alter table "IssueReport" add column if not exists attachments jsonb;
