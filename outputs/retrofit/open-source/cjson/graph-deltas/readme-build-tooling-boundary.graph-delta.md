# Retrofit Graph Delta

Status: generated-from-target-diff

Record: change.cjson-readme-build-tooling-boundary

## Changed Files

| File      | Additions | Deletions |
| --------- | --------: | --------: |
| README.md |         5 |         0 |

## Related Graph Context

- `surface.readme-build-docs` (documentation-surface): README.md explains the copy-source, CMake, Makefile, and package-manager build paths.
- `boundary.no-behavior-change` (forbidden-flow-boundary): The first open-source dogfood candidate must not change parser behavior, public API, build behavior, or tests.
- `change.cjson-readme-build-tooling-boundary` (retrofit-change-record): A local README-only dogfood change clarifies build/test tooling boundaries without changing source behavior.

## Edge Intent

- `edge.doc-candidate-drives-planned-record` [change-driver, doc-only]: The local dogfood change only clarifies README build/test boundaries unless a later record opens implementation scope.
- `edge.planned-record-guards-behavior` [non-goal, safety-boundary]: The first open-source dogfood must not touch source, headers, build scripts, tests, public API, or parser/printer behavior.

## Boundaries

- Applies patch: False
- Upstream PR created: False
- Maintainer intent claimed: False
