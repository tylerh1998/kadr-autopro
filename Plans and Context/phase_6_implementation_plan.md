# Phase 6 Implementation Plan — Pay Stubs, PDFs, Email & Mark Paid → GL/Bank

**Parent:** `master_blueprint.md` Phase 6 · **Created 2026-08-18** · **Status: Approved — ready to execute** (both open questions resolved 2026-08-18, see §0.1)

**Format: multi-phase (6A / 6B / 6C)** — see rationale in §1.

> **This is a LIVE document.** §3's sub-phase sections and §4 are the working area, to be updated during execution. Do not wipe prior content — append and adjust.

---

## 0) Open Questions, Decisions & Clarifications

### 0.1 Decisions taken on the two open questions (resolved 2026-08-18, before execution)

**Q1 — RESOLVED: Option A, full reversal.** Cancel Payment posts an exact-inverse `GLTransaction` set (every debit becomes a credit and vice versa) plus a reversing `BankTransaction`, per O2. `PayStub.is_paid` flips back to `false`; `pay_date` is **kept**, not nulled. Nothing is deleted — originals stay for audit, reversal stands alongside them. See the original reasoning preserved below (was §0.1 Q1) and 6C's Detailed Execution Plan, which is written against this answer.

**Q2 — RESOLVED: Fix now.** The CPP2 YTD `NaN` bug (`ytdData.cpp2` never seeded in `PaychequeCreator.jsx`/`BatchPaychequeProcessor.jsx`) gets a one-line fix as part of this phase's work, since Phase 6 already reads these files' YTD output. Added to 6A's task list below.

*(Original open-question framing preserved for context — both are now decided, not open.)*

#### Q1 reasoning (resolved above as Option A)

Source PayPRO's `CancelPaymentModal.jsx` (paystub-level, listed in Phase 6's own "Impacted" components in `master_blueprint.md`) does **not** reverse any ledger entries — it only flips `PayStub.is_paid = false` and clears `pay_date`, in parallel across the selected stubs:
```js
const updates = stubs.map(stub => PayStub.update(stub.id, { is_paid: false, pay_date: null }));
await Promise.all(updates);
```
That's safe in the *source* system because base44's `exportPaystubs` never actually wrote GL/Bank rows in the first place — it only inserted a `PayrollTransaction` row (confirmed by reading the live base44 function body; the payload comment claims it creates "BankTransactions, PayrollTransactions and GLTransactions," but the implementation only does the middle one, and `bankAccountId` is accepted and silently dropped). A human then separately used AutoPRO's own `MarkPaidModal` against `PayrollTransaction` to do the real posting later — so nothing existed for `CancelPaymentModal` to reverse.

**Phase 6's whole point is to collapse that two-step handoff** (per `master_blueprint.md`'s own "The core change" framing) — `BatchPaymentModal` will post real `GLTransaction`/`BankTransaction` rows directly. Once that's true, a flags-only Cancel Payment would silently leave orphaned, unreversed ledger entries behind — a real correctness gap, not a faithful port of prior behavior (prior behavior had nothing to reverse).

Decision O2 (`master_blueprint.md` §0.1) says Cancel Payment gets "**Complete reversal** of Mark Paid. Every debit becomes a credit and vice versa, plus a reversing `BankTransaction`" — but O2 is stated generically, and Phase 7's own section is the one that spells out this exact mechanic in detail for **Remittance** Cancel Payment (government remittance payments), not paystub Cancel Payment. Phase 6's "Impacted" list independently names `CancelPaymentModal` as in-scope for this phase.

| Option | What it means | Recommendation |
|---|---|---|
| **A — Full reversal in Phase 6 (recommended)** | `CancelPaymentModal` posts an exact inverse `GLTransaction` set (every debit becomes a credit, vice versa) plus a reversing `BankTransaction`, mirroring O2 and reusing the same design Phase 7 will build for remittances. `PayStub.is_paid` flips back to `false`, but `pay_date` is **kept** (not nulled) so the reversal's own GL/Bank rows have a real transaction date to reference, and the original paid record stays fully traceable. Nothing is deleted — same "corrections stand alongside originals" convention used everywhere else in this codebase. | Matches O2 literally, matches what Phase 6 actually needs once Mark Paid does real posting, and gives Phase 7 a proven pattern to copy for remittances instead of inventing its own. Slightly larger scope than the source component, but the source component was compensating for a base44 function that never really worked. |
| **B — Flags-only, matching source exactly** | Port `CancelPaymentModal` byte-for-byte (flip `is_paid`/`pay_date` only). Any GL/Bank correction is handled manually via the existing Accounting → Journal Entries page, same as payroll adjustments (Q2/AddAdjustmentModal's fate). | Minimizes Phase 6 scope and risk, but reintroduces the exact orphaned-ledger-row problem O2 exists to prevent, and defers real functionality to a manual process this blueprint is otherwise trying to eliminate. |

6C's Detailed Execution Plan below is written against Option A.

#### Q2 reasoning (resolved above as fix-now)

While researching Phase 5's actual code (not just its plan doc) for the exact `PayPro_PayStub` payload shape, I found that `ytdData` — as constructed in both `PaychequeCreator.jsx` and `BatchPaychequeProcessor.jsx` when seeding YTD figures from the prior latest stub — never sets a `cpp2` key at all. But `PaychequeForm.jsx`'s save logic computes:
```js
ytd_cpp2: Math.round((ytdData.cpp2 + (standardDeductions.cpp2Deduction || 0)) * 100) / 100
```
`ytdData.cpp2` is `undefined` → `undefined + number` → `NaN` → `Math.round(NaN)` → `NaN`. Since no real employee has ever crossed the CPP2 floor (confirmed both in the imported data and by Phase 5's own §2 lessons table), this has never fired in production and Phase 5's O-9 synthetic-CPP2 gate apparently didn't catch it either (worth independently confirming why, but not blocking this plan). It **will** fire the first time any employee's `cpp2_deduction` is non-zero on a paycheque — a `ytd_cpp2: NaN` value written to a live pay stub, which Phase 6 then reads and displays on both PDF variants and posts through GL math (harmless for GL specifically, since GL only ever reads `cpp2_deduction`/`cpp_deduction` on the *current* stub, never the YTD field — but the pay stub itself would show `NaN` or fail to save depending on how Postgres handles a JS `NaN` going into a `double precision` column via `supabase-js`).

| Option | Recommendation |
|---|---|
| **A — Fix it now, in Phase 6, as a one-line change to `PaychequeCreator.jsx`/`BatchPaychequeProcessor.jsx`'s `ytdData` seed object** (add `cpp2: <prior stub's ytd_cpp2 or 0>`, mirroring how every other YTD field is already seeded) | **Recommended.** It's a one-line-per-file fix, directly in a file Phase 6 already needs to understand (the YTD figures it reads), and leaving a known `NaN`-producing bug live in a financial column while explicitly aware of it is worse than a small in-flight correction. Same spirit as Phase 5's own D2 (it already fixed one real bug — a stray `.reverse()` — while porting, rather than shipping it forward). |
| **B — Leave it, flag it as a separate defect** | Keeps Phase 6 strictly scoped to its own blueprint text, but ships a pay-stub module you already know contains a live financial NaN bug, and if it fires during Phase 8.5's parallel run it would look like a fresh Phase 6 defect when it's actually inherited from Phase 5. |

Resolved above as fix-now — see 6A's task list for the concrete fix location.

### 0.2 Decisions taken (self-resolved — stated so nothing below reads as an oversight)

**D1 — New edge functions use `paypro-*`, not `autopro-*`, despite this session's generic instruction template saying otherwise.** The prompt that generated this plan includes a boilerplate note: *"In AutoPro, any new Supabase edge functions must be named using the format `autopro-[functionname]`."* That is AutoPRO's **general** rule (`master_context.md` §4) — but the PayPRO module has a standing, explicitly-approved carve-out (blueprint decision **S1**, requirement #6/G7, lesson 12): all new PayPRO-module edge functions use `paypro-*`. This isn't a fresh judgment call — it's already load-bearing precedent: `paypro-uploadEmployeeFile`, `paypro-viewEmployeeFile` (Phase 3) and `paypro-generateTimeReport` (Phase 4) are already deployed to dev under this prefix. Phase 6's three new functions (`paypro-generatePayStubPDF`, `paypro-generatePayStubPDFEmployer`, `paypro-emailPaystubs`) follow the same convention. Noting this explicitly rather than either silently following the generic template (which would break naming consistency with three already-shipped functions) or silently ignoring it without saying so.

**D2 — The Fiscal Period gate is a deliberate *addition* layered onto the ported GL logic, not something inherited from the ported pattern.** `master_blueprint.md`'s Phase 6 text says Mark Paid's GL mapping is "ported unchanged" from `MarkPaidModal.jsx:402-435," and separately says the Fiscal Period gate "runs before any write" (Q8, approved). I read the live `MarkPaidModal.jsx` directly: it does **not** call `checkFiscalPeriodStatus()` anywhere today — grepped independently, confirmed zero hits in that file, despite being called from 9 other components elsewhere in the codebase. So "ported unchanged" describes the *account-mapping* logic only; the gate is new code added on top, per Q8's explicit approval, not a preserved existing behavior. Stating this so nobody mistakes a missing-gate finding for a porting error.

**D3 — PDF functions return `{ pdfDataUri, filename }` JSON, not raw bytes.** `master_context.md` §4 documents a single "PDF-generating functions return raw bytes" exception. I checked this against the actual deployed functions rather than trusting the doc: of 5 existing `autopro-generate*PDF*`/`autopro-generateWorkOrderPdf` functions, **3 return raw bytes** (`autopro-generateChequePDF`, `autopro-generateDepositSlipPDF`, `autopro-generateDepositDetailReport`) and **2 return JSON** (`autopro-generateARReceiptPDF`, `autopro-generateWorkOrderPdf`) — the documented convention is not actually universal. Since PayPRO's own base44 `emailPaystubs` function needs the exact same PDF bytes both to serve a "View PDF" click **and** to attach to an outgoing email, the JSON shape is more directly reusable (a data URI's base64 payload can be sliced and handed to Resend's attachment field without a second encode/decode round trip). **Decision: `paypro-generatePayStubPDF`/`paypro-generatePayStubPDFEmployer` return `{ pdfDataUri, filename }`** (matching `autopro-generateARReceiptPDF`/`autopro-generateWorkOrderPdf`'s precedent), and the PDF-building logic is factored into one shared Deno module (`supabase/functions/_shared/payStubPdf.ts`) that `paypro-emailPaystubs` calls **in-process** (not via a second HTTP round-trip to the other function) to get the same bytes for its attachment. This also fixes the "three near-duplicate vacation-pay-earned formulas" issue found during research (D7 below). Flagging the master_context.md discrepancy here; worth a standalone correction to that doc at Phase 6's rollup, not fixed now.

**D4 — `getBankAccounts` is deleted; `BankAccount` is read natively.** Already resolved in `master_blueprint.md` §2.4/Phase 6 text ("`getBankAccounts` is deleted — the frontend reads `BankAccount` natively"). Confirmed the base44 function itself does nothing but `select('*').eq('is_active', true)` — a straight `supabase.from('BankAccount').select('*').eq('is_active', true)` in `BatchPaymentModal.jsx` is a faithful, simpler replacement. No new decision here, just confirming the blueprint's existing call survives contact with the actual source code.

**D5 — Two source components are not ported: `DeletePayStub.jsx` and the client-side `PayStubPDF.jsx`.** Both are dead code in the source app today — confirmed via `PayStubs.jsx` import/usage: `DeletePayStub` isn't imported anywhere, and `PayStubPDF.jsx`'s only caller (`handleViewPayStub`) exists in `PayStubs.jsx` but isn't wired to any visible button (the actual "View" action calls `handleViewPayStubPDF`, which hits the two server-side PDF functions instead). Porting genuinely unreachable code adds file count and review surface for zero behavior — consistent with this project's existing bias against porting dead weight (Phase 3's D2/§0.2 made a similar call on `ConstantEditor.jsx`'s absent bracket UI). If a future need for either surfaces, they're one-off additions, not blocked by anything here.

**D6 — Employer EI multiplier is read from `PayPro_TaxYearConstant.ei_rate_employer_multiplier` (for the stub's `year`) instead of the hardcoded `* 1.4` used throughout the source.** Source hardcodes `1.4` independently in `BatchPaymentModal.jsx`'s preview text, `generatePayStubPDFEmployer`, and `PayStubPDF.jsx` — three separate hardcodes of a value that already has a real, admin-editable home (`ConstantEditor.jsx`, ported in Phase 3, has an "EI Employer Multiplier" field with the same `1.4` default). Employer CPP is a straight 1:1 match of employee CPP/CPP2 (no separate constant — CRA's own CPP employer-match rule, not something PayPRO ever made configurable), so that part of the source math is preserved unchanged. Since the constant already exists and is already user-editable, silently hardcoding its value a fourth time in new Phase 6 code would be reintroducing the exact "editable setting nobody reads" anti-pattern Phase 3's WorkPRO-API-key decision (§0.2) called out. On today's data this produces byte-identical output (the 2026 row's value is also `1.4`), so there's no behavior change to verify against historical stubs — just a forward-looking correctness fix.

**D7 — `additional_deductions`'s canonical shape on the stored `PayPro_PayStub` row stays `{name, type, amount}`** (Phase 5's write shape, already live on all 112 imported + any newly-created stubs, and what `PayStubPDF.jsx`/the PDF functions already read via `.name`). The *export-time* `{description, gl_account, amount}` reshaping BatchPaymentModal did for the old `exportPaystubs` payload is **not** ported as a stored shape — it was an artifact of that one function's input contract, not a real data model. Phase 6's GL-posting and PDF/email code all re-derive `gl_account` at read time by joining `stub.additional_deductions[].name` against `EmployeeDeduction.deduction_name` (case-insensitive, trimmed — exact match logic as source) for the stub's employee. This avoids introducing a second, drifting shape for the same data.

**D8 — PDF vacation-pay figures are read from the stub's own `income_breakdown` line items, never recomputed from the employee's *current* `vacation_pay_rate`.** Research found three different "vacation pay earned this period" formulas across the source (client `PayStubPDF.jsx`, `generatePayStubPDF`, `generatePayStubPDFEmployer`), each recomputing from `gross_pay * employee.vacation_pay_rate` with slightly different banked-status guards. Phase 5 already computed the authoritative figures once, at stub-creation time, and stored them as `{type: 'Vacation Pay', amount}` / `{type: 'Vacation Pay (Released from Bank)', amount}` entries inside `income_breakdown` — the shared PDF builder (D3) sums those directly. This is strictly more correct (a stub's PDF can't silently drift if the employee's rate changes after the fact) and collapses three inconsistent formulas into one read path.

---

## 1) Phase Scope & Objectives

### In scope

Port PayPRO's pay-stub lifecycle end to end: the `PayStubs.jsx` list/detail page, viewing/editing/cancelling individual (unpaid) stubs, generating both PDF variants (employee/employer copies), emailing pay stubs, and — the phase's core purpose — collapsing the old `exportPaystubs` → manual-`MarkPaidModal` two-step handoff into a single `BatchPaymentModal` action that posts real `GLTransaction` + `BankTransaction` rows directly, gated by the Fiscal Period check.

### Objectives

| # | Objective |
|---|---|
| O-1 | `PayStubs.jsx` lists all `PayPro_PayStub` rows with the same paid/unpaid/remitted/cancelled selection-and-action model as source, on AutoPRO's page-canvas/dark-mode conventions |
| O-2 | `EditPayStub.jsx` and `CancelPaychequeModal.jsx` round-trip an unpaid stub's editable fields and pre-payment cancellation, through `payrollEntities.js` |
| O-3 | `paypro-generatePayStubPDF`/`paypro-generatePayStubPDFEmployer` generate both pay-stub PDF variants server-side, sharing one PDF-building module (D3) that reconciles the three inconsistent vacation-pay formulas found in source (D8) |
| O-4 | `paypro-emailPaystubs` sends pay-stub PDFs via Resend (`sendViaResend`, **never** `logAndSendEmail` — requirement #10), gated by a dev/test recipient allowlist (R7), following the proven pattern in `autopro-sendAppointmentReminders` |
| O-5 | `BatchPaymentModal.jsx` replaces the old `exportPaystubs`+manual-`MarkPaidModal` handoff with one action: balance-checked, sequential, Fiscal-Period-gated GL + Bank posting, ported from `MarkPaidModal.jsx`'s mapping logic and adapted to `PayPro_PayStub`'s own field names |
| O-6 | The Bus Driver GL split (5008/5009) defaults from `PayPro_Employee.employee_type === 'Bus Driver'` (O3) but stays operator-overridable per stub, exactly as source's mandatory-flag UX |
| O-7 | `CancelPaymentModal.jsx` behavior resolved per Q1's answer |
| O-8 | Every ported page/modal ships dark-mode classes from the start (lesson 27) |
| O-9 | Zero new base44 references introduced; `payrollEntities.js` remains the only entity access path; `getBankAccounts`, `exportPaystubs`, `generateAutoPROFile` are not ported (deleted per blueprint §2.4/Phase 6 text) |
| O-10 | `checkFiscalPeriodStatus()` runs before any GL/Bank-writing action in this phase, rejecting a pay date in a closed or unconfigured fiscal period (Q8, D2) |

### Explicitly NOT in scope

- Remittances, remittance Mark Paid/Cancel Payment (Phase 7)
- T4s, Reports, Trends (Phase 8)
- The Phase 8.5 parallel run itself (validation gate, not build work)
- `DeletePayStub.jsx`, client-side `PayStubPDF.jsx` — dead code in source, not ported (D5)
- Any change to `PayrollTransaction` (out of scope for the entire merge, decision S3) — it is read, not written, by nothing in this phase; AutoPRO's stopgap `Payroll.jsx`/`MarkPaidModal.jsx` (the pattern this phase borrows from) are untouched here and deleted wholesale later in Phase 10
- Remittance-level Cancel Payment reversal design (Phase 7 builds its own, though per Q1/Option A it would reuse this phase's pattern)

### Why multi-phase, not single

Mirrors Phase 3's rationale: three workstreams with genuinely different risk profiles and no shared files between them.

- **6A** is pure CRUD over an already-secured table (`PayPro_PayStub`), no new infrastructure, no money movement — lowest risk.
- **6B** introduces three new edge functions and this module's first outbound email — new infrastructure, but still no GL/Bank writes, so a bug here can't corrupt the ledger.
- **6C** is the actual "highest financial risk in the project" work per the blueprint's own words — real `GLTransaction`/`BankTransaction` posting, the Fiscal Period gate, and (per Q1) possibly a full reversal engine. Isolating it means 6A and 6B can ship and be used independently while 6C gets the most scrutiny.

```
   6A (Pay Stub CRUD) ──┐
                         ├──► Final Verification (all 3 together) ──► Phase 7
   6B (PDF + Email)    ──┤
                         │
   6C (Mark Paid → GL)  ──┘   *highest risk, most scrutiny*
```
6A and 6B have no dependencies on each other. 6C depends on 6A existing (it operates on the same list/selection UI) but not on 6B (PDF/email are independent of GL posting).

---

## 2) Lessons Learned & Context

Pulled from `master_blueprint.md` §7 and Phases 3–5's own handoff notes, filtered to what actually bites this phase.

| # | Lesson | How it applies here |
|---|---|---|
| 1 | `employee_id` carries three meanings | `PayPro_PayStub.employee_id` is the **business key** (`EMP001`), matching `PayPro_Employee.employee_id` — not `employee_id_ref`, not the system id. Confirmed directly in `BatchPaymentModal.jsx`'s `employeeMap.find(e => e.employee_id === stub.employee_id)`. Comment this at every join, per the lesson's own instruction. |
| 6 | The shim owns id generation and audit fields | `PayPro_PayStub.update()` calls in this phase (e.g. `is_paid`, `pay_date`) must go through `payrollEntities.js`, not a raw `.update()` — and per the shim's own comment, never pass `updated_by`/`updated_by_id`, only `updated_date` is set automatically. |
| 11 | `TaxCalculator.jsx` ported byte-identical | Not directly touched by Phase 6 (Phase 5 owns it), but its outputs (`federal_tax`, `provincial_tax`, `cpp_deduction`, `cpp2_deduction`, `ei_deduction` on each stub) are exactly what this phase's GL posting reads. Do not re-derive or "clean up" these values here — read them as stored. |
| 16/19 | jsonb double-encoding; dollar columns never `bigint` | `income_breakdown`/`additional_deductions` are real jsonb arrays on `PayPro_PayStub` (confirmed via live schema query) — never `JSON.stringify()` a write to them. All dollar columns on `PayPro_PayStub` are already `double precision` (Phase 1 fixed the mis-typed ones) — no new risk here, just confirming the ground is already sound. |
| 21 | `bigint` bound against `text` state breaks Radix `<Select>` | `BankAccount.gl_account`/`id` are `text` — the bank-account picker in `BatchPaymentModal.jsx` must bind `SelectItem value={account.id}` as a string (it already is, `id` is `text`), no casting needed, but verify after the port since this bug class has hit 6+ files already. |
| 27 | Dark mode is first-class | Every ported file in this phase (an estimated 6–7 components + 1 page) currently carries PayPRO's `bg-slate-50`/light-only classes — add `dark:` variants during the port, not after. |
| 28 | `cn()`/tailwind-merge silently drops conflicting utilities | Applies to every `Dialog`-based component this phase touches (`EditPayStub`, `CancelPaychequeModal`, `CancelPaymentModal`, `BatchPaymentModal`, `EmailPaystubsModal`) — verify each renders centered/fixed after porting. |
| 12 | New edge functions use `paypro-*` | `paypro-generatePayStubPDF`, `paypro-generatePayStubPDFEmployer`, `paypro-emailPaystubs` (D1). |
| 13 | Payroll email never touches `SentEmailLog` | `paypro-emailPaystubs` must import `sendViaResend`, never `logAndSendEmail` — confirmed both exist side-by-side in `_shared/resend.ts` today, so this is a real choice to get right, not a hypothetical. |
| — (Phase 4 §5.3) | The in-function `paypro_user`-check pattern from `paypro-generateTimeReport` (`Authorization` header → `auth.getUser()`/JWT-claims decode → `Employee.paypro_user` lookup) is "the template for every future `paypro-*` service-role function" | Directly reused by all three of this phase's new edge functions, following the same pattern already established in Phase 3's `paypro-uploadEmployeeFile`/`paypro-viewEmployeeFile` (AAL2/`staff_strong_auth()`-equivalent JWT-claim check + `paypro_user` check, since RLS can't gate a service-role client). |
| — (Phase 4 §5.3) | On a `verify_jwt: true` function, a **missing** `Authorization` header is intercepted by the platform gateway itself (`401`) before the function's own code runs; the function's own `{error}`@200 convention only covers a header that's present-but-invalid or a later authorization-logic branch | Don't write a "no Authorization header" test expecting a `200 {error}` response for these three new functions — expect a gateway-level `401` for that specific case, and a `200 {error}` for every other rejection path. |
| — (Phase 5 §4 handoff) | Every `PayPro_PayStub` row Phase 5 creates has `is_paid`/`paid_via` at column defaults (`null`/`false`) — "Phase 6 ... is what moves them to a paid state" | Directly confirms this phase's scope boundary — nothing upstream has touched these two fields yet. |
| — (Phase 5 §2, CPP2) | No real employee crosses the CPP2 floor in 2026 data; only a synthetic test exercises it | This phase's own verification can't rely on real data to exercise `cpp2_deduction`/`ytd_cpp2` GL posting or PDF display — reuse Phase 5's synthetic-employee technique if this phase needs to verify CPP2's path through Mark Paid. |
| — (this research pass) | `MarkPaidModal.jsx` does not currently call `checkFiscalPeriodStatus()` | D2 — the gate is new code, not inherited. |
| — (this research pass) | `PayPro_PayStub.additional_deductions[]` elements use `{name, type, amount}`; `EmployeeDeduction` rows they join against use `{deduction_name, deduction_type, gl_account, amount}` — different key names on each side of the join, by design (one's a stub-time snapshot, the other's live config) | Every read site (GL posting, PDF, email) must match on `stub.additional_deductions[].name` (case-insensitive, trimmed) against `EmployeeDeduction.deduction_name`, exactly as source did — not against `EmployeeDeduction.id`, since the stub snapshot never stored that id. |

---

## 3) Phase 6 Roadmap & Progress

| Sub-phase | Status | Overview |
|---|---|---|
| 6A | Built — awaiting live browser verification | Pay Stub list/detail page, Edit Pay Stub, Cancel Paycheque (pre-payment) — pure CRUD, no new infra |
| 6B | Built + deployed to dev — awaiting live browser verification | Two PDF-generation edge functions (sharing one builder module), Email Pay Stubs modal + edge function with dev allowlist guard |
| 6C | Built — awaiting live browser verification | Batch Payment → GL/Bank posting (the collapsed Mark Paid flow), Fiscal Period gate, Cancel Payment with full GL/Bank reversal (Q1 resolved: Option A) |

---

### 6A — Pay Stub List, Edit, Cancel Paycheque

**New files:**
- `src/pages/paypro/PayStubs.jsx` *(replaces the Phase 2 placeholder body)*
- `src/components/paypro/paystubs/EditPayStub.jsx`
- `src/components/paypro/paystubs/CancelPaychequeModal.jsx`

**Not ported (D5):** `DeletePayStub.jsx` (unreachable in source UI).

#### Detailed Execution Plan

**`PayStubs.jsx`** — port of source (structure confirmed via research, exact line count not yet read in full — will be read in full at execution time, not estimated here to avoid a wrong number):
- `PayStub.list('-paycheque_number')`, `Employee.list()`, `Remittance.list()` on mount, via `payrollEntities.js` — import-path swap only.
- `remittedStubIds = remittances.flatMap(r => r.pay_stub_ids || [])` — unchanged logic. A stub is locked from edit/cancel/re-payment if `isRemitted || isPaid || isCancelled`, unchanged.
- Selection model unchanged: `selectionType` (`'paid'|'unpaid'|null`) prevents mixed-status multi-select. Unpaid selection enables "Process Payment" (opens 6C's `BatchPaymentModal`); paid selection enables "Cancel Payment" (opens 6C's `CancelPaymentModal`) and "Email" (opens 6B's `EmailPaystubsModal`). Row-level "Edit"/"Cancel" open 6A's `EditPayStub`/`CancelPaychequeModal`.
- "View PDF" (employee/employer toggle) calls 6B's two new edge functions instead of `base44.functions.invoke('generatePayStubPDF'/'generatePayStubPDFEmployer', {stubId})` — response shape changes from a raw-binary `response.data` to `{pdfDataUri, filename}` JSON (D3); the download trigger changes from a Blob-from-binary to a direct `<a href={pdfDataUri} download={filename}>`-style trigger.
- The "AutoPRO text file download" action (`generateAutoPROFile`) is **dropped entirely** — the function is deleted (blueprint §2.4, "generateAutoPROFile also dies — a .txt handoff made obsolete by integration"). Remove its button/handler, don't stub it.
- Wrap in AutoPRO's page-canvas convention (`max-w-7xl mx-auto p-6 space-y-6`), matching every other ported `/paypro/*` page from Phases 3–5, not PayPRO's `p-6 bg-slate-50 min-h-screen`.

**`EditPayStub.jsx`** — port of source:
- Local-state form seeded from the stub's period dates, `gross_pay`, `federal_tax`, `provincial_tax`, `cpp_deduction`, `cpp2_deduction`, `ei_deduction`, `net_pay`, all `ytd_*`, `vacation_pay_balance_forward`. Numeric fields coerced via `parseFloat(value) || 0` — unchanged.
- On save: recompute `total_deductions = federal_tax + provincial_tax + cpp_deduction + cpp2_deduction + ei_deduction`, `net_pay`, `year` from `pay_period_start`, explicitly preserve `is_paid` from the original row (never let this form change paid status) — unchanged logic, `PayStub.update(id, ...)` via the shim.
- **Confirmed gotcha, preserved deliberately:** source's `editData` never includes `additional_deductions`/`income_breakdown` — those two jsonb arrays are simply absent from the update payload. Since `payrollEntities.js`'s `update()` does a real Postgres `UPDATE ... SET` with only the passed columns (not a full-row replace), omitting them is safe and correct here — it leaves those arrays untouched, matching source's intent (this form was never meant to edit line items). Confirm this understanding holds before writing the shim call, but do not add UI for editing those arrays — out of scope, matches source.

**`CancelPaychequeModal.jsx`** — port of source:
- Single mutation: `PayStub.update(id, { is_cancelled: true })`. No function invoke, no GL/Bank impact — this only ever applies to a stub that was never paid (paid-stub cancellation is `CancelPaymentModal`, a different component, 6C). Straight port, dark-mode classes added.

#### Task List

- [ ] Create `src/components/paypro/paystubs/` directory
- [ ] Read `PayStubs.jsx`, `EditPayStub.jsx`, `CancelPaychequeModal.jsx` in full from `kadr-paypro` at execution time (this plan's research pass summarized, not transcribed, these files)
- [ ] Port `EditPayStub.jsx`, `CancelPaychequeModal.jsx` with import-path swaps + dark-mode classes
- [ ] Replace `src/pages/paypro/PayStubs.jsx` placeholder body with the real page (View PDF wired to 6B's functions once they exist; Process Payment/Cancel Payment/Email buttons present but their modals land in 6B/6C — stub with a disabled state or sequence 6A after 6B/6C if a working page end-to-end is preferred before shipping any of it)
- [ ] Remove the "download AutoPRO text file" action entirely (function deleted, O-9)
- [ ] **Q2 fix:** in `src/components/paypro/payroll/PaychequeCreator.jsx` and `BatchPaychequeProcessor.jsx`, add `cpp2: <prior stub's ytd_cpp2 ?? 0>` to the `ytdData` seed object (alongside the existing `cpp`/`ei`/`gross`/`federal_tax`/`provincial_tax`/`net` keys), fixing the `ytd_cpp2: NaN` bug found during this phase's research. Verify with a synthetic CPP2-bearing stub (Phase 5's O-9 technique) that `ytd_cpp2` now computes a real number, not `NaN`, on a second consecutive stub for the same synthetic employee
- [ ] Confirm `payrollEntities.js` needs zero changes for 6A's calls

#### Verification Plan

At `test.kensauto.ca`, after commit + push, with a `paypro_user: true`, AAL2 session:

- [ ] `/paypro/PayStubs` lists all 112 real pay stubs, correct paid/unpaid/remitted/cancelled visual states
- [ ] Selecting stubs of mixed paid status disables both batch actions; same-status selection enables the correct one
- [ ] Edit an unpaid stub's federal/provincial/CPP/CPP2/EI figures → Save → `total_deductions`/`net_pay`/`year` recompute correctly, `is_paid` unchanged, `income_breakdown`/`additional_deductions` unchanged on reload
- [ ] Cancel an unpaid stub → `is_cancelled: true`, stub now excluded from further edit/payment actions
- [ ] Both light and dark mode: no unstyled elements
- [ ] `grep -r "base44"` / `"@/entities/all"` in the new 6A files: zero matches (comments referencing base44 for context, as in Phase 3's `OtherTab.jsx`, are fine — no live imports)

---

### 6B — PDF Generation & Email

**New files:**
- `supabase/functions/_shared/payStubPdf.ts` *(new shared module — not in source, D3/D8)*
- `supabase/functions/paypro-generatePayStubPDF/index.ts`
- `supabase/functions/paypro-generatePayStubPDFEmployer/index.ts`
- `supabase/functions/paypro-emailPaystubs/index.ts`
- `src/components/paypro/paystubs/EmailPaystubsModal.jsx`

**Not ported (D5):** `src/components/payroll/PayStubPDF.jsx` (client-side HTML print view, unreachable in source).

#### Detailed Execution Plan

**`_shared/payStubPdf.ts`** — new module, factored out of the two near-duplicate source PDF generators (`generatePayStubPDF`/`generatePayStubPDFEmployer`) plus the reconciliation from D8:
- Exports one function, e.g. `buildPayStubPdf(stub, employee, options: { employerCopy: boolean })`, returning `{ pdfDataUri, filename }` via `jsPDF`'s `doc.output('datauristring')` (D3), matching `autopro-generateARReceiptPDF`'s pattern (`unit: 'mm', format: 'letter'`, manual `yPosition` layout, manual page-break at `y > 250`).
- Layout preserved from source: company header (name/address/phone/fax/email — same hardcoded block already used in `autopro-generateARReceiptPDF`, reuse verbatim rather than re-typing it a third time), Employee/Payment-details two-column header, Income/Deductions two-column table, optional Banked Vacation Pay block, YTD section, optional comments block.
- **Employer-copy differences** (when `options.employerCopy`): "EMPLOYER COPY" watermark text; deductions table shows both Employee and Employer columns per line (`employerEI = employeeEI * multiplier` — D6's `TaxYearConstant.ei_rate_employer_multiplier`, not hardcoded `1.4`; `employerCPP = employeeCPP`, `employerCPP2 = employeeCPP2` — 1:1, unchanged); split YTD-Employee/YTD-Employer sections (employer EI YTD computed on the fly as `ytd_ei * multiplier`, matching source — not a stored column).
- **Vacation pay display (D8):** sum `income_breakdown` entries where `type === 'Vacation Pay'` for the paid-out amount, and `type === 'Vacation Pay (Released from Bank)'` for the released-from-bank amount. Show the Banked Vacation Pay block only when `employee.is_vacation_banked` is true **and** there is actual balance or activity to show (source's client component's guard, deliberately kept over the two server functions' looser "always show once banked-enrolled, even at $0" guard — cleaner output, same information).
- **Additional deductions (D7):** for each `stub.additional_deductions[]` entry, look up `gl_account` by joining `EmployeeDeduction` where `employee_id_ref === employee.id` (system id, not business key — lesson 1) and `deduction_name.trim().toLowerCase() === entry.name.trim().toLowerCase()`; render the line with or without the GL account depending on whether the PDF variant shows it (source's PDFs don't actually print `gl_account` — only `BatchPaymentModal`'s AutoPRO-text preview did; keep it out of the PDF unless you find otherwise when reading the full source file at execution time).

**`paypro-generatePayStubPDF`/`paypro-generatePayStubPDFEmployer`** — thin edge functions:
1. `OPTIONS` short-circuit.
2. `paypro_user` + AAL2 in-function check (Phase 3/4 template — lesson row above).
3. Fetch `PayPro_PayStub` by `id` (payload: `{ body: { stubId } }`), fetch `PayPro_Employee` by `employee_id` (business key match, not system id — same as source), fetch the matching `PayPro_TaxYearConstant` row for the stub's `year` (D6).
4. Call `buildPayStubPdf(stub, employee, { employerCopy: <true for the Employer variant> })`, return its `{pdfDataUri, filename}` as `200 {data: ...}` or `200 {error}` on failure.

**`paypro-emailPaystubs`** — replaces base44's `emailPaystubs`:
1. `OPTIONS` short-circuit, same `paypro_user`/AAL2 check.
2. Payload: `{ body: { payStubIds: string[] } }` — unchanged contract from source's client call site.
3. Per id: fetch stub + employee (skip and record if `!employee.email`, matching `EmailPaystubsModal.jsx`'s client-side pre-filter — but re-check server-side too, never trust the client's filter alone for a payroll send), call `buildPayStubPdf(stub, employee, {employerCopy: false})` **in-process** (no HTTP round-trip to the sibling function — same Deno process, same deploy, just a function call) to get the attachment bytes.
4. **Recipient allowlist guard (R7), modeled on `autopro-sendAppointmentReminders`'s proven pattern:** `PAYSTUB_TEST_MODE` env var, default-on unless explicitly `'false'`; `PAYSTUB_ALLOWLIST_EMAIL` env var (default `tyler@kensauto.ca`, matching the existing precedent's default). When test mode is on and the employee's email doesn't case-insensitively match the allowlist, **skip the send** (do not call `sendViaResend`) and record it in the function's own response as skipped — **not** in `SentEmailLog` (requirement #10 forbids that table for payroll email entirely, so the existing precedent's "log a skipped_test_mode row to SentEmailLog" behavior is **not** copied here; use the response payload's own per-stub results array instead).
5. Send via `sendViaResend` (never `logAndSendEmail` — requirement #10), attaching the PDF (Resend's `attachments: [{filename, content: base64PdfWithoutDataUriPrefix}]`).
6. Return `{ data: { sent: number, skipped: number, failed: number, errors: string[] } }` — **and actually surface `failed`/`errors` to the caller**, fixing the confirmed source bug where `EmailPaystubsModal.jsx` only ever checked `response.data.error` (top-level), never the per-item `results.failed`/`results.errors` the base44 function already computed but never got read.

**`EmailPaystubsModal.jsx`** — port of source, functional change only where D3/D7 above require it:
- Splits `stubs` into `missingEmails` vs `validStubs` (client-side pre-filter, unchanged) — send button disabled/warned when any selected employee has no email.
- `supabase.functions.invoke('paypro-emailPaystubs', { body: { payStubIds: validStubs.map(s => s.stub.id) } })`, and **this time actually check and surface `data.failed`/`data.errors`** in the UI (fixing the source bug noted above — small, contained, directly in a file this phase already owns).

#### Task List

- [ ] Write `_shared/payStubPdf.ts`, reconciling the vacation-pay formula (D8) and reading the employer multiplier from `TaxYearConstant` (D6)
- [ ] Build + deploy `paypro-generatePayStubPDF` to dev
- [ ] Build + deploy `paypro-generatePayStubPDFEmployer` to dev
- [ ] Build + deploy `paypro-emailPaystubs` to dev, with the test-mode allowlist guard armed by default
- [ ] Port `EmailPaystubsModal.jsx`, fixing the failed/errors-surfacing bug
- [ ] Wire "View PDF" (both variants) in 6A's `PayStubs.jsx` to the two new functions
- [ ] Confirm zero `SentEmailLog` writes result from any path through `paypro-emailPaystubs` (grep the function source, then confirm empirically)

#### Verification Plan

- [ ] Generate an employee-copy PDF for a real stub → company header, employee/payment details, income/deductions, YTD all correct against the stub's stored values
- [ ] Generate an employer-copy PDF for the same stub → watermark present, employee+employer columns correct, employer EI uses the *current* `TaxYearConstant.ei_rate_employer_multiplier` (spot-check by temporarily editing it in Setup and regenerating — confirms D6 actually reads live, then revert)
- [ ] Generate a PDF for EMP004 (Cheryl Lawrence, Bus Driver) and at least one non-Bus-Driver employee — confirm vacation-pay figures match `income_breakdown`, not a recomputed formula (spot-check by editing `vacation_pay_rate` on the employee after stub creation and regenerating — figures must **not** change, per D8)
- [ ] Email a real stub to an address matching `PAYSTUB_ALLOWLIST_EMAIL` on dev → arrives with correct PDF attached, **zero** rows added to `SentEmailLog`
- [ ] Email a stub to an employee whose address does *not* match the allowlist, with test mode on (default) → send is skipped, response reports it as skipped, **no email actually sent**
- [ ] Force a per-recipient failure (e.g. a malformed email on a test employee) → response's `failed`/`errors` are non-empty **and** the UI actually shows this (confirms the fixed bug)
- [ ] Both light and dark mode: no unstyled elements in `EmailPaystubsModal`

---

### 6C — Batch Payment → GL/Bank Posting & Cancel Payment

**New/modified files:**
- `src/components/paypro/paystubs/BatchPaymentModal.jsx` *(new — no source equivalent exists as a ported component; this is a new implementation replacing `exportPaystubs`+manual-`MarkPaidModal`, built from `MarkPaidModal.jsx`'s mapping logic adapted to `PayPro_PayStub` fields)*
- `src/components/paypro/paystubs/CancelPaymentModal.jsx` *(scope per Q1)*

**Not ported:** `getBankAccounts`, `exportPaystubs` (both deleted, D4/O-9).

#### Detailed Execution Plan

**`BatchPaymentModal.jsx`** — this is the phase's core deliverable. Two-step wizard, matching source's UX shape (pick pay date + bank account + per-stub Bus Driver flags → preview → confirm), but with the *posting* logic entirely replaced:

**Step 1 (unchanged from source):**
- `payDate`, `selectedBankAccountId` (from `supabase.from('BankAccount').select('*').eq('is_active', true)`, native — D4), and a mandatory `busDriverFlags[stub.id]` boolean per selected stub, **pre-filled from `PayPro_Employee.employee_type === 'Bus Driver'`** (O3/O-6) but editable — submission still blocked if any flag is `undefined` after the default-fill (mirrors source's mandatory-flag validation, just starting from a smarter default instead of forcing a manual tick for every stub every time).

**Step 2 — preview (adapted, not a byte-for-byte port):** source's preview rendered a fixed-width "AutoPRO file" text block per stub, purely because that text format was also what got downloaded via `generateAutoPROFile` — a function this phase deletes (O-9). Preview instead renders the same information as a normal on-screen summary (income lines from `income_breakdown`, deductions from `additional_deductions` joined to `EmployeeDeduction.gl_account` — same join as D7), because there's no longer a text-file format to keep byte-compatible with.

**Step 3 — submit (`handleSubmit`, the real change):** ported and adapted from `MarkPaidModal.jsx`'s `handleMarkPaid`, one property at a time:

1. **Fiscal Period gate (O-10, new — D2):** before anything else, call `checkFiscalPeriodStatus(payDate)` once for the whole batch (all stubs share one `payDate` per source's own UX). If `!isValid`, show the message and stop — no writes attempted.
2. **Balance check (ported, tolerance preserved):** loop all selected stubs, accumulate:
   - Credits: `net_pay` + `(federal_tax + provincial_tax)` + `(cpp_deduction + cpp2_deduction)` + `ei_deduction` + `Σ additional_deductions[].amount` + employer CPP match + employer EI (D6)
   - Debits: `gross_pay` + employer CPP match + employer EI
   - `if (Math.abs(totalDebits - totalCredits) > 0.02) throw` — same `0.02` tolerance as source, not exact equality.
3. **Sequential per-stub loop (ported: not `Promise.all`, awaited in order):** for each stub —
   - `PayStub.update(stub.id, { is_paid: true, pay_date: payDate, paid_via: 'Direct Deposit' })` via the shim (default matches `PayStub.paid_via`'s own base44 default — confirm this default is meaningful to preserve or drop the field if the shim/table default already covers it).
   - Insert one `BankTransaction`: `bank_account_id`, `transaction_date: payDate`, `description: "Paycheque ${paycheque_number}"`, `reference: paycheque_number`, `debit_amount: net_pay`, `credit_amount: 0`, `cleared: false`, `source_type: 'payment'`, `source_id: stub.id`, `gl_account: 'Split'` (matches source's `MarkPaidModal` convention for a multi-line-item payment), `created_date`/`updated_date` via `moment.tz('America/Edmonton').format()` (same Mountain-time convention as source).
   - Push GL rows onto an in-memory array (not inserted yet): credit Bank (`selectedAccount.gl_account || '1000'`) = `net_pay`; debit `5008`/`5009` (per `busDriverFlags[stub.id]`, O-6) = `gross_pay`; credit `2054` = `federal_tax + provincial_tax` (only if > 0); credit `2052` = `cpp_deduction + cpp2_deduction` (only if > 0); credit `2053` = `ei_deduction` (only if > 0); credit each `additional_deductions[]` entry's joined `gl_account` (D7) = `amount` (only if amount > 0 and a `gl_account` was found — **what happens when no match is found needs a decision at execution time**: source silently dropped the line if `gl_account` was falsy; consider surfacing this as a blocking validation instead, since a silently-dropped deduction line would break the balance check that already ran in step 2 — flag as a build-time finding, not resolved here); debit `5006`/credit `2052` = employer CPP match; debit `5007`/credit `2053` = employer EI (D6's multiplier).
4. **Single bulk `GLTransaction` insert**, ids assigned at flush time (`crypto.randomUUID().replace(/-/g,'').substring(0,24)`) — exact pattern from `MarkPaidModal.jsx`.
5. **One `autopro-calculateBankBalances` call**, once, for the selected bank account — exact pattern from source.
6. Close the modal, refresh the list, surface success/`GLTransaction` failure and `BankTransaction` failure distinctly if either throws mid-loop (source aborts on first error via a thrown exception inside the `for` loop — **note this leaves prior iterations' writes in place, no transaction wrapping** — this is an inherited, pre-existing gap in the pattern being ported, not something to silently fix; flag it in Phase Results if it's judged worth a follow-up).

**`CancelPaymentModal.jsx`** — per Q1's resolution (Option A): posts an exact-inverse `GLTransaction` set for the selected paid stubs' original posting (every debit becomes a credit and vice versa) plus a reversing `BankTransaction`, then `PayStub.update(id, { is_paid: false })` — **`pay_date` is kept**, not nulled (differs from source deliberately, see Q1's reasoning above), followed by one `autopro-calculateBankBalances` call. This requires looking up each selected stub's *original* posting (the `GLTransaction`/`BankTransaction` rows `BatchPaymentModal` created, matched via `source_id = stub.id` and `source_type = 'payment'`) to know what to invert — not a recomputation from the stub's current field values, since those don't change between payment and cancellation but the actual posted rows are the authoritative record to reverse.

#### Task List

- [ ] Build `BatchPaymentModal.jsx` — Step 1/2 UI, Fiscal Period gate, balance check, sequential posting loop, bulk GL insert, bank-balance recalc
- [ ] Resolve the "no GL account match found on a deduction line" question found during execution-plan drafting (see step 3 above) before shipping — don't let it ship as a silent data-loss path
- [ ] Build `CancelPaymentModal.jsx` with full GL/Bank reversal (Q1: Option A) — reverse the *actual posted* `GLTransaction`/`BankTransaction` rows (matched via `source_id`/`source_type`), not a recomputation
- [ ] Wire both into 6A's `PayStubs.jsx` action buttons
- [ ] Confirm `payrollEntities.js` needs no changes (all writes here are plain `create`/`update`/native `supabase.from()` calls, same pattern as `MarkPaidModal.jsx` itself, which never used a shim)

#### Verification Plan

- [ ] Select a batch of unpaid stubs spanning at least one Bus Driver (EMP004) and one regular employee → Process Payment → `SUM(debit) = SUM(credit)` on the inserted `GLTransaction` batch, exactly one `BankTransaction` per stub with the correct `net_pay` debit
- [ ] EMP004's stub posts to `5009`; a regular employee's posts to `5008`; override the pre-filled flag on one stub and confirm the override, not the default, determines the posting account
- [ ] Bank account's `current_balance` moves by exactly the sum of the batch's net pay after the run
- [ ] A pay date inside a closed `FiscalPeriod` is rejected **before any write** — confirm via a subsequent query that zero rows were inserted, not just that an error appeared
- [ ] A pay date with no covering `FiscalPeriod` at all is also rejected, with a distinct, correct message
- [ ] A deduction whose `EmployeeDeduction.gl_account` lookup fails is handled per whatever resolution the open task-list item above lands on — not silently dropped
- [ ] Cancel Payment on a just-paid batch → exact-inverse `GLTransaction` set posted, one reversing `BankTransaction` per stub, bank balance returns to its pre-payment figure, originals still present and traceable, `is_paid` false with `pay_date` retained
- [ ] A synthetic CPP2-bearing stub (reusing Phase 5's O-9 technique) posts its `cpp2_deduction` into the same `2052` CPP Payable line as `cpp_deduction`, combined — confirms the combined-CPP posting logic handles a nonzero CPP2 value correctly even though no real data can exercise this yet
- [ ] Both light and dark mode: no unstyled elements in `BatchPaymentModal`/`CancelPaymentModal`

---

### Final Verification Plan (6A + 6B + 6C together)

Run after all three sub-phases are individually verified, at `test.kensauto.ca`, with a real `paypro_user: true` AAL2 session:

- [ ] Full round trip on a small batch of test stubs (reuse Phase 5's synthetic-employee pattern rather than real employee data where possible): create via Phase 5's Payroll page → view both PDF variants → email one → batch-pay the rest → view a paid stub's PDF again (figures unchanged) → cancel one payment (per Q1) → confirm final state everywhere (list page, GL, Bank, employee's banked-vacation balance if applicable) is internally consistent
- [ ] `grep -r "base44"` / `"@base44"` across every new file in this phase: zero matches (informational comments referencing base44 for context are fine, per Phase 3's precedent)
- [ ] `git status` confirms no PayPRO source file was copied verbatim — every ported file went through the import-path swap + dark-mode-class + GL-logic-replacement pass described above
- [ ] Payroll dropdown/More modal nav still correctly routes to `/paypro/PayStubs`
- [ ] Re-run Phase 5's O-8/O-9 style spot-check against a handful of the 112 real imported stubs' *display* (not creation) through the new PDF functions — confirms the PDF builder reads stored values faithfully rather than silently recomputing anything it shouldn't (ties directly to D8)

### Handoff Context to Phase 7

- Phase 7 (Remittances & Cancel Payment) is the next strictly-sequential phase per the blueprint's dependency graph — it explicitly builds on GL-posting patterns this phase establishes.
- **Phase 7's own Remittance Cancel Payment should reuse this phase's exact-inverse-GL-set pattern** (Q1: Option A) rather than inventing a second one — note the shared design explicitly in Phase 7's own plan when it's written.
- **The Fiscal Period gate pattern established here (D2/O-10)** — called once per batch, before any write, using the batch's shared `payDate` — is the template for Phase 7's own remittance-date gate.
- **The `paypro_user`/AAL2 in-function check pattern**, now used by 5 `paypro-*` functions across Phases 3/4/6, remains the template for Phase 7's `paypro-postRemittanceGL`.
- **Unresolved from this phase, needs Phase 7 (or a dedicated pass) to at least confirm it's not also present there:** the sequential-loop-with-no-transaction-wrapping gap noted in 6C's task list — a mid-batch failure leaves partial writes with no automatic rollback. This is inherited from `MarkPaidModal.jsx`'s own existing pattern (pre-existing in AutoPRO today, not introduced by this phase), but Phase 7's own remittance posting will hit the exact same shape of risk and should make the same judgment call consistently rather than independently.
- **The CPP2 YTD `NaN` bug (Q2, fixed in 6A)** — once fixed, worth a one-line note in Phase 5's own plan doc (§4.2 Deviations) crediting the fix's actual origin, since it's a Phase-5-authored bug fixed during Phase 6. Phase 8.5's own exit criteria already flag CPP2 as under-tested by real data (§ "CPP2 will not be validated by this run" note in the blueprint) — the fix removes one more reason that gap could bite, but doesn't close it; the synthetic-employee test remains the only real coverage.

---

## 4) Phase Results and Final Context

*(populated during execution — append, never overwrite)*

### 4.1 Execution Log

| Sub-phase | Started | Completed | Notes |
|---|---|---|---|
| 6A | 2026-08-18 | 2026-08-18 (build) | `EditPayStub.jsx`, `CancelPaychequeModal.jsx` ported; `PayStubs.jsx` placeholder replaced with the real page; Q2 CPP2 YTD NaN fix applied to `PaychequeCreator.jsx`/`BatchPaychequeProcessor.jsx`. Not yet live-browser-verified. |
| 6B | 2026-08-18 | 2026-08-18 (build + deploy) | `_shared/payStubPdf.ts` written; `paypro-generatePayStubPDF`, `paypro-generatePayStubPDFEmployer`, `paypro-emailPaystubs` deployed to dev (`sitihbdnuxifwibontcm`) — all `ACTIVE`, version 1. `EmailPaystubsModal.jsx` ported with the failed/errors-surfacing fix. Not yet live-browser-verified (auth-gated functions need a real AAL2 session to exercise). |
| 6C | 2026-08-18 | 2026-08-18 (build) | `BatchPaymentModal.jsx` and `CancelPaymentModal.jsx` built. Not yet live-browser-verified. |

### 4.2 Deviations from Plan

- **`_shared/resend.ts`'s `sendViaResend` gained an optional 6th `attachments` param** (not called out explicitly in the plan's 6B text, but required to satisfy requirement #10's "must use `sendViaResend`, never `logAndSendEmail`" alongside D3's need to attach the built PDF). Backward-compatible — every existing caller passes 5 args and is unaffected; only bundled into the already-deployed function when that function is next redeployed.
- **6C's flagged open question (deduction line with no resolvable `EmployeeDeduction.gl_account`) was resolved as: block the whole batch submission with a clear per-employee/per-deduction error, checked before the balance check runs** — not a silent drop (which the plan itself flagged as breaking the balance check) and not a partial post. Validation happens for every selected stub up front, inside `handleSubmit`, before any write.
- **`CancelPaymentModal.jsx` introduces a "cancellation date" (today, via `toLocaleDateString('en-CA')`) as the reversal's own GL/Bank `transaction_date` and the value the Fiscal Period gate (O-10) is checked against.** The plan's Q1 write-up didn't specify this explicitly; today's date is the actual date the reversal event happens, which is the only date that makes sense to gate a *new* write against (the original `pay_date` is preserved on the stub for traceability, but re-using it as the reversal's own transaction date would let a reversal silently backdate into an already-closed fiscal period).
- **`BankTransaction.is_reversed`/`reversed_by_id` were deliberately left untouched.** Grepped the whole codebase first — these columns have never been written to anywhere (only read, as a display/filter concern in `Bank.jsx`/`Reconcile.jsx`/etc.), so there's no established write convention to match. The plan's own Option A framing ("nothing is deleted... corrections stand alongside originals") only calls for posting the inverse rows, not flagging the originals — followed that literally rather than inventing a new convention unprompted.

### 4.3 Unexpected Learnings

- `sendViaResend` (the module every payroll-adjacent email function is required to use per requirement #10) had no attachment support at all before this phase — every existing caller only ever sent plain HTML emails. Worth remembering for any future function that needs to email a PDF: the shared helper needed a real code change, not just a new call site.
- Confirmed empirically (via `execute_sql` against dev) that `GLTransaction.transaction_date` is a real `date` column (not `text`, unlike `BankTransaction.transaction_date`) — both accept a plain `YYYY-MM-DD` string fine from `supabase-js`, but it's worth flagging since the schema isn't symmetric between the two tables despite them almost always being written together.

### 4.4 Rollup Notes for `master_context.md` / `master_blueprint.md`

*(populated as Phase 6 completes — already known to include at least: the PDF-response-convention correction to `master_context.md` §4 noted in D3, since that document currently states a single convention that isn't actually universal)*
