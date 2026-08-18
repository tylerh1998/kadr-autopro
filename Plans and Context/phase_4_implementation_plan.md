# Phase 4 Implementation Plan — Time Records

**Parent:** `master_blueprint.md` Phase 4 · **Created 2026-08-18** · **Status: Execution complete 2026-08-18, pending live verification.** All four open questions in §0.1 approved as their **Recommended** option (Program Administrator, 2026-08-18). Code/migration/edge-function work in §3 is done and build-verified (§5.1); the AAL2 live-session checklist in §4 is still outstanding — see the note at the top of §4. Ran in parallel with Phase 3 (Employees) and Phase 5 (Payroll Calculation) agents — per §0.2, this phase is self-contained and didn't depend on either.

**Format: single-phase** — see rationale in §1.

> **This is a LIVE document.** §4's checklists and §5 are the working area, updated during execution. Do not wipe prior content — append and adjust.

---

## 0) Notes, Open Questions & Clarifications

### 0.1 Open questions — resolved 2026-08-18

**All four approved as their Recommended option** (Program Administrator, 2026-08-18). Original options preserved below for context/rationale — not to be re-litigated during execution.

**Q1 — `TimeRecord`/`PayPeriods` have no `is_paypro_user()` RLS gate, unlike the ten `PayPro_*` tables.** Verified directly against dev (`sitihbdnuxifwibontcm`): both tables carry only the standard 2026-08-16 pair — `PERMISSIVE FOR ALL TO authenticated USING(true)` + `RESTRICTIVE ... staff_strong_auth()`. Phase 1's RLS workstream never touched them (they're WorkPRO tables, not one of the ten imported entities), and they **can't safely get the `PayPro_*` treatment** — `TimeRecord` is written directly by ordinary technicians clocking in/out (`Layout.jsx`, `GlobalClockInModal.jsx`, `TechProjectClockInModal.jsx`) and read shop-wide by `TechClockStatusModal.jsx`'s "who's clocked in" board, none of whom are `paypro_user`. Adding a `paypro_user`-restrictive policy would break live clock-in for every non-payroll tech. Net effect: **the "non-payroll user hand-types the URL and sees an empty page" guarantee `master_blueprint.md`'s Phase 2 verification table states for the rest of the module does not hold for this page** — RLS will happily return real data to any AAL2 staff member.
- **Recommended: leave `TimeRecord`/`PayPeriods` RLS untouched** (correct — don't regress a live feature) **and add a client-side gate inside `TimeRecords.jsx` itself**: render an "Access restricted" message instead of the page body when `employee?.paypro_user !== true`, so a hand-typed URL is at least blocked at the UI layer even though the data itself was never actually sensitive dollar information (hours/clock times only — already visible to any AAL2 staff via `TechClockStatusModal` and the Technician Performance Report today).
- Alternative: skip the extra guard — rely on the nav dropdown alone (already gated) and accept that a hand-typed URL shows real data to any logged-in staff member, consistent with the fact that this data was never RLS-isolated even before this phase.
- **Decision: Approved — Recommended.** Client-side `paypro_user` gate added to `TimeRecords.jsx` (O-9). RLS left untouched.

**Q2 — `TimeRecord.pto_hours`/`stat_hours` are `bigint`, but the ported Add/Edit modals allow fractional entry.** Verified live schema: both columns are `bigint`. Both `AddTimeRecordModal.jsx` and `EditTimeRecordModal.jsx` use `<Input type="number" step="0.25">` for these fields — the UI actively invites a value like `4.5`. Per `master_context.md` §3's documented bug class, a `bigint` column rejects any fractional write with Postgres `22P02`, often with no visible error surfaced. This table falls outside Phase 1's audit (it's a WorkPRO table, not one of the ten `PayPro_*` entities), so nobody has fixed it yet. **Confirmed 21 existing `PayPeriods` rows and 1,609 `TimeRecord` rows today, all currently whole-number/null `pto_hours`/`stat_hours`** — no data-loss risk in widening.
- **Recommended: widen both columns to `double precision` in a new migration, applied to dev now** (mirrors Phase 1's S4 treatment of `PayPeriods.total_pto_hours`/`total_stat_hours`, which fixed the identical bug one level up in the same feature's own summary table but left the per-record columns behind). Per `master_context.md` §3, PostgREST serializes `numeric`/`double precision` as a real JSON number — zero frontend regression risk, confirmed pattern reused three times already this project.
- Alternative: leave as `bigint` and silently truncate/round the UI's `step="0.25"` inputs to whole hours (a real behavior change from the source app, and a silent one) — not recommended.
- **Decision: Approved — Recommended.** Migration widening both columns to `double precision`, applied to dev only (§3.1, O-8).

**Q3 — `TimeRecord.employee_name` (free text, WorkPRO's `Employee.full_name`) doesn't always match `PayPro_Employee.first_name + ' ' + last_name`.** Verified directly: WorkPRO's clock-in data has an employee recorded as `"Sam Eyben"`; `PayPro_Employee` (EMP007) has `first_name: "Samantha"`. Under the ported string-match logic (`fetchRecords`' `employees.find(e => \`${e.first_name} ${e.last_name}\` === record.employee_name ...)`), this employee's own clock records never resolve to their payroll row — in the admin list they'd show under the raw WorkPRO name with no payroll linkage; if EMP007 ever logs in as a non-admin payroll user, the "only show my own records" filter (exact-name match) would show **zero** records. Separately, `"Ken Haney"` has real `TimeRecord` rows but no `PayPro_Employee` row at all — expected, he's WorkPRO-only, not a payroll employee, and the ported code already degrades gracefully for this case (falls back to displaying the raw `employee_name`).
- **Recommended: port the matching logic as-is** (identical behavior/risk to the source app) **and treat this as a known, pre-existing gap**, not something Phase 4 should invent new fuzzy-matching logic to solve (scope creep past this phase's boundary, R16) — EMP007/Cheryl-class employees are already flagged in Phase 1/3 as needing a roster decision (they're 3 of the 4 employees with no `employee_db_id` link either). Worth fixing at the source (correcting `PayPro_Employee.first_name` to `"Sam"`, or `TimeRecord.employee_name` historically to `"Samantha Eyben"`) whenever that broader roster cleanup happens, not as part of this phase.
- Alternative: fix the specific `"Sam"/"Samantha"` mismatch now via a one-row data correction (your call which system's spelling is authoritative) — cheap, but only patches this one instance of a class of gap that could recur for any future name change.
- **Decision: Approved — Recommended.** Matching logic ported as-is; gap tracked as a known pre-existing issue, not fixed in this phase.

**Q4 — `LockPeriodModal`'s preview can include an in-progress (`clocked_in`) shift, not just completed ones.** Verified from source: the preview filter is `r.date >= start && r.date <= end && r.status !== 'locked'` — it does **not** exclude `clocked_in`/`active` records. Locking a still-open shift would flip its status to `locked`; the clock-out toggle (`Layout.jsx`'s `handleClockToggle`) looks up the active record by `.eq('status','clocked_in')`, wouldn't find the now-`locked` row, and would silently create a **second, brand-new** clock-in record instead of closing the original — a real duplicate-record risk. This exists in the current live base44 PayPRO app too (same logic), but there it only ever wrote through a service-role function against a table nothing else touched live; here it's a direct write to the same `TimeRecord` table WorkPRO's real-time clock board reads from.
- **Recommended: small, low-risk deviation from byte-identical — exclude `status IN ('clocked_in','active')` from the lock-eligible set**, surfaced in the preview as "N records skipped (still clocked in)" rather than silently omitted. Given this phase is the first time this logic runs against a live, shared WorkPRO table (previously isolated), the extra guard is cheap and directly prevents a confirmed failure mode.
- Alternative: port unchanged (matches source exactly) and rely on the admin operator to only lock periods that are safely in the past.
- **Decision: Approved — Recommended.** `LockPeriodModal` excludes `status IN ('clocked_in','active')` from the lock-eligible set and surfaces a "N records skipped (still clocked in)" note in the preview (§3.6).

### 0.2 Clarifications (not questions — stating so nothing here reads as an oversight)

- **`payrollEntities.js` (the Phase 2 shim) does not cover `TimeRecord`/`PayPeriods`, and this phase does not extend it.** Both tables are WorkPRO-owned, not part of the ten `PayPro_*` entities the shim maps — this matches `master_blueprint.md`'s own Phase 4 text ("the frontend hits `supabase.from('TimeRecord')` directly under the caller's own RLS"). All native reads/writes in this phase go through the app's regular `@/lib/supabase` client, following the exact pattern already live in `Layout.jsx`/`GlobalClockInModal.jsx` (id generation, audit fields, id format) rather than inventing a second convention.
- **`isAdmin` maps to `employee?.admin === true`, not `employee?.paypro_user`.** PayPRO's source used base44's `user.role === 'admin'` to gate Lock Period/Previous Periods/Report and the "see everyone's records" view. Since every session reaching this page already has `paypro_user === true` (nav-gated), reusing that same flag for `isAdmin` would collapse two distinct concepts the source app deliberately keeps separate (every payroll user vs. the payroll admin). `employee?.admin` is the existing, already-battle-tested AutoPRO convention for this exact "full admin capability" gate (same field `ManageTickets.jsx` uses).
- **No fiscal-period gate, no GL, no dollar amounts anywhere in this phase.** Time Records only ever writes hours/clock times to `TimeRecord`/`PayPeriods` — confirmed by reading every component. The Fiscal Period gate (Q8 in the blueprint) first becomes relevant in Phase 6 (Mark Paid).
- **The `-06:00` hardcoded timezone offset in `getSupabaseTimeRecords`'s date-range filter is preserved verbatim**, per `master_blueprint.md`'s own instruction ("Two behaviours preserved exactly: the `-06:00` timezone offset..."). This is a deliberate DST-unaware fixed offset, the same pattern already used by the Appointment Reminder cron jobs (`master_context.md` §4.2) — not a bug to "fix" to a real IANA timezone.
- **This is the first `paypro-*` edge function actually built**, even though `master_blueprint.md`'s Phase 3 plan describes `paypro-uploadEmployeeFile`/`paypro-viewEmployeeFile` first. Per the roadmap (§5 of the blueprint), Phase 3 and Phase 4 are independent, parallelizable branches off Phase 2 — Phase 3 may not have executed yet when this phase runs. This plan is self-contained and doesn't assume any Phase 3 code exists; it establishes its own in-function auth check (§3, `paypro-generateTimeReport`) directly from the already-live pattern used by `autopro-getSalesAnalysisReport` and similar report functions, not from Phase 3.
- **`generateAutoPROFile` and other genuinely-dead PayPRO functions are irrelevant here** — this phase only touches `getSupabaseTimeRecords`, `manageSupabaseTimeRecords`, `getSupabasePayPeriods` (all three deleted per lesson 14 — their capability moves to direct native calls) and `generateTimeReport` (ported to `paypro-generateTimeReport`, per naming convention S1/lesson 12).

---

## 1) Phase Scope & Objectives

### In scope

Port PayPRO's Time Records page — the list/filter view, the Add/Edit modals, the admin Lock Period + Previous Periods (Locked) workflows, and the Time Report PDF export — onto AutoPRO's native `TimeRecord`/`PayPeriods` tables (WorkPRO's own tables, already live and populated), replacing three service-key-proxy base44 functions with direct native queries.

### Objectives

| # | Objective |
|---|---|
| O-1 | `TimeRecords.jsx` replaces its Phase 2 placeholder with a real page: date-range + employee filters, hours summary cards (Regular/Overtime/PTO/STAT), and the records table |
| O-2 | `TimeRecordsList.jsx` ported with day-total/regular/OT rollup logic preserved exactly |
| O-3 | `AddTimeRecordModal.jsx`/`EditTimeRecordModal.jsx` ported — multi-employee batch add, single-record edit + delete, all writing directly to `TimeRecord` |
| O-4 | `ValidationNotices.jsx` ported — overlap detection + `status === 'error'` detection, unchanged algorithm |
| O-5 | `LockPeriodModal.jsx` ported — preview + bulk lock into `TimeRecord.status = 'locked'` + a `PayPeriods` summary row (with Q4's small safety addition, pending your answer) |
| O-6 | `PrevPayPeriodsModal.jsx` ported — lists locked `PayPeriods` history |
| O-7 | `paypro-generateTimeReport` edge function built and deployed to dev — jsPDF port of the landscape multi-employee time report, with an in-function `paypro_user` authorization check |
| O-8 | `TimeRecord.pto_hours`/`stat_hours` widened to `double precision` (pending Q2) so the ported UI's fractional-hour inputs actually work |
| O-9 | A client-side `paypro_user` access gate added to `TimeRecords.jsx` (pending Q1), since RLS can't provide one here without breaking WorkPRO |
| O-10 | Every ported file ships dark-mode classes from the start (lesson 27) — none of PayPRO's `bg-slate-50`/`text-slate-900`-only classes carried over unchanged |
| O-11 | Zero new base44 references introduced; `getSupabaseTimeRecords`/`manageSupabaseTimeRecords`/`getSupabasePayPeriods` have no native equivalent function — their three call sites become direct `supabase.from()` calls |

### Explicitly NOT in scope

- Employees/Setup/Pay Types (Phase 3), Payroll calculation (Phase 5), Pay Stubs/GL (Phase 6), Remittances (Phase 7), T4s/Reports/Trends (Phase 8)
- Any change to WorkPRO's own clock-in/out UI (`Layout.jsx`, `GlobalClockInModal.jsx`, `TechProjectClockInModal.jsx`, `TechClockStatusModal.jsx`) — this phase only adds a *second* consumer of `TimeRecord`, it doesn't touch the first
- Fixing the `"Sam"/"Samantha" Eyben` name-mismatch data (Q3) or any broader roster/`employee_db_id` cleanup
- Any fiscal-period gate, GL posting, or dollar-amount logic

### Why single-phase, not 4A/4B/4C

Unlike Phase 3 (which had a genuinely separate, higher-risk infrastructure workstream in 3B — a brand-new private Storage bucket moving real HR PII), every piece of Phase 4 touches the same two tables (`TimeRecord`, `PayPeriods`), carries a comparable risk profile (hours/dates, no money, no PII beyond a name), and has no natural independent-rollback boundary — consistent with `master_blueprint.md`'s own 1-day estimate for this phase (vs. 1.5 for Phase 3) and the same reasoning Phase 2 used for staying single-phase. The Detailed Execution Plan below is still organized into four internal groupings (main page/list, modals, admin lock workflow, PDF function) for clarity, but they ship and verify together.

---

## 2) Lessons Learned & Context

Pulled from `master_blueprint.md` §7 and `master_context.md`, filtered to what actually bites this phase.

| # | Lesson | How it applies here |
|---|---|---|
| 6 | The shim owns id generation and audit fields | Doesn't apply directly (no shim for `TimeRecord`/`PayPeriods` — §0.2) — but the *principle* still applies: every native insert in this phase must generate its own 24-char-hex `id` and set `created_date`/`created_by`/`created_by_id` explicitly, exactly like `Layout.jsx`'s existing `TimeRecord` insert already does. No DB default exists on either table (confirmed live). |
| 17/§4.10 | Legacy/WorkPRO-origin tables have no working id default; forgetting one throws `23502` | `TimeRecord`/`PayPeriods` both confirmed `id text NOT NULL`, no default. Every insert in this phase (`AddTimeRecordModal`, `LockPeriodModal`'s `PayPeriods` insert) must set `id: crypto.randomUUID().replace(/-/g,'').substring(0,24)`, matching the live convention in `Layout.jsx`/`GlobalClockInModal.jsx` exactly. |
| 19/20 | Dollar/rate columns are never `bigint`; text-typed date/number columns need explicit casts | Directly Q2 (`pto_hours`/`stat_hours` bigint) and `total_hours` (confirmed `text` — always `parseFloat()`/`Number()` before arithmetic, matching `autopro-getTechnicianPerformanceReport`'s existing `parseFloat(r.total_hours) || 0` pattern; write a plain JS number, matching `Layout.jsx`'s existing insert, which already works against this `text` column). |
| 27 | Dark mode is first-class | O-10. Every one of PayPRO's 7 Time Records files ships `bg-slate-50`/`text-slate-900`-only classes today — every one needs `dark:` variants added during the port, not retrofitted later. |
| 28 | `cn()`/tailwind-merge silently drops conflicting utilities | Applies to every `Dialog`-based component this phase (`AddTimeRecordModal`, `EditTimeRecordModal`, `LockPeriodModal`, `PrevPayPeriodsModal`, `TimeReportModal`) — verify each renders centered/fixed after porting, not just that it compiles. |
| 12 | New edge functions use `paypro-[functionname]` | `paypro-generateTimeReport` — **this note supersedes the generic "`autopro-[functionname]`" instruction the phaseplan skill template appends by default**; the `paypro-*` carve-out is an explicit, already-approved blueprint decision (S1), written into `master_context.md` §4. |
| master_context.md §4 | Edge Functions return `200 OK` + `{error}` on failure, **except** PDF-generating functions, which return raw bytes on success and `{error}` only on failure | Directly shapes `paypro-generateTimeReport` — matches the exact pattern already live in `autopro-generateDepositSlipPDF`/`autopro-generateWorkOrderPdf`. |
| master_context.md §4 | Constructing a third-party SDK client at module top-level can crash a function's own `OPTIONS` preflight | `jsPDF`'s constructor is cheap/synchronous (unlike e.g. Twilio's client), but the `OPTIONS` short-circuit still comes first per house convention, matching every other function in `supabase/functions/`. |
| master_context.md §4.10 | `TimeRecord` is keyed by `employee_name` (full name text), `PayPeriods` has no FK back to `TimeRecord` — a summary row is just a snapshot | The `PayPeriods` insert in Lock Period is a point-in-time rollup, not a live-linked aggregate — matches source behavior exactly, nothing to fix. |
| master_context.md §4.11 | A missing `Employee` row for a valid Auth session is expected | `TimeRecords.jsx`'s `isAdmin`/self-filter logic must degrade gracefully (treat as non-admin, show nothing) rather than assume `employee` is populated — same convention as every other ported page this engagement. |
| master_context.md — live verification protocol | Verify only at `test.kensauto.ca`, only after commit + push + (since this phase adds a function) explicit `deploy_edge_function` | `paypro-generateTimeReport` needs an explicit deploy — a frontend push alone won't make it callable. |
| Workflow constraints 30–32 | `git push` doesn't work from an agent session · `main` never touched without an explicit ask · production DB writes need re-confirmation at the tool prompt | The pending `pto_hours`/`stat_hours` widening migration (Q2) applies to **dev only** this phase, consistent with every other phase's dev-first sequencing — no production DB write is planned here. |

---

## 3) Detailed Execution Plan

**Target repo:** `kadr-autopro` only. `kadr-paypro` is read-only reference source, never modified.

### 3.1 — Migration (pending Q2)

**New file:** `supabase/migrations/<timestamp>_widen_timerecord_pto_stat_hours.sql`

```sql
alter table "TimeRecord" alter column pto_hours type double precision using pto_hours::double precision;
alter table "TimeRecord" alter column stat_hours type double precision using stat_hours::double precision;
```

Applied to dev (`sitihbdnuxifwibontcm`) only, matching this phase's live-verification target. `ALTER COLUMN ... TYPE` is not `IF NOT EXISTS`-idempotent the way an `ADD COLUMN` is — if this needs to be re-applied, check the column's current type first (`information_schema.columns`) rather than re-running blindly, since a second `ALTER TYPE double precision` against an already-`double precision` column is itself harmless but the migration file's re-applicability across dev/prod should follow the same per-project-counterpart-file pattern as every other Phase 1-style DDL change (`master_context.md`'s migration-versioning rule) once this is promoted.

### 3.2 — Main page: `TimeRecords.jsx`

**Replaces:** `src/pages/paypro/TimeRecords.jsx` placeholder body.

- Wrap in AutoPRO's page-canvas convention (`max-w-7xl mx-auto p-6 space-y-6`, matching `PayrollPagePlaceholder.jsx`/Phase 3's `Employees.jsx` — **not** PayPRO's `p-6 space-y-6 bg-slate-50 min-h-screen`).
- **Auth/identity — simplified from source, not byte-identical, with reason:** PayPRO's `loadInitialData` called `base44.auth.me()` then searched `Employee.list()` for a name/email match to resolve "am I an employee." AutoPRO's `useAuth()` already resolves this directly — `const { employee } = useAuth()` gives the current session's own `Employee` row with no search needed. `isAdmin = employee?.admin === true` (§0.2). If `employee` is null (valid session, no `Employee` row — §4.11), render nothing extra beyond the access-gate/loading state, matching every other ported page's degrade-gracefully convention.
- **Access gate (pending Q1):** if `employee?.paypro_user !== true`, render an "Access restricted" message in place of the page body — placed as an early return right after the `employee` is resolved, before any `TimeRecord` fetch fires.
- `employees` state comes from `PayPro_Employee.list()` via the Phase 2 shim (`import { Employee } from '@/components/paypro/lib/payrollEntities'`) — unchanged from source's intent, just the import path/entity source.
- `fetchRecords()` — direct native call replacing `getSupabaseTimeRecords`:
  ```js
  const { data, error } = await supabase
    .from('TimeRecord')
    .select('*')
    .gte('clock_in_time', `${dateRange.start}T00:00:00-06:00`)
    .lte('clock_in_time', `${dateRange.end}T23:59:59-06:00`);
  ```
  Same `-06:00` fixed-offset convention as source (§0.2) — do not swap for a `timeZone`-aware comparison.
- The rest of `fetchRecords`'s transform/filter logic (matching `PayPro_Employee` by name-or-`employee_id`, admin-vs-self filtering, sort) — ported unchanged, including the known Q3 gap.
- `setQuickDate`/`checkForOverlaps`/summary-hours calculation (regular/OT/PTO/STAT reduce logic) — ported unchanged, pure date/array math with zero base44 coupling.
- `dark:` classes added throughout — summary cards' colored backgrounds (`bg-green-100`/`bg-red-100`/`bg-blue-100`/`bg-amber-100`) need `dark:bg-*-950/30`-style counterparts per the established palette; the loading spinner's `bg-slate-50` wrapper too.

### 3.3 — `TimeRecordsList.jsx`

**New file:** `src/components/paypro/timerecords/TimeRecordsList.jsx` — port of source (148 lines), unchanged logic (`getEmployee`/`formatTime`/`formatDate`/`getStatusBadge`/`calculateDayData`), `dark:` classes added to every `Badge` color, the error-row highlight (`bg-red-50 border-l-red-500`), and the table header's colored column labels (`text-blue-600`/`text-orange-600`/`text-purple-600`/`text-green-600`).

**Clarification, not a change:** `getStatusBadge`'s `default` branch already renders the raw `status` value in a neutral badge for any status the `switch` doesn't special-case (e.g. `'active'`, the status `GlobalClockInModal.jsx` uses for a global clock-in) — confirmed this degrades correctly without needing a new case added, since `'active'` records will simply show a grey `"active"` badge rather than a colored one. Not a bug to fix, just noting it was checked.

### 3.4 — `AddTimeRecordModal.jsx` / `EditTimeRecordModal.jsx`

**New files:** `src/components/paypro/timerecords/{AddTimeRecordModal,EditTimeRecordModal}.jsx` — ports of source (261 lines each).

Both replace their `base44.functions.invoke('manageSupabaseTimeRecords', {...})` call with direct native writes:

```js
// Add (per selected employee, matching source's multi-select-create loop):
await supabase.from('TimeRecord').insert({
  id: crypto.randomUUID().replace(/-/g, '').substring(0, 24),
  employee_name: employeeName,
  clock_in_time, clock_out_time, total_hours,
  pto_hours: ptoHours, stat_hours: statHours,
  notes: formData.notes, status,
  created_date: new Date().toISOString(),
  created_by: employee?.email,
  created_by_id: employee?.autopro_user_id,
}).select();

// Edit:
await supabase.from('TimeRecord').update({
  employee_name, clock_in_time, clock_out_time, total_hours,
  pto_hours: ptoHours, stat_hours: statHours, notes, status,
  updated_date: new Date().toISOString(),
}).eq('id', record.id).select();

// Delete:
await supabase.from('TimeRecord').delete().eq('id', record.id);
```

`id`/`created_by`/`created_by_id` generation matches `Layout.jsx`'s live `TimeRecord` insert exactly (§2, lesson 6/17) — **not** the Phase 2 shim's `getCreatorInfo()` helper, since that helper is scoped to `payrollEntities.js`'s `PayPro_*` tables only and this phase deliberately doesn't extend it (§0.2).

The Mountain-Time `clock_in_time`/`clock_out_time` construction (`new Date(mtDateTime.toLocaleString('en-US', {timeZone:'America/Denver'})).toISOString()`) and the PTO/STAT-implies-`clocked_out`-with-zero-duration branch — ported unchanged, pure date math with zero base44 coupling. `dark:` classes added to both dialogs' inputs/labels.

### 3.5 — `ValidationNotices.jsx`

**New file:** `src/components/paypro/timerecords/ValidationNotices.jsx` — port of source (28 lines), unchanged logic. `dark:` classes added to the destructive `Alert` (`bg-red-50 border-red-300` → add `dark:bg-red-950/30 dark:border-red-900`).

### 3.6 — `LockPeriodModal.jsx`

**New file:** `src/components/paypro/timerecords/LockPeriodModal.jsx` — port of source (220 lines).

- Preview logic (`handlePreview`) — filters `records` (already client-side, already fetched) by date range and `status !== 'locked'`, computes regular/OT/PTO/STAT totals — ported unchanged **except** for Q4's pending addition: if approved, also exclude `status === 'clocked_in' || status === 'active'` from the eligible set, and show a count of skipped in-progress records in the preview panel.
- `handleLock` — replaces `base44.functions.invoke('manageSupabaseTimeRecords', {action:'lock', data})` with two native calls, matching the base44 function's own two-step shape exactly:
  ```js
  // 1. Bulk-lock the eligible TimeRecord rows
  await supabase.from('TimeRecord')
    .update({ status: 'locked', updated_date: new Date().toISOString() })
    .in('id', recordIds)
    .select();

  // 2. Insert the PayPeriods summary row
  await supabase.from('PayPeriods').insert({
    id: crypto.randomUUID().replace(/-/g, '').substring(0, 24),
    date_from: dateRange.start, date_to: dateRange.end,
    total_regular_hours: preview.regularHours,
    total_overtime_hours: preview.overtimeHours,
    total_pto_hours: preview.ptoHours,
    total_stat_hours: preview.statHours,
    total_records: preview.count,
    created_date: new Date().toISOString(),
    created_by: employee?.email,
    created_by_id: employee?.autopro_user_id,
  }).select();
  ```
  **Not wrapped in a transaction/RPC** — matches the source base44 function's own two-sequential-`.update()`/`.insert()` shape exactly (no atomic RPC existed there either); a failure between step 1 and step 2 would leave records locked with no matching `PayPeriods` summary, an accepted, pre-existing risk carried over unchanged, not introduced by this port.
- `dark:` classes added to the preview panel (`bg-slate-50`) and the amber warning `Alert`.

### 3.7 — `PrevPayPeriodsModal.jsx`

**New file:** `src/components/paypro/timerecords/PrevPayPeriodsModal.jsx` — port of source (133 lines).

Replaces `base44.functions.invoke('getSupabasePayPeriods', {})` with:
```js
const { data, error } = await supabase.from('PayPeriods').select('*');
```
Client-side sort-by-`date_from`-descending and pagination (10/page) — unchanged. `dark:` classes added to the table and the "Locked" `Badge`.

### 3.8 — `paypro-generateTimeReport` edge function

**New file:** `supabase/functions/paypro-generateTimeReport/index.ts` — jsPDF port of the base44 function (347 lines), landscape multi-employee report with per-employee summary boxes + daily table, unchanged layout/math.

```ts
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { jsPDF } from "npm:jspdf@2.5.2";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.6";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const supabase = createClient(Deno.env.get('SUPABASE_URL'), Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'));

    // In-function auth + paypro_user check — mirrors the live pattern already used by
    // autopro-getSalesAnalysisReport (Authorization header -> auth.getUser()), since a
    // service-role client bypasses RLS entirely and this check has to be written into
    // the function body itself, not assumed from the caller having reached this far.
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return json200({ error: 'Missing Authorization header' });
    const { data: { user }, error: authError } = await supabase.auth.getUser(authHeader.replace('Bearer ', ''));
    if (authError || !user) return json200({ error: 'Unauthorized' });

    const { data: caller } = await supabase.from('Employee').select('paypro_user').eq('mykadr_user_id', user.id).maybeSingle();
    if (!caller?.paypro_user) return json200({ error: 'Forbidden' });

    const { employeeIds, startDate, endDate } = await req.json();
    if (!employeeIds?.length || !startDate || !endDate) return json200({ error: 'Missing required parameters' });

    // employeeIds are PayPro_Employee.id values (source used base44 Employee.id the same way)
    const { data: allEmployees } = await supabase.from('PayPro_Employee').select('*').in('id', employeeIds);
    const { data: allTimeRecords } = await supabase.from('TimeRecord').select('*');

    // ... identical per-employee filter/aggregate/jsPDF rendering logic as the base44 source ...

    const pdfBytes = doc.output('arraybuffer');
    return new Response(pdfBytes, {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/pdf', 'Content-Disposition': `attachment; filename=TimeReport_${startDate}_to_${endDate}.pdf` },
    });
  } catch (error) {
    return json200({ error: error.message });
  }

  function json200(body) {
    return new Response(JSON.stringify(body), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
```

Everything after the auth/authorization check — the per-employee filter (`record.employee_name !== fullName` — same known Q3 name-match gap, inherited, not fixed here either), daily aggregation, and the entire jsPDF layout (summary boxes, table columns, page-per-employee pagination, footer) — ported byte-identical from the base44 source. `America/Edmonton` timezone formatting for displayed times — unchanged.

**Deploy:** `deploy_edge_function` to dev (`sitihbdnuxifwibontcm`) — a frontend push alone does not make this callable (§2, live-verification protocol).

### 3.9 — `TimeReportModal.jsx`

**New file:** `src/components/paypro/timerecords/TimeReportModal.jsx` — port of source (207 lines).

Replaces `import { generateTimeReport } from "@/functions/generateTimeReport"` + its call with:
```js
const { data, error } = await supabase.functions.invoke('paypro-generateTimeReport', {
  body: { employeeIds: selectedEmployees, startDate: dateRange.start, endDate: dateRange.end }
});
if (error) throw new Error(error.message);
if (data?.error) throw new Error(data.error);

const blob = new Blob([data], { type: 'application/pdf' });
const url = window.URL.createObjectURL(blob);
const a = document.createElement('a');
a.href = url; a.download = `TimeReport_${dateRange.start}_to_${dateRange.end}.pdf`;
document.body.appendChild(a); a.click();
window.URL.revokeObjectURL(url); a.remove();
```
Matches the exact `{ body: {...} }` wrapper convention `master_context.md` §4 documents, and the same `Blob`/anchor-download pattern already proven in `CashDrawer.jsx`'s `autopro-generateDepositSlipPDF` call site (§2). Employee checkbox list sourced from `PayPro_Employee.list()` via the shim (same `employees` prop already passed from `TimeRecords.jsx`). Quick-date buttons (`thisPayPeriod`/`lastPayPeriod`) — unchanged pure date math. `dark:` classes added throughout.

### 3.10 — Layout/nav

No changes needed — `Layout.jsx`'s Payroll dropdown already links to `paypro/TimeRecords` (Phase 2), and `App.jsx`'s route generation is already generic (Phase 2). Confirm only, don't modify.

---

## 4) Verification Plan

At `test.kensauto.ca`, after commit + push + `deploy_edge_function paypro-generateTimeReport`, with a `paypro_user: true`, AAL2 session:

> **Agent-session note:** items below marked ✅ were verified directly against dev/the built bundle during execution (2026-08-18). Everything else needs a real `test.kensauto.ca` AAL2 session with `paypro_user: true` — this agent session has no browser credentials and per standing workflow constraints (§2) never commits/pushes, so `development` was never actually deployed to Vercel from this session. The Program Administrator (or whoever pushes this branch) should run through the unchecked items before calling Phase 4 done.

- [x] ✅ `information_schema.columns` on dev confirms `TimeRecord.pto_hours`/`stat_hours` are now `double precision` (if Q2 approved)
- [ ] `/paypro/TimeRecords` loads; default date range is "This Pay Period"; quick-date buttons (This/Last Pay Period, This/Last Month) all populate correct ranges
- [ ] Records for the selected range load, matching real `TimeRecord` data — spot-check against a direct SQL query for the same range
- [ ] Employee filter (admin only) correctly narrows the list; a non-admin `paypro_user` session only ever sees its own records (or zero, for the known EMP007-class name-mismatch gap — expected per Q3)
- [ ] Summary cards (Regular/Overtime/PTO/STAT) match a hand-computed total for a known small date range
- [ ] Add Time Record: select 2+ employees, save with fractional PTO hours (e.g. `4.5`) — succeeds without a `22P02` error (proves Q2's fix), rows appear correctly attributed to each selected employee
- [ ] Edit Time Record: change hours/notes on an existing row → Save → reload → persisted; Delete → row removed, confirmation dialog fires first
- [ ] A `clocked_in`/`locked` row cannot be edited (button disabled with the correct tooltip) — locked; clocked-in per source parity (editable, not locked, unless you'd also like that disabled — not currently in scope)
- [ ] Overlap detection: create two overlapping time windows for the same employee/date → a red validation notice appears with correct details text
- [ ] Error-status detection: a row with `status='error'` (if any exist, or manually set one via SQL for the test) shows in `ValidationNotices` and gets the red-highlighted table row
- [ ] Lock Period (admin only): preview a date range → correct record count/hour totals shown → Lock → selected `TimeRecord` rows flip to `status='locked'` → a new `PayPeriods` row appears with matching totals. If Q4 approved: an in-progress `clocked_in` record in range is excluded from the lock and called out in the preview
- [ ] Previous Periods (admin only): shows the just-created locked period plus any pre-existing ones, paginated correctly past 10 rows
- [ ] Generate Time Report: select 2+ employees + a date range with real data → PDF downloads, opens correctly, per-employee summary boxes and daily table match the on-screen data
- [ ] A session with `paypro_user` false/null hand-typing `/paypro/TimeRecords`: if Q1 approved, sees the access-restricted message instead of real data; if not approved, this is accepted as a known gap — confirm behavior matches whichever you chose
- [ ] Non-`paypro_user` session (any AAL2 staff) can still clock in/out normally via the existing WorkPRO UI (`Layout.jsx` toggle, `GlobalClockInModal`) — proves this phase didn't regress the live feature
- [ ] `TechClockStatusModal`'s shop-wide clock board still shows all technicians' live status correctly — same regression check as above, different entry point
- [ ] Both light and dark mode: no unstyled/white-on-white elements anywhere across the page, both modals, and the two admin dialogs
- [x] ✅ `grep -r "base44"` / `"@base44"` in every new file this phase touches: zero matches (also confirmed clean in the built `dist/` bundle)
- [x] ✅ (partial) `paypro-generateTimeReport` called directly via `curl` with no `Authorization` header → rejected before function code runs (`401 UNAUTHORIZED_NO_AUTH_HEADER`, the platform-level `verify_jwt: true` gate — same behavior as `autopro-getSalesAnalysisReport`, which uses the identical setting). The function's own `{error}` @ `200` path (missing-header branch in the code, and the non-`paypro_user`-token branch) is written per convention but couldn't be exercised without a real session token — needs a live check.

---

## 5) Phase Results and Final Context

*(populated during execution — append, never overwrite)*

### 5.1 Execution Log

| Step | Started | Completed | Notes |
|---|---|---|---|
| 0.1 Q1–Q4 decisions recorded | 2026-08-18 | 2026-08-18 | All four approved as Recommended; see §0.1 decision lines |
| 3.1 Migration | 2026-08-18 | 2026-08-18 | Applied to dev (`sitihbdnuxifwibontcm`) via `apply_migration`; confirmed live via `information_schema.columns` |
| 3.2–3.7, 3.9 Frontend port | 2026-08-18 | 2026-08-18 | `TimeRecords.jsx` + 7 components in `src/components/paypro/timerecords/` |
| 3.8 Edge function + deploy | 2026-08-18 | 2026-08-18 | Deployed to dev as version 1, `verify_jwt: true`; confirmed `ACTIVE` and confirmed it rejects an unauthenticated `curl` call |
| Build verification | 2026-08-18 | 2026-08-18 | `npx eslint` on all new files: zero errors. `npm run build`: clean, `dist/` bundle confirmed to include the new code with zero `base44` references |

### 5.2 Deviations from Plan

- Dropped the source's unused `source: 'supabase'` field from `fetchRecords`' transformed record shape (§3.2) — grepped the entire source component tree first and confirmed nothing reads `record.source` anywhere; it was a dead base44-era artifact distinguishing two data origins that no longer exist post-port. Not a behavior change.
- `PrevPayPeriodsModal.jsx`'s empty-state copy changed from "No locked pay periods found in the last 6 months." to "No locked pay periods found." — the source's own `getSupabasePayPeriods` function had no 6-month filter (it selected the whole table), so the original copy was already inaccurate before this port; corrected rather than carried forward.
- Everything else in §3 shipped exactly as specified, including the Q1/Q2/Q3/Q4 recommended-option treatments.

### 5.3 Unexpected Learnings

- `autopro-getSalesAnalysisReport` (and now `paypro-generateTimeReport`, deployed with the same `verify_jwt: true`) gets its "no Authorization header" case intercepted by the Supabase platform gateway itself (`401 UNAUTHORIZED_NO_AUTH_HEADER`) before the function's own code — including its own `{error}` @ `200` missing-header branch — ever runs. Not a bug, just worth recording: the function-level `{error}`-at-`200` convention (master_context.md §4) only ever fires for a header that's *present but invalid/expired*, or for the function's own authorization-logic branches (e.g. the non-`paypro_user` check here) — never for a wholly absent header on a `verify_jwt: true` function. Confirmed by direct `curl` test against dev.
- `TimeRecord.clock_out_time` is `text`, not `timestamptz` like `clock_in_time` (confirmed via `information_schema.columns`) — asymmetric typing not called out anywhere in `master_context.md`. Doesn't affect this phase (every write path already sends a full ISO string either way, and every read path already goes through `new Date(...)`), but worth flagging for whoever next touches this table directly with raw SQL.

### 5.4 Rollup Notes for `master_context.md` / `master_blueprint.md`

- Phase 4 (Time Records) executed 2026-08-18: migration widening `TimeRecord.pto_hours`/`stat_hours` to `double precision` live on dev; 7-file frontend port under `src/components/paypro/timerecords/` plus `src/pages/paypro/TimeRecords.jsx`; `paypro-generateTimeReport` edge function deployed to dev (v1, `verify_jwt: true`).
- Add `TimeRecord.clock_out_time` is `text` (not `timestamptz`) to master_context.md's "Data Types — recurring traps" section next time that section is revised — asymmetric with `clock_in_time`, harmless today but a landmine for a future raw-SQL query against this table.
- Full live-session verification (the AAL2/`paypro_user` checklist items in §4) is still outstanding — this execution pass had no push/deploy/browser-session access. Flag for whoever runs the live check.

### 5.5 Handoff Context to Phase 5

- Phase 5 (Payroll Calculation) depends on Phase 4 only for its `TimeDataProcessor.jsx` component, which matches WorkPRO time records to PayPRO employees — the exact same name-matching mechanism and gap documented in Q3 here. Whoever executes Phase 5 should read this phase's Q3 resolution first.
- The in-function `paypro_user` authorization-check pattern established in `paypro-generateTimeReport` (§3.8) — `Authorization` header → `auth.getUser()` → look up `Employee.paypro_user` — is the template for every future `paypro-*` service-role function, independent of whichever pattern Phase 3's file-storage functions land on if built separately.
- If Q2 was approved, `TimeRecord.pto_hours`/`stat_hours` are `double precision` on dev only — production still has the old `bigint` columns until this migration is explicitly promoted, same dev-first sequencing as every other phase.
