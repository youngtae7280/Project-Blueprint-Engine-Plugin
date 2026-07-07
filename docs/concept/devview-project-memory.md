# DevView Project Memory

DevView Project Memory is the persistent project profile layer that sits before project-specific graph vocabulary is
allowed to influence traversal, selected slices, contract input, or instruction packs.

It answers a different question from Request IR. Request IR says what the user is asking for in this task. Project
Memory says what kind of project DevView is working inside, what must be preserved, what kind of improvement is
allowed, and which taxonomy/viewpoint extensions are only candidates until reviewed.

## Boundary Artifacts

The Project Memory boundary is recorded in:

```text
examples/valid/todo-app-pbe-run/generated/devview-project-memory-boundary.runtime-evidence-only.preview.json
```

The related profile boundaries are:

```text
examples/valid/todo-app-pbe-run/generated/devview-project-profile-schema-boundary.runtime-evidence-only.preview.json
examples/valid/todo-app-pbe-run/generated/devview-taxonomy-profile-extension-boundary.runtime-evidence-only.preview.json
examples/valid/todo-app-pbe-run/generated/devview-project-direction-change-boundary.runtime-evidence-only.preview.json
```

The first WindowsUtility retrofit memory preview is:

```text
examples/internal-legacy/retrofit/windowsutility/devview-project-memory.preview.json
```

These artifacts are preview-only. They do not approve a profile, apply taxonomy extensions, change traversal behavior,
generate a selected slice, generate contract input, generate an instruction pack, mutate graph-source, apply graph
deltas, satisfy Evidence, prove equivalence, enforce scope, configure CI, or replace human review.

## Native And Retrofit Modes

DevView Native projects treat the current source structure as the main product growth surface. Typical view trees are
route, component, service, domain, test, runtime, and risk. Native Project Memory should preserve current user-facing
behavior and source contracts unless a reviewed task explicitly opens behavior change.

DevView Retrofit projects treat legacy behavior as something to map and preserve before bounded improvement, porting,
or refactoring work is compiled. Typical view trees are legacy module, execution flow, parity, migration target, UI
layout surface, hardware boundary, and forbidden-flow boundary. Retrofit Project Memory must keep parity, hardware,
native interop, and forbidden behavior drift visible before any extension or task scope gains authority.

Hybrid projects are allowed, but they must state which side is editable and which side is context-only. Unknown projects
should block extension authority and route to clarification or human review.

## Project Memory To Extension Flow

Project Memory connects to taxonomy and view tree decisions through a proposal-only chain:

```text
Project Memory Candidate
-> profile schema boundary check
-> taxonomy profile extension candidate
-> view tree profile candidate
-> extension delta proposal
-> human review packet
-> approved project memory revision (future-only)
```

Unapproved extension vocabulary is not traversal authority, not selected-slice authority, not contract authority, and
not instruction-pack authority.

## WindowsUtility Preview

The WindowsUtility preview records `devviewMode: retrofit` and `projectDirection.current:
legacy-preserving-retrofit`. It separates:

- whole WindowsUtility / Utility_Windows portfolio: observed inventory, context-only
- CardPrinterConfig: detailed retrofit slice with graph-backed records and instruction-pack context

The preview references the `legacy-retrofit-windowsutility-v0` taxonomy profile candidate. That profile includes
extension candidates such as `legacy-utility-module`, `execution-flow`, `ui-layout-surface`,
`forbidden-flow-boundary`, `integration-target`, `native-interop`, and `hardware-boundary`. Those are project-specific
extension candidates only; they do not become authority until a future human-reviewed project memory revision exists.

## Direction Changes

When a user changes direction, for example from porting to behavior-preserving refactor, DevView must not silently
reinterpret the project graph. The direction change boundary requires:

```text
Direction Change Candidate
-> profile impact analysis
-> taxonomy extension delta proposal
-> view tree profile delta proposal
-> human review packet
-> approved project memory revision (future-only)
```

The current boundary does not implement approval or apply.

## Extension Gap Detector

The first report-only detector is implemented as:

```text
graph read-model report-project-memory-extension-gaps
```

It compares Project Memory required extension vocabulary against current graph-source/read-model vocabulary and reports
missing, extra, deprecated, and unapproved kinds. It remains advisory and proposal-only. It does not apply extensions,
mutate graph-source, change traversal, or authorize contracts.

The WindowsUtility calibration report is:

```text
examples/internal-legacy/retrofit/windowsutility/project-memory-extension-gaps.preview.json
```

## Impact Report

The first direction-change impact report is implemented as:

```text
graph read-model report-project-memory-impact
```

It reads a direction-change candidate and reports preservation, improvement, source authority, taxonomy, and view tree
impact before any future revision can be reviewed. It does not approve or apply a Project Memory revision.

The WindowsUtility behavior-preserving refactor candidate and impact report are:

```text
examples/internal-legacy/retrofit/windowsutility/project-direction-change.behavior-preserving-refactor.preview.json
examples/internal-legacy/retrofit/windowsutility/project-memory-impact.behavior-preserving-refactor.preview.json
```
