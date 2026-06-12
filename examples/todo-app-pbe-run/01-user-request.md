# 01 User Request

User request:

```text
Build a simple Todo app.

Users should be able to:
- add a todo
- complete a todo
- delete a todo
- refresh the page without losing todos
```

PBE interprets this as Product Tree growth, not as direct coding tasks.

Open decision:

```json
{
  "decisionId": "D-PERSISTENCE-001",
  "status": "resolved",
  "question": "Where should todos be stored for the first slice?",
  "answer": "Use browser localStorage for the first slice.",
  "affects": ["P-TODO-PERSIST"]
}
```
