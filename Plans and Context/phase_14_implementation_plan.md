# Phase 14 Implementation Plan: Setup, Admin & Lankar Import (Deprecation + Cleanup)

**Status:** **Rescoped 2026-08-05 — ready for execution. No open decisions blocking start.**
**Parent:** `master_blueprint.md`, Phase 14 (Tier F). Final Sunset is no longer this phase's job — see §0.9 and the new Phase 15 pointer.
**Prepared:** 2026-08-03 (initial research), substantially rescoped 2026-08-05 following user decisions in §0.9.
**Supabase project refs:** dev branch `sitihbdnuxifwibontcm` (schema/RLS changes tested here first, always); production `hbcrwkmgsazqrvsrmxyr` (applied second, after dev verification)

> **LIVE DOCUMENT.** This plan is updated in place as execution/verification surfaces new findings — do not wipe prior sections, append/annotate instead. Key learnings roll back into `master_blueprint.md` Section 7 at phase close.

---

## 0) Open Questions, Info Requirements & Suggestions

*(§0.1–§0.8 are the historical research/decision record that led to the rescope in §0.9. Kept verbatim per this doc's own "don't wipe, append" rule. If you're picking this plan up fresh, read §0.9 first — it supersedes the scope described in §0.1-§0.8 — then jump to Section 1.)*

### 0.1 — RESOLVED: Phase 10E conflict cleared

Re-checked 2026-08-03 (later same day) per your direction ("we're all done up to phase 14"). `phase_10_implementation_plan.md` is now committed clean (`git status` shows no pending changes to it), and `master_blueprint.md`'s own detailed Phase 10 row confirms all 5 of Phase 10's own sub-phases (10A-10E) landed `[Tested]`. No more active-conflict risk on `Admin.jsx` from this direction.

### 0.1b — Phase 13's "Tested" status doesn't mean its blast radius is fully swept

You confirmed Phase 13 is done/`[Tested]`. Direct grep + read confirmed 4 files (`Schedule.jsx`, `AppointmentForm.jsx`, `InventoryAdd.jsx`, `WarrantyReturnModal.jsx`) still had real, live, unmigrated imports of functions Phase 13B built native replacements for (`getworkorderlist`/`createworkorderdata`/`searchInventory`/`searchSuppliers`) — not dead code as I'd first (wrongly) reported. Some of these were independently fixed by other commits since (see §0.8). This isn't a knock against Phase 13 completing its own claimed scope — it's evidence no phase ever did a full consumer-sweep for these shared legacy functions. Full residue list now in the Appendix.

### 0.1c — Phase 10A folded into a separate "final validation plan"

Per your direction, the cross-cutting integration-testing pass (`master_blueprint.md`'s separate "Phase 10A: Full Inventory Flow + Appointment — Combined Testing & Cleanup") is being rolled into a final validation plan outside this document. Not tracked as a blocker here.

### 0.2 — RESOLVED (2026-08-05): entity status, including the `Statement` rename

Direct SQL against both branches, confirmed:

| Entity | Dev | Production | RLS |
|---|---|---|---|
| `GSTReturn`, `Levies`, `OtherChargeList`, `SystemSettings`, `SalesClass` | ✅ | ✅ | 1 policy, both |
| `TagAlong`, `WorkOrderStatus`, `CustomerPortalWorkOrder`, `SentEmailLog` | ✅ | ❌ missing | 1 policy on dev |
| `CustomerPortalStatement` (renamed from `Statement` — you confirmed the rename 2026-08-05) | ✅ | ❌ missing | not yet checked, expect 1 policy per the established pattern — verify in 14C |

**Your decision:** replay of all 5 still-missing-on-production tables (`TagAlong`/`WorkOrderStatus`/`CustomerPortalWorkOrder`/`SentEmailLog`/`CustomerPortalStatement`) is included in this plan (14C).

### 0.3 — RESOLVED (2026-08-05): AR cluster re-checked, only 2 files remain

You confirmed you'd already been working this area and suspected the earlier failures were caused by these gaps. Re-grepped the full original AR/Statements cluster directly:

**Already clean** (migrated since my first pass, independently of this plan): `ARPaymentDetailsModal.jsx`, `ARPaymentEmailModal.jsx`, `InterestCalculationModal.jsx`, `StatementModal.jsx`, `TakePaymentModal.jsx`, `CustomerARTransactions.jsx`, `EmailLog.jsx`.

**Still base44-dependent — added to this plan (new 14E, see Section 3):**
- `src/components/ar/StatementEmailModal.jsx` — `base44.functions.invoke('sendStatementEmail', {...})`, one call site, sends a customer statement email. Simple, no entity writes.
- `src/components/ar/BatchSendWorkOrdersModal.jsx` — two function-shim imports: `createBatchPortalSnapshot` (writes a `CustomerPortalWorkOrder` snapshot row — depends on 14C's replay of that table) and `sendBatchWorkOrderEmails` (sends one email per selected WO).

Neither touches the two protected GL functions. Full detail in 14E below.

### 0.4 — RESOLVED (2026-08-05): `processLegacyWorkOrder` is Phase 14's to port

"This will be added to phase 14's scope, as all other phases are completed." — 14F ports it, unchanged from the original plan.

### 0.5 — RESOLVED (2026-08-05): `processDataImport` and its whole feature cluster are deprecated, not migrated

You confirmed this entire capability is no longer needed — it existed only to bulk-import incompatible legacy LANKAR data (customers/vehicles/suppliers/inventory/inventory_locations/balance_sheet) into AutoPRO with special mapping/row-add logic, a one-time migration tool whose job is done. **Deprecate outright, don't port:**
- `processDataImport` (the function) — never gets a native replacement.
- `LankarImport.jsx`'s "Database Type" selector + file-upload/import UI — deleted from the page.
- `AddLegacyInvoiceModal.jsx` ("Add Legacy Invoice to AR") — deleted entirely, button and all.
- `LankarImportReturnModal.jsx` ("Add Legacy Return") — deleted entirely, button and all.

**Explicitly NOT deprecated:** `LegacyWorkOrderImportModal.jsx` / `processLegacyWorkOrder` (14F) — "we still have a few legacy work orders yet to be moved over." This one gets migrated, not deleted.

This replaces the old 14D/14E entirely — see Section 3's new 14D.

### 0.6 — Superseded by §0.1b

(Historical note about Phase 13's blueprint status being stale — resolved, see §0.1b.)

### 0.7 — Superseded by the Appendix

(Original cross-phase-residue breakdown here has been superseded by a fresher, more precisely-categorized version in the Appendix at the end of this document, per your request to hand it to a separate agent.)

### 0.8 — Historical: mid-session progress check (2026-08-05, morning)

Confirmed real base44→native migrations had already landed independently of this plan (AR payment-receipt details, `EmailLog.jsx`, `getworkorderlist`/`createworkorderdata`, `TagAlongManager.jsx`) and flagged a live production risk: `TagAlongManager.jsx` had already been converted to query `TagAlong` directly, but `TagAlong` didn't exist on production yet. That risk is now formally addressed by 14C below (and per §0.2, you've decided to include all 5 affected tables' replay in this plan).

### 0.9 — Today's rescoping decisions (2026-08-05, this supersedes the scope in §0.1-§0.8)

Full summary of what changed and why, consolidated from your latest message:

1. **`Statement` → `CustomerPortalStatement`**, exists on dev. Replay of all 5 dev-only tables (including this one) is now explicitly in scope (14C).
2. **AR cluster** re-verified — only `StatementEmailModal.jsx` and `BatchSendWorkOrdersModal.jsx` remain unmigrated; both added to this plan (new 14E).
3. **`processLegacyWorkOrder`** confirmed Phase 14's to port (14F, unchanged).
4. **`processDataImport` and its whole UI surface are deprecated, not migrated** — this removes the single largest, riskiest piece of the original plan (a 459-line 6-type bulk importer) and replaces it with straightforward deletion. Also deprecates `AddLegacyInvoiceModal.jsx` and `LankarImportReturnModal.jsx` outright (both deleted, not ported).
5. **14A (Setup backup/restore) is deprecated, not migrated** — a different backup solution is coming that overhauls this area anyway. `Setup.jsx`'s backup button and `RestoreBackupModal.jsx` are deleted, not ported. `SalesClassManager.jsx` (unrelated Sales Class CRUD, same file family) still gets migrated.
6. **14B (Admin.jsx) is mostly deprecated** — the entire "Database Query Tool" (generic entity browser: Extract/Search/Edit against any table) is deleted, along with its only child component `RecordDetailsModal.jsx`. The page shell and the "Lankar Import" nav button stay. A full rebuild of this area is planned for post-Phase-15, out of scope here.
7. **14G becomes a verification-only step**, not the sunset. Final Sunset (deleting `@base44/sdk`, `base44-proxy`, the `base44/` tree) moves to a **new Phase 15**, which runs after a separate "final validation / blueprint verify" pass confirms every phase's features are functional and tested. Rationale (yours, preserved verbatim in spirit): only get rid of base44 context once — once all base44 calls/functions are removed from the codebase (except the `base44/` folder itself), all features are functional and tested (in case base44's own source is needed as a reference while troubleshooting), and Phase 14 is complete. A one-line pointer to this future Phase 15 has been added to `master_blueprint.md` Section 1 so it isn't forgotten, without adding a full Roadmap entry yet (that happens at rollup).
8. **The Appendix** (end of this document) is a standalone handoff package — every remaining base44-referencing file outside Phase 14's own scope, categorized by likely owning phase and by exactly what kind of block it is (function shim / entity import / SDK method call / dead import / mixed), so a separate agent can work through it in parallel while this phase executes. Both efforts converge at 14G.

---

## 1) Phase Scope & Objectives

**Objective:** Deprecate the Setup backup/restore feature and the entire LANKAR bulk-data-import feature (both confirmed obsolete), gut Admin.jsx's generic database tool (confirmed will be rebuilt later), migrate what's left (Sales Classes, the 4 remaining Setup managers, the last 2 AR-cluster files, the legacy work-order importer) to native Supabase, and replay 5 still-dev-only tables to production. Close with a verification pass — **not** the base44 SDK/proxy/tree removal, which is now Phase 15's job.

**In scope:**

1. **14C — Production Table Replay (do this first — see "Execution Order" below):** replay `TagAlong`/`WorkOrderStatus`/`CustomerPortalWorkOrder`/`SentEmailLog`/`CustomerPortalStatement` schema+RLS to production. Finish converting `OtherChargesManager.jsx`, `WIPSettings.jsx`, `WorkOrderStatusManager.jsx` to direct `supabase.from()` (`TagAlongManager.jsx` is already done, per §0.8 — verify, don't re-port).
2. **14A — Deprecate Setup Backup/Restore, migrate Sales Classes:** delete `Setup.jsx`'s backup button/handler and `RestoreBackupModal.jsx` outright (no native port). Migrate `SalesClassManager.jsx`'s CRUD to direct `supabase.from('SalesClass')`.
3. **14B — Deprecate Admin.jsx's Database Query Tool:** delete the entire generic entity-browser (state, handlers, `SUPABASE_TABLES`/`LOCAL_ENTITIES` arrays, the whole "Database Query Tool" card) and its only child component, `RecordDetailsModal.jsx`. Keep the page shell (admin access-gate, header) and the "Lankar Import" nav button.
4. **14D — Deprecate LANKAR bulk import + legacy AR/return modals; migrate `LankarWOView.jsx`:** delete `LankarImport.jsx`'s "Database Type" selector, file-upload card, and import button (no `processDataImport` port — abandoned). Delete `AddLegacyInvoiceModal.jsx` and `LankarImportReturnModal.jsx` outright, including their buttons on `LankarImport.jsx`. Migrate `LankarWOView.jsx`'s `getLankarWorkOrderData` call to native (unrelated display page, not part of the deprecation).
5. **14E — AR Cluster Remainder:** port `sendStatementEmail` (→ `autopro-sendStatementEmail`) for `StatementEmailModal.jsx`; port `createBatchPortalSnapshot`/`sendBatchWorkOrderEmails` (→ `autopro-createBatchPortalSnapshot`/`autopro-sendBatchWorkOrderEmails`) for `BatchSendWorkOrdersModal.jsx`. The former depends on 14C's `CustomerPortalWorkOrder` replay if targeting production.
6. **14F — `LegacyWorkOrderImportModal.jsx` + `autopro-processLegacyWorkOrder`:** unchanged from original plan — replace `UploadFile`/`ExtractDataFromUploadedFile` with native Storage upload + direct Gemini extraction (same pattern as `autopro-suggestInventoryCategory`); port `processLegacyWorkOrder`; swap `Customer`/`Vehicle`/`InventoryItem` entity imports to direct `supabase.from()`.
7. **14G — Final Verification Stage (not sunset):** repo-wide grep confirms zero `base44`/`@/entities/all`/`@/functions/*` hits across everything 14A-14F touched; full walkthrough of Setup, Admin, and Lankar Import; confirm no regressions in any consumer of the 5 newly-replayed tables. Once cleared, this phase is done and the separate final-validation pass (§0.9 item 7) + eventual Phase 15 take over.

**Recommended execution order** (not strictly A→G — several of these are now independent deletions that can happen in any order, but sequencing matters where noted):
1. **14C first** — closes the live production risk flagged in §0.8 (`TagAlong` already queried directly by shipped code, table still missing on production) and unblocks 14E's `CustomerPortalWorkOrder` dependency.
2. **14A, 14B, 14D** — all fast, low-risk deletions now; no reason to sequence relative to each other or to 14C except that 14D should follow 14C only if you want `LankarWOView.jsx`'s migration verified against production-shaped data (not a hard dependency).
3. **14E, 14F** — the remaining real function ports.
4. **14G** — verification, once 14A-14F are all done.

**Explicitly NOT in scope:**
- The Appendix's cross-phase residue (Phase 5/7/8/12/13-boundary leftovers) — handed off separately, not this phase's file scope, converges with this phase only at 14G's grep check.
- `CreditInvoice.jsx` — confirmed by Phase 13's own closeout to be deliberately still full-base44; in the Appendix, not claimed by anyone yet.
- Final Sunset itself (`@base44/sdk` removal, `base44-proxy` deletion, `base44/` tree deletion) — now Phase 15, after a separate final-validation pass.

**Target outcome:** `Setup.jsx`, `Admin.jsx`, `LankarImport.jsx`, and every file under `src/components/setup/` and `src/components/lankar/` are either fully native or deleted. `SalesClass`/`OtherChargeList`/`SystemSettings`/`TagAlong`/`WorkOrderStatus`/`CustomerPortalWorkOrder`/`SentEmailLog`/`CustomerPortalStatement` all fully native, both branches. Three new native functions deployed and curl-verified (`autopro-processLegacyWorkOrder`, `autopro-sendStatementEmail`, `autopro-createBatchPortalSnapshot`/`autopro-sendBatchWorkOrderEmails`). `processDataImport`, `AddLegacyInvoiceModal.jsx`, `LankarImportReturnModal.jsx`, `Setup.jsx`'s backup/restore feature, and `Admin.jsx`'s Database Query Tool are all gone, not ported.

---

## 2) Lessons Learned & Context

Pulled from `master_blueprint.md` §7, filtered to what's load-bearing for this phase:

- **Always confirm entity status directly against the database, never trust a classification table at face value** — this plan's own §0.2 research caught a real rename (`Statement`→`CustomerPortalStatement`) and confirmed exactly which of the 5 target tables are missing from production. Re-confirm RLS policy count (1, not 0) on all 5 immediately before/after the 14C replay — the Phase 1 zero-policy landmine has recurred 3+ times on exactly this kind of dev-to-prod schema replay.
- **Client-generated 24-char-hex ids (`crypto.randomUUID().replace(/-/g,'').substring(0,24)`) are the project-wide convention for every native `.insert()`**, confirmed as recently as Phase 11 (where the plan's own stated assumption that no id-generation was needed turned out wrong — caught only by checking `pg_attrdef` directly). Apply this check before any new insert in 14A (`SalesClassManager.jsx`) or 14E's two new functions.
- **`@/entities/X` and `base44.entities.X` are functionally identical to the `SupabaseProxy` shim** — both route through Base44. Applies to every remaining `@/entities/all` import touched in this phase (`OtherChargesManager.jsx`, `WIPSettings.jsx`, `WorkOrderStatusManager.jsx`, `LankarWOView.jsx`, `LegacyWorkOrderImportModal.jsx`).
- **All native `autopro-*` Edge Functions return HTTP 200 with `{ error }` on failure** — apply to `autopro-processLegacyWorkOrder`, `autopro-sendStatementEmail`, `autopro-createBatchPortalSnapshot`, `autopro-sendBatchWorkOrderEmails`.
- **Drop the `base44.auth.me()` gate when porting** — resolve identity from the caller's Supabase JWT only when audit fields are actually needed (Phase 8C pattern: `supabase.auth.getUser(token)`, safe because these functions deploy with `verify_jwt: true`).
- **A native Storage-upload + direct-fetch-to-Edge-Function pattern already exists and works** — `PartsInvoiceOCRModal.jsx` uploads to `supabase.storage.from('kadr-digital_invoice_uploads')` then calls its backing function directly via `fetch()`. Reuse exactly for 14F's `UploadFile` replacement.
- **A native, Gemini-grounded extraction pattern already exists** (`autopro-suggestInventoryCategory`, Phase 7; `autopro-processPartsInvoiceOCR`) — model 14F's AI-extraction port after these. Do **not** touch `GEMINI_API_KEY` while doing this.
- **The "one failed promise poisons the whole `Promise.all`" pattern has recurred 5+ times** — check `Admin.jsx` (post-deletion, should be trivial), `Setup.jsx`, and `LankarImport.jsx`'s remaining data-loading code for this shape.
- **Before deleting a component, grep for every importer, not just the obvious one** — already done for `RestoreBackupModal.jsx` (only `Setup.jsx`), `RecordDetailsModal.jsx` (only `Admin.jsx`), `AddLegacyInvoiceModal.jsx`/`LankarImportReturnModal.jsx`/`processDataImport` (only `LankarImport.jsx` and themselves) — all confirmed clean single-owner deletions, no orphaned references expected elsewhere.
- **Leave the `base44/` source directory and live Base44 platform deployments alone** — still true, now extends through Phase 15 rather than resolving at the end of this phase.
- **A phase's own plan can state an assumption that turns out wrong even after explicit attention** — verify, don't assume, at every "should be safe" step, same as always.

---

## 3) Phase 14 Roadmap & Progress

| Sub-phase | Status | Overview |
|---|---|---|
| 14C | **Code complete 2026-08-05 — live-verify pending deploy** | Production replay of 5 dev-only tables + finish 3 remaining Setup managers |
| 14A | **Code complete 2026-08-05 — live-verify pending deploy** | Deprecate Setup backup/restore; migrate Sales Classes |
| 14B | **Code complete 2026-08-05 — live-verify pending deploy** | Deprecate Admin.jsx's Database Query Tool + `RecordDetailsModal.jsx` |
| 14D | **Code complete 2026-08-05 — live-verify pending deploy** | Deprecate LANKAR bulk import + legacy AR/return modals; migrate `LankarWOView.jsx` |
| 14E | **Code complete 2026-08-05 — live-verify pending deploy** | AR cluster remainder: `StatementEmailModal.jsx` + `BatchSendWorkOrdersModal.jsx` |
| 14F | **Code complete 2026-08-05 — live-verify pending deploy** | `LegacyWorkOrderImportModal.jsx` + `autopro-processLegacyWorkOrder` |
| 14G | Pending (last, not yet started per user direction) | Final verification stage — not sunset |

---

### 14C — Production Table Replay + Remaining Setup Managers

**Do this first** — closes the live production risk from §0.8 and unblocks 14E.

**Target:** new migration replaying `TagAlong`/`WorkOrderStatus`/`CustomerPortalWorkOrder`/`SentEmailLog`/`CustomerPortalStatement` schema+RLS to production; `src/components/setup/OtherChargesManager.jsx`, `src/components/setup/WIPSettings.jsx`, `src/components/setup/WorkOrderStatusManager.jsx`. `TagAlongManager.jsx` is **already converted** (confirmed reading current source 2026-08-05 — uses `supabase.from('TagAlong')`/`supabase.from('OtherChargeList')` throughout) — verify only, don't re-port.

**Schema replay (production), column-for-column confirmed from dev via `information_schema`:**
- `TagAlong(name, description, other_charge_id, tagalongid, id, created_date, updated_date, created_by_id, created_by, is_sample)`
- `WorkOrderStatus(name, display_order, color, is_active, id, created_date, updated_date, created_by_id, created_by, is_sample)`
- `CustomerPortalWorkOrder` — 24 columns (`original_work_order_id`, `cp_id`, `ref_number`, `ref_date`, `snapshot_date`, `notes_to_customer`, `customer_snapshot`, `vehicle_snapshot`, `line_items_snapshot`, `parts_total`, `labor_total`, `shop_supply_total`, `tax_amount`, `total_amount`, `payments`, `amount_paid`, `po_number`, `stage`, `approval`, + standard audit fields)
- `SentEmailLog(to_email, from_email, subject, body, body_preview, status, status_message, sent_date, customer_id, work_order_id, portal_url, tracking_id, + standard audit fields)`
- `CustomerPortalStatement(statement_date, cp_id, customer_id, transactions [jsonb], total_balance_due, aged_balances [jsonb], + standard audit fields)`

Generate each `CREATE TABLE` from dev's live `information_schema` output, apply to production, then add the same single permissive RLS policy pattern already used for every other replay this project has done.

**Detailed Execution Plan:**

| File | Current dependency | Change |
|---|---|---|
| `TagAlongManager.jsx` | *(already done)* | Live-verify only — add/edit/delete a throwaway Tag Along on dev, then re-verify on production once the replay lands. |
| `OtherChargesManager.jsx:5` `import { OtherChargeList } from "@/entities/all";` | `OtherChargeList.list('-created_date')/create()/update()/delete()` | `supabase.from('OtherChargeList').select('*').order('created_date', { ascending: false })` + matching insert/update/delete. File already uses direct `supabase.from('ChartOfAccount')` for its GL dropdown — only the `OtherChargeList` CRUD needs conversion. No replay dependency (`OtherChargeList` already native both branches). |
| `WIPSettings.jsx:9` `import { SystemSettings } from "@/entities/all";` | `SystemSettings.list()/create()/update()` | `supabase.from('SystemSettings')...` — no replay dependency, `SystemSettings` already native both branches. |
| `WorkOrderStatusManager.jsx:2` `import { WorkOrderStatus } from '@/entities/all';` | Presumably `list/create/update/delete`, same shape as `TagAlongManager.jsx`'s original code — read the full handler section before executing (only the imports/color-options were read so far) | `supabase.from('WorkOrderStatus')...` — needs the production replay first if this file is exercised on production. |

**Task List:**
- [x] Write and apply the 5-table schema-replay migration to production (schema + RLS only — these are config tables, nothing to backfill). Applied 2026-08-05, migration `phase14c_replay_tagalong_workorderstatus_customerportalwo_sentemaillog_customerportalstatement`.
- [x] Confirm via direct SQL: RLS enabled, exactly 1 policy, on all 5 new production tables. Confirmed 2026-08-05 — all 5 show `rls_enabled: true`, `policy_count: 1`; `get_advisors` security scan shows no new findings tied to these tables.
- [x] Read `WorkOrderStatusManager.jsx`'s full CRUD handlers (not yet reviewed line-by-line) and convert. Converted to direct `supabase.from('WorkOrderStatus')` throughout (list/create/update/delete + the drag-reorder `Promise.all`, which now checks each result for `.error` instead of letting one rejection type silently pass others).
- [x] Convert `OtherChargesManager.jsx`, `WIPSettings.jsx`. Both converted to direct `supabase.from()` calls (`OtherChargeList`, `SystemSettings`), 24-char-hex id convention applied on inserts, confirmed against live dev rows first.
- [ ] Live-verify `TagAlongManager.jsx`'s existing conversion on dev, then production post-replay. **Deferred — testing excluded until after commit/push/deploy per current session instructions.**
- [ ] Live-verify each of the other 3 managers' CRUD round-trip on dev, then production post-replay. **Deferred, same reason.**
- [x] Fold `TagAlong`/`WorkOrderStatus`/`CustomerPortalWorkOrder`/`SentEmailLog`/`CustomerPortalStatement` into 14B's replacement... **note:** since 14B now deletes the entity-browser entirely, there is no `SUPABASE_TABLES` array left to fold these into. Skipped as noted (confirmed moot — 14B's Admin.jsx rewrite has no such array).

**Verification Plan Checklist:**
- [x] Production replay migration applied cleanly, RLS confirmed (1 policy exactly) on all 5 tables.
- [ ] Tag Along add/edit/delete round-trip live, dev then production. **Deferred to post-deploy testing pass.**
- [ ] Other Charges add/edit/delete round-trip live. **Deferred.**
- [ ] WIP Settings (legal text / default message / RO & Invoice numbering) save/reload round-trip live. **Deferred.**
- [ ] Work Order Status manager round-trip live, dev then production. **Deferred.**
- [x] `npm run build`/`npx eslint` clean on all 4 manager files.

---

### 14A — Deprecate Setup Backup/Restore; Migrate Sales Classes

**Target files:** `src/pages/Setup.jsx`, `src/components/setup/RestoreBackupModal.jsx` (**delete**), `src/components/setup/SalesClassManager.jsx` (migrate).

**Detailed Execution Plan:**

| File / Area | Current | Change |
|---|---|---|
| `Setup.jsx:11` | `import { base44 } from "@/api/base44Client";` | Remove — nothing else in this file uses `base44` once the backup handler is gone. |
| `Setup.jsx:26,33-58` (`backupLoading` state, `handleBackup`) | Full backup handler calling `base44.functions.invoke('backupToGoogleDrive')` | **Delete entirely.** |
| `Setup.jsx:27,80-91` (`showRestoreModal` state, "Restore Backup" button, `admin === true` conditional wrapper) | Renders the button that opens `RestoreBackupModal` | **Delete entirely** (the surrounding `{currentUser?.admin === true && (...)}` block becomes empty and can be removed too, unless something else needs to render inside that admin-only conditional — confirm before removing the wrapper itself). |
| `Setup.jsx:20,139-142` (`RestoreBackupModal` import + render) | `<RestoreBackupModal open={...} onClose={...} />` | **Delete.** |
| `Setup.jsx:92-99` ("Backup AutoPRO" button) | | **Delete.** Keep the unrelated "Download Template" button (line 72-79, external Google Drive link, no base44 dependency). |
| `RestoreBackupModal.jsx` | Whole file | **Delete the file.** Confirmed only importer is `Setup.jsx` (grepped). |
| `SalesClassManager.jsx:7` | `import { base44 } from "@/api/base44Client";` | Remove once lines 24/42/44/59 convert. |
| `SalesClassManager.jsx:24` (`loadSalesClasses`) | `base44.functions.invoke('SupabaseProxy', {})` | `supabase.from('SalesClass').select('*')` |
| `SalesClassManager.jsx:42/44` (`handleSubmit`) | `SupabaseProxy` update/create | `supabase.from('SalesClass').update(salesClassData).eq('id', editingSalesClass.id)` / `.insert({ id: crypto.randomUUID().replace(/-/g,'').substring(0,24), ...salesClassData })` — confirm `SalesClass.id`'s real format on a live row first. |
| `SalesClassManager.jsx:59` (`handleDelete`) | `SupabaseProxy` delete | `supabase.from('SalesClass').delete().eq('id', id)` |

No new Edge Function needed — `backupToGoogleDrive`/`restoreBackup` are abandoned, not ported. (They remain live on the Base44 platform, unreachable from the app once these call sites are gone — no cleanup action needed there; Base44 platform itself is out of scope until Phase 15.)

**Task List:**
- [x] Confirm `SalesClass.id` format on a real dev row before writing the create call. Confirmed 24-char hex, matches convention.
- [x] Delete `RestoreBackupModal.jsx`. Confirmed no other importers before deleting.
- [x] Edit `Setup.jsx`: remove backup handler/state/button, remove restore modal state/import/render/button. Also cleaned up now-unused imports (`Employee`, `Card`/`CardContent`/`CardHeader`/`CardTitle`, `Input`, `Label`, several unused lucide icons, `TechForm`) flagged by eslint as a direct result of this edit.
- [x] Convert `SalesClassManager.jsx`'s 4 call sites. All 4 (`load`/`create`/`update`/`delete`) now direct `supabase.from('SalesClass')` calls.
- [ ] Live-verify: `/Setup` loads with no backup/restore UI present, no console errors; Sales Class add/edit/delete round-trip works. **Deferred to post-deploy testing pass.**

**Verification Plan Checklist:**
- [x] `npm run build`/`npx eslint` clean.
- [ ] `/Setup` page loads, no "Backup AutoPRO"/"Restore Backup" buttons visible, no console errors. **Deferred.**
- [ ] Sales Class create/edit/delete round-trip confirmed live. **Deferred.**
- [x] Repo-wide grep for `base44` inside `Setup.jsx`/`SalesClassManager.jsx` returns zero hits; `RestoreBackupModal.jsx` no longer exists.

---

### 14B — Deprecate Admin.jsx's Database Query Tool

**Target file:** `src/pages/Admin.jsx`; **delete** `src/components/admin/RecordDetailsModal.jsx` (confirmed only importer is `Admin.jsx`).

**Detailed Execution Plan:**

Delete entirely: the `SUPABASE_TABLES`/`LOCAL_ENTITIES` arrays (lines 24-37); all query-tool state (`selectedEntity`, `targetType`, `selectedLocalEntity`, `selectedSupabaseTable`, `entityFields`, `fieldMeta`, `loadingFields`, `startDate`, `endDate`, `extractAllDates`, `searchField`, `searchTerm`, `results`, `processing`, `selectedRecord`, `visibleColumns`); all handlers (`handleSelectLocal`, `handleSelectSupabase`, `toggleColumn`, the `fetchSchema` effect, `handleExtract`, `handleSearch`, `handleUpdateRecord`, `downloadData`); the entire "Database Query Tool" `Card` and the "Query Results" `Card` in the JSX; the `RecordDetailsModal` import and its render at the bottom; the `base44` import.

**Keep:** the `isAdmin`/`loading` access-gate `useEffect` and early-return "Access Denied" block; the page header (`Shield` icon, "Admin Database Tools" title — consider renaming/re-copying since the tool itself is gone, your call); the "Lankar Import" button (`onClick={() => window.location.href = createPageUrl('LankarImport')}`).

Resulting file should be well under 100 lines — essentially an access-gated shell with one working nav button.

**Task List:**
- [x] Confirm `RecordDetailsModal.jsx` has no other importers (already grepped — clean). Re-confirmed 2026-08-05.
- [x] Rewrite `Admin.jsx` down to the shell described above. Renamed header from "Admin Database Tools" to "Admin" since the tool itself is gone (per plan's "your call" note).
- [x] Delete `RecordDetailsModal.jsx`.
- [ ] Live-verify: `/Admin` loads for an admin user, shows only the header + Lankar Import button, no console errors; a non-admin user still sees "Access Denied." **Deferred to post-deploy testing pass.**

**Verification Plan Checklist:**
- [x] `npm run build`/`npx eslint` clean.
- [ ] `/Admin` loads correctly for both admin and non-admin sessions. **Deferred.**
- [ ] "Lankar Import" button still navigates correctly. **Deferred.**
- [x] Repo-wide grep for `base44` inside `Admin.jsx` returns zero hits; `RecordDetailsModal.jsx` no longer exists.

---

### 14D — Deprecate LANKAR Bulk Import + Legacy AR/Return Modals; Migrate `LankarWOView.jsx`

**Target files:** `src/pages/LankarImport.jsx` (simplify); **delete** `src/components/lankar/AddLegacyInvoiceModal.jsx` and `src/components/inventory/LankarImportReturnModal.jsx`; migrate `src/pages/LankarWOView.jsx`.

**Detailed Execution Plan — `LankarImport.jsx`:**

Delete entirely: `selectedType`/`parsedData`/`uploadedFileUrl`/`importing`/`importResult` state and the `handleFileChange`/`handleImport` handlers (the whole `processDataImport` round-trip, both the `balance_sheet` dry-run branch and the real-import branch); the "Database Type" `RadioGroup` card (all 6 import-type options); the "Upload File" card; the "Import Data (Batch Process)" button; the "Add Legacy Invoice to AR" button + `showLegacyInvoiceModal` state + `<AddLegacyInvoiceModal>` render + its import; the "Add Legacy Return" button + `showReturnModal` state + `<LankarImportReturnModal>` render + its import; the `tagAlongs`/`loadTagAlongs`/`TagAlong` entity import (confirmed not referenced anywhere in the JSX in the version read — double-check with a fresh read before deleting, in case a later edit added a usage). Remove the `base44` import once all of the above is gone.

**Keep:** the "Import Work Order" button, `showWorkOrderImportModal` state, and the `<LegacyWorkOrderImportModal>` render/import (this is 14F's target — do not touch its own internals here, just don't delete the button that opens it). The page's header/back-to-Setup button.

Resulting `LankarImport.jsx` becomes a much smaller page — essentially a header plus one working button.

**Delete:** `AddLegacyInvoiceModal.jsx` (confirmed only importer is `LankarImport.jsx`) and `LankarImportReturnModal.jsx` (confirmed only importer is `LankarImport.jsx`) — full files, no partial migration needed even though `LankarImportReturnModal.jsx` was already ~95% native (only its `InventoryItem`/`InventoryReturn` entity imports weren't yet converted) — deprecation means deletion, not finishing that last conversion.

**`LankarWOView.jsx`** (not yet read in full) — depends on `getLankarWorkOrderData` via `@/functions/`. Read the file in full before executing; this is a display page (likely shows imported/legacy work-order data), unrelated to the deprecated bulk-import feature — migrate it, don't delete it, unless on reading it turns out to be tightly coupled to the deprecated import flow (verify before assuming).

**Task List:**
- [x] Re-read `LankarImport.jsx` fresh (not the version captured earlier in this doc) to confirm `tagAlongs` truly has no JSX usage before deleting that state. Confirmed no JSX usage.
- [x] Read `LankarWOView.jsx` in full.
- [x] Rewrite `LankarImport.jsx` down to header + "Import Work Order" button only.
- [x] Delete `AddLegacyInvoiceModal.jsx` and `LankarImportReturnModal.jsx`.
- [x] Convert `LankarWOView.jsx`'s `getLankarWorkOrderData` call to a direct native equivalent — read the legacy `base44/functions/getLankarWorkOrderData/entry.ts` source, confirmed it's pure read-only assembly (queries `LankarWOInfo`/`LankarWOLines`/`LankarWOInventory`/`Customer`/`Vehicle`, all already RLS-enabled with 1 policy on both branches), reimplemented client-side as a local async helper using `supabase.from()` — no new Edge Function needed.
- [ ] Live-verify: `/LankarImport` loads with only the Import Work Order button visible, no console errors; `LankarWOView.jsx` still renders correctly for a real legacy work order. **Deferred to post-deploy testing pass.**

**Verification Plan Checklist:**
- [x] `npm run build`/`npx eslint` clean.
- [ ] `/LankarImport` loads correctly, only "Import Work Order" present. **Deferred.**
- [ ] `LankarWOView.jsx` regression-checked against a real record. **Deferred.**
- [x] Repo-wide grep for `base44` inside `LankarImport.jsx`/`LankarWOView.jsx` returns zero hits; `AddLegacyInvoiceModal.jsx`/`LankarImportReturnModal.jsx` no longer exist; no dangling references to either anywhere else in `src/`.

---

### 14E — AR Cluster Remainder

**Target files:** `src/components/ar/StatementEmailModal.jsx`, `src/components/ar/BatchSendWorkOrdersModal.jsx`; new `supabase/functions/autopro-sendStatementEmail/`, `supabase/functions/autopro-createBatchPortalSnapshot/`, `supabase/functions/autopro-sendBatchWorkOrderEmails/`.

**Detailed Execution Plan:**

| File / Line(s) | Current | Change |
|---|---|---|
| `StatementEmailModal.jsx:8` | `import { base44 } from "@/api/base44Client";` | Remove once line 29 converts. |
| `StatementEmailModal.jsx:29` (`handleSend`) | `base44.functions.invoke('sendStatementEmail', { to, subject, body, customer_id, portal_url, aged_balances })` | `supabase.functions.invoke('autopro-sendStatementEmail', { body: { to, subject, body, customer_id, portal_url, aged_balances } })` — same `.success`/`.error` shape, normalized to always-200. Read the legacy `base44/functions/sendStatementEmail/entry.ts` source before porting (not yet read — likely a straightforward SMTP/email-provider send, no entity writes). |
| `BatchSendWorkOrdersModal.jsx:9` | `import { createBatchPortalSnapshot } from '@/functions/createBatchPortalSnapshot';` | `supabase.functions.invoke('autopro-createBatchPortalSnapshot', { body: { work_order_id } })` — writes a `CustomerPortalWorkOrder` row (needs 14C's replay if this is exercised against production before 14C lands; dev is unaffected either order). |
| `BatchSendWorkOrdersModal.jsx:10` | `import { sendBatchWorkOrderEmails } from '@/functions/sendBatchWorkOrderEmails';` | `supabase.functions.invoke('autopro-sendBatchWorkOrderEmails', { body: { to, customer, workOrders } })` — sends one email per selected work order, returns a per-WO `results` array (`{ work_order_id, label, message, success }`) already consumed as-is by the frontend. |

Read both legacy function sources (`base44/functions/createBatchPortalSnapshot/entry.ts`, `base44/functions/sendBatchWorkOrderEmails/entry.ts`) in full before porting — not yet reviewed line-by-line, only the frontend call sites have been read.

**Task List:**
- [x] Read all 3 legacy function sources in full.
- [x] Port + deploy `autopro-sendStatementEmail` to dev. Modeled after the already-shipped `autopro-sendARReceiptEmail`/`autopro-sendEmailViaSMTP` pattern (JWT auth via `supabase.auth.getUser`, Resend send, `SentEmailLog` logging, always-200 `{success}`/`{error}`).
- [x] **Scope change from original plan:** did not port a new `createBatchPortalSnapshot` function — discovered `autopro-createPortalSnapshot` already exists (deployed to dev, used by `SESEmailModal.jsx`/`InvoiceConversion.jsx`) and is functionally identical (same cp_id generation, same `CustomerPortalWorkOrder` insert shape, same `portal_url` format). Reused it instead of duplicating. It was **missing from production** (pre-existing Appendix-type gap, unrelated to this phase) — deployed it to production as part of this task since `BatchSendWorkOrdersModal.jsx` now depends on it there.
- [x] Port + deploy `autopro-sendBatchWorkOrderEmails` to dev (self-contained: builds per-work-order HTML, logs to `SentEmailLog`, sends via Resend, collects a per-WO results array — same shape the frontend already consumes).
- [x] Convert both frontend files to `supabase.functions.invoke(...)`.
- [ ] Live-verify: send one throwaway statement email; batch-send to one or two throwaway work orders, confirm portal links generate and emails send. **Deferred to post-deploy testing pass.**
- [x] Deploy all functions to production (`autopro-sendStatementEmail`, `autopro-sendBatchWorkOrderEmails`, and `autopro-createPortalSnapshot`) — done same session, no need to wait on 14C since 14C's replay already landed first.

**Verification Plan Checklist:**
- [ ] All functions curl-verified on dev. **Not curl-verified — deployed and confirmed ACTIVE via Supabase API only; functional verification deferred to post-deploy testing pass.**
- [ ] Statement email round-trip confirmed live. **Deferred.**
- [ ] Batch work-order send round-trip confirmed live (portal snapshot creation + email send + results display). **Deferred.**
- [x] `npm run build`/`npx eslint` clean.
- [x] Repo-wide grep for `base44`/`@/functions/` inside both files returns zero hits.

---

### 14F — `LegacyWorkOrderImportModal.jsx` + `autopro-processLegacyWorkOrder`

Unchanged from the original plan (confirmed "OK" by you) — full detail below, condensed from the original research.

**Target files:** `src/components/lankar/LegacyWorkOrderImportModal.jsx` (850 lines, read in full during initial research); new `supabase/functions/autopro-processLegacyWorkOrder/`.

**Detailed Execution Plan:**

| Line(s) | Current | Change |
|---|---|---|
| 7-8 | `import { base44 } from "@/api/base44Client"; import { Customer, Vehicle, InventoryItem } from "@/entities/all";` | Remove `base44` once all call sites convert. `Customer`/`Vehicle`/`InventoryItem` → direct `supabase.from()` (all three already fully native — mechanical swap). |
| 95 (`processFile`) | `base44.integrations.Core.UploadFile({ file: uploadFile })` | Native Storage upload (`PartsInvoiceOCRModal.jsx` pattern). |
| 163-166 (`processFile`) | `base44.integrations.Core.ExtractDataFromUploadedFile({ file_url, json_schema: jsonSchema })` | Direct Gemini call inside the new native function, using the exact same JSON schema already defined client-side (lines 100-161) — model after `autopro-suggestInventoryCategory`'s pattern. Recommend folding this into `autopro-processLegacyWorkOrder`'s own entrypoint as a first phase rather than a separate function — the frontend already treats it as one logical "process this file" action. |
| 178-181 | `Customer.list()`, `Vehicle.list()` | `supabase.from('Customer').select('*')`, `supabase.from('Vehicle').select('*')` |
| 211, 217 | `InventoryItem.filter({ part_number: ... })` | `supabase.from('InventoryItem').select('*').eq('part_number', ...)` |
| 293 (`handleCreateWorkOrder`) | `base44.functions.invoke('processLegacyWorkOrder', payload)` | `supabase.functions.invoke('autopro-processLegacyWorkOrder', { body: payload })` — same `.success`/`.error` shape, normalized to always-200. |

**New function port — `autopro-processLegacyWorkOrder`** (153-line legacy source): read the full legacy source before porting; creates a real `WorkOrder` row (24-char truncated-hex id, per Phase 13B's confirmed convention) plus classified line items and optionally new `InventoryItem` rows; confirm it doesn't call either protected GL function; drop the `base44.auth.me()` gate, resolve identity from the JWT (Phase 8C pattern).

**Task List:**
- [x] Read `base44/functions/processLegacyWorkOrder/entry.ts` in full.
- [x] Decide whether the Gemini extraction lives in its own function or folds into `autopro-processLegacyWorkOrder` (recommend folding) — **folded**, single function with `?mode=extract` (Storage download + Gemini structured-JSON extraction, modeled after `autopro-processPartsInvoiceOCR`'s pattern) vs. default POST body (work-order creation, modeled after `autopro-createworkorderdata`'s id/JWT conventions).
- [x] Confirm `WorkOrder.id` format on a fresh live-row check — 24-char hex, matches convention (already confirmed by `autopro-createworkorderdata`'s own source).
- [x] Write and deploy the new function to dev and production.
- [ ] Curl-verify against a real throwaway legacy work-order PDF. **Deferred to post-deploy testing pass** — confirmed ACTIVE via Supabase API and confirmed dependencies exist (storage bucket `kadr-digital_invoice_uploads`, `InventoryItem` columns `stocked_item`/`core`/`core_cost`/`unit`/`category` all present, both branches) but not functionally exercised yet.
- [x] Convert all `LegacyWorkOrderImportModal.jsx` call sites — `UploadFile`→native Storage upload, `ExtractDataFromUploadedFile`→direct fetch to `autopro-processLegacyWorkOrder?mode=extract` (same auth-header pattern as `PartsInvoiceOCRModal.jsx`), `Customer.list()`/`Vehicle.list()`/`InventoryItem.filter()`→`supabase.from()`, `base44.functions.invoke('processLegacyWorkOrder', ...)`→`supabase.functions.invoke('autopro-processLegacyWorkOrder', ...)`.
- [ ] Live-verify the full 2-step flow (upload → extract → review/classify → create) against a real throwaway document. **Deferred.**
- [ ] Clean up throwaway `WorkOrder`/`InventoryItem` rows created during verification. **Deferred (nothing created yet — no live test run).**
- [x] Deploy to production — done same session, both dev and production now have the function active.

**Verification Plan Checklist:**
- [ ] Gemini extraction round-trips with the exact JSON schema the frontend already expects. **Deferred to post-deploy testing pass.**
- [ ] Customer/Vehicle auto-match logic still works. **Deferred.**
- [ ] Inventory part-number fuzzy-match (`O`/`0` swap fallback) still works. **Deferred.**
- [ ] New-part creation path round-trips correctly into `InventoryItem`. **Deferred.**
- [ ] Full "Create Work Order" round-trip produces a correct `WorkOrder` row with correctly-classified line items. **Deferred.**
- [ ] Throwaway data cleaned up. **N/A until live-verify runs.**
- [x] `npm run build`/`npx eslint` clean (pre-existing unused-import/unused-var issues in this file, untouched by this port, left as-is).
- [x] Repo-wide grep for `base44` inside this file returns zero hits.

---

### 14G — Final Verification Stage (not the sunset)

**Scope note:** this is now scoped only to Phase 14's own work — a full repo-wide zero-base44-hits grep is Phase 15's gate, not this step's. Once cleared, hand off to the separate final-validation pass and eventual Phase 15 planning.

**Detailed Execution Plan:**
1. Repo-wide grep for `base44`/`@/entities/all`/`@/functions/` restricted to `src/pages/Setup.jsx`, `src/pages/Admin.jsx`, `src/pages/LankarImport.jsx`, `src/pages/LankarWOView.jsx`, everything under `src/components/setup/` and `src/components/lankar/`, plus `StatementEmailModal.jsx`/`BatchSendWorkOrdersModal.jsx` — must return **zero** hits.
2. Confirm `RestoreBackupModal.jsx`, `RecordDetailsModal.jsx`, `AddLegacyInvoiceModal.jsx`, `LankarImportReturnModal.jsx` no longer exist and nothing else in `src/` references them.
3. Full walkthrough per the checklist below.
4. Confirm no regressions in any consumer of the 5 newly-replayed tables outside this phase's own files (spot-check at least one such consumer per table if any exist — e.g. does any work-order form read `WorkOrderStatus` for a status dropdown?).

**Task List:**
- [ ] Run the scoped repo-wide grep, treat any surprise hit as stop-and-investigate.
- [ ] Confirm the 4 deleted files are gone and unreferenced.
- [ ] Full combined walkthrough (see checklist below).
- [ ] Report results back for the master_blueprint rollup.

**Verification Plan Checklist (combined, all sub-phases):**
- [ ] Full Setup page walkthrough: no backup/restore UI present; Sales Classes, Tagalongs, Other Charges, WIP (Statuses/Main/Legal/Default Message) all round-trip correctly.
- [ ] Full Admin page walkthrough: shell loads correctly for admin and non-admin; Lankar Import button works.
- [ ] Full Lankar Import page walkthrough: only "Import Work Order" present; one legacy work order import completed end-to-end; `LankarWOView.jsx` regression-checked.
- [ ] AR cluster: statement email send, batch work-order send both confirmed live.
- [ ] All 5 replayed tables confirmed working on production, RLS correct.
- [ ] Repo-wide grep (scoped per above) returns zero hits.
- [ ] `npm run build`/`npx eslint` clean across everything touched.

---

## Handoff Context to Whatever Comes Next

The separate final-validation pass (§0.9 item 7) and eventual Phase 15 planning should inherit: this phase's own confirmation that its file scope is fully clean; the Appendix below, updated to reflect whatever the separate agent working it in parallel has resolved by the time Phase 14 closes; and the note already added to `master_blueprint.md` Section 1 flagging Phase 15's existence for the eventual rollup.

---

## Appendix: Cross-Phase Base44 Residue — Handoff Package for a Separate Agent

Everything below is **outside Phase 14's own file scope** — real, live, unmigrated base44 dependencies left over from other (mostly already-"Tested") phases, none of them currently owned by anyone. Re-verified directly file-by-file on 2026-08-05 (not just grep — actual content read where the block type wasn't obvious from the import line alone). Intended to be picked up by a separate agent/session working in parallel; converges with Phase 14 only at 14G's grep check.

**Block-type legend:**
- **Function shim** — imports a named function from `@/functions/X` (functionally identical to `base44.functions.invoke('X', ...)`) or calls `base44.functions.invoke(...)` directly. Needs a native `autopro-*` Edge Function port.
- **Entity import** — imports an entity object from `@/entities/all` (e.g. `WorkOrder`, `Customer`) and calls `.list()`/`.create()`/`.update()`/`.filter()` on it. Functionally identical to `base44.entities.X`. If the underlying table is already confirmed native (most are, in this list), this is a **mechanical swap** to `supabase.from()` — no schema/backend work needed.
- **SDK method call** — calls a `base44.*` method that isn't `.functions.invoke` or `.entities.X` (e.g. `base44.appLogs.logUserInApp(...)`). Needs case-by-case judgment on whether a native replacement exists or is needed.
- **Dead import** — `base44` (or similar) is imported but never actually referenced anywhere in the file. Safe one-line deletion, not a real functional blocker.
- **Mixed** — more than one of the above in the same file.

| File | Likely owning phase | Block type | Specific dependency |
|---|---|---|---|
| `src/lib/NavigationTracker.jsx` | Core infra (Phase 4-era) | SDK method call | `base44.appLogs.logUserInApp(pageName)` |
| `src/components/appointments/AppointmentForm.jsx` | Phase 12/13 boundary | Entity import (native, mechanical) | `WorkOrder, SystemSettings` via `@/entities/all` |
| `src/components/cash-drawer/DepositDetailsModal.jsx` | Phase 8 boundary | Entity import (native, mechanical) | `WorkOrder` via `@/entities/all` |
| `src/components/cash-drawer/PaymentSelectionModal.jsx` | Phase 8 boundary | Function shim | `getWorkOrderRoNumber` |
| `src/pages/CreditInvoice.jsx` | Phase 13 (deliberately deferred at closeout, confirmed not this phase's) | Mixed, substantial | `SupabaseProxy` ×5 + `handleCreditInvoiceGL` |
| `src/components/customers/NewCustomerModal.jsx` | Phase 5 leftover | Function shim | `SupabaseProxy` create |
| `src/components/customers/CustomerWorkOrderHistoryModal.jsx` | Phase 5 leftover | Function shim | `getCustomerWorkOrderHistory` |
| `src/components/inventory/EditInventoryTransactionModal.jsx` | Phase 7 leftover | Function shim | `SupabaseProxy` |
| `src/components/customers/CustomerHistoryModal.jsx` | Phase 5 leftover | Function shim | `SupabaseProxy` |
| `src/components/inventory/ChangeSupplierModal.jsx` | Phase 7/9 leftover | Mixed | `InventoryReturn` entity (native) + `SupabaseProxy` |
| `src/components/inventory/InventoryHistoryModal.jsx` | Phase 7 leftover | Function shim | `SupabaseProxy` (reads `Supplier`) |
| `src/components/inventory/InventoryEditModal.jsx` | Phase 7 leftover | Mixed | `InventoryItem, InventoryCategory` entity (native) + `SupabaseProxy` + `inventoryUpdate` function |
| `src/components/inventory/MergeInventoryModal.jsx` | Phase 7 leftover | Function shim | `searchInventory` |
| `src/pages/InventoryValuation.jsx` | Phase 7 leftover | SDK method call (native table, trivial) | `base44.entities.InventoryItem.filter()` |
| `src/components/inventory/InventoryAdjustQOHModal.jsx` | Phase 7 leftover | **Dead import** | `base44` imported, never referenced — one-line delete |
| `src/components/inventory/InventoryTransactionsModal.jsx` | Phase 7 leftover | Function shim | `SupabaseProxy` ×3 |
| `src/pages/InventoryReturns.jsx` | Phase 7 leftover | Mixed | `SupabaseProxy` ×2 + `inventoryUpdate` |
| `src/pages/WorkPROView.jsx` | WorkPRO/Phase 4 leftover | Entity import (all native, mechanical) | `WorkOrder, Customer, Vehicle, Employee, TechTimeLog` via `@/entities/all` |
| `src/components/work-orders/WarrantyReturnModal.jsx` | Phase 13 boundary (confirmed genuinely live, not dead code) | Function shim | `searchSuppliers` |
| `src/pages/StockReorderReport.jsx` | Phase 7 leftover | Function shim | `SupabaseProxy` ×3 |
| `src/components/vehicles/VehicleHistoryModal.jsx` | Phase 5 leftover | Mixed | `SupabaseProxy` + `getVehicleWorkOrderHistory` |
| `src/components/vehicles/VehicleDetails.jsx` | Phase 5 leftover | Function shim | `getVehicleWorkOrderHistory` |

**Confirmed dead code, not real blockers (cosmetic cleanup only, safe to batch with anything else):**
- `src/Layout.jsx` — a hardcoded `https://registry-pos-tracker-b5793593.base44.app/` URL string (external link, not an API call).
- `src/components/work-orders/history/WorkOrderHistoryModal.jsx` — `email.endsWith('@no-reply.base44.com')` string check.
- `src/components/work-orders/form/WorkOrderHeaderInfo.jsx` — same string check + one dead commented-out line (`// const users = await base44.entities.User.filter(...)`).
- `src/components/work-orders/form/WorkOrderViewHeaderInfo.jsx` — same as above.

**Core infra — only removable at Phase 15's literal last step, not before:**
- `src/api/base44Client.js`, `src/api/entities.js`, `src/api/integrations.js` — the SDK wrapper files themselves.

**Not in this list, already independently claimed:** everything in Phase 14's own scope (Section 1/3 above); the `base44/` source tree (leave alone until Phase 15, per standing rule).

---

## 4) Phase Results and Final Context

*(Empty — to be filled in as execution/verification proceeds. Do not remove this section header.)*
