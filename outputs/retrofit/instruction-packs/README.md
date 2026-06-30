# Retrofit Instruction Packs

Instruction packs are generated from:

1. `examples/retrofit/cardprinterconfig/graph-source.json`
2. a selected formal change record under
   `examples/retrofit/cardprinterconfig/records/`

They are the bridge from graph knowledge to bounded execution guidance.

Current packs:

- `laminator-tag-layout.instruction-pack.json`
- `laminator-tag-layout.instruction-pack.md`
  - active layout-only SMART-51/52 Laminator Tag tab change
- `smart51-test-setting.instruction-pack.json`
- `smart51-test-setting.instruction-pack.md`
  - validated-then-reverted SMART-51 Factory test display case

These packs do not apply changes by themselves. External project modification
still requires explicit user approval.
