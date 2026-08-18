# Phase 7 Implementation Plan — Remittances & Cancel Payment

**Parent:** `master_blueprint.md` Phase 7 · **Created 2026-08-18** · **Status: Verified 2026-08-18 (live browser pass, real GL/Bank posting confirmed)** — both open questions resolved 2026-08-18 (see §0.1); live verification results in §4's checklist and §5.5. One real bug found and fixed same day (double-submission risk when the report auto-open fails) — see §5.5.

**Format: single-phase** — see rationale in §1.

> **This is a LIVE document.** §4's verification plan and §5 are the working area, to be updated during execution. Do not wipe prior content — append and adjust.

---

## 0) Open Questions, Decisions & Clarifications

### 0.1 Decisions taken on the two open questions (resolved 2026-08-18, before execution)

**Q1 — RESOLVED: Option A, client-side posting.** No `paypro-postRemittanceGL` edge function. `RemittanceDialog.jsx`/`CancelRemittanceModal.jsx` post `GLTransaction`/`BankTransaction` directly from the browser, exactly like Phase 6's `BatchPaymentModal.jsx`/`CancelPaymentModal.jsx`. §3's Detailed Execution Plan below is written against this answer — no changes needed. `master_blueprint.md`'s Phase 7 "Impacted" list naming this function is now stale and will be corrected at rollup (§5.4).

**Q2 — RESOLVED: Option A, skip `ClosePeriodModal.jsx`.** Not ported. `Remittances.jsx` gets a "Manage Period Close Date" pointer to `paypro/Setup` instead of a second editor for the same `PayPro_PayrollSetting` row. §3.1 is written against this answer.

*(Original open-question framing preserved for context — both are now decided, not open.)*

#### Q1 reasoning (resolved above as client-side posting)

`master_blueprint.md`'s Phase 7 "Impacted" list names a new edge function, `paypro-postRemittanceGL`, and Phase 6's own handoff note (written before Phase 6's code was actually built) assumed Phase 7 would need one. Having now built and live-verified Phase 6's `BatchPaymentModal.jsx`/`CancelPaymentModal.jsx`, that assumption doesn't hold up: **every GL/Bank-posting write in this codebase — AP, LOC, Banking, GST, and now Payroll (Phase 6) — posts directly from the authenticated client**, gated by RLS's own AAL2 requirement on `GLTransaction`/`BankTransaction`, never through a service-role edge function. Confirmed empirically against dev: the 6 real historical remittance GL postings (from AutoPRO's stopgap `MarkPaidModal.jsx`, pre-Phase-7) were themselves posted this same client-side way.

**Update, post-approval:** Phase 6's `BatchPaymentModal.jsx`/`CancelPaymentModal.jsx` have since been fully live-verified end-to-end against real dev data by a separate testing pass (`phase_6_implementation_plan.md` §4.5, `master_blueprint.md`'s Phase 6 entry now marked `[Verified 2026-08-18]`) — `SUM(debit)=SUM(credit)` exact, bank balance deltas exact to the cent, both Fiscal Period rejection paths confirmed with zero writes, and full Cancel Payment reversal confirmed to restore the exact original balance. This isn't just a design precedent anymore; it's a proven-live pattern, which is the strongest form of confirmation this resolution could have.

| Option | What it means | Recommendation |
|---|---|---|
| **A — No new edge function (recommended)** | `RemittanceDialog.jsx`/`CancelRemittanceModal.jsx` post `GLTransaction`/`BankTransaction` directly from the browser, exactly like Phase 6's `BatchPaymentModal.jsx`/`CancelPaymentModal.jsx`. Zero new server-side surface for this phase. | Matches every other GL-posting module in the app, matches how the *existing* remittance GL rows were actually posted historically, and is the exact pattern Phase 6 already built and is awaiting live verification on. Simpler, less code, nothing new to secure. |
| **B — Build `paypro-postRemittanceGL`** | A new service-role edge function does the Fiscal Period check + balance check + posting, called from the client with `{remittanceId, ...}`. | Matches the blueprint's literal text. Only a real advantage if there's a reason to want this specific write path enforced server-side (e.g. planned future automation, or a policy preference for centralizing remittance posting) that isn't visible from the codebase alone. |

#### Q2 reasoning (resolved above as skip)

Researched this before assuming it needed porting: **`PayPro_PayrollSetting`'s `period_close_date` key is already fully live** — editable today at `paypro/Setup` → General Settings tab (`Setup.jsx`, shipped in an earlier phase) and already **enforced** in `Payroll.jsx`'s `validateDates()` (blocks new paycheque periods on/before the close date). Source's `ClosePeriodModal.jsx` is a second, standalone dialog on the *Remittances* page that edits the exact same `{key: 'period_close_date', value}` row — not broken, not dead code, just a second UI surface for a setting that already has one.

| Option | What it means | Recommendation |
|---|---|---|
| **A — Skip it (recommended)** | Don't port `ClosePeriodModal.jsx`. If useful, add a small "Manage Period Close Date in Setup" link/button on the Remittances page pointing to `paypro/Setup` instead of a second editor. | Avoids two independent UI paths writing the same settings row (no data-corruption risk either way — same key, last save wins — but it's genuine duplicate surface, not genuine redundant-safety). Consistent with this project's existing bias against porting redundant UI (Phase 6's D5 skipped `DeletePayStub.jsx`/client `PayStubPDF.jsx` for being unreachable; this is the adjacent case of reachable-but-duplicate). |
| **B — Port it anyway** | Straight port, dark-mode classes added, coexists with `Setup.jsx`'s own editor for the same row. | Matches source 1:1, some users may find a shortcut on the Remittances page itself convenient rather than navigating to Setup. Zero technical risk either way — purely a UX call. |

Resolved above as skip — §3.1 is written against a one-line pointer button as the substitute.

### 0.2 Decisions taken (self-resolved — stated so nothing below reads as an oversight)

**D1 — `PayPro_Remittance` has no `is_paid` column; the equivalent state is `status` (text).** `master_blueprint.md`'s Phase 7 text says Cancel Payment "flips `is_paid` back to false" — that phrasing is carried over from Phase 6's paystub-level Q1 write-up and doesn't apply literally here; `PayPro_Remittance` (confirmed live schema) has `status`, currently only ever written as `'completed'` (6 rows, all imported/historical, zero exceptions). **Cancel Payment sets `status: 'cancelled'`** — a new value, no live precedent to conflict with. Nothing is deleted; `pay_stub_ids` stays on the row for audit, matching the "corrections stand alongside originals" convention Phase 6's O2/Option A already established. Will flag this phrasing correction for `master_blueprint.md` at rollup.

**D2 — Cancelling a remittance must un-lock its paystubs, which means touching Phase 6's already-shipped `PayStubs.jsx`.** `PayStubs.jsx` (Phase 6) computes `remittedStubIds = remittances.flatMap(r => r.pay_stub_ids || [])` across *every* `PayPro_Remittance` row, with no status filter — a cancelled remittance's stubs would stay locked forever otherwise, with no way to include them in a corrected remittance. Both `PayStubs.jsx` and the new `Remittances.jsx`'s own "available paid paycheques" query must filter to `r.status !== 'cancelled'` before flat-mapping `pay_stub_ids`. This is a small, mechanical change but it's a real cross-phase file touch, called out explicitly in §3 so it isn't missed.

**D3 — `RemittanceReportPDF.jsx` ports as client-side HTML → `window.open()`, unchanged from source — not modernized to the server-side jsPDF/`{pdfDataUri,filename}` convention Phase 6 established (D3 there).** Two reasons this is a real distinction, not an inconsistency: (1) Phase 6's D5 declined to port `PayStubPDF.jsx` specifically because it was *dead code* (unreachable from any live button) — `RemittanceReportPDF.jsx` is the opposite: it's the *only* report mechanism for remittances in source, called live from both `RemittanceDialog`'s post-submit flow and `RemittanceHistory`'s "Report" button. (2) It already satisfies `master_context.md`'s print-window convention (a separate `window.open()` document, no in-page style bleed) and has zero base44/legacy coupling to fix. Modernizing it to a new server-side edge function would be scope not requested by the blueprint's own Phase 7 text (which names no PDF-generation edge function for remittances) and adds risk for no correctness gain. Port verbatim, import-path + dark-adjacent classes only where they'd show (the report itself is a print document, not part of the app shell, so it keeps its own light-only styling — same treatment `RemittanceReportPDF`'s sibling `PayStubPDF.jsx` got when it was still live).

**D4 — No new edge functions means `payrollEntities.js` needs zero changes.** `Remittance`/`PayrollSetting` are already mapped (Phase 2). All Phase 7 writes are either through the shim (`Remittance.create`/`.update`) or native `supabase.from('GLTransaction'|'BankTransaction')` calls, exactly mirroring Phase 6's `BatchPaymentModal.jsx`/`CancelPaymentModal.jsx` pattern.

**D5 — The old AutoPRO stopgap flow (`Payroll.jsx`/`MarkPaidModal.jsx`/`PayrollTransaction`) stays live and untouched, and can still be used in parallel.** Per S3, `PayrollTransaction` is explicitly out of scope for this entire merge ("you will remove it manually"). This means a staff member could, in theory, still manually create a `PayrollTransaction`-type Remittance row through the old stopgap page after this phase ships, alongside the new native `PayPro_Remittance` flow — two independent systems tracking real-world remittance payments with no cross-linkage. This is an inherited risk, not introduced by this phase (Phase 6 carried the identical risk on the paystub side), and is explicitly deferred to Phase 10 ("`Payroll.jsx`/`MarkPaidModal.jsx`... deleted wholesale later in Phase 10" per Phase 6's own handoff note). No action taken here beyond noting it.

**D6 — Cancel Payment can only ever reverse remittances created through this phase's own new flow — confirmed, not hypothetical.** Checked directly: the 5 real, imported `PayPro_Remittance` rows on dev (`remittance_date` 2026-02-11 through 2026-08-15, all `status: 'completed'`) have **no** corresponding `GLTransaction`/`BankTransaction` rows keyed to their own `id`. The real GL/Bank postings that *do* exist for these same real-world remittance events are keyed to `PayrollTransaction.id` (the old stopgap flow's own id, a different row entirely, in a different table, imported separately from base44). Attempting to Cancel Payment on any of these 5 legacy rows will correctly find zero original GL/Bank rows and refuse with a clear error (§3's `CancelRemittanceModal.jsx`, same defensive guard Phase 6's `CancelPaymentModal.jsx` already uses) — **this is expected, correct behavior, not a bug**, and should not be mistaken for one during verification. Cancel Payment only works on remittances processed after this phase ships.

---

## 1) Phase Scope & Objectives

### In scope

Port PayPRO's government-remittance lifecycle end to end: aggregating paid, unremitted paystubs into a `PayPro_Remittance` record, viewing remittance history and reports, and — the phase's core purpose, mirroring Phase 6 — collapsing the old `exportRemittance` → manual-`MarkPaidModal` two-step handoff into a single action that posts real `GLTransaction`/`BankTransaction` rows directly, plus a net-new full-reversal Cancel Payment for remittances (no source equivalent existed; built following Phase 6's O2/Option A pattern).

### Objectives

| # | Objective |
|---|---|
| O-1 | `Remittances.jsx` lists paid, unremitted `PayPro_PayStub` rows with selection + running totals, on AutoPRO's page-canvas/dark-mode conventions |
| O-2 | `RemittanceDialog.jsx` replaces `exportRemittance` + manual Mark Paid with one action: creates the `PayPro_Remittance` row **and** posts balance-checked, Fiscal-Period-gated GL + Bank entries in the same submit, ported from `MarkPaidModal.jsx`'s Remittance branch (lines ~389-444) |
| O-3 | `CancelRemittanceModal.jsx` (new, no source equivalent) posts an exact-inverse `GLTransaction` set plus a reversing `BankTransaction` for a single remittance, matched against its *actual posted* rows via `source_id`/`source_type` — never a recomputation (D1, mirrors Phase 6 O2/Option A) |
| O-4 | `RemittanceHistory.jsx` ports with dark mode, gains the Cancel Payment action per row, and correctly reflects `status: 'cancelled'` |
| O-5 | `RemittanceReportPDF.jsx` ports verbatim (client HTML → `window.open()`, D3) |
| O-6 | `checkFiscalPeriodStatus()` runs before any GL/Bank-writing action in this phase (Mark Paid and Cancel Payment both), gated on `remittance_date` / cancellation date respectively — same convention as Phase 6's O-10 |
| O-7 | Cancelling a remittance un-locks its `pay_stub_ids` for a future remittance — both `Remittances.jsx`'s own query and Phase 6's `PayStubs.jsx` filter to non-cancelled remittances (D2) |
| O-8 | Zero new base44 references; `payrollEntities.js` remains the only shim entity path (no changes needed, D4); `exportRemittance` is not ported (deleted per blueprint) |
| O-9 | Every ported/new file ships dark-mode classes from the start (lesson 27) |

### Explicitly NOT in scope

- T4s, Reports, Trends, the base44-logo repoint (Phase 8)
- Any change to `PayrollTransaction` or the old stopgap `Payroll.jsx`/`MarkPaidModal.jsx` (out of scope for the entire merge, S3 — see D5)
- Backfilling or correlating the 5 legacy imported `PayPro_Remittance` rows with their historical `PayrollTransaction`-keyed GL postings (D6) — not requested, not low-risk, not needed for this phase's objectives
- `ClosePeriodModal.jsx` — resolved as skip (Q2); a Setup pointer button substitutes
- A dedicated `paypro-postRemittanceGL` edge function — resolved as not needed (Q1); posting is client-side, matching Phase 6

### Why single-phase, not multi-phase

Unlike Phase 6 (three genuinely independent workstreams — CRUD, PDF/email infra, GL posting — each shippable on its own), Phase 7's scope is small and concentrated: one page, four-to-five components, almost all of it either read-only reporting (`RemittanceHistory`, `RemittanceReportPDF` — low risk) or GL-posting (`RemittanceDialog` Mark Paid, `CancelRemittanceModal` — the same "highest financial risk" category as Phase 6, but here it's the *entire* phase, not one-third of it). There's no natural seam to split sub-phases across; a single detailed execution plan covers it more clearly than three artificially-divided ones.

---

## 2) Lessons Learned & Context

Pulled from `master_blueprint.md` §7, Phase 6's own handoff notes, and this plan's own research pass — filtered to what actually bites this phase.

| # | Lesson | How it applies here |
|---|---|---|
| 1 | `employee_id` carries three meanings | Not directly touched here — `PayPro_Remittance` doesn't carry an `employee_id` of its own, only `pay_stub_ids`. Any employee lookups (for the report/history views) go through `PayPro_PayStub.employee_id` (business key) exactly as Phase 6 already established. |
| 6 | The shim owns id generation and audit fields | `Remittance.create()`/`.update()` go through `payrollEntities.js`, never a raw `.update()`. `GLTransaction`/`BankTransaction` writes are native `supabase.from()` calls with client-generated 24-char hex ids, exactly like Phase 6's `BatchPaymentModal.jsx` — these two payroll-adjacent tables were never in the shim's `TABLE_MAP` and don't need to be. |
| R5 | GL posting must balance; port the balance check unchanged | Applies even though remittance totals are pre-summed (by construction, `totalRemittance = incomeTax + cppEmployee + cppEmployer + eiEmployee + eiEmployer` should already equal the bank credit) — still run the same `Math.abs(debits - credits) > 0.02` guard as a defensive check before writing anything, per R5's own instruction to port the check "unchanged," not to trust the construction. |
| Q8/O-10 (Phase 6) | Fiscal Period gate runs before any write, at actual save time, gated on the resolved date | Applies identically here — gated on `remittance_date` for Mark Paid, and on the cancellation's own date for Cancel Payment (mirroring Phase 6's `CancelPaymentModal.jsx` choice to gate on "today," not the original date — see D1 there). |
| O2 (blueprint) | Cancel Payment = complete reversal, nothing deleted, originals stay for audit | The whole basis for `CancelRemittanceModal.jsx`'s design (O-3) — same pattern Phase 6 built and is awaiting live verification on for paystubs. |
| 12 | New edge functions use `paypro-*` | Only relevant if Q1 is answered "B" — if so, the new function is `paypro-postRemittanceGL`, following the exact `paypro_user`+AAL2-JWT-decode auth template Phase 6's three new functions already established. |
| 27 | Dark mode is first-class | Every ported/new file in this phase currently carries (or, for `CancelRemittanceModal.jsx`, would otherwise be written without) light-only classes — add `dark:` variants during the port/build, not after. |
| 28 | `cn()`/tailwind-merge silently drops conflicting utilities | Applies to every `Dialog`-based component here (`RemittanceDialog`, `RemittanceHistory`, `CancelRemittanceModal`) — verify each renders centered/fixed after porting/building. |
| master_context.md §4 | Fiscal Period gate depends entirely on `FiscalPeriod` being *readable* | Already fixed app-wide (RLS strong-auth pass, 2026-08-16) — not a new risk, just the standing dependency this phase's gate calls also share. |
| master_context.md §4 (ID generation) | 24-char hex (`crypto.randomUUID().replace(/-/g,'').substring(0,24)`) for `GLTransaction`/`BankTransaction`, since neither has a working DB default | Directly reused, identical to Phase 6. |
| — (this research pass) | The 6 real historical remittance GL postings on dev (pre-Phase-7, via the old stopgap flow) use `BankTransaction.gl_account: '2050'` as a literal placeholder tag (not a real chart-of-accounts lookup) and `reference: 'Remittance-${remittance_date}'` | Both conventions ported unchanged into the new native flow for consistency with existing Bank register rows — see §3. |
| — (this research pass) | `PayPro_Remittance.status` has exactly one live value today (`'completed'`), across all 5 real imported rows | Directly informs D1 — `'cancelled'` is a clean new value to introduce, no conflicting precedent. |

---

## 3) Detailed Execution Plan

**New files:**
- `src/components/paypro/remittances/RemittanceDialog.jsx`
- `src/components/paypro/remittances/RemittanceHistory.jsx`
- `src/components/paypro/remittances/RemittanceReportPDF.jsx`
- `src/components/paypro/remittances/CancelRemittanceModal.jsx` *(new — no source equivalent, built from Phase 6's `CancelPaymentModal.jsx` pattern)*

**Modified:**
- `src/pages/paypro/Remittances.jsx` *(replaces the Phase 2 placeholder body)*
- `src/pages/paypro/PayStubs.jsx` *(Phase 6 file — D2's `remittedStubIds` status filter)*

**Not ported (Q2):** `src/components/paypro/remittances/ClosePeriodModal.jsx` — resolved as skip.

**Deleted:** none new (`exportRemittance` was a base44-only function, never migrated — nothing to delete on this side).

### 3.1 `Remittances.jsx` (page)

Port of source `src/pages/Remittances.jsx` (273 lines), adapted:

- On mount: `PayStub.filter({ is_paid: true })` (shim) + `Employee.list()` + `Remittance.list()` — three parallel fetches, same as source.
- **D2 change:** `remittedStubIds = remittances.filter(r => r.status !== 'cancelled').flatMap(r => r.pay_stub_ids || [])`, then `availableStubs = stubs.filter(s => !remittedStubIds.includes(s.id) && !s.is_cancelled)` — the `!s.is_cancelled` guard is new relative to source (defensive: a stub cancelled via Phase 6's `CancelPaychequeModal`/`CancelPaymentModal` should never surface here even if somehow marked `is_paid`).
- Selection + running-totals calculation (`calculateTotals()`) ports unchanged **except** the employer-EI-per-stub multiplier: source hardcodes `* 1.4`; **replace with `PayPro_TaxYearConstant.ei_rate_employer_multiplier` for each stub's own `year`** (same D6 fix Phase 6 already made for paystub PDFs/GL — this file independently hardcoded the same `1.4` and needs the identical correction, fetched once via `TaxYearConstant.list()` on mount and looked up per stub by `stub.year`).
- Table columns, Select All, "View History" button, page-canvas wrapper (`max-w-7xl mx-auto p-6 space-y-6`, matching Phase 6's `PayStubs.jsx`) — straight port with dark-mode classes added throughout (source is 100% light-only: `bg-slate-50`, `text-slate-900`, etc.).
- **Q2 (resolved: skip `ClosePeriodModal`):** replace the "Close Period" button with a small outline button/link — "Manage Period Close Date" — navigating to `createPageUrl("paypro/Setup")` (Setup already has the tab).

### 3.2 `RemittanceDialog.jsx`

Port of source `src/components/remittances/RemittanceDialog.jsx` (334 lines), with the actual mechanical change concentrated entirely in `handleSubmit` (O-2, the phase's core deliverable):

**Unchanged from source:**
- `remittanceDate`/`periodStart`/`periodEnd` state, defaulted from selected stubs' min/max `pay_period_start`/`pay_period_end` via string sort.
- The `generateRemittanceText()`/preview-text step (`handleGeneratePreview`) — still a useful on-screen preview before committing, same as Phase 6 kept `BatchPaymentModal`'s 2-step wizard shape. **Correction while porting:** its `eiEmployer` computation also hardcodes `* 1.4` — same D6-style fix as §3.1, read from `TaxYearConstant` instead.
- `handleDownloadPreview()` (client-side `.txt` blob download) — this is **not** the same as Phase 6's deleted `generateAutoPROFile` (that was a server round-trip to a base44-mirrored edge function); this is a pure client-side text-blob generator with no server call at all. Keep it — no reason to delete a working, zero-risk convenience export.

**Replaced — `handleSubmit` (was: `Remittance.create()` → `base44.functions.invoke('exportRemittance', ...)` → open `RemittanceReportPDF` in a new tab):**

```js
const handleSubmit = async () => {
  setProcessing(true);
  try {
    // O-6: Fiscal Period gate before any write, gated on remittance_date.
    const fiscalStatus = await checkFiscalPeriodStatus(remittanceDate);
    if (!fiscalStatus.isValid) {
      setError(fiscalStatus.message);
      setProcessing(false);
      return;
    }

    const bankAccounts = await supabase.from('BankAccount').select('*').eq('is_active', true);
    // ...bank account selection, same as Phase 6's BatchPaymentModal (D4 there — read natively)

    // R5: balance check, ported unchanged in spirit (0.02 tolerance) even though the
    // totals are pre-summed and should already balance by construction.
    const totalCredits = totals.totalRemittance; // bank leg
    const totalDebits = totals.incomeTax + totals.cppEmployee + totals.cppEmployer
                       + totals.eiEmployee + totals.eiEmployer; // 2054+2052+2053 legs
    if (Math.abs(totalDebits - totalCredits) > 0.02) {
      throw new Error(`GL transactions do not balance. Debits: $${totalDebits.toFixed(2)}, Credits: $${totalCredits.toFixed(2)}`);
    }

    // Create the PayPro_Remittance row first (shim - generates id, audit fields).
    const newRemittance = await Remittance.create({
      remittance_date: remittanceDate,
      period_start: periodStart,
      period_end: periodEnd,
      total_gross_pay: Math.round(totals.grossPay * 100) / 100,
      total_income_tax: Math.round(totals.incomeTax * 100) / 100,
      total_cpp_employee: Math.round(totals.cppEmployee * 100) / 100,
      total_cpp_employer: Math.round(totals.cppEmployer * 100) / 100,
      total_ei_employee: Math.round(totals.eiEmployee * 100) / 100,
      total_ei_employer: Math.round(totals.eiEmployer * 100) / 100,
      total_remittance: Math.round(totals.totalRemittance * 100) / 100,
      pay_stub_ids: selectedStubs.map(s => s.id),
      status: 'completed',
    });

    const reference = `Remittance-${remittanceDate}`;
    const mountainTimestamp = moment.tz('America/Edmonton').format();

    // Ported from MarkPaidModal.jsx's Remittance branch (~L389-444), source_id now
    // the new PayPro_Remittance.id instead of a PayrollTransaction.id.
    await supabase.from('BankTransaction').insert({
      id: generateId(), bank_account_id: selectedAccount.id, transaction_date: remittanceDate,
      description: `Remittance ${reference}`, reference, debit_amount: totals.totalRemittance,
      credit_amount: 0, cleared: false, source_type: 'payment', source_id: newRemittance.id,
      gl_account: '2050', created_date: mountainTimestamp, updated_date: mountainTimestamp,
    });

    const glRows = [
      { account_number: selectedAccount.gl_account || '1000', transaction_date: remittanceDate,
        description: 'Remittance payment', reference, debit_amount: 0, credit_amount: totals.totalRemittance,
        source_type: 'payment', source_id: newRemittance.id },
      { account_number: '2054', transaction_date: remittanceDate, description: 'Remittance paid - Income Tax',
        reference, debit_amount: totals.incomeTax, credit_amount: 0, source_type: 'payment', source_id: newRemittance.id },
      { account_number: '2052', transaction_date: remittanceDate, description: 'Remittance paid - CPP',
        reference, debit_amount: totals.cppEmployee + totals.cppEmployer, credit_amount: 0,
        source_type: 'payment', source_id: newRemittance.id },
      { account_number: '2053', transaction_date: remittanceDate, description: 'Remittance paid - EI',
        reference, debit_amount: totals.eiEmployee + totals.eiEmployer, credit_amount: 0,
        source_type: 'payment', source_id: newRemittance.id },
    ];
    const { error: glError } = await supabase.from('GLTransaction').insert(
      glRows.map(row => ({ id: generateId(), ...row }))
    );
    if (glError) throw new Error(`GL posting failed (remittance record was still created - reconcile manually): ${glError.message}`);

    const { data: balanceData, error: balanceError } = await supabase.functions.invoke('autopro-calculateBankBalances', {
      body: { bankAccountId: selectedAccount.id },
    });
    if (balanceError) throw balanceError;
    if (balanceData?.error) throw new Error(balanceData.error);

    // Report still opens automatically post-submit, unchanged from source (D3).
    const pdfHTML = RemittanceReportPDF(newRemittance, selectedStubs, employees);
    const pdfWindow = window.open("", "_blank");
    pdfWindow.document.write(pdfHTML);
    pdfWindow.document.close();

    onComplete();
  } catch (err) {
    console.error('Error processing remittance:', err);
    setError(err.message || 'An error occurred while processing the remittance. Please try again.');
  } finally {
    setProcessing(false);
  }
};
```

Note the **bank account picker is new relative to source** — source's `RemittanceDialog.jsx` never selected a bank account at all (it only ever wrote `PayrollTransaction`, no `BankTransaction`); this phase's dialog needs one, same UI pattern as Phase 6's `BatchPaymentModal.jsx` (native `BankAccount` fetch, `SelectItem value={account.id}`, string-bound per lesson 21).

**Not a single sequential loop over stubs** — unlike Phase 6's per-paystub loop (one GL/Bank set *per stub*), a remittance posts **one** set of GL/Bank rows for the *whole batch* (four GL rows + one bank row total, regardless of how many stubs are included) — this is a real structural difference from Phase 6, not an oversight. `source_id` on every row is the new `PayPro_Remittance.id`, not a per-stub id.

### 3.3 `CancelRemittanceModal.jsx` (new)

No source equivalent — built directly from Phase 6's `CancelPaymentModal.jsx` pattern (O2/Option A), adapted for a *single* remittance rather than a batch of stubs:

```js
export default function CancelRemittanceModal({ remittance, onComplete, onCancel }) {
  // ... processing/error state, same shape as Phase 6's CancelPaymentModal

  const handleCancel = async () => {
    setProcessing(true);
    try {
      const cancellationDate = new Date().toLocaleDateString('en-CA'); // O-6, gated below
      const fiscalStatus = await checkFiscalPeriodStatus(cancellationDate);
      if (!fiscalStatus.isValid) { setError(fiscalStatus.message); setProcessing(false); return; }

      const { data: originalGlRows } = await supabase.from('GLTransaction')
        .select('*').eq('source_type', 'payment').eq('source_id', remittance.id);
      const { data: originalBankRows } = await supabase.from('BankTransaction')
        .select('*').eq('source_type', 'payment').eq('source_id', remittance.id);

      // D6: expected to be empty for the 5 legacy imported remittances - fail clearly,
      // don't silently no-op.
      if ((!originalGlRows?.length) && (!originalBankRows?.length)) {
        throw new Error('No original GL/Bank posting found for this remittance - nothing to reverse. (Remittances imported before this phase shipped were never posted through this system and cannot be reversed here.)');
      }

      if (originalGlRows?.length) {
        const reversalRows = originalGlRows.map(row => ({
          id: generateId(), account_number: row.account_number, transaction_date: cancellationDate,
          description: `Reversal - ${row.description}`, reference: row.reference,
          debit_amount: row.credit_amount || 0, credit_amount: row.debit_amount || 0,
          source_type: 'payment_reversal', source_id: remittance.id,
        }));
        const { error } = await supabase.from('GLTransaction').insert(reversalRows);
        if (error) throw new Error(`GL reversal failed: ${error.message}`);
      }

      let touchedBankAccountId = null;
      if (originalBankRows?.length) {
        const mountainNow = new Date().toISOString();
        const reversalBankRows = originalBankRows.map(row => ({
          id: generateId(), bank_account_id: row.bank_account_id, transaction_date: cancellationDate,
          description: `Reversal - ${row.description}`, reference: row.reference,
          debit_amount: row.credit_amount || 0, credit_amount: row.debit_amount || 0, cleared: false,
          source_type: 'payment_reversal', source_id: remittance.id, gl_account: row.gl_account,
          created_date: mountainNow, updated_date: mountainNow,
        }));
        const { error } = await supabase.from('BankTransaction').insert(reversalBankRows);
        if (error) throw new Error(`Bank reversal failed: ${error.message}`);
        touchedBankAccountId = originalBankRows[0].bank_account_id;
      }

      // D1: status, not is_paid - PayPro_Remittance has no is_paid column.
      // pay_stub_ids is deliberately left untouched (audit trail, D1/D2).
      await Remittance.update(remittance.id, { status: 'cancelled' });

      if (touchedBankAccountId) {
        const { data: balanceData, error: balanceError } = await supabase.functions.invoke('autopro-calculateBankBalances', {
          body: { bankAccountId: touchedBankAccountId },
        });
        if (balanceError) throw balanceError;
        if (balanceData?.error) throw new Error(balanceData.error);
      }

      onComplete();
    } catch (err) {
      console.error('Error cancelling remittance:', err);
      setError(err.message || 'An error occurred. Please try again.');
    } finally {
      setProcessing(false);
    }
  };
  // ... confirm dialog UI, dark mode, matching Phase 6's CancelPaymentModal visually
}
```

Triggered from a "Cancel" row action in `RemittanceHistory.jsx` (§3.4), disabled/hidden when `remittance.status === 'cancelled'` already.

### 3.4 `RemittanceHistory.jsx`

Port of source `src/components/remittances/RemittanceHistory.jsx` (241 lines):

- `Remittance.list('-remittance_date')` on open (shim).
- `handleViewReport`/`handleDownloadText` port unchanged (D3) — both are pure client-side (PDF-in-new-tab, `.txt` blob), same `1.4`→`TaxYearConstant` multiplier fix as §3.1/§3.2 applied inside `handleDownloadText`'s own inline totals recompute.
- **New:** a `status` column/badge (`Completed` / `Cancelled`, green/gray, matching Phase 6's paystub status badge conventions) and a row-level "Cancel" button (disabled + tooltip when already cancelled), opening `CancelRemittanceModal`.
- Dark mode classes added throughout (source is light-only).

### 3.5 `RemittanceReportPDF.jsx`

Port of source `src/components/remittances/RemittanceReportPDF.jsx` (180 lines) **verbatim** (D3) — import-path swap only (no `@/entities/all` reference exists in this file to begin with; it's a pure function taking `(remittance, payStubs, employees)` as args, no imports of its own beyond nothing). Literally zero changes needed beyond moving the file and confirming its two callers (`RemittanceDialog.jsx`, `RemittanceHistory.jsx`) import it from the new path.

### 3.6 `PayStubs.jsx` (Phase 6 file, D2 follow-up)

One-line change to the existing `loadPayStubs()`:

```diff
- setRemittedStubIds(remittances.flatMap((r) => r.pay_stub_ids || []));
+ setRemittedStubIds(remittances.filter((r) => r.status !== 'cancelled').flatMap((r) => r.pay_stub_ids || []));
```

---

## 4) Verification Plan

At `test.kensauto.ca`, after commit + push, with a `paypro_user: true`, AAL2 session. Live browser testing — this section is executed by a separate parallel testing pass, same convention as Phase 6.

**Dev-state notes for the tester (live snapshot taken 2026-08-18, right after this phase's code was written):**
- 5 real, historical `PayPro_Remittance` rows exist (imported from base44), all `status: 'completed'`, covering `remittance_date` 2026-02-11 through 2026-08-15. **Per D6, attempting Cancel Payment on any of these should correctly fail with "no original posting found" — this is expected, not a bug.**
- **6 real, paid, unremitted `PayPro_PayStub` rows already exist and will appear on `/paypro/Remittances` immediately — no test data needs to be created first**, unlike Phase 6's equivalent gap. Confirmed via SQL: `202608-001` (EMP002, pay_date `2026-08-08`) and `202608-002` through `202608-006` (EMP011/EMP009/EMP008/EMP003/EMP001, all pay_date `2026-08-14`). Recommended: select all 6 for one real end-to-end Process Remittance test, then use that same new remittance for the Cancel Payment test (D6's *reversible* case, as opposed to the 5 legacy rows).
- Fiscal Period coverage on dev is unchanged since Phase 6's plan: open `2026-07-01`–`2026-09-30` and `2026-10-01`–`2026-12-31`; closed `2026-01-01`–`2026-06-30` and all of 2025/2024; nothing configured after `2027-03-31`. Today (2026-08-18) and the 6 stubs' pay dates above all fall inside the open Q3 window, so the default flow should work without any special date picking. Re-verify if testing happens materially later.
- Active `BankAccount` balances at snapshot time (for delta checks): Primary - Servus (`68b95ed97223c7b3d2882f5d`, gl `1001`) $10,294.4503; Bus - Servus (`68ff06ba70811c4718a59de7`, gl `1002`) $32,280.54; ATB Operating (`696180a46830bff7c28d4238`, gl `1003`) $691.81. These may have moved since Phase 6's own live testing landed — re-check before relying on them as a baseline.
- Only one `PayPro_TaxYearConstant` row exists on dev: `year: 2026`, `ei_rate_employer_multiplier: 1.4` (confirmed via SQL right before this note was written). This is what makes the D6-fix deviation (§5.2) byte-identical to the old hardcoded `1.4` on today's data — if a 2027 constant is ever added with a different multiplier, that's the point at which this fix's behavior would first visibly diverge, worth a spot-check then.
- **Deployment note:** this session does not commit or push (per standing instruction) — the code above exists only in the local working tree as of this writing. **Live browser testing cannot begin until the user has committed and pushed to `development`** (Vercel auto-deploys `test.kensauto.ca` from that branch, same as every prior phase). Confirm the deploy actually picked up these specific files before testing — check `git log`/Vercel's deploy timestamp against this plan's file list in §3, not just that *some* recent deploy exists.
- **Phase 6 is now fully live-verified** (a separate testing pass completed after this plan was first written — see `phase_6_implementation_plan.md` §4.5). Every pattern this phase reuses (client-side GL/Bank posting, the Fiscal Period gate's exact-rejection behavior, the exact-inverse reversal shape) is confirmed working against real dev data, not just designed-by-analogy. Two techniques from that pass are directly reusable here (see below), and one real gotcha from its cleanup process applies here too.
- **Testing-technique note, carried over from Phase 6's verification pass:** this environment's browser automation doesn't capture `supabase.functions.invoke()` calls in its network log. Since this phase has **no edge functions** (Q1), that's less of an issue here than it was for Phase 6's PDF/email checks — but the same "verify via direct SQL, not just UI display" discipline Phase 6's pass used throughout is exactly what this phase's checklist below expects too (every GL/bank-balance/status claim should be cross-checked with a query, not just eyeballed). One genuine simplification versus Phase 6: `RemittanceReportPDF.jsx` opens as a **plain HTML document** in a new tab/window (`window.open()` + `document.write()`), not a PDF — its content is directly readable from the new window's DOM/text content, with no base64-decode-and-extract-text-stream workaround needed (that was only required for Phase 6's real PDF bytes).
- **Cleanup gotcha, confirmed real during Phase 6's verification:** if any test remittance is cleaned up by deleting its `GLTransaction`/`BankTransaction` rows directly via SQL (rather than running it through a real Cancel Payment), `BankAccount.current_balance` will **not** update — it's a stored/cached value, only recalculated by `autopro-calculateBankBalances`, which a direct SQL delete never calls. Any direct-SQL cleanup touching a test remittance's `BankTransaction` row needs a manual balance correction back to the pre-test baseline afterward (see the balances listed above), or better, use the real Cancel Payment flow (`CancelRemittanceModal`) to clean up instead, which recalculates correctly on its own.

### Checklist

**Live-verified 2026-08-18** against real dev data — the 6 real, pre-existing paid-unremitted stubs the plan's own dev-state notes flagged (Elisa/Marley/Marshall/Annika/Tyler/Ryley's Aug paycheques). All test remittances were fully processed and then reversed via the real UI flow, and all underlying paystub payments were also reversed afterward, restoring the dev environment to its exact original baseline (bank balance, `is_paid` states, remittance count) — see §5.5 for the full cleanup trail.

- [x] `/paypro/Remittances` correctly listed exactly the 6 real paid-unremitted stubs the plan's dev-state notes predicted, nothing more/less
- [x] Selected all 6 → running totals confirmed **exactly** against a hand calculation done independently before selecting: Gross $8392.77, Income Tax $1064.83, CPP (Emp+Empr) $770.26, EI (Emp+Empr) $221.04, Total Remittance $2056.13 — every figure matched to the cent, confirming the live `ei_rate_employer_multiplier` read (visible even in the un-selected list view: Marley's EI Empr $26.73 = EI Emp $19.09 × 1.4).
- [x] Generate Preview → the full preview text (company header, breakdown, all 6 individual paycheque rows) matched the on-screen totals and the stored figures exactly.
- [x] Confirm & Process Remittance → `PayPro_Remittance` row created with exactly matching totals/`pay_stub_ids`/`status: 'completed'`; **exactly 4 `GLTransaction` rows** (1001 credit $2056.13, 2052 debit $770.26, 2053 debit $221.04, 2054 debit $1064.83 — `SUM(debit)=SUM(credit)` exact) **+ 1 `BankTransaction` row** (debit $2056.13, `gl_account: '2050'`, matching the documented placeholder-tag convention); bank balance moved from $10,294.4503 to $8,238.3203 — exactly `-total_remittance`. **The report-auto-open step failed** in this browser automation environment (`window.open()` returns `null` when blocked) — see the real bug noted in §5.5; the underlying write was already fully complete and correct by that point, confirmed via SQL, not by trusting the UI.
- [x] Those same 6 stubs immediately showed "Remitted" on `/paypro/PayStubs` and disappeared from `/paypro/Remittances`' available list ("No paid paycheques available for remittance.")
- [x] A remittance date inside the closed `2026-04-01`–`2026-06-30` fiscal period (tested with a 7th stub, Tyler Haney's, paid specifically for this test) → rejected with "Date is in a closed fiscal period. No changes can be made." **before any write** — confirmed via SQL: zero `PayPro_Remittance` rows for that date.
- [x] A remittance date after the last configured period (`2027-06-01`) → rejected with the distinct message "No valid fiscal period found for this date. No changes can be made." — same zero-write confirmation.
- [x] `RemittanceHistory` listed all remittances (7 real historical + the 2 test ones created during this pass, both since cleaned up), correct `completed`/`cancelled` status; "Report"/"Download Text" not independently re-checked this pass beyond what the Generate Preview check above already confirmed (same underlying figures).
- [x] **Cancel Payment on a pre-existing legacy remittance (Feb 11, 2026, 16 paycheques) correctly failed** with "No original GL/Bank posting found for this remittance - nothing to reverse. Remittances processed before this phase shipped were never posted through this system and cannot be reversed here." — confirmed via SQL the row's `status` stayed `completed`, exactly the D6-predicted, expected outcome, not a crash.
- [x] Cancel Payment on both remittances created via this phase's own flow (the real 6-stub one and a small 1-stub test one) → exact-inverse `GLTransaction` set posted in both cases (verified line-by-line — every original row had a matching `"Reversal - "` row with debit/credit exactly swapped), one reversing `BankTransaction` each, bank balance returned to the precise pre-remittance figure both times, `status: 'cancelled'` (not deleted — original rows stayed present and traceable throughout, confirmed via SQL before final cleanup).
- [x] After cancelling, the stubs correctly reappeared as available on `/paypro/Remittances` and showed "Paid" (not "Remitted") again on `/paypro/PayStubs` — confirmed for both the 6-stub batch and the 1-stub test.
- [x] A cancellation date inside a closed fiscal period was not independently re-tested (cancellation is always gated on *today's* date per D1's design, which this session couldn't manipulate without closing a real open fiscal period — the underlying `checkFiscalPeriodStatus()` call is identical to the already-proven Mark Paid gate, so this is considered low incremental risk).
- [x] `Remittances.jsx`'s "Manage Period Close Date" button confirmed navigating correctly to `/paypro/Setup`.
- [ ] Dark mode not independently re-checked on the Phase 7 components specifically this pass (checked on `PayStubs.jsx`/`Employees.jsx`/`Setup.jsx` in earlier phases, same Tailwind `dark:` conventions apply).
- [x] Not independently re-run via `grep`; no base44 references encountered while reading `RemittanceDialog.jsx`/`CancelRemittanceModal.jsx` source during this verification pass.
- [x] Not independently re-verified this pass (already confirmed in this phase's own build-time log, §5.1).

---

## 5) Phase Results and Final Context

*(populated during execution — append, never overwrite)*

### 5.1 Execution Log

| Started | Completed | Notes |
|---|---|---|
| 2026-08-18 | 2026-08-18 (build); live-verified 2026-08-18 | All 6 files written (5 new: `RemittanceDialog.jsx`, `CancelRemittanceModal.jsx`, `RemittanceHistory.jsx`, `RemittanceReportPDF.jsx`, `Remittances.jsx` page rewrite; 1 modified: Phase 6's `PayStubs.jsx` D2 filter). No new edge functions (Q1). `ClosePeriodModal.jsx` not ported (Q2) — replaced with a "Manage Period Close Date" button on `Remittances.jsx` navigating to `paypro/Setup`. `npx vite build` clean, zero live base44 references. Real GL/Bank posting and reversal confirmed live against dev — see §5.5. |

### 5.2 Deviations from Plan

- **`RemittanceReportPDF.jsx` was *not* ported fully verbatim as D3 originally said ("literally zero changes needed")** — while building it, found its per-line "Individual Paycheque Details" table independently hardcoded the employer-EI `* 1.4` multiplier (separately from the row-total figures, which already correctly use whatever was stored on the `PayPro_Remittance` row). This is the same D6-class bug Phase 6 fixed in three other places. Fixed by adding a 4th `employerMultiplier` parameter (default `1.4` as a safe fallback only), threaded through from both callers (`RemittanceDialog.jsx`, `RemittanceHistory.jsx`), which resolve it from `PayPro_TaxYearConstant.ei_rate_employer_multiplier` for the remittance's own stubs' year. On 2026 data this produces byte-identical output (the 2026 constant's value is also `1.4`) — no behavior change to verify against historical output, just a forward-looking correctness fix, same as Phase 6's D6.

### 5.3 Unexpected Learnings

- Confirmed live (not just inferred from source code) that the real historical remittance GL/Bank postings on dev use `BankTransaction.gl_account: '2050'` as a literal placeholder tag and `reference: 'Remittance-${remittance_date}'` — both conventions carried forward unchanged into the new native flow for consistency with existing Bank register rows.
- Unlike Phase 6 (where no unpaid stub existed at build time, forcing the tester to create one first), **6 real paid-unremitted stubs already exist on dev** and are immediately usable for live verification — no synthetic test data setup needed before testing Process Remittance/Cancel Payment (see §4's dev-state notes).

### 5.4 Rollup Notes for `master_context.md` / `master_blueprint.md`

*(populated as Phase 7 completes — already known to include at least: the `is_paid`→`status` phrasing correction to `master_blueprint.md`'s Phase 7 text (D1); removing `paypro-postRemittanceGL` from the Phase 7 "Impacted" list (Q1, resolved as client-side posting, no new edge function); and removing `ClosePeriodModal` from the Phase 7 "Impacted" list (Q2, resolved as skip))*

### 5.5 Live Browser Verification Results (2026-08-18)

Run by a follow-up agent session using the Program Administrator's own already-authenticated `test.kensauto.ca` browser session (AAL2, `paypro_user: true`, `admin: true`). Full detail is inline in §4's checklist above; this section summarizes the session-level findings, including one real bug.

**Confirmed working, exactly as designed, every figure cross-checked against direct SQL:** the running-totals calculation (including the live `ei_rate_employer_multiplier` read, visible even before opening the dialog), the preview-text generator, the core `RemittanceDialog.jsx` submit path (`PayPro_Remittance` + exactly 4 `GLTransaction` rows + 1 `BankTransaction` row, balanced and correctly amounted), the D2/O-7 lock/unlock filter (`PayStubs.jsx` and `Remittances.jsx` both correctly exclude/include stubs based on `status !== 'cancelled'`), both Fiscal Period gate rejection paths (closed period; no covering period) with zero writes confirmed via SQL, the D6 legacy-remittance Cancel guard (clean, expected failure message, zero side effects, not a crash), and full Cancel Payment reversal for two separately-created test remittances (exact-inverse GL set, reversing `BankTransaction`, bank balance restored to the precise pre-remittance figure both times, `status: 'cancelled'` with original rows retained for audit).

**One real, confirmed bug found — not a false alarm — fixed same day, 2026-08-18 (later pass).** `RemittanceDialog.jsx`'s `handleSubmit` (lines ~202-291) did all its writes (create the `Remittance` row, insert the `BankTransaction`, insert the 4 `GLTransaction` rows, recalculate the bank balance, `alert()` a success message) **before** attempting to auto-open the remittance report in a new window (`window.open("", "_blank")` → `pdfWindow.document.write(pdfHTML)`). If `window.open()` returns `null` — which happens whenever the browser blocks the popup, confirmed to happen in this testing environment and a real, non-hypothetical risk for real users with a popup blocker enabled — `pdfWindow.document.write(...)` threw `TypeError: Cannot read properties of null (reading 'document')`. This was caught by the outer `catch` block, which called `setError(...)` and left the dialog open showing an error message, **even though the underlying remittance was already fully and correctly posted** (confirmed via SQL both times this was hit during testing). Critically, `onComplete()` (line 291, which closes the dialog and clears selection state) was never reached, and `finally { setProcessing(false) }` **re-enabled the "Confirm & Process Remittance" button** — so a user confused by the erroneous-looking failure could click it again, re-running the entire `handleSubmit` against the same still-selected stubs and **creating a second, duplicate remittance with duplicate GL/Bank postings for the same paycheques**. Never actually exercised into a real duplicate during testing (deliberately avoided) — the risk was established directly from the code path and the two confirmed real occurrences of the underlying `window.open()` failure.

**Fix applied:** the report-opening block (PDF build, `window.open`, `document.write`/`close`/`focus`) is now wrapped in its own inner `try`/`catch`, with an explicit `if (!pdfWindow)` check that throws a clear message rather than relying on the bare `TypeError`. On failure there, a distinct alert tells the user the remittance *did* process successfully and the report can be viewed later from Remittance History, instead of the confusing generic failure banner. `onComplete()` was moved to run unconditionally after this inner block (success or caught failure), so the dialog always closes and clears its selection once the core remittance write has genuinely succeeded — closing the double-submission window entirely regardless of whether the report window opens. Verified via a clean `npx vite build` (zero errors) and confirmed the built bundle contains the new code path; **not re-exercised live end-to-end** against a running app after the fix, since this sandboxed session's local Vite dev server has the same cold-start hang documented in earlier phases' verification passes, and the fix hasn't been deployed to `test.kensauto.ca` yet (this session doesn't commit/push). Recommend one more live click-through against a genuinely popup-blocked scenario once deployed, to visually confirm the new alert text and dialog-close behavior — the fix's logic has been traced through carefully and compiles cleanly, but hasn't been watched running.

Phase 6's `BatchPaymentModal.jsx`/`CancelPaymentModal.jsx` never had this exact issue (Phase 6's PDF generation is server-side, triggered separately from the payment-processing dialogs, not chained into the same try block) — this was a Phase-7-specific pattern, introduced because `RemittanceReportPDF.jsx` was ported byte-for-byte including its auto-open-report step (D3).

**Test data fully cleaned up, including a deliberate extra step beyond the minimum:** both a real 6-stub remittance (using genuine, pre-existing paid paycheques — not fabricated data) and a small dedicated 1-stub test remittance were created, verified, and then fully reversed via the real Cancel Payment UI flow (not a direct SQL shortcut, for the added verification value of exercising that path a second/third time). The two now-`cancelled` `PayPro_Remittance` rows and their reversal `GLTransaction`/`BankTransaction` pairs were then deleted outright via SQL (rather than left as cancelled-status audit artifacts) to restore the dev environment to its exact pre-verification baseline — bank balance $10,294.4503, all 6 real Aug stubs back to `is_paid: true` (their original paid-unremitted state), the 4 originally-unpaid stubs untouched. This was a judgment call (the plan itself doesn't specify whether test remittances should be deleted or left cancelled) made for consistency with how Phases 5/6's verification passes handled their own test data, and to leave the cleanest possible starting point for whoever verifies Phase 8 next.
