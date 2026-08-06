# Phase 14 Implementation Plan: Setup, Admin, Lankar Import & Final Sunset

**Status:** **Planning — Section 0 open questions need your decisions before execution starts.**
**Parent:** `master_blueprint.md`, Phase 14 (Tier F — final phase)
**Prepared:** 2026-08-03 (research-only, no code changes made)
**Supabase project refs:** dev branch `sitihbdnuxifwibontcm` (schema/RLS changes tested here first, always); production `hbcrwkmgsazqrvsrmxyr` (applied second, after dev verification)

> **LIVE DOCUMENT.** This plan is updated in place as execution/verification surfaces new findings — do not wipe prior sections, append/annotate instead. Key learnings roll back into `master_blueprint.md` Section 7 at phase close.

---

## 0) Open Questions, Info Requirements & Suggestions

This phase turned out considerably larger and more entangled than the blueprint's original "2–3 sessions" estimate suggested. Direct research (not just the file list in the blueprint) surfaced real blockers and one active conflict. I need decisions on the items below before touching any code.

### 0.1 — RESOLVED: Phase 10E conflict cleared

Re-checked 2026-08-03 (later same day) per your direction ("we're all done up to phase 14"). `phase_10_implementation_plan.md` is now committed clean (`git status` shows no pending changes to it), and `master_blueprint.md`'s own detailed Phase 10 row confirms all 5 of Phase 10's own sub-phases (10A-10E) landed `[Tested]`. No more active-conflict risk on `Admin.jsx` from this direction. 14B can proceed on its own merits.

### 0.1b — NEW finding: Phase 13's "Tested" status doesn't mean its blast radius is fully swept

You confirmed Phase 13 is done/`[Tested]`, and `master_blueprint.md`'s Phase 13 row does carry a `~~[Tested]~~` tag now. I re-verified directly rather than taking my own prior turn's secondhand research at face value (that research claimed several files were "confirmed false positives/dead imports" — this turned out to be wrong). Direct grep + read confirms these are **real, live, unmigrated imports**, not dead code:

| File | Live import |
|---|---|
| `src/pages/Schedule.jsx` | `import { getworkorderlist } from '@/functions/getworkorderlist';` |
| `src/components/appointments/AppointmentForm.jsx` | `WorkOrder, SystemSettings` via `@/entities/all`; `createworkorderdata`, `getworkorderlist` via `@/functions/*` |
| `src/pages/InventoryAdd.jsx` | `TagAlong` via `@/entities/all`; `searchInventory` via `@/functions/searchInventory` |
| `src/components/work-orders/WarrantyReturnModal.jsx` | `searchSuppliers` via `@/functions/searchSuppliers` |

`getworkorderlist`/`createworkorderdata` are literally the two functions Phase 13B built native `autopro-*` replacements for (per the blueprint's own Phase 13 row text) — but these 4 files, sitting outside Phase 13's own claimed file scope (Schedule/Appointment/Inventory-domain, not Work-Orders-Core-domain), were never repointed to the new native calls. This isn't a knock against Phase 13 completing its own stated scope — it's evidence that no phase has ever done a full consumer-sweep for these shared legacy functions. See §0.7 for the fuller picture this surfaced.

### 0.1c — Phase 10A is being folded into a separate "final validation plan," not tracked as a Phase 14 blocker

Per your direction, the cross-cutting integration-testing pass (`master_blueprint.md`'s separate "Phase 10A: Full Inventory Flow + Appointment — Combined Testing & Cleanup," still `[Pending]`) is being rolled into a final validation plan outside this document's scope. I'm removing it from 14G's blocker list on that basis — but see §0.7 for why 14G still isn't close even without it.

### 0.2 — Direct entity-status verification (done, not a question — for the record)

Per this project's standing rule ("always confirm entity status directly against the database, never trust a classification table"), I queried both branches directly rather than relying on the blueprint's Section 1 classification, which turned out partially stale:

| Entity | Dev (`sitihbdnuxifwibontcm`) | Production (`hbcrwkmgsazqrvsrmxyr`) | RLS (where it exists) |
|---|---|---|---|
| `GSTReturn` | ✅ exists | ✅ exists | 1 policy, both |
| `Levies` | ✅ exists | ✅ exists | 1 policy, both |
| `OtherChargeList` | ✅ exists | ✅ exists | 1 policy, both |
| `SystemSettings` | ✅ exists | ✅ exists | 1 policy, both |
| `SalesClass` | ✅ exists | ✅ exists | already in `Admin.jsx`'s `SUPABASE_TABLES`, confirmed native |
| `TagAlong` | ✅ exists | ❌ **missing** | 1 policy on dev |
| `WorkOrderStatus` | ✅ exists | ❌ **missing** | 1 policy on dev |
| `CustomerPortalWorkOrder` | ✅ exists | ❌ **missing** | 1 policy on dev |
| `SentEmailLog` | ✅ exists | ❌ **missing** | 1 policy on dev |
| `Statement` | ❌ **missing** | ❌ **missing** | doesn't exist anywhere — genuinely still Base44-only |

This is better news than the blueprint suggested — `GSTReturn`/`Levies`/`OtherChargeList`/`SystemSettings` were apparently already replayed to production by Phase 10's own work, mid-flight. Only 4 tables (`TagAlong`, `WorkOrderStatus`, `CustomerPortalWorkOrder`, `SentEmailLog`) still need a production schema replay, and `Statement` needs real schema design. I also confirmed column-level schema for all 4 dev-only tables matches exactly what their frontend call sites expect (no drift) — detail in §3.3.

### 0.3 — Unowned AR/Statements cluster blocks "Final Sunset" regardless of this phase's own work

`Statement` doesn't exist on either branch, and a cluster of files depending on it (or on `SentEmailLog`) has **never been assigned to any phase**: `src/pages/CustomerARTransactions.jsx`, `src/pages/EmailLog.jsx`, `src/components/ar/StatementModal.jsx`, `src/components/ar/StatementEmailModal.jsx`, `src/components/ar/ARPaymentDetailsModal.jsx`, `src/components/ar/ARPaymentEmailModal.jsx`, `src/components/ar/TakePaymentModal.jsx`, `src/components/ar/InterestCalculationModal.jsx`, `src/components/work-orders/BatchSendWorkOrdersModal.jsx` (partial — email-log-adjacent), `src/components/reports/ReportableLeviesReport.jsx` (Levies-adjacent, actually now unblocked per §0.2, may just need transport cutover).

This is real: no phase's plan doc — including this one's literal title — claims Customer AR statements/interest/payment-take flows. It's genuinely out of scope for "Setup, Admin, Lankar Import," but it **is** in the direct path of the repo-wide-clean-grep gate that "Final Sunset" (14G) requires.

**Question — pick one:**
1. Fold this cluster into Phase 14 as new sub-phases (grows this phase substantially — real schema design for `Statement`, plus `SentEmailLog`'s transport cutover across ~9 files).
2. Spin it out as a new **Phase 15** and let Phase 14 close having done 14A–14F, with "Final Sunset" (14G) explicitly deferred to whenever Phase 15 (and everything else) lands.
3. Something else you have in mind.

### 0.4 — `LegacyWorkOrderImportModal.jsx`'s backing function overlaps Phase 13's domain

`processLegacyWorkOrder` (153 lines, `base44/functions/processLegacyWorkOrder/entry.ts`) creates real `WorkOrder` rows with GL-classified line items — squarely "Work Orders Core" business logic, even though the only calling file lives in `src/components/lankar/`. Phase 13's own plan never claimed this file (confirmed by grep against `phase_13_implementation_plan.md`).

**Question:** Should Phase 14 port this function directly as part of 14F (it's the only caller, and nobody else has claimed it), or should it be flagged to whoever closes out Phase 13 instead? My default recommendation is **Phase 14 ports it** — it's a self-contained function with one caller, and waiting on Phase 13's separate closeout would just stall this phase for no real benefit. Flagging so you can veto.

### 0.5 — `processDataImport`'s `balance_sheet` import type posts bulk GL entries directly

459-line legacy function (`base44/functions/processDataImport/entry.ts`) handles 6 import types (customers, vehicles, suppliers, inventory, inventory_locations, balance_sheet). The `balance_sheet` path posts opening/closing balances as raw `GLTransaction` inserts. Confirmed via grep: it does **not** call either protected function (`autopro-handleInvoiceConversionGL`/`autopro-handleSupplierInvoiceLineGL`) — it's a standalone one-time bulk-import tool, not day-to-day GL logic. My read is this is fine to port as-is under the standing "never modify the two protected GL functions" rule, since it isn't one of them and doesn't touch them. Flagging only so you can veto before I write the port.

### 0.6 — Superseded by §0.1b above

(Original note here about Phase 13's status being stale in the blueprint has been superseded — you've since confirmed Phase 13 is done, and the blueprint row now carries `[Tested]`. The real remaining issue isn't Phase 13's own status, it's the cross-file blast radius per §0.1b/§0.7.)

### 0.7 — NEW: 14G's real blocker list, re-measured directly

With Phase 10 confirmed Tested and Phase 13 confirmed done, I re-ran the repo-wide grep to see how close "Final Sunset" actually is. **Still 54 files** reference `base44`/`@/entities/all`/`@/functions/*` (excluding the 3 core API files that are only removable at 14G's own last step). Breakdown:

| Category | Approx. count | Owner |
|---|---|---|
| Phase 14's own domain (Setup/Admin/Lankar, incl. 2 files not in my original file list: `LankarImportReturnModal.jsx`, `LankarWOView.jsx`) | ~13 | This phase (14A-14F) |
| Unowned AR/Statements cluster | ~9 | Nobody — §0.3's decision |
| Phase 5 (Customer/Vehicle) leftovers | ~5 | Nobody currently |
| Phase 7 (Inventory) leftovers | ~11 | Nobody currently |
| Phase 8 (Banking) leftovers, mostly dead/commented code (not independently re-verified this pass — treat as unconfirmed) | ~5 | Nobody currently |
| Phase 12/13 boundary residue (`Schedule.jsx`, `AppointmentForm.jsx`, `WorkPROView.jsx`, `LankarWOView.jsx`, plus the 4 confirmed-live files in §0.1b) | ~6 | Nobody currently |
| `CreditInvoice.jsx` — deliberately still full-base44 per Phase 13's own closeout note | 1 | Flagged, not claimed |
| Core infra (only removable at 14G's literal last step) | 6 (excluded from the 54 above) | 14G itself |

**This means even a fully-executed 14A-14F does not get 14G to a clean grep.** The other ~35 files are cross-phase residue nobody has ever explicitly owned cleaning up — this is a materially bigger finding than my first draft of this plan assumed (I'd only flagged the AR cluster in §0.3; the Phase 5/7/8/12-boundary residue is new).

**Question:** given you mentioned a separate "final validation plan" already absorbing Phase 10A — is that final validation plan *also* meant to be the moment this repo-wide residue gets swept and Final Sunset actually happens (i.e., 14G moves out of this document entirely and becomes that plan's closing step)? Or do you want Phase 14 itself to absorb the sweep (spinning up 14H/14I/etc. sub-phases per leftover category), or a third option? I don't want to scope 14G further until this is decided — right now it's the single biggest open unknown in this whole plan.

### 0.8 — Reassessment (same day, later): real progress landed, plus one live production risk

You flagged "we've made some functional changes" — verified directly rather than assumed. Confirmed via fresh `git log`, `git diff`, and a fresh repo-wide grep:

**Real progress since §0.7's count of 54:**
- Commits `b7e83b0b`/`349967bc`/`36952d8b`/`b91a21e3`/`2c9841bb` landed real base44→native migrations: AR payment-receipt details, `EmailLog.jsx`, `getworkorderlist`/`createworkorderdata` (Appointment module), and — bundled into the generic "Bug Fixes" commit, not called out by name — `TagAlongManager.jsx`.
- Fresh grep count: **41 files** (down from 54), after excluding `src/Layout.jsx` (a base44 URL string, not a live call) and 3 `work-orders/form|history` files (a hardcoded `@no-reply.base44.com` string check plus one dead commented-out line — confirmed genuinely inert, unlike my earlier wrong "false positive" claim about `getworkorderlist`/`searchInventory`/`searchSuppliers` consumers).
- §0.3's AR/Statements cluster shrank a lot: `ARPaymentDetailsModal.jsx`, `ARPaymentEmailModal.jsx`, `InterestCalculationModal.jsx`, `StatementModal.jsx`, `TakePaymentModal.jsx`, `CustomerARTransactions.jsx`, `EmailLog.jsx`, `Reconcile.jsx`, `ReconcileReport.jsx`, `AutoReconcileModal.jsx`, `LinkSupplierModal.jsx`, `InventoryAdd.jsx`, `Schedule.jsx` are all now clean. Only `StatementEmailModal.jsx` (`sendStatementEmail`) and `BatchSendWorkOrdersModal.jsx` (`createBatchPortalSnapshot`/`sendBatchWorkOrderEmails`) remain from that cluster. `Statement` the table still doesn't exist on either branch (re-confirmed just now) — worth independently checking that whatever replaced `StatementModal.jsx`'s old logic doesn't quietly still expect a `Statement` row somewhere; not verified deeper than the grep here.
- 14C shrank by one: `TagAlongManager.jsx` is fully converted to direct `supabase.from('TagAlong')`/`supabase.from('OtherChargeList')` calls already. `OtherChargesManager.jsx`, `WIPSettings.jsx`, `WorkOrderStatusManager.jsx` are still on `@/entities/all` (unconverted, per the plan).

**⚠️ Live production risk, independent of Phase 14 sequencing:** `TagAlongManager.jsx` now queries `TagAlong` directly via `supabase.from()` — but `TagAlong` **still does not exist on the production Supabase project** (re-confirmed via direct query just now, alongside `WorkOrderStatus`/`CustomerPortalWorkOrder`/`SentEmailLog`/`Statement` — none of the 5 exist on production). If this commit reaches the production frontend before the schema replay happens, the Setup → Tagalongs tab will silently break for real users (caught error → empty list, not a crash, but wrong behavior). **Recommend doing the `TagAlong` (and ideally all 4 remaining dev-only tables — `WorkOrderStatus`/`CustomerPortalWorkOrder`/`SentEmailLog`) schema+RLS replay to production now, decoupled from the rest of 14C's sequencing** — it's the same low-risk, well-precedented task 14C already scoped, just worth pulling forward given code that depends on it may already be closer to production than planned.

**Updated 14-domain file count:** 12 files now (`Setup.jsx`, `Admin.jsx`, `LankarImport.jsx`, `RestoreBackupModal.jsx`, `SalesClassManager.jsx`, `OtherChargesManager.jsx`, `WIPSettings.jsx`, `WorkOrderStatusManager.jsx`, `LankarImportReturnModal.jsx`, `AddLegacyInvoiceModal.jsx`, `LegacyWorkOrderImportModal.jsx`, `LankarWOView.jsx` — the last one newly confirmed in scope, not in my original file list, depends on `getLankarWorkOrderData`).

**§0.3/§0.4/§0.5 still open** — none of today's changes touched the remaining `StatementEmailModal.jsx`/`BatchSendWorkOrdersModal.jsx` pair, the `processLegacyWorkOrder` ownership question, or the `processDataImport` GL-posting sign-off. Still need your call on all three, plus §0.7's bigger question about where the final repo-wide sweep lives.

---

## 1) Phase Scope & Objectives

**Objective:** Migrate the remaining Setup/Admin/Lankar-Import surface off Base44, then (once every other phase's own base44 usage is confirmed clear) delete the Base44 SDK, the `base44-proxy` bridge function, and the legacy `base44/` function tree.

**In scope (pending §0 decisions):**
1. **14A — Setup Core:** `Setup.jsx`'s `backupToGoogleDrive` call, `RestoreBackupModal.jsx`'s `restoreBackup` call, `SalesClassManager.jsx`'s `SupabaseProxy`-routed CRUD (target table `SalesClass`, already fully native).
2. **14B — Admin.jsx Entity Browser Rewire:** convert the generic entity-browser tool's `SupabaseProxy`-routed "Supabase Table" path to direct `supabase.from()`; move every entity confirmed fully native on both branches from `LOCAL_ENTITIES` to `SUPABASE_TABLES`.
3. **14C — Dev-only Table Production Replay + Setup Managers:** replay `TagAlong`/`WorkOrderStatus`/`CustomerPortalWorkOrder`/`SentEmailLog` schemas + RLS to production (empty schema only, matching the established Phase 10A precedent), then migrate `TagAlongManager.jsx`, `OtherChargesManager.jsx`, `WorkOrderStatusManager.jsx` (child of `WIPSettings.jsx`), and `WIPSettings.jsx` itself to direct `supabase.from()`.
4. **14D — LankarImport.jsx:** convert its own `TagAlong.list()` call to direct `supabase.from()`; replace `base44.integrations.Core.UploadFile` with the established native Storage-upload pattern (`supabase.storage.from('kadr-digital_invoice_uploads').upload(...)`, per `PartsInvoiceOCRModal.jsx`'s precedent); port `processDataImport` (all 6 import types) to a new `autopro-processDataImport` Edge Function.
5. **14E — AddLegacyInvoiceModal.jsx:** already 95% native (direct `supabase.from('CustomerPayments')`, direct `supabase.rpc('search_customers_ranked')`) — only remaining base44 use is `UploadFile`, same native-Storage swap as 14D.
6. **14F — LegacyWorkOrderImportModal.jsx:** replace `UploadFile`/`ExtractDataFromUploadedFile` with native Storage upload + a direct Gemini-based extraction call (same established pattern as `autopro-suggestInventoryCategory`/`autopro-processPartsInvoiceOCR`); port `processLegacyWorkOrder` to `autopro-processLegacyWorkOrder`; swap `Customer.list()`/`Vehicle.list()`/`InventoryItem.filter()` (`@/entities/all`) to direct `supabase.from()` calls (all three entities already fully native elsewhere).
7. **14G — Final Sunset:** repo-wide `base44`/`@/entities/all`/`@/functions/*` grep returns zero hits (excluding the `base44/` source tree itself, per standing Phase 4 rule to leave it alone until this exact step); delete `@base44/sdk`/`@base44/vite-plugin` from `package.json`; remove the base44 plugin block from `vite.config.js`; delete the `base44-proxy` Edge Function; delete the `base44/` function/entity tree.

**Explicitly NOT in scope (pending §0.3's decision):**
- The AR/Statements cluster (`CustomerARTransactions.jsx`, `StatementModal.jsx`, etc.) — real schema design for `Statement`, transport cutover for `SentEmailLog`-dependent files. Held pending your §0.3 decision.
- Anything belonging to Phase 10 (10E/GST remainder), 10A (integration testing), 12 (Appointment real click-through) — 14G's gate depends on these but this phase doesn't own fixing them.
- `CreditInvoice.jsx` — confirmed by Phase 13's own closeout to be deliberately still full-base44, flagged there as needing its own follow-up, not this phase's to absorb.

**Target outcome:** Zero `base44`/`@/entities/all`/`@/functions/*` references in `src/pages/Setup.jsx`, `src/pages/Admin.jsx`, `src/pages/LankarImport.jsx`, and every file under `src/components/setup/` and `src/components/lankar/`. `SalesClass`/`OtherChargeList`/`SystemSettings`/`TagAlong`/`WorkOrderStatus`/`CustomerPortalWorkOrder`/`SentEmailLog` all fully native, both branches. Two new native functions (`autopro-processDataImport`, `autopro-processLegacyWorkOrder`) deployed and curl-verified. If and only if 14G's full gate is met (all other phases closed, §0.3 resolved): Base44 SDK and legacy function tree fully removed from the codebase.

---

## 2) Lessons Learned & Context

Pulled from `master_blueprint.md` §7, filtered to what's load-bearing for this phase:

- **Always confirm entity status directly against the database, never trust a classification table at face value** — reinforced 5+ times across prior phases, and directly relevant here: this plan's own §0.2 research already caught the blueprint's stale "dev-only" claim for `GSTReturn`/`Levies`/`OtherChargeList`/`SystemSettings` (all four are actually native on production too now).
- **`RLS enabled + zero policies = silently blocked access, no clear error`** — the Phase 1 landmine, recurred at Phase 13B/13C when `SystemSettings`/`WorkOrderStatus`/`TagAlong`/`OtherChargeList` were first created on dev. Confirmed via direct query (§0.2) that all 4 still-dev-only tables already have exactly 1 policy each on dev — don't skip the same check when replaying them to production in 14C.
- **Client-generated 24-char-hex ids (`crypto.randomUUID().replace(/-/g,'').substring(0,24)`) are the project-wide convention for every native `.insert()`**, confirmed as recently as Phase 11 — where the plan's own stated assumption that no id-generation was needed turned out wrong, caught only by checking `pg_attrdef` directly before writing the first insert. Apply this check before writing any new insert in 14A/14C/14D/14E/14F (e.g. any drive-by fix in `SalesClassManager.jsx`, `TagAlongManager.jsx`, etc. that adds a create call not already using `@/entities/all`'s own id-handling).
- **`@/entities/X` and `base44.entities.X` are functionally identical to the `SupabaseProxy` shim** — both route through Base44. `TagAlongManager.jsx`/`OtherChargesManager.jsx`/`WIPSettings.jsx`/`LankarImport.jsx` all currently call `TagAlong.list()`/`OtherChargeList.create()`/etc. via `@/entities/all` — these need the same direct-`supabase.from()` treatment as any `SupabaseProxy` call, not just the ones using the literal `base44.functions.invoke` string.
- **All native `autopro-*` Edge Functions return HTTP 200 with `{ error }` on failure** — apply to the two new functions this phase creates (`autopro-processDataImport`, `autopro-processLegacyWorkOrder`); the legacy versions violate this (raw 400/500), must be normalized during the port.
- **Drop the `base44.auth.me()` gate when porting** — resolve identity from the caller's Supabase JWT only when audit fields are actually needed (both new functions write `created_by`/`created_by_id`-style fields, so they do need identity resolution — use the Phase 8C pattern: `supabase.auth.getUser(token)` from the Authorization header, safe specifically because both functions deploy with `verify_jwt: true`).
- **A native Storage-upload + direct-fetch-to-Edge-Function pattern already exists and works** — `PartsInvoiceOCRModal.jsx` uploads to `supabase.storage.from('kadr-digital_invoice_uploads')` then calls its backing function directly via `fetch()` with the anon key + user JWT. Reuse this exact pattern for 14D/14E/14F's `UploadFile` replacements rather than inventing a new one.
- **A native, Gemini-grounded extraction pattern already exists** (`autopro-suggestInventoryCategory`, Phase 7) and `autopro-processPartsInvoiceOCR` (kept alive through Phase 2's PartsTech removal specifically because it's unrelated) — model `LegacyWorkOrderImportModal.jsx`'s AI-extraction port (14F) after these rather than researching a new integration from scratch. Do **not** touch `GEMINI_API_KEY` while doing this (Phase 2's standing caution).
- **The "one failed promise poisons the whole `Promise.all`" pattern has recurred 5+ times** — check `Admin.jsx`, `Setup.jsx`, and `LankarImport.jsx`'s own data-loading code for this shape before assuming a page's migrated calls are broken on a dev-native session.
- **Leave the `base44/` source directory and live Base44 platform deployments alone until this phase** — standing rule since Phase 4, finally actionable in 14G.
- **A phase's own plan can state an assumption that turns out wrong even after explicit attention** — Phase 11's id-generation entry is the most recent example. Verify, don't assume, at every "should be safe" step in this plan too.

---

## 3) Phase 14 Roadmap & Progress

| Sub-phase | Status | Overview |
|---|---|---|
| 14A | Pending | Setup.jsx core: backup/restore/SalesClass — no blockers |
| 14B | Pending | Admin.jsx entity browser rewire |
| 14C | Pending | Dev-only table → production replay + TagAlong/OtherCharges/WIP/WorkOrderStatus managers |
| 14D | Pending | LankarImport.jsx transport + `autopro-processDataImport` port |
| 14E | Pending | AddLegacyInvoiceModal.jsx cleanup (small) |
| 14F | Pending (holds on §0.4) | LegacyWorkOrderImportModal.jsx + `autopro-processLegacyWorkOrder` port |
| 14G | Blocked (holds on §0.3 and §0.7 — scope/ownership decision needed, not just phase-closure timing) | Final Sunset |

---

### 14A — Setup Core (Backup / Restore / Sales Classes)

**Target files:** `src/pages/Setup.jsx`, `src/components/setup/RestoreBackupModal.jsx`, `src/components/setup/SalesClassManager.jsx`; new `supabase/functions/autopro-backupToGoogleDrive/`, `supabase/functions/autopro-restoreBackup/`.

**Detailed Execution Plan:**

| File / Line(s) | Current | Change |
|---|---|---|
| `Setup.jsx:11` | `import { base44 } from '@/api/base44Client';` | Remove once line 36's call converts. |
| `Setup.jsx:36` (`handleBackup`) | `base44.functions.invoke('backupToGoogleDrive')` | `supabase.functions.invoke('autopro-backupToGoogleDrive', { body: {} })` — same `response.data.success`/`.filename`/`.fileUrl`/`.error` shape preserved by the ported function. |
| `RestoreBackupModal.jsx:7` | `import { base44 } from "@/api/base44Client";` | Remove once line 33 converts. |
| `RestoreBackupModal.jsx:33` (`handleRestore`) | `base44.functions.invoke('restoreBackup', { backupData: jsonContent })` | `supabase.functions.invoke('autopro-restoreBackup', { body: { backupData: jsonContent } })` — same `.success`/`.total_processed`/`.total_failed`/`.error` shape. |
| `SalesClassManager.jsx:7` | `import { base44 } from '@/api/base44Client';` | Remove once lines 24/42/44/59 convert. |
| `SalesClassManager.jsx:24` (`loadSalesClasses`) | `base44.functions.invoke('SupabaseProxy', {})` — note: no `action`/`table` specified at all, relying on some default/legacy shim behavior specific to this table | `supabase.from('SalesClass').select('*')` |
| `SalesClassManager.jsx:42/44` (`handleSubmit`) | `SupabaseProxy` update/create, no `table` param specified either | `supabase.from('SalesClass').update(salesClassData).eq('id', editingSalesClass.id)` / `.insert({ id: crypto.randomUUID().replace(/-/g,'').substring(0,24), ...salesClassData })` — confirm `SalesClass.id` format via a live row first (§2's standing id-check rule) before assuming the 24-char-hex convention applies here too. |
| `SalesClassManager.jsx:59` (`handleDelete`) | `SupabaseProxy` delete, no `table` param | `supabase.from('SalesClass').delete().eq('id', id)` |

**New function ports** (both under 120 lines in their legacy form, straightforward 1:1 ports):
- `autopro-backupToGoogleDrive` — 1:1 port of `base44/functions/backupToGoogleDrive/entry.ts` (112 lines). Read the full source before porting; likely iterates every native table and zips/uploads to Drive via a service account — confirm the Google Drive service-account secret name in the legacy function and make sure it's already present in Supabase secrets (it should be, per Phase 1's secrets-sync work) before assuming this is a pure code port with no infra step.
- `autopro-restoreBackup` — 1:1 port of `base44/functions/restoreBackup/entry.ts` (76 lines). Drop the `base44.auth.me()` gate per convention; this one likely just re-inserts rows table-by-table from the uploaded JSON — verify it doesn't call either protected GL function before treating it as a pure mechanical port.

**Task List:**
- [ ] Read both legacy function sources in full before writing the port (only skimmed line counts so far).
- [ ] Confirm `SalesClass.id` format on a real row (dev) before writing the create call.
- [ ] Port + deploy `autopro-backupToGoogleDrive` to dev, curl-verify.
- [ ] Port + deploy `autopro-restoreBackup` to dev, curl-verify with a small throwaway JSON payload.
- [ ] Convert `Setup.jsx`, `RestoreBackupModal.jsx`, `SalesClassManager.jsx`.
- [ ] Live-verify: trigger a real backup from `/Setup`, confirm the Drive file appears; add/edit/delete a throwaway Sales Class.
- [ ] Deploy both functions + frontend to production after dev sign-off.

**Verification Plan Checklist:**
- [ ] `npm run build`/`npx eslint` clean on the 3 touched files.
- [ ] Live backup button produces a real Drive file with correct row counts.
- [ ] Restore-backup round-trip tested with a small throwaway export (export → wipe a throwaway row → restore → confirm it reappears), then cleaned up.
- [ ] Sales Class create/edit/delete round-trip confirmed live on `test.kensauto.ca`.
- [ ] Repo-wide grep for `base44` inside these 3 files returns zero hits.

---

### 14B — Admin.jsx Entity Browser Rewire

**Target file:** `src/pages/Admin.jsx` (550 lines, read in full above).

§0.1's earlier concern (concurrent Phase 10E work) is resolved — clear to proceed. Standard discipline still applies: re-check `git status` on this file immediately before starting, same as any file.

**Detailed Execution Plan:**

Current `SUPABASE_TABLES` (line 24-27): `Appointment, CashFlowEntry, CashFlowSummary, ChartOfAccount, Customer, CustomerARAdjustment, CustomerPayments, FiscalPeriod, InventoryItem, SalesClass, Supplier, SupplierInvoiceLine, SupplierPayment, Vehicle, WorkOrder`.

Current `LOCAL_ENTITIES` (line 29-37): `BankAccount, BankReconciliation, BankTransaction, CashDrawerAdjustment, ChartOfAccount, CustomerPortalWorkOrder, DepositSlipBreakdown, Employee, GLTransaction, GSTReturn, InventoryCategory, InventoryLocation, InventoryReturn, InventoryTxs, Levies, LinesOfCredit, LinesOfCreditTransaction, OtherChargeList, PayrollTransaction, ReturnReason, SentEmailLog, Statement, SystemSettings, TagAlong, User, WorkOrderStatus`.

(Note `ChartOfAccount` currently appears in **both** lists — dead weight in `LOCAL_ENTITIES`, drop it from there since the `SUPABASE_TABLES` entry is the live/correct one.)

| Line(s) | Current | Change |
|---|---|---|
| 3 | `import { base44 } from '@/api/base44Client';` | Remove once every call site below converts. |
| 24-27 | `SUPABASE_TABLES` array | Add every entity confirmed fully native on **both branches** and not already listed: `BankAccount, BankReconciliation, BankTransaction, CashDrawerAdjustment, DepositSlipBreakdown, GLTransaction, GSTReturn, InventoryCategory, InventoryLocation, InventoryReturn, Levies, LinesOfCredit, LinesOfCreditTransaction, OtherChargeList, PayrollTransaction, ReturnReason, SystemSettings`. Also add `TagAlong, WorkOrderStatus, CustomerPortalWorkOrder, SentEmailLog` **only after 14C's production replay lands** — don't move them here first, or the admin tool will 500 on production for anyone using it before 14C ships. |
| 29-37 | `LOCAL_ENTITIES` array | Remove every entity moved above. Drop `ChartOfAccount` (duplicate, dead). Drop `InventoryTxs` entirely (confirmed deprecated/superseded by `InventoryAuditLog` per Section 2 of the blueprint — don't migrate a dead entity, just remove it from this list). `User` needs its own judgment call — it's a Base44 auth concept, not a real Postgres table; either drop it from the list entirely or point it at `auth.users` via a service-role-gated read if there's a genuine ops need to browse users this way (recommend dropping — flag to you if you want it kept). `Employee` stays in `LOCAL_ENTITIES` for now unless you want it moved too (it's WorkPRO-native, technically browsable via direct `supabase.from('Employee')`, just wasn't in this file's original scope decision — low-risk to move, your call). `Statement` stays in `LOCAL_ENTITIES` — still genuinely non-existent (see §0.3). |
| 124-155 (`fetchSchema`, `targetType === 'supabase'` branch) | `base44.functions.invoke('SupabaseProxy', { action: 'read', table: selectedEntity })` | `supabase.from(selectedEntity).select('*').limit(1)` — same `data[0]` key-extraction logic below it, unchanged. |
| 165-192 (`handleExtract`) | Same `SupabaseProxy` read pattern, then client-side date filtering | `supabase.from(selectedEntity).select('*')`, then identical client-side filtering logic (untouched — it's pure JS, not base44-dependent). |
| 206-216 (`handleSearch`) | Same pattern | `supabase.from(selectedEntity).select('*')`, then identical client-side search-filter logic. |
| 240-246 (`handleUpdateRecord`, `targetType === 'supabase'` branch) | `base44.functions.invoke('SupabaseProxy', { action: 'update', table: selectedEntity, id: ..., data: ... })` | `supabase.from(selectedEntity).update(updatedRecord).eq('id', updatedRecord.id)` |
| 247-257 (`handleUpdateRecord`, `targetType === 'local'` branch) | `base44.entities[selectedEntity].update(...)` / `base44.functions.invoke('adminDbTool', ...)` | **Leave this branch alone** — it's for the `LOCAL_ENTITIES` dropdown, which by definition still has at least `Statement` (and possibly `User`/`Employee` per your call above) routing through base44/`adminDbTool`. Only fully removable once `LOCAL_ENTITIES` is empty, which depends on §0.3.

**Task List:**
- [ ] Re-check `git status` on `Admin.jsx` immediately before starting (§0.1).
- [ ] Convert the 4 `targetType === 'supabase'` call sites to direct `supabase.from()`.
- [ ] Update `SUPABASE_TABLES`/`LOCAL_ENTITIES` arrays per the table above (staged: the first 17 entities now, the 4 dev-only ones after 14C).
- [ ] Decide (or ask) on `User`/`Employee` placement per the note above.
- [ ] Live-verify: pick 3-4 newly-moved entities, run Extract and Search against real data, confirm results match what the old `SupabaseProxy` path would have returned.

**Verification Plan Checklist:**
- [ ] `npm run build`/`npx eslint` clean.
- [ ] Extract works for at least one newly-native entity with real production-shaped data (e.g. `BankTransaction`).
- [ ] Search works for at least one newly-native entity.
- [ ] Record-detail edit (`handleUpdateRecord`) round-trips correctly for one newly-native entity.
- [ ] `LOCAL_ENTITIES` dropdown still works unchanged for whatever remains in it (`adminDbTool` path untouched).
- [ ] Repo-wide grep for `base44` inside `Admin.jsx` shows only the `targetType === 'local'` branch's intentionally-remaining calls.

---

### 14C — Dev-Only Table Production Replay + Setup Managers

**Target:** new migration replaying `TagAlong`/`WorkOrderStatus`/`CustomerPortalWorkOrder`/`SentEmailLog` schema+RLS to production; `src/components/setup/TagAlongManager.jsx`, `src/components/setup/OtherChargesManager.jsx`, `src/components/setup/WIPSettings.jsx`, `src/components/setup/WorkOrderStatusManager.jsx` (not yet read — read before executing).

**Schema replay (production):** Column-for-column schemas already confirmed identical intent to dev (verified live in §0.2's research: `TagAlong(name, description, other_charge_id, tagalongid, id, created_date, updated_date, created_by_id, created_by, is_sample)`, `WorkOrderStatus(name, display_order, color, is_active, id, created_date, updated_date, created_by_id, created_by, is_sample)`, `CustomerPortalWorkOrder` — 24 columns incl. jsonb-as-text snapshots, `SentEmailLog(to_email, from_email, subject, body, body_preview, status, status_message, sent_date, customer_id, work_order_id, portal_url, tracking_id, ...)`). Generate a `CREATE TABLE` from dev's live `pg_dump`-equivalent (via `information_schema`) for each of the 4, apply to production, then add the same single permissive RLS policy pattern already used for every other table this project has replayed (Phase 10A precedent).

**Detailed Execution Plan (per-file, pending a read of `TagAlongManager.jsx`'s siblings not yet reviewed line-by-line — `WorkOrderStatusManager.jsx` needs its own read pass before writing exact line numbers):**

| File | Current dependency | Change |
|---|---|---|
| `TagAlongManager.jsx:7` `import { TagAlong, OtherChargeList } from '@/entities/all';` | `TagAlong.list()/create()/update()/delete()`, `OtherChargeList.list()` | Both convert to `supabase.from('TagAlong')...`/`supabase.from('OtherChargeList')...`. `OtherChargeList` is safe today (already native both branches); `TagAlong` needs the production replay above first. |
| `OtherChargesManager.jsx:5` `import { OtherChargeList } from "@/entities/all";` | `OtherChargeList.list('-created_date')/create()/update()/delete()` | Convert to `supabase.from('OtherChargeList').select('*').order('created_date', { ascending: false })` and matching insert/update/delete. Note this file **already** uses direct `supabase.from('ChartOfAccount')` for its GL-account dropdown (line 40) — only the `OtherChargeList` CRUD itself needs conversion, the file is already half-native. |
| `WIPSettings.jsx:9` `import { SystemSettings } from "@/entities/all";` | `SystemSettings.list()/create()/update()` | Convert to `supabase.from('SystemSettings').select('*')` and matching insert/update. `SystemSettings` is already fully native both branches — no replay dependency here, purely mechanical. |
| `WorkOrderStatusManager.jsx` (not yet read) | Presumably `WorkOrderStatus` via `@/entities/all`, same shape as `TagAlongManager` | Read this file in full before executing; expect the same `list/create/update/delete` → `supabase.from('WorkOrderStatus')` conversion pattern. Needs the production replay first. |

**Task List:**
- [ ] Read `WorkOrderStatusManager.jsx` in full (not yet reviewed).
- [ ] Write and apply the 4-table schema-replay migration to production (schema + RLS only, no data — these are config tables, not transactional history, so there's nothing to backfill).
- [ ] Confirm via direct SQL: RLS enabled, exactly 1 policy, on production, for all 4 new tables (standing Phase 1 landmine check).
- [ ] Convert `TagAlongManager.jsx`, `OtherChargesManager.jsx`, `WIPSettings.jsx`, `WorkOrderStatusManager.jsx`.
- [ ] Live-verify each manager's CRUD round-trip on dev first, then production after the replay.
- [ ] Fold the now-fully-native `TagAlong`/`WorkOrderStatus`/`CustomerPortalWorkOrder`/`SentEmailLog` into 14B's `Admin.jsx` `SUPABASE_TABLES` array (deferred there specifically for this reason).

**Verification Plan Checklist:**
- [ ] Production replay migration applied cleanly, RLS confirmed (1 policy, exactly) on all 4 tables.
- [ ] Tag Along add/edit/delete round-trip live on dev, then production.
- [ ] Other Charges add/edit/delete round-trip live (already partially native, confirm no regression from the CRUD conversion).
- [ ] WIP Settings (legal text / default message / RO & Invoice numbering) save/reload round-trip live.
- [ ] Work Order Status manager round-trip live (pending file read).
- [ ] `npm run build`/`npx eslint` clean on all 4 files.

---

### 14D — LankarImport.jsx Transport + `autopro-processDataImport` Port

**Target files:** `src/pages/LankarImport.jsx`; new `supabase/functions/autopro-processDataImport/`.

**Detailed Execution Plan:**

| Line(s) | Current | Change |
|---|---|---|
| 9-10 | `import { InventoryItem, TagAlong } from '@/entities/all'; import { base44 } from '@/api/base44Client';` | Remove `base44` import once converted below. `InventoryItem` import is actually unused in this file (only `TagAlong` is referenced) — drop it too as a drive-by dead-import cleanup. |
| 30-37 (`loadTagAlongs`) | `TagAlong.list()` | `supabase.from('TagAlong').select('*')` — depends on 14C's production replay landing first. |
| 51-53 (`handleFileChange`) | `base44.integrations.Core.UploadFile({ file })` | `supabase.storage.from('kadr-digital_invoice_uploads').upload(\`lankar-import/${crypto.randomUUID()}-${file.name}\`, file)` then read back the storage path (not a public URL — pass the storage path to the new Edge Function, which reads it server-side via the service-role client, matching `PartsInvoiceOCRModal.jsx`'s established pattern exactly). |
| 72-95, 92-95 (`handleImport`) | `base44.functions.invoke('processDataImport', { file_url, type, dry_run })` (×2 call sites: dry-run for balance_sheet, then real run) | `supabase.functions.invoke('autopro-processDataImport', { body: { storage_path, type, dry_run } })` — same `.success`/`.total_debits`/`.total_credits`/`.message`/`.error` response shape, normalized to always-200 per convention. |

**New function port — `autopro-processDataImport`** (459-line legacy source, 6 import types):
- Read the full legacy source before writing a single line of the port — this is the largest single artifact in this phase and deserves its own careful read-through, not a summary-level port.
- Preserve the exact per-type column-mapping logic (customers/vehicles/suppliers/inventory/inventory_locations/balance_sheet) byte-for-byte per the project's standing "preserve exact legacy behavior" convention.
- `balance_sheet`'s dry-run mode (returning `total_debits`/`total_credits` for user confirmation before a real import) must be preserved exactly — it's the one path with a client-side confirmation gate.
- Apply the 24-char-hex id-generation convention (§2) to every row this function inserts, after confirming each target table's own `id` format on a live row first (`Customer`/`Vehicle`/`Supplier`/`InventoryItem`/`InventoryLocation` all likely already have an established convention from their own migration phases — check each, don't assume they're all the same).
- Drop the `base44.auth.me()` gate; resolve `created_by`/`created_by_id` from the caller's JWT (Phase 8C pattern) since this writes audit fields.
- Every legacy `Response.json({ error }, { status: 400/500 })` → `status: 200` per convention.

**Task List:**
- [ ] Read `base44/functions/processDataImport/entry.ts` in full.
- [ ] Confirm id-format convention for each of the 5 non-GL target tables via a live row query.
- [ ] Write and deploy `autopro-processDataImport` to dev.
- [ ] Curl-verify each of the 6 import types against a small throwaway CSV/file per type (or as many as can be safely constructed) — this function has never been ported before, so no existing precedent to lean on for "which types actually still get used."
- [ ] Convert `LankarImport.jsx`'s 3 call sites + storage-upload swap.
- [ ] Live-verify at least the two or three import types the shop actually still uses in practice (confirm with the user which ones are live-relevant vs. legacy-only before spending time verifying all 6 equally).
- [ ] Clean up all throwaway imported rows after verification.
- [ ] Deploy to production after dev sign-off.

**Verification Plan Checklist:**
- [ ] `autopro-processDataImport` curl-verified for each import type actually still in active use.
- [ ] `balance_sheet`'s dry-run confirmation dialog shows correct totals before a real import.
- [ ] File upload via native Storage confirmed working (file lands in the bucket, function reads it server-side).
- [ ] Throwaway imported data cleaned up after each test.
- [ ] `npm run build`/`npx eslint` clean.
- [ ] Repo-wide grep for `base44` inside `LankarImport.jsx` returns zero hits.

---

### 14E — AddLegacyInvoiceModal.jsx Cleanup

**Target file:** `src/components/lankar/AddLegacyInvoiceModal.jsx` — already uses direct `supabase.from('CustomerPayments')` and `supabase.rpc('search_customers_ranked')`; only base44 use is line 95's `UploadFile`.

**Detailed Execution Plan:**

| Line(s) | Current | Change |
|---|---|---|
| 6 | `import { base44 } from "@/api/base44Client";` | Remove once line 95 converts. |
| 95 (`handleSubmit`) | `base44.integrations.Core.UploadFile({ file })` → `fileUrl` stored as `lankar_invoice` on the `CustomerPayments` insert | Same native-Storage swap as 14D: `supabase.storage.from('kadr-digital_invoice_uploads').upload(...)`, store the resulting storage path (or a signed URL if `lankar_invoice` needs to stay a directly-openable link — check how `lankar_invoice` is read elsewhere before deciding path-vs-signed-URL). |

**Task List:**
- [ ] Check every reader of `CustomerPayments.lankar_invoice` (grep) to confirm whether it expects a raw URL or can be adapted to a storage path + on-demand signed URL.
- [ ] Convert the one call site.
- [ ] Live-verify: add a throwaway legacy invoice with a file attached, confirm the file is retrievable afterward exactly like before.

**Verification Plan Checklist:**
- [ ] `npm run build`/`npx eslint` clean.
- [ ] File attach + retrieve round-trip confirmed live.
- [ ] Repo-wide grep for `base44` inside this file returns zero hits.

---

### 14F — LegacyWorkOrderImportModal.jsx + `autopro-processLegacyWorkOrder` Port

**Holds on §0.4.** **Target files:** `src/components/lankar/LegacyWorkOrderImportModal.jsx` (850 lines, read in full above); new `supabase/functions/autopro-processLegacyWorkOrder/`.

**Detailed Execution Plan:**

| Line(s) | Current | Change |
|---|---|---|
| 7-8 | `import { base44 } from "@/api/base44Client"; import { Customer, Vehicle, InventoryItem } from "@/entities/all";` | Remove `base44` once all call sites convert. `Customer`/`Vehicle`/`InventoryItem` → direct `supabase.from()` (all three already fully native, confirmed in prior phases — mechanical swap only). |
| 95 (`processFile`) | `base44.integrations.Core.UploadFile({ file: uploadFile })` | Native Storage upload, same pattern as 14D/14E. |
| 163-166 (`processFile`) | `base44.integrations.Core.ExtractDataFromUploadedFile({ file_url, json_schema: jsonSchema })` | Replace with a direct Gemini call inside a new native Edge Function (`autopro-extractLegacyWorkOrderData` or fold into the same function as `autopro-processLegacyWorkOrder`'s first phase) using the exact same JSON schema already defined client-side (lines 100-161) — model directly after `autopro-suggestInventoryCategory`'s existing Gemini-grounded pattern (§2). The frontend keeps sending the file (now a storage path) and gets back the same `extractedData` shape it already expects; only the transport changes. |
| 178-181 (`processFile`) | `Customer.list()`, `Vehicle.list()` | `supabase.from('Customer').select('*')`, `supabase.from('Vehicle').select('*')` |
| 211, 217 (`processFile`) | `InventoryItem.filter({ part_number: ... })` | `supabase.from('InventoryItem').select('*').eq('part_number', ...)` |
| 293 (`handleCreateWorkOrder`) | `base44.functions.invoke('processLegacyWorkOrder', payload)` | `supabase.functions.invoke('autopro-processLegacyWorkOrder', { body: payload })` — same `.success`/`.error` shape, normalized to always-200. |

**New function port — `autopro-processLegacyWorkOrder`** (153-line legacy source):
- Read the full legacy source before porting.
- This creates a real `WorkOrder` row (id-format already established from Phase 13B's own research — 24-char truncated hex, confirmed against real production rows) plus classified line items (labor/parts/other-charges) and optionally new `InventoryItem` rows for unmatched parts.
- Confirm it doesn't call either protected GL function (§0.5's same caution applies here) before treating this as a safe standalone port.
- Drop the `base44.auth.me()` gate, resolve identity from the JWT per the Phase 8C pattern (this function almost certainly sets `created_by` on the new WorkOrder).

**Task List:**
- [ ] Read `base44/functions/processLegacyWorkOrder/entry.ts` in full.
- [ ] Decide (with the extraction-schema JSON already defined client-side) whether the Gemini extraction call lives in its own function or is folded into `autopro-processLegacyWorkOrder`'s own entrypoint as a first phase — recommend folding, since the frontend already treats it as one logical "process this file" action split only by the `step` state variable, not by the file itself needing two separate backend round-trips.
- [ ] Confirm `WorkOrder.id` format still matches the Phase 13B-documented convention on a fresh check (don't just trust the old note).
- [ ] Write and deploy the new function(s) to dev.
- [ ] Curl-verify against a real throwaway legacy work-order PDF.
- [ ] Convert all `LegacyWorkOrderImportModal.jsx` call sites.
- [ ] Live-verify the full 2-step flow (upload → extract → review/classify → create) against a real throwaway document.
- [ ] Clean up the throwaway WorkOrder/InventoryItem rows created during verification.
- [ ] Deploy to production after dev sign-off.

**Verification Plan Checklist:**
- [ ] Gemini extraction round-trips correctly with the exact same JSON schema the frontend already expects (no shape drift).
- [ ] Customer/Vehicle auto-match logic still works against real data.
- [ ] Inventory part-number fuzzy-match (`O`/`0` swap fallback) still works.
- [ ] New-part creation path (`create_new_part` flag, cost/core/qty-on-order fields) round-trips correctly into `InventoryItem`.
- [ ] Full "Create Work Order" round-trip produces a correct `WorkOrder` row with correctly-classified line items.
- [ ] Throwaway data cleaned up.
- [ ] `npm run build`/`npx eslint` clean.
- [ ] Repo-wide grep for `base44` inside this file returns zero hits.

---

### 14G — Final Sunset

**Blocked** on: §0.3's decision (AR/Statements cluster) and §0.7's decision (who sweeps the other ~35 cross-phase-residue files — Phase 5/7/8/12-boundary leftovers, none currently owned). Phase 10 and Phase 13 are confirmed closed (§0.1/§0.1b); Phase 10A is being handled by a separate final-validation plan outside this document (§0.1c). 14A-14F must also land first.

**Detailed Execution Plan (once unblocked):**
1. Repo-wide grep for `base44`, `@/entities/all`, `@/functions/` across `src/` — must return **zero** hits (the `base44/` source tree itself is exempt, per the standing "leave it alone until this step" rule — this check is about live traffic, not the presence of the archived source).
2. Remove `@base44/sdk` and `@base44/vite-plugin` from `package.json`.
3. Remove the base44 plugin block from `vite.config.js`.
4. Delete the `base44-proxy` Edge Function from both dev and production (`supabase functions delete base44-proxy --project-ref <ref>`, per the Phase 2 precedent of source-deletion and live-function-deletion being two separate steps).
5. Delete the `base44/` directory from the repo.
6. Full-app smoke test: every top-level nav page loads without error, on both branches.

**Task List:**
- [ ] Confirm every other phase's closure status directly (not from the blueprint's summary table alone — same standing rule as everywhere else in this project).
- [ ] Resolve §0.3.
- [ ] Run the final repo-wide grep and treat any surprise hit as a stop-and-investigate, not a "close enough."
- [ ] Execute steps 2-6 above.
- [ ] Full smoke test on `test.kensauto.ca`, then production.

**Verification Plan Checklist:**
- [ ] Repo-wide `base44` grep: zero hits in `src/`.
- [ ] `npm run build` succeeds with `@base44/sdk`/`@base44/vite-plugin` fully removed from `package.json` and `vite.config.js`.
- [ ] Every top-level page loads without console errors on dev.
- [ ] Every top-level page loads without console errors on production.
- [ ] `base44-proxy` function deleted from both environments, confirmed via `list_edge_functions`.
- [ ] `base44/` directory deleted, confirmed via `git status`/`ls`.

---

## Final Verification Plan (all sub-phases together)

Once 14A-14F are individually verified, a single combined pass before declaring the phase closed:
- [ ] Full Setup page walkthrough: backup, restore (throwaway), all 4 setup tabs (Sales Classes, Tagalongs, Other Charges, WIP incl. Statuses/Main/Legal/Default Message).
- [ ] Full Admin page walkthrough: extract + search against 3-4 different newly-native entities, one record edit.
- [ ] Full Lankar Import page walkthrough: one CSV-type import (whichever the shop actually still uses), one legacy invoice add with file attach, one legacy work order import end-to-end.
- [ ] Repo-wide grep across all of Phase 14's target files returns zero `base44` hits.
- [ ] No regressions in any adjacent page that reads `SalesClass`/`OtherChargeList`/`SystemSettings`/`TagAlong`/`WorkOrderStatus` (e.g. work-order forms that consume tag-alongs/other-charges/WIP legal text) — spot-check at least one such consumer per entity.

## Handoff Context to Next Phase

Whatever closes out this phase (14G or a deferred "Phase 15 + deferred 14G") should inherit: the exact `base44`-grep file list from whenever 14A-14F actually finish (it will have shrunk from today's ~61-file count but won't be zero until 10/10A/12/13/§0.3 are all done too); the decision made on §0.3; and the `User`/`Employee` placement decision from 14B if left open here.

---

## 4) Phase Results and Final Context

*(Empty — to be filled in as execution/verification proceeds. Do not remove this section header.)*
