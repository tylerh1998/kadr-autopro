# Implementation Plan: Temporary Dev-Branch Login for Phase 3 Verification

**Status:** Pending your approval — no code changes made yet.
**Parent:** `master_blueprint.md` → Phase 3 (`phase_3_implementation_plan.md`), unblocking its stalled verification checklist.

---

## 1) Context & Lessons Learned

**Core goal:** Phase 3 (Auth Centralization + User→Employee migration) is code-complete and deployed to `test.kensauto.ca`, but 6 of its verification checklist items are stuck at "needs you" because they cannot currently be tested at all. This plan's job is narrow: give you a way to actually log into `test.kensauto.ca` with an identity the dev Supabase branch recognizes, then use that to finish Phase 3's verification — without touching production data or production's Auth configuration.

**How we got here (this session):**
- Reported symptom: nav bar shows "?" / "User Profile" / "Standard Access" on `test.kensauto.ca` despite a valid login.
- First fix (real, but not the root cause): [Layout.jsx](../src/Layout.jsx) had two leftover `currentUser={user}` references where `user` was never defined (should have been `employee`) — a genuine `ReferenceError`. Fixed and deployed (commit `53387770`).
- Real root cause, found by testing live in the browser: **Supabase branches have a fully independent Auth service from their parent project**, including separate JWT signing keys. Your login session is issued by production (`hbcrwkmgsazqrvsrmxyr`, `alg: ES256`) via the `my.kensauto.ca` SSO flow. `test.kensauto.ca` correctly points its Supabase client at the `development` branch (`sitihbdnuxifwibontcm`, an isolated project per `phase_1_dev_environment_parity_plan.md`) — but that branch's Auth service rejects production-signed tokens outright (`PGRST301: No suitable key was found to decode the JWT`), confirmed by calling its REST API directly with your real session token.
- **This is structural, not a bug**: every already-migrated `supabase.from()` call (not just the `Employee` lookup) will fail identically for as long as (a) login goes through production's SSO and (b) `test.kensauto.ca` talks to the isolated dev branch. It will resurface for every future phase that migrates more calls off `base44.*`.
- Investigated whether the branch could be configured to trust production's signing key. Conclusion: not practically possible without rotating production's live Auth signing key (a security-sensitive production change, out of scope, not something to do for a testing convenience). See prior conversation turn for full research.
- **Why not just point `test.kensauto.ca` at production instead?** Phase 3's own verification plan explicitly requires confirming writes land in the dev branch, not production (a standing rule from Phase 1, after Phase 1 found that not-yet-migrated write paths were silently hitting production during "safe" dev testing). Phase 3's checklist involves real writes (`updateEmployeePrefs` — dark mode, WO cards, AP access toggles) using code that hasn't been verified yet. Pointing at production would reintroduce exactly the risk Phase 1's branch isolation exists to prevent.
- **The fix that respects isolation:** you already created a native `auth.users` row directly on the dev branch (`tyler@kensauto.ca`, id `30a0d45c-0e16-4e91-881b-e57943eede44`) — a session issued by the dev branch's own Auth service will validate fine against its own PostgREST, since there's no cross-project mismatch. It just isn't wired up to an `Employee` row yet, and there's no way to reach it — the app's only login path (`RedirectToSSO` in `App.jsx`) unconditionally redirects to the production SSO flow.

**Standing rules this plan must respect** (inherited from Phase 1 / Phase 3, still true):
- Never write-test a not-yet-migrated feature against the dev branch and assume it's safe — but Phase 3's call sites *are* migrated, so testing them against dev is exactly the intended use.
- Writes must be confirmed to land in the dev branch specifically (via the Supabase connector), not assumed from "the page didn't error."
- I do not commit or push git changes automatically — you do that via GitHub Desktop, per your standing preference.
- I will not enter a password into any login form myself (standing tool-use rule) — you'll need to submit the dev-login form yourself; I can then drive/verify the resulting authenticated session with the Browser tool.

**Secondary finding, not fixed yet, flagged for awareness:** `AuthContext.jsx`'s `Employee` fetch never checks the `error` returned by Supabase — any failure (wrong project, RLS denial, network issue) silently degrades to the same "no employee" UI with zero trace. This is why diagnosing the original symptom took real investigation instead of a five-second console check. Folded into Phase 2 below as a small, additive fix (log only, no behavior change) since it directly would have shortened this session's diagnosis and will help the next one.

**Unrelated finding, explicitly out of scope for this plan:** `list_branches` shows the dev branch's git-sync status as `MIGRATIONS_FAILED` — the local repo only tracks 1 migration file (`supabase/migrations/20260705224300_parts_movement_rpc.sql`) while the branch has 15 applied (the other 14 were applied directly via the Supabase connector during Phase 1, bypassing file tracking). Not blocking this plan, but Phase 2 includes a pre-flight check to make sure this drift hasn't caused any schema to silently revert before we build on top of it.

---

## 2) Previously Completed

- **Phase 1 (Dev Environment Parity):** Dev branch (`sitihbdnuxifwibontcm`) made persistent; schema (including `WorkOrder`, previously missing entirely), RLS policies (permissive, matching production), and all 39 production SQL functions restored via the Supabase connector. Documented residual gap: not-yet-migrated `base44.*` call sites still hit production regardless of which Supabase branch the frontend points to.
- **Phase 2 (PartsTech/Online Ordering Removal):** Completed per `master_blueprint.md` (not re-verified in this session).
- **Phase 3 (Auth Centralization + User→Employee migration):** Code-complete — all 35 call sites migrated off `base44.auth.*`/`@/entities/User` onto `AuthContext`'s `employee`; `Employee` schema (`dark_mode`, `paypro_user`, `autopro_access_lvl`, `accts_pay_access`) applied to both dev and production; `npm run build` clean; repo-wide grep for old patterns clean. **Blocked on manual UI verification** (6 checklist items) because of the Auth-isolation issue above — this is what the current plan exists to unblock.
- **This session:** Fixed the `currentUser={user}` `ReferenceError` in `Layout.jsx` (committed `53387770`, pushed to `development`). Diagnosed and confirmed the JWT signing-key isolation root cause with live evidence (browser-side REST call against the dev branch, decoded bundle anon keys, `list_branches` confirmation). Confirmed dev branch already has all 9 `Employee` rows (including yours) and one unlinked native `auth.users` row for `tyler@kensauto.ca`.

---

## 3) Risk Assessment

| # | Risk | Impact | Likelihood | Mitigation |
|---|---|---|---|---|
| 1 | `/dev-login` route accidentally reachable in production (env flag misconfigured/leaked to the wrong Vercel scope) | Low — even if reached, it's a standard Supabase sign-in form against whatever `VITE_SUPABASE_URL` the production build has baked in (production itself), requiring real production credentials. Not a bypass of anything; just visual clutter/confusion. | Low — requires a manual Vercel scoping mistake | Default the flag to disabled (route no-ops without `VITE_ENABLE_DEV_LOGIN=true`); you set it only in the environment scope already used for `VITE_SUPABASE_URL`'s dev-branch value; remove the route entirely once Phase 3 verification is signed off (Phase 4) |
| 2 | Linking `Employee.mykadr_user_id` (dev branch, Tyler Haney row) to the new dev-native auth id overwrites the existing value (`85fdef6f-...`, mirrored from production) | Low — dev branch is fully isolated per Phase 1's own findings; nothing reads that value expecting it to match production | Low | Confirm via connector, before and after, that no other `Employee` row already references the new id (checked already — none do); this is a one-column `UPDATE` on a single row, trivially reversible |
| 3 | Confusing a dev-branch test session with a real production session during future testing (false confidence a bug is fixed, or a false alarm) | Medium — could waste time or mask a real issue | Medium | Dev-login form is explicitly labeled "test environment only"; this plan and `phase_3_implementation_plan.md` both document which identity is which |
| 4 | Pre-existing `MIGRATIONS_FAILED` drift on the dev branch causes an unrelated future sync to silently revert schema (WorkOrder table, RLS, functions) out from under this work | High if it happens — would silently break dev branch again, same failure mode Phase 1 already hit once | Unknown/Medium — pre-existing, not caused by this plan, no evidence it's imminent | Out of scope to fix here, but Phase 2 includes a pre-flight re-check of dev branch schema integrity immediately before linking the Employee row, so we'd catch it before building on top of a reverted branch |
| 5 | Adding `error` logging to `AuthContext.jsx`'s Employee fetch changes behavior unexpectedly | Very low — purely additive (`console.error` only), no change to `employee` state logic | Very low | Keep the diff to logging only; no control-flow changes |
| 6 | `signInWithPassword()` on the dev-native account fails to trigger `AuthContext`'s `onAuthStateChange` correctly, leaving the user stuck on a spinner | Low — `onAuthStateChange` is already global/working (it's how every existing login works today); this reuses the exact same listener | Low | Verification step 1 in Phase 3 explicitly confirms `isAuthenticated`/`employee` populate correctly right after sign-in before testing anything else |

---

## 4) Time Estimate

Autonomous agent work only (excludes your manual clicks/approvals in between):

- **Phase 1** (build `DevLogin.jsx` + route): ~10 minutes
- **Phase 2** (pre-flight check, link Employee row via connector, add error logging): ~10 minutes agent-side, plus however long it takes you to set the Vercel env var and confirm a redeploy
- **Phase 3** (drive/verify the 6 outstanding checklist items): ~20-30 minutes, mixed — you submit the dev-login form once (I can't type a password myself), after which I can drive most of the UI verification myself via the Browser tool and confirm each write via the connector; a few items (e.g. WorkPRO clock-in/out end-to-end) may need you to click through directly
- **Phase 4** (cleanup — remove or permanently flag-gate the route): ~5 minutes

**Total: roughly 45-60 minutes of agent execution**, spread across however long the Vercel redeploy and your in-the-loop confirmations take between phases.

---

## 5) Roadmap & Progress

### Phase 1 — Build the temporary dev-login route `[Pending]`

**Files impacted:** `src/lib/DevLogin.jsx` (new), `src/App.jsx` (add import + route)

**TL;DR:** Add a hidden, flag-gated `/dev-login` page that signs in directly against whichever Supabase project the build is configured for (the dev branch, on `test.kensauto.ca`), bypassing the `my.kensauto.ca` SSO redirect entirely.

**In-depth:** `App.jsx`'s `AuthenticatedApp` currently has no route that's reachable while unauthenticated — every path either renders its page (if `isAuthenticated`) or `<RedirectToSSO />`, which immediately calls `navigateToLogin()` (a hard redirect to `https://my.kensauto.ca/login...`). There is no way to reach a different sign-in mechanism today. `DevLogin.jsx` will be a new, minimal route that sits alongside the existing routes, guarded by `import.meta.env.VITE_ENABLE_DEV_LOGIN === 'true'` so it is inert everywhere the flag isn't explicitly set (which will only ever be the environment already used for the dev-branch `VITE_SUPABASE_URL`). It reuses the existing `supabase` client from `src/lib/supabase.js` unchanged — no new client, no new auth logic — so `AuthContext.jsx`'s existing global `onAuthStateChange` listener picks up the resulting session automatically, exactly as it does for the real SSO flow today.

---

### Phase 2 — Wire up the dev identity `[Pending]`

**Files/objects impacted:** `Employee` table row (dev branch `sitihbdnuxifwibontcm` only), `src/lib/AuthContext.jsx` (add error logging), Vercel environment variables (your action)

**TL;DR:** Point the dev branch's existing "Tyler Haney" `Employee` row at the dev-native auth account, add basic error visibility to the employee fetch, and get the `/dev-login` route live on `test.kensauto.ca`.

**In-depth:** Before touching anything, re-confirm the dev branch's schema wasn't affected by the known `MIGRATIONS_FAILED` drift (quick `list_tables`/`information_schema` check against `sitihbdnuxifwibontcm` — should still show `WorkOrder`, RLS policies, and the 4 new `Employee` columns from Phase 3). Then run a single `UPDATE "Employee" SET mykadr_user_id = '30a0d45c-0e16-4e91-881b-e57943eede44' WHERE id = 99999999999;` against the dev branch (via the Supabase connector), confirmed against the DB you've already been using for every other check this session. Separately, add a `console.error` in `AuthContext.jsx`'s `checkAuth` where the `Employee` query's `error` is currently discarded — purely additive, no behavior change. On your side: set `VITE_ENABLE_DEV_LOGIN=true` in Vercel for the environment/scope that already carries the dev-branch `VITE_SUPABASE_URL`, and trigger/confirm a redeploy so `test.kensauto.ca` picks up both this flag and the merged `DevLogin.jsx` route.

---

### Phase 3 — Execute Phase 3's outstanding verification checklist `[Pending]`

**Files/objects impacted:** None (verification only — this phase touches no code, only confirms Phase 3's already-shipped code actually works)

**TL;DR:** Use the new dev-login path to finally run the 6 manual checks `phase_3_implementation_plan.md` has had blocked since it was written.

**In-depth:** The 6 outstanding items from that plan's checklist:
1. Dark mode toggle (UI → dev DB → reload → persists)
2. Payroll nav gating (`paypro_user`)
3. Admin menu / executive Accounting menu / AP-only Accounting menu, gated on `admin`, `autopro_access_lvl`, `accts_pay_access` respectively
4. Avatar initials render correctly for a multi-word name
5. WorkPRO clock-in/clock-out end-to-end
6. Graceful handling when `employee` is `null` (the 1-of-9 employee with no `mykadr_user_id` — `Glenda Millhouse` in the dev data, confirmed via this session's earlier query)

You submit the `/dev-login` form once (I won't type the password). From there I can drive most of this directly via the Browser tool — navigating menus, toggling preferences, and confirming each write landed correctly in the dev branch's `Employee` table via the connector (per the standing "confirm in dev, don't assume" rule) — flagging anything that needs your own hands-on click (e.g., the WorkPRO clock flow, if it depends on something the Browser tool can't trigger).

---

### Phase 4 — Cleanup `[Pending]`

**Files impacted:** `src/lib/DevLogin.jsx`, `src/App.jsx`, Vercel environment variables

**TL;DR:** Decide whether the dev-login mechanism is worth keeping (future phases will hit this exact same isolation problem again) or should be removed now that Phase 3 is verified.

**In-depth:** If kept: leave the route flag-gated as-is, document it in `master_blueprint.md` as standing test infrastructure for future phases. If removed: delete `DevLogin.jsx`, remove its route/import from `App.jsx`, and you unset `VITE_ENABLE_DEV_LOGIN` in Vercel. Either way, Phase 3's checklist gets updated to fully checked, and its learnings (the Auth-isolation finding, the silent-error-swallowing finding) roll up per the standing "lessons learned" process once the whole phase is signed off.

---

## 6) Verification Plan

**Phase 1:** No user-facing behavior changes yet (route exists but isn't reachable without the env flag, which isn't set anywhere yet). Verification is a code review of the diff — confirm `DevLogin.jsx` early-returns/redirects when the flag is unset, and that the new route doesn't alter any existing route's behavior.

**Phase 2:** After you set the Vercel flag and redeploy, visit `https://test.kensauto.ca/dev-login` — you should see a bare sign-in form (not the SSO spinner/redirect). This alone confirms the route and flag are wired correctly, independent of whether sign-in itself succeeds yet.

**Phase 3:** For each of the 6 checklist items, "success" means:
- Sign in at `/dev-login` with the dev-native `tyler@kensauto.ca` account → nav bar shows "Tyler Haney" / correct access label instead of "?" / "Standard Access" (this alone proves the root-cause diagnosis was correct and the whole chain — dev-native session → dev branch RLS → `Employee` row → `AuthContext` → `Layout.jsx` — works end to end).
- Toggle dark mode → UI updates immediately, and a direct connector query against `sitihbdnuxifwibontcm`'s `Employee` table (`WHERE id = 99999999999`) shows `dark_mode` flipped. Reload the page → still reflects the new value (proves it's reading from the DB on load, not just local state).
- Confirm menu visibility matches whatever `admin`/`autopro_access_lvl`/`accts_pay_access` values are currently set on the dev `Employee` row for the account you're testing with (may require briefly setting different values via the connector to see each menu state, then reverting).
- Avatar shows "TH" (derived from "Tyler Haney") — proves the client-side initials derivation works for a real multi-word name.
- WorkPRO clock-in/out — click through the flow, confirm no errors and the expected UI state change; this one may surface Phase-4-adjacent gaps since the underlying `workProProxy` mechanism itself wasn't touched by Phase 3, only what feeds it.
- Log in (via a second dev-native account, or by temporarily nulling the current one's `mykadr_user_id`) as a user with no matching `Employee` row → app should show sensible defaults, not crash.

**Phase 4:** Confirm `/dev-login` either still intentionally works (if kept) or 404s cleanly (if removed) — either way, confirm the rest of the app is completely unaffected by the removal/retention.

---

## 7) Working Area (Current Phase)

### Phase 1 — Build the temporary dev-login route

**New file: `src/lib/DevLogin.jsx`**

```jsx
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabase';

const DEV_LOGIN_ENABLED = import.meta.env.VITE_ENABLE_DEV_LOGIN === 'true';

export default function DevLogin() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!DEV_LOGIN_ENABLED) {
      navigate('/', { replace: true });
    }
  }, [navigate]);

  if (!DEV_LOGIN_ENABLED) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (signInError) {
      setError(signInError.message);
      return;
    }
    navigate('/', { replace: true });
  };

  return (
    <div className="fixed inset-0 flex items-center justify-center bg-slate-100">
      <form onSubmit={handleSubmit} className="w-80 space-y-3 bg-white p-6 rounded shadow border border-amber-400">
        <p className="text-sm font-medium text-amber-600">Dev-branch login — test environment only</p>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="Email"
          className="w-full border rounded px-2 py-1"
          autoFocus
        />
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Password"
          className="w-full border rounded px-2 py-1"
        />
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button
          type="submit"
          disabled={loading}
          className="w-full bg-slate-800 text-white rounded px-2 py-1 disabled:opacity-50"
        >
          {loading ? 'Signing in...' : 'Sign in'}
        </button>
      </form>
    </div>
  );
}
```

**Modified file: `src/App.jsx`**

Add the import near the other `src/lib` imports (line 10 area):
```diff
  import PageNotFound from './lib/PageNotFound';
+ import DevLogin from './lib/DevLogin';
  import { AuthProvider, useAuth } from '@/lib/AuthContext';
```

Add the route inside `AuthenticatedApp`'s `<Routes>` block (around line 73, before the `/LankarWOView` route or the `path="*"` catch-all — exact position doesn't matter for React Router v6's ranked matching, but grouping it near the top keeps intent clear):
```diff
        />
      ))}
+     <Route path="/dev-login" element={<DevLogin />} />
      <Route
        path="/LankarWOView"
```

**Why this shape specifically:**
- `DEV_LOGIN_ENABLED` is read once at module scope from `import.meta.env.VITE_ENABLE_DEV_LOGIN`, a Vite build-time env var — same mechanism already used for `VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY`, so it fits existing conventions and requires no new tooling.
- The redirect-when-disabled logic is in a `useEffect`, not a bare render-time `navigate()` call, to avoid React's "cannot update a component while rendering a different component" warning (updating router state during render is an anti-pattern; `useEffect` defers it correctly).
- No changes to `AuthContext.jsx`'s auth logic in this phase — `onAuthStateChange` already listens globally (mounted once in `AuthProvider`, which wraps the whole `<Router>`), so a successful `signInWithPassword()` call anywhere in the tree — including this new form — is picked up automatically, exactly like today's SSO flow.
- Route placement: it sits inside `AuthenticatedApp`'s `<Routes>`, which itself only renders after `isLoadingAuth` resolves (brief spinner flash, same as every other route today) — acceptable for a temporary dev tool, not worth special-casing.

**Explicitly not touched in this phase:** `AuthContext.jsx` (that's Phase 2's error-logging addition), the `Employee` row link (Phase 2, DB-only), any Vercel configuration (your action, Phase 2).

---

**Awaiting your approval before making any code changes.**
