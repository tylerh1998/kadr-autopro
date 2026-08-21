---
description: Low-complexity implementation plan (single doc, quick scope)
---
---
Please create a concise implementation plan for this change. Put deep effort into inspecting the codebase before writing, ensuring all details are verified upfront.

Create an `[Title]_plan.md` artifact with the following 7 sections:

1) Overview & Objectives: The specific boundaries, target outcomes, and core goals of this change.
2) Open Questions & Clarifications
   - Identify anything that needs prior direction before execution. Questions about instructions provided. Suggestions or feedback prior to execution? Make this TL;DR - I want a quick snapshot of anything that requires the user's attention here. You can go further in detail under appropriate section and reference where that detail is in this area. 
3) Assumptions & Verification: 
   - List all assumptions being made (e.g., existing component state, schema layout, API behaviors) marked as **VERIFIED** or **ASSUMED**.
   - For any item marked **ASSUMED**, state how it will be verified before executing code changes. For any item marked **VERIFIED**, state how you verified that.  
4) Proposed Changes: 
   - Target files, components, and edge functions impacted. Group these by File - what changes are being made to each file. What third party (Supabase, Vercel, API, etc) alterations need to be made, if any. 
   - Specific details on code modifications, payload structures, and database updates.
5) Risk Assessment: A lightweight assessment of potential breaking changes, edge cases, or side effects, including quick mitigations.    \**Action Requirement:** Before writing this section, use your codebase search and analysis tools to perform a targeted assessment of the impacted files and dependencies. Use the findings from that assessment to report on potential breaking points and necessary context here.
6) Verification & Testing Plan: 
   - Clear UI or API test steps to confirm success.
   - An interactive Markdown Checklist (`- [ ]`) covering every planned modification.
   - The testing action plan (user one-sided vs live browser testing performed by ai agent). Include instructions as per master_context.md and how it governs agent-directed testing to occur - Execute, Hold for User, User Logs In and Reprompts, testing directed at test.kensauto.ca 
7) Completion Notes & Context: (LIVE working area, updated post-execution)
   - What actually happened vs. what was planned.
   - Deviations, fixes during implementation, or unexpected learnings.
   - Architectural notes to carry forward into future context.
   - **Post or Mid Execution**: Do not wipe this area - append as needed. See Rule 4. 

**Project Rules & Constraints:**

1. Fetch and verify all necessary database schemas, field names, and data types before writing the plan.
2. In AutoPro, any new Supabase edge functions must be named using the format `autopro-[functionname]`.
3. **Edge Function Deployments:** All edge functions must be deployed to the development database first. Testing cannot occur before this happens. Deployment to the Production or Main database is on HOLD unless explicitly directed by the User.
4. Your plan will be used as context to creating and updating a master context file that will overview the entire application's operations. Ensure results

Research the codebase and schemas thoroughly before drafting this plan. Do not execute any code changes yet. Stop and ask for my approval on the implementation plan first.
