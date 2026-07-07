# Compatibility Mismatch Source Observations

Status: supplemental demo-support evidence snapshot

This document records observed repository wording only. It does not clean up public docs or decide source authority.

## Observation Table

| Source                                     | Observed wording / claim                                                                                                                                | Interpretation risk                                                                                                            | Evidence status |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ | --------------- |
| `docs/source-of-truth-matrix.md`           | ACEP is mapped to executable task cards.                                                                                                                | Primary mismatch. If read as active authority, ACEP can look task-card-only instead of contract-packaging based.               | present         |
| `docs/acep.md`                             | ACEP contains task cards, required contract files include `11-task-cards/`, and the runner reads `11-task-cards/`.                                      | Supporting mismatch. The page also contains contract rules, but task cards remain the visible center of the older flow.        | present         |
| `docs/parallel-execution.md`               | Execution transformation includes `ACEP Task Cards -> Codex Coding Tasks`.                                                                              | Supporting mismatch. It could imply task cards are the execution source instead of compatibility views derived from contracts. | present         |
| `docs/usage.md`                            | ACEP is a contract and creates traceability, UI/UX, evidence, coverage, strategy, manifest files in addition to task cards.                             | Compatibility-safe public wording. It reduces risk by treating task cards as part of a larger contract package.                | present         |
| `README.md`                                | ACEP is Cycle Contract and Node Execution Contract packaging.                                                                                           | Canonical/current wording for compatibility term interpretation.                                                               | present         |
| `AGENTS.md`                                | ACEP remains a compatibility term for Cycle Contract and Node Execution Contract packaging; ACEP execution reads cycle and node contracts when present. | Canonical current operating instruction.                                                                                       | present         |
| `docs/concept/legacy-compatibility-map.md` | ACEP is a compatibility name, not task-card-only authority.                                                                                             | Canonical policy that bounds the mismatch.                                                                                     | present         |
| `docs/concept/execution-contract.md`       | Cycle Contract and Node Execution Contract define the planning/execution boundary; task cards are compatibility views.                                  | Canonical policy that prevents task-card-only execution authority.                                                             | present         |
| `docs/concept/control-node-policy.md`      | Old Execution pack/task-card-only wording can become a Compatibility Control Node or superseded item record.                                            | Control boundary for current judgment or promotion review.                                                                     | present         |
| `docs/concept/superseded-items.md`         | Task-card-only ACEP is superseded by Cycle Contract and Node Execution Contract packaging.                                                              | Superseded direction reference.                                                                                                | present         |

## Selected Primary Mismatch

The primary mismatch for this supplemental slice is:

```text
docs/source-of-truth-matrix.md: ACEP -> executable task cards
```

It is selected because `source-of-truth-matrix.md` has authority-oriented framing. If the row is read without current
concept policy, it can affect execution authority, scope verification, and promotion readiness judgment.

## Why Supporting Sources Matter

`docs/acep.md` and `docs/parallel-execution.md` make the primary mismatch more than a single stale phrase. They show an
older task-card-centered reading across multiple public docs.

`docs/usage.md`, `README.md`, `AGENTS.md`, and the concept policies keep the mismatch bounded because they provide the
current interpretation:

```text
ACEP is a compatibility package name. Execution authority comes from Cycle and Node Execution Contracts.
```

## Cleanup Boundary

No cleanup is performed in this slice. The observed public-doc wording remains in place as reviewable evidence. Cleanup
priority is a separate open question and may be handled later through public-doc alignment work.

## AI Self-Report Exclusion

The evidence above is the observable source wording itself. An AI statement that the wording is compatible or risky is
not Evidence unless it points back to these source references and the relevant policy records.
