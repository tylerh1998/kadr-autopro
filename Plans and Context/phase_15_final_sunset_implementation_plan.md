# Phase 15 Implementation Plan: Final Sunset (`@base44/sdk` / `@base44/vite-plugin` / `base44-proxy` / `base44/` tree removal)

**Status:** DRAFT — awaiting approval. No code changes made yet.

**Parent:** `master_blueprint.md`, Phase 15 row (Tier G, `[Pending]`): "Last phase. Only after: (1) the separate final-validation/blueprint-verify pass confirms every phase's features are functional and tested, (2) a repo-wide `base44` grep across all of `src/` returns zero hits. Deletes `@base44/sdk`, `@base44/vite-plugin`, `base44-proxy`, and the `base44/` source tree."

**Gate 1 status:** ✅ Satisfied. `blueprint_verification_plan.md` Section 3 closed 2026-08-14 — all ~85 test items, including every comms-gated flow, passed.

**Gate 2 status:** ❌ Not yet satisfied — this plan closes it. 8 files in `src/` currently match a `base44` grep; research below shows only 4 are real dependencies, the other 4 are false positives that should be **left alone**, not removed.

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
| 15B | Pending | Frontend dependency removal + 2 function rewires (`autopro-mergeVehicles`, `autopro-processQOHAdjustment`) — delete the SDK wrapper files, dead imports, `package.json`/`vite.config.js` cleanup, `index.html` title; build-verify |
| 15C | Pending | Backend/infra removal — delete `base44-proxy` (dev + prod), hard-delete the local `base44/` source tree |
| 15D | Pending | Full application regression pass (per user instruction) — broad spot-check across every major module, specifically because 15C is the point of no return |
| Final | Pending | Full-repo grep, build/smoke-test, roll learnings into `master_context.md`/`master_blueprint.md` |

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
- [ ] Confirm 15B is deployed and live before proceeding
- [ ] Delete `base44-proxy` from dev, confirm via `get_edge_function` (expect a "not found"/removed result)
- [ ] Delete `base44-proxy` from production, confirm via `get_edge_function`
- [ ] Hard-delete the local `base44/functions/` tree
- [ ] Update `Pre_go-live_plan.md`'s P10 entry to point at this phase's resolution

**Verification Plan:**
- [ ] `get_edge_function` on both projects confirms `base44-proxy` no longer exists
- [ ] App still functions normally post-removal (re-run 15B's smoke-test pages once more, now against the fully backend-removed state)
- [ ] `git status`/`git log` confirms the `base44/` tree removal is a clean, isolated commit (nothing else touched)

---

### 15D — Full Application Regression Pass (per user instruction, after 15C)

Not a base44-specific check — a general "does everything still work" pass across the app, run specifically because 15C is the point of no return (base44-proxy and the local base44/ tree are both gone, nothing to fall back on if something unexpected broke). Scope: broad, not exhaustive — spot-check each major module rather than re-running all ~85 items from `blueprint_verification_plan.md` again.

**Task List:**
- [ ] WIP/Work Orders: create, add a line item, convert Estimate→WO→Invoice
- [ ] Inventory: search, add a part, adjust QOH (confirms 15B's rewired notification path under real usage, not just the disposable-data test)
- [ ] Customers/Vehicles: search, merge two disposable records (confirms 15B's rewired Appointment-reassignment path under real usage)
- [ ] Accounting: GL Journal loads, Balance Sheet loads
- [ ] Suppliers/AP: search, open a supplier
- [ ] Appointments: `/Schedule` loads, create/edit round trip
- [ ] Reports: open 2–3 representative reports
- [ ] Setup/Admin: both load cleanly

**Verification Plan:**
- [ ] All of the above complete with no console errors and no unexpected behavior
- [ ] Any regression found gets logged in Section 4 below and fixed before considering Phase 15 closed — do not silently note and move on

---

### Final Verification Plan (all of 15A–15D together)

- [ ] Full-repo `base44` grep (not scoped to `src/`) returns zero hits except: the 2 `@no-reply.base44.com` audit-string checks, the `Layout.jsx` external link, and this project's own planning/history docs (`master_blueprint.md`, `Pre_go-live_plan.md`, etc. — those are expected to mention base44 historically and are not code)
- [ ] `npm run build` clean with `@base44/sdk`/`@base44/vite-plugin` fully absent from `package.json`
- [ ] Full smoke-test pass: log in, load every top-level nav page once, confirm no console errors
- [ ] `base44-proxy` confirmed deleted on both Supabase projects
- [ ] 15D's full regression pass green with no unresolved findings
- [ ] `master_blueprint.md`'s Phase 15 row flipped from `[Pending]` to `[Tested]`/complete, with a short results summary matching every other completed phase's row format

### Handoff Context to Next Phase

There is no Phase 16 — this is the last phase in `master_blueprint.md`. On completion, the natural next step is rolling this phase's results into `master_context.md` (per this repo's established `/finalphase`-style rollup pattern) and archiving the blueprint set, which is what triggered this plan being requested in the first place. Recommend running that rollup once 15D's checklist is fully green, not before.

---

## 4) Phase Results and Final Context

*(Empty — filled in as each sub-phase executes.)*
