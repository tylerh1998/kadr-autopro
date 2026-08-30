# Implementation Plan: Cash-Sheet Reconciliation Traceability (LOC + Suppliers)

## 1. Context & Lessons Learned

**Core goal:** Stop "the totals never add up" when marking Lines-of-Credit (and Supplier) payments as paid. The user's workflow is: reconcile a statement → check off the charges/invoices it covers → "Add to Cash Flow" (creates a `CashFlowEntry` row on the manual cash sheet) → weeks later, open "Make Payment" again to actually pay it → check off the same items → submit. The bug: **step 1 and step 4 are completely disconnected in the code.** "Add to Cash Flow" only ever wrote a lump-sum dollar amount to `CashFlowEntry` — never *which* specific `LinesOfCreditTransaction` or `SupplierInvoiceLine` rows were checked. When "Make Payment" is reopened later, its selection state resets to blank and the user has to re-identify the same items from memory/paper, so any drift (new charges posted in the interim, a manually-edited cash-sheet amount, a partial payment made elsewhere) produces a payment total that doesn't match the cash-sheet total. This has recurred 3 months running.

**Fix, in one sentence:** persist which specific ledger rows were checked at "Add to Cash Flow" time, and have "Make Payment" read that back and pre-check the same rows (re-verified live, not blindly trusted) instead of starting from a blank slate.

**Lessons learned during investigation (read this before touching any of the files below):**
- `AddToSheetModal.jsx` lives at **`src/components/suppliers/AddToSheetModal.jsx`** — there is no separate copy under `lines-of-credit/`. It is genuinely one shared component with **4 importers**: [`LineOfCreditPaymentModal.jsx`](../src/components/lines-of-credit/LineOfCreditPaymentModal.jsx), [`SupplierPaymentModal.jsx`](../src/components/suppliers/SupplierPaymentModal.jsx), [`ReconcileSupplier.jsx`](../src/pages/ReconcileSupplier.jsx), and [`APSummaryTable.jsx`](../src/components/suppliers/APSummaryTable.jsx). Any change to it affects all four flows at once — treat it as one shared surface, not four.
- `BatchPaymentModal.jsx` (`src/components/paypro/paystubs/BatchPaymentModal.jsx`) is a **PayPro payroll paystub** component, unrelated to supplier AP. It is out of scope and is not touched by this plan (an earlier hypothesis assumed it was a supplier batch-payment tool — confirmed wrong via full read).
- There is **no cross-supplier or cross-account batch payment** anywhere in the app — every "Make Payment" flow (LOC and Supplier) is scoped to one account/supplier at a time. The resumability fix does not need to handle multi-entity batching.
- **Executed payments already have per-line traceability** — `SupplierPayment.invoice_number` (genuine `jsonb`, never `JSON.parse()` it) already stores `{id, invoice_number, invoice_date, amount_applied}` per applied invoice once a payment actually runs, via the existing helper `buildAppliedDetailsFromConceptualInvoice` in `SupplierPaymentModal.jsx` (line 129). **The gap is specifically at the earlier "planning" stage** — the `CashFlowEntry` row created by "Add to Cash Flow" — which has never captured this. Phase 3 deliberately reuses `buildAppliedDetailsFromConceptualInvoice` for the planning-stage capture too, so both stages resolve "which invoice" the same way instead of drifting apart.
- `Plans and Context/master_context.md` §4.5 and the archived `Plans and Context/Archive/reconcilesupplier_implementation_plan.md` already document this exact gap for the supplier/reconcile flow ("no per-invoice traceability column exists on `CashFlowEntry`") and explicitly note it was a **deliberate scoping decision at the time** ("intentionally matches existing behavior rather than introducing new schema"). This plan knowingly reverses that earlier trade-off — that's expected, not a conflict with prior work.
- `LinesOfCredit.current_balance` / `available_credit` are stored but **non-authoritative** (the ledger page computes balance live from `LinesOfCreditTransaction`). Per master_context.md's explicit warning, **do not** touch these fields as part of this fix — out of scope.
- `APSummaryTable.jsx`'s "Add to Cash Flow" context-menu action has **no invoice-level selection at all** — it pushes a coarse aged-bucket amount (`total_balance - not_due`). There is nothing to capture there; this plan leaves that entry point as amount-only by design (documented in Phase 3, not a bug).

## 2. Previously Completed

Nothing has been implemented yet — this is a new plan. Completed so far is investigation only:
- Full read of the LOC payment flow (`LinesOfCredit.jsx`, `LineOfCreditPaymentModal.jsx`, `AddToSheetModal.jsx`, the `20260806000000_loc_cashflow_tables.sql` migration) confirming the exact mechanism and root cause.
- Full read of the supplier/AP flow (`SupplierPaymentModal.jsx`, `ReconcileSupplier.jsx`, `APSummaryTable.jsx`, `reconcileMatching.js`) confirming the identical gap exists there and that `AddToSheetModal.jsx` is genuinely shared code.
- Cross-checked findings against `Plans and Context/master_context.md` §4.5, which already documents this as a known, previously-accepted limitation.

## 3. Risk Assessment

| # | Risk | Impact | Likelihood | Mitigation |
|---|---|---|---|---|
| 1 | New `CashFlowEntry` columns (`source_type`, `reconciled_items`) break existing reads/writes | Low | Low | Columns are nullable, additive only; migration uses `ADD COLUMN IF NOT EXISTS`; no existing code reads these columns today so nothing can break by their mere existence. |
| 2 | `reconciled_items` is genuine `jsonb`; a future/careless `JSON.parse()` on it throws at runtime | Medium (a crash, not data loss) | Medium — this exact anti-pattern already bit `SupplierInvoiceLine`/`SupplierPayment.invoice_number` per master_context.md | Document clearly in code and in this plan that it's real `jsonb`, never `JSON.parse()`. Grep for `JSON.parse` near any new `reconciled_items` reads before merging each phase. |
| 3 | Editing the shared `AddToSheetModal.jsx` regresses one of its 4 call sites | Medium (breaks a live monthly financial workflow) | Medium — it's one file serving both LOC and 3 supplier surfaces | Make all new props purely additive/optional (default `null`/`undefined` behaves exactly as today); manually re-verify all 4 call sites after Phase 1, before building Phase 2/3 on top. |
| 4 | Resuming pre-checks *stale* data (an item was already paid elsewhere, reversed, or deleted since the cash-sheet entry was made) — silently reintroducing the same "totals don't add up" bug in a new form | High (defeats the entire purpose of the fix) | Medium | Never trust the captured `amount`/existence at resume time — re-fetch each referenced id live, recompute its *current* outstanding amount, and drop/flag (don't silently include) any item that's fully paid, reversed, or no longer exists. Always show a visible "restored from cash sheet — please verify" banner rather than a silent pre-check. |
| 5 | Two or more pending `CashFlowEntry` rows exist for the same LOC/supplier (reconciled twice before paying either) — ambiguous which to resume | Low-Medium | Low-Medium (plausible if a statement arrives before the last one was paid) | Explicitly designed for in Phase 4: default to the most recent unpaid entry, but surface all pending entries so the user isn't silently missing one. |
| 6 | LOC modal's existing "reset everything on open" `useEffect` (`LineOfCreditPaymentModal.jsx` line 269-277, which does `setSelectedCharges({})` unconditionally) fights with the new resume-and-preselect logic | Medium | Medium if not sequenced carefully | Treat the resume fetch as part of the same load effect, applied *after* the reset, not as a separate competing effect. |
| 7 | Migration mistakenly applied to the wrong Supabase project (dev vs. prod) | High if prod | Low | Per standing project rule, all work happens on `development` branch / dev Supabase project; production is never touched without an explicit separate ask. |

## 4. Time Estimate

Remaining work across all 4 phases, at autonomous agent execution speed (not counting your own UI verification time between phases, which will dominate actual elapsed time):

- Phase 1 (schema + shared modal plumbing): ~20–30 min
- Phase 2 (LOC capture + resume): ~45–60 min
- Phase 3 (Supplier + Reconcile capture + resume): ~60–90 min (two files, plus the conceptual-invoice grouping logic)
- Phase 4 (edge cases: stale items, duplicate pending entries, full regression pass): ~45–60 min

**Total: roughly 3–4 hours of autonomous execution**, spread across phases with your review/UI verification in between each one.

## 5. Roadmap & Progress

### Phase 1 — Schema + shared `AddToSheetModal` plumbing [Pending]

**Files impacted:**
- `supabase/migrations/20260826000000_cashflow_entry_reconciled_items.sql` (new)
- `src/components/suppliers/AddToSheetModal.jsx`

**TL;DR:** Add two nullable columns to `CashFlowEntry` (`source_type`, `reconciled_items`) and teach the shared `AddToSheetModal` to pass them through on insert — purely additive, no caller changes yet, so behavior is unchanged everywhere until Phase 2/3 wire it up.

**Detail:** `CashFlowEntry` currently has no way to record which specific ledger rows a cash-sheet entry corresponds to. This phase only builds the storage and the write-capability, deliberately decoupled from any behavior change, so it can be verified in isolation before any UI logic changes. `source_type` distinguishes which domain's ids `reconciled_items` refers to (`'loc_transaction'` → `LinesOfCreditTransaction.id`, `'supplier_invoice_line'` → `SupplierInvoiceLine.id`); `reconciled_items` is a `jsonb` array of `{id, amount}` objects, mirroring the shape already used by `SupplierPayment.invoice_number` and by `buildAppliedDetailsFromConceptualInvoice`'s output, so the same shape is reused consistently everywhere in the codebase rather than inventing a new convention.

### Phase 2 — Lines of Credit: capture on write, resume on read [Pending]

**Files impacted:**
- `src/components/lines-of-credit/LineOfCreditPaymentModal.jsx`

**TL;DR:** When the user checks charges and clicks "Next: Add to Cash Flow," pass those exact charge ids/amounts through to the new `reconciled_items` field. When "Make Payment" is reopened later, look up any pending (`amount_paid` still `0`/less than `amount`) `CashFlowEntry` for this `loc_id` with saved `reconciled_items`, re-verify each referenced charge is still outstanding, and pre-check it — with a visible "restored from your cash-sheet reconciliation, please verify" banner.

**Detail:** `outstandingCharges` (state set in the `loadData` effect, line 302-319) already carries `id`, `charge_amount`/`credit_amount`, and `payment_amount` for every open item — building `reconciled_items` at "Add to Cash Flow" time is a straightforward map over `outstandingCharges.filter(c => selectedCharges[c.id])`, structurally identical to the existing `appliedCharges` builder in `handleSubmit` (lines 447-467), which should be reused/shared rather than reimplemented a third time. On open, after the existing reset (`setSelectedCharges({})`, line 273) and after `outstandingCharges` is populated (end of the same effect, line 319), query `CashFlowEntry` for `loc_id = lineOfCredit.id` with a non-null `reconciled_items` and `amount_paid < amount` (or an equivalent "still pending" condition), take the most recent one (see Phase 4 for the multiple-pending-entries case), and for each `{id, amount}` in its `reconciled_items`: if `id` is still present in the freshly-loaded `outstandingCharges` list, pre-check it (`selectedCharges[id] = true`); if it is not (paid off elsewhere, reversed, deleted), skip it and collect it into a "these items from your last reconciliation are no longer outstanding" warning list rendered above the charges table.

### Phase 3 — Suppliers: capture on write, resume on read (both entry points) [Pending]

**Files impacted:**
- `src/components/suppliers/SupplierPaymentModal.jsx`
- `src/pages/ReconcileSupplier.jsx`
- `src/components/suppliers/APSummaryTable.jsx` (no logic change — verification only, see below)

**TL;DR:** Same capture-and-resume pattern as Phase 2, but for suppliers, across both places that currently push lump sums into `AddToSheetModal`: the "Pay Specific Invoices" checkbox tab in `SupplierPaymentModal.jsx`, and the "Matched" bucket in `ReconcileSupplier.jsx`. Both funnel into the same `SupplierPaymentModal` for the actual "Make Payment" resume, since that's the only supplier payment surface that exists.

**Detail:** `SupplierPaymentModal.jsx` already builds exactly the right shape via `buildAppliedDetailsFromConceptualInvoice` (line 129) when it processes a real payment (`processPaymentLogic`, line 587-593) — reuse that same helper to build `reconciled_items` when the user clicks "Next: Add to Cash Flow" (line 945-949) instead of only the lump `totalSelectedAmount`. `ReconcileSupplier.jsx`'s `matchedItems` (line 123-126) carry a `.lines` array per conceptual invoice (from `mapAutoproToItem`), which is the same shape `buildAppliedDetailsFromConceptualInvoice` expects — so its "Add to Cash Flow" (line 297-302) can call the identical helper (moved to a shared location, e.g. `src/lib/` or `src/components/suppliers/`, since it's currently a module-private function inside `SupplierPaymentModal.jsx`) over the selected `matchedItems` to build the same `reconciled_items` shape. On the resume side, extend `SupplierPaymentModal.jsx`'s existing `cashFlowEntry` lookup (state at line 192-193, effect at line 223-234) — today this only *displays* a matching `CashFlowEntry`'s `date_paid`/`amount_paid` informationally in the Payment Details step; extend it to also read `reconciled_items` and pre-check `selectedInvoices` by the underlying `SupplierInvoiceLine.id` (matched against `outstandingInvoices`' per-line ids, not `uniqueKey`, since `uniqueKey` is a synthetic grouping key that won't match across sessions) the same way Phase 2 does for LOC — including the same "re-verify still outstanding, warn if not" handling. **`APSummaryTable.jsx`'s own "Add to Cash Flow" action stays amount-only, unchanged** — there is no invoice-level selection at that entry point, so `reconciled_items` is simply omitted (`null`) for entries created there; the "Make Payment" resume logic naturally has nothing to pre-select in that case, which is correct, not a gap.

### Phase 4 — Edge cases and full verification pass [Pending]

**Files impacted:** Likely small follow-up edits to the same files touched in Phases 2-3, based on what testing surfaces.

**TL;DR:** Handle the messier real-world cases the happy path doesn't cover — multiple pending cash-sheet entries for the same account/supplier, and a full end-to-end regression pass across both LOC and Supplier flows — before considering this done.

**Detail:** Decide and implement the behavior when more than one unpaid `CashFlowEntry` with `reconciled_items` exists for the same `loc_id`/`supplier_id` (e.g., two statements reconciled before either was paid) — most likely: default to pre-selecting the union of all their items (deduplicated by id), while listing which cash-sheet entries contributed, rather than silently picking just one and hiding the other. Then run a full manual regression pass (see Verification Plan below) across both domains, in both the normal case (nothing changed between reconcile and pay) and the drift case (something changed), confirming the on-screen "Selected Amount" always matches what actually gets marked paid, and that `LinesOfCredit.current_balance`/`available_credit` staleness remains untouched per the existing accepted limitation.

## 6. Verification Plan

**Phase 1:** Confirm the migration applied cleanly (columns `source_type`/`reconciled_items` exist on `CashFlowEntry`, both nullable). Then exercise all 4 existing "Add to Cash Flow" entry points exactly as today (LOC Make Payment, Supplier Make Payment, Reconcile Supplier, AP Summary's context-menu Add to Cash Flow) and confirm each still behaves identically to before — new columns simply come through `null` on every inserted row, since no caller passes them yet.

**Phase 2:** On the Lines of Credit page, open Make Payment for a real account, check 2-3 charges under "Pay Specific Charges," click "Next: Add to Cash Flow," confirm the amount, and submit. Then close the modal and reopen Make Payment for the same account (simulating the "weeks later" scenario) — the same charges should already be checked, with a visible "restored from cash sheet" notice, and the Selected Amount should match the cash-sheet entry's amount. As a drift test, before reopening, delete or reverse one of the captured charges directly — reopening should gracefully drop that one item with a visible warning instead of silently miscounting. Finally, submit the payment and confirm it succeeds normally.

**Phase 3:** From AP Summary, right-click a supplier with outstanding invoices → Make Payment → check specific invoices → "Next: Add to Cash Flow" → submit. Reopen Make Payment for that supplier and confirm the same invoices are pre-checked. Separately, go to Reconcile Supplier for a supplier, process a statement, confirm "Matched" invoices are still auto-selected as today, click "Add to Cash Flow," then open Make Payment for that supplier and confirm those reconciled invoices are now pre-checked too (proving the two previously-disconnected supplier flows are now linked). Finally, use AP Summary's lump-sum "Add to Cash Flow" (no invoice selection) and confirm it still works as before, with Make Payment correctly not attempting to pre-select anything from that entry.

**Phase 4:** Deliberately create two pending cash-sheet entries for the same account/supplier and confirm Make Payment handles both sanely (not silently dropping one). Then do a full run-through of both LOC and Supplier flows, normal and drift cases, confirming the cash-sheet total and the actually-marked-paid total always match. Spot-check that `LinesOfCredit.current_balance` continues to be ignored (not newly relied upon anywhere).

## 7. Working Area (Current Phase): Phase 1 — Schema + shared `AddToSheetModal` plumbing

**Step 1 — New migration file:** `supabase/migrations/20260826000000_cashflow_entry_reconciled_items.sql`

```sql
ALTER TABLE "CashFlowEntry"
  ADD COLUMN IF NOT EXISTS source_type text,
  ADD COLUMN IF NOT EXISTS reconciled_items jsonb;

ALTER TABLE "CashFlowEntry"
  DROP CONSTRAINT IF EXISTS cashflowentry_source_type_check;
ALTER TABLE "CashFlowEntry"
  ADD CONSTRAINT cashflowentry_source_type_check
  CHECK (source_type IS NULL OR source_type IN ('loc_transaction', 'supplier_invoice_line'));
```

`reconciled_items` shape when present: `[{ "id": "<LinesOfCreditTransaction.id or SupplierInvoiceLine.id>", "amount": <number> }, ...]`. Genuine `jsonb` — never `JSON.parse()` it when reading it back in Phase 2/3.

**Step 2 — `src/components/suppliers/AddToSheetModal.jsx` changes:**

In `handleSubmit` (currently lines 34-66), the insert object at lines 44-54 gains two fields, read directly from the `initialValues` prop (no new component state needed — `initialValues` is already in scope):

```js
const { error } = await supabase.from('CashFlowEntry').insert([{
  id: crypto.randomUUID().replace(/-/g, '').substring(0, 24),
  supplier: formData.supplierName,
  supplier_id: initialValues?.supplierId,
  loc_id: initialValues?.locId,
  amount: parseFloat(formData.amount),
  due_date: formData.dueDate,
  amount_paid: 0,
  source_type: initialValues?.sourceType || null,
  reconciled_items: (initialValues?.reconciledItems && initialValues.reconciledItems.length > 0)
    ? initialValues.reconciledItems
    : null,
  created_date: now,
  updated_date: now
}]);
```

No changes to the rendered form (`supplierName`/`amount`/`dueDate` inputs, lines 74-109) — `sourceType`/`reconciledItems` are carried through silently, never user-editable, exactly like `supplierId`/`locId` already are today. No caller (`LineOfCreditPaymentModal.jsx`, `SupplierPaymentModal.jsx`, `ReconcileSupplier.jsx`, `APSummaryTable.jsx`) is touched in this phase — none of them currently pass `sourceType`/`reconciledItems` in their `initialValues` object, so every insert produced in Phase 1 has both new columns `null`, byte-for-byte equivalent to current behavior. This isolates "does the schema/plumbing work" from "does the new behavior work," so Phase 1 can be verified in complete isolation before Phase 2 changes any actual selection logic.

---

**Stop here for approval before executing Phase 1.**
