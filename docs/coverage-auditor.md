# Coverage Auditor

Coverage Auditor checks whether requirements, work, verification, tasks, traceability, and evidence are connected.

## Output

```text
.pbe/blueprint/coverage-audit.md
```

## Checks

- Every confirmed requirement has a linked task or explicit exception.
- Every task has verification or explanation.
- Every verification item has evidence or not-runnable explanation.
- Every task card has Requirement Links.
- Every manifest task has requirement IDs, verification IDs or explanation, and evidence requirements.
- Traceability matrix has no unresolved pending item without explanation.
- Parity-critical surfaces do not claim parity without inventory, tests, and evidence.
- Surface completion does not collapse `technical_stable`, `parity_reviewed`, and user acceptance into one state.
- Hardware-dependent features do not claim certification without certification evidence.
- Repeated verification misses are recorded and promoted or blocked.

Blocking coverage gaps must be repaired before ACEP generation or final completion.
