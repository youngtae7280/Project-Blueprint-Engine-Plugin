# Legacy Compatibility Map Application

Status: supplemental demo-support evidence snapshot

This document applies the Legacy Compatibility Map and related concept policies to the ACEP task-card-only wording
mismatch.

## Applied Policy Sources

| Policy source                              | Relevant rule                                                                                                                                                                              |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `docs/concept/legacy-compatibility-map.md` | ACEP is a compatibility name, not task-card-only authority. Mismatches affecting current approval, verification, scope, or user judgment can become Compatibility Control Node candidates. |
| `docs/concept/execution-contract.md`       | Cycle Contracts and Node Execution Contracts are the planning/execution boundary. Task cards are human-friendly compatibility views.                                                       |
| `docs/concept/control-node-policy.md`      | Compatibility Control Nodes track legacy/canonical mismatch, parity gap, migration caveat, or accepted compatibility exception.                                                            |
| `docs/concept/superseded-items.md`         | Task-card-only ACEP is superseded by Cycle Contract and Node Execution Contract packaging.                                                                                                 |
| `docs/concept/decision-log.md`             | DEC-006, DEC-018, DEC-023, and DEC-024 preserve execution-contract authority, compatibility interpretation, demo evidence boundaries, and non-promotion status.                            |

## Classification

| Possible record type                 | Judgment                                                                                                                     |
| ------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------- |
| Simple Legacy Compatibility Map note | Insufficient by itself because `source-of-truth-matrix.md` is authority-oriented wording.                                    |
| Superseded Item reference            | Required as supporting classification because task-card-only ACEP is a replaced direction.                                   |
| Compatibility Control Node candidate | Required for promotion readiness review because the mismatch can affect execution authority and scope verification judgment. |
| Public-doc cleanup candidate         | Required but deferred. Cleanup is not performed in this evidence slice.                                                      |

## Compatibility Reading

Read the older wording as:

```text
ACEP task-card wording = compatibility view / older package surface
current execution boundary = Cycle Contract + Node Execution Contract
```

This reading lets older docs remain reviewable during transition without reviving task-card-only execution.

## Why This Is Not Cleanup

This slice observes the mismatch and records the control boundary. It does not rewrite `docs/source-of-truth-matrix.md`,
`docs/acep.md`, or `docs/parallel-execution.md`.

Cleanup remains a later public-doc alignment task because this work is evidence strengthening, not doc migration.

## Why This Is Not Source Promotion

The mismatch is interpreted against current tree-native source authority. No graph file, projection, schema, validator,
or runtime source model is created. Maintainability Graph remains a read/alignment model and long-term source model
candidate only.

## Compatibility Path Status

| Requirement                      | Status         | Note                                                                                     |
| -------------------------------- | -------------- | ---------------------------------------------------------------------------------------- |
| Real mismatch source exists.     | demonstrated   | `docs/source-of-truth-matrix.md` and supporting docs contain task-card-centered wording. |
| Canonical interpretation exists. | demonstrated   | Legacy Compatibility Map and Execution Contract policy define the current reading.       |
| Control boundary is identified.  | demonstrated   | `CCN-ACEP-TASK-CARD-AUTHORITY-001` records a candidate.                                  |
| Cleanup is complete.             | deferred       | Cleanup is intentionally out of scope for this supplemental evidence slice.              |
| Source authority changes.        | not-applicable | No source authority change is performed or implied.                                      |
