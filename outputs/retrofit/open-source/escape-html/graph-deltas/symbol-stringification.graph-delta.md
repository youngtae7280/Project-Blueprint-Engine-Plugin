# Retrofit Graph Delta

Status: generated-from-target-diff

Record: change.escape-html-symbol-stringification

## Changed Files

| File          | Additions | Deletions |
| ------------- | --------: | --------: |
| index.js      |         1 |         1 |
| test/index.js |         6 |         0 |

## Related Graph Context

- `module.escape-html-function` (module): index.js owns input coercion and escaping for the exported escapeHtml function.
- `boundary.no-escape-rule-change` (forbidden-flow-boundary): This dogfood must not change which characters are escaped or how existing inputs are escaped.
- `change.escape-html-symbol-stringification` (retrofit-change-record): A local behavior dogfood changes input coercion from string concatenation to explicit String(value) so Symbol inputs stringify instead of throwing.

## Edge Intent

- `edge.symbol-change-extends-coercion` [behavior-change, stringification]: Replacing concatenation coercion with String(value) is the narrow code path that supports Symbol input while preserving existing stringified outputs.
- `edge.symbol-change-guards-escaping` [non-goal, escape-rules]: The dogfood must not alter the match regex, replacement entities, public package metadata, dependencies, or upstream state.

## Boundaries

- Applies patch: False
- Upstream PR created: False
- Maintainer intent claimed: False
