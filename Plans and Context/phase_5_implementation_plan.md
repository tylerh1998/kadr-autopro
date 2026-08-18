# Phase 5 Implementation Plan — Payroll Calculation & Paycheque Creation

**Parent:** `master_blueprint.md` Phase 5 · **Created 2026-08-18** · **Status: DRAFT — awaiting approval to execute**

**Format: multi-phase (5A / 5B)** — see rationale in §1.

> **This is a LIVE document.** §3's sub-phase sections and §4 are the working area, updated during execution. Do not wipe prior content — append and adjust.

---

## 0) Notes, Open Questions & Clarifications

### 0.1 Open questions — need your decision before execution starts

**Q1 — `BatchPaychequeProcessor.jsx`'s YTD lookup uses a Mongo-style `$in` operator the Phase 2 shim doesn't support.** Verified: `PayStub.filter({ employee_id: { '$in': employeeDbIds }, year: currentYear })` is the **only** `$in` usage anywhere in the entire `kadr-paypro` source (grepped the whole `src/` tree). `payrollEntities.js`'s `filter()` (Phase 2) only implements plain-value `.eq()` chaining — passed a `{'$in': [...]}` object as a filter value, it would call `.eq('employee_id', {'$in':[...]})`, comparing a text column against a JSON object. This **matches zero rows silently, throws no error**, and Batch mode (the app's default `processingMode`) is the primary real-world path. The practical effect: every batch-created paycheque would compute tax/CPP/EI withholding from a YTD of zero, regardless of how many real stubs that employee already has this year — a materially wrong, silent-failure class of bug (§3's "no visible error" pattern), on the highest-risk phase in the whole engagement.
- **Recommended: extend `payrollEntities.js`'s `filter()` to recognize a `{'$in': array}` value and translate it to `.in(column, array)`.** Small, generic, and consistent with Phase 2's own stated design goal ("every future page/component port is an import-path swap only, not a rewrite") — every other call site's code stays untouched, and any future phase that needs the same Mongo-style operator (T4s/Reports in Phase 8 do similar per-employee aggregation) gets it for free.
- Alternative: leave the shared shim untouched and have this one call site issue a native `supabase.from('PayPro_PayStub').select('*').in('employee_id', ids).eq('year', year)` directly, bypassing the shim just here — avoids touching Phase 2's shared file, at the cost of this one file no longer being a pure import-path-swap port.

**Q2 — `PaychequeCreator.jsx`'s single-employee YTD lookup has a confirmed double-sort bug that returns the *oldest* stub of the year, not the latest.** The exact line: `stubs.sort((a, b) => new Date(b.pay_date).getTime() - new Date(a.pay_date).getTime()).reverse()[0]` — sorts newest-first, then `.reverse()`s to oldest-first, then takes index `0`. Despite being named `latestStub`, this returns the **first** stub of the year. Confirmed by direct comparison: `BatchPaychequeProcessor.jsx`'s equivalent lookup (`.sort((a,b) => new Date(b.pay_date) - new Date(a.pay_date))[0]`, no `.reverse()`) correctly returns the newest. **Practical effect:** creating a second-or-later paycheque through Single mode for any employee seeds their tax/CPP/EI calculation from their *first* stub's YTD figures instead of their most recent — understating YTD contributions and therefore miscalculating this period's tax room for anyone paid more than twice in a year via that mode.
- **Recommended: fix during the port** — drop the stray `.reverse()` so Single mode matches Batch mode's already-correct logic. This is a genuine correctness bug, not a stylistic difference, and porting it forward would leave the two paths permanently inconsistent for the same job.
- Alternative: port byte-identical (preserves exact base44 parity, bug included) — worth first confirming whether Single mode has ever actually been used for someone's 2nd+ paycheque of the year in the live base44 app, since if so this bug may already have quietly affected real 2026 withholding figures there too, which would be useful to know independent of this port.

**Q3 — (informational, carried from Phase 4)** `TimeDataProcessor.jsx`'s employee match (`\`${emp.first_name} ${emp.last_name}\` === record.employee_name`) has the identical gap Phase 4's Q3 documents (confirmed live: WorkPRO's `"Sam Eyben"` vs `PayPro_Employee`'s `"Samantha Eyben"`, EMP007). In Phase 4 this only affected a read-only list view; here it means **"Import Time Entries" silently imports zero hours** for that employee (a `console.warn`, no UI-visible error) — a real paycheque could be created for them with $0 gross from time data, easy to miss in a busy batch run.
- **Recommended: same disposition as Phase 4 — port as-is**, since EMP007 is already a known, low-impact, currently-inactive-employee gap (§Phase 4 Q3), and add a UI-visible warning (not just a `console.warn`) when an employee is selected for batch processing but the time-import summary shows zero matched records for them, so a real operator doesn't miss it silently at the point it actually costs someone a paycheque.
- Alternative: leave the `console.warn`-only behavior exactly as source has it, matching byte-identical porting even for this UX gap.

### 0.2 Clarifications (not questions — stating so nothing here reads as an oversight)

- **`TaxCalculator.jsx` has zero imports — it's a pure, self-contained computation module.** Confirmed by full read (214 lines). This is the single easiest byte-identical port in the entire engagement: copy the file verbatim into `src/components/paypro/payroll/TaxCalculator.jsx` with no changes whatsoever, not even an import-path swap (it has none to swap).
- **Real 2026 `PayPro_TaxYearConstant` data confirmed shape-compatible** — verified live: `federal_tax_brackets`/`provincial_tax_brackets_ab` are genuine `{min, max, rate}` array-of-objects, lowest bracket first, `max: null` on the top bracket, matching exactly what `calculateTax()` expects. The 15 Phase-1-corrected numeric columns (`cpp_max_pensionable_earnings`, `ei_max_insurable_earnings`, etc.) are consumed directly by `calculateCPP`/`calculateCPP2`/`calculateEI` with no further casting needed — per `master_context.md` §3, PostgREST serializes these as real JSON numbers to the frontend regardless of how a raw SQL client happens to display them.
- **`Payroll.jsx`'s own `periodCloseDate`/`validateDates` gate is a distinct, pre-existing PayPRO concept — not the same thing as AutoPRO's `checkFiscalPeriodStatus()`.** It reads `PayrollSetting.value` for `key: 'period_close_date'` (ported in Phase 3's Setup page) and blocks pay-period dates on/before that date. This is **not** the blueprint's Q8 Fiscal Period gate — that gate (checking AutoPRO's own `FiscalPeriod` table before any GL-affecting write) is approved for **Phase 6** (Mark Paid), not Phase 5, since nothing in Phase 5 posts to GL or moves money — it only creates a `PayPro_PayStub` row in an unpaid state (`is_paid`/`paid_via` are both untouched here, set later by Phase 6). Port `validateDates` unchanged; do not add the AutoPRO fiscal gate to this phase.
- **`employee.alerts` (`PaychequeForm.jsx` line 332) degrades gracefully regardless of Phase 3's still-open Q1** (whether `PayPro_Employee.alerts` gets added). The check is `employee.alerts && employee.alerts.replace(...)` — short-circuits cleanly on `undefined`, never throws. No coordination needed between the two phases on this specific point.
- **`Employee.update()` (advance balance / banked vacation pay) fires before `PayStub.create()`, non-atomically** — if the stub insert then fails, the employee's balance would already be updated with no corresponding stub. A real, pre-existing gap in the source app (same class of risk as Phase 4's Lock Period two-step write), carried over unchanged per the general "port unchanged unless asked" default — not fixed in this phase.
- **`retroactivelyApplyPaychequeNumbers` (in `PaychequeNumberGenerator.jsx`) is dead code** — confirmed via grep, imported/called nowhere in the entire PayPRO source. All 112 existing `PayPro_PayStub` rows already have `paycheque_number` values (confirmed live), so this one-off backfill utility has no remaining purpose. **Only `generatePaychequeNumber` is ported** — the retroactive function is left behind, matching what the source app actually uses today, not scope creep to port an unused export.
- **`PayPro_EmployeePayType.workpro_type` is correctly configured for the four hour-based types** (`Regular`/`Overtime`/`PTO`/`Stat Holiday`) across nearly all 34 existing rows — verified live, matching `TimeDataProcessor.jsx`'s hardcoded output strings exactly. One `Stat Holiday` row has a null `workpro_type` (one employee's config gap) — a pre-existing data completeness issue, not a code defect, not fixed in this phase.

---

## 1) Phase Scope & Objectives

### Overall scope

Port PayPRO's payroll calculation engine — the byte-identical CRA tax/CPP/CPP2/EI math, paycheque-number generation, the single-employee and interactive-batch paycheque creation flows, and WorkPRO time-data import — onto AutoPRO's native `PayPro_Employee`/`PayPro_EmployeePayType`/`PayPro_EmployeeDeduction`/`PayPro_TaxYearConstant`/`PayPro_PayStub` tables. **This is the highest business-logic risk phase in the entire merge** (blueprint's own framing) — CRA compliance depends on `TaxCalculator.jsx`'s fidelity, and this phase's output (`PayPro_PayStub` rows) is what Phase 6 posts to the real general ledger.

### Objectives

| # | Objective |
|---|---|
| O-1 | `TaxCalculator.jsx` ported **byte-identical**, zero modifications — `calculateTax`/`calculateCPP`/`calculateCPP2`/`calculateEI`/`calculatePayrollDeductions` |
| O-2 | `generatePaychequeNumber` ported — `YYYYMM-XXX` sequential numbering, paginated-fetch-safe via the shim |
| O-3 | `PaychequeForm.jsx` ported — pay-type/deduction/advance/vacation-bank UI, gross→deductions→net computation pipeline, `PayPro_PayStub` row assembly |
| O-4 | `Payroll.jsx` replaces its Phase 2 placeholder — pay-period setup, employee selection, Single/Batch mode toggle, period-close-date validation |
| O-5 | `PaychequeCreator.jsx` ported (Single mode) — YTD lookup **fixed per Q2**, wraps `PaychequeForm` |
| O-6 | `BatchPaychequeProcessor.jsx` ported (Batch mode) — multi-employee stepper, YTD lookup **fixed per Q1**, bulk `PayStub.bulkCreate` |
| O-7 | `TimeDataProcessor.jsx` ported — native `TimeRecord` query (direct, not via `getSupabaseTimeRecords`), daily regular/OT split, PTO/Stat aggregation |
| O-8 | **Phase gate:** ≥20 of the 112 imported paystubs, recomputed through the ported engine using each stub's own actual prior-YTD state, match base44's stored values exactly on all 8 fields (gross, federal, provincial, CPP, CPP2, EI, total deductions, net) |
| O-9 | **CPP2 gate:** a synthetic dev-only employee above the $74,600 YMPE floor validates `calculateCPP2` end-to-end — the only way this path gets exercised, since no real 2026 employee crosses it (confirmed: highest earner, EMP001, sits at $44,882.99 YTD through mid-August, annualizing to ~$71k) |
| O-10 | Dark mode shipped from the start on every ported file (lesson 27) |
| O-11 | Zero new base44 references; zero new edge functions (this phase is pure frontend + existing `PayPro_*`/`TimeRecord` tables, no new server-side surface) |

### Explicitly NOT in scope

- Pay Stubs list/PDF/email, Mark Paid → GL/Bank posting (Phase 6) — this phase only creates `PayPro_PayStub` rows in an implicitly-unpaid state (`is_paid`/`paid_via` untouched, left to their column defaults)
- Any Fiscal Period (`FiscalPeriod`/`checkFiscalPeriodStatus()`) gate — approved for Phase 6 only (§0.2)
- Remittances (Phase 7), T4s/Reports/Trends (Phase 8)
- Fixing the Phase 4 Q3 employee-name-matching gap at its source (roster/data correction) — restated here (Q3) because this is where it actually costs a real paycheque, not fixed here either
- Any new edge function — everything in this phase runs client-side against tables already RLS-gated by Phase 1

### Why multi-phase (5A/5B), not single

Phase 5 has two genuinely distinct risk/dependency profiles, closer to Phase 3's rationale than Phase 4's:

- **5A** is the core tax engine + the simplest paycheque-creation path (Single mode) — self-contained, no dependency on Phase 4, no shared-shim change, gated entirely by the 20-stub recompute match (O-8) and the CPP2 synthetic test (O-9). This is where CRA-compliance risk concentrates.
- **5B** is Batch mode + WorkPRO time import — depends on Phase 4 being functionally sound (time-record matching), requires a change to the shared Phase 2 shim (`$in` support, pending Q1), and carries its own distinct correctness risk (Q1's silent-zero-YTD bug) independent of the tax math itself.

Each is independently verifiable: 5A can be fully proven correct (tax math matches base44 exactly) before 5B's plumbing is even touched, and a 5B-specific bug can't be mistaken for a tax-math regression since 5A will already have an independent, passing gate.

---

## 2) Lessons Learned & Context

Pulled from `master_blueprint.md` §7 and `master_context.md`, filtered to what actually bites this phase.

| # | Lesson | How it applies here |
|---|---|---|
| 11 | `TaxCalculator.jsx` is ported byte-identical. No refactor, no cleanup. Its CPP2 path is unexercised by all historical data — correctness rests entirely on fidelity of the port | O-1, O-9. This is *the* rule this phase exists to satisfy. |
| 1 | `employee_id` carries three meanings | `PayPro_PayStub.employee_id` is the **business key** (`EMP001`) — confirmed live. `PayPro_EmployeePayType`/`EmployeeDeduction`'s `employee_id_ref` is the **system id** (`PayPro_Employee.id`). `PaychequeForm.jsx`/`PaychequeCreator.jsx`/`BatchPaychequeProcessor.jsx` already use the correct one of each in every call site — confirmed by direct read, ported unchanged. |
| 4/19 | CSV type inference silently mis-typed columns that happened to be all-zero/all-blank; dollar/rate columns are never `bigint` | Directly why `PayPro_PayStub.cpp2_deduction`/`ytd_cpp2` are `double precision` today (Phase 1 fix, R19) — confirmed live: every existing stub's `ytd_cpp2` is `null`, not `0`; every read must default it (`latestStub.ytd_cpp2 || 0`), matching what the source already does. |
| 6 | The shim owns id generation and audit fields | `PayStub.create()`/`.bulkCreate()` via `payrollEntities.js` — already implemented, needs zero changes for 5A. 5B needs the `$in` extension only (Q1), nothing else. |
| 16 | A jsonb array column can hold a double-encoded string | `income_breakdown`/`additional_deductions` — both built as real JS arrays in `PaychequeForm.jsx`'s `handleSaveClick`, passed straight to `PayStub.create()`. The shim's jsonb passthrough (Phase 2) never `JSON.stringify()`s — confirmed still correct, no change needed. |
| 27 | Dark mode is first-class | O-10. Every one of the six Phase 5 files ships `bg-slate-50`/`bg-white`/`text-slate-900`-only classes today. |
| 28 | `cn()`/tailwind-merge silently drops conflicting utilities | Applies to `PaychequeForm.jsx`'s collapsible Advance Management `Card` and the batch stepper's `Badge` list — verify rendering after porting, not just compilation. |
| master_context.md §3 | Text-typed number fields need explicit casts before arithmetic, explicit stringify before write | `PayPro_PayStub.pay_period_start`/`pay_period_end`/`pay_date` are `text` (confirmed live) — the ported code already writes plain `YYYY-MM-DD` strings (`payPeriod.start` etc.) directly, no cast needed; don't introduce one. |
| master_blueprint.md §3, R3 | CRA tax math drifts during the port — Phase 5 gate: recompute ≥20 of 112 stubs, exact match on all 8 fields. All stubs are 2026, 2026 constants loaded, fully exercisable | O-8 — see §3.5 Final Verification for the concrete procedure, built against real confirmed data (e.g. EMP001's 16-stub 2026 sequence, read live during this plan's research). |
| master_blueprint.md §5, Phase 5 text | **Nobody crosses the CPP2 floor in 2026** — confirmed again during this plan's research (EMP001 highest at ~$71k annualized, next-highest EMP002 ~$62k) | O-9 is the *only* real test CPP2 will ever get before an employee's pay organically grows past $74,600, plausibly 2027+. |
| master_context.md §4.10 | `TimeRecord` keyed by `employee_name` (free text) | Directly Q3 — `TimeDataProcessor.processTimeRecords()`'s employee match. |
| Workflow constraints 30–32 | `git push` doesn't work from an agent session · `main` never touched without an explicit ask · production DB writes need re-confirmation | The CPP2 synthetic employee (O-9) is created **on dev only**, deleted after the test — never touches production. |

---

## 3) Phase 5 Roadmap & Progress

| Sub-phase | Status | Overview |
|---|---|---|
| 5A | Pending | Tax engine (byte-identical), paycheque numbering, `PaychequeForm`/`PaychequeCreator`/`Payroll.jsx` page — Single-mode paycheque creation, end to end |
| 5B | Pending | `BatchPaychequeProcessor` (needs shim `$in` fix, Q1) + `TimeDataProcessor` (WorkPRO time import, depends on Phase 4) |

```
5A (Engine + Single mode) ──► 20-stub gate + CPP2 synthetic test ──┐
                                                                     ├──► Final Verification ──► Phase 6
5B (Batch mode + Time import, depends on Phase 4) ─────────────────┘
```
5B depends on Phase 4 being functionally complete (WorkPRO time-record reads) and on 5A's `PaychequeForm`/`PaychequeNumberGenerator` already existing (`BatchPaychequeProcessor` renders `PaychequeForm` directly). 5A has no dependency on 5B and should be built, gated, and verified first.

---

### 5A — Tax Engine, Paycheque Numbering & Single-Employee Creation

**New files:**
- `src/components/paypro/payroll/TaxCalculator.jsx` *(byte-identical copy)*
- `src/components/paypro/payroll/PaychequeNumberGenerator.jsx` *(only `generatePaychequeNumber`, §0.2)*
- `src/components/paypro/payroll/PaychequeForm.jsx`
- `src/components/paypro/payroll/PaychequeCreator.jsx`
- `src/pages/paypro/Payroll.jsx` *(replaces Phase 2 placeholder)*

#### Detailed Execution Plan

**`TaxCalculator.jsx`** — copy source's 214 lines verbatim, zero changes (§0.2). No import-path swap needed (zero imports in the file).

**`PaychequeNumberGenerator.jsx`** — port of `generatePaychequeNumber` only (§0.2, dead-code exclusion):
```js
import { PayStub } from '@/components/paypro/lib/payrollEntities';

export const generatePaychequeNumber = async (payPeriodEnd) => {
  // unchanged: derive YYYYMM prefix from payPeriodEnd, scan PayStub.list()
  // for existing numbers with that prefix, return prefix + next 3-digit sequence
};
```
`PayStub.list()` already routes through the shim's paginated `fetchAllRows` (Phase 2) — safe even as stub volume grows past 1000, no change needed here.

**`PaychequeForm.jsx`** — port of source (649 lines), import-path swap only for entity imports (`EmployeePayType`/`EmployeeDeduction`/`Employee`/`TaxYearConstant` from `payrollEntities.js`) plus `calculatePayrollDeductions` from the just-ported `TaxCalculator.jsx` and `generatePaychequeNumber` from `PaychequeNumberGenerator.jsx`. Every business-logic line — gross-earnings computation, vacation-pay bank/release logic, advance balance math, the entire `handleSaveClick` rounding/assembly sequence building `payStubData` — **ported unchanged**, this is pure computation with the entity calls being the only base44-coupled lines in the whole file (confirmed by full read: exactly 4 entity-call sites, `EmployeePayType.filter`/`EmployeeDeduction.filter`/`TaxYearConstant.filter`/`Employee.update`).
- `employee.employee_id` (business key) is what's written to `payStubData.employee_id` — confirmed correct per lesson 1, unchanged.
- `dark:` classes added throughout — the pay-types table, the green/blue/emerald vacation-pay panels, the amber Advance Management card, the purple `alerts` box (§0.2), and every `Input`/`Label`.

**`PaychequeCreator.jsx`** — port of source (132 lines), **with Q2's fix applied**:
```js
// before (bug — returns oldest stub of the year):
const latestStub = stubs.sort((a, b) => new Date(b.pay_date).getTime() - new Date(a.pay_date).getTime()).reverse()[0];

// after (matches BatchPaychequeProcessor's already-correct logic):
const latestStub = stubs.sort((a, b) => new Date(b.pay_date).getTime() - new Date(a.pay_date).getTime())[0];
```
`PayStub.filter({ employee_id: employee.employee_id, year: currentYear })` — simple key-value, no `$in`, works with the Phase 2 shim as-is. The 300ms debounce on YTD load, the loading/no-employee/error states — ported unchanged. `dark:` classes added.

**`Payroll.jsx`** — port of source (484 lines) replacing the Phase 2 placeholder:
- `Employee.list()` (→ `PayPro_Employee` via the shim) filtered to `status === 'active'` client-side, matching source.
- `PayrollSetting.filter({ key: 'period_close_date' })` — simple key-value filter, works as-is.
- `validateDates`/quick-date buttons (This/Last Pay Period, This/Last Month)/employee selection/Single-vs-Batch toggle — pure state logic, ported unchanged.
- **The inline `<style>` employee-checkbox override (lines 403–411 of source) is dropped**, not ported — this is a smaller instance of the same class of problem R14/lesson 7 already flags for PayPRO's global `<style>` block (raw hex `#1f2937` forced via `!important` on a specific checkbox, invisible in dark mode). AutoPRO's `Checkbox` component already renders correctly with `dark:` support out of the box; no replacement override is needed.
- **`handleImportTimeEntries` and its `importTimeData` call live in 5B** — this page wires the button, but the actual import logic (`TimeDataProcessor.jsx`) doesn't exist until 5B ships. Until then, render the button in a disabled state with a "Coming in 5B"-style tooltip, or gate 5A's own verification to Batch-mode-time-import-free scenarios only (manual hour entry) — **do not block 5A's own gate (O-8) on 5B being done**, since the 20-stub recompute test uses each stub's already-known `gross_pay`, not a live time import.
- `BatchPaychequeProcessor` import is wired but its own file doesn't exist until 5B — same "renders once 5B lands" sequencing as `PayrollPagePlaceholder`'s Phase 3 precedent (§Phase 3 3A sequencing note). If 5A ships before 5B, temporarily stub Batch mode's render branch with a "Coming in 5B" placeholder rather than leaving a broken import.
- `dark:` classes added throughout (the pay-period setup card, the blue/indigo Import Time Entries gradient card, the employee selection list).

#### Task List

- [ ] Create `src/components/paypro/payroll/` directory
- [ ] Copy `TaxCalculator.jsx` verbatim, zero modifications
- [ ] Port `PaychequeNumberGenerator.jsx` (`generatePaychequeNumber` only)
- [ ] Port `PaychequeForm.jsx` with import-path swaps + dark-mode classes
- [ ] Port `PaychequeCreator.jsx` with Q2's sort fix + dark-mode classes
- [ ] Replace `src/pages/paypro/Payroll.jsx` placeholder with the real page (Batch-mode render branch stubbed if 5B hasn't landed yet)
- [ ] Confirm `payrollEntities.js` needs zero changes for 5A specifically (simple `.filter()`/`.update()` calls only)

#### Verification Plan

At `test.kensauto.ca`, after commit + push, with a `paypro_user: true`, AAL2 session:

- [ ] `/paypro/Payroll` loads; quick-period buttons populate correct date ranges; period-close-date validation correctly blocks a date on/before the configured `period_close_date` (currently `2026-07-31`) with the correct error message
- [ ] Select Single mode + one employee with existing 2026 stubs → `PaychequeCreator` loads, shows correct current employee info, no console errors
- [ ] **YTD fix check (Q2):** for an employee with 2+ existing 2026 stubs, confirm the YTD figures shown/used are seeded from their **most recent** stub, not their first — cross-check against a direct SQL query for that employee's latest `pay_date` row
- [ ] Manually enter hours for each configured pay type → gross/deductions/net update live and correctly
- [ ] Vacation pay: for an employee with `is_vacation_banked = true` and an existing balance, confirm the Release Banked Vacation Pay panel appears, releases correctly, and the balance math (`current + earned - released`) matches
- [ ] Advance Management: give a new advance and/or deduct from balance → `newAdvanceBalance` computes correctly, persists to `PayPro_Employee.advance_balance` on save
- [ ] Save a paycheque → new `PayPro_PayStub` row created with correct `employee_id` (business key, e.g. `EMP001`), correct `income_breakdown`/`additional_deductions` jsonb (real arrays, not stringified — verify via direct SQL `jsonb_typeof`), correct sequential `paycheque_number`
- [ ] **O-8 gate — 20-stub recompute:** for ≥20 of the 112 existing `PayPro_PayStub` rows (spread across multiple employees, not all from one), take each stub's actual `gross_pay` and its *own preceding* stub's YTD figures (defaulting any `null` `ytd_cpp2` to `0`) as input to `calculatePayrollDeductions`, and confirm the output matches the stub's stored `federal_tax`/`provincial_tax`/`cpp_deduction`/`cpp2_deduction`/`ei_deduction`/`total_deductions`/`net_pay` exactly (to the cent). Any mismatch stops this phase — do not proceed to 5B or Phase 6 until resolved.
- [ ] **O-9 gate — CPP2 synthetic test:** create a dev-only `PayPro_Employee` test row with a plausible current-YTD-gross near/at the $74,600 YMPE floor (via a manually-seeded prior test `PayPro_PayStub`, or by directly passing a high `ytdAmounts.gross` through a one-off script call to `calculatePayrollDeductions`), run a paycheque whose gross pushes YTD earnings into the `[$74,600, $85,000]` CPP2 band, and confirm `cpp2_deduction`/`ytd_cpp2` compute correctly (non-zero, correctly capped at the remaining annual room). Delete the test employee/stub(s) afterward — dev-only, never touches production, never touches a real employee's data.
- [ ] Both light and dark mode: no unstyled elements anywhere across `Payroll.jsx`/`PaychequeCreator.jsx`/`PaychequeForm.jsx`
- [ ] `grep -r "base44"` / `"@base44"` in every new 5A file: zero matches

---

### 5B — Batch Processing & WorkPRO Time Import

**New files:**
- `src/components/paypro/payroll/BatchPaychequeProcessor.jsx`
- `src/components/paypro/payroll/TimeDataProcessor.jsx`

**Modified (pending Q1):** `src/components/paypro/lib/payrollEntities.js`

#### Detailed Execution Plan

**`payrollEntities.js` — `$in` support (pending Q1):**
```js
async filter(queryObject = {}) {
  return fetchAllRows(() => {
    let query = supabase.from(tableName).select('*');
    for (const [column, value] of Object.entries(queryObject)) {
      if (value && typeof value === 'object' && '$in' in value) {
        query = query.in(column, value['$in']);
      } else {
        query = query.eq(column, value);
      }
    }
    return applySort(query, null);
  });
},
```
Minimal, additive change — every existing simple-value call site (all of Phase 3's and 5A's) is unaffected, since the new branch only triggers on an object literally shaped `{'$in': [...]}`.

**`TimeDataProcessor.jsx`** — port of source (130 lines):
- `calculateOvertimeHours`/`processTimeRecords` — pure functions, zero base44 coupling, **ported unchanged** including the Q3 name-match behavior.
- `importTimeData` replaces `base44.functions.invoke('getSupabaseTimeRecords', {...})` with a direct native query, matching Phase 4's own established pattern exactly:
  ```js
  import { supabase } from '@/lib/supabase';

  export const importTimeData = async (startDate, endDate, payproEmployees) => {
    const { data: timeRecords, error } = await supabase
      .from('TimeRecord')
      .select('*')
      .gte('clock_in_time', `${startDate}T00:00:00-06:00`)
      .lte('clock_in_time', `${endDate}T23:59:59-06:00`);
    if (error) throw error;
    // ... unchanged: error-status check, processTimeRecords(timeRecords, payproEmployees) ...
  };
  ```
  Same `-06:00` fixed-offset convention as Phase 4 (§Phase 4 §0.2) — do not change to a timezone-aware comparison.
- **Q3's recommended addition:** after `processTimeRecords` returns, compare `payproEmployees.length` selected-for-import against `Object.keys(processedData).length` — if an employee was expected but produced zero matched records, surface a visible warning in `Payroll.jsx`'s "Time Data Imported" summary panel (not just the existing `console.warn`), so a real payroll run doesn't silently skip someone.

**`BatchPaychequeProcessor.jsx`** — port of source (307 lines), **with Q1's fix applied** at the YTD-lookup call site (§ shim change above handles the translation — this file's own code is otherwise unchanged):
```js
const allStubs = await PayStub.filter({
  employee_id: { '$in': employeeDbIds }, // now correctly translates to .in()
  year: currentYear
});
```
- Paycheque-number pre-generation (scans `PayStub.list()` for the month's existing numbers, assigns sequentially per selected employee) — ported unchanged, already paginated-fetch-safe via the shim.
- The employee stepper (`Badge` list, processed/current/pending states), `PaychequeForm` embedding with `preAssignedPaychequeNumber`, Skip/Add-to-Batch/Submit-All flow, `PayStub.bulkCreate(pendingPaycheques)` — all ported unchanged, pure UI/state logic.
- `dark:` classes added throughout — the stepper badges, the blue-50 review card, the green/red/slate summary stat blocks.

#### Task List

- [ ] Get your Q1 decision (extend the shim's `filter()` for `$in`, or bypass it at this one call site)
- [ ] Apply the chosen `$in` fix
- [ ] Port `TimeDataProcessor.jsx` with the native `TimeRecord` query swap + Q3's visible-warning addition
- [ ] Port `BatchPaychequeProcessor.jsx` with dark-mode classes
- [ ] Wire `Payroll.jsx`'s `handleImportTimeEntries` to the real `importTimeData` (removing 5A's placeholder/disabled state)
- [ ] Wire `Payroll.jsx`'s Batch-mode render branch to the real `BatchPaychequeProcessor` (removing 5A's "Coming in 5B" stub if it was needed)

#### Verification Plan

- [ ] **Q1 fix check:** select 3+ employees with existing 2026 stub history in Batch mode → confirm each employee's `PaychequeForm` shows YTD figures seeded from their real prior stubs (not zero) — cross-check at least one against a direct SQL query for that employee's latest stub
- [ ] Set a pay period matching a real WorkPRO `TimeRecord` date range → "Import Time Entries" → confirm the summary (records found/employees matched/employees with hours) matches a direct SQL count for that range, and that employees are auto-selected
- [ ] Confirm a `TimeRecord` row with `status === 'error'` in the selected range blocks the import entirely, showing the exact error-details message (employee/date/notes) — matches source's guard verbatim
- [ ] For an employee whose WorkPRO hours import correctly, confirm `PaychequeForm`'s pay types are pre-populated with the right hours/rate/amount per `workpro_type`, and that a WorkPRO type with no configured `PayPro_EmployeePayType.workpro_type` match shows the `$0`-rate warning row exactly as source does
- [ ] Process a full batch: step through 3+ employees (mix of Add-to-Batch and at least one Skip), reach Review & Submit, confirm the stepper badges reflect processed/skipped/current state correctly, Submit All → `PayStub.bulkCreate` succeeds, correct count of new rows in `PayPro_PayStub`, navigates to Pay Stubs page (a Phase 6 placeholder today — confirm it doesn't error)
- [ ] Confirm paycheque numbers assigned across the batch are sequential and don't collide with any number generated concurrently via Single mode in the same test session
- [ ] Both light and dark mode: no unstyled elements across `BatchPaychequeProcessor.jsx`
- [ ] `grep -r "base44"` / `"@base44"` in every new 5B file: zero matches

---

### Final Verification Plan (5A + 5B together)

Run after both sub-phases individually pass, at `test.kensauto.ca`, with a real `paypro_user: true` AAL2 session:

- [ ] Full round trip: import WorkPRO time for a real pay period → Batch mode processes 3+ employees (at least one using imported time data, at least one manually entered) → submit → all new stubs' YTD figures correctly chain forward from whatever was most recent *before this test run* (re-confirms Q1 and Q2's fixes interact correctly when Single- and Batch-created stubs for the same employee are interleaved)
- [ ] Re-run the O-8 20-stub gate once more against production-representative dev data if any new real stubs were created during 5B testing (to confirm the fix didn't regress anything the initial 5A pass already proved)
- [ ] Delete every test/synthetic stub and employee created during this phase's verification (the CPP2 test employee, any test batch runs) so dev doesn't carry confusing artificial data into Phase 6/7's testing
- [ ] `git status` confirms no PayPRO source file was copied verbatim without the required changes (import-path swaps, Q1/Q2 fixes, dark-mode pass)

### Handoff Context to Phase 6

- Every `PayPro_PayStub` row this phase creates has `is_paid`/`paid_via` at their column defaults (`null`/`false`) — Phase 6 (Pay Stubs, PDFs, Mark Paid → GL/Bank) is what moves them to a paid state. Nothing in Phase 5 touches GL, Bank, or the Fiscal Period gate.
- The CPP2 synthetic-employee testing technique established here (O-9) is directly reusable for Phase 6/7's own verification if either phase ever needs to exercise a CPP2-bearing stub through Mark Paid/GL posting.
- If Q1 was resolved by extending `payrollEntities.js`, that shim change is now load-bearing for any future phase doing per-employee-batch aggregation (Phase 8's Reports/Trends is the next likely consumer).
- Phase 4's Q3 (employee-name matching gap) now has two confirmed real-world blast points — Phase 4's read-only list view and this phase's silent-zero-hours-on-import — worth resolving at the data level before Phase 8.5's parallel run begins, so it doesn't get mistaken for a parallel-run discrepancy against base44.

---

## 4) Phase Results and Final Context

*(populated during execution — append, never overwrite)*

### 4.1 Execution Log

| Sub-phase | Started | Completed | Notes |
|---|---|---|---|
| 5A | — | — | — |
| 5B | — | — | — |

### 4.2 Deviations from Plan

*None yet.*

### 4.3 Unexpected Learnings

*None yet.*

### 4.4 Rollup Notes for `master_context.md` / `master_blueprint.md`

*(populated as Phase 5 completes)*
