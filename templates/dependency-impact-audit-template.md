# Dependency Impact Audit

## Status

- status:
- scope decision required:
- architecture runway required:

## Future Or Deferred Items

| ID         | Title                     | Classification      | Current Slice Impact                                                           | Risk If Skipped                                                | Decision              |
| ---------- | ------------------------- | ------------------- | ------------------------------------------------------------------------------ | -------------------------------------------------------------- | --------------------- |
| FUTURE-001 | Future or deferred module | required_foundation | Requires a stable interface, adapter, state model, event, schema, or stub now. | Selected slice may hard-code a transport or module assumption. | pending_user_decision |

## Classifications

- `optional_deferred`: safe to defer without current foundation.
- `required_foundation`: defer feature behavior, but create foundation now.
- `blocking_dependency`: implementation cannot proceed safely without a user decision.
- `high_impact_future_module`: future module shape can change current architecture.

## Decision Rules

- `pending_user_decision` must stop at the Implementation Scope or Architecture Runway gate.
- `approved_foundation` and `approved_foundation_only` require a user decision reference.
- `deferred_with_no_current_impact` must explain why no current foundation is needed.
- `included_in_current_slice` means the user explicitly changed scope.
- `blocked` stops Autoflow.

## Summary

Write the current-slice architecture impact and the recommended scope decision.
