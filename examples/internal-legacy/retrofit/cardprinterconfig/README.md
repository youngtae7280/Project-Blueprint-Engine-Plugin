# CardPrinterConfig Retrofit Example

This example captures two bounded retrofit DevView maintenance cycles against the
legacy `CardPrinterConfig` utility.

External project:

```text
C:/Users/ytkim/Desktop/kyt_work/Utility_Windows/src/CardPrinterConfig
```

## Records

1. `records/smart51-test-setting.validated-then-reverted.json`

   - user-confirmed SMART-51 Factory `test` display
   - build passed
   - hardware behavior passed
   - temporary external code was reverted

2. `records/laminator-tag-layout.active.json`
   - SMART-51/52 Laminator Tag tab layout alignment
   - resource-only coordinate change
   - build passed
   - user UI review passed
   - external code change remains active in `CardPrinterConfig.rc`

## Graph Source

`graph-source.json` connects the observed retrofit graph candidate to the two
formal change records.

The graph keeps candidate observation, user-confirmed intent, forbidden flows,
active code, and reverted code state separate. Edges carry `edgeIntent` claims
so future maintenance does not have to infer why a slice is safe or unsafe.

## Instruction Packs

Generated instruction packs live under
`outputs/retrofit/instruction-packs/`.

They are generated from `graph-source.json` plus one selected change record.
They show allowed files, forbidden flows, verification expectations, and the
edgeIntent context that explains why the boundary exists.

## Why This Example Matters

The example proves that DevView retrofit records need to capture:

- confirmed user intent
- observed code anchors
- candidate match
- allowed behavior
- forbidden flows
- implementation delta
- build evidence
- hardware or UI evidence
- final active/reverted state

This is the bridge between human-readable maintenance history and a graph that
future AI agents can use without guessing.

## Validation

Run the formal retrofit smoke:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\validate-devview-retrofit-smoke-v0.ps1
```

Run only the fixture validator:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\validate-retrofit-fixtures-v0.ps1
```

Run only the graph-source validator:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\validate-retrofit-graph-source-v0.ps1
```

For the reverted SMART-51 hardware case, local external-repo confirmation can
also be checked:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\validate-retrofit-change-record-v0.ps1 `
  -RecordPath examples\internal-legacy\retrofit\cardprinterconfig\records\smart51-test-setting.validated-then-reverted.json `
  -CheckExternalRepo
```
