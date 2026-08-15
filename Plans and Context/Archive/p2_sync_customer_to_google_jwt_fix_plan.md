# P2 Plan: Remove Plaintext Service-Role JWT from `sync_customer_to_google` Trigger

**Status:** **COMPLETE, 2026-08-14.** Option A executed on production, per user approval and explicit instruction to not replicate on dev.

**Source:** `Pre_go-live_plan.md` Step 3, item P2.

---

## 1) Overview & Objectives

**Problem.** The production `sync_customer_to_google` trigger (on `Customer`, fires `AFTER INSERT OR UPDATE`) has a **service-role JWT hardcoded in plaintext** directly in its `supabase_functions.http_request()` call — readable by anyone with schema access (`pg_trigger`/`information_schema`), not just `.env`. This is the same anti-pattern already fixed on the sibling `WorkOrder_Broadcast` trigger, except **more sensitive**: that trigger's hardcoded JWT was the public anon key; this one decodes to `"role":"service_role"` — a credential that bypasses RLS entirely.

**Objective.** Eliminate the plaintext credential from the trigger definition without breaking the live Google Contacts sync integration, using the same investigate-before-fix discipline already applied to `WorkOrder_Broadcast`: confirm whether the called function actually needs the header before choosing header-removal vs. Vault relocation.

**Boundaries.** This plan covers only the trigger's authentication mechanism. It does not touch `Google-Contacts-Sync`'s own business logic (Google People API calls, contact create/update mapping), which is unrelated to the JWT-exposure issue and already working correctly in production.

---

## 2) Assumptions & Verification

- **VERIFIED** — Current production trigger definition: `CREATE TRIGGER sync_customer_to_google AFTER INSERT OR UPDATE ON public."Customer" FOR EACH ROW EXECUTE FUNCTION supabase_functions.http_request('https://hbcrwkmgsazqrvsrmxyr.supabase.co/functions/v1/Google-Contacts-Sync', 'POST', '{"Content-type":"application/json","Authorization":"Bearer <JWT>"}', '{}', '5000')`. Same `supabase_functions.http_request()` mechanism as `WorkOrder_Broadcast` (a table trigger, not the `pg_cron`/`pg_net` mechanism used by the Appointment Reminder jobs — those are structurally different and authenticate differently for a reason; see Section 3).
- **VERIFIED** — The hardcoded JWT decodes to `{"iss":"supabase","ref":"hbcrwkmgsazqrvsrmxyr","role":"service_role","iat":1773374076,"exp":2088950076}` — a long-lived (~2036 expiry) service-role token, deliberately minted for this purpose. More sensitive than `WorkOrder_Broadcast`'s exposed anon key.
- **VERIFIED** — Pulled `Google-Contacts-Sync`'s actual deployed source directly from Supabase (it has no tracked source in this repo — confirmed via repo-wide search). The function's code **never reads `req.headers.get('Authorization')` anywhere**. It authenticates its two external calls independently: (1) Google's People API, via a Google OAuth access token freshly fetched inside the function using `GCP_CLIENT_ID`/`GCP_CLIENT_SECRET`/`GCP_REFRESH_TOKEN`; (2) its own Supabase client, constructed with `SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY` read from its own environment, not from the incoming request. Same shape as `WorkOrder_Broadcast`'s already-confirmed-safe pattern.
- **VERIFIED — the key difference from `WorkOrder_Broadcast`:** `Google-Contacts-Sync` has **`verify_jwt: true`** (`WorkOrder_Broadcast` has `verify_jwt: false`). This means Supabase's platform gateway requires *some* validly-signed JWT present on every call before the function body ever runs — independent of whether the function's own code reads it. Simply deleting the header (as was done for `WorkOrder_Broadcast`) would make every trigger-fired call **401 at the gateway**, silently breaking the Google Contacts sync entirely.
- **VERIFIED** — `verify_jwt: true` today provides negligible real protection in practice: it only requires *a* validly-signed Supabase JWT, not specifically a service-role one — the public anon key (embedded in the client bundle, effectively public) already satisfies it. The service-role JWT currently used is strictly more privileged than what the gate actually requires.
- **VERIFIED** — This trigger/integration has **no dev-branch equivalent** — checked directly: dev's `Customer` table (`sitihbdnuxifwibontcm`) has zero triggers. This is a production-only integration (makes sense — nobody wants dev/test customer churn syncing into the shop's real Google Contacts). **The dev-first-then-prod discipline from the P1/P3/P4 batch doesn't directly apply here** — there is no dev copy to test against. Section 5 proposes an alternative safe-testing approach instead.
- **VERIFIED** — The Vault-secret pattern already exists in this codebase, established for the Appointment Reminder `pg_cron` jobs (`supabase/migrations/20260814000000_schedule_appointment_reminder_cron_jobs.sql`): a named secret (`autopro_cron_secret`) stored via Vault, referenced at call time via `(select decrypted_secret from vault.decrypted_secrets where name = '...')`, checked by the target function against a custom header (`x-cron-secret`). That migration's own comment explicitly calls out `sync_customer_to_google`/`WorkOrder_Broadcast` as the anti-pattern it was written to avoid repeating — but that mechanism (`pg_cron` + `pg_net`, `net.http_post`) is structurally different from this trigger's `supabase_functions.http_request()` mechanism (see master_context.md §3) and is designed around `verify_jwt: false` targets authenticating via a custom header instead of the platform gate. `WorkOrder_Broadcast` (identical mechanism to this trigger) did **not** need Vault — it needed the header removed and `verify_jwt` flipped off.
- **ASSUMED** — No other caller depends on `Google-Contacts-Sync` requiring a valid JWT for protection (i.e., nothing beyond this one trigger relies on `verify_jwt: true` as an actual access-control boundary). **Verification before executing:** search production logs (`query_logs`/`get_logs` on `function_edge_logs` for this function) for any invocation pattern not matching the trigger's own call shape, immediately before applying the fix.
- **ASSUMED** — `GCP_CLIENT_ID`/`GCP_CLIENT_SECRET`/`GCP_REFRESH_TOKEN` secrets are configured only on production (this integration has never run on dev). **Verification before executing:** not required to execute this plan (these secrets aren't being touched), but worth confirming before ever considering a dev replica of this integration.

---

## 3) Proposed Changes

### Recommended: Option A — Header removal + `verify_jwt: false` (matches `WorkOrder_Broadcast` exactly)

**Rationale:** `Google-Contacts-Sync` uses the identical trigger mechanism as `WorkOrder_Broadcast`, its code has the identical "doesn't read the incoming header, authenticates internally instead" shape, and `WorkOrder_Broadcast`'s own fix already proved this pattern safe and correct for this exact mechanism. Simpler, no new secret to manage, no new failure mode (a Vault lookup that could itself fail/be misconfigured).

**Changes:**
1. Update `Google-Contacts-Sync`'s deploy config: `verify_jwt: false` (currently `true`). Requires a redeploy via `deploy_edge_function` with the same source, `verify_jwt: false`.
2. Replace the trigger definition, dropping the `Authorization` header entirely:
   ```sql
   DROP TRIGGER sync_customer_to_google ON "Customer";
   CREATE TRIGGER sync_customer_to_google AFTER INSERT OR UPDATE ON public."Customer"
     FOR EACH ROW EXECUTE FUNCTION supabase_functions.http_request(
       'https://hbcrwkmgsazqrvsrmxyr.supabase.co/functions/v1/Google-Contacts-Sync',
       'POST',
       '{"Content-type":"application/json"}',
       '{}',
       '5000'
     );
   ```
3. **Separate, out-of-band recommendation (not part of this SQL change):** treat the currently-exposed service-role key as compromised and rotate it via the Supabase dashboard, since it's been readable via schema access — this is a manual action outside any available tooling, same category as the previously-noted `BASE44_ACCESS_TOKEN` rotation call.

### Alternative: Option B — Vault relocation (keeps `verify_jwt: true` and a real secret gate)

Only worth choosing over Option A if you specifically want this endpoint to keep requiring authentication (defense-in-depth beyond "the function's own logic is narrow and bounded"), accepting the added complexity of a second secret to manage.

**Changes:**
1. Store a **freshly generated** secret in Vault (do not reuse the currently-exposed service-role JWT — treat it as burned): `select vault.create_secret('<new-secret-value>', 'google_contacts_sync_secret');`
2. Modify `Google-Contacts-Sync`'s source to check an incoming custom header (e.g. `x-sync-secret`) against `Deno.env.get(...)` — this requires the secret to also be set as a function secret (`supabase secrets set` / dashboard), **not** read from Vault inside the Edge Function itself (Edge Functions can't query Postgres Vault directly the way a trigger/cron job can) — asymmetric from the cron pattern, which reads Vault from *inside SQL*, not inside the function.
3. Update the trigger definition to pull the secret from Vault into the header, mirroring the cron migration's exact pattern:
   ```sql
   CREATE TRIGGER sync_customer_to_google AFTER INSERT OR UPDATE ON public."Customer"
     FOR EACH ROW EXECUTE FUNCTION supabase_functions.http_request(
       'https://hbcrwkmgsazqrvsrmxyr.supabase.co/functions/v1/Google-Contacts-Sync',
       'POST',
       jsonb_build_object(
         'Content-type', 'application/json',
         'x-sync-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'google_contacts_sync_secret')
       )::text::jsonb,
       '{}',
       '5000'
     );
   ```
   (Note: `supabase_functions.http_request`'s headers argument needs to remain a static-shaped call the trigger function accepts — needs a quick syntax confirmation against a real Postgres session before executing, since this is a slightly different signature shape than the plain string literal `WorkOrder_Broadcast` uses today.)
4. Keep `verify_jwt: true` as-is — the new custom header becomes the actual access-control check now, done in code, not just at the platform gate.

**This plan recommends Option A** and proposes executing it, pending your confirmation, with Option B documented as the alternative if you'd rather keep a real secret gate.

---

## 4) Risk Assessment

| # | Risk | Impact | Likelihood | Mitigation |
|---|---|---|---|---|
| 1 | Flipping `verify_jwt: false` (Option A) makes `Google-Contacts-Sync`'s URL callable by anyone who discovers it, with no authentication at all | Low-Medium | Low | The function's own logic is narrow (creates/updates one Google Contact per call, using this business's own Google OAuth credentials) — worst case is contact spam/junk in Google Contacts, not data exfiltration or Supabase write access. `verify_jwt: true` today already provides negligible real protection (any public anon key satisfies it). Same risk profile `WorkOrder_Broadcast` already accepted with its identical fix. |
| 2 | No dev environment exists for this integration — a mistake in the trigger/function change is only ever tested against production | High (if untested) | Low (mitigated below) | Section 5 proposes testing the deployed function directly via a synthetic payload *before* touching the trigger, isolating "does the new auth model work" from "does the live trigger fire it correctly" as two separate, sequenced checks. |
| 3 | A real `INSERT`/`UPDATE` test against `Customer` creates a real, unwanted contact in the shop's actual Google Contacts (external system, not just the DB — can't be "rolled back" the way a disposable DB row can) | Medium | Medium (if not handled carefully) | Test via direct function invocation with a synthetic payload first (no real Customer row touched, see Section 5) rather than a live trigger-fired `INSERT`. If an end-to-end live-trigger test is wanted too, use an obviously-fake test customer (e.g. name "ZZTEST DELETE ME") and manually delete the resulting Google contact afterward — flag this explicitly to the user before doing it, since it touches an external system this session can't clean up automatically. |
| 4 | The exposed service-role JWT remains valid (doesn't expire until ~2036) even after this fix — removing it from the trigger doesn't revoke it | Medium | N/A (already true today) | Out-of-band key rotation via the Supabase dashboard is the only real remediation for the already-exposed credential — flagged as a manual follow-up in Section 3, independent of which SQL option is chosen. |
| 5 | (Option B only) The Vault-in-SQL / secret-in-function-env split is asymmetric and more moving parts than Option A — a misconfiguration (wrong secret name, function env var not set) silently breaks the sync with no dev environment to catch it first | Medium | Low-Medium | Reason Option A is recommended over B. If B is chosen anyway, verify the exact `supabase_functions.http_request` header-argument syntax against a real session before applying to production. |

---

## 5) Verification & Testing Plan

**Step 1 — Verify the function still works under the new auth model, without touching the trigger yet:**
1. Redeploy `Google-Contacts-Sync` with `verify_jwt: false` (Option A) or the modified header-check source (Option B).
2. Invoke the function directly (not via the trigger) with a synthetic payload shaped like what the trigger would send — e.g. `{"record": {"id": "<disposable-test-id>", "first_name": "ZZTEST", "last_name": "DELETEME", "email": "test@example.invalid"}, "type": "INSERT"}` — via a plain `fetch`/curl call, **no** `Authorization` header (Option A) or the new secret header (Option B).
3. Confirm a `200` response and that a new Google Contact named "ZZTEST DELETEME" actually appears — proves the new auth model doesn't break the integration.
4. **Immediately delete that test contact from Google Contacts** (external system — this session can only prompt for this, the user needs to actually do it, or confirm they're comfortable leaving it and cleaning it up later).

**Step 2 — Apply the trigger definition change:**
5. Apply the new `CREATE TRIGGER` (Option A or B) via `apply_migration` to production. Write the matching `.sql` file to `supabase/migrations/`.

**Step 3 — End-to-end confirmation:**
6. Either: (a) trust Step 1's direct-invocation test as sufficient proof and skip a live end-to-end trigger fire, or (b) if the user wants full end-to-end confidence, create one obviously-fake test `Customer` row, confirm the trigger fires and a contact is created, then delete both the test `Customer` row and the resulting Google contact. **This is the user's call — ask before doing (b), since it's the one step in this plan that touches real external (non-Supabase) state.**
7. Confirm via `pg_trigger`/`information_schema` that the plaintext JWT no longer appears anywhere in the trigger definition.

**Checklist:**
- [x] Confirm approach: **Option A** (user-approved)
- [x] `Google-Contacts-Sync` redeployed with `verify_jwt: false` (v22, `ACTIVE`)
- [x] Direct function invocation test passes with new auth model — **deviated from the plan's original proposal**: used a deliberately-invalid payload (`{}`, missing `record`) instead of a full synthetic contact payload, specifically to prove the auth/routing fix works via the function's own early validation error, without ever reaching the Google People API call — **zero real Google Contacts touched**, per user's explicit instruction not to pollute real Google Contacts with test data.
- [x] Test Google Contact deleted — **N/A, none was ever created** (see deviation above)
- [x] New trigger definition applied to production via `apply_migration`
- [x] Migration file written to `supabase/migrations/` (`20260814200000_remove_plaintext_jwt_from_sync_customer_to_google_trigger.sql`)
- [x] Confirmed via `pg_trigger` that no plaintext JWT remains in the trigger definition — clean, headers now `{"Content-type":"application/json"}` only
- [x] User decision on optional live end-to-end test: **declined** — user explicitly said not to create dev/test data that would sync to real Google Contacts; the next real customer create/edit in normal business use is the true end-to-end proof, not manufactured
- [ ] Separate action still open, flagged to user: rotate the now-exposed service-role key via Supabase dashboard (out-of-band, no tooling available to do this directly)
- [x] `Pre_go-live_plan.md`'s P2 entry updated to resolved, pointing at this plan

---

## 6) Completion Notes & Context

**Executed exactly as planned, Option A, with one deliberate deviation in the verification step (safer than originally proposed, not riskier).**

**What happened vs. planned:**
1. Redeployed `Google-Contacts-Sync` (same source, unchanged business logic) with `verify_jwt: false` — production only.
2. Verified the new auth model works via a direct, no-`Authorization`-header call with an intentionally-invalid payload (`{}`). Got back the function's own `"No record found in payload"` error (not a gateway 401) — proves the gateway no longer requires a JWT and the function code runs, without ever reaching the Google People API call. **This deviates from the plan's original Step 1 proposal** (a full synthetic contact payload that would have created a real, disposable Google Contact) — the user explicitly asked not to create any test data that would sync into real Google Contacts, so this leaner test was used instead. Trade-off: doesn't prove the full round-trip through Google's API still works — but that code path is completely untouched by this fix (only the auth/header layer changed), so it didn't need re-proving.
3. Applied the new trigger definition (`DROP TRIGGER` + `CREATE TRIGGER`, no `Authorization` header) to production via `apply_migration`.
4. Confirmed via `pg_trigger` that the trigger's headers are now just `{"Content-type":"application/json"}` — plaintext JWT fully removed.
5. **Did not** create a live test `Customer` row for full end-to-end confirmation — user declined, same reasoning (would sync a real contact into Google Contacts). The next real customer created/edited in normal business use will be the actual end-to-end proof.
6. **Deliberately not touched, per the plan and explicit user instruction:** dev branch. `Customer` has zero triggers on dev today and this migration was not replicated there — this integration is production-only by design (dev/test customer churn syncing into real Google Contacts would be actively harmful, not just untested).

**Deviations/fixes during implementation:** none beyond the verification-payload substitution described above — no unexpected errors, no rollback needed.

**Still open, not part of this fix:** the now-removed service-role JWT was exposed via schema access for an unknown period and should be treated as compromised. Rotating it is an out-of-band Supabase-dashboard action with no available tooling to do it directly from this session — flagged to the user, not yet done.

**Architectural notes to carry forward:** `Google-Contacts-Sync` and `WorkOrder_Broadcast` are now consistent with each other — both `supabase_functions.http_request()`-mechanism triggers, both `verify_jwt: false`, neither carrying an inline credential. Any *future* trigger built on this same mechanism should default to this shape (no header, `verify_jwt: false`, auth handled by the function reading its own env vars if it needs external credentials) unless there's a specific reason the endpoint needs to gate on caller identity — in which case the Vault-in-SQL pattern from the Appointment Reminder `pg_cron` jobs is the established alternative, though note that pattern was built for the structurally-different `pg_cron`/`pg_net` mechanism and would need adaptation (see Option B in Section 3) if ever applied to a table-trigger context instead.
