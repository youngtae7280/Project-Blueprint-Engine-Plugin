# View Tree Pack

Status: canonical candidate

## Document Purpose

View Tree Pack names the conceptual set of tree projections Codex can read when it needs focused context for planning,
execution, review, or revision.

The pack prevents compatibility views from being mistaken for product truth.

## Scope

This document covers conceptual view roles and source rules.

It does not define a new `.pbe` directory, file format, generator, CLI command, validator, or context-pack schema.

## Current Definition

A View Tree Pack is a controlled projection of tree-native artifacts for a specific review or execution purpose.

The underlying source remains:

```text
Product Tree -> Project Tree -> Work Tree -> Test Tree
Cycle Tree -> Change Tree -> Impact Tree -> Evidence Tree -> Acceptance Tree
```

Projected views may include:

| View               | Source                                                                     |
| ------------------ | -------------------------------------------------------------------------- |
| Intent / Flow View | Product Tree branches and confirmed UI/UX decisions.                       |
| Boundary View      | Project Tree modules, surfaces, dependencies, and ownership.               |
| Work View          | Work Tree selected, foundation, deferred, blocked, and out-of-scope nodes. |
| Verification View  | Test Tree, acceptance criteria links, and required evidence.               |
| Execution View     | Cycle Tree plus Cycle and Node Execution Contracts.                        |
| Review View        | Evidence Tree, Acceptance Tree, and unresolved coverage gaps.              |
| Revision View      | Change Tree and Impact Tree affected-node mappings.                        |

## Confirmed Decisions

- View Tree Pack is a projection concept, not a new source of truth.
- Product Tree remains product truth.
- Work Tree remains executable work source after Project derivation.
- Compatibility packs must preserve tree links and scope classification.

## Legacy Term Mapping

Older uses of `Product Tree` as a UI or analysis view should be read as an Intent / Flow View unless they refer to the
actual Product Tree artifact.

Older uses of `Work Tree` as a task grouping should be read as a Work View unless they refer to the actual Work Tree
artifact.

`AI Context Pack` is compatibility shorthand for the context portion of execution contract packaging.

## Rollback / Compatibility Relationship

[rollback-compatibility-strategy.md](rollback-compatibility-strategy.md) defines when a projected view may remain as a
maintained compatibility view, rollback reference, or retirement candidate after a future promotion. A View Tree Pack
remains a projection/read view with explicit source references. If an artifact is ever promoted as source, it must be
reclassified by the approved source policy rather than left under the compatibility-view category.

## Remaining Open Questions

- Should View Tree Pack stay a documentation concept or later become a generated pack?
- Which views are required for ACEP, review, revision, and visual audit?
- What is the smallest useful projection that avoids context bloat?

## Related Gate

This document is limited to Phase 1-2 concept alignment. Concrete artifacts and generators belong to a later phase.
