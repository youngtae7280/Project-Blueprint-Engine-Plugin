# Retrofit Graph Delta

Status: generated-from-target-diff

Record: change.todo-vue-readme-local-command-boundary

## Changed Files

| File      | Additions | Deletions |
| --------- | --------: | --------: |
| README.md |         3 |         0 |

## Related Graph Context

- `surface.readme-getting-started` (documentation-surface): README.md explains install, development, build, lint, format, contribution, and license entry points.
- `boundary.no-source-behavior-change` (forbidden-flow-boundary): This external dogfood must not modify Vue source behavior, package scripts, dependency versions, tests, or upstream repository state.
- `change.todo-vue-readme-local-command-boundary` (retrofit-change-record): A local README-only dogfood change clarifies that dev server and production build commands are used after dependency installation.

## Edge Intent

- `edge.readme-drives-local-command-record` [change-driver, doc-only]: The selected local change can clarify README command flow while preserving source behavior and upstream boundaries.
- `edge.local-command-record-guards-upstream` [non-goal, upstream-boundary]: The local dogfood change must not become upstream approval, source-authority expansion, package-script change, or behavior change.

## Boundaries

- Applies patch: False
- Upstream PR created: False
- Maintainer intent claimed: False
