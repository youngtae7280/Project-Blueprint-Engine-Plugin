# 05 Work Tree

Compatibility term: WPD work derivation.

```json
{
  "treeVersion": "2.0",
  "nodes": [
    {
      "id": "W-ROOT",
      "type": "work_root",
      "title": "Todo implementation slice"
    },
    {
      "id": "W-TODO-STATE",
      "parentId": "W-ROOT",
      "type": "foundation",
      "title": "Create todo state model and storage adapter",
      "scopeClass": "foundation",
      "productNodeIds": ["P-TODO-ADD", "P-TODO-COMPLETE", "P-TODO-DELETE", "P-TODO-PERSIST"],
      "projectNodeIds": ["PRJ-STATE"]
    },
    {
      "id": "W-TODO-ADD",
      "parentId": "W-ROOT",
      "type": "feature",
      "title": "Add todo form behavior",
      "scopeClass": "selected",
      "productNodeIds": ["P-TODO-ADD"],
      "projectNodeIds": ["PRJ-UI", "PRJ-STATE"]
    },
    {
      "id": "W-TODO-COMPLETE",
      "parentId": "W-ROOT",
      "type": "feature",
      "title": "Complete todo behavior",
      "scopeClass": "selected",
      "productNodeIds": ["P-TODO-COMPLETE"],
      "projectNodeIds": ["PRJ-UI", "PRJ-STATE"]
    },
    {
      "id": "W-TODO-DELETE",
      "parentId": "W-ROOT",
      "type": "feature",
      "title": "Delete todo behavior",
      "scopeClass": "selected",
      "productNodeIds": ["P-TODO-DELETE"],
      "projectNodeIds": ["PRJ-UI", "PRJ-STATE"]
    },
    {
      "id": "W-TODO-PERSIST",
      "parentId": "W-ROOT",
      "type": "feature",
      "title": "Persist todos in localStorage",
      "scopeClass": "selected",
      "productNodeIds": ["P-TODO-PERSIST"],
      "projectNodeIds": ["PRJ-STATE"]
    }
  ]
}
```
