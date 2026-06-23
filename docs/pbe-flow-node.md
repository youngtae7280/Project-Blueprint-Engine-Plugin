# PBE Flow Node

Flow is the middle layer between Product and Work.

Flow is not legacy-only. In new development it is created as intended flow. In existing project analysis it is
reconstructed as observed flow. In both cases, Flow explains how Product intent becomes user/system behavior before Work
is assigned.

## Why Flow Exists

Product says what must be possible.

Flow says how the user and system move through that behavior.

Work says which responsibility units implement the Flow.

Test and Evidence prove the behavior and implementation remain current.

## Minimum Flow Structure

A Flow node should be able to record:

- stable id
- title
- status: intended, observed, candidate, confirmed, blocked, or stale through Graph node status/metadata
- source: user interview, existing code, runtime observation, documentation, or AI assumption
- ordered steps
- expected user actions
- expected system responses
- linked Product nodes
- linked Work nodes
- linked Test nodes
- linked Risk, Unknown, Assumption, or Decision nodes

The first implementation may keep many of these fields in `metadata` until a dedicated Flow schema is introduced.

## Relationship To Work, Test, Evidence

Flow shows how Product is realized. Work implements responsibilities inside that Flow. Test verifies the Flow, Work, or
Product behavior. Evidence proves the verification happened and is still fresh.

Important principle:

```text
Flow shows what user/system flow realizes Product. Work is the responsibility unit that implements that Flow.
```

## Example

Product:

```text
The user must be able to register an order.
```

Flow:

```text
Enter order registration screen
-> enter product and quantity
-> click save
-> validate input
-> save order
-> refresh list
-> show success message
```

Work:

- input UI
- input validation
- order save
- list refresh

Test:

- valid order registration
- invalid quantity rejection
- list refresh after save

Evidence:

- automated test result
- CLI output
- screenshot or manual review when UI evidence is required
