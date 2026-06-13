# Install PBE Locally

This guide gets a cloned Project Blueprint Engine repo to a local build, test, validation, and CLI smoke check.

Command examples prefer Windows `npm.cmd` because PowerShell can block `npm.ps1` on some machines. On macOS/Linux or
non-PowerShell shells, use `npm` instead.

## Prerequisites

- Node.js 20 LTS is recommended. CI runs on Node.js 20.
- npm, included with Node.js.
- Git.
- Windows users can use PowerShell or CMD. If PowerShell blocks `npm`, use `npm.cmd`.

## Clone

```bash
git clone https://github.com/youngtae7280/Project-Blueprint-Engine-Plugin.git
cd Project-Blueprint-Engine-Plugin
```

## Install Dependencies

Windows:

```bash
npm.cmd install
```

Non-Windows:

```bash
npm install
```

For CI-like clean installs, use `npm.cmd ci` or `npm ci`.

## Build CLI

```bash
npm.cmd run build:cli
```

## Run Checks

```bash
npm.cmd run format:check
npm.cmd run typecheck
npm.cmd test
npm.cmd run validate:pbe
npm.cmd run validate:pbe:v2
npm.cmd run test:examples
```

## Run CLI

```bash
node dist/cli/index.js --help
node dist/cli/index.js validate --json
```

If `dist/cli/index.js` is missing, build the CLI first:

```bash
npm.cmd run build:cli
```

## Recommended Local Verification

Run this before committing or pushing:

```bash
npm.cmd run format:check
npm.cmd run typecheck
npm.cmd test
npm.cmd run validate:pbe
npm.cmd run validate:pbe:v2
npm.cmd run test:examples
node dist/cli/index.js --help
node dist/cli/index.js validate --json
```

See [Troubleshooting](troubleshooting.md) for common Windows, npm, formatting, validation, and Git issues.
