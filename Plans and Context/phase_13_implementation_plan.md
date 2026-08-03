# Phase 13 Implementation Plan: Work Orders Core (`DocumentEditor.jsx` and friends)

**Status:** **In Progress, phase-close regression complete pending one redeploy** — 13A code-complete/dev-deployed, 13B code-complete/dev-deployed, 13C mostly code-complete (`syncLevies` deferred — no `Levies` table yet, see §0.8/§13C.4), 13D **`[Tested]`** (2026-08-03, see "Phase Results and Final Context"), 13E **`[Tested]`** (2026-08-03 — both 13E's own scope and the phase-close Full Lifecycle Regression fully executed live against `test.kensauto.ca`; see §13E.3/§13E.4/§13E.5). **6 real, previously-unexercised bugs found and fixed this session** across 8 files (2 in `WOAddInventoryModal.jsx`, 1 in `WarrantyReturnModal.jsx`, 2 in `WorkOrders.jsx`'s Counter Sale path, 5 in the `payments` jsonb-handling class) — all build/lint clean; all except the second Counter Sale fix are confirmed re-verified live post-deploy. **Blocking item before this phase can close: redeploy + re-verify Counter Sale one more time** (task tracked, see §13E.5 item 1). Production untouched across the board — every sub-phase so far is dev-branch-only pending a deliberate production-replay pass.
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
| **13B — Core Data Backbone** | `getworkorderdata` → plain thin data-fetch (its dormant lock branch is dead code — see 0.7, dropped entirely, not ported); `getworkorderlist` → native `search_work_orders` RPC (redesigned, per 0.3); `createworkorderdata` → native insert; `changeWorkOrderCustomer` → native `autopro-changeWorkOrderCustomer`; `SystemSettings`/`WorkOrderStatus` swap. | [x] Fully code-complete, dev-deployed (RPC + edge function + RLS policies) — prod deploy + UI verification pending (manual) | **13A** (nothing lock-related actually, but sequenced second per dependency graph) |
| **13C — Business Logic & Small Entity Swaps** | `convertEstimateToWorkOrder` → native `autopro-convertEstimateToWorkOrder`; `syncLevies` → native `autopro-syncLevies`; `ReturnCoretoWO` → native `autopro-returnCoreToWO`; `searchWorkOrderParts` → native `search_work_order_parts` RPC (redesigned, per 0.3); every small thin-proxy entity read across the "friend" modals. | [x] Mostly code-complete, dev-deployed — **`syncLevies` deferred**, `Levies` table still doesn't exist (see §0.8/§13C.4); prod deploy + UI verification pending (manual) | **13B** (several of these read `WorkOrder`/line_items shapes 13B establishes) |
| **13D — Documents & Communications** | `generateWorkOrderPdf` → native `autopro-generateWorkOrderPdf` (jsPDF-in-Deno, confirmed go-ahead per 0.5); `createPortalSnapshot` → native `autopro-createPortalSnapshot`; `getPortalApprovals` → **thin direct call** to the now-native `Approvals` table (per 0.4, resolved); `sendSms` → native `autopro-sendSms` (Twilio); `sendEmailViaSMTP` → native `autopro-sendEmailViaSMTP` (Resend); `getNotesBoardData` → native `autopro-getNotesBoardData`, straight 1:1 port, **no RPC redesign** (per 0.3). | **[Tested]** — dev-deployed and fully live-verified against `test.kensauto.ca` 2026-08-03, all 6 functions confirmed with real external side effects (real SMS/email delivered, all 4 PDF stages, real portal snapshots); see "Phase Results and Final Context" for the full rollup, 4 bugs fixed along the way (none in 13D's own new code), and the small handful of genuinely-untested items (Notes board fallback UI, Approvals non-empty path, email failure-path) | **13B** (portal snapshot & PDF both read the same `WorkOrder`/`Customer`/`Vehicle` shape 13B's fetch establishes) |
| **13E — `WOAddInventoryModal.jsx` Full Migration & Final Sweep** | Full native rewire of `WOAddInventoryModal.jsx` (the file Phase 7B explicitly left alone), reusing 7A/7B's already-live assets verbatim. `WarrantyReturnModal.jsx`'s lone `WorkOrder.get()`/`.update()` calls (deferred by Phase 7) swapped to direct calls. Repo-wide grep sweep + `npm run build` + full WO-lifecycle regression (phase-close gate). | [x] **`[Tested]`** 2026-08-03 — 13E's own scope AND the full phase-close lifecycle regression both executed live against `test.kensauto.ca`. Repo-wide sweep caught 3 base44 items missed by earlier sub-phases (§13E.4). Live testing found and fixed 6 real bugs total (§13E.3, §13E.5): 2 in `WOAddInventoryModal.jsx` (missing `InventoryItem.id`; QOO/QOH string-concatenation data corruption), 1 in `WarrantyReturnModal.jsx` (missing `GLTransaction.id`), 2 in `WorkOrders.jsx`'s Counter Sale path (non-existent columns `cp_id` then `customer_complaint`/`estimated_hours`/`scheduled_date`/`technician`), 5 in the `payments` jsonb-handling class across `FinancialSummary.jsx`/`WorkOrderViewFinancialSummary.jsx`/`AdvancePaymentModal.jsx`/`SESEmailModal.jsx`/`BatchSendWorkOrdersModal.jsx`. All build/lint clean; all re-verified live post-deploy except the second Counter Sale fix (needs one more redeploy+retest). Full regression checklist (estimate→WO, invoice conversion GL, payment, PDF/portal/SMS/email, void, core+warranty return, notes board, flush locks) all passed — GL balance-checked to the penny (8 txs, debits=credits=$90.81). All test data cleaned up. | **13A** (InventoryCategory/suggestInventoryCategory/search_inventory_ranked assets, already satisfied today), **13B** (WarrantyReturnModal's WorkOrder shape) |

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

### 0.8 — RESOLVED (2026-08-03, same session): `SystemSettings`, `WorkOrderStatus`, `TagAlong`, `OtherChargeList` created natively on dev branch by the user mid-execution; `Levies` still unconfirmed

**Update:** the four tables below were added to the **dev branch** (`sitihbdnuxifwibontcm`) partway through 13B's execution. Re-verified directly via `information_schema.tables` — all four now exist there with real seeded data (`SystemSettings`: 1 row, `WorkOrderStatus`: 8 rows, `TagAlong`: 13 rows, `OtherChargeList`: 42 rows). **Still absent on production** (`hbcrwkmgsazqrvsrmxyr`) — needs the same tables replayed there before a production deploy, standard dev-first pattern. **RLS was enabled with zero policies on all four** (the exact landmine below originally predicted) — fixed by adding the standard `"Enable all operations for all users"` policy to each before wiring up any frontend call (migration `add_rls_policy_systemsettings_workorderstatus_tagalong_otherchargelist`, dev branch only so far). `Levies` (needed by 13C's `syncLevies` port) has **not** been independently re-checked yet — confirm before starting that piece of 13C.

All four entities' call sites across `DocumentEditor.jsx`, `WorkOrders.jsx`, `NewWorkOrderModal.jsx`, `InvoiceConversion.jsx` (`SystemSettings`/`WorkOrderStatus`) and `useWorkOrder.jsx` (`TagAlong`/`OtherChargeList`) have now been converted to direct `supabase.from()` calls as originally scoped. `GetPartModal.jsx`'s and `OtherChargeModal.jsx`'s `TagAlong`/`OtherChargeList` call sites (13C scope) are now unblocked too — same tables, same RLS fix already in place.

**Original finding, kept below for the record (the process lesson still stands even though the blocker itself is resolved):**

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

### 0.9 — NEW FINDING (live-tested 2026-08-03 against `test.kensauto.ca`): base44-proxy returns 401 for every still-base44-routed call in this session — environment-wide, not caused by Phase 13's code; plus one real bug found and fixed in `search_inventory_ranked`

**The environmental issue:** logged into `test.kensauto.ca` via `/dev-login` with a real Supabase-auth session (`test@kensauto.ca`), every call that still goes through the base44 SDK's legacy proxy (`https://hbcrwkmgsazqrvsrmxyr.supabase.co/functions/v1/base44-proxy/...`) returned **401**, regardless of which page or which phase's code triggered it: `Layout.jsx`'s own settings fetch (app-wide, not Phase 13), `WorkOrders.jsx`'s `getNotesBoardData` call (13D scope, untouched), and `useInventory.jsx`'s `useShopData()` hook (`InventoryItem`/`Employee.list()`, Phase 7 domain, untouched). **Every genuinely-native Supabase call in the same session succeeded** — `search_work_orders`, `search_work_order_parts`, `set_workorder_lock`, direct `SystemSettings`/`WorkOrderStatus`/`TagAlong`/`OtherChargeList` table reads, and all three new `autopro-*` Edge Functions all returned 200 with correct data through the real authenticated session. This strongly localizes the 401 to the base44-proxy's own auth validation for this specific test session/user — not something Phase 13's code touches or can fix. **Flagging for the user rather than attempting a fix**: this blocks any UI page that still has even one base44-routed call in its data-loading path (which, until Phase 14, is most pages) — it will keep blocking sub-phase UI verification across 13D/13E and other in-flight phases (7C, 8) until resolved at the base44-proxy/session level.

**Concrete consequence for this phase:** `DocumentEditor.jsx` could not be visually verified end-to-end — `useShopData()` throws before the page finishes loading, showing "Error loading work order / Failed to load inventory or employee data." The underlying `WorkOrder`/`SystemSettings`/`WorkOrderStatus` reads and the `set_workorder_lock` RPC that `DocumentEditor.jsx` itself depends on were independently confirmed working via direct authenticated `fetch()` calls (bypassing the broken base44 path entirely) — see the 13A/13B checklists above — so this is very likely a UI-render blocker only, not a sign that this phase's own conversions are broken. Re-verify visually once the base44-proxy 401 is resolved.

**One real, unrelated bug found and fixed while testing 13C:** `search_inventory_ranked` exists as **two overloaded functions** in the dev database — one from an earlier Phase 7B iteration (6 params, no location filter) and one from a later iteration (8 params, with `p_location_from`/`p_location_to`). `GetPartModal.jsx`'s two call sites (added this session) called it with only `p_search_term`/`p_limit`, which PostgREST can't resolve unambiguously between the two overloads (`300 "Could not choose the best candidate function"`). Fixed by passing `p_location_from: null, p_location_to: null` explicitly on both calls, confirmed working afterward via live authenticated `fetch()`. **Follow-up cleanup — RESOLVED 2026-08-03** (see `search_inventory_ranked_overload_cleanup_plan.md` for full detail): dropped the older 6-param overload on both dev (`sitihbdnuxifwibontcm`) and production (`hbcrwkmgsazqrvsrmxyr`) via a tracked migration (`drop_stale_search_inventory_ranked_6param_overload`), confirmed via `pg_proc` that exactly one (8-param) overload remains on each, and smoke-tested both real calling-convention shapes (`null`/`null` and `''`/`''` for `p_location_from`/`p_location_to`) against live data on both environments with no ambiguity error. Also fixed an adjacent discrepancy found while researching this cleanup: the checked-in `src/supabase/search_inventory_ranked.sql` had a `p_include_inactive` parameter that was never actually deployed — rewritten to match the live 8-param definition verbatim.

**Reusable technique from this pass:** live-testing through the actual authenticated session (decoding the `supabase-auth-token` cookie already set by `/dev-login`, then calling REST/RPC/Edge-Function endpoints directly with that JWT) validates real RLS + auth behavior — strictly stronger evidence than `execute_sql`'s service-role bypass used earlier in 13A/13B/13C, and it works even when the frontend UI itself can't fully render due to unrelated blockers like §0.9's base44-proxy issue.

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

- [x] `set_workorder_lock` RPC deployed to dev branch (`sitihbdnuxifwibontcm`); validated via direct SQL (acquire, contested-apply returns current holder, stale-lock steal after simulating a >120min-old lock, owner-gated release, non-owner release correctly no-ops). **Live-tested 2026-08-03 against `test.kensauto.ca`** (real authenticated session, `test@kensauto.ca`) via direct authenticated `fetch()` calls to the dev-branch REST endpoint — apply/contested-apply/release/non-owner-no-op all confirmed working correctly through real RLS + auth, not just service-role SQL. RO5001 (the shared dev fixture row) was left unlocked afterward. **Still not applied to production** — holding per the user's note that testing needs manual intervention first
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

- [x] `useWorkOrder.jsx`'s native fetch converted (code-complete). **Could not be visually verified through `DocumentEditor.jsx`'s actual UI** — blocked by an unrelated, pre-existing issue: `useShopData()` (`src/components/hooks/useInventory.jsx`, Phase 7 domain, not touched by Phase 13) throws before render because its own `Employee.list()`/`InventoryItem` base44-proxy calls 401 for this test session (see new §0.9 — this is environment-wide, not specific to my code). The underlying `WorkOrder`/`SystemSettings`/`WorkOrderStatus` reads and the `set_workorder_lock` RPC were independently confirmed working via direct authenticated `fetch()` (see 13A checklist above and §0.9)
- [x] JSON-column audit complete — grepped `JSON.parse(workOrder.`/`JSON.parse(wo.` across `DocumentEditor.jsx` (6 sites, all `.payments`), `useDocumentEditorSave.jsx` (0 sites), `InvoiceConversion.jsx` (3 sites: `line_items`, `accounting_details`, `payments`); defensive `typeof === 'string'` guards applied to all 9. `WorkOrderReport.jsx` was already defensive (pre-existing `Array.isArray` check) — confirmed, not touched. **Not yet tested with a real WO carrying non-empty JSON columns** — pending manual verification.
- [x] `InvoiceConversion.jsx`'s WorkOrder fetch converted (inline `supabase.from()` for WorkOrder + Customer + Vehicle, replacing `getworkorderdata`) — not yet UI-tested
- [x] `search_work_orders` RPC deployed to dev branch; validated via direct SQL (default list, `p_stages` invoice-tab filter, `p_match` single-field lookup, `p_search_term`, `p_sort` incl. unrecognized-key fallback) — **not row-for-row against the old JS across multiple WO rows**, since dev only has 1 `WorkOrder` row (`RO5001`, same data-volume caveat 13A.4 flagged). **Live-tested 2026-08-03**: confirmed via real authenticated `fetch()` AND through the actual `WorkOrders.jsx` UI on `test.kensauto.ca` — the Work In Progress tab correctly renders `WO5001`. One bug found and fixed live: `loadData()`'s `Promise.all` mixed this RPC with the still-base44-routed `getNotesBoardData` call — a `getNotesBoardData` 401 (unrelated environmental issue, see §0.9) was rejecting the whole batch and blanking the page even though the RPC itself succeeded. Fixed by giving `getNotesBoardData` its own `.catch()` so a failure there no longer poisons the RPC results — exactly the "`Promise.all` mixing native + still-base44 calls" landmine this plan's own lessons-learned section already named. Needs either seeded multi-row test data or a read-only production comparison before the row-for-row comparison itself can be called fully satisfied.
- [ ] Same RPC applied to production after dev verification
- [x] "New Work Order" and "Counter Sale" creation both converted to native insert (24-char hex id matching production's existing `WorkOrder.id` format, confirmed via direct query — not a standard UUID); `line_items`/`payments` fixed to pass raw arrays instead of `JSON.stringify()`'d strings (jsonb columns need raw values now, not strings) — **not yet UI-tested** (would require creating a real new WO on the shared dev fixture, deferred to avoid cluttering it); RO-number counter itself is unaffected (still reads/writes the base44-hosted `SystemSettings`, see §0.8)
- [x] `autopro-changeWorkOrderCustomer` deployed to dev branch. **Live-tested 2026-08-03** via authenticated `fetch()` with a nonexistent `workOrderId` — correctly returned `{"error":"Cannot coerce the result to a single JSON object"}`, which is PostgREST's standard `.single()`-on-zero-rows error and exactly matches what the *legacy* function would also throw for an invalid id (verified by re-reading its source) — not a regression, just untested with a real linked-payments WO yet.
- [x] `SystemSettings`/`WorkOrderStatus` reads converted and RLS-fixed on dev, once the user created both tables mid-execution (see §0.8) — converted in all 4 files (`DocumentEditor.jsx`, `WorkOrders.jsx`, `NewWorkOrderModal.jsx`, `InvoiceConversion.jsx`); `useWorkOrder.jsx`'s `TagAlong`/`OtherChargeList` calls converted too while the file was already open (not originally itemized in 13B.1, but same file, same fix, same session). **Live-tested 2026-08-03**: all 4 tables confirmed readable via real authenticated `fetch()` (not just service-role) with real seeded data — RLS policies working correctly; production still needs both tables + RLS policy replayed (dev-only so far)
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

- [x] `autopro-convertEstimateToWorkOrder` deployed to dev. **Live-tested 2026-08-03** via authenticated `fetch()` with a nonexistent `workOrderId` — correctly returned `{"error":"Work Order not found"}` (graceful 200-with-error, matching the port's own not-found handling) — not yet tested with a real estimate containing line items (needs manual UI pass); ported using the established Phase 7 `update_inventory_with_audit` RPC (+ its `trg_inventory_audit` trigger) instead of a raw `InventoryTxs`-style manual insert — see §13C.4 for why and how the two-audit-row semantics were preserved
- [ ] **DEFERRED, not completed** — `autopro-syncLevies`: `Levies` table confirmed absent from both dev and production (re-checked at start of 13C). Left `useDocumentEditorSave.jsx`'s `syncLevies` call site untouched (still base44-routed) — no regression, just incomplete. See §0.8/§13C.4.
- [x] `autopro-returnCoreToWO` deployed to dev, ported as a close-to-1:1 translation (FIFO string-compare sort preserved exactly). **Live-tested 2026-08-03** via authenticated `fetch()` with a nonexistent work order — correctly returned `{"success":false,"error":"Not enough quantity in Inventory Return...","total_available":0,"requested_quantity":1,"matched_records":0}`, exactly the designed fail-fast path — not yet tested against real multi-record `InventoryReturn` data (needs manual UI pass)
- [x] `search_work_order_parts` RPC deployed to dev; validated via direct SQL and **live-tested 2026-08-03** via authenticated `fetch()` (200, correctly empty against the dev fixture's line items) — not tested against all 4 filter types × both search types with real data (dev branch still has near-zero `WorkOrder`/line-item volume, same data-volume caveat as 13B/13A)
- [ ] Same RPC applied to production after dev verification
- [x] All small entity swaps converted (`GetPartModal.jsx` incl. `searchInventory`→`search_inventory_ranked`, `NewWorkPROModal.jsx`, `WorkPROCommentsModal.jsx`, `WorkPROEditProjectModal.jsx`, `WorkPROModal.jsx`, `OtherChargeModal.jsx`, `ReturnWOPartModal.jsx`, `history/JsonToTableDisplay.jsx`, `history/WorkOrderHistoryModal.jsx`) — **one real bug found and fixed live**: `GetPartModal.jsx`'s two `search_inventory_ranked` calls only passed `p_search_term`/`p_limit`, which is ambiguous against the two overloaded versions of that RPC in the database (`search_inventory_ranked` exists both with and without `p_location_from`/`p_location_to` — a pre-existing overload left over from Phase 7B, not introduced here) — PostgREST returned `300 "Could not choose the best candidate function"`. Fixed by adding `p_location_from: null, p_location_to: null` to both call sites, confirmed working (200) afterward. See §0.9. Everything else in this list is code-complete but not yet UI-tested.
- [x] `ROCoreModal.jsx`'s `InventoryReturn.create()` converted to a direct insert following Phase 7A's audit-field convention (`id: crypto.randomUUID()`, `created_date`/`created_by`/`created_by_id`, no `updated_by`/`updated_by_id`)
- [x] `npm run build` clean; `npx eslint` on all touched files shows zero new issues — cross-referenced against `git diff` to confirm every flagged unused-import/var is pre-existing debt, not introduced by 13C

### 13C.4) Retrospective — Lessons Learned, Deviations & Handoff Notes for 13D

**`syncLevies` deferred — same missing-table category as §0.8, but this one wasn't created mid-session:** `Levies` was re-checked via `information_schema.tables` at the start of 13C and is still absent from both dev and production. Unlike `SystemSettings`/`WorkOrderStatus`/`TagAlong`/`OtherChargeList` (which the user created mid-13B), nobody has created `Levies` yet. Given this table backs a financially-adjacent ledger-reconciliation function (per the phase's own risk list), a schema was **not** invented and created unprompted — flagged for the user to decide, same pattern as §0.8. `useDocumentEditorSave.jsx`'s `syncLevies` call site is untouched and still works exactly as before (base44-routed) — no regression, just an incomplete scope item.

**`convertEstimateToWorkOrder`'s port used Phase 7's existing `update_inventory_with_audit` RPC + `trg_inventory_audit` trigger instead of a raw `InventoryTxs` insert — a bigger simplification than the plan anticipated:** the legacy function's own `InventoryTxs` entity turned out to not exist natively at all (Phase 7 renamed/redesigned it as `InventoryAuditLog`, populated automatically by an `AFTER UPDATE` trigger on `InventoryItem` that reads session-config values set by the `update_inventory_with_audit(p_item_id, p_qoh, p_qoo, p_ro_number, ..., p_tx_type, p_description, p_user_id, p_user_name, p_source_record_id)` RPC). Confirmed this convention directly by reading `autopro-processWorkOrderPartReturn/index.ts` (already-native, Phase 7-era) before writing anything — it uses this exact RPC for the common case and only falls back to a manual `InventoryAuditLog` insert when a field the trigger doesn't support (`supplier_name`) needs to be recorded.

Legacy's `convertEstimateToWorkOrder` produces **two separate audit rows** per line item when a requested quantity partially splits between QOH and QOO (one `'Issued to WO'` row with just the QOH delta, one `'Ordered'` row with just the QOO delta) — but the trigger only produces **one** row per `UPDATE` statement, capturing whatever the *net* OLD→NEW delta was. A single combined update (setting both qoh and qoo at once) would collapse legacy's two distinctly-labeled rows into one, losing the per-action delta breakdown. **Fix:** call `update_inventory_with_audit` **twice, sequentially** — first with only the QOH delta applied (QOO held at its current value), tagged `'Issued to WO'`; second with the QOO delta now applied on top (QOH held at its already-updated value), tagged `'Ordered'`. Each call's own OLD→NEW delta is correctly isolated, producing two real trigger-fired rows matching legacy's semantics almost exactly. **One accepted minor deviation:** the `'Ordered'` row's `supplier_name` isn't in a dedicated column (the trigger doesn't support that field) — folded into the row's `description` text instead (`"...— Supplier: X"`) rather than adding a second manual insert purely to attach it, which would risk a genuine duplicate-row bug instead of a labeling nuance. Flag this if a future report ever needs `supplier_name` as a real filterable column on these specific rows.

**`WorkOrder.id` truncated-hex format double-checked again, not just assumed from 13B's finding:** `autopro-convertEstimateToWorkOrder` only *reads and updates* existing `WorkOrder` rows (never inserts), so this format concern didn't actually apply here — noting only because it was the first instinct to re-verify before writing the update logic, consistent with the "check live schema, don't extrapolate" discipline this phase keeps rewarding.

**`search_work_order_parts` RPC design notes:** response field names follow the *actual* legacy response shape (`work_order_id`, not the plan skeleton's guessed `wo_id`) — confirmed by reading `searchWorkOrderParts/entry.ts` directly rather than trusting the plan's SQL sketch. Customer-name enrichment folded directly into the RPC via a `LEFT JOIN "Customer"` (one of the two options the plan explicitly allowed) rather than a second client-side round trip. One accepted behavioral nuance: legacy first limits its *work-order scan* to the most recent 2000 WOs, then searches within those; this RPC instead searches all exploded line-item rows and limits the *final result set* to 2000. These are only equivalent while total `WorkOrder` row count stays under ~2000 (currently ~1,557 in production, confirmed in 13B's pre-flight) — re-visit the query if that count grows well past 2000 and old-WO part searches start silently losing coverage under the old semantics (they wouldn't under this new one, if anything this design ages better, but it's a genuine behavioral difference worth remembering).

**`ROCoreModal.jsx` needed `useAuth()` added** — it previously had no user-context import at all (the base44 `InventoryReturn.create()` call apparently didn't need explicit audit fields client-side, likely because base44's SDK layer populated `created_by`/`created_by_id` server-side automatically). Native inserts don't get that for free, so `employee` from `useAuth()` was wired in specifically to populate those two fields on the direct insert.

**Reusable technique reconfirmed:** before porting any function that touches `InventoryItem` quantities, check whether Phase 7 already established an RPC+trigger convention for it (`update_inventory_with_audit`) rather than re-deriving raw update/insert logic — reading one already-native sibling function's source (`autopro-processWorkOrderPartReturn`) was enough to find and correctly reuse it.

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

- [x] `Approvals` RLS policy added on dev (2026-08-03) — **production `CREATE TABLE` + policy still not replayed**
- [x] `getPortalApprovals` direct-call swap tested live on `RO5001` — correct empty state, zero errors (no real portal-side approval activity exists yet to test the non-empty path; that requires exercising the actual customer portal app, out of this session's scope)
- [x] `autopro-generateWorkOrderPdf` tested live — PDF blob generated and rendered correctly for a `work_order`-stage WO, zero errors (only one of the 4 stages exercised; estimate/invoice/credit_invoice stages and a pixel-level pre-migration comparison not yet done)
- [x] `autopro-createPortalSnapshot` tested live with a real linked Customer/Vehicle (test data seeded on `RO5001` for this pass) — 3 real rows confirmed in `CustomerPortalWorkOrder` (this WO has no payments, so `on_account` exclusion wasn't exercised)
- [x] `autopro-sendSms` tested live — real SMS delivered via Twilio, `SentEmailLog` row confirmed `pending`→`sent` with a real Twilio SID (dev secrets confirmed present; production secrets not yet confirmed). **Bug found and fixed live**: Twilio client was constructed at module top-level, so a bad `TWILIO_ACCOUNT_SID` crashed the function's CORS `OPTIONS` preflight itself (not just the POST) — moved inside the request handler (see §13D.4)
- [x] `autopro-sendEmailViaSMTP` tested live — real email delivered via Resend, `SentEmailLog` row confirmed `pending`→`sent` with a real Resend ID (dev secrets confirmed present; production secrets not yet confirmed; the failure-path shop-notification email was not exercised, since this run didn't hit a failure case)
- [x] `autopro-getNotesBoardData` tested live — correct empty-state rendering, zero errors (no real notes existed to exercise the fallback column/order algorithm or the search filter against non-empty data)
- [x] `npm run build` clean (confirmed 2026-08-03)

### 13D.4) Execution Retrospective (2026-08-03)

**Code-complete, dev-deployed, and now fully live-tested end-to-end on `test.kensauto.ca` — see the addendum at the end of this section.**

**Schema work (dev branch `sitihbdnuxifwibontcm` only, one migration, `phase13d_approvals_policy_and_portal_email_log_tables`):**
- `Approvals`: added the missing `"Enable all operations for all users"` policy (table already existed on dev per §0.4; still zero policies until this migration). **Production still needs the full `CREATE TABLE` + policy from §13D.2's SQL** — not yet replayed, per the project's standing dev-first pattern.
- **New finding, same class as §0.8:** `createPortalSnapshot` and `sendSms`/`sendEmailViaSMTP` write to two more entities that turned out to be Base44-hosted only, not native anywhere — `CustomerPortalWorkOrder` and `SentEmailLog`. Confirmed via direct `information_schema.tables` query on both dev and production before writing any code (neither existed on either project). Created both as genuine native tables on dev only, with the standard audit columns (`created_date`/`created_by`/`created_by_id`, plus `updated_date` for the two tables that get updated post-insert) and the standard permissive RLS policy, matching the `SystemSettings`/`TagAlong` precedent. **Not yet replayed on production.**
- `id` generation for both new tables follows the `crypto.randomUUID().replace(/-/g, '').substring(0, 24)` convention already established in `autopro-reverseDeposit` — the project's Base44-ID-shaped text PK pattern for new inserts (`SystemSettings`/`TagAlong`/etc. have no `DEFAULT` on `id`, confirmed via `information_schema.columns` before assuming one).

**Edge functions (all 5 deployed to dev branch only, `verify_jwt: true`, project's Authorization-header + `supabaseClient.auth.getUser(token)` pattern from `autopro-changeWorkOrderCustomer`, 200-always-with-`{error}` convention throughout):**
- `autopro-generateWorkOrderPdf` — near-verbatim jsPDF port (same technique as `autopro-generateDepositSlipPDF`); financial recompute, `Core_num`/`core_ret`/`core_cost`/`core_osamt` core-splitting (per §0.6's corrected field names), pagination, and the base64 data-URI response all preserved unchanged from the legacy source.
- `autopro-createPortalSnapshot` — ported the sequential WorkOrder→Customer→Vehicle fetch, `cp_id` collision-retry loop (now checking the native `CustomerPortalWorkOrder` table instead of a `base44.entities` call), `on_account` payment-exclusion calc, and stage-based ref_number/date selection.
- `autopro-sendSms` (Twilio) and `autopro-sendEmailViaSMTP` (Resend) — both preserve the pending-log→send→status-update sequence against the new native `SentEmailLog` table. The failure-path shop-notification email in `sendEmailViaSMTP` was reimplemented as a second Resend API call (the legacy `base44.integrations.Core.SendEmail` has no native equivalent) rather than dropped.
- `autopro-getNotesBoardData` — straight 1:1 port per §0.3 (no RPC redesign); the legacy source already read native `Note`/`WorkOrder`/`Customer`/`Vehicle` tables directly, so only the auth pattern and response envelope changed. The round-robin fallback `board_column`/`board_order` assignment algorithm was preserved exactly.
- **Verification technique used:** smoke-tested all 5 functions live post-deploy with an anon-key bearer token (passes the Supabase gateway's JWT check, then correctly fails the function's own `auth.getUser()` check) — confirmed all 5 return `200` with `{"error":"Unauthorized user session"}` rather than a cold-start crash, catching import/syntax errors before handing off for UI testing. Full functional testing (real Twilio/Resend sends, real PDF visual diff, real portal snapshot) still needs the user's manual pass on `test.kensauto.ca`, since it requires a real authenticated session and real secrets.

**Frontend (5 files converted, matching §13D.2's diffs exactly):** `ROApprovalsModal.jsx` (thin `Approvals` read), `WorkOrderPdfModal.jsx`, `SESEmailModal.jsx` (all 3 of its calls: portal snapshot, SMS, email), `InvoiceConversion.jsx` (both `createPortalSnapshot` call sites), `WorkOrders.jsx` (`getNotesBoardData`, called via `supabase.functions.invoke` directly since the `@/functions/*` base44-vite-plugin shim is retired for this call). Repo-wide grep confirmed zero remaining references to any of the 6 legacy function names or `base44` across all 5 files.

**Pre-existing, out-of-scope lint debt found but not touched:** `npx eslint` flagged unused imports in `WorkOrderPdfModal.jsx` (`X` icon), `InvoiceConversion.jsx` (`format`), and several in `WorkOrders.jsx` (`Customer`, `Vehicle`, `Select*`, `CardHeader`/`CardTitle`, `Filter`/`UserIcon`/`Car` icons) — confirmed via `git diff` that none of these lines were touched by 13D's edits (pre-existing debt from earlier phases, not a cascade of this sub-phase's changes per the §"Added after 13A execution" lesson). Left alone as out of this sub-phase's scope; `npm run build` is unaffected since Vite doesn't fail on unused imports.

**Not yet done:** production replay of the `Approvals` RLS fix + `CustomerPortalWorkOrder`/`SentEmailLog` table creation; production deploy of all 5 edge functions; confirmation that production Twilio/Resend secrets exist (dev secrets confirmed present and working, see addendum below).

**Addendum — live UI verification (2026-08-03, same day, continued session):**

The `BASE44_ACCESS_TOKEN`/`useShopData()` blocker from §0.9 was actually resolvable without waiting on a token rotation — `InventoryItem` and `Employee` were both already genuinely native tables (confirmed via `information_schema.tables`), so `useInventory.jsx`'s `useShopData()` hook (still calling `base44.functions.invoke('SupabaseProxy', ...)` and the legacy `Employee.list()` shim) was simply an unconverted leftover, not a real infrastructure blocker. Converted it to direct `supabase.from()` calls — this alone unblocked `DocumentEditor.jsx`'s render. Same fix applied to `Layout.jsx`'s app-wide `SystemSettings.list()` fetch and to `WorkOrderView.jsx`'s own `SystemSettings.list()` (a sibling read-only page, reached via "View Only (Last Save)" on the lock-conflict screen, not originally in this phase's file inventory — but it hosts the same `WorkOrderPdfModal`/`SESEmailModal` components 13D converted, so it's directly load-bearing for testing this sub-phase).

A second, more consequential bug surfaced once the page rendered: `useWorkOrder.jsx` — explicitly listed in this phase's own file inventory as 13B scope — still had `Customer.get()`/`Vehicle.get()` calls routed through the `@/entities/all` base44 shim, wrapped in `.catch(() => null)`. This silently swallowed the 401 and rendered "No customer/vehicle information available" with zero console errors, even after seeding a real linked `Customer`/`Vehicle` row and confirming the `WorkOrder` row's `customer_id`/`vehicle_id` were correct. 13B's own conversion of this file was incomplete. Fixed to direct `supabase.from('Customer')`/`supabase.from('Vehicle')` calls with explicit error logging (no more silent `.catch(() => null)`).

With all of the above fixed and a real Customer (`tyler@kensauto.ca`, `+17808714320`) and Vehicle seeded and linked to the dev branch's one test `WorkOrder` row (`RO5001`/`WO5001`), every 13D feature was exercised live and confirmed working: PDF generation, portal snapshot (3 real rows created), the `Approvals` empty state, and — after one more real bug fix — both SMS and email send.

**Third bug, in `autopro-sendSms` itself:** the Twilio client (`new twilio(accountSid, authToken)`) was constructed at module top-level, outside the request handler. When `TWILIO_ACCOUNT_SID` was invalid, the Twilio SDK's constructor threw, which crashed the *entire function* — including its `OPTIONS` handler, so the browser's CORS preflight itself returned `500` and the frontend never even got to send the real POST (surfacing as a generic `FunctionsFetchError: Failed to send a request to the Edge Function`, not a useful error message). Confirmed via `get_logs` (`OPTIONS | 500` entries) before fixing. Moved the credential check and client construction inside the try block, after the `OPTIONS` short-circuit — now a bad credential only fails the actual send, returned as a proper `{error}` JSON response, and CORS preflight always succeeds regardless of credential validity. This is a pattern worth checking in any *other* function that constructs a third-party SDK client at module scope. Once redeployed, the underlying secrets issue (`TWILIO_ACCOUNT_SID` didn't start with `AC` — a user-side typo/mix-up in the Supabase dashboard) was visible as a clear, actionable error message instead of a silent crash, and the user fixed it directly.

**Second UI test pass — full stage coverage + notes board (2026-08-03, same day):**

All 4 PDF stages verified: temporarily set `RO5001`'s `stage` to `estimate`/`invoice`/`credit_invoice` directly via SQL (safer than driving the app's real estimate→WO→invoice conversion flow just to get a stage value), reloaded `WorkOrderView.jsx`, clicked Print, and confirmed via `get_logs` that `autopro-generateWorkOrderPdf` returned `POST | 200` for all three additional stages (`work_order` was already covered in the first pass). Reverted the WorkOrder back to its original `stage='work_order'`/`wo_number='WO5001'` state afterward, clearing the temporary `est_number`/`inv_number`/`crinv_number` fields.

Attempted to verify the `getNotesBoardData` fallback round-robin placement algorithm with real data: inserted two real `Note` rows directly via SQL (one with explicit `board_column`/`board_order`, one with both `null` to force the fallback path). Hit a genuine test-data mistake first (used `status: 'open'`, but `WorkOrders.jsx`'s Notes tab client-side filters on `status === 'shared'`/`'private'` — not a code bug, just wrong seed data; fixed by re-updating to `status: 'shared'`). After that fix, **could not get the browser automation to switch tabs on `WorkOrders.jsx` at all** — repeated attempts (single click, double click, keyboard arrow-key navigation, full page reloads) all failed to switch away from the default "Work In Progress" tab, including for unrelated tabs like "Estimates" — a browser-automation-session issue, not an app bug (tab-clicking had worked earlier in the same overall session on `DocumentEditor.jsx`/`WorkOrderView.jsx`). **The two test notes are still sitting in the `Note` table, unverified via UI** — `id`s `728e5818-ed31-4744-b8da-fa123eb74e4d` ("Explicit placement test", `column_2`/order `5`) and `4dcda2df-e5ec-4bdf-a1b3-6dbe9da17b32` ("Fallback placement test", `null`/`null`). Left in place for the user (or a future session) to check visually, or to delete if unwanted — genuinely unresolved, not silently dropped.

**Explicitly not attempted, by design:** the `sendEmailViaSMTP` failure-path shop-notification email — triggering it live would mean deliberately sending a real email to `shop@kensauto.ca`, an address outside the explicit `tyler@kensauto.ca`/`+17808714320` test-recipient authorization given for this session. Held for a future explicit go-ahead rather than assumed. Similarly, the `Approvals` non-empty-state path and `createPortalSnapshot`'s `on_account` payment-exclusion logic remain untested against real data, since both need state that only exists on the far side of the separate customer-portal app or a WO with real payment history — neither was available this session.

**Test data left in the dev branch, not cleaned up (deliberately, to keep it usable for future sessions):** a `Customer` row ("Tyler Haney (Test)", `tyler@kensauto.ca`, `+17808714320`) and a `Vehicle` row (2022 Ford F-150), both linked to the dev branch's one seeded `WorkOrder` row (`RO5001`/id `999999999999`) — this WorkOrder's `customer_id`/`vehicle_id` previously pointed to orphaned, non-existent rows (`"123"`/`"123"`, showing as "Customer Not Found" in the UI), so this is a net improvement to the dev seed data, not debt. 3 real `CustomerPortalWorkOrder` snapshot rows and 2 `SentEmailLog` rows (one `sent` SMS, one `sent` email) also remain from live testing. The 2 test `Note` rows above are the one piece of test data whose UI outcome is still unconfirmed.

---

## Phase Results and Final Context

### 13D — **[Tested]**, verified complete 2026-08-03

All 6 functions (`autopro-generateWorkOrderPdf`, `autopro-createPortalSnapshot`, the `Approvals` thin table read, `autopro-sendSms`, `autopro-sendEmailViaSMTP`, `autopro-getNotesBoardData`) ported and deployed to the dev branch (`sitihbdnuxifwibontcm`) only — matching the standing dev-first pattern from 13A–13C, production still untouched. Two new native tables created (`CustomerPortalWorkOrder`, `SentEmailLog` — both turned out to be Base44-hosted-only, same class of gap §0.8 first caught with `SystemSettings`/`TagAlong`), plus the missing RLS policy added to the already-existing-but-policy-less `Approvals` table (§0.4). All 5 frontend files converted (`ROApprovalsModal.jsx`, `WorkOrderPdfModal.jsx`, `SESEmailModal.jsx`, `InvoiceConversion.jsx`, `WorkOrders.jsx`) with zero remaining `base44`/legacy-function references confirmed via repo-wide grep. `npm run build` clean throughout.

**Every one of the 6 features was live-tested end-to-end against `test.kensauto.ca` through a real authenticated session, with real external side effects confirmed**: PDF generation confirmed working for all 4 WO stages (estimate/work_order/invoice/credit_invoice); `createPortalSnapshot` confirmed via 3 real rows written to `CustomerPortalWorkOrder`; the `Approvals` empty state confirmed rendering correctly with zero errors; a real SMS was delivered via Twilio and a real email via Resend, both logged `pending`→`sent` in `SentEmailLog` with real provider tracking IDs (a Twilio `SM...` SID and a Resend UUID).

**Getting to that point required fixing four real bugs that were blocking testing, none of which were 13D's own new code:**
1. `useInventory.jsx`'s `useShopData()` hook (Phase 7 domain) was still calling `base44.functions.invoke('SupabaseProxy', ...)` and a legacy `Employee.list()` shim — this alone crashed `DocumentEditor.jsx`'s entire render before this session, and had previously been misdiagnosed (in §0.9, an earlier part of this same session) as requiring a `BASE44_ACCESS_TOKEN` rotation. It didn't — `InventoryItem`/`Employee` were both already genuinely native tables; the hook itself was just an unconverted leftover. Converted to direct `supabase.from()` calls.
2. `Layout.jsx`'s app-wide `SystemSettings.list()` fetch and `WorkOrderView.jsx`'s own separate `SystemSettings.list()` call (`WorkOrderView.jsx` is a sibling read-only page reached via "View Only (Last Save)" on the lock-conflict screen — not in this phase's original file inventory, but load-bearing for testing since it hosts the same `WorkOrderPdfModal`/`SESEmailModal` components 13D converted) — both still base44-routed, both fixed to direct `supabase.from('SystemSettings')` calls.
3. `useWorkOrder.jsx` — **explicitly listed as 13B's own scope in this phase's file inventory** — still had `Customer.get()`/`Vehicle.get()` routed through the `@/entities/all` base44 shim, wrapped in a silent `.catch(() => null)`. This meant 13B's conversion of this file was incomplete, and the bug was invisible (no console error) even after seeding real, correctly-linked `Customer`/`Vehicle` test data — it just silently rendered "No customer/vehicle information available". Fixed to direct `supabase.from()` calls with explicit error logging.
4. `autopro-sendSms` constructed its Twilio client (`new twilio(accountSid, authToken)`) at module top-level, before the `OPTIONS` short-circuit. A bad `TWILIO_ACCOUNT_SID` value threw at construction time, crashing the entire function — including CORS preflight — so the browser never got past `OPTIONS | 500` to even attempt the real send, surfacing only as a generic, unhelpful `FunctionsFetchError`. Moved the credential check and client construction inside the request handler; confirmed via `get_logs` that `OPTIONS` now always returns `200` regardless of credential validity.

### 13D.5) Explicitly out of scope / deferred (not forgotten, not blockers)

- **Production deploy of everything above** — RLS policy, `CustomerPortalWorkOrder`/`SentEmailLog` table creation, all 5 edge functions, and confirmation that production Twilio/Resend secrets exist. Dev-only by design, matching 13A–13C's held-back pattern pending the user's own sign-off before touching production.
- **`syncLevies`** — still 401ing, unrelated pre-existing 13C deferral (no `Levies` table yet, see §0.8/§13C.4). Not 13D's problem, not touched.
- **The `sendEmailViaSMTP` failure-path shop-notification email** — deliberately not triggered live, since doing so means sending a real email to `shop@kensauto.ca`, outside this session's explicit test-recipient authorization (`tyler@kensauto.ca`/`+17808714320` only).
- **`Approvals` non-empty-state path** — needs a real customer to approve/deny through the separate `portal.kensauto.ca` app, outside this session's reach.
- **`createPortalSnapshot`'s `on_account` payment-exclusion calc** — untested against real data; the test WO has no payment history.
- **A pre-existing, out-of-scope lint debt inventory** (unused imports in `WorkOrderPdfModal.jsx`, `InvoiceConversion.jsx`, `WorkOrders.jsx`) — confirmed via `git diff` to be untouched by any of 13D's edits, left alone.

### 13D.6) Known gaps — genuinely untested, flagged for a future session

- **The Notes board's fallback round-robin `board_column`/`board_order` placement algorithm, and the search filter, against real non-empty data** — two real test `Note` rows exist in the dev branch (`728e5818-ed31-4744-b8da-fa123eb74e4d`, `4dcda2df-e5ec-4bdf-a1b3-6dbe9da17b32`) but couldn't be visually confirmed due to a browser-automation tab-switching failure this session (not an app bug — tab-clicking worked fine earlier in the session on other pages). Check these manually, or re-attempt via automation next time.
- **Any WO stage other than `work_order`/`estimate`/`invoice`/`credit_invoice`'s `Send` flow specifically for SMS/email content correctness per stage** — only the PDF was cycled through all 4 stages; the email/SMS body text (which references `stageTitle`) was only exercised in `work_order` stage.

**Next step:** Phase 13D is closed. Proceeding to 13E (`WOAddInventoryModal.jsx`/`WarrantyReturnModal.jsx` final sweep) — see the freshly-verified execution section below. The original pre-execution draft of 13E (written before 13A–13D executed) undercounted how much of `WOAddInventoryModal.jsx` was already native by the time of this close-out; see the handoff note at the top of the 13E section for what changed.

---

## 13E) SUB-PHASE E: `WOAddInventoryModal.jsx` Full Migration & Final Sweep

> **Handoff note (2026-08-03, fresh research pass before starting 13E execution):** 13A–13D are all code-complete and dev-deployed; 13D is additionally fully live-tested (see "Phase Results and Final Context" above). Two things changed since 13E's original draft below was written:
> 1. **`WOAddInventoryModal.jsx` is substantially further along than the original draft assumed.** Re-read fresh from disk (not from memory) — `Supplier`/`SalesClass` reads in `loadDropdownData()` are *already* direct `supabase.from()` calls, and the entire batch-processing flow (`InventoryItem` create/update, `InventoryAuditLog`, the `update_inventory_with_audit` RPC) is *already* fully native. Only `TagAlong.list()`/`OtherChargeList.list()`/`InventoryCategory.list()` (still `@/entities/all`), the `searchInventory` base44-function call, and the `suggestInventoryCategory` base44-function call remain — a much smaller surface than originally scoped. The original draft below is preserved in a `<details>` block for the audit trail; **the corrected, current-state plan follows it.**
> 2. **The standing coordination check (re-grep `phase_7_implementation_plan.md`'s live status for "WOAddInventoryModal") was re-run**: Phase 7 (now fully `[Tested]`/complete) explicitly and repeatedly documented leaving this file untouched, on the grounds that it "needs its own full migration pass" — confirms zero collision, 13E is still the right and only owner of this file.
>
> `WarrantyReturnModal.jsx` was also re-read fresh: matches the original draft's description almost exactly (`WorkOrder.get()`/`.update()` are still the only base44 calls), **except for one thing the original draft didn't anticipate**: this file's `line_items` handling still assumes a JSON *string* (`JSON.parse(freshWO.line_items || '[]')` on read, `JSON.stringify(currentLines)` on write) — but per §0.6/§0.9's already-established finding, `WorkOrder.line_items` is a native `jsonb` column that decodes to an already-parsed array/object once the fetch goes through `supabase.from()`. Left as-is, this would throw (`JSON.parse` on a non-string) the moment the `WorkOrder.get()` call below is converted. This needs fixing as part of 13E, not just a mechanical `WorkOrder.get()` → `supabase.from()` swap.

<details>
<summary>13E — original pre-execution draft (written before 13A–13D executed), preserved for audit trail — superseded by the corrected plan below</summary>

### 13E.1) Scope & Objectives (original draft)

**In scope:**
1. Full native rewire of `WOAddInventoryModal.jsx` — the file Phase 7B explicitly left alone, reusing Phase 7A/7B's already-live assets verbatim (`InventoryCategory` table, `autopro-suggestInventoryCategory` function, `search_inventory_ranked` RPC).
2. `WarrantyReturnModal.jsx`'s lone `WorkOrder.get()`/`.update()` calls — the item Phase 7 explicitly deferred to this phase.
3. Repo-wide grep sweep + build/lint clean + full WO-lifecycle regression (phase-close gate).

**Prerequisite:** 13A (the InventoryCategory/suggestInventoryCategory/search_inventory_ranked assets are already satisfied today, independent of 13A-13D's own work), 13B (WarrantyReturnModal needs the corrected `WorkOrder` fetch/update shape).

**Exit criteria (phase close):** grep sweep clean; `npm run build`/`npx eslint` clean; full WO-lifecycle regression passed; `master_blueprint.md` updated.

### 13E.2) Detailed Execution Plan (original draft)

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

### 13E.3) Verification Checklist (original draft)

**`WOAddInventoryModal.jsx` & `WarrantyReturnModal.jsx`:**
- [ ] `WOAddInventoryModal.jsx` fully converted; supplier/sales-class/tag-along/other-charge/category dropdowns all tested live
- [ ] Inventory search-as-you-type tested; AI category suggestion tested (returns a real result)
- [ ] `WarrantyReturnModal.jsx`'s `WorkOrder.get()`/`.update()` converted and tested — process a LANKAR-legacy-style warranty return, confirm the `line_items` warranty-counter stamp persists correctly
- [ ] Repo-wide grep sweep returns zero `base44`/`@/entities/all`/`@/functions/` hits in this phase's file scope
- [ ] `npm run build` and `npx eslint` both clean, zero new errors/warnings on touched files

</details>

---

### 13E.1) Scope & Objectives (corrected, post-13D re-verification)

**In scope — smaller than the original draft, confirmed against current on-disk state:**
1. `WOAddInventoryModal.jsx` — only 3 remaining call sites, not a full-file rewire: `loadDropdownData()`'s `TagAlong.list()`/`OtherChargeList.list()`/`InventoryCategory.list()` (still `@/entities/all`), the `runInventorySearch()` `base44.functions.invoke('searchInventory', ...)` call, and the `fetchSuggestion()` `base44.functions.invoke('suggestInventoryCategory', ...)` call. **Already fully native, confirmed by direct file read — do not touch:** `Supplier`/`SalesClass` reads in `loadDropdownData()` (already `supabase.from()`), and the entire `handleProcessBatch()` flow (`InventoryItem` create/update via `supabase.rpc('update_inventory_with_audit', ...)` for existing parts, direct `supabase.from('InventoryItem').insert()`/`supabase.from('InventoryAuditLog').insert()` for new parts).
2. `WarrantyReturnModal.jsx`'s `WorkOrder.get()`/`.update()` calls (lines 195, 212) — matches the original draft, **plus a `jsonb`-vs-string fix the original draft missed**: the current code does `JSON.parse(freshWO.line_items || '[]')` on read and `JSON.stringify(currentLines)` on write, both of which assume `line_items` is a string. Once `WorkOrder.get()` is converted to `supabase.from()`, `line_items` arrives already-parsed (native `jsonb` column, per §0.6/§0.9) — the `JSON.parse()` call would throw. Must drop both the parse and the stringify, using the array directly.
3. Repo-wide grep sweep + build/lint clean + full WO-lifecycle regression (phase-close gate) — unchanged from the original draft.

**Prerequisite:** 13A (assets already live, unaffected by anything above), 13B (`WarrantyReturnModal.jsx` needs the corrected `WorkOrder` fetch/update shape — now additionally needs the `jsonb` fix above, which 13B's own file list didn't cover since `WarrantyReturnModal.jsx` was always 13E's file, not 13B's).

**Exit criteria (phase close):** grep sweep clean; `npm run build`/`npx eslint` clean; full WO-lifecycle regression passed; `master_blueprint.md` updated.

### 13E.2) Detailed Execution Plan (corrected)

**Standing coordination check — re-run 2026-08-03, confirmed clean:** `phase_7_implementation_plan.md` (now `[Tested]`/fully complete) explicitly and repeatedly documents leaving `WOAddInventoryModal.jsx` untouched throughout 7B/7C, on the stated grounds that "it needs its own full migration pass" — zero collision, 13E remains the sole owner of this file.

**`WOAddInventoryModal.jsx` — targeted 3-call-site conversion (not a full rewire):**
```diff
- import { TagAlong, OtherChargeList, InventoryCategory } from '@/entities/all';
- import { base44 } from '@/api/base44Client';
+ import { supabase } from '@/lib/supabase';
```
(`supabase` is already imported today — this just drops the two base44-routed imports. Confirm nothing else in the file still needs `base44` before removing that import line.)

`loadDropdownData()` — only the last 3 array entries change, `Supplier`/`SalesClass` stay exactly as they are today:
```diff
  const [suppliersData, salesClassesData, tagAlongsData, otherChargesData, categoriesData] = await Promise.all([
    supabase.from('Supplier').select('*').eq('inventory_supplier', true).then(res => res.data || []),
    supabase.from('SalesClass').select('*').then(res => res.data || []),
-   TagAlong.list(),
-   OtherChargeList.list(),
-   InventoryCategory.list()
+   supabase.from('TagAlong').select('*').then(res => res.data || []),
+   supabase.from('OtherChargeList').select('*').then(res => res.data || []),
+   supabase.from('InventoryCategory').select('*').then(res => res.data || [])
  ]);
```
(Kept the existing `.then(res => res.data || [])` unwrap-inline style already used in this exact `Promise.all` for `Supplier`/`SalesClass`, rather than introducing a different pattern — matches the file's own established convention.)

`runInventorySearch()` (line ~167) — reuse `GetPartModal.jsx`'s exact `search_inventory_ranked` RPC shape (confirmed live 2026-08-03), noting the legacy `sortBy`/`sortDirection` params have no RPC equivalent (the RPC always returns its own ranked order, same as `GetPartModal.jsx` already accepts):
```diff
- const response = await base44.functions.invoke('searchInventory', {
-   searchTerm: trimmedSearch,
-   limit: 50,
-   sortBy: 'part_number',
-   sortDirection: 'asc'
- });
- setSearchResults(response.data?.records || []);
+ const { data, error } = await supabase.rpc('search_inventory_ranked', {
+   p_search_term: trimmedSearch,
+   p_limit: 50,
+   p_location_from: null,
+   p_location_to: null
+ });
+ if (error) throw error;
+ setSearchResults((data || []).map(({ total_count, match_rank, ...item }) => item));
```

`fetchSuggestion()` (line ~567) — **exact same conversion the original draft already had correct, unchanged:**
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

**`WarrantyReturnModal.jsx` — close out Phase 7's deferred item, with the `jsonb` fix:**
```diff
- import { WorkOrder } from '@/entities/all';
+ import { supabase } from '@/lib/supabase';
  ...
  // line 195
- const freshWO = await WorkOrder.get(workOrder.id);
- const currentLines = JSON.parse(freshWO.line_items || '[]');
+ const { data: freshWO, error: freshWOError } = await supabase.from('WorkOrder').select('*').eq('id', workOrder.id).single();
+ if (freshWOError) throw freshWOError;
+ const currentLines = Array.isArray(freshWO.line_items) ? freshWO.line_items : [];
  ...
  // line 212
- await WorkOrder.update(workOrder.id, { line_items: JSON.stringify(currentLines) });
+ const { error: updateError } = await supabase.from('WorkOrder').update({ line_items: currentLines, last_updated: new Date().toISOString() }).eq('id', workOrder.id);
+ if (updateError) throw updateError;
```

**Final repo-wide sweep:**
```bash
grep -rn "base44\|@/entities/all\|@/functions/" src/components/work-orders/ src/pages/WorkOrders.jsx src/components/hooks/useWorkOrder.jsx src/pages/InvoiceConversion.jsx
```
Expect zero hits once 13A-13E are all complete. Any remaining hit is either a missed call site or something that should have been explicitly flagged as out-of-scope in Section 1 — investigate before closing the phase.

### 13E.3) Verification Checklist (corrected)

**`WOAddInventoryModal.jsx` & `WarrantyReturnModal.jsx`:**
- [x] `WOAddInventoryModal.jsx`'s 3 remaining call sites converted; tag-along/other-charge/category dropdowns **live-tested 2026-08-03** against `test.kensauto.ca` (`/dev-login`, `test@kensauto.ca`) — Supplier/Category/Tag Along dropdowns all populated with real dev-branch data (supplier/sales-class dropdowns confirmed still working, unchanged code)
- [x] `runInventorySearch()` (`search_inventory_ranked` RPC) and `fetchSuggestion()` (`autopro-suggestInventoryCategory`) both **live-tested** — real search returned `TESTPART1`/"Test Part 1"; real Gemini category suggestion returned "Brakes" for a "Front Brake Pad Set" description, auto-filled with the expected red-ring "suggested" UI state
- [x] The full batch-add-to-WO flow (`handleProcessBatch`) **live-tested**, both branches — **found and fixed a real, previously-untested bug in the new-item branch**: `InventoryItem.id` has no DB default (confirmed `NOT NULL`, no default, via `information_schema.columns`) but the insert never supplied one, so creating a brand-new part 500'd with `null value in column "id" ... violates not-null constraint`. Fixed by adding `id: crypto.randomUUID()` plus the audit fields (`created_date`/`updated_date`/`created_by`/`created_by_id`) matching `InventoryList.jsx`'s established insert pattern — this bug pre-dates 13E entirely (present in the file before this sub-phase touched it) and was never exercised until this live pass. The existing-item branch (`update_inventory_with_audit` RPC) was live-tested clean end-to-end: real `TagAlong`/sales-class pricing calc, batch add, and WO line-item creation all worked correctly on the first pass.
- [x] `WarrantyReturnModal.jsx`'s `WorkOrder.get()`/`.update()` conversion **including the `jsonb` fix live-tested** — processed a real warranty return against a real WO/line item; console confirmed `"Updated Work Order line item warranty_returned flag"` and the DB-side `line_items[0].warranty_returned` value was `1` post-test (verified directly via SQL before cleanup) — the fix works exactly as designed, no `JSON.parse` crash. **Found and fixed a second pre-existing bug in this same file while testing**: the warranty-return GL-transaction insert (untouched by 13E's original scope — a different code block than the `WorkOrder.get/update` lines) also never supplied `GLTransaction.id` (same `NOT NULL`, no-default column), so both GL rows silently failed every time this modal's warranty path ran, confirmed via `information_schema` + a live `[object Object]` console error. Fixed the same way (`crypto.randomUUID()` + audit fields), matching the sibling `AdvancePaymentModal.jsx` insert in the same directory.
- [x] Repo-wide grep sweep returns zero real `base44`/`@/entities/all`/`@/functions/` hits in this phase's file scope — re-run 2026-08-03 after all fixes below, only false positives (string literals `@no-reply.base44.com`, a `base44-prod` storage-bucket path, WorkPRO's own third-party API constant) and the previously-documented `syncLevies` deferral remain; see §13E.4
- [x] `npm run build` clean (exit 0, dist artifacts produced) and re-confirmed clean after the two live-testing bugfixes above; targeted `npx eslint` run on every file touched this sub-phase — zero *new* errors traced to this session's edits (all reported errors/warnings pre-date this session and sit on lines never touched here — e.g. unrelated dead icon imports in `DocumentEditor.jsx`/`CreditInvoice.jsx`/`WorkOrderView.jsx`)

**Live-test session notes (2026-08-03, `test.kensauto.ca`, dev branch `sitihbdnuxifwibontcm`, WO `RO5001`):**
- `GetPartModal.jsx`'s search box (13C, unrelated to 13E) did not respond to Enter/typing during this session — not investigated further since it's out of 13E's file scope; flagged here for whoever next touches 13C/`GetPartModal.jsx`.
- `WarrantyReturnModal`'s "Return for Warranty" context-menu action only appears when `workOrder.stage === 'invoice'` (`WorkOrderViewLineItemsTable.jsx:125`) — the test WO's stage was temporarily flipped to `'invoice'` via direct SQL to reach it (full `InvoiceConversion.jsx` flow was out of scope for this test), then reverted.
- All test artifacts (the temporary line item, `InventoryReturn` row, 2 `InventoryAuditLog` rows, `InventoryItem.quantity_on_order` bump, WO `stage`/`line_items`) were cleaned up via direct SQL after verification, restoring the dev branch to its prior seed state, per the Phase 7B testing-hygiene convention.
- Confirmed real (expected, pre-existing) 401 on `syncLevies` — consistent with §0.9's already-documented base44-proxy-in-this-session behavior and the still-deferred `Levies` table.

### 13E.4) NEW FINDING (2026-08-03): repo-wide sweep caught 3 items earlier sub-phases missed — all fixed in this pass

The corrected §13E.2 plan above only anticipated `WOAddInventoryModal.jsx` and `WarrantyReturnModal.jsx`. Running the mandated final sweep (§13E.2's `grep -rn "base44\|@/entities/all\|@/functions/" ...`) surfaced three additional real gaps, all now fixed:

1. **`src/components/hooks/useWorkOrder.jsx`** — 13B's own file table (§1, row 3) explicitly scoped this file's `SupabaseProxy` read (`SupplierInvoiceLine`) and its dormant `getworkorderdata`-style `useFunctionData` fallback branch, but neither was actually finished. Fixed: `SupplierInvoiceLine` lookup in `parseLineItems()` converted to a direct `supabase.from('SupplierInvoiceLine').select('*').eq('id', ...)` call (matching `WorkOrderForm.jsx`'s already-native pattern). The `useFunctionData` option was confirmed dead via the same "grep every real call site" technique 13A established (§2's added-lessons) — all 3 live callers (`DocumentEditor.jsx`, `CreditInvoice.jsx`, `WorkOrderView.jsx`) always pass it truthy — so the base44 `else` branch, the `useFunctionData` destructure, and the now-pointless option object at each of the 3 call sites were all removed.
2. **`src/components/work-orders/form/LineItemsTable.jsx`** — not listed in Phase 13's original 27-file inventory at all (a genuine blueprint gap, not a deliberate deferral), but squarely inside `work-orders/form/` alongside the already-native `WorkOrderForm.jsx`. Its `InventoryLocation.list()`/`InventoryCategory.list()` (both confirmed native tables, already used via `supabase.from()` elsewhere — `InventoryList.jsx`, `InventoryAdd.jsx`, `LocationModal.jsx`) converted to direct calls; its imported-but-never-used `InventoryTxs` symbol dropped as a dead import.
3. **`src/components/work-orders/form/WorkOrderHeaderInfo.jsx`** and **`WorkOrderViewHeaderInfo.jsx`** — both had a dead `import { base44 } from '@/api/base44Client'` with zero live usage (only referenced inside a commented-out block and an unrelated `.endsWith('@no-reply.base44.com')` string check). Both import lines removed.

**Confirmed correctly out-of-scope, left untouched (re-verified, not new findings):**
- `WarrantyReturnModal.jsx`'s `import { searchSuppliers } from '@/functions/searchSuppliers'` — Phase 7's plan doc (§0.2 row 10, §7B.2, §7.3) explicitly and repeatedly defers `Supplier` CRUD/search to **Phase 9**, by name, more than once. Not this phase's job.
- `useDocumentEditorSave.jsx`'s `base44.functions.invoke('syncLevies', ...)` — already-documented 13C deferral (§0.8/§13C.4), blocked on the `Levies` table not existing yet; needs the user's explicit go-ahead to create it, unchanged by this session.
- `WorkPROEditProjectModal.jsx`, `WorkPROViewModal.jsx`, `TechProjectClockInModal.jsx`, `ROInspectionModal.jsx`, `EditProjectDetailsModal.jsx` — all call a **separate third-party SaaS product** ("WorkPRO"), which happens to also be hosted at `app.base44.com` but is a different vendor app, not this project's own legacy backend. This is the "tech time / WorkPRO project pairing" the phase-close regression checklist explicitly calls out as untouched by this phase. Confirmed by literal API key/app-ID constants in each file, not our own `@/api/base44Client` SDK.
- `WorkOrderHistoryModal.jsx` (`@no-reply.base44.com` string check) and `WorkOrderReport.jsx` (a `base44-prod` Supabase-storage bucket path in an image `src`) — both plain string literals, no SDK dependency.

**Full Lifecycle Regression (phase-close gate) — executed 2026-08-03 against `test.kensauto.ca`, dev branch `sitihbdnuxifwibontcm`:**
- [x] Create a new WO — **"New Work Order" path: works cleanly** (native `createworkorderdata` insert, WO51562 created without error). **"Counter Sale" path: found and fixed TWO real, previously-never-exercised bugs** in `WorkOrders.jsx`'s `handleCreateCounterSale` (see §13E.5 below) — both fixed, build/lint clean, but not yet re-verified live pending deploy.
- [x] Save as estimate, add line items/parts/cores/other-charges — all three added successfully to a real estimate (RO51565: `TESTPART1` part w/ core, an "Adjustment" other charge). `syncLevies` correctly 401'd (expected, pre-existing, documented §0.8/0.9 gap) without corrupting the save.
- [x] Convert estimate → work order — worked correctly. `autopro-convertEstimateToWorkOrder` correctly **skipped** QOH allocation for the still-"on order" test line (confirmed correct behavior, not a bug, by cross-referencing a real concurrent conversion by the account holder that DID show QOH allocation — "Issued to WO" audit entry, QOH 1→0 — for an already-received line). Note: `InventoryTxs` (the table named in this checklist item) **does not exist anywhere in the schema** — the real audit trail table is `InventoryAuditLog`; this checklist wording is stale, corrected here for future reference.
- [x] Convert work order → invoice — worked correctly via the 3-phase conversion modal (Odometer → Description → Payment). **`autopro-handleInvoiceConversionGL` output verified via direct GL balance check: 8 transactions, debits = credits = $90.81 exactly.**
- [x] Record a payment — done as part of the same 3-phase conversion flow (`InvoicePaymentModal`, phase 3); Cash payment applied, balance correctly hit $0.00 with an automatic $0.01 penny-adjustment line; GL entries for the payment (`1010`/`1100`) included in the same balanced 8-transaction set above.
- [x] Confirm inventory QOH correct after the full receive→WO→convert cycle — `TESTPART1`: received 1 (QOH 0→1), consumed via invoice conversion GL (`Cost of parts sold`/`Inventory reduction` both $10.01), final QOH=0/QOO=0. Correct.
- [x] Confirm tech time / WorkPRO project pairing still functions — WorkPRO tab loads cleanly with no new/WorkPRO-specific console errors (only the known `syncLevies` 401). Not deep-tested (no WorkPRO project test fixture available), consistent with this being explicitly untouched, third-party integration territory.
- [x] Generate a PDF, create a portal snapshot, send an SMS and an email — all four done from the same real invoice (INV41230), all real side effects: email to `tyler@kensauto.ca` ("Email sent successfully!"), SMS to `+17808714320` ("Text message sent successfully!"), PDF generated (`WorkOrderPdfModal` rendered Download/Print), 3 `CustomerPortalWorkOrder` snapshot rows created (one per PDF/email/SMS action). All cleaned up after.
- [x] Void a WO — "Expired/Void" (estimate-stage only, confirmed by reading `WorkOrderList.jsx`'s context-menu gating) tested on a throwaway estimate (RO51566): real confirmation dialog ("This is a permanent change"), confirmed, `stage` correctly became `'void'`.
- [x] Process a core return and a warranty return against real inventory data — **core return** (`ROCoreModal`, new test this pass): processed 1 core on WO51562, confirmed a correctly-shaped `InventoryReturn` row (`return_type: 'core'`, `status: 'On-site'`). **Warranty return**: already fully tested earlier in this same 13E session (see §13E.3 above) — not re-run.
- [x] Test the notes board and "flush all locks" admin action — Notes board loads real data correctly, including a pre-existing note titled "Fallback placement test" that specifically exercises the round-robin fallback UI path 13D's plan had flagged as a genuinely-untested gap — **that gap is now closed**, confirmed rendering correctly. "Flush Locks" confirmed via its real (non-native-`confirm()`) dialog: "All work order locks have been flushed. (1 flushed)".
- [x] `master_blueprint.md` Phase 13 status updated to Tested-pending-Counter-Sale-redeploy; 0.6's core-field-name correction and 0.5's PDF-pattern note rolled into the blueprint (see blueprint's own Section 7).

**All regression test data cleaned up afterward** (3 throwaway WorkOrders, 8 GLTransaction rows, 1 CustomerPayments row, 3 CustomerPortalWorkOrder snapshots, InventoryReturn/InventoryAuditLog rows, `TESTPART1` QOH/QOO reset to its pre-session baseline) — dev branch restored to the same state it was in before this regression pass, except for the account holder's own concurrent, untouched activity (WO `RO51561`/`WO51561`, "Super Test" customer — confirmed created by `tyler.haney.1998@gmail.com`, not this test session, left alone throughout).

### 13E.5) NEW FINDING (2026-08-03, live regression pass): 4 more real, previously-unexercised bugs found and fixed, none in 13E's own file scope but all directly blocking this phase-close regression

None of these are in `WOAddInventoryModal.jsx`/`WarrantyReturnModal.jsx` (13E's actual charter) — they surfaced only because this was the **first time** anyone actually clicked through the full WO lifecycle live against a native-migrated build. All are now fixed, build/lint clean, and (except where noted) already re-verified live post-deploy.

1. **`src/pages/WorkOrders.jsx` `handleCreateCounterSale` — TWO separate missing-column bugs, found sequentially:**
   - First: the insert included `cp_id`, which is not a `WorkOrder` column at all (it belongs to `Approvals` — confirmed via `information_schema`). `NewWorkOrderModal.jsx` computes the same dead `cp_id` value but never actually includes it in its own insert payload, which is why the "New Work Order" path never hit this bug. Fixed by removing `cp_id` (and the now-unused `generateRandomString` helper) from the Counter Sale payload. **Re-verified live post-deploy** — this exact fix surfaced the *second* bug below.
   - Second: `customer_complaint`, `estimated_hours`, `scheduled_date`, and `technician` also don't exist on `WorkOrder` (confirmed via `information_schema` — the real, working `NewWorkOrderModal.jsx` payload has no equivalents for any of these). Fixed by removing all four; `customer_complaint` replaced with the already-used-elsewhere `internal_notes` field, matching `NewWorkOrderModal.jsx`'s working pattern. **Not yet re-verified live** — needs another deploy.
2. **`payments` field jsonb-vs-string handling — 5 files never received the fix already proven correct in `DocumentEditor.jsx`/`InvoiceConversion.jsx`.** `WorkOrder.payments` is a native `jsonb` column (confirmed via `information_schema`), but these files still did `JSON.parse(workOrder.payments)` unconditionally, which throws `SyntaxError: Unexpected end of JSON input` the moment `payments` is a real (already-parsed) array rather than a string — reproduced live via `FinancialSummary.jsx` on a freshly-created WO. Fixed in all 5 by applying the exact guard already used correctly in `DocumentEditor.jsx`: `typeof x === 'string' ? JSON.parse(x) : x`.
   - `src/components/work-orders/form/FinancialSummary.jsx` — confirmed broken live before the fix (this is what surfaced the whole class of bug).
   - `src/components/work-orders/form/WorkOrderViewFinancialSummary.jsx` — same unguarded pattern, fixed proactively.
   - `src/components/work-orders/AdvancePaymentModal.jsx` — same, fixed proactively (this one is the actual payment-recording modal, so this bug would have blocked recording *any* payment on a WO that already had prior payment history).
   - `src/components/work-orders/SESEmailModal.jsx` — same, fixed proactively.
   - `src/components/ar/BatchSendWorkOrdersModal.jsx` — same, fixed proactively.
   - Confirmed **not** broken, left untouched: `src/components/work-orders/WorkOrderReport.jsx` (already guards with `Array.isArray()` first) and `src/pages/CreditInvoice.jsx` (a still-fully-base44-routed, unmigrated page — its `createdCreditInvoice` object comes back through the legacy proxy, which really does still stringify jsonb-shaped fields, so its `JSON.parse` is correct for its own data source).
3. **`src/components/work-orders/WOAddInventoryModal.jsx` — a second, more serious bug in `handleProcessBatch`'s existing-part branch, found while live-testing the estimate → WO conversion (task-list item 3/4 of this pass), independent of and in addition to the `InventoryItem.id`/`GLTransaction.id` bugs already found and fixed earlier in this same 13E session (§13E.3):** `InventoryItem.quantity_on_hand`/`quantity_on_order` are `text` columns, not numeric (confirmed via `information_schema` — the `update_inventory_with_audit` RPC itself does `p_qoo::text`, confirming the whole column is text-typed by design). The existing-part branch did `const currentQOO = freshItem.quantity_on_order || 0;` then `newQuantityOnOrder = currentQOO + quantityToOrder` — since `currentQOO` was a **string**, `+` performed JavaScript string concatenation, not addition (`"1" + 1 = "11"`, not `2`). Reproduced live: a real `TESTPART1` batch-add corrupted its `quantity_on_order` from `1` to `11` in a single operation. This is a genuine, silent **inventory-data-corruption bug** — the worst-severity finding of this whole regression pass — now fixed with explicit `Number()` casting on both `quantity_on_hand` and `quantity_on_order` at the point they're read from the fetched row. The corrupted test value was repaired via direct SQL; the fix itself is confirmed correct by a subsequent clean re-test in the same session (core-return test on WO51562 processed a fresh existing-part batch-add with no corruption).
