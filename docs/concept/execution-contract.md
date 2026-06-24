# Execution Contract

Status: canonical candidate

## Document Purpose

This document defines the concept role of Execution Contracts in the PBE runtime architecture.

Execution Contracts are the boundary between planning and implementation. They tell Codex what it may change, what it
must not change, and what evidence must be produced.

## Scope

This document covers the conceptual contract boundary.

It does not replace [../execution-contracts.md](../execution-contracts.md), define new schemas, or design CLI commands.

## Contract Types

| Contract                | Role                                                                                                                                                                                     |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Cycle Contract          | Defines one selected implementation slice, including included scope, foundation scope, deferred and out-of-scope nodes, validation commands, evidence requirements, and stop conditions. |
| Node Execution Contract | Defines one executable Work node, including source Product and Project nodes, expected and forbidden files, dependencies, tests, evidence, UI/UX constraints, and change rules.          |

Task cards may remain human-friendly compatibility views, but they must reference the corresponding Node Execution
Contract when one exists.

## Execution Rules

Codex may execute:

- selected Work nodes
- foundation Work nodes required by the selected slice
- tests and evidence required by included Test nodes
- integration tasks declared by the execution strategy or contract

Codex must not execute:

- deferred behavior
- blocked behavior
- out-of-scope behavior
- unconfirmed UI/UX changes
- visual UI changes without a Visual Design Contract source, waiver, out-of-scope decision, or not-required decision
- product, risk, acceptance, or verification changes without Change and Impact handling

## Confirmed Decisions

- ACEP is the compatibility name for packaging Cycle and Node Execution Contracts.
- Contract execution ends as submitted for review, not accepted.
- Missing scope, design drift, unsafe dependency impact, or technical impossibility is a stop/change condition.
- Evidence must attach back to Product, Work, Test, criteria, or review requirements as applicable.

## Remaining Open Questions

- Which contract fields should become mandatory in the next schema refinement?
- Which validation commands are required for concept-only, docs-only, UI, and code implementation cycles?
- How should execution contracts reference View Tree Pack projections if that concept becomes an artifact later?

## Related Gate

This concept document supports Phase 1-2 architecture alignment. Detailed CLI behavior and validator implementation are
later-phase work.
