# 09 Verification Design

Compatibility view: `.pbe/blueprint/verification-design.json`.

```json
{
  "verificationItems": [
    {
      "id": "V-TODO-ADD",
      "testNodeId": "T-TODO-ADD",
      "method": "component-test",
      "evidenceRequired": ["test-output", "manual-review-note"]
    },
    {
      "id": "V-TODO-COMPLETE",
      "testNodeId": "T-TODO-COMPLETE",
      "method": "component-test",
      "evidenceRequired": ["test-output", "manual-review-note"]
    },
    {
      "id": "V-TODO-DELETE",
      "testNodeId": "T-TODO-DELETE",
      "method": "component-test",
      "evidenceRequired": ["test-output"]
    },
    {
      "id": "V-TODO-PERSIST",
      "testNodeId": "T-TODO-PERSIST",
      "method": "component-test",
      "evidenceRequired": ["test-output", "localStorage-inspection"]
    }
  ],
  "coverageRule": "Every selected Product node must map to at least one Test node and one evidence item."
}
```

