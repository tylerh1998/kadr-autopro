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

**Suppliers & AP (Phase 1 — Tested):** Suppliers.jsx ✅ | SupplierTx.jsx ✅ | SupplierTxView.jsx ✅ | LankarImport.jsx ✅ | LankarWOView.jsx ✅ | ChequeWriter.jsx ✅ | ChequeRegister.jsx ✅ | AddToSheetModal.jsx ✅ | APSummaryTable.jsx ✅ | GLAccountCombobox.jsx ✅ | LineEditModal.jsx ✅ | SupplierCombobox.jsx ✅ | SupplierForm.jsx ✅ | SupplierPaymentModal.jsx ✅ | SupplierTxInvoiceLinesTab.jsx ✅ | SupplierTxInvoiceSummaryTab.jsx ✅ | SupplierTxModals.jsx ✅ (pure composition wrapper, no markup of its own) | SupplierTxPaymentHistoryTab.jsx ✅

**Payroll, Taxes, Admin, Setup, Email (Phase 2 — Tested):** Payroll.jsx ✅ | Taxes.jsx ✅ | Admin.jsx ✅ | Setup.jsx ✅ | EmailLog.jsx ✅ | AddAdjustmentModal.jsx ✅ | AddPaychequeModal.jsx ✅ | AddRemittanceModal.jsx ✅ | EmployeeDetailsForm.jsx ✅ (pure Shadcn form, no raw colors, no changes needed) | payroll/MarkPaidModal.jsx ✅ | PayrollEmployeeForm.jsx ✅ (pure Shadcn form, no raw colors, no changes needed) | PayrollGLAccountCombobox.jsx ✅ | PreviousPaychequesModal.jsx ✅ | taxes/MarkPaidModal.jsx ✅

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
Phase 1 [Tested] ──► Phase 2 [Tested] ──► Phase 3 [Skipped] ──► Phase 4 [Skipped] ──► Phase 5 [Skipped] ──► Phase 6
                                                                                                                  │
                                                                                                                  ▼
                                                                                        Phase 7 ──► Phase 8
```

**Note:** Phases 3, 4, and 5 are skipped for now (see their sections below) due to active concurrent work by another agent on the same files — see `Plans and Context/master_blueprint.md` (a separate, much larger Base44-deprecation migration blueprint being executed in parallel). Phase 3 (Work Orders remaining modals) directly overlaps with that blueprint's **Phase 13 "Work Orders Core"** (`DocumentEditor.jsx` and friends — status `[In Progress]`, flagged there as "highest blast radius"). Phase 4 (Financial pages: GL, Bank, Reconcile, P&L, Balance Sheet) directly overlaps with that blueprint's **Phase 10 "Accounting, GL Reporting, Taxes & Fiscal Periods"** (status `[Pending]`, next up for that agent). Phase 5 (Customers, Vehicles, Appointments Gaps) includes `WorkOrderView.jsx` and `CreditInvoice.jsx`, both confirmed inside that blueprint's Phase 13D/13E (not started, but scoped). Revisit all three once the other blueprint's Phase 13 and Phase 10 are marked `[Tested]`. **Phase 6 was also spot-checked against the other blueprint** — 3 of its 12 files (`ReportableLeviesReport.jsx`, `TechnicianPerformanceReportModal.jsx`, `InventoryAdd.jsx`) have confirmed active/planned touch points in that blueprint's Phase 10 and were excluded from Phase 6's scope below; the remaining 9 files showed no overlap and proceed as planned.

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

### Phase 3 — Work Orders: Remaining Modals [Skipped — Conflict Avoidance]

**Skip reason (2026-08-03):** All 28 files below live under `src/components/work-orders/`, which is the exact scope of the concurrently-running Base44-deprecation blueprint's **Phase 13 "Work Orders Core"** (`Plans and Context/phase_13_implementation_plan.md`, status `[In Progress]` — sub-phases 13D "Documents & Communications" and 13E "final sweep" not yet started, and explicitly touch several of these same files, e.g. `WorkOrderPdfModal.jsx`/`SESEmailModal.jsx` via `WorkOrderView.jsx`). Editing these files now risks merge conflicts with that agent's active/upcoming work. **Revisit once that blueprint's Phase 13 is marked `[Tested]`.**

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

### Phase 4 — Financial Pages & Components [Skipped — Conflict Avoidance]

**Skip reason (2026-08-03):** These GL/Bank/Reconcile/P&L/Balance Sheet files directly overlap with the concurrently-running Base44-deprecation blueprint's **Phase 10 "Accounting, GL Reporting, Taxes & Fiscal Periods"** (`Plans and Context/master_blueprint.md`, status `[Pending]` — next up for that agent after Phase 9). Editing these files now risks merge conflicts with that agent's upcoming work. **Revisit once that blueprint's Phase 10 is marked `[Tested]`.**

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

### Phase 5 — Customers, Vehicles, Appointments Gaps [Skipped — Conflict Avoidance]

**Skip reason (2026-08-03):** 2 of the 6 files (`WorkOrderView.jsx`, `CreditInvoice.jsx`) are confirmed inside the concurrently-running Base44-deprecation blueprint's **Phase 13D/13E** (`Plans and Context/phase_13_implementation_plan.md` — "Documents & Communications" / "final sweep", not started yet but explicitly scoped, e.g. `WorkOrderView.jsx` hosts the `WorkOrderPdfModal`/`SESEmailModal` components that 13D converts). Rather than split the phase and risk a confusing partial-completion state, the whole phase is deferred. **Revisit once that blueprint's Phase 13 is marked `[Tested]`.**

**TL;DR:** Fill in remaining gaps in modules that were partially dark-mode converted.

**Impacted Files:**
- `src/components/customers/NewCustomerModal.jsx`
- `src/components/vehicles/NewVehicleModal.jsx`
- `src/components/vehicles/VehicleHistoryFilters.jsx`
- `src/pages/WorkOrderView.jsx` (gap audit) — **conflict: in other blueprint's Phase 13D/13E scope**
- `src/pages/WorkPROView.jsx`
- `src/pages/CreditInvoice.jsx` — **conflict: in other blueprint's Phase 13D/13E scope**

---

### Phase 6 — Inventory & Reports [Pending]

**TL;DR:** Inventory pages are data-dense with large tables, filters, and many action modals. The reports module powers printable views and dashboard sub-panels. Deferred to Phase 6 as reports are nip-and-tuck with the broader financial work.

**Conflict check (2026-08-03):** Spot-checked all 12 files against the concurrently-running Base44-deprecation blueprint. 3 excluded from this phase's scope due to confirmed active/planned touch points in that blueprint's **Phase 10** (`Plans and Context/phase_10_implementation_plan.md`, status `[Pending]`):
- `src/pages/InventoryAdd.jsx` — listed as a `checkFiscalPeriodStatus()` caller needing regression-confirmation in their Phase 10A test pass.
- `src/components/reports/ReportableLeviesReport.jsx` — scheduled to have its `syncLevies`/`postLeviesToAP` invokes repointed as part of their Phase 10.
- `src/components/reports/TechnicianPerformanceReportModal.jsx` — scheduled to have its payroll-target progress bar restored/unhidden as part of their Phase 10.

These 3 files are carried forward to a later dark-mode phase (revisit once the other blueprint's Phase 10 is `[Tested]`). The remaining 9 files below showed no overlap and proceed as originally scoped.

**Impacted Files:**

*Pages:*
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

### Phase 1 Rollup — Lessons Learned (Tested 2026-08-03)
1. **Composition-only components need no direct `dark:` classes.** `SupplierTxModals.jsx` renders zero markup of its own — it only wires together already-converted child modals (`LineEditModal`, `EditInventoryTransactionModal`, `SupplierPaymentModal`). Files like this should be excluded from per-file dark-mode class counts; verify by checking whether the file returns raw JSX elements vs. only composed child components.
2. **Verification method that worked:** grep each target file for `dark:` occurrence count post-edit as a fast sanity check before manual UI verification — a 0-count on a file with real markup is a red flag, a 0-count on a pure composer is expected and fine.
3. **Table-heavy supplier/AP pages needed the most `dark:` classes** (`SupplierTxView.jsx` ~45, `LankarImport.jsx` ~25) — consistent with the risk table's prediction that table row striping/headers are the highest-touch surface area. Expect similarly high class counts in Phase 4 (GL/Bank/Reconcile), which is also table-dense.
4. **No light-mode regressions or logic changes were introduced** — confirms the additive `dark:` class strategy (Section 7 Architecture Rule 3) is sufficient and should remain the approach for all remaining phases.

### Phase 2 Rollup — Lessons Learned (Tested 2026-08-03)
1. **New architecture gotcha found: hardcoded `bg-white`/`bg-slate-50` overrides on Shadcn primitives silently break dark mode.** Several components pass a className like `bg-white` or `bg-slate-50` directly onto a Shadcn `Input`, `Button`, or `SelectTrigger`. Those primitives already default to `bg-transparent` (Input) or `bg-card`/CSS-variable-driven backgrounds (Button outline variant, SelectTrigger) which are dark-safe on their own — but a hardcoded override className defeats that and forces a light background in dark mode regardless of theme. Found and fixed in `Setup.jsx`, `Taxes.jsx`, `Payroll.jsx`, `AddPaychequeModal.jsx`, and `PayrollGLAccountCombobox.jsx`. **Action for future phases:** whenever a Shadcn primitive has a custom `className` with a `bg-*` value, check the primitive's own source (`src/components/ui/`) to see if it's overriding an already-dark-safe default — if so, add an explicit `dark:` pair rather than assuming the primitive handles it.
2. **`slate-*` shades used for light-mode text are not automatically dark-safe, but "muted" ones often are.** Confirms the Phase 1 rollup observation: `text-slate-600/700/900` and `bg-slate-50/100` need distinct `dark:` pairs. However `text-slate-400`/`text-slate-500` used for already-muted/secondary text frequently matches the Section 7 dark palette's own muted-text value, so it's sometimes (not always) safe to leave unchanged — verify per-instance rather than assuming either way.
3. **Pure Shadcn-component forms need zero edits.** `EmployeeDetailsForm.jsx` and `PayrollEmployeeForm.jsx` had 0 raw color classes — entirely composed of `Dialog`/`Input`/`Label`/`Select`/`Checkbox` with no custom `div`/`span` styling. Grep for `dark:` count of 0 on a file is not automatically a red flag — first check whether the file has any raw JSX markup with hardcoded colors at all before treating a 0-count as missed work.
4. **Dev server preview verification was blocked in-session** — the local Vite dev server (`kadr-autopro-dev`, port 5173) reported "running" and the port was listening, but returned empty HTTP replies to both the Browser pane and direct `curl` requests. Root cause not identified (possibly Electron-specific dev setup or an environment/sandboxing quirk unrelated to the code changes). Visual verification for Phase 2 was ultimately done outside this tool session. **Action for future phases:** if the same dev-server connectivity issue recurs, don't spend excessive cycles retrying — do the code-level grep audit, flag the blocker clearly, and let the user verify visually themselves.
