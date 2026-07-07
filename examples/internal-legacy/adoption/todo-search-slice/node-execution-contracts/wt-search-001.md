# Node Execution Contract: WT-SEARCH-001

Status: demo-support evidence snapshot

This file strengthens the representative runtime feasibility demo for Work node `WT-SEARCH-001`. It is not a
CLI-generated contract, not a task-card-only authority, and not Graph-source promotion.

## Source References

- `examples/internal-legacy/adoption/todo-search-slice/product-tree.json`
- `examples/internal-legacy/adoption/todo-search-slice/project-tree.json`
- `examples/internal-legacy/adoption/todo-search-slice/work-tree.json`
- `examples/internal-legacy/adoption/todo-search-slice/test-tree.json`
- `examples/internal-legacy/adoption/todo-search-slice/evidence-tree.json`
- `examples/internal-legacy/adoption/todo-search-slice/product-patch-tree.json`
- `examples/internal-legacy/adoption/todo-search-slice/cycle-contract.md`
- `docs/execution-contracts.md`

## Derivation Notes

- Work node `WT-SEARCH-001` is derived from Product node `PT-SEARCH-001`.
- Project boundaries are derived from `PJ-TODO-LIST-SURFACE` and `PJ-TODO-SEARCH-HELPER`.
- Expected and forbidden files are copied from `work-tree.json`.
- Tests and Evidence are copied from `test-tree.json` and `evidence-tree.json`.
- Product Patch `PP-001` was user-confirmed in the parent orchestration chat on 2026-06-24 and is now selected revision
  scope.

## Limitations

- This is a manual demo-support Node Execution Contract.
- It does not run commands.
- It does not prove a full Todo application exists in the repository.
- It does not authorize implementation outside title + note/content search.
- It records renewed Acceptance only after explicit user approval.

## Work Node

| Field               | Value                                             |
| ------------------- | ------------------------------------------------- |
| Work node           | `WT-SEARCH-001`                                   |
| Title               | Revise Todo search for title and note content     |
| Scope class         | selected                                          |
| Product node        | `PT-SEARCH-001`                                   |
| Project nodes       | `PJ-TODO-LIST-SURFACE`, `PJ-TODO-SEARCH-HELPER`   |
| Acceptance criteria | `AC-SEARCH-001`, `AC-SEARCH-002`, `AC-SEARCH-003` |

## Allowed Files

- `src/todo-list.tsx`
- `src/todo-search.ts`

## Forbidden Files / Behavior

- `src/tag-filter.ts`
- `src/server-search.ts`
- tag filter
- date filter
- fuzzy search
- server-side search
- saved search
- note/content behavior beyond title + note/content query matching

## Required Tests And Evidence

| Test node       | Check                                             | Evidence                                    |
| --------------- | ------------------------------------------------- | ------------------------------------------- |
| `TT-SEARCH-001` | Query filters Todo titles.                        | `EV-SEARCH-NOTE-TEST` present/fresh         |
| `TT-SEARCH-004` | Query filters Todo note/content.                  | `EV-SEARCH-NOTE-TEST` present/fresh         |
| `TT-SEARCH-002` | Empty query restores full Todo list.              | `EV-SEARCH-NOTE-TEST` present/fresh         |
| `TT-SEARCH-003` | No title or note/content match shows empty state. | Runtime behavior present; UI review pending |

## Evidence Freshness Rule

Evidence from `EV-SEARCH-NOTE-TEST` is current for the bounded runtime fixture and covers title, note/content, no-match
data behavior, non-scope tag/date exclusion, and blank query behavior. Historical `EV-SEARCH-TEST` remains useful as a
title-only snapshot but is supplemented by the fresh fixture command. UI screenshot/manual visual evidence for the
no-result empty state remains a warning.

## Stop Conditions

Stop and create or use a Change/Impact path if:

- search scope expands to tag, date, fuzzy, server-side, or saved search
- implementation touches forbidden files
- a required Test or Evidence node is missing
- acceptance criteria change
- evidence freshness cannot be established after Product Patch confirmation
- renewed Acceptance is treated as Graph-source promotion or source authority change

## Output Obligations

For selected title + note/content revision work, review must show:

- Product node and acceptance criteria
- Project boundary
- Work node and file boundary
- Test coverage
- Evidence links
- stale/partial Evidence exception for prior title-only evidence
- present/fresh runtime fixture Evidence for title + note/content search
- remaining warning for UI screenshot/manual visual evidence

## Non-Promotion Statement

This Node Execution Contract is a demo-support snapshot only. It does not create source authority, change runtime
behavior, or promote Maintainability Graph.
