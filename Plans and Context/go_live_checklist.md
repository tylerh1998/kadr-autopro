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

### 2d. Edge Functions → production — **DONE 2026-08-15, closed via a live dev-vs-prod diff, not the stale list below**
Per this section's own prior warning, did a direct `list_edge_functions` comparison of dev (`sitihbdnuxifwibontcm`) vs. production (`hbcrwkmgsazqrvsrmxyr`) instead of trusting the checklist. That surfaced real staleness both ways — see notes below. All 15 genuine gaps deployed and confirmed `ACTIVE` (version 1) via `get_edge_function`, verify_jwt matched to each function's existing dev setting:
- [x] `autopro-generateWorkOrderPdf` (verify_jwt: true)
- [x] `autopro-processCustomerARAccounting` (verify_jwt: true)
- [x] `autopro-getworkorderlist` (verify_jwt: true)
- [x] `autopro-createworkorderdata` (verify_jwt: true)
- [x] `autopro-sendEmailViaSMTP` (verify_jwt: false) — bundles `_shared/resend.ts`
- [x] `autopro-sendSms` (verify_jwt: false) — bundles `_shared/twilio.ts`
- [x] `autopro-sendARReceiptEmail` (verify_jwt: false) — bundles `_shared/resend.ts`
- [x] `autopro-returnCoreToWO` (verify_jwt: true)
- [x] `autopro-changeWorkOrderCustomer` (verify_jwt: true)
- [x] `autopro-calculateARInterest` (verify_jwt: true)
- [x] `autopro-getAppliedPaymentDetails` (verify_jwt: true)
- [x] `autopro-getNotesBoardData` (verify_jwt: true)
- [x] `autopro-getSupplierReconcileInvoices` (verify_jwt: false)
- [x] `autopro-processSupplierStatementOCR` (verify_jwt: false)
- [x] `autopro-generateARReceiptPDF` (verify_jwt: true) — **new find, was missing from this list entirely; only caught via the live diff**
- [x] `autopro-sendStatementEmail` — **correction: already live on prod pre-session, not a gap.** Left checked, no redeploy needed.
- [x] `autopro-sendBatchWorkOrderEmails` — **correction: already live on prod pre-session, not a gap.**
- [x] `autopro-report-issue` — **correction: already live on prod pre-session, not a gap.**
- [x] `workpro-report-issue` — **correction: already live on prod pre-session, not a gap.**
- [x] `autopro-resendWebhook` — new function, native port of base44's inbound Resend delivery-callback webhook; deploying it alone does nothing until Resend's dashboard webhook URL is also manually repointed at it (no available tooling for that step — see `master_context.md` §3)
- [x] `autopro-sendAppointmentReminders` / `autopro-sendTextReminders` — **correction: the live diff shows both are already deployed to production** (contradicts this bullet's old "dev-only" framing). Still functionally dormant on prod either way, since their `pg_cron` jobs aren't scheduled there — that part of the old note still holds, full production port remains a separate follow-up. Full history: `Plans and Context/Archive/Appointment_Reminders_implementation_plan.md`
- [ ] Payroll's production frontend push — Phase 11's own doc noted this as "the user's own action," never confirmed done. Note: `autopro-parsePayrollFile` (the Edge Function half) is already live on prod — this remaining item is specifically the frontend code push, which only happens at the full `main`↔`development` cutover, not before.
- **Deliberately NOT deployed — found on dev during the live diff, confirmed untracked in the local repo (no matching directory under `supabase/functions/`), i.e. scratch/test artifacts, not real functions:** `autopro-checkreminderenv`, `autopro-testsharedmodule`, and 4 stray lowercase-duplicate slugs left over from the Aug 14 shared-module retrofit (`autopro-handleinvoiceconversiongl`, `autopro-handlesupplierinvoicelinegl`, `autopro-mergeinventoryitems`, `autopro-processinventoryreceipt` — each has a correctly-cased, real counterpart already live on prod). If any of these six ever turn out to be load-bearing, that's a signal something is wrong, not a reason to deploy them as-is.
- **Deploy mechanics note for future reference:** for functions that import a `_shared/*.ts` helper via `../_shared/...` , the `deploy_edge_function` tool's `files[].name` must include that same `../` prefix (e.g. `"../_shared/resend.ts"`) — omitting it (`"_shared/resend.ts"`) nests the shared file one level too deep relative to where the entrypoint's import resolves, and the deploy fails to bundle. Confirmed by reproducing the failure on `autopro-sendARReceiptEmail`, then fixing it this way.

---

## 3) Go-Live Night Only (after hours, sequenced — do not run these in parallel/out of order)

**Why after hours:** every table below has Base44 as its live source of truth today. Pulling any of them while staff are still using the Base44 app means the extraction is stale the moment it's taken.

**Suggested internal order** (adjust as the actual runbook gets built closer to the date):

1. **Confirm the shop is done for the day** — no in-progress appointments/WOs/invoices being actively edited.
2. **Export + import the "regular" dynamic tables** from Base44 (CSV path, ~30–45 min per the owner's estimate; verify a few rows post-import for the known data-type traps — `jsonb` columns landing as real JSON not a stringified blob, stringy-boolean columns, no silent decimal truncation into a `bigint` field):
   - [x] Appointment
   - [x] Approvals
   - [x] LinesOfCreditTransaction
   - [x] CashFlowSummary 
   - [x] CashFlowEntry
   - [x] DepositSlipBreakdown
   - [x] CashDrawerAdjustment
   - [x] CustomerPortalAudit - no real data exists for this yet, new feature coming to native app.
   - [x] CustomerPortalStatement
   - [x] CustomerPortalWorkOrder
   - [x] InventoryAuditLog (base44 entity is called InventoryTxs - same data, just renamed)
   - [x] InventoryLocation - mostly static, but might have new locations added, placed on dynamic table list as precaution
   - [x] InventoryReturn
   - [x] Levies
   - [x] SentEmailLog
3. **Pull `SystemSettings` last, as close to the DNS flip as possible.** `next_invoice_number`/`next_ro_number` are live counters controlling WO/invoice numbering — this project already hit a real bug once where a stale counter collided with real existing numbers on the very first write after a copy. Don't let anything happen between this pull and the DNS switch that could create a new WO/invoice in Base44. **Done. 2026-08-15 3:08PM MST**
4. **DNS switch + Vercel hosting cutover** (repoint `autopro.kensauto.ca`, confirm Vercel production builds from `main`, confirm `main`'s contents have already been replaced with `development`'s ahead of this moment). **The one true point-of-no-return step — if anything upstream isn't ready, stop here and delay, don't push through.** **This was done. 2026-08-15 4:17PM MST**
5. **Immediate post-cutover smoke test** (see Section 4) before considering the shop open for business the next morning.

---

## 4) Post-Cutover Verification

**MIGRATIONS_FAILED fully investigated and reconciled, 2026-08-15 late evening.** Root cause was worse than a simple timestamp mismatch: real drift between the 24 tracked local `supabase/migrations/*.sql` files and each project's actual `supabase_migrations.schema_migrations` history — entries with no local file at all, local files with no matching row, and dev's history starting only around Aug 8 (earlier schema was seeded before this repo's migration-tracking convention began). Verified every ambiguous case against **live schema state** (table/column/function existence and, where it mattered, actual function body content) before touching anything — did not assume from names. Result: all 24 local file versions now have a matching `schema_migrations` row on both `hbcrwkmgsazqrvsrmxyr` and `sitihbdnuxifwibontcm` (16 renames + 7 inserts on prod, 7 renames + 16 inserts on dev). One deliberate exception: the `sync_customer_to_google` JWT-removal file is bookkeeping-marked applied on dev even though its `DROP TRIGGER` would hard-fail there — dev has zero triggers on `Customer` by design, so marking it applied is both accurate (end-state matches) and prevents the integration from ever attempting that failing DROP. **Correction, same evening:** the "extra untracked rows are harmless" assumption above was wrong. A fresh check (triggered automatically, ~14 min after the first fix) failed with a *different* error: `Remote migration versions not found in local migrations directory` — the integration requires the remote history to be an exact match to local files, not a superset. Deleted every orphan row (rows with no local-file counterpart, including a few genuine misses from the first pass — prod did have an old `schedule_appointment_reminder_cron_jobs` row I'd missed, dev had an old `fix_search_work_order_parts_scalar_line_items` row I'd missed — plus the 3 harmless duplicate rows my own real `apply_migration` calls created for the AR summary/opening-balance/invoice-date fixes). Re-verified via `count(*)`: **both projects now hold exactly 24 rows, an exact match to the 24 local files, confirmed by array comparison.** This should satisfy the check in both directions now. Badge itself should clear on the next push-triggered check — still can't force that from here.

**Four real findings surfaced and closed during this same investigation** (found by checking live function existence/content against production instead of trusting migration-tracking metadata):
1. **Real bug, fixed:** `autopro-supabaseCustomerARSummary` (live on production, called from `src/pages/CustomerARSummary.jsx`) was calling `get_customer_ar_summary`, which only existed on dev — the Customer AR Summary report was broken on production. Deployed the already-tracked `20260810000000_get_customer_ar_summary_rpc.sql` for real to `hbcrwkmgsazqrvsrmxyr`, confirmed via `to_regprocedure`. Never on this checklist before.
2. **Real bug, fixed:** `get_customer_ar_opening_balance` still had the old `::TIMESTAMPTZ AT TIME ZONE` cast on production — the exact off-by-one date bug `20260811000000_fix_ar_opening_balance_date_cast.sql` fixed on dev, never ported. Silently shifted AR opening-balance dates near month boundaries on real financial reports. Confirmed via `prosrc` inspection (not just existence), deployed for real, re-confirmed fixed.
3. **Real gap, closed:** dev was missing the `invoice_date_iso_format` safety-net constraint on `SupplierInvoiceLine` that production has. Confirmed zero bad rows on dev first, applied fully validated (no `NOT VALID` needed, unlike prod's one known-bad STAPLES row).
4. **Behavior change, confirmed intentional:** reminder cron jobs found live on production, contradicting this doc's earlier "dev-only, deferred" framing (§2d) — user confirmed intentional, enabled manually alongside the `base44-proxy` removal. `REMINDER_TEST_MODE` was unset on production (defaults to safe test-mode-on), so no real customer had received a reminder yet. **User directed: switch production to live mode, keep dev in test mode.** Set `REMINDER_TEST_MODE=false` on `hbcrwkmgsazqrvsrmxyr` via the Supabase dashboard (no MCP tool exists for edge function secrets) — confirmed saved. Dev (`sitihbdnuxifwibontcm`) left untouched, still defaults to test mode. Next live send: the next scheduled weekday 8am MST run.

Nothing above has been tested against production itself yet — everything passed on dev only. Run through these live, on production, before calling it done:
- [ ] Create a real appointment
- [ ] Generate and email a Work Order PDF
- [ ] Apply an AR payment
- [ ] Run Supplier Statement Reconciliation end to end
- [x] Create a new WO/estimate and confirm the number doesn't collide with anything existing (direct check on the `SystemSettings` pull from step 3)
- [x] Confirm `WorkOrder_Broadcast` firing correctly (if not already deployed pre-go-live per 2c) and the old insecure trigger is gone — **confirmed 2026-08-15 via `query_logs`**: 1,246 edge function calls in the 23.5 hrs spanning cutover, 1,244 returned 200 (0.16% error rate), `WorkOrder-Broadcast` calls flowing cleanly (one isolated 502 at 14:10 UTC, non-recurring, non-blocking since the trigger is fire-and-forget over `pg_net`).
- [x] **Report baseline diff (closes the long-standing Phase 6 gap):** once the real data import (Section 3, step 2) has landed, compare native report outputs — Sales Analysis, Customer Report, Other Charges Breakdown, Technician Performance, WO Summary, Parts Movement/On Order — against their pre-cutover Base44 originals using the same real data. Totals/row counts/key figures should match exactly; this is the base44-vs-native baseline diff that was never done when these reports were originally ported.

**Post-cutover assessment run 2026-08-15, ~22:25 UTC (~6 hrs after DNS flip):** Full write-up: [Post-Go-Live Assessment artifact](https://claude.ai/code/artifact/8863c20b-9ffe-4fc5-8e66-1be70b1e3f48). Confirmed directly against production — real live usage (`WorkOrder` updated 4 min before the check, `GLTransaction` posting within the last few hours), the 15 Section-3 tables all landed within a single clustered window on 2026-08-14 consistent with one coordinated data pull, `SystemSettings` counters (`next_ro_number` 51672, `next_inv_number` 41315) show no collision, site loads clean with no console errors. **New findings:** (1) `autopro-processSupplierPayment`'s deployed edge function predated last night's merge, missing the `buildInvoiceStateSnapshot` diagnostic-logging feature the merge restored in the repo — **redeployed 2026-08-15 ~22:35 UTC** (v2→v3, `verify_jwt: false` matched, `ACTIVE`), production now runs the same merged source as the repo; (2) `base44-proxy` is now genuinely unreachable (main is fully native) and safe to remove whenever; (3) the pre-existing `MIGRATIONS_FAILED` Supabase-integration status (tracked since 2026-06-01, see prior session note) is unchanged and still non-blocking, no branch protection configured to gate on it. The manual-click items above (appointment, WO PDF, AR payment, supplier reconciliation, WO/estimate number collision check, report baseline diff) still need a logged-in human pass — no agent login access to the app itself.

---

## 5) Rollback Plan

`main` is genuinely live in production — have a real way back, not just an assumption:
- [ ] Confirm exactly how to revert Vercel's production deployment to the prior state in one action if something is badly wrong day-of
- [ ] Confirm DNS revert path/TTL — how fast can `autopro.kensauto.ca` point back at Base44 if needed, and how long does that take to actually propagate
- [ ] Decide the go/no-go call criteria in advance (what specifically would trigger a rollback vs. "fix forward") rather than deciding under pressure that night

---

## 6) Open Items / Needs a Decision

- [x] Confirm Vercel's production project's branch setting is actually `main` before relying on the "replace main's contents" plan
- [x] Confirm production env vars (`VITE_SUPABASE_URL` etc.) are already pointed at `hbcrwkmgsazqrvsrmxyr`, not dev, ahead of the cutover
- [x] Decide `WorkOrder_Broadcast` fix timing: pre-go-live (recommended) vs. bundled into go-live night
- [x] Confirm remote support coverage for Aug 17 itself — who's physically at the shop if something needs a screen-share/hands
