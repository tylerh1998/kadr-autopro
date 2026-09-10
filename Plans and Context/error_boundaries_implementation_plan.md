# Error Boundaries Around the Money Paths — Implementation Plan

**Status:** DRAFT — awaiting user approval. No code changed yet.
**Owner doc:** this file (`Plans and Context/error_boundaries_implementation_plan.md`). Deliberately *not* named `implementation_plan.md` — that exact filename was used and deleted once before (see `master_context.md` §4.5) and causes cross-reference confusion. Follows the `mark_paid_implementation_plan.md` naming style.
**Branch:** `development` only. Never `main` without an explicit ask (`master_context.md` §6, memory `feedback_no_main_branch`).
**Deploy surface:** frontend only — no edge functions, no migrations, no DB writes of any kind except the *optional* user-triggered `IssueReport` insert in the fallback UI (Phase 1), which uses the exact same insert shape `ReportIssueModal.jsx` already uses.

---

## 1) Context & Lessons Learned

*(Keep this section live across all updates.)*

### Core goal

The app today has **zero React error boundaries anywhere** (`grep -rE "ErrorBoundary|componentDidCatch|getDerivedStateFromError" src/` → no matches). Because React 18 unmounts the **entire component tree to the root** when any render/lifecycle/effect-body throw is uncaught, a single bad value renders the whole application as a blank white page — no nav, no message, no recovery except a manual reload, and often nothing in the UI telling the user or us what happened.

The goal is a **layered safety net** so that a render-time exception degrades to a *scoped, styled, recoverable* fallback instead of a white screen — with the money paths (payments, GL posting, payroll, invoice conversion) getting the tightest isolation because that is where a mid-task crash is most costly (lost unsaved work, uncertainty about whether money actually moved).

This is explicitly a **containment + observability** effort, not a "fix every latent bug" effort. Phase 2 removes the single most common *cause* (unsafe date formatting), but the boundaries are what make the class of failure non-catastrophic regardless of cause.

### The specific problem (the "white screen" bug class)

The documented, confirmed-in-production instance (`master_context.md` §4.5, "SupplierInvoiceLine.invoice_date format corruption"):

- `SupplierInvoiceLine.invoice_date` is a `text` column whose convention is `YYYY-MM-DD`, but a `Ctrl+S` save firing before the date field's `onBlur` normalization can persist `MM/DD/YYYY` instead.
- `SupplierPaymentModal.jsx`'s "Make Payment" table then renders `format(parseISO(invoice.invoice_date), 'MMM d, yyyy')` with **no guard**.
- `parseISO("08/14/2026")` returns an **`Invalid Date`**. `date-fns`'s `format()` on an `Invalid Date` **throws `RangeError: Invalid time value`** — synchronously, during render.
- No boundary exists → React unmounts to root → **the entire app white-screens**, not just the modal. The user was mid-payment; they see nothing and don't know if anything posted.
- There is **no error boundary anywhere in this codebase** (`master_context.md` says this verbatim, twice).

This is not a one-file problem. The same unsafe shape is everywhere:

| Unsafe render pattern | Why it throws | Where |
|---|---|---|
| `format(parseISO(row.someDateField), fmt)` | `parseISO` of a non-ISO / empty / null / `MM/DD/YYYY` string → `Invalid Date` → `format` throws `RangeError` | ~79 call sites app-wide; ~12 in money dirs |
| `format(new Date(row.someDateField), fmt)` | `new Date("garbage")` → `Invalid Date` → `format` throws `RangeError`; also `new Date("2026-09-09")` parses as **UTC** midnight and shifts back a day in MST (a correctness bug even when it doesn't throw) | mixed in with the above |
| `row.some_amount.toFixed(2)` | if `some_amount` is `null`/`undefined` (nullable numeric column, missing join field) → `TypeError: Cannot read properties of null` | e.g. `taxes/MarkPaidModal.jsx:56` `gstReturn.net_gst_due.toFixed(2)`; ~203 `x.y.toFixed(` call sites app-wide, most but not all guarded |
| `JSON.parse(x)` on an already-parsed `jsonb` column, or on `""` | `SyntaxError` | guarded in most places by the `typeof x === 'string' ? JSON.parse(x) : x` idiom, but not universally |

**Aggravating factors specific to this project:**

- **No automated tests at all.** No test runner in `package.json` (`dev`/`build`/`lint`/`typecheck`/`preview` only). Every regression is caught by a human clicking through.
- **Testing is manual-only and now hits production data.** As of 2026-09-01 (`master_context.md` §"Single Supabase project model") the dev branch DB was decommissioned — `test.kensauto.ca` (the `development` frontend) now points at the **same production Supabase project** (`hbcrwkmgsazqrvsrmxyr`). AI agents are barred from live browser testing and from mutating scripts. So we cannot safely seed a malformed-date row to prove the fix; verification has to use a dev-only synthetic throw plus a *user-owned, reversible* single-row edit.
- **`tailwind-merge` / `cn()` can silently make a whole `DialogContent` invisible** (`master_context.md` §3) — a reminder that the fallback UI must be dead simple and not rely on the same `DialogContent` machinery that might itself be the thing failing.
- **Dark mode is first-class** — every fallback surface needs `dark:` classes (`master_context.md` §7).
- **Light-mode `--background` is a medium gray, not white** (`master_context.md` §3) — fallback panels must sit on an explicit `bg-white dark:bg-slate-900` card, not bare page background, or contrast suffers.

### Lessons learned (updated as we go)

- *(none yet — first phase not executed)*

### Key design decisions (rationale captured so a future agent doesn't re-litigate)

1. **Class-component boundary, no new dependency.** React error boundaries *must* be class components (`getDerivedStateFromError` + `componentDidCatch`); there is no hook equivalent. `react-error-boundary` (the library) would be one small dep but adds nothing we need and the memory `feedback_prefer_no_install_solutions` says try zero-install first. One ~70-line class file covers it.
2. **Boundaries are keyed and self-resetting.** The route-level boundary takes `key={currentPageName}` so navigating away and back **remounts** it and clears the errored state — otherwise a crashed page stays crashed for the rest of the session. Modal boundaries reset when the modal's `open` prop goes false→true (via `key` on the `open` transition or an explicit `resetKeys`-style prop).
3. **Fallbacks are loud, not silent.** Every catch does `console.error(...)` (which `src/lib/logCollector.js` already intercepts into the 100-entry ring buffer that `getCapturedLogs()` exposes). The fallback UI is a visible panel with the error message, a Reload action, and a one-click "Report this problem" that writes an `IssueReport` row. We are containing the blast radius, **not** hiding failures.
4. **Telemetry reuses the existing `IssueReport` pipeline.** `ReportIssueModal.jsx` already inserts `{ id, created_date, created_by, error_message, severity, status:'new', url, console_logs: getCapturedLogs(), metadata:{browser,...} }` into `IssueReport`, and `Manage Tickets` (`src/pages/ManageTickets.jsx`) already triages that table. The boundary's report action inserts the same shape with `severity:'high'` and `error_message` = the caught error + component stack. No new table, no new function.
5. **Three tiers, matching the existing lock-tier mental model** (`master_context.md` §3 "Optimistic Locking — three tiers"):
   - **Root tier** (`src/main.jsx`) — catches a catastrophic failure in `App`/`AuthProvider`/`Router` themselves. Bare-bones full-screen "reload" message, no hooks, no router, no Supabase.
   - **Route tier** (`src/App.jsx` `LayoutWrapper`) — catches a page crash, keeps the nav shell, offers Reload + Report + "Go Home".
   - **Modal tier** (money-path call sites) — catches a crash inside a payment/GL/payroll dialog, drops *only the dialog*, leaves the underlying page (and any unsaved edits) intact.
6. **Phase order = net first, then causes, then isolation.** Phase 1 (boundaries) alone eliminates the white-screen outcome even if Phases 2–3 slip. Phase 2 (safe formatters) removes the most common trigger. Phase 3 (per-modal) is defense-in-depth for the highest-value surfaces.

---

## 2) Previously Completed

*(Historical context. Updated only when a brand-new plan supersedes this one.)*

- **None for this initiative** — this is the first structured effort at render-time fault containment in the app.
- Relevant prior hardening that this builds on top of, already live on both `development` and `main`:
  - Optimistic locking remediation for `WorkOrder` / `Supplier` (`master_context.md` §3, `implementation_plan_wo_locking.md`) — 2026-08-15/16.
  - RLS strong-auth (AAL2) gate on staff tables (`rls_strong_auth_policy_plan.md`) — 2026-08-16.
  - `SupplierInvoiceLine.invoice_date` got a 3-layer ISO-format guard (client re-validate, server reject, `invoice_date_iso_format` CHECK constraint) — 2026-08-14. **But** `SupplierPaymentModal.jsx`'s "Make Payment" render path itself was explicitly left un-hardened ("Still open" in `master_context.md` §4.5) — that specific gap is in scope here.
  - Scattered local `safeFormatDate` / `safeParseDateForCalendar` / `formatDateForInput` helpers already exist in `src/pages/SupplierTx.jsx`, `src/pages/ReconcileSupplier.jsx`, `src/pages/SupplierTxView.jsx`, `src/components/suppliers/SupplierPaymentModal.jsx`, `src/components/inventory/EditInventoryTransactionModal.jsx`, `src/pages/InventoryAdd.jsx` — copy-pasted, never centralized. Phase 2 consolidates these.

---

## 3) Risk Assessment

| # | Risk | Impact | Likelihood | Mitigation |
|---|---|---|---|---|
| R1 | **Boundary silently swallows a real bug** — a component starts throwing, boundary catches, nobody notices, a real defect ships hidden behind a fallback panel. | High | Medium | Every catch calls `console.error` (→ `logCollector` ring buffer). Fallback is a **visible** panel, never an empty div or a `return null`. Fallback's "Report this problem" writes an `IssueReport` row (surfaces in Manage Tickets). Phase 4 adds *automatic* deduped `IssueReport` insert on catch. In `import.meta.env.DEV`, fallback also renders the full component stack inline. |
| R2 | **Route boundary doesn't reset** — user hits a crash, navigates elsewhere, comes back, page is still the fallback because React kept the boundary instance mounted at a stable element position. | Medium | High (default React behavior without a key) | `key={currentPageName}` on the route-tier boundary forces a remount on every navigation. Explicit "Reload page" button in the fallback as the always-works escape hatch. Verified in Phase 1 verification steps. |
| R3 | **Wrapping a Radix `Dialog` in a boundary orphans the overlay** — if the throw happens *inside* `<DialogContent>` while open, React tears down the subtree but Radix's `onOpenChange`/close never fires, potentially leaving a portalled backdrop div stuck over the page. | Medium | Medium | Modal-tier fallback renders its **own** minimal `<Dialog open onOpenChange={onClose}>` (fresh Radix instance) so there's always a working close affordance and backdrop ownership is clean. Where a call site can't pass `onClose` into the boundary, the fallback uses a plain `fixed inset-0` layer with its own dismiss button (no dependency on the broken modal's props). Manual verification explicitly checks "backdrop dismisses cleanly" for 3 representative modals. |
| R4 | **`safeFormatDate` changes a displayed value for a *valid* date** (e.g. default format string mismatch, or timezone shift from switching `new Date(str)` → `parseISO(str)`). | Medium | Low-Medium | Every backfilled call site passes its format string **explicitly** (never relies on the helper's default). Switching `format(new Date("2026-09-09"))` → `safeFormatDate("2026-09-09", fmt)` is a **correctness improvement** (`parseISO` treats a bare date as local midnight; `new Date` treats it as UTC → was shifting a day earlier in MST). Backfill is done in small per-directory commits so a visual diff is reviewable. Phase 2 verification eyeballs a known-good record in each module before/after. |
| R5 | **Boundary interferes with `@tanstack/react-query` ret/refetch or the Realtime subscription** in a wrapped subtree. | Low | Low | Boundaries are transparent unless erroring — they render `children` untouched. `QueryClientProvider` stays *above* all boundaries (in `App.jsx`, unchanged). The Realtime channel in `WorkOrders.jsx` uses a separate client and its own effect; a boundary around the page doesn't change effect scheduling for the non-erroring path. |
| R6 | **The optional `IssueReport` insert from the fallback fails** (RLS, offline, AAL1 session) and throws *inside the fallback*, producing a fallback-of-a-fallback loop. | Medium | Low | The report handler is fully `try/catch`ed with its own local `useState` status (`idle`/`sending`/`sent`/`failed`) — a failed insert just shows "couldn't send, please screenshot" text. The fallback component itself renders zero dates/numbers/parsing — nothing in it can throw. `IssueReport` INSERT policy is `authenticated`-only and predates the strong-auth gate (confirmed in `master_context.md` §2), so even an AAL1 session can write it. |
| R7 | **Scope creep** — "add boundaries" becomes "rewrite every date call in the app" (79 + 203 sites). | Medium (schedule) | Medium | Phase 2 backfill is **scoped to the money-path directories only** (`ar`, `suppliers`, `lines-of-credit`, `bank`, `cash-drawer`, `cash-flow`, `payroll`, `paypro`, `taxes`, `accounts`, plus the payment/conversion pieces of `work-orders`). The remaining app-wide sites are explicitly deferred to Phase 4 as a *tracked* follow-up, protected in the meantime by the route-tier boundary. |
| R8 | **A crash during `InvoiceConversion.jsx` after GL has already posted** now shows a fallback instead of the success screen — user may re-run the conversion and double-post. | High | Low | Not a regression the boundary *introduces* (today it white-screens in the same spot with the same ambiguity). Mitigation is to make the route fallback for `InvoiceConversion` specifically say "The invoice may have already been created — check the WorkOrder's stage before retrying" and link to the WO list. Noted as a Phase 3 special-case. |
| R9 | **`eslint`/`tsc` breakage** from the new files or `key` prop churn. | Low | Low | `npm run lint` + `npm run typecheck` + `npm run build` run after every phase before handing off. New files follow existing `.jsx` conventions (function/class components, `@/` imports). |
| R10 | **Merge/promotion drift** — Phase lands on `development`, forgotten before a `main` promotion, or only half the phases promoted (the `master_context.md` §4.8 pattern). | Medium | Medium | This plan's status headers are the single source of truth. Each phase is a self-contained frontend change (no coupled function/migration deploy), so partial promotion is *safe* (a boundary with no safe-formatter backfill still works). Promotion to `main` is a separate, explicit, user-initiated step per the standing rule. |

**Overall risk: LOW-MEDIUM.** Frontend-only, additive, no data model or money-movement logic touched. The highest genuine risks are R1 (hidden bugs — mitigated by loud logging + telemetry) and R3 (Radix overlay orphaning — mitigated by self-owned fallback dialogs + explicit verification).

---

## 4) Time Estimate

Autonomous implementation speed; wall-clock time is dominated by the user's manual verification passes between phases.

| Phase | Build (agent) | User verification | Notes |
|---|---|---|---|
| Phase 1 — boundary primitive + root/route tiers + fallback UI + report helper | ~1.5–2 hrs | ~20 min | 4 new files, ~2 edits to `App.jsx`, 1 to `main.jsx`. Dev-only synthetic-crash mechanism included for testing. |
| Phase 2 — shared `dateFormatUtils.js` + consolidate 5 local copies + backfill ~25–30 money-path render sites | ~2–3 hrs | ~30–45 min | Mechanical but wide; done as ~8 per-directory sub-commits for reviewable diffs. |
| Phase 3 — per-modal boundaries at ~15 money call sites + `InvoiceConversion` special-case fallback | ~2 hrs | ~30 min | Mostly wrapping JSX + wiring `onClose` into fallbacks. |
| Phase 4 — auto-`IssueReport` on catch (deduped) + widen boundary to remaining high-traffic pages + app-wide safe-date backfill + `master_context.md` update | ~2–3 hrs | ~30 min | Optional / can be split further. |
| **Total** | **~8–10 hrs agent** | **~2–2.5 hrs user**, spread across 4 hand-offs | |

Phases 1–3 are the core deliverable (~6–7 hrs agent). Phase 4 is hardening/rollout and can be deferred or dropped without leaving anything broken.

---

## 5) Roadmap & Progress

### Phase 1 — Error-boundary primitive + root & route tiers  `[Pending]`

**Impacted files**
- **New:** `src/components/errors/ErrorBoundary.jsx` — the reusable class component.
- **New:** `src/components/errors/ErrorFallback.jsx` — the styled fallback panel (functional; uses `useAuth`).
- **New:** `src/components/errors/reportRenderError.js` — `IssueReport` insert helper (mirrors `ReportIssueModal.jsx`'s shape).
- **New:** `src/components/errors/crashTest.js` — dev-only synthetic throw utility for verification (armed only on `import.meta.env.DEV` or hostname `test.kensauto.ca`).
- **Edit:** `src/App.jsx` — wrap the per-route `<Page/>` / `<MainPage/>` render inside `LayoutWrapper` with a keyed route-tier `<ErrorBoundary>`.
- **Edit:** `src/main.jsx` — wrap `<App/>` in a bare root-tier `<ErrorBoundary variant="root">`.

**TL;DR:** Introduce one reusable boundary component and mount it at the two outermost tiers. After this phase, no uncaught render error can white-screen the app — the worst case becomes a styled, recoverable panel that keeps the nav shell and logs + offers to report the failure.

**In depth**

`ErrorBoundary.jsx` — a class component:
- `state = { error: null, errorInfo: null }`.
- `static getDerivedStateFromError(error)` → `{ error }` (this is what actually blocks the white screen).
- `componentDidCatch(error, errorInfo)` → store `errorInfo`; `console.error('[ErrorBoundary:' + (this.props.label || 'unlabeled') + ']', error, errorInfo?.componentStack)` (auto-captured by `logCollector`); if `this.props.onError` call it.
- `componentDidUpdate(prevProps)` — if `this.props.resetKey !== prevProps.resetKey` and we're currently errored, clear state (this is how modal-tier boundaries recover on re-open; route tier uses React's own `key` remount instead).
- `render()` — if `this.state.error`, render `this.props.fallback` as a render-prop: `this.props.fallback({ error, errorInfo, reset: () => this.setState({error:null, errorInfo:null}) })`; else `this.props.children`.
- Props: `{ children, fallback, label, resetKey, onError }`.

`ErrorFallback.jsx` — functional, receives `{ error, errorInfo, reset, variant, title, message, onClose }`:
- `variant: 'root' | 'route' | 'modal'` drives layout:
  - `root` → `fixed inset-0` centered card, plain text, single "Reload" button (`window.location.reload()`), **no** `useAuth`, **no** Supabase (must survive a broken `AuthProvider`). Passed in from `main.jsx`.
  - `route` → centered card sitting in `<main>` (nav shell still visible above it): headline "Something went wrong on this page", the `error.message`, buttons: **Reload page** (`window.location.reload()`), **Go home** (`window.location.href = '/'`), **Report this problem**. In DEV, a collapsible `<pre>` with `errorInfo.componentStack`.
  - `modal` → compact card, "This dialog hit a problem", `error.message`, buttons **Close** (calls `onClose` / `reset`) and **Report this problem**.
- Styling: `bg-white dark:bg-slate-900`, `border-slate-200 dark:border-slate-800`, rounded-2xl, matches `AccessDeniedLock.jsx` / `PageNotFound.jsx` visual language. Icon: `AlertTriangle` (lucide) in an amber badge.
- "Report this problem" → local `useState` status machine, calls `reportRenderError(...)`, shows "Sending…" → "Sent — thanks" / "Couldn't send. Please screenshot this and tell the office." Never throws.

`reportRenderError.js` — `export async function reportRenderError({ error, errorInfo, employee, user, context })`:
- Builds the same object `ReportIssueModal.jsx:44` inserts into `IssueReport`:
  - `id: crypto.randomUUID()`, `created_date`/`updated_date` now ISO, `created_by`: `employee?.email || user?.email || 'Unknown'`, `created_by_id: user?.id ?? null`.
  - `user_title` / `title`: `"[Auto] Render error: " + (error?.name || 'Error')`.
  - `description`: `context` string (which tier / which modal / current route).
  - `error_message`: `String(error?.stack || error?.message || error)` truncated to ~8 KB + `"\n\n--- Component stack ---\n" + errorInfo?.componentStack`.
  - `severity: 'high'`, `status: 'new'`, `url: window.location.href`, `console_logs: getCapturedLogs()`.
  - `metadata: { browser: navigator.userAgent, screen_resolution, employee_name, source: 'ErrorBoundary' }`.
- `await supabase.from('IssueReport').insert([row])`; return `{ ok: !error }`. All wrapped in `try/catch` → `{ ok: false }`.

`App.jsx` change — current:
```jsx
const LayoutWrapper = ({ children, currentPageName }) => Layout ?
  <Layout currentPageName={currentPageName}>{children}</Layout>
  : <>{children}</>;
```
→ new:
```jsx
const LayoutWrapper = ({ children, currentPageName }) => Layout ? (
  <Layout currentPageName={currentPageName}>
    <ErrorBoundary
      key={currentPageName}
      label={`route:${currentPageName}`}
      fallback={(p) => <ErrorFallback variant="route" context={`route:${currentPageName}`} {...p} />}
    >
      {children}
    </ErrorBoundary>
  </Layout>
) : (
  <ErrorBoundary key={currentPageName} label={`route:${currentPageName}`} fallback={(p) => <ErrorFallback variant="route" {...p} />}>
    {children}
  </ErrorBoundary>
);
```
The `key={currentPageName}` is load-bearing (R2). `LayoutWrapper` is already called with `currentPageName` at all three call sites (`/` route, `Pages.map`, `LankarWOView`), so this one edit covers every page.

`main.jsx` change — wrap `<App />`:
```jsx
ReactDOM.createRoot(document.getElementById('root')).render(
  <RootErrorBoundary>
    <App />
  </RootErrorBoundary>
)
```
where `RootErrorBoundary` is `<ErrorBoundary label="root" fallback={(p) => <ErrorFallback variant="root" {...p} />}>`. Kept import-light (no `useAuth`, no router).

`crashTest.js` — exports a hook/util `useCrashTest()` used *only* inside a small dev gate: reads `?__crashtest=route|modal|render-date` from the URL; when present and `(import.meta.env.DEV || location.hostname === 'test.kensauto.ca')`, throws a synthetic `new Error('crashTest: synthetic render error')` from the requested location. Wired into `ErrorFallback`'s own parent area and one representative modal in Phase 3. This is the safe, no-DB-mutation way for the user to verify the boundary actually catches.

**Not in this phase:** any modal wrapping, any date-helper work, any automatic reporting.

---

### Phase 2 — Shared safe formatters + money-path backfill  `[Pending]`

**Impacted files**
- **New:** `src/components/utils/dateFormatUtils.js` — `safeFormatDate`, `safeParseDateForCalendar`, `formatDateForInput`, `safeToFixed`, `safeNumber`.
- **Edit (consolidate to import):** `src/pages/SupplierTx.jsx`, `src/pages/ReconcileSupplier.jsx`, `src/pages/SupplierTxView.jsx`, `src/components/suppliers/SupplierPaymentModal.jsx`, `src/components/inventory/EditInventoryTransactionModal.jsx`, `src/pages/InventoryAdd.jsx` — delete the local copy, import from the shared module. (Keep behavior identical; these already have the guard.)
- **Edit (backfill unsafe sites):** money-path render call sites — enumerated list built during Phase 1 execution, currently ~25–30 across:
  - `src/components/ar/` — `TakePaymentModal.jsx:228`, plus `ARPaymentDetailsModal`, `InterestCalculationModal`, `RecordAdjustmentModal`, `StatementModal`.
  - `src/components/suppliers/` — `SupplierPaymentModal.jsx:877,1154`, `SupplierTxInvoiceSummaryTab`, `SupplierTxPaymentHistoryTab`, `ReconcileInvoiceGroup`, `ReconcileErrorGroup` (some already pass a `safeFormatDate` prop — switch to the import).
  - `src/components/lines-of-credit/` — `LineOfCreditPaymentModal.jsx:640`, `LineOfCreditTransactionModal`, `LOCReconciliationModal`, `PaymentTransactionItem`.
  - `src/components/bank/` — `ReconciliationHistoryModal.jsx:78,86`, `BankTransactionModal`, `AutoReconcileModal`.
  - `src/components/cash-drawer/` — `AdjustmentHistoryModal.jsx:43`, `CashDrawerAdjustmentModal.jsx:349`, `DepositDetailsModal.jsx:146`, `DepositHistoryModal.jsx:206`, `DepositSlipBreakdownModal.jsx:192`.
  - `src/components/payroll/` — `MarkPaidModal.jsx:163`, `AddPaychequeModal`, `AddRemittanceModal`, `AddAdjustmentModal`.
  - `src/components/paypro/` — `BatchPaymentModal.jsx`, `RemittanceDialog.jsx`, `PayStubViewerModal`, `remittances/RemittanceHistory`, `timerecords/*`.
  - `src/components/taxes/MarkPaidModal.jsx:55,56,107` — also guard `gstReturn.net_gst_due.toFixed(2)` → `safeToFixed(gstReturn?.net_gst_due, 2)`.
  - `src/components/work-orders/` — payment/conversion pieces only: `AdvancePaymentModal.jsx:480`, `InvoicePaymentModal.jsx`, `OtherChargeModal.jsx:135`, `WorkOrderReport.jsx`, `WorkOrderProfitability.jsx`.

**TL;DR:** Centralize the safe date/number formatting helpers that are already copy-pasted in 6 files, then replace the unguarded `format(parseISO(x))` / `format(new Date(x))` / `x.y.toFixed()` render calls in the money paths with the safe versions. This removes the single most common *cause* of the crash so the Phase 1 boundaries rarely have to fire.

**In depth**

`dateFormatUtils.js` (based on the existing `SupplierTx.jsx` implementation, which is the most complete):
```js
import { format, parseISO } from 'date-fns';
import { toMountainTime } from '@/components/utils/mountainTimeUtils';

/** Format a stored date string for display. Never throws. Returns `fallback` on bad input. */
export function safeFormatDate(value, fmt = 'MMM d, yyyy', { mountainTime = false, fallback = 'N/A' } = {}) {
  if (value == null || value === '') return fallback;
  try {
    const d = (mountainTime && typeof value === 'string' && value.length > 10)
      ? toMountainTime(value)
      : (typeof value === 'string' ? parseISO(value) : value);
    if (!(d instanceof Date) || isNaN(d.getTime())) return fallback;
    return format(d, fmt);
  } catch (e) {
    console.error('[safeFormatDate]', e, value);
    return fallback;
  }
}

/** For <Calendar selected={...}> — returns a Date or undefined, never Invalid Date. */
export function safeParseDateForCalendar(value) { /* parseISO + isNaN guard → Date | undefined */ }

/** For text <input> prefill in MM/dd/yyyy — returns '' on bad input. */
export function formatDateForInput(value, fmt = 'MM/dd/yyyy') { /* ... */ }

/** Number formatting that tolerates null/undefined/strings. */
export function safeToFixed(value, digits = 2, fallback = '0.00') {
  const n = typeof value === 'string' ? parseFloat(value) : value;
  return (typeof n === 'number' && isFinite(n)) ? n.toFixed(digits) : fallback;
}
export function safeNumber(value, fallback = 0) { /* Number() + isFinite guard */ }
```

Backfill mechanics — for each site:
- `format(parseISO(x), 'MMM d, yyyy')` → `safeFormatDate(x, 'MMM d, yyyy')`.
- `format(new Date(x), 'MMM d, yyyy')` → `safeFormatDate(x, 'MMM d, yyyy')` (also fixes the UTC-shift bug — call this out in the commit message).
- `format(new Date(x + 'T00:00:00'), fmt)` → `safeFormatDate(x, fmt)` (parseISO of a bare `YYYY-MM-DD` is already local midnight, so the `T00:00:00` hack becomes unnecessary).
- `x.y.toFixed(2)` where `y` is a nullable numeric → `safeToFixed(x?.y, 2)`.
- `format(new Date(), fmt)` (no argument — current date) → **left alone**, cannot throw.
- Anywhere a component receives `safeFormatDate` as a **prop** today (the reconcile cluster) → drop the prop, import directly.

Done as one commit per directory (`ar`, then `suppliers`, …) so each diff is small and the user can spot-check one module at a time.

**Not in this phase:** the ~50 remaining non-money sites app-wide (Phase 4). Modal boundaries (Phase 3).

---

### Phase 3 — Per-modal boundaries on the money paths  `[Pending]`

**Impacted files** (wrap at the call site; the modal component itself is untouched)
- `src/components/work-orders/DocumentEditor.jsx` — `AdvancePaymentModal` (line ~2025), `InvoicePaymentModal` (~2166), `InvoiceDescriptionModal`, `OdometerPromptModal` (the 3-phase conversion wizard).
- `src/pages/WorkOrderView.jsx` — `WarrantyReturnModal`, `ROApprovalsModal`, credit-invoice entry.
- `src/pages/InvoiceConversion.jsx` — **special case:** the whole page is a money path executed in a `useEffect`; wrap `<WorkOrderReport>` render + give the route-tier fallback for this page a bespoke message (R8).
- `src/pages/Bank.jsx` — `BankTransactionModal`, `BankTransferModal`, `AutoReconcileModal`, `ReconciliationHistoryModal`.
- `src/pages/CashDrawer.jsx` — `DepositModal`, `DepositSlipBreakdownModal`, `CashDrawerAdjustmentModal`, `PaymentSelectionModal`, `ChangePaymentMethodModal`.
- `src/pages/LinesOfCredit.jsx` — `LineOfCreditPaymentModal`, `LineOfCreditTransactionModal`, `LOCReconciliationModal`, `LinesOfCreditEditModal`.
- `src/pages/CustomerARSummary.jsx` / `src/pages/CustomerARTransactions.jsx` — `TakePaymentModal`, `RecordAdjustmentModal`, `InterestCalculationModal`, `StatementModal`.
- `src/pages/SupplierTx.jsx` + `src/components/suppliers/SupplierTxModals.jsx` — `SupplierPaymentModal`, `LineEditModal`.
- `src/pages/APSummary.jsx` — `SupplierPaymentModal` via `APSummaryTable`.
- `src/pages/Payroll.jsx` / `src/pages/Taxes.jsx` — `MarkPaidModal` (both variants), `AddPaychequeModal`, `AddRemittanceModal`, `AddAdjustmentModal`.
- `src/pages/paypro/PayStubs.jsx` / `src/pages/paypro/Remittances.jsx` — `BatchPaymentModal`, `RemittanceDialog`, `Cancel*Modal`, `PayStubViewerModal`.
- **New:** `src/components/errors/MoneyModalBoundary.jsx` — thin wrapper: `<ErrorBoundary resetKey={open} fallback={(p) => <ErrorFallback variant="modal" onClose={onClose} {...p} />}>`.

**TL;DR:** Wrap each payment / GL / payroll dialog in a boundary so a crash inside it drops only that dialog — the page you were working on (and any unsaved Work Order edits) stays alive. This is the isolation tier that matters most for "I was mid-payment and everything vanished."

**In depth**

`MoneyModalBoundary` usage pattern at a call site:
```jsx
<MoneyModalBoundary open={modals.payments} onClose={() => closeModal('payments')} label="AdvancePaymentModal">
  <AdvancePaymentModal open={modals.payments} onClose={() => closeModal('payments')} ... />
</MoneyModalBoundary>
```
- `resetKey={open}` → when the modal is re-opened (`open` goes false→true) the boundary clears any prior error so a transient bad state doesn't permanently brick that dialog for the session.
- Fallback (`variant="modal"`) renders its **own** `<Dialog open onOpenChange={onClose}>` so the backdrop is owned by a fresh Radix instance (R3) and "Close" always works even if the wrapped modal's own close handler was part of what broke.
- `label` flows into `console.error` and the `IssueReport` `description` so Manage Tickets shows *which* dialog failed.

`InvoiceConversion.jsx` special case — the route-tier fallback for `currentPageName === 'InvoiceConversion'` gets custom copy: *"This page was in the middle of converting an estimate/work order to an invoice. The invoice may already have been created and GL entries may already have posted. Do not simply retry — open the Work Order from the WIP list and check its stage first."* plus a button to `/WorkOrders`. This is strictly better than today's white screen, which gives the user the same ambiguity with zero guidance.

**Not in this phase:** non-money modals (inventory, scheduling, WorkPRO) — Phase 4 / future.

---

### Phase 4 — Telemetry auto-capture + rollout  `[Pending]`

**Impacted files**
- `src/components/errors/ErrorBoundary.jsx` — add opt-in `autoReport` prop; on `componentDidCatch`, fire `reportRenderError` once per unique `error.message` per session (in-memory `Set` dedupe) so Manage Tickets gets a row even if the user never clicks "Report".
- `src/App.jsx` — set `autoReport` on the route-tier boundary.
- Widen the route-tier pattern is already global; add boundaries around a few always-mounted Layout widgets (`SmsPanel`, `SmsModal`, `NoteBoard` on `Home`) so a crash in one doesn't take the shell.
- App-wide safe-date backfill — the remaining ~50 `format(parseISO/new Date(x))` sites outside the money dirs.
- `Plans and Context/master_context.md` §3 — add an "Error boundaries & safe formatting" subsection documenting the three tiers, the `dateFormatUtils.js` helpers as the standard, and the `crashTest` verification mechanism. (Standing permission to edit this doc per memory; will summarize the change in chat.)
- Memory — update `project_autopro_overview` / add a note that error-containment now exists.

**TL;DR:** Make crashes show up in Manage Tickets automatically (deduped), extend the net to the remaining high-traffic surfaces and date call sites, and write the pattern into `master_context.md` so it's the default for all future work.

**In depth:** deferred detail until Phases 1–3 are `[Tested]`.

---

## 6) Verification Plan

**Testing constraints (read first):** `test.kensauto.ca` serves the `development` branch and now points at the **production** Supabase DB. AI agents do **no** browser testing and **no** mutating scripts. The user tests manually. To prove a boundary *catches* without seeding bad data, Phase 1 ships a dev-only synthetic-crash query param. To prove the *real* date-crash class is fixed, the user makes one reversible edit to a record they own.

### Phase 1 verification

**A. Synthetic route crash (no data touched)**
1. On `test.kensauto.ca`, open any page, then append `?__crashtest=route` to the URL and reload.
2. **Expected:** the **nav header/sidebar stay visible**; the page body shows a styled "Something went wrong on this page" card with the error text, a "Reload page", "Go home", and "Report this problem" button. In DEV a component-stack `<pre>` is expandable.
3. **Before this phase:** the same trigger would blank the entire window.
4. Click **Go home** → lands on Home, fully working. Click into the crashed page again *without* the query param → page loads normally (proves R2: the boundary reset on navigation).
5. Click **Report this problem** on the fallback → shows "Sent — thanks"; open **Manage Tickets** (profile dropdown) → a new `[Auto] Render error` row with `severity: high`, the URL, and console logs attached.

**B. Root crash**
1. Append `?__crashtest=root` and reload.
2. **Expected:** a plain full-screen "The application failed to start. Please reload." card with a Reload button (no nav — this tier sits above the shell on purpose). Reload without the param → app works.

**C. Regression sweep (no crash expected)**
1. Normal click-through of 6–8 pages incl. WorkOrders, a Work Order editor, Bank, CashDrawer, Payroll, Customer AR — everything renders and behaves exactly as before (boundaries are invisible when nothing throws).
2. `npm run lint`, `npm run typecheck`, `npm run build` all pass (agent runs these before hand-off; user re-confirms on their push).

### Phase 2 verification

**A. Real malformed-date repro (user-owned, reversible)**
1. Pick a **test Work Order / test supplier invoice you own** on `test.kensauto.ca`. Note the current date value.
2. Via the normal UI, set its date field to an invalid value if the UI allows it, **or** (if you're comfortable) run a single `UPDATE ... WHERE id = '<that one row>'` setting `invoice_date` to `'13/45/2026'`.
3. Open the modal that previously white-screened (e.g. Supplier → Make Payment for that invoice; or the AR Take Payment table).
4. **Expected:** the modal opens; the bad date shows as `N/A` (or `—`); **everything else in the modal works**; no white screen, no boundary fallback even — it just degrades the one cell.
5. **Revert** the row to its original value.

**B. Valid-date no-change check**
1. For one known-good record in each money module (AR, Supplier, LOC, Bank, Cash Drawer, Payroll, PayPRO, Taxes), open the relevant list/modal and confirm displayed dates and dollar amounts are **identical** to before Phase 2 (screenshots or side-by-side with `main`).

**C.** `npm run lint` / `typecheck` / `build` pass.

### Phase 3 verification

**A. Synthetic modal crash**
1. Open a Work Order editor. Trigger `?__crashtest=modal` (wired to the Advance Payment modal for this test).
2. Open the Advance Payment modal → it shows the compact "This dialog hit a problem" fallback with a working **Close**.
3. Click **Close** → the dialog dismisses cleanly, **the backdrop disappears**, and **the Work Order editor is still there with your unsaved edits intact** (type something in a line item first, don't save, then trigger — confirm it survives).
4. Re-open the same modal (without the param) → opens normally (proves `resetKey={open}` reset).

**B. Backdrop-orphan check (R3)** — repeat A for `SupplierPaymentModal` and `MarkPaidModal`: after the fallback's Close, confirm you can click page elements behind where the modal was (no invisible stuck overlay).

**C. `InvoiceConversion` special copy** — append `?__crashtest=route` on an `InvoiceConversion` URL → fallback shows the bespoke "the invoice may already have been created — check the WO stage first" message and a link to the WIP list, not the generic one.

### Phase 4 verification

1. Trigger a synthetic route crash **without** clicking "Report" → within a few seconds a row still appears in Manage Tickets (auto-report). Trigger the same error again → **no** duplicate row (session dedupe).
2. Crash a Layout widget (`?__crashtest=sms-panel`) → only that panel shows a small fallback; the rest of the shell and page keep working.
3. `master_context.md` §3 shows the new "Error boundaries & safe formatting" subsection.

---

## 7) Working Area (Current Phase: **Phase 1**)

Exact changes for Phase 1. Nothing here is executed until the plan is approved.

### 7.1 New file: `src/components/errors/ErrorBoundary.jsx`

```jsx
import React from 'react';
import { getCapturedLogs } from '@/lib/logCollector';

const reported = new Set(); // session-scoped dedupe for autoReport (used in Phase 4)

export default class ErrorBoundary extends React.Component {
  state = { error: null, errorInfo: null };

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, errorInfo) {
    this.setState({ errorInfo });
    // console.error is intercepted by src/lib/logCollector.js
    console.error(
      `[ErrorBoundary${this.props.label ? ':' + this.props.label : ''}]`,
      error,
      errorInfo?.componentStack
    );
    if (typeof this.props.onError === 'function') {
      try { this.props.onError(error, errorInfo); } catch (_) { /* never let onError re-throw */ }
    }
    // Phase 4 will add: if (this.props.autoReport) fire-and-forget reportRenderError(...) with dedupe on `reported`
  }

  componentDidUpdate(prevProps) {
    // Modal tier: when `resetKey` changes (e.g. the modal's `open` prop flips), clear the error.
    if (this.state.error && this.props.resetKey !== prevProps.resetKey) {
      this.setState({ error: null, errorInfo: null });
    }
  }

  reset = () => this.setState({ error: null, errorInfo: null });

  render() {
    if (this.state.error) {
      return this.props.fallback({
        error: this.state.error,
        errorInfo: this.state.errorInfo,
        reset: this.reset,
      });
    }
    return this.props.children;
  }
}
```
Notes:
- `getCapturedLogs` import is unused in Phase 1 (kept for Phase 4 autoReport); if `lint --quiet` flags unused, defer the import to Phase 4. **Decision: add the import in Phase 4, not now** — keep Phase 1 lint-clean.
- No prop-types in this codebase; match that (no `propTypes`).

### 7.2 New file: `src/components/errors/ErrorFallback.jsx`

Functional component. Signature: `export default function ErrorFallback({ error, errorInfo, reset, variant = 'route', context, onClose })`.

- `variant === 'root'`: `fixed inset-0 z-[9999] flex items-center justify-center bg-slate-100 dark:bg-slate-950 p-4`; inner `max-w-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-xl p-6 text-center space-y-4`; `AlertTriangle` in amber badge; H1 "Application failed to load"; `<p>` "Please reload the page. If it keeps happening, contact the office."; one `<button>` "Reload" → `window.location.reload()`. **No `useAuth`, no supabase import** in this branch's code path (safe if AuthProvider is what broke).
- `variant === 'route'`: same card, sitting in normal flow inside `<main>` (not `fixed`). H2 "Something went wrong on this page". Show `error?.message` in a `text-sm text-slate-600 dark:text-slate-400 font-mono` block. Buttons row: **Reload page**, **Go home** (`window.location.href='/'`), **Report this problem** (see 7.4). If `import.meta.env.DEV` → `<details>` with `<pre className="text-xs overflow-auto max-h-64">{errorInfo?.componentStack}</pre>`. If `context` prop indicates `InvoiceConversion` (Phase 3) → swap in the bespoke copy.
- `variant === 'modal'`: render `<Dialog open onOpenChange={() => (onClose ? onClose() : reset())}>` + `<DialogContent className="max-w-sm">` (fresh Radix instance — do **not** add `relative` to the className, per `master_context.md` §3 `tailwind-merge` trap). Content: amber `AlertTriangle`, "This dialog hit a problem", `error?.message`, buttons **Close** (`onClose ?? reset`) and **Report this problem**.
- "Report this problem" sub-component (shared): local `useState('idle')` → `idle|sending|sent|failed`; on click `setStatus('sending')`, `const r = await reportRenderError({ error, errorInfo, employee, user, context })`, `setStatus(r.ok ? 'sent' : 'failed')`. `employee`/`user` from `useAuth()` — but only call `useAuth()` in the `route`/`modal` variants, never `root`. Simplest: a separate `<ReportButton>` component used only by route/modal fallbacks so `root` never imports `useAuth`.

### 7.3 New file: `src/components/errors/reportRenderError.js`

```js
import { supabase } from '@/lib/supabase';
import { getCapturedLogs } from '@/lib/logCollector';

const MAX = 8000;

export async function reportRenderError({ error, errorInfo, employee, user, context }) {
  try {
    const stack = String(error?.stack || error?.message || error || 'Unknown error');
    const compStack = errorInfo?.componentStack ? `\n\n--- Component stack ---\n${errorInfo.componentStack}` : '';
    const row = {
      id: crypto.randomUUID(),
      created_date: new Date().toISOString(),
      updated_date: new Date().toISOString(),
      created_by: employee?.email || user?.email || 'Unknown User',
      created_by_id: user?.id || null,
      user_title: `[Auto] Render error: ${error?.name || 'Error'}`,
      title: `[Auto] Render error: ${error?.name || 'Error'}`,
      description: `Caught by ErrorBoundary. Context: ${context || 'unknown'}. Route: ${window.location.pathname}`,
      error_message: (stack + compStack).slice(0, MAX),
      severity: 'high',
      status: 'new',
      url: window.location.href,
      console_logs: getCapturedLogs(),
      attachments: null,
      metadata: {
        browser: navigator.userAgent,
        screen_resolution: `${window.innerWidth}x${window.innerHeight}`,
        employee_name: employee?.full_name || 'Unknown',
        source: 'ErrorBoundary',
      },
    };
    const { error: insErr } = await supabase.from('IssueReport').insert([row]);
    return { ok: !insErr };
  } catch (_) {
    return { ok: false };
  }
}
```
Verified against `ReportIssueModal.jsx:44-70` — same columns (`user_title`, `title`, `error_message`, `console_logs`, `metadata`, `severity`, `status`, `url`). `IssueReport`'s live column set is untracked in the repo (`master_context.md` §2) — **before executing Phase 1, introspect `information_schema.columns` for `IssueReport`** to confirm each column above exists; drop any that don't rather than trusting this list.

### 7.4 Edit: `src/App.jsx`

- Add import: `import ErrorBoundary from '@/components/errors/ErrorBoundary';` and `import ErrorFallback from '@/components/errors/ErrorFallback';`
- Replace the `LayoutWrapper` definition (currently lines ~22-25) with the keyed-boundary version shown in §5 Phase 1. Both the `Layout ?` and `: <>` branches get the boundary; `key={currentPageName}` on both.
- No change to the `<Routes>`/`<Route>` structure, `AuthProvider`, `QueryClientProvider`, or `Router` — boundaries stay *below* all providers.

### 7.5 Edit: `src/main.jsx`

- Add import: `import ErrorBoundary from '@/components/errors/ErrorBoundary';` + `import ErrorFallback from '@/components/errors/ErrorFallback';`
- Wrap:
```jsx
ReactDOM.createRoot(document.getElementById('root')).render(
  <ErrorBoundary label="root" fallback={(p) => <ErrorFallback variant="root" {...p} />}>
    <App />
  </ErrorBoundary>
)
```
- Leave the commented-out `<React.StrictMode>` as-is.

### 7.6 New file: `src/components/errors/crashTest.js` (dev-only verification aid)

```js
export function crashTestArmed() {
  return import.meta.env.DEV || (typeof location !== 'undefined' && location.hostname === 'test.kensauto.ca');
}
export function maybeCrash(scope) {
  if (!crashTestArmed()) return;
  const p = new URLSearchParams(location.search).get('__crashtest');
  if (p && p === scope) {
    throw new Error(`crashTest: synthetic render error (scope=${scope})`);
  }
}
```
- Phase 1 wiring: call `maybeCrash('root')` at the top of `App()`'s body (inside the function, before the return) and `maybeCrash('route')` inside a tiny wrapper rendered as the first child of each route's element — simplest is a `<CrashTestProbe scope="route" />` component placed just inside the route-tier `ErrorBoundary` in `LayoutWrapper`. `maybeCrash('modal')` wiring is added in Phase 3.
- Because `crashTestArmed()` gates on DEV or the `test.` hostname, this is inert on `autopro.kensauto.ca` (production) even if someone appends the param.

### 7.7 Order of operations for execution

1. Introspect `IssueReport` columns (read-only) → finalize `reportRenderError.js` row shape.
2. Create the 4 new files under `src/components/errors/`.
3. Edit `App.jsx`, then `main.jsx`.
4. `npm run lint` → `npm run typecheck` → `npm run build`; fix anything.
5. Self-review the diff; update this doc's Phase 1 header to `[Executed]` and fill in the "Lessons learned" bullets.
6. Hand off to user with the §6 Phase 1 verification script. Do **not** proceed to Phase 2 until the user reports `[Tested]`.

### 7.8 Open questions for the user before execution

1. **Fallback "Report this problem" — auto or manual for Phase 1?** Plan currently: **manual button** in Phase 1, **automatic (deduped)** in Phase 4. OK, or do you want auto-report from day one?
2. **`crashTest` on `test.kensauto.ca`:** I've armed the synthetic-crash param on the `test.` hostname (not just local DEV) so you can verify on the deployed test site. Acceptable, or restrict to local-dev only? (It can't fire on production either way.)
3. **Scope of Phase 2 backfill:** money-path directories only, with the rest deferred to Phase 4. Confirm you don't want the full app-wide date backfill pulled into the core scope.
4. **Naming:** file is `error_boundaries_implementation_plan.md` (not `implementation_plan.md`) to avoid the known cross-reference collision. Fine?
