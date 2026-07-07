# DevView Examples

This directory is the public entry point for DevView examples and validation fixtures.

DevView examples show how Maintainability Graph context is projected into View Trees,
Context Packs, Instruction Packs, Runtime Evidence, Graph Deltas, and guarded graph
update reports.

## Public Fixtures

```text
examples/valid/
examples/invalid/
```

`examples/valid` contains current DevView validation fixtures and generated
calibration artifacts.

`examples/invalid` contains deliberately invalid fixtures used to verify
deterministic validator failure behavior.

Changes to these directories can affect validation commands, so update them only
with explicit fixture intent.

## Internal Migration Material

```text
examples/internal-legacy/
```

Historical migration fixtures live behind the internal boundary above. They are
kept for compatibility validation and future migration planning, not promoted as
public DevView examples.

Do not link internal migration material from public docs as product examples. If
tests or scripts still need it, reference it through the internal path and keep
the usage non-mutating.

## Example Index

| Path                        | Type             | Purpose                                  | Public example? |
| --------------------------- | ---------------- | ---------------------------------------- | --------------- |
| `examples/valid/`           | valid fixtures   | Current DevView fixture validation       | Yes             |
| `examples/invalid/`         | invalid fixtures | Expected validator failure behavior      | Yes             |
| `examples/internal-legacy/` | migration inputs | Historical compatibility and audit input | No              |

## Safety Boundary

Examples do not approve work, satisfy runtime evidence, prove equivalence,
enforce scope, enable CI enforcement, mutate graph sources, or install hooks.
