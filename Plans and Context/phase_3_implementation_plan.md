# Phase 3 Implementation Plan — Employees, Setup, Pay Types & Employee Files

**Parent:** `master_blueprint.md` Phase 3 · **Created 2026-08-18** · **Status: Approved — ready to execute**

**Format: multi-phase (3A / 3B / 3C)** — see rationale in §1.

> **This is a LIVE document.** §3's sub-phase sections and §4 are the working area, updated during execution. Do not wipe prior content — append and adjust.

---

## 0) Notes, Open Questions & Clarifications

### 0.1 Decisions taken (resolved 2026-08-18, before execution)

**D1 — `employee.alerts` field: add the column, port the feature.** PayPRO's `OtherTab.jsx` reads/writes `Employee.alerts` (a rich-text field rendered as "a purple alert box when processing this employee's paycheque"). The live `PayPro_Employee` table had no `alerts` column — never part of the CSV import, and `master_blueprint.md`'s Phase 3 scope text didn't mention it. **Confirmed via the base44 entity schema (`base44/entities/Employee.jsonc`) that this is a real, declared field** — `"alerts": { "type": "string", "description": "Important short reminders or alerts for payroll processing (rich text)" }` — not dead code. Its absence from the import is almost certainly the same failure mode as the 15 mis-typed columns Phase 1 found: sparse/empty data at export time hiding a real field. **Decision: 3C adds `alerts text` via migration and ports the feature faithfully**, so Phase 11's final re-import has a real column to land into rather than silently losing any live base44 data.

**D2 — Tax-bracket jsonb arrays: port `ConstantEditor.jsx` as-is, no bracket UI.** `master_blueprint.md`'s Phase 3 text says Setup edits the two jsonb bracket arrays, but the actual source `ConstantEditor.jsx` has no fields for either — the existing 2026 row got its bracket data some other way (direct DB write or the original import), not through this UI. **Decision: port as-is in 3C.** Brackets change once a year and `TaxCalculator.jsx` (Phase 5) is the only real consumer — a one-off migration/SQL update when 2027 constants are needed is a fine interim path. Revisit if Phase 5 turns up a real need for an in-app editor.

**D3 — Employee file migration: infrastructure only in 3B, real-file migration deferred.** All 27 `PayPro_EmployeeFile` rows currently point at live `base44.app` URLs. **Decision: 3B builds the bucket, RLS, and both edge functions, but does not move the 27 existing files.** Those rows keep pointing at base44 (still live until Phase 11) until a later, separately-approved pass actually migrates them. This means Other Tab's file list will show real *rows* with working *upload-from-here-on* behavior, but existing files won't preview through the new `paypro-viewEmployeeFile` path until that later migration runs — noted in 3B's verification plan and carried into Handoff Context below so it isn't lost before Phase 8.5's parallel run.

### 0.2 Clarifications (not questions — stating so nothing here reads as an oversight)

- **`paypro-uploadEmployeeFile` / `paypro-viewEmployeeFile` deliberately don't follow the `autopro-*` naming convention.** This is `master_blueprint.md` decision **S1**, already approved and written into `master_context.md` §4 as a standing exception for the whole PayPRO module — not a mistake.
- **`react-quill`, `sonner`, and `@tanstack/react-query` are already dependencies of `kadr-autopro`** (`^2.0.0`, `^2.0.1`, `^5.84.1` respectively, confirmed in `package.json`) — no `npm install` needed for anything in this phase, consistent with your no-install preference.
- **One small deliberate deviation from a byte-for-byt port:** PayPRO's `EmployeeList.jsx` uses `sonner`'s `toast()` for the "copy email to clipboard" action. `kadr-autopro` already mounts a *different* toaster (`@/components/ui/toaster`, shadcn's `useToast()` hook) in `App.jsx` — `sonner`'s own `<Toaster/>` isn't mounted anywhere. Rather than mount a second, parallel toast system for one call site, 3A swaps that one call to the app's existing `useToast()`.
- **The WorkPRO API key field in `Setup.jsx` is deliberately dropped, not ported.** It's a live instance of `master_blueprint.md` lesson 15 ("secrets do not belong in data tables"), and the key row itself is already gone from `PayPro_PayrollSetting` (confirmed — only `period_close_date` remains; the key was the dead/superseded credential from decision C3). Porting a UI to re-populate a secret into a plaintext column would be reintroducing a flagged anti-pattern for a credential that isn't even live. Not raised as a question because there's no real tradeoff here.
- **`employee_db_id` (the additive Phase-1 link to AutoPRO's own `Employee` table) is out of scope for Phase 3.** Its current values (checked live) are obvious placeholders (`"9999999"`, `"888888888"`, etc.), not real links — but per lesson 1 it's additive and participates in no join, so this doesn't block anything this phase touches. Not fixed here; flag if a later phase needs real linkage.

---

## 1) Phase Scope & Objectives

### In scope

Port PayPRO's employee record (5 tabs), the Employees list + pay-type manager, and the Setup page — all 3 pages `master_blueprint.md` names for this phase (`paypro/Employees`, `paypro/EditEmployee`, `paypro/Setup`) go from placeholder stub to real content. Stand up the private employee-file storage infrastructure (real-file migration deferred per D3).

### Objectives

| # | Objective |
|---|---|
| O-1 | `Employees.jsx` lists all `PayPro_Employee` rows with search, matching source functionality, using AutoPRO's page-canvas/dark-mode conventions |
| O-2 | `EditEmployee.jsx` + its 5 tabs (General/Pay/Deductions/Training/Other) fully round-trip through `payrollEntities.js` — create, read, update — for `Employee`, `EmployeePayType`, `ValidPayType`, `EmployeeDeduction`, `TrainingRecord` |
| O-3 | `ValidPayTypeManagerModal.jsx` ported, reachable from the Employees page |
| O-4 | A private `kadr-employee-files` Storage bucket exists with zero direct-client policies (service-role only), mirroring the `CustomerPortalStatement`-style deny-all-except-service-role convention already used elsewhere in this codebase |
| O-5 | `paypro-uploadEmployeeFile` and `paypro-viewEmployeeFile` edge functions exist, deployed to dev, and are the *only* path in or out of that bucket |
| O-6 | New uploads from this point forward land in the new bucket correctly (the 27 pre-existing files stay on base44 until a later, separately-approved migration pass — D3) |
| O-7 | `Setup.jsx` + `ConstantEditor.jsx` ported for `PayPro_TaxYearConstant`/`PayPro_PayrollSetting`, minus the dropped WorkPRO-API-key field |
| O-8 | Every ported page/modal ships dark-mode classes from the start (lesson 27) — no `bg-slate-50 min-h-screen` light-only wrappers carried over |
| O-9 | Zero new base44 references introduced; `payrollEntities.js` is the only entity access path |
| O-10 | `PayPro_Employee.alerts` column added and Other Tab's rich-text Alerts editor ported (D1) |

### Explicitly NOT in scope

- Time Records (Phase 4), Payroll calculation/paycheque creation (Phase 5), Pay Stubs/GL posting (Phase 6), Remittances (Phase 7), T4s/Reports/Trends (Phase 8)
- Tax-bracket editing UI (deferred per D2)
- Migrating the 27 existing employee files off base44 (deferred per D3 — infrastructure only this phase)
- Real `employee_db_id` linkage to AutoPRO's own `Employee` table
- Any change to `PayrollTransaction` (out of scope for the entire merge, decision S3)

### Why multi-phase, not single

Phase 3 has three genuinely independent workstreams with different risk profiles, unlike Phase 2 (pure plumbing, zero DB risk):

- **3A** is pure CRUD over tables Phase 1 already secured — no new infrastructure, lowest risk, largest file count.
- **3B** introduces new infrastructure this codebase has never had for this data class (a fully private, edge-function-only bucket) — infrastructure-only per D3, so this phase does not move real HR documents between systems.
- **3C** is small, config-only CRUD, plus one new column (`alerts`, per D1).

Each is independently verifiable and rollback-able without touching the other two — 3A can ship and be used even if 3B is still being verified.

---

## 2) Lessons Learned & Context

Pulled from `master_blueprint.md` §7, filtered to what actually bites this phase.

| # | Lesson | How it applies here |
|---|---|---|
| 1 | `employee_id` carries three meanings — `PayPro_Employee.employee_id` is the business key (`EMP001`); `PayPro_EmployeeDeduction`/`EmployeePayType`/`TrainingRecord`'s `employee_id_ref` is the system id; **`PayPro_EmployeeFile.employee_id` is the odd one out — it behaves like `employee_id_ref` despite the name.** | Every 3A/3B call site must use the *system id* (`PayPro_Employee.id`, the 24-char hex) for `employee_id_ref` **and** for `EmployeeFile.employee_id` — confirmed directly against source (`EmployeeFileModal.jsx` sends `employee_id: employeeId` where `employeeId` is the URL's `id` param, i.e. the system id). Comment this at every join, per the lesson's own instruction. |
| 6 | The shim owns id generation and audit fields | Already true — `payrollEntities.js` shipped in Phase 2. No 3A/3B/3C call site should hand-write `id`/`created_date`/`created_by`/`created_by_id`/`updated_date`. |
| 7 | PayPRO's global `<style>` block must never be reintroduced | Not applicable to ported *components* (only `Layout.jsx` carried it, discarded in Phase 2) — but every new dark-mode class in 3A/3B/3C should be checked against AutoPRO's real palette, not against PayPRO's now-defunct one. |
| 15 | Secrets do not belong in data tables | Directly why the WorkPRO API key field is dropped in 3C (§0.2). |
| 16/19 | jsonb double-encoding; dollar/rate columns never `bigint` | `PayPro_EmployeeDeduction.amount` (now `numeric`, R20-fixed) and `PayPro_TaxYearConstant`'s two jsonb bracket columns are both touched by 3A/3C — never `JSON.stringify()` a jsonb write; the shim already guarantees this as long as call sites pass real objects. |
| 21 | A `bigint` bound against `text` state breaks Radix `<Select>` silently | `PayTab.jsx`'s and `DeductionsTab.jsx`'s `<Select>` usage binds against `text` fields (`pay_type_name`, `deduction_type`) — no bigint/text mismatch risk here, confirmed by reading both files, but worth the explicit check since this bug class has hit 6 files already. |
| 27 | Dark mode is first-class | O-8. Every one of the ~11 ported files in this phase carries PayPRO's `bg-slate-50 min-h-screen`/`text-slate-900` light-only wrapper today — every one needs `dark:` variants added, not retrofitted later. |
| 28 | `cn()`/tailwind-merge silently drops conflicting utilities | Applies to every new `Dialog`-based component this phase (`TrainingModal`, `EmployeeFileModal`, `ValidPayTypeManagerModal`, `ConstantEditor`) — verify each renders centered/fixed after porting, not just that it compiles. |
| 12 | New edge functions use `paypro-*` | `paypro-uploadEmployeeFile`, `paypro-viewEmployeeFile` (§0.2). |
| — (master_context.md §4.11) | A missing `Employee` row for a valid Auth session is expected | Not directly touched — this phase's `employee_db_id` non-linkage (§0.2) is a related but distinct gap, explicitly deferred. |
| — (master_context.md, RLS strong-auth) | `PayPro_*` tables require `authenticated` AND `is_paypro_user()` AND `staff_strong_auth()` (verified live via `pg_policies` against all 10 tables) | The new storage bucket's policies (3B) should match this same three-part gate in spirit — except 3B's recommended design (§3B) uses **zero direct-client policies at all**, an even tighter bar, since every read/write is edge-function-mediated. |

---

## 3) Phase 3 Roadmap & Progress

| Sub-phase | Status | Overview |
|---|---|---|
| 3A | Pending | Employee list, Edit Employee shell + General/Pay/Deductions/Training tabs, Valid Pay Type manager — pure CRUD, no new infra |
| 3B | Pending | `kadr-employee-files` bucket, RLS, `paypro-uploadEmployeeFile`/`paypro-viewEmployeeFile` edge functions, Other Tab's file section — infrastructure only, 27-file migration deferred (D3) |
| 3C | Pending | Setup page, Constant Editor, `alerts` column + Other Tab's Notes/Alerts section (D1) |

```
   3A (Employee CRUD) ──┐
                         ├──► Final Verification (all 3 together) ──► Phase 4
   3B (File infra)     ──┤
                         │
   3C (Setup)          ──┘
```
3A, 3B, 3C have no dependencies on each other and can be built/verified in any order or in parallel — none shares a file with another.

---

### 3A — Employee List, Edit Employee, Pay Types

**New files:**
- `src/pages/paypro/Employees.jsx` *(replaces the Phase 2 placeholder body)*
- `src/pages/paypro/EditEmployee.jsx` *(replaces placeholder body)*
- `src/components/paypro/employees/EmployeeList.jsx`
- `src/components/paypro/employees/tabs/GeneralTab.jsx`
- `src/components/paypro/employees/tabs/PayTab.jsx`
- `src/components/paypro/employees/tabs/DeductionsTab.jsx`
- `src/components/paypro/employees/tabs/TrainingTab.jsx`
- `src/components/paypro/employees/tabs/TrainingModal.jsx`
- `src/components/paypro/paytypes/ValidPayTypeManagerModal.jsx`

**Not ported into 3A** (Other Tab is split — its Notes/Alerts half is 3C, its Files half is 3B; see those sections):
- `OtherTab.jsx` is authored once, in 3B, since its dominant content (file upload/view/delete) depends on 3B's infrastructure. 3C's Notes/Alerts fields are added into the same file as a follow-up edit once 3B lands — see 3C's task list.

#### Detailed Execution Plan

**`Employees.jsx`** — port of PayPRO's `pages/Employees.jsx` (131 lines):
- Wrap in AutoPRO's page-canvas convention (`max-w-7xl mx-auto p-6 space-y-6`, matching `ManageTickets.jsx`/the Phase 2 placeholder — **not** PayPRO's `p-6 space-y-6 bg-slate-50 min-h-screen`).
- `Employee.list('-created_date')` via the shim on mount (import path swap only: `@/entities/all` → `@/components/paypro/lib/payrollEntities`).
- Search filters client-side on `first_name`/`last_name`/`employee_id`/`email` — unchanged logic.
- "Manage Pay Types" button opens `ValidPayTypeManagerModal`; "Add Employee" navigates to `createPageUrl("paypro/EditEmployee")`; row click navigates to `createPageUrl("paypro/EditEmployee") + "?id=" + employee.id"`.
- Stats cards (`Total Employees`, `Active Employees`) — unchanged logic, `dark:` classes added.

**`EmployeeList.jsx`** — port of `components/employees/EmployeeList.jsx` (130 lines):
- Straight port with `dark:` classes added throughout (currently zero dark-mode classes in the source).
- **Swap `sonner`'s `toast()` for AutoPRO's `useToast()`** on the copy-email button (§0.2) — the only functional deviation from source in this file.

**`EditEmployee.jsx`** — port of `pages/EditEmployee.jsx` (217 lines):
- Same `id` query-param convention (`?id=<PayPro_Employee.id>`), same `generateEmployeeId()` (scans existing `employee_id`s for the next `EMP0XX`), same `calculateStatus()` derived-status logic — **all ported unchanged**, this is pure business logic with zero base44 coupling.
- `Employee.get(id)` / `TaxYearConstant.filter({ year: currentYear })` / `Employee.update(employeeId, employee)` / `Employee.create(employee)` — import-path swap only.
- **Note for `generateEmployeeId()`:** it calls `Employee.list()` with no sort/filter, then scans in JS — the shim's paginated `fetchAllRows` handles this correctly regardless of row count (currently 11, no risk today, but this is exactly the kind of scan lesson from Phase 5's `PaychequeNumberGenerator.jsx` note warns about if it ever silently truncated).
- Tabs wrapper (`Tabs`/`TabsList`/`TabsTrigger`/`TabsContent`, 5 tabs) — unchanged, `dark:` classes added to the outer wrapper only (tab content styling lives in each tab file).

**`GeneralTab.jsx`** — port of `tabs/GeneralTab.jsx` (152 lines), straight field-for-field port. All fields write directly to the `employee` state object via `onFieldChange` (no direct entity calls in this tab) — `dark:` classes added to every `Input`/`Label`/`Select`/the WorkPRO-email highlight box (`bg-blue-50 border-blue-200` → add `dark:bg-blue-950/30 dark:border-blue-900`).

**`PayTab.jsx`** — port of `tabs/PayTab.jsx` (363 lines):
- `ValidPayType.list('-created_date')` + `EmployeePayType.filter({ employee_id_ref: employeeId })` in parallel via `Promise.all` — import-path swap only.
- Full CRUD on `EmployeePayType` (`create`/`update`/`delete`) — unchanged logic, including the `workpro_type` lookup-and-copy from the selected `ValidPayType`.
- Vacation pay rate (percent-to-decimal conversion) and banked-vacation-balance display — pure `employee` state edits, unchanged.
- `dark:` classes added throughout, including the two highlighted card sections (`border-blue-100 bg-blue-50/30`, `bg-green-50 border-green-200`).

**`DeductionsTab.jsx`** — port of `tabs/DeductionsTab.jsx` (411 lines):
- `EmployeeDeduction.filter({ employee_id_ref: employeeId })` + `TaxYearConstant.filter({})` (both years fetched, current/next picked in JS) — import-path swap only.
- GL account validation (`/^\d{4}$/`) unchanged. Full CRUD on `EmployeeDeduction` unchanged.
- `dark:` classes added, including the `Alert` component showing tax-year reference figures.

**`TrainingTab.jsx` + `TrainingModal.jsx`** — port of both files (192 + 116 lines):
- `TrainingRecord.filter({ employee_id_ref: employeeId })`, full CRUD via the modal — import-path swap only.
- Days-until-due badge logic (color-coded by days remaining) — unchanged, pure date math.
- `dark:` classes added to both files' badges/table/dialog.

**`ValidPayTypeManagerModal.jsx`** — port of `components/paytypes/ValidPayTypeManagerModal.jsx` (215 lines):
- `ValidPayType.list('-created_date')` + full CRUD — import-path swap only. Note (not a gap to fix): the form only edits `name`, never `workpro_type`, matching source exactly — `workpro_type` on `ValidPayType` stays whatever it was set to at import time unless a later phase adds that field to this form.
- `dark:` classes added.

#### Task List

- [ ] Create `src/components/paypro/employees/` and `src/components/paypro/paytypes/` directories
- [ ] Port `GeneralTab.jsx`, `PayTab.jsx`, `DeductionsTab.jsx`, `TrainingTab.jsx`, `TrainingModal.jsx`, `EmployeeList.jsx`, `ValidPayTypeManagerModal.jsx` with import-path swaps + dark-mode classes
- [ ] Swap `EmployeeList.jsx`'s `sonner` toast call for `useToast()`
- [ ] Replace `src/pages/paypro/Employees.jsx` placeholder body with the real page
- [ ] Replace `src/pages/paypro/EditEmployee.jsx` placeholder body with the real page + 5-tab wrapper (Other Tab wired in as a placeholder until 3B/3C land — see note below)
- [ ] Confirm `payrollEntities.js` needs zero changes (it already implements every verb 3A calls)

**Sequencing note:** `EditEmployee.jsx`'s `<TabsContent value="other">` needs *something* to render before 3B/3C exist. Render a minimal `<PayrollPagePlaceholder>` (the Phase 2 shared component) for the Other tab specifically until 3B lands, then swap in the real `OtherTab.jsx` as 3B's first task. This keeps 3A shippable and independently verifiable without waiting on 3B.

#### Verification Plan

At `test.kensauto.ca`, after commit + push, with a `paypro_user: true`, AAL2 session:

- [ ] `/paypro/Employees` lists all 11 real employees, search filters correctly by name/id/email, stats cards show correct active/total counts
- [ ] "Manage Pay Types" opens the modal; add/edit/delete a test pay type; list refreshes
- [ ] "Add Employee" → fill General tab → Save → new `EMP0XX` id generated correctly, row appears in the list
- [ ] Open an existing employee (e.g. EMP001) → all 5 tabs load real data correctly (General fields, Pay's hourly types + vacation rate, Deductions' TD1 amounts + additional deductions, Training's records with correct days-until-due coloring)
- [ ] Add/edit/delete a pay type on the Pay tab; add/edit/delete a deduction on the Deductions tab; add/edit/delete a training record — each persists and reloads correctly
- [ ] Edit General tab fields, Save, reload the page — changes persisted
- [ ] Both light and dark mode: no unstyled/white-on-white elements anywhere across all 5 tabs and both list/manager modals
- [ ] A session with `paypro_user` false/null cannot reach `/paypro/Employees` or `/paypro/EditEmployee` (existing Layout gate from Phase 2 + whatever page-level gate, if any, is added)
- [ ] `grep -r "base44"` / `"@base44"` in the new 3A files: zero matches

---

### 3B — Employee File Storage Infrastructure & Migration

**New files:**
- `supabase/migrations/<timestamp>_add_kadr_employee_files_bucket.sql`
- `supabase/functions/paypro-uploadEmployeeFile/index.ts`
- `supabase/functions/paypro-viewEmployeeFile/index.ts`
- `src/components/paypro/employees/tabs/OtherTab.jsx` *(authored here — see 3A's sequencing note)*
- `src/components/paypro/employees/tabs/EmployeeFileModal.jsx`

**Deferred (D3, not part of this sub-phase):** migrating the 27 existing `PayPro_EmployeeFile` rows' underlying files from base44 to the new bucket. This sub-phase builds and verifies the infrastructure only; a later, separately-approved pass does the actual data move.

#### Detailed Execution Plan

**Bucket + RLS migration** (mirrors `kadr-issue-report-attachments`'s structure, but tighter — no direct-client policies at all, matching the deny-all-except-service-role convention already used for `CustomerPortalStatement`/`CustomerPortalAudit`):

```sql
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('kadr-employee-files', 'kadr-employee-files', false, 10485760, array['application/pdf'])
on conflict (id) do nothing;

-- Deliberately no policies for `authenticated` or `anon` — every read/write goes through
-- the two paypro-* edge functions using the service-role client, which bypasses RLS
-- entirely. This is tighter than kadr-issue-report-attachments (which allows direct
-- authenticated client upload/read) because these are HR documents, not bug-report
-- screenshots, and the blueprint's own R9 mitigation calls for signed URLs "minted
-- server-side," never a client-provided URL trusted or forwarded.
```

Idempotency: `on conflict (id) do nothing` on the bucket insert; no policies to drop/recreate since none are created. Apply to dev (`sitihbdnuxifwibontcm`) first; production counterpart follows the same dual-file-with-different-migration-version pattern used for the issue-report-attachments bucket (lesson 23) once dev is verified.

**`paypro-uploadEmployeeFile`** (new edge function) — request/response contract fixed by the existing client call site (`EmployeeFileModal.jsx`, ported unchanged in its request shape):
```
POST body: { body: {
  employee_id: string,       // PayPro_Employee.id (system id — lesson 1)
  file_content: string,      // full "data:application/pdf;base64,...." data URL
  file_name: string,
  document_date: string,     // YYYY-MM-DD
  notes: string | null
}}
```
Handler:
1. `OPTIONS` short-circuit before constructing any client (master_context.md §4 convention).
2. Validate `file_content` starts with `data:application/pdf;base64,` — reject anything else (PDF-only, server-side backstop behind the client's own `accept=".pdf"`).
3. Decode base64, check byte length against a 10 MB cap (matching the bucket's `file_size_limit`) — reject over-cap with a clear `{error}` message rather than letting the bucket's own limit produce an opaque storage error.
4. Build a private client-side path: `${employee_id}/${crypto.randomUUID()}.pdf` (mirrors the issue-report-attachments path shape: `{scoping-id}/{random}.ext`).
5. Service-role client uploads the decoded bytes to `kadr-employee-files` at that path.
6. Insert into `PayPro_EmployeeFile` via the same shim conventions the frontend would use (id/audit fields generated server-side here, since this is an edge function, not a frontend shim call) — `file_url` stores the **storage path**, not a URL (D3's "never trusted or forwarded" principle: nothing about `file_url` is ever a fetchable link on its own from this point forward).
7. Return `200 { data: <inserted row> }` on success, `200 { error: message }` on failure (master_context.md §4 convention — never a raw 4xx/5xx).

**`paypro-viewEmployeeFile`** — request/response contract fixed by `OtherTab.jsx`'s existing call site:
```
POST body: { body: { file_id: string } }   // PayPro_EmployeeFile.id — NOT a client-supplied URL
Response: 200 { signedUrl: string }        // short-lived, minted server-side
```
Handler:
1. `OPTIONS` short-circuit.
2. Look up `PayPro_EmployeeFile` by `id` via service-role client — get its `file_url` (storage path).
3. `supabase.storage.from('kadr-employee-files').createSignedUrl(path, 300)` (5-minute expiry — this is opened once per click, not emailed like the issue-report-attachments 7-day links).
4. Return `200 { signedUrl }` or `200 { error }`.

**Frontend change from source:** `OtherTab.jsx`'s `handleViewFile` currently calls `base44.functions.invoke('viewEmployeeFile', { url: file.file_url })` and gets back base64 content it converts to a Blob URL client-side. The ported version instead calls `supabase.functions.invoke('paypro-viewEmployeeFile', { body: { file_id: file.id } })`, gets back `{ signedUrl }`, and does `window.open(signedUrl, '_blank')` directly — simpler than the base64-round-trip original, and avoids holding decoded PDF bytes in browser memory. This is a deliberate, and safe, simplification (not a byte-for-byte port) since the underlying capability (view a PDF in a new tab) is identical.

**`EmployeeFileModal.jsx`** — port of source (144 lines) with the upload call swapped:
```js
// before: await base44.functions.invoke('uploadEmployeeFile', payload)
// after:
const { data, error } = await supabase.functions.invoke('paypro-uploadEmployeeFile', { body: payload });
```
Same base64 `FileReader` read, same field set, same `.pdf`-only `accept` on the file input, `dark:` classes added.

**`OtherTab.jsx`** — port of source (235 lines), with:
- File section wired to `EmployeeFile.filter({ employee_id: employeeId })` (via `@tanstack/react-query`, already a dependency) + the new `paypro-viewEmployeeFile` call for previews + `EmployeeFile.delete(id)` for deletes (delete only removes the DB row — the underlying storage object becomes an orphan; matching source behavior exactly, which never cleaned up storage on delete either. Not fixed here — flag if orphan accumulation ever becomes a real concern).
- Notes/Alerts section stubbed as a placeholder in 3B, filled in by 3C (D1's `alerts` column + editor).
- **The 27 pre-existing rows still point at base44 URLs after this sub-phase (D3).** "Preview" on one of those will fail (the new `paypro-viewEmployeeFile` looks up a storage path, not a base44 URL) — expected and out of scope here, not a bug to chase. New uploads made after 3B ships work correctly end-to-end. Consider a light UI cue (e.g. disable/relabel "Preview" when `file_url` doesn't look like a storage path) so this doesn't read as broken to a real user before the later migration pass runs — a small, cheap addition, not a full fix.

#### Task List

- [ ] Write + apply `kadr-employee-files` bucket migration to dev
- [ ] Build + deploy `paypro-uploadEmployeeFile` to dev
- [ ] Build + deploy `paypro-viewEmployeeFile` to dev
- [ ] Port `EmployeeFileModal.jsx` with the edge-function call swap
- [ ] Author `OtherTab.jsx` (files section for real; notes/alerts section stubbed pending 3C)
- [ ] Wire `OtherTab.jsx` into `EditEmployee.jsx`'s Other tab (replacing 3A's placeholder)
- [ ] Add a UI cue distinguishing pre-existing base44-pointing rows from newly-uploaded ones (so "Preview" failing on old rows doesn't look like a bug)
- [ ] Confirm zero storage.objects policies exist for `authenticated`/`anon` on `kadr-employee-files` (`pg_policies` check)

#### Verification Plan

- [ ] Upload a real PDF via Other Tab → row appears in the file list, `file_url` is a storage path (not a base44 URL, not a raw signed URL)
- [ ] Click "Preview" on that newly-uploaded file → opens the actual PDF in a new tab, signed URL expires after ~5 minutes (spot-check by reusing an old link)
- [ ] Delete a file → row disappears from the list (storage object orphan is expected/acceptable per source parity, not a bug)
- [ ] Attempt a non-PDF upload (rename a `.png` to `.pdf` and check server-side content validation, or use a `.docx`) → rejected with a clear error, not a silent failure
- [ ] Attempt a request directly against `paypro-uploadEmployeeFile`/`paypro-viewEmployeeFile` from a non-`paypro_user` session → rejected (add an explicit `is_paypro_user()`/`staff_strong_auth()`-equivalent check inside both functions, since RLS can't gate an edge function using the service-role client — **this check must be written into the function body itself**, it's not automatic)
- [ ] `select count(*) from storage.objects where bucket_id = 'kadr-employee-files'` on dev shows exactly one object per newly-uploaded test file (zero for the still-unmigrated 27)
- [ ] Confirm the 27 pre-existing rows are visibly/behaviorally distinguished per the UI-cue task above, and that this is a known, accepted state — not something to "fix" by chasing a preview failure on an old row
- [ ] `select policyname from pg_policies where schemaname='storage' and (qual like '%kadr-employee-files%' or policyname like '%employee%')` — confirms the zero-direct-policy design landed as intended

---

### 3C — Setup, Constant Editor, Notes/Alerts

**New files:**
- `src/pages/paypro/Setup.jsx` *(replaces placeholder body)*
- `src/components/paypro/setup/ConstantEditor.jsx`

**Modified:** `src/components/paypro/employees/tabs/OtherTab.jsx` (adds the Notes/Alerts section on top of 3B's file section)

**Migration (D1):** `supabase/migrations/<timestamp>_add_alerts_to_paypro_employee.sql`

#### Detailed Execution Plan

**`Setup.jsx`** — port of source (247 lines), with the WorkPRO API key field removed entirely (§0.2):
- Tax Year Constants tab: `TaxYearConstant.list('-year')` table + "Add Tax Year" → `ConstantEditor`.
- General Settings tab: **only** the Period Close Date field survives the port. `PayrollSetting.list()` on load; save via find-or-create on `key: 'period_close_date'` — unchanged logic, just the one field instead of two.
- `dark:` classes added throughout (currently zero in source).

**`ConstantEditor.jsx`** — port of source (216 lines) exactly as-is per D2 — same fields, same percent-to-decimal conversions (`ei_rate_employee`/`cpp_rate_employee` stored as decimals, entered/displayed as percentages), same create/update branch. `dark:` classes added. **No bracket-array UI**, per D2.

**`OtherTab.jsx` Notes/Alerts section** (D1):
- Migration: `alter table "PayPro_Employee" add column if not exists alerts text;`
- Frontend: `notes`/`alerts` local state seeded from `employee.notes`/`employee.alerts`, saved via `Employee.update(employeeId, { notes, alerts })` — unchanged from source.
- `alerts` editor reuses this codebase's **existing** dark-mode-aware `react-quill` wrapper pattern (`note-editor-quill`-style Tailwind arbitrary-variant selectors targeting `.ql-container`/`.ql-editor`/`.ql-toolbar`, established in `src/components/work-orders/note-card/NoteEditableContent.jsx`) rather than inventing a new one — `react-quill`'s default theme is white-background-only and needs this override to not break in dark mode (lesson 27).

#### Task List

- [ ] Write + apply the `alerts` column migration to dev
- [ ] Port `Setup.jsx` (WorkPRO API key field dropped)
- [ ] Port `ConstantEditor.jsx` (no bracket UI, per D2)
- [ ] Replace `src/pages/paypro/Setup.jsx` placeholder body with the real page
- [ ] Add Notes/Alerts section to `OtherTab.jsx` — reusing the existing dark-mode `react-quill` wrapper pattern

#### Verification Plan

- [ ] `/paypro/Setup` → Tax Year Constants tab shows the real 2026 row with correct CPP/EI figures
- [ ] "Add Tax Year" → create a test 2099 row with dummy figures → appears in the list, percent fields round-trip correctly (e.g. enter `5.95` → stored as `0.0595` → redisplayed as `5.95`)
- [ ] Edit the test row → Save → changes persist
- [ ] General Settings tab: edit Period Close Date → Save → reload → persisted. **No WorkPRO API key field visible anywhere on the page**
- [ ] Other Tab's Alerts editor saves and reloads rich text correctly in both light and dark mode, with legible text/background in dark mode specifically (this is the concrete failure mode lesson 27 warns about)
- [ ] Both light and dark mode: no unstyled elements on Setup or Constant Editor
- [ ] Delete the test 2099 row (via direct SQL cleanup, since the source UI has no delete) so it doesn't linger as confusing test data

---

### Final Verification Plan (3A + 3B + 3C together)

Run after all three sub-phases are individually verified, at `test.kensauto.ca`, with a real `paypro_user: true` AAL2 session:

- [ ] Full round trip: create a brand-new employee (General tab) → add a pay type (Pay tab) → add a deduction (Deductions tab) → add a training record (Training tab) → upload a file (Other tab) → add notes/alerts (Other tab) — every tab's data persists correctly on reload, nothing from an earlier tab was lost by a later tab's save
- [ ] Delete the test employee's child records (pay type, deduction, training, file) and the employee itself, confirm no orphaned rows remain in any of the 5 tables touched
- [ ] `grep -r "base44"` / `"@base44"` across every new file in this phase: zero matches
- [ ] `git status` confirms no PayPRO source file was copied verbatim (every ported file went through the import-path swap + dark-mode-class pass described above)
- [ ] Spot-check 2 more real (non-test) employees' full 5-tab data displays correctly, to confirm the port handles real historical data shapes, not just a freshly-created test row
- [ ] Payroll dropdown nav (Phase 2) still correctly routes to all 3 of this phase's now-real pages

### Handoff Context to Phase 4

- Phase 4 (Time Records) is independent of this phase per `master_blueprint.md`'s own dependency graph (§5) — it can start regardless of Phase 3's status.
- `payrollEntities.js` needed zero changes for Phase 3 — confirms Phase 2's shim design holds up against its first real call sites.
- The `is_paypro_user()`/`staff_strong_auth()` in-function check pattern established in 3B's two edge functions (since RLS can't gate a service-role client) is the template for Phase 4's own new edge function (`paypro-generateTimeReport`) and every future `paypro-*` function that uses service-role.
- **Unfinished business (D3): the 27 pre-existing employee files are still on base44.** This needs a separately-approved migration pass before Phase 8.5's parallel run begins — Other Tab needs its historical files actually previewable by then, not just new uploads working. Flag this explicitly when scoping whatever comes right before 8.5.

---

## 4) Phase Results and Final Context

*(populated during execution — append, never overwrite)*

### 4.1 Execution Log

| Sub-phase | Started | Completed | Notes |
|---|---|---|---|
| 3A | — | — | — |
| 3B | — | — | — |
| 3C | — | — | — |

### 4.2 Deviations from Plan

*None yet.*

### 4.3 Unexpected Learnings

*None yet.*

### 4.4 Rollup Notes for `master_context.md` / `master_blueprint.md`

*(populated as Phase 3 completes)*
