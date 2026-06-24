# Compatibility Control Node Candidate

Status: supplemental demo-support evidence snapshot

This is a concept-level Control Node candidate, not a runtime Control Node implementation.

## Candidate

| Field            | Value                                                         |
| ---------------- | ------------------------------------------------------------- |
| ID               | `CCN-ACEP-TASK-CARD-AUTHORITY-001`                            |
| Title            | ACEP task-card-only authority wording                         |
| Family           | Compatibility Control Node                                    |
| Lifecycle status | `Active`                                                      |
| Source status    | Demo-support control record candidate, not operational source |

## Source Wording References

| Source                           | Evidence                                                            |
| -------------------------------- | ------------------------------------------------------------------- |
| `docs/source-of-truth-matrix.md` | ACEP is mapped to executable task cards.                            |
| `docs/acep.md`                   | ACEP package and runner wording center `11-task-cards/`.            |
| `docs/parallel-execution.md`     | Transformation flow includes ACEP Task Cards -> Codex Coding Tasks. |

## Canonical Interpretation

Current policy reads ACEP as:

```text
Cycle Contract and Node Execution Contract packaging, plus compatibility execution-pack files.
```

Task cards may remain human-friendly compatibility views. They must reference Node Execution Contracts when those
contracts exist and must not become task-card-only authority.

## Affected Judgment

| Judgment area           | Effect                                                                                                                                     |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Execution authority     | Older wording could make task cards appear to be the execution source.                                                                     |
| Source-of-truth clarity | `source-of-truth-matrix.md` can be read as an authority map, so stale wording carries higher risk than a casual glossary note.             |
| Scope verification      | If task cards are treated as authority, selected/deferred/forbidden scope could bypass Cycle/Node Contract boundaries.                     |
| Promotion readiness     | Future Graph-source readiness review should know whether this mismatch is cleaned up, accepted as compatibility, or deferred with warning. |

## Boundary Decision

This mismatch is more than a simple glossary note because it appears in a source-of-truth style public doc and can affect
execution authority judgment. It is also not a Graph-source promotion blocker by itself because current concept policy
bounds the interpretation.

Recommended classification:

```text
Compatibility Control Node candidate
public-doc cleanup candidate
superseded item reference
```

Not recommended:

```text
source authority change
immediate runtime migration
silent cleanup during evidence collection
```

## Closure Rule

The candidate can close when one of these is true:

1. Public docs are clarified so ACEP is described as Cycle/Node Execution Contract packaging and task cards are marked as
   compatibility views.
2. A promotion readiness review records an explicit compatibility caveat that the older wording is accepted for the
   current phase, with cleanup deferred and visible.
3. A newer Compatibility Control Node or policy supersedes this candidate with clearer scope and evidence.

Closure requires observable Evidence. AI self-report cannot close this candidate.

## Approval Brief Visibility

Show this candidate in a promotion readiness or compatibility review Approval Brief when:

- the user is asked to judge Graph-source readiness
- task-card-only wording could affect execution authority or verification scope
- cleanup is deferred and the user needs to understand the warning

Hide it from ordinary Todo Search selected-slice review when the public-doc compatibility mismatch does not affect that
slice's product behavior, tests, or acceptance decision.

## Non-Promotion Statement

This candidate does not change source authority, does not clean up public docs, does not retire task cards, and does not
promote Maintainability Graph.
