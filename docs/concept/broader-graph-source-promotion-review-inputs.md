# Broader Graph-Source Promotion Review Inputs

Status: promotion-review-inputs-consumed-for-limited-execution / review-input-package /
repo-wide-promotion-not-executed

## Purpose

This document packages the graph/read-model Evidence stack used as inputs for Graph-source promotion review.

The limited execution is recorded in
[broader-graph-source-promotion-execution-record.md](broader-graph-source-promotion-execution-record.md). This input
package does not approve repo-wide Graph-source promotion, retire tree-native artifacts, modify workflow behavior, add
enforcement, or replace user acceptance.

## Current Evidence Inventory

| Evidence area                            | Current reviewable inputs                                                                                                                                                                                                                         | Current status                                                                                                                                       |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| Scoped Todo Search pilot records         | `limited-pilot-transition-record.md`, `dry-run-scoped-limited-pilot-observation-record.md`, `scoped-source-authority-pilot-execution-record.md`, `scoped-source-authority-pilot-review.md`, `scoped-source-authority-pilot-active-observation.md` | Scoped source-authority pilot executed, reviewed, and kept active under observation with warnings.                                                   |
| Generated Todo Search read-model         | `examples/adoption/todo-search-slice/generated/generated-read-model.json`, `generated-read-model.md`, `read-model-evidence-manifest.json`                                                                                                         | Generated read-model Evidence exists for the bounded Todo Search slice.                                                                              |
| Todo Search parity Evidence              | `examples/adoption/todo-search-slice/generated/read-model-parity-report.json`, `read-model-parity-report.md`, manual read-model artifact                                                                                                          | `comparison-pass`; mismatch/blocking/decision-required counts remain 0/0/0 for the current baseline.                                                 |
| Todo Search validator-backed Evidence    | `examples/adoption/todo-search-slice/generated/read-model-validation-report.json`, `read-model-validation-report.md`                                                                                                                              | `validation-pass`; 40 nodes / 59 edges / 20 checks.                                                                                                  |
| Todo App PBE Run structure-only Evidence | `examples/valid/todo-app-pbe-run/generated/generated-read-model.json`, `read-model-validation-report.json`, `read-model-evidence-manifest.json`                                                                                                   | `validation-pass`; 22 nodes / 38 edges / 16 checks; still `structure-only`.                                                                          |
| Aggregate validate-all summary           | `examples/read-model-aggregate/generated/read-model-aggregate-summary.json`, `read-model-aggregate-summary.md`                                                                                                                                    | `aggregate-pass`; positive registry includes Todo Search and Todo App PBE Run only.                                                                  |
| Slice registry                           | `examples/read-model-aggregate/read-model-slices.json`                                                                                                                                                                                            | Registry-backed local `validate --all` configured for the two positive profiles only.                                                                |
| Manual CI-backed Evidence                | Runs `28151296796`, `28156403793`, `28157938343`, `28210541509`                                                                                                                                                                                   | Reviewed as `ci-evidence-pass`; latest workflow uses registry-backed `validate --all`.                                                               |
| PR informational Evidence                | PR #1 run `28207822252`, PR #2 run `28210904900`, PR #3 run `28213236499`                                                                                                                                                                         | Three real PR informational observations reviewed as `ci-evidence-pass`.                                                                             |
| PR path-filter and failure policy        | `pr-informational-observation-policy.md`, `pr-informational-observation-log.md`, `pr-informational-path-filter-refinement.md`                                                                                                                     | Run-count threshold satisfied; recommendation is no workflow change for now.                                                                         |
| Negative validation robustness           | `examples/invalid/read-model-invalid-view-scoped-tags`, `examples/invalid/read-model-core-view-missing`, `examples/invalid/read-model-pilot-marker-missing`; inline/temp structure-only policy conflict test coverage                             | Local focused test coverage only; not included in positive registry, validate-all aggregate, or CI.                                                  |
| Invalid fixture CI policy                | `read-model-invalid-fixture-ci-policy.md`                                                                                                                                                                                                         | Recommends local-only invalid fixtures for now.                                                                                                      |
| Source transition and rollback policy    | `source-transition-path.md`, `rollback-compatibility-strategy.md`, `graph-source-promotion-readiness-review.md`                                                                                                                                   | Concept policies exist; limited Todo Search source authority expansion is now executed, while repo-wide expansion is not approved.                   |
| Source-authority expansion design        | `source-authority-expansion-design-package.md`                                                                                                                                                                                                    | Authority matrix and staged expansion path are documented; limited Todo Search promotion is executed, while broader promotion remains separate.      |
| Source-authority rollback/fallback plan  | `source-authority-rollback-fallback-plan.md`                                                                                                                                                                                                      | Concrete fallback precedence, triggers, actions, snapshots, and retirement guardrails are documented and active for the limited promotion.           |
| Compatibility/public-doc caveats         | `legacy-compatibility-map.md`, `source-transition-path.md`, `open-questions.md`, `public-doc-cleanup-waiver-decision-package.md`, `public-doc-cleanup-implementation-plan.md`, Batch A/B/C public-doc cleanup, Batch D review                     | Batch A/B/C are implemented as review candidates; Batch D is reviewed and implemented only where needed; waiver/promotion approval remains separate. |

## Readiness Summary By Category

| Category                                      | Readiness input state                                                                                                                                                                                                                          | Review interpretation                                                                                                         |
| --------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| 1. Todo Search bounded pilot readiness        | Strong for the selected slice: scoped pilot executed, generated, parity-backed, validator-backed, and CI-backed.                                                                                                                               | Ready as bounded pilot Evidence, not as repository-wide source authority.                                                     |
| 2. Multi-slice positive validation readiness  | Local `validate --all` and CI workflow cover Todo Search plus Todo App PBE Run through the positive registry and aggregate summary.                                                                                                            | Useful broader-readiness input, but Todo App remains `structure-only`.                                                        |
| 3. CI-backed repeatability readiness          | Manual and PR informational workflows are reviewed after registry-backed validate-all switch.                                                                                                                                                  | Repeatability Evidence is mature enough for review input, not for enforcement by itself.                                      |
| 4. PR informational observation readiness     | Three PR informational runs reviewed successfully; path-filter/failure-semantics refinement recommends no change for now.                                                                                                                      | Initial observation threshold satisfied; continued observation remains safe.                                                  |
| 5. Negative validation robustness readiness   | Durable local invalid fixtures and inline/temp policy conflict coverage exist.                                                                                                                                                                 | Good local robustness signal; not CI-backed under current policy.                                                             |
| 6. Rollback/fallback readiness                | Rollback and compatibility concepts are documented, scoped pilot retains tree-native fallback, and a concrete docs-only fallback plan now covers the candidate broader matrix.                                                                 | Reviewable plan exists, but rollback implementation, artifact snapshot mechanics, and approval remain pending.                |
| 7. Public-doc cleanup / compatibility wording | Batch A corrected the strongest source-of-truth matrix authority ambiguity; Batch B reframed task-card shorthand docs; Batch C reframed examples, usage, traceability, and audit wording; Batch D reviewed file-format and agent instructions. | Cleanup preparation is around the 90% review threshold, but waiver, promotion, and source-authority approval remain separate. |
| 8. Source-authority expansion readiness       | Evidence inputs are stronger than earlier phases, the authority matrix exists, and rollback/fallback planning is explicit. User approval has been applied to the limited Todo Search branch only.                                              | Inputs supported limited execution; repo-wide Graph-source promotion is not approved or ready for execution.                  |

Recommended status after limited execution:

```text
promotion-review-inputs-consumed-for-limited-execution
```

This means the Evidence stack was coherent enough to support the limited Todo Search execution branch. It does not mean
repo-wide `promotion-ready`, repo-wide `promotion-approved`, tree-native retirement, or enforcement approval.

The follow-on user decision surface is now recorded in
[broader-graph-source-promotion-decision-package.md](broader-graph-source-promotion-decision-package.md). That package
uses these review inputs together with the public-doc cleanup status, source-authority expansion design, and
rollback/fallback plan. Its readiness label is
`promotion-decision-package-ready / preparation-complete-with-user-decision-required`; it still does not execute
repo-wide promotion. The limited execution is recorded separately in
[broader-graph-source-promotion-execution-record.md](broader-graph-source-promotion-execution-record.md).

## Remaining Blockers And Caveats Before Actual Full Promotion

The following remain unresolved before any repo-wide Graph-source promotion decision:

| Caveat / blocker                          | Why it matters                                                                                                                                                                                                                              |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Public-doc cleanup or explicit waiver     | Batch A/B/C cleanup removed the strongest source-of-truth matrix, task-card shorthand, examples, usage, traceability, and audit wording ambiguities; Batch D is reviewed and implemented only where needed; waiver approval remains undone. |
| Source authority expansion plan           | The limited Todo Search scope is executed. Any broader scope still needs exact approval scope and retirement rules.                                                                                                                         |
| Rollback/fallback decision                | A concrete fallback plan now exists and is active for the limited scope, but rollback command execution, snapshot tooling, and broader recovery mechanics remain unimplemented.                                                             |
| Enforcement / required-check policy       | CI Evidence is non-enforcing. Required checks and branch protection need separate user approval if desired.                                                                                                                                 |
| Todo App PBE Run remains `structure-only` | It is a second positive structural fixture, not parity-backed, pilot-marker-backed, or source-authority-bearing.                                                                                                                            |
| Invalid fixtures remain local-only        | Negative robustness is locally tested but not CI-backed under current policy.                                                                                                                                                               |
| Compatibility term retirement             | Which compatibility terms and artifacts survive post-promotion remains a separate decision.                                                                                                                                                 |
| Repo-wide transition/migration plan       | No repository-wide source transition or migration implementation exists.                                                                                                                                                                    |
| User approval                             | Only the user can approve source authority change, artifact retirement, enforcement, or full promotion.                                                                                                                                     |

## Explicit Next Decision Surfaces

Possible next steps are separate choices:

| Decision surface                    | Meaning                                                                                                                                                                                                            |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Continue observation                | Keep the scoped pilot, manual CI, PR informational workflow, local negative fixtures, and current path filters unchanged.                                                                                          |
| Public-doc cleanup preparation      | Review Batch A/B/C/D cleanup results and decide whether public-doc cleanup is sufficient for a broader promotion decision or whether an explicit waiver is still required.                                         |
| Source authority expansion design   | Review the candidate authority matrix and concrete fallback plan before any promotion package.                                                                                                                     |
| Rollback/fallback plan review       | Decide whether the fallback precedence, triggers, actions, and snapshot requirements are sufficient for a broader promotion package.                                                                               |
| Enforcement / required-check design | Decide whether CI-backed read-model Evidence should ever become required, and under what warning/waiver semantics.                                                                                                 |
| Broader promotion decision package  | Prepared in [broader-graph-source-promotion-decision-package.md](broader-graph-source-promotion-decision-package.md); user must choose approve, observe, revise, defer/rollback, or design enforcement separately. |
| Defer or rollback scoped pilot      | If retained warnings become unacceptable, decide whether to keep observing, defer, or roll back the bounded Todo Search pilot.                                                                                     |
| Invalid-fixture CI mode             | Separately decide whether expected-blocking invalid fixture checks should run in manual or PR CI without polluting positive aggregate CI.                                                                          |

## Non-Scope

This package does not:

- approve repo-wide Graph-source promotion
- expand source authority beyond the executed limited scope
- retire tree-native artifacts
- change workflow, code, CLI, tests, or generated artifacts
- create a PR or dispatch GitHub Actions
- add required checks, branch protection, or CI enforcement
- approve public-doc cleanup as a waiver, source authority change, or promotion decision
- add invalid fixtures to CI or the positive registry
- promote Todo App PBE Run beyond `structure-only`
- replace user acceptance authority
