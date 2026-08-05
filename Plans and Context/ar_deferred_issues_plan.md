# AR Deferred Issues: Statement Portal Creation + Interest Calculation Migration Plan

**Status:** Plan only, awaiting go-ahead. No code written yet.
**Parent:** Deferred out of `Plans and Context/customerartransactions_plan.md` §4 during the `processCustomerARAccounting` migration session. Both issues share the same root cause as everything already fixed this project: `base44-proxy`'s `supabase.auth.getUser(token)` check always 401s for this app's myKADR-SSO-issued JWTs (see that doc's §0.1 for the full root-cause writeup — not repeated here).
**Prepared:** 2026-08-05. **Redrafted same day** after the user created the `CustomerPortalStatement` table directly and imported real historical data into it — Phase 2 below now conforms to that actual live schema instead of the originally-proposed one (see "Schema reconciliation" note under Phase 2).

---

## Overview and Goals

Two unrelated, independently-shippable features are currently broken, both via the same 401 mechanism as everything already migrated:

1. **Statement portal creation** (`StatementModal.jsx`) — the Email and Copy URL buttons on the internal "Statement of Account" modal never appear, because the record backing the customer-facing portal link (`Statement.create()`, a base44 **entities SDK** call, not a `functions.invoke` call) always fails with 401.
2. **AR interest calculation** (`InterestCalculationModal.jsx`) — the "Calculate Interest" flow (`base44.functions.invoke('calculateARInterest', ...)`) always 401s, so the modal permanently shows "No Interest Due" regardless of real overdue balances, making the Apply Interest button (already correctly wired to `autopro-processCustomerARAccounting` from the prior session) unreachable through normal use.

**Goal:** fix both, following the exact same proven pattern used all session — port the base44 logic into a native `autopro-*` Supabase Edge Function that authenticates via JWT-decode + `Employee.mykadr_user_id` lookup (not `auth.getUser()`, not `autopro_user_id` — confirmed deprecated, per direction given mid-session on 2026-08-04) — deployed to the dev branch (`sitihbdnuxifwibontcm`) first, tested live, then held for a separate go-ahead before any production (`hbcrwkmgsazqrvsrmxyr`) port.

**Key architectural decision, confirmed with the user:** `portal.kensauto.ca`'s statement page currently reads from base44 directly (not migrated), but **will eventually be re-pointed at Supabase**, the same way the WorkOrder customer portal already was (see `autopro-createPortalSnapshot` → `CustomerPortalWorkOrder` table, already live and working). The user has now **already created the Supabase-side table for this** — `CustomerPortalStatement` — and imported real historical statement data into it (326 rows) so that data can simply carry forward at go-live. This plan's job for Phase 2 is narrower than originally scoped: write a native Edge Function that inserts into that *existing* table correctly, not design a new one.

---

## Proposed Changes

### Phase 1 — `autopro-calculateARInterest` (Interest Calculation)

**New file:** `supabase/functions/autopro-calculateARInterest/index.ts`

- Deployed `verify_jwt: true`. **Read-only, no writes, no audit attribution needed** — unlike every write-path function fixed this session, this one does not need the JWT-decode/Employee-lookup identity pattern at all. It mirrors `autopro-getCustomerARData`'s minimal-auth shape: the gateway's `verify_jwt: true` already rejects unsigned/invalid tokens before the function body runs, and no `created_by` field is ever written.
- Logic ported 1:1 from `base44/functions/calculateARInterest/entry.ts` (165 lines, fully self-contained, already read in full):
  - Input: `{ customerIds: string[] }`.
  - Batch-fetches `Customer`, `CustomerPayments`, `CustomerARAdjustment` for the given customer ids (chunked at 150 per `.in()` call, matching the source).
  - For each customer: builds a list of charge items from `on_account`-method `CustomerPayments` rows and positive-`amount` `CustomerARAdjustment` rows, each with a 30-day grace period before interest starts accruing.
  - Applies existing payments/credits oldest-first against those charges to find the truly outstanding amount per charge.
  - For any charge whose interest-start date has passed, compounds interest monthly at 24% APR / 12 = 2%/month (`(1 + 0.02)^monthsOverdue`), matching the UI's own "24% APR, compounded monthly" copy already shown in `InterestCalculationModal.jsx`.
  - Returns customers with `totalInterest > 0.01`, each with `{ customer, totalInterest, interestDetails, currentBalance }`.
- **One deliberate deviation from the source:** the original imports `npm:date-fns@3.6.0` for `addDays`/`differenceInMonths`. This session's completed `autopro-processCustomerARAccounting` migration established a precedent of avoiding new npm-import dependencies inside Edge Functions in favor of small inlined date-math helpers (kept the runtime dependency surface identical to sibling functions already in this project). Same treatment here: `addDays` becomes trivial millisecond arithmetic; `differenceInMonths` becomes a small calendar-month-difference helper (year*12+month arithmetic, matching `date-fns`'s own definition of "whole calendar months elapsed"). Both are pure, easily unit-verifiable by comparing outputs against the original for a handful of known dates during implementation.
- **Response shape** follows this project's now-established convention (confirmed via `autopro-getCustomerARData`, `autopro-postJournalEntries`, `autopro-processCustomerARAccounting`): always HTTP 200, body `{ success: true, data: [...] }` or `{ success: false, error: '...' }` — not base44's mix of 400/401/500, so the frontend can just check `data.success`.

**Frontend change:** `src/components/ar/InterestCalculationModal.jsx`
- `calculateInterest()` (the only remaining `base44.functions.invoke` caller in this file, since `handleApplyInterest` was already migrated last session): replace `base44.functions.invoke('calculateARInterest', { customerIds })` with `supabase.functions.invoke('autopro-calculateARInterest', { body: { customerIds } })`, adjusting `response.data.data`/`response.data.error` (axios-style) to `data.data`/`error` (supabase-js style), matching the pattern already used for `handleApplyInterest` in the same file.
- The `base44` import can finally be removed from this file entirely once this lands (it was kept last session specifically because this call site was still pending).

### Phase 2 — `autopro-createStatement` (Statement Portal Creation)

#### Schema reconciliation — read this first

The originally-drafted version of this plan proposed creating a new `CustomerPortalStatement` table via migration, designed from base44's `Statement.jsonc` entity definition plus the `CustomerPortalWorkOrder` sibling table's conventions. **The user has since created this table directly in Supabase and imported 326 rows of real historical statement data into it.** The actual live schema, inspected directly via `execute_sql`/`information_schema` before writing this revision, differs from the original proposal in two consequential ways — both now treated as fixed requirements, not suggestions:

| Column | Originally proposed | **Actual live schema** | Consequence |
|---|---|---|---|
| `transactions` | `text` (JSON-stringified) | **`jsonb`** | The Edge Function must insert the real array/object directly — no `JSON.stringify()`. Confirmed via a real row: `[{"id":"2a0463b9-...","date":"2026-07-19","type":"invoice","amount":1801.8,"ar_paid":0,"balance":1801.8,"age_days":16,"reference":"INV41130","description":"..."}]` — this is exactly the raw output shape of the `get_outstanding_ar_items` RPC already used elsewhere, so **no change needed to how `StatementModal.jsx` builds this data**, only to how it's sent. |
| `aged_balances` | `text` (JSON-stringified) | **`jsonb`** | Same as above. Confirmed shape: `{"30":0,"60":0,"90+":0,"total":1801.8,"current":1801.8}` — matches `calculatedAgedBalances` in `StatementModal.jsx` exactly, again just needs to be sent unstringified. |
| `id` | `text PRIMARY KEY` (proposed `crypto.randomUUID()` stripped to 24 hex chars) | **`text`, `NOT NULL`, no default, PK** (index named `Statement_pkey`) | Confirmed the existing 326 rows already use exactly this 24-lowercase-hex-char shape (e.g. `695886712919d6caeb2faaf1`, matching base44's own Mongo-ObjectId-style ids). The originally-proposed generation method (`crypto.randomUUID().replace(/-/g,'').substring(0,24)`) produces output in the identical format — **no change needed there**, just confirming it's correct rather than assumed. |
| `is_sample` | not proposed | **`boolean`, nullable** | Present on this table (and on `CustomerPayments`/`CustomerARAdjustment`/`GLTransaction` too — an established convention for flagging demo/seed data across this schema). New real rows should leave it `null`/unset, matching how the AR-accounting insert helpers already behave. **Verification-phase test rows should explicitly set `is_sample: true`**, giving a clean, reliable way to find and delete them afterward (better than the ad-hoc "description LIKE '%TEST%'" cleanup method used for AR-accounting testing last session, since `Statement` rows have no free-text description field to tag). |
| RLS / grants | Proposed matching `CustomerPortalWorkOrder`'s open policy | **Table-level grants already match** (`anon`/`authenticated`/`service_role` all have full `SELECT/INSERT/UPDATE/DELETE`), **but RLS is enabled with zero policies** | With RLS on and no policy, every role *except* ones that bypass RLS (`service_role` does, by Supabase default) is denied at the row level regardless of table grants. This doesn't block this phase's Edge Function (uses the service-role key), but it means **the future portal-facing anonymous read will not work yet**, even once `portal.kensauto.ca` is re-pointed here — there is currently no read policy at all. Since fixing the portal read path is explicitly out of scope for now (per the user's direction — portal re-pointing is separate, future work), this is flagged as a known, low-effort follow-up rather than fixed in this pass: adding `CREATE POLICY "Enable all operations for all users" ON "CustomerPortalStatement" FOR ALL TO public USING (true) WITH CHECK (true);` (verbatim match to `CustomerPortalWorkOrder`'s existing policy) whenever that portal work actually happens. **No action taken on this in Phase 2 unless you'd rather add it now since it's trivial and harmless to add early.** |
| Indexes | Proposed `cp_id` + `customer_id` btree indexes | **Only the PK index on `id` currently exists** | Not urgent at 326 rows, but worth adding before this table sees real production-scale write/read volume (the portal will look up by `cp_id`, not `id`). Flagged as an optional low-risk addition alongside the RLS-policy item above — a single `apply_migration` covering both would be cheap to do now or anytime before go-live. |

**No `CREATE TABLE` migration is proposed in this plan.** The table exists and its column structure is being deliberately preserved exactly as-is (per your instruction), including keeping `created_by_id` as a plain `text` column with no format constraint — meaning old imported rows will show base44-era `autopro_user_id`-shaped values (e.g. `68b90236f4d7e6ac0de4a263`, confirmed present on historical rows, stamped by base44's own platform-level audit logging) sitting alongside new rows using `mykadr_user_id`-shaped values (UUIDs) once this phase ships. This is a harmless, purely cosmetic mixed-format history in one `text` column — nothing reads or validates its format — and is called out here only so it's a known, deliberate consequence of "preserve the schema" + "use `mykadr_user_id` going forward," not a surprise later.

#### The Edge Function

**New file:** `supabase/functions/autopro-createStatement/index.ts`

- Deployed `verify_jwt: true`. **Writes data → needs the full identity pattern**, same as `autopro-processCustomerARAccounting`: decode the JWT payload directly (no `auth.getUser()`), look up `Employee` by `mykadr_user_id`, reject with a friendly `{success:false, error}` if no Employee row exists. `created_by_id` = `mykadr_user_id` (the JWT `sub`), `created_by` = `Employee.full_name || Employee.email || jwt email`. This is the exact, already-proven pattern from last session's fix — no new design needed here.
- Accepts the same fields `StatementModal.jsx` already computes client-side today: `cp_id`, `customer_id`, `statement_date`, `transactions` (array), `aged_balances` (object), `total_balance_due` — **passed as native JSON, not stringified** (see schema reconciliation above). No changes needed to the aged-balance/transaction-building logic in the frontend, only to how the resulting record gets sent and persisted.
- Generates `id` server-side as `crypto.randomUUID().replace(/-/g, '').substring(0, 24)`, matching the existing 326 rows' id format exactly.
- Inserts directly into `CustomerPortalStatement` (service-role client, bypassing RLS like every other write-path function in this project — this also means it's unaffected by the zero-policy gap noted above) and returns `{ success: true, cp_id }`.
- `cp_id` continues to be generated client-side exactly as today (`generateRandomString(10)`, already in `StatementModal.jsx`) — matches the original code's behavior. No server-side uniqueness-loop is proposed (unlike `autopro-createPortalSnapshot`'s sibling pattern for `CustomerPortalWorkOrder`) since that wasn't part of the original Statement behavior either and collision odds on a 10-char alphanumeric space are negligible against 326 existing rows — flagged here so it's a visible, deliberate choice rather than an oversight.

#### The frontend change

`src/components/ar/StatementModal.jsx`
- Remove `import { Statement } from '@/entities/all';`.
- `createStatementRecord()`: replace `await Statement.create(newStatement)` with a call to `supabase.functions.invoke('autopro-createStatement', { body: newStatement })`, checking `{ data, error }` per this project's now-standard pattern.
- **Stop `JSON.stringify()`-ing `transactions` and `aged_balances`** before sending — send the raw array/object, matching the real `jsonb` column type. This is the one behavioral change needed in this file beyond the call-site swap itself.
- No other logic changes — the Email/Copy URL buttons already correctly gate on `statementPortalId` being set; they'll simply start appearing once the underlying create call stops failing.

---

## Impact / Risk Assessment

| Area | Assessment |
|---|---|
| **Blast radius** | Both fixes are additive and isolated. Phase 1 touches only `InterestCalculationModal.jsx` + one new read-only function. Phase 2 touches only `StatementModal.jsx` + one new write-only function — **no schema changes at all**, since the table already exists. Neither phase touches `autopro-processCustomerARAccounting`, `CustomerPayments`, `CustomerARAdjustment`, or `GLTransaction` — the already-verified financial core is untouched. |
| **Financial risk** | None. Phase 1 writes nothing. Phase 2 writes only to `CustomerPortalStatement`, which has no financial-ledger consequence — a bad statement snapshot doesn't corrupt AR balances or the GL, it just means a customer-facing statement page (not yet even wired up externally) would show stale/wrong data until regenerated. |
| **Data risk** | **Elevated vs. the original draft of this plan** — Phase 2 now writes into a table that already holds 326 rows of real historical data you specifically want preserved for go-live import, rather than an empty table with zero blast radius. Mitigation: all verification-phase test writes are tagged `is_sample: true` (see schema table above) so they can be reliably found and deleted without any risk of touching real historical rows, which have `is_sample = null`/`false` today (confirmed: 0 of 326 existing rows have `is_sample = true`). |
| **External dependency risk** | Unchanged from the original draft: `portal.kensauto.ca`'s statement page is **not** part of this repo and is confirmed still reading from base44. After this phase ships, internal statement creation will work (Email/Copy URL buttons appear, `cp_id` persists correctly to Supabase), but the portal link customers actually click will still not resolve correctly until the separate portal-side re-pointing work happens — expected, not a bug in this phase. |
| **Auth/identity risk** | Low — reuses the exact JWT-decode + `mykadr_user_id` pattern already implemented, deployed, and live-tested last session for `autopro-processCustomerARAccounting`. The one gap already found in that first pass (v1 wrongly gated on `autopro_user_id`) is a known pitfall this plan explicitly avoids repeating from the start. |
| **RLS-policy gap risk** | New finding, not a risk to *this* phase (service-role bypasses it) but worth tracking: `CustomerPortalStatement` currently has RLS enabled with **zero policies**, unlike its sibling `CustomerPortalWorkOrder` (which has an explicit open policy). If forgotten, this would silently block the future portal-repointing work even after this phase ships and looks fully correct internally. Recommend adding the matching policy either now (cheap, harmless, done in Phase 2's migration if you'd like) or as a tracked follow-up before that future portal work begins. |
| **Interest calculation correctness risk** | Low-medium. The compounding-interest math is being ported as-is (no logic changes), but the date-math helper substitution (`date-fns` → inline arithmetic, see Phase 1) is new code that needs explicit verification against the original before trusting it — called out directly in the testing plan below. Also: this function reads real customer balances but writes nothing, so a bug here would show wrong interest *previews*, not corrupt any ledger — a human still has to review and click Apply before anything is written (and that Apply path was already verified correct last session). |
| **Rollback plan** | Both phases: function deploy can be reverted by redeploying the previous (broken) version or simply not wiring the frontend call site — frontend changes are single-file, easily revertible via git. Phase 2 makes no schema changes, so there's nothing structural to roll back — worst case is deleting any bad test rows (trivially findable via `is_sample = true`). |

---

## Roadmap and Time Estimate

### Phase 1 — `autopro-calculateARInterest` (Interest Calculation)
- Write `supabase/functions/autopro-calculateARInterest/index.ts` (port + date-math substitution): **20–30 min**
- Deploy to dev (`sitihbdnuxifwibontcm`): **5 min**
- Update `InterestCalculationModal.jsx` call site + remove now-unused `base44` import: **10 min**
- Live testing (see Verification below): **20–30 min**
- **Subtotal: ~1–1.25 hours**

### Phase 2 — `autopro-createStatement` (Statement Portal Creation)
- Write `supabase/functions/autopro-createStatement/index.ts` (no migration needed — table already exists): **20 min**
- Deploy to dev: **5 min**
- Update `StatementModal.jsx` call site (including dropping the `JSON.stringify()` calls) + remove `Statement` entity import: **10 min**
- *(Optional, ~10 min)* Add the matching RLS policy + `cp_id`/`customer_id` indexes flagged above, via `apply_migration` — doesn't block anything else in this phase, just convenient to bundle if you want it done now rather than tracked separately.
- Live testing (see Verification below): **20–30 min**
- **Subtotal: ~1–1.25 hours (without the optional step), ~1.1–1.4 hours (with it)**

### Total (both phases): **~2–2.5 hours**, plus your review/go-ahead checkpoints between phases and before any production port.

Phases are fully independent — either can go first, or they can be done in parallel, since they touch disjoint files and disjoint backend resources. Presented sequentially here only because that's the more reviewable/testable order.

---

## Verification and Testing Plan

### Phase 1 — Interest Calculation

1. **Date-math sanity check before wiring the frontend:** pick 3–4 known dates spanning different month-lengths/leap-year edges, run both the original `date-fns` functions and the new inline helpers side-by-side (e.g. via a throwaway Deno REPL snippet or temporary console.log during dev), confirm identical outputs for `addDays(x, 30)` and `differenceInMonths(a, b)`.
2. Deploy to dev, then call it directly with a known-overdue customer id (e.g. via `execute_sql` cross-check: manually compute expected interest for one real overdue customer from raw `CustomerPayments`/`CustomerARAdjustment` data, compare against the function's output).
3. In the browser (`test.kensauto.ca`), open `CustomerARSummary` → **Calculate Interest**. Expect: customers with real 60+/31-60-day balances that are actually overdue past the 30-day grace period now appear in the list (not "No Interest Due"), with plausible interest amounts. Confirm **zero** 401s in console.
4. Cross-check at least one displayed `totalInterest` value against a hand calculation (principal × ((1.02)^monthsOverdue − 1)) to confirm the compounding math survived the port correctly.
5. **Do not click Apply Interest in this pass unless intentionally testing Phase-1-plus-existing-apply-interest together** — that path was already verified last session; re-confirming it here is optional, not required, since this phase only touches the calculate step.
6. Confirm no `CustomerARAdjustment`/`GLTransaction` rows were created by this phase alone (read-only function — a stray write here would indicate something went wrong).

### Phase 2 — Statement Portal Creation

1. Before writing any code, re-confirm the live schema one more time via `execute_sql` (`select column_name, data_type from information_schema.columns where table_name = 'CustomerPortalStatement'`) in case anything changes between this plan being written and implementation starting.
2. In the browser (`test.kensauto.ca`), open **Statement** for a known test customer (Austin Unruh or Hines Ranching). Expect: the statement iframe still renders exactly as before (unaffected by this change), **and now** the Email and Copy URL buttons appear in the footer (they were previously never shown, since `statementPortalId` never got set). Confirm **zero** 401s / no `Statement.create` errors in console.
3. Verify via `execute_sql` that a new `CustomerPortalStatement` row was created with: correct `customer_id`; a well-formed `cp_id`; `transactions`/`aged_balances` stored as real `jsonb` (not a JSON-encoded string inside a string — e.g. `jsonb_typeof(transactions) = 'array'` should return `'array'`, not `'string'`); correct `total_balance_due`; `created_by`/`created_by_id` correctly stamped with the logged-in test account's name/`mykadr_user_id` (same pattern already confirmed working for `create_adjustment` last session); and **`is_sample = true`** (set explicitly by the test call, per the cleanup strategy above).
4. Click **Copy URL**, confirm the copied value is `portal.kensauto.ca/statement?cp_id=<the new row's cp_id>` — confirming the internal half of this feature is fully correct, even though (expected, per Impact section above) that URL won't yet render anything useful externally until the separate portal-side work happens.
5. Test against a second customer to rule out coincidence, matching this project's established "verify on at least 2 customers" convention.
6. Clean up test rows: `delete from "CustomerPortalStatement" where is_sample = true;` — safe by construction, cannot touch any of the 326 real historical rows since none of them have this flag set.
7. Run a final count check (`select count(*) from "CustomerPortalStatement"` should read `326` again, exactly what it was before testing began) as a hard guarantee no historical data was disturbed.

### Exit criteria (both phases)
All steps above pass with no console errors, `execute_sql` cross-checks confirm correct data on both the interest-math and the new Statement rows, test data cleaned up with the historical-row count verified unchanged, before either phase is considered done. Production porting of both fixes to `hbcrwkmgsazqrvsrmxyr` is explicitly **out of scope for this plan** — a separate go-ahead, same as `processCustomerARAccounting`.
