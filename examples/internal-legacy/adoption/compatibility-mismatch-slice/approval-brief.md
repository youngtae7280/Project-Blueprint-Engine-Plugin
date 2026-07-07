# Compatibility Mismatch Supplemental Approval Brief

Status: supplemental demo-support evidence snapshot

This brief summarizes the compatibility mismatch path for user judgment. It is not user acceptance, public-doc cleanup,
source authority change, or Graph-source promotion.

## Intent Understood

DevView is reviewing whether a real legacy/canonical mismatch can be observed in the repository and interpreted safely
through Legacy Compatibility Map and Control Node policy.

## Result Summary

The supplemental slice found a real Execution pack task-card-only authority risk in public docs:

- `docs/source-of-truth-matrix.md` maps Execution Pack to executable task cards.
- `docs/acep.md` and `docs/parallel-execution.md` contain supporting task-card-centered wording.
- `README.md`, `AGENTS.md`, `docs/concept/legacy-compatibility-map.md`, and `docs/concept/execution-contract.md`
  provide the current canonical reading.

The mismatch is bounded as a Compatibility Control Node candidate and public-doc cleanup candidate. Cleanup is deferred.

## Verification Summary

| Check                                  | Evidence status | Summary                                                                                                              |
| -------------------------------------- | --------------- | -------------------------------------------------------------------------------------------------------------------- |
| Real mismatch source exists.           | present         | Primary and supporting public-doc wording is observable.                                                             |
| Canonical interpretation exists.       | present         | Current policy maps Execution Pack to Cycle/Node Execution Contract packaging and task cards to compatibility views. |
| Control Node boundary is reviewable.   | present         | `compatibility-control-node.md` records candidate `CCN-EXECUTION-PACK-TASK-CARD-AUTHORITY-001`.                      |
| Cleanup status is visible.             | deferred        | Public-doc cleanup is intentionally not performed in this task.                                                      |
| AI self-report exclusion is preserved. | present         | This brief points to source files, policy files, and explicit exceptions rather than AI assertion.                   |
| Source authority is unchanged.         | present         | The slice records evidence only and does not promote Maintainability Graph.                                          |

## Remaining Judgment

- Decide later whether this mismatch must be cleaned up before promotion readiness review.
- Decide whether warning plus deferred cleanup is sufficient for an interim compatibility caveat.
- Keep Todo Search `PP-001` stale/reopen closure separate from this supplemental compatibility evidence.

## Approval Choice Candidates

- accept this supplemental slice as real compatibility mismatch evidence with warning
- request public-doc cleanup before using it in promotion readiness review
- defer cleanup and record the Compatibility Control Node candidate as active
- reject this candidate if a stronger mismatch source should be selected

## State Label

```text
Review with warning
```

The mismatch is real and bounded by policy, but cleanup is deferred and source authority must not be inferred from this
brief.

## Non-Promotion Statement

This Approval Brief does not accept product results, does not close any Acceptance Tree state, does not clean up public
docs, and does not promote Maintainability Graph.
