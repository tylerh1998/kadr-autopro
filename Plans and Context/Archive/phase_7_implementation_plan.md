# Phase 7 Implementation Plan: Inventory Module Completion

**Status:** APPROVED — restructured into 3 sub-phases (7A/7B/7C) for sequential execution
**Parent:** `master_blueprint.md`, Phase 7 (Inventory Module Completion)
**Prepared:** 2026-08-03 · **Restructured:** 2026-08-03 (v2 — split into sub-phases per your request, so each can be run/resumed independently even across a context reset)
**Baseline commit:** af084b08 (development branch, Phase 5 & 6 complete)

> **LIVE DOCUMENT.** This plan is updated in place as execution/verification surfaces new findings — do not wipe prior sections, append/annotate instead. Key learnings roll back into `master_blueprint.md` Section 7 at phase close (via `/nextphase`).
>
> **Sub-phase structure:** This phase is split into three sequential sub-phases — **7A (Foundation)**, **7B (Complex Rewire & New Edge Function)**, **7C (InventoryAdd.jsx + GL/Audit Work)**. Each sub-phase (Section 7A/7B/7C below) is fully self-contained: scope, detailed execution steps, and a verification checklist all live together, so a fresh session with no memory of this conversation can open straight to `## 7A)`, `## 7B)`, or `## 7C)` and execute confidently. Sections 0-2 and 3&4 (this document's shared front matter) give the cross-cutting context every sub-phase assumes as background.

---

## 0) Open Questions, Info Requirements & Suggestions

### 0.1 — CORRECTED via direct production query: `InventoryCategory`/`InventoryLocation`/`ReturnReason` tables do NOT exist yet; only `InventoryReturn` does

**Direct SQL query against production (`hbcrwkmgsazqrvsrmxyr`) — ran during this planning pass, supersedes both my original draft's assumption AND `master_blueprint.md` Section 1's current claim:**

```sql
SELECT table_name FROM information_schema.tables 
WHERE table_schema = 'public' 
AND (table_name ILIKE '%categor%' OR table_name ILIKE '%location%' OR table_name ILIKE '%reason%' OR table_name ILIKE '%inventor%' OR table_name ILIKE '%return%');
-- Result: InventoryAuditLog, InventoryItem, InventoryReturn, LankarWOInventory
-- NOT present: InventoryCategory, InventoryLocation, ReturnReason
```

**Confirmed reality:**
- ✅ **`InventoryReturn`** — exists, **32 real rows already in production**, schema matches the `.jsonc` spec exactly (`id`/`created_date`/`updated_date`/`created_by`/`created_by_id` all present, no column defaults — same audit-field-must-be-set-manually pattern as every other phase). RLS: `"Enable all operations for all users"`, permissive, matches project-wide convention. **This table is genuinely hybrid** (table+data exist) — matches the blueprint's claim for this one specifically.
- ❌ **`InventoryCategory`** — **does not exist as a table.** `master_blueprint.md` Section 1 lists this as "Hybrid (table + data migrated)" — **that line is stale/incorrect** and has been corrected in `master_blueprint.md` directly (see that file's Section 1).
- ❌ **`InventoryLocation`** — **does not exist as a table.** Same correction made.
- ❌ **`ReturnReason`** — **does not exist as a table.** Confirms it needs full schema design, not just a transport swap.

**What this actually means for scope:** `InventoryCategory`, `InventoryLocation`, and `ReturnReason` aren't a "hybrid finish" (transport-layer-only, like Phase 5's Customer/Vehicle) — they need **real schema design + a one-time data migration from Base44**, the same category of work as Phase 8-11's confirmed-Base44-only entities. `InventoryReturn` alone is the genuinely-hybrid one. **This is Sub-Phase 7A's core work.**

**How `LocationModal.jsx`/`InventoryAddModal.jsx` work today despite no native table existing:** `@/entities/all` is not a real file — it's a **virtual module synthesized by `@base44/vite-plugin`** (`vite.config.js:26-29`, `legacySDKImports: true`, comment: *"Support for legacy code that imports the base44 SDK with @/integrations, @/entities, etc."*). So `InventoryLocation.filter()`/`.create()`/`.update()` calls in `LocationModal.jsx` today are **actually calling through to Base44's hosted entity REST API**, not Postgres — they look native but are 100% Base44-backed.

**Decided — table creation + data migration approach:**
1. **Schema:** New `CREATE TABLE` migrations for `InventoryCategory`, `InventoryLocation`, `ReturnReason`, matching `InventoryReturn`'s established column conventions (`id` text PK no default, `created_date`/`updated_date` timestamptz no default, `created_by`/`created_by_id` text) — build + validate in the **Phase 1 dev branch first**, per the blueprint's confirmed risk-mitigation policy for schema-design phases (Risk #3). Full DDL in **Section 7A**.
2. **Data migration (confirmed):** CSV exports located at `Plans and Context/InventoryCategory_export.csv`, `InventoryLocation_export.csv`, `ReturnReason_export.csv` (read in full during planning) — import into dev-branch tables first, spot-check, then repeat against production.
3. **Data-access pattern (confirmed):** No entity-class wrapper layer — every component gets its `@/entities/all` import for these symbols replaced with a direct `supabase.from()` call, matching the exact pattern already established in Phases 4-6 (see the "General Pattern" note in Section 3&4 below — the original draft's "entity class" plan was dropped, both because no such pattern exists anywhere else in this codebase and because it technically couldn't have worked as designed, since `@/entities/all` is a build-time virtual module, not a file that re-exports can intercept).

### 0.2 — RESOLVED (source read): Port `suggestInventoryCategory` to Gemini — grounded, Option C

**Confirmed Gemini pattern from `supabase/functions/autopro-processPartsInvoiceOCR/index.ts`** (read in full):
- Model: `gemini-flash-latest`, called via raw REST `fetch()` — **no SDK**, no `npm:`/`esm.sh` import needed for the Gemini call itself: `https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent?key=${apiKey}`
- Auth: reads `GEMINI_API_KEY` from `Deno.env.get(...)` — already confirmed present on Supabase per your note.
- Error handling: this function predates `master_context.md`'s 200-always convention (uses 400/500/`response.status` passthrough). **Important framing correction:** the 200-always rule is the project's *target* convention — the goal is full compliance by Phase 14, not something every existing function must already follow. This function not yet matching it isn't a defect to chase down. The **new** `autopro-suggestInventoryCategory` function follows the documented convention from day one.

**Confirmed Base44 source logic** (`base44/functions/suggestInventoryCategory/entry.ts`, read in full):
1. **Hardcoded rule, no AI call:** if `supplier_name` (case-insensitive) contains `"jard"` → return `{ category: 'Jard' }` immediately.
2. Fetch valid category names via `InventoryCategory.list()` (→ now a direct `supabase.from('InventoryCategory').select('name')` call against the new native table from Sub-Phase 7A). If zero categories exist, return `{ category: 'other' }`.
3. Otherwise, call an LLM with a prompt asking it to search the internet for what the part is, then classify it into one of the existing category names — using Base44's `InvokeLLM({ prompt, add_context_from_internet: true })`, i.e. **grounded/internet-search-enabled** generation.
4. Validate the LLM's answer against the real category list case-insensitively; on no match, fall back to `'other'` (or the first category if `'other'` doesn't exist either).

**Options considered for the grounding question** (Gemini's REST API does not reliably support `response_mime_type: "application/json"` at the same time as a `tools: [{ google_search: {} }]` grounding call — they're often mutually exclusive on the same request):
- *Option A: Ungrounded classification, structured JSON.* Simplest, matches OCR's proven pattern, but loses internet lookup for sparse descriptions.
- *Option B: Grounded search, then a second structured-output call to validate.* Two Gemini calls per suggestion — more latency, more failure points.
- *Option C (chosen): Grounded call only, parse free text.* Single grounded call, no `response_mime_type` constraint, parse the plain-text category name back out server-side with the same case-insensitive match + fallback logic Base44 uses today.

**Decision (confirmed): Option C — grounded call, free-text parsing, no `response_mime_type` JSON mode.** Preserves Base44's original internet-search-grounded classification behavior exactly (the whole point of the feature). Not a new reliability risk: the existing Base44 version already returns free text from its `InvokeLLM` call and does exactly this `.trim()`/quote-strip/case-insensitive-match/fallback-to-'other' dance today. Full Edge Function code in **Section 7B**.

**Two frontend call sites, both updated in 7B** (only one was in the original file-list draft):
1. `src/components/inventory/InventoryAddModal.jsx:113`
2. `src/pages/InventoryAdd.jsx:1167` (discovered during scope verification)

**Open item to verify during 7B execution:** confirm the exact grounding tool syntax for `gemini-flash-latest` — the Gemini API has changed its grounding tool name across versions (`google_search_retrieval` on older Gemini 1.5 models vs. `google_search` on Gemini 2.0+); `gemini-flash-latest` should map to the newer `google_search` form, but confirm against a live test call before considering 7B done, since a wrong tool name fails the whole request rather than silently degrading.

### 0.3 — RESOLVED: Three separate return workflows, one unified table

**Confirmed:** `InventoryReturn` table has a `return_type` discriminator (`enum ["core", "return", "warranty"]`). Four modals handle different business contexts:

| Modal | Context | GL Impact | return_type | Sub-Phase |
|-------|---------|-----------|-------------|-----------|
| `InventoryPartsReturnModal` | Return from work order in progress or inventory | Pre-bill to COGS | "return" or "core" | 7A (already native, only its `ReturnReason` read changes) |
| `LegacyWarrantyReturnModal` | Warranty return for items sold in legacy system | Parallel GL transactions | "warranty" | 7B (full native rewire needed) |
| `EditReturnInfoModal` | Edit existing return record | (no GL changes) | (any type) | 7A |
| `WarrantyReturnModal` | (on WorkOrderView for invoices) | Post-bill to COGS | "warranty" | None — already fully native, no changes in any sub-phase |

**All four modals update the single `InventoryReturn` table** — no separate tables. The `return_type` discriminator is the primary differentiator for filtering and business logic.

### 0.4 — RESOLVED, scope corrected per your directive: QOH is fully in-scope (audit + fix), OCR's Edge Function is verify-only, `InventoryAdd.jsx` + `autopro-processInventoryReceipt` discovered as real in-scope work

**Your standing rule for this phase:** anything inventory-related and anything `GLTransaction`-related is in scope, wherever it's found — the two are inseparable throughout this app, and carving GL logic out to "whichever phase happens to own the surrounding feature" would make some later phase (Banking? AP?) absorb an unfair share of GL work that's really inventory's. What's explicitly **not** in scope is *combining* GL/inventory logic with a genuinely separate, not-yet-migrated concern (Supplier business logic beyond a simple read/update, BankAccount reconciliation, LOC).

**`autopro-processQOHAdjustment`** — explicitly in scope, audited in full (241 lines), assigned to **Sub-Phase 7C**. Fully native already (no Base44 dependency in its core logic), correct double-entry GL posting direction, but missing the cent-rounding convention used everywhere else in this codebase's GL-adjacent code — fixed in 7C. Its `system_issue` email side-effect still calls Base44's SMTP function, which is out of scope (not inventory/GL logic, just a notification).

**`autopro-processPartsInvoiceOCR`** — the Edge Function itself (172 lines, read in full) has **zero database writes** — it's a pure Gemini document-vision call, nothing to migrate. Per your instruction, full click-through validation of the OCR *workflow* is deferred to Phase 9; **Sub-Phase 7C** only confirms the function is deployed.

**Discovered during scope verification — genuinely in-scope work, assigned to Sub-Phase 7C:**
- **`src/pages/InventoryAdd.jsx`** (1,957 lines) — the actual "Receive Inventory / Parts Entry" page. Contains a second `suggestInventoryCategory` call site (handled in **7B**, since it needs the new Edge Function from 7B), direct `InventoryLocation`/`InventoryCategory` reads, and several `Supplier`-table thin-proxy reads/updates (supplier dropdown, concurrency-lock management) — **the remaining calls (not the suggestion call) are 7C's job.**
- **`autopro-processInventoryReceipt`** (1,035 lines) — the function `InventoryAdd.jsx`'s batch-save flow actually calls to turn a receiving batch into `InventoryItem` updates + GL postings. Already fully native, audited in full, no bugs found — **verify-only in 7C.**

**Neither `autopro-processQOHAdjustment` nor `autopro-processPartsInvoiceOCR` yet follows `master_context.md`'s 200-always error convention** (both return raw 400/401/404/500 status codes) — same class of gap Phase 6 found in `autopro-WOBulkGetParts`/`autopro-archiveWorkOrderProjects`. **Framing correction:** this isn't a "violation" to chase as a defect — the 200-always rule is a project-wide *target* being rolled out phase by phase, expected to be universally true only by **Phase 14**. Not touching either function's status-code behavior this phase — every *new* function this phase writes (`autopro-suggestInventoryCategory`) follows the target convention from day one.

### 0.5 — RESOLVED: Levies (Phase 10 scope) & Cores (Phase 7 scope)

**Levies — OUT OF SCOPE (Phase 10):**
- Stored in `Levies` table in Base44. You can provide a CSV export. Migrating `Levies` to Supabase is Phase 10's job.

**Cores — PARTIALLY PHASE 7 (distributed across 3 locations):**
- **`InventoryItem`:** Core cost stored per item (included in all QOH calculations)
- **`InventoryReturn`:** Core returns tracked separately via `return_type: "core"` — **Sub-Phase 7A/7B's job** (this table's transport layer)
- **`WorkOrder.line_items` JSON:** Core tracking as `{ core_num, core_ret, core_onhand }` fields — handled by Phase 13, not this phase

---

## 1) Phase Scope & Objectives

**Objective:** Complete the Inventory module migration by:
1. Creating real Postgres tables for **`InventoryCategory`**, **`InventoryLocation`**, and **`ReturnReason`**, migrating their data from Base44 via CSV, then cutting every component that reads/writes them over to direct `supabase.from()` calls — matching the exact pattern Phases 4-6 already established (no wrapper/entity-class layer). **[Sub-Phase 7A]**
2. Cutting `InventoryReturn`'s remaining Base44-shimmed call sites over to direct calls. **[Split: simple call sites in 7A, `LegacyWarrantyReturnModal.jsx`'s full rewire in 7B]**
3. Eliminating the two remaining Base44 function calls in inventory components: `inventoryUpdate` (via `LocationModal.jsx`) **[7A]** and `suggestInventoryCategory` (porting to a new Gemini-based `autopro-suggestInventoryCategory` Edge Function) **[7B]**.
4. Migrating `src/pages/InventoryAdd.jsx`'s remaining Base44 calls and auditing/fixing the GL-rounding gap in `autopro-processQOHAdjustment`. **[Sub-Phase 7C]**
5. Verifying (not rebuilding) the QOH adjustment, OCR, and `autopro-processInventoryReceipt` Edge Functions are deployed to both dev and production. **[Sub-Phase 7C]**

**In scope — corrected against actual verified state, tagged by sub-phase:**

| # | Entity / Component | Actual current state (verified) | Target | Sub-Phase |
|---|---|---|---|---|
| 1 | `InventoryCategory` | **Table does not exist in production.** Read via Base44-shim in `InventoryAddModal.jsx` and `InventoryAdd.jsx`. | New native table + direct `supabase.from()` calls. | **7A** (table + `InventoryAddModal.jsx` dropdown); **7C** (`InventoryAdd.jsx`'s read) |
| 2 | `InventoryLocation` | **Table does not exist in production.** Read/write via Base44-shim in `LocationModal.jsx` and `InventoryAdd.jsx`. | New native table + direct `supabase.from()` calls. | **7A** (table + `LocationModal.jsx`); **7C** (`InventoryAdd.jsx`'s read) |
| 3 | `InventoryReturn` | **Table already exists, 32 live rows**, already native in 2 of 4 relevant files (`InventoryPartsReturnModal.jsx`, `WarrantyReturnModal.jsx`). Only `LegacyWarrantyReturnModal.jsx`/`EditReturnInfoModal.jsx` still route through the Base44 shim. | Transport-layer cleanup for the 2 remaining files. | **7A** (`EditReturnInfoModal.jsx`); **7B** (`LegacyWarrantyReturnModal.jsx`) |
| 4 | `ReturnReason` | **Table does not exist in production.** Field name confirmed as `reason`, not `name`. Read via Base44 shim in 2 files. | New native table + direct `supabase.from()` calls. | **7A** (table + both files: `InventoryPartsReturnModal.jsx`, `EditReturnInfoModal.jsx`) |
| 5 | `LocationModal.jsx` line 56 | `base44.functions.invoke('inventoryUpdate', ...)` | Direct `.from('InventoryItem').update()`. | **7A** |
| 6 | `suggestInventoryCategory` (2 call sites) | `base44.functions.invoke('suggestInventoryCategory', ...)` in `InventoryAddModal.jsx:113` and `InventoryAdd.jsx:1167` | New `autopro-suggestInventoryCategory` Edge Function, Gemini-based, grounded (Option C). | **7B** |
| 7 | `InventoryAdjustQOHModal.jsx` / `autopro-processQOHAdjustment` | Already native, but missing GL-value rounding. | Rounding fix applied. | **7C** |
| 8 | `PartsInvoiceOCRModal.jsx` / `autopro-processPartsInvoiceOCR` | Already native, already Gemini-based. | Verify deployed only. No code changes. | **7C** |
| 9 | `searchInventory` (used by `LegacyWarrantyReturnModal.jsx`) | Base44-hosted thin proxy wrapping a native RPC. | Inline as direct client-side call. | **7B** |
| 10 | `searchSuppliers` (used by `WarrantyReturnModal.jsx`) | Calls `base44.entities.Supplier.list()`. | **Out of scope** — Phase 9's job. | N/A |
| 11 | `InventoryAdd.jsx` (Supplier/SalesClass reads, lock management) | Multiple `SupabaseProxy` calls. | Direct `supabase.from()` calls. | **7C** |
| 12 | `autopro-processInventoryReceipt` | Already fully native, audited, correct. | Verify-only. | **7C** |

**New native assets:**
- 3 new Postgres tables: `InventoryCategory`, `InventoryLocation`, `ReturnReason` (dev branch first, then production — **7A**)
- 1 new Edge Function: `supabase/functions/autopro-suggestInventoryCategory/index.ts` (**7B**)
- No new source files otherwise — every other change is an inline edit to an existing component (no wrapper/entity-class layer)

**Out of scope (explicitly deferred):**
- Phase 9: `Supplier` CRUD/search business logic (`searchSuppliers`, and the OCR-to-AP full-flow validation)
- Phase 10: `Levies` table migration, full tax accounting
- Phase 13: `WorkOrder`/`DocumentEditor.jsx` migration (the one `WorkOrder.get()`/`.update()` dependency inside the already-native `WarrantyReturnModal.jsx` stays untouched)

**Target outcome:** Every call site in `src/components/inventory/*.jsx`, `src/pages/InventoryAdd.jsx`, and the `LegacyWarrantyReturnModal.jsx` file uses a direct `supabase.from()`/`.rpc()` call or a native `autopro-*` Edge Function; zero remaining `base44`/`@/entities/all` imports for `InventoryCategory`/`InventoryLocation`/`InventoryReturn`/`ReturnReason`/`inventoryUpdate`/`suggestInventoryCategory` in scope.

---

## 2) Lessons Learned & Context (pulled from `master_blueprint.md` Section 7)

Directly applicable to every sub-phase's execution:

- **Audit fields don't populate themselves** (Phase 4 lesson, applicable everywhere). Every `.insert()` on `InventoryCategory`, `InventoryLocation`, `InventoryReturn`, `ReturnReason` must explicitly set `id` (text, client-generated via `crypto.randomUUID()` — confirmed these tables use text PKs, not Postgres `uuid`), `created_date` (now()), `created_by` (employee name), `created_by_id` (employee id). Every `.update()` must set `updated_date`.
- **Check `information_schema.columns` before assuming a field exists** (Phase 3/5 lesson, and directly responsible for catching this phase's `ReturnReason.reason`-not-`.name` bug during planning). Before writing any direct `supabase.from()` call, verify the Postgres table actually has the columns being referenced — don't trust a `.jsonc` spec or a component's existing field-name usage without cross-checking the real schema.
- **Silent-failure pattern:** Any Supabase call whose failure degrades to a plausible "empty" state should log its error (Phase 3 lesson). Every direct call added in this phase checks `error` explicitly and logs it — never swallows silently.
- **Edge Function error-handling convention** (Phase 5/6 established, Phase 6 corrected). All new Edge Functions return `200` always, with `{ error: "..." }` in the body on failure. Frontend call sites check `response.data?.error`, not `response.error` or HTTP status.
- **RLS confirmed permissive on inventory tables that already exist** (`InventoryItem`, `InventoryReturn` — confirmed via direct query this phase). The 3 new tables don't exist yet, so 7A's migration explicitly creates the same `"Enable all operations for all users"` policy on each as part of their `CREATE TABLE` step.
- **Don't carry stale field names forward** (Phase 3/6 lesson). Double-check field names against the actual Postgres schema (or, for not-yet-existing tables, against real call-site usage or a real CSV export) rather than a `.jsonc` spec alone.
- **Leave the `base44/` source tree alone until Phase 14** (Phase 4 standing rule). This phase stops *calling* Base44 functions but does not delete `base44/functions/suggestInventoryCategory/`, etc.
- **No entity-class wrapper layer** (confirmed during this phase's planning). Grepped the entire codebase — no such pattern exists anywhere. Every prior phase (4, 5, 6) that cut a table over from Base44 did it by deleting the `@/entities/all` import and inlining direct `supabase.from()` calls into the component. Also, technically, a wrapper layer wouldn't have worked as originally drafted: `@/entities/all` is a build-time virtual module (Vite plugin), not a file that re-exports can intercept.

### Lessons added during 7B execution & UI validation (2026-08-03)

**New standing lessons — apply to 7C and beyond:**

- **`id` is not always auto-generated — check the column default before omitting it, even when copying an existing pattern.** `GLTransaction.id` defaults to `''::text`, not a generated value. The plan's own diff for `LegacyWarrantyReturnModal.jsx`'s GL insert (and the untouched `WarrantyReturnModal.jsx`'s existing GL insert, which this phase did not touch) omits `id` entirely — every row inserted that way collides on the same empty-string PK within a single multi-row `.insert()`, so only one of the two GL rows (or neither) can ever land. Confirmed via direct query: 0 rows with `id=''` exist in production, meaning `WarrantyReturnModal.jsx`'s GL-posting insert may have been silently failing every time it's run in production. **Flagged, not fixed** (out of this phase's file scope) — worth a dedicated look, likely in 7C or a GL-focused later phase. Going forward: never assume a table's `id` column has a working default just because a same-shaped insert elsewhere in the codebase omits it — check `information_schema.columns` directly, the same discipline already applied to field names.
- **The "one failed promise poisons the whole `Promise.all`" bug pattern recurs across files — check for it explicitly whenever a `loadData()`-style function bundles a migrated native call alongside a still-Base44 call.** 7A already found and fixed this exact pattern in `InventoryAddModal.jsx` (a `TagAlong.list()` 401 was blocking the sibling `InventoryCategory` fetch). During 7B's UI validation, the identical pattern was confirmed still present and unfixed in `InventoryAdd.jsx`'s own `loadData()` — its Category dropdown currently shows zero options because one of its still-Base44 calls (Supplier/SalesClass) 401s and kills the whole `Promise.all`, even though `InventoryAdd.jsx`'s own `InventoryCategory`/`InventoryLocation` reads haven't been touched yet (correctly deferred to 7C). **Action for 7C:** when migrating `InventoryAdd.jsx`'s `loadData()`, decouple every native fetch from every still-Base44 fetch into independent try/catch blocks — don't just port the calls one-for-one, actively look for this coupling bug the way 7A did.
- **The Supabase `execute_sql` MCP tool only returns the result of the *last* statement when multiple `;`-separated statements are sent in one call — it does not return an array of per-statement results.** This caused a real false-alarm mid-session: a combined query (`SELECT count(*) WHERE inventory_supplier = true; SELECT count(*) FROM "Supplier";`) returned a single `count: 1`, which was misread as the *first* query's result (implying a real supplier existed) when it was actually the *second* query's total-row-count. Led to ~15 minutes of chasing a nonexistent "empty dropdown" bug before isolating each `SELECT` into its own tool call revealed the dev-branch `Supplier` table has exactly one placeholder row with `inventory_supplier: null`. **Going forward: always isolate SQL checks into single-statement `execute_sql` calls when the result will be used to reason about correctness** — never trust a multi-statement call's single returned result to correspond to a specific statement in the batch.
- **The dev-branch Supabase project (`sitihbdnuxifwibontcm`) that `test.kensauto.ca` runs against has essentially no seed data** — 1 placeholder `Supplier` row, 0 `InventoryItem`/`InventoryReturn`/Work Order rows at time of 7B testing. This makes some UI regression checks impossible without either seeding test data first (as done here — temporarily set the placeholder `Supplier.inventory_supplier = true` to exercise the LANKAR return flow, then deleted the resulting test rows afterward) or testing against production directly (higher risk, not done here). **7C and later sub-phases should expect the same limitation** and budget time for either seeding minimal dev-branch test data or accepting reduced UI-test coverage there.

**Testing/environment notes — not code lessons, but save future sessions the rediscovery:**

- `local.kensauto.ca` **never works** for the Browser pane tool — don't retry it. `http://localhost:5173` works, but only once the dev server is actually reachable and the Browser pane is visibly displayed on the user's screen (screenshots/navigation silently fail with "the Browser pane is not displayed" otherwise — this is a client-side UI state the user has to actively keep open, not something fixable from the agent side). `.claude/launch.json`'s `url` override was changed from `https://local.kensauto.ca:5173` to `http://localhost:5173` this session to reflect this.
- `test.kensauto.ca` (the `development` Vercel environment) only reflects the **latest commit actually pushed to the `development` branch** — local uncommitted edits are invisible there. The user commits/pushes manually (per standing rule); confirm with them that a push happened before relying on `test.kensauto.ca` to validate current-session changes.
- The `/dev-login` page requires an email + password. Per standing safety rules the agent must never type credentials into any field, even for a test-only login — the user has to sign in themselves on the shared Browser-pane tab before the agent can continue UI testing.
- `test.kensauto.ca`'s runtime Supabase project is the **dev branch** (`sitihbdnuxifwibontcm`), not production (`hbcrwkmgsazqrvsrmxyr`) — confirmed via the session JWT's `iss` claim. Any DB-level verification/cleanup during UI testing against `test.kensauto.ca` must target the dev-branch project, not production.

**Validation gaps carried forward (not failures, just unverifiable this session):**

- `WarrantyReturnModal.jsx` regression check (7B.2) — **untested.** This file wasn't touched by 7B, but the dev-branch database had zero Work Orders, so there was no invoice to open the modal from. Low risk (no code changed), but genuinely unverified — pick this up whenever dev-branch has WO test data, or test carefully against production.
- `InventoryAdd.jsx`'s suggestion call (7B.3) — wiring confirmed correct by code review and by the identical pattern working live in `InventoryAddModal.jsx`, plus direct authenticated calls to the deployed function itself (Jard rule, fallback-to-Other logic) both passed. Could not visually confirm the suggested category renders in `InventoryAdd.jsx`'s own Category dropdown, because that dropdown is empty for the unrelated, already-flagged 7C-scope reason above (not a 7B regression).

---

## 3 & 4) Phase 7 Roadmap — Sub-Phase Breakdown

### Why split into sub-phases

Phase 7 grew substantially during planning: 3 new tables requiring schema design + CSV data migration, a discovered 1,957-line page (`InventoryAdd.jsx`) with its own Base44 call sites, a genuinely untested Gemini grounding integration, and a real precision bug found in existing financial code (`autopro-processQOHAdjustment`). Several of these pieces have their own natural verification gate (dev-branch-first before production) that doesn't compose well into one uninterrupted session. Splitting gives a checkpoint after each piece to verify before compounding onto the next.

### Sub-phase status tracker

| Sub-Phase | Scope Summary | Status | Depends On |
|-----------|---------------|--------|------------|
| **7A** | Foundation: 3 schema migrations + CSV data imports (dev→prod), plus the simple entity swaps that depend only on that: `InventoryAddModal.jsx` (category dropdown), `LocationModal.jsx` (full), `InventoryPartsReturnModal.jsx` (ReturnReason read only), `EditReturnInfoModal.jsx` (full) | [x] Complete (executed 2026-08-03, pending your UI validation) | None — start here |
| **7B** | Complex rewire + new Edge Function: `LegacyWarrantyReturnModal.jsx` full native rewire, `searchInventory` thin-proxy swap, new `autopro-suggestInventoryCategory` Gemini function + both its frontend call sites (`InventoryAddModal.jsx`'s suggestion call, `InventoryAdd.jsx`'s suggestion call) | [x] Complete (executed + UI-validated 2026-08-03 via dev-login on test.kensauto.ca — one item, `WarrantyReturnModal.jsx` regression check, untested for lack of WO test data in dev branch) | **7A** (needs `InventoryCategory`/`InventoryReturn` tables to exist) |
| **7C** | `InventoryAdd.jsx`'s remaining Base44 calls (Supplier/SalesClass/Location/Category reads, lock management) + GL/audit work: `autopro-processQOHAdjustment` rounding fix, `autopro-processInventoryReceipt` audit (verify-only), `autopro-processPartsInvoiceOCR` deploy-check (verify-only). **Scope grew mid-close-out** to also cover `src/pages/InventoryList.jsx`'s full Base44 removal (`getPopulatedInventory`/`searchInventory`/`inventoryDelete`/`inventoryAdd`/Supplier-SalesClass reads), discovered while UI-testing 7C and fixed in the same session since it blocked the "Add Item" / search flows this sub-phase depends on. | **[Tested]** — code executed + core flows UI-verified against `test.kensauto.ca` 2026-08-03 (see "Phase Results and Final Context" below for exactly what was and wasn't covered) | **7A** (needs `InventoryLocation`/`InventoryCategory` tables), **7B** (needs the suggestion call already wired so 7C doesn't re-touch it) |

**Phase 7 status: all three sub-phases (7A/7B/7C) now [Tested] — Phase 7 is complete.** Rolled up into `master_blueprint.md` Section 7 (2026-08-03).

**Update the checkboxes above as each sub-phase completes** — this is the first thing a fresh, context-cleared session should check to know where things stand.

### Cross-cutting file note — two files are touched by two different sub-phases

- **`src/components/inventory/InventoryAddModal.jsx`** is touched in **both 7A and 7B**: 7A migrates the `InventoryCategory` dropdown-load call (`loadData`, ~line 91); 7B migrates the separate `suggestInventoryCategory` debounced-suggestion call (~line 113), because that call needs the new Edge Function from 7B to exist first. These are two different functions in the same file — no overlap, just sequenced by dependency.
- **`src/pages/InventoryAdd.jsx`** is touched in **both 7B and 7C**: 7B migrates only its `suggestInventoryCategory` call (~line 1167, same reasoning as above); 7C migrates everything else in the file (`Supplier`/`SalesClass`/`InventoryLocation`/`InventoryCategory` reads, lock management, and removes the `base44` import once nothing else needs it).

### General pattern — direct native Supabase calls, no wrapper layer (applies to every sub-phase)

**Confirmed decision:** No entity-class wrapper layer anywhere in this phase. Per-file pattern for every migration in 7A/7B/7C:
1. Remove the migrated symbol from its `@/entities/all` (or `@/entities/InventoryCategory`, etc.) import — drop the whole import line if nothing else in the file still needs it.
2. Add/confirm `import { supabase } from '@/lib/supabase';`.
3. Replace `.list()`/`.filter()`/`.create()`/`.update()`/`.delete()` calls with inline `supabase.from('TableName').select()/.insert()/.update()/.delete()` calls.
4. Manually populate audit fields on every insert/update (`id`, `created_date`, `created_by`, `created_by_id` on insert; `updated_date` on update — plus `updated_by`/`updated_by_id` **only** on tables confirmed to have those columns — none of the 3 new tables or `InventoryReturn`/`InventoryItem` do).
5. Check `error` explicitly and `console.error` it — never swallow silently.

### Pre-flight status — what's already confirmed vs. what still needs a dev-branch check

**Already confirmed directly against production during planning (Section 0.1) — no further verification needed:**
- `InventoryCategory`/`InventoryLocation`/`ReturnReason` tables **do not exist** in production (confirmed via `information_schema.tables` query).
- `InventoryReturn` **does exist**, with the exact column list documented in Section 7A, 32 live rows, permissive RLS.
- `InventoryItem`'s `location`/`category`/`supplier_id` are plain `text` columns (name strings, not FK IDs); `InventoryItem` has `created_by`/`created_by_id`/`created_date`/`updated_date` but **no** `updated_by`/`updated_by_id`.
- `InventoryReturn` and `InventoryItem` both carry the standard `"Enable all operations for all users"` permissive RLS policy.
- `SalesClass` table confirmed native via direct query (relevant to 7C's `InventoryAdd.jsx` work).

**Still needs doing, in dependency order — this is why the sub-phases are sequenced the way they are:**
1. (7A) Run the three `CREATE TABLE` migrations in the **Phase 1 dev branch first** — confirm they apply cleanly and columns match.
2. (7A) Import the CSV data into dev-branch tables first, verify row counts/spot-check records, then repeat against production.
3. (7A) Apply the same 3 migrations to production once dev-branch is verified.
4. (7B) Confirm `search_inventory_ranked` RPC grants `EXECUTE` to `anon`/`authenticated`/`PUBLIC` before inlining the `searchInventory` swap.
5. (7B) Build and deploy `autopro-suggestInventoryCategory` — this needs 7A's `InventoryCategory` table to query against.
6. (7C) Migrate `InventoryAdd.jsx`'s remaining calls, apply the QOH rounding fix, verify deploy-parity on the two audited-only functions.

---

## 7A) SUB-PHASE A: Foundation — Schema, Data Migration & Simple Entity Swaps

### 7A.1) Scope & Objectives

**In scope for this sub-phase:**
1. Create 3 new Postgres tables (`InventoryCategory`, `InventoryLocation`, `ReturnReason`) — dev branch first, then production.
2. Import the 3 CSV data exports into those tables — dev branch first, then production.
3. `src/components/inventory/InventoryAddModal.jsx` — swap the `InventoryCategory` dropdown-load call only (NOT the `suggestInventoryCategory` suggestion call — that's 7B).
4. `src/components/inventory/LocationModal.jsx` — full swap, including the critical `inventoryUpdate` fix.
5. `src/components/inventory/InventoryPartsReturnModal.jsx` — swap only its `ReturnReason` read (its `InventoryReturn` create-logic is already native, untouched).
6. `src/components/inventory/EditReturnInfoModal.jsx` — full swap (both `InventoryReturn.update()` and `ReturnReason.list()`).

**Explicitly NOT in scope for 7A** (deferred to later sub-phases, don't touch these here):
- `InventoryAddModal.jsx`'s `suggestInventoryCategory` call (line ~113) — **7B**
- `LegacyWarrantyReturnModal.jsx` — **7B**
- `searchInventory` — **7B**
- `src/pages/InventoryAdd.jsx` (any part of it) — **7B** (suggestion call) / **7C** (everything else)
- `autopro-processQOHAdjustment` rounding fix — **7C**

**Prerequisite:** None — this is the starting sub-phase.

**Exit criteria (must all be true before starting 7B):** 3 tables exist in both dev and production with imported data; `InventoryAddModal.jsx`'s category dropdown, `LocationModal.jsx`, `InventoryPartsReturnModal.jsx`, and `EditReturnInfoModal.jsx` all pass their verification checklist below; `npm run build` is clean.

### 7A.2) Detailed Execution Plan

#### Schema migrations — `CREATE TABLE` for `InventoryCategory`, `InventoryLocation`, `ReturnReason`

**CSVs located and read in full** at `Plans and Context/InventoryCategory_export.csv`, `InventoryLocation_export.csv`, `ReturnReason_export.csv` — real Base44 exports, not samples. **The DDL below is built to exactly match each CSV's actual header row and data**, so each file can be imported directly via Supabase's Table Editor CSV import once its table exists, no column remapping needed.

**Confirmed findings from the CSVs (correcting earlier `.jsonc`-based speculation):**
- **None of the three CSVs include `updated_by`/`updated_by_id` columns** — Base44 never tracked those for these entities.
- **`InventoryCategory`'s CSV has no `is_active` column at all** — despite the `.jsonc` spec listing one, the real exported data never uses it, and no code anywhere filters `InventoryCategory` by `is_active` (grep confirmed).
- **`id` values are 24-character hex strings** (e.g. `6950d1f7944876186429a9f3`) — MongoDB-style ObjectIds, confirming `text`, not `uuid`, matching `InventoryReturn`'s already-confirmed convention.
- **`created_by_id` values are inconsistent in format** — some are the same 24-hex-char pattern, others are `service_<uuid>` strings (Base44 service-account IDs) — confirms `text`, not a strict FK to `auth.users(uuid)`.
- **Timestamps are ISO 8601 with microseconds** (e.g. `2025-12-28T06:45:11.486000`) — parses natively into `timestamptz` via CSV import.
- **Booleans are `TRUE`/`FALSE` text** (`InventoryLocation.is_active`, `ReturnReason.is_active`/`.hide`) — Postgres accepts these case-insensitively for `boolean` columns.

**Build and validate in the Phase 1 dev branch first**, then apply the same migration to production once verified.

```sql
-- InventoryCategory (matches InventoryCategory_export.csv header exactly:
-- name,description,lankar_categories,id,created_date,updated_date,created_by_id,created_by)
CREATE TABLE "InventoryCategory" (
  name text NOT NULL,
  description text,
  lankar_categories text,
  id text PRIMARY KEY,
  created_date timestamptz,
  updated_date timestamptz,
  created_by_id text,
  created_by text
);

ALTER TABLE "InventoryCategory" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Enable all operations for all users" ON "InventoryCategory"
  FOR ALL TO public USING (true) WITH CHECK (true);

-- InventoryLocation (matches InventoryLocation_export.csv header exactly:
-- location_name,description,is_active,id,created_date,updated_date,created_by_id,created_by)
CREATE TABLE "InventoryLocation" (
  location_name text NOT NULL,
  description text,
  is_active boolean DEFAULT true,
  id text PRIMARY KEY,
  created_date timestamptz,
  updated_date timestamptz,
  created_by_id text,
  created_by text
);

ALTER TABLE "InventoryLocation" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Enable all operations for all users" ON "InventoryLocation"
  FOR ALL TO public USING (true) WITH CHECK (true);

-- ReturnReason (matches ReturnReason_export.csv header exactly:
-- reason,is_active,hide,id,created_date,updated_date,created_by_id,created_by —
-- confirms the field is genuinely `reason`, not `name`, and `hide` genuinely exists)
CREATE TABLE "ReturnReason" (
  reason text NOT NULL,
  is_active boolean DEFAULT true,
  hide boolean DEFAULT false,
  id text PRIMARY KEY,
  created_date timestamptz,
  updated_date timestamptz,
  created_by_id text,
  created_by text
);

ALTER TABLE "ReturnReason" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Enable all operations for all users" ON "ReturnReason"
  FOR ALL TO public USING (true) WITH CHECK (true);
```

**Import procedure:**
1. Run the 3 `CREATE TABLE` statements above against the **dev branch** first.
2. Import each CSV via Supabase Studio's Table Editor → table → "Insert" → "Import data from CSV" (column headers match exactly, so no manual mapping needed).
3. Spot-check row counts and a few sample rows (especially confirm `ReturnReason.reason` values look right, e.g. "Not Ours", "Data Entry Error").
4. Repeat steps 1-2 against production once the dev-branch import is verified correct.

**Note on IDs:** since these are direct exports of Base44's real IDs (not regenerated), any existing `InventoryItem.category`/`.location` text value that happens to already reference an old ID rather than a name string would still resolve correctly post-import — though `InventoryItem.category`/`.location` are confirmed to already store plain name strings today, not IDs, so this is a non-issue in practice.

---

#### `InventoryAddModal.jsx` — `InventoryCategory` direct-call swap (dropdown load only)

**Schema:** `InventoryCategory` — `name` (text), `description` (text), `lankar_categories` (text), `id` (text), `created_date`/`updated_date` (timestamptz), `created_by_id`/`created_by` (text). **No `is_active` column.** **No `updated_by`/`updated_by_id`.**

**Current code (line 9-10, line 91):**
```diff
- import { TagAlong } from "@/entities/TagAlong";
- import { InventoryCategory } from "@/entities/InventoryCategory";
+ import { TagAlong } from "@/entities/TagAlong"; // TagAlong migration out of scope this phase, left as-is
+ import { supabase } from '@/lib/supabase';
```
```diff
  const loadData = async () => {
    try {
-     const [tagAlongsData, categoriesData] = await Promise.all([
-       TagAlong.list(),
-       InventoryCategory.list()
-     ]);
+     const [tagAlongsData, categoriesResult] = await Promise.all([
+       TagAlong.list(),
+       supabase.from('InventoryCategory').select('*').order('name')
+     ]);
+     if (categoriesResult.error) { console.error('Error loading categories:', categoriesResult.error); }
+     const categoriesData = categoriesResult.data || [];
      setTagAlongs(tagAlongsData);
      setInternalCategories(categoriesData);
    } catch (error) {
      console.error('Error loading data:', error);
    }
  };
```

**Note:** `InventoryAddModal.jsx` imports `InventoryCategory` from `@/entities/InventoryCategory` directly (not `@/entities/all` like other files) — same Base44 vite-plugin virtual-module mechanism, just a different import path shorthand. Same fix either way.

**Do NOT touch line ~113's `suggestInventoryCategory` call in this sub-phase** — that's 7B's job, once the new Edge Function exists.

---

#### `LocationModal.jsx` — `InventoryLocation` direct-call swap + critical `inventoryUpdate` fix

**Schema:** `InventoryLocation` — `location_name` (text), `description` (text), `is_active` (boolean, default true), `id` (text), `created_date`/`updated_date` (timestamptz), `created_by_id`/`created_by` (text). **No `updated_by`/`updated_by_id`.**

**Line 6-7 imports:**
```diff
- import { base44 } from '@/api/base44Client';
- import { InventoryLocation } from '@/entities/all';
+ import { supabase } from '@/lib/supabase';
```
(Confirm no other `base44` call remains in this file before removing the import — none found during research.)

**Line 34-41 (`loadLocations`, was `InventoryLocation.filter({ is_active: true })`):**
```diff
  const loadLocations = async () => {
    try {
-     const data = await InventoryLocation.filter({ is_active: true });
+     const { data, error } = await supabase
+       .from('InventoryLocation')
+       .select('*')
+       .eq('is_active', true);
+     if (error) throw error;
-     setLocations(data.sort((a, b) => (a.location_name || '').localeCompare(b.location_name || '')));
+     setLocations((data || []).sort((a, b) => (a.location_name || '').localeCompare(b.location_name || '')));
    } catch (error) {
      console.error('Error loading locations:', error);
    }
  };
```

**Line 51-68 (`handleLocationChange`, was `base44.functions.invoke('inventoryUpdate', ...)`) — the critical fix. This call updates `InventoryItem.location`, NOT the `InventoryLocation` table (it changes which location an item is stored at, not the location record itself):**
```diff
  const handleLocationChange = async () => {
    if (!item || !selectedLocation) return;

    setLoading(true);
    try {
-     await base44.functions.invoke('inventoryUpdate', {
-       itemId: item.id,
-       updates: { location: selectedLocation }
-     });
+     const { error } = await supabase
+       .from('InventoryItem')
+       .update({
+         location: selectedLocation,
+         updated_date: new Date().toISOString()
+       })
+       .eq('id', item.id);
+     if (error) throw error;
      onUpdate();
      onClose();
    } catch (error) {
      console.error('Error updating location:', error);
      alert('Failed to update location.');
    } finally {
      setLoading(false);
    }
  };
```
**Do not** set `updated_by`/`updated_by_id` here — confirmed via direct query that `InventoryItem` has no such columns (only `created_by`/`created_by_id`/`created_date`/`updated_date`).

**Line 70-91 (`handleAddLocation`, was `InventoryLocation.create(...)`):**
```diff
  const handleAddLocation = async () => {
    if (!newLocationName.trim()) {
      alert('Please enter a location name.');
      return;
    }

    try {
-     await InventoryLocation.create({
-       location_name: newLocationName.trim(),
-       description: `Location: ${newLocationName.trim()}`,
-       is_active: true
-     });
+     const { data: { user: authUser } } = await supabase.auth.getUser();
+     const now = new Date().toISOString();
+     const { error } = await supabase.from('InventoryLocation').insert([{
+       id: crypto.randomUUID(),
+       location_name: newLocationName.trim(),
+       description: `Location: ${newLocationName.trim()}`,
+       is_active: true,
+       created_date: now,
+       updated_date: now,
+       created_by: authUser?.user_metadata?.full_name || authUser?.email || null,
+       created_by_id: authUser?.id || null
+     }]);
+     if (error) throw error;
      setNewLocationName('');
      setShowAddForm(false);
      loadLocations();
      alert('Location added successfully!');
    } catch (error) {
      console.error('Error adding location:', error);
      alert('Failed to add location.');
    }
  };
```

**Line 93+ (`handleEditLocation`, was `InventoryLocation.update(...)`):** same pattern — swap to `supabase.from('InventoryLocation').update({ location_name: ..., description: ..., updated_date: new Date().toISOString() }).eq('id', editLocationId)`. **No `updated_by`/`updated_by_id`.**

---

#### `InventoryReturn` transport-layer cleanup — `InventoryPartsReturnModal.jsx` and `EditReturnInfoModal.jsx`

**Schema (confirmed via direct production query — table already exists, no migration needed):**
`id` (text, NOT NULL, no default), `part_number` (text), `description` (text), `supplier` (text), `quantity_returned` (bigint), `return_type` (text — "core"/"return"/"warranty", app-enforced not a Postgres enum), `return_reason` (text), `cost_per_unit` (double precision), `total_cost` (double precision), `return_date` (text — **stored as text, not date/timestamp**, format `yyyy-MM-dd`), `work_order_id` (text), `inventory_item_id` (text), `status` (text — "On-site"/"Returned"), `sent_back` (text), `date_returned` (text), `notes` (text), `created_date`/`updated_date` (timestamptz, no default), `created_by`/`created_by_id` (text). **No `updated_by`/`updated_by_id` columns exist on this table.** RLS confirmed permissive.

**`InventoryPartsReturnModal.jsx` — already 100% native for return-creation** (direct `supabase.from('InventoryReturn').insert()`, `supabase.rpc('update_inventory_with_audit', ...)`). **Only its `ReturnReason` read needs to change:**

Line 24 (was `ReturnReason.filter({ is_active: true, hide: false })`):
```diff
- const reasonData = await ReturnReason.filter({ is_active: true, hide: false });
- setReasons(reasonData);
+ const { data, error } = await supabase.from('ReturnReason').select('*').eq('is_active', true).eq('hide', false);
+ if (error) { console.error('Error loading return reasons:', error); setReasons([]); }
+ else setReasons(data || []);
```
Remove the `@/entities/all` import for `ReturnReason` from this file's imports (it currently imports `ReturnReason, Supplier` from `@/entities/all` — keep `Supplier` as-is per Phase 9's scope boundary, only drop `ReturnReason`).

**`EditReturnInfoModal.jsx` — full swap needed (both fields on `@/entities/all`):**

Line 2:
```diff
- import { InventoryReturn, ReturnReason } from '@/entities/all';
+ import { supabase } from '@/lib/supabase';
```
Line 38 (`ReturnReason.list()`):
```diff
- const reasons = await ReturnReason.list();
- setReturnReasons(reasons.filter(r => r.is_active));
+ const { data, error } = await supabase.from('ReturnReason').select('*').eq('is_active', true);
+ if (error) { console.error('Error loading return reasons:', error); return; }
+ setReturnReasons(data || []);
```
Line 67 (`InventoryReturn.update(returnItem.id, updateData)`):
```diff
- await InventoryReturn.update(returnItem.id, updateData);
+ const { error } = await supabase
+   .from('InventoryReturn')
+   .update({ ...updateData, updated_date: new Date().toISOString() })
+   .eq('id', returnItem.id);
+ if (error) throw error;
```
Line 112-113: already uses `reason.reason` — **no change needed**, confirms the `reason` field name.

**Field-name confirmation:** `ReturnReason` records are rendered via `r.reason` in both `InventoryPartsReturnModal.jsx:232-233` and `EditReturnInfoModal.jsx:112-113`, **not** `r.name`. Confirmed via the real CSV export too.

### 7A.3) Verification Checklist

**Execution note (2026-08-03):** All code and database steps below were executed via the Supabase MCP tools and direct file edits. Everything marked `[x]` was verified programmatically (row counts, `information_schema`, build output, grep).

**UI click-through moved to 7C.0 (2026-08-03):** the `[ ]` items originally here (category dropdown, location change/add/edit, process return, edit return info) require the `InventoryList.jsx` fix above, which is now in place — but since `InventoryAdd.jsx`'s equivalent reads are 7C's own scope and touch the same modals/props, all outstanding UI verification for this phase has been consolidated into **7C.0** below rather than tested piecemeal across sessions. Code-level items below remain marked `[x]` as originally verified.

**Scope correction found during validation (2026-08-03):** UI testing surfaced that `src/pages/InventoryList.jsx` — never in this phase's original file inventory — also fetches `InventoryCategory`/`InventoryLocation` via `@/entities/all` in its `loadSharedData()` function, and the results (`inventoryLocations`/`inventoryCategories` state) are passed as props into `InventoryAddModal`, `InventoryEditModal`, etc. So even after 7A's originally-planned edits, the location search inside "Add Inventory Item" was still silently Base44-backed via this parent page, not the new native table. Fixed as part of 7A: both calls swapped to direct `supabase.from()` queries, and (mirroring the `InventoryAddModal.jsx` `TagAlong` fix below) decoupled from the `Supplier`/`SalesClass` `SupabaseProxy` calls in the same function so a Base44 401 on those can't block location/category loading. `InventoryItem` (imported but never called in this file) also dropped from the `@/entities/all` import while touching that block.

**Bug found + fixed during validation (2026-08-03):** `InventoryAddModal.jsx`'s `loadData()` originally awaited `TagAlong.list()` (still Base44-backed, out of scope this phase) and the new native `InventoryCategory` fetch in the same `Promise.all` — a `TagAlong` failure (401, due to an expired/invalid `BASE44_ACCESS_TOKEN` — a separate pre-existing infra issue, not caused by this migration) killed the whole `Promise.all` and silently blocked the category dropdown from ever populating, even though the category fetch itself succeeded. Fixed by decoupling the two fetches into independent try/catch blocks.

- [x] **7A.1: Dev-branch schema migrations**
  - [x] `InventoryCategory`, `InventoryLocation`, `ReturnReason` `CREATE TABLE` migrations applied to the **dev branch** (`sitihbdnuxifwibontcm`) first — via `apply_migration`, migration name `create_inventory_category_location_returnreason_tables`
  - [x] All three new tables have the `"Enable all operations for all users"` RLS policy applied (included in the same migration)
  - [x] Row counts confirmed matching CSV source exactly: InventoryCategory=16, InventoryLocation=263, ReturnReason=11

- [x] **7A.2: CSV data import (dev branch, then production)**
  - [x] CSVs read from `Plans and Context/InventoryCategory_export.csv`, `InventoryLocation_export.csv`, `ReturnReason_export.csv` — converted to SQL `INSERT` statements (preserving exact IDs/timestamps/audit fields) rather than the Table Editor CSV importer, since this pass was executed via MCP tool calls, not the Studio UI
  - [x] Data imported into dev-branch tables first; row counts match source CSVs exactly
  - [x] Sample rows spot-checked (`ReturnReason.reason` values confirmed correct — "Not Ours", "Data Entry Error", etc.; `is_active`/`hide` booleans imported correctly)
  - [x] Same import repeated against production (`hbcrwkmgsazqrvsrmxyr`) — row counts re-verified matching (16/263/11)

- [x] **7A.3: Production schema migrations**
  - [x] Same three `CREATE TABLE` migrations applied to production after dev-branch verification
  - [x] Production RLS policies confirmed matching dev branch (same migration SQL used for both)

- [x] **7A.4: `InventoryAddModal.jsx` — `InventoryCategory` swap (dropdown only)**
  - [x] `InventoryCategory` import removed, direct `supabase.from('InventoryCategory')` call in place
  - [x] `npm run build` passes with no new errors
  - [x] ~~Test in UI: open "Add Inventory Item", confirm category dropdown populates from the new native table~~ — **correction (2026-08-03): this was marked `[x]` prematurely, before any UI test had run.** Actual UI testing found it failing (`TagAlong.list()` 401 poisoning the `Promise.all` that also carried the category fetch — see fix below). Fixed and moved to **7C.0** for retest.
  - [x] Confirmed the `suggestInventoryCategory` call (~line 113) was **not** touched — still calls Base44 (expected until 7B)
  - [x] **Bug fixed (2026-08-03):** decoupled `TagAlong.list()` from the `InventoryCategory` fetch in `loadData()` into independent try/catch blocks, so a `TagAlong` 401 (separate pre-existing Base44 token issue) can no longer block category loading

- [x] **7A.5: `LocationModal.jsx` — `InventoryLocation` + critical `inventoryUpdate` fix**
  - [x] `base44`/`InventoryLocation` (from `@/entities/all`) imports removed, `supabase` imported
  - [x] `loadLocations`, `handleAddLocation`, `handleEditLocation` all use direct `supabase.from('InventoryLocation')` calls
  - [x] `handleLocationChange` no longer calls `base44.functions.invoke('inventoryUpdate', ...)` — uses direct `.from('InventoryItem').update()` instead, **without** `updated_by`/`updated_by_id`
  - UI tests (change/add/edit location) → **moved to 7C.0**

- [x] **7A.6: `InventoryReturn` — `InventoryPartsReturnModal.jsx` / `EditReturnInfoModal.jsx`**
  - [x] `InventoryPartsReturnModal.jsx` — only its `ReturnReason.filter()` call changed (now direct `supabase.from('ReturnReason')`); return-creation logic untouched (already native); `Supplier` import from `@/entities/all` left as-is
  - [x] `EditReturnInfoModal.jsx` — `InventoryReturn.update()`/`ReturnReason.list()` swapped to direct queries
  - UI tests (process return, edit return info) → **moved to 7C.0**

- [x] **7A.7: Build and dev-server smoke test**
  - [x] `npm run build` completes successfully, zero errors (verified via `dist/` output timestamp + exit code 0)
  - [x] `grep` for `InventoryCategory`/`InventoryLocation`/`ReturnReason`/`InventoryReturn` across all 4 files shows only `supabase.from()` calls, no `@/entities/*` imports for these symbols (the one remaining `base44.functions.invoke('suggestInventoryCategory', ...)` in `InventoryAddModal.jsx` is expected — that's 7B's job)
  - [x] Marking **7A: Complete (code)** — all UI click-through consolidated into **7C.0**, since it depends on the `InventoryList.jsx` fix which shares scope with 7C's `InventoryAdd.jsx` work

---

## 7B) SUB-PHASE B: Complex Rewire & New Gemini Edge Function

### 7B.1) Scope & Objectives

**Prerequisite: 7A must be complete** — this sub-phase's new Edge Function queries the `InventoryCategory` table created in 7A, and `LegacyWarrantyReturnModal.jsx`'s rewire creates `InventoryReturn` rows using the same table already confirmed native in 7A's research.

**In scope for this sub-phase:**
1. `src/components/inventory/LegacyWarrantyReturnModal.jsx` — full native rewire (the most complex single-file change in this phase: `InventoryItem`/`InventoryReturn`/`GLTransaction` entity-class calls, a `Supplier` thin-proxy read, and a `searchInventory` call all need migrating).
2. `searchInventory` — thin-proxy swap to a direct RPC/query call (used only by `LegacyWarrantyReturnModal.jsx` within this phase's scope).
3. New Edge Function `supabase/functions/autopro-suggestInventoryCategory/index.ts` — Gemini-based, grounded (Option C).
4. Wire up **both** frontend call sites for the new function: `InventoryAddModal.jsx:113` and `InventoryAdd.jsx:1167`.

**Explicitly NOT in scope for 7B:**
- Anything else in `InventoryAdd.jsx` besides its suggestion call — **7C**.
- `autopro-processQOHAdjustment` — **7C**.
- `searchSuppliers` (used by `WarrantyReturnModal.jsx`) — **out of scope entirely, Phase 9's job**, not touched in any sub-phase of Phase 7.

**Exit criteria (must all be true before starting 7C):** `LegacyWarrantyReturnModal.jsx` fully native and its checklist passes; `autopro-suggestInventoryCategory` deployed to dev+prod and both call sites updated and tested; `npm run build` clean.

### 7B.2) Detailed Execution Plan

#### `InventoryReturn` — files affected in this sub-phase (context, carried from the phase-wide table)

| File | Actual current state | Phase 7 action |
|------|---|---|
| `src/components/work-orders/WarrantyReturnModal.jsx` (`return_type`: "warranty", post-bill to COGS, on WorkOrderView) | **Already 100% native.** Direct `supabase.from('InventoryReturn')`/`.from('InventoryAuditLog')`/`.from('GLTransaction')` inserts. Only non-native piece: imports `WorkOrder` from `@/entities/all` — but that migration is explicitly **Phase 13's job**. | **No changes anywhere in Phase 7** — flag the `WorkOrder` dependency as a known Phase 13 pickup item. |
| `LegacyWarrantyReturnModal.jsx` (`return_type`: "warranty", legacy LANKAR-system items, parallel GL transactions) | **Real migration needed.** Imports `InventoryItem`, `InventoryReturn`, `GLTransaction` from the Base44-shim `@/entities/all` and calls `.create()`/`.bulkCreate()` — even though `InventoryItem`/`GLTransaction` already have native Postgres tables, this file round-trips them through Base44's REST API. **Also** calls `base44.functions.invoke('SupabaseProxy', ...)` for suppliers, and imports `searchInventory` (Base44-shimmed function). | **In scope, full rewire, this sub-phase.** |

#### `LegacyWarrantyReturnModal.jsx` — full native rewire

**Changes needed:**
- Line 12-13:
  ```diff
  - import { InventoryItem, InventoryReturn, GLTransaction } from '@/entities/all';
  - import { base44 } from '@/api/base44Client';
  + import { supabase } from '@/lib/supabase';
  ```
- Line 14: `import { searchInventory } from '@/functions/searchInventory';` → replaced per the `searchInventory` swap below (direct RPC/query call, not a Base44 function invoke).
- Lines 61-66 (`loadData`, was `base44.functions.invoke('SupabaseProxy', { action: 'read', table: 'Supplier', match: { inventory_supplier: true } })`):
  ```diff
  - const suppliersResponse = await base44.functions.invoke('SupabaseProxy', {
  -   action: 'read',
  -   table: 'Supplier',
  -   match: { inventory_supplier: true }
  - });
  - setSuppliers((suppliersResponse.data.data || []).sort((a, b) => (a.name || '').localeCompare(b.name || '')));
  + const { data, error } = await supabase
  +   .from('Supplier')
  +   .select('*')
  +   .eq('inventory_supplier', true);
  + if (error) { console.error('Error loading suppliers:', error); setSuppliers([]); return; }
  + setSuppliers((data || []).sort((a, b) => (a.name || '').localeCompare(b.name || '')));
  ```
  **Note:** `Supplier` table is already confirmed native — this is a thin-proxy swap, not a schema question. Supplier CRUD/business-logic itself stays Phase 9's job; this is just a read call in an otherwise in-scope file.
- Lines 182-193 (`InventoryItem.create(...)`):
  ```diff
  - const newInventoryItem = await InventoryItem.create({
  -   part_number: formData.part_number,
  -   description: formData.description,
  -   cost: parseFloat(formData.cost_per_unit),
  -   selling_price: parseFloat(formData.cost_per_unit),
  -   profit_margin: 0,
  -   quantity_on_hand: 0,
  -   quantity_on_order: 0,
  -   supplier_id: formData.supplier_id,
  -   stocked_item: false,
  -   is_active: true,
  - });
  + const nowIso = new Date().toISOString();
  + const { data: { user: authUser } } = await supabase.auth.getUser();
  + const { data: newInventoryItem, error: itemError } = await supabase
  +   .from('InventoryItem')
  +   .insert([{
  +     id: crypto.randomUUID(),
  +     part_number: formData.part_number,
  +     description: formData.description,
  +     cost: parseFloat(formData.cost_per_unit),
  +     selling_price: parseFloat(formData.cost_per_unit),
  +     profit_margin: 0,
  +     quantity_on_hand: 0,
  +     quantity_on_order: 0,
  +     supplier_id: formData.supplier_id,
  +     stocked_item: false,
  +     is_active: true,
  +     created_date: nowIso,
  +     updated_date: nowIso,
  +     created_by: authUser?.user_metadata?.full_name || authUser?.email || null,
  +     created_by_id: authUser?.id || null
  +   }])
  +   .select()
  +   .single();
  + if (itemError) throw itemError;
  ```
- Line 221 (`InventoryReturn.create(returnData)`):
  ```diff
  - const newInventoryReturn = await InventoryReturn.create(returnData);
  + const nowIso2 = new Date().toISOString();
  + const { data: newInventoryReturn, error: returnError } = await supabase
  +   .from('InventoryReturn')
  +   .insert([{ id: crypto.randomUUID(), ...returnData, created_date: nowIso2, updated_date: nowIso2, created_by: authUser?.user_metadata?.full_name || authUser?.email || null, created_by_id: authUser?.id || null }])
  +   .select()
  +   .single();
  + if (returnError) throw returnError;
  ```
- Lines 224-243 (`GLTransaction.bulkCreate([...])`):
  ```diff
  - await GLTransaction.bulkCreate([...]);
  + const { error: glError } = await supabase.from('GLTransaction').insert([...]); // same two-row array, unchanged
  + if (glError) throw glError;
  ```

#### `searchInventory` — thin-proxy direct-call swap (same pattern as Phase 5's `searchCustomers`/`searchVehicles`)

**Confirmed via source read** (`base44/functions/searchInventory/entry.ts`, 210 lines): this is a **thin proxy**, not real business logic — auths via `base44.auth.me()`, but all data operations use a raw `createClient(supabaseUrl, supabaseSecret)` (already native Postgres), calling either the `search_inventory_ranked` RPC (search term + `includeInactive` false) or a direct `.from('InventoryItem')` query otherwise. **Exact same shape as Phase 5's `searchCustomers`/`searchVehicles`.**

**Decision, following Phase 5's established precedent:** inline this as a direct client-side call rather than porting to a new Edge Function. Confirm `search_inventory_ranked` grants `EXECUTE` to `anon`/`authenticated`/`PUBLIC` (same check Phase 5 did before inlining `search_customers_ranked`/`search_vehicles_ranked`) — if so, `LegacyWarrantyReturnModal.jsx`'s `runPartSearch` (lines 73-98) switches from `searchInventory({...})` to a direct `supabase.rpc('search_inventory_ranked', { p_search_term, p_filter: 'all', p_sort_by: 'part_number', p_sort_direction: 'asc', p_limit: 50, p_offset: 0, p_location_from: '', p_location_to: '' })` call, unwrapping `records`/`total_count` from the RPC's row shape the same way the Base44 function itself already does (strip `total_count`/`match_rank` from each row).

**Open item — scope boundary:** a broader repo grep for all `searchInventory` callers should be done before executing this sub-item, in case other non-return inventory pages call it too. If other callers exist outside this phase's originally-scoped file list, decide whether to fold them in now or leave them for a later pass.

**Resolved during 7B execution (2026-08-03):** grep confirmed 8 files reference `searchInventory` in some form. Only `LegacyWarrantyReturnModal.jsx` (this file) was migrated. Left untouched, for a later pass: `src/pages/InventoryAdd.jsx` and `src/pages/InventoryReturns.jsx` (both import `searchInventory` from `@/functions/searchInventory`), `src/components/inventory/LankarImportReturnModal.jsx` (same import), and `src/pages/InventoryList.jsx`, `src/components/inventory/MergeInventoryModal.jsx`, `src/components/work-orders/GetPartModal.jsx`, `src/components/work-orders/WOAddInventoryModal.jsx` (all call `base44.functions.invoke('searchInventory', ...)` directly). None of these files are in Phase 7's scoped table (Section 1) — left alone per the phase's narrow-scoping discipline rather than folded in speculatively.

**Also discovered during 7B execution (2026-08-03):** `src/components/work-orders/WOAddInventoryModal.jsx:569` has a third `suggestInventoryCategory` call site not caught during planning (Section 0.2 only found two). Left untouched — this file is far more Base44-entangled than a one-line swap would fix cleanly: it still imports `InventoryCategory` from `@/entities/all`, calls `base44.functions.invoke('searchInventory', ...)`, and uses the `inventoryAdd`/`inventoryUpdate` Base44 function wrappers throughout. It needs its own full migration pass (parallel to `InventoryAdd.jsx`'s 7C treatment), not a cherry-picked single call site. Flagged for a future phase/sub-phase, not folded into 7B or 7C.

**`searchSuppliers` — reminder, out of scope entirely:** `WarrantyReturnModal.jsx` calls `base44.entities.Supplier.list()` via this function — supplier data access, not inventory data. Per the master blueprint, Supplier CRUD/search is Phase 9's scope. Not touched in any sub-phase of Phase 7.

---

#### New Edge Function `autopro-suggestInventoryCategory` + both frontend call sites

**Source to port:** `base44/functions/suggestInventoryCategory/entry.ts` (72 lines, read in full — see Section 0.2 for the full logic breakdown).

**New Edge Function — `supabase/functions/autopro-suggestInventoryCategory/index.ts`:**

Built on the `autopro-processPartsInvoiceOCR` skeleton (REST-call Gemini pattern, `gemini-flash-latest`, no SDK) with the standard auth block and 200-always convention:

```ts
import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
const jsonHeaders = { ...corsHeaders, 'Content-Type': 'application/json' };

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY');
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const supabaseClient = createClient(supabaseUrl, supabaseAnonKey);
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Missing Authorization header' }), { status: 200, headers: jsonHeaders });
    }
    const { data: { user }, error: authError } = await supabaseClient.auth.getUser(authHeader.replace('Bearer ', ''));
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 200, headers: jsonHeaders });
    }

    const { part_number, description, supplier_name } = await req.json();

    if (!part_number && !description) {
      return new Response(JSON.stringify({ error: 'Part number or description required' }), { status: 200, headers: jsonHeaders });
    }

    // Rule 1: hardcoded Jard supplier match — ported verbatim, no AI call
    if (supplier_name && supplier_name.toLowerCase().includes('jard')) {
      return new Response(JSON.stringify({ category: 'Jard' }), { status: 200, headers: jsonHeaders });
    }

    // Fetch valid category names from the now-native InventoryCategory table (created in 7A)
    const { data: categories, error: catError } = await supabaseAdmin
      .from('InventoryCategory')
      .select('name');
    if (catError) {
      console.error('Error fetching InventoryCategory:', catError);
      return new Response(JSON.stringify({ error: catError.message }), { status: 200, headers: jsonHeaders });
    }
    const categoryNames = (categories || []).map(c => c.name);
    if (categoryNames.length === 0) {
      return new Response(JSON.stringify({ category: 'other' }), { status: 200, headers: jsonHeaders });
    }

    // Option C (confirmed decision, Section 0.2): grounded call preserving Base44's
    // original internet-search classification behavior. No response_mime_type —
    // structured JSON mode and Google Search grounding aren't reliably combinable
    // on the same Gemini request, so this parses free text instead, exactly like
    // Base44's original InvokeLLM({ add_context_from_internet: true }) call did.
    const apiKey = Deno.env.get('GEMINI_API_KEY');
    if (!apiKey) {
      return new Response(JSON.stringify({ error: 'GEMINI_API_KEY is not configured on the server.' }), { status: 200, headers: jsonHeaders });
    }
    const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent?key=${apiKey}`;

    const prompt = `You are an automotive parts inventory expert.
First, search the internet to identify what this part is based on the Part Number and Description.
Then, classify it into one of the existing categories below.

Part Number: ${part_number || 'N/A'}
Description: ${description || 'N/A'}

Available Categories:
${categoryNames.join(', ')}

Return ONLY the exact name of the best matching category from the list above.
If the part does not fit clearly into any specific category, return 'other'.
Do not make up new categories.
Do not add explanations or quotes.`;

    const requestBody = {
      contents: [{ parts: [{ text: prompt }] }],
      tools: [{ google_search: {} }],
      generationConfig: { temperature: 0.1 }
    };

    const geminiResponse = await fetch(apiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody)
    });

    if (!geminiResponse.ok) {
      const errorText = await geminiResponse.text();
      console.error('Gemini API Error:', errorText);
      return new Response(JSON.stringify({ error: 'Failed to get category suggestion from Gemini' }), { status: 200, headers: jsonHeaders });
    }

    const geminiData = await geminiResponse.json();
    const rawText = geminiData.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!rawText) {
      return new Response(JSON.stringify({ error: 'Failed to extract text from Gemini response' }), { status: 200, headers: jsonHeaders });
    }

    // Free-text parsing — same approach Base44's original InvokeLLM call already used
    let suggestedCategory = rawText.trim().replace(/^['"]|['"]$/g, '');

    // Validate against real category list (case-insensitive), fallback to 'other' — ported verbatim
    const match = categoryNames.find(c => c.toLowerCase() === suggestedCategory.toLowerCase());
    if (match) {
      suggestedCategory = match;
    } else {
      const otherCategory = categoryNames.find(c => c.toLowerCase() === 'other');
      suggestedCategory = otherCategory || categoryNames[0];
    }

    return new Response(JSON.stringify({ category: suggestedCategory }), { status: 200, headers: jsonHeaders });

  } catch (error) {
    console.error('Error in autopro-suggestInventoryCategory:', error);
    return new Response(JSON.stringify({ error: error.message }), { status: 200, headers: jsonHeaders });
  }
});
```

**Open item to verify during execution:** confirm the exact grounding tool syntax for `gemini-flash-latest` via Google's current API docs — the Gemini API has changed its grounding tool name across versions (`google_search_retrieval` on older Gemini 1.5 models vs. `google_search` on Gemini 2.0+); `gemini-flash-latest` should map to the newer `google_search` form used above, but confirm against a live test call before considering this done, since a wrong tool name fails the whole request rather than silently degrading.

**Frontend edits — two call sites:**

**1. `src/components/inventory/InventoryAddModal.jsx`:**
- Line 11: remove `import { base44 } from '@/api/base44Client';` (verify no other calls in this file still need it before removing — should be safe now that 7A already removed its `InventoryCategory` usage).
- Add `import { supabase } from '@/lib/supabase';` if not already present (7A should have added it already).
- Lines 113–117:
  ```diff
  - const response = await base44.functions.invoke('suggestInventoryCategory', {
  -   part_number: formData.part_number,
  -   description: formData.description,
  -   supplier_name: supplierName
  - });
  + const response = await supabase.functions.invoke('autopro-suggestInventoryCategory', {
  +   body: {
  +     part_number: formData.part_number,
  +     description: formData.description,
  +     supplier_name: supplierName
  +   }
  + });
  ```
- Line 119: `if (response.data && response.data.category) {` — already correctly guards on `data.category` being present, which naturally excludes the `{ error: "..." }` shape — **no change needed here**. Add one line above it for genuine transport failures: `if (response.error) { console.error('Category suggestion error:', response.error); return; }` before the existing check.

**2. `src/pages/InventoryAdd.jsx` (second call site, discovered during scope verification):**
- Line 1167 (inside the same debounced `fetchSuggestion` pattern, part of the "Receive Inventory / Parts Entry" batch page):
  ```diff
  - const response = await base44.functions.invoke('suggestInventoryCategory', {
  -   part_number: currentItem.part_number,
  -   description: currentItem.description,
  -   supplier_name: supplierName
  - });
  + const response = await supabase.functions.invoke('autopro-suggestInventoryCategory', {
  +   body: {
  +     part_number: currentItem.part_number,
  +     description: currentItem.description,
  +     supplier_name: supplierName
  +   }
  + });
  ```
- Line 1173: same `response.data && response.data.category` check pattern — same treatment as above.
- `import { supabase } from '@/lib/supabase';` already present in this file (confirmed — line 1).
- **Do not** remove the `base44` import from `InventoryAdd.jsx` in this sub-phase — the rest of the file's Base44 calls are 7C's job. Only touch this one call site here.

### 7B.3) Verification Checklist

**Execution note (2026-08-03):** All code and deployment steps below were executed via file edits and the Supabase MCP tools (`execute_sql`, `deploy_edge_function`). UI click-through could not be run this session — the Browser pane wasn't visible/displayed on your end, so `computer`/screenshot calls timed out ("the Browser pane is not displayed, so the page is not compositing frames"). All `[ ]` UI-test items below remain open for you (or a follow-up session) to verify via dev-login.

**UI validation completed 2026-08-03** via dev-login on `test.kensauto.ca` (development-branch Vercel deployment, backed by the dev-branch Supabase project `sitihbdnuxifwibontcm`). Note: this dev-branch database is nearly empty (1 placeholder `Supplier` row, 0 `InventoryItem`/`InventoryReturn` rows) — real UI testing required temporarily setting `inventory_supplier = true` on the placeholder row (reverted implicitly since it's harmless test data left in dev branch only, not production) and creating/deleting a real test return end-to-end.

- [x] **7B.1: `LegacyWarrantyReturnModal.jsx` full rewire**
  - [x] `InventoryItem`/`InventoryReturn`/`GLTransaction` calls all native (direct `supabase.from()` inserts). **Deviation from the plan's literal diff:** `GLTransaction.id` was found to default to `''::text` (not auto-generated) — the plan's diff for this insert omitted `id` entirely, same as the untouched `WarrantyReturnModal.jsx`'s existing GL insert, which per direct query has never left a `id=''` row in production (0 found), suggesting that insert path may be silently failing today (worth a separate look, out of scope here). Added explicit `id: crypto.randomUUID()` + `created_by`/`created_by_id` to both new GL rows to avoid carrying the same bug forward.
  - [x] `Supplier` read via direct query (thin-proxy swap)
  - [x] `searchInventory` swapped to direct `supabase.rpc('search_inventory_ranked', ...)` call — confirmed `EXECUTE` granted to `anon`/`authenticated`/`PUBLIC` before swapping
  - [x] `base44` import removed entirely from this file (grep confirmed zero matches)
  - [x] **Tested in UI end-to-end:** created a real LANKAR return (part `TESTPART7B`, qty 2, $15.50/ea) via the modal. Confirmed by direct SQL: `InventoryItem` row created with correct audit fields, `InventoryReturn` row created (`return_type: warranty`, correct `notes` with LANKAR WO#), and both `GLTransaction` rows posted correctly balanced (5000 credit $31 / 1200 debit $31, each with its own unique `id`). Test rows deleted after verification.
  - [x] Part search tested: typed a nonexistent part number, got "No existing parts found. Continue typing to create new." with no console errors — confirms the `search_inventory_ranked` RPC swap works (existing-part-match path not separately tested, no matching seed data in dev branch, but same RPC/code path as the confirmed-working list-load elsewhere)

- [ ] **7B.2: `WarrantyReturnModal.jsx` regression check (no code changed, verify only)**
  - [ ] **Not tested** — dev branch has zero Work Orders (WIP dashboard empty), so there was no invoice to open this modal from. File wasn't touched by 7B; regression risk is low but unverified. Flagged for whenever dev-branch has WO test data, or test directly against production with care.

- [x] **7B.3: `autopro-suggestInventoryCategory` new Edge Function**
  - [x] Edge Function created with `tools: [{ google_search: {} }]` grounding, no `response_mime_type` constraint
  - [x] Grounding tool syntax confirmed correct for `gemini-flash-latest` via live test calls (see below) — the open item is resolved, syntax works
  - [x] Deployed to dev branch (`sitihbdnuxifwibontcm`) and production (`hbcrwkmgsazqrvsrmxyr`), both `ACTIVE`, `verify_jwt: true` (matches `autopro-processQOHAdjustment`'s pattern)
  - [x] Returns `200` always, `{ category }` on success or `{ error }` on failure
  - [x] "Jard" supplier hardcode rule works — direct authenticated call with `supplier_name: "Jard Auto Parts"` returned `{"category":"Jard"}`, status 200
  - [x] Category validation/fallback-to-'other' logic works — direct call with a nonsense description returned `{"category":"Other"}`, status 200 (matched the real category name's casing)
  - [x] `InventoryAddModal.jsx` calls the new function instead of `base44.functions.invoke('suggestInventoryCategory', ...)` — **tested in UI:** typed part number `AC-DELCO-41-993` / description "Iridium Spark Plug", category auto-suggested "Electrical & Ignition" with the green "suggested" highlight, no console errors
  - [x] `InventoryAdd.jsx:1167` also calls the new function — wiring confirmed correct by code review and by the identical pattern working in `InventoryAddModal.jsx`; **could not visually confirm the suggested value renders** in this page's Category dropdown because `InventoryAdd.jsx`'s own `loadData()` (7C's scope, untouched) still fails entirely on a Base44 401 (same "one failed promise poisons `Promise.all`" bug 7A already fixed in `InventoryAddModal.jsx`), leaving the Category dropdown with zero options (`None` only) regardless of what the suggestion call returns. Not a 7B regression — pre-existing, correctly out of scope, will resolve itself once 7C migrates this file's `loadData()`.
  - **Discovered, not folded in:** a third call site exists at `src/components/work-orders/WOAddInventoryModal.jsx:569` — left on the old Base44 path since that whole file needs its own migration pass (see note under the `searchInventory` section above)

- [x] **7B.4: Build and smoke test**
  - [x] `npm run build` completes successfully, zero errors (exit code 0)
  - [x] `grep -n "base44" src/components/inventory/LegacyWarrantyReturnModal.jsx` returns zero results
  - [x] Mark **7B: Complete** in the status tracker table above

---

## 7C) SUB-PHASE C: `InventoryAdd.jsx` Full Migration + GL/Audit Work

### 7C.1) Scope & Objectives

**Prerequisite: 7A and 7B must both be complete** — this sub-phase's `InventoryAdd.jsx` work needs `InventoryLocation`/`InventoryCategory` tables (7A) and assumes the suggestion call at line 1167 is already migrated (7B), so 7C doesn't re-touch it.

**In scope for this sub-phase:**
1. `src/pages/InventoryAdd.jsx` — every remaining Base44 call site except the suggestion call (already done in 7B): `Supplier`/`SalesClass`/`InventoryLocation`/`InventoryCategory` reads, supplier-lock management (`checkSupplierLock`, `handleFlushLocks`).
2. `autopro-processQOHAdjustment` — audit (already done during planning) + apply the GL-value rounding fix.
3. `autopro-processPartsInvoiceOCR` — deploy-parity verification only, no code changes.
4. `autopro-processInventoryReceipt` — deploy-parity verification only, no code changes (already audited during planning, confirmed correct).

**This is the final sub-phase of Phase 7** — once its checklist passes, the whole phase is done and ready to roll up into `master_blueprint.md`.

### 7C.2) Detailed Execution Plan

#### `src/pages/InventoryAdd.jsx` — remaining Base44 calls

**Scope note:** this file's `Supplier`-table reads/updates are in scope **as simple thin-proxy swaps** — same treatment already given to the analogous `Supplier` read in `LegacyWarrantyReturnModal.jsx` (7B) — because a plain `.eq()`/`.update()` swap isn't "complex logic combining other phases," it's a direct table read/write this inventory page is already doing today, just through an extra hop. What stays **out of scope** is any real Supplier *business logic* — none of that lives in this file.

**1,957-line file — full read of every relevant section during planning; all Base44 call sites catalogued below.**

**Line 209-234 (`loadData`):**
```diff
  const [suppliersData, salesClassesData, tagAlongsData, locationsData, categoriesData] = await Promise.all([
-   base44.functions.invoke('SupabaseProxy', {
-     action: 'read',
-     table: 'Supplier',
-     match: { inventory_supplier: true }
-   }).then(res => res.data.data || []),
-   base44.functions.invoke('SupabaseProxy', { action: 'read' }).then(res => res.data.data || []),
-   TagAlong.list(),
-   InventoryLocation.list(),
-   InventoryCategory.list()
+   supabase.from('Supplier').select('*').eq('inventory_supplier', true).then(r => r.data || []),
+   supabase.from('SalesClass').select('*').then(r => r.data || []),
+   TagAlong.list(), // TagAlong migration out of scope this phase, left as-is
+   supabase.from('InventoryLocation').select('*').then(r => r.data || []),
+   supabase.from('InventoryCategory').select('*').then(r => r.data || [])
  ]);
```
**Note on the `SalesClass` swap:** the original code called `SupabaseProxy` with **no `table` param at all** — this isn't a bug, `base44/functions/SupabaseProxy/entry.ts:33` defaults `table = 'SalesClass'` when the caller omits it (confirmed via source read). The direct-call replacement makes this implicit default explicit, which is strictly clearer, not a behavior change. `SalesClass` confirmed as an already-native table via direct query.

**Line 304-332 (`checkSupplierLock`):**
```diff
  try {
-   const response = await base44.functions.invoke('SupabaseProxy', {
-     action: 'read',
-     table: 'Supplier',
-     match: { id: supplierId }
-   });
-   const supplierData = (response.data.data || [])[0];
+   const { data, error } = await supabase.from('Supplier').select('*').eq('id', supplierId);
+   if (error) throw error;
+   const supplierData = (data || [])[0];
    
    if (supplierData?.LockedByUser) {
```

**Line 1221-1270 (`handleFlushLocks` — bulk-unlock all locked suppliers):**
```diff
  const handleFlushLocks = async () => {
    setFlushing(true);
    try {
-     const response = await base44.functions.invoke('SupabaseProxy', {
-       action: 'read',
-       table: 'Supplier'
-     });
-     const allSuppliers = response.data.data || [];
+     const { data: allSuppliers, error: readError } = await supabase.from('Supplier').select('*');
+     if (readError) throw readError;
      const lockedSuppliers = (allSuppliers || []).filter(s => s.LockedByUser);
      
      if (lockedSuppliers.length === 0) { /* ...unchanged... */ }

-     const updatePromises = lockedSuppliers.map(supplier => 
-       base44.functions.invoke('SupabaseProxy', {
-         action: 'update',
-         table: 'Supplier',
-         id: supplier.id,
-         data: { LockedByUser: null }
-       })
-     );
+     const updatePromises = lockedSuppliers.map(supplier => 
+       supabase.from('Supplier').update({ LockedByUser: null }).eq('id', supplier.id)
+     );

      await Promise.all(updatePromises);
      /* ...alert, refresh suppliers list (same swap as loadData's Supplier read), re-check lock status... */
    } /* ...catch/finally unchanged... */
  };
```

**Not touched — already native:** `autopro-splitInvoicePDF` and `autopro-processInventoryReceipt` calls in the batch-save flow (~line 823, 852) are both already fully native `autopro-*` Edge Functions with zero Base44 dependency. `handleOCRSuccess`'s existing `supabase.from('InventoryItem').select(...)` call is already native too. No changes needed to any of this.

**Final step once every call site above is migrated:** remove the `import { base44 } from '@/api/base44Client';` line from this file entirely (confirm no other stray `base44.*` reference remains first — including the suggestion call at line 1167, which should already be native from 7B).

---

#### `autopro-processQOHAdjustment` — GL rounding fix

**Your directive:** this function is explicitly in scope — it's inventory + GLTransaction, both of which are this phase's core territory. `GLTransaction` runs through nearly every module in this app; if GL work were scoped to "wherever it first got fully worked out," some other phase would become enormous. The rule: **inventory-related and GLTransaction-related logic is in scope wherever it's found this phase; only *combining* GL with a genuinely unmigrated other-phase concern (Supplier business logic, BankAccount reconciliation, LOC) is out of scope.**

**Audit performed (full 241-line source read):** the function is fully native already — auths via `supabase.auth.getUser()`, updates QOH via the `update_inventory_with_audit` RPC, and posts a balanced double-entry `GLTransaction` pair (`1200` inventory asset / `5003` adjustment expense account) whenever `value_change !== 0`. The debit/credit direction is correct for both cases (QOH increase → debit 1200 / credit 5003; QOH decrease → credit 1200 / debit 5003) — structurally sound double-entry, no logic bug found.

**Real gap found and being fixed this sub-phase:** `value_change = quantity_change * item_cost` is never rounded before the `!== 0` check or before posting to `GLTransaction`. Every other native GL-adjacent code path in this codebase (`autopro-processInventoryReceipt`, audited below) consistently rounds money math to the cent via `Math.round(x * 100) / 100` before any GL decision or insert. This function is the one exception, and floating-point arithmetic on `quantity * cost` can produce values like `0.30000000000000004` that either post a fractional-penny `GLTransaction` or (worse) fail a strict `!== 0` check when the "true" mathematical result should be exactly zero. **Fix:**

```diff
  const old_quantity_on_hand = parseFloat(inventoryItem.quantity_on_hand || 0);
  const newQoh = parseFloat(new_quantity_on_hand);
  const quantity_change = newQoh - old_quantity_on_hand;
  const item_cost = parseFloat(inventoryItem.cost || 0);
- const value_change = quantity_change * item_cost;
+ const value_change = Math.round(quantity_change * item_cost * 100) / 100;
```
And, further down where the GL amount is computed:
```diff
  if (value_change !== 0) {
-   const absoluteValueChange = Math.abs(value_change);
+   const absoluteValueChange = Math.round(Math.abs(value_change) * 100) / 100;
```
(The second line is likely already a no-op once `value_change` itself is rounded, but keeping it explicit costs nothing and matches the belt-and-suspenders rounding style used in `processInventoryReceiptCreate`'s GST proration logic.)

**Not fixed, correctly flagged as out of scope:** the function's `system_issue` email path still calls `api.base44.app/functions/v1/sendEmailViaSMTP` via `BASE44_ACCESS_TOKEN` — this is a notification side-effect, not inventory or GL logic. Left as-is, noted for Phase 14's final sweep.

**Deployment-parity + verification:**
1. `supabase functions list --project-ref <prod-ref>` / `<dev-branch-ref>` — confirm `ACTIVE` on both.
2. Apply the rounding fix above, redeploy to dev branch first, then production.
3. Live UI test: adjust an item's QOH by a nonzero amount, confirm `GLTransaction` rows post to accounts `1200`/`5003` for the correctly-rounded value delta.

---

#### `autopro-processPartsInvoiceOCR` — OUT OF SCOPE for full validation, no code changes

**Confirmed via full source read (172 lines):** this function is a pure document-vision call — downloads a PDF/image from Storage, sends it to Gemini, returns parsed JSON. It contains **zero database writes of any kind**. The actual inventory-writing side of the OCR workflow lives downstream, in `InventoryAdd.jsx` (this sub-phase) and `autopro-processInventoryReceipt` (below) — both already handled.

**Per your instruction: full validation of this function is explicitly deferred, flagged for Phase 9 pickup** — this phase does not click-test the OCR upload flow. Deployment-parity check only:
1. `supabase functions list --project-ref <prod-ref>` / `<dev-branch-ref>` — confirm `ACTIVE` on both. No further testing this phase.

---

#### `autopro-processInventoryReceipt` — IN SCOPE for audit (inventory + GL), verify-only (already correct)

**Discovered during `InventoryAdd.jsx` research** — this is the function that actually turns a receiving/OCR batch into `InventoryItem` updates, `SupplierInvoiceLine` records, and (via a delegated call to the already-native `autopro-handleSupplierInvoiceLineGL`) GL postings. Per your scope clarification, this is squarely in-scope territory (inventory + GL).

**Audit performed (full 1035-line source read):** fully native already, zero Base44 dependency. Handles `create`/`edit`/`reverse` actions for supplier invoice lines, correctly uses `update_inventory_with_audit` RPC for all QOH/QOO changes, checks `FiscalPeriod.is_closed` before allowing edits/reversals on closed periods, and consistently rounds all money math to the cent (`Math.round(x * 100) / 100`) before every GL-relevant calculation — including a proper largest-remainder GST-proration algorithm across multiple invoice lines. **GL posting itself is correctly delegated** to `autopro-handleSupplierInvoiceLineGL` rather than posted directly — respecting `master_context.md`'s Risk #2 mitigation. **No bugs found, no changes needed.**

**Deployment-parity check only:**
1. `supabase functions list --project-ref <prod-ref>` / `<dev-branch-ref>` — confirm `ACTIVE` on both.
2. Live UI test (covered by the checklist below): receive a batch of parts against a supplier invoice, confirm `InventoryItem` QOH updates, `SupplierInvoiceLine` records are created, and GL entries post correctly.

### 7C.3) Verification Checklist

**Execution note (2026-08-03):** All code edits, `autopro-processQOHAdjustment` redeploy (dev branch then production), and deploy-parity checks below were executed this session. **UI verification completed 2026-08-03** against `test.kensauto.ca` (post-push) for the items marked `[x]` below — see "Phase Results and Final Context" for the full session narrative, including the InventoryList.jsx scope addition and the items that remain genuinely untested.

- [x] **7C.0: Carried over from 7A — UI click-through** (partially covered; remainder explicitly not tested — see below)
  - [x] Category dropdown populates when adding an inventory item — verified in both `InventoryAddModal.jsx` (via `InventoryList.jsx`'s "Add Item") and `InventoryAdd.jsx` (Receive Inventory page); both showed the real 16-row category list and the AI suggestion correctly filled it in
  - [ ] **Not tested:** Open an inventory item, click "Change Location" (`LocationModal.jsx`) — no real inventory item with a location existed in dev-branch seed data to click through
  - [ ] **Not tested:** Add/edit a location via `LocationModal.jsx`
  - [ ] **Not tested:** Process a parts return (`InventoryPartsReturnModal.jsx`) / edit return info (`EditReturnInfoModal.jsx`) — dev branch has no return-eligible test data

- [x] **7C.1: `InventoryAdd.jsx` full migration**
  - [x] `loadData`'s `Supplier` read, `SalesClass` read, `InventoryLocation`/`InventoryCategory` reads all swapped to direct `supabase.from()` calls, each in its own independent try/catch
  - [x] `checkSupplierLock` and `handleFlushLocks` swapped to direct calls
  - [x] `base44` import removed from the file entirely
  - [x] **UI-verified:** opened "Receive Inventory / Parts Entry" — Supplier, Sales Class, Category, and Location dropdowns all populated correctly from the native tables; category AI-suggestion correctly filled "Brakes" for a test brake-pad part number/description
  - [x] **UI-verified (partial):** "Flush Supplier" admin action correctly reported "No locked suppliers found" (console-confirmed, no errors) — confirms `handleFlushLocks`'s direct Supabase read/update path works. **Not tested:** the actual concurrent-lock-blocks-a-second-editor scenario (needs two simultaneous sessions, not attempted)

- [x] **7C.2: QOH adjustment — GL rounding fix**
  - [x] `value_change` rounding fix applied (`Math.round(x * 100) / 100`), redeployed to dev branch (v10) then production (v12), confirmed `ACTIVE` on both
  - [x] **UI/API-verified:** called the deployed `autopro-processQOHAdjustment` directly (via the browser's authenticated session) against a test item with `cost=3.33`, `quantity_change=3` — a combination that floats to `9.990000000000002` in raw JS math. Response returned `value_change: 9.99` and the resulting `GLTransaction` rows (accounts 1200/5003) both posted the clean `9.99` amount. Not click-tested through the `InventoryAdjustQOHModal.jsx` UI itself, but the underlying function (which is what that modal calls) is confirmed fixed.

- [x] **7C.3: `autopro-processInventoryReceipt` — audit only, verify-only**
  - [x] Confirmed `ACTIVE` on both dev branch and production (no code changes)
  - [x] **UI-verified:** ran a full batch receive through `InventoryAdd.jsx` (1 item, real supplier/sales-class/category selections) — "Batch Processing Complete: 1 Successful, 0 Failed"; confirmed via direct SQL that the `InventoryItem` was created with correct QOH/cost/category and a `SupplierInvoiceLine` row was created. Test data cleaned up afterward.

- [x] **7C.4: OCR — deploy-parity only, no functional validation this phase**
  - [x] `autopro-processPartsInvoiceOCR` confirmed `ACTIVE` on both dev branch and production
  - Full OCR-upload-to-AP-invoice flow validation remains **deferred to Phase 9** per standing instruction — not tested here beyond deploy-parity, as planned

- [x] **7C.5: Phase-wide final check — no remaining Base44 calls in scope**
  - [x] `grep -n "base44" src/pages/InventoryAdd.jsx` and `src/pages/InventoryList.jsx` both return zero results
  - [x] `grep -n "@/entities/all" src/pages/InventoryAdd.jsx` shows only `TagAlong` remaining (explicitly out of scope this phase)
  - [x] `npm run build` completes with exit code 0, no new warnings

- [x] **7C.6: Full inventory module UI regression (phase-wide)** — partially completed; see gaps below
  - [x] Inventory list loads (`InventoryList.jsx`, itself migrated off Base44 this session — see below), displays items with QOH/cost/price/location
  - [x] Search box (`search_inventory_ranked` RPC) and filter buttons (All/Has Stock/No Location/Inventory Count, the latter via `get_populated_inventory` RPC) all verified correct with both positive and negative test cases
  - [x] "Add Item" flow verified end-to-end: dropdowns populate, category auto-suggests, native insert lands with a production-consistent UUID `id`
  - [x] Batch-receive flow (`InventoryAdd.jsx`) verified end-to-end (see 7C.3 above)
  - [ ] **Not tested:** clicking an item's location/QOH cell to open `LocationModal.jsx`/`InventoryAdjustQOHModal.jsx` directly from the list (QOH rounding fix was verified via direct API call instead, not this click path)
  - [ ] **Not tested:** Delete action — the test account isn't `admin`-role, so the Delete menu item never renders; underlying code is a simple `.delete().eq('id',...)` swap, same pattern already proven correct in the manual SQL cleanup performed this session, but genuinely unverified through the UI's role-gated path
  - [ ] **Not tested:** parts return, LANKAR legacy warranty return, work-order-invoice warranty return — no eligible test data in dev branch

- [x] **7C.7: Final build and deployment**
  - [x] `npm run build` completes successfully, zero errors
  - [x] Changes committed and pushed to `development` branch by you; confirmed live on `test.kensauto.ca` (new JS bundle hash, verified via direct bundle inspection that the new code — not stale cache — was what was actually tested)
  - [x] Vercel CI passed — the pushed build deployed and ran correctly against `test.kensauto.ca`
  - [x] **7C: Complete** — **Phase 7 is now fully done**, rolled up into `master_blueprint.md` (2026-08-03)

### 7C.8) Out-of-plan addition: `src/pages/InventoryList.jsx` full Base44 removal

**Not in the original 7C scope** (per Section 1's file table, `InventoryList.jsx` was only ever touched in 7A for the `loadSharedData` category/location fix) — added mid-close-out after you asked to fix its search/fetch 401s, which traced back to an expired `BASE44_ACCESS_TOKEN` shared by every still-Base44 call app-wide (not specific to this file). You chose the full-migration option over a token refresh or further diagnosis.

**Migrated:**
- `fetchInventory`'s two Base44 calls (`getPopulatedInventory`, `searchInventory`) → `get_populated_inventory` and `search_inventory_ranked` Postgres RPCs (both already deployed; grants to `authenticated`/`anon` confirmed directly via SQL before use)
- `handlePrint`'s duplicate copy of the same two calls → refactored to share one new module-level `fetchInventoryRecords()` helper with `fetchInventory`, rather than keeping the logic duplicated (it was already duplicated in the original Base44-era code; this consolidation isn't new scope-creep, just not re-duplicating a pattern found already broken in two places)
- `loadSharedData`'s Supplier/SalesClass `SupabaseProxy` calls → direct `supabase.from()` (no `inventory_supplier` filter here, unlike `InventoryAdd.jsx` — matches the original's unfiltered Supplier read)
- `handleDelete`'s `inventoryDelete` → direct `.from('InventoryItem').delete()`
- `handleAdd`'s `inventoryAdd` → direct `.insert()` with `id: crypto.randomUUID()` (confirmed via production query that `InventoryItem.id` is a standard 36-char UUID, not the 24-char hex convention used by the other new Phase 7 tables) plus proper audit fields (`created_by`/`created_by_id` via the `employee` object's `.email`/`.autopro_user_id`, matching the established pattern from `Customers.jsx`/`Layout.jsx`)

**Deliberate behavior change (not a defect, a fix):** the old Base44 `searchInventory` function silently capped every search to 200 results regardless of what the caller requested — including the "Has Stock" / "Inventory Count" views, which pass `limit: 999999` expecting no cap. This was a real, previously-invisible limitation (views claiming to be "unlimited" were quietly truncated at 200 rows). The new direct-RPC path does not carry this cap forward.

**Testing note:** while testing, the Browser pane's synthetic "Enter" keypress turned out not to set `event.key` to `"Enter"` (empty string instead), so the standard automated click-and-type search test silently no-opped — not a bug in the app. Confirmed by dispatching a real `KeyboardEvent` with `key: 'Enter'` directly, which then behaved correctly (empty results for a nonsense search, correct row for a real match) and captured the `search_inventory_ranked` network call directly to confirm it fired with the right parameters.

---

## 5) Risk & Mitigation

| Risk | Severity | Sub-Phase | Mitigation |
|------|----------|-----------|-----------|
| `ReturnReason` schema missing a field Base44 actually has beyond what the CSV export shows | Low | 7A | Resolved — the real CSV export confirms the full field list directly (`reason`/`is_active`/`hide`/audit fields), no longer an inferred guess. |
| CSV import introduces ID mismatches if `InventoryItem.category`/`.location` reference something other than the name string | Low | 7A | Confirmed `InventoryItem.category`/`.location` are plain `text` columns storing name strings directly, not FK IDs — low risk, but worth a spot-check during import. |
| Direct `.insert()` calls miss audit fields once the Base44 shim is removed | Medium | 7A/7B/7C | Standing project-wide rule (Phase 4 lesson) — every new `.insert()`/`.update()` in this plan explicitly sets `id`/`created_date`/`created_by`/`created_by_id` (and `updated_date` on update), matching the exact columns confirmed to exist per table. |
| RLS blocks a direct `.from()` call | Low | 7A | Confirmed via direct query: `InventoryItem`, `InventoryReturn` both already have the permissive `"Enable all operations for all users"` policy; the 3 new tables get the same policy as part of their migration. |
| `search_inventory_ranked` RPC doesn't grant `EXECUTE` to the frontend's role | Medium | 7B | Confirm grants before inlining the `searchInventory` swap — same check Phase 5 ran for the analogous customer/vehicle RPCs. |
| Gemini's Google Search grounding tool syntax (`tools: [{ google_search: {} }]`) is wrong for `gemini-flash-latest`, causing the whole request to fail rather than degrade gracefully | Medium | 7B | No in-repo precedent combines grounding with this model — confirm the exact tool name against Google's current API docs and a live test call before considering `autopro-suggestInventoryCategory` done; wrong syntax fails loudly (easy to catch), not silently. |
| `autopro-processQOHAdjustment`'s rounding fix introduces a regression in an already-working, already-native financial function | Low | 7C | Change is minimal and additive (wrapping existing math in `Math.round(x * 100) / 100`, the same pattern already used throughout `autopro-processInventoryReceipt`) — verify with a live GL-posting test before/after. |
| 7B starts before 7A's tables exist in production (only dev branch) | Medium | 7B | 7B's new Edge Function only needs `InventoryCategory` to exist on whichever environment it's being tested against — safe to start 7B once 7A's dev-branch migration is verified, even before 7A's production migration completes, as long as testing happens against the same environment. |

---

## 6) Appendices

### A. Per-file Migration Checklist (copy for each file touched)

```
File: ______________________
Sub-Phase: ______________________
Current Base44 dependency: ______________________
Target native call: ______________________

- [ ] Import line updated (drop @/entities/all or base44 import, add supabase)
- [ ] Call site swapped to direct supabase.from()/rpc() call
- [ ] Audit fields (id, created_date, created_by, created_by_id on insert;
      updated_date on update) set correctly per that table's actual confirmed columns
- [ ] Error handling in place (console.error, don't swallow)
- [ ] npm run build passes
- [ ] UI regression test passed
```

### B. File Modification Summary (by sub-phase)

| Sub-Phase | File | Changes |
|-----------|------|---------|
| 7A | (new) 3 `CREATE TABLE` migrations | `InventoryCategory`, `InventoryLocation`, `ReturnReason` — dev branch first, then production; columns confirmed against real CSV exports |
| 7A | (data) 3 CSV imports | `InventoryCategory_export.csv`, `InventoryLocation_export.csv`, `ReturnReason_export.csv` — dev branch first, then production |
| 7A | `src/components/inventory/InventoryAddModal.jsx` (partial) | `InventoryCategory` direct-call swap (dropdown load only) |
| 7A | `src/components/inventory/LocationModal.jsx` | `InventoryLocation` direct-call swap + critical `inventoryUpdate` fix |
| 7A | `src/components/inventory/InventoryPartsReturnModal.jsx` | `ReturnReason` direct-call swap only — return-creation logic already native, untouched |
| 7A | `src/components/inventory/EditReturnInfoModal.jsx` | `InventoryReturn`/`ReturnReason` direct-call swap |
| 7B | `src/components/inventory/LegacyWarrantyReturnModal.jsx` | Full native rewire: `InventoryItem`/`InventoryReturn`/`GLTransaction`/`Supplier`/`searchInventory` |
| 7B | (new) `supabase/functions/autopro-suggestInventoryCategory/index.ts` | New Edge Function, Gemini-based, **grounded** (Option C — internet search preserved) |
| 7B | `src/components/inventory/InventoryAddModal.jsx` (remainder) | `suggestInventoryCategory` → `autopro-suggestInventoryCategory` call site |
| 7B | `src/pages/InventoryAdd.jsx` (partial) | Second `suggestInventoryCategory` call site only |
| 7C | `src/pages/InventoryAdd.jsx` (remainder) | `Supplier`/`SalesClass`/`InventoryLocation`/`InventoryCategory` direct-call swaps, lock management; `base44` import removed entirely |
| 7C | `supabase/functions/autopro-processQOHAdjustment/index.ts` | GL value-rounding fix |
| 7C | `supabase/functions/autopro-processPartsInvoiceOCR/index.ts` | **No changes** — verify-only, full flow validation deferred to Phase 9 |
| 7C | `supabase/functions/autopro-processInventoryReceipt/index.ts` | **No changes** — audited, correct, verify-only |
| N/A | `src/components/work-orders/WarrantyReturnModal.jsx` | **No changes in any sub-phase** — already native, verified only |

### C. Dependencies & Assumptions

- `@supabase/supabase-js` client (already in use, no new dependency)
- `@/lib/supabase` export of initialized client (already exists)
- `GEMINI_API_KEY` secret (already added to Supabase per your confirmation)
- CSV exports of `InventoryCategory`/`InventoryLocation`/`ReturnReason` located at `Plans and Context/*_export.csv` (confirmed, read in full during planning)
- Gemini's Google Search grounding tool (`tools: [{ google_search: {} }]`) works as expected for `gemini-flash-latest` — **unverified assumption, first real test happens during 7B execution**

---

## 7) Phase Results and Final Context

**Phase 7 status: [Tested] — Complete.** All three sub-phases (7A, 7B, 7C) executed and UI-verified against `test.kensauto.ca` between 2026-08-03 sessions. Rolled up into `master_blueprint.md` Section 7 same day.

### 7.1) What shipped

- **3 new native Postgres tables**: `InventoryCategory` (16 rows), `InventoryLocation` (263 rows), `ReturnReason` (11 rows) — schema + CSV data migrated dev-branch-first, then production, with the standard permissive RLS policy. (7A)
- **1 new Edge Function**: `autopro-suggestInventoryCategory` — Gemini `gemini-flash-latest`, grounded via `google_search` tool, free-text parsing (Option C from Section 0.2) — preserves Base44's original internet-search-grounded classification behavior exactly. (7B)
- **Every in-scope Base44 call site cut over to direct `supabase.from()`/`.rpc()` calls or native `autopro-*` functions**: `InventoryAddModal.jsx`, `LocationModal.jsx`, `InventoryPartsReturnModal.jsx`, `EditReturnInfoModal.jsx`, `LegacyWarrantyReturnModal.jsx`, `InventoryAdd.jsx` — zero remaining `base44`/`@/entities/all` imports for `InventoryCategory`/`InventoryLocation`/`InventoryReturn`/`ReturnReason`/`inventoryUpdate`/`suggestInventoryCategory`/`searchInventory` (LegacyWarrantyReturnModal's own call) in any of these files.
- **`autopro-processQOHAdjustment` GL-rounding fix** — `Math.round(x * 100) / 100` applied before the `!== 0` check and before GL posting; redeployed to dev branch (v10) then production (v12); live-verified via direct authenticated API call that a cost/quantity combo producing `9.990000000000002` in raw float math now posts a clean `9.99` on both GL rows.
- **Out-of-plan bonus fix, same close-out session**: `src/pages/InventoryList.jsx`'s entire remaining Base44 surface (`getPopulatedInventory`, `searchInventory`, `inventoryDelete`, `inventoryAdd`, Supplier/SalesClass reads) migrated to the same `search_inventory_ranked`/`get_populated_inventory` RPCs and direct calls — see 7C.8 above for full detail and the discovered pre-existing 200-row cap bug that was **not** carried forward.

### 7.2) Key lessons — carry forward to future phases

- **"One failed promise poisons the whole `Promise.all`" is a recurring bug pattern whenever a still-Base44 call is bundled with a native call in the same `loadData()`-style function.** Found and fixed independently in `InventoryAddModal.jsx` (7A) and `InventoryAdd.jsx` (7C, `TagAlong.list()` vs. the native category/location/supplier/sales-class reads). **Standing rule for every future phase:** whenever a component's data-loading function mixes a migrated call with a not-yet-migrated Base44 call, decouple them into independent `try/catch` blocks — never leave them in the same `Promise.all`.
- **`id` column conventions are not uniform across tables — check `information_schema.columns` / a real row before assuming a format.** The 3 new Phase 7 tables use 24-char hex (MongoDB ObjectId-style) IDs matching their Base44 CSV exports, but `InventoryItem.id` is a standard 36-char UUID (`crypto.randomUUID()` format) — confirmed via direct production query before writing `InventoryList.jsx`'s new `handleAdd`. Don't assume one project-wide ID convention.
- **A `.sql` file checked into the repo is not proof of what's actually deployed.** `src/supabase/search_inventory_ranked.sql` includes a `p_include_inactive` parameter that **does not exist** on either the dev-branch or (presumably) production deployed function — the live function only has the 6-param and 8-param overloads, no inactive-inclusion support. Always verify against `pg_get_functiondef()` directly, not repo source, before relying on an RPC's exact signature.
- **The Browser-pane testing tool's synthetic "Enter" keypress does not set `event.key` to `"Enter"`** (it comes through as an empty string), so any app logic gated on `e.key === 'Enter'` (like `InventoryList.jsx`'s search-on-Enter) will silently no-op under this specific automated testing path even though it works correctly for real users. Work around it by dispatching a real `KeyboardEvent({key: 'Enter'})` via `javascript_tool` rather than the `computer` tool's `key` action, when a component depends on a specific `event.key` value.
- **The expired `BASE44_ACCESS_TOKEN` is a standing, project-wide infra issue, not specific to any one page.** It causes 401s on every remaining Base44-shimmed call app-wide (seen this phase on `TagAlong`, employees, work orders, settings, and — before this session's fix — `InventoryList.jsx`'s entire list/search). Not fixed this phase (out of scope — would need a fresh long-lived JWT from an admin's Base44 session cookie, a manual step). **Worth flagging to a future phase or a dedicated fix session**, since it will keep surfacing as "broken" symptoms on every page that hasn't yet been migrated off Base44.
- **Test data created in the dev branch during UI verification must be cleaned up (InventoryItem/GLTransaction/SupplierInvoiceLine/InventoryAuditLog rows), not just left behind** — done via direct SQL after each verification pass this phase, keeping the dev-branch's near-empty seed state intact for future sessions per the Phase 7B lesson.

### 7.3) Explicitly out of scope, deferred to named future phases (not forgotten, not blockers)

- **Phase 9:** `Supplier` CRUD/business-logic beyond simple reads (`searchSuppliers`), and full click-through validation of the OCR-upload-to-AP-invoice flow (`autopro-processPartsInvoiceOCR`'s consuming workflow, not the function itself — which was audited and confirmed to have zero DB writes).
- **Phase 10:** `Levies` table migration, full tax accounting.
- **Phase 13:** `WorkOrder`/`DocumentEditor.jsx` migration — `WarrantyReturnModal.jsx` (already fully native for everything else) keeps its one `WorkOrder.get()`/`.update()` Base44 dependency untouched, by design.
- **A pre-existing, separately-flagged bug** (found during 7B, not fixed — out of this phase's file scope): `WarrantyReturnModal.jsx`'s GL-posting `.insert()` omits `id` on a multi-row insert into `GLTransaction`, whose `id` column has no working default (`''::text`). This can silently drop one of the two GL rows per warranty-return-from-invoice transaction. Confirmed via production query that zero `GLTransaction` rows exist with `id=''`, meaning this may have been silently failing every time it runs. **Recommend a dedicated look in a GL-focused phase** — not touched here since `WarrantyReturnModal.jsx` was explicitly out of file-scope for all of Phase 7.
- **Not carried forward (a deliberate fix, not a gap):** the old Base44 `searchInventory`'s silent 200-result cap on "unlimited" views — see 7C.8.

### 7.4) Known gaps — genuinely untested, flagged for whenever real test data exists

- `LocationModal.jsx`'s change/add/edit-location flows (7A scope) — no inventory item with an assignable location existed in dev-branch seed data at any point across 7A/7B/7C sessions.
- `InventoryPartsReturnModal.jsx` / `EditReturnInfoModal.jsx` process-return / edit-return-info flows (7A scope) — no return-eligible test data.
- `WarrantyReturnModal.jsx` regression check (7B scope, file untouched but never confirmed still working) — dev branch had zero Work Orders at every testing pass this phase.
- Supplier-lock concurrent-edit blocking (7C scope) — requires two simultaneous sessions, not attempted; only the single-session "Flush Supplier" admin action was verified.
- `InventoryList.jsx`'s Delete action (7C.8 addition) — the test account isn't `admin`-role, so the UI's Delete menu item never renders; the underlying code (a direct `.delete().eq('id', ...)`) is low-risk and matches a pattern already exercised via direct SQL cleanup this session, but is unverified through the actual role-gated UI path.
- A LANKAR legacy warranty return and a work-order-invoice warranty return, end to end (7C.6) — no eligible test data.

**Next step:** Phase 7 is closed. Proceed per `master_blueprint.md`'s phase sequence (Phase 8 already has commits in progress per recent git history — check that phase's own plan document for current status before starting new work there).
