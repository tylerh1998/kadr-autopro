# Implementation Plan: Supplier Statement Reconciliation (ReconcileSupplier OCR Feature)

**Status:** Pending your approval — no code changes made yet.
**Parent initiative:** None (standalone feature) — sibling to the existing `InventoryAdd`/`WOAddInventory` OCR integrations, reusing their established patterns (Gemini-vision OCR via a dedicated `autopro-*` Edge Function, `PartsInvoiceOCRModal`-style upload UX) but applied to AP statement reconciliation instead of parts receiving.
**Supabase project refs:** dev branch `sitihbdnuxifwibontcm` (verify all changes here first, per standing project convention); production `hbcrwkmgsazqrvsrmxyr` (deploy second, after dev verification). Schema facts below were read from production (`hbcrwkmgsazqrvsrmxyr`) on 2026-08-08 — re-verify against dev before Phase A executes, since "schema replayed to production ≠ data replayed" per `master_context.md` §3.

> **LIVE DOCUMENT.** This is the single rotating plan for this feature — update it in place as each phase executes/verifies. Don't wipe prior sections; append/annotate. When a phase finishes, flip its status header and roll its `Working Area` content into `Previously Completed`, then promote the next phase into `Working Area`.

---

## 1) Context & Lessons Learned

**Core goal:** Give AP staff a way to reconcile a supplier-issued statement (a PDF/image listing outstanding invoices, usually Date / Invoice # / Amount) against AutoPro's own unpaid `SupplierInvoiceLine` records for that supplier — surfacing three buckets (invoices AutoPro doesn't know about, invoices AutoPro has that the statement doesn't show, and invoices both sides agree on) so the user can catch missing/duplicate/misposted invoices before they age. The **only persistent write** this feature performs is optionally pushing the dollar total of user-selected "Matched" invoices into `CashFlowEntry` (the AP planning sheet) — it does **not** touch `SupplierInvoiceLine.paid_amount`, does not mark anything "reconciled" in the DB, and does not create/edit invoice lines. This is deliberately a read-only comparison tool with one narrow write path, not a bookkeeping reconciliation that changes ledger state — confirmed against the user's spec, which never mentions persisting a "reconciled" flag.

**Research already performed (2026-08-08), confirmed by direct file/schema reads, not assumption:**

- **The existing OCR pattern (`InventoryAdd.jsx` + `PartsInvoiceOCRModal.jsx` + `autopro-processPartsInvoiceOCR`)** is a pure Gemini-vision prefill with zero DB writes of its own — the modal uploads the file to the `kadr-digital_invoice_uploads` storage bucket (`temp/` prefix), calls the Edge Function via a raw `fetch` (not `supabase.functions.invoke`, to dodge a stale-404/proxy-cache issue the original author hit), and returns parsed JSON to the caller for the caller to decide what to do with. **This feature reuses the same upload-to-storage + raw-fetch pattern**, not `supabase.functions.invoke`.
- **`autopro-processPartsInvoiceOCR`'s prompt is tailored for itemized parts invoices** (extracts `items[]` with part numbers, core charges, enviro fees) — wrong extraction target for a supplier *statement*, which is normally a flat ledger of Date/Invoice#/Amount rows (sometimes also showing payment/credit rows that must be excluded, and no line-item/parts detail at all). **A new, separate Edge Function is needed** (`autopro-processSupplierStatementOCR`) with a purpose-built prompt — not a repurposed call to the parts-invoice function. This mirrors how `documentContext: 'wo_parts'` already exists as a prompt-variant switch inside the parts function for a different-but-related document shape; a statement is different enough (no items, must actively exclude payment/credit rows, may have a running-balance column to ignore) to warrant its own function rather than a third prompt branch bolted onto an already-dual-purpose function.
- **`SupplierInvoiceLine` schema (confirmed live, production):** `id` (text), `supplier_id` (text), `invoice_number` (text), `invoice_date` (text, `YYYY-MM-DD`), `description` (text), `purchase_amount` (double precision), `gst_amount` (numeric), `paid_amount` (numeric, nullable), `gl_account` (bigint), `gst_override`/`inventory`/`inventory_credit` (boolean), `inventory_item_id` (text), plus standard audit columns. **No `subtotal` column** — `purchase_amount` *is* the subtotal/charge amount, matching how `SupplierTx.jsx` already treats it (`charge` ⇄ `purchase_amount`).
- **The conceptual-invoice grouping algorithm is already centralized in the `get_supplier_transactions_optimized` Postgres function** (confirmed via `pg_get_functiondef`): group `SupplierInvoiceLine` by `(supplier_id, invoice_number, invoice_date)`, `charge = ROUND(purchase_amount, 2)`, `gst = ROUND(gst_amount, 2)`, `line_total = charge + gst`, invoice-level `subtotal`/`tax_amount`/`total_amount`/`amount_paid`/`balance_due` are `SUM()`s of the line-level fields, `balance_due = SUM(line_total - paid_amount)`. **This plan's new read RPC re-uses the identical grouping shape** (same field names) so the "Not On Statement" / "Matched" groups render through the same visual pattern as `SupplierTxInvoiceSummaryTab.jsx` without translation.
- **The "same logic the supplier payment modal does" instruction from the spec is now a concretely identified pattern, not a vague reference.** `SupplierPaymentModal.jsx` already has a "Next: Add to Cash Flow" button (`bg-amber-500 hover:bg-amber-600` — i.e. the "yellow button" the spec calls for) that opens `AddToSheetModal.jsx` with `initialValues={{ supplierName, supplierId, amount: totalSelectedAmount.toFixed(2), dueDate: endOfMonth(new Date()) }}`. `AddToSheetModal` itself just inserts one `CashFlowEntry` row (`id` = 24-char-hex, `supplier`, `supplier_id`, `amount`, `due_date`, `amount_paid: 0`). **This plan reuses `AddToSheetModal` unmodified**, computing `amount` as the sum of the user's checkbox-selected "Matched" invoices instead of `SupplierPaymentModal`'s selected-invoices-to-pay sum — same component, same insert shape, different source selection.
- **`CashFlowEntry` schema (confirmed live):** `id`, `supplier_id`, `loc_id`, `supplier`, `amount` (double precision), `amount_paid` (double precision), `due_date` (text), `date_paid`, `chq_number`, `method`, `comment`, `bg_colour`, `row_status`, `sort_order` (bigint), audit columns. No `source_invoice_ids` or similar traceability column exists — pushing "Matched" invoices to the cash flow sheet creates one **lump-sum** `CashFlowEntry` row (matching exactly how `SupplierPaymentModal`'s existing flow already works — it's a single amount/due-date entry, not one row per invoice). Flagging this now so it isn't assumed to work differently.
- **Supplier locking is the weaker single-column pattern** (`Supplier.LockedByUser`, text, no timestamp/staleness/flush — see `master_context.md` §3). `SupplierTx.jsx` acquires the lock on mount (`autopro-acquireSupplierLock`) and releases it on back-navigation/unmount/`beforeunload`. **`ReconcileSupplier.jsx` will NOT acquire its own lock** — it's read-only except for the single `CashFlowEntry` insert (which doesn't touch `Supplier`/`SupplierInvoiceLine` and needs no lock), and the spec explicitly says the new Reconcile button "WILL clear the supplier lock" when navigating away from `SupplierTx.jsx`, confirming the intent is "leave edit mode entirely," not "carry the lock into a second page."
- **The header button row being modified** (`SupplierTx.jsx` line ~1053) currently reads: `[Back] [Supplier name card] ... [Print] [Edit Supplier] [Save All Changes] [Make Payment]`. Per spec: the supplier-name card becomes a clickable button that opens the existing `showEditSupplierModal` (currently opened by the "Edit Supplier" button, which is being removed), and a new "Reconcile" button takes the vacated slot, styled distinctly (OCR-themed icon) from the four existing buttons' color scheme (blue/white/slate/green already taken — proposing `indigo`/`purple` for visual distinctness, open to adjustment).
- **Matching design — confirmed with user (2026-08-08), overriding this plan's original proposal:** the primary and only match key is **invoice total** (the actual `total_amount`, i.e. `charge + gst` — explicitly *not* `balance_due`/amount-owing, since every candidate row here is already unpaid so the two are normally equal anyway, but `total_amount` is the semantically correct field). Rationale in the user's own words: *"Invoice Total is the primary key (not owing, but the actual total). If this is wrong, the invoice is wrong. I care less about the date and invoice # than this."* Concretely: a statement entry and an AutoPro conceptual invoice are a match if their rounded-to-cent totals are equal — **full stop, no invoice-number or date requirement to qualify as "Matched."** Invoice number and date are demoted to **tie-break / display-only** signals:
  - **Tie-break (multiple same-total candidates):** when a statement total matches more than one still-unmatched AutoPro invoice (or vice versa), prefer the candidate whose *normalized* `invoice_number` (trim/uppercase/strip-non-alphanumeric, same technique the existing OCR prompt already applies to part numbers) also matches; if still tied, prefer the closest `invoice_date`; if still tied, take the first remaining candidate in list order. Matching is greedy one-to-one — once a candidate is consumed by a match, it's removed from the pool.
  - **Date-mismatch UI flag:** per the user's explicit follow-up — *"We will add logic to the UI for invoices that don't have a matching date"* — every matched pair whose `invoice_date`s don't agree exactly gets a visible "date mismatch" badge/highlight in the "Matched" section (both dates shown side-by-side so the user can eyeball whether it's a real problem or just a posting-date-vs-statement-date difference). This is informational only; it does not move the row out of "Matched."
  - Anything left over after all total-based matches are made falls into "Not In AutoPro" (statement rows with no AutoPro invoice sharing that total) or "Not On Statement" (AutoPro invoices with no statement row sharing that total).
- **Filter design decision — confirmed with user:** "excludes any records that have no subtotal or gst" means exclude a `SupplierInvoiceLine` row only if **both** `purchase_amount` and `gst_amount` are null/zero (keep a row if *either* field is nonzero) — matches the existing blank-line-detection idiom already used elsewhere in `SupplierTx.jsx` (`ensureEmptyLine`'s "is this line meaningful" check). Combined with "null or empty amount paid" → `paid_amount IS NULL OR paid_amount = 0`.

**Inherited standing rules (from `master_context.md`, applicable here):**
- New Edge Functions are named `autopro-[functionname]` — this plan introduces `autopro-getSupplierReconcileInvoices` and `autopro-processSupplierStatementOCR`.
- Edge Functions return HTTP 200 with `{ error }` on failure, never a raw 4xx/5xx.
- Every native insert into a legacy-origin table needs a client-generated id (`CashFlowEntry.id` is already handled identically by the existing `AddToSheetModal`, which this plan reuses unmodified — no new id-generation code needed).
- `FiscalPeriod` gating applies to writes that *move money* — the single `CashFlowEntry` insert this feature performs is a planning-sheet entry, not a GL posting, and `AddToSheetModal`'s existing code has no fiscal-period check today; this plan does not add one, for consistency with the code path being reused.
- I do not commit or push git changes — you do that via GitHub Desktop, per your standing preference.

---

## 2) Previously Completed

*(Historical context — capabilities this feature builds on top of, already live and tested elsewhere in the app.)*

- OCR-assisted parts receiving (`InventoryAdd.jsx` + `PartsInvoiceOCRModal.jsx` + `autopro-processPartsInvoiceOCR`) — Gemini-vision extraction of itemized invoices, zero DB writes on the OCR call itself.
- OCR-assisted WO parts ordering (`WOAddInventoryModal.jsx`) — same underlying OCR function, `documentContext: 'wo_parts'` prompt variant for screenshot-style online-cart documents.
- Supplier transaction workspace (`SupplierTx.jsx` + RPC `get_supplier_transactions_optimized`) — conceptual-invoice grouping, GL-account editing, save/lock lifecycle. This plan's new read RPC mirrors its grouping shape but does not modify it.
- `SupplierPaymentModal.jsx` + `AddToSheetModal.jsx` — invoice selection → cash-flow-sheet push pattern, reused as-is by this plan.
- Supplier locking (`autopro-acquireSupplierLock`/`autopro-releaseSupplierLock`, `SupplierLockContext.jsx`) — single-column weak-lock pattern, referenced but not modified.

---

## 3) Risk Assessment

| # | Risk | Phase(s) | Impact | Likelihood | Mitigation |
|---|---|---|---|---|---|
| 1 | OCR misreads a statement amount, causing a real unpaid invoice to be silently bucketed as "Matched" against the wrong AutoPro invoice (false positive) — a real risk since matching is now driven by amount equality alone, and two unrelated invoices could coincidentally share a total (e.g. two identical-cost parts orders) | A, B | Medium | Medium — statement print quality varies, and amount-only matching has no independent cross-check | Date-mismatch badge (§1) surfaces disagreement on matched pairs instead of hiding it; nothing is written back to `SupplierInvoiceLine` on a match, so a false-positive match has zero data-corruption blast radius — worst case is a confusing UI grouping, not a wrong ledger entry. A coincidental-same-total false match would still show a date-mismatch badge in most real cases (two genuinely different invoices rarely share both total and date), giving the user a visual cue to check it. |
| 2 | New read RPC (`autopro-getSupplierReconcileInvoices`) duplicates the existing `get_supplier_transactions_optimized` grouping logic with a subtle discrepancy (e.g. rounding difference), causing this page's totals to disagree with `SupplierTx.jsx`'s own totals for the same supplier | A | Low | Low–Medium | Copy the exact `ROUND(..., 2)` / grouping SQL shape from the existing function (documented verbatim in §1) rather than re-deriving it; spot-check one supplier's total on both pages after Phase A deploys. |
| 3 | Pushing "Matched" invoices to `CashFlowEntry` as a single lump-sum row (no per-invoice traceability column exists) creates a planning-sheet entry that's hard to reconcile later if the user partially edits it | D | Low | Low — this is existing, accepted behavior (`SupplierPaymentModal`'s "Add to Cash Flow" already works this way) | No mitigation needed beyond what already exists — this plan intentionally matches existing behavior rather than introducing new schema. Flagged in §1 so it isn't assumed to be a new limitation this plan introduces. |
| 4 | Gemini API cost/latency on large multi-page statements (a full year of activity could be 5+ pages) | A | Low | Low–Medium | Same model/config already used by `autopro-processPartsInvoiceOCR` (`gemini-flash-latest`, `temperature: 0.1`); no new capacity concern since this is the same call shape, just a different prompt and no `items[]` array to generate (statement extraction is actually a *lighter* payload than parts extraction). |
| 5 | Removing the "Edit Supplier" button and making the name card clickable is missed by a user's muscle memory, or the new "Reconcile" button is confused for a payment/save action | C | Low | Low | OCR-themed icon (e.g. `ScanLine`) + a color not already used by the other 4 header buttons, per §1; this is a UI-polish risk, not a data risk. |
| 6 | `ReconcileSupplier.jsx` is reached with a `supplierId` for a supplier currently locked by another user (mid-edit on `SupplierTx.jsx` in another tab/session) — should reconciliation still be allowed since it's read-only? | C, B | Low | Low | Since this page acquires no lock and performs no `SupplierInvoiceLine` writes, it is safe to allow access regardless of another user's edit lock — the only write (`CashFlowEntry` insert) doesn't touch locked resources. Documented here so it isn't "fixed" later as a perceived bug. |

---

## 4) Time Estimate

Autonomous execution pace (no back-and-forth waiting on manual DB clicks — Edge Function deploys and SQL changes go through the Supabase MCP tools directly):

- **Phase A** (2 new Edge Functions + dev-branch deploy/verify): ~35–45 min
- **Phase B** (matching logic + `ReconcileSupplier.jsx` page shell + 3 group-list components): ~50–70 min
- **Phase C** (`SupplierTx.jsx` header changes): ~15–20 min
- **Phase D** (Cash Flow push wiring + back-navigation): ~15–20 min
- **Cross-phase live verification in browser** (per §6, after each phase): ~10–15 min per phase

**Total: roughly 2.5–3.5 hours of autonomous work**, spread across the 4 phases below. Phase A must complete and be verified on the dev Supabase branch before Phase B can be meaningfully tested end-to-end (Phase B's UI has nothing to call until Phase A's functions exist).

---

## 5) Roadmap & Progress

### Phase A — Backend: Reconcile read RPC + Statement OCR function `[Executed]`

**Execution note (2026-08-08):** Deployed to the dev Supabase branch (`sitihbdnuxifwibontcm`) per your explicit direction — the dev branch's `MIGRATIONS_FAILED`/stale-schema state (flagged before this phase started) does not block this feature, since the tables it depends on (`SupplierInvoiceLine`, `Supplier`, `CashFlowEntry`) already existed there. `get_supplier_reconcile_invoices` was applied via `apply_migration` and curl-verified directly against a real supplier (Automotive Parts Distributors, 12 conceptual invoices returned, one legitimate $0.00-net invoice from an offsetting reversal pair — expected given the literal per-line blank filter, not a bug). Both Edge Functions deployed with `verify_jwt: false`, matching the existing `autopro-processPartsInvoiceOCR`/`autopro-getSupplierTransactions` convention. `autopro-processSupplierStatementOCR`'s Gemini prompt has not yet been tested against a real statement PDF (no sample document available in this session) — first real-document test happens in Phase B's browser verification below.

**Files/functions impacted:**
- New: `supabase/functions/autopro-getSupplierReconcileInvoices/index.ts`
- New: `supabase/functions/autopro-processSupplierStatementOCR/index.ts`
- New (via `apply_migration`): Postgres function `get_supplier_reconcile_invoices(p_supplier_id text)` (or inline SQL in the Edge Function — decided in Working Area once this phase is current)

**TL;DR:** Two new backend pieces: (1) a read-only endpoint that returns the supplier's outstanding (unpaid, non-blank) invoice lines pre-grouped into conceptual invoices, and (2) a Gemini-vision OCR endpoint tailored to extract a flat list of `{invoice_number, invoice_date, amount}` charge rows from a statement document (explicitly excluding payment/credit/balance rows).

**In-depth description:** `autopro-getSupplierReconcileInvoices` takes `{ supplierId }`, queries `SupplierInvoiceLine` for that supplier filtered to `(paid_amount IS NULL OR paid_amount = 0)` AND NOT `((purchase_amount IS NULL OR purchase_amount = 0) AND (gst_amount IS NULL OR gst_amount = 0))`, groups by `(invoice_number, invoice_date)` using the same `ROUND(...,2)` shape as `get_supplier_transactions_optimized`, and returns `{ success: true, data: { conceptualInvoices: [...] } }`. `autopro-processSupplierStatementOCR` follows the exact upload/download/Gemini-call skeleton of `autopro-processPartsInvoiceOCR` (same storage bucket, same `encodeBase64`/`GEMINI_API_KEY` plumbing) but with a new prompt that returns `{ invoices: [{ invoice_number, invoice_date, amount }] }` (no `items[]`), with explicit instructions to skip payment/credit/running-balance rows and to apply the same non-alphanumeric-stripping normalization to `invoice_number` that the existing prompt already applies to part numbers.

---

### Phase B — Matching logic + `ReconcileSupplier.jsx` page `[Executed]`

**Execution note (2026-08-08):** Built as planned, with two small deliberate additions pulled forward from Phase D for testability during the A–C-only execution window (per your instruction to test before wiring cash flow): (1) `ReconcileSupplier.jsx`'s header includes a working **Back** button (`navigate` to `SupplierTx?id=`) — trivial, no cash-flow dependency, needed so testers can actually leave the page; (2) the "Matched" section's checkboxes/`selectedMatchedKeys` selection state are wired up in the page (so the UI is fully interactive), but the "Add to Cash Flow" button itself and `AddToSheetModal` integration are intentionally **not yet added** — that remains Phase D as planned. `pages.config.js` was hand-edited (import + registry entry, alphabetically placed) rather than relying on the `@base44/vite-plugin` codegen, since this session has no way to run a full `vite dev`/`build` cycle against the auth-gated deployment; the next real build will regenerate the same entries from `ReconcileSupplier.jsx`'s presence in `src/pages/`, so this is not a conflict.

**Files/functions impacted:**
- New: `src/pages/ReconcileSupplier.jsx`
- New: `src/components/suppliers/StatementUploadCard.jsx` (upload/clear + submit, wraps the OCR call)
- New: `src/components/suppliers/ReconcileInvoiceGroup.jsx` (read-only, optionally-selectable accordion list — the shared renderer for all 3 result buckets, styled after `SupplierTxInvoiceSummaryTab.jsx` but stripped of all the editing handlers)
- New: `src/lib/reconcileMatching.js` (pure matching function, unit-testable in isolation from React)
- Modified: `src/pages.config.js` (auto-registers `ReconcileSupplier` once the page file exists — per its own header comment, no manual edit needed, but verify the entry appears after first `dev` run)

**TL;DR:** The actual reconciliation page — upload a statement, submit, see three titled sections (Not In AutoPro / Not On Statement / Matched) each with a running dollar total, powered by a pure client-side matching function so the matching logic itself is easy to test independently of the UI.

**In-depth description:** On mount, `ReconcileSupplier.jsx` reads `?id=` from the URL (same pattern as `SupplierTx.jsx`), loads the supplier record (name for header) and calls `autopro-getSupplierReconcileInvoices` to populate the "AutoPro side" once, up front (not gated behind the statement upload — so the user can see how many outstanding invoices exist even before uploading anything). `StatementUploadCard` handles file select/clear and a "Reconcile" submit button that uploads to storage, calls `autopro-processSupplierStatementOCR`, and hands the returned `invoices[]` to `reconcileMatching.js`'s `matchStatementToAutoPro(statementInvoices, autoproConceptualInvoices)`. Per the confirmed matching design in §1, this function does a **greedy one-to-one match keyed on rounded-to-cent `total_amount` equality only** — no invoice-number or date requirement to qualify as a match — with normalized-invoice-number agreement, then closest date, used purely as a tie-break when multiple candidates on either side share the same total. It returns `{ notInAutoPro, notOnStatement, matched }`, where each entry in `matched` carries both sides' records plus a computed `dateMismatch: boolean` (their `invoice_date`s don't agree exactly) for the UI to badge. Each bucket renders through `ReconcileInvoiceGroup`, which is `SupplierTxInvoiceSummaryTab`'s accordion visual pattern minus every editable-field handler (no `handleLineChange`/`handleGlAccountChange`/etc.) plus an optional `selectable` prop (only `true` for the "Matched" section) that renders a checkbox per invoice and tracks a `selectedKeys` Set lifted up to the page, and (for "Matched" only) a date-mismatch badge per §1 when `dateMismatch` is true.

---

### Phase C — `SupplierTx.jsx` header changes `[Executed]`

**Execution note (2026-08-08):** Built as planned — supplier-name card is now a `<button>` opening the edit modal (same `showEditSupplierModal` handler as before); "Edit Supplier" button removed; new "Reconcile" button (`ScanLine` icon, `bg-indigo-600`) added in its place, calling `handleOpenReconcile` (same unsaved-changes-confirm shape as `handleBackNavigation`, releases the lock, then navigates to `ReconcileSupplier?id=`). ESLint and a project-wide `tsc` pass were both run — ESLint is clean on every touched/new file; the `tsc` pass surfaces the same "children prop not on IntrinsicAttributes" class of error already present project-wide across many pre-existing files (e.g. `WorkPROView.jsx`), confirming it's baseline noise from this codebase's loose shadcn/JS typing setup, not something introduced here.
**Not yet done:** Phase D (Cash Flow push + "Add to Cash Flow" button) — deferred per your instruction to test A–C first.

**Files/functions impacted:**
- Modified: `src/pages/SupplierTx.jsx` (header button row, ~line 1053)

**TL;DR:** Supplier name becomes a clickable "Edit Supplier" trigger; the button slot it used to share is replaced by a new "Reconcile" button that clears the lock and navigates to `ReconcileSupplier.jsx`.

**In-depth description:** The `<div>` currently wrapping `supplier?.name` (line ~1053) becomes a `<button>` (or gets an `onClick`/`role="button"`/keyboard handler added, preserving its current visual styling) calling `setShowEditSupplierModal(true)` — same handler the old "Edit Supplier" button already called, so `handleSupplierUpdate`/the modal itself need zero changes. The `<Button>` with the `Edit` icon and "Edit Supplier" label is removed and replaced with a new button (`ScanLine` icon, "Reconcile" label, distinct color) whose `onClick` releases the lock (`if (lockAcquired && supplierId && currentUser) await releaseLock(currentUser)` — same guarded call `handleBackNavigation`'s `leavePage` already uses) then `navigate(createPageUrl(\`ReconcileSupplier?id=${supplierId}\`))`. Unsaved-changes confirmation follows the same pattern as `handleBackNavigation` (prompt to save/discard before leaving) since navigating away is equivalent to a back-navigation for lock/dirty-state purposes.

---

### Phase D — Cash Flow push + back-navigation `[Pending]`

**Files/functions impacted:**
- Modified: `src/pages/ReconcileSupplier.jsx` (header bar: back button, "Add to Cash Flow" button, `AddToSheetModal` wiring)

**TL;DR:** Header gets a back button returning to `SupplierTx.jsx` for the same supplier, and a yellow "Add to Cash Flow" button that opens the existing `AddToSheetModal` pre-filled with the sum of checkbox-selected "Matched" invoices.

**In-depth description:** Back button (`ArrowLeft`, same `bg-slate-900` styling as `SupplierTx.jsx`'s own back button) calls `navigate(createPageUrl(\`SupplierTx?id=${supplierId}\`))` — no lock re-acquisition concerns since `ReconcileSupplier.jsx` never held one. The "Add to Cash Flow" button (`bg-amber-500 hover:bg-amber-600`, matching `SupplierPaymentModal.jsx`'s existing button exactly) is disabled until at least one "Matched" invoice is checkbox-selected; on click it opens `AddToSheetModal` with `initialValues={{ supplierName: supplier?.name, supplierId: supplier?.id, amount: (sum of selected matched invoices' total_amount).toFixed(2), dueDate: format(endOfMonth(new Date()), 'yyyy-MM-dd') }}` — identical shape to `SupplierPaymentModal.jsx`'s existing call, confirming the "same logic" requirement from the spec is met by literal reuse, not a re-implementation.

---

## 6) Verification Plan

**Phase A:** No UI yet — verify via direct Edge Function invocation (curl or the Supabase dashboard's function test panel) against a real supplier on the dev branch: (1) call `autopro-getSupplierReconcileInvoices` with a known `supplierId` that has unpaid invoice lines and confirm the returned `conceptualInvoices[]` total matches what `SupplierTx.jsx` already shows for that supplier's outstanding balance; (2) upload a real (or representative test) supplier statement PDF to `autopro-processSupplierStatementOCR` and manually confirm the returned `invoices[]` array's invoice numbers/dates/amounts match what's visually on the statement, and that payment/credit rows were correctly excluded.

**Phase B:** In the browser, navigate directly to `ReconcileSupplier?id=<a real supplier id>` (page won't be linked from the UI yet until Phase C). Confirm: the supplier name loads in the header; the "Not On Statement" section populates immediately with that supplier's outstanding invoices (matches `SupplierTx.jsx`'s invoice-summary tab for the same supplier, filtered to unpaid); upload a real statement PDF via `StatementUploadCard` and click Reconcile; confirm invoices redistribute correctly across "Matched" (total-amount agreement) and "Not In AutoPro" (statement-only); manually pick one invoice on the statement whose posted date differs from AutoPro's record (or temporarily edit a test row) and confirm its "Matched" row shows the date-mismatch badge; confirm each section's header total sums correctly; expand an accordion row in each section and confirm line-level detail renders (for AutoPro-sourced groups) without any editable fields.

**Phase C:** On `SupplierTx.jsx` for a real supplier: click the supplier name card and confirm the Edit Supplier modal opens (identical to today's "Edit Supplier" button behavior); confirm the old "Edit Supplier" button is gone; click the new "Reconcile" button and confirm (a) the browser navigates to `ReconcileSupplier?id=<supplierId>`, (b) reloading `SupplierTx.jsx` for that same supplier afterward shows the lock as available (not still held) — confirming the lock was actually released, not just visually left behind.

**Phase D:** On `ReconcileSupplier.jsx` after a successful reconcile: click the back button and confirm it lands on `SupplierTx.jsx` for the same supplier with no lock-acquisition error. Select one or more "Matched" invoices, click "Add to Cash Flow", fill in/confirm the pre-filled amount in `AddToSheetModal`, submit, then navigate to `CashFlow.jsx` and confirm a new row appears with the correct supplier/amount/due-date.

---

## 7) Working Area (Current Phase): Phase D — Cash Flow push + back-navigation `[Pending]`

Phases A, B, and C are executed (see their sections above) and ready for your manual testing per §6's Phase A/B/C verification steps. Phase D is next once you're satisfied with A–C:

**Exact scope (unchanged from the original Phase D description in §5):** `ReconcileSupplier.jsx` already has `selectedMatchedKeys` (a `Set` of matched-invoice keys) and the checkbox UI wired up — Phase D only needs to add:
1. Import `AddToSheetModal` from `../components/suppliers/AddToSheetModal`.
2. A `showAddToSheetModal` boolean state.
3. A yellow "Add to Cash Flow" button in the header (`bg-amber-500 hover:bg-amber-600`, matching `SupplierPaymentModal.jsx`'s existing button exactly), disabled when `selectedMatchedKeys.size === 0`.
4. Compute the selected total: `matchedItems.filter(item => selectedMatchedKeys.has(item.key)).reduce((sum, item) => sum + (parseFloat(item.total_amount) || 0), 0)`.
5. Render `<AddToSheetModal open={showAddToSheetModal} onClose={...} initialValues={{ supplierName: supplier?.name, supplierId: supplier?.id, amount: selectedTotal.toFixed(2), dueDate: format(endOfMonth(new Date()), 'yyyy-MM-dd') }} onSuccess={...} />` — needs `endOfMonth` added to the existing `date-fns` import.

No backend changes needed — `AddToSheetModal` already exists and its `CashFlowEntry` insert shape needs no modification.
