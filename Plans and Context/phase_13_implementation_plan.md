# Phase 13 Implementation Plan: Work Orders Core (`DocumentEditor.jsx` and friends)

**Status:** IN PROGRESS — 13A code-complete, deployed to dev branch, awaiting manual UI verification before production RPC deploy. 13B code-complete, deployed to dev branch (RPC + edge function), awaiting manual UI verification before production deploy — one scope item (SystemSettings/WorkOrderStatus) blocked and deferred, see §0.8 and §13B.4.
**Parent:** `master_blueprint.md`, Phase 13 (Work Orders Core)
**Prepared:** 2026-08-03 · Initial scope research complete (full codebase footprint + all 17 legacy function sources read in full); Section 0 decisions confirmed 2026-08-03
**Baseline commit:** `0282721a` ("Phase 7B & Phase 12 Cleanup", development branch — Phase 7A/7B code-complete pending UI validation, Phase 7C not started, Phase 8 still in Section 0 open-questions/not-approved; Phase 2 and Phase 4 both Tested/complete)

> **LIVE DOCUMENT.** This plan is updated in place as execution/verification surfaces new findings — do not wipe prior sections, append/annotate instead. Key learnings roll back into `master_blueprint.md` Section 7 at phase close.
>
> **Why this plan exists now, before Tier E's stated prerequisites are fully met:** `master_blueprint.md`'s coordination map (Section 5, Tier E) says Phase 13 should only **execute** after Phases 7, 12, 2, and 4 are stable — it does not say Phase 13 can't be *planned* early. Phase 2 and Phase 4 are already Tested/complete; Phase 12 is code-complete; Phase 7 is in progress (7A/7B code-complete, 7C not started). Section 0.1 below is the direct conflict/coordination check you asked for.

---

## 0) Open Questions, Info Requirements & Suggestions

### 0.1 — RESOLVED: Conflict/coordination check against Phase 7 (in progress) and Phase 8 (drafted) — no live file conflict found

**File-overlap check (the actual risk the coordination map exists to catch):**

| Phase | Its file scope (confirmed from its own plan doc) | Overlaps Phase 13's file scope? |
|---|---|---|
| **Phase 7** (Inventory) | `src/components/inventory/**`, `src/pages/InventoryAdd.jsx`, `src/pages/InventoryList.jsx`, `src/pages/InventoryReturns.jsx`, `supabase/functions/autopro-suggestInventoryCategory/`, `supabase/functions/autopro-processQOHAdjustment` | **No.** Zero files in `src/components/work-orders/**`, `src/pages/WorkOrders.jsx`, `src/pages/EstimateEdit.jsx`/`WorkOrderEdit.jsx`, or `src/components/hooks/useWorkOrder.jsx` appear anywhere in Phase 7's scoped file table. |
| **Phase 8** (Banking, drafted) | `Bank.jsx`, `CashDrawer.jsx`, `Reconcile.jsx`, `ReconcileReport.jsx`, `src/components/bank/*`, `src/components/cash-drawer/*`, and (pending its own Section 0.2 decision) `ReceiveCreditModal.jsx`, `SupplierPaymentModal.jsx`, `LineOfCreditPaymentModal.jsx`, `MarkPaidModal.jsx` ×2, `IssuedChequesTable.jsx` | **No.** None of Phase 8's core or pending cross-domain files live under `src/components/work-orders/**` either. A repo-wide grep for `BankAccount`/`BankTransaction`/`BankReconciliation`/`CashDrawerAdjustment`/`DepositSlipBreakdown` inside `src/components/work-orders/**` and `src/pages/WorkOrders.jsx` returned zero hits. |

**Conclusion: Phase 13 is file-disjoint from both Phase 7's and Phase 8's current scopes.** Phase 2 and Phase 4 (the other two Tier E-adjacent phases the blueprint flags as touching work-orders/WorkPRO-adjacent files) are both already Tested/complete, so there's nothing live to collide with there either.

**Three real (non-conflicting) dependencies to track anyway:**

1. **`src/components/work-orders/WOAddInventoryModal.jsx` and `GetPartModal.jsx` consume assets Phase 7A/7B already built.** `WOAddInventoryModal.jsx:145` calls `InventoryCategory.list()` (Base44-shimmed) and `:569` calls `base44.functions.invoke('suggestInventoryCategory', ...)` — Phase 7B's own plan doc explicitly flagged this exact file as a discovered-but-out-of-scope third call site. Both dependencies (the native `InventoryCategory` table from 7A, and the deployed `autopro-suggestInventoryCategory` Gemini Edge Function from 7B) are already done and committed (`0282721a`) — 13E consumes them directly, no new work needed on the Phase 7 side.
2. **`GetPartModal.jsx`'s `searchInventory` calls (lines 76, 117) reuse Phase 7B's `search_inventory_ranked` RPC swap**, already proven working in `LegacyWarrantyReturnModal.jsx`. No new RPC-grant verification needed.
3. **`src/components/work-orders/ROCoreModal.jsx`'s `InventoryReturn.create()` call (line 114)** must follow the exact `InventoryReturn` audit-field/schema convention Phase 7A established — this table is not in Phase 13's ownership, just consumed by it.

**Standing coordination protocol for this phase:** before executing 13E (the sub-phase touching `WOAddInventoryModal.jsx`), re-grep `phase_7_implementation_plan.md`'s live status one more time in case 7C's scope has grown to touch that file — low probability, but a 30-second check avoids a live collision.

### 0.2 — RESOLVED: Sub-phase split confirmed (13A–13E)

This phase has ~61 base44 call sites across 25 files, 17 distinct legacy named functions to classify/port, and a 645-line dead-code deletion (Kanban cluster) — larger than Phase 7's already-substantial scope. Split into 5 sequential sub-phases, ordered by actual dependency (locking is load-bearing for almost every other WO mutation; the core fetch/list backbone is what `DocumentEditor.jsx`/`WorkOrders.jsx` need before anything else works; business-logic functions build on that; documents/comms are the most isolated/parallelizable; `WOAddInventoryModal.jsx` is a large, mostly-independent chunk that can run any time after 13A):

| Sub-Phase | Scope Summary | Status | Depends On |
|---|---|---|---|
| **13A — Locking Foundation & Dead-Code Removal** | New `set_workorder_lock` RPC replacing `manageWorkOrderLock`'s JS-side CAS logic; `flushWorkOrderLocks` thin-proxy swap; delete `KanbanBoard.jsx`/`KanbanColumn.jsx`/`KanbanCard.jsx`/`KanbanDisplaySettings.jsx` (645 lines) and its sole call site `updateWorkOrderStatus` (not ported); strip all confirmed-dead imports. | [x] Code-complete, dev-deployed — prod RPC deploy + UI verification pending (manual) | None — start here |
| **13B — Core Data Backbone** | `getworkorderdata` → plain thin data-fetch (its dormant lock branch is dead code — see 0.7, dropped entirely, not ported); `getworkorderlist` → native `search_work_orders` RPC (redesigned, per 0.3); `createworkorderdata` → native insert; `changeWorkOrderCustomer` → native `autopro-changeWorkOrderCustomer`. | [x] Code-complete, dev-deployed — prod deploy + UI verification pending (manual); `SystemSettings`/`WorkOrderStatus` swap item **blocked**, see §0.8/§13B.4 | **13A** (nothing lock-related actually, but sequenced second per dependency graph) |
| **13C — Business Logic & Small Entity Swaps** | `convertEstimateToWorkOrder` → native `autopro-convertEstimateToWorkOrder`; `syncLevies` → native `autopro-syncLevies`; `ReturnCoretoWO` → native `autopro-returnCoreToWO`; `searchWorkOrderParts` → native `search_work_order_parts` RPC (redesigned, per 0.3); every small thin-proxy entity read across the "friend" modals. | [ ] Not Started | **13B** (several of these read `WorkOrder`/line_items shapes 13B establishes) |
| **13D — Documents & Communications** | `generateWorkOrderPdf` → native `autopro-generateWorkOrderPdf` (jsPDF-in-Deno, confirmed go-ahead per 0.5); `createPortalSnapshot` → native `autopro-createPortalSnapshot`; `getPortalApprovals` → **thin direct call** to the now-native `Approvals` table (per 0.4, resolved); `sendSms` → native `autopro-sendSms` (Twilio); `sendEmailViaSMTP` → native `autopro-sendEmailViaSMTP` (Resend); `getNotesBoardData` → native `autopro-getNotesBoardData`, straight 1:1 port, **no RPC redesign** (per 0.3). | [ ] Not Started | **13B** (portal snapshot & PDF both read the same `WorkOrder`/`Customer`/`Vehicle` shape 13B's fetch establishes) |
| **13E — `WOAddInventoryModal.jsx` Full Migration & Final Sweep** | Full native rewire of `WOAddInventoryModal.jsx` (the file Phase 7B explicitly left alone), reusing 7A/7B's already-live assets verbatim. `WarrantyReturnModal.jsx`'s lone `WorkOrder.get()`/`.update()` calls (deferred by Phase 7) swapped to direct calls. Repo-wide grep sweep + `npm run build` + full WO-lifecycle regression (phase-close gate). | [ ] Not Started | **13A** (InventoryCategory/suggestInventoryCategory/search_inventory_ranked assets, already satisfied today), **13B** (WarrantyReturnModal's WorkOrder shape) |

**Update the checkboxes above as each sub-phase completes** — this is the first thing a fresh, context-cleared session should check to know where things stand.

### 0.3 — RESOLVED: RPC redesign for `getworkorderlist` and `searchWorkOrderParts`; `getNotesBoardData` stays a straight 1:1 port

Confirmed: **`getworkorderlist`** and **`searchWorkOrderParts`** both get the Postgres-RPC redesign (dynamic filter/sort/search logic and JSONB line-item search expressed in SQL rather than dragged into Edge Function JS) — full design in 13B/13C respectively.

**`getNotesBoardData` does NOT get the RPC-redesign treatment** — it ports as a straight native Edge Function (`autopro-getNotesBoardData`) preserving the exact current JS logic (Note fetch, batch Customer/Vehicle/WorkOrder enrichment join, fallback board-column/order round-robin assignment, in-memory search filter) rather than moving it into SQL. Full design in 13D.

### 0.4 — RESOLVED: `Approvals` is already native on the dev branch — thin direct call, hardcoded key retired entirely

Confirmed directly against the dev branch (`sitihbdnuxifwibontcm`) via `information_schema.columns`: an `Approvals` table already exists there with the expected columns (`id`, `work_order_id`, `cp_id`, `type`, `approval_amount`, `customer_name`/`email`/`phone_number`, `date_approved`/`time_approved`/`method_approved`, `customer_comments`, standard audit fields, `is_sample`). **It does not yet exist on production** (`hbcrwkmgsazqrvsrmxyr`) — needs the same `CREATE TABLE` migration replayed there once dev-branch behavior is verified, per the project's standard dev-first pattern.

**One real issue found while checking:** RLS is enabled on the dev-branch `Approvals` table but **zero policies exist** (`pg_policies` returned empty) — this is the exact Phase 1 landmine ("RLS enabled with zero policies blocks access without a clear error"). **13D must add the standard `"Enable all operations for all users"` permissive policy to this table** (both dev and prod) before wiring the frontend call, or every read will silently return empty/blocked rather than erroring clearly.

Since the entity is already native, `getPortalApprovals` collapses from "complex, external-fetch-with-hardcoded-key" to a **thin direct frontend call** — no Edge Function needed at all:
```js
const { data, error } = await supabase
  .from('Approvals')
  .select('*')
  .eq('work_order_id', work_order_id)
  .order('created_date', { ascending: false })
  .limit(100);
```
The legacy `getPortalApprovals` Base44 function (with its hardcoded plaintext API key, `835a11119e7d4b84a59f8f7a180b7e61`) is simply abandoned — no key rotation/env-var work needed since nothing calls out to the external Base44 portal REST API anymore. Per the Phase 4 standing rule, the Base44-hosted function source itself is left alone until Phase 14's cleanup.

### 0.5 — RESOLVED: jsPDF confirmed for `generateWorkOrderPdf`'s native port

Go-ahead confirmed. Port using **jsPDF** (`npm:jspdf@2.5.2`), matching the legacy function's own approach exactly (hand-rolled vector/text drawing, manual pagination, base64 data-URI-JSON response) — see 13D for the full preservation checklist. This also directly answers Phase 8's own open question about `generateDepositSlipPDF`'s PDF approach — worth relaying to whoever executes Phase 8 once this phase proves jsPDF works cleanly under this project's Deno Edge Function runtime.

### 0.6 — RESOLVED: Correction to a Phase 7 planning note — `line_items` core-tracking field names

`phase_7_implementation_plan.md` §0.5 states core tracking uses `{ core_num, core_ret, core_onhand }`. **Confirmed inaccurate** via direct code + live-data read: the real fields (confirmed in `buildWorkOrderSavePayload.js`, `useWorkOrder.jsx`'s `parseLineItems`, and a live `WorkOrder.line_items` row) are **`Core_num`** (capital C), `core_ret`, `core_cost`, and a *computed* `core_osamt` (`= (Core_num - core_ret) * core_cost`). **There is no `core_onhand` field anywhere.** No action needed against Phase 7 itself (it never wrote code against the wrong name — this was a planning-doc note only), but this correction should roll into `master_blueprint.md`/`phase_7_implementation_plan.md` at this phase's close-out.

### 0.7 — RESOLVED: `getworkorderdata` and `manageWorkOrderLock` stay separate — and a real bug was found doing it

**Verified by reading `getworkorderdata/entry.ts` directly and querying both the dev branch and production database:** when `getworkorderdata` is called with a `lockAction` other than `'none'`, it calls `supabase.rpc('set_workorder_lock', {...})` — **but this RPC does not exist, and has never existed, in either the production database or the dev branch** (confirmed via a direct `pg_proc` query against both). This branch has been dead-and-broken code since it was written — it would 500 if ever actually hit.

**It is never actually hit today:** `DocumentEditor.jsx:105` calls `useWorkOrder(roNumber, { useFunctionData })` — it does **not** pass `lockAction`/`lockedByUser`, so `useWorkOrder.jsx`'s `fetchData()` never sets those fields on its `getworkorderdata(...)` call. Locking in the live app today is handled **exclusively** by the separate `manageWorkOrderLock` function, called directly from `DocumentEditor.jsx` (lines 555, 630, 1033, 1247) and `useDocumentEditorSave.jsx` (line 173).

**Decision, matching your direction to keep the two functions separate:** `getworkorderdata`'s native replacement becomes a **pure, genuinely-thin data fetch** (WorkOrder + Customer + Vehicle) with **no lock logic in it at all** — the dead `lockAction`/`lockedByUser` branch is dropped, not ported (it never worked and nothing depends on it). Because it's now honestly thin, per the project's own migration policy this doesn't need an Edge Function at all — it becomes 3 sequential/parallel direct `supabase.from()` calls inlined into `useWorkOrder.jsx` (and `InvoiceConversion.jsx`'s equivalent call site). `manageWorkOrderLock` gets its own new, single `set_workorder_lock` Postgres RPC (13A) — reusing that exact name is a small nice-to-have: it finally makes real the RPC that dead code has been silently assuming existed all along. `DocumentEditor.jsx`'s lock-apply/release calls continue to be made separately from the data fetch, exactly as they work today — no behavior change, just a native transport swap. `useWorkOrder.jsx`'s vestigial `lockAction`/`lockedByUser` hook options are removed as dead-code cleanup while this file is being touched anyway.

### 0.8 — NEW FINDING (surfaced executing 13B): `SystemSettings`, `WorkOrderStatus`, `TagAlong`, `OtherChargeList`, `Levies` are NOT native — no Supabase table exists for any of them, on dev or production

**This directly contradicts 13B.1/13B.2's assumption** ("SystemSettings/WorkOrderStatus simple entity-read swaps ... straightforward direct-call swaps following the pattern established in Phases 5-7"). That assumption was never verified against live schema before being written into the plan — exactly the class of error §0.6/§0.7 already caught once this phase and the blueprint's own lessons-learned section warns about repeatedly.

**Verified directly via `information_schema.tables` across all schemas, on both projects:**
```sql
select table_schema, table_name from information_schema.tables
where lower(table_name) like '%system%' or lower(table_name) like '%workorderstatus%'
   or lower(table_name) like '%tagalong%' or lower(table_name) like '%othercharge%'
   or lower(table_name) like '%levies%';
-- returns zero rows on both hbcrwkmgsazqrvsrmxyr (production) and sitihbdnuxifwibontcm (dev)
```
A full unfiltered listing of every `public` table on both projects confirms the complete native table set (see 13B.4 for the full list). `SystemSettings`, `WorkOrderStatus`, `TagAlong`, `OtherChargeList`, and `Levies` are **absent from all of it** — they are still 100% Base44-hosted entities, reachable today only through `@/entities/all`'s legacy SDK shim (which proxies to Base44's own datastore, not Supabase, for these specific entities — unlike `Customer`/`Vehicle`/`WorkOrder`/`Employee`/`ChartOfAccount`/`ReturnReason`/`SalesClass`, which genuinely are native Supabase tables today).

**Why this matters beyond 13B:** `@/entities/all` is not a reliable signal of "already migrated." Some entities imported from it resolve to genuine Supabase tables (safe to convert to `supabase.from()`); others resolve to Base44's own backing store with no Supabase equivalent at all (converting these to `supabase.from()` would 500 with "relation does not exist"). **The only reliable check is querying `information_schema.tables` directly before converting any entity call site** — the import path alone cannot tell you which kind you're looking at.

**Concrete impact on this phase's remaining sub-phases:**
- **13B:** `SystemSettings`/`WorkOrderStatus` swap item deferred, not completed (see §13B.4 retrospective) — all `SystemSettings.list/update/create` and `WorkOrderStatus.filter` call sites across `DocumentEditor.jsx`, `WorkOrders.jsx`, `NewWorkOrderModal.jsx`, `InvoiceConversion.jsx` left exactly as they were (still base44-routed). No regression — just incomplete relative to the original 13B.1 scope.
- **13C:** `GetPartModal.jsx`'s `TagAlong.list()`/`OtherChargeList.list()` swaps and `OtherChargeModal.jsx`'s `OtherChargeList.filter()` swap have the **same blocker** — do not attempt a direct `supabase.from()` conversion for these two entities without first either (a) confirming a table now exists (re-run the `information_schema` check, things may have changed), or (b) getting sign-off on creating new native tables + backfilling from Base44's current data. `ChartOfAccount`/`ReturnReason`/`SalesClass` in that same sub-phase ARE genuinely native — those conversions are unaffected.
- **13C:** `syncLevies` → `autopro-syncLevies` is at risk too — the legacy function's ledger-reconciliation logic reads/writes a `Levies` table server-side. If that table doesn't exist in Supabase either (not yet independently confirmed — check `information_schema.tables` for `Levies` specifically before starting that port), the Edge Function port needs the same table-creation decision as `SystemSettings`/`WorkOrderStatus` before it can work at all.

**Recommended path forward (not yet actioned — needs the user's decision):** creating `SystemSettings`, `WorkOrderStatus`, `TagAlong`, `OtherChargeList`, and (if confirmed missing) `Levies` as genuine native Supabase tables is a real, if small, unplanned migration: a `CREATE TABLE` + RLS policy per table (matching the `Approvals` precedent in §0.4), plus a one-time data backfill from whatever Base44 currently holds for each (schema inferred from JS usage: `SystemSettings` needs at least `shop_supply_rate`, `default_taxable`, `tax_rate`, `wip_legal`, `default_message`, `next_ro_number`, `next_inv_number`; `WorkOrderStatus` needs `name`, `display_order`, `color`, `is_active`). This wasn't authorized as part of 13B's original scope and needs explicit go-ahead before any sub-phase attempts it.

---

## 1) Phase Scope & Objectives

**Objective:** Complete the Work Orders Core migration — the highest-blast-radius phase in the entire blueprint, since `DocumentEditor.jsx` and its "friends" are the one part of the app nearly every other module (Inventory, Appointment, WorkPRO, GL/Accounting) reads from or writes into.

1. Replace the optimistic edit-lock system (`manageWorkOrderLock`) with one new native lock RPC; retire `getworkorderdata`'s dead, never-functional lock branch as part of turning it into a plain thin fetch. **[13A/13B]**
2. Delete the confirmed-dead Kanban board cluster (4 files, 645 lines) and its sole call site `updateWorkOrderStatus` (not ported). **[13A]**
3. Strip all confirmed-dead imports across every touched file. **[13A, ongoing per-file]**
4. Migrate the core WO data backbone: fetch (`getworkorderdata`), list (`getworkorderlist`), create (`createworkorderdata`), and customer re-parenting (`changeWorkOrderCustomer`). **[13B]**
5. Migrate the WO business-logic functions: estimate→WO conversion (`convertEstimateToWorkOrder`), levy syncing (`syncLevies`), core returns (`ReturnCoretoWO`), cross-WO parts search (`searchWorkOrderParts`) — plus every small thin-proxy entity read in the surrounding modals. **[13C]**
6. Migrate document/communication functions: WO PDF generation (`generateWorkOrderPdf`), customer-portal snapshots (`createPortalSnapshot`), portal approvals (`getPortalApprovals` — now a thin native-table read), SMS (`sendSms`), email (`sendEmailViaSMTP`), and the notes board (`getNotesBoardData`). **[13D]**
7. Fully migrate `WOAddInventoryModal.jsx` (explicitly deferred by Phase 7B) and close out `WarrantyReturnModal.jsx`'s one remaining `WorkOrder` dependency (explicitly deferred by Phase 7). **[13E]**

**In scope — full file inventory (25 files + 4 dead files to delete + 17 legacy functions):**

| # | File | Base44 surface | Sub-Phase |
|---|---|---|---|
| 1 | `src/components/work-orders/DocumentEditor.jsx` (1,978 lines) | `SystemSettings`, `WorkOrderStatus`, `manageWorkOrderLock`×4, `changeWorkOrderCustomer`, `convertEstimateToWorkOrder`; 4 dead imports | 13A (dead imports, lock calls), 13B (SystemSettings/WorkOrderStatus/changeWorkOrderCustomer), 13C (convertEstimateToWorkOrder) |
| 2 | `src/pages/WorkOrders.jsx` (1,931 lines) | `WorkOrderStatus`, `getworkorderlist`×2, `getNotesBoardData`, `createworkorderdata`×2, `SystemSettings`×3, `flushWorkOrderLocks`; 1 dead import (`TagAlong`) | 13A (dead import, flushWorkOrderLocks), 13B (WorkOrderStatus/getworkorderlist/createworkorderdata/SystemSettings), 13D (getNotesBoardData) |
| 3 | `src/components/hooks/useWorkOrder.jsx` (162 lines) | `SupabaseProxy` read (SupplierInvoiceLine), `getworkorderdata` (dormant lock branch dropped, see 0.7), `SupabaseProxy` read (WorkOrder, dead-in-practice), `Customer.get()`, `Vehicle.get()` | 13B |
| 4 | `src/components/work-orders/hooks/useDocumentEditorSave.jsx` | `WorkOrder.update()` (dead-in-practice), `manageWorkOrderLock`, `SupabaseProxy` read (dead-in-practice), `syncLevies` | 13A (lock call + dead-code removal), 13C (syncLevies) |
| 5 | `src/components/work-orders/KanbanBoard.jsx` + `KanbanColumn.jsx` + `KanbanCard.jsx` + `KanbanDisplaySettings.jsx` (645 lines total) | `updateWorkOrderStatus` | **13A — delete outright, no migration** |
| 6 | `src/components/work-orders/GetPartModal.jsx` | `SupabaseProxy` read (SalesClass), `TagAlong.list()`, `OtherChargeList.list()`, `searchInventory`×2 | 13C |
| 7 | `src/components/work-orders/FindPartModal.jsx` | `searchWorkOrderParts` | 13C |
| 8 | `src/components/work-orders/AdvancePaymentModal.jsx` | 2 dead imports (`WorkOrder`, `GLTransaction` — body already native) | 13A |
| 9 | `src/components/work-orders/NewWorkOrderModal.jsx` | `SystemSettings.list/update/create` | 13B (shares the RO-counter pattern with `WorkOrders.jsx`) |
| 10 | `src/components/work-orders/NewWorkPROModal.jsx` | `Employee.list()` | 13C |
| 11 | `src/components/work-orders/WorkPROCommentsModal.jsx` | `Employee.list()` | 13C |
| 12 | `src/components/work-orders/WorkPROEditProjectModal.jsx` | `Employee.list()` | 13C |
| 13 | `src/components/work-orders/WorkPROModal.jsx` | `Employee.list()` | 13C |
| 14 | `src/components/work-orders/OtherChargeModal.jsx` | `OtherChargeList.filter()`, `ChartOfAccount.list()` | 13C |
| 15 | `src/components/work-orders/ReturnWOPartModal.jsx` | `ReturnReason.filter()` | 13C |
| 16 | `src/components/work-orders/ROCoreModal.jsx` | `InventoryReturn.create()`, `ReturnCoretoWO` | 13C |
| 17 | `src/components/work-orders/WOAddInventoryModal.jsx` | `TagAlong.list()`, `OtherChargeList.list()`, `InventoryCategory.list()`, `searchInventory`, `suggestInventoryCategory`; 2 dead imports (`inventoryAdd`/`inventoryUpdate`) | **13E** |
| 18 | `src/components/work-orders/history/JsonToTableDisplay.jsx` | `ChartOfAccount.list()` | 13C |
| 19 | `src/components/work-orders/history/WorkOrderHistoryModal.jsx` | `SupabaseProxy` read (workorderversionhistory) | 13C |
| 20 | `src/components/work-orders/WorkOrderPdfModal.jsx` | `generateWorkOrderPdf` | 13D |
| 21 | `src/components/work-orders/SESEmailModal.jsx` | `createPortalSnapshot`, `sendSms`, `sendEmailViaSMTP` | 13D |
| 22 | `src/components/work-orders/ROApprovalsModal.jsx` | `getPortalApprovals` → now a thin `Approvals` table read | 13D |
| 23 | `src/components/work-orders/OpenROModal.jsx` | `getworkorderlist` | 13B |
| 24 | `src/components/work-orders/WorkOrderReport.jsx` | `SystemSettings` import (report generation) | 13B |
| 25 | `src/components/work-orders/ReceivePartModal.jsx` | 1 dead import (`base44` client) | 13A |
| 26 | `src/pages/InvoiceConversion.jsx` (652 lines) | `WorkOrder`, `SystemSettings` entities, `getworkorderdata`, `createPortalSnapshot`×2 | 13B (WorkOrder/SystemSettings/getworkorderdata), 13D (createPortalSnapshot) |
| 27 | `src/components/work-orders/WarrantyReturnModal.jsx` | `WorkOrder.get()`, `WorkOrder.update()` (only remaining base44 dependency; rest is already native, per Phase 7) | **13E** |

**Explicitly NOT in scope (already fully native, do not touch):**
- `src/components/work-orders/form/WorkOrderForm.jsx` — 100% native already (direct `supabase.from('SupplierInvoiceLine')` + `supabase.functions.invoke('autopro-handleSupplierInvoiceLineGL', ...)` ×4 call sites).
- `src/components/work-orders/InvoicePaymentModal.jsx` — 100% native already.
- `autopro-handleInvoiceConversionGL` / `autopro-handleSupplierInvoiceLineGL` — **do not modify, standing project rule.** Their 5 frontend call sites already use native `supabase.functions.invoke()` — nothing to migrate here.
- `src/components/inventory/**` (Phase 7's domain) — the loose `workOrderNumber`/`ro_number` prop-passing/display coupling in `InventoryPartsReturnModal.jsx`/`InventoryHistoryModal.jsx` is left as-is; no deep coupling found.

**Target outcome:** Zero remaining `base44`/`@/entities/all`/`@/functions/*` references anywhere in `src/components/work-orders/**`, `src/pages/WorkOrders.jsx`, `src/components/hooks/useWorkOrder.jsx`, and `src/pages/InvoiceConversion.jsx`. All genuinely-complex legacy functions replaced with `autopro-*` Edge Functions (or, for `getworkorderlist`/`searchWorkOrderParts`, proper Postgres RPCs) following the 200-always convention. Kanban board cluster deleted. Full WO lifecycle (create → estimate → convert to WO → line items/parts/cores/levies → convert to invoice → payment → GL unaffected → PDF/portal/SMS/email) behaves identically to pre-migration.

---

## 2) Lessons Learned & Context

Pulled from `master_blueprint.md` §7 and Phase 7/8's own plans, filtered to what's load-bearing here:

- **Audit fields don't populate themselves** (Phase 4). Every new `.insert()`/`.update()` in this phase's native ports must explicitly set `created_date`/`created_by`/`created_by_id` and `updated_date`/`last_updated`/`last_updated_by` — note `WorkOrder` uses `last_updated`/`last_updated_by`, **not** `updated_by`/`updated_by_id`, a different convention than the inventory tables Phase 7 worked with. Don't carry Phase 7's exact column names forward without checking.
- **Check live schema before assuming a field/RPC exists — don't trust dormant code either** (Phase 3/5/7 lesson, and this phase found its own sharp example): `getworkorderdata`'s `set_workorder_lock` RPC call (§0.7) turned out to reference an RPC that was **never actually created** in either dev or production — confirmed only by directly querying `pg_proc`, not by reading the JS source alone. A function existing in application code calling something is not proof that something exists server-side.
- **A `Promise.all` mixing a still-base44-routed call with already-migrated direct calls fails the whole batch on a dev-native session** (Phase 3/12/8 finding) — `useWorkOrder.jsx`'s `fetchData()` mixes native (`Customer`/`Vehicle`) and base44-shimmed (`getworkorderdata`) calls in the same `Promise.all` today; check for this exact coupling pattern before assuming a partially-migrated page's native calls are broken during 13B/13C testing.
- **Edge Function error-handling convention** (Phase 5/6, restated in `master_context.md`) — every new `autopro-*` function in this phase returns `200` always with `{ error: "..." }` on failure. Every one of the legacy functions being ported currently violates this (raw 400/401/404/409/500 responses) — normalize all of them during the port.
- **Never trust a phase-planning-doc's field-name/schema claim at face value** (Phase 12/8's own lesson, and directly what 0.6 caught) — always verify against live data or source code.
- **RLS enabled + zero policies silently blocks access** (Phase 1 lesson, and directly what 0.4 caught on the dev-branch `Approvals` table) — always check `pg_policies` count when a "new" native table turns out to already exist, don't assume a table someone else created already has the standard permissive policy.
- **Leave `base44/` source tree alone until Phase 14** (Phase 4 standing rule) — this phase stops calling these functions, doesn't delete `base44/functions/manageWorkOrderLock/`, etc.
- **No entity-class wrapper layer** (Phase 4-7 established pattern) — every migration in this phase is an inline edit: drop the `@/entities/all`/`@/entities/X` import, add `import { supabase } from '@/lib/supabase'`, inline the direct call.
- **Financial-domain risk is real here too** (blueprint Risk #2/#9) — `convertEstimateToWorkOrder`'s inventory-allocation math, `syncLevies`'s ledger reconciliation, and every GL-adjacent total on `WorkOrder` itself must be strictly cast (`Number()`/`parseFloat()`) exactly per the project-wide convention.
- **Dev-branch column types can diverge from production** (Phase 4/8 finding) — verify `WorkOrder`'s column types (especially `line_items`/`payments`/`accounting_details`/`tech_time` as `jsonb`) on the dev branch match production before writing dev-tested code.
- **The `/dev-login` mechanism (`test.kensauto.ca/dev-login`) remains the correct live-testing tool** (Phases 3–12) — use it for all UI verification below.
- **Two agents editing overlapping files concurrently is the risk §0.1 exists to catch** (blueprint Risk #5) — reconfirmed zero overlap with Phase 7/8 as of this planning pass; re-verify if significant time passes before 13E executes.
- **Hardcoded secrets found mid-planning aren't blocking, but shouldn't be silently ignored** (blueprint Risk #5, echoed by `getPortalApprovals`'s hardcoded key) — resolved cleanly this time since the whole external-fetch path is retired, not just patched.

**Added after 13A execution (2026-08-03):**
- **`npx eslint` catches cascading dead imports that `npm run build` doesn't** — this project's config treats an unused *import* as an `error` (unused local *variables* are only `warning`). Removing one dead symbol from a shared import line, or converting a function's last call site, routinely orphans an entire import line elsewhere in the same file (13A: converting `flushWorkOrderLocks` orphaned `WorkOrders.jsx`'s `base44` import; removing `WorkOrder, GLTransaction` orphaned `AdvancePaymentModal.jsx`'s `base44` import). **Run a full `npx eslint` pass on every touched file after each sub-phase, not just `npm run build`** — 13B-13E should expect and budget for this same cascade.
- **Before deleting/simplifying code gated on a prop/flag a plan doc calls "always true/false in practice," verify it yourself, don't just trust the doc** — grep every real call site of the component/hook and confirm the literal value passed at each one (cheap: `grep '<DocumentEditor' src/pages/*.jsx` took one call and confirmed both `EstimateEdit.jsx`/`WorkOrderEdit.jsx` hardcode `useFunctionData` truthy). This is what safely justified deleting `useDocumentEditorSave.jsx`'s dead `!useFunctionData` branch in 13A, and surfaced a second, not-yet-addressed instance of the same dead-branch pattern (`DocumentEditor.jsx`'s two `useFunctionData ? workOrder : await WorkOrder.get(...)` ternaries at lines 510/631 — flagged for 13B in §13A.4, not touched in 13A since it was out of that sub-phase's scope).
- **A brand-new Postgres RPC can validate clean on the first attempt when the plan's SQL was already written against a directly-confirmed schema** — `set_workorder_lock` needed zero fixes after deployment; every acquire/contested-apply/stale-steal/release scenario matched design intent immediately. This is the payoff of `§0.7`'s earlier discipline (querying `pg_proc`/`information_schema` directly instead of trusting dormant JS) — worth preserving that discipline for the `search_work_orders`/`search_work_order_parts` RPC builds in 13B/13C.
- **Dev branch has essentially no `WorkOrder` data yet (1 row, `RO5001`)** — fine for testing the lock RPC's logic (transient state, easy to reset), but **not enough to validate `search_work_orders`/`search_work_order_parts` "row-for-row against the old JS" per 13B/13C's own exit criteria**. Seed representative multi-stage/multi-customer test rows on dev before that validation step, or fall back to read-only `execute_sql` checks against production data.
- **A migration/DB-schema deploy is treated as a distinct approval gate from a code change, even mid-plan** — 13A's code is complete and dev-deployed, but the production RPC replay was deliberately held back pending the user's own manual UI verification (per their explicit instruction that testing "will have to wait for my manual intervention"). Don't conflate "dev-validated via direct SQL" with "cleared for production" for any future sub-phase's own RPC/table work.

---

## 3 & 4) Phase 13 Roadmap — Sub-Phase Breakdown

### Why split into sub-phases

Phase 13 is the largest single phase in the blueprint: ~61 base44 call sites across 25 files, 17 distinct legacy functions to classify and port (7 of them genuinely complex multi-step orchestration, 2 redesigned as proper SQL RPCs, 1 collapsing to a thin direct call once its dependency turned out to already be native), and a 645-line dead-code deletion. Each sub-phase below has its own natural verification gate, so a fresh session can resume at any `13X` boundary without needing the full phase's context. See §0.2 for the sub-phase overview table and current status tracker — update those checkboxes as each sub-phase completes.

### General pattern — direct native Supabase calls, no wrapper layer (applies to every sub-phase)

Per-file pattern for every migration in 13A-13E, consistent with Phases 4-7:
1. Remove the migrated symbol from its `@/entities/all` (or `@/entities/X`) or `@/functions/*` import — drop the whole import line if nothing else in the file still needs it.
2. Add/confirm `import { supabase } from '@/lib/supabase';`.
3. Replace `.list()`/`.filter()`/`.get()`/`.create()`/`.update()` or legacy-function calls with inline `supabase.from()/.rpc()/.functions.invoke('autopro-*')` calls.
4. Manually populate audit fields on every insert/update — `WorkOrder` uses `created_date`/`created_by`/`created_by_id` on insert, `last_updated`/`last_updated_by` on update (**not** `updated_by`/`updated_by_id` — confirmed different from Phase 7's inventory-table convention).
5. Check `error` explicitly and `console.error` it — never swallow silently.
6. Every new `autopro-*` Edge Function returns `200` always with `{ error }` on failure, per the project-wide convention.

### Pre-flight status — what's already confirmed vs. what still needs a dev-branch check

**Already confirmed directly against dev/production during planning:**
- `Approvals` table exists on the dev branch (`sitihbdnuxifwibontcm`) with the expected schema; **does not exist on production** yet; RLS enabled with **zero policies** (needs the standard permissive policy added).
- `set_workorder_lock` RPC does **not** exist in either dev or production — it needs to be created fresh in 13A, not "found and reused."
- `WorkOrder` is native in production with 1,557 rows; `line_items`/`payments`/`accounting_details`/`tech_time` are `jsonb` columns (not stringified) — every consumer expecting a JSON string (a holdover from Base44's REST-string-normalization behavior) needs auditing during 13B.
- `WorkOrder.status` is plain text, no FK (confirmed, matches the existing Phase 6 finding); `stage` (also plain text) is the field that actually drives page-redirect logic.
- Zero file overlap with Phase 7's or Phase 8's current scope (§0.1).

**Still needs doing, in dependency order:**
1. (13A) Design + deploy `set_workorder_lock` RPC to dev branch first, validate, then production.
2. (13A) Delete Kanban cluster; confirm `npm run build` stays clean.
3. (13B) Audit every `JSON.parse(line_items)`-style call across `DocumentEditor.jsx`/`useWorkOrder.jsx`/`useDocumentEditorSave.jsx` now that the native fetch returns already-parsed `jsonb` objects.
4. (13B/13C) Build + validate the two redesigned RPCs (`search_work_orders`, `search_work_order_parts`) on the dev branch, output-compared row-for-row against the current JS implementations, before production.
5. (13D) Add the missing RLS policy to `Approvals` on dev, replay the `CREATE TABLE` + policy on production, then wire the thin direct call.
6. (13D) Confirm `TWILIO_ACCOUNT_SID`/`TWILIO_AUTH_TOKEN`/`TWILIO_PHONE_NUMBER` and `RESEND_API_KEY` secrets exist on both dev and prod Supabase projects before porting `sendSms`/`sendEmailViaSMTP`.

---

## 13A) SUB-PHASE A: Locking Foundation & Dead-Code Removal

### 13A.1) Scope & Objectives

**In scope:**
1. New `set_workorder_lock` Postgres RPC (dev branch first, then production) — the single native lock mechanism, replacing `manageWorkOrderLock`'s JS-side compare-and-swap logic.
2. Convert all 4 `manageWorkOrderLock` call sites in `DocumentEditor.jsx` (lines 555, 630, 1033, 1247) and the 1 in `useDocumentEditorSave.jsx` (line 173) to call the new RPC directly.
3. `flushWorkOrderLocks` thin-proxy swap in `WorkOrders.jsx` (line 980).
4. Delete `KanbanBoard.jsx`, `KanbanColumn.jsx`, `KanbanCard.jsx`, `KanbanDisplaySettings.jsx` outright (645 lines, zero live importers confirmed). Do **not** port `updateWorkOrderStatus` — its only caller is this dead cluster.
5. Remove `useDocumentEditorSave.jsx`'s two `if (!useFunctionData)` dead branches (the legacy `WorkOrder.update()` save path and the `SupabaseProxy` audit-diff read) — confirmed dead in practice since both `DocumentEditor.jsx` entry points always pass `useFunctionData=true`.
6. Strip all 5 confirmed-dead imports: `Customer`/`Vehicle`/`InventoryTxs`/`CustomerPayments` from `DocumentEditor.jsx:4`; `WorkOrder`/`GLTransaction` from `AdvancePaymentModal.jsx:10`; `TagAlong` from `WorkOrders.jsx`; `inventoryAdd`/`inventoryUpdate` from `WOAddInventoryModal.jsx:11-12`; `base44` client from `ReceivePartModal.jsx:6`.
7. **[Executed, not originally planned]** Remove `useDocumentEditorSave.jsx`'s now-vestigial `useFunctionData` param/destructure/dependency entirely (both call sites always pass it `true`, so after removing the dead `else` branch in item 5 above, the param itself had nothing left to gate) and its now-orphaned `WorkOrder` import (its only use was inside that same deleted branch).
8. **[Executed, not originally planned]** Two more dead imports surfaced by `npx eslint` as a direct cascade of items 3/6 above, removed in the same pass: `base44` in `AdvancePaymentModal.jsx` (last live usage was the entity calls removed in item 6) and `base44` in `WorkOrders.jsx` (last live usage was `flushWorkOrderLocks` itself, converted in item 3).

**Explicitly NOT in scope:** anything touching `getworkorderdata` itself (13B — its lock branch is dead code being dropped there, not migrated here); `WOAddInventoryModal.jsx`'s remaining logic beyond the dead-import strip (13E).

**Prerequisite:** None — this is the starting sub-phase.

**Exit criteria (must all be true before starting 13B):** `set_workorder_lock` RPC deployed + validated on dev branch, then production; all lock call sites converted; Kanban cluster deleted with zero build errors; `flushWorkOrderLocks` converted; all 5 dead-import cleanups done; `useDocumentEditorSave.jsx`'s dead branches removed; `npm run build` clean.

### 13A.2) Detailed Execution Plan

**New lock RPC — build + validate on dev branch (`sitihbdnuxifwibontcm`) first, then production:**

```sql
CREATE OR REPLACE FUNCTION set_workorder_lock(
  p_ro_number text,
  p_action text,       -- 'apply' | 'release'
  p_locked_by_user text
) RETURNS "WorkOrder"
LANGUAGE plpgsql AS $$
DECLARE
  v_row "WorkOrder"%ROWTYPE;
  v_existing "WorkOrder"%ROWTYPE;
  v_stale_cutoff timestamptz := now() - interval '120 minutes';
BEGIN
  IF p_action = 'apply' THEN
    -- Race-safe acquire: single statement, only succeeds if unlocked or already owned by caller
    UPDATE "WorkOrder"
      SET "LockedByUser" = p_locked_by_user, locked_timestamp = now()
      WHERE ro_number = p_ro_number
        AND ("LockedByUser" IS NULL OR "LockedByUser" = '' OR "LockedByUser" = p_locked_by_user)
      RETURNING * INTO v_row;

    IF v_row.id IS NULL THEN
      -- Someone else holds it — check staleness (>120 min) and steal via compare-and-swap
      SELECT * INTO v_existing FROM "WorkOrder" WHERE ro_number = p_ro_number;
      IF v_existing.locked_timestamp IS NOT NULL AND v_existing.locked_timestamp < v_stale_cutoff THEN
        UPDATE "WorkOrder"
          SET "LockedByUser" = p_locked_by_user, locked_timestamp = now()
          WHERE ro_number = p_ro_number
            AND "LockedByUser" = v_existing."LockedByUser"
            AND locked_timestamp = v_existing.locked_timestamp
          RETURNING * INTO v_row;
      ELSE
        v_row := v_existing;  -- return current (locked) state so caller can show who holds it
      END IF;
    END IF;
  ELSIF p_action = 'release' THEN
    UPDATE "WorkOrder"
      SET "LockedByUser" = NULL, locked_timestamp = NULL
      WHERE ro_number = p_ro_number
        AND ("LockedByUser" IS NULL OR "LockedByUser" = p_locked_by_user)
      RETURNING * INTO v_row;
  END IF;

  RETURN v_row;
END;
$$;
```
Called from the frontend as `supabase.rpc('set_workorder_lock', { p_ro_number, p_action, p_locked_by_user })`. Preserves the exact stale-lock-override window (120 min) and compare-and-swap semantics from `manageWorkOrderLock/entry.ts`. This is the **first time this RPC name has ever actually existed** in the database — `getworkorderdata`'s dormant reference to it (§0.7) has been calling into a void since it was written.

**`DocumentEditor.jsx` lock call sites (lines 555, 630, 1033, 1247):**
```diff
- await manageWorkOrderLock({ ro_number, action: 'apply' });
+ const { data: lockResult, error: lockError } = await supabase.rpc('set_workorder_lock', {
+   p_ro_number: ro_number, p_action: 'apply', p_locked_by_user: currentUser.email
+ });
+ if (lockError) { console.error('Lock error:', lockError); /* preserve existing UI handling for "someone else has this locked" */ }
```
(and the `'release'` variant analogously, `p_locked_by_user: currentUser.email` still passed so the release's ownership check works). Remove `import { manageWorkOrderLock } from '@/functions/manageWorkOrderLock';` once all call sites are converted.

**`useDocumentEditorSave.jsx`:**
- Delete the two `if (!useFunctionData)` branches entirely (the `SupabaseProxy` audit-diff read and the legacy `WorkOrder.update()` save).
- Line 173's lock-refresh-during-save call → same RPC swap as above.

**`WorkOrders.jsx` — `flushWorkOrderLocks` (line 980):**
```diff
- await base44.functions.invoke('flushWorkOrderLocks');
+ const { data, error } = await supabase
+   .from('WorkOrder')
+   .update({ LockedByUser: null, locked_timestamp: null })
+   .not('LockedByUser', 'is', null)
+   .select('id');
+ if (error) { console.error('Error flushing locks:', error); return; }
+ alert(`Flushed ${data?.length || 0} locks.`);
```
**Confirm this admin action is gated by a role check in the UI** (e.g. `currentUser.admin`) before wiring the direct call, since the old Edge Function's own auth gate is bypassed by a direct client call — `WorkOrder`'s RLS policy is already permissive project-wide, so the UI-level gate is the only protection here. Flagged as a verification item below.

**Kanban deletion:**
```bash
git rm src/components/work-orders/KanbanBoard.jsx src/components/work-orders/KanbanColumn.jsx src/components/work-orders/KanbanCard.jsx src/components/work-orders/KanbanDisplaySettings.jsx
```
Leave `base44/functions/updateWorkOrderStatus/` alone (Phase 14's job).

**Dead-import removal (mechanical, no behavior change):**
| File | Remove |
|---|---|
| `DocumentEditor.jsx:4` | `Customer, Vehicle, InventoryTxs, CustomerPayments` from the entity import (keep `WorkOrder, SystemSettings, WorkOrderStatus` until 13B/13C convert them) |
| `AdvancePaymentModal.jsx:10` | Entire `WorkOrder, GLTransaction` import line |
| `WorkOrders.jsx` | `TagAlong` from its import block |
| `WOAddInventoryModal.jsx:11-12` | Both `inventoryAdd`/`inventoryUpdate` import lines |
| `ReceivePartModal.jsx:6` | `base44` client import |
| `useDocumentEditorSave.jsx` | `manageWorkOrderLock` import, `WorkOrder` import (executed, see 13A.4) |
| `AdvancePaymentModal.jsx` | `base44` client import (cascaded dead after the `WorkOrder, GLTransaction` removal above — executed, see 13A.4) |
| `WorkOrders.jsx` | `base44` client import (cascaded dead after `flushWorkOrderLocks` conversion — executed, see 13A.4) |

### 13A.3) Verification Checklist

- [x] `set_workorder_lock` RPC deployed to dev branch (`sitihbdnuxifwibontcm`); validated via direct SQL (acquire, contested-apply returns current holder, stale-lock steal after simulating a >120min-old lock, owner-gated release, non-owner release correctly no-ops) — **not yet tested through the actual UI** (needs the user's manual `/dev-login` pass); **not yet applied to production** — holding per the user's note that testing needs manual intervention first
- [ ] Same migration applied to production after dev UI verification (SQL is ready — see `13A.2` above, unchanged)
- [x] All 4 `DocumentEditor.jsx` lock call sites converted (lines ~555, ~634, ~1042, ~1261 post-edit); `manageWorkOrderLock` import removed. Note: `postKeepAliveFunction('manageWorkOrderLock', ...)` (beforeunload/pagehide background release, ~line 293) was deliberately left untouched — it's a raw `fetch` to `/functions/manageWorkOrderLock` by name, not the imported function, wasn't in the plan's 4-call-site list, and still works unchanged against the untouched base44 route since it mutates the same `LockedByUser`/`locked_timestamp` columns the new RPC also owns. Flagging in case a future sub-phase wants to fold it into the RPC too.
- [x] `useDocumentEditorSave.jsx`'s lock-refresh call converted; the dead `else` branch (legacy `WorkOrder.update()` + `SupabaseProxy` audit-diff read, gated on `!useFunctionData`) deleted, and the now-dead `useFunctionData` param/dependency stripped from the hook entirely since both call sites always pass it `true`. `WorkOrder` entity import also removed (its only use was inside the deleted branch).
- [x] `WorkOrders.jsx`'s `flushWorkOrderLocks` converted to a direct bulk update. **Admin-only UI gating NOT added** — audited and confirmed there is no `admin`/`role` field anywhere in `AuthContext`/`Employee` to gate on today; the "Flush Locks" button was already unguarded pre-migration (called an Edge Function with no visible auth check either), so this is a pre-existing gap, not a regression introduced here. Flagging for the user rather than inventing a gating field out of scope.
- [x] `KanbanBoard.jsx`/`KanbanColumn.jsx`/`KanbanCard.jsx`/`KanbanDisplaySettings.jsx` deleted (`git rm`); repo-wide grep confirmed zero other importers before deletion.
- [x] `updateWorkOrderStatus` confirmed not ported (its only caller was the deleted `KanbanBoard.jsx`)
- [x] All 5 planned dead-import cleanups applied, plus 2 more surfaced by lint as a direct consequence of this sub-phase's edits (`base44` went dead in `AdvancePaymentModal.jsx` and `WorkOrders.jsx` once their last usages — `GLTransaction`-adjacent dead code and `flushWorkOrderLocks`, respectively — were removed/converted)
- [x] `npm run build` clean (verified twice, before and after the lint-driven cleanup pass). `npx eslint` clean **for everything this sub-phase touched or made dead**; pre-existing unrelated unused-import debt remains in `DocumentEditor.jsx`, `WorkOrders.jsx`, and `WOAddInventoryModal.jsx` (unused lucide icons, unused shadcn/ui imports, etc.) — out of scope, not introduced by 13A

### 13A.4) Retrospective — Lessons Learned, Deviations & Handoff Notes for 13B

**Current exact state (post-edit line numbers, so a cold session can `grep` straight to them):** `DocumentEditor.jsx`'s 4 converted lock call sites now sit at lines **554** (apply), **634**, **1042**, **1261** (release ×3). The untouched keepalive reference is still at line 293.

**RPC status — dev-only, code frozen and ready for prod replay:** `set_workorder_lock` exists only on the dev branch (`sitihbdnuxifwibontcm`) right now. The SQL in `13A.2` above is final (validated via direct SQL: acquire, contested-apply, stale-steal after a simulated >120min-old lock, owner-gated release, non-owner release no-op — all matched design intent on the first attempt, no schema surprises). **Do not re-derive or "improve" this SQL when deploying to production** — replay it verbatim via `apply_migration` against `hbcrwkmgsazqrvsrmxyr` once the user confirms their manual `/dev-login` UI pass is good. This production deploy is the one remaining open item from 13A and should happen before or alongside the start of 13B's own dev work (13B doesn't depend on it, but there's no reason to leave it hanging).

**Deviations from the original 13A.1/13A.2 spec (all mechanical, zero behavior change, captured above in the scope/dead-import tables too):**
1. `useDocumentEditorSave.jsx`'s `useFunctionData` param was removed entirely, not just its dead branch — once the `else` branch was deleted, the param had no remaining reader in that file.
2. Two extra dead imports (`base44` in `AdvancePaymentModal.jsx` and in `WorkOrders.jsx`) were removed after `npx eslint` flagged them as newly-orphaned by 13A's other edits. **Lesson for 13B-13E:** this project's eslint config treats an unused *import* as an `error` (not just `warning` — unused local *variables* are the ones downgraded to warning), so it reliably catches cascading dead imports. Always run a full `npx eslint` pass (not just `npm run build`) after each sub-phase's edits, specifically on every file touched, to catch this same cascade — `npm run build` alone does not fail on unused imports.

**New finding, deliberately not touched in 13A, flagged for 13B:** `DocumentEditor.jsx` still has two `useFunctionData ? workOrder : await WorkOrder.get(...)` ternaries (now at lines **510** and **631**, inside the lock-acquire effect and the release-on-unmount effect respectively). By the same logic already proven for `useDocumentEditorSave.jsx`'s dead branch — both `EstimateEdit.jsx` and `WorkOrderEdit.jsx` hardcode `useFunctionData` as a bare (always-`true`) prop — the `: await WorkOrder.get(...)` half of both ternaries is equally dead code, never hit in practice. This was correctly left alone in 13A (13A.1 explicitly scoped `getworkorderdata`/`WorkOrder`-fetch cleanup out to 13B), but since 13B is exactly where `DocumentEditor.jsx`'s `WorkOrder`/`SystemSettings`/`WorkOrderStatus` entity-read conversions happen, this is the natural place to also collapse these two ternaries down to just `workOrder` (matching the simplification 13B.2 already proposes for `useWorkOrder.jsx`'s own `customer_details`/`vehicle_details` branches) and finally drop the `WorkOrder` import from `DocumentEditor.jsx` for good — verify with the same "check both entry points" technique below before deleting.

**Reusable verification technique surfaced this sub-phase:** before deleting/simplifying any code gated on a prop/flag that a plan doc claims is "always true/false in practice," don't just trust the claim — grep every actual call site of the component/hook (here: `grep '<DocumentEditor' src/pages/*.jsx`) and confirm the literal value passed at each one. Cheap, and this is exactly what caught that the `useFunctionData` claim in `useDocumentEditorSave.jsx` (and now the two `WorkOrder.get()` ternaries above) held up.

**Data-volume caveat for 13B/13C's own exit criteria:** the dev branch's `WorkOrder` table currently has only **one row** (`ro_number = 'RO5001'`, used as the RPC test fixture above, left back in its original unlocked state). 13B's exit criteria calls for validating `search_work_orders` "row-for-row against the old JS `getworkorderlist`" across every sort preset and a real search term — that comparison needs multiple `WorkOrder` rows across different stages/customers to be meaningful. With only one row on dev, either seed a handful of representative test rows first, or validate the new RPC's *query logic* by reading it against production data (read-only `execute_sql`, no writes) instead of relying on dev-branch row counts. Flag this to the user before starting 13B's RPC validation step.

---

## 13B) SUB-PHASE B: Core Data Backbone

### 13B.1) Scope & Objectives

**In scope:**
1. `getworkorderdata` → collapse to a plain thin data-fetch, inlined directly (no Edge Function — see 0.7). Its dormant/broken lock branch is dropped entirely, not ported.
2. `getworkorderlist` → native `search_work_orders` Postgres RPC (redesigned per 0.3).
3. `createworkorderdata` → native insert.
4. `changeWorkOrderCustomer` → native `autopro-changeWorkOrderCustomer` Edge Function.
5. `SystemSettings`/`WorkOrderStatus` simple entity-read swaps across `DocumentEditor.jsx`, `WorkOrders.jsx`, `NewWorkOrderModal.jsx`, `WorkOrderReport.jsx`.
6. `InvoiceConversion.jsx`'s `WorkOrder`/`SystemSettings` entity imports and its own `getworkorderdata` call site.

**Explicitly NOT in scope:** the business-logic functions that read/write `line_items` beyond the basic fetch (13C); documents/comms (13D).

**Prerequisite:** 13A complete (sequenced for dependency-graph clarity, though nothing in 13B directly calls the new lock RPC).

**Exit criteria (must all be true before starting 13C):** native WO fetch live in `useWorkOrder.jsx`/`InvoiceConversion.jsx` with the JSON-column-shape audit complete; `search_work_orders` RPC validated row-for-row against the old JS list function; `createworkorderdata`/`changeWorkOrderCustomer` converted and tested; `SystemSettings`/`WorkOrderStatus` reads converted; `npm run build` clean.

### 13B.2) Detailed Execution Plan

**`getworkorderdata` → inline thin fetch (no Edge Function, per 0.7's resolution):**

`useWorkOrder.jsx` (drop the `lockAction`/`lockedByUser` options entirely — dead code, per 0.7):
```diff
- import { getworkorderdata } from '@/functions/getworkorderdata';
+ // no import needed — inlined below
```
```diff
- export function useWorkOrder(roNumber, options = {}) {
-   const { useFunctionData = false, lockAction, lockedByUser } = options;
+ export function useWorkOrder(roNumber, options = {}) {
+   const { useFunctionData = false } = options;
```
```diff
  const [workOrderResponse, tagAlongsData, otherChargesData] = await Promise.all([
    useFunctionData
-     ? getworkorderdata({
-         ro_number: roNumber,
-         ...(lockAction ? { lockAction } : {}),
-         ...(lockedByUser ? { lockedByUser } : {})
-       })
+     ? supabase.from('WorkOrder').select('*').eq('ro_number', roNumber).limit(1).maybeSingle()
      : base44.functions.invoke('SupabaseProxy', { action: 'read', table: 'WorkOrder', match: { ro_number: roNumber } }).then(res => res.data?.data || []),
    TagAlong.list(),
    OtherChargeList.list(),
  ]);
```
```diff
  const wo = useFunctionData
-   ? (workOrderResponse?.data?.data || null)
+   ? (workOrderResponse?.data || null)
    : (workOrderResponse.length > 0 ? workOrderResponse[0] : null);
```
Then, still inside the `useFunctionData` branch that resolves `customer_details`/`vehicle_details` (lines 119-123), replace the base44-shimmed enrichment with the same direct calls already used in the non-`useFunctionData` branch — this collapses the two branches into effectively one code path (both now hit native Postgres directly), which is a nice simplification opportunity but not required; minimally, just confirm `wo.customer_details`/`wo.vehicle_details` are no longer populated by the removed function and fetch them the same way the `else` branch already does.

**Critical JSON-column audit (flagged in §0.7/Pre-flight):** the old `getworkorderdata` function's `normalizeWorkOrder()` step **stringified** `line_items`/`payments`/`accounting_details`/`tech_time` before returning (Base44's REST layer needed strings). Native `supabase-js` returns `jsonb` columns as already-parsed objects/arrays. `useWorkOrder.jsx`'s own `parseLineItems(wo.line_items)` (line 111) currently does `JSON.parse(itemsString)` — **this will now throw** on an already-parsed array/object. Fix:
```diff
  const parseLineItems = async (itemsString) => {
    if (!itemsString) return [];
    try {
-     const parsed = JSON.parse(itemsString);
+     const parsed = typeof itemsString === 'string' ? JSON.parse(itemsString) : itemsString;
      if (!Array.isArray(parsed)) return [];
```
**Grep for every other `JSON.parse(workOrder.` / `JSON.parse(wo.` pattern across `DocumentEditor.jsx`, `useDocumentEditorSave.jsx`, and `InvoiceConversion.jsx`** as part of this sub-item's execution (not deferred to final verification) — apply the same defensive `typeof === 'string'` guard everywhere `line_items`/`payments`/`accounting_details`/`tech_time` are consumed.

**`InvoiceConversion.jsx`'s `getworkorderdata` call site** — same inline-fetch swap, applied locally.

**`getworkorderlist` → native `search_work_orders` RPC (redesigned per 0.3):**

```sql
CREATE OR REPLACE FUNCTION search_work_orders(
  p_match jsonb DEFAULT '{}'::jsonb,
  p_stages text[] DEFAULT NULL,      -- replaces the raw orMatch string with an explicit typed param
  p_search_term text DEFAULT NULL,
  p_sort text DEFAULT 'date_newest',
  p_limit int DEFAULT 50,
  p_offset int DEFAULT 0
) RETURNS TABLE (...) LANGUAGE plpgsql AS $$
DECLARE
  v_customer_ids text[];
BEGIN
  IF p_search_term IS NOT NULL AND length(trim(p_search_term)) > 0 THEN
    SELECT array_agg(id) INTO v_customer_ids FROM "Customer"
      WHERE first_name ILIKE '%' || p_search_term || '%'
         OR last_name ILIKE '%' || p_search_term || '%'
         OR org_name ILIKE '%' || p_search_term || '%';
  END IF;

  RETURN QUERY
  SELECT wo.*, to_jsonb(c.*) AS customer, to_jsonb(v.*) AS vehicle
  FROM "WorkOrder" wo
  LEFT JOIN "Customer" c ON c.id = wo.customer_id
  LEFT JOIN "Vehicle" v ON v.id = wo.vehicle_id
  WHERE (p_stages IS NULL OR wo.stage = ANY(p_stages))
    AND (p_search_term IS NULL OR length(trim(p_search_term)) = 0 OR (
      wo.ro_number ILIKE '%'||p_search_term||'%' OR wo.wo_number ILIKE '%'||p_search_term||'%' OR
      wo.est_number ILIKE '%'||p_search_term||'%' OR wo.inv_number ILIKE '%'||p_search_term||'%' OR
      wo.crinv_number ILIKE '%'||p_search_term||'%' OR wo.description ILIKE '%'||p_search_term||'%' OR
      wo.customer_id = ANY(v_customer_ids)
    ))
  ORDER BY
    CASE WHEN p_sort = 'number_desc' THEN wo.ro_number END DESC,
    CASE WHEN p_sort = 'customer_az' THEN c.last_name END ASC,
    CASE WHEN p_sort = 'amount_highest' THEN wo.total_amount END DESC,
    wo.created_at DESC  -- default / date_newest fallback
  LIMIT p_limit OFFSET p_offset;
END;
$$;
```
**Note:** the sort-preset `CASE WHEN` list above must be filled in exhaustively against every preset name the current JS `switch` statement in `getworkorderlist/entry.ts` supports (`number_desc`, `customer_az`, `date_newest`, `amount_highest`, and others found during the source read) — treat the SQL above as a skeleton to complete during execution, not a finished spec. **Also confirm the ILIKE-based search doesn't need `escapeLikeValue`'s special-character escaping replicated** (the legacy JS helper escaped `%`/`_`/`\` in user input before building its `.or()` filter string — Postgres parameterized queries via `supabase.rpc()` don't have the same string-injection risk the old code was guarding against, since `p_search_term` is bound as a parameter, not concatenated — but literal `%`/`_` characters in a real search term would still behave as SQL wildcards unless explicitly escaped; decide whether to preserve exact literal-character matching or accept the minor UX difference).

Frontend call sites: `WorkOrders.jsx:216-217` (general + invoice-tab fetch — `p_stages: ['invoice', 'credit_invoice']` replaces the old `orMatch` string for the invoice tab), `OpenROModal.jsx:108`.

**`createworkorderdata` → native insert:**
```diff
  // WorkOrders.jsx / NewWorkOrderModal.jsx creation handlers
- const result = await createworkorderdata({ data: workOrderData });
+ const now = new Date().toISOString();
+ const { data: newWO, error } = await supabase.from('WorkOrder').insert([{
+   id: crypto.randomUUID(),
+   ...workOrderData,
+   created_date: now,
+   created_by: currentUser?.full_name || currentUser?.email || null,
+ }]).select().single();
+ if (error) throw error;
```
Confirm `ro_number`/`customer_id`/`vehicle_id` required-field validation happens client-side before this call (the old function 400'd if missing — replicate as a form-validation check).

**`changeWorkOrderCustomer` → native `autopro-changeWorkOrderCustomer`:**
```ts
// supabase/functions/autopro-changeWorkOrderCustomer/index.ts (skeleton)
const { workOrderId, newCustomerId, paymentIds } = await req.json();
const { error: woError } = await supabaseAdmin.from('WorkOrder')
  .update({ customer_id: newCustomerId, last_updated: new Date().toISOString(), last_updated_by: userEmail })
  .eq('id', workOrderId);
if (woError) return json200Error(woError.message);

let updatedPaymentsCount = 0;
if (paymentIds?.length) {
  const { data, error: payError } = await supabaseAdmin.from('CustomerPayments')
    .update({ customer_id: newCustomerId, updated_date: new Date().toISOString() })
    .eq('work_order_id', workOrderId).in('id', paymentIds).select('id');
  if (payError) return json200Error(payError.message);
  updatedPaymentsCount = data?.length || 0;
}
return json200Ok({ success: true, workOrderId, newCustomerId, updatedPaymentsCount });
```
Note: true multi-statement atomicity ideally needs a Postgres RPC wrapping both statements in one transaction — nice-to-have hardening, not a hard blocker (the legacy function wasn't atomic either, so this isn't a regression).

**`SystemSettings`/`WorkOrderStatus` reads** (`DocumentEditor.jsx:464/486`, `WorkOrders.jsx:138/893/900/904`, `NewWorkOrderModal.jsx`, `WorkOrderReport.jsx`) — straightforward direct-call swaps following the pattern established in Phases 5-7 (drop `@/entities/all` import, inline `supabase.from()`, explicit audit fields on insert/update).

### 13B.3) Verification Checklist

- [x] `useWorkOrder.jsx`'s native fetch converted (code-complete) — **not yet tested through the actual UI** (needs the user's manual `/dev-login` pass, same as 13A)
- [x] JSON-column audit complete — grepped `JSON.parse(workOrder.`/`JSON.parse(wo.` across `DocumentEditor.jsx` (6 sites, all `.payments`), `useDocumentEditorSave.jsx` (0 sites), `InvoiceConversion.jsx` (3 sites: `line_items`, `accounting_details`, `payments`); defensive `typeof === 'string'` guards applied to all 9. `WorkOrderReport.jsx` was already defensive (pre-existing `Array.isArray` check) — confirmed, not touched. **Not yet tested with a real WO carrying non-empty JSON columns** — pending manual verification.
- [x] `InvoiceConversion.jsx`'s WorkOrder fetch converted (inline `supabase.from()` for WorkOrder + Customer + Vehicle, replacing `getworkorderdata`) — not yet UI-tested
- [x] `search_work_orders` RPC deployed to dev branch; validated via direct SQL (default list, `p_stages` invoice-tab filter, `p_match` single-field lookup, `p_search_term`, `p_sort` incl. unrecognized-key fallback) — **not row-for-row against the old JS across multiple WO rows**, since dev only has 1 `WorkOrder` row (`RO5001`, same data-volume caveat 13A.4 flagged). Needs either seeded multi-row test data or a read-only production comparison before this checkbox can be called fully satisfied.
- [ ] Same RPC applied to production after dev verification
- [x] "New Work Order" and "Counter Sale" creation both converted to native insert (24-char hex id matching production's existing `WorkOrder.id` format, confirmed via direct query — not a standard UUID); `line_items`/`payments` fixed to pass raw arrays instead of `JSON.stringify()`'d strings (jsonb columns need raw values now, not strings) — **not yet UI-tested**; RO-number counter itself is unaffected (still reads/writes the base44-hosted `SystemSettings`, see §0.8)
- [x] `autopro-changeWorkOrderCustomer` deployed to dev branch — **not yet tested with a real WO that has linked payments** (needs manual verification)
- [ ] **BLOCKED, not completed** — `SystemSettings`/`WorkOrderStatus` reads: confirmed via `information_schema.tables` that neither table exists on dev or production (see §0.8). Left as base44-routed calls in all 4 files (`DocumentEditor.jsx`, `WorkOrders.jsx`, `NewWorkOrderModal.jsx`, `InvoiceConversion.jsx`) — no regression, just incomplete pending a decision on creating these tables natively (§0.8).
- [x] `npm run build` clean (no errors — vite's `logLevel: 'error'` suppresses success output, confirmed via absence of errors). `npx eslint` run on all 7 touched files: zero new errors/cascades introduced by 13B's edits — all flagged unused-import errors are pre-existing debt (lucide icons, unused shadcn/ui imports, a stray `date-fns` `format` import shadowed by `Intl.DateTimeFormat`'s `.format()` method) confirmed via `git diff` cross-reference, matching the same category of debt 13A's retrospective already flagged as out-of-scope.

### 13B.4) Retrospective — Lessons Learned, Deviations & Handoff Notes for 13C

**Full native-table inventory, confirmed directly via `information_schema.tables` on both projects (2026-08-03) — keep this list handy for 13C/13D/13E instead of re-querying each time:**
`Appointment`, `BankAccount`, `BankReconciliation`, `BankTransaction`, `CashDrawerAdjustment`, `ChartOfAccount`, `Customer`, `CustomerARAdjustment`, `CustomerPayments`, `DepositSlipBreakdown`, `Employee`, `FiscalPeriod`, `GLTransaction`, `InspectionSection`, `InventoryAuditLog`, `InventoryCategory`, `InventoryItem`, `InventoryLocation`, `InventoryReturn`, `IssueReport`, `LankarWOInfo`, `LankarWOInventory`, `LankarWOLines`, `Note`, `OldRecord`, `PTO`, `PayPeriods`, `PayrollTransaction`, `Project`, `ProjectTimeSession`, `ReturnReason`, `SalesClass`, `Supplier`, `SupplierInvoiceLine`, `SupplierPayment`, `TimeRecord`, `UnassignedTime`, `UserDevices`, `Vehicle`, `WorkOrder`, `workorderversionhistory` (+ `Approvals`, dev-branch only, per §0.4). **Not present anywhere:** `SystemSettings`, `WorkOrderStatus`, `TagAlong`, `OtherChargeList`, `Levies` (see §0.8).

**Biggest finding this sub-phase: §0.8 (see above)** — `SystemSettings`/`WorkOrderStatus` aren't native, contradicting 13B.1's own scope assumption. Deferred rather than guessed at; left both entities' call sites exactly as they were (base44-routed, zero regression). This is a real gap against 13B's original exit criteria — flagging clearly rather than marking the phase falsely complete.

**`WorkOrder.id` is NOT a standard UUID — it's a 24-char lowercase hex string** (`crypto.randomUUID().replace(/-/g, '').substring(0, 24)`), confirmed by directly querying production's existing rows (`5932e387d19e4eeca03bcffe`, 24 chars) before writing any insert code. The original 13B.2 skeleton sketch used a bare `crypto.randomUUID()` (36 chars incl. hyphens) — this would have inserted rows with an inconsistent id format had it not been checked against live data first. Both `createworkorderdata`'s native-insert replacement call sites (`WorkOrders.jsx`'s `handleCreateNewWorkOrder` and `handleCreateCounterSale`) now generate ids with the correct truncated-hex format, matching `createworkorderdata/entry.ts`'s own `insertData.id` generation exactly.

**`line_items`/`payments` must be passed as raw arrays on insert now, not `JSON.stringify()`'d strings** — since these are genuine `jsonb` columns and the insert is now a direct `supabase.from().insert()` (no Edge Function normalizing the payload in between), passing a JS string for a jsonb column stores it as a quoted JSON *string scalar*, not the array/object itself. Fixed at both source locations: `NewWorkOrderModal.jsx`'s `handleCreate` (was `line_items: "[]"`, `payments: "[]"` literal strings) and `WorkOrders.jsx`'s `handleCreateCounterSale` (was wrapping already-built arrays in `JSON.stringify()`). This is the write-side mirror of the read-side JSON-column audit in §0.7/13B.2 — same root cause (jsonb columns behave differently than Base44's REST-string-normalized shape), different direction.

**`search_work_orders` RPC design deviated from the plan's own SQL skeleton in a few ways, each verified against live schema/behavior rather than assumed:**
1. Response shape keeps the legacy's exact `"Customer"`/`"Vehicle"` (capitalized) embedded-object keys — confirmed `WorkOrderList.jsx` reads `workOrder.Customer`/`workOrder.Vehicle` directly (with a fallback to a separately-fetched array), so matching the old shape avoided touching that consumer at all.
2. `p_match` (replacing legacy's `.match(match)`) is implemented generically as `to_jsonb(wo.*) @> p_match` rather than per-field dynamic SQL — handles `OpenROModal.jsx`'s single-field equality lookups (`ro_number`/`wo_number`/`est_number`/`inv_number`) without needing a dynamic-SQL branch per field.
3. `p_limit`/`p_offset` both default to `NULL` and the query ends in `limit p_limit offset coalesce(p_offset, 0)` — exploits the fact that Postgres's `LIMIT NULL` means "no limit" to exactly reproduce all three of the legacy JS's branches (both given → paginated; only limit given → capped, no offset; neither given → the general/non-invoice tab's fully-unbounded fetch) in one clause, rather than the ranked-search RPC convention elsewhere in this project (`search_customers_ranked`/`search_inventory_ranked`) which always defaults `p_limit` to a real number.
4. `total_count` uses the same `count(*) over()` window-function-per-row pattern as `search_customers_ranked`/`search_inventory_ranked` (confirmed by reading both functions' live definitions via `pg_get_functiondef` before writing this RPC, to stay consistent with established project convention) rather than a separate count query like the legacy JS did. **Known accepted tradeoff, flagged for whoever next touches invoice pagination:** if a filtered result set comes back empty (e.g., user is sitting on a stale/out-of-range invoice page after data changed), `total_count` isn't visible on any row and `WorkOrders.jsx` falls back to `0`, which can misrender "Page X of 1" briefly. Legacy's separate always-accurate count query didn't have this edge case. Not fixed in 13B — narrow, low-likelihood (search term reset already snaps `invoicePage` back to 1), and matches this project's existing RPC-design convention elsewhere; worth a follow-up if it ever actually bites in production.
5. `escapeLikeValue` (legacy's percent/space/comma/paren escaping) was deliberately **not** replicated — read the legacy source closely enough to realize it existed only to safely embed values inside PostgREST's string-built `.or()` filter syntax, not as genuine SQL LIKE-wildcard escaping (it didn't even escape `_`, the other real LIKE wildcard). Since `search_work_orders` binds `p_search_term` as a real parameter (no string-built filter), that whole failure mode doesn't exist here — confirmed before deciding to skip it, not skipped by default.

**`autopro-changeWorkOrderCustomer` ported close to 1:1** — the legacy function's logic (single `WorkOrder` update, conditional `CustomerPayments` bulk update, non-atomic — matching legacy, not a regression) needed no redesign, just the standard auth-header/anon-client user-lookup pattern (matching `autopro-saveworkorderdata`'s existing convention) and the 200-always-with-`{error}` normalization per project convention (legacy returned 401/500 raw).

**Reusable technique reconfirmed this sub-phase:** before converting ANY entity call site to a direct `supabase.from()` call, run `information_schema.tables` (or `.columns`) against both dev and prod first — `@/entities/all`'s import path alone does not tell you whether the entity is genuinely native or still Base44-hosted. This is the direct cause of §0.8's finding and should be standing practice for every remaining entity swap in 13C/13D/13E.

---

## 13C) SUB-PHASE C: Business Logic & Small Entity Swaps

### 13C.1) Scope & Objectives

**In scope:**
1. `convertEstimateToWorkOrder` → native `autopro-convertEstimateToWorkOrder`.
2. `syncLevies` → native `autopro-syncLevies`.
3. `ReturnCoretoWO` → native `autopro-returnCoreToWO`.
4. `searchWorkOrderParts` → native `search_work_order_parts` RPC (redesigned per 0.3).
5. Every small thin-proxy entity read in the surrounding modals (table in 13C.2 below).
6. `searchInventory` swap in `GetPartModal.jsx` (reuse Phase 7B's RPC, per §0.1).

**Prerequisite:** 13B complete (several of these read the `WorkOrder`/`line_items` shape 13B establishes, including the JSON-column fix).

**Exit criteria (must all be true before starting 13D):** all 4 business-logic functions ported and tested against real WO data on dev; float-tolerance/FIFO-sort/allocation-split edge cases spot-checked; all small entity swaps converted; `npm run build` clean; repo grep confirms zero remaining base44 references in this sub-phase's file list.

### 13C.2) Detailed Execution Plan

**`convertEstimateToWorkOrder` → native `autopro-convertEstimateToWorkOrder`:**

Port the exact 6-step sequence: fetch WO → build Supplier id→name map → per-line-item QOH/QOO allocation split (full/partial/none) → **collapse the old function's own `SupabaseProxy`/`inventoryUpdate` indirection into a direct `supabaseAdmin.from('InventoryItem').update()`** (the one place native porting should simplify rather than 1:1-preserve, since those were themselves other Base44 functions being called cross-function) → `InventoryTxs` audit rows (`'Issued to WO'`/`'Ordered'`) → per-line error isolation (don't fail the whole conversion if one line's inventory step throws) → final WO update (`stage: 'work_order'`, rewritten `line_items`, `wo_date` in Mountain Time via `date-fns-tz`, clear lock fields, auto-derive `wo_number` from `ro_number` digits if absent).
```diff
  // DocumentEditor.jsx handleConvertEstimate (line 1257 area)
- await base44.functions.invoke('convertEstimateToWorkOrder', { workOrderId });
+ const { data, error } = await supabase.functions.invoke('autopro-convertEstimateToWorkOrder', { body: { workOrderId } });
+ if (error || data?.error) { console.error('Conversion error:', error || data.error); return; }
```
**Strictly cast every quantity/cost value** (`Number()`) during the port — this touches `InventoryItem.quantity_on_hand`/`.quantity_on_order` directly, a financially-adjacent write path.

**`syncLevies` → native `autopro-syncLevies`:**

Port the reconciliation algorithm exactly: reportable-levy lookup from `OtherChargeList` → target-state computation from incoming line items → net-ledger aggregation from existing `Levies` rows per `line_item_id` (sum, not replace) → float-tolerance thresholds (**0.001 qty / 0.005 amount — must match exactly**) → append-only delta-insert semantics (never mutate/delete existing `Levies` rows) → deletion-reconciliation pass for lines removed from the WO.
```diff
  // useDocumentEditorSave.jsx, always-reached branch (line ~238)
- await syncLevies({ workOrderId, lineItems });
+ const { error } = await supabase.functions.invoke('autopro-syncLevies', { body: { workOrderId, lineItems } });
+ if (error) console.error('Levy sync error:', error);
```

**`ReturnCoretoWO` → native `autopro-returnCoreToWO`:**

Port the FIFO consumption algorithm exactly: filter `InventoryReturn` by `part_number`+`work_order_id`+`status:'On-site'` → sort FIFO by `return_date` then `created_date` (**both as string compares, not date-typed — replicate exactly**) → pre-check total available quantity before mutating anything (fail-fast) → per-record consume loop (delete if fully consumed, update with recomputed `total_cost` if partially consumed) → return an action log.
```diff
  // ROCoreModal.jsx (line 61 area)
- await ReturnCoretoWO({ part_number, work_order_id, quantity });
+ const { data, error } = await supabase.functions.invoke('autopro-returnCoreToWO', { body: { part_number, work_order_id, quantity } });
```
`ROCoreModal.jsx`'s own `InventoryReturn.create()` (line 114) — direct swap following Phase 7A's exact audit-field convention (text PK, `crypto.randomUUID()`, no `updated_by`/`updated_by_id`).

**`searchWorkOrderParts` → native `search_work_order_parts` RPC (redesigned per 0.3):**
```sql
CREATE OR REPLACE FUNCTION search_work_order_parts(
  p_search_term text, p_search_type text, p_filter_type text
) RETURNS TABLE (
  wo_id text, ro_number text, wo_date date, created_at timestamptz,
  customer_id text, vehicle_id text, line_item_id text, line_item jsonb
) LANGUAGE sql AS $$
  SELECT wo.id, wo.ro_number, wo.wo_date, wo.created_at, wo.customer_id, wo.vehicle_id,
         li ->> 'id' AS line_item_id, li
  FROM "WorkOrder" wo, jsonb_array_elements(wo.line_items) li
  WHERE (
    (p_search_type = 'part_number' AND (
      (p_filter_type = 'contains'   AND li ->> 'part_number' ILIKE '%' || p_search_term || '%') OR
      (p_filter_type = 'startsWith' AND li ->> 'part_number' ILIKE p_search_term || '%') OR
      (p_filter_type = 'endsWith'   AND li ->> 'part_number' ILIKE '%' || p_search_term) OR
      (p_filter_type = 'exact'      AND li ->> 'part_number' ILIKE p_search_term)
    )) OR (p_search_type = 'serial_number' AND (
      (p_filter_type = 'contains'   AND li ->> 'serial_num' ILIKE '%' || p_search_term || '%') OR
      (p_filter_type = 'startsWith' AND li ->> 'serial_num' ILIKE p_search_term || '%') OR
      (p_filter_type = 'endsWith'   AND li ->> 'serial_num' ILIKE '%' || p_search_term) OR
      (p_filter_type = 'exact'      AND li ->> 'serial_num' ILIKE p_search_term)
    ))
  )
  ORDER BY wo.created_at DESC
  LIMIT 2000;
$$;
```
Batch-fetch matching `Customer` rows for `customer_name` enrichment client-side (or fold into the RPC via a `LEFT JOIN Customer`). `FindPartModal.jsx:39` swaps to `supabase.rpc('search_work_order_parts', {...})`.

**Remaining small thin-proxy swaps** (all follow the exact pattern established in Phases 4-7):

| File:Line | Before | After |
|---|---|---|
| `GetPartModal.jsx:40` | `SupabaseProxy` read of `SalesClass` | `supabase.from('SalesClass').select('*')` |
| `GetPartModal.jsx:41` | `TagAlong.list(null, 1000)` | `supabase.from('TagAlong').select('*').limit(1000)` |
| `GetPartModal.jsx:42` | `OtherChargeList.list(null, 1000)` | `supabase.from('OtherChargeList').select('*').limit(1000)` |
| `GetPartModal.jsx:76,117` | `searchInventory` | `supabase.rpc('search_inventory_ranked', {...})` — reuse Phase 7B's exact call shape |
| `NewWorkPROModal.jsx`, `WorkPROCommentsModal.jsx`, `WorkPROEditProjectModal.jsx`, `WorkPROModal.jsx` | `Employee.list()` (×4 files) | `supabase.from('Employee').select('*')` |
| `OtherChargeModal.jsx:52` | `OtherChargeList.filter({is_active:true})` | `supabase.from('OtherChargeList').select('*').eq('is_active', true)` |
| `OtherChargeModal.jsx:54` | `ChartOfAccount.list('account_number')` | `supabase.from('ChartOfAccount').select('*').order('account_number')` |
| `ReturnWOPartModal.jsx:22` | `ReturnReason.filter({is_active:true, hide:false})` | `supabase.from('ReturnReason').select('*').eq('is_active', true).eq('hide', false)` — reuse Phase 7A's table |
| `history/JsonToTableDisplay.jsx:140` | `ChartOfAccount.list()` | `supabase.from('ChartOfAccount').select('*')` |
| `history/WorkOrderHistoryModal.jsx:58` | `SupabaseProxy` read of `workorderversionhistory` | `supabase.from('workorderversionhistory').select('*').eq(...)` |

### 13C.3) Verification Checklist

- [ ] `autopro-convertEstimateToWorkOrder` tested with a real estimate containing a partial-QOH line item; QOH/QOO split and `InventoryTxs` rows confirmed correct
- [ ] `autopro-syncLevies` tested for add/remove/no-change cases; confirmed no duplicate ledger entries on repeated unchanged saves
- [ ] `autopro-returnCoreToWO` tested against multiple `InventoryReturn` records (full-consume + partial-consume cases), FIFO order confirmed
- [ ] `search_work_order_parts` RPC deployed to dev, tested against all 4 filter types × both search types, output matches old JS implementation
- [ ] Same RPC applied to production after dev verification
- [ ] All small entity swaps converted and tested (`GetPartModal.jsx`, `NewWorkPROModal.jsx`, `WorkPROCommentsModal.jsx`, `WorkPROEditProjectModal.jsx`, `WorkPROModal.jsx`, `OtherChargeModal.jsx`, `ReturnWOPartModal.jsx`, `history/JsonToTableDisplay.jsx`, `history/WorkOrderHistoryModal.jsx`)
- [ ] `ROCoreModal.jsx`'s `InventoryReturn.create()` follows Phase 7A's exact audit-field convention
- [ ] `npm run build` clean

---

## 13D) SUB-PHASE D: Documents & Communications

### 13D.1) Scope & Objectives

**In scope:**
1. `generateWorkOrderPdf` → native `autopro-generateWorkOrderPdf` (jsPDF-in-Deno, confirmed go-ahead per 0.5).
2. `createPortalSnapshot` → native `autopro-createPortalSnapshot`.
3. `getPortalApprovals` → thin direct `Approvals` table read (per 0.4) — includes adding the missing RLS policy on dev, then replaying the `CREATE TABLE` + policy on production.
4. `sendSms` → native `autopro-sendSms` (Twilio).
5. `sendEmailViaSMTP` → native `autopro-sendEmailViaSMTP` (Resend), including its internal shop-notification-on-failure path.
6. `getNotesBoardData` → native `autopro-getNotesBoardData`, straight 1:1 port (no RPC redesign, per 0.3).

**Prerequisite:** 13B complete (portal snapshot & PDF both read the same `WorkOrder`/`Customer`/`Vehicle` shape 13B's fetch establishes, including the JSON-column fix).

**Exit criteria (must all be true before starting 13E):** all 6 document/communication functions ported; PDF visual regression passed for all 4 stage types; portal snapshot + approvals tested with a real linked WO; SMS/email send tested against real (or sandboxed) Twilio/Resend credentials on dev; notes board output matches the old JS implementation; `npm run build` clean.

### 13D.2) Detailed Execution Plan

**`Approvals` — RLS fix + production migration (do this first, it's a prerequisite for the rest of this item):**
```sql
-- Run on dev branch (sitihbdnuxifwibontcm) first — table already exists there, just missing its policy
CREATE POLICY "Enable all operations for all users" ON "Approvals"
  FOR ALL TO public USING (true) WITH CHECK (true);

-- Then on production (hbcrwkmgsazqrvsrmxyr) — table doesn't exist yet, needs full CREATE TABLE
CREATE TABLE "Approvals" (
  id text PRIMARY KEY,
  work_order_id text,
  cp_id text,
  type text,
  approval_amount double precision,
  customer_name text,
  customer_email text,
  phone_number text,
  date_approved text,
  time_approved text,
  method_approved text,
  customer_comments text,
  created_date timestamptz,
  updated_date timestamptz,
  created_by_id text,
  created_by text,
  is_sample boolean
);
ALTER TABLE "Approvals" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Enable all operations for all users" ON "Approvals"
  FOR ALL TO public USING (true) WITH CHECK (true);
```
**`getPortalApprovals` → thin direct call:**
```diff
  // ROApprovalsModal.jsx:30
- const response = await base44.functions.invoke('getPortalApprovals', { work_order_id });
+ const { data, error } = await supabase
+   .from('Approvals')
+   .select('*')
+   .eq('work_order_id', work_order_id)
+   .order('created_date', { ascending: false })
+   .limit(100);
+ if (error) { console.error('Error loading approvals:', error); return; }
```
No Edge Function needed. The legacy `getPortalApprovals` Base44 function (hardcoded external API key and all) is simply abandoned — left alone in `base44/functions/` per the Phase 14 standing rule, never called again from `src/`.

**`generateWorkOrderPdf` → native `autopro-generateWorkOrderPdf`:**

Port using **jsPDF** (`npm:jspdf@2.5.2`), same technique as the legacy source. Preserve, in exact order: financial recompute formulas (shop supply = 6% of labor, GST = 5% of taxable base) must match `WorkOrderForm.jsx`'s own totals logic exactly — cross-check during the port, since any drift means the PDF shows different numbers than the screen; core-charge line-splitting transform (a line item with `Core_num > 0` splits into a reduced main line + a separate "CORE - description" line — **use the corrected field names from 0.6**: `Core_num`/`core_ret`/`core_cost`, confirm exact usage during the port); stage-based title/number/date selection (estimate/work_order/invoice/credit_invoice); pagination overflow thresholds (get the header/footer-height buffer wrong and content bleeds off page); payment-list filtering (exclude `on_account` from totals — same rule used in `createPortalSnapshot`, worth extracting as one shared helper during this port rather than duplicating); base64 data-URI-JSON response format matching what `WorkOrderPdfModal.jsx` already expects.
```diff
  // WorkOrderPdfModal.jsx:37
- const response = await base44.functions.invoke('generateWorkOrderPdf', {...});
+ const response = await supabase.functions.invoke('autopro-generateWorkOrderPdf', { body: {...} });
```
**Visual regression test required, not just a build check** — generate one PDF of each stage type both pre- and post-port and compare side by side.

**`createPortalSnapshot` → native `autopro-createPortalSnapshot`:**

Port the sequential WO→Customer→Vehicle fetch (404 semantics per step), unique `cp_id` generation (10-char alphanumeric, collision-retry against `CustomerPortalWorkOrder`), snapshot JSON construction, the shared `on_account`-exclusion payment calc (reuse the same helper as the PDF function), stage-based ref_number/date selection, and the final `portal_url` construction format.
```diff
  // SESEmailModal.jsx, InvoiceConversion.jsx (2 call sites total)
- await createPortalSnapshot({ work_order_id });
+ const { data, error } = await supabase.functions.invoke('autopro-createPortalSnapshot', { body: { work_order_id } });
```

**`sendSms` → native `autopro-sendSms` (Twilio):** preserve the pending-log→send→status-update sequence exactly (`SentEmailLog` row created before the Twilio call, updated to `sent`/`failed` after). Twilio env vars need to exist on both dev and prod Supabase projects — verify before considering this done.

**`sendEmailViaSMTP` → native `autopro-sendEmailViaSMTP` (Resend, despite the misleading legacy name):** preserve the pending-log→Resend-call→status-update sequence, plus **the internal shop-notification-on-failure email** — replace `base44.integrations.Core.SendEmail` with a second Resend API call (reusing `RESEND_API_KEY`) rather than dropping the failure-alerting behavior. `RESEND_API_KEY` needs to exist on both dev and prod.

**`getNotesBoardData` → native `autopro-getNotesBoardData` (straight 1:1 port, per 0.3):**

Preserve the exact current logic, no SQL redesign: fetch all `Note` rows (ordered by `updated_at desc, created_at desc`) → batch-fetch related `WorkOrder`/`Customer`/`Vehicle` by distinct IDs → per-note enrichment (customer/vehicle resolution via direct FK or via linked WorkOrder fallback, name/phone formatting) → fallback `board_column`/`board_order` assignment for notes lacking explicit placement (round-robin `% 3`, per-column running counter — **preserve this exact algorithm**, since it's what keeps un-placed notes landing in a stable, deterministic spot rather than jumping around between loads) → optional `searchTerm` substring filter across the same field set as the original.
```diff
  // WorkOrders.jsx:224
- const boardData = await getNotesBoardData({ searchTerm });
+ const { data: boardData, error } = await supabase.functions.invoke('autopro-getNotesBoardData', { body: { searchTerm } });
```

### 13D.3) Verification Checklist

- [ ] `Approvals` RLS policy added on dev, `CREATE TABLE` + policy replayed on production
- [ ] `getPortalApprovals` direct-call swap tested on a WO with real portal approval activity
- [ ] `autopro-generateWorkOrderPdf` visual-regression-tested for all 4 WO stages (estimate/work_order/invoice/credit_invoice) against pre-migration output
- [ ] `autopro-createPortalSnapshot` tested with a real WO/Customer/Vehicle; `on_account` payment exclusion confirmed matching the PDF function's own calc
- [ ] `autopro-sendSms` tested (Twilio secrets confirmed present on dev+prod), `SentEmailLog` status transitions confirmed
- [ ] `autopro-sendEmailViaSMTP` tested (Resend secrets confirmed present on dev+prod), including the failure-path shop-notification email
- [ ] `autopro-getNotesBoardData` tested; fallback column/order logic confirmed stable for a note with no explicit placement; search filter tested
- [ ] `npm run build` clean

---

## 13E) SUB-PHASE E: `WOAddInventoryModal.jsx` Full Migration & Final Sweep

### 13E.1) Scope & Objectives

**In scope:**
1. Full native rewire of `WOAddInventoryModal.jsx` — the file Phase 7B explicitly left alone, reusing Phase 7A/7B's already-live assets verbatim (`InventoryCategory` table, `autopro-suggestInventoryCategory` function, `search_inventory_ranked` RPC).
2. `WarrantyReturnModal.jsx`'s lone `WorkOrder.get()`/`.update()` calls — the item Phase 7 explicitly deferred to this phase.
3. Repo-wide grep sweep + build/lint clean + full WO-lifecycle regression (phase-close gate).

**Prerequisite:** 13A (the InventoryCategory/suggestInventoryCategory/search_inventory_ranked assets are already satisfied today, independent of 13A-13D's own work), 13B (WarrantyReturnModal needs the corrected `WorkOrder` fetch/update shape).

**Exit criteria (phase close):** grep sweep clean; `npm run build`/`npx eslint` clean; full WO-lifecycle regression passed; `master_blueprint.md` updated.

### 13E.2) Detailed Execution Plan

**Standing coordination check first:** re-grep `phase_7_implementation_plan.md`'s live status for "WOAddInventoryModal" before starting, per §0.1's protocol (confirm 7C hasn't grown to touch this file).

**`WOAddInventoryModal.jsx` — full native rewire:**
```diff
- import { TagAlong, OtherChargeList, InventoryCategory } from '@/entities/all';
- import { base44 } from '@/api/base44Client';
+ import { supabase } from '@/lib/supabase';
```
(`inventoryAdd`/`inventoryUpdate` imports already removed in 13A — confirmed dead/unused.)

Line ~142-146 (`loadData`):
```diff
- const [suppliersData, salesClassesData, tagAlongsData, otherChargesData, categoriesData] = await Promise.all([
-   ...
-   TagAlong.list(),
-   OtherChargeList.list(),
-   InventoryCategory.list()
- ]);
+ const [suppliersResult, salesClassesResult, tagAlongsResult, otherChargesResult, categoriesResult] = await Promise.all([
+   ...
+   supabase.from('TagAlong').select('*'),
+   supabase.from('OtherChargeList').select('*'),
+   supabase.from('InventoryCategory').select('*').order('name')
+ ]);
+ // unwrap .data/.error for each, matching the decoupled-try/catch pattern Phase 7A
+ // established for InventoryAddModal.jsx (a failure in one fetch must not silently
+ // block the others in the same Promise.all)
```

Line 569 (`suggestInventoryCategory`) — **reuse Phase 7B's exact call shape, verbatim** (already proven live in `InventoryAddModal.jsx`):
```diff
- const response = await base44.functions.invoke('suggestInventoryCategory', {
-     part_number: formData.part_number,
-     description: formData.description,
-     supplier_name: supplierName
- });
+ const response = await supabase.functions.invoke('autopro-suggestInventoryCategory', {
+     body: {
+         part_number: formData.part_number,
+         description: formData.description,
+         supplier_name: supplierName
+     }
+ });
+ if (response.error) { console.error('Category suggestion error:', response.error); return; }
```

Line 169 (`searchInventory`) — reuse Phase 7B's `search_inventory_ranked` RPC swap, same shape as `GetPartModal.jsx` in 13C.

**`WarrantyReturnModal.jsx` — close out Phase 7's deferred item:**
```diff
- import { WorkOrder } from '@/entities/all';
+ import { supabase } from '@/lib/supabase';
  ...
  // line 195
- const wo = await WorkOrder.get(workOrder.id);
+ const { data: wo, error } = await supabase.from('WorkOrder').select('*').eq('id', workOrder.id).single();
+ if (error) throw error;
  ...
  // line 212
- await WorkOrder.update(workOrder.id, { line_items });
+ const { error: updateError } = await supabase.from('WorkOrder').update({ line_items, last_updated: new Date().toISOString() }).eq('id', workOrder.id);
+ if (updateError) throw updateError;
```

**Final repo-wide sweep:**
```bash
grep -rn "base44\|@/entities/all\|@/functions/" src/components/work-orders/ src/pages/WorkOrders.jsx src/components/hooks/useWorkOrder.jsx src/pages/InvoiceConversion.jsx
```
Expect zero hits once 13A-13E are all complete. Any remaining hit is either a missed call site or something that should have been explicitly flagged as out-of-scope in Section 1 — investigate before closing the phase.

### 13E.3) Verification Checklist

**`WOAddInventoryModal.jsx` & `WarrantyReturnModal.jsx`:**
- [ ] `WOAddInventoryModal.jsx` fully converted; supplier/sales-class/tag-along/other-charge/category dropdowns all tested live
- [ ] Inventory search-as-you-type tested; AI category suggestion tested (returns a real result)
- [ ] `WarrantyReturnModal.jsx`'s `WorkOrder.get()`/`.update()` converted and tested — process a LANKAR-legacy-style warranty return, confirm the `line_items` warranty-counter stamp persists correctly
- [ ] Repo-wide grep sweep returns zero `base44`/`@/entities/all`/`@/functions/` hits in this phase's file scope
- [ ] `npm run build` and `npx eslint` both clean, zero new errors/warnings on touched files

**Full Lifecycle Regression (phase-close gate):**
- [ ] Create a new WO (both "New Work Order" and "Counter Sale" paths)
- [ ] Save as estimate, add line items/parts/cores/other-charges, confirm levy sync behaves correctly
- [ ] Convert estimate → work order (confirm QOH/QOO allocation and `InventoryTxs` audit rows)
- [ ] Convert work order → invoice (confirm `autopro-handleInvoiceConversionGL` output unaffected — spot-check pre/post)
- [ ] Record a payment, confirm GL entries unaffected
- [ ] Confirm inventory QOH correct after the full receive→WO→convert cycle
- [ ] Confirm tech time / WorkPRO project pairing still functions (untouched by this phase)
- [ ] Generate a PDF, create a portal snapshot, send an SMS and an email — all from the same real WO
- [ ] Void a WO, confirm status/lock behavior unaffected
- [ ] Process a core return and a warranty return against real inventory data
- [ ] Test the notes board and "flush all locks" admin action one final time in the fully-migrated state
- [ ] `master_blueprint.md` Phase 13 status updated to Tested; 0.6's core-field-name correction and 0.5's PDF-pattern note rolled into the blueprint
