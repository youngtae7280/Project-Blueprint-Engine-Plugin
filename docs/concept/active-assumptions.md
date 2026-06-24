# Active Assumptions

This file contains only active assumptions that have not been promoted to confirmed decisions.

| ID     | Assumption                                                                                                                             | Risk                                                                                              | Resolution Path                                                   |
| ------ | -------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| AA-001 | The concept repository can live under `docs/concept/` while preserving the work instruction's `concept/...` file names as local names. | Low. It affects documentation location, not product semantics.                                    | Confirm or revise when documentation index structure is reviewed. |
| AA-002 | The five core architecture files are canonical candidates until the user accepts or revises the concept baseline.                      | Low. The files avoid implementation detail and can be refined without breaking runtime artifacts. | Review this concept repository before Phase 3 work.               |
| AA-003 | Later-phase outline files should name next-phase work without defining detailed policy, CLI behavior, schemas, or validators.          | Low. This follows the attached scope limit.                                                       | Confirm during the next-phase planning gate.                      |
