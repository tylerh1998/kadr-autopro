# Master Blueprint: Base44 Deprecation

**Status:** APPROVED (pending v3 read-through) — ready to move into Phase 1 detailed planning
**Prepared:** 2026-08-02 (v1), revised 2026-08-02 (v2, v3)
**Baseline commit:** `4ba05162` (development branch)

> **Numbering note:** Phase numbering restarts at **Phase 1** for this initiative (prior Base44-adjacent work by earlier sessions was informal/untracked, not a labeled "Phase 1/2"). Sub-phase numbers (`1.1`, `1.2`, ...) are reserved for when an individual phase gets its own detailed phase plan.

---

## 0) Open Questions, Info Requirements & Suggestions

All blocking items from v2 are resolved. What remains is lightweight:

1. **Resolved — dev environment approach.** Your Supabase dev branch is native Branching; it didn't sync because the schema was never tracked in git (no real migration history in `supabase/migrations/`). Agreed approach for Phase 1 (below): migrate schema + functions over first, then seed only the static/reference tables you named (`InventoryCategory`, `ChartOfAccount`, `BankAccount`, `FiscalPeriod`, `SalesClass`) rather than a full data clone, keeping dev compute/cost down.

2. **Resolved — entity status.** `FiscalPeriod` moves to the **hybrid** bucket (table exists, transition in progress), not "unconfirmed." Every other entity previously marked "unconfirmed" is now **confirmed Base44-only** — no Postgres table exists yet for: `CashFlowEntry`, `CashFlowSummary`, `GSTReturn`, `LinesOfCredit`, `LinesOfCreditTransaction`, `CashDrawerAdjustment`, `DepositSlipBreakdown`, `SystemSettings`, `PayrollTransaction`, `Levies`, `OtherChargeList`, `TagAlong`, `WorkOrderStatus`, `ReturnReason`, `Statement`, `SentEmailLog`, `RealtimeSignal`, `CustomerPortalWorkOrder`. This is a real scope increase for Phases 7–10 (Section 3 and 4 updated accordingly — these are no longer "check first," they're confirmed schema-design-and-data-migration work).

3. **Resolved — Appointment plan found.** `appointment_implementation_plan.md` now exists at repo root; read in full and folded into Phase 11 below. Two things have changed since it was drafted: the scheduling module now has a dark-mode-compatible view, and the `title` field was removed from the UI (the column still exists in the database — the plan's proposed title→notes consolidation migration script has not been confirmed as run).

4. **Standing permission granted** — I'll draft `master_context.md` additions directly into the file whenever something load-bearing surfaces, for your review (no need to ask each time). Done this round: added a WorkPRO sister-app clarification, a "local dev is impossible" rule, and replaced the stale Phase-3-labeled roadmap bullet with a pointer to this document.

5. **New, non-blocking — Phase 12 scope reduction.** You flagged that `KanbanBoard.jsx` is no longer in use. It's removed from Phase 12's migration scope below — since it's dead code, the right move is deleting it outright (and its `updateWorkOrderStatus` Base44 call along with it) rather than porting it to a native call.

6. **New, non-blocking — schema drafting for confirmed-Base44-only entities.** You had someone draft a target Postgres schema for `Appointment` already (in `appointment_implementation_plan.md`). Do you have similar drafts for any of the entities newly confirmed as needing real migration in Phases 7–10 (`LinesOfCredit`, `GSTReturn`, `CashFlowEntry`, `CashDrawerAdjustment`, `PayrollTransaction`, etc.), or should schema design for those start from scratch (mirroring the relevant `base44/entities/*.jsonc` field definitions) as part of each phase's detailed plan?

---

## Practical answer: Phase 1 — dev branch schema/function sync + Vercel secrets

Since you asked directly: once schema + functions are on the dev branch, updating Vercel is **necessary but not sufficient** — two separate systems hold secrets, and it's an easy thing to miss half of:

- **Vercel** (Development environment scope in the dashboard) holds the *frontend-facing* values: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, and any `VITE_BASE44_*` vars still in play. Update these to the dev branch's project URL/anon key so Preview deployments on the `development` git branch talk to the dev backend instead of production.
- **Supabase itself** holds the *server-side* Edge Function secrets (`BASE44_ACCESS_TOKEN`, `PARTSTECH_API_KEY`, any Resend/email keys, `Supabase_Secret_Key`, etc.) — these live per-project/per-branch via `supabase secrets set`, not in Vercel. Native Branching does not automatically carry secrets over from production, so this needs a separate pass. Some (third-party sandbox keys) may be safe to share between prod and dev; anything with write access to real data should get a distinct dev-only value where the provider supports it.

Rough sequence for Phase 1's detailed plan: (a) since schema isn't tracked in git, pull it once (`supabase db pull` against production to generate baseline migration files, or an equivalent schema dump) and commit it so the branch can apply it via migration replay; (b) deploy the 17+ `autopro-*` functions to the branch; (c) set branch-specific secrets; (d) seed just the five static/reference tables you named with real data (small, non-sensitive, low-churn — good for keeping dev relevant without full data volume); (e) update the two Vercel Development-environment Supabase vars. I'll turn this into a full step-by-step phase plan when we get there.

---

## 1) Objectives

**TL;DR:** AutoPro still round-trips through the legacy Base44 SaaS platform for a large share of its backend calls (279 `base44.functions.invoke` sites, 122 of them the generic `SupabaseProxy` CRUD shim, across 129 files), even though a good portion of the underlying data already lives in your own Supabase Postgres project. The goal is to finish cutting every remaining thread back to Base44 — function calls, entity CRUD, auth, file/OCR integrations — module by module, then delete the Base44 SDK, the `base44-proxy` bridge function, and the legacy `base44/` function tree.

**What's actually left, now that entity status is fully confirmed:**
- **Fully native already** (transport-layer cleanup only): Customer, Vehicle, GLTransaction, all WorkPRO tables.
- **Hybrid** (table + data migrated, CRUD not fully cut over): Appointment, ChartOfAccount, InventoryCategory, InventoryLocation, InventoryReturn, FiscalPeriod.
- **Confirmed still Base44-only** (real schema design + data migration required, not just a rewire): `CashFlowEntry`, `CashFlowSummary`, `GSTReturn`, `LinesOfCredit`, `LinesOfCreditTransaction`, `CashDrawerAdjustment`, `DepositSlipBreakdown`, `SystemSettings`, `PayrollTransaction`, `Levies`, `OtherChargeList`, `TagAlong`, `WorkOrderStatus`, `ReturnReason`, `Statement`, `SentEmailLog`, `RealtimeSignal`, `CustomerPortalWorkOrder`.

**Migration policy (confirmed):**
- **Thin proxies / simple lookups & CRUD** → migrate directly to `supabase.from()` calls from the frontend (or a very thin native RPC), no intermediate function needed.
- **Complex functions** (real business logic — GL posting, multi-step calculations, cross-table orchestration) → get a proper **1:1 native Edge Function replacement** (`autopro-*`), not a direct frontend call.
- **Confirmed Base44-only entities** → need actual Postgres schema design (mirroring the `base44/entities/*.jsonc` definitions, following the FK/timestamp/default patterns established in `appointment_implementation_plan.md`) before any CRUD migration can happen.

**Architecture shift (plain-text diagram):**

```
BEFORE
------
React Frontend
   |
   |-- base44.functions.invoke('SupabaseProxy', ...) ---------> base44-proxy (Edge Fn) --> Base44 SaaS --> Postgres
   |        122 calls / 51 files, generic CRUD shim
   |
   |-- base44.functions.invoke('supabaseCustomer' etc.) -------> base44-proxy (Edge Fn) --> Base44 SaaS
   |        ~35 dedicated proxy functions                            (these ones just forward to Postgres
   |                                                                   with a service key -- data is already yours)
   |
   |-- base44.entities.X  (13 sites / 12 files) ----------------> Base44 SaaS's OWN database (confirmed:
   |                                                                17 of these entities have NO Postgres
   |                                                                table yet -- real migration required)
   |
   |-- base44.auth.me() / updateMe()  (27 sites) ----------------> Base44 SaaS auth
   |
   `-- supabase.functions.invoke('autopro-*')  (12 fns, already migrated) --> Postgres  [already native]

AFTER (target end state)
-------------------------
React Frontend
   |
   |-- supabase.auth.getUser()  ----------------------------------> Supabase Auth
   |-- supabase.functions.invoke('autopro-*')  (complex logic) ---> autopro-* Edge Functions --> Postgres
   `-- supabase.from(...) direct  (thin CRUD, RLS-guarded) --------> Postgres directly

   base44Client.js, base44-proxy Edge Fn, base44/ directory,
   @base44/sdk, @base44/vite-plugin  ==>  ALL DELETED
```

**Goals:**
1. Zero remaining `base44.*` imports anywhere in `src/`.
2. Zero remaining `base44/functions/*` and `base44/entities/*` files still receiving live traffic — delete the tree once confirmed dark.
3. `@base44/sdk`, `@base44/vite-plugin` removed from `package.json`; base44 plugin block removed from `vite.config.js`.
4. `base44-proxy` Edge Function deleted once nothing calls it.
5. Legacy `InventoryTxs` references fully removed from `src/`.
6. No visible behavior change for end users — this is a plumbing migration, not a feature project (with the one confirmed exception: Phase 12 removes the unused Kanban board outright rather than migrating it).
7. Every phase is testable against a real dev/staging environment before touching production (Phase 1 exists specifically to make this true).

---

## 2) Previously Completed (Baseline)

**Prior work (done before this blueprint, by earlier sessions/agents, not formally tracked as a phased plan):**
- Supabase authentication setup and Vercel hosting migration.
- `InventoryAuditLog` established as the predominant/authoritative inventory movement tracking mechanism (superseding the legacy `InventoryTxs` entity functionally, though stale imports remain — see Phase 6).
- 17 native `autopro-*` Edge Functions built and wired for inventory receiving/adjustment/merging/returns, WO save, GL posting (`autopro-handleInvoiceConversionGL`, `autopro-handleSupplierInvoiceLineGL`), PartsTech integration, and OCR.
- **Customer, Vehicle, and GLTransaction are fully migrated to native Postgres** — schema, data, and backend side done. Frontend call sites still route through Base44 proxy functions for these (Phase 4).
- **WorkPRO's entire database** (Project, ProjectTimeSession, TimeRecord, UnassignedTime, Employee, and related tables) is **fully native in the same Supabase project**, with zero live Base44 data remaining for it. AutoPRO's remaining `workProProxy` calls are legacy transport only, not a real data dependency (Phase 3).
- **Hybrid/in-progress**: Appointment (table exists, an existing separate implementation plan — `appointment_implementation_plan.md` — governs its transition; see Phase 11), ChartOfAccount (table + data migrated, CRUD not fully cut over — low-urgency since it's a low-change-frequency table), InventoryCategory, InventoryLocation, InventoryReturn, FiscalPeriod (all similarly hybrid).
- A local Electron Desktop App (`electron/main.js`, `electron/preload.cjs`) loading the production site with a `desktop://` bridge — independent of the Base44 data layer. Its cart-scraping experiment (`get-cart-text`) did not pan out and needs cleanup (Phase 13), but the desktop shell itself may be kept since users are on an aging PWA.
- `WorkPro.jsx` standalone page removed (commit `a0d3ed6`) — UI-level cleanup only; the underlying `workProProxy` calls were untouched (addressed in Phase 3).
- The Kanban board view of Work Orders (`KanbanBoard.jsx`) is confirmed no longer in use — to be deleted, not migrated (Phase 12).

**Clarification on "WorkPRO" vs "AutoPRO":** AutoPRO is the shop-management system covered by this blueprint's modules. **WorkPRO is a separate sister application** — the technician-facing side: project tracking, work-order pairing with projects, and time tracking. AutoPRO reads/writes into WorkPRO's tables (already native Postgres, same Supabase project) via the legacy `workProProxy` Base44 function today. (This distinction is now also captured in `master_context.md`.)

**What's NOT yet done (the gap this blueprint addresses):** 129 files still import the Base44 client; 279 `base44.functions.invoke` sites remain; 13 direct `base44.entities.*` CRUD sites (17 of the underlying entities confirmed to have no Postgres table at all yet); 27 `base44.auth.*` sites with no central session hook; 129 Base44-hosted functions and entity schemas still live; `@base44/sdk`/`@base44/vite-plugin` still production dependencies; no dev/staging Supabase environment currently mirrors production for safe testing (Phase 1 fixes this).

---

## 3) Risk Assessment

| # | Risk | Phase(s) | Impact | Likelihood | Mitigation |
|---|---|---|---|---|---|
| 1 | Testing against production because no dev environment exists yet | All, until Phase 1 lands | **Critical** | High until mitigated | Phase 1 is sequenced first specifically to close this gap before any data-touching phase executes. |
| 2 | GL/double-entry accounting corruption during Banking, AP, Accounting, or Payroll rewire | 7, 8, 9, 10 | **Critical** | Medium | Never modify the already-native GL posting functions (`autopro-handleInvoiceConversionGL`, `autopro-handleSupplierInvoiceLineGL`) — only rewire/build the CRUD feeding them. Diff Balance Sheet / GL-imbalance reports before vs. after each phase. |
| 3 | **Confirmed** schema-design work for 17 entities with no Postgres table today — this is now a certainty, not a possibility | 7, 8, 9, 10 | High | **Confirmed** (was "medium/unconfirmed" in v2) | Design schema per entity mirroring `base44/entities/*.jsonc` field definitions, following the FK/timestamp/default pattern set by `appointment_implementation_plan.md`. Confirm whether draft schemas already exist for any of these before designing from scratch (Open Question #6). Build + validate in the Phase 1 dev branch before touching production. |
| 4 | Security regression: replacing a coarse service-role proxy with a direct frontend call without proper RLS | Any phase using the "thin proxy → direct call" policy | **Critical** | Medium-High if RLS skipped | Every direct `supabase.from()` migration must ship with a reviewed RLS policy for that table. Complex/sensitive logic stays server-side per the stated policy. |
| 5 | Two agents (Claude Code + Antigravity) editing overlapping files concurrently | Phases 3 & 12 especially (both touch work-orders components) | Medium | Medium | Serialize phases that share files; only parallelize phases confirmed file-disjoint (see Section 5 coordination map). |
| 6 | Appointment's existing implementation plan not fully executed (title→notes migration script status unconfirmed; title column still present in DB) | 11 | Low-Medium | Medium | Confirm migration-script execution status before Phase 11's detailed plan proceeds; don't assume the prior plan's steps are all done just because the UI change landed. |
| 7 | Work Orders Core (`DocumentEditor.jsx`) blast radius — touches nearly every other domain | 12 | High | Medium | Still sequenced after Inventory (6) and Appointment (11) hybrid work lands. Full WO-lifecycle regression test required. |
| 8 | Third-party integration coupling (PartsTech, LLM/OCR extraction) still partially Base44-hosted | 6 | Medium | Medium | Migrate 1:1 to Deno Edge Functions before deleting Base44 originals; test against live sandbox accounts. |
| 9 | Data-type corruption (string-concat bugs) re-introduced on rewritten financial write paths | 7, 8, 9, 10 | High | Low | Strictly cast (`Number()`/`parseFloat()`) on every rewritten write path, per existing project convention. |
| 10 | Dev-branch secrets don't automatically carry over from production | 1 | Medium | High (structural — Branching doesn't clone secrets) | Explicit secrets-setting step in Phase 1's plan (see "Practical answer" section above) — don't assume the branch inherits them. |
| 11 | Plaintext long-lived Base44 JWT in local `.env` | 13 | Low | N/A (gitignored, never committed — not a live leak) | Your call on removal timing, not urgent. |

---

## 4) Time Estimate

*Estimates in AI-paired working sessions (~2–4 focused hours each), with Claude Code and Antigravity both executing against your direction/review.*

| Phase | Module | Est. Sessions | Notes |
|---|---|---|---|
| 1 | Dev & Testing Environment Parity | 2–3 | Bumped from v2: schema pull/commit + function deploy + secrets + static-table seeding is more involved than a simple config change |
| 2 | Auth Centralization + User→Employee Settings Migration | 2 | Includes one-time data migration of existing user preferences |
| 3 | WorkPRO / Tech-Time Rewire | 2–3 | Data fully native already |
| 4 | Customer, Vehicle & GL Cleanup (transport-layer only) | 2 | No schema risk |
| 5 | Reports Module | 1–2 | Isolated, read-only |
| 6 | Inventory Completion (incl. Category/Location/Return hybrid finish) | 3–4 | |
| 7 | Banking & Cash Drawer | 4–5 | Bumped: `CashDrawerAdjustment`/`DepositSlipBreakdown` confirmed needing real schema + data migration, not just a rewire |
| 8 | Accounts Payable, Suppliers, Lines of Credit & ChartOfAccount finish-up | 4–6 | Bumped: `LinesOfCredit`/`LinesOfCreditTransaction`/`CashFlowEntry` confirmed needing real migration; ChartOfAccount portion stays low-risk |
| 9 | Accounting, GL Reporting, Taxes & Fiscal Periods | 5–7 | Bumped: `GSTReturn`/`CashFlowEntry`/`CashFlowSummary` confirmed needing real migration; `FiscalPeriod` downgraded to hybrid (less scary than "unconfirmed") |
| 10 | Payroll | 2–3 | Bumped: `PayrollTransaction` confirmed needing real migration |
| 11 | Appointment Completion | 2–3 | Scoped against the existing `appointment_implementation_plan.md` |
| 12 | Work Orders Core (`DocumentEditor.jsx` and friends) | 4–6 | Kanban board deletion reduces scope slightly vs. v2 |
| 13 | Setup, Admin, Lankar Import & Final Sunset | 2–3 | Package/dependency removal, final repo-wide verification |
| **Total** | | **~35–49 sessions** | Wall-clock compresses on independent phases run concurrently by both agents (see coordination map) |

---

## 5) Roadmap & Progress

### Parallelization & Coordination Map

```
Tier A — Foundational (do first, sequentially)
  Phase 1 (Dev Env Parity)  -->  Phase 2 (Auth + Employee)

Tier B — Low-risk, high-leverage, mutually independent (safe to parallelize once Tier A is done)
  Phase 3 (WorkPRO/Tech-Time)   Phase 4 (Customer/Vehicle/GL)   Phase 5 (Reports)
  ** Phase 3 shares files with Phase 12 (below) — fine to run now, but Phase 12 must wait for Phase 3 to finish **

Tier C — Hybrid finish-ups, mostly independent of Tier B and each other
  Phase 6 (Inventory)   Phase 11 (Appointment)

Tier D — Financial modules, now confirmed to include real schema-design work; mostly file-disjoint from
         each other but share GL concepts
  Phase 7 (Banking)   Phase 8 (AP/Suppliers/LOC/ChartOfAccount)   Phase 9 (Accounting/GL/Tax)   Phase 10 (Payroll)
  ** recommend one agent owns this tier sequentially, or split by page-level file ownership if parallelizing **

Tier E — Highest blast radius, do only after 6 and 11 are stable
  Phase 12 (Work Orders Core)
  ** DO NOT run concurrently with Phase 3 — both touch WorkPRODescriptionModal.jsx, GlobalClockInModal.jsx,
     TimeRecordsView.jsx, and adjacent work-orders files **

Tier F — Final
  Phase 13 (Setup/Admin/Sunset) — only after a repo-wide base44 grep comes back clean
```

---

### Phase 1 — Development & Testing Environment Parity [Pending]

**TL;DR:** Migrate schema + Edge Functions onto the native Supabase dev branch (schema was never tracked in git, which is why the branch didn't sync automatically), seed only the static/reference tables you named, then wire Vercel's Development environment to point at it.

**Impacted:** No `src/` code changes. New `supabase/migrations/` history (schema pull from production), Edge Function deployment + secrets for the dev branch, a seed script for `InventoryCategory`, `ChartOfAccount`, `BankAccount`, `FiscalPeriod`, `SalesClass`, and Vercel Development-environment env var updates.

**Description:** See the "Practical answer" callout above for the full sequence — pull/commit schema, deploy functions, set branch secrets (not automatically inherited), seed static tables, update Vercel's `VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY`. Since local dev is impossible (same-origin auth requirement), this dev Supabase backend pairs with the existing hosted `test.kensauto.ca`-style deployment.

---

### Phase 2 — Auth Centralization + User→Employee Settings Migration [Pending]

**TL;DR:** Replace ~27 scattered `base44.auth.me()`/`updateMe()` call sites with a Supabase-auth-backed hook, and migrate stored user preferences off the Base44 `User` entity onto the (already-native) `Employee` table.

**Impacted files:** `src/Layout.jsx`, `src/lib/PageNotFound.jsx`, and ~24 other pages/components (Customers, Vehicles, Bank, CashDrawer, InventoryList, LinesOfCredit, Payroll, Suppliers, SupplierTx, Reconcile, Taxes, AppointmentForm, NewCustomerModal, NewVehicleModal, TechTimeModal, and others).

**Description:** Build a `useCurrentUser()` hook backed by `supabase.auth.getUser()`/`getSession()`. Identify the specific preference fields currently on the Base44 `User` entity (dark mode, "open in new window," `wo_cards`, set via `base44.auth.updateMe()` in `Layout.jsx`), add equivalent storage on `Employee`, one-time migrate each active user's current values, then repoint reads/writes.

---

### Phase 3 — WorkPRO / Tech-Time Integration Rewire [Pending]

**TL;DR:** WorkPRO's entire schema is already native with zero live Base44 data — low-risk, high-leverage, pulled forward from being a dependency buried inside Work Orders Core.

**Impacted files:** `src/Layout.jsx` (`sbCall` helper wrapping `workProProxy`), `src/pages/WorkOrders.jsx`, `src/components/work-orders/WorkPRODescriptionModal.jsx`, `src/components/work-orders/GlobalClockInModal.jsx`, `src/components/timerecords/TimeRecordsView.jsx`, `src/components/work-orders/TechTimeModal.jsx`, `src/components/setup/TechDirectory.jsx` (`fetchWorkPROTechs`); server-side `base44/functions/archiveWorkOrderProjects/entry.ts` (real orchestration logic — likely a 1:1 Edge Function replacement).

**Description:** Replace the generic `workProProxy` entity-CRUD proxy with direct `supabase.from()` calls for simple reads/writes (`Project`, `ProjectTimeSession`, `TimeRecord`, `UnassignedTime`) and a native `autopro-*` replacement for anything with real logic (e.g., `archiveWorkOrderProjects`). **Coordination note:** shares files with Phase 12 — must complete before Phase 12 starts.

---

### Phase 4 — Customer, Vehicle & GL Transport-Layer Cleanup [Pending]

**TL;DR:** Data is already fully native — pure transport-layer cleanup, no schema risk.

**Impacted files/functions:** `base44.functions.invoke('supabaseCustomer'|'supabaseVehicle'|'supabaseCustomerPayments'|'supabaseWorkOrder', ...)` (~34 call sites) in `AppointmentForm.jsx`, `CustomerForm.jsx`, `DocumentEditor.jsx`, `Schedule.jsx`, `EditApptViaWoModal.jsx`, `CashDrawer.jsx`, `CustomerARTransactions.jsx`, `Customers.jsx`, `NewVehicleModal.jsx`, `DepositDetailsModal.jsx`, `InvoicePaymentModal.jsx`; `searchCustomers`, `mergeCustomers`, `searchVehicles`, `mergeVehicles`, `decodeVin`; the stray `base44.entities.WorkOrder` direct-CRUD call in `WorkOrderProfitability.jsx`.

**Description:** Per the thin-proxy policy, replace each with a direct `supabase.from()` call (with RLS) unless the logic is non-trivial (`decodeVin` may stay function-backed if it calls a third-party VIN API — confirm during detailed planning).

---

### Phase 5 — Reports Module Migration [Pending]

**TL;DR:** 8 single-purpose, read-only report functions — isolated, low risk.

**Impacted files:** `src/components/reports/*.jsx` (`getCustomerReportData`, `getOtherChargesBreakdown`, `getSalesAnalysisReport`, `getTechnicianPerformanceReport`, `getWorkOrderSummaryReport`), `InventoryOnOrder.jsx` (`getRealTimeInventoryOnOrder`), `PartsMovementReportModal.jsx` (already partially native via `get_parts_movement_v2` RPC — a good template).

**Description:** Port each to a native Edge Function or direct RPC. No writes, no GL impact.

---

### Phase 6 — Inventory Module Completion [Pending]

**TL;DR:** Finish the hybrid InventoryCategory/InventoryLocation/InventoryReturn cutover, close out remaining `SupabaseProxy` calls, remove stale `InventoryTxs` imports, migrate OCR/upload integrations.

**Impacted files:** `pages/InventoryAdd.jsx`, `InventoryList.jsx`, `InventoryReturns.jsx`, `StockReorderReport.jsx`, `components/inventory/InventoryEditModal.jsx`, `ChangeSupplierModal.jsx`, `InventoryHistoryModal.jsx`, `EditInventoryTransactionModal.jsx`, `InventoryTransactionsModal.jsx`, `LegacyWarrantyReturnModal.jsx`, `ReceiveCreditModal.jsx`, `GetPartModal.jsx`, `useInventory.jsx`, `MergeInventoryModal.jsx`, `LocationModal.jsx` (`inventoryUpdate` — slated for deletion); plus removing the (functionally unused, confirmed stale) `InventoryTxs` import from `DocumentEditor.jsx:4` and `LineItemsTable.jsx:3`; `AutoReconcileModal.jsx`, `LegacyWorkOrderImportModal.jsx`, `AddLegacyInvoiceModal.jsx`, `LankarImport.jsx` (`UploadFile`/`ExtractDataFromUploadedFile`).

**Description:** Finish cutting InventoryCategory/InventoryLocation/InventoryReturn reads+writes over to their native tables. Migrate remaining generic `SupabaseProxy` calls. Delete `inventoryUpdate` once `LocationModal.jsx` is repointed. Remove the dead `InventoryTxs` import. Migrate upload/OCR calls to native Storage + Edge Function pattern (`autopro-processPartsInvoiceOCR` as template).

---

### Phase 7 — Banking & Cash Drawer Migration [Pending]

**TL;DR:** Highest-traffic `SupabaseProxy` cluster outside Work Orders — money movement, plus **confirmed** real schema/data migration for `CashDrawerAdjustment` and `DepositSlipBreakdown` (no Postgres table exists yet for either).

**Impacted files:** `pages/Bank.jsx`, `components/bank/BankTransferModal.jsx`, `BankTransactionModal.jsx`, `components/cash-drawer/DepositModal.jsx`, `DepositHistoryModal.jsx`, `DepositDetailsModal.jsx`, `IssuedChequesTable.jsx`, `ChequeWriter.jsx`, `pages/Reconcile.jsx`, `ReconcileReport.jsx`, `pages/CashDrawer.jsx` (direct `base44.entities.CashDrawerAdjustment`/`DepositSlipBreakdown`).

**Description:** Design and build native tables for `CashDrawerAdjustment` and `DepositSlipBreakdown` first (validate in the Phase 1 dev branch), then migrate reconciliation, deposit, cheque-writing, and transfer flows. Verification must include reconciliation-report parity checks (totals match to the cent, before vs. after).

---

### Phase 8 — Accounts Payable, Suppliers, Lines of Credit & ChartOfAccount Finish-Up [Pending]

**TL;DR:** Supplier payment processing, plus **confirmed** real schema/data migration for `LinesOfCredit`/`LinesOfCreditTransaction`/`CashFlowEntry`, alongside finishing the low-urgency ChartOfAccount cutover.

**Impacted files:** `pages/Suppliers.jsx`, `SupplierTx.jsx`, `CreditInvoice.jsx`, `components/suppliers/SupplierPaymentModal.jsx`, `SupplierForm.jsx` (direct `base44.entities.ChartOfAccount` — good starting point, low risk), `APSummaryTable.jsx` (direct `CashFlowEntry`/`LinesOfCredit`), `components/lines-of-credit/LineOfCreditPaymentModal.jsx`, `LineOfCreditTransactionModal.jsx`, `PaymentTransactionItem.jsx`.

**Description:** Start with `ChartOfAccount` cutover (lowest risk, already-migrated data). Then design native schema for `LinesOfCredit`/`LinesOfCreditTransaction`/`CashFlowEntry` and migrate AP/supplier/LOC CRUD onto it.

---

### Phase 9 — Accounting, GL Reporting, Taxes & Fiscal Periods [Pending]

**TL;DR:** GL/financial reporting reads, plus **confirmed** real schema/data migration for `GSTReturn`/`CashFlowEntry`/`CashFlowSummary`, and finishing the hybrid `FiscalPeriod` cutover — narrower risk band than v2 now that GLTransaction itself is confirmed already migrated.

**Impacted files:** `pages/BalanceSheet.jsx`, `GLAcct.jsx`, `GLJournal.jsx`, `GeneralLedger.jsx`, `PLReport.jsx`, `FinancialDashboard.jsx`, `CashFlowTrendTab.jsx`, `pages/Taxes.jsx` (direct `GSTReturn`), `pages/CashFlow.jsx` (direct `CashFlowEntry`/`CashFlowSummary`), `ReportableLeviesReport.jsx`, `components/taxes/MarkPaidModal.jsx`.

**Description:** Migrate reporting reads first (lower risk), then design native schema for `GSTReturn`/`CashFlowEntry`/`CashFlowSummary` and migrate their CRUD. Finish the `FiscalPeriod` hybrid cutover alongside. **Do not modify** the already-native GL posting functions — this phase only touches records that feed into and report on those postings.

---

### Phase 10 — Payroll [Pending]

**TL;DR:** Smaller module, but now confirmed to include real schema/data migration for `PayrollTransaction`.

**Impacted files:** `pages/Payroll.jsx`, `components/payroll/AddAdjustmentModal.jsx`, `AddPaychequeModal.jsx`, `AddRemittanceModal.jsx` (`parsePayrollFile`), `MarkPaidModal.jsx`.

**Description:** Design native `PayrollTransaction` schema, migrate payroll transaction/ledger CRUD, and migrate the payroll-file-parsing function.

---

### Phase 11 — Appointment Module Completion [Pending]

**TL;DR:** Finish the transition already scoped in `appointment_implementation_plan.md`, adjusted for what's changed since it was drafted.

**Impacted files:** `src/pages/Schedule.jsx`, `components/appointments/AppointmentForm.jsx`, `EditApptViaWoModal.jsx`, and other scheduling-related components.

**Description:** The existing plan proposes a target `Appointment` schema (FK to `WorkOrder`/`Employee`/`Customer`/`Vehicle`, reminders fields, `status`/`bay` columns) — this part is in scope. **Not in scope:** the plan also proposed three workflow features (an "Unbilled Appointments" queue, a read-only Project-status indicator on the calendar, and automated status cascading from WorkPRO → WO → Appointment) — these were the drafting AI agent's own suggestions, not something you asked for or want adopted. Phase 11 should **not** build any of the three; treat that section of the plan doc as informational only, not scope. Before drafting this phase's detailed plan: confirm (a) whether the proposed schema in that doc is what's actually live today or still target-state, and (b) whether the title→notes data-migration script was run (the `title` column still exists in the DB per your note — the UI removal and the data migration are two separate steps, and only the first is confirmed done).

---

### Phase 12 — Work Orders Core [Pending]

**TL;DR:** The remaining broad WO workflow (`DocumentEditor.jsx` and friends) — still the highest blast-radius module, sequenced after Inventory (6) and Appointment (11). Scope reduced from v2: the Kanban board is being deleted, not migrated.

**Impacted files:** `components/work-orders/DocumentEditor.jsx` (8+ distinct Base44 function calls — the single biggest offender in the app), `hooks/useDocumentEditorSave.jsx`, `FindPartModal.jsx`, `WorkOrderPdfModal.jsx`, `ROApprovalsModal.jsx`, `SESEmailModal.jsx`, `pages/WorkOrders.jsx`, `InvoiceConversion.jsx`, `CreditInvoice.jsx`.

**Removed from scope (delete, don't migrate):** `components/work-orders/KanbanBoard.jsx` and its `updateWorkOrderStatus` Base44 call — confirmed unused. Delete outright rather than porting; also check `pages/WorkOrders.jsx` for any remaining references/imports to the Kanban view and remove them.

**Description:** Standard WO CRUD/workflow calls not already covered by Phases 3 or 4 (status updates, estimate conversion, PDF generation, SMS/email). Requires the most thorough QA pass of any phase: full WO lifecycle (create → estimate → line items → parts → convert to invoice → payment → GL posting) regression-tested. **Do not run concurrently with Phase 3** — file overlap in work-orders components.

---

### Phase 13 — Setup, Admin, Lankar Import & Final Sunset [Pending]

**TL;DR:** Long-tail admin/import tooling, Electron cart-scraping cleanup, then remove Base44 entirely from the codebase.

**Impacted files:** `pages/Admin.jsx`, `Setup.jsx` (`backupToGoogleDrive`), `components/setup/SalesClassManager.jsx`, `RestoreBackupModal.jsx`, `pages/LankarImport.jsx`, `LegacyWorkOrderImportModal.jsx`, `AddLegacyInvoiceModal.jsx`; the failed cart-scraping experiment in the Electron app (`electron/main.js` `get-cart-text` handler, `OnlineOrderModal.jsx` desktop bridge usage — clean up, likely keeping the Electron shell itself since it's otherwise useful for your PWA users); then repo-wide: `src/api/base44Client.js`, `src/api/entities.js` and `src/api/integrations.js` (already dead code), `vite.config.js`, `package.json` (`@base44/sdk`, `@base44/vite-plugin`), `supabase/functions/base44-proxy/`, the `base44/` directory (129 functions + entity schemas), `.env` (Base44 vars — your call on removal timing).

**Description:** Finish long-tail tooling, clean up the cart-scraping dead end, then a final repo-wide `base44` grep as the go/no-go gate before deleting dependencies, the proxy function, and the legacy tree.

---

## 6) Verification Plan

| Phase | Verification Criteria |
|---|---|
| 1 | Dev branch schema matches production; a smoke-test write in dev never touches prod; all Edge Functions + secrets present and callable on the branch; static reference tables seeded and correct. |
| 2 | Session/role behavior identical pre/post across 5+ spot-checked pages; existing users' preference values migrated correctly — spot-check several Employee records before/after. |
| 3 | Tech time logging and WO↔Project pairing behave identically; `archiveWorkOrderProjects` output matches pre-migration behavior. |
| 4 | Create/edit/merge Customer and Vehicle; `searchCustomers`/`searchVehicles` results match pre-migration output for identical queries. |
| 5 | Run each report before/after with identical filters; diff output row-for-row. |
| 6 | Full inventory receive → adjust QOH → return → merge cycle; Category/Location/Return CRUD confirmed hitting native tables; OCR/upload tested with a real sample file. |
| 7 | New `CashDrawerAdjustment`/`DepositSlipBreakdown` tables validated in dev first; bank reconciliation run twice (old vs. new path) on the same statement period — totals match to the cent; deposit slip/cheque PDFs generate identically. |
| 8 | New `LinesOfCredit`/`LinesOfCreditTransaction`/`CashFlowEntry` tables validated in dev first; process a real supplier payment and LOC payment in dev; GL postings unaffected; AP balances match pre-migration figures; ChartOfAccount reads confirmed native. |
| 9 | New `GSTReturn`/`CashFlowEntry`/`CashFlowSummary` tables validated in dev first; Balance Sheet/P&L/GL Journal identical pre/post for a fixed historical period; GST calculation matches a manually-verified figure; zero new GL imbalances; FiscalPeriod cutover confirmed complete. |
| 10 | New `PayrollTransaction` table validated in dev first; process a payroll batch in dev; ledger entries and bank-balance impact match expected figures. |
| 11 | Create/edit/cancel appointment round-trips match pre-migration behavior; confirm title→notes migration script ran (no orphaned `title` data). No verification needed for the Unbilled Appointments queue / Project indicator / status cascade — explicitly out of scope, not built. |
| 12 | Full WO lifecycle regression: create → line items/parts → estimate → convert to invoice → payment → GL entries unaffected → inventory QOH correct → tech time still logs correctly; confirm Kanban board and its references are fully removed with no dangling imports. |
| 13 | Repo-wide `base44` grep returns zero hits in `src/`; app builds and runs with `@base44/sdk`/`@base44/vite-plugin` removed; smoke-test every top-level page once after final dependency removal. |

---

## 7) Lessons Learned & Context

*(Running log, carried forward into future blueprints.)*

- **2026-08-02:** Prior "Phase 1/2" work (informal, another agent/session) = Supabase auth setup, Vercel hosting, and establishing `InventoryAuditLog` as the authoritative inventory movement mechanism. Never tracked as a formal phased blueprint — this is the first one, and phase numbering restarts at 1 rather than continuing from an unlabeled prior effort.
- **2026-08-02:** A `base44.functions.invoke(...)` call site does **not** automatically mean the underlying data is still Base44-dependent — several "proxy" functions (`supabaseCustomer`, `supabaseVehicle`, etc.) are just thin forwarders to Postgres. Always confirm actual entity/table status with the user directly rather than inferring from call-site patterns alone — and once confirmed, treat it as settled (don't re-litigate per phase).
- **2026-08-02:** WorkPRO is a distinct sister application (technician-facing: project tracking, WO pairing, time tracking), not a module of AutoPRO — but shares the same Supabase project and is already 100% natively migrated. This made its migration phase far lower-risk than initially assumed when it was bundled as a "Work Orders dependency."
- **2026-08-02:** Local development is structurally impossible for this app due to a same-origin authentication requirement — all testing must happen via a hosted deployment, not localhost.
- **2026-08-02:** Supabase native Branching does not automatically sync schema when the schema itself was never committed to git as tracked migrations — and does not carry over Edge Function secrets even when schema/functions are synced. Both need an explicit step.
- **2026-08-02:** Commit titles and even prior AI-authored plans can undersell scope or go stale — e.g. `appointment_implementation_plan.md`'s proposed UI change (drop `title` field) landed, but the underlying DB migration script's execution status wasn't confirmed just because the UI shipped. Verify actual state, don't assume a linked plan was executed in full just because part of it visibly happened.
- **2026-08-02:** This initiative is executed by multiple agents in parallel (Claude Code + Antigravity) under the user's direction/review. Phase scoping explicitly accounts for file overlap between phases so concurrent execution doesn't produce conflicting edits (see Section 5 coordination map).
- **2026-08-02:** Dead/unused UI (e.g. `KanbanBoard.jsx`) discovered mid-planning should be deleted outright during its phase, not migrated — always ask rather than assume a component found in a base44-usage grep is still live.
- **2026-08-02:** A linked planning doc written by a different AI agent (`appointment_implementation_plan.md`) mixed actual agreed-upon scope (the schema) with unsolicited feature suggestions (Unbilled Appointments queue, Project indicator, status cascade) that the user never asked for or wanted adopted. When folding a prior AI-authored doc into a phase, don't assume everything in it is approved scope — separate "what was actually requested" from "what the agent proposed on its own," and confirm with the user before treating the latter as in-scope.
