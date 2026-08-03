# Phase 8 Implementation Plan: Banking & Cash Drawer

**Status:** DRAFTED FOR APPROVAL — Section 0 open questions need your decisions before Section 3 gets its final line-by-line detail
**Parent:** `master_blueprint.md`, Phase 8 (Banking & Cash Drawer)
**Prepared:** 2026-08-03 · Initial scope research complete
**Baseline commit:** working tree as of Phase 12 close-out (development branch; Phase 7/Inventory in progress on a separate track)

> **LIVE DOCUMENT.** This plan is updated in place as execution/verification surfaces new findings — do not wipe prior sections, append/annotate instead. Key learnings roll back into `master_blueprint.md` Section 7 at phase close.

---

## 0) Open Questions, Info Requirements & Suggestions

### 0.1 — CORRECTED via direct production query: `BankAccount`/`BankTransaction`/`BankReconciliation` already exist natively — this is NOT the schema-design phase the blueprint implied

**Needs your acknowledgment, not really a decision.** `master_blueprint.md`'s Phase 8 row says *"`CashDrawerAdjustment`/`DepositSlipBreakdown` confirmed needing real schema + data migration"* — that part is still accurate, but a direct query against production confirms **`BankAccount`, `BankTransaction`, and `BankReconciliation` already exist as native Postgres tables** with real data and the standard audit-field convention (`id, created_date, updated_date, created_by_id, created_by, is_sample`), matching `src/supabase/schema.csv`'s live column dump. This means:

- **`BankAccount`/`BankTransaction`/`BankReconciliation`** → transport-layer cleanup only (same category as Customer/Vehicle in Phase 5) — swap `base44.functions.invoke('SupabaseProxy', ...)` call sites for direct `supabase.from()`, no `CREATE TABLE` needed.
- **`CashDrawerAdjustment`/`DepositSlipBreakdown`** → genuinely need new native tables (confirmed no Postgres table exists; both have `base44/entities/*.jsonc` definitions to mirror, per this project's established schema-design pattern — see 3.2).

Same pattern as Phase 12's `Appointment` correction: don't trust the blueprint's classification table at face value, verify against the database directly. Recommend correcting the blueprint's Phase 8 description once this plan is approved (folded into the roadmap update at phase close, not now).

### 0.2 — NEEDS YOUR DECISION: how far does Phase 8's file scope reach?

`BankAccount`/`BankTransaction` writes aren't confined to `Bank.jsx`/`CashDrawer.jsx`/`Reconcile.jsx` — six files outside the Banking module proper also write to these tables via `SupabaseProxy`:

| File | Domain | Future phase that "owns" it |
|---|---|---|
| `src/components/inventory/ReceiveCreditModal.jsx` | Inventory | Phase 7 (in progress — confirmed NOT in its scope, see `master_blueprint.md` Section 7 lesson, 2026-08-03) |
| `src/components/suppliers/SupplierPaymentModal.jsx` | Suppliers/AP | Phase 9 |
| `src/components/lines-of-credit/LineOfCreditPaymentModal.jsx` | Lines of Credit | Phase 9 |
| `src/components/payroll/MarkPaidModal.jsx` | Payroll | Phase 11 |
| `src/components/taxes/MarkPaidModal.jsx` | Taxes | Phase 10 |
| `src/components/cheques/IssuedChequesTable.jsx` | Cheques | Unclear — not explicitly assigned in the blueprint |

**Two options:**
- **Option A (recommended): Phase 8 migrates all `BankAccount`/`BankTransaction`/`BankReconciliation` call sites repo-wide now**, regardless of which "module" the file otherwise belongs to. Rationale: `BankAccount` is the entity being cut over — leaving 6 known call sites on the old SupabaseProxy path after Phase 8 "completes" means the entity isn't actually fully migrated, and whoever lands Phase 9/10/11 later would have to rediscover and redo this exact research. All 6 are Pending/not-yet-started phases (Phase 7 is in progress but already confirmed not to touch this specific file), so there's no live-conflict risk today — just a small chance a future phase's agent independently touches the same file before Phase 8 finishes. Low risk given current phase statuses.
- **Option B: Phase 8 touches only the core Banking/CashDrawer files** (`Bank.jsx`, `CashDrawer.jsx`, `Reconcile.jsx`, `ReconcileReport.jsx`, `src/components/bank/*`, `src/components/cash-drawer/*`) and leaves the 6 cross-domain call sites for their respective future phases to pick up. Cleaner phase boundaries, but means `BankAccount`'s migration is only "mostly" done after Phase 8, and 4 different future phases each independently need to remember this leftover work.

**My recommendation is Option A** — let me know if you'd rather keep phases strictly file-scoped instead.

### 0.3 — NEEDS YOUR DECISION: 9 legacy named Base44 functions need native replacements — split into sub-phases like Phase 7?

Beyond simple CRUD, this domain calls 9 distinct legacy Base44 functions that qualify as "complex" under this project's migration policy (real business logic, multi-step, or cross-table) and need proper 1:1 `autopro-*` Edge Function replacements, not just a direct frontend call:

| Legacy function | Called from | Purpose |
|---|---|---|
| `calculateBankBalances` | `Bank.jsx` (×4), `MarkPaidModal.jsx` (payroll) | Recompute account balances from transactions |
| `flushBankLocks` | `Bank.jsx` | Release stale optimistic locks |
| `getBankTransactions` | `Bank.jsx`, `Reconcile.jsx`, `DepositHistoryModal.jsx` | Fetch transactions (shared helper) |
| `processBankReconciliation` | `AutoReconcileModal.jsx` | Auto-reconcile logic |
| `batchReconcileTransactions` | `Reconcile.jsx` | Manual batch reconciliation, writes `BankReconciliation` |
| `getReconciliationHistory` | `ReconciliationHistoryModal.jsx` | List past reconciliations for an account |
| `generateDepositSlipPDF` | `CashDrawer.jsx` | Server-side PDF generation |
| `generateDepositDetailReport` | `cash-drawer/DepositDetailsModal.jsx` | Server-side PDF/report generation |
| `reverseDeposit` | `DepositHistoryModal.jsx`, `cash-drawer/DepositDetailsModal.jsx` | Reverses a deposited batch |

This is a large surface for one phase — real money-movement logic (reconciliation, deposit reversal) where correctness matters more than speed. **Recommend restructuring Phase 8 into sub-phases**, mirroring Phase 7's 7A/7B/7C split:

- **8A — Foundation:** New schema for `CashDrawerAdjustment`/`DepositSlipBreakdown` (0.1), transport-layer cutover of `BankAccount`/`BankTransaction`/`BankReconciliation` CRUD across whichever file set 0.2 settles on, and the simple/thin-proxy legacy function ports (`getBankTransactions`, `calculateBankBalances` — these read/aggregate, no complex write logic).
- **8B — Reconciliation:** `processBankReconciliation`, `batchReconcileTransactions`, `getReconciliationHistory`, `flushBankLocks` — the reconciliation + locking subsystem, which depends on 8A's `BankTransaction`/`BankReconciliation` cutover being done first.
- **8C — Deposits & Reports:** `generateDepositSlipPDF`, `generateDepositDetailReport`, `reverseDeposit` — deposit-slip PDF generation and reversal logic, depends on 8A's `CashDrawerAdjustment`/`DepositSlipBreakdown` schema.

**Your call** — confirm the sub-phase split (and the 8A/8B/8C boundaries as drawn), or tell me to keep it as one phase and I'll scope accordingly.

### 0.4 — NEEDS YOUR INPUT: PDF generation approach for `generateDepositSlipPDF`/`generateDepositDetailReport`

Need to know what Base44 currently uses for server-side PDF generation before I can scope a native Deno replacement. Two sub-questions:
- Does any existing `autopro-*` Edge Function already generate a PDF (e.g., for invoices/estimates)? If so, I'll reuse that library/pattern rather than introducing a new dependency.
- Is there a real deadline pressure on deposit-slip PDFs specifically, or can this land last within 8C if the PDF library port turns out to be the hardest part?

I'll research `base44/functions/generateDepositSlipPDF/entry.ts` and check for existing native PDF patterns as part of finalizing 8C's detailed plan — flagging now since it may be this phase's single riskiest unknown.

### 0.5 — Housekeeping: GL posting pattern stays ad hoc (no decision needed, just flagging)

Banking currently posts to `GLTransaction` via direct SupabaseProxy `create` calls (`Bank.jsx`'s `createGLTransaction` helper), not through a dedicated `autopro-*` function — and unlike Work Order invoicing (which uses `autopro-handleInvoiceConversionGL`/`autopro-handleSupplierInvoiceLineGL`), nothing in this domain touches those two protected functions at all. Since `GLTransaction` is already fully native and this is simple single-row CRUD (not multi-step orchestration), **this stays a direct `supabase.from('GLTransaction').insert()` call under the existing "thin CRUD → direct call" policy** — no new Edge Function needed here. Flagging so nobody re-litigates this as a gap later.

### 0.6 — Housekeeping: optimistic locking on `BankAccount` carries over as-is (no decision needed)

`BankAccount.locked_by_user`/`locked_timestamp` (existing native columns) back an optimistic-locking scheme, checked via `src/components/utils/mountainTimeUtils.jsx`'s `checkBankAccountLock()` helper and released via `flushBankLocks`. This is existing business logic, not something to redesign — 8A/8B just needs to preserve the exact lock-check/release behavior while swapping the underlying transport.

---

## 1) Phase Scope & Objectives

**In scope for Phase 8** (pending 0.2/0.3 decisions):

1. New native schema for `CashDrawerAdjustment` and `DepositSlipBreakdown`, mirroring their `base44/entities/*.jsonc` definitions (fields enumerated in Section 0.1's research — full DDL in Section 3 once drafted).
2. Transport-layer cutover of all `BankAccount`/`BankTransaction`/`BankReconciliation` CRUD from `base44.functions.invoke('SupabaseProxy', ...)` to direct `supabase.from()`, across core files (`Bank.jsx`, `CashDrawer.jsx`, `Reconcile.jsx`, `ReconcileReport.jsx`, `src/components/bank/*`, `src/components/cash-drawer/*`) and — pending 0.2 — the 6 cross-domain call sites.
3. Native `autopro-*` replacements for the 9 legacy named functions enumerated in 0.3.
4. One-time data migration for any live `CashDrawerAdjustment`/`DepositSlipBreakdown` records currently only in Base44 (volume/urgency TBD — needs the same live-data-count check Phase 12 did for `Appointment`).
5. Preserve exact existing behavior: optimistic locking (0.6), GL posting pattern (0.5), reconciliation math, deposit-slip PDF output.

**Explicitly out of scope:**
- `autopro-handleInvoiceConversionGL`/`autopro-handleSupplierInvoiceLineGL` — do not touch (standing project rule, and confirmed this domain doesn't call them anyway).
- `ChartOfAccount` CRUD itself — already hybrid/native per the blueprint, referenced read-only by several Banking modals (`BankAccountEditModal.jsx`, `BankTransactionModal.jsx`, `CashDrawerAdjustmentModal.jsx` all import it from `@/entities/all`); Phase 9 owns finishing that entity's own cutover.
- `LinesOfCredit`/`LinesOfCreditTransaction`, `SupplierPayment`, `PayrollTransaction`, `GSTReturn`/tax entities themselves — only their `BankAccount`-writing call sites are touched (if 0.2 → Option A), not their own broader migration (Phases 9/10/11's job).
- `CustomerPayments` — already has a direct `supabase.from()` call in `cash-drawer/DepositDetailsModal.jsx` (line ~748); leave as is, not this phase's entity.

**Target outcome:** Zero `base44.*` calls remaining for `BankAccount`/`BankTransaction`/`BankReconciliation`/`CashDrawerAdjustment`/`DepositSlipBreakdown` anywhere in `src/`; all 9 legacy functions replaced with native `autopro-*` equivalents returning the established `200 + {error}` shape; reconciliation and deposit-slip PDF output byte-for-byte/cent-for-cent equivalent to pre-migration behavior (per `master_blueprint.md`'s Phase 8 verification summary: "bank reconciliation run twice — old vs. new path — totals match to the cent").

---

## 2) Lessons Learned & Context

Pulled from `master_blueprint.md` Section 7, filtered to what's load-bearing for this phase:

- **Never trust the blueprint's entity-status classification at face value — always verify directly against the database.** This phase is a second proof point after Phase 12's `Appointment` correction: `BankAccount`/`BankTransaction`/`BankReconciliation` turned out to already be native, contrary to what the blueprint's Phase 8 description implied.
- **Postgres `bigint` columns reject `''`, need `null`.** (Phase 12 finding.) Check any numeric-typed FK-ish column here (none obviously bigint-typed per the schema.csv dump, but verify before assuming `''`-default form fields are safe.)
- **Audit fields don't populate themselves.** Every direct `.insert()`/`.update()` needs explicit `created_by`/`created_by_id`/`updated_date` — this domain's existing convention is `created_by: currentUser?.full_name || currentUser?.email || currentUser?.id`, `created_by_id: currentUser?.id` (verbatim from `Bank.jsx`, `Reconcile.jsx`, `ReceiveCreditModal.jsx`) — follow this exact derivation, not the slightly different `user?.email || ''` pattern Phase 12 used for `Appointment` (different domains, established their own conventions independently — match whichever convention is already used in the specific file being touched).
- **`npm:` vs `esm.sh` specifiers matter for Deno Edge Functions; wrap `createClientFromRequest` in try/catch if a native function still needs Base44 SDK access for any reason.**
- **All native `autopro-*` Edge Functions return HTTP 200 with `{ error }` on failure, never raw 4xx/5xx.**
- **A `Promise.all` mixing a still-base44-routed call with already-migrated direct calls fails the whole batch on a dev-native session** (Phase 3/Phase 12 finding) — check `Bank.jsx`/`CashDrawer.jsx`/`Reconcile.jsx` for this pattern before assuming a partially-migrated page's native calls are broken.
- **Dev-branch column types can diverge from production** — verify `BankAccount`/`BankTransaction` column types on the dev branch match production before writing dev-tested code (Phase 4 found `Employee.pay_rate` diverged this way).
- **The `/dev-login` mechanism (`test.kensauto.ca/dev-login`) is confirmed still fully functional** (Phase 12, 2026-08-03) — use it for all live verification in this phase too.
- **Financial-domain risk (blueprint Risk #2, #9):** GL/double-entry corruption is the critical risk category for this tier. Strictly cast (`Number()`/`parseFloat()`) on every rewritten write path. Diff reconciliation totals old-path vs. new-path before/after, to the cent.
- **Multi-agent coexistence (this session's finding):** Phase 7 is active on a separate track; confirmed zero file overlap with Phase 8's core scope, one flagged touchpoint (`ReceiveCreditModal.jsx`, see 0.2) that's outside Phase 7's actual documented scope — re-verify Phase 7's live status before touching that file if significant time has passed.

---

## 3) Detailed Execution Plan

**Held pending Section 0 answers** (0.2's file-scope decision and 0.3's sub-phase split both materially change what belongs in this section). Once you confirm:

- I'll pull the exact `CashDrawerAdjustment`/`DepositSlipBreakdown` DDL (columns already enumerated in Section 0.1's research — just needs formatting into a migration file matching this project's audit-field convention).
- I'll research `base44/functions/{calculateBankBalances,flushBankLocks,getBankTransactions,processBankReconciliation,batchReconcileTransactions,getReconciliationHistory,generateDepositSlipPDF,generateDepositDetailReport,reverseDeposit}/entry.ts` in full and write line-by-line ports for whichever sub-phase(s) you approve.
- I'll write the exact `base44.functions.invoke`/`SupabaseProxy` → `supabase.from()` diffs for every file in the confirmed scope (full file:line list already gathered this session — see the research notes folded into Section 0).

---

## 4) Verification Plan

**Held pending Section 0 answers**, but the shape is already clear from `master_blueprint.md`'s Phase 8 verification summary and will include, at minimum:

- New `CashDrawerAdjustment`/`DepositSlipBreakdown` tables validated in dev first (schema + a throwaway test row) before touching production.
- Bank reconciliation run twice — old path vs. new path, on the same real (or dev-mirrored) data — totals matching to the cent.
- Deposit slip PDF output compared old vs. new for byte-level/visual equivalence.
- Optimistic lock behavior (two sessions attempting to edit the same `BankAccount`) confirmed unchanged.
- Repo-wide grep confirming zero remaining `base44.*` references for the 5 entities in this phase's scope.
- Live click-through via `/dev-login`, per the now-standard pattern from Phases 3–12.

Full checklist to be drafted once Section 3 is finalized.

---

## 5) Open Items Carried Forward From Phase 12 Close-Out

Per the coordination-map lesson logged in `master_blueprint.md` Section 7: before starting execution on this phase, re-confirm `src/components/inventory/ReceiveCreditModal.jsx` is still outside Phase 7's live scope (a quick grep of the current `phase_7_implementation_plan.md` for "ReceiveCreditModal"/"refund"/"Cash Drawer" takes under a minute and avoids a live edit collision).
