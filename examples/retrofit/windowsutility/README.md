# WindowsUtility Retrofit Portfolio Graph

This fixture is a read-only DevViewGraph demo seed for the WindowsUtility / Utility_Windows retrofit story.

It intentionally separates two levels of confidence:

- `product.windowsutility-legacy` and `legacy-utility-module` nodes are observed top-level `Utility_Windows/src`
  inventory. They make the whole utility portfolio visible.
- The CardPrinterConfig nodes, edges, and records are the currently detailed retrofit slice. Only that selected slice
  is allowed to drive the instruction pack demo.

The demo command is:

```powershell
node dist/cli/index.js graph read-model render-devview-graph `
  --graph-source examples/retrofit/windowsutility/graph-source.json `
  --record change.laminator-tag-layout `
  --instruction-pack outputs/retrofit/instruction-packs/windowsutility-laminator-tag-layout.instruction-pack.json `
  --output outputs/devview-graph/windowsutility.devviewgraph.html `
  --data-output outputs/devview-graph/windowsutility.devviewgraph.data.json `
  --json
```

This fixture does not mutate `Utility_Windows`, mutate `WindowsUtility`, apply graph deltas, approve work, satisfy
runtime Evidence, prove equivalence, enforce scope, or configure CI.
