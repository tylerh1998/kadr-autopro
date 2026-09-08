# Troubleshooting Report — Cancelling a Supplier Payment Leaves the Bank Transaction Behind

**Date:** 2026-09-07
**Reported by:** Program Administrator
**Status:** Root cause identified — **no code changed, no fix executed** (awaiting approval)
**Supabase project:** `hbcrwkmgsazqrvsrmxyr` (single project — all environments)

---

## 1) Executive Summary

**TL;DR —** The **deployed** `autopro-cancelSupplierPayment` Edge Function looks for the payment's
bank transaction using the wrong tag: it queries `BankTransaction` for
`source_type = 'payment'`, but supplier payments are written with
`source_type = 'supplier_payment'`. The lookup returns **zero rows**, so the function
silently skips deleting the bank transaction **and** skips posting the GL reversal for the
bank side — then deletes the `SupplierPayment` row anyway and returns `{ success: true }`.

The user sees "Payment cancelled successfully", the payment vanishes from Payment History,
but the money movement stays in the bank register and the general ledger.

- **Top suspect (confirmed):** Deployment drift. The one-line fix for this exact bug was
  committed **2026-08-09** (`dc8240d8` "Cancel Payment fix") and is present on both `main`
  and `development` — but the function was last deployed to Supabase **2026-08-03** and the
  fix was **never pushed to production**. The live function still runs the original buggy code
  from commit `2fcffc07`.
- **Recommended next step:** Redeploy `autopro-cancelSupplierPayment` from the current repo
  source (fixes it going forward), then remediate the historical orphan rows (see §6). Decide
  separately whether to also convert cancel from *hard-delete* to *reversal-entry* per the
  `CancelPaymentModal` pattern (user's stated preference — larger change, §6 Path B).

**Live damage already on the books (verified):** 2 phantom **$10,000** bank debits to
"Payment to MIDWAY DISTRIBUTORS LTD." (2026-08-27) on the **Primary - Servus** account, each
with its 2 original GL rows **un-reversed**. That account's `current_balance` is **-$5,805.07**
and is understated by ~**$20,000** because of these two phantoms. Plus 5 older/misc orphan
rows and 5 zero-dollar LOC "junk" bank rows (separate secondary bug, §3).

---

## 2) Issue Definition & Evidence

### Observed vs. expected

| | Behaviour |
|---|---|
| **Expected** (per `master_context.md` §4.5 and repo source) | Cancel → validate the linked `BankTransaction` (reject if `cleared`/`reconciled`) → delete it → reverse `paid_amount` on invoice lines → post a GL reversal → delete the payment row → recalc bank balances. |
| **Actual (deployed)** | For `Bank Account` / `Cheque` payments: bank-transaction lookup finds nothing → **no bank row deleted**, **no GL reversal posted**, `linkedAccountId` stays `null`. Invoice-line `paid_amount` *is* reversed, and the `SupplierPayment` row *is* deleted. Function returns `{ success: true }`. |

### Evidence

**A. The deployed function queries the wrong `source_type`.**
`get_edge_function(hbcrwkmgsazqrvsrmxyr, autopro-cancelSupplierPayment)` — live `index.ts`, version 9, `updated_at` ≈ 2026-08-03:

```js
if (payment.payment_method === 'Bank Account' || payment.payment_method === 'Cheque') {
  const { data: bankTxArr } = await supabase
    .from('BankTransaction')
    .select('*')
    .eq('source_id', payment.id)
    .eq('source_type', 'payment');        // ← DEPLOYED: wrong tag
```

Repo source — `supabase/functions/autopro-cancelSupplierPayment/index.ts:95` on **both** `main`
and `development`:

```js
    .eq('source_type', 'supplier_payment');   // ← REPO: correct tag (fix dc8240d8, 2026-08-09)
```

**B. Supplier payments write `source_type = 'supplier_payment'`.**
Deployed `autopro-executeSupplierPayment` (v9) builds `transactionPayload.source_type = 'supplier_payment'`
and passes it to the `process_payment_atomic` RPC. `pg_get_functiondef('process_payment_atomic')`:

```sql
INSERT INTO public."BankTransaction" (id, bank_account_id, transaction_date, description,
    credit_amount, debit_amount, source_type, source_id)
VALUES ( gen_random_uuid()::text, (p_bank_tx->>'bank_account_id')::text, v_payment_date::text,
    (p_bank_tx->>'description')::text,
    COALESCE((p_bank_tx->>'credit')::double precision, 0),
    COALESCE((p_bank_tx->>'debit')::double precision, 0),
    (p_bank_tx->>'source_type')::text,   -- = 'supplier_payment'
    p_payment_id );
```

`SELECT source_type, count(*) FROM "BankTransaction" GROUP BY 1` →
`supplier_payment: 182`, `payment: 423` (the `payment` rows are paycheque/WO batch payments —
a different flow). The deployed cancel function's filter matches the wrong population entirely.

**C. No trigger rewrites the tag.** `information_schema.triggers` → **no triggers** on
`BankTransaction`, `GLTransaction`, `SupplierPayment`, or `SupplierInvoiceLine`.
`process_payment_atomic` has a **single** overload `(text, jsonb, jsonb)`, `SECURITY INVOKER`.

**D. Orphan rows prove the failure has been happening in production.**
`BankTransaction` rows with `source_type='supplier_payment'` whose `source_id` no longer exists
in `SupplierPayment` (i.e. the payment was cancelled but the bank row survived):

| bucket | rows | Σ debit | Σ credit | cleared | reconciled |
|---|---|---|---|---|---|
| has amount (Bank/Cheque) | 5 | **$20,264.42** | $100.00 | 0 | 0 |
| zero-dollar (LOC junk — secondary bug) | 5 | $0 | $0 | 0 | 0 |

Material orphans, with GL-reversal status:

| bank_tx_id | source_id | date | description | debit | orig GL rows | REVERSAL GL rows |
|---|---|---|---|---|---|---|
| `60343695…` | `f11de0e9671f40c4ab8940ca` | 2026-08-27 | Payment to MIDWAY DISTRIBUTORS LTD. | **10000.00** | 2 | **0** |
| `9ef8b686…` | `a926394dffd04f719842f630` | 2026-08-27 | Payment to MIDWAY DISTRIBUTORS LTD. | **10000.00** | 2 | **0** |
| `aba3952b…` | `c9cc4cf3ff2247a5bdb50810` | 2026-07-17 | LOC Payment: Inv 20260609 | 166.87 | 0 | 0 |
| `fc065412…` | `6d5f1edde2694cb8925f0ec2` | 2026-06-05 | LOC Payment: Inv 20260605 | 97.55 | 0 | 0 |
| `2a7ffc2e…` | `YOUR_PAYMENT_ID` | 2026-07-17 | Payment to Supplier | (credit 100) | 0 | 0 |

- The two **MIDWAY $10,000** rows are the current-code failure: created by `process_payment_atomic`
  (`gen_random_uuid` ids), original GL rows still present, **no reversal**. A third identical
  MIDWAY $10,000 row (`ba2743d6…`) still has a live `SupplierPayment` — that's the real payment.
  Net: the shop paid MIDWAY $10k once; the bank register and GL show **$30k**.
- `LOC Payment: Inv …` rows are from an **older pre-RPC code path** (different description format,
  `bank_account_id` actually holds a *LinesOfCredit* id, no `supplier_payment` GL rows) — not
  this bug, but they are also orphaned.
- `YOUR_PAYMENT_ID` / `YOUR_BANK_ID` is a **developer test row** left from a raw RPC call.

**E. Bank balance impact.** `BankAccount` `68b95ed97223c7b3d2882f5d` = **"Primary - Servus"**
(GL `1001`), `current_balance` = **-5805.08**. Remove the two phantom $10k debits and the real
balance is ≈ **+$14,195**. `autopro-calculateBankBalances` sums `BankTransaction` rows, so the
phantoms directly corrupt the displayed balance.

**F. Frontend masks the failure.** `src/pages/SupplierTx.jsx:821` `handleCancelPayment` →
`supabase.functions.invoke('autopro-cancelSupplierPayment', …)` → on `response.data.success`
shows `alert('Payment cancelled successfully.')`. The deployed function returns `success: true`
even when it deleted nothing on the bank side.

### Timeline

| date | event |
|---|---|
| ~2026-08-03 | `2fcffc07` "Partial 9B & 13D" — both functions first deployed. `cancelSupplierPayment` ships with `.eq('source_type', 'payment')` — **bug present from day one.** |
| 2026-08-09 12:39 | `dc8240d8` "Cancel Payment fix" — commit changes `'payment'` → `'supplier_payment'`. Lands on `development` and later `main` (PR #14, 2026-08-31). |
| 2026-08-09 | `blueprint_verification_plan.md`: "Supplier payment — full cycle, then cancel — FULLY PASSED — real bug found and fixed live". **Most likely tested against the (then-live) dev-branch project `sitihbdnuxifwibontcm`; production was never redeployed.** |
| 2026-08-27 | Two $10,000 MIDWAY payments made + cancelled in production → two phantom bank debits + un-reversed GL. |
| 2026-09-01 | Dev-branch project decommissioned; all envs → `hbcrwkmgsazqrvsrmxyr`. |
| 2026-09-07 | User cancels a supplier payment, bank transaction still present → this report. |

---

## 3) Potential Root Causes (ranked)

### HIGH — `source_type` mismatch in the deployed function (deployment drift)
**Confirmed.** Deployed code filters `BankTransaction` on `source_type = 'payment'`; rows are
tagged `supplier_payment`. Lookup returns nothing → bank delete skipped, `linkedAccountType`
stays `null` → the `if (creditAccountId)` GL-reversal block never runs → payment row deleted
regardless. The repo fix (`dc8240d8`, 2026-08-09) exists but was never deployed to
`hbcrwkmgsazqrvsrmxyr`. This alone fully explains the reported symptom for `Bank Account` /
`Cheque` payments.

### MEDIUM — `process_payment_atomic` always inserts a `BankTransaction`, even for Line-of-Credit payments
**Confirmed, secondary.** For `payment_method = 'Line of Credit'`, `executeSupplierPayment`
passes a LOC-shaped payload (`line_of_credit_id`, `charge_amount`, …) as `p_bank_tx`. The RPC
unconditionally runs its step-3 `INSERT INTO "BankTransaction"`, reading `->>'bank_account_id'`
(NULL) and `->>'debit'`/`->>'credit'` (NULL → `0`). Result: a **zero-dollar `BankTransaction`
with `bank_account_id = NULL`, `source_type = 'supplier_payment'`** on every LOC supplier
payment. Cancel (both deployed and fixed) takes the LOC branch and never cleans this row up →
the 5 zero-dollar orphans. No dollar or GL impact, but it pollutes the table and any
`source_type='supplier_payment'` aggregate. Independent of the HIGH cause; a complete fix
should address both.

### LOW — Cancel is destructive (hard-delete) rather than a reversal
Not a *defect*, but the design the user wants changed. Even the fixed function `DELETE`s the
`BankTransaction` and `SupplierPayment` rows outright and blocks entirely if the bank row is
`cleared`/`reconciled`. `autopro-cancelLineOfCreditPayment` and
`src/components/paypro/paystubs/CancelPaymentModal.jsx` instead post **offsetting** rows and
keep originals for audit (`is_reversed`/`reversed_by_id`). See §6 Path B.

### LOW — `master_context.md` §4.5 describes behaviour the deployed code does not have
The doc's "locates and validates the linked `BankTransaction` … posts a GL reversal" describes
the *intended* / repo behaviour. Deployed reality diverges. Flagged per project rules — this is
a documentation-vs-deployment conflict, and the divergence is the bug.

### RULED OUT
- RLS blocking the lookup — the function uses the **service-role** key (bypasses RLS).
- A second `process_payment_atomic` overload / a trigger retagging `source_type` — neither exists.
- `payment_method` enum drift (e.g. `'bank_account'` vs `'Bank Account'`) — live rows confirm
  the stored value is exactly `'Bank Account'` / `'Cheque'` / `'Line of Credit'`.

---

## 4) Assumptions & Verification Audit

### VERIFIED
- **[V]** Deployed `autopro-cancelSupplierPayment` v9 filters `BankTransaction` on
  `source_type = 'payment'` — `get_edge_function`, live content.
- **[V]** Deployed `autopro-executeSupplierPayment` v9 + `process_payment_atomic` write
  `BankTransaction.source_type = 'supplier_payment'`, `source_id = <payment id>` — `get_edge_function`,
  `pg_get_functiondef`.
- **[V]** Repo `index.ts:95` = `'supplier_payment'` on **both** `main` and `development`; changed
  by `dc8240d8` (2026-08-09); function introduced by `2fcffc07`.
- **[V]** `process_payment_atomic` — exactly one overload, `SECURITY INVOKER`, and its step-3
  bank insert is unconditional.
- **[V]** No triggers on `BankTransaction` / `GLTransaction` / `SupplierPayment` / `SupplierInvoiceLine`.
- **[V]** 10 orphan `supplier_payment` bank rows (5 with amounts totalling $20,264.42 dr / $100 cr,
  5 zero-dollar with `bank_account_id IS NULL`); none `cleared` or `reconciled`.
- **[V]** The two 2026-08-27 MIDWAY $10k orphans still have 2 original GL rows each and **0**
  reversal rows.
- **[V]** "Primary - Servus" (`68b95ed9…`, GL `1001`) `current_balance` = `-5805.0797`.
- **[V]** `SupplierPayment` has **no** `bank_transaction_id` (or any `bank%`) column, so
  `SupplierTxPaymentHistoryTab.jsx:45`'s `payment.bank_transaction_id` is always `undefined`.
- **[V]** Frontend reports success purely on `response.data.success`.

### ASSUMED (and how to verify)
- **[A] The payment the user just cancelled was `Bank Account` or `Cheque` (not LOC).**
  High confidence ("went into the bank"). *Verify:* ask the user which payment / method, or
  check `query_logs` (`function_edge_logs`, slug `autopro-cancelSupplierPayment`) for the last
  24h and cross-check the `paymentId` against a now-orphaned `BankTransaction`.
- **[A] The 2026-08-09 "FULLY PASSED" cancel test ran against the old dev-branch project, not prod.**
  Plausible given the timeline and the project's documented dev/prod deploy-drift history.
  *Verify:* not fully verifiable — dev project `sitihbdnuxifwibontcm` was decommissioned
  2026-09-01. Not load-bearing for the fix.
- **[A] No *other* caller invokes `autopro-cancelSupplierPayment`.** *Verify:* `grep -rn
  "cancelSupplierPayment" src/` → only `src/pages/SupplierTx.jsx:826` (checked during triage;
  re-confirm before shipping).
- **[A] `autopro-calculateBankBalances` derives balance purely from `BankTransaction` rows**
  (so deleting/reversing the phantoms will self-correct the displayed balance). *Verify:* read
  `supabase/functions/autopro-calculateBankBalances/index.ts` before remediation.
- **[A] The `LOC Payment: Inv …` orphans are truly legacy and have no matching live
  `LinesOfCreditTransaction` / GL that a cleanup would break.** *Verify:* per-row check of
  `LinesOfCreditTransaction` and `GLTransaction` by that `source_id` before touching them.

---

## 5) Diagnostic & Isolation Steps (to confirm before fixing)

1. **Confirm the live symptom maps to this cause.**
   `query_logs` on `function_edge_logs` for `autopro-cancelSupplierPayment`, last 24h → get the
   `paymentId` from the user's cancel. Then:
   ```sql
   SELECT * FROM "BankTransaction" WHERE source_id = '<paymentId>';
   SELECT * FROM "GLTransaction"  WHERE source_id = '<paymentId>';
   SELECT * FROM "SupplierPayment" WHERE id = '<paymentId>';   -- expect 0 rows
   ```
   Expect: bank row present (`source_type='supplier_payment'`), 2 original GL rows, no
   `REVERSAL` GL rows, payment gone.

2. **Prove the filter is the whole story** — re-run the deployed lookup vs the fixed lookup:
   ```sql
   SELECT count(*) FROM "BankTransaction" WHERE source_id='<paymentId>' AND source_type='payment';          -- 0
   SELECT count(*) FROM "BankTransaction" WHERE source_id='<paymentId>' AND source_type='supplier_payment'; -- 1
   ```

3. **Scope the historical damage** (full list, not just the sample):
   ```sql
   SELECT bt.*, 
          (SELECT count(*) FROM "GLTransaction" g WHERE g.source_id=bt.source_id AND g.source_type='supplier_payment') orig_gl,
          (SELECT count(*) FROM "GLTransaction" g WHERE g.source_id=bt.source_id AND g.description ILIKE 'REVERSAL%') rev_gl
   FROM "BankTransaction" bt
   LEFT JOIN "SupplierPayment" sp ON sp.id = bt.source_id
   WHERE bt.source_type='supplier_payment' AND sp.id IS NULL
   ORDER BY bt.transaction_date DESC;
   ```
   Also check for the inverse (bank row *and* payment both gone but invoice `paid_amount` never
   reversed) and for **cleared/reconciled** orphans (those can't be simply deleted — need a
   dated reversal instead).

4. **Check `autopro-calculateBankBalances`** reads only `BankTransaction` (no cached column that
   also needs correcting).

5. **Confirm no other deploy drift on this flow** — diff repo vs `get_edge_function` for
   `autopro-processSupplierPayment`, `autopro-calculateBankBalances` (execute + RPC already
   confirmed to match).

---

## 6) Proposed Resolution / Implementation Strategy

Three separable pieces. **1 is required; 2 is required to clean the books; 3 is the user's
design preference and can follow.**

### Piece 1 — Fix the code (forward-going)

**Path A — minimal (fastest, lowest risk).**
The repo already contains the correct source. Redeploy `autopro-cancelSupplierPayment` to
`hbcrwkmgsazqrvsrmxyr` from the current `development` / `main` source (they're identical on the
relevant lines). No code change needed for the reported symptom. Then:
- Add the missing **LOC junk** cleanup: in the `Line of Credit` branch (or unconditionally at
  the end), also delete any `BankTransaction` with `source_id = payment.id AND
  source_type = 'supplier_payment'` — covers the RPC's always-inserted zero-dollar row.
- *Better:* fix `process_payment_atomic` so step 3 only inserts a `BankTransaction` when
  `p_bank_tx ? 'bank_account_id'` (i.e. skip it entirely for LOC). This stops new junk rows at
  the source and is a small, well-scoped RPC migration (`autopro-`-prefixed edge functions
  unaffected; migration file per the project's dual-history versioning rule — now single project,
  so one file).
- Consider hardening the deployed fiscal-period check: the current function only blocks when a
  covering `FiscalPeriod` exists **and** `is_closed`; it does **not** fail closed when no period
  covers the date. The rest of the app uses the shared `checkFiscalPeriodStatus()` contract
  (`master_context.md` §4 Fiscal Period gate). Align it.

**Path B — reversal instead of delete (user's stated preference: "replicate the
CancelPaymentModal flow of reversing where applicable").**
Rework `autopro-cancelSupplierPayment` to mirror `autopro-cancelLineOfCreditPayment` /
`CancelPaymentModal.jsx`:
- Fetch the original `GLTransaction` rows (`source_id = payment.id`, `source_type =
  'supplier_payment'`) and insert exact-inverse rows (`debit ↔ credit`), `source_type =
  'supplier_payment_reversal'`, dated to the cancellation date (fiscal-gated on *that* date).
- Insert an offsetting `BankTransaction` (or `LinesOfCreditTransaction`) rather than deleting
  the original; set `is_reversed` / `reversed_by_id` on both rows (columns already exist —
  note `BankTransaction.is_reversed` is `text`).
- Keep the `SupplierInvoiceLine.paid_amount` unwind (already correct).
- **Stop deleting the `SupplierPayment` row** — mark it cancelled/reversed instead (needs a
  status value or a nullable `reversed_*` column; `SupplierPayment.status` already exists —
  values seen: `pending` / `processing` / `completed` / `failed`).
- This removes the "can't cancel a cleared/reconciled payment" hard stop — a reversal is safe
  even when the original is reconciled, because the original row is untouched.
- Frontend: `SupplierTx.jsx` payment-history list + `SupplierTxPaymentHistoryTab.jsx` need to
  show reversed payments distinctly (and hide/disable the cancel button on them). The dead
  `payment.bank_transaction_id` reference at `SupplierTxPaymentHistoryTab.jsx:45` can be
  cleaned up in the same pass.

*Recommendation:* ship **Path A** now (stops the bleeding, ~1 line + redeploy + optional LOC
cleanup), then schedule **Path B** as a proper phased change with its own plan — it touches the
GL, the AP module, and the Banking module and needs real test coverage.

### Piece 2 — Remediate the historical orphans (data, production)

Needs its own reviewed migration/script + a backup snapshot first. Rough shape:
- **2× MIDWAY $10,000 (`f11de0e9…`, `a926394d…`):** the true intent was "cancelled". Either
  (a) delete the phantom `BankTransaction` + its 2 original GL rows + reverse the invoice-line
  `paid_amount` if not already done, or (b) post dated reversals for all of it. Decide with the
  user which (matches whichever direction Piece 1 goes). Then re-run
  `autopro-calculateBankBalances` for `68b95ed9…`.
- **`LOC Payment: Inv …` (`c9cc4cf3…`, `6d5f1edde…`):** verify against `LinesOfCreditTransaction`
  / GL, then clean up; likely legacy, but confirm per-row.
- **`YOUR_PAYMENT_ID` test row:** delete outright.
- **5 zero-dollar LOC junk rows:** delete (`bank_account_id IS NULL`, `$0`, no GL, no balance
  impact).
- Re-run the §5.3 orphan query afterward → expect 0 rows.

### Piece 3 — Documentation

Update `master_context.md` §4.5 to describe the *actual* cancel behaviour once fixed, and add
this incident to the deploy-drift ledger (§"Schema replayed ≠ deployed") — a git-committed fix
(`dc8240d8`, 2026-08-09) that sat undeployed for a month, matching the existing P12 lesson.
Correct the `blueprint_verification_plan.md` "fixed live / FULLY PASSED" note (archived file —
add a dated correction rather than rewriting).

### Naming / rules compliance
No new Edge Functions proposed. If Piece 1 adds an RPC migration for `process_payment_atomic`,
it's a DB migration, not an Edge Function — no prefix rule applies. Any new function would be
`autopro-[name]`.

---

## Appendix — key identifiers

- Function: `autopro-cancelSupplierPayment` (deployed v9, `d0799e64-…`), `autopro-executeSupplierPayment` (deployed v9, `9cadcd54-…`)
- RPC: `process_payment_atomic(text, jsonb, jsonb)` — `SECURITY INVOKER`
- Buggy line (deployed): `source_type = 'payment'` in the `Bank Account` / `Cheque` branch
- Fix commit (undeployed to prod): `dc8240d8` "Cancel Payment fix", 2026-08-09
- Phantom rows: `BankTransaction.id` `60343695-bc4a-423f-b8d0-263c56a337d0`, `9ef8b686-ea5f-4229-be98-6e1def2e97de`
- Affected bank account: `68b95ed97223c7b3d2882f5d` "Primary - Servus", GL `1001`, balance `-5805.08`
- Frontend caller: `src/pages/SupplierTx.jsx:821` `handleCancelPayment`
