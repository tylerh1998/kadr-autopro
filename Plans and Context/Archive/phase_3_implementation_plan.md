# Phase 3 Implementation Plan: Auth Centralization + User→Employee Settings Migration

**Status:** EXECUTED — pending your manual verification (see checklist)
**Parent:** `master_blueprint.md`, Phase 3
**Live document note:** Same as Phase 2 — this file gets updated in place as execution proceeds, not wiped and rewritten. Learnings roll back into `master_blueprint.md` Section 7 at the end.

---

## 0) Open Questions — RESOLVED

1. **✅ Confirmed.** Extend the existing `AuthContext.jsx` with an `employee` field (fetched from Supabase) rather than building separate infrastructure.

2. **✅ Resolved, and simpler than expected.** Final field set:
   - `dark_mode` → migrates to `Employee.dark_mode` (already added on dev by user)
   - `Paypro_user` → migrates to `Employee.paypro_user` (already added on dev by user)
   - `access_level` → migrates to `Employee.autopro_access_lvl` (renamed; already added on dev by user)
   - `User_name` → **not a separate field** — confirmed equivalent to `full_name`, which `Employee` already has. `TimeRecordsView.jsx`'s `User_name` references become `employee.full_name`.
   - `wo_cards` and `OpenNewWindow` → **deprecated, not migrated.** No new columns for these. See Section 1/3.2 for what this means in practice — turns out to require no extra work beyond what's already planned.

3. **✅ Resolved.** One-time data population into the 3 new columns will be done manually by the user. Not part of this phase's execution — I only need to make sure the columns exist (done, on dev) and the code reads/writes them correctly.

4. **✅ Resolved.** The employee missing `mykadr_user_id` is a known, casual employee who hasn't completed her myKADR signup yet — not being backfilled now. Confirmed this needs graceful handling (no crash, sensible defaults) in the verification plan, not a blocking data-integrity issue.

5. **✅ Confirmed — no risk, cleaning it up.** `ProtectedRoute.jsx` deleted as part of this phase (zero importers, confirmed).

**New finding, resolved without needing to ask:** `handleToggleOpenNewWindow`/`handleToggleWOCards` in `Layout.jsx` are already dead code today — never wired to any UI element (only `handleToggleDarkMode` has an actual menu item, confirmed via grep). And the 4 other files that read `wo_cards`/`OpenNewWindow` (`WorkOrders.jsx`, `WorkOrderTable.jsx`, `WorkOrderList.jsx`, `FindPartModal.jsx`) all receive `currentUser` as a prop from `WorkOrders.jsx`'s single call site — so once that one site migrates to the new `employee` object (which will simply never carry these two fields), all four files' existing `?.` optional-chaining checks degrade to their already-coded defaults (open in new window, table view) automatically. **No edits needed in those 3 sub-component files at all** — deprecating these fields turns out to be "delete 2 already-dead functions in `Layout.jsx`," full stop.

**Second round of findings (deeper `Layout.jsx` read, post-approval):** `Layout.jsx` uses the base44 `user` object far more extensively than the original inventory caught. Full field census and resolution:

| Field | Where used | Resolution |
|---|---|---|
| `role` (`=== 'admin'`) | Lines 845, 886 — gates an admin-only menu section, renders a role label | `Employee.admin` already exists natively — use `employee?.admin` |
| `AcctsPayAccess` | Line 552 — gates a limited Accounting menu (Cash Drawer + Cash Flow only) for non-executive AP users | **New column added**, `Employee.accts_pay_access` (boolean) — added to dev via connector just now. Needs the same `ALTER TABLE` applied to production during this phase. |
| `access_level === 'lvl3_user'` | Line 541 — gates the full executive Accounting menu | Already resolved via Section 0 #2 → `employee?.autopro_access_lvl === 'lvl3_user'` |
| `user.id` (WorkPRO lookup) | Lines 206-208 — `sbCall('filter', 'Employee', { params: { autopro_user_id: user.id } })`, part of the `checkClockStatus` effect | **Confirmed explicitly Phase 4 territory** (the `sbCall`/`workProProxy` mechanism itself is untouched — Phase 4's job to replace). Phase 3 only changes *what feeds it*: substitute `employee?.autopro_user_id` for `user.id`. |
| `user.email` (WorkPRO lookup fallback) | Lines 213-215 | Same as above — substitute `employee?.email` for `user.email`, mechanism untouched |
| `user.id` (TimeRecord audit field) | Line 330 — `created_by_id: user.id` inside `handleClockToggle`'s `sbCall('create', 'TimeRecord', ...)` | Same pattern — substitute `employee?.autopro_user_id` |
| `Initials` | Line 593, rendered at 824/835 as avatar fallback text | No native equivalent — **derive client-side** from `employee?.full_name` (e.g. "John Smith" → "JS") instead of reading a stored field |
| `avatar_url` | Lines 824, 835 — `<AvatarImage src={user?.avatar_url} />` | **Dropped** — avatar now always renders the derived-initials fallback, no photo. Remove the `<AvatarImage>` elements (or leave them with an always-undefined `src`, which most Avatar components already render as a fallback — confirm exact `Avatar`/`AvatarImage` component behavior at execution time before deciding whether to delete the `<AvatarImage>` tags outright or just stop passing `src`) |
| `User_name` / `full_name` | Line 842 | Already resolved via Section 0 #2 → `employee?.full_name` only, no fallback chain needed |

---

## 1) Phase Scope & Objectives

**TL;DR:** Migrate ~30 call sites off `base44.auth.me()`/`base44.auth.updateMe()`/the `UserEntity`(`User`)-from-`@/entities/User` equivalent, onto the app's existing (already-working) Supabase-Auth-backed `AuthContext`. Add the confirmed preference fields as new columns on the native `Employee` table, one-time migrate existing values (pending Section 0 #3), and repoint reads/writes.

**In scope:**
- Extend `src/lib/AuthContext.jsx` to also resolve and expose the current user's `Employee` row, plus a generic `updateEmployeePrefs()` writer.
- `Employee` schema: `dark_mode`, `paypro_user`, `autopro_access_lvl` — **already added on the dev branch by the user**; this phase applies the same change to production.
- Repoint all 30 call sites (full inventory in Section 3.2) to `useAuth()` (component-scope) or `supabase.auth.getUser()` + an `Employee` lookup (non-component-scope, matching the pattern already used in 8 files).
- Repoint `Layout.jsx`'s `handleToggleDarkMode` to `updateEmployeePrefs()`.
- Delete `Layout.jsx`'s `handleToggleOpenNewWindow`/`handleToggleWOCards` — confirmed already-dead code (never wired to any UI element), and their underlying fields are being deprecated per Section 0 #2.
- Delete `src/components/ProtectedRoute.jsx` — confirmed dead code, zero importers.
- `TimeRecordsView.jsx`: consolidate its `User_name` references onto `employee.full_name`.

**Explicitly out of scope:**
- Login/logout flow itself (`my.kensauto.ca/login`, `AuthContext.logout()`/`navigateToLogin()`) — already fully native, not base44-touched at all, nothing to change.
- One-time data population of the 3 new columns — user is doing this manually, not part of this phase's execution.
- `WorkOrderTable.jsx`, `WorkOrderList.jsx`, `FindPartModal.jsx` — confirmed no edits needed; their `wo_cards`/`OpenNewWindow` checks degrade to existing defaults automatically once `WorkOrders.jsx`'s single call site migrates (see Section 0's new finding).
- Any entity/table other than `Employee` and the auth session itself.
- `SystemSettings` read in `Layout.jsx` (`base44.entities.SystemSettings.list()`, for the training-environment flag) — this is a different entity, different call pattern (`base44.entities.*`, not `base44.auth.*`), not part of this phase's scope per the blueprint.

**Target outcome:** Zero remaining `base44.auth.*` calls and zero remaining `@/entities/User` imports anywhere in `src/`. Every page that currently depends on knowing "who is the current user" continues to work identically, now backed by `Employee` + Supabase Auth instead of Base44.

---

## 2) Lessons Learned & Context (from `master_blueprint.md` Section 7, applicable to this phase)

- **Verify actual current state before trusting a description of it.** The blueprint described this phase as "build a hook" — reading the actual code first (rather than executing the blueprint's summary literally) surfaced that most of the infrastructure already exists. Same principle that caught the `PartsTechCart` and `WorkOrderForm.jsx` duplicate issues in earlier phases.
- **Deep, file-level research before writing the plan pays off** (explicit Phase 2 lesson) — applied here by reading `AuthContext.jsx`, `App.jsx`, `ProtectedRoute.jsx`, and the `Employee` schema directly rather than assuming the blueprint's file list was complete. It wasn't (`UserEntity`/`User` call sites in 6 files weren't in the original `base44.auth.*` inventory at all).
- **Never write-test a not-yet-migrated feature on "dev"** (Phase 1 finding) — doesn't block this phase's *planning*, but matters for execution: once call sites are repointed to `Employee`/Supabase Auth, verification needs to happen against the dev branch specifically, and needs to confirm the *write* lands in dev's `Employee` table, not assume it did because the page didn't error.
- **Some gaps are silent, not error-throwing** (Phase 1 finding, re: missing triggers) — same risk pattern applies here: if an `Employee` lookup by `mykadr_user_id` returns null (the 1-of-9 gap in Section 0 #4), code that currently assumes `user` is always populated could silently misbehave rather than error. Worth explicit test coverage for the "no matching Employee" case, not just the happy path.
- **A linked/prior document mixing agreed scope with unstated assumptions needs separating before treating it as approved scope** (Phase 12 Appointment lesson, same shape here) — the blueprint's "3 preference fields" description undersold the actual scope; Section 0 surfaces the real list rather than silently expanding scope without asking.

---

## 3) Detailed Execution Plan

### 3.1 Architecture — current state vs. target state

```
CURRENT STATE (mixed / inconsistent across the app)
----------------------------------------------------
                       ┌─────────────────────────────────┐
                       │   src/lib/AuthContext.jsx        │
                       │   (AuthProvider, wired in         │
                       │    App.jsx, already native)       │
                       │                                    │
                       │   exposes: user, session,          │
                       │   isAuthenticated, isLoadingAuth,   │
                       │   logout, navigateToLogin           │
                       │   (session.user = real Supabase    │
                       │    Auth user; NOT an Employee row)  │
                       └─────────────────────────────────┘
                                      │
                    ┌─────────────────┼─────────────────────┐
                    │                 │                       │
             11 files already    ~21 files still call    6 files call
             call                base44.auth.me()         UserEntity.me() /
             supabase.auth       directly (bypassing       User.me()
             .getUser()          AuthContext entirely)      (@/entities/User —
             directly            ────────────────────►      same thing as
             (established,                                  base44.auth.me(),
              inconsistent                                  different import
              with AuthContext                               path)
              too — doesn't
              use the context
              either)
                    │                 │                       │
                    └─────────────────┴───────────┬───────────┘
                                                    ▼
                                      Base44 SaaS backend (via
                                      hardcoded-to-production
                                      base44-proxy URL — see
                                      blueprint Risk #14)

  Layout.jsx additionally: base44.auth.updateMe({dark_mode,
  OpenNewWindow, wo_cards}) — writes preferences to Base44's
  own User entity, not Postgres at all.

  Employee table (native Postgres) already has a mykadr_user_id
  (uuid) column that maps 8 of 9 rows to a real Supabase Auth
  user id — just not read by any of the above paths yet.


TARGET STATE
------------
                       ┌─────────────────────────────────┐
                       │   src/lib/AuthContext.jsx        │
                       │   (extended)                      │
                       │                                    │
                       │   exposes: user, session,          │
                       │   employee,  ◄── NEW               │
                       │   isAuthenticated, isLoadingAuth,   │
                       │   logout, navigateToLogin,          │
                       │   updateEmployeePrefs()  ◄── NEW    │
                       └─────────────────────────────────┘
                                      │
                    ┌─────────────────┴─────────────────────┐
                    │                                          │
          Component-scope call sites               Non-component-scope call
          (~24 files) — useAuth()                   sites (utility fns, etc.)
          → { user, employee }                       — supabase.auth.getUser()
                                                        + supabase.from('Employee')
                    │                                  .select().eq('mykadr_user_id', ...)
                    └─────────────────┬─────────────────────┘
                                      ▼
                       Supabase Auth (session) + native
                       Employee table (Postgres) — zero
                       Base44 dependency for "who is this user"
```

---

### 3.2 Full call-site inventory (30 sites across 26 files)

**Legend:** Pattern A = component-scope, migrate to `const { user, employee } = useAuth();`. Pattern B = not cleanly component-scope (deep in an async handler where restructuring to hooks is awkward, or a non-component file), migrate to inline `supabase.auth.getUser()` + `Employee` lookup, matching the 8-file pattern already established (`CreditInvoice.jsx`, `InventoryReturns.jsx`, `InventoryPartsReturnModal.jsx`, `AdvancePaymentModal.jsx`, `WorkOrderForm.jsx` ×3, `WarrantyReturnModal.jsx`, `WOAddInventoryModal.jsx`).

| # | File | Line(s) | Current call | Migration pattern |
|---|---|---|---|---|
| 1 | `src/lib/PageNotFound.jsx` | 14 | `base44.auth.me()` | A |
| 2 | `src/pages/Bank.jsx` | 103 | `base44.auth.me()` | A |
| 3 | `src/pages/CashDrawer.jsx` | 255, 447 | `base44.auth.me()` ×2 | A |
| 4 | `src/pages/Customers.jsx` | 41, 102 | `base44.auth.me()` ×2 | A |
| 5 | `src/components/appointments/AppointmentForm.jsx` | 494, 543 | `base44.auth.me()` ×2 | A (modal — confirm it's mounted under `AuthProvider`, which it is, since everything renders inside `App.jsx`) |
| 6 | `src/components/cash-drawer/DepositModal.jsx` | 20 | `base44.auth.me()` | A |
| 7 | `src/components/payroll/AddAdjustmentModal.jsx` | 66 | `base44.auth.me()` | A |
| 8 | `src/components/inventory/ReceiveCreditModal.jsx` | 35 | `base44.auth.me()` | A |
| 9 | `src/components/customers/NewCustomerModal.jsx` | 10 | `base44.auth.me()` | A |
| 10 | `src/pages/InventoryList.jsx` | 240 | `base44.auth.me()` | A |
| 11 | `src/pages/LinesOfCredit.jsx` | 102 | `base44.auth.me()` | A |
| 12 | `src/pages/Payroll.jsx` | 126 | `base44.auth.me()` | A |
| 13 | `src/components/inventory/EditInventoryTransactionModal.jsx` | 153 | `base44.auth.me()` (in a `Promise.all`) | B — inside a parallel-fetch block; simplest as inline `supabase.auth.getUser()` unless the block is easy to hoist above |
| 14 | `src/pages/Reconcile.jsx` | 63, 254 | `base44.auth.me()` ×2 | A |
| 15 | `src/components/suppliers/SupplierPaymentModal.jsx` | 153 | `base44.auth.me()` | A |
| 16 | `src/pages/SupplierTx.jsx` | 382 | `base44.auth.me()` (in a `Promise.all`) | A or B, check surrounding context at execution time |
| 17 | `src/components/vehicles/NewVehicleModal.jsx` | 25 | `base44.auth.me()` | A |
| 18 | `src/pages/Vehicles.jsx` | 84 | `base44.auth.me()` | A |
| 19 | `src/pages/Suppliers.jsx` | 55 | `base44.auth.me()` | A |
| 20 | `src/pages/Taxes.jsx` | 78 | `base44.auth.me()` | A |
| 21 | `src/components/work-orders/TechTimeModal.jsx` | 161 | `base44.auth.me()` | A |
| 22 | `src/Layout.jsx` | 161 | `base44.auth.updateMe({ dark_mode })` | See 3.3 — rewritten to `updateEmployeePrefs({ dark_mode })` |
| 23 | `src/Layout.jsx` | 167-175 | `handleToggleOpenNewWindow` (whole function) | **DELETE** — confirmed dead, never wired to UI; field deprecated |
| 24 | `src/Layout.jsx` | 177-188 | `handleToggleWOCards` (whole function) | **DELETE** — confirmed dead, never wired to UI; field deprecated |
| 25 | `src/Layout.jsx` | 130 | `UserEntity.me()` (inside `fetchUserAndSettings`) | See 3.3 — the whole effect is removed; replaced by `useAuth()`'s `employee` |
| 26 | `src/pages/Admin.jsx` | 108 | `UserEntity.me()` | A |
| 27 | `src/components/work-orders/DocumentEditor.jsx` | 457 | `UserEntity.me()` | A |
| 28 | `src/pages/CreditInvoice.jsx` | 98 | `User.me()` | A — note this file *also* already uses `supabase.auth.getUser()` at line 324 for something else; consolidate to one source per the extended `AuthContext` |
| 29 | `src/pages/WorkOrders.jsx` | 209 | `User.me()` — result stored in `currentUser` state, passed as a prop to `WorkOrderList`/`WorkOrderTable`/`FindPartModal` | A — this single migration is what makes rows 23/24's field deprecation take effect everywhere downstream; no separate edits needed in those 3 files (confirmed, see Section 0) |
| 30 | `src/components/timerecords/TimeRecordsView.jsx` | 182 | `User.me()` — plus reads `currentUser.access_level` → becomes `employee.autopro_access_lvl`; `currentUser.User_name` → becomes `employee.full_name` (no separate field, per Section 0 #2); `currentUser.email`/`currentUser.full_name` → `employee.email`/`employee.full_name` | A |

**Representative Pattern A example** (`src/components/customers/NewCustomerModal.jsx:10`, simplest case):
```diff
- const user = await base44.auth.me();
+ const { user } = useAuth();  // hoisted to component top-level; call sites using `user` below stay the same shape
```
(Exact diff depends on whether `base44.auth.me()` is currently called inside a `useEffect`/handler vs. needed synchronously — `useAuth()` must be called at the component's top level per Rules of Hooks, so each of these 21 sites needs individual review of *where* the result is used, not a blind find-replace.)

**Representative Pattern B example** (`src/components/inventory/EditInventoryTransactionModal.jsx:153`):
```diff
- const [someData, currentUser] = await Promise.all([
-   someFetch(),
-   base44.auth.me(),
- ]);
+ const [someData, { data: { user: authUser } }] = await Promise.all([
+   someFetch(),
+   supabase.auth.getUser(),
+ ]);
+ const { data: employee } = await supabase.from('Employee').select('*').eq('mykadr_user_id', authUser.id).maybeSingle();
```
(Illustrative shape — exact surrounding code reviewed per-file at execution time, not assumed from this table alone.)

---

### 3.3 `src/lib/AuthContext.jsx` — the central change

**Current** (56-82, full file already read):
```js
export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [session, setSession] = useState(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoadingAuth, setIsLoadingAuth] = useState(true);
  // ... checkAuth() sets user/session/isAuthenticated from supabase.auth.getSession()
  // and supabase.auth.onAuthStateChange() ...
```

**Proposed addition** (exact shape pending Section 0 #1/#2 answers):
```js
const [employee, setEmployee] = useState(null);

// inside checkAuth(session), after setUser(session?.user || null):
if (session?.user?.id) {
  const { data } = await supabase
    .from('Employee')
    .select('*')
    .eq('mykadr_user_id', session.user.id)
    .maybeSingle();
  setEmployee(data || null);
} else {
  setEmployee(null);
}

// new function, replaces Layout.jsx's 3 separate base44.auth.updateMe() calls:
const updateEmployeePrefs = async (updates) => {
  if (!employee?.id) return;
  const { data, error } = await supabase
    .from('Employee')
    .update(updates)
    .eq('id', employee.id)
    .select()
    .single();
  if (!error) setEmployee(data);
  return { data, error };
};

// exposed in the context value:
return (
  <AuthContext.Provider value={{
    user, session, employee, isAuthenticated, isLoadingAuth,
    logout, navigateToLogin, updateEmployeePrefs
  }}>
```

**`Layout.jsx` changes, final (per resolved Section 0):**
```diff
+ const { employee, updateEmployeePrefs } = useAuth();
...
  const handleToggleDarkMode = async () => {
    const newDarkMode = !darkMode;
    setDarkMode(newDarkMode);
-   try {
-     await base44.auth.updateMe({ dark_mode: newDarkMode });
-   } catch (error) {
-     console.error("Failed to save dark mode preference", error);
-   }
+   const { error } = await updateEmployeePrefs({ dark_mode: newDarkMode });
+   if (error) console.error("Failed to save dark mode preference", error);
  };

- const handleToggleOpenNewWindow = async () => { ... };  // DELETE — dead code, field deprecated
- const handleToggleWOCards = async () => { ... };        // DELETE — dead code, field deprecated
```
The `fetchUserAndSettings` effect (lines 128-147) that currently calls `UserEntity.me()` to read the initial `dark_mode` value is removed entirely — `employee?.dark_mode` from `useAuth()` replaces it (the `SystemSettings`/training-flag portion of that same effect stays, per the out-of-scope note in Section 1 — only the user-fetching part is removed).

**Also in `Layout.jsx`** — the payroll-nav gate at line 281 and the 4 `OpenNewWindow` checks (lines 839/859/969 in `WorkOrders.jsx`, 1047 in `Layout.jsx` itself) read off whatever object is now sourced from `useAuth()`:
```diff
- if (user?.Paypro_user === true) {
+ if (employee?.paypro_user === true) {
```
The `OpenNewWindow` checks need no code change at all — they already use `?.` optional chaining and an explicit `=== false` comparison, so once the underlying object simply never has that field, they naturally take the "open in new window" branch (see Section 0's new finding).

---

### 3.4 `Employee` table schema change

Final column set, resolved:
```sql
ALTER TABLE public."Employee"
  ADD COLUMN dark_mode boolean DEFAULT false,
  ADD COLUMN paypro_user boolean DEFAULT false,
  ADD COLUMN autopro_access_lvl text,
  ADD COLUMN accts_pay_access boolean DEFAULT false;
```
**Status: all 4 columns already applied to the dev branch** (`dark_mode`/`paypro_user`/`autopro_access_lvl` added by the user directly; `accts_pay_access` added via the connector during this plan's finalization, once the AP-access-gate finding surfaced). Confirmed via `information_schema.columns` query against `sitihbdnuxifwibontcm`. **Still needs to be applied to production** as part of this phase's execution — not yet done there.

No columns needed for `wo_cards`, `OpenNewWindow`, `Initials`, or `avatar_url` — all four resolved to either deprecation or client-side derivation (see the field-census table above), not new schema.

---

### 3.5 One-time data migration (pending Section 0 #3)

If preserving existing values: for each of the 9 `Employee` rows with a `mykadr_user_id`, read the corresponding Base44 user's current `dark_mode`/`wo_cards`/`OpenNewWindow` (and `Paypro_user` if in scope) one final time and `UPDATE` the matching `Employee` row. At 9 rows this is small enough to do as a short manual/scripted pass rather than a full migration framework — exact mechanism (admin script vs. one-off SQL with values you read out of the Base44 admin UI) to be finalized once Section 0 #3 is answered.

---

## 4) Verification Plan

### Step-by-step

1. On the dev branch, confirm the `Employee` schema change applied (`list_tables` verbose, or `execute_sql` against `information_schema.columns`).
2. Log in as a real user in the dev-connected app; confirm `useAuth()`'s `employee` value populates correctly (matches the logged-in user's actual `Employee` row) — check via React DevTools or a temporary `console.log`.
3. Toggle dark mode, "open in new window," and WO cards one at a time; after each, confirm via the Supabase connector that the corresponding `Employee` row's column actually changed **in the dev branch**, not production (per the standing Phase 1 rule — writes must be confirmed to land in dev specifically).
4. Reload the page; confirm each preference persisted (re-read from `Employee` on the next session load, not just held in local component state).
5. Log in as the user identified in Section 0 #4 (if not backfilled) — confirm the app degrades gracefully (no crash, sensible defaults) when `employee` is `null`.
6. Spot-check 5+ of the 30 call sites across different modules (a modal, a page, `Layout.jsx` itself) — confirm each still resolves "current user" correctly and any downstream logic depending on it (e.g. payroll nav gating, WO cards toggle, TimeRecordsView's employee-name resolution) behaves identically to before.
7. Specifically for `Layout.jsx`'s expanded field census: log in as an admin user and confirm the admin-only menu section still shows; log in as (or simulate) a `lvl3_user` and confirm the full executive Accounting menu appears; simulate `accts_pay_access = true` (non-lvl3) and confirm the limited AP menu (Cash Drawer + Cash Flow only) appears instead; confirm the avatar shows derived initials correctly for a multi-word `full_name`.
8. Confirm the WorkPRO clock-in/clock-out flow (`checkClockStatus`, `handleClockToggle`) still works end-to-end after substituting `employee?.autopro_user_id`/`employee?.email` into the existing `workProProxy` calls — this is the one spot in this phase that touches Phase 4-adjacent code, so it needs its own explicit check, not just an assumption that "it compiles" means "it works."
9. Repo-wide grep for `base44.auth.` and `@/entities/User` — zero hits.
10. `npm run build` — clean.
11. Confirm `ProtectedRoute.jsx` deleted and nothing else references it (already confirmed zero importers before deletion).

### Checklist

- [x] Section 0 questions answered
- [x] `Employee` schema: `dark_mode`, `paypro_user`, `autopro_access_lvl` applied to dev (by user)
- [x] `Employee` schema: `accts_pay_access` applied to dev (via connector)
- [x] `Employee` schema (all 4 new columns) applied to production (via connector)
- [x] `AuthContext.jsx` extended with `employee` + `updateEmployeePrefs`
- [ ] One-time preference data migration (user doing manually — prerequisite for the *values* to be meaningful, not for the code to work)
- [x] All 35 call sites migrated (30 originally identified + 5 found during post-execution verification — see Appendix)
- [x] `Layout.jsx`: `fetchUserAndSettings`'s `UserEntity.me()` call removed, replaced by `employee` from context
- [x] `Layout.jsx`: `handleToggleDarkMode` rewritten to use `updateEmployeePrefs()`
- [x] `Layout.jsx`: `handleToggleOpenNewWindow`/`handleToggleWOCards` deleted (dead code, deprecated fields)
- [x] `Layout.jsx`: full field census applied — `role`→`admin`, `AcctsPayAccess`→`accts_pay_access`, `access_level`→`autopro_access_lvl`, WorkPRO lookups fed from `employee.autopro_user_id`/`employee.email`, `Initials` derived client-side, `avatar_url` dropped
- [x] `TimeRecordsView.jsx` field mapping applied (`access_level`→`autopro_access_lvl`, `User_name`→dropped in favor of `full_name`)
- [x] `Setup.jsx` field mapping applied (`access_level`→`autopro_access_lvl`, `role === 'admin'`→`admin === true`) — found and fixed during verification pass
- [x] `DocumentEditor.jsx`'s second, previously-missed `UserEntity.filter()` call (locked-by-user name resolution) fixed
- [x] `WorkOrderHistoryModal.jsx`'s `base44.entities.User.filter()` call fixed for consistency
- [ ] **Dark mode toggle manually verified end-to-end (UI → dev DB → reload → persists) — needs you**
- [ ] **Payroll nav gating manually verified (`paypro_user`) — needs you**
- [ ] **Admin menu, executive Accounting menu, and AP-only Accounting menu all manually verified per their respective field — needs you**
- [ ] **Avatar initials render correctly for a multi-word name — needs you**
- [ ] **WorkPRO clock-in/clock-out manually verified end-to-end — needs you**
- [ ] **Graceful handling confirmed for a session with no matching `Employee` row (the 1-of-9 casual employee case) — needs you**
- [x] `ProtectedRoute.jsx` deleted
- [x] Repo-wide grep: zero `base44.auth.*` / `@/entities/User` / `UserEntity` / `base44.entities.User` hits (multi-pattern sweep, confirmed clean)
- [x] `npm run build` succeeds (exit code 0)
- [x] `src/api/entities.js` re-confirmed fully dead (zero importers) — left in place, Phase 14's call

**Remaining before this phase is fully closed out:** the 6 bolded manual-check items above need a real login session in the dev-connected app — everything I can verify programmatically (code, build, repo-wide search, schema, migrated call sites) is done and clean.

---

## Appendix: Notes added during execution

- **The 30-site inventory in Section 3.2 was incomplete.** A post-execution repo-wide grep (done specifically to verify completeness, not assumed) found 5 more genuine "current user" sites the original research missed, all now fixed:
  - `src/pages/Setup.jsx` — `User.me()`, plus downstream `access_level`→`autopro_access_lvl` and `role === 'admin'`→`admin === true` field mappings (same pattern as `Layout.jsx`, not previously caught here)
  - `src/pages/WorkOrderView.jsx` — `User.me()`
  - `src/components/work-orders/DocumentEditor.jsx` — a *second*, different call: `UserEntity.filter({ email })` (not `.me()`) used to resolve the display name of *another* user who has a Work Order locked. This one broke when the `UserEntity` import was removed for the `.me()` fix, since it was missed in the same pass — caught and fixed by re-running the repo-wide verification grep before considering the file done, not left broken.
  - `src/components/work-orders/history/WorkOrderHistoryModal.jsx` — `base44.entities.User.filter({ email })`, same "resolve another user's name" pattern, fixed for consistency with the `DocumentEditor.jsx` case even though it's technically `base44.entities.*` rather than `base44.auth.*` scope.
  - Two commented-out (`// base44.entities.User.filter`) references in `WorkOrderHeaderInfo.jsx`/`WorkOrderViewHeaderInfo.jsx` — left as-is, not live code.
  - **Lesson for future phases:** a single grep pattern (`base44.auth.me()`) undersold this phase's true scope twice now — once in initial planning (missed `UserEntity`/`User.me()` variants) and again after "completing" the 30-site list (missed `Setup.jsx`/`WorkOrderView.jsx`/the `.filter()` variant entirely). Always run a final, broad, multi-pattern verification grep after believing a migration is done, not just before starting — this is what caught all 5 additional sites here.
- **Minimal-diff pattern used throughout:** for every file with a `useEffect`-based `fetchUser`/`loadCurrentUser` pattern, replaced the async base44 call with `setCurrentUser(employee)` sourced from `useAuth()`, keeping the existing local state variable name and all its downstream field usages intact wherever the field names carried over unchanged (`email`, `full_name`, `id`). This kept each diff small and auditable rather than restructuring every file's data flow.
- **Known, accepted semantic shift:** several files use `currentUser.id`/`user.id` as a generic `created_by_id` audit-trail value (e.g. `Bank.jsx`, `CashDrawer.jsx`). Since `employee.id` is `Employee`'s own bigint primary key rather than the legacy Base44 user ID previously stored in these fields, newly-created audit records will carry a different ID *format* than historical ones for the same action type. This is a deliberate, low-risk choice (still a stable, unique per-user identifier) rather than an oversight — flagging it here so it's on record. The one place this distinction *did* matter functionally (`Layout.jsx`'s WorkPRO `autopro_user_id`-keyed lookups) was handled with the correct legacy-compatible field (`employee.autopro_user_id`), not the generic substitution.
- **`Layout.jsx`'s `checkClockStatus` effect now does a redundant Employee lookup** (fetches basically the same row `useAuth()` already has, just via `autopro_user_id`/`email` instead of `mykadr_user_id`, through the still-base44-hosted `workProProxy`). Left as-is deliberately, per the plan's Phase 4 boundary — simplifying this is Phase 4's job once `workProProxy` itself gets replaced, not this phase's.
- **`src/api/entities.js` reconfirmed fully dead** (zero importers, checked via grep) — still not deleted, per plan (out of scope, likely Phase 14).
- All verification steps requiring a live browser session (login, toggling dark mode, checking each access-gated menu, WorkPRO clock-in/out) could not be performed from this session — handed off to the user, see checklist below.
