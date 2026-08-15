# Implementation Plan: Work Order Locking Remediation

**Status:** Pending your approval — no code changes made yet.
**Parent:** None (standalone remediation, not a `Pre_go-live_plan.md` item). Kept in a separate file from `implementation_plan.md`, which currently tracks the unrelated, still-not-fully-deployed "Bulk Receive Parts" rewrite — that document is untouched by this plan.

---

## 1) Context & Lessons Learned

**Core goal.** Work Order locking today has a real, user-visible flaw: `set_workorder_lock` auto-steals a lock from its current holder after 120 minutes with zero warning, and **nothing anywhere checks lock ownership before writing** — not the general save, not the three inventory-affecting actions that bypass save entirely. That means a stolen lock isn't just an inconvenience: it's a silent last-write-wins collision, and for the parts-related actions specifically, a real risk of a part being pulled from physical stock (inventory already decremented, audit-logged) while the record of it ever landing on the Work Order gets silently dropped. This plan removes the automatic steal, adds an explicit "someone else holds this — override?" checkpoint everywhere a write can happen, and replaces the blunt, unguarded, system-wide "Flush Locks" button with a scoped, deliberate per-Work-Order "Clear Lock" action.

**How this plan's scope was actually determined (read this before touching any file below).** The initial verbal design brief for this plan assumed "Get Part" was the risky, inventory-decrementing action reachable from `LineItemsTable.jsx`'s context menu. That assumption was wrong in a way direct code reading caught: `LineItemsTable.jsx`'s "Get Part" menu item (shown only when a line has no `inventory_item_id` yet) opens **`WOAddInventoryModal.jsx`** — actually titled "Add Part" — which creates/orders parts but doesn't reduce QOH by default. The real "Get Part" (title: "Get Part from Inventory") is a **separate component, `GetPartModal.jsx`**, wired through a different modal key (`modals.getPart`/`onGetPart`), and its submit handler calls `autopro-WOBulkGetParts` directly and immediately — completely bypassing the general save. This was caught, corrected, and confirmed with you mid-planning; every reference to "Get Part" below means `GetPartModal.jsx`, not `WOAddInventoryModal.jsx`.

**The three genuinely decoupled, immediate-commit, inventory-affecting actions** — confirmed by reading each modal's actual submit handler — are:
- **Get Part** (`GetPartModal.jsx` → `autopro-WOBulkGetParts`) — pulls from QOH immediately on "Add to Work Order."
- **Receive Parts** (`ReceivePartModal.jsx` → `autopro-processWorkOrderPartReceive`) — pulls on-order/quoted parts from QOH immediately on submit. (This modal was rewritten into its current bulk shape by a prior, unrelated session the same day — see `implementation_plan.md` for that history; this plan does not change its business logic, only adds a lock gate around its existing open/submit points.)
- **Mark Parts as Ordered** (`MarkPartsOrderedModal.jsx` → `autopro-processWorkOrderMarkQuotedOrdered`) — commits QOO immediately on submit.

All three call their edge function directly from the modal's own handler — none of them route through `useDocumentEditorSave.jsx`'s `handleSave`. `autopro-WOBulkGetParts` is additionally called a *second* way — from inside `handleSave` itself, for any line that already has an `inventory_item_id` + `qty > 0` and isn't yet `inventory_processed` (the "ordinary line already has a part, just needs stock pulled at save time" case). That means `autopro-WOBulkGetParts` is the one function reachable from **two** different trust boundaries (a gated client call from `handleSave`, and an ungated direct call from `GetPartModal.jsx`) — exactly why it gets a server-side lock check of its own, not just a client-side gate.

**The general-save gate location matters and was originally going to be wrong.** `useDocumentEditorSave.jsx`'s `handleSave` currently does inventory-affecting work (deleted-line replenishment, pending-return processing, `autopro-WOBulkGetParts` for unprocessed lines) **before** its one existing (and currently unchecked) lock-refresh call. Inserting the new ownership check at that existing call site would let inventory move *before* the user ever sees a conflict warning — backwards. The check has to move to the very top of `handleSave`, before any side-effecting work begins.

**One flag can't be reused to distinguish autosave from a real user action.** Both the header Save/Close button (`handleHeaderSaveClick`) and the 2-second debounced autosave already pass `silentError: true` to `handleSave`, for an unrelated pre-existing reason (suppressing a generic failure alert). A new, dedicated flag (`isBackgroundSave`) is required to tell the two apart — autosave must fail a lock conflict silently (banner, no dialog); every other caller must get the interactive "someone else holds this — override?" confirm.

**This turns out to protect a lot "for free."** Once the ownership check sits at the top of `handleSave`, *every* call site inherits it automatically — header Save/Close, payment add/delete, stage changes, customer/vehicle updates, send-email pre-save, estimate conversion, and every step of the invoice-conversion wizard (including its final, GL-triggering step). The only thing that still needs its own dedicated, *early* check is `handleConvertToInvoice` — because the conversion wizard is multiple steps long, and catching a conflict at the very first click (before the user invests three steps of time) is meaningfully better UX than only catching it at the final save.

**`set_workorder_lock` does not exist on production today** — confirmed directly (`pg_proc` query against `hbcrwkmgsazqrvsrmxyr` returned zero rows), only on dev (`sitihbdnuxifwibontcm`, confirmed via the same query, contents match the archived design exactly, no drift). It also has no matching file anywhere in `supabase/migrations/` — a known, named gap in this project's own conventions (`master_context.md` §3: "Every live Postgres function/RPC change made via `apply_migration` needs a matching `.sql` file"). Phase 5 fixes both: a migration file is written for the very first time, and the function is created (not just deployed) on production.

**Tab-close lock release is currently dead code, for two independent, compounding reasons**, both confirmed by direct reading of `DocumentEditor.jsx`:
1. `postKeepAliveFunction` gates on `appParams?.token` (`src/lib/app-params.js`), a legacy Base44-era value the current native-auth login flow never populates.
2. Even if the token existed, the URL is wrong: `postKeepAliveFunction` posts to `${window.location.origin}/functions/${functionName}` — the *frontend's own* origin — not `${supabaseUrl}/functions/v1/${functionName}`, the actual Supabase Functions endpoint. This is a second, independent bug beyond the already-known one (the target function, `manageWorkOrderLock`, was also deleted in the Base44 sunset and no longer exists at any URL).

The working, already-proven pattern for this exact problem exists one module over: `releaseSupplierLockKeepAlive` (`src/components/utils/supplierLockUtils.jsx`) + `autopro-releaseSupplierLock` — correct URL, correct token (`window.__SUPABASE_JWT__`), a small dedicated edge function that resolves the caller from the JWT itself and does one atomic conditional update. Phase 1 copies this pattern exactly for Work Orders, as its own small addition — **it does not touch or attempt to fix `dispatchBackgroundSaveOrRelease`'s separate "shadow save of unsaved changes" mechanism**, which has the same URL bug but is a distinct, pre-existing feature outside this plan's scope (see Risk #6).

**One deliberate behavior change, called out explicitly rather than left as a side effect:** today, `dispatchBackgroundSaveOrRelease` only *attempts* a lock release when there are *no* unsaved changes (the `hasUnsavedChanges` branch returns early into the broken shadow-save path instead). After this plan, the lock-release keepalive fires unconditionally on `beforeunload`/`pagehide` whenever the lock was acquired — regardless of unsaved-changes state — because holding the lock hostage doesn't protect unsaved work (the existing `beforeunload` confirm dialog already covers that), and only makes the locking problem worse.

**Scope, confirmed with you across this conversation, nothing left open:**
1. Remove automatic stale-timeout lock stealing entirely — no more silent hand-off after 120 minutes.
2. Fix tab-close lock release (dedicated new edge function, Supplier pattern).
3. General Save gate: ownership check at the top of `handleSave`, interactive confirm-and-override for real user actions, silent fail-and-banner for autosave. Covers every `handleSave` call site, including all invoice-conversion wizard steps.
4. Early, dedicated gate on `handleConvertToInvoice` (before the wizard starts).
5. Same open+submit lock gate applied consistently to **all three** decoupled inventory actions: Get Part, Receive Parts, Mark Parts as Ordered — client-side in each modal, server-side backstop in each of the three edge functions (plus `autopro-WOBulkGetParts`'s second, ungated call site).
6. Remove "Flush Locks" entirely (system-wide, unguarded) from `WorkOrders.jsx`; search bar absorbs the freed width; Refresh needs no repositioning (it's already the first/leftmost button, adjacent to Flush Locks' old slot).
7. Add a single-Work-Order-scoped "Clear Lock" action to `WorkOrderList.jsx`'s existing per-row `ContextMenu` (already present, lines 208-358 — no new UI pattern needed) — red background/white text, confirmation dialog adapted from the removed Flush Locks dialog's copy, not admin-gated.
8. Production verification/deployment of everything above, bundled into one push at the end, timed alongside the project's broader go-live cutover — not deployed incrementally ahead of it.

---

## 2) Previously Completed

Nothing has been built yet under this plan — it is a net-new initiative with no prior phases of its own. For historical context, this planning pass itself involved substantial verified research (not guesswork) that every phase below depends on:

- Live-queried `set_workorder_lock`'s actual current definition on both Supabase projects (confirmed present on dev, absent on production, dev's copy matches the archived design with no drift).
- Read the full, current source of every file this plan touches: `DocumentEditor.jsx` (2006 lines, read in full), `useDocumentEditorSave.jsx`, `LineItemsTable.jsx`, `GetPartModal.jsx`, `WOAddInventoryModal.jsx` (read and correctly ruled out), `ReceivePartModal.jsx`, `MarkPartsOrderedModal.jsx`, `InvoiceConversion.jsx`, `WorkOrders.jsx` (partial — the relevant Flush Locks/Refresh/search-bar section, lines 1-1300), `WorkOrderList.jsx` (context-menu section), `autopro-WOBulkGetParts/index.ts`, `autopro-processWorkOrderMarkQuotedOrdered/index.ts`, `autopro-processWorkOrderPartReceive/index.ts` (via the sibling, already-executed plan's own Working Area — cross-checked, not re-derived), `autopro-releaseSupplierLock/index.ts`, `autopro-acquireSupplierLock/index.ts`, `supplierLockUtils.jsx`, `src/lib/app-params.js`.
- Corrected a wrong initial assumption (Get Part vs. Add Part) via direct code reading rather than carrying it forward into the plan.
- Confirmed `WorkOrderList.jsx` already has a working per-row context menu, avoiding a novel UI pattern for the new "Clear Lock" action.

---

## 3) Risk Assessment

| # | Risk | Impact | Likelihood | Mitigation |
|---|---|---|---|---|
| 1 | Moving the lock check to the top of `handleSave` changes behavior for *every* caller at once (payments, stage changes, conversion steps, customer/vehicle updates) — a mistake here has broad blast radius across the whole Work Order editor, not just one feature | High if it happens | Low, if verification discipline is followed | All dev-branch verification (Section 6) explicitly exercises multiple non-Save-button callers (a payment add, a stage change, a conversion step), not just the header Save button, before this is considered done |
| 2 | `force_apply`/`force_release` are unconditional overrides by design — a bug that calls either without a real, preceding user confirmation would silently let anyone seize or clear any Work Order's lock | High if it happens | Low | Both new RPC actions are only ever invoked from two specific, already-gated call sites (the "Save anyway" confirm branch, and the "Clear Lock" confirmation dialog) — code review confirms no other call site is added; the RPC itself doesn't and can't distinguish "confirmed" from "not," so the discipline is entirely on the two callers, which is exactly why this row exists |
| 3 | Removing the 120-minute auto-steal with no replacement safety net could leave a Work Order permanently locked if a tab dies before `beforeunload`/`pagehide` ever fires (forced process kill, OS crash, power loss) | Medium (a stuck WO, not data loss) | Low-Medium — this is the accepted trade-off you explicitly chose (2C) | The new single-WO "Clear Lock" context-menu action (Phase 4) is the designed recovery path — one click, no system-wide blast radius, available to any staff member |
| 4 | Server-side lock checks added to `autopro-WOBulkGetParts`/`autopro-processWorkOrderPartReceive`/`autopro-processWorkOrderMarkQuotedOrdered` reject a legitimate request if the client-side gate and the server-side check ever disagree (e.g. a race between the client's own-lock read and the server's) | Medium (a user sees an unexpected rejection) | Low | Each server-side check reads `WorkOrder.LockedByUser` fresh at call time (not trusting anything the client asserts) — the failure mode is "reject and show a clear error," never "silently proceed," so a race produces an honest, re-triable failure, not silent corruption |
| 5 | `autopro-WOBulkGetParts` currently never fetches the `WorkOrder` row at all (it processes purely by `inventory_item_id`) — adding a fetch-by-`workOrderId`/`roNumber` step for the lock check is new code in an already-live, frequently-called function | Medium (regression risk to a working, frequently-used function) | Low | The added fetch is additive (a new early-return branch before the existing per-item loop, which is otherwise untouched) — dev-branch verification re-confirms the existing success path (multi-item batch, mixed QOH/QOO scenarios) still behaves identically when the lock check passes |
| 6 | `dispatchBackgroundSaveOrRelease`'s "shadow save of unsaved changes" branch has the same URL-construction bug as the lock-release branch, but is explicitly **not** fixed by this plan (out of scope — locking only) — someone could later assume it's fixed because the sibling release path now works | Low (a pre-existing, unchanged gap, not a new one) | Low | Called out explicitly in this document (Section 1) and left untouched in the code, rather than silently left broken with no record; a future session touching WO autosave/unsaved-changes robustness should treat this as still-open |
| 7 | The new "Clear Lock" context-menu action is deliberately not admin-gated (your explicit choice) — any staff member can clear any Work Order's lock at any time | Medium (could be clicked accidentally or maliciously) | Low | Confirmation dialog required before it fires (adapted from the existing Flush Locks dialog's warning copy); scoped to one Work Order at a time, not system-wide — bounds the blast radius of a mistake to a single record |
| 8 | `set_workorder_lock` doesn't exist on production yet — every lock-acquire call in production will fail (function not found) until Phase 5's deploy lands, which is deliberately bundled at the end | High if go-live happens before Phase 5 | Low, if sequencing is respected | Explicitly called out here and in Phase 5 as a hard prerequisite for the broader go-live cutover — must not be forgotten or treated as "already handled" by an unrelated deploy |

---

## 4) Time Estimate

Autonomous agent work only (excludes your review/approval time between phases and your own manual UI click-through):

- **Phase 1** (RPC rewrite + new release edge function + `DocumentEditor.jsx` keepalive fix, deployed to dev): ~30-40 minutes
- **Phase 2** (`handleSave` restructure, autosave banner wiring, `handleConvertToInvoice` gate): ~35-45 minutes
- **Phase 3** (3 modals × open+submit client gates, 3 edge functions × server-side backstop, deployed to dev): ~50-65 minutes
- **Phase 4** (`WorkOrders.jsx` Flush Locks removal + `WorkOrderList.jsx` Clear Lock context-menu item + dialog): ~25-35 minutes
- **Phase 5** (production verification/deployment of everything, coordinated with broader go-live): ~20-30 minutes of agent work, timing otherwise driven by you

**Total: roughly 2.5-3.5 hours of agent execution**, spread across your approval gates between phases and your own dev-branch UI verification time (Section 6).

---

## 5) Roadmap & Progress

### Phase 1 — Lock RPC rewrite + real tab-close release `[Pending]`

**Files impacted:**
- `set_workorder_lock` (Postgres function, dev project `sitihbdnuxifwibontcm` — no existing migration file, one created for the first time)
- `supabase/functions/autopro-releaseWorkOrderLock/index.ts` (new)
- `src/components/work-orders/utils/workOrderLockUtils.js` (new — mirrors `supplierLockUtils.jsx`)
- `src/components/work-orders/DocumentEditor.jsx` (`dispatchBackgroundSaveOrRelease`, `beforeunload`/`pagehide` wiring)

**TL;DR:** Removes the RPC's silent 120-minute auto-steal, adds two new explicit-override actions (`force_apply`, `force_release`) that later phases wire up behind real user confirmations, and makes closing the tab actually release the lock — which today it silently does not.

**In-depth:** `set_workorder_lock`'s `apply` branch stops doing a second, stale-timestamp-gated `UPDATE` when someone else holds the lock — it just re-reads and returns the current row, so the caller always finds out who holds it and never gets silently handed the lock. Two new actions are added with the same 3-parameter signature: `force_apply` (unconditional `UPDATE ... SET LockedByUser = caller`, no `WHERE` ownership guard — used only by Phase 2's confirmed "Save anyway" path) and `force_release` (unconditional clear, no ownership guard — used only by Phase 4's confirmed "Clear Lock" action). `release` is untouched (still owner-scoped, still the normal exit path). A new small edge function, `autopro-releaseWorkOrderLock`, resolves the caller's identity from their JWT (same two-client pattern as `autopro-releaseSupplierLock`) and calls `set_workorder_lock` with `p_action: 'release'` — safe to fire without awaiting, since the RPC's own ownership check makes it a no-op if the lock already changed hands. `DocumentEditor.jsx`'s tab-close path gets a new, dedicated `releaseWorkOrderLockKeepAlive(roNumber)` helper (own file, exact pattern as `releaseSupplierLockKeepAlive`: `window.__SUPABASE_JWT__`, correct `${supabaseUrl}/functions/v1/...}` URL, `keepalive: true`), called unconditionally whenever `lockAcquiredRef.current` is true — no longer gated behind "only if there are no unsaved changes."

---

### Phase 2 — General Save gate `[Pending]`

**Files impacted:**
- `src/components/work-orders/hooks/useDocumentEditorSave.jsx`
- `src/components/work-orders/DocumentEditor.jsx` (autosave debounce effect, `handleConvertToInvoice`, new banner UI)

**TL;DR:** Every save-triggering action in the Work Order editor gets a live lock-ownership check before any side effect runs. A real user action that finds a conflict gets an explicit "someone else holds this — override?" confirm; autosave fails silently and shows a persistent banner instead of ever popping a dialog. `handleConvertToInvoice` gets its own early gate before the multi-step invoice wizard even starts.

**In-depth:** The existing (currently unchecked, currently mispositioned) lock-refresh call inside `handleSave` moves to the very first line of the function body — before deleted-line replenishment, pending-return processing, and the `autopro-WOBulkGetParts` call for unprocessed lines, all of which currently run unguarded. `handleSave` gains a new `saveOptions.isBackgroundSave` flag (default `false`); the autosave debounce effect (`DocumentEditor.jsx`) is the only caller that sets it `true`. On a conflict (the refreshed lock's `LockedByUser` isn't the current user): if `isBackgroundSave`, return `{ success: false, lockConflict: true, lockedByUser }` immediately with no dialog and no further work; otherwise, show a `window.confirm`-style prompt naming the current holder, and on confirmation call `set_workorder_lock` with the new `force_apply` action before continuing the rest of `handleSave` as normal — on cancellation, return `{ success: false, cancelled: true }` before any side effect has run. The autosave effect inspects the returned result: a `lockConflict` sets new `DocumentEditor.jsx` state driving a persistent, non-blocking banner ("Someone else now holds this Work Order — your changes aren't being auto-saved. Click Save to review."); a normal success clears that state. `handleConvertToInvoice` gains its own ownership check immediately after its existing parts-on-order/stage validation and before `window.confirm('Convert to Invoice?')` — blocking entry into the odometer/description/payment wizard outright if the lock isn't currently held by the initiating user, rather than only discovering the conflict at the wizard's final save.

---

### Phase 3 — Gate the three decoupled inventory actions `[Pending]`

**Files impacted:**
- `src/components/work-orders/GetPartModal.jsx`
- `src/components/work-orders/ReceivePartModal.jsx`
- `src/components/work-orders/MarkPartsOrderedModal.jsx`
- `supabase/functions/autopro-WOBulkGetParts/index.ts`
- `supabase/functions/autopro-processWorkOrderPartReceive/index.ts`
- `supabase/functions/autopro-processWorkOrderMarkQuotedOrdered/index.ts`

**TL;DR:** All three modals check lock ownership when they open (blocking entry with a clear message if the current user doesn't hold it) and again immediately before their submit call (blocking the commit, preserving whatever the user had entered/selected). All three edge functions gain an independent, server-side version of the same check, so a bypass of the client-side gate — or any future caller nobody added a client gate to — still can't write.

**In-depth:** Each modal's existing "on open, fetch fresh data" effect (`GetPartModal.jsx`'s `fetchData` effect, `ReceivePartModal.jsx`'s `fetchAndBuildRows` effect, `MarkPartsOrderedModal.jsx`'s `open` effect) gains a fresh `WorkOrder.LockedByUser` read before proceeding, setting a local `lockConflict`/`lockedByUser` state that replaces the modal's normal content with a blocking message when it doesn't match the current user — never trusting a `workOrder` prop that could be stale relative to the moment the modal was actually opened. Each modal's submit handler (`handleAddSelectedParts`, `handleSubmit`, `handleSubmit`) re-checks immediately before its `supabase.functions.invoke(...)` call, setting an inline error and aborting before any network call if the lock is no longer valid — none of the three clear their in-progress selection/state on this path, so nothing already entered is lost. Server-side: `autopro-WOBulkGetParts` gains a new `WorkOrder` fetch (by `workOrderId`/`roNumber`, both already present in its payload but never previously read) immediately after input validation and before its per-item loop, rejecting with a clear error if the resolved JWT user isn't the current `LockedByUser`; `autopro-processWorkOrderPartReceive` and `autopro-processWorkOrderMarkQuotedOrdered` get the equivalent check inserted right after each function's own existing `WorkOrder` fetch (both already fetch the row for other reasons, so this is a small addition, not a new query) and before any line-item/inventory mutation begins.

---

### Phase 4 — WorkOrders list UI: remove Flush Locks, add scoped Clear Lock `[Pending]`

**Files impacted:**
- `src/pages/WorkOrders.jsx`
- `src/components/work-orders/WorkOrderList.jsx`

**TL;DR:** The unguarded, system-wide "Flush Locks" button is deleted outright. The search bar absorbs the freed width. A new, single-Work-Order-scoped "Clear Lock" action is added to the row-level right-click context menu that already exists on `WorkOrderList.jsx` — styled as a clearly destructive action (red background, white text), gated behind a confirmation dialog adapted from the removed Flush Locks dialog's warning copy.

**In-depth:** `WorkOrders.jsx` loses `handleFlushLocks`, the `showFlushConfirm` state, the "Flush Locks" `Button`, and its confirmation `Dialog` entirely (currently lines 996-1015, 1206-1213, 1238-1257, and the `showFlushConfirm` `useState` at line 48) — no replacement button is added in that spot; the search bar's existing `flex-1` container naturally grows into the freed space once one fewer fixed-width button sits in the row, with Refresh remaining exactly where it already is today (already the leftmost/first action button). `WorkOrderList.jsx`'s existing per-row `ContextMenu` (lines 208-358) gains a new `ContextMenuItem`, rendered only when that row's Work Order currently has a `LockedByUser` set (mirroring how "Receive Parts"/"Mark Parts as Ordered" only render when applicable), styled with an explicit red background/white text class rather than the menu's normal item styling. Clicking it opens a confirmation dialog (new, small, local to this component — copy adapted from the removed Flush Locks dialog: "This will unlock this Work Order. Progress of any unsaved work in it may not be saved. Verify no one is actively using it before proceeding.") whose confirm action calls `set_workorder_lock` with the new `force_release` action for that one `ro_number`, then refreshes the list.

---

### Phase 5 — Production verification & deployment `[Pending]`

**Files impacted:** none new — deployment/verification of everything from Phases 1-4, plus the first-ever migration file for `set_workorder_lock`.

**TL;DR:** Everything above is proven on dev first; production gets `set_workorder_lock` for the first time (it doesn't exist there today), the new/modified edge functions, and the frontend changes, all deployed together rather than piecemeal — timed alongside the project's broader go-live cutover, not ahead of it.

**In-depth:** A `supabase/migrations/*.sql` file is written for the first time for `set_workorder_lock` (closing the pre-existing gap noted in Section 1), containing the final rewritten definition from Phase 1. Every edge function touched by Phases 1 and 3 (`autopro-releaseWorkOrderLock`, `autopro-WOBulkGetParts`, `autopro-processWorkOrderPartReceive`, `autopro-processWorkOrderMarkQuotedOrdered`) is deployed to production via `deploy_edge_function`, and the RPC is created on production via `apply_migration`, only once you've approved dev-branch verification (Section 6) as fully passed. The frontend (all of Phases 1, 2, 3, 4's `src/` changes) is deployed via your normal `development` → `main` → Vercel workflow, coordinated with the backend deploy rather than left to drift independently — matching this project's established "frontend and backend must reach production together" discipline for any contract-coupled change.

---

## 6) Verification Plan

**Phase 1 (dev branch, `sitihbdnuxifwibontcm`):**
1. Query `pg_get_functiondef` directly to confirm the deployed RPC matches the rewritten source exactly (no drift from what was reviewed/approved).
2. Via the Supabase connector: call `set_workorder_lock('apply', ...)` twice in a row for two different simulated users against the same real dev Work Order — confirm the second call does *not* silently take the lock (returns the first user as current holder), even after manually backdating `locked_timestamp` on that row past 120 minutes.
3. Call `force_apply` as a second user against a Work Order already locked by a first user — confirm it succeeds unconditionally and the row now shows the second user as holder.
4. Call `force_release` against a locked Work Order — confirm it clears regardless of who holds it.
5. Open a real dev Work Order in the browser, confirm the lock is acquired (existing behavior, unchanged), then close the browser tab (not via any in-app button) — via the connector, confirm `LockedByUser`/`locked_timestamp` are cleared shortly after, proving the new keepalive release actually fired (this is the core, previously-broken behavior this phase exists to fix).

**Phase 2 (dev branch, full UI):**
1. Open the same dev Work Order in two different browser sessions as two different users. In session A, confirm the lock. In session B, attempt to save any field — confirm the "someone else holds this" dialog appears, naming session A's user, before anything is written.
2. Decline the dialog in session B — confirm nothing was saved (reload and verify session A's data is untouched) and session B's own unsaved edits are still visible in its form, not cleared.
3. Confirm the dialog in session B — confirm the save succeeds, session B is now the lock holder, and reloading session A shows session B's changes.
4. Repeat steps 1-3 but trigger the conflict via a non-Save-button action specifically (add a payment, or change the WO's status) — confirms the gate protects those call sites too, not just the header Save button.
5. With session A idle (not typing) for over 2 seconds while session B holds a conflicting lock state, confirm session A's autosave does **not** pop any dialog — confirm the persistent banner appears instead, and that it disappears once session A successfully saves past the conflict.
6. On a Work Order in "Work Order" stage with no parts on order, have session B take the lock, then in session A click "Invoice" to start conversion — confirm it's blocked immediately, before the odometer step ever appears, with a message naming session B.

**Phase 3 (dev branch, full UI, one qualifying dev Work Order per action):**
1. Get Part: with the lock held by another simulated user, right-click a blank line → Get Part — confirm the modal either doesn't open or opens showing a blocking "locked by X" message, not the normal search UI.
2. Regain the lock, open Get Part normally, select a part — then (via the connector) force the lock to another user while the modal is still open — click "Add to Work Order" — confirm it's blocked with a clear error and the selected part(s)/quantity are still shown in the modal, not cleared.
3. Repeat steps 1-2 for Receive Parts and for Mark Parts as Ordered, each against a Work Order with a qualifying line (on-order/quoted, per each action's existing gating).
4. Directly via the connector (bypassing the UI): call `autopro-WOBulkGetParts` with a valid payload against a Work Order currently locked by a *different* user than the JWT's — confirm it's rejected server-side. Repeat for `autopro-processWorkOrderPartReceive` and `autopro-processWorkOrderMarkQuotedOrdered`.
5. With the lock correctly held by the calling user in all three cases, confirm each of the three actions still succeeds end-to-end exactly as before this plan (no regression to the existing, working business logic) — reload the Work Order and confirm the expected `line_items`/inventory changes persisted.

**Phase 4 (dev branch, full UI):**
1. On the WorkOrders list page, confirm "Flush Locks" no longer appears anywhere, and that Refresh is still present and the search bar is visibly wider than before.
2. Lock a Work Order (open it in another session/tab), then right-click that row in the list — confirm "Clear Lock" appears, styled distinctly (red/white) from the other menu items, and does **not** appear on an already-unlocked row.
3. Click it, confirm the warning dialog appears with the adapted single-WO copy, cancel — confirm the lock is untouched.
4. Click it again, confirm — confirm the lock clears (reload the list/row to verify server-side, not just optimistic UI) and the other session, if still open, is now unaware it's lost the lock (expected — the next save attempt in that session is exactly what Phase 2's gate is for).

**Phase 5 (after dev verification fully passes, at production-deploy time):**
1. Confirm via `pg_get_functiondef` against `hbcrwkmgsazqrvsrmxyr` that `set_workorder_lock` now exists in production for the first time, matching the dev-verified definition exactly.
2. Confirm all four production-deployed edge functions respond correctly to an OPTIONS preflight (200, no crash-at-construction) and reject an unauthenticated request appropriately, before any real traffic relies on them.
3. Immediately after the coordinated frontend+backend production deploy, repeat a lightweight version of Phase 2/3/4's UI checks against a real (or deliberately low-risk) production Work Order.

---

## 7) Working Area (Current Phase)

### Phase 1 — Lock RPC rewrite + real tab-close release

#### 1a. `set_workorder_lock` — full replacement, deployed via `apply_migration` to dev (`sitihbdnuxifwibontcm`) only in this phase

```sql
CREATE OR REPLACE FUNCTION set_workorder_lock(
  p_ro_number text,
  p_action text,       -- 'apply' | 'release' | 'force_apply' | 'force_release'
  p_locked_by_user text
) RETURNS "WorkOrder"
LANGUAGE plpgsql AS $$
DECLARE
  v_row "WorkOrder"%ROWTYPE;
BEGIN
  IF p_action = 'apply' THEN
    -- Race-safe acquire: single statement, only succeeds if unlocked or already owned by caller.
    UPDATE "WorkOrder"
      SET "LockedByUser" = p_locked_by_user, locked_timestamp = now()
      WHERE ro_number = p_ro_number
        AND ("LockedByUser" IS NULL OR "LockedByUser" = '' OR "LockedByUser" = p_locked_by_user)
      RETURNING * INTO v_row;

    IF v_row.id IS NULL THEN
      -- Someone else holds it. No auto-steal on staleness (removed 2026-08-15) - just report
      -- the current state so the caller can show an explicit "X holds this" prompt.
      SELECT * INTO v_row FROM "WorkOrder" WHERE ro_number = p_ro_number;
    END IF;

  ELSIF p_action = 'force_apply' THEN
    -- Explicit, human-confirmed override only (e.g. "Save anyway" after a warning dialog).
    -- Unconditional - callers MUST gate this behind a real user confirmation; the RPC itself
    -- has no way to verify that.
    UPDATE "WorkOrder"
      SET "LockedByUser" = p_locked_by_user, locked_timestamp = now()
      WHERE ro_number = p_ro_number
      RETURNING * INTO v_row;

  ELSIF p_action = 'release' THEN
    UPDATE "WorkOrder"
      SET "LockedByUser" = NULL, locked_timestamp = NULL
      WHERE ro_number = p_ro_number
        AND ("LockedByUser" IS NULL OR "LockedByUser" = p_locked_by_user)
      RETURNING * INTO v_row;

  ELSIF p_action = 'force_release' THEN
    -- Manual "Clear Lock" action only (WorkOrderList.jsx context menu). Unconditional - callers
    -- MUST gate this behind a real user confirmation.
    UPDATE "WorkOrder"
      SET "LockedByUser" = NULL, locked_timestamp = NULL
      WHERE ro_number = p_ro_number
      RETURNING * INTO v_row;
  END IF;

  RETURN v_row;
END;
$$;
```

Deploy step: `apply_migration` against `sitihbdnuxifwibontcm` only. Production is untouched until Phase 5.

#### 1b. New file: `supabase/functions/autopro-releaseWorkOrderLock/index.ts`

Exact structural copy of `autopro-releaseSupplierLock/index.ts`, adapted for `WorkOrder`/`ro_number` and routed through the RPC instead of a raw table update (since `set_workorder_lock` already owns the canonical, safe release semantics):

```ts
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const res = (data: any, options: any = {}) => {
    return new Response(JSON.stringify(data), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json', ...(options.headers || {}) }
    });
  };

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseSecret = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !supabaseSecret) {
      return res({ success: false, error: 'Supabase credentials not configured' });
    }

    const supabase = createClient(supabaseUrl, supabaseSecret, {
      auth: { persistSession: false }
    });

    let userEmail: string | null = null;
    const authHeader = req.headers.get('Authorization');
    if (authHeader) {
      try {
        const token = authHeader.replace('Bearer ', '');
        const supabaseAuth = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY') || supabaseSecret, {
          auth: { persistSession: false }
        });
        const { data: { user: authUser }, error: authError } = await supabaseAuth.auth.getUser(token);
        if (authUser) {
          userEmail = authUser.email ?? null;
        } else if (authError) {
          console.error('Auth error resolving user:', authError);
        }
      } catch (err) {
        console.error('Failed to resolve user from auth header:', err);
      }
    }

    if (!userEmail) {
      return res({ success: false, error: 'Unable to resolve authenticated user from request' });
    }

    const { roNumber } = await req.json();

    if (!roNumber) {
      return res({ success: false, error: 'roNumber is required' });
    }

    // set_workorder_lock's own 'release' branch is already ownership-scoped (only clears if
    // still held by this user, or already null) - safe to call without a separate check-then-act.
    const { data: releasedWorkOrder, error: rpcError } = await supabase.rpc('set_workorder_lock', {
      p_ro_number: roNumber,
      p_action: 'release',
      p_locked_by_user: userEmail,
    });

    if (rpcError) {
      return res({ success: false, error: rpcError.message || 'Failed to release work order lock' });
    }

    return res({
      success: true,
      lockReleased: !releasedWorkOrder?.LockedByUser,
      roNumber
    });
  } catch (error: any) {
    console.error('Error in releaseWorkOrderLock:', error);
    return res({ success: false, error: error.message || 'Failed to release work order lock' });
  }
});
```

Deploy step: `deploy_edge_function` to `sitihbdnuxifwibontcm` only, `verify_jwt: false` (matching `autopro-releaseSupplierLock`'s own setting — the function resolves identity from the bearer token itself and must remain callable from a `keepalive` fetch during page teardown).

#### 1c. New file: `src/components/work-orders/utils/workOrderLockUtils.js`

Exact structural copy of `supplierLockUtils.jsx`:

```js
export function releaseWorkOrderLockKeepAlive(roNumber) {
  if (!roNumber) return;
  const jwt = window.__SUPABASE_JWT__;
  if (!jwt) return;

  try {
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
    fetch(`${supabaseUrl}/functions/v1/autopro-releaseWorkOrderLock`, {
      method: 'POST',
      keepalive: true,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${jwt}`,
      },
      body: JSON.stringify({ roNumber }),
    }).catch((error) => console.error('Background work order lock release failed:', error));
  } catch (error) {
    console.error('Failed to dispatch keepalive work order lock release:', error);
  }
}
```

#### 1d. `src/components/work-orders/DocumentEditor.jsx` — `dispatchBackgroundSaveOrRelease` (currently lines 275-296)

Add the import near the top (alongside the existing `appParams` import at line 8):
```js
import { releaseWorkOrderLockKeepAlive } from './utils/workOrderLockUtils';
```

Replace the function body so the lock-release keepalive fires unconditionally (not only in the "no unsaved changes" branch), leaving the shadow-save branch's own logic untouched:

```js
const dispatchBackgroundSaveOrRelease = useCallback(() => {
  if (isClosingAfterSaveRef.current || backgroundSyncStartedRef.current || !workOrder?.ro_number) {
    return;
  }

  backgroundSyncStartedRef.current = true;

  if (hasUnsavedChanges) {
    const shadowBody = (shadowStorageKey && window.localStorage.getItem(shadowStorageKey)) || buildShadowSaveRequest();
    if (shadowBody) {
      postKeepAliveFunction('autopro-saveworkorderdata', shadowBody);
    }
  }

  if (lockAcquiredRef.current) {
    releaseWorkOrderLockKeepAlive(workOrder.ro_number);
  }
}, [workOrder?.ro_number, hasUnsavedChanges, shadowStorageKey, buildShadowSaveRequest, postKeepAliveFunction]);
```

The only functional change from today: the lock-release call is no longer inside an `else` that only runs when `hasUnsavedChanges` is false — both branches can now fire together (shadow-save attempt, still separately broken and out of scope, *and* the now-working lock release). `postKeepAliveFunction`/`appParams` remain otherwise untouched, since the shadow-save branch is explicitly out of scope for this plan (Risk #6).

---

**Awaiting your approval before making any code changes.**
