# AR Credit Application Fix — Implementation Plan

**Status:** Awaiting approval
**Scope:** Fix the "chargesToPay" bug that prevents customer AR credit balances from ever being applied to outstanding charges through Take Payment, plus a related accounting-integrity guard on adjustment reversal.

This document is fully self-contained. No prior conversation context is required to execute it.

---

## 1. Overview and Goals

### The bug
`TakePaymentModal.jsx`'s "Pay Specific Invoices" tab lists outstanding AR items via `supabase.rpc('get_outstanding_ar_items', { customer_id_val })`. That RPC (Postgres function, project `sitihbdnuxifwibontcm`) already returns **both** positive-balance charges **and** negative-balance credit adjustments — it has no sign filter (`WHERE ABS(amount - ar_paid) > 0.01`). So a customer's available credit already shows up as a selectable row today, right next to their outstanding charges, and the modal already nets it into the displayed `totalSelectedAmount`.

The break is in the backend. On submit, the frontend calls `autopro-processCustomerARAccounting` with `action: 'create_payment'`. Inside that function, the JS helper `buildOutstandingCharges(customerId)` computes:

```js
const positiveOutstandingCharges = outstandingCharges.filter((charge) => (Number(charge.balance) || 0) > 0.01);
```

Both `apply_mode: 'selected'` and the default oldest-first mode only ever draw from `positiveOutstandingCharges`. A selected credit (negative balance) is silently dropped — its `ar_paid` is never touched. Meanwhile the frontend already computed `totalSelectedAmount` as the *net* of charge and credit balances, so a **real cash payment record gets created for the netted amount**, falsely implying that much cash was physically collected, while the credit itself sits untouched forever.

This is a confirmed, live, active bug — not hypothetical. On project `sitihbdnuxifwibontcm` right now:
- **16 customers**, **49 credit-adjustment rows**, **$15,534.64 total unapplied credit**.
- Largest holders: KEN'S AUTO (~20 line-item credits, ~$5.4k), ELISA HANEY (14 recurring "$200 Paycheque - Apply to AR" credits dating back to January — an evidently-intended recurring payroll-deduction arrangement that has never once been applied).

### A related, separate integrity gap found during investigation
`reverse_adjustment` (in the same file) deletes a `CustomerARAdjustment` row and reverses its GL with **no check at all** on whether that adjustment has already been partially or fully applied (`ar_paid != 0`). If an adjustment that's already been paid down (or, after this fix, a credit that's already funded a payment) gets deleted, the payment/charge on the other side of that application becomes orphaned — its `ar_paid` still reflects money that no longer has a corresponding source record. This silently corrupts the customer's balance. `reverse_payment` already guards its equivalent risk (`if (payment.deposited === true) return error`) — `reverse_adjustment` has no equivalent guard at all today, for *any* adjustment, not just credits.

### Goals
1. Make credit adjustments actually usable: selecting one in Take Payment (alone or alongside charges) must reduce what's still owed, funded from the credit rather than phantom cash.
2. Preserve the existing "one way to apply money to AR" UX — no new screens, no new context-menu actions. Everything continues to run through the existing Take Payment flow and the existing `create_payment` action.
3. Keep it fully reversible using the *existing* `reverse_payment` machinery (walks `ar_applyto`) rather than building a second, parallel undo path.
4. Close the adjustment-reversal integrity gap for all adjustments, not just credits.
5. Zero schema/migration changes. Reuse the existing `ar_applyto` string format (`id:type:amount:description`, comma-separated) with a new `type` tag.

---

## 2. Confirmed technical facts (schemas, conventions, current code)

### `CustomerPayments` columns (project `sitihbdnuxifwibontcm`)
`id text, customer_id text, amount double precision, payment_method text, payment_date text, notes text, reference text, ar_pmt boolean, ar_paid double precision, ar_applyto text, cheque_name text, cheque_number text, deposited boolean, deposit_date text, deposit_batch_id text, gl_posted boolean, advance_pmt boolean, work_order_id text, invoice_number text, lankar_invoice text, created_date timestamptz, updated_date timestamptz, created_by_id text, created_by text, is_sample boolean`

### `CustomerARAdjustment` columns (project `sitihbdnuxifwibontcm`)
`id text, customer_id text, amount double precision, gl_account text, description text, reference text, adjustment_date text, ar_paid double precision, overpayment boolean, created_date timestamptz, updated_date timestamptz, created_by_id text, created_by text, is_sample boolean`

Note: `CustomerARAdjustment` has **no `ar_applyto` column** — confirmed deliberately absent; do not add one (see §5 for how this is handled instead).

### `ar_paid` sign convention (traced from live data + existing code, both tables)
`balance = amount - ar_paid` in all cases.
- **Charge** (positive `amount`, e.g. an on-account invoice or a positive adjustment like Interest): paying it down **increases** `ar_paid` toward `amount`. Existing code (`create_payment`): `newArPaid = (Number(charge.ar_paid) || 0) + amountToApply;`
- **Credit** (negative `amount`, e.g. an overpayment or goodwill credit): `balance` starts negative (available credit). Consuming `$X` of it must make `ar_paid` **more negative** by `X`, so the balance shrinks toward zero from below: `newArPaid = (Number(credit.ar_paid) || 0) - amountApplied;`
  - Worked example: `amount = -500, ar_paid = 0`. Consume `$200` → `newArPaid = -200` → `balance = -500 - (-200) = -300` (300 remaining credit — correct).

### `ar_applyto` format (already established, `CustomerPayments` only)
Comma-separated entries, each `id:type:amount:description`. Built/parsed by two existing helpers already in `autopro-processCustomerARAccounting/index.ts`:
```ts
const parseArApplyTo = (value: any) => {
  if (!value) return [];
  return String(value).split(',').map((entry) => entry.trim()).filter(Boolean).map((entry) => {
    const [id, type, amount, ...descParts] = entry.split(':');
    return { id, type, amount: Number(amount) || 0, description: descParts.join(':') };
  });
};
const buildArApplyTo = (entries: any[]) => {
  return entries.map((e) => `${e.id}:${e.type}:${(Number(e.amount) || 0).toFixed(2)}:${sanitizeDescription(e.description)}`).join(',');
};
```
Existing `type` values in use: `'pmt'` (applied to a charge/invoice), `'adj'` (applied to a positive adjustment). This plan adds a new type: `'credit_source'` (the credit that *funded* this payment, as opposed to something the payment paid *down*). Since `type` is a free-form string already handled generically by the parser, no format change is needed.

### GL account numbers already in use (do not hardcode where the row itself carries the account)
- `1100` = Accounts Receivable control account.
- `1010` = Cash.
- `2100` = Customer deposits / overpayment liability (used specifically for system-generated "Overpayment" adjustments — **not** universal; a manually-created credit adjustment may carry a different `gl_account`). **Always read `gl_account` off the specific adjustment row being consumed — never hardcode `2100`.**

### Current `create_payment` action — relevant existing logic (file: `supabase/functions/autopro-processCustomerARAccounting/index.ts`)
```ts
const buildOutstandingCharges = async (customerId: string) => {
  const [{ data: payments }, { data: adjustments }] = await Promise.all([
    supabase.from('CustomerPayments').select('*').eq('customer_id', customerId),
    supabase.from('CustomerARAdjustment').select('*').eq('customer_id', customerId)
  ]);
  const charges: any[] = [];
  (payments || [])
    .filter((payment: any) => payment.payment_method === 'on_account')
    .forEach((payment: any) => {
      const balance = (Number(payment.amount) || 0) - (Number(payment.ar_paid) || 0);
      if (balance > 0.01) {
        charges.push({ id: payment.id, type: 'invoice', date: payment.payment_date, amount: Number(payment.amount) || 0, ar_paid: Number(payment.ar_paid) || 0, balance, work_order_id: payment.work_order_id || '', notes: payment.notes || '' });
      }
    });
  (adjustments || []).forEach((adjustment: any) => {
    const balance = (Number(adjustment.amount) || 0) - (Number(adjustment.ar_paid) || 0);
    if (Math.abs(balance) > 0.01) {
      charges.push({ id: adjustment.id, type: 'adjustment', date: adjustment.adjustment_date, amount: Number(adjustment.amount) || 0, ar_paid: Number(adjustment.ar_paid) || 0, balance, reference: adjustment.reference || '', description: adjustment.description || '', adjustment });
    }
  });
  charges.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  return charges;
};
```
Note: `buildOutstandingCharges` already returns credits (any adjustment with `Math.abs(balance) > 0.01`, no sign filter) — the array it returns is fine as-is. **The bug is entirely in how `create_payment` consumes this array afterward** (`positiveOutstandingCharges = outstandingCharges.filter(charge => balance > 0.01)` strips credits out before selection/FIFO logic ever sees them).

Current `create_payment` body (abbreviated to the relevant control flow — full file must be read from disk before editing, this is not the complete file):
```ts
if (action === 'create_payment') {
  const { customer_id, payment_date, payment_amount, payment_method, reference, apply_mode, selected_charge_ids = [], credit_card_fee_amount = 0 } = payload;
  const paymentAmount = Number(payment_amount) || 0;
  const creditCardFeeAmount = Number(credit_card_fee_amount) || 0;
  const totalAmountWithFee = paymentAmount + creditCardFeeAmount;
  // ... validation ...
  const outstandingCharges = await buildOutstandingCharges(customer_id);
  const positiveOutstandingCharges = outstandingCharges.filter((charge) => (Number(charge.balance) || 0) > 0.01);
  let chargesToPay: any[] = [];
  if (apply_mode === 'selected') {
    const selectedSet = new Set((selected_charge_ids || []).filter(Boolean));
    chargesToPay = positiveOutstandingCharges.filter((charge) => selectedSet.has(charge.id)).map((charge) => ({ ...charge, amountToApply: Number(charge.balance) || 0 }));
  } else {
    let remainingAmount = paymentAmount;
    for (const charge of positiveOutstandingCharges) {
      if (remainingAmount <= 0) break;
      const amountToApply = Math.min(remainingAmount, Number(charge.balance) || 0);
      if (amountToApply > 0.01) { chargesToPay.push({ ...charge, amountToApply }); remainingAmount -= amountToApply; }
    }
  }
  const paymentRecord = await insertCustomerPayment({ customer_id, amount: totalAmountWithFee, payment_method, payment_date, reference: reference || '', notes: `AR Payment for ${customerName}...`, ar_pmt: true, ar_applyto: '' });
  // ... GL: debit 1010 totalAmountWithFee / credit 1100 totalAmountWithFee ...
  // ... loop chargesToPay: increment each charge.ar_paid by amountToApply, push to applyToEntries ...
  // ... overpayment handling if paymentAmount > totalApplied ...
  const updatedPayment = await updateCustomerPayment(paymentRecord.id, { ar_applyto: buildArApplyTo(applyToEntries) });
  return res({ success: true, payment: updatedPayment });
}
```

### Current `reverse_payment` action — relevant existing logic
```ts
if (action === 'reverse_payment') {
  const { payment_id } = payload;
  const payment = await fetchCustomerPayment(payment_id);
  if (payment.deposited === true) return res({ success: false, error: 'Cannot delete a payment that has already been deposited.' });
  const arApplyToEntries = parseArApplyTo(payment.ar_applyto);
  const autoAdjustmentsToReverse = new Map();
  for (const entry of arApplyToEntries) {
    const recordId = entry?.id;
    const amountApplied = Number(entry?.amount) || 0;
    if (!recordId || amountApplied <= 0) continue;
    const appliedPayment = await fetchCustomerPayment(recordId);
    if (appliedPayment) {
      const newArPaid = Math.max(0, (Number(appliedPayment.ar_paid) || 0) - amountApplied);
      await updateCustomerPayment(recordId, { ar_paid: newArPaid });
      continue;
    }
    const appliedAdjustment = await fetchAdjustment(recordId);
    if (appliedAdjustment) {
      if (isPaymentGeneratedAdjustment(appliedAdjustment, payment, amountApplied)) {
        autoAdjustmentsToReverse.set(appliedAdjustment.id, appliedAdjustment);
      } else {
        const newArPaid = Math.max(0, (Number(appliedAdjustment.ar_paid) || 0) - amountApplied);
        await updateAdjustment(recordId, { ar_paid: newArPaid });
      }
    }
  }
  // ... GL reversal, delete auto-generated adjustments, delete payment ...
}
```
This is the loop that must be extended with a `credit_source` branch (§5, step 6).

### Current `reverse_adjustment` action (no guard today — this is the integrity gap)
```ts
if (action === 'reverse_adjustment') {
  const { adjustment_id } = payload;
  const adjustment = await fetchAdjustment(adjustment_id);
  if (!adjustment) return res({ success: false, error: 'Adjustment not found' });
  const reversalDate = getCurrentMountainDate();
  await insertGLTransactions(reverseAdjustmentGLRows({ adjustment, reversalDate, sourceType: 'adjustment' }));
  await deleteAdjustment(adjustment.id);
  return res({ success: true });
}
```

### Client-side deposit/cash-drawer exclusion mechanism (confirmed, no new code needed here)
`src/pages/CashDrawer.jsx:29`:
```js
const paymentMethods = ['cash', 'debit', 'credit_card', 'cheque', 'e_transfer', 'other'];
```
Cash-drawer buckets are seeded only for these methods (`initialCashDrawer[method] = []` for each). Incoming `CustomerPayments` rows are bucketed with `if (initialCashDrawer[method]) { ... }` — since `'on_account'` was never in this list, on-account charges are already silently excluded from the cash drawer with zero explicit filtering. **As long as the new `'credit_applied'` payment_method is never added to this array, it is automatically excluded the same way — no code change required in `CashDrawer.jsx`.** This has been verified directly against the source; no further searching is needed at execution time.

### Deployment target (critical — do not deploy to the wrong project)
- All backend changes are in **one file**: `supabase/functions/autopro-processCustomerARAccounting/index.ts`.
- Must be deployed via the Supabase MCP `deploy_edge_function` tool with `project_id: "sitihbdnuxifwibontcm"` — **not** `hbcrwkmgsazqrvsrmxyr`. `hbcrwkmgsazqrvsrmxyr` is the production Supabase project (not yet live); `sitihbdnuxifwibontcm` is the dev branch that the deployed `test.kensauto.ca` frontend actually calls (confirmed this session by decompiling the deployed JS bundle and cross-referencing the anon key's embedded project ref). Deploying to the wrong project will silently have no effect on what's testable.
- `verify_jwt: true` (matches the function's current setting — confirm via `get_edge_function` before deploying, don't just assume).
- Also update the local repo copy of the file (`supabase/functions/autopro-processCustomerARAccounting/index.ts`) to match what's deployed, so the two don't drift (this project has repeatedly hit bugs this session from local/deployed drift across two Supabase projects — keep them in lockstep).
- No new edge functions are created by this plan, so the `autopro-[functionname]` naming convention requirement doesn't introduce a new name — the existing function already follows it.

---

## 3. Proposed Changes

### Phase 1 — Adjustment reversal guard (independent, ships first, closes the integrity gap immediately)

**Backend** (`supabase/functions/autopro-processCustomerARAccounting/index.ts`, `reverse_adjustment` action): before `await deleteAdjustment(adjustment.id)`, add:
```ts
if (adjustment.ar_paid && Number(adjustment.ar_paid) !== 0) {
  return res({
    success: false,
    error: 'Cannot delete this adjustment because a payment or credit has already been applied against it. Record a correcting adjustment instead.'
  });
}
```
Applies to **all** adjustments, not just credits — a partially-paid positive adjustment (e.g. an Interest charge someone already paid $50 against) has the identical orphaning risk in reverse.

**Frontend** (`src/pages/CustomerARTransactions.jsx`, `handleDeleteAdjustment`): add the same pre-check before opening the confirm dialog, mirroring the existing pattern already used in the same file's `handleDeletePayment` (`if (paymentRecord.deposited === true) { alert(...); return; }`):
```js
if (adjustment.ar_paid && Number(adjustment.ar_paid) !== 0) {
  alert('Cannot delete this adjustment because a payment or credit has already been applied against it. Record a correcting adjustment instead.');
  return;
}
```
Insert this check in `handleDeleteAdjustment`, after the existing `supabase.from('CustomerARAdjustment').select('*')...` fetch and before `setShowDeleteAdjustmentConfirm(true)`.

### Phase 2 — Core fix: credit-aware `create_payment`

In `create_payment`, replace the `positiveOutstandingCharges`-only logic with credit-aware logic:

1. Fetch `outstandingCharges = await buildOutstandingCharges(customer_id)` (unchanged — already includes credits).
2. Split by sign:
   ```ts
   const chargeItems = outstandingCharges.filter((c) => (Number(c.balance) || 0) > 0.01);
   const creditItems = outstandingCharges.filter((c) => (Number(c.balance) || 0) < -0.01);
   ```
3. Determine `chargesToPay` from `chargeItems` exactly as today (selected-mode or oldest-first walk, unchanged) — this determines `totalChargesSelected` (sum of `amountToApply` across `chargesToPay`).
4. Determine available credit to apply. For `apply_mode === 'selected'`: only credits whose id is present in `selected_charge_ids` are eligible (same selection contract as charges — the frontend already lists credit rows as selectable in the same table, so `selected_charge_ids` may already contain credit ids). For oldest-first mode: fold **all** available credits in automatically (oldest first, same as charges), since there's no manual selection step in that tab.
   ```ts
   const eligibleCredits = apply_mode === 'selected'
     ? creditItems.filter((c) => selectedSet.has(c.id))
     : creditItems; // oldest-first mode auto-applies all available credit
   ```
5. Apply credit against `chargesToPay` in order (oldest charge first), up to whichever runs out first:
   ```ts
   let creditPool = eligibleCredits.map((c) => ({ ...c, available: Math.abs(Number(c.balance) || 0) }));
   let creditAppliedTotal = 0;
   const creditConsumption: { credit: any; amount: number }[] = [];
   for (const charge of chargesToPay) {
     let remainingOnCharge = charge.amountToApply;
     for (const credit of creditPool) {
       if (remainingOnCharge <= 0.01) break;
       if (credit.available <= 0.01) continue;
       const draw = Math.min(remainingOnCharge, credit.available);
       credit.available -= draw;
       remainingOnCharge -= draw;
       creditAppliedTotal += draw;
       creditConsumption.push({ credit, amount: draw });
     }
     charge._creditPortion = charge.amountToApply - remainingOnCharge; // amount of this charge covered by credit, for bookkeeping
   }
   const netCashNeeded = totalChargesSelected - creditAppliedTotal;
   ```
   (`totalChargesSelected` = sum of `chargesToPay[].amountToApply`, computed alongside step 3.)
6. **If `netCashNeeded > 0.01`** (credit doesn't fully cover selection):
   - Create the real `CustomerPayments` record with `amount: netCashNeeded + creditCardFeeAmount` (not the full selected total — this is the actual cash collected).
   - GL: debit `1010` / credit `1100`, both for `netCashNeeded + creditCardFeeAmount` (same pattern as today, corrected amount).
   - `payment_method`, `payment_date`, `reference` come from the user's input as today.
7. **If `netCashNeeded <= 0.01`** (credit fully covers the selection, no real cash needed):
   - Per explicit decision: still create a `CustomerPayments` record — this is what houses `ar_applyto` for record-keeping and lets reversal reuse the existing `reverse_payment` code path instead of a second bespoke undo mechanism.
   - `amount: creditAppliedTotal`, `payment_method: 'credit_applied'` (new value — confirmed not colliding with any existing method-specific branch; the only method-specific branch in this file checks `payment_method === 'credit_card'` for the 3% fee, which does not apply here), `ar_pmt: true`, `payment_date: getCurrentMountainDate()`, `reference` auto-generated (e.g. `CREDITAPPLY-${paymentRecord.id}`).
   - **No `1010`/cash GL leg.** Only the credit-to-charge GL entries from step 8.
8. For **both** branches, for each `{ credit, amount }` in `creditConsumption`:
   - GL: debit `credit.adjustment.gl_account` (read from the specific row — never hardcode `2100`) for `amount`, credit `1100` for `amount`. Date = `payment_date` (the real payment's date in branch 6, or today's date in branch 7).
   - Update the credit: `newArPaid = (Number(credit.ar_paid) || 0) - amount`, via `updateAdjustment(credit.id, { ar_paid: newArPaid })`.
9. Apply `chargesToPay` against the payment exactly as today (increment each `charge.ar_paid` by its full `amountToApply`, regardless of whether that amount came from cash or credit — from the charge's perspective it doesn't matter which source paid it).
10. Build `ar_applyto` on the payment record combining:
    - The existing charge entries (`type: 'pmt'` / `type: 'adj'`, unchanged from today's `applyToEntries` logic).
    - One new entry per consumed credit, `type: 'credit_source'`, `id: credit.id`, `amount: <amount drawn from that credit>`, `description: credit.description`.
    - `updateCustomerPayment(paymentRecord.id, { ar_applyto: buildArApplyTo(applyToEntries) })` — unchanged call, just a longer `applyToEntries` array.

### Phase 2 (continued) — `reverse_payment` must restore credit sources

In the `arApplyToEntries` walk inside `reverse_payment`, add a branch for `type === 'credit_source'` **before** the existing `fetchCustomerPayment` / `fetchAdjustment` fallback logic (since a credit_source entry always points at a `CustomerARAdjustment`, the existing `fetchAdjustment` lookup would find it — but it must be restored with the *opposite* sign convention from a normal applied-adjustment entry):

```ts
for (const entry of arApplyToEntries) {
  const recordId = entry?.id;
  const amountApplied = Number(entry?.amount) || 0;
  if (!recordId || amountApplied <= 0) continue;

  if (entry.type === 'credit_source') {
    const sourceCredit = await fetchAdjustment(recordId);
    if (sourceCredit) {
      const restoredArPaid = Math.min(0, (Number(sourceCredit.ar_paid) || 0) + amountApplied);
      await updateAdjustment(recordId, { ar_paid: restoredArPaid });
    }
    continue;
  }

  // ... existing logic unchanged for 'pmt'/'adj' entries ...
}
```
(`Math.min(0, ...)` mirrors the existing `Math.max(0, ...)` floor used for normal entries, but as a ceiling — a credit's `ar_paid` should never be restored past 0, i.e. never made positive.)

### Phase 3 — Frontend UX (`src/components/ar/TakePaymentModal.jsx`)

1. No change needed to the `get_outstanding_ar_items` fetch — credits already appear as rows.
2. Replace the single "Selected Amount" summary with a breakdown showing: total charges selected, credit applied (if any), net amount due. Compute client-side from the already-fetched `outstandingCharges`/`selectedCharges` state — sum positive-balance selections separately from negative-balance selections.
3. When net amount due (charges selected − credit selected) is `<= 0.01`:
   - Skip the "Payment Details" dialog entirely (no date/payment-method/reference/credit-card-fee step needed — nothing to collect).
   - On clicking the primary action button, call `create_payment` directly with `payment_method: 'credit_applied'`, `payment_date: format(new Date(), 'yyyy-MM-dd')`, `reference: ''`, `credit_card_fee_amount: 0`, and the current `selected_charge_ids` (already includes the credit ids selected in the table, since credits are just rows in the same list).
4. "Pay On Account (Oldest First)" tab: no change needed to how the frontend calls this (`apply_mode: 'oldest'`, no charge IDs sent) — the backend's oldest-first change in Phase 2 step 4 already folds in all available credit automatically server-side. Optionally (not required for correctness) show a note in this tab like "Available credit will be applied automatically."

---

## 4. Impact / Risk Assessment

- **Financial correctness, high stakes**: this changes how real money and GL entries are recorded. Every change must be verified against live data before being considered done — no change is acceptable based on code review alone.
- **Blast radius**: `autopro-processCustomerARAccounting` is the single shared backend for all AR payment/adjustment mutations across the app (`TakePaymentModal`, `RecordAdjustmentModal`, `CustomerARTransactions` delete/reverse flows). A mistake here affects every AR mutation, not just credit application.
- **`$15,534.64` in existing unapplied credit** across 16 customers is a real, live financial position. This plan does not touch existing data — it only makes the mechanism available going forward. Applying existing credits is a separate, manual, user-driven action after this ships (via Take Payment, per the new capability) — this plan does not auto-apply anything retroactively.
- **Reversal correctness is the highest-risk sub-piece.** If `credit_source` restoration in `reverse_payment` is wrong, reversing a credit-funded payment would leave the credit permanently stuck at its consumed `ar_paid` value (understating available credit forever) or over-restore it (creating credit from nothing). This must be verified with a real apply-then-reverse round trip before shipping (see §5, test 4).
- **Low risk, independent**: Phase 1 (the reversal guard) is a pure risk-reduction change with no new capability — it can ship and be verified in isolation before Phase 2 begins.
- **No schema/migration risk**: no new columns, no new tables. Purely application logic.
- **No risk to `hbcrwkmgsazqrvsrmxyr` (prod)**: nothing in this plan touches that project.

---

## 5. Roadmap and Time Estimate

### Phase 1 — Reversal guard (~30 min)
1. Read the current full contents of `supabase/functions/autopro-processCustomerARAccounting/index.ts` from disk (do not rely on the excerpts in this document for exact line numbers/surrounding code — they are abbreviated for readability).
2. Add the `ar_paid` guard to `reverse_adjustment`.
3. Deploy to `sitihbdnuxifwibontcm` via `deploy_edge_function` (`verify_jwt: true`, full file contents).
4. Update local repo copy of the same file to match.
5. Add the client-side pre-check to `handleDeleteAdjustment` in `src/pages/CustomerARTransactions.jsx`.
6. Run Phase 1 verification (§6) before proceeding to Phase 2.

### Phase 2 — Core backend fix (~2-3 hours, highest complexity)
1. Implement the credit-splitting, netting, and dual-GL logic in `create_payment` as specified in §3.
2. Implement the `credit_source` restoration branch in `reverse_payment`.
3. Deploy to `sitihbdnuxifwibontcm`, update local repo copy.
4. Run Phase 2 verification (§6) — this phase has the most test cases and must not proceed to Phase 3 until all pass, since Phase 3 is a thin UI layer over this logic and bugs here will be hard to distinguish from UI bugs once both are live.

### Phase 3 — Frontend (~1 hour)
1. Update `TakePaymentModal.jsx` per §3 (breakdown display, skip payment-details dialog when net ≤ 0, default values for the credit-only submit path).
2. Run Phase 3 verification (§6) — full manual UI walkthrough, since this is the first point in the plan where a human interacts with the feature end to end.

### Total estimate: ~4-5 hours across three checkpointed phases.

---

## 6. Verification and Testing Plan

Use direct SQL (execute_sql against project `sitihbdnuxifwibontcm`) and direct edge-function curl calls (with the project's anon key) to verify backend behavior — do not rely on UI-only testing for Phases 1-2, consistent with how the rest of this AR work was verified this session. UI walkthrough is required for Phase 3.

### Phase 1 verification
1. Pick any adjustment with non-zero `ar_paid` (e.g. query `select id, customer_id, ar_paid from "CustomerARAdjustment" where ar_paid is not null and ar_paid != 0 limit 1`). Call `reverse_adjustment` with its id via curl. Confirm the response is `{success: false, error: '...'}` and the row still exists.
2. Pick an adjustment with `ar_paid` null or 0. Confirm `reverse_adjustment` still succeeds and deletes it normally (regression check — the guard must not block legitimate reversals).
3. In the UI, attempt to delete an already-applied adjustment from `CustomerARTransactions` — confirm the alert fires immediately without opening the confirm dialog.

### Phase 2 verification
1. **Split logic**: pick a customer with both an outstanding charge and an outstanding credit (e.g. one of ELISA HANEY's $200 credits — customer id `695627c679deedd16c6ed347`). Confirm `buildOutstandingCharges` output (log or inspect) contains both, with correct signs.
2. **Net-zero case** (credit fully covers charge): select a charge and credit combination where credit ≥ charge. Call `create_payment` with `apply_mode: 'selected'` and both ids in `selected_charge_ids`. Verify via SQL:
   - A new `CustomerPayments` row exists with `payment_method = 'credit_applied'`, `amount` = credit applied.
   - No `1010` GL row was created for this transaction; a GL row debiting the credit's `gl_account` and crediting `1100` exists for the applied amount.
   - The charge's `ar_paid` increased by the applied amount.
   - The credit's `ar_paid` decreased (more negative) by the applied amount.
   - `ar_applyto` on the new payment contains both a charge entry and a `credit_source` entry.
   - Query `get_customer_ar_summary('<today>', null)` and `get_customer_ar_opening_balance('<customer_id>', '<tomorrow>')` — confirm they still agree with each other after this change (regression check against the work done earlier this session).
3. **Partial-cash case** (credit doesn't fully cover charge): select a charge larger than available credit. Confirm: real `CustomerPayments` row created for exactly `netCashNeeded` (not the full charge amount), `1010`/`1100` GL for that net amount, plus the credit-consumption GL/`ar_paid` updates from step 2, and the charge fully paid via the combination.
4. **Reversal round-trip** (highest priority test): take the payment created in test 2 (net-zero, credit-funded). Call `reverse_payment` with its id. Verify: the charge's `ar_paid` returns to its pre-application value, the credit's `ar_paid` returns to its pre-application value (restored, not left consumed), the `CustomerPayments` row is deleted, and GL reversal entries were posted. Re-run the AR Summary/AR Transactions agreement check from test 2 to confirm balances are back to their original state.
5. **Oldest-first auto-credit**: for a customer with available credit, submit a payment via `apply_mode: 'oldest'` for an amount larger than one outstanding charge. Confirm available credit was automatically folded in without being explicitly selected, and `netCashNeeded` reflects that.
6. **Real-data spot check**: apply one of ELISA HANEY's $200 credits for real, and one of KEN'S AUTO's credits for real. Confirm balances move correctly and AR Summary/AR Transactions remain in agreement after each.
7. **Cash-drawer exclusion**: confirm the `'credit_applied'` payment created in test 2 does not appear in `CashDrawer.jsx`'s cash-drawer view (query `CustomerPayments` where `deposited is null or deposited = false` and confirm the row is present in that raw query, but manually confirm in the UI it does not render as a cash-drawer bucket item, per the `paymentMethods` array exclusion mechanism documented in §2 — this is expected to just work, but must be confirmed, not assumed).

### Phase 3 verification (manual UI walkthrough)
1. Open Take Payment for a customer with both a charge and sufficient credit. Confirm the breakdown display (charges/credit/net) renders correctly as selections change.
2. Select charge + credit such that net ≤ $0. Confirm the "Payment Details" dialog is skipped and submission succeeds directly.
3. Select a charge with insufficient credit to fully cover it. Confirm the Payment Details dialog still appears (real payment still needed) and shows the correct (net) amount.
4. Submit a "Pay On Account (Oldest First)" payment for a credit-holding customer and confirm the resulting balance matches what direct SQL/backend verification predicted in Phase 2 test 5.
5. Confirm the AR Transactions "Payments" tab displays the new `credit_applied` record sensibly (method label, amount, description) — check `formatPaymentMethod` in `CustomerARTransactions.jsx` renders `'credit_applied'` as a readable label (it title-cases and replaces underscores automatically, so this should already work, but confirm visually).
