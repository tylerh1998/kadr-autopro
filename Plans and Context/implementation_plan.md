# Implementation Plan: Cross-Phase Base44 Residue Cleanup (Phase 14 Appendix Handoff)

**Status:** Pending your approval — no code changes made yet.
**Parent:** `master_blueprint.md` (Base44 Deprecation initiative) — this plan executes the standalone handoff package documented in `phase_14_implementation_plan.md`'s Appendix ("Cross-Phase Base44 Residue"), explicitly scoped as **outside** Phase 14's own file ownership. It converges with Phase 14 only at Phase 14G's repo-wide grep check, and gates the eventual Phase 15 (Final Sunset — `@base44/sdk`/`base44-proxy`/`base44/` tree removal), which cannot start until every remaining `base44.*` call site in `src/` is gone, including this list.
**Supabase project refs:** dev branch `sitihbdnuxifwibontcm` (verify all changes here first); production `hbcrwkmgsazqrvsrmxyr` (deploy second, after dev verification).

> **LIVE DOCUMENT.** This is the single rotating plan for this initiative — update it in place as each phase executes/verifies. Don't wipe prior sections; append/annotate. When a phase finishes, flip its status header and roll its `Working Area` content into `Previously Completed`, then promote the next phase into `Working Area`.

---

## 1) Context & Lessons Learned

**Core goal:** 23 files across the codebase still hold real, live, unmigrated `base44.*` dependencies — leftovers from Phase 4, 5, 7, 8, 9, 12, and 13, none of which are currently owned by any active phase. This plan finishes cutting every one of those threads to native Supabase, so that Phase 15 (Final Sunset — deleting `@base44/sdk`, `base44-proxy`, and the `base44/` source tree) has a truly clean repo to work from. This is a plumbing migration, not a feature project — **no visible behavior change for end users** is the goal, aside from one deliberate judgment call flagged below (NavigationTracker's activity logging).

**Re-verification performed before writing this plan (2026-08-05):** every one of the 23 files plus the 4 "confirmed dead code" files was read in full — not just grepped — to confirm the block type and pin down the exact current call sites. Several turned out simpler than the Phase 14 appendix's summary suggested once read in full; those simplifications are called out below because they change the actual work, not just the description:

- **`MergeInventoryModal.jsx`'s `searchInventory` shim does *not* need a new Edge Function.** [`src/lib/inventorySearch.js`](../src/lib/inventorySearch.js) already exists as a fully-native wrapper around the `search_inventory_ranked` RPC — confirmed live on dev (`pg_proc` check) — and is already used by `InventoryReturns.jsx` for the exact same purpose. This is a drop-in import swap, zero backend work.
- **`CustomerWorkOrderHistoryModal.jsx`, `VehicleHistoryModal.jsx`, and `VehicleDetails.jsx`'s history-lookup shims (`getCustomerWorkOrderHistory`/`getVehicleWorkOrderHistory`) are thin RPC passthroughs, not real business logic.** Read the legacy `base44/functions/*/entry.ts` sources in full: both do nothing but call `supabase.rpc('get_customer_work_order_history', ...)` / `supabase.rpc('get_vehicle_work_order_history', ...)` after an auth check. Both RPCs are confirmed live on dev (`pg_proc` check, 2026-08-05). Per the project's own migration policy ("thin proxies / simple lookups → migrate directly to `supabase.from()`/RPC calls, no intermediate function needed"), these become **direct `supabase.rpc()` calls from the frontend**, not new Edge Functions.
- **`PaymentSelectionModal.jsx`'s `getWorkOrderRoNumber` shim is a single-row `SELECT`** (`WorkOrder.ro_number` by id) — direct `supabase.from('WorkOrder').select('ro_number').eq('id', ...)`, no function needed.
- **`WarrantyReturnModal.jsx`'s `searchSuppliers` shim is only ever called with an empty search term** (`searchSuppliers({ searchTerm: '' })`, the only call site in the file) — the legacy function's fuzzy-scoring branch is dead code from this call site's perspective. Direct `supabase.from('Supplier').select('*')` + the same client-side `pin_to_top`-then-name sort already used identically in `ChangeSupplierModal.jsx` reproduces the actual behavior exercised.
- **`InventoryEditModal.jsx` imports `InventoryItem` from `@/entities/all` but never references it anywhere in the file** (grep-confirmed) — drop that half of the import while converting the `InventoryCategory` half.
- **`InventoryAdjustQOHModal.jsx`'s dead `base44` import is still present** (line 2), confirmed via direct grep — the appendix's claim holds, one-line delete.
- **`CreditInvoice.jsx` is the one genuinely complex item in this batch.** It's a real GL-posting flow (`handleCreditInvoiceGL`, read in full — 350+ lines of debit/credit branching across up to 9 GL account types) plus a real `WorkOrder` creation step (a new credit-invoice-stage `WorkOrder` row) plus 5 `SupabaseProxy` CRUD calls. This needs a proper native Edge Function port (`autopro-handleCreditInvoiceGL`), following the "complex functions get a 1:1 native port" half of the migration policy — everything else in this batch is thin-proxy territory.
- **Live schema checks (dev branch, 2026-08-05) confirm exact ID formats needed for the new/rewritten insert paths** — don't assume, per standing project convention (`master_context.md` §3): `WorkOrder.id` and `Customer.id` are both 24-char lowercase hex (confirmed via live `SELECT ... length(id)`, both dev). `GLTransaction.id` is also 24-char hex (confirmed live — consistent with the legacy `handleCreditInvoiceGL` source's own id-generation call, `crypto.randomUUID().replace(/-/g,'').substring(0,24)`). `CustomerPayments.id` is a **standard 36-char UUID, unmodified** (confirmed live — do not truncate this one). `SalesClass.id` is `text` with no working default, same as every other legacy-origin table — needs a client-generated id on create.
- **`WorkOrder.line_items`/`payments`/`accounting_details` are confirmed genuine `jsonb`** (live `information_schema` check). `CreditInvoice.jsx`'s current base44-routed code `JSON.stringify()`s all three before writing — a pattern that only worked because the base44 `SupabaseProxy` shim expected strings. When these writes move to direct `supabase.from()`, the `JSON.stringify()` calls must be **removed**, not preserved — writing a JSON string into a `jsonb` column double-encodes it (the exact bug class flagged in `master_context.md` §3's "recurring traps" section). This is a real fix riding along with the migration, not a style change.
- **NavigationTracker.jsx's `base44.appLogs.logUserInApp(pageName)` has zero readers anywhere in `src/`** (grep-confirmed, one match: the write site itself). Nothing in this codebase displays or queries this activity log — the only plausible reason to keep it would be if you separately view it in the Base44 platform's own dashboard, independent of this codebase. **Recommended default: deprecate (delete the call), don't port** — consistent with how Phase 14 already deprecated Setup's backup/restore and Admin's database tool once their consumer was gone. Flagged explicitly in this phase's Working Area below — tell me if you actually use the Base44 activity log dashboard and want this preserved (would need a lightweight native `UserActivityLog` table + insert instead).
- **One bonus item not in your list but in the same Appendix bucket:** `src/Layout.jsx` line 849 has a hardcoded `https://registry-pos-tracker-b5793593.base44.app/` external link (not an API call — just a URL string, part of the same "confirmed dead code, cosmetic only" bucket as your 3 files). Folding it into Phase A below since it's the same one-line-delete-or-leave category and touches a file already in scope elsewhere in this codebase; skip it if you'd rather leave that link alone.

**Inherited standing rules (from `master_context.md` / `master_blueprint.md`, still true here):**
- New Edge Functions are named `autopro-[functionname]`.
- Edge Functions return HTTP 200 with `{ error }` on failure, never a raw 4xx/5xx (the Supabase JS client swallows the JSON body on non-2xx).
- Every native insert into a legacy-origin table needs a client-generated id — verify the specific table's live format first (done above for every table this plan touches).
- Direct `supabase.from()` migrations of a still-Base44-routed table need a reviewed RLS policy — not applicable here, every table this plan touches is already confirmed native with existing permissive RLS (Customer, Vehicle, WorkOrder, Supplier, InventoryItem, InventoryCategory, InventoryReturn, SalesClass, GLTransaction, CustomerPayments, TagAlong).
- `Promise.all` batching a still-legacy call with a native call can poison the whole result set on a single 401 — check for this shape while touching `InventoryTransactionsModal.jsx` (its `loadData` already batches 2 `SupabaseProxy` calls with 1 native `supabase.from()` call in one `Promise.all` — becomes moot once all 3 are native, but worth a clean look).
- I do not commit or push git changes — you do that via GitHub Desktop, per your standing preference. I also do not run this repo's Supabase migrations against production without your review of the dev-verified result first.

---

## 2) Previously Completed

*(This section is a historical snapshot from `master_blueprint.md`/`phase_14_implementation_plan.md`, included for context — it does not change as this plan's own phases execute.)*

- Phases 1–13 of the Base44 Deprecation blueprint are complete and `[Tested]`: dev/prod environment parity, PartsTech removal, Auth centralization, WorkPRO rewire, Customer/Vehicle/GL transport cleanup, Reports, Inventory, Banking, AP/Suppliers/LOC, Accounting/GL/Tax/Fiscal Periods, Payroll, Appointment, and Work Orders Core (`DocumentEditor.jsx`).
- Phase 14 (Setup, Admin, Lankar Import) is in progress in parallel, covering its own separate file scope (`Setup.jsx`, `Admin.jsx`, `LankarImport.jsx`, the AR-cluster remainder, `LegacyWorkOrderImportModal.jsx`) and closing with a verification-only step (14G) — **not this plan's files**.
- Phase 14's own research pass (2026-08-05) produced the Appendix this plan executes, having confirmed each of the 23 files' block type by direct content read, not just grep.
- Phase 15 (Final Sunset: `@base44/sdk`, `base44-proxy`, `base44/` tree removal) is planned but not yet started, gated on every remaining `base44.*` call site being gone — including this plan's scope.

---

## 3) Risk Assessment

| # | Risk | Phase(s) | Impact | Likelihood | Mitigation |
|---|---|---|---|---|---|
| 1 | GL posting logic in the new `autopro-handleCreditInvoiceGL` port introduces a debit/credit imbalance not present in the legacy function (9 possible GL entry types, several sign-sensitive) | E | **Critical** | Medium — real risk on any GL rewrite | Port line-for-line from the read-in-full legacy source (documented exactly in Working Area once Phase E is current); curl-verify against a real throwaway credit invoice on dev; diff resulting GL rows debit-sum vs credit-sum before deploying to production. Never modify the two permanently-protected functions (`autopro-handleInvoiceConversionGL`/`autopro-handleSupplierInvoiceLineGL`) — this is a third, independent GL entry point, consistent with the project's existing multi-entry-point GL pattern. |
| 2 | `jsonb` double-encoding regression: removing `JSON.stringify()` calls in `CreditInvoice.jsx` incompletely (missing one of `line_items`/`payments`/`accounting_details`) | E | High | Medium — 3 separate call sites in one function, easy to miss one | Explicit per-field checklist in Working Area; live-verify by reading back the created credit-invoice `WorkOrder` row via the Supabase connector and confirming `line_items` is a real array, not a string, after the write. |
| 3 | Wrong ID format on a new insert (e.g. truncating `CustomerPayments.id` to 24 chars, or leaving `WorkOrder.id`/`SalesClass.id` empty and relying on a nonexistent DB default) silently creates a broken/duplicate-colliding row | B, C, E | High | Low — now mitigated by the live schema checks already performed in this plan (§1) | Formats are already pinned per-table above; each phase's Working Area section restates the exact id-generation line for every new insert it introduces. |
| 4 | `SalesClassManager.jsx`-style bulk `SupabaseProxy` "update with `ids` array" pattern (used by `StockReorderReport.jsx`'s "Remove as Stocked Item") translated incorrectly to `supabase.from().update()`, silently updating zero rows or the wrong rows | C | Medium | Low | Use `.in('id', Array.from(selectedItems))` explicitly, not `.eq()`; verify row count matches selection count in the response before showing a success message. |
| 5 | Regression in a still-working feature during a "mechanical" entity-import swap (e.g. `WorkOrder.filter({stage: {$in: [...]}})`'s Mongo-style operator in `AppointmentForm.jsx` translated incorrectly to a Postgres `.in()` filter) | A | Medium | Low–Medium | Each mechanical swap's exact old→new call shape is spelled out in this plan; spot-check the specific non-trivial ones (the `$in` operator, `WorkOrder.get()` vs `.select().eq().single()`) against Supabase JS docs during execution, not just assumed. |
| 6 | `NavigationTracker.jsx` deprecation removes activity logging you actually rely on via the Base44 platform's own dashboard | A | Low (reversible) | Low–Medium — genuinely unknown until you confirm | Explicitly flagged as a judgment call, not silently decided — default is deprecate, confirm before executing Phase A if you use that dashboard. |
| 7 | Two agents/sessions editing overlapping inventory files concurrently (this plan's Phase C touches 8 inventory files; Phase 14's own scope also touches `src/components/setup/` and `src/components/lankar/`, which don't overlap, but any other concurrent inventory work would) | C | Medium | Low — no other active phase currently claims these files per the Appendix | Confirm no other in-flight session is touching `src/components/inventory/*` or `src/pages/InventoryReturns.jsx`/`InventoryValuation.jsx`/`StockReorderReport.jsx` before starting Phase C. |
| 8 | Regression in the one already-native code path each modal shares with its base44-routed sibling (e.g. `InventoryEditModal.jsx`'s GL-posting-on-cost-change logic, which stays functionally identical but its `SupabaseProxy` create call becomes a direct insert) | C | Medium | Low | Preserve the exact GL debit/credit branching logic untouched — only the transport call changes, not the business logic; live-verify a cost change on a QOH>0 item produces the same 2 GL rows before/after. |
| 9 | Production deploy sequencing: any phase's new `autopro-*` function or direct-call swap gets deployed to production before its dev-branch verification is complete | Any | High | Low if the standing dev-first discipline is followed | Every phase's Verification Plan below requires dev-branch confirmation before a production deploy step; no phase in this plan skips that gate. |

---

## 4) Time Estimate

*Estimates in AI-paired autonomous working sessions (~2–4 focused hours each), consistent with this project's existing phase-plan convention.*

| Phase | Scope | Est. Sessions | Notes |
|---|---|---|---|
| A | Mechanical entity-import swaps + dead-code/appLogs cleanup (10 files) | 1 | No new backend; the only judgment call (NavigationTracker) needs your confirmation before executing that one file. |
| B | Customer & Vehicle history/CRUD cleanup (5 files) | 1 | 2 of the 5 collapse to a single-line RPC-call swap once read in full. |
| C | Inventory module cleanup (8 files) | 1.5–2 | Largest file count in this plan, but every item is a thin-proxy swap — no new Edge Functions. |
| D | Work Order/Cash Drawer boundary cleanup (2 files) | 0.5 | Both trivial once read in full. |
| E | `CreditInvoice.jsx` full native port + new `autopro-handleCreditInvoiceGL` | 1.5–2 | The one real backend-logic phase in this plan; needs careful curl + live GL-balance verification before production deploy. |
| F | Final verification & convergence grep (matches Phase 14G's own check) | 0.5 | No file changes — confirms this plan's scope is fully clean and ready for Phase 15. |
| **Total** | | **~6–8 sessions** | Wall-clock compresses if run alongside Phase 14 by a separate session, per the Appendix's stated intent — they share no files except the final convergence grep. |

---

## 5) Roadmap & Progress

### Phase A — Mechanical Entity-Import Swaps + Dead-Code Sweep — **[Pending]**

**Files:** `src/lib/NavigationTracker.jsx`, `src/components/appointments/AppointmentForm.jsx`, `src/components/cash-drawer/DepositDetailsModal.jsx`, `src/pages/WorkPROView.jsx`, `src/pages/InventoryValuation.jsx`, `src/components/inventory/InventoryAdjustQOHModal.jsx`, `src/components/work-orders/history/WorkOrderHistoryModal.jsx`, `src/components/work-orders/form/WorkOrderHeaderInfo.jsx`, `src/components/work-orders/form/WorkOrderViewHeaderInfo.jsx`, (bonus, your call) `src/Layout.jsx`.

**TL;DR:** The lowest-risk tier — either a straight `@/entities/all` → `supabase.from()` swap against an already-fully-native table, one string-literal/comment cleanup, or one dead import deletion. Zero new backend work.

**In-depth:** `AppointmentForm.jsx` swaps its `WorkOrder`/`SystemSettings` entity calls (`WorkOrder.filter({vehicle_id, stage: {$in: [...]}})`, `SystemSettings.list()/.update()/.create()`) for direct `supabase.from()` equivalents — both tables confirmed fully native on both branches. `DepositDetailsModal.jsx` swaps its single `WorkOrder.get(id)` entity call (used to resolve document numbers for payment rows) for `supabase.from('WorkOrder').select('*').eq('id', id).single()`. `WorkPROView.jsx` swaps 5 entity imports (`WorkOrder`, `Customer`, `Vehicle`, `Employee`, `TechTimeLog`) used across the file for their `supabase.from()` equivalents — all 5 tables already fully native. `InventoryValuation.jsx` swaps its one `base44.entities.InventoryItem.filter({is_active: true})` call for `supabase.from('InventoryItem').select('*').eq('is_active', true)`. `InventoryAdjustQOHModal.jsx` gets its unused `base44` import deleted — no other change. The 3 work-order-history/header files get their `email.endsWith('@no-reply.base44.com')` string checks left as-is (they're string comparisons against an email domain, not API calls — genuinely cosmetic, not worth touching) and the one dead commented-out line in `WorkOrderHeaderInfo.jsx`/`WorkOrderViewHeaderInfo.jsx` (`// const users = await base44.entities.User.filter(...)`) deleted. `NavigationTracker.jsx`: pending your confirmation (see §1), default is to delete the `base44` import and the `logUserInApp` effect entirely, leaving the `app_changed_url` postMessage effect untouched (that one has nothing to do with base44). `Layout.jsx`'s hardcoded base44.app URL: your call whether to touch it at all — it's an external link, not a functional dependency, and could just as easily be left alone.

---

### Phase B — Customer & Vehicle History/CRUD Cleanup — **[Pending]**

**Files:** `src/components/customers/NewCustomerModal.jsx`, `src/components/customers/CustomerHistoryModal.jsx`, `src/components/customers/CustomerWorkOrderHistoryModal.jsx`, `src/components/vehicles/VehicleHistoryModal.jsx`, `src/components/vehicles/VehicleDetails.jsx`.

**TL;DR:** Three thin `SupabaseProxy` CRUD swaps plus two RPC-passthrough swaps (no new Edge Functions — direct `supabase.rpc()` calls replace the shims, since the underlying legacy functions did nothing but forward to an already-live RPC).

**In-depth:** `NewCustomerModal.jsx`'s `handleSubmit` swaps its `SupabaseProxy` create call for `supabase.from('Customer').insert({...payload, id: crypto.randomUUID().replace(/-/g,'').substring(0,24)}).select().single()` — `Customer.id` confirmed 24-char hex live. `CustomerHistoryModal.jsx`'s `fetchVehicles` swaps its `SupabaseProxy` read call for `supabase.from('Vehicle').select('*').eq('customer_id', customer.id)`. `CustomerWorkOrderHistoryModal.jsx`'s `fetchHistory` swaps the `getCustomerWorkOrderHistory` shim import for `supabase.rpc('get_customer_work_order_history', { p_customer_id: customer.id, p_days_back: filters.daysBack ?? 365, p_from_date: filters.fromDate || null, p_to_date: filters.toDate || null, p_search_term: filters.search.trim() || null })`, reading the result directly (RPC returns the array itself, not a `{data: {workOrders}}` wrapper — response handling changes from `response.data?.workOrders` to `data`). `VehicleHistoryModal.jsx` gets the same RPC swap for `get_vehicle_work_order_history` in its `fetchHistory`, plus its two remaining `SupabaseProxy` calls (`handleEditClick`'s Customer read, `handleUpdateVehicle`'s Vehicle update) swapped for direct `supabase.from()` calls. `VehicleDetails.jsx` gets the identical `get_vehicle_work_order_history` RPC swap in its `fetchWorkOrders` effect — it has no other base44 dependency.

---

### Phase C — Inventory Module Cleanup — **[Pending]**

**Files:** `src/components/inventory/EditInventoryTransactionModal.jsx`, `src/components/inventory/ChangeSupplierModal.jsx`, `src/components/inventory/InventoryHistoryModal.jsx`, `src/components/inventory/InventoryEditModal.jsx`, `src/components/inventory/MergeInventoryModal.jsx`, `src/components/inventory/InventoryTransactionsModal.jsx`, `src/pages/InventoryReturns.jsx`, `src/pages/StockReorderReport.jsx`.

**TL;DR:** Every base44 call in this batch is a thin `SupabaseProxy` proxy over an already-fully-native table (`Supplier`, `InventoryCategory`, `InventoryReturn`, `InventoryItem`, `GLTransaction`), except `MergeInventoryModal.jsx`'s `searchInventory` shim, which becomes a drop-in import swap to the already-built `@/lib/inventorySearch.js` helper instead of a new function.

**In-depth:** `EditInventoryTransactionModal.jsx`'s `checkLock` effect swaps its `SupabaseProxy` Supplier-lock-check read for `supabase.from('Supplier').select('*').eq('id', transaction.supplier_id)`. `ChangeSupplierModal.jsx`'s `loadSuppliers` swaps its `SupabaseProxy` read for `supabase.from('Supplier').select('*').eq('inventory_supplier', true)`, and its `handleSave`'s `InventoryReturn.update(...)` entity call swaps for `supabase.from('InventoryReturn').update({supplier: selectedSupplier}).eq('id', returnItem.id)`. `InventoryHistoryModal.jsx`'s `loadSuppliers` swaps its `SupabaseProxy` read (no filter — full supplier list) for `supabase.from('Supplier').select('*')`. `InventoryEditModal.jsx` drops the unused `InventoryItem` half of its entity import, swaps `InventoryCategory.list()` for `supabase.from('InventoryCategory').select('*')`, swaps the `inventoryUpdate` shim for `supabase.from('InventoryItem').update(dataToSubmit).eq('id', item.id).select().single()`, and swaps its cost-change GL-posting `SupabaseProxy` create call for `supabase.from('GLTransaction').insert(glTransactions)` — the debit/credit branching logic that builds `glTransactions` stays untouched. `MergeInventoryModal.jsx`'s search effect swaps `base44.functions.invoke('searchInventory', {...})` for the already-imported-elsewhere `searchInventory` from `@/lib/inventorySearch` (same call signature, `response.data.records` access pattern unchanged) — its separate `autopro-mergeInventoryItems` call for the actual merge stays as-is (already native). `InventoryTransactionsModal.jsx`'s `loadData` swaps its 2 `SupabaseProxy` calls (SupplierInvoiceLine read, Supplier read) inside the existing `Promise.all` for direct `supabase.from()` calls, and its `checkSupplierLock` swaps its `SupabaseProxy` Supplier read the same way as `EditInventoryTransactionModal.jsx` above. `InventoryReturns.jsx` swaps its 2 `SupabaseProxy` calls (`loadSuppliers`'s read, `handleOpenWorkOrder`'s WorkOrder filter-by-id) for direct `supabase.from()` calls, and its `inventoryUpdate` shim import (used nowhere in this file per a fresh grep — confirm before deleting, since `InventoryEditModal.jsx`'s import is separate) — **note:** the file's `searchInventory` import is from `@/lib/inventorySearch` already, not base44, and needs no change. `StockReorderReport.jsx` swaps its 3 `SupabaseProxy` calls (`loadReportData`'s 2 reads, `handleRemoveAsStocked`'s bulk update) for direct `supabase.from()` calls, with the bulk update using `.in('id', Array.from(selectedItems))` per Risk #4 above.

---

### Phase D — Work Order/Cash Drawer Boundary Cleanup — **[Pending]**

**Files:** `src/components/cash-drawer/PaymentSelectionModal.jsx`, `src/components/work-orders/WarrantyReturnModal.jsx`.

**TL;DR:** Two single-purpose shims, both collapsing to a direct read with no new backend.

**In-depth:** `PaymentSelectionModal.jsx`'s "Open Work Order" button handler swaps the `getWorkOrderRoNumber` shim for `supabase.from('WorkOrder').select('ro_number').eq('id', item.workOrderId).single()`, reading `data?.ro_number` instead of `response.data?.ro_number`. `WarrantyReturnModal.jsx`'s `fetchData` effect swaps the `searchSuppliers` shim (called only with an empty search term at this call site) for `supabase.from('Supplier').select('*')` followed by the same `pin_to_top`-then-name client-side sort already used in `ChangeSupplierModal.jsx`, reading the array directly instead of `suppliersResponse.data?.suppliers`.

---

### Phase E — `CreditInvoice.jsx` Full Native Port — **[Pending]**

**Files:** `src/pages/CreditInvoice.jsx`; new `supabase/functions/autopro-handleCreditInvoiceGL/`.

**TL;DR:** The one real backend-logic item in this plan — a full GL-posting function port plus 5 `SupabaseProxy` call-site conversions plus a `jsonb` double-encoding fix. Highest risk in this batch; gets the most careful verification.

**In-depth:** Full technical detail is in the Working Area (§7) once this phase is current — summary here: `handleConfirmCreditInvoice`'s 5 `SupabaseProxy` calls (find existing credit invoices by customer+stage, create the new credit-invoice `WorkOrder` row, update it with `accounting_details` after GL posting, list suppliers for return processing, update the original `WorkOrder`'s `line_items`) all become direct `supabase.from()` calls against the already-native `WorkOrder` table, with a client-generated 24-char-hex `id` on the create step (no default exists on `WorkOrder.id`, confirmed live). The `base44.functions.invoke('handleCreditInvoiceGL', ...)` call becomes `supabase.functions.invoke('autopro-handleCreditInvoiceGL', { body: {...} })` against a new Edge Function ported line-for-line from the legacy source (up to 9 GL entry types: parts/labor/shop-supplies/GST revenue reversals, COGS+inventory reversal, other-charges reversals, and up to 3 payment-method-specific reversal types, plus a balancing AR adjustment row) — same `{success, accounting_details, summary}` response shape, always HTTP 200. The `JSON.stringify()` calls wrapping `line_items`/`payments` on the new `WorkOrder` create, and `line_items` on the original `WorkOrder`'s update, are all **removed** (all three are genuine `jsonb`, confirmed live) — pass the arrays/objects directly.

---

### Phase F — Final Verification & Convergence Grep — **[Pending]**

**Files:** None (verification only).

**TL;DR:** Confirms this plan's entire file scope is base44-free, matching the rigor of Phase 14G's own convergence check, so Phase 15 planning can proceed with full confidence this list is closed out.

**In-depth:** Repo-wide grep for `base44`/`@/entities/all`/`@/functions/` restricted to exactly the 23 files (now 24, counting `Layout.jsx` if you opted in) this plan touched — must return zero hits except any cosmetic string-literal checks deliberately left alone in Phase A. Confirm `npm run build`/`npx eslint` clean across every touched file. Confirm the new `autopro-handleCreditInvoiceGL` function is deployed and curl-verified on both dev and production. Report results back for the `master_blueprint.md` rollup and to close out the Appendix's handoff note in `phase_14_implementation_plan.md`.

---

## 6) Verification Plan

**Phase A:** Open `/Appointments`, create/edit an appointment tied to a real customer+vehicle, use "Create Estimate"/"Create Work Order" to confirm `WorkOrder`/`SystemSettings` reads and writes still work (RO-number generation increments correctly). Open a Bank Deposit's "Deposit Details" modal and confirm payment rows still resolve their document numbers correctly (tests the `WorkOrder.get()` swap). Open a WorkPRO project view (`WorkPROView.jsx`) from a real work order and confirm it loads customer/vehicle/employee/tech-time data and saves edits. Open `/InventoryValuation` and confirm the item list and total value still render. Open the Adjust QOH modal on any inventory item and confirm it still opens/saves (dead-import removal should be invisible). Success = no console errors, no visible behavior change anywhere in this phase's files, `npm run build` clean.

**Phase B:** Create a new customer via "Add Customer" (confirm it saves and appears immediately, tests the id-generation). Open an existing customer's history modal, confirm vehicles list, click into a vehicle's history, confirm work orders load with correct filtering (search/date-range). Open a vehicle's own history view directly (`VehicleDetails.jsx`) and confirm the same work-order list loads with filters working. Edit a vehicle from the history modal and confirm the update saves. Success = every history list populates with real data matching what it showed before the swap, id-generated customer create round-trips, no console errors.

**Phase C:** Open Inventory List → an item's history modal, confirm supplier names resolve correctly in the transaction list. Open "Edit Transaction" on a receiving line, confirm the supplier-lock check still blocks/allows editing correctly, save an edit. Open "Change Supplier" on a return item, confirm the supplier dropdown populates and saves. Edit an inventory item's cost with QOH > 0 and confirm the GL adjustment entries still post (verify via Chart of Accounts / GL report that the 2 expected rows appear, debit=credit). Merge two inventory items via the search-based merge modal, confirm search results populate and the merge completes. Open "Inventory Transactions" on an item and confirm the supplier/invoice-line list loads, edit and reverse-delete a transaction. Open `/InventoryReturns`, confirm supplier grouping loads, open a work order from a return row, use "Change Supplier" and "Return to Inventory" context-menu actions. Open the Stock Reorder Report, select a few items, use "Remove as Stocked Item" and confirm exactly the selected rows update (not all rows). Success = every read populates real data, every write round-trips and is visible on reload, GL debit/credit balance confirmed unchanged for the cost-adjustment path.

**Phase D:** From Cash Drawer, open a payment-selection modal (e.g. "Move to Cheque"), select a single work-order-linked payment, click "Open Work Order," confirm it opens the correct RO. From an invoiced work order's line items, open "Warranty Return" on a part, confirm the supplier dropdown/lookup still resolves correctly and the return submits (creates `InventoryReturn` + GL rows + updates the line item's `warranty_returned` flag) exactly as before. Success = both flows produce identical results to their current base44-routed behavior.

**Phase E (highest scrutiny):** On dev, curl-verify `autopro-handleCreditInvoiceGL` directly with a realistic payload (parts + labor + shop supplies + GST + one payment) and confirm the returned `generatedGLTransactions` sum to zero net (debits = credits) and match the legacy function's output for the same input. Then, live in the browser on dev: open an invoiced work order, select line items, create a credit invoice through the full UI flow — confirm the new `CRINV` work order is created with correct numbering (suffix increments correctly for repeat credits against the same invoice), confirm `line_items`/`payments` on the new row are real arrays when inspected via the Supabase connector (not JSON strings — this is the specific regression Risk #2 calls out), confirm the GL entries post and balance, confirm any linked inventory item's core/part return updates QOH or creates an `InventoryReturn` row correctly, confirm the original work order's line items show the credit reference. Repeat once more against the same original invoice to confirm the suffix logic (`-1`, `-2`) still works. Only after full dev sign-off, deploy the function to production and repeat a single confirm-only smoke test (curl, not a real credit invoice) against production. Success = GL balances to the penny on every test, no `jsonb` string-encoding regression, suffix numbering correct across repeat credits.

**Phase F:** Run the scoped repo-wide grep described in §5's Phase F entry; must return zero hits. Run `npm run build` and `npx eslint` across the full repo (or at minimum every file this plan touched) and confirm clean. No UI action needed beyond what Phases A–E already verified — this phase is a paperwork/grep close-out, not a new functional test.

---

## 7) Working Area (Current Phase): Phase A — Mechanical Entity-Import Swaps + Dead-Code Sweep

**Before executing:** confirm your call on `NavigationTracker.jsx` (§1) and `Layout.jsx` (§5, Phase A) — both are included below with the recommended default, but flagged as your decision, not mine.

### `src/lib/NavigationTracker.jsx`
- Line 4: delete `import { base44 } from '@/api/base44Client';`.
- Lines 42–46: delete the entire second `useEffect` block (the `logUserInApp` activity-logging effect), including its `if (isAuthenticated && pageName)` guard.
- Leave the first `useEffect` (lines 14–19, the `app_changed_url` `postMessage`) and all imports/logic unrelated to base44 untouched.
- **Only if you tell me to keep activity logging:** alternative is a new lightweight native table (e.g. `UserActivityLog(id, employee_id, page_name, created_date)`) + a direct `supabase.from().insert()` in place of the deleted block — not built by default, only if requested.

### `src/components/appointments/AppointmentForm.jsx`
- Line 19: `import { WorkOrder, SystemSettings } from '@/entities/all';` — keep the import, it now resolves through the base44 vite-plugin's legacy compatibility shim regardless; the actual fix is at each call site below (the import itself becomes inert once nothing calls `.filter()`/`.list()`/etc. through it — but for clarity, swap the import to `import { supabase } from '@/lib/supabase';` is already present at line 21, so just remove `WorkOrder, SystemSettings` from the `@/entities/all` import once all call sites below convert; if nothing else needs that import line, delete it entirely).
- Lines 813–816 (`onValueChange` for vehicle select, open-WO check):
  ```js
  const { data: openWOs, error } = await supabase
    .from('WorkOrder')
    .select('id')
    .eq('vehicle_id', value)
    .in('stage', ['estimate', 'work_order']);
  if (error) throw error;
  if (openWOs && openWOs.length > 0) setHasOpenWO(true);
  ```
- Lines 617–631 (`generateWorkOrderNumbers`, `SystemSettings.list()`/`.update()`/`.create()`):
  ```js
  const { data: settingsRows } = await supabase.from('SystemSettings').select('*');
  const systemSettings = settingsRows && settingsRows.length > 0 ? settingsRows[0] : null;
  const nextRo = systemSettings?.next_ro_number || 1001;
  if (systemSettings) {
    await supabase.from('SystemSettings').update({ next_ro_number: nextRo + 1 }).eq('id', systemSettings.id);
  } else {
    await supabase.from('SystemSettings').insert({
      id: crypto.randomUUID().replace(/-/g, '').substring(0, 24),
      next_ro_number: nextRo + 1
    });
  }
  ```
  (Verify `SystemSettings.id`'s live format before executing — not yet checked in this research pass; almost certainly 24-char hex like every other config table, but confirm via the connector first since this is a create path.)

### `src/components/cash-drawer/DepositDetailsModal.jsx`
- Line 9: `import { WorkOrder } from '@/entities/all';` → delete (supabase already imported at line 10).
- Lines 101–103 (`workOrderIds.map(id => WorkOrder.get(id).catch(() => null))`):
  ```js
  const workOrders = await Promise.all(
    workOrderIds.map(id =>
      supabase.from('WorkOrder').select('*').eq('id', id).maybeSingle()
        .then(({ data }) => data).catch(() => null)
    )
  );
  ```

### `src/pages/WorkPROView.jsx`
- Line 2: `import { WorkOrder, Customer, Vehicle, Employee, TechTimeLog } from '@/entities/all';` → delete.
- Lines 105–107 (`WorkOrder.filter({ro_number})`, fallback `.filter({wo_number})`):
  ```js
  let { data: workOrders } = await supabase.from('WorkOrder').select('*').eq('ro_number', roNumber);
  if (!workOrders || workOrders.length === 0) {
    ({ data: workOrders } = await supabase.from('WorkOrder').select('*').eq('wo_number', roNumber));
  }
  ```
- Lines 118–121 (`Customer.get`, `Vehicle.get`):
  ```js
  const [{ data: customerData }, { data: vehicleData }] = await Promise.all([
    supabase.from('Customer').select('*').eq('id', wo.customer_id).maybeSingle(),
    supabase.from('Vehicle').select('*').eq('id', wo.vehicle_id).maybeSingle()
  ]);
  ```
- Line 149 (`Employee.list()`): `const { data: allEmployees } = await supabase.from('Employee').select('*');` (guard `(allEmployees || [])` before `.filter`).
- Line 82 (`TechTimeLog.filter({workpro_project_id: projectId})`): `const { data: techTimeLogs } = await supabase.from('TechTimeLog').select('*').eq('workpro_project_id', projectId);` (guard `(techTimeLogs || [])`).

### `src/pages/InventoryValuation.jsx`
- Line 2: `import { base44 } from '@/api/base44Client';` → delete, add `import { supabase } from '@/lib/supabase';`.
- Line 25: `const items = await base44.entities.InventoryItem.filter({ is_active: true });` → `const { data: items } = await supabase.from('InventoryItem').select('*').eq('is_active', true);` (add `error` handling matching the existing try/catch).

### `src/components/inventory/InventoryAdjustQOHModal.jsx`
- Line 2: delete `import { base44 } from "@/api/base44Client";` — no other change, confirmed zero other references in this file.

### `src/components/work-orders/history/WorkOrderHistoryModal.jsx`, `src/components/work-orders/form/WorkOrderHeaderInfo.jsx`, `src/components/work-orders/form/WorkOrderViewHeaderInfo.jsx`
- Leave the `email.endsWith('@no-reply.base44.com')` checks exactly as-is in all 3 files — cosmetic, not an API dependency, not worth the churn.
- In `WorkOrderHeaderInfo.jsx` and `WorkOrderViewHeaderInfo.jsx` only: delete the dead commented-out line `// const users = await base44.entities.User.filter(...)`.

### `src/Layout.jsx` (bonus, optional)
- Line 849: `<a href="https://registry-pos-tracker-b5793593.base44.app/" ...>` — leave as-is unless you confirm you want this external link changed/removed; it is not a functional base44 API dependency.

**Task list for this phase:**
- [ ] Get your confirmation on `NavigationTracker.jsx`'s activity-log deprecation before touching that file.
- [ ] Verify `SystemSettings.id`'s live format via the Supabase connector before writing `AppointmentForm.jsx`'s create-path.
- [ ] Apply all swaps above.
- [ ] `npm run build` / `npx eslint` clean.
- [ ] Live-verify per §6 "Phase A" on dev (`test.kensauto.ca`).
- [ ] Flip this phase's status to `[Executed]`, then `[Tested]` once verification passes; roll this section into §2 and promote Phase B into §7.

---

## 4) Phase Results and Final Context

*(Empty — to be filled in as execution/verification proceeds. Do not remove this section header.)*
