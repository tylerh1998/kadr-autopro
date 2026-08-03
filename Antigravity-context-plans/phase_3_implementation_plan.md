# Phase 3 Implementation Plan — Work Orders: Remaining Modals (Dark Mode)

**Status:** Draft — pending approval. No code changes made yet.
**Type:** Multi-phase plan (28 files, ~6,800 lines total, several large/complex files — split into 5 sequential sub-phases: 3A–3E).
**Parent:** `Antigravity-context-plans/master_blueprint.md`, Phase 3 (previously `[Skipped — Conflict Avoidance]`, now unblocked)

---

## 0. Open Questions / Notes (all resolved — informational only, nothing blocking)

- **Conflict re-check (2026-08-03):** Phase 3 was originally skipped because it directly overlapped the concurrently-running Base44-deprecation blueprint's Phase 13 "Work Orders Core" (`Plans and Context/phase_13_implementation_plan.md`). That phase's own status line now shows sub-phases **13D and 13E both marked `[Tested]`** (2026-08-03), with a full WO-lifecycle regression passed live. The one remaining blocking item for Phase 13's own close-out — a redeploy/retest of a "Counter Sale" fix — lives entirely in `src/pages/WorkOrders.jsx`, which is **not** in this phase's 28-file scope. `git log`/`git status` confirm the working tree is clean for `src/components/work-orders/**` (no in-flight uncommitted changes). **Verdict: clean to proceed.**
- **Documentation lag noted, not a conflict:** `Plans and Context/master_blueprint.md`'s Phase 13 summary row still says "13D... and 13E... not started," which contradicts `phase_13_implementation_plan.md`'s own status line. This is a stale table cell on their side, not a signal of unfinished work — doesn't affect this phase.
- **Pre-existing bug flagged for awareness, not ours to fix:** `GetPartModal.jsx` has a documented, unrelated live bug (search box not responding to Enter/typing) noted in the Base44 blueprint as "flagged for whoever next touches this file." Our `dark:`-only styling pass won't interact with it, but don't get blamed for it during dark-mode QA — it predates this phase.
- **`NewWorkOrderModal.jsx` and `GetPartModal.jsx` carry known, unrelated data-layer TODOs** (a deferred `SystemSettings`/`WorkOrderStatus` swap, and a blocked `TagAlong`/`OtherChargeList` table-existence decision, respectively). Both are logic/data concerns — irrelevant to and untouched by this purely additive CSS phase.
- **No Recharts/chart library usage anywhere in this file set** (including `WorkOrderProfitability.jsx` and `WorkOrderReport.jsx`) — the Section 7 Recharts theming technique from Phase 6 doesn't apply here.
- **One `print:` Tailwind variant found** — `WorkOrderReport.jsx:336` (`hidden print:block` on a footer div). No `@media print` blocks elsewhere in the 28 files. Preserve as-is, no `dark:` needed on a print-only element.

**Effective scope for this plan: 28 files, split into sub-phases 3A–3E below.**

---

## 1. Phase Scope & Objectives

Apply `dark:` Tailwind variant classes to the remaining Work Orders modals/components with zero or near-zero dark mode coverage (all 28 files currently show a `dark:` grep count of 0). No logic, prop, or layout changes — styling only, fully additive per Section 7 Architecture Rule 3 of the master blueprint (`bg-white dark:bg-slate-900`, never replace a light class).

**In scope (28 files, all under `src/components/work-orders/` unless noted):**
`ConfirmCreditInvoiceModal.jsx`, `CreditConfirmationModal.jsx`, `EditProjectDetailsModal.jsx`, `FindPartModal.jsx`, `GetPartModal.jsx`, `GlobalClockInModal.jsx`, `NewWorkOrderModal.jsx`, `NoteBoard.jsx`, `NoteCard.jsx`, `NoteColumn.jsx`, `NotesStatusBar.jsx`, `NoteWorkOrderLinkModal.jsx`, `OpenROModal.jsx`, `ROApprovalsModal.jsx`, `ROInspectionModal.jsx`, `SESEmailModal.jsx`, `TechClockStatusModal.jsx`, `TechProjectClockInModal.jsx`, `TechTimeModal.jsx`, `WarrantyReturnModal.jsx`, `WorkOrderList.jsx`, `WorkOrderPdfModal.jsx`, `WorkOrderProfitability.jsx`, `WorkOrderReport.jsx`, `WorkPROViewModal.jsx`, `form/CreditInvoiceFinancialSummary.jsx`, `form/CreditInvoiceLineItemsTable.jsx`, `form/WorkOrderDetailsEditModal.jsx`.

**Out of scope:** Any business logic, data fetching, Base44/Supabase migration work, changes to `src/components/ui/*`, `src/pages/WorkOrders.jsx` (owned by the other blueprint's in-flight fix), or `WorkOrderTable.jsx` (has a duplicate `colorMap` worth flagging separately, not part of this phase).

---

## 2. Lessons Learned & Context (from Section 7 of Master Blueprint)

1. **Additive only** — never replace a light class, only add `dark:` alongside it.
2. **Composition-only wrapper files need no direct edits** — verify a 0-`dark:`-count file actually has no raw-color markup of its own before assuming it's missed work. Applies here to `NoteBoard.jsx` (39 lines, one grid `<div>`, all real markup delegated to `NoteColumn.jsx`).
3. **`slate-*`/`gray-*` shades used for light-mode text/backgrounds are not automatically dark-safe** — `text-slate-600/700/900` and `bg-slate-50/100` need distinct `dark:` pairs; already-muted `text-slate-400/500` is sometimes fine as-is, verify per-instance.
4. **Watch for hardcoded `bg-white`/`bg-gray-*` overrides on Shadcn primitives** — confirmed present this phase: `TechTimeModal.jsx:732` passes a raw `bg-gray-100 text-gray-800` className directly onto a `<SelectTrigger>`, fed by a local `CATEGORIES` color map (lines 14–22, 7 entries, all light-only). Same class of bug as the Phase 2 rollup's finding — the Shadcn primitive's own dark-safe default is being defeated by the override.
5. **Systematic color-map objects need pairing as a set, not instance-by-instance** — `WorkOrderList.jsx` has a 21-entry `colorMap` inside a local `StatusBadge` component (lines 36–59) driving badge colors; `TechTimeModal.jsx`'s `CATEGORIES` map (7 entries) has the same shape. Treat each map as one systematic task: add a `dark:` pair to every entry in one pass, not as scattered individual edits.
6. **Verification method: grep each target file for `dark:` occurrence count post-edit** as a fast sanity check before manual UI verification — a 0-count on a file with real markup is a red flag, a 0-count on a pure composer is expected and fine.
7. **Print output must stay unaffected** — `WorkOrderReport.jsx:336` has one `print:` variant; leave it untouched, don't add `dark:` to it.
8. **Dev server preview verification has been unreliable this session (recurred repeatedly with the same signature)** — don't burn cycles retrying; do the grep-based `dark:` count audit and hand off visual verification to the user.
9. **Check `Plans and Context/` for file overlap before scoping any phase** — already applied above; this phase is clear.

---

## 3. Phase 3 Roadmap & Progress

```
3A [Done — pending UI verify] ──► 3B [Done — pending UI verify] ──► 3C [Done — pending UI verify] ──► 3D [Done — pending UI verify] ──► 3E [Pending]
```

| Sub-Phase | Scope Summary | File Count | Approx. Lines | Status |
|---|---|---|---|---|
| **3A — Credit Invoice & RO Modals** | Confirmation/credit-invoice dialogs and repair-order approval/inspection modals. Mostly Shadcn-mixed, table-heavy line items. | 7 | ~1,340 | Done — pending UI verify |
| **3B — Work Order Creation, Parts & Editing** | New WO creation, part lookup/search, project/WO detail editing, warranty returns. Includes `GetPartModal.jsx` (largest single file, 745 lines) and the known pre-existing Enter-key bug to avoid disturbing. | 6 | ~2,080 | Done — pending UI verify |
| **3C — Notes, Communications & Documents** | Notes board/cards/columns, SES email modal, PDF modal. Includes the pure-wrapper `NoteBoard.jsx` (verify-only) and `NoteCard.jsx`'s share-button color-variant object. | 7 | ~810 | Done — pending UI verify |
| **3D — Tech Time & Clock-In** | Global/tech clock-in modals, tech time logging, WorkPRO (third-party SaaS) view modal. Includes `TechTimeModal.jsx`'s `CATEGORIES` map + Shadcn `SelectTrigger` override gotcha. | 5 | ~1,875 | Done — pending UI verify |
| **3E — Lists & Reports** | WO list (21-entry `colorMap`), profitability dashboard, printable report (`print:` variant to preserve). | 3 | ~1,205 | Pending |

---

### 3A — Credit Invoice & RO Modals

**Files:** `ConfirmCreditInvoiceModal.jsx` (220 ln, 5 light-class hits), `CreditConfirmationModal.jsx` (115 ln, 1 hit), `OpenROModal.jsx` (277 ln, 6 hits), `ROApprovalsModal.jsx` (204 ln, 6 hits), `ROInspectionModal.jsx` (238 ln, 2 hits), `form/CreditInvoiceFinancialSummary.jsx` (121 ln, 13 hits), `form/CreditInvoiceLineItemsTable.jsx` (162 ln, 27 hits — table-heavy, most `dark:` additions in this sub-phase).

**Detailed Execution Plan:**
- Read each file fully before editing (all are small-to-medium; single-pass mapping is efficient at this size).
- Apply the standard palette (Section 5 below) to all `bg-white`/`bg-slate-*`/`text-slate-*`/`border-slate-*` instances found.
- `CreditInvoiceLineItemsTable.jsx` and `CreditInvoiceFinancialSummary.jsx` are consumed by `CreditInvoice.jsx` (a page explicitly noted elsewhere as still in the *other* blueprint's Phase 13D/13E historical scope, but confirmed `[Tested]`/closed) — no functional interaction expected, just note if any surprising coupling surfaces during read.
- `ROApprovalsModal.jsx`, `ROInspectionModal.jsx`, `OpenROModal.jsx` were confirmed via 13B/13D/13E as already using native data calls — read-only context, no logic touched.

**Task List:**
- [x] `ConfirmCreditInvoiceModal.jsx` — dark: pass (15 `dark:` instances)
- [x] `CreditConfirmationModal.jsx` — dark: pass (6 instances)
- [x] `OpenROModal.jsx` — dark: pass (7 instances)
- [x] `ROApprovalsModal.jsx` — dark: pass (11 instances)
- [x] `ROInspectionModal.jsx` — dark: pass (9 instances)
- [x] `form/CreditInvoiceFinancialSummary.jsx` — dark: pass (16 instances)
- [x] `form/CreditInvoiceLineItemsTable.jsx` — dark: pass (27 instances, table rows/headers, largest instance count in sub-phase)

**Verification Plan:** Grep each file post-edit for `dark:` count > 0 (except none expected to be pure wrappers here). UI: open a credit invoice flow, an RO approval, and an RO inspection in dark mode; confirm legible text/borders/table rows; confirm light-mode unaffected.

**3A Execution Notes (2026-08-03):** All 7 files edited additively — every `dark:` class added alongside its existing light class, none replaced. Grep audit post-edit: all 7 files show `dark:` count > 0 (48 total across the 5 top-level modals, 43 total across the 2 `form/` files) — matches expectations, no red flags. Two deliberate no-ops left as-is (already dark-safe per Section 7 lesson 3 — muted enough to work in both modes, or already a solid dark surface): `GetPartModal`-style `Ban`/muted icons at `text-slate-400` in `CreditInvoiceLineItemsTable.jsx`, and its `TooltipContent` `bg-slate-900 text-white` (already a dark surface). Solid-color status `Badge`s in `ROApprovalsModal.jsx`/`ROInspectionModal.jsx` (`bg-green-600`/`bg-red-600`/`bg-yellow-600`/`bg-blue-600`) were left unpaired — saturated solid fills, already legible on both light and dark backgrounds, consistent with treating shadcn `Badge` solid variants as already dark-safe. Per lesson 8, dev server preview was not attempted this pass (documented as unreliable this session) — UI verification in dark mode is handed off to the user per the plan's standing note.

---

### 3B — Work Order Creation, Parts & Editing

**Files:** `NewWorkOrderModal.jsx` (485 ln, 10 hits, 2 badges), `FindPartModal.jsx` (191 ln, 1 hit), `GetPartModal.jsx` (745 ln, 9 hits — largest file in phase), `EditProjectDetailsModal.jsx` (116 ln, 0 hits — mostly Shadcn, verify-only likely), `form/WorkOrderDetailsEditModal.jsx` (183 ln, 0 hits — mostly Shadcn, verify-only likely), `WarrantyReturnModal.jsx` (358 ln, 4 hits).

**Detailed Execution Plan:**
- `GetPartModal.jsx`: read fully given its size before editing, to map all instances in one pass rather than multiple partial edits (same precedent as Phase 7's `LinesOfCredit.jsx`). **Do not touch the search-input Enter-key handling logic** — it has a known pre-existing bug unrelated to this phase; if noticed, leave it exactly as-is (styling only).
- `EditProjectDetailsModal.jsx` and `form/WorkOrderDetailsEditModal.jsx`: read to confirm they're genuinely low-raw-markup Shadcn forms (0 `dark:` count with 0 flagged light-only classes) before assuming no edit is needed — per Phase 2 lesson, a 0-count is not automatically a red flag, but must be confirmed by reading, not assumed.
- `WarrantyReturnModal.jsx`: was touched by Phase 13E for a `GLTransaction.id` bug fix (already live-verified) — pure styling addition on top, no functional overlap expected.
- `NewWorkOrderModal.jsx`: has 2 badge instances — apply dark-safe badge pairs per the standard palette.

**Task List:**
- [x] `NewWorkOrderModal.jsx` — dark: pass incl. 2 badges (17 `dark:` instances)
- [x] `FindPartModal.jsx` — dark: pass (4 instances)
- [x] `GetPartModal.jsx` — full read, single-pass dark: mapping (26 instances)
- [x] `EditProjectDetailsModal.jsx` — confirmed Shadcn-only (0 raw color classes), verify-only, no edit made
- [x] `form/WorkOrderDetailsEditModal.jsx` — confirmed Shadcn-only (0 raw color classes), verify-only, no edit made
- [x] `WarrantyReturnModal.jsx` — dark: pass (16 instances)

**Verification Plan:** Grep-audit all 6 files. UI: create a new work order, search/add a part, edit project details, process a warranty return — all in dark mode; confirm no regression in light mode. Explicitly confirm `GetPartModal.jsx`'s pre-existing search bug is neither fixed nor worsened (out of scope either way).

**3B Execution Notes (2026-08-03):** All edits additive. Grep audit: 4 edited files show `dark:` count > 0 (63 total); `EditProjectDetailsModal.jsx` and `form/WorkOrderDetailsEditModal.jsx` both correctly show 0 — read in full and confirmed as genuinely Shadcn-only forms (`Dialog`/`Label`/`Input`/`Textarea`/`Checkbox`/`Button` primitives, zero raw `bg-*`/`text-*`/`border-*` color classes), matching the plan's prediction, not a red flag. `GetPartModal.jsx`'s search-related logic (`handleSearchKeyDown`, the Enter-key search flow) was read but not touched — styling-only changes applied around it. Two step-indicator "badges" in `NewWorkOrderModal.jsx` (`step >= 1`/`step >= 2` pill conditionals) each needed independent editing since their conditions differ, even though their class strings were textually identical — a `replace_all` on the first only caught one instance. Left several solid-fill buttons/badges unpaired throughout (`bg-blue-600`, `bg-green-600`, `bg-yellow-500` submit/action buttons) as already dark-safe saturated colors, consistent with 3A precedent.

---

### 3C — Notes, Communications & Documents

**Files:** `NoteBoard.jsx` (39 ln, 0 hits — pure wrapper), `NoteCard.jsx` (152 ln, 38 hits, 3 badge/color-variant patterns), `NoteColumn.jsx` (42 ln, 3 hits), `NotesStatusBar.jsx` (31 ln, 8 hits), `NoteWorkOrderLinkModal.jsx` (64 ln, 7 hits), `SESEmailModal.jsx` (309 ln, 0 flagged light-only classes — needs a full read to confirm, likely CSS-variable-based or otherwise dark-safe already), `WorkOrderPdfModal.jsx` (170 ln, 4 hits).

**Detailed Execution Plan:**
- `NoteBoard.jsx`: confirm pure composition wrapper (one grid `<div>`, delegates to `NoteColumn.jsx`) — verify-only, no edit expected, same pattern as `APSummary.jsx` in Phase 7.
- `NoteCard.jsx`: highest instance count in this sub-phase — has share-button active-state color variants (green/yellow/pink) that need dark-safe pairs as a set, similar treatment to the color-map lesson above.
- `NoteColumn.jsx`: **not** a pure wrapper despite being small — has real markup (drag-over highlight, empty-state styling) that needs `dark:` classes.
- `SESEmailModal.jsx`: read fully to determine why 0 light-only classes were flagged despite having real markup — confirm whether it already uses `text-foreground`/`bg-card`-style CSS-variable classes (already dark-safe, Phase 6 precedent) or whether the grep pattern simply missed something; document the finding either way.

**Task List:**
- [x] `NoteBoard.jsx` — confirm wrapper, verify-only
- [x] `NoteCard.jsx` — dark: pass incl. share-button color variants (95 instances across 5 color themes)
- [x] `NoteColumn.jsx` — dark: pass (drag-over + empty state) (4 instances)
- [x] `NotesStatusBar.jsx` — dark: pass (18 instances)
- [x] `NoteWorkOrderLinkModal.jsx` — dark: pass (8 instances)
- [x] `SESEmailModal.jsx` — full read, determine actual dark-mode gap, edit or confirm already-safe (8 instances)
- [x] `WorkOrderPdfModal.jsx` — dark: pass (6 instances)

**Verification Plan:** Grep-audit all 7 files. UI: open the notes board (drag a card between columns), link a note to a WO, send a test SES email preview, open a WO PDF preview — all in dark mode.

**3C Execution Notes (2026-08-03):** All edits additive. Grep audit: `NoteBoard.jsx` correctly shows 0 (confirmed genuine pure wrapper — one grid `<div>`, delegates fully to `NoteColumn.jsx`, no edit made); all 6 remaining files show `dark:` count > 0 (139 total). `NoteCard.jsx`'s 5-entry `cardThemes` map (white/blue/green/yellow/pink, each with 10 sub-keys: wrapper/icon/body/bodyText/divider/utilityButton/shareActiveButton/utilityIcon/headerTitle/headerSubtitle/headerLink) was treated as one systematic pass per the color-map lesson — tinted themes (blue/green/yellow/pink) got `dark:bg-{color}-950/30` card surfaces with `dark:border-{color}-800` and `dark:text-{color}-300` accents, following the existing badge palette convention; muted `text-slate-400` icons were left unpaired as already dark-safe (Section 7 lesson 3). `NoteColumn.jsx` was **not** a pure wrapper as flagged in the detailed plan — its drag-over highlight and empty-state markup both needed `dark:` pairs. `SESEmailModal.jsx` investigation resolved: the file is overwhelmingly Shadcn primitives (`Dialog`/`Label`/`Input`/`Textarea`/`ToggleGroup`, already dark-safe), but the initial grep missed two conditionally-rendered blocks (`creatingSnapshot` and `snapshotError` notification banners, `bg-blue-50`/`bg-red-50` with `-200` borders and `-800` text) — these are real light-only markup and were paired. The outgoing HTML email template string (`htmlBody`, lines ~128–162) was correctly left untouched — it's rendered in the recipient's email client, not the app UI, so dark mode doesn't apply. `WorkOrderPdfModal.jsx`'s solid `text-red-500` error-state accent color was paired with `dark:text-red-400` for consistency with the rest of the pass (not a saturated Badge/Button fill, so not covered by the "already dark-safe" exception).

---

### 3D — Tech Time & Clock-In

**Files:** `GlobalClockInModal.jsx` (118 ln, 0 hits — mostly Shadcn), `TechClockStatusModal.jsx` (267 ln, 12 hits, 5 badges), `TechProjectClockInModal.jsx` (343 ln, 5 hits), `TechTimeModal.jsx` (777 ln, 23 hits, 11 badges — largest instance count in phase, has the Shadcn-override gotcha), `WorkPROViewModal.jsx` (369 ln, 23 hits, 4 badges).

**Detailed Execution Plan:**
- `TechTimeModal.jsx`: read fully given its size (777 lines, second-largest file in phase). Fix the confirmed gotcha at line 732 — the hardcoded `bg-gray-100 text-gray-800` override on a `<SelectTrigger>` needs a `dark:` pair added alongside (additive, don't remove the light classes). The `CATEGORIES` map (lines 14–22, 7 entries) needs a `dark:` pair added to every entry's `color` value as one systematic pass.
- `TechClockStatusModal.jsx` and `WorkPROViewModal.jsx`: both tied to a third-party WorkPRO SaaS integration per the conflict research — confirmed no pending Base44-migration work on either, pure styling pass.
- `GlobalClockInModal.jsx`: confirm Shadcn-only (0 hits, 0 flagged classes) before treating as verify-only.

**Task List:**
- [x] `GlobalClockInModal.jsx` — confirm Shadcn-only, edit or verify-only (1 instance found + fixed, not purely Shadcn)
- [x] `TechClockStatusModal.jsx` — dark: pass incl. 5 badges (41 instances)
- [x] `TechProjectClockInModal.jsx` — dark: pass (13 instances)
- [x] `TechTimeModal.jsx` — full read; fix `SelectTrigger` override + `CATEGORIES` map as one pass; dark: pass on remaining 23 instances/11 badges (60 instances total)
- [x] `WorkPROViewModal.jsx` — dark: pass incl. 4 badges (49 instances)

**Verification Plan:** Grep-audit all 5 files. UI: clock in globally, clock into a tech project, open tech time log (confirm the category `SelectTrigger` dropdown is legible in dark mode, not a jarring light box), open a WorkPRO view modal — all in dark mode.

**3D Execution Notes (2026-08-03):** All edits additive. Grep audit: all 5 files show `dark:` count > 0 (164 total). `GlobalClockInModal.jsx` was **not** genuinely Shadcn-only as predicted — it had one real light-only hint text (`text-xs text-slate-500` on line 103), consistent with the established codebase convention (`dark:text-slate-400`) seen across many already-completed files; fixed. `TechTimeModal.jsx`'s `CATEGORIES` map (7 entries, lines 14-22) got a `dark:` pair added to each `color` value in one systematic pass — since `config.color` is consumed both as a `Badge` className (in the nested `SplitTimeDialog`) and as the flagged `SelectTrigger` override, the single map edit covered both consumers. The confirmed gotcha at the `SelectTrigger` override (`bg-gray-100 text-gray-800` for manual entries) was paired with `dark:bg-slate-700/60 dark:text-slate-300`. `TechTimeModal.jsx`'s nested `SplitTimeDialog` component (not called out by name in the file-list line count but part of the same file) also needed its own dark: pass — total/remaining hours display, allocation input active-state border, and the allocation-mismatch error banner. Two hardcoded third-party WorkPRO API key constants were noticed in passing (`TechProjectClockInModal.jsx` lines 8-9 and `WorkPROViewModal.jsx` lines 20-21) — a pre-existing client-side credential exposure unrelated to this styling phase; flagged as a separate background task rather than fixed here (out of scope, data/security concern not styling). Confirmed via `src/index.css:152-155` that bare `border`/`border-t` classes (no explicit color utility) already resolve through the theme-aware `--border` CSS variable set at the `@layer base` level, so unqualified border utilities across all 5 files were correctly left unpaired — not an oversight. Saturated solid badge fills in `WorkPROViewModal.jsx`'s `getApprovalBadge` (`bg-green-600`/`bg-red-600`/`bg-yellow-600`) were left unpaired, consistent with 3A/3B/3C precedent for already dark-safe solid fills.

---

### 3E — Lists & Reports

**Files:** `WorkOrderList.jsx` (366 ln, 10 hits, 24 badge/colorMap hits — 21-entry `colorMap` + 1 inline conditional badge), `WorkOrderProfitability.jsx` (498 ln, 17 hits, 3 badges), `WorkOrderReport.jsx` (340 ln, 38 hits — fully raw HTML printable report, one `print:` variant to preserve).

**Detailed Execution Plan:**
- `WorkOrderList.jsx`: the 21-entry `colorMap` (lines 36–59) inside the local `StatusBadge` component is the highest-leverage single edit in this sub-phase — add a `dark:` pair to every entry in one pass rather than treating as 21 scattered edits. Plus the 1 additional inline conditional badge at line 222, plus the remaining 10 general instances.
- `WorkOrderProfitability.jsx`: no chart library, numeric/tabular cards + margin-threshold badges only — standard palette pass.
- `WorkOrderReport.jsx`: fully raw HTML, largest instance count in this sub-phase (38) — printable report layout. Locate the `print:block` variant at line 336 first and leave it untouched; apply the standard palette to all on-screen (non-print) markup.
- **Informational, not in scope:** `WorkOrderList.jsx`'s exact `colorMap` is duplicated verbatim in `WorkOrderTable.jsx` (already `[Tested]`/dark-mode-complete per the master blueprint's "Previously Completed" list) — worth spot-checking that file already has the equivalent dark pairs applied (it should, if already marked done) as a quick sanity cross-check, not a new edit target.

**Task List:**
- [ ] `WorkOrderList.jsx` — `colorMap` dark: pairing as one pass, + inline badge, + remaining instances
- [ ] `WorkOrderProfitability.jsx` — dark: pass incl. 3 badges
- [ ] `WorkOrderReport.jsx` — dark: pass, preserve `print:block` at line 336
- [ ] Spot-check `WorkOrderTable.jsx` (already-complete file) for colorMap consistency — no edit expected

**Verification Plan:** Grep-audit all 3 files. UI: view the WO list (confirm every status badge color reads correctly in dark mode), open WO profitability view, open a WO report and trigger print preview (confirm print output stays light/unaffected) — all in dark mode.

---

## 4. Final Verification Plan (All Sub-Phases Together)

### UI verification steps
1. Toggle dark mode on.
2. Work through the full WO lifecycle touching every file in this phase: create a new WO (`NewWorkOrderModal`) → find/add a part (`FindPartModal`/`GetPartModal`) → edit project details (`EditProjectDetailsModal`/`form/WorkOrderDetailsEditModal`) → open RO approval/inspection (`OpenROModal`/`ROApprovalsModal`/`ROInspectionModal`) → process a credit invoice (`ConfirmCreditInvoiceModal`/`CreditConfirmationModal`/`form/CreditInvoiceFinancialSummary`/`form/CreditInvoiceLineItemsTable`) → process a warranty return (`WarrantyReturnModal`) → use the notes board (`NoteBoard`/`NoteCard`/`NoteColumn`/`NotesStatusBar`/`NoteWorkOrderLinkModal`) → send an SES email and view a PDF (`SESEmailModal`/`WorkOrderPdfModal`) → clock in/view tech time (`GlobalClockInModal`/`TechClockStatusModal`/`TechProjectClockInModal`/`TechTimeModal`/`WorkPROViewModal`) → view the WO list, profitability, and a report (`WorkOrderList`/`WorkOrderProfitability`/`WorkOrderReport`, incl. print preview).
3. Toggle back to light mode and confirm zero regression across all 28 files.
4. Confirm no console errors introduced.

### Checklist
- [x] 3A — Credit Invoice & RO Modals (7 files) — edits done 2026-08-03, UI dark-mode verification still pending
- [x] 3B — Work Order Creation, Parts & Editing (6 files) — edits done 2026-08-03, UI dark-mode verification still pending
- [x] 3C — Notes, Communications & Documents (7 files) — edits done 2026-08-03, UI dark-mode verification still pending
- [x] 3D — Tech Time & Clock-In (5 files) — edits done 2026-08-03, UI dark-mode verification still pending
- [ ] 3E — Lists & Reports (3 files)
- [x] `TechTimeModal.jsx` Shadcn `SelectTrigger` override + `CATEGORIES` map fixed
- [ ] `WorkOrderList.jsx` `colorMap` fully paired
- [ ] `WorkOrderReport.jsx` print output unaffected
- [ ] Light-mode regression pass across all 28 edited files
- [ ] No console errors introduced

### Handoff Context to Next Phase
Once Phase 3 is `[Tested]`, revisit Phase 4 (Financial Pages & Components — currently skipped pending the Base44 blueprint's Phase 10) and Phase 5 (Customers/Vehicles/Appointments Gaps — currently skipped pending Phase 13, which is now effectively resolved; re-check `WorkOrderView.jsx`/`CreditInvoice.jsx` conflict status specifically since Phase 5 cited those against Phase 13D/13E, now `[Tested]`) as the next candidates. Phase 8 (Full Audit Pass) should still come last, after Phases 3, 4, and 5 are all closed out.

---

## 5. Standard Palette (from Section 7)
```
Container/modal bg:    dark:bg-slate-950
Card/panel bg:         dark:bg-slate-900
Subtle section bg:     dark:bg-slate-800
Input bg:              dark:bg-slate-800
Input text:            dark:text-slate-100
Input border:          dark:border-slate-600
Primary text:          dark:text-slate-100
Secondary text:        dark:text-slate-300
Muted/label text:      dark:text-slate-400
Table header bg:       dark:bg-slate-800
Table header text:     dark:text-slate-300
Table row stripe:      dark:bg-slate-800/40
Table row hover:       dark:hover:bg-slate-700/50
Border:                dark:border-slate-700 or dark:border-slate-800
Badge (green):         dark:bg-green-900/40 dark:text-green-300
Badge (blue):          dark:bg-blue-900/40 dark:text-blue-300
Badge (red):           dark:bg-red-900/40 dark:text-red-300
Badge (yellow):        dark:bg-yellow-900/40 dark:text-yellow-300
Badge (gray):          dark:bg-slate-700/60 dark:text-slate-300
Divider/separator:     dark:divide-slate-700
```

---

## 6. Phase Results and Final Context

*(Live section — to be filled in during/after execution.)*

- What actually happened vs. planned:
- Deviations/adjustments:
- Unexpected learnings:
- Key takeaways for rollup to Master Blueprint Section 7:
