---
description: Diagnose an issue before proposing a fix
---
Please perform a thorough root-cause diagnosis for the reported issue.   

Put deep effort into investigating the codebase, database schemas, and logs before drafting your report. **Do not modify any code or execute fixes yet.**

Create a `troubleshooting_report.md` artifact with the following 6 sections:

1) Executive Summary: A high-level TL;DR summarizing the reported behavior, top suspect, and recommended next step.
2) Issue Definition & Evidence: 
   - Concise explanation of the observed issue versus expected behavior.
   - Specific logs, file locations, code snippets, or user reports used to form this understanding.
3) Potential Root Causes: A breakdown of possible causes ranked by likelihood (High / Medium / Low).
4) Assumptions & Verification Audit: 
   - List every assumption regarding system state, schemas, and logic marked strictly as **VERIFIED** (directly checked in code/logs/schema) or **ASSUMED** (inferred/guessing).
   - Detail exact steps to verify high-risk **ASSUMED** items before proceeding.
5) Diagnostic & Isolation Steps: Actionable, step-by-step troubleshooting instructions to isolate the exact root cause.
6) Proposed Resolution / Implementation Strategy: 
   - Suggested resolution paths based on the most probable cause.
   - If the fix is clear and self-contained, draft a lightweight implementation plan (referencing target files, function signatures, and required verification steps and using the ./simpleplan command).

**Project & Architecture Rules:**
- Use `master_context.md` for overall application mechanisms, business logic, and system rules.
- **Flag Conflicts Explicitly:** If you find any discrepancy between `master_context.md` and the actual codebase/data, flag it clearly—this departure is often the root cause or potentially indicative of down wind effects.
- Ensure any new Supabase Edge Functions mentioned follow the required `autopro-[functionname]` naming convention.

Investigate thoroughly and present the diagnostic report first. Wait for my approval before executing any code changes.
