# PBE State Machine

PBE gates must not be skipped.

## States

```text
IDLE
STARTED
RPD_DONE
WAITING_UI_UX_CONFIRM
UI_UX_APPROVED
WPD_DONE
VD_DONE
DEPENDENCY_IMPACT_AUDITED
WAITING_IMPLEMENTATION_SCOPE
SCOPE_SELECTED
WAITING_ARCHITECTURE_RUNWAY_CONFIRM
ARCHITECTURE_RUNWAY_APPROVED
PLAN_EXECUTED
COVERAGE_AUDITED
UX_AUDITED
ACEP_GENERATED
ACEP_RUN_DONE
WAITING_REVIEW_RESULT
PARTIAL_IMPLEMENTATION_DONE
WAITING_NEXT_SLICE_DECISION
SLICE_ACCEPTED
COMPLETED
BLOCKED
STOPPED
```

## Normal Flow

```text
IDLE
-> STARTED
-> RPD_DONE
-> WAITING_UI_UX_CONFIRM
-> UI_UX_APPROVED
-> WPD_DONE
-> VD_DONE
-> DEPENDENCY_IMPACT_AUDITED
-> WAITING_IMPLEMENTATION_SCOPE
-> SCOPE_SELECTED
-> WAITING_ARCHITECTURE_RUNWAY_CONFIRM
-> ARCHITECTURE_RUNWAY_APPROVED
-> PLAN_EXECUTED
-> COVERAGE_AUDITED
-> UX_AUDITED
-> ACEP_GENERATED
-> ACEP_RUN_DONE
-> WAITING_REVIEW_RESULT
-> PARTIAL_IMPLEMENTATION_DONE, when only the current slice is implemented
-> WAITING_NEXT_SLICE_DECISION
```

## Human Gates

`WAITING_UI_UX_CONFIRM` accepts:

- approve / continue -> `UI_UX_APPROVED`
- revise -> remain at gate
- ask -> remain at gate
- stop -> `STOPPED`

`WAITING_IMPLEMENTATION_SCOPE` accepts:

- select_scope -> `SCOPE_SELECTED`
- select_full_scope -> `SCOPE_SELECTED`
- mark_deferred -> remain at gate
- ask_dependency_impact -> remain at gate
- stop -> `STOPPED`

`WAITING_ARCHITECTURE_RUNWAY_CONFIRM` accepts:

- approve / continue -> `ARCHITECTURE_RUNWAY_APPROVED`
- mark_foundation -> `ARCHITECTURE_RUNWAY_APPROVED`
- revise -> remain at gate
- stop -> `STOPPED`

`WAITING_REVIEW_RESULT` accepts:

- approve / continue -> `WAITING_NEXT_SLICE_DECISION`
- revise -> bounded revision flow
- ask -> remain at gate
- stop -> `STOPPED`

`WAITING_NEXT_SLICE_DECISION` accepts:

- complete_current_slice -> `SLICE_ACCEPTED`
- start_next_slice -> `WAITING_IMPLEMENTATION_SCOPE`
- complete_project -> `COMPLETED`
- revise -> bounded revision flow
- stop -> `STOPPED`

## Rules

- Architecture runway gate cannot pass without approval when Required Foundation, Blocking Dependency, or High-Impact Future Module exists.
- `COMPLETED` is used only for whole-project completion.
- Slice completion uses `SLICE_ACCEPTED` or `WAITING_NEXT_SLICE_DECISION`.
- `accepted` may exist as a delivery status, but only the user can set it and it must include explicit acceptance metadata.
- Any automatic step failure moves to `BLOCKED` and stops downstream progress.
