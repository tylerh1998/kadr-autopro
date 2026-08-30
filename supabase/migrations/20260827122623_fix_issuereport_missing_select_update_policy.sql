-- IssueReport never had a real SELECT/UPDATE policy on either branch (only
-- an authenticated-only INSERT policy that predates the migrations folder).
-- Dev happened to still carry the old generic "Enable all operations for all
-- users" (TO authenticated, true) policy, which is why Manage Tickets
-- (src/pages/ManageTickets.jsx) appeared to work there; production never had
-- that policy at all, so its select('*') silently returned zero rows under
-- RLS. Normalize both branches to the same standard staff-table pattern used
-- elsewhere (FiscalPeriod, Appointment): one permissive ALL policy, gated by
-- the existing "Requires strong auth" restrictive policy.
drop policy if exists "Allow authenticated insert" on public."IssueReport";
drop policy if exists "Enable all operations for all users" on public."IssueReport";
create policy "Enable all operations for all users" on public."IssueReport"
  for all to authenticated using (true) with check (true);
