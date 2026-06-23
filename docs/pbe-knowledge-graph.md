# PBE Knowledge Graph

PBE's purpose is AI-maintainability, not AI coding speed. It exists so that requirements, work, verification, evidence,
review, and acceptance stay explainable after AI has changed a project.

The current PBE is a Tree-first Traceability System. Product Tree, Project Tree, Work Tree, Test Tree, Evidence, and
validators already behave like connected layers:

```text
Product Tree = Product Layer
Project Tree = Project / Architecture Layer
Work Tree = Work Layer
Test Tree = Test Layer
Evidence = Evidence Layer
Traceability = Edge Layer
Validator = required-edge / freshness / closure checks
```

The Graph-first direction does not discard that system. It makes the connected model explicit.

## Direction

Long term, Graph is the source model and Tree is a View. Product, Project, Flow, Work, Test, Evidence, Risk, Unknown,
Assumption, Decision, File, and Operation nodes live in one Traceability Knowledge Graph. Tree views unfold that Graph
for a particular question, stage, or task.

PBE does not remove Trees. Trees remain a human-readable View of the Graph. PBE's core is not the Tree itself, but the
Traceability Knowledge Graph that connects Product / Flow / Work / Test / Evidence / Risk / Unknown / Assumption /
Decision.

## Core Relationships

Product explains why a feature exists.

Flow explains how Product intent becomes user and system behavior.

Work implements Flow responsibilities.

Test verifies Product, Flow, or Work.

Evidence proves that Test results are current and reviewable.

Risk marks a boundary that can cause product, safety, migration, verification, or maintenance harm.

Unknown records facts that are missing, unverified, or not yet recoverable from code or user intent.

Assumption records AI defaults that are allowed to move forward but must remain visible and revisable.

Decision records human choices and rationale.

## Existing Validators As Graph Validators

The current traceability validator is the first form of a Graph required-edge validator:

- Product should connect to Work or Flow.
- Work should connect to Test.
- Test should connect to Evidence requirements or Evidence.
- Evidence freshness should be checked before closure.
- Review and acceptance should not be inferred by the assistant.

The initial Graph validator must stay experimental. It supplements the existing validators and must not replace them
until Graph becomes the authoritative source model.

## First Migration Step

The first safe step is an adapter that reads the existing Tree-first blueprint as a Graph snapshot. The adapter
preserves unknown fields in metadata, infers obvious edges, and leaves ambiguous conversion as TODO-level metadata
rather than silently rewriting PBE truth.

This lets PBE evolve toward Graph-first behavior while preserving existing Product Tree, Project Tree, Work Tree, Test
Tree, Evidence, state machine, human gates, and review/acceptance flow.
