# 04 Project Tree

Compatibility term: WPD project derivation.

```json
{
  "treeVersion": "2.0",
  "nodes": [
    {
      "id": "PRJ-ROOT",
      "type": "project_root",
      "title": "Todo frontend"
    },
    {
      "id": "PRJ-UI",
      "parentId": "PRJ-ROOT",
      "type": "surface",
      "title": "Todo list UI",
      "productNodeIds": ["P-TODO-ADD", "P-TODO-COMPLETE", "P-TODO-DELETE"]
    },
    {
      "id": "PRJ-STATE",
      "parentId": "PRJ-ROOT",
      "type": "module",
      "title": "Todo state and persistence",
      "productNodeIds": ["P-TODO-ADD", "P-TODO-COMPLETE", "P-TODO-DELETE", "P-TODO-PERSIST"]
    }
  ]
}
```

Boundary decision:

- UI components may render and dispatch actions.
- State module owns todo mutation and localStorage serialization.

