# DevView Stop/Post Run Advisory

Status: stop-post-run-advisory-missing-artifacts
Completeness: missing-changed-files
Non-enforcing: true

## DevView Stop/Post Run Status

- UserPromptSubmit context ready: true
- Preflight terminal stage: instruction-pack-preview-generated-no-codex-execution
- Codex execution control: disabled.
- Tool blocking: disabled.
- Strict/guided enforcement: disabled.

## Changed Files

- Status: missing
- Count: 0
- No changed files listed.

## Instruction And Preflight Context

- Instruction Pack: present
- Task: Add or strengthen evidence for the Todo App add button behavior without touching production source.
- Allowed scope count: 2
- Forbidden scope count: 3
- Required evidence count: 2

## Scope Advisory State

- Scope report: missing
- Scope result: missing
- Forbidden scope indicated: false
- Scope enforcement: disabled.

## Proposal And Review

- Proposal: missing
- Review packet: missing
- Approval status: not-approved
- Human review required: true

## Missing Artifacts And Next Commands

- `graph read-model collect-changed-files --base <baseRef> --head <headRef> --output <changedFiles> --json`

## Safety Boundary

- This Stop/Post Run advisory report summarizes post-run artifact completeness only. It does not install hooks, trust repositories, start active hook sessions, control or block Codex execution, collect Git changes, run scope checks, generate proposals or review packets, modify or revert changed files, call an LLM/API, invoke providers, mutate graph-source, apply graph deltas, automate approval or human decisions, accept or satisfy Evidence, prove equivalence, enforce scope, or configure CI.
