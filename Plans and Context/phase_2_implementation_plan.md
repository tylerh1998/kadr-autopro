# Phase 2 Implementation Plan — Module Scaffolding, Auth Swap, Layout Disposition & Navigation

**Parent:** `master_blueprint.md` Phase 2 · **Created 2026-08-18** · **Status: Code-complete, uncommitted — pending user push + live verification at `test.kensauto.ca`**

**Format: single-phase** (no sub-phases — see rationale below).

> **This is a LIVE document.** Section 5 is the working area, updated during execution. Do not wipe prior content — append and adjust.

---

## 0) Notes, Assumptions & One Correction

No blocking open questions — the blueprint plus direct research against the actual PayPRO source (`kadr-paypro`, a sibling repo, not a subfolder of this one) fully specify this phase. Two things worth stating explicitly before execution:

1. **Corrected from the blueprint's "six verbs":** the actual base44 entity API surface used across PayPRO's 44 components is **seven** verbs — `list`, `filter`, `get`, `create`, `update`, `delete`, **and `bulkCreate`** (confirmed via direct grep of every `<Entity>.<verb>(` call site in `kadr-paypro/src`; `bulkCreate` is used at least once, in `BatchPaychequeProcessor.jsx:146`, and is needed again in Phase 6). The shim must implement all seven.
2. **Stub-page scope is settled by the blueprint's own Phase 2 "Impacted" list**, which names `src/pages/paypro/` (10 pages) as a Phase 2 deliverable — not a Phase 3–8 one. This plan therefore creates all 10 page files now, as minimal routed skeletons (correct wrapper, correct dark-mode classes, a placeholder body), with real content landing per-page in Phases 3–8. This gives a fully clickable Payroll dropdown from the end of this phase onward rather than a partially-dead one.
3. **This work lands on `development` / `test.kensauto.ca` only** (master_context.md's live-verification protocol; `main` is never touched without an explicit ask — workflow constraint 31). AutoPRO's `development` branch has not yet been merged to `main`, so none of this phase's nav/routing changes reach real production traffic until a separate, explicit merge decision — not part of this phase.

---

## 1) Phase Scope & Objectives

### In scope

Build the **plumbing** that Phases 3–8 build content on top of: routing skeleton for all 10 `/paypro/*` pages, deletion (by omission — see below) of PayPRO's base44 auth/layout apparatus, the `payrollEntities.js` shim, and the Payroll nav dropdown + More modal.

**Nothing in this phase touches a database, an edge function, or business logic.** It is the one phase in the whole engagement with zero DB risk and zero GL/tax exposure.

### Objectives

| # | Objective |
|---|---|
| O-1 | `pages.config.js` gains 10 new `paypro/*` keys; `App.jsx` needs **zero** changes (its route-generation loop is already generic — confirmed by direct comparison) |
| O-2 | All 10 `/paypro/*` pages render as minimal, correctly-wrapped skeletons inside AutoPRO's existing `Layout.jsx` shell — no PayPRO-specific chrome |
| O-3 | `payrollEntities.js` implements all 7 base44 verbs (`list`/`filter`/`get`/`create`/`update`/`delete`/`bulkCreate`) over `supabase.from()`, so every future page/component port is an import-path swap only, not a rewrite |
| O-4 | Payroll nav becomes a dropdown (Employees / Time Records / Payroll / Pay Stubs + a "More…" trigger), gated on `employee?.paypro_user === true`, preserving today's redirect-to-WorkPRO behavior for everyone else |
| O-5 | `PayrollMoreModal.jsx` opens with exactly 5 options (Remittances, T4s, Reports, Trends, Setup), built on the existing `ReportModal.jsx` action-dispatch pattern |
| O-6 | Zero PayPRO/base44 auth code is ported. AutoPRO's existing `useAuth()` is the only auth path under `/paypro/*` |
| O-7 | PayPRO's global `<style>` block (R14) is never introduced — not ported, not referenced, not approximated |

### Explicitly NOT in scope

- Any page or component's real business logic (Employees tabs, payroll calc, pay stub lifecycle, remittances, T4s, reports, trends) — Phases 3–8
- Any Supabase migration, RLS change, or new DB object — Phase 1 already delivered everything this phase needs
- Any new edge function — the first `paypro-*` function isn't needed until Phase 3 (`paypro-uploadEmployeeFile`)
- Employee file migration, tax math, GL posting — later phases
- Deleting anything from `kadr-autopro` — **there is nothing to delete.** PayPRO's `Layout.jsx`/`AuthContext.jsx`/etc. exist only in the separate `kadr-paypro` repo and have never been copied into this one. "Delete" in the blueprint means *don't port these 9 files when porting everything else* — see §3 Step 5

### Why single-phase, not 2A/2B/2C

Confirmed via direct research: Phase 2 touches roughly 6 files plus 10 new stub-page files and one new shim module, has no natural DB/rollback boundary the way Phase 1 did across two Supabase projects, and the blueprint's own time estimate (§4) sizes it at 1 day versus 1.5–2.5 days for each content-bearing phase. There's no sub-scope here worth isolating for independent verification or rollback.

---

## 2) Lessons Learned & Context

Pulled from `master_blueprint.md` §7 and `master_context.md`, filtered to what actually bites this phase.

| # | Constraint | How it applies here |
|---|---|---|
| **Blueprint L7** | **PayPRO's global `<style>` block must never be reintroduced.** Redefines `--primary` as raw hex against AutoPRO's HSL-triplet tokens, breaking `hsl(var(--primary))` app-wide; unscoped `!important` checkbox rules go invisible in dark mode | This phase is *the* Layout-disposal phase — the single point where this block either does or doesn't leak in. Confirmed via direct read of PayPRO's `Layout.jsx`: the block is real, present, and exactly as quoted in the blueprint. It is simply never copied |
| **Blueprint L6** | **The shim owns id generation and audit fields.** No call site should ever hand-write `id`/`created_date`/`created_by`/`created_by_id`/`updated_date` | Directly this phase's job — `payrollEntities.js` is the shim being built |
| **Blueprint L27** | **Dark mode is first-class.** AutoPRO's light-mode `--background` is a deliberate medium gray-blue, not white | The 10 stub pages created this phase must ship with `dark:` variants from day one, not as a retrofit later |
| **Blueprint L28** | **`cn()`/tailwind-merge silently drops conflicting utilities** — a custom `relative` on a `DialogContent` strips its `fixed` and positions the modal off-screen with zero console error | Directly relevant to `PayrollMoreModal.jsx`, a new `Dialog`-based component built this phase |
| **master_context.md §4.11** | **A missing `Employee` row for a valid Auth session is expected, not exceptional** | The stub pages' auth wiring (and the nav gate itself, `employee?.paypro_user === true`) must not assume `employee` is populated |
| **master_context.md — live verification protocol** | Verify only at `test.kensauto.ca`, only after commit + push (+ deploy, if a function changed — none do this phase). `localhost` is not viable (TLS + same-origin auth) | No functions to deploy this phase; still gated on commit+push before any live check |
| **Workflow constraints 30–32** (blueprint §7) | `git push` doesn't work from an agent session (commit locally, you push) · `main` never touched without an explicit ask · production DB writes need re-confirmation at the tool prompt (**not applicable this phase — no DB writes**) | Standard operating constraints, unchanged from Phase 1 |
| **Phase 1 lesson (new, blueprint §7 #35)** | `format()`'s `%L` is a string literal, `%I` is an identifier — mixing them up breaks DDL | Not applicable — no SQL this phase. Noted only because it's the most recent hard-won lesson; nothing here should need it |

---

## 3) Detailed Execution Plan

**Target repo:** `kadr-autopro` only. `kadr-paypro` is read-only reference source for this entire engagement — never modified, never has code copied *from* it verbatim without adaptation (import paths, entity calls, and the wrapper markup all change).

### Step 1 — `payrollEntities.js` shim

**New file:** `src/components/paypro/lib/payrollEntities.js`

Implements all 7 verbs confirmed in use across `kadr-paypro/src` (§0 correction #1), for all 10 entities:

| Entity name (call-site name, unchanged) | Table |
|---|---|
| `Employee` | `PayPro_Employee` |
| `PayStub` | `PayPro_PayStub` |
| `Remittance` | `PayPro_Remittance` |
| `EmployeeDeduction` | `PayPro_EmployeeDeduction` |
| `EmployeePayType` | `PayPro_EmployeePayType` |
| `EmployeeFile` | `PayPro_EmployeeFile` |
| `TrainingRecord` | `PayPro_TrainingRecord` |
| `ValidPayType` | `PayPro_ValidPayType` |
| `TaxYearConstant` | `PayPro_TaxYearConstant` |
| `PayrollSetting` | `PayPro_PayrollSetting` |

Verb behavior (each confirmed against a real call site):

- **`list(sortString?)`** — `PayStub.list('-paycheque_number')` (`PayStubs.jsx:65`), `Employee.list()` with no args (`Employees.jsx:28`). Translate a leading `-` to `.order(col, {ascending:false})`, otherwise ascending. No-arg form returns unsorted (or a stable default — confirm against volume; these are ≤112-row tables, no pagination edge case in Phase 1's snapshot, but honor the paginated-fetch requirement below regardless since Phase 11's re-import could grow it).
- **`filter(queryObject)`** — e.g. `TaxYearConstant.filter({ year: currentYear })` (`EditEmployee.jsx:95`). Translate object keys to `.eq()` chains.
- **`get(id)`** — `Employee.get(id)` (`EditEmployee.jsx:66`). Single-row fetch by `id`, throws/rejects if not found (call sites `try/catch` around it).
- **`create(data)`** — `Employee.create(employee)` (`EditEmployee.jsx:142`). Shim generates the 24-char lowercase-hex `id` (`crypto.randomUUID().replace(/-/g,'').substring(0,24)`, master_context.md's documented convention) plus `created_date`/`created_by`/`created_by_id` from the current AutoPRO session, before insert. Caller never supplies these.
- **`update(id, data)`** — `Employee.update(employeeId, employee)` (`EditEmployee.jsx:140`). Shim sets `updated_date`; **no `updated_by` field exists on any of these 10 tables** (confirmed against Phase 1's column introspection) — don't invent one.
- **`delete(id)`** — `EmployeeFile.delete(id)` (`OtherTab.jsx:69`), `ValidPayType.delete(id)` (`ValidPayTypeManagerModal.jsx:75`).
- **`bulkCreate(arrayOfData)`** — `PayStub.bulkCreate(...)` (`BatchPaychequeProcessor.jsx:146`). Same id/audit-field generation as `create`, applied per-row, single batched insert.

Also centralize, per blueprint's own spec (already correct, just confirming no changes needed):
- **Paginated `fetchAllRows` helper** for the PostgREST 10k-row cap (master_context.md §3) — wire every `list`/`filter` through it even though today's row counts (≤112) don't need it; Phase 11's re-import is the reason this can't be skipped as "premature."
- **jsonb passthrough** — `income_breakdown`, `additional_deductions`, `pay_stub_ids`, `federal_tax_brackets`, `provincial_tax_brackets_ab` pass through untouched. Never `JSON.stringify()` before a write.

### Step 2 — Routing skeleton

**Modified:** `src/pages.config.js` — add 10 keys:

```
paypro/Employees      → src/pages/paypro/Employees.jsx
paypro/EditEmployee   → src/pages/paypro/EditEmployee.jsx
paypro/TimeRecords    → src/pages/paypro/TimeRecords.jsx
paypro/Payroll        → src/pages/paypro/Payroll.jsx
paypro/PayStubs       → src/pages/paypro/PayStubs.jsx
paypro/Remittances    → src/pages/paypro/Remittances.jsx
paypro/T4s            → src/pages/paypro/T4s.jsx
paypro/Reports        → src/pages/paypro/Reports.jsx
paypro/Trends         → src/pages/paypro/Trends.jsx
paypro/Setup          → src/pages/paypro/Setup.jsx
```

**Confirmed no `App.jsx` change needed** — its `Object.entries(Pages).map(([path, Page]) => <Route path={`/${path}`} .../>)` loop is already generic (direct comparison, both files use this exact pattern).

**New files:** 10 minimal skeleton pages under `src/pages/paypro/`. Each:
- Wrapped in AutoPRO's page-canvas convention (not PayPRO's `p-6 space-y-6 bg-slate-50 min-h-screen` — that migrates per-page in Phases 3–8 alongside real content, with `dark:` variants added at that point; the Phase 2 skeleton uses AutoPRO's own default page padding/background so there's nothing wrong to later "fix")
- Renders a simple "This page's content ships in Phase N" placeholder (N per the blueprint's phase table — e.g. Employees.jsx says Phase 3, TimeRecords.jsx says Phase 4, etc.) so a stray click during the build window is self-explanatory rather than a blank screen
- No entity calls, no PayPRO imports — these are genuinely empty until their phase

`EditEmployee` is routed but not linked from any nav — it's reached via `Employees.jsx`'s row-click once Phase 3 builds that; the stub just needs to exist so the route doesn't 404 later by surprise.

### Step 3 — Auth

**Nothing to build.** `/paypro/*` pages consume AutoPRO's existing `useAuth()` exactly like every other AutoPRO page — same `Employee` object, same AAL2/session handling, same "missing Employee row is expected" degradation (§4.11). Confirmed via direct read of PayPRO's `AuthContext.jsx`/`ProtectedRoute.jsx`: there is no PayPRO-specific auth nuance (no custom token refresh, no role logic beyond what AutoPRO already has) worth preserving — it's a base44 SDK handshake wrapper with zero business logic.

### Step 4 — Layout.jsx nav conversion

**Modified:** `src/Layout.jsx` (currently 1,067 lines).

- **Current state** (confirmed by direct read): the Payroll nav item is a flat entry at ~line 541–546 (`{ title: "Payroll", icon: UserCheck, url: createPageUrl("Payroll"), activePaths: ["/Payroll", "/WorkPro"] }`), used at two render sites (~739, ~951) via `if (item.title === 'Payroll') handlePayrollClick(e)`. `handlePayrollClick` (~line 245) redirects to `https://workpro.kensauto.ca/TimeRecords` unless `employee?.paypro_user === true`.
- **First task of this step: inspect whether Layout.jsx already has any dropdown-style nav item to reuse the pattern from.** If yes, match it exactly for visual/behavioral consistency. If no existing pattern exists, build via the Radix `DropdownMenu` primitive already present in `components/ui` (same primitive used elsewhere in the app, e.g. the user-avatar menu) — do not introduce a new UI library or pattern.
- **New dropdown structure**, replacing the flat item:
  ```
  Payroll ▾                              (rendered only when employee?.paypro_user === true;
  ├── Employees        → /paypro/Employees   everyone else keeps today's exact behavior —
  ├── Time Records      → /paypro/TimeRecords  handlePayrollClick's redirect to WorkPRO,
  ├── Payroll           → /paypro/Payroll      completely unchanged)
  ├── Pay Stubs         → /paypro/PayStubs
  └── More…             → opens PayrollMoreModal
  ```
- `activePaths` extends to match any `/paypro/*` path (so the nav highlights correctly regardless of which sub-page is open).
- **AutoPRO's existing stopgap `/Payroll` route (key `"Payroll"`, the one Phase 10 later deletes) is untouched and keeps working** — it's a different `pages.config.js` key (`"Payroll"` vs `"paypro/Payroll"`), no collision.

### Step 5 — `PayrollMoreModal.jsx`

**New file:** `src/components/paypro/PayrollMoreModal.jsx`.

Built directly on `ReportModal.jsx`'s confirmed pattern (`src/components/reports/ReportModal.jsx`, 323 lines): a `getReportOptions()`-equivalent function returning an array of `{ name, description, icon, path }`, rendered as clickable cards inside a `Dialog`, using the same `iconMap`-style string→Lucide-component translation already established there.

5 options, all navigating via `createPageUrl`:

| Name | Path |
|---|---|
| Remittances | `paypro/Remittances` |
| T4s | `paypro/T4s` |
| Reports | `paypro/Reports` |
| Trends | `paypro/Trends` |
| Setup | `paypro/Setup` |

### Step 6 — What is deliberately never ported (not a deletion — these files never exist in `kadr-autopro`)

| PayPRO file (in `kadr-paypro`, untouched) | Disposition |
|---|---|
| `src/Layout.jsx` | Superseded by AutoPRO's own `Layout.jsx` (Step 4) — sidebar shell, `otherApps`, `SidebarFooter`, base44 logo `SidebarHeader`, and the R14 `<style>` block all simply never get copied |
| `src/lib/AuthContext.jsx` | Superseded by AutoPRO's `useAuth()` |
| `src/components/ProtectedRoute.jsx` | Superseded by AutoPRO's existing route/session gating |
| `src/components/UserNotRegisteredError.jsx` | No AutoPRO equivalent needed — its one caller (`ProtectedRoute`) isn't ported either |
| `src/api/base44Client.js`, `src/api/entities.js`, `src/api/integrations.js` | Superseded entirely by `payrollEntities.js` (Step 1) |
| `src/lib/app-params.js` | Base44-token-parsing utility, no AutoPRO equivalent needed |
| `src/lib/NavigationTracker.jsx` | Base44-specific navigation analytics hook, not needed |
| `src/lib/PageNotFound.jsx` | AutoPRO has its own 404 handling |
| `src/lib/VisualEditAgent.jsx` | A base44 dev-tooling artifact (confirmed the largest deleted file, 21KB) — no AutoPRO relevance whatsoever |
| `src/pages/Home.jsx` | PayPRO's own landing page — AutoPRO's existing dashboard/home is what `/paypro/*` users land on when not inside the module |

---

## 4) Verification Plan

Live-verify at `test.kensauto.ca` only, after commit + push (master_context.md's live-verification protocol). No edge function changes this phase, so no `deploy_edge_function` step.

- [ ] All 10 `/paypro/*` routes resolve (no 404) for a `paypro_user: true`, AAL2 session
- [ ] Each stub page renders its "ships in Phase N" placeholder correctly, in **both light and dark mode**
- [ ] Payroll nav renders as a dropdown with exactly 4 direct links + "More…", only for `paypro_user: true` sessions
- [ ] A session with `paypro_user` false/null: **no** Payroll dropdown appears; the existing WorkPRO-redirect behavior on a stray click is unchanged (confirm `handlePayrollClick`'s logic wasn't altered for this case)
- [ ] `PayrollMoreModal` opens with exactly 5 options (Remittances/T4s/Reports/Trends/Setup); each navigates to the correct `/paypro/*` route and closes the modal
- [ ] `activePaths` correctly highlights the Payroll nav item while on any `/paypro/*` page
- [ ] **No PayPRO `<style>` block anywhere** — spot-check a checkbox in Work Orders, Inventory, and Accounting in both light and dark mode; all visually unchanged from before this phase
- [ ] AutoPRO's existing stopgap `/Payroll` page (key `"Payroll"`) still loads and works exactly as before — no key collision with `paypro/Payroll`
- [ ] `grep -r "base44" src/` and `grep -r "@base44" src/` both return **zero** new matches introduced by this phase (AutoPRO's own prior base44 deprecation already returns zero; this phase must not regress that)
- [ ] `payrollEntities.js` smoke-tested against at least one real read (`PayPro_Employee.list()`-equivalent) from a `paypro_user:true` AAL2 session — confirms the shim's query construction doesn't break Phase 1's already-proven RLS gate (expect 11 rows); and from a non-gated session (expect 0 rows, no error)
- [ ] `git status` confirms none of the 9 Step-6 files were copied into `kadr-autopro/src`

---

## 5) Phase Results and Final Context

*(populated during execution — append, never overwrite)*

### 5.1 Execution Log

| Step | Started | Completed | Notes |
|---|---|---|---|
| 1 — shim | 2026-08-18 | 2026-08-18 | `src/components/paypro/lib/payrollEntities.js` — all 7 verbs, all 10 entities. Verified against live dev schema (`sitihbdnuxifwibontcm`) via `list_tables`: all 10 `PayPro_*` tables exist with expected columns, row counts match plan's own citations (e.g. `PayPro_Employee` = 11 rows). |
| 2 — routing skeleton | 2026-08-18 | 2026-08-18 | 10 keys added to `pages.config.js`; 10 stub pages under `src/pages/paypro/`, sharing a new `src/components/paypro/PayrollPagePlaceholder.jsx` (not a PayPRO import — a Phase-2-local convenience component to avoid repeating identical markup 10×). No `App.jsx` change needed, confirmed. |
| 3 — auth | 2026-08-18 | 2026-08-18 | Nothing to build, confirmed — stub pages use no auth calls of their own. |
| 4 — Layout nav | 2026-08-18 | 2026-08-18 | See §5.3 — an existing `dropdown`-style nav pattern was found and reused exactly (see deviation below). |
| 5 — More modal | 2026-08-18 | 2026-08-18 | `src/components/paypro/PayrollMoreModal.jsx`, built on `ReportModal.jsx`'s card pattern (simplified — no sub-report state machine needed since all 5 options just navigate). |
| 6 — non-port confirmation | 2026-08-18 | 2026-08-18 | See §5.3 — two pre-existing, unrelated files share names with PayPRO's Step-6 list; confirmed neither was touched or introduced by this phase. |

### 5.2 Deviations from Plan

1. **Payroll's flat-vs-dropdown nav item built as a plain ternary, not an IIFE.** The plan called out inspecting for an existing dropdown pattern first (§3 Step 4) — one was found: `Accounting`'s nav entry already does exactly this (flat item vs. `dropdown` array, gated on `employee` fields, via an IIFE returning one of three shapes). Payroll only has two shapes (paypro_user true/false), so a plain `employee?.paypro_user === true ? {...} : {...}` ternary was used instead of `Accounting`'s three-way IIFE — same pattern, simpler because there are fewer branches. Zero changes were needed to either the desktop or mobile render loops (both already branch generically on `item.dropdown`).
2. **`activePaths` uses a single `"/paypro/"` prefix entry, not a 10-path list.** The plan's own sketch (§3 Step 4) showed the dropdown but didn't literally enumerate `activePaths`; since every stub page lives under `/paypro/*` and the existing `isActive` check is `location.pathname.startsWith(path)`, one entry (`"/paypro/"`) covers all 10 routes and any future ones added in Phases 3–8 with no further edits needed.
3. **Audit-field creator lookup convention chosen explicitly (plan left it unspecified).** The plan says the shim generates `created_by`/`created_by_id` "from the current AutoPRO session" without saying how, since the shim is a plain module with no React context access. Implemented as: `supabase.auth.getUser()` → look up `Employee.autopro_user_id`/`Employee.email` by `mykadr_user_id`, cached for the module's lifetime. This matches the app's own dominant convention for these two fields (`employee?.email` / `employee?.autopro_user_id`, seen in `Layout.jsx`, `Customers.jsx`, `DocumentEditor.jsx`, `GlobalClockInModal.jsx`, `AppointmentForm.jsx`, `NewVehicleModal.jsx`) rather than the less-common `currentUser?.id` variant used elsewhere.

### 5.3 Unexpected Learnings

1. **Two of the Step-6 "never ported" filenames already exist in `kadr-autopro`, pre-dating this phase — false alarm, not a violation.** `src/components/UserNotRegisteredError.jsx` and `src/lib/app-params.js` both exist in this repo already (git history back to at least 2026-08-05). These are **not** copies of PayPRO's files — AutoPRO had its own, separate base44-era scaffolding that happened to use the same filenames (both apps were originally generated from the same base44 project template). `UserNotRegisteredError.jsx` is confirmed dead code (zero importers). `app-params.js` is still imported by `DocumentEditor.jsx` and is unrelated to this phase. `git status` after this phase's work shows only `src/components/paypro/`, `src/pages/paypro/`, and edits to `Layout.jsx`/`pages.config.js` — confirmed none of the real 9 Step-6 files were added.
2. **`grep -r "base44" src/` has 6 pre-existing hits, all unrelated to the actual `@base44/sdk` package** (`@no-reply.base44.com` email-domain string checks in 4 files, one `base44.app` external link in `Layout.jsx`, and `app-params.js`'s own internal `base44_`-prefixed localStorage key naming) — confirmed identical before and after this phase's changes via `git stash`. One comment in the new shim originally used the word "base44" descriptively; reworded to keep this phase's own diff at zero new matches, even though it wasn't a real risk.
3. **Live UI verification could not be completed this session.** master_context.md's live-verification protocol requires commit + push to `development` before testing at `test.kensauto.ca` (localhost can't complete the TLS + same-origin auth flow — confirmed directly: the dev server runs HTTPS-only via `basicSsl()`, and the in-session browser tool rejects the self-signed cert). Per standing instruction, this session does not commit or push — the user does that via GitHub Desktop. **Verification checklist below is therefore unchecked**, pending the user's push and a manual (or follow-up-session) pass at `test.kensauto.ca` with a real `paypro_user: true`, AAL2 session. Everything checkable without a live authenticated session was checked: `eslint` and `tsc` on every touched/new file show zero new issues versus the pre-existing baseline (confirmed via `git stash`); the dropdown nav pattern is a direct reuse of already-shipped, working code (`Accounting`'s nav entry), not new render logic; the shim's table/column assumptions were verified directly against the live dev Supabase schema.

### 5.4 Handoff Context to Phase 3

- Phase 2 is code-complete on `development` (uncommitted — user pushes manually). Once pushed and live-verified at `test.kensauto.ca` per §4's checklist, Phase 3 (`paypro/Employees`, `paypro/EditEmployee`, `paypro/Setup` + employee file storage bucket) can begin.
- `payrollEntities.js` is ready for Phase 3's first real call sites (`Employee.list()`, `Employee.get(id)`, `Employee.create()`, `Employee.update()`, `TaxYearConstant.filter()`) — import-path swap only, per O-3.
- The 3 Phase-3-owned stub pages (`Employees.jsx`, `EditEmployee.jsx`, `Setup.jsx`) currently render `PayrollPagePlaceholder` — Phase 3 replaces the body of each with real content, keeping the existing route/wrapper.
- Nothing in Phase 2 touched a database object, RLS policy, or edge function — Phase 3 is free to design its Storage bucket (`kadr-employee-files`) and edge functions (`paypro-uploadEmployeeFile`, `paypro-viewEmployeeFile`) without any Phase 2 dependency beyond the shim and routes already in place.
