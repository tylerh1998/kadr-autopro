# Phase 5 Implementation Plan — Payroll Calculation & Paycheque Creation

**Parent:** `paypro_blueprint.md` Phase 5 · **Created 2026-08-18** · **Status: Verified 2026-08-18 (live browser pass, in addition to O-8/O-9's earlier non-live computational pass).** The tax engine, D1/D2 fixes, and both Single/Batch paycheque-creation flows were confirmed live against real dev data — see §3's updated checklists.

**Format: multi-phase (5A / 5B)** — see rationale in §1.

> **This is a LIVE document.** §3's sub-phase sections and §4 are the working area, updated during execution. Do not wipe prior content — append and adjust.

---

## 0) Notes, Open Questions & Clarifications

### 0.1 Decisions taken (resolved 2026-08-18, before execution)

**D1 — `BatchPaychequeProcessor.jsx`'s YTD lookup uses a Mongo-style `$in` operator the Phase 2 shim doesn't support.** Verified: `PayStub.filter({ employee_id: { '$in': employeeDbIds }, year: currentYear })` is the **only** `$in` usage anywhere in the entire `kadr-paypro` source (grepped the whole `src/` tree). `payrollEntities.js`'s `filter()` (Phase 2) only implements plain-value `.eq()` chaining — passed a `{'$in': [...]}` object as a filter value, it would call `.eq('employee_id', {'$in':[...]})`, comparing a text column against a JSON object. This **matches zero rows silently, throws no error**, and Batch mode (the app's default `processingMode`) is the primary real-world path. The practical effect: every batch-created paycheque would compute tax/CPP/EI withholding from a YTD of zero, regardless of how many real stubs that employee already has this year — a materially wrong, silent-failure class of bug (§3's "no visible error" pattern), on the highest-risk phase in the whole engagement. **Decision: extend `payrollEntities.js`'s `filter()` to recognize a `{'$in': array}` value and translate it to `.in(column, array)`.** Small, generic, and consistent with Phase 2's own stated design goal ("every future page/component port is an import-path swap only, not a rewrite") — every other call site's code stays untouched, and any future phase that needs the same Mongo-style operator (T4s/Reports in Phase 8 do similar per-employee aggregation) gets it for free.

**D2 — `PaychequeCreator.jsx`'s single-employee YTD lookup has a confirmed double-sort bug that returns the *oldest* stub of the year, not the latest.** The exact line: `stubs.sort((a, b) => new Date(b.pay_date).getTime() - new Date(a.pay_date).getTime()).reverse()[0]` — sorts newest-first, then `.reverse()`s to oldest-first, then takes index `0`. Despite being named `latestStub`, this returns the **first** stub of the year. Confirmed by direct comparison: `BatchPaychequeProcessor.jsx`'s equivalent lookup (`.sort((a,b) => new Date(b.pay_date) - new Date(a.pay_date))[0]`, no `.reverse()`) correctly returns the newest. **Practical effect:** creating a second-or-later paycheque through Single mode for any employee seeds their tax/CPP/EI calculation from their *first* stub's YTD figures instead of their most recent — understating YTD contributions and therefore miscalculating this period's tax room for anyone paid more than twice in a year via that mode. **Decision: fix during the port** — drop the stray `.reverse()` so Single mode matches Batch mode's already-correct logic. This is a genuine correctness bug, not a stylistic difference, and porting it forward would leave the two paths permanently inconsistent for the same job.

**D3 — (informational, carried from Phase 4)** `TimeDataProcessor.jsx`'s employee match (`\`${emp.first_name} ${emp.last_name}\` === record.employee_name`) has the identical gap Phase 4's Q3 documents (confirmed live: WorkPRO's `"Sam Eyben"` vs `PayPro_Employee`'s `"Samantha Eyben"`, EMP007). In Phase 4 this only affected a read-only list view; here it means **"Import Time Entries" silently imports zero hours** for that employee (a `console.warn`, no UI-visible error) — a real paycheque could be created for them with $0 gross from time data, easy to miss in a busy batch run. **Decision: same disposition as Phase 4 — port as-is**, since EMP007 is already a known, low-impact, currently-inactive-employee gap (§Phase 4 Q3), and add a UI-visible warning (not just a `console.warn`) when an employee is selected for batch processing but the time-import summary shows zero matched records for them, so a real operator doesn't miss it silently at the point it actually costs someone a paycheque.

### 0.2 Clarifications (not questions — stating so nothing here reads as an oversight)

- **`TaxCalculator.jsx` has zero imports — it's a pure, self-contained computation module.** Confirmed by full read (214 lines). This is the single easiest byte-identical port in the entire engagement: copy the file verbatim into `src/components/paypro/payroll/TaxCalculator.jsx` with no changes whatsoever, not even an import-path swap (it has none to swap).
- **Real 2026 `PayPro_TaxYearConstant` data confirmed shape-compatible** — verified live: `federal_tax_brackets`/`provincial_tax_brackets_ab` are genuine `{min, max, rate}` array-of-objects, lowest bracket first, `max: null` on the top bracket, matching exactly what `calculateTax()` expects. The 15 Phase-1-corrected numeric columns (`cpp_max_pensionable_earnings`, `ei_max_insurable_earnings`, etc.) are consumed directly by `calculateCPP`/`calculateCPP2`/`calculateEI` with no further casting needed — per `master_context.md` §3, PostgREST serializes these as real JSON numbers to the frontend regardless of how a raw SQL client happens to display them.
- **`Payroll.jsx`'s own `periodCloseDate`/`validateDates` gate is a distinct, pre-existing PayPRO concept — not the same thing as AutoPRO's `checkFiscalPeriodStatus()`.** It reads `PayrollSetting.value` for `key: 'period_close_date'` (ported in Phase 3's Setup page) and blocks pay-period dates on/before that date. This is **not** the blueprint's Q8 Fiscal Period gate — that gate (checking AutoPRO's own `FiscalPeriod` table before any GL-affecting write) is approved for **Phase 6** (Mark Paid), not Phase 5, since nothing in Phase 5 posts to GL or moves money — it only creates a `PayPro_PayStub` row in an unpaid state (`is_paid`/`paid_via` are both untouched here, set later by Phase 6). Port `validateDates` unchanged; do not add the AutoPRO fiscal gate to this phase.
- **`employee.alerts` (`PaychequeForm.jsx` line 332) degrades gracefully regardless of Phase 3's D1** (`PayPro_Employee.alerts` — resolved: the column gets added). The check is `employee.alerts && employee.alerts.replace(...)` — short-circuits cleanly on `undefined`, never throws. No coordination needed between the two phases on this specific point.
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
| O-5 | `PaychequeCreator.jsx` ported (Single mode) — YTD lookup **fixed per D2**, wraps `PaychequeForm` |
| O-6 | `BatchPaychequeProcessor.jsx` ported (Batch mode) — multi-employee stepper, YTD lookup **fixed per D1**, bulk `PayStub.bulkCreate` |
| O-7 | `TimeDataProcessor.jsx` ported — native `TimeRecord` query (direct, not via `getSupabaseTimeRecords`), daily regular/OT split, PTO/Stat aggregation |
| O-8 | **Phase gate:** ≥20 of the 112 imported paystubs, recomputed through the ported engine using each stub's own actual prior-YTD state, match base44's stored values exactly on all 8 fields (gross, federal, provincial, CPP, CPP2, EI, total deductions, net) |
| O-9 | **CPP2 gate:** a synthetic dev-only employee above the $74,600 YMPE floor validates `calculateCPP2` end-to-end — the only way this path gets exercised, since no real 2026 employee crosses it (confirmed: highest earner, EMP001, sits at $44,882.99 YTD through mid-August, annualizing to ~$71k) |
| O-10 | Dark mode shipped from the start on every ported file (lesson 27) |
| O-11 | Zero new base44 references; zero new edge functions (this phase is pure frontend + existing `PayPro_*`/`TimeRecord` tables, no new server-side surface) |

### Explicitly NOT in scope

- Pay Stubs list/PDF/email, Mark Paid → GL/Bank posting (Phase 6) — this phase only creates `PayPro_PayStub` rows in an implicitly-unpaid state (`is_paid`/`paid_via` untouched, left to their column defaults)
- Any Fiscal Period (`FiscalPeriod`/`checkFiscalPeriodStatus()`) gate — approved for Phase 6 only (§0.2)
- Remittances (Phase 7), T4s/Reports/Trends (Phase 8)
- Fixing the Phase 4 Q3 employee-name-matching gap at its source (roster/data correction) — restated here (D3) because this is where it actually costs a real paycheque, not fixed here either
- Any new edge function — everything in this phase runs client-side against tables already RLS-gated by Phase 1

### Why multi-phase (5A/5B), not single

Phase 5 has two genuinely distinct risk/dependency profiles, closer to Phase 3's rationale than Phase 4's:

- **5A** is the core tax engine + the simplest paycheque-creation path (Single mode) — self-contained, no dependency on Phase 4, no shared-shim change, gated entirely by the 20-stub recompute match (O-8) and the CPP2 synthetic test (O-9). This is where CRA-compliance risk concentrates.
- **5B** is Batch mode + WorkPRO time import — depends on Phase 4 being functionally sound (time-record matching), requires a change to the shared Phase 2 shim (`$in` support, per D1), and carries its own distinct correctness risk (D1's silent-zero-YTD bug) independent of the tax math itself.

Each is independently verifiable: 5A can be fully proven correct (tax math matches base44 exactly) before 5B's plumbing is even touched, and a 5B-specific bug can't be mistaken for a tax-math regression since 5A will already have an independent, passing gate.

---

## 2) Lessons Learned & Context

Pulled from `paypro_blueprint.md` §7 and `master_context.md`, filtered to what actually bites this phase.

| # | Lesson | How it applies here |
|---|---|---|
| 11 | `TaxCalculator.jsx` is ported byte-identical. No refactor, no cleanup. Its CPP2 path is unexercised by all historical data — correctness rests entirely on fidelity of the port | O-1, O-9. This is *the* rule this phase exists to satisfy. |
| 1 | `employee_id` carries three meanings | `PayPro_PayStub.employee_id` is the **business key** (`EMP001`) — confirmed live. `PayPro_EmployeePayType`/`EmployeeDeduction`'s `employee_id_ref` is the **system id** (`PayPro_Employee.id`). `PaychequeForm.jsx`/`PaychequeCreator.jsx`/`BatchPaychequeProcessor.jsx` already use the correct one of each in every call site — confirmed by direct read, ported unchanged. |
| 4/19 | CSV type inference silently mis-typed columns that happened to be all-zero/all-blank; dollar/rate columns are never `bigint` | Directly why `PayPro_PayStub.cpp2_deduction`/`ytd_cpp2` are `double precision` today (Phase 1 fix, R19) — confirmed live: every existing stub's `ytd_cpp2` is `null`, not `0`; every read must default it (`latestStub.ytd_cpp2 || 0`), matching what the source already does. |
| 6 | The shim owns id generation and audit fields | `PayStub.create()`/`.bulkCreate()` via `payrollEntities.js` — already implemented, needs zero changes for 5A. 5B needs the `$in` extension only (D1), nothing else. |
| 16 | A jsonb array column can hold a double-encoded string | `income_breakdown`/`additional_deductions` — both built as real JS arrays in `PaychequeForm.jsx`'s `handleSaveClick`, passed straight to `PayStub.create()`. The shim's jsonb passthrough (Phase 2) never `JSON.stringify()`s — confirmed still correct, no change needed. |
| 27 | Dark mode is first-class | O-10. Every one of the six Phase 5 files ships `bg-slate-50`/`bg-white`/`text-slate-900`-only classes today. |
| 28 | `cn()`/tailwind-merge silently drops conflicting utilities | Applies to `PaychequeForm.jsx`'s collapsible Advance Management `Card` and the batch stepper's `Badge` list — verify rendering after porting, not just compilation. |
| master_context.md §3 | Text-typed number fields need explicit casts before arithmetic, explicit stringify before write | `PayPro_PayStub.pay_period_start`/`pay_period_end`/`pay_date` are `text` (confirmed live) — the ported code already writes plain `YYYY-MM-DD` strings (`payPeriod.start` etc.) directly, no cast needed; don't introduce one. |
| paypro_blueprint.md §3, R3 | CRA tax math drifts during the port — Phase 5 gate: recompute ≥20 of 112 stubs, exact match on all 8 fields. All stubs are 2026, 2026 constants loaded, fully exercisable | O-8 — see §3.5 Final Verification for the concrete procedure, built against real confirmed data (e.g. EMP001's 16-stub 2026 sequence, read live during this plan's research). |
| paypro_blueprint.md §5, Phase 5 text | **Nobody crosses the CPP2 floor in 2026** — confirmed again during this plan's research (EMP001 highest at ~$71k annualized, next-highest EMP002 ~$62k) | O-9 is the *only* real test CPP2 will ever get before an employee's pay organically grows past $74,600, plausibly 2027+. |
| master_context.md §4.10 | `TimeRecord` keyed by `employee_name` (free text) | Directly D3 — `TimeDataProcessor.processTimeRecords()`'s employee match. |
| Workflow constraints 30–32 | `git push` doesn't work from an agent session · `main` never touched without an explicit ask · production DB writes need re-confirmation | The CPP2 synthetic employee (O-9) is created **on dev only**, deleted after the test — never touches production. |

---

## 3) Phase 5 Roadmap & Progress

| Sub-phase | Status | Overview |
|---|---|---|
| 5A | Verified 2026-08-18 (live) | Tax engine (byte-identical), paycheque numbering, `PaychequeForm`/`PaychequeCreator`/`Payroll.jsx` page — Single-mode paycheque creation, end to end |
| 5B | Verified 2026-08-18 (live) | `BatchPaychequeProcessor` (needs shim `$in` fix, D1) + `TimeDataProcessor` (WorkPRO time import, depends on Phase 4) |

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

**`PaychequeCreator.jsx`** — port of source (132 lines), **with D2's fix applied**:
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

- [x] Create `src/components/paypro/payroll/` directory
- [x] Copy `TaxCalculator.jsx` verbatim, zero modifications — `diff`-confirmed byte-identical against source
- [x] Port `PaychequeNumberGenerator.jsx` (`generatePaychequeNumber` only)
- [x] Port `PaychequeForm.jsx` with import-path swaps + dark-mode classes
- [x] Port `PaychequeCreator.jsx` with D2's sort fix + dark-mode classes
- [x] Replace `src/pages/paypro/Payroll.jsx` placeholder with the real page — wired directly to the real `BatchPaychequeProcessor` (no stub needed, see §4.2: 5A+5B built together in one pass since Phase 4 landed first)
- [x] Confirm `payrollEntities.js` needs zero changes for 5A specifically (simple `.filter()`/`.update()` calls only) — confirmed by full read before D1's change

#### Verification Plan

At `test.kensauto.ca`, after commit + push, with a `paypro_user: true`, AAL2 session:

- [x] `/paypro/Payroll` loads with 9 active employees, Single/Batch toggle. Period-close-date validation confirmed working: setting a period on/before `2026-07-31` produced the exact expected error, "One or more dates fall within a closed period (on or before 2026-07-31). Please select a later date."
- [x] Single mode + Ryley Bates (EMP001, existing 2026 stubs) → `PaychequeCreator` loaded correctly with real pay types (Regular/Overtime/Stat Holiday/PTO at his real rates), no console errors
- [x] **D2 YTD fix — confirmed live, not just via the earlier computational pass.** EMP001's actual latest 2026 stub (2026-08-14) has `ytd_gross: 44882.99`. Created a real 80hr/$2600-gross test paycheque through the live UI; the resulting saved row's `ytd_gross` was `47482.99` — exactly `44882.99 + 2600`, proving the fix correctly seeds from the **latest** stub. (Deleted after confirming — see cleanup note below.)
- [x] Entered 80 Regular hours → gross/deductions/net updated live and correctly: EI $42.38 (2600 × 1.63%), federal $250.56 + provincial $117.54 (Income Tax $368.10 combined, matches UI), CPP $146.02, Net $2043.50 — all internally consistent and confirmed via the saved row
- [x] Vacation pay: Elisa Haney (EMP002, `is_vacation_banked=true`, $375.20 balance) — Release Banked Vacation Pay panel appeared correctly in Batch mode; balance math confirmed exactly: "New Balance After This Period: $469.00 (Current: $375.20 + Earned: $93.80 - Released: $0.00)" where $93.80 = 4% of her $2345 salary
- [ ] Advance Management — not independently exercised this pass (Current Balance was $0 for all test subjects; the give/deduct flow itself wasn't triggered)
- [x] Saved a real paycheque via Single mode → `PayPro_PayStub` row created with correct business-key `employee_id: 'EMP001'`, real (non-stringified) `income_breakdown` jsonb array, sequential `paycheque_number: '202608-012'`. Deleted after confirming (see cleanup note).
- [x] **O-8 gate — 20-stub recompute — PASSED, via SQL + standalone script (non-live, no browser needed).** Ran against **all 112** real 2026 `PayPro_PayStub` rows across all 11 employees (5.6x the ≥20 minimum), not just a sample — see §4.3 for the full methodology and an important finding: 90/112 stubs (100% of stubs from ~late-May 2026 onward, spanning EMP001/002/003/004/006/008/009/010/011) match **exactly to the cent** on all of federal/provincial/CPP/CPP2/EI/total/net once real `additional_deductions` are included. CPP/CPP2/EI matched on **all 112 of 112** with zero exceptions. The remaining 22 (EMP001 Jan–May, EMP002 Jan–May, EMP003 Jan–Feb) mismatch only on federal/provincial income tax and are fully explained by a real historical TD1/constants change in the source system partway through 2026 predating the current single `PayPro_TaxYearConstant` snapshot — not a porting defect. Full detail in §4.3.
- [x] **O-9 gate — CPP2 synthetic test — PASSED, via standalone script (non-live, computational path per the plan's own alternative — no dev DB row created, nothing to delete).** 7 scenarios covering: below-floor (0), crossing the $74,600 floor mid-period, fully inside the band, crossing the $85,000 ceiling mid-period, remaining-annual-room capping, `is_cpp_exempt` short-circuit, and full end-to-end `calculatePayrollDeductions` integration. All 7 passed exactly against hand-derived expected values. See §4.3.
- [ ] Dark mode contrast sweep not independently re-run on the Payroll pages specifically this pass (run on Employees/Setup/Time Records; the same Tailwind `dark:` conventions apply, low incremental risk)
- [x] `grep -r "base44"` / `"@base44"` in every new 5A file: zero matches

**Incidental finding (display-only, not a data-integrity bug, not a 5A regression):** `PaychequeCreator.jsx:103-104,108-109` and `PaychequeForm.jsx` (via the same pattern) render `payPeriod.start`/`.end`/`.payDate` through `new Date(dateString).toLocaleDateString('en-CA')` for on-screen display — since these are plain `YYYY-MM-DD` strings, this parses as UTC midnight and can render one day early in a timezone behind UTC (confirmed live: entered `2026-08-16`/`2026-08-31`, header displayed "2026-08-15 to 2026-08-30"). **The actual save path is unaffected** — `pay_period_start`/`pay_period_end`/`pay_date` in `handleSaveClick` use the raw string state directly, confirmed via the saved test row showing the correct `2026-08-16`/`2026-08-31` values. **Confirmed byte-identical to the base44 source** (same lines in `kadr-paypro`) — pre-existing, not introduced by this port. A related, slightly more consequential latent instance of the same pattern: `new Date(payPeriod.payDate).getFullYear()` (lines 29/47/280, used to pick the tax year for `TaxYearConstant` lookup and the saved `year` field) could select the *wrong year* for a pay date of Jan 1st specifically, in a UTC-behind timezone — also byte-identical to base44, not exercised by this test (no Jan 1 pay date tested), worth a note for whoever handles Phase 8's year-end/T4 work or a future January payroll run.

---

### 5B — Batch Processing & WorkPRO Time Import

**New files:**
- `src/components/paypro/payroll/BatchPaychequeProcessor.jsx`
- `src/components/paypro/payroll/TimeDataProcessor.jsx`

**Modified (per D1):** `src/components/paypro/lib/payrollEntities.js`

#### Detailed Execution Plan

**`payrollEntities.js` — `$in` support (per D1):**
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
- `calculateOvertimeHours`/`processTimeRecords` — pure functions, zero base44 coupling, **ported unchanged** including the D3 name-match behavior.
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
- **D3's addition:** after `processTimeRecords` returns, compare `payproEmployees.length` selected-for-import against `Object.keys(processedData).length` — if an employee was expected but produced zero matched records, surface a visible warning in `Payroll.jsx`'s "Time Data Imported" summary panel (not just the existing `console.warn`), so a real payroll run doesn't silently skip someone.

**`BatchPaychequeProcessor.jsx`** — port of source (307 lines), **with D1's fix applied** at the YTD-lookup call site (§ shim change above handles the translation — this file's own code is otherwise unchanged):
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

- [x] Apply D1's `$in` extension to `payrollEntities.js`'s `filter()`
- [x] Port `TimeDataProcessor.jsx` with the native `TimeRecord` query swap + D3's visible-warning addition
- [x] Port `BatchPaychequeProcessor.jsx` with dark-mode classes
- [x] Wire `Payroll.jsx`'s `handleImportTimeEntries` to the real `importTimeData`
- [x] Wire `Payroll.jsx`'s Batch-mode render branch to the real `BatchPaychequeProcessor`

#### Verification Plan

- [x] **D1 `$in` fix — confirmed live with real, non-zero, correctly-chained YTD.** Batch-processed 3 real employees (Ryley/EMP001, Elisa/EMP002, Marley/EMP011). Saved results: EMP001 `ytd_gross: 46182.99` = his prior `44882.99 + 1300` this period, exactly. EMP002 and EMP011 also showed non-zero, correctly-chained YTD. If the `$in`→`.eq()` bug were still present, all three would have shown ~zero prior YTD; they didn't. (Test paycheques deleted after confirming.)
- [x] Set the pay period to `2026-08-01`–`2026-08-15` (a range with real unlocked WorkPRO clock data) and clicked Import Time Entries → summary panel showed "✓ Time Data Imported" with correct per-employee hour totals (Ryley 42.1h, Marley 33.3h, Annika 29.9h, Tyler 4.0h, +1 more) and correctly listed **D3's visible warning**: "No time records matched for: Elisa Haney, Cheryl Lawrence, Glenda Millhouse, Anne Fehr. They will show $0 hours from WorkPRO unless entered manually — check for a name mismatch." Also auto-selected the 5 matched employees. (First attempt was silently cancelled by the environment's auto-declined `window.confirm()` prompt — "Have you verified the Time Records..." — not an app bug, just needed the automation harness to override `confirm()`.)
- [x] Error-status import guard confirmed present and correct via code read (`TimeDataProcessor.jsx:104-114`) — not exercised against a live `status='error'` row this pass (none existed in the tested date range)
- [x] Ryley's imported hours correctly pre-populated `PaychequeForm`'s pay types with real computed line totals: Regular $1040.00 (32h × $32.50), Overtime $104.00, Stat Holiday $260.00 — summing to the 42.1h the import summary reported
- [x] Processed a full 3-employee batch (Ryley/Elisa/Marley) through Add-to-Batch & Next for all three, reached Review & Submit ("3 Successful / 0 Skipped / 3 Total / $2756.63 Total Net Pay"), Submit All → all 3 `PayPro_PayStub` rows created correctly with matching `net_pay` figures. (Deleted after confirming — see cleanup note.)
- [x] Paycheque numbers sequential and collision-free across Single- and Batch-mode tests in the same session: `202608-012` (Single, deleted) → batch reused `012/013/014` correctly after the Single one was deleted, then a later Import-Time-Entries batch would have continued from `015` (not actually submitted, cancelled before Submit)
- [ ] Dark mode not independently re-checked on `BatchPaychequeProcessor.jsx` specifically this pass
- [x] `grep -r "base44"` / `"@base44"` in every new 5B file: zero real SDK references — one explanatory code comment in `TimeDataProcessor.jsx` names the deleted `getSupabaseTimeRecords` base44 function to document what replaced it

**All test data cleaned up after verification** — 3 batch-mode PayStub rows and 1 single-mode PayStub row deleted via SQL; final count confirmed back to the real 112-row baseline (0 leftover rows matching the test paycheque numbers).

---

### Final Verification Plan (5A + 5B together)

Run after both sub-phases individually pass, at `test.kensauto.ca`, with a real `paypro_user: true` AAL2 session:

- [x] Full round trip confirmed across two separate live tests this pass: 5A's Single-mode paycheque for EMP001 correctly chained onto his real prior YTD (D2), and 5B's 3-employee batch (including EMP001 again, processed after the Single-mode one was deleted) also chained correctly (D1) — both fixes independently confirmed live, in the same session, against the same employee's real data
- [x] Not re-run — all test stubs created during this live pass were deleted immediately after confirming their values, so there is no new real data in `PayPro_PayStub` to re-gate. The O-8 112-stub gate itself is unaffected (it only ever touched pre-existing real rows, none of which were modified).
- [x] Not applicable yet — no test/synthetic stub or employee was created (O-9 ran via the computational path, §4.3), so there is nothing to delete before live testing begins
- [x] `git status` confirms no PayPRO source file was copied verbatim without the required changes — `payrollEntities.js`/`Payroll.jsx` show as modified (pre-existing files), the entire `src/components/paypro/payroll/` directory is new; every ported file carries its required change (import-path swap, D1/D2/D3 fix, or dark-mode pass) per §4.3

### Handoff Context to Phase 6

- Every `PayPro_PayStub` row this phase creates has `is_paid`/`paid_via` at their column defaults (`null`/`false`) — Phase 6 (Pay Stubs, PDFs, Mark Paid → GL/Bank) is what moves them to a paid state. Nothing in Phase 5 touches GL, Bank, or the Fiscal Period gate.
- The CPP2 synthetic-employee testing technique established here (O-9) is directly reusable for Phase 6/7's own verification if either phase ever needs to exercise a CPP2-bearing stub through Mark Paid/GL posting.
- D1 was resolved by extending `payrollEntities.js`, so that shim change is now load-bearing for any future phase doing per-employee-batch aggregation (Phase 8's Reports/Trends is the next likely consumer).
- Phase 4's Q3 (employee-name matching gap) now has two confirmed real-world blast points — Phase 4's read-only list view and this phase's silent-zero-hours-on-import — worth resolving at the data level before Phase 8.5's parallel run begins, so it doesn't get mistaken for a parallel-run discrepancy against base44.

---

## 4) Phase Results and Final Context

*(populated during execution — append, never overwrite)*

### 4.1 Execution Log

| Sub-phase | Started | Completed | Notes |
|---|---|---|---|
| 5A | 2026-08-18 | 2026-08-18 (code + non-live verification); live verification in progress | All 5 new files + `Payroll.jsx` written, O-8/O-9 gates passed computationally. Live browser checks (§3's `HOLD` items) are now being run by a separate parallel agent session, not this one — results to be folded back in once reported. |
| 5B | 2026-08-18 | 2026-08-18 (code + non-live verification); live verification in progress | Built in the same pass as 5A (Phase 4 had already landed via the parallel agent work, so there was no reason to sequence 5A before 5B or stub Batch mode). Live verification tracked jointly with 5A above. |

### 4.2 Deviations from Plan

- **5A and 5B were executed together in one pass, not sequenced with a stub in between.** §1's roadmap assumed 5B might not have landed when 5A shipped ("Batch-mode render branch stubbed if 5B hasn't landed yet"). By the time this phase started, Phase 3 and Phase 4 had already been executed by parallel agents (confirmed via `git status`: `TimeRecords.jsx`, `Employees.jsx`, `Setup.jsx`, `EditEmployee.jsx` all real, not placeholders; `paypro-generateTimeReport`/`paypro-uploadEmployeeFile`/`paypro-viewEmployeeFile` edge functions present) — so 5B's only real dependency (Phase 4 functionally sound) was already satisfied, and there was no reason to build a throwaway "Coming in 5B" placeholder just to delete it minutes later. `Payroll.jsx` wires directly to the real `BatchPaychequeProcessor` and real `importTimeData`.
- **O-9 used the plan's own computational alternative, not a dev-DB synthetic employee.** Per your instruction to do all non-live work and hold for live testing, O-9 was run as a standalone Node script directly exercising `calculateCPP2`/`calculatePayrollDeductions` (the plan's explicitly offered alternative — "directly passing a high `ytdAmounts.gross` through a one-off script call"). No `PayPro_Employee` or `PayPro_PayStub` test row was created on dev, so there is nothing to clean up before live testing begins.
- **O-8 was run against all 112 real 2026 `PayPro_PayStub` rows, not a 20-stub sample.** Since this was a SQL + script exercise (not a manual live-UI walkthrough), testing the full population was no more expensive than a sample and gives a materially stronger result — see §4.3.

### 4.3 Unexpected Learnings

- **O-8 finding — early-2026 historical stubs don't recompute against the *current* `PayPro_TaxYearConstant`/TD1 snapshot, and this is real historical data behavior, not a port defect.** Recomputing all 112 real 2026 `PayPro_PayStub` rows (11 employees) through the ported `calculatePayrollDeductions`, using each stub's own actual prior-YTD state (derived per-row as `stored_ytd_X − this_period_X`, which is exact and immune to same-day pay-date ties — two `EMP008` stubs share `pay_date = 2026-01-16`):
  - **CPP, CPP2, and EI matched exactly on all 112 of 112 stubs, zero exceptions.**
  - **Federal and provincial income tax matched exactly on 90 of 112 stubs** — and critically, the 22 that didn't match are **not scattered randomly**; they're a clean, contiguous block: every EMP001 stub from `2026-01-16` through `2026-05-16` (9 stubs), every EMP002 stub from `2026-01-14` through `2026-05-19` (10 stubs), and EMP003's first 3 stubs (`2026-01-16` through `2026-02-16`). Every stub after each employee's own cutoff date matches exactly — EMP001 from `2026-05-31` on, EMP002 from `2026-06-02` on, EMP003 from `2026-03-01` on.
  - Hand-verifying one example (EMP002, `2026-01-14`, $2,345 bi-weekly gross): the current constants/TD1 produce federal tax of $225.98, but the stub has $221.30 stored — while every EMP002 stub from `2026-06-02` onward, same $2,345 gross, computes to exactly $225.98, matching stored. This is only explainable by a real change (a TD1 amount update, or a constants correction) that happened in the source system partway through 2026, whose effect is captured in the single current `PayPro_TaxYearConstant`/`PayPro_Employee` snapshot but was never retroactively applied to the older imported stub rows (correctly — you don't rewrite history). Since CPP/CPP2/EI (which don't depend on TD1 basic amounts) are perfect across all 112 stubs and post-cutoff federal/provincial tax is also perfect, this is strong evidence the port itself is correct, not a tax-engine bug.
  - **total_deductions/net_pay reconcile exactly on the same 90 stubs once real `additional_deductions` are included** — EMP002 carries a constant $700/period fixed deduction ("Apply to AR Balance" $200 + "Dave Loan" $500) and EMP004 carries a percentage-type "Garnishment" that varies by period ($552.51–$837.02); both fully account for the total/net gap once added to the 5 statutory components, confirming `PaychequeForm.jsx`'s `calculatedTotalDeductions` assembly logic (statutory + additional + advance) is correctly modeled by the port.
  - **Recommendation carried to Phase 6/7:** don't be alarmed if a future audit finds early-2026 stubs "don't match" current constants — that's expected and explained here, not a regression. Worth a one-line mention in `master_context.md` if Phase 8's Reports/T4s ever recomputes historical stubs for a year-end reconciliation.
- **`PayPro_Employee.federal_td1_basic`/`provincial_td1_basic` are `numeric` columns but come back as JSON *strings* from a raw SQL client (e.g. the Supabase MCP `execute_sql` tool)** — confirmed via `information_schema.columns`. This is a serialization quirk of the direct-Postgres-client path used for ad-hoc SQL, not what the real app sees: `master_context.md` §3 already documents that PostgREST (what `supabase-js`/the actual ported code uses) serializes `numeric` as a real JSON number. No code changes needed — `TaxCalculator.jsx`'s unmodified arithmetic (`basicPersonalFederal + annualTaxCreditsBase`, relying on numeric `+`) is correct for the real runtime path. Flagged here only so a future agent debugging via raw SQL doesn't mistake the string serialization for the actual column type or a live bug.
- **Two `EMP008` stubs share the identical `pay_date` (`2026-01-16`)** — confirmed live. Deriving each stub's own prior-YTD state via subtraction (`stored_ytd_X − this_period_X`) rather than trying to determine chronological order by `pay_date` sidesteps this tie cleanly; a same-day-tie-breaking approach based on sort order would have been fragile here.
- **A real, blocking bug was found and fixed during the live verification pass — not a Phase 5 file, but it was blocking forward progress on the same test session, so it was fixed and deployed here rather than left for a separate pass.** `paypro-uploadEmployeeFile`/`paypro-viewEmployeeFile` (Phase 3B, employee file storage) both destructured `const { body } = await req.json()`, but the frontend sends the payload flat via `supabase.functions.invoke(name, { body: payload })` — matching every other working edge function in the app (`autopro-calculateBankBalances`, `autopro-transferFunds`, `autopro-getworkorderlist`, all confirmed reading fields directly off `req.json()`, no nested `body` key). The mismatch meant every field silently came back `undefined`, tripping each function's own required-field validation. Fixed to `const body = await req.json().catch(() => ({}))` in both, redeployed to dev (`sitihbdnuxifwibontcm`, both now version 2, live). Also fixed a second, related bug while in there: `EmployeeFileModal.jsx`'s `reader.onload` async callback had no `try/catch`, so any error thrown inside it — this one included — became an unhandled promise rejection instead of a user-facing `alert()`, leaving the "Uploading..." button spinning forever with no feedback. Wrapped in `try/catch/finally` so `setUploading(false)` always runs. **You confirmed this fix manually.** Worth a mirroring note in `phase_3_implementation_plan.md`'s own execution log/learnings, since the affected files are that phase's, not this one's.

### 4.4 Rollup Notes for `master_context.md` / `paypro_blueprint.md`

**Live verification completed 2026-08-18** (see §3's updated checklists for full detail). Both D1 (`$in` shim fix) and D2 (YTD sort-order fix) confirmed correct against real saved data, not just the earlier computational pass — created real Single- and Batch-mode paycheques for EMP001/002/011, verified their `ytd_gross` chained correctly onto real prior stubs, then cleaned up all test rows. `is_ei_exempt`/`is_cpp_exempt` flags confirmed correctly respected live (EMP002 legitimately shows $0 EI, non-zero CPP). Vacation-pay banking math confirmed exact. Period-close-date validation confirmed blocking with the correct message. One incidental, pre-existing (non-regression, byte-identical-to-base44) display bug found: `PaychequeCreator.jsx`/`PaychequeForm.jsx` render pay-period dates one day early in a UTC-behind timezone (display only — the actual saved `pay_period_start`/`end`/`pay_date` are correct); a related latent instance (`new Date(payPeriod.payDate).getFullYear()` picking the wrong tax year for a Jan-1 pay date) is worth flagging to whoever handles Phase 8 or a future January payroll run. Not independently re-verified this pass: Advance Management give/deduct flow, dark-mode contrast on the Payroll-specific pages, and the non-`paypro_user` access gate (the last needs a second credentialed account — password entry is prohibited for this agent).
