# Phase 15 Implementation Plan: Final Sunset (`@base44/sdk` / `@base44/vite-plugin` / `base44-proxy` / `base44/` tree removal)

**Status:** **Substantively complete, 2026-08-13.** 15A–15D all done; one item (deleting `base44-proxy` from **production**) deliberately deferred to post-go-live per explicit user decision — see the Final Verification section for detail. Not blocking anything; safe to treat this phase as closed pending that one follow-up.

**Parent:** `master_blueprint.md`, Phase 15 row (Tier G, now `[Substantively Complete — 2026-08-13]`): "Last phase. Only after: (1) the separate final-validation/blueprint-verify pass confirms every phase's features are functional and tested, (2) a repo-wide `base44` grep across all of `src/` returns zero hits. Deletes `@base44/sdk`, `@base44/vite-plugin`, `base44-proxy`, and the `base44/` source tree."

**Gate 1 status:** ✅ Satisfied. `blueprint_verification_plan.md` Section 3 closed 2026-08-14 — all ~85 test items, including every comms-gated flow, passed.

**Gate 2 status:** ✅ Satisfied, 2026-08-13. Repo-wide `base44` grep (not just `src/`) clean except deliberately-preserved false positives and the one deliberately-deferred real reference (`supabase/functions/base44-proxy/index.ts`, source for the still-deployed-on-production function). See Final Verification section for the full exception list.

> **LIVE DOCUMENT.** Update in place as each sub-phase executes/verifies. Don't wipe prior sections; append/annotate.

---

## 0) Open Questions — RESOLVED 2026-08-14

All three original questions, plus two new findings surfaced by a second, repo-wide (not just `src/`) search requested before execution:

1. **Base44 platform status:** No direct tool access to check base44's own dashboard. **A full repo-wide `base44` grep (not scoped to `src/`) was run as a direct check** and found 2 genuinely live, previously-undiscovered dependencies inside `supabase/functions/` (native Edge Functions, not the local `base44/` mirror) — see the two new findings below. Beyond those two, nothing else in the live app (frontend or native Edge Functions) calls out to base44's platform. **Decision:** both new findings folded into this phase's scope (below), closing them is now part of Phase 15 rather than left as an unknown.
2. **`Google-Contacts-Sync`:** **User-confirmed** — it's an existing native Supabase Edge Function, not base44-hosted. No action needed; it was never actually in scope.
3. **Hard delete vs. archive `base44-proxy`/`base44/` tree:** **User-confirmed — hard delete**, matching this project's established precedent for every other deprecation. **Followed by a full round of general application regression testing after 15C**, before considering the phase closed (added to the plan below).

**Two new findings from the repo-wide search, both resolved:**

- **`supabase/functions/autopro-mergeVehicles/index.ts`** imports `npm:@base44/sdk@0.8.24` directly (a Deno-side import — separate from and unaffected by removing `@base44/sdk` from the frontend's `package.json`) and calls `base44.entities.Appointment.filter()`/`.update()` during a vehicle merge to reassign appointments. Wrapped in a non-fatal try/catch that — per its own comment — **already always fails today**, since a server-side Edge Function invoked via `supabase.functions.invoke()` has no way to supply Base44 SDK auth headers. This is the same item already sitting on `Pre_go-live_plan.md` as **P10**. **Decision: fold into Phase 15** — rewire to a direct `supabase.from('Appointment')` update (15B, below). `Pre_go-live_plan.md`'s P10 will be marked resolved-via-Phase-15 rather than tracked twice.
- **`supabase/functions/autopro-processQOHAdjustment/index.ts`** — when a QOH adjustment is flagged `system_issue: true`, it emails `tyler@kensauto.ca` directly via a live `fetch()` to `https://api.base44.app/functions/v1/sendEmailViaSMTP` using `BASE44_ACCESS_TOKEN`. **This is a real owner-notification path** (staff flagging a system-caused inventory discrepancy), not a decorative feature — initially mis-described during scoping and re-confirmed once the actual behavior was clear. **Decision: rewire to the native shared module** (`_shared/resend.ts`'s `sendViaResend`, already proven in Phase 6) rather than strip it — same recipient, same content, just off base44 (15B, below).

`autopro-suggestInventoryCategory` (the file originally, incorrectly, described as having this fallback) was re-checked and confirmed to have **zero** base44 references — no change needed there.

Everything else the repo-wide search surfaced was either: the local `base44/functions/` tree itself (expected — in scope for deletion), this project's own planning docs (expected, historical), `package.json`/`package-lock.json`/`.gitignore` (expected, in scope for cleanup), comments in native functions referencing base44 only as historical context (`autopro-resendWebhook`, `autopro-sendTextReminders`, `autopro-sendAppointmentReminders`, `autopro-processCustomerARAccounting`, `autopro-getRealTimeInventoryOnOrder` — all comments only, no functional dependency), or `index.html`'s `<title>Base44 APP</title>` (cosmetic, browser tab title only — added to 15B's scope as a trivial fix, proposed new title "AutoPRO" unless you'd prefer different wording).

---

## 1) Phase Scope & Objectives

**Objective:** Fully remove this repo's dependency on the Base44 platform — the SDK, its Vite plugin, the proxy Edge Function that bridges the frontend to it, and the local mirror of Base44-hosted function source — now that every phase's features are migrated to native Supabase and live-verified.

**In scope:**
- Frontend: delete the 3 files that constitute the base44 SDK wrapper (`base44Client.js`, `entities.js`, `integrations.js`), remove 2 dead leftover imports in `WorkOrders.jsx`, remove `@base44/sdk`/`@base44/vite-plugin` from `package.json`, remove the `base44()` Vite plugin call and the local-dev `/api` proxy block from `vite.config.js`.
- Backend: delete the `base44-proxy` Edge Function from both the dev branch and production, once confirmed to have zero live traffic.
- Repo housekeeping: remove (or, per your answer to Q3, archive) the local `base44/functions/` source tree — this repo's git-tracked mirror of what's/was deployed on base44's own platform. **Deleting it from this repo does not itself stop anything still live on base44's platform** — that's a separate action on their side, only you can take it, and Q1 is what's blocking me from confidently saying nothing there still needs it.
- Verification: `base44` grep across the whole repo (not just `src/`, to catch stragglers in config/docs) returns zero hits except the 3 intentionally-preserved false positives (below); app builds and runs cleanly with the dependency fully removed from `package.json`/`vite.config.js`; smoke-test every top-level page.

**Explicitly NOT in scope (tracked elsewhere, don't duplicate here):**
- `sync_customer_to_google`'s plaintext-JWT trigger fix — already tracked as `Pre_go-live_plan.md` item P2, its own separate piece of work modeled on the `WorkOrder_Broadcast` fix.
- Refreshing/rotating `BASE44_ACCESS_TOKEN` — already marked redundant in `blueprint_verification_plan.md`/`Pre_go-live_plan.md`, becomes fully moot once this phase completes.
- Anything on base44's own platform dashboard (disabling functions there, canceling any subscription, etc.) — outside any tool access available in this session; flagged in Section 0, action items land with you.

---

## 2) Lessons Learned & Context (pulled from `master_blueprint.md` §7 and this week's sessions)

- **Always confirm entity/dependency status directly against the database or source, never trust a classification table at face value** — Phase 14's own research caught a real rename this way; this plan's own research below did the same (found the "8 files reference base44" grep result was 50% false positives once each was actually read, not just pattern-matched).
- **A committed source fix and a deployed function are two separate steps** — don't assume `base44-proxy`'s local source being deleted means anything about whether it's still live/reachable on Supabase until the deploy/delete action is actually taken and confirmed via `get_edge_function`.
- **This repo has two live Supabase native branches** (`hbcrwkmgsazqrvsrmxyr` = production, `sitihbdnuxifwibontcm` = dev) that don't always match — a fix or deletion confirmed on one doesn't imply the same state on the other. `base44-proxy` needs to be independently confirmed unused and removed on **both**.
- **`VITE_BASE44_BACKEND_URL`/`VITE_BASE44_PROXY_URL` are hardcoded to production** regardless of which Supabase branch the frontend points at — this was the original reason "never write-test an unmigrated feature outside production" was a standing rule all through this project. Directly relevant here: it confirms `base44-proxy` on **production** (`hbcrwkmgsazqrvsrmxyr`) is the one that ever mattered for real traffic; the dev-branch copy (if one exists) was never live-load-bearing.
- **The reminder-functions saga (this week) is the freshest cautionary tale**: an unscoped, production-routed base44 function nearly got triggered live against real customer data before its risk was fully understood. Apply the same care here — confirm before removing, don't assume "looks unused" is the same as "confirmed unused."
- **This project's established precedent for deprecated code is hard deletion, not archival** (Kanban board, PartsTech cluster, LANKAR bulk import, several legacy AR modals) — proposed as the default for Q3 above unless you want this specific case handled differently.

---

## 3) Phase 15 Roadmap & Progress

### Sub-phase table

| Sub-phase | Status | Overview |
|---|---|---|
| 15A | Done (research) — Section 0 fully resolved | Audit & verification — confirmed the true blast radius, including a repo-wide (not just `src/`) second pass that surfaced 2 real live dependencies inside `supabase/functions/` |
| 15B | **[Tested]** — verified 2026-08-13 (QOH notification email delivery confirmed) | Frontend dependency removal + 2 function rewires (`autopro-mergeVehicles`, `autopro-processQOHAdjustment`) — delete the SDK wrapper files, dead imports, `package.json`/`vite.config.js` cleanup, `index.html` title; build-verify |
| 15C | **Substantively complete** — dev done; production `base44-proxy` deletion deliberately deferred to post-go-live (Aug 17), user decision 2026-08-13 | Backend/infra removal — delete `base44-proxy` (dev + prod), hard-delete the local `base44/` source tree |
| 15D | **[Tested]** — user confirmed all remaining modules verified, 2026-08-13 | Full application regression pass (per user instruction) — broad spot-check across every major module, specifically because 15C is the point of no return |
| Final | **Substantively complete** — 2026-08-13, one item (prod `base44-proxy`) deliberately deferred to post-go-live | Full-repo grep, build/smoke-test, roll learnings into `master_context.md`/`master_blueprint.md` |

---

### 15A — Audit & Verification

**Detailed Execution Plan:**

Research already performed while drafting this plan (documented here so 15A's "execution" is mostly confirming/re-checking, not starting cold):

- **Grepped `base44` across `src/`** — 8 files matched. Read each:
  - `src/api/base44Client.js` — the actual SDK client (`import { createClient } from '@base44/sdk'`), builds a client pointed at `VITE_BASE44_PROXY_URL`, sets up fetch/XHR interceptors to inject a Supabase JWT into base44-bound requests. **Real dependency.**
  - `src/api/entities.js` — exports `Query` (`base44.entities.Query`) and `User` (`base44.auth`). **Real dependency, but see below — zero consumers found.**
  - `src/api/integrations.js` — exports `Core`, `InvokeLLM`, `SendEmail`, `SendSMS`, `UploadFile`, `GenerateImage`, `ExtractDataFromUploadedFile`, all off `base44.integrations.Core`. **Real dependency, but see below — zero consumers found.**
  - `src/lib/app-params.js` — reads `VITE_BASE44_APP_ID`/`VITE_BASE44_BACKEND_URL` env vars and `base44_*`-prefixed `localStorage` keys, feeds `base44Client.js`'s client config. **Real dependency** (only consumer is `base44Client.js` — confirmed via grep, nothing else imports `appParams`).
  - `src/components/work-orders/form/WorkOrderHeaderInfo.jsx` and `WorkOrderViewHeaderInfo.jsx` — both only contain `email.endsWith('@no-reply.base44.com')`, a **string comparison against historical audit-log data**, not an SDK call. Production has years of `created_by`/`created_by_id` values stamped by the old base44-hosted system using this exact placeholder email. **False positive — must be preserved, not removed.** Deleting this check would make old system-generated audit entries display a raw placeholder email instead of "System."
  - `src/components/work-orders/history/WorkOrderHistoryModal.jsx` — same `@no-reply.base44.com` string check, same reasoning. **False positive — preserve.**
  - `src/Layout.jsx` — one `<a href="https://registry-pos-tracker-b5793593.base44.app/">`, a nav link to **a separate third-party app** ("Registries POS") that happens to be hosted on the base44.app platform. Nothing to do with this repo's own base44 dependency. **False positive — preserve** (unless you want this link removed for unrelated reasons, which is out of this phase's scope).
- **Grepped for actual consumers of the 3 real-dependency files** (`from '@/api/entities'`, `from '@/api/integrations'`, `from '@/api/base44Client'`, and relative-path variants) across all of `src/` — **zero matches.** Nothing imports `Query`, `User`, `Core`, `InvokeLLM`, `SendEmail`, `SendSMS`, `UploadFile`, `GenerateImage`, or `ExtractDataFromUploadedFile` from these files anywhere in the app anymore.
- **Grepped for the legacy virtual-module import pattern** (`from '@/entities/...'`, `from '@/functions/...'`, the pattern `@base44/vite-plugin`'s `legacySDKImports: true` option exists specifically to support) — **one match**: `src/pages/WorkOrders.jsx` imports `Customer` from `@/entities/Customer` and `Vehicle` from `@/entities/Vehicle`. Checked actual usage in that file: the only `Customer`/`Vehicle` references are `wo.Customer`/`wo.Vehicle` (a property access on a joined work-order object), not calls to the imported classes. **These two imports are dead code** — leftover from before this file's Customer/Vehicle reads were migrated to native `supabase.from()` (confirmed as already done, per Phase 5's completion). No `src/entities/` or `src/functions/` local directory exists to shadow these paths, confirming they'd resolve via the base44 plugin's virtual-module magic if it were still needed — it isn't, since the imports are unused.
- **Checked `vite.config.js`** — imports `@base44/vite-plugin`, registers it as a plugin with `legacySDKImports: true` (the exact option that makes the dead `@/entities/Customer` import above resolve at all), and configures a local-dev-only proxy (`server.proxy['/api']`) forwarding to `base44-proxy` on **production** (`hbcrwkmgsazqrvsrmxyr`). Both are now dead config given zero real consumers.
- **Checked `package.json`** — `@base44/sdk: ^0.8.40` and `@base44/vite-plugin: ^1.0.30` listed as direct dependencies.
- **Checked `supabase/functions/base44-proxy/index.ts`** — confirmed it's the real proxy: validates a Supabase JWT, maps the caller to an `Employee.autopro_user_id`, forwards the request to `base44.app` using `BASE44_ACCESS_TOKEN`/`X-Act-As-User`. Only reachable from the frontend via `base44Client.js`'s interceptors — which nothing calls anymore.
- **Checked for other repo-wide references to `base44-proxy`** — one is a code *comment* in `supabase/functions/autopro-processCustomerARAccounting/index.ts` (historical context for a design decision, not a functional call), the rest are this project's own planning docs. No other live code references it.
- **Checked `.env`** (local, git-ignored, not touched) — 4 `VITE_BASE44_*` entries present locally. Not part of this repo's tracked state; optional cleanup, not a deletion blocker. Production/Vercel env vars are outside my access — note for you, not an action I can take.

**What 15A still needs to formally close (blocked on Section 0 answers, not further code research):**
- Confirm via base44's own dashboard (Q1) whether anything is still scheduled/triggered there independent of this repo.
- Determine `Google-Contacts-Sync`'s actual hosting (Q2) — if base44-hosted, it becomes an explicit dependency this phase must not break.
- If tooling allows, pull `base44-proxy`'s recent invocation logs/metrics on **production** specifically (the only branch that ever mattered for real base44 traffic, per `VITE_BASE44_PROXY_URL` being hardcoded there) as corroborating evidence of zero live traffic, independent of the "no code calls it" finding above.

**Task List:**
- [ ] User answers Section 0, Q1–Q3
- [ ] Pull `base44-proxy` invocation logs on production (`hbcrwkmgsazqrvsrmxyr`) for the recent period, if the available tooling supports it, as corroborating evidence
- [ ] Re-confirm the "8 files / 4 real, 4 false-positive" split one more time immediately before 15B executes (in case anything changed between plan-drafting and execution)

**Verification Plan:**
- [ ] Section 0 answers received and incorporated into 15C's execution (or 15C's scope explicitly narrowed/deferred based on the answers)
- [ ] Production `base44-proxy` log pull (if available) shows no real invocations in a representative recent window

---

### 15B — Frontend Dependency Removal

**Detailed Execution Plan:**

Target files and exact changes:

1. **Delete outright:**
   - `src/api/base44Client.js`
   - `src/api/entities.js`
   - `src/api/integrations.js`

2. **`src/pages/WorkOrders.jsx`** — remove the 2 dead import lines:
   ```diff
   - import { Customer } from "@/entities/Customer";
   - import { Vehicle } from "@/entities/Vehicle";
   ```
   No other change needed in this file — confirmed (15A) the only `Customer`/`Vehicle` tokens remaining are unrelated property accesses on `wo` objects.

3. **`src/lib/app-params.js`** — delete outright. Confirmed (15A) its only consumer is `base44Client.js`, which is also being deleted in this same sub-phase.

4. **`package.json`** — remove both dependency lines:
   ```diff
   - "@base44/sdk": "^0.8.40",
   - "@base44/vite-plugin": "^1.0.30",
   ```
   Followed by `npm install` to regenerate the lockfile and confirm no other installed package depends on either of these (unlikely, but the install step is the actual proof).

5. **`vite.config.js`** — remove the plugin import/registration and the dev-only base44 proxy block:
   ```diff
   - import base44 from "@base44/vite-plugin"
     import react from '@vitejs/plugin-react'
     import { defineConfig } from 'vite'
     import basicSsl from '@vitejs/plugin-basic-ssl'
   
     export default defineConfig({
       server: {
         host: true,
         port: 5173,
         allowedHosts: ['local.kensauto.ca'],
   -     proxy: {
   -       '/api': {
   -         target: 'https://hbcrwkmgsazqrvsrmxyr.supabase.co/functions/v1/base44-proxy',
   -         changeOrigin: true,
   -         headers: {
   -           'Origin': 'https://hbcrwkmgsazqrvsrmxyr.supabase.co',
   -           'Referer': 'https://hbcrwkmgsazqrvsrmxyr.supabase.co'
   -         }
   -       }
   -     }
       },
       logLevel: 'error',
       plugins: [
         basicSsl(),
   -     base44({
   -       legacySDKImports: true
   -     }),
         react(),
       ]
     });
   ```

6. **`WorkOrderHeaderInfo.jsx`, `WorkOrderViewHeaderInfo.jsx`, `WorkOrderHistoryModal.jsx`, `Layout.jsx`** — **no changes.** Confirmed false positives in 15A; touching these would regress historical audit-name display and an unrelated external nav link.

7. **`index.html`** — cosmetic, browser tab title only:
   ```diff
   - <title>Base44 APP</title>
   + <title>AutoPRO</title>
   ```

8. **`supabase/functions/autopro-mergeVehicles/index.ts`** — remove the `@base44/sdk` import and the whole non-fatal try/catch, replace with a direct `Appointment` update matching the pattern already used two lines above for `WorkOrder`:
   ```diff
     import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
     import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
   - import { createClientFromRequest } from "npm:@base44/sdk@0.8.24";
   ```
   ```diff
     const { data: workOrdersData, error: workOrdersError } = await supabase
       .from('WorkOrder').update({ vehicle_id: masterId, updated_at: now }).eq('vehicle_id', duplicateId).select('id');
     if (workOrdersError) throw workOrdersError;
   
   - let appointments = [];
   - try {
   -   const base44 = createClientFromRequest(req);
   -   appointments = await base44.entities.Appointment.filter({ vehicle_id: duplicateId }, undefined, 1000);
   -   if (appointments.length > 0) {
   -     await Promise.all(appointments.map(app => base44.entities.Appointment.update(app.id, { vehicle_id: masterId })));
   -   }
   - } catch (apptError) {
   -   console.error('Appointment reassignment failed (non-fatal, Appointment still base44-hosted; expected when called via supabase.functions.invoke, which cannot supply Base44 SDK headers):', apptError);
   - }
   + const { data: appointmentsData, error: appointmentsError } = await supabase
   +   .from('Appointment').update({ vehicle_id: masterId }).eq('vehicle_id', duplicateId).select('id');
   + if (appointmentsError) throw appointmentsError;
   + const appointments = appointmentsData || [];
   ```
   Response shape (`mergedCount: { workOrders, appointments }`) is unchanged — `appointments.length` still resolves the same way, now from a real update instead of an always-empty array (since the old base44 call always failed). This is a genuine behavior improvement, not just a dependency swap: vehicle merges will now actually carry appointments over, which they silently never did before.

9. **`supabase/functions/autopro-processQOHAdjustment/index.ts`** — swap the direct base44 API call for the shared native module, same pattern as every Phase 6 retrofit:
   ```diff
     import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
     import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
   + import { sendViaResend } from "../_shared/resend.ts";
   ```
   ```diff
   -     const base44AccessToken = Deno.env.get("BASE44_ACCESS_TOKEN");
   -     if (base44AccessToken) {
   -       await fetch("https://api.base44.app/functions/v1/sendEmailViaSMTP", {
   -         method: "POST",
   -         headers: {
   -           "Content-Type": "application/json",
   -           "Authorization": `Bearer ${base44AccessToken}`,
   -           "X-App-Id": "68b90236f4d7e6ac0de4a262"
   -         },
   -         body: JSON.stringify({
   -           to: 'tyler@kensauto.ca',
   -           subject: 'QOH Adjustment - System Issue',
   -           body: emailBody,
   -           from_name: "Ken's Auto & Diesel Repair"
   -         })
   -       }).catch(err => console.error("Failed to send email via SMTP:", err));
   -     }
   +     const resendApiKey = Deno.env.get("RESEND_API_KEY");
   +     const fromEmail = Deno.env.get("SES_FROM_EMAIL") || "noreply@kensauto.ca";
   +     if (resendApiKey) {
   +       await sendViaResend(
   +         resendApiKey,
   +         `Ken's Auto & Diesel Repair <${fromEmail}>`,
   +         ['tyler@kensauto.ca'],
   +         'QOH Adjustment - System Issue',
   +         emailBody
   +       ).catch(err => console.error("Failed to send email:", err));
   +     }
   ```
   Same recipient, same subject, same HTML body, same fire-and-forget non-blocking behavior (a failed notification doesn't fail the QOH adjustment itself) — only the transport changes.

**Task List:**
- [ ] Delete `src/api/base44Client.js`, `src/api/entities.js`, `src/api/integrations.js`, `src/lib/app-params.js`
- [ ] Remove the 2 dead `@/entities/*` imports from `src/pages/WorkOrders.jsx`
- [ ] Remove `@base44/sdk`/`@base44/vite-plugin` from `package.json`, run `npm install`
- [ ] Remove the `base44` plugin and `/api` proxy block from `vite.config.js`
- [ ] Update `index.html`'s `<title>` from "Base44 APP" to "AutoPRO"
- [ ] Rewire `autopro-mergeVehicles/index.ts`'s Appointment reassignment to native `supabase.from('Appointment')`, deploy to dev, confirm via `get_edge_function`
- [ ] Rewire `autopro-processQOHAdjustment/index.ts`'s system-issue email to `_shared/resend.ts`, deploy to dev, confirm via `get_edge_function`
- [ ] `npm run build` — confirm clean
- [ ] `npx eslint` — confirm no new errors (pre-existing unrelated warnings are fine, same standard used throughout this project)
- [ ] Grep `src/` for `base44` again — confirm only the 3 intentionally-preserved false positives remain
- [ ] Grep `supabase/functions/` (excluding comments) for `base44` again — confirm zero functional hits remain

**Verification Plan:**
- [ ] `npm run build` completes with no errors referencing `@base44/sdk`, `@base44/vite-plugin`, or the deleted files
- [ ] Dev server starts cleanly (`npm run dev`), confirms the removed Vite plugin/proxy block isn't needed for local dev to function
- [ ] Smoke-test in the browser: load `/WorkOrders`, confirm the page renders with no console errors related to the removed imports
- [ ] Smoke-test `/Setup`, `/Admin`, and 2–3 other representative pages to catch any indirectly-affected import chain not caught by grep
- [ ] Confirm no regression in the "System" display for historical audit entries (the two preserved `@no-reply.base44.com` checks) — e.g. view a WO history/header with an old system-generated entry, confirm it still shows "System" not a raw email
- [ ] Merge two disposable test vehicles with at least one appointment on the duplicate — confirm the appointment's `vehicle_id` actually reassigns to the master now (previously silently never happened)
- [ ] Trigger a QOH adjustment with `system_issue: true` on disposable test data — confirm the notification email lands via the native path (real send, to `tyler@kensauto.ca` only — same COMMS RULE as always)

**Verification Checklist:**
- [ ] `npm run build` clean
- [ ] `npx eslint` clean (no new errors)
- [ ] `npm run dev` starts without error
- [ ] `/WorkOrders` loads, no console errors
- [ ] `/Setup` loads, no console errors
- [ ] `/Admin` loads, no console errors
- [ ] A WO header/history view with an old base44-system audit entry still shows "System"
- [ ] Vehicle merge with a real appointment on the duplicate correctly reassigns it
- [ ] QOH system-issue notification email lands via the native send path
- [ ] Repo-wide `src/` grep for `base44` shows only the 3 preserved false positives
- [ ] Repo-wide `supabase/functions/` grep for `base44` shows zero functional hits (comments only, if any)

---

### 15C — Backend/Infra Removal

**Section 0 fully resolved 2026-08-14 — cleared to execute once 15A/15B are done and deployed.**

**Detailed Execution Plan:**

1. **Delete `base44-proxy` Edge Function** from both projects:
   - Dev (`sitihbdnuxifwibontcm`)
   - Production (`hbcrwkmgsazqrvsrmxyr`) — the one that ever mattered for real traffic, per `VITE_BASE44_PROXY_URL` being hardcoded to production
   - Only after 15B's frontend changes and the two rewired functions are deployed and confirmed live (so there's no window where a still-deployed frontend or function tries to call an already-deleted dependency)

2. **Hard-delete the local `base44/functions/` source tree** (~130 directories) — confirmed, matching this project's established precedent for every other deprecation. Relies on git history for recovery if ever needed, same as Kanban/PartsTech/LANKAR bulk import before it.

3. **Mark `Pre_go-live_plan.md`'s P10 resolved-via-Phase-15** rather than left open — it's the same item as this sub-phase's `autopro-mergeVehicles` fix (15B).

**Task List:**
- [x] Confirm 15B is deployed and live before proceeding — re-confirmed 2026-08-13: `git status` shows `development` up to date with `origin/development`, no uncommitted code changes pending beyond this plan doc; 15B's live verification (mergeVehicles + QOH email) already independently confirmed in the 15B closeout.
- [x] Delete `base44-proxy` from dev — **confirmed done, 2026-08-13**: `get_edge_function` on `sitihbdnuxifwibontcm` now returns "Function not found" (done manually by the user via the Supabase Dashboard, per the blocker note below).
- [ ] Delete `base44-proxy` from production, confirm via `get_edge_function` — **still outstanding.** Re-checked 2026-08-13: still `ACTIVE` on `hbcrwkmgsazqrvsrmxyr` (version 44, id `3e2411d5-c2e9-4856-8e52-120437259374`). Same manual dashboard action, production project.
- [x] Hard-delete the local `base44/functions/` tree — done via `git rm -r base44/functions` (129 files), **committed by the user** (`e3c9c5c4 "15C"`) and confirmed gone from disk.
- [x] Update `Pre_go-live_plan.md`'s P10 entry to point at this phase's resolution — done, marked resolved-via-15B with a cross-reference

**Blocker found: no available tool can delete a Supabase Edge Function.** The connected Supabase MCP server exposes `deploy_edge_function` (create/update) but no delete/remove equivalent, and this session has no other route to the Supabase Management API. Per this project's own no-install-first preference, the correct unblock is a 2-click manual action in the Supabase Dashboard (Edge Functions → `base44-proxy` → Delete) on each project — **dev (`sitihbdnuxifwibontcm`) first, then production (`hbcrwkmgsazqrvsrmxyr`)** — no code, no CLI install required. Confirmed via `list_edge_functions` immediately before this note that `base44-proxy` is still `ACTIVE` on both: dev at version 19 (id `f1a7fd84-1150-4a7b-96c1-931148408d51`), production at version 44 (id `3e2411d5-c2e9-4856-8e52-120437259374`). Once deleted, this can be confirmed from either side (dashboard, or a future session's `get_edge_function` call returning not-found).

**Unexpected finding, corroboration step (production `query_logs`, last ~10 hours, 2026-08-13):** contrary to 15A's "no code calls it" conclusion, `base44-proxy` **is** receiving live traffic on production right now — repeated `POST .../analytics/track/batch` and `GET .../entities/User/me` calls, roughly every 1–15 minutes from 05:19 through 15:31 today, every single one returning `401`. This is not a new/unknown dependency: the URL pattern (`analytics/track/batch`, `entities/User/me`) is the base44 SDK's own internal telemetry/session-check heartbeat — the same interceptor behavior `base44Client.js` (deleted in 15B) used to set up — and `src/main.jsx` confirms this app registers no service worker in production, so the calls can't be a background process surviving after a tab closes. The most likely explanation: one or more browser tabs that loaded the app **before** 15B's deploy landed have been left open/idle since, still running the old in-memory JS bundle, and its SDK heartbeat keeps firing on its own timer. **This does not block 15C**: every one of these calls already 401s today (confirmed both by this log pull and by the root-cause analysis in `master_context.md` §3 — the proxy's auth check fails against the wrong Supabase project regardless), so deleting the function changes the failure mode (401 → connection error/404) but not the outcome — nothing that currently works will stop working. Recommend the user close/refresh any long-lived AutoPRO browser tabs to quiet this noise, but it's a courtesy, not a precondition.

**Verification Plan:**
- [ ] `get_edge_function` on both projects confirms `base44-proxy` no longer exists
- [ ] App still functions normally post-removal (re-run 15B's smoke-test pages once more, now against the fully backend-removed state)
- [ ] `git status`/`git log` confirms the `base44/` tree removal is a clean, isolated commit (nothing else touched)

---

### 15D — Full Application Regression Pass (per user instruction, after 15C)

Not a base44-specific check — a general "does everything still work" pass across the app, run specifically because 15C is the point of no return (base44-proxy and the local base44/ tree are both gone, nothing to fall back on if something unexpected broke). Scope: broad, not exhaustive — spot-check each major module rather than re-running all ~85 items from `blueprint_verification_plan.md` again.

**Task List:**
- [x] WIP/Work Orders: WO header/description edit, line-item search (Find Part) — user's manual hard-test pass, 2026-08-13; found/fixed: Find Part RPC crash, WO header description save (self-resolved, cause unconfirmed).
- [x] Inventory: Find Part search (confirms fix), QOH adjustment (confirmed live in 15B closeout — email notification path).
- [x] Customers/Vehicles: vehicle merge confirmed live in 15B closeout (direct invocation + Postgres check).
- [x] Setup/Admin: both confirmed clean in 15B's live verification, 2026-08-14.
- [x] Cash Drawer / Banking: extensively covered by user's manual hard-test pass — found/fixed: GL account dropdowns (6 files), Make Deposit mismatch-message contrast, Change Method (self-resolved, cause unconfirmed).
- [~] **Backend health-check only (agent-side, 2026-08-13)** — confirmed every Edge Function behind the 4 items below is deployed and `ACTIVE` on dev: `autopro-convertEstimateToWorkOrder` (v12), `autopro-getGLJournalData`/`autopro-getBalanceSheetData` (v5 each), `autopro-getSupplierTransactions`/`autopro-getThreeMonthAPReport` (v6/v5), plus their underlying `get_balance_sheet_data`/`get_gl_journal_data`/`get_supplier_reconcile_invoices`/`get_three_month_ap_report_data` RPCs all exist in Postgres. This rules out "undeployed/missing function" but is **not a substitute for live UI testing** — agent has no login access to `test.kensauto.ca` to click through these itself. **User confirmed 2026-08-13 these 4 still need a dedicated live pass, not yet covered by the hard-test:**
  - [ ] Estimate→WO→Invoice conversion round trip
  - [ ] Accounting: GL Journal & Balance Sheet pages
  - [ ] Suppliers/AP: search, open a supplier; Reports: open 2–3 representative reports
  - [ ] Appointments `/Schedule` UI: create/edit round trip (distinct from the reminders cron, already confirmed live 2026-08-12)

**Verification Plan:**
- [~] All of the above complete with no console errors and no unexpected behavior — **partially confirmed**, gaps listed above.
- [x] Every regression found this pass was logged and fixed (GL dropdowns, `search_work_order_parts` scalar crash, `buildWorkOrderSavePayload.js` double-encoding, Make Deposit message contrast) — none left silently noted.
- [~] One item logged but **deliberately not fixed yet**: historical `WorkOrder.line_items` data corruption (67% of dev rows) — tracked as `Pre_go-live_plan.md` P12, explicitly deferred pending a controlled-environment test of the backfill, not blocking 15D/Phase 15 closure per that item's own note.

---

### Final Verification Plan (all of 15A–15D together) — run 2026-08-13

- [x] Full-repo `base44` grep (not scoped to `src/`) returns zero hits except expected exceptions. Re-run just now, full result set: the 2 `@no-reply.base44.com` audit-string checks (`WorkOrderHeaderInfo.jsx`, `WorkOrderHistoryModal.jsx`) + `WorkOrderViewHeaderInfo.jsx`'s equivalent; the `Layout.jsx` external link; `src/lib/app-params.js` (confirmed real, in-use dependency, not base44-presence); `vite.config.js`'s one explanatory comment; ~6 native Edge Functions with base44-only-as-historical-context comments (`autopro-resendWebhook`, `autopro-sendTextReminders`, `autopro-sendAppointmentReminders`, `autopro-processCustomerARAccounting`, `autopro-suggestInventoryCategory`, `autopro-getRealTimeInventoryOnOrder`) + one migration file comment; this project's own planning/history docs (`master_blueprint.md`, `Pre_go-live_plan.md`, `Antigravity-context-plans/`, `Archive/`, etc.); `.gitignore`'s dormant `base44/.app.jsonc` rule (file doesn't exist, harmless). **One new, deliberate exception vs. the original list:** `supabase/functions/base44-proxy/index.ts` — the proxy's own source, still tracked because the deployed function itself is being deliberately kept live on production (see below). **Also found and fixed, not in the original exception list:** `package.json`/`package-lock.json` still had `"name": "base44-app"` (the project's own package name, unrelated to the SDK dependency) — renamed to `autopro-app`, `npm install` re-run to sync the lockfile.
- [x] `npm run build` clean — confirmed via a fresh build, `dist/assets` regenerated with no errors (only pre-existing, unrelated `browserslist`/`baseline-browser-mapping` staleness warnings). `@base44/sdk`/`@base44/vite-plugin` confirmed fully absent from `package.json` and `package-lock.json` (`grep -n "@base44"` — zero hits in either).
- [x] Full smoke-test pass — covered by the user's own hard-test pass (2026-08-13) across Work Orders, Inventory, Cash Drawer/Banking, plus the 4 previously-open areas (Estimate→WO→Invoice conversion, Accounting GL Journal/Balance Sheet, Suppliers/AP + Reports, Appointments `/Schedule`) all confirmed verified by the user in this same session.
- [~] `base44-proxy` confirmed deleted — **dev only.** Confirmed via `get_edge_function` returning not-found on `sitihbdnuxifwibontcm`. **Production (`hbcrwkmgsazqrvsrmxyr`) deliberately left deployed** — user's explicit decision, deferred to post-go-live (Aug 17): production is still running the base44-hybrid app being replaced that day, and the user doesn't want to risk sanitizing/removing anything there with unconfirmed dependency footprint ahead of cutover. Zero functional cost either way — confirmed via this same phase's earlier `query_logs` pull that every real call to it already 401s regardless of whether the function exists.
- [x] 15D's full regression pass green with no unresolved findings — user confirmed 2026-08-13.
- [x] `master_blueprint.md`'s Phase 15 row updated — set to `[Substantively Complete — 2026-08-13]` (not full `[Tested]`/strikethrough, matching the same precedent Phase 14's row used for a phase with one deliberately-deferred, non-blocking item) with a results summary; Tier G struck through in the coordination map; Phase 15 Verification section updated.

**Phase 15 status: substantively complete.** The only remaining action — deleting `base44-proxy` from production — is intentionally deferred, not forgotten, and re-tracked nowhere else but here and `master_blueprint.md`'s row 15 (no need to duplicate onto `Pre_go-live_plan.md`, since it's Phase 15's own scope, not a separate outstanding item).

### Handoff Context to Next Phase

There is no Phase 16 — this is the last phase in `master_blueprint.md`. The natural next step is rolling this phase's results into `master_context.md` (per this repo's established `/finalphase`-style rollup pattern) and archiving the blueprint set. **Holding off on that rollup for now** — recommend running it either once production's `base44-proxy` is actually deleted post-go-live (closing this phase fully), or whenever the user decides the deferred item no longer needs to block it. Not run in this session; flag to the user as a decision point, don't assume.

---

## 4) Phase Results and Final Context

### 15B — Executed 2026-08-14

**All planned deletions/edits done:**
- Deleted `src/api/base44Client.js`, `src/api/entities.js`, `src/api/integrations.js`
- Removed the 2 dead `@/entities/Customer`/`@/entities/Vehicle` imports from `src/pages/WorkOrders.jsx`
- Removed `@base44/sdk`/`@base44/vite-plugin` from `package.json`; `npm install` cleanly removed 15 packages (the two plus transitive deps), no other package depended on either
- Removed the `base44` plugin and `/api` dev-proxy block from `vite.config.js`
- Updated `index.html`'s `<title>` from "Base44 APP" to "AutoPRO"
- Rewired `autopro-mergeVehicles/index.ts`'s Appointment reassignment to native `supabase.from('Appointment')`; deployed to dev (v16, `ACTIVE`)
- Rewired `autopro-processQOHAdjustment/index.ts`'s system-issue email to `_shared/resend.ts`; deployed to dev (v21, `ACTIVE`)
- `npm run build`: clean (exit 0) after fixing 2 issues found only at build time — see below
- `npx eslint` on the 2 files actually touched (`WorkOrders.jsx`, `WorkPROViewModal.jsx`): zero problems related to this phase's changes; the 412 repo-wide pre-existing warnings/errors are unrelated unused-import/unused-var noise, confirmed by file-scoped lint showing none of it touches anything this phase changed
- Repo-wide grep confirms `src/` down to exactly the expected 5 files (4 confirmed false positives + `app-params.js`, now understood to be a genuine surviving dependency — see below), and `supabase/functions/` shows zero functional base44 calls outside `base44-proxy` itself (still present, scheduled for 15C)

**Two real findings, only surfaced by the actual build — both are gaps in 15A's own research, not new base44 usage:**

1. **`vite.config.js` had no explicit `@` → `src/` path alias.** `@base44/vite-plugin` was silently providing it project-wide (not just the documented `legacySDKImports` virtual-module behavior for `@/entities/*`/`@/functions/*`) — removing the plugin broke every `@/...` import in the entire app, confirmed by the very first build attempt failing on `src/main.jsx`'s unrelated `@/lib/logCollector` import. **Fixed**: added an explicit `resolve.alias` in `vite.config.js` matching `jsconfig.json`'s existing `"@/*": ["./src/*"]` mapping (that file only ever affected the editor/type-checker, never the actual Vite/Rollup bundler — a distinction 15A's research didn't catch). This is the single most consequential finding of this sub-phase: it means **every prior "confirmed zero real usage" claim in 15A that relied on `@/` imports resolving was still true, but the alias mechanism itself was never verified to survive plugin removal.**
2. **`src/lib/app-params.js` has a real second consumer 15A's research missed.** 15A asserted "confirmed via grep, nothing else imports `appParams`" — that grep was never actually run; only `base44Client.js`'s own import of it was checked. The real consumer is `src/components/work-orders/DocumentEditor.jsx`, which uses `appParams.token` to gate a `postKeepAliveFunction` mechanism — a `fetch(..., {keepalive: true})` fire-and-forget call to `${window.location.origin}/functions/<name>` used for (a) saving unsaved WO changes and (b) releasing a WO lock when the tab closes/navigates away, both gated behind `if (!body || !appParams?.token) return false`. **`app-params.js` was restored** (`git checkout`) rather than left deleted, to unblock the build without unilaterally deciding the fate of a WO-locking safety mechanism I don't have full context on. **Genuinely unresolved, needs the user's input before this can be closed:** is `appParams.token` ever actually populated in the current native/Supabase-Auth app (it reads a base44-era `access_token` URL param / `base44_access_token` localStorage key — nothing in today's auth flow appears to set either), meaning this keepalive-save/lock-release mechanism may have been silently non-functional for a while, independent of anything this phase touched? And does `/functions/<name>` even resolve to anything in the current native/Vercel deployment, or is that also a base44-era routing convention that never got ported? This needs investigation before `app-params.js`/this mechanism can be either properly removed or properly fixed — not a base44-*presence* question anymore, a base44-*era-design* question.

**One more finding, a dynamic import 15A's static-`from` grep pattern couldn't see:** `src/components/work-orders/WorkPROViewModal.jsx` had `const { Approvals } = await import('@/entities/Approvals'); await Approvals.filter({ cp_id }, '-created_date')` — the legacy base44-entity-SDK query pattern, against a table (`Approvals`) that's been fully native since Phase 13D. **Fixed**: replaced with a direct `supabase.from('Approvals').select('*').eq('cp_id', workOrder.cp_id).order('created_date', { ascending: false })`, matching the identical pattern already used in `CustomerApprovalSnapshotModal.jsx`. Confirmed via a broader dynamic-`import()` sweep that no other instances of this pattern remain.

**Lesson for any future dependency-removal pass:** a static `grep -r "from '@/x'"` is not sufficient to find every real consumer of a module — dynamic `import()` calls and the possibility that a build-tool plugin provides load-bearing config beyond its documented purpose both need an actual build attempt, not just source-reading, to fully surface. 15A's research was thorough on *what calls base44 directly*; it was not sufficient on *what silently depends on infrastructure base44's own tooling happened to also provide*.

### 15B Live Verification — 2026-08-14, at `test.kensauto.ca` (post commit/push)

User committed and pushed 15B (`47833e50 "15B"`, confirmed matching `origin/development`), unblocking live testing per `master_context.md` §3.

- [x] App loads at `test.kensauto.ca` — title correctly shows "AutoPRO" (confirms the `index.html` fix deployed), WIP list rendered with full real data, Supabase WebSocket connected, zero console errors
- [x] `/Setup` loads clean, zero console errors
- [x] `/Admin` loads clean, zero console errors
- [x] "System" audit-display regression check — opened a real historical WO (`RO50012`, `created_by` = a real `@no-reply.base44.com` address) — header correctly shows "Created By: System", confirming `WorkOrderHeaderInfo.jsx`'s preserved string-check still works
- [x] **`autopro-mergeVehicles` fix confirmed live**: created 2 disposable test vehicles + 1 appointment on the duplicate, invoked the deployed function directly with the logged-in session's real JWT — response: `mergedCount: {appointments: 1, workOrders: 0}`. Confirmed in Postgres: the appointment's `vehicle_id` actually reassigned to the master. **Before this fix, `appointments` would always have been 0** (the old base44 call silently failed every time — this is a genuine behavior fix, not just a dependency swap). Test data cleaned up.
- [x] **`autopro-processQOHAdjustment` fix — response confirmed, email delivery now confirmed**: invoked directly against a real inventory item (`11579`) with `new_quantity_on_hand` set to its current value (zero-change, to avoid touching real GL/audit data unnecessarily) and `system_issue: true` — response: `200 {success: true, gl_posted: false, value_change: 0}`, no error. `query_logs` could not independently confirm the send (Supabase-side tool errors, not retried further per the tool's own guidance), but **the user has now directly confirmed the notification email landed** — this closes the one item left open after 15B's initial live verification.

### 15B — Closeout — 2026-08-13

**Sub-phase status: [Tested], 100% complete.** Both verification checklists (post-build and post-deploy live-verification) are now fully green — the last open item (QOH notification email delivery) is confirmed above.

**What actually happened vs. what was planned — exact files touched:**

*Deleted outright, as planned:*
- `src/api/base44Client.js`, `src/api/entities.js`, `src/api/integrations.js`

*Modified, as planned:*
- `src/pages/WorkOrders.jsx` — removed the 2 dead `@/entities/Customer` / `@/entities/Vehicle` imports
- `package.json` (+ regenerated `package-lock.json` via `npm install`, −15 packages: the 2 direct deps + transitive) — removed `@base44/sdk`, `@base44/vite-plugin`
- `vite.config.js` — removed the `base44` plugin registration and the dev-only `/api` proxy block
- `index.html` — `<title>` changed "Base44 APP" → "AutoPRO"
- `supabase/functions/autopro-mergeVehicles/index.ts` — Appointment reassignment rewired to native `supabase.from('Appointment').update()`; response shape (`mergedCount: {workOrders, appointments}`) unchanged, deployed to dev (v16, `ACTIVE`)
- `supabase/functions/autopro-processQOHAdjustment/index.ts` — system-issue notification rewired to `_shared/resend.ts`'s `sendViaResend`; same recipient/subject/body/fire-and-forget behavior, deployed to dev (v21, `ACTIVE`)

*Modified, NOT planned (surfaced only during execution — see Deviations below):*
- `vite.config.js` — also gained an explicit `resolve.alias` (`@` → `./src`), not in the original diff
- `src/components/work-orders/WorkPROViewModal.jsx` — dynamic `import('@/entities/Approvals')` + `Approvals.filter()` rewired to `supabase.from('Approvals').select('*').eq('cp_id', workOrder.cp_id).order('created_date', {ascending: false})`, matching `CustomerApprovalSnapshotModal.jsx`'s existing pattern

*Planned for deletion, restored instead:*
- `src/lib/app-params.js` — plan called for outright deletion (single consumer assumed); execution found a real second consumer and restored the file (see Deviations)

**No schema or API changes.** Both rewired Edge Functions keep their original response shapes and error-handling semantics — this was a transport swap (base44 → native Supabase / native Resend), not a contract change.

**Deviations, unexpected edge cases, and fixes applied:**

1. **Missing `@` path alias.** `@base44/vite-plugin` was silently providing the project-wide `@` → `src/` alias in addition to its documented `legacySDKImports` virtual-module behavior. Removing the plugin broke every `@/...` import app-wide — surfaced immediately by the first `npm run build` failing on `src/main.jsx`. **Fix:** added an explicit `resolve.alias` in `vite.config.js` matching `jsconfig.json`'s existing `"@/*": ["./src/*"]` mapping (that file only ever drove the editor/type-checker, never the actual bundler — 15A's research didn't catch this distinction).
2. **`app-params.js` has a real second consumer 15A's research missed.** 15A's claim ("confirmed via grep, nothing else imports `appParams`") turns out to have only checked `base44Client.js`'s own import, not run an actual repo-wide grep. Real consumer: `src/components/work-orders/DocumentEditor.jsx`, which gates a `postKeepAliveFunction` (`fetch(..., {keepalive:true})` used for unsaved-WO-change saves and WO-lock release on tab close) behind `appParams?.token`. **Fix:** restored the file via `git checkout` rather than unilaterally deciding the fate of a WO-locking safety mechanism — see Out-of-scope below.
3. **Dynamic `import()` invisible to static grep.** `WorkPROViewModal.jsx`'s `await import('@/entities/Approvals')` + `.filter()` call — the legacy base44-entity-SDK query pattern — against a table (`Approvals`) that's been fully native since Phase 13D. Found only via a manual dynamic-import sweep after the build succeeded but before live testing. **Fix:** direct `supabase.from('Approvals')` query, as above. Swept for other instances — none found.

**Out-of-scope items deferred (explicitly NOT part of 15C/15D):**
- **Whether `appParams.token` is ever actually populated in the current native/Supabase-Auth flow.** It reads a base44-era `access_token` URL param / `base44_access_token` localStorage key — nothing in today's auth flow appears to set either, which would mean `DocumentEditor.jsx`'s keepalive-save/lock-release mechanism may have been silently non-functional for a while, independent of anything this phase touched. **Not investigated, not resolved.**
- **Whether `/functions/<name>` (the keepalive fetch target) resolves to anything in the current native/Vercel deployment**, or is itself a dead base44-era routing convention. **Not investigated, not resolved.**
- These are base44-*era-design* questions, not base44-*presence* questions — `app-params.js` is confirmed to still be a real, in-use dependency and must **not** be touched by 15C's deletion scope. Recommend a separate, dedicated investigation after Phase 15 closes, not folded into 15C/15D.

**Key assumptions — VERIFIED vs. ASSUMED:**

*VERIFIED (direct evidence obtained):*
- 15A's "8 files / 4 real, 4 false-positive" split — accurate, with the one correction that `app-params.js` needed restoration rather than deletion.
- `autopro-mergeVehicles` fix — confirmed live: direct invocation + Postgres check showed the appointment's `vehicle_id` actually reassigned (previously always silently failed under base44).
- `autopro-processQOHAdjustment` fix — confirmed live: response verified directly, and the notification email's actual delivery to `tyler@kensauto.ca` is now confirmed by the user (this closeout's trigger).
- The two preserved `@no-reply.base44.com` audit-string checks — verified live against a real historical WO (`RO50012`): header correctly shows "Created By: System".
- `npm run build` clean; `npm install` removed exactly the 2 direct deps + 13 transitive, confirming no other installed package depended on either.
- App loads cleanly at `test.kensauto.ca` post-deploy: correct title, zero console errors, `/Setup` and `/Admin` both clean.

*ASSUMED (carried forward as risk into 15C, not independently re-verified):*
- No other dynamic-`import()` base44-entity patterns exist beyond the one found in `WorkPROViewModal.jsx` — based on one manual sweep after the fact, not an exhaustive/automated check.
- Production Supabase branch (`hbcrwkmgsazqrvsrmxyr`) behaves identically to dev for `base44-proxy` deletion safety — based on the `VITE_BASE44_PROXY_URL`-hardcoded-to-production reasoning in Section 2, not independently re-confirmed at execution time.
- `base44-proxy` has zero live production traffic — based on the "no code calls it" static finding; 15A's own task list included pulling production invocation logs as corroborating evidence, and that was never confirmed done or available.

**Exact starting steps carried forward into 15C:**
1. 15B is confirmed deployed and live (commit `47833e50` "15B", pushed, matching `origin/development`, live-verified at `test.kensauto.ca`) — 15C's own precondition ("confirm 15B is deployed and live before proceeding") is satisfied; re-confirm at 15C's execution start regardless, per this project's standing precedent of never trusting a prior session's classification at face value.
2. Delete `base44-proxy` Edge Function from dev (`sitihbdnuxifwibontcm`) first, confirm via `get_edge_function`.
3. Delete `base44-proxy` Edge Function from production (`hbcrwkmgsazqrvsrmxyr`), confirm via `get_edge_function`.
4. Hard-delete the local `base44/functions/` source tree (~130 directories).
5. Update `Pre_go-live_plan.md`'s P10 entry to point at Phase 15's resolution.
6. **Do not touch `src/lib/app-params.js`** as part of 15C — confirmed a real, currently-used dependency (`DocumentEditor.jsx`), not base44-related dead code. Its fate is the separate, deferred question above — out of scope for 15C.

**Not yet done:**
- 15C, 15D, and Final Verification are all still fully pending, not started

### 15C — Started 2026-08-13 (partial, blocked on a manual step)

**What actually happened vs. plan:**
- **Local `base44/functions/` tree**: done as planned — `git rm -r base44/functions` staged 129 file deletions across the whole tree. **Not committed** (agent doesn't commit/push per standing project rule — staged locally, ready for the user's own commit via GitHub Desktop). **Not deleted, and out of scope for 15C**: `base44/entities/` (28 `.jsonc` files), `base44/connectors/` (3 `.jsonc` files), and `base44/config.jsonc` — these are separate parts of the same base44-platform-tooling directory but were never named in this plan's 15C scope (which specifically says `base44/functions/`, matching the ~130-directory estimate). Flagging as a likely follow-up cleanup, not actioned unilaterally.
- **`Pre_go-live_plan.md` P10**: updated as planned — struck through and marked resolved-via-15B with a cross-reference.
- **`base44-proxy` deletion (dev + production): not done.** Plan assumed a Supabase MCP tool could do this; none exists (`deploy_edge_function` only creates/updates, there is no delete/remove tool in this session's toolset, and this session has no other route to the Supabase Management API). This is a genuine plan gap, not a permissions block. **Unblock: a 2-minute manual action in the Supabase Dashboard** (Edge Functions → `base44-proxy` → Delete), dev project first (`sitihbdnuxifwibontcm`), then production (`hbcrwkmgsazqrvsrmxyr`) — no install, no CLI needed, matching this project's standing preference for no-install fixes.

**Deviation / unexpected finding:** 15A's "no code calls `base44-proxy`, zero live traffic" conclusion is **not fully accurate** — a direct `query_logs` pull against production just now shows real, repeated, currently-ongoing traffic (`analytics/track/batch`, `entities/User/me`, every 401), spanning the ~10 hours before this check. Root-caused to the base44 SDK's own background telemetry heartbeat, most likely firing from a browser tab that loaded the app before 15B's deploy and has stayed open/idle since (no service worker exists in this app to explain it surviving a closed tab — confirmed via `src/main.jsx`). **Does not block deletion**: every one of these calls already 401s today regardless (per `master_context.md`'s existing root-cause note on `base44-proxy`'s auth mismatch) — deleting the function only changes the failure mode, not the outcome. Recommend the user close any long-open AutoPRO tabs, but not a hard precondition.

**Key assumption correction, VERIFIED vs. ASSUMED:**
- ASSUMED (15A) → now VERIFIED-WRONG: "no live traffic to `base44-proxy`." Corrected above — traffic exists, but is confirmed harmless/already-failing.
- VERIFIED (this session): both `base44-proxy` deployments (dev v19, prod v44) still `ACTIVE` immediately before this note — nothing has removed them yet, so the plan's remaining steps are still fully valid and unexecuted, not silently stale.

**Exact next steps (resume point for a fresh session or after the user's manual action):**
1. User deletes `base44-proxy` via the Supabase Dashboard on **dev** (`sitihbdnuxifwibontcm`) first, then **production** (`hbcrwkmgsazqrvsrmxyr`).
2. Confirm both deletions via `get_edge_function` (expect a not-found/error result on each project).
3. User commits + pushes the currently-staged `base44/functions/` deletion (129 files, already `git rm`'d, sitting in the working tree uncommitted).
4. Re-run this doc's 15C Verification Plan (both projects confirmed function-free; app still functions normally — re-run 15B's smoke-test pages once more against the fully backend-removed state; `git status`/`git log` confirms the tree removal is a clean, isolated commit).
5. Then proceed to 15D (full regression pass) — do not start 15D until step 4 is fully green, per this plan's own point-of-no-return framing for 15C.
