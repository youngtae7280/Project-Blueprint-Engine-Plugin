# 06 Test Tree

Compatibility term: VD.

```json
{
  "treeVersion": "2.0",
  "nodes": [
    {
      "id": "T-ROOT",
      "type": "test_root",
      "title": "Todo verification"
    },
    {
      "id": "T-TODO-ADD",
      "parentId": "T-ROOT",
      "type": "behavior_test",
      "title": "Adding a todo shows it in active list",
      "verifiesProductNodeIds": ["P-TODO-ADD"],
      "verifiesWorkNodeIds": ["W-TODO-ADD"],
      "requiredEvidence": ["E-TODO-ADD"]
    },
    {
      "id": "T-TODO-COMPLETE",
      "parentId": "T-ROOT",
      "type": "behavior_test",
      "title": "Completing a todo marks it complete",
      "verifiesProductNodeIds": ["P-TODO-COMPLETE"],
      "verifiesWorkNodeIds": ["W-TODO-COMPLETE"],
      "requiredEvidence": ["E-TODO-COMPLETE"]
    },
    {
      "id": "T-TODO-DELETE",
      "parentId": "T-ROOT",
      "type": "behavior_test",
      "title": "Deleting a todo removes it",
      "verifiesProductNodeIds": ["P-TODO-DELETE"],
      "verifiesWorkNodeIds": ["W-TODO-DELETE"],
      "requiredEvidence": ["E-TODO-DELETE"]
    },
    {
      "id": "T-TODO-PERSIST",
      "parentId": "T-ROOT",
      "type": "behavior_test",
      "title": "Todos survive refresh",
      "verifiesProductNodeIds": ["P-TODO-PERSIST"],
      "verifiesWorkNodeIds": ["W-TODO-PERSIST"],
      "requiredEvidence": ["E-TODO-PERSIST"]
    }
  ]
}
```

