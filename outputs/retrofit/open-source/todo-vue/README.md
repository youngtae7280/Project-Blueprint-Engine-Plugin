# todo-vue External Dogfood Outputs

Current outputs:

- `dogfood-report.json`
- `dogfood-report.md`
- `graph-deltas/readme-local-command-boundary.graph-delta.json`
- `graph-deltas/readme-local-command-boundary.graph-delta.md`
- `graph-update-proposals/readme-local-command-boundary.graph-update-proposal.json`
- `graph-update-proposals/readme-local-command-boundary.graph-update-proposal.md`
- `instruction-packs/readme-local-command-boundary.instruction-pack.json`
- `instruction-packs/readme-local-command-boundary.instruction-pack.md`

This dogfood used a real local clone of `mdn/todo-vue` under
`work/external/todo-vue`, applied only a README clarification, and captured the
result as graph delta plus graph update proposal. No upstream PR was created.

The local build check was separated as an external baseline/toolchain blocker:
`npm ci` passed, but `npm run build` could not complete under the local
Node.js/toolchain baseline. The selected README-only diff remained isolated.
