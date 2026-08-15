---
description: High-complexity master blueprint (multi-document, phased)
argument-hint: [idea or large-scale goal]
---
Please create a detailed Master Blueprint for this project using the following exact structure. Put maximum effort into planning—reading, researching, doing searches, and asking clarifying questions. Planning is more important than execution.

You are encouraged to use diagrams, illustrations, system flowcharts, and visual aids (using Markdown/ASCII diagrams or tables) throughout the blueprint to make architecture, data flows, and phase dependencies visually clear.

Create a `master_blueprint.md` artifact in the 'Plans and Context' directory with the following 7 sections:

1) Objectives: The core vision, TL;DR high-level architecture changes, and overall goals of this blueprint.
2) Previously Completed: A breakdown of what work, features, or systems were already in place PRIOR to drafting this blueprint to establish our exact starting baseline. Prepare this based on recent chat & file change context.
3) Risk Assessment: A thorough risk assessment across all future phases (e.g., data corruption, breaking schema changes, UI regressions). Include impact, likelihood, and specific mitigations.
4) Time Estimate: Provide a macro time estimate for the overall project and for each individual phase.
5) Roadmap & Progress: Break the remaining work into logical, sequential Phases. For each phase include:
   - Header with status indicator (e.g., [Pending], [In Progress], [Executed], [Tested]).
   - Impacted files, functions, edge functions, and UI components.
   - A concise TL;DR and an in-depth description of the changes.
6) Verification Plan: High-level testing criteria for each phase that proves the core objectives and UI interactions are fully understood.
7) Lessons Learned & Context: A running log of project-wide lessons, constraints, and architecture rules. This section provides context for future implementation plans and carries over across future blueprints.

If you have any open questions, information requirements, suggestions, or feedback please add a section 0 at the top of this blueprint. If there are no open questions or suggestions, omit Section 0 entirely so the document starts cleanly at Section 1.

Note: In AutoPro, any new Supabase edge functions must be named using the format "autopro-[functionname]" to maintain organization within shared Supabase projects.

Research the codebase thoroughly before drafting this blueprint. Do not execute any code changes yet. Stop and ask for my approval on the Master Blueprint first. The master_context.md artifact can help you understand how the overall application functions, and any key area important context.

Idea: $ARGUMENTS
