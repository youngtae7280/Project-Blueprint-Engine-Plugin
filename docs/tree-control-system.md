# Tree Control System

PBE v2 treats the whole product development process as connected trees.

## Blueprint layer

```text
Product Tree -> Project Tree -> Work Tree -> Test Tree
```

## Execution layer

```text
Cycle Tree -> Change Tree -> Impact Tree -> Evidence Tree -> Acceptance Tree
```

## Control rules

- Lower trees must derive from upper trees.
- Development executes Cycle Slices, not the whole tree by default.
- Development-time changes become Change Nodes.
- Change Nodes produce Impact Trees.
- Impacted completed nodes can become stale, invalidated, or reopened.
- Product branches close only with evidence and human acceptance.
- Parity/completeness ledgers are derived control views. They can strengthen audit and verification, but they do not replace tree scope or silently expand implementation work.

## Validation

Run:

```bash
npm run validate:pbe:v2
```

The v2 validator compiles the tree schemas, validates matching templates, and
when `.pbe` tree artifacts exist, checks node IDs and cross-tree links.
