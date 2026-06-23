# PBE Minimal Clarification

PBE interviews should not become exhaustive pre-questionnaires.

The policy is:

```text
Minimal Clarification + Assumption Declaration + Feedback as Graph Delta
```

PBE asks only when the answer changes product meaning, scope, UX, risk, acceptance criteria, verification strategy, or
already verified/accepted work.

## Question Criteria

Ask the user when:

- no answer would split implementation into materially different directions and create high rework risk
- an AI default would be risky or likely to violate human intent
- the decision is policy, scope, UX, completion criteria, risk acceptance, or verification strategy

Do not ask the user for information the assistant can inspect from code, tests, docs, or existing PBE artifacts.

## What AI Should Investigate

AI should inspect:

- existing code
- existing tests
- current PBE artifacts
- file ownership and module boundaries
- available scripts and validation commands
- local behavior that can be run safely

## What Humans Should Decide

Humans should decide:

- intent
- policy
- selected scope
- UX choices
- completion criteria
- risk acceptance
- acceptance of reviewed work

## Assumption Nodes

An Assumption Node records an AI default that lets work continue without pretending the default was user truth.

Assumptions should include:

- summary
- source
- linked Product/Flow/Work/Test/Edge ids
- status: assumed, confirmed, or rejected
- whether user feedback may change it

## Feedback As Graph Delta

Example assumption:

```text
If the search term is empty, show the full list.
```

User feedback:

```text
No. If the search term is empty, show guidance text instead.
```

Graph delta:

- Assumption rejected
- Flow expected result updated
- Test updated
- Evidence marked stale

Core principle:

PBE does not ask every question upfront. It asks the minimum necessary questions, then allows AI to proceed with visible
Assumption Nodes. When the user reviews the result, feedback becomes a Graph Delta rather than an informal correction
that disappears.
