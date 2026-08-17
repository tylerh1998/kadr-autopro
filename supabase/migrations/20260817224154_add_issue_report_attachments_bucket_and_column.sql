-- Production counterpart of 20260817170457_add_issue_report_attachments_bucket_and_column.sql.
-- Same content, applied separately to hbcrwkmgsazqrvsrmxyr (production) which assigned its own
-- migration version, distinct from dev's (sitihbdnuxifwibontcm).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'kadr-issue-report-attachments',
  'kadr-issue-report-attachments',
  false,
  10485760,
  array['image/png','image/jpeg','image/webp','application/pdf']
);

create policy "Allow authenticated uploads on issue report attachments"
on storage.objects for insert to authenticated
with check (bucket_id = 'kadr-issue-report-attachments');

create policy "Allow authenticated reads on issue report attachments"
on storage.objects for select to authenticated
using (bucket_id = 'kadr-issue-report-attachments');

alter table "IssueReport" add column attachments jsonb;
