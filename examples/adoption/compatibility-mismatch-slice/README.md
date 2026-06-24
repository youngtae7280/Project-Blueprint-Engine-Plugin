# Compatibility Mismatch Supplemental Slice

Status: supplemental demo-support evidence snapshot

This slice strengthens the Actual Runtime Feasibility Demo compatibility mismatch path with a real repository wording
case. It is not public-doc cleanup, not runtime migration, not Graph-source promotion, and not source-authority change.

## Selected Primary Mismatch

Primary observed mismatch:

```text
docs/source-of-truth-matrix.md: ACEP -> executable task cards
```

Canonical interpretation:

```text
ACEP = Cycle Contract and Node Execution Contract packaging, plus compatibility execution-pack files.
Task cards are human-friendly compatibility views and must not become task-card-only execution authority.
```

This matters because older task-card-centered wording could be read as if executable task cards are the active execution
authority. Current concept policy makes Cycle Contracts and Node Execution Contracts the execution boundary.

## Source References

| Source                                     | Observed role                                                                                 |
| ------------------------------------------ | --------------------------------------------------------------------------------------------- |
| `docs/source-of-truth-matrix.md`           | Primary wording that maps ACEP to executable task cards.                                      |
| `docs/acep.md`                             | Supporting task-card-centered ACEP wording and runner references.                             |
| `docs/parallel-execution.md`               | Supporting flow that ends in ACEP Task Cards -> Codex Coding Tasks.                           |
| `docs/usage.md`                            | Safer public-doc wording that ACEP is a contract and creates files in addition to task cards. |
| `README.md`                                | Current compatibility name: ACEP = Cycle Contract and Node Execution Contract packaging.      |
| `AGENTS.md`                                | Current operating instruction for ACEP compatibility and Node Execution Contract reading.     |
| `docs/concept/legacy-compatibility-map.md` | Canonical compatibility interpretation boundary.                                              |
| `docs/concept/execution-contract.md`       | Canonical execution boundary.                                                                 |
| `docs/concept/control-node-policy.md`      | Compatibility Control Node boundary.                                                          |
| `docs/concept/superseded-items.md`         | Records task-card-only ACEP as superseded.                                                    |

## Supplemental Slice Purpose

This slice demonstrates that PBE can:

- observe real legacy/canonical wording mismatch from repository files
- map the mismatch through Legacy Compatibility Map and Execution Contract policy
- identify whether it is a simple compatibility note, superseded item reference, Compatibility Control Node candidate, or
  public-doc cleanup candidate
- surface the risk through an Approval Brief warning without changing source authority
- keep cleanup deferred instead of silently rewriting public docs during evidence collection

## Non-Scope

This slice does not:

- edit or clean up the public docs containing the observed wording
- create a CLI command, validator, schema, or runtime source model
- migrate ACEP artifacts
- retire task cards or `.pbe/codex-execution-pack/*`
- promote Maintainability Graph
- mark tree-native artifacts as superseded

## Result Summary

The primary mismatch is real and reviewable. It is bounded by current concept policy and should be treated as:

```text
Compatibility Control Node candidate + public-doc cleanup candidate + superseded item reference
```

It should not be treated as:

```text
runtime source authority change
Graph-source promotion
immediate cleanup requirement
```

## Demo Status

| Check                                               | Status         |
| --------------------------------------------------- | -------------- |
| Real legacy/canonical mismatch source exists.       | present        |
| Canonical interpretation is documented.             | present        |
| Compatibility Control Node candidate is reviewable. | present        |
| Public-doc cleanup is performed.                    | deferred       |
| Source authority is changed.                        | not-applicable |
| Graph-source promotion is declared.                 | not-applicable |
