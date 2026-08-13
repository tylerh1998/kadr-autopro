# Pre-Go-Live Plan

**Purpose:** Outstanding work surfaced by the blueprint archival pass (`master_blueprint.md`, `blueprint_verification_plan.md`, `phase_14_implementation_plan.md`, the Native Appointment Reminders plan — now archived at `Plans and Context/Archive/Appointment_Reminders_implementation_plan.md`) that needs to happen before or alongside go-live, but is **not** itself a go-live cutover step. `go_live_checklist.md` owns what actually needs to happen to go live (schema/data/Edge Function deploys, go-live-night sequencing, post-cutover verification, rollback). This document owns everything else that was left outstanding when the blueprint effort closed. No crossover between the two — an item lives in exactly one of them.

> **LIVE DOCUMENT.** Update in place as items close. Don't delete history — annotate and check off instead.

---

## Action Plan

1. **Finish phases from the Reminders plan** (`Archive/Appointment_Reminders_implementation_plan.md` — Native Appointment Reminders) - **Completed and verified - 2026-08-12**
2. **Finish Phase 15** (Final Sunset — base44/`@base44` removal) - **in progress**
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

## Step 2 — Phase 15 (Final Sunset)

Status per `master_blueprint.md`: `[Pending]`, not started. Gate conditions: (1) blueprint-verify pass confirms every phase tested — **satisfied**, `blueprint_verification_plan.md` Section 3 closed 2026-08-14; (2) repo-wide `base44` grep in `src/` returns zero hits — **not satisfied**, 8 files still reference it as of 2026-08-14:
- `src/api/base44Client.js`
- `src/api/entities.js`
- `src/api/integrations.js`
- `src/components/work-orders/form/WorkOrderHeaderInfo.jsx`
- `src/components/work-orders/form/WorkOrderViewHeaderInfo.jsx`
- `src/components/work-orders/history/WorkOrderHistoryModal.jsx`
- `src/Layout.jsx`
- `src/lib/app-params.js`

The entire legacy `base44/functions/` tree (~130 function directories) is also still present, untouched, awaiting this phase. Deletes `@base44/sdk`, `@base44/vite-plugin`, `base44-proxy`, and the `base44/` source tree once clear.

---

## Step 3 — Outstanding Items (moved from the blueprint docs)

Each item below was originally logged in `blueprint_verification_plan.md` Section 2 or `master_blueprint.md`'s own phase table — moved here per disposition, with a note left at the source pointing back to this document.

- **P1** *(was A1)* — `search_customers_ranked` RPC fails on "First Last" full-name searches, app-wide (6 call sites: `Customers.jsx`, `NewWorkOrderModal.jsx`, `ChangeCustomerModal.jsx`, `MergeCustomerModal.jsx`, `VehicleForm.jsx`, plus the tracked SQL source `src/supabase/search_customers_ranked.sql`). Known fix: add a concatenated-full-name match to the `WHERE` clause, mirroring what `ORDER BY match_rank` already assumes exists.
- **P2** *(was B2)* — Plaintext JWT hardcoded in the `sync_customer_to_google` production Postgres trigger (on `Customer`). The sibling `WorkOrder_Broadcast` trigger already got this fix (`go_live_checklist.md` 2c) — same treatment needed here: investigate whether the JWT is actually read by the called function before deciding header-removal vs. Vault relocation. Related: the `Google-Contacts-Sync` Edge Function this trigger calls is live in production with no source tracked in this repo at all.
- **P3** *(was B3)* — `Employee.pay_rate` bigint→numeric(10,2) migration, applied to dev only. Production explicitly withheld pending go-ahead ("Not yet — I'll say when"). Several later phases (Payroll, Reports) build on this column.
- **P4** *(was D1)* — `CashFlowSummary`'s bigint-vs-double-precision fix (closed a real silent cent-truncation bug in Phase 10D) was never audited for the same pattern elsewhere in the codebase (other debounced-save flows, e.g. `saveRowToDb`/`persistRowOrder`).
- **P5** *(was D3)* — `TechClockStatusModal.jsx` (Followup 3C) — code changed but never live-click-tested in its own session because the deployed bundle hadn't rebuilt yet at the time. Confirm current deploy state and re-test.
- **P6** — **MOVED to `go_live_checklist.md` Section 4 (Post-Cutover Verification), 2026-08-14.** Phase 6 never had a true base44-vs-native baseline output diff performed for any of the 6 migrated report functions. Per user decision: do this after go-live-night's real data import, by comparing native report totals/row counts against the same reports' pre-cutover figures — not tracked here since it's now go-live-sequenced work.
- **P7** — **DROPPED, 2026-08-14 (user decision).** Production-UI confirmation of the 4 dev-tested Phase 14C Setup managers (Tag Along, Other Charges, WIP/Work Order Status) — seldom-used screens, not worth a dedicated pre-go-live pass. Can be checked post-go-live as needed; the user is also doing their own thorough pre-go-live checks over the cutover weekend regardless.
- **P8** — Phase 14F's full legacy-WO upload flow (`LegacyWorkOrderImportModal.jsx` + `autopro-processLegacyWorkOrder`) — **deferred indefinitely.** Needs a real legacy work-order PDF to test against, which doesn't exist. Admin-only feature — revisit if/when a real upload is actually needed, not before.
- **P9** *(was N1)* — `WarrantyReturnModal.jsx` (work-orders one) regression check for nearby Phase 7 changes. Likely already covered by Phase 13E's later live-test of this same file's `WorkOrder.get()`/`.update()` conversion and GL-transaction insert, but per user: quick to re-verify directly with existing test data (~2 min) — create a warranty return on a test WO, confirm it still saves and posts GL correctly.
- **P10** *(was N4)* — Phase 5's `autopro-mergeVehicles` — its embedded `base44.entities.Appointment` reassignment call always hits its catch branch (silent no-op), left over from before Appointment went native (Phase 12). Now that Appointment is fully native, decide whether to rewire this to a direct `supabase.from('Appointment')` call or leave the no-op as accepted behavior.
- ~~**P11** *(was N3)* — The `employee_id` bigint-rejects-empty-string fix (Phase 12).~~ **RESOLVED, user-verified live 2026-08-14** — created a real appointment with no technician selected, saved clean, no `22P02` error. See `blueprint_verification_plan.md`'s corresponding entry.

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
