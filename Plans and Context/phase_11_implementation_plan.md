# Phase 11 Implementation Plan: Payroll

**Status:** **Planning — Section 0 decisions confirmed 2026-08-03, ready for execution approval.**
**Parent:** `master_blueprint.md`, Phase 11
**Prepared:** 2026-08-03 (drafted as a lookahead while Phase 10C is being validated live and Phase 10D is queued up next — no code changes made, research/planning only)
**Supabase project refs:** dev branch `sitihbdnuxifwibontcm` (schema/RPC changes tested here first, always); production `hbcrwkmgsazqrvsrmxyr` (applied second, after dev verification)

> **LIVE DOCUMENT.** This plan is updated in place as execution/verification surfaces new findings — do not wipe prior sections, append/annotate instead. Key learnings roll back into `master_blueprint.md` Section 7 at phase close.

---

## 0) Open Questions, Info Requirements & Suggestions

### 0.1 — RESOLVED: delete the 3 confirmed-dead payroll components

**Decision: (a) — delete outright.** Matches the `KanbanBoard.jsx` precedent from Phase 4/13.

Direct research (grepping every file in `src` for each component's own name, not just its own file) found **three files in `src/components/payroll/` with zero live importers anywhere in the app** — the exact "orphaned component" pattern the blueprint's Phase 4/13 precedent (Kanban board) says to delete outright rather than migrate:

| File | Evidence it's dead |
|---|---|
| `PreviousPaychequesModal.jsx` | Not imported by `Payroll.jsx` or anywhere else. Reads `Paycheque.filter(...)` from `@/entities/Paycheque` — a **different, separate base44-routed entity from `PayrollTransaction`**, resolved only via the `@base44/vite-plugin`'s `legacySDKImports` shim (same mechanism as `@/entities/all`). There is no `base44/entities/Paycheque.jsonc` definition anywhere in the repo (compare: `PayrollTransaction.jsonc` does exist) — strong evidence this entity was never actually finished/wired server-side, not just unmigrated. Reads `.gross_pay`/`.net_pay` directly off the row (no defensive parsing), inconsistent with `PayrollTransaction`'s own stored-as-text `amount`/computed-net-pay convention used everywhere else in this domain. |
| `PayrollEmployeeForm.jsx` | Not imported anywhere. Form fields (`pay_type`, `pto_enrolled`) don't match the real native `Employee` columns confirmed via direct schema query (`pay_rate`, `pto_eligible` — no `pay_type` or `pto_enrolled` column exists at all). `Employee.pay_rate` editing is already live today through a completely different, already-native file: `src/components/setup/TechDirectory.jsx` (`supabase.from('Employee').update({ pay_rate: rate })`, confirmed working, outside Phase 11's scope). |
| `EmployeeDetailsForm.jsx` | Not imported anywhere. Fields (`sin_number`) don't match any real `Employee` column (confirmed via schema query — no `sin_number` column exists). |

**No base44 traffic originates from any of these three files reaching real functionality** — they're stale prototypes, not a live-but-unmigrated feature.

### 0.2 — RESOLVED: port `parsePayrollFile` byte-for-byte

`base44/functions/parsePayrollFile/entry.ts` (full source read, 281 lines) is a pure text-parser — no entity reads/writes, no GL logic, just regex extraction from a specific `.txt` export format (from what `AddPaychequeModal.jsx`'s UI copy calls "PayPRO") into a JSON shape the frontend then uses to prefill the Add Paycheque / Add Remittance forms. Its only base44 dependency is the `base44.auth.me()` gate (drop per the standing Phase 10 convention — resolve identity from the caller's own Supabase JWT only if needed, and this function doesn't even write audit fields, so it may not need identity resolution at all).

**Decision: port byte-for-byte, no logic changes** — matches the project's standing "preserve exact legacy behavior" convention used in every prior phase's function ports. No evidence of format drift found in code.

### 0.3 — RESOLVED: seed throwaway test data directly via SQL on dev

Confirmed via direct query: `PayrollTransaction` exists with **identical schema** on both dev and production (30 columns, RLS enabled with exactly **1 policy already in place on both** — unlike most prior phases, this table needs **no RLS fix**), but dev has 0 rows and production's 111 rows (104 Paycheque / 6 Remittance / 1 Adjustment) are all already marked paid. This means the live "Mark Paid" flow (the highest-risk piece — it's the one that posts `BankTransaction` + `GLTransaction` rows) has **no existing unpaid row to test against** on either branch.

**Decision: seed 2-3 throwaway unpaid `PayrollTransaction` rows directly on the dev branch via SQL** (one of each type: Paycheque/Remittance/Adjustment), matching the Phase 9/13 precedent of inserting throwaway test data on dev, rather than relying on the migrated Add-* forms to produce them first. This decouples Mark Paid verification from the create-flow verification — each gets tested on its own, and a create-flow bug won't block Mark Paid verification or vice versa. The Add Paycheque/Remittance/Adjustment forms still get their own independent live verification pass (§4 steps 2, 4, 5) — SQL-seeding is only for the Mark Paid test data, not a replacement for testing the create flows themselves.

### 0.4 — Confirmed, no decision needed: this phase does **not** touch Employee-record payroll-field editing

`Employee.pay_rate`/`pto_eligible`/`paypro_user`/`accts_pay_access` are already-native columns, already editable live today via `src/components/setup/TechDirectory.jsx` (direct `supabase.from('Employee')`, outside this domain and already fully native) and read (not written) in `Layout.jsx` (access-gating) and `WorkOrderProfitability.jsx`. Nothing in `Payroll.jsx` or its live child components reads or writes these fields. Stated for the record so a future session doesn't assume Phase 11 needs to touch `TechDirectory.jsx` or `Layout.jsx` — it doesn't; those are out of scope and already done.

### 0.5 — RESOLVED: conflict/coordination check against Phase 10D (Cash Flow & Bank Transfer) — no file overlap found, safe to run side-by-side

You asked whether this phase can execute concurrently with Phase 10D. Checked 10D's actual file scope directly against `phase_10_implementation_plan.md` §10D (not just its one-line description, per the standing "verify per-phase file scope directly" rule established at Phase 13's own §0.1):

| Phase | Its file scope (confirmed from its own plan doc) | Overlaps Phase 11's file scope? |
|---|---|---|
| **Phase 10D** | `src/pages/CashFlow.jsx`, `src/pages/Bank.jsx` (only the `handleTransfer` call site, line ~703), `src/pages/Admin.jsx` (one `LOCAL_ENTITIES`→`SUPABASE_TABLES` move), new `supabase/functions/autopro-transferFunds/` | **No.** Zero files in `src/pages/Payroll.jsx` or `src/components/payroll/**` appear anywhere in 10D's scoped file table. |

**Conclusion: file-disjoint, safe to run side-by-side.** Two non-blocking notes, neither requiring sequencing:

1. **Shared tables, not shared files.** Both phases write to `BankAccount`/`BankTransaction`/`GLTransaction` and both call the existing, already-deployed `autopro-calculateBankBalances` (10D's `transferFunds` port also repoints to it, same as this phase's §3.2 item 4). This is normal for this project — Phase 8/9/10/13 all wrote to these same tables from separate files with zero conflicts, since git conflicts are file-level, not entity-level. Matches `master_blueprint.md`'s own Tier D coordination note, which already anticipated splitting Phase 10/11 by file ownership if parallelizing.
2. **Live-testing caution only:** if both phases' throwaway-transfer/throwaway-payroll tests are run against the same dev `BankAccount` row at the literal same moment, two concurrent balance-recalc calls could interleave confusingly. Use different `BankAccount` rows for each phase's test data, or stagger the *testing* moment (not the coding) if this comes up.

No dependency either direction: this phase only depends on Phase 8's already-completed `BankAccount`/`calculateBankBalances` work, not on anything 10D produces; 10D doesn't touch `PayrollTransaction` or anything Payroll-related.

---

## 1) Phase Scope & Objectives

**Objective:** Complete the Payroll module migration — the smallest and most contained of the remaining financial-domain phases. Unlike Phase 9/10/13, `PayrollTransaction` requires **no schema design and no RLS fix** (already native with correct RLS on both branches) — this phase is close to pure transport-layer cutover plus one legacy function port.

**In scope:**
1. **`PayrollTransaction` full transport-layer cutover** — every `base44.functions.invoke('SupabaseProxy', ...)` call across `Payroll.jsx`, `MarkPaidModal.jsx`, `AddPaychequeModal.jsx`, `AddRemittanceModal.jsx`, `AddAdjustmentModal.jsx` converts to direct `supabase.from('PayrollTransaction')` calls.
2. **`parsePayrollFile` → native `autopro-parsePayrollFile`** — 1:1 port of the legacy `.txt`-parsing Edge Function (pure parser, no entity access), called from `AddPaychequeModal.jsx` and `AddRemittanceModal.jsx`.
3. **`MarkPaidModal.jsx`'s carried-forward `BankAccount` call site** — the Phase 8 carry-forward explicitly named in `master_blueprint.md` §7 ("Payroll → Phase 11"). `BankAccount`/`BankTransaction`/`GLTransaction` are already-native tables (Phase 5/8) — this is a direct-call swap, not new schema work.
4. **`calculateBankBalances` repoint** — `MarkPaidModal.jsx:497` calls the legacy function name directly; Phase 8A already built and deployed `autopro-calculateBankBalances` to both dev and production. This is a rename, not new work.
5. **Dead-code cleanup** *(pending your 0.1 answer)* — delete `PreviousPaychequesModal.jsx`, `PayrollEmployeeForm.jsx`, `EmployeeDetailsForm.jsx` if you choose option (a).
6. **Dead-import cleanup** — `MarkPaidModal.jsx:4` imports `GLTransaction` from `@/entities/all` but never uses it directly (all `GLTransaction` writes go through the `SupabaseProxy` shim, not the imported entity object) — orphaned import, drop it as part of this file's edit.

**Explicitly NOT in scope:**
- Any modification to `autopro-handleInvoiceConversionGL`/`autopro-handleSupplierInvoiceLineGL` — standing project rule. (Confirmed via grep: `parsePayrollFile`/`MarkPaidModal.jsx`'s own GL-posting logic doesn't call either function — it builds `GLTransaction` rows directly via client-side JS, matching Phase 9's `generateChequePDF`/LOC-payment precedent of client-orchestrated GL posting outside the two protected functions.)
- `Employee.pay_rate`/`pto_eligible`/etc. editing — already native, already done, lives in `TechDirectory.jsx` (see §0.4).
- `PayrollGLAccountCombobox.jsx` — confirmed zero base44 dependency (pure presentational component taking `chartOfAccounts` as a prop); no changes needed, just confirm it still renders correctly once its two callers (`AddAdjustmentModal.jsx`, `JournalEntries.jsx`) are touched.
- `TechnicianPerformanceReportModal.jsx`'s "Monthly Payroll Target vs Labour Sales" progress bar — reads `CashFlowSummary`, not `PayrollTransaction`; that's Phase 10's unblock, already noted in the blueprint, not Phase 11's.
- The 3 disabled "Payroll Reports" cards in `ReportModal.jsx` (`payroll_summary`, `employee_hours`, `payroll_tax`) — confirmed via code read that none of the 3 `reportKey`s appear in the click-dispatch logic or the "enabled" condition list (lines 225-245, 303, 315) — these are inert UI stubs today, not a live feature with a backing function to port. No action needed; flagging so a future session doesn't assume there's a hidden `getPayrollSummaryReport`-style function to find.

**Target outcome:** Zero `base44`/`@/entities/all`/`@/functions/*` references remaining in `src/pages/Payroll.jsx` and every file under `src/components/payroll/` that has live callers. `parsePayrollFile` replaced by `autopro-parsePayrollFile`. `calculateBankBalances` repointed to the already-existing `autopro-calculateBankBalances`. Full payroll lifecycle (add paycheque/remittance/adjustment → list/filter → mark paid → GL entries created → bank balance recalculated → reversal) behaves identically to pre-migration, verified live.

---

## 2) Lessons Learned & Context

Pulled from `master_blueprint.md` §7, filtered to what's load-bearing for this phase:

- **`PayrollTransaction` is a rare case where the blueprint's classification turned out accurate and RLS was already correct** — still verify directly rather than trust the one-liner (this phase did: confirmed schema-identical on both branches, RLS enabled with exactly 1 policy on both, no fix needed). Don't skip the verification step just because this phase got lucky — the standing rule ("always confirm entity status directly against the database, never trust a classification table at face value," reinforced 4+ times across Phases 8/9/12/13) still applies to everything else in this phase's scope.
- **Audit fields don't populate themselves** — `PayrollTransaction.create()` calls that set `created_date`/`created_by`/`created_by_id` today (`Payroll.jsx`'s reversal-adjustment path, `AddAdjustmentModal.jsx`) must keep doing so explicitly on the native `.insert()`. Note `AddPaychequeModal.jsx`/`AddRemittanceModal.jsx`'s creates currently do **not** set `created_by`/`created_by_id` at all (confirmed via code read) — preserve that as-is (don't add new required fields mid-port) unless you want it fixed as a drive-by improvement.
- **A `Promise.all` mixing a still-base44-routed call with already-migrated direct calls fails the whole batch on a dev-native session** (recurred 5+ times across Phases 7/8/9/12/13). `Payroll.jsx`'s `loadTransactions()` is a single call, not a `Promise.all` — low risk here, but `MarkPaidModal.jsx`'s `handleMarkPaid()` does a `for...of` loop of sequential `await`s (not `Promise.all`), so this specific failure pattern doesn't apply to this phase's main flow. Confirmed by reading both functions in full.
- **A native `jsonb` column comes back from `supabase-js` already parsed** — `PayrollTransaction.additional_deductions` is stored as `text` (confirmed via schema query, not `jsonb`), so the existing `JSON.parse(t.additional_deductions)` / `JSON.stringify(...)` calls throughout `MarkPaidModal.jsx`/`AddPaychequeModal.jsx` are correct as-is and must be preserved, not stripped (this is the inverse of the Phase 9 jsonb lesson — don't over-apply that lesson to a column that's genuinely still text).
- **Client-generated 24-char-hex IDs vs standard UUIDs are not uniform project-wide** — check `PayrollTransaction.id`'s real format on a live row before writing any new `.insert()` that needs to generate its own id client-side (none of this phase's creates currently generate an id client-side — all rely on server-side default — confirm this holds before assuming `.insert()` without an explicit `id` field is safe).
- **All native `autopro-*` Edge Functions return HTTP 200 with `{ error }` on failure** — apply to `autopro-parsePayrollFile`; every legacy function this phase touches currently violates this (raw 400/401/500) and must be normalized during the port.
- **Drop the `base44.auth.me()` gate when porting — resolve identity from the caller's Supabase JWT only when audit fields are actually needed.** `parsePayrollFile` doesn't write audit fields at all (it's a pure parser returning JSON to the frontend) — likely doesn't need any identity resolution, just `verify_jwt: true` on the function itself.
- **`RLS enabled + zero policies = silently blocked access, no clear error`** — recurring standing trap across Phases 1/9/10/13, but confirmed **not present** on `PayrollTransaction` this time (1 policy already exists on both branches) — still worth a final direct re-check immediately before execution in case anything's changed since this planning pass.
- **`@/entities/all`, `base44.entities.X`, AND `@/functions/*` are all functionally identical** — all three route through the base44 SDK/proxy. Confirmed this phase's own discovery: `@/entities/Paycheque` (used only by the dead `PreviousPaychequesModal.jsx`) is the same shim mechanism, resolving to a base44-hosted entity with no local `.jsonc` definition and no Postgres table — reinforces "grep for all three patterns, not just the obvious literal `base44` string."
- **Before fixing or migrating a component, grep for its importers. Orphaned components should be flagged for deletion rather than blindly migrated.** Directly applied in §0.1 above — found 3 orphaned files this way.
- **The cross-domain `BankAccount` carry-forward pattern**: the user's standing preference is for each phase to own only its own domain's files, carrying cross-domain call sites forward as an explicit note to the phase that owns that domain rather than reaching into it early. `MarkPaidModal.jsx`'s `BankAccount`/`calculateBankBalances` calls were explicitly carried forward from Phase 8 to Phase 11 for exactly this reason — this phase is where they get resolved.
- **`test.kensauto.ca` is the dev branch, not production** — safe to insert/delete throwaway test data (per §0.3's plan). A known dev-only seeded row appearing on that URL is the standing sanity check before trusting this (established in Phase 9).
- **`/dev-login` (`test.kensauto.ca/dev-login`) remains the correct live-testing tool** — reconfirmed working as recently as Phase 13 with zero rot.
- **Financial-domain risk is real here too** — every dollar amount on `PayrollTransaction`/`BankTransaction`/`GLTransaction` writes in this phase must be strictly cast (`Number()`/`parseFloat()`), matching the existing code's own convention (already does this throughout — preserve, don't loosen).
- **`Bank.jsx`'s `handleTransfer` → legacy `transferFunds`** — explicitly NOT this phase's item (carried from Phase 8→9→10, is Phase 10's to resolve per the blueprint's Tier D sequencing). Noted here only so it isn't mistakenly picked up as "Banking-adjacent, might as well."

---

## 3) Detailed Execution Plan

### 3.1 — `Payroll.jsx` (page-level, 2 call sites)

**Target file:** `src/pages/Payroll.jsx`

| Line(s) | Current | Change |
|---|---|---|
| 3 | `import { base44 } from '@/api/base44Client';` | Remove once both call sites below are converted and nothing else in the file needs `base44` (confirmed: nothing else does). |
| 59-62 (`loadTransactions`) | `base44.functions.invoke('SupabaseProxy', { action: 'list', table: 'PayrollTransaction' })` → reads `response.data?.data` | `const { data, error } = await supabase.from('PayrollTransaction').select('*'); if (error) { console.error('Error loading payroll transactions:', error); return; }` — replace `response.data?.data` usage with `data`. Add `import { supabase } from '@/lib/supabase';`. |
| 132-148 (`handleDelete`'s reversal-adjustment create) | `base44.functions.invoke('SupabaseProxy', { action: 'create', table: 'PayrollTransaction', data: {...} })` | `const { error } = await supabase.from('PayrollTransaction').insert({...same fields...}); if (error) throw error;` — preserve every field exactly (`transaction_type`, `pay_date`, `amount: String(reversalAmount)` — note `amount` is stored as `text`, keep the `String()` wrap, `adjustment_reason`, `gl_account`, `notes`, `is_paid: false`, `created_date`/`updated_date`/`created_by_id`/`created_by`). |

No audit-field gaps here — this call site already sets `created_by`/`created_by_id`/timestamps explicitly.

### 3.2 — `MarkPaidModal.jsx` (6 call sites + 1 rename + 1 dead import)

**Target file:** `src/components/payroll/MarkPaidModal.jsx`

| Line(s) | Current | Change |
|---|---|---|
| 3-4 | `import { base44 } from '@/api/base44Client'; import { GLTransaction } from '@/entities/all';` | Remove both. Add `import { supabase } from '@/lib/supabase';`. (`GLTransaction` import is dead — confirmed only `SupabaseProxy`-shimmed calls write to that table in this file, the imported object itself is never referenced.) |
| 36-39 (`loadBankAccounts`) | `SupabaseProxy` list `BankAccount` | `supabase.from('BankAccount').select('*')` — this is the Phase 8 carry-forward this phase resolves. Already-native table (Phase 8), no schema work. |
| 157-164 (mark each transaction paid) | `SupabaseProxy` update `PayrollTransaction`, `{ is_paid: true }` | `supabase.from('PayrollTransaction').update({ is_paid: true }).eq('id', transaction.id)` |
| 175-192 (Paycheque `BankTransaction` create) | `SupabaseProxy` create `BankTransaction` | `supabase.from('BankTransaction').insert({...same fields...})` — already-native table (Phase 8). |
| 195-212 (Remittance `BankTransaction` create) | same shape | same conversion pattern |
| 220-237 (Adjustment `BankTransaction` create) | same shape | same conversion pattern |
| 489-493 (bulk `GLTransaction` create) | `SupabaseProxy` create `GLTransaction`, array payload | `supabase.from('GLTransaction').insert(glTransactionsToInsert)` — already-native table (Phase 5). Confirmed this bulk-insert array shape is compatible with `supabase-js`'s `.insert()` (accepts an array directly, same as Phase 9's `processLineOfCreditTransaction` precedent). |
| 497 | `base44.functions.invoke('calculateBankBalances', { bankAccountId: selectedAccount.id })` | `supabase.functions.invoke('autopro-calculateBankBalances', { body: { bankAccountId: selectedAccount.id } })` — **rename only**, function already exists and is deployed on both dev and production (Phase 8A). Check `error` per the `{error}`-on-200 convention. |

**Important — preserve the client-side GL-balance validation exactly as-is** (lines 101-151, the debit/credit sum check before any writes happen): this logic doesn't touch base44 at all, it's pure JS math run before the write loop — leave untouched, just make sure it still runs before the now-native write calls below it.

**Do not restructure the sequential `for...of` await loop into `Promise.all`** — the sequential nature is intentional (each transaction's `BankTransaction` create depends on nothing from prior iterations, but preserving the exact current control flow avoids introducing a new failure mode this phase doesn't need to touch).

### 3.3 — `AddPaychequeModal.jsx` (1 function call + 1 CRUD call)

**Target file:** `src/components/payroll/AddPaychequeModal.jsx`

| Line(s) | Current | Change |
|---|---|---|
| 2 | `import { base44 } from '@/api/base44Client';` | Remove once both call sites below convert. |
| 57-60 (`handleFileUpload`) | `base44.functions.invoke('parsePayrollFile', { fileContent, fileName: file.name })` | `supabase.functions.invoke('autopro-parsePayrollFile', { body: { fileContent, fileName: file.name } })` — reads `response.data?.success`/`response.data?.data`/`response.data?.error`, same shape after the native function is built to return `{ success: true, data: {...} }` on success and `{ error: "..." }` on failure (both HTTP 200 per convention). |
| 125-148 (`handleFinalSubmit`) | `SupabaseProxy` create `PayrollTransaction` | `supabase.from('PayrollTransaction').insert({...same fields...})`. **No audit fields set here today (`created_by`/`created_by_id` absent)** — confirmed via code read; preserve as-is per §2's lesson, don't add new required behavior mid-port unless you want that fixed as a drive-by (flag to you if noticed during execution, don't silently change scope). |

### 3.4 — `AddRemittanceModal.jsx` (1 function call + 1 CRUD call)

**Target file:** `src/components/payroll/AddRemittanceModal.jsx`

Same pattern as 3.3: line 2's `base44` import removed, line 70's `parsePayrollFile` invoke → `autopro-parsePayrollFile`, line 126's `SupabaseProxy` create → direct `.insert()`. No audit fields set here either today — same "preserve as-is" note applies.

### 3.5 — `AddAdjustmentModal.jsx` (1 CRUD call)

**Target file:** `src/components/payroll/AddAdjustmentModal.jsx`

Already partially migrated — `loadChartOfAccounts()` (lines 47-59) already uses direct `supabase.from('ChartOfAccount')` (confirmed native since Phase 9). Only the create at lines 76-92 still routes through `SupabaseProxy` → convert to `supabase.from('PayrollTransaction').insert({...})`. This call **does** set `created_by`/`created_by_id`/timestamps — preserve exactly. Remove the `base44` import (line 3) once converted, since `supabase` is already imported (line 5).

### 3.6 — New native function: `autopro-parsePayrollFile`

**New file:** `supabase/functions/autopro-parsePayrollFile/index.ts`

1:1 port of `base44/functions/parsePayrollFile/entry.ts`'s regex-extraction logic (see §0.2 for the byte-for-byte-vs-review decision). Structural changes only:
- Drop `createClientFromRequest(req)`/`base44.auth.me()` entirely — this function never reads/writes any entity or audit field, so per the Phase 10 lesson it likely needs no identity resolution at all, just `verify_jwt: true` at the function-config level so only authenticated callers can invoke it.
- Every existing `return Response.json({ error: ... }, { status: 400/500 })` → `return Response.json({ error: ... }, { status: 200 })`, per the project-wide `200`-always convention.
- Preserve every regex pattern, every `console.log` (harmless, low-value but zero-risk to keep), and the exact `parsedData` shape returned on success — the frontend's field-by-field destructuring in `AddPaychequeModal.jsx`/`AddRemittanceModal.jsx` depends on the exact key names.

### 3.7 — Dead-code deletion

```bash
git rm src/components/payroll/PreviousPaychequesModal.jsx src/components/payroll/PayrollEmployeeForm.jsx src/components/payroll/EmployeeDetailsForm.jsx
```
Repo-wide grep already confirmed zero importers for all three (done during this planning pass — see §0.1's table). Re-confirm immediately before deleting in case anything changed between planning and execution.

---

## 4) Verification Plan

### Step-by-step live verification (via `/dev-login` on `test.kensauto.ca`)

1. **Load `/Payroll`** — confirm the transaction list renders (initially empty on dev per §0.3's finding), no console errors, date-range/type filters work against an empty list without throwing.
2. **Seed test data via SQL** — insert 3 throwaway unpaid `PayrollTransaction` rows directly on dev (one Paycheque, one Remittance, one Adjustment), matching real column shapes confirmed in §3's schema read. Reload `/Payroll`, confirm all 3 appear correctly (badges, computed net pay, amounts).
3. **Add Paycheque (manual entry, no file upload)** — independently, fill in a throwaway paycheque (gross pay, deductions) through the UI itself, submit through the "Verify Net Pay" confirmation dialog, confirm it appears in the list as Unpaid with correct calculated net pay. This exercises the create-flow call site independently of step 2's SQL-seeded rows.
4. **Add Paycheque (file upload path)** — upload a real or synthetic `.txt` file matching the legacy parser's expected format, confirm `autopro-parsePayrollFile` returns parsed fields and the form prefills correctly; confirm rejecting a remittance-shaped file with the expected "wrong file type" error still works.
5. **Add Remittance** — manual entry, confirm auto-calculated total updates as deduction fields change (pure client-side logic, unaffected by migration, but confirm the final `.insert()` lands correctly).
6. **Add Adjustment** — confirm `PayrollGLAccountCombobox` still populates from the native `ChartOfAccount` read (already-native, unaffected by this phase, but exercised as part of this flow), submit a throwaway negative-amount adjustment.
7. **Select transactions → Mark Paid** — select the 3 SQL-seeded unpaid rows from step 2 (independent of steps 3/5/6's own UI-created rows, which can be marked paid too or left unpaid for further testing), open `MarkPaidModal`, confirm the bank-account dropdown populates from native `BankAccount`, confirm the client-side debit/credit balance check passes, submit.
8. **Verify GL correctness** — query `GLTransaction` directly (or view via `GeneralLedger.jsx`/`GLJournal.jsx` if Phase 10B's reports are live) for the transactions' postings; confirm debits = credits to the penny, matching the account-number mapping in §3.2's table (5008/5009 wages, 2054 income tax, 2052 CPP, 2053 EI, 5006/5007 employer CPP/EI expense).
9. **Verify `BankTransaction` rows created** and `BankAccount.current_balance`/`last_recalculated_date` updated correctly by the repointed `autopro-calculateBankBalances` call.
10. **Reversal path** — from the original (now-paid) list, confirm paid transactions show the disabled/no-delete state correctly (`handleDelete` is gated to unpaid only in the UI — verify this still holds); use one remaining unpaid row and test `handleDelete`'s reversal-adjustment creation.
11. **Print view** — confirm `window.print()` / the print-only summary stylesheet still renders correctly (pure client-side, unaffected by migration, but part of a full page smoke test).
12. **Cleanup** — delete all throwaway `PayrollTransaction`/`BankTransaction`/`GLTransaction` rows created during testing (both SQL-seeded and UI-created) via direct SQL (paid rows can't be deleted through the UI by design), confirm `BankAccount.current_balance` restored to its pre-test baseline via one more `autopro-calculateBankBalances` call.
13. **Confirm `npm run build` and `npx eslint` stay clean** after removing the 3 dead files and their now-orphaned imports elsewhere (none expected — confirmed zero importers — but run the check per the standing Phase 13A lesson about cascading dead imports).

### Verification Checklist

- [ ] `PayrollTransaction` RLS re-confirmed (1 policy, both branches) immediately before execution
- [ ] `Payroll.jsx`: `loadTransactions()` converted, list renders, base44 import removed
- [ ] `Payroll.jsx`: reversal-adjustment create converted, audit fields preserved
- [ ] `MarkPaidModal.jsx`: `BankAccount` read converted (Phase 8 carry-forward resolved)
- [ ] `MarkPaidModal.jsx`: `PayrollTransaction` update (mark paid) converted
- [ ] `MarkPaidModal.jsx`: all 3 `BankTransaction` create branches (Paycheque/Remittance/Adjustment) converted
- [ ] `MarkPaidModal.jsx`: bulk `GLTransaction` insert converted, array-insert shape confirmed working
- [ ] `MarkPaidModal.jsx`: `calculateBankBalances` repointed to `autopro-calculateBankBalances`
- [ ] `MarkPaidModal.jsx`: dead `GLTransaction`/`base44` imports removed
- [ ] `autopro-parsePayrollFile` deployed to dev, curl-verified (success + failure-shaped `.txt` inputs), then production
- [ ] `AddPaychequeModal.jsx`: both call sites converted (file-upload parse + manual create)
- [ ] `AddRemittanceModal.jsx`: both call sites converted (file-upload parse + manual create)
- [ ] `AddAdjustmentModal.jsx`: create call converted, audit fields preserved
- [ ] Full live lifecycle (steps 1-12 above) executed against `test.kensauto.ca`, GL balances to the penny
- [ ] Throwaway test data cleaned up, `BankAccount.current_balance` restored
- [ ] 3 dead files deleted, `npm run build`/`npx eslint` clean
- [ ] Repo-wide grep for `base44`/`@/entities/all`/`@/functions/` inside `src/pages/Payroll.jsx` and `src/components/payroll/**` (excluding any deliberately-untouched files, none expected) returns zero hits
- [ ] Production deploy of `autopro-parsePayrollFile` + all frontend changes, after dev sign-off

---

## 5) Phase Results and Final Context

*(Empty — to be filled in as execution/verification proceeds. Do not remove this section header.)*
