# Troubleshooting

This page covers common local setup, validation, and Git issues while working on Project Blueprint Engine.

## `npm.ps1 cannot be loaded because running scripts is disabled`

Symptom:

PowerShell reports an execution policy error when running `npm`.

Recommended fix:

On Windows PowerShell, prefer `npm.cmd` instead of `npm` when `npm` is blocked by the script execution policy:

```bash
npm.cmd run validate:pbe
```

This guide does not require changing the system execution policy. Prefer the safe `npm.cmd` workaround first.

## `npm ENOENT: Could not read package.json`

Symptom:

npm looks for `C:\Users\...\package.json` or another unexpected path.

Cause:

The command is being run outside the project root.

Fix:

```bash
cd path\to\Project-Blueprint-Engine-Plugin
dir package.json
npm.cmd run build:cli
```

## `node dist/cli/index.js` Not Found

Cause:

The CLI has not been built yet, or `dist/` was cleaned.

Fix:

```bash
npm.cmd run build:cli
node dist/cli/index.js --help
```

## `format:check` Fails On Many Files

Possible causes:

- Formatting has not been applied.
- CRLF/LF line endings differ after checkout.
- Windows checkout settings touched many files.

Fix:

```bash
npm.cmd run format
npm.cmd run format:check
```

If the repo adds a `.gitattributes` policy later, it should normalize line endings consistently across Windows and
Linux. Until then, rely on Prettier as the source of formatting truth.

## `validate:pbe` Fails

Read the failing validator name first, then inspect each issue code, `suggestedFix`, and `nextCommand`.

Common validator names:

- `Skills`
- `Skills CLI sync`
- `Templates`
- `Schemas`
- `Examples`
- `Compatibility core`

Run:

```bash
npm.cmd run validate:pbe
node dist/cli/index.js validate --json
```

## Windows `EPERM` Involving `clean-dist` During Validation

Symptom:

Windows reports an `EPERM` file locking error while `clean-dist` removes or rebuilds `dist`.

Cause:

If `validate:pbe` and `test:examples` are started at the same time, they may both touch the generated `dist` /
`clean-dist` area. On Windows this can occasionally surface as an `EPERM` file locking error.

Fix:

Run the verification commands sequentially:

```powershell
npm.cmd run validate:pbe
npm.cmd run test:examples
```

If the commands pass when rerun sequentially, this is a local command scheduling issue rather than a PBE validation
failure.

## `test:examples` Fails

The example regression suite checks `examples/valid` and `examples/invalid`.

- The valid fixture must pass.
- Invalid fixtures must fail with the expected issue code.
- Adoption examples under `examples/adoption` may be illustrative snapshots rather than regression fixtures.

Run:

```bash
npm.cmd run test:examples
```

Then inspect the reported valid fixture or invalid fixture issue code.

## `git commit` Fails: `Author identity unknown`

Set your Git identity:

```bash
git config user.name "영태 김"
git config user.email "youngtae7280@gmail.com"
```

Use your actual Git name and email if different.

## Working Tree Is Not Clean

Check:

```bash
git status
git diff --name-only
```

Before committing, review the changed files and avoid mixing unrelated work into one commit. For example, do not bundle
Product Patch implementation changes with unrelated documentation or formatting changes unless that was the intended
task scope.
