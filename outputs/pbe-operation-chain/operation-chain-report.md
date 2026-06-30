# PBE Operation Chain Report

Status: pbe-operation-chain-pass

Operation chain:

```text
graph-source -> instruction pack -> local change -> graph delta
```

## Checks

- CardPrinterConfig retrofit fixture smoke: pbe-retrofit-smoke-pass
- Open-source cJSON retrofit dogfood: open-source-cjson-dogfood-pass
- Native graph-notes dogfood: native-graph-notes-dogfood-pass
- Native graph-counter behavior dogfood: native-graph-counter-dogfood-pass

## Graph Sources

- CardPrinterConfig: retrofit-graph-source-pass
- cJSON: retrofit-graph-source-pass
- Native graph-notes: native-graph-source-pass
- Native graph-counter: native-graph-source-pass

## Instruction Packs

- CardPrinterConfig: retrofit-instruction-packs-pass
- cJSON: retrofit-instruction-pack-pass
- Native graph-notes: native-instruction-pack-pass
- Native graph-counter: native-instruction-pack-pass

## Graph Deltas

- cJSON: retrofit-graph-delta-pass
- Native graph-notes: native-graph-delta-pass
- Native graph-counter: native-graph-delta-pass

## Boundaries

- Utility_Windows modified by this smoke: False
- Utility_Windows mode: fixture-only
- cJSON dirty files: README.md
- Native dirty files: README.md
- Native behavior dirty files: counter.ps1, test-counter.ps1
- Enforcement: non-enforcing-local-smoke
- Maintainer intent claimed: False
