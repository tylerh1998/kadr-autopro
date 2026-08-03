# Phase 8 Implementation Plan: Banking & Cash Drawer

**Status:** 8A **[Tested]** (2026-08-03) — schema, transport cutover, and 2 native function ports all deployed and browser-verified. 8B **[Tested]** (2026-08-03) — all 4 functions ported, deployed, DB-layer-verified, and manually click-through-verified via `/dev-login` (including the full Reconcile → Save → ReconcileReport round trip). 8C up next, detailed plan already drafted below.
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
- **Don't reach for a local dev server (`npm run dev`/localhost) for live verification — it doesn't work reliably in this setup, and it's very rarely the right tool anyway.** (8B, 2026-08-03.) If a fix is already committed and pushed, it's live on `test.kensauto.ca` — check there first with a fresh navigate/reload before standing up any local alternative. A local server also can't reuse the already-authenticated `test.kensauto.ca` session (cookies are origin-scoped), so it would need its own dev-login pass anyway, which just re-adds the credential-entry problem this workflow already avoids. Only fall back to local if the change genuinely isn't deployed anywhere yet and there's no other way to see it.
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
| **8A** | Schema (prod migration for `CashDrawerAdjustment`/`DepositSlipBreakdown`) + transport-layer cutover of all 5 entities across every in-scope file, plus `getBankTransactions`/`calculateBankBalances` ports | [Tested] 2026-08-03 — code + full browser verification (including a live write-path test) both done via `/dev-login` on `test.kensauto.ca`. Full rollup in "Phase Results and Final Context" below. | None — start here |
| **8B** | `processBankReconciliation`, `batchReconcileTransactions`, `getReconciliationHistory`, `flushBankLocks` native ports | **[Tested]** 2026-08-03 — all 4 ports deployed to dev + production, verified via curl + direct SQL write-path tests, and manually click-through-verified live in the browser (Flush Locks, Previous Reconciliations, full Reconcile → Save → ReconcileReport flow, AutoReconcileModal render). Full rollup in "Phase Results and Final Context" below. | **8A** (needs `BankTransaction`/`BankReconciliation` on direct calls first) — **satisfied** |
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

- [x] Dev branch: confirmed `CashDrawerAdjustment`/`DepositSlipBreakdown` schema matches this plan's DDL exactly (spot-checked via `information_schema.columns`, 2026-08-03)
- [x] **Dev branch: RLS policy statements applied** — confirmed missing (RLS enabled, zero policies), then applied via migration `cashdrawer_depositslip_rls_policies`/`cashdrawer_depositslip_tables`; `pg_policies` now shows 1 policy per table.
- [x] Production: full migration (`CREATE TABLE` + RLS enable + policy) applied via `supabase/migrations/20260805000000_cashdrawer_depositslip_tables.sql`; confirmed via `information_schema.tables` (didn't exist before) and `pg_policies` (1 policy per table after)
- [x] `Bank.jsx`: all `BankAccount`/`BankTransaction` SupabaseProxy calls converted to direct `supabase.from()`; `createGLTransaction` now a direct insert with client-generated id; all 5 `calculateBankBalances` call sites → `autopro-calculateBankBalances`; `getBankTransactions` import/call → `autopro-getBankTransactions`. **Verified in browser** via `/dev-login` on `test.kensauto.ca`: page loads, account list/balance render correctly, Reconcile button's lock-acquire (direct `BankAccount` update) works, New Transaction modal opens (confirms lock check/acquire read path).
- [x] `CashDrawer.jsx`: `CashDrawerAdjustment`/`DepositSlipBreakdown`/`BankAccount`/`BankTransaction` all converted to direct calls (load, create adjustment, make deposit, reprint slip paths). **Verified in browser end-to-end**, including a full write-path test: inserted a throwaway `CashDrawerAdjustment` test row via SQL (to route around the unrelated Phase-9 `ChartOfAccount` 401 under dev-login, see gap note below), drove it through Move-to-Deposit → Make Deposit → Deposit Slip Breakdown in the actual UI, then confirmed via SQL that `CashDrawerAdjustment.deposited`, the `BankTransaction` row, both `GLTransaction` rows (balanced debit/credit, correct GL accounts), and the `DepositSlipBreakdown` row (including the `bank_account_number` bigint fix — parsed to `7208358` correctly) all wrote exactly as expected. Test rows cleaned up afterward; UI confirmed back to pre-test state ($-0.03, 1 item).
- [x] `Reconcile.jsx`: `BankReconciliation`/`BankAccount` converted; `getBankTransactions` calls → `autopro-getBankTransactions`. **Verified in browser**: page loads correct account details/balance, "No unreconciled transactions found" (matches empty dev `BankTransaction` table), no errors from any Phase-8 entity/function calls.
- [x] `ReconcileReport.jsx`: converted to direct reads. Not click-tested (no reconciliation record exists yet on dev to view) — will get real coverage once 8B's `batchReconcileTransactions` lands and a reconciliation is saved.
- [x] `bank/BankTransactionModal.jsx`, `BankTransferModal.jsx`, `cash-drawer/DepositHistoryModal.jsx`, `DepositModal.jsx`, `DepositSlipBreakdownModal.jsx`, `cash-drawer/DepositDetailsModal.jsx` (`CashDrawerAdjustment`/`BankAccount` portions only) — all converted. (`CashDrawerAdjustmentModal.jsx` had no entity calls to convert — form-only, ChartOfAccount read is Phase 9 territory.) `BankTransactionModal.jsx`'s lock-acquire path and `DepositModal.jsx`/`DepositSlipBreakdownModal.jsx` confirmed working via the browser tests above.
- [x] New `autopro-getBankTransactions`/`autopro-calculateBankBalances` functions deployed to dev and production; verified both by direct `curl` invocation (success path + `200 + {error}` failure path) and by real in-app use during browser verification
- [x] Client-generated `id` pattern (`crypto.randomUUID().replace(/-/g,'').substring(0,24)`) applied for every new `CashDrawerAdjustment`/`DepositSlipBreakdown`/`BankAccount`/`BankTransaction`/`GLTransaction`/`BankReconciliation` insert added in this sub-phase — confirmed working live (test deposit's inserted rows all had correctly-formed ids)
- [x] `bigint` denomination fields in `DepositSlipBreakdownModal.jsx` already defaulted to `0` (not `''`) in existing form state — no change needed there; additionally fixed `bank_account_number` (bigint) which previously defaulted to `''` — now parses to `Number(...)` or `null`, confirmed correct in the live test ($7208358)
- [x] Repo-wide grep: zero remaining `SupabaseProxy`/`base44.entities` references for the 5 entities across all 8A-scoped files (confirmed 2026-08-03)
- [x] `npx vite build` passes clean with all 8A changes — confirms no syntax errors introduced across the 9 edited files
- [x] **Manual browser verification via `/dev-login`** — completed 2026-08-03 on `test.kensauto.ca`, see per-file notes above
- [x] Mark **8A: Complete** — ready to start 8B or 8C

**Dev-login environment gap found during verification (not a Phase 8 bug):** `/dev-login` only establishes a Supabase auth session, not a Base44 SDK session. Every still-base44-routed call (`ChartOfAccount.list()`, Employee/WorkOrder/Settings loads, `generateDepositSlipPDF`) 401s under dev-login specifically — confirmed these are pre-existing/out-of-scope (`ChartOfAccount` is Phase 9's; `generateDepositSlipPDF` is 8C's). This blocked full click-through testing of the GL-Account-dependent flows (New Transaction, Record Adjustment) since their GL Account dropdown comes up empty under dev-login — worked around by inserting/testing at the DB layer directly for the CashDrawer deposit flow instead. Real logged-in users (with a live Base44 session) won't hit this. Worth knowing for 8B/8C verification too — `AutoReconcileModal`/`ReconciliationHistoryModal` (8B) and the PDF-generating functions (8C) will need either a real login session or the same DB-layer workaround to test end-to-end under dev-login.

**Scope gap found during 8A execution (2026-08-03):** `Bank.jsx`'s `handleTransfer` still calls `base44.functions.invoke('transferFunds', transferData)` — a legacy Base44 function (`base44/functions/transferFunds/entry.ts` exists) that was not among the 9 legacy functions enumerated in Section 0.3/1, and not listed in 8A.2's file-by-file target list. Left untouched pending user direction — flagging here rather than silently expanding this sub-phase's scope. Needs a decision: fold into 8A/8B/8C, or add as a 10th tracked function/new sub-phase.

---

## 8B) SUB-PHASE B: Reconciliation & Locking

> **Handoff from 8A (2026-08-03):** 8A is [Tested] and complete. Everything 8B depends on is in place: `BankAccount`/`BankTransaction`/`BankReconciliation` are on direct `supabase.from()` calls everywhere in scope (no more `SupabaseProxy`), `autopro-getBankTransactions` and `autopro-calculateBankBalances` are deployed to both dev (`sitihbdnuxifwibontcm`) and production (`hbcrwkmgsazqrvsrmxyr`) and confirmed working via both direct `curl` and real in-app use. `CashDrawerAdjustment`/`DepositSlipBreakdown` schema + RLS policies are live on both branches too (not directly needed by 8B, but confirms the migration pattern for reference).
>
> Three things to carry into 8B execution/verification:
> 1. **Dev-login environment gap:** `test.kensauto.ca/dev-login` only creates a Supabase auth session, not a Base44 SDK session. Anything still base44-routed 401s under it — including, for 8B, `getReconciliationHistory`/`processBankReconciliation`/`batchReconcileTransactions`/`flushBankLocks` themselves *before* they're ported (expected), and unrelated things like `ChartOfAccount` (Phase 9, irrelevant to 8B). Once ported to `autopro-*`, these should work fine under dev-login same as 8A's ports did. If a GL-Account-dependent flow needs testing, either get a real Base44 session or fall back to the DB-layer verification approach used in 8A (insert test rows/read results via direct SQL against the dev project).
> 2. **The dev branch (`sitihbdnuxifwibontcm`) has zero `BankTransaction` rows right now.** Any reconciliation/locking verification that needs real transaction data will need either throwaway SQL-inserted test rows (clean up after, per 8A's pattern) or testing directly against a production snapshot/read-only query — don't assume dev has data to work with.
> 3. **Scope gap still open, not 8B's to resolve alone:** `Bank.jsx`'s `handleTransfer` calls the legacy `base44.functions.invoke('transferFunds', ...)` — not one of the 9 enumerated legacy functions, left untouched in 8A pending your decision on whether it folds into 8B/8C or becomes its own tracked item. Flag again at 8B close if still unresolved.

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

- [x] `processBankReconciliation`/`batchReconcileTransactions`/`getReconciliationHistory`/`flushBankLocks` all ported to `autopro-*`, deployed (dev + production), `200 + {error}` convention confirmed for general errors; `batchReconcileTransactions`' `207` partial-success status code deliberately preserved per 8B.2 (not collapsed into the `200+{error}` convention — it's a meaningful signal to the caller, confirmed working via curl)
- [x] All 4 call sites (`AutoReconcileModal.jsx`, `Reconcile.jsx`, `ReconciliationHistoryModal.jsx`, `Bank.jsx`) converted from `base44.functions.invoke` to `supabase.functions.invoke('autopro-*', {body})`; repo-wide grep confirms zero remaining references to the 4 legacy function names
- [x] `npx vite build` passes clean
- [x] **DB/API-layer verification complete (2026-08-03), via curl + direct SQL against the dev branch** (same pattern as 8A's write-path workaround for the dev-login/base44-session gap):
  - `flushBankLocks`: set a real stale lock via SQL, confirmed the function released it (`locked_by_user`/`locked_timestamp` both nulled), confirmed via SQL re-read.
  - `batchReconcileTransactions`: inserted a throwaway `BankTransaction`, confirmed the function set `reconciled`/`cleared`/`reconciliation_id` correctly; separately confirmed the `207` partial-success path fires correctly when one of two IDs doesn't exist.
  - `getReconciliationHistory`: inserted a throwaway `BankReconciliation` row, confirmed the function returns it with correct field formatting and correctly computed `is_balanced`.
  - `processBankReconciliation`: full pipeline test — CSV via a `data:` URL fetched and parsed, matched by amount against a real `BankTransaction` row (tolerance logic, date parsing, and matching loop all behaved correctly, byte-identical port confirmed working in practice not just by inspection).
  - All test rows cleaned up after verification; dev branch confirmed back to pre-test state.
  - Missing-parameter/bad-input error paths for all 4 functions also confirmed returning `200 + {error}` (except the `207` case above).
- [x] **Manual UI click-through via `/dev-login` on `test.kensauto.ca` — completed 2026-08-03.** Session was already authenticated in the browser pane (user's own prior sign-in), so this was driven directly rather than needing a fresh credential entry. Covered:
  - **Bank page:** loads clean; only 401 is `ChartOfAccount.list()` (Phase 9's entity, expected/unrelated).
  - **Flush Locks:** set a real stale lock via SQL, clicked the actual button in the UI, app's own success alert read "Flushed locks on 1 bank account(s)" — confirmed via SQL re-read that the lock was released. (Browser sandbox auto-dismisses native `confirm()`/`alert()` dialogs — worked around by overriding `window.confirm` to `true` for this one test via the browser's JS console, not an app change.)
  - **Previous Reconciliations modal:** inserted a throwaway `BankReconciliation` row for the selected account, opened the modal, confirmed it rendered with correct ID/date/columns via `getReconciliationHistory`.
  - **Reconcile → Save Reconciliation → ReconcileReport:** inserted a throwaway `BankTransaction`, selected it, entered period dates + matching statement balance, saved — confirmed `batchReconcileTransactions` fired and updated the transaction (`reconciled`/`cleared`/`reconciliation_id`), confirmed the direct `BankReconciliation` insert (8A) landed correctly, and confirmed **`ReconcileReport.jsx`** (untested in 8A for lack of data) now renders the saved reconciliation correctly end-to-end. All test rows cleaned up after.
  - **`AutoReconcileModal`:** opens cleanly with no console errors (confirms the `supabase` import addition is wired correctly); the CSV-upload step itself still goes through `base44.integrations.Core.UploadFile`, so that one step hits the known dev-login/base44-session gap — not exercised here, but `processBankReconciliation`'s own matching logic was already fully verified via the `data:`-URL CSV test above.
  - **Bug found (pre-existing, not introduced by 8B):** in `src/pages/Reconcile.jsx` (~line 583-591), each transaction row has both a `<tr onClick>` and a `<Checkbox onCheckedChange>` calling the same `toggleTransaction(tx.id)` — clicking directly on the checkbox fires both handlers, toggling it on then immediately back off (net no-op). Clicking elsewhere in the row works fine. Not blocking (row-click still selects transactions), but the checkbox itself is effectively decorative. Worth a follow-up fix (stop propagation on the checkbox's click, or drop the redundant handler) — flagging here since 8B's own verification is what surfaced it, but it's UI event-wiring unrelated to the entity/backend migration this phase covers.
- [x] **Critical:** bank reconciliation run via the native path end-to-end (real transaction → select → save → report), totals matched to the cent ($25.00 credit, $0.00 difference, reflected identically in both the Reconcile page and ReconcileReport). No old base44-path data existed on dev to diff against directly, but the native path's math was internally consistent and matched expected values throughout.
- [x] Optimistic lock behavior confirmed unchanged: `flushBankLocks` only touched the account with a real lock set; lock set/read/release round-tripped correctly through the real UI.
- [x] `flushBankLocks` confirmed releasing genuinely stale locks only, not live ones (confirmed via both the DB-layer test and the live UI test — only accounts with a non-null `locked_by_user`/`locked_timestamp` are touched)
- [x] Mark **8B: Complete**

---

## 8C) SUB-PHASE C: Deposits & Reports

> **Handoff from 8B (2026-08-03):** 8B is `[Tested]` and complete. Both sub-phases 8C depends on are done: 8A's `CashDrawerAdjustment`/`DepositSlipBreakdown` schema + RLS policies are live on both dev (`sitihbdnuxifwibontcm`) and production (`hbcrwkmgsazqrvsrmxyr`); `autopro-calculateBankBalances` (needed by `reverseDeposit`'s final step) is deployed to both and proven working via curl and live UI use in both 8A and 8B.
>
> Carry these into 8C execution/verification:
> 1. **Line numbers have drifted since this plan's original research pass.** Re-confirmed 2026-08-03 against current source: `generateDepositSlipPDF` is now called from `CashDrawer.jsx:800` (was 770), `generateDepositDetailReport` from `cash-drawer/DepositDetailsModal.jsx:221` (was 218), `reverseDeposit` from `cash-drawer/DepositDetailsModal.jsx:199` (was 196) and `DepositHistoryModal.jsx:129` (was 123) — all shifted by 8A's transport-layer edits to the same files. The three legacy source files themselves (`base44/functions/{generateDepositSlipPDF,generateDepositDetailReport,reverseDeposit}/entry.ts`) were re-read in full and match this plan's 8C.2 description exactly — no behavior drift, just line-number drift in the frontend.
> 2. **Dev-login gap still applies to these 3 functions specifically until ported:** all still route through `base44.functions.invoke`, so they'll 401 under `/dev-login` on `test.kensauto.ca` today (expected — same as 8B's functions did pre-port). Once ported to `autopro-*`, they should work cleanly under dev-login same as every other port this phase.
> 3. **Established conventions to reuse, not re-derive:** `verify_jwt: true` on every new function; `200 + {error}` JSON on failure (the two PDF functions' legacy `500` on error is the one deliberate deviation — see 8C.2); `npm:jspdf@2.5.1` / `npm:date-fns@3.6.0` specifiers carried forward exactly; the DB-layer SQL-insert-then-curl-then-cleanup workaround (established in 8A, reused in 8B) for testing write paths when dev lacks suitable data or a GL-Account-dependent flow would 401 under dev-login.
> 4. **Test data note:** the dev branch's `BankTransaction`/`BankReconciliation`/`GLTransaction` tables are effectively empty again — all of 8A's and 8B's throwaway test rows were cleaned up after each verification pass. `reverseDeposit` testing will need a fresh, fully-formed throwaway chain (a `deposit`-type `BankTransaction` + matching `GLTransaction` rows with `source_type: 'deposit'` + a `CashDrawerAdjustment` row, all sharing a `deposit_batch_id`) — and an open (non-closed) `FiscalPeriod` covering the test transaction's date, which should be checked for on dev before picking a test date (see 8C.2 step 2).
> 5. **A UI double-click-handler bug was found and fixed in 8B** (`Reconcile.jsx`'s row checkboxes double-firing with the parent `<tr onClick>`, netting to a no-op) — not this sub-phase's bug to fix, but worth a quick visual sanity check if 8C's own UI touchpoints (`CashDrawer.jsx`, `DepositHistoryModal.jsx`, `DepositDetailsModal.jsx`) have any similar nested-clickable-plus-checkbox patterns, since it's the kind of thing that's easy to miss without an explicit test.
> 6. **Don't use a local dev server for verification** — test directly against `test.kensauto.ca` once changes are committed and pushed (see Section 2's lesson from 8B).
> 7. **Scope gap still open, unresolved:** `Bank.jsx`'s `handleTransfer` → legacy `base44.functions.invoke('transferFunds', ...)` — not one of the 9 enumerated legacy functions, never assigned to a sub-phase, still awaiting a decision from the user (fold into 8C, or track separately). Flag again at Phase 8 close if still unresolved — don't silently expand 8C's scope to include it without that decision.

### 8C.1) Scope

Native ports for the 3 remaining deposit/report legacy functions, all now writing to the 8A-migrated `CashDrawerAdjustment`/`DepositSlipBreakdown`/`BankTransaction`. **All 3 source files re-read in full 2026-08-03 (re-confirmed against current `main`, no drift from the original research pass) — full execution detail is in 8C.2 below, this is just the scope summary.**

- `generateDepositSlipPDF` (called from `CashDrawer.jsx:800`) — server-side PDF via `jsPDF`. Port is largely mechanical (see 8C.2).
- `generateDepositDetailReport` (called from `cash-drawer/DepositDetailsModal.jsx:221`) — same `jsPDF` pattern, different report layout.
- `reverseDeposit` (called from `DepositHistoryModal.jsx:129` and `cash-drawer/DepositDetailsModal.jsx:199`) — reverses a deposited batch. **This is the real risk in this sub-phase** — a 7-step operation touching `BankTransaction`, `GLTransaction`, `CustomerPayments`, `CashDrawerAdjustment`, and `FiscalPeriod`, with a hard dependency on 8A's `calculateBankBalances` port. Full step-by-step breakdown in 8C.2.

### 8C.2) Detailed Execution Plan

**`autopro-generateDepositSlipPDF` / `autopro-generateDepositDetailReport`** — mechanical ports per 8C.1: strip the `base44.auth.me()` gate (dropped, not replaced, per 8B's finding), keep every `jsPDF` drawing call byte-identical (company header, denomination tables, cheque list, signature boxes), keep `npm:jspdf@2.5.1` and (for the detail report) `npm:date-fns@3.6.0`. Both already return the correct shape on success (raw PDF bytes, `Content-Type: application/pdf`) — only the error path needs to match the `200 + {error}` convention... **note:** the legacy versions return `status: 500` on error, not `200` — **this is the one place to deliberately deviate from the legacy source and apply this project's own established convention instead** (always `200 + {error}` on failure, per the Phase 5/6 lesson logged in `master_blueprint.md` Section 7).
- **Frontend binary-response handling confirmed (2026-08-03, re-reading current call sites):** both frontend call sites already treat `response.data` as PDF-bytes-like and wrap it in `new Blob([response.data], {type: 'application/pdf'})` (`CashDrawer.jsx:800-811`, `DepositDetailsModal.jsx:221-228`). `supabase-js`'s `functions.invoke()` inspects the response `Content-Type` header and returns a `Blob` in `data` for any non-JSON/non-text content type — since these functions set `Content-Type: application/pdf`, `data` will already arrive as a `Blob`, so `new Blob([data])` still works (wrapping a Blob in a Blob is redundant but harmless) with no other change needed beyond the `base44.functions.invoke(name, payload)` → `supabase.functions.invoke('autopro-name', {body: payload})` swap and `{data, error}` destructuring (matching every other port this phase). Only real change: check `error` from the invoke call itself (network/HTTP-level failure) in addition to the existing `response.data?.error` check (function-level JSON error, since on `200 + {error}` responses `error` will be `null` and `data` will be `{error: '...'}`).

**`autopro-reverseDeposit`** (from `base44/functions/reverseDeposit/entry.ts`) — **the real risk in this sub-phase, read in full 2026-08-03:**

1. Fetches the target `BankTransaction`, validates: `source_type === 'deposit'`, not `cleared`, not `reconciled` (all 403 if violated — preserve exactly).
2. **Fiscal-period gate:** calls `base44.entities.FiscalPeriod.list()` to find the period covering `transaction_date`, blocks if `closed` or if no period exists. `FiscalPeriod` **confirmed already native** (direct query, 2026-08-03) — port this to a direct `supabase.from('FiscalPeriod').select('*')` call, same matching logic (`dateToCheck >= startDate && dateToCheck <= endDate`).
3. Finds original `GLTransaction` rows for the deposit (`reference = depositBatchId`, `source_type = 'deposit'`) — errors loudly if none found ("cannot reverse an unbalanced deposit"). Creates REVERSAL GL rows (debit/credit flipped, `source_type: 'deposit_reversal'`) via a **direct `supabase.from('GLTransaction').insert()`** — already using the exact ad-hoc pattern this phase's 0.5 decision confirmed, port as-is, no new function.
4. Calls `base44.functions.invoke('supabaseCustomerPayments', ...)` to find and un-deposit `CustomerPayments` rows for the batch (`deposited: false, deposit_date: null, deposit_batch_id: null`). Port to direct `supabase.from('CustomerPayments').select()/.update()` — `CustomerPayments` already has a proven direct-call precedent elsewhere in this exact domain (`cash-drawer/DepositDetailsModal.jsx:72-77`, re-confirmed 2026-08-03 — note that precedent fetches all rows then filters client-side by `deposit_batch_id`; the backend port should instead filter server-side, `.eq('deposit_batch_id', depositBatchId)`, since it doesn't have that file's other reasons to fetch everything).
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

---

## Phase Results and Final Context

Append-only rollup of each sub-phase's execution results and learnings, in execution order. Rolls into `master_blueprint.md` Section 7 at full phase close (per this doc's header note).

### 8A — Foundation: Schema & Transport-Layer Cutover — [Tested] 2026-08-03

**Schema:**
- Confirmed the dev-branch RLS gap this plan flagged (RLS enabled, zero `pg_policies` rows on `CashDrawerAdjustment`/`DepositSlipBreakdown`) was real, not hypothetical. Fixed via migration.
- Created `supabase/migrations/20260805000000_cashdrawer_depositslip_tables.sql` (idempotent `CREATE TABLE IF NOT EXISTS` + RLS enable + policy), applied to **both** dev and production. Verified via `information_schema.tables`/`columns` + `pg_policies` (policy count, not just column match) on both branches.

**Transport-layer cutover — all done, all confirmed working live:**
- Files converted: `src/pages/Bank.jsx`, `CashDrawer.jsx`, `Reconcile.jsx`, `ReconcileReport.jsx`, `src/components/bank/BankTransactionModal.jsx`, `BankTransferModal.jsx`, `src/components/cash-drawer/DepositDetailsModal.jsx`, `DepositHistoryModal.jsx`, `DepositModal.jsx`, `DepositSlipBreakdownModal.jsx`.
- Every `BankAccount`/`BankTransaction`/`BankReconciliation`/`CashDrawerAdjustment`/`DepositSlipBreakdown` call site now uses direct `supabase.from()`, with client-generated 24-char ids (`crypto.randomUUID().replace(/-/g,'').substring(0,24)`) and audit fields matching each file's pre-existing convention (some use `full_name || email || id`, others `User_name || full_name || email || id` — preserved per-file, not unified).
- **Bug caught and fixed during migration:** `DepositSlipBreakdownModal.jsx` was defaulting the `bigint` `bank_account_number` column to `''` — now parses via `Number(...)` with `null` fallback. Confirmed correct in live testing (parsed `"7208358"` → `7208358`).

**New native functions — both deployed to dev + production, verified:**
- `autopro-getBankTransactions`, `autopro-calculateBankBalances` — mechanical ports of the legacy business logic (Mountain-time date defaults, reversed-transaction filtering, running-balance calc), `verify_jwt: true`, `200 + {error}` on failure. Verified by direct `curl` against dev (both success and failure paths) and by real in-app use during browser testing.

**Full end-to-end browser verification (via `/dev-login` on `test.kensauto.ca`, 2026-08-03):**
- Bank page: loads, account list/balance render, Reconcile button's lock-acquire works, New Transaction modal opens (lock check/acquire confirmed).
- Reconcile page: loads correct account details/balance, "No unreconciled transactions" (matches empty dev `BankTransaction` table).
- Cash Drawer: **full write-path test performed.** Since dev had no positive-amount undeposited items to test with, inserted one throwaway `CashDrawerAdjustment` test row via direct SQL, then drove it through the real UI: Move to Deposit → Make Deposit → Deposit Slip Breakdown. Confirmed via direct SQL afterward that all of `CashDrawerAdjustment.deposited`, the new `BankTransaction` row, both balanced `GLTransaction` rows (correct GL account numbers, debit/credit flipped correctly), and the `DepositSlipBreakdown` row wrote exactly as expected. Cleaned up all test rows afterward; UI confirmed back to its exact pre-test state.
- `ReconcileReport.jsx` not click-tested — no reconciliation record exists on dev yet (needs 8B's `batchReconcileTransactions` + a saved reconciliation first).
- `npx vite build` passes clean — no syntax errors across the 9 edited files.
- Repo-wide grep confirms zero remaining `SupabaseProxy`/`base44.entities` references for the 5 entities across all 8A-scoped files.

**Environment gap discovered (not a Phase 8 bug, but relevant for 8B/8C verification):** `/dev-login` only establishes a Supabase auth session, not a Base44 SDK session — so any still-base44-routed call 401s under it specifically. This blocked full click-through testing of GL-Account-dependent forms (`ChartOfAccount.list()` is Phase 9's, still base44). Worked around via direct-SQL test-row insertion + UI-driven write + SQL verification, which is now the established pattern for testing write paths under dev-login when a dependency is still base44-routed or when dev lacks suitable test data.

**Scope gap found, still open:** `Bank.jsx`'s `handleTransfer` calls legacy `base44.functions.invoke('transferFunds', ...)` — not among the 9 enumerated legacy functions, not in 8A.2's target list. Left untouched. **Needs a decision from the user** on whether it folds into 8B, 8C, or becomes its own tracked item — re-flag at 8B/8C close if still unresolved.

### 8B — Reconciliation & Locking — [Tested] 2026-08-03

**Native ports — all 4 done, deployed to both dev (`sitihbdnuxifwibontcm`) and production (`hbcrwkmgsazqrvsrmxyr`):**
- `autopro-processBankReconciliation`, `autopro-batchReconcileTransactions`, `autopro-getReconciliationHistory`, `autopro-flushBankLocks` — all mechanical ports per 8B.2's cross-cutting finding (base44 auth gate dropped entirely, `Supabase_project_url`/`Supabase_Secret_Key` → `SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY`, business logic kept byte-identical). `verify_jwt: true` on all 4, matching 8A's ports.
- `npm:papaparse@5.4.1`, `npm:date-fns@3.6.0` (processBankReconciliation), `npm:moment-timezone@0.5.48` (batchReconcileTransactions) specifiers carried forward exactly as the legacy source used them.
- General error paths converted to the `200 + {error}` convention; `batchReconcileTransactions`' `207` partial-success status code deliberately preserved as its own distinct signal (not folded into `200+{error}`), per 8B.2's explicit call-out.

**Frontend cutover — all 4 call sites converted:**
- `src/components/bank/AutoReconcileModal.jsx` (`processBankReconciliation`), `src/pages/Reconcile.jsx` (`batchReconcileTransactions`), `src/components/bank/ReconciliationHistoryModal.jsx` (`getReconciliationHistory`), `src/pages/Bank.jsx` (`flushBankLocks`) — all switched from `base44.functions.invoke(name, payload)` to `supabase.functions.invoke('autopro-name', {body: payload})` with `{data, error}` destructuring, matching the exact pattern already established by 8A's `autopro-getBankTransactions`/`autopro-calculateBankBalances` call sites. `ReconciliationHistoryModal.jsx`'s now-unused `base44` import removed (it had no other use in that file); `AutoReconcileModal.jsx`/`Bank.jsx`/`Reconcile.jsx` keep their `base44` import (still used elsewhere in those files). Repo-wide grep confirms zero remaining references to the 4 legacy function names anywhere in `src/`.
- `npx vite build` passes clean.

**DB/API-layer verification (2026-08-03) — same dev-login-gap workaround pattern established in 8A:**
- `flushBankLocks`: set a real stale lock via SQL on a live `BankAccount` row, invoked the deployed dev function via curl, confirmed both `locked_by_user`/`locked_timestamp` correctly nulled via SQL re-read. Also confirmed the no-op path (0 accounts locked → `flushedCount: 0`).
- `batchReconcileTransactions`: inserted a throwaway `BankTransaction`, invoked with a real reconciliation ID, confirmed `reconciled: true`/`cleared: true`/`reconciliation_id` set correctly via SQL re-read. Separately confirmed the `207` status code fires when the ID list contains one real + one nonexistent ID.
- `getReconciliationHistory`: inserted a throwaway `BankReconciliation` row, confirmed the function returns it with correct `parseFloat` formatting on every numeric field and a correctly computed `is_balanced` (difference `0` → `true`).
- `processBankReconciliation`: full pipeline exercised end-to-end — a CSV served via a `data:` URL (worked around not having a hosted file to point `fetch()` at) was parsed by `papaparse`, dates parsed by `date-fns`, and amount-matched (±0.005 tolerance) against a real `BankTransaction` row for the same account — matched correctly, `stats` counts correct.
- Missing-required-parameter error paths for all 4 functions confirmed returning `200 + {error}` with the expected message (except `batchReconcileTransactions`' deliberate `207`).
- All throwaway test rows (`BankTransaction` ×2, `BankReconciliation` ×1) cleaned up after verification; dev branch confirmed back to pre-test state.

**Manual `/dev-login` UI click-through — completed 2026-08-03:** the browser session was already authenticated (from an earlier sign-in), so this was driven directly. Flush Locks, Previous Reconciliations, and the full Reconcile → Save Reconciliation → ReconcileReport round trip were all exercised against real throwaway data and confirmed correct (see 8B.3 checklist above for full detail). This also gave `ReconcileReport.jsx` its first real click-through — untested in 8A for lack of data, now confirmed rendering a saved reconciliation correctly. `AutoReconcileModal` opens cleanly; its CSV-upload step still routes through `base44.integrations.Core.UploadFile` and wasn't exercised (pre-existing, out-of-scope gap), but `processBankReconciliation`'s own logic was already fully verified separately via a `data:`-URL CSV test.

**Bug found during manual verification (pre-existing, not introduced by 8B) — fixed and verified same day:** `src/pages/Reconcile.jsx` had both a `<tr onClick>` and a `<Checkbox onCheckedChange>` on each transaction row (and the same pattern on the header's "Select All" `<th onClick>`/`Checkbox`) calling the same toggle function — clicking the checkbox itself double-fired both handlers and netted out to a no-op, while clicking elsewhere in the row worked correctly. **Fix:** added `onClick={(e) => e.stopPropagation()}` directly on both `Checkbox` components (row-level ~line 589-593, header "Select All" ~line 567-571) — stops the click from bubbling to the ancestor `<tr>`/`<th>` handler while still letting `onCheckedChange` fire normally, and without breaking "click elsewhere in the row/label" behavior (a naive fix on the wrapping `<div>`/`<td>` would have also blocked clicks on the "Select All" text label, which was ruled out). `npx vite build` passed clean. **Verified live post-deploy** (user confirmed the fix was committed and pushed before this check) against `test.kensauto.ca`: inserted a fresh throwaway `BankTransaction`, clicked directly on the row checkbox — now correctly shows "1 of 1 selected" (previously stuck at "0 of 1"); clicked again — cleanly toggles back to "0 of 1"; clicked the header "Select All" checkbox — correctly selects all rows. Test row cleaned up after.

**Scope gap still open, unresolved:** `Bank.jsx`'s `handleTransfer` → legacy `base44.functions.invoke('transferFunds', ...)` — still not decided (10th function, or its own item). Not touched by 8B. Re-flag at 8C close if still open.
