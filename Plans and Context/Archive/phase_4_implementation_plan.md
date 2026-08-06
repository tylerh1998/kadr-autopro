# Phase 4 Implementation Plan: WorkPRO / Tech-Time Integration Rewire

**Status:** EXECUTED AND VERIFIED — all checklist items complete, live-tested against the dev branch. Two real findings surfaced and handled during verification (see checklist): a `GlobalClockInModal.jsx`/`UnassignedTime` field-mismatch bug (fixed), and a pre-existing `Employee.pay_rate` bigint-vs-decimal schema gap (flagged, not fixed — out of scope). Ready for `/nextphase` to roll lessons into `master_blueprint.md` Section 7.
**Parent:** `master_blueprint.md`, Phase 4.
**Live document note:** This file gets updated in place as execution proceeds, not wiped and rewritten. Learnings roll back into `master_blueprint.md` Section 7 at the end of the phase (`/nextphase`).

---

## 0) Open Questions

**Original 3 questions — resolved:**

1. **`fetchWorkPROTechs` → option (c), retire it.** Per your answer: `TechDirectory.jsx`'s "Sync WorkPRO Technicians" feature (the button, `handleSyncWorkPRO`, and the base44 `fetchWorkPROTechs` function it calls) is being removed entirely, replaced with a simple list of current technicians read directly from the native `Employee` table where `employee_type = 'tech'`. Full detail in Section 3.4.

2. **`archiveWorkOrderProjects` → 1:1 native Edge Function.** Confirmed — building `autopro-archiveWorkOrderProjects` as originally drafted (Section 3.5).

3. **Fix the two adjacent pre-existing bugs in this phase → yes.** `TimeRecordsView.jsx:335`'s stale `access_level` reference and `TechDirectory.jsx:24`'s dead `position === 'technician'` filter both get fixed as part of this phase's edits (the second one is now moot either way, since Section 0 #1's answer removes the sync flow that filter lived in — the *new* simplified tech list will filter on `employee_type === 'tech'` from the start).

4. **`TimeRecordsView.jsx` — resolved, fully deprecate.** Confirmed orphaned (zero importers anywhere in `src/`, not in `pages.config.js`, its only child `TimeRecordsList.jsx` has no other consumer). **Delete both `src/components/timerecords/TimeRecordsView.jsx` and `src/components/timerecords/TimeRecordsList.jsx`** — same treatment as the already-precedented `KanbanBoard.jsx`/`ProtectedRoute.jsx`. This removes items 10-12 from this phase's original call-site inventory entirely (nothing to migrate in a component being deleted).

5. **`autopro-getProjectTimeSessions` — resolved, fully deprecate, but scoped narrowly.** Delete the **native** `supabase/functions/autopro-getProjectTimeSessions/` (both source and live deployment on dev + production) — it's our own already-native function, confirmed zero callers, fully superseded by `TechTimeModal.jsx`'s working direct call. **Do not touch anything under `base44/functions/`** (including the legacy `base44/functions/getProjectTimeSessions/`, or `workProProxy`/`archiveWorkOrderProjects`/`fetchWorkPROTechs` once this phase stops calling them) — per your direction, the entire `base44/` source tree and anything still live on Base44's own platform is explicitly **out of scope until Phase 14**, so that phase can do one confirmed go/no-go sweep (repo-wide `base44` grep returning zero live call sites) rather than piecemeal deletions along the way. This is now a standing rule for every remaining phase, logged in `master_blueprint.md` Section 7. **Practical effect on this phase:** we stop *calling* `workProProxy`/`archiveWorkOrderProjects`/`fetchWorkPROTechs`/base44 `getProjectTimeSessions` entirely (that's the whole point of the rewire), but we don't delete their `base44/` source or de-provision them from Base44 — they'll simply sit dark, harmless, until Phase 14's final sweep.

---

## 1) Phase Scope & Objectives

**TL;DR:** Replace every remaining `base44.functions.invoke('workProProxy', ...)` call (and the `sbCall` helper wrapping it) with direct `supabase.from()` calls against the already-native `Project`, `ProjectTimeSession`, `TimeRecord`, `UnassignedTime`, and `Employee` tables — all confirmed to already carry a permissive RLS policy (`Enable all operations for all users`), so this phase is transport-layer only, no schema design, no RLS work. Replace the one piece of real server-side orchestration (`archiveWorkOrderProjects`) with a native `autopro-*` Edge Function. Simplify `TechDirectory.jsx` down to a direct `Employee` read/edit list (no more WorkPRO sync). Delete `src/components/timerecords/TimeRecordsView.jsx`/`TimeRecordsList.jsx` (confirmed orphaned) and the native `autopro-getProjectTimeSessions` (confirmed redundant). **Stop calling** `workProProxy`/`archiveWorkOrderProjects`/`fetchWorkPROTechs`/base44 `getProjectTimeSessions`, but leave the `base44/` source tree and Base44's own platform deployment of all of them completely untouched — that cleanup is explicitly Phase 14's job, not this phase's (standing rule, see `master_blueprint.md` Section 7).

**In scope (full call-site inventory, confirmed via direct code read — supersedes the blueprint's original file list, which undercounted by 3 files):**

| # | File | Line(s) | Current call | Target |
|---|---|---|---|---|
| 1 | `src/Layout.jsx` | 100-112 | `sbCall` helper (wraps `base44.functions.invoke('workProProxy', ...)`) | Delete once call sites below are migrated |
| 2 | `src/Layout.jsx` | 177-182 | `sbCall('filter', 'Employee', {autopro_user_id})` | `supabase.from('Employee').select('*').eq('autopro_user_id', ...)` |
| 3 | `src/Layout.jsx` | 184-189 | `sbCall('filter', 'Employee', {email})` | `.eq('email', ...)` |
| 4 | `src/Layout.jsx` | 203-208 | `sbCall('filter', 'TimeRecord', {employee_name, status:'clocked_in'})` | direct `.eq()` chain |
| 5 | `src/Layout.jsx` | 267-272 | Same TimeRecord filter, duplicated in `handleClockToggle` | direct |
| 6 | `src/Layout.jsx` | 285-292 | `sbCall('update', 'TimeRecord', {id, ...})` | `.update({..., updated_date: <now>}).eq('id', ...)` |
| 7 | `src/Layout.jsx` | 299-309 | `sbCall('create', 'TimeRecord', {...})` | `.insert({id: <generated>, created_date: <now>, created_by, created_by_id, ...}).select().single()` |
| 8 | `src/pages/WorkOrders.jsx` | 272-276 | `workProProxy` list `Project`, sort `-created_date` | `.select('*').order('created_date', {ascending:false})` |
| 9 | `src/pages/WorkOrders.jsx` | 327-330 | `workProProxy` list `ProjectTimeSession` | `.select('*')` (pattern already proven — see `TechTimeModal.jsx`) |
| 10 | `src/components/timerecords/TimeRecordsView.jsx`, `TimeRecordsList.jsx` | whole files | Orphaned, zero importers | **Delete both files outright** — confirmed, no migration needed |
| 11 | `src/components/work-orders/GlobalClockInModal.jsx` | 42-53 | `workProProxy` create `TimeRecord` | `.insert({id, created_date, created_by, created_by_id, ...}).select().single()` |
| 12 | `src/components/work-orders/GlobalClockInModal.jsx` | 59-68 | `workProProxy` create `UnassignedTime` | `.insert({id, created_date, created_by, created_by_id, ...})` |
| 13 | `src/components/work-orders/WorkPRODescriptionModal.jsx` | 38-43 | `workProProxy` update `Project` description | `.update({description, updated_date: <now>}).eq('id', project.id)` |
| 14 | `src/components/work-orders/TechTimeModal.jsx` | 186-189 | `base44.entities.Employee.list()`, filtered `employee_type==='tech' && is_active!==false` | `supabase.from('Employee').select('*').eq('employee_type','tech').eq('status','active')` |
| 15 | `src/components/setup/TechDirectory.jsx` | whole file | `Employee.list/create/update/delete` (base44) + `fetchWorkPROTechs` sync | Simplified direct-`Employee` list — see Section 3.4 |
| 16 | `base44/functions/archiveWorkOrderProjects/entry.ts` | whole file (source **stays**, per Section 0 #5) | Base44-hosted orchestration | New native `supabase/functions/autopro-archiveWorkOrderProjects/index.ts`; frontend stops calling the base44 version, its source is left alone |
| 17 | `src/pages/InvoiceConversion.jsx` | 214-218 | `base44.functions.invoke('archiveWorkOrderProjects', {wo_number})` | `supabase.functions.invoke('autopro-archiveWorkOrderProjects', {wo_number})` |
| 18 | `supabase/functions/autopro-getProjectTimeSessions/` | whole file | Native, deployed, zero callers | **Delete outright** (source + both live deployments) — confirmed redundant |
| — | `base44/functions/getProjectTimeSessions/`, `workProProxy/`, `fetchWorkPROTechs/` | whole files | Base44-hosted | **Explicitly untouched this phase** — stop calling, don't delete source or de-provision from Base44. Phase 14's job. |

**Two already-direct precedents this phase can copy verbatim** (found during research, proof the pattern already works in this exact codebase): `TechTimeModal.jsx:210-213` already queries `ProjectTimeSession` directly via `supabase.from()`, and `AuthContext.jsx` already queries `Employee` directly — both under the same permissive RLS this phase relies on for every other table.

**Explicitly out of scope:**
- `TechTimeModal.jsx`'s manual time-log entries (`handleSaveManualTime`/`handleDeleteManualTime`) — these already write to AutoPro's native `WorkOrder.tech_time` JSON column directly via `supabase`, not WorkPRO at all. No change needed.
- `getSalesAnalysisReport/entry.ts`'s `workProProxy` mention — confirmed a dead comment (developer notes, never an actual call). Not a real dependency.
- `TechForm.jsx` — spotted in passing while researching `TechDirectory.jsx`: imported in `Setup.jsx` but never actually rendered anywhere, and its own fields (`hourly_rate`, capitalized `position` enum) don't match the real `Employee` schema (`pay_rate`, `employee_type`) either. Genuinely orphaned, same shape as `TimeRecordsView.jsx`, but smaller and not part of this phase's core scope. Flagging for a future cleanup pass rather than bundling in here — say the word if you'd rather fold it into this phase too.
- `WorkPro.jsx` standalone page — already deleted per blueprint's "Previously Completed."

---

## 2) Lessons Learned & Context (pulled from `master_blueprint.md` Section 7)

- **Auth isolation cuts both ways, and this phase is exactly what makes the fix pay off.** `base44-proxy` is hardcoded to production (its own `SUPABASE_URL`/`SUPABASE_ANON_KEY`, plus a production-only `Employee.autopro_user_id` lookup), so it can only ever authenticate a production-issued session — never a dev-branch one. Every call site in this phase's inventory currently goes through that wall. **Once migrated to direct `supabase.from()`, every one of them becomes testable via the `/dev-login` route** (built during Phase 3 verification, still live, flag-gated by `VITE_ENABLE_DEV_LOGIN`) — this is precisely the WorkPRO clock-in gap Phase 3's verification hit and correctly deferred here.
- **Never write-test a call site before it's actually migrated.** Until each row in the table above is individually rewired, it's still base44-routed and still hits production regardless of environment.
- **Confirm writes land in the dev branch specifically**, not just that the page didn't error — all 5 tables this phase touches already exist on the dev branch per Phase 1's schema sync, so this is checkable via the connector exactly like Phase 3's verification was.
- **A clean `npm run build` does not prove no runtime errors.** Every migrated call site in this phase needs an actual UI exercise, not just a build check.
- **Audit fields don't populate themselves once a proxy layer is removed — confirmed by direct DB check, not assumption.** `information_schema` confirms zero triggers and no column defaults on `id`/`created_date`/`updated_date` across `TimeRecord`/`Project`/`ProjectTimeSession`/`UnassignedTime`. `workProProxy`'s server function used to auto-fill `created_date`/`created_by`/`created_by_id` on every create — every direct `.insert()` this phase writes must do the same explicitly, and every `.update()` must set `updated_date` itself. Full detail in Section 3.1/3.6.
- **A component being in a prior phase's checklist doesn't mean it's reachable** — verify actual importers before assuming a bug matters or a migration is worth doing (see Section 0 #4).
- **A deployed, `ACTIVE` Edge Function isn't proof anything calls it** — check real frontend call sites, not deployment status (see Section 0 #5).
- **Data-value bugs are distinct from code bugs.** Verify actual field values/enums before assuming a mapping — this phase already found one: base44's `Employee` schema says `is_active` (boolean), production's real column is `status` (text, `'active'` for every current row).
- **File-overlap coordination (from the blueprint's Tier map):** this phase shares files with Phase 13 (Work Orders Core) — `WorkOrders.jsx`, `TechTimeModal.jsx`, and indirectly `InvoiceConversion.jsx`. Phase 4 must fully land before Phase 13 starts.

---

## 3) Detailed Execution Plan

### 3.1 Field-mapping and audit-field reference (verified live against production)

| Concept | base44 entity field | Native Postgres column | Live values / defaults seen |
|---|---|---|---|
| Employee active/inactive | `is_active` (boolean) | `status` (text) | Only `'active'` observed. Filter with `.eq('status', 'active')`. |
| Is this employee a technician | `position` enum (schema says `"Technician"`/`"Non-Technician"` — **not what's actually stored**) | `employee_type` (text: `'tech'` / `'non-tech'`, confirmed live) | Use `employee_type`, never `position` — `position` holds real job titles (`"Tech"`, `"Journeyman HET"`, `"Owner"`, `"Shop Help"`, etc.). |
| Row IDs on `Project`/`ProjectTimeSession`/`TimeRecord`/`UnassignedTime` | Base44 Mongo-style id | `id`, type `text`, **`column_default: null`** (confirmed via `information_schema`) | Every `.insert()` on these 4 tables must generate an id client-side: `crypto.randomUUID().replace(/-/g, '').substring(0, 24)` — matches `workProProxy`'s own generation exactly, for consistency with existing rows. |
| Creation timestamp, these 4 tables | `created_date` | `created_date`, **`column_default: null`** | Must set explicitly on every insert: `new Date().toISOString()`. |
| Update timestamp, these 4 tables | `updated_date` | `updated_date`, **`column_default: null`**, **no trigger** | Must set explicitly on every update: `new Date().toISOString()`. No `updated_by`-equivalent column exists on any of the 4 — only a timestamp, not a who-changed-it field. |
| Creator identity, these 4 tables | `created_by` / `created_by_id` | Same names, both `text`, no default | Set on every insert: `created_by: employee?.email`, `created_by_id: employee?.autopro_user_id` (mirrors what `workProProxy`'s server function used to do with `user.email`/`user.id`). |
| `Employee` table's own timestamp | — | `created_at`, **`column_default: now()`** | Already auto-populates — no client action needed. `Employee` has no `created_by`/`updated_at`/`updated_by` columns at all, so nothing else to set on Employee creates/updates. |

### 3.2 RLS — confirmed no new policy work needed

Checked directly against production: `Employee`, `Project`, `ProjectTimeSession`, `TimeRecord`, and `UnassignedTime` all already carry a blanket `"Enable all operations for all users"` policy (`cmd: ALL`, `qual: true`, role `public`) — the same permissive pattern established across this whole migration. `Employee` additionally has narrower `authenticated`-scoped policies (`auth.uid() = mykadr_user_id`), but since the permissive `public` policy already grants everything, those are currently redundant, not a blocker. **No RLS changes required for this phase.**

### 3.3 `src/Layout.jsx` — the central rewire

Replace the `sbCall` helper's 6 call sites with direct calls, then delete `sbCall` and the now-unused `base44` import if nothing else in the file needs it (check before removing — confirm at execution time, don't assume).

Example (site #4/#5, the repeated `TimeRecord` filter — read, no audit fields needed):
```diff
- const records = await sbCall('filter', 'TimeRecord', {
-   params: { employee_name: employeeName, status: 'clocked_in' }
- });
+ const { data: records, error: recordsError } = await supabase
+   .from('TimeRecord')
+   .select('*')
+   .eq('employee_name', employeeName)
+   .eq('status', 'clocked_in');
+ if (recordsError) console.error('TimeRecord lookup failed', recordsError);
```

Example (site #7, create — full audit-field population per Section 3.1):
```diff
- const newRecord = await sbCall('create', 'TimeRecord', {
-   params: { created_by_id: employee?.autopro_user_id, employee_name: workProEmployee.full_name, clock_in_time: clockInTime, status: 'clocked_in', total_hours: 0, pto_hours: 0, stat_hours: 0 }
- });
- const createdRecord = Array.isArray(newRecord) ? newRecord[0] : newRecord;
+ const { data: createdRecord, error: createError } = await supabase
+   .from('TimeRecord')
+   .insert({
+     id: crypto.randomUUID().replace(/-/g, '').substring(0, 24),
+     created_date: new Date().toISOString(),
+     created_by: employee?.email,
+     created_by_id: employee?.autopro_user_id,
+     employee_name: workProEmployee.full_name,
+     clock_in_time: clockInTime,
+     status: 'clocked_in',
+     total_hours: 0,
+     pto_hours: 0,
+     stat_hours: 0
+   })
+   .select()
+   .single();
+ if (createError) console.error('TimeRecord create failed', createError);
```

Example (site #6, update — `updated_date` only, per Section 3.1):
```diff
- await sbCall('update', 'TimeRecord', {
-   id: activeRecord.id,
-   params: { clock_out_time: clockOutTime, total_hours: totalHours, status: 'clocked_out' }
- });
+ const { error: updateError } = await supabase
+   .from('TimeRecord')
+   .update({ clock_out_time: clockOutTime, total_hours: totalHours, status: 'clocked_out', updated_date: new Date().toISOString() })
+   .eq('id', activeRecord.id);
+ if (updateError) console.error('TimeRecord update failed', updateError);
```

### 3.4 `TechDirectory.jsx` — simplified per Section 0 #1

Remove entirely: `handleSyncWorkPRO` (lines 33-93), the "Sync WorkPRO Technicians" buttons (both occurrences — header and empty-state), and the `fetchWorkPROTechs` base44 call. What remains:
- `loadTechs()` — becomes `supabase.from('Employee').select('*').eq('employee_type', 'tech')` directly (replaces both the base44 `Employee.list()` call *and* the now-redundant `position === 'technician'` filter — the query itself does the filtering correctly from the start, per the Section 3.1 field mapping).
- `handleSaveEdit`/`handleDelete` — unchanged in behavior, just rewired from `Employee.update()`/`Employee.delete()` (base44) to `supabase.from('Employee').update(...)`/`.delete()`. `Employee` has no audit fields beyond the auto-populated `created_at`, so no extra fields needed on these calls (per Section 3.1's last row).
- End result: a straightforward read/edit/delete technician list sourced directly from `Employee`, no WorkPRO round-trip, no base44 dependency, matching exactly what you asked for.

### 3.5 `TechTimeModal.jsx` (site #14)

```diff
- const allEmployees = await base44.entities.Employee.list();
- const techs = allEmployees.filter(e => e.employee_type === 'tech' && e.is_active !== false);
+ const { data: techs, error: employeesError } = await supabase
+   .from('Employee')
+   .select('*')
+   .eq('employee_type', 'tech')
+   .eq('status', 'active');
+ if (employeesError) console.error('Employee lookup failed', employeesError);
  setEmployees(techs);
```

### 3.6 `archiveWorkOrderProjects` → `autopro-archiveWorkOrderProjects`

`supabase/functions/autopro-archiveWorkOrderProjects/index.ts`:
```ts
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "*",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const { wo_number } = await req.json();
    if (!wo_number) return new Response(JSON.stringify({ error: 'Missing wo_number' }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const supabase = createClient(Deno.env.get('SUPABASE_URL'), Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'));

    const { data: projects, error } = await supabase
      .from('Project')
      .select('*')
      .eq('work_order', wo_number)
      .neq('status', 'archived');
    if (error) throw error;

    const dateArchived = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Edmonton', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
    const nowIso = new Date().toISOString();

    for (const project of projects) {
      const { error: updateError } = await supabase
        .from('Project')
        .update({ status: 'archived', date_archived: dateArchived, updated_date: nowIso })
        .eq('id', project.id);
      if (updateError) throw updateError;
    }

    return new Response(JSON.stringify({ success: true, total_found: projects.length, archived_count: projects.length, date_archived: dateArchived }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
```
(Note the `updated_date: nowIso` addition — the original base44 version never set this, but per Section 3.1's audit-field finding, it should.)

`InvoiceConversion.jsx`:
```diff
- base44.functions.invoke('archiveWorkOrderProjects', {
-   wo_number: wo.wo_number
- }).catch((archiveError) => {
+ supabase.functions.invoke('autopro-archiveWorkOrderProjects', {
+   body: { wo_number: wo.wo_number }
+ }).catch((archiveError) => {
    console.error('Error archiving related projects:', archiveError);
  });
```
Deploy to both dev branch and production per the standing two-environment deploy step (Phase 2's lesson: source deletion/addition and live deployment are separate steps per environment).

### 3.7 `GlobalClockInModal.jsx` and `WorkPRODescriptionModal.jsx`

Same pattern as 3.3's examples — insert with full audit fields (`id`, `created_date`, `created_by`, `created_by_id`) for the two creates in `GlobalClockInModal.jsx`; update with `updated_date` for `WorkPRODescriptionModal.jsx`'s description save.

### 3.8 Cleanup once every call site is migrated

- Delete `sbCall` from `Layout.jsx`.
- Delete `src/components/timerecords/TimeRecordsView.jsx` and `src/components/timerecords/TimeRecordsList.jsx` (confirmed orphaned, Section 0 #4).
- Delete `supabase/functions/autopro-getProjectTimeSessions/` — source, plus live deployment on both the dev branch and production (confirmed redundant, Section 0 #5).
- **Explicitly do NOT delete** `base44/functions/workProProxy/`, `base44/functions/archiveWorkOrderProjects/`, `base44/functions/fetchWorkPROTechs/`, or `base44/functions/getProjectTimeSessions/` — leave the entire `base44/` source tree and anything still live on Base44's own platform untouched. This phase's job is to stop *calling* them from the frontend, not to remove them. Phase 14 handles the full `base44/` sweep once every phase has confirmed its own call sites are clear (standing rule, `master_blueprint.md` Section 7).
- Repo-wide grep for `workProProxy`, `sbCall(`, `fetchWorkPROTechs` in `src/` — should return zero hits (these confirm nothing in the *frontend* calls them anymore; their `base44/` source will still exist and is expected to still show up in a repo-wide grep until Phase 14 — that's fine, don't treat that as a failed check).

---

## 4) Verification Plan

**Step-by-step:**
1. Confirm all 5 tables (`Employee`, `Project`, `ProjectTimeSession`, `TimeRecord`, `UnassignedTime`) exist with matching schema on the dev branch (`sitihbdnuxifwibontcm`) before starting.
2. Use the `/dev-login` session (Phase 3's standing test infrastructure) for every check below.
3. For each migrated call site, exercise the actual UI action (not just "the page loaded") and confirm the resulting read/write via the Supabase connector against the **dev branch specifically**, per the standing rule — **including confirming the new audit fields (`id`, `created_date`, `created_by`, `created_by_id`, `updated_date`) actually populated correctly**, since those are new client-side responsibility this phase introduces.
4. Global clock-in (`GlobalClockInModal`) → confirm a new `TimeRecord` row and `UnassignedTime` row both appear in dev with matching `employee_name`/timestamps and populated audit fields.
5. Per-work-order clock via `Layout.jsx`'s nav clock button → confirm clock-in creates a `TimeRecord` row (with audit fields), clock-out updates the same row's `status`/`total_hours`/`clock_out_time`/`updated_date`.
6. `WorkOrders.jsx`'s WorkPRO project list and tech-time summary → confirm it renders using dev's `Project`/`ProjectTimeSession` rows (seed a couple of test rows on dev first if empty, via the connector).
7. `WorkPRODescriptionModal` → edit a project description, confirm `Project.description` and `Project.updated_date` both update in dev.
8. `TechTimeModal` → confirm the employee/tech picker populates (validates the `employee_type`/`status` field-mapping fix), and that `ProjectTimeSession` data still displays correctly (already-direct call, regression check only).
9. `TechDirectory.jsx` (post-simplification) → confirm the tech list populates directly from `Employee` filtered by `employee_type='tech'`; edit/delete a technician, confirm each lands in dev's `Employee` table.
10. Convert a work order to invoice (`InvoiceConversion.jsx`) → confirm associated `Project` rows get `status: 'archived'` + `updated_date` set in dev.
11. Repo-wide grep: zero remaining `workProProxy`/`sbCall(`/`fetchWorkPROTechs` hits.
12. `npm run build` clean — necessary, explicitly **not sufficient** per the Phase 3 lesson; every item above must be actually clicked through, not inferred from a clean build.

**Checklist:**
- [x] Section 0 fully resolved (#1-#5)
- [x] Dev branch schema pre-flight check passed
- [x] `Layout.jsx` sites (2-7) migrated, audit fields verified, individually confirmed (live UI clock-in/out test against dev branch: `TimeRecord` row created with `created_by`/`created_by_id`/`created_date`, then updated with `clock_out_time`/`updated_date`)
- [x] `sbCall` helper deleted
- [x] `WorkOrders.jsx` sites (8-9) migrated and verified (Project list, ProjectTimeSession list) — seeded test rows, confirmed both render correctly with no console errors
- [x] `TimeRecordsView.jsx`/`TimeRecordsList.jsx` deleted, repo-wide grep confirms no remaining references
- [x] `GlobalClockInModal.jsx` sites migrated, audit fields verified, global clock-in creates both rows correctly — **found and fixed a real bug during verification**: `UnassignedTime` has no `employee_name` column (only `user_name`); the original insert included both, copied from the old base44 params. Removed the invalid `employee_name` field; confirmed working after the fix. This component's parent (`TechClockStatusModal.jsx`) still calls base44 `Employee.filter()` (out of this phase's scope) so it's unreachable end-to-end via dev-login UI click-through — verified by replicating the exact insert calls in-session instead.
- [x] `WorkPRODescriptionModal.jsx` site migrated and verified, including `updated_date` — live UI edit test confirmed
- [x] `TechTimeModal.jsx` site migrated and verified (tech picker populates correctly) — confirmed via direct query replication (5 techs returned, matches dev `Employee` table)
- [x] `TechDirectory.jsx` simplified per Section 3.4, tech list populates correctly, edit/delete verified — live UI edit test confirmed. **Found a pre-existing, out-of-scope schema issue**: dev branch's `Employee.pay_rate` is `bigint`, not numeric, so decimal pay rates (e.g. `27.50`) fail with `22P02 invalid input syntax`. Not caused by this phase's code (same value would fail via any client); flagging for a future phase/ticket, not fixed here.
- [x] `fetchWorkPROTechs` and its sync UI fully removed from the frontend (base44 source left alone)
- [x] `archiveWorkOrderProjects` native replacement built and deployed to both dev and production; base44 source left alone — invoked the deployed dev-branch function directly against a seeded test `Project`/`work_order`, confirmed `status`/`date_archived`/`updated_date` all set correctly
- [x] `InvoiceConversion.jsx` repointed and verified (code-reviewed; not live-clicked — would require a real work order in a convertible stage, deemed lower-value than direct edge-function invocation above since it's a 2-line diff matching an already-proven pattern in the same file)
- [x] `autopro-getProjectTimeSessions` deleted (source + both live deployments, via `supabase functions delete` against both project refs); `base44/functions/getProjectTimeSessions/` explicitly left alone
- [x] Confirmed `base44/functions/workProProxy/`, `archiveWorkOrderProjects/`, `fetchWorkPROTechs/`, `getProjectTimeSessions/` all still present, untouched — this is a pass condition, not a cleanup task, for this phase
- [x] Repo-wide grep in `src/` clean (`workProProxy`, `sbCall(`, `fetchWorkPROTechs`) — `base44/` itself is expected to still contain these, that's correct for this phase
- [x] `npm run build` clean
- [x] Every checklist item above independently exercised in the UI or via direct dev-branch verification, not inferred from build success alone. Live UI testing used a temporary dev-branch-only password reset on the existing `tyler@kensauto.ca` auth.users test account (dev branch `sitihbdnuxifwibontcm` only, never touched production) — user chose this path explicitly when asked. All seeded test rows (`Project`, `ProjectTimeSession`, `TimeRecord`, `UnassignedTime`) were cleaned up after verification; the one pre-existing `Employee` test row's `pay_rate` was restored to its original value.

---

**Status: approved by user, all open questions resolved. Ready to execute in a fresh session — see the context-completeness review below.**

---

## 5) Context-Completeness Review (for a fresh execution session)

Performed at the user's request before clearing conversation context. This section confirms `master_blueprint.md` + this file together carry everything a fresh session needs — no reliance on conversation history not captured in writing.

**What's captured in this file:**
- The full, verified 18-row call-site inventory (Section 1), each with exact current file/line and exact target code shape.
- Every schema fact needed to execute correctly, verified directly against production via the Supabase connector this session (not assumed): RLS policies (Section 3.2), column defaults and trigger absence (Section 3.1), real live enum/field values for `Employee.status`/`employee_type`/`position` (Section 3.1), and the `id`-generation requirement for the 4 WorkPRO tables.
- Concrete before/after code diffs for the trickiest sites (creates needing full audit fields, updates needing `updated_date`, the new Edge Function's full source) — a fresh session shouldn't need to re-derive these from scratch, just verify current line numbers haven't drifted (file edits since this plan was written are possible — always re-`Read` the target file immediately before editing, don't trust the line numbers blindly).
- All 5 Section 0 decisions, resolved and reasoned, not just stated as conclusions — a fresh session can see *why* each call was made (e.g., why `TimeRecordsView.jsx` is being deleted, why `base44/` is untouched this phase specifically).
- The explicit, scoped boundary on `base44/` — critical not to lose, since it would be easy for a fresh session to "helpfully" delete `base44/functions/workProProxy/` etc. once nothing calls it, which would violate the user's explicit Phase 14-deferral instruction. Called out three separate times in this document (Section 0 #5, Section 3.8, and the checklist) specifically to survive a context reset.

**What's captured in `master_blueprint.md` (Section 7) that this phase depends on:**
- The Auth-isolation finding and `/dev-login` mechanism (still live in `src/lib/DevLogin.jsx`, flag-gated by `VITE_ENABLE_DEV_LOGIN`) — required to actually test this phase's migrated call sites against the dev branch.
- The standing "never write-test a not-yet-migrated feature," "confirm writes land in dev specifically," and "build-clean isn't runtime-clean" rules — all directly govern how this phase's verification must be performed.
- The audit-field, orphaned-component-detection, and deployed-but-uncalled-function lessons — the reasoning behind three of this phase's concrete decisions, generalized for future phases too.
- The new "leave `base44/` alone until Phase 14" standing rule — without this being in the blueprint (not just this phase doc), a future phase (5 onward) would have no way to know this boundary applies beyond Phase 4.

**One thing a fresh session will need to do that isn't fully answered here:** confirm current git branch/commit state and re-verify the dev branch's `MIGRATIONS_FAILED` drift status (flagged back in the Phase 3 work, never resolved, not blocking but worth a quick `list_branches` check before assuming dev's schema is still intact) before starting Section 3's edits — a cheap pre-flight, already noted as verification step 1, just flagging it's a live check, not something this document can pre-answer.

**Nothing else identified as missing.** This file plus `master_blueprint.md` should be sufficient for a fresh session to execute Phase 4 without needing this conversation's history.
