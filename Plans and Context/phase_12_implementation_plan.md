# Phase 12 Implementation Plan: Appointment Completion

**Status:** DRAFTED FOR APPROVAL
**Parent:** `master_blueprint.md`, Phase 12 (Appointment Completion) — see also `appointment_implementation_plan.md` (prior, partially-executed plan this phase supersedes/completes)
**Prepared:** 2026-08-03 · Initial scope research complete
**Baseline commit:** `af084b08` (development branch, Phase 5 & 6 complete; Phase 7 in progress on a separate track)

> **LIVE DOCUMENT.** This plan is updated in place as execution/verification surfaces new findings — do not wipe prior sections, append/annotate instead. Key learnings roll back into `master_blueprint.md` Section 7 at phase close (via `/nextphase`).

---

## 0) Open Questions, Info Requirements & Suggestions

**0.1–0.4 below are RESOLVED (2026-08-03) — decisions recorded inline, execution proceeding per Sections 1-4.**

**Decisions summary:**
- **0.1** — Proceed with schema fix, adjusted per your note: `created_at`→`created_date` rename (matches the export CSV/project convention), `title` column stays for now (not dropped this phase — you'll drop it at go-live when the CSV import happens).
- **0.2** — You provided `Plans and Context/Appointment_export.csv` (510 records) **for reference only, not for import now**. Real data migration is deferred to go-live, at which point you'll do Option B (manual export → I write the import). Nothing in Sections 3.2 executes this phase.
- **0.3** — Option A (surgical patch, both reminder functions stay on Base44) is **in scope now**. Option B (full native port, secret migration to Supabase, cron repoint) is deferred to Phase 14/go-live — noting this for that phase's future plan. You'll add the two new Base44 secrets needed for the patch (see Section 3.5).
- **0.4** — Title→notes migration script confirmed deferred to go-live, folded into whatever Option B's import script does then.
- **New:** `SchedulerViaWoModal.jsx`, `EditApptViaWoModal.jsx`, and `AppointmentsListModal.jsx` **cannot be meaningfully click-tested this phase** — there's no real appointment data in Postgres until the go-live import. Code changes for these three still happen now (Section 3.3), but full end-to-end validation is **deferred to Phase 13** (Work Orders Core), where they'll be tested alongside the rest of the WO-integration surface. Flagged in Section 4's checklist and will be carried into Phase 13's scope note at rollup.

Original open-question writeups kept below for context/audit trail.

### 0.1 — CORRECTED via direct production query: the native `Appointment` table is not "hybrid," it's an empty, incomplete stub

**RESOLVED (2026-08-03):** Proceed with the schema fix. Adjustment based on your feedback: the export CSV (`Appointment_export.csv`, see 0.2) confirms the project's live audit-field convention is `created_date`/`updated_date`/`created_by`/`created_by_id` (matching every other native table), not the `created_at` the original stub table used — Section 3.1 now renames `created_at`→`created_date` instead of adding a redundant `updated_at`. `title` stays in the schema for this phase (not dropped) — you'll drop it at go-live when the CSV import happens and title is no longer needed. `employee_id bigint` still stands (matches native `Employee.id`'s actual type) — see 0.2 for a new wrinkle the CSV surfaced on that front.

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

**RESOLVED (2026-08-03):** Option B, deferred to go-live — you'll do a manual Base44 export at that time and I'll write the import then, since this is dynamic/live data and doing it now would just go stale before go-live anyway. **Not executing any data migration this phase.**

You provided `Plans and Context/Appointment_export.csv` now as a reference/shape check (510 records; the raw file has 941 data lines because several `notes` values contain embedded newlines inside quoted CSV fields). Read the header + a sample of rows — worth recording two findings for whoever runs the real import at go-live:

- **`title` is already blank/unused in the sample rows I checked** — real appointment text already lives in `notes` (e.g. `"O/C"`, `"TIRE ROTATION"`, `"PLUGS & WIRES"`). This suggests the title→notes merge logic from `appointment_implementation_plan.md` may turn out to be a no-op or near-no-op in practice — worth a quick `COUNT(*) WHERE title IS NOT NULL AND title != ''` against the real export at import time before assuming the merge logic needs to run at all.
- **`employee_id` remapping problem (new finding, needs resolving at go-live, not now):** the CSV's `employee_id` column holds Base44 ObjectId-style strings (e.g. `69ce06bd2006168cdacc9f14`). I cross-checked this against the native `Employee` table's `autopro_user_id` column (confirmed to be the correct Base44↔native crosswalk — e.g. `694c38a40784e9f2cd147a29` in the CSV's `created_by_id` matches Elisa Haney's `autopro_user_id` exactly) and the sampled `employee_id` values **don't match any `autopro_user_id` in the native table.** They also don't cleanly match `workpro_user_id` either, though the prefix pattern looked closer. This likely means Base44's `Appointment.employee_id` points at a *different* Base44 "Employee" entity than the Base44 "User" account `autopro_user_id` crosswalks to (technician assignment vs. login identity may be two separate Base44 records). **This needs to be figured out before the go-live import can correctly populate the new `employee_id bigint` column** — flagging now so it's not a surprise later, not attempting to solve it this phase since you've deferred the import itself.

Since the native table is empty, cutting the frontend over to `supabase.from('Appointment')` as-is means **every existing customer appointment currently visible on the schedule disappears** the moment the code ships — this is a real data migration, not just a transport swap (same category of work as Phase 8–11's confirmed-Base44-only entities, per the blueprint's own migration policy).

I see two ways to pull the live data out of Base44:

- **Option A (recommended): I write a one-time script that calls Base44's service-role entity API directly** (same pattern already proven in `base44/functions/sendAppointmentReminders/entry.ts` — `base44.asServiceRole.entities.Appointment.list()`), dump the raw JSON, then transform + insert into Postgres. This is the only option that can correctly execute the **title→notes merge** from the original `appointment_implementation_plan.md` (Open Question #1 there — "if a title exists but no notes, title becomes notes; if both exist, title is prepended to notes") — that logic needs real title/notes data per row, which only Base44 currently has. Run against the **dev branch first**, spot-check row counts/spot-check a handful of appointments against the live Base44 UI, then repeat against production.
- **Option B: You export appointments manually from the Base44 admin UI** (mirroring how you provided the `InventoryCategory_export.csv`/`InventoryLocation_export.csv`/`ReturnReason_export.csv` for Phase 7) and I write the import from that CSV.

**My recommendation is Option A** — appointments are transactional/time-series data (not small reference/master data like inventory categories), and a script can safely do the title→notes transform in one pass without you needing to hand-massage a CSV. But this is your data and your call — let me know which you'd prefer, or if there's a reason to prefer B (e.g. you'd rather eyeball the export before anything touches Postgres).

**Also needed regardless of option:** How many live appointments currently exist in Base44 (rough order of magnitude — dozens? hundreds?), and is there a cutoff point (e.g. "only migrate appointments from today forward, don't bother with historical ones") or should this be a full historical migration? This affects both the script and how carefully the title→notes merge needs to be spot-checked.

### 0.3 — NEEDS YOUR DECISION: appointment reminder emails/texts will silently stop firing after cutover unless the reminder functions are re-pointed

**RESOLVED (2026-08-03):** Option A **is in scope for this phase** — surgical patch, both functions stay on Base44 exactly where they are (same cron trigger, same `SentEmailLog` logging). Option B (full native `autopro-*` port, moving `RESEND_API_KEY`/`TWILIO_*` secrets to Supabase, standing up a `pg_cron` schedule) is **deferred to Phase 14/go-live** — this will be carried forward into that phase's scope when this phase rolls up.

**Action needed from you for Option A to work:** add two new secrets to the **Base44** platform (not Supabase) so the patched functions in Section 3.5 can read `Appointment`/`Customer`/`Vehicle` directly from Postgres:
- `SUPABASE_URL` → `https://hbcrwkmgsazqrvsrmxyr.supabase.co`
- `SUPABASE_SERVICE_ROLE_KEY` → the project's service-role key (Supabase Dashboard → Project Settings → API — treat this like any other service-role key, it bypasses RLS)

You mentioned you can add these for testing — once they're in place on the dev/testing side I can verify the patched functions actually reach Postgres before we touch production's Base44 secrets.

Two live Base44-hosted functions — `base44/functions/sendAppointmentReminders/entry.ts` (email via Resend) and `base44/functions/sendTextReminders/entry.ts` (SMS via Twilio) — read appointment data via `base44.asServiceRole.entities.Appointment.list()` (and `Customer`/`Vehicle` via the same pattern). Once the frontend stops writing appointments into Base44 (this phase's whole point), **these two functions will see zero/stale appointments and reminder emails/texts will stop going out with no error anywhere** — customers just silently stop getting reminded. Neither function is tracked as a `supabase/functions/autopro-*` Edge Function; both are pure legacy Base44-platform code, and there's no cron config for them anywhere in this repo — whatever triggers them daily is configured entirely on Base44's side, outside git.

This runs into `master_blueprint.md`'s own standing rule (Section 7, Phase 4 planning): **"Leave the `base44/` source directory and live Base44 platform deployments alone until Phase 14, even once a phase fully stops calling into them."** That rule exists to avoid needless churn on code that's about to be deleted wholesale — but here, leaving it alone doesn't just leave dead code sitting around, it **actively breaks a live customer-facing feature** the moment this phase's frontend cutover ships. I think this specific case warrants a conscious, scoped exception to that rule rather than a silent one, so flagging it for your sign-off instead of just doing it.

Three ways to handle it, in order of my preference:

- **Option A (recommended): Surgical patch, stay on Base44.** Keep both functions exactly where they are (still triggered by whatever schedules them today, still logging to `SentEmailLog` via Base44 — that entity has no native table yet, so leaving it alone is correct, not a compromise). Change **only** the data-read lines: replace `base44.asServiceRole.entities.Appointment.list()` / `.Customer.filter(...)` / `.Vehicle.filter(...)` with a plain `fetch()` against Supabase's PostgREST API (`${SUPABASE_URL}/rest/v1/Appointment?select=*`, `apikey`/`Authorization: Bearer <service_role_key>` headers) — a ~10-line diff per function. Requires adding `SUPABASE_URL` and a Supabase service-role key as **Base44** platform secrets (I can't do that myself — needs your action in the Base44 dashboard). Smallest possible blast radius: doesn't touch the Base44 cron trigger, doesn't touch `SentEmailLog`, doesn't require standing up new Supabase infrastructure this phase.
- **Option B: Full native port.** Build `supabase/functions/autopro-sendAppointmentReminders` / `autopro-sendTextReminders` from scratch, matching the `200`-always error convention, and set up a `pg_cron` + `pg_net` schedule to replicate whatever cadence Base44 currently runs (needs to be discovered/confirmed — timing unknown). Also needs `RESEND_API_KEY`/`SES_FROM_EMAIL`/`TWILIO_ACCOUNT_SID`/`TWILIO_AUTH_TOKEN`/`TWILIO_PHONE_NUMBER` added as **Supabase** secrets (I can't confirm from here whether these already exist there — would need to check the dashboard or you'd need to add them). `SentEmailLog` still has no native table, so this option would also need that entity's logging calls to either get a real schema now (scope creep into Phase 8-11 territory) or be dropped/no-op'd for this phase. Correct long-term answer (matches the blueprint's stated policy that "complex functions" get a native 1:1 replacement), but meaningfully bigger and riskier for this phase.
- **Option C: Accept the gap.** Ship Phase 12 without touching the reminder functions, accept that reminders silently stop until a later phase fixes it. Not recommending this, but naming it since it's technically the smallest-effort option — full sign-off needed if you want this given the customer-facing impact.

**Which option do you want?** (I can also revisit this if you'd rather confirm Base44's current cron trigger/schedule first before deciding.)

### 0.4 — Housekeeping items folded into scope (no decision needed, just flagging)

**RESOLVED (2026-08-03):** Title→notes migration script confirmed deferred to go-live (folds into 0.2's Option B import work then). Everything else below still applies as scoped.

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

**Target outcome:** Zero `base44.*` calls remaining for the `Appointment` entity anywhere in `src/` (except the two reminder functions' `SentEmailLog` usage, intentionally retained per 0.3); the reminder functions reading live appointment data from Postgres instead of Base44; no regression to any of the appointment-adjacent Work Order UI code paths. **Note:** since real appointment data migration is deferred to go-live (0.2), this phase does not produce a fully populated, end-user-verifiable `/Schedule` page — that validation happens at go-live. What *is* fully verifiable now: schema correctness, code-level cutover (no more base44 imports), and the reminder function patch.

**Deferred to Phase 13 (Work Orders Core):** Full click-through validation of `SchedulerViaWoModal.jsx`, `EditApptViaWoModal.jsx`, and `AppointmentsListModal.jsx` — these are all WO-context appointment surfaces that need real linked Work Order + appointment data to test meaningfully, which won't exist until go-live. Code changes still happen this phase (Section 3.3); validation is a Phase 13 carry-forward item (Section 4).

**Deferred to Phase 14/go-live (per 0.3):** Full native port of `sendAppointmentReminders`/`sendTextReminders` to `autopro-*` Edge Functions, migrating `RESEND_API_KEY`/`TWILIO_*` secrets to Supabase, standing up their `pg_cron` schedule, and dropping the `Appointment.title` column once the go-live CSV import lands.

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

New migration file: `supabase/migrations/20260804000000_appointment_add_missing_columns.sql`

```sql
ALTER TABLE "Appointment" RENAME COLUMN created_at TO created_date;

ALTER TABLE "Appointment"
  ADD COLUMN employee_id bigint,
  ADD COLUMN status text DEFAULT 'Scheduled',
  ADD COLUMN reminders_email boolean DEFAULT false,
  ADD COLUMN reminders_text boolean DEFAULT false,
  ADD COLUMN reminder_email_address text,
  ADD COLUMN reminders_phone text,
  ADD COLUMN reminder_days_before integer DEFAULT 1,
  ADD COLUMN updated_date timestamp with time zone DEFAULT now(),
  ADD COLUMN created_by text,
  ADD COLUMN created_by_id text;
```

- `created_at` → `created_date`: aligns with the audit-field naming every other native table in this project uses (`Customer`, `Vehicle`, `InventoryReturn`, etc.) and matches the export CSV's own column names (`created_date`/`updated_date`/`created_by`/`created_by_id`) — confirmed safe since the table has zero rows, no data affected by the rename.
- `title` is intentionally **left untouched** — stays in the schema this phase; you'll drop it in a follow-up migration at go-live once the CSV import (with title merged into notes beforehand, per 0.2) lands.
- `employee_id bigint` — matches native `Employee.id`'s actual type (confirmed via `information_schema.columns`); no FK constraint added, consistent with every other table in this schema (confirmed via `pg_constraint` — the project has zero FK constraints anywhere, all referential integrity is app-level). **Note per 0.2:** the CSV's raw `employee_id` values won't map directly to this column at import time — that's a go-live problem, not this phase's.
- `status`/`reminders_email`/`reminders_text`/`reminder_days_before` defaults mirror the base44 `.jsonc` spec's declared defaults exactly.
- Apply to the **dev branch (`sitihbdnuxifwibontcm`) first**, verify with `information_schema.columns`, then apply to production (`hbcrwkmgsazqrvsrmxyr`).
- No RLS changes needed — existing policies (`Enable all for authenticated users`, `Enable read for public`, `Enable all operations for all users`) already permit full CRUD; they're redundant/overlapping (three permissive policies doing overlapping things) but functionally harmless — not touching them this phase, out of scope.

### 3.2 — Data migration: DEFERRED TO GO-LIVE, not executed this phase

Per 0.2, real appointment data migration happens at go-live via Option B (you export from Base44 manually, I write the import against that export). **Nothing in this section executes as part of Phase 12.** Keeping this section as a placeholder/checklist for that future work so it isn't lost:

- [ ] At go-live: confirm whether the title→notes merge logic is actually needed (0.2's finding suggests `title` may already be universally blank in practice — verify with a `COUNT(*)` against the real export before writing merge logic that might be a no-op).
- [ ] At go-live: resolve the `employee_id` remapping problem (0.2) — figure out what Base44 entity the CSV's `employee_id` values actually reference and how to cross-walk them to native `Employee.id` (bigint).
- [ ] At go-live: `customer_id`/`vehicle_id`/`work_order_id` likely copy across as-is (same 24-char text ID space already used natively for `Customer`/`Vehicle`/`WorkOrder` per Phase 5) — confirm this assumption with a spot-check against real data before trusting it wholesale.
- [ ] At go-live: import to dev branch first, spot-check, then production, per the project's standard verify-on-dev-first policy.
- [ ] At go-live: drop the `title` column (3.1) once its data is confirmed merged/no longer needed.

### 3.3 — Frontend CRUD cutover

**`src/pages/Schedule.jsx`**
- Line 2: `import { Appointment, Employee } from '@/entities/all';` → remove entirely (no longer needed once every call below is direct).
- Line 85: `Appointment.list()` → `supabase.from('Appointment').select('*')` (destructure `{ data, error }`, throw on `error` to preserve existing `try/catch` behavior in `loadData`).
- Line 86: `Employee.list()` → `supabase.from('Employee').select('*')`.
- Line 259: `await Appointment.update(event.id, updatedAppointment)` → `await supabase.from('Appointment').update({ ...updatedAppointment, updated_date: new Date().toISOString() }).eq('id', event.id)`, check `error`.
- Line 330/332: `Appointment.update(...)`/`Appointment.create(...)` inside `handleSubmit` → same direct-call pattern. **Unlike `Customer`/`Vehicle`, `Appointment.id` has a `gen_random_uuid()` default (3.1) — no client-side `id` generation needed on create.** `create` still needs `created_by`/`created_by_id` set explicitly from `currentEmployee` (matching the audit-field pattern already used in this same file's `handleCreateCustomer`/`handleCreateVehicle` in `AppointmentForm.jsx`; `created_date` can rely on its own `now()` default) — **note:** `Schedule.jsx` doesn't currently import `useAuth`; will need to add it to get `currentEmployee` for `created_by`. `update` calls should set `updated_date: new Date().toISOString()` explicitly (no trigger auto-updates it).
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

### 3.5 — Reminder function re-point (Option A, confirmed in scope)

Both files stay in `base44/functions/` (still Base44-platform-hosted, still triggered by whatever schedules them today, still logging to `SentEmailLog` via `base44.asServiceRole` — none of that changes). Only the `Appointment`/`Customer`/`Vehicle` **reads** move to direct Supabase REST calls. New Base44 secrets required: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` (see 0.3).

**`base44/functions/sendAppointmentReminders/entry.ts`**

Add near the top of the handler (after `const base44 = createClientFromRequest(req);`):
```ts
const supabaseUrl = Deno.env.get('SUPABASE_URL');
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
if (!supabaseUrl || !supabaseServiceKey) {
    throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY environment variable');
}
const supabaseHeaders = { apikey: supabaseServiceKey, Authorization: `Bearer ${supabaseServiceKey}` };

const fetchAll = async (table) => {
    const res = await fetch(`${supabaseUrl}/rest/v1/${table}?select=*`, { headers: supabaseHeaders });
    if (!res.ok) throw new Error(`Failed to fetch ${table} from Supabase: ${res.status}`);
    return res.json();
};

const fetchByIds = async (table, ids) => {
    if (ids.length === 0) return [];
    const idList = ids.map(id => encodeURIComponent(id)).join(',');
    const res = await fetch(`${supabaseUrl}/rest/v1/${table}?select=*&id=in.(${idList})`, { headers: supabaseHeaders });
    if (!res.ok) throw new Error(`Failed to fetch ${table} from Supabase: ${res.status}`);
    return res.json();
};
```

Then replace:
- Line 17: `const appointments = await base44.asServiceRole.entities.Appointment.list();` → `const appointments = await fetchAll('Appointment');`
- Line 57: `const customers = customerIds.length > 0 ? await base44.asServiceRole.entities.Customer.filter({ id: { $in: customerIds } }) : [];` → `const customers = await fetchByIds('Customer', customerIds);`
- Line 58: `const vehicles = vehicleIds.length > 0 ? await base44.asServiceRole.entities.Vehicle.filter({ id: { $in: vehicleIds } }) : [];` → `const vehicles = await fetchByIds('Vehicle', vehicleIds);`

All `base44.asServiceRole.entities.SentEmailLog.create/update(...)` calls (lines 106, 212, 230) are **left exactly as-is**.

**`base44/functions/sendTextReminders/entry.ts`** — same `fetchAll`/`fetchByIds` helpers added, same pattern:
- Line 23: `const appointments = await base44.asServiceRole.entities.Appointment.list();` → `const appointments = await fetchAll('Appointment');`
- Line 62: `const vehicles = vehicleIds.length > 0 ? await base44.asServiceRole.entities.Vehicle.filter({ id: { $in: vehicleIds } }) : [];` → `const vehicles = await fetchByIds('Vehicle', vehicleIds);`

`SentEmailLog.create/update(...)` calls (lines 106, 132, 145) left as-is.

**Testing note:** since the native `Appointment` table has zero rows until go-live (0.2), meaningful end-to-end testing of these patched functions this phase means creating a throwaway test appointment via the (now-migrated) `/Schedule` UI with `reminders_email`/`reminders_text` on and `reminder_days_before: 0`, then manually invoking the Base44 function URL directly and confirming it (a) reaches Postgres via the new `fetchAll` path and (b) finds that test row — not a real reminder-delivery test with production data.

### 3.6 — `Admin.jsx` debug-tool list update

Line 24-27 (`SUPABASE_TABLES`) and line 30 (`LOCAL_ENTITIES`): move `"Appointment"` from the latter to the former, alphabetically re-sorted (the array already calls `.sort()`, so insertion order doesn't matter).

---

## 4) Verification Plan

> **Scope note:** since real appointment data migration is deferred to go-live (0.2), steps 3, 5-8 below are tested with **throwaway test appointments only**, not real customer data. Steps 5-7 specifically (`SchedulerViaWoModal`, `EditApptViaWoModal`, `AppointmentsListModal`) are WO-context surfaces best validated with real linked data — full sign-off on those three is **deferred to Phase 13**; this phase confirms the code compiles/runs and the obvious happy path doesn't error, not full production-representative testing.

### Step-by-step verification narrative

1. **Schema:** After 3.1's migration, query `information_schema.columns` on both dev and prod to confirm `created_date` rename and all 7 new columns are present with correct types/defaults, and `title` is still present (intentionally not dropped this phase).
2. **Data migration:** N/A this phase — deferred to go-live per 0.2 (see 3.2's checklist for that future work).
3. **`/Schedule` page (main calendar):** Load the page (will show empty/near-empty until go-live's import — that's expected, not a bug). Create a throwaway test appointment end-to-end (customer → vehicle → bay → tech → status → notes → reminders), confirm it lands in `"Appointment"` via direct DB check (not just UI reload). Edit its time via drag-and-drop, confirm the `update` call succeeds, `updated_date` changes, and it persists on reload. Delete it, confirm it's gone from both UI and DB.
4. **Reminders sanity check (non-destructive):** Using the same throwaway test appointment (dated "today," `reminders_email`/`reminders_text` on, `reminder_days_before: 0`), manually invoke `sendAppointmentReminders`/`sendTextReminders` directly against Base44 with the new `SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY` secrets in place (0.3); confirm it finds the appointment via the new `fetchAll('Appointment')` path (Section 3.5) — proves the read-path patch works, not a real reminder-delivery test.
5. **`SchedulerViaWoModal` (Schedule button on a Work Order) — code-path smoke test only, full validation deferred to Phase 13:** Open from `WorkOrders.jsx`, create a throwaway test appointment linked to a real WO, confirm no "Failed to save appointment" error (this is the currently-broken path per 0.1) and it persists with `work_order_id` set correctly.
6. **`EditApptViaWoModal` — code-path smoke test only, deferred to Phase 13:** Edit the throwaway appointment from within the WO's context, confirm changes persist.
7. **`AppointmentsListModal` — code-path smoke test only, deferred to Phase 13:** Open from a Work Order card, confirm the list loads (no more `appointment.title` reference errors/blanks) and the new heading format reads sensibly for the throwaway appointment.
8. **`CellAppointmentsModal`:** Trigger the overlapping-appointments view (create 2+ throwaway appointments, same bay/time), confirm the secondary notes line renders correctly and doesn't duplicate the customer name.
9. **"Create Work Order" from `AppointmentForm`:** Create a test appointment with notes filled in, click "Create Estimate"/"Create Work Order," confirm the resulting WO's `description` field is pre-filled with those notes.
10. **`Admin.jsx` debug tool:** Confirm `Appointment` now appears under the Supabase-table dropdown, not the local-entity one.
11. **Repo-wide grep:** `base44` / `@/entities/all` / `@/entities/Appointment` return zero hits for anything Appointment-related in `src/`. `base44/functions/sendAppointmentReminders`/`sendTextReminders` retain exactly the `SentEmailLog`-related `base44.asServiceRole` calls per 3.5, nothing else.
12. **Regression check on adjacent, out-of-scope flows:** Confirm the "Create Estimate"/"Create Work Order" buttons in `AppointmentForm.jsx` still work exactly as before (they're intentionally untouched, still hitting Base44 — just confirming this phase didn't accidentally break them).

### Verification checklist — Phase 12 (this phase)

**Code-complete as of 2026-08-03. Items below marked `[x]` are code-verified (schema confirmed via `information_schema.columns`, repo-wide grep confirms zero remaining base44 `Appointment` references). Items requiring a live click-through in the browser are marked `[ ]` — still need you/a follow-up session to run through the UI, since this session did not launch the app.**

- [x] Dev branch: `ALTER TABLE` applied (`created_at`→`created_date` rename + 7 new columns), confirmed via `information_schema.columns`
- [x] Production: `ALTER TABLE` applied, same confirmation
- [x] `Schedule.jsx`: base44 imports removed; `Appointment`/`Employee` calls converted to direct `supabase.from()`; `useAuth`/`currentEmployee` added for `created_by`/`created_by_id` on create
- [ ] `Schedule.jsx`: create throwaway test appointment end-to-end, verified in DB (no client-side `id`, relies on `gen_random_uuid()` default)
- [ ] `Schedule.jsx`: drag-and-drop time update persists, `updated_date` changes
- [ ] `Schedule.jsx`: delete appointment removes from DB
- [x] `EditApptViaWoModal.jsx`: base44 imports removed; `useAuth` added for create audit fields — code-path smoke test still needed (full validation deferred to Phase 13)
- [x] `WorkOrders.jsx`: `Appointment.list()` converted to `supabase.from()`; appointment badges on WO cards still need a manual check with whatever test data exists
- [x] `useWorkOrder.jsx`: `Appointment.filter()` converted to `supabase.from().eq()`; "upcoming appointment" card on `DocumentEditor.jsx`/`WorkOrderView.jsx` still needs a manual check with a linked test appointment
- [x] `AppointmentForm.jsx`: `handleCreateWorkOrder` now passes `description: formData.notes || ''`; still needs verification on a real created WO
- [x] `SchedulerViaWoModal.jsx`: dead base44/base44Client imports removed; code-path smoke test still needed (full validation deferred to Phase 13; this is the path suspected broken per 0.1)
- [x] `CellAppointmentsModal.jsx`: title reference replaced with truncated notes preview (`appointment.notes && !appointment.customer`); still needs visual verification with overlapping test appointments
- [x] `AppointmentsListModal.jsx`: title reference replaced with date-based heading (`{format(startDate, 'EEE, MMM d')} Appointment`); dead `Appointment` import removed; code-path smoke test still needed
- [x] `sendAppointmentReminders`/`sendTextReminders`: `fetchAll`/`fetchByIds` helpers added, `Appointment`/`Customer`/`Vehicle` reads re-pointed to Supabase REST; `SentEmailLog` calls confirmed untouched (grep-verified — only `SentEmailLog` `base44.asServiceRole` calls remain in both files)
- [ ] Base44 secrets `SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY` added (you), patched functions confirmed reaching Postgres with a test appointment — **not yet done, blocking live verification of 3.5**
- [x] `Admin.jsx`: `Appointment` moved from `LOCAL_ENTITIES` to `SUPABASE_TABLES`
- [x] Repo-wide grep confirms no remaining base44 references for `Appointment` in `src/` — also caught and fixed one dead `Appointment` import in `DocumentEditor.jsx` (not in original Section 3.3 file list; it only re-exported the unused entity, `upcomingAppointment` already flows in via the migrated `useWorkOrder` hook)
- [ ] Regression: "Create Estimate"/"Create Work Order" buttons in `AppointmentForm.jsx` still function (untouched Base44 path)
- [ ] `master_blueprint.md` Section 1/2 "Hybrid" classification for `Appointment` corrected at phase close; Phase 14 scope note added for deferred reminder-function native port + secret migration + `title` column drop

**Note:** `npx eslint` was run against every file touched this phase — zero new lint errors introduced. All pre-existing unused-import warnings in `Schedule.jsx`, `WorkOrders.jsx`, `DocumentEditor.jsx`, `SchedulerViaWoModal.jsx`, `AppointmentForm.jsx` predate this phase (confirmed via `git diff`, none on lines this phase touched) — not fixed, out of scope.

### Deferred checklist — Phase 13 (Work Orders Core), carry forward at that phase's planning

- [ ] `SchedulerViaWoModal.jsx` full validation with real linked WO + appointment data
- [ ] `EditApptViaWoModal.jsx` full validation with real linked WO + appointment data
- [ ] `AppointmentsListModal.jsx` full validation with real linked WO + appointment data

### Deferred checklist — Phase 14 / go-live, carry forward at that phase's planning

- [ ] Real appointment data migration from Base44 (Option B, per 0.2) — including the `title`→`notes` no-op check and `employee_id` remapping resolution
- [ ] Drop `Appointment.title` column
- [ ] Full native port of `sendAppointmentReminders`/`sendTextReminders` to `autopro-*` Edge Functions
- [ ] Migrate `RESEND_API_KEY`/`SES_FROM_EMAIL`/`TWILIO_ACCOUNT_SID`/`TWILIO_AUTH_TOKEN`/`TWILIO_PHONE_NUMBER` secrets to Supabase
- [ ] Stand up `pg_cron`/`pg_net` schedule replicating Base44's current reminder-function trigger cadence
- [ ] Retire the Base44-hosted originals once the native replacements are verified
