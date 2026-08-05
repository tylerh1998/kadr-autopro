# CustomerARTransactions Page: Verification + processCustomerARAccounting Migration Plan

**Status:** #1 (getOutstandingARItems direct-RPC fix) — code committed and pushed, reported live by user. **Needs live verification (not yet done this session).** #2 (processCustomerARAccounting migration) — **not started, plan only, awaiting go-ahead.**
**Parent:** Grew out of the original "AR Transactions page loads no data" bug report on `test.kensauto.ca` (customerId `695627c79d59d651fdea8a3a`, Austin Unruh).
**Prepared:** 2026-08-04 (session context being cleared after this doc is written — this doc is the full handoff).

---

## 0) Essential background (read this before doing anything)

### The root architectural bug that started all of this

This app has **two Supabase projects**:
- **`hbcrwkmgsazqrvsrmxyr`** — "KADR", the `main` git branch / production project.
- **`sitihbdnuxifwibontcm`** — the `development` git branch's Supabase **branch** project. **`test.kensauto.ca` runs against this one, not `hbcrwkmgsazqrvsrmxyr`.** This tripped us up once already this session — always confirm which project a fix landed on when testing against `test.kensauto.ca`.

Users authenticate via a myKADR SSO flow whose JWTs are issued by `sitihbdnuxifwibontcm`'s auth server even when the app itself is meant to run against `hbcrwkmgsazqrvsrmxyr` in production — the two are related via Supabase's branching feature (`sitihbdnuxifwibontcm` is a branch of `hbcrwkmgsazqrvsrmxyr`).

The legacy `base44-proxy` Supabase Edge Function (`supabase/functions/base44-proxy/index.ts`) does a manual `supabase.auth.getUser(token)` check before forwarding requests to the old Base44 backend. **This call always fails (401)** for this app's users, because `auth.getUser()` requires the user to exist natively in that project's own `auth.users` table — which third-party/cross-branch-issued JWTs don't satisfy, even though the same JWT is perfectly valid for direct PostgREST table/RPC access (confirmed: Supabase's Third-Party Auth trust covers PostgREST-level and Edge-Function-gateway-level (`verify_jwt: true`) validation, just not `auth.getUser()`'s user-table lookup).

**Practical consequence:** every `base44.functions.invoke(...)` call in the frontend (routed through `base44-proxy`) fails with 401, for every user, always. Any AR feature still calling a base44 function is broken. The fix pattern established this session: **port the base44 function's logic into a native `autopro-*` Supabase Edge Function** (or, even better, call the underlying RPC directly from the frontend when the base44 function was just a thin wrapper — see §0.3), deployed with `verify_jwt: true` (the gateway already trusts these tokens; the bug is specifically inside `auth.getUser()`, so simply not calling it fixes everything).

### 0.2 Fixes already completed and live (do not redo)

1. **`getCustomerARData`** (base44) → **`autopro-getCustomerARData`** (new Supabase Edge Function, `supabase/functions/autopro-getCustomerARData/index.ts`). Deployed to **both** projects. Frontend (`src/pages/CustomerARTransactions.jsx`) calls it via `supabase.functions.invoke('autopro-getCustomerARData', ...)`. This fixed the original "no AR data loads" bug. Verified live in browser on both `hbcrwkmgsazqrvsrmxyr` and `sitihbdnuxifwibontcm`.
2. **Streamlined to a single RPC call**: `autopro-getCustomerARData` now makes exactly **one** `supabase.rpc('get_customer_ar_transaction_page', ...)` call instead of the original 6 (3 RPCs + 3 conditional follow-up table fetches, 2 of which were pure redundant re-fetches). New RPC `get_customer_ar_transaction_page(p_customer_id, p_start_date, p_end_date)` returns `{transactions: jsonb, opening_balance: numeric, current_balance: numeric}` in one row — transactions include embedded `work_order` objects (via the RPC's existing `WorkOrder` join, widened to include the extra columns the edge function needed) so no separate `WorkOrder`/`CustomerPayments`/`CustomerARAdjustment` follow-up queries are needed. **Currently only deployed/verified on `sitihbdnuxifwibontcm` (dev)** — porting to `hbcrwkmgsazqrvsrmxyr` (main) was offered but not yet requested/done. Confirmed via `pg_proc`/grep that neither `get_customer_ar_data_v2` nor `get_customer_ar_opening_balance` (the two RPCs it replaced) have any other callers anywhere in the codebase or database — safe to have replaced/left orphaned.
3. **Found and fixed a real pre-existing date-shift bug** while verifying #2: `payment_date`/`adjustment_date` columns are plain `YYYY-MM-DD` **text** with no time component. The original RPC computed display dates via `col::TIMESTAMPTZ AT TIME ZONE 'America/Edmonton'`, which assumes UTC midnight and shifts the date back one calendar day when converted to Mountain time. Fixed by casting directly to `col::DATE` instead (no timezone conversion needed since there's no time to convert). This bug was **latent in the original code too** — masked for `payment`/`adjustment`-sourced rows by a redundant secondary fetch that grabbed the raw text value directly, but **not** masked for `charge`-sourced rows whenever the linked `WorkOrder` was missing (which is how it was caught — a `CustomerPayments` row on the dev branch referenced a `work_order_id` that doesn't exist there, exposing the fallback path). Fixed in `get_customer_ar_transaction_page` (dev branch only so far).
4. **Data gap found and fixed (dev branch only, not a code bug):** `CustomerARAdjustment` table was **completely empty** on `sitihbdnuxifwibontcm` (0 rows) vs. 135 rows on `hbcrwkmgsazqrvsrmxyr`. Copied all 135 rows across via direct SQL (`ON CONFLICT (id) DO NOTHING`, idempotent, nothing else touched). Verified count matches (135 = 135) and adjustments now render correctly in the UI.
5. **Related data gap noted, not fixed (informational only):** the dev branch is also missing at least one `WorkOrder` row that exists in production (`id = 'ea70ad610b2641a0929525e0'`, RO51132) — this is how the date-shift bug in item 3 was discovered. Likely other `WorkOrder` rows are missing too on dev; not fixed, just flagged. Doesn't affect production.
6. **`getOutstandingARItems`** (base44) → **direct `supabase.rpc('get_outstanding_ar_items', {customer_id_val: customerId})` call from the frontend**, no Edge Function wrapper. This was a deliberate deviation from the pattern in item 1: the user pointed out that wrapping a trivial RPC passthrough in an Edge Function is redundant when the codebase already has an established convention of calling `supabase.rpc(...)` directly from many pages/components (confirmed via grep: `Customers.jsx`, `WorkOrders.jsx`, `InventoryList.jsx`, and ~15 other files already do this). Verified before implementing: `get_outstanding_ar_items(customer_id_val text)` already exists on `sitihbdnuxifwibontcm`, already has `EXECUTE` granted to both `anon` and `authenticated` roles, and its output shape (`id, type, reference, date, amount, ar_paid, balance, description, age_days`) matches what the frontend needs. Also fixed the **same date-shift bug** in this RPC (same root cause as item 3 — `payment_date`/`adjustment_date` cast via `TIMESTAMPTZ AT TIME ZONE` instead of direct `::DATE`; also fixed `age_days`, which was systematically off by one for the same reason). **This RPC fix is dev-branch only (`sitihbdnuxifwibontcm`) so far.**
   - `src/components/ar/StatementModal.jsx`: replaced `base44.functions.invoke('getOutstandingARItems', {customerId})` with `supabase.rpc('get_outstanding_ar_items', {customer_id_val: customer.id})`. Swapped the `base44` import for `supabase` (from `@/lib/supabase`) since `base44` is no longer used anywhere in this file.
   - `src/components/ar/TakePaymentModal.jsx`: same RPC swap for its `fetchOutstandingCharges` effect. **`base44` import was kept** in this file — `handleSubmit` (the actual "Submit Payment" button) still calls `base44.functions.invoke('processCustomerARAccounting', {action: 'create_payment', ...})`, which is still broken and is the subject of §2 below.
   - **User confirmed this was committed, pushed, and is live on `test.kensauto.ca`** — but this session did not get to re-verify it live in the browser before context ran low. **That live re-verification is §1 of this plan, and is the very next thing to do.**

### 0.3 Not yet fixed — still broken, live right now

- **Record Adjustment button** ("not letting me submit"): submits fine client-side (fiscal-period check uses a direct Supabase table query, unrelated to base44 — not the blocker), but the actual submit calls `base44.functions.invoke('processCustomerARAccounting', {action: 'create_adjustment', ...})` in `CustomerARTransactions.jsx`'s `handleRecordAdjustment`, which 401s. User sees a "Failed to record adjustment" alert, modal doesn't close. Confirmed live via console: `Error recording adjustment: AxiosError: Request failed with status code 401`.
- **Take Payment submit** ("Submit Payment" button inside the payment-details step): same `processCustomerARAccounting` function, `action: 'create_payment'`. The invoice list itself now loads correctly (fixed per §0.2 item 6) — only the final submit step is still broken.
- **Delete Payment / Delete Adjustment** (context-menu actions on existing transaction rows in `CustomerARTransactions.jsx`): also call `processCustomerARAccounting` (`action: 'reverse_payment'` / `'reverse_adjustment'`) — not yet tested live this session but will have the identical 401 failure by the same mechanism. Worth confirming in §1's verification pass.
- All four of the above share one root cause and one fix: migrating `processCustomerARAccounting` — this is §2 of this plan.

### 0.4 Standing rules (do not violate)

- **Dev branch (`sitihbdnuxifwibontcm`) first, verified, before touching production (`hbcrwkmgsazqrvsrmxyr`).** Established pattern all session.
- **Never touch the `main` git branch.** Current working branch is `development`.
- **The user commits and pushes manually** (they did so themselves between the last session and this one — confirmed "these changes were committed and pushed. Live."). Do not `git add`/`commit`/`push` unless explicitly asked.
- **Database DDL/function changes go through `apply_migration`** (tracked), not raw `execute_sql`, per the Supabase MCP server's own guidance. (Note: this session used `apply_migration` for all RPC changes — keep doing that.)
- **New Edge Functions in this project are named `autopro-*`.**
- **Before modifying any shared RPC/function, check for other callers first** (grep the repo + `pg_proc.prosrc` search on both projects) — this was done for every RPC touched so far and caught zero surprises, keep doing it.
- The `sitihbdnuxifwibontcm` branch shows `status: MIGRATIONS_FAILED` in `list_branches` — this is known, pre-existing git-tracked-migration drift (not a broken database). `apply_migration` calls have continued to land successfully on this branch all session. Not blocking.

---

## 1) Verification Plan — confirm the live `getOutstandingARItems` fix (do this first)

**Goal:** confirm, in the actual browser against `test.kensauto.ca`, that Statement of Account and Take Payment's invoice list now work, now that the code (§0.2 item 6) is committed, pushed, and live.

**Why this wasn't finished last session:** the fix was verified correct at the RPC/SQL level (direct `execute_sql` calls against `sitihbdnuxifwibontcm` returned correct data, e.g. `get_outstanding_ar_items('695627c79d59d651fdea8a3a')` returned Austin Unruh's one outstanding invoice with the correct date `2026-06-05` and `age_days: 60`), and the edited `.jsx` files were read back and confirmed syntactically clean — but the live frontend bundle on `test.kensauto.ca` had not yet picked up the change (still serving an older built bundle, `index-BTpKYccF.js`) when the session's context ran low. The user has since committed, pushed, and confirmed it's live — but no one has clicked through it in the browser yet.

### Steps

1. Navigate to `https://test.kensauto.ca/CustomerARTransactions?customerId=695627c79d59d651fdea8a3a` (Austin Unruh — known-good test customer, has one $756.87 on-account charge, INV40895/RO50918, dated 2026-06-05).
2. Click **Statement**. Expect: the statement iframe renders with the one outstanding transaction (date `Jun 5, 2026`, reference `INV40895`, $756.87), aged-balance breakdown populated, no "No transactions found for this customer" empty state, and a `statementPortalId` gets set (so the Email/Copy URL buttons in the footer appear). Check console for any residual errors (`read_console_messages`, `onlyErrors: true`) — expect **zero** 401s from this action now.
3. Close Statement, click **Take Payment**. Expect: the "Pay Specific Invoices" tab shows the one outstanding invoice (type `invoice`, reference `INV40895`, date `Jun 5, 2026`, age `~60 days`, balance `$756.87`) instead of "No outstanding charges." Check console for zero 401s from `fetchOutstandingCharges`.
4. **Do not click "Submit Payment"** in this verification pass — that still routes through the broken `processCustomerARAccounting` (§0.3) and will 401. Just confirm the invoice list loads; close the modal via Cancel.
5. Also worth a quick test against a **second customer** to be thorough — e.g. Hines Ranching (`customerId=695627c50887fec9ade1da33`, has one charge + one interest adjustment) — to confirm the fix isn't coincidentally only working for the single-transaction case.
6. While in the browser, also do a quick console-error check on **Delete Payment** / **Delete Adjustment** (right-click a transaction row → context menu) to confirm/document the exact current failure mode referenced in §0.3, since it wasn't explicitly tested last session (should also be a 401 via `processCustomerARAccounting`, but confirm rather than assume before scoping §2's testing).

**Exit criteria:** Statement of Account renders real transaction data with no console errors; Take Payment's invoice list populates with no console errors; both confirmed on at least 2 customers; Delete Payment/Adjustment failure mode confirmed and documented (informs §2 scope, doesn't need fixing until §2 lands).

**If something doesn't match expectations:** don't assume — re-check `sitihbdnuxifwibontcm` directly via `execute_sql` (`select * from get_outstanding_ar_items('<customerId>');`) to isolate whether it's a stale frontend bundle issue, a database issue, or a code issue in the committed `.jsx` files.

---

## 2) Implementation Plan — migrate `processCustomerARAccounting` (awaiting go-ahead, do not start without explicit confirmation)

**Source file:** `base44/functions/processCustomerARAccounting/entry.ts` (full contents already read this session — 805 lines, 5 actions).
**Target:** new Supabase Edge Function `supabase/functions/autopro-processCustomerARAccounting/index.ts`, deployed `verify_jwt: true` (matches the working pattern — the gateway already trusts this app's cross-project/SSO JWTs; the bug is specifically `auth.getUser()`, which this new function will not call).

### 2.1 Why this one is higher-stakes than everything fixed so far

Every fix so far this session was either **read-only** (`autopro-getCustomerARData`, `get_outstanding_ar_items`) or a **pure data copy** (the `CustomerARAdjustment` row sync). `processCustomerARAccounting` **writes real financial data**: it inserts `CustomerPayments`/`CustomerARAdjustment` rows and posts matching double-entry `GLTransaction` rows, and its reversal actions delete records and post reversing GL entries. A logic mistake here doesn't just show a blank UI — it can corrupt a customer's balance or throw the general ledger out of balance. This is why the user asked for a plan first rather than immediate implementation.

### 2.2 The 5 actions to port (all currently gated behind the same broken `base44.auth.me()` check)

1. **`create_payment`** — the most complex. Takes `customer_id, payment_date, payment_amount, payment_method, reference, apply_mode ('selected'|'oldest'), selected_charge_ids, credit_card_fee_amount`. Builds the customer's outstanding charges (`buildOutstandingCharges` helper — queries `CustomerPayments` + `CustomerARAdjustment` directly, not via `get_outstanding_ar_items`, note: **has its own separate, un-audited copy of similar logic** — worth checking during implementation whether it has the same date-shift bug pattern found elsewhere, since it does its own balance math), applies the payment either to specifically selected charges or oldest-first, inserts a `CustomerPayments` row, optionally inserts a credit-card-fee adjustment + GL rows, posts the main payment GL rows (debit `1010`/credit `1100`), applies amounts to each charge (updating `ar_paid` on `CustomerPayments` or `CustomerARAdjustment` rows), handles overpayment by creating an `overpayment: true` adjustment + GL rows if the payment exceeds what was applied, and finally updates the payment record's `ar_applyto` field (a custom-encoded string tracking what the payment was applied to, format `id:type:amount:description` comma-separated — used later by `reverse_payment` to know what to undo).
2. **`create_adjustment`** — simpler. Takes `adjustmentData {customer_id, adjustment_date, amount, gl_account, description, reference, ar_paid, overpayment}`, inserts a `CustomerARAdjustment` row, posts matching double-entry GL rows via `createAdjustmentGLRows` (debits/credits flip depending on whether `amount` is positive (charge) or negative (credit), against `1100` and the chosen `gl_account`).
3. **`reverse_payment`** — takes `payment_id`. Blocks if `payment.deposited === true`. Parses `ar_applyto` to figure out what the payment touched, un-applies `ar_paid` from each touched record, and — critically — has special logic (`isPaymentGeneratedAdjustment`) to detect adjustments that were **auto-created by the original payment** (credit-card fee adjustments matching reference `CCFEE-{payment.id}`, or overpayment adjustments matching `OVERPAY-{payment.id}`, plus a fallback heuristic matching same-date/same-customer/same-description/same-amount for older records that predate the reference-based tagging) — those get **fully reversed and deleted** (with their own reversing GL entries), while adjustments the payment merely *partially paid down* just get their `ar_paid` rolled back (not deleted). Posts a reversing GL entry for the payment itself, then deletes the `CustomerPayments` row.
4. **`reverse_adjustment`** — takes `adjustment_id`. Posts reversing GL rows via `reverseAdjustmentGLRows`, then deletes the adjustment. Simpler than `reverse_payment` since it doesn't need to untangle an `ar_applyto` chain.
5. **`apply_interest`** — takes `selectedCalculations` (array of `{customer, totalInterest, interestDetails}`). Bulk-inserts one `CustomerARAdjustment` row per customer plus matching GL rows. Called from the Interest Calculation flow, not directly from the 3 buttons on `CustomerARTransactions.jsx` — **confirm during implementation whether this action's caller (`InterestCalculationModal.jsx`, referenced from `CustomerARSummary.jsx`) is already broken the same way, or already migrated separately** — not confirmed either way this session.

### 2.3 The one real architectural gap: user identity for audit fields

The base44 version stamps `created_by`/`created_by_id` on adjustments and GL rows using base44's own authenticated user object (`user.email`, `user.id`, obtained via `base44.auth.me()` — the same call that's broken). There's no direct equivalent once the base44 SDK is dropped.

**Proposed fix** (mirrors what `base44-proxy` already does correctly for this exact problem, just without the broken `auth.getUser()` call):
1. Read the `Authorization: Bearer <jwt>` header from the incoming request.
2. **Decode the JWT payload directly** (base64-decode the middle segment, no network call — this is what avoids the original bug, since we're not asking Postgres/GoTrue to validate a user record exists) to get the caller's `sub` (myKADR user id) and `email`.
3. Look up `Employee` by `mykadr_user_id = <sub>` (same table/column `base44-proxy` already uses) to get `autopro_user_id` and a display name/email for the `created_by`/`created_by_id` fields.
4. If no `Employee` mapping exists for that user, decide on a fallback (options: reject the request like `base44-proxy` does with its 403 "Account mapping missing" error, or fall back to the raw JWT email with a null `created_by_id` — **needs a decision before implementation**, not yet decided).

### 2.4 Testing plan before considering this done

1. Deploy to **`sitihbdnuxifwibontcm` (dev) only** first.
2. Pick a real dev-branch test customer (Austin Unruh `695627c79d59d651fdea8a3a` or Hines Ranching `695627c50887fec9ade1da33` — both already used and known-good this session) and exercise every action end-to-end:
   - `create_adjustment`: record a small test adjustment (e.g. $1.00 charge, some throwaway GL account), confirm it appears on the AR Transactions page, confirm matching `GLTransaction` rows exist and balance (debit total == credit total for that reference).
   - `create_payment` — "Pay Specific Invoices" mode: pay off the test adjustment (or a real small outstanding charge) via `apply_mode: 'selected'`. Confirm `ar_paid` updates correctly, GL rows post and balance, `ar_applyto` gets built correctly.
   - `create_payment` — "Pay On Account (Oldest First)" mode with a credit-card payment method: confirm the 3% fee adjustment gets created with the right reference tag (`CCFEE-{payment.id}`) and its own balanced GL rows.
   - `create_payment` with an amount exceeding all outstanding charges: confirm the overpayment adjustment gets created correctly (`OVERPAY-{payment.id}`, `overpayment: true`).
   - `reverse_payment`: reverse the payment created above. Confirm: the `CustomerPayments` row is gone, any auto-generated CC-fee/overpayment adjustments it created are also gone (with their own reversing GL rows), any charges it only partially paid down have `ar_paid` correctly rolled back (not deleted), and the reversing GL entry for the payment itself balances.
   - `reverse_adjustment`: reverse the standalone test adjustment created above. Confirm it's deleted and its reversing GL entry balances.
   - `apply_interest`: only test if §2.2 item 5's caller-status question resolves to "yes, this needs fixing too" — otherwise may be out of scope for this pass.
3. **Clean up all test data created during testing** (delete the throwaway GL account use if a dedicated test GL account was used, confirm no stray rows left in `CustomerPayments`/`CustomerARAdjustment`/`GLTransaction` on the dev branch from this testing).
4. Update the 3 (or 4, if Delete confirmed broken in §1) frontend call sites (`CustomerARTransactions.jsx`'s `handleRecordAdjustment`/`confirmDeletePayment`/`confirmDeleteAdjustment`, and `TakePaymentModal.jsx`'s `handleSubmit`) from `base44.functions.invoke('processCustomerARAccounting', ...)` to `supabase.functions.invoke('autopro-processCustomerARAccounting', ...)`, adjusting response handling from axios-style (`response.data.X`, thrown errors) to supabase-js style (`{data, error}`).
5. Only after all of the above passes cleanly: report back and ask before porting to `hbcrwkmgsazqrvsrmxyr` (production) — same dev-first-then-confirm pattern as every other change this session.

**Exit criteria:** all 5 actions (or 4, if `apply_interest` is confirmed out of scope) work correctly on dev with balanced GL postings verified by direct SQL query, reversal actions confirmed to fully undo their forward action, frontend call sites updated and verified live in browser, before any production porting is even discussed.

---

## 3) Key reference facts (for quick lookup without re-deriving)

- **Production/main Supabase project:** `hbcrwkmgsazqrvsrmxyr`
- **Dev branch Supabase project (what `test.kensauto.ca` actually runs against):** `sitihbdnuxifwibontcm`
- **Test customers used this session:** Austin Unruh (`695627c79d59d651fdea8a3a`, one $756.87 on-account charge, INV40895/RO50918, dated 2026-06-05), Hines Ranching (`695627c50887fec9ade1da33`, one charge + one $1.96 interest adjustment, total $99.72)
- **RPCs involved:** `get_customer_ar_transaction_page` (new, replaces `get_customer_ar_data_v2` + 2×`get_customer_ar_opening_balance` calls), `get_outstanding_ar_items` (existing, now called directly from frontend)
- **Edge Functions involved:** `autopro-getCustomerARData` (done), `autopro-processCustomerARAccounting` (not yet created — §2)
- **Files touched so far:** `supabase/functions/autopro-getCustomerARData/index.ts`, `src/pages/CustomerARTransactions.jsx`, `src/components/ar/StatementModal.jsx`, `src/components/ar/TakePaymentModal.jsx`
- **Files still to touch (§2):** new `supabase/functions/autopro-processCustomerARAccounting/index.ts`, plus edits to `src/pages/CustomerARTransactions.jsx` (3 call sites) and `src/components/ar/TakePaymentModal.jsx` (1 call site)
