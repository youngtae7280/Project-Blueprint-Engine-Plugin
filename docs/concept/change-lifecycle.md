# Change Lifecycle

Status: canonical candidate

## Document Purpose

This document defines the concept lifecycle for product, scope, UX, risk, acceptance, and verification changes after
work has been planned, executed, reviewed, or accepted.

## Scope

This document covers conceptual states and responsibilities.

It does not define CLI command syntax, file schemas, migration scripts, or implementation logic.

## Current Lifecycle

Changes move through this conceptual flow:

```text
Feedback or drift
-> Change Tree input
-> affected node mapping
-> Impact Tree analysis
-> stale, invalidated, or reopened nodes
-> bounded revision work
-> refreshed tests and evidence
-> review submission
-> user acceptance
```

## Change Inputs

A Change node is required when feedback, discovery, or drift alters:

- product meaning
- implementation scope
- UX behavior or wording
- risk profile
- acceptance criteria
- verification strategy
- already implemented, verified, or accepted work

Small typo fixes or clearly bounded non-product edits may stay outside this lifecycle only when they do not alter those
dimensions.

## Impact Responsibilities

Impact analysis maps affected:

- Product nodes
- Project nodes
- Work nodes
- Test nodes
- Evidence nodes
- Cycle nodes
- Acceptance branches
- acceptance criteria

Affected completed nodes must be marked stale, invalidated, or reopened before revision work claims completion.

## Confirmed Decisions

- Codex does not silently edit accepted or completed work when feedback changes meaning or verification.
- Change and Impact records bound revision scope.
- Revisions rerun impacted tests and refresh stale evidence.
- User acceptance must be renewed when acceptance was invalidated.

## Remaining Open Questions

- Which change classes should become CLI-assisted first?
- How much impact analysis can be file-judged without semantic inference?
- How should compatibility views show stale or reopened status without becoming the source of truth?

## Related Gate

This document establishes the lifecycle concept only. Detailed Control Node lifecycle policy remains outline-only in this
phase.
