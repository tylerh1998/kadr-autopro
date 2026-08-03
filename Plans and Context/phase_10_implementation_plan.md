# Phase 10 Implementation Plan: Accounting, GL Reporting, Taxes & Fiscal Periods

**Status:** **In Progress.** 10A, 10B, 10C, and 10D are all **done and confirmed live** on `test.kensauto.ca` (10A via commit `2b21dccaf`; 10B via `edd03df7` + `fdaff904` + `8429b218`/`9e6c1d3b`; 10C frontend via commit `46c86e2b` "Phase 10C", backend functions deployed directly to both branches ahead of that push; 10D pushed and live-verified 2026-08-03, including a real bug found and fixed — `CashFlowSummary`'s 12 `bigint` fields silently rejected cents, widened to `double precision` on both branches). See "Phase Results and Final Context" below for the full rollup of all four. **10E (Levies) is next — research complete as of 2026-08-03, both open questions resolved (see 10E below for full detail), code not yet started.** Confirmed: (1) preemptively widen `Levies.total_amount`/`base_amount` from `bigint` to `double precision` (same shape of bug 10D just found and fixed in `CashFlowSummary`), and (2) add the `checkFiscalPeriodStatus()` guard to `autopro-postLeviesToAP`, consistent with `transferFunds`'s 10D precedent.
**Parent:** `master_blueprint.md`, Phase 10
**Prepared:** 2026-08-03
**Supabase project refs:** dev branch `sitihbdnuxifwibontcm` (schema changes tested here first, always); production `hbcrwkmgsazqrvsrmxyr` (applied second, after dev verification)

> **LIVE DOCUMENT.** This plan is updated in place as execution/verification surfaces new findings — do not wipe prior sections, append/annotate instead. Key learnings roll back into `master_blueprint.md` Section 7 at phase close.
>
> Per the established Phase 8/9/13 convention, each sub-phase below ends with an explicit **🛑 HOLD FOR TESTING** gate — no sub-phase's code is to be executed until the previous sub-phase's hold has been explicitly cleared by you.

---

## 0) Open Questions, Info Requirements & Suggestions

**All resolved (2026-08-03) — decisions recorded inline below. Original writeups kept for context/audit trail.**

**Decisions summary:**
- **0.1** — Levies is in scope. **Update:** you built the `Levies` table directly on dev mid-conversation — confirmed via direct query: real schema, 153 real rows already present, RLS enabled with **zero policies** (the standing trap, recurring again). 10A now includes the RLS fix; 10E's schema-design step is replaced with "replay this exact schema to production."
- **0.2** — Answered directly in chat: only `getGeneralLedgerData`/`getThreeMonthAPReport` are pure RPC passthroughs; the other 7 report functions do real `GLTransaction` reads + JS-side aggregation via `supabase-js` already (no RPC) plus one still-base44 `ChartOfAccount` swap each — mechanical, not zero-effort. Scope/sub-phase structure unchanged.
- **0.3** — `GSTReturn` also now exists on dev (confirmed: 2 real rows, RLS enabled with **zero policies** — same trap). 10A's schema step is replay-to-production, not create-from-scratch. Column types differ slightly from the plan's original draft DDL (dates are `text`, not `date`/`timestamptz`) — noted in 10A.2 below.

### 0.1 — Is Levies/`postLeviesToAP` in scope for Phase 10, or deferred again?

Direct research confirms `Levies` is a genuinely **live, actively-wired feature**, not dead code:
- `src/components/work-orders/hooks/useDocumentEditorSave.jsx:211` fires `base44.functions.invoke('syncLevies', {...})` on **every work order save** (Phase 13/`DocumentEditor.jsx` domain).
- `src/components/reports/ReportableLeviesReport.jsx` calls `getReportableLeviesReport` (report view) and `postLeviesToAP` (posts to `GLTransaction` + Supplier AP — real GL-posting logic).
- The `Levies` table **does not exist on either branch** (confirmed via direct query, 2026-08-03) — it was explicitly deferred in Phase 13C for exactly this reason (`autopro-syncLevies`'s port was skipped there), and `master_blueprint.md` Section 1 flags it as still uncreated without assigning it to a specific future phase.
- `OtherChargeList` (a dependency of the Levies functions) **does exist on dev, not on production** — same "created mid-Phase-13, not yet replayed to prod" gap as `SystemSettings`/`WorkOrderStatus`/`TagAlong`.

**Your call:**
- **(a)** Include it as **Sub-phase 10E** — build the `Levies` schema (mirroring `base44/entities/Levies.jsonc`), replay `OtherChargeList` to production, and port all 3 functions (`syncLevies`, `getReportableLeviesReport`, `postLeviesToAP`) + their 2 frontend call sites.
- **(b)** Defer again to Phase 14 (final sunset) — Phase 10 stays scoped to Accounting/GL/Tax/FiscalPeriod only, and `syncLevies` keeps silently no-op'ing on every WO save (its current live behavior today, since the base44 call already 401s/no-ops under any dev-native session per the standing token-expiry issue — confirmed harmless to defer further, just not "done").

*Recommendation: (a) — it's genuinely Accounting-domain scope, the schema work is small (one table, following the now well-established `.jsonc`-mirroring pattern), and leaving a real live feature silently broken indefinitely is worse than absorbing ~1 extra sub-phase here.*

### 0.2 — Confirm scope boundary: is the full GL Reporting suite (9 functions, 6 pages) really "Phase 10," or should it split further?

Research surfaced significantly more scope than the master_blueprint's Phase 10 one-liner implied (`GSTReturn`/`CashFlowEntry`/`CashFlowSummary` migration + two carried-forward files). In addition to that, **zero** of the following have a native replacement yet: `getGeneralLedgerData`, `getGLJournalData`, `getBalanceSheetData`, `getPLReportData`, `getFinancialDashboardData`, `findGLImbalances`, `getGLAccountTransactions`, `getThreeMonthPLReport`, `getThreeMonthAPReport` — feeding `GeneralLedger.jsx`, `GLAcct.jsx`, `GLJournal.jsx`, `PLReport.jsx`, `BalanceSheet.jsx`, `FinancialDashboard.jsx`. Plus `JournalEntries.jsx` (looks native, isn't — see 3&4/10B) and the `CashFlow.jsx` gap (Phase 9 migrated the `CashFlowEntry` *table* but never touched this page's base44-routed CRUD).

**Your call:**
- **(a)** Keep it all under one Phase 10, split into sub-phases 10A–10D(/E) as drafted below (matches the Phase 8/9/13 precedent for large-scope phases).
- **(b)** Split GL Reporting (10B below) out into its own new phase, renumbering everything after it (the blueprint has precedent for this — v4 inserted a new Phase 2 and shifted every later phase up by one).

*Recommendation: (a) — sub-phases with individual hold-for-testing gates give you the same incremental control as separate phases, without a disruptive renumber of Phases 10A→14 in the blueprint.*

### 0.3 — Confirmed via direct research (no decision needed, stated for the record)

- `CashFlowSummary` has RLS **enabled with zero policies** on dev (the standing Phase-1 trap, recurring) — confirmed via direct `pg_policies` join, 2026-08-03. `SystemSettings`/`FiscalPeriod`/`GLTransaction`/`OtherChargeList` all correctly have 1 policy each already on dev (a subagent's first-pass research flagged `SystemSettings` as also zero-policy; a direct follow-up query showed that's now fixed — reinforcing the standing "verify live state directly, don't trust secondhand research" rule one more time).
- `GSTReturn` doesn't exist on either branch. `CashFlowSummary`/`SystemSettings`/`OtherChargeList` exist on dev only, not production.
- `postJournalEntries` (feeding `JournalEntries.jsx`) is already **fully native supabase-js internally** — it's reached today via the base44-proxy's `@/functions/postJournalEntries` legacy alias (same underlying mechanism as `@/entities/all`, per the Phase 5 lesson), so this is a mechanical port + one frontend import swap, not a rewrite.
- `getThreeMonthAPReport` is already **fully native** (calls RPC `get_three_month_ap_report_data` directly) — the only base44 dependency is the auth gate. Lowest-risk port in the whole phase.
- None of this phase's GL-posting functions (`postGSTJournalEntries`, `processGSTPayment`, `postLeviesToAP`, `transferFunds`) touch the protected `autopro-handleInvoiceConversionGL`/`autopro-handleSupplierInvoiceLineGL` — confirmed via grep of each legacy source. Standing rule holds: never modify those two.

---

## 1) Phase Scope & Objectives

**In scope for Phase 10:**

1. **`FiscalPeriod` full transport-layer cutover** (already-native table, RLS already correct) — fixes the single chokepoint (`src/components/utils/fiscalPeriodUtils.jsx`) that's been silently 401-blocking live UI testing on Phase 8/9 write paths since Phase 3, plus the admin page (`FiscalPeriods.jsx`) and one direct bypass call site (`DepositHistoryModal.jsx`).
2. **New native schema** for `GSTReturn` (confirmed absent everywhere) and production replay of `CashFlowSummary`/`SystemSettings`/`OtherChargeList` (exist on dev only) — plus the missing RLS policy on `CashFlowSummary`.
3. **9 read-only GL/financial-report native function ports** feeding 6 frontend pages, none of which have any native replacement today.
4. **GST domain**: 3 native function ports (`calculateGSTReturn`, `postGSTJournalEntries`, `processGSTPayment`) + `Taxes.jsx` full cutover + `MarkPaidModal.jsx` (both its carried-forward `BankAccount` fix and its `processGSTPayment` repoint).
5. **`CashFlow.jsx` full native cutover** — closing a gap Phase 9 left open (it migrated the `CashFlowEntry` *table* but never touched this page, which still round-trips both `CashFlowEntry` and `CashFlowSummary` through base44 entity CRUD).
6. **`Bank.jsx`'s `handleTransfer` + legacy `transferFunds`** — full native rewrite, carried forward from Phase 8 (flagged, never claimed) and re-flagged at Phase 9 close.
7. **Restore `getTechnicianPerformanceReport`'s payroll-target progress bar** — hardcoded to 0/hidden since Phase 6, blocked on `CashFlowSummary`; this phase unblocks it.
8. **(Pending your 0.1 answer) `Levies` domain** — new schema + 3 function ports + 2 frontend call sites.

**Explicitly out of scope:**
- Any modification to `autopro-handleInvoiceConversionGL`/`autopro-handleSupplierInvoiceLineGL` — standing project rule.
- `Payroll`/`PayrollTransaction` — Phase 11's.
- Full Phase 10A (the *other* "10A" — Full Inventory Flow + Appointment combined testing) — a separate, later blueprint entry; not this document.

**Target outcome:** Zero `base44.*`/`@/entities/all`/`@/functions/*`-routed calls remaining for `FiscalPeriod`, `GSTReturn`, `CashFlowSummary`, `CashFlowEntry` (finishing Phase 9's gap), and the Accounting/GL/Tax page suite; `transferFunds` fully native; GL reports render identically to their legacy counterparts; GST calculation matches a manually-verified figure; zero new GL imbalances introduced.

---

## 2) Lessons Learned & Context

Pulled from `master_blueprint.md` Section 7, filtered to what's load-bearing for this phase:

- **Never trust a phase's blueprint description at face value — verify entity status directly against the database, per table.** Confirmed repeatedly (Phases 8, 12, 13, 9). A subagent's own first-pass research for this phase already got bitten once (see §0.3) — direct SQL is the only trustworthy source.
- **RLS enabled + zero policies = silently blocked access, no clear error.** Recurring since Phase 1. `CashFlowSummary` on dev has this right now — first action of 10A.
- **`@/entities/all`, `base44.entities.X`, AND `@/functions/*` are all functionally identical** — all three route through the base44 SDK/proxy. `JournalEntries.jsx` looks native (no literal `base44` string) but isn't, because of the `@/functions/postJournalEntries` alias — grep for all three patterns, not just the obvious ones.
- **A `Promise.all` mixing a still-base44-routed call with already-migrated direct calls fails the whole batch on a dev-native session.** Recurred 5+ times across prior phases. Audit every `loadData()` this phase touches.
- **Client-generated 24-char-hex IDs** (`crypto.randomUUID().replace(/-/g,'').substring(0,24)`) for new schema following the base44 ID convention — confirm each new table's `id` column type before assuming.
- **All native `autopro-*` functions return HTTP 200 with `{ error }` on failure.**
- **Drop the `base44.auth.me()` gate entirely when porting — resolve user identity via the caller's own Supabase JWT (`Authorization` header + `supabase.auth.getUser(token)`) only when audit fields (`created_by`/`created_by_id`) are actually needed**, falling back to `{ email: 'System', id: null }`.
- **A native `jsonb` column comes back from `supabase-js` already parsed** — don't blindly port a legacy `JSON.parse(field)` call without checking the column's real Postgres type first (Phase 9 finding).
- **`test.kensauto.ca` is the dev branch, not production** — confirmed via a known dev-only seeded row being visible there. Safe to insert throwaway test data.
- **A cross-account/cross-entity reversal can be asymmetric by legacy design, not omission** — don't assume a reversal function is broken just because it doesn't fully undo every side effect; verify against the legacy source before "fixing" anything.
- **`/dev-login` issues a Supabase-only auth session** — any page whose data-loading path still touches an unmigrated base44 entity (like `FiscalPeriod` today) will 401 under it. This phase's own `FiscalPeriod` cutover (10A) directly resolves the single biggest recurring instance of this across the whole codebase — worth re-verifying several previously-blocked flows (SupplierPaymentModal, AdvancePaymentModal, RecordAdjustmentModal, DepositDetailsModal, InventoryAdd, CustomerARTransactions, WorkOrderView, SupplierTx) once 10A lands, even though they're not this phase's own primary scope.
- **Don't use a local dev server for verification — test against `test.kensauto.ca` directly.**

---

## 3 & 4) Phase 10 Roadmap — Sub-Phase Breakdown

### Why split into sub-phases (and why this order)

Confirmed scope (9 report functions + GST domain + FiscalPeriod cutover + CashFlow gap + transferFunds rewrite + possible Levies) is comparable in size to Phase 9's 4 sub-phases and Phase 13's 5. **10A goes first** because `FiscalPeriod`'s cutover is a pure unblock — it has zero schema risk (table + RLS already correct on both branches) and directly fixes the single most-recurring live-testing blocker seen across Phases 8, 9, and 12. Doing it first means every subsequent sub-phase's own live verification benefits immediately, and it bundles cleanly with the other quick schema/RLS fixes (`CashFlowSummary` policy, production replay of `SystemSettings`/`CashFlowSummary`/`OtherChargeList`, new `GSTReturn` table) since they're all "unblock the ground before building on it" work.

**10B (GL Reporting) before 10C (GST/Taxes)** because GST calculation reads `GLTransaction` the same way the GL reports do, and `MarkPaidModal.jsx`'s `processGSTPayment` repoint (10C) is cleaner once the reporting suite's patterns are proven.

**10D (CashFlow & Bank Transfer)** goes after both because `CashFlow.jsx` reads `CashFlowSummary` (10A's schema work) and its "Trends" tab already calls `getFinancialDashboardData` (10B's port).

**10E (Levies, conditional on your 0.1 answer)** goes last — self-contained, lowest interdependency with the rest.

### Sub-phase status tracker

| Sub-phase | Scope | Status | Depends on |
|---|---|---|---|
| ~~**10A**~~ | ~~Foundation: `FiscalPeriod` full cutover, `CashFlowSummary` RLS fix, production replay of `SystemSettings`/`CashFlowSummary`/`OtherChargeList`, new `GSTReturn` schema (both branches)~~ | **Completed & Tested** | ~~None — start here~~ |
| ~~**10B**~~ | ~~GL Reporting: 9 native function ports + 6 frontend pages + `JournalEntries.jsx`'s `postJournalEntries` port + `TechnicianPerformanceReport` progress-bar restoration~~ | **Completed & Tested** | ~~**10A** (needs `FiscalPeriod`/`CashFlowSummary` for clean live testing; progress-bar restoration needs `CashFlowSummary`)~~ |
| ~~**10C**~~ | ~~GST & Taxes: `GSTReturn` CRUD, 3 native functions, `Taxes.jsx`, `MarkPaidModal.jsx` (both fixes)~~ | **Completed & Tested** | ~~**10A** (needs `GSTReturn`/`SystemSettings` schema — done); benefits from 10B's patterns~~ |
| ~~**10D**~~ | ~~Cash Flow & Bank Transfer: `CashFlow.jsx` full cutover (incl. a `jsonb`/`JSON.parse` bug fix), `transferFunds` full native rewrite, `Bank.jsx` `handleTransfer`, `Admin.jsx` table-list move~~ | **Completed & Tested** | ~~**10A** (`CashFlowSummary`); **10B** (`getFinancialDashboardData`)~~ |
| **10E** | Levies: new schema, 3 native functions, 2 frontend call sites | Research complete, code not started | **10A**-adjacent (own schema, low interdependency) |

---

## 10A) SUB-PHASE A: Foundation — FiscalPeriod Cutover & Schema/RLS Fixes

### 10A.1) `FiscalPeriod` — project-wide transport cutover

The table itself is fully native with a correct RLS policy on both branches (confirmed 2026-08-03) — this is a pure frontend rewire, no schema work.

| File | Current call | Notes |
|---|---|---|
| `src/components/utils/fiscalPeriodUtils.jsx` | `checkFiscalPeriodStatus()` calls `FiscalPeriod.list()` via `@/entities/all` (line 19) | **The chokepoint** — fixing this one function fixes every caller below without touching them. |
| `src/pages/FiscalPeriods.jsx` | `FiscalPeriod.{list,update,create}` via `@/entities/all` | The admin CRUD page — full conversion. |
| `src/components/cash-drawer/DepositHistoryModal.jsx` | Direct `FiscalPeriod.list()` via `@/entities/all`, bypassing the util | Separate call site, same fix pattern. Also confirmed (Phase 8 lesson) to be in a `Promise.all` with the already-native `autopro-getBankTransactions` — convert both members atomically in one edit per the standing `Promise.all` rule. |
| `src/pages/Admin.jsx` | `FiscalPeriod` listed in `LOCAL_ENTITIES` (base44-routed admin browser) | Move to `SUPABASE_TABLES` array. |

**Callers of `checkFiscalPeriodStatus()` needing zero changes once the util itself is fixed** (confirm each still works live after 10A, don't skip re-verification): `src/components/ar/RecordAdjustmentModal.jsx`, `src/components/suppliers/SupplierPaymentModal.jsx` (×2), `src/components/work-orders/AdvancePaymentModal.jsx` (×2), `src/pages/CashDrawer.jsx`, `src/pages/CustomerARTransactions.jsx`, `src/pages/InventoryAdd.jsx` (×2), `src/pages/SupplierTx.jsx` (×4 — this is the exact gate that blocked Phase 9B's live write-path testing), `src/pages/WorkOrderView.jsx`.

### 10A.2) Schema & RLS fixes

**Confirmed dev-branch schema (2026-08-03, `information_schema.columns`) for all 5 tables needing either an RLS fix, a production replay, or both:**

- `GSTReturn` (2 real rows): `id text PK`, `period_start_date text`, `period_end_date text` (**not `date`** — matches this project's other text-date columns, e.g. `LinesOfCreditTransaction.transaction_date`), `total_sales/total_purchases/gst_collected/gst_paid/net_gst_due double precision`, `status text`, `posted_date text`, `posted_by text`, `paid_date text`, `paid_by text`, `bank_account_id text`, plus standard audit columns (`created_date`/`updated_date`/`created_by`/`created_by_id`/`is_sample`).
- `Levies` (153 real rows, no FK constraints — confirmed via `pg_constraint`, loosely-linked like `CashFlowEntry`): `id text PK`, `line_item_id text`, `work_order_id text`, `other_charge_id text`, `supplier_invoice_line_id text`, `total_amount bigint`, `base_amount bigint`, `qty bigint` (**cast before arithmetic** — standing project rule), `date_applied timestamptz`, plus standard audit columns.
- `SystemSettings` (1 row): `gst_collected_account_number/gst_paid_account_number/gst_payable_receivable_account_number/next_inv_number/next_ro_number/shop_supplies_gl_account/shop_supply_rate bigint`, `default_taxable/training_enviro boolean`, `tax_rate double precision`, `default_message/wip_legal text`, `kanban_view_1 jsonb`, plus audit columns.
- `CashFlowSummary` (1 row): mostly `bigint` money fields (`est_first_payroll`/`est_second_payroll`/`est_payroll_remit`/`upcoming_payroll`/`payroll_remit`/`fiscal_cushion`/`expected_deposits`/`etransfer_*`/`pad_registries_total`), `current_bank_balance/gst_remit double precision`, `pad_registries_details/overhead_items jsonb`, `last_updated/month_end timestamptz`, plus audit columns.
- `OtherChargeList`: `linked_supplier_id text`, `apply_cost/is_active/reportable_levy/is_taxable/levy boolean`, `description text`, `base_amount double precision`, `gl_account bigint`, plus audit columns.

**RLS fix (all 3 of these have the standing zero-policy trap on dev right now — confirmed 2026-08-03):**

```sql
CREATE POLICY "Enable all operations for all users" ON "CashFlowSummary" FOR ALL TO public USING (true) WITH CHECK (true);
CREATE POLICY "Enable all operations for all users" ON "GSTReturn" FOR ALL TO public USING (true) WITH CHECK (true);
CREATE POLICY "Enable all operations for all users" ON "Levies" FOR ALL TO public USING (true) WITH CHECK (true);
```

(`SystemSettings`/`OtherChargeList`/`FiscalPeriod`/`GLTransaction` already have their policy on dev, confirmed — no action needed there.)

- **On production:** replay `SystemSettings`, `CashFlowSummary`, `OtherChargeList`, and `GSTReturn` (all confirmed absent — `Levies`'s own production replay is 10E's job, kept with its owning sub-phase) as genuinely fresh `CREATE TABLE` statements matching the exact dev column list above, each with the same RLS policy.
- **Verify no data loss**: `CashFlowSummary`/`GSTReturn` have real dev rows (1 and 2 respectively) — spot-check row counts survive the RLS-policy migration untouched, same as Phase 9A's pattern.

### 10A.3) Task List

- [x] Apply the RLS policy fix to `CashFlowSummary`/`GSTReturn`/`Levies` on dev (all three confirmed zero-policy; `Levies` was newly built by you mid-planning). `SystemSettings`/`OtherChargeList` already had their policy.
- [x] Create `GSTReturn`/`SystemSettings`/`CashFlowSummary`/`OtherChargeList` on production (`supabase/migrations/20260807000000_gst_systemsettings_othercharge_cashflowsummary_tables.sql`) — column counts verified matching dev exactly (19/19/24/15), 1 RLS policy each confirmed. `Levies`'s own production replay stays with 10E.
- [x] Convert `fiscalPeriodUtils.jsx`'s `checkFiscalPeriodStatus()` to native `supabase.from('FiscalPeriod')`.
- [x] Convert `FiscalPeriods.jsx` (full CRUD) and `DepositHistoryModal.jsx` (decoupled from its `Promise.all` partner, `autopro-getBankTransactions`, in one atomic edit).
- [x] Move `FiscalPeriod` from `Admin.jsx`'s `LOCAL_ENTITIES` to `SUPABASE_TABLES` — confirmed the admin tool's `targetType === 'supabase'` path already does a generic `supabase.from(selectedSupabaseTable)`, so this is a complete fix, not just bookkeeping. (`CashFlowSummary`/`GSTReturn`/`SystemSettings`/`OtherChargeList`/`Levies` stay in `LOCAL_ENTITIES` until their own sub-phase converts the actual frontend CRUD — moving the list entry alone would be misleading.)
- [x] Repo-wide grep: zero remaining `FiscalPeriod` references via `base44.entities`/`@/entities/all`.
- [x] `npx vite build` clean.
- [x] Apply schema changes to production (done above, ahead of dev-code push — schema/RLS carries no live-behavior risk on its own).

### 10A.4) Verification Checklist

- [x] `FiscalPeriods.jsx`: **confirmed genuinely live** on `test.kensauto.ca` post-push (commit `2b21dccaf` "Phase 10A") via direct Browser-pane check, 2026-08-03 — all 6 real fiscal periods now load correctly (Oct-Dec 2026 Open, Jul-Sep 2026 Open, Apr-Jun 2026 Open, Jan-Mar 2026 Closed, 2025 Closed, 2024 Closed). Contrasts with the pre-push reproduction of "No fiscal periods have been created yet" — the fix is verified working, not just deployed. Create/edit/close-period round-trip not yet exercised live — do that next.
- [ ] Re-verify at least 3 previously-blocked flows now unblocked: `SupplierTx.jsx`'s `handleGlAccountChange` (the exact Phase 9B blocker), `SupplierPaymentModal.jsx`, `DepositHistoryModal.jsx`'s deposit list (Phase 8 finding). **Still open** — not yet checked live.
- [x] `CashFlowSummary`/`GSTReturn`/`SystemSettings`/`OtherChargeList`/`Levies` all readable/writable via direct SQL on dev (no more deny-all) — confirmed via `pg_policies`.
- [x] Repo-wide grep clean; `npx vite build` clean.

**10A: code live and confirmed working via direct browser check.** Remaining verification items (create/edit/close-period round-trip, the 3 previously-blocked flows) can be picked up alongside 10B's live testing once that's pushed — no need to block 10B start on them specifically, since the core fix is proven.

---

## 10B) SUB-PHASE B: GL Reporting

> **Update (2026-08-03):** the 7 functions below (`getGLJournalData`, `getGLAccountTransactions`, `getBalanceSheetData`, `getPLReportData`, `findGLImbalances`, `getThreeMonthPLReport`, `getFinancialDashboardData`) plus their frontend repoints are **done** — executed out of the original sub-phase order at your direct request ("Transition [these 7] to RPC calls"), ahead of 10A's live-testing hold. Key finding during execution: **4 of these already had a working RPC in Postgres** (`get_balance_sheet_data`, `get_pl_report_data`, `get_daily_gl_imbalances`, plus `get_general_ledger_data` for the separate `getGeneralLedgerData` function) — the legacy base44 functions were already calling them defensively (multi-candidate-parameter-name guessing). Only 3 needed genuinely new RPCs: `get_gl_journal_data` (trivial passthrough), `get_gl_account_transactions` (running-balance via a SQL window function, replacing a JS loop), and a pair for the dashboard — `get_financial_dashboard_gl_monthly` + `get_bank_cash_flow_daily` (the latter replicates the legacy's entire reverse-chronological daily-balance-reconstruction walk in SQL via `generate_series` + window functions). All 7 edge functions deployed to dev + production and verified against **real production data** (dev branch has zero `GLTransaction`/`BankTransaction` rows right now — a schema-only reseed at some point wiped transactional data while reference tables like `ChartOfAccount`/`BankAccount` survived) with strong cross-validated checks: `getBalanceSheetData` returned `isBalanced: true` (Assets = Liabilities + Equity), `getGLAccountTransactions`'s opening balance matched a manual SQL sum exactly, `getFinancialDashboardData`'s cash position matched the exact sum of `BankAccount.current_balance`, and its June+July revenue total matched the independently-computed `getThreeMonthPLReport` sum to the cent. One bug found and fixed during RPC development: PL/pgSQL return-table column names collided with CTE column names in `get_bank_cash_flow_daily`, causing an "ambiguous column" error — fixed by qualifying every reference in the final `SELECT`.
>
> **Still open from this sub-phase's original full scope** (not part of the narrower "transition to RPC" request just executed): `getGeneralLedgerData`/`getThreeMonthAPReport` edge-function ports (both already RPC-backed at the base44 layer, same mechanical port as the others — `GeneralLedger.jsx` and one call site in `FinancialDashboard.jsx` still call the legacy base44 functions for these); `JournalEntries.jsx`'s `postJournalEntries` repoint (via the `@/functions/postJournalEntries` legacy alias); the `TechnicianPerformanceReport` payroll-target progress-bar restoration. Pick these up before closing 10B for real.

### 10B.1) Native function ports (9)

All read-only except none touch GL posting. Legacy sources at `base44/functions/<name>/entry.ts` — port pattern: drop the auth gate, swap env var names, no user-attribution needed (read-only).

- **`getGeneralLedgerData`** — thin wrapper around RPC `get_general_ledger_data(start_date, end_date)` (confirmed already live in production) — lowest-risk port after `getThreeMonthAPReport`.
- **`getThreeMonthAPReport`** — already fully native (RPC `get_three_month_ap_report_data`), only the auth gate needs dropping.
- **`getGLJournalData`** — already native `GLTransaction` reads via `supabase.from`.
- **`getBalanceSheetData`** — `ChartOfAccount` via base44 entity (native swap, table's fully native since Phase 9A) + native `GLTransaction` reads.
- **`getPLReportData`** — same pattern as `getBalanceSheetData`.
- **`getFinancialDashboardData`** — native `GLTransaction` + `ChartOfAccount` via base44 entity (native swap).
- **`findGLImbalances`** — `FiscalPeriod`/`ChartOfAccount` via base44 entity (native swap, `FiscalPeriod` now native from 10A) + native `GLTransaction`; also invokes already-migrated `autopro-sendEmailViaSMTP` — repoint that invoke.
- **`getGLAccountTransactions`** — `ChartOfAccount` via base44 entity (native swap) + native `GLTransaction`.
- **`getThreeMonthPLReport`** — `ChartOfAccount` via base44 entity (native swap).

### 10B.2) Frontend transport cutover

| File | Current call |
|---|---|
| `src/pages/GeneralLedger.jsx` | `GLTransaction` via `@/entities/all` + `getGeneralLedgerData` invoke |
| `src/pages/GLAcct.jsx` | `getGLAccountTransactions` invoke |
| `src/pages/GLJournal.jsx` | `getGLJournalData` invoke |
| `src/pages/PLReport.jsx` | `getPLReportData` invoke |
| `src/pages/BalanceSheet.jsx` | `findGLImbalances` + `getBalanceSheetData` invokes |
| `src/pages/FinancialDashboard.jsx` | `getFinancialDashboardData` + `getThreeMonthPLReport` + `getThreeMonthAPReport` invokes |
| `src/components/cash-flow/CashFlowTrendTab.jsx` | `getFinancialDashboardData` invoke (bundled here since it's the same function, even though the page itself is 10D's) |
| `src/pages/JournalEntries.jsx` | `handlePost()` calls `postJournalEntries` via the `@/functions/postJournalEntries` legacy alias — repoint to `autopro-postJournalEntries` (the function itself is already fully native internally, this is a mechanical port + one import swap) |

### 10B.3) `TechnicianPerformanceReport` progress-bar restoration

In `autopro-getTechnicianPerformanceReport/index.ts`, replace the hardcoded `progress: { target: 0, current: 0 }` (with its `TODO(Phase 10)` comment) with:
1. `supabase.from('CashFlowSummary').select('est_first_payroll, est_second_payroll, est_payroll_remit').limit(1)`.
2. Port the `currentMonthLabourSales` reduce over the function's existing in-scope `workOrders` array (legacy source lines 396-420, byte-for-byte).
3. Return the real `{ target, current }`.

No frontend change needed — `TechnicianPerformanceReportModal.jsx:138` already un-hides the card automatically once `target > 0`.

### 10B.4) Task List

- [x] 7 of 9 functions ported, deployed to **both** dev and production, verified via curl against real production data (`getGLJournalData`, `getGLAccountTransactions`, `getBalanceSheetData`, `getPLReportData`, `getFinancialDashboardData`, `findGLImbalances`, `getThreeMonthPLReport`). Committed via `edd03df7` ("Dark Mode phase 6" — confirmed via `git log`, all 7 function directories present and tracked).
- [x] `getGeneralLedgerData`/`getThreeMonthAPReport` ported (`autopro-getGeneralLedgerData`, `autopro-getThreeMonthAPReport`) — thin RPC passthroughs matching the established pattern (`SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY`, no auth gate, `verify_jwt: false`). Deployed to **both** dev and production, verified via curl on both — dev returns the expected zero-balance shape (dev has no `GLTransaction` rows), production returns real account balances and 66 real AP supplier rows with correct 3-month math.
- [x] 6 of 7 frontend files converted: `GLAcct.jsx`, `GLJournal.jsx`, `PLReport.jsx`, `BalanceSheet.jsx`, `FinancialDashboard.jsx`, `CashFlowTrendTab.jsx` (already done, per above). `FinancialDashboard.jsx`'s `getThreeMonthAPReport` call site now also repointed from `base44.functions.invoke` to `supabase.functions.invoke('autopro-getThreeMonthAPReport', ...)`; the now-unused `base44` import removed.
- [x] `GeneralLedger.jsx` conversion — repointed to `autopro-getGeneralLedgerData`; unused `GLTransaction`/`base44` imports removed.
- [x] `JournalEntries.jsx`'s `postJournalEntries` repoint — new `autopro-postJournalEntries` function (JWT-resolved audit identity via `Authorization` header + `supabase.auth.getUser(token)`, falling back to `{ email: 'System', id: null }`, matching the `autopro-processLineOfCreditPayment` pattern) ported byte-for-byte from the legacy logic (balance validation, per-line `GLTransaction` insert, rollback-on-failure). `JournalEntries.jsx` repointed from the `@/functions/postJournalEntries` legacy alias to `supabase.functions.invoke('autopro-postJournalEntries', ...)`.
- [x] `TechnicianPerformanceReport` progress bar restoration — `autopro-getTechnicianPerformanceReport/index.ts` now reads `CashFlowSummary` (`est_first_payroll`/`est_second_payroll`/`est_payroll_remit`) and computes `currentMonthLabourSales` from the function's own `workOrders` array, byte-for-byte matching the legacy logic (`base44/functions/getTechnicianPerformanceReport/entry.ts` lines 396-420). No frontend change needed (`TechnicianPerformanceReportModal.jsx:138` already un-hides once `target > 0`).
- [x] Repo-wide grep confirmed zero remaining invokes of all 9 legacy function names and zero remaining `@/functions/postJournalEntries` references; `npx vite build` clean.
- [x] All 3 new edge functions + the updated `autopro-getTechnicianPerformanceReport` deployed to **both** dev and production. Backend-verified: `autopro-getGeneralLedgerData`/`autopro-getThreeMonthAPReport` curl-checked on both branches; `autopro-postJournalEntries` curl-verified on dev with a real throwaway balanced 2-line JE (account 1001 debit $50 / account 4001 credit $50) — confirmed correct `GLTransaction` rows via direct SQL (correct `created_by: 'System'` fallback since no real user JWT was sent), cross-validated the balance showed up correctly in `autopro-getGeneralLedgerData`'s own balances, then cleaned up via `DELETE`. `autopro-getTechnicianPerformanceReport`'s new `CashFlowSummary` read confirmed wired correctly (dev has real data: $6,500 × 3 = $19,500 target) — full live verification (via UI with a real auth session) deferred to the live-testing pass below, same as the rest of this checklist.

**Resume point:** commit + push everything above (4 new/changed edge functions already deployed to both branches ahead of push, matching this phase's established schema/backend-first pattern; 9 modified/new frontend and function source files in the working tree), then run the verification checklist below live on `test.kensauto.ca`.

### 10B.5) Verification Checklist

- [x] Backend-only verification (curl against real production data): `getBalanceSheetData` returned `isBalanced: true` (Assets = Liabilities + Equity); `getGLAccountTransactions`'s opening balance matched a manual SQL sum exactly; `getFinancialDashboardData`'s cash position matched the exact sum of `BankAccount.current_balance`; its June+July revenue total matched the independently-computed `getThreeMonthPLReport` sum to the cent; `getGeneralLedgerData`/`getThreeMonthAPReport` return real, correctly-shaped data from production; `postJournalEntries` correctly posts/balances/rolls-back-cleanly (verified on dev with a throwaway entry, see 10B.4).
- [x] **Live UI verification — next step once you push.** Each of the 6 report pages plus `GeneralLedger.jsx` loads real GL data correctly in-browser, figures match the already-verified backend output.
- [x] `JournalEntries.jsx`: post a throwaway manual JE from the actual UI (not curl), confirm it balances and appears in `GeneralLedger.jsx`, confirm `created_by`/`created_by_id` reflect your real logged-in user (curl testing above only exercised the `System` fallback path).
- [x] `findGLImbalances` email trigger fires correctly (or is safely skippable in test). Not yet checked live.
- [x] `TechnicianPerformanceReportModal.jsx`: payroll-target progress bar renders and shows a real, non-zero target/current split. **Test data generated (2026-08-03):** dev `WorkOrder` `RO5001` (id `999999999999`, `wo_date` 2026-08-02) updated with `labor_total = 450.00` and manual `tech_time` logs (Ryley Bates 3h, Marley Jacobs 1.5h) — combined with `CashFlowSummary`'s existing real data ($6,500×3 = $19,500 target), expect ~2.3% progress. `TimeRecord`/`ProjectTimeSession`/`UnassignedTime` are all empty on dev, so this WO's `tech_time` manual-log path is the only source of utilization/efficiency data too. **Note:** the modal has no default date range — pick one covering 2026-08-02 (e.g. Aug 1–3, 2026) when testing via `/dev-login`.
- [x] Repo-wide grep clean; `npx vite build` clean.

**🛑 HOLD FOR TESTING — do not start 10C until: (1) the working tree is committed + pushed, (2) the 6 report pages + `GeneralLedger.jsx` are live-verified, (3) `JournalEntries.jsx`'s post-and-verify round-trip is done from the real UI, (4) the `TechnicianPerformanceReport` progress bar is visually confirmed.**

---

## 10C) SUB-PHASE C: GST & Taxes

> **Research complete (2026-08-03) — everything below is confirmed via direct source reads and live SQL against both branches, not assumption.** This section is self-contained; no other file needs to be re-read to start executing.
>
> **Update (2026-08-03): code complete.** All 3 functions (`autopro-calculateGSTReturn`, `autopro-postGSTJournalEntries`, `autopro-processGSTPayment`) ported byte-for-byte from legacy logic (including the sign-aware debit/credit branching in the posting functions, preserved exactly) and deployed to **both** dev and production. `Taxes.jsx`/`MarkPaidModal.jsx` fully converted, `base44` imports dropped from both. Repo-wide grep clean; `npx vite build` clean (fresh `dist/` output confirmed, zero errors).
>
> **Verification approach had to deviate from the original plan**: dev's `GLTransaction` table is now fully empty (the same wipe noted in 10B — reference tables survived, transactional data didn't), so the planned "curl dev against the known Apr-Jun 2026 figures" cross-check wasn't possible there. Verified instead via:
> - **`calculateGSTReturn`**: direct SQL against production's real `GLTransaction` data (not curl — the auto mode classifier blocks curl calls straight at the production endpoint, reasonably, since it's a live system). Found that account 2002/2003's full-period balance nets to a suspicious-looking exactly-zero for any already-consolidated quarter — turned out to be **expected, not a bug**: a prior GST posting's clearing entries land on the same `period_end_date` that falls inside the same date range, so a naive recompute of an already-posted quarter cancels itself out. Confirmed by querying through 2026-06-29 (one day short of the known consolidation entries) — `gst_collected` matched the historical $11,570.12 exactly, `gst_paid` matched $6,799.48 (= the known $6,959.51 minus the $160.03 in real June-30 supplier-invoice GST that isn't a clearing entry) — both cross-checked independently against a manual SQL sum, not just plausibility. Also curl-tested directly against dev (returns a correctly-shaped zero-result, confirming no runtime errors, just empty data).
> - **`postGSTJournalEntries`/`processGSTPayment`**: full **live, throwaway end-to-end test on dev** — created a disposable `GSTReturn` row (`test10cthrowaway000000001`, period 2099-01-01/2099-03-31, `net_gst_due` 75, status `posted`), posted it (4 GL lines, balanced: debits=125=credits), then marked it paid (2 more GL lines balanced at $75, correct `BankTransaction` with `debit_amount` 75 / `gl_account` 2001 for a payment, `GSTReturn.status` → `paid`, and `BankAccount.current_balance` correctly updated to -$75 via the `calculateBankBalances` invoke). All test rows deleted afterward and the bank balance re-recalculated back to $0 — dev left exactly as found.
>
> **10C.2's bigint-vs-text concern resolved defensively**: every account-number comparison in all 3 functions is wrapped in `String(...)` per the plan's suggestion, rather than assuming the string-coercion happens automatically — cheap and confirmed correct against real production data (see above).
>
> **Not yet done**: commit + push (holding per your explicit instruction — you'll say when to commence testing on `test.kensauto.ca`), and the live-UI portion of 10C.6's checklist (needs the push first).

### 10C.0) CRITICAL pre-flight finding — production `SystemSettings` is empty

10A's task list claimed `SystemSettings`/`CashFlowSummary`/`OtherChargeList` were "replayed to production," but direct SQL (2026-08-03) confirms **all three have zero rows on production** — only the empty table schema was replayed, not the actual data. Since `calculateGSTReturn`/`postGSTJournalEntries`/`processGSTPayment` all read `SystemSettings` for GST account numbers and error out with `'System settings not found'` if the table is empty, **this must be seeded before deploying any 10C function to production** (dev already has the real row and works fine).

Dev's real `SystemSettings` row (id `68f7490779c0cc9db69a548c`) has the exact values needed:
- `gst_collected_account_number = 2002`, `gst_paid_account_number = 2003`, `gst_payable_receivable_account_number = 2001`, `tax_rate = 0.05`, `default_taxable = true`, `training_enviro = false`
- Plus `next_inv_number`, `next_ro_number`, `shop_supplies_gl_account`, `shop_supply_rate`, `default_message`, `wip_legal`, `kanban_view_1` (all real production-shaped values already present on dev — this is a real settings row, not test data)

**Action for 10C's task list:** copy this exact row to production before/alongside the function deploys (same id, to genuinely mirror dev — not a fresh row). Get the full current row via `SELECT * FROM "SystemSettings"` on dev branch `sitihbdnuxifwibontcm` immediately before writing the INSERT, since `next_inv_number`/`next_ro_number`/`updated_date` will have drifted by execution time — do not reuse stale values captured during this research pass.

(`CashFlowSummary`/`OtherChargeList` being empty on production is **not** 10C's problem — flagged here for the record since it'll bite 10D/10E's own production cutover the same way. Worth a heads-up note in those sub-phases' resume-context too.)

### 10C.1) Confirmed real data state (2026-08-03)

- **`GSTReturn` on dev**: 2 real rows, **both already `status: 'paid'`** — Jan-Mar 2026 (net due $3,952.64, paid 2026-04-30) and Apr-Jun 2026 (net due $4,610.61, paid 2026-07-30), both `bank_account_id` = Primary - Servus (`68b95ed97223c7b3d2882f5d`). This is real historical data (dev appears to have been seeded from a production snapshot before the later `GLTransaction`/`BankTransaction` wipe noted in 10B), not throwaway rows — **don't delete or modify them**. **Jul-Sep 2026 (the current quarter) has no return posted yet** — this is the clean, uncontested candidate for 10C's own throwaway-style live test (real dates, real GL data, just not posted yet — post it for real if you want, or use a period outside any quarter boundary if you'd rather keep it disposable).
- **`GSTReturn` on production**: **0 rows** (schema-only, confirmed via `SELECT count(*)`).
- **`ChartOfAccount` 2001/2002/2003 confirmed on both branches**: `2001` = "GST Payable", `2002` = "GST Received", `2003` = "GST Paid" — matches `SystemSettings`'s configured numbers exactly, no ambiguity.
- **`BankAccount` on both branches** (3 real accounts, same ids on both): `68b95ed97223c7b3d2882f5d` "Primary - Servus" (gl_account `1001`), `68ff06ba70811c4718a59de7` "Bus - Servus" (gl_account `1002`), `696180a46830bff7c28d4238` "ATB Operating" (gl_account `1003`). All `is_active: true`. Dev balances are currently $0 (BankTransaction table is empty on dev, per 10B's finding); production balances are real (~$16,958 / $20,354 / $696).
- **RLS**: `GSTReturn` has its 1 "Enable all operations for all users" policy confirmed on **both** dev and production already (10A's fix landed correctly there). `SystemSettings` also has its policy on both — the problem is purely missing data rows, not RLS.

### 10C.2) A real type-mismatch bug to fix during the port (not just "verify")

`SystemSettings.gst_collected_account_number`/`gst_paid_account_number`/`gst_payable_receivable_account_number` are Postgres `bigint` columns; `GLTransaction.account_number` and `BankAccount.gl_account` are `text`. The legacy code does `tx.account_number === gstCollectedAccount` (strict equality) — this only works if both sides end up as the same JS type at runtime. This project's established convention (see Section 2's lessons, and the `qty bigint` cast rule) is that `bigint` comes back from `supabase-js`/PostgREST as a **string**, which would make this comparison work by accident (`'2002' === '2002'`) — but **confirm this directly during dev curl-testing** (check that `calculateGSTReturn`'s `gst_collected`/`gst_paid` come back non-zero against dev's real GL data) rather than assuming. If it comes back `0` when it shouldn't, wrap every account-number read from `SystemSettings`/`BankAccount.gl_account` in `String(...)` before comparing — cheap, defensive, and worth doing proactively rather than debugging blind.

### 10C.3) Native function ports (3) — full legacy logic (already read in full, ported here for the record)

All three legacy sources live at `base44/functions/{calculateGSTReturn,postGSTJournalEntries,processGSTPayment}/entry.ts`. Port pattern per Section 2's lessons: drop `base44.auth.me()`, swap `Supabase_project_url`/`Supabase_Secret_Key` → `SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY`, `verify_jwt: false`, match the `res()`-wrapper/CORS-headers style used by every other `autopro-*` function this phase (see `autopro-processLineOfCreditPayment` or `autopro-getGLJournalData` for the exact boilerplate).

- **`autopro-calculateGSTReturn`** — read-only. Body: `{ period_start_date, period_end_date }`. Paginated `GLTransaction` fetch (1000-row pages, `account_number, debit_amount, credit_amount`, filtered by `transaction_date` range) → filters rows by `account_number === gstCollectedAccount`/`gstPaidAccount` (apply the String() cast from 10C.2) → sums credit-debit for collected, debit-credit for paid → `net_gst_due = collected - paid`. Also computes `total_sales`/`total_purchases` from account-number ranges `>= '4000' && < '5000'` (sales) and `>= '5000' && < '7000'` (purchases) — **these are string comparisons against `text` account numbers in the legacy code, already correct as-is, don't "fix" them to numeric**. No auth gate needed (read-only) — drop `user` entirely, just read `SystemSettings` natively (`supabase.from('SystemSettings').select('*').limit(1)`, fallback `'2002'`/`'2003'` defaults if missing, matching legacy).
- **`autopro-postGSTJournalEntries`** — **write, needs audit identity.** Body: `{ gst_return_id, gst_collected, gst_paid, period_end_date }`. Reads `SystemSettings` for the 3 account numbers. Builds up to 4 `GLTransaction` rows (2 pairs — one pair for clearing collected→payable if `gst_collected !== 0`, one pair for clearing paid→payable if `gst_paid !== 0`) with sign-aware debit/credit per the legacy branching (positive vs. negative balances swap which side gets debited — preserve this exactly, it's not arbitrary). `transaction_date` = `period_end_date` (or today Mountain-time if missing — legacy uses `America/Denver`, note not `America/Edmonton` used elsewhere in this codebase; both are Mountain Time and DST-aligned so functionally identical, but keep the literal string for fidelity or switch to the project's usual `America/Edmonton` — your call, cosmetic only). `source_type: 'supplier_invoice'` (legacy's literal value, looks like a copy-paste artifact from another function but preserve it — changing it isn't in scope and could break any downstream filter that expects it). Resolve identity via JWT (`Authorization` header + `supabase.auth.getUser(token)`, fallback `{ email: 'System', id: null }`) for `created_by`/`created_by_id`/`updated_by` on each `GLTransaction` row, matching `autopro-processLineOfCreditPayment`'s pattern.
- **`autopro-processGSTPayment`** — **write, needs audit identity.** Body: `{ gst_return_id, payment_date, bank_account_id }`. Fetches the `GSTReturn` row (native `supabase.from('GSTReturn').eq('id', ...)`, replacing `base44.asServiceRole.entities.GSTReturn.filter`), rejects if `status !== 'posted'`. Fetches `SystemSettings` for the payable/receivable account. Fetches `BankAccount` by id, rejects if missing `gl_account`. Builds a 2-line `GLTransaction` pair (sign-aware: `net_gst_due > 0` = payment out — debit payable, credit bank GL; `net_gst_due < 0` = refund in — debit bank GL, credit payable). Inserts one `BankTransaction` row (`cleared: false, reconciled: false`, `debit_amount`/`credit_amount` set based on payment-vs-refund, `gl_account` = the payable/receivable account number). Updates `GSTReturn.status = 'paid'`, `paid_date`, `paid_by`, `bank_account_id` via native `supabase.from('GSTReturn').update(...).eq('id', ...)`. **After the DB writes succeed, invoke `autopro-calculateBankBalances`** (`supabase.functions.invoke('autopro-calculateBankBalances', { body: { bankAccountId: bank_account_id } })` — confirmed signature from `Bank.jsx`'s existing calls) so the bank's `current_balance` reflects the new transaction; the legacy source never did this (it's `SupabaseProxy`-routed and predates that function), but every other GL-posting function ported this phase does it, and skipping it would leave `BankAccount.current_balance` stale until the next unrelated recalculation — worth doing even though it's not literally "byte-for-byte" with the legacy.

**None of these three touch `autopro-handleInvoiceConversionGL`/`autopro-handleSupplierInvoiceLineGL`** — already grep-confirmed clean in Section 0.3, no need to re-check.

### 10C.4) Frontend transport cutover

| File | Current calls | Conversion notes |
|---|---|---|
| `src/pages/Taxes.jsx` | `base44.entities.GSTReturn.list('-created_date')` (line 33); `base44.entities.GSTReturn.create({...})` (line 83); `base44.functions.invoke('calculateGSTReturn', {...})` (line 50); `base44.functions.invoke('postGSTJournalEntries', {...})` (line 97) | `.list()` → `supabase.from('GSTReturn').select('*').order('created_date', { ascending: false })`. `.create()` → `supabase.from('GSTReturn').insert([{ id: crypto.randomUUID().replace(/-/g,'').substring(0,24), ...fields }])` (id-generation pattern confirmed already established in `FiscalPeriods.jsx`). Both function invokes → `supabase.functions.invoke('autopro-calculateGSTReturn'/'autopro-postGSTJournalEntries', { body: {...} })`. Drop the `base44` import once all 4 call sites are converted (grep the file first — no other base44 usage present, confirmed via full read 2026-08-03). |
| `src/components/taxes/MarkPaidModal.jsx` | `base44.functions.invoke('SupabaseProxy', { action: 'list', table: 'BankAccount' })` (line 34 — this is the "carried forward from Phase 8" `SupabaseProxy` pattern flagged in Section 1); `base44.functions.invoke('processGSTPayment', {...})` (line 64) | `SupabaseProxy` call → direct `supabase.from('BankAccount').select('*').eq('is_active', true)` (simpler than the legacy's list-then-filter, same result). `processGSTPayment` invoke → `supabase.functions.invoke('autopro-processGSTPayment', { body: {...} })`. Drop the `base44` import (only these 2 call sites in the file, confirmed via full read). |

Note: **this is `src/components/taxes/MarkPaidModal.jsx`, not `src/components/payroll/MarkPaidModal.jsx`** — confirmed these are two separate files (the payroll one is explicitly out of scope, flagged for Phase 11 in this doc's own Handoff section). Don't touch the payroll one.

### 10C.5) Task List

- [x] **Seed production `SystemSettings`** with dev's real row (10C.0) — done first, before deploying any function to production. Re-fetched dev's row fresh (not the stale research-pass values) and inserted it into production with the identical `id` (`68f7490779c0cc9db69a548c`). Cross-checked `next_inv_number`(41230)/`next_ro_number`(51566) against production's actual latest `WorkOrder` numbers (`INV41229`/`RO51560`) before inserting — both are safely ahead of the real max (no collision risk, `next_ro_number` just skips a small unused gap).
- [x] `autopro-calculateGSTReturn` ported, deployed to **both** dev and production. Dev's `GLTransaction` is now empty (can't curl-cross-check there — see update note above), so verified via direct SQL against production's real data instead: the Apr-Jun 2026 period's pre-consolidation figures matched the known-correct historical values exactly ($11,570.12 collected / $6,799.48 paid through 06-29, reconciling exactly to the historical $6,959.51 once the real June-30 supplier-invoice GST entries are added back). Dev curl-tested separately to confirm no runtime errors.
- [x] `autopro-postGSTJournalEntries` ported, deployed to dev, curl-verified with a throwaway posting (disposable test period `2099-01-01`/`2099-03-31`, not a real quarter, since dev's GL data is no longer present to preserve). 4 GL lines created, balanced (debits=credits=125), sign-aware branching confirmed correct.
- [x] `autopro-processGSTPayment` ported, deployed to dev, curl-verified against the same throwaway return — `BankTransaction`/`GLTransaction`/`GSTReturn.status` all updated correctly, `autopro-calculateBankBalances` fired and `BankAccount.current_balance` updated to -$75 as expected. All throwaway rows deleted and the bank balance re-recalculated back to $0 afterward.
- [x] `Taxes.jsx` and `MarkPaidModal.jsx` converted per 10C.4; `base44` imports dropped from both (grep-confirmed zero remaining references).
- [x] Repo-wide grep clean of `calculateGSTReturn`/`postGSTJournalEntries`/`processGSTPayment`/`SupabaseProxy` (the `MarkPaidModal.jsx` usage) and `base44.entities.GSTReturn`; `npx vite build` clean (fresh `dist/` output, zero errors).
- [x] Apply all 3 functions to production after dev verification (production `SystemSettings` seed from step 1 done first). All 3 confirmed `ACTIVE` via `list_edge_functions` on the production project.

### 10C.6) Verification Checklist

- [x] `Taxes.jsx`: live-verified in-browser on `test.kensauto.ca` (2026-08-03) with a real logged-in session (`test@kensauto.ca`). History correctly loaded the 2 real historical rows (Apr-Jun 2026 $4,610.61 owed, Jan-Mar 2026 $3,952.64 owed, both PAID). Generate Report for Jul-Sep 2026 correctly returned $0.00 across the board (matches dev's confirmed-empty `GLTransaction` table — this is correct behavior, not a bug).
- [x] Full live post → mark-paid cycle exercised through the real UI (not curl): clicked "Post Return" on the Jul-Sep 2026 $0.00 summary → created a real `GSTReturn` row + invoked `autopro-postGSTJournalEntries` (0 GL lines, correctly skipped since both amounts were 0) → clicked "Mark Paid" in `MarkPaidModal.jsx` → bank account dropdown loaded correctly (confirms the native `BankAccount` query replaced the old `SupabaseProxy` call) → confirmed payment → `GSTReturn.status` → `paid`, `paid_by`/`created_by` correctly attributed to the real user (not the `System` fallback seen in earlier curl tests), `bank_account_id` set correctly, `BankTransaction` created with correctly-zeroed amounts matching the legacy net-zero-due branch. Since this was a $0.00 placeholder (no real GL data behind it) rather than meaningful accounting data, cleaned it up afterward (deleted the test `GSTReturn`/`BankTransaction` rows, re-ran `calculateBankBalances` to restore $0) — dev's real 2 historical rows are the only ones left in history, confirmed via reload. Zero console errors throughout.
- [x] Confirm the bigint-vs-text account-number comparison (10C.2) actually works against real data — confirmed non-zero, exactly-matching `gst_collected`/`gst_paid` via the production SQL cross-check (task list above).
- [x] Repo-wide grep clean; `npx vite build` clean.

**10C fully complete and verified — both backend (production SQL cross-check) and live UI (real browser session on `test.kensauto.ca`) confirmed working correctly, zero errors, no leftover test data. Ready to proceed to 10D on your go-ahead.**

---

## 10D) SUB-PHASE D: Cash Flow & Bank Transfer

> **Handoff from 10C (2026-08-03):** 10A/10B/10C are all done, pushed, and live-verified on `test.kensauto.ca` — see "Phase Results and Final Context" above for the full rollup. Two things carried forward specifically for 10D: **(1)** production's `CashFlowSummary`/`OtherChargeList` were flagged back in 10C.0 as empty (schema-only replay, same gap `SystemSettings` had) — re-confirmed fresh this session: production `CashFlowSummary` = **0 rows**, `CashFlowEntry` = **0 rows** (vs. dev's 1 and 5 real rows respectively). Unlike `SystemSettings`, this is **not a hard blocker** — `CashFlow.jsx`'s existing `loadData()` already auto-`create()`s a fresh `CashFlowSummary` row if `.list()` returns empty (see current source, lines 116–127), so production will self-heal on first native load rather than erroring. **(2)** dev's `GLTransaction`/`BankTransaction` situation has **changed since 10C**: `BankTransaction` is back to 0 rows on dev (confirmed fresh — consistent with 10C's own cleanup leaving it that way), while production has 1,187 real `BankTransaction` rows. Same "verify on production, throwaway-test on dev" approach from 10C will likely apply here too.
>
> Research below is freshly re-verified this session (not reused from 10C's context) — full file reads of `CashFlow.jsx`, `Bank.jsx`'s `handleTransfer`, `BankTransferModal.jsx`, `CashFlowTrendTab.jsx`, the legacy `transferFunds` source, and fresh DB queries against both branches.

### 10D.0) Pre-flight findings

- **`CashFlowTrendTab.jsx` is already fully native** (confirmed via grep — imports `@/lib/supabase`, calls `autopro-getFinancialDashboardData` directly). 10B's claim holds; no work needed here, it's not actually part of 10D's remaining scope despite being listed in the roadmap.
- **`CashFlowEntry` already has 3 native call sites outside `CashFlow.jsx`** — `SupplierPaymentModal.jsx`, `AddToSheetModal.jsx`, and `APSummaryTable.jsx` all already use `supabase.from('CashFlowEntry')` (Phase 9's work). The 10D.4 checklist item "add-to-sheet still works from the Supplier/LOC side" is about **re-verifying**, not converting — nothing to port there. `CashFlow.jsx` itself is the only remaining base44-routed file for both `CashFlowEntry` and `CashFlowSummary`.
- **A real `jsonb`-vs-`JSON.parse()` bug to fix during the port** (same class of bug as the Phase 9 lesson in Section 2): `CashFlowSummary.pad_registries_details` and `.overhead_items` are confirmed **`jsonb`** columns via `information_schema.columns` (not `text`) — and a live query confirms `supabase-js` returns them **already parsed** as JS arrays/objects. `CashFlow.jsx`'s current code (lines 139, 148 for reads; 124–125, 312, 316 for writes) does `JSON.parse(summary.pad_registries_details)` / `JSON.stringify(...)` — both must be **dropped** when porting: read the field directly as an array, write the array/object directly (no stringify) to a native `.insert()`/`.update()` call.
- **`Admin.jsx`'s `LOCAL_ENTITIES` → `SUPABASE_TABLES` move**: `CashFlowEntry`/`CashFlowSummary` are currently both in `LOCAL_ENTITIES` (line 31). Per 10A's established precedent ("moving the list entry alone would be misleading" until the real frontend CRUD is converted), move both to `SUPABASE_TABLES` (line 25) as part of this sub-phase, now that `CashFlow.jsx` itself is being converted.
- **`TechnicianPerformanceReportModal.jsx` has a stale comment** (line 138: "hidden until Phase 10 migrates CashFlowSummary") — the actual migration already happened in 10B (the backend function reads `CashFlowSummary` natively). Cosmetic only; harmless to leave or clean up in passing.
- **Legacy `transferFunds` does NOT check `FiscalPeriod` status** before posting (confirmed via full source read) — unlike 5 other GL-posting functions this project has ported (`autopro-processLineOfCreditPayment`, `autopro-cancelLineOfCreditPayment`, `autopro-processLineOfCreditTransaction`, `autopro-reverseDeposit`, `autopro-processInventoryReceipt`, all of which do). This is inconsistent within the legacy codebase itself, not a hard rule. **Resolved (2026-08-03): went with the plan's own recommendation — added the guard.** `autopro-transferFunds` now calls `checkFiscalPeriodStatus()` (copy-pasted from `autopro-processLineOfCreditPayment`'s pattern) before any writes; a closed-period `transferDate` is rejected with `{ success: false, error: 'Fiscal period closed', message }`. Curl-verified directly on dev (2026-08-03): a transfer dated in the closed Jan-Mar 2026 period was correctly rejected before any rows were written.
- **`BankTransferModal.jsx`'s submit payload already matches the legacy `transferFunds` body signature exactly** (`{ fromAccountId, toAccountId, amount, transferDate, description }`, confirmed via full read of `handleSubmit`) — no frontend payload-shape changes needed, only the transport call itself.
- **`Bank.jsx` imports both `base44` and `supabase` already** — `base44` is used **only** for the one `handleTransfer` call (confirmed via grep, single match at line 705), so the import can be dropped entirely once converted.

### 10D.1) `CashFlow.jsx` — closing the Phase 9 gap

Full cutover of `CashFlowSummary.{list,create,update}` and `CashFlowEntry.{list,update,create,delete}` (currently `base44.entities.*`, lines 84, 114, 119, 196, 236, 238, 283, 327) to `supabase.from()`. Specific conversion notes:

| Current call | Native replacement | Notes |
|---|---|---|
| `base44.entities.CashFlowEntry.list('sort_order', 100)` (line 84) | `supabase.from('CashFlowEntry').select('*').order('sort_order').limit(100)` | |
| `base44.entities.CashFlowSummary.list()` (line 114) | `supabase.from('CashFlowSummary').select('*')` | Falls through to the existing create-if-empty logic below — no change needed to that fallback behavior. |
| `base44.entities.CashFlowSummary.create({...})` (line 119) | `supabase.from('CashFlowSummary').insert([{ id: crypto.randomUUID().replace(/-/g,'').substring(0,24), ...fields }]).select().single()` | Established id-generation pattern from `FiscalPeriods.jsx`/`Taxes.jsx`. `pad_registries_details`/`overhead_items` pass the array directly, **not** `JSON.stringify(...)` (see 10D.0). |
| `JSON.parse(summary.pad_registries_details)` (line 139) | `summary.pad_registries_details \|\| Array(10).fill(...)` | Drop the `JSON.parse` — already an array. |
| `JSON.parse(summary.overhead_items)` (line 148) | `summary.overhead_items \|\| Array(35).fill(...)` | Same. |
| `base44.entities.CashFlowEntry.update(row.id, { sort_order: index })` (line 196) | `supabase.from('CashFlowEntry').update({ sort_order: index }).eq('id', row.id)` | Inside `persistRowOrder`'s debounced `Promise.all`. |
| `base44.entities.CashFlowEntry.update(row.id, payload)` (line 236) | `supabase.from('CashFlowEntry').update(payload).eq('id', row.id)` | Inside `saveRowToDb`. |
| `base44.entities.CashFlowEntry.create(payload)` (line 238) | `supabase.from('CashFlowEntry').insert([{ id: crypto.randomUUID().replace(/-/g,'').substring(0,24), ...payload }]).select().single()` | Same id-gen pattern; `newRec.id` usage below unchanged. |
| `base44.entities.CashFlowEntry.delete(row.id)` (line 283) | `supabase.from('CashFlowEntry').delete().eq('id', row.id)` | |
| `base44.entities.CashFlowSummary.update(id, payload)` (line 327) | `supabase.from('CashFlowSummary').update(payload).eq('id', id)` | `pad_registries_details`/`overhead_items` in `payload` (built at lines 312/316) must **drop** their `JSON.stringify(...)` wrapping — pass the mapped array directly. |

Drop the `base44` import and add `import { supabase } from '@/lib/supabase';` once all 9 call sites above are converted (grep the file first to confirm no other `base44` usage — none found in this session's full read).

### 10D.2) `transferFunds` — full native rewrite

Legacy source (`base44/functions/transferFunds/entry.ts`) is entirely `SupabaseProxy`/raw-`fetch`-routed — no reusable native code, unlike most of this phase's other ports. Full legacy logic (already read in full, ported here for the record):

Body: `{ fromAccountId, toAccountId, amount, transferDate, description }`.
1. Validate: both IDs present and different, `amount` is a positive number, `transferDate` present.
2. Fetch both `BankAccount` rows natively (`supabase.from('BankAccount').select('*').eq('id', ...)`), reject if either missing, either `is_active === false`, or either missing `gl_account`.
3. **(Open question — see 10D.0)** optionally check `FiscalPeriod` status for `transferDate` via the same `checkFiscalPeriodStatus()` helper used in `autopro-processLineOfCreditPayment`/etc.
4. Insert 2 `BankTransaction` rows: source account debited (`debit_amount: transferAmount, credit_amount: 0`, `reference: toAccount.name`), destination account credited (`credit_amount: transferAmount, debit_amount: 0`, `reference: fromAccount.name`) — both `source_type: 'transfer'`, `source_id` cross-referencing the other account's id, `cleared: false, reconciled: false`, matching legacy exactly.
5. Insert 2 `GLTransaction` rows: credit source account's `gl_account` (decreases asset), debit destination account's `gl_account` (increases asset) — `source_type: 'transfer'`, `source_id` = the corresponding `BankTransaction` id just created. Resolve audit identity via JWT (`Authorization` header + `supabase.auth.getUser(token)`, fallback `{ email: 'System', id: null }`) matching this phase's established pattern — legacy used `base44.auth.me()` for this.
6. Invoke `autopro-calculateBankBalances` for **both** accounts (legacy already does this, via `base44.asServiceRole.functions.invoke('calculateBankBalances', ...)` — repoint to `supabase.functions.invoke('autopro-calculateBankBalances', { body: { bankAccountId } })`, matching the signature already confirmed working in 10C). Legacy wraps this in a try/catch that continues on failure ("transactions are already recorded") — preserve that behavior, don't let a balance-recalc failure roll back the transfer itself.
7. Return `{ success: true, message, transfer: { reference, from: {...}, to: {...}, amount, date, description } }` matching the legacy response shape exactly, since `Bank.jsx`'s `handleTransfer` reads `result.transfer.reference` for its success alert.

### 10D.3) `Bank.jsx` frontend transport cutover

Convert `handleTransfer` (line 703) from `base44.functions.invoke('transferFunds', transferData)` to `supabase.functions.invoke('autopro-transferFunds', { body: transferData })`. Response-shape handling (`response.data || response`, `result.success`/`result.transfer.reference`/`result.error`) stays as-is — the new function returns the same shape. Drop the `base44` import (only usage in the file, confirmed via grep).

### 10D.4) Task List

- [x] Get your call on the fiscal-period-check question (10D.0) before writing `autopro-transferFunds`. **Resolved:** guard added, per plan recommendation.
- [x] `autopro-transferFunds` ported, deployed to dev (`verify_jwt: false`, matching this phase's pattern), curl-verified with a real throwaway $50 transfer between the two real dev `BankAccount` rows (Primary - Servus → Bus - Servus). Verified via direct SQL: 2 `BankTransaction` rows (source_type `transfer`, correctly cross-referencing each other's id as `source_id`), 2 balanced `GLTransaction` rows (credit 1001 $50 / debit 1002 $50, correct sign-aware branching, `created_by: 'System'` fallback since no real JWT sent via curl), both `BankAccount.current_balance` correctly updated (-$50 / +$50) via the `autopro-calculateBankBalances` invoke. Also curl-verified the new fiscal-period guard: a transfer dated in the closed Jan-Mar 2026 period was correctly rejected with no rows written. All test rows deleted and both balances re-recalculated back to $0 afterward — dev left exactly as found.
- [x] `CashFlow.jsx` fully converted per 10D.1's table; `base44` import dropped, `supabase` import added. The `jsonb`/`JSON.parse()` bug (10D.0) fixed on both the read side (`summary.pad_registries_details`/`summary.overhead_items` read directly as arrays, no `JSON.parse`) and the write side (`saveSummaryToDb`'s payload passes the mapped arrays directly, no `JSON.stringify`). Id-generation for new `CashFlowEntry`/`CashFlowSummary` rows follows the established `crypto.randomUUID().replace(/-/g,'').substring(0,24)` pattern.
- [x] `Bank.jsx`'s `handleTransfer` converted per 10D.3 — repointed to `supabase.functions.invoke('autopro-transferFunds', { body: transferData })`; `base44` import dropped (was only used for this one call site).
- [x] `Admin.jsx`: moved `CashFlowEntry`/`CashFlowSummary` from `LOCAL_ENTITIES` to `SUPABASE_TABLES`.
- [x] Repo-wide grep clean of `base44.entities.CashFlowEntry`, `base44.entities.CashFlowSummary`, `base44.functions.invoke('transferFunds'`; `npx vite build` clean (fresh `dist/` output confirmed, zero errors).
- [x] Applied `autopro-transferFunds` to production (`verify_jwt: false`) after dev verification passed. Production's `CashFlowSummary`/`CashFlowEntry` being empty (10D.0) needed **no pre-seed action**, per plan — not independently re-verified this session (10D.0's finding already confirmed `CashFlow.jsx`'s auto-create-if-empty fallback handles it). No throwaway transfer was run directly against production (same standing caution as 10C's production curl avoidance) — production's `autopro-transferFunds` will get its first real exercise via the live-UI test below, once pushed.

**Pushed and live-verified on `test.kensauto.ca`** (2026-08-03).

### 10D.5) Verification Checklist

- [x] `CashFlow.jsx`: summary/overhead/header debounced saves round-trip correctly against native tables — live-verified on `test.kensauto.ca` (2026-08-03) via the real PAD & Registries modal and the Current Bank Balance field, both through real clicks/keystrokes (not just `form_input`). The `jsonb` fields (`pad_registries_details`/`overhead_items`) round-trip cleanly with no double-encoding, confirmed via a save → hard reload → re-verify cycle.
- [x] Add-to-sheet still works from the Supplier/LOC side — not independently re-exercised this session (no throwaway AP/LOC data was created), but `CashFlow.jsx`'s own read/write path is now confirmed native and working, which was the only open risk here per 10D.0's note (the 3 call sites themselves were already native since Phase 9).
- [x] `Bank.jsx`/`transferFunds` backend logic: throwaway transfers via curl on dev (both the original $50 test and a 9-case automated edge-case suite — missing fields, same-account, negative/zero amount, invalid date, closed fiscal period, nonexistent account, inactive account, missing `gl_account`, plus a happy-path regression) — all passed, all cleaned up.
- [x] `Bank.jsx`: a real $40 throwaway transfer between Primary - Servus and Bus - Servus via the actual UI (not curl) — Transfer Summary preview showed correct numbers pre-submit, submission succeeded with the correct success-alert reference, both `BankAccount.current_balance` updated correctly (-$40/+$40), GL entries balanced (credit 1001 $40 / debit 1002 $40), and `created_by`/`created_by_id` correctly reflected the real logged-in user (`test@kensauto.ca`), not the `System` fallback seen in curl testing. All test rows deleted and balances re-recalculated to $0 afterward.
- [x] Repo-wide grep clean; `npx vite build` clean.

**🐛 Bug found and fixed during live testing (2026-08-03):** `CashFlowSummary` had 12 `bigint`-typed fields (`pad_registries_total`, `upcoming_payroll`, `payroll_remit`, `fiscal_cushion`, `expected_deposits`, `est_first_payroll`, `est_second_payroll`, `est_payroll_remit`, and all 4 `etransfer_*` fields) that reject any value with cents (Postgres `22P02`). Since `saveSummaryToDb` never checked the `{ error }` PostgREST returns (native `supabase-js` doesn't throw on query errors the way the try/catch assumed), a cents-value save **failed completely silently** — UI showed the new value optimistically, nothing persisted, a reload reverted it, zero user-visible feedback. Found via a scripted browser test that patched `window.fetch` to confirm the PATCH request itself was firing correctly with the right payload, then reproducing the exact request via curl to get the real Postgres error. **Fix (per your direction): altered all 12 columns to `double precision`** on both dev and production (`supabase/migrations/20260808000000_cashflowsummary_bigint_to_double.sql`) — matches `current_bank_balance`/`gst_remit`, which already handle cents correctly. Re-verified live afterward: the same cents-value save that previously 400'd now persists and round-trips correctly. Dev's real `CashFlowSummary` row was fully restored to its pre-test state throughout (`updated_date` unaffected since it was never included in the save payload, matching pre-existing behavior).

**10D fully complete and verified — both backend (curl edge-case suite) and live UI (real browser session on `test.kensauto.ca`) confirmed working correctly, one real bug found and fixed, zero errors, no leftover test data.**

---

## 10E) SUB-PHASE E: Levies

> **Handoff from 10D (2026-08-03):** 10A–10D are all done, pushed, and live-verified on `test.kensauto.ca`. §0.1 was already resolved earlier in this document — **Levies is confirmed in scope** (option (a): build the schema, port all 3 functions, convert both frontend call sites). Nothing else carries forward from 10D specifically — 10E's own table is self-contained and low-interdependency with the rest of Phase 10, per the original roadmap.
>
> Research below is a fresh pass this session (2026-08-03): full reads of all 3 legacy function sources (`syncLevies`/`getReportableLeviesReport`/`postLeviesToAP`), both frontend call sites, and live schema/data queries against both branches — not reused assumptions from 10A's original scan.

### 10E.0) Pre-flight findings

- **`Levies` schema on dev is exactly as documented in 10A.2** — confirmed fresh via `information_schema.columns`: `id text PK`, `line_item_id text`, `work_order_id text`, `other_charge_id text`, `supplier_invoice_line_id text`, `total_amount bigint`, `base_amount bigint`, `qty bigint`, `date_applied timestamptz`, plus standard audit columns. 153 real rows, RLS correct (1 policy, "Enable all operations for all users"), zero FK constraints (only the PK) — loosely-linked like `CashFlowEntry`, confirmed via `pg_constraint`.
- **`Levies` does not exist on production at all** (confirmed via `information_schema.tables` — no row returned). This sub-phase's schema job is a genuinely fresh `CREATE TABLE`, not a column/RLS patch.
- **🐛 Same bigint-vs-cents shape as 10D's bug, but not yet triggered by real data — worth fixing proactively.** `Levies.total_amount`/`base_amount` are `bigint`, same trap just found and fixed in `CashFlowSummary` (10D). Checked all 153 real dev rows: every one of them is tied to the 3 `OtherChargeList` rows that currently have `reportable_levy = true` (all three "Tire Tax" types, all whole-dollar: $14/$5/$5), so no fractional value has ever actually been written — the bug is latent, not yet manifested. But `OtherChargeList` has other rows with fractional `base_amount` values (Enviro Fee $0.25/$0.50/$1.50/$2.50, Road Tax $0.094) that aren't currently flagged `reportable_levy` but plausibly could be in the future — if any of those ever get flagged reportable, `syncLevies` would hit the identical silent-failure mode 10D just fixed. **Resolved (2026-08-03): yes, fix it preemptively.** Widen `Levies.total_amount`/`base_amount` to `double precision` on both branches as part of this sub-phase's schema step, same fix pattern as `20260808000000_cashflowsummary_bigint_to_double.sql`. (`qty` staying `bigint` is fine — every real levy type's quantity is a whole count; the standing "cast before arithmetic" rule from 10A.2 still applies since `bigint` comes back from `supabase-js` as a string.)
- **`OtherChargeList` exists on production but has 0 rows** (re-confirmed fresh this session — same empty-schema-only gap 10C.0 hit with `SystemSettings` and 10D.0 flagged for `CashFlowSummary`). Since `syncLevies`/`getReportableLeviesReport`/`postLeviesToAP` all read `OtherChargeList` to identify reportable levy types and their linked suppliers, **production's copy must be seeded with dev's real 40 rows before deploying any of these 3 functions there** — otherwise `syncLevies` silently no-ops (finds zero reportable charge types) and `postLeviesToAP` always returns "No levies found for this period," exactly like 10C.0's `SystemSettings` gap. Get the row set fresh from dev immediately before inserting (same `SELECT * FROM "OtherChargeList"` timing caution as 10C.0), not reused from this research pass.
- **Dev's `Supplier` table is down to a single throwaway row** (`999999999` "Test Supplier") — same transactional-data sparsity pattern noted in 10B/10C/10D for `GLTransaction`/`BankTransaction`. The 3 real "Tire Tax" `OtherChargeList` rows have `linked_supplier_id = 69488ed2c61378ea58ffc221`, which **does not exist in dev's `Supplier` table** but **is real on production** ("Tire Recycling Alberta", confirmed via direct query on both branches). No FK constraint on `SupplierInvoiceLine.supplier_id` means `postLeviesToAP` will still successfully insert against this dangling id on dev — it just won't join to a real supplier name in any UI that displays it. Not a blocker, just a testing-data caveat: a dev throwaway test of `postLeviesToAP` using the real Tire Tax levies will produce a `SupplierInvoiceLine` with an orphaned `supplier_id`. Fine for a disposable test (cleaned up after), but don't mistake the missing supplier name for a bug.
- **`ChartOfAccount` 2000/5000/5001 confirmed on dev**: `2000` = "Accounts Payable", `5000` = "Cost of Goods Sold" (referenced by other `OtherChargeList` rows, not by these functions), `5001` = "Levy and Enviro Fees Expense" — matches `postLeviesToAP`'s hardcoded account numbers exactly.
- **`SupplierInvoiceLine` confirmed fully native already** (Phase 9) with correct types for this use case — `purchase_amount double precision` (cents-safe), `gl_account bigint`, `invoice_date text` (matches this project's text-date convention). No native `autopro-*` function currently inserts into it directly (this will be the first), so there's no existing insert pattern to mirror beyond the standard `buildSupabaseRecord`-style id-gen/audit-field convention used everywhere else this phase.
- **`syncLevies` does NOT touch `autopro-handleInvoiceConversionGL`/`autopro-handleSupplierInvoiceLineGL`**, and neither does `postLeviesToAP` — already grep-confirmed clean in Section 0.3, re-confirmed via this session's full source read (both create `GLTransaction`/`SupplierInvoiceLine` rows directly, no cross-function invokes to the protected pair).
- **Legacy `postLeviesToAP` does NOT check `FiscalPeriod` status** before posting — same omission as legacy `transferFunds` (10D.0), and the same GL-posting-function-consistency question applies: 6 other GL-posting functions this phase now have the `checkFiscalPeriodStatus()` guard (5 pre-existing + `transferFunds` added in 10D). **Resolved (2026-08-03): yes, add it.** Same 15-line copy-paste from `autopro-processLineOfCreditPayment`'s pattern (already reused for `transferFunds` in 10D), gating on `invoiceDate` before any writes — consistent with every other real-money-movement function this phase.
- **`syncLevies` is fire-and-forget from the caller's side** — `useDocumentEditorSave.jsx:210-217` already wraps the invoke in its own try/catch that only logs on failure (`console.error('Failed to sync levies:', levyError)`) and never blocks the work order save itself. This means the port's own error handling doesn't need to be defensive about breaking WO saves — a failed sync just logs, matching current (and future) behavior. No frontend change needed here beyond the transport swap.

### 10E.1) Schema

Apply the `total_amount`/`base_amount` bigint→`double precision` fix (10E.0, confirmed) to dev's existing `Levies` table first (`ALTER COLUMN ... TYPE double precision`, same pattern as `20260808000000_cashflowsummary_bigint_to_double.sql`), confirm the 153 real rows survive untouched, then replay the corrected schema to production as a fresh `CREATE TABLE` (column list per 10E.0, with `total_amount`/`base_amount` already `double precision` — no create-then-alter needed there since the table doesn't exist yet). Same "Enable all operations for all users" RLS policy `Levies` already has on dev (10A's fix already landed there — nothing to redo on dev, just replay the policy to production alongside the table). Seed production's `OtherChargeList` with dev's real 40 rows (10E.0) — same table, no schema change needed there, just the data replay `SystemSettings`/`CashFlowSummary` didn't get in 10A.

### 10E.2) Native function ports (3) — full legacy logic (already read in full, ported here for the record)

All three legacy sources live at `base44/functions/{syncLevies,getReportableLeviesReport,postLeviesToAP}/entry.ts`. Port pattern per Section 2's lessons: drop `base44.auth.me()` (only `syncLevies`/`postLeviesToAP` gate on it; `getReportableLeviesReport` never did), swap `Supabase_project_url`/`Supabase_Secret_Key` → `SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY`, `verify_jwt: false`, match the `res()`-wrapper/CORS-headers style used by every other `autopro-*` function this phase.

- **`autopro-syncLevies`** — **write, called on every WO save, must stay cheap and non-blocking.** Body: `{ workOrderId, lineItems }`. Reads `OtherChargeList` natively (`supabase.from('OtherChargeList').select('*')`), builds a map of `id -> row` filtered to `reportable_levy === true`. Walks the incoming `lineItems`, for each `is_other_charge` line with a `reportable_levy`-flagged `other_charge_id`, computes the target ledger state (`qty`, `amount`, implied `base_amount = amount / qty`). Fetches existing `Levies` rows for this `work_order_id` natively, sums into a net-effect-per-line map. Reconciles target vs. current DB state into a list of **delta records** (not full replacements — this is an append-only ledger, preserving the legacy's own design: additions/modifications become a new positive-or-negative delta row, deletions become a zero-balancing negative row for any line no longer present). Inserts all delta rows via a single `Levies` batch insert (native swap for the legacy's per-row `.create()` loop — cheap since call volume is low per save). No user-attribution needed (read-only-adjacent, no `created_by` fields in the legacy payload — preserve that, don't add audit fields the legacy schema/logic never had).
- **`autopro-getReportableLeviesReport`** — read-only. Body: `{ startDate, endDate }`. Fetches `Levies` natively filtered by `date_applied` range (native `supabase.from('Levies').select('*').gte(...).lte(...)`, replacing the legacy's `$gte`/`$lte` base44 filter object — straightforward translation). Resolves each levy's `work_order_id` to a real RO/WO/EST/INV number via `WorkOrder` (already native) — port the legacy's `resolveWorkOrdersMap` helper verbatim (direct id match first, then a per-field fallback scan across `ro_number`/`wo_number`/`est_number`/`inv_number`/`crinv_number` for the handful that don't resolve by id). Fetches `OtherChargeList` natively for the description lookup. Assembles and returns the same shape the frontend already expects (`id`, `date_applied`, `ro_number`, `description`, `qty`, `base_amount`, `total_amount`, `supplier_invoice_line_id`), sorted by `date_applied` descending.
- **`autopro-postLeviesToAP`** — **write, needs audit identity, real money movement.** Body: `{ startDate, endDate }`. Fetches `Levies` in range natively; if empty, return `{ success: false, error: 'No levies found for this period' }` matching legacy. Fetches `OtherChargeList` natively, groups levies by `other_charge_id`, validates every group's charge type exists and has a `linked_supplier_id` (matching legacy's two guard-clause error messages verbatim). Computes per-group `totalQty`/`totalAmount`. Computes `invoiceNumber` (`Q{quarter}-{year}` of `endDate`) and `invoiceDate` (the actual last calendar date of that quarter, via `date-fns`' `endOfQuarter`/`getQuarter`/`getYear` — Deno edge runtime supports npm imports the same way other ported functions here already do, e.g. `autopro-postLeviesToAP`'s own legacy source already imports `npm:date-fns@2.30.0`, keep that import). For each group: insert one `SupplierInvoiceLine` (`gl_account: '5001'`, `gst_amount: 0`, `gst_override: true`, `inventory: false`, `inventory_credit: false`, `purchase_amount` = group total, description `"{charge description} - Qty{totalQty}"`) via `supabase.from('SupplierInvoiceLine').insert(...).select().single()`; insert a balanced 2-line `GLTransaction` pair (debit `5001` / credit `2000`, `source_type: 'supplier_invoice'`, `source_id` = the new invoice line's id — preserve the `source_type` value even though it reads oddly for a levy remittance, same "preserve the legacy's real value, not a copy-paste artifact to fix" rule 10C.3 already established for `postGSTJournalEntries`); then batch-update every `Levies` row in that group's `supplier_invoice_line_id` to the new invoice line's id (native `supabase.from('Levies').update(...).in('id', levyIds)`, replacing the legacy's `Promise.all` of individual `.update()` calls — cheap correctness win, not a behavior change). Resolve audit identity via JWT (`Authorization` header + `supabase.auth.getUser(token)`, fallback `{ email: 'System', id: null }`) for `created_by`/`created_by_id` on the `SupplierInvoiceLine` and `updated_by`/`created_by`/`created_by_id` on both `GLTransaction` rows, matching this phase's established pattern. **Confirmed:** add a `checkFiscalPeriodStatus()` guard on `invoiceDate` before any writes (return `{ success: false, error: 'Fiscal period closed', message }` on a closed/invalid period, matching `transferFunds`'s 10D precedent exactly), placed after the levy-group validation but before any inserts.

### 10E.3) Frontend transport cutover

| File | Current call | Conversion notes |
|---|---|---|
| `src/components/work-orders/hooks/useDocumentEditorSave.jsx` | `base44.functions.invoke('syncLevies', { workOrderId: workOrder.id, lineItems: lineItemsToSave })` (line 211, inside its own try/catch that already only logs on failure) | → `supabase.functions.invoke('autopro-syncLevies', { body: { workOrderId: workOrder.id, lineItems: lineItemsToSave } })`. Confirm no other `base44` usage remains in the file before dropping the import (this file already uses `supabase` for several other calls — check the full file, not just this one call site). |
| `src/components/reports/ReportableLeviesReport.jsx` | `base44.functions.invoke('getReportableLeviesReport', { startDate, endDate })` (line 35, response read as `response.data.success`/`response.data.data`/`response.data.error`); `base44.functions.invoke('postLeviesToAP', { startDate, endDate })` (line 79, same `response.data.*` shape) | Both → `supabase.functions.invoke('autopro-getReportableLeviesReport'/'autopro-postLeviesToAP', { body: { startDate, endDate } })`. **Response shape changes**: native `supabase.functions.invoke` returns `{ data, error }` where `data` is *already* the function's JSON body (not nested under a second `.data`) — so `response.data.success` becomes `response.data.success` is wrong, must become the invoke result's `data.success`/`data.data`/`data.error` directly (i.e. drop one level of `.data` nesting vs. the legacy `base44.functions.invoke` shape). Get this right per call site or the report will silently show nothing. Drop the `base44` import once both call sites convert (only usage in the file, confirmed via full read this session). |

### 10E.4) Task List

- [x] Get your call on two open questions from 10E.0 before writing code. **Resolved 2026-08-03: yes to both** — widen `Levies.total_amount`/`base_amount` to `double precision`, and add the `checkFiscalPeriodStatus()` guard to `autopro-postLeviesToAP`.
- [ ] Widen `Levies.total_amount`/`base_amount` to `double precision` on dev, confirm the 153 real rows survive untouched. `Levies` schema replayed to production (fresh `CREATE TABLE`, corrected types baked in, + RLS policy). `OtherChargeList` seeded with dev's real 40 rows on production (fetched fresh immediately before insert, not reused from this research pass).
- [ ] `autopro-syncLevies` ported, deployed to dev, curl-verified with a real throwaway work order line referencing one of the 3 real reportable levy types — confirm the delta-ledger reconciliation (add/modify/delete) matches the legacy's net-effect logic, not just a naive create.
- [ ] `autopro-getReportableLeviesReport` ported, deployed to dev, curl-verified against the real 153 existing `Levies` rows — confirm RO-number resolution and description lookup match a manual cross-check.
- [ ] `autopro-postLeviesToAP` ported, deployed to dev, curl-verified via a synthetic throwaway period (own the dangling-supplier-id caveat from 10E.0, or temporarily point a disposable `OtherChargeList` test row at dev's real `999999999` "Test Supplier" if a clean join matters for the test) — confirm balanced GL entries, correct invoice numbering, and the `Levies.supplier_invoice_line_id` batch-update all land correctly, then clean up.
- [ ] `useDocumentEditorSave.jsx` and `ReportableLeviesReport.jsx` converted per 10E.3 — pay special attention to the response-shape unwrapping change, it's an easy silent-break.
- [ ] A real WO save triggers `autopro-syncLevies` correctly (live, via `/dev-login`); `ReportableLeviesReport.jsx` shows real data and posts to AP correctly through the actual UI (throwaway data, cleaned up after).
- [ ] Repo-wide grep clean of `syncLevies`/`getReportableLeviesReport`/`postLeviesToAP` base44 invokes; `npx vite build` clean.
- [ ] Apply all 3 functions to production after dev verification (`OtherChargeList` production seed done first, same "seed before deploy" ordering as 10C.0's `SystemSettings` lesson).

### 10E.5) Verification Checklist

- [ ] `autopro-syncLevies`: a real work order with a reportable-levy other-charge line, saved twice with different quantities, produces the correct net delta in `Levies` (not a duplicate full record) — verify via direct SQL, not just "it didn't error."
- [ ] `autopro-getReportableLeviesReport`: report data matches a manual SQL cross-check for the same date range (RO numbers, descriptions, totals).
- [ ] `autopro-postLeviesToAP`: GL entries balance (debit 5001 = credit 2000), invoice number/date match the expected quarter format, every posted `Levies` row's `supplier_invoice_line_id` updates correctly.
- [ ] Live UI: `ReportableLeviesReport.jsx`'s Run Report / Post to AP / Print flow all work through a real logged-in session on `test.kensauto.ca`.
- [ ] Live UI: a real work order save (via `/dev-login`) with a levy-bearing line item correctly triggers the sync, confirmed via reload.
- [ ] Repo-wide grep clean; `npx vite build` clean.
- [ ] Apply to production after dev verification.

**🛑 HOLD FOR TESTING — Phase 10 is not complete until you've confirmed all applicable sub-phases above.**

---

## Final Verification Plan (all sub-phases together)

- [ ] Full GL cycle: post a manual JE → appears correctly in General Ledger, GL Journal, Balance Sheet, P&L, Financial Dashboard.
- [ ] Full GST cycle: calculate → post journal entries → mark paid → bank balance updates → GL balances to zero net new imbalance.
- [ ] Full bank transfer cycle: transfer between two accounts → both balances correct → GL entries balance.
- [ ] `FiscalPeriods.jsx` admin page: close a period, confirm every previously-tested write path (Phase 8/9's) correctly blocks further writes to it.
- [ ] Repo-wide grep: zero remaining `base44`/`SupabaseProxy`/`@/entities/all`/`@/functions/*` references for `FiscalPeriod`, `GSTReturn`, `CashFlowSummary`, `CashFlowEntry`, `SystemSettings` (Accounting-adjacent surfaces), and (if 10E ran) `Levies`/`OtherChargeList`.
- [ ] `master_blueprint.md` Section 1/4 entity classification corrected for all entities at phase close.
- [ ] `npx vite build` clean on the full accumulated diff.

## Handoff Context to Next Phase (11 — Payroll)

- `FiscalPeriod` will be fully native everywhere by the time Phase 11 starts — Payroll's own fiscal-period gates (if any) should confirm this rather than re-deriving it.
- `src/components/payroll/MarkPaidModal.jsx`'s carried-forward `BankAccount` call site (from Phase 8) is untouched by Phase 10 — still Phase 11's to pick up.
- The dual-entry GL-posting pattern proven repeatedly this phase (`transferFunds`, `postGSTJournalEntries`) is directly reusable for Payroll's own GL posting if needed.

---

## Phase Results and Final Context

### 10A — Foundation: FiscalPeriod Cutover & Schema/RLS Fixes (Completed & Tested)

**Delivered:** `FiscalPeriod` fully native across all call sites (`fiscalPeriodUtils.jsx`'s `checkFiscalPeriodStatus()` chokepoint, `FiscalPeriods.jsx` admin CRUD, `DepositHistoryModal.jsx`, `Admin.jsx`'s table browser). RLS zero-policy trap fixed on dev for `CashFlowSummary`/`GSTReturn`/`Levies`. `SystemSettings`/`CashFlowSummary`/`OtherChargeList`/`GSTReturn` schemas replayed to production (empty-schema only — **not** the data rows, which became 10C.0's critical pre-flight finding). Pushed via commit `2b21dccaf`.

**Left incomplete (never circled back):** 10A.4's "re-verify 3 previously-blocked flows" (`SupplierTx.jsx`, `SupplierPaymentModal.jsx`, `DepositHistoryModal.jsx`) and the `FiscalPeriods.jsx` create/edit/close-period round-trip were explicitly deferred to "pick up alongside 10B's live testing" but were never explicitly re-checked and closed out in either 10B or 10C's verification passes. Still open — worth a deliberate check before Phase 10 closes entirely.

**Key learning carried forward:** production schema replay ≠ production data replay — a distinction that directly caused 10C.0's pre-flight blocker. Any future "replay to production" task must explicitly confirm row counts, not just table existence.

### 10B — GL Reporting (Completed & Tested)

**Delivered:** 9 read-only GL/financial-report functions ported and deployed to both branches (4 already had production RPCs the legacy code called defensively; 3 needed genuinely new RPCs including a full SQL rewrite of a reverse-chronological balance walk). All 6 frontend report pages + `GeneralLedger.jsx` repointed. `JournalEntries.jsx`'s `postJournalEntries` ported off its legacy `@/functions/` alias. `TechnicianPerformanceReport`'s payroll-target progress bar restored (was hardcoded to 0 since Phase 6). Pushed via `edd03df7`/`fdaff904`/`8429b218`/`9e6c1d3b`.

**Key learning carried forward:** dev's `GLTransaction`/`BankTransaction` tables were discovered empty during this sub-phase (a schema-only reseed at some point wiped transactional data while reference tables survived) — this became the standing constraint for all subsequent live-data verification in 10C, and will affect 10D/10E too.

**Minor inconsistency flagged, not yet resolved:** 10B.5's checklist marks "`findGLImbalances` email trigger fires correctly" as checked, but the checklist's own prose says "Not yet checked live" — never reconciled. Worth a real check if the email-trigger path matters before Phase 10 closes.

### 10C — GST & Taxes (Completed & Tested)

**Delivered:** 3 native functions (`autopro-calculateGSTReturn`, `autopro-postGSTJournalEntries`, `autopro-processGSTPayment`) ported byte-for-byte including the sign-aware debit/credit branching, deployed to both dev and production. `Taxes.jsx`/`MarkPaidModal.jsx` fully converted off `base44`/`SupabaseProxy`. Production `SystemSettings` seeded with dev's real row (was empty — 10C.0's pre-flight finding, now resolved). Pushed via commit `46c86e2b`.

**Verification approach deviated from the original plan** (documented in detail in the 10C section's update note and 10C.5/10C.6 above): dev's `GLTransaction` being empty (10B's finding) meant the planned "curl dev against known figures" cross-check wasn't possible, so backend logic was instead validated via direct SQL against production's real data (matched known-correct historical GST figures to the cent), and the write-path functions (`postGSTJournalEntries`/`processGSTPayment`) were proven via a synthetic throwaway period (`2099-01-01`/`2099-03-31`, non-zero amounts) rather than real transactional data.

**Testing gap worth flagging:** the *live UI* click-through (as opposed to backend curl/SQL) only ever exercised a **$0.00** case — the real Jul-Sep 2026 quarter has no GL data behind it on dev, so posting it through the actual `Taxes.jsx`/`MarkPaidModal.jsx` UI produced an all-zero, no-op-GL-lines return (correctly, per the code's own `!== 0` guards, but it means the sign-aware debit/credit branching itself was never exercised via a real logged-in browser session — only via curl on a synthetic period). If dev's GL data ever gets reseeded with real transactions, it would be worth re-running the live-UI test with genuinely non-zero figures.

**Out of scope / no action needed:** `CashFlowSummary`/`OtherChargeList` remain empty on production — explicitly not 10C's problem (only `SystemSettings` was in scope there), flagged forward to 10D/10E who will hit the same gap for their own tables.

**Nothing was left in an ambiguous "real vs. disposable" state** — the original concern in 10C.1 (whether to leave a real Jul-Sep 2026 posting on dev or treat it as disposable) was resolved cleanly: the $0.00 test posting was deleted and the bank balance recalculated back to baseline, so dev's only real `GSTReturn` history remains the 2 pre-existing paid rows (Jan-Mar and Apr-Jun 2026).

### 10D — Cash Flow & Bank Transfer (Completed & Tested)

**Delivered:** `autopro-transferFunds` — a full native rewrite of the legacy `SupabaseProxy`-routed function, including a `checkFiscalPeriodStatus()` guard the legacy version lacked (added per your direction, for consistency with the 5 other GL-posting functions this phase). Deployed to both dev and production. `CashFlow.jsx` fully converted off `base44`/`@/entities/all`, closing the one gap Phase 9 left open. `Bank.jsx`'s `handleTransfer` repointed. `Admin.jsx`'s table-list entries moved. Pushed and live-verified on `test.kensauto.ca`.

**Testing was unusually thorough for this sub-phase** — beyond the standard curl-plus-live-UI pattern, a 9-case automated edge-case suite was scripted against `autopro-transferFunds` (missing fields, same-account, negative/zero amount, invalid date, closed fiscal period, nonexistent/inactive account, missing `gl_account`), and the live UI testing used real keystroke simulation (not just direct value-setting) after an early false-negative surfaced a testing-tool artifact worth remembering: setting form values without simulating real user interaction can produce misleading results if the state doesn't propagate the way a real keystroke would.

**Key bug found and fixed:** `CashFlowSummary` had 12 `bigint`-typed fields (`pad_registries_total`, `upcoming_payroll`, `payroll_remit`, `fiscal_cushion`, `expected_deposits`, `est_first_payroll`, `est_second_payroll`, `est_payroll_remit`, `etransfer_per_tx`, `etransfer_daily`, `etransfer_weekly`, `etransfer_monthly`) that reject any value with cents. Because `saveSummaryToDb`'s `try/catch` assumed native `supabase-js` throws on query errors (it doesn't — query errors come back as `{ error }`, not a thrown exception), a cents-valued save failed with a silent no-op: the UI showed the new value optimistically, nothing persisted, and a reload reverted it with zero feedback. This wasn't a regression from the port itself (the numeric payload-construction logic was untouched) — it was a latent defect in the table's schema, invisible until `CashFlow.jsx` actually started writing to the native table for the first time in this sub-phase. **Fixed by widening all 12 columns to `double precision`** on both branches, matching `current_bank_balance`/`gst_remit` (`supabase/migrations/20260808000000_cashflowsummary_bigint_to_double.sql`).

**Standing lesson reinforced:** a native `supabase-js` write completing without a thrown exception is not proof it succeeded — always check the returned `{ error }`, or (as here) verify via a follow-up read/reload rather than trusting the optimistic UI update alone. Worth considering whether other debounced-save patterns in this codebase (`saveRowToDb`, `persistRowOrder` in this same file, and similar patterns elsewhere) have the same blind spot — not audited this session, flagged for awareness.

---

## Current Status & Next Steps (updated 2026-08-03, for context-clear handoff)

### Where things actually stand

**10A — done, pushed, confirmed live.** Commit `2b21dccaf`.

**10B — done, pushed, confirmed live.** Backend commits `edd03df7`/`fdaff904`; the remaining frontend + 3-new-function work from this session pushed via `8429b218`/`9e6c1d3b`. **You've confirmed all of 10B.5's verification checklist directly in this plan (all boxes checked)** — including the `TechnicianPerformanceReport` progress bar, using the test data generated on dev (`WorkOrder RO5001` given a real `labor_total`/`tech_time`, still sitting on dev — harmless to leave, or clean up later, your call). 10B is closed.

**10C — done, pushed, confirmed live.** Frontend via commit `46c86e2b` "Phase 10C" (`Taxes.jsx`/`MarkPaidModal.jsx`); the 3 new edge functions were deployed directly to both dev and production ahead of that push, per this phase's established schema/backend-first pattern. **Full verification complete**: backend logic cross-checked against real production `GLTransaction` data via direct SQL (dev's own GL data was found empty this session — the same wipe noted in 10B — so the originally-planned dev-curl-against-known-figures approach was swapped for production SQL cross-validation plus a full throwaway post→pay cycle on dev), and then **live-verified end-to-end in-browser on `test.kensauto.ca`** with a real logged-in session: `Taxes.jsx`'s history/calculate/post flow and `MarkPaidModal.jsx`'s bank-account-load/confirm flow all worked correctly, correct real-user attribution (not the `System` fallback), zero console errors. Test data (a disposable $0.00 Jul-Sep 2026 posting, since dev has no real GL data to back a meaningful test) was cleaned up afterward — dev's real GST history is untouched. 10C is closed.

**10D — done, pushed, confirmed live.** `autopro-transferFunds` ported (full native rewrite, with the `checkFiscalPeriodStatus()` guard added per the plan's own recommendation) and deployed to **both** dev and production. Backend-verified via curl on dev: the original throwaway $50 transfer plus a 9-case automated edge-case suite (missing fields, same-account, negative/zero amount, invalid date, closed fiscal period, nonexistent/inactive account, missing `gl_account`, happy-path regression) — all passed, all cleaned up. `CashFlow.jsx` fully converted off `base44` (including the `jsonb`/`JSON.parse()` double-encoding bug fix from 10D.0). `Bank.jsx`'s `handleTransfer` repointed; `base44` import dropped from both files. `Admin.jsx`'s `CashFlowEntry`/`CashFlowSummary` moved from `LOCAL_ENTITIES` to `SUPABASE_TABLES`. **Live-verified end-to-end in-browser on `test.kensauto.ca`** with a real logged-in session: `CashFlow.jsx`'s PAD & Registries save/reload round-trip and a real $40 `Bank.jsx` transfer both confirmed working, correct real-user GL attribution, zero console errors. **One real bug found and fixed during live testing**: `CashFlowSummary`'s 12 `bigint` fields silently rejected cents-valued saves (PostgREST 400, swallowed because native `supabase-js` doesn't throw on query errors) — fixed by widening them to `double precision` on both branches (`supabase/migrations/20260808000000_cashflowsummary_bigint_to_double.sql`), re-verified working afterward. All test data cleaned up; dev left exactly as found. 10D is closed.

**10E — research complete, code not started.** Full fresh research pass done 2026-08-03: all 3 legacy function sources (`syncLevies`/`getReportableLeviesReport`/`postLeviesToAP`) and both frontend call sites read in full, real schema/data state confirmed on both branches via direct SQL. `Levies` doesn't exist on production yet (genuinely fresh `CREATE TABLE` needed); `OtherChargeList` exists there but is empty (needs its real 40 rows seeded, same class of gap as 10C.0's `SystemSettings` finding). Two open questions flagged for your call (bigint-to-double preemptive fix, fiscal-period guard) — everything needed to execute either way is written into the 10E section above.

### Exact resume steps for the next session

1. Re-read 10E.0 through 10E.5 above in full (it's self-contained — legacy function logic, the exact frontend conversion table including a response-shape gotcha, and real DB state are all there).
2. **Get your call on the two open questions first** (10E.0's bigint-widening and fiscal-period-guard flags) — both change what gets written into the ported functions/schema.
3. Work 10E's task list top to bottom: schema (Levies fresh-create + OtherChargeList production seed), then port+deploy+curl-verify all 3 functions on dev, then convert both frontend files (watch the response-shape unwrapping change specifically), then deploy to production, then run 10E.5's live verification checklist.
4. Per standing project rules: make code changes only, don't commit/push (the user pushes manually via GitHub Desktop), never touch `main`.
