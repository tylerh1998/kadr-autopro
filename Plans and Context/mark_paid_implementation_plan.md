# Implementation Plan: Lock Reconciled Transactions (LOC + Suppliers)

## 1. Context & Lessons Learned

**Core goal:** Stop "the totals never add up" when marking Lines-of-Credit (and Supplier) payments as paid. Original workflow: reconcile a statement → check off the charges/invoices it covers → "Add to Cash Flow" → weeks later, reopen "Make Payment" to actually pay it → check off the same items again from memory → submit. Root cause: nothing stops the underlying charges/invoices from changing (or being deleted) between those two steps, and nothing remembers which ones were reconciled, so drift silently breaks the total.

**Rescoped approach (superseding the first draft of this plan):** instead of just recording which items were checked and trying to intelligently "resume" a stale selection, **make it structurally impossible for a reconciled-but-unpaid item to change at all.** The moment an item is checked and sent to "Add to Cash Flow," lock it — reject any edit or delete attempt on it, server-side — until either the payment actually happens (superseded by a real payment amount) or the cash-sheet entry is removed (releases the lock automatically). This is simpler than the original resume/rebuild-selection design, and it eliminates the "did something change since I reconciled" question entirely rather than trying to detect and warn about it after the fact.

**Bundled fix (user-approved 2026-08-30):** while touching this exact code path, also close a more severe, unrelated gap found during investigation: `autopro-processLineOfCreditTransaction` (LOC charge edit/delete) has **zero protection today** against editing or deleting a transaction that already has a real payment applied (`payment_amount != 0`) — it will delete the row and its GL entries with no check at all. The supplier side is partially better (`autopro-saveSupplierInvoiceTransactions` already skips *deleting* a line with nonzero `paid_amount`, but does not guard *edits* to one). Both gaps are closed alongside the new pending-payment lock, since the enforcement code lives in the same functions either way.

**Lessons learned during investigation:**
- **`AddToSheetModal.jsx` (`src/components/suppliers/AddToSheetModal.jsx`) is one shared component with 4 importers**: [`LineOfCreditPaymentModal.jsx`](../src/components/lines-of-credit/LineOfCreditPaymentModal.jsx), [`SupplierPaymentModal.jsx`](../src/components/suppliers/SupplierPaymentModal.jsx), [`ReconcileSupplier.jsx`](../src/pages/ReconcileSupplier.jsx), and [`APSummaryTable.jsx`](../src/components/suppliers/APSummaryTable.jsx). Any change to it affects all four flows — treat it as one shared surface.
- **Two existing "lock" concepts in this codebase are the wrong tool for this job, don't reuse them:** `LinesOfCredit`/`BankAccount`'s two-column CAS lock (`locked_by_user`/`locked_timestamp`) and `Supplier`'s weaker single-column lock (`LockedByUser`) are both *session/concurrency* locks on an entire account/supplier record — "someone has this open right now," released when the modal closes. What we need here is a *persistent, per-row, business-state* lock on one transaction/invoice line, unrelated to who's currently editing. Reusing the Supplier lock, for example, would block editing every *other* invoice for that supplier just because one line is queued — too broad.
- **Suppliers already have exactly the right integration point.** `SupplierTx.jsx` has a single centralized `isLineLocked(line)` helper (line 111-113, currently just `paid_amount !== 0`) that gates all 9 places a line can be touched — inline cell edits, date edits, GST-override toggling, save-all, the edit-click handler, and the delete-click handler. Extending this one function is enough to protect every one of those call sites at once. **LOC has no equivalent** — the ledger table inlines its own edit-guard condition directly (`LinesOfCredit.jsx` line 742), and the transaction modal's Delete button (`LineOfCreditTransactionModal.jsx` line 450) has **no client-side guard at all** today. Part of this plan is introducing an equivalent small helper for LOC.
- **Real payments already resolve "which row" correctly once they execute.** `SupplierPayment.invoice_number` (genuine `jsonb`, never `JSON.parse()` it) already stores `{id, invoice_number, invoice_date, amount_applied}` per applied invoice, via the existing helper `buildAppliedDetailsFromConceptualInvoice` in `SupplierPaymentModal.jsx` (line 129). This plan reuses that same helper to know which real `SupplierInvoiceLine` ids to lock, rather than inventing a second way to resolve "conceptual invoice" → underlying rows.
- `Plans and Context/master_context.md` §4.5 already documents the "no traceability" gap for suppliers as a **deliberate scoping decision at the time** ("intentionally matches existing behavior rather than introducing new schema"). This plan knowingly reverses that trade-off.
- `LinesOfCredit.current_balance` / `available_credit` are stored but **non-authoritative** — out of scope, do not touch, per master_context.md's explicit warning.
- `APSummaryTable.jsx`'s "Add to Cash Flow" context-menu action had **no invoice-level selection at all** (it pushed a coarse aged-bucket amount, `total_balance - not_due`, with no way to know which invoices it represented). **Removed entirely (2026-08-30, user decision)** rather than left as a lesser parallel path — the same row's "Make Payment" action already opens `SupplierPaymentModal`, which has its own proper checkbox-based "Next: Add to Cash Flow" button, so there's no longer a reason to keep a second, cruder entry point. `SupplierPaymentModal`'s `onClose`/`onPaymentComplete` handlers (now unified as `handlePaymentModalClosed` in `APSummaryTable.jsx`) refresh both the AP summary and the cash-flow-entry chips either way, and still forward to the `onCashFlowUpdate` prop the `CashFlow.jsx` page relies on to refresh its own grid.
- There is **no cross-supplier or cross-account batch payment** anywhere in the app (a same-named `BatchPaymentModal.jsx` is a PayPro payroll file, unrelated). Every "Make Payment" flow is scoped to one account/supplier — this plan doesn't need to handle multi-entity batching.
- **A single supplier can legitimately have two (or more) simultaneous pending `CashFlowEntry` rows** (e.g., one month's invoices split into a "Bus Account" batch and a "Shop Account" batch, paid separately) — confirmed as real, ongoing usage 2026-08-30. Nothing in the schema prevents this (locking is per-`SupplierInvoiceLine`, not per-supplier), but Phase 3/4's UI must never merge two different pending entries' locked items into one selection — see Phase 4's "Pay from Cash Flow Sheet" dropdown for the resulting design (one batch active at a time, defaulting to the first, switchable via the dropdown). `CashFlowEntry` has no dedicated "which bank account" field; today this distinction lives entirely in the free-text `comment` field on the cash sheet grid (`CashFlow.jsx`), so the UI must key off whichever `pending_cash_flow_entry_id` a row carries, not any account/method field.

**Execution notes (2026-08-30, all 5 phases implemented in one pass, holding for user testing before commit):**
- The dev Supabase branch's deployed `autopro-saveSupplierInvoiceTransactions` was found to be **already behind the repo** before this work started — missing an unrelated invoice-batching/GL-grouping feature (`conceptual_invoice_id`, imports from `_shared/glBatch.ts`) that exists in the repo source but was never deployed, and whose underlying column doesn't exist on dev at all. Deploying the repo file as-is would have broken every supplier invoice line add/edit on dev with a "column does not exist" error. Instead, the new guards were applied on top of a reconstructed copy of **what's actually live on dev today**, so dev's behavior only changes by the two new guards — the pre-existing drift is untouched and flagged separately for the user (see spawned background task) rather than silently bundled into this change.
- `SupplierPaymentModal.jsx`'s "Pay from Cash Flow Sheet" dropdown and locked-row graying needed a **separate lightweight client-side query** (`SupplierInvoiceLine` select `id, pending_cash_flow_entry_id`) rather than reading the field off the conceptual-invoice data the modal is handed — the two Postgres RPCs backing its callers (`get_ap_summary_data`, `get_supplier_transactions_optimized`) build their JSON with explicit column lists that don't include the new column, and were deliberately left unmodified (they're shared, complex, `SECURITY DEFINER` functions with other callers) rather than expanded as a side effect of this change.
- **`APSummaryTable.jsx`'s "Make Payment" is now the only path to "Add to Cash Flow" from that page (its standalone lump-sum action was removed, see below), but it still can't lock specific rows** — its data source (`get_ap_summary_data`'s 4-arg overload) has no `lines`/`id` array at all for its conceptual invoices, only aggregate per-invoice amounts. Checking specific invoices in that modal and clicking "Next: Add to Cash Flow" is still a real improvement over the old lump-sum action (the user reviews and picks actual invoices instead of an opaque aged-bucket total), but the resulting `CashFlowEntry` won't have anything locked to it, and Make Payment won't be able to pre-select it later, until/unless that RPC is separately extended to expose per-line ids. The locking improvement fully reaches `SupplierTx.jsx`'s "Make Payment" and `ReconcileSupplier.jsx`, which do have real ids available.
- `CashFlow.jsx` already has a working delete action (`handleDeleteRow` → `CashFlowEntry.delete()`), confirming Phase 5's flagged open question — no new "release a lock" UI was needed; deleting the cash-sheet row already does it via the FK's `ON DELETE SET NULL`.
- **What's deployed vs. what's only committed to the working tree:** the migration, the new `add_to_cash_flow_atomic` RPC, and 4 edge functions/RPCs (`autopro-processLineOfCreditTransaction`, a dev-safe variant of `autopro-saveSupplierInvoiceTransactions`, `autopro-processLineOfCreditPayment`, `apply_supplier_invoice_line_paid_updates`) are **live on the dev Supabase branch** (`sitihbdnuxifwibontcm`) already. The **frontend component changes are not deployed anywhere yet** — they exist only as uncommitted edits in this working tree and need a commit + push to `origin/development` (done manually by the user, per standing workflow) before they show up on `test.kensauto.ca`. Production (`hbcrwkmgsazqrvsrmxyr`) was never touched.

## 2. Previously Completed

Nothing has been implemented yet. Completed so far is investigation only: full reads of the LOC flow (`LinesOfCredit.jsx`, `LineOfCreditPaymentModal.jsx`, `AddToSheetModal.jsx`, `autopro-processLineOfCreditTransaction`, the `20260806000000_loc_cashflow_tables.sql` migration) and the supplier flow (`SupplierPaymentModal.jsx`, `ReconcileSupplier.jsx`, `APSummaryTable.jsx`, `SupplierTx.jsx`, `autopro-saveSupplierInvoiceTransactions`), cross-checked against `master_context.md` §4.5. An earlier draft of this plan (jsonb-blob traceability + "resume last selection" approach) was discarded in favor of the row-locking design above after discussion with the user on 2026-08-30.

## 3. Risk Assessment

| # | Risk | Impact | Likelihood | Mitigation |
|---|---|---|---|---|
| 1 | New `pending_cash_flow_entry_id` FK column breaks existing reads/writes on `LinesOfCreditTransaction`/`SupplierInvoiceLine` | Low | Low | Nullable, additive column; `ADD COLUMN IF NOT EXISTS`; no existing code reads it, so nothing can break by its mere existence. |
| 2 | The new atomic RPC (`add_to_cash_flow_atomic`) has a bug that locks the wrong rows or the wrong count | Medium | Low-Medium (new SQL, needs care) | `WHERE pending_cash_flow_entry_id IS NULL` guard in the UPDATE prevents ever double-locking/stealing a lock; test with a mixed batch (some already-locked, some not) before relying on it. |
| 3 | Editing the shared `AddToSheetModal.jsx` regresses one of its 4 call sites | Medium (breaks a live monthly financial workflow) | Medium | New id-array props are optional/additive (default `[]`, behaves exactly as today when omitted); manually re-verify all 4 call sites after Phase 3. |
| 4 | Server-side lock enforcement rejects a legitimate edit the user actually needs to make (e.g., fixing a typo on a reconciled-but-unpaid charge) | Medium (workflow friction) | Medium | The only way out is documented and simple: delete the item from the cash-flow sheet (releases the lock via `ON DELETE SET NULL`), fix it, re-reconcile. No new "unlock" UI is being built — confirm this is acceptable friction before Phase 2 ships (see open question in Phase 5). |
| 5 | LOC's new hard guard (reject edit/delete when `payment_amount != 0`) breaks some existing legitimate workflow that currently relies on editing a partially-paid charge | Medium | Low — no known legitimate use case surfaced during investigation, and the client UI already tries to hide the Edit link in this case (`LinesOfCredit.jsx` line 742) | Server guard merely makes authoritative what the UI already implies is disallowed. Regression-test editing/deleting an unpaid charge still works normally after the change. |
| 6 | `autopro-processLineOfCreditPayment`/`autopro-processSupplierPayment` forget to clear `pending_cash_flow_entry_id` when a payment posts, leaving a fully-paid row permanently "locked" for no reason | Low (cosmetic/confusing, not financially incorrect — the `payment_amount != 0` guard would also block edits at that point regardless) | Medium if missed | Explicit step in Phase 5; verify by paying a locked item and confirming its badge changes from "Pending Payment" to "Paid," not stuck on "Pending Payment." |
| 7 | Cash sheet (`CashFlow.jsx`) may not currently support deleting a `CashFlowEntry` row outright — if so, there is no way to release a lock without a DB console | High if true (dead-end workflow) | Unknown — needs verification early in Phase 5, not assumed | Confirm this first thing in Phase 5; add a delete action to the cash sheet grid if it doesn't already exist, before considering this plan done. |
| 8 | Migration mistakenly applied to the wrong Supabase project (dev vs. prod) | High if prod | Low | Per standing project rule, all work happens on `development` branch / dev Supabase project; production is never touched without an explicit separate ask. |
| 9 | A supplier/LOC with two+ simultaneous pending `CashFlowEntry` rows gets its Make Payment selection silently merged across entries (e.g. bus-account and shop-account batches combined into one payment) | High (exactly the "totals don't add up" failure mode this plan exists to prevent, in a new form) | Medium — confirmed real, recurring usage, not a hypothetical | Phase 4's "Pay from Cash Flow Sheet" dropdown always has exactly one batch active at a time (defaulting to the first) and swaps the checked items wholesale on selection change — the two batches' items can never both be checked simultaneously through that control. Items belonging to a non-active pending entry are shown disabled, never silently included. |

## 4. Time Estimate

Autonomous execution time per phase (not counting your UI verification time between phases):

- Phase 1 (schema + atomic RPC): ~30 min
- Phase 2 (server-side edit/delete guards, both edge functions): ~30–45 min
- Phase 3 (wire "Add to Cash Flow" to actually lock, 4 files): ~60–90 min
- Phase 4 (client-side status badges, disabled controls, Make Payment pre-select): ~60–90 min
- Phase 5 (payment/cancellation handoff, cash-sheet delete verification, full regression): ~45–60 min

**Total: roughly 4–5.5 hours of autonomous execution**, spread across phases with your review in between each.

## 5. Roadmap & Progress

### Phase 1 — Schema: lock column + atomic "add to cash flow" RPC [Executed]

**Files impacted:**
- `supabase/migrations/20260826000000_cashflow_entry_pending_lock.sql` (new)

**TL;DR:** Add a nullable `pending_cash_flow_entry_id` column to both `LinesOfCreditTransaction` and `SupplierInvoiceLine`, real foreign keys to `CashFlowEntry(id)` with `ON DELETE SET NULL` — so deleting a cash-sheet entry automatically releases any locks it holds, with no application code required for that specific case. Add a new atomic RPC that inserts the `CashFlowEntry` row and locks the selected source rows in one transaction.

**Detail:** A plain nullable text column with a real FK (this codebase already has FK precedent: `LinesOfCreditTransaction.line_of_credit_id REFERENCES "LinesOfCredit"(id)`) gives two things for free: (a) the database itself guarantees a lock can never dangle after its owning cash-sheet entry disappears, even if that entry is deleted directly via SQL/dashboard rather than through the app; (b) traceability in the *other* direction — "what does this cash-sheet entry represent" is answered by `SELECT * FROM "LinesOfCreditTransaction" WHERE pending_cash_flow_entry_id = ?`, so no separate jsonb snapshot column is needed on `CashFlowEntry` at all (this supersedes the first draft's `reconciled_items`/`source_type` columns — dropped). The new RPC, `add_to_cash_flow_atomic(p_entry jsonb, p_loc_transaction_ids text[], p_supplier_invoice_line_ids text[])`, mirrors the project's existing convention for atomic multi-row money-adjacent writes (`process_payment_atomic`): it inserts one `CashFlowEntry` row from `p_entry`, then runs `UPDATE "LinesOfCreditTransaction" SET pending_cash_flow_entry_id = <new id> WHERE id = ANY(p_loc_transaction_ids) AND pending_cash_flow_entry_id IS NULL` and the equivalent for `SupplierInvoiceLine`, all inside one transaction, returning the new entry's id. The `IS NULL` guard means it is always safe to pass an already-locked id — it's silently left alone rather than re-locked or stolen, which also means a user can never accidentally double-queue the same charge onto two different reconciliations.

### Phase 2 — Server-side enforcement: reject edit/delete on locked or paid rows [Executed]

**Files impacted:**
- `supabase/functions/autopro-processLineOfCreditTransaction/index.ts`
- `supabase/functions/autopro-saveSupplierInvoiceTransactions/index.ts`

**TL;DR:** Make the lock (and the already-paid state) authoritative server-side, not just a UI suggestion. LOC currently has no server check at all for either condition; suppliers already block deleting a paid line but nothing else.

**Detail:** In `autopro-processLineOfCreditTransaction`, immediately after `existingTx` is fetched (currently line 138) and before either the `action === 'delete'` branch or the edit branch runs, add two checks: reject if `(existingTx.payment_amount || 0) !== 0` ("already has a payment applied," the bundled bonus fix) and reject if `existingTx.pending_cash_flow_entry_id` is set ("queued for payment on the cash flow sheet — remove it there first"). In `autopro-saveSupplierInvoiceTransactions`, extend the existing deletion-phase check (currently line 241-248, which skips deletion when `paid_amount !== 0`) to also skip when `pending_cash_flow_entry_id` is set, using the same "skip with a warning, don't throw" pattern already established there. Separately, the modifications phase (around line 360-480, which currently has **no paid/locked check of any kind**) needs the same two-condition guard added before it applies any GL-relevant field change to a line — today you can edit the amount on an already-paid supplier invoice line with zero resistance, which is exactly the kind of drift this whole effort is meant to eliminate.

### Phase 3 — Wire "Add to Cash Flow" to actually lock the selected rows [Executed]

**Files impacted:**
- `src/components/suppliers/AddToSheetModal.jsx`
- `src/components/lines-of-credit/LineOfCreditPaymentModal.jsx`
- `src/components/suppliers/SupplierPaymentModal.jsx`
- `src/pages/ReconcileSupplier.jsx`

**TL;DR:** Replace `AddToSheetModal`'s plain `CashFlowEntry` insert with a call to the new atomic RPC, and have each caller pass the real underlying row ids of whatever the user actually checked.

**Detail:** `AddToSheetModal.jsx`'s `handleSubmit` (line 34-66) currently does a bare `supabase.from('CashFlowEntry').insert(...)`; swap this for `supabase.rpc('add_to_cash_flow_atomic', {...})`, passing through two new optional array fields read off `initialValues` (`locTransactionIds`, `supplierInvoiceLineIds`), defaulting to `[]` when absent so `APSummaryTable.jsx`'s lump-sum caller needs zero changes and locks nothing, exactly as today. `LineOfCreditPaymentModal.jsx` (line 792-802, where `AddToSheetModal` is rendered) adds `locTransactionIds: outstandingCharges.filter(c => selectedCharges[c.id]).map(c => c.id)` to `initialValues`. `SupplierPaymentModal.jsx` reuses the existing `buildAppliedDetailsFromConceptualInvoice` helper (line 129, already used by the real-payment path at line 587-593) to turn the checked `outstandingInvoices` into real `SupplierInvoiceLine` ids, filtering out any `undefined` id (the helper's own fallback for invoices without a resolvable line-level id). `ReconcileSupplier.jsx` does the same over its selected `matchedItems` (each already carries a `.lines` array from `mapAutoproToItem`, the same shape the helper expects) — this requires moving `buildAppliedDetailsFromConceptualInvoice` out of `SupplierPaymentModal.jsx` into a shared location (e.g. `src/lib/`) since it's currently module-private, so both files resolve "which real row" identically instead of two parallel implementations drifting apart.

**Multi-entry edge case:** a row already carrying a `pending_cash_flow_entry_id` from an *earlier, still-pending* reconciliation (e.g. this month's "Shop Account" batch, while the user is now building the "Bus Account" batch) must not be checkable into a *new* Add to Cash Flow batch at all — the RPC's `WHERE pending_cash_flow_entry_id IS NULL` guard already makes this a safe no-op server-side, but the checkbox should be disabled client-side too, with a small "already on the [comment] batch" label, so the user isn't left wondering why a checked item didn't end up in the new entry's total.



### Phase 4 — Client-side: show the lock, disable controls, pre-select in Make Payment [Executed]

**Files impacted:**
- `src/pages/LinesOfCredit.jsx`
- `src/components/lines-of-credit/LineOfCreditTransactionModal.jsx`
- `src/pages/SupplierTx.jsx`
- `src/components/lines-of-credit/LineOfCreditPaymentModal.jsx`
- `src/components/suppliers/SupplierPaymentModal.jsx`

**TL;DR:** Make the lock visible and self-explanatory in the UI (not just an error toast on attempted edit). Add a "Pay from Cash Flow Sheet" dropdown to both "Make Payment" modals that defaults to the first pending batch's items pre-checked and lets the user switch to a different batch (the confirmed "Bus Account" / "Shop Account" split-batch case) without ever mixing two batches into one selection; the dropdown only appears when there's something to pick and only on the checkbox-selection tab.

**Detail:** For LOC, introduce a small `isLocTransactionLocked(tx)` helper in `LinesOfCredit.jsx` (`(tx.payment_amount||0) !== 0 || !!tx.pending_cash_flow_entry_id`), use it in place of the inline condition at line 742 that currently gates the clickable edit link, and add a distinct "Pending Payment" badge variant in the Status column (line 770-780) for the case `pending_cash_flow_entry_id` set but `payment_amount === 0` (so it reads differently from "Paid," which is `payment_amount` covering the full charge). Pass the transaction's locked state into `LineOfCreditTransactionModal.jsx` and hide/disable its Delete button (line 450) when locked — today that button has no guard at all and would otherwise round-trip to the server just to get rejected by Phase 2's new check. For suppliers, the fix is smaller: extend the single centralized `isLineLocked(line)` helper in `SupplierTx.jsx` (line 111-113) to also return `true` when `line.pending_cash_flow_entry_id` is set — all 9 existing call sites (inline cell edits, date edits, GST-override toggle, save-all skip, edit-click, delete-click) inherit the new protection automatically with no other changes needed there beyond a label/tooltip tweak so "locked because paid" and "locked because pending payment" read differently to the user.

**Make Payment grouping/pre-select — the "Pay from Cash Flow Sheet" dropdown (revised per user feedback 2026-08-30, replaces the earlier chip-row sketch):** in both `LineOfCreditPaymentModal.jsx` and `SupplierPaymentModal.jsx`, fetch the pending `CashFlowEntry` rows for this account/supplier alongside the existing charges/invoices query, and derive the distinct set of `pending_cash_flow_entry_id` values actually present among the outstanding items. Render a single `Select` dropdown (reusing the same `@/components/ui/select` component both modals already import for other pickers) labeled "Pay from Cash Flow Sheet," one option per pending entry, labeled from that entry's `comment`/`due_date`/`amount`. Placement: for suppliers, beside the existing date-range filter button in the `DialogHeader`'s right-aligned flex row (`SupplierPaymentModal.jsx` lines 715-765) — same row, so it reads as a sibling filter/action control; LOC's modal has no equivalent header row today (its `DialogHeader`, lines 518-524, is just a title/description), so this phase adds one there for the dropdown to live in, matching the pattern the supplier modal now establishes. Behavior: defaults to the *first* pending entry (sorted oldest `due_date`/`created_date` first, consistent with how outstanding charges/invoices are already sorted elsewhere) and immediately pre-checks that entry's locked items in the "Pay Specific Charges"/"Pay Specific Invoices" tab — never defaults to nothing selected, even with multiple entries. Opening the dropdown surfaces the other pending entries as selectable options; picking a different one clears the previously-checked batch and checks the newly-selected batch's items instead — the two batches' items are never checked together. Items belonging to a pending entry that isn't currently selected in the dropdown are shown disabled (grayed, not selectable) in the table, since a single payment submission uses one `from_account_id` and mixing two reconciliations meant for two different bank accounts is exactly the bug this plan exists to prevent. The dropdown itself is not rendered at all when there are zero pending entries for this account/supplier, or whenever the "Pay Amount"/"Pay On Account" tab is the active tab (`activeTab !== 'pay_charges'`/`'pay_invoices'`) — batch selection is meaningless there. Items with no `pending_cash_flow_entry_id` at all (nothing reconciled yet) remain freely checkable regardless of which dropdown option is active — the active batch and manually-added open items can still be paid together in one submission.

### Phase 5 — Payment/cancellation handoff, cash-sheet delete path, full verification [Executed]

**Files impacted:**
- `supabase/functions/autopro-processLineOfCreditPayment/index.ts`
- `supabase/functions/autopro-processSupplierPayment/index.ts` (or the `apply_supplier_invoice_line_paid_updates` RPC it calls)
- `src/pages/CashFlow.jsx` / `src/components/.../CashFlowTable.jsx` (only if the verification below finds no existing delete action)

**TL;DR:** Close the loop — clear the lock when a payment actually posts (superseded by the real `payment_amount != 0` guard from Phase 2), confirm there's a way to release a lock by removing the cash-sheet entry before payment, and do a full end-to-end pass across both domains.

**Detail:** When `autopro-processLineOfCreditPayment` applies a payment to a charge (the `payment_amount = currentPayment + charge.amount` update), also set `pending_cash_flow_entry_id = null` in that same write — the row is now genuinely paid (or partially paid), so the soft "pending" lock hands off to the hard "has a payment" guard from Phase 2. Same for the supplier side wherever `paid_amount` gets written. Deliberately **do not** restore the lock in `autopro-cancelLineOfCreditPayment`/`autopro-cancelSupplierPayment` when a payment is reversed — leave the row unlocked, since a cancelled payment needs human re-review anyway, not an automatic re-queue. Before considering this phase done, verify `CashFlow.jsx`'s grid actually has a way to delete a `CashFlowEntry` row outright today (this was not confirmed during investigation) — if it doesn't, the only way to release a lock on an item you've changed your mind about would be a dead end, so add a delete action if missing. Close with a full manual regression pass (see Verification Plan).

## 6. Verification Plan

**Phase 1:** Confirm the migration applied cleanly — `pending_cash_flow_entry_id` exists on both tables, nullable, with a working FK. Call `add_to_cash_flow_atomic` directly (e.g. via the Supabase SQL editor or a quick test invocation) with a small mix of fresh and already-locked ids, and confirm: the `CashFlowEntry` row is created, the fresh ids get locked, the already-locked id is left untouched (not stolen/relocked), and nothing throws.

**Phase 2:** On a test LOC account, attempt to edit and then delete a charge that has a nonzero `payment_amount` (find or create one via a small manual payment) directly through the API/UI — both should now be rejected with a clear message, where before this phase they would have silently succeeded. Manually set `pending_cash_flow_entry_id` on a test charge (via SQL, since Phase 3 doesn't exist yet to set it through the UI) and confirm editing/deleting it is also rejected. Repeat both checks for a `SupplierInvoiceLine`: confirm deleting a paid line is still blocked as before, confirm *editing* a paid line is now newly blocked, and confirm a line with `pending_cash_flow_entry_id` set is blocked from both edit and delete.

**Phase 3:** On the Lines of Credit page, open Make Payment, check 2-3 charges under "Pay Specific Charges," click "Next: Add to Cash Flow," submit — then query `LinesOfCreditTransaction` for those ids and confirm `pending_cash_flow_entry_id` now points at the new `CashFlowEntry` row. Repeat for a supplier via `SupplierPaymentModal.jsx`'s "Pay Specific Invoices" tab, and again via `ReconcileSupplier.jsx`'s "Matched" bucket — confirm both populate real `SupplierInvoiceLine` ids. Confirm `APSummaryTable.jsx`'s lump-sum "Add to Cash Flow" still works exactly as before and locks nothing.

**Phase 4:** Reopen the LOC ledger for an account with a locked (pending-payment) charge — confirm it shows a "Pending Payment" badge distinct from "Paid"/"Unpaid," the description is no longer a clickable edit link, and opening any way to delete it is blocked or hidden. Reopen "Make Payment" for that account and confirm the locked charge is already checked with no manual re-selection needed. Repeat the same three checks on the supplier side (`SupplierTx.jsx`'s invoice-line table and `SupplierPaymentModal.jsx`). Then specifically test the multi-entry case: for one supplier, create two separate pending cash-sheet entries against two disjoint sets of invoices (labeling their `comment` fields "Bus Account" and "Shop Account" as in real usage), reopen Make Payment, and confirm the "Pay from Cash Flow Sheet" dropdown appears (beside the date-range filter) already defaulted to the first entry with its invoices pre-checked and the other entry's invoices shown disabled. Switch the dropdown to the other entry and confirm the checked set swaps completely (previous batch unchecked, new batch checked) rather than accumulating — at no point should both batches' items be checkable/checked together. Switch to the "Pay On Account" tab and confirm the dropdown disappears entirely; switch back and confirm it reappears with the same selection preserved. Finally, test a supplier/LOC with zero pending entries and confirm the dropdown doesn't render at all.

**Phase 5:** Actually process the payment on a locked charge/invoice from Make Payment and confirm afterward: the badge changes to "Paid" (not stuck on "Pending Payment"), and editing/deleting it is still blocked (now via the `payment_amount`/`paid_amount` guard instead of the pending-lock guard). Separately, reconcile a different item, then delete its `CashFlowEntry` row from the cash sheet before paying it — confirm the item becomes fully editable/deletable again immediately. Finally, run the full LOC and Supplier "reconcile → lock → pay" flow end-to-end at least once each and confirm no step produces a totals mismatch.

## 7. Working Area (Current Phase): Phase 1 — Schema: lock column + atomic RPC

**Step 1 — New migration file:** `supabase/migrations/20260826000000_cashflow_entry_pending_lock.sql`

```sql
ALTER TABLE "LinesOfCreditTransaction"
  ADD COLUMN IF NOT EXISTS pending_cash_flow_entry_id text REFERENCES "CashFlowEntry"(id) ON DELETE SET NULL;

ALTER TABLE "SupplierInvoiceLine"
  ADD COLUMN IF NOT EXISTS pending_cash_flow_entry_id text REFERENCES "CashFlowEntry"(id) ON DELETE SET NULL;
```

**Step 2 — New atomic RPC** (new file, e.g. `src/supabase/add_to_cash_flow_atomic.sql`, deployed the same way other RPCs in this repo are — check how `process_payment_atomic`'s source is deployed/tracked and mirror that):

```sql
CREATE OR REPLACE FUNCTION add_to_cash_flow_atomic(
  p_entry jsonb,
  p_loc_transaction_ids text[] DEFAULT '{}',
  p_supplier_invoice_line_ids text[] DEFAULT '{}'
) RETURNS text
LANGUAGE plpgsql
AS $$
DECLARE
  v_entry_id text;
BEGIN
  INSERT INTO "CashFlowEntry" (
    id, supplier, supplier_id, loc_id, amount, due_date, amount_paid, created_date, updated_date
  )
  SELECT
    p_entry->>'id',
    p_entry->>'supplier',
    p_entry->>'supplier_id',
    p_entry->>'loc_id',
    (p_entry->>'amount')::double precision,
    p_entry->>'due_date',
    0,
    (p_entry->>'created_date')::timestamptz,
    (p_entry->>'updated_date')::timestamptz
  RETURNING id INTO v_entry_id;

  IF array_length(p_loc_transaction_ids, 1) > 0 THEN
    UPDATE "LinesOfCreditTransaction"
    SET pending_cash_flow_entry_id = v_entry_id
    WHERE id = ANY(p_loc_transaction_ids) AND pending_cash_flow_entry_id IS NULL;
  END IF;

  IF array_length(p_supplier_invoice_line_ids, 1) > 0 THEN
    UPDATE "SupplierInvoiceLine"
    SET pending_cash_flow_entry_id = v_entry_id
    WHERE id = ANY(p_supplier_invoice_line_ids) AND pending_cash_flow_entry_id IS NULL;
  END IF;

  RETURN v_entry_id;
END;
$$;
```

`p_entry` carries exactly the fields `AddToSheetModal.jsx` builds today (`id` generated client-side as now, `supplier`, `supplier_id`, `loc_id`, `amount`, `due_date`, timestamps) — this RPC only changes *how* the row gets written (atomically, with locking), not what data it contains. Exact column list/types should be double-checked against `20260806000000_loc_cashflow_tables.sql`'s `CashFlowEntry` definition before finalizing.

---

**Stop here for approval before executing Phase 1.**
