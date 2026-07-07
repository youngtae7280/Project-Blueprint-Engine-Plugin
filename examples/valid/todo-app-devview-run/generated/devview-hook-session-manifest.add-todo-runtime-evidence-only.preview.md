# DevView Hook Session Manifest Preview

Status: devview-hook-session-manifest-preview-generated

## Session Boundary

- Session status: not-started-preview-only
- Hooks active: false
- Hook scripts installed: false
- Strict/guided blocking: disabled
- Bypass detection: preview-only-non-enforcing

## Sources

- Hook health: `examples/valid/todo-app-devview-run/generated/devview-hook-gateway-health-boundary.runtime-evidence-only.preview.json`
- UserPromptSubmit context: `examples/valid/todo-app-devview-run/generated/devview-user-prompt-submit-context.add-todo-runtime-evidence-only.preview.json`
- Script scaffold: `examples/valid/todo-app-devview-run/generated/devview-hook-script-scaffold.add-todo-runtime-evidence-only.preview.json`
- Script templates: `examples/valid/todo-app-devview-run/generated/devview-hook-script-template.add-todo-runtime-evidence-only.preview.json`

## Hook Event Readiness

- SessionStart: preview-ready-not-active
- UserPromptSubmit: preview-ready-not-active
- PreToolUse: preview-ready-not-active
- PostToolUse: preview-ready-not-active
- Stop: preview-ready-not-active

## Non-execution Statement

This Hook Gateway session manifest is a preview-only bundle of existing readiness/context/script preview artifacts. It does not start a hook session, install hooks, activate hooks, trust repositories, configure Codex, block Codex execution, call an LLM, make network calls, run validation or traversal, mutate graph-source, apply graph deltas, approve work, record human decisions, satisfy runtime Evidence, prove equivalence, enforce scope, or configure CI.
