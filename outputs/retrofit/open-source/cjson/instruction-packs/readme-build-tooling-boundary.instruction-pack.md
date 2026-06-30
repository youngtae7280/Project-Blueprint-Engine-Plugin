# Retrofit Instruction Pack

Status: generated-from-graph-source

Record: change.cjson-readme-build-tooling-boundary

## User Intent

Use cJSON as the first open-source retrofit dogfood target and apply only a local README build/test documentation clarification.

## Allowed Files

- `README.md`

## Forbidden Flows

- cJSON.c parser/printer behavior: The first open-source dogfood candidate must not change core library behavior.
- cJSON.h public API or ABI: No maintainer-approved API change exists.
- CMakeLists.txt / Makefile build behavior: No local C toolchain is available to verify build-system changes.
- tests/\* behavior: No behavior change is planned; tests should not be edited to mask uncertainty.

## Graph Edge Intent

- `edge.doc-candidate-drives-planned-record` [change-driver, doc-only]: The local dogfood change only clarifies README build/test boundaries unless a later record opens implementation scope.
- `edge.planned-record-guards-behavior` [non-goal, safety-boundary]: The first open-source dogfood must not touch source, headers, build scripts, tests, public API, or parser/printer behavior.

## Verification

- Build: not-run
- Runtime/UI: not-applicable
- Hardware: not-applicable

## Boundary

- This pack does not apply changes by itself.
- External project modification requires explicit user approval.
