---
description: Mid-complexity implementation plan (single rotating doc, multi-phase)
---
Please create a detailed implementation plan for this project using the following exact structure. I want you to put as much effort into the planning process—reading, researching, doing searches, and asking questions—as you would if you were asked to execute. Planning is more important than execution.

Create an `implementation_plan.md` artifact with the following 7 sections:

1) Context & Lessons Learned: Keep this section active across updates. Put any lessons learned and the core goal of what we're doing to provide proper context moving forward.
2) Previously Completed: A list of what we've already accomplished and tested (for historical context). This does not change for each phase, it will only be updated when a new implementation plan is needed (after the final phase).
3) Risk Assessment: Perform a thorough risk assessment of the upcoming changes (e.g., data corruption, UI breaks). Include the impact level and likelihood, as well as a mitigation.
4) Time Estimate: Provide a time estimate for the remaining work, keeping in mind your autonomous speed.
5) Roadmap & Progress: Break the work down into logical Phases. For each phase include:
   - A header with a status indicator (e.g., [Pending], [Executed], [Tested]).
   - A list of the functions/files/modals that will be impacted.
   - A TL;DR of the phase.
   - An in-depth, detail-oriented description of what is being changed.
6) Verification Plan: For each phase, describe exactly what actions I would need to take in the UI to test it, what is being tested, and how we will know it was successful. This proves you understand the goal of the code.
7) Working Area (Current Phase): We will go into extreme technical detail of what you plan to do in the *current* active phase (e.g., exact file paths, lines of code, variable changes, payload structures). After we finish a phase, you will update the implementation plan to rotate the next phase into this working area.

Research the codebase thoroughly before drafting this plan. Do not execute any code changes yet. Stop and ask for my approval on the plan first.

Note: In AutoPro, any new supabase edge functions should be named in format "autopro-[functionname]" to allow me to organize which functions belong to autopro within a shared supabase project.
