# Native Instruction Pack

Status: generated-from-graph-source

Record: change.counter-step-two

## User Intent

Change the native counter demo behavior so the next value advances by two instead of one.

## Allowed Files

- `counter.ps1`
- `test-counter.ps1`

## Forbidden Flows

- README documentation-only update: This dogfood exists specifically to prove a tiny behavior change.
- new module or storage: The selected graph-source boundary only opens the counter function and matching test.

## Graph Edge Intent

- `edge.counter-change-guards-scope` [non-goal, safety-boundary]: The behavior dogfood must not add new modules, storage, UI, or unrelated test changes.
- `edge.counter-change-drives-function` [change-driver, behavior-change]: The selected graph record changes only the counter step implementation and matching runtime expectation.

## Verification

- Build: not-applicable
- Runtime/UI: pass
- Hardware: not-applicable

## Boundary

- This pack does not apply changes by itself.
- External project modification requires explicit user approval.
