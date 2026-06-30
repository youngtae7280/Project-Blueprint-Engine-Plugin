# Native Graph Delta

Status: generated-from-target-diff

Record: change.counter-step-two

## Changed Files

| File             | Additions | Deletions |
| ---------------- | --------: | --------: |
| counter.ps1      |         1 |         1 |
| test-counter.ps1 |         2 |         2 |

## Related Graph Context

- `module.counter-function` (code-module): counter.ps1 owns the counter step behavior.
- `boundary.counter-only` (forbidden-flow-boundary): The behavior dogfood may only change counter.ps1 and test-counter.ps1.
- `change.counter-step-two` (native-change-record): The selected behavior change updates the counter step from +1 to +2 and updates the local test.

## Edge Intent

- `edge.counter-change-guards-scope` [non-goal, safety-boundary]: The behavior dogfood must not add new modules, storage, UI, or unrelated test changes.
- `edge.counter-change-drives-function` [change-driver, behavior-change]: The selected graph record changes only the counter step implementation and matching runtime expectation.

## Boundaries

- Applies patch: False
- Upstream PR created: False
- Maintainer intent claimed: False
