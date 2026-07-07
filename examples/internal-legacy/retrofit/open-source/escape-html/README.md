# escape-html External Behavior Dogfood

Status: local-external-behavior-dogfood / non-enforcing / no upstream PR

This fixture records a real external behavior-change dogfood against
`component/escape-html`.

The selected slice is intentionally tiny:

- preserve existing HTML escaping for `"`, `'`, `&`, `<`, and `>`
- preserve existing stringification behavior for undefined, null, numbers, and
  objects
- add Symbol input support by using explicit `String(value)` coercion
- add a focused test for Symbol input

The local checkout lives under `work/external/escape-html`. That directory is an
ignored working area and is not committed.

This fixture does not claim upstream maintainer intent or acceptance.
