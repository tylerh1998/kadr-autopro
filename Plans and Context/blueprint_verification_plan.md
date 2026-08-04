# Blueprint Verification Plan

**Status:** LIVING DOCUMENT — first published 2026-08-03. This document is re-run and updated as later work lands: Phase 12 (Appointment) live testing, the retired "Phase 10A" cross-module scope (folded in here, see below), and Phase 14 (Setup/Admin/Lankar Import/Final Sunset) once it moves out of Planning. It is not a one-time checklist — check items off as they're verified, and append new findings to Section 4 as testing proceeds.

**Prepared:** 2026-08-03 (v1)

**Baseline commit:** `a7ba97da` (development branch)

**Governs:** `master_blueprint.md` Phases 1 through 13. Phase 14 is excluded — it is still in Planning (research done, Section 0 open questions unresolved, no code shipped), so there is nothing yet to document or test. This document should gain a Phase 14 subsection once that phase is code-complete.

**Corrected status baseline this document uses (supersedes any stale status lines inside `master_blueprint.md` or individual phase plan docs where they conflict):**
- Phases 1–11: all `[Tested]`, fully complete.
- Phase 12 (Appointment): code-complete, **NOT yet `[Tested]`** — live click-through verification was deliberately deferred to what was tracked as "Phase 10A." See Section 3 for the full list of flows that still need a first live run.
- Phase 13 (Work Orders Core): `[Tested]`, fully complete. The phase's own internal status line (as of this writing) still reads "In Progress, phase-close regression complete pending one redeploy" — that redeploy (a Counter Sale fix, detailed in Section 1) has since happened and been reverified, closing the gap. Treat Phase 13 as fully closed.

**A note on "Phase 10A":** `master_blueprint.md` tracked a standalone phase called "Phase 10A — Full Inventory Flow + Appointment (Combined Testing & Cleanup)," scoped to run the full receive→AP→payment→GL→bank-reconciliation integration flow across Phases 7–10 plus close out Phase 12's deferred Appointment click-through items. It was never executed and is being **retired as a standalone blueprint phase** — its entire purpose is absorbed directly into this document's Section 3 (Testing Actions), which is a superset of what that phase would have covered. Do not confuse this retired tracking phase with `phase_10_implementation_plan.md`'s own internal sub-phase also labeled "10A" (FiscalPeriod transport cutover) — that is a completed, tested, unrelated piece of work that happens to share the same label. This document uses "sub-phase 10A" to refer to the FiscalPeriod cutover and "blueprint Phase 10A" (or just "the retired Phase 10A") to refer to the cross-module testing phase being folded in here.

This document is meant to be usable standalone by someone who hasn't read `master_blueprint.md`, though it cross-references that document and the individual `phase_N_implementation_plan.md` docs by name rather than duplicating their full contents.

---

## 1. Blueprint Overview

One paragraph per phase, in order, summarizing what it actually did, plus every file/table/function it touched. Phase 12 is marked inline as code-complete-but-not-yet-tested; all others listed here are `[Tested]`.

### Phase 1 — Development & Testing Environment Parity `[Tested]`

Phase 1 closed a severe dev/production drift: the dev Supabase branch was missing the entire `WorkOrder` table (the single most central table in the app), had only 4 of 19 Edge Functions deployed, zero custom secrets set, and — most seriously — RLS enabled with **zero policies** on all 35 manually-copied tables, which would have silently blocked every frontend read/write. Using the Supabase MCP connector, the phase made the dev branch persistent, recreated `WorkOrder` from scratch, applied production's permissive `USING (true)` RLS policy to all 36 dev tables, restored 38 of 39 production SQL functions, and restored 2 of 4 production triggers (`trg_inventory_audit`, `audit_workorder_changes`) plus the `ensure_rls` event trigger — while deliberately leaving out two unsafe triggers (`sync_customer_to_google`, `WorkOrder_Broadcast`) that call external webhooks using a **live production JWT hardcoded in plaintext** inside the trigger definition. A separate structural finding closed the phase: `VITE_BASE44_BACKEND_URL`/`VITE_BASE44_PROXY_URL` are hardcoded to production regardless of which Supabase branch the frontend points at, meaning every one of the ~279 not-yet-migrated `base44.*` call sites hits production data no matter what.

**Files/objects touched:** No frontend `.jsx`/`.js` files (infrastructure-only phase). No new Edge Functions created (existing ones deployed/undeployed). No migration files authored in-repo (`20260730155600_partstech_cart_table.sql` flagged for deletion, executed in Phase 2). **DB:** `WorkOrder` table recreated on dev; RLS policies added to 36 dev tables; 38 SQL functions restored on dev (`update_inventory_with_audit`, `log_inventory_audit`, `process_workorder_audit`, `process_payment_atomic`, the `search_*_ranked` family, `get_balance_sheet_data`, `get_general_ledger_data`, `get_customer_ar_data`, and 30 more); triggers `trg_inventory_audit`, `audit_workorder_changes`, `ensure_rls` restored; `sync_customer_to_google` and `WorkOrder_Broadcast` triggers deliberately left unrestored on dev.

### Phase 2 — PartsTech / Online Ordering Removal `[Tested]`

A pure-deletion phase removing the entire PartsTech/NAPA ProLink online-ordering feature, confirmed by the user as a failed experiment with nothing to migrate or replace. Execution matched the plan exactly with no surprises: a React modal, 3 Edge Functions, a Chrome extension directory, an Electron cart-scraping bridge, a Setup-page download button, and the live production `PartsTechCart` table were all removed. One item was deliberately retained: the "Quoted (Not Ordered)" badge in `LineItemsTable.jsx`, earmarked for a different future feature.

**Files/objects touched:** Deleted `src/components/work-orders/OnlineOrderModal.jsx`, `electron/preload.cjs`, `partstech-extension/` (3 files). Edited `src/components/work-orders/form/WorkOrderForm.jsx`, `src/components/work-orders/form/LineItemsTable.jsx`, `src/pages/Setup.jsx`, `electron/main.js`. Deleted Edge Functions: `autopro-partstech-session`, `autopro-partstech-callback`, `autopro-extractCartTextLLM`. **DB:** `public."PartsTechCart"` dropped from production. Migration `20260730155600_partstech_cart_table.sql` confirmed already removed from the working tree; no new migration files.

### Phase 3 — Auth Centralization + User→Employee Settings Migration `[Tested]`

Migrated every `base44.auth.me()` / `base44.auth.updateMe()` / `@/entities/User` call site (35 sites across 26+ files, 5 more than originally inventoried) onto the app's already-working Supabase-Auth-backed `AuthContext`, extended with an `employee` field resolved via `mykadr_user_id` and a generic `updateEmployeePrefs()` writer. Four new columns were added to `Employee` (`dark_mode`, `paypro_user`, `autopro_access_lvl`, `accts_pay_access`). A deep second-pass read of `Layout.jsx` found it used the base44 `user` object far more extensively than first inventoried, requiring a full field-name census (`role`→`admin`, `AcctsPayAccess`→`accts_pay_access`, `access_level==='lvl3_user'`→`autopro_access_lvl`). `wo_cards`/`OpenNewWindow` fields were deprecated outright (confirmed dead), and `ProtectedRoute.jsx` was deleted (zero importers).

**Files/objects touched:** `src/lib/AuthContext.jsx` (extended), `src/Layout.jsx` (full field census + dead-code removal). 35 call sites across: `PageNotFound.jsx`, `Bank.jsx`, `CashDrawer.jsx`, `Customers.jsx`, `AppointmentForm.jsx`, `DepositModal.jsx`, `AddAdjustmentModal.jsx`, `ReceiveCreditModal.jsx`, `NewCustomerModal.jsx`, `InventoryList.jsx`, `LinesOfCredit.jsx`, `Payroll.jsx`, `EditInventoryTransactionModal.jsx`, `Reconcile.jsx`, `SupplierPaymentModal.jsx`, `SupplierTx.jsx`, `NewVehicleModal.jsx`, `Vehicles.jsx`, `Suppliers.jsx`, `Taxes.jsx`, `TechTimeModal.jsx`, `Admin.jsx`, `DocumentEditor.jsx`, `CreditInvoice.jsx`, `WorkOrders.jsx`, `TimeRecordsView.jsx`, `Setup.jsx`, `WorkOrderView.jsx`, `WorkOrderHistoryModal.jsx`, and others. Deleted `src/components/ProtectedRoute.jsx`. **DB:** `ALTER TABLE public."Employee"` adding `dark_mode`, `paypro_user`, `autopro_access_lvl`, `accts_pay_access` (applied dev + production, no named migration file). No new Edge Functions.

### Phase 4 — WorkPRO / Tech-Time Rewire `[Tested]` (includes Followup plan)

Replaced every `base44.functions.invoke('workProProxy', ...)` call with direct `supabase.from()` calls against `Project`, `ProjectTimeSession`, `TimeRecord`, `UnassignedTime`, and `Employee` — all already carrying permissive RLS, so this was transport-layer-only. The one real server-side orchestration piece, `archiveWorkOrderProjects`, was rebuilt as a native Edge Function. `TechDirectory.jsx`'s WorkPRO-sync feature was retired in favor of a direct `Employee` read. Two orphaned files and a redundant native function were deleted. A real bug was found and fixed live: `GlobalClockInModal.jsx`'s `UnassignedTime` insert used an invalid `employee_name` field (real column is `user_name`). The Followup plan (executed same day) closed three items Phase 4 had deferred: migrated `TechClockStatusModal.jsx` off base44 (code changed but not yet live-click-tested, since the deployed bundle hadn't rebuilt yet); verified `InvoiceConversion.jsx`'s repoint to the new native function via direct backend invocation; and applied `Employee.pay_rate` `bigint`→`numeric(10,2)` — **to the dev branch only**, with production explicitly withheld pending the user's go-ahead ("Not yet — I'll say when," as of this writing).

**Files/objects touched:** `src/Layout.jsx`, `src/pages/WorkOrders.jsx`, `src/components/work-orders/GlobalClockInModal.jsx` (bug fix), `src/components/work-orders/WorkPRODescriptionModal.jsx`, `src/components/work-orders/TechTimeModal.jsx`, `src/components/setup/TechDirectory.jsx`, `src/pages/InvoiceConversion.jsx`, `src/components/work-orders/TechClockStatusModal.jsx` (Followup 3C). Deleted `src/components/timerecords/TimeRecordsView.jsx`, `TimeRecordsList.jsx`; deleted `supabase/functions/autopro-getProjectTimeSessions/` (source + both deployments). New Edge Function: `autopro-archiveWorkOrderProjects`. No new DB tables. Migration (dev-only, unnamed): `Employee.pay_rate` `bigint`→`numeric(10,2)`.

### Phase 5 — Customer, Vehicle & GL Cleanup (transport-layer only) `[Tested]`

A pure transport-layer cleanup — `Customer`, `Vehicle`, and `GLTransaction` were already 100% native — replacing all remaining Base44 proxy/function calls across 21 files (48 call sites) with direct `supabase.from()`/`supabase.rpc()` calls or 4 new native Edge Functions for cross-table logic (customer/vehicle merges, VIN decode, AR aging summary). Two real bugs were found and fixed in `autopro-mergeVehicles`: an `esm.sh` import crashing at Deno worker startup (switched to `npm:`), and a `createClientFromRequest(req)` call that threw before any native work ran (moved into a non-fatal try/catch). All 4 new functions were also normalized to the project's always-200 error convention.

**Files/objects touched:** 21 files including `DocumentEditor.jsx`, `NewVehicleModal.jsx`, `AppointmentForm.jsx`, `Customers.jsx`, `CashDrawer.jsx`, `Schedule.jsx`, `ARPaymentDetailsModal.jsx`, `CustomerARTransactions.jsx`, `CustomerARSummary.jsx`, `InvoicePaymentModal.jsx`, `EditApptViaWoModal.jsx`, `CustomerForm.jsx`, `AddLegacyInvoiceModal.jsx`, `DepositDetailsModal.jsx`, `Vehicles.jsx`, `ChangeCustomerModal.jsx`, `MergeVehicleModal.jsx`, `VehicleForm.jsx`, `NewWorkOrderModal.jsx`, `MergeCustomerModal.jsx`, `WorkOrderProfitability.jsx`. New Edge Functions: `autopro-mergeCustomers`, `autopro-mergeVehicles`, `autopro-decodeVin`, `autopro-supabaseCustomerARSummary`. No new tables or migrations.

### Phase 6 — Reports Module `[Tested]`

Cut 6 remaining Base44-hosted report functions (plus one already-native report still routed through the legacy `SupabaseProxy`) over to native Supabase Edge Functions, zero behavior change intended. Two real bugs found/fixed: a stale `role`/`access_level` field-name check in `ReportModal.jsx` that silently blocked every user, including admins, from ever opening the Sales Analysis report since Phase 3 renamed those fields; and a project-wide error-handling convention violation caught pre-deploy (all 6 functions redesigned to always return `200` with `{error}`). One dependency was deliberately deferred rather than blocking the phase: `getTechnicianPerformanceReport`'s "Monthly Payroll Target vs Labour Sales" progress bar depended on `CashFlowSummary`, which had no native table yet — the utilization/efficiency logic was fully migrated, but the progress bar's data was hardcoded to `{target: 0, current: 0}` and the card hidden client-side (later restored in Phase 10B).

**Files/objects touched:** `CustomerReportModal.jsx`, `OtherChargesBreakdownReport.jsx`, `SalesAnalysisReport.jsx`, `TechnicianPerformanceReportModal.jsx`, `WorkOrderSummaryReport.jsx`, `InventoryOnOrder.jsx`, `PartsMovementReportModal.jsx` (repointed to direct RPC, no new function), `ReportModal.jsx` (bug fix only). New Edge Functions: `autopro-getCustomerReportData`, `autopro-getOtherChargesBreakdown`, `autopro-getSalesAnalysisReport`, `autopro-getTechnicianPerformanceReport`, `autopro-getWorkOrderSummaryReport`, `autopro-getRealTimeInventoryOnOrder`. No new tables or migrations (read-only phase).

### Phase 7 — Inventory Completion `[Tested]`

Executed across three sub-phases. **7A** created three new native tables — `InventoryCategory`, `InventoryLocation`, `ReturnReason` (CSV-imported from Base44) — and cut over `InventoryAddModal.jsx`, `LocationModal.jsx`, `InventoryPartsReturnModal.jsx`, and `EditReturnInfoModal.jsx`. **7B** fully rewired `LegacyWarrantyReturnModal.jsx`, inlined `searchInventory` as a direct `search_inventory_ranked` RPC call, and built a new Gemini-based Edge Function, `autopro-suggestInventoryCategory`. **7C** finished `InventoryAdd.jsx`'s remaining Base44 calls, applied a GL cent-rounding fix to `autopro-processQOHAdjustment`, and — as an out-of-plan addition discovered mid-close-out — fully migrated `src/pages/InventoryList.jsx` off Base44, which also fixed a silent 200-row search cap. The recurring "`Promise.all` poisoned by a still-base44 call" pattern (see Section 2) surfaced twice in this phase (`InventoryAddModal.jsx`, `InventoryAdd.jsx`, both mixing native calls with `TagAlong.list()`) and was fixed both times by decoupling into independent try/catch blocks. A substantial list of flows were left genuinely unverified due to near-empty dev-branch seed data (see Section 2).

**Files/objects touched:** `src/components/inventory/InventoryAddModal.jsx`, `LocationModal.jsx`, `InventoryPartsReturnModal.jsx`, `EditReturnInfoModal.jsx`, `LegacyWarrantyReturnModal.jsx`, `src/pages/InventoryAdd.jsx`, `src/pages/InventoryList.jsx`. New Edge Function: `autopro-suggestInventoryCategory`. Modified: `autopro-processQOHAdjustment` (rounding fix). New DB tables: `InventoryCategory`, `InventoryLocation`, `ReturnReason` (all 24-char-hex `id`, `USING (true)` RLS). Migration applied via MCP tool (no filename beyond the internal migration name `create_inventory_category_location_returnreason_tables`).

### Phase 8 — Banking & Cash Drawer `[Tested]`

Executed across three sub-phases. **8A** created `CashDrawerAdjustment`/`DepositSlipBreakdown`, fixed the same RLS zero-policy trap on dev, and converted `BankAccount`/`BankTransaction`/`BankReconciliation` call sites across 9 files. **8B** ported the remaining 4 legacy functions (reconciliation, batch reconcile, history, lock-flush) and found/fixed a UI bug: `Reconcile.jsx`'s transaction-row checkboxes had a double-firing click handler that netted to a no-op on the checkbox itself. **8C** ported deposit-slip PDF generation, a detail report, and the highest-risk function, `reverseDeposit` (a 7-step reversal chain), switching GL-reversal audit identity to derive from the caller's own Supabase JWT rather than a base44 session. A real, still-unresolved gap was flagged (not fixed) here: `DepositHistoryModal.jsx`'s `loadDeposits()` bundles a still-base44 `FiscalPeriod.list()` call with the already-native transaction fetch in one `Promise.all`, so the 401 on `FiscalPeriod` blanks the entire deposit-history list. `Bank.jsx`'s `handleTransfer` was found still calling legacy `transferFunds` — flagged, explicitly out of scope, carried forward.

**Files/objects touched:** `src/pages/Bank.jsx`, `CashDrawer.jsx`, `Reconcile.jsx` (bug fix), `ReconcileReport.jsx`, `src/components/bank/BankTransactionModal.jsx`, `BankTransferModal.jsx`, `AutoReconcileModal.jsx`, `ReconciliationHistoryModal.jsx`, `src/components/cash-drawer/CashDrawerAdjustmentModal.jsx`, `DepositDetailsModal.jsx` (the cash-drawer one — distinct from a same-named presentational file in `bank/`), `DepositHistoryModal.jsx`, `DepositModal.jsx`, `DepositSlipBreakdownModal.jsx`. New Edge Functions (9): `autopro-getBankTransactions`, `autopro-calculateBankBalances`, `autopro-processBankReconciliation`, `autopro-batchReconcileTransactions`, `autopro-getReconciliationHistory`, `autopro-flushBankLocks`, `autopro-generateDepositSlipPDF`, `autopro-generateDepositDetailReport`, `autopro-reverseDeposit`. New DB tables: `CashDrawerAdjustment`, `DepositSlipBreakdown`. Migration: `supabase/migrations/20260805000000_cashdrawer_depositslip_tables.sql`.

### Phase 9 — AP, Suppliers, Lines of Credit & ChartOfAccount finish-up `[Tested]`

Executed across four sub-phases. **9A** created `LinesOfCredit`/`LinesOfCreditTransaction`/`CashFlowEntry` and cut `ChartOfAccount` over across 16 files. **9B** ported 8 Supplier/AP functions (including `executeSupplierPayment`, an unscoped-but-necessary addition since `processSupplierPayment` fire-and-forgets to it for actual GL/bank posting via `process_payment_atomic`); the write path (add invoice line → save → payment → cancel) could **not** be verified live in this sub-phase, blocked by `SupplierTx.jsx`'s `handleGlAccountChange` hitting a still-base44 `FiscalPeriod` check that 401s under a Supabase-only session. **9C** ported 4 Lines-of-Credit functions and the heaviest carry-forward file, `ReceiveCreditModal.jsx`; fully live-verified by the user, the strongest verification tier reached in either phase. During this work a real, ported-as-is gap was found and deliberately **not** fixed: `cancelLineOfCreditPayment`'s cross-account reversal branch never restores the source LOC's balance, only the target's. **9D** ported `generateChequePDF` and found/fixed a genuine bug: `SupplierPayment.invoice_number` is a real `jsonb` array in Postgres, but the legacy code still called `JSON.parse()` on it, silently throwing and caught, meaning the cheque stub's "applied invoices" list had never rendered for any real cheque, in either the legacy function or a faithful port — fixed with a `safeParseJsonArray` guard.

**Files/objects touched:** 16 files for the `ChartOfAccount` cutover (`ChartOfAccounts.jsx`, `Bank.jsx`, `GeneralLedger.jsx`, `JournalEntries.jsx`, `GLAcct.jsx`, `GLJournal.jsx`, `BankTransactionModal.jsx`, `BankAccountEditModal.jsx`, `CashDrawerAdjustmentModal.jsx`, `RecordAdjustmentModal.jsx`, `AddAdjustmentModal.jsx`, `OtherChargesManager.jsx`, `LegacyWorkOrderImportModal.jsx`, `SupplierForm.jsx`, `LinesOfCreditEditModal.jsx`, `LineOfCreditTransactionModal.jsx`, `ReceiveCreditModal.jsx`); `src/pages/Suppliers.jsx`, `SupplierTx.jsx`, `SupplierTxView.jsx`, `src/components/suppliers/APSummaryTable.jsx`, `AddToSheetModal.jsx`, `SupplierPaymentModal.jsx`, `src/components/cheques/IssuedChequesTable.jsx`; `src/pages/LinesOfCredit.jsx`, `src/components/lines-of-credit/LinesOfCreditEditModal.jsx`, `LineOfCreditTransactionModal.jsx`, `LineOfCreditPaymentModal.jsx`, `PaymentTransactionItem.jsx`, `LOCReconciliationModal.jsx`; `src/pages/ChequeWriter.jsx`. New Edge Functions (13): `autopro-getAPSummary`, `autopro-acquireSupplierLock`, `autopro-calculateSupplierPaymentBreakdown`, `autopro-saveSupplierInvoiceTransactions`, `autopro-cancelSupplierPayment`, `autopro-getSupplierTransactions`, `autopro-processSupplierPayment`, `autopro-executeSupplierPayment`, `autopro-processLineOfCreditTransaction`, `autopro-calculateLineOfCreditPaymentBreakdown`, `autopro-processLineOfCreditPayment`, `autopro-cancelLineOfCreditPayment`, `autopro-generateChequePDF`. New DB tables: `LinesOfCredit`, `LinesOfCreditTransaction`, `CashFlowEntry`. Migration: `supabase/migrations/20260806000000_loc_cashflow_tables.sql`.

### Phase 10 — Accounting, GL Reporting, Taxes & Fiscal Periods `[Tested]`

Executed across five sub-phases. **Sub-phase 10A** (FiscalPeriod cutover — not to be confused with the retired blueprint-level "Phase 10A" this document folds in) made `FiscalPeriod` fully native across `fiscalPeriodUtils.jsx`'s shared `checkFiscalPeriodStatus()` chokepoint, `FiscalPeriods.jsx`, and `DepositHistoryModal.jsx` (explicitly fixing the Phase 8-flagged `Promise.all` bundling issue there — though never live-reverified, see Section 2). **10B** ported 9 GL/financial-report functions and `postJournalEntries`, and restored the `TechnicianPerformanceReport` payroll-target progress bar deferred since Phase 6. **10C** ported the GST domain (`autopro-calculateGSTReturn`, `autopro-postGSTJournalEntries`, `autopro-processGSTPayment`) and discovered production's `SystemSettings` was schema-only with zero rows, seeding it before deploy — live UI testing here only ever exercised a $0.00 case, since dev's GL data was empty. **10D** rewrote `transferFunds` natively (finally resolving the Phase 8→9→10 carried-forward `Bank.jsx handleTransfer` item) and fully converted `CashFlow.jsx`, fixing a real bug live: `CashFlowSummary` had 12 `bigint` money fields silently rejecting cents. **10E** built a brand-new `Levies` schema and 3 native functions (`autopro-syncLevies`, `autopro-getReportableLeviesReport`, `autopro-postLeviesToAP`), the latter gaining a `checkFiscalPeriodStatus()` guard the legacy version lacked, live-verified via a real Post-to-AP click.

**Files/objects touched:** `src/components/utils/fiscalPeriodUtils.jsx`, `src/pages/FiscalPeriods.jsx`, `src/components/cash-drawer/DepositHistoryModal.jsx`, `src/pages/Admin.jsx` (10A); `src/pages/GeneralLedger.jsx`, `GLAcct.jsx`, `GLJournal.jsx`, `PLReport.jsx`, `BalanceSheet.jsx`, `FinancialDashboard.jsx`, `src/components/cash-flow/CashFlowTrendTab.jsx`, `src/pages/JournalEntries.jsx` (10B); `src/pages/Taxes.jsx`, `src/components/taxes/MarkPaidModal.jsx` (10C); `src/components/cash-flow/CashFlow.jsx`, `src/pages/Bank.jsx` (10D); `src/components/work-orders/hooks/useDocumentEditorSave.jsx`, `src/components/reports/ReportableLeviesReport.jsx` (10E). New Edge Functions: `autopro-getGeneralLedgerData`, `autopro-getThreeMonthAPReport`, `autopro-getGLJournalData`, `autopro-getGLAccountTransactions`, `autopro-getBalanceSheetData`, `autopro-getPLReportData`, `autopro-getFinancialDashboardData`, `autopro-findGLImbalances`, `autopro-getThreeMonthPLReport`, `autopro-postJournalEntries` (10B); `autopro-calculateGSTReturn`, `autopro-postGSTJournalEntries`, `autopro-processGSTPayment` (10C); `autopro-transferFunds` (10D); `autopro-syncLevies`, `autopro-getReportableLeviesReport`, `autopro-postLeviesToAP` (10E). New RPCs: `get_gl_journal_data`, `get_gl_account_transactions`, `get_financial_dashboard_gl_monthly`, `get_bank_cash_flow_daily` (10B). New DB table: `Levies` (10E). Empty-schema tables replayed to production: `GSTReturn`, `SystemSettings`, `CashFlowSummary`, `OtherChargeList` (10A; seeded with real data in 10C/10D/10E). Migrations: `20260807000000_gst_systemsettings_othercharge_cashflowsummary_tables.sql` (10A), `20260808000000_cashflowsummary_bigint_to_double.sql` (10D), `20260809000000_levies_table_and_bigint_fix.sql` (10E).

### Phase 11 — Payroll `[Tested]`

A near-pure transport-layer cutover — `PayrollTransaction` was already schema-identical with correct RLS on both branches. Converted every `SupabaseProxy` call across `Payroll.jsx`, `MarkPaidModal.jsx`, `AddPaychequeModal.jsx`, `AddRemittanceModal.jsx`, and `AddAdjustmentModal.jsx`; ported `parsePayrollFile` 1:1 into a native Edge Function; resolved `MarkPaidModal.jsx`'s Phase-8-carried-forward `BankAccount` call site; deleted 3 confirmed-dead payroll components. Mid-execution, a plan assumption was found wrong via direct SQL: none of `PayrollTransaction`/`BankTransaction`/`BankAccount`/`GLTransaction`'s `id` columns had a working default, so every insert added this phase needed an explicit client-generated id matching the legacy shim's convention. The file-upload parse path and the `window.confirm`-gated reversal path (`Payroll.jsx handleDelete`) were **not** click-tested live — see Section 2.

**Files/objects touched:** `src/pages/Payroll.jsx`, `src/components/payroll/MarkPaidModal.jsx`, `AddPaychequeModal.jsx`, `AddRemittanceModal.jsx`, `AddAdjustmentModal.jsx`. Deleted: `PreviousPaychequesModal.jsx`, `PayrollEmployeeForm.jsx`, `EmployeeDetailsForm.jsx`. New Edge Function: `autopro-parsePayrollFile`. No new tables or migrations.

### Phase 12 — Appointment Completion **`[CODE-COMPLETE — NOT YET TESTED]`**

Corrected the blueprint's stale "Hybrid" classification of `Appointment`: the native table had zero rows and was missing 7 of 15 fields the live UI actively read/wrote. A migration added the missing columns (`employee_id`, `status`, `reminders_email`, `reminders_text`, `reminder_email_address`, `reminders_phone`, `reminder_days_before`, plus audit fields) and renamed `created_at`→`created_date`. Every Appointment CRUD call site was cut over to direct `supabase.from()` calls across `Schedule.jsx`, `EditApptViaWoModal.jsx`, `WorkOrders.jsx`, and `useWorkOrder.jsx`. The two Base44-hosted reminder functions (`sendAppointmentReminders`, `sendTextReminders`) were surgically patched — **not natively ported** — to read `Appointment`/`Customer`/`Vehicle` via direct PostgREST `fetch()` calls instead of the Base44 SDK, while remaining Base44-hosted. A real bug was found and fixed live: submitting a new appointment with no technician selected threw a Postgres `22P02` error because `employee_id` defaults to `''` in the form but the new `bigint` column rejects empty string — fixed at the shared `handleFormSubmit` choke point, but **this fix itself was made after the last live test submit of that session and has never been re-confirmed live.** This is the central reason this document exists: essentially nothing in the Appointment domain has had a first live click-through. See Section 3 for the complete list of flows to run.

**Files/objects touched:** `src/pages/Schedule.jsx`, `src/components/work-orders/EditApptViaWoModal.jsx`, `src/pages/WorkOrders.jsx`, `src/components/hooks/useWorkOrder.jsx`, `src/components/appointments/AppointmentForm.jsx`, `src/components/work-orders/SchedulerViaWoModal.jsx` (dead-import cleanup only), `src/components/appointments/CellAppointmentsModal.jsx`, `src/components/work-orders/AppointmentsListModal.jsx`, `src/pages/Admin.jsx`, `src/components/work-orders/DocumentEditor.jsx` (dead import removed). Patched (still Base44-hosted, not native): `base44/functions/sendAppointmentReminders/entry.ts`, `base44/functions/sendTextReminders/entry.ts`. New Base44-platform secrets: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`. DB: `Appointment` gained `employee_id`, `status`, `reminders_email`, `reminders_text`, `reminder_email_address`, `reminders_phone`, `reminder_days_before`, `updated_date`, `created_by`, `created_by_id`; `created_at` renamed `created_date`. Migration: `supabase/migrations/20260804000000_appointment_add_missing_columns.sql`.

### Phase 13 — Work Orders Core `[Tested]`

Executed across five sub-phases, the highest blast-radius phase in the blueprint. **13A** built a race-safe `set_workorder_lock` RPC replacing JS-side CAS lock logic, and deleted the entire dead Kanban cluster (4 files). **13B** replaced `getworkorderdata`/`getworkorderlist`/`createworkorderdata` with direct reads and a new `search_work_orders` RPC, discovering `WorkOrder.id` is a 24-char truncated-hex string, and fixed 9 `JSON.parse()` call sites guarding against already-parsed `jsonb`. **13C** ported `convertEstimateToWorkOrder` and `ReturnCoretoWO`, built `search_work_order_parts`, and converted ~10 small entity reads; `autopro-syncLevies` was explicitly deferred here since the `Levies` table didn't exist yet on either branch. **13D** ported all 6 document/communications functions (PDF generation, portal snapshots, SMS, email, notes board) with real external side effects confirmed live (real SMS/email sent). **13E** finished `WOAddInventoryModal.jsx`'s remaining call sites, converted `WarrantyReturnModal.jsx`'s WO dependency, and ran a full phase-close lifecycle regression that surfaced **6 real, previously-unexercised bugs across 8 files**: (1) `WorkOrders.jsx`'s Counter Sale insert referenced a non-existent `WorkOrder` column (`cp_id`) — fixed and reverified live; (2) the same Counter Sale insert also referenced four more non-existent columns (`customer_complaint`, `estimated_hours`, `scheduled_date`, `technician`) — fixed, and per the corrected status given for this document, this fix has since been redeployed and reverified, closing what was the phase's last open item; (3) five files (`FinancialSummary.jsx`, `WorkOrderViewFinancialSummary.jsx`, `AdvancePaymentModal.jsx`, `SESEmailModal.jsx`, `BatchSendWorkOrdersModal.jsx`) were missing a jsonb-vs-string guard on `WorkOrder.payments` already applied elsewhere — fixed; (4) `WOAddInventoryModal.jsx`'s existing-part batch-add path did unguarded `stringColumn + number` arithmetic on text-typed `quantity_on_order`/`quantity_on_hand` columns, silently corrupting inventory counts via JS string concatenation (`"1" + 1 = "11"`) — described as the worst-severity finding of the pass, fixed and reverified. A separate real production bug, `search_inventory_ranked`'s duplicate-overload ambiguity, was found and fully resolved (the only Phase 13 database change confirmed reaching production alongside everything else, which stayed dev-only pending a deliberate production-replay pass).

**Files/objects touched:** `src/components/work-orders/DocumentEditor.jsx`, `src/pages/WorkOrders.jsx`, `src/components/work-orders/hooks/useDocumentEditorSave.jsx`, `src/components/hooks/useWorkOrder.jsx`, `src/components/work-orders/NewWorkOrderModal.jsx`, `WorkOrderReport.jsx`, `OpenROModal.jsx`, `src/pages/InvoiceConversion.jsx`, `src/components/work-orders/GetPartModal.jsx`, `FindPartModal.jsx`, `NewWorkPROModal.jsx`, `WorkPROCommentsModal.jsx`, `WorkPROEditProjectModal.jsx`, `WorkPROModal.jsx`, `OtherChargeModal.jsx`, `ReturnWOPartModal.jsx`, `ROCoreModal.jsx`, `history/JsonToTableDisplay.jsx`, `history/WorkOrderHistoryModal.jsx`, `ROApprovalsModal.jsx`, `WorkOrderPdfModal.jsx`, `SESEmailModal.jsx`, `WOAddInventoryModal.jsx`, `WarrantyReturnModal.jsx`, `src/components/work-orders/form/LineItemsTable.jsx`, `WorkOrderHeaderInfo.jsx`, `WorkOrderViewHeaderInfo.jsx`, `src/components/work-orders/form/FinancialSummary.jsx`, `WorkOrderViewFinancialSummary.jsx`, `AdvancePaymentModal.jsx`, `src/components/ar/BatchSendWorkOrdersModal.jsx`. Deleted: `KanbanBoard.jsx`, `KanbanColumn.jsx`, `KanbanCard.jsx`, `KanbanDisplaySettings.jsx`. New Edge Functions: `autopro-changeWorkOrderCustomer`, `autopro-convertEstimateToWorkOrder`, `autopro-returnCoreToWO`, `autopro-generateWorkOrderPdf`, `autopro-createPortalSnapshot`, `autopro-sendSms`, `autopro-sendEmailViaSMTP`, `autopro-getNotesBoardData`. New RPCs: `set_workorder_lock`, `search_work_orders`, `search_work_order_parts`. New DB tables: `Approvals`, `CustomerPortalWorkOrder`, `SentEmailLog`. Also (dev-only, created directly by the user mid-execution, **not yet replayed to production**): `SystemSettings`, `WorkOrderStatus`, `TagAlong`, `OtherChargeList`. Migrations: `add_rls_policy_systemsettings_workorderstatus_tagalong_otherchargelist`, `phase13d_approvals_policy_and_portal_email_log_tables`, `drop_stale_search_inventory_ranked_6param_overload` (this one reached both dev and production).

---

## 2. Requires Attention

A dynamic checklist gathered from all 13 phase docs plus `master_blueprint.md` Section 7 (Lessons Learned). Check items off by hand as they're resolved or verified; do not silently remove an item without re-verifying it. Where two source documents conflict, both sides are stated rather than one being picked silently.

### Cross-cutting / infrastructure

- [ ] **Expired `BASE44_ACCESS_TOKEN`** — a standing, project-wide infra issue first flagged at Phase 7 closeout, still causing 401s on every remaining still-base44 call app-wide (e.g. `TagAlong.list()`, the reminder functions' own Base44 hosting). No entry in any phase doc confirms the token was ever refreshed. It briefly appeared to be blocking `DocumentEditor.jsx` in Phase 13 but was later found to be a misdiagnosis (a leftover `useShopData()` call, not the token) — so the token issue itself remains unresolved and will keep surfacing as "broken" symptoms on any page not yet fully migrated off Base44 (chiefly the Appointment reminder functions and anything still touching `TagAlong`).
- [ ] **Plaintext JWT hardcoded in two production Postgres triggers** — `sync_customer_to_google` (on `Customer`) and `WorkOrder_Broadcast` (on `WorkOrder`) both call `supabase_functions.http_request()` with a live service-role/anon JWT visible in plaintext to anyone with schema read access. Flagged at Phase 1, never scoped into any phase, no decision recorded on rotation or removal timing. Related: the `Google-Contacts-Sync` Edge Function one of these triggers calls is live in production but has no source tracked in the local repo at all.
- [ ] **"`Promise.all` poisoned by a still-base44 call" pattern — full status by file:**
  - `Schedule.jsx`'s `loadData()` (bundles still-base44 `getworkorderlist()` with native `Appointment`/`Employee`/`Customer`/`Vehicle` calls) — flagged in Phase 12, **appears still unresolved**: Phase 13B built a native `search_work_orders` RPC and repointed `WorkOrders.jsx`'s own list to it, but no phase doc shows `Schedule.jsx` itself being touched to use the new RPC or otherwise decoupled. This directly blocks customer/vehicle dropdowns in the New Appointment form under a dev-native session and is squarely inside what Section 3's Appointment testing needs to exercise — check this first.
  - `InventoryAddModal.jsx` (mixed `TagAlong.list()` with native `InventoryCategory` fetch, Phase 7A) — **fixed** (decoupled into independent try/catch).
  - `InventoryAdd.jsx` (same pattern, Phase 7C) — **fixed** (decoupled).
  - `OtherChargesManager.jsx` (mixed native `ChartOfAccount` with still-base44 `OtherChargeList`, Phase 9A) — **fixed** (decoupled).
  - `WorkOrders.jsx`'s `loadData()` (mixed `getNotesBoardData` with native `search_work_orders` RPC calls, Phase 13) — **fixed** (given its own `.catch()`).
  - `DepositHistoryModal.jsx`'s `loadDeposits()` (mixed still-base44 `FiscalPeriod.list()` with native `autopro-getBankTransactions`, first flagged Phase 8C) — **code fixed** in Phase 10 sub-phase 10A (decoupled atomically), but **live UI re-verification never happened** — Phase 10's own closeout explicitly lists this among 3 flows "never circled back" to. Needs a direct check that the deposit-history list actually loads now.
- [ ] **Re-verify the 3 flows Phase 10 sub-phase 10A itself flagged as never circled back to**: `SupplierTx.jsx`'s `handleGlAccountChange` (the write-path blocker from Phase 9B), `SupplierPaymentModal.jsx`, and `DepositHistoryModal.jsx`'s deposit list (see above). All three were expected to unblock once `FiscalPeriod` went native, but none were re-tested live after that cutover landed.
- [ ] **`FiscalPeriods.jsx` create/edit/close-period round-trip** — only the list-load itself was live-verified in sub-phase 10A; the actual CRUD round-trip was never click-tested.

### Cross-phase resolution status (things one phase deferred that a later phase claims to have closed)

- [ ] **Phase 6's payroll-target progress bar** (`TechnicianPerformanceReportModal.jsx`) — deferred in Phase 6 (hardcoded to 0, card hidden) pending `CashFlowSummary` migration. Phase 10B claims to have restored it and reports live-verifying it — but only **with manufactured test data on dev**, since dev's real GL data was largely empty at that point. Worth a spot check against real production labour-sales figures once available.
- [ ] **Phase 13C's deferred `autopro-syncLevies` vs. Phase 10E's native `syncLevies`** — these are two distinct items, not the same gap. Phase 13C deferred porting `autopro-syncLevies` because the `Levies` table didn't exist. Phase 10E later built the `Levies` schema and the native `syncLevies`/`getReportableLeviesReport`/`postLeviesToAP` functions, live-verifying the Report/Post-to-AP flow. **However**, Phase 13's own WO-save trigger call site in `useDocumentEditorSave.jsx` is explicitly confirmed, in Phase 13's own text, to still be 401ing / still deferred as of the end of that phase ("unchanged by this session"). Nothing in either phase doc confirms this call site was ever reconnected to Phase 10E's new function. **This is a real, still-open wiring gap** — verify whether saving a Work Order today correctly triggers `autopro-syncLevies`, or whether that call site is still pointed at the old (or nowhere).
- [ ] **Possible documentation conflict — Supplier lock-recovery fix**: `master_blueprint.md`'s Lessons Learned log (Section 7) describes a specific resolved incident attributed to Phase 9 — a supplier (`DENHAM CHRYSLER JEEP LTD.`) found stuck locked on production since March, fixed by building a new `autopro-releaseSupplierLock` function wired via a `keepalive` fetch pattern. A full read of `phase_9_implementation_plan.md` itself contains **no mention of this incident, no `autopro-releaseSupplierLock` function, and no DENHAM CHRYSLER reference anywhere** — that phase doc's own recorded decision on lock recovery (§0.1) explicitly states the opposite: "Port `acquireSupplierLock` as-is, no `locked_timestamp`/staleness/flush addition. Pure migration, not a UX fix." Confirm with the user whether this fix actually happened (in which case `phase_9_implementation_plan.md` is simply incomplete) or whether the `master_blueprint.md` entry describes work that was never captured in any phase plan doc — and either way, confirm whether `autopro-releaseSupplierLock` exists as a deployed function today.

### Phase 7 (Inventory) — untested for lack of data

- [ ] `LocationModal.jsx` change/add/edit-location flows — never tested; no inventory item with an assignable location existed in dev-branch seed data across all of 7A/7B/7C.
- [ ] Parts return / edit-return-info flows (`InventoryPartsReturnModal.jsx`, `EditReturnInfoModal.jsx`) — never tested, no return-eligible test data.
- [ ] `WarrantyReturnModal.jsx` (the work-orders one) regression check for the file changes Phase 7 made nearby — file itself was untouched by Phase 7 but never confirmed still working; dev had zero Work Orders at every Phase 7 testing pass. (Note: Phase 13E later did touch and live-test this exact file's `WorkOrder.get()`/`.update()` conversion and its GL-transaction insert — see Section 3's Work Orders testing for the up-to-date flow.)
- [ ] Concurrent supplier-lock blocking (two simultaneous editing sessions) — never tested, only the single-session "Flush Supplier" admin action was verified.
- [ ] A LANKAR legacy warranty return and a work-order-invoice warranty return, end to end — no eligible test data existed at any point in Phase 7.
- [ ] `InventoryList.jsx`'s Delete action — never tested through the actual role-gated UI (the test account wasn't `admin`-role, so the Delete menu item never rendered); the underlying `.delete()` call is low-risk but unverified through that path.

### Phase 9 (AP/Suppliers/LOC) — untested or deliberately unresolved

- [ ] `SupplierTx.jsx`'s full write path (add invoice line → Save All Changes → payment → cancel) — explicitly blocked in Phase 9B by the `FiscalPeriod` gate; a curl-based bypass was offered but never run. Should be directly re-testable now that `FiscalPeriod` is native (sub-phase 10A) — but per the item above, this specific re-check was never actually performed.
- [ ] `SupplierPaymentModal.jsx` — same blocker, same still-open re-check.
- [ ] **Cross-account LOC reversal asymmetry** — `cancelLineOfCreditPayment`'s `other_line_of_credit` branch never restores the source LOC's balance/available credit on a cross-LOC reversal, only the target's. Confirmed, ported byte-for-byte per project convention, deliberately **not** fixed. This is a real, user-visible accounting gap worth a decision from the business on whether it's acceptable long-term.
- [ ] `IssuedChequesTable.jsx`'s search/filter and note-editing round-trip — explicitly "not separately exercised" in either the 9B or 9D verification passes.

### Phase 10 — narrower testing gaps

- [ ] **10C's GST sign-aware debit/credit branching** was proven correct only via curl against a synthetic period; the actual live UI click-through only ever exercised a $0.00 placeholder case since dev's real GL data was empty at the time. Worth re-running live once real non-zero GST figures exist.
- [ ] **10B's `findGLImbalances` email trigger** — the phase's own checklist marks this as checked/verified, but the prose right next to it says "not yet checked live." Never reconciled — confirm directly whether the email actually fires.
- [ ] **`CashFlowSummary` bigint bug fix pattern** — the fix (widening 12 money fields from `bigint` to `double precision`) closed a real silent-failure bug in Phase 10D, but the phase doc explicitly flags that other debounced-save patterns in the same file (`saveRowToDb`, `persistRowOrder`) and possibly elsewhere in the codebase were never audited for the same blind spot.
- [ ] **Dev `GLTransaction`/`BankTransaction` data wipe** — discovered mid-Phase-10 (a schema-only reseed wiped transactional data on dev while reference tables survived). This reshaped later sub-phase verification toward production SQL cross-checks instead of dev-real-data curl tests. Worth confirming current dev data integrity before relying on dev-branch data for further live testing.

### Phase 11 (Payroll) — never click-tested

- [ ] **File-upload parse path** (`autopro-parsePayrollFile`) — never exercised through the browser; browser automation had no file-input capability in that session, so this was verified via direct curl only (both a success-shaped and a failure-shaped payload).
- [ ] **Reversal path** (`Payroll.jsx`'s `handleDelete`, gated behind `window.confirm()`) — code-reviewed only; the `window.confirm()` override workaround established elsewhere in the project wasn't applied during this specific test session, so it was never click-driven live.
- [ ] Production frontend push and production Edge Function deploy for Payroll — the phase doc notes these are "the user's own action," not confirmed done as of that doc's writing.

### Phase 12 (Appointment) — the whole domain, essentially untested live

- [ ] Every flow in this phase needs its first live click-through — see Section 3 for the full, itemized list (Schedule create/drag/delete, `SchedulerViaWoModal`, `EditApptViaWoModal`, `AppointmentsListModal`, reminder-function live re-point, and more). This checklist entry is a pointer, not a substitute — do not check it off without running Section 3's Appointment workflows individually.
- [ ] The `employee_id` bigint-rejects-empty-string fix specifically — it was made after the last live test submit in its session and has never itself been re-confirmed live.

### Phase 13 (Work Orders) — narrower open items

- [ ] `GetPartModal.jsx`'s search box did not respond to Enter/typing during the final regression session — not investigated further (flagged as outside that sub-phase's own file scope). Unclear whether this is a real UI bug or a testing-tool artifact (Radix/synthetic-event quirks were a recurring false-positive source elsewhere in this phase) — needs a direct human check.
- [ ] The WorkPRO tab within a Work Order was "not deep-tested" during the full-lifecycle regression — no WorkPRO project test fixture was available at the time.
- [ ] **Production replay backlog** — nearly all of Phase 13's actual database objects are dev-branch-only: the `set_workorder_lock`/`search_work_orders`/`search_work_order_parts` RPCs, the `Approvals`/`CustomerPortalWorkOrder`/`SentEmailLog` tables, the `SystemSettings`/`WorkOrderStatus`/`TagAlong`/`OtherChargeList` tables and their RLS, and every Edge Function from 13B through 13E. The only Phase 13 database change confirmed reaching production is the `search_inventory_ranked` overload-cleanup migration. Confirm the production replay has happened (or schedule it) before treating Phase 13 as production-ready, not just dev-tested.

### Phase 4 — still-open items

- [ ] **`Employee.pay_rate` bigint→numeric(10,2) migration** — applied to the dev branch only; production was explicitly withheld pending the user's go-ahead ("Not yet — I'll say when"). Confirm current status before relying on decimal pay rates in production, since several later phases (Payroll, Reports) build on this column.
- [ ] **`TechClockStatusModal.jsx`** (Followup 3C) — the code change was made but was never live-click-tested in its own session because the deployed bundle hadn't rebuilt yet. Confirm a deploy has happened and re-test.

### Phase 1–3, 5, 6, 8 — lower-priority spot-checks

- [ ] Phase 1's Edge Function deployment (Step 3, all 19 functions to dev), secret-setting (Step 4, 12 custom secrets), and reference-table seeding (Step 5) were left unconfirmed/unchecked in that phase's own doc. Almost certainly superseded by individual later phases' own deploys, but never explicitly closed out as a standalone Phase 1 item.
- [ ] Phase 2's 5 manual-check items (context-menu behavior in-app, console-error check, Setup page rendering, Electron desktop build smoke test, `autopro-processPartsInvoiceOCR` regression) were explicitly left to the user and never confirmed programmatically. Low risk given this was a deletion-only phase, but never formally closed.
- [ ] Phase 3's manual-check items (dark mode toggle persistence, payroll nav gating, Admin/executive-Accounting/AP-only-Accounting menu gating, avatar initials rendering, WorkPRO clock-in/out, graceful handling for a session with no matching `Employee` row) all explicitly required a live login session the agent couldn't perform.
- [ ] Phase 5: 10 files (`DocumentEditor.jsx`, `NewVehicleModal.jsx`, `AppointmentForm.jsx`, `ARPaymentDetailsModal.jsx`, `CustomerARTransactions.jsx`, `InvoicePaymentModal.jsx`, `CustomerForm.jsx`, `AddLegacyInvoiceModal.jsx`, `ChangeCustomerModal.jsx`, `WorkOrderProfitability.jsx`) plus `CashDrawer.jsx`'s full deposit/adjustment UI flow were verified only via code review and a clean build, never an individual UI click-through. The phase's own doc recommends a spot-check pass.
- [ ] Phase 5: `autopro-mergeVehicles`' embedded `base44.entities.Appointment` reassignment call always hits its catch branch (a known no-op) pending Appointment's own migration off Base44. Now that Phase 12 is code-complete, check whether this should be rewired to the native `Appointment` table.
- [ ] Phase 6: a true baseline output diff (base44 JSON vs. native JSON, same inputs) was never actually performed for any of the 6 migrated reports — substituted with logic-port review and row-count sanity checks. The doc recommends the first live click-through double as this missing baseline check; confirm this genuinely happened rather than being assumed.
- [ ] Phase 8: `reverseDeposit` hard-deletes `BankTransaction` rather than using the schema's unused `is_reversed`/`reversed_by_id` columns — preserved as legacy behavior deliberately, not redesigned. Worth a policy decision on whether soft-reversal is wanted.
- [ ] Phase 8: `AutoReconcileModal`'s CSV-upload step (still base44-routed via `UploadFile`) was opened cleanly in testing but its actual upload flow was never exercised.

---

## 3. Testing Actions

Real user workflows for a human tester to run, grouped by module and ordered so state builds naturally: core entities first, then Inventory, then Work Orders, then the financial chain, then Reports and WorkPRO last (since reports and cross-cutting flows need real data from everything upstream). This section absorbs the entire testing scope of the retired blueprint "Phase 10A," including all of Phase 12's deferred Appointment items.

### Customer & Vehicle

- [ ] **Create and edit a customer**
  tl;dr: Exercises the core native `Customer` CRUD path used by nearly every other module.
  UI entry point: `Customers.jsx` → "New Customer" / click a row to edit
  Files under test: `src/pages/Customers.jsx`, `src/components/customers/CustomerForm.jsx`, `NewCustomerModal.jsx`

- [ ] **Merge two duplicate customers**
  tl;dr: Confirms cascade field-fill, notes-append, and duplicate deactivation all work correctly end to end.
  UI entry point: Customer list → duplicate-merge action → `MergeCustomerModal.jsx`
  Files under test: `src/components/customers/MergeCustomerModal.jsx`, `autopro-mergeCustomers`

- [ ] **Create and edit a vehicle; decode a VIN**
  tl;dr: Confirms vehicle CRUD and the Gemini/NHTSA-backed VIN decode populate year/make/model/trim/engine correctly.
  UI entry point: `Vehicles.jsx` → "New Vehicle" → enter a real VIN
  Files under test: `src/pages/Vehicles.jsx`, `src/components/vehicles/VehicleForm.jsx`, `NewVehicleModal.jsx`, `autopro-decodeVin`

- [ ] **Merge two duplicate vehicles**
  tl;dr: Confirms "keep highest mileage," master field-fill, and duplicate deactivation.
  UI entry point: Vehicle list → duplicate-merge action → `MergeVehicleModal.jsx`
  Files under test: `src/components/vehicles/MergeVehicleModal.jsx`, `autopro-mergeVehicles`

- [ ] **Customer AR summary and transaction history**
  tl;dr: Confirms AR aging balances and the drill-down transaction list render correctly for a customer with real invoice/payment history.
  UI entry point: Customer detail → AR tab
  Files under test: `src/components/customers/CustomerARSummary.jsx`, `autopro-supabaseCustomerARSummary`, `CustomerARTransactions.jsx`, `ARPaymentDetailsModal.jsx`

### Appointment (Phase 12 — first live pass; every item below has never been click-tested)

- [ ] **`/Schedule` full create → drag → delete round trip**
  tl;dr: The single highest-priority untested flow in the whole blueprint — create a real appointment, drag it to a new time, then delete it, confirming each step persists.
  UI entry point: `/Schedule`
  Files under test: `src/pages/Schedule.jsx`, `src/components/appointments/AppointmentForm.jsx` — also re-check the `Promise.all`/`getworkorderlist()` issue flagged in Section 2 before assuming the New Appointment form's customer/vehicle dropdowns populate correctly.

- [ ] **`SchedulerViaWoModal` full validation with a real linked Work Order**
  tl;dr: Confirms scheduling an appointment directly from a Work Order's context works against the corrected schema.
  UI entry point: An open Work Order → "Schedule Appointment"
  Files under test: `src/components/work-orders/SchedulerViaWoModal.jsx`

- [ ] **`EditApptViaWoModal` full validation with a real linked Work Order**
  tl;dr: Confirms editing an existing appointment from within a Work Order's context.
  UI entry point: An open Work Order with a linked appointment → edit appointment
  Files under test: `src/components/work-orders/EditApptViaWoModal.jsx`

- [ ] **`AppointmentsListModal` WO-context validation**
  tl;dr: Confirms the appointments-list surface reachable from a Work Order renders and links correctly.
  UI entry point: Work Order → appointments list action
  Files under test: `src/components/work-orders/AppointmentsListModal.jsx`

- [ ] **Book an appointment, then "Create Work Order" from it**
  tl;dr: Confirms the appointment's notes correctly pre-fill the new Work Order's description field.
  UI entry point: `/Schedule` → an appointment → "Create Work Order"
  Files under test: `src/components/appointments/AppointmentForm.jsx` (`handleCreateWorkOrder`)

- [ ] **WO card and "upcoming appointment" badges**
  tl;dr: Confirms appointment badges on Work Order cards, and the "upcoming appointment" card inside the Work Order document view, populate correctly for a real linked appointment.
  UI entry point: `WorkOrders.jsx` WIP list; `DocumentEditor.jsx`/`WorkOrderView.jsx` for a WO with a linked appointment
  Files under test: `src/pages/WorkOrders.jsx`, `src/components/hooks/useWorkOrder.jsx`

- [ ] **Overlapping appointments on one calendar cell**
  tl;dr: Visually confirms the notes-preview line renders correctly with 2+ overlapping appointments.
  UI entry point: `/Schedule` — seed 2+ appointments in the same slot
  Files under test: `src/components/appointments/CellAppointmentsModal.jsx`

- [ ] **Reminder-function live re-point confirmation (email + SMS)**
  tl;dr: Confirms the two Base44-hosted-but-Supabase-patched reminder functions actually reach Postgres and find a real appointment, now that the required Base44 secrets have been added.
  UI entry point: N/A (backend cron/trigger — verify via a real seeded appointment due for a reminder, and check logs/inbox/phone)
  Files under test: `base44/functions/sendAppointmentReminders/entry.ts`, `base44/functions/sendTextReminders/entry.ts`

- [ ] **Regression: "Create Estimate" / "Create Work Order" buttons still work from `AppointmentForm.jsx`**
  tl;dr: These buttons ride an untouched Base44 code path — confirm Phase 12's changes didn't regress them.
  UI entry point: `/Schedule` → new/existing appointment → "Create Estimate" and "Create Work Order"
  Files under test: `src/components/appointments/AppointmentForm.jsx`

### Inventory

- [ ] **Receive inventory (full batch)**
  tl;dr: Exercises the receiving pipeline end to end, including GL posting for AP.
  UI entry point: `InventoryAdd.jsx` → "Receive Inventory"
  Files under test: `src/pages/InventoryAdd.jsx`, `autopro-processInventoryReceipt`

- [ ] **Add a new inventory item with AI category suggestion**
  tl;dr: Confirms the Gemini-backed category suggestion correctly fills in and the item saves.
  UI entry point: `InventoryAdd.jsx` / `InventoryAddModal.jsx` → new part entry
  Files under test: `src/components/inventory/InventoryAddModal.jsx`, `src/pages/InventoryAdd.jsx`, `autopro-suggestInventoryCategory`

- [ ] **Adjust quantity on hand**
  tl;dr: Confirms the GL cent-rounding fix holds under a real UI-driven adjustment, not just a direct API call.
  UI entry point: `InventoryList.jsx` → an item → Adjust QOH
  Files under test: `src/components/inventory/InventoryAdjustQOHModal.jsx`, `autopro-processQOHAdjustment`

- [ ] **Change / add / edit an inventory location** *(flagged untested in Phase 7 — priority)*
  tl;dr: First-ever live test of this flow; no prior sub-phase had eligible test data.
  UI entry point: An inventory item with a location → "Change Location"
  Files under test: `src/components/inventory/LocationModal.jsx`, `InventoryLocation` table

- [ ] **Process a parts return and edit return info** *(flagged untested in Phase 7 — priority)*
  tl;dr: First-ever live test; confirms `ReturnReason` selection and the return record itself save correctly.
  UI entry point: An inventory item → "Return" / an existing return → "Edit Return Info"
  Files under test: `src/components/inventory/InventoryPartsReturnModal.jsx`, `EditReturnInfoModal.jsx`, `ReturnReason` table

- [ ] **Manage Inventory Categories, Locations, and Return Reasons (admin)**
  tl;dr: Confirms CRUD on the three new Phase 7 reference tables.
  UI entry point: Setup/admin inventory-reference management screens
  Files under test: `InventoryCategory`, `InventoryLocation`, `ReturnReason` tables

- [ ] **Inventory list search, filters, and add/delete**
  tl;dr: Confirms the fully-migrated `InventoryList.jsx` — search RPC, filter buttons, add, and (as an admin user) delete.
  UI entry point: `InventoryList.jsx`
  Files under test: `src/pages/InventoryList.jsx`, `search_inventory_ranked` RPC, `get_populated_inventory` RPC

- [ ] **Merge two duplicate inventory items**
  tl;dr: Confirms historical `InventoryAuditLog`/`SupplierInvoiceLine` references cascade correctly to the surviving item.
  UI entry point: Inventory list → duplicate-merge action
  Files under test: `src/components/inventory/MergeInventoryModal.jsx`, `autopro-mergeInventoryItems`

- [ ] **LANKAR legacy warranty return, end to end** *(flagged untested in Phase 7 — priority)*
  tl;dr: First-ever live test with eligible data; confirms InventoryItem/InventoryReturn/GL rows all post correctly.
  UI entry point: `LegacyWarrantyReturnModal.jsx` (LANKAR import flow)
  Files under test: `src/components/inventory/LegacyWarrantyReturnModal.jsx`, `LankarImportReturnModal.jsx`

- [ ] **Work-order-invoice warranty return**
  tl;dr: Confirms the WO-linked warranty return path, including the Phase 13E GL-transaction-id fix, works end to end on a real invoiced WO.
  UI entry point: An invoiced Work Order → warranty return action
  Files under test: `src/components/work-orders/WarrantyReturnModal.jsx`

- [ ] **Concurrent supplier-lock blocking** *(flagged untested in Phase 7 — needs two sessions)*
  tl;dr: Open the same supplier for editing in two browser sessions simultaneously and confirm the second is correctly blocked/warned.
  UI entry point: `Suppliers.jsx` → `SupplierTx.jsx`, opened twice
  Files under test: `autopro-acquireSupplierLock`, `src/pages/SupplierTx.jsx`

### Work Orders

- [ ] **Create a new Work Order / Estimate**
  tl;dr: Exercises the native insert path and confirms `WorkOrder.id` generation and lock acquisition both work.
  UI entry point: `WorkOrders.jsx` → "New Work Order"
  Files under test: `src/components/work-orders/NewWorkOrderModal.jsx`, `set_workorder_lock` RPC

- [ ] **Add line items and parts to a Work Order**
  tl;dr: Confirms part search, add-existing-part, and add-new-part-with-batch-quantity all work — this exact path had a real inventory-corruption bug fixed in Phase 13E.
  UI entry point: `DocumentEditor.jsx` → Parts tab → "Get Part" / "Add Inventory"
  Files under test: `src/components/work-orders/form/LineItemsTable.jsx`, `GetPartModal.jsx`, `WOAddInventoryModal.jsx`, `FindPartModal.jsx`, `search_work_order_parts` RPC

- [ ] **Convert an Estimate to a Work Order, then to an Invoice**
  tl;dr: Full lifecycle conversion, including the native `convertEstimateToWorkOrder` function and the invoice-conversion GL posting.
  UI entry point: `DocumentEditor.jsx` (Estimate) → "Convert to WO"; then `InvoiceConversion.jsx`
  Files under test: `autopro-convertEstimateToWorkOrder`, `src/pages/InvoiceConversion.jsx`, `autopro-archiveWorkOrderProjects`

- [ ] **Record a payment against a Work Order**
  tl;dr: Confirms the jsonb-guard fix on `WorkOrder.payments` holds for a WO that already has prior payment history.
  UI entry point: `DocumentEditor.jsx` → "Record Payment" / `AdvancePaymentModal.jsx`
  Files under test: `src/components/work-orders/AdvancePaymentModal.jsx`, `src/components/work-orders/form/FinancialSummary.jsx`, `WorkOrderViewFinancialSummary.jsx`

- [ ] **Work Order locking under contention**
  tl;dr: Open the same Work Order in two sessions to confirm acquire/contested-apply/stale-steal/release all behave as designed.
  UI entry point: `DocumentEditor.jsx`, opened twice for the same WO
  Files under test: `set_workorder_lock` RPC

- [ ] **Create a Counter Sale**
  tl;dr: Directly re-verifies the Phase 13E bug fix (non-existent `cp_id`/`customer_complaint`/`estimated_hours`/`scheduled_date`/`technician` columns) now that it's been redeployed.
  UI entry point: `WorkOrders.jsx` → "Counter Sale"
  Files under test: `src/pages/WorkOrders.jsx` (`handleCreateCounterSale`)

- [ ] **Core return on a Work Order**
  tl;dr: Confirms the FIFO core-return logic and inventory/GL updates.
  UI entry point: `DocumentEditor.jsx` → core return action
  Files under test: `src/components/work-orders/ROCoreModal.jsx`, `autopro-returnCoreToWO`

- [ ] **Generate a Work Order PDF, then send it by email and by SMS**
  tl;dr: Confirms all three document/comms outputs work with real recipients.
  UI entry point: `DocumentEditor.jsx` → Print/Email/Text actions
  Files under test: `src/components/work-orders/WorkOrderPdfModal.jsx`, `autopro-generateWorkOrderPdf`, `SESEmailModal.jsx`, `autopro-sendEmailViaSMTP`, `autopro-sendSms`

- [ ] **Batch-send multiple Work Orders**
  tl;dr: Confirms the batch email path also respects the jsonb-guard fix.
  UI entry point: WO list → multi-select → "Batch Send"
  Files under test: `src/components/ar/BatchSendWorkOrdersModal.jsx`

- [ ] **Customer portal snapshot creation and approval**
  tl;dr: Confirms a portal snapshot is created and the approvals path (non-empty state) works — this specific path was never live-tested in Phase 13D.
  UI entry point: `DocumentEditor.jsx` → "Send for Approval" / `ROApprovalsModal.jsx`
  Files under test: `autopro-createPortalSnapshot`, `CustomerPortalWorkOrder` table, `Approvals` table, `ROApprovalsModal.jsx`

- [ ] **Notes board on the WIP tab**
  tl;dr: Confirms the fallback round-robin placement algorithm and search filter (never visually confirmed in 13D, closed out in 13E — worth a fresh check).
  UI entry point: `WorkOrders.jsx` → WIP tab
  Files under test: `autopro-getNotesBoardData`, `SentEmailLog` table

- [ ] **Flush Work Order locks (admin)**
  tl;dr: Confirms the bulk lock-release admin action; note this button currently has no role-gating (a pre-existing gap, not a regression).
  UI entry point: `WorkOrders.jsx` → "Flush Locks"
  Files under test: `src/pages/WorkOrders.jsx` (`flushWorkOrderLocks`)

### Banking & Cash Drawer

- [ ] **Bank transaction entry and lock acquisition**
  tl;dr: Basic CRUD plus the locking pattern shared with other modules.
  UI entry point: `Bank.jsx` → New Transaction
  Files under test: `src/pages/Bank.jsx`, `src/components/bank/BankTransactionModal.jsx`, `autopro-getBankTransactions`, `autopro-calculateBankBalances`

- [ ] **Bank reconciliation, save, and report**
  tl;dr: Full Reconcile → Save → ReconcileReport round trip, including the checkbox double-click fix.
  UI entry point: `Reconcile.jsx`
  Files under test: `src/pages/Reconcile.jsx`, `ReconcileReport.jsx`, `autopro-processBankReconciliation`, `autopro-batchReconcileTransactions`, `autopro-getReconciliationHistory`

- [ ] **Bank transfer between accounts**
  tl;dr: Confirms the fully-native `transferFunds` rewrite, including its new fiscal-period guard.
  UI entry point: `Bank.jsx` → "Transfer Funds"
  Files under test: `src/components/bank/BankTransferModal.jsx`, `autopro-transferFunds`

- [ ] **Cash drawer deposit → GL → deposit slip breakdown**
  tl;dr: Full deposit pipeline from cash-drawer entry through GL posting to the slip breakdown.
  UI entry point: `CashDrawer.jsx` → "Make Deposit"
  Files under test: `src/pages/CashDrawer.jsx`, `src/components/cash-drawer/DepositModal.jsx`, `DepositSlipBreakdownModal.jsx`

- [ ] **Generate a deposit slip PDF**
  tl;dr: Confirms the ported jsPDF-based generation produces a correct PDF.
  UI entry point: Deposit detail → "Generate Deposit Slip"
  Files under test: `autopro-generateDepositSlipPDF`

- [ ] **Reverse a deposit**
  tl;dr: Confirms the highest-risk Phase 8 function's full 7-step reversal chain and real-user GL audit attribution.
  UI entry point: `DepositHistoryModal.jsx` → a deposit → "Reverse"
  Files under test: `autopro-reverseDeposit`, `src/components/cash-drawer/DepositDetailsModal.jsx`

- [ ] **Deposit history list and drill-down** *(directly verifies the Section 2 FiscalPeriod fix)*
  tl;dr: Confirms the list actually loads now that the `FiscalPeriod`/`Promise.all` fix has landed — this exact flow was flagged as never re-verified live.
  UI entry point: `CashDrawer.jsx` → "Deposit History"
  Files under test: `src/components/cash-drawer/DepositHistoryModal.jsx`

### Suppliers / Accounts Payable

- [ ] **Supplier invoice entry — full write path** *(directly verifies the Section 2 FiscalPeriod-gate item)*
  tl;dr: Add an invoice line, select a GL account, and Save All Changes — this exact path was blocked by the FiscalPeriod gate in Phase 9B and never re-confirmed after the cutover.
  UI entry point: `Suppliers.jsx` → a supplier → `SupplierTx.jsx`
  Files under test: `src/pages/SupplierTx.jsx`, `autopro-saveSupplierInvoiceTransactions`, `autopro-getSupplierTransactions`

- [ ] **Supplier payment — full cycle, then cancel**
  tl;dr: Confirms the pending-payment insert, the atomic GL/bank posting via `process_payment_atomic`, and a full cancellation.
  UI entry point: `SupplierTx.jsx` → "Make Payment"
  Files under test: `src/components/suppliers/SupplierPaymentModal.jsx`, `autopro-processSupplierPayment`, `autopro-executeSupplierPayment`, `process_payment_atomic` RPC, `autopro-cancelSupplierPayment`

- [ ] **Write a cheque, then search/filter the cheque register**
  tl;dr: Confirms the cheque-stub jsonb fix (applied-invoices list) and exercises the never-separately-tested search/filter/note-editing round trip.
  UI entry point: `ChequeWriter.jsx`; then `IssuedChequesTable.jsx`
  Files under test: `src/pages/ChequeWriter.jsx`, `autopro-generateChequePDF`, `src/components/cheques/IssuedChequesTable.jsx`

- [ ] **Receive a credit from a supplier**
  tl;dr: Exercises all 3 refund destinations (LOC, AP, cash drawer).
  UI entry point: Inventory return flow → "Receive Credit"
  Files under test: `src/components/inventory/ReceiveCreditModal.jsx`

- [ ] **AP Summary and supplier locking**
  tl;dr: Confirms the AP aging summary renders correctly and single-session supplier locking still works.
  UI entry point: `Suppliers.jsx`
  Files under test: `src/pages/Suppliers.jsx`, `autopro-getAPSummary`, `src/components/suppliers/APSummaryTable.jsx`, `autopro-acquireSupplierLock`

### Lines of Credit

- [ ] **Create and edit a Line of Credit account**
  tl;dr: Basic CRUD on the new `LinesOfCredit` table.
  UI entry point: `LinesOfCredit.jsx` → "New LOC"
  Files under test: `src/pages/LinesOfCredit.jsx`, `src/components/lines-of-credit/LinesOfCreditEditModal.jsx`

- [ ] **Manual LOC charge and credit**
  tl;dr: Confirms manual transaction entry against a LOC balance.
  UI entry point: LOC detail → "Add Transaction"
  Files under test: `src/components/lines-of-credit/LineOfCreditTransactionModal.jsx`, `autopro-processLineOfCreditTransaction`

- [ ] **LOC payment, then cancel it — including a cross-account reversal** *(directly verifies the Section 2 asymmetry item)*
  tl;dr: Make a bank-sourced LOC payment, then cancel it while paying attention to whether a cross-LOC reversal correctly restores the source account's balance — it's documented as NOT doing so by design; confirm this is still the actual behavior and acceptable.
  UI entry point: LOC detail → "Make Payment", then "Cancel Payment"
  Files under test: `src/components/lines-of-credit/LineOfCreditPaymentModal.jsx`, `autopro-calculateLineOfCreditPaymentBreakdown`, `autopro-processLineOfCreditPayment`, `autopro-cancelLineOfCreditPayment`

- [ ] **LOC statement reconciliation**
  tl;dr: Confirms CSV-based reconciliation matching.
  UI entry point: LOC detail → "Reconcile"
  Files under test: `src/components/lines-of-credit/LOCReconciliationModal.jsx`

### Chart of Accounts & GL Reporting

- [ ] **Chart of Accounts CRUD**
  tl;dr: Full create/edit/delete round trip on the GL account list.
  UI entry point: `ChartOfAccounts.jsx`
  Files under test: `src/pages/ChartOfAccounts.jsx`

- [ ] **General Ledger, GL Journal, and GL Account Transactions views**
  tl;dr: Confirms the ported reverse-chronological balance-walk logic renders correctly.
  UI entry point: `GeneralLedger.jsx`, `GLJournal.jsx`, `GLAcct.jsx`
  Files under test: `autopro-getGeneralLedgerData`, `autopro-getGLJournalData`/`get_gl_journal_data`, `autopro-getGLAccountTransactions`/`get_gl_account_transactions`

- [ ] **Balance Sheet, P&L, and Financial Dashboard**
  tl;dr: Confirms the three headline financial-report pages render correctly against real data.
  UI entry point: `BalanceSheet.jsx`, `PLReport.jsx`, `FinancialDashboard.jsx`
  Files under test: `autopro-getBalanceSheetData`, `autopro-getPLReportData`, `autopro-getFinancialDashboardData`/`get_financial_dashboard_gl_monthly`

- [ ] **Post journal entries**
  tl;dr: Confirms manual journal-entry posting.
  UI entry point: `JournalEntries.jsx`
  Files under test: `autopro-postJournalEntries`

- [ ] **Find GL Imbalances (and its email trigger)** *(directly verifies the Section 2 checklist contradiction)*
  tl;dr: Run the imbalance check and confirm whether the email notification actually fires — the phase doc left this ambiguous.
  UI entry point: Accounting → "Find GL Imbalances"
  Files under test: `autopro-findGLImbalances`

### GST / Taxes

- [ ] **Calculate, post, and pay a GST return with real non-zero data** *(directly verifies the Section 2 $0.00-only gap)*
  tl;dr: The sign-aware debit/credit branching in this function has never been proven live with real figures — only via curl on a synthetic period.
  UI entry point: `Taxes.jsx`
  Files under test: `autopro-calculateGSTReturn`, `autopro-postGSTJournalEntries`, `autopro-processGSTPayment`, `src/components/taxes/MarkPaidModal.jsx`

### Fiscal Periods

- [ ] **Create, edit, and close a fiscal period** *(directly verifies the Section 2 gap — never live-tested)*
  tl;dr: Only the period list-load was ever confirmed live; the actual CRUD/close-period round trip has not been.
  UI entry point: `FiscalPeriods.jsx`
  Files under test: `src/pages/FiscalPeriods.jsx`, `src/components/utils/fiscalPeriodUtils.jsx`

### Levies

- [ ] **Trigger a Levies sync via a Work Order save** *(directly verifies the Section 2 wiring gap)*
  tl;dr: Confirms whether saving a Work Order actually invokes `autopro-syncLevies` correctly now, or whether the 13C↔10E wiring gap flagged in Section 2 is still open.
  UI entry point: `DocumentEditor.jsx` → Save
  Files under test: `src/components/work-orders/hooks/useDocumentEditorSave.jsx`, `autopro-syncLevies`

- [ ] **Run the Reportable Levies Report and Post to AP**
  tl;dr: Re-confirms the one flow in this domain that was already live-verified, as a regression check.
  UI entry point: Reports → Levies Report
  Files under test: `src/components/reports/ReportableLeviesReport.jsx`, `autopro-getReportableLeviesReport`, `autopro-postLeviesToAP`

### Payroll

- [ ] **Add a paycheque**
  tl;dr: Basic create path.
  UI entry point: `Payroll.jsx` → "Add Paycheque"
  Files under test: `src/components/payroll/AddPaychequeModal.jsx`

- [ ] **Add a remittance**
  tl;dr: Basic create path.
  UI entry point: `Payroll.jsx` → "Add Remittance"
  Files under test: `src/components/payroll/AddRemittanceModal.jsx`

- [ ] **Add a payroll adjustment**
  tl;dr: Basic create path.
  UI entry point: `Payroll.jsx` → "Add Adjustment"
  Files under test: `src/components/payroll/AddAdjustmentModal.jsx`

- [ ] **Mark a payroll transaction paid**
  tl;dr: Confirms the BankAccount call-site resolution (carried forward from Phase 8) and GL posting.
  UI entry point: `Payroll.jsx` → "Mark Paid"
  Files under test: `src/components/payroll/MarkPaidModal.jsx`, `autopro-calculateBankBalances`

- [ ] **Upload and parse a payroll file** *(flagged untested — never click-driven, curl-only)*
  tl;dr: First real browser-driven test of the file-input path.
  UI entry point: `Payroll.jsx` → file upload action
  Files under test: `autopro-parsePayrollFile`

- [ ] **Delete/reverse a payroll transaction** *(flagged untested — window.confirm-gated, never click-driven)*
  tl;dr: First real click-through of the reversal path, including its confirm dialog.
  UI entry point: `Payroll.jsx` → delete a transaction
  Files under test: `src/pages/Payroll.jsx` (`handleDelete`)

### Reports

- [ ] **Customer Report**
  UI entry point: Reports → Customer Report
  Files under test: `src/components/reports/CustomerReportModal.jsx`, `autopro-getCustomerReportData`

- [ ] **Other Charges Breakdown Report**
  tl;dr: Confirms the charge-detail drill-down dialog still opens correctly.
  UI entry point: Reports → Other Charges Breakdown
  Files under test: `src/components/reports/OtherChargesBreakdownReport.jsx`, `autopro-getOtherChargesBreakdown`

- [ ] **Sales Analysis Report**
  tl;dr: Confirms both charts (pie + daily bar) render, and that the earlier `role`/`access_level` access-gating bug fix holds (admin can open it, non-privileged user still blocked).
  UI entry point: Reports → Sales Analysis
  Files under test: `src/components/reports/SalesAnalysisReport.jsx`, `autopro-getSalesAnalysisReport`, `ReportModal.jsx`

- [ ] **Technician Performance Report, including the restored payroll-target progress bar**
  tl;dr: Confirms utilization/efficiency numbers and — specifically — the progress bar restored in Phase 10B against real (not manufactured) labour-sales data.
  UI entry point: Reports → Technician Performance
  Files under test: `src/components/reports/TechnicianPerformanceReportModal.jsx`, `autopro-getTechnicianPerformanceReport`

- [ ] **Work Order Summary Report**
  tl;dr: Confirms all 4 stat cards, both charts, the aging table, and the status-breakdown table.
  UI entry point: Reports → Work Order Summary
  Files under test: `src/components/reports/WorkOrderSummaryReport.jsx`, `autopro-getWorkOrderSummaryReport`

- [ ] **Inventory On Order Report**
  tl;dr: Confirms the grouped-by-supplier table and print view.
  UI entry point: Reports → Inventory On Order
  Files under test: `src/components/reports/InventoryOnOrder.jsx`, `autopro-getRealTimeInventoryOnOrder`

- [ ] **Parts Movement Report**
  tl;dr: Confirms client-side sort/filter/search and the totals footer against the direct RPC.
  UI entry point: Reports → Parts Movement
  Files under test: `src/components/reports/PartsMovementReportModal.jsx`, `get_parts_movement_v2` RPC

### WorkPRO (technician-facing sister app)

- [ ] **Clock in and clock out**
  tl;dr: Confirms `TimeRecord`/`UnassignedTime` creation with correct audit fields, including the Phase 4 `employee_name`→`user_name` bug fix.
  UI entry point: Global clock-in control; `TechClockStatusModal.jsx`
  Files under test: `src/components/work-orders/GlobalClockInModal.jsx`, `TechClockStatusModal.jsx`, `src/Layout.jsx` (`checkClockStatus`)

- [ ] **WO ↔ Project pairing and tech time display**
  tl;dr: Confirms the `Appointment → Work Order → Project` integration flow and that tech time logs display correctly against a Work Order.
  UI entry point: `DocumentEditor.jsx` → WorkPRO tab
  Files under test: `src/components/work-orders/WorkPRODescriptionModal.jsx`, `TechTimeModal.jsx`, `src/pages/WorkOrders.jsx` (Project/ProjectTimeSession lists)

- [ ] **Archive WO projects on invoice conversion**
  tl;dr: Confirms the native `archiveWorkOrderProjects` function correctly archives linked Projects when an estimate converts to an invoice.
  UI entry point: `InvoiceConversion.jsx`
  Files under test: `autopro-archiveWorkOrderProjects`

### Cross-module integration (the retired blueprint "Phase 10A" scope)

- [ ] **Full receive → AP → payment → GL → bank-reconciliation flow, end to end**
  tl;dr: The complete cross-module integration test that the retired "Phase 10A" blueprint entry was scoped to run — receive inventory against a supplier invoice, pay the supplier, confirm GL posts correctly, then reconcile the resulting bank transaction, all as one continuous real-data pass.
  UI entry point: `InventoryAdd.jsx` (receive) → `SupplierTx.jsx`/`SupplierPaymentModal.jsx` (pay) → `GeneralLedger.jsx` (confirm GL) → `Reconcile.jsx` (reconcile)
  Files under test: `autopro-processInventoryReceipt`, `autopro-saveSupplierInvoiceTransactions`, `autopro-processSupplierPayment`/`autopro-executeSupplierPayment`, `process_payment_atomic` RPC, `autopro-getGeneralLedgerData`, `autopro-processBankReconciliation`

---

## 4. Work Progress and Lessons Learned

This section is populated by the AI agent as issues are found and fixed during testing against this document, mirroring `master_blueprint.md` Section 7's running log format — date-stamped entries, most recent last. It starts empty; do not pre-fill entries.
