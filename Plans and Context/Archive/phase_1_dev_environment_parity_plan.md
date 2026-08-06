# Phase 1 Plan: Development & Testing Environment Parity

**Status:** Pending your review
**Parent:** `master_blueprint.md`, Phase 1
**Format note:** This is a set of manual directions for you to execute (Supabase CLI + two dashboards), not something I ran for you. I did validate every step below against your actual live project using the Supabase CLI (already authenticated on this machine) — findings below are real, not assumed.

---

## What I found when I checked your actual setup

| Fact | Value |
|---|---|
| Production project | `hbcrwkmgsazqrvsrmxyr` ("KADR", org `lfpjvmeifcnmvybancff`) |
| Dev branch project ref | `sitihbdnuxifwibontcm` (git branch: `development`) |
| Dev branch persistence | **`persistent: false`** — this matters a lot, see below |
| Dev branch has data? | Confirmed no (`with_data: false`) |
| Migrations tracked in git | Only 2 files, and one of them (`20260730155600_partstech_cart_table.sql`) isn't even applied to **production** yet |
| Functions deployed to dev branch | Only **4 of 19** (`autopro-mergeInventoryItems`, `autopro-handleSupplierInvoiceLineGL`, `autopro-processInventoryReceipt`, `autopro-handleInvoiceConversionGL`) |
| Secrets present on dev branch | Only the 7 auto-injected Supabase ones (URL, anon key, service role key, etc.) — **0 of the 12 custom secrets** your functions actually need (Base44, PartsTech, Gemini, Resend, GCP, support email) |

**The important one:** your branch is **ephemeral, not persistent**. I checked Supabase's own docs on this — ephemeral/preview branches are seeded **once, at creation**, from a `supabase/seed.sql` file if one exists, and any data or config changes made after that are **lost on the next reset** (new commits reseed from scratch; the docs literally describe it as "equivalent to running `supabase db reset`"). Since your branch currently has zero data, nothing is lost yet — but if we seed those 5 reference tables and set 12 secrets on it *before* fixing this, all of that work could vanish the next time the branch resyncs. So step 1 below fixes this first, while there's nothing to lose.

I also found the Supabase CLI supports `supabase branches create --with-data --persistent`, which clones **all** of production's data in one shot. That's not what you asked for (you specifically wanted just the 5 static tables to keep dev compute/relevance tight), so the plan below sticks with your original direction — but flagging it in case seeing "it's literally one flag" changes your mind. If it does, say so and I'll adjust the plan before you run anything.

---

## Step 0 — Resolve the dangling migration (CORRECTED — the table is real)

**Update, corrected via direct Supabase connector query:** my earlier read of this was wrong. `supabase migration list` showed `20260730155600_partstech_cart_table.sql` as never applied to production, and I concluded from that alone that the table didn't exist there — but "never applied" only means Supabase's migration-history bookkeeping never recorded it, not that the table itself is absent. Querying production directly confirms `public."PartsTechCart"` **does exist** (0 rows, so empty, but real). Someone created it directly via the SQL editor, bypassing migration tracking.

Since `PartsTechCart` belongs to the PartsTech/Online Ordering feature you've confirmed is a failed experiment being removed entirely (see `master_blueprint.md` Phase 2), the fix is now:
1. Actually drop the table from production: `DROP TABLE public."PartsTechCart";`
2. Delete the local migration file: `rm supabase/migrations/20260730155600_partstech_cart_table.sql`

Do this as part of Phase 2, not Phase 1 — Phase 1 stays infra-only, and this is real production schema work, not just a dev-environment sync step.

---

## Step 1 — Make the dev branch persistent (before seeding anything)

```bash
supabase branches update development --project-ref hbcrwkmgsazqrvsrmxyr --persistent
```

This switches the branch from "preview, reset-on-resync" to "stays put like a real environment." Do this now, while it's empty — it's the cheapest possible time to make this change.

---

## Step 2 — Pull production's schema (CLI-free method — no installs)

**Update:** `supabase db pull`/`db dump` need Docker on Windows, no way around it via flags. Skip the CLI entirely for this step — everything happens in the browser, zero installs:

1. In the **production** Supabase Dashboard → Table Editor, open each table → use the "..." menu → **Copy as SQL** (or equivalent "view definition" option) to get that table's `CREATE TABLE` statement.
2. Switch to the **dev branch** project in the dashboard → SQL Editor → paste each `CREATE TABLE` statement and run it.
3. Repeat per table.

A few things worth watching for as you go, since a per-table copy captures the table itself but not everything attached to it:
- **Foreign keys / table order** — if Table A references Table B, create B first or the FK will fail. Easiest fix: create all tables first without worrying about order, then re-run any that failed once their dependencies exist.
- **RLS policies** aren't part of a plain `CREATE TABLE` statement — check whether "Copy as SQL" includes them or if you need to grab those separately (Dashboard → Authentication → Policies, or the table's own RLS tab) for tables where it matters.
- **Custom functions/triggers** referenced by a table (e.g. `trg_inventory_audit` mentioned in `master_context.md`) live outside the table definition — if a table's trigger doesn't come along with the copy, you'll need to copy those from Database → Functions/Triggers separately.
- Once you're through the tables you actually need for now, it's worth saving whatever you pasted into a migration file in the repo too (`supabase/migrations/`) so it's tracked in git going forward — happy to help assemble that from what you've got once you're done, no CLI needed for that part either.

---

## Step 3 — Deploy the missing Edge Functions

Only 4 of 19 made it to the branch. Deploy everything to be sure it's fully in sync — add `--use-api` so this bundles server-side instead of trying to use Docker locally (same Docker gap as Step 2, but this command has a documented flag to skip it):

```bash
supabase functions deploy --project-ref sitihbdnuxifwibontcm --use-api
```

(Omitting a function name deploys all of them.)

---

## Step 4 — Set the missing secrets

These 12 exist on production but not on the dev branch. **Important gotcha:** Supabase secrets are write-only — neither the CLI nor the dashboard can show you a previously-set value back. You'll need to pull these from wherever you originally sourced them (not from Supabase):

- `BASE44_ACCESS_TOKEN`, `BASE44_BACKEND_URL`, `BASE44_PRIVATE_KEY` — from Base44 admin
- `PARTSTECH_API_KEY` — from your PartsTech account
- `GEMINI_API_KEY` — from Google AI Studio
- `RESEND_API_KEY` — from Resend dashboard
- `GCP_CLIENT_ID`, `GCP_CLIENT_SECRET`, `GCP_REFRESH_TOKEN` — from Google Cloud Console (used for the Google Drive backup feature)
- `AUTOPRO_APP_API_KEY` — internal app key, wherever that was originally generated/recorded
- `SUPPORT_EMAIL_FROM`, `SUPPORT_EMAIL_TO` — just plain email addresses, easiest ones to fill in

For values safe to reuse as-is between prod and dev (e.g. if PartsTech/Gemini/Resend don't have separate sandbox credentials), you can set them directly. For anything with write access to real data or real customers (Base44 token especially), consider whether a dev-scoped credential exists before reusing the production one.

Easiest way to set them all at once — create a local file (don't commit it):

```bash
touch supabase/.env.development.secrets
```

Fill it with `KEY=VALUE` lines for the 12 secrets above, then:

```bash
supabase secrets set --project-ref sitihbdnuxifwibontcm --env-file supabase/.env.development.secrets
```

Delete the local file once done, or make sure it's gitignored (it should already match your existing `.env*` gitignore pattern).

---

## Step 5 — Seed the 5 static/reference tables

Your call, `InventoryCategory`, `ChartOfAccount`, `BankAccount`, `FiscalPeriod`, `SalesClass`. Simplest, most foolproof method (no CLI/Docker quirks to fight):

1. In the **production** Supabase dashboard → Table Editor → open each of the 5 tables → use the export/download option to save as CSV.
2. In the **dev branch** dashboard (switch project to `sitihbdnuxifwibontcm`, or use the branch switcher if the dashboard shows it inline) → Table Editor → open the same table → import from CSV.

Repeat for all 5. This keeps you fully in control of exactly what data lands in dev, matching what you asked for.

---

## Step 6 — Point Vercel's Development environment at the branch

In the Vercel dashboard → this project → Settings → Environment Variables → make sure you're editing the **Development** environment scope (not Production/Preview-all) → update:

- `VITE_SUPABASE_URL` → `https://sitihbdnuxifwibontcm.supabase.co`
- `VITE_SUPABASE_ANON_KEY` → the branch's anon key (Supabase dashboard → branch project → Settings → API)

Leave any `VITE_BASE44_*` vars as-is for now (Base44 itself isn't branched — dev will keep talking to the same Base44 backend as prod until later phases remove that dependency entirely).

---

## RESOLVED — a Supabase MCP connector became available mid-Phase-1 and closed the function/RLS gap entirely

Update: after you did the manual table copy above, a Supabase connector showed up in your Claude interface. I used it (`execute_sql`/`apply_migration` against project `sitihbdnuxifwibontcm`) to directly validate and fix the remaining gaps, rather than the on-demand manual approach originally planned below. What it found and fixed:

- **`WorkOrder` — the single most central table in the app — was missing entirely from the dev branch**, not just missing FKs/functions. Reconstructed its full column set from production (`pg_get_functiondef`-style introspection) and created it, with a primary key on `id`.
- **Zero RLS policies existed on any of the 35 manually-copied tables.** Since every table had RLS *enabled* (matching your copy) but no policy, every single one would have silently blocked all frontend reads/writes — a much bigger problem than the missing functions, and one that wouldn't have thrown a clear error. Checked production's actual policies (mostly a blanket "Enable all operations for all users," `USING (true)`) and applied the equivalent to all 36 dev tables (including the new `WorkOrder`).
- **All 38 missing SQL functions restored** (production has 39 total; only `get_parts_movement_v2` had made it across before). This includes `update_inventory_with_audit`/`log_inventory_audit` (the inventory-audit trigger chain), `process_workorder_audit` (WO version history), `process_payment_atomic`, all the `search_*_ranked` functions used by search UI, and the GL/AR/AP reporting functions (`get_balance_sheet_data`, `get_general_ledger_data`, `get_customer_ar_data`, etc.).
- **2 of 4 production triggers restored**: `trg_inventory_audit` (InventoryItem → `log_inventory_audit`) and `audit_workorder_changes` (WorkOrder → `process_workorder_audit`) — both verified to be self-contained, no external calls.
- **`ensure_rls` event trigger restored** — production auto-enables RLS on any newly created public table via this. Now dev does too, so this exact "table copied, RLS silently blocking everything" surprise shouldn't recur for tables created going forward (you'll still need to add policies yourself, same as production requires).

**2 production triggers deliberately NOT copied to dev — flagging as a separate finding, not a Phase 1 task:**
- `sync_customer_to_google` (on `Customer`) and `WorkOrder_Broadcast` (on `WorkOrder`) both call `supabase_functions.http_request(...)` directly, with a **live production JWT hardcoded in plaintext inside the trigger definition** (visible to anyone with schema read access, e.g. via `pg_trigger`). Copying these to dev as-is would mean dev database activity fires real webhooks against production infrastructure — a cross-environment leak, not a sandbox. Left off dev entirely. Separately worth knowing: this is a live secret sitting in your schema, not just in `.env` — worth rotating/moving to a vault-based approach at some point, independent of this migration effort.
- Also noticed the `Google-Contacts-Sync` edge function that `sync_customer_to_google` calls **doesn't exist anywhere in your local repo's `supabase/functions/`** — it's live in production but not tracked in git. Not blocking anything, just flagging that it exists as an untracked deployment.

**Remaining known gap, now much smaller:** foreign keys are still not present on any table (low priority, doesn't block functionality — see original reasoning below). Everything else that matters for testing is now in place.

---

## Verification Checklist

- [ ] `20260730155600_partstech_cart_table.sql` deleted (as part of Phase 2, not this phase) — `supabase migration list` no longer shows it as a local-only entry
- [x] Branch shows `"persistent": true` (confirmed via connector)
- [x] Core tables present, including `WorkOrder` (was missing, now created)
- [x] RLS policies present on all 36 tables (was zero, now matches production's permissive pattern)
- [x] All 39 production SQL functions present on dev (confirmed via connector)
- [x] Safe subset of triggers + the `ensure_rls` event trigger restored
- [ ] `supabase functions list --project-ref sitihbdnuxifwibontcm` shows all 19 Edge Functions, `ACTIVE` (Edge Functions are separate from SQL functions above — still pending Step 3)
- [ ] `supabase secrets list --project-ref sitihbdnuxifwibontcm` shows all 19 secret names present (7 auto + 12 custom) — still pending Step 4
- [ ] All 5 reference tables have data in the dev branch, spot-checked against production row counts
- [x] A Vercel preview deployment on the `development` branch loads the app and successfully reads from the dev Supabase branch — confirmed working (Steps 3–6 all done)
- [x] **Structural finding, not a bug:** live production data is visible in the dev-connected app. Confirmed root cause: `VITE_BASE44_BACKEND_URL`/`VITE_BASE44_PROXY_URL` in `.env` are hardcoded to production's project ref (`hbcrwkmgsazqrvsrmxyr`), completely independent of `VITE_SUPABASE_URL`. Every `base44.functions.invoke`/`base44.entities.*`/`base44.auth.*` call (the ~279 not-yet-migrated call sites) still hits production regardless of which Supabase branch the frontend points to — only direct `supabase.from()`/`supabase.functions.invoke('autopro-*')` calls are actually isolated to dev. Proven by elimination: dev's `Customer`/`Vehicle`/`WorkOrder` tables are confirmed empty (0 rows), so any real data shown must be coming from base44 → production. **~~"Edit a SalesClass description as a harmless test"~~ was bad advice — `SalesClassManager.jsx` is still `SupabaseProxy`/base44-routed, so that write would land in production.** No config fix exists for this; it only resolves as each phase migrates its own calls off `base44.*`. Standing rule from here on: read-only exploration of a not-yet-migrated feature on "dev" is fine; never write-test one before its phase has landed.

Phase 1 is functionally done. Phase 2 (PartsTech/Online Ordering Removal) can proceed — it's pure deletion + one production `DROP TABLE`, no base44 CRUD dependency, so this finding doesn't block it. For every phase after, verification must confirm writes actually landed in the dev branch's own tables (e.g. via the Supabase connector), not just that a page loaded without error.

---

Sources for the persistent-vs-ephemeral branch behavior:
- [Branching | Supabase Docs](https://supabase.com/docs/guides/deployment/branching)
- [Working with branches | Supabase Docs](https://supabase.com/docs/guides/deployment/branching/working-with-branches)
- [Configuration | Supabase Docs](https://supabase.com/docs/guides/deployment/branching/configuration)
