-- Staff strong-auth RLS gate: replaces the project's blanket
-- "FOR ALL TO public USING (true)" convention with policies that require
-- TOTP MFA, a native passkey, or a Device-PIN-resumed session (which
-- inherits aal2 from the original strong sign-in) on every staff table.
-- Plain password-only (aal1) sessions and the anon key are blocked.
-- Full design rationale, table-by-table breakdown, and verification
-- evidence: Plans and Context/rls_strong_auth_policy_plan.md
--
-- Written to be idempotent (drop-if-exists before every create) and to not
-- assume a specific starting policy shape on either branch - dev and
-- production were confirmed to differ on FiscalPeriod, CustomerPortalStatement,
-- UserDevices, and Employee's per-user policies while drafting this.

-- 1. Helper function --------------------------------------------------------
create or replace function public.staff_strong_auth()
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select
    coalesce(auth.jwt()->>'aal', 'aal1') = 'aal2'
    or exists (
      select 1
      from jsonb_array_elements(coalesce(auth.jwt()->'amr', '[]'::jsonb)) am
      where (am->>'method') ilike '%webauthn%' or (am->>'method') ilike '%passkey%'
    )
$$;

comment on function public.staff_strong_auth() is
  'True when the calling session satisfied TOTP MFA (aal2), a native passkey, '
  'or a Device-PIN-resumed session that inherited aal2 from its original '
  'strong sign-in. Used as an RLS RESTRICTIVE-policy gate on staff tables - '
  'see rls_strong_auth_policy_plan.md.';

-- 2. Category A (standard) + Category B: tighten the existing wide-open
--    policy from `public` to `authenticated`, then add the restrictive
--    strong-auth gate. Employee is included here deliberately - this only
--    touches its "Enable all operations for all users" (all-rows) policy;
--    its own-record policies (created in step 7a below if missing) are the
--    AAL1 bootstrap carve-out, so a not-yet-enrolled account can still
--    reach Settings.
do $$
declare
  t text;
  tables text[] := array[
    'BankAccount','BankReconciliation','BankTransaction','CashDrawerAdjustment',
    'CashFlowEntry','CashFlowSummary','ChartOfAccount','Customer','CustomerARAdjustment',
    'CustomerPayments','DepositSlipBreakdown','Employee','GLTransaction','GSTReturn',
    'InspectionSection','InventoryAuditLog','InventoryCategory','InventoryItem',
    'InventoryLocation','InventoryReturn','LankarWOInfo','LankarWOInventory','LankarWOLines',
    'Levies','LinesOfCredit','LinesOfCreditTransaction','MobileVinScan','Note','OldRecord',
    'OtherChargeList','PTO','PayPeriods','PayrollTransaction','Project','ProjectPhoto',
    'ProjectTimeSession','ReturnReason','SalesClass','SentEmailLog','Supplier',
    'SupplierInvoiceLine','SupplierPayment','SystemSettings','TagAlong','TimeRecord',
    'UnassignedTime','Vehicle','WorkOrderStatus','workorderversionhistory',
    'CustomerPortalWorkOrder','Approvals'
  ];
begin
  foreach t in array tables loop
    execute format(
      'alter policy %I on public.%I to authenticated;',
      'Enable all operations for all users', t
    );
    execute format('drop policy if exists %I on public.%I;', 'Requires strong auth', t);
    execute format(
      'create policy %I on public.%I as restrictive for all to authenticated '
      'using (public.staff_strong_auth()) with check (public.staff_strong_auth());',
      'Requires strong auth', t
    );
  end loop;
end $$;

-- 3. Appointment: production has 3 overlapping policies today, two of which
--    are independently `TO public USING(true)` - tightening only one would
--    leave the other still open to anon. Dev has only the single generic
--    one. Drop whichever of the 3 known names exist, replace with one clean
--    policy, then gate it - safe on both.
drop policy if exists "Enable all for authenticated users" on public."Appointment";
drop policy if exists "Enable all operations for all users" on public."Appointment";
drop policy if exists "Enable read for public" on public."Appointment";
drop policy if exists "Requires strong auth" on public."Appointment";
create policy "Enable all operations for all users" on public."Appointment"
  for all to authenticated using (true) with check (true);
create policy "Requires strong auth" on public."Appointment"
  as restrictive for all to authenticated
  using (public.staff_strong_auth()) with check (public.staff_strong_auth());

-- 4. WorkOrder: tighten the wide-open policy + gate it; drop the
--    authenticated-only SELECT policy where it exists (production has it,
--    dev doesn't - the ALL policy already covers SELECT once tightened).
alter policy "Enable all operations for all users" on public."WorkOrder" to authenticated;
drop policy if exists "Requires strong auth" on public."WorkOrder";
create policy "Requires strong auth" on public."WorkOrder"
  as restrictive for all to authenticated
  using (public.staff_strong_auth()) with check (public.staff_strong_auth());
drop policy if exists "Allow authenticated read access" on public."WorkOrder";

-- 5. FiscalPeriod: production had 0 policies (Finding F1 - checkFiscalPeriodStatus()
--    was silently getting 0 rows for every staff session); dev turned out to
--    already have the standard policy. Drop-if-exists then create so this
--    works from either starting state.
drop policy if exists "Enable all operations for all users" on public."FiscalPeriod";
drop policy if exists "Requires strong auth" on public."FiscalPeriod";
create policy "Enable all operations for all users" on public."FiscalPeriod"
  for all to authenticated using (true) with check (true);
create policy "Requires strong auth" on public."FiscalPeriod"
  as restrictive for all to authenticated
  using (public.staff_strong_auth()) with check (public.staff_strong_auth());

-- 6. IssueReport: already authenticated-only INSERT, no SELECT/UPDATE/DELETE
--    policy exists on either branch - just add the gate, no role change.
drop policy if exists "Requires strong auth" on public."IssueReport";
create policy "Requires strong auth" on public."IssueReport"
  as restrictive for all to authenticated
  using (public.staff_strong_auth()) with check (public.staff_strong_auth());

-- 7. UserDevices (myKADR's device-PIN registry). Production has 4 real
--    per-user policies (auth.uid() = user_id) and no generic policy; dev
--    turned out to have only the generic wide-open policy and none of the
--    per-user ones. Normalize both branches to the correct end state: drop
--    whichever of the 5 possible policy names exist, recreate the 4
--    per-user policies fresh (now properly TO authenticated, tightened from
--    production's `TO public` - auth.uid() already made anon access
--    impossible in practice there, but this closes it explicitly too), then
--    gate. This is what actually closes the "sudo mode is fake" gap -
--    PIN setup being AAL2-gated was previously enforced client-side only.
drop policy if exists "Enable all operations for all users" on public."UserDevices";
drop policy if exists "Users can view their own devices" on public."UserDevices";
drop policy if exists "Users can insert their own devices" on public."UserDevices";
drop policy if exists "Users can update their own devices" on public."UserDevices";
drop policy if exists "Users can delete their own devices" on public."UserDevices";
drop policy if exists "Requires strong auth" on public."UserDevices";
create policy "Users can view their own devices" on public."UserDevices"
  for select to authenticated using (auth.uid() = user_id);
create policy "Users can insert their own devices" on public."UserDevices"
  for insert to authenticated with check (auth.uid() = user_id);
create policy "Users can update their own devices" on public."UserDevices"
  for update to authenticated using (auth.uid() = user_id);
create policy "Users can delete their own devices" on public."UserDevices"
  for delete to authenticated using (auth.uid() = user_id);
create policy "Requires strong auth" on public."UserDevices"
  as restrictive for all to authenticated
  using (public.staff_strong_auth()) with check (public.staff_strong_auth());

-- 7a. Employee own-record policies - the AAL1 bootstrap carve-out step 2's
--     tightened all-rows policy depends on existing. Production already has
--     these; dev turned out not to. Drop-if-exists then create so both
--     branches end up with them, deliberately outside the restrictive gate.
drop policy if exists "Users can view own employee record" on public."Employee";
drop policy if exists "Users can update own employee record" on public."Employee";
drop policy if exists "Users can insert own employee record" on public."Employee";
create policy "Users can view own employee record" on public."Employee"
  for select to authenticated using (auth.uid() = mykadr_user_id);
create policy "Users can update own employee record" on public."Employee"
  for update to authenticated using (auth.uid() = mykadr_user_id) with check (auth.uid() = mykadr_user_id);
create policy "Users can insert own employee record" on public."Employee"
  for insert to authenticated with check (auth.uid() = mykadr_user_id);

-- 8. Category C: CustomerPortalStatement has no direct client caller in
--    either kadr-autopro or kadr-customer-portal (confirmed via grep) -
--    both apps only ever touch it through service-role edge functions,
--    which bypass RLS regardless of policy. Drop the wide-open policy
--    where it exists (production has it, dev doesn't), no replacement
--    (deny-all to anon/authenticated). CustomerPortalAudit already has 0
--    policies on both branches (correct) - no action.
drop policy if exists "Enable all operations for all users" on public."CustomerPortalStatement";

-- 9. Category D: staff-only storage buckets (project-photos,
--    vin-plate-photos, kadr-digital_invoice_uploads) - already scoped to
--    `authenticated` per-bucket. All existing storage.objects policies on
--    this project are for these 3 staff buckets (confirmed via pg_policies),
--    so one table-wide restrictive gate is safe today. If a non-staff/public
--    bucket is ever added to storage.objects, this policy will apply to it
--    too unless explicitly scoped by bucket_id - revisit at that point.
drop policy if exists "Requires strong auth" on storage.objects;
create policy "Requires strong auth" on storage.objects
  as restrictive for all to authenticated
  using (public.staff_strong_auth()) with check (public.staff_strong_auth());
