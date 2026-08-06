# Dark Mode Master Blueprint — AutoPro (kadr-autopro)

---

## 1. Objectives

### Core Vision
Ensure that **every user-facing component and page** in the AutoPro application renders correctly in dark mode. The application has a functioning dark mode toggle (stored per employee in Supabase), and the CSS variable system is already defined in `index.css`. The goal is **not to change behaviour, business logic, or layout** — only to apply appropriate `dark:` Tailwind variant classes to elements that currently render with hardcoded light-mode backgrounds, text colours, borders, and inputs when the `dark` class is present on `<html>`.

### TL;DR Architecture
- Dark mode is toggled by adding/removing the `dark` class on `document.documentElement` (the `<html>` tag) in `Layout.jsx`.
- Preference is stored in the `Employee` table (`dark_mode` boolean) and persisted via `updateEmployeePrefs()`.
- Tailwind CSS is configured to use the `class` strategy (implied by the `dark` class on `<html>` controlling it).
- All Shadcn UI primitives (in `src/components/ui/`) already support dark mode. The problem is all business-layer components that were built with hardcoded Tailwind classes like `bg-white`, `text-gray-900`, `border-gray-200`, etc. without `dark:` counterparts.

### Overall Goals
1. All 217+ non-UI component files audited for missing dark mode coverage.
2. ~162 files identified as needing dark mode updates applied systematically by module.
3. No regression to existing light-mode appearance.
4. No changes to logic, data fetching, props, or APIs — styling changes only.

---

## 2. Previously Completed

### Dark Mode Infrastructure (Complete)
- `index.css`: CSS variable sets defined for both `:root` (light) and `.dark` (dark) — backgrounds, foregrounds, cards, borders, muted, accent, chart colours, and sidebar colours.
- `Layout.jsx`: Dark mode toggle button (Sun/Moon icon), state management (`darkMode` state), `document.documentElement.classList.add/remove('dark')`, and preference persistence via Supabase.
- `tailwind.config.js`: Assumed to use `darkMode: 'class'` strategy.

### Components with Dark Mode Already Applied
**Appointments:** AppointmentForm.jsx ✅ | CellAppointmentsModal.jsx ✅ | CustomCalendar.jsx ✅

**AR:** ARPaymentDetailsModal.jsx ✅ | InvoiceViewerModal.jsx ✅ | RecordAdjustmentModal.jsx ✅ | StatementModal.jsx ✅ | TakePaymentModal.jsx ✅

**Customers:** CustomerForm.jsx ✅

**Inventory:** InventoryAdjustQOHModal.jsx ✅ | InventoryEditModal.jsx ✅ | InventoryPartsReturnModal.jsx ✅ | PartsInvoiceOCRModal.jsx ✅ | ReceiveCreditModal.jsx ✅

**Vehicles:** MergeVehicleModal.jsx ✅ | VehicleDetails.jsx ✅ | VehicleForm.jsx ✅ | VehicleHistoryModal.jsx ✅ | VehicleHistorySummaryCards.jsx ✅

**Work Orders:** AdvancePaymentModal.jsx ✅ | AppointmentsListModal.jsx ✅ | ChangeCustomerModal.jsx ✅ | DocumentEditor.jsx ✅ | EditApptViaWoModal.jsx ✅ | InvoiceDescriptionModal.jsx ✅ | InvoicePaymentModal.jsx ✅ | NewWorkPROModal.jsx ✅ | OdometerPromptModal.jsx ✅ | OtherChargeModal.jsx ✅ | ReceivePartModal.jsx ✅ | ReturnWOPartModal.jsx ✅ | ROCoreModal.jsx ✅ | SchedulerViaWoModal.jsx ✅ | SerialNumberModal.jsx ✅ | WOAddInventoryModal.jsx ✅ | WONotesModal.jsx ✅ | WorkOrderTable.jsx ✅ | WorkPROCommentsModal.jsx ✅ | WorkPROConnectorModal.jsx ✅ | WorkPRODescriptionModal.jsx ✅ | WorkPROEditProjectModal.jsx ✅ | WorkPROModal.jsx ✅ | WorkPROTaskModal.jsx ✅ | form/FinancialSummary.jsx ✅ | form/LineItemsTable.jsx ✅ | form/WorkOrderForm.jsx ✅ | form/WorkOrderHeaderInfo.jsx ✅ | form/WorkOrderViewFinancialSummary.jsx ✅ | form/WorkOrderViewHeaderInfo.jsx ✅ | form/WorkOrderViewLineItemsTable.jsx ✅ | history/*.jsx ✅

**Financial Pages & Components (Phase 4 — Tested, pending Phase 8D visual verification):** Bank.jsx ✅ | CashFlow.jsx ✅ | BalanceSheet.jsx ✅ | GeneralLedger.jsx ✅ | GLAcct.jsx ✅ | GLJournal.jsx ✅ | JournalEntries.jsx ✅ | Reconcile.jsx ✅ | ReconcileReport.jsx ✅ | PLReport.jsx ✅ | ChartOfAccounts.jsx ✅ | FiscalPeriods.jsx ✅ | AccountBalancesByTypeReport.jsx ✅ | CashFlowTrendReport.jsx ✅ (0 `dark:` — Recharts+Shadcn only, correct as-is) | CustomerPaymentsBreakdownReport.jsx ✅ | ThreeMonthAPReport.jsx ✅ | ThreeMonthPLReport.jsx ✅ | TopExpenseCategoriesReport.jsx ✅ | CashFlowTable.jsx ✅ | CashFlowTotals.jsx ✅ | CashFlowTrendTab.jsx ✅ | LinkSupplierModal.jsx ✅ | OverheadTable.jsx ✅ | PadRegistriesModal.jsx ✅ (pure Shadcn form, no raw colors, no changes needed) | AutoReconcileModal.jsx ✅ | BankAccountEditModal.jsx ✅ | BankTransactionModal.jsx ✅ | BankTransferModal.jsx ✅ | cash-drawer/DepositDetailsModal.jsx ✅ (path corrected from originally-scoped `bank/DepositDetailsModal.jsx`, which is empty/dead) | ReconciliationHistoryModal.jsx ✅ | AccountForm.jsx ✅ (pure Shadcn form, no changes needed) | GLTransactionForm.jsx ✅ (pure Shadcn form, no changes needed). `Bank.jsx`/`ReconcileReport.jsx` also got a real print-safety bug fix (see Phase 4 Rollup, Section 7).

**Customers, Vehicles, Appointments Gaps (Phase 5 — Tested, pending Phase 8D visual verification):** WorkOrderView.jsx ✅ (gap audit, 2 fixes) | WorkPROView.jsx ✅ (from-scratch) | CreditInvoice.jsx ✅ (from-scratch) | NewCustomerModal.jsx ✅ (pure composition, no changes needed) | NewVehicleModal.jsx ✅ (pure composition, no changes needed) | VehicleHistoryFilters.jsx ✅ (pure composition, no changes needed)

**Miscellaneous Pages (Phase 7 — Tested, pending Phase 8D visual verification):** APSummary.jsx ✅ (pure composition wrapper, no changes needed) | LinesOfCredit.jsx ✅ | PageNotFound.jsx ✅ | DevLogin.jsx ✅ | TechnicianPerformanceReportModal.jsx ✅ (carried over from Phase 6, stale comment also cleaned up) | ReportableLeviesReport.jsx ✅ (carried over from Phase 6; print-window HTML deliberately left out of scope, see Section 6 note) | InventoryAdd.jsx ✅ (carried over from Phase 6, largest file in this phase; one real bug fixed — bare `text-black` icon)

**Pages — Full Dark Mode Pass Complete (Phase 8A — Tested, pending Phase 8D visual verification):** CashDrawer.jsx ✅ | CustomerARSummary.jsx ✅ | CustomerARTransactions.jsx ✅ | Customers.jsx ✅ | FinancialDashboard.jsx ✅ | InventoryList.jsx ✅ | InventoryReturns.jsx ✅ | InvoiceConversion.jsx ✅ | Schedule.jsx ✅ (composition-only, no changes needed) | Vehicles.jsx ✅ | WorkOrders.jsx ✅ | WorkOrderView.jsx ✅ (re-verified only, Phase 7's prior fixes held)

**Components — 40 Files Found by 8C's Sweep 1, Never Previously Scoped (Phase 8F — Tested, pending Phase 8D visual verification):**
*Inventory:* EditInventoryTransactionModal.jsx ✅ | InventoryAddModal.jsx ✅ | InventoryHistoryModal.jsx ✅ | InventoryTransactionsModal.jsx ✅ | LankarImportReturnModal.jsx ✅ | LocationModal.jsx ✅ | MergeInventoryModal.jsx ✅
*Lines of Credit:* LineOfCreditPaymentModal.jsx ✅ | LineOfCreditTransactionModal.jsx ✅ | LOCReconciliationModal.jsx ✅ | PaymentTransactionItem.jsx ✅
*Setup/Admin:* RecordDetailsModal.jsx ✅ | EmployeeDirectory.jsx ✅ | PricingMatrixModal.jsx ✅ | RestoreBackupModal.jsx ✅ | SalesClassEditModal.jsx ✅ | SalesClassManager.jsx ✅ | TagAlongManager.jsx ✅ | TechDirectory.jsx ✅ | WIPSettings.jsx ✅ | WorkOrderStatusManager.jsx ✅
*Lankar:* LankarWOFinancialSummary.jsx ✅ | LankarWOHeaderInfo.jsx ✅ | LankarWOLineItemsTable.jsx ✅ | LegacyWorkOrderImportModal.jsx ✅
*Cash Drawer:* AdjustmentHistoryModal.jsx ✅ | DepositHistoryModal.jsx ✅ | DepositModal.jsx ✅ | DepositSlipBreakdownModal.jsx ✅
*Customers:* CustomerHistoryModal.jsx ✅ | CustomerWorkOrderHistoryModal.jsx ✅ | MergeCustomerModal.jsx ✅
*AR:* BatchSendWorkOrdersModal.jsx ✅ | InterestCalculationModal.jsx ✅
*Appointments:* SelectCustomerModal.jsx ✅ | SelectWorkOrderModal.jsx ✅
*Work Order note-card:* NoteColorPicker.jsx ✅ | NoteEditableContent.jsx ✅
*Cheques:* IssuedChequesTable.jsx ✅ (real print-safety fix — dangerous reused-DOM pattern, no color-reset, fixed)
*Misc:* UserNotRegisteredError.jsx ✅

**Suppliers & AP (Phase 1 — Tested):** Suppliers.jsx ✅ | SupplierTx.jsx ✅ | SupplierTxView.jsx ✅ | LankarImport.jsx ✅ | LankarWOView.jsx ✅ | ChequeWriter.jsx ✅ | ChequeRegister.jsx ✅ | AddToSheetModal.jsx ✅ | APSummaryTable.jsx ✅ | GLAccountCombobox.jsx ✅ | LineEditModal.jsx ✅ | SupplierCombobox.jsx ✅ | SupplierForm.jsx ✅ | SupplierPaymentModal.jsx ✅ | SupplierTxInvoiceLinesTab.jsx ✅ | SupplierTxInvoiceSummaryTab.jsx ✅ | SupplierTxModals.jsx ✅ (pure composition wrapper, no markup of its own) | SupplierTxPaymentHistoryTab.jsx ✅

**Payroll, Taxes, Admin, Setup, Email (Phase 2 — Tested):** Payroll.jsx ✅ | Taxes.jsx ✅ | Admin.jsx ✅ | Setup.jsx ✅ | EmailLog.jsx ✅ | AddAdjustmentModal.jsx ✅ | AddPaychequeModal.jsx ✅ | AddRemittanceModal.jsx ✅ | EmployeeDetailsForm.jsx ✅ (pure Shadcn form, no raw colors, no changes needed) | payroll/MarkPaidModal.jsx ✅ | PayrollEmployeeForm.jsx ✅ (pure Shadcn form, no raw colors, no changes needed) | PayrollGLAccountCombobox.jsx ✅ | PreviousPaychequesModal.jsx ✅ | taxes/MarkPaidModal.jsx ✅

**Inventory & Reports (Phase 6 — Tested):** InventoryValuation.jsx ✅ | StockReorderReport.jsx ✅ | CustomerReportModal.jsx ✅ | InventoryOnOrder.jsx ✅ | OtherChargesBreakdownReport.jsx ✅ | PartsMovementReportModal.jsx ✅ | ReportModal.jsx ✅ | SalesAnalysisReport.jsx ✅ (Recharts, theme-aware via `hsl(var(--token))`) | WorkOrderSummaryReport.jsx ✅ (Recharts, theme-aware via `hsl(var(--token))`)

**Work Orders — Remaining Modals (Phase 3 — Tested):** ConfirmCreditInvoiceModal.jsx ✅ | CreditConfirmationModal.jsx ✅ | EditProjectDetailsModal.jsx ✅ | FindPartModal.jsx ✅ | GetPartModal.jsx ✅ | GlobalClockInModal.jsx ✅ | NewWorkOrderModal.jsx ✅ | NoteBoard.jsx ✅ (pure composition wrapper, no markup of its own) | NoteCard.jsx ✅ | NoteColumn.jsx ✅ | NotesStatusBar.jsx ✅ | NoteWorkOrderLinkModal.jsx ✅ | OpenROModal.jsx ✅ | ROApprovalsModal.jsx ✅ | SESEmailModal.jsx ✅ | TechClockStatusModal.jsx ✅ | TechProjectClockInModal.jsx ✅ | TechTimeModal.jsx ✅ | WarrantyReturnModal.jsx ✅ | WorkOrderList.jsx ✅ | WorkOrderPdfModal.jsx ✅ | WorkOrderProfitability.jsx ✅ | WorkPROViewModal.jsx ✅ | form/CreditInvoiceFinancialSummary.jsx ✅ | form/CreditInvoiceLineItemsTable.jsx ✅ | form/WorkOrderDetailsEditModal.jsx ✅ (pure Shadcn form, no raw colors, no changes needed). **`WorkOrderReport.jsx`** — deliberately left with zero `dark:` classes (user decision: it's a paper-preview document, stays white/black in both modes, same category as a PDF viewer). **`ROInspectionModal.jsx`** — removed entirely (confirmed dead: unreachable via any UI trigger, and its `DocumentEditor.jsx` caller had a prop mismatch bug). **`WorkOrderTable.jsx`** — not a Phase 3 file, but its `colorMap` needed the same fix as `WorkOrderList.jsx`'s identical map despite already being marked ✅ above from an earlier pass (see Phase 3 Rollup, Section 7, for why).

---

## 3. Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Light-mode regression | Medium | High | Tailwind `dark:` classes are additive — always add alongside, never replace light classes |
| Invisible text (dark on dark / white on white) | High | High | Review every `text-*` and `bg-*` combo. Follow established palette below |
| Border disappearance in dark mode | High | Medium | All `border-gray-*` must get `dark:border-slate-700` or `dark:border-slate-800` |
| Table row striping broken | Medium | Medium | `bg-gray-50` / `even:bg-gray-50` → add `dark:bg-slate-800/40` |
| Input fields unreadable | High | High | All inputs need `dark:bg-slate-800 dark:text-slate-100 dark:border-slate-600` |
| Badge/pill colour clashes | Medium | Medium | All coloured badges need dark-safe pairs (e.g., `dark:bg-green-900/40 dark:text-green-300`) |
| Chart/graph text unreadable | Medium | Medium | Recharts axes/labels need `dark:` colour handling |
| Inconsistent dark shades across modules | Medium | Low | Standardise on palette in Section 7 |

---

## 4. Time Estimate

| Phase | Scope | Est. Files | Est. Time |
|---|---|---|---|
| Phase 1 | Supplier & AP pages and modals | ~18 | 2–3 hours |
| Phase 2 | Payroll, Taxes, Admin, Setup, Email | ~14 | 1.5 hours |
| Phase 3 | Work Orders — remaining unlisted modals | ~28 | 2.5 hours |
| Phase 4 | Financial pages & components (GL, Bank, Reconcile, P&L) | ~32 | 3–4 hours |
| Phase 5 | Customers, Vehicles, Appointments gaps | ~10 | 1.5 hours |
| Phase 6 | Inventory & Reports pages and modals | ~12 | 2 hours |
| Phase 7 | Miscellaneous pages (LOC, CreditInvoice, etc.) | ~15 | 2 hours |
| Phase 8 | Full audit pass & regression | All | 1.5 hours |
| **Total** | | **~129 files** | **~16–18 hours** |

---

## 5. Roadmap & Progress

```
Phase 1 [Tested] ──► Phase 2 [Tested] ──► Phase 3 [Tested] ──► Phase 4 [Tested*] ──► Phase 5 [Tested*] ──► Phase 6 [Tested] ──► Phase 7 [Tested*]
                                                                                                                                                    │
                                                                                                                                                    ▼
                                                                                                                                     Phase 8 [In Progress — 8A/8B/8C/8F Complete, 8D/8E Remain]
```
`[Tested*]` = code-complete and grep-audit-verified, awaiting the user's manual visual walkthrough (Phase 8D checklist) rather than a separate live click-through pass per phase.

**Note:** Phases 4, 5, and 7 (originally skipped/deferred for conflict-avoidance with the concurrently-running Base44-deprecation blueprint at `Plans and Context/master_blueprint.md`) were all confirmed unblocked and executed in later sessions once that blueprint's own conflicting phases (10, 13) were verified `[Tested]`. Phase 6's 3 carried-forward files (`InventoryAdd.jsx`, `ReportableLeviesReport.jsx`, `TechnicianPerformanceReportModal.jsx`) were likewise unblocked and completed as an extension to Phase 7. See `phase_4_implementation_plan.md`, `phase_5_implementation_plan.md`, `phase_7_implementation_plan.md`, and `phase_8_implementation_plan.md` for the full per-file execution record, and the corresponding rollup subsections in Section 7 below for condensed lessons learned.

---

### Phase 1 — Supplier & AP Pages [Tested]

**TL;DR:** Supplier transaction views, AP summary, cheque pages, and payment modals are heavily table-driven. Systematic row/header dark mode application needed. No conflict risk with other agents.

**Impacted Files:**

*Pages:*
- `src/pages/Suppliers.jsx`
- `src/pages/SupplierTx.jsx`
- `src/pages/SupplierTxView.jsx`
- `src/pages/LankarImport.jsx`
- `src/pages/LankarWOView.jsx`
- `src/pages/ChequeWriter.jsx`
- `src/pages/ChequeRegister.jsx`

*Components:*
- `src/components/suppliers/AddToSheetModal.jsx`
- `src/components/suppliers/APSummaryTable.jsx`
- `src/components/suppliers/GLAccountCombobox.jsx`
- `src/components/suppliers/LineEditModal.jsx`
- `src/components/suppliers/SupplierCombobox.jsx`
- `src/components/suppliers/SupplierForm.jsx`
- `src/components/suppliers/SupplierPaymentModal.jsx`
- `src/components/suppliers/SupplierTxInvoiceLinesTab.jsx`
- `src/components/suppliers/SupplierTxInvoiceSummaryTab.jsx`
- `src/components/suppliers/SupplierTxModals.jsx`
- `src/components/suppliers/SupplierTxPaymentHistoryTab.jsx`

---

### Phase 2 — Payroll, Taxes, Admin, Setup, Email [Tested]

**TL;DR:** Administrative and payroll sections are used by managers/admins. These have form-heavy layouts with many input fields and data tables.

**Impacted Files:**

*Pages:*
- `src/pages/Payroll.jsx`
- `src/pages/Taxes.jsx`
- `src/pages/Admin.jsx`
- `src/pages/Setup.jsx`
- `src/pages/EmailLog.jsx`

*Components:*
- `src/components/payroll/AddAdjustmentModal.jsx`
- `src/components/payroll/AddPaychequeModal.jsx`
- `src/components/payroll/AddRemittanceModal.jsx`
- `src/components/payroll/EmployeeDetailsForm.jsx`
- `src/components/payroll/MarkPaidModal.jsx`
- `src/components/payroll/PayrollEmployeeForm.jsx`
- `src/components/payroll/PayrollGLAccountCombobox.jsx`
- `src/components/payroll/PreviousPaychequesModal.jsx`
- `src/components/taxes/MarkPaidModal.jsx`

---

### Phase 3 — Work Orders: Remaining Modals [Tested]

**Conflict re-check (2026-08-03):** This phase was originally skipped because it overlapped the concurrently-running Base44-deprecation blueprint's **Phase 13 "Work Orders Core"**. Re-checked directly against `Plans and Context/phase_13_implementation_plan.md`: sub-phases 13D and 13E are both confirmed `[Tested]`. Clean to proceed — executed and verified this session.

**TL;DR:** Several work order modals identified in the audit were entirely missing dark mode. These are frequently used in daily operations. All 5 sub-phases (3A–3E, 28 files) executed via `phase_3_implementation_plan.md` — see that document for full per-file detail, and the Phase 3 Rollup in Section 7 below for lessons learned and notable deviations.

**Impacted Files:**
- `src/components/work-orders/ConfirmCreditInvoiceModal.jsx`
- `src/components/work-orders/CreditConfirmationModal.jsx`
- `src/components/work-orders/EditProjectDetailsModal.jsx`
- `src/components/work-orders/FindPartModal.jsx`
- `src/components/work-orders/GetPartModal.jsx`
- `src/components/work-orders/GlobalClockInModal.jsx`
- `src/components/work-orders/NewWorkOrderModal.jsx`
- `src/components/work-orders/NoteBoard.jsx`
- `src/components/work-orders/NoteCard.jsx`
- `src/components/work-orders/NoteColumn.jsx`
- `src/components/work-orders/NotesStatusBar.jsx`
- `src/components/work-orders/NoteWorkOrderLinkModal.jsx`
- `src/components/work-orders/OpenROModal.jsx`
- `src/components/work-orders/ROApprovalsModal.jsx`
- `src/components/work-orders/ROInspectionModal.jsx`
- `src/components/work-orders/SESEmailModal.jsx`
- `src/components/work-orders/TechClockStatusModal.jsx`
- `src/components/work-orders/TechProjectClockInModal.jsx`
- `src/components/work-orders/TechTimeModal.jsx`
- `src/components/work-orders/WarrantyReturnModal.jsx`
- `src/components/work-orders/WorkOrderList.jsx`
- `src/components/work-orders/WorkOrderPdfModal.jsx`
- `src/components/work-orders/WorkOrderProfitability.jsx`
- `src/components/work-orders/WorkOrderReport.jsx`
- `src/components/work-orders/WorkPROViewModal.jsx`
- `src/components/work-orders/form/CreditInvoiceFinancialSummary.jsx`
- `src/components/work-orders/form/CreditInvoiceLineItemsTable.jsx`
- `src/components/work-orders/form/WorkOrderDetailsEditModal.jsx`

---

### Phase 4 — Financial Pages & Components [Tested — pending Phase 8D visual verification]

**Originally skipped, later unblocked and executed:** These GL/Bank/Reconcile/P&L/Balance Sheet files directly overlapped with the concurrently-running Base44-deprecation blueprint's **Phase 10 "Accounting, GL Reporting, Taxes & Fiscal Periods"** (`Plans and Context/master_blueprint.md`). Once that blueprint's Phase 10 was confirmed unblocked, all 4 sub-phases (4A–4D) were executed in full — see `phase_4_implementation_plan.md` for the complete per-file record and the Phase 4 Rollup in Section 7 below.

**TL;DR:** The accounting backbone of the app. GL, Bank, Cash Flow, Reconcile, P&L, Balance Sheet all render correctly in dark mode now.

**Impacted Files:**

*Pages:*
- `src/pages/Bank.jsx`
- `src/pages/CashFlow.jsx`
- `src/pages/BalanceSheet.jsx`
- `src/pages/GeneralLedger.jsx`
- `src/pages/GLAcct.jsx`
- `src/pages/GLJournal.jsx`
- `src/pages/JournalEntries.jsx`
- `src/pages/Reconcile.jsx`
- `src/pages/ReconcileReport.jsx`
- `src/pages/PLReport.jsx`
- `src/pages/ChartOfAccounts.jsx`
- `src/pages/FiscalPeriods.jsx`

*Components:*
- `src/components/financial-dashboard/AccountBalancesByTypeReport.jsx`
- `src/components/financial-dashboard/CashFlowTrendReport.jsx`
- `src/components/financial-dashboard/CustomerPaymentsBreakdownReport.jsx`
- `src/components/financial-dashboard/ThreeMonthAPReport.jsx`
- `src/components/financial-dashboard/ThreeMonthPLReport.jsx`
- `src/components/financial-dashboard/TopExpenseCategoriesReport.jsx`
- `src/components/cash-flow/CashFlowTable.jsx`
- `src/components/cash-flow/CashFlowTotals.jsx`
- `src/components/cash-flow/CashFlowTrendTab.jsx`
- `src/components/cash-flow/LinkSupplierModal.jsx`
- `src/components/cash-flow/OverheadTable.jsx`
- `src/components/cash-flow/PadRegistriesModal.jsx`
- `src/components/bank/AutoReconcileModal.jsx`
- `src/components/bank/BankAccountEditModal.jsx`
- `src/components/bank/BankTransactionModal.jsx`
- `src/components/bank/BankTransferModal.jsx`
- `src/components/bank/DepositDetailsModal.jsx`
- `src/components/bank/ReconciliationHistoryModal.jsx`
- `src/components/accounts/AccountForm.jsx`
- `src/components/accounts/GLTransactionForm.jsx`

**Key Patterns to Fix:**
- `bg-white` containers → add `dark:bg-slate-900`
- `bg-gray-50` / `bg-gray-100` table headers → add `dark:bg-slate-800`
- `text-gray-600`, `text-gray-900` → add `dark:text-slate-400`, `dark:text-slate-100`
- `border-gray-200` → add `dark:border-slate-700`

---

### Phase 5 — Customers, Vehicles, Appointments Gaps [Tested — pending Phase 8D visual verification]

**Originally skipped, later unblocked and executed:** 2 of the 6 files (`WorkOrderView.jsx`, `CreditInvoice.jsx`) were confirmed inside the concurrently-running Base44-deprecation blueprint's **Phase 13D/13E** (`Plans and Context/phase_13_implementation_plan.md`). Once that blueprint's Phase 13 was confirmed `[Tested]`, all 6 files were executed — see `phase_5_implementation_plan.md` for the complete per-file record and the Phase 5 Rollup in Section 7 below.

**TL;DR:** Filled in remaining gaps in modules that were partially dark-mode converted.

**Impacted Files:**
- `src/components/customers/NewCustomerModal.jsx`
- `src/components/vehicles/NewVehicleModal.jsx`
- `src/components/vehicles/VehicleHistoryFilters.jsx`
- `src/pages/WorkOrderView.jsx` (gap audit)
- `src/pages/WorkPROView.jsx`
- `src/pages/CreditInvoice.jsx`

---

### Phase 6 — Inventory & Reports [Tested]

**TL;DR:** Inventory pages are data-dense with large tables, filters, and many action modals. The reports module powers printable views and dashboard sub-panels. Deferred to Phase 6 as reports are nip-and-tuck with the broader financial work.

**Conflict check (2026-08-03):** Spot-checked all 12 files against the concurrently-running Base44-deprecation blueprint. 3 excluded from this phase's scope due to confirmed active/planned touch points in that blueprint's **Phase 10** (`Plans and Context/phase_10_implementation_plan.md`, status `[Pending]`):
- `src/pages/InventoryAdd.jsx` — listed as a `checkFiscalPeriodStatus()` caller needing regression-confirmation in their Phase 10A test pass.
- `src/components/reports/ReportableLeviesReport.jsx` — scheduled to have its `syncLevies`/`postLeviesToAP` invokes repointed as part of their Phase 10.
- `src/components/reports/TechnicianPerformanceReportModal.jsx` — scheduled to have its payroll-target progress bar restored/unhidden as part of their Phase 10.

These 3 files were carried forward and completed as an extension to Phase 7, once the other blueprint's Phase 10 was confirmed `[Tested]` — see Phase 7's section above and its Rollup in Section 7 below. The remaining 9 files below showed no overlap and proceeded as originally scoped in this phase.

**Impacted Files:**

*Pages:*
- `src/pages/InventoryValuation.jsx`
- `src/pages/StockReorderReport.jsx`

*Components:*
- `src/components/reports/CustomerReportModal.jsx`
- `src/components/reports/InventoryOnOrder.jsx`
- `src/components/reports/OtherChargesBreakdownReport.jsx`
- `src/components/reports/PartsMovementReportModal.jsx`
- `src/components/reports/ReportModal.jsx`
- `src/components/reports/SalesAnalysisReport.jsx`
- `src/components/reports/WorkOrderSummaryReport.jsx`

**Originally excluded, since completed via Phase 7's extension:** `src/pages/InventoryAdd.jsx`, `src/components/reports/ReportableLeviesReport.jsx`, `src/components/reports/TechnicianPerformanceReportModal.jsx`

---

### Phase 7 — Miscellaneous Pages [Tested — pending Phase 8D visual verification]

**TL;DR:** Remaining pages with zero dark mode coverage, executed in full — plus a later same-blueprint extension that closed out Phase 6's 3 carried-forward files (`InventoryAdd.jsx`, `ReportableLeviesReport.jsx`, `TechnicianPerformanceReportModal.jsx`, see Phase 6's note above). `src/pages/CustomerHistory.jsx` and `src/pages/VehicleHistory.jsx` were confirmed dead/unrouted code during execution (Phase 7 Rollup, Section 7) and were not edited. See `phase_7_implementation_plan.md` for the complete per-file record.

**Impacted Files:**
- `src/pages/APSummary.jsx` (pure composition wrapper, no changes needed)
- `src/pages/LinesOfCredit.jsx`
- `src/lib/PageNotFound.jsx`
- `src/lib/DevLogin.jsx`
- `src/components/reports/TechnicianPerformanceReportModal.jsx` (carried over from Phase 6)
- `src/components/reports/ReportableLeviesReport.jsx` (carried over from Phase 6)
- `src/pages/InventoryAdd.jsx` (carried over from Phase 6)

---

### Phase 8 — Full Audit Pass & Regression Testing [In Progress — 8A/8B/8C/8F Complete, 8D/8E Remain]

**TL;DR:** Final sweep to catch overlooked elements — popovers, comboboxes, tooltips, toasts, and print output. Restructured into sub-phases 8A–8F (see `phase_8_implementation_plan.md`); 8A (the 12 previously-partial pages), 8B (this rollup), 8C (repo-wide grep audit), and 8F (the 40 files 8C's Sweep 1 found never-scoped) are complete. 8D (manual UI/UX verification, user-driven) and 8E (final closeout) remain.

**Tasks:**
- Toggle dark mode and navigate every page
- Open every modal in dark mode
- Verify all tables, forms, badges, and status chips
- Confirm print styles unaffected
- Check Recharts graph text/grid line legibility

---

## 6. Verification Plan

### Per-Phase Criteria

| Phase | Pass Criteria |
|---|---|
| Phase 1 | Supplier pages, AP summary, cheque pages, all supplier modals fully styled in dark mode |
| Phase 2 | Payroll/Tax/Admin/Setup forms fully legible; no blown-out inputs |
| Phase 3 | All flagged work order modals open cleanly with correct contrast |
| Phase 4 | Bank, GL, Reconcile, P&L, Balance Sheet: dark backgrounds, readable text, visible borders, legible table headers/rows |
| Phase 5 | Customer/Vehicle/Appointment pages have no remaining light-only elements |
| Phase 6 | Inventory pages and report modals render correctly; no white flash on open |
| Phase 7 | All miscellaneous pages correct |
| Phase 8 | Full navigation pass with no white or invisible areas |

### Component Checklist
- [ ] Background is dark (`dark:bg-slate-900` or `dark:bg-slate-950`)
- [ ] Body text readable (`dark:text-slate-100`)
- [ ] Muted/label text visible (`dark:text-slate-400`)
- [ ] Table headers: `dark:bg-slate-800 dark:text-slate-300`
- [ ] Table row stripe: `dark:bg-slate-800/40`
- [ ] Table row hover: `dark:hover:bg-slate-700/50`
- [ ] Inputs: `dark:bg-slate-800 dark:text-slate-100 dark:border-slate-600`
- [ ] Borders: `dark:border-slate-700` or `dark:border-slate-800`
- [ ] Status badges have dark-safe colour pairs
- [ ] Print output unaffected

---

## 7. Lessons Learned & Context

### Architecture Rules
1. **Dark mode is class-based** — the `dark` class is added to `document.documentElement` by `Layout.jsx`. Never use `prefers-color-scheme` media queries for component-level dark mode.
2. **Preference is per-employee** — stored in `Employee.dark_mode` (Supabase), persisted via `updateEmployeePrefs()` in `AuthContext`.
3. **Tailwind `dark:` classes are purely additive** — never replace light-mode classes, only add `dark:` variants alongside them. E.g., `bg-white dark:bg-slate-900`.
4. **Shadcn UI components are already dark-mode safe** — do not modify anything in `src/components/ui/`.
5. **Print media forces white background** — `@media print { body { background: white !important; } }` is already in `index.css`. Dark mode on printed pages is already overridden.

### Proxy Migration Context (Prior Work — Separate from Dark Mode)
- The legacy `base44-proxy` edge function returns 500 errors.
- `Project`, `Appointment`, `Employee`, `Customer`, `Vehicle`, `ProjectTimeSession`, `UnassignedTime`, `TimeRecord` are native Supabase tables, not Base44 entities. (`ProjectComment` and the old `Inspection` entity were **not** found as native tables during Phase 3 — see Phase 3 Rollup below; treat as deprecated, not "not yet migrated.")
- Any component still using `base44.functions.invoke()` or legacy entity SDK methods is broken and must be migrated to `supabase.from('TableName')`.
- **This is separate from dark mode** — do not mix proxy migration with dark mode changes during this blueprint. **One deliberate, justified exception occurred in Phase 3** (see rollup below): a real, live, hardcoded third-party API key was discovered mid-styling-pass across 6 files. Security exposures found incidentally during a dark-mode pass should still be fixed immediately rather than deferred — this exception is about not going looking for proxy/migration work, not about ignoring it when it's sitting in the file you're already editing.

### Standard Dark Mode Colour Palette

```
Container/modal bg:    dark:bg-slate-950
Card/panel bg:         dark:bg-slate-900
Subtle section bg:     dark:bg-slate-800
Input bg:              dark:bg-slate-800
Input text:            dark:text-slate-100
Input border:          dark:border-slate-600
Primary text:          dark:text-slate-100
Secondary text:        dark:text-slate-300
Muted/label text:      dark:text-slate-400
Table header bg:       dark:bg-slate-800
Table header text:     dark:text-slate-300
Table row stripe:      dark:bg-slate-800/40
Table row hover:       dark:hover:bg-slate-700/50
Border:                dark:border-slate-700 or dark:border-slate-800
Badge (green):         dark:bg-green-900/40 dark:text-green-300
Badge (blue):          dark:bg-blue-900/40 dark:text-blue-300
Badge (red):           dark:bg-red-900/40 dark:text-red-300
Badge (yellow):        dark:bg-yellow-900/40 dark:text-yellow-300
Badge (gray):          dark:bg-slate-700/60 dark:text-slate-300
Divider/separator:     dark:divide-slate-700
```

### Edge Function Naming Convention
- All new Supabase edge functions must be named `autopro-[functionname]` (e.g., `autopro-getProjectTimeSessions`).

### Phase 1 Rollup — Lessons Learned (Tested 2026-08-03)
1. **Composition-only components need no direct `dark:` classes.** `SupplierTxModals.jsx` renders zero markup of its own — it only wires together already-converted child modals (`LineEditModal`, `EditInventoryTransactionModal`, `SupplierPaymentModal`). Files like this should be excluded from per-file dark-mode class counts; verify by checking whether the file returns raw JSX elements vs. only composed child components.
2. **Verification method that worked:** grep each target file for `dark:` occurrence count post-edit as a fast sanity check before manual UI verification — a 0-count on a file with real markup is a red flag, a 0-count on a pure composer is expected and fine.
3. **Table-heavy supplier/AP pages needed the most `dark:` classes** (`SupplierTxView.jsx` ~45, `LankarImport.jsx` ~25) — consistent with the risk table's prediction that table row striping/headers are the highest-touch surface area. Expect similarly high class counts in Phase 4 (GL/Bank/Reconcile), which is also table-dense.
4. **No light-mode regressions or logic changes were introduced** — confirms the additive `dark:` class strategy (Section 7 Architecture Rule 3) is sufficient and should remain the approach for all remaining phases.

### Phase 2 Rollup — Lessons Learned (Tested 2026-08-03)
1. **New architecture gotcha found: hardcoded `bg-white`/`bg-slate-50` overrides on Shadcn primitives silently break dark mode.** Several components pass a className like `bg-white` or `bg-slate-50` directly onto a Shadcn `Input`, `Button`, or `SelectTrigger`. Those primitives already default to `bg-transparent` (Input) or `bg-card`/CSS-variable-driven backgrounds (Button outline variant, SelectTrigger) which are dark-safe on their own — but a hardcoded override className defeats that and forces a light background in dark mode regardless of theme. Found and fixed in `Setup.jsx`, `Taxes.jsx`, `Payroll.jsx`, `AddPaychequeModal.jsx`, and `PayrollGLAccountCombobox.jsx`. **Action for future phases:** whenever a Shadcn primitive has a custom `className` with a `bg-*` value, check the primitive's own source (`src/components/ui/`) to see if it's overriding an already-dark-safe default — if so, add an explicit `dark:` pair rather than assuming the primitive handles it.
2. **`slate-*` shades used for light-mode text are not automatically dark-safe, but "muted" ones often are.** Confirms the Phase 1 rollup observation: `text-slate-600/700/900` and `bg-slate-50/100` need distinct `dark:` pairs. However `text-slate-400`/`text-slate-500` used for already-muted/secondary text frequently matches the Section 7 dark palette's own muted-text value, so it's sometimes (not always) safe to leave unchanged — verify per-instance rather than assuming either way.
3. **Pure Shadcn-component forms need zero edits.** `EmployeeDetailsForm.jsx` and `PayrollEmployeeForm.jsx` had 0 raw color classes — entirely composed of `Dialog`/`Input`/`Label`/`Select`/`Checkbox` with no custom `div`/`span` styling. Grep for `dark:` count of 0 on a file is not automatically a red flag — first check whether the file has any raw JSX markup with hardcoded colors at all before treating a 0-count as missed work.
4a. **New process rule, effective immediately: check the `Plans and Context/` Base44-deprecation blueprint for file overlap before scoping any future phase.** That blueprint (a separate, much larger initiative executed by another agent in parallel) is authoritative for which files currently have active or near-term planned edits. Before drafting a phase plan here, grep `Plans and Context/master_blueprint.md` and the current/next `[In Progress]`/`[Pending]` phase's implementation-plan file for each candidate filename. Phases 3, 4, and 5 of this dark-mode blueprint were all found to overlap (Work Orders, Financial/GL, and 2 of Phase 5's files respectively) and were skipped as a result; Phase 6 was found to partially overlap (3 of 12 files) and had those files excluded rather than the whole phase skipped. Do this check as a standard step for Phase 7 and 8 planning too, not just when something looks suspicious.
4. **Dev server preview verification was blocked in-session** — the local Vite dev server (`kadr-autopro-dev`, port 5173) reported "running" and the port was listening, but returned empty HTTP replies to both the Browser pane and direct `curl` requests. Root cause not identified (possibly Electron-specific dev setup or an environment/sandboxing quirk unrelated to the code changes). Visual verification for Phase 2 was ultimately done outside this tool session. **Action for future phases:** if the same dev-server connectivity issue recurs, don't spend excessive cycles retrying — do the code-level grep audit, flag the blocker clearly, and let the user verify visually themselves.

### Phase 6 Rollup — Lessons Learned (Tested 2026-08-03)
1. **Recharts theming solved cleanly via CSS custom properties — no JS state needed.** The app's existing Shadcn CSS variables (`--foreground`, `--muted-foreground`, `--border`, `--card`, defined for both `:root` and `.dark` in `index.css`) can be passed directly as inline SVG/style values on Recharts elements: `stroke="hsl(var(--muted-foreground))"` on `XAxis`/`YAxis`, `stroke="hsl(var(--border))"` on `CartesianGrid`, and `contentStyle={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', color: 'hsl(var(--foreground))' }}` on `Tooltip` (plus `wrapperStyle={{ color: 'hsl(var(--foreground))' }}` on `Legend`). Since these resolve as genuine CSS custom properties at render time, they track the active theme automatically. **This is now the standard technique for any future phase with Recharts** (Phase 4's `financial-dashboard/` components use it too, though that phase is currently skipped for conflict-avoidance reasons — revisit this note when it's unblocked).
2. **Custom Pie/chart labels need special handling.** When a Recharts `<Pie>`'s `label` prop is a function returning a plain string, Recharts fills that text using the sector's own inherited color (from its `<Cell fill={...}>`), not a themeable default — so it doesn't automatically match the `hsl(var(--token))` approach used elsewhere. Fix: return a custom SVG `<text>` element from the `label` function instead of a string (Recharts treats an element return as fully custom and skips its own fill logic) — compute position from the `cx`/`cy`/`midAngle`/`outerRadius`/`percent` props Recharts already passes in, and set `fill="hsl(var(--foreground))"` explicitly. Any plain `<div>`-based custom tooltip components (not Recharts' built-in `Tooltip`) should just get ordinary Tailwind `dark:` classes since they're regular DOM, not SVG.
3. **Some pages already lean almost entirely on CSS-variable classes.** `StockReorderReport.jsx` needed only 7 `dark:` additions despite being 321 lines, because it was already built almost entirely with `text-foreground`/`text-muted-foreground`/`bg-card`/`bg-muted`/`border-border` — always check for this pattern before assuming a file's line count predicts its edit volume.
4. **The dev-server verification blocker recurred 3 times in a row this session** (same signature: port reports "running," empty HTTP replies from both the Browser pane and direct `curl`, once also surfacing as a "Policy check in progress" screenshot error) — consistent enough now to treat as a standing environment limitation for this project, not a one-off fluke. Continue following the Phase 2 rule: don't retry more than once or twice, do the grep-based `dark:`/`hsl(var(--` audit, and hand off visual verification to the user.

### Phase 3 Rollup — Lessons Learned (Tested 2026-08-03)
1. **A live, hardcoded third-party API key was found mid-styling-pass — flag and fix immediately, don't just note it and move on.** While applying `dark:` classes to `TechProjectClockInModal.jsx` and `WorkPROViewModal.jsx` (3D), a real WorkPRO/Base44 API key (`835a11119e7d4b84a59f8f7a180b7e61`) was found hardcoded and shipped in the client bundle — used for full read/write access, not scoped/read-only. A repo-wide grep found the same key duplicated across **6 files** total (`TechProjectClockInModal.jsx`, `WorkPROViewModal.jsx`, `WorkPROEditProjectModal.jsx`, `EditProjectDetailsModal.jsx`, `ROInspectionModal.jsx`, `src/pages/WorkPROView.jsx`). Investigation (with the user's direct input) found the underlying WorkPRO tables (`Project`, `ProjectTimeSession`, `UnassignedTime`, `TimeRecord`) already live natively in this same Supabase project — so the fix was to convert all 6 files to `supabase.from(...)` calls (matching the pattern `WorkPROModal.jsx`/`TechClockStatusModal.jsx` already used) rather than build a new proxy. **Action for future phases:** treat any hardcoded credential found incidentally during styling work as an immediate, in-band fix — investigate before proposing a remediation (check for an already-correct sibling file to mirror, check if the "external" data is actually already-native), and don't assume the obvious-looking fix (e.g., "build a new edge-function proxy") is the right one until you've confirmed what the codebase already does for the same data.
2. **A "confirmed already-completed" file from a prior phase's list had a real, unfixed gap — the Section 2 completion list is not fully authoritative.** `WorkOrderTable.jsx` was already marked ✅ in Section 2's original Work Orders list, but its `colorMap` (identical to `WorkOrderList.jsx`'s, which Phase 3E was actively fixing) had **zero** `dark:` classes. Since `WorkOrderTable.jsx` is the *default* work-order list view (cards are opt-in), this was a real, high-impact gap in a file believed done. Found via the Phase 3E plan's own "spot-check for consistency" step — which was written expecting "no edit needed" but turned up a real bug instead. **Action for future phases (especially Phase 8's full audit pass):** don't take a ✅ in Section 2 as proof a file is actually complete — a fast `grep -c 'dark:'` sanity check against the file costs nothing and would have caught this immediately.
3. **Not every "external/unmigrated" entity is actually still needed — some are simply deprecated.** The old Base44 `ProjectComment` and `Inspection` entities (fetched by `WorkPROViewModal.jsx` and `ROInspectionModal.jsx`) have no Supabase table equivalent. Rather than treating that as "not yet migrated" and building a workaround, asked the user directly — confirmed `ProjectComment` is fully deprecated (remove the UI section, don't replace it) and that current inspection data actually lives denormalized on `Project.inspection_results`/`inspection_comments` (a per-project checklist), which `WorkPROModal.jsx` already renders inline. Rebuilt both files to match that already-established pattern instead of inventing a new one. **`ROInspectionModal.jsx` itself turned out to be fully dead code** — its `DocumentEditor.jsx` caller passed the wrong prop (`roNumber` instead of `workOrder`), and no button anywhere ever set its `open` state to `true` — so it was deleted entirely rather than converted. **Action for future phases:** when a component's data source has no native-table equivalent, ask whether the *feature* is still wanted before building a replacement for it — and check whether the component is even reachable from the UI before investing in fixing it.
4. **A field can be renamed *and* reshaped during the Base44→Supabase migration, silently breaking any code that still hard-codes the old field.** The legacy `employee_assigned` (singular, comma-joined string, e.g. `"Jane Doe, John Smith"`) became `employees_assigned` (plural, a real jsonb array) in the native `Project` table. Several files were still reading/writing the old singular field name — confirmed via direct SQL query against live data (not assumption) before touching anything. Fixed with the same array-first/string-fallback pattern already used in the already-migrated `WorkPROModal.jsx` (`Array.isArray(x.employees_assigned) ? x.employees_assigned : (x.employee_assigned ? x.employee_assigned.split(',')... : [])`) in `WorkPROEditProjectModal.jsx`, `WorkPROView.jsx`, `WorkPROViewModal.jsx`, and two purely-cosmetic display fixes in `WorkPROTaskModal.jsx`/`WorkPRODescriptionModal.jsx` (which were displaying "Not assigned" even when employees genuinely were assigned). Similarly, `promised_by` (a form field) maps to the real column `due_date`, confirmed with the user rather than guessed. **Action for future phases:** when a field looks stale (an old English name next to a very-similar new column name), query real production data before writing the fix — don't assume matching field *names* means matching field *shapes*, and don't assume a rename is even correct without confirming with the user or a live sibling file.
5. **Print/paper-preview UI is a real, recurring category that should stay outside the standard dark palette — treat it as a design decision, not a default.** `WorkOrderReport.jsx` renders a simulated printed page (white background, black text, print-style table borders) inside an on-screen preview modal, the same category as `WorkOrderPdfModal.jsx`'s embedded PDF iframe from Phase 3C (which also correctly got no content-level dark styling, only its surrounding modal chrome did). Asked the user directly rather than applying the standard palette by default; confirmed keep the paper white/black in both modes, zero `dark:` classes. **Action for future phases:** any file that renders a "the physical output should look the same regardless of app theme" surface (printable reports, PDF previews, exported documents) should be flagged to the user as a design question before applying `dark:` classes, not assumed to need the standard treatment.
6. **`master_blueprint.md`'s cross-blueprint conflict notes need re-verification at time of use, not just at time of writing — they can go stale in both directions.** Phase 3's original skip reason (this blueprint) cited the other Base44-deprecation blueprint's Phase 13 as `[In Progress]`; by the time this phase actually ran, that blueprint's own status line still said "13D... and 13E... not started" in one summary table while `phase_13_implementation_plan.md`'s own status line showed both already `[Tested]` — a stale table cell, not a real conflict. Re-checking directly against the *other* blueprint's own detailed implementation-plan file (not just its summary table) resolved this in under a minute. The same re-check was applied to Phase 4 (confirmed still genuinely blocked — Phase 10 is confirmed `[Up Next]`, not stale) and Phase 5 (confirmed 13D/13E-related risk is now resolved for 4 of its 6 files, but `CreditInvoice.jsx` is explicitly still unmigrated and base44-routed per that blueprint's own notes — a partial, not full, unblock). **Action for future phases:** never trust a "skipped due to conflict" note at face value when it's time to revisit that phase — re-check the *other* blueprint's own detailed status directly, and expect it to have moved (in either direction) since the note was written.

### Phase 4 Rollup — Lessons Learned (Tested, pending Phase 8D visual verification)
*Condensed from `phase_4_implementation_plan.md` Section 4. Executed once the other blueprint's Phase 10 was confirmed unblocked.*
1. **All 32 files across sub-phases 4A–4D done.** 4A (GL & Accounting Core, 10 files: 2 pure-Shadcn forms verify-only, 8 got full passes), 4B (Banking & Reconciliation, 9 files, including the path-corrected `cash-drawer/DepositDetailsModal.jsx` — the originally-scoped `bank/DepositDetailsModal.jsx` is empty/dead), 4C (Cash Flow, 7 files, 1 pure-Shadcn form verify-only), 4D (Financial Dashboard Reports, 6 files, 4 with Recharts theming).
2. **Real bug found and fixed, not just a styling gap: `Bank.jsx` and `ReconcileReport.jsx` both print via a reused-on-screen-DOM pattern with no color-reset override**, unlike their sibling report pages from 4A which all had one. Since `.dark` stays on `<html>` during a print job, this would have made printed bank statements/reconciliation reports render dark-background/light-text — fixed by adding the missing print-safety reset before adding any `dark:` classes. **This revises Lesson 10** (Section 7 above): a `@media print` block's mere presence isn't proof of safety — always verify it actually contains a color reset. (Directly informs Phase 8A's own repeated application of the same check across `CustomerARSummary.jsx`, `FinancialDashboard.jsx`, `InventoryReturns.jsx`, `CustomerARTransactions.jsx`.)
3. **The Recharts `hsl(var(--token))` theming technique is now proven across every chart type in the codebase** (Pie, Line, ComposedChart/Bar) with zero deviations across 6 total files spanning Phases 6 and 4 — treat as a fully settled pattern.
4. **The "color decided in a JS helper, not inline JSX" pattern has two shapes**: object-map (`accountTypeColors` in `ChartOfAccounts.jsx`/`GeneralLedger.jsx`/`GLAcct.jsx`) and function (`getRowBgColor`/`getDueInfo` in `CashFlowTable.jsx`/`OverheadTable.jsx`) — check for both when auditing any file, not just object literals. (This exact pattern recurred in Phase 8A's `WorkOrders.jsx` — see that rollup below.)

### Phase 5 Rollup — Lessons Learned (Tested, pending Phase 8D visual verification)
*Condensed from `phase_5_implementation_plan.md` Section 3 (its own Section 5 results were never written up — verified directly against live file `dark:` counts instead: `WorkPROView.jsx` 97, `CreditInvoice.jsx` 17, both consistent with full completion; the 3 verify-only files correctly show 0). Executed once the other blueprint's Phase 13D/13E were confirmed `[Tested]`.*
1. **All 6 files done.** 3 verify-only (`NewCustomerModal.jsx`, `NewVehicleModal.jsx`, `VehicleHistoryFilters.jsx` — pure composition wrappers, 0 `dark:` correctly expected), `WorkOrderView.jsx` (2-instance gap audit — bare `Loader2`/`AlertTriangle` icon colors), `WorkPROView.jsx` (from-scratch, largest task — status badge/button color maps, header/footer, oil-change card, inspection-results table mirrored from the already-converted `WorkPROViewModal.jsx`/`WorkPROModal.jsx`), `CreditInvoice.jsx` (from-scratch but small real surface area — the ~500 lines of business logic are untouched; only the error state, header, 2 buttons' hardcoded `bg-white` override, and 3 info cards needed styling).
2. **A documentation-only gap, not an execution gap:** this phase's own plan file was never updated with a written results narrative after execution, and `master_blueprint.md` itself still showed Phase 5 as `[Skipped]` until this Phase 8B rollup — but the actual code was fully done. **Confirms Lesson 6 above** (a "done"/"not done" claim in a planning doc is not authoritative on its own) applies to plan-doc staleness in either direction, not just Section 2's completion list — always verify against live file state (`grep -c 'dark:'`) before trusting any status claim, including this blueprint's own.

### Phase 7 Rollup — Lessons Learned (Tested, pending Phase 8D visual verification)
*Condensed from `phase_7_implementation_plan.md` Sections 5 and 9.*
1. **Original 6-file scope executed exactly as planned**: `dark:` classes added to `PageNotFound.jsx`, `DevLogin.jsx`, `LinesOfCredit.jsx`; `APSummary.jsx` reconfirmed a pure 5-line composition wrapper, no edit. `src/pages/CustomerHistory.jsx` and `src/pages/VehicleHistory.jsx` (originally scoped) were found dead/unrouted and not edited.
2. **Extension (same blueprint, later session): closed out Phase 6's 3 carried-forward files** (`TechnicianPerformanceReportModal.jsx`, `ReportableLeviesReport.jsx`, `InventoryAdd.jsx` — the largest file in this phase) once their cited conflicts with the other blueprint's Phase 10 were directly re-verified against the live files (not the other team's planning doc, which was found self-contradictory on 10E's own status — trust the file, not the note). One real bug fixed: `InventoryAdd.jsx` had a bare `text-black` validation-warning icon that would have rendered invisible on a dark background.
3. **`ReportableLeviesReport.jsx`'s print output (`handlePrint()`, a raw HTML string in a native `window.open()` tab) stays outside the dark palette by design** — same category as `WorkOrderReport.jsx` (Phase 3E), entirely outside the app's React/theme tree, deliberately left unstyled.
4. **This phase directly caused Phase 8's 8A restructure**: its own rollup note flagged that `master_blueprint.md`'s Section 2/roadmap had drifted out of sync with actual completed work (Phase 7 shown `[Pending]` while done in the codebase) — the same discovery that led to auditing the "Pages (Partial)" line in Section 2, which turned up the 12 never-assigned files that became Phase 8A.

### Phase 8 Rollup — Sub-phase 8A (Complete, pending Phase 8D visual verification)
*Condensed from `phase_8_implementation_plan.md` Section 4 sub-phase 8A results. Will be extended with 8C/8D/8E findings at final closeout (Section 5 of this document, sub-phase 8E).*
1. **All 12 previously-unassigned "Partial" pages completed.** 3 needed no changes at all once actually read in full (`Vehicles.jsx`, `InvoiceConversion.jsx`, `InventoryList.jsx` — all already thorough despite a misleadingly low raw `dark:` count), 1 was composition-only (`Schedule.jsx`), 1 was a re-verify-only carry-over from Phase 7 (`WorkOrderView.jsx`, held with no drift), and 6 got real fixes (`CustomerARSummary.jsx`, `Customers.jsx`, `FinancialDashboard.jsx`, `InventoryReturns.jsx`, `CustomerARTransactions.jsx`, `CashDrawer.jsx`). `WorkOrders.jsx` (the largest file in the entire blueprint) needed the most substantial work, matching its own plan's prediction.
2. **Confirms Phase 4's revised Lesson 10 (print-safety) generalizes beyond financial pages**: the same dangerous visibility-only `@media print` pattern (no color-reset) was found and fixed in `CustomerARSummary.jsx`, `FinancialDashboard.jsx`, and `InventoryReturns.jsx`. `InventoryList.jsx` was the inverse case — a positive control confirming its own local print CSS was already fully safe (explicit `color: #000` forced regardless of `dark:` classes present).
3. **New finding for 8C: a *global* print-safety gap.** `CustomerARTransactions.jsx` uses the shared `.no-print`/`.print-only` mechanism (defined once in `src/index.css`, used by 41 files across the codebase) rather than a local `@media print` block — and that global rule only forces `body { background: white !important; }`, never resetting nested `dark:bg-*`/`dark:text-*` classes on Cards/tables. Fixed locally for just this file (scoped `<style>` override) rather than patching the shared global rule, since most of the other 40 consumers are unaudited by this blueprint and a blanket fix risks breaking a solid dark badge elsewhere that's meant to stay visible in print. **Flagged as a required target for 8C's Sweep 4.**
4. **Confirms the Phase 4C/4D "color decided in a JS helper" pattern recurs at scale**: `WorkOrders.jsx` had 3 separate color-map helper functions (`getStatusIcon`, `getStatusBadge`, `getStatusColorClasses`) with zero `dark:` pairing, one of them sitting directly next to a hand-coded block using the identical visual pattern with full, correct pairing — used as the exact reference for the fix. Confirms this "helper function returns unpaired Tailwind classes" shape is now recurring across enough phases (4A, 4C, 8A) to check for explicitly in 8C's automated sweep, not just discover opportunistically.

### Phase 8 Rollup — Sub-phase 8F (Complete, pending Phase 8D visual verification)
*Condensed from `phase_8_implementation_plan.md` Section 4 sub-phase 8F results.*
1. **All 40 files found by 8C's Sweep 1 (never previously assigned to any phase) completed**, using the same full-read → gap-audit-or-full-pass → print-safety-check → grep-audit methodology as 8A. Almost all were genuinely from-scratch (0 pre-existing `dark:` coverage, matching Sweep 1's finding) rather than gap-audits, unlike 8A where several files turned out closer to done than their raw count suggested.
2. **The mandatory print-safety check (deferred from 8C Sweep 4) came due on `IssuedChequesTable.jsx`**: its local `@media print` block used the dangerous reused-DOM visibility-toggle pattern with no color-reset. Fixed with an explicit `.print-area, .print-area * { color: #000 !important; background: none !important; }` reset before any `dark:` classes were added — same fix shape as `CustomerARSummary.jsx`/`FinancialDashboard.jsx`/`InventoryReturns.jsx` in 8A and `LinesOfCredit.jsx`/`APSummaryTable.jsx`/`StockReorderReport.jsx` in 8C. `LOCReconciliationModal.jsx` (also deferred from Sweep 4) turned out **not** to need a fix on inspection — its print block is embedded inside a `window.open()`-generated HTML string (Safe Pattern A), not a reused-DOM risk as originally assumed.
3. **The `NoteColorPicker.jsx` hardcoded `PopoverContent` `bg-white`** flagged in 8C Sweep 6 was fixed as part of this sub-phase's own pass over that file.
4. **Two "merge" modals share an identical card-rendering pattern**: `MergeInventoryModal.jsx`'s `renderItemCard` (8F, this sub-phase) and `MergeCustomerModal.jsx`'s `renderCustomerCard` (also 8F) — both master/duplicate color-coded card layouts, styled identically. Worth using as a direct reference pair if any future "merge X" modal is added to the app.
5. **Confirms a boundary case for the "additive-only" rule**: `NoteColorPicker.jsx`'s note-color swatches (literal `bg-white`/`bg-blue-100`/`bg-green-100`/etc., representing the actual selectable note colors a user picks) were deliberately left unpaired with `dark:` — these are content values the user is choosing, not UI chrome describing the app's own light/dark state, so pairing them would be incorrect (a "blue" note swatch shouldn't change color depending on the app's theme). Distinguishes this from every other `bg-*`/`text-*` instance fixed across the whole blueprint, which are all UI chrome.
