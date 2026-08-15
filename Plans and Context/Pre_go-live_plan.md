# Pre-Go-Live Plan

**Purpose:** Outstanding work surfaced by the blueprint archival pass (`Archive/master_blueprint.md`, `Archive/blueprint_verification_plan.md`, `Archive/phase_14_implementation_plan.md`, the Native Appointment Reminders plan — now archived at `Archive/Appointment_Reminders_implementation_plan.md`) that needs to happen before or alongside go-live, but is **not** itself a go-live cutover step. `go_live_checklist.md` owns what actually needs to happen to go live (schema/data/Edge Function deploys, go-live-night sequencing, post-cutover verification, rollback). This document owns everything else that was left outstanding when the blueprint effort closed. No crossover between the two — an item lives in exactly one of them.

> **LIVE DOCUMENT.** Update in place as items close. Don't delete history — annotate and check off instead.

---

## Action Plan

1. **Finish phases from the Reminders plan** (`Archive/Appointment_Reminders_implementation_plan.md` — Native Appointment Reminders) - **Completed and verified - 2026-08-12**
2. **Finish Phase 15** (Final Sunset — base44/`@base44` removal) - **Completed and verified - 2026-08-13**
3. **This document** — the outstanding pre-go-live items below
4. **Final checks**
5. **Go-live list Section 2** (`go_live_checklist.md`)
6. **When ready: go-live list Section 3/4**

---

## Step 1 — Reminders Plan (`Archive/Appointment_Reminders_implementation_plan.md`)

Status per that document: Phases 1–4 executed and verified 2026-08-10/11. Phase 5 (scheduling + end-to-end verification) — the real unattended weekday `pg_cron` firing — is now confirmed live (2026-08-14, both email and SMS landed with nobody triggering anything). Remaining:

- **R1.** Delete the standing sentinel test appointment (`Appointment` id `cronsample0001aaaaaaaaaa`, Tyler Haney's own contact) now that the unattended firing is confirmed — it was deliberately left in place only to catch this proof point.
- ~~**R2.** Phase 6 — retrofit the 6 already-in-production email/SMS functions onto the shared module, port `resendWebhook` to native.~~ **DONE on dev, 2026-08-14.** All 7 functions retrofitted (dedup only — literal duplicated HTTP-call boilerplate replaced with shared-module imports, no behavior changes to logging/HTML/response shapes, except a minor failure-path status-code change on the two low-stakes `report-issue` functions). New `autopro-resendWebhook` deployed, 1:1 port of the base44 original. All 8 deployed to dev and confirmed `ACTIVE`; per instruction, none were invoked with a real send. **Two things remain, both need the user directly:** (1) production deploy of all 8 once ready; (2) repoint Resend's dashboard webhook URL from the base44 endpoint to the new `autopro-resendWebhook` URL — this is the actual precondition for Step 2 (Phase 15), since the base44 webhook keeps handling real delivery callbacks until that repoint happens.

---

## Step 2 — Phase 15 (Final Sunset) — Completed and verified, 2026-08-13

`@base44/sdk`/`@base44/vite-plugin` removed from `package.json`/`vite.config.js`; SDK wrapper files (`base44Client.js`/`entities.js`/`integrations.js`) deleted; local `base44/functions/` tree (~130 dirs) hard-deleted; `base44-proxy` deleted from dev; full-repo `base44` grep clean except deliberately-preserved exceptions (audit-string checks, external link, `app-params.js`, historical comments). Full detail archived at `Archive/phase_15_final_sunset_implementation_plan.md`; rolled-up evergreen facts now live in `master_context.md`. **One item deliberately deferred, not a gap:** `base44-proxy` remains deployed on **production** — user decision, held until after the Aug 17 go-live cutover since production still runs the base44-hybrid app being replaced that day. Zero functional cost either way (already unreachable for all real traffic).

---

## Step 3 — Outstanding Items (moved from the blueprint docs)

Each item below was originally logged in `Archive/blueprint_verification_plan.md` Section 2 or `Archive/master_blueprint.md`'s own phase table — moved here per disposition, with a note left at the source pointing back to this document.

- ~~**P1** *(was A1)* — `search_customers_ranked` RPC fails on "First Last" full-name searches, app-wide (6 call sites: `Customers.jsx`, `NewWorkOrderModal.jsx`, `ChangeCustomerModal.jsx`, `MergeCustomerModal.jsx`, `VehicleForm.jsx`, plus the tracked SQL source `src/supabase/search_customers_ranked.sql`).~~ **RESOLVED on both dev and production, 2026-08-14** — full plan: `pregolive_p1_p3_p4_batch_plan.md`. Verified via direct SQL on both projects (a real production customer, "Candace Sikora," now correctly matches at rank 3; existing single-term searches unregressed). **Note: no live UI click-through was ever performed on `test.kensauto.ca` or production** (no agent login access; user authorized production promotion directly off the SQL evidence) — if `Customers.jsx`/`NewWorkOrderModal.jsx`'s search box ever behaves unexpectedly, this is the first place to check.
- ~~**P2** *(was B2)* — Plaintext JWT hardcoded in the `sync_customer_to_google` production Postgres trigger (on `Customer`).~~ **RESOLVED on production, 2026-08-14** — full plan: `p2_sync_customer_to_google_jwt_fix_plan.md`. `Google-Contacts-Sync` redeployed with `verify_jwt: false` (its own code never read the incoming JWT anyway, confirmed by pulling its deployed source directly — still untracked in this repo); trigger redefined with no `Authorization` header, matching the already-fixed sibling `WorkOrder_Broadcast` exactly. Verified via a direct no-auth-header call that deliberately failed the function's own early validation, proving the new auth model works without ever touching a real Google Contact (user explicitly declined any test that would create real Google Contact data). **Deliberately not replicated on dev** — this integration has no dev equivalent and must not get one (`Customer` has zero triggers on dev; syncing dev/test customer churn into the shop's real Google Contacts would be actively harmful). **Still open, separate from this fix:** the now-removed service-role JWT was exposed via schema access and should be rotated via the Supabase dashboard — out-of-band action, no tooling available to do it from this session, not yet done.
- ~~**P3** *(was B3)* — `Employee.pay_rate` bigint→numeric(10,2) migration.~~ **RESOLVED on both dev and production, 2026-08-14** — full plan: `pregolive_p1_p3_p4_batch_plan.md`. **Correction logged during this fix: this doc previously claimed dev already had this migration — verified directly and it did not** (was still `bigint` on both projects). Existing whole-number values confirmed intact on both (lossless widening, e.g. `35`→`35.00`); a direct-SQL simulation of `TechDirectory.jsx`'s exact write path confirmed decimal pay rates now save correctly (previously threw `22P02`); confirmed via a raw PostgREST call that `numeric` serializes as a genuine JSON number, so the frontend's `.toFixed(2)` display and the 3 dependent report functions are unaffected. User authorized production promotion directly ("Move it over to prod"), superseding the earlier "Not yet — I'll say when" hold. **Note: no live UI click-through was ever performed** on `test.kensauto.ca` or production (no agent login access) — if `TechDirectory.jsx`'s pay-rate editor ever behaves unexpectedly, this is the first place to check.
- ~~**P4** *(was D1)* — `CashFlowSummary`'s bigint-vs-double-precision fix (closed a real silent cent-truncation bug in Phase 10D) was never audited for the same pattern elsewhere in the codebase (other debounced-save flows, e.g. `saveRowToDb`/`persistRowOrder`).~~ **RESOLVED (audit-only), 2026-08-14** — full audit performed, see `pregolive_p1_p3_p4_batch_plan.md`. `saveRowToDb`/`persistRowOrder` (`CashFlow.jsx`) write to `CashFlowEntry.amount`/`amount_paid`, already `double precision` — clean, no bug. A schema-wide sweep for other bigint columns with money-shaped names found only GL-account-number codes (correctly bigint) and two currently-unwritten fields (`SystemSettings.shop_supply_rate`, `PayPeriods.total_pto_hours`/`total_stat_hours` — bigint, theoretically fractional-capable, but no live code path writes to either). No active bug found; the two unwritten-field landmines are carried into `master_context.md`'s recurring-traps list for future awareness.
- **P5** *(was D3)* — `TechClockStatusModal.jsx` (Followup 3C) — code changed but never live-click-tested in its own session because the deployed bundle hadn't rebuilt yet at the time. Confirm current deploy state and re-test. **tested and verified by user**
- **P6** — **MOVED to `go_live_checklist.md` Section 4 (Post-Cutover Verification), 2026-08-14.** Phase 6 never had a true base44-vs-native baseline output diff performed for any of the 6 migrated report functions. Per user decision: do this after go-live-night's real data import, by comparing native report totals/row counts against the same reports' pre-cutover figures — not tracked here since it's now go-live-sequenced work.
- **P7** — **DROPPED, 2026-08-14 (user decision).** Production-UI confirmation of the 4 dev-tested Phase 14C Setup managers (Tag Along, Other Charges, WIP/Work Order Status) — seldom-used screens, not worth a dedicated pre-go-live pass. Can be checked post-go-live as needed; the user is also doing their own thorough pre-go-live checks over the cutover weekend regardless.
- **P8** — Phase 14F's full legacy-WO upload flow (`LegacyWorkOrderImportModal.jsx` + `autopro-processLegacyWorkOrder`) — **deferred indefinitely.** Needs a real legacy work-order PDF to test against, which doesn't exist. Admin-only feature — revisit if/when a real upload is actually needed, not before.
- **P9** *(was N1)* — `WarrantyReturnModal.jsx` (work-orders one) regression check for nearby Phase 7 changes. Likely already covered by Phase 13E's later live-test of this same file's `WorkOrder.get()`/`.update()` conversion and GL-transaction insert, but per user: quick to re-verify directly with existing test data (~2 min) — create a warranty return on a test WO, confirm it still saves and posts GL correctly.
- ~~**P10** *(was N4)* — Phase 5's `autopro-mergeVehicles` — its embedded `base44.entities.Appointment` reassignment call always hits its catch branch (silent no-op), left over from before Appointment went native (Phase 12). Now that Appointment is fully native, decide whether to rewire this to a direct `supabase.from('Appointment')` call or leave the no-op as accepted behavior.~~ **RESOLVED via Phase 15B, 2026-08-14** — rewired to a direct `supabase.from('Appointment').update()`; deployed and live-verified (`mergedCount.appointments` now reflects a real reassignment instead of always 0). See `phase_15_final_sunset_implementation_plan.md`'s 15B closeout for detail.
- ~~**P11** *(was N3)* — The `employee_id` bigint-rejects-empty-string fix (Phase 12).~~ **RESOLVED, user-verified live 2026-08-14** — created a real appointment with no technician selected, saved clean, no `22P02` error. See `Archive/blueprint_verification_plan.md`'s corresponding entry.
- ~~**P12** — **New, found 2026-08-13 during live 15C testing, unrelated to base44/Phase 15.** `WorkOrder.line_items` is a genuine jsonb array column, but a large historical share of rows hold it as a JSON *string* instead of a true array.~~ **RESOLVED on both dev and production, 2026-08-14** — full plan and results: `p12_line_items_backfill_plan.md`. Executed as a user-directed 3-stage rollout (controlled single-record canary → whole dev DB → production, each gated on the previous stage's validation). Final state: **zero rows anywhere with corrupted `line_items`** (dev: 1,087 rows fixed across stages 1+2; production: 1,166 rows fixed in stage 3). Every financial aggregate (`total_amount`/`parts_total`/`labor_total`/`tax_amount`) confirmed byte-identical before/after at every stage; `get_parts_movement_v2` report output confirmed byte-identical; `workorderversionhistory` row count confirmed unchanged throughout (a newly-discovered second trigger, `audit_workorder_changes`, was deliberately disabled for the duration of each stage's `UPDATE` so this technical fix wouldn't pollute the audit trail with spurious "material change" entries — re-enabled immediately after each stage). The forward-going root cause (`buildWorkOrderSavePayload.js` double-encoding) and the read-side crash it caused in `search_work_order_parts` were already fixed earlier this session, on both dev and production.

**Cross-references (already tracked elsewhere, not duplicated here):**
- Phase 13's production replay backlog (dev-only RPCs/tables/Edge Functions) — this is the same gap `go_live_checklist.md` Sections 2a/2b/2d already track (schema/migrations, static data, Edge Functions). See that document, not this one.
- Phase 1's Edge Function deployment/secret-setting/reference-table seeding — covered by the same go-live checklist items; secrets already confirmed set.
- Expired `BASE44_ACCESS_TOKEN` — becomes moot once Phase 15 (Step 2) removes reliance on base44 entirely; no separate action needed.

---

## Step 4 — Final Checks

*(To be scoped once Steps 1–3 close.)*

User -> I think we should do a review of the codebase looking for anything of note. Then the User will do full system-wide checks and testing. We've already done live testing through the AI Agent, this will be the final shindig for testing before moving to go-live. Once this test is passed we will move to go-live list.

---

## Step 5/6 — Go-Live List

Not housed here — see `go_live_checklist.md` Section 2 (pre-go-live work) and Sections 3/4 (go-live night + post-cutover verification).
