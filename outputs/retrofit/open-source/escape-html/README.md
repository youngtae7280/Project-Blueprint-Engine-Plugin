# escape-html External Behavior Dogfood Outputs

Current outputs:

- `dogfood-report.json`
- `dogfood-report.md`
- `graph-deltas/symbol-stringification.graph-delta.json`
- `graph-deltas/symbol-stringification.graph-delta.md`
- `graph-update-proposals/symbol-stringification.graph-update-proposal.json`
- `graph-update-proposals/symbol-stringification.graph-update-proposal.md`
- `instruction-packs/symbol-stringification.instruction-pack.json`
- `instruction-packs/symbol-stringification.instruction-pack.md`

This dogfood used a real local clone of `component/escape-html` under
`work/external/escape-html`, recovered the existing stringification and escaping
intent from README/source/tests, applied a tiny Symbol input behavior change,
and captured the result as graph delta plus graph update proposal. No upstream
PR was created.

The external project test suite passed with 31 tests after the change.
