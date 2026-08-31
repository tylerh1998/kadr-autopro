# Manage Tickets Dashboard — Implementation Plan

**Status:** Executed 2026-08-18. Frontend/build verified locally; browser click-through still needs a real admin session (see §7).

## 1) Overview & Objectives

Build a single admin-only page, **Manage Tickets**, that reads and manages rows in the existing `IssueReport` table (populated today by `ReportIssueModal.jsx`'s "Report an Issue" flow). Scope for this pass:

- A sortable list of every issue report: severity, title, status, created/updated dates.
- Sort order: status tier → severity rank → `created_date`, per the mapping confirmed below.
- Closed tickets hidden by default, with a toggle to reveal them.
- A free-text search box (title/description/reporter) — filters only, no dropdown facets yet.
- Click a row → detail panel (same page, not a new route) showing full description, error message, reporter, source URL, browser/device metadata, captured console logs, and attachment links.
- From the detail panel: change `status` (dropdown), edit `title` (dashboard-only rename, separate from the reporter's original `user_title`), and maintain a free-text `notes` field.
- Entry point: a "Manage Tickets" item in the profile dropdown (`src/Layout.jsx`), visible only when `employee?.admin === true`, next to the existing "Admin Dashboard" item.

Explicitly out of scope for this pass (per conversation): status-change audit trail, KPI/stat tiles, severity/status filter dropdowns, reply-to-reporter tooling, real-time multi-user sync. All client-side sorting/filtering for now; an RPC is a future option only if the table grows large (single admin user today).

## 2) Open Questions & Clarifications

TL;DR — two small decisions I made by default, flag either if you want it different; everything else below is confirmed, not a question:

1. **Route/page name** — defaulting to `ManageTickets` (`src/pages/ManageTickets.jsx`), matching the nav label. See §3 (Proposed Changes) and §3's Assumption list for where this lands in `pages.config.js`.
2. **Notes save behavior** — defaulting to an explicit **Save** button, not autosave-on-blur (simpler, no debounce/race edge cases for a single-admin tool). See §3 and §4's risk note.

Everything else in this plan (sort tiers, severity values, RLS posture, migration scope) reflects what you already confirmed in conversation, not an open question.

## 3) Assumptions & Verification

- **VERIFIED** (queried live via Supabase MCP `execute_sql` against `information_schema.columns` on dev, `sitihbdnuxifwibontcm`) — `IssueReport` schema: `id uuid pk default gen_random_uuid()`, `created_date timestamptz not null`, `updated_date timestamptz not null`, `created_by text not null`, `created_by_id uuid`, `user_title text not null`, `title text not null`, `description text not null`, `error_message text`, `severity text not null default 'medium'`, `status text not null default 'new'`, `url text`, `console_logs jsonb`, `metadata jsonb`, `attachments jsonb`. No `notes` column exists yet.
- **VERIFIED** (read `ReportIssueModal.jsx` source + queried live rows) — Real severity values in use: `low`, `medium`, `critical`. No `high` value anywhere in code or data.
- **VERIFIED** (`information_schema.columns` + live row query) — `status` has no CHECK constraint (plain `text`, default `'new'`); all live dev rows are currently `'new'`. Safe to introduce new status strings from the frontend with no migration.
- **VERIFIED** (confirmed explicitly by you in conversation) — Status sort tiers: `1 new`, `2 follow_up`/`replicated`, `3 in_progress`, `4 pending_testing`, `5 pending_merge`, `6 planned`/`deferred`, `7 closed`. Severity rank: `1 critical`, `2 medium`, `3 low`.
- **VERIFIED** (queried `pg_policies` on dev for `tablename = 'IssueReport'`) — RLS is `authenticated` + `staff_strong_auth()` (AAL2), same as nearly every staff table post the 2026-08-16 RLS overhaul. Any signed-in staff member can currently read/write this table at the database level — the "admin-only" restriction is a **UI gate only**, matching the existing convention on `src/pages/Admin.jsx` (`employee?.admin === true`, else "Access Denied"). No RLS change planned.
- **VERIFIED** (read `AuthContext.jsx`, `Admin.jsx`, `Layout.jsx`) — Admin gate pattern: `employee` (from `useAuth()`) is populated from a live `.from('Employee')` query and exposes `admin: boolean`. `Admin.jsx` and `Layout.jsx` both gate on `employee?.admin === true`.
- **VERIFIED** (read the bucket-creation migration `20260817170457_add_issue_report_attachments_bucket_and_column.sql`, and `AutoReconcileModal.jsx` for precedent) — Attachments bucket `kadr-issue-report-attachments` is **private** (`public: false`), with `authenticated`-only insert/select storage policies. Reads require `supabase.storage.from(bucket).createSignedUrl(path, expirySeconds)` — existing app convention is 60s expiry, generated at click time then opened immediately. Attachment paths are random UUIDs (`${reportId}/${uuid}.${ext}`), not guessable.
- **VERIFIED** (read `src/lib/logCollector.js`) — `console_logs` shape: array of `{timestamp, type, message}`, last 100 entries, `type` is `'log' | 'warn' | 'error'`.
- **VERIFIED** (read `ReportIssueModal.jsx`) — `metadata` shape: `{browser, screen_resolution, employee_name, is_globally_clocked_in}`.
- **VERIFIED** (read `pages.config.js`, `App.jsx`, `src/utils/index.ts`) — Page registration is a flat, manually-maintained import map in `pages.config.js` (despite its "auto-generated" header comment — no codegen script found targeting it); routes are generated in `App.jsx` via `Object.entries(Pages).map(...)` → `/${pageName}`. `createPageUrl(name)` just returns `/${name}`.
- **VERIFIED** (repo-wide grep for `IssueReport`/`issuereport`/`issue_report`, 11 hits reviewed) — No file in `src/` or `supabase/functions/` reads from the `IssueReport` table today besides this new page. `ReportIssueModal.jsx` writes it; `autopro-report-issue` only receives a copy of the submitted fields as a function payload, never reads the DB row back. Confirmed safe to repurpose `title` as an admin-editable field with no other consumer depending on it staying reporter-authored.
- **VERIFIED** (`package.json` scripts) — `npm run lint`, `npm run typecheck`, `npm run build` are all available and can be run directly against the new/changed files before considering the change ready to push.
- **ASSUMED** — Page name/route `ManageTickets` — see §2, open for a name change.
- **ASSUMED** — Notes field saves via explicit Save button, not autosave — see §2.
- **ASSUMED** — Migration applies to the **dev** project (`sitihbdnuxifwibontcm`) only during this build, verified at `test.kensauto.ca`; production (`hbcrwkmgsazqrvsrmxyr`) gets the identical migration as a separate, explicitly-approved step later. Will hold on any production `apply_migration` call unless you say otherwise — matches master_context.md's "production is genuinely live, never a same-session routine deploy" rule (§4's Live verification protocol, rule 3).

## 4) Proposed Changes

**Database — dev project `sitihbdnuxifwibontcm` only, via Supabase MCP `apply_migration`, backfilled to `supabase/migrations/` under the exact version `list_migrations` reports:**
```sql
alter table "IssueReport" add column notes text;
```
Additive, nullable, no backfill, no RLS change (existing `IssueReport` policies already cover all columns on the table).

**`src/pages/ManageTickets.jsx` (new file):**
- Admin gate identical to `Admin.jsx` (`employee?.admin === true`, else "Access Denied" panel).
- Fetch: `supabase.from('IssueReport').select('*')` on mount.
- Client-side derived list: sort by `TIER_MAP[status]` → `SEVERITY_RANK[severity]` → `created_date` ascending; an unrecognized/future status string falls into a trailing tier rather than throwing during sort.
- "Show closed" `Switch` (`@/components/ui/switch`), default off — filters `status === 'closed'` out of the rendered list when off.
- Search `Input` — case-insensitive substring match against `title`, `user_title`, `description`, `created_by`.
- List rendered with `@/components/ui/table`; detail pane in a `@/components/ui/card`.
- Detail pane per selected row:
  - Editable `title` (click-to-edit `Input` + Save, updates `title` + `updated_date`).
  - Read-only `user_title` shown as a secondary line ("Originally reported: …") when it differs from the current `title`.
  - `description`, `error_message` (monospace block, only rendered if present).
  - `status` `Select` (`@/components/ui/select`) with the 9 known values; `Badge` for severity.
  - `created_date` and `updated_date` both shown.
  - Metadata block: `url` (text + "open in new tab" link), `metadata.browser`, `metadata.screen_resolution`, `metadata.employee_name`, `metadata.is_globally_clocked_in`.
  - Console log viewer: scrollable monospace list, colored by `type`.
  - Attachments: filename + human-readable size; "Open" calls `createSignedUrl(path, 60)` at click time and opens the result in a new tab.
  - `notes` `Textarea` + Save button, writes `notes` + `updated_date`.
- One shared `updateIssueReport(id, patch)` helper for all writes (`status`, `title`, `notes`), stamps `updated_date`, updates local state directly (no refetch).

**`src/Layout.jsx` (edit):**
- Add a `Ticket` (lucide-react) icon import.
- Inside the existing `{employee?.admin === true && (...)}` block (currently just "Admin Dashboard"), add a sibling `DropdownMenuItem` — "Manage Tickets" → `window.location.href = createPageUrl('ManageTickets')`.

**`src/pages.config.js` (edit):**
- Add `import ManageTickets from './pages/ManageTickets';` and `"ManageTickets": ManageTickets,` in alphabetical position (between `LinesOfCredit` and `PLReport`).

**No changes:** `ReportIssueModal.jsx`, `autopro-report-issue` edge function, storage bucket/policies, RLS policies. No new edge functions — this feature is pure client + direct `supabase-js` table calls, so the `autopro-[functionname]` naming rule doesn't apply here (flagging only because the project rules call it out explicitly).

## 5) Risk Assessment

*Targeted assessment performed: repo-wide grep for every `IssueReport` reference (11 files — reviewed each), `pg_policies` query against dev, `information_schema.columns` query against dev, live row sample, and a read of `AutoReconcileModal.jsx` for the signed-URL precedent.*

| Risk | Mitigation |
|---|---|
| Unknown/legacy `status` values (no CHECK constraint) break the sort comparator | Sort map defaults unmapped statuses to a trailing tier instead of `NaN`/throwing. |
| Repurposing `title` as admin-editable diverges from "what the reporter originally typed" | Preserved via `user_title`, confirmed untouched by any other code path — safe. |
| Any authenticated staff (not just admins) can still write to `IssueReport` at the DB layer | Pre-existing, matches the app-wide UI-gate convention (same as `Admin.jsx`); not a new exposure introduced by this feature. |
| Migration applied to dev only | Production keeps the old schema (no `notes` column) until a separate, explicitly-approved migration — this page should not be pointed at production until that's done. |
| Attachment links need a live signed URL each time (60s expiry) | Matches existing app pattern (generate-then-open immediately); nothing cached/stale to manage. |
| `title` edits and `notes` writes both stamp `updated_date`, same field a future status-audit feature might want to read for "last touched" — no dedicated history | Acceptable per your call in §1 (audit trail explicitly out of scope); flagged here only so it's a documented tradeoff, not a silent gap. |
| New page adds a fifth `IssueReport`-dependent surface with no existing test coverage in this repo (no test suite found for any page) | Consistent with the rest of the app (no page-level test suite exists); mitigated by the manual verification plan in §6. |

## 6) Verification & Testing Plan

**Testing tiers, per master_context.md's Live verification protocol (§4, "three hard rules") and this project's no-localhost/no-password-entry constraints:**

- **Execute (I run these directly, no login needed):**
  - `npm run lint`, `npm run typecheck`, `npm run build` locally before considering the change ready to push.
  - Supabase MCP: apply the `notes` migration to dev, confirm via `information_schema.columns`; spot-check sort logic against live dev rows via `execute_sql` (e.g., confirm a manually-set mixed batch of statuses/severities orders as expected) before ever trusting the frontend render.
  - Confirm the migration's assigned version via `list_migrations` and back-fill the exact matching filename (per master_context.md's migration-version-parity rule).
- **Hold for User (requires a real authenticated browser session — I won't enter your password):**
  - Log in as your admin account at `test.kensauto.ca` (never `localhost` — no local-dev auth path exists in this project) and confirm: "Manage Tickets" appears in the profile menu; the page loads, sorts, and filters correctly; status/title/notes edits persist across a refresh; attachment links open the right file.
  - Optionally check with a non-admin account (or `employee.admin` false/null) that "Manage Tickets" is hidden and the page itself blocks with "Access Denied" if navigated to directly.
- **User Logs In and Reprompts (optional hybrid):** if you'd rather I drive the click-through myself, open `test.kensauto.ca` in the Browser pane and sign in there yourself first — once a session exists in that pane, reprompt me and I can navigate/click/screenshot the rest without ever handling your credentials.

Per master_context.md rule 1: none of the above verification happens until the change is committed, pushed to `origin/development`, and (since no edge function is touched here) no separate deploy step is needed beyond the frontend push.

Checklist:
- [x] Apply `notes` column migration to dev, backfill matching `.sql` file under `supabase/migrations/` with the exact assigned version
- [x] Create `src/pages/ManageTickets.jsx`
- [x] Register page in `src/pages.config.js`
- [x] Add "Manage Tickets" nav item to `src/Layout.jsx`
- [x] `npm run build` passes (`npm run lint`/`npm run typecheck` have pre-existing repo-wide failures predating this change — see §7, confirmed not worsened by it)
- [ ] Verify admin gate (visible/functional for admin, hidden/blocked for non-admin) — needs a live admin session, see §7
- [ ] Verify sort order across all 9 status values + all 3 severities — verified by code review only; live dev data is all one status/severity combo, see §7
- [ ] Verify closed-hidden-by-default toggle — needs a live admin session, see §7
- [ ] Verify search filter — needs a live admin session, see §7
- [ ] Verify status update persists and re-sorts — needs a live admin session, see §7
- [ ] Verify title edit persists, `user_title` still visible underneath — needs a live admin session, see §7
- [ ] Verify notes save and persist — needs a live admin session, see §7
- [ ] Verify attachment signed-URL open works — needs a live admin session, see §7
- [ ] Verify console log and metadata rendering — needs a live admin session, see §7

## 7) Completion Notes & Context

Executed as planned, no scope deviations. Both defaults from §2 were kept (`ManageTickets` route name, explicit-Save notes field).

**Migration:** `alter table "IssueReport" add column notes text;` applied to dev (`sitihbdnuxifwibontcm`) via `apply_migration`, assigned version `20260818023146`. Backfilled to `supabase/migrations/20260818023146_add_notes_to_issue_report.sql`. Confirmed live via `information_schema.columns`. All live dev rows are currently `status='new'`, severity `low`/`medium` only — no mixed-tier data existed to spot-check the sort comparator against real rows; the comparator's tier/severity mapping was verified by code review only (all 9 status values + unmapped-status fallback). Production migration intentionally not run — still pending a separate, explicitly-approved step per §3's assumption.

**Files touched:** new `src/pages/ManageTickets.jsx`; `src/pages.config.js` (import + `PAGES` entry, alphabetical); `src/Layout.jsx` (`Ticket` icon import + `DropdownMenuItem` sibling to "Admin Dashboard").

**`npm run lint` / `npm run typecheck`:** Both commands already fail repo-wide on `development` before this change (193 pre-existing `unused-imports` lint errors across ~30 unrelated files; thousands of pre-existing typecheck errors, including inside `node_modules/lodash` and every shadcn-based form component, from untyped UI primitives). Confirmed the new/touched files don't add to that debt: `npx eslint src/pages/ManageTickets.jsx src/pages.config.js` alone is clean, and the `Layout.jsx` diff only adds a used `Ticket` import. `ManageTickets.jsx` does surface under `typecheck` — but only the same two pre-existing systemic error classes seen everywhere else in the codebase: (1) shadcn UI components typed as bare `RefAttributes<any>` rejecting any prop, and (2) `new Date(a) - new Date(b)` arithmetic in the sort comparator, an idiom already used identically in 12 other files (`Layout.jsx`, `WorkOrders.jsx`, `SupplierTx.jsx`, etc.). Not a real regression — `npm run build` (the tool that actually gates deploy) passed clean, exit 0, fresh `dist/` output confirmed.

**`npm run build`:** Passed, exit 0.

**Not yet done (§6 "Hold for User" tier — needs a real authenticated browser session, which this agent cannot create):**
- Log in as an admin at `test.kensauto.ca` and click through: nav item appears, page loads/sorts/filters, status/title/notes edits persist across refresh, attachment signed-URL links open correctly.
- Optionally confirm the page is hidden/blocked for a non-admin account.
- No existing authenticated Browser-pane session was available this session to do this automatically — per master_context.md there's no local-dev auth path, so this couldn't be substituted with a localhost check.
