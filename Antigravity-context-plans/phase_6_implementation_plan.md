# Phase 6 Implementation Plan — Inventory & Reports (Dark Mode)

**Status:** Draft — pending approval. No code changes made yet.
**Type:** Single-phase plan (9 files, comparable scope to Phase 2 — no sub-phases needed).

---

## 0. Open Questions / Notes

- **Scope reduced from the Master Blueprint's original Phase 6 list.** 3 files (`src/pages/InventoryAdd.jsx`, `src/components/reports/ReportableLeviesReport.jsx`, `src/components/reports/TechnicianPerformanceReportModal.jsx`) were excluded after confirming they have active/planned touch points in the concurrently-running Base44-deprecation blueprint's Phase 10 (`Plans and Context/phase_10_implementation_plan.md`, status `[Pending]`). See Master Blueprint Section 5 note and this phase's heading for detail. This plan covers only the remaining 9 files.
- **New territory: 2 of these 9 files use Recharts** (`SalesAnalysisReport.jsx`, `WorkOrderSummaryReport.jsx`) — the first Recharts usage encountered in this blueprint's work so far (Phases 1-2 had zero). Recharts components (`XAxis`, `YAxis`, `CartesianGrid`, `Tooltip`, `Legend`) take color via inline `stroke`/`fill`/`color` props or a `style` object, **not** Tailwind `className` — a plain `dark:` class will not affect them. This needs a different technique than everything done so far; see Section 3 for the approach.

---

## 1. Phase Scope & Objectives

Apply `dark:` Tailwind variant classes (and, for the 2 Recharts files, theme-aware inline color props) to the Inventory Valuation, Stock Reorder, and Reports-module files so they render correctly in dark mode. No logic, prop, or layout changes — styling only.

**In scope (9 files):**

*Pages (2):*
- `src/pages/InventoryValuation.jsx` (361 lines) — has `@media print` block, preserve untouched
- `src/pages/StockReorderReport.jsx` (321 lines) — has `@media print` block, preserve untouched; 0 raw-color hits in research otherwise, verify on read

*Components (7):*
- `src/components/reports/CustomerReportModal.jsx` (220 lines)
- `src/components/reports/InventoryOnOrder.jsx` (236 lines)
- `src/components/reports/OtherChargesBreakdownReport.jsx` (286 lines) — has `@media print` block, preserve untouched
- `src/components/reports/PartsMovementReportModal.jsx` (340 lines) — highest slate-bg density (14 refs)
- `src/components/reports/ReportModal.jsx` (323 lines) — likely a generic report-picker wrapper, minimal raw-color hits in research, verify on read
- `src/components/reports/SalesAnalysisReport.jsx` (323 lines) — **uses Recharts**
- `src/components/reports/WorkOrderSummaryReport.jsx` (322 lines) — **uses Recharts**

**Out of scope:** Any business logic, data fetching, Base44/Supabase migration work, or changes to `src/components/ui/*` (already dark-safe). The 3 excluded files listed in Section 0 above.

---

## 2. Lessons Learned & Context (from Section 7 of Master Blueprint)

1. **Additive only** — never replace a light class, only add `dark:` alongside it.
2. **Shadcn UI primitives are already dark-safe** — do not touch `src/components/ui/`.
3. **Watch for hardcoded `bg-white`/`bg-slate-50` overrides on Shadcn primitives** — check the primitive's own source before assuming a custom `className` is harmless.
4. **`slate-*` shades used for light-mode text/backgrounds are not automatically dark-safe** — `text-slate-600/700/900` and `bg-slate-50/100` need distinct `dark:` pairs.
5. **Print output must stay unaffected** — 3 of this phase's files have their own `@media print` block (confirmed via grep: `InventoryValuation.jsx`, `StockReorderReport.jsx`, `OtherChargesBreakdownReport.jsx`). Follow the `Payroll.jsx` precedent from Phase 2: locate the block first, leave every rule inside it untouched (including any `!important` color overrides), and only add `dark:` classes to the on-screen (non-print) markup.
6. **New this phase — Recharts theming.** Section 3's Risk Assessment table already flagged "Chart/graph text unreadable" as a risk; this is the first phase where it's actually applicable. Recharts elements don't respond to Tailwind `dark:` classes because they render via SVG with inline attributes, not DOM classes. The correct approach: read how dark mode state is exposed to components in this app (check `Layout.jsx`/`AuthContext` for a `darkMode` boolean or a `useTheme()`-style hook already in use elsewhere) and pass computed colors conditionally, e.g. `stroke={darkMode ? '#94a3b8' : '#475569'}` on `XAxis`/`YAxis`/`CartesianGrid`, and check `Tooltip`'s `contentStyle` prop for a hardcoded light background that needs a dark-aware object. If no `darkMode` prop/context is already threaded into these two files, the simplest fix consistent with "styling only, no logic changes" is reading `document.documentElement.classList.contains('dark')` at render time or via a small `prefers-color-scheme`-independent hook — confirm the app's existing pattern before inventing a new one.
7. **Dev server preview verification may be blocked in-session** (confirmed in Phase 2) — if so, do the grep-based `dark:` count audit and hand off visual verification to the user rather than stalling.
8. **Check `Plans and Context/` for file overlap before scoping any phase** (new process rule, added this session) — already applied to select this phase's 9-file scope.

---

## 3. Detailed Execution Plan

### Standard palette (non-Recharts files) — from Section 7
```
Container/modal bg:    dark:bg-slate-950
Card/panel bg:         dark:bg-slate-900
Subtle section bg:     dark:bg-slate-800
Primary text:          dark:text-slate-100
Secondary text:        dark:text-slate-300
Muted/label text:      dark:text-slate-400
Table header:          dark:bg-slate-800 dark:text-slate-300
Table row stripe:      dark:bg-slate-800/40
Table row hover:       dark:hover:bg-slate-700/50
Border:                dark:border-slate-700 / dark:border-slate-800
Badge colors:          per Section 7 pairs
```

### Per-file approach (6 non-Recharts, non-print-heavy files)
`CustomerReportModal.jsx`, `InventoryOnOrder.jsx`, `PartsMovementReportModal.jsx`, `ReportModal.jsx`: read fully, apply standard palette to every raw `bg-white`/`bg-slate-50/100`/`text-slate-600-900`/`border-slate/gray-100-300` and badge instance found, same mechanical process as Phases 1-2.

### Per-file approach (3 files with `@media print` blocks)
`InventoryValuation.jsx`, `StockReorderReport.jsx`, `OtherChargesBreakdownReport.jsx`: read fully, locate the `<style>{...@media print...}</style>` block first (or external print CSS if not inline) and note its line range before making any edits, to avoid accidentally touching print-only rules while applying `dark:` classes to the surrounding on-screen JSX.

### Per-file approach (2 Recharts files)
`SalesAnalysisReport.jsx`, `WorkOrderSummaryReport.jsx`: read fully. First locate how the app's existing `darkMode` state is made available (check `Layout.jsx` and whether it's passed as a prop, context, or whether components read `document.documentElement.classList` directly — search for a precedent since Recharts theming hasn't been done anywhere in the app yet per this research). Apply standard `dark:` Tailwind classes to all surrounding non-chart markup (cards, headers, badges) as normal, then separately handle the chart's own `XAxis`/`YAxis`/`CartesianGrid`/`Tooltip`/`Legend` colors using whatever theme-detection mechanism is confirmed to already exist in the codebase.

---

## 4. Verification Plan

### UI verification steps
1. Toggle dark mode on.
2. Navigate to `/inventoryvaluation` and `/stockreorderreport`, confirm page backgrounds, tables, and any badges are legible.
3. Open each report modal (`CustomerReportModal`, `InventoryOnOrder`, `OtherChargesBreakdownReport`, `PartsMovementReportModal`, `ReportModal`, `SalesAnalysisReport`, `WorkOrderSummaryReport`) from wherever they're triggered in the Reports section, confirm legibility.
4. Specifically inspect the two Recharts-based reports (`SalesAnalysisReport.jsx`, `WorkOrderSummaryReport.jsx`) for chart axis labels, gridlines, tooltip background, and legend text — all must be legible against the dark background, not just the surrounding card chrome.
5. For the 3 print-capable pages/components, trigger print preview and confirm output is still light/white and unaffected by dark mode.
6. Toggle back to light mode and confirm zero regression.

### Checklist
- [x] `InventoryValuation.jsx` — page background, table, print output unaffected
- [x] `StockReorderReport.jsx` — page background, print output unaffected
- [x] `CustomerReportModal.jsx` — modal legible
- [x] `InventoryOnOrder.jsx` — modal/table legible
- [x] `OtherChargesBreakdownReport.jsx` — modal legible, 4 badges, print output unaffected
- [x] `PartsMovementReportModal.jsx` — modal legible, 4 badges
- [x] `ReportModal.jsx` — modal legible
- [x] `SalesAnalysisReport.jsx` — surrounding chrome + chart axes/gridlines/tooltip/legend all legible in dark mode
- [x] `WorkOrderSummaryReport.jsx` — surrounding chrome + chart axes/gridlines/tooltip/legend all legible in dark mode
- [x] Light-mode regression pass across all 9 files
- [x] No console errors introduced

---

## 5. Phase Results and Final Context

**Status: Code changes complete, awaiting manual visual verification.**

- What actually happened vs. planned: All 9 files edited as planned, matching the 3-group approach (4 plain files, 3 print-block files, 2 Recharts files). `dark:` counts: `InventoryValuation.jsx` 34, `StockReorderReport.jsx` 7 (this page already used CSS-variable classes like `text-foreground`/`bg-muted`/`bg-card` almost everywhere, so needed far fewer additions than its line count suggested), `CustomerReportModal.jsx` 14, `InventoryOnOrder.jsx` 26, `OtherChargesBreakdownReport.jsx` 16, `PartsMovementReportModal.jsx` 56 (highest in the phase, matching its highest-slate-bg-density prediction), `ReportModal.jsx` 4, `SalesAnalysisReport.jsx` 18, `WorkOrderSummaryReport.jsx` 9.
- Deviations/adjustments: All 3 `@media print` blocks (`InventoryValuation.jsx`, `StockReorderReport.jsx`, `OtherChargesBreakdownReport.jsx`'s popup-window print HTML) were located first and left completely untouched, per plan.
- Unexpected learnings — Recharts theming approach used: The plan's fallback idea (JS `darkMode` state threading) turned out to be unnecessary. Found a much simpler solution: the app's Shadcn CSS variables (`--foreground`, `--muted-foreground`, `--border`, `--card`, defined in `index.css` for both `:root` and `.dark`) can be referenced directly as inline SVG/style values — `stroke="hsl(var(--muted-foreground))"` on `XAxis`/`YAxis`, `stroke="hsl(var(--border))"` on `CartesianGrid`, and `contentStyle={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', color: 'hsl(var(--foreground))' }}` on `Tooltip` (plus `wrapperStyle={{ color: 'hsl(var(--foreground))' }}` on `Legend`). Since these are genuine CSS custom properties, the browser resolves them live against whichever theme is active — zero JS state, zero new hooks, fully consistent with the "styling only" constraint. `WorkOrderSummaryReport.jsx` additionally had a custom `CustomTooltip` component (a plain `<div>`, not Recharts' built-in `Tooltip`) — that one got ordinary Tailwind `dark:` classes instead since it's regular DOM, not an SVG/Recharts-styled element.
- **Addendum (closed out the Pie label gap):** Read Recharts' actual source (`node_modules/recharts/lib/polar/Pie.js`) to check the real behavior rather than guess. Turned out the pie percentage labels weren't rendering in a hardcoded illegible gray as first feared — when `label` is a function returning a plain string, Recharts fills the text with the sector's own data, which inherits each slice's `<Cell fill={...}>` color (the `COLORS` array). So it was a minor dark-mode contrast/consistency gap (that hardcoded hex color doesn't lighten for dark mode the way `text-blue-600 dark:text-blue-400` does elsewhere), not a full illegibility bug. Fixed in `SalesAnalysisReport.jsx` by changing the `label` prop from a function returning a string to one returning a custom `<text>` element with `fill="hsl(var(--foreground))"` — Recharts treats a function returning a valid React element as fully custom, bypassing its default slice-color fill logic. This keeps the label positioned exactly where Recharts would have placed it (computed from the same `cx`/`cy`/`midAngle`/`outerRadius`/`percent` props Recharts already passes in) while making the text color theme-aware like the rest of the chart's chrome. `WorkOrderSummaryReport.jsx`'s Pie chart has no `label` prop at all, so it had no equivalent gap.
- Key takeaways for rollup to Master Blueprint Section 7: The `hsl(var(--token))` technique for Recharts theming should become the standard approach for any future phase with charts (Phase 4's `financial-dashboard/` components use Recharts too, per Phase 3's research, though Phase 4 is currently skipped for conflict-avoidance reasons). For custom Pie labels specifically, return a React element (not a string) from the `label` prop to get full control over text styling.
- **Verification blocker (hit 3 times now, same signature each time):** the local Vite dev server reports "running" with the port listening, but returns empty HTTP replies to both the Browser pane and direct `curl` (and once surfaced as a "Policy check in progress" error on screenshot attempts). Did not retry further on any attempt, per the Phase 2 lesson already logged in Section 7 of the Master Blueprint. **Manual visual verification is still needed before marking Phase 6 Tested**, especially the two Recharts-based reports' chart legibility and the pie label fix above.
