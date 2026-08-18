# Phase 8 Implementation Plan — T4s, Reports, Trends & Logo Repoint

**Parent:** `master_blueprint.md` Phase 8 · **Created 2026-08-18** · **Status: Approved — ready to execute** (both open questions resolved 2026-08-18, see §0.1)

**Format: multi-phase (8A / 8B / 8C)** — see rationale in §1.

> **This is a LIVE document.** §3's sub-phase sections and §4 are the working area, to be updated during execution. Do not wipe prior content — append and adjust.

---

## 0) Open Questions, Decisions & Clarifications

### 0.1 Decisions taken on the two open questions (resolved 2026-08-18, before execution)

**Q1 — RESOLVED: Option A, port what exists only.** No CRA XML export is built in this phase. `T4s.jsx`/`T4_PDF.jsx`/`T4A_PDF.jsx` ship exactly what source has — HTML/print T4 and T4A slips. `master_blueprint.md`'s "CRA XML validates" gate text is stale and will be corrected at rollup (§4.4). If real CRA electronic filing is ever wanted, it's a future, separately-scoped initiative (potential 8D), not part of this build.

**Q2 — RESOLVED: real CRA Business/Payroll (RP) account number provided: `893497602RP0001`.** Hardcoded into both `T4_PDF.jsx` and `T4A_PDF.jsx` alongside the corrected company name/address — same convention as the address/phone already hardcoded verbatim throughout this codebase, no config table. §3 (8A) is written against this value directly.

*(Original open-question framing preserved for context — both are now decided, not open.)*

#### Q1 reasoning (resolved above as port-what-exists)

`master_blueprint.md`'s Phase 8 text says "T4s and the CRA XML export are the compliance-critical piece," and its own Phase 8/8.5 verification gates both say **"CRA XML validates."** I read PayPRO's actual T4 code (`T4s.jsx`, `T4_PDF.jsx`, `T4A_PDF.jsx`) directly and grepped the whole `kadr-paypro` repo (`src/` and `base44/`) for "XML" — **there is no XML export anywhere.** The entire T4 feature is: select employees + year → aggregate that year's stubs into CRA box values → open an HTML document per employee (and one T4A summary) in a new tab for the user to print/save as PDF. There is nothing to "port" for XML because it was never built in the source system — this is the same shape of gap Phase 7 found with `paypro-postRemittanceGL` (a planned function that turned out unnecessary), except here the gap is a planned *feature*, not a planned function.

A real CRA T4 "Internet File Transfer" XML export is a genuinely separate, substantial deliverable — CRA publishes a strict XSD schema for it, distinct from the box-value math T4/T4A already compute, and building/validating one from scratch is real new scope with its own research and testing burden, not a mechanical port.

| Option | What it means | Recommendation |
|---|---|---|
| **A — Port what exists; flag the blueprint gate for correction (recommended)** | Ship the HTML/print T4 + T4A slips (8A below), same as source. The "CRA XML validates" line in `master_blueprint.md`'s Phase 8/8.5 gates gets corrected at rollup to describe what's actually being delivered (T4/T4A box-value accuracy + printable output), not XML. If real CRA electronic filing is wanted later, it becomes its own dedicated, explicitly-scoped initiative — worth doing right (schema validation, real test filing) rather than folding into this phase under time pressure. | Matches what's actually buildable from source today. PayPRO's data only supports 2026 anyway (blueprint's own note — first real T4 season is Feb 2027), so there's real runway to scope CRA XML properly later rather than rushing it now under a mislabeled gate. |
| **B — Build CRA XML export as new functionality in this phase** | Research CRA's T4 XML schema, build a generator (likely a new `paypro-generateT4XML` edge function, since a strict-schema XML file is a poor fit for client-side generation the same way none of PayPRO's report/PDF code has ever needed a server round-trip before), validate against CRA's schema. | Matches the blueprint's literal text and actually closes the compliance gate for real 2027 filing. Meaningfully larger scope than every other Phase 8 file combined — this alone could be its own phase. |

Resolved above as port-what-exists — §3 (8A) is written against this answer. A real CRA XML export, if ever wanted, would need its own dedicated sub-phase (8D) rather than fitting inside 8A's existing scope.

#### Q2 reasoning (resolved above as: real RP number provided, `893497602RP0001`)

Confirmed by direct read: `T4_PDF.jsx` (no `t4-box` for a Business Number at all — not wrong, structurally *absent*) and `T4A_PDF.jsx` (`"YOUR COMPANY INC." / "123 BUSINESS AVE." / "CALGARY, AB T2P 1A1"`, hardcoded, lines 53–55) both use obviously-fake placeholder text instead of Ken's Auto & Diesel Repair's real name/address (used correctly everywhere else in this codebase: `5002 49 Ave - PO Box 160, Dewberry, AB T0B 1G0`, `780-847-3002`). A real T4 slip requires the employer's CRA payroll (RP) account number in a dedicated box — this field didn't exist anywhere in AutoPRO's schema or UI before this phase (confirmed via grep, zero hits for any Business-Number-shaped field name). Resolved: hardcode `893497602RP0001` alongside the corrected name/address in both `T4_PDF.jsx` and `T4A_PDF.jsx`, matching how the address/phone are already hardcoded verbatim in every other PDF in this codebase (no config table for it — same pattern).

### 0.2 Decisions taken (self-resolved — stated so nothing below reads as an oversight)

**D1 — The logo repoint touches only 2 files, not the 3 named in `master_blueprint.md`.** The blueprint's Phase 8 text lists `PayStubPDF.jsx:117` as one of three references to repoint — but `PayStubPDF.jsx` was never ported. Phase 6's own D5 explicitly declined to port it (dead code, unreachable from any live button in source, confirmed again here via a fresh `grep` — the file doesn't exist anywhere in `kadr-autopro`). The two real references are `PaychequesReport.jsx:539` and `RemittancesReport.jsx:259`, both inside this phase's own 8B scope. Confirmed via direct SQL against both Supabase projects that the target asset genuinely exists and is public: `storage.objects` on **production** (`hbcrwkmgsazqrvsrmxyr`) has `bucket_id: 'KADR'`, `name: 'KADRLogoAddress.jpg'` — the blueprint's "no upload needed" claim checks out. Every branch (dev included) points at this same production-hosted URL directly, matching the existing convention (`StatementModal`, `WorkOrderReport`, `ReconcileReport`, `autopro-generateWorkOrderPdf` all already do this) — no per-branch asset duplication needed. Will flag the 3→2 file-count correction for `master_blueprint.md` at rollup.

**D2 — The hardcoded EI-employer `* 1.4` multiplier appears in 5 more places across Reports/Trends, on top of the 5 already fixed in Phases 6/7 — same class of bug, same fix.** Confirmed via direct code read: `PaychequesReport.jsx` lines 162, 174, 427, 431 (both the per-row "EI Employer"/"EI Both" columns and their footer totals) and `TrendsDataProcessor.jsx` line 85 (the `employerEI` figure that feeds every chart on the Trends page). None of these read a stored employer-EI field — `PayPro_PayStub` doesn't have one (confirmed, same finding as Phase 6's D6) — so, matching the precedent set in `paypro-generatePayStubPDFEmployer`/`generatePayStubPDF`(Phase 6), `BatchPaymentModal.jsx`(Phase 6), `Remittances.jsx`/`RemittanceDialog.jsx`/`RemittanceHistory.jsx`/`RemittanceReportPDF.jsx`(Phase 7), all 5 new occurrences get the same fix: read `PayPro_TaxYearConstant.ei_rate_employer_multiplier` for the relevant stub's/period's year instead of the literal `1.4`. On 2026 data this is byte-identical (the only constant row is `1.4`) — a forward-looking correctness fix, not a behavior change to verify against historical output. **This is now the sixth and seventh file(s) independently carrying this exact hardcode** — worth a rollup note recommending a shared constant-lookup helper if PayPRO ever grows a Phase 9+ payroll surface, rather than an eighth independent copy.

**D3 — `TrendsDataProcessor.jsx`'s `totalPayStubs`/`validPayStubs` summary fields are computed identically (same bug class as Phase 5's own stray `.reverse()` fix — a small, confirmed, in-flight bug caught while reading the file being ported, not scope creep).** Line 35 filters out cancelled stubs (`payStubs.filter(stub => !stub.is_cancelled)`) into a local variable that shadows the original fetch; both `summary.totalPayStubs` (line 256) and `summary.validPayStubs` (line 257) are then set from that same already-filtered array, so `totalPayStubs` never actually reports the true unfiltered count its own name implies. Fixed while porting: capture the raw fetch count before filtering and use that for `totalPayStubs`, keep the filtered count for `validPayStubs` — matches the apparent original intent of having two differently-named fields at all.

**D4 — `TrendsDataProcessor.jsx`'s `yearOverYearComparison.percentageChange` (lines 244–247) is dead code and is not ported.** Confirmed via the same research pass (and cross-checked against `Trends.jsx`'s actual usage): `YearOverYearComparison.jsx` recomputes its own per-metric percentage-change values independently from the raw `currentYear`/`previousYear` objects it receives as props, and never reads this specific pre-computed field. Not porting an unused derived value is consistent with Phase 6's D5 (don't port dead code) — this is a smaller instance of the same principle, a dead field inside a file that's otherwise very much alive, not a whole unreachable component.

**D5 — SIN display gets light normalization in `T4_PDF.jsx`, not a verbatim `employee.sin || '000-000-000'` passthrough.** Spot-checked directly: dev's `PayPro_Employee.sin` values are stored as bare 9-digit strings (`"927454763"`), while production's are stored space-separated (`"656 946 449"`) — confirmed these are genuinely different values, not just different formatting of the same one (dev's scrambled-SIN/DOB convention, per `master_blueprint.md`'s §0.4 standing decision, verified still in effect: dev's `EMP001` SIN/DOB do not match production's). Since the box is meant to display CRA's standard `XXX XXX XXX` grouping regardless of how the value happens to be stored, `T4_PDF.jsx` strips non-digits and re-inserts the standard spacing at render time rather than trusting the raw stored string's format — a small, safe formatting fix, not a data change.

**D6 — No new edge functions for any of 8A/8B/8C.** Confirmed via direct grep: none of the 8 source files in this phase's scope call `base44.functions.invoke` anywhere — every one reads entities directly (`PayStub`, `Employee`, `ValidPayType`, `Remittance`, `TaxYearConstant`), all already mapped in `payrollEntities.js` with correct pagination (`fetchAllRows`, Phase 2). This mirrors Phase 7's Q1 finding (client-side is sufficient when nothing needs a service-role secret or a strict server-side artifact) — here it's even more clear-cut, since there isn't even a GL/Bank write to gate. `master_context.md` §4.9 documents that AutoPRO's own native Reports module *does* use `autopro-get*` edge functions for its reports — noting this as a real, available alternative pattern, not something this phase is obligated to follow; PayPRO's reports are a much smaller, already-paginated read surface with no cross-module aggregation need, so client-side stays the simpler, sufficient choice here.

**D7 — Reports' print pattern (`window.open()` + a fully separate HTML document, Tailwind CDN script tag) is already compliant with `master_context.md` §3's safe-print-pattern rule (Pattern A) and ports unchanged.** Same conclusion Phase 7 reached for `RemittanceReportPDF.jsx` — no dark-mode work applies to the print output itself (it's a standalone light-only document outside the app's React tree), only to the on-screen filter/table UI around it.

---

## 1) Phase Scope & Objectives

### In scope

Port PayPRO's entire read-only reporting surface — T4/T4A slip generation, the Paycheques/Remittances report tabs, and the Trends dashboard (4 chart/aggregation components) — plus the final base44-hosted-asset cleanup (the logo repoint, `O1`/`R8`). No GL, no Bank, no Fiscal Period gate anywhere in this phase — every file here is a read aggregation over already-posted `PayPro_PayStub`/`PayPro_Remittance`/`PayPro_Employee`/`PayPro_TaxYearConstant` data.

### Objectives

| # | Objective |
|---|---|
| O-1 | `T4s.jsx` generates per-employee T4 slips + one T4A summary for a selected year, box mappings (14/16/18/20/22/24/26/44/46/52/55/56) ported unchanged from source |
| O-2 | `T4_PDF.jsx`/`T4A_PDF.jsx` show Ken's Auto & Diesel Repair's real name/address (not the source's fake placeholder), a properly-formatted SIN (D5), and the real CRA Business Number `893497602RP0001` (Q2) |
| O-3 | `Reports.jsx` hosts the Paycheques/Remittances tabs exactly as source, no props, each tab self-contained |
| O-4 | `PaychequesReport.jsx`/`RemittancesReport.jsx` port filters, sortable/customizable columns, CSV export, and print unchanged, with the D2 EI-multiplier fix applied |
| O-5 | `Trends.jsx` + `TrendsDataProcessor.jsx` + the 3 chart components port unchanged in structure, with D2/D3/D4's fixes applied |
| O-6 | Logo repoint (O1/R8): both real references (`PaychequesReport.jsx`, `RemittancesReport.jsx`) point at `https://hbcrwkmgsazqrvsrmxyr.supabase.co/storage/v1/object/public/KADR/KADRLogoAddress.jpg` — **phase gate:** `grep -r "qtrypzzcjebvfcihiynt" src/` returns zero |
| O-7 | Zero new base44 references; `payrollEntities.js` needs no changes (D6); no new edge functions (D6, Q1) |
| O-8 | Every ported file ships dark-mode classes on its on-screen UI (filters/tables/cards/charts) from the start (lesson 27) — print/PDF output stays light-only by design (D7) |

### Explicitly NOT in scope

- A real CRA T4 XML electronic-filing export — resolved as not in scope (Q1); a future, separately-scoped initiative if ever wanted
- Any change to `PayrollTransaction` or the old stopgap `Payroll.jsx`/`MarkPaidModal.jsx`/`Taxes.jsx` (out of scope for the entire merge, S3)
- Phase 8.5 itself (the parallel-run validation gate — this phase only prepares the reporting surface it will eventually be checked against)
- Any GL/Bank/Fiscal-Period work — this phase has none

### Why multi-phase, not single

Three genuinely independent, differently-shaped workstreams, mirroring Phase 6's rationale:

- **8A (T4s)** is the compliance-sensitive piece — small in file count (3 files) but highest scrutiny, and it's where Q1/Q2 land.
- **8B (Reports)** is a mechanical port of two large, self-contained, already-working components, plus the logo repoint (small, but its own explicit phase gate).
- **8C (Trends)** is pure read-only charting, the lowest-risk workstream, entirely decoupled from 8A/8B (no shared files, no shared components).

None of the three share a file or a component. Each is independently shippable and independently testable, exactly like Phase 6's three sub-phases.

```
   8A (T4s)       ──┐
                     ├──► Final Verification (all 3 together) ──► Phase 8.5
   8B (Reports)   ──┤
                     │
   8C (Trends)    ──┘
```

---

## 2) Lessons Learned & Context

Pulled from `master_blueprint.md` §7, Phases 5–7's own handoff notes, and this plan's own research pass — filtered to what actually bites this phase.

| # | Lesson | How it applies here |
|---|---|---|
| 1 | `employee_id` carries three meanings | `T4s.jsx` already gets this right in source: `selectedEmployeeIds` holds `PayPro_Employee.id` (system id, for the checkbox list), while the actual stub lookup uses `PayStub.filter({employee_id: employee.employee_id, year})` (business key) — port unchanged, don't "simplify" to one id type. |
| 6 | The shim owns id generation and audit fields | Not applicable — this phase performs zero writes anywhere. All three sub-phases are pure reads through `payrollEntities.js`'s existing `.list()`/`.filter()`. |
| 11 | `TaxCalculator.jsx` is ported byte-identical, CPP2 unexercised by real data | Indirectly relevant: T4 box 16 (CPP) sums `stub.cpp_deduction` only — **does not separately break out CPP2 into its own box**, matching source exactly (there's no dedicated CPP2 T4 box in this template; real CRA T4s as of recent years do have one, but porting introduces zero *new* CPP2 risk since source never had it either — flagging for awareness, not fixing, since "add a box source never had" is new scope, not a port). |
| 27 | Dark mode is first-class | Every on-screen file in this phase (T4s.jsx's selection UI, both Report tabs' filters/tables, Trends' cards/charts) is currently 100% light-only in source — add `dark:` variants during the port, not after. Print/PDF output is exempt (D7). |
| 28 | `cn()`/tailwind-merge silently drops conflicting utilities | Applies to any `Dialog`/`Popover` in this phase (the "Customize Columns" popovers in both Report tabs) — verify centered/positioned correctly after porting. |
| master_context.md §3 | Print output has two safe patterns (A: separate `window.open()` doc; B: on-screen DOM + `@media print` reset) — a third, unguarded pattern is dangerous | 8A/8B all use Pattern A already (D7) — confirm this holds after porting, don't introduce Pattern C by accident (e.g. reusing on-screen dark-mode-styled table markup for print without a reset). |
| master_context.md §4.9 | AutoPRO's own native Reports module pattern: `autopro-get*` edge functions + paginated `fetchAllRows` for large scans | Documents an available alternative this phase deliberately doesn't need (D6) — `payrollEntities.js` already paginates, and nothing here needs cross-module aggregation or a service-role secret. |
| — (this research pass) | `master_blueprint.md`'s Phase 8.5 gate #8 says "CRA XML validates" but no XML export exists in source anywhere | Q1 — the central open question this plan surfaces. |
| — (this research pass) | Dev's `PayPro_Employee.sin`/`date_of_birth` values are confirmed genuinely different from production's (spot-checked EMP001 on both projects) — the scrambling described in `master_blueprint.md` §0.4 is real and in effect, not just a stated intent | Safe to test T4 generation against dev data without a real-SIN exposure concern (D5's formatting fix is a display improvement, not a privacy fix — there was no privacy gap to begin with). |
| — (this research pass) | `recharts@^2.15.4` is already a dependency in `kadr-autopro`'s `package.json`, already used in 7 other files (`financial-dashboard/*`, `reports/SalesAnalysisReport.jsx`, `reports/WorkOrderSummaryReport.jsx`, `cash-flow/CashFlowTrendTab.jsx`) | No new dependency needed for 8C — same library, same version, already proven working elsewhere in this exact codebase. |

---

## 3) Phase 8 Roadmap & Progress

| Sub-phase | Status | Overview |
|---|---|---|
| 8A | Code complete — pending live verification | T4/T4A slip generation — box mappings, employer-identity fix (Q2), SIN formatting (D5) |
| 8B | Code complete — pending live verification | Paycheques/Remittances report tabs — filters, columns, CSV, print, EI-multiplier fix (D2), logo repoint (O-6) |
| 8C | Code complete — pending live verification | Trends dashboard — 4 chart/aggregation components, EI-multiplier fix (D2), two small bug fixes (D3/D4) |

---

### 8A — T4s

**New files:**
- `src/pages/paypro/T4s.jsx` *(replaces the Phase 2 placeholder body)*
- `src/components/paypro/t4/T4_PDF.jsx`
- `src/components/paypro/t4/T4A_PDF.jsx`

#### Detailed Execution Plan

**`T4s.jsx`** — port of source `src/pages/T4s.jsx` (226 lines):
- `Employee.list()` + `TaxYearConstant.list()` on mount (shim), building a `{year: {EI_MAX_INSURABLE_EARNINGS, CPP_MAX_PENSIONABLE_EARNINGS}}` map — unchanged.
- Employee checkbox list keyed by `employee.id` (system id) — unchanged, correct per lesson 1.
- `handleGenerateT4s()`: for each selected employee, `PayStub.filter({employee_id: employee.employee_id, year: parseInt(selectedYear)})` (business key, correct), sums `gross_pay`/`cpp_deduction`/`ei_deduction`/`federal_tax + provincial_tax` into `t4Data` boxes 14/16/18/22, derives 24/26 as `Math.min(gross, EI_MAX/CPP_MAX)`, box 52 hardcoded `0` — **unchanged, byte-identical box math**, matching R3's "box mappings port unchanged" instruction.
- Opens one `window.open()` per employee's T4 (500ms stagger to avoid popup-blocker issues, unchanged) plus one T4A summary window at the end — unchanged.
- Wrap in AutoPRO's page-canvas convention (`max-w-4xl mx-auto p-6 space-y-6` — source already uses `max-w-4xl`, not `max-w-7xl`; keep it, this page's content is narrower than a table-heavy page), dark-mode classes added to every on-screen element (filter select, employee list, buttons).

**`T4_PDF.jsx`** — port of source (145 lines), with Q2/D5 changes:
- Company header block: replace `"Your Company Inc."` with `"Ken's Auto & Diesel Repair"` + the real address (`5002 49 Ave - PO Box 160, Dewberry, AB T0B 1G0`) and phone (`780-847-3002`), matching every other document in this codebase verbatim.
- Add a Business/Payroll (RP) account number box: **`893497602RP0001`** (Q2), hardcoded alongside the company info.
- **D5:** SIN box renders `formatSin(employee.sin)` — a small helper stripping non-digits and re-grouping as `XXX XXX XXX` (falling back to the source's existing `'000 000 000'`-style placeholder when empty) — instead of the raw stored string.
- Box 10 (province) stays hardcoded `"AB"` — correct, this business only operates in Alberta, matches convention elsewhere.
- All box values (14/16/18/20/22/24/26/44/46/52/55/56) render unchanged from source — 20/44/46/55/56 stay hardcoded `$0.00` (RPP/union dues/donations/PPIP — none of these exist anywhere in PayPRO's data model, matching source's own scope).

**`T4A_PDF.jsx`** — port of source (142 lines), same Q2 fix:
- "Payer's name and address" box: replace the fake `"YOUR COMPANY INC." / "123 BUSINESS AVE." / "CALGARY, AB T2P 1A1"` with the real company info, matching `T4_PDF.jsx`.
- Business Number box added here too: `893497602RP0001` (T4A Summary requires the same RP number).
- Grand-totals reduction and per-employee breakdown table — unchanged.

#### Task List

- [ ] Create `src/components/paypro/t4/` directory
- [ ] Port `T4_PDF.jsx`, `T4A_PDF.jsx` with the Q2 company-info fix (real name/address/phone + Business Number `893497602RP0001`), D5's SIN formatting
- [ ] Replace `src/pages/paypro/T4s.jsx` placeholder with the real page — import-path swaps to `payrollEntities.js`, dark-mode classes, page-canvas wrapper
- [ ] Confirm `payrollEntities.js` needs zero changes (D6)

#### Verification Plan

At `test.kensauto.ca`, after commit + push, with a `paypro_user: true`, AAL2 session:

- [ ] Generate T4s for 3–4 real employees for tax year 2026 → each box (14/16/18/22/24/26) matches the sum of that employee's real 2026 stubs, recomputed independently via SQL
- [ ] Box 24/26 correctly cap at the 2026 `TaxYearConstant`'s EI/CPP max insurable/pensionable earnings for at least one high-earner employee (or confirm no 2026 employee actually crosses the cap, matching Phase 5's own finding — if so, note this as an untested-by-real-data path, same caveat as CPP2)
- [ ] T4A summary total exactly equals the sum of all generated individual T4s' boxes 14/16/18/22
- [ ] Company name/address/Business Number (`893497602RP0001`) render correctly on both T4 and T4A, not the source's placeholder text
- [ ] SIN renders in `XXX XXX XXX` format regardless of how it happens to be stored (D5)
- [ ] An employee with zero 2026 stubs is correctly skipped (no blank T4 window opens), matching source's `continue` behavior
- [ ] Both light and dark mode: no unstyled elements on the on-screen `T4s.jsx` selection page (the T4/T4A print windows themselves are exempt, D7)
- [ ] `grep -r "base44"` / `"@/entities/all"` in the new 8A files: zero matches

---

### 8B — Reports

**New files:**
- `src/pages/paypro/Reports.jsx` *(replaces the Phase 2 placeholder body)*
- `src/components/paypro/reports/PaychequesReport.jsx`
- `src/components/paypro/reports/RemittancesReport.jsx`

#### Detailed Execution Plan

**`Reports.jsx`** — port of source (29 lines) verbatim: a `Tabs` wrapper, `defaultValue="paycheques"`, rendering `<PaychequesReport />`/`<RemittancesReport />` with no props — both children own their own data. Page-canvas wrapper + dark-mode classes on the tab chrome/title.

**`PaychequesReport.jsx`** — port of source (853 lines):
- `PayStub.list('-created_date')` + `Employee.list()` + `ValidPayType.list('-created_date')` (shim) replace the three `base44.entities.*.list()` calls — straight import-path swap, `fetchAllRows` pagination now automatic (source had none).
- Filter state (search/date-from/date-to/employee/status, pending-vs-applied pairs), dynamic per-pay-type columns driven by `ValidPayType`, sortable/customizable columns with a visibility popover — all ported unchanged.
- **D2 fix:** every `* 1.4` EI-employer occurrence (source lines 162, 174, 427, 431 — both render-time columns and `calculateTotals()`) replaced with a `getEmployerMultiplier(stub.year)` lookup against `TaxYearConstant.list()` (fetched once alongside the other three entities), mirroring the exact helper shape already used in Phase 6/7's files. CPP "Employer"/"Both" columns (lines 103, 113, 132, 142, 411, 415, 419, 423) **stay unchanged** — CPP employer-match is a real 1:1 CRA rule (confirmed correct in Phase 6's D6), not a bug.
- `handleExportCSV()` — unchanged, pure client-side Blob download, no server dependency.
- `handlePrint()` — unchanged structurally (Pattern A, D7); **O-6 change:** the hardcoded logo `src` (source line 539) becomes `https://hbcrwkmgsazqrvsrmxyr.supabase.co/storage/v1/object/public/KADR/KADRLogoAddress.jpg`.
- Dark-mode classes added to the on-screen filter card, table, and column-customization popover (the print output itself stays light-only, D7).

**`RemittancesReport.jsx`** — port of source (425 lines):
- `Remittance.list('-remittance_date')` (shim) replaces the single `base44.entities.Remittance.list()` call.
- Date-From/Date-To filter, sortable/customizable columns, CSV export, print — all unchanged. `total_cpp`/`total_ei` columns sum two already-stored fields (`total_cpp_employee + total_cpp_employer`, etc.) — **no multiplier hardcode exists in this file at all** (confirmed during research), so no D2-class fix needed here; it already trusts the `PayPro_Remittance` row's own stored employer totals, which Phase 7 now populates correctly.
- **O-6 change:** hardcoded logo `src` (source line 259) becomes the same production KADR URL as above.
- Dark-mode classes added to on-screen filter/table/popover; print output stays light-only (D7).

#### Task List

- [ ] Create `src/components/paypro/reports/` directory
- [ ] Port `PaychequesReport.jsx` with D2's EI-multiplier fix and O-6's logo repoint
- [ ] Port `RemittancesReport.jsx` with O-6's logo repoint (no D2 fix needed here)
- [ ] Replace `src/pages/paypro/Reports.jsx` placeholder with the real tabs page
- [ ] Confirm `payrollEntities.js` needs zero changes (D6)
- [ ] `grep -r "qtrypzzcjebvfcihiynt" src/` returns zero (O-6 phase gate) — check repo-wide, not just these two files, in case any other stray reference surfaces

#### Verification Plan

- [ ] Paycheques tab: default date range loads correctly (last 3 months), filters (search/date/employee/status) all narrow the table correctly, sorting by every column works, "Customize Columns" popover toggles visibility correctly including dynamic per-pay-type columns
- [ ] Paycheques tab: EI Employer/Both columns and their footer totals use the *current* `TaxYearConstant.ei_rate_employer_multiplier` — spot-check by temporarily editing it in Setup and reloading (confirms D2 actually reads live, then revert), same technique Phase 6 used for D6
- [ ] Paycheques tab: CSV export produces a file with figures matching the on-screen table exactly
- [ ] Paycheques tab: Print → new window opens, logo renders correctly (not broken/missing), figures match on-screen table, closes/prints cleanly
- [ ] Remittances tab: date filter, sorting, column customization, CSV export all work; CPP/EI total columns match `PayPro_Remittance`'s own stored employee+employer sums exactly (no drift, since this file never recomputes them)
- [ ] Remittances tab: Print → logo renders correctly, figures match
- [ ] Both report tabs match the equivalent base44 report output for the same date range on at least one real historical range (per blueprint gate #8's "both report tabs match base44's output for the same range") — needs a side-by-side comparison against the still-live base44 PayPRO instance if still reachable, or against previously-recorded base44 output if not
- [ ] Both light and dark mode: no unstyled elements in either report tab's on-screen UI (print windows exempt, D7)
- [ ] `grep -r "base44"` / `"@/entities/all"` in the new 8B files: zero matches
- [ ] `grep -r "qtrypzzcjebvfcihiynt" src/`: zero matches (O-6 phase gate, repo-wide)

---

### 8C — Trends

**New files:**
- `src/pages/paypro/Trends.jsx` *(replaces the Phase 2 placeholder body)*
- `src/components/paypro/trends/TrendsDataProcessor.jsx`
- `src/components/paypro/trends/PayrollTrendChart.jsx`
- `src/components/paypro/trends/LaborCostBarChart.jsx`
- `src/components/paypro/trends/YearOverYearComparison.jsx`

#### Detailed Execution Plan

**`TrendsDataProcessor.jsx`** — port of source (288 lines), the aggregation engine every chart depends on:
- `PayStub.list('-pay_date')` + `Employee.list()` (shim) replace the two `base44.entities.*.list()` calls.
- Render-props pattern (`children({data, refresh})`) — unchanged, `Trends.jsx` wraps its whole chart tree in this component.
- Filters cancelled stubs before aggregating (`!stub.is_cancelled`) — unchanged.
- **D2 fix:** line 85's `employerEI = stub.ei_deduction * 1.4` becomes a `TaxYearConstant`-driven lookup (fetch alongside the other two entities, keyed per-stub by `stub.year`) — this is the highest-leverage of all the D2 fixes in this phase, since every chart on the page derives from this one computation.
- **D3 fix:** `summary.totalPayStubs` now reports the true pre-filter count (captured before line 35's `is_cancelled` filter), `summary.validPayStubs` keeps the post-filter count — no longer identical.
- **D4 fix:** the dead `yearOverYearComparison.percentageChange` sub-computation (source lines 244–247) is dropped; `yearOverYearComparison` still carries `currentYear`/`previousYear` (both consumed downstream by `YearOverYearComparison.jsx`).
- CPP employer-match assumption (`employerCPP = cpp_deduction`, `employerCPP2 = cpp2_deduction`) stays unchanged — correct 1:1 rule, not a bug (same as 8B).
- Monthly/yearly aggregation buckets, `totalPayrollCost`, `totalEmployeeDeductions` — all ported unchanged otherwise.

**`PayrollTrendChart.jsx`** — port verbatim (99 lines): pure presentational `recharts` `LineChart` wrapper, no entity reads, no base44 coupling of any kind. Import-path swap only where it imports sibling components (none — it's leaf-level). Add `dark:` classes to the wrapping `Card`/text (the chart's own SVG colors/palette stay as-is — recharts renders on a transparent background, no light/dark-specific chart-color work needed for this phase, matching how the 7 existing `recharts` usages elsewhere in AutoPRO already handle this).

**`LaborCostBarChart.jsx`** — port verbatim (137 lines): same treatment as above — pure presentational, no entity/base44 coupling, dark-mode classes on the `Card` chrome and the 4 summary stat tiles below the chart.

**`YearOverYearComparison.jsx`** — port verbatim (247 lines): same treatment — pure presentational, consumes `yearlyTrends`/`yearOverYearData` props from `TrendsDataProcessor`. Dark-mode classes on the metric-comparison card and its up/down/neutral badges.

**`Trends.jsx`** — port of source (163 lines):
- Orchestrates `TrendsDataProcessor` + 1×`YearOverYearComparison` + 3×`PayrollTrendChart` (different `dataKeys` configs per instance — Monthly Gross, Comprehensive Cost Breakdown, Deductions/Contributions Breakdown) + 2×`LaborCostBarChart` (by employee type, by position) — structure ported unchanged.
- Data Summary stat card at the top (valid pay stubs / total employees / months tracked / years tracked / date range) — unchanged.
- Page-canvas wrapper + dark-mode classes on the stat card and static completion-message card; the chart components handle their own dark-mode classes internally per above.

#### Task List

- [ ] Create `src/components/paypro/trends/` directory
- [ ] Port `TrendsDataProcessor.jsx` with D2/D3/D4 fixes applied
- [ ] Port `PayrollTrendChart.jsx`, `LaborCostBarChart.jsx`, `YearOverYearComparison.jsx` verbatim + dark-mode classes
- [ ] Replace `src/pages/paypro/Trends.jsx` placeholder with the real orchestrating page
- [ ] Confirm `payrollEntities.js` needs zero changes (D6), confirm `recharts` needs no new install (already a dependency)

#### Verification Plan

- [ ] `/paypro/Trends` loads, Data Summary stat card shows correct counts (valid pay stubs excludes cancelled, matching D3's fix — spot-check the raw vs. valid counts are now actually different if any cancelled stub exists in the dataset)
- [ ] All 3 `PayrollTrendChart` instances render with correct monthly data — spot-check at least one month's Gross Pay figure against a direct SQL sum
- [ ] Both `LaborCostBarChart` instances (by type, by position) render with correct category totals and correct "Avg per Employee" tooltip math
- [ ] `YearOverYearComparison` renders correct current/previous-year figures and percentage-change badges for at least 2 real years of data (2025 vs 2026, if 2025 data exists — otherwise note as untestable and why, matching the T4/CPP2-style "no real data to exercise this" caveats already established in this project)
- [ ] Employer EI figures across all charts use the *current* `TaxYearConstant.ei_rate_employer_multiplier` — same live-edit-and-reload spot-check as 8B/Phase 6's D6 checks
- [ ] Both light and dark mode: no unstyled elements anywhere on `/paypro/Trends`, including inside each chart's `Card` chrome
- [ ] `grep -r "base44"` / `"@/entities/all"` in the new 8C files: zero matches

---

### Final Verification Plan (8A + 8B + 8C together)

Run after all three sub-phases are individually verified, at `test.kensauto.ca`, with a real `paypro_user: true` AAL2 session:

- [ ] Payroll dropdown/More modal nav still correctly routes to `/paypro/T4s`, `/paypro/Reports`, `/paypro/Trends`
- [ ] `grep -r "qtrypzzcjebvfcihiynt" src/` (repo-wide, the actual O-6 phase gate as written in the blueprint): zero matches
- [ ] `grep -r "base44"` / `"@base44"` across every new file in this phase: zero matches (informational comments referencing base44 for context are fine, per Phase 3/6/7 precedent)
- [ ] `git status` confirms no PayPRO source file was copied verbatim — every ported file went through the import-path swap + dark-mode-class pass, plus D1–D7's specific fixes where applicable
- [ ] Cross-check: a 2026 T4's box 14 (8A) matches the sum of Gross Pay shown for that employee across the same date range on the Paycheques report (8B) and the equivalent monthly figures on the Trends page (8C) — three independently-built views of the same underlying data should agree exactly

### Handoff Context to Phase 8.5

- Phase 8.5 (parallel run validation) is the next step per the blueprint's dependency graph — not a build phase, a validation gate comparing this native system's output against base44's for a real pay cycle or two.
- **The blueprint's Phase 8.5 gate #8 text ("CRA XML validates") needs correcting before Phase 8.5 begins** — drop the XML clause entirely (Q1 resolved as port-what-exists; no XML export was built).
- **D2's hardcoded-`1.4` pattern has now been found and fixed independently in 8 total files across Phases 6/7/8** (`generatePayStubPDFEmployer`/`generatePayStubPDF`/`BatchPaymentModal.jsx` — Phase 6; `Remittances.jsx`/`RemittanceDialog.jsx`/`RemittanceHistory.jsx`/`RemittanceReportPDF.jsx` — Phase 7; `PaychequesReport.jsx`/`TrendsDataProcessor.jsx` — Phase 8). Worth a `master_context.md` §4 addition flagging this as a recurring bug class in the PayPRO port specifically, and/or a shared `getEmployerEiMultiplier(stubs, taxYearConstants)` helper if any Phase 9+ payroll surface is ever built, rather than a ninth independent copy.
- **The real CRA Business/Payroll account number is now live in the codebase: `893497602RP0001`**, hardcoded in `T4_PDF.jsx`/`T4A_PDF.jsx` (Q2). Worth a `master_context.md` §4.8 (Payroll) note recording this as a standing fact, since it's real-world compliance data now embedded in a source file, not something a future agent should assume is a placeholder.

---

## 4) Phase Results and Final Context

*(populated during execution — append, never overwrite)*

### 4.1 Execution Log

| Sub-phase | Started | Completed | Notes |
|---|---|---|---|
| 8A | 2026-08-18 | 2026-08-18 (code) | `T4_PDF.jsx`, `T4A_PDF.jsx`, `T4s.jsx` ported per §3. Q2 company identity + `893497602RP0001` and D5 SIN formatting applied. Live verification (§3's checklist, at `test.kensauto.ca`) not yet run. |
| 8B | 2026-08-18 | 2026-08-18 (code) | `Reports.jsx`, `PaychequesReport.jsx`, `RemittancesReport.jsx` ported per §3. D2 EI-multiplier fix (`getEmployerMultiplier`, same helper shape as Phase 6/7) applied to `PaychequesReport.jsx`'s `ei_employer`/`ei_both` columns and totals; confirmed `RemittancesReport.jsx` has no D2-class hardcode to fix. O-6 logo repoint applied to both report tabs' print output; `grep -r "qtrypzzcjebvfcihiynt" src/` returns zero. Live verification not yet run. |
| 8C | 2026-08-18 | 2026-08-18 (code) | `TrendsDataProcessor.jsx` + 3 chart components + `Trends.jsx` ported per §3, with D2/D3/D4 fixes applied. Live verification not yet run. |

### 4.2 Deviations from Plan

- **Browser-preview verification blocked by a session-local environment issue, not a code defect.** After all three sub-phases' code was written, an attempt to smoke-test via the in-session browser preview tool failed: the Vite dev server started cleanly (no compile/build errors in its logs) and bound to port 5173, but every HTTP request to it — from both the browser-preview tool and a direct `curl` — either hung and timed out or returned an empty/refused response, both before and after touching any of this phase's new routes. This reproduced against `/` itself, before any of this phase's page code would run, so it points at a networking/sandbox quirk in this particular session rather than anything in the new files. No live/manual verification (§3's per-sub-phase checklists, or the Final Verification Plan) has been run yet — that still needs to happen at `test.kensauto.ca` with a real `paypro_user: true` AAL2 session before 8A/8B/8C can be marked verified-complete.

### 4.3 Unexpected Learnings

*None yet — pending live verification.*

### 4.4 Rollup Notes for `master_context.md` / `master_blueprint.md`

*(populated as Phase 8 completes — already known to include at least: the 3→2 logo-reference-count correction (D1), removing the "CRA XML validates" clause from the Phase 8/8.5 gates (Q1, resolved as port-what-exists), the D2 recurring-hardcode pattern note for §4, and recording the real CRA Business Number `893497602RP0001` in §4.8 (Q2))*
