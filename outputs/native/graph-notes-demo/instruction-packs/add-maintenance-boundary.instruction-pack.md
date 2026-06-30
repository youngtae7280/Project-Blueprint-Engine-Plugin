# Native Instruction Pack

Status: generated-from-graph-source

Record: change.native-maintenance-boundary

## User Intent

Add a README maintenance boundary explaining that note changes should keep intent and status visible.

## Allowed Files

- `README.md`

## Forbidden Flows

- notes.json mutation: The first native dogfood should prove guidance-only graph operation before changing data.
- schema or code creation: The requested native proof is README-only and should remain minimal.

## Graph Edge Intent

- `edge.readme-drives-native-record` [change-driver, doc-only]: The selected native change may only clarify README maintenance guidance.
- `edge.native-record-guards-data` [non-goal, safety-boundary]: The native dogfood must not mutate notes.json or create behavior while proving the operation chain.

## Verification

- Build: not-applicable
- Runtime/UI: not-applicable
- Hardware: not-applicable

## Boundary

- This pack does not apply changes by itself.
- External project modification requires explicit user approval.
