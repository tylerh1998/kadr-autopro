# Phase 12 Implementation Plan: Appointment Completion

**Status:** DRAFTED FOR APPROVAL
**Parent:** `master_blueprint.md`, Phase 12 (Appointment Completion) — see also `appointment_implementation_plan.md` (prior, partially-executed plan this phase supersedes/completes)
**Prepared:** 2026-08-03 · Initial scope research complete
**Baseline commit:** `af084b08` (development branch, Phase 5 & 6 complete; Phase 7 in progress on a separate track)

> **LIVE DOCUMENT.** This plan is updated in place as execution/verification surfaces new findings — do not wipe prior sections, append/annotate instead. Key learnings roll back into `master_blueprint.md` Section 7 at phase close (via `/nextphase`).

---

## 0) Open Questions, Info Requirements & Suggestions

**This phase has real open questions — please review 0.1–0.4 and answer before I execute anything.** Nothing in Sections 1–4 below has been built yet.

### 0.1 — CORRECTED via direct production query: the native `Appointment` table is not "hybrid," it's an empty, incomplete stub

`master_blueprint.md` Section 1/2 classifies `Appointment` as **"Hybrid (table + data migrated, CRUD not fully cut over)"** — grouped with `ChartOfAccount`, `InventoryReturn`, `FiscalPeriod`. Direct SQL against production (`hbcrwkmgsazqrvsrmxyr`) shows this is **not accurate**:

```sql
select 'Appointment', count(*) from "Appointment"
union all select 'Customer', count(*) from "Customer"
union all select 'WorkOrder', count(*) from "WorkOrder"
union all select 'Employee', count(*) from "Employee";
-- Appointment: 0   Customer: 1461   WorkOrder: 1557   Employee: 9
```

**The native `Appointment` table has zero rows.** No appointment data has ever been migrated from Base44 to Postgres — only a schema stub was created (and never captured as a tracked migration file; `supabase/migrations/` has exactly one unrelated file in the whole repo). Worse, that stub schema is **missing 7 of the 15 fields the live UI actively reads and writes today**:

| Column | In native `"Appointment"` table? | Used by `AppointmentForm.jsx` today? |
|---|---|---|
| `id`, `start_time`, `end_time`, `customer_id`, `vehicle_id`, `bay`, `title`, `notes`, `work_order_id`, `created_at` | ✅ | ✅ |
| `employee_id` | ❌ missing | ✅ (Technician select) |
| `status` | ❌ missing | ✅ (required field, enum Scheduled/Confirmed/In Progress/Completed/Cancelled/No Show) |
| `reminders_email` | ❌ missing | ✅ (checkbox) |
| `reminders_text` | ❌ missing | ✅ (checkbox) |
| `reminder_email_address` | ❌ missing | ✅ |
| `reminders_phone` | ❌ missing | ✅ |
| `reminder_days_before` | ❌ missing | ✅ |

No `updated_at`, `created_by`, or `created_by_id` columns either (every other native table from Phase 5+ carries these per the established audit-field convention).

**This is not theoretical — it's very likely already live-breaking a feature today.** `src/components/work-orders/SchedulerViaWoModal.jsx` (opened from the Work Orders page → "Schedule" button) **already calls `supabase.from('Appointment').insert([dataToSave])`/`.update(...)` directly**, passing the *full* `AppointmentForm` payload (all 15 fields, including the 7 missing ones). A Postgres/PostgREST insert with a key that has no matching column errors out (doesn't silently drop it). Combined with the 0-row count in production, the most likely explanation is that **every attempt to save an appointment through this specific modal has been failing** (caught by its own `try/catch`, shown as a generic "Failed to save appointment" alert, not otherwise logged). `Schedule.jsx` (the main `/Schedule` page) doesn't hit this bug today only because it still routes through the Base44 proxy (`Appointment.create/update` from `@/entities/all`), which doesn't care about the Postgres schema at all.

**Recommended fix (Section 3.1 has full DDL):** `ALTER TABLE "Appointment"` to add the 7 missing columns plus `updated_at`/`created_by`/`created_by_id` for convention consistency, captured as a proper tracked migration file this time. Low-risk, additive-only, no data loss possible (table is empty). **I'll proceed with this unless you object** — flagging it here mainly so the blueprint's stale "Hybrid" classification gets corrected (this will roll into Section 7 either way).

### 0.2 — NEEDS YOUR DECISION: how do we get real, live appointment data out of Base44?

Since the native table is empty, cutting the frontend over to `supabase.from('Appointment')` as-is means **every existing customer appointment currently visible on the schedule disappears** the moment the code ships — this is a real data migration, not just a transport swap (same category of work as Phase 8–11's confirmed-Base44-only entities, per the blueprint's own migration policy).

I see two ways to pull the live data out of Base44:

- **Option A (recommended): I write a one-time script that calls Base44's service-role entity API directly** (same pattern already proven in `base44/functions/sendAppointmentReminders/entry.ts` — `base44.asServiceRole.entities.Appointment.list()`), dump the raw JSON, then transform + insert into Postgres. This is the only option that can correctly execute the **title→notes merge** from the original `appointment_implementation_plan.md` (Open Question #1 there — "if a title exists but no notes, title becomes notes; if both exist, title is prepended to notes") — that logic needs real title/notes data per row, which only Base44 currently has. Run against the **dev branch first**, spot-check row counts/spot-check a handful of appointments against the live Base44 UI, then repeat against production.
- **Option B: You export appointments manually from the Base44 admin UI** (mirroring how you provided the `InventoryCategory_export.csv`/`InventoryLocation_export.csv`/`ReturnReason_export.csv` for Phase 7) and I write the import from that CSV.

**My recommendation is Option A** — appointments are transactional/time-series data (not small reference/master data like inventory categories), and a script can safely do the title→notes transform in one pass without you needing to hand-massage a CSV. But this is your data and your call — let me know which you'd prefer, or if there's a reason to prefer B (e.g. you'd rather eyeball the export before anything touches Postgres).

**Also needed regardless of option:** How many live appointments currently exist in Base44 (rough order of magnitude — dozens? hundreds?), and is there a cutoff point (e.g. "only migrate appointments from today forward, don't bother with historical ones") or should this be a full historical migration? This affects both the script and how carefully the title→notes merge needs to be spot-checked.

### 0.3 — NEEDS YOUR DECISION: appointment reminder emails/texts will silently stop firing after cutover unless the reminder functions are re-pointed

Two live Base44-hosted functions — `base44/functions/sendAppointmentReminders/entry.ts` (email via Resend) and `base44/functions/sendTextReminders/entry.ts` (SMS via Twilio) — read appointment data via `base44.asServiceRole.entities.Appointment.list()` (and `Customer`/`Vehicle` via the same pattern). Once the frontend stops writing appointments into Base44 (this phase's whole point), **these two functions will see zero/stale appointments and reminder emails/texts will stop going out with no error anywhere** — customers just silently stop getting reminded. Neither function is tracked as a `supabase/functions/autopro-*` Edge Function; both are pure legacy Base44-platform code, and there's no cron config for them anywhere in this repo — whatever triggers them daily is configured entirely on Base44's side, outside git.

This runs into `master_blueprint.md`'s own standing rule (Section 7, Phase 4 planning): **"Leave the `base44/` source directory and live Base44 platform deployments alone until Phase 14, even once a phase fully stops calling into them."** That rule exists to avoid needless churn on code that's about to be deleted wholesale — but here, leaving it alone doesn't just leave dead code sitting around, it **actively breaks a live customer-facing feature** the moment this phase's frontend cutover ships. I think this specific case warrants a conscious, scoped exception to that rule rather than a silent one, so flagging it for your sign-off instead of just doing it.

Three ways to handle it, in order of my preference:

- **Option A (recommended): Surgical patch, stay on Base44.** Keep both functions exactly where they are (still triggered by whatever schedules them today, still logging to `SentEmailLog` via Base44 — that entity has no native table yet, so leaving it alone is correct, not a compromise). Change **only** the data-read lines: replace `base44.asServiceRole.entities.Appointment.list()` / `.Customer.filter(...)` / `.Vehicle.filter(...)` with a plain `fetch()` against Supabase's PostgREST API (`${SUPABASE_URL}/rest/v1/Appointment?select=*`, `apikey`/`Authorization: Bearer <service_role_key>` headers) — a ~10-line diff per function. Requires adding `SUPABASE_URL` and a Supabase service-role key as **Base44** platform secrets (I can't do that myself — needs your action in the Base44 dashboard). Smallest possible blast radius: doesn't touch the Base44 cron trigger, doesn't touch `SentEmailLog`, doesn't require standing up new Supabase infrastructure this phase.
- **Option B: Full native port.** Build `supabase/functions/autopro-sendAppointmentReminders` / `autopro-sendTextReminders` from scratch, matching the `200`-always error convention, and set up a `pg_cron` + `pg_net` schedule to replicate whatever cadence Base44 currently runs (needs to be discovered/confirmed — timing unknown). Also needs `RESEND_API_KEY`/`SES_FROM_EMAIL`/`TWILIO_ACCOUNT_SID`/`TWILIO_AUTH_TOKEN`/`TWILIO_PHONE_NUMBER` added as **Supabase** secrets (I can't confirm from here whether these already exist there — would need to check the dashboard or you'd need to add them). `SentEmailLog` still has no native table, so this option would also need that entity's logging calls to either get a real schema now (scope creep into Phase 8-11 territory) or be dropped/no-op'd for this phase. Correct long-term answer (matches the blueprint's stated policy that "complex functions" get a native 1:1 replacement), but meaningfully bigger and riskier for this phase.
- **Option C: Accept the gap.** Ship Phase 12 without touching the reminder functions, accept that reminders silently stop until a later phase fixes it. Not recommending this, but naming it since it's technically the smallest-effort option — full sign-off needed if you want this given the customer-facing impact.

**Which option do you want?** (I can also revisit this if you'd rather confirm Base44's current cron trigger/schedule first before deciding.)

### 0.4 — Housekeeping items folded into scope (no decision needed, just flagging)

- **`appointment_implementation_plan.md` Open Question #1 (title→notes migration script) was never executed.** Confirmed via full repo/git-history search — no such script exists, no commit runs it. Moot as a standalone item now since it folds into 0.2's data migration (the transform happens at import time instead of as a separate backfill).
- **`appointment_implementation_plan.md` Open Question #2 (do any calendar-adjacent views still show `title`?) — answered: yes, two.** `src/components/appointments/CellAppointmentsModal.jsx:65-69` and `src/components/work-orders/AppointmentsListModal.jsx:111-113` both still render the raw `appointment.title` field directly (the main `CustomCalendar.jsx` itself never did — it already uses a computed `displayTitle`). Both get fixed in this phase (Section 3.4).
- **`appointment_implementation_plan.md`'s Item #2 ("Create Work Order" doesn't pass notes into the new WO's description) is still unfixed.** Confirmed: `AppointmentForm.jsx`'s `handleCreateWorkOrder` (line 660-687) hardcodes `description: ''` and never reads `formData.notes`. This is a self-contained one-line fix inside `AppointmentForm.jsx` — doesn't depend on `WorkOrder` itself being migrated, so it's safe to include in this phase (Section 3.3).
- **Dev branch (`sitihbdnuxifwibontcm`) currently shows `status: MIGRATIONS_FAILED`.** Not something this phase caused — likely a pre-existing artifact of Phase 1's manual (non-migration-tracked) schema copy. The `Appointment` table does exist there today with the same incomplete schema as production, so dev is still usable for this phase's testing once the `ALTER TABLE` runs on both. Flagging so it's not mistaken for something Phase 12 broke; not planning to fix the branch's overall migration-tracking health as part of this phase (out of scope) unless you'd like me to look at it.
- **`base44/entities/Appointment.jsonc`'s `required` array still lists `"title"`** even though the UI stopped collecting it back in commit `49886b8f`. Once this phase's data migration (0.2) completes and the frontend stops writing to Base44 at all, this file becomes purely archival — not touching it, but noting it in case anyone re-opens `appointment_implementation_plan.md` later and wonders why it looks stale.

---

## 1) Phase Scope & Objectives

**In scope for Phase 12:**
1. Fix the native `"Appointment"` table schema (add the 7 missing columns + audit fields) — Section 0.1/3.1.
2. One-time data migration of real, live appointments from Base44 → the native table, per whichever option is chosen in 0.2 — Section 3.2.
3. Cut every direct `Appointment.*` CRUD call site over from the Base44 proxy (`@/entities/all` / `@/entities/Appointment`) to direct `supabase.from('Appointment')` calls: `Schedule.jsx`, `EditApptViaWoModal.jsx`, `WorkOrders.jsx`, `useWorkOrder.jsx` — Section 3.3.
4. Migrate the incidental `Employee.list()` calls in the same files to `supabase.from('Employee')` (Employee is already fully native per Phase 4 — this is pure transport cleanup, same pattern `SchedulerViaWoModal.jsx` already uses) — Section 3.3.
5. Fix the two stale `appointment.title` display sites (`CellAppointmentsModal.jsx`, `AppointmentsListModal.jsx`) to use `notes`/`displayTitle` instead — Section 3.4.
6. Wire `formData.notes` into `handleCreateWorkOrder`'s `description` field — Section 3.3.
7. Re-point the appointment reminder functions' data source per the option chosen in 0.3 — Section 3.5.
8. Update `Admin.jsx`'s `LOCAL_ENTITIES`/`SUPABASE_TABLES` debug lists to reflect `Appointment`'s new status — Section 3.6.
9. Correct `master_blueprint.md`'s "Hybrid" classification of `Appointment` at phase close (via `/nextphase`), per 0.1's finding.

**Explicitly out of scope (do not touch):**
- `WorkOrder` itself is **not yet migrated** (that's Phase 13, Tier E — sequenced well after this Tier C phase). `AppointmentForm.jsx`'s `handleCreateWorkOrder` (RO-number generation via `SystemSettings.list/update/create`, `createworkorderdata`, `getworkorderlist`) and the "check for open WO" `WorkOrder.filter(...)` call **stay on the Base44 proxy** exactly as they are today. Do not migrate these, do not "fix" `SystemSettings` (it's a confirmed Base44-only entity slated for its own future phase).
- `base44/functions/sendAppointmentReminders`/`sendTextReminders` — only the specific lines identified in 0.3/3.5 get touched (if Option A or B is chosen), not a full rewrite of either function's business logic.
- `SentEmailLog` — no native table exists; not creating one this phase regardless of which reminder option is chosen.
- The Kanban board, PartsTech/Online Ordering surfaces — unrelated, already handled by other phases.
- No visible end-user behavior change beyond what's explicitly listed above (per blueprint Goal #6) — this is a plumbing + data-integrity migration, not a feature project.

**Target outcome:** Zero `base44.*` calls remaining for the `Appointment` entity anywhere in `src/`; all real historical/live appointment data present and correct in the native table; reminders continue to fire; no regression to any of the appointment-adjacent Work Order UI (`AppointmentsListModal`, `SchedulerViaWoModal`, the "upcoming appointment" card on `DocumentEditor.jsx`).

---

## 2) Lessons Learned & Context

Pulled from `master_blueprint.md` Section 7, filtered to what's actually load-bearing for this phase:

- **A `base44.functions.invoke(...)` call site does not automatically mean the underlying data is Base44-dependent — always confirm entity status directly against the database, don't trust the blueprint's classification table at face value.** This phase is the proof: the blueprint called `Appointment` "Hybrid," but a direct query showed the table has zero rows. Verify before planning, every time.
- **Audit fields (`id`, `created_date`/`created_at`, `updated_date`/`updated_at`, `created_by`, `created_by_id`) do not populate themselves once proxy layers are removed.** Every direct `.insert()`/`.update()` in Section 3.3 sets these explicitly, following the same pattern established in Phase 4/5.
- **Before fixing or migrating a component, grep for its importers; don't blindly touch shared code.** `CustomCalendar.jsx` is shared between `Schedule.jsx` and `SchedulerViaWoModal.jsx` — it makes zero API calls itself (pure props-driven), so it needs **no changes** in this phase; only its two callers do.
- **Dev-branch column types can diverge from production; verify column data types on financial/identity write paths before assuming a type.** Applied here: `Employee.id` is `bigint` in Postgres (not `text` like `Customer`/`Vehicle`/`WorkOrder`'s custom string IDs) — the new `employee_id` column on `Appointment` needs to match that, not copy the `text` pattern used for the other FK-ish columns.
- **`npm:` vs `esm.sh` specifiers matter for Deno Edge Functions; `createClientFromRequest` throws synchronously without Base44 SDK headers — wrap in try/catch if used in a Supabase Edge Function context.** Only relevant if Option B (native reminder port) is chosen in 0.3 — not relevant to Option A's plain `fetch()` approach.
- **All native `autopro-*` Edge Functions return HTTP 200 with `{ error }` on failure, never raw 4xx/5xx** — applies to any new Edge Function this phase might create under Option B.
- **A linked planning doc written by a prior agent (`appointment_implementation_plan.md`) mixed approved scope with unsolicited suggestions — its "Future Supabase Architecture" section (a proposed `work_order_id`-only FK schema with `CREATE TABLE` DDL) was never approved or built.** The live table's actual schema diverged from that doc's proposal (no FK constraints exist anywhere in this table or, in fact, anywhere in this project's schema — that's the established no-FK-constraints convention, confirmed by checking `pg_constraint` directly). Section 3.1's `ALTER TABLE` follows the *existing* live schema's conventions, not that doc's speculative one.
- **Confirm migration-script execution status before this phase's detailed plan proceeds** (blueprint Risk #6) — done, see 0.4: it was never executed, and the finding reshaped this plan's scope (0.2) rather than being a simple "run the pending script" task.
- **Supabase native Branching does not automatically sync schema when schema wasn't committed to git as tracked migrations.** Directly relevant: the `Appointment` table itself was never captured in a migration file. Section 3.1's `ALTER TABLE` will be written as a proper tracked migration, partially remediating this for this one table.

---

## 3) Detailed Execution Plan

### 3.1 — Schema fix: `ALTER TABLE "Appointment"`

New migration file (pending confirmation of 0.1): `supabase/migrations/20260804000000_appointment_add_missing_columns.sql`

```sql
ALTER TABLE "Appointment"
  ADD COLUMN employee_id bigint,
  ADD COLUMN status text DEFAULT 'Scheduled',
  ADD COLUMN reminders_email boolean DEFAULT false,
  ADD COLUMN reminders_text boolean DEFAULT false,
  ADD COLUMN reminder_email_address text,
  ADD COLUMN reminders_phone text,
  ADD COLUMN reminder_days_before integer DEFAULT 1,
  ADD COLUMN updated_at timestamp with time zone DEFAULT now(),
  ADD COLUMN created_by text,
  ADD COLUMN created_by_id text;
```

- `employee_id bigint` — matches `Employee.id`'s actual type (confirmed via `information_schema.columns`); no FK constraint added, consistent with every other table in this schema (confirmed via `pg_constraint` — the project has zero FK constraints anywhere, all referential integrity is app-level).
- `status`/`reminders_email`/`reminders_text`/`reminder_days_before` defaults mirror the base44 `.jsonc` spec's declared defaults exactly.
- Apply to the **dev branch (`sitihbdnuxifwibontcm`) first**, verify with `information_schema.columns`, then apply to production (`hbcrwkmgsazqrvsrmxyr`).
- No RLS changes needed — existing policies (`Enable all for authenticated users`, `Enable read for public`, `Enable all operations for all users`) already permit full CRUD; they're redundant/overlapping (three permissive policies doing overlapping things) but functionally harmless — not touching them this phase, out of scope.

### 3.2 — Data migration (pending 0.2 decision)

If **Option A** is confirmed:
1. Write a one-off Node/Deno script using the existing `BASE44_ACCESS_TOKEN` pattern (same auth approach already used by `base44/functions/*`) to call `base44.asServiceRole.entities.Appointment.list()` and dump raw JSON to a local file for inspection.
2. Transform each row: apply the title→notes merge from the original `appointment_implementation_plan.md` (`title`-only → becomes `notes`; both present → `[Title]\nNotes...`; neither → leave `notes` as-is), map remaining fields 1:1 (they already match the now-fixed native schema from 3.1), generate `created_by`/`created_by_id` from whatever audit info Base44 rows carry (or leave null if none exists there either — Base44's own schema doesn't define these fields, so likely null across the board).
3. Insert into the **dev branch** first; spot-check row count and a handful of individual rows against the live Base44 UI (dates/times/customer linkage/status).
4. Repeat against production once verified.

If **Option B** is confirmed: swap step 1 for a walkthrough of exporting via the Base44 admin UI; steps 2-4 unchanged.

*(This section will be filled in with the actual script/row counts/verification results once 0.2 is answered and execution begins — placeholder until then.)*

### 3.3 — Frontend CRUD cutover

**`src/pages/Schedule.jsx`**
- Line 2: `import { Appointment, Employee } from '@/entities/all';` → remove entirely (no longer needed once every call below is direct).
- Line 85: `Appointment.list()` → `supabase.from('Appointment').select('*')` (destructure `{ data, error }`, throw on `error` to preserve existing `try/catch` behavior in `loadData`).
- Line 86: `Employee.list()` → `supabase.from('Employee').select('*')`.
- Line 259: `await Appointment.update(event.id, updatedAppointment)` → `await supabase.from('Appointment').update({ ...updatedAppointment, updated_at: new Date().toISOString() }).eq('id', event.id)`, check `error`.
- Line 330/332: `Appointment.update(...)`/`Appointment.create(...)` inside `handleSubmit` → same direct-call pattern; `create` needs explicit `id: crypto.randomUUID()`, `created_at`/`created_by`/`created_by_id` set from `currentEmployee` (matching the pattern already used in this same file's `handleCreateCustomer`/`handleCreateVehicle` in `AppointmentForm.jsx`) — **note:** `Schedule.jsx` doesn't currently import `useAuth`; will need to add it to get `currentEmployee` for `created_by`.
- Line 345/365: `Appointment.delete(id)` → `supabase.from('Appointment').delete().eq('id', id)`.

**`src/components/work-orders/EditApptViaWoModal.jsx`**
- Line 4: `import { Employee, Appointment } from '@/entities/all';` → remove; add `import { useAuth } from '@/lib/AuthContext';` if `created_by` audit fields are needed on create (mirrors `Schedule.jsx`).
- Line 19: `Employee.list()` → `supabase.from('Employee').select('*')`.
- Line 73/75: `Appointment.update(...)`/`Appointment.create(...)` → direct calls, same audit-field pattern as above.
- Line 89: `Appointment.delete(appointmentId)` → `supabase.from('Appointment').delete().eq('id', appointmentId)`.

**`src/pages/WorkOrders.jsx`**
- Line 5: `import { Appointment } from "@/entities/Appointment";` → remove (note: different virtual-module path than `@/entities/all`, but same underlying base44-proxy mechanism per `vite.config.js`'s `legacySDKImports` plugin — both need to go).
- Line 302: `await Appointment.list()` → `const { data: allAppointments, error } = await supabase.from('Appointment').select('*')` (adjust the surrounding `try/catch` to check `error`).

**`src/components/hooks/useWorkOrder.jsx`**
- Line 2: `import { Customer, Vehicle, TagAlong, Appointment, OtherChargeList } from '@/entities/all';` → drop `Appointment` from this import (leave `Customer`/`Vehicle`/`TagAlong`/`OtherChargeList` untouched — out of scope for this phase, they're not part of Phase 12).
- Lines 121/126: `Appointment.filter({ work_order_id: wo.id })` → `supabase.from('Appointment').select('*').eq('work_order_id', wo.id)` (adjust destructuring — `.filter()` on the base44 shim returns an array directly, `supabase.from()` returns `{ data, error }`).

**`src/components/appointments/AppointmentForm.jsx`** (small, self-contained fix — no base44 migration needed here, this file already uses direct `supabase.from()` for `Vehicle`/`Customer`)
- Inside `handleCreateWorkOrder` (~line 660-687): change `description: '',` to `description: formData.notes || '',` in the `newWorkOrder` payload. This is the only change to this file this phase — everything else (RO-number generation, `WorkOrder.filter`, `createworkorderdata`, `getworkorderlist`) stays untouched per the out-of-scope note in Section 1.

**`src/components/work-orders/SchedulerViaWoModal.jsx`**
- No functional change needed — it already uses direct `supabase.from('Appointment')`/`supabase.from('Employee')` calls (lines 55-58, 198, 201, 226, 256). Once 3.1's `ALTER TABLE` lands, this modal should start working correctly for the first time. Only cleanup: remove the now-fully-unused `import { Appointment, Employee } from '@/entities/all';` (line 3) and the unused `import { base44 } from '@/api/base44Client';` (line 4, dead import — grep confirms `base44` isn't referenced anywhere else in this file).

### 3.4 — Fix stale `title` display sites

**`src/components/appointments/CellAppointmentsModal.jsx`** (line 65-69):
```diff
- {appointment.title && appointment.title !== customerName && (
-   <div className="text-sm text-slate-600 dark:text-slate-400 mt-1">
-     {appointment.title}
-   </div>
- )}
+ {appointment.notes && !appointment.customer && (
+   <div className="text-sm text-slate-600 dark:text-slate-400 mt-1">
+     {appointment.notes.length > 60 ? `${appointment.notes.substring(0, 57)}...` : appointment.notes}
+   </div>
+ )}
```
(This component already receives `appointment.displayTitle` from its caller's computed field, but was using raw `title` as a secondary line under the customer name — swapping to a truncated `notes` preview, consistent with how `displayTitle` itself is derived elsewhere.)

**`src/components/work-orders/AppointmentsListModal.jsx`** (line 111-113): this component currently uses `appointment.title` as the **primary heading** and has no `displayTitle`/customer-name computation at all (it only queries `supabase.from('Appointment')` directly, no customer join). Options: (a) add a customer lookup so it can show the customer name like the other views do, or (b) just fall back to a generic "Appointment" heading plus keep the existing bay/notes detail lines below it. Given this modal is scoped to one Work Order (customer is already known/visible from the WO context it's opened from), recommend **(b)** — simplest, no new query needed:
```diff
- <h4 className="font-semibold text-slate-900 dark:text-slate-100 mb-1">
-   {appointment.title}
- </h4>
+ <h4 className="font-semibold text-slate-900 dark:text-slate-100 mb-1">
+   {format(startDate, 'EEE, MMM d')} Appointment
+ </h4>
```
Also drop the dead `import { Appointment } from '@/entities/all';` (line 5, confirmed unused — this file already queries via `supabase.from('Appointment')` directly).

### 3.5 — Reminder function re-point (pending 0.3 decision)

*(Full diff will be written once 0.3 is answered — placeholder for now.)* If Option A: patch the ~3 `base44.asServiceRole.entities.X` read calls per function (`Appointment.list()`, `Customer.filter()`, `Vehicle.filter()`) to `fetch()` calls against Supabase PostgREST, leaving the Resend/Twilio send logic and `SentEmailLog` logging completely untouched.

### 3.6 — `Admin.jsx` debug-tool list update

Line 24-27 (`SUPABASE_TABLES`) and line 30 (`LOCAL_ENTITIES`): move `"Appointment"` from the latter to the former, alphabetically re-sorted (the array already calls `.sort()`, so insertion order doesn't matter).

---

## 4) Verification Plan

### Step-by-step verification narrative

1. **Schema:** After 3.1's migration, query `information_schema.columns` on both dev and prod to confirm all 10 new/existing columns are present with correct types/defaults.
2. **Data migration:** Row-count check (native table count should match Base44's live count, or the agreed-upon subset per 0.2). Spot-check 5-10 individual appointments (mix of past/future, with/without title, with/without reminders) against what's visible in the current live `/Schedule` page pre-cutover, confirming date/time, customer/vehicle linkage, and the title→notes merge produced sensible text.
3. **`/Schedule` page (main calendar):** Load the page, confirm all migrated appointments render on the calendar in the correct bay/day/time slots with correct tech colors. Create a new appointment end-to-end (customer → vehicle → bay → tech → status → notes → reminders), confirm it lands in `"Appointment"` via direct DB check (not just UI reload). Edit an existing appointment's time via drag-and-drop, confirm the `update` call succeeds and persists on reload. Delete an appointment, confirm it's gone from both UI and DB.
4. **Reminders sanity check (non-destructive):** Create a test appointment dated for "today" in dev with `reminders_email`/`reminders_text` enabled and `reminder_days_before: 0`; manually invoke whichever reminder function/endpoint results from 0.3's decision against the dev environment; confirm it finds the appointment (proves the re-pointed read path works) without needing to actually verify email/SMS delivery in this step.
5. **`SchedulerViaWoModal` (Schedule button on a Work Order):** Open from `WorkOrders.jsx`, create a new appointment linked to that WO, confirm no "Failed to save appointment" error (this is the currently-broken path per 0.1) and the appointment persists with `work_order_id` set correctly.
6. **`EditApptViaWoModal`:** Edit an appointment from within a Work Order's context, confirm changes persist.
7. **`AppointmentsListModal`:** Open from a Work Order card, confirm the appointment list loads (no more `appointment.title` reference errors/blanks) and the new heading format reads sensibly.
8. **`CellAppointmentsModal`:** Trigger the overlapping-appointments view (multiple appointments same bay/time), confirm the secondary notes line renders correctly and doesn't duplicate the customer name.
9. **"Create Work Order" from `AppointmentForm`:** Create an appointment with notes filled in, click "Create Estimate"/"Create Work Order," confirm the resulting WO's `description` field is pre-filled with those notes.
10. **`Admin.jsx` debug tool:** Confirm `Appointment` now appears under the Supabase-table dropdown, not the local-entity one.
11. **Repo-wide grep:** `base44` / `@/entities/all` / `@/entities/Appointment` return zero hits for anything Appointment-related outside `base44/functions/sendAppointmentReminders`/`sendTextReminders` (and only those two if Option A from 0.3 is chosen — zero hits at all if Option B).
12. **Regression check on adjacent, out-of-scope flows:** Confirm the "Create Estimate"/"Create Work Order" buttons in `AppointmentForm.jsx` still work exactly as before (they're intentionally untouched, still hitting Base44 — just confirming this phase didn't accidentally break them).

### Verification checklist

- [ ] Dev branch: `ALTER TABLE` applied, all 10 columns confirmed present via `information_schema.columns`
- [ ] Production: `ALTER TABLE` applied, same confirmation
- [ ] Data migration approach confirmed (0.2) and executed against dev branch
- [ ] Dev-branch data spot-check: row count matches expected; 5-10 sampled rows verified correct (title→notes merge, dates, linkage)
- [ ] Data migration executed against production
- [ ] Production data spot-check repeated
- [ ] `Schedule.jsx`: base44 imports removed; `Appointment`/`Employee` calls converted to direct `supabase.from()`
- [ ] `Schedule.jsx`: calendar renders all migrated appointments correctly (bay/day/time/tech color)
- [ ] `Schedule.jsx`: create new appointment end-to-end, verified in DB
- [ ] `Schedule.jsx`: drag-and-drop time update persists
- [ ] `Schedule.jsx`: delete appointment removes from DB
- [ ] `EditApptViaWoModal.jsx`: base44 imports removed; create/update/delete verified from WO context
- [ ] `WorkOrders.jsx`: `Appointment.list()` converted; appointment badges on WO cards still populate correctly
- [ ] `useWorkOrder.jsx`: `Appointment.filter()` converted; "upcoming appointment" card on `DocumentEditor.jsx`/`WorkOrderView.jsx` still populates
- [ ] `AppointmentForm.jsx`: `handleCreateWorkOrder` now passes `description: formData.notes`; verified on a real created WO
- [ ] `SchedulerViaWoModal.jsx`: dead base44 imports removed; create/update/delete confirmed working (previously-broken path)
- [ ] `CellAppointmentsModal.jsx`: title reference replaced with notes preview; verified visually with overlapping appointments
- [ ] `AppointmentsListModal.jsx`: title reference replaced; dead `Appointment` import removed; verified visually
- [ ] Reminder function(s) re-pointed per 0.3's chosen option; test appointment confirmed reachable via the new read path
- [ ] `Admin.jsx`: `Appointment` moved from `LOCAL_ENTITIES` to `SUPABASE_TABLES`
- [ ] Repo-wide grep confirms no remaining base44 references for `Appointment` (outside the reminder functions, if Option A chosen)
- [ ] Regression: "Create Estimate"/"Create Work Order" buttons in `AppointmentForm.jsx` still function (untouched Base44 path)
- [ ] `master_blueprint.md` Section 1/2 "Hybrid" classification for `Appointment` corrected at phase close
