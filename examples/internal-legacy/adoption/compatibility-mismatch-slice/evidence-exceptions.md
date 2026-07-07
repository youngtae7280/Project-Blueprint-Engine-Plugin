# Compatibility Mismatch Evidence Exceptions

Status: supplemental demo-support evidence snapshot

This file records evidence limits for the compatibility mismatch supplemental slice. An exception is not proof. It is a
visible limitation for later user judgment.

## Exception Records

| ID            | Check                                                         | Evidence status | Reason                                                                                                               | Residual risk                                                                         | User judgment / later remedy                                                                             |
| ------------- | ------------------------------------------------------------- | --------------- | -------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| EX-COMPAT-001 | Real source wording for ACEP task-card-only risk.             | present         | `docs/source-of-truth-matrix.md`, `docs/acep.md`, and `docs/parallel-execution.md` are reviewable source references. | Older public docs may still be read as task-card-authority by users or agents.        | Decide whether warning/deferred cleanup is enough before promotion readiness review.                     |
| EX-COMPAT-002 | Cleanup of public docs containing older wording.              | deferred        | This task observes mismatch evidence only; it does not rewrite public docs.                                          | Mismatch remains visible until public-doc alignment or accepted compatibility caveat. | Schedule public-doc cleanup or record accepted compatibility caveat in a future review.                  |
| EX-COMPAT-003 | Selected Todo Search slice contains the mismatch.             | not-applicable  | The mismatch is in public docs, not in the selected Todo Search artifact folder.                                     | Compatibility path is supplemental, not part of Todo Search product behavior.         | Use this supplemental slice as compatibility evidence while keeping Todo Search PP-001 limits separate.  |
| EX-COMPAT-004 | Runtime validator or CI detection for this mismatch.          | exception       | No validator, CLI rule, or CI automation is implemented in this phase.                                               | Future regressions could reintroduce or miss similar wording.                         | Later implementation may add generated compatibility reports or validator checks after policy approval.  |
| EX-COMPAT-005 | Graph-source promotion readiness from this mismatch evidence. | exception       | The mismatch path is strengthened, but PP-001 and other promotion prerequisites remain unresolved.                   | Treating one demonstrated path as full readiness would hide remaining blockers.       | Keep final feasibility judgment partial until stale/reopen closure and other prerequisites are resolved. |

## AI Self-Report Exclusion

AI claims that the wording is safe, risky, or resolved are not Evidence. Evidence is the observable source wording,
canonical policy references, this exception record, and any later reviewable cleanup diff or user decision.

## Non-Promotion Statement

These exception records do not change source authority, clean up public docs, create validators, or promote
Maintainability Graph.
