# PR Informational Read-Model Evidence Design

Status: pr-informational-read-model-evidence-design / design-only / workflow-not-changed

## Purpose

This document designs a future pull request informational mode for read-model Evidence.

The current implemented workflow remains manual only:

```text
.github/workflows/read-model-evidence.yml
trigger: workflow_dispatch
```

The design purpose is to decide how a future `pull_request` trigger could provide visible read-model Evidence status on
PRs without making the workflow a required check, branch protection rule, source-authority expansion, or promotion gate.

This document is design only. It does not modify `.github/workflows/read-model-evidence.yml`, does not add a PR trigger,
does not introduce CI enforcement, does not implement `validate --all`, does not expand source authority, and does not
approve full Graph-source promotion.

## Current Baseline

| Baseline item                | Current state                                                                                          |
| ---------------------------- | ------------------------------------------------------------------------------------------------------ |
| Workflow                     | `PBE Read-Model Evidence`                                                                              |
| Implemented trigger          | `workflow_dispatch` only                                                                               |
| Latest reviewed manual run   | `28157938343`                                                                                          |
| Latest run status            | `success` / `ci-evidence-pass`                                                                         |
| Todo Search profile          | `todo-search-selected-slice`, `pilot-marker-backed`                                                    |
| Todo Search generated output | 40 nodes / 59 edges                                                                                    |
| Todo Search parity           | `comparison-pass`, 0 blocking, 0 decision-required                                                     |
| Todo Search validation       | `validation-pass`, 20 checks                                                                           |
| Todo App PBE Run profile     | `todo-app-pbe-run-structure-only`, `structure-only`                                                    |
| Todo App generated output    | 22 nodes / 38 edges                                                                                    |
| Todo App validation          | `validation-pass`, 16 checks                                                                           |
| Aggregate summary            | `aggregate-pass`, 2 slices, 0 warning / 0 blocking / 0 decision-required                               |
| Workflow runtime             | Node 24 action/runtime settings reviewed in run `28157938343`                                          |
| Authority boundary           | CI-backed Evidence is Evidence only; no source authority expansion, enforcement, or promotion approval |

## Mode Comparison

| Mode                                     | Trigger                | Purpose                                                | Current status | Enforcement boundary                                                |
| ---------------------------------------- | ---------------------- | ------------------------------------------------------ | -------------- | ------------------------------------------------------------------- |
| Manual CI-backed Evidence                | `workflow_dispatch`    | Reviewer-requested Evidence run tied to a known commit | implemented    | Non-enforcing; not a required check or user approval.               |
| PR informational read-model Evidence     | `pull_request`         | Visible PR signal for read-model Evidence drift        | design-only    | Informational only unless enforcement is separately approved later. |
| PR required check / branch protection    | required PR check      | Merge-blocking policy                                  | future-only    | Requires separate explicit user approval and warning/waiver policy. |
| Push or scheduled post-merge observation | `push` or `schedule`   | Main branch audit trail or drift observation           | future-only    | Evidence only unless separately approved as enforcement.            |
| Repo-wide promotion readiness validation | later validator policy | Full promotion review support                          | future-only    | Cannot approve source promotion without explicit user decision.     |

## Proposed PR Informational Trigger

Future candidate trigger:

```yaml
on:
  pull_request:
    paths:
      - '.github/workflows/read-model-evidence.yml'
      - 'cli/src/**'
      - 'scripts/**'
      - 'examples/adoption/todo-search-slice/**'
      - 'examples/valid/todo-app-pbe-run/**'
      - 'examples/read-model-aggregate/**'
      - 'docs/concept/**'
```

This is a candidate only. It is not implemented by this document.

### Trigger Scope Tradeoff

| Path candidate                              | Why include it                                                   | Noise risk                                                    | Drift risk if excluded                                        | Recommendation                                                   |
| ------------------------------------------- | ---------------------------------------------------------------- | ------------------------------------------------------------- | ------------------------------------------------------------- | ---------------------------------------------------------------- |
| `.github/workflows/read-model-evidence.yml` | Workflow changes directly affect CI-backed Evidence.             | Low.                                                          | High: workflow changes could break Evidence runs silently.    | Include.                                                         |
| `cli/src/**`                                | Read-model generate/compare/validate/summarize code lives here.  | Medium if unrelated CLI internals change.                     | High: graph Evidence behavior can drift.                      | Include.                                                         |
| `scripts/**`                                | PBE validation and support validators can affect Evidence trust. | Medium/high because many scripts are not read-model-specific. | Medium: validator/root behavior can affect reported Evidence. | Include initially; revisit if noisy.                             |
| `examples/adoption/todo-search-slice/**`    | Primary pilot-backed slice and manual parity source.             | Low/medium.                                                   | High: primary Evidence inputs could drift.                    | Include.                                                         |
| `examples/valid/todo-app-pbe-run/**`        | Second structure-only profile input/output.                      | Low/medium.                                                   | Medium/high: second slice aggregate status could drift.       | Include.                                                         |
| `examples/read-model-aggregate/**`          | Aggregate summary output contract and committed artifact.        | Low.                                                          | Medium: aggregate output/contract changes could drift.        | Include.                                                         |
| `docs/concept/**`                           | Source-boundary and policy docs define Evidence semantics.       | High for unrelated concept edits.                             | Medium: boundary wording can drift without signal.            | Include in first informational design; consider narrowing later. |

Recommended first PR informational path policy:

```text
Use the path set above for an initial informational design, then review noise after several PRs before considering
required checks or narrower paths.
```

Reasoning:

- The first PR mode should prefer catching read-model Evidence drift over minimizing every informational run.
- Because it is non-enforcing, occasional extra runs are acceptable.
- If concept-doc changes become too noisy, later refinement can split doc-only status summaries from full generated
  Evidence runs.

## Future Command Sequence

The future PR informational mode should reuse the current aggregate-enabled command sequence:

```text
npm run build:cli
node dist/cli/index.js graph read-model generate --slice examples/adoption/todo-search-slice --json
node dist/cli/index.js graph read-model compare --generated examples/adoption/todo-search-slice/generated/generated-read-model.json --manual examples/adoption/todo-search-slice/maintainability-graph-read-model.json --json
node dist/cli/index.js graph read-model validate --slice examples/adoption/todo-search-slice --json
node dist/cli/index.js graph read-model generate --slice examples/valid/todo-app-pbe-run --json
node dist/cli/index.js graph read-model validate --slice examples/valid/todo-app-pbe-run --json
node dist/cli/index.js graph read-model summarize --slices examples/adoption/todo-search-slice,examples/valid/todo-app-pbe-run --json
npx vitest run cli/src/__tests__/read-model-evidence.test.ts
npx vitest run examples/adoption/todo-search-slice/runtime-fixture
npm run validate:pbe
npm run validate:pbe:v2
```

It should not run `validate --all`, should not regenerate source/manual parity artifacts outside the declared output
directories, and should not mutate PR source files.

## Artifact And Manifest Policy

The future PR informational run can reuse the current artifact bundle name or use a PR-specific name.

Recommended artifact name:

```text
pbe-read-model-evidence-pr-informational
```

Required artifact content should match the current manual bundle:

- Todo Search generated read-model JSON/Markdown
- Todo Search parity report JSON/Markdown
- Todo Search validation report JSON/Markdown
- Todo Search CI/PR evidence manifest
- Todo Search scoped pilot marker
- Todo App PBE Run generated read-model JSON/Markdown
- Todo App PBE Run validation report JSON/Markdown
- aggregate summary JSON/Markdown

Future PR manifest fields:

| Field group         | Candidate fields                                                                                   |
| ------------------- | -------------------------------------------------------------------------------------------------- |
| Trigger identity    | `triggerMode: pull_request-informational`, workflow name, run id, run attempt, source ref.         |
| PR identity         | PR number, head SHA, base SHA, head ref, base ref, repository owner/name.                          |
| Included slices     | Todo Search and Todo App PBE Run paths.                                                            |
| Todo Search status  | validator status, parity status, check count, node count, edge count.                              |
| Todo App status     | validator status, parity `not-required`, check count, node count, edge count.                      |
| Aggregate status    | aggregate status, included slice count, warning/blocking/decision-required counts.                 |
| Boundary statements | non-enforcement statement, non-promotion statement, source authority boundary, user approval note. |
| Retained warnings   | retained warnings remain visible, public-doc cleanup deferred, PR mode is not acceptance.          |
| Artifact references | generated/parity/validation/aggregate paths.                                                       |

The manifest should not claim source authority, approval, promotion readiness approval, or branch-protection status.

## Step Summary Candidate

Future PR step summary wording:

```text
# PBE Read-Model Evidence - PR Informational

- Trigger mode: pull_request-informational
- PR: <number>
- Head SHA: <head>
- Base SHA: <base>
- Todo Search: validation-pass / comparison-pass
- Todo App PBE Run: validation-pass / parity not-required
- Aggregate: aggregate-pass
- Boundary: informational Evidence only.
- Not a required check, branch protection rule, source authority change, user acceptance, or Graph-source promotion.
- Retained warnings remain visible in generated reports.
```

If status is warning, blocked, or decision-required, the summary should name the originating slice and the report path.

## Failure Semantics

PR informational mode has a subtle UI risk: a failed GitHub job appears red in the PR even when the workflow is not a
required check.

Candidate semantics:

| Strategy                                                       | Pros                                                                         | Cons                                                                                     |
| -------------------------------------------------------------- | ---------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| Fail job for any Evidence warning/blocking/decision-required   | Very visible; hard to miss.                                                  | Looks enforcement-like; can pressure merges even without branch protection.              |
| Always succeed job and report all Evidence statuses in summary | Clearly non-enforcing; avoids PR red status for reviewable warnings.         | Real command failures could be hidden if not separated carefully.                        |
| Fail only on command/runtime/artifact integrity failure        | Separates CI health from Evidence judgment; keeps PR warnings informational. | Requires clear summary/status labels so warning/decision-required states are not missed. |

Recommended first PR informational semantics:

```text
Fail the job only for real command/runtime/artifact integrity failures.
Keep Evidence statuses such as aggregate-warning, decision-required, or retained warnings visible in the manifest and
step summary without treating them as merge enforcement.
```

Details:

- Command failure, missing required output, malformed JSON, or validator process error should fail the job.
- `validation-blocked`, `aggregate-blocked`, or `decision-required` should be made highly visible in the summary.
- Whether those Evidence statuses should fail the job is a later enforcement-policy decision.
- Retained warnings should never be hidden to make PR status green.
- CI pass or PR informational pass is not user acceptance and does not change source authority.

## Relationship To Gates

| Gate / boundary        | PR informational relationship                                                                  |
| ---------------------- | ---------------------------------------------------------------------------------------------- |
| Evidence gate          | Adds a visible PR signal, but does not replace manual run review or user judgment.             |
| Authority gate         | No source authority expansion. Todo Search remains the only scoped pilot.                      |
| Rollback/fallback gate | Can surface missing fallback references, but does not execute rollback or retire artifacts.    |
| Compatibility gate     | Carries public-doc cleanup and compatibility warnings; does not resolve them.                  |
| Approval gate          | CI/PR pass is Evidence only and cannot approve acceptance or promotion.                        |
| Enforcement gate       | Not introduced. Required checks and branch protection require separate explicit user approval. |

## Explicit Non-Scope

This design does not:

- modify `.github/workflows/read-model-evidence.yml`
- add `pull_request`, `push`, or `schedule` triggers
- add a required check, branch protection rule, or enforcement mode
- implement `validate --all`
- expand source authority
- make Todo App PBE Run parity-backed, pilot-marker-backed, CI-backed, or authority-bearing
- approve full Graph-source promotion
- perform public-doc cleanup
- retire tree-native or `.pbe` artifacts
- make CI pass equivalent to user acceptance

## Recommended Next Decision Surface

After this design, the next choices are:

1. `Keep workflow manual-only and observe`
2. `Approve PR informational workflow implementation`
3. `Refine PR path filters before implementation`
4. `Design CI enforcement / required check policy`
5. `Require public-doc cleanup before broader CI changes`
6. `Defer PR-trigger work`

Recommended next step:

```text
Approve PR informational workflow implementation only if the user wants PR-visible Evidence now. Otherwise keep the
workflow manual-only and observe.
```

The first implementation, if approved later, should add `pull_request` as informational only and use the recommended
path filters and failure semantics above. It should not make the check required.

## Gate Self-Check

| Gate                              | Result | Notes                                                                         |
| --------------------------------- | ------ | ----------------------------------------------------------------------------- |
| Design-Only Gate                  | PASS   | No workflow or code change is made by this document.                          |
| Manual Workflow Preservation Gate | PASS   | Current implemented workflow remains `workflow_dispatch` only.                |
| PR Informational Boundary Gate    | PASS   | Future PR mode is explicitly non-enforcing and not branch protection.         |
| Source Authority Boundary Gate    | PASS   | No source authority expansion or Todo App promotion level change is proposed. |
| Non-Full-Promotion Gate           | PASS   | Full Graph-source promotion remains separate and unapproved.                  |
| Artifact / Manifest Clarity Gate  | PASS   | Candidate PR manifest fields and artifact bundle are defined.                 |
| Failure Semantics Honesty Gate    | PASS   | Real command failures and Evidence judgment statuses are separated.           |
| Retained Warning Visibility Gate  | PASS   | Warnings remain visible and are not hidden behind PR green status.            |
| User Approval Boundary Gate       | PASS   | PR informational pass cannot replace user acceptance or promotion approval.   |

## Final Statement

PR informational read-model Evidence is a possible next CI visibility layer, not an enforcement layer. This design keeps
the current workflow manual-only until a later explicit implementation decision, and it preserves source authority,
promotion, public-doc cleanup, and user acceptance boundaries.
