# Todo App Graph-Source Enrollment Decision Package

Status: decision-package / docs-only / no-enrollment-executed / no-source-authority-promotion

## Purpose

This package records the decision surface for moving `examples/valid/todo-app-pbe-run` beyond candidate observation.
The candidate graph-source artifact, candidate projection, local observation command, and non-enforcing manual/PR CI
artifact capture are now reviewed. The remaining question is whether Todo App PBE Run should stay candidate-only, become
part of a bounded non-authority positive validate-all projection contract, or wait for a later promotion package.

This document does not change the registry, workflow, CLI behavior, generated artifacts, source authority, enforcement,
or Todo App policy level.

## Current Evidence

| Evidence surface             | Current status                                                                                    |
| ---------------------------- | ------------------------------------------------------------------------------------------------- |
| Candidate graph source       | `examples/valid/todo-app-pbe-run/graph-source-candidate.json`, `candidate-not-promoted`           |
| Candidate projection         | `graph-source-candidate-read-model-projection.json`, 22 nodes / 38 edges / 7 Core Views           |
| Local contract check         | Focused tests verify structure-only, no source-authority claim, no positive validate-all claim    |
| Local observation command    | `graph read-model observe-candidates --json`, `candidate-observation-pass`                        |
| Manual CI observation        | Run `28221088498`, `candidate-observation-pass`, candidate projection artifact uploaded           |
| PR informational observation | PR #6 run `28221326457`, `pull_request-informational`, PR metadata present, observation pass      |
| Positive validate-all status | Todo App projection remains `not-configured`; aggregate remains `aggregate-pass`                  |
| Current policy               | Todo App PBE Run remains `structure-only`, not parity-backed, not pilot-marker-backed, not source |

## Decision Options

| Option                              | Meaning                                                                                              | Pros                                                                                 | Risks / caveats                                                                                   |
| ----------------------------------- | ---------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------- |
| Keep candidate-only                 | Continue local/CI observation outside positive validate-all.                                         | Lowest risk; preserves current boundaries.                                           | Candidate drift remains outside positive aggregate visibility.                                    |
| Bounded non-authority enrollment    | Add Todo App candidate projection contract to positive validate-all as non-authority structure-only. | Makes projection drift visible in the main positive Evidence path without promotion. | Requires registry/profile fields, tests, and CI review to avoid implying source-authority status. |
| Promote beyond structure-only later | Prepare parity/pilot/source-authority package for Todo App.                                          | Could broaden graph-source transition after stronger evidence.                       | Requires user approval, parity policy, fallback/rollback plan, and source-authority decision.     |
| Defer Todo App graph-source work    | Stop after observation and focus elsewhere.                                                          | Avoids churn while Todo Search limited promotion continues.                          | Leaves second-slice graph-source transition paused.                                               |

## Recommendation

Recommended next safe branch:

```text
Bounded non-authority enrollment of the Todo App candidate projection contract into positive validate-all.
```

This should be implemented only as a structure-only projection-contract check. It should not promote Todo App PBE Run,
add parity or pilot-marker requirements, change source authority, or make the candidate graph source an operational
source. The expected first implementation would:

1. Add explicit registry/profile metadata for Todo App candidate projection contract checking.
2. Keep `policyLevel: structure-only`.
3. Require 22 nodes / 38 edges / 7 Core Views.
4. Return a positive validate-all projection status such as `candidate-projection-contract-pass`.
5. Preserve `aggregate-pass` semantics only if the structure-only candidate projection contract passes.
6. Update local tests before any CI review.
7. Run manual and PR CI reviews after the local implementation is pushed.

## Required Boundaries For Enrollment

- Todo App PBE Run remains `structure-only`.
- Enrollment means positive Evidence visibility, not source authority.
- Candidate projection pass is not parity, pilot marker, user acceptance, or promotion approval.
- The candidate graph-source artifact remains non-generated review input unless a later authority package changes it.
- Tree-native `.pbe` artifacts remain source/reference for Todo App.
- Required checks, branch protection, and enforcement remain separate.

## Readiness Gates Before Implementation

| Gate                            | Required state                                                                                      |
| ------------------------------- | --------------------------------------------------------------------------------------------------- |
| Local candidate contract        | Passing and mutation-safe.                                                                          |
| Manual/PR candidate observation | Reviewed as pass.                                                                                   |
| Registry/profile wording        | Must state non-authority, structure-only, no parity, no pilot marker.                               |
| Failure semantics               | Missing/corrupt candidate projection should block local validate-all, but not imply CI enforcement. |
| CI review                       | Manual and PR reviews required after implementation before calling the enrollment path reviewed.    |
| User approval boundary          | Codex/CI cannot self-promote Todo App or treat validate-all pass as user acceptance.                |

## Non-Scope

This decision package does not:

- modify `examples/read-model-aggregate/read-model-slices.json`
- modify `.github/workflows/read-model-evidence.yml`
- modify CLI behavior or tests
- regenerate generated artifacts
- promote Todo App PBE Run
- add parity-backed or pilot-marker-backed status
- expand source authority
- execute repo-wide promotion
- retire tree-native artifacts
- add required checks, branch protection, or enforcement
- include invalid fixtures in CI

## Next Decision

The user should choose one:

1. Implement bounded non-authority enrollment into positive validate-all.
2. Keep candidate-only observation for more manual/PR runs.
3. Prepare a stronger Todo App promotion package.
4. Defer Todo App graph-source expansion.
