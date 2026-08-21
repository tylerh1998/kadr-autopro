-- Phase 3B — private employee-file storage bucket. Dev only (sitihbdnuxifwibontcm);
-- production counterpart applied separately once dev is verified, per the
-- dual-file-with-different-migration-version pattern used for
-- kadr-issue-report-attachments (master_context.md).
--
-- Deliberately no policies for `authenticated` or `anon` -- every read/write goes
-- through paypro-uploadEmployeeFile/paypro-viewEmployeeFile using the service-role
-- client, which bypasses RLS entirely. Tighter than kadr-issue-report-attachments
-- (which allows direct authenticated client upload/read) because these are HR
-- documents, not bug-report screenshots -- signed URLs are minted server-side only,
-- never a client-provided URL trusted or forwarded (Phase 3 plan D3/R9).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('kadr-employee-files', 'kadr-employee-files', false, 10485760, array['application/pdf'])
on conflict (id) do nothing;
