# DevView UserPromptSubmit Context

Status: user-prompt-submit-context-preview-generated

## DevView Status

- Mode: advisory preview.
- Strict mode: disabled.
- Guided enforcement: disabled.
- Non-enforcing: true.
- Hook scripts and blocking behavior are not implemented.

## Frontend Stage

- Terminal stage: instruction-pack-preview-generated-no-codex-execution.
- Instruction Pack preview is generated; Codex execution is not triggered.

## Task

Add or strengthen evidence for the Todo App add button behavior without touching production source.

## Allowed Scope

- allowed-scope-tt-1: `examples/valid/todo-app-pbe-run/.pbe/tree/test-tree.json`
- allowed-scope-ev-1: `examples/valid/todo-app-pbe-run/.pbe/evidence/evidence-tree.json`, `examples/valid/todo-app-pbe-run/.pbe/evidence/test-results/todo-add.txt`

## Forbidden Scope And Non-goals

- forbidden-production-source-changes: `unresolved:production-source-changes`
- forbidden-graph-source-mutation: `examples/valid/todo-app-pbe-run/graph-source.json`
- forbidden-approval-or-acceptance-changes: `examples/valid/todo-app-pbe-run/.pbe/control/acceptance-tree.json`
- Do not treat this context as approval.
- Do not mutate graph-source or apply graph deltas.
- Do not claim runtime Evidence satisfaction or equivalence proof.
- Do not enforce scope or CI from this preview.

## Required Evidence

- required-evidence-tt-1: `examples/valid/todo-app-pbe-run/.pbe/tree/test-tree.json`
- required-evidence-ev-1: `examples/valid/todo-app-pbe-run/.pbe/evidence/test-results/todo-add.txt`

## Output Requirements

- output-evidence-tt-1-status: Report selected evidence/check status for TT-1.
- output-evidence-ev-1-status: Report selected evidence/check status for EV-1.
- output-report-selected-slice-non-execution-boundary: Report that selected-slice contract input is not instruction pack generation, approval, runtime Evidence satisfaction, or enforcement.

## Stop Conditions

- stop-if-selected-slice-scope-expands: Contract input mapping requires nodes, edges, files, or product meaning outside the selected slice.
- stop-if-selected-evidence-unavailable: Selected evidence/check nodes cannot be reviewed or linked to command output.
- stop-if-selected-slice-source-authority-loss: Selected graph slice source authority cannot be traced back to graph-source/read-model nodes.

## Known Risks

- risk-im-001-scope-drift: Golden run includes a non-blocking analyzed change skeleton.

## Validation Chain

- Request IR schema-only validation
- graph-aware Request IR validation
- graph traversal plan
- selected graph slice
- Contract Compiler Input
- Instruction Pack preview

## Boundary

- Use this as additional context only.
- This is not approval, Evidence satisfaction, equivalence proof, or enforcement.
- This UserPromptSubmit additionalContext preview summarizes existing DevView frontend artifacts only. It does not implement hook scripts, install hooks, trust repositories, block Codex execution, call an LLM, run graph traversal, mutate graph-source, apply graph deltas, approve work, record human decisions, satisfy runtime Evidence, prove equivalence, enforce scope, or configure CI.
