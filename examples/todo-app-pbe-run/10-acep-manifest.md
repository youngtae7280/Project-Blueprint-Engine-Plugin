# 10 ACEP Manifest

Compatibility artifact: `.pbe/codex-execution-pack/execution-manifest.json`.

```json
{
  "cycleId": "CYCLE-TODO-001",
  "status": "ready_for_execution",
  "includedWorkNodeIds": ["W-TODO-STATE", "W-TODO-ADD", "W-TODO-COMPLETE", "W-TODO-DELETE", "W-TODO-PERSIST"],
  "includedTestNodeIds": ["T-TODO-ADD", "T-TODO-COMPLETE", "T-TODO-DELETE", "T-TODO-PERSIST"],
  "excludedNodeIds": [],
  "validationCommands": ["npm test", "npm run build"],
  "evidenceRequired": ["E-TODO-ADD", "E-TODO-COMPLETE", "E-TODO-DELETE", "E-TODO-PERSIST"],
  "finalState": "submitted_for_review"
}
```

Codex can implement this cycle, but cannot mark the product accepted.
