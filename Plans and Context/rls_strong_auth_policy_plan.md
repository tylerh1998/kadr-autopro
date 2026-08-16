# RLS Strong-Auth Policy (MFA / Device PIN / Passkey Only) — Implementation Plan

*Status: DRAFT — holding for approval. No code or database changes made yet.*
*Scope: Supabase project `hbcrwkmgsazqrvsrmxyr` (production) / `sitihbdnuxifwibontcm` (development) — the single shared backend for `kadr-autopro`, `myKADR`, and `kadr-customer-portal`.*

---

## 1) Overview & Objectives

**Goal.** Replace the project's current blanket-permissive RLS convention (`FOR ALL TO public USING (true)` on nearly every table) with policies that:
1. **Block plain password-only (AAL1) sessions from all staff-only tables.** Only sessions that have satisfied TOTP MFA, used a native Passkey, or resumed via a Device-PIN-restored session (which itself can only be minted from an already-strongly-authenticated session) may read/write staff data.
2. **Fully close the anonymous/public exposure on Customer-Portal-facing tables** (`CustomerPortalWorkOrder`, `CustomerPortalStatement`, `Approvals`, `CustomerPortalAudit`), which today are readable/writable by anyone holding either app's public anon key — with zero authentication of any kind.
3. **Preserve every existing legitimate access path** — the portal's own `custportal-*` edge functions (service-role, always bypass RLS regardless of policy), AutoPRO's own snapshot-minting edge functions (also service-role), and AutoPRO staff UI surfaces that read `CustomerPortalWorkOrder`/`Approvals` directly.

**Explicit non-goals (out of scope for this pass).** This is an *authentication-method* gate, not a row-level *authorization* redesign. It does not change who can see which rows based on role/department (e.g. `accts_pay_access`, `admin`, `autopro_access_lvl`) — that's a separate, materially larger project. Every table that is wide-open-to-any-authenticated-staff today stays wide-open-to-any-strongly-authenticated-staff; we are only removing (a) anonymous/public access and (b) password-only (AAL1) access.

**Why now.** `master_context.md` §2 already flags portal-table RLS as "wide open... deliberately left open because AutoPRO's own staff app may need direct read/write" — this plan is the coordinated fix that document calls for. Separately, this assessment surfaced a live bug (see §2, Finding F1) worth fixing in the same pass.

---

## 2) Assumptions & Verification

| # | Assumption | Status | Verification |
|---|---|---|---|
| A1 | RLS is currently `FOR ALL TO public USING(true) WITH CHECK(true)` on ~52 of 60 public tables (confirmed by direct query against `pg_policies`/`pg_class` on production). | **VERIFIED** | Queried live: `hbcrwkmgsazqrvsrmxyr`, 2026-08-16. Full table-by-table policy list captured. |
| A2 | `FiscalPeriod` and `CustomerPortalAudit` have RLS **enabled with zero policies** — i.e. currently deny-all to anon/authenticated, service-role only. | **VERIFIED** | Same query. |
| A3 | **Finding F1 (new, orthogonal bug):** `checkFiscalPeriodStatus()` ([fiscalPeriodUtils.jsx](src/components/utils/fiscalPeriodUtils.jsx:19)) reads `FiscalPeriod` via the normal authenticated client, not service-role. With zero policies, this call returns 0 rows for every staff session today, which the function then treats as *"No fiscal periods have been configured"* → **fails closed**, blocking every fiscal-gated write (AP, LOC, Inventory receiving, Bank transfers, Levies, WO payments — per `master_context.md` §3). | **VERIFIED** (code path + RLS state both confirmed) — **impact/blast-radius ASSUMED**: whether this is actively blocking real staff today, or whether affected flows simply haven't been exercised since go-live (2026-08-15), is unconfirmed. | Flagging to you now rather than silently folding into this plan's fix — recommend a fast, independent confirmation (attempt one real fiscal-gated save on `test.kensauto.ca` today) regardless of this plan's timeline, since it may already be a live incident. This plan's Category-A rollout does fix it as a side effect (§3), but you may want it fixed sooner. |
| A4 | `rls_auto_enable` (an event trigger, confirmed via `pg_get_functiondef`) auto-enables RLS on every new `public` table but does **not** add a policy — explaining why `FiscalPeriod`/`CustomerPortalAudit` ended up RLS-enabled-but-policy-less (a table created without someone manually following up with the standard policy), matching the "restored/copied table" landmine `master_context.md` §3 already warns about generally. | **VERIFIED** | Read function definition directly. |
| A5 | Supabase issues `aal` (`aal1`/`aal2`) and `amr` (array of `{method, timestamp}`) claims in every session JWT, readable in RLS via `auth.jwt()->>'aal'` / `auth.jwt()->'amr'`. TOTP-factor satisfaction reliably produces `aal2`. | **VERIFIED** — standard, documented Supabase Auth behavior; also directly evidenced by [AuthContext.jsx](src/lib/AuthContext.jsx:33) already calling `auth.mfa.getAuthenticatorAssuranceLevel()` client-side. |  |
| A6 | **Passkeys are NOT tracked via `auth.mfa_factors`** (that table shows 0 `webauthn` rows) — they live in a separate `auth.webauthn_credentials` table. This means native/experimental Supabase passkey sign-in does **not** raise `aal` to `aal2` the normal MFA way — consistent with [AuthContext.jsx](src/lib/AuthContext.jsx:35-40)'s explicit `isPasskey` OR-branch fallback. | **VERIFIED, 2026-08-16, against production (`hbcrwkmgsazqrvsrmxyr`) — dev could not be used (see note below).** A real passkey-authenticated production session (`auth.sessions` row, `aal='aal1'`) has exactly one `auth.mfa_amr_claims` row: `authentication_method='passkey'`. Two things confirmed at once: (1) passkey sign-in genuinely stays at **`aal1`** — the `isPasskey` client-side escape hatch is load-bearing, not defensive caution; (2) the literal `amr` method string is **`"passkey"`**, not `"webauthn"` as originally hedged — `staff_strong_auth()`'s `ILIKE '%passkey%'` branch already matches this correctly, **no function change needed**. | **Verified via read-only query against real historical session data — no code change required.** Dev (`sitihbdnuxifwibontcm`) has **zero** `auth.mfa_factors` and **zero** `auth.webauthn_credentials` rows — every session there is `aal1`/`password`, so this could not be tested on dev directly; production's own real usage supplied the answer instead. |
| A7 | Device-PIN login ([myKADR `Login.jsx` `handlePinSubmit`](../myKADR/src/pages/Login.jsx)) calls `supabase.auth.refreshSession({ refresh_token })` against a refresh token captured at PIN-setup time — and PIN setup itself is gated on the setup-time session already being AAL2 ([myKADR `Settings.jsx` `handleSetPin`](../myKADR/src/pages/Settings.jsx)). Resuming a session via `refreshSession()` is assumed to preserve that original session's `aal`/`amr`. | **VERIFIED, 2026-08-16, live PIN-login test on production** (dev has no MFA-enrolled accounts to test with — see below; done directly against prod, after-hours, no schema/policy changes, read-only check). A real employee (TOTP+passkey enrolled) did a live Device-PIN login on `autopro.kensauto.ca`. Result: **no new session was created at all** — the PIN login refreshed the *exact same* pre-existing `aal2` session (`updated_at`/`refreshed_at` jumped forward to the login moment; `id`, `aal`, and both `amr` entries — `password` + `totp` — were completely unchanged). Confirms `aal2` status carries straight through a PIN login, not by inference from ordinary refresh behavior but from the PIN flow itself. | Closed — no further verification needed. |
| A6/A7 dev-data gap | Both of the above were verified against **production** read-only history, not dev, because dev genuinely has no data to check them against. | **VERIFIED, 2026-08-16** — direct query against `sitihbdnuxifwibontcm`: `auth.mfa_factors` count = 0, `auth.webauthn_credentials` count = 0, all `auth.sessions.aal` = `aal1`, all `auth.mfa_amr_claims.authentication_method` = `password`. Nobody has ever reached `aal2` on dev. | No action needed for this plan's approval — but §5's dev verification pass will need at least one dev account with a real TOTP factor (and ideally a passkey) enrolled before the "AAL1 blocked / AAL2 allowed" test steps can run at all. Added as an explicit prerequisite in §5. |
| A8 | Neither `verify_device_access` (SECURITY DEFINER, bypasses RLS) nor the PIN login flow's pre-authentication RPC call depends on `UserDevices` being readable by `anon`/pre-session clients — so tightening `UserDevices`' policies to `authenticated`-only + strong-auth is safe and does not break PIN login itself. | **VERIFIED** — read `verify_device_access`'s definition directly; it is `SECURITY DEFINER`, runs as table owner, ignores RLS entirely. |  |
| A9 | Staff frontend reads `CustomerPortalWorkOrder` and `Approvals` directly via the authenticated client ([CustomerApprovalSnapshotModal.jsx](src/components/work-orders/CustomerApprovalSnapshotModal.jsx), [ROApprovalsModal.jsx](src/components/work-orders/ROApprovalsModal.jsx), [WorkPROViewModal.jsx](src/components/work-orders/WorkPROViewModal.jsx)) — these two tables need the same staff-authenticated+strong-auth policy as any other staff table, not a deny-all. `CustomerPortalStatement` and `CustomerPortalAudit` have **no** direct-client callers anywhere in `kadr-autopro/src` or `kadr-customer-portal/src` (both confirmed via grep) — safe to leave/set as fully deny-all-except-service-role. | **VERIFIED** by grep across both repos. |  |
| A10 | `kadr-customer-portal` never calls `supabase.from()/.auth/.rpc()` from the client at all (confirmed zero matches) — every read/write goes through `custportal-*` edge functions using the service-role key. So tightening table RLS cannot break the portal app in any way; its rate-limiting/lockout logic (in `CustomerPortalAudit`) is entirely server-side already. | **VERIFIED** by grep + reading edge function source. |  |
| A11 | **WorkPRO** (the technician-facing sister app) shares this same Supabase project/tables (`Project`, `ProjectTimeSession`, `TimeRecord`, `UnassignedTime`, `Employee`) and authenticates through the same myKADR-issued sessions (same AAL/MFA/PIN/Passkey mechanics), not a separate/weaker login path. | **VERIFIED, 2026-08-16 — two WorkPRO codebases exist, both checked.** (1) `WorkPro2` (web): `src/lib/AuthContext.jsx` is essentially a byte-for-byte match of kadr-autopro's own — identical `auth.mfa.getAuthenticatorAssuranceLevel()`/`isPasskey` logic, identical `my.kensauto.ca` login redirect, identical `.kensauto.ca`-domain cookie sharing (`src/lib/supabase.js`). (2) `workpro_app` (React Native/Expo, the actively-developed mobile app): doesn't implement its own auth at all — `signInWithMyKadr()` (`src/lib/mykadr-auth.ts`) opens the real myKADR login page in a system browser and receives back whatever session tokens myKADR's real MFA/PIN/Passkey flow produced. A password-only bypass exists (`src/lib/dev-auth.ts`) but is explicitly gated behind React Native's `__DEV__` flag and "stripped from release builds" per its own code comment — and even if triggered, produces only an `aal1` session the new RLS design already correctly rejects. | No open item — no separate/weaker WorkPRO auth path exists in production builds of either codebase. |
| A12 | Only 7 of 8 Employee-linked `auth.users` currently have a verified TOTP factor; 0 have `webauthn` MFA factors (2 have passkey *credentials*, a different mechanism); all 8 authenticated via `email`/password identity. **One employee currently has no second factor enrolled at all.** | **VERIFIED** | Direct query. |
| F2 | **Finding (new, 2026-08-16): `/dev-login`** ([DevLogin.jsx](src/lib/DevLogin.jsx:26)) — the tool `master_context.md` documents as the way to "verify a fix's live database behavior... with proper RLS" — calls **only** `supabase.auth.signInWithPassword()`. No MFA challenge, no passkey, no PIN step exists anywhere in it. It can never produce anything but an `aal1` session. | **VERIFIED** — read the file directly, 27 lines, one auth call total. | Once this plan's migration ships (dev first), any `/dev-login` session would sign in fine, see its own `Employee` row (bootstrap carve-out), and get blocked from every other Category A/B table — no longer useful for its documented purpose. No RLS-side carve-out is possible or appropriate (a `/dev-login` JWT is indistinguishable from any other password-only sign-in — an exception for one would be an exception for both). Fix: teach `DevLogin.jsx` to complete a real TOTP challenge after password sign-in (§3). |

---

## 3) Proposed Changes

**Mechanism (Supabase's own documented "Enforce MFA" pattern — RESTRICTIVE policy layered on top of existing PERMISSIVE ones):**

1. **New helper function**, `public.staff_strong_auth()` — single source of truth, so the A6/A7 assumptions above only need correcting in one place if verification shows the claim shape differs from expected:
   ```sql
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
   ```
   This mirrors `AuthContext.jsx`'s existing client-side logic exactly (`aal.currentLevel === aal.nextLevel || isPasskey`) so DB-side and app-side "am I fully authenticated" checks agree.

2. **For every staff-only table** (Category A below): add one `RESTRICTIVE` policy requiring `public.staff_strong_auth()`, and narrow the existing wide-open `PERMISSIVE` policy from `TO public` to `TO authenticated` (`ALTER POLICY "Enable all operations for all users" ON "<table>" TO authenticated;` — removes anon access without touching the `USING`/`WITH CHECK` clause). A restrictive and permissive policy combine with AND, so a row is only reachable when both "is an authenticated staff session" AND "is strongly authenticated" hold.

   **Employee — one deliberate carve-out.** Its three existing narrow "own record" policies (`auth.uid() = mykadr_user_id`, SELECT/UPDATE/INSERT) stay **outside** the restrictive gate, unchanged. This is the bootstrap escape hatch: the one employee with zero enrolled factors (A12) — or any future new hire — can still see/update *their own* Employee row at AAL1, which is necessary to reach Settings and enroll TOTP/a passkey in the first place. The broad "see every other employee" policy (tech directory, WO assignment dropdowns, etc.) does get the strong-auth gate.

   **Two tables need cleanup beyond a simple role-tighten, because they carry redundant overlapping policies today:** `Appointment` has 3 policies, two of which are independently `TO public USING(true)` (the "wide open" one *and* a separate "Enable read for public" SELECT-only one) — tightening only one would leave the other still open to `anon`. `WorkOrder` has 2 policies, one already `TO authenticated` (harmless, but now fully redundant once the main policy is tightened). Both need their redundant policies dropped, not just the primary one altered — see the table below.

3. **Category B — portal-facing, staff-touched directly**: same treatment as Category A (tighten to `authenticated` + restrictive gate). The portal's own access (via `custportal-*` edge functions, service-role) is entirely unaffected by RLS regardless of what's set here.

4. **Category C — portal-facing, staff never touches directly**: **drop** the existing wide-open policy entirely; add **no** replacement permissive policy. This leaves them exactly like `FiscalPeriod` is today — deny-all to `anon`/`authenticated`, service-role only — which fully closes the "anyone with the anon key can read customer statements" hole (A9/A10) with zero legitimate breakage.

5. **Category D — staff-only storage buckets**: add the same restrictive gate to their existing `authenticated`-scoped SELECT/INSERT/DELETE policies, for consistency (no portal/customer path touches storage — A10).

6. **Category E — out of scope, flagged only, no change proposed.**

**Per-table breakdown — every `public`-schema table plus the 3 staff-facing storage buckets, current policy state, and proposed treatment:**

**Category A — staff-only (tighten to `authenticated` + add `staff_strong_auth()` restrictive gate)**

| Table | Current policy state | Proposed treatment |
|---|---|---|
| `Appointment` | 3 policies: 2× `TO public USING(true)` (one `ALL`, one `SELECT`-only), 1× `TO public` w/ `auth.role()='authenticated'` qual | **Drop all 3**, replace with a single `TO authenticated USING(true) WITH CHECK(true)` policy + restrictive gate |
| `BankAccount` | 1× wide-open (`TO public`, `ALL`, `true`) | Tighten to `authenticated` + gate |
| `BankReconciliation` | same | Tighten to `authenticated` + gate |
| `BankTransaction` | same | Tighten to `authenticated` + gate |
| `CashDrawerAdjustment` | same | Tighten to `authenticated` + gate |
| `CashFlowEntry` | same | Tighten to `authenticated` + gate |
| `CashFlowSummary` | same | Tighten to `authenticated` + gate |
| `ChartOfAccount` | same | Tighten to `authenticated` + gate |
| `Customer` | same | Tighten to `authenticated` + gate |
| `CustomerARAdjustment` | same | Tighten to `authenticated` + gate |
| `CustomerPayments` | same | Tighten to `authenticated` + gate |
| `DepositSlipBreakdown` | same | Tighten to `authenticated` + gate |
| `Employee` | 1× wide-open (all rows) + 3× own-record (`auth.uid()=mykadr_user_id`, already `TO authenticated`) | Tighten **only** the wide-open policy + gate it; own-record policies **unchanged** (AAL1 bootstrap carve-out, see above) |
| `FiscalPeriod` | **0 policies** (RLS enabled, currently deny-all — Finding F1) | **Add for the first time**: `TO authenticated USING(true)` + restrictive gate |
| `GLTransaction` | wide-open | Tighten to `authenticated` + gate |
| `GSTReturn` | wide-open | Tighten to `authenticated` + gate |
| `InspectionSection` | wide-open | Tighten to `authenticated` + gate |
| `InventoryAuditLog` | wide-open | Tighten to `authenticated` + gate |
| `InventoryCategory` | wide-open | Tighten to `authenticated` + gate |
| `InventoryItem` | wide-open | Tighten to `authenticated` + gate |
| `InventoryLocation` | wide-open | Tighten to `authenticated` + gate |
| `InventoryReturn` | wide-open | Tighten to `authenticated` + gate |
| `IssueReport` | 1× `TO authenticated`, `INSERT`-only, no SELECT/UPDATE/DELETE policy at all | Add restrictive gate to the existing INSERT policy; no role change needed |
| `LankarWOInfo` | wide-open | Tighten to `authenticated` + gate |
| `LankarWOInventory` | wide-open | Tighten to `authenticated` + gate |
| `LankarWOLines` | wide-open | Tighten to `authenticated` + gate |
| `Levies` | wide-open | Tighten to `authenticated` + gate |
| `LinesOfCredit` | wide-open | Tighten to `authenticated` + gate |
| `LinesOfCreditTransaction` | wide-open | Tighten to `authenticated` + gate |
| `MobileVinScan` | wide-open | Tighten to `authenticated` + gate |
| `Note` | wide-open | Tighten to `authenticated` + gate |
| `OldRecord` | wide-open | Tighten to `authenticated` + gate |
| `OtherChargeList` | wide-open | Tighten to `authenticated` + gate |
| `PTO` | wide-open | Tighten to `authenticated` + gate |
| `PayPeriods` | wide-open | Tighten to `authenticated` + gate |
| `PayrollTransaction` | wide-open | Tighten to `authenticated` + gate |
| `Project` | wide-open | Tighten to `authenticated` + gate ⚠ R4 (WorkPRO auth model, A11) |
| `ProjectPhoto` | wide-open | Tighten to `authenticated` + gate |
| `ProjectTimeSession` | wide-open | Tighten to `authenticated` + gate ⚠ R4 (WorkPRO auth model, A11) |
| `ReturnReason` | wide-open | Tighten to `authenticated` + gate |
| `SalesClass` | wide-open | Tighten to `authenticated` + gate |
| `SentEmailLog` | wide-open | Tighten to `authenticated` + gate |
| `Supplier` | wide-open | Tighten to `authenticated` + gate |
| `SupplierInvoiceLine` | wide-open | Tighten to `authenticated` + gate |
| `SupplierPayment` | wide-open | Tighten to `authenticated` + gate |
| `SystemSettings` | wide-open | Tighten to `authenticated` + gate |
| `TagAlong` | wide-open | Tighten to `authenticated` + gate |
| `TimeRecord` | wide-open | Tighten to `authenticated` + gate ⚠ R4 (WorkPRO auth model, A11) |
| `UnassignedTime` | wide-open | Tighten to `authenticated` + gate ⚠ R4 (WorkPRO auth model, A11) |
| `UserDevices` | 4× own-record (`auth.uid()=user_id`), role listed as `public` but `qual` already blocks anon in practice (`auth.uid()` is `null` for anon) | Tighten role to `authenticated` (belt-and-suspenders) + add restrictive gate — closes the "sudo-mode-is-fake" gap myKADR's own code already flagged |
| `Vehicle` | wide-open | Tighten to `authenticated` + gate |
| `WorkOrder` | 2 policies: 1× wide-open (`TO public`, `ALL`, `true`) + 1× `TO authenticated`, `SELECT`-only (now fully redundant) | Tighten the wide-open policy + gate it; **drop** the redundant SELECT-only policy |
| `WorkOrderStatus` | wide-open | Tighten to `authenticated` + gate |
| `workorderversionhistory` | wide-open | Tighten to `authenticated` + gate |

**Category B — portal-facing, staff touches directly (confirmed via grep, A9)**

| Table | Current policy state | Proposed treatment |
|---|---|---|
| `CustomerPortalWorkOrder` | wide-open (`TO public`, `ALL`, `true`) | Tighten to `authenticated` + gate |
| `Approvals` | wide-open (`TO public`, `ALL`, `true`) | Tighten to `authenticated` + gate |

**Category C — portal-facing, staff never touches directly (confirmed via grep, A9/A10) — service-role only**

| Table | Current policy state | Proposed treatment |
|---|---|---|
| `CustomerPortalStatement` | wide-open (`TO public`, `ALL`, `true`) | **Drop** the policy entirely; add no replacement (deny-all except service-role) |
| `CustomerPortalAudit` | 0 policies (already deny-all) | **No change** — already correct |

**Category D — staff-only storage buckets (no portal/customer path touches storage, A10)**

| Bucket (`storage.objects`) | Current policy state | Proposed treatment |
|---|---|---|
| `project-photos` | `TO authenticated`: SELECT, INSERT, DELETE | Add restrictive gate to all 3 |
| `vin-plate-photos` | `TO authenticated`: SELECT, INSERT | Add restrictive gate to both |
| `kadr-digital_invoice_uploads` | `TO authenticated`: SELECT, INSERT | Add restrictive gate to both |

**Category E — out of scope, flagged only**

| Table | Current policy state | Proposed treatment |
|---|---|---|
| `flashcards` | 2 policies incl. `TO public` SELECT ("Allow public read access") | **No change proposed here** — looks like an unrelated leftover/demo table, not part of any module in `master_context.md`. Recommend a separate decision on whether to delete it. |

7. **`DevLogin.jsx` — add a TOTP step so it stays useful after this ships (Finding F2).** After `signInWithPassword()` succeeds, check `supabase.auth.mfa.getAuthenticatorAssuranceLevel()`. If `nextLevel === 'aal2'` and `currentLevel !== nextLevel`, show a second short form (6-digit code) instead of navigating away immediately; on submit, `mfa.listFactors()` → `mfa.challenge({factorId})` → `mfa.verify({factorId, challengeId, code})`, then navigate as before. If the signed-in account has no factor enrolled at all (`nextLevel === currentLevel === 'aal1'`), behavior is **unchanged** — it navigates straight through, same as today. This deliberately keeps `/dev-login` useful for *both* halves of §5's test matrix: a no-factor account still exercises the "AAL1 blocked" case, and a TOTP-enrolled account (via `scripts/enroll-dev-totp.mjs` — see below) now exercises the "AAL2 allowed" case, without ever touching `my.kensauto.ca`. Dev-only (`DEV_LOGIN_ENABLED`/`VITE_ENABLE_DEV_LOGIN` gate, unchanged) — not exposed on production regardless.

   **Getting a dev account to `aal2` without the myKADR UI.** [`scripts/enroll-dev-totp.mjs`](scripts/enroll-dev-totp.mjs) (added 2026-08-16, not part of the shipped app — a standalone one-off tool) drives the same official `supabase.auth.mfa.enroll()`/`.challenge()`/`.verify()` sequence the real Settings page uses, but computes the 6-digit code itself (a from-scratch RFC 6238 TOTP implementation using only Node's built-in `crypto` — no new dependency, no authenticator app needed) instead of waiting on a human to type one in. Hardcoded to the dev project URL only, so it can't accidentally target production. Run with `node scripts/enroll-dev-totp.mjs` from the repo root; prompts for a dev account's email (defaults to `test@kensauto.ca` — dev's most-active existing account, 57 real sessions) and password interactively, so no credential is ever typed into this chat. Prints the resulting TOTP secret, which can also be dropped into a real authenticator app if you want to reuse the same factor for manual testing later.

**Deployment mechanics** (per `master_context.md` §6's standing workflow): one migration file, `supabase/migrations/<timestamp>_staff_strong_auth_rls.sql`, applied to **dev (`sitihbdnuxifwibontcm`) first**, live-verified on `test.kensauto.ca` (§5), then promoted to production only with your explicit go-ahead — production RLS changes are exactly the kind of "direct write to prod" action gated by both this plan's approval step and Claude Code's own prod-write confirmation prompt.

---

## 4) Risk Assessment

| # | Risk | Mitigation |
|---|---|---|
| R1 | ~~A6's assumption about passkey `amr` claim shape~~ — **resolved.** Confirmed against real production session data: the literal method is `"passkey"`, and `staff_strong_auth()`'s `ILIKE '%passkey%'` already matches it correctly. No function change needed. | Closed — see A6. |
| R2 | ~~A7 (Device-PIN sessions preserving `aal2` through `refreshSession()`)~~ — **resolved.** A live PIN login on production reused the existing `aal2` session unchanged, confirmed directly (not inferred). | Closed — see A7. |
| R3 | ~~One employee currently has zero enrolled second factors~~ — **checked, 2026-08-16, low stakes.** That account is `test@kensauto.ca` ("Test Employee") itself — a test/placeholder record, not a real staff member. All 7 real employees (Annika, Ken, Marley, Marshall, Ryley, Elisa, Tyler) already have verified TOTP; Elisa and Tyler also have passkeys. | Closed — no real employee would be locked out. |
| R4 | ~~A11 — WorkPRO may have an independent, non-MFA'd auth path~~ — **resolved.** Both WorkPRO codebases (`WorkPro2` web, `workpro_app` mobile) confirmed to route through the same myKADR-issued sessions; mobile's dev-only password bypass is stripped from release builds and would only ever produce an `aal1` session this plan already blocks. | Closed — see A11. |
| R5 | **Finding F1 (FiscalPeriod currently fails closed) may already be live-blocking real fiscal-gated staff writes** since go-live (2026-08-15). This plan fixes it as a byproduct, but on this plan's normal timeline (dev → verify → prod), not immediately. | Flagged in A3 for your own prioritization — a standalone one-line policy fix (`CREATE POLICY ... ON "FiscalPeriod" ...`) could be pushed same-day, independent of the rest of this plan, if you want it addressed sooner. |
| R6 | **Any `SECURITY DEFINER` function bypasses RLS on the tables it touches, regardless of this plan.** Catalogued: `check_user_factors`, `get_ap_summary_data` (×3 overloads — worth a look, unclear why an AP summary needs elevated rights), `handle_work_order_versioning`, `rls_auto_enable`, `test_get_ap_suppliers_only` (name suggests a leftover test artifact), `update_inventory_with_audit` (×2 overloads), `verify_device_access`. This plan's table-level changes provide **no** additional protection against a caller invoking one of these directly with an AAL1 session — they were already bypassing standard RLS before this change and continue to. | Out of scope for this pass (which is specifically about table RLS), but worth a follow-up look — particularly `test_get_ap_suppliers_only` (likely dead/debug code) and confirming the 3 `get_ap_summary_data` overloads are all genuinely load-bearing. Flagging, not fixing here. |
| R7 | **Any staff RPC that is *not* `SECURITY DEFINER`** (the large majority — `set_workorder_lock`, `search_work_orders`, `process_payment_atomic`, etc.) executes with the *caller's* row permissions, so it **will** be correctly gated by this plan's table-level restrictive policies once deployed — an AAL1 session calling e.g. `process_payment_atomic` would now fail. This is intended behavior, but is a real behavior change worth confirming during live testing (§5), not just direct-table access. | Covered by the standard "test a real write end-to-end" step in §5's checklist. |
| R8 | **Storage bucket policies (Category D)** currently have no MFA-equivalent gate at all — any authenticated (even AAL1) session can already upload/read photos and invoice scans. Tightening these is a genuine behavior change for any AAL1-only staff member (see R3) until they enroll a factor. | Same operational mitigation as R3 — confirm all active staff have a second factor enrolled before prod promotion. |
| R9 | **Finding F2 — `/dev-login` is password-only** and would silently stop being useful for RLS testing (not break the app itself, just the testing tool) once this ships, if left unfixed. | Addressed directly in this plan — §3 point 7 adds a TOTP step to `DevLogin.jsx`, and `scripts/enroll-dev-totp.mjs` gets a real dev account to `aal2` without needing `my.kensauto.ca`. Both are proposed changes in this same migration, not a separate follow-up. |

---

## 5) Verification & Testing Plan

**Prerequisite:** dev (`sitihbdnuxifwibontcm`) currently has zero enrolled TOTP factors and zero passkey credentials — nobody has ever reached `aal2` there. Before step 2 below can run, enroll a real TOTP factor (and ideally a passkey) on at least one dev test account. (A6/A7 themselves no longer need this — both are now fully verified via read-only checks and a live PIN-login test against production, done 2026-08-16, no schema changes involved. This prerequisite is only for testing the *actual migrated policies* on dev once §3's migration is written and applied there.)

**Dev-branch (`sitihbdnuxifwibontcm` / `test.kensauto.ca`) verification, in order:**
1. Enroll a TOTP factor and a passkey on a dev test account (prerequisite above).
2. As an **AAL1-only** test session (password login, no MFA challenge completed, no passkey): attempt a direct `select` against a Category A table (e.g. `Customer`) via the REST API — expect **0 rows / permission-denied-equivalent**, not the real data.
3. As a **fully strongly-authenticated** session: repeat the same read — expect normal data back; then exercise one real write path per major module (a WorkOrder save, an AR payment, a supplier invoice line) to confirm the restrictive gate doesn't interfere with legitimate `SECURITY INVOKER` RPC calls (R7).
4. As the **anon key, no session at all**: attempt direct reads against `CustomerPortalStatement` and `CustomerPortalAudit` — expect denial (closes the hole from A9/A10). Attempt the portal's normal flow (`custportal-getPortalStatement` etc.) through its real edge functions — expect unchanged, working behavior (service-role bypasses RLS).
5. Confirm `checkFiscalPeriodStatus()` now returns real periods for a strongly-authenticated session (Finding F1 fix).
6. Confirm Device-PIN login itself still works end-to-end (`verify_device_access` unaffected per A8) and that a fresh device registration (`UserDevices` insert) from an AAL2 session still succeeds — now that `UserDevices` itself carries the restrictive gate.
7. A technician clock-in/out cycle (via either WorkPRO codebase), to confirm `TimeRecord`/`ProjectTimeSession` still work now that A11 is verified.

**Checklist:**
- [x] Verify A6 (passkey `amr` shape) — done, against production session history (2026-08-16)
- [x] Verify A7 (Device-PIN `aal` preservation) — done, live PIN-login test on production (2026-08-16)
- [x] Verify A11 (WorkPRO auth model) — done, both `WorkPro2` and `workpro_app` read directly (2026-08-16)
- [ ] Confirm all active employees have TOTP or passkey enrolled (or accept/communicate the R3 impact for the one who doesn't)
- [x] Run `scripts/enroll-dev-totp.mjs` against `test@kensauto.ca` — done 2026-08-16. (Blocked once on a real finding: dev had TOTP enrollment disabled at the project level, Authentication → Providers — production had it on, dev didn't, another instance of this project's dev/prod config drift. Fixed via the dashboard, then the script completed cleanly: `test@kensauto.ca` now has a verified TOTP factor, confirmed `aal2`/`aal2`.)
- [ ] Implement the `DevLogin.jsx` TOTP step (§3 point 7, Finding F2 / R9)
- [x] Write migration: `staff_strong_auth()` helper function — [`20260816020000_add_staff_strong_auth_rls.sql`](supabase/migrations/20260816020000_add_staff_strong_auth_rls.sql)
- [x] Write migration: Category A — tighten existing policies to `authenticated`, add restrictive gate (all tables listed in §3, Employee carve-out respected)
- [x] Write migration: `FiscalPeriod` — add both the base permissive and restrictive policy for the first time
- [x] Write migration: Category B (`CustomerPortalWorkOrder`, `Approvals`) — same tighten-plus-gate treatment
- [x] Write migration: Category C (`CustomerPortalStatement`, `CustomerPortalAudit`) — drop wide-open policy, no replacement
- [x] Write migration: Category D (`storage.objects`, 3 staff buckets) — add restrictive gate
- [x] Apply migration to dev (`sitihbdnuxifwibontcm`) — applied 2026-08-16, plus a same-day follow-up fix for `IssueReport` (see §6)
- [x] Enroll a TOTP factor + passkey on a dev test account — done earlier (`test@kensauto.ca`, confirmed `aal2`)
- [x] Steps 1, 3, 5, 7 — manually verified by you on `test.kensauto.ca`
- [x] Step 2 (AAL1 blocked) — verified 2026-08-16 via [`scripts/verify-rls-checks.mjs`](scripts/verify-rls-checks.mjs): fresh no-MFA signup got 0 rows back from `Customer` (1,461 real rows) and `Employee` (9 real rows)
- [x] Step 4 (anon denied) — verified 2026-08-16, same script: plain anon key got 0 rows back from `CustomerPortalStatement` (2 real rows), `CustomerPortalAudit` (51 real rows), and `Customer` (1,461 real rows, bonus check confirming the role-tighten fix too)
- [x] Step 6 — verified 2026-08-16 via [`scripts/verify-userdevices-rls.mjs`](scripts/verify-userdevices-rls.mjs) without needing production or the myKADR UI: an AAL2 session's `UserDevices` insert succeeded (`201`); `verify_device_access()` (SECURITY DEFINER, anon-callable) returned `true`, confirming the PIN pre-auth check path is untouched; an AAL1-only session's insert was explicitly rejected (`403`, `"violates row-level security policy \"Requires strong auth\""`) — direct proof the "sudo mode is fake" gap (PIN setup previously enforced AAL2 client-side only) is now closed at the database level.

**All 7 dev verification steps complete.** Dev implementation is fully verified. Only production promotion remains.
- [x] Get your explicit go-ahead for production promotion
- [x] Pre-apply safety check: re-queried production's live `pg_policies` state immediately before applying — confirmed it still matched the original assessment exactly (no drift since), so the migration's production-shape branches (Employee/UserDevices/IssueReport already correctly scoped, FiscalPeriod/CustomerPortalStatement in their known states) were verified accurate before running, not just assumed
- [x] Apply migration to production (`hbcrwkmgsazqrvsrmxyr`) — applied 2026-08-16, clean, no errors
- [x] Post-apply sweep on production (same "any table still granting `public`?" query used on dev) — only `flashcards` remains (intentionally out of scope, Category E); `get_advisors(security)` shows only the 2 expected INFO findings (`CustomerPortalAudit`/`CustomerPortalStatement`, correct intended state), nothing new
- [x] Re-run steps 2, 4, 5 directly against production — done 2026-08-16 via [`scripts/verify-rls-checks-prod.mjs`](scripts/verify-rls-checks-prod.mjs): anon got 0 rows from `CustomerPortalStatement` (332 real rows), `CustomerPortalAudit` (1 real row), and `Customer` (1,463 real rows); a fresh no-MFA signup got 0 rows from `Customer`; a fresh AAL2 (throwaway signup + real TOTP enroll/verify) session got 5 real rows back from `FiscalPeriod` (6 total, `limit=5`) — direct live confirmation that Finding F1 is fixed on production, not just dev.

**Plan complete.** Every assumption verified, every proposed change implemented, every verification step passed on both dev and production. Two throwaway test accounts exist on each project from the scripted checks (`rls-verify-*@kensauto.ca` on dev, `rls-verify-prod-*@kensauto.ca` on production) — unused, harmless, safe to delete from each project's Auth users list whenever convenient.

---

## 6) Completion Notes & Context

*(Live working area — updated after execution, not before.)*

**Dev implementation done, 2026-08-16.** `staff_strong_auth()` + all Category A/B/C/D policy changes applied to `sitihbdnuxifwibontcm`; `DevLogin.jsx` TOTP step implemented. Production not touched.

**Real deviation from the plan, worth carrying forward: dev and production had different starting RLS states, not just different data.** The whole migration was designed off a `pg_policies` assessment of *production only* — dev was never independently checked before writing the SQL. Applying it surfaced three concrete differences:

1. `FiscalPeriod` already had the standard policy on dev (production had 0) — the plan's plain `CREATE POLICY` failed outright (`already exists`). Caught immediately and loudly — no silent damage.
2. `UserDevices` and `Employee` had **only** the generic wide-open policy on dev — the per-user policies (`auth.uid() = user_id` / `mykadr_user_id`) that exist on production didn't exist on dev at all.
3. `IssueReport` likewise still had dev's generic wide-open policy underneath the new restrictive gate — missed on the first pass because its production shape (`Allow authenticated insert`, already `authenticated`-only) was assumed rather than independently checked.

**#2 and #3 are the ones that actually mattered.** A `RESTRICTIVE` policy scoped `TO authenticated` does not apply at all to a request coming in as `anon` — so leaving the underlying wide-open `TO public` policy untouched while adding the gate produces a restrictive policy that looks correctly installed but blocks nothing for anon traffic. This shipped correctly in the end only because the FiscalPeriod error forced a full re-check of dev's actual policy state before continuing, rather than trusting the original table-by-table assumptions through to completion — the second gap (`UserDevices`) was caught by that re-check, but the third (`IssueReport`) was still missed until an explicit post-apply sweep query (`roles_seen && '{public}'` across every table) caught it directly.

**Lesson for future work on this project, beyond this one migration:** given `master_context.md` already documents dev/prod drift as a recurring, confirmed pattern (schema, data, functions, RLS), any future cross-branch RLS/policy change should independently query *both* branches' actual `pg_policies` state before writing SQL, not assess one and assume the other matches — and should re-verify with a blanket "does any policy on any table still grant `public`/`anon`" sweep immediately after applying, rather than trusting the migration's own table-by-table logic to have covered everything. Both fixes here were genuinely quick (one-line `ALTER POLICY`), but the exposure window on `UserDevices`/`IssueReport` — however brief, dev-only, and low-traffic — would not have existed at all with that sweep built into the process from the start rather than added reactively.

**Migration file itself ended up written to be idempotent throughout** (`drop policy if exists` before every `create`) specifically because of this — it's now safe to re-run against either branch regardless of starting shape, which is what let the `IssueReport` and `UserDevices` fixes land as simple follow-up statements rather than requiring a full rollback/rewrite.

**Still open:** live verification (§5's 7 dev steps — need real HTTP requests with real AAL1 vs AAL2 JWTs, which `execute_sql` can't exercise since it bypasses RLS entirely), then your go-ahead before production.
