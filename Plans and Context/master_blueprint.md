# AutoPRO ← PayPRO Merge — Master Blueprint

**Drafted 2026-08-17.** Baseline commit `a17bc718`. Target branch: `development`.
Companion document: `master_context.md` (standing architecture/status facts — read it first).

> **Status: Phase 1 `[Tested]`, complete 2026-08-18 — ready to begin Phase 2.** All four Phase 1 sub-phases (1A–1D) executed and verified on both `hbcrwkmgsazqrvsrmxyr` (prod) and `sitihbdnuxifwibontcm` (dev); full detail in `phase_1_implementation_plan.md`. All design questions and data confirmations are resolved (§0.1, §0.3).
>
> **Delivery is two engagements:** Phases 1–8 → **Phase 8.5 parallel-run hold (up to ~1 month)** → Phases 9–11.

---

## ⚠️ Read this first: the imported tables are a staging snapshot, not the source of truth

The ten `PayPro_*` tables now present on the **production** Supabase project (`hbcrwkmgsazqrvsrmxyr`) are a **point-in-time copy** exported from base44 on 2026-08-17. **Base44-hosted PayPRO remains the live system** — it is still serving real payroll, and will keep doing so until the Phase 11 cutover.

Three consequences run through this entire blueprint:

| Consequence | Impact |
|---|---|
| **The prod tables are inert.** Nothing reads or writes them; no AutoPRO code references them yet | They can be altered, retyped, truncated and re-imported freely. "It's on production" carries none of its usual weight here — this is the one part of production that is *not* live |
| **The snapshot will go stale.** Every payroll run, remittance and employee edit made in base44 between now and cutover is invisible to these tables | Phase 11 **must** perform a final re-import, not a delta merge. The blueprint treats today's data as structurally representative but numerically provisional |
| **Verification results have a shelf life.** The integrity audit below is true of *this* snapshot | Re-run the full audit against the final import at cutover. Passing today does not mean passing then |

---

## 0) Decisions Taken & Items Still Open

### 0.1 Resolved

| # | Question | **Decision** |
|---|---|---|
| Q1 | Entity access layer | **Thin native shim.** One module exposing base44's six verbs over `supabase.from()`. Call sites change import path only |
| Q2 | Adjustments after dropping `AddAdjustmentModal` | **Accept the losses.** No change to `autopro-postJournalEntries`. Adjustments become pure GL journal entries; cash side recorded separately |
| Q3 | Base44 CSV export | **Done.** Imported to production 2026-08-17. Full audit in §2 |
| Q4 | `PayPro_Employee` → `Employee` linkage | **New additive column `employee_db_id`.** `employee_id` keeps its `EMP001` values. **May be added on prod immediately** |
| Q7 | Table naming | **`PayPro_*` PascalCase** as imported — see §0.4 |
| Q8 | Fiscal Period gate on Mark Paid | **Approved.** `checkFiscalPeriodStatus()` runs before any payroll money-moving write |
| O1 | Logo mapping | **`KensAutoDieselRepair11.jpg` → `KADR/KADRLogoAddress.jpg`.** The `KensLogoOnly.jpg` reference disappears with PayPRO's `Layout.jsx` |
| O2 | Cancel Payment GL semantics | **Complete reversal of Mark Paid.** Every debit becomes a credit and vice versa, plus a reversing `BankTransaction` |
| O3 | Bus Driver flag | **Derived** from `PayPro_Employee.employee_type === 'Bus Driver'`, operator-overridable. One employee (EMP004) carries this today |
| S1 | `paypro-*` function naming | **Approved.** Carve-out written into `master_context.md` §4 |
| S3 | `PayrollTransaction` archival | **Out of scope.** You will remove it manually. This blueprint does not touch it |
| S4 | `PayPeriods` bigint hours | **Approved.** Widened to `double precision` in Phase 1 |
| — | Dev environment | **Phase 1 replicates prod → dev.** Dev currently has zero `PayPro_*` tables |
| — | Delivery shape | **Two engagements with a validation gate.** Phases 1–8, then a parallel-run hold of up to ~1 month (Phase 8.5), then Phases 9–11 |

### 0.2 What Phase 1 became

The import landing ahead of the blueprint changes Phase 1 from *"create ten tables and import"* to four corrective workstreams:

```
┌─ A ─ Fix the 15 mis-inferred column types (CSV type inference got them wrong)
├─ B ─ Add RLS policies      (all 10 tables: RLS ON, ZERO policies — currently blocking everything)
├─ C ─ Add employee_db_id + UNIQUE on employee_id   ← approved for immediate prod application
└─ D ─ Replicate schema + data prod → dev
```

**Corrected during execution:** the true count is **15**, not 11 — the original count grouped four `PayPro_TaxYearConstant` columns onto one row and omitted the two `PayPeriods` columns (`total_pto_hours`/`total_stat_hours`, S4). See §7 lesson 4.

Nothing needs creating from scratch. The structural work — table shapes, id preservation, jsonb encoding, referential integrity — is **already correct and verified** (§2).

### 0.3 Data confirmations — all resolved 2026-08-17

| # | Item | Resolution |
|---|---|---|
| C1 | EMP003 / EMP010 carry `federal_td1_basic` and `provincial_td1_basic` of `0` | **Accurate, not a glitch.** Legitimate zero-exemption claims. No action |
| C2 | Orphaned active `Garnishment` deduction | **Fixed by user.** Re-verified: 0 orphans, deductions now 3 (was 4). All six referential-integrity checks now clean |
| C3 | `workpro_api_key` in plaintext | **Not a live credential** — superseded ~3 months ago, redundant. Will be deleted before go-live. R18 downgraded accordingly |

### 0.4 Table name map (as imported)

`PayPro_*` PascalCase — which **matches AutoPRO's existing convention** (`WorkOrder`, `BankAccount`, `PayrollTransaction`) more closely than the snake_case originally proposed, while still making the module boundary obvious in every query and log line.

| base44 entity | Postgres table | Rows |
|---|---|---|
| `Employee` | `PayPro_Employee` | 11 |
| `PayStub` | `PayPro_PayStub` | 112 |
| `Remittance` | `PayPro_Remittance` | 7 |
| `EmployeeDeduction` | `PayPro_EmployeeDeduction` | 4 |
| `EmployeePayType` | `PayPro_EmployeePayType` | 34 |
| `EmployeeFile` | `PayPro_EmployeeFile` | 27 |
| `TrainingRecord` | `PayPro_TrainingRecord` | 4 |
| `ValidPayType` | `PayPro_ValidPayType` | 8 |
| `TaxYearConstant` | `PayPro_TaxYearConstant` | 1 |
| `PayrollSetting` | `PayPro_PayrollSetting` | 2 |

Column names are unchanged from base44 throughout, per requirement #4.

---

## 1) Objectives

### Core vision

Fold KADR PayPRO — today a standalone base44-hosted sister application — into AutoPRO as a first-class, permission-gated **module** at `/paypro/*`, and complete its base44 deprecation (database, functions, authentication) in the same motion. When this is done, base44 hosts nothing for PayPRO, and AutoPRO's own stopgap payroll implementation is retired.

### TL;DR architecture change

```
BEFORE (today)                                  AFTER (post Phase 11)
──────────────                                  ─────────────────────
┌──────────────────┐                            ┌────────────────────────────────┐
│  PayPRO (base44) │  ◄── STILL LIVE            │  AutoPRO (Vercel + Supabase)   │
│                  │                            │                                │
│  base44 auth ────┼──┐                         │  myKADR auth (AAL2 / passkey)  │
│  base44 entities │  │                         │       │                        │
│  13 base44 fns   │  │ service key             │       ▼                        │
│  own Layout/nav  │  │                         │  ┌──────────────────────────┐  │
│       │          │  │                         │  │ /paypro/* module         │  │
└───┬───┴──────────┘  │                         │  │  10 PayPro_* tables      │  │
    │ CSV export      ▼                         │  │  8 paypro-* edge fns     │  │
    │ (snapshot) ┌─────────────────┐            │  │  RLS: AAL2 + paypro_user │  │
    └───────────►│ AutoPRO         │            │  │  AutoPRO's Layout shell  │  │
                 │  Supabase       │            │  └───────────┬──────────────┘  │
                 │  PayPro_* ◄─ inert           │              │ direct          │
                 │  TimeRecord     │            │              ▼                 │
                 │  BankAccount    │            │   GLTransaction / BankTransac  │
                 └─────────────────┘            │   TimeRecord / BankAccount     │
                                                └────────────────────────────────┘
```

### Goals

| # | Goal | Source requirement |
|---|---|---|
| G1 | PayPRO auth deleted; AutoPRO's myKADR session is the only auth path | #1 |
| G2 | PayPRO becomes a module, not a sister app; AutoPRO's stopgap payroll retired | #1 |
| G3 | Pages mirrored at `src/pages/paypro/<PageName>` → route `/paypro/PageName` | #2 |
| G4 | **Complete frontend replication** — only the connection layer changes | #3 |
| G5 | Backend column names and business logic preserved | #4 |
| G6 | Payroll nav dropdown gated on `Employee.paypro_user` | #5 |
| G7 | All new edge functions named `paypro-[functionname]` | #6 |
| G8 | `PayPro_Employee` separates payroll/HR identity from auth identity, with its own RLS gate | #7 |
| G9 | Mark as Paid / Cancel Payment post to `GLTransaction` + `BankTransaction` | #8 |
| G10 | Payroll adjustments handled via Accounting Journal Entries | #9 |
| G11 | Resend reintegrated; payroll email **excluded** from `SentEmailLog` | #10 |
| G12 | New monthly remittance-reminder cron (10th of month) | #11 |

---

## 2) Previously Completed

### 2.1 The data import — completed 2026-08-17, audited

All ten tables imported to **production only**. Audit results:

**✅ Structurally sound — no remediation needed**

| Check | Result |
|---|---|
| **jsonb encoding (R1, the highest-risk item)** | **All 5 array columns are genuine `array` type on 100% of rows.** `income_breakdown` 112/112 · `additional_deductions` 112/112 · `pay_stub_ids` 7/7 · `federal_tax_brackets` 1/1 · `provincial_tax_brackets_ab` 1/1. **No double-encoding anywhere** |
| Referential integrity | **0 orphans on 5 of 6 checks** — paystub→employee 112/112, paytype→employee 34/34, training→employee 4/4, file→employee 27/27, and all **104** `pay_stub_ids` array elements resolve. One exception: C2 |
| Primary keys | Present on all 10 |
| ID preservation | base44 24-hex ids preserved verbatim; no DB defaults (matches project convention) |
| Audit fields | `created_date`/`updated_date`/`created_by`/`created_by_id` present on all 10 |
| Business key integrity | `PayPro_Employee.employee_id` — 11 rows, 11 distinct, 0 null |
| Date columns | Landed as `text` in clean `YYYY-MM-DD`. Consistent with this project's other legacy tables |

**❌ Needs fixing in Phase 1**

| Issue | Detail |
|---|---|
| **RLS enabled, ZERO policies, all 10 tables** | R4 confirmed live — the `rls_auto_enable` event trigger. Every table silently returns nothing, with no error |
| **15 mis-inferred column types** *(corrected from an original count of 11 — see §7 lesson 4)* | CSV type inference — see Phase 1 workstream A |
| **Plaintext credential** | `workpro_api_key` stored as an ordinary `PayPro_PayrollSetting` row |
| **No `employee_db_id`** | Not yet added |
| **No UNIQUE on `PayPro_Employee.employee_id`** | Despite being the paystub join key. Safe to add — values already distinct |
| **Dev has nothing** | Zero `PayPro_*` tables on `sitihbdnuxifwibontcm` |
| `is_sample` column | base44 export artifact on all 10 |

**Data profile (this snapshot)**

- 11 employees — 9 active, 2 inactive, **1 Bus Driver** (EMP004, confirming O3 has real data)
- 112 paystubs — 2026-01-09 → 2026-08-14, 110 paid, 2 cancelled
- 7 remittances — 2026-02-11 → 2026-08-15
- **Only one `TaxYearConstant` row (2026).** Sufficient to recompute every existing stub; prior-year T4s would have no constants
- **All 27 employee files point at base44 URLs** — full Phase 3 migration volume
- `period_close_date = 2026-07-31`
- **CPP2 entirely unused** — 0 rows with a non-zero `cpp2_deduction`, 0 with `ytd_cpp2` populated. This is *why* both columns mis-inferred

**Roster match — 7 of 11 map to an AutoPRO `Employee` row**

| Matched (7) | Unmatched (4) |
|---|---|
| EMP001 Ryley Bates · EMP002 Elisa Haney · EMP003 Tyler Haney · EMP005 Glenda Millhouse · EMP008 Annika Gelech · EMP009 Marshall Johnston · EMP011 Marley Jacobs | **EMP004 Cheryl Lawrence** (Bus Driver, active, no `kadr_email`) · **EMP010 Anne Fehr** (active, no `kadr_email`) · EMP006 Cruise Bensmiller (inactive) · EMP007 Samantha Eyben (inactive) |

This vindicates the additive `employee_db_id` over the re-key — under a re-key these four would have blocked the import outright. Nullable, they simply carry null.

### 2.2 On the AutoPRO side

| Item | State |
|---|---|
| Base44 deprecation (AutoPRO) | **Complete** 2026-08-13, 15 phases |
| Go-live | **Complete** 2026-08-15. `autopro.kensauto.ca` → `main` → `hbcrwkmgsazqrvsrmxyr`, real traffic |
| WO locking remediation | Complete on dev + prod 2026-08-15/16 |
| RLS strong-auth gate | Complete on dev + prod 2026-08-16. `public.staff_strong_auth()` requires AAL2/passkey |
| `Employee.paypro_user` | **Exists** (bool). Production: 9 employees, 8 with auth, **2 paypro users** |
| Payroll nav gate | **Half-built.** `Layout.jsx:244` already branches on `employee?.paypro_user === true` |
| AutoPRO stopgap payroll | `Payroll.jsx` (666 ln) + 5 components (2,138 ln) |
| GL mapping logic | Mature, in `MarkPaidModal.jsx` — 5008/5009 wages, 2054 tax, 2052 CPP, 2053 EI, 5006/5007 employer |
| `_shared/resend.ts` | `sendViaResend` (no logging) and `logAndSendEmail` (logs to `SentEmailLog`) |
| `pg_cron` + `pg_net` | Enabled; precedent migration exists, secret in Vault as `autopro_cron_secret` |
| jsPDF in edge functions | 5 `autopro-generate*PDF` functions already use it |
| Storage | 4 private buckets + public `KADR` bucket (`KADRLogoAddress.jpg`, `KADRLogoOnly.jpg`) |
| Theme tokens | `--primary: 0 0% 9%` light / `0 0% 98%` dark, consumed as `hsl(var(--primary))` |

### 2.3 On the PayPRO side

| Item | Measure |
|---|---|
| Frontend | ~12,500 lines excl. `components/ui` — 11 pages, 44 components |
| Functions | 13 base44-hosted |
| Data-touching files | 27 import `@/entities/all` |
| Auth | base44 SDK (`AuthContext.jsx`, `ProtectedRoute.jsx`, `UserNotRegisteredError.jsx`) |
| Shell | Own `Layout.jsx` — sidebar nav, header, footer, global `<style>` block |

### 2.4 Verified compatibility findings

- **`components/ui` parity is 100%.** Zero UI primitives to port.
- **Zero new npm dependencies.** Only `@base44/sdk` and `@base44/vite-plugin` are absent from AutoPRO, both being removed.
- **`pages.config.js` is hand-maintained now.** `App.jsx` routes via ``path={`/${key}`}`` — a key of `"paypro/Employees"` yields `/paypro/Employees` with **no routing changes required**.
- **4 of 13 PayPRO functions become unnecessary.** `getBankAccounts`, `getSupabaseTimeRecords`, `getSupabasePayPeriods`, `manageSupabaseTimeRecords` exist only because base44 couldn't reach Supabase.
- **`generateAutoPROFile` also dies** — a `.txt` handoff made obsolete by integration.

**Net: 13 base44 functions → 8 `paypro-*` functions.**

---

## 3) Risk Assessment

| # | Risk | Impact | Likelihood | Mitigation |
|---|---|---|---|---|
| ~~R1~~ | ~~CSV import double-encodes jsonb arrays~~ | — | **ELIMINATED** | Audited 2026-08-17: all 5 columns `array` on 100% of rows. **Re-verify at the Phase 11 final import** — this is a property of the import, not of the schema |
| ~~R2~~ | ~~Child records orphaned by regenerated ids~~ | — | **ELIMINATED** | **0 orphans on all 6 checks** as of 2026-08-17 (C2 fixed by user). Ids preserved verbatim. Re-verify at final import |
| **R21** | **Parallel-run divergence goes unnoticed.** Phase 8.5 runs both systems side by side for up to a month; a systematic discrepancy could be mistaken for a one-off | **High** — the entire point of the parallel run is to catch exactly this, so missing it defeats the exercise | Medium | Phase 8.5 defines explicit exit criteria and a per-stub 8-field comparison rather than eyeballing. Any mismatch is triaged before the clock resets |
| **R17** | **Stale snapshot at cutover.** Base44 PayPRO stays live; every payroll run between now and Phase 11 is invisible to the imported tables | **Critical** — silently missing paystubs, wrong YTD, wrong T4s | **Certain** — this *will* happen, it's a question of volume | Phase 11 performs a **full re-import, never a delta merge**, with the complete §2.1 audit re-run against it. Development proceeds against the current snapshot as structurally representative but numerically provisional |
| R18 | Plaintext `workpro_api_key` in `PayPro_PayrollSetting` | **Low** — **downgraded.** Confirmed superseded ~3 months ago; not a live credential | Present today, removal already planned | Row deleted before go-live (C3). No Vault migration needed. Still worth not granting it a read policy in the interim |
| R3 | **CRA tax math drifts during the port** (`TaxCalculator.jsx`, `PaychequeForm.jsx`) | **Critical** — incorrect statutory withholding; CRA exposure | Low-Med | Port `TaxCalculator.jsx` **byte-identical**. Phase 5 gate: recompute ≥20 of the 112 imported paystubs, requiring exact match on all 8 fields. All stubs are 2026 and the 2026 constants are loaded, so this is fully exercisable |
| R4 | **RLS enabled with zero policies** silently blocks everything with no error | High — module appears empty, no error anywhere | **CONFIRMED LIVE** on all 10 tables today | Phase 1 workstream B. Assert `pg_policies` ≥ 3 per table before Phase 2 |
| **R19** | **CPP2 columns mis-typed because CPP2 has never fired.** `cpp2_deduction` is `bigint`, `ytd_cpp2` is `text` | **High** — the first employee crossing YMPE throws `22P02` or silently stringifies, corrupting a live paycheque | **Certain eventually** — CPP2 is active CRA policy above ~$71,300 | Phase 1 workstream A retypes both to `double precision`. This is the sharpest instance of the type-inference class |
| **R20** | **`EmployeeDeduction.amount` is `bigint` but stores both dollars and percentages** — the live Garnishment row is `30`, meaning 30% | **High** — a 2.5% or $12.50 deduction is impossible; attempting one fails or silently rounds | High — any new deduction could need a fraction | Retype to `numeric` in workstream A |
| R5 | **GL posting from PayPRO is unbalanced or double-posts** | **Critical** — corrupts the general ledger | Medium | Port `MarkPaidModal`'s balance check unchanged. Keep the sequential write loop. Phase 6/7 verifies `SUM(debit) = SUM(credit)` per batch on dev before production |
| R6 | Money-moving payroll writes bypass the Fiscal Period gate | High | Was certain — gap exists in AutoPRO today | **Resolved by decision.** Gate added in Phase 6/7. Behaviour change: a payroll run dated into a closed period starts being rejected |
| R7 | **Test email/paystub sent to a real employee from dev** | High | Medium | Phase 6 adds a recipient allowlist guard to `paypro-emailPaystubs`, allowlist-only on dev |
| R8 | Base44-hosted logo breaks at sunset | Medium | **Certain** if unaddressed | Resolved by O1. Three references repointed in Phase 8 |
| R9 | **Employee-file migration loses documents or exposes them.** All 27 rows point at base44 URLs | High — HR documents lost or publicly reachable | Medium | Private `kadr-employee-files` bucket, service-role signed URLs only, mirroring `kadr-issue-report-attachments`. **27 files, known volume** |
| R10 | **`employee_id` carries three meanings.** Business key on `PayPro_Employee`/`PayPro_PayStub`; system id behind `*_id_ref`; system id on `PayPro_EmployeeFile.employee_id` despite its name | High — joins silently return nothing | High — easy to "tidy up" | Preserved per requirement #4. §7 lesson 1; commented at every join. `employee_db_id` is additive and never participates |
| R11 | Missing client-generated id → Postgres `23502` | Medium | Low | The shim generates ids centrally |
| R12 | **Dev/prod drift** | High — feature dead on production at cutover | **High** — 5 confirmed failure modes in §3, incl. 4 RPCs missing from prod at go-live. **Already true today: dev has zero PayPro tables** | Phase 1 workstream D replicates prod→dev. Phase 11 runs a table + RPC + edge-function inventory **diff**. All counterpart migrations idempotent |
| R13 | Cron fires on both branches → duplicate emails | Low | Medium | Dev-first; dev job dropped when promoting. URL literal rewritten per project |
| R14 | **PayPRO's global `<style>` block leaks into AutoPRO** | **High** — sets `--primary` as raw hex against HSL-triplet tokens, breaking `hsl(var(--primary))` app-wide; `!important` checkboxes invisible in dark mode | **Certain** if ported blindly | **Discarded entirely** in Phase 2 — analysis in that phase shows zero light-mode visual loss |
| R15 | **UI regression from dark-mode retrofit** | Medium | **Certain** if unaddressed | Every ported file pairs `bg-*`/`text-*`/`border-*` with `dark:`. 11 pages carry hardcoded `bg-slate-50 min-h-screen` wrappers |
| R16 | Scope creep from "complete replication" | Medium | Medium | Phased by page group; each phase independently verifiable |

---

## 4) Time Estimate

| Phase | Scope | Estimate |
|---|---|---|
| 1 | Type fixes + RLS + `employee_db_id` + prod→dev replication | 1–1.5 days *(reduced — tables already exist and are verified sound)* |
| 2 | Module scaffolding, auth swap, Layout disposition, nav | 1 day |
| 3 | Employees, Setup, Pay Types, Employee Files (27 to migrate) | 1.5 days |
| 4 | Time Records | 1 day |
| 5 | Payroll calculation & paycheque creation | **2 days** *(highest business-logic risk)* |
| 6 | Pay Stubs, PDFs, email, Mark Paid → GL/Bank | **2–2.5 days** *(highest financial risk)* |
| 7 | Remittances + Cancel Payment → GL/Bank | 1.5 days |
| 8 | T4s, Reports, Trends, logo repoint | 1.5 days |
| | **── Engagement 1 subtotal ──** | **~11–13 working days** |
| **8.5** | **PARALLEL RUN — HOLD.** No build work | **Up to ~1 calendar month** *(your time, not build time)* |
| 9 | Remittance reminder cron *(new feature)* | 0.5 day |
| 10 | AutoPRO payroll deprecation | 0.5 day |
| 11 | **Final re-import** + production promotion + base44 sunset | **1.5 days** *(full re-import and re-audit)* |
| | **── Engagement 2 subtotal ──** | **~2.5 working days** |
| | **Total build time** | **~13.5–15.5 working days** *(excluding the hold)* |

Phases 3, 4 and 8 are largely independent and could overlap. Phases 5→6→7 are strictly sequential.

**The hold is calendar time, not build time.** Engagement 2 is short — under three days of work — so the schedule is dominated by how long you want the parallel run to prove itself.

---

## 5) Roadmap & Progress

```
        ┌─────────────────────────────┐
        │ P1  Types + RLS + prod→dev  │  ◄── BLOCKS EVERYTHING
        └──────────────┬──────────────┘
                       ▼
        ┌─────────────────────────────┐
        │ P2  Scaffold + Auth + Nav   │
        └──────────────┬──────────────┘
                       ▼
     ┌─────────────────┼─────────────────┐
     ▼                 ▼                 ▼
┌─────────┐      ┌───────────┐    ┌────────────┐
│P3 Empl. │      │P4 Time    │    │P8 T4/Rpt/  │
│  Setup  │      │  Records  │    │  Trends*   │
└────┬────┘      └─────┬─────┘    └────────────┘
     └────────┬────────┘           *needs P6 data
              ▼
      ┌───────────────┐
      │P5 Payroll calc│
      └───────┬───────┘
              ▼
      ┌───────────────┐      ┌──────────────┐
      │P6 Pay Stubs   │─────►│P7 Remittances│
      │   → GL/Bank   │      │   → GL/Bank  │
      └───────────────┘      └──────┬───────┘
                                    ▼
        ╔═══════════════════════════════════════════════════╗
        ║  P8.5  PARALLEL RUN — HOLD  (up to ~1 month)      ║
        ║  ───────────────────────────────────────────────  ║
        ║  Enter every paystub in BOTH base44 and AutoPRO.  ║
        ║  Compare. Do not proceed until exit criteria met. ║
        ║                                                   ║
        ║  ⚠ Runs on DEV ONLY. Prod GL must not be touched. ║
        ╚═══════════════════════════╤═══════════════════════╝
                                    ▼
                            ┌──────────────┐
                            │P9 Cron       │
                            └──────┬───────┘
                                   ▼
                            ┌──────────────┐
                            │P10 Deprecate │
                            └──────┬───────┘
                                   ▼
                     ┌────────────────────────────┐
                     │P11 RE-IMPORT + prod + 44   │
                     │    (snapshot is stale by   │
                     │     now — full refresh)    │
                     └────────────────────────────┘
```

**Delivery is split into two engagements.** Phases 1–8 are built and shipped to dev, then work **stops** for the Phase 8.5 parallel run. Phases 9–11 begin only once that run passes its exit criteria.

---

### Phase 1 — Type Corrections, RLS, `employee_db_id` & Dev Replication  `[Tested]` — complete 2026-08-18

**TL;DR** — The ten tables exist and are structurally sound. Fix 15 mis-inferred column types, add the RLS policies they're missing entirely, add `employee_db_id`, secure the plaintext credential, and replicate everything to dev.

**Impacted**
- Migrations applied — prod (`hbcrwkmgsazqrvsrmxyr`): `20260818043218_paypro_type_corrections.sql`, `20260818043559_paypro_employee_db_id.sql`, `20260818043744_paypro_is_paypro_user_function.sql`, `20260818043826_paypro_rls_policies.sql`, `20260818043832_paypro_delete_dead_api_key.sql`
- Migrations applied — dev (`sitihbdnuxifwibontcm`): `20260818044332_paypro_schema_dev.sql`, `20260818044340_paypro_is_paypro_user_function.sql`, `20260818044344_paypro_rls_policies.sql`
- New DB function: `public.is_paypro_user()` (`SECURITY DEFINER`) — on both projects
- Modified: `PayPeriods` (S4, both projects), `master_context.md` (§4 `paypro-*` carve-out — S1, §4.11 `is_paypro_user()` entry)
- Full execution record, verification results, and deviations: `phase_1_implementation_plan.md`

#### Workstream A — Column type corrections

CSV type inference produced 15 wrong types (13 on `PayPro_*` tables + 2 on `PayPeriods`). Every one is safe to widen (no data loss — all current values fit the target type).

| Table | Column | Now | → | Why |
|---|---|---|---|---|
| `PayPro_PayStub` | `cpp2_deduction` | `bigint` | `double precision` | **R19** — all-zero data inferred integer |
| `PayPro_PayStub` | `ytd_cpp2` | `text` | `double precision` | **R19** — all-blank data inferred text. Every other `ytd_*` is already `double precision` |
| `PayPro_EmployeeDeduction` | `amount` | `bigint` | `numeric` | **R20** — stores dollars *and* percentages |
| `PayPro_EmployeeDeduction` | `gl_account` | `bigint` | `text` | §3: GL-account columns storing a *selected* account are text project-wide. As bigint it hits the documented Radix `<Select>` blank-trigger trap |
| `PayPro_Employee` | `federal_td1_basic` | `bigint` | `numeric` | TD1 amounts can carry cents |
| `PayPro_Employee` | `provincial_td1_basic` | `bigint` | `numeric` | ” |
| `PayPro_Employee` | `advance_balance` | `bigint` | `numeric` | Money |
| `PayPro_TaxYearConstant` | `ei_max_insurable_earnings` | `bigint` | `numeric` | CRA constants can carry cents |
| `PayPro_TaxYearConstant` | `cpp_max_pensionable_earnings` | `bigint` | `numeric` | ” |
| `PayPro_TaxYearConstant` | `cpp_basic_exemption`, `federal_basic_personal_amount`, `provincial_basic_personal_amount`, `cpp2_max_pensionable_earnings` | `bigint` | `numeric` | ” |
| `PayPeriods` | `total_pto_hours` | `bigint` | `double precision` | **S4** — fractional PTO hours |
| `PayPeriods` | `total_stat_hours` | `bigint` | `double precision` | **S4** — fractional stat hours |

`year` columns stay `bigint` — correct as integers. Date columns stay `text`, matching this project's other legacy tables; §3's rule then applies: **cast directly to `::DATE`, never through a timezone**, which would shift the date back a day.

Per §3, PostgREST serialises `numeric` as a genuine JSON number, so widening carries **no frontend regression risk** — confirmed previously on this project via a raw REST call.

#### Workstream B — RLS policies

All ten tables currently have **RLS on and zero policies**, silently returning nothing. Each gets three policies — the 2026-08-16 convention plus one payroll-specific gate:

```
1. PERMISSIVE  FOR ALL TO authenticated  USING (true)
2. RESTRICTIVE FOR ALL TO authenticated  USING (public.staff_strong_auth())   -- AAL2/passkey
3. RESTRICTIVE FOR ALL TO authenticated  USING (public.is_paypro_user())      -- NEW
```

Restrictive policies AND together: a session needs **AAL2 *and* `paypro_user`** to read a single row. This makes the nav gate in requirement #5 cosmetic rather than load-bearing — a non-payroll user who hand-types `/paypro/Employees` gets an empty page, not data.

`is_paypro_user()` is `SECURITY DEFINER` reading `Employee.paypro_user` for `auth.uid()` — it must be, since `Employee`'s own broad read policy is itself gated, which would otherwise recurse.

**`PayPro_PayrollSetting` needs care (R18).** It holds `workpro_api_key` in plaintext alongside the benign `period_close_date`. The key moves to Vault / a function secret and the row is removed; the table then gets the standard three policies like the rest. It must not receive a read policy while that row is still present.

#### Workstream C — `employee_db_id` + UNIQUE  *(approved for immediate prod application)*

```sql
ALTER TABLE "PayPro_Employee" ADD COLUMN IF NOT EXISTS employee_db_id text;
ALTER TABLE "PayPro_Employee" ADD CONSTRAINT paypro_employee_employee_id_unique UNIQUE (employee_id);
```

Nullable `text` holding the stringified `Employee.id`. Kept `text` rather than `bigint` to avoid §3's Radix strict-equality trap. It participates in **no** existing join — `employee_id` remains the join key throughout the ported code.

Backfill populates the **7 matched** employees; the **4 unmatched** (EMP004, EMP006, EMP007, EMP010) stay null pending your decision on whether they need `Employee` rows created.

The UNIQUE constraint is safe — 11 rows, 11 distinct values, 0 nulls today — and protects the paystub join going forward.

#### Workstream D — Replicate prod → dev

Dev has **zero** `PayPro_*` tables. Since the prod copy is itself a snapshot, dev is built from the same corrected schema plus a data copy, giving a genuine development environment.

**Real SINs and DOBs do not go to dev** — per the standing decision, `sin` and `date_of_birth` are scrambled on the dev copy. All 11 employees currently have `sin` populated, so this scrambling is not optional.

Every migration is idempotent (`ADD COLUMN IF NOT EXISTS`, `DROP POLICY IF EXISTS` before every `CREATE POLICY`) — §3 records this exact requirement breaking the PR preview check twice. Any file backfilled after an `apply_migration` must carry the version Supabase actually assigned, retrieved via `list_migrations`.

---

### Phase 2 — Module Scaffolding, Auth Swap, Layout Disposition & Navigation  `[Tested]` — complete 2026-08-18

Full execution detail, deviations, and learnings: `phase_2_implementation_plan.md`.

**TL;DR** — Stand up `/paypro/*` routing, delete PayPRO's base44 auth and its entire Layout, build the entity shim, and wire the Payroll nav dropdown + More modal.

**Impacted**
- New: `src/pages/paypro/` (10 pages), `src/components/paypro/` (44 components), `src/components/paypro/lib/payrollEntities.js` *(the shim)*
- New: `src/components/paypro/PayrollMoreModal.jsx`
- Modified: `src/pages.config.js`, `src/Layout.jsx`
- **Deleted:** PayPRO's `Layout.jsx`, `AuthContext.jsx`, `ProtectedRoute.jsx`, `UserNotRegisteredError.jsx`, `api/base44Client.js`, `api/entities.js`, `api/integrations.js`, `app-params.js`, `NavigationTracker.jsx`, `PageNotFound.jsx`, `VisualEditAgent.jsx`, `Home.jsx`

#### PayPRO's `Layout.jsx` — disposition of all seven responsibilities

**AutoPRO's `Layout.jsx` becomes the single shell for the entire app, `/paypro/*` included.** Ported pages render as plain children inside it, exactly like every existing AutoPRO page. Nothing wraps, nothing nests.

| # | PayPRO Layout responsibility | Disposition |
|---|---|---|
| 1 | `SidebarProvider` + `Sidebar` shell | **Discarded.** AutoPRO uses a top nav |
| 2 | `navigationItems` (8 sidebar links) | **Becomes the Payroll dropdown + More modal** |
| 3 | `otherApps` — external AutoPRO/WorkPRO links | **Discarded.** We *are* AutoPRO now |
| 4 | `settingsItems` — Setup link | **Moves into the More modal** |
| 5 | `SidebarHeader` — logo + "KADR PayPRO" title | **Discarded.** Takes base44 logo reference B with it |
| 6 | `SidebarFooter` — hardcoded "Admin User / Payroll Administrator" | **Discarded.** AutoPRO has a real user dropdown with logout, dark-mode toggle and Report an Issue |
| 7 | **Global `<style>` block** | **Discarded — and this one is load-bearing.** See below |

**Why the `<style>` block must not come along (R14).** It does two things, both actively harmful inside AutoPRO:

```css
:root { --primary: #000000; --secondary: #059669; --accent: #ffffff; --muted: #64748b; }
[data-state="checked"]   { background-color: #1f2937 !important; border-color: #1f2937 !important; }
[data-state="unchecked"] { background-color: white   !important; border-color: #d1d5db !important; }
```

- **The token override would break theming app-wide.** AutoPRO stores tokens as bare HSL triplets (`--primary: 0 0% 9%`) and consumes them as `hsl(var(--primary))`. Redefining `--primary` to a raw hex makes that resolve to `hsl(#000000)` — invalid CSS — on **every** page, not just payroll.
- **The checkbox override is unscoped and `!important`.** It targets `[data-state="checked"]` globally, restyling every Radix checkbox, switch, toggle and accordion in Work Orders, Inventory and Accounting too. In dark mode it forces dark-gray-on-dark, effectively invisible.

**Cost of discarding it: essentially nothing.** AutoPRO's `--primary` is `0 0% 9%` (#171717) in light mode, and its `Checkbox` already renders `data-[state=checked]:bg-primary`. PayPRO's override painted checked boxes `#1f2937` — a visually near-identical dark tone. Light mode is indistinguishable; dark mode gets *fixed* rather than broken.

**Per-page wrappers.** All 11 PayPRO pages open with `p-6 space-y-6 bg-slate-50 min-h-screen`. These stay (preserving spacing per requirement #3) but gain `dark:` counterparts, and `min-h-screen` is reviewed against AutoPRO's page canvas so the module doesn't double-scroll. Note §3's warning that AutoPRO's light-mode `--background` is a deliberate medium gray-blue, not white.

**In depth — everything else**

*Routing.* `pages.config.js` gains ten nested imports keyed `"paypro/Employees"` etc. `App.jsx` needs **no change**. PayPRO's `createPageUrl` is byte-identical to AutoPRO's, so intra-module links become `createPageUrl('paypro/Employees')`.

*Auth.* PayPRO's `AuthContext` does a base44 public-settings handshake, reads `appParams.token`, and calls `base44.auth.me()`. All deleted. Pages consume AutoPRO's existing `useAuth()` and the resolved `Employee` object. Per §4.11, **a missing `Employee` row for a valid session is an expected state** — every ported page must degrade gracefully.

*Entity layer — the shim.* One module implementing base44's six verbs over `supabase.from()`, centralising:

| Centralised in the shim | Why it matters |
|---|---|
| 24-hex id generation on insert | §3: no DB default exists; forgetting throws `23502` |
| `created_date`/`created_by`/`created_by_id` on insert | §3's standard audit trio |
| `updated_date` on update | Most legacy tables have **no** `updated_by` — don't assume symmetry |
| Entity-name → table-name mapping | `PayStub` → `PayPro_PayStub`, so call sites keep their original names |
| Sort-string translation | `'-created_date'` → `.order('created_date', { ascending: false })` |
| Paginated `fetchAllRows` | §3's PostgREST 10k row cap |
| jsonb passthrough | **Real arrays, never `JSON.stringify()`'d** |

Call sites change their import path (`@/entities/all` → `@/components/paypro/lib/payrollEntities`) and nothing else.

*Navigation.* The existing Payroll nav item becomes a dropdown, rendered only when `employee?.paypro_user === true`:

```
Payroll ▾
├── Employees        → /paypro/Employees
├── Time Records     → /paypro/TimeRecords
├── Payroll          → /paypro/Payroll
├── Pay Stubs        → /paypro/PayStubs
└── More…            → opens PayrollMoreModal
                        ├── Remittances  ├── T4s  ├── Reports
                        ├── Trends       └── Setup
```

`handlePayrollClick`'s existing non-paypro-user redirect to WorkPRO is preserved. The More modal follows `ReportModal.jsx`'s action-dispatch pattern. `activePaths` extends to `/paypro/*`.

---

### Phase 3 — Employees, Setup, Pay Types & Employee Files  `[Pending]`

**TL;DR** — Port the employee record (5 tabs), the Setup page, the pay-type manager, and move all 27 employee files off base44 onto a private Supabase bucket.

**Impacted**
- Pages: `paypro/Employees`, `paypro/EditEmployee`, `paypro/Setup`
- Components: `employees/EmployeeList`, `employees/tabs/{General,Pay,Deductions,Training,Other}Tab`, `employees/tabs/{TrainingModal,EmployeeFileModal}`, `paytypes/ValidPayTypeManagerModal`, `setup/ConstantEditor`
- New edge functions: `paypro-uploadEmployeeFile`, `paypro-viewEmployeeFile`
- New Storage bucket: `kadr-employee-files` (private)

**In depth**

Five tabs → five tables: General → `PayPro_Employee`, Pay → `PayPro_EmployeePayType` + `PayPro_ValidPayType`, Deductions → `PayPro_EmployeeDeduction` + `PayPro_TaxYearConstant`, Training → `PayPro_TrainingRecord`, Other → `PayPro_Employee.notes` + `PayPro_EmployeeFile`. Setup edits `PayPro_TaxYearConstant` (including the two jsonb bracket arrays) and `PayPro_PayrollSetting`.

*Employee files — 27 to migrate, all currently on base44 URLs.* Replaced by a **private** `kadr-employee-files` bucket (PDF-only, size-capped client- and bucket-side), with `paypro-viewEmployeeFile` minting short-lived signed URLs **server-side via the service-role client**. These are HR documents — the `kadr-issue-report-attachments` pattern is the template, including its rule that a client-provided URL is never trusted or forwarded. `PayPro_EmployeeFile.file_url` is repointed as files land.

Note the files must be re-fetched at the Phase 11 final import too if any are added in base44 meanwhile (R17).

*SIN handling.* Per decision: single table, `paypro_user` RLS gate, no masking and no read audit. `GeneralTab.jsx:92` renders it as a plain input, unchanged. All 11 employees have a SIN populated.

*Setup gains a real write path for `PayPro_TaxYearConstant`* — worth noting only one row (2026) exists, so adding 2027 will be the first genuine exercise of `ConstantEditor`'s create path.

---

### Phase 4 — Time Records  `[Pending]`

**TL;DR** — Port the Time Records page to query WorkPRO's `TimeRecord` and `PayPeriods` natively, deleting three base44 functions outright.

**Impacted**
- Page: `paypro/TimeRecords`
- Components: `timerecords/{TimeRecordsList,AddTimeRecordModal,EditTimeRecordModal,LockPeriodModal,PrevPayPeriodsModal,TimeReportModal,ValidationNotices}`
- New edge function: `paypro-generateTimeReport`
- **Deleted:** `getSupabaseTimeRecords`, `manageSupabaseTimeRecords`, `getSupabasePayPeriods`

**In depth**

These three were pure service-key proxies — base44 couldn't reach Supabase, so every read and write tunnelled through an edge function. Inside AutoPRO the frontend hits `supabase.from('TimeRecord')` directly under the caller's own RLS: simpler *and* more secure (service-key access replaced by user-scoped access).

Two behaviours preserved exactly: the `-06:00` timezone offset on `clock_in_time` range filters, and the period-lock transaction — flip matching `TimeRecord.status` to `'locked'`, then write a `PayPeriods` summary row. Per §4.10, `TimeRecord` has no working DB defaults for `id` or audit fields, so every write sets them explicitly.

`PayPeriods.total_pto_hours` / `total_stat_hours` widen from `bigint` in Phase 1 (S4) — this phase makes them writable and thus makes that latent §3 bug reachable.

---

### Phase 5 — Payroll Calculation & Paycheque Creation  `[Pending]`

**TL;DR** — Port the payroll engine. **Highest business-logic risk in the project.**

**Impacted**
- Page: `paypro/Payroll`
- Components: `payroll/{PaychequeForm,TaxCalculator,TimeDataProcessor,BatchPaychequeProcessor,PaychequeCreator,PaychequeNumberGenerator}`

**In depth**

`TaxCalculator.jsx` (213 ln) implements federal/provincial brackets, CPP, CPP2, EI and the basic exemption, driven by `PayPro_TaxYearConstant`. It has **zero** base44 imports — pure computation. **Ported byte-identical. No refactor, no cleanup, no "while I'm here."** The single highest-consequence file in the merge.

**The CPP2 blind spot — and why the parallel run won't close it either.** CPP2 has never fired in the imported data (0 non-zero rows), which is *why* its two columns mis-typed (R19). Checking whether it *will* fire:

| Employee | YTD gross (15–17 stubs, to 2026-08-14) | Annualised | CPP2 floor |
|---|---|---|---|
| Ryley Bates | $44,882.99 | ~$71k | **$74,600** |
| Elisa Haney | $39,088.82 | ~$62k | $74,600 |
| *(everyone else)* | ≤ $22,192 | — | $74,600 |

**Nobody crosses the CPP2 floor in 2026.** The highest earner lands roughly $3k short, annualised. So CPP2 is unexercised by the historical data **and** will stay unexercised through the Phase 8.5 parallel run — it cannot be validated by comparison at all.

**Mitigation: a deliberate synthetic test in Phase 5.** Fabricate a dev-only employee with gross earnings above $74,600 and run the same stub through both base44 and the ported engine, comparing `cpp2_deduction` and `ytd_cpp2`. Without this, CPP2 ships on the strength of the byte-identical port alone and won't be exercised for real until an employee's pay grows past the ceiling — plausibly 2027 or later, long after anyone remembers this was never tested.

`PaychequeForm.jsx` (649 ln) pulls pay types and deductions, applies `TaxCalculator`, builds the two jsonb arrays, computes YTD rollforwards. Three base44 imports to reroute.

`TimeDataProcessor.jsx` matches WorkPRO time records to PayPRO employees; the `getSupabaseTimeRecords` call becomes a native query. Its guard that **blocks import entirely when any record in the period has `status === 'error'`** is preserved verbatim.

`PaychequeNumberGenerator.jsx` derives the next `YYYYMM-XXX` by scanning existing paystubs — a max-scan, not a stored counter (the opposite of `SystemSettings.next_ro_number`, which §3 records as having drifted and collided). Self-correcting and worth keeping, but it needs the shim's paginated fetch so the table can't truncate at the row cap and hand back a duplicate.

**Phase gate:** ≥20 of the 112 imported paystubs recomputed through the ported engine must match base44's stored values *exactly* on gross, federal, provincial, CPP, CPP2, EI, total deductions and net. All stubs are 2026 and the 2026 constants are loaded, so this is fully exercisable today. Any mismatch stops the phase.

---

### Phase 6 — Pay Stubs, PDFs, Email & Mark Paid → GL/Bank  `[Pending]`

**TL;DR** — Port the pay stub lifecycle and replace the `.txt`-export handoff with direct `GLTransaction` + `BankTransaction` posting. **Highest financial risk in the project.**

**Impacted**
- Page: `paypro/PayStubs`
- Components: `paystubs/{EditPayStub,CancelPaychequeModal,CancelPaymentModal,DeletePayStub,BatchPaymentModal,EmailPaystubsModal}`, `payroll/PayStubPDF`
- New edge functions: `paypro-generatePayStubPDF`, `paypro-generatePayStubPDFEmployer`, `paypro-emailPaystubs`
- **Deleted:** `exportPaystubs`, `generateAutoPROFile`, `getBankAccounts`

**In depth**

*The core change.* Today `BatchPaymentModal` calls `exportPaystubs`, which writes `PayrollTransaction` rows; a human then opens AutoPRO's `MarkPaidModal` to post the GL. **That two-step handoff collapses into one.** `BatchPaymentModal` posts directly, using `MarkPaidModal`'s mapping ported unchanged:

```
Per paystub:
  DR  5008 Wages  (or 5009 if Bus Driver)              gross_pay
      CR  2054 Income Tax Payable                       federal + provincial
      CR  2052 CPP Payable                              cpp + cpp2
      CR  2053 EI Payable                               ei
      CR  <bank>                                        net_pay   → + BankTransaction

Employer side:
  DR  5006 CPP Expense    CR 2052 CPP Payable
  DR  5007 EI Expense     CR 2053 EI Payable  (× 1.4)
```

Three properties preserved deliberately: the **client-side debit/credit balance check before any write**; the **deliberately sequential, not parallelised** per-transaction loop; and the **single bulk `GLTransaction` insert after** the loop, followed by one `autopro-calculateBankBalances`. `getBankAccounts` is deleted — the frontend reads `BankAccount` natively.

*Bus Driver flag — derived (O3).* `is_bus_driver_wages` defaults from `PayPro_Employee.employee_type === 'Bus Driver'` rather than requiring a per-stub tick. The checkbox remains and stays overridable. **EMP004 (Cheryl Lawrence) is the live test case** — the only Bus Driver in the data.

*Fiscal Period gate — approved, new behaviour (Q8).* `checkFiscalPeriodStatus()` runs **before any write**, gated on pay date, rejecting if the covering `FiscalPeriod` is closed or absent. This closes a gap that exists in AutoPRO today.

Two notes from §3's record of how this gate has failed before: it depends entirely on `FiscalPeriod` being *readable* (it silently fails closed with zero RLS policies — a real app-wide incident), and a gate wired only to a manual-input handler is bypassed by a programmatically-populated date. So the check runs at actual save time against the resolved pay date, not on a field handler.

*Email.* `paypro-emailPaystubs` imports **`sendViaResend`, not `logAndSendEmail`** — satisfying requirement #10 with zero new plumbing. Per R7 it also gets a recipient allowlist guard, allowlist-only on dev.

*PDFs.* Straight jsPDF ports. §3: PDF functions are the one deliberate exception to the `200 OK {error}` convention — raw bytes on success, `{error}` only on failure.

---

### Phase 7 — Remittances & Cancel Payment  `[Pending]`

**TL;DR** — Port remittance generation and history, with Mark Paid and Cancel Payment posting to GL and Bank.

**Impacted**
- Page: `paypro/Remittances`
- Components: `remittances/{RemittanceDialog,RemittanceHistory,ClosePeriodModal,RemittanceReportPDF}`
- New edge function: `paypro-postRemittanceGL`
- **Deleted:** `exportRemittance`

**In depth**

`RemittanceDialog` aggregates unremitted paystubs into a `PayPro_Remittance` row (totals + `pay_stub_ids`), replacing the old `PayrollTransaction`-insert path with direct GL/Bank posting. Mark Paid debits the three payable accounts (2054/2052/2053) and credits bank, per `MarkPaidModal.jsx:402-435`.

*Cancel Payment — complete reversal (O2).* Every entry Mark Paid produced is posted back inverted: each debit becomes a credit and each credit a debit, plus a reversing `BankTransaction`, followed by one `autopro-calculateBankBalances`. Nothing is deleted — the originals stay for audit and the reversal stands alongside them, consistent with how this codebase treats corrections everywhere else. `is_paid` flips back to false.

The Fiscal Period gate applies here too — a reversal dated into a closed period is exactly the case the gate exists to catch.

`ClosePeriodModal` writes `PayPro_PayrollSetting.period_close_date` (currently `2026-07-31`).

---

### Phase 8 — T4s, Reports, Trends & Logo Repoint  `[Pending]`

**TL;DR** — Port the reporting surface and remove the last base44-hosted asset dependency.

**Impacted**
- Pages: `paypro/T4s`, `paypro/Reports`, `paypro/Trends`
- Components: `t4/{T4_PDF,T4A_PDF}`, `reports/{PaychequesReport,RemittancesReport}`, `trends/{TrendsDataProcessor,PayrollTrendChart,LaborCostBarChart,YearOverYearComparison}`

**In depth**

All read-only aggregation over `PayPro_PayStub` / `PayPro_Remittance` / `PayPro_Employee` / `PayPro_TaxYearConstant`. `T4_PDF` reads `sin` (the only consumer besides the General tab). T4s and the CRA XML export are the compliance-critical piece; box mappings port unchanged.

**Note on T4 scope:** PayPRO's data starts 2026-01-09, and only the 2026 `TaxYearConstant` row exists. T4s are therefore exercisable for 2026 only — the first real T4 season lands Feb 2027. Prior-year T4s have neither stubs nor constants.

*Logo repoint (O1/R8).* No upload needed — the asset already exists. Exactly **three** references change:

```
PayStubPDF.jsx:117          ┐
PaychequesReport.jsx:539    ├──►  https://hbcrwkmgsazqrvsrmxyr.supabase.co
RemittancesReport.jsx:259   ┘     /storage/v1/object/public/KADR/KADRLogoAddress.jpg
```

Sourced as the development branch already does — the production project literal on every branch, matching `StatementModal`, `WorkOrderReport`, `ReconcileReport` and `autopro-generateWorkOrderPdf`. The fourth reference (PayPRO `Layout.jsx:126`) disappears with that file in Phase 2.

**Phase gate:** `grep -r "qtrypzzcjebvfcihiynt" src/` returns zero.

Per §3, any new print/paper-preview path must use a separate `window.open()` document or an explicit `@media print` colour reset.

---

### Phase 8.5 — Parallel Run (HOLD)  `[Pending]`

**TL;DR** — Build stops here. For up to a month, every paystub is entered in **both** base44 PayPRO and the new AutoPRO module, and the outputs compared. Phases 9–11 do not begin until the exit criteria below are met.

**No code is written in this phase.** It is a validation gate, not a build step.

#### Where it runs — dev only, and this is not negotiable

The parallel run happens at **`test.kensauto.ca` against the dev Supabase project**. Phase 6/7 Mark Paid writes real `GLTransaction` and `BankTransaction` rows — on production those are the **live general ledger**, carrying real shop traffic since 2026-08-15. A month of test paystubs posted there would corrupt the books.

Dev is the correct venue for a second reason: per §3, **`GLTransaction` is the one table not production-copied on dev** — it starts effectively clean, so parallel-run postings are trivially separable from real accounting.

#### Prerequisites — confirm before day 1

| Prerequisite | Status today | Action |
|---|---|---|
| Dev has the `PayPro_*` tables | **Absent** — dev has zero | Phase 1 workstream D |
| A dev tester with `paypro_user = true` | **Only 1** on dev (prod has 2) | Confirm this is the intended tester, or set the flag on a second dev `Employee` row |
| That tester has AAL2 on **dev** | Unverified | Dev auth is a separate `auth.users` — a prod passkey does not work here. `scripts/enroll-dev-totp.mjs` enrolls a factor; `/dev-login` completes the TOTP challenge |
| Email allowlist armed | Phase 6 | **Must stay armed for the entire run**, not just during Phase 6 testing — dev holds real employee addresses, and a month of testing is a month of chances to send a duplicate paystub to a real person |
| Open fiscal periods covering test pay dates | Unverified on dev | The Phase 6 gate will reject a pay date in a closed or absent period — correct behaviour, but confirm up front so it isn't mistaken for a bug |

#### What gets compared

Not eyeballed — measured. For every paystub entered in both systems:

```
8-field comparison, per stub:
  gross_pay · federal_tax · provincial_tax · cpp_deduction
  cpp2_deduction · ei_deduction · total_deductions · net_pay

Plus, per pay run:
  · paycheque_number sequence matches
  · income_breakdown line-for-line
  · additional_deductions line-for-line
  · YTD rollforwards after each run
  · Remittance totals vs sum of constituent stubs
  · GL: SUM(debit) = SUM(credit), 5008/5009 split correct
```

#### Exit criteria — all must hold

1. **At least two full pay cycles** completed in both systems with **zero unexplained discrepancies** across all 8 fields.
2. **At least one remittance** generated, marked paid and reconciled in AutoPRO, balancing against base44's figure.
3. **At least one Cancel Payment** exercised end to end, with the reversal verified as an exact inverse.
4. **Any discrepancy found is fixed and the clock resets** — a fix mid-run does not carry forward the pre-fix cycles as evidence.
5. **A Bus Driver stub** (EMP004) processed, confirming the 5009 split.
6. **No paystub email reached a real employee** during the entire run.

> **CPP2 will not be validated by this run.** No employee crosses the $74,600 floor in 2026 (highest annualises to ~$71k), so the comparison cannot exercise it. Its only test is the synthetic stub in Phase 5 — do not treat a clean parallel run as evidence CPP2 works.

#### What happens to the parallel-run data

**All of it is destroyed at Phase 11, by design.** That phase truncates and re-imports fresh from base44 (R17), so every test paystub, remittance and GL posting made during this hold disappears. That is the intent — base44 remains the system of record throughout, and the parallel run is a comparison exercise, not a data-entry head start. Nothing entered here needs preserving.

#### Why Phases 9–11 are correctly deferred past this

Deferring the cron (Phase 9) is the right call rather than an accident of sequencing: a live reminder job during the parallel month would evaluate AutoPRO's incomplete remittance data and fire false alarms on the 10th. It belongs after the run, not during.

---

### Phase 9 — Monthly Remittance Reminder Cron  `[Pending]`

**TL;DR** — New feature: on the 10th of each month, check whether a remittance was created in the last 10 days; if not, email `tyler@kensauto.ca`.

**Impacted**
- New edge function: `paypro-checkMonthlyRemittance` (`verify_jwt: false`)
- New migration: `*_schedule_paypro_remittance_reminder_cron.sql`
- Vault: reuses `autopro_cron_secret`

**In depth**

Follows the `20260814000000_schedule_appointment_reminder_cron_jobs.sql` precedent exactly. Schedule `0 15 10 * *` (8:00 AM MST on the 10th, matching the existing jobs' fixed −7h non-DST-aware offset).

```
cron (10th, 08:00 MST)
   └─► net.http_post ── x-cron-secret from vault.decrypted_secrets ──►  paypro-checkMonthlyRemittance
                                                                              │
                                        ┌─────────────────────────────────────┴────────────┐
                                        ▼                                                  ▼
                          Remittance in last 10 days?                        none found
                             → log + exit, no email                → sendViaResend → tyler@kensauto.ca
                                                                     (NOT logged to SentEmailLog)
```

Three §3 rules apply: the secret is read from Vault and **never inlined in the migration SQL**; `verify_jwt: false` is required because `pg_net` carries no user session; and **the `net.http_post` URL is a project-specific literal** that must be rewritten when promoting dev → prod.

Scheduled on **dev first**; the dev job is dropped when promoting in Phase 11. Recipient is internal, so §3's customer-facing allowlist mandate doesn't apply.

Existing remittance cadence (7 remittances, Feb–Aug 2026, roughly monthly) means this will have real data to evaluate immediately.

---

### Phase 10 — AutoPRO Stopgap Payroll Deprecation  `[Pending]`

**TL;DR** — Remove AutoPRO's interim payroll implementation.

**Impacted**
- **Deleted:** `src/pages/Payroll.jsx`, `src/components/payroll/{AddPaychequeModal,AddRemittanceModal,AddAdjustmentModal,MarkPaidModal,PayrollGLAccountCombobox}.jsx`, edge function `autopro-parsePayrollFile`
- Modified: `src/Layout.jsx` (drop the old `/Payroll` route), `pages.config.js`, `master_context.md` §4.8

**In depth**

`autopro-parsePayrollFile` parsed the `.txt` PayPRO export. With `generateAutoPROFile` gone (Phase 6), it has no caller.

`AddAdjustmentModal.jsx` is deleted outright per Q2. Payroll adjustments become manual journal entries on the existing Accounting → Journal Entries page (`autopro-postJournalEntries`), which posts `GLTransaction` rows only. **Three capabilities are consciously given up** — restated so a future reader doesn't mistake them for regressions: no automatic `BankTransaction`, no `employee_reference`, no reversal-on-delete.

**`PayrollTransaction` is deliberately out of scope** (S3). The table and its one production row are left exactly as they are; you will remove them manually. Nothing in this blueprint reads, writes, renames or drops it.

---

### Phase 11 — Final Re-Import, Production Promotion & Base44 Sunset  `[Pending]`

**TL;DR** — Re-import PayPRO's data fresh from base44, promote everything to production, and decommission the base44 app.

**In depth**

**The re-import is the defining task of this phase (R17).** Base44 PayPRO stays live throughout the build, so by the time this phase runs the imported snapshot will be months stale — missing paystubs, remittances, employee edits, new files, and a changed `period_close_date`.

```
STEP 1  Freeze base44 PayPRO  (no further payroll runs there)
STEP 2  Fresh CSV export, all 10 entities
STEP 3  TRUNCATE + full re-import   ← never a delta merge
STEP 4  Re-run the ENTIRE §2.1 audit against the new data:
          · jsonb_typeof = 'array' on all 5 columns, 100% of rows
          · referential integrity, all 6 checks
          · row counts vs base44
          · id preservation
STEP 5  Re-backfill employee_db_id  (roster may have changed)
STEP 6  Re-migrate employee files to kadr-employee-files
```

A full truncate-and-replace is correct rather than crude: the tables are inert staging, ids are stable base44 values, and a delta merge would risk exactly the orphan class the audit exists to catch.

*Everything else.* §3 records **five distinct** schema-replay failure modes, including four RPCs that existed on dev and were missing from production entirely — caught only on go-live day. This phase therefore runs an explicit **three-way inventory diff**: tables + row counts, RPCs (via `pg_proc`, not migration files), and edge functions (via `get_edge_function`, not the repo).

Then: deploy all 8 `paypro-*` functions → create prod's own Vault secret (Vault is per-project) → schedule the cron on prod with prod's URL literal → drop the dev cron job → verify → decommission PayPRO's base44 app.

Standing constraints: edge functions are **not** deployed by a frontend push — they need explicit `deploy_edge_function`. Production DB writes via MCP are gated by Claude Code's own classifier and will need your re-confirmation at the tool prompt. And per your standing rule, `main` is not touched without an explicit ask.

---

## 6) Verification Plan

Per §3, verification happens **only at `test.kensauto.ca`** after commit + push + (for functions) explicit deploy. `localhost` is not viable — it fails on TLS *and* the auth system requires same-origin. Production is never a place to "just check."

| Phase | Proves | Criteria |
|---|---|---|
| **1** | Types corrected, access restored, dev exists | ✅ **Passed 2026-08-18, both projects.** All 15 columns show their target type in `information_schema` · a fractional value writes successfully to `cpp2_deduction`, `EmployeeDeduction.amount` and each retyped column (rolled back probes) · `pg_policies` = 3 per table on all 10 tables (30 total), on both projects · an AAL1 session reads **zero** rows · a `paypro_user: false` AAL2 session reads **zero** rows · a `paypro_user: true` AAL2 session reads real rows *(verified via SQL-level `SET LOCAL ROLE`/`request.jwt.claims` impersonation, not a live browser session — see §7 lesson 34)* · `employee_db_id` populated for the 7 matched employees, null for the 4 unmatched, on both projects · UNIQUE constraint present on `employee_id` · **`workpro_api_key` no longer readable from `PayPro_PayrollSetting`** · **all 10 tables present on dev with matching row counts (11/112/7/3/34/27/4/8/1/1)** · **dev SINs and DOBs scrambled, prod untouched, verified 0 matches** |
| **2** | Module reachable, correctly gated, shell clean | `/paypro/Employees` loads for a paypro user · Payroll dropdown shows 5 entries · More modal opens with 5 options · a non-paypro user sees no dropdown **and** an empty page on a hand-typed URL · all 10 pages render light **and** dark · **no PayPRO `<style>` block anywhere — checkboxes across Work Orders/Inventory/Accounting visually unchanged, payroll checkboxes legible in dark mode** · zero base44 imports under `src/` |
| **3** | Employee record round-trips | Create/edit an employee, all 5 tabs · add a pay type, deduction, training record · **a fractional/percentage deduction saves correctly** (was impossible pre-Phase 1) · upload a PDF and reopen via signed URL · confirm not publicly reachable without a signature · **all 27 migrated files open** · edit a tax constant incl. bracket arrays |
| **4** | Time data flows | Records load for a date range · add/edit/delete · lock a period → statuses flip to `locked` **and** a `PayPeriods` summary row appears with fractional hours intact · time report PDF generates |
| **5** | **The engine is correct** | **≥20 of the 112 imported paystubs recomputed match base44 exactly on all 8 fields** · time import from a real period produces expected hours · the `status === 'error'` guard blocks import · correct sequential `YYYYMM-XXX` numbers · **a synthetic above-$74,600 stub validates CPP2 in both systems — no real employee will reach it in 2026, so this is the only way it gets tested** |
| **6** | **The money is correct** | Mark a batch paid → `SUM(debit) = SUM(credit)` · one `BankTransaction` per stub, correct account and amount · bank balance moves by exactly the net total · **EMP004 (Cheryl Lawrence) pre-selects 5009, a regular employee 5008, override still works** · employee + employer PDFs generate · **a test email from dev reaches only the allowlist, never a real employee** · **nothing appears in `SentEmailLog`** · **a pay date in a closed Fiscal Period is rejected before any write, and a date with no covering period is also rejected** |
| **7** | Remittance ledger is correct | Generate a remittance from unremitted stubs → totals match the sum of constituents · Mark Paid debits 2054/2052/2053 and credits bank, balanced · **Cancel Payment produces an exact inverse set — every original debit has a matching credit and vice versa — plus a reversing `BankTransaction`; originals still present, `is_paid` false, bank balance returns to its pre-payment figure** · a closed-period date is rejected · remittance PDF generates |
| **8** | Reporting is faithful | 2026 T4 totals match the sum of that year's stubs per employee · CRA XML validates · both report tabs match base44's output for the same range · Trends charts render · **`grep -r "qtrypzzcjebvfcihiynt" src/` returns zero** · logo renders in all three PDFs |
| **8.5** | **Both systems agree** | **≥2 full pay cycles with zero unexplained discrepancies across all 8 fields** · ≥1 remittance generated, paid and reconciled against base44's figure · ≥1 Cancel Payment verified as an exact inverse · a Bus Driver stub (EMP004) confirms the 5009 split · **no paystub email reached a real employee for the entire run** · any discrepancy fixed **and the clock reset** |
| **9** | Cron behaves both ways | Manual invoke with a recent remittance → concludes silently, no email · manual invoke without one → email arrives at `tyler@kensauto.ca` and is **absent from `SentEmailLog`** · `cron.job` shows the schedule · the secret is **not** readable in plaintext from the job body |
| **10** | Nothing dangled | Old `/Payroll` route gone · no dead imports · **`PayrollTransaction` untouched — still present, still readable, its one historical row still reconciles in the GL** |
| **11** | **Fresh data + prod matches dev** | **Full §2.1 audit re-run and passing against the re-imported data** · row counts match the final base44 export exactly · `employee_db_id` re-backfilled · all employee files re-migrated · table + row-count diff clean · **RPC diff via `pg_proc`** clean · **edge-function diff via `get_edge_function`** clean · prod cron URL points at **prod** · dev cron job removed · prod Vault secret exists · local migration filenames match `list_migrations` 1:1 |

---

## 7) Lessons Learned & Context

### Rules specific to this merge

1. **`employee_id` carries three meanings — this is deliberate.** `PayPro_Employee.employee_id` and `PayPro_PayStub.employee_id` hold the *business* key (`EMP001`). `PayPro_EmployeeDeduction.employee_id_ref`, `PayPro_EmployeePayType.employee_id_ref` and `PayPro_TrainingRecord.employee_id_ref` hold the payroll row's *system* id. **`PayPro_EmployeeFile.employee_id` is the odd one out** — despite its name matching the first group, it behaves like the second. Preserved per requirement #4; comment every join. `employee_db_id` is additive and participates in none of them.
2. **The imported tables are a staging snapshot, not the source of truth.** Base44 PayPRO stays live until Phase 11. Prod's `PayPro_*` tables are inert and safe to alter, but numerically provisional — and a **full re-import** (never a delta merge) is mandatory at cutover.
3. **Delivery is two engagements with a validation gate between them.** Phases 1–8, then a parallel-run hold of up to a month (Phase 8.5), then Phases 9–11. **The parallel run happens on dev only** — Phase 6/7 Mark Paid writes to the live general ledger on production, and a month of test paystubs there would corrupt real books. All parallel-run data is destroyed by the Phase 11 re-import, by design.
4. **CSV type inference silently mis-types columns whose data happens to be uniform.** Confirmed **15** times here (corrected during Phase 1 execution from an original blueprint estimate of 11 — the original count grouped four `PayPro_TaxYearConstant` columns onto a single table row and omitted `PayPeriods.total_pto_hours`/`total_stat_hours` entirely). The sharpest case: `cpp2_deduction` inferred `bigint` and `ytd_cpp2` inferred `text` purely because CPP2 has never fired. **A column that has only ever held zeros or blanks tells you nothing about its real domain** — always type from the source schema, never from the sample. **When estimating a mis-typed-column count for planning purposes, count every individual column, not every table row in a summary — a table listing "6 columns" as one bullet undercounts by 5.**
5. **Table names are `PayPro_*` PascalCase; column names are unchanged from base44.**
6. **The shim owns id generation and audit fields.** No PayPRO call site should ever hand-write an `id`, `created_date`, `created_by`, `created_by_id` or `updated_date`. If one does, that's a bug.
7. **PayPRO's global `<style>` block must never be reintroduced.** It redefines `--primary` as raw hex against AutoPRO's HSL-triplet tokens (breaking `hsl(var(--primary))` app-wide) and applies unscoped `!important` checkbox styling invisible in dark mode. AutoPRO's own `--primary: 0 0% 9%` already produces a near-identical checked tone, so there is nothing to compensate for.
8. **Three payroll-adjustment capabilities were given up deliberately:** no automatic `BankTransaction`, no `employee_reference`, no reversal-on-delete. Decisions, not regressions.
9. **`PayrollTransaction` is out of scope entirely.** Not archived, not renamed, not dropped by this work.
10. **`employee_type` collides across the two employee tables.** AutoPRO's ∈ `'tech'`/`'non-tech'` (and per §4.10 it, not `position`, determines technician status). PayPRO's ∈ `'Full Time'`/`'Part Time'`/`'Bus Driver'`. Same name, incompatible domains — the strongest justification for `PayPro_Employee` being its own table, and now the source of the derived Bus Driver GL split.
11. **`TaxCalculator.jsx` is ported byte-identical.** No refactor, no cleanup. CRA compliance depends on it and it has no base44 coupling to justify touching. **Its CPP2 path is unexercised by all historical data** — correctness rests entirely on fidelity of the port.
12. **New edge functions use `paypro-[functionname]`,** deliberately deviating from §4's `autopro-*` mandate (requirement #6). The carve-out is written into `master_context.md` §4.
13. **Payroll email never touches `SentEmailLog`** (requirement #10). Import `sendViaResend`, never `logAndSendEmail`.
14. **13 base44 functions → 8.** Five die rather than port: `getBankAccounts`, `getSupabaseTimeRecords`, `getSupabasePayPeriods`, `manageSupabaseTimeRecords` (service-key proxies made obsolete by direct access) and `generateAutoPROFile`.
15. **Secrets do not belong in data tables.** `workpro_api_key` arrived in `PayPro_PayrollSetting` as an ordinary row and travelled through a CSV export. It turned out to be a dead key superseded months earlier — but nothing about the row said so, and it had to be chased down to establish that. Same exposure class as the hardcoded-JWT anti-pattern §3 flags; the lesson holds regardless of this instance's outcome.

### Inherited AutoPRO rules that bite this work particularly hard

16. **A jsonb array column can hold a double-encoded JSON *string*.** Confirmed — 1,088 dev and 1,166 production `WorkOrder` rows. Never `JSON.stringify()` before writing jsonb. **This import passed clean, but that is a property of the import, not the schema — re-verify at Phase 11.**
17. **Legacy-origin tables have no working id default.** Forgetting a client-generated id throws `23502`. The shim makes this structurally impossible.
18. **RLS enabled with zero policies silently blocks everything** with no error, and the `rls_auto_enable` event trigger does exactly that to every new table. **Confirmed again here on all 10 tables.**
19. **Dollar and rate columns are never `bigint`** — fractional values rejected with `22P02`, often invisibly. Confirmed 15 more times in this import (see lesson 4's count correction).
20. **Text-typed date columns must cast directly to `::DATE`** — casting through a timezone assumes UTC midnight and shifts the date back a day. All PayPRO date columns are text.
21. **A `bigint` value bound against `text` state breaks Radix `<Select>` silently** — option list renders, trigger shows blank. Confirmed across six files. Cast both sides with `String()`.
22. **"Proven on dev" proves nothing about production**, and vice versa. Four RPCs existed on dev with no production equivalent, surfacing only on go-live day. Phase 11 diffs RPCs and functions, not just schema.
23. **Counterpart migration files must be idempotent.** The PR preview check replays every local migration it doesn't have on record for that version, regardless of any "production only" comment. This has broken the check twice from the same root cause.
24. **Edge functions are not deployed by a frontend push.**
25. **`cron.schedule` URLs are project-specific literals.**
26. **Dev holds production-copied real data.** Any send path exercised on dev needs a guard.
27. **Dark mode is first-class, not a retrofit.** AutoPRO's light-mode `--background` is a deliberate medium gray-blue, not white.
28. **`cn()`/`tailwind-merge` silently drops conflicting utilities.** A custom `relative` on a `DialogContent` strips its `fixed` and positions the modal off-screen with zero console error. PayPRO contributes 15+ new modals.
29. **Print output needs a separate `window.open()` document or an explicit `@media print` colour reset.**

### Workflow constraints

30. `git push` does not work from an agent session here — expected and permanent. Commit locally; you push via GitHub Desktop.
31. `main` is never touched without an explicit ask.
32. Production DB writes via MCP are gated by Claude Code's own classifier and will be blocked on first attempt even with in-chat approval — expect to re-confirm at the tool prompt. **Confirmed in Phase 1: this gate can also fire on a plain read (`list_migrations`), not just writes — a simple retry cleared it both times it happened.**
33. Live verification happens at `test.kensauto.ca` only, after commit + push + deploy.

### New from Phase 1 execution (2026-08-18)

34. **RLS session-matrix checks can be run without a live browser, by impersonating the session inside a rolled-back transaction:** `BEGIN; SET LOCAL ROLE authenticated; SET LOCAL request.jwt.claims = '{"sub":"<uuid>","aal":"aal2","amr":[{"method":"otp"}]}'; <query>; ROLLBACK;` (or `SET LOCAL ROLE anon;` for the anonymous case). This exercises the exact `auth.jwt()`/`auth.uid()` code path Supabase RLS uses for real requests, since both read from the `request.jwt.claims` GUC regardless of how it was set. **It is not a substitute for a real `/dev-login` TOTP-driven browser session** — it proves the policy logic is correct, not that the actual auth flow wires a session through to it — but it is the correct fallback whenever a phase needs to verify an RLS gate from a UI-less task context. Used for both Phase 1C (prod) and 1D (dev); both matched the 4-row spec exactly (anon=0, AAL1+flag=0, AAL2+no-flag=0, AAL2+flag=real rows).
35. **`format()`'s `%L` placeholder produces a quoted string *literal*, not a quoted *identifier* — using it for an object name breaks `DROP`/`CREATE POLICY`, `DROP`/`CREATE TABLE`, etc.** `EXECUTE format('DROP POLICY IF EXISTS %L ON public.%I', 'Requires strong auth', t)` generates `DROP POLICY IF EXISTS 'Requires strong auth' ON public."Foo"` — a `42601` syntax error, because a policy name after `DROP POLICY` must be an identifier (`%I`), not a string literal. This exact bug was present in this blueprint's own Phase 1 workstream B / §Phase 1C SQL and was caught only when the migration failed on first application. **Rule: any `format()` argument standing in for an object name — table, column, policy, constraint, function — is `%I`. `%L` is only for values that belong inside `USING`/`WITH CHECK`/`WHERE` clauses.** The failed attempt errored atomically inside its own transaction (Postgres DDL is transactional) — confirmed zero partial state before retrying with the fix, so no cleanup was needed, but don't assume that's true of every DDL failure mode without checking.
36. **A background subagent moving real PII between two of the user's own projects, as part of an already-approved plan, can still trip the safety classifier** — it flagged the Phase 1D `PayPro_PayStub` prod→dev copy because the subagent's own transcript didn't independently re-state "this is the user's authorized source and destination." The action itself was correct (matches the plan's Q1 decision and 1D Step 2 verbatim); the fix was reviewing the flag against the written, approved plan rather than either blindly proceeding or aborting. **When delegating a data-movement task to a subagent, brief it explicitly with the authorization context (which plan/decision approves this, why source and destination are both the user's own) so the classifier's flag — if it fires — is fast to resolve by cross-checking the plan, not by re-deriving intent from scratch.**
