# Master Blueprint: Base44 Deprecation

**Status:** APPROVED — Phase 1, 2, 3 & 4 Tested and complete; Phase 5 up next
**Prepared:** 2026-08-02 (v1), revised 2026-08-02 (v2, v3, v4, v5)
**Baseline commit:** `4ba05162` (development branch)

> **Numbering note:** Phase numbering restarts at **Phase 1** for this initiative (prior Base44-adjacent work by earlier sessions was informal/untracked, not a labeled "Phase 1/2"). Sub-phase numbers (`1.1`, `1.2`, ...) are reserved for when an individual phase gets its own detailed phase plan. **v4 inserts a new Phase 2 and renumbers everything after it (old 2→3, 3→4, ... 13→14) — if you're cross-referencing an earlier conversation against this doc, phase numbers above 1 shifted by one.**

---

## 0) Open Questions, Info Requirements & Suggestions

1. **Resolved — dev environment approach, entity status, Appointment plan, master_context.md permission, Kanban board.** See v3's history in git/prior conversation — all resolved and folded into the phases below.

2. **New (v4), resolved — PartsTech/Online Ordering is a confirmed failed experiment.** You want it removed entirely, including the `PartsTechCart` table. Live validation (via Supabase CLI during Phase 1 prep) confirmed that table's migration was **never applied to production** — so there's no live table to drop, which simplifies this considerably. New Phase 2 below scopes the full removal.

3. **New (v4), resolved — WorkOrderForm duplicate is already gone.** You flagged two `WorkOrderForm.jsx` files (one in `form/`, one at `work-orders/` root) as a problem. I checked git history: the root-level duplicate was already deleted in the most recent commit on this branch (`019a26c2`, "Online Ordering Integrations"). **No cleanup action needed** — only `src/components/work-orders/form/WorkOrderForm.jsx` exists now, and it's the one actually used by `DocumentEditor.jsx`. Logged in Lessons Learned (Section 7) so this doesn't get re-flagged later.

4. **✅ Resolved.** `PARTSTECH_API_KEY` was unset from production by the user directly during Phase 2 execution. `PartsTechCart` was also dropped from production and the `partstech-extension.zip` deleted from Storage, all by the user. Phase 2 is fully complete and Tested.

5b. **New (Phase 6 planning), resolved — deferred a small piece of Technician Performance Report to Phase 10.** `getTechnicianPerformanceReport`'s "Monthly Payroll Target vs Labour Sales" progress bar reads `CashFlowSummary` (confirmed no native table exists yet — bundled into Phase 10). Phase 6 migrates the report's utilization/efficiency data (fully native already) and hardcodes the progress bar's `target`/`current` to 0, hiding that card client-side until Phase 10 lands. **Action item for whoever scopes Phase 10's detailed plan:** restore the payroll-target progress bar in `TechnicianPerformanceReportModal.jsx` (unhide the card) and its backing logic in `autopro-getTechnicianPerformanceReport` (see the `TODO(Phase 10)` comment left in that function, referencing `base44/functions/getTechnicianPerformanceReport/entry.ts` lines 396–420 for the original calc) once `CashFlowSummary` has a native table. Verification of this specific card was explicitly skipped in Phase 6 since it's intentionally non-functional until then.

5. **New — security finding, needs your call on timing/approach.** While restoring Phase 1's dev environment (see `phase_1_dev_environment_parity_plan.md`), found that two production triggers (`sync_customer_to_google` on `Customer`, `WorkOrder_Broadcast` on `WorkOrder`) have a **live service-role/anon JWT hardcoded in plaintext directly in the trigger definition**, visible to anyone with schema read access — not just in `.env`. Also found the `Google-Contacts-Sync` edge function that one of them calls isn't tracked in your local repo's `supabase/functions/` at all — it's a live, untracked deployment. Neither is blocking any current phase, but worth a decision: rotate the embedded token and move to a vault-based secret reference, and either pull `Google-Contacts-Sync`'s source into the repo or confirm it's intentionally managed outside git. Not scoped into any phase yet — let me know if you want it folded into Phase 14 (final sunset/cleanup) or handled as its own quick fix.

---

## Practical answer: Phase 1 — dev branch schema/function sync + Vercel secrets

See `Plans and Context/phase_1_dev_environment_parity_plan.md` for the full, validated, step-by-step execution plan — that document is the source of truth for Phase 1 (this section stays as a short pointer so the blueprint doesn't drift out of sync with it). **Note:** that plan's original "Step 0" (the dangling `PartsTechCart` migration) is now resolved by Phase 2 below — since the feature is being deleted outright, the fix is deleting the migration file, not repairing/applying it.

---

## 1) Objectives

**TL;DR:** AutoPro still round-trips through the legacy Base44 SaaS platform for a large share of its backend calls (279 `base44.functions.invoke` sites, 122 of them the generic `SupabaseProxy` CRUD shim, across 129 files), even though a good portion of the underlying data already lives in your own Supabase Postgres project. The goal is to finish cutting every remaining thread back to Base44 — function calls, entity CRUD, auth, file/OCR integrations — module by module, then delete the Base44 SDK, the `base44-proxy` bridge function, and the legacy `base44/` function tree. **(v4 addition: also remove the unrelated-but-adjacent PartsTech/Online Ordering feature, a confirmed failed experiment, early — before it can cause confusing test failures in later phases.)**

**What's actually left, now that entity status is fully confirmed:**
- **Fully native already** (transport-layer cleanup only): Customer, Vehicle, GLTransaction, all WorkPRO tables.
- **Hybrid** (table + data migrated, CRUD not fully cut over): Appointment, ChartOfAccount, InventoryCategory, InventoryLocation, InventoryReturn, FiscalPeriod.
- **Confirmed still Base44-only** (real schema design + data migration required, not just a rewire): `CashFlowEntry`, `CashFlowSummary`, `GSTReturn`, `LinesOfCredit`, `LinesOfCreditTransaction`, `CashDrawerAdjustment`, `DepositSlipBreakdown`, `SystemSettings`, `PayrollTransaction`, `Levies`, `OtherChargeList`, `TagAlong`, `WorkOrderStatus`, `ReturnReason`, `Statement`, `SentEmailLog`, `RealtimeSignal`, `CustomerPortalWorkOrder`.
- **To be deleted, not migrated:** `PartsTechCart` (never lived in production), the `KanbanBoard.jsx` view, and the entire PartsTech/NAPA ProLink online-ordering feature cluster.

**Migration policy (confirmed):**
- **Thin proxies / simple lookups & CRUD** → migrate directly to `supabase.from()` calls from the frontend (or a very thin native RPC), no intermediate function needed.
- **Complex functions** (real business logic — GL posting, multi-step calculations, cross-table orchestration) → get a proper **1:1 native Edge Function replacement** (`autopro-*`), not a direct frontend call.
- **Confirmed Base44-only entities** → need actual Postgres schema design (mirroring the `base44/entities/*.jsonc` definitions, following the FK/timestamp/default patterns established in `appointment_implementation_plan.md`) before any CRUD migration can happen.
- **Confirmed dead/failed features** → delete outright, don't migrate (Kanban board, PartsTech/Online Ordering).

**Goals:**
1. Zero remaining `base44.*` imports anywhere in `src/`.
2. Zero remaining `base44/functions/*` and `base44/entities/*` files still receiving live traffic — delete the tree once confirmed dark.
3. `@base44/sdk`, `@base44/vite-plugin` removed from `package.json`; base44 plugin block removed from `vite.config.js`.
4. `base44-proxy` Edge Function deleted once nothing calls it.
5. Legacy `InventoryTxs` references fully removed from `src/`.
6. No visible behavior change for end users — this is a plumbing migration, not a feature project (confirmed exceptions: Phase 13 removes the unused Kanban board, and Phase 2 removes the failed PartsTech/Online Ordering experiment).
7. Every phase is testable against a real dev/staging environment before touching production (Phase 1 exists specifically to make this true).

---

## 2) Previously Completed (Baseline)

**Prior work (done before this blueprint, by earlier sessions/agents, not formally tracked as a phased plan):**
- Supabase authentication setup and Vercel hosting migration.
- `InventoryAuditLog` established as the predominant/authoritative inventory movement tracking mechanism (superseding the legacy `InventoryTxs` entity functionally, though stale imports remain — see Phase 7).
- 17 native `autopro-*` Edge Functions built and wired for inventory receiving/adjustment/merging/returns, WO save, GL posting (`autopro-handleInvoiceConversionGL`, `autopro-handleSupplierInvoiceLineGL`), PartsTech integration, and OCR.
- **Customer, Vehicle, and GLTransaction are fully migrated to native Postgres** — schema, data, and backend side done. Frontend call sites still route through Base44 proxy functions for these (Phase 5).
- **WorkPRO's entire database** (Project, ProjectTimeSession, TimeRecord, UnassignedTime, Employee, and related tables) is **fully native in the same Supabase project**, with zero live Base44 data remaining for it. AutoPRO's remaining `workProProxy` calls are legacy transport only, not a real data dependency (Phase 4).
- **Hybrid/in-progress**: Appointment (table exists, an existing separate implementation plan — `appointment_implementation_plan.md` — governs its transition; see Phase 12), ChartOfAccount (table + data migrated, CRUD not fully cut over — low-urgency since it's a low-change-frequency table), InventoryReturn, FiscalPeriod (all similarly hybrid).
- A local Electron Desktop App (`electron/main.js`, `electron/preload.cjs`) loading the production site — independent of the Base44 data layer, kept for its PWA-adjacent shell value.
- `WorkPro.jsx` standalone page removed (commit `a0d3ed6`) — UI-level cleanup only; the underlying `workProProxy` calls were untouched (addressed in Phase 4).
- The Kanban board view of Work Orders (`KanbanBoard.jsx`) is confirmed no longer in use — to be deleted, not migrated (Phase 13).
- **(v4) PartsTech/NAPA ProLink online-ordering integration was built** (a punch-out iframe flow with LLM-based cart-text extraction, a companion Chrome browser extension for bridging cart data, and an Electron desktop cart-scraping bridge) **but is confirmed a failed experiment, not something to migrate.** Being removed outright in the new Phase 2, including its (never-applied-to-production) `PartsTechCart` staging table.
- The old duplicate `src/components/work-orders/WorkOrderForm.jsx` (root-level, superseded by `form/WorkOrderForm.jsx`) was already deleted in commit `019a26c2` ("Online Ordering Integrations") — no cleanup action needed here.

**Clarification on "WorkPRO" vs "AutoPRO":** AutoPRO is the shop-management system covered by this blueprint's modules. **WorkPRO is a separate sister application** — the technician-facing side: project tracking, work-order pairing with projects, and time tracking. AutoPRO reads/writes into WorkPRO's tables (already native Postgres, same Supabase project) via the legacy `workProProxy` Base44 function today. (This distinction is now also captured in `master_context.md`.)

**What's NOT yet done (the gap this blueprint addresses):** 129 files still import the Base44 client; 279 `base44.functions.invoke` sites remain; 13 direct `base44.entities.*` CRUD sites (17 of the underlying entities confirmed to have no Postgres table at all yet); 27 `base44.auth.*` sites with no central session hook; 129 Base44-hosted functions and entity schemas still live; `@base44/sdk`/`@base44/vite-plugin` still production dependencies; no dev/staging Supabase environment currently mirrors production for safe testing (Phase 1 fixes this); the PartsTech/Online Ordering failed-experiment cluster still exists in the codebase (Phase 2 removes it).

---

## 3) Risk Assessment

| # | Risk | Phase(s) | Impact | Likelihood | Mitigation |
|---|---|---|---|---|---|
| 1 | Testing against production because no dev environment exists yet | All, until Phase 1 lands | **Critical** | High until mitigated | Phase 1 is sequenced first specifically to close this gap before any data-touching phase executes. |
| 2 | GL/double-entry accounting corruption during Banking, AP, Accounting, or Payroll rewire | 8, 9, 10, 11 | **Critical** | Medium | Never modify the already-native GL posting functions (`autopro-handleInvoiceConversionGL`, `autopro-handleSupplierInvoiceLineGL`) — only rewire/build the CRUD feeding them. Diff Balance Sheet / GL-imbalance reports before vs. after each phase. |
| 3 | **Confirmed** schema-design work for 17 entities with no Postgres table today — this is now a certainty, not a possibility | 8, 9, 10, 11 | High | **Confirmed** | Design schema per entity mirroring `base44/entities/*.jsonc` field definitions, following the FK/timestamp/default pattern set by `appointment_implementation_plan.md`. Build + validate in the Phase 1 dev branch before touching production. |
| 4 | Security regression: replacing a coarse service-role proxy with a direct frontend call without proper RLS | Any phase using the "thin proxy → direct call" policy | **Critical** | Medium-High if RLS skipped | Every direct `supabase.from()` migration must ship with a reviewed RLS policy for that table. Complex/sensitive logic stays server-side per the stated policy. |
| 5 | Two agents (Claude Code + Antigravity) editing overlapping files concurrently | Phases 2, 4 & 13 especially (all touch work-orders components) | Medium | Medium | Serialize phases that share files; only parallelize phases confirmed file-disjoint (see Section 5 coordination map). |
| 6 | Appointment's existing implementation plan not fully executed (title→notes migration script status unconfirmed; title column still present in DB) | 12 | Low-Medium | Medium | Confirm migration-script execution status before Phase 12's detailed plan proceeds. |
| 7 | Work Orders Core (`DocumentEditor.jsx`) blast radius — touches nearly every other domain | 13 | High | Medium | Still sequenced after Inventory (7), Appointment (12), and PartsTech Removal (2) land. Full WO-lifecycle regression test required. |
| 8 | Third-party integration coupling (PartsTech, LLM/OCR extraction) still partially Base44-hosted | 7 | Medium | Low (downgraded — PartsTech itself is being deleted in Phase 2, not migrated; residual risk here is only the unrelated OCR function) | The one still-relevant piece (`autopro-processPartsInvoiceOCR`) is unaffected by the Phase 2 deletion — confirmed it doesn't share code with `autopro-extractCartTextLLM` beyond the `GEMINI_API_KEY` secret, which must NOT be removed. |
| 9 | Data-type corruption (string-concat bugs) re-introduced on rewritten financial write paths | 8, 9, 10, 11 | High | Low | Strictly cast (`Number()`/`parseFloat()`) on every rewritten write path, per existing project convention. |
| 10 | Dev-branch secrets don't automatically carry over from production | 1 | Medium | High (structural — Branching doesn't clone secrets) | Explicit secrets-setting step in `phase_1_dev_environment_parity_plan.md`. |
| 11 | Plaintext long-lived Base44 JWT in local `.env` | 14 | Low | N/A (gitignored, never committed — not a live leak) | Your call on removal timing, not urgent. |
| 12 | **(v4)** Accidentally unsetting `GEMINI_API_KEY` while removing `autopro-extractCartTextLLM`, breaking the unrelated `autopro-processPartsInvoiceOCR` function | 2 | Medium | Low (now explicitly flagged) | Only delete the function itself; explicitly do NOT touch the shared secret. Verify OCR still works after Phase 2. |
| 13 | **(v4)** `autopro-partstech-callback` is a webhook target — if PartsTech's system is still configured to call it, deleting it could produce a benign but confusing external error | 2 | Low | Low | No frontend caller found; deletion just stops accepting a webhook nobody is actively relying on. Confirm no active PartsTech account integration still points at this URL before deleting, as a sanity check. |
| 14 | **(confirmed, structural, found during Phase 1 execution)** `VITE_BASE44_BACKEND_URL`/`VITE_BASE44_PROXY_URL` are hardcoded to production's project ref, independent of `VITE_SUPABASE_URL`. Pointing Vercel's dev environment at the dev Supabase branch does **not** isolate any `base44.functions.invoke`/`base44.entities.*`/`base44.auth.*` call from production — only direct `supabase.from()`/`supabase.functions.invoke('autopro-*')` calls are actually isolated. | All, until each phase's calls are migrated | **Critical for write-testing specifically** | Certain (verified) | Read-only exploration of not-yet-migrated features on "dev" is harmless. **Never write-test a feature before its phase has landed** — those writes hit production regardless of environment. No config fix exists; this only resolves as each phase migrates its calls off `base44.*`. Verification steps per phase must confirm writes land in the dev branch's own tables, not just that the page loads. |

---

## 4) Time Estimate

*Estimates in AI-paired working sessions (~2–4 focused hours each), with Claude Code and Antigravity both executing against your direction/review.*

| Phase | Module | Est. Sessions | Notes |
|---|---|---|---|
| 1 | Dev & Testing Environment Parity | 2–3 | See `phase_1_dev_environment_parity_plan.md` |
| 2 | **(v4, new)** PartsTech / Online Ordering Removal | 1–2 | Deletion-heavy; low complexity but touches several unrelated surfaces (edge functions, browser extension, Electron, Setup page, one production secret) |
| 3 | Auth Centralization + User→Employee Settings Migration | 2 | Includes one-time data migration of existing user preferences |
| 4 | WorkPRO / Tech-Time Rewire | 2–3 | Data fully native already |
| 5 | Customer, Vehicle & GL Cleanup (transport-layer only) | 2 | No schema risk |
| 6 | Reports Module | 1–2 | Isolated, read-only |
| 7 | Inventory Completion (incl. Category/Location/Return hybrid finish) | 3–4 | |
| 8 | Banking & Cash Drawer | 4–5 | `CashDrawerAdjustment`/`DepositSlipBreakdown` confirmed needing real schema + data migration |
| 9 | Accounts Payable, Suppliers, Lines of Credit & ChartOfAccount finish-up | 4–6 | `LinesOfCredit`/`LinesOfCreditTransaction`/`CashFlowEntry` confirmed needing real migration |
| 10 | Accounting, GL Reporting, Taxes & Fiscal Periods | 5–7 | `GSTReturn`/`CashFlowEntry`/`CashFlowSummary` confirmed needing real migration |
| 11 | Payroll | 2–3 | `PayrollTransaction` confirmed needing real migration |
| 12 | Appointment Completion | 2–3 | Scoped against the existing `appointment_implementation_plan.md` |
| 13 | Work Orders Core (`DocumentEditor.jsx` and friends) | 4–6 | Kanban board deletion + Phase 2's PartsTech removal both reduce scope here |
| 14 | Setup, Admin, Lankar Import & Final Sunset | 2–3 | Electron cart-scraping cleanup moved to Phase 2 — slightly lighter than before |
| **Total** | | **~37–53 sessions** | Wall-clock compresses on independent phases run concurrently by both agents (see coordination map) |

---

## 5) Roadmap & Progress

### Parallelization & Coordination Map

```
Tier A — Foundational (do first, sequentially)
  Phase 1 (Dev Env Parity)  -->  Phase 3 (Auth + Employee)

Tier A-extra — Independent cleanup, do early, ideally alongside/right after Phase 1
  Phase 2 (PartsTech / Online Ordering Removal)
  ** File-disjoint from Phase 1 and Phase 3 — safe to run concurrently with either.
     Should finish BEFORE Phase 13 (Work Orders Core) and Phase 4 (WorkPRO) start,
     since all three touch work-orders components. **

Tier B — Low-risk, high-leverage, mutually independent (safe to parallelize once Tier A is done)
  Phase 4 (WorkPRO/Tech-Time)   Phase 5 (Customer/Vehicle/GL)   Phase 6 (Reports)
  ** Phase 4 shares files with Phase 13 (below) — fine to run now, but Phase 13 must wait for Phase 4 to finish **

Tier C — Hybrid finish-ups, mostly independent of Tier B and each other
  Phase 7 (Inventory)   Phase 12 (Appointment)

Tier D — Financial modules, confirmed to include real schema-design work; mostly file-disjoint from
         each other but share GL concepts
  Phase 8 (Banking)   Phase 9 (AP/Suppliers/LOC/ChartOfAccount)   Phase 10 (Accounting/GL/Tax)   Phase 11 (Payroll)
  ** recommend one agent owns this tier sequentially, or split by page-level file ownership if parallelizing **

Tier E — Highest blast radius, do only after 7, 12, 2, and 4 are stable
  Phase 13 (Work Orders Core)
  ** DO NOT run concurrently with Phase 2 or Phase 4 — all touch work-orders / WorkPRO-adjacent files **

Tier F — Final
  Phase 14 (Setup/Admin/Sunset) — only after a repo-wide base44 grep comes back clean
```

---

### Phase 1 — Development & Testing Environment Parity [Tested]

**TL;DR:** Migrate schema + Edge Functions onto the native Supabase dev branch, seed only the static/reference tables you named, then wire Vercel's Development environment to point at it.

**Full plan:** `Plans and Context/phase_1_dev_environment_parity_plan.md` (source of truth — includes live-validated findings against your actual Supabase project).

**Impacted:** No `src/` code changes. New `supabase/migrations/` history, Edge Function deployment + secrets for the dev branch, a seed script for `InventoryCategory`, `ChartOfAccount`, `BankAccount`, `FiscalPeriod`, `SalesClass`, and Vercel Development-environment env var updates.

---

### Phase 2 — PartsTech / Online Ordering Removal [Tested]

**TL;DR:** Delete the entire PartsTech/NAPA ProLink online-ordering feature — confirmed a failed experiment. Sequenced right after Phase 1 (or in parallel with it) rather than left until the final sunset phase, because leaving dead-but-live code referencing a nonexistent table around risks confusing failures the first time anyone exercises that context-menu path during later-phase testing, and because removing it now shrinks Phase 13 (Work Orders Core)'s footprint in the same two files that phase will already be editing.

**Impacted files (delete outright):**
- `partstech-extension/` (entire directory — a standalone Chrome MV3 browser extension: `manifest.json`, `content.js`, `inject.js`)
- `supabase/functions/autopro-partstech-session/`
- `supabase/functions/autopro-partstech-callback/`
- `supabase/functions/autopro-extractCartTextLLM/`
- `supabase/migrations/20260730155600_partstech_cart_table.sql` — **correction (confirmed via direct Supabase connector query, superseding an earlier CLI-only conclusion):** the table genuinely exists in production (empty, 0 rows) even though `supabase migration list` shows this migration as never formally applied — it was evidently created directly via SQL editor, outside migration tracking. So this phase does need an actual `DROP TABLE public."PartsTechCart"` on production, not just deleting the local migration file.
- `src/components/work-orders/OnlineOrderModal.jsx`

**Impacted files (edit — remove PartsTech/ProLink-specific pieces only):**
- `src/components/work-orders/form/WorkOrderForm.jsx` — remove `modals.partsTech`, `partsTechCartId`, `supplierUrl` state; `handleOnlineOrder`/`handlePartsTechSuccess`; the `<OnlineOrderModal>` render block; the `onOnlineOrder` prop passed to `LineItemsTable`
- `src/components/work-orders/form/LineItemsTable.jsx` — remove exactly 3 context-menu items ("Online Order (PartsTech)", "Online Order (NAPA Prolink)", "Finalize Order (PartsTech)") and the `onOnlineOrder` prop; leave the rest of the context menu (Get Part, Other Charge, Add New Part, Return Part, Receive Part, Serial Number, Part Details, Cores, Update to Inv. Price, Add Line, Delete Line) untouched
- `src/components/work-orders/utils/buildWorkOrderSavePayload.js` — decide whether to strip the `partstech_cart_id` field from the line-item payload shape (harmless either way; historical WO rows already have it baked into saved JSON)
- `src/pages/Setup.jsx` — remove the "Download PartsTech Bridge" button and its Supabase-storage link
- `electron/main.js` — remove the `/get-cart-text` protocol route and the `SUPPLIER_PATTERNS` scraping list; keep the window/loadURL scaffolding (the Electron shell itself stays — useful for your PWA users, per Phase 14)
- `electron/preload.cjs` — likely fully deletable; `main.js` has no `preload:` wired into its `BrowserWindow` config, so this file appears already orphaned — confirm before deleting

**Also verify outside the repo:**
- Confirm `PartsTechCart` genuinely doesn't exist in production (expected, per the migration status above)
- Unset the `PARTSTECH_API_KEY` production secret once confirmed nothing else needs it (pending Open Question #4 on timing)
- **Do not touch `GEMINI_API_KEY`** — shared with the unrelated `autopro-processPartsInvoiceOCR` function; only `autopro-extractCartTextLLM` (being deleted) uses it for this feature
- Delete the distributed `partstech-extension.zip` from Supabase storage (the file the removed Setup.jsx button links to)

**Description:** This is a clean deletion, not a migration — nothing here needs a native replacement. ProLink (NAPA ProLink) isn't a separate integration with its own backend; it's just a second hardcoded URL/branding case handled inline in the same modal and context menu as PartsTech, so removing both is one coordinated change, not two. Do this before Phase 13 (Work Orders Core) touches the same two files, and before Phase 4 (WorkPRO) if running concurrently, to avoid file-overlap conflicts between agents.

---

### Phase 3 — Auth Centralization + User→Employee Settings Migration [Tested]

**TL;DR:** Replaced all 35 `base44.auth.*`/`@/entities/User` call sites with `AuthContext`'s `employee` (backed by Supabase Auth + the native `Employee` table), added `updateEmployeePrefs()` for writes, and added the 4 new `Employee` preference columns to both dev and production.

**Full plan:** `Plans and Context/phase_3_implementation_plan.md` (source of truth — full 35-call-site inventory, field census, and verification checklist).

**Impacted files:** `src/lib/AuthContext.jsx` (extended with `employee` + `updateEmployeePrefs`), `src/Layout.jsx` (full field census applied — `role`→`admin`, `AcctsPayAccess`→`accts_pay_access`, `access_level`→`autopro_access_lvl`, WorkPRO lookups fed from `employee.autopro_user_id`/`employee.email`, initials derived client-side, avatar photo dropped), plus ~24 other pages/components. `src/components/ProtectedRoute.jsx` deleted (confirmed dead).

**Verification outcome:** All 6 previously-outstanding manual checklist items now confirmed — dark mode toggle, `paypro_user` payroll gating, avatar initials, executive Accounting menu (`autopro_access_lvl === 'lvl3_user'`), and AP-only Accounting menu (`accts_pay_access`) all verified working end-to-end via the dev-branch login mechanism built specifically to unblock this (see Section 7 lessons below). WorkPRO clock-in/out is explicitly **not** verifiable this way and is confirmed **Phase 4's responsibility**, not a Phase 3 gap — see Section 7.

**Two real bugs found and fixed during this verification pass, both outside the original 35-site inventory:**
1. `Layout.jsx` had two leftover `currentUser={user}` references (`FindPartModal`/`ReportModal` props) where `user` was never defined in scope — should have been `employee`. A genuine runtime `ReferenceError` on every render, invisible to `npm run build` (see Section 7 lesson on build-clean vs. runtime-clean). Fixed (commit `53387770`).
2. `AuthContext.jsx`'s `Employee` fetch discarded the Supabase `error` entirely, silently degrading to "no employee" on any failure with zero trace. Added `console.error` logging (additive only, no behavior change).

---

### Phase 4 — WorkPRO / Tech-Time Integration Rewire [Tested]

**TL;DR:** Replaced every `workProProxy`/`sbCall` call site with direct `supabase.from()` calls against the already-native `Project`, `ProjectTimeSession`, `TimeRecord`, `UnassignedTime`, and `Employee` tables, plus a new native `autopro-archiveWorkOrderProjects` Edge Function (1:1 replacement for the Base44-hosted orchestration function). Simplified `TechDirectory.jsx` to a direct `Employee` read/edit list, removing the WorkPRO sync feature entirely. Deleted two confirmed-orphaned files (`TimeRecordsView.jsx`/`TimeRecordsList.jsx`) and one confirmed-redundant native function (`autopro-getProjectTimeSessions`, source + both live deployments).

**Full plan:** `Plans and Context/phase_4_implementation_plan.md` (source of truth — full 18-row call-site inventory, field-mapping/audit-field reference, and verification checklist, all updated in place with actual outcomes).

**Impacted files:** `src/Layout.jsx` (`sbCall` helper deleted, 6 call sites migrated), `src/pages/WorkOrders.jsx` (Project/ProjectTimeSession list sites), `src/components/work-orders/WorkPRODescriptionModal.jsx`, `src/components/work-orders/GlobalClockInModal.jsx`, `src/components/work-orders/TechTimeModal.jsx`, `src/components/setup/TechDirectory.jsx` (WorkPRO sync UI and `fetchWorkPROTechs` fully removed), `src/pages/InvoiceConversion.jsx` (repointed to the new native function). New: `supabase/functions/autopro-archiveWorkOrderProjects/`. Deleted: `src/components/timerecords/TimeRecordsView.jsx`/`TimeRecordsList.jsx`, `supabase/functions/autopro-getProjectTimeSessions/`.

**Verification outcome:** Live-tested against the dev branch via a temporary password reset on the existing `tyler@kensauto.ca` dev-branch test account (production untouched) — clock in/out, WorkPRO project list rendering, description edits, tech picker, TechDirectory edit, and the new archive Edge Function (invoked directly) all confirmed writing correctly to the dev branch with audit fields populated, then cleaned up. `InvoiceConversion.jsx`'s repoint was code-reviewed but not live-clicked (would need a real work order in a convertible stage; deemed lower-value than the direct Edge Function invocation already performed, given it's a 2-line diff matching an already-proven pattern in the same file).

**Two real bugs found and handled during this verification pass, both outside the original 18-site inventory:**
1. `GlobalClockInModal.jsx`'s `UnassignedTime` insert included an `employee_name` field carried over from the old base44 params — that column doesn't exist on `UnassignedTime` (only `user_name` does), so every global clock-in would have failed with a Postgres schema-cache error. Fixed during verification, reconfirmed working.
2. Pre-existing, **out-of-scope** schema gap: the dev branch's `Employee.pay_rate` column is `bigint`, not numeric/decimal, so any decimal pay rate (e.g. `27.50`) fails with `22P02 invalid input syntax`. Not introduced by this phase's code — flagged for a future ticket, not fixed here.

---

### Phase 5 — Customer, Vehicle & GL Transport-Layer Cleanup [Pending]

**TL;DR:** Data is already fully native — pure transport-layer cleanup, no schema risk. Detailed planning (deep file-level research + user scope decisions) is complete; execution has not started.

**Full plan:** `Plans and Context/phase_5_implementation_plan.md` (source of truth — full 48-row call-site inventory across 21 files, verified against actual source reads of all 11 base44 functions being replaced, live schema/RLS/audit-field checks, and 4 resolved scope-boundary questions).

**Impacted files/functions (verified count, supersedes the original "~34 call sites" estimate — actual is 52 call sites across 21 files):** `AppointmentForm.jsx`, `CustomerForm.jsx`, `DocumentEditor.jsx`, `Schedule.jsx`, `EditApptViaWoModal.jsx`, `CashDrawer.jsx`, `CustomerARTransactions.jsx`, `CustomerARSummary.jsx`, `ARPaymentDetailsModal.jsx`, `Customers.jsx`, `Vehicles.jsx`, `NewVehicleModal.jsx`, `VehicleForm.jsx`, `DepositDetailsModal.jsx`, `InvoicePaymentModal.jsx`, `ChangeCustomerModal.jsx`, `MergeCustomerModal.jsx`, `MergeVehicleModal.jsx`, `NewWorkOrderModal.jsx`, `AddLegacyInvoiceModal.jsx`, `WorkOrderProfitability.jsx`. Base44 functions replaced: `supabaseCustomer`, `supabaseVehicle`, `supabaseCustomerPayments`, `supabaseCustomerARAdjustment`, `supabaseCustomerARSummary`, `searchCustomers`, `searchVehicles`, `mergeCustomers`, `mergeVehicles`, `decodeVin`, plus `SupabaseProxy` calls against `Customer`/`Vehicle`/`GLTransaction` within these 21 files specifically.

**Scope decisions made during planning (see the plan doc's Section 0 for full reasoning):** (1) Deliberately scoped to these 21 files only — `SupabaseProxy` also touches `Customer`/`Vehicle`/`GLTransaction` from 15+ other files (`Bank.jsx`, `CreditInvoice.jsx`, `Admin.jsx`, etc.) that belong to later phases already covering those pages. (2) `searchCustomers`/`searchVehicles` get inlined as direct `supabase.rpc()`/`supabase.from()` calls rather than kept as functions — the underlying RPCs are already proven callable from the browser via `NewWorkOrderModal.jsx`. (3) `mergeCustomers`/`mergeVehicles`/`decodeVin`/`supabaseCustomerARSummary` become native `autopro-*` Edge Functions (real cross-table logic or third-party API calls, not simple CRUD). (4) A handful of confirmed-dead imports get cleaned up as a drive-by.

**Carried over from present investigation (2026-08-03):** `autopro-mergeCustomers`, `autopro-mergeVehicles`, `autopro-decodeVin`, and `autopro-supabaseCustomerARSummary` (already built, not yet wired to these frontend call sites) currently return non-200 statuses on error, violating this doc's own Edge Function convention (Section 3 — always `200`, error in the body). Fix each function's error responses as part of wiring up its frontend call sites in this phase.

---

### Phase 6 — Reports Module Migration [Pending — detailed plan approved 2026-08-03, execution not started]

**TL;DR:** 6 single-purpose, read-only report functions plus 1 already-native-but-base44-transported report — isolated, low risk, zero writes. Detailed planning (deep file-level research against all 6 base44 function sources, live RLS/schema checks, and a post-approval cross-check against `master_context.md`'s Edge Function conventions) is complete; execution has not started.

**Full plan:** `Plans and Context/phase_6_implementation_plan.md` (source of truth — full per-function migration detail, exact frontend diffs, and a verification checklist split between agent-owned output checks and user-owned live-UI checks).

**Impacted files/functions (supersedes the original 8-function estimate — confirmed actual is 6 Edge Functions + 1 direct-RPC swap):** `CustomerReportModal.jsx`, `OtherChargesBreakdownReport.jsx`, `SalesAnalysisReport.jsx`, `TechnicianPerformanceReportModal.jsx`, `WorkOrderSummaryReport.jsx`, `InventoryOnOrder.jsx`, `PartsMovementReportModal.jsx`, `ReportModal.jsx` (drive-by field-name bug fix, unrelated to the migration itself — see the phase plan's Section 0.6). Base44 functions replaced: `getCustomerReportData`, `getOtherChargesBreakdown`, `getSalesAnalysisReport`, `getTechnicianPerformanceReport`, `getWorkOrderSummaryReport`, `getRealTimeInventoryOnOrder`, plus `SupabaseProxy`'s one remaining caller in this file set (`get_parts_movement_v2`, already a native RPC — just switching transport).

**Scope decisions made during planning (see the plan doc's Section 0 for full reasoning):** (1) `ReportableLeviesReport.jsx` excluded — belongs to Phase 10 (`GSTReturn`/Levies dependency). (2) `getWorkOrderSummaryReport`'s `WorkOrderStatus` entity lookup is dropped permanently, not deferred — confirmed `WorkOrder.status` already stores display text, not an opaque ID, so the lookup was already a no-op. (3) `getTechnicianPerformanceReport`'s payroll-progress-bar (`CashFlowSummary` dependency) is deferred to Phase 10 — see that phase's entry above. (4) Verification is split: the agent verifies each new function's output directly (no writes, so direct production reads are safe); the user verifies the live UI manually once `test.kensauto.ca` is repointed at the right Supabase project. (5) All 6 new Edge Functions follow this document's own documented error-handling convention (always `200`, error in the body) — a post-approval documentation cross-check caught that the plan's first draft had missed this already-established rule.

---

### Phase 7 — Inventory Module Completion [Pending]

**TL;DR:** Finish the hybrid InventoryCategory/InventoryLocation/InventoryReturn cutover, close out remaining `SupabaseProxy` calls, remove stale `InventoryTxs` imports, migrate OCR/upload integrations.

**Impacted files:** `pages/InventoryAdd.jsx`, `InventoryList.jsx`, `InventoryReturns.jsx`, `StockReorderReport.jsx`, `components/inventory/InventoryEditModal.jsx`, `ChangeSupplierModal.jsx`, `InventoryHistoryModal.jsx`, `EditInventoryTransactionModal.jsx`, `InventoryTransactionsModal.jsx`, `LegacyWarrantyReturnModal.jsx`, `ReceiveCreditModal.jsx`, `GetPartModal.jsx`, `useInventory.jsx`, `MergeInventoryModal.jsx`, `LocationModal.jsx` (`inventoryUpdate` — slated for deletion); plus removing the (functionally unused, confirmed stale) `InventoryTxs` import from `DocumentEditor.jsx:4` and `LineItemsTable.jsx:3`; `AutoReconcileModal.jsx`, `LegacyWorkOrderImportModal.jsx`, `AddLegacyInvoiceModal.jsx`, `LankarImport.jsx` (`UploadFile`/`ExtractDataFromUploadedFile`).

**Description:** Finish cutting InventoryCategory/InventoryLocation/InventoryReturn reads+writes over to their native tables. Migrate remaining generic `SupabaseProxy` calls. Delete `inventoryUpdate` once `LocationModal.jsx` is repointed. Remove the dead `InventoryTxs` import. Migrate upload/OCR calls to native Storage + Edge Function pattern (`autopro-processPartsInvoiceOCR` as template — note: unaffected by Phase 2's deletion of the unrelated `autopro-extractCartTextLLM`).

---

### Phase 8 — Banking & Cash Drawer Migration [Pending]

**TL;DR:** Highest-traffic `SupabaseProxy` cluster outside Work Orders — money movement, plus **confirmed** real schema/data migration for `CashDrawerAdjustment` and `DepositSlipBreakdown` (no Postgres table exists yet for either).

**Impacted files:** `pages/Bank.jsx`, `components/bank/BankTransferModal.jsx`, `BankTransactionModal.jsx`, `components/cash-drawer/DepositModal.jsx`, `DepositHistoryModal.jsx`, `DepositDetailsModal.jsx`, `IssuedChequesTable.jsx`, `ChequeWriter.jsx`, `pages/Reconcile.jsx`, `ReconcileReport.jsx`, `pages/CashDrawer.jsx` (direct `base44.entities.CashDrawerAdjustment`/`DepositSlipBreakdown`).

**Description:** Design and build native tables for `CashDrawerAdjustment` and `DepositSlipBreakdown` first (validate in the Phase 1 dev branch), then migrate reconciliation, deposit, cheque-writing, and transfer flows. Verification must include reconciliation-report parity checks (totals match to the cent, before vs. after).

---

### Phase 9 — Accounts Payable, Suppliers, Lines of Credit & ChartOfAccount Finish-Up [Pending]

**TL;DR:** Supplier payment processing, plus **confirmed** real schema/data migration for `LinesOfCredit`/`LinesOfCreditTransaction`/`CashFlowEntry`, alongside finishing the low-urgency ChartOfAccount cutover.

**Impacted files:** `pages/Suppliers.jsx`, `SupplierTx.jsx`, `CreditInvoice.jsx`, `components/suppliers/SupplierPaymentModal.jsx`, `SupplierForm.jsx` (direct `base44.entities.ChartOfAccount` — good starting point, low risk), `APSummaryTable.jsx` (direct `CashFlowEntry`/`LinesOfCredit`), `components/lines-of-credit/LineOfCreditPaymentModal.jsx`, `LineOfCreditTransactionModal.jsx`, `PaymentTransactionItem.jsx`.

**Description:** Start with `ChartOfAccount` cutover (lowest risk, already-migrated data). Then design native schema for `LinesOfCredit`/`LinesOfCreditTransaction`/`CashFlowEntry` and migrate AP/supplier/LOC CRUD onto it.

---

### Phase 10 — Accounting, GL Reporting, Taxes & Fiscal Periods [Pending]

**TL;DR:** GL/financial reporting reads, plus **confirmed** real schema/data migration for `GSTReturn`/`CashFlowEntry`/`CashFlowSummary`, and finishing the hybrid `FiscalPeriod` cutover.

**Impacted files:** `pages/BalanceSheet.jsx`, `GLAcct.jsx`, `GLJournal.jsx`, `GeneralLedger.jsx`, `PLReport.jsx`, `FinancialDashboard.jsx`, `CashFlowTrendTab.jsx`, `pages/Taxes.jsx` (direct `GSTReturn`), `pages/CashFlow.jsx` (direct `CashFlowEntry`/`CashFlowSummary`), `ReportableLeviesReport.jsx`, `components/taxes/MarkPaidModal.jsx`.

**Carried over from Phase 6:** once `CashFlowSummary` has a native table, restore the "Monthly Payroll Target vs Labour Sales" progress bar in `components/reports/TechnicianPerformanceReportModal.jsx` (currently hidden client-side) and its backing calc in `supabase/functions/autopro-getTechnicianPerformanceReport` (has a `TODO(Phase 10)` comment pointing at the original logic in `base44/functions/getTechnicianPerformanceReport/entry.ts` lines 396–420). Not verified as part of Phase 6 — needs its own verification pass here.

**Description:** Migrate reporting reads first (lower risk), then design native schema for `GSTReturn`/`CashFlowEntry`/`CashFlowSummary` and migrate their CRUD. Finish the `FiscalPeriod` hybrid cutover alongside. **Do not modify** the already-native GL posting functions.

---

### Phase 11 — Payroll [Pending]

**TL;DR:** Smaller module, but confirmed to include real schema/data migration for `PayrollTransaction`.

**Impacted files:** `pages/Payroll.jsx`, `components/payroll/AddAdjustmentModal.jsx`, `AddPaychequeModal.jsx`, `AddRemittanceModal.jsx` (`parsePayrollFile`), `MarkPaidModal.jsx`.

**Description:** Design native `PayrollTransaction` schema, migrate payroll transaction/ledger CRUD, and migrate the payroll-file-parsing function.

---

### Phase 12 — Appointment Module Completion [Pending]

**TL;DR:** Finish the transition already scoped in `appointment_implementation_plan.md`, adjusted for what's changed since it was drafted.

**Impacted files:** `src/pages/Schedule.jsx`, `components/appointments/AppointmentForm.jsx`, `EditApptViaWoModal.jsx`, and other scheduling-related components.

**Description:** The existing plan proposes a target `Appointment` schema (FK to `WorkOrder`/`Employee`/`Customer`/`Vehicle`, reminders fields, `status`/`bay` columns) — this part is in scope. **Not in scope:** the plan's three proposed workflow features (Unbilled Appointments queue, Project-status calendar indicator, automated status cascade) — unsolicited AI suggestions, not requested, not to be built. Before drafting this phase's detailed plan: confirm (a) whether the proposed schema is live today or still target-state, and (b) whether the title→notes data-migration script was run (the `title` column still exists in the DB — the UI removal and the data migration are two separate steps, only the first confirmed done).

---

### Phase 13 — Work Orders Core [Pending]

**TL;DR:** The remaining broad WO workflow (`DocumentEditor.jsx` and friends) — still the highest blast-radius module, sequenced after Inventory (7), Appointment (12), PartsTech Removal (2), and WorkPRO (4).

**Impacted files:** `components/work-orders/DocumentEditor.jsx` (8+ distinct Base44 function calls — the single biggest offender in the app), `hooks/useDocumentEditorSave.jsx`, `FindPartModal.jsx`, `WorkOrderPdfModal.jsx`, `ROApprovalsModal.jsx`, `SESEmailModal.jsx`, `pages/WorkOrders.jsx`, `InvoiceConversion.jsx`, `CreditInvoice.jsx`.

**Removed from scope (delete, don't migrate):** `components/work-orders/KanbanBoard.jsx` and its `updateWorkOrderStatus` Base44 call — confirmed unused. Delete outright; also check `pages/WorkOrders.jsx` for any remaining references/imports to the Kanban view and remove them.

**Description:** Standard WO CRUD/workflow calls not already covered by Phases 4 or 5. Requires the most thorough QA pass of any phase: full WO lifecycle (create → estimate → line items → parts → convert to invoice → payment → GL posting) regression-tested. **Do not run concurrently with Phase 4 or Phase 2** — file overlap in work-orders components.

---

### Phase 14 — Setup, Admin, Lankar Import & Final Sunset [Pending]

**TL;DR:** Long-tail admin/import tooling, then remove Base44 entirely from the codebase. (Electron cart-scraping cleanup moved to Phase 2 — no longer part of this phase.)

**Impacted files:** `pages/Admin.jsx`, `Setup.jsx` (`backupToGoogleDrive` — note: the "Download PartsTech Bridge" button on this same page is removed earlier, in Phase 2), `components/setup/SalesClassManager.jsx`, `RestoreBackupModal.jsx`, `pages/LankarImport.jsx`, `LegacyWorkOrderImportModal.jsx`, `AddLegacyInvoiceModal.jsx`; then repo-wide: `src/api/base44Client.js`, `src/api/entities.js` and `src/api/integrations.js` (already dead code), `vite.config.js`, `package.json` (`@base44/sdk`, `@base44/vite-plugin`), `supabase/functions/base44-proxy/`, the `base44/` directory (129 functions + entity schemas), `.env` (Base44 vars — your call on removal timing).

**Description:** Finish long-tail tooling, then a final repo-wide `base44` grep as the go/no-go gate before deleting dependencies, the proxy function, and the legacy tree.

---

## 6) Verification Plan

You can use the webview accessing the dev-login with the Test Employee. Username/email: test@kensauto.ca and Password: Test123. This only accesses the test database (development branch of supabase) so I am ok with including those credentials here.

| Phase | Verification Criteria |
|---|---|
| 1 | Dev branch schema matches production; a smoke-test write in dev never touches prod; all Edge Functions + secrets present and callable on the branch; static reference tables seeded and correct. |
| 2 | Repo-wide grep for `partstech`/`prolink`/`OnlineOrder` (case-insensitive) returns zero hits outside this phase's own commit history; `WorkOrderForm.jsx`/`LineItemsTable.jsx` still function normally for every non-PartsTech context-menu action; `autopro-processPartsInvoiceOCR` still works (confirms `GEMINI_API_KEY` untouched); confirm `PartsTechCart` doesn't exist in production. |
| 3 | Session/role behavior identical pre/post across 5+ spot-checked pages; existing users' preference values migrated correctly — spot-check several Employee records before/after. |
| 4 | Tech time logging and WO↔Project pairing behave identically; `archiveWorkOrderProjects` output matches pre-migration behavior. |
| 5 | Create/edit/merge Customer and Vehicle; `searchCustomers`/`searchVehicles` results match pre-migration output for identical queries. |
| 6 | Zero writes, so agent verifies each new Edge Function's output directly (invoke with identical inputs, diff JSON against the pre-migration base44 response) without needing the UI; user separately verifies the live UI once `test.kensauto.ca` is repointed at the right Supabase project. See `phase_6_implementation_plan.md` Section 4 for the full split. |
| 7 | Full inventory receive → adjust QOH → return → merge cycle; Category/Location/Return CRUD confirmed hitting native tables; OCR/upload tested with a real sample file. |
| 8 | New `CashDrawerAdjustment`/`DepositSlipBreakdown` tables validated in dev first; bank reconciliation run twice (old vs. new path) — totals match to the cent; deposit slip/cheque PDFs generate identically. |
| 9 | New `LinesOfCredit`/`LinesOfCreditTransaction`/`CashFlowEntry` tables validated in dev first; process a real supplier payment and LOC payment in dev; GL postings unaffected; ChartOfAccount reads confirmed native. |
| 10 | New `GSTReturn`/`CashFlowEntry`/`CashFlowSummary` tables validated in dev first; Balance Sheet/P&L/GL Journal identical pre/post; GST calculation matches a manually-verified figure; zero new GL imbalances; FiscalPeriod cutover confirmed complete. |
| 11 | New `PayrollTransaction` table validated in dev first; process a payroll batch in dev; ledger entries and bank-balance impact match expected figures. |
| 12 | Create/edit/cancel appointment round-trips match pre-migration behavior; confirm title→notes migration script ran. No verification needed for the Unbilled Appointments queue/Project indicator/status cascade — explicitly out of scope. |
| 13 | Full WO lifecycle regression: create → line items/parts → estimate → convert to invoice → payment → GL entries unaffected → inventory QOH correct → tech time still logs correctly; confirm Kanban board fully removed with no dangling imports. |
| 14 | Repo-wide `base44` grep returns zero hits in `src/`; app builds and runs with `@base44/sdk`/`@base44/vite-plugin` removed; smoke-test every top-level page once after final dependency removal. |

---

## 7) Lessons Learned & Context

*(Running log, carried forward into future blueprints.)*

- **2026-08-02:** Prior "Phase 1/2" work (informal, another agent/session) = Supabase auth setup, Vercel hosting, and establishing `InventoryAuditLog` as the authoritative inventory movement mechanism. Never tracked as a formal phased blueprint — this is the first one, and phase numbering restarts at 1 rather than continuing from an unlabeled prior effort.
- **2026-08-02:** A `base44.functions.invoke(...)` call site does **not** automatically mean the underlying data is still Base44-dependent — several "proxy" functions (`supabaseCustomer`, `supabaseVehicle`, etc.) are just thin forwarders to Postgres. Always confirm actual entity/table status with the user directly rather than inferring from call-site patterns alone — and once confirmed, treat it as settled (don't re-litigate per phase).
- **2026-08-02:** WorkPRO is a distinct sister application (technician-facing: project tracking, WO pairing, time tracking), not a module of AutoPRO — but shares the same Supabase project and is already 100% natively migrated.
- **2026-08-02:** Local development is structurally impossible for this app due to a same-origin authentication requirement — all testing must happen via a hosted deployment, not localhost.
- **2026-08-02:** Supabase native Branching does not automatically sync schema when the schema itself was never committed to git as tracked migrations — and does not carry over Edge Function secrets even when schema/functions are synced. Both need an explicit step. Also: ephemeral (non-persistent) branches reseed from scratch on every resync, losing manual changes — flip to `--persistent` before doing any manual setup work on one.
- **2026-08-02:** Commit titles and even prior AI-authored plans can undersell scope or go stale — e.g. `appointment_implementation_plan.md`'s proposed UI change (drop `title` field) landed, but the underlying DB migration script's execution status wasn't confirmed just because the UI shipped. Verify actual state, don't assume a linked plan was executed in full just because part of it visibly happened.
- **2026-08-02:** This initiative is executed by multiple agents in parallel (Claude Code + Antigravity) under the user's direction/review. Phase scoping explicitly accounts for file overlap between phases so concurrent execution doesn't produce conflicting edits (see Section 5 coordination map).
- **2026-08-02:** Dead/unused UI (e.g. `KanbanBoard.jsx`) discovered mid-planning should be deleted outright during its phase, not migrated — always ask rather than assume a component found in a base44-usage grep is still live.
- **2026-08-02 (Phase 1, Supabase connector):** A manual, table-by-table schema copy (no CLI/Docker) looked complete but silently left the dev branch's RLS in a worse state than production — every copied table had RLS *enabled* with zero policies, which blocks all frontend access without throwing an obvious error. When any table gets copied/created manually outside of full `pg_dump`, explicitly check `pg_policies` count, don't assume "table exists" means "table is usable." A missing central table (`WorkOrder`, in this case) can also slip through a manual copy pass without being noticed until something breaks — worth a table-count/table-diff check against production early, not late.
- **2026-08-02 (Phase 1, Supabase connector):** Found two production triggers with a live JWT hardcoded directly in the trigger definition (not just `.env`), calling external webhooks. When restoring/replicating database objects (triggers especially) from production to a dev/sandbox environment, always read the full definition first — don't copy verbatim — since some objects carry live credentials or point at production-only external systems that shouldn't fire from a sandbox.
- **2026-08-02 (Phase 1, Supabase connector):** Once a genuinely capable tool (direct SQL execution against both prod and dev, safely) becomes available, it's worth immediately re-verifying assumptions made via weaker tooling (CLI-only metadata, like migration-tracking status) rather than trusting them going forward — the `PartsTechCart` "never applied to production" conclusion from `supabase migration list` turned out to be about migration *tracking*, not the table's actual existence (confirmed the table did exist in production once direct queries were possible).
- **2026-08-02 (Phase 1, structural finding):** Pointing Vercel's dev environment at the dev Supabase branch does **not** isolate the app from production, because `VITE_BASE44_BACKEND_URL`/`VITE_BASE44_PROXY_URL` are hardcoded to production's project ref and completely independent of `VITE_SUPABASE_URL`. Every still-base44-routed call (the majority of the app, pre-migration) keeps hitting production regardless of environment — proven by the fact that dev's operational tables were confirmed empty (0 rows) yet the dev-connected app showed real data. No config fix exists; this is exactly the gap each phase closes as it migrates its own calls off `base44.*`. Standing rule going forward: read-only exploration of a not-yet-migrated feature on "dev" is safe, but **never write-test a feature before its phase has actually landed** — an earlier verification suggestion ("edit a SalesClass description as a harmless test") was itself wrong for this exact reason, since `SalesClassManager.jsx` is still `SupabaseProxy`-routed. Every future phase's verification steps need to confirm writes land in the dev branch's own tables (checkable directly via the Supabase connector), not just that a page loads without error.
- **2026-08-02:** A linked planning doc written by a different AI agent (`appointment_implementation_plan.md`) mixed actual agreed-upon scope (the schema) with unsolicited feature suggestions (Unbilled Appointments queue, Project indicator, status cascade) that the user never asked for or wanted adopted. When folding a prior AI-authored doc into a phase, don't assume everything in it is approved scope.
- **2026-08-02 (v4):** A user-reported concern ("two WorkOrderForm.jsx files exist") turned out to already be resolved by a recent commit (`019a26c2`) the user may not have had front-of-mind. Always check current git history/state before scoping a cleanup task someone flags from memory — the fix might already be shipped, and confirming that outright (rather than silently re-doing it) saves a wasted phase-planning cycle.
- **2026-08-02 (v4, corrected 2026-08-02 during Phase 2 execution):** A "dangling" migration file (tracked locally, never applied to production) that looked like a loose end to clean up turned out to be for a feature the user wanted deleted entirely (`PartsTechCart`). **Correction to the original entry:** this did *not* make the fix "trivial" as first assumed — the table turned out to genuinely exist in production (confirmed via direct connector query during Phase 1), so Phase 2 still needed a real `DROP TABLE`, just executed by the user directly rather than via a migration. The durable lesson stands even though the specific conclusion was initially wrong: check whether an unresolved migration belongs to a feature about to be removed before spending effort on how to "correctly" apply it — but always verify live database state directly rather than trusting migration-tracking metadata alone (see the Phase 1 Supabase-connector entries above).
- **2026-08-02 (v4):** When a feature cluster spans many unrelated-looking surfaces (a React modal, edge functions, a browser extension directory, an Electron protocol handler, and a dashboard download button), a single "delete this feature" request needs a full-codebase footprint search before scoping — the blast radius is rarely just the one file the user names first.
- **2026-08-02 (Phase 1 execution):** Manually copying full schema table-by-table via the Dashboard (no CLI/Docker available) proved hard enough that foreign keys and SQL functions/triggers got stripped to get unblocked — a reasonable trade, not a mistake. Lesson for later phases doing real schema design (8, 9, 10, 11 — the confirmed-Base44-only entities): don't expect the dev branch to have full FK/trigger parity with production by default; restore functions **on-demand as testing surfaces missing ones**, not as an upfront completeness pass — trying to reconstruct everything before starting to test is the trap that made this step feel harder than it needed to be. Also: some gaps are silent, not error-throwing (e.g. a missing trigger just skips its side effect instead of failing) — when designing verification steps for a new phase, explicitly call out which dependencies would fail loudly vs. quietly if missing, so testers know what to double-check by hand.
- **2026-08-03 (Phase 1, closing out):** Phase 1 reached "Tested" status once the dev branch had full schema, RLS policies, all 39 SQL functions, safe triggers, an `ensure_rls` event trigger, all 19 Edge Functions, Base44 secrets, and the 4 static reference tables in place, and the Vercel Development environment was confirmed pointed at it. The remaining gap (base44-routed calls still hitting production regardless of environment) is expected, documented, and does not block Phase 1 sign-off — it's the reason the rest of this blueprint exists, not a Phase 1 defect.
- **2026-08-03 (Phase 2 execution):** Deep, file-level research before writing the phase plan (exact line numbers and current content for every target file, not just a prior high-level survey) meant execution matched the plan exactly with zero surprises — every deletion and every edit landed on the first pass, verified clean via build + repo-wide grep + connector queries against both environments. Worth continuing this depth of pre-execution research for every future phase plan, especially ones with more files in play (Phase 13 especially).
- **2026-08-03 (Phase 2 execution):** When deleting a feature's Edge Functions, remember source-code deletion and live-deployment removal are two separate steps across *two* Supabase environments (production + dev branch) — `supabase functions delete <slug> --project-ref <ref>` must run once per function per environment. Confirmed via connector afterward that all 3 functions were fully gone from both.
- **2026-08-03 (Phase 2 execution):** When editing a file for one specific removal (e.g. `Setup.jsx`'s PartsTech button), check whether any icon/import it uses is shared with unrelated code nearby before touching the import line — `Download` from `lucide-react` was also used by a neighboring, unrelated button. Verified via grep before editing; left the import alone.
- **2026-08-03 (Phase 2 execution, project context for later phases):** The "Quoted (Not Ordered)" badge in `LineItemsTable.jsx` (~line 542) was intentionally left in place, not removed alongside the PartsTech context-menu items it used to pair with — user has a **future implementation** planned for it that will key off a `qtyquoted` value in the line item's JSON instead of the current `not_ordered` boolean. Relevant context for whoever scopes Phase 13 (Work Orders Core), since that phase will also be in this file.
- **2026-08-03 (Phase 2 execution):** `Google-Contacts-Sync` (the untracked edge function tied to the hardcoded-JWT trigger from Phase 1's findings, see Section 0 item 5) is still live and unaddressed — re-confirmed via `list_edge_functions` during Phase 2's verification pass. Still an open, unscoped item, not part of any phase yet.
- **2026-08-03 (Phase 3 verification, major structural finding):** **Supabase branches have a fully independent Auth service from their parent project — separate JWT signing keys, separate `auth.users` — confirmed by direct testing, not documentation alone.** A session issued by production's SSO login (`my.kensauto.ca`, `alg: ES256`) is rejected outright by the dev branch's own PostgREST (`PGRST301: No suitable key was found to decode the JWT`) when calling a direct `supabase.from()` table. This is the mechanism behind the already-known "Section 0 item 5 / Risk #14" finding, now proven at the JWT level rather than inferred from empty tables. **It cuts both directions**: a session issued *by* the dev branch (via a native `auth.users` account created directly on the branch) is equally rejected by `base44-proxy` — confirmed by reading its source: the function is deployed on production, uses production's own `SUPABASE_URL`/`SUPABASE_ANON_KEY` to call `supabase.auth.getUser(token)`, and separately looks up `Employee.autopro_user_id` in **production's** `Employee` table — so it can only ever authenticate a production-issued session, never a dev-branch one, regardless of any frontend env var. **Standing implication for every remaining phase:** there is no session that can authenticate against both a Supabase branch's own tables *and* `base44-proxy` at the same time. Testing an already-migrated direct-`supabase.from()` feature needs a dev-branch-native session; testing anything still `base44.*`-routed needs a production session — these are two different logins, not two settings on one login.
- **2026-08-03 (Phase 3 verification):** Built a standing workaround for the above: a flag-gated `/dev-login` route (`src/lib/DevLogin.jsx`, gated by `VITE_ENABLE_DEV_LOGIN`, set only in the environment scope that already carries the dev-branch `VITE_SUPABASE_URL`) that calls `supabase.auth.signInWithPassword()` directly against whatever project the build is configured for, bypassing the `my.kensauto.ca` SSO redirect entirely. Paired with linking the dev branch's own `Employee` row to a native `auth.users` account created directly on that branch (not mirrored from production). **Scope of what this actually unblocks: only already-migrated, direct-`supabase.from()` features** (exactly Phase 3's scope) — it does not and cannot make `base44.*`-routed features (the majority of the app, pre-migration) work, since those still require a production session per the finding above. Confirmed live during Phase 3 verification: `SalesClass`/`ChartOfAccount`/WorkPRO clock-in all correctly failed under the dev-login session, for this exact reason, not due to any new bug. **This route is reusable, standing test infrastructure — every future phase's manual verification should use it** for whatever that phase migrates, and its value only grows as more of the app moves off `base44.*`.
- **2026-08-03 (Phase 3 verification):** `npm run build` succeeding does **not** guarantee no runtime errors — a bare, undefined JS identifier reference (`currentUser={user}` where `user` was never declared) passed Vite/esbuild's build step cleanly because bundlers check syntax, not variable scope; the `ReferenceError` only threw at actual render time in a browser. Phase 3's own checklist listed "`npm run build` clean" as a checkbox, which was necessary but not sufficient — future phases' verification plans should treat a clean build as confirming no syntax/import errors only, never as a substitute for actually exercising the changed UI.
- **2026-08-03 (Phase 3 verification):** Distinguish **data bugs** from **code bugs** when a migrated field-gated feature doesn't work as expected. The executive Accounting menu appeared broken (`autopro_access_lvl === 'lvl3_user'` gate never matching) — the code was correct throughout; the dev branch's hand-entered test value was the string `'lvl3'`, not the full `'lvl3_user'` enum value the app (and the original `base44/entities/User.jsonc` schema) actually uses. When manually seeding test data for any field that mirrors a former Base44 entity's enum, check the original `base44/entities/*.jsonc` definition for the exact string values first, rather than assuming a shorthand will match.
- **2026-08-03 (Phase 3 verification, silent-failure pattern, echoes the Phase 1 entry above):** `AuthContext.jsx`'s `Employee` fetch discarded its Supabase `error` entirely (`const { data } = await supabase.from(...)`), so any failure — wrong project, RLS denial, network issue — silently produced the same "no employee" UI state as a legitimately-missing row, with zero console trace. This is what made the original nav-bar symptom take real investigation instead of a five-second console check. Added logging (additive only). **General rule going forward: any Supabase call whose failure mode degrades to a plausible-looking "empty" UI state should log its `error`, not just its `data`** — silent degradation is far more expensive to debug than a console line.
- **2026-08-03 (Phase 4 planning):** **Audit fields don't populate themselves once a server-side proxy is removed.** `workProProxy`'s server function auto-filled `created_date`/`created_by`/`created_by_id` on every `create` call server-side. Confirmed via `information_schema` that `TimeRecord`/`Project`/`ProjectTimeSession`/`UnassignedTime` have **no column defaults** on `id`, `created_date`, or `updated_date`, and **no triggers at all** on any of the 5 WorkPRO-adjacent tables. Any phase that replaces a proxy/function layer with a direct `supabase.from()` call must explicitly carry forward whatever audit-field population that layer used to do for free — don't assume a migrated table will "just work" the same way; check `information_schema.columns` (defaults) and `information_schema.triggers` for the target table before writing the new insert/update, and set every audit field the old path used to set. General rule for every future phase, not just this one.
- **2026-08-03 (Phase 4 planning):** **A component appearing in a prior phase's field-census/checklist doesn't mean it's actually reachable.** `TimeRecordsView.jsx` had its Phase 3 field mapping dutifully fixed (per that phase's checklist) and still shipped with one leftover stale reference (`access_level` instead of `autopro_access_lvl`) — turns out the whole component has zero importers anywhere in `src/`, not even `pages.config.js`. Nobody could have hit that bug because nobody can reach the component at all. Before fixing a bug *or* migrating a call site inside a component, grep for who actually renders it — orphaned components should be surfaced as a "delete or wire up?" question, not silently fixed/migrated as if they were live.
- **2026-08-03 (Phase 4 planning, standing rule for every remaining phase):** **Leave the `base44/` source directory and any still-live Base44-platform deployments alone until Phase 14, even once a phase fully stops calling into them.** Confirmed with the user: individual phases should migrate call sites onto native replacements and stop *calling* `base44.*`, but should not delete anything under `base44/functions/`, `base44/entities/`, or de-provision anything on Base44's own platform as they go — that full sweep is reserved for Phase 14 specifically so there's one confirmed go/no-go gate (a repo-wide `base44` grep returning zero live call sites) before anything is actually stripped, rather than piecemeal deletions whose safety gets harder to re-verify later. This does **not** apply to already-native `supabase/functions/autopro-*` functions this migration itself created and later finds redundant (e.g. Phase 4 deleting its own now-unused `autopro-getProjectTimeSessions`) — those are fair game to delete immediately once confirmed dark; the hold is specifically on the legacy `base44/` tree and Base44's own hosted platform.
- **2026-08-03 (Phase 4 planning):** **A deployed, `ACTIVE` Edge Function is not proof it's ever been successfully called.** `supabase/functions/autopro-getProjectTimeSessions` is live on production (`list_edge_functions` confirms `status: ACTIVE`) but has zero real frontend callers — a prior attempt to wire it into `TechTimeModal.jsx` apparently didn't work, and was quietly replaced with a direct `supabase.from('ProjectTimeSession')` call instead (which does work, and is already the Phase-4-desired end state for this exact case). Check actual call sites (grep the frontend), not just deployment status, before assuming a native-looking function is the thing actually running — and when a direct-call workaround already exists and already satisfies the migration policy, deleting the unused function is very likely simpler than debugging it back to life.
- **2026-08-03 (Phase 3 verification, direct input for Phase 4):** Read `base44/functions/workProProxy/entry.ts` in full while diagnosing the WorkPRO clock button. It's not a simple proxy — it's a **Base44-hosted** Deno function (runs on Base44's own infrastructure, not a Supabase Edge Function) that itself calls `base44.auth.me()` for identity, then opens its **own** separate Supabase client using Base44-platform-specific secrets (`Supabase_project_url`/`Supabase_Secret_Key`, distinct naming from Supabase's own auto-injected vars) with the **service role key**, bypassing RLS entirely, to do generic `supabase.from(table)` CRUD. Confirmed real hop chain for every WorkPRO call today: Frontend → `base44` SDK → `base44-proxy` (Supabase Edge Fn, production-only per the finding above) → Base44 SaaS → this Base44-hosted function → Postgres (service role, target project unconfirmed but almost certainly hardcoded, not branch-aware). Direct relevance for Phase 4: the underlying tables (`Employee`, `TimeRecord`, `Project`, etc.) are already native and RLS-capable — the entire multi-hop chain exists only for historical reasons and can likely collapse to a single `supabase.from()` call per site, exactly as Phase 4 already proposed, now with the mechanism confirmed rather than assumed.
- **2026-08-03 (Phase 4 verification):** **Don't blindly carry every field from an old proxy's params object into a new direct `.insert()` — verify each target column actually exists first.** `GlobalClockInModal.jsx`'s old `workProProxy` call sent both `user_name` and `employee_name` to `UnassignedTime`; the migrated direct insert copied both, but `UnassignedTime` only has `user_name` (its sibling table `TimeRecord` uses `employee_name` instead — the two WorkPRO tables aren't field-consistent with each other). This passed code review and `npm run build` cleanly and only surfaced as a live Postgres `PGRST204`/schema-cache error during UI verification. General rule: check `information_schema.columns` for the actual target table before writing a migrated insert/update, don't assume sibling tables in the same feature share a naming convention.
- **2026-08-03 (Phase 4 verification):** **Dev-branch column types can silently diverge from production in ways that only surface on specific input values.** `Employee.pay_rate` is `bigint` on the dev branch — whole-dollar test writes (`$25`, `$35`) never revealed this, but a decimal value (`27.50`) failed with `22P02 invalid input syntax for type bigint`. Confirmed pre-existing (not introduced by Phase 4's code) and out of this phase's scope to fix, but flagged for whichever future phase next touches pay-rate or other money/rate fields (Payroll especially, Phase 11) to check column types explicitly rather than assume dev/production numeric-type parity.
- **2026-08-03 (Phase 4 verification, reusable technique):** **The dev branch's `auth.users` password can be reset directly via SQL when the actual `/dev-login` credential isn't known**, using pgcrypto: `update auth.users set encrypted_password = crypt('<temp-password>', gen_salt('bf')) where email = '<test-account-email>'`. Safe specifically because Supabase branches have a fully independent Auth service from production (confirmed in Phase 3's lessons above) — this can never touch a production credential. Used to unblock live UI verification this phase; reusable for every future phase's manual verification pass.
- **2026-08-03 (Phase 4 verification, tooling gap):** **No MCP tool exists for deleting a Supabase Edge Function** (only deploy/list/get) — use the Supabase CLI directly instead: `supabase functions delete <slug> --project-ref <project-ref>`, once per function per environment (same "two separate steps across two environments" pattern as Phase 2's deletion lesson above). The CLI was already authenticated in this environment (`supabase projects list` succeeded without a fresh login).
- **2026-08-03 (Phase 4 verification, browser-tooling gotcha):** **The agent's browser tool cannot navigate to a self-signed-HTTPS local dev server** (this project's `vite.config.js` uses the `basicSsl` plugin) — `navigate` fails with a bare "denied or failed" and no certificate-override option. Workaround: temporarily comment out `basicSsl()` in `vite.config.js` and point the dev server at `http://localhost:<port>` instead of `https://`, run the verification pass, then revert both changes immediately after. Worth remembering for any future phase planning to do live browser-driven verification rather than direct-query verification.
- **2026-08-03 (Phase 4 verification, testability boundary):** **A fully-migrated component can still be unreachable via `/dev-login` UI click-through if its *parent* component is still base44-routed.** `GlobalClockInModal.jsx` (fully migrated this phase) is only opened from `TechClockStatusModal.jsx`'s tech-row click handler, and that parent still calls base44's `Employee.filter()` (out of Phase 4's scope), which 401s under a dev-login session — so the tech list never loads far enough to click into the migrated modal. This is not a Phase 4 defect, just a known verification-coverage gap: when this happens, replicate the exact migrated insert/update calls directly (e.g. via the browser's JS console against the same authenticated `supabase` client) rather than treating the component as unverified. Worth checking for this same pattern (migrated child, unmigrated parent) in any future phase.
