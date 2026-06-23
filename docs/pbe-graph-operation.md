# PBE Graph Operation

PBE is Operation-centered, not mode-centered.

PBE should not introduce separate development mode, maintenance mode, or reverse mode. First development, maintenance,
and existing project analysis are all combinations of Graph Operations.

All work either creates, connects, verifies, refreshes, or updates the Graph.

## Atomic Operations And Orchestration

Atomic Operations are small Graph changes:

- create Product node
- create Flow node
- connect Product to Flow
- connect Flow to Work
- connect Work to File
- connect Work to Test
- mark Evidence stale
- create Assumption node
- reject Assumption node
- create Unknown node
- create Risk node
- record Decision node

The Orchestration Layer interprets a user request and selects a safe sequence of Operations. It also selects required
Views and assembles the task-scoped Context Pack.

## General Flow

```text
User Request
-> Task Interpretation
-> Graph Operation Plan
-> Required View Selection
-> Task-scoped Subgraph / Context Pack
-> Minimal Clarification
-> Assumption Declaration
-> AI Execution
-> Verification / Evidence
-> Graph Delta Apply
-> Review / Accept
```

## Graph Operation Plan

A Graph Operation Plan should include:

- id
- summary
- operation kind
- requested by
- nodes to create
- nodes to update
- edges to create
- edges to update
- affected node ids
- required View ids
- assumptions
- unknowns
- risks
- required evidence
- scope guardrails

The initial TypeScript type is a skeleton. Automatic plan generation is intentionally deferred.

## Context View Assembly

AI should not receive the whole Graph by default. It should receive a task-scoped subgraph:

- task summary
- operation kind
- related Product nodes
- related Flow nodes
- related Work nodes
- related Test nodes
- related Evidence requirements
- related Risk nodes
- related Unknown nodes
- active Assumptions
- allowed files
- forbidden files
- required commands
- required evidence
- stop conditions

This keeps context small and protects unrelated product scope.

## How Work Types Map To Operations

All work creates, connects, verifies, or updates Graph knowledge.

First development creates Product, Flow, Work, Test, Evidence, Assumption, Unknown, Risk, and Decision nodes in an empty
or sparse Graph.

Maintenance changes existing Graph nodes, marks affected Evidence stale, reruns required Tests, and applies a Graph
delta after verification.

Existing project analysis restores a baseline from code and runtime observations. It creates observed Flow, Work
responsibility, Product Candidate, Characterization Test suggestion, Unknown, and Risk nodes.
