# Retrofit Instruction Pack

Status: generated-from-graph-source

Record: change.todo-vue-readme-local-command-boundary

## User Intent

Use an actual mdn/todo-vue clone as a real external operation-chain dogfood and apply only a local README clarification about using dev/build commands after dependency installation.

## Allowed Files

- `README.md`

## Forbidden Flows

- Vue runtime behavior: The selected dogfood is README-only and has no Product/AC approval for behavior changes.
- package scripts or dependency versions: The README guidance should align with existing scripts, not change tooling.
- upstream contribution flow: No maintainer review or upstream PR is part of this local operation-chain dogfood.

## Graph Edge Intent

- `edge.readme-drives-local-command-record` [change-driver, doc-only]: The selected local change can clarify README command flow while preserving source behavior and upstream boundaries.
- `edge.local-command-record-guards-upstream` [non-goal, upstream-boundary]: The local dogfood change must not become upstream approval, source-authority expansion, package-script change, or behavior change.

## Verification

- Build: fail
- Runtime/UI: not-applicable
- Hardware: not-applicable

## Boundary

- This pack does not apply changes by itself.
- External project modification requires explicit user approval.
