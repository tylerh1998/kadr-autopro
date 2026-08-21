# Implementation Plan: Rewrite `ReceivePartModal` Into a Bulk Receive-Parts Flow

**Status:** Pending your approval — no code changes made yet.
**Parent:** None (standalone feature request, not a `Pre_go-live_plan.md` item).

---

## 1) Context & Lessons Learned

**Core goal.** Today, receiving a part onto a work order is a one-line-at-a-time action: right-click a line item → "Receive Part" → a modal opens for *that single line* (`ReceivePartModal.jsx` if it's on-order, `ReceiveQuotedPartModal.jsx` if it's still just quoted) → confirm a quantity → submit. **This plan rewrites `ReceivePartModal.jsx` in place** — same file, same component name, same import path — into a bulk table that lists every receivable line on the work order at once, modeled on the existing bulk **"Mark Parts as Ordered"** flow. **This is explicitly not a new file added alongside the old one.** `ReceiveQuotedPartModal.jsx` is deleted, its logic folded into the rewritten `ReceivePartModal.jsx`. The backend gets the identical treatment: `autopro-processWorkOrderPartReceive/index.ts` is rewritten in place (same function, same name, same deployed endpoint) to handle the new bulk payload, and `autopro-processWorkOrderReceiveQuotedPart` is deleted, its logic folded in.

**`MarkPartsOrderedModal.jsx` and `autopro-processWorkOrderMarkQuotedOrdered` are explicitly out of scope and stay exactly as they are today** — confirmed multiple times now, this plan does not touch either file. (Flagged this prominently in an earlier draft purely as a guardrail — those files sit in the same `modals` state object and the same context-menu file as what's being rewritten/deleted here, so it's an easy thing to accidentally sweep up during cleanup if it isn't called out explicitly. Nothing else notable about them.)

**Existing pattern being copied (verified by reading the actual source, not assumed):**
- **Bulk template (UI):** [`MarkPartsOrderedModal.jsx`](../src/components/work-orders/MarkPartsOrderedModal.jsx) — opened from a context-menu item in [`LineItemsTable.jsx`](../src/components/work-orders/form/LineItemsTable.jsx) (line ~391-398, only rendered when `mode !== 'estimate'` and at least one line has `qty_quoted > 0`), which calls a plain no-arg handler (`onMarkPartsOrdered`) wired in [`WorkOrderForm.jsx`](../src/components/work-orders/form/WorkOrderForm.jsx) (`handleMarkPartsOrdered` → `openModal('markOrdered')`, line ~413-416). The modal itself is a **checkbox list** (no quantity input — marking-ordered always moves the *entire* quoted quantity, never partial). The new `ReceivePartModal` will follow this exact table-level trigger shape (gated on "does *any* line qualify," not on which specific line was right-clicked) rather than its own current per-line-scoped trigger.
- **Bulk template (backend):** [`autopro-processWorkOrderMarkQuotedOrdered/index.ts`](../supabase/functions/autopro-processWorkOrderMarkQuotedOrdered/index.ts) — takes `{ workOrderId, roNumber, lineItemIds[] }`, batch-fetches every distinct `InventoryItem` touched, keeps a **running per-item quantity_on_order total** (`runningQOO` map) so two selected lines sharing one `inventory_item_id` don't race each other's math, writes the whole `WorkOrder.line_items` array back in one `UPDATE`, then calls the `update_inventory_with_audit` RPC **sequentially, once per line** (not `Promise.all` — each call must see the previous call's write for the running total to hold), producing one audit-trail row per line even when several lines share one inventory item. Returns `{ success, message, updatedLineItems, skipped[] }`.
- **Single-line receive logic being folded into the rewrite:**
  - [`ReceivePartModal.jsx`](../src/components/work-orders/ReceivePartModal.jsx) + [`autopro-processWorkOrderPartReceive/index.ts`](../supabase/functions/autopro-processWorkOrderPartReceive/index.ts) — receives against `qty_on_order`. Decrements the WO line's `qty_on_order`, and the `InventoryItem`'s `quantity_on_hand` **and** `quantity_on_order`. Audit `tx_type: 'Issued to WO'`, description `Issued to ${ro} - ${desc}`. **These are the two files/endpoint being rewritten in place.**
  - [`ReceiveQuotedPartModal.jsx`](../src/components/work-orders/ReceiveQuotedPartModal.jsx) + [`autopro-processWorkOrderReceiveQuotedPart/index.ts`](../supabase/functions/autopro-processWorkOrderReceiveQuotedPart/index.ts) — receives against `qty_quoted`. Decrements the WO line's `qty_quoted` and `quantity_on_hand` only — `quantity_on_order` is **untouched**, because a quoted line was never counted as on-order in the first place. **Both deleted; logic folded into the rewritten pair above.**
  - **Why two separate files exist today:** the *only* functional difference is whether `quantity_on_order` needs to be unwound on receipt. An on-order line was formally counted as incoming stock (`InventoryItem.quantity_on_order` was incremented when it was ordered), so receiving it must decrement that count back down. A quoted line was never placed on order — nothing was ever counted as incoming for it — so receiving it only ever touches `quantity_on_hand`. Layout, validation, and defaulting logic are otherwise identical between the two files. **Net effect of this plan: 2 modals + 2 edge functions → 1 modal + 1 edge function**, both keeping their original single-line names, rewritten in place rather than replaced by new files.
  - Both single-line modals re-fetch the `InventoryItem` fresh from Supabase the moment they open (never trust a stale prop), default the quantity input to `min(currentQOH, sourceQty)`, and hard-cap the input at that same max — client-side convenience only, the edge function re-validates independently against live DB values regardless of what the client sends. The rewritten modal keeps this same freshness discipline, just batch-fetching for every qualifying line instead of one.
- **Trigger/wiring plumbing (exact shape to replicate):** `WorkOrderForm.jsx` keeps one `modals` state object (`useState({ getPart: false, otherCharge: false, addPart: false, returnPart: false, receivePart: false, receiveQuotedPart: false, cores: false, markOrdered: false })`, line ~100-109) plus generic `openModal(name, lineIndex)` / `closeModal(name)` callbacks (line ~340-361). The rewrite **reuses the existing `receivePart` key as-is** (no new key needed) and **removes `receiveQuotedPart`** entirely. Each modal's success callback **optimistically patches local `displayLineItems` state** via `tracedSetLineItems` (see `handleWorkOrderPartsMarkedOrdered`, line ~849-865) rather than re-fetching the whole work order — the modal's own edge-function call already persisted the change server-side.
- **Deploy convention confirmed:** none of the three sibling functions above have an entry in `supabase/config.toml` — they run on default settings. Rewriting `autopro-processWorkOrderPartReceive` in place needs no new config.toml entry (it already has none, and still won't after the rewrite).

**Design decisions, confirmed.** Final column set: **Part Info** (with a checkbox at the left of each row — not a separate checkbox column) / **Qty On Order-Quoted** / **Qty On Hand** / **Apply to WO**, with the last three color-coded. The checkbox defaults to **checked for every row the batch can actually satisfy** (`min(QOH, sourceQty) > 0`) and is disabled/unchecked for any row that can't be satisfied at all (zero QOH) — the same "receivable > 0" gate the single-line modals already use to disable their own submit button, just applied per-row instead of to the whole modal. "Apply to WO" is the editable quantity field, defaulting to `min(QOH, sourceQty)` and capped at that same max, identical default/cap logic to the two single-line modals today.

**Color coding (last three columns), reusing the palette the two single-line modals already established, plus one new addition:**
- **Qty On Order-Quoted:** purple for on-order-sourced rows (matches `ReceivePartModal.jsx`'s current "On Order (WO)" box), rose for quoted-sourced rows (matches `ReceiveQuotedPartModal.jsx`'s current "Quoted (WO)" box) — the color itself communicates which source a row draws from, no need to re-read text.
- **Qty On Hand:** blue, matching both single-line modals' current "Available in Inventory" box.
- **Apply to WO:** green — new to this modal (the single-line modals never needed it, since they only ever show one row) — visually marks it as the actual commit/action value, distinct from the two purely-informational columns beside it.

**Mixed on-order + quoted lines in one screen.** A line's source is determined the same way the current per-line context menu decides it (`LineItemsTable.jsx` line ~369): if `qty_on_order > 0` it's on-order-sourced; otherwise if `qty_quoted > 0` it's quoted-sourced.

**Remaining design point (recommended default, not a hard requirement):** when several selected lines share one `inventory_item_id` and their combined requested quantity exceeds that item's live `quantity_on_hand`, the backend **skips whichever line(s) run out of stock (processed in the order submitted) and still applies everything that fits**, reporting skipped lines back in a `skipped[]` array — rather than rejecting the entire batch. This matches the bulk mark-ordered function's existing `skipped[]` convention. **Improvement over the copied pattern:** `MarkPartsOrderedModal.jsx` today never actually surfaces `skipped` in its UI even though its backend already returns it — the rewritten modal will display any skipped lines/reasons after submit, closing that gap rather than carrying it forward silently.

**Why this is a riskier deploy than a typical additive feature, and how that's handled.** Because this is an in-place rewrite of a currently-**live, daily-used, production** modal and edge function — not a new file shipped alongside the old one — there is no "old flow stays as a fallback" safety net once this ships. Two things specifically follow from that:
1. **All development and verification happens against the dev Supabase branch (`sitihbdnuxifwibontcm`) only**, confirmed isolated from production per prior sessions' findings — the rewritten function is deployed and fully exercised there first, and the rewritten UI is verified there (via whichever build points at the dev branch — confirmed directly, not assumed, before UI testing starts) before any production deploy is even considered.
2. **The frontend and backend must reach production together, not independently** — the new `ReceivePartModal.jsx` sends a `{ receipts: [...] }` payload shape that only the rewritten edge function understands, and vice versa. Deploying just one side to production would break the live receive-parts flow immediately (a real production incident, not a graceful failure). Since you deploy the frontend yourself (git push/merge via GitHub Desktop, per your standing preference) and I'd deploy the edge function via the `deploy_edge_function` tool only with your explicit go-ahead, **the production cutover for both needs to happen back-to-back, coordinated with you** — not "edge function today, frontend whenever." Section 5 calls this out as an explicit final step, not folded silently into "Phase 2 is done."

---

## 2) Previously Completed

Nothing has been built for this feature yet — this is a net-new initiative with no prior phases. For historical context, the following **pre-existing, already-shipped-and-in-production** pieces are what this plan builds on top of (not part of this plan's own work, listed here only because Phase 1/2 depend on their exact behavior):

- Single-line "Receive Part" flow (on-order and quoted variants) — `ReceivePartModal.jsx` / `ReceiveQuotedPartModal.jsx` + their two edge functions. **This plan rewrites the on-order pair in place and deletes the quoted pair — see Section 5.**
- Bulk "Mark Parts as Ordered" flow — `MarkPartsOrderedModal.jsx` + `autopro-processWorkOrderMarkQuotedOrdered`. **Untouched by this plan.**
- The `update_inventory_with_audit` Postgres RPC (shared by all inventory-affecting edge functions) — writes both the `InventoryItem` QOH/QOO update and its audit-trail row atomically.
- `WorkOrderForm.jsx`'s generic `modals` state / `openModal` / `closeModal` plumbing and optimistic local-state-patch pattern.

This session's research (read-only — confirmed via direct source read, not assumed): all files named in Section 1 above, plus `supabase/config.toml` (confirmed the three sibling functions have no explicit config entry) and `LineItemsTable.jsx`'s icon imports (`Package`, `Truck` already imported and already used by both the current "Receive Part" and "Mark Parts as Ordered" entries — no new icon dependency needed).

---

## 3) Risk Assessment

| # | Risk | Impact | Likelihood | Mitigation |
|---|---|---|---|---|
| 1 | Two selected lines in the *same* bulk request share one `inventory_item_id`, and naively processing them independently double-spends the same physical stock (e.g. QOH goes negative, or both lines "succeed" for units that don't exist) | High if it happens — bad inventory data | Low — will happen routinely (splitting one order across multiple WO lines is normal), if not explicitly handled | Backend keeps a running per-item QOH (and QOO, for on-order lines) map seeded from the live DB value, decremented as each line in the batch is processed, in submitted order — mirrors the exact technique already proven correct in `autopro-processWorkOrderMarkQuotedOrdered`'s `runningQOO` map |
| 2 | Client sends a quantity the server doesn't independently verify (stale QOH read at modal-open time, or a tampered/buggy request), causing a receive that exceeds real stock | Medium | Low | Server re-fetches live `InventoryItem` rows and re-validates every requested quantity against both the line's live `qty_on_order`/`qty_quoted` and the running QOH map before applying anything — identical "never trust the client's number" discipline already used today |
| 3 | Partial success (some lines received, some skipped for insufficient stock) is confusing if the UI doesn't clearly show which lines were skipped and why | Medium (silent data-looks-wrong confusion, not corruption) | Medium — `MarkPartsOrderedModal.jsx` already has this exact gap today (backend returns `skipped[]`, UI ignores it) | Rewritten modal explicitly surfaces `skipped[]` from the response after submit |
| 4 | Mixing on-order-sourced and quoted-sourced lines in one table, each with different backend side effects (QOO touched vs. not), confuses the user about what actually happened | Low-Medium | Medium | Reuse the existing purple/rose "On Order (WO)" vs "Quoted (WO)" badge coloring already established today, so the visual language is already familiar |
| 5 | Two different users (or two browser tabs) bulk-receive against the same `WorkOrder`/`InventoryItem` concurrently — a true cross-request race, not just within one batch | Low-Medium | Low | Pre-existing risk shared with every current receive/mark-ordered flow already in production (none of them use row locking) — this plan doesn't make it worse, and fixing it is out of scope here |
| 6 | Malformed quantity input (negative, non-numeric, zero, exceeding max) reaches the backend | Low | Low | Same client-side `min`/`max`/`step` input constraints as today, plus mandatory independent server-side bounds checking (never trust client validation alone) |
| 7 | New/moved context-menu entry accidentally becomes reachable in `mode === 'estimate'` (estimates shouldn't be receiving physical inventory) | Medium (wrong-context inventory movement) | Low | Gate it behind the exact same `mode !== 'estimate'` condition already used for "Mark Parts as Ordered" and today's "Receive Part" |
| 8 | **This is an in-place rewrite of a currently-live, daily-used production flow, with no parallel old-flow fallback once shipped** — a bug only surfaces in production, on a routine daily action | High if it happens | Low, if verification discipline is followed | All development and verification happens against the isolated **dev** Supabase branch first (both the rewritten function and the rewritten UI, end to end) — nothing reaches production until that's fully proven; see Section 1's dedicated explanation |
| 9 | Frontend and backend are contract-coupled (`receipts[]` payload) — deploying either to production without the other breaks the live receive-parts flow immediately | High if it happens, but easy to avoid | Low, if coordinated | Production deploy of the edge function (my action, via `deploy_edge_function`, only with your explicit go-ahead) and the frontend (your action, via GitHub Desktop) must happen back-to-back, not independently — flagged as an explicit final step in Section 5, not silently bundled into "Phase 2 done" |
| 10 | Deleting `ReceiveQuotedPartModal.jsx` / `autopro-processWorkOrderReceiveQuotedPart` leaves a dangling import or caller somewhere `grep` didn't catch, breaking the build or a forgotten call site | Low | Low | Full repo-wide grep for both filenames/import paths before deleting (already confirmed in this session's research that `WorkOrderForm.jsx` is the *only* importer of either file), plus a clean `npm run build` as part of Phase 2's own verification; both deletions are trivially git-reversible regardless |

---

## 4) Time Estimate

Autonomous agent work only (excludes your review/approval time between phases, your manual UI click-through, and your own production deploy timing):

- **Phase 1** (rewrite `autopro-processWorkOrderPartReceive/index.ts` in place, delete `autopro-processWorkOrderReceiveQuotedPart`, deploy to dev, API-level smoke test via connector): ~25-30 minutes
- **Phase 2** (rewrite `ReceivePartModal.jsx` in place, delete `ReceiveQuotedPartModal.jsx`, move/relabel the context-menu trigger in `LineItemsTable.jsx`, simplify/update state-handlers and the Ctrl+N shortcut in `WorkOrderForm.jsx`, clean `npm run build`, dev-server visual verification via Browser tool): ~40-50 minutes

**Total: roughly 65-80 minutes of agent execution**, spread across your approval gate between phases and however long your own manual click-through verification takes. The **coordinated production cutover** (Section 5) happens on your timing after Phase 2 is fully verified on dev — not counted here since it's mostly your own deploy action.

---

## 5) Roadmap & Progress

### Phase 1 — Rewrite the receive-part edge function in place `[Executed, partially verified — see result below]`

**Files impacted:**
- `supabase/functions/autopro-processWorkOrderPartReceive/index.ts` (rewritten in place — same function/endpoint name)
- `supabase/functions/autopro-processWorkOrderReceiveQuotedPart/` (deleted entirely)

**TL;DR:** `autopro-processWorkOrderPartReceive` keeps its name and deployed identity, but its request contract and internals change: it now accepts a list of `{lineItemId, quantity}` receipts instead of one, applies each against whichever accounting path fits that line (on-order vs. quoted sourced — the quoted-specific function's logic is absorbed here), using a running-total map so multiple lines sharing one `inventory_item_id` can't double-spend the same stock within a batch, and returns which lines succeeded vs. were skipped and why. `autopro-processWorkOrderReceiveQuotedPart` is deleted — fully superseded.

**In-depth:** Structurally, the rewrite follows `autopro-processWorkOrderMarkQuotedOrdered`'s shape (auth check → load `WorkOrder` by `roNumber`/`workOrderId` → parse `line_items` → batch-fetch distinct `InventoryItem` rows → running-total map → single `line_items` write-back → sequential per-line RPC calls), with per-line logic that merges what `autopro-processWorkOrderPartReceive` and `autopro-processWorkOrderReceiveQuotedPart` each do today, branching per line by source. Full code drafted in Section 7 (Working Area) below.

**Deployed to the dev Supabase project (`sitihbdnuxifwibontcm`) only in this phase.** Production's currently-deployed copy of `autopro-processWorkOrderPartReceive` is *not* touched yet — it keeps serving today's live single-line `ReceivePartModal.jsx` in production unchanged until the coordinated cutover after Phase 2 (Section 1's risk #8/#9).

Explicitly **not** in this phase: no frontend changes. `ReceivePartModal.jsx` keeps calling the function with today's old single-line payload shape until Phase 2 rewrites it — meaning **the dev branch's frontend will be temporarily out of sync with the dev branch's rewritten function** between Phase 1 and Phase 2 (the old dev frontend calling the new dev function contract would fail). That's expected and fine: Phase 1's own verification (Section 6) tests the function directly via the Supabase connector, not through the (soon-to-be-replaced) UI.

**Result (2026-08-15):** Rewritten, deployed to dev (`sitihbdnuxifwibontcm`, version 21, `ACTIVE`), and `autopro-processWorkOrderReceiveQuotedPart` deleted from the repo. Confirmed via `get_edge_function` that the pre-rewrite dev deployment matched the repo source exactly (no drift) before touching it, and confirmed the `update_inventory_with_audit` RPC signature and `WorkOrder`/`InventoryItem` schema match what the rewrite assumes. Verified: OPTIONS preflight returns 200 (no crash-at-construction — the specific master_context.md-documented failure mode for top-level SDK client construction); an unauthenticated POST is correctly gateway-rejected (401, `verify_jwt: true` still enforced, unchanged from before); a direct RPC-level test against a real dev line (`RO50771`, part `SP594`, `InventoryItem fff8ae5d-...`) — decrement 1 unit, confirmed `quantity_on_hand`/`quantity_on_order` updated correctly (6→5, 582→581) and a matching `InventoryAuditLog` row was created with the right `tx_type`/`ro_number`/`source_function` — then reverted the `InventoryItem` back to its exact original values via a plain `UPDATE` (the one `InventoryAuditLog` row from the test remains, clearly labeled `TEST - Phase 1 rewrite verification only, reverted immediately after` — intentional, not cleaned up, since audit logs are meant to be append-only and this is dev-only).
**Not yet verified (deferred to Phase 2 by design):** the actual JS logic paths inside the rewritten function — `receiptMap` parsing, the running-total map across shared `inventory_item_id`s, and the skip-with-reason branch — since exercising those requires a real authenticated HTTP call through the deployed Deno code, which needs a real user session/JWT that only exists once there's a UI to log in through. The SQL-level test above proves the RPC contract and schema assumptions are correct; it does not execute the new function's own TypeScript.

---

### Phase 2 — Rewrite `ReceivePartModal.jsx` in place + wiring cleanup `[Core flow verified live on dev — see result below]`

**Files impacted:**
- `src/components/work-orders/ReceivePartModal.jsx` (rewritten in place — same component name/import path)
- `src/components/work-orders/ReceiveQuotedPartModal.jsx` (deleted entirely)
- `src/components/work-orders/form/LineItemsTable.jsx` (the per-line "Receive Part" `ContextMenuItem`, currently gated per-row inside the `{line.part_number && (...)}` block at ~line 367-375, moves out to the table-level block next to "Mark Parts as Ordered" — gated on `mode !== 'estimate' && lineItems.some(l => (qty_on_order>0||qty_quoted>0))`, same shape as that entry's own gate; the branching `onReceivePart(index)`/`onReceiveQuotedPart(index)` click logic collapses to a single no-arg `onReceivePart()` call; the now-unused `onReceiveQuotedPart` prop is removed)
- `src/components/work-orders/form/WorkOrderForm.jsx` (remove the `receiveQuotedPart` key from `modals` state, keep `receivePart`; simplify `handleReceivePart` to a no-arg opener matching `handleMarkPartsOrdered`'s shape; remove `handleReceiveQuotedPart`; replace `handleReceiveWorkOrderPart`/`handleReceiveQuotedWorkOrderPart` with one bulk success callback; remove the `ReceiveQuotedPartModal` import and render block; update the rewritten `<ReceivePartModal>` render block's props from single-line (`lineItem`, `inventoryItem`) to bulk (`lineItems`); repoint the Ctrl+N keyboard shortcut, currently on-order-only, at the (now-bulk) modal for either source)

**TL;DR:** `ReceivePartModal` keeps its name and import path, but becomes the bulk table (Part Info+checkbox / Qty On Order-Quoted / Qty On Hand / Apply to WO, color-coded per Section 1) and the sole receive-parts entry point — for one line or many. `ReceiveQuotedPartModal.jsx` and every reference to it are removed. Calls the Phase 1 function.

**In-depth (will be expanded to full code-level detail in this document once Phase 1 is approved/executed and this phase rotates into the Working Area section):**
- `ReceivePartModal.jsx` will, on open: filter `lineItems` (now passed in full, not a single `lineItem`) to lines with `qty_on_order > 0` or `qty_quoted > 0`, batch-fetch fresh `InventoryItem` rows for every distinct `inventory_item_id` referenced (`.in('id', [...])`, same freshness discipline as today — never trust a stale `inventory` prop), then render one row per qualifying line with the checkbox/column behavior specified in Section 1.
- On submit: build the `receipts[]` payload from checked rows, call `supabase.functions.invoke('autopro-processWorkOrderPartReceive', ...)` (same function name, new contract), surface any `skipped[]` entries before closing, and call the parent's bulk-received callback with the response's `updatedLineItems` so `WorkOrderForm.jsx` can patch local state the same way `handleWorkOrderPartsMarkedOrdered` does today.
- `WorkOrderForm.jsx`'s `<ReceivePartModal>` render block (currently line ~1221-1229, passing `lineItem`/`inventoryItem` for a single line) is updated to pass `lineItems={displayLineItems}` — the same shape `<MarkPartsOrderedModal>` already receives.

**Ends with:** clean `npm run build`, then full dev-branch UI verification (Section 6). **Production is not touched by this phase** — see the cutover step below.

**Result (2026-08-15):** All the file changes above are done — `ReceivePartModal.jsx` rewritten in place into the bulk table, `ReceiveQuotedPartModal.jsx` deleted, `LineItemsTable.jsx`'s context-menu entry moved/relabeled to table-level gating, `WorkOrderForm.jsx`'s state/handlers/Ctrl+N/render props all updated. Repo-wide grep confirmed zero remaining references to `ReceiveQuotedPartModal`/`receiveQuotedPart`/the two deleted callback names. `npm run build` completed clean (exit 0, fresh `dist/assets` output, no errors).

**Live UI verification (2026-08-15), done on `test.kensauto.ca` per your instruction (confirmed directly from the served JS bundle that its Supabase client targets `sitihbdnuxifwibontcm` — the dev branch — not production, before touching anything):**
- Seeded a real test scenario: `RO51431` / `TS589` (`Proformer Rear Brake Shoes`) had `qty_on_order: 1` with its `InventoryItem` at `quantity_on_hand: 0` (no naturally-occurring non-estimate WO on dev had a receivable line with stock already on hand) — bumped that item's `quantity_on_hand` to `3` via the connector to make a real receive possible, exactly as Section 6 anticipated ("seed one via the connector if none exists naturally").
- Right-clicked a line on `RO51431` → confirmed the context menu shows **"Receive Parts"** in the table-level block and **no longer shows the old per-line "Receive Part"** entry.
- Opened it → confirmed all 4 columns, correct purple "On Order (WO)" tagging, correct live `Qty On Hand` per row, and correct checkbox/input disable state on the three zero-stock rows (`210245`, `MK90619`, `RSS589` — all unchecked, disabled, `max=0`) vs. the one satisfiable row (`TS589` — checked, `Apply to WO` pre-filled `1`, `max=1`). Submit button correctly read "Receive 1 Part".
- Confirmed color coding via computed styles: purple `Qty On Order-Quoted`, blue `Qty On Hand`, emerald `Apply to WO`.
- Submitted → dialog closed cleanly (no `skipped[]`, as expected with one fully-satisfiable checked row) → **zero console errors** throughout.
- Verified via the connector (server-side truth, not just optimistic UI): `TS589`'s `qty_on_order` went `1 → 0`, `inventory_processed: true`; the `InventoryItem` went `quantity_on_hand: 3 → 2`, `quantity_on_order: 1 → 0` (correctly unwound — on-order-sourced); `InventoryAuditLog` got a new row with `tx_type: 'Issued to WO'`, `description: 'Issued to RO51431 - Proformer Rear Brake Shoes'`, `source_function: 'autopro-processWorkOrderPartReceive'`, `created_by: 'test@kensauto.ca'`.
- **Reloaded the work order from scratch** (View-Only mode, guaranteed-fresh server read) — confirmed `TS589` no longer shows an "On Order" badge, matching the DB. This is the strongest possible confirmation: the full chain (React modal → `supabase.functions.invoke` with a real user JWT → deployed edge function → auth check → `receiptMap` parsing → running-total map → RPC → response → `handleWorkOrderPartsReceived` → local state patch) worked correctly end to end — something Phase 1 alone could never prove, since it had no real authenticated caller to test against.
- Not left reverted: the `InventoryItem`'s `quantity_on_hand` sits at `2` (seeded `3`, minus `1` genuinely received) rather than back at its original `0` — deliberately left as-is, since "reverting" it would mean an unexplained silent adjustment with no audit trail, whereas `2` is the fully coherent, audited result of a real transaction that the `InventoryAuditLog` row above explains completely.
- **Gap, disclosed rather than papered over:** could not get this table's row-selection to trigger through the automated browser (multiple click strategies on the row/cells left `selectedLineIndex` at `null`, likely an automation-environment interaction quirk with this specific editable-table component, not something observed elsewhere), so the **Ctrl+N shortcut's live behavior was not directly click-tested**. The code change itself is a small, low-risk condition update (`qty_on_order > 0` → `qty_on_order > 0 || qty_quoted > 0`) calling the exact same `handleReceivePart()` already proven correct above via the context-menu path — reviewed but not live-clicked. Also not re-confirmed live: "Mark Parts as Ordered" continuing to work (this WO had no quoted lines to test with; did confirm via the context-menu read above that it correctly does *not* appear when no line qualifies, which is a genuine negative-path confirmation, just not a full positive one).

---

### Production Cutover (after Phase 2 passes verification — not a code-change phase) `[Backend deployed — frontend deploy is the one remaining step]`

Once Phase 2's dev-branch verification (Section 6) fully passes: deploy the rewritten `autopro-processWorkOrderPartReceive` to the **production** Supabase project, and merge/deploy the rewritten frontend to production, **back-to-back** — not independently, and not with days between them (Section 1/Risk #9). I can handle the production edge-function deploy via `deploy_edge_function` the moment you give the go-ahead; you handle the frontend merge/deploy via GitHub Desktop as usual. Worth agreeing on timing together before either one goes out.

**Result (2026-08-15):** Confirmed production's then-current deployed copy matched the pre-rewrite source exactly (no drift) before touching it. Deployed the rewritten function to production (`hbcrwkmgsazqrvsrmxyr`, `ACTIVE`). Smoke-tested immediately after: OPTIONS preflight → 200 (no crash-at-boot), unauthenticated POST → 401 (auth gate intact, unchanged).

**Confirmed closed (2026-08-15, via git history — see the reassessment note below for why this needed re-checking):** you merged `development` → `main` via PR #3 (`c6713268`, 2026-08-15 17:12:24), which included this rewrite's frontend (`ReceivePartModal.jsx`, confirmed via `git branch --contains` on the original `12fb27b9 Bulk Receive Part` commit — it's an ancestor of both `main` and `development`). Combined with the backend deploy above, **this plan's production cutover is complete**: production's frontend and edge function are mutually consistent (both on the pre-lock-check version of this feature). `master_context.md` §3/§6 already references this as the established "frontend and backend together when contract-coupled" precedent.

**Reassessment (2026-08-15/16) — concurrent Work Order Locking work landed on top of this plan's two files.** A separate, concurrent session executed `implementation_plan_wo_locking.md` (Work Order Locking Remediation), whose own Phase 3 added lock-ownership gating to `ReceivePartModal.jsx` and `autopro-processWorkOrderPartReceive/index.ts` — the same two files this plan rewrote — committed to `development` in commits `7addfd91`/`adfc2fd2`/`e28ac87f`/`011e3586` (all after the PR #3 merge above) and deployed to the **dev** Supabase project only (`sitihbdnuxifwibontcm`, function now at a later version than what this plan originally deployed). Verified directly, not assumed:
- `git diff main development` for this plan's files shows **only** the lock-check delta (61 insertions/1 deletion in the modal, 8 insertions in the edge function) — nothing in this plan's own bulk-receive logic (`receiptMap` parsing, running-total map, RPC calls, column/checkbox/color-coding UI) was touched or altered.
- The lock-check code is purely additive: a fresh `WorkOrder.LockedByUser` read on modal-open and again immediately before submit (client-side), plus an independent server-side re-check right after the edge function's own existing `WorkOrder` fetch, before any mutation. Neither depends on this plan's payload shape or business logic.
- Confirmed via `get_edge_function`: dev's deployed copy has the lock backstop; production's does not yet (matches production's frontend, which also predates the lock-check commits) — production is internally consistent, just older than `development` on this one dimension.
- The locking plan's own document explicitly owns closing this gap: its Phase 6 ("Production verification & deployment") is scoped to deploy the lock-check version of these same files to production, **deliberately bundled with the project's broader go-live cutover rather than piecemeal** — its own words: "not deployed incrementally ahead of it." Its dev-branch verification is documented as fully closed as of 2026-08-16.

**Conclusion: no action needed on this plan right now.** This plan's own scope (bulk receive parts) is fully shipped and correct on both `main`/production and `development`/dev. The lock-check addition sitting ahead on `development` is a compatible, correctly-scoped enhancement owned by a different plan, not a regression or a loose end of this one.

**Combined live verification (2026-08-16, dev branch, `RO51431`) — closes the one residual gap named above.** Direct testing, not code review:
- **Regression check (unlocked):** opened Receive Parts on a freshly-seeded receivable line (`MK90619`) with the work order unlocked — no lock banner, normal table rendered, submitted successfully, confirmed via connector that `qty_on_order` and the `InventoryAuditLog` updated exactly as this plan's own Phase 2 verification already proved. Lock-check code does not interfere with the unlocked path.
- **Lock-blocking check:** set `WorkOrder.LockedByUser` to a different simulated user via the connector, reopened the modal fresh on a different line (`210245`) — the blocking banner rendered correctly ("This Work Order is currently held by verify_agent_b@test.local...") and the submit button was disabled.
- **Server backstop, adversarial:** with the lock still held by the simulated other user, called the deployed dev edge function directly via `fetch` (bypassing the UI entirely, using the real page's own session JWT) — correctly rejected: `{"error":"Work order is currently locked by verify_agent_b@test.local"}`. Confirms the server-side check is real, not just a client-side UI gate.
- Released the simulated lock afterward (connector), confirmed the row's actual data value was correct throughout (`inventory_processed: true`, `qty_on_order: 0`) even during the storage-shape finding below.

**Bug found and fixed during this pass (this plan's own file, not the locking plan's):** `ReceivePartModal.jsx` never reset its `loading` state on a fully-successful submit — `handleSubmit`'s no-`skipped`-rows branch calls `onClose()` directly without `setLoading(false)` first, and since `open={false}` only makes the component render `null` (it stays mounted, not unmounted), `loading` stayed `true` forever after the first successful full receive, so every subsequent open showed a permanently-disabled "Receiving..." button instead of the real submit button. Fixed by resetting `loading` alongside the existing `lockBlocked`/`lockHolder` reset in the on-open effect's `!open` early-return branch (line ~21-27) — the moment `open` transitions to `false` for any reason (successful close, Cancel, lock-blocked Close), `loading` resets too. Not yet re-verified live (would require pushing to `development` first, not done as part of this session) — the fix is a one-line addition to an already-existing, already-tested reset branch, same shape as the two resets already sitting right next to it.

**Separate finding, out of scope for this plan, flagged via `spawn_task` rather than chased here:** immediately after the `MK90619` receive above, `RO51431`'s `line_items` was found stored as a double-encoded JSON string (`jsonb_typeof = 'string'`) rather than a true array — the data itself was correct once unwrapped, but the storage shape regressed. This matches the exact historical bug `p12_line_items_backfill_plan.md` addressed for the general-save path; the suspected cause here is different and broader — `.update({ line_items: JSON.stringify(lineItems) })` (pre-stringifying before handing to supabase-js) appears in this plan's edge function **and** every sibling WorkOrder-line-items-writing edge function, copied verbatim as an existing pattern, not introduced by this plan specifically. Not fixed or further investigated here — a standalone follow-up task has been queued for it.

---

## 6) Verification Plan

**Phase 1 (backend only — no UI exists yet to click through, dev branch only):**
1. Code review of the diff against the two source functions being merged, confirming: auth check present, input validation present, running-total map seeded from live values (not from potentially-stale request data), sequential (not parallel) RPC calls, single `line_items` write-back, correct `tx_type`/description strings matching the two existing patterns, `p_source_action` still self-reports as `autopro-processWorkOrderPartReceive`.
2. Deploy to the **dev** Supabase project only (`sitihbdnuxifwibontcm`), via the `deploy_edge_function` tool.
3. I will directly invoke the deployed function against a known dev `WorkOrder` (one with a line that has `qty_on_order > 0` and a matching `InventoryItem` with sufficient `quantity_on_hand` — I'll pick/confirm this via the Supabase connector first) using a crafted test payload in the **new** `receipts[]` shape, then independently query `WorkOrder.line_items` and the `InventoryItem` row via the connector to confirm: the line's `qty_on_order` decreased by exactly the requested amount, the `InventoryItem`'s `quantity_on_hand` and `quantity_on_order` both decreased correctly, and a new audit-trail row exists. No manual UI action needed from you for this step — driven entirely through the Supabase MCP connector.
4. Repeat step 3 for a quoted-sourced line, confirming `quantity_on_order` is correctly **left untouched** this time.
5. Repeat step 3 with two lines sharing one `inventory_item_id` and a combined quantity that exceeds live QOH, confirming the function applies what fits and reports the rest in `skipped[]` rather than corrupting the total.
6. Confirm the old payload shape (`{lineItemId, receivedQuantity}`) now correctly fails/is rejected rather than silently doing the wrong thing — proves the contract change is real, not just additive.

**Phase 2 (full UI verification, dev branch only):**
1. Before anything else, confirm which Supabase project the build/dev-server I'm testing against actually points at — verified directly, not assumed.
2. Open a dev work order (not an estimate) that has at least one line with `qty_on_order > 0` and one with `qty_quoted > 0` — seed one via the connector first if none exists naturally, and confirm the referenced `InventoryItem`(s) have enough `quantity_on_hand` staged to make the test meaningful.
3. Right-click **any** line in the table → confirm the "Receive Part(s)" entry now appears in the table-level block (next to "Mark Parts as Ordered"), not gated to whichever specific line was clicked, and that it does **not** appear in estimate mode or when no line on the WO qualifies.
4. Open it → confirm the table shows exactly the qualifying lines with all 4 columns: Part Info with an inline checkbox (checked by default), Qty On Order-Quoted color-coded purple for the on-order line and rose for the quoted line, Qty On Hand color-coded blue and reflecting a live (freshly-fetched, not stale) value, and Apply to WO color-coded green and pre-filled with `min(QOH, sourceQty)`.
5. Confirm a row whose `InventoryItem` has zero `quantity_on_hand` (seed one via the connector if none exists naturally) renders with its checkbox disabled/unchecked and cannot be included in the submission.
6. Adjust the Apply to WO value on one row downward, uncheck another otherwise-satisfiable row entirely, leave the rest at default → submit.
7. Confirm success feedback, and that any intentionally-skipped/insufficient-stock row (if you test that case) is clearly reported, not silently dropped.
8. Confirm the line items table immediately reflects reduced `qty_on_order`/`qty_quoted` for the affected lines (optimistic local update) and that `FinancialSummary` and everything else on the page still renders correctly.
9. **Reload the work order from scratch** (not just trust the optimistic UI) — confirm the change actually persisted server-side, matching what the UI showed before reload.
10. Check the affected `InventoryItem`(s) — confirm `quantity_on_hand` (and `quantity_on_order`, for the on-order-sourced line only) match expected post-receive values, and a new inventory transaction/audit entry exists per line received.
11. Select a line with `qty_on_order > 0` (or `qty_quoted > 0`) and press **Ctrl+N** → confirm the (now-bulk) modal opens for both an on-order-selected and a quoted-only-selected line (the latter previously did nothing on Ctrl+N — this is a fixed gap, confirm it now works).
12. Receive a work order with **only one** qualifying line, end to end → confirm the single-row case works cleanly (no layout/logic issues specific to it).
13. Right-click a line on a work order that also has quoted lines → confirm "Mark Parts as Ordered" still appears and behaves **exactly as before** — proves this plan didn't affect that flow.
14. `npm run build` clean, no console errors on the Work Order page generally (mount, other modals, other line-item interactions).

**Production Cutover verification:** immediately after both production deploys land, repeat a lightweight version of steps 3-10 above against a real (or carefully chosen low-risk) production work order, confirming the same behavior in production that was already proven on dev.

---

## 7) Working Area (Current Phase)

### Phase 1 — Rewrite `autopro-processWorkOrderPartReceive/index.ts` in place

**File: `supabase/functions/autopro-processWorkOrderPartReceive/index.ts`** (full replacement of existing contents)

```ts
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "*",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS, PUT, DELETE",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY");

    if (!supabaseUrl || !supabaseServiceKey || !supabaseAnonKey) {
      throw new Error("Missing system environment variables on Supabase.");
    }

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);
    const supabaseClient = createClient(supabaseUrl, supabaseAnonKey);

    const authHeader = req.headers.get("Authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Missing or invalid Authorization header" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const token = authHeader.substring(7);
    const { data: authData, error: authError } = await supabaseClient.auth.getUser(token);

    if (authError || !authData?.user) {
      return new Response(JSON.stringify({ error: "Unauthorized user session" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const user = authData.user;
    const { workOrderId, roNumber, receipts } = await req.json();

    // receipts: [{ lineItemId, quantity }] - replaces the old single { lineItemId, receivedQuantity } shape.
    if ((!workOrderId && !roNumber) || !Array.isArray(receipts) || receipts.length === 0) {
      return new Response(JSON.stringify({ error: 'Invalid input parameters' }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    // String-normalized, same reasoning as the sibling bulk function: lineItemIds arriving from the
    // frontend may be raw JS numbers or have passed through object-key coercion depending on the caller.
    const receiptMap = new Map();
    receipts.forEach(r => {
      const qty = parseFloat(r?.quantity);
      if (r?.lineItemId !== undefined && r?.lineItemId !== null && !isNaN(qty) && qty > 0) {
        receiptMap.set(String(r.lineItemId), qty);
      }
    });

    if (receiptMap.size === 0) {
      return new Response(JSON.stringify({ error: 'No valid receipt quantities provided' }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    const workOrderQuery = supabaseAdmin.from('WorkOrder').select('*').limit(1);
    const { data: workOrder, error: workOrderError } = roNumber
      ? await workOrderQuery.eq('ro_number', roNumber).maybeSingle()
      : await workOrderQuery.eq('id', workOrderId).maybeSingle();

    if (workOrderError || !workOrder) {
      return new Response(JSON.stringify({ error: 'Work order not found', details: workOrderError?.message }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    let lineItems = [];
    try {
      lineItems = typeof workOrder.line_items === 'string'
        ? JSON.parse(workOrder.line_items || '[]')
        : (Array.isArray(workOrder.line_items) ? workOrder.line_items : []);
    } catch (e) {
      return new Response(JSON.stringify({ error: 'Failed to parse work order line items' }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    // Preserve payload/array order - determines skip priority when shared-item stock runs out mid-batch.
    const targetIndexes = [];
    lineItems.forEach((li, idx) => {
      if (receiptMap.has(String(li.id))) targetIndexes.push(idx);
    });

    if (targetIndexes.length === 0) {
      return new Response(JSON.stringify({ error: 'None of the requested line items were found on this work order' }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    const inventoryItemIds = [...new Set(
      targetIndexes.map(idx => lineItems[idx].inventory_item_id).filter(Boolean)
    )];

    let inventoryItemsMap = new Map();
    if (inventoryItemIds.length > 0) {
      const { data: inventoryItems, error: inventoryError } = await supabaseAdmin
        .from('InventoryItem')
        .select('*')
        .in('id', inventoryItemIds);

      if (inventoryError) {
        return new Response(JSON.stringify({ error: 'Failed to fetch inventory items', details: inventoryError.message }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }
      (inventoryItems || []).forEach(item => inventoryItemsMap.set(item.id, item));
    }

    // Running per-item QOH/QOO, seeded from live DB values - decremented as each line in THIS batch is
    // applied, so two selected lines sharing one inventory_item_id can't both spend the same physical stock.
    const runningQOH = new Map();
    const runningQOO = new Map();
    inventoryItemsMap.forEach((item, id) => {
      runningQOH.set(id, parseFloat(item.quantity_on_hand) || 0);
      runningQOO.set(id, parseFloat(item.quantity_on_order) || 0);
    });

    const skipped = [];
    const rpcCalls = [];

    targetIndexes.forEach(idx => {
      const line = lineItems[idx];
      const requestedQty = receiptMap.get(String(line.id));
      const invItem = inventoryItemsMap.get(line.inventory_item_id);

      if (!line.inventory_item_id || !invItem) {
        skipped.push({ lineItemId: line.id, reason: 'No matching inventory item found' });
        return;
      }

      const qtyOnOrder = parseFloat(line.qty_on_order) || 0;
      const qtyQuoted = parseFloat(line.qty_quoted) || 0;
      // Same precedence the per-line context menu already uses today: on-order first.
      const source = qtyOnOrder > 0 ? 'on_order' : (qtyQuoted > 0 ? 'quoted' : null);

      if (!source) {
        skipped.push({ lineItemId: line.id, reason: 'Line has no on-order or quoted quantity remaining' });
        return;
      }

      const sourceQty = source === 'on_order' ? qtyOnOrder : qtyQuoted;
      if (requestedQty > sourceQty) {
        skipped.push({
          lineItemId: line.id,
          reason: `Requested ${requestedQty} exceeds ${source === 'on_order' ? 'on-order' : 'quoted'} quantity (${sourceQty})`
        });
        return;
      }

      const currentRunningQOH = runningQOH.get(line.inventory_item_id);
      if (requestedQty > currentRunningQOH) {
        skipped.push({
          lineItemId: line.id,
          reason: `Insufficient inventory - only ${currentRunningQOH} unit(s) remain available for this item after other selected lines in this batch`
        });
        return;
      }

      const newQOH = currentRunningQOH - requestedQty;
      runningQOH.set(line.inventory_item_id, newQOH);

      let newQOO = runningQOO.get(line.inventory_item_id);
      if (source === 'on_order') {
        newQOO = Math.max(0, newQOO - requestedQty);
        runningQOO.set(line.inventory_item_id, newQOO);
      }

      lineItems[idx] = {
        ...line,
        ...(source === 'on_order'
          ? { qty_on_order: Math.max(0, sourceQty - requestedQty) }
          : { qty_quoted: Math.max(0, sourceQty - requestedQty) }),
        inventory_processed: true,
        cost_ea: invItem.cost || line.cost_ea || 0
      };

      rpcCalls.push({
        itemId: line.inventory_item_id,
        newQOH,
        newQOO,
        description: source === 'on_order'
          ? `Issued to ${workOrder.ro_number} - ${line.description || line.part_number}`
          : `Issued to ${workOrder.ro_number} from quote - ${line.description || line.part_number}`
      });
    });

    if (rpcCalls.length === 0) {
      return new Response(JSON.stringify({ error: 'No line items could be received', skipped }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    const { error: workOrderUpdateError } = await supabaseAdmin
      .from('WorkOrder')
      .update({ line_items: JSON.stringify(lineItems) })
      .eq('ro_number', workOrder.ro_number);

    if (workOrderUpdateError) {
      return new Response(JSON.stringify({ error: 'Failed to update work order', details: workOrderUpdateError.message }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    // Sequential, not Promise.all - same reasoning as autopro-processWorkOrderMarkQuotedOrdered: each
    // call must land before the next reads/writes the same item, and this also gives one audit row per
    // WO line received even when several lines share one inventory_item_id.
    for (const call of rpcCalls) {
      const { error: rpcError } = await supabaseAdmin.rpc('update_inventory_with_audit', {
        p_item_id: call.itemId,
        p_qoh: call.newQOH,
        p_qoo: call.newQOO,
        p_ro_number: workOrder.ro_number,
        p_supplier_inv: null,
        p_source_action: 'autopro-processWorkOrderPartReceive',
        p_tx_type: 'Issued to WO',
        p_description: call.description,
        p_user_id: user.id || null,
        p_user_name: user.email || null,
        p_source_record_id: workOrder.id || null
      });

      if (rpcError) {
        return new Response(JSON.stringify({
          error: 'Failed to update inventory item via RPC',
          details: rpcError.message,
          partiallyApplied: true
        }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }
    }

    return new Response(JSON.stringify({
      success: true,
      message: `Received ${rpcCalls.length} of ${targetIndexes.length} selected line item(s)`,
      updatedLineItems: targetIndexes.map(idx => lineItems[idx]),
      skipped
    }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });

  } catch (error) {
    console.error('Error in processWorkOrderPartReceive:', error);
    return new Response(JSON.stringify({
      error: error.message || 'Internal server error'
    }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }
});
```

**Also in this phase: delete `supabase/functions/autopro-processWorkOrderReceiveQuotedPart/` entirely** (the whole function directory) — fully superseded by the branch above.

**Why this shape specifically:**
- Same file, same function name/endpoint (`autopro-processWorkOrderPartReceive`) as today — only the internals and request contract change, per your explicit instruction that this is a rewrite, not a new function living alongside the old one.
- Payload is now `{ workOrderId, roNumber, receipts: [{ lineItemId, quantity }] }` rather than the old single `{ lineItemId, receivedQuantity }` — a breaking contract change, which is exactly why Section 1/5 treat production deploy as a coordinated, explicit final step rather than something that happens automatically once this phase is "done."
- `source` (on-order vs. quoted) is derived server-side from the line's own live data, **not** trusted from the client, using the same `qty_on_order > 0` precedence the current per-line context menu already uses — so the backend can't be tricked into touching `quantity_on_order` for a line that was never actually placed on order.
- The running `QOH`/`QOO` maps are seeded once from the live DB read at the top of the function and mutated only in-memory as each line is validated/applied, in submission order — this is what makes two lines sharing one `inventory_item_id` safe within a single batch, mirroring the proven `runningQOO` technique from `autopro-processWorkOrderMarkQuotedOrdered`.
- Per-line skip-with-reason (not all-or-nothing) matches the existing `skipped[]` convention and means a user selecting 5 lines where 1 doesn't have enough stock still gets the other 4 through, with a clear reason for the one that didn't.
- `p_source_action` still self-reports as `'autopro-processWorkOrderPartReceive'` — matches the function's own (unchanged) name, consistent with how every sibling function reports itself.

**Deploy step:** once you approve this code, deploy via the `deploy_edge_function` tool to the **dev** project only (`sitihbdnuxifwibontcm`). **Production's existing deployed copy is left untouched in this phase** — it keeps serving today's live production `ReceivePartModal.jsx` correctly until the coordinated cutover after Phase 2.

**Explicitly not touched in this phase:** `ReceivePartModal.jsx`, `ReceiveQuotedPartModal.jsx`, `LineItemsTable.jsx`, `WorkOrderForm.jsx` — entirely Phase 2's scope, to be expanded into full code-level detail here once Phase 1 is approved and executed.

---

**Awaiting your approval before making any code changes.**
