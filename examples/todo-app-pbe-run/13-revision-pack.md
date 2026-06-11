# 13 Revision Pack

Revision pack: `.pbe/revisions/revision-completed-list/revision-manifest.json`.

```json
{
  "revisionId": "R-COMPLETED-LIST",
  "changeNodeIds": ["C-COMPLETED-LIST"],
  "impactNodeIds": ["I-COMPLETED-LIST"],
  "allowedFiles": ["src/App.tsx", "src/App.css", "src/todoStore.ts", "src/App.test.tsx"],
  "forbiddenFiles": ["package.json", "vite.config.ts"],
  "reopenedProductNodeIds": ["P-TODO-COMPLETE"],
  "reopenedWorkNodeIds": ["W-TODO-COMPLETE"],
  "reopenedTestNodeIds": ["T-TODO-COMPLETE"],
  "requiredEvidenceRefresh": ["E-TODO-COMPLETE"],
  "validationCommands": ["npm test", "npm run build"],
  "submitState": "submitted_for_review"
}
```

Impact summary:

- `P-TODO-COMPLETE` changes from "mark complete" to "move into Completed section".
- `W-TODO-COMPLETE` is reopened.
- `T-TODO-COMPLETE` must verify Completed section behavior.
- Existing add, delete, and persistence tests remain regression checks.

