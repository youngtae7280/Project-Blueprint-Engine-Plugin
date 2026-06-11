# 08 WorkGraph

Compatibility view: `.pbe/blueprint/work-graph.json`.

```json
{
  "strategy": "staged_parallel",
  "moduleBoundaryCheck": {
    "status": "passed",
    "notes": ["Product nodes were not used directly as coding tasks."]
  },
  "nodes": [
    {
      "id": "WG-TODO-STATE",
      "workNodeId": "W-TODO-STATE",
      "scopeClass": "foundation",
      "expectedFiles": ["src/todoStore.ts"],
      "expectedSharedFiles": [],
      "forbiddenFiles": [],
      "parallelSafe": false
    },
    {
      "id": "WG-TODO-UI",
      "workNodeId": "W-TODO-ADD",
      "scopeClass": "selected",
      "expectedFiles": ["src/App.tsx", "src/App.css"],
      "expectedSharedFiles": [],
      "forbiddenFiles": [],
      "parallelSafe": false
    },
    {
      "id": "WG-TODO-TESTS",
      "workNodeId": "W-TODO-PERSIST",
      "scopeClass": "selected",
      "expectedFiles": ["src/App.test.tsx"],
      "expectedSharedFiles": [],
      "forbiddenFiles": [],
      "parallelSafe": false
    }
  ],
  "parallelGroups": [],
  "integrationTasks": [
    {
      "id": "INT-TODO-SLICE",
      "requiredEvidence": ["E-TODO-ADD", "E-TODO-COMPLETE", "E-TODO-DELETE", "E-TODO-PERSIST"]
    }
  ]
}
```

Default is sequential because the first slice touches shared UI and state boundaries.

