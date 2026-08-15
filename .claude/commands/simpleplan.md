---
description: Low-complexity implementation plan (single doc, quick scope)
---
---
Please create a concise implementation plan for this change. Put deep effort into inspecting the codebase before writing, ensuring all details are verified upfront.

Create an `[Title]_plan.md` artifact with the following 6 sections:

1) Overview & Objectives: The specific boundaries, target outcomes, and core goals of this change.
2) Assumptions & Verification: 
   - List all assumptions being made (e.g., existing component state, schema layout, API behaviors) marked as **VERIFIED** or **ASSUMED**.
   - For any item marked **ASSUMED**, state how it will be verified before executing code changes.
3) Proposed Changes: 
   - Target files, components, and edge functions impacted.
   - Specific details on code modifications, payload structures, and database updates.
4) Risk Assessment: A lightweight assessment of potential breaking changes, edge cases, or side effects, including quick mitigations.
5) Verification & Testing Plan: 
   - Clear UI or API test steps to confirm success.
   - An interactive Markdown Checklist (`- [ ]`) covering every planned modification.
6) Completion Notes & Context: (LIVE working area, updated post-execution)
   - What actually happened vs. what was planned.
   - Deviations, fixes during implementation, or unexpected learnings.
   - Architectural notes to carry forward into future context.

**Project Rules & Constraints:**
- Fetch and verify all necessary database schemas, field names, and data types before writing the plan.
- In AutoPro, any new Supabase edge functions must be named using the format `autopro-[functionname]`.

Research the codebase and schemas thoroughly before drafting this plan. Do not execute any code changes yet. Stop and ask for my approval on the implementation plan first.
Your plan will be used as context to creating and updating a master context file that will overview the entire application's operations.
