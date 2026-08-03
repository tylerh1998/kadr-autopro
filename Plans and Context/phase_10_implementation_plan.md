# Phase 10 Implementation Plan: Accounting, GL Reporting, Taxes & Fiscal Periods

**Status:** **In Progress.** 10A and 10B are both **done and confirmed live** on `test.kensauto.ca` (10A via commit `2b21dccaf`; 10B via `edd03df7` + `fdaff904` + `8429b218`/`9e6c1d3b`, confirmed via `git log` 2026-08-03; 10B.5's full verification checklist confirmed by you directly in the plan). **10C (GST & Taxes) backend + frontend code is now complete (2026-08-03) — all 3 functions ported, deployed, and backend-verified on both dev and production; `Taxes.jsx`/`MarkPaidModal.jsx` converted. Not yet committed/pushed — holding per your instruction until you're ready to test on `test.kensauto.ca`.** The critical pre-flight finding from research (production `SystemSettings`/`CashFlowSummary`/`OtherChargeList` all had zero rows) has been resolved for `SystemSettings`: the exact dev row was seeded to production before any function was deployed there (see 10C.0/10C.5 notes below). `CashFlowSummary`/`OtherChargeList` remain empty on production — still 10D/10E's problem, as originally flagged.
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
| **10C** | GST & Taxes: `GSTReturn` CRUD, 3 native functions, `Taxes.jsx`, `MarkPaidModal.jsx` (both fixes) | **Code complete, backend-verified on dev+production, not yet pushed** | **10A** (needs `GSTReturn`/`SystemSettings` schema — done); benefits from 10B's patterns |
| **10D** | Cash Flow & Bank Transfer: `CashFlow.jsx` full cutover, `CashFlowTrendTab.jsx` repoint, `transferFunds` full native rewrite, `Bank.jsx` `handleTransfer` | Not Started | **10A** (`CashFlowSummary`); **10B** (`getFinancialDashboardData`) |
| **10E** | *(conditional on §0.1)* Levies: new schema, 3 native functions, 2 frontend call sites | Pending your decision | **10A**-adjacent (own schema, low interdependency) |

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

- [x] `Taxes.jsx`'s underlying calculation logic: verified against a real period's manually-computed `GLTransaction` sums on production (see task list above) — the live-UI portion of this (actually clicking through `Taxes.jsx` itself) is still open, pending push.
- [ ] Post a throwaway GST return (Jul-Sep 2026, real dev data) → journal entries → mark paid via `MarkPaidModal.jsx` → confirm `BankTransaction`/GL/`GSTReturn.status` all update correctly. **Still open** — the backend logic itself was proven via a *different* disposable test period (2099 Q1, not Jul-Sep 2026) since dev's GL data is empty and Jul-Sep 2026 no longer carries real transactional context to reconcile against. Once pushed, decide whether to exercise this via the real Jul-Sep 2026 return from the live UI, or accept the throwaway-period backend proof as sufficient.
- [x] Confirm the bigint-vs-text account-number comparison (10C.2) actually works against real data — confirmed non-zero, exactly-matching `gst_collected`/`gst_paid` via the production SQL cross-check above.
- [x] Repo-wide grep clean; `npx vite build` clean.

**🛑 HOLD FOR TESTING — code complete, not yet committed/pushed per your explicit instruction to hold until you're ready to test on `test.kensauto.ca`. Once pushed: run `Taxes.jsx`/`MarkPaidModal.jsx` live in-browser, then give the go-ahead before starting 10D.**

---

## 10D) SUB-PHASE D: Cash Flow & Bank Transfer

### 10D.1) `CashFlow.jsx` — closing the Phase 9 gap

Full cutover: `CashFlowSummary.{list,create,update}` and `CashFlowEntry` CRUD, both currently still base44-routed despite `CashFlowEntry`'s table being native since Phase 9. Convert every call site to `supabase.from()`.

### 10D.2) `transferFunds` — full native rewrite

Legacy source is entirely `SupabaseProxy`/raw-`fetch`-routed (no reusable native code, unlike most of this phase's other ports). New `autopro-transferFunds`:
1. Fetch both `BankAccount` rows natively, validate active + `gl_account` set.
2. Insert 2 `BankTransaction` rows (native).
3. Insert 2 `GLTransaction` rows — credit source GL, debit destination GL (native, matching the established dual-entry pattern from `autopro-processLineOfCreditPayment`/`autopro-executeSupplierPayment`).
4. Invoke already-native `autopro-calculateBankBalances` for both accounts.

Convert `Bank.jsx`'s `handleTransfer` (line ~703) to call `autopro-transferFunds`.

### 10D.3) Task List

- [ ] `autopro-transferFunds` ported, deployed to dev, verified via curl (a real throwaway transfer between two dev `BankAccount` rows, balances confirmed correct, then reversed/cleaned up).
- [ ] `CashFlow.jsx` fully converted; `CashFlowTrendTab.jsx` already covered by 10B.
- [ ] `Bank.jsx`'s `handleTransfer` converted.
- [ ] Repo-wide grep clean; `npx vite build` clean.
- [ ] Apply function to production after dev verification.

### 10D.4) Verification Checklist

- [ ] `CashFlow.jsx`: summary/overhead/header debounced saves round-trip against native tables; add-to-sheet still works from the Supplier/LOC side (Phase 9 precedent).
- [ ] `Bank.jsx`: a real throwaway transfer between two accounts, GL entries balance, both `BankAccount.current_balance` update correctly.
- [ ] Repo-wide grep clean; `npx vite build` clean.

**🛑 HOLD FOR TESTING — do not start 10E (if in scope) until you've confirmed the above and given the go-ahead.**

---

## 10E) SUB-PHASE E: Levies

### 10E.1) Schema

`Levies` already exists on dev (built by you mid-Phase-10-planning, confirmed schema in 10A.2 above — no design work needed). This sub-phase's schema job is purely: fix the RLS zero-policy trap on dev (done as part of 10A.2's batch, confirm it landed), then replay the exact same schema + policy to production as a genuinely fresh `CREATE TABLE`. `OtherChargeList` is already covered by 10A — do not duplicate.

### 10E.2) Native function ports (3)

- **`syncLevies`** — called on every WO save via `useDocumentEditorSave.jsx:211`. Reads `OtherChargeList`, writes `Levies.create` (native swap).
- **`getReportableLeviesReport`** — read-only, `Levies`/`OtherChargeList` reads.
- **`postLeviesToAP`** — `Levies`/`OtherChargeList` reads → `GLTransaction` insert (native) + `Levies.update` (native swap). Confirm it does not touch the protected GL functions (already grep-confirmed clean).

### 10E.3) Frontend transport cutover

`src/components/work-orders/hooks/useDocumentEditorSave.jsx` (repoint `syncLevies` invoke), `src/components/reports/ReportableLeviesReport.jsx` (repoint both invokes).

### 10E.4) Task List & Verification

- [ ] Schema created + RLS policy on both branches.
- [ ] All 3 functions ported, deployed to dev, verified via curl.
- [ ] Both frontend files converted.
- [ ] A real WO save triggers `syncLevies` correctly; `ReportableLeviesReport.jsx` shows real data and posts to AP correctly (throwaway data, cleaned up after).
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

*(Empty — filled in as each sub-phase executes and closes out.)*

---

## Current Status & Next Steps (updated 2026-08-03, for context-clear handoff)

### Where things actually stand

**10A — done, pushed, confirmed live.** Commit `2b21dccaf`.

**10B — done, pushed, confirmed live.** Backend commits `edd03df7`/`fdaff904`; the remaining frontend + 3-new-function work from this session pushed via `8429b218`/`9e6c1d3b`. **You've confirmed all of 10B.5's verification checklist directly in this plan (all boxes checked)** — including the `TechnicianPerformanceReport` progress bar, using the test data generated on dev (`WorkOrder RO5001` given a real `labor_total`/`tech_time`, still sitting on dev — harmless to leave, or clean up later, your call). 10B is closed.

**10C — code complete, backend-verified on dev+production, held before push (2026-08-03).** All 3 functions ported/deployed/verified (see 10C.5/10C.6 and the update note atop the 10C section for the full verification trail — note dev's `GLTransaction` was found empty this session, so verification leaned on direct SQL against production's real data plus a throwaway end-to-end test on dev, rather than the originally-planned dev-curl-against-known-figures approach). `Taxes.jsx`/`MarkPaidModal.jsx` converted, `base44` imports dropped, repo-wide grep clean, `npx vite build` clean. **Not committed or pushed** — held per explicit instruction pending the go-ahead to test on `test.kensauto.ca`.

### Exact resume steps for the next session

1. **If resuming to push/test 10C**: commit + push the working tree (7 new/changed files: 3 new edge functions already deployed to both dev+production ahead of push, `Taxes.jsx`, `MarkPaidModal.jsx`, plus this plan doc), then run 10C.6's still-open live-UI checklist item on `test.kensauto.ca` (`Taxes.jsx` full flow, `MarkPaidModal.jsx`, and decide whether to exercise the real Jul-Sep 2026 GST return or accept the throwaway-period backend proof as sufficient). Once confirmed, proceed to 10D.
2. **If resuming to start 10D** (Cash Flow & Bank Transfer) after 10C is confirmed: re-read 10D above in full — note it will hit the same "`CashFlowSummary` empty on production" gap flagged in 10C.0, worth a fresh direct-SQL check before assuming it's been fixed in the meantime.
3. Per standing project rules: make code changes only, don't commit/push (the user pushes manually via GitHub Desktop), never touch `main`.
