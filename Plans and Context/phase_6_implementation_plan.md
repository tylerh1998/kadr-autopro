# Phase 6 Implementation Plan: Reports Module Migration

**Status:** APPROVED (2026-08-03) — ready for execution
**Parent:** `master_blueprint.md` — Phase 6 (Tier B, safe to run in parallel with Phase 5 and Phase 4; confirmed file-disjoint from both — see Section 0.2)
**Prepared:** 2026-08-03 · **Amended:** 2026-08-03 (post-approval final-pass cross-check against `master_context.md` — see Section 0.7; corrected Edge Function status-code design in Section 3 to match the already-documented project convention)

> **Live document.** This plan is updated in place as execution/verification surfaces new findings — do not wipe prior sections, append/annotate instead. Key learnings roll back into `master_blueprint.md` Section 7 at phase close (via `/nextphase`).

---

## 0) Open Questions, Info Requirements & Suggestions

### 0.1 — RESOLVED: payroll-progress-bar data gap in Technician Performance Report

`getTechnicianPerformanceReport` (the base44 function behind `TechnicianPerformanceReportModal.jsx`'s "Monthly Payroll Target vs Labour Sales" progress bar) calls `base44.entities.CashFlowSummary.list()` to read three fields (`est_first_payroll`, `est_second_payroll`, `est_payroll_remit`) off the current cash-flow summary record.

**Confirmed via direct query:** `CashFlowSummary` has **no native Postgres table today** (not in production's table list). It's one of the entities the blueprint already flags as needing real schema design — bundled into **Phase 10** ("Accounting, GL Reporting, Taxes & Fiscal Periods"), not Phase 6.

**Decision (confirmed 2026-08-03): migrate everything that can be migrated now; defer only the progress bar.** `autopro-getTechnicianPerformanceReport` ships as a fully native Edge Function with `utilization`/`efficiency` fully migrated. The progress bar's data (`progress: { target, current }`) is hardcoded to `{ target: 0, current: 0 }` and the card is hidden client-side rather than shown empty (see Section 3.4). **Verification of the progress bar specifically is explicitly skipped this phase** — nothing to verify since it's intentionally non-functional until Phase 10. A restoration note has been added to `master_blueprint.md`'s Phase 10 section and Section 0 so this isn't forgotten (see that file's Phase 10 entry and Open Question #6, added alongside this plan).

### 0.2 — Confirmed file-disjoint from Phase 5 (parallel-safe)

Cross-checked this phase's full file list against `phase_5_implementation_plan.md`'s 21-file inventory (Customer/Vehicle/GL transport cleanup: `AppointmentForm.jsx`, `CustomerForm.jsx`, `DocumentEditor.jsx`, `Schedule.jsx`, `Customers.jsx`, `Vehicles.jsx`, etc.) and Phase 4's file list (WorkPRO). **Zero overlap** — Phase 6 only touches `src/components/reports/*.jsx` plus new `supabase/functions/autopro-get*` directories. Confirmed safe to execute concurrently with whichever agent is running Phase 5. The only shared *tables* are `WorkOrder`/`Customer`/`Employee`/`Project`/`ProjectTimeSession`, and Phase 6 only ever `SELECT`s from them (read-only reports) — no write-write or write-read race is possible.

### 0.3 — Resolved during research, confirmed permanent fixture: `WorkOrderStatus` dependency in Work Order Summary Report is safe to drop, not defer

`getWorkOrderSummaryReport` also calls a not-yet-migrated entity (`base44.entities.WorkOrderStatus.list()`), used to map `WorkOrder.status` (an ID, in the original Base44 schema) to a human-readable name. **Confirmed via direct query against production:** `WorkOrder.status` already stores plain text today, not an opaque Base44 record ID — the full distinct set across all 1,557 rows is `Completed` (1235), `Open` (306), `Ken` (11), `Elisa` (2), `Scheduled` (2), `Parts On Order` (1). None look like legacy Base44 IDs. So the existing fallback in the function (`statusMap.get(statusVal) || statusVal || 'Unassigned'`) already resolves to the same value with or without the lookup. **Decision (confirmed 2026-08-03): drop the `WorkOrderStatus` fetch entirely** in the native version, permanently — this is not a stopgap awaiting a future phase like 0.1's progress bar. The `status` column already holds the display value directly; there's no future migration this needs to wait on, and no entity/table read of any kind belongs here. No behavior change, one fewer moving part.

### 0.4 — Scope boundary: `ReportableLeviesReport.jsx` excluded, `PartsMovementReportModal.jsx` included

`src/components/reports/ReportableLeviesReport.jsx` lives in the same directory as everything else here but is explicitly scoped to **Phase 10** in the master blueprint (it depends on `GSTReturn`/Levies entities, not yet migrated) — excluded from this plan, not an oversight.

`PartsMovementReportModal.jsx` isn't in the blueprint's original Phase 6 file list, but it belongs here: it's a report, it's `base44`-routed today (via `SupabaseProxy`), and the master blueprint explicitly calls it out as "already partially native via `get_parts_movement_v2` RPC — a good template" for this phase. Adding it to scope as the 7th migration target (it needs a much smaller change than the other 6 — see Section 3.7).

### 0.5 — RESOLVED: verification split — agent verifies output correctness, user verifies the live UI manually

Every other phase's verification plan uses the `/dev-login` route against the dev Supabase branch, because most phases involve *writes* and the standing rule is "never write-test a feature before its phase lands" (production sessions are required for still-base44-routed writes; dev-branch sessions can't authenticate through `base44-proxy` at all — see `master_blueprint.md` Section 7, Phase 3 entries).

**Phase 6 has zero writes** — every function here is a pure `SELECT`-and-aggregate. That changes the calculus: the dev branch's operational tables are sparse/empty (seeded only with static reference tables per Phase 1), so comparing old-vs-new report output there would mostly show empty reports on both sides and prove little. Comparing the old (base44) and new (native) versions of each report's **output data** side-by-side against production, using identical date filters, is safe (no mutation risk) and is the only way to get a meaningful pre/post diff with real data.

**Decision (confirmed 2026-08-03) — split responsibility:** live browser click-through verification (actually opening each report in the UI at `test.kensauto.ca`) requires switching which Supabase project the `development` Vercel environment/`test.kensauto.ca` points at, which is a manual, environment-level change **you'll do yourself** rather than something I trigger. So the division of labor for Section 4 is:
- **I verify** (during/after execution): each new Edge Function's *output* is correct — e.g. invoking the deployed function directly and comparing its JSON response against the old base44 function's response for the same inputs, plus static checks (repo-wide grep for old call sites, build clean, RLS/schema assumptions re-confirmed).
- **You verify**: the actual UI experience — clicking through each report in the browser once `test.kensauto.ca` is pointed at the right environment, confirming charts/tables render and interactions (drill-down dialogs, print, sort/filter) still work end-to-end.

Section 4's checklist below is annotated per-item with which of us owns it.

### 0.6 — Bug found during research, will fix as a drive-by (not a design decision, just flagging)

`ReportModal.jsx:234` gates the Sales Analysis report behind `currentUser?.role === 'admin' || ['lvl2_user', 'lvl3_user'].includes(currentUser?.access_level)`. Both `role` and `access_level` are **pre-Phase-3 field names** — Phase 3's field census renamed these to `admin` (boolean) and `autopro_access_lvl` (text) on the `Employee` table/`employee` object, and confirmed via direct query that `Employee` has no `role` or `access_level` columns at all today. Since `currentUser` here is the same `employee` object Phase 3 already repointed everywhere else, this condition is **always false** right now — meaning Sales Analysis is currently unopenable by anyone, silently (`alert("You do not have access to this report.")` fires unconditionally). This is the same class of bug Phase 3 found twice (stale field name surviving outside its original call-site inventory because this file doesn't call `base44.auth.*` directly, so it wasn't in that phase's grep). Since this file is already being touched in this phase, fixing it as part of the same edit (Section 3.3) rather than opening a separate ticket.

### 0.7 — Post-approval final-pass correction: `master_context.md` already mandates a specific Edge Function error-handling convention that the original draft of this plan violated

Doing a documentation completeness pass after approval (per your request) turned up something in `master_context.md`'s "Global Technical Rules & Conventions" (Section 3) that the original Section 3 draft below got wrong:

> **Error Handling:** Edge Functions must return a `200 OK` status with an `{ error: "message" }` JSON payload instead of throwing raw 4xx/5xx HTTP errors. The Supabase JS client (`FunctionsHttpError`) intercepts non-2xx codes and swallows the JSON response body, hiding the actual error message from the frontend.

My original draft had the 6 new Edge Functions returning `401` for unauthorized and `500` for internal errors (matching what `autopro-WOBulkGetParts`/`autopro-archiveWorkOrderProjects` actually do in the live codebase) — which is exactly the anti-pattern this documented rule warns against. **This also retroactively explains** the "Base44 vs. Supabase error-surfacing semantics" item I'd logged as a general lesson in Section 2: it isn't just an SDK quirk to work around per-call-site, it's a known, already-documented failure mode with an already-decided fix (always `200`, put the error in the body). It further explains why `GetPartModal.jsx` (an already-migrated, out-of-scope file) checks `response.data.success` without ever checking `response.error` first — if `autopro-WOBulkGetParts` ever actually hits its `400` error path, that check would throw on `null.success` instead of surfacing the real error, because the JS client swallows the body on non-2xx exactly as the rule describes.

**Corrected in this revision:** Section 3's general template and all 6 per-function sections below now have every new Edge Function returning `200` unconditionally, with `{ error: "..." }` in the body on failure — matching `master_context.md` exactly. This also **simplifies** every frontend edit versus the original draft: since `response.error` will now almost never fire (only on genuine transport failures, not business-logic ones), each frontend call site checks the body's own `error` field instead. See the revised Section 3.

**Not fixed, flagged separately:** `autopro-WOBulkGetParts` and `autopro-archiveWorkOrderProjects` (both pre-existing, both outside this phase's file list) still violate this documented convention today (400/500 status codes) and `GetPartModal.jsx`'s error handling has the corresponding gap described above. Spawning this as a background task suggestion rather than fixing it here, since it's unrelated to the Reports module.

---

## 1) Phase Scope & Objectives

**Objective:** Cut all 6 remaining Base44-hosted report functions (plus 1 already-native-but-base44-transported report) over to native Supabase, closing out the "Reports Module" line item in the master blueprint. Zero behavior change for end users — every report should render byte-identical numbers before and after, just served without a Base44 round-trip.

**In scope (7 migration targets, all in `src/components/reports/`):**

| # | Frontend component | Base44 function replaced | New asset |
|---|---|---|---|
| 1 | `CustomerReportModal.jsx` | `getCustomerReportData` | Edge Fn `autopro-getCustomerReportData` |
| 2 | `OtherChargesBreakdownReport.jsx` | `getOtherChargesBreakdown` | Edge Fn `autopro-getOtherChargesBreakdown` |
| 3 | `SalesAnalysisReport.jsx` | `getSalesAnalysisReport` | Edge Fn `autopro-getSalesAnalysisReport` |
| 4 | `TechnicianPerformanceReportModal.jsx` | `getTechnicianPerformanceReport` | Edge Fn `autopro-getTechnicianPerformanceReport` (progress bar deferred to Phase 10 — see 0.1) |
| 5 | `WorkOrderSummaryReport.jsx` | `getWorkOrderSummaryReport` | Edge Fn `autopro-getWorkOrderSummaryReport` |
| 6 | `InventoryOnOrder.jsx` | `getRealTimeInventoryOnOrder` | Edge Fn `autopro-getRealTimeInventoryOnOrder` |
| 7 | `PartsMovementReportModal.jsx` | `SupabaseProxy` → RPC `get_parts_movement_v2` | direct `supabase.rpc()` call, no new Edge Fn |

Also in scope: `ReportModal.jsx` (the container/menu — no functional migration needed, just the stale-field bug fix in 0.6).

**Out of scope:** `ReportableLeviesReport.jsx` (Phase 10 — depends on unmigrated `GSTReturn`/Levies entities). Any report reachable via `ReportModal.jsx`'s `window.open(createPageUrl(...))` paths (`ChartOfAccounts`, `Taxes`, `JournalEntries`, `FiscalPeriods`, `GLJournal`, `StockReorderReport`, `InventoryValuation`) — those are separate pages belonging to other phases (9, 10, 7), `ReportModal.jsx` just links to them.

**Target outcome:** `getCustomerReportData`, `getOtherChargesBreakdown`, `getSalesAnalysisReport`, `getTechnicianPerformanceReport`, `getWorkOrderSummaryReport`, `getRealTimeInventoryOnOrder`, and `SupabaseProxy`'s one remaining caller in this file set all stop receiving traffic from `src/`. (Per standing rule — see master_blueprint.md Lessons Learned — the `base44/functions/*` source files themselves are **not** deleted this phase; that's Phase 14's job. This phase only stops *calling* them.)

---

## 2) Lessons Learned & Context (pulled from `master_blueprint.md` Section 7)

Directly applicable to this phase's execution:

- **RLS is already wide open on every table this phase touches** (`WorkOrder`, `Customer`, `Employee`, `Project`, `ProjectTimeSession`, `TimeRecord`, `UnassignedTime`, `InventoryItem`, `Supplier` — all have a `"Enable all operations for all users"` policy with `roles: {public}`, `qual: true`, confirmed via direct query). This is a pre-existing condition, not something this phase introduces or needs to fix (Risk #4 in the blueprint is about *new* direct-frontend `supabase.from()` calls needing a *reviewed* RLS policy — these tables' policies already exist and are already this permissive under the current base44-service-role path, which also bypasses RLS entirely; migrating to a service-role-key Edge Function preserves the exact same effective access, not a regression). Worth a mention for whoever eventually does a security pass, but explicitly not this phase's job.
- **A deployed function is not proof it's ever been called; a call site's existence doesn't mean the underlying data is base44-dependent** (Section 7, 2026-08-02 and 2026-08-03 entries) — confirmed here by directly reading all 6 base44 function sources rather than assuming from call-site patterns. Result: 4 of 6 are already 100% native-data (just wrong transport), 2 have one small dependency each on an unmigrated entity (see Section 0).
- **Audit fields don't populate themselves** (Phase 4 lesson) — **not applicable here**, this phase is 100% read-only, no inserts/updates anywhere.
- **`npm run build` succeeding doesn't mean runtime-clean** (Phase 3 lesson) — every one of the 7 frontend edits changes a transport call and error-handling path; each needs an actual click-through, not just a clean build, per Section 4's verification plan.
- **Check `information_schema.columns` before assuming a field exists — don't carry stale field names forward** (Phase 3/4 lesson) — directly caused finding 0.6 (`role`/`access_level` don't exist on `Employee` anymore).
- **Silent-failure pattern**: any Supabase call whose failure degrades to a plausible "empty" state should log its error, not swallow it (Phase 3 lesson). Applying this to all 6 new Edge Functions' catch blocks (they already do this well — the base44 originals all `console.error` on failure — preserving that).
- **Leave the `base44/` source tree alone until Phase 14** (Phase 4 standing rule) — this phase stops *calling* the 6 functions but does not delete `base44/functions/getCustomerReportData/`, etc.
- **`master_context.md` already documents the fix for a Base44-vs-Supabase error-surfacing gap** (confirmed on a post-approval re-read of that file — see Section 0.7): `base44.functions.invoke()` always returns the parsed JSON body in `.data` regardless of HTTP status. `supabase.functions.invoke()` does not — on a non-2xx response, the Supabase JS client's `FunctionsHttpError` swallows the JSON body, so `.data` comes back `null` and the real error message is lost. `master_context.md`'s Global Technical Rules already mandate the fix project-wide: **every Edge Function must return `200 OK` always, with `{ error: "message" }` in the body on failure** — never a raw 4xx/5xx. All 6 new functions in this phase follow that rule (Section 3); frontend call sites check the body's `error` field, not `response.error`, for business-logic failures. This should have been the design from the first draft of this plan — caught during the post-approval documentation pass, not before. Worth calling out for every future phase migrating a `base44.functions.invoke` call site: **check `master_context.md` for this rule before writing any new Edge Function**, don't copy the status-code pattern from `autopro-WOBulkGetParts`/`autopro-archiveWorkOrderProjects`, both of which pre-date this documented rule and don't follow it.

---

## 3) Detailed Execution Plan

### General Edge Function template (applies to all 6 new functions)

Structurally modeled on the two most recent native precedents (`supabase/functions/autopro-archiveWorkOrderProjects/index.ts` and `supabase/functions/autopro-WOBulkGetParts/index.ts`) for the CORS/auth/service-role-client skeleton — **but with status codes corrected to follow `master_context.md`'s documented Edge Function error-handling rule** (see Section 0.7), which neither of those two precedents actually follows. Every response — success, unauthorized, or internal error — returns `200 OK`; only the JSON body's presence/absence of an `error` key signals failure:

```ts
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.6";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
const jsonHeaders = { ...corsHeaders, 'Content-Type': 'application/json' };

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const supabase = createClient(supabaseUrl, supabaseKey);

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Missing Authorization header' }), { status: 200, headers: jsonHeaders });
    }
    const { data: { user }, error: authError } = await supabase.auth.getUser(authHeader.replace('Bearer ', ''));
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 200, headers: jsonHeaders });
    }

    const { /* params */ } = await req.json().catch(() => ({}));

    // ... business logic, verbatim port of the base44 function's aggregation, minus:
    //     - createClientFromRequest(req) / base44.auth.me() (replaced by the auth block above)
    //     - createSupabaseClient() (replaced by the service-role client above)
    //     - any base44.entities.* calls that have a native table equivalent (see per-function notes)

    return new Response(JSON.stringify({ /* same shape the base44 version returned */ }), { status: 200, headers: jsonHeaders });
  } catch (error) {
    // Still 200 — per master_context.md, the caller must always get a parseable body.
    return new Response(JSON.stringify({ error: error.message }), { status: 200, headers: jsonHeaders });
  }
});
```

**`fetchAllRows` pagination helper**: every base44 function uses an identical `fetchAllRows(queryFactory)` helper (1000-row pages via `.range()`) to work around a page-size limit. Port this helper verbatim into each new function — it's needed for the same reason (`WorkOrder` has 1,557 rows, `LankarWOLines`-scale tables aside, several of these functions fetch full-table scans of `WorkOrder`/`TimeRecord`/`ProjectTimeSession`, all of which exceed 1,000 rows).

**CORS note:** confirmed the two most recent precedents differ slightly on `Access-Control-Allow-Headers` (`'*'` vs the explicit `'authorization, x-client-info, apikey, content-type'` list) — using the more explicit, more recent (`autopro-WOBulkGetParts`) version for all 6 new functions for consistency going forward.

---

### 3.1 `autopro-getCustomerReportData`

**Source to port:** `base44/functions/getCustomerReportData/entry.ts` (lines 1–159, read in full).

**Changes from the base44 version:**
- Drop `createClientFromRequest`/`base44.auth.me()` → replace with the standard auth block above.
- Drop `createSupabaseClient()` (env vars `Supabase_project_url`/`Supabase_Secret_Key`) → replace with `SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY` (the standard Supabase-injected Edge Function secrets, not the Base44-platform-specific names).
- No `base44.entities.*` calls in this one at all — `Customer` is already queried via the native `supabase` client (`.from('Customer')`). **This function has zero unmigrated-entity dependencies** — straight lift.
- Keep the `PAGE_SIZE`/`fetchAllRows`/`CUSTOMER_REPORT_SELECT` constants and the exact aggregation logic (customer stats by `customer_id`, filter zero-total-sales, sort desc, slice top 50) unchanged — it's pure business logic with no base44 coupling.
- Response shape: keep exactly `{ data: top50, count: top50.length }` — this is what `CustomerReportModal.jsx` expects.

**Frontend edit — `src/components/reports/CustomerReportModal.jsx`:**
- Line 10: remove `import { base44 } from "@/api/base44Client";`, add `import { supabase } from "@/lib/supabase";`
- Lines 83–86:
  ```diff
  - const { data, error } = await base44.functions.invoke('getCustomerReportData', { 
  -   dateFrom, 
  -   dateTo 
  - });
  + const { data, error } = await supabase.functions.invoke('autopro-getCustomerReportData', {
  +   body: { dateFrom, dateTo }
  + });
  ```
- Line 88: `if (error) throw new Error(error);` → since the new function always returns `200` (Section 0.7), `error` here will only be non-null on a genuine transport failure (network error, function crash), not a business-logic one — change to `if (error) throw error;` (it's already an `Error`-like object) **and add** `if (data?.error) throw new Error(data.error);` right after, to catch the "Unauthorized" / internal-error cases that now arrive inside a 200 body instead of a non-2xx status.
- No other lines change — `data.data` access pattern (line 90–91) is unaffected since we're preserving the response shape exactly.

---

### 3.2 `autopro-getOtherChargesBreakdown`

**Source to port:** `base44/functions/getOtherChargesBreakdown/entry.ts` (lines 1–173, read in full).

**Changes from the base44 version:**
- Same auth/client swap as 3.1.
- **One `base44.entities.Customer.filter(...)` call to replace** (line 89 of the original): `const customers = await base44.entities.Customer.filter({ id: { $in: customerIds } }, undefined, 1000);` → since `Customer` is fully native, replace with a **chunked** native query (mirroring the exact chunking pattern `getCustomerReportData` already uses for the same reason — Supabase's `.in()` has practical URL-length limits above ~200 IDs, and the original's `1000` limit param was a base44-specific escape hatch that doesn't map onto `.in()` 1:1):
  ```ts
  const customerIds = [...new Set(workOrders.map(wo => wo.customer_id).filter(Boolean))];
  const customerMap = {};
  const chunkSize = 200;
  for (let i = 0; i < customerIds.length; i += chunkSize) {
    const chunk = customerIds.slice(i, i + chunkSize);
    const { data, error } = await supabase.from('Customer').select('id, org_name, first_name, last_name').in('id', chunk);
    if (error) { console.error('Error fetching customers chunk:', error); continue; }
    (data || []).forEach(c => { customerMap[c.id] = c; });
  }
  ```
- Everything else (the two `fetchAllRows` calls for invoiced + open work orders, the `line_items` JSON parsing and `chargesMap` aggregation, grand total calc) ports verbatim — no other base44 coupling.
- Response shape unchanged: `{ success: true, charges, grandTotal, invoiceCount, startDate, endDate }`.

**Frontend edit — `src/components/reports/OtherChargesBreakdownReport.jsx`:**
- Line 2: swap `base44` import for `supabase` import (same as 3.1).
- Lines 105–108:
  ```diff
  - const response = await base44.functions.invoke('getOtherChargesBreakdown', {
  -   startDate,
  -   endDate
  - });
  + const response = await supabase.functions.invoke('autopro-getOtherChargesBreakdown', {
  +   body: { startDate, endDate }
  + });
  ```
- Lines 110–114 already check `response.data?.success` / `response.data?.error` — this pattern turns out to be **exactly right** for the 200-always convention (Section 0.7) and needs no change: the new function returns `{ success: true, ... }` on success and `{ error: "..." }` (no `success` key) on failure, both as `200`, so `response.data` is always populated and the existing `if (response.data?.success) {...} else { setError(response.data?.error || '...') }` logic already handles both cases correctly. Just add one guard for genuine transport failures, which this file currently has zero handling for: `if (response.error) { setError(response.error.message); return; }` right after the call, before the `if (response.data?.success)` check.

---

### 3.3 `autopro-getSalesAnalysisReport`

**Source to port:** `base44/functions/getSalesAnalysisReport/entry.ts` (lines 1–292, read in full).

**Changes from the base44 version:**
- Same auth/client swap.
- **Zero `base44.entities.*` calls** — `Employee`, `Project`, `ProjectTimeSession` are already queried natively. Straight lift of the entire WO/employee/project/time-session matching and revenue/cost aggregation logic (this is the most complex of the 6 — RO-number-to-WorkPRO-project fuzzy matching, tech pay-rate cost attribution, daily breakdown).
- **Known, pre-existing, out-of-scope data-type issue** (Phase 4 lesson, Section 2): `Employee.pay_rate` is `bigint` in production, so any decimal pay rate already gets rounded before this function even runs — this function's labor-cost math has always been operating on whatever `pay_rate` already is in the DB. Not a regression this phase introduces; not fixing it here (out of scope, tracked already in the blueprint's Phase 4 lessons for a future rate-related phase to pick up).
- Response shape unchanged: `{ summary: {...}, chartData: [...] }`.

**Frontend edit — `src/components/reports/SalesAnalysisReport.jsx`:**
- Line 8: swap import.
- Lines 73–76:
  ```diff
  - const response = await base44.functions.invoke('getSalesAnalysisReport', {
  -   startDate: customStart,
  -   endDate: customEnd
  - });
  + const response = await supabase.functions.invoke('autopro-getSalesAnalysisReport', {
  +   body: { startDate: customStart, endDate: customEnd }
  + });
  ```
- No existing `error` check at all here (line 78 just does `if (response.data) setData(response.data);` inside a try/catch that only logs to console). Since the new function returns `{ error: "..." }` (no `summary` key) inside a `200` on failure (Section 0.7), `if (response.data) setData(response.data)` would actually set `data` to the error object and crash the render (`data.summary` would be `undefined`). Recommend tightening to `if (response.data && !response.data.error) { setData(response.data); } else { console.error(response.data?.error || response.error); }` — this is now a required correctness fix, not just a nice-to-have, given the response-shape change.

**`ReportModal.jsx` bug fix (from Section 0.6), same file family:**
- Line 234:
  ```diff
  - if (currentUser?.role === 'admin' || ['lvl2_user', 'lvl3_user'].includes(currentUser?.access_level)) {
  + if (currentUser?.admin || ['lvl2_user', 'lvl3_user'].includes(currentUser?.autopro_access_lvl)) {
  ```
  This restores the Sales Analysis Report's access gate to actually work (it currently blocks 100% of users, including admins, because the fields it checks don't exist).

---

### 3.4 `autopro-getTechnicianPerformanceReport`

**Source to port:** `base44/functions/getTechnicianPerformanceReport/entry.ts` (lines 1–435, read in full — the longest and most complex of the 6).

**Changes from the base44 version (per 0.1's resolution — migrate what's native, defer the rest to Phase 10):**
- Same auth/client swap.
- `TimeRecord`, `ProjectTimeSession`, `Project`, `UnassignedTime`, `Employee`, `WorkOrder` are all already queried natively — straight lift of the utilization-rate calc, the RO/WO-to-Project fuzzy matching (`findWorkOrder`), and the revenue-attribution/efficiency calc.
- **Remove entirely:** `base44.entities.CashFlowSummary.list()` (line 95) and everything in the "8. Progress Bar Logic" block (lines 396–420) that derives `payrollTarget`/`currentMonthLabourSales`. Response's `progress` field becomes a static `{ target: 0, current: 0 }`.
- Add a code comment at the `progress` field marking it as a deliberate Phase-10-pending stub:
  ```ts
  // TODO(Phase 10): CashFlowSummary isn't natively migrated yet — target/current are
  // hardcoded to 0 until that phase lands. Restore the original payroll-target logic
  // (base44/functions/getTechnicianPerformanceReport/entry.ts lines 396-420) then.
  return new Response(JSON.stringify({
    utilization: utilizationList,
    efficiency: efficiencyList,
    progress: { target: 0, current: 0 }
  }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  ```
- Everything else (utilization map, efficiency map, tech-hours-to-WO revenue distribution) is unaffected — it's a fully separate code path from the progress bar.

**Frontend edit — `src/components/reports/TechnicianPerformanceReportModal.jsx`:**
- Line 11: swap import.
- Lines 87–90: same `base44.functions.invoke` → `supabase.functions.invoke` swap as the others, function name `autopro-getTechnicianPerformanceReport`.
- Line 92: `if (error) throw new Error(error);` → `if (error) throw error;` **and add** `if (data?.error) throw new Error(data.error);` right after (same reasoning as 3.1 — the new function's failure responses arrive inside a `200` body per Section 0.7).
- Progress-bar JSX (lines 139–154): wrap the whole `<Card>` in `{reportData.progress.target > 0 && (...)}` so it disappears entirely rather than rendering a permanently-empty "$0.00 / $0.00" bar. Re-appears automatically once Phase 10 populates a real `target`.

---

### 3.5 `autopro-getWorkOrderSummaryReport`

**Source to port:** `base44/functions/getWorkOrderSummaryReport/entry.ts` (lines 1–389, read in full).

**Changes from the base44 version:**
- Same auth/client swap.
- **Remove entirely** (per Section 0.3 — confirmed safe): `const statuses = await base44.entities.WorkOrderStatus.list();` and `const statusMap = new Map(statuses.map(s => [s.id, s.name]));` (lines 80–81). Change line 346 from:
  ```diff
  - const statusName = statusMap.get(statusVal) || statusVal || 'Unassigned';
  + const statusName = statusVal || 'Unassigned';
  ```
- Everything else — the aging-bucket calc, WIP revenue/cost breakdown, parts-cost-from-line-items, labor-cost-from-tech-time-and-WorkPRO-sessions, 30-day closed-revenue comparison, status breakdown — is pure native-table logic already, straight lift.
- Response shape unchanged (the large `summary` object with `wipRevenue`/`wipCost`/`aging`/`statusBreakdown`/`margins`).

**Frontend edit — `src/components/reports/WorkOrderSummaryReport.jsx`:**
- Line 6: swap import.
- Line 30:
  ```diff
  - const response = await base44.functions.invoke('getWorkOrderSummaryReport');
  + const response = await supabase.functions.invoke('autopro-getWorkOrderSummaryReport');
  ```
  (No params — this function takes no request body, matches the original.)
- Line 31: `if (response.data) { setData(response.data); }` has no error handling at all currently. Since the new function's failure response is `{ error: "..." }` (no `totalWorkOrders`/`wipRevenue` keys) inside a `200` (Section 0.7), same fix as 3.3: change to `if (response.data && !response.data.error) { setData(response.data); } else { console.error(response.data?.error || response.error); }`. Required for correctness, not just visibility — the raw `if (response.data)` as originally written would otherwise try to render an error object as if it were a report.

---

### 3.6 `autopro-getRealTimeInventoryOnOrder`

**Source to port:** `base44/functions/getRealTimeInventoryOnOrder/entry.ts` (lines 1–171, read in full).

**Changes from the base44 version:**
- Same auth/client swap — **note:** the original base44 version has **no `base44.auth.me()` check at all** (it's the only one of the 6 with zero auth gating). Adding the standard auth check here (returning `{ error: 'Unauthorized' }` in a `200` body per Section 0.7, same as the other 5) is a genuine, deliberate security improvement over the current behavior, not just a refactor — flagging this explicitly since it's a small behavior change (an unauthenticated caller could previously invoke this function; after migration they can't). Consistent with "prioritize writing safe, secure code" and matches every sibling `autopro-*` function's convention.
- **One `base44.entities.InventoryItem.filter({ id: { $in: inventoryIds } })` call to replace** (line 123–125): `InventoryItem` is fully native (4,441 rows, confirmed) → replace with:
  ```ts
  const { data: inventoryItems, error: invError } = await supabase
    .from('InventoryItem')
    .select('*')
    .in('id', inventoryIds);
  if (invError) throw invError;
  ```
  (No chunking needed here in practice — `inventoryIds` is bounded by distinct items actually on order across active WOs, realistically well under 200; but if this proves wrong during verification, apply the same 200-item chunking pattern as 3.2.)
- `Supplier` is already queried natively — unaffected.
- Response shape unchanged: `{ success: true, data: enrichedItems }`.

**Frontend edit — `src/components/reports/InventoryOnOrder.jsx`:**
- Line 2: swap import.
- Line 22:
  ```diff
  - const response = await base44.functions.invoke('getRealTimeInventoryOnOrder');
  + const response = await supabase.functions.invoke('autopro-getRealTimeInventoryOnOrder');
  ```
- Lines 24–28 already check `response.data && response.data.success`, throwing `response.data?.error || 'Failed to fetch real-time data'` otherwise — this pattern already correctly handles the new function's `{ error: "..." }`-in-a-200-body failure shape (Section 0.7) with **no change needed** to that part. Just add `if (response.error) throw response.error;` immediately before it, to also catch genuine transport failures (which this file currently has zero handling for).

---

### 3.7 `PartsMovementReportModal.jsx` — direct RPC, no new Edge Function

This one doesn't need a new `autopro-*` function — `get_parts_movement_v2` is already a native Postgres function, confirmed via direct query:
- Not `SECURITY DEFINER` (runs as the calling role).
- Granted to `anon`, `authenticated`, `postgres`, `service_role` — callable directly by an authenticated frontend session.
- Since every table it touches (`WorkOrder`, `InventoryItem`) already has a wide-open `public`/`qual: true` RLS policy (Section 2), calling it directly as the authenticated user returns identical data to today's service-role-proxied call — **confirmed no RLS regression risk**.

**Frontend edit — `src/components/reports/PartsMovementReportModal.jsx`:**
- Line 10: remove `import { base44 } from "@/api/base44Client";`, add `import { supabase } from "@/lib/supabase";`
- Lines 87–95:
  ```diff
  - const { data, error } = await base44.functions.invoke('SupabaseProxy', { 
  -   action: 'rpc',
  -   table: 'get_parts_movement_v2',
  -   data: {
  -     p_start_date: dateFrom,
  -     p_end_date: dateTo,
  -     p_search_term: debouncedSearch
  -   }
  - });
  -
  - if (error) throw new Error(error);
  -
  - if (data && data.data) {
  -   setReportData(data.data);
  - }
  + const { data, error } = await supabase.rpc('get_parts_movement_v2', {
  +   p_start_date: dateFrom,
  +   p_end_date: dateTo,
  +   p_search_term: debouncedSearch
  + });
  +
  + if (error) throw error;
  +
  + if (data) {
  +   setReportData(data);
  + }
  ```
  Note the response shape changes here (unlike the other 6): `supabase.rpc()` returns the row array directly in `data`, not wrapped in a `{ data: {...} }` envelope the way `SupabaseProxy`'s generic passthrough did — hence `data` instead of `data.data`.

---

## 4) Verification Plan

Per Section 0.5's resolution, this phase's verification is split between **agent** (output-correctness, no UI needed) and **user** (live UI click-through at `test.kensauto.ca`, which requires you to manually repoint that environment's Supabase project first). Every checklist item below is tagged `[Agent]` or `[User]` accordingly. Zero writes occur anywhere in this phase, so all of this — including direct production reads — is safe.

**Silent-failure double-check per Section 2's lesson:** for each report, also open the browser console during UI testing and confirm no swallowed errors — several of these frontend files had weak/no error surfacing in their original base44 form (3.3, 3.5 especially), so a report that silently renders empty must be distinguished from one that's actually correct.

### Step-by-step

1. **[Agent, before any code changes]** For each of the 7 reports' underlying base44 function, invoke it directly (or via the existing UI, read-only) with a fixed, representative date range (e.g. "This Month") and record the exact JSON response — this is the baseline.
2. **[Agent]** Build and deploy the 6 new Edge Functions (Section 3.1–3.6) to **both** production and the dev branch (per the established "two environments, two separate deploy steps" lesson from Phase 2/4).
3. **[Agent]** Apply the 7 frontend edits (Section 3.1–3.7).
4. **[Agent]** Re-invoke each new Edge Function directly with the **same** inputs used in step 1 and diff the JSON response against the recorded baseline — every field should match exactly. This confirms output correctness without needing the UI at all.
5. **[Agent]** Confirm `autopro-getRealTimeInventoryOnOrder`'s new auth check returns `{ error: 'Unauthorized' }` as a `200` (Section 0.7), not a `401`, when called without a valid bearer token.
6. **[Agent]** Repo-wide grep: `base44.functions.invoke\('(getCustomerReportData|getOtherChargesBreakdown|getSalesAnalysisReport|getTechnicianPerformanceReport|getWorkOrderSummaryReport|getRealTimeInventoryOnOrder)'` and `SupabaseProxy.*get_parts_movement_v2` both return zero hits in `src/`. Confirm `npm run build` is clean (necessary, not sufficient per Section 2's lesson).
7. **[User, once you've repointed `test.kensauto.ca`]** Click through all 7 reports live, confirm they render and match what you'd expect from the equivalent production data; confirm `ReportModal.jsx`'s Sales Analysis gate (0.6 fix) now correctly opens for an admin/`lvl2_user`/`lvl3_user` account and still blocks a plain user; confirm interactive bits (charge-detail drill-down, print view, Parts Movement sort/filter/search) still work.

### Checklist

- [x] 0.1 answered — migrate utilization/efficiency now, defer progress bar to Phase 10 (see Section 0.1 and `master_blueprint.md` Phase 10 note)
- [x] 0.3 confirmed — `WorkOrderStatus` lookup dropped permanently, not deferred
- [x] 0.5 answered — agent verifies output correctness directly; user verifies live UI manually after repointing `test.kensauto.ca`
- [x] 0.7 correction applied — all 6 new Edge Functions redesigned to the `master_context.md`-mandated always-`200` convention
- [ ] **[Agent]** Baseline (pre-change) JSON output recorded for all 6 base44 functions + the `get_parts_movement_v2` RPC (progress bar excluded — see below)
- [ ] **[Agent]** `autopro-getCustomerReportData` deployed (prod + dev branch); direct-invoke output matches baseline
- [ ] **[Agent]** `autopro-getOtherChargesBreakdown` deployed (prod + dev branch); direct-invoke output matches baseline
- [ ] **[Agent]** `autopro-getSalesAnalysisReport` deployed (prod + dev branch); direct-invoke output matches baseline
- [ ] **[Agent]** `autopro-getTechnicianPerformanceReport` deployed (prod + dev branch); utilization/efficiency output matches baseline
- [x] Progress bar verification **intentionally skipped** — card is hidden client-side (`target === 0`) until Phase 10 migrates `CashFlowSummary`; nothing to verify this phase
- [ ] **[Agent]** `autopro-getWorkOrderSummaryReport` deployed (prod + dev branch); direct-invoke output matches baseline
- [ ] **[Agent]** `autopro-getRealTimeInventoryOnOrder` deployed (prod + dev branch); direct-invoke output matches baseline; new auth check confirmed returning `200`+`{error}`, not `401`
- [ ] **[Agent]** `PartsMovementReportModal.jsx` direct-RPC call confirmed returning the same rows as the old `SupabaseProxy`-routed call for an identical date range
- [ ] **[Agent]** Repo-wide grep for all 6 old function names + `SupabaseProxy`+`get_parts_movement_v2` returns zero hits in `src/`; `npm run build` clean (necessary, not sufficient per Section 2 lesson — do not treat as the finish line)
- [ ] **[Agent]** Confirmed zero file overlap issues with the concurrently-running Phase 5 (spot-check: no merge conflicts in `src/components/reports/` from the other agent's work, since that directory isn't in Phase 5's scope)
- [ ] **[User]** All 7 reports click through correctly live at `test.kensauto.ca` once repointed; console checked for silently-swallowed errors
- [ ] **[User]** `OtherChargesBreakdownReport.jsx` charge-detail drill-down dialog still opens correctly
- [ ] **[User]** `SalesAnalysisReport.jsx` both charts (pie + daily bar) render correctly
- [ ] **[User]** `WorkOrderSummaryReport.jsx` all 4 stat cards, both charts, aging table, and status-breakdown table render correctly
- [ ] **[User]** `InventoryOnOrder.jsx` grouped-by-supplier table renders correctly; print view still works
- [ ] **[User]** `PartsMovementReportModal.jsx` sort/filter/search still function client-side; totals footer correct
- [ ] **[User]** `ReportModal.jsx` `role`/`access_level` → `admin`/`autopro_access_lvl` fix verified: admin user can open Sales Analysis, non-privileged user still blocked
