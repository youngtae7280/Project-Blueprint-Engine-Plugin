# Open Questions

This file contains active unresolved concept questions only.

## Active

| ID     | Question                                                                                                                   | Why It Matters                                                                                              | Target Phase                                                                                                                      |
| ------ | -------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| OQ-001 | When should Maintainability Graph be promoted from canonical read model to source model?                                   | This changes source authority, compatibility behavior, validators, migration work, and artifact generation. | After Approval Brief, Check/Evidence, Control Node, Legacy Compatibility Map, and runtime feasibility demonstration are complete. |
| OQ-002 | Should View Tree Pack be documented only as a conceptual projection, or should it later map to concrete `.pbe` files?      | This affects artifact layout and compatibility guarantees.                                                  | Phase 3+                                                                                                                          |
| OQ-003 | How much CLI support should Approval Brief generation receive in a later implementation phase?                             | The concept policy is complete, but implementation support is intentionally out of scope.                   | Later implementation phase                                                                                                        |
| OQ-004 | Should each Human Gate type have a specialized brief template, or should one adaptive structure remain enough?             | This affects future template design but not the concept policy.                                             | Later implementation phase                                                                                                        |
| OQ-005 | Which legacy documents still use superseded terms as active architecture rather than historical or compatibility language? | Public docs may need later cleanup once the canonical baseline is approved.                                 | Phase 3+                                                                                                                          |
| OQ-006 | What evidence quality thresholds should apply to concept-level checks versus execution evidence?                           | Check/Evidence policy is intentionally outline-only in this pass.                                           | Phase 3+                                                                                                                          |
| OQ-007 | Should Approval Brief to Acceptance Tree mapping become a formal generated artifact in a later phase?                      | Approval Brief may support Acceptance Tree updates, but does not replace durable acceptance state.          | Later implementation phase                                                                                                        |

## Not Active Here

Detailed TypeScript models, CLI command design, validator implementation, migration scripts, and feasibility
demonstration are not open questions for this phase. They are next-phase work candidates.
