-- Fix the Employee AAL1 bootstrap carve-out (documented in master_context.md
-- but never actually working) and close the privilege self-grant hole this
-- surfaced alongside. See "Plans and Context/phase_1_implementation_plan.md"
-- O1 for the original observation.
--
-- Root cause: 20260816041853_add_staff_strong_auth_rls.sql put Employee in
-- the loop that creates "Requires strong auth" as RESTRICTIVE FOR ALL, then
-- separately created the own-record policies with a comment claiming they
-- sit "deliberately outside the restrictive gate." Postgres has no such
-- concept - restrictive policies AND against the OR of ALL permissive
-- policies, per command. A FOR ALL restrictive policy applies to the
-- own-record SELECT too, so an AAL1 session reading its own row got 0 rows,
-- same as everyone else. Verified empirically against production before this
-- fix: own_row@aal1=0, all_rows@aal1=0, own_row@aal2=1.
--
-- Idempotent - safe to re-run against either branch regardless of starting
-- shape, matching this project's standing migration convention.

-- ---------------------------------------------------------------------------
-- PART A: split the restrictive gate per-command so the SELECT carve-out
-- actually works. Narrower than the original doc's claim (which described
-- SELECT/UPDATE/INSERT all being AAL1-reachable) - deliberately. Enrollment
-- writes to auth.mfa_factors, not Employee, so reading your own row is the
-- entire bootstrap requirement. Leaving INSERT/UPDATE AAL1-reachable would
-- let any password-only session touch Employee before proving a second
-- factor.
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Requires strong auth" ON public."Employee";

CREATE POLICY "Requires strong auth" ON public."Employee"
  AS RESTRICTIVE FOR SELECT TO authenticated
  USING (public.staff_strong_auth() OR auth.uid() = mykadr_user_id);

DROP POLICY IF EXISTS "Requires strong auth (insert)" ON public."Employee";
CREATE POLICY "Requires strong auth (insert)" ON public."Employee"
  AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK (public.staff_strong_auth());

DROP POLICY IF EXISTS "Requires strong auth (update)" ON public."Employee";
CREATE POLICY "Requires strong auth (update)" ON public."Employee"
  AS RESTRICTIVE FOR UPDATE TO authenticated
  USING (public.staff_strong_auth()) WITH CHECK (public.staff_strong_auth());

DROP POLICY IF EXISTS "Requires strong auth (delete)" ON public."Employee";
CREATE POLICY "Requires strong auth (delete)" ON public."Employee"
  AS RESTRICTIVE FOR DELETE TO authenticated
  USING (public.staff_strong_auth());

-- ---------------------------------------------------------------------------
-- PART B: close the self-grant hole. Employee's base permissive policy
-- ("Enable all operations for all users") is USING(true) WITH CHECK(true)
-- FOR ALL, and `authenticated` held INSERT/UPDATE on all 21 columns - so any
-- AAL2-authenticated staff member could set their own admin/paypro_user/
-- accts_pay_access/autopro_access_lvl to anything via a direct PostgREST
-- call. The lvl3_user check in Setup.jsx is a client-side render gate only.
-- This also made the new is_paypro_user()-gated PayPRO RLS self-bypassable.
--
-- Verified complete write surface (nothing else in the codebase writes
-- Employee - no INSERT anywhere, no edge function/RPC/trigger writes it):
--   TechDirectory.jsx  -> first_name, last_name, email, pay_rate (+ DELETE)
--   AuthContext.jsx's updateEmployeePrefs, only caller Layout.jsx -> dark_mode
-- ---------------------------------------------------------------------------

-- Nothing in the codebase calls this policy - new hires are provisioned via
-- the dashboard/service role. It only ever enabled self-provisioning an
-- arbitrary row (including admin = true).
DROP POLICY IF EXISTS "Users can insert own employee record" ON public."Employee";

REVOKE INSERT, UPDATE ON public."Employee" FROM authenticated, anon;
REVOKE DELETE ON public."Employee" FROM anon;

GRANT UPDATE (first_name, last_name, email, pay_rate, dark_mode)
  ON public."Employee" TO authenticated;
