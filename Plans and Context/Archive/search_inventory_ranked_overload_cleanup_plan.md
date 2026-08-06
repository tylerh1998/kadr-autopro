# Implementation Plan: Drop the Stale 6-Param `search_inventory_ranked` Overload

**Status:** COMPLETE — both phases executed and verified 2026-08-03. Stale 6-param overload dropped from both dev (`sitihbdnuxifwibontcm`) and production (`hbcrwkmgsazqrvsrmxyr`); exactly one (8-param) overload remains on each; repo `.sql` file synced to match live reality.
**Parent:** Flagged as an out-of-scope cleanup item in `phase_13_implementation_plan.md` §0.9 (the `search_inventory_ranked` overload-ambiguity bug found while live-testing 13C against `test.kensauto.ca`).
**Prepared:** 2026-08-03

---

## 1) Context & Lessons Learned

**Core goal:** `search_inventory_ranked` exists as **two overloaded Postgres functions** on both the dev branch (`sitihbdnuxifwibontcm`) and production (`hbcrwkmgsazqrvsrmxyr`) — a 6-param version (no location filter, Phase 7B-era) and an 8-param version (`p_location_from`/`p_location_to` added, later iteration). This plan's job is narrow: **drop the stale 6-param overload on both environments**, dev-first, so the ambiguity landmine can't bite the next caller who copies an old "just pass search term and limit" example.

**How we got here:**
- Phase 7B originally created the 6-param `search_inventory_ranked` and wired it into `LegacyWarrantyReturnModal.jsx`.
- A later iteration (exact origin not tracked in a named migration — see risk below) added the 8-param version with location-range filtering, adopted by `InventoryList.jsx` (Phase 7C close-out) and `GetPartModal.jsx` (Phase 13C).
- Phase 13C's live UI test against `test.kensauto.ca` hit `PGRST203 "Could not choose the best candidate function"` in `GetPartModal.jsx` — PostgREST couldn't resolve which overload to call from `{ p_search_term, p_limit }` alone. Worked around **in application code** by passing `p_location_from: null, p_location_to: null` explicitly on both `GetPartModal.jsx` call sites — the workaround is live and working, but the underlying ambiguity (two overloads, both `EXECUTE`-granted to `anon`/`authenticated`) still exists in the database and will bite the next caller who doesn't know to do this.
- **This plan removes the root cause** (the stale overload itself) rather than leaving the app-code workaround as the only defense.

**Confirmed directly against both live databases this session (not assumed from repo source):**
- Both overloads exist, byte-identical in shape, on **both** dev (`sitihbdnuxifwibontcm`, oids `18702`/`18704`) and production (`hbcrwkmgsazqrvsrmxyr`, oids `32293`/`40137`).
- Both overloads on both projects grant `EXECUTE` to `PUBLIC`, `anon`, `authenticated`, `postgres`, and `service_role` — dropping the 6-param one is a pure removal, no grant work needed on what remains.
- **Every current real caller already targets the 8-param signature**, confirmed by reading the actual call sites, not just trusting the plan doc that flagged this:
  - `src/components/work-orders/GetPartModal.jsx` — 2 call sites (lines ~74, ~119), both pass `p_location_from`/`p_location_to` explicitly as `null`.
  - `src/pages/InventoryList.jsx` — 1 call site (line ~105), passes `p_location_from`/`p_location_to` from user input or `null`.
  - `src/components/inventory/LegacyWarrantyReturnModal.jsx` — 1 call site (line ~108), passes `p_location_from`/`p_location_to` as `''`.
- A repo-wide grep for `search_inventory_ranked` found **zero other callers** — no Edge Function, no other Postgres function/trigger, no other frontend file. `FindPartModal.jsx` (also work-orders scope) calls a different RPC (`search_work_order_parts`), not this one.
- Direct `pg_proc.prosrc` search across `public` confirms **no other Postgres function calls `search_inventory_ranked` internally** — safe to drop with a plain `DROP FUNCTION`, no cascade risk to other DB objects.

**Real discrepancy found while researching (not the main scope, but adjacent and worth fixing while touching this):** the checked-in `src/supabase/search_inventory_ranked.sql` has **9 parameters**, including a `p_include_inactive boolean` that **does not exist on either deployed overload** (confirmed via `pg_get_functiondef()` on both projects — the live 8-param version has no such parameter). This exact discrepancy was already flagged once during Phase 7 close-out (`master_blueprint.md` lessons-learned: "a `.sql` file checked into the repo is not proof of what's actually deployed"). Left un-fixed, the next person who reads this file will assume `p_include_inactive` is a real, callable parameter — it isn't. **Proposed fix, folded into Phase 1 below since it's a zero-risk repo-only edit:** overwrite `src/supabase/search_inventory_ranked.sql` with the actual live 8-param definition, so the checked-in source finally matches reality. Tell me if you'd rather I leave this file alone and scope this plan to the database change only.

**Standing rules this plan must respect:**
- Dev-branch first, verified, then production — the project's standing migration pattern (every prior phase).
- I do not commit or push git changes automatically — you do that via GitHub Desktop. (Only relevant here for the optional `.sql` file sync above.)
- Database DDL goes through `apply_migration` (tracked), not raw `execute_sql`, per the Supabase MCP server's own guidance.
- New Edge Functions in this project are named `autopro-*` — **not applicable here**, this plan adds no Edge Function, only drops a Postgres function overload.

**One structural oddity noted, not blocking:** the dev branch (`sitihbdnuxifwibontcm`) shows `status: MIGRATIONS_FAILED` in `list_branches` — this reflects git-tracked-migration drift (most of the branch's actual schema was applied directly via the Supabase connector rather than tracked migration files, a known, already-documented condition from Phase 1 onward), **not** a broken database. `apply_migration` calls have continued to land successfully on this branch throughout Phase 13 (most recently `20260803141849_phase13d_approvals_policy_and_portal_email_log_tables`), so this plan's migration is expected to apply the same way. Flagged for awareness only.

---

## 2) Previously Completed

- **Phase 7B:** Created the original 6-param `search_inventory_ranked` RPC; wired into `LegacyWarrantyReturnModal.jsx`'s part search. `EXECUTE` grants to `anon`/`authenticated`/`PUBLIC` confirmed before that swap.
- **Phase 7C close-out:** `InventoryList.jsx` migrated onto `search_inventory_ranked` (by then the 8-param version, with location-range filtering) as part of its own full Base44 migration; discovered and deliberately did not carry forward a pre-existing 200-row result cap bug from the old Base44 function.
- **Phase 13C:** `GetPartModal.jsx`'s two `searchInventory` call sites converted to `supabase.rpc('search_inventory_ranked', ...)`. Hit and fixed the `PGRST203` ambiguity at the application-code layer (explicit `p_location_from: null, p_location_to: null`), confirmed working via live authenticated `fetch()` against `test.kensauto.ca`. Flagged the underlying two-overload situation as out-of-scope cleanup — this plan.
- **This session (planning only):** Confirmed live overload shapes, grants, and caller set on both dev and production via direct SQL introspection; confirmed zero other dependents; found and flagged the unrelated `p_include_inactive` repo/live drift.

---

## 3) Risk Assessment

| Risk | Impact | Likelihood | Mitigation |
|---|---|---|---|
| Dropping the wrong overload (accidentally drop the 8-param one, breaking every real caller) | High — would 500 every inventory search app-wide (`InventoryList.jsx`, `GetPartModal.jsx`, `LegacyWarrantyReturnModal.jsx`) | Low | `DROP FUNCTION` will target the 6-param signature explicitly by full parameter list (`p_search_term text, p_filter text, p_sort_by text, p_sort_direction text, p_limit integer, p_offset integer`), not by name alone — Postgres requires (and this plan uses) the exact signature, eliminating ambiguity in the drop statement itself. Confirm resulting `pg_proc` state immediately after each drop, before moving to the next environment. |
| An untracked caller of the 6-param overload exists that this session's grep/`pg_proc` scan missed (e.g. a saved Postgres view, a report, or a manually-run ad hoc script outside version control) | Medium — that caller would start failing after the drop | Low | Already checked: no other Postgres function/trigger source references `search_inventory_ranked` (`pg_proc.prosrc` scan on production), and a full repo-wide grep found only the 3 confirmed frontend call sites, all already on the 8-param signature. Residual risk is limited to something entirely outside the repo and the database itself (e.g. an external script), which is out of this plan's visibility — acceptable given the standing dev-first-then-verify pattern. |
| Dropping on production before dev is fully verified skips the project's standing safety gate | Medium — a bad drop would be live immediately | Low (mitigated by design) | Plan is explicitly two sequential phases: dev drop + verify first, production drop only after Phase 1 passes. No production DDL happens in the same step as the dev DDL. |
| `apply_migration` fails on the dev branch due to its `MIGRATIONS_FAILED` git-sync status | Low — would just block progress, not corrupt anything | Low | Every Phase 13 migration this same session (most recently `phase13d_approvals_policy_and_portal_email_log_tables`) applied cleanly on this branch despite the same status — the status reflects file-tracking drift, not a broken connector path. If a migration does fail, stop and diagnose rather than retrying blindly. |
| Overwriting `src/supabase/search_inventory_ranked.sql` (the optional adjacent fix) introduces a typo or loses the actual live logic | Low — repo-only file, zero runtime effect until someone re-deploys from it | Low | Content will be copied verbatim from `pg_get_functiondef()`'s live output (already captured this session), not hand-retyped. |
| Dev branch has only 1 `InventoryItem` row (vs. production's 4,441) | Low — doesn't risk data, but limits how meaningful a dev-branch UI search test can be | High (already true today) | Dev-branch verification for this plan is a **function-resolution smoke test** (does the call succeed without `PGRST203`/`42883`, not "does search ranking look right"). Meaningful behavioral verification of search correctness already happened in Phase 7C/13C against real data; this plan only needs to prove the ambiguity is gone, which 1 row is sufficient to demonstrate. |

**No data-corruption risk:** this plan performs no `UPDATE`/`DELETE`/data migration of any kind — it only removes a duplicate function definition and (optionally) syncs one repo file to match reality.

---

## 4) Time Estimate

Small, low-complexity, single-purpose cleanup. At autonomous execution speed:
- **Phase 1 (dev drop + verify):** ~10 minutes.
- **Phase 2 (production drop + verify + optional repo file sync):** ~10 minutes.
- **Total: ~20 minutes of agent execution**, plus whatever time you want to spend on your own optional manual UI click-through (see §6) — not required for this plan to be considered done, since the underlying change is a pure database-level de-duplication with no application-code changes.

---

## 5) Roadmap & Progress

### Phase 1 — Drop 6-param overload on dev branch, verify — [Tested]

**Result:** Migration `drop_stale_search_inventory_ranked_6param_overload` applied cleanly to `sitihbdnuxifwibontcm`. `pg_proc` re-query confirmed exactly one `search_inventory_ranked` remains (oid `18704`, 8-param identity args). Both smoke-test call shapes (`null`/`null` and `''`/`''` for `p_location_from`/`p_location_to`) executed without error — the `''`/`''` shape even returned dev's one real seed row (`TESTPART1`, matching `'test'`), a genuine positive match, not just an empty-but-non-erroring result.

**Impacted:**
- Database only: `public.search_inventory_ranked(p_search_term text, p_filter text, p_sort_by text, p_sort_direction text, p_limit integer, p_offset integer)` on project `sitihbdnuxifwibontcm` (branch `development`).
- No frontend files touched in this phase.

**TL;DR:** Drop the stale 6-param overload on dev via a tracked migration; immediately re-query `pg_proc` to confirm exactly one `search_inventory_ranked` remains; smoke-test all 3 real call-site shapes directly via RPC to confirm no `PGRST203`/`42883` and correct data shape back.

**Detail:**
1. Apply a new migration named `drop_stale_search_inventory_ranked_6param_overload` via `apply_migration` against `sitihbdnuxifwibontcm`:
   ```sql
   DROP FUNCTION IF EXISTS public.search_inventory_ranked(
     p_search_term text,
     p_filter text,
     p_sort_by text,
     p_sort_direction text,
     p_limit integer,
     p_offset integer
   );
   ```
   The explicit 6-arg signature is what makes this safe — Postgres will refuse to drop the 8-param overload by accident since the signatures don't match.
2. Re-run the `pg_proc`/`pg_get_function_identity_arguments` introspection query used during planning against `sitihbdnuxifwibontcm` — expect exactly **one** row for `search_inventory_ranked`, with the 8-param identity arguments (`..., p_location_from text, p_location_to text`).
3. Smoke-test via direct `execute_sql` (read-only, safe against dev):
   - `select * from search_inventory_ranked('test', 'all', 'part_number', 'asc', 5, 0, null, null);` — the `GetPartModal.jsx`/`LegacyWarrantyReturnModal.jsx`-shaped call (explicit nulls).
   - `select * from search_inventory_ranked('test', 'all', 'part_number', 'asc', 5, 0, '', '');` — the `LegacyWarrantyReturnModal.jsx`-shaped call (empty strings).
   - Confirm each returns without error (even if 0 rows, given dev's 1-row `InventoryItem` table).

**Exit criteria:** migration applied cleanly; exactly one overload remains on dev; both smoke-test call shapes execute without error.

### Phase 2 — Drop 6-param overload on production, verify, optional repo file sync — [Tested]

**Result:** Same migration applied cleanly to `hbcrwkmgsazqrvsrmxyr`. `pg_proc` re-query confirmed exactly one `search_inventory_ranked` remains (oid `40137`, 8-param identity args). Both smoke-test call shapes executed without error against real production data — `'brake'` returned 5 identical rows (`total_count: 255`) for both the `null`/`null` and `''`/`''` shapes, confirming both real-world calling conventions (`GetPartModal.jsx`/`InventoryList.jsx` vs. `LegacyWarrantyReturnModal.jsx`) still resolve unambiguously and correctly. Repo file `src/supabase/search_inventory_ranked.sql` rewritten to match the live 8-param definition verbatim (via `pg_get_functiondef()`), removing the phantom `p_include_inactive` parameter that was never actually deployed.

**Impacted:**
- Database: same function signature, dropped on project `hbcrwkmgsazqrvsrmxyr` (production/`main`).
- Optional: `src/supabase/search_inventory_ranked.sql` (repo-only, no runtime effect) — rewritten to match the actual live 8-param definition, removing the phantom `p_include_inactive` parameter that was never really deployed.

**TL;DR:** Repeat Phase 1's exact drop + verification against production once Phase 1 is confirmed clean; optionally sync the repo's `.sql` file to reality; roll the finding back into `phase_13_implementation_plan.md` §0.9 and `master_blueprint.md`'s lessons-learned as closed.

**Detail:**
1. Apply the identical `DROP FUNCTION IF EXISTS ...` (6-param signature) via `apply_migration` against `hbcrwkmgsazqrvsrmxyr`, same migration name.
2. Re-run the same `pg_proc` introspection query against production — expect exactly one remaining overload (8-param).
3. Run the same two read-only smoke-test `select`s against production (safe — pure `SELECT`, no writes; production already has 4,441 real `InventoryItem` rows, so this also happens to be a more meaningful behavioral check than dev's smoke test).
4. **If approved:** overwrite `src/supabase/search_inventory_ranked.sql` with the live 8-param `pg_get_functiondef()` output (captured during planning), removing the stale `p_include_inactive` parameter that never matched deployed reality.
5. Update `phase_13_implementation_plan.md` §0.9's "worth a follow-up cleanup" note to mark it done, and roll the "checked-in `.sql` isn't proof of deployed reality" lesson's resolution into `master_blueprint.md` §7 if that section gets touched again before this phase closes.

**Exit criteria:** exactly one `search_inventory_ranked` overload exists on production; both smoke tests pass; repo `.sql` file (if approved) matches live reality; `phase_13_implementation_plan.md` §0.9 updated to reflect closure.

---

## 6) Verification Plan

This change has **no application-code diff** — the fix is entirely at the database layer, removing a duplicate function signature that PostgREST was previously choosing between. There is nothing new to click through in the sense of new UI behavior; verification here is about confirming **nothing broke** on the 3 existing call sites, plus confirming the original bug class (`PGRST203`) is now structurally impossible rather than just worked around.

**What I'll verify directly (no UI needed, done during each phase above):**
- `pg_proc` introspection after each drop confirms exactly one overload remains.
- Direct RPC smoke-test calls (both `null` and `''` location-param shapes, matching the two different styles the 3 real callers actually use) return without error on both dev and production.

**Optional manual UI click-through, if you want extra confidence (not required for this plan to be done):**
1. **`InventoryList.jsx`** (`test.kensauto.ca` or production, whichever you're comfortable testing against): open the Inventory list page, type a part number or description fragment into the search box. **Expect:** results filter as before, no console error. This is the same page/code path Phase 7C already validated — you're only confirming the drop didn't regress it.
2. **`GetPartModal.jsx`**: open any Work Order / Estimate, use "Add Part" to open the Get Part modal, type a search term. **Expect:** results populate exactly as they did right after 13C's fix (this is the exact call site that originally hit `PGRST203` before the app-code workaround was added — you're confirming it still works now that the ambiguity is removed at the source).
3. **`LegacyWarrantyReturnModal.jsx`**: open a legacy warranty return flow, type a part number in its search field. **Expect:** existing-part matches (or "no existing parts found" for a nonsense value) with no console error.

**How you'll know it worked:** no `PGRST203 "Could not choose the best candidate function"` and no `42883 "function ... does not exist"` in the browser console or Supabase logs on any of the 3 flows above — both are the only two failure modes a function-overload change of this kind can realistically produce.

---

## 7) Working Area (Current Phase)

### Current phase: Phase 1 — Drop 6-param overload on dev branch, verify

**Exact steps I will take once you approve:**

1. **Apply migration** via the Supabase MCP `apply_migration` tool:
   - `project_id`: `sitihbdnuxifwibontcm`
   - `name`: `drop_stale_search_inventory_ranked_6param_overload`
   - `query`:
     ```sql
     DROP FUNCTION IF EXISTS public.search_inventory_ranked(
       p_search_term text,
       p_filter text,
       p_sort_by text,
       p_sort_direction text,
       p_limit integer,
       p_offset integer
     );
     ```

2. **Verify exactly one overload remains** via `execute_sql` against `sitihbdnuxifwibontcm`:
   ```sql
   select p.oid, pg_get_function_identity_arguments(p.oid) as args
   from pg_proc p
   join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'search_inventory_ranked';
   ```
   Expected: single row, `args` = `p_search_term text, p_filter text, p_sort_by text, p_sort_direction text, p_limit integer, p_offset integer, p_location_from text, p_location_to text` (oid `18704`, the known 8-param survivor).

3. **Smoke-test both call shapes** via `execute_sql` against `sitihbdnuxifwibontcm` (read-only `SELECT`, no writes):
   ```sql
   select id, part_number, match_rank, total_count
   from search_inventory_ranked('test', 'all', 'part_number', 'asc', 5, 0, null, null);

   select id, part_number, match_rank, total_count
   from search_inventory_ranked('test', 'all', 'part_number', 'asc', 5, 0, '', '');
   ```
   Expected: both execute without error (0 or more rows — dev's `InventoryItem` table has only 1 seed row today, so an empty result set is fine and expected; the goal is proving no ambiguity/missing-function error, not exercising ranking logic).

4. **Report back** with the confirmed remaining-overload state and both smoke-test results before touching production (Phase 2 stays untouched until you review this phase's outcome).

**Not touched in this phase:** production database, any frontend `.jsx` file, `src/supabase/search_inventory_ranked.sql` (that optional sync is Phase 2, pending your go-ahead on §1's proposal).
