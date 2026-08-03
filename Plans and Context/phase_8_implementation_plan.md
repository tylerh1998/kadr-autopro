# Phase 8 Implementation Plan: Banking & Cash Drawer

**Status:** APPROVED, READY FOR EXECUTION — Section 0 resolved, restructured into 3 sub-phases (8A/8B/8C); all 9 legacy function sources read in full, execution detail complete for all three sub-phases
**Parent:** `master_blueprint.md`, Phase 8 (Banking & Cash Drawer)
**Prepared:** 2026-08-03 · Section 0 resolved 2026-08-03 · Full legacy-function research complete 2026-08-03
**Baseline commit:** working tree as of Phase 12 close-out (development branch; Phase 7/Inventory in progress on a separate track)
**Supabase project refs:** dev branch `sitihbdnuxifwibontcm` (schema changes tested here first, always); production `hbcrwkmgsazqrvsrmxyr` (applied second, after dev verification)

> **LIVE DOCUMENT.** This plan is updated in place as execution/verification surfaces new findings — do not wipe prior sections, append/annotate instead. Key learnings roll back into `master_blueprint.md` Section 7 at phase close.

---

## 0) Open Questions, Info Requirements & Suggestions

**0.1–0.4 below are RESOLVED (2026-08-03) — decisions recorded inline, execution proceeds per Sections 1, 2, and 3&4.**

**Decisions summary:**
- **0.1** — Acknowledged. You created `CashDrawerAdjustment` and `DepositSlipBreakdown` natively on the **dev branch** (`sitihbdnuxifwibontcm`) directly from the base44 entity definitions. Confirmed via `information_schema.columns` — schema captured in 3&4/8A below. **Not yet on production** — 8A's execution includes applying the same DDL there, as a tracked migration file (neither table currently has one).
- **0.2** — **None of the 6 cross-domain `BankAccount`-writing files are in Phase 8's scope.** Redistributed to their owning phases: `SupplierPaymentModal.jsx`, `LineOfCreditPaymentModal.jsx`, `ReceiveCreditModal.jsx` (bundled with the LOC portion since it handles both LOC and Cash Drawer refund paths), and `IssuedChequesTable.jsx` → **Phase 9**. `taxes/MarkPaidModal.jsx` → **Phase 10**. `payroll/MarkPaidModal.jsx` → **Phase 11**. Notes added to each phase's row in `master_blueprint.md` Section 4 (done as part of this rollup).
- **0.3** — Confirmed: split into **8A (Foundation)**, **8B (Reconciliation)**, **8C (Deposits & Reports)**, sequential, mirroring Phase 7's 7A/7B/7C structure.
- **0.4** — Resolved by inspection, not a new library search: both legacy PDF functions (`generateDepositSlipPDF`, `generateDepositDetailReport`) already use **`jsPDF` via `npm:jspdf@2.5.1`** — a pure PDF-drawing library, already proven to work in this exact codebase, directly portable to Deno under this project's established `npm:` specifier convention (same pattern as `npm:@base44/sdk`). No new library evaluation needed — 8C ports the existing drawing logic as-is.
- **0.5** — Housekeeping, no objection raised: GL posting for this domain stays as direct `supabase.from('GLTransaction').insert()` (already fully native, simple CRUD), no new Edge Function.
- **0.6** — Housekeeping, no objection raised: `BankAccount` optimistic locking (`locked_by_user`/`locked_timestamp`, `checkBankAccountLock()`, `flushBankLocks`) carries over as-is — transport swap only, no redesign.

Original open-question writeups kept below for context/audit trail.

### 0.1 (original) — `BankAccount`/`BankTransaction`/`BankReconciliation` already native; `CashDrawerAdjustment`/`DepositSlipBreakdown` did not exist yet

A direct query against production confirmed `BankAccount`, `BankTransaction`, and `BankReconciliation` already exist as native Postgres tables with real data and the standard audit-field convention, matching `src/supabase/schema.csv`'s live column dump — contrary to the blueprint's Phase 8 description implying schema-design work for the whole domain. `CashDrawerAdjustment`/`DepositSlipBreakdown` had no Postgres table and no tracked migration. **Resolved 2026-08-03:** you created both tables directly on the dev branch from the base44 `.jsonc` definitions before this plan was finalized — see 3&4/8A for the confirmed schema and the production-migration step.

### 0.2 (original) — file-scope boundary for the 6 cross-domain `BankAccount` writers

| File | Domain | Resolution |
|---|---|---|
| `src/components/inventory/ReceiveCreditModal.jsx` | Inventory (Phase 7, confirmed not in its scope) | → **Phase 9**, bundled with LOC work (file also handles LOC refunds) |
| `src/components/suppliers/SupplierPaymentModal.jsx` | Suppliers/AP | → **Phase 9** |
| `src/components/lines-of-credit/LineOfCreditPaymentModal.jsx` | Lines of Credit | → **Phase 9** |
| `src/components/cheques/IssuedChequesTable.jsx` | Cheques | → **Phase 9** (per your direction — cheques are in Phase 9's scope) |
| `src/components/payroll/MarkPaidModal.jsx` | Payroll | → **Phase 11** |
| `src/components/taxes/MarkPaidModal.jsx` | Taxes | → **Phase 10** |

### 0.3 (original) — sub-phase split, confirmed as proposed

- **8A — Foundation:** New schema for `CashDrawerAdjustment`/`DepositSlipBreakdown` (production), transport-layer cutover of `BankAccount`/`BankTransaction`/`BankReconciliation`/`CashDrawerAdjustment`/`DepositSlipBreakdown` CRUD across the confirmed in-scope file set, plus the two simple/thin-proxy legacy function ports (`getBankTransactions`, `calculateBankBalances`).
- **8B — Reconciliation:** `processBankReconciliation`, `batchReconcileTransactions`, `getReconciliationHistory`, `flushBankLocks` — depends on 8A's `BankTransaction`/`BankReconciliation` cutover.
- **8C — Deposits & Reports:** `generateDepositSlipPDF`, `generateDepositDetailReport`, `reverseDeposit` — depends on 8A's `CashDrawerAdjustment`/`DepositSlipBreakdown` schema.

### 0.4 (original) — PDF library

Resolved by inspection — see decisions summary above.

### 0.5/0.6 (original) — housekeeping

GL posting pattern and `BankAccount` optimistic locking both carry over unchanged — see decisions summary above.

---

## 1) Phase Scope & Objectives

**In scope for Phase 8:**

1. Apply `CashDrawerAdjustment`/`DepositSlipBreakdown` DDL to production as a tracked migration file, matching the schema already created on the dev branch (8A).
2. Transport-layer cutover of `BankAccount`/`BankTransaction`/`BankReconciliation`/`CashDrawerAdjustment`/`DepositSlipBreakdown` CRUD from `base44.functions.invoke('SupabaseProxy', ...)` / `base44.entities.*` to direct `supabase.from()`, across every confirmed in-scope file (full list in 3&4/8A).
3. Native `autopro-*` replacements for 7 of the 9 legacy named functions (excluding none — all 9 are in scope, split across 8A/8B/8C per 0.3).
4. One-time data migration for any live `CashDrawerAdjustment`/`DepositSlipBreakdown` records currently only in Base44 (volume/urgency TBD — needs the same live-data-count check Phase 12 did for `Appointment`; scoped into 8A).
5. Preserve exact existing behavior: optimistic locking, GL posting pattern (ad hoc direct insert, per 0.5), reconciliation math, deposit-slip/report PDF output (byte/visual equivalence).

**Explicitly out of scope (carried forward, see `master_blueprint.md` Section 4):**
- `src/components/inventory/ReceiveCreditModal.jsx`, `src/components/suppliers/SupplierPaymentModal.jsx`, `src/components/lines-of-credit/LineOfCreditPaymentModal.jsx`, `src/components/cheques/IssuedChequesTable.jsx` → Phase 9.
- `src/components/taxes/MarkPaidModal.jsx` → Phase 10.
- `src/components/payroll/MarkPaidModal.jsx` → Phase 11.
- `autopro-handleInvoiceConversionGL`/`autopro-handleSupplierInvoiceLineGL` — do not touch (standing project rule; confirmed this domain doesn't call them anyway).
- `ChartOfAccount` CRUD itself — already hybrid/native; referenced read-only by `BankAccountEditModal.jsx`, `BankTransactionModal.jsx`, `CashDrawerAdjustmentModal.jsx` (all import from `@/entities/all`) — Phase 9 owns finishing that entity's own cutover, this phase doesn't touch those import lines.
- `CustomerPayments` — `cash-drawer/DepositDetailsModal.jsx` already has a direct `supabase.from('CustomerPayments')` call (line ~748); leave as is.

**Target outcome:** Zero `base44.*` calls remaining for `BankAccount`/`BankTransaction`/`BankReconciliation`/`CashDrawerAdjustment`/`DepositSlipBreakdown` anywhere in the confirmed in-scope files; all 9 legacy functions replaced with native `autopro-*` equivalents (PDF-generating ones return raw PDF bytes on success, `200 + {error}` JSON on failure, matching the existing convention's spirit); reconciliation and deposit-slip PDF output equivalent to pre-migration behavior — bank reconciliation run twice (old vs. new path), totals matching to the cent.

---

## 2) Lessons Learned & Context

Pulled from `master_blueprint.md` Section 7, filtered to what's load-bearing for this phase:

- **Never trust the blueprint's entity-status classification at face value — verify directly against the database, per table, not per phase.** Second confirmed case this initiative (`Appointment` in Phase 12, now `BankAccount`/`BankTransaction`/`BankReconciliation` here).
- **Postgres `bigint` columns reject `''`, need `null`.** (Phase 12.) `DepositSlipBreakdown`'s denomination columns (`bills_5`...`coins_200`, `rolled_coin`, `bank_account_number`) are all `bigint` — any form defaulting these to `''` instead of `0`/`null` will hit the same `22P02` error. Check the existing `DepositSlipBreakdownModal.jsx` form defaults before wiring the direct insert.
- **Audit fields don't populate themselves.** This domain's existing convention (verbatim from `Bank.jsx`, `Reconcile.jsx`, `ReceiveCreditModal.jsx`): `created_by: currentUser?.full_name || currentUser?.email || currentUser?.id`, `created_by_id: currentUser?.id` — follow this exact derivation (note: differs slightly from Phase 12's `Appointment` convention, which used `user?.email || ''` — match whichever convention the specific file already uses).
- **`npm:` vs `esm.sh` specifiers matter for Deno Edge Functions.** Both PDF functions (8C) use `npm:jspdf@2.5.1` in the legacy source — carry that exact specifier forward. `autopro-splitInvoicePDF` (existing, unrelated function) uses `esm.sh/pdf-lib` for a different purpose (splitting existing PDFs, not drawing new ones) — not a pattern to copy for 8C's drawing-based PDFs.
- **All native `autopro-*` Edge Functions return HTTP 200 with `{ error }` on failure, never raw 4xx/5xx.** For 8C's PDF-generating functions specifically, a *success* response is the raw PDF binary (`Content-Type: application/pdf`), not JSON — only the failure path needs the `200 + {error}` JSON shape.
- **A `Promise.all` mixing a still-base44-routed call with already-migrated direct calls fails the whole batch on a dev-native session.** (Phase 3/12.) Check `Bank.jsx`/`CashDrawer.jsx`/`Reconcile.jsx` for this pattern during 8A/8B/8C — none of these are being left partially migrated mid-phase, but verify no other still-base44 call (e.g. `getworkorderlist`-style) is bundled into the same `Promise.all` as this phase's direct calls.
- **Dev-branch column types can diverge from production.** (Phase 4.) `CashDrawerAdjustment`/`DepositSlipBreakdown` were created fresh on dev this session — re-verify the exact same DDL lands identically on production during 8A (should be trivial since it's a fresh `CREATE TABLE`, not a divergence-prone `ALTER`).
- **The `/dev-login` mechanism (`test.kensauto.ca/dev-login`) is confirmed still fully functional** (Phase 12) — use for all live verification in this phase.
- **Financial-domain risk is the critical category for this tier** (blueprint Risk #2, #9). Strictly cast (`Number()`/`parseFloat()`) on every rewritten write path. Diff reconciliation totals old-path vs. new-path, to the cent, before/after each sub-phase.
- **Two files can share an identical name in different folders.** `src/components/bank/DepositDetailsModal.jsx` (presentational-only, no entity calls) vs. `src/components/cash-drawer/DepositDetailsModal.jsx` (the real one — `BankAccount`, `reverseDeposit`, `generateDepositDetailReport`). Only the latter is in scope.
- **Multi-agent coexistence:** Phase 7 is active on a separate track; confirmed zero file overlap with Phase 8's now-finalized scope (the one prior touchpoint, `ReceiveCreditModal.jsx`, is no longer even in Phase 8's scope per 0.2 — moot).

---

## 3 & 4) Phase 8 Roadmap — Sub-Phase Breakdown

### Why split into sub-phases

Same rationale as Phase 7: this is real financial/money-movement logic (reconciliation, deposit reversal, GL-adjacent balances) where correctness matters more than speed, and the true footprint (18 in-scope files + 9 legacy function ports) is too large to safely execute and verify as one atomic unit. Splitting lets 8A's transport-layer foundation get verified in isolation before the higher-risk reconciliation (8B) and money-movement-reversal (8C) logic builds on top of it.

### Sub-phase status tracker

| Sub-phase | Scope | Status | Depends on |
|---|---|---|---|
| **8A** | Schema (prod migration for `CashDrawerAdjustment`/`DepositSlipBreakdown`) + transport-layer cutover of all 5 entities across every in-scope file, plus `getBankTransactions`/`calculateBankBalances` ports | [ ] Not Started | None — start here |
| **8B** | `processBankReconciliation`, `batchReconcileTransactions`, `getReconciliationHistory`, `flushBankLocks` native ports | [ ] Not Started | **8A** (needs `BankTransaction`/`BankReconciliation` on direct calls first) |
| **8C** | `generateDepositSlipPDF`, `generateDepositDetailReport`, `reverseDeposit` native ports | [ ] Not Started | **8A** (needs `CashDrawerAdjustment`/`DepositSlipBreakdown` schema + direct calls first) |

---

## 8A) SUB-PHASE A: Foundation — Schema & Transport-Layer Cutover

### 8A.1) Schema — production migration for `CashDrawerAdjustment` / `DepositSlipBreakdown`

New migration file: `supabase/migrations/20260805000000_cashdrawer_depositslip_tables.sql`, mirroring the schema already created on the dev branch (`sitihbdnuxifwibontcm`), confirmed via `information_schema.columns` **and** `information_schema.table_constraints`/`pg_class`/`pg_policies` (2026-08-03 — see the RLS finding below, this is not just a column-type match):

```sql
CREATE TABLE "CashDrawerAdjustment" (
  id text PRIMARY KEY,
  adjustment_date text,
  amount double precision,
  type text,
  payment_method text,
  description text,
  reference text,
  gl_transactions jsonb,
  status text,
  deposited boolean,
  deposit_date text,
  deposit_batch_id text,
  created_date timestamp with time zone,
  updated_date timestamp with time zone,
  created_by text,
  created_by_id text,
  is_sample boolean
);

CREATE TABLE "DepositSlipBreakdown" (
  id text PRIMARY KEY,
  deposit_batch_id text,
  bank_transaction_id text,
  deposit_date text,
  bills_5 bigint,
  bills_10 bigint,
  bills_20 bigint,
  bills_50 bigint,
  bills_100 bigint,
  coins_5 bigint,
  coins_10 bigint,
  coins_25 bigint,
  coins_100 bigint,
  coins_200 bigint,
  rolled_coin bigint,
  total_cash double precision,
  total_cheques double precision,
  deposit_amount double precision,
  cheques_data jsonb,
  bank_account_number bigint,
  bank_account_name text,
  created_date timestamp with time zone,
  updated_date timestamp with time zone,
  created_by text,
  created_by_id text,
  is_sample boolean
);

-- RLS: both tables have RLS auto-enabled (this project's `ensure_rls` event trigger,
-- per master_context.md) but need an explicit policy or all access is silently blocked.
-- Exact pattern confirmed matching "BankAccount" and "Appointment" via pg_policies (2026-08-03):
ALTER TABLE "CashDrawerAdjustment" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Enable all operations for all users" ON "CashDrawerAdjustment"
  FOR ALL TO public USING (true) WITH CHECK (true);

ALTER TABLE "DepositSlipBreakdown" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Enable all operations for all users" ON "DepositSlipBreakdown"
  FOR ALL TO public USING (true) WITH CHECK (true);
```

- **CONFIRMED BUG on the dev branch, not just a hypothetical (2026-08-03):** both tables already have `id text PRIMARY KEY` (confirmed via `information_schema.table_constraints` — `CashDrawerAdjustment_pkey`/`DepositSlipBreakdown_pkey`, matching this DDL exactly) and RLS **enabled** (`pg_class.relrowsecurity = true` for both) but **zero rows in `pg_policies`** for either table — i.e. every `supabase.from()` call against them will silently return empty/blocked results on the dev branch **right now, today**, before any frontend code changes even happen. This is the exact Phase 1 trap ("RLS enabled + zero policies = silently blocked access, no clear error") recurring. **First action item of 8A execution: run the two `CREATE POLICY` statements above against the dev branch immediately** (the `CREATE TABLE` there is a no-op/already exists, only the policy statements need to run there) — do this before writing or testing any frontend code against these tables, or every test will look like a mysterious empty-result bug.
- `id` is `text` with **no default** — both tables follow the base44 24-char-hex-ID convention (like `Customer`/`Vehicle`), not `Appointment`'s `gen_random_uuid()` pattern. Every direct `.insert()` needs a client-generated ID: `crypto.randomUUID().replace(/-/g, '').substring(0, 24)`, matching `AppointmentForm.jsx`'s `handleCreateCustomer`/`handleCreateVehicle` pattern.
- `adjustment_date`/`deposit_date` are `text`, not `date` — preserve as-is, matches the dev-branch schema already created; not this phase's call to "fix."
- Denomination fields and `bank_account_number` are `bigint` — **empty-string form defaults will 22P02 error** (see Section 2's lesson). Audit the existing form components' default state before wiring inserts.
- **On production**, this is a genuinely fresh `CREATE TABLE` (neither table exists there yet, confirmed 2026-08-03) — run the full migration file (`CREATE TABLE` + RLS `ENABLE`/`CREATE POLICY`) as one tracked migration. **On dev**, only the RLS block needs to actually run (tables already exist) — either run the RLS statements standalone against dev first, or wrap the `CREATE TABLE` statements in `CREATE TABLE IF NOT EXISTS` so the same migration file is safely idempotent against both branches.
- Apply to **dev branch first**, verify via `information_schema.columns` + `pg_policies` (policy count > 0, not just column match), then production.

### 8A.2) Transport-layer cutover — file-by-file target list

All base44/SupabaseProxy call sites confirmed via direct codebase research (2026-08-03). Apply the established pattern throughout: `base44.functions.invoke('SupabaseProxy', {action, table, ...})` → `supabase.from(table)...`; `base44.entities.X.method()` → `supabase.from('X')...`; preserve exact existing filter/sort/audit-field logic.

**`src/pages/Bank.jsx`**
- `table: 'BankAccount'` — lines 109, 292, 299, 673
- `table: 'BankTransaction'` — lines 381, 393, 625
- `createGLTransaction` helper (lines 72–89) — already SupabaseProxy-based insert to `GLTransaction`; convert to direct `supabase.from('GLTransaction').insert()` per 0.5, no new function.
- `calculateBankBalances` invocations (lines 124, 319, 420, 551, 633) — port to `autopro-calculateBankBalances` in this sub-phase (simple aggregation, not deferred to 8B/8C).
- `flushBankLocks` (line 344) — **defer to 8B** (bundled with the locking/reconciliation subsystem).
- `getBankTransactions` import (used line 182) — port to `autopro-getBankTransactions` in this sub-phase.

**`src/pages/CashDrawer.jsx`**
- `base44.entities.CashDrawerAdjustment.filter/list/update/create` — lines 88, 99, 339, 545, 666
- `base44.entities.DepositSlipBreakdown.filter` — line 605
- `table: 'BankAccount'` — line 92
- `table: 'BankTransaction'` — line 391
- `supabase.from('CustomerPayments')` (line ~748) — already migrated, leave as is.
- `generateDepositSlipPDF` invocation (line 770) — **defer to 8C**.

**`src/pages/Reconcile.jsx`**
- `table: 'BankReconciliation'` — lines 73, 290
- `table: 'BankAccount'` — lines 111, 151
- `getBankTransactions` (used line 118) — same port as above, reuse the 8A-built function.
- `batchReconcileTransactions` (line 258) — **defer to 8B**.
- `created_by`/`created_by_id` from `activeUser` (lines 282–283) — preserve exact derivation.

**`src/pages/ReconcileReport.jsx`** (read-only report)
- `table: 'BankReconciliation'` — line 51
- `table: 'BankAccount'` — line 69
- `table: 'BankTransaction'` — line 74

**`src/components/bank/`**
- `AutoReconcileModal.jsx` — `processBankReconciliation` (line 30) — **defer to 8B**.
- `BankAccountEditModal.jsx` — no direct Bank* SupabaseProxy calls (form-only); leave its `ChartOfAccount` import untouched (Phase 9 territory).
- `BankTransactionModal.jsx` — `table: 'BankAccount'` at lines 46, 61, 126, 231; leave `ChartOfAccount` import untouched.
- `BankTransferModal.jsx` — `table: 'BankAccount'` at lines 32, 41.
- `DepositDetailsModal.jsx` — **no entity calls found, presentational only, no changes needed.**
- `ReconciliationHistoryModal.jsx` — `getReconciliationHistory` (line 37) — **defer to 8B**.

**`src/components/cash-drawer/`**
- `CashDrawerAdjustmentModal.jsx` — `table: 'BankAccount'` at line 36; leave `ChartOfAccount` import untouched.
- `DepositDetailsModal.jsx` (the real one, distinct from bank/'s) — `table: 'BankAccount'` (line 169), `CashDrawerAdjustment`/`WorkOrder` imports (line 9 — migrate `CashDrawerAdjustment` to direct call, leave `WorkOrder` untouched, that's Phase 13's entity), `reverseDeposit` (line 196) and `generateDepositDetailReport` (line 218) — **both defer to 8C**, direct `supabase.from('Customer')` (line 87) already migrated, leave as is.
- `DepositHistoryModal.jsx` — `table: 'BankAccount'` (line 96); `FiscalPeriod` import (leave, hybrid entity not this phase's scope); `getBankTransactions` (line 26) — reuse 8A's port; `reverseDeposit` (line 123) — **defer to 8C**.
- `DepositModal.jsx` — `table: 'BankAccount'` (line 51).
- `DepositSlipBreakdownModal.jsx` — `DepositSlipBreakdown.create()` (line 118) — migrate to direct `supabase.from('DepositSlipBreakdown').insert()`, remember the client-generated `id` (8A.1).
- `AdjustmentHistoryModal.jsx`, `ChangePaymentMethodModal.jsx`, `PaymentSelectionModal.jsx` — no direct entity/table calls found, presentational only, no changes needed.

### 8A.3) `autopro-calculateBankBalances` / `autopro-getBankTransactions` — full source read (2026-08-03)

Both already do their real work via direct Postgres access (no `base44.entities.*`), so — same as every 8B/8C function — the port is: drop the `base44.auth.me()` gate entirely (per the established `autopro-*` convention, confirmed via `autopro-mergeCustomers`), swap `Supabase_project_url`/`Supabase_Secret_Key` for the auto-injected `SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY`, keep the business logic byte-identical.

- **`calculateBankBalances`**: takes `{bankAccountId}`, sums `credit_amount - debit_amount` across all non-reversed `BankTransaction` rows for the account (ordered by `transaction_date`), writes the result to `BankAccount.current_balance` + `last_recalculated_date`. Simple, low risk.
- **`getBankTransactions`**: takes `{bankAccountId, fromDate, toDate, isReconciled, searchText, sourceType, sourceId, sortField, sortDirection}` — a filtered/sorted transaction list with a 365-day default lookback window (Mountain-time-aware date defaults via `Intl.DateTimeFormat`), excludes reversed transactions, joins in `bank_account_name`/`bank_name`. Currently implemented as **raw `fetch()` calls against the PostgREST REST endpoint** (not the `supabase-js` client) — this pattern already matches Phase 12's reminder-function port (`fetchAll`/`fetchByIds` helpers), so it's fine to either keep as raw `fetch()` for consistency with that precedent, or switch to `supabase-js` to match this function's 8 siblings — **no strong reason either way, use `supabase-js` for consistency with the rest of this phase's ports** unless you'd rather match the reminder-function pattern instead.

### 8A.4) Verification Checklist

- [ ] Dev branch: confirm `CashDrawerAdjustment`/`DepositSlipBreakdown` schema matches this plan's DDL exactly (already created by user — spot check, don't blindly re-apply the `CREATE TABLE`)
- [ ] **Dev branch: RLS policy statements applied — CONFIRMED MISSING as of 2026-08-03 (RLS enabled, zero policies, silently blocking all access).** Run this first, before any frontend testing against these tables.
- [ ] Production: full migration (`CREATE TABLE` + RLS enable + policy) applied, confirmed via `information_schema.columns` AND `pg_policies` (not just column match)
- [ ] `Bank.jsx`: all `BankAccount`/`BankTransaction` SupabaseProxy calls converted; `createGLTransaction` now a direct insert; `calculateBankBalances` calls hit the new `autopro-calculateBankBalances`; page loads and balances display correctly via `/dev-login`
- [ ] `CashDrawer.jsx`: `CashDrawerAdjustment`/`DepositSlipBreakdown`/`BankAccount`/`BankTransaction` all converted to direct calls; create/edit/list a throwaway test adjustment, verify in DB
- [ ] `Reconcile.jsx`: `BankReconciliation`/`BankAccount` converted; `getBankTransactions` calls hit the new native function
- [ ] `ReconcileReport.jsx`: converted, read-only report still renders correctly
- [ ] `bank/BankTransactionModal.jsx`, `BankTransferModal.jsx`, `cash-drawer/CashDrawerAdjustmentModal.jsx`, `DepositHistoryModal.jsx`, `DepositModal.jsx`, `DepositSlipBreakdownModal.jsx`, `cash-drawer/DepositDetailsModal.jsx` (`CashDrawerAdjustment`/`BankAccount` portions only) — all converted, code-path smoke tested
- [ ] New `autopro-getBankTransactions`/`autopro-calculateBankBalances` functions deployed, return `200 + {error}` on failure, verified by direct invocation
- [ ] Client-generated `id` pattern confirmed working for `CashDrawerAdjustment`/`DepositSlipBreakdown` inserts (no `gen_random_uuid()` default)
- [ ] `bigint` denomination fields confirmed handling `0`/`null` correctly, not `''` (Section 2 lesson)
- [ ] Repo-wide grep: zero remaining `SupabaseProxy`/`base44.entities` references for the 5 entities across all 8A-scoped files
- [ ] Mark **8A: Complete** before starting 8B or 8C

---

## 8B) SUB-PHASE B: Reconciliation & Locking

### 8B.1) Scope

Native ports for the 4 remaining reconciliation/locking legacy functions, all reading/writing `BankTransaction`/`BankReconciliation`/`BankAccount` — now on direct calls after 8A. **All 4 source files read in full 2026-08-03 — full execution detail is in 8B.2 below, this is just the scope summary.**

- `processBankReconciliation` (called from `AutoReconcileModal.jsx:30`) — CSV-vs-system amount-matching preview, **read-only, writes nothing**.
- `batchReconcileTransactions` (called from `Reconcile.jsx:258`) — manual batch reconciliation, updates `BankTransaction.reconciled`/`reconciliation_id`/`cleared` for a batch of IDs. Does **not** create the `BankReconciliation` record itself (that's client-side in `Reconcile.jsx`, part of 8A).
- `getReconciliationHistory` (called from `ReconciliationHistoryModal.jsx:37`) — list past reconciliations for an account, **read-only**.
- `flushBankLocks` (called from `Bank.jsx:344`) — releases stale optimistic locks; must preserve `checkBankAccountLock()`'s exact semantics (`src/components/utils/mountainTimeUtils.jsx:50`).

### 8B.2) Detailed Execution Plan

**Cross-cutting finding (2026-08-03, all 4 functions read in full):** every one of these already does its actual data work via a direct `createClient(supabaseUrl, supabaseSecret)`/raw PostgREST `fetch()` call — none of them route `BankAccount`/`BankTransaction`/`BankReconciliation` reads/writes through `base44.entities.*`. The only base44-specific things to strip are (1) `createClientFromRequest`/`base44.auth.me()`'s 401-gate — **confirmed via `autopro-mergeCustomers`/`autopro-decodeVin` that established `autopro-*` functions don't replicate this check at all**, they rely purely on the service-role client + frontend/RLS gating, so this gate is dropped entirely, not replaced — and (2) the non-standard `Deno.env.get('Supabase_project_url')`/`Supabase_Secret_Key` secret names, which become the auto-injected `SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY` (no new Supabase secrets to configure — these already exist on every project).

**`autopro-processBankReconciliation`** (from `base44/functions/processBankReconciliation/entry.ts`)
- **Read-only** — takes `{fileUrl, bankAccountId, periodEnd}`, downloads a CSV via `fetch(fileUrl)`, parses with `papaparse` (`npm:papaparse@5.4.1`, carry the specifier forward), fetches up to 2000 `BankTransaction` rows for the account (unreconciled, not reversed, `transaction_date <= periodEnd`), then amount-matches CSV rows against system transactions (tolerance `±0.005`, matches by amount only, not date). Returns `{matches, unmatchedCsv, unmatchedSystem, stats}` — nothing is written to the DB by this function itself; `AutoReconcileModal.jsx` uses the result to build a confirmed selection, which then flows into `batchReconcileTransactions` (or the client's own `BankReconciliation` create, per `Reconcile.jsx`).
- Port: strip the base44 auth/client bootstrap, swap secret names, keep every line of matching logic (`parseAmount`, `parseCsvDate`, the matching loop) byte-identical — this is pure business logic worth preserving exactly to avoid subtly changing which transactions match.
- Also uses `npm:date-fns@3.6.0` (`parse`, `isValid`) — already a proven Deno-compatible specifier in this project (used in `generateDepositDetailReport` too).

**`autopro-batchReconcileTransactions`** (from `base44/functions/batchReconcileTransactions/entry.ts`)
- Takes `{transactionIds, reconciliationId}`, updates `BankTransaction` rows (`reconciled: true, reconciliation_id, cleared: true, updated_date`) for the given IDs via `.in('id', transactionIds)`. **Correction to this plan's earlier assumption:** this function does **not** create the `BankReconciliation` record itself — that happens client-side in `Reconcile.jsx` (line ~290, already in 8A's scope) via a direct insert. Uses `moment-timezone` (`npm:moment-timezone@0.5.48`) for a Mountain-time `updated_date` — carry the specifier forward, matches the existing Mountain-time convention used elsewhere in this codebase (Phase 12's reminder functions used a manual `-7h` offset instead; either approach is fine, but `moment-timezone` is what this function already uses — no reason to rewrite it to match a different sub-domain's convention).
- Returns `207` (partial success) if not all transactions updated — preserve this status-code nuance, it's meaningful to the caller.

**`autopro-getReconciliationHistory`** (from `base44/functions/getReconciliationHistory/entry.ts`)
- **Read-only.** Takes `{bankAccountId}`, fetches the `BankAccount` row (id/name/bank_name/account_type) and all `BankReconciliation` rows for it (ordered by `reconciliation_date` desc), formats numeric fields with `parseFloat`, computes `is_balanced: Math.abs(difference) < 0.01`. Lowest-risk port in this sub-phase — direct mechanical translation.

**`autopro-flushBankLocks`** (from `base44/functions/flushBankLocks/entry.ts`)
- Reads all `BankAccount` rows with `locked_by_user`/`locked_timestamp` set, nulls both columns for each. Simple, low risk. Must preserve exact behavior expected by `src/components/utils/mountainTimeUtils.jsx`'s `checkBankAccountLock()` helper (not touched by this port — that's frontend lock-*checking* logic, this function only *releases* locks).

### 8B.3) Verification Checklist

- [ ] `processBankReconciliation`/`batchReconcileTransactions`/`getReconciliationHistory`/`flushBankLocks` all ported to `autopro-*`, deployed, `200 + {error}` convention confirmed
- [ ] **Critical:** run bank reconciliation twice — old base44 path (before 8B lands, or against a snapshot) vs. new native path — confirm totals match to the cent, per `master_blueprint.md`'s Phase 8 verification requirement
- [ ] Optimistic lock behavior confirmed unchanged: two sessions attempting to edit the same `BankAccount` behave identically to pre-migration
- [ ] `flushBankLocks` confirmed releasing genuinely stale locks only, not live ones
- [ ] Mark **8B: Complete** before starting 8C (if not already running in parallel — confirm no shared file conflict with 8C first)

---

## 8C) SUB-PHASE C: Deposits & Reports

### 8C.1) Scope

Native ports for the 3 remaining deposit/report legacy functions, all now writing to the 8A-migrated `CashDrawerAdjustment`/`DepositSlipBreakdown`/`BankTransaction`. **All 3 source files read in full 2026-08-03 — full execution detail is in 8C.2 below, this is just the scope summary.**

- `generateDepositSlipPDF` (called from `CashDrawer.jsx:770`) — server-side PDF via `jsPDF`. Port is largely mechanical (see 8C.2).
- `generateDepositDetailReport` (called from `cash-drawer/DepositDetailsModal.jsx:218`) — same `jsPDF` pattern, different report layout.
- `reverseDeposit` (called from `DepositHistoryModal.jsx:123` and `cash-drawer/DepositDetailsModal.jsx:196`) — reverses a deposited batch. **This is the real risk in this sub-phase** — a 7-step operation touching `BankTransaction`, `GLTransaction`, `CustomerPayments`, `CashDrawerAdjustment`, and `FiscalPeriod`, with a hard dependency on 8A's `calculateBankBalances` port. Full step-by-step breakdown in 8C.2.

### 8C.2) Detailed Execution Plan

**`autopro-generateDepositSlipPDF` / `autopro-generateDepositDetailReport`** — mechanical ports per 8C.1: strip the `base44.auth.me()` gate (dropped, not replaced, per 8B's finding), keep every `jsPDF` drawing call byte-identical (company header, denomination tables, cheque list, signature boxes), keep `npm:jspdf@2.5.1` and (for the detail report) `npm:date-fns@3.6.0`. Both already return the correct shape on success (raw PDF bytes, `Content-Type: application/pdf`) — only the error path needs to match the `200 + {error}` convention... **note:** the legacy versions return `status: 500` on error, not `200` — **this is the one place to deliberately deviate from the legacy source and apply this project's own established convention instead** (always `200 + {error}` on failure, per the Phase 5/6 lesson logged in `master_blueprint.md` Section 7).

**`autopro-reverseDeposit`** (from `base44/functions/reverseDeposit/entry.ts`) — **the real risk in this sub-phase, read in full 2026-08-03:**

1. Fetches the target `BankTransaction`, validates: `source_type === 'deposit'`, not `cleared`, not `reconciled` (all 403 if violated — preserve exactly).
2. **Fiscal-period gate:** calls `base44.entities.FiscalPeriod.list()` to find the period covering `transaction_date`, blocks if `closed` or if no period exists. `FiscalPeriod` **confirmed already native** (direct query, 2026-08-03) — port this to a direct `supabase.from('FiscalPeriod').select('*')` call, same matching logic (`dateToCheck >= startDate && dateToCheck <= endDate`).
3. Finds original `GLTransaction` rows for the deposit (`reference = depositBatchId`, `source_type = 'deposit'`) — errors loudly if none found ("cannot reverse an unbalanced deposit"). Creates REVERSAL GL rows (debit/credit flipped, `source_type: 'deposit_reversal'`) via a **direct `supabase.from('GLTransaction').insert()`** — already using the exact ad-hoc pattern this phase's 0.5 decision confirmed, port as-is, no new function.
4. Calls `base44.functions.invoke('supabaseCustomerPayments', ...)` to find and un-deposit `CustomerPayments` rows for the batch (`deposited: false, deposit_date: null, deposit_batch_id: null`). Port to direct `supabase.from('CustomerPayments').select()/.update()` — `CustomerPayments` already has a proven direct-call precedent elsewhere in this exact domain (`cash-drawer/DepositDetailsModal.jsx` line ~748).
5. Calls `base44.entities.CashDrawerAdjustment.filter({deposit_batch_id}).update(...)` to reset each matching adjustment (`deposited: false, deposit_date: null, deposit_batch_id: null, status: 'pending'`) — port to direct `supabase.from('CashDrawerAdjustment')` calls, available after 8A.
6. **Deletes** the `BankTransaction` row outright (`delete().eq('id', bankTransactionId)`) — **flagging, not changing:** the schema has unused `is_reversed`/`reversed_by_id` columns (visible in `src/supabase/schema.csv`) that this function doesn't touch; it hard-deletes instead of soft-reversing. Preserve this exact behavior — not this phase's call to redesign reversal semantics without being asked.
7. Calls `calculateBankBalances` to recompute the account balance — **hard dependency on 8A's `autopro-calculateBankBalances` port being deployed first**, not just a soft sequencing preference. Port this call to `supabase.functions.invoke('autopro-calculateBankBalances', {bankAccountId})`.

All 7 steps preserve their exact order and error-handling (each throws/returns immediately on failure, no partial-state cleanup logic to replicate beyond what's already there).

### 8C.3) Verification Checklist

- [ ] `generateDepositSlipPDF`/`generateDepositDetailReport` ported to `autopro-*`, deployed; output compared old vs. new for byte-level/visual equivalence on a real (or dev-mirrored) deposit
- [ ] `reverseDeposit` ported, deployed, `200 + {error}` convention confirmed for the error path
- [ ] Reverse a throwaway test deposit end-to-end, confirm `BankTransaction`/`CashDrawerAdjustment`/`DepositSlipBreakdown` state all correctly rolled back
- [ ] Repo-wide grep: zero remaining `base44.*` references for any of the 9 legacy functions or 5 entities across the full Phase 8 scope
- [ ] `master_blueprint.md` Section 1/2 classification corrected for `BankAccount`/`BankTransaction`/`BankReconciliation`/`CashDrawerAdjustment`/`DepositSlipBreakdown` at phase close
- [ ] Mark **8C: Complete**, then **Phase 8: Complete** in the status tracker
