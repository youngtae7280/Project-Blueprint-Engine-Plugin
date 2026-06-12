# 12 Revision Request

User feedback:

```text
Completed todos should move to a Completed section instead of disappearing.
```

PBE maps this as a product change because it changes the meaning of completion.

```json
{
  "changeNode": {
    "id": "C-COMPLETED-LIST",
    "type": "product_behavior_change",
    "status": "needs_impact_analysis",
    "feedback": "Completed todos should move to a Completed section instead of disappearing.",
    "affectedProductNodeIds": ["P-TODO-COMPLETE"],
    "affectedWorkNodeIds": ["W-TODO-COMPLETE"],
    "affectedTestNodeIds": ["T-TODO-COMPLETE"],
    "acceptanceChange": true
  }
}
```
