# PBE Examples

## Purpose

This directory contains different kinds of examples.

Not every example is a test fixture. Some examples are executable validation fixtures. Some examples are narrative
adoption examples. Some examples are historical dogfooding records.

## Which Example Should I Read First?

1. Start with `examples/valid/todo-app-pbe-run` to understand a minimal valid PBE run.
2. Read `examples/adoption/todo-search-slice` to understand adopting PBE into an existing project.
3. Read `examples/intent-critical` to understand why Graph-source records preserve maintenance intent that can be lost
   during vibe-coding cleanup.
4. Read `examples/dogfooding/windows-validation-sequential-run` to see PBE documenting its own improvement.
5. Inspect `examples/invalid` only when learning validator failure behavior.

## Test Fixtures

Fixture paths:

```text
examples/valid/
examples/invalid/
```

`examples/valid` contains valid fixtures that should pass under `npm.cmd run test:examples`.

`examples/invalid` contains invalid fixtures that verify expected issue/failure behavior.

Changes to these directories can affect `test:examples`, so update them only with explicit fixture intent.

## Narrative Adoption Examples

Narrative adoption path:

```text
examples/adoption/todo-search-slice/
```

This example shows applying PBE to the next bounded feature slice of an existing project instead of converting the whole
project at once.

It is a narrative example, not a test fixture, and it is not wired into `test:examples`.

## Intent-Critical Maintenance Examples

Intent-critical fixture path:

```text
examples/intent-critical/
```

These small Graph-source intent fixtures show native PBE and retrofit PBE maintenance risks where missing original
intent can cause AI-assisted maintenance to change behavior incorrectly. They are checked by focused Vitest coverage, not
by `test:examples`.

## Dogfooding Records

Dogfooding record path:

```text
examples/dogfooding/windows-validation-sequential-run/
```

This is a self-dogfooding record of PBE documenting a small improvement to the PBE repository itself.

It may become an archive candidate later because it is historical, but keep it for now as a narrative/dogfooding record.
It is not a test fixture.

## How `test:examples` Uses These Files

`test:examples` should keep validating `examples/valid` and `examples/invalid`.

Adoption and dogfooding examples should remain narrative examples unless explicitly promoted to test fixtures later.

## Do Not Move or Rename Without Updating Tests

Do not move or rename fixture directories without checking `scripts/test-examples.js` and related docs.

Do not convert narrative examples into fixtures without a separate design decision.

## Example Index

| Path                                                    | Type                       | Purpose                              | Used by `test:examples`? |
| ------------------------------------------------------- | -------------------------- | ------------------------------------ | ------------------------ |
| `examples/valid/todo-app-pbe-run`                       | valid fixture              | Minimal valid PBE run                | Yes                      |
| `examples/invalid/*`                                    | invalid fixtures           | Expected validator failure cases     | Yes                      |
| `examples/adoption/todo-search-slice`                   | narrative adoption example | Existing project next-slice adoption | No                       |
| `examples/intent-critical/*`                            | focused intent fixtures    | Native/retrofit intent preservation  | No                       |
| `examples/dogfooding/windows-validation-sequential-run` | dogfooding record          | PBE self-improvement record          | No                       |
