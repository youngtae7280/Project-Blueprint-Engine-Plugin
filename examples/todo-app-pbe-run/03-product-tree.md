# 03 Product Tree

Compatibility term: RPD.

```json
{
  "treeVersion": "2.0",
  "nodes": [
    {
      "id": "P-ROOT",
      "type": "product_root",
      "title": "Todo App",
      "status": "confirmed"
    },
    {
      "id": "P-TODO-ADD",
      "parentId": "P-ROOT",
      "type": "requirement",
      "title": "Add todo",
      "scopeClass": "selected",
      "acceptanceCriteria": ["A new non-empty todo appears in the active list."]
    },
    {
      "id": "P-TODO-COMPLETE",
      "parentId": "P-ROOT",
      "type": "requirement",
      "title": "Complete todo",
      "scopeClass": "selected",
      "acceptanceCriteria": ["A todo can be marked complete from the active list."]
    },
    {
      "id": "P-TODO-DELETE",
      "parentId": "P-ROOT",
      "type": "requirement",
      "title": "Delete todo",
      "scopeClass": "selected",
      "acceptanceCriteria": ["A todo can be removed by explicit delete action."]
    },
    {
      "id": "P-TODO-PERSIST",
      "parentId": "P-ROOT",
      "type": "requirement",
      "title": "Persist todos after refresh",
      "scopeClass": "selected",
      "acceptanceCriteria": ["Todos remain after page refresh using localStorage."]
    }
  ]
}
```
