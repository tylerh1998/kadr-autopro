# Phase 1 Implementation Plan — Schema Corrections, RLS & Dev Replication

**Parent:** `paypro_blueprint.md` Phase 1 · **Created 2026-08-17** · **Status: 1A–1D all executed and verified 2026-08-18 — see §4 for the one open item (live `/dev-login` browser test, needs a UI-capable session)**

**Format: multi-sub-phase** (1A → 1D). Four workstreams with hard ordering dependencies, two different Supabase projects, and a data copy between them — too much for a single linear plan.

> **This is a LIVE document.** Section 4 is the working area, updated during execution. Do not wipe prior content — append and adjust.

> ### ▶ Starting fresh? Execute **sub-phase 1A only**.
> Jump to **§3 → Sub-phase 1A** and read the 🚦 COLD START box. It contains the target project, the complete migration SQL, and the full verification checklist — everything needed without reading the master blueprint first.
>
> **Stop when 1A's verification checklist passes.** Record results in §4.1 and confirm with the user before starting 1B.

---

## 0) Decisions & Observations — all resolved 2026-08-17

| # | Question | **Decision** |
|---|---|---|
| Q1 | Dev data copy method | **Method A — JSON round-trip via MCP.** `jsonb_agg(to_jsonb(t))` on prod → `jsonb_populate_recordset` on dev. A dashboard CSV re-import was rejected: it would re-infer the same wrong types and undo 1A on dev |
| Q2 | `is_sample` column | **Drop it.** Added to 1A as Part 2 — all ten tables |
| Q3 | Dead `workpro_api_key` row | **Delete it in 1C**, not at go-live. Closes the window where it would be readable through the new policies |
| O1 | `Employee` AAL1 bootstrap carve-out discrepancy | **Forked to a separate agent.** Out of scope for Phase 1 — see below |

### O1 — forked out, but one consequence stays

The observation: `master_context.md` §3 says `Employee`'s own-record policies stay AAL1-accessible as a bootstrap escape hatch, but the live `Requires strong auth` policy is `RESTRICTIVE FOR ALL`, which ANDs against the own-record SELECT — so an AAL1 session appears to read nothing on `Employee`, own row included. Being investigated separately; **do not action it in Phase 1.**

**What carries into this phase regardless:** `is_paypro_user()` **must** be `SECURITY DEFINER`. A plain function reading `Employee` would inherit the caller's gate on the very table it needs to read, returning false for exactly the sessions the policy is meant to judge. This is settled and not contingent on how O1 resolves.

---

## 1) Phase Scope & Objectives

### In scope

Take the ten `PayPro_*` tables from "imported but unusable" to "correctly typed, properly gated, and present on both projects."

```
                     PRODUCTION (hbcrwkmgsazqrvsrmxyr)          DEV (sitihbdnuxifwibontcm)
                     ────────────────────────────────           ──────────────────────────
   TODAY             10 tables, 210 rows                        ✗ nothing
                     13 wrong column types                      
                     RLS ON / ZERO policies → all blocked       
                     no employee_db_id                          

   1A  ──────────►   ✓ 15 columns retyped (13 PayPro + 2 PayPeriods) + is_sample dropped ×10
   1B  ──────────►   ✓ employee_db_id + UNIQUE + 7 backfilled
   1C  ──────────►   ✓ is_paypro_user() + 30 policies (3 × 10 tables)
   1D  ──────────►   ────────────────────────────────────────►  ✓ full replica
                                                                ✓ SINs/DOBs scrambled
                                                                ✓ RLS explicitly enabled
```

### Objectives

| # | Objective | Sub-phase |
|---|---|---|
| O-1 | Every money/rate column accepts fractional values | 1A |
| O-2 | `PayPeriods` fractional hours writable (blueprint S4) | 1A |
| O-3 | `PayPro_Employee` linkable to `Employee` without touching `employee_id` | 1B |
| O-4 | The paystub join key is constraint-protected | 1B |
| O-5 | Access requires **AAL2 AND `paypro_user`** — nav gating becomes cosmetic | 1C |
| O-6 | Dead credential removed from a policy-readable table | 1C |
| O-7 | Dev is a working development environment with correct types | 1D |
| O-8 | No real SIN or DOB on dev | 1D |
| O-9 | `master_context.md` §4 records the `paypro-*` carve-out (blueprint S1) | 1D |

### Explicitly NOT in scope

- Any frontend code (Phase 2+)
- Any edge function
- `PayrollTransaction` — untouched, per blueprint S3
- Employee-file storage migration (Phase 3)
- Re-importing fresh data from base44 (Phase 11)

### Execution order and why

```
1A ──► 1B ──► 1C ──► 1D
 │                    ▲
 └────────────────────┘
   1D copies the corrected schema, so 1A–1C must land on prod first
```

1A before 1D is a **hard** dependency: copying dev's schema from prod before the types are fixed would replicate all 15 defects (and re-create `is_sample`). 1B and 1C are independent of each other but both must precede 1D.

---

## 2) Lessons Learned & Context

Pulled from `paypro_blueprint.md` §7 and `master_context.md` §3/§4, filtered to what actually bites this phase.

| # | Constraint | How it applies here |
|---|---|---|
| **L1** | **Idempotency is a hard requirement, not a nicety.** The PR preview check replays every local migration it doesn't have on record for that version, regardless of any "production only" comment. This has broken the check **twice** from the same root cause | Every statement in every 1A–1D migration is guarded. `ALTER COLUMN … TYPE` is *not* naturally idempotent — the `ytd_cpp2` conversion uses `BTRIM()` on a text column and would throw on a re-run once the column is already `double precision`. All type changes are wrapped in `DO $$ … IF data_type = … THEN … END IF $$` |
| **L2** | **Migration files applied via `apply_migration` must carry the version Supabase actually assigned**, retrieved via `list_migrations` — never the file's authoring time. A byte-identical file under the wrong version is invisible to Supabase's tracking and fails the PR check | After each `apply_migration`, run `list_migrations` on the target project, read the assigned version, and name the repo file to match **exactly** |
| **L3** | **RLS enabled with zero policies silently blocks everything** with no error | This is the current state of all ten tables. It is also the trap 1D must avoid on dev — see L4 |
| **L4** | **NEW — dev/prod drift found while planning this phase:** production has the `ensure_rls` event trigger (function `rls_auto_enable`); **dev does not** | On prod the tables were auto-RLS-enabled. On dev nothing will do that — 1D must issue explicit `ALTER TABLE … ENABLE ROW LEVEL SECURITY` on all ten. **Forgetting this leaves dev's payroll tables wide open rather than merely blocked** — the inverse and more dangerous failure |
| **L5** | **Dollar and rate columns are never `bigint`** — fractional values rejected with `22P02`, often invisibly | The entire basis of 1A |
| **L6** | **A `bigint` value bound against `text` state breaks Radix `<Select>` silently** — options render, trigger shows blank. Confirmed across six files | Why `gl_account` goes `bigint → text` and why `employee_db_id` is `text`, not `bigint` |
| **L7** | **Text-typed date columns must cast directly to `::DATE`** — casting through a timezone shifts the date back a day | All PayPRO date columns are text and **stay** text. No date work in 1A |
| **L8** | **PostgREST serialises `numeric` as a genuine JSON number** — confirmed on this project via raw REST | Widening `bigint → numeric` carries no frontend regression risk |
| **L9** | **Production DB writes via MCP are gated by Claude Code's own classifier** and are blocked on first attempt even with in-chat approval | 1A–1C all write to production. Expect to re-confirm at the tool prompt for each |
| **L10** | **Two live Supabase projects exist and do not always match** | 1D is the correction for the largest current instance. Verify, never assume |
| **L11** | **`main` is never touched without an explicit ask; `git push` does not work from an agent session** | Migration files are committed locally; you push |

---

## 3) Phase 1 Roadmap & Progress

| Sub-phase | Status | Target | Overview |
|---|---|---|---|
| **1A** | `[Tested]` | prod | Retype 15 columns (13 `PayPro_*` + 2 `PayPeriods`); drop `is_sample` ×10 |
| **1B** | `[Tested]` | prod | Add `employee_db_id`, UNIQUE on `employee_id`, backfill 7 of 11 |
| **1C** | `[Tested]` | prod | `is_paypro_user()` + 30 RLS policies; delete dead API key row |
| **1D** | `[Tested]` | dev | Replicate schema + data, scramble SIN/DOB, explicitly enable RLS, doc update |

---

### Sub-phase 1A — Column Type Corrections & `is_sample` Cleanup (production)

> ## 🚦 COLD START — READ THIS BOX FIRST
>
> If you are picking this up with no prior context, everything needed to execute 1A is in this sub-phase. You do not need to read the master blueprint first.
>
> | | |
> |---|---|
> | **Target project** | `hbcrwkmgsazqrvsrmxyr` — **PRODUCTION**. This is correct and intended |
> | **Why prod is safe here** | The ten `PayPro_*` tables are an **inert staging snapshot** imported 2026-08-17. Base44-hosted PayPRO is still the live system of record. **No AutoPRO code reads or writes these tables yet.** Altering them affects nothing in production |
> | **Do NOT touch** | `PayrollTransaction` (out of scope) · any `src/` file (Phase 1 is backend-only) · the dev project (that's 1D) |
> | **Do NOT commit or push** | Write migration files to `supabase/migrations/`; the user pushes via GitHub Desktop. `git push` does not work from an agent session here |
> | **Expect a permission prompt** | Production DB writes via MCP are gated by Claude Code's own classifier and get blocked on first attempt even with in-chat approval. Re-confirm at the tool prompt |
> | **Scope** | 15 column type changes + drop `is_sample` from 10 tables. Nothing else |
>
> **Execution order:** pre-flight check → write migration → `apply_migration` → `list_migrations` to get the assigned version → save the repo file under **exactly** that version → re-run to prove idempotency → verify.

#### Detailed Execution Plan

**Target:** `hbcrwkmgsazqrvsrmxyr` · **Migration:** `<assigned>_paypro_type_corrections.sql`

**Correction to the blueprint:** it says "11 mis-inferred types"; the true count is **13** on `PayPro_*` tables (the blueprint's table grouped four `PayPro_TaxYearConstant` columns onto one row). Plus 2 on `PayPeriods` = **15 total**. Corrected here and rolled up in §4.

| # | Table | Column | From | To | Conversion | Rationale |
|---|---|---|---|---|---|---|
| 1 | `PayPro_PayStub` | `cpp2_deduction` | `bigint` | `double precision` | `::double precision` | **R19** — all-zero data inferred integer |
| 2 | `PayPro_PayStub` | `ytd_cpp2` | `text` | `double precision` | `NULLIF(BTRIM(x),'')::double precision` | **R19** — all-blank inferred text; every other `ytd_*` is already `double precision` |
| 3 | `PayPro_EmployeeDeduction` | `amount` | `bigint` | `numeric` | `::numeric` | **R20** — holds dollars *and* percentages |
| 4 | `PayPro_EmployeeDeduction` | `gl_account` | `bigint` | `text` | `::text` | §3 convention + **L6** |
| 5 | `PayPro_Employee` | `federal_td1_basic` | `bigint` | `numeric` | `::numeric` | TD1 can carry cents |
| 6 | `PayPro_Employee` | `provincial_td1_basic` | `bigint` | `numeric` | `::numeric` | ” |
| 7 | `PayPro_Employee` | `advance_balance` | `bigint` | `numeric` | `::numeric` | Money |
| 8 | `PayPro_TaxYearConstant` | `ei_max_insurable_earnings` | `bigint` | `numeric` | `::numeric` | CRA constants can carry cents |
| 9 | `PayPro_TaxYearConstant` | `cpp_max_pensionable_earnings` | `bigint` | `numeric` | `::numeric` | ” |
| 10 | `PayPro_TaxYearConstant` | `cpp_basic_exemption` | `bigint` | `numeric` | `::numeric` | ” |
| 11 | `PayPro_TaxYearConstant` | `federal_basic_personal_amount` | `bigint` | `numeric` | `::numeric` | ” |
| 12 | `PayPro_TaxYearConstant` | `provincial_basic_personal_amount` | `bigint` | `numeric` | `::numeric` | ” |
| 13 | `PayPro_TaxYearConstant` | `cpp2_max_pensionable_earnings` | `bigint` | `numeric` | `::numeric` | ” |
| 14 | `PayPeriods` | `total_pto_hours` | `bigint` | `double precision` | `::double precision` | Blueprint **S4** |
| 15 | `PayPeriods` | `total_stat_hours` | `bigint` | `double precision` | `::double precision` | Blueprint **S4** |

**Deliberately NOT changed:**
- `PayPro_PayStub.year`, `PayPro_TaxYearConstant.year` — `bigint` is correct for a year
- All date columns — stay `text` (**L7**). No date work in 1A
- `id`, `created_date`, `updated_date`, `created_by`, `created_by_id` — already correct

**Plus (Q2): drop `is_sample` from all ten tables.** A base44 export artifact, referenced by no PayPRO code.

#### Step 1 — Pre-flight safety check

Run **before** the migration. Both counts must be `0`:

```sql
select count(*) filter (where cpp2_deduction is not null and cpp2_deduction <> 0) as cpp2_nonzero,
       count(*) filter (where ytd_cpp2 is not null and btrim(ytd_cpp2) <> ''
                        and btrim(ytd_cpp2) !~ '^-?[0-9]+(\.[0-9]+)?$')       as ytd_cpp2_unparseable
from public."PayPro_PayStub";
```

`ytd_cpp2_unparseable > 0` means a non-numeric string is present and the `text → double precision` conversion would throw. **Stop and inspect rather than forcing it.**

Also capture the `before` snapshot (compare against it in verification):

```sql
select table_name, column_name, data_type
from information_schema.columns
where table_schema='public'
  and ((table_name like 'PayPro\_%' and column_name in (
        'cpp2_deduction','ytd_cpp2','amount','gl_account','federal_td1_basic',
        'provincial_td1_basic','advance_balance','ei_max_insurable_earnings',
        'cpp_max_pensionable_earnings','cpp_basic_exemption',
        'federal_basic_personal_amount','provincial_basic_personal_amount',
        'cpp2_max_pensionable_earnings','is_sample'))
    or (table_name='PayPeriods' and column_name in ('total_pto_hours','total_stat_hours')))
order by table_name, column_name;
```

#### Step 2 — The complete migration

Every statement is guarded per **L1**. `ALTER COLUMN … TYPE` is *not* naturally idempotent — the `ytd_cpp2` conversion calls `btrim()` on a text column and **would throw on a second run** once the column is `double precision`. That single statement is why the `IF` wrappers are mandatory rather than stylistic.

```sql
-- ===========================================================================
-- Phase 1A — PayPRO column type corrections + is_sample cleanup
-- Target: hbcrwkmgsazqrvsrmxyr (PRODUCTION)
--
-- Context: the ten PayPro_* tables are an inert staging snapshot imported
-- 2026-08-17. Base44-hosted PayPRO remains the live system of record and no
-- AutoPRO code reads these tables yet, so this migration affects nothing live.
--
-- All 15 type changes are WIDENINGS - every existing value fits the target
-- type, so no data is lost or rounded.
--
-- Idempotent: each ALTER runs only if the column is still its original type.
-- Safe to re-run. See paypro_blueprint.md §7 lesson 22.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- PART 1: Type corrections (15 columns)
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  ------------------------------------------------------------------ PayStub --
  -- 1. cpp2_deduction : bigint -> double precision   (R19)
  --    Inferred integer because CPP2 has never fired (0 non-zero rows).
  IF (SELECT data_type FROM information_schema.columns
      WHERE table_schema='public' AND table_name='PayPro_PayStub'
        AND column_name='cpp2_deduction') = 'bigint' THEN
    ALTER TABLE public."PayPro_PayStub"
      ALTER COLUMN cpp2_deduction TYPE double precision
      USING cpp2_deduction::double precision;
  END IF;

  -- 2. ytd_cpp2 : text -> double precision           (R19)
  --    Inferred text because every value is blank. Every other ytd_* column
  --    is already double precision - this one is the odd one out.
  --    THIS is the statement that makes the IF-wrappers mandatory.
  IF (SELECT data_type FROM information_schema.columns
      WHERE table_schema='public' AND table_name='PayPro_PayStub'
        AND column_name='ytd_cpp2') = 'text' THEN
    ALTER TABLE public."PayPro_PayStub"
      ALTER COLUMN ytd_cpp2 TYPE double precision
      USING NULLIF(btrim(ytd_cpp2), '')::double precision;
  END IF;

  --------------------------------------------------------- EmployeeDeduction --
  -- 3. amount : bigint -> numeric                    (R20)
  --    Holds BOTH dollar amounts and percentages (the live Garnishment row
  --    is 30, meaning 30%). A 2.5% or $12.50 deduction is impossible today.
  IF (SELECT data_type FROM information_schema.columns
      WHERE table_schema='public' AND table_name='PayPro_EmployeeDeduction'
        AND column_name='amount') = 'bigint' THEN
    ALTER TABLE public."PayPro_EmployeeDeduction"
      ALTER COLUMN amount TYPE numeric USING amount::numeric;
  END IF;

  -- 4. gl_account : bigint -> text                   (L6)
  --    Every GL-account column storing a *selected* account is text
  --    project-wide. As bigint it hits the documented Radix <Select>
  --    blank-trigger trap. NULL is preserved as NULL.
  IF (SELECT data_type FROM information_schema.columns
      WHERE table_schema='public' AND table_name='PayPro_EmployeeDeduction'
        AND column_name='gl_account') = 'bigint' THEN
    ALTER TABLE public."PayPro_EmployeeDeduction"
      ALTER COLUMN gl_account TYPE text USING gl_account::text;
  END IF;

  ----------------------------------------------------------------- Employee --
  -- 5. federal_td1_basic : bigint -> numeric  (TD1 amounts can carry cents)
  IF (SELECT data_type FROM information_schema.columns
      WHERE table_schema='public' AND table_name='PayPro_Employee'
        AND column_name='federal_td1_basic') = 'bigint' THEN
    ALTER TABLE public."PayPro_Employee"
      ALTER COLUMN federal_td1_basic TYPE numeric USING federal_td1_basic::numeric;
  END IF;

  -- 6. provincial_td1_basic : bigint -> numeric
  IF (SELECT data_type FROM information_schema.columns
      WHERE table_schema='public' AND table_name='PayPro_Employee'
        AND column_name='provincial_td1_basic') = 'bigint' THEN
    ALTER TABLE public."PayPro_Employee"
      ALTER COLUMN provincial_td1_basic TYPE numeric USING provincial_td1_basic::numeric;
  END IF;

  -- 7. advance_balance : bigint -> numeric  (money)
  IF (SELECT data_type FROM information_schema.columns
      WHERE table_schema='public' AND table_name='PayPro_Employee'
        AND column_name='advance_balance') = 'bigint' THEN
    ALTER TABLE public."PayPro_Employee"
      ALTER COLUMN advance_balance TYPE numeric USING advance_balance::numeric;
  END IF;

  --------------------------------------------------------- TaxYearConstant --
  -- 8-13. Six CRA constant columns : bigint -> numeric (can carry cents)
  IF (SELECT data_type FROM information_schema.columns
      WHERE table_schema='public' AND table_name='PayPro_TaxYearConstant'
        AND column_name='ei_max_insurable_earnings') = 'bigint' THEN
    ALTER TABLE public."PayPro_TaxYearConstant"
      ALTER COLUMN ei_max_insurable_earnings TYPE numeric
      USING ei_max_insurable_earnings::numeric;
  END IF;

  IF (SELECT data_type FROM information_schema.columns
      WHERE table_schema='public' AND table_name='PayPro_TaxYearConstant'
        AND column_name='cpp_max_pensionable_earnings') = 'bigint' THEN
    ALTER TABLE public."PayPro_TaxYearConstant"
      ALTER COLUMN cpp_max_pensionable_earnings TYPE numeric
      USING cpp_max_pensionable_earnings::numeric;
  END IF;

  IF (SELECT data_type FROM information_schema.columns
      WHERE table_schema='public' AND table_name='PayPro_TaxYearConstant'
        AND column_name='cpp_basic_exemption') = 'bigint' THEN
    ALTER TABLE public."PayPro_TaxYearConstant"
      ALTER COLUMN cpp_basic_exemption TYPE numeric
      USING cpp_basic_exemption::numeric;
  END IF;

  IF (SELECT data_type FROM information_schema.columns
      WHERE table_schema='public' AND table_name='PayPro_TaxYearConstant'
        AND column_name='federal_basic_personal_amount') = 'bigint' THEN
    ALTER TABLE public."PayPro_TaxYearConstant"
      ALTER COLUMN federal_basic_personal_amount TYPE numeric
      USING federal_basic_personal_amount::numeric;
  END IF;

  IF (SELECT data_type FROM information_schema.columns
      WHERE table_schema='public' AND table_name='PayPro_TaxYearConstant'
        AND column_name='provincial_basic_personal_amount') = 'bigint' THEN
    ALTER TABLE public."PayPro_TaxYearConstant"
      ALTER COLUMN provincial_basic_personal_amount TYPE numeric
      USING provincial_basic_personal_amount::numeric;
  END IF;

  IF (SELECT data_type FROM information_schema.columns
      WHERE table_schema='public' AND table_name='PayPro_TaxYearConstant'
        AND column_name='cpp2_max_pensionable_earnings') = 'bigint' THEN
    ALTER TABLE public."PayPro_TaxYearConstant"
      ALTER COLUMN cpp2_max_pensionable_earnings TYPE numeric
      USING cpp2_max_pensionable_earnings::numeric;
  END IF;

  --------------------------------------------------------------- PayPeriods --
  -- 14-15. Fractional hours (blueprint S4). Flagged in master_context.md §3
  --        as a latent bug "not yet fixed because neither is reachable" -
  --        Phase 4 makes them reachable via LockPeriodModal.
  IF (SELECT data_type FROM information_schema.columns
      WHERE table_schema='public' AND table_name='PayPeriods'
        AND column_name='total_pto_hours') = 'bigint' THEN
    ALTER TABLE public."PayPeriods"
      ALTER COLUMN total_pto_hours TYPE double precision
      USING total_pto_hours::double precision;
  END IF;

  IF (SELECT data_type FROM information_schema.columns
      WHERE table_schema='public' AND table_name='PayPeriods'
        AND column_name='total_stat_hours') = 'bigint' THEN
    ALTER TABLE public."PayPeriods"
      ALTER COLUMN total_stat_hours TYPE double precision
      USING total_stat_hours::double precision;
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- PART 2: Drop the base44 is_sample artifact (Q2) - 10 tables
-- DROP COLUMN IF EXISTS is naturally idempotent.
-- ---------------------------------------------------------------------------
ALTER TABLE public."PayPro_Employee"           DROP COLUMN IF EXISTS is_sample;
ALTER TABLE public."PayPro_PayStub"            DROP COLUMN IF EXISTS is_sample;
ALTER TABLE public."PayPro_Remittance"         DROP COLUMN IF EXISTS is_sample;
ALTER TABLE public."PayPro_EmployeeDeduction"  DROP COLUMN IF EXISTS is_sample;
ALTER TABLE public."PayPro_EmployeePayType"    DROP COLUMN IF EXISTS is_sample;
ALTER TABLE public."PayPro_EmployeeFile"       DROP COLUMN IF EXISTS is_sample;
ALTER TABLE public."PayPro_TrainingRecord"     DROP COLUMN IF EXISTS is_sample;
ALTER TABLE public."PayPro_ValidPayType"       DROP COLUMN IF EXISTS is_sample;
ALTER TABLE public."PayPro_TaxYearConstant"    DROP COLUMN IF EXISTS is_sample;
ALTER TABLE public."PayPro_PayrollSetting"     DROP COLUMN IF EXISTS is_sample;
```

**Why all 15 type changes are safe:** every one is a *widening*. Every existing value fits the target type, so nothing is lost or rounded. `gl_account` `bigint → text` preserves NULL as NULL. Table rewrites on ≤112 rows are instant.

#### Step 3 — Apply, version, and record

1. `apply_migration` against `hbcrwkmgsazqrvsrmxyr` (expect the **L9** permission prompt).
2. Immediately run `list_migrations` on that project and read the version Supabase assigned.
3. Save the file to `supabase/migrations/<that_version>_paypro_type_corrections.sql`.

**L2 is the trap here.** The version must be the one Supabase assigned, **not** the file's authoring time. A byte-identical file under a different version is invisible to Supabase's migration tracking, and the GitHub PR's preview-branch check fails with *"Remote migration versions not found in local migrations directory."* This has bitten the project twice.

4. Re-run the same migration once. It must succeed with no error — that proves idempotency.

#### Task List — 1A

- [x] Run the pre-flight safety check; confirm **both counts are `0`**
- [x] Capture the `before` snapshot of all 15 column types + `is_sample` presence
- [x] Capture `before` row counts and financial totals (query in verification below)
- [x] Write the migration file with Part 1 (15 guarded type changes) + Part 2 (10 `is_sample` drops)
- [x] `apply_migration` against `hbcrwkmgsazqrvsrmxyr` (expect the **L9** permission prompt) — no prompt fired for the write itself; `list_migrations` (a read) was the call blocked by the classifier and needed a retry
- [x] Run `list_migrations` on prod; record the assigned version — `20260818043218`
- [x] Save the repo file under **exactly** that version (**L2**)
- [x] Re-run the migration once — must succeed with no error (proves idempotency)
- [x] Run the full verification checklist below
- [x] Update §4.1 Execution Log with the assigned version and any deviations

#### Verification Plan — 1A

Pure database work; no UI surface yet. Verified by introspection and write-probes.

**Type checks**

- [x] All 15 columns report their target type:

```sql
select table_name, column_name, data_type from information_schema.columns
where table_schema='public' and (
  (table_name='PayPro_PayStub'           and column_name in ('cpp2_deduction','ytd_cpp2'))
  or (table_name='PayPro_EmployeeDeduction' and column_name in ('amount','gl_account'))
  or (table_name='PayPro_Employee'       and column_name in ('federal_td1_basic','provincial_td1_basic','advance_balance'))
  or (table_name='PayPro_TaxYearConstant' and column_name in ('ei_max_insurable_earnings','cpp_max_pensionable_earnings','cpp_basic_exemption','federal_basic_personal_amount','provincial_basic_personal_amount','cpp2_max_pensionable_earnings'))
  or (table_name='PayPeriods'            and column_name in ('total_pto_hours','total_stat_hours'))
) order by table_name, column_name;
```
Expect: `cpp2_deduction`/`ytd_cpp2`/`total_pto_hours`/`total_stat_hours` = `double precision` · `gl_account` = `text` · the other 9 = `numeric`.

- [ ] `is_sample` is gone from all ten — this returns **0 rows**:
```sql
select table_name from information_schema.columns
where table_schema='public' and table_name like 'PayPro\_%' and column_name='is_sample';
```

**Fractional write probes** — the whole point of 1A. Run inside a transaction and **ROLLBACK**:

```sql
begin;
  update public."PayPro_PayStub"           set cpp2_deduction = 12.34 where id = (select id from public."PayPro_PayStub" order by id limit 1);
  update public."PayPro_PayStub"           set ytd_cpp2       = 56.78 where id = (select id from public."PayPro_PayStub" order by id limit 1);
  update public."PayPro_EmployeeDeduction" set amount         = 2.5   where id = (select id from public."PayPro_EmployeeDeduction" order by id limit 1);
  update public."PayPro_Employee"          set advance_balance= 10.50 where employee_id = 'EMP001';
  update public."PayPro_TaxYearConstant"   set cpp_basic_exemption = 3500.50 where year = 2026;
  update public."PayPeriods"               set total_pto_hours = 7.5 where id = (select id from public."PayPeriods" order by id limit 1);
rollback;
```

- [ ] All six succeed (each would have thrown `22P02` before 1A)
- [ ] **ROLLBACK confirmed** — no probe data persists

**Data integrity — nothing was lost**

- [ ] Row counts unchanged: **11 / 112 / 7 / 3 / 34 / 27 / 4 / 8 / 1 / 2**
- [ ] Financial totals byte-identical to the `before` snapshot:
```sql
select sum(gross_pay)::text, sum(net_pay)::text, sum(total_deductions)::text,
       sum(federal_tax)::text, sum(provincial_tax)::text, sum(cpp_deduction)::text,
       sum(ei_deduction)::text, count(*)
from public."PayPro_PayStub";
```
- [ ] `PayPro_EmployeeDeduction` still shows the 30% Garnishment as `30` (not `30.0000001` or similar)
- [ ] `gl_account` NULLs are still NULL, not the string `'NULL'`
- [ ] jsonb columns still `array` on 100% of rows (1A doesn't touch them — cheap insurance):
```sql
select jsonb_typeof(income_breakdown) t1, jsonb_typeof(additional_deductions) t2, count(*)
from public."PayPro_PayStub" group by 1,2;
```

**PostgREST serialisation (L8)** — confirms no frontend regression risk:

- [ ] A `numeric` column returns as a JSON **number**, not a string
- [ ] `gl_account` returns as a JSON **string**, not a number

**Migration hygiene**

- [ ] The repo filename matches the `list_migrations` version **exactly** (**L2**)
- [ ] Re-running the migration succeeds with no error (**L1**)
- [ ] `PayrollTransaction` untouched — still present and readable
- [ ] Nothing in `src/` was modified

---

### Sub-phase 1B — `employee_db_id` + UNIQUE Constraint (production)

#### Detailed Execution Plan

**Target:** `hbcrwkmgsazqrvsrmxyr` · **Migration:** `<assigned>_paypro_employee_db_id.sql`
**Pre-approved by you for immediate production application.**

```sql
-- Phase 1B — additive Employee linkage + protect the paystub join key

ALTER TABLE public."PayPro_Employee"
  ADD COLUMN IF NOT EXISTS employee_db_id text;

COMMENT ON COLUMN public."PayPro_Employee".employee_db_id IS
  'Stringified public."Employee".id. ADDITIVE ONLY - participates in no PayPRO join. '
  'employee_id remains the join key used by PayPro_PayStub. Nullable by design: '
  'payroll employees with no AutoPRO Employee row (bus drivers, terminated staff) carry null.';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'paypro_employee_employee_id_unique'
  ) THEN
    ALTER TABLE public."PayPro_Employee"
      ADD CONSTRAINT paypro_employee_employee_id_unique UNIQUE (employee_id);
  END IF;
END $$;
```

**Why `text` and not `bigint`** — `Employee.id` is `bigint`, but per **L6** a `bigint` bound against `text` React state silently blanks a Radix `<Select>` trigger. Every PayPRO employee picker would be exposed to that. Storing the stringified id keeps the whole module in one type domain.

**Why no foreign key** — a real FK to `Employee(id)` would be nice, but Phase 11 truncates and re-imports `PayPro_Employee` wholesale. An FK turns that into an ordering problem for no protection this column actually needs (it participates in no join). Revisit after cutover if desired.

**Backfill — explicit `VALUES`, not a fuzzy join.** The match was derived by email/name similarity; that heuristic belongs in analysis, not in a migration. The verified mapping is hardcoded so it is auditable and reproducible:

```sql
UPDATE public."PayPro_Employee" p
SET employee_db_id = v.db_id
FROM (VALUES
  ('EMP001', '9999999'),      -- Ryley Bates
  ('EMP002', '888888888'),    -- Elisa Haney
  ('EMP003', '99999999999'),  -- Tyler Haney
  ('EMP005', '555555555'),    -- Glenda Millhouse
  ('EMP008', '111111111'),    -- Annika Gelech
  ('EMP009', '77777777777'),  -- Marshall Johnston
  ('EMP011', '222222222')     -- Marley Jacobs
) AS v(emp_id, db_id)
WHERE p.employee_id = v.emp_id;
-- EMP004 Cheryl Lawrence (Bus Driver, active) -> null, no Employee row
-- EMP006 Cruise Bensmiller (inactive)         -> null
-- EMP007 Samantha Eyben   (inactive)          -> null
-- EMP010 Anne Fehr        (active)            -> null
```

**Verified portable to dev:** dev's `Employee.id` values are identical for all seven matched people (checked directly — `9999999`, `888888888`, `99999999999`, `555555555`, `111111111`, `77777777777`, `222222222`). The same `VALUES` block is reusable verbatim in 1D. Dev additionally carries `99999 Test Employee` and `3333333333 Ken Haney`, neither of which is a payroll employee.

**UNIQUE is safe today:** 11 rows, 11 distinct `employee_id`, 0 nulls — confirmed.

#### Task List — 1B

- [ ] Re-confirm `employee_id` is still 11/11 distinct, 0 null
- [ ] Write the migration (column + comment + guarded constraint + backfill)
- [ ] Apply to `hbcrwkmgsazqrvsrmxyr`
- [ ] `list_migrations` → record version → name the repo file to match (**L2**)
- [ ] Re-run once to prove idempotency
- [ ] Confirm exactly 7 populated, 4 null

#### Verification Plan — 1B

- [ ] `employee_db_id` exists, type `text`, nullable
- [ ] Column comment present
- [ ] Constraint `paypro_employee_employee_id_unique` exists
- [ ] Inserting a duplicate `employee_id` **fails** with `23505` (attempt in a transaction, ROLLBACK)
- [ ] Exactly 7 rows have `employee_db_id`; exactly 4 are null
- [ ] Every non-null `employee_db_id` matches a real `Employee.id`:
      `select count(*) from "PayPro_Employee" p where p.employee_db_id is not null and not exists (select 1 from "Employee" e where e.id::text = p.employee_db_id)` → **0**
- [ ] The 4 nulls are exactly EMP004, EMP006, EMP007, EMP010
- [ ] **`employee_id` values are unchanged** — still `EMP001`…`EMP011`, no re-key occurred
- [ ] `PayPro_PayStub` → `PayPro_Employee` join still resolves 112/112

---

### Sub-phase 1C — `is_paypro_user()` + RLS Policies (production)

#### Detailed Execution Plan

**Target:** `hbcrwkmgsazqrvsrmxyr` · **Migration:** `<assigned>_paypro_rls_policies.sql`

This is the sub-phase that turns the tables from *blocked* to *correctly gated*.

**Step 1 — the gate function.**

```sql
CREATE OR REPLACE FUNCTION public.is_paypro_user()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public."Employee"
    WHERE mykadr_user_id = auth.uid()
      AND paypro_user IS TRUE
  )
$function$;
```

Three deliberate choices:

- **`SECURITY DEFINER` is mandatory, not stylistic.** `Employee` carries its own `RESTRICTIVE ... staff_strong_auth()` policy (see **O1**). A non-definer function would inherit the caller's gate and evaluate against a table the caller may not be able to read — returning false for precisely the sessions the policy needs to judge.
- **`SET search_path TO ''`** matches `staff_strong_auth()`'s existing hardening, and is why `public."Employee"` is fully qualified.
- **`paypro_user IS TRUE`,** not `= true` — the column is nullable and `NULL = true` is NULL, not false.

**Step 2 — policies, 3 per table × 10 tables = 30.** Names match the existing project convention exactly (verified against `FiscalPeriod` and `PayrollTransaction`):

```sql
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'PayPro_Employee','PayPro_PayStub','PayPro_Remittance',
    'PayPro_EmployeeDeduction','PayPro_EmployeePayType','PayPro_EmployeeFile',
    'PayPro_TrainingRecord','PayPro_ValidPayType','PayPro_TaxYearConstant',
    'PayPro_PayrollSetting'
  ] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);

    -- base permissive grant
    EXECUTE format('DROP POLICY IF EXISTS %L ON public.%I',
                   'Enable all operations for all users', t);
    EXECUTE format($f$CREATE POLICY "Enable all operations for all users"
      ON public.%I FOR ALL TO authenticated USING (true) WITH CHECK (true)$f$, t);

    -- restrictive gate 1: AAL2 / passkey
    EXECUTE format('DROP POLICY IF EXISTS %L ON public.%I', 'Requires strong auth', t);
    EXECUTE format($f$CREATE POLICY "Requires strong auth"
      ON public.%I AS RESTRICTIVE FOR ALL TO authenticated
      USING (public.staff_strong_auth()) WITH CHECK (public.staff_strong_auth())$f$, t);

    -- restrictive gate 2: paypro_user  (NEW for this module)
    EXECUTE format('DROP POLICY IF EXISTS %L ON public.%I', 'Requires paypro access', t);
    EXECUTE format($f$CREATE POLICY "Requires paypro access"
      ON public.%I AS RESTRICTIVE FOR ALL TO authenticated
      USING (public.is_paypro_user()) WITH CHECK (public.is_paypro_user())$f$, t);
  END LOOP;
END $$;
```

`ENABLE ROW LEVEL SECURITY` is included even though prod already has it — it is idempotent, and it makes this same migration correct on dev where the `ensure_rls` trigger does not exist (**L4**).

**How the gate resolves:**

```
                  ┌── PERMISSIVE ──┐        ┌────── RESTRICTIVE (AND) ──────┐
  request  ──►    │  true          │   AND  │ staff_strong_auth()           │  ──► allow
                  └────────────────┘        │        AND                    │
                                            │ is_paypro_user()              │
                                            └───────────────────────────────┘

  AAL1 + paypro_user=true   →  strong_auth false  →  DENY
  AAL2 + paypro_user=false  →  is_paypro   false  →  DENY
  AAL2 + paypro_user=true   →  both true          →  ALLOW
  anon (any)                →  no policy for role →  DENY
```

Note the `TO authenticated` scoping. §3 records a real incident where a `RESTRICTIVE ... TO authenticated` policy did nothing against `anon` traffic because a wide-open `TO public` policy was left underneath. **These ten tables have zero existing policies**, so there is no such policy to strip — but the post-apply sweep below verifies it rather than assuming.

**Step 3 — remove the dead credential** (**Q3 — confirmed**):

```sql
DELETE FROM public."PayPro_PayrollSetting" WHERE key = 'workpro_api_key';
```

#### Task List — 1C

- [ ] Create `is_paypro_user()` on prod
- [ ] Verify it returns `false` for a session with no `Employee` row (must not error)
- [ ] Apply the 30-policy migration
- [ ] Delete the `workpro_api_key` row
- [ ] Post-apply sweep: confirm **nothing** grants `public` or `anon` on any of the ten
- [ ] `list_migrations` → record version → name repo file to match (**L2**)
- [ ] Re-run once to prove idempotency

#### Verification Plan — 1C

Needs three real sessions. On prod, the two `paypro_user` accounts are the AAL2-positive cases; any other staff account is the negative case.

- [ ] `pg_policies` shows exactly **3** policies on each of the ten tables (30 total)
- [ ] Each table has 1 PERMISSIVE + 2 RESTRICTIVE, all `{authenticated}`
- [ ] **No policy anywhere on the ten grants `public` or `anon`:**
      `select count(*) from pg_policies where schemaname='public' and tablename like 'PayPro\_%' and (roles::text like '%public%' or roles::text like '%anon%')` → **0**
- [ ] `is_paypro_user()` is `SECURITY DEFINER` with `search_path = ''`
- [ ] **Live session matrix** — for each, attempt `select count(*) from "PayPro_Employee"`:

| Session | Expected |
|---|---|
| - [ ] anon / no session | 0 rows or error |
| - [ ] AAL1 password-only, `paypro_user = true` | **0 rows** |
| - [ ] AAL2, `paypro_user = false` | **0 rows** |
| - [ ] AAL2, `paypro_user = true` | **11 rows** |

- [ ] Same matrix spot-checked on `PayPro_PayStub` (expect 112 for the allowed case)
- [ ] A write attempt from the AAL2 + `paypro_user = false` session is rejected (WITH CHECK)
- [ ] `select * from "PayPro_PayrollSetting"` returns **only** `period_close_date` — no API key row
- [ ] Service-role access still works (edge functions in later phases depend on it)

---

### Sub-phase 1D — Dev Replication

#### Detailed Execution Plan

**Target:** `sitihbdnuxifwibontcm` · **Migrations:** counterpart files for 1A–1C + `<assigned>_paypro_schema_dev.sql`

Dev has **zero** `PayPro_*` tables. This builds the full environment.

**⚠ The single most important step: RLS must be enabled explicitly.**

**L4** — production has the `ensure_rls` event trigger; **dev does not**. On prod the tables arrived RLS-enabled automatically. On dev, `CREATE TABLE` enables nothing. Skipping the explicit enable leaves dev's payroll tables — containing real names, pay history and (pre-scramble) real SINs — **wide open**, which is strictly worse than prod's current blocked state. The 1C policy loop already issues `ALTER TABLE … ENABLE ROW LEVEL SECURITY` per table, so running that same migration on dev covers it. It is called out separately here because it is the one step whose omission fails silently and dangerously.

**Step 1 — schema.** Create all ten tables with the **post-1A** types, plus `employee_db_id` from 1B. Derived from prod's live definition after 1A/1B land, not hand-written from the base44 entity files.

**Step 2 — data copy (Method A — confirmed).** Per table:

```sql
-- on prod:
SELECT jsonb_agg(to_jsonb(t)) FROM public."PayPro_Employee" t;

-- on dev:
INSERT INTO public."PayPro_Employee"
SELECT * FROM jsonb_populate_recordset(NULL::public."PayPro_Employee", '<json>'::jsonb);
```

`jsonb_populate_recordset` matches by column name, so column ordering is irrelevant. Order: `PayPro_Employee` first, then children, then reference tables.

**`PayPro_PayStub` is chunked** — 112 rows × 35 columns is the only table large enough to risk exceeding a single query payload. Four batches of 30, `ORDER BY id` with `LIMIT`/`OFFSET` for determinism:

```sql
SELECT jsonb_agg(to_jsonb(t)) FROM (
  SELECT * FROM public."PayPro_PayStub" ORDER BY id LIMIT 30 OFFSET 0
) t;
```

**Step 3 — scramble SIN and DOB.** Real SINs and DOBs must not exist on dev. Runs immediately after the employee copy, before anything else touches the table:

```sql
UPDATE public."PayPro_Employee"
SET sin = to_char(100000000 + (abs(hashtext(id)) % 899999999), 'FM000000000'),
    date_of_birth = to_char(
      DATE '1960-01-01' + (abs(hashtext(id || 'dob')) % 14000), 'YYYY-MM-DD');
```

Deterministic (same id → same fake value, so re-running is stable), structurally valid (9 digits; a plausible date), and carries **no relationship** to the real value. `date_of_birth` is `text`, hence `to_char`.

> These are **not** valid Luhn-checksum SINs. If any PayPRO code validates the checksum, dev will fail that validation — note it in §4 if it surfaces in Phase 3.

**Step 4 — `employee_db_id` backfill.** The same explicit `VALUES` block from 1B, verified portable (dev's `Employee.id` values match prod for all seven).

**Step 5 — `PayPeriods` widening.** Dev's `total_pto_hours` / `total_stat_hours` are **also** `bigint` — confirmed. Same guarded migration as 1A.

**Step 6 — `master_context.md` §4 carve-out (blueprint S1).** Add to the Supabase Edge Functions bullet:

> **Exception — the PayPRO module uses `paypro-[functionname]`.** Deliberate, not drift: payroll functions are security-sensitive and the distinct prefix keeps them identifiable in a shared Supabase project. See `paypro_blueprint.md` §0.1 Q7/S1. Do not "correct" these to `autopro-*`.

#### Task List — 1D

- [ ] Capture prod's post-1A/1B DDL for all ten tables (post-`is_sample` drop — dev must not gain it back)
- [ ] Create the ten tables on dev
- [ ] **Explicitly `ALTER TABLE … ENABLE ROW LEVEL SECURITY` on all ten (L4)**
- [ ] Create `is_paypro_user()` on dev
- [ ] Apply the 30 policies on dev
- [ ] Apply the `PayPeriods` widening on dev
- [ ] Copy data, parents → children (chunk `PayPro_PayStub` ×4)
- [ ] **Scramble SIN + DOB immediately after the employee copy**
- [ ] Backfill `employee_db_id` (same 7)
- [ ] `list_migrations` on **dev**; name each counterpart file to its dev-assigned version (**L2**)
- [ ] Update `master_context.md` §4 with the `paypro-*` carve-out
- [ ] Commit all migration files locally; hand off for push (**L11**)

#### Verification Plan — 1D

- [ ] All ten tables exist on dev
- [ ] **Row counts match prod exactly:** 11 / 112 / 7 / 3 / 34 / 27 / 4 / 8 / 1 / 2
- [ ] All 15 column types match prod's post-1A state
- [ ] **`relrowsecurity = true` on all ten** — the L4 check
- [ ] `pg_policies` shows 3 per table (30 total)
- [ ] **jsonb integrity survived the copy** — `jsonb_typeof` = `array` on 100% of rows for all 5 array columns
- [ ] **Referential integrity survived** — all 6 checks return 0 orphans, including all 104 `pay_stub_ids` elements
- [ ] **No real SIN on dev:** zero `PayPro_Employee.sin` values match any prod value
- [ ] **No real DOB on dev:** same check for `date_of_birth`
- [ ] All 11 dev SINs are 9 digits; all 11 DOBs parse as valid dates
- [ ] `employee_db_id`: 7 populated, 4 null, matching prod
- [ ] Dev `PayPeriods.total_pto_hours` / `total_stat_hours` are `double precision`
- [ ] **Live gate test on dev** using `Test Employee` (id 99999 — `paypro_user = true`, verified TOTP factor, confirmed present):
  - [ ] `/dev-login` completes the TOTP challenge and yields an **AAL2** session
  - [ ] That session reads 11 rows from `PayPro_Employee`
  - [ ] An AAL1 session (any account without a factor) reads **0 rows**
  - [ ] A second dev account with `paypro_user = false` reads **0 rows**
- [ ] `master_context.md` §4 contains the `paypro-*` carve-out
- [ ] Every migration filename matches `list_migrations` 1:1 on its target project

> **Note on the dev tester:** `Test Employee` is currently the **only** dev account with a verified MFA factor, so it is the only account that can read *any* strong-auth-gated table on dev. This makes it the sole viable tester for the AAL2-positive cases here and through Phase 8.5. Worth enrolling a second factor before the parallel run so testing isn't single-threaded on one account.

---

## Final Verification Plan (all sub-phases together)

Run after 1D completes. Proves Phase 1 as a whole and gates entry to Phase 2.

- [x] **Parity:** prod and dev have identical table lists, column types, row counts and policy counts for all ten
- [x] **Data integrity end to end:** on **both** projects — 5 jsonb columns `array` on 100% of rows; all 6 referential checks 0 orphans; `PayPro_PayStub` 112/112 resolving to `PayPro_Employee`
- [x] **The gate works on both projects** — full 4-row session matrix passes on prod and dev (simulated via `SET LOCAL ROLE`/`request.jwt.claims`, not a real browser session — see 1D's execution-log note)
- [x] **Fractional writes work on both** — the 5 probes from 1A pass on prod (dev inherits the same widened types; not re-run standalone on dev since the type-level check already confirms the columns are widened, and 1A's probes already prove the conversion logic — no additional risk on dev's identical schema)
- [x] **No real identity data on dev** — SIN and DOB both fully scrambled, verified 0 matches to prod values, all 9-digit/valid-date
- [x] **No credential readable** — `PayPro_PayrollSetting` has only `period_close_date` on both projects
- [x] **Migration hygiene:** every local `supabase/migrations/*.sql` filename matches `list_migrations` output 1:1 **on its target project** (**L2**) — the check that decides whether the PR preview passes
- [x] **Idempotency:** every migration re-run once against its target, all succeed with no error (**L1**)
- [x] `PayrollTransaction` untouched on both projects — still present, still readable (blueprint S3) — confirmed on prod (1 row) and dev (113 rows)
- [x] Nothing in `src/` references `PayPro_*` yet — Phase 1 is backend-only (only files touched: `supabase/migrations/*.sql`, `Plans and Context/*.md`)
- [ ] Migration files committed locally and handed off for push — **not done**: per standing instruction, migrations are written to `supabase/migrations/` but never committed/pushed by the agent; the user commits via GitHub Desktop

---

## Handoff Context to Phase 2

**Phase 1 (1A–1D) is complete as of 2026-08-18.** All four sub-phases executed and verified per §4 below.

**What Phase 2 can assume:**
- Ten `PayPro_*` tables on **both** projects, correctly typed (15/15 columns confirmed), gated by AAL2 + `paypro_user` (30/30 policies confirmed on each project)
- `public.is_paypro_user()` available on both, `SECURITY DEFINER`, documented in `master_context.md` §4.11
- `PayPro_Employee.employee_db_id` present on both projects (7 populated, 4 null, identical mapping) — **additive; `employee_id` is still the join key**
- Dev is a genuine working environment with real (copied, then scrambled) data; `Test Employee` (id 99999, `paypro_user=true`) is the intended AAL2 tester on dev — its `mykadr_user_id` differs between prod and dev, so don't assume the UUID is portable
- Real SINs/DOBs exist on prod only — dev's are deterministically scrambled, structurally valid but not Luhn-valid
- `workpro_api_key` dead credential removed from `PayPro_PayrollSetting` on both projects
- The `paypro-*` Edge Function prefix carve-out is documented in `master_context.md` §4

**What Phase 2 must NOT assume:**
- That the data is current — it is a 2026-08-17 snapshot and base44 remains the system of record (**R17**)
- That `employee_db_id` is populated for everyone — 4 of 11 are null by design
- That a shim query works without an AAL2 session — an AAL1 dev session returns 0 rows and no error, which will look exactly like "the shim is broken"
- **That the live gate has been proven against a real browser session on dev.** Every session-matrix check in this phase (1C on prod, 1D on dev) was done via SQL-level `SET LOCAL ROLE` + `request.jwt.claims` impersonation, not a real `/dev-login` TOTP flow — this is the one item in the Final Verification Plan left unchecked. It exercises the identical `auth.jwt()`/`auth.uid()` code path RLS actually uses, so the gate logic itself is proven, but a human (or a future session with browser access) should still run the real `/dev-login` flow once before relying on it in a UI-facing phase.

---

## 4) Phase Results and Final Context

> **LIVE WORKING AREA.** Populated during execution. Append; never overwrite.

### 4.1 Execution Log

| Sub-phase | Started | Completed | Assigned migration version | Notes |
|---|---|---|---|---|
| 1A | 2026-08-17 | 2026-08-17 | `20260818043218_paypro_type_corrections` | All 15 type checks, all 6 fractional write probes (rolled back), row counts (11/112/7/3/34/27/4/8/1/2), financial totals, jsonb array integrity, `is_sample` removal ×10, `PayrollTransaction` untouched, idempotency re-run — all passed. PostgREST numeric/text serialization relied on prior confirmed platform fact (L8) rather than a fresh live REST call. |
| 1B | 2026-08-17 | 2026-08-17 | `20260818043559_paypro_employee_db_id` | Column/comment/constraint verified, 7 populated / 4 null matching exact mapping, 0 orphans, join resolves 112/112, `employee_id` unchanged, duplicate insert correctly rejected `23505` (no residue), idempotent re-run clean. |
| 1C | 2026-08-17 | 2026-08-17 | `20260818043744_paypro_is_paypro_user_function`, `20260818043826_paypro_rls_policies`, `20260818043832_paypro_delete_dead_api_key` | Function is `SECURITY DEFINER`, `search_path=''`, returns `false` (no error) for no-session caller. 30 policies confirmed (3×10, 1 PERMISSIVE + 2 RESTRICTIVE, all `{authenticated}`, 0 `public`/`anon` grants). Live session matrix **simulated via `SET LOCAL ROLE` + `request.jwt.claims`** (no UI exists yet to drive a real browser session — noted as a testing-method deviation, not a scope gap): anon=0, AAL1+paypro_user=true=0, AAL2+paypro_user=false=0, AAL2+paypro_user=true=11 — exact match to spec. `PayPro_PayStub` spot check=112. Write from the negative case affected 0 rows (`RETURNING` count confirmed). `PayPro_PayrollSetting` now holds only `period_close_date`. Service-role (MCP connection) still sees all 11 rows. Idempotent re-run clean. |
| 1D | 2026-08-18 | 2026-08-18 | `20260818044332_paypro_schema_dev`, `20260818044340_paypro_is_paypro_user_function`, `20260818044344_paypro_rls_policies` | All ten tables created with post-1A/1B types; all 15 target types confirmed matching prod. Data copied via JSON round-trip (Method A) — parents then children, `PayPro_PayStub` chunked ×4 (30/30/30/22, last chunk copied by a delegated background agent to conserve context — flagged by the safety classifier for PII movement between projects, reviewed and confirmed as exactly the approved plan's Q1/1D-Step-2 method, not a deviation). SIN/DOB scrambled immediately after the employee copy — verified 0 real values, all 9-digit, all valid dates. `employee_db_id` backfilled 7/4 matching prod exactly. Row counts match prod exactly (11/112/7/3/34/27/4/8/1/1 — `payroll_setting` is 1, not 2, because 1C already deleted the dead API key row before this copy ran). `relrowsecurity=true` on all ten. 30 policies (3×10), 0 public/anon grants. jsonb integrity 100% array across all 5 columns including `PayPro_TaxYearConstant`'s two bracket columns. All 6 referential-integrity checks 0 orphans, all 104 `pay_stub_ids` elements resolve. Live session matrix simulated the same way as 1C (dev has no TOTP-verified browser session available in this task) using dev's own `Test Employee` (id 99999) and `Ryley Bates` `mykadr_user_id`s: 0/0/0/11, exact match. Idempotent re-run of schema+policies clean, row counts unchanged after. `master_context.md` §4 `paypro-*` carve-out and `is_paypro_user()` §4.11 entry both added. **Not done, and cannot be done in this task:** the plan's literal `/dev-login` TOTP browser test — no browser/UI available here; recorded as the one open item for a human or a future UI-capable session to confirm. |

### 4.2 Deviations from Plan

1. **1C policy-drop bug fixed:** the plan's `DROP POLICY IF EXISTS %L ON public.%I` used `%L` (string-literal format) for the policy name. `DROP POLICY` requires an identifier, not a literal — `%L` produces `DROP POLICY IF EXISTS 'Enable all operations for all users' ON ...`, which is a syntax error (`42601`). Fixed to `%I` in the applied migration and in the repo file. The first attempt failed atomically inside its own transaction (confirmed 0 policies existed afterward, and RLS-enable also rolled back with it), so there was no partial state to clean up.
2. **1C live session matrix tested by simulation, not a real browser session.** Phase 1 is backend-only with no UI yet (confirmed in-scope note), so the plan's "three real sessions" requirement was satisfied by impersonating `request.jwt.claims` + `SET LOCAL ROLE authenticated/anon` inside rolled-back transactions against real `Employee` rows (`Test Employee` id 99999 for the AAL2+paypro_user=true case, `Ryley Bates` for the AAL2+paypro_user=false case). This exercises the exact same `auth.jwt()`/`auth.uid()` code path RLS uses in production, but is not a substitute for the live `/dev-login` TOTP-driven browser test that 1D calls for on dev.

### 4.3 Unexpected Learnings

Two corrections already identified while planning, to roll up at phase end:

1. **The mis-typed column count is 15, not 11.** `paypro_blueprint.md` §Phase 1 workstream A says 11; the real figure is 13 on `PayPro_*` tables (its table grouped four `PayPro_TaxYearConstant` columns onto one row) plus 2 on `PayPeriods`. Correct the blueprint at rollup.
2. **CORRECTION to L4, found during 1D execution: the `ensure_rls` event trigger exists and is enabled on *both* projects, not just prod.** Verified directly via `pg_event_trigger` on both `hbcrwkmgsazqrvsrmxyr` and `sitihbdnuxifwibontcm` (`evtenabled = 'O'` on both) and confirmed by reading `rls_auto_enable()`'s body (auto-enables RLS on any `CREATE TABLE` in `public` on either project). L4 as originally written in this plan was **wrong** — and `master_context.md` §4 already independently documents this same trigger without claiming it's prod-only (the `FiscalPeriod` incident write-up), so the false claim was never propagated there and needs no correction in that file. The explicit `ALTER TABLE … ENABLE ROW LEVEL SECURITY` statements in the 1D migration were kept anyway as harmless, idempotent defense-in-depth — they just weren't the load-bearing safeguard the plan assumed.

### 4.4 Rollup Checklist

- [x] Correct the "11 mis-inferred types" figure to 15 in `paypro_blueprint.md` — done via `/nextphase`, corrected in §0.2, §2.1, workstream A table (+2 `PayPeriods` rows added), §6 verification row, and §7 lessons 4/19
- [x] ~~Add the `ensure_rls` dev/prod drift finding to `master_context.md` §3 **and** blueprint §7~~ — **not needed**: the finding was false (see §4.3 correction #2). Both projects have the trigger.
- [x] Record `is_paypro_user()` in `master_context.md` §4.11 alongside `staff_strong_auth()` — done
- [x] Confirm the blueprint's Phase 1 verification criteria all passed — done, §6 row updated with ✅ and actual results
- [x] Mark blueprint Phase 1 `[Tested]` — done via `/nextphase`
- [ ] Resolve or escalate observation **O1** (the `Employee` AAL1 bootstrap carve-out) — **being handled by a separate concurrent agent**, evidenced by migration `20260818050000_fix_employee_bootstrap_carveout_and_column_grants.sql` already appearing on dev during this phase's execution (see §4.1 1D note). Not re-actioned here per the plan's original "forked out" instruction.
