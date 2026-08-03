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
| **9A** | Schema (`LinesOfCredit`/`LinesOfCreditTransaction`/`CashFlowEntry`) + project-wide `ChartOfAccount` transport cutover | Not Started | None — start here |
| **9B** | Suppliers & AP core: `Supplier`/`SupplierInvoiceLine`/`SupplierPayment`/`CashFlowEntry` transport cutover + 6 native functions | Not Started | **9A** (needs `CashFlowEntry` schema + `ChartOfAccount` cutover for `SupplierForm.jsx`) |
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

- [ ] Apply the RLS `ENABLE`/`CREATE POLICY` statements to the dev branch (tables/columns/FK already exist there — confirmed 2026-08-03 — only the policy gap needs fixing); verify `pg_policies` count > 0 for all 3 tables.
- [ ] Apply the full `supabase/migrations/<timestamp>_loc_cashflow_tables.sql` (tables + FK + RLS) to production as a genuinely fresh `CREATE TABLE`; verify columns + FK + RLS policy count via SQL match dev exactly.
- [ ] Convert all 16 files in the 9A.2 table — `ChartOfAccount` lines only.
- [ ] Repo-wide grep confirms zero remaining `ChartOfAccount` references via `base44.entities`/`@/entities/all` anywhere in `src/`.
- [ ] `npx vite build` passes clean.

### 9A.4) Verification Checklist

- [ ] Dev branch: `pg_policies` shows 1 policy per table (schema itself already confirmed matching, 2026-08-03 — this checklist item is really just confirming the RLS fix landed).
- [ ] Production: fresh `CREATE TABLE` + FK + RLS applied; columns/FK/policy count all verified matching dev exactly.
- [ ] Dev's existing real data (3 `LinesOfCredit`, 303 `LinesOfCreditTransaction`, 5 `CashFlowEntry` rows) survived the RLS-policy migration untouched — spot-check row counts before/after.
- [ ] `ChartOfAccounts.jsx` page: list loads, create/edit an account round-trips correctly against the native table (verify via direct SQL read, not just UI success toast).
- [ ] Spot-check 3–4 of the read-only dropdown files (`BankTransactionModal.jsx`, `SupplierForm.jsx`, `LinesOfCreditEditModal.jsx`) via `/dev-login` on `test.kensauto.ca` — GL Account dropdowns populate (this was previously blocked under dev-login per Phase 8's noted gap; confirms the fix).
- [ ] Repo-wide grep: zero remaining `ChartOfAccount` base44/`@/entities/all` references.
- [ ] `npx vite build` clean.

**🛑 HOLD FOR TESTING — do not start 9B until you've confirmed the above and given the go-ahead.**

---

## 9B) SUB-PHASE B: Suppliers & Accounts Payable Core

> **Handoff from 9A (once cleared):** `LinesOfCredit`/`LinesOfCreditTransaction`/`CashFlowEntry` schema live on both branches; `ChartOfAccount` fully native everywhere, including `SupplierForm.jsx`'s line.

### 9B.1) Transport-layer cutover — file-by-file

| File | Entities/calls to convert |
|---|---|
| `src/pages/Suppliers.jsx` | `Supplier` CRUD (`read`/`create`/`update`) via `SupabaseProxy` → direct `supabase.from('Supplier')`; lock-release on unmount (`LockedByUser: null`). |
| `src/pages/SupplierTx.jsx` | `Supplier` read/update (incl. `LockedByUser` set/clear), `LinesOfCredit.list()` (now native table, still needs the transport swap for *this* entity even though schema landed in 9A), `chartOfAccounts` state (already fixed in 9A — just confirm this file's own state-population code path works), the `Promise.all` at ~line 385 (decouple `getSupplierTransactions` from the `SupabaseProxy` Supplier read per Section 2's lesson). |
| `src/pages/SupplierTxView.jsx` | `getSupplierTransactions` call → `autopro-getSupplierTransactions`. Read-only view. |
| `src/components/suppliers/APSummaryTable.jsx` | `getAPSummary` → `autopro-getAPSummary`; `CashFlowEntry.list()` ×2, `LinesOfCredit.filter({is_active:true})`. |
| `src/components/suppliers/AddToSheetModal.jsx` | `CashFlowEntry.create()`. |
| `src/components/suppliers/SupplierPaymentModal.jsx` | `CashFlowEntry.filter()`/`.list()`/`.create()`, `BankAccount` via `SupabaseProxy` ×2 (**carried forward from Phase 8**), `processSupplierPayment` → `autopro-processSupplierPayment`, `calculateSupplierPaymentBreakdown` → `autopro-calculateSupplierPaymentBreakdown`, `LinesOfCredit.filter({is_active:true})`. |
| `src/components/cheques/IssuedChequesTable.jsx` | **`SupplierPayment`/`Supplier` reads only in 9B** — its `BankAccount` conversion is 9D's concern once this file is revisited for the cheque-specific work, but since it's touched here anyway for `SupplierPayment`/`Supplier`, convert `BankAccount` too in the same pass (avoids a second edit to the same file) — **see 9D, this file is fully closed out here, 9D only needs to verify it, not edit it.** |

*(`GLAccountCombobox.jsx`, `SupplierCombobox.jsx`, `LineEditModal.jsx`, `SupplierTxInvoiceLinesTab.jsx`, `SupplierTxInvoiceSummaryTab.jsx`, `SupplierTxPaymentHistoryTab.jsx` confirmed to have zero entity/base44 calls — presentational/prop-driven only, no changes needed.)*

*(0.3's three trivial cross-domain `Supplier` reads — `InventoryPartsReturnModal.jsx`, `LankarImportReturnModal.jsx`, `OtherChargeForm.jsx` — included here if you choose option (a) in 0.3.)*

### 9B.2) Native function ports (6, or 7 with `executeSupplierPayment` per 0.2)

All follow the established pattern: drop the base44 auth gate, swap `Supabase_project_url`/`Supabase_Secret_Key` → `SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY`, keep business logic byte-identical, `200 + {error}` on failure.

- **`autopro-getAPSummary`** — thin passthrough to the existing `get_ap_summary_data` RPC (already native, no change needed there) + the `Math.abs(current_balance) > 0.01` filter. Lowest-risk port in this sub-phase.
- **`autopro-processSupplierPayment`** — validate → confirm supplier exists → insert `SupplierPayment` (`status: 'pending'`, client-generated 24-char id) → call `apply_supplier_invoice_line_paid_updates` RPC (already native) → on failure, delete the payment row (rollback) → on success, invoke `autopro-executeSupplierPayment` (fire-and-forget, matching original behavior).
- **`autopro-executeSupplierPayment`** *(if 0.2 approved)* — fetch payment/supplier, resolve source (`BankAccount.gl_account` or `LinesOfCredit.gl_account`), build the 2-row GL entry pair, call the already-native `process_payment_atomic` RPC, then (LOC only) create the mirror `LinesOfCreditTransaction` and (cheque only) bump `BankAccount.next_cheque_number`. **This function does not need to build new GL logic — it already delegates to a native RPC; the port is orchestration-only.**
- **`autopro-calculateSupplierPaymentBreakdown`** — port the exact FIFO oldest-first matching algorithm described in this plan's research (positive-payment vs. negative-payment/refund branches, `0.005` tolerance) byte-for-byte. Read-only against `SupplierInvoiceLine`.
- **`autopro-getSupplierTransactions`** — parallel fetch of `Supplier`, `ChartOfAccount` (now native), `SupplierPayment`, the `get_supplier_transactions_optimized` RPC (already native), and `BankAccount` (for the `bank_account_name` lookup map). Read-only aggregator.
- **`autopro-acquireSupplierLock`** — port as-is per 0.1(a) (or with the timestamp/flush addition per 0.1(b), pending your decision): single atomic conditional `UPDATE ... WHERE LockedByUser IS NULL OR = '' OR = <email>`.
- **`autopro-saveSupplierInvoiceTransactions`** — the most complex port in this sub-phase: 4 ordered phases (deletions with paid-amount guard, additions, modifications with GL-relevant-change detection, payment reallocation) each posting **independent GL entries** (`2000`/`2003`/dynamic `gl_account`) — preserve the exact reversal-then-repost pattern for edits, pure reversal for deletes. Uses the known-quirky `getCurrentMountainTimeISO()` helper — port faithfully (flag but don't silently "fix" the double-parse quirk unless you want it addressed; note here for visibility).
- **`autopro-cancelSupplierPayment`** — fiscal-period-closed gate (now via direct `FiscalPeriod` query, already native) → branch on `payment_method` to find/validate/delete the linked `BankTransaction` or `LinesOfCreditTransaction` → reverse `paid_amount` across `SupplierInvoiceLine`s (batched updates of 100) → resolve credit account (bank or LOC `gl_account`) → insert 2-row GL reversal → delete the `SupplierPayment` → trigger `autopro-calculateBankBalances` (already deployed, Phase 8) if bank-sourced.

### 9B.3) Task List

- [ ] All 6–7 functions ported, deployed to dev, verified via curl (success + `200+{error}` paths).
- [ ] All frontend call sites converted (table above).
- [ ] Repo-wide grep: zero remaining `SupabaseProxy`/base44 references for `Supplier`/`SupplierInvoiceLine`/`SupplierPayment`/`CashFlowEntry` in 9B-scoped files.
- [ ] `npx vite build` clean.
- [ ] Apply same functions to production after dev verification.

### 9B.4) Verification Checklist

- [ ] `Suppliers.jsx`: list loads, create/edit/lock-release round-trip correctly (verify via SQL, not just UI).
- [ ] `SupplierTx.jsx`: lock acquire/release, invoice line add/edit/delete (with GL posting verified via `GLTransaction` SQL read — balanced debit/credit), payment breakdown calculation matches expected FIFO output on a throwaway multi-invoice test supplier.
- [ ] A full throwaway supplier payment processed end-to-end: `processSupplierPayment` → `executeSupplierPayment` → confirm `SupplierPayment.status` reaches `completed`, `GLTransaction` rows balance, `BankTransaction` (if bank-sourced) created correctly, `SupplierInvoiceLine.paid_amount` updated correctly. Clean up test rows after.
- [ ] `cancelSupplierPayment` reverses the above test payment correctly — GL reversal balances, `SupplierInvoiceLine.paid_amount` restored, linked `BankTransaction`/`LinesOfCreditTransaction` deleted.
- [ ] `APSummaryTable.jsx`/`AddToSheetModal.jsx`: CashFlowEntry create/list round-trips against the new native table.
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

*(Empty — filled in as each sub-phase executes and clears its hold-for-testing gate.)*
