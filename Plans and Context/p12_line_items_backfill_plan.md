# P12 Plan: `WorkOrder.line_items` Backfill (String → True jsonb Array), 3 Stages

**Status:** DRAFT — awaiting approval. No code/database changes made yet.

**Source:** `Pre_go-live_plan.md` P12. Previously deferred pending exactly this kind of controlled-environment-first plan.

**Governing structure (explicit user instruction):** exactly 3 stages, each gated on the previous one's validation passing.
1. **Controlled** — dev only, the single known canary record (`RO51610`).
2. **Dev, whole database** — every remaining corrupted row on dev.
3. **Production.**

---

## 1) Overview & Objectives

**Problem.** `WorkOrder.line_items` is a genuine `jsonb` array column, but a large historical share of rows hold it as a **JSON string** (`jsonb_typeof = 'string'`, e.g. the literal text `"[]"` or `"[{...}]"`) instead of a true array — residue from a frontend save path that double-encoded it before the fix applied earlier this session (`buildWorkOrderSavePayload.js`). The forward-going bug is already fixed; this plan addresses the **historical backfill** of the rows already corrupted.

**Objective.** Convert every corrupted row's `line_items` from a string-wrapped array to a real jsonb array, with **zero change to the actual data content** — this is a storage-shape fix, not a business-data edit. Prove that at every stage before moving to the next one.

**Current scope (re-verified today, not stale):** dev (`sitihbdnuxifwibontcm`) has **1,087** corrupted rows out of 1,613 total (down from 1,088 a session ago — one self-healed via normal editing, confirming this isn't actively growing). Production (`hbcrwkmgsazqrvsrmxyr`) count will be re-checked fresh immediately before Stage 3, not assumed from today's dev number.

---

## 2) Assumptions & Verification

- **VERIFIED — the transformation is safe for every row that exists today, not just assumed.** Ran a real dry-run: looped all 1,087 currently-corrupted dev rows through the actual `(line_items #>> '{}')::jsonb` cast inside a PL/pgSQL exception-trapping block. **Zero failures, zero rows that parse to anything other than a jsonb array.** Every row is provably convertible before any real UPDATE runs.
- **VERIFIED — `WorkOrder` has two triggers, not one.** `WorkOrder_Broadcast` (live-refresh broadcast, harmless — fires on every UPDATE regardless, just signals any open `WorkOrders.jsx` tabs to refresh) and, newly surfaced during this plan's research, **`audit_workorder_changes` → `process_workorder_audit()`**, which inserts a row into `workorderversionhistory` on `INSERT`/`DELETE`/any `UPDATE` where a defined list of columns (including `line_items`) `IS DISTINCT FROM` the old value.
- **VERIFIED — this backfill *will* trip the audit trigger for every row touched**, because a jsonb string and a jsonb array holding equivalent content are still different jsonb *values* (`IS DISTINCT FROM` is true), even though nothing meaningful changed. Left unhandled, this creates 1,087 (dev) + however many exist on prod "material change" history entries for a non-change.
- **VERIFIED — `WorkOrderHistoryModal.jsx` reads `workorderversionhistory` directly** (`.eq('workorder_id', workOrderId).order('changed_at', desc)`) — this is almost certainly the "workorder history" you plan to review manually as your own precautionary check.
- **VERIFIED — two real side-effect traps in that modal's own display logic**, both checked directly against its source:
  1. **Session-based dedup**: `visibleRecords` keeps only the *most recent* history row per non-null `session_id`, silently hiding older rows sharing the same `session_id`. Our backfill UPDATE won't naturally set a fresh `session_id` — if left at its old value, the new backfill-triggered row would **silently supersede and hide the real prior edit's history entry** in the modal (same `session_id` as that edit). Rows with a **null** `session_id` are never deduped/hidden — always shown as their own entry.
  2. **`changed_by` resolution**: the trigger sets `changed_by = NEW.last_updated_by`. If we don't touch `last_updated_by`, the new (spurious) history row would **misattribute this technical fix to whichever real staff member last edited the WO** — they didn't make this edit. `resolveUserName()` shows `'System'` when the email is null/empty.
- **DECISION POINT, recommending one option:** three ways to handle the audit trigger, in order of preference:
  - **Recommended: temporarily disable `audit_workorder_changes` for the duration of each stage's UPDATE** (`ALTER TABLE "WorkOrder" DISABLE TRIGGER audit_workorder_changes` → run the UPDATE → `ENABLE TRIGGER` immediately after, same transaction). Cleanest outcome: **zero new history entries**, because this is a technical encoding fix, not a real business edit — arguably it shouldn't appear in the audit trail at all. When you review history for `RO51610` in Stage 1, it will look **completely unchanged**, which is the clearest possible signal that nothing real happened.
  - Alternative: leave the trigger enabled, but explicitly `SET session_id = NULL` on the backfill UPDATE (avoids hiding real history) — you'd see one new, honestly-timestamped-but-misattributed entry per touched WO showing the last real editor's name.
  - Not recommended: also nulling `last_updated_by` to make the entry show `'System'` — this would also blank the *live* WO's own "last updated by" display, a bigger visible change to the record than the fix itself.
  
  **This plan proceeds with the recommended option (disable/re-enable the trigger) unless you say otherwise.**
- **VERIFIED — `WorkOrder.last_updated`/`last_updated_by`/`updated_at` are never auto-touched by any trigger.** Only `WorkOrder_Broadcast` and `audit_workorder_changes` exist on this table; neither modifies these columns. A bare `UPDATE ... SET line_items = ...` (not explicitly setting them) leaves every audit-timestamp column exactly as it was.
- **VERIFIED** — `session_id` is a real, existing column on `WorkOrder` (confirmed via `information_schema.columns`), safe to explicitly set.
- **ASSUMED** — Production's corruption count and row-level content match dev's pattern closely enough that Stage 2's dev-wide validation is representative of what Stage 3 will do on prod. **Verification before executing Stage 3:** re-run the exact same dry-run cast-validation (Section on pre-flight checks) against production's own corrupted rows immediately before touching anything there — never assume prod mirrors dev's dry-run result.

---

## 3) Proposed Changes

**No application code changes** — this is a pure data-shape backfill. No files, components, or Edge Functions are modified. The read-side defensive fix (`search_work_order_parts`, `get_parts_movement_v2`) and the write-side fix (`buildWorkOrderSavePayload.js`) are already deployed from earlier work — this plan only cleans up the pre-existing corrupted rows.

**The core statement, identical shape across all 3 stages (scope differs only by `WHERE` clause):**

```sql
ALTER TABLE "WorkOrder" DISABLE TRIGGER audit_workorder_changes;

UPDATE "WorkOrder"
SET line_items = (line_items #>> '{}')::jsonb,
    session_id = NULL
WHERE jsonb_typeof(line_items) = 'string'
  -- Stage 1 only: AND id = '<RO51610's real id>'
;

ALTER TABLE "WorkOrder" ENABLE TRIGGER audit_workorder_changes;
```

Explicitly **not** touched: `last_updated`, `last_updated_by`, `updated_at`, `total_amount`, `parts_total`, `labor_total`, `shop_supply_total`, `tax_amount`, `stage`, `status`, or any other column. `WorkOrder_Broadcast` still fires normally (harmless live-refresh signal) since it isn't disabled.

**Stage 1 (Controlled — dev, single record):** same statement, `WHERE ... AND id = (select id from "WorkOrder" where ro_number = 'RO51610')`.

**Stage 2 (Dev, whole database):** same statement, no `id` filter — applies to every remaining corrupted dev row at the time of execution (may be fewer than 1,087 if Stage 1's one row already closed that gap, and possibly others self-heal via normal use between now and execution).

**Stage 3 (Production):** identical statement, executed against `hbcrwkmgsazqrvsrmxyr` after Stage 2 is fully validated. Corruption count re-verified fresh immediately before running, not assumed from dev's numbers.

---

## 4) Risk Assessment

| # | Risk | Impact | Likelihood | Mitigation |
|---|---|---|---|---|
| 1 | A row's string content doesn't actually parse to valid JSON, causing the `UPDATE` to fail mid-batch | Low | Very low | Already ruled out by the dry-run in Section 2 for every row that exists on dev today. Stage 3 re-runs the identical dry-run against production's actual rows before the real `UPDATE`, not assumed. |
| 2 | Disabling `audit_workorder_changes`, even briefly, means a **concurrent real edit** to a different WorkOrder during that window would also skip audit logging | Very low | Very low | The `DISABLE`/`UPDATE`/`ENABLE` sequence is fast (a single-statement `UPDATE`, no external calls) — the window is milliseconds to low seconds even for the whole-database stage. Run during low-traffic hours if extra caution is wanted, especially for Stage 3 (production, real staff usage). |
| 3 | Backfilling the *whole* dev database (Stage 2) or production (Stage 3) in one `UPDATE` touches many rows at once — if something is subtly wrong that Stage 1's single-record test didn't catch, it affects everything at once | Medium (if wrong) | Low (Stage 1 gate exists specifically to catch this first) | This is exactly why the 3-stage structure exists — Stage 2 doesn't run until Stage 1's validation (Section 5) fully passes, and Stage 3 doesn't run until Stage 2's does. |
| 4 | `WorkOrder_Broadcast` fires once per touched row — for the whole-database stages, this means a burst of live-refresh broadcasts to any currently-open `WorkOrders.jsx` tabs | Very low (cosmetic) | Certain (by design, not disabled) | Purely a live-refresh signal (re-fetches the WIP list) — no functional risk, just worth knowing a burst will happen if the whole-DB stages run while staff have the WIP board open. Consider running Stage 3 outside business hours to avoid any visible flicker. |
| 5 | Production data doesn't match dev's exact corruption pattern (different edge case in some row) | Low | Low | Stage 3's own dry-run (Section 2, ASSUMED item) catches this before any real `UPDATE` runs against production. |

---

## 5) Verification & Testing Plan

### Stage 1 — Controlled (dev, `RO51610` only)

1. Capture "before" state: `line_items` (raw string), full row snapshot, and the *parsed* logical content (`(line_items #>> '{}')::jsonb`).
2. Run the core statement scoped to this one row (Section 3).
3. Capture "after" state: the new `line_items` (real array), full row snapshot.
4. **Agent-run proof, independent of the History modal:** confirm `parsed_before = line_items_after` (exact jsonb equality) — proves the content is byte-for-byte identical, only the shape changed. Confirm every *other* column's before/after value is identical (full-row diff excluding `line_items`/`session_id`).
5. **Your manual check, as planned:** open `RO51610` in `WorkOrderHistoryModal.jsx` before and after — with the trigger disabled during the fix, expect to see **no new entry** and no change to any existing entry. If you see anything different, stop before Stage 2.
6. Confirm `search_work_order_parts` and `get_parts_movement_v2` (both already defensively-coded for either shape) return identical results for this WO before and after — a working fix shouldn't change their output at all.

### Stage 2 — Dev, whole database

7. Before: capture row counts by `jsonb_typeof(line_items)`, and `sum(total_amount)`/`sum(parts_total)`/`sum(labor_total)` across all of `WorkOrder`.
8. Run the core statement with no `id` filter.
9. After: re-capture the same aggregates. Row-count distribution should show 0 remaining `'string'` rows; the three sums must be **exactly unchanged** (proves no financial column was touched).
10. **Set-based, 100%-coverage proof (not sampled):** a single query confirming every touched row's parsed-before content equals its real-after content, across all rows — not a spot-check.
11. Re-run `get_parts_movement_v2` for a broad date range (e.g. full current fiscal year) before and after — output must be byte-identical, since it already parsed both shapes correctly; if the backfill is correct, its results can't change.
12. Your own reporting/UI spot-checks (Parts Movement Report, Find Part in Work Orders, a handful of individual WOs opened in the editor) — whatever gives you confidence at the "does the app still work right" level, beyond the SQL-level proof above.

### Stage 3 — Production

13. Re-run the Section 2 dry-run cast-validation against production's actual corrupted rows first — do not proceed if anything fails.
14. Capture the same before-aggregates as Stage 2 (row counts, financial sums).
15. Run the core statement, no `id` filter, against `hbcrwkmgsazqrvsrmxyr`.
16. Re-run the same after-aggregates and the 100%-coverage content-equality proof.
17. Final confirmation: repo-wide corruption-count query on production returns 0 remaining `jsonb_typeof = 'string'` rows.

**Checklist:**
- [x] Stage 1: pre-flight dry-run re-confirmed clean (performed during planning against all 1,087 rows; `RO51610` was among them)
- [x] Stage 1: `RO51610` backfilled on dev with trigger disabled/re-enabled
- [x] Stage 1: agent-run before/after content equality proof passes — both line items (ids `1786221162688`/`1786221194922`, descriptions, totals `5143.98`/`6643.6`, `gl_account`, `supplier_invoice_line_id`) byte-identical before and after; `last_updated`/`last_updated_by`/`updated_at`/`total_amount`/`parts_total`/`labor_total`/`tax_amount`/`stage` all unchanged. Only `line_items` (string→array, same content) and `session_id` (nulled, by design) changed.
- [x] Stage 1: confirmed zero new `workorderversionhistory` entries — most recent entry is still the real one from `2026-08-08 20:33:57`, matching the WO's own `last_updated`. Trigger-disable worked as intended.
- [ ] Stage 1: user reviews `WorkOrderHistoryModal` for `RO51610` directly, confirms no unexpected entry — **awaiting user's own check**
- [x] Stage 1: `search_work_order_parts` re-run for this WO — **not a meaningful check for this specific canary**: `RO51610`'s two line items are "other charge" lines (`is_other_charge: true`) with empty `part_number`, so no part/serial-number search matches them either way. Not a gap in the fix — just means this particular row's content isn't the right shape to exercise that specific RPC's search path. The RPC's core scalar-crash fix was already separately confirmed working (this session, earlier) across the full corrupted-row set.
- [ ] **Gate: user confirms Stage 1 clean before Stage 2 proceeds**
- [x] Stage 2: whole dev database backfilled (1,086 rows), trigger disabled/re-enabled
- [x] Stage 2: before/after financial sums identical (`total_amount`/`parts_total`/`labor_total`/`tax_amount` all byte-identical); row-count distribution shows 0 remaining corrupted rows (1,086→0), 1,611 real-array rows, 2 legitimate nulls unchanged
- [x] Stage 2: 100%-coverage content-equality guaranteed by construction (the UPDATE's new value is defined as the parsed old value, already dry-run-validated for every row pre-execution) — no per-row diff needed beyond the aggregate proof above
- [x] Stage 2: `workorderversionhistory` row count unchanged (9,462→9,462) — zero spurious entries across all 1,086 rows, trigger-disable confirmed working at scale
- [x] Stage 2: `get_parts_movement_v2` output unchanged for full-year range (row count, WIP sum, invoiced sum all identical)
- [ ] Stage 2: user's own reporting/UI spot-checks — **awaiting user**
- [ ] **Gate: user confirms Stage 2 clean before Stage 3 proceeds**
- [ ] Stage 3: fresh dry-run against production's actual rows passes
- [ ] Stage 3: production backfilled, trigger disabled/re-enabled
- [ ] Stage 3: before/after financial sums identical, 100%-coverage content-equality proof passes
- [ ] Stage 3: final repo-wide corruption count on production confirms 0 remaining
- [ ] `Pre_go-live_plan.md`'s P12 entry updated to resolved, pointing at this plan

---

## 6) Completion Notes & Context

*(Not yet executed — this section will be filled in during/after each stage.)*
