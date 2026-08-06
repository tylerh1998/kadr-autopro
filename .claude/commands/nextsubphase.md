---
description: Roll up completed sub-phase results, clear context, prep next sub-phase
argument-hint: [next sub-phase, e.g., 8B]
---
The current sub-phase is verified and 100% complete.  Please update our active `phase_[X]_implementation_plan.md` artifact with the following: 

1) **Update Status Table:** Mark the completed sub-phase status as [Tested] in the sub-phase roadmap table. 

2)  **Append to Phase Results and Final Context:** In the "Phase Results and Final Context" section, append a detailed update for the completed sub-phase containing:   

   - What actually happened vs. what was planned, including exact files modified and schema/API adjustments.   

   - Deviations, unexpected edge cases, and fixes applied during execution.   

   - Out-of-scope items deferred to later sub-phases or future projects.   

   - Key assumptions (**VERIFIED** vs. **ASSUMED**) and exact starting steps carried forward into sub-phase $ARGUMENTS. 

     

     Do not execute any code changes for sub-phase $ARGUMENTS yet. Once 
     `phase_[X]_implementation_plan.md` is updated, stop and confirm completion so I can start a fresh session if needed.
