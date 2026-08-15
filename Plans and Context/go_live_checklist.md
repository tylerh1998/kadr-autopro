# AutoPRO Go-Live Checklist

**Target date:** Monday, August 17, 2026 — tentative, delay if any item below isn't ready. Do not compress this list to hit the date; move the date instead.

**What "go-live" means here:** cutting `autopro.kensauto.ca` over from the current Base44-hosted app to the native Supabase app (this repo's `development` branch, deployed via `main`). This is a full platform cutover, not a routine deploy — treat it with that level of care.

> **LIVE DOCUMENT.** Update in place as items complete or new gaps are found. Don't delete history — check items off, annotate with dates/notes, and append new findings rather than rewriting past decisions.

---

## 1) Context & Key Decisions

- **`main` is the live production repo today**, currently serving the Base44-hosted/hybrid app. `development` holds the fully native rewrite (231 commits ahead of `main`, confirmed 2026-08-11).
- **The two git branches map to two separate Supabase projects — confirm this before any schema/function work, don't assume one implies the other:** `hbcrwkmgsazqrvsrmxyr` (Supabase's own branch metadata labels it `main`/production, `is_default: true`) vs. `sitihbdnuxifwibontcm` (labeled `development`) — this is what `test.kensauto.ca` actually runs against and where all real live-testing data lives (e.g. `Archive/blueprint_verification_plan.md`'s test records). **Mistake made and corrected 2026-08-10:** a schema gap found on `hbcrwkmgsazqrvsrmxyr` was initially assumed to also affect what was being tested on `test.kensauto.ca` — it didn't; `sitihbdnuxifwibontcm` already had the fix. Always state which of the two project IDs an action targets.
- **Cutover mechanism:** replace `main`'s contents with `development`'s. This keeps Vercel's existing branch-watching config intact (confirm Vercel's production project actually builds from `main` before doing this).
- **Standing rule on file, now deliberately superseded for this event only:** prior instruction was "never touch `main`, never merge `development` into it." That rule was written before a go-live was ever planned. It applies to *routine* work — it does not block this deliberate, planned cutover. Update the standing memory once this actually executes.
- **The app today is a hybrid**: some tables are already fully native and already the live source of truth (Customer, Vehicle, WorkOrder, GLTransaction, WorkPRO tables, BankAccount/BankTransaction/BankReconciliation, InventoryReturn) — these need **no data movement**, production already has current data. Everything else still has **Base44 entities as the actual source of truth** even though a native table already exists for it — for those, dev's copy of the table is a stale one-time snapshot, not the live data. **Base44 is the only valid data source for those at go-live time.**
- **DNS + Vercel hosting switch happens last**, by design — it's the one fully reversible, cleanly delayable single action in this whole plan. Everything before it is prep that can be checked and re-checked without consequence; this step is the actual point of no return (soft — DNS can be reverted).
- **Go-live-time data pull happens after hours**, specifically to avoid extracting a moving target while staff are actively creating appointments/invoices/etc. in the still-live Base44 app.
- **Export mechanism:** Base44 → CSV → Supabase upload. Native tables were deliberately designed to accept the same shape as the Base44 entities they replace, specifically to make this path work. ~30–45 min per the owner's estimate.

---

## 2) Pre-Go-Live Work (any time before Aug 17, low risk, no coordination with staff needed)

### 2a. Schema / migrations — **all 3 items DONE, section closed 2026-08-15**
- [x] Deploy `get_supplier_reconcile_invoices_rpc` to production — **DONE 2026-08-15.** Applied tracked file `supabase/migrations/20260812000000_get_supplier_reconcile_invoices_rpc.sql` verbatim to `hbcrwkmgsazqrvsrmxyr` via `apply_migration` (recorded there as version `20260815...get_supplier_reconcile_invoices_rpc`). Confirmed function didn't already exist pre-deploy (`pg_proc` query returned empty), then confirmed live post-deploy (`pronargs: 1`, body present). Read-only RPC, purely additive — no collision, no existing caller to regress. `get_advisors` (security) afterward shows only the same `function_search_path_mutable` WARN every other function in this schema already carries — pre-existing repo-wide pattern, not a new issue, out of scope here.
- [x] Deploy `add_cvip_odometer_to_customer_portal_work_order` to production — **DONE 2026-08-10.** 2 new nullable columns (`cvip text`, `odometer integer`, matching `WorkOrder`'s own column types) added to `CustomerPortalWorkOrder` on `hbcrwkmgsazqrvsrmxyr` via `apply_migration`, confirmed live via `information_schema.columns`. Migration file now tracked: `supabase/migrations/20260816000000_add_cvip_odometer_to_customer_portal_workorder.sql`. Also redeployed `autopro-createPortalSnapshot` (v1→v2, `verify_jwt` unchanged) since its already-committed source depended on these columns existing — confirmed live via `get_edge_function`. Found and closed while verifying the new "View In-App"/printable customer-approval-snapshot feature; full detail in `Archive/blueprint_verification_plan.md` Section 2.
- [x] `provision_supabase_functions_webhook_infra` (`WorkOrder_Broadcast` trigger + webhook) — **already resolved via Section 2c below, confirmed 2026-08-15.** This bullet's "currently untracked, needs a migration file written" note was stale — 2c's own work (completed 2026-08-12) wrote and deployed the tracked migration (`supabase/migrations/20260815000000_remove_workorder_broadcast_hardcoded_jwt.sql`). Re-verified live against production this session: `list_migrations` on `hbcrwkmgsazqrvsrmxyr` shows it applied (version `20260812173808`). No separate action needed — this bullet and 2c were tracking the same work.

### 2b. Static/config table data → production
- [x] `WorkOrderStatus` (8 rows on dev, 0 on prod)
- [x] `TagAlong` (13 rows on dev, 0 on prod)
- [x] `OtherChargeList` already match 
- [x] GSTReturn - no changes happening until end of this quarter, we can port over now
- [x] LinesofCredit - just the list of the three credit cards we have. That's not changing, but LOC Transactions are dynamic.
- [x] Employee
- [x] FiscalPeriod
- [x] ReturnReason

### 2c. `WorkOrder_Broadcast` — security fix, own mini-project — **DONE 2026-08-12**
Production's `WorkOrder_Broadcast` trigger had a JWT hardcoded in plaintext in the trigger definition (flagged Phase 1). Investigated fully before fixing: the JWT decoded to each project's own public **anon key** (not a service-role key or third-party credential), and the called `WorkOrder-Broadcast` function never actually reads the header at all — it authenticates internally via the auto-injected `SUPABASE_SERVICE_ROLE_KEY`. So the fix was to drop the header entirely, not relocate it to Vault. Full writeup: `workorder_broadcast_update_plan.md`.
- [x] Fix applied: header-less trigger (`CREATE OR REPLACE TRIGGER`, single trigger covering INSERT/UPDATE/DELETE), tracked in `supabase/migrations/20260815000000_remove_workorder_broadcast_hardcoded_jwt.sql`.
- [x] Tested in isolation on dev first — caught and fixed a bug in the migration itself there (three same-named single-event triggers were overwriting each other; corrected to one multi-event trigger) before touching prod.
- [x] Deployed to production 2026-08-12, verified via `information_schema.triggers` and a live functional test (real `WorkOrder` writes flowing through cleanly, confirmed via logs).
- [x] Old insecure trigger confirmed replaced (`CREATE OR REPLACE TRIGGER` is atomic, not a separate drop+create).
- **Correction to this section's original framing:** "nothing on current-`main` consumes this broadcast" was wrong — re-checked `main`'s live `src/pages/WorkOrders.jsx` and it already subscribes to the `work_order_refresh`/`workorder-updated` channel today ("Zero Polling" live-refresh, no fallback). Turned out not to matter in practice: the webhook is async/non-blocking (`pg_net`), so it can't fail or delay the underlying `WorkOrder` write, and worst case during the deploy window was one missed live-refresh — nothing broke.
- **Bonus find during dev testing (unrelated to this fix, separately fixed):** `src/lib/supabaseRealtimeClient.js` hardcodes production's Supabase URL/anon key for the realtime client, ignoring env vars — meaning dev's live-refresh could never have worked regardless of this trigger fix. Fixed on `development` to read from `VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY` like the regular client. `main`'s copy still has the old hardcode, but since `main` only ever runs against prod, it's a no-op there — will resolve naturally at cutover, not urgent before Aug 17.

### 2d. Edge Functions → production
None of these share a name with anything currently live on `main` — confirmed no collision risk, safe to deploy any time before go-live:
- [ ] `autopro-generateWorkOrderPdf`
- [ ] `autopro-processCustomerARAccounting`
- [ ] `autopro-getworkorderlist`
- [ ] `autopro-createworkorderdata`
- [ ] `autopro-sendEmailViaSMTP`
- [ ] `autopro-sendSms`
- [ ] `autopro-sendARReceiptEmail`
- [ ] `autopro-returnCoreToWO`
- [ ] `autopro-changeWorkOrderCustomer`
- [ ] `autopro-calculateARInterest`
- [ ] `autopro-getAppliedPaymentDetails`
- [ ] `autopro-getNotesBoardData`
- [ ] `autopro-getSupplierReconcileInvoices`
- [ ] `autopro-processSupplierStatementOCR`
- [ ] `autopro-sendStatementEmail`
- [ ] `autopro-sendBatchWorkOrderEmails`
- [ ] `autopro-report-issue`
- [ ] `workpro-report-issue`
- [x] `autopro-resendWebhook` — new function, native port of base44's inbound Resend delivery-callback webhook; deploying it alone does nothing until Resend's dashboard webhook URL is also manually repointed at it (no available tooling for that step — see `master_context.md` §3)
- [x] `autopro-sendAppointmentReminders` / `autopro-sendTextReminders` — dev-only, `pg_cron`-scheduled, no frontend caller. Deploying the functions to production accomplishes nothing without also scheduling their `pg_cron` jobs there; full production port was explicitly deferred to a separate follow-up plan, not scoped here. Full history: `Plans and Context/Archive/Appointment_Reminders_implementation_plan.md`
- [ ] Payroll's production frontend push + production Edge Function deploy — Phase 11's own doc noted these as "the user's own action," never confirmed done. **Before assuming this list above is complete: directly compare the full function list on dev (`sitihbdnuxifwibontcm`) vs. production (`hbcrwkmgsazqrvsrmxyr`) rather than relying on any single phase doc's memory of what it deployed** — this list was compiled from scattered per-phase notes, not a live diff.

---

## 3) Go-Live Night Only (after hours, sequenced — do not run these in parallel/out of order)

**Why after hours:** every table below has Base44 as its live source of truth today. Pulling any of them while staff are still using the Base44 app means the extraction is stale the moment it's taken.

**Suggested internal order** (adjust as the actual runbook gets built closer to the date):

1. **Confirm the shop is done for the day** — no in-progress appointments/WOs/invoices being actively edited.
2. **Export + import the "regular" dynamic tables** from Base44 (CSV path, ~30–45 min per the owner's estimate; verify a few rows post-import for the known data-type traps — `jsonb` columns landing as real JSON not a stringified blob, stringy-boolean columns, no silent decimal truncation into a `bigint` field):
   - [ ] Appointment
   - [ ] Approvals
   - [ ] LinesOfCreditTransaction
   - [ ] CashFlowSummary 
   - [ ] CashFlowEntry
   - [ ] DepositSlipBreakdown
   - [ ] CashDrawerAdjustment
   - [ ] CustomerPortalAudit - no real data exists for this yet, new feature coming to native app.
   - [ ] CustomerPortalStatement
   - [ ] CustomerPortalWorkOrder
   - [ ] InventoryAuditLog (base44 entity is called InventoryTxs - same data, just renamed)
   - [ ] InventoryLocation - mostly static, but might have new locations added, placed on dynamic table list as precaution
   - [ ] InventoryReturn
   - [ ] Levies
   - [ ] SentEmailLog
3. **Pull `SystemSettings` last, as close to the DNS flip as possible.** `next_invoice_number`/`next_ro_number` are live counters controlling WO/invoice numbering — this project already hit a real bug once where a stale counter collided with real existing numbers on the very first write after a copy. Don't let anything happen between this pull and the DNS switch that could create a new WO/invoice in Base44.
4. **DNS switch + Vercel hosting cutover** (repoint `autopro.kensauto.ca`, confirm Vercel production builds from `main`, confirm `main`'s contents have already been replaced with `development`'s ahead of this moment). **The one true point-of-no-return step — if anything upstream isn't ready, stop here and delay, don't push through.**
5. **Immediate post-cutover smoke test** (see Section 4) before considering the shop open for business the next morning.

---

## 4) Post-Cutover Verification

Nothing above has been tested against production itself yet — everything passed on dev only. Run through these live, on production, before calling it done:
- [ ] Create a real appointment
- [ ] Generate and email a Work Order PDF
- [ ] Apply an AR payment
- [ ] Run Supplier Statement Reconciliation end to end
- [ ] Create a new WO/estimate and confirm the number doesn't collide with anything existing (direct check on the `SystemSettings` pull from step 3)
- [ ] Confirm `WorkOrder_Broadcast` firing correctly (if not already deployed pre-go-live per 2c) and the old insecure trigger is gone
- [ ] **Report baseline diff (closes the long-standing Phase 6 gap):** once the real data import (Section 3, step 2) has landed, compare native report outputs — Sales Analysis, Customer Report, Other Charges Breakdown, Technician Performance, WO Summary, Parts Movement/On Order — against their pre-cutover Base44 originals using the same real data. Totals/row counts/key figures should match exactly; this is the base44-vs-native baseline diff that was never done when these reports were originally ported.

---

## 5) Rollback Plan

`main` is genuinely live in production — have a real way back, not just an assumption:
- [ ] Confirm exactly how to revert Vercel's production deployment to the prior state in one action if something is badly wrong day-of
- [ ] Confirm DNS revert path/TTL — how fast can `autopro.kensauto.ca` point back at Base44 if needed, and how long does that take to actually propagate
- [ ] Decide the go/no-go call criteria in advance (what specifically would trigger a rollback vs. "fix forward") rather than deciding under pressure that night

---

## 6) Open Items / Needs a Decision

- [ ] Confirm Vercel's production project's branch setting is actually `main` before relying on the "replace main's contents" plan
- [ ] Confirm production env vars (`VITE_SUPABASE_URL` etc.) are already pointed at `hbcrwkmgsazqrvsrmxyr`, not dev, ahead of the cutover
- [ ] Decide `WorkOrder_Broadcast` fix timing: pre-go-live (recommended) vs. bundled into go-live night
- [ ] Confirm remote support coverage for Aug 17 itself — who's physically at the shop if something needs a screen-share/hands
