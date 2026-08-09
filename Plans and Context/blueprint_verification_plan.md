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

**Live Verification Session Protocol (added 2026-08-03, governs how Section 3 is actually executed):**
- **Authentication:** the user logs into `test.kensauto.ca` with their own `test@kensauto.ca` credentials directly — there is no shared/reset password handed to the testing agent. If a live session hits an authentication wall (session expired, login prompt, permission denial) mid-workflow, **stop and ask the user rather than retrying, guessing, or reprompting for credentials.**
- **Hard rule — no live customer communication except to Tyler Haney.** A second agent is currently copying full production data (customers, real emails, real phone numbers) onto the dev branch, explicitly so it's usable for testing. That data may be used freely for CRUD/testing purposes — **except** it must never trigger a real email or SMS to any customer other than Tyler Haney. Every workflow in Section 3 that can send a live customer-facing email or text is flagged inline below with **⚠️ COMMS RULE**. Before running one of those flows: either point it at a customer/contact record whose email/phone is Tyler's own, or stop and ask before the actual send action, verifying only the rest of the flow.
- **Data caveat — GLTransaction is excluded from the production data copy.** Once the copy finishes, every other table should reflect real production data, but `GLTransaction` (and anything depending on it, e.g. Balance Sheet/GL Journal/GL-imbalance figures) will still be on whatever thin/synthetic data existed on dev before — do not assume GL-dependent workflows have real figures just because everything else does.
- **Hold point:** live verification does not start until the user confirms the data copy is complete.

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

### Newly discovered bugs (found during live verification, not pre-existing knowledge)

- [x] **`SystemSettings.next_ro_number` counter fell behind real data after the production data copy, causing new Work Orders to collide with real existing RO numbers — FIXED 2026-08-08 (data-sync fix, not a code fix).** RO/WO numbering is generated from a stored counter (`generateWorkOrderNumbers()`, `AppointmentForm.jsx:614` — reads `SystemSettings.next_ro_number`), not computed as `max(ro_number)+1`. After the other agent's full production-data copy landed on dev, the real `WorkOrder` table's highest number was `RO51610`, but the counter was still `51568` (stale from before the copy). Creating a Work Order via `NewWorkOrderModal.jsx` produced `RO51567`/`WO51567` — colliding with a real, already-existing `Completed` WorkOrder with the same numbers. The collision didn't surface immediately (the initial insert via `autopro-createworkorderdata` succeeded), but every subsequent `Save` in `DocumentEditor.jsx` failed with a `500` from `autopro-saveworkorderdata`: `"Failed to read work order: JSON object requested, multiple (or no) rows returned"` — a `.single()`-style lookup by `ro_number` finding 2 rows instead of 1. **Fixed by updating `SystemSettings.next_ro_number` to `51611`** (real max + 1) and deleting the orphaned colliding test WorkOrder. **This is worth a design-robustness note, not just a one-time data fix:** a counter that can silently drift from real data (any bulk import/copy, or a bug elsewhere) has no self-correcting safety net the way a `max()+1` or a DB-level unique-violation-with-retry would — consider whether `next_ro_number`/`next_inv_number` should be validated/derived rather than purely trusted at read time. Confirm `SystemSettings.next_inv_number` (`41230` as of this writing) doesn't have the same drift before it's needed.

- [ ] **`search_customers_ranked` RPC: "First Last" full-name searches return zero results app-wide** — **CONFIRMED, 2026-08-08.** The function's `WHERE` filter only checks `org_name`/`first_name`/`last_name`/`email`/`phone` individually against the search term — it never checks the concatenated `first_name || ' ' || last_name`. The `ORDER BY match_rank` logic *does* have cases for a full-name match (rank 3 exact, rank 9 partial) — but those cases are unreachable dead code, since a row that only matches on the concatenated full name never passes the `WHERE` clause to begin with. Directly confirmed: `select count(*) from search_customers_ranked('Tyler Haney', false, 50, 0)` returns **0**, while `search_customers_ranked('Haney', ...)` correctly returns 4 rows including Tyler Haney. **Impact is app-wide**, not one modal — `grep` shows 6 callers: `src/pages/Customers.jsx` (the main customer search page), `src/components/work-orders/NewWorkOrderModal.jsx`, `ChangeCustomerModal.jsx`, `MergeCustomerModal.jsx`, `VehicleForm.jsx`, plus the tracked source `src/supabase/search_customers_ranked.sql`. Any staff member typing a customer's full first+last name gets zero results and has to know to fall back to last-name-only. **Fix:** add `lower(btrim(coalesce(first_name,'') || ' ' || coalesce(last_name,''))) like '%' || lower(p_search_term) || '%'` (and ideally the exact-match variant) to the `WHERE` clause, mirroring what the `ORDER BY` already assumes exists. Note: this is a pre-existing bug in a Phase 5–era RPC, unrelated to anything Phase 13 or later touched — the Appointment customer-search dialog (`AppointmentForm.jsx`) uses a *different* search mechanism and was directly confirmed working correctly with the exact same "Tyler Haney" full-name query earlier in this session, which is what surfaced the discrepancy.

### Cross-cutting / infrastructure

- [ ] **Expired `BASE44_ACCESS_TOKEN`** — a standing, project-wide infra issue first flagged at Phase 7 closeout, still causing 401s on every remaining still-base44 call app-wide (e.g. `TagAlong.list()`, the reminder functions' own Base44 hosting). No entry in any phase doc confirms the token was ever refreshed. It briefly appeared to be blocking `DocumentEditor.jsx` in Phase 13 but was later found to be a misdiagnosis (a leftover `useShopData()` call, not the token) — so the token issue itself remains unresolved and will keep surfacing as "broken" symptoms on any page not yet fully migrated off Base44 (chiefly the Appointment reminder functions and anything still touching `TagAlong`).
- [ ] **Plaintext JWT hardcoded in two production Postgres triggers** — `sync_customer_to_google` (on `Customer`) and `WorkOrder_Broadcast` (on `WorkOrder`) both call `supabase_functions.http_request()` with a live service-role/anon JWT visible in plaintext to anyone with schema read access. Flagged at Phase 1, never scoped into any phase, no decision recorded on rotation or removal timing. Related: the `Google-Contacts-Sync` Edge Function one of these triggers calls is live in production but has no source tracked in the local repo at all.
- [ ] **"`Promise.all` poisoned by a still-base44 call" pattern — full status by file:**
  - `Schedule.jsx`'s `loadData()` (bundles still-base44 `getworkorderlist()` with native `Appointment`/`Employee`/`Customer`/`Vehicle` calls) — flagged in Phase 12, **appears still unresolved**: Phase 13B built a native `search_work_orders` RPC and repointed `WorkOrders.jsx`'s own list to it, but no phase doc shows `Schedule.jsx` itself being touched to use the new RPC or otherwise decoupled. This directly blocks customer/vehicle dropdowns in the New Appointment form under a dev-native session and is squarely inside what Section 3's Appointment testing needs to exercise — check this first.
  - `InventoryAddModal.jsx` (mixed `TagAlong.list()` with native `InventoryCategory` fetch, Phase 7A) — **fixed** (decoupled into independent try/catch).
  - `InventoryAdd.jsx` (same pattern, Phase 7C) — **fixed** (decoupled).
  - `OtherChargesManager.jsx` (mixed native `ChartOfAccount` with still-base44 `OtherChargeList`, Phase 9A) — **fixed** (decoupled).
  - `WorkOrders.jsx`'s `loadData()` (mixed `getNotesBoardData` with native `search_work_orders` RPC calls, Phase 13) — **fixed** (given its own `.catch()`).
  - `DepositHistoryModal.jsx`'s `loadDeposits()` (mixed still-base44 `FiscalPeriod.list()` with native `autopro-getBankTransactions`, first flagged Phase 8C) — **code fixed** in Phase 10 sub-phase 10A (decoupled atomically). **Live-reverified 2026-08-08**: opened cleanly, loaded 549 real deposit records. Resolved.
- [ ] **Re-verify the 3 flows Phase 10 sub-phase 10A itself flagged as never circled back to**: `SupplierTx.jsx`'s `handleGlAccountChange` (the write-path blocker from Phase 9B), `SupplierPaymentModal.jsx`, and `DepositHistoryModal.jsx`'s deposit list (see above). All three were expected to unblock once `FiscalPeriod` went native, but none were re-tested live after that cutover landed.
- [ ] **`FiscalPeriods.jsx` create/edit/close-period round-trip** — only the list-load itself was live-verified in sub-phase 10A; the actual CRUD round-trip was never click-tested.

### Cross-phase resolution status (things one phase deferred that a later phase claims to have closed)

- [x] **Phase 6's payroll-target progress bar** (`TechnicianPerformanceReportModal.jsx`) — deferred in Phase 6 (hardcoded to 0, card hidden) pending `CashFlowSummary` migration. Phase 10B claims to have restored it and reports live-verifying it — but only **with manufactured test data on dev**, since dev's real GL data was largely empty at that point. Worth a spot check against real production labour-sales figures once available.
- [ ] **Phase 13C's deferred `autopro-syncLevies` vs. Phase 10E's native `syncLevies`** — these are two distinct items, not the same gap. Phase 13C deferred porting `autopro-syncLevies` because the `Levies` table didn't exist. Phase 10E later built the `Levies` schema and the native `syncLevies`/`getReportableLeviesReport`/`postLeviesToAP` functions, live-verifying the Report/Post-to-AP flow. **However**, Phase 13's own WO-save trigger call site in `useDocumentEditorSave.jsx` is explicitly confirmed, in Phase 13's own text, to still be 401ing / still deferred as of the end of that phase ("unchanged by this session"). Nothing in either phase doc confirms this call site was ever reconnected to Phase 10E's new function. **This is a real, still-open wiring gap** — verify whether saving a Work Order today correctly triggers `autopro-syncLevies`, or whether that call site is still pointed at the old (or nowhere).
- [x] **~~Possible documentation conflict — Supplier lock-recovery fix~~ — RESOLVED 2026-08-03.** `master_blueprint.md`'s Lessons Learned log (Section 7) describes a specific resolved incident attributed to Phase 9 — a supplier (`DENHAM CHRYSLER JEEP LTD.`) found stuck locked on production since March, fixed by building a new `autopro-releaseSupplierLock` function. `phase_9_implementation_plan.md` itself has no record of this (its §0.1 decision even says the opposite: "pure migration, no flush addition"), but the fix is real — confirmed directly: `supabase/functions/autopro-releaseSupplierLock/index.ts` exists in the repo, and the function is deployed `ACTIVE` on **both** the dev branch and production. `phase_9_implementation_plan.md` is simply incomplete/never updated to capture this later addition; no further action needed.

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

- [x] **10C's GST sign-aware debit/credit branching** was proven correct only via curl against a synthetic period — **RESOLVED 2026-08-08**: live-generated a real Q3 2026 report against real data (GST Collected $5,093.46, Paid $1,947.73, Net Due $3,145.73 — arithmetic exact). Calculation confirmed correct with real non-zero figures; posting/paying a real period deliberately not exercised (see Section 3).
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

- [x] **Create and edit a customer**
  tl;dr: Exercises the core native `Customer` CRUD path used by nearly every other module.
  UI entry point: `Customers.jsx` → "New Customer" / click a row to edit
  Files under test: `src/pages/Customers.jsx`, `src/components/customers/CustomerForm.jsx`, `NewCustomerModal.jsx`

- [x] **Merge two duplicate customers**
  tl;dr: Confirms cascade field-fill, notes-append, and duplicate deactivation all work correctly end to end.
  UI entry point: Customer list → duplicate-merge action → `MergeCustomerModal.jsx`
  Files under test: `src/components/customers/MergeCustomerModal.jsx`, `autopro-mergeCustomers`

  **Needs dark mode compatibility**
  
- [x] **Create and edit a vehicle; decode a VIN**
  tl;dr: Confirms vehicle CRUD and the Gemini/NHTSA-backed VIN decode populate year/make/model/trim/engine correctly.
  UI entry point: `Vehicles.jsx` → "New Vehicle" → enter a real VIN
  Files under test: `src/pages/Vehicles.jsx`, `src/components/vehicles/VehicleForm.jsx`, `NewVehicleModal.jsx`, `autopro-decodeVin`

- [x] **Merge two duplicate vehicles**
  tl;dr: Confirms "keep highest mileage," master field-fill, and duplicate deactivation.
  UI entry point: Vehicle list → duplicate-merge action → `MergeVehicleModal.jsx`
  Files under test: `src/components/vehicles/MergeVehicleModal.jsx`, `autopro-mergeVehicles`

- [x] **Customer AR summary and transaction history**
  tl;dr: Confirms AR aging balances and the drill-down transaction list render correctly for a customer with real invoice/payment history.
  UI entry point: Customer detail → AR tab
  Files under test: `src/components/customers/CustomerARSummary.jsx`, `autopro-supabaseCustomerARSummary`, `CustomerARTransactions.jsx`, `ARPaymentDetailsModal.jsx`

### Appointment (Phase 12 — first live pass; every item below has never been click-tested)

- [x] **`/Schedule` full create → drag → delete round trip** — **PASSED (2026-08-08 live session), with one caveat**
  tl;dr: The single highest-priority untested flow in the whole blueprint — create a real appointment, drag it to a new time, then delete it, confirming each step persists.
  UI entry point: `/Schedule`
  Files under test: `src/pages/Schedule.jsx`, `src/components/appointments/AppointmentForm.jsx` — also re-check the `Promise.all`/`getworkorderlist()` issue flagged in Section 2 before assuming the New Appointment form's customer/vehicle dropdowns populate correctly.
  **Result:** Created a real appointment (customer Tyler Haney, vehicle 2025 Chevrolet Trax, Aug 10 8:00–9:00 AM, Main Floor) — persisted correctly, `reminder_email_address`/`reminders_phone` auto-filled from the customer record, reminder checkboxes correctly left off. Rendered live on the calendar in the correct cell. Rescheduled via the Edit dialog's time fields to 10:00–11:00 AM — persisted (`updated_date` changed). Deleted — row confirmed gone. **Caveat:** the literal drag gesture itself was not exercised — the Browser pane wasn't visually displayed on the user's end, and native drag-and-drop requires a real screenshot-backed mouse drag (a synthetic pointer-event sequence was tried first and did not register with the calendar's DnD library). Rescheduling was instead verified through the Edit dialog's time fields, which exercises the same underlying update path. If true drag-and-drop interaction matters specifically (not just that reschedule-and-persist works), re-verify with the pane visually open. Customer/vehicle dropdowns populated correctly in this run — the Section 2 `Promise.all` concern did not manifest here.

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

- [x] **Overlapping appointments on one calendar cell** — **PASSED (2026-08-08)**, confirmed incidentally while testing the create/edit round trip above (real production-copied data already had a 2-appointment cell at 8:00 AM Aug 10) — clicking the cell opened `CellAppointmentsModal.jsx` listing both appointments correctly, and clicking an entry opened its Edit dialog correctly.
  tl;dr: Visually confirms the notes-preview line renders correctly with 2+ overlapping appointments.
  UI entry point: `/Schedule` — seed 2+ appointments in the same slot
  Files under test: `src/components/appointments/CellAppointmentsModal.jsx`

- [ ] **Reminder-function live re-point confirmation (email + SMS)** ⚠️ COMMS RULE — also still Base44-hosted (production-routed regardless of dev branch, per the structural finding in Section 2)
  tl;dr: Confirms the two Base44-hosted-but-Supabase-patched reminder functions actually reach Postgres and find a real appointment, now that the required Base44 secrets have been added.
  UI entry point: N/A (backend cron/trigger — verify via a real seeded appointment due for a reminder, and check logs/inbox/phone)
  Files under test: `base44/functions/sendAppointmentReminders/entry.ts`, `base44/functions/sendTextReminders/entry.ts`
  **Do not run against a real customer's appointment.** Seed a throwaway appointment against a customer/contact record using Tyler's own email/phone before triggering — or skip the actual send and verify only that the function reaches Postgres and resolves the correct appointment.

- [x] **Regression: "Create Estimate" / "Create Work Order" buttons still work from `AppointmentForm.jsx`** — **PASSED (2026-08-08), correction to the doc's own premise**
  tl;dr: These buttons ride an untouched Base44 code path — confirm Phase 12's changes didn't regress them.
  UI entry point: `/Schedule` → new/existing appointment → "Create Estimate" and "Create Work Order"
  Files under test: `src/components/appointments/AppointmentForm.jsx`
  **Correction:** `handleCreateWorkOrder` (line 648) is actually fully native — calls `createworkorderdata` (a real `autopro-*`/native path per Phase 13B), not Base44. Clicked live with customer=Tyler Haney, vehicle=2025 Chevrolet Trax: a real `WorkOrder` row was created in Postgres (`id: d5fdd429f0ed49f99e105a8e`, `status: Open`, correct `customer_id`) and `formData.work_order_id` was attached to the still-open appointment form, confirming the create-and-attach step works. **Could not verify the resulting `window.open('/WorkOrderEdit?...', '_blank', ...)` popup itself** — `tabs_context` showed no new tab opened; a script-dispatched `.click()` isn't treated as a trusted user gesture by the browser's popup blocker the way a real click is, so this is a testing-tool limitation, not a confirmed app bug. A real user's physical click should not have this problem. Leftover test `WorkOrder` (`d5fdd429f0ed49f99e105a8e`) intentionally left in place, not linked to any appointment since the appointment form itself was never submitted after attaching it.

### Inventory

- [ ] **Receive inventory (full batch)**
  tl;dr: Exercises the receiving pipeline end to end, including GL posting for AP.
  UI entry point: `InventoryAdd.jsx` → "Receive Inventory"
  Files under test: `src/pages/InventoryAdd.jsx`, `autopro-processInventoryReceipt`

- [x] **Add a new inventory item with AI category suggestion**
  tl;dr: Confirms the Gemini-backed category suggestion correctly fills in and the item saves.
  UI entry point: `InventoryAdd.jsx` / `InventoryAddModal.jsx` → new part entry
  Files under test: `src/components/inventory/InventoryAddModal.jsx`, `src/pages/InventoryAdd.jsx`, `autopro-suggestInventoryCategory`

- [x] **Adjust quantity on hand** — **PASSED (2026-08-08), first real UI-driven confirmation of the GL-rounding fix**
  tl;dr: Confirms the GL cent-rounding fix holds under a real UI-driven adjustment, not just a direct API call.
  UI entry point: `InventoryList.jsx` → an item → Adjust QOH
  Files under test: `src/components/inventory/InventoryAdjustQOHModal.jsx`, `autopro-processQOHAdjustment`
  **Result:** Part `11579`, QOH 2→5 (+3 units @ $1.93 cost). `InventoryAuditLog` row created correctly (`old_quantity:2, new_quantity:5, quantity_change:3, source_function:processQOHAdjustment`, correct `created_by`/description). GL posted a clean, balanced pair: debit `1200` $5.79 / credit `5003` $5.79 — exactly `3 × 1.93`, no floating-point artifact, confirming the Phase 7 rounding fix holds. Left as-is (not reverted) — an accurate audit trail is more valuable than a raw SQL revert that would desync history from the QOH value; the dev data is disposable per standing instruction anyway.

- [x] **Change / add / edit an inventory location** *(flagged untested in Phase 7 — priority)* — **PASSED (2026-08-08), first-ever live confirmation**
  tl;dr: First-ever live test of this flow; no prior sub-phase had eligible test data.
  UI entry point: An inventory item with a location → "Change Location"
  Files under test: `src/components/inventory/LocationModal.jsx`, `InventoryLocation` table
  **Result:** Part `11579` (BRAKE HARDWARE), location `BR4C6` → changed to `12A` via `LocationModal.jsx`'s search-and-select combobox → "Update Location" → confirmed persisted in Postgres (`updated_date` changed, `location = '12A'`). Reverted back to `BR4C6` afterward via direct SQL (front-end path already proven, no need to re-verify the revert through the UI). Only the "change existing item's location" path was tested — the modal's separate "Add Location"/"Edit Location Name" controls (for managing the `InventoryLocation` reference table itself) were not exercised here, see the separate "Manage Inventory Categories, Locations, and Return Reasons (admin)" item below.

- [x] **Process a parts return and edit return info** *(flagged untested in Phase 7 — priority)* — **Return path PASSED (2026-08-08); edit-info path not reached**
  tl;dr: First-ever live test; confirms `ReturnReason` selection and the return record itself save correctly.
  UI entry point: An inventory item → "Return" / an existing return → "Edit Return Info"
  Files under test: `src/components/inventory/InventoryPartsReturnModal.jsx`, `EditReturnInfoModal.jsx`, `ReturnReason` table
  **Result:** Returned 1× part `11579` via `InventoryPartsReturnModal.jsx`, reason "Overstock" (confirmed the `ReturnReason` dropdown is populated with all 9 real reference values). `InventoryReturn` row created correctly (`return_reason: Overstock`, `cost_per_unit: 1.93`, correct `supplier`/`inventory_item_id`, `status: On-site`), and `InventoryItem.quantity_on_hand` correctly decremented 5→4. Confirmed it appears correctly on `InventoryReturns.jsx`'s grouped-by-supplier list. **Not reached:** clicking the return row/its row-icon on `InventoryReturns.jsx` did not open `EditReturnInfoModal.jsx` in this session (no dialog appeared) — either a different click target than tried, or worth a direct look at that page's click handler before assuming it's broken.

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

- [x] **Create a new Work Order / Estimate** — **RE-CONFIRMED (2026-08-08)**, surfaced the `next_ro_number` collision bug (see Section 2's "Newly discovered bugs")
  tl;dr: Exercises the native insert path and confirms `WorkOrder.id` generation and lock acquisition both work.
  UI entry point: `WorkOrders.jsx` → "New Work Order"
  Files under test: `src/components/work-orders/NewWorkOrderModal.jsx`, `set_workorder_lock` RPC
  **Result:** Created via `NewWorkOrderModal.jsx` (customer Tyler Haney, vehicle 2025 Chevrolet Trax). First attempt got a colliding RO number from a stale `SystemSettings` counter (fixed, see Section 2) — after the fix, a second creation (`RO51611`) succeeded cleanly with no collision. `NewWorkOrderModal.jsx`'s customer search itself also hit the `search_customers_ranked` full-name bug (see Section 2) — worked around with a last-name-only search. Note the click on a WO row / "Create Work Order" navigates via `window.open(...)`, same popup-blocker limitation as the Appointment form's equivalent button — verified the backend result via direct SQL + direct URL navigation to `/WorkOrderEdit?id=<ro_number>` instead of following the popup.

- [x] **Add line items and parts to a Work Order** — **PARTIALLY PASSED (2026-08-08)** — manual line entry + save confirmed; part-search-driven add not yet exercised
  tl;dr: Confirms part search, add-existing-part, and add-new-part-with-batch-quantity all work — this exact path had a real inventory-corruption bug fixed in Phase 13E.
  UI entry point: `DocumentEditor.jsx` → Parts tab → "Get Part" / "Add Inventory"
  Files under test: `src/components/work-orders/form/LineItemsTable.jsx`, `GetPartModal.jsx`, `WOAddInventoryModal.jsx`, `FindPartModal.jsx`, `search_work_order_parts` RPC
  **Result:** Manually filled a line item's Qty/Description/Parts EA cells directly in `LineItemsTable.jsx`'s grid and clicked Save — persisted correctly (`line_items` jsonb array populated, `tot_parts`/`total` computed correctly, `total_amount` correctly included 5% GST: `25.00 → 26.25`). **Not yet tested:** the part-search flow itself (`GetPartModal.jsx`'s "Get Part" button, `search_work_order_parts` RPC) and `WOAddInventoryModal.jsx`'s batch-quantity add — this session only exercised free-text manual entry, not part lookup/attach.

- [x] **Convert an Estimate to a Work Order, then to an Invoice** — **PASSED (2026-08-08), full chain verified**
  tl;dr: Full lifecycle conversion, including the native `convertEstimateToWorkOrder` function and the invoice-conversion GL posting.
  UI entry point: `DocumentEditor.jsx` (Estimate) → "Convert to WO"; then `InvoiceConversion.jsx`
  Files under test: `autopro-convertEstimateToWorkOrder`, `src/pages/InvoiceConversion.jsx`, `autopro-archiveWorkOrderProjects`
  **Result:** `EST51613` → clicking the "Work Order" tab converted `stage: estimate→work_order`, added `wo_number`. Added a real $10 taxable line item, saved. Clicking "Invoice" launched a 3-phase wizard (odometer → internal description → settle payment) — not a single click, worth noting for anyone expecting instant conversion. Skipped odometer, filled description, paid the $10.50 balance in cash, clicked Continue: `stage→invoice`, real `inv_number: INV41269` assigned, `status→Completed`, payment recorded correctly in `payments` jsonb. **GL posting fully verified and balanced**: `1100`(AR) dr $10.50 / `4002`(Parts) cr $10 / `2002`(GST) cr $0.50, then `1010`(Cash) dr $10.50 / `1100`(AR) cr $10.50 — total debits = total credits = $21. This is one of the most consequential flows in the app and it's confirmed working correctly end to end, including tax and payment application. `autopro-archiveWorkOrderProjects` not separately confirmed (this WO had no linked WorkPRO Project to archive).

- [ ] **Record a payment against a Work Order**
  tl;dr: Confirms the jsonb-guard fix on `WorkOrder.payments` holds for a WO that already has prior payment history.
  UI entry point: `DocumentEditor.jsx` → "Record Payment" / `AdvancePaymentModal.jsx`
  Files under test: `src/components/work-orders/AdvancePaymentModal.jsx`, `src/components/work-orders/form/FinancialSummary.jsx`, `WorkOrderViewFinancialSummary.jsx`

- [ ] **Work Order locking under contention**
  tl;dr: Open the same Work Order in two sessions to confirm acquire/contested-apply/stale-steal/release all behave as designed.
  UI entry point: `DocumentEditor.jsx`, opened twice for the same WO
  Files under test: `set_workorder_lock` RPC

- [x] **Create a Counter Sale** — **PASSED (2026-08-08)**
  tl;dr: Directly re-verifies the Phase 13E bug fix (non-existent `cp_id`/`customer_complaint`/`estimated_hours`/`scheduled_date`/`technician` columns) now that it's been redeployed.
  UI entry point: `WorkOrders.jsx` → "Counter Sale"
  Files under test: `src/pages/WorkOrders.jsx` (`handleCreateCounterSale`)
  **Result:** Created cleanly — `RO51612`/`WO51612`, `status: Open`, `description: "Counter Sale"`, no numbering collision (counter fix holding). Confirms the Phase 13E column fix still holds post-redeploy.

- [ ] **Core return on a Work Order**
  tl;dr: Confirms the FIFO core-return logic and inventory/GL updates.
  UI entry point: `DocumentEditor.jsx` → core return action
  Files under test: `src/components/work-orders/ROCoreModal.jsx`, `autopro-returnCoreToWO`

- [ ] **Generate a Work Order PDF, then send it by email and by SMS** ⚠️ COMMS RULE
  tl;dr: Confirms all three document/comms outputs work with real recipients.
  UI entry point: `DocumentEditor.jsx` → Print/Email/Text actions
  Files under test: `src/components/work-orders/WorkOrderPdfModal.jsx`, `autopro-generateWorkOrderPdf`, `SESEmailModal.jsx`, `autopro-sendEmailViaSMTP`, `autopro-sendSms`
  Run this against a real Work Order whose customer contact is Tyler Haney (or a WO with Tyler's email/phone substituted in before sending) — never a real customer's actual contact info. PDF generation itself is safe to test against any WO; only the actual send step is gated.

- [ ] **Batch-send multiple Work Orders** ⚠️ COMMS RULE
  tl;dr: Confirms the batch email path also respects the jsonb-guard fix.
  UI entry point: WO list → multi-select → "Batch Send"
  Files under test: `src/components/ar/BatchSendWorkOrdersModal.jsx`
  Batch-select only Work Orders whose customer contact resolves to Tyler Haney — a batch action makes it easy to accidentally sweep in real customers.

- [ ] **Customer portal snapshot creation and approval** — confirm recipient before running
  tl;dr: Confirms a portal snapshot is created and the approvals path (non-empty state) works — this specific path was never live-tested in Phase 13D. "Send for Approval" implies the customer is notified of the portal link somehow — read `autopro-createPortalSnapshot` first to confirm whether it actually emails/texts the customer; if it does, this falls under the ⚠️ COMMS RULE (run against a WO whose customer contact is Tyler's own).
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

- [x] **Bank transaction entry and lock acquisition** — **PASSED (2026-08-08)** (manual-entry CRUD + GL confirmed; lock acquisition itself not separately isolated)
  tl;dr: Basic CRUD plus the locking pattern shared with other modules.
  UI entry point: `Bank.jsx` → New Transaction
  Files under test: `src/pages/Bank.jsx`, `src/components/bank/BankTransactionModal.jsx`, `autopro-getBankTransactions`, `autopro-calculateBankBalances`
  **Result:** Created a $100 manual credit against GL account `4003` (Other Charge Revenue) via `Bank.jsx` → New Transaction. `BankTransaction` row correct, and GL posted a clean balanced pair: `1001`(Bank) dr $100 / `4003` cr $100. Test row and its GL entries deleted afterward to keep the real bank data clean.

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

- [x] **Deposit history list and drill-down** *(directly verifies the Section 2 FiscalPeriod fix)* — **PASSED (2026-08-08), resolves the flagged "never circled back" item**
  tl;dr: Confirms the list actually loads now that the `FiscalPeriod`/`Promise.all` fix has landed — this exact flow was flagged as never re-verified live.
  UI entry point: `CashDrawer.jsx` → "Deposit History"
  Files under test: `src/components/cash-drawer/DepositHistoryModal.jsx`
  **Result:** Opened cleanly via `CashDrawer.jsx` → "History", loaded 549 real deposit records (paginated, page 1 of 110) with correct dates/descriptions/amounts/status. The `FiscalPeriod`/`Promise.all` bug flagged in Section 2 as unresolved-live is confirmed fixed — mark that Section 2 item resolved.

### Suppliers / Accounts Payable

- [ ] **Supplier invoice entry — full write path** *(directly verifies the Section 2 FiscalPeriod-gate item)* — **attempted 2026-08-08, inconclusive, needs human verification**
  tl;dr: Add an invoice line, select a GL account, and Save All Changes — this exact path was blocked by the FiscalPeriod gate in Phase 9B and never re-confirmed after the cutover.
  UI entry point: `Suppliers.jsx` → a supplier → `SupplierTx.jsx`
  Files under test: `src/pages/SupplierTx.jsx`, `autopro-saveSupplierInvoiceTransactions`, `autopro-getSupplierTransactions`
  **Result:** Filled invoice #/description/charge in the first empty row of `SupplierTx.jsx`'s grid and clicked "Save All Changes" — no console error, but the new line never appeared in `SupplierInvoiceLine` afterward, and the grid's visible content changed to something unrelated after the click (looked like a reset/refetch, not a save confirmation). Did not chase further — possibly the row's GL-account field needs an explicit dropdown interaction rather than accepting its default displayed value, but couldn't confirm root cause in the time available. **Moved to Section 5 for a human to verify directly** rather than leave a false pass or an unconfirmed bug claim.

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

- [x] **General Ledger, GL Journal, and GL Account Transactions views** — **PARTIALLY PASSED (2026-08-08)** — `GeneralLedger.jsx` confirmed; `GLJournal.jsx`/`GLAcct.jsx` not separately opened
  tl;dr: Confirms the ported reverse-chronological balance-walk logic renders correctly.
  UI entry point: `GeneralLedger.jsx`, `GLJournal.jsx`, `GLAcct.jsx`
  Files under test: `autopro-getGeneralLedgerData`, `autopro-getGLJournalData`/`get_gl_journal_data`, `autopro-getGLAccountTransactions`/`get_gl_account_transactions`
  **Result:** `GeneralLedger.jsx` loaded correctly with real account balances and transaction counts (e.g. `1001 Primary - Servus: $18,074.46 DR, 1180 transactions`). `GLJournal.jsx`/`GLAcct.jsx` drill-down views not separately opened this session.

- [ ] **Balance Sheet, P&L, and Financial Dashboard**
  tl;dr: Confirms the three headline financial-report pages render correctly against real data.
  UI entry point: `BalanceSheet.jsx`, `PLReport.jsx`, `FinancialDashboard.jsx`
  Files under test: `autopro-getBalanceSheetData`, `autopro-getPLReportData`, `autopro-getFinancialDashboardData`/`get_financial_dashboard_gl_monthly`

- [ ] **Post journal entries**
  tl;dr: Confirms manual journal-entry posting.
  UI entry point: `JournalEntries.jsx`
  Files under test: `autopro-postJournalEntries`

- [ ] **Find GL Imbalances (and its email trigger)** *(directly verifies the Section 2 checklist contradiction)* — confirm recipient before running
  tl;dr: Run the imbalance check and confirm whether the email notification actually fires — the phase doc left this ambiguous. This looks like an internal admin/accountant alert rather than a customer-facing email, but confirm the actual recipient address in the function before triggering — if it resolves to any real staff/customer inbox other than Tyler's, treat it under the ⚠️ COMMS RULE same as the customer-facing items above.
  UI entry point: Accounting → "Find GL Imbalances"
  Files under test: `autopro-findGLImbalances`

### GST / Taxes

- [x] **Calculate, post, and pay a GST return with real non-zero data** *(directly verifies the Section 2 $0.00-only gap)* — **Calculation PASSED (2026-08-08)**; post/pay not exercised (would affect real historical GST records)
  tl;dr: The sign-aware debit/credit branching in this function has never been proven live with real figures — only via curl on a synthetic period.
  UI entry point: `Taxes.jsx`
  Files under test: `autopro-calculateGSTReturn`, `autopro-postGSTJournalEntries`, `autopro-processGSTPayment`, `src/components/taxes/MarkPaidModal.jsx`
  **Result:** Generated a live Q3 2026 GST report against real data: GST Collected $5,093.46 (on $106,146.62 sales), GST Paid $1,947.73 (on $80,261.05 purchases), Net GST Due $3,145.73 — arithmetic checks out exactly (5093.46 − 1947.73 = 3145.73). Resolves the Section 2 concern that this was only ever proven with synthetic $0.00 data. Deliberately did not click "Post Return" — this is a real, already-partially-filed GST period (two real prior quarters show `PAID`) and posting/paying a real quarter's return isn't something to do as a side effect of a UI smoke test. Post/Pay steps left for a deliberate, separate check.

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

- **2026-08-08 (Work Orders live testing, real bug found):** `search_customers_ranked` (Postgres function) returns zero rows for a "First Last" full-name search term, even though a real matching customer exists — confirmed directly via `select count(*) from search_customers_ranked('Tyler Haney', false, 50, 0)` = 0, vs. `search_customers_ranked('Haney', ...)` = 4 rows including the same customer. Root cause: the `WHERE` clause never checks the concatenated full name, only individual columns — see the full writeup and fix suggestion in Section 2's new "Newly discovered bugs" group. 6 real call sites affected app-wide. Found while testing `NewWorkOrderModal.jsx`'s customer search with the exact "Tyler Haney" term that had worked moments earlier in `AppointmentForm.jsx`'s (differently-implemented) customer search — the discrepancy between the two is what surfaced this.
- **2026-08-08 (Appointment live testing, tooling note):** The Browser-pane's native `confirm()`/`alert()` dialogs auto-resolve to "cancel" when the pane isn't visually displayed on the user's screen (confirmed message: "native JavaScript dialogs are disabled in this browser; confirm() returned false to the page"). `AppointmentForm.jsx`'s submit handler correctly calls `window.confirm(...)` to warn when both reminder checkboxes are off ("This appointment will NOT send any reminders...") — this silently blocked the first create attempt. Fix: override `window.confirm = () => true` via `javascript_tool` before submitting any form gated behind a confirm dialog. Reusable for any future workflow in this doc that has a confirm-gated action (matches the Phase 11 lesson about a similar `window.confirm()` override need).
- **2026-08-08 (Appointment live testing, tooling note):** `AppointmentForm.jsx`'s "Create Work Order"/"Create Estimate" buttons open the new WO editor via `window.open(url, '_blank', ...)` rather than an in-app navigation. A script-dispatched `.click()` (via `javascript_tool`) does not count as a trusted user gesture, so the browser's popup blocker silently swallows the new tab — `tabs_context` shows no new tab, with zero console error. The backend action itself (WorkOrder creation) still fully succeeds and is verifiable via direct SQL. Any future workflow in this doc that opens a new window/tab this way needs its *backend* effect verified via SQL/API rather than by checking for a new tab.
- **2026-08-08 (Appointment live testing, tooling note):** True drag-and-drop on the `/Schedule` calendar could not be exercised — the calendar isn't using the native HTML5 DnD API (`draggable` attribute absent throughout the card's ancestor chain), and a synthetic `pointerdown`/`pointermove`/`pointerup` event sequence dispatched via `javascript_tool` did not register with whatever DnD library it uses (no DB change resulted). The `computer` tool's `left_click_drag` requires a prior `screenshot`, which fails when the Browser pane isn't visually displayed on the user's screen. If a workflow specifically needs drag-gesture verification (not just "the underlying update persists"), the pane needs to be visually open first.
- **2026-08-08 (session summary so far):** Live-verification session against `test.kensauto.ca` using real production-copied data (customer/vehicle/WO/supplier/inventory data all real; `GLTransaction` intentionally excluded from the copy). Confirmed passing live, with real data, this session: Appointment create/edit/delete round trip + overlapping-appointments modal + Appointment→WO creation; Inventory search/filters/location-change/QOH-adjustment(GL-verified)/parts-return; Work Order creation, manual line-item entry, Counter Sale, full Estimate→WorkOrder→Invoice→Payment conversion with balanced GL; Bank transaction entry with GL; Deposit History list (resolves a previously-flagged gap); General Ledger view; GST return calculation with real non-zero figures (resolves another previously-flagged gap); Payroll page loads with real data. **Three real findings this session:** (1) `search_customers_ranked` full-name search bug, app-wide, not yet fixed; (2) `SystemSettings.next_ro_number` counter drift causing a real WO-numbering collision, fixed live; (3) `SupplierTx.jsx`'s invoice-line save produced an inconclusive result (moved to Section 5 for human verification rather than guessed at). Payroll/LOC/Fiscal-Periods/Levies/Reports/WorkPRO/the cross-module integration flow are not yet exercised beyond a page-load spot check — still open for a future pass.
- **2026-08-08 (`SystemSettings.next_ro_number` fix, re-tested):** The counter fix (`51568`→`51611`) was re-verified live in this same session — a second `NewWorkOrderModal.jsx` creation immediately after the fix produced `RO51611`/`WO51611` with no collision, and a full add-line-item-and-save round trip against it succeeded cleanly (see Section 3's "Create a new Work Order" and "Add line items" entries). Confirmed resolved, no further re-test needed from the user's side for this specific fix.

---

## 5. User Verification Required

Items the AI agent could not exercise itself — not because the underlying feature looks broken, but because of a hard limitation in the browser-automation tooling used for this session. Each entry states *why* it couldn't be automated, so a human tester knows exactly what to check and doesn't have to re-diagnose the blocker. Check items off as you verify them; if you find a real bug while doing so, add it to Section 2 rather than just checking the box.

### Requires the Browser pane to be visually displayed (real mouse/OS-level input)

- [ ] **`/Schedule` calendar: drag an appointment to a new time/day** — the calendar doesn't use the native HTML5 drag API, and synthetic pointer events didn't register with its drag library. The *underlying reschedule-and-persist* was already verified via the Edit dialog's time fields (see Section 3), so this is specifically about confirming the drag *gesture itself* works, not whether rescheduling works at all.
  UI entry point: `/Schedule` → drag any appointment card to a different time slot.

### Requires a real file upload (no file-input capability in this session's browser automation)

- [ ] **Bank reconciliation: `AutoReconcileModal.jsx`'s CSV upload** — opens cleanly but the upload itself was never exercised (still true as of Phase 8's own closeout notes, unchanged this session).
  UI entry point: `Bank.jsx`/`Reconcile.jsx` → Auto-Reconcile → upload a bank CSV.
- [ ] **Payroll: `autopro-parsePayrollFile` via the actual file-upload UI** — the function itself was curl-verified in Phase 11 with synthetic payloads, but never driven through a real file picker.
  UI entry point: `Payroll.jsx` → import/upload a payroll file.
- [ ] **Inventory: OCR invoice upload (`autopro-processPartsInvoiceOCR`)** — explicitly deferred through every phase that touched Inventory; still untested end-to-end via a real uploaded invoice image/PDF.
  UI entry point: Wherever the supplier-invoice OCR upload control lives in the Inventory/Receiving flow.

### Inconclusive automated attempts — needs a human click-through to confirm pass/fail

- [ ] **`SupplierTx.jsx`: add an invoice line and "Save All Changes"** — filled the first empty grid row (invoice #, description, charge) and saved; no error appeared, but the new line was not found in `SupplierInvoiceLine` afterward and the grid's content looked like it reset rather than confirmed a save. Could be a GL-account-dropdown interaction the agent's scripted fill skipped (the cell showed a default value but may need an explicit selection), or a genuine save failure — needs a real click-through to tell which.
  UI entry point: `Suppliers.jsx` → any supplier → add a line in the Invoice Lines grid → "Save All Changes".
- [ ] **`InventoryReturns.jsx`: open "Edit Return Info" on an existing return** — clicking a return row, and the row's small icon button, did not open `EditReturnInfoModal.jsx` in this session (no dialog appeared either time). The underlying return-creation flow (`InventoryPartsReturnModal.jsx`) was separately confirmed working. Possibly a different click target than either one tried.
  UI entry point: `InventoryReturns.jsx` → click any return row.

### Requires two simultaneous authenticated sessions (only one browser session available to the agent)

- [ ] **Work Order locking under contention** — open the same Work Order in two sessions/browsers at once; confirm the second is correctly blocked/warned, and that a stale lock can be flushed.
  UI entry point: `DocumentEditor.jsx`, opened twice for the same WO (e.g. one normal window + one incognito, or two different logins).
  Files under test: `set_workorder_lock` RPC.
- [ ] **Concurrent supplier-lock blocking** — same pattern, for Suppliers.
  UI entry point: `Suppliers.jsx` → `SupplierTx.jsx`, opened twice.
  Files under test: `autopro-acquireSupplierLock`.

*(This section will grow as later modules — financial chain, Reports, WorkPRO — surface more agent-side blockers. Re-check this list before considering the blueprint's testing pass fully closed.)*
- **2026-08-03 (pre-Section-3 triage):** Confirmed live, via the actual browser session against `test.kensauto.ca`, that a handful of 401s fire on every page load. Diagnosed the exact mechanism: `src/api/base44Client.js`'s fetch/XHR interceptor auto-fires on every page load (not from any app code — `AuthContext.jsx` is fully native, `grep` for `User.me()`/`base44.auth` in `src/` turns up nothing app-side), attaching the user's dev-branch Supabase JWT to two calls the bundled `@base44/sdk` fires automatically: a `.../entities/User/me` identity lookup and an `.../analytics/track/batch` telemetry beacon, both routed to `base44-proxy` on **production** (`hbcrwkmgsazqrvsrmxyr`). **Correction after direct testing:** initially attributed to the expired-`BASE44_ACCESS_TOKEN` issue; a direct authenticated `fetch()` replay of the exact call (technique from the Phase 8/13 lessons) instead returned `{"error":"Unauthorized user session","debug":["Auth header present: true","getUser finished. Error: true. User: undefined"]}` — i.e. `base44-proxy` calls `supabase.auth.getUser(token)` against **production's own** auth service, which structurally cannot recognize a token issued by the **dev branch's** independent Auth service (separate signing keys — this is the Phase 3 "dev session rejected by base44-proxy" finding, not the token-expiry issue). This is not fixable by refreshing any token; it only resolves once these two SDK-internal calls stop existing (Phase 14 SDK removal). Confirmed via `performance.getEntriesByType('resource')` (a `window.fetch` monkey-patch doesn't survive `navigate()`'s full reload, so this was the reliable technique for initial-page-load diagnosis; a direct authenticated replay via `window.__SUPABASE_JWT__` confirmed the exact error body). Does not block actual page content — `WorkOrders` list rendered correctly with real data via `search_work_orders`/`getNotesBoardData`, both native and 200. Permanent, expected noise until Phase 14; treat any further `base44-proxy`/`User/me`/`analytics/track` 401 during this session as this same known issue, not a new finding.
