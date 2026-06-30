# Open Source escape-html Behavior Dogfood Report

Status: open-source-escape-html-behavior-dogfood-pass

Clone HEAD: b42947eefa79efff01b3fe988c4c7e7b051ec8d8

## Checks

- Graph-source validation: retrofit-graph-source-pass
- Graph-source nodes/edges: 6 / 5
- Record validation: retrofit-change-record-pass
- Instruction pack validation: retrofit-instruction-pack-pass
- Graph delta validation: retrofit-graph-delta-pass
- Graph delta changed files: 2
- Graph update proposal: generated-from-graph-delta
- Source record status: implemented-build-pass-runtime-pass
- Source record active code state: active-local-behavior-change

## Behavior

- npm test: pass
- Test count: 31
- Code signature: `var str = String(string)`
- New assertion: `escapeHtml(Symbol('escape')) === 'Symbol(escape)'`

## Boundary

- Local escape-html source modified: True
- Dirty files: index.js, test/index.js
- Upstream PR created: False
- Local behavior change applied: True
- Maintainer intent claimed: False
- Selected slice failure: False
- Graph-source mutated by proposal: False
