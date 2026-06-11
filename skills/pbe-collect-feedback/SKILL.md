---
name: pbe-collect-feedback
description: Collect user review feedback and map it to Product, Project, Work, Test, Evidence, UI/UX, Cycle, and Change nodes before bounded revision planning.
---

# PBE Collect Feedback

Use this skill when the user says the result is not acceptable, asks for changes, or gives review feedback after `submitted_for_review`.

In Autoflow, this skill runs automatically when the user gives a revision request at the Review Result gate.

## Purpose

Turn user feedback into structured feedback items and Change Tree input that can drive bounded Impact/Reopen analysis and Revision Pack creation.

Feedback is not a license to reinterpret the whole project. It must be mapped to affected tree nodes or clarified before revision work starts.

## Inputs

Prefer v2 files when present:

```text
.pbe/tree/product-tree.json
.pbe/tree/project-tree.json
.pbe/tree/work-tree.json
.pbe/tree/test-tree.json
.pbe/execution/cycle-tree.json
.pbe/control/change-tree.json
.pbe/control/impact-tree.json
.pbe/control/acceptance-tree.json
.pbe/evidence/evidence-tree.json
```

Also read review and compatibility artifacts:

```text
.pbe/review/codex-final-report.md
.pbe/review/result-summary.md
.pbe/review/user-feedback.md
.pbe/review/feedback-items.json
.pbe/codex-execution-pack/execution-manifest.json
.pbe/codex-execution-pack/04-traceability-matrix.json
.pbe/codex-execution-pack/05-ui-ux-spec.json
```

## Outputs

```text
.pbe/review/user-feedback.md
.pbe/review/feedback-items.json
.pbe/control/change-tree.json
```

## Feedback Types

Use one of:

```text
bug
missing_requirement
misinterpreted_requirement
ux_mismatch
visual_mismatch
scope_gap
performance_issue
content_copy_issue
accessibility_issue
other
```

## Mapping Rules

Each feedback item should map to affected artifacts:

- `affectedProductNodeIds`
- `affectedProjectNodeIds`
- `affectedWorkNodeIds`
- `affectedTestNodeIds`
- `affectedEvidenceNodeIds`
- `affectedCycleIds`
- `affectedRequirementIds`
- `affectedTaskIds`
- `affectedUiUxIds`
- `affectedVerificationIds`
- `changeNodeIds`

If mapping is impossible, provide an explanation and ask at most one concise clarification question.

Do not reinterpret the entire project. Keep feedback scoped to the affected items.

## Change Node Classification

Create or update a Change Tree entry when feedback changes any of:

- product meaning
- selected/deferred/out-of-scope scope
- UI/UX flow, state, wording, or acceptance meaning
- risk profile
- acceptance criteria
- verification strategy
- already implemented, verified, evidenced, submitted, or accepted work

Use Change Tree types:

```text
missing_requirement
design_correction
implementation_constraint
test_gap
feedback
scope_change
risk_discovery
```

Set Change Tree status:

- `proposed` when Codex can map the issue but user approval may be needed later.
- `needs_human_decision` when the feedback has multiple product/scope meanings.
- `approved` only when the user explicitly approved the change direction.
- `blocked` when mapping cannot proceed safely.

## Ask User Only When

Ask one concise clarification question when feedback meaning is ambiguous or options change Product Tree scope, UX, acceptance, verification, or accepted work.

Do not ask when the feedback maps cleanly to an existing affected selected/foundation node and the desired outcome is clear.

## Autoflow

When feedback is mapped clearly:

- Set `pbe-state.json.autoflow.lastUserAction` to `revise`.
- Keep `autoflow.state` at `WAITING_REVIEW_RESULT` while revision is being prepared, or set `deliveryStatus` to `revision_requested`.
- Add or update downstream retry steps:
  - `create_revision_pack`
  - `run_revision`
  - `review_result`
- Continue automatically to `pbe-create-revision-pack`.

When mapping is unclear:

- Do not create revision tasks yet.
- Ask one concise clarification question.
- Keep the user at the Review Result gate.

## JSON Shape

```json
{
  "items": [
    {
      "id": "FB-001",
      "type": "ux_mismatch",
      "rawFeedback": "The screen feels too complicated.",
      "summary": "Simplify the default screen and move secondary inputs into an advanced section.",
      "affectedProductNodeIds": ["PT-UI-001"],
      "affectedProjectNodeIds": ["PJ-SURFACE-001"],
      "affectedWorkNodeIds": ["WT-UI-001"],
      "affectedTestNodeIds": ["TT-UI-001"],
      "affectedEvidenceNodeIds": ["EV-UI-001"],
      "affectedCycleIds": ["CYCLE-001"],
      "affectedRequirementIds": ["REQ-001"],
      "affectedTaskIds": ["TASK-001"],
      "affectedUiUxIds": ["SCREEN-001"],
      "affectedVerificationIds": ["TEST-001-UX"],
      "changeNodeIds": ["CH-001"],
      "requiresChangeNode": true,
      "severity": "medium",
      "needsClarification": false,
      "clarificationQuestions": [],
      "desiredOutcome": "Show only essential fields by default.",
      "status": "open"
    }
  ]
}
```

## Completion Report

Report with `[PBE 상태 보고]` first, following `templates/stage-completion-status-card-template.md`.

The state card must say whether feedback mapping is clear enough to continue automatically to Impact/Reopen and Revision Pack creation, or whether a clarification question is required.

Include:

- feedback item count
- affected Product/Project/Work/Test/Evidence/Cycle nodes
- Change Tree entries created or updated
- affected compatibility requirement/task/UI/verification IDs
- clarification questions if needed
- next step: create revision pack, automatically when scope is clear
- recommended reply when clarification is needed

Use `[Codex 메모]` only for short mapping rationale.
