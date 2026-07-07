# Self-Dogfooding: Windows Sequential Validation Guidance

This example records a small DevView self-dogfooding slice against the DevView repository itself.

Problem:

`npm.cmd run validate:devview` and `npm.cmd run test:examples` both build the CLI. When started in parallel on Windows, they
may both touch `clean-dist` / `dist`, which can surface as an `EPERM` file locking error.

Decision:

This slice does not change `clean-dist`, npm scripts, CI, or CLI code. It documents the safer local workflow:
verification commands should be run sequentially.

Touched docs:

- `docs/install.md`
- `docs/troubleshooting.md`
- `docs/cli-reference.md`

Out of scope:

- `clean-dist` locking code changes
- npm script restructuring
- CI workflow changes
- cross-platform lock implementation
- test runner parallelism control

Example artifacts in this folder show the Product, Work, Test, Evidence, and Acceptance view for the slice. They are
illustrative self-dogfooding snapshots and are not wired into `test:examples`.
