-- Production counterpart of 20260817170457_add_issue_report_attachments_bucket_and_column.sql.
-- Same content, applied separately to hbcrwkmgsazqrvsrmxyr (production) which assigned its own
-- migration version, distinct from dev's (sitihbdnuxifwibontcm).
--
-- Made idempotent (ON CONFLICT / DROP POLICY IF EXISTS / ADD COLUMN IF NOT EXISTS) for the same
-- reason as 20260817013746_add_authorized_by_name_to_approvals.sql: Supabase's GitHub
-- preview-branch check replays any locally-tracked version it doesn't already have on record
-- against the dev/preview database, with no awareness of which project a file is "for." This
-- version was only ever actually applied to production, so it's unrecognized on dev and gets
-- replayed there regardless -- and dev already has this bucket/column from its own counterpart.
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
