-- Production counterpart of 20260818060000_add_kadr_employee_files_bucket.sql.
-- Same content, applied separately to hbcrwkmgsazqrvsrmxyr (production) which assigned its own
-- migration version, distinct from dev's (sitihbdnuxifwibontcm) - same reason as the
-- kadr-issue-report-attachments dual-file pair (20260817170457 / 20260817224154).
--
-- Deliberately no policies for `authenticated` or `anon` -- every read/write goes
-- through paypro-uploadEmployeeFile/paypro-viewEmployeeFile using the service-role
-- client, which bypasses RLS entirely (see the dev-only original for the full rationale).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('kadr-employee-files', 'kadr-employee-files', false, 10485760, array['application/pdf'])
on conflict (id) do nothing;
