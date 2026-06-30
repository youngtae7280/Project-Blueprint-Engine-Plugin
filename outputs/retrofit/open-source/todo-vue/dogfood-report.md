# Open Source todo-vue Dogfood Report

Status: open-source-todo-vue-dogfood-pass

Clone HEAD: 8a7ef579f1d117a8ac9530a52f5c5a81c3e99676

## Checks

- Graph-source validation: retrofit-graph-source-pass
- Graph-source nodes/edges: 6 / 5
- Record validation: retrofit-change-record-pass
- Instruction pack validation: retrofit-instruction-pack-pass
- Graph delta validation: retrofit-graph-delta-pass
- Graph delta changed files: 1
- Graph update proposal: generated-from-graph-delta
- Source record status: implemented-build-pending
- Source record active code state: active-local-doc-only

## Tooling

- Node: v20.16.0
- npm ci: passed-before-validator
- Build: implemented-build-pending
- Build blocker: local Node/toolchain baseline blocked npm run build; README-only scope remains isolated

## Boundary

- Local todo-vue source modified: True
- Dirty files: README.md
- Upstream PR created: False
- Local doc-only applied: True
- Maintainer intent claimed: False
- Selected slice failure: False
