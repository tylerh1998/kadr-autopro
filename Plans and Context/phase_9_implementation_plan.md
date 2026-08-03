# Phase 9 Implementation Plan: Accounts Payable, Suppliers, Lines of Credit, Cheques & ChartOfAccount Finish-Up

**Status:** **Approved** (2026-08-03) — Section 0's open questions resolved, ready for 9A execution to begin.
**Parent:** `master_blueprint.md`, Phase 9
**Prepared:** 2026-08-03
**Supabase project refs:** dev branch `sitihbdnuxifwibontcm` (schema changes tested here first, always); production `hbcrwkmgsazqrvsrmxyr` (applied second, after dev verification)

> **LIVE DOCUMENT.** This plan is updated in place as execution/verification surfaces new findings — do not wipe prior sections, append/annotate instead. Key learnings roll back into `master_blueprint.md` Section 7 at phase close.
>
> **Per your instruction, every sub-phase below ends with an explicit "🛑 HOLD FOR TESTING" gate.** No sub-phase's code is to be executed until the previous sub-phase's hold has been explicitly cleared by you.

---

## 0) Open Questions, Info Requirements & Suggestions

**All resolved (2026-08-03) — decisions recorded inline below. Original writeups kept for context/audit trail.**

**Decisions summary:**
- **0.1** — Port `acquireSupplierLock` as-is, no `locked_timestamp`/staleness/flush addition. Pure migration, not a UX fix.
- **0.2** — `executeSupplierPayment` folded into 9B as a 13th tracked function (necessary for a working AP payment flow).
- **0.3** — Phase 9 fixes all 3 trivial cross-domain `Supplier` reads (`InventoryPartsReturnModal.jsx`, `LankarImportReturnModal.jsx`, `OtherChargeForm.jsx`) as drive-by one-line swaps.
- **0.4** — Sub-phase split (9A → 9B → 9C → 9D) approved as drafted.

### 0.1 (original) — `acquireSupplierLock` doesn't match the established locking pattern

Direct research (2026-08-03) confirms `Supplier` locking is **not** built like `BankAccount`/`WorkOrder`/`LinesOfCredit` locking. Those three all use a **two-column pair** (`locked_by_user`/`locked_timestamp` or `LockedByUser`/`locked_timestamp`) with staleness detection and a dedicated flush/release mechanism (`flushBankLocks`, `flushWorkOrderLocks`). `Supplier` has only a bare `LockedByUser` text column — no timestamp, no staleness check, and **no `releaseSupplierLock`/`flushSupplierLocks` function exists anywhere in the codebase**. Locks are released today only by the client directly setting `LockedByUser: ''`/`null` (confirmed in `Suppliers.jsx:136` and `SupplierTx.jsx:356/970`) — there is no automatic recovery if a browser tab crashes mid-edit.

**Your call:**
- **(a)** Port `acquireSupplierLock` exactly as-is (no timestamp, no flush) — lowest-risk, preserves current (already-imperfect) behavior, no schema change.
- **(b)** Add a `locked_timestamp` column to `Supplier` and a `flushSupplierLocks` function, matching the `BankAccount` pattern — fixes a real gap but is scope growth beyond a pure transport migration.

*Recommendation: (a) for this phase — it's a pure migration, not a UX improvement project — but flagging since it's a real, user-visible gap (a crashed tab could permanently lock a supplier record with no recovery path).*

### 0.2 — `executeSupplierPayment` isn't in the blueprint's function list but is load-bearing

`processSupplierPayment` only validates and inserts a `pending` `SupplierPayment` row, then **fires-and-forgets** `base44.functions.invoke('executeSupplierPayment', ...)` — a separate function (not originally scoped) that does the actual GL posting and bank-transaction creation via an already-native Postgres RPC, `process_payment_atomic(p_payment_id, p_gl_entries, p_bank_tx)` (confirmed to exist in production, 2026-08-03). Without porting this too, a native `processSupplierPayment` would insert a payment row that never actually posts to the ledger.

**Recommendation:** Fold `executeSupplierPayment` into 9B as a 13th tracked function (necessary for a working payment flow, not optional). Flagging rather than silently expanding scope, per this project's standing convention.

### 0.3 — Three trivial `Supplier`-reading files outside Phase 9's directories

`src/components/inventory/InventoryPartsReturnModal.jsx` (line 33) and `src/components/inventory/LankarImportReturnModal.jsx` (line 183) are Phase 7 domain (already `[Tested]`/closed) but still read `Supplier` via the base44-backed `@/entities/all` import (`Supplier.filter(...)`/`Supplier.list(...)`). `src/components/setup/OtherChargeForm.jsx` (line 30) is Phase 14 domain (not started) with the same one-line pattern (`Supplier.list('name')`). All three are single-line, read-only, no-schema-risk swaps now that `Supplier` is confirmed fully native.

**Your call:**
- **(a)** Phase 9 does all three as trivial drive-by fixes (same precedent as Phase 7 absorbing `InventoryList.jsx` mid-phase) — 3 one-line changes, near-zero risk.
- **(b)** Formally carry them forward to their owning phases (Phase 7 revisit / Phase 14), keeping domain boundaries strict per the Phase 8 convention.

*Recommendation: (a) — the risk is negligible and tracking three one-line swaps as their own carry-forward items is more overhead than just fixing them.*

### 0.4 — Sub-phase split, proposed

Confirmed as proposed below (9A Foundation → 9B Suppliers/AP → 9C Lines of Credit → 9D Cheques), each ending in a hold-for-testing gate. See Section 3 for full rationale.

---

## 1) Phase Scope & Objectives

**In scope for Phase 9:**

1. **New native schema** for `LinesOfCredit` and `LinesOfCreditTransaction` (confirmed absent from production — no table exists today) and `CashFlowEntry` (same — confirmed absent).
2. **Full transport-layer cutover** of `Supplier`, `SupplierInvoiceLine`, `SupplierPayment` (all three **already native Postgres tables with real production data and RLS policies** — confirmed via direct query 2026-08-03, this is a transport-only swap, no schema work) plus the three new tables above.
3. **Project-wide transport-layer cutover of `ChartOfAccount`** — already native (131 rows, RLS confirmed), but every frontend read/write still routes through the base44-backed `@/entities/all` virtual import. Phase 8 explicitly assigned this entity's full cutover to Phase 9 regardless of which file/domain it appears in (it spans Bank, Payroll, AR, Lankar, GL pages, Setup — see 3&4/9A for the full file list). **Only the `ChartOfAccount` call lines in each file are touched** — other entities in those same files are untouched, preserving the file-disjoint boundary the earlier phases established.
4. **13 native `autopro-*` function ports** (12 originally scoped + `executeSupplierPayment`, see 0.2): `getAPSummary`, `processSupplierPayment`, `executeSupplierPayment`, `calculateSupplierPaymentBreakdown`, `getSupplierTransactions`, `acquireSupplierLock`, `saveSupplierInvoiceTransactions`, `cancelSupplierPayment`, `generateChequePDF`, `processLineOfCreditTransaction`, `cancelLineOfCreditPayment`, `calculateLineOfCreditPaymentBreakdown`, `processLineOfCreditPayment`.
5. **Cross-domain carried-forward files from Phase 8** (per its 0.2 decision): `src/components/suppliers/SupplierPaymentModal.jsx`, `src/components/lines-of-credit/LineOfCreditPaymentModal.jsx`, `src/components/inventory/ReceiveCreditModal.jsx` (bundled with the LOC portion — handles LOC + Cash Drawer refund paths), `src/components/cheques/IssuedChequesTable.jsx` — all their `BankAccount` call sites become in-scope here (transport-only, no new schema, `BankAccount` itself already native from Phase 8).
6. Preserve exact existing behavior: FIFO-style oldest-first payment-breakdown matching, independent GL posting logic in 5 of the 13 functions (does **not** touch the protected `autopro-handleInvoiceConversionGL`/`autopro-handleSupplierInvoiceLineGL`), optimistic locking semantics, cheque PDF rendering (byte/visual equivalence).

**Explicitly out of scope:**
- `GSTReturn`, `CashFlowSummary` — confirmed Phase 10 territory, untouched.
- `Bank.jsx`'s `handleTransfer` → legacy `transferFunds` — still an open Phase 8 gap, not Phase 9's to resolve.
- Any GL posting logic inside `autopro-handleInvoiceConversionGL`/`autopro-handleSupplierInvoiceLineGL` — standing project rule, never modify these.
- Full redesign of Supplier locking (see 0.1 — pending your decision, default is "port as-is").

**Target outcome:** Zero `base44.*`/`@/entities/all`-routed calls remaining for `Supplier`, `SupplierInvoiceLine`, `SupplierPayment`, `LinesOfCredit`, `LinesOfCreditTransaction`, `CashFlowEntry`, and `ChartOfAccount` anywhere in scope; all 13 legacy functions replaced with native equivalents; AP payment processing, LOC charge/payment/reversal, and cheque generation all behaviorally identical to pre-migration (GL postings balance to the cent, FIFO breakdown math unchanged).

---

## 2) Lessons Learned & Context

Pulled from `master_blueprint.md` Section 7, filtered to what's load-bearing for this phase:

- **Never trust a phase's blueprint description at face value — verify entity status directly against the database, per table.** Confirmed twice already (`Appointment` in Phase 12, `BankAccount`/`BankTransaction`/`BankReconciliation` in Phase 8); a *third* case surfaced during this plan's own research: `Supplier`/`SupplierInvoiceLine`/`SupplierPayment`/`ChartOfAccount` are **already fully native with real data**, even though the blueprint's Phase 9 description implies schema-design work across the whole domain. Only `LinesOfCredit`/`LinesOfCreditTransaction`/`CashFlowEntry` genuinely need new tables.
- **RLS enabled + zero policies = silently blocked access, no clear error.** Confirmed to have bitten Phase 1 and Phase 8's `CashDrawerAdjustment`/`DepositSlipBreakdown`. Apply the same `CREATE POLICY "Enable all operations for all users" ... USING (true) WITH CHECK (true)` pattern to the 3 new tables here, and verify via `pg_policies` count (not just `information_schema.columns`) on both dev and production.
- **`@/entities/all` and `base44.entities.X` are functionally identical** — both route through the base44 SDK (confirmed via `vite.config.js`'s comment: "Support for legacy code that imports the base44 SDK with `@/integrations`, `@/entities`, etc."). A file importing `ChartOfAccount` from `@/entities/all` is exactly as base44-dependent as one calling `base44.entities.ChartOfAccount` directly — grep for both patterns, not just literal `base44.` strings.
- **A `Promise.all` mixing a still-base44-routed call with already-migrated direct calls fails the whole batch on a dev-native session.** Recurred at least 4 times across Phases 3/7/12/13. Check every `loadData()` in this phase's files (`SupplierTx.jsx`'s `Promise.all` at line ~385 mixing `getSupplierTransactions` with `SupabaseProxy` Supplier reads is a live example) — decouple every native fetch from every still-base44 fetch into independent `try/catch` as each gets migrated, never assume "same batch, same session" is safe mid-migration.
- **Client-generated 24-char-hex IDs, not `crypto.randomUUID()` verbatim**, for entities following the base44 ID convention: `crypto.randomUUID().replace(/-/g,'').substring(0,24)` (established in Phase 8 for `CashDrawerAdjustment`/`DepositSlipBreakdown`). Confirm the new tables' `id` column type before assuming this convention applies (see 9A.1 — `Supplier`/`SupplierInvoiceLine`/`SupplierPayment` all use `text` IDs already, matching this pattern).
- **`bigint` columns reject `''`, need `null`/`0`.** `Supplier.default_gl_account`, `SupplierInvoiceLine.gl_account` are `bigint` — audit every form default before wiring a direct insert/update.
- **All native `autopro-*` functions return HTTP 200 with `{ error }` on failure** (except PDF-generating functions, where only the *error* path uses `200+{error}` — success returns raw bytes with `Content-Type: application/pdf`, exactly as established in Phase 8 for `generateDepositSlipPDF`/`generateDepositDetailReport`). `generateChequePDF` follows the identical pattern (uses `jsPDF@2.5.2` + `date-fns@3.6.0`, same as Phase 8's PDF functions).
- **Drop the `base44.auth.me()`/`createClientFromRequest` auth gate entirely when porting — don't replace it with anything.** Confirmed the established `autopro-*` pattern across Phases 5–8 relies purely on the service-role client + frontend/RLS gating.
- **Standing rule: never modify `autopro-handleInvoiceConversionGL`/`autopro-handleSupplierInvoiceLineGL`.** Five of this phase's 13 functions do their own **independent** GL posting (hardcoded account numbers `2000`=AP, `2003`=GST Paid, plus dynamic bank/LOC/GL-account fields) — this is intentional, pre-existing, separate logic that must be preserved as-is, not merged into or replaced by the two protected functions.
- **Don't use a local dev server for verification — test against `test.kensauto.ca` directly.** (Multiple phases.)
- **`/dev-login` only creates a Supabase auth session, not a Base44 SDK session** — anything still base44-routed 401s under it. This phase's own `ChartOfAccount` cutover (9A) directly un-blocks the GL-Account-dependent dropdowns that Phase 8 flagged as broken under dev-login (`BankTransactionModal.jsx`, `CashDrawerAdjustmentModal.jsx`, `BankAccountEditModal.jsx` all read `ChartOfAccount`) — worth re-verifying those Phase 8 flows once 9A lands, even though they're not this phase's own scope.
- **Two files can share an identical name in different folders / two files can have near-identical import lists — always read the actual file, not just its import line.** (Multiple phases.) Relevant here: `src/components/cash-drawer/DepositDetailsModal.jsx` vs `src/components/bank/DepositDetailsModal.jsx` are unrelated to this phase but exemplify the pattern; within this phase, `ReceiveCreditModal.jsx` imports `ChartOfAccount, LinesOfCredit, LinesOfCreditTransaction` together — all three need conversion, in the same file, in the same pass.
- **Multi-agent coexistence:** the uncommitted working-tree changes across `src/components/suppliers/*`, `src/pages/Suppliers.jsx`, `src/pages/SupplierTx*.jsx`, `src/pages/ChequeWriter.jsx`/`ChequeRegister.jsx` at the time this plan was drafted are a **separate, unrelated Antigravity-agent dark-mode initiative** (its own blueprint, Phase 1 "Supplier & AP Pages") — purely CSS class additions (`dark:bg-slate-900` etc.), zero entity/logic changes. Confirmed via diff inspection, 2026-08-03. No conflict with this phase's scope, but re-diff before starting execution in case that work has progressed further by then.

---

## 3 & 4) Phase 9 Roadmap — Sub-Phase Breakdown

### Why split into sub-phases (and why this order)

Real financial/ledger logic (AP payments, LOC charges/payments/reversals, GL postings) where correctness matters more than speed — same rationale as Phases 7 and 8. The true footprint (2 new tables + 1 new-schema-adjacent table, ~20 in-scope files, 13 legacy functions) is too large for one atomic unit.

**9A goes first** because it unblocks everything else: the 3 new tables must exist before any LOC function/frontend work (9C) can proceed, and the `ChartOfAccount` project-wide cutover is both fully independent (no schema risk — already native) and directly removes a dev-login testing blocker that would otherwise obstruct 9B/9C's own verification (GL-Account dropdowns in `SupplierForm.jsx`, `LinesOfCreditEditModal.jsx`, `LineOfCreditTransactionModal.jsx`, `ReceiveCreditModal.jsx` all read `ChartOfAccount`).

**9B (Suppliers/AP) before 9C (Lines of Credit)** because `SupplierPaymentModal.jsx` already reads `LinesOfCredit` (for the "pay from LOC" option) but the reverse dependency is weaker — sequencing AP first means 9C's LOC payment-processing work can reuse 9B's already-proven supplier-payment patterns (breakdown calculation, atomic-RPC-backed execution).

**9D (Cheques) goes last** because both `IssuedChequesTable.jsx` and `ChequeWriter.jsx` are pure **consumers** of `SupplierPayment` records created by 9B's `processSupplierPayment`/`executeSupplierPayment` — testing cheque display/PDF generation is far more meaningful once real native supplier-payment data exists to point at.

### Sub-phase status tracker

| Sub-phase | Scope | Status | Depends on |
|---|---|---|---|
| **9A** | Schema (`LinesOfCredit`/`LinesOfCreditTransaction`/`CashFlowEntry`) + project-wide `ChartOfAccount` transport cutover | **[Tested]** — verified 2026-08-03 | None — start here |
| **9B** | Suppliers & AP core: `Supplier`/`SupplierInvoiceLine`/`SupplierPayment`/`CashFlowEntry` transport cutover + 8 native functions | Detailed plan ready, execution not started | **9A** (needs `CashFlowEntry` schema + `ChartOfAccount` cutover for `SupplierForm.jsx`) — cleared |
| **9C** | Lines of Credit: `LinesOfCredit`/`LinesOfCreditTransaction` transport cutover + 4 native functions + `ReceiveCreditModal.jsx` | Not Started | **9A** (needs LOC schema); benefits from **9B** (shared payment-breakdown pattern) |
| **9D** | Cheques: `IssuedChequesTable.jsx`, `ChequeWriter.jsx` + `generateChequePDF` port | Not Started | **9B** (reads `SupplierPayment` data created there) |

---

## 9A) SUB-PHASE A: Foundation — New Schema & ChartOfAccount Cutover

### 9A.1) Schema — `LinesOfCredit`, `LinesOfCreditTransaction`, `CashFlowEntry`

**Updated 2026-08-03 — you created all 3 tables directly on the dev branch (`sitihbdnuxifwibontcm`) since this plan was first drafted.** Confirmed via direct query: schema exists there with **real seeded data already** (`LinesOfCredit`: 3 rows, `LinesOfCreditTransaction`: 303 rows, `CashFlowEntry`: 5 rows) — a genuine head start for 9B/9C verification, not just throwaway test rows. **Production still has none of these three tables** (confirmed absent via `information_schema.columns`/`pg_class`, 2026-08-03) — this sub-phase's real schema work is entirely on the production side now.

**Confirmed dev-branch schema (2026-08-03, `information_schema.columns`) — this plan's original drafted DDL is superseded by what you actually built; several column types differ from the `.jsonc` defaults and must be matched exactly, not redesigned:**

| Table.Column | Actual type (dev) | Note |
|---|---|---|
| `LinesOfCredit.credit_limit` | `bigint` | Not `numeric` — whole-dollar limits only, matches this project's other `bigint`-for-money-with-no-cents columns (e.g. `ChartOfAccount.account_number`). |
| `LinesOfCredit.gl_account` | `bigint` | Not `text` — matches `ChartOfAccount.account_number`'s type, so joins/comparisons against GL account numbers stay type-consistent. |
| `LinesOfCredit.locked_timestamp` | `text` | Not `timestamp with time zone` — differs from `BankAccount`'s real timestamp column; preserve as `text`, don't "fix" the type without being asked. |
| `LinesOfCreditTransaction.transaction_date` | `text` | Not `date`. |
| `LinesOfCreditTransaction.balance` | `text` | Not numeric — **frontend/function code must `parseFloat()` this before any arithmetic**, it will not behave as a number by default. |
| `CashFlowEntry.due_date` / `date_paid` | `text` | Not `date`. |
| `CashFlowEntry.sort_order` | `bigint` | Not `numeric`. |
| All other columns | Match this plan's originally-drafted types (see the `.jsonc` mapping in the prior version of this section) | Unchanged. |

**Constraints confirmed on dev (2026-08-03):** `LinesOfCreditTransaction.line_of_credit_id` has a real **foreign key** to `LinesOfCredit(id)` (`ON UPDATE CASCADE ON DELETE RESTRICT`) — a LOC account **cannot** be deleted while transactions reference it; the frontend/function code doesn't need to enforce this itself, Postgres already will (a delete attempt will error, not silently orphan rows). `CashFlowEntry` has no FK (matches its `.jsonc` — loosely-linked tracking sheet, not a strict relation). All three tables use `id text PRIMARY KEY` with no default — client-generated 24-char-hex IDs required for inserts, same convention as `Supplier`/`SupplierInvoiceLine`/`SupplierPayment`.

**The RLS trap (Phase 1/Phase 8's recurring gotcha) is confirmed present here too, exactly as expected:** all 3 dev tables have RLS **enabled** but **zero rows in `pg_policies`** (confirmed via `pg_class`/`pg_policies` join, 2026-08-03) — every `supabase.from()` call against them will silently return empty/blocked results **right now, before any frontend code changes happen.** First action of 9A execution: apply the `CREATE POLICY` statements below to dev immediately.

New migration file `supabase/migrations/<timestamp>_loc_cashflow_tables.sql`, matching the **actual dev-branch schema above** (not the originally-drafted types), `CREATE TABLE IF NOT EXISTS` for idempotency against dev (where the tables already exist) while still being a genuinely fresh `CREATE TABLE` on production:

```sql
CREATE TABLE IF NOT EXISTS "LinesOfCredit" (
  id text PRIMARY KEY,
  name text NOT NULL,
  institution_name text NOT NULL,
  account_number text,
  credit_limit bigint NOT NULL,
  current_balance double precision DEFAULT 0,
  available_credit double precision DEFAULT 0,
  interest_rate double precision DEFAULT 0,
  gl_account bigint,
  is_active boolean DEFAULT true,
  notes text,
  last_recalculated_date timestamp with time zone,
  locked_by_user text,
  locked_timestamp text,
  created_date timestamp with time zone,
  updated_date timestamp with time zone,
  created_by text,
  created_by_id text,
  is_sample boolean
);

CREATE TABLE IF NOT EXISTS "LinesOfCreditTransaction" (
  id text PRIMARY KEY,
  line_of_credit_id text NOT NULL REFERENCES "LinesOfCredit"(id) ON UPDATE CASCADE ON DELETE RESTRICT,
  transaction_date text NOT NULL,
  description text NOT NULL,
  reference text,
  charge_amount double precision DEFAULT 0,
  credit_amount double precision DEFAULT 0,
  payment_amount double precision DEFAULT 0,
  balance text,
  source_type text,
  source_id text,
  payment_applied_data text,
  is_reversed boolean DEFAULT false,
  reversed_by_id text,
  created_date timestamp with time zone,
  updated_date timestamp with time zone,
  created_by text,
  created_by_id text,
  is_sample boolean
);

CREATE TABLE IF NOT EXISTS "CashFlowEntry" (
  id text PRIMARY KEY,
  supplier_id text,
  loc_id text,
  supplier text,
  amount double precision,
  amount_paid double precision DEFAULT 0,
  due_date text,
  date_paid text,
  chq_number text,
  method text,
  comment text,
  bg_colour text,
  row_status text,
  sort_order bigint DEFAULT 0,
  created_date timestamp with time zone,
  updated_date timestamp with time zone,
  created_by text,
  created_by_id text,
  is_sample boolean
);

-- RLS: apply to dev FIRST (tables already exist there, RLS enabled, zero policies — confirmed
-- 2026-08-03) before any frontend/function work touches them; then apply full migration to production.
ALTER TABLE "LinesOfCredit" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Enable all operations for all users" ON "LinesOfCredit"
  FOR ALL TO public USING (true) WITH CHECK (true);

ALTER TABLE "LinesOfCreditTransaction" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Enable all operations for all users" ON "LinesOfCreditTransaction"
  FOR ALL TO public USING (true) WITH CHECK (true);

ALTER TABLE "CashFlowEntry" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Enable all operations for all users" ON "CashFlowEntry"
  FOR ALL TO public USING (true) WITH CHECK (true);
```

- **On dev:** only the RLS block actually needs to run (tables/columns/FK already exist exactly as above) — the `CREATE TABLE IF NOT EXISTS` statements are no-ops there.
- **On production:** this is a genuinely fresh `CREATE TABLE` for all 3 tables (confirmed absent, 2026-08-03) — run the full migration (tables + FK + RLS enable + policy) as one tracked file.
- Every write path (functions and frontend) must `parseFloat()` `LinesOfCreditTransaction.balance` before doing arithmetic on it, since it's `text`, not numeric, on this database — a silent string-concatenation bug risk if missed (matches the project's standing "cast before arithmetic" rule, Risk #9).
- `LinesOfCredit.locked_by_user`/`locked_timestamp` already match the `BankAccount`-style two-column locking pattern (values just happen to be typed `text` rather than `timestamptz` for the timestamp) — no locking-design decision needed for LOC (unlike Supplier, see 0.1).

### 9A.2) `ChartOfAccount` — project-wide transport cutover

Every file below has **exactly one concern to fix**: swap `ChartOfAccount.method()` (via `@/entities/all`) or `base44.entities.ChartOfAccount.method()` for `supabase.from('ChartOfAccount')...` — leave every other entity/import in these files untouched (they belong to other phases/domains).

| File | Current call | Notes |
|---|---|---|
| `src/pages/ChartOfAccounts.jsx` | `ChartOfAccount.list('account_number')`, `.update()`, `.create()` | The actual CRUD admin page — full read/write conversion. |
| `src/pages/Bank.jsx` | `ChartOfAccount.list()` | Read-only dropdown source. |
| `src/pages/GeneralLedger.jsx` | import only (verify no unused-import removal needed elsewhere in file) | Confirm actual usage before touching. |
| `src/pages/JournalEntries.jsx` | `ChartOfAccount.filter({is_active:true}, 'account_number')` | Read-only. |
| `src/pages/GLAcct.jsx` | `ChartOfAccount.filter({account_number: accountNumber})` | Read-only, single-account lookup. |
| `src/pages/GLJournal.jsx` | `base44.entities.ChartOfAccount.list()` | Direct base44.entities form (not `@/entities/all`) — same fix. |
| `src/components/bank/BankTransactionModal.jsx` | `ChartOfAccount.filter({is_active:true}, 'account_number')` | Read-only. |
| `src/components/bank/BankAccountEditModal.jsx` | `ChartOfAccount.filter({account_type:'Asset'}, 'account_number')` | Read-only. |
| `src/components/cash-drawer/CashDrawerAdjustmentModal.jsx` | `ChartOfAccount.filter({is_active:true})` | Read-only. |
| `src/components/ar/RecordAdjustmentModal.jsx` | `ChartOfAccount.filter({is_active:true}, 'account_number')` | Read-only. |
| `src/components/payroll/AddAdjustmentModal.jsx` | `ChartOfAccount.list('account_number')` | Read-only. |
| `src/components/setup/OtherChargesManager.jsx` | `ChartOfAccount.list()` (in a `Promise.all` with `OtherChargeList` — **check that entity's migration status before assuming this `Promise.all` is decoupled**) | Read-only. |
| `src/components/lankar/LegacyWorkOrderImportModal.jsx` | `ChartOfAccount.list()` | Read-only. |
| `src/components/suppliers/SupplierForm.jsx` | `base44.entities.ChartOfAccount.list('account_number', 1000)` | **In 9B's own file list too** — do this specific line here in 9A so 9B doesn't need to touch `ChartOfAccount` at all, only `Supplier`. |
| `src/components/lines-of-credit/LinesOfCreditEditModal.jsx` | `ChartOfAccount.filter({account_type:'Liability'}, 'account_number')` | **In 9C's file list too** — same reasoning, do the `ChartOfAccount` line here. |
| `src/components/lines-of-credit/LineOfCreditTransactionModal.jsx` | `ChartOfAccount.filter({is_active:true}, 'account_number')` | **In 9C's file list too** — same reasoning. |
| `src/components/inventory/ReceiveCreditModal.jsx` | `ChartOfAccount.list('account_number')` | **In 9C's file list too** (bundled there) — same reasoning, only the `ChartOfAccount` line here; `LinesOfCredit`/`LinesOfCreditTransaction` lines in this same file wait for 9C. |

**Rationale for pre-touching lines in files owned by later sub-phases:** every one of these is a single, self-contained `ChartOfAccount`-only line with zero interaction with the same file's other (later-phase) entities. Doing all `ChartOfAccount` conversions in one pass in 9A avoids a second partial edit to the same file in 9B/9C, and immediately restores GL-Account dropdown functionality under `/dev-login` testing for every one of these forms.

### 9A.3) Task List

- [x] Apply the RLS `ENABLE`/`CREATE POLICY` statements to the dev branch (tables/columns/FK already exist there — confirmed 2026-08-03 — only the policy gap needs fixing); verify `pg_policies` count > 0 for all 3 tables.
- [x] Apply the full `supabase/migrations/<timestamp>_loc_cashflow_tables.sql` (tables + FK + RLS) to production as a genuinely fresh `CREATE TABLE`; verify columns + FK + RLS policy count via SQL match dev exactly. — Tracked as `supabase/migrations/20260806000000_loc_cashflow_tables.sql`.
- [x] Convert all 16 files in the 9A.2 table — `ChartOfAccount` lines only. — `OtherChargesManager.jsx` additionally required decoupling its `Promise.all` (was mixing native `ChartOfAccount` with still-base44 `OtherChargeList`, per Section 2's standing lesson) into two independent try/catch blocks.
- [x] Repo-wide grep confirms zero remaining `ChartOfAccount` references via `base44.entities`/`@/entities/all` anywhere in `src/`.
- [x] `npx vite build` passes clean.

### 9A.4) Verification Checklist

- [x] Dev branch: `pg_policies` shows 1 policy per table (schema itself already confirmed matching, 2026-08-03 — this checklist item is really just confirming the RLS fix landed).
- [x] Production: fresh `CREATE TABLE` + FK + RLS applied; columns/FK/policy count all verified matching dev exactly (57 columns each side, FK confirmed via `pg_constraint`, 1 policy per table each side).
- [x] Dev's existing real data (3 `LinesOfCredit`, 303 `LinesOfCreditTransaction`, 5 `CashFlowEntry` rows) survived the RLS-policy migration untouched — spot-check row counts before/after. — Confirmed identical row counts post-migration.
- [x] `ChartOfAccounts.jsx` page: list loads, create/edit an account round-trips correctly against the native table. — **Confirmed by you, 2026-08-03.**
- [x] Spot-check 3–4 of the read-only dropdown files (`BankTransactionModal.jsx`, `SupplierForm.jsx`, `LinesOfCreditEditModal.jsx`) via `/dev-login` on `test.kensauto.ca` — GL Account dropdowns populate. — **Confirmed by you, 2026-08-03.**
- [x] Repo-wide grep: zero remaining `ChartOfAccount` base44/`@/entities/all` references.
- [x] `npx vite build` clean.

**✅ 9A CLEARED — verified and 100% complete, 2026-08-03. 9B is now active.**

---

## 9B) SUB-PHASE B: Suppliers & Accounts Payable Core

> **Handoff from 9A (cleared 2026-08-03):** `LinesOfCredit`/`LinesOfCreditTransaction`/`CashFlowEntry` schema live on both branches with RLS policies confirmed; `ChartOfAccount` fully native everywhere, including `SupplierForm.jsx`'s line. `Supplier`/`SupplierInvoiceLine`/`SupplierPayment`/`CashFlowEntry` re-confirmed at 1 RLS policy each on production going into 9B — no schema/RLS blockers remain for this sub-phase.
>
> **Refinement to Section 2's user-attribution lesson, confirmed by reading an already-shipped native function (`autopro-processInventoryReceipt`):** "drop the base44 auth gate, don't replace it with anything" is slightly imprecise — the established pattern actually **does** resolve a user for `created_by`/`created_by_id` attribution, just via the Supabase Auth JWT instead of base44: extract the `Authorization` header, call `supabaseAuth.auth.getUser(token)`, and fall back to `{ email: 'System', id: null }` if absent/invalid. What's dropped is the **blocking** `if (!user) return 401` gate, not user resolution itself. Every 9B port needing `created_by`/`updated_by`/`creatorName` (`processSupplierPayment`, `saveSupplierInvoiceTransactions`, `cancelSupplierPayment`) uses this exact pattern.

### 9B.1) Transport-layer cutover — file-by-file

Re-read against current on-disk state 2026-08-03 (not the pre-9A draft's assumptions) — exact call sites confirmed below.

| File | Confirmed current calls | Conversion notes |
|---|---|---|
| `src/pages/Suppliers.jsx` | `base44.functions.invoke('SupabaseProxy', {action:'read'/'create'/'update', table:'Supplier', ...})` — list load, create, update, and the bulk `handleFlushLocks` (reads all, updates each locked one). | Straight swap to `supabase.from('Supplier').select()/.insert()/.update()`. `handleFlushLocks`'s `Promise.all` of individual updates can stay as native `Promise.all` (no mixed-source risk, everything's the same table). |
| `src/pages/SupplierTx.jsx` | `base44.entities.LinesOfCredit.list()` (sourceMap for LOC-sourced payments); `base44.functions.invoke('acquireSupplierLock', ...)`; `base44.functions.invoke('SupabaseProxy', {action:'read'/'update', table:'Supplier', ...})` in `releaseLock`; **`Promise.all([getSupplierTransactions, SupabaseProxy Supplier read])`** in `loadData` (~line 385); `base44.functions.invoke('saveSupplierInvoiceTransactions', ...)`; `base44.functions.invoke('cancelSupplierPayment', ...)`. | Convert `LinesOfCredit.list()` and the `releaseLock` Supplier read/update to direct `supabase.from()`. **Convert the `loadData` `Promise.all`'s two calls in the same edit** (swap `getSupplierTransactions`/`saveSupplierInvoiceTransactions`/`cancelSupplierPayment`/`acquireSupplierLock` invokes to `autopro-*`, and the Supplier read to native `supabase.from`) — doing all of it atomically sidesteps the mixed-source `Promise.all` trap entirely rather than requiring a decouple-then-reconverge two-step. |
| `src/pages/SupplierTxView.jsx` | `base44.functions.invoke('getSupplierTransactions', ...)` — single call, read-only view. | → `supabase.functions.invoke('autopro-getSupplierTransactions', {body:...})`. No `Promise.all`, no decoupling risk. |
| `src/components/suppliers/APSummaryTable.jsx` | **`Promise.all([getAPSummary, CashFlowEntry.list(), LinesOfCredit.filter({is_active:true})])`** in `loadData`; separate `base44.entities.CashFlowEntry.list()` in `handleCashFlowAdded`. | All three `Promise.all` members are being converted in this same sub-phase (`getAPSummary`→native function, `CashFlowEntry`→native table from 9A, `LinesOfCredit`→native table from 9A) — **convert all three together in one edit and the `Promise.all` never has a mixed-source moment**, same pattern as `SupplierTx.jsx` above. |
| `src/components/suppliers/AddToSheetModal.jsx` | `base44.entities.CashFlowEntry.create(...)`. | → `supabase.from('CashFlowEntry').insert(...)` with client-generated 24-char id + `created_date`/`updated_date`. |
| `src/components/suppliers/SupplierPaymentModal.jsx` | **`Promise.all([SupabaseProxy BankAccount list, LinesOfCredit.filter({is_active:true})])`** in `loadData`; `LinesOfCredit.get(...)` (LOC lock check in `handleSubmit`); `SupabaseProxy` BankAccount read (bank lock check); `processSupplierPayment` invoke; `calculateSupplierPaymentBreakdown` invoke; `CashFlowEntry.list('-sort_order',1)` + `.create(...)` (cheque auto-add-to-sheet); a 2-second polling loop's `SupabaseProxy` `SupplierPayment` read. | `BankAccount` is the Phase-8 carry-forward item (plan Section 1.5) — convert alongside `LinesOfCredit` in the same `Promise.all` edit for the same mixed-source-avoidance reason. Convert the polling-loop read to a direct `supabase.from('SupplierPayment').select().eq('id', paymentId)` — this one polls every 2s, so it's worth confirming no RLS surprises under `/dev-login` specifically (anon-key path, not service-role). |
| `src/components/cheques/IssuedChequesTable.jsx` | `Promise.all([SupabaseProxy SupplierPayment read (filtered payment_method:'Cheque'), SupabaseProxy Supplier read, SupabaseProxy BankAccount list])`; separate `SupabaseProxy` `SupplierPayment` update (`handleUpdateNote`). | Convert all three `Promise.all` members together (`SupplierPayment`/`Supplier` are 9B-native scope, `BankAccount` is the Phase-8/9D carry-forward — bundling it here per the original plan's explicit call avoids a second edit to this file in 9D). **9D only re-verifies this file, does not edit it**, per the existing 9D handoff note below. |

*(`GLAccountCombobox.jsx`, `SupplierCombobox.jsx`, `LineEditModal.jsx`, `SupplierTxInvoiceLinesTab.jsx`, `SupplierTxInvoiceSummaryTab.jsx`, `SupplierTxPaymentHistoryTab.jsx` confirmed to have zero entity/base44 calls — presentational/prop-driven only, no changes needed.)*

**0.3's three trivial cross-domain `Supplier` reads (confirmed exact lines 2026-08-03, option (a) approved):**

| File | Confirmed line |
|---|---|
| `src/components/inventory/InventoryPartsReturnModal.jsx:33` | `const supplierData = await Supplier.filter({ is_active: true });` |
| `src/components/inventory/LankarImportReturnModal.jsx:183` | `const suppliersData = await Supplier.filter({ inventory_supplier: true }, 'name');` |
| `src/components/setup/OtherChargeForm.jsx:30` | `const suppliersData = await Supplier.list('name');` |

Each is a single-line, read-only, drive-by swap to `supabase.from('Supplier')...` — no other logic in these files changes.

### 9B.2) Native function ports (8 total, corrected count — see handoff note above)

All 8 legacy sources read in full from `base44/functions/<name>/entry.ts` 2026-08-03. Established pattern confirmed from `supabase/functions/autopro-processInventoryReceipt/index.ts`: `SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY` (not the legacy `Supabase_project_url`/`Supabase_Secret_Key` names), drop the blocking auth gate but resolve `user` via the Auth-header/`getUser()` pattern (fallback `{email:'System', id:null}`) wherever attribution is needed, `200 + {error}` on failure.

- **`autopro-getAPSummary`** — thin passthrough to `get_ap_summary_data` RPC (already native) + `Math.abs(current_balance) > 0.01` filter. No base44 entity calls at all in the legacy source beyond the auth gate — lowest-risk port in this sub-phase, essentially just delete 6 lines and swap 2 env var names.
- **`autopro-acquireSupplierLock`** — legacy source is **already pure `supabase-js`** (single atomic conditional `UPDATE Supplier SET LockedByUser=<email> WHERE LockedByUser IS NULL OR ='' OR =<email>`, `.select().maybeSingle()`, branches on whether a row came back). Only the auth gate needs dropping; user resolution needed here too (for the email written into `LockedByUser` and returned in the response).
- **`autopro-calculateSupplierPaymentBreakdown`** — legacy source is **already pure `supabase-js`**, reads `SupplierInvoiceLine` directly, no writes. FIFO oldest-first algorithm (positive-payment vs. negative-payment/refund branches, `0.005` tolerance, unapplied-remainder handling) is fully self-contained in the function body — port byte-for-byte, only the auth gate + env var names change. No user attribution needed (read-only).
- **`autopro-saveSupplierInvoiceTransactions`** — legacy source is **already pure `supabase-js` end-to-end** (`Supplier`, `ChartOfAccount`, `SupplierInvoiceLine`, `GLTransaction`, `SupplierPayment` all via direct `supabase.from()` already, since it long ago stopped using base44 entities for its actual work). The 4 ordered phases (deletions with `paid_amount!==0` guard/skip, additions, modifications with GL-relevant-change detection via field-diffing, payment reallocation across all of a supplier's existing payments when any line amount changed) post independent GL entries (`2000`=AP, `2003`=GST Paid, dynamic `gl_account`) via the exact reversal-then-repost pattern for edits. Uses `getCurrentMountainTimeISO()` — a genuine double-parse quirk (`new Date(new Date().toLocaleString('en-US',{timeZone:...})).toISOString()`, which silently reinterprets the localized string in the *server's* local timezone, not Mountain — a latent bug, not something 9A/9B introduces). **Port faithfully, do not silently fix** — flagging again here per Section 2's standing note. Needs user resolution for `created_by`/`updated_by`.
- **`autopro-cancelSupplierPayment`** — legacy source uses `base44.asServiceRole.entities.FiscalPeriod.filter({})`, `.LinesOfCreditTransaction.filter/delete`, `.LinesOfCredit.get`, and `.functions.invoke('calculateBankBalances', ...)` — **all four have already-native equivalents**: `FiscalPeriod` (direct `supabase.from`, service-role bypasses its production RLS gap — see handoff note), `LinesOfCredit`/`LinesOfCreditTransaction` (native from 9A), `calculateBankBalances` → `autopro-calculateBankBalances` (deployed, Phase 8). Fiscal-period-closed gate → branch on `payment_method` to find/validate (reject if `cleared`/`reconciled`)/delete the linked `BankTransaction` or `LinesOfCreditTransaction` → reverse `paid_amount` across affected `SupplierInvoiceLine`s (handles both "On Account" reversal by most-recent-first and specific-invoice reversal, batched updates of 100) → resolve credit account (bank or LOC `gl_account`) → insert 2-row GL reversal → delete the `SupplierPayment` → trigger `autopro-calculateBankBalances` if bank-sourced. Needs user resolution for the GL reversal's `creatorName`.
- **`autopro-getSupplierTransactions`** — legacy source's only base44 dependency (besides the auth gate) is `base44.asServiceRole.entities.ChartOfAccount.list('', 1000)` inside a `Promise.all` with 3 already-native calls (`SupplierPayment` select, `get_supplier_transactions_optimized` RPC, `BankAccount` select for the name-lookup map). Swap that one call to `supabase.from('ChartOfAccount').select('*').limit(1000)` and the `Promise.all` stays safe (everything native in the same batch). No user resolution needed (read-only aggregator).
- **`autopro-processSupplierPayment`** — legacy source is **already pure `supabase-js`** for its own work (Supplier existence check, `SupplierPayment` insert with `status:'pending'`, `apply_supplier_invoice_line_paid_updates` RPC call, rollback-delete on RPC failure) — the only base44 usage is the auth gate **and** the fire-and-forget `base44.functions.invoke('executeSupplierPayment', {paymentId})` at the end, which becomes `supabase.functions.invoke('autopro-executeSupplierPayment', {body:{paymentId}}).catch(...)` (still fire-and-forget, still logs invoke failure without blocking the response). Needs user resolution for `created_by`/`created_by_id` on the payment row.
- **`autopro-executeSupplierPayment`** — legacy source's only base44 dependency beyond the auth gate is `base44.asServiceRole.entities.LinesOfCreditTransaction.filter/create` (inside `ensureLocMirrorTransaction`, LOC-payment-only) and `.LinesOfCredit.get` (to resolve `sourceGlAccount` for LOC-sourced payments) — both native from 9A, mechanical swap. Everything else (fetch payment/supplier, resolve `BankAccount.gl_account` or LOC `gl_account`, build the 2-row GL entry pair, call `process_payment_atomic` RPC, bump `BankAccount.next_cheque_number` for cheque payments) is already `supabase-js`. **This function does not build new GL logic — it already delegates to the native `process_payment_atomic` RPC; the port is pure orchestration, no business-logic risk.** No user resolution needed (system-invoked, fire-and-forget target, not user-attributed).

### 9B.3) Task List

- [x] All 8 functions ported, deployed to dev, verified via curl (success + `200+{error}` paths) — `autopro-getAPSummary`, `autopro-acquireSupplierLock`, `autopro-calculateSupplierPaymentBreakdown`, `autopro-saveSupplierInvoiceTransactions`, `autopro-cancelSupplierPayment`, `autopro-getSupplierTransactions`, `autopro-processSupplierPayment`, `autopro-executeSupplierPayment`.
- [x] All frontend call sites converted per the 9B.1 table (7 files) + the 3 drive-by `Supplier` reads.
- [x] Every `Promise.all` flagged in 9B.1 (`SupplierTx.jsx` `loadData`, `APSummaryTable.jsx` `loadData`, `SupplierPaymentModal.jsx` `loadData`, `IssuedChequesTable.jsx` `loadData`) converted as a single atomic edit, not split across separate passes.
- [x] Repo-wide grep: zero remaining `SupabaseProxy`/base44 references for `Supplier`/`SupplierInvoiceLine`/`SupplierPayment`/`CashFlowEntry` in 9B-scoped files.
- [x] `npx vite build` clean.
- [x] Apply same functions to production after dev verification. — All 8 deployed to `hbcrwkmgsazqrvsrmxyr`, confirmed `status: ACTIVE`.

### 9B.4) Verification Checklist

- [ ] `Suppliers.jsx`: list loads, create/edit/lock-release/flush-locks round-trip correctly (verify via SQL, not just UI).
- [ ] `SupplierTx.jsx`: lock acquire/release, invoice line add/edit/delete (with GL posting verified via `GLTransaction` SQL read — balanced debit/credit), payment breakdown calculation matches expected FIFO output on a throwaway multi-invoice test supplier.
- [ ] A full throwaway supplier payment processed end-to-end: `processSupplierPayment` → `executeSupplierPayment` → confirm `SupplierPayment.status` reaches `completed`, `GLTransaction` rows balance, `BankTransaction` (if bank-sourced) created correctly, `SupplierInvoiceLine.paid_amount` updated correctly. Also test a Line-of-Credit-sourced payment specifically (confirm the mirror `LinesOfCreditTransaction` is created). Clean up test rows after.
- [ ] `cancelSupplierPayment` reverses the above test payment correctly — GL reversal balances, `SupplierInvoiceLine.paid_amount` restored, linked `BankTransaction`/`LinesOfCreditTransaction` deleted. Also confirm the fiscal-period-closed gate actually blocks a cancel attempt dated in a closed period (don't just assume the `FiscalPeriod` service-role read works — verify it live).
- [ ] `APSummaryTable.jsx`/`AddToSheetModal.jsx`: CashFlowEntry create/list round-trips against the native table; confirm the `Promise.all` in `loadData` doesn't silently fail now that all 3 members are native.
- [ ] `IssuedChequesTable.jsx`: loads correctly with all 3 `Promise.all` members native; note-editing round-trips.
- [ ] Repo-wide grep clean; `npx vite build` clean.

**🛑 HOLD FOR TESTING — do not start 9C until you've confirmed the above and given the go-ahead.**

---

## 9C) SUB-PHASE C: Lines of Credit

> **Handoff from 9B (once cleared):** `Supplier`/`SupplierInvoiceLine`/`SupplierPayment` fully native; payment-breakdown and atomic-GL-posting patterns proven working.
>
> **Real data available on dev, not just throwaway rows:** the dev branch already has 3 `LinesOfCredit` accounts and 303 `LinesOfCreditTransaction` rows (seeded by you before this plan's execution began) — prefer verifying reads/list views against this real data first, and reserve throwaway insert/update/delete test rows for anything that mutates state (matching the established "clean up after" pattern from Phases 7/8).

### 9C.1) Transport-layer cutover — file-by-file

| File | Entities/calls to convert |
|---|---|
| `src/pages/LinesOfCredit.jsx` | Full `LinesOfCredit`/`LinesOfCreditTransaction` CRUD — the main LOC accounts admin page. |
| `src/components/lines-of-credit/LinesOfCreditEditModal.jsx` | `LinesOfCredit` create/update. (`ChartOfAccount` line already done in 9A.) |
| `src/components/lines-of-credit/LineOfCreditTransactionModal.jsx` | `LinesOfCredit`, `GLTransaction` (already native — confirm no change needed beyond import cleanup), `processLineOfCreditTransaction` → `autopro-processLineOfCreditTransaction`. (`ChartOfAccount` line already done in 9A.) |
| `src/components/lines-of-credit/LineOfCreditPaymentModal.jsx` | `BankAccount` via `SupabaseProxy` (**carried forward from Phase 8**), `calculateLineOfCreditPaymentBreakdown` → `autopro-calculateLineOfCreditPaymentBreakdown`, `processLineOfCreditPayment` → `autopro-processLineOfCreditPayment`. |
| `src/components/lines-of-credit/PaymentTransactionItem.jsx` | `cancelLineOfCreditPayment` → `autopro-cancelLineOfCreditPayment`. |
| `src/components/lines-of-credit/LOCReconciliationModal.jsx` | `LinesOfCredit.get()`, `LinesOfCreditTransaction.filter()` — **no server-function port needed**, this modal does its own client-side CSV parsing/matching (mirrors the Bank domain's `AutoReconcileModal` pattern but implemented entirely in-browser). |
| `src/components/inventory/ReceiveCreditModal.jsx` | `LinesOfCredit.filter()`/`.update()`, `LinesOfCreditTransaction.create()` (**carried forward from Phase 8**, bundled here per that phase's explicit decision). Also creates `SupplierInvoiceLine` rows and direct `GLTransaction` inserts via `SupabaseProxy` when refunding to Supplier AP or Cash Drawer — **these entities are already native from 9B/Phase 8, convert them here too since the file is already being touched.** (`ChartOfAccount` line already done in 9A.) |

### 9C.2) Native function ports (4)

- **`autopro-processLineOfCreditTransaction`** — 3-branch port (create/edit/delete) exactly as researched: fiscal-period gate → reverse old GL effect (delete by `source_id`) → recompute `LinesOfCredit.current_balance`/`available_credit` → insert new GL pair (debit `offset_gl_account`/credit `gl_account` for a charge, reversed for a credit). Preserve the create/edit/delete-specific balance math exactly (edit reverses-then-reapplies, delete just reverses).
- **`autopro-calculateLineOfCreditPaymentBreakdown`** — port the oldest-first matching algorithm (outstanding-transaction filter, `0.00001` tolerance, credits-settle-first-then-charges-in-date-order) byte-for-byte. Read-only.
- **`autopro-processLineOfCreditPayment`** — fiscal gate → resolve target LOC + source (bank or another LOC) → apply `applied_charges[]` additively to individual `LinesOfCreditTransaction.payment_amount` → create the informational payment record (`payment_applied_data` JSON audit trail) → source-side effect (bank debit + `calculateBankBalances`, or mirrored LOC charge + balance update) → insert 2-row GL pair.
- **`autopro-cancelLineOfCreditPayment`** — validate cancellable (`source_type==='payment_made'`, not already reversed) + fiscal gate → un-apply `payment_applied_data` from referenced charge txs → determine original source (bank tx first, then cross-LOC charge) → create reversal LOC tx + cross-link `is_reversed`/`reversed_by_id` both directions → reverse `BankTransaction` (or mirrored LOC credit) → reverse GL rows (mirror-swap found rows, or manual 2-row fallback) → `calculateBankBalances` if bank-sourced.

### 9C.3) Task List

- [ ] All 4 functions ported, deployed to dev, verified via curl.
- [ ] All 6 frontend files converted (table above).
- [ ] Repo-wide grep: zero remaining `SupabaseProxy`/base44/`@/entities/all` references for `LinesOfCredit`/`LinesOfCreditTransaction` anywhere in `src/`.
- [ ] `npx vite build` clean.
- [ ] Apply functions to production after dev verification.

### 9C.4) Verification Checklist

- [ ] `LinesOfCredit.jsx`: create a throwaway LOC account, edit it, confirm round-trip via SQL.
- [ ] `LineOfCreditTransactionModal.jsx`: manual charge/credit/edit/delete all confirmed via SQL — GL balances correctly for each, `LinesOfCredit.current_balance`/`available_credit` recomputed correctly.
- [ ] Full throwaway LOC payment processed end-to-end (bank-sourced): breakdown calculated correctly, payment applied to charges, GL posts, `BankTransaction` created, balances update.
- [ ] `cancelLineOfCreditPayment` reverses the above correctly — un-applies charges, reverses GL, reverses bank tx, cross-links intact.
- [ ] `ReceiveCreditModal.jsx`: exercise all 3 refund destinations (Supplier AP, Cash Drawer, Line of Credit) against throwaway data — confirm `SupplierInvoiceLine`, `GLTransaction`, and (for LOC) `LinesOfCreditTransaction`/`LinesOfCredit.current_balance` all correct; confirm `InventoryReturn` row deleted at the end.
- [ ] `LOCReconciliationModal.jsx`: upload a small test CSV against a LOC with throwaway transaction data, confirm matching logic produces expected matched/unmatched buckets.
- [ ] Repo-wide grep clean; `npx vite build` clean.

**🛑 HOLD FOR TESTING — do not start 9D until you've confirmed the above and given the go-ahead.**

---

## 9D) SUB-PHASE D: Cheques

> **Handoff from 9B/9C (once cleared):** `SupplierPayment` records are created via the fully-native `processSupplierPayment`/`executeSupplierPayment` path; `IssuedChequesTable.jsx` was already fully converted in 9B (see 9B.1's note) — this sub-phase is primarily the `generateChequePDF` port and `ChequeWriter.jsx`'s cutover, plus final verification of the already-converted `IssuedChequesTable.jsx`.

### 9D.1) Transport-layer cutover

| File | Entities/calls to convert |
|---|---|
| `src/pages/ChequeWriter.jsx` | `SupplierPayment` read via `SupabaseProxy` → direct `supabase.from('SupplierPayment')`; `generateChequePDF` → `autopro-generateChequePDF`. |
| `src/components/cheques/IssuedChequesTable.jsx` | **Already converted in 9B** — this sub-phase only re-verifies it, no new edits expected unless 9B's pass missed something. |

*(`src/pages/ChequeRegister.jsx` confirmed to have zero direct entity/base44 calls — it's a thin wrapper around `IssuedChequesTable.jsx`, no changes needed.)*

### 9D.2) Native function port

- **`autopro-generateChequePDF`** — mechanical port: strip the auth gate, fetch `SupplierPayment` by `cheque_number` + linked `Supplier`, keep every `jsPDF` drawing call byte-identical (cheque region, amount-in-words banner via the custom `numberToWords()` converter, two stub sections with up to 3 columns × 10 rows of applied invoices). Uses `npm:jspdf@2.5.2` + `npm:date-fns@3.6.0` — carry forward exactly, matching Phase 8's PDF-function precedent. Success returns raw PDF bytes (`Content-Type: application/pdf`); only the error path uses `200+{error}` (legacy returns `500` on error — this is the one deliberate deviation, per the established Phase 8 convention).
- **Frontend binary-response handling:** `ChequeWriter.jsx` already treats `response.data` as PDF-bytes-like and wraps it in a `Blob` — same pattern Phase 8 confirmed works unchanged with `supabase-js`'s `functions.invoke()` auto-`Blob`-wrapping for non-JSON content types. Only real change: `base44.functions.invoke(name, payload)` → `supabase.functions.invoke('autopro-generateChequePDF', {body: payload})`, and check both the invoke-level `error` and the `data?.error` shape.

### 9D.3) Task List

- [ ] `autopro-generateChequePDF` ported, deployed to dev, verified via curl (both success — compare PDF byte/visual output against a legacy-generated cheque for the same payment — and `200+{error}` failure paths).
- [ ] `ChequeWriter.jsx` converted.
- [ ] Repo-wide grep: zero remaining references to `generateChequePDF`/`SupabaseProxy` for `SupplierPayment` in this file.
- [ ] `npx vite build` clean.
- [ ] Apply function to production after dev verification.

### 9D.4) Verification Checklist

- [ ] `IssuedChequesTable.jsx` (converted in 9B): loads real/throwaway cheque data, search/filter works, note-editing round-trips, "View Cheque" navigation works.
- [ ] `ChequeWriter.jsx`: loads a real/throwaway cheque reference, PDF renders in the iframe, visually matches the legacy-generated cheque layout (header, amount-in-words, stub sections) for the same underlying data.
- [ ] Repo-wide grep clean; `npx vite build` clean.

**🛑 HOLD FOR TESTING — Phase 9 is not complete until you've confirmed the above.**

---

## Final Verification Plan (all sub-phases together)

Once all 4 sub-phases are individually held-and-cleared, run this end-to-end pass before marking Phase 9 complete:

- [ ] Full AP cycle: receive a supplier invoice line → pay it (bank or LOC) → view it on the Cheque Register (if cheque) → cancel the payment → confirm all reversals are clean (GL balances to zero net effect, `SupplierInvoiceLine.paid_amount` back to original).
- [ ] Full LOC cycle: create an account → post a manual charge → make a payment against it → reconcile via CSV upload → cancel the payment → confirm reversal.
- [ ] `ChartOfAccounts.jsx` admin page: full CRUD confirmed working across every consuming dropdown touched in 9A (spot-check at least the ones in `SupplierForm.jsx`, `LinesOfCreditEditModal.jsx`, `ReceiveCreditModal.jsx`).
- [ ] Repo-wide grep: zero remaining `base44`/`SupabaseProxy`/`@/entities/all` references for `Supplier`, `SupplierInvoiceLine`, `SupplierPayment`, `LinesOfCredit`, `LinesOfCreditTransaction`, `CashFlowEntry`, `ChartOfAccount` across all of `src/`.
- [ ] `master_blueprint.md` Section 1/2 entity classification corrected for all 7 entities at phase close.
- [ ] `npx vite build` clean on the full accumulated diff.

## Handoff Context to Next Phase (10 — Accounting, GL Reporting, Taxes & Fiscal Periods)

- `ChartOfAccount` will be **fully native everywhere** by the time Phase 10 starts — no remaining base44 dependency for it in `GeneralLedger.jsx`, `JournalEntries.jsx`, `GLAcct.jsx`, `GLJournal.jsx`, etc. Phase 10 should confirm this rather than re-deriving it.
- Phase 10's carried-forward item from Phase 8 (`src/components/taxes/MarkPaidModal.jsx`'s `BankAccount` call site) is untouched by Phase 9 — still Phase 10's to pick up.
- `GSTReturn`/`CashFlowSummary` remain fully untouched — Phase 10's real schema-design work.
- The `process_payment_atomic`/RPC-backed GL-posting pattern proven in 9B (`executeSupplierPayment`) may be a useful precedent if Phase 10 needs similar atomicity for GL/GST posting — worth checking if a similar RPC already exists before assuming one needs to be built from scratch.

---

## Phase Results and Final Context

### 9A — **[Tested]**, verified complete 2026-08-03

- Dev branch (`sitihbdnuxifwibontcm`): RLS policies applied to `LinesOfCredit`/`LinesOfCreditTransaction`/`CashFlowEntry` (were enabled with zero policies — the recurring trap). Pre-existing seeded data (3/303/5 rows) confirmed untouched.
- Production (`hbcrwkmgsazqrvsrmxyr`): all 3 tables created fresh (they didn't exist there) via `supabase/migrations/20260806000000_loc_cashflow_tables.sql` — 57 columns, FK, and RLS policy all verified matching dev exactly.
- All 16 files in the 9A.2 table converted from `ChartOfAccount` (base44/`@/entities/all`) to direct `supabase.from('ChartOfAccount')` calls, touching only the `ChartOfAccount` lines in each file. `OtherChargesManager.jsx` needed its `Promise.all` decoupled (was mixing the now-native `ChartOfAccount` call with the still-base44 `OtherChargeList.list()` — would have failed the whole batch under a dev-native session per the standing lesson in Section 2).
- Repo-wide grep confirmed zero remaining `ChartOfAccount` base44/`@/entities/all` references anywhere in `src/`. `npx vite build` passed clean.
- Live click-through (`ChartOfAccounts.jsx` CRUD, `/dev-login` GL-Account-dropdown spot-checks) confirmed working by you, 2026-08-03. All 9A.4 checklist items closed — nothing carried forward, nothing skipped, nothing out of scope encountered.
- Work was committed to `development` by you via GitHub Desktop between sessions (confirmed via `git status` showing 9A's files no longer in the working tree diff at 9B research time).

---

### 9B — execution complete 2026-08-03, HOLD FOR TESTING (webview verification pending)

All 8 functions ported byte-faithful to the researched legacy sources below, deployed to dev (`sitihbdnuxifwibontcm`) and verified via curl against both the error paths and the real seeded `Test Supplier` row (id `999999999`) — `getSupplierTransactions` confirmed returning joined `ChartOfAccount`/`SupplierPayment`/`BankAccount` data correctly, `calculateSupplierPaymentBreakdown` confirmed producing correct FIFO output, `acquireSupplierLock` confirmed round-tripping the lock (released again after the test). All 8 then deployed to production (`hbcrwkmgsazqrvsrmxyr`), confirmed `status: ACTIVE`.

All 7 files in the 9B.1 table converted (`Suppliers.jsx`, `SupplierTx.jsx`, `SupplierTxView.jsx`, `APSummaryTable.jsx`, `AddToSheetModal.jsx`, `SupplierPaymentModal.jsx`, `IssuedChequesTable.jsx`) plus the 3 drive-by `Supplier` reads (`InventoryPartsReturnModal.jsx`, `LankarImportReturnModal.jsx`, `OtherChargeForm.jsx`). Every flagged `Promise.all` (`SupplierTx.jsx` `loadData`, `APSummaryTable.jsx` `loadData`, `SupplierPaymentModal.jsx` `loadData`, `IssuedChequesTable.jsx` `loadData`) converted atomically in one edit each, per Section 2's standing lesson. `SupplierTx.jsx`'s `handleSupplierUpdate` (Supplier read/update, not explicitly enumerated in the original 9B.1 table but same in-scope entity) converted alongside the rest while the file was already being touched.

Repo-wide grep confirmed zero remaining `SupabaseProxy`/`base44.functions`/`base44.entities`/`@/entities/all` references for `Supplier`/`SupplierInvoiceLine`/`SupplierPayment`/`CashFlowEntry` across all 10 touched files. `npx vite build` passed clean (exit 0, no errors, `dist/` regenerated).

**Not yet done — needs you, per your "hold for webview testing" instruction:** the full 9B.4 manual verification checklist below (live click-through against `test.kensauto.ca` under `/dev-login`, plus a full throwaway payment lifecycle verified via SQL). Nothing has been tested end-to-end in the actual UI yet — only via curl against the raw functions and a clean `vite build`.

---

<details>
<summary>9B — original pre-execution research (2026-08-03), preserved for audit trail</summary>

Fresh research pass (post-context-clear, per your `/nextsubphase` instruction) re-verified every assumption in 9B's original draft against current reality rather than trusting the pre-9A draft at face value:

Fresh research pass (post-context-clear, per your `/nextsubphase` instruction) re-verified every assumption in 9B's original draft against current reality rather than trusting the pre-9A draft at face value:

- **All 8 legacy base44 function source files exist locally** at `base44/functions/<name>/entry.ts` (not just described secondhand) — read in full: `getAPSummary`, `processSupplierPayment`, `executeSupplierPayment`, `calculateSupplierPaymentBreakdown`, `getSupplierTransactions`, `acquireSupplierLock`, `saveSupplierInvoiceTransactions`, `cancelSupplierPayment`. **Corrected count: 8 functions, not "6, or 7 with executeSupplierPayment" as the original draft's header said** (the header undercounted its own bullet list — a pre-existing documentation bug, fixed here).
- **Several of the 8 are far closer to done than the original draft implied**: `calculateSupplierPaymentBreakdown`, `acquireSupplierLock`, and `saveSupplierInvoiceTransactions` already use `supabase-js` directly for every data operation — the *only* base44 dependency left in each is the `base44.auth.me()` gate. These are drop-the-gate-only ports, not rewrites.
- **`getSupplierTransactions` and `executeSupplierPayment` each have exactly one `base44.asServiceRole.entities.*` call needing conversion** (`ChartOfAccount.list()` in the former; `LinesOfCredit`/`LinesOfCreditTransaction` in the latter) — both entities are now native (9A/dev-seed), so these are mechanical swaps, not schema-blocked.
- **`cancelSupplierPayment` has 3 `base44.asServiceRole.entities.*`/`.functions.*` calls** (`FiscalPeriod.filter`, `LinesOfCreditTransaction.filter/delete`, `LinesOfCredit.get`, `calculateBankBalances` invoke) — all resolvable: `FiscalPeriod` is already native, LOC entities are native from 9A, `calculateBankBalances` is already deployed as `autopro-calculateBankBalances` (Phase 8).
- **New finding, not a 9B blocker but worth recording:** `FiscalPeriod` has RLS **enabled with zero policies on production** (1 policy on dev) — the same recurring trap, but confirmed **harmless to 9B** since every `autopro-*` edge function uses the service-role key, which bypasses RLS entirely, and no frontend file yet reads `FiscalPeriod` via direct `supabase.from()` (still fully base44-routed via `fiscalPeriodUtils.jsx`'s `@/entities/all` import — confirmed via repo-wide grep, zero direct-Supabase `FiscalPeriod` reads exist). Flagged for whoever picks up Phase 10 ("Accounting, GL Reporting, Taxes & Fiscal Periods") rather than fixed here, since fixing it isn't 9B's job and touching it now would be scope creep.
- **All frontend files in the 9B.1 table re-read against their current on-disk state** (not the pre-9A draft's memory of them) — confirmed the call patterns match what's documented below, including the exact `Promise.all` at `SupplierTx.jsx`'s `loadData()` (still mixes `getSupplierTransactions` with a `SupabaseProxy` Supplier read — both still base44 today, so no decoupling failure *yet*, but 9B's port order matters here, see 9B.1 below).
- **`Supplier`/`SupplierInvoiceLine`/`SupplierPayment`/`CashFlowEntry` all confirmed 1 RLS policy each on production** via direct `pg_policies` query — no RLS gap on any of 9B's 4 entities.
- Nothing out of scope was encountered or deferred in this research pass — the file list and function list from the original blueprint held up under verification, only the details underneath needed correcting.

</details>
