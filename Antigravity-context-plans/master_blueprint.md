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

**Pages (Partial):** CashDrawer.jsx | CustomerARSummary.jsx | CustomerARTransactions.jsx | Customers.jsx | FinancialDashboard.jsx | InventoryList.jsx | InventoryReturns.jsx | InvoiceConversion.jsx | Schedule.jsx | Vehicles.jsx | WorkOrders.jsx | WorkOrderView.jsx

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
Phase 1 ──► Phase 2 ──► Phase 3
                            │
                            ▼
                        Phase 4 ──► Phase 5 ──► Phase 6 ──► Phase 7 ──► Phase 8
```

---

### Phase 1 — Supplier & AP Pages [Pending]

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

### Phase 2 — Payroll, Taxes, Admin, Setup, Email [Pending]

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

### Phase 3 — Work Orders: Remaining Modals [Pending]

**TL;DR:** Several work order modals identified in the audit are entirely missing dark mode. These are frequently used in daily operations.

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

### Phase 4 — Financial Pages & Components [Pending]

**TL;DR:** The accounting backbone of the app. GL, Bank, Cash Flow, Reconcile, P&L, Balance Sheet all render white/light. Deferred to Phase 4 to avoid conflicts with another agent working this area.

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

### Phase 5 — Customers, Vehicles, Appointments Gaps [Pending]

**TL;DR:** Fill in remaining gaps in modules that were partially dark-mode converted.

**Impacted Files:**
- `src/components/customers/NewCustomerModal.jsx`
- `src/components/vehicles/NewVehicleModal.jsx`
- `src/components/vehicles/VehicleHistoryFilters.jsx`
- `src/pages/WorkOrderView.jsx` (gap audit)
- `src/pages/WorkPROView.jsx`
- `src/pages/CreditInvoice.jsx`

---

### Phase 6 — Inventory & Reports [Pending]

**TL;DR:** Inventory pages are data-dense with large tables, filters, and many action modals. The reports module powers printable views and dashboard sub-panels. Deferred to Phase 6 as reports are nip-and-tuck with the broader financial work.

**Impacted Files:**

*Pages:*
- `src/pages/InventoryAdd.jsx`
- `src/pages/InventoryValuation.jsx`
- `src/pages/StockReorderReport.jsx`

*Components:*
- `src/components/reports/CustomerReportModal.jsx`
- `src/components/reports/InventoryOnOrder.jsx`
- `src/components/reports/OtherChargesBreakdownReport.jsx`
- `src/components/reports/PartsMovementReportModal.jsx`
- `src/components/reports/ReportableLeviesReport.jsx`
- `src/components/reports/ReportModal.jsx`
- `src/components/reports/SalesAnalysisReport.jsx`
- `src/components/reports/TechnicianPerformanceReportModal.jsx`
- `src/components/reports/WorkOrderSummaryReport.jsx`

---

### Phase 7 — Miscellaneous Pages [Pending]

**TL;DR:** Remaining pages with zero dark mode coverage.

**Impacted Files:**
- `src/pages/APSummary.jsx`
- `src/pages/LinesOfCredit.jsx`
- `src/pages/CustomerHistory.jsx`
- `src/pages/VehicleHistory.jsx`
- `src/lib/PageNotFound.jsx`
- `src/lib/DevLogin.jsx`

---

### Phase 8 — Full Audit Pass & Regression Testing [Pending]

**TL;DR:** Final sweep to catch overlooked elements — popovers, comboboxes, tooltips, toasts, and print output.

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
- `Project`, `Appointment`, `Employee`, `Customer`, `Vehicle`, `ProjectTimeSession`, `ProjectComment` are native Supabase tables, not Base44 entities.
- Any component still using `base44.functions.invoke()` or legacy entity SDK methods is broken and must be migrated to `supabase.from('TableName')`.
- **This is separate from dark mode** — do not mix proxy migration with dark mode changes during this blueprint.

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
