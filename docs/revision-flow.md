# Revision Flow

PBE treats dissatisfaction as structured input, not as permission to edit everything nearby.

## Flow

```text
User feedback
  -> Feedback Item
  -> Change Node
  -> Impact Tree
  -> Revision Pack
  -> Bounded revision execution
  -> Refreshed evidence
  -> Review Result gate
```

## Boundary Rules

Revision work must stay inside affected selected/foundation scope.

Revision packs should declare:

- affected Product, Project, Work, Test, Evidence, Cycle, and Acceptance nodes
- allowed files
- forbidden files
- stale or reopened evidence
- impacted validation commands
- re-review criteria

## Acceptance

Codex may report `revision_verified` or `submitted_for_review`. Only the user may mark the result `accepted`.

