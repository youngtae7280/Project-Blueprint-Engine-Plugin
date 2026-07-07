# Todo App Graph-Source Enrollment Decision Package

Status: bounded-non-authority-enrollment-reviewed / graph-source-backed-structure-only-generation / no-source-authority-promotion

## Purpose

This package records the decision surface and local-first implementation result for moving
`examples/valid/todo-app-devview-run` beyond candidate observation. The candidate graph-source artifact, candidate
projection, local observation command, and non-enforcing manual/PR CI artifact capture are reviewed. The next safe branch
has now been implemented locally: Todo App DevView Run participates in positive validate-all only through a bounded
non-authority structure-only projection contract.

This document does not approve source authority, enforcement, or Todo App promotion. Manual and PR workflow reviews are
complete for the new positive validate-all projection status.

The next bounded local branch is also implemented and reviewed in manual/PR CI: Todo App DevView Run structure-only
generation now reads `graph-source-candidate.json` for generated read-model records while preserving `structure-only`,
`candidate-not-promoted`, and `non-authority-structure-only` metadata. Manual run `28224636333` and PR #9 run
`28224878648` confirm the uploaded artifact metadata.

## Current Evidence

| Evidence surface             | Current status                                                                                                                             |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Candidate graph source       | `examples/valid/todo-app-devview-run/graph-source-candidate.json`, `candidate-not-promoted`                                                |
| Candidate projection         | `graph-source-candidate-read-model-projection.json`, 22 nodes / 38 edges / 7 Core Views                                                    |
| Local contract check         | Focused tests verify structure-only, no source-authority claim, and non-authority validate-all use                                         |
| Local observation command    | `graph read-model observe-candidates --json`, `candidate-observation-pass`                                                                 |
| Manual CI observation        | Run `28221088498`, `candidate-observation-pass`, candidate projection artifact uploaded                                                    |
| PR informational observation | PR #6 run `28221326457`, `pull_request-informational`, PR metadata present, observation pass                                               |
| Positive validate-all status | Todo App projection reports `candidate-projection-contract-pass`; aggregate remains `aggregate-pass`                                       |
| Manual CI review             | Run `28222731063`, `workflow_dispatch`, `ci-evidence-pass`, Todo App positive projection pass                                              |
| PR informational review      | PR #7 run `28223010185`, `pull_request-informational`, Todo App positive projection pass                                                   |
| Generation source mode       | Manual run `28224636333` and PR #9 run `28224878648` confirm `readModelSourceMode: graph-source-backed` and `non-authority-structure-only` |
| Current policy               | Todo App DevView Run remains `structure-only`, not parity-backed, not pilot-marker-backed, not source                                      |

## Decision Options

| Option                              | Meaning                                                                                              | Pros                                                                                 | Risks / caveats                                                                                   |
| ----------------------------------- | ---------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------- |
| Keep candidate-only                 | Continue local/CI observation outside positive validate-all.                                         | Lowest risk; preserves current boundaries.                                           | Candidate drift remains outside positive aggregate visibility.                                    |
| Bounded non-authority enrollment    | Add Todo App candidate projection contract to positive validate-all as non-authority structure-only. | Makes projection drift visible in the main positive Evidence path without promotion. | Requires registry/profile fields, tests, and CI review to avoid implying source-authority status. |
| Promote beyond structure-only later | Prepare parity/pilot/source-authority package for Todo App.                                          | Could broaden graph-source transition after stronger evidence.                       | Requires user approval, parity policy, fallback/rollback plan, and source-authority decision.     |
| Defer Todo App graph-source work    | Stop after observation and focus elsewhere.                                                          | Avoids churn while Todo Search limited promotion continues.                          | Leaves second-slice graph-source transition paused.                                               |

## Implemented Local-First Branch

Implemented safe branch:

```text
Bounded non-authority enrollment of the Todo App candidate projection contract into positive validate-all.
```

This is implemented only as a structure-only projection-contract check. It does not promote Todo App DevView Run, add parity
or pilot-marker requirements, change source authority, or make the candidate graph source an operational source. The
local implementation:

1. Adds explicit registry/profile metadata for Todo App candidate projection contract checking.
2. Keep `policyLevel: structure-only`.
3. Requires 22 nodes / 38 edges / 7 Core Views.
4. Returns `candidate-projection-contract-pass` in local positive validate-all output.
5. Preserves `aggregate-pass` semantics only if the structure-only candidate projection contract passes.
6. Adds focused pass and failure tests before CI review.
7. Has manual and PR CI review complete for the positive projection status.

The follow-up generation branch now reuses the candidate source records for `graph read-model generate --slice
examples/valid/todo-app-devview-run`. This keeps the candidate graph source outside source authority while proving that the
structure-only generated read-model can be backed by the candidate records.

## Required Boundaries For Enrollment

- Todo App DevView Run remains `structure-only`.
- Enrollment means positive Evidence visibility, not source authority.
- Candidate projection pass is not parity, pilot marker, user acceptance, or promotion approval.
- The candidate graph-source artifact remains non-generated review input unless a later authority package changes it.
- Tree-native `.devview` artifacts remain source/reference for Todo App.
- Required checks, branch protection, and enforcement remain separate.

## Review Gates After Local Implementation

| Gate                            | Required state                                                                                     |
| ------------------------------- | -------------------------------------------------------------------------------------------------- |
| Local candidate contract        | Passing and mutation-safe. Complete locally.                                                       |
| Manual/PR candidate observation | Reviewed as pass.                                                                                  |
| Registry/profile wording        | States non-authority, structure-only, no parity, no pilot marker.                                  |
| Failure semantics               | Missing/corrupt candidate projection blocks local validate-all, but does not imply CI enforcement. |
| CI review                       | Manual and PR review complete for the bounded non-authority projection status.                     |
| User approval boundary          | Codex/CI cannot self-promote Todo App or treat validate-all pass as user acceptance.               |

## Non-Scope

This local-first enrollment does not:

- modify `.github/workflows/read-model-evidence.yml`
- promote Todo App DevView Run
- add parity-backed or pilot-marker-backed status
- expand source authority
- execute repo-wide promotion
- retire tree-native artifacts
- add required checks, branch protection, or enforcement
- include invalid fixtures in CI

## Next Decision

The user should choose one:

1. Decide whether additional observation is needed.
2. Prepare the next bounded E2E dogfood smoke script/design implementation.
3. Prepare a stronger Todo App promotion package only after separate approval.
4. Defer broader Todo App graph-source expansion after reviewed enrollment.
