# CI-Backed Read-Model Evidence Run Review

Status: ci-backed-read-model-evidence-run-review / blocked-awaiting-manual-workflow-run / no-ci-run-evidence-recorded

## Review Purpose

This document records the first attempt to run and review the non-enforcing GitHub Actions workflow for Todo Search
read-model Evidence:

```text
PBE Read-Model Evidence
```

The purpose is to verify whether a real CI-backed Evidence run exists, whether its uploaded artifact bundle can be
reviewed, and whether its CI manifest preserves the source-authority and non-promotion boundaries.

No real CI-backed Evidence run was created or reviewed in this attempt because the local GitHub CLI was not
authenticated. This document therefore records a blocker and the exact manual run instructions rather than inventing CI
Evidence.

## Boundary

This review is non-enforcing CI Evidence review only.

It does not:

- add branch protection
- create or require a PR check
- add PR or push triggers
- introduce CI enforcement
- change source authority
- expand the pilot scope beyond `examples/adoption/todo-search-slice`
- approve full Graph-source promotion
- perform public-doc cleanup
- retire tree-native artifacts
- hide retained warnings
- treat a future CI pass as user approval

## Intended Workflow Run

| Field             | Intended value                              |
| ----------------- | ------------------------------------------- |
| Workflow file     | `.github/workflows/read-model-evidence.yml` |
| Workflow name     | `PBE Read-Model Evidence`                   |
| Target ref        | `main`                                      |
| Trigger mode      | `workflow_dispatch`                         |
| Expected artifact | `pbe-todo-search-read-model-evidence`       |
| Scope             | `examples/adoption/todo-search-slice`       |

## Execution Attempt

Attempted command:

```bash
gh workflow run read-model-evidence.yml --ref main
```

Observed result:

```text
To get started with GitHub CLI, please run:  gh auth login
Alternatively, populate the GH_TOKEN environment variable with a GitHub API authentication token.
```

Authentication check:

```bash
gh auth status
```

Observed result:

```text
You are not logged into any GitHub hosts. To log in, run: gh auth login
```

Run identity:

```text
not available
```

Run URL:

```text
not available
```

Run status / conclusion:

```text
not available
```

## Artifact Review Result

No uploaded GitHub Actions artifact was available for review in this worker context.

Expected artifact name:

```text
pbe-todo-search-read-model-evidence
```

Expected files after a successful manual CI run:

- `generated-read-model.json`
- `generated-read-model.md`
- `read-model-evidence-manifest.json`
- `read-model-parity-report.json`
- `read-model-parity-report.md`
- `read-model-validation-report.json`
- `read-model-validation-report.md`
- `read-model-ci-evidence-manifest.json`
- `scoped-source-authority-pilot-marker.json`

Because no run was created, none of these files can be counted as reviewed CI-backed artifact Evidence by this record.
The committed local/generated artifacts remain local and validator-backed Evidence, not reviewed CI-backed Evidence.

## CI Manifest Review Result

No `read-model-ci-evidence-manifest.json` from GitHub Actions was available for review.

Expected manifest checks after a successful manual CI run:

| Manifest field                  | Expected value / condition                     | Current review status |
| ------------------------------- | ---------------------------------------------- | --------------------- |
| `evidenceLevel`                 | `ci-backed`                                    | not reviewed          |
| `status`                        | `ci-evidence-pass` if workflow succeeds        | not reviewed          |
| `sourceSlice`                   | `examples/adoption/todo-search-slice`          | not reviewed          |
| `validatorStatus`               | `validation-pass`                              | not reviewed          |
| `parityStatus`                  | `comparison-pass`                              | not reviewed          |
| `retainedWarningsRemainVisible` | `true`                                         | not reviewed          |
| `sourceAuthorityBoundary`       | present and Todo Search scoped                 | not reviewed          |
| `nonPromotionStatement`         | present; no full promotion or source authority | not reviewed          |

## Manual Run Instructions

An authenticated maintainer can run the workflow manually with:

```bash
gh auth login
gh workflow run read-model-evidence.yml --ref main
gh run list --workflow read-model-evidence.yml --limit 5
gh run watch <run-id>
gh run view <run-id> --json databaseId,status,conclusion,event,headBranch,headSha,url
gh run download <run-id> --name pbe-todo-search-read-model-evidence --dir .tmp/read-model-evidence-run
```

After downloading the artifact, inspect:

```bash
node -e "const fs=require('fs'); const j=JSON.parse(fs.readFileSync('.tmp/read-model-evidence-run/read-model-ci-evidence-manifest.json','utf8')); console.log(JSON.stringify({evidenceLevel:j.evidenceLevel,status:j.status,sourceSlice:j.sourceSlice,validatorStatus:j.validatorStatus,parityStatus:j.parityStatus,retainedWarningsRemainVisible:j.retainedWarningsRemainVisible}, null, 2));"
```

Expected successful review shape:

```json
{
  "evidenceLevel": "ci-backed",
  "status": "ci-evidence-pass",
  "sourceSlice": "examples/adoption/todo-search-slice",
  "validatorStatus": "validation-pass",
  "parityStatus": "comparison-pass",
  "retainedWarningsRemainVisible": true
}
```

## Retained Warnings

The retained warnings remain active and visible:

- bounded fixture Evidence is not full Todo app implementation
- partial UI screenshot/manual visual Evidence remains partial
- ACEP task-card public-doc cleanup remains deferred
- PR/push triggers and CI enforcement remain unapproved
- actual GitHub CI-backed artifact review is blocked until an authenticated manual workflow run is completed

## Source Authority Boundary

Tree-native selected-slice artifacts remain current operational source.

The manual workflow, when run, can produce CI-backed Evidence. It does not by itself change source authority, approve
full Graph-source promotion, retire tree-native artifacts, replace user acceptance, add branch protection, or make the
workflow a required check.

## Next Decision Surface

The next step should be one of:

1. `Run manual workflow with authenticated GitHub CLI or GitHub UI and review artifact`
2. `Provide a CI run id / artifact bundle for review`
3. `Keep workflow manual/non-enforcing and observe locally`
4. `Design PR informational trigger only after a reviewed manual run`
5. `Defer CI-backed Evidence run review`

Recommended next step:

```text
Run manual workflow with authenticated GitHub CLI or GitHub UI and review artifact.
```

## Gate Self-Check

| Gate                             | Status  | Result                                                                 |
| -------------------------------- | ------- | ---------------------------------------------------------------------- |
| Manual Workflow Run Gate         | blocked | `gh` is installed but unauthenticated; no workflow run was dispatched. |
| CI-Backed Artifact Review Gate   | blocked | No uploaded artifact was available for review.                         |
| Non-Enforcing CI Gate            | pass    | The intended workflow remains manual and informational only.           |
| Non-Required-Check Gate          | pass    | No required check or branch protection was added.                      |
| Source Authority Boundary Gate   | pass    | Source authority remains unchanged.                                    |
| Non-Full-Promotion Gate          | pass    | No full Graph-source promotion is recorded.                            |
| Scope Containment Gate           | pass    | Scope remains Todo Search selected slice only.                         |
| Retained Warning Visibility Gate | pass    | Warnings remain documented.                                            |
| User Approval Boundary Gate      | pass    | No CI pass is treated as user approval.                                |
| Evidence Honesty Gate            | pass    | No unavailable CI run or artifact is treated as Evidence.              |

## Final Statement

This record does not prove CI-backed Evidence exists. It records that the worker could not dispatch the workflow because
GitHub CLI authentication was unavailable, and it preserves the manual run instructions needed to produce reviewable
CI-backed Evidence later.
