# PBE Sync Diff

`pbe diff` / `pbe sync diff` should be incremental impact detection, not full analysis.

Large projects must not be fully reanalyzed after every change. PBE should use the Graph and indexes it already has to
understand the changed area around the diff.

## Starting Point

The pipeline starts from changed files:

```text
git diff
-> changed files
-> file-node-index lookup
-> affected Work
-> affected Flow
-> affected Product
-> required Test
-> stale Evidence
-> Risk / Unknown
-> actionable report
```

## File Node Index

A file-node-index maps files to Graph nodes:

- File -> Work
- File -> Flow when runtime behavior is known
- File -> Test when tests live in the changed file
- File -> Risk or Unknown when the file is a known boundary

The first implementation may only define the concept and skeleton command. The real index can be added later.

## Radius Limits

Impact expansion needs radius limits. Without bounds, every diff eventually reaches most of the project.

Initial radius should usually stop at:

- directly touched File nodes
- affected Work nodes
- related Flow/Product nodes
- required Test nodes
- stale Evidence nodes
- blocking Risk/Unknown nodes

Deep graph walks should require a separate deep audit or baseline reconstruction operation.

## AI Usage

AI analysis should not be the first step. The first step is mechanical lookup from changed files and indexes. AI should
be used when the indexed relationships are missing, ambiguous, conflicting, or stale.

## Separation From Baseline Reconstruction

Full project analysis belongs to baseline reconstruction or deep audit. Sync diff assumes a baseline Graph already
exists and only updates the changed neighborhood.

Core principle:

Large projects cannot be fully analyzed every time. PBE should reuse its Graph and indexes, then re-understand only the
area near changed files.
