# Implementation Plan: Bulk "Receive Parts" Modal for Work Order Line Items

**Status:** Pending your approval — no code changes made yet.
**Parent:** None (standalone feature request, not a `Pre_go-live_plan.md` item).

---

## 1) Context & Lessons Learned

**Core goal.** Today, receiving a part onto a work order is a one-line-at-a-time action: right-click a line item → "Receive Part" → a modal opens for *that single line* (`ReceivePartModal.jsx` if it's on-order, `ReceiveQuotedPartModal.jsx` if it's still just quoted) → confirm a quantity → submit. If a WO has 6 parts on order, that's 6 separate modal round-trips. You want a **bulk** version — one modal that lists every receivable line on the work order at once, so you can receive several parts in a single action — explicitly modeled on the bulk **"Mark Parts as Ordered"** flow that already exists for the analogous bulk problem on the quoting side.

**Existing pattern being copied (verified by reading the actual source, not assumed):**
- **Bulk template (UI):** [`MarkPartsOrderedModal.jsx`](../src/components/work-orders/MarkPartsOrderedModal.jsx) — opened from a context-menu item in [`LineItemsTable.jsx`](../src/components/work-orders/form/LineItemsTable.jsx) (line ~391-398, only rendered when `mode !== 'estimate'` and at least one line has `qty_quoted > 0`), which calls a plain no-arg handler (`onMarkPartsOrdered`) wired in [`WorkOrderForm.jsx`](../src/components/work-orders/form/WorkOrderForm.jsx) (`handleMarkPartsOrdered` → `openModal('markOrdered')`, line ~413-416). The modal itself is a **checkbox list** (no quantity input — marking-ordered always moves the *entire* quoted quantity, never partial).
- **Bulk template (backend):** [`autopro-processWorkOrderMarkQuotedOrdered/index.ts`](../supabase/functions/autopro-processWorkOrderMarkQuotedOrdered/index.ts) — takes `{ workOrderId, roNumber, lineItemIds[] }`, batch-fetches every distinct `InventoryItem` touched, keeps a **running per-item quantity_on_order total** (`runningQOO` map) so two selected lines sharing one `inventory_item_id` don't race each other's math, writes the whole `WorkOrder.line_items` array back in one `UPDATE`, then calls the `update_inventory_with_audit` RPC **sequentially, once per line** (not `Promise.all` — each call must see the previous call's write for the running total to hold), producing one audit-trail row per line even when several lines share one inventory item. Returns `{ success, message, updatedLineItems, skipped[] }`.
- **Single-line receive logic being generalized into bulk:**
  - [`ReceivePartModal.jsx`](../src/components/work-orders/ReceivePartModal.jsx) + [`autopro-processWorkOrderPartReceive/index.ts`](../supabase/functions/autopro-processWorkOrderPartReceive/index.ts) — receives against `qty_on_order`. Decrements the WO line's `qty_on_order`, and the `InventoryItem`'s `quantity_on_hand` **and** `quantity_on_order`. Audit `tx_type: 'Issued to WO'`, description `Issued to ${ro} - ${desc}`.
  - [`ReceiveQuotedPartModal.jsx`](../src/components/work-orders/ReceiveQuotedPartModal.jsx) + [`autopro-processWorkOrderReceiveQuotedPart/index.ts`](../supabase/functions/autopro-processWorkOrderReceiveQuotedPart/index.ts) — receives against `qty_quoted`. Decrements the WO line's `qty_quoted` and `quantity_on_hand` only — `quantity_on_order` is **untouched**, because a quoted line was never counted as on-order in the first place.
  - Both single-line modals re-fetch the `InventoryItem` fresh from Supabase the moment they open (never trust a stale prop), default the quantity input to `min(currentQOH, sourceQty)`, and hard-cap the input at that same max — client-side convenience only, the edge function re-validates independently against live DB values regardless of what the client sends.
- **Trigger/wiring plumbing (exact shape to replicate):** `WorkOrderForm.jsx` keeps one `modals` state object (`useState({ getPart: false, otherCharge: false, addPart: false, returnPart: false, receivePart: false, receiveQuotedPart: false, cores: false, markOrdered: false })`, line ~100-109) plus generic `openModal(name, lineIndex)` / `closeModal(name)` callbacks (line ~340-361). Each modal gets its own `handleX` opener callback and its own `handleXWorkOrderPart` success callback that **optimistically patches local `displayLineItems` state** via `tracedSetLineItems` (see `handleWorkOrderPartsMarkedOrdered`, line ~849-865) rather than re-fetching the whole work order — the modal's own edge-function call already persisted the change server-side.
- **Deploy convention confirmed:** none of the three sibling functions above (`...MarkQuotedOrdered`, `...PartReceive`, `...ReceiveQuotedPart`) have an entry in `supabase/config.toml` — they run on default settings. The new bulk-receive function should follow the same "no config.toml entry" pattern rather than adding one.
- **Per your standing instruction:** the new edge function is named `autopro-processWorkOrderBulkReceiveParts` (the `autopro-` prefix convention for shared-project organization).

**Design decisions, confirmed.** Final column set: **Part Info** (with a checkbox at the left of each row — not a separate checkbox column) / **Qty On Order-Quoted** / **Qty On Hand** / **Apply to WO**, with the last three color-coded. The checkbox defaults to **checked for every row the batch can actually satisfy** (`min(QOH, sourceQty) > 0`) and is disabled/unchecked for any row that can't be satisfied at all (zero QOH) — the same "receivable > 0" gate the single-line modals already use to disable their own submit button, just applied per-row instead of to the whole modal. "Apply to WO" is the editable quantity field (this plan's earlier draft called it "Qty to Receive" — renamed per your wording), defaulting to `min(QOH, sourceQty)` and capped at that same max, identical default/cap logic to the two single-line modals.

**Color coding (last three columns), reusing the palette the two single-line modals already established, plus one new addition:**
- **Qty On Order-Quoted:** purple for on-order-sourced rows (matches `ReceivePartModal.jsx`'s "On Order (WO)" box), rose for quoted-sourced rows (matches `ReceiveQuotedPartModal.jsx`'s "Quoted (WO)" box) — the color itself communicates which source a row draws from, no need to re-read text.
- **Qty On Hand:** blue, matching both single-line modals' existing "Available in Inventory" box.
- **Apply to WO:** green — new to this modal (the single-line modals never needed it, since they only ever show one row) — visually marks it as the actual commit/action value, distinct from the two purely-informational columns beside it.

**Forward-looking note, explicitly not in scope for this plan:** you've said the intent is for this bulk modal to **eventually replace the single-line `ReceivePartModal.jsx`/`ReceiveQuotedPartModal.jsx` flow entirely** — bulk becomes the only receive path, including for a single part. This plan does not build that replacement now: Phase 2 only adds the new bulk modal alongside the existing single-line ones, and the per-line "Receive Part" context-menu item keeps opening the old single-line modals unchanged for now. Nothing in this design should block that future switch-over, though — a one-row batch is just a table with one row, so no rework should be needed later purely to support it. The actual retirement of the two single-line modals (and repointing the per-line "Receive Part" entry at this modal, filtered to one line) is a **separate future plan**, once this bulk flow has been in use long enough to trust as the sole path.

**Remaining design point (already recommended, unchanged by this feedback):** when several selected lines share one `inventory_item_id` and their combined requested quantity exceeds that item's live `quantity_on_hand`, the backend **skips whichever line(s) run out of stock (processed in the order submitted) and still applies everything that fits**, reporting skipped lines back in a `skipped[]` array — rather than rejecting the entire batch. This matches the bulk mark-ordered function's existing `skipped[]` convention. **Improvement over the copied pattern:** `MarkPartsOrderedModal.jsx` today never actually surfaces `skipped` in its UI even though the backend already returns it — this plan's new modal will display any skipped lines/reasons after submit, closing that gap rather than carrying it forward silently.

**Mixed on-order + quoted lines in one screen.** A line's source is determined the same way the existing per-line context menu already decides it (`LineItemsTable.jsx` line ~369): if `qty_on_order > 0` it's on-order-sourced; otherwise if `qty_quoted > 0` it's quoted-sourced. The modal will visually distinguish the two (reusing the existing purple "On Order (WO)" / rose "Quoted (WO)" badge coloring from the two single-line modals) since they have different backend consequences (QOO touched vs. not).

---

## 2) Previously Completed

Nothing has been built for this feature yet — this is a net-new initiative with no prior phases. For historical context, the following **pre-existing, already-shipped-and-in-production** pieces are what this plan builds on top of (not part of this plan's own work, listed here only because Phase 1/2 depend on their exact behavior):

- Single-line "Receive Part" flow (on-order and quoted variants) — `ReceivePartModal.jsx` / `ReceiveQuotedPartModal.jsx` + their two edge functions.
- Bulk "Mark Parts as Ordered" flow — `MarkPartsOrderedModal.jsx` + `autopro-processWorkOrderMarkQuotedOrdered`.
- The `update_inventory_with_audit` Postgres RPC (shared by all inventory-affecting edge functions) — writes both the `InventoryItem` QOH/QOO update and its audit-trail row atomically.
- `WorkOrderForm.jsx`'s generic `modals` state / `openModal` / `closeModal` plumbing and optimistic local-state-patch pattern.

This session's research (read-only — confirmed via direct source read, not assumed): all files named in Section 1 above, plus `supabase/config.toml` (confirmed the three sibling functions have no explicit config entry) and `LineItemsTable.jsx`'s icon imports (`Package`, `Truck` already imported — no new icon dependency needed for the context-menu entry).

---

## 3) Risk Assessment

| # | Risk | Impact | Likelihood | Mitigation |
|---|---|---|---|---|
| 1 | Two selected lines in the *same* bulk request share one `inventory_item_id`, and naively processing them independently double-spends the same physical stock (e.g. QOH goes negative, or both lines "succeed" for units that don't exist) | High if it happens — bad inventory data | Low — will happen routinely (splitting one order across multiple WO lines is normal), if not explicitly handled | Backend keeps a running per-item QOH (and QOO, for on-order lines) map seeded from the live DB value, decremented as each line in the batch is processed, in submitted order — mirrors the exact technique already proven correct in `autopro-processWorkOrderMarkQuotedOrdered`'s `runningQOO` map |
| 2 | Client sends a quantity the server doesn't independently verify (stale QOH read at modal-open time, or a tampered/buggy request), causing a receive that exceeds real stock | Medium | Low | Server re-fetches live `InventoryItem` rows and re-validates every requested quantity against both the line's live `qty_on_order`/`qty_quoted` and the running QOH map before applying anything — identical "never trust the client's number" discipline already used by both single-line functions |
| 3 | Partial success (some lines received, some skipped for insufficient stock) is confusing if the UI doesn't clearly show which lines were skipped and why | Medium (silent data-looks-wrong confusion, not corruption) | Medium — `MarkPartsOrderedModal.jsx` already has this exact gap today (backend returns `skipped[]`, UI ignores it) | New modal explicitly surfaces `skipped[]` from the response after submit (see Section 1's "second design decision") |
| 4 | Mixing on-order-sourced and quoted-sourced lines in one table, each with different backend side effects (QOO touched vs. not), confuses the user about what actually happened | Low-Medium | Medium | Reuse the existing purple/rose "On Order (WO)" vs "Quoted (WO)" badge coloring already established in the two single-line modals, so the visual language is already familiar |
| 5 | Two different users (or two browser tabs) bulk-receive against the same `WorkOrder`/`InventoryItem` concurrently — a true cross-request race, not just within one batch | Low-Medium | Low | Pre-existing risk shared with every current receive/mark-ordered flow already in production (none of them use row locking) — this plan doesn't make it worse, and fixing it is out of scope here |
| 6 | Malformed quantity input (negative, non-numeric, zero, exceeding max) reaches the backend | Low | Low | Same client-side `min`/`max`/`step` input constraints as the single-line modals, plus mandatory independent server-side bounds checking (never trust client validation alone) |
| 7 | New context-menu entry / modal accidentally becomes reachable in `mode === 'estimate'` (estimates shouldn't be receiving physical inventory) | Medium (wrong-context inventory movement) | Low | Gate the new context-menu item behind the exact same `mode !== 'estimate'` condition already used for "Mark Parts as Ordered" and "Receive Part" |

---

## 4) Time Estimate

Autonomous agent work only (excludes your review/approval time between phases and your manual UI click-through):

- **Phase 1** (new edge function `autopro-processWorkOrderBulkReceiveParts`, deploy to dev, API-level smoke test via connector): ~25-30 minutes
- **Phase 2** (new `ReceivePartsModal.jsx`, context-menu wiring in `LineItemsTable.jsx`, modal-state/handler wiring in `WorkOrderForm.jsx`, dev-server visual verification via Browser tool): ~35-45 minutes

**Total: roughly 60-75 minutes of agent execution**, spread across your approval gate between phases and however long your own manual click-through verification takes.

---

## 5) Roadmap & Progress

### Phase 1 — Bulk receive edge function `[Pending]`

**Files impacted:** `supabase/functions/autopro-processWorkOrderBulkReceiveParts/index.ts` (new)

**TL;DR:** One new edge function that receives a list of `{lineItemId, quantity}` pairs, applies each against whichever of the two existing single-line behaviors fits that line (on-order vs. quoted sourced), using a running-total map to keep multiple lines sharing one `inventory_item_id` from double-spending the same stock within the batch, and returns which lines succeeded vs. were skipped and why.

**In-depth:** Structurally, this function is `autopro-processWorkOrderMarkQuotedOrdered`'s shape (auth check → load `WorkOrder` by `roNumber`/`workOrderId` → parse `line_items` → batch-fetch distinct `InventoryItem` rows → running-total map → single `line_items` write-back → sequential per-line RPC calls) with its inner per-line logic swapped for a merge of `autopro-processWorkOrderPartReceive`'s and `autopro-processWorkOrderReceiveQuotedPart`'s effects, selected per-line by source. Full code drafted in Section 7 (Working Area) below — this phase's entire scope is that one new file plus deploying it.

Explicitly **not** in this phase: no frontend changes, no context-menu entry yet. The function will exist and be independently callable/testable but unreachable from the UI until Phase 2 wires it up.

---

### Phase 2 — Bulk "Receive Parts" modal + UI wiring `[Pending]`

**Files impacted:**
- `src/components/work-orders/ReceivePartsModal.jsx` (new)
- `src/components/work-orders/form/LineItemsTable.jsx` (new context-menu item, gated like "Mark Parts as Ordered")
- `src/components/work-orders/form/WorkOrderForm.jsx` (new `modals.receiveParts` state key, `handleReceiveParts` opener, `handleWorkOrderPartsBulkReceived` optimistic-update callback, modal render block, import)

**TL;DR:** New table-based bulk modal — 4 columns: **Part Info** (checkbox inline at the left of each row) / **Qty On Order-Quoted** (purple/rose) / **Qty On Hand** (blue) / **Apply to WO** (green, editable) — triggered from a new right-click context-menu entry, calling the Phase 1 edge function and optimistically patching local line-item state on success — same plumbing shape as `MarkPartsOrderedModal.jsx`'s existing wiring.

**In-depth (will be expanded to full code-level detail in this document once Phase 1 is approved/executed and this phase rotates into the Working Area section):**
- New context-menu item in `LineItemsTable.jsx`, placed alongside the existing "Mark Parts as Ordered" block (~line 391-398), rendered when `mode !== 'estimate'` and at least one line has `(qty_on_order > 0 || qty_quoted > 0)`.
- `ReceivePartsModal.jsx` will, on open: filter `lineItems` to lines with `qty_on_order > 0` or `qty_quoted > 0`, batch-fetch fresh `InventoryItem` rows for every distinct `inventory_item_id` referenced (`.in('id', [...])`, same freshness discipline as the single-line modals — never trust a stale `inventory` prop), then render one row per qualifying line:
  - **Checkbox** (left of Part Info): checked by default when `min(QOH, sourceQty) > 0`; disabled and unchecked when that row can't be satisfied at all (zero QOH) — mirrors the single-line modals' existing "disable submit when `maxReceivable <= 0`" gate, just per-row.
  - **Part Info:** part number + description, same layout as `MarkPartsOrderedModal.jsx`'s row.
  - **Qty On Order-Quoted:** the sourced quantity (`qty_on_order` or `qty_quoted`, whichever is the row's source), purple background/text for on-order rows, rose for quoted rows.
  - **Qty On Hand:** the freshly-fetched live `quantity_on_hand`, blue background/text.
  - **Apply to WO:** editable number input, default `min(QOH, sourceQty)`, `min=0`/`max=min(QOH, sourceQty)`/`step=0.01` same as the single-line modals' input, green background/text, disabled when the row's checkbox is unchecked.
- On submit: build the `receipts[]` payload (`{ lineItemId, quantity }` per checked row, using each row's current "Apply to WO" value) from checked rows only, call `supabase.functions.invoke('autopro-processWorkOrderBulkReceiveParts', ...)`, surface any `skipped[]` entries in the modal before closing (closing the gap noted in Section 1/3), and call the parent `onReceived` callback with the response's `updatedLineItems` so `WorkOrderForm.jsx` can patch local state the same way `handleWorkOrderPartsMarkedOrdered` does today.

---

## 6) Verification Plan

**Phase 1 (backend only — no UI exists yet to click through):**
1. Code review of the diff against the two source functions it merges, confirming: auth check present, input validation present, running-total map seeded from live values (not from potentially-stale request data), sequential (not parallel) RPC calls, single `line_items` write-back, correct `tx_type`/description strings matching the two existing patterns.
2. Deploy to the **dev** Supabase project only, via the `deploy_edge_function` tool.
3. I will directly invoke the deployed function against a known dev `WorkOrder` (one with a line that has `qty_on_order > 0` and a matching `InventoryItem` with sufficient `quantity_on_hand` — I'll pick/confirm this via the Supabase connector first) using a crafted test payload, then independently query `WorkOrder.line_items` and the `InventoryItem` row via the connector to confirm: the line's `qty_on_order` decreased by exactly the requested amount, the `InventoryItem`'s `quantity_on_hand` and `quantity_on_order` both decreased correctly, and a new audit-trail row exists for the transaction. This step needs no manual UI action from you — I can drive it entirely through the Supabase MCP connector.
4. Repeat step 3 for a quoted-sourced line, confirming `quantity_on_order` is correctly **left untouched** this time.
5. Repeat step 3 with two lines sharing one `inventory_item_id` and a combined quantity that exceeds live QOH, confirming the function applies what fits and reports the rest in `skipped[]` rather than corrupting the total.

**Phase 2 (full UI verification):**
1. Open a dev work order (not an estimate) that has at least one line with `qty_on_order > 0` and one with `qty_quoted > 0` — seed one via the connector first if none exists naturally, and confirm the referenced `InventoryItem`(s) have enough `quantity_on_hand` staged to make the test meaningful.
2. Right-click the line items table → confirm a new "Receive Parts" entry appears (and confirm it does **not** appear when the work order is in estimate mode, or when no line qualifies).
3. Open it → confirm the table shows exactly the qualifying lines with all 4 columns: Part Info with an inline checkbox (checked by default), Qty On Order-Quoted color-coded purple for the on-order line and rose for the quoted line, Qty On Hand color-coded blue and reflecting a live (freshly-fetched, not stale) value, and Apply to WO color-coded green and pre-filled with `min(QOH, sourceQty)`.
4. Confirm a row whose `InventoryItem` has zero `quantity_on_hand` (seed one via the connector if none exists naturally) renders with its checkbox disabled/unchecked and cannot be included in the submission.
5. Adjust the Apply to WO value on one row downward, uncheck another otherwise-satisfiable row entirely, leave the rest at default → submit.
6. Confirm success feedback, and that any intentionally-skipped/insufficient-stock row (if you test that case) is clearly reported, not silently dropped.
7. Confirm the line items table immediately reflects reduced `qty_on_order`/`qty_quoted` for the affected lines (optimistic local update) and that `FinancialSummary` and everything else on the page still renders correctly.
8. **Reload the work order from scratch** (not just trust the optimistic UI) — confirm the change actually persisted server-side, matching what the UI showed before reload.
9. Check the affected `InventoryItem`(s) (e.g. via `InventoryList.jsx` or the item's detail view) — confirm `quantity_on_hand` (and `quantity_on_order`, for the on-order-sourced line only) match the expected post-receive values, and that a new inventory transaction/audit entry exists per line received.

---

## 7) Working Area (Current Phase)

### Phase 1 — `autopro-processWorkOrderBulkReceiveParts`

**New file: `supabase/functions/autopro-processWorkOrderBulkReceiveParts/index.ts`**

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

    // receipts: [{ lineItemId, quantity }]
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
      // Same precedence the per-line context menu already uses (LineItemsTable.jsx): on-order first.
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
        p_source_action: 'autopro-processWorkOrderBulkReceiveParts',
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
    console.error('Error in processWorkOrderBulkReceiveParts:', error);
    return new Response(JSON.stringify({
      error: error.message || 'Internal server error'
    }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }
});
```

**Why this shape specifically:**
- Payload is `{ workOrderId, roNumber, receipts: [{ lineItemId, quantity }] }` rather than just an id list (like the mark-ordered function), because — unlike marking-ordered, which always moves the *entire* quoted amount — receiving is inherently partial-quantity, so the frontend must tell the backend how much per line.
- `source` (on-order vs. quoted) is derived server-side from the line's own live data, **not** trusted from the client, using the exact same `qty_on_order > 0` precedence the existing per-line context menu already uses — so the backend can't be tricked into touching `quantity_on_order` for a line that was never actually placed on order.
- The running `QOH`/`QOO` maps are seeded once from the live DB read at the top of the function and mutated only in-memory as each line is validated/applied, in submission order — this is what makes two lines sharing one `inventory_item_id` safe within a single batch, mirroring the proven `runningQOO` technique from `autopro-processWorkOrderMarkQuotedOrdered`.
- Per-line skip-with-reason (not all-or-nothing) matches the existing `skipped[]` convention and means a user selecting 5 lines where 1 doesn't have enough stock still gets the other 4 through, with a clear reason for the one that didn't.
- No `supabase/config.toml` entry added — matches all three sibling functions, which run on default settings.

**Deploy step:** once you approve this code, deploy via the `deploy_edge_function` tool to the **dev** project only (`sitihbdnuxifwibontcm`) for Phase 1's verification; production deploy happens later, bundled with whenever you're ready to ship Phase 2's UI (no point deploying a backend-only function to production before the UI that calls it exists).

**Explicitly not touched in this phase:** `LineItemsTable.jsx`, `WorkOrderForm.jsx`, and no new frontend file — those are entirely Phase 2's scope, to be expanded into full code-level detail here once Phase 1 is approved and executed.

---

**Awaiting your approval before making any code changes.**
