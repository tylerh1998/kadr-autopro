---
description: Detailed implementation plan for one phase of the active blueprint
argument-hint: [phase number]
---
Referencing Phase $ARGUMENTS of our `master_blueprint.md`, please create a detailed Phase Implementation Plan for executing this phase. Focus deeply and exclusively on this active phase. DO NOT DELETE THE MASTER CONTEXT OR MASTER BLUEPRINT ARTIFACTS.

This artifact is a LIVE, working document throughout execution, verification, and correction. As issues or edge cases arise during build/testing, UPDATE this document with new learnings—do not wipe previous context or clear past progress, but adjust and append to reflect current reality. We will roll key learnings back into the Master Blueprint at the end of the phase.

You are encouraged to use diagrams, component mockups, or data-flow visuals to clearly illustrate code logic, payload structures, or UI changes.

Create a `phase_$ARGUMENTS_implementation_plan.md` artifact with the following 4 sections:

1) Phase Scope & Objectives: The specific boundaries, goals, and target outcomes for this phase run.
2) Lessons Learned & Context: Relevant architectural constraints, edge-case warnings, or past mistakes pulled from Section 7 of the Master Blueprint that apply to this specific build.
3) Detailed Execution Plan: Extreme technical execution detail for the active phase:
   - Target files, database tables, and function signatures.
   - Line-by-line or block-level code modification explanations. Examples (only if best to illustrate proposed changes).
   - Payload structures, state changes, and styling adjustments.
4) Verification Plan:
   - A step-by-step description of exact UI actions, network responses, and expected behaviors to verify success.
   - An interactive Markdown Checklist (`- [ ]`) covering every single component, API test, and UI state change so we can track verification progress step-by-step.

If you have any open questions, information requirements, suggestions, or feedback please add a section 0 at the top of this Plan. If Section 0 contains open questions, pause and present those specific questions to me alongside presenting the draft artifact.

Note: In AutoPro, any new Supabase edge functions must be named using the format "autopro-[functionname]".

Research the relevant files thoroughly. Do not execute any code changes yet. Stop and ask for my approval on this Implementation Plan first.
