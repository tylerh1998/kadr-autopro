# Phase 4 Follow-Up Plan: Closing Out-of-Scope Items

**Status:** Executed — 3C (code) and 3B (verified) complete; 3A's dev-branch migration applied and verified, production step deliberately on hold pending explicit go-ahead (user said "not yet, I'll say when" on 2026-08-03). 3C's live UI click-through still needs a deploy (push/build) before it can be fully confirmed in the browser — code review + matching an already-proven pattern (`TechDirectory.jsx`) is the current level of confidence.
**Parent:** `master_blueprint.md`, Phase 4 (`phase_4_implementation_plan.md`).
**Type:** Small, low-complexity follow-up (not a new numbered blueprint phase) — addresses three items Phase 4 explicitly deferred or surfaced as gaps during its own execution/verification.

---

## 1) Overview & Goals

Phase 4 (WorkPRO / Tech-Time Integration Rewire) shipped and was marked Tested, but its own verification pass and lessons log flagged three loose ends that were correctly left out of Phase 4's scope at the time but were never assigned anywhere else in the blueprint's roadmap:

1. **`Employee.pay_rate` is `bigint`, not numeric** — a pre-existing schema gap (not introduced by Phase 4) that silently breaks any decimal pay rate. Confirmed live via direct schema query (see Section 2) still present on both environments today.
2. **`InvoiceConversion.jsx`'s repoint to `autopro-archiveWorkOrderProjects`** was code-reviewed and the Edge Function itself was verified via direct invocation, but the actual UI trigger (converting a real work order to invoice) was never live-clicked end-to-end. **Revised during planning:** `InvoiceConversion.jsx` itself is still base44-routed (`WorkOrder`/`SystemSettings` from `@/entities/all`, plus a direct `base44.functions.invoke('createPortalSnapshot', ...)` at lines 2, 9, 75, 261) — confirmed live-reading the file. A `/dev-login` session can't get past those calls, and this page isn't a migrated feature yet, so a full click-through would only be possible against production, which the blueprint's own standing rule says not to write-test pre-migration. Verification is being done via direct backend invocation instead — see Section 3B.
3. **`TechClockStatusModal.jsx` is still base44-routed** (`Employee.filter()` via the legacy `@base44/vite-plugin` shim, confirmed still wired in `vite.config.js` — see Section 2) and doesn't appear in any later phase's impacted-files list, including Phase 13 (Work Orders Core), even though it's the parent of the already-migrated `GlobalClockInModal.jsx`. Left unaddressed, it would still be silently missed when Phase 13 executes.

**Goal:** Close all three items so nothing from Phase 4 is left as an untracked gap before Phase 5+ proceeds, without re-opening Phase 4 itself or expanding scope beyond what was already flagged.

**Explicitly not in scope:** Any other Phase 5+ work; Payroll's own schema design (Phase 11) — this plan only fixes the specific pre-existing `pay_rate` type gap, not payroll processing itself.

---

## 2) Schemas Fetched (live-validated, both environments)

Queried directly via the Supabase connector against production (`hbcrwkmgsazqrvsrmxyr`) and the persistent dev branch (`sitihbdnuxifwibontcm`) immediately before drafting this plan:

| Table.Column | Production | Dev branch | Notes |
|---|---|---|---|
| `Employee.pay_rate` | `bigint`, nullable, no default | `bigint`, nullable, no default | Identical on both — confirms this isn't a dev-only drift, it's the real production schema. |
| `Employee` row count / decimal rate check | 9 total rows, **0** currently hold a fractional value | — | Safe to convert type with zero data-loss risk today — no existing row will be altered/truncated by a `bigint → numeric` cast. |
| `Project.status` | `text` | (same table, shared schema pattern) | Matches what `autopro-archiveWorkOrderProjects` writes. |
| `Project.date_archived` | `text` (stores a `YYYY-MM-DD` string, not a real date/timestamp type) | — | Matches the function's `Intl.DateTimeFormat` string output — confirmed no type mismatch. |
| `Project.updated_date` | `timestamptz` | — | Matches the function's `new Date().toISOString()` write. |

Also read `supabase/functions/autopro-archiveWorkOrderProjects/index.ts` in full: it looks up `Project` rows by `work_order = wo_number`, `status != 'archived'`, and sets `status: 'archived'`, `date_archived`, `updated_date` — field names and types match the live schema above, so the function itself is confirmed correct. The only unverified piece is the UI trigger path in `InvoiceConversion.jsx:214-218`, which fires this function on a `.catch()`-only (non-blocking) basis after saving the work order.

Also confirmed the `TechClockStatusModal.jsx` finding is still current, not stale: `vite.config.js` still has `@base44/vite-plugin`'s `legacySDKImports: true` active, and `TechClockStatusModal.jsx:5` still imports `Employee` from `@/entities/all` — a virtual path only that plugin resolves, to the real base44 SDK entity. `TechClockStatusModal.jsx` does **not** appear in Phase 13's impacted-files list in `master_blueprint.md`.

Also confirmed, live on production, that `WorkOrder.wo_number` and `Project.work_order` correlate as identical strings — e.g. `wo_number: "WO51505"` ↔ `work_order: "WO51505"` (sample of 5 joined rows, all matching, all already `status: 'archived'` from real historical usage). This is the exact value `InvoiceConversion.jsx:215` sends as `wo_number` to the Edge Function, so the field-format match that Phase 4's direct-invocation test didn't explicitly prove is now confirmed correct.

---

## 3) Proposed Changes

### 3A — `Employee.pay_rate`: bigint → numeric

- Migration: `ALTER TABLE public."Employee" ALTER COLUMN pay_rate TYPE numeric(10,2) USING pay_rate::numeric(10,2);`
- Apply to the **dev branch first**, validate, then apply the identical migration to **production** (your explicit go-ahead required before the production step, per standing practice).
- No frontend code change needed — every existing call site already sends/reads `pay_rate` as a plain JS number; the type change is transparent to `TechDirectory.jsx` and any payroll-adjacent code that reads it.

### 3B — `InvoiceConversion.jsx` verification via direct backend invocation (revised)

- No code change — this is a verification-only task, and no live UI click-through this time (see the revision note in Section 1 — `InvoiceConversion.jsx` is still base44-routed end-to-end, so `/dev-login` can't reach the point where it would fire `archiveWorkOrderProjects`, and this page shouldn't be write-tested against production since it isn't a migrated feature yet).
- Instead: seed a small test `Project` row on the dev branch with `work_order` set to a real-looking `wo_number` value (format confirmed above, e.g. `"WO99999"`, `status` anything other than `'archived'`), then invoke `supabase.functions.invoke('autopro-archiveWorkOrderProjects', { body: { wo_number: 'WO99999' } })` directly — the exact same call shape `InvoiceConversion.jsx:214-218` makes, just triggered from the backend instead of through the page.
- This is effectively a repeat of the direct-invocation test Phase 4 already ran, but scoped specifically to the call-site's real parameter shape (`wo.wo_number`) rather than a generic test value — combined with the live field-format confirmation in Section 2, this closes the gap without needing the page itself to load under a test session.
- If this surfaces a real bug, fix it as a small, scoped patch to the Edge Function or the call site — not expected, given both the function logic and the field-format match are now independently confirmed.

### 3C — Migrate `TechClockStatusModal.jsx` off base44

- Replace `import { Employee } from '@/entities/all'` + `Employee.filter({ employee_type: 'tech' })` (line 5, 50) with a direct `supabase.from('Employee').select('*').eq('employee_type', 'tech')` call, matching the pattern already used by `AuthContext.jsx` and `TechDirectory.jsx` (both already-native precedents from Phase 3/4).
- No other logic in the file changes — `TimeRecord`/`ProjectTimeSession`/`Project` reads are already direct `supabase.from()` calls (confirmed reading the current file).
- This unblocks the previously-noted verification gap: `GlobalClockInModal.jsx` becomes reachable through its real parent via full UI click-through, not just direct-query replication.
- Update `master_blueprint.md` to add `TechClockStatusModal.jsx` explicitly to Phase 13's impacted-files list is **not needed** once this lands — the fix happens here instead, closing the gap rather than deferring it further.

**No new Edge Functions are needed for any of the three items** — all three are either a column-type migration, a verification-only pass, or a direct-table-read swap using the existing native `Employee` table.

---

## 4) Impact / Risk Assessment

| Item | Impact | Likelihood | Mitigation |
|---|---|---|---|
| 3A schema change | Low — 0 rows currently affected, type widens precision rather than narrowing it | Low | Validate on dev branch first; re-run the 9-row count/decimal check post-migration on both environments to confirm no row was altered unexpectedly. |
| 3A production timing | Medium if rushed — production data change | Low | Explicit confirmation gate before the production `ALTER TABLE` step (per standing practice: no production writes without your go-ahead). |
| 3B verification | Very low — a seeded throwaway `Project` row on the dev branch, direct function invocation only, no page load, no production write | Low | Clean up the seeded test row after verification; field-format match already confirmed live against production (read-only) in Section 2. |
| 3C code swap | Low — same table, same filter, already-proven pattern elsewhere in this exact codebase | Low | RLS on `Employee` already permissive for this exact query shape (proven by `AuthContext.jsx`/`TechDirectory.jsx`); regression-test the tech list and both clock-in modals after the swap. |
| Cross-item | None — the three items touch disjoint files/systems (DB column, one page's function-call verification, one modal's data source) | N/A | Safe to execute independently or in any order; no file-overlap risk between them or with any in-flight Phase 5+ work. |

---

## 5) Roadmap & Time Estimate

Small enough to run as one session, but naturally splits into three independent, individually-testable steps — sequenced by risk (lowest/most isolated first):

| Step | Item | Est. Time | Depends on |
|---|---|---|---|
| 1 | 3C — Migrate `TechClockStatusModal.jsx` off base44 | ~20–30 min | None |
| 2 | 3B — Direct backend invocation of `autopro-archiveWorkOrderProjects` against a seeded test `Project` row (dev branch) | ~10–15 min | None (can run before or after Step 1) |
| 3 | 3A — `Employee.pay_rate` schema migration (dev, then production) | ~20–30 min | None, but do last since it's the only one touching production |
| **Total** | | **~1 focused session (~1 hour)** | |

No need to split across multiple sessions/days — each step is independently testable and low-risk, but test after each step before moving to the next rather than batching all three changes together.

---

## 6) Verification & Testing Plan

**Step 1 (3C) verification:**
- Repo-wide grep confirms `TechClockStatusModal.jsx` no longer imports from `@/entities/all`.
- Via `/dev-login`, open the Tech Clock Status modal: tech list populates identically to before (same 9 employees, `employee_type='tech'` filter still correct).
- Click a `clocked_out` tech → `GlobalClockInModal` opens and a real clock-in can be completed end-to-end via the UI (previously only verifiable via direct query replication per Phase 4's lessons log) — confirm the resulting `TimeRecord` row lands in the dev branch.
- Click a tech with an active project session → `TechProjectClockInModal` still opens correctly (regression check, unchanged code path).

**Step 2 (3B) verification:**
- On the dev branch, insert a throwaway `Project` row with `work_order` set to a test `wo_number`-formatted value (e.g. `"WO99999"`) and `status` not `'archived'`.
- Invoke `autopro-archiveWorkOrderProjects` directly via the Supabase connector with `{ wo_number: "WO99999" }` — the exact param shape `InvoiceConversion.jsx` sends.
- Confirm the response is `{ success: true, ... }` and the seeded row now shows `status='archived'`, `date_archived` set to today (`America/Edmonton`), `updated_date` updated.
- Delete the seeded test row afterward.

**Step 3 (3A) verification:**
- On the dev branch: run the `ALTER TABLE` migration, then re-run the 9-row/decimal-check query to confirm all 9 rows survived with correct values.
- Live-test via `TechDirectory.jsx`: edit a technician's pay rate to a decimal value (e.g. `27.50`) and confirm it saves without the previous `22P02` error.
- Once dev is confirmed clean, get your go-ahead, then apply the identical migration to production and re-run the same row-count/decimal-check query there (no UI write-test needed on production — schema-only change, already proven safe on dev with identical data shape).

**Overall sign-off gate:** all three steps confirmed independently; update `master_blueprint.md` Section 7 (Lessons Learned) to note these three Phase 4 gaps are now closed, so they aren't re-flagged during Phase 13 or Phase 11 planning.

---

## 7) Execution Log (2026-08-03)

- **3C:** Code changed — `TechClockStatusModal.jsx` now uses `supabase.from('Employee').select('*').eq('employee_type', 'tech')` in place of the base44-routed `Employee.filter()`. Confirmed dev branch RLS on `Employee` is fully permissive (`ALL` for `public`, `qual: true`), same policy `TechDirectory.jsx` already relies on successfully. **Not live-click-tested** — attempted via `/dev-login` on `test.kensauto.ca`, but the deployed bundle still runs the pre-edit code (no push/deploy has happened), so the modal still 401'd against base44 as expected for the *old* build. Needs a deploy, then a click-through re-test, to move from "code-reviewed + pattern-matched" to "live-confirmed."
- **3B:** Fully verified. Seeded a throwaway `Project` row (`id: 'test-3b-verify-001'`, `work_order: 'WO99999'`, `status: 'active'`) on the dev branch, invoked `autopro-archiveWorkOrderProjects` directly via HTTPS with the dev branch's anon key and the exact `{ wo_number: 'WO99999' }` body shape `InvoiceConversion.jsx` sends. Response: `{"success":true,"total_found":1,"archived_count":1,"date_archived":"2026-08-03"}`. Confirmed via direct query the row now shows `status='archived'`, `date_archived='2026-08-03'`, `updated_date` bumped. Test row deleted afterward.
- **3A:** Dev branch migration applied (`ALTER TABLE public."Employee" ALTER COLUMN pay_rate TYPE numeric(10,2) USING pay_rate::numeric(10,2)`). Verified: column is now `numeric(10,2)`; all 9 `Employee` rows survived (6 non-null `pay_rate` values, matching pre-migration count). Live-tested via a direct PostgREST `PATCH` (same write path the app uses) on a dev-only seeded test employee (`id: 9999999`, "Ryley Bates"): set `pay_rate: 27.50`, succeeded (previously would have thrown `22P02`), then reverted back to the original `35.00`. **Production step explicitly held** — asked the user directly; response was "Not yet — I'll say when." No production schema change has been made. Re-open this item and re-run the identical migration + row-count verification on production (`hbcrwkmgsazqrvsrmxyr`) once given the go-ahead.
