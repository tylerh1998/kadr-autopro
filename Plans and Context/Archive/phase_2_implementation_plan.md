# Phase 2 Implementation Plan: PartsTech / Online Ordering Removal

**Status:** EXECUTED — pending your manual verification (5 items, see Section 4 checklist)
**Parent:** `master_blueprint.md`, Phase 2
**Live document note:** This file is meant to be updated in place as execution proceeds — checkboxes get checked, new findings get appended to Section 2, and anything that changes from the original plan gets noted inline rather than silently edited away. At the end of the phase, key learnings get rolled back into `master_blueprint.md` Section 7.

---

## 0) Open Questions — RESOLVED

1. **✅ Done, by user directly.** `PartsTechCart` dropped from production via SQL Editor. No remaining DB work for this phase.
2. **✅ Done, by user directly.** `PARTSTECH_API_KEY` removed from production. No remaining secrets work for this phase (dev never had it set).
3. **✅ Done, by user directly.** `partstech-extension.zip` deleted from Supabase Storage. No orphaned file remains.
4. **✅ Resolved — leave `buildWorkOrderSavePayload.js` untouched.** Confirmed: no JSON cleanup needed either, existing test-WO data can stay as-is. This function is out of scope for this phase, full stop.
5. **✅ Confirmed.** Undeploy the 3 functions from both `hbcrwkmgsazqrvsrmxyr` (production) and `sitihbdnuxifwibontcm` (dev branch).

**New note (not a Phase 2 change, context for later):** the "Quoted (Not Ordered)" badge in `LineItemsTable.jsx` (~line 542-546) stays exactly as-is in this phase — it's earmarked for a **future** implementation where it'll key off a `qtyquoted` value in the line item's JSON instead of the current `not_ordered` boolean. Not being built now; noted here (and in Section 1 / Appendix) so it isn't lost before that future work starts.

All remaining scope for this phase is now purely the `src/`/`electron/`/`supabase/functions/` file changes and the 2-environment edge function undeploy — no more DB or dashboard actions needed.

---

## 1) Phase Scope & Objectives

**TL;DR:** Remove the entire PartsTech/NAPA ProLink online-ordering feature — a confirmed failed experiment (your words) — end to end: the React modal and its context-menu triggers, 3 Supabase Edge Functions, a browser extension, the Electron cart-scraping bridge, a Setup-page download button, and the (real, live) `PartsTechCart` production table. Nothing here gets migrated or replaced — this is a pure deletion phase.

**In scope:**
- `src/components/work-orders/OnlineOrderModal.jsx` — delete entirely
- `src/components/work-orders/form/WorkOrderForm.jsx` — remove PartsTech-specific state, handlers, and render block; keep everything else
- `src/components/work-orders/form/LineItemsTable.jsx` — remove 3 context-menu items and one prop; keep the rest of the context menu untouched
- `src/pages/Setup.jsx` — remove the "Download PartsTech Bridge" button
- `electron/main.js` — remove the `/get-cart-text` and `/ping` protocol routes and the `SUPPLIER_PATTERNS` scraping logic; keep the window/loadURL scaffolding
- `electron/preload.cjs` — delete entirely (confirmed orphaned — not wired into `main.js`'s `BrowserWindow`, not referenced in `package.json`)
- `partstech-extension/` — delete entire directory (3 files)
- `supabase/functions/autopro-partstech-session/`, `autopro-partstech-callback/`, `autopro-extractCartTextLLM/` — delete source directories AND undeploy from both Supabase projects
- `public."PartsTechCart"` — drop from production (pending your go-ahead per Section 0 #1); nothing to do on dev, table was never created there
- `PARTSTECH_API_KEY` secret — unset from production (pending Section 0 #2)

**Explicitly out of scope (do not touch):**
- `GEMINI_API_KEY` secret — shared with `autopro-processPartsInvoiceOCR`, which is staying. Confirmed via grep: this secret is used by exactly 2 functions, one being deleted, one not.
- The Electron shell itself (`main.js`'s `BrowserWindow`/`loadURL`/cookie-handling logic) — stays, per your earlier note that it's useful for your PWA users.
- The rest of `LineItemsTable.jsx`'s context menu (Get Part, Other Charge, Add New Part, Return Part, Receive Part, Serial Number, Part Details, Cores, Update to Inv. Price, Add Line, Delete Line) — untouched.
- The `line.not_ordered` "Quoted (Not Ordered)" badge in `LineItemsTable.jsx` (~line 542-546) — this reads a generic flag independent of the PartsTech-specific `partstech_cart_id` check being removed. **Confirmed with user: this badge is earmarked for a future implementation** that will key off a `qtyquoted` value in the line item's JSON instead of the current `not_ordered` boolean. Not being built in this phase — leave the badge exactly as it is today.
- `buildWorkOrderSavePayload.js`'s `partstech_cart_id` passthrough — see Section 0 #4.

**Target outcome:** Repo-wide case-insensitive search for `partstech`/`prolink`/`OnlineOrder` returns zero hits outside this phase's own commit/plan history. `WorkOrderForm.jsx` and `LineItemsTable.jsx` continue to function identically for every other context-menu action. The app builds and runs with no dangling imports. `autopro-processPartsInvoiceOCR` (OCR feature) still works, proving `GEMINI_API_KEY` was untouched.

---

## 2) Lessons Learned & Context (from `master_blueprint.md` Section 7, applicable to this phase)

- **A feature that looks like "one modal" can span many unrelated-looking surfaces.** This turned out to be true here too — a React modal, 3 edge functions, a browser extension directory, an Electron protocol handler, and a dashboard download button all needed to be found via a full-codebase footprint search before scoping this phase. The research below reflects that full sweep (repo-wide case-insensitive grep for `partstech`/`napaprolink`/`prolink`), not just the file you'd think of first.
- **Verify actual current state before trusting an earlier conclusion.** The `PartsTechCart` migration file was already found, mid-Phase-1, to genuinely exist in production despite earlier CLI-only tooling suggesting otherwise — re-confirmed again just now via direct query before writing this plan. Don't skip the re-check just because Phase 1 already covered it once.
- **The local migration file for `PartsTechCart` is already gone from the working tree** (`git status` shows it as deleted, uncommitted) — this happened before this session even started, not something to redo. The remaining real work is the actual production `DROP TABLE`, not a file deletion.
- **Dead/unused code should be deleted outright, not migrated or ported.** Same principle applied to `KanbanBoard.jsx` in Phase 13's scoping applies here — this whole feature is being removed wholesale, no native replacement, per your explicit direction that it was a failed experiment.
- **Shared secrets need explicit care when deleting the function that (partially) uses them.** `GEMINI_API_KEY` is used by both the function being deleted (`autopro-extractCartTextLLM`) and one that's staying (`autopro-processPartsInvoiceOCR`) — confirmed via grep before writing this plan, not assumed. Only the function goes; the secret stays.
- **Dev and production are separate deployments that both need cleanup.** Phase 1 established that "the dev branch" isn't automatically kept in sync with source changes — the 3 edge functions being deleted are independently deployed to both projects and need separate teardown on each, not just a source-code deletion.

---

## 3) Detailed Execution Plan

### 3.1 Architecture — what's being removed

```
CURRENT STATE (being removed)
------------------------------
LineItemsTable.jsx (right-click menu on a line item)
   │
   ├── "Online Order (PartsTech)"       ──┐
   ├── "Online Order (NAPA Prolink)"    ──┤
   └── "Finalize Order (PartsTech)"     ──┘
                                            │
                                            ▼
                              WorkOrderForm.jsx
                              (handleOnlineOrder → opens modal,
                               handlePartsTechSuccess → maps result
                               into line items)
                                            │
                                            ▼
                              OnlineOrderModal.jsx
                    ┌───────────────────────┼───────────────────────┐
                    │                       │                       │
              iframe punch-out      "Transfer Cart" button    Electron bridge
           (app.partstech.com /   → desktop://api/get-cart-   (main.js protocol
            napaprolink.ca)          text → autopro-extract-   handler scans
                                      CartTextLLM (Gemini)      iframes for
                                      → parses parts            supplier domains)
                                            │
                                            ▼
                          writes InventoryItem / InventoryAuditLog
                          + public."PartsTechCart" (historical row)

  Separately: Chrome extension (partstech-extension/) bridges cart data
  from the actual supplier website into the app via postMessage — a
  parallel/alternate path to the Electron bridge above, for browser use.

  Separately: Setup.jsx has a button distributing the extension as a .zip.

AFTER THIS PHASE
----------------
LineItemsTable.jsx (right-click menu) — 3 items removed, rest unchanged
WorkOrderForm.jsx — PartsTech state/handlers/render block removed
electron/main.js — /get-cart-text and /ping routes removed, window shell stays
                    (rest of the app's Electron usage is untouched)

  DELETED: OnlineOrderModal.jsx, electron/preload.cjs, partstech-extension/,
           autopro-partstech-session, autopro-partstech-callback,
           autopro-extractCartTextLLM, public."PartsTechCart"
```

---

### 3.2 File-by-file changes

#### 3.2.1 DELETE — `src/components/work-orders/OnlineOrderModal.jsx`

Whole file (553 lines). No other component imports from it except `WorkOrderForm.jsx` (handled in 3.2.2).

---

#### 3.2.2 EDIT — `src/components/work-orders/form/WorkOrderForm.jsx`

**a) Remove the import** — line 16:
```diff
- import OnlineOrderModal from '../OnlineOrderModal';
```

**b) Remove PartsTech state** — lines 97-108, the `modals` state object loses its `partsTech` key, and the two dedicated state hooks go entirely:
```diff
  const [modals, setModals] = useState({
    getPart: false,
    otherCharge: false,
    addPart: false,
    returnPart: false,
    receivePart: false,
    cores: false,
-   partsTech: false,
  });

- const [partsTechCartId, setPartsTechCartId] = useState(null);
- const [supplierUrl, setSupplierUrl] = useState("https://app.partstech.com/");
```

**c) Remove the two handler callbacks** — lines 455-475:
```diff
- const handleOnlineOrder = useCallback((lineIndex, url, cartId = null) => {
-   console.log('=== DEBUG: handleOnlineOrder called with index:', lineIndex, 'url:', url, 'cartId:', cartId);
-   setPartsTechCartId(cartId);
-   setSupplierUrl(url);
-   openModal('partsTech', lineIndex);
- }, [openModal]);
-
- const handlePartsTechSuccess = useCallback((cartPayload) => {
-   console.log('=== DEBUG: handlePartsTechSuccess called ===', cartPayload);
-   if (!cartPayload?.parts || !Array.isArray(cartPayload.parts)) return;
-
-   const formattedParts = cartPayload.parts.map(part => ({
-     part_number: part.partNumber || part.part_number || '',
-     description: part.description || '',
-     parts_ea: part.costPrice || part.parts_ea || 0,
-     qty: part.quantity || part.qty || 1,
-     inventory_processed: false,
-   }));
-
-   handleMultiplePartsAdded(formattedParts, []);
- }, [handleMultiplePartsAdded]);
```
This sits directly between `handleGetPart` (ends line 453) and `handleAddOtherCharge` (starts line 477) — remove the block cleanly, no other code depends on the blank space.

**d) Remove the prop passed to `LineItemsTable`** — line 1121:
```diff
      <LineItemsTable
        lineItems={displayLineItems}
        setLineItems={tracedSetLineItems}
        isLocked={isLocked}
        onGetPart={handleGetPart}
        onOtherCharge={handleOtherCharge}
        onAddPart={handleAddPart}
        onReturnPart={handleReturnPart}
        onReceivePart={handleReceivePart}
        onCores={handleCores}
-       onOnlineOrder={handleOnlineOrder}
        onDeleteLine={handleDeleteLine} // Pass handleDeleteLine to LineItemsTable
        onInsertLine={handleInsertLine}
        workOrder={initialWorkOrder}
        selectedLineIndex={selectedLineIndex}
        onSelectLine={handleSelectLine}
        mode={mode} // Pass mode to LineItemsTable
      />
```

**e) Remove the modal render block** — lines 1182-1194, sits between `<ROCoreModal .../>` and the closing `</div>`:
```diff
-     <OnlineOrderModal
-       open={modals.partsTech}
-       onClose={() => {
-         closeModal('partsTech');
-         setPartsTechCartId(null);
-       }}
-       roNumber={initialWorkOrder?.ro_number}
-       vehicleInfo={vehicle}
-       userInfo={{ username: 'tech' }}
-       onTransferComplete={handlePartsTechSuccess}
-       cartId={partsTechCartId}
-       supplierUrl={supplierUrl}
-     />
    </div>
  );
}
```

---

#### 3.2.3 EDIT — `src/components/work-orders/form/LineItemsTable.jsx`

**a) Remove the prop from the function signature** — line 54:
```diff
  export default function LineItemsTable({
    lineItems,
    setLineItems,
    isLocked,
    onGetPart,
    onOtherCharge,
    onAddPart,
-   onOnlineOrder,
    onReturnPart,
    onReceivePart,
    onCores,
    onDeleteLine, // Accept onDeleteLine prop
    onInsertLine,
```

**b) Remove the 2 unconditional context-menu items** — lines 356-363, inside the `!line.inventory_item_id` block, sitting between "Add New Part" and the `<ContextMenuSeparator />`:
```diff
          <ContextMenuItem onClick={() => onAddPart(index)}>
            <Plus className="mr-2 h-4 w-4" />
            <span>Add New Part</span>
          </ContextMenuItem>
-         <ContextMenuItem onClick={() => onOnlineOrder(index, "https://app.partstech.com/")}>
-           <Package className="mr-2 h-4 w-4" />
-           <span>Online Order (PartsTech)</span>
-         </ContextMenuItem>
-         <ContextMenuItem onClick={() => onOnlineOrder(index, "https://www.napaprolink.ca/")}>
-           <Package className="mr-2 h-4 w-4" />
-           <span>Online Order (NAPA Prolink)</span>
-         </ContextMenuItem>
          <ContextMenuSeparator />
```
Note: `Package` icon stays imported/used — "Get Part" (line 344-347) also uses it.

**c) Remove the conditional "Finalize Order" item** — lines 369-374, inside the `line.part_number` block:
```diff
      {line.part_number && (
        <>
-         {line.not_ordered && line.partstech_cart_id && (
-           <ContextMenuItem onClick={() => onOnlineOrder(index, "https://app.partstech.com/", line.partstech_cart_id)}>
-             <Package className="mr-2 h-4 w-4" />
-             <span>Finalize Order (PartsTech)</span>
-           </ContextMenuItem>
-         )}
          {mode !== 'estimate' && (
            <ContextMenuItem onClick={() => onReturnPart(index)} disabled={!line.part_number}>
```

**Leave untouched:** the `line.not_ordered` badge render block at ~line 542-546 — see Section 1's "explicitly out of scope."

---

#### 3.2.4 EDIT — `src/pages/Setup.jsx`

Remove the "Download PartsTech Bridge" button — lines 79-85:
```diff
          <div className="flex gap-2">
-           <Button 
-             onClick={() => window.open('https://hbcrwkmgsazqrvsrmxyr.supabase.co/storage/v1/object/public/KADR/partstech-extension.zip', '_blank')}
-             className="bg-blue-600 hover:bg-blue-700 text-white"
-           >
-             <Download className="w-4 h-4 mr-2" />
-             Download PartsTech Bridge
-           </Button>
            <Button 
              onClick={() => window.open('https://drive.google.com/uc?export=download&id=1-APT_Tt8xlAxBChlmvU1KftO5h83ViKP', '_blank')}
              variant="outline"
              className="bg-white"
```
Confirm `Download` icon import (from `lucide-react`) is still used by the neighboring Google Drive backup button before deciding whether to touch the import line — do not remove the icon import if it is.

---

#### 3.2.5 EDIT — `electron/main.js`

Remove the `/get-cart-text` block (lines 74-133) and the `/ping` block (lines 136-140) from inside the `protocol.handle('desktop', ...)` callback — confirmed via repo-wide grep that nothing in `src/` calls `desktop://api/ping`, so it's safe to remove alongside the cart-text route rather than leaving an unused stub:

```diff
  protocol.handle('desktop', async (request) => {
    const url = new URL(request.url);
    console.log(`[Main] Protocol request: ${url.pathname}`);

-   if (url.pathname === '/get-cart-text' || url.pathname === '//api/get-cart-text') {
-     ... (full block, lines 74-133) ...
-   }
-
-   // Health check endpoint — React can call this to verify desktop mode
-   if (url.pathname === '/ping' || url.pathname === '//api/ping') {
-     return new Response(JSON.stringify({ ok: true, version: app.getVersion() }), {
-       headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
-     });
-   }

    return new Response('Not found', { status: 404 });
  });
```

This leaves the `protocol.registerSchemesAsPrivileged`/`protocol.handle('desktop', ...)` scaffolding itself in place (returning a 404 for any request), the `BrowserWindow` creation, `loadURL('https://test.kensauto.ca')`, and the third-party-cookie header rewriting — none of that is PartsTech-specific.

**Decision point for you:** since the entire useful purpose of the custom `desktop://` protocol handler was cart-scraping, once both routes are gone it only returns 404. Keep the empty scaffolding (in case a future desktop-only feature wants the same pattern) or remove `protocol.registerSchemesAsPrivileged`/`protocol.handle` entirely too? Plan defaults to **keeping the empty scaffolding** — smaller diff, no functional difference, easy to fill back in later. Flag if you'd rather fully strip it.

---

#### 3.2.6 DELETE — `electron/preload.cjs`

Whole file. Confirmed orphaned: `main.js`'s `BrowserWindow` `webPreferences` has no `preload:` key (comment literally says "No preload needed! We use custom protocol instead"), there's no `ipcMain.handle('get-cart-text', ...)` anywhere in `main.js` for this file's `ipcRenderer.invoke('get-cart-text')` to even reach, and `package.json` has zero references to `preload.cjs`.

---

#### 3.2.7 DELETE — `partstech-extension/` (entire directory)

3 files: `manifest.json`, `content.js`, `inject.js`. Standalone Chrome MV3 extension, not imported/bundled by the main app build in any way — safe to delete as a unit.

---

#### 3.2.8 DELETE — 3 Supabase Edge Functions (source + deployed)

| Function | Source dir | Uses `GEMINI_API_KEY`? | Uses `PARTSTECH_API_KEY`? |
|---|---|---|---|
| `autopro-partstech-session` | `supabase/functions/autopro-partstech-session/` (1 file: `index.ts`) | No | **Yes** — confirmed via grep |
| `autopro-partstech-callback` | `supabase/functions/autopro-partstech-callback/` (1 file: `index.ts`) | No | No |
| `autopro-extractCartTextLLM` | `supabase/functions/autopro-extractCartTextLLM/` (1 file: `index.ts`) | **Yes** — confirmed via grep, shared with `autopro-processPartsInvoiceOCR` which stays | No |

No `supabase/config.toml` entries exist for any of these 3 (confirmed via grep) — nothing to clean up there.

Steps:
1. Delete the 3 source directories from the repo.
2. Undeploy from **production** (`hbcrwkmgsazqrvsrmxyr`): `supabase functions delete autopro-partstech-session --project-ref hbcrwkmgsazqrvsrmxyr` (repeat for the other 2).
3. Undeploy from **dev branch** (`sitihbdnuxifwibontcm`): same 3 commands with `--project-ref sitihbdnuxifwibontcm`. Confirmed via connector that all 3 are currently `ACTIVE` on both.

---

#### 3.2.9 DROP TABLE — `public."PartsTechCart"` — ✅ DONE (by user, via SQL Editor, before code execution began)

No remaining action.

---

#### 3.2.10 Secret cleanup — ✅ DONE (by user, before code execution began)

`PARTSTECH_API_KEY` removed from production. No remaining action.

---

## 4) Verification Plan

### Step-by-step UI verification

1. Open a Work Order in `DocumentEditor` with at least one line item that has no `inventory_item_id` set (i.e., a blank/new line).
2. Right-click that line → context menu should show: Get Part, Other Charge, Add New Part, then go straight to a separator — **no "Online Order (PartsTech)" or "Online Order (NAPA Prolink)" items**.
3. Right-click a line that *does* have a `part_number` set → confirm the menu shows Return Part / Receive Part / Serial Number / Part Details / Cores / Update to Inv. Price / Add Line / Delete Line as before, with **no "Finalize Order (PartsTech)"** item regardless of the line's `not_ordered`/`partstech_cart_id` values.
4. Open browser DevTools console while doing the above — zero errors referencing `OnlineOrderModal`, `onOnlineOrder`, or `partsTech`.
5. Go to Setup page → confirm "Download PartsTech Bridge" button is gone; the Google Drive backup button next to it still renders correctly (icon intact).
6. If feasible to test in the Electron desktop app build: launch it, confirm the window still loads `test.kensauto.ca` normally; open DevTools console inside the Electron window and run `fetch('desktop://api/get-cart-text')` and `fetch('desktop://api/ping')` — both should now 404 (or fail to resolve if the whole protocol scaffold was removed per your answer to the 3.2.5 decision point), confirming the routes are gone without breaking the app shell.
7. Trigger the OCR feature (parts invoice upload → `autopro-processPartsInvoiceOCR`) and confirm it still successfully extracts data — this is the regression check that `GEMINI_API_KEY` was left untouched.
8. `npm run build` completes with no errors and no warnings about unresolved imports (`OnlineOrderModal`, `Download` icon if removed incorrectly, etc.).

### Network / backend verification

9. Via the Supabase connector, confirm `list_edge_functions` on both `hbcrwkmgsazqrvsrmxyr` and `sitihbdnuxifwibontcm` no longer lists `autopro-partstech-session`, `autopro-partstech-callback`, or `autopro-extractCartTextLLM`.
10. Via the connector, confirm `list_tables` on `hbcrwkmgsazqrvsrmxyr` no longer includes `PartsTechCart`.
11. Via CLI, confirm `supabase secrets list --project-ref hbcrwkmgsazqrvsrmxyr` no longer lists `PARTSTECH_API_KEY` (if Section 0 #2 is answered "do it now").
12. Repo-wide case-insensitive grep for `partstech`, `prolink`, `OnlineOrder` returns zero hits (excluding this plan file and `master_blueprint.md`'s historical references).

### Checklist

- [x] `src/components/work-orders/OnlineOrderModal.jsx` deleted
- [x] `WorkOrderForm.jsx`: import removed
- [x] `WorkOrderForm.jsx`: `modals.partsTech` key removed
- [x] `WorkOrderForm.jsx`: `partsTechCartId` / `supplierUrl` state removed
- [x] `WorkOrderForm.jsx`: `handleOnlineOrder` / `handlePartsTechSuccess` removed
- [x] `WorkOrderForm.jsx`: `onOnlineOrder` prop removed from `<LineItemsTable>`
- [x] `WorkOrderForm.jsx`: `<OnlineOrderModal>` render block removed
- [x] `LineItemsTable.jsx`: `onOnlineOrder` removed from function signature
- [x] `LineItemsTable.jsx`: "Online Order (PartsTech)" / "Online Order (NAPA Prolink)" items removed
- [x] `LineItemsTable.jsx`: "Finalize Order (PartsTech)" conditional item removed
- [x] `LineItemsTable.jsx`: rest of context menu confirmed unchanged (source review — Get Part/Other Charge/Add New Part/Return Part/Receive Part/Serial Number/Part Details/Cores/Update to Inv. Price/Add Line/Delete Line all untouched; "Quoted (Not Ordered)" badge intentionally left in place per user's future-implementation note)
- [x] `Setup.jsx`: "Download PartsTech Bridge" button removed, neighboring "Download Template" button/icon confirmed unaffected (checked all `Download` icon usages before editing)
- [x] `electron/main.js`: `/get-cart-text` route removed
- [x] `electron/main.js`: `/ping` route removed
- [x] `electron/main.js`: kept the empty protocol scaffold (default from the plan), updated the now-stale comment that referenced the removed route
- [x] `electron/preload.cjs` deleted
- [x] `partstech-extension/` directory deleted (all 3 files)
- [x] `supabase/functions/autopro-partstech-session/` deleted from repo
- [x] `supabase/functions/autopro-partstech-callback/` deleted from repo
- [x] `supabase/functions/autopro-extractCartTextLLM/` deleted from repo
- [x] All 3 functions undeployed from production (`hbcrwkmgsazqrvsrmxyr`) — confirmed via CLI, "Deleted Edge Function" for each
- [x] All 3 functions undeployed from dev branch (`sitihbdnuxifwibontcm`) — confirmed via CLI, "Deleted Edge Function" for each
- [x] `public."PartsTechCart"` dropped from production — done by user
- [x] `PARTSTECH_API_KEY` unset from production — done by user
- [x] `partstech-extension.zip` deleted from storage — done by user
- [ ] **Context menu manually verified in-app (blank line + line with part_number) — needs you to do this in the browser**
- [ ] **No console errors during context-menu interaction — needs manual check**
- [ ] **Setup page renders correctly, no broken button/icon — needs manual check**
- [ ] **Electron desktop build smoke-tested — needs manual check (I can't launch the Electron shell from here)**
- [ ] **`autopro-processPartsInvoiceOCR` regression-tested and still working — needs manual check (upload a parts invoice and confirm OCR still extracts data)**
- [x] `npm run build` succeeds with no errors/warnings — confirmed, exit code 0
- [x] `list_edge_functions` confirms all 3 functions gone from both Supabase projects — confirmed via connector
- [x] `list_tables` confirms `PartsTechCart` gone from production — confirmed via connector (36 tables, was 37)
- [x] Repo-wide grep for `partstech`/`prolink`/`OnlineOrder` returns zero hits outside plan/blueprint docs — confirmed, only the one intentionally-kept line in `buildWorkOrderSavePayload.js` remains

**Remaining before this phase is fully closed out:** the 5 bolded manual-check items above are things only you can verify (live browser interaction, the Electron desktop build, and the OCR upload flow). Everything I can verify programmatically (code, build, deployed functions, database state, repo-wide search) is done and clean.

---

## Appendix: Notes added during execution

- All Section 0 open questions resolved before code execution began (see Section 0 for the resolved list). The DB/dashboard-side cleanup (drop table, unset secret, delete storage object) was done by the user directly, ahead of the code changes below.
- Execution matched the plan exactly — no surprises or deviations found once work started. All 6 file/directory deletions, all 5 `WorkOrderForm.jsx` edits, all 3 `LineItemsTable.jsx` edits, the `Setup.jsx` edit, and the `electron/main.js` edit went in as specified.
- One small addition beyond the original diff: `electron/main.js` had a comment (`// React code can now do: fetch('desktop://api/get-cart-text')...`) documenting the now-removed route — updated it to reflect the protocol handler is currently a no-op scaffold, so it doesn't mislead a future reader.
- Confirmed the `net` import in `electron/main.js` (`import { app, BrowserWindow, session, protocol, net } from 'electron';`) is unused — but this predates this phase's changes (was already unused before any edits here) and is unrelated to PartsTech, so left untouched per out-of-scope boundaries.
- Forward-looking note for whenever the "Quoted (Not Ordered)" badge gets its future implementation: user's direction is to key it off a `qtyquoted` value in the line item's JSON instead of the current `not_ordered` boolean. Not built in this phase.
- **Open item carried forward, not part of this phase:** `Google-Contacts-Sync` edge function (confirmed still live in production, visible via `list_edge_functions`) is unrelated to PartsTech but was spotted again during this phase's verification pass — still not tracked in the local repo, still tied to the hardcoded-JWT trigger finding from Phase 1. Remains an unscoped item in `master_blueprint.md` Section 0.
- Next step once the 5 manual-check items are confirmed: roll this phase's lessons back into `master_blueprint.md` Section 7 and mark Phase 2's status there as complete.
