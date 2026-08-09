# Implementation Plan: WO Add-Parts OCR Import, On Order/Quoted Split, Mark Parts as Ordered

**Status:** All 4 phases executed, deployed, and **[Tested]** — user-confirmed "Test and works" after live testing on `test.kensauto.ca` (development branch), 2026-08-07. See Section 8 for post-testing follow-up work folded in during/after verification.
**Supabase project:** `hbcrwkmgsazqrvsrmxyr` (single project, no separate dev branch currently listed — confirm before any live write-testing whether a branch should be cut first, per `master_context.md` §3's "never write-test outside a verified environment" spirit).

> **LIVE DOCUMENT.** This is the single rotating plan for this feature — update it in place as each phase executes/verifies. Don't wipe prior sections; append/annotate. When a phase finishes, flip its status header and roll its `Working Area` content into `Previously Completed`, then promote the next phase into `Working Area`.

---

## 1) Context & Lessons Learned

**Core goal:** Give `WOAddInventoryModal.jsx` (the "Add Part" batch-entry modal used from a Work Order) an OCR-assisted import path — paste or upload a screenshot of an online cart/order-confirmation page, or upload a PDF — that bulk-populates the batch table, mirroring the OCR flow `InventoryAdd.jsx` already has for supplier-invoice receiving. Alongside that, split the existing single "Save Batch & Add to WO" button into two distinct commit paths (**On Order** vs **Quoted**), and add a new **Mark Parts as Ordered** action that promotes previously-quoted line items into real on-order line items later, once a quote is actually placed. This finishes a piece of forward-looking work that was explicitly flagged but deliberately deferred back in Phase 2 (`Plans and Context/Archive/phase_2_implementation_plan.md` line 17/429): the "Quoted (Not Ordered)" badge was always meant to key off a real quantity value on the line item instead of the `not_ordered` boolean it's used since — this plan is that deferred work, now with a full write-side lifecycle (create quoted → mark ordered) instead of just a read-side badge.

**Key architecture facts confirmed by reading the actual code (not assumed) before drafting this plan:**

- **`WOAddInventoryModal.jsx`'s batch flow is entirely client-side.** `handleProcessBatch` (lines 359-556) loops `batchItems` and, per item, either calls the `update_inventory_with_audit` RPC (existing part) or does a direct `InventoryItem` insert + direct `InventoryAuditLog` insert (new part), then calls `onAdd(lineItemsToAdd)` and closes. There is no dedicated edge function for this path today — it's all direct `supabase.rpc()`/`.insert()` calls from the modal. The Quoted/On Order split will follow that same shape, not introduce a new edge function for batch-add.
- **`onAdd` only updates local React state, not the database.** `WorkOrderForm.jsx`'s `handleMultiplePartsAdded` (lines 402-448), the callback wired to both `WOAddInventoryModal`'s and `GetPartModal`'s `onAdd`, calls `tracedSetLineItems` and sets `hasUnsavedChanges = true` — it does **not** write `WorkOrder.line_items` to the database. That write only happens when the operator hits the WO's own overall Save button, via `buildWorkOrderSavePayload.js`. This means the `InventoryItem`/`InventoryAuditLog` writes inside `handleProcessBatch` commit immediately on "Save Batch," but the WO's own `line_items` (carrying `qty_on_order`/`qty_quoted` for display) only persist once the WO itself is saved — this is pre-existing behavior, not something introduced by this plan, and out of scope to change.
- **`ReceivePartModal.jsx` → `autopro-processWorkOrderPartReceive` is the exact template for a WO-line-mutating edge function.** Read in full: it loads the `WorkOrder` row fresh from the DB by `ro_number`, parses `line_items`, mutates the target line, writes `line_items` back with one `.update()`, *then* calls `update_inventory_with_audit`. The frontend's `onReceive` callback (`handleReceiveWorkOrderPart`, lines 735-789) *also* independently re-derives the same local-state change and sets `hasUnsavedChanges = true` — i.e., the DB write and the local optimistic-state recompute are two separate, deliberately redundant paths that happen to agree. **Mark Parts as Ordered will follow this exact same two-track pattern** (edge function writes DB directly; a frontend callback separately re-derives local state), not deviate from it.
- **Live-confirmed `update_inventory_with_audit` RPC signature** (checked via `pg_proc`, two overloads exist): `(p_item_id text, p_qoh numeric, p_qoo numeric, p_ro_number text, p_supplier_inv text, p_source_action text, p_tx_type text, p_description text, p_user_id text, p_user_name text[, p_source_record_id text])`. Matches what every existing call site already passes — no surprises.
- **`InventoryAuditLog` schema confirmed live** — matches the direct-insert shape `WOAddInventoryModal.jsx` already uses for new-part creation (`inventory_item_id`, `part_num`, `old_quantity`/`new_quantity`, `old_quantity_on_order`/`new_quantity_on_order`, `quantity_change`/`quantity_ordered_change`, `ro_number`, `source_record_id`, `description`, `tx_type`, `source_function`, `tx_date`, `created_by`/`created_by_id`).
- **`InventoryItem.id` format is mixed live** (checked via `information_schema`): 3,920 rows at 24-char hex (legacy-migrated), 543 rows at 36-char UUID (native-created). `WOAddInventoryModal.jsx` already correctly uses `crypto.randomUUID()` unmodified for new inserts — no change needed, just confirming the existing code is already on the right convention.
- **The OCR pipeline already supports images, not just PDFs.** `autopro-processPartsInvoiceOCR/index.ts` takes a `mimeType` param and forwards it straight to Gemini's `inline_data.mime_type` — `PartsInvoiceOCRModal.jsx`'s file input already accepts `application/pdf,image/png,image/jpeg`. **No backend work is needed to support image upload** — the only genuinely new capability is a **paste** (clipboard) capture UI, which doesn't exist anywhere in this codebase yet.
- **`PartsInvoiceOCRModal.jsx` deliberately uses a raw `fetch()` with manual JWT-from-cookie extraction instead of `supabase.functions.invoke()`**, per its own comment ("to avoid potential cache/proxy issues"). The new WO parts-import modal will copy this exact call pattern rather than deviate with `.invoke()`.
- **Full context-menu inventory, gated conditions, confirmed by reading `LineItemsTable.jsx`'s `renderContextMenu` (lines 333-419) in full:**

  | Item | Shown when | Disabled when |
  |---|---|---|
  | Get Part | `!line.inventory_item_id` | — |
  | Other Charge | `!line.inventory_item_id` | — |
  | Add New Part | `!line.inventory_item_id` | — |
  | Return Part | `line.part_number` && `mode !== 'estimate'` | — |
  | **Receive Part** | `line.part_number` && `mode !== 'estimate'` | `!line.qty_on_order \|\| line.qty_on_order === 0` |
  | Serial Number | `line.part_number` && `line.inventory_item_id` | — |
  | Part Details | `line.part_number` && `line.inventory_item_id` | — |
  | Cores | `mode !== 'estimate'` && `Core_num !== 0` | — |
  | Update to Inv. Price | `isPriceDifferent` | — |
  | Add Line | always | — |
  | Delete Line | always | `!line.description && !line.part_number` |

  **Mark Parts as Ordered** is WO-wide, not row-specific (it must appear regardless of which row is right-clicked, as long as *any* line in the WO has `qty_quoted > 0`), so it will sit as its own block immediately after the `line.part_number && (...)` block that contains Receive Part — visually adjacent to Receive Part on every row, but gated on `mode !== 'estimate' && lineItems.some(l => (parseFloat(l.qty_quoted) || 0) > 0)`, not on the clicked row's own fields. `lineItems` is already in scope inside `renderContextMenu` as the parent component's prop — no new prop threading needed for the gate itself, only a new `onMarkPartsOrdered` callback prop (mirroring `onReceivePart`).
- **`buildWorkOrderSavePayload.js` does not currently pass through a `qty_quoted` field** — confirmed by reading the full `lineItemsToSave` mapping (lines 67-104). `not_ordered` and `partstech_cart_id` are both passed through untouched; per your decision, `not_ordered` stays exactly as-is (dead weight for old records), and `qty_quoted` gets added alongside it.
- **`line_items` is genuine `jsonb`** on `WorkOrder` (confirmed in `master_context.md` §3 and consistent with every read here) — adding `qty_quoted` as a new key requires **zero schema migration**, it's purely an application-level convention, same as every other line-item field.

**Decisions locked in from prior discussion in this conversation (not re-litigating these):**
1. Field name is **`qty_quoted`** (not the archived note's `qtyquoted`), mirroring `qty_on_order`'s naming.
2. **Add Batch as Quoted still creates/updates `InventoryItem` rows** (new parts land in the catalog at 0 QOH/QOO) — it only skips the QOO increment and the `'Ordered'`-tagged audit-log entry that increment would otherwise produce.
3. The "Quoted (Not Ordered)" badge **switches now** to reading `qty_quoted` instead of `not_ordered`. `not_ordered` is left untouched in the schema/payload builder for old records; nothing new writes it going forward, but nothing deletes it either.
4. Context-menu placement: **immediately after Receive Part**, WO-wide gated (see table above), not row-specific.
5. **Supplier is chosen once, at the top of the new OCR import modal, and applies to every item pulled from that import session** — the OCR prompt does **not** need to guess/match a supplier name for the WO context (unlike `InventoryAdd.jsx`'s receiving flow, which groups by supplier+invoice). This simplifies the mapping logic versus `InventoryAdd.jsx`'s `handleOCRSuccess`: no supplier fuzzy-matching, no invoice grouping.

**Explicit non-goals / out of scope for this plan:**
- No fiscal-period gating on any new path — confirmed `WOAddInventoryModal.jsx` has none today, and QOO/quoted movements post no GL entries (no money moves), consistent with `master_context.md` §3's fiscal-gate rule only applying to money-moving writes.
- No GL postings anywhere in this feature.
- No database schema migration — `line_items` is `jsonb`.
- No change to `InventoryAdd.jsx`'s own OCR behavior — the shared edge function gets an **additive, backward-compatible** prompt tweak only (new optional param, defaults to today's behavior).
- Not fixing the pre-existing "local state vs DB" redundancy pattern, or the lack of any `InventoryItem`-level locking (unlike `Supplier`/`WorkOrder`) — both are pre-existing, app-wide gaps, not introduced or worsened by this plan.

---

## 2) Previously Completed

None — this is the initial plan for this feature. No phases have been executed yet.

---

## 3) Risk Assessment

| Risk | Impact | Likelihood | Mitigation |
|---|---|---|---|
| Quoted path accidentally still bumps `quantity_on_order` / writes an `'Ordered'` audit row (branch logic bug) | High — silently inflates real on-order figures and pollutes the audit trail with phantom orders | Low | Single explicit `saveMode` branch in one function (`handleProcessBatch`); Phase 2 verification explicitly checks `InventoryItem.quantity_on_order` and `InventoryAuditLog` row count are unchanged after a Quoted save |
| Shared `autopro-processPartsInvoiceOCR` edge function regresses `InventoryAdd.jsx`'s existing receiving OCR flow | High — breaks a live, in-use production workflow | Low | New `documentContext` param is additive and optional, defaults to today's exact prompt/behavior when omitted; Phase 4 verification explicitly re-tests `InventoryAdd.jsx`'s Upload Invoices flow after the shared function changes |
| Badge migration means any WO with an old `not_ordered: true` line silently stops showing a badge (since it has no `qty_quoted`) | Low — cosmetic only | Certain, by design | Already an explicit, approved tradeoff from this conversation; noted here for traceability, no action needed |
| Local React state and the DB fall out of sync after "Mark Parts as Ordered," if the operator hits the WO's own Save button in a way that races the edge function's write | Medium — could show a stale quantity briefly, or double-apply the qty shift if timing is unlucky | Low | Mirrors the exact pattern `ReceivePartModal`/`autopro-processWorkOrderPartReceive` already use in production today; edge function re-derives from the live DB row (not a client-passed value), so a second accidental call is a no-op once `qty_quoted` is already 0 |
| OCR misreads a noisy/cropped cart or order-confirmation screenshot (wrong cost, wrong qty, missed line) | Medium — wrong data enters the batch | Medium — screenshots are far less structured than a formal invoice PDF | Nothing auto-commits: every imported row lands in the editable batch table for review before either Save button is clickable; Phase 2 adds a pre-flight validation pass (part #, description, cost > 0, selling price > 0, sales class, supplier, qty > 0) before either "Add Batch as..." button proceeds, closing the gap that OCR-imported rows bypass the single-item form's existing validation |
| Two people add the same part to the same WO simultaneously (one Quoted, one On Order) | Medium — potential lost update on `InventoryItem` | Low | Pre-existing, app-wide gap — `InventoryItem` has no lock today (unlike `Supplier`/`WorkOrder`'s two-column lock pattern per `master_context.md` §3). Not introduced or worsened by this plan; out of scope to fix here |
| Clipboard paste fails or is blocked (browser permissions, non-secure context, unsupported browser) | Low — one input method degrades | Low-Medium | `onPaste` handler wrapped in try/catch; file-upload input is always present as a fallback, paste is purely additive |
| New `autopro-processWorkOrderMarkQuotedOrdered` edge function has a bug that double-counts QOO when two selected lines share the same `inventory_item_id` | Medium — QOO ends up wrong for that part | Low | Function accumulates a running per-item QOO total in-memory across the selected-lines loop (keyed by `inventory_item_id`), not a stale per-line fetch; Phase 3 verification explicitly includes a two-lines-same-part test case |

---

## 4) Time Estimate

Autonomous execution time only (my own build+self-check time per phase); does not include your UI verification time between phases.

| Phase | Estimate |
|---|---|
| Phase 1 — Foundation (`qty_quoted` plumbing + badge migration) | 20–30 min |
| Phase 2 — `WOAddInventoryModal` On Order/Quoted split + batch validation | 45–60 min |
| Phase 3 — Mark Parts as Ordered (modal + edge function + context menu + `WorkOrderForm` wiring) | 75–90 min |
| Phase 4 — Paste/Upload Parts OCR import (new modal + prompt tweak + mapping logic) | 75–90 min |
| **Total** | **~3.5–4.5 hours** |

---

## 5) Roadmap & Progress

### Phase 1 — [Tested] Foundation: `qty_quoted` plumbing + badge migration

**Files impacted:** `src/components/work-orders/utils/buildWorkOrderSavePayload.js`, `src/components/work-orders/form/WorkOrderForm.jsx` (`padLines`), `src/components/work-orders/form/LineItemsTable.jsx` (badge render)

**TL;DR:** Establish `qty_quoted` as a first-class line-item field everywhere it needs to round-trip (blank-line template, save payload), and flip the existing "Quoted (Not Ordered)" badge to read it instead of the old `not_ordered` boolean. Pure plumbing — no new user-facing write path yet, since nothing produces a non-zero `qty_quoted` until Phase 2.

**Detail:** `padLines()`'s blank-line template gets a `qty_quoted: 0` key so freshly-padded lines don't have an `undefined` value that could trip up the badge's `parseFloat`. `buildWorkOrderSavePayload.js`'s `lineItemsToSave` map gets a `qty_quoted: item.qty_quoted || 0` passthrough, identical in shape to the existing `qty_on_order` line. `LineItemsTable.jsx`'s badge block swaps its condition from `line.not_ordered` to `(parseFloat(line.qty_quoted) || 0) > 0` and updates its label to show the quoted quantity, keeping the existing purple badge styling untouched.

### Phase 2 — [Tested] `WOAddInventoryModal` On Order/Quoted split

**Files impacted:** `src/components/work-orders/WOAddInventoryModal.jsx`

**TL;DR:** Replace the single "Save Batch & Add to WO" button with two buttons — **Add Batch as On Order** (today's exact logic, unchanged) and **Add Batch as Quoted** (same item-creation logic, but skips the QOO increment/audit row and stamps `qty_quoted` instead of `qty_on_order`). Add a pre-flight validation pass covering both paths, since Phase 4's OCR-imported items will bypass the single-item form's existing per-item validation.

**Detail:** `handleProcessBatch` gains a `saveMode` parameter (`'on_order' | 'quoted'`). For an **existing part**: in `'on_order'` mode, behavior is unchanged (fetch fresh item, call `update_inventory_with_audit` with `p_qoo: currentQOO + quantityToOrder`, `p_tx_type: 'Ordered'`); in `'quoted'` mode, the RPC call is skipped entirely and `processedInventoryItem` is just the freshly-fetched item as-is (QOO untouched). For a **new part**: `quantity_on_order` in the `InventoryItem` insert is `saveMode === 'on_order' ? quantityToOrder : 0`, and the direct `InventoryAuditLog` insert that currently always follows new-item creation is wrapped in `if (saveMode === 'on_order')` — in Quoted mode, the item is created but no audit row is written, since there's no quantity movement to log. The constructed `newLineItem` sets `qty_on_order: saveMode === 'on_order' ? quantityToOrder : 0` and a new `qty_quoted: saveMode === 'quoted' ? quantityToOrder : 0`. A new `validateBatchItems(items)` helper runs before either button's handler proceeds, checking every item in `batchItems` has `part_number`, `description`, `cost > 0`, `selling_price > 0`, `sales_class`, `supplier_id`, and `quantity_to_order > 0` — alerting and aborting (mirroring `InventoryAdd.jsx`'s hard-error gate) if anything's missing, since manually-added items are already guaranteed valid by `handleAddToBatch`'s existing checks but Phase 4's OCR-imported items won't be.

### Phase 3 — [Tested] Mark Parts as Ordered

**Files impacted:** new `src/components/work-orders/MarkPartsOrderedModal.jsx`, new `supabase/functions/autopro-processWorkOrderMarkQuotedOrdered/index.ts`, `src/components/work-orders/form/LineItemsTable.jsx` (context menu item), `src/components/work-orders/form/WorkOrderForm.jsx` (modal state/wiring)

**TL;DR:** New context-menu action, gated WO-wide on any line having `qty_quoted > 0`, opens a modal listing every quoted line with a default-all-checked checkbox list. Submitting converts the checked lines from `qty_quoted` to `qty_on_order`, bumps `InventoryItem.quantity_on_order` via the standard audit RPC, and writes the result back to the WorkOrder — closing the loop Phase 2 opened.

**Detail:** `MarkPartsOrderedModal` receives the full `lineItems` array, filters client-side to `qty_quoted > 0`, and renders each with part number/description/quoted qty and a checkbox (default checked). On submit, it calls the new edge function with `{ workOrderId, roNumber, lineItemIds: [...checked] }`. The edge function follows `autopro-processWorkOrderPartReceive`'s exact structure: load the `WorkOrder` fresh, parse `line_items`, and for each selected line — resolve its `inventory_item_id`, accumulate a running per-item QOO total in-memory (so two selected lines sharing the same `inventory_item_id` don't race each other), and prepare the line's mutation (`qty_on_order += qty_quoted`, `qty_quoted: 0`, `inventory_processed: true`). One `.update()` writes the fully-mutated `line_items` back to `WorkOrder`, mirroring the ordering already established in `autopro-processWorkOrderPartReceive` (WO write, then the per-item RPC calls). Then, sequentially per selected line, `update_inventory_with_audit` is called with `p_tx_type: 'Ordered'`, the accumulated running QOO, and a description noting it was promoted from a quote. `WorkOrderForm.jsx` gets a new `markOrdered: false` entry in its `modals` state, a `handleMarkPartsOrdered` callback (`openModal('markOrdered')`, no line index needed), an `onMarkPartsOrdered` prop passed to `LineItemsTable`, and an `onMarked` handler (mirroring `handleReceiveWorkOrderPart`'s shape) that re-derives the same `qty_on_order`/`qty_quoted` shift in local state and sets `hasUnsavedChanges = true`. `LineItemsTable.jsx`'s `renderContextMenu` gets the new item placed right after the `line.part_number && (...)` block containing Receive Part, gated on `mode !== 'estimate' && lineItems.some(l => (parseFloat(l.qty_quoted) || 0) > 0)`.

### Phase 4 — [Tested] Paste/Upload Parts OCR import

**Files impacted:** new `src/components/work-orders/WOPartsImportModal.jsx`, `src/components/work-orders/WOAddInventoryModal.jsx` (new button + batch-append handler), `supabase/functions/autopro-processPartsInvoiceOCR/index.ts` (additive prompt tweak)

**TL;DR:** New "Paste/Upload Parts" button next to the Category dropdown opens a modal with a supplier dropdown (applies to the whole import session), a file-upload input, and a paste-capture zone. Extracted items are mapped directly into `WOAddInventoryModal`'s `batchItems` array, bypassing the single-item form, mirroring how `InventoryAdd.jsx`'s existing OCR flow bulk-populates its own batch.

**Detail:** `WOPartsImportModal` requires a supplier selection before allowing Process; its file input matches `PartsInvoiceOCRModal`'s `accept="application/pdf,image/png,image/jpeg"` and adds a bordered paste zone whose `onPaste` handler reads `e.clipboardData.items`, pulls any `image/*` entries via `item.getAsFile()`, and appends them to the same file list used by uploads, so both entry methods feed one unified queue. Processing reuses `PartsInvoiceOCRModal`'s exact upload-to-storage-then-raw-fetch pattern against `autopro-processPartsInvoiceOCR`, adding one new request field, `documentContext: 'wo_parts'`, and omitting `supplierNames` entirely (not needed — the modal's own supplier selection is authoritative, unlike `InventoryAdd.jsx`'s per-invoice supplier matching). The edge function gets one small additive change: when `documentContext === 'wo_parts'`, an extra prompt paragraph is inserted (not a replacement prompt) clarifying the source may be a cart/order-confirmation screenshot rather than a formal invoice, and that missing invoice number/date/subtotal/GST fields should be left empty rather than guessed — the response JSON schema and every extraction rule (handwritten-edit priority, core/enviro-fee attachment, part-number normalization, MFG-code stripping) stay identical and shared between both contexts. On success in the modal, all `items[]` across every processed file are flattened into one list (no per-invoice grouping, since WO batch items don't have that concept); each is matched against a single batched `InventoryItem` query (`.in('part_number', [...])`, same pattern as `InventoryAdd.jsx`'s `handleOCRSuccess`) to prefill category/tag-along/core/stocked-item fields for existing parts, falls back to a "Regular" sales-class lookup and blank category for new parts, recomputes `selling_price`/`profit_margin` from the OCR-extracted cost via the sales-class pricing matrix, and sets `supplier_id` uniformly to the modal's selected supplier on every item. The mapped array is prepended into `WOAddInventoryModal`'s `batchItems` state exactly like a batch of manually-added rows, fully editable before either Save button is used.

---

## 6) Verification Plan

**Phase 1:** Open any existing Work Order with at least one line item. Confirm the WO loads and renders with no console errors (`qty_quoted` being `undefined` on old rows must not break anything — it should just read as 0/falsy). Nothing visibly changes yet since no path writes `qty_quoted` — this phase is proven purely by "nothing broke."

**Phase 2:** Open a WO, click Add Part, fill out a batch item for a brand-new part number, and confirm the footer now shows two buttons instead of one. Click **Add Batch as On Order** — confirm the line item shows the "On Order {qty}" badge (existing behavior), and check via Supabase that the new `InventoryItem` row has `quantity_on_order` set and an `InventoryAuditLog` row exists with `tx_type = 'Ordered'`. Repeat with a second new part number, this time clicking **Add Batch as Quoted** — confirm the line item shows a "Quoted (Qty {n})" badge (Phase 1's badge, now actually triggered), and check via Supabase that the new `InventoryItem` row has `quantity_on_order = 0` and **no** new `InventoryAuditLog` row was created for it. Then try adding a batch item with a required field blanked out (e.g., no sales class) and confirm the new validation alert blocks the save.

**Phase 3:** Using a WO with at least one Quoted line from Phase 2, right-click any line and confirm **Mark Parts as Ordered** appears in the context menu (and does *not* appear on a WO with zero quoted lines, or in Estimate mode). Open it, confirm every quoted line is listed and pre-checked, uncheck one, submit. Confirm: the checked line(s) now show the "On Order" badge instead of "Quoted," the unchecked line still shows "Quoted," the corresponding `InventoryItem.quantity_on_order` increased by the right amount in Supabase, and a new `InventoryAuditLog` row with `tx_type = 'Ordered'` exists for each promoted line. Save the WO afterward and reload to confirm the change persisted through the normal save path too (not just the edge function's direct write).

**Phase 4:** Open Add Part on a WO, click **Paste/Upload Parts**, select a supplier, upload a screenshot of a parts cart (or paste one via Ctrl+V), click Process, and confirm the extracted rows land in the batch table with part number/description/qty/cost populated and the chosen supplier applied to every row. Edit/remove a row to confirm the imported rows are fully editable like manually-added ones, then save as either On Order or Quoted and confirm it behaves identically to a manually-entered batch of the same shape. Finally, re-test `InventoryAdd.jsx`'s existing "Upload Invoices" OCR flow with a real supplier invoice PDF to confirm the shared edge function's additive prompt change didn't regress the original receiving flow.

---

## 7) Working Area (Current Phase): Phase 1 — Foundation

### A) `src/components/work-orders/utils/buildWorkOrderSavePayload.js`

Current (line 75, inside `lineItemsToSave`'s `baseLineItem` object):
```js
      qty_on_order: item.qty_on_order || 0,
```
Change to:
```js
      qty_on_order: item.qty_on_order || 0,
      qty_quoted: item.qty_quoted || 0,
```

### B) `src/components/work-orders/form/WorkOrderForm.jsx`

Current (`padLines`, line 50, inside the blank-line push object):
```js
      qty_on_order: 0,
      unit: '',
      manually_inserted: false
    });
```
Change to:
```js
      qty_on_order: 0,
      qty_quoted: 0,
      unit: '',
      manually_inserted: false
    });
```

### C) `src/components/work-orders/form/LineItemsTable.jsx`

Current (lines 526-530):
```jsx
                    {line.not_ordered && (
                      <Badge variant="outline" className="px-1 py-0 text-xs bg-purple-50 dark:bg-purple-900/30 text-purple-700 dark:text-purple-400 border-purple-300 dark:border-purple-700">
                        Quoted (Not Ordered)
                      </Badge>
                    )}
```
Change to:
```jsx
                    {(parseFloat(line.qty_quoted) || 0) > 0 && (
                      <Badge variant="outline" className="px-1 py-0 text-xs bg-purple-50 dark:bg-purple-900/30 text-purple-700 dark:text-purple-400 border-purple-300 dark:border-purple-700">
                        Quoted (Qty {line.qty_quoted})
                      </Badge>
                    )}
```

No other files change in this phase. `not_ordered` is left completely untouched everywhere else (still passed through in `buildWorkOrderSavePayload.js`, still present on old WO records) — only its one UI consumer (this badge) moves to the new field.

Once you approve this plan, I'll execute Phase 1, then stop for you to verify in the UI before Phase 2 starts.

---

## 8) Post-Testing Follow-Ups (2026-08-07, all live-tested and deployed)

All items below landed after the initial 4-phase build, during/after live UI testing — appended here for the record rather than reworking the phase sections above.

**Phase 2-adjacent (WOAddInventoryModal):**
- Quoted badge/button color changed from purple to **rose** — purple and On Order's blue read as too similar at a glance, especially in dark mode. Changed in `LineItemsTable.jsx` (badge), `WOAddInventoryModal.jsx` ("Add Batch as Quoted" button), and `MarkPartsOrderedModal.jsx` (quoted-qty text). "Paste/Upload Parts" button changed to a solid purple filled button (purple was freed up by the rose move).
- Added a pencil/edit icon to each `WOAddInventoryModal` batch row, mirroring `InventoryAdd.jsx`'s `handleEditItem` pattern exactly: pulls the row's data back into the form, removes it from the batch, refocuses Part #. New `handleEditBatchItem` function. One known minor gap: edited existing-part rows show QOH as 0 in the "Existing Part Selected" banner (batch items don't carry a live QOH value) — cosmetic only, doesn't affect what gets saved.

**Estimate-stage restriction (new scope, not in the original 4 phases):** "Add Batch as On Order" is now hidden entirely on the Estimate stage (`WOAddInventoryModal` takes a new `mode` prop, threaded from `WorkOrderForm.jsx`) — estimates can only Quote, never place a real order. Ctrl+Enter adapts to default to Quoted on estimates. `autopro-convertEstimateToWorkOrder` gained a new branch: any line with `qty_quoted > 0` is finalized on conversion — the real `InventoryItem.quantity_on_order` gets bumped via `update_inventory_with_audit` (`tx_type: 'Ordered'`) and the line's `qty_quoted` moves to `qty_on_order`, since a converted WO can't still be "just quoted." Deployed to both dev and production.

**Bonus discovery, unrelated to this plan but found while touching the same function:** `autopro-convertEstimateToWorkOrder` had **never been deployed to production** at all — only to the `development` branch. Estimate→Work Order conversion had been silently failing on production (hitting the "Conversion failed" alert) independent of anything in this plan. Now deployed to both.

**Bug found during live testing, fixed in two places:** line items added via "Add Batch as Quoted" get a raw JS-number `id` (`Date.now() + Math.random()`). `MarkPartsOrderedModal`'s checked-state was keyed by that id on a plain JS object, which silently stringifies numeric keys — so the ids sent to the edge function were strings while the database's line `id` values stayed numbers, and `Set.has()`'s strict equality never matched, even though the modal displayed the rows correctly. Fixed by `String()`-normalizing both sides before comparing, in **both** `autopro-processWorkOrderMarkQuotedOrdered` (server-side, most robust — guards against either side's type) and `WorkOrderForm.jsx`'s `handleWorkOrderPartsMarkedOrdered` (local-state sync, which had the identical bug but would have failed silently — no error, just a badge stuck on "Quoted" until the next reload). Worth checking for this same class of bug anywhere else that threads a `line_items[].id` through a plain-object-keyed structure.

**New feature, prompted by a real workflow gap surfaced during testing:** users flagged that a Quoted part with `qty_on_order = 0` couldn't be received even when it was already physically in stock — `LineItemsTable.jsx`'s Receive Part menu item was gated purely on `qty_on_order > 0`, forcing an unnecessary "Mark as Ordered" detour first. Fixed by adding a fully separate modal/function pair (matching this codebase's established one-function-per-concern pattern, not branching the existing one): `ReceiveQuotedPartModal.jsx` + `autopro-processWorkOrderReceiveQuotedPart`, which pulls straight from QOH and reduces `qty_quoted` only — `InventoryItem.quantity_on_order` is never touched, since a quoted line never had a QOO commitment to unwind. `LineItemsTable.jsx`'s Receive Part item now enables on `qty_on_order > 0` OR `qty_quoted > 0` and routes to whichever modal applies.

**Unrelated small fixes done in the same working session, noted here only for the record (not part of this plan's actual scope):** a WorkPRO cross-over note added next to the Vehicle Notes field (`VehicleForm.jsx`/`VehicleDetails.jsx`), and the Edit Vehicle/Edit Customer dialogs on `DocumentEditor.jsx` capped at `max-h-[90vh] overflow-y-auto` to stop clipping on short screens.

System-level facts from this whole body of work (the Quoted/On-Order lifecycle, the two receive paths, the id-comparison gotcha) have been rolled into `master_context.md` §4.1 rather than duplicated here — that's the durable reference going forward; this document is the execution history.
