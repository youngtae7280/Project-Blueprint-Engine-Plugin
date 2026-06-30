# Graph Operation-Chain Productization

Status: local-dogfood-productized / ci-observed / non-enforcing / no required check

This package turns the local PBE operation-chain experiments into versioned repo
artifacts.

Current shared loop:

```text
graph-source -> instruction pack -> local change -> graph delta -> graph update proposal
```

## Added Surface

- Common schema notes under `schemas/pbe/`.
- Retrofit change-record schema under `schemas/retrofit/`.
- Native dogfood examples under `examples/native/`.
- Retrofit dogfood examples under `examples/retrofit/`.
- Local PowerShell entry point: `scripts/invoke-pbe-v0.ps1`.
- Generated observation reports under `outputs/`.
- Non-enforcing CI observation through `.github/workflows/read-model-evidence.yml`.

## Local Commands

```powershell
npm run validate:pbe:operation-chain
```

```powershell
npm run validate:pbe:dogfood
```

The operation-chain command recreates small ignored target repos under `work/`
and validates graph-source, instruction pack, graph delta, graph update
proposal, and dogfood evaluation surfaces.

The read-model Evidence workflow also runs the same operation-chain and dogfood
evaluation commands with `pwsh`, uploads the `outputs/` reports, and records
`operationChainStatus` plus `dogfoodEvaluationStatus` in the CI manifest and
Step Summary. This is observation only; it is not a required check.

## Current Coverage

- CardPrinterConfig retrofit fixture smoke in fixture-only mode.
- cJSON-style open-source retrofit dogfood with maintainer-intent boundary.
- Real `mdn/todo-vue` external checkout dogfood with README-only instruction pack, graph delta, graph update proposal,
  and local Node/toolchain baseline blocker separation.
- Native graph-notes README-only dogfood.
- Native graph-counter behavior dogfood with a runtime test.

## Boundaries

- Non-enforcing local and CI observation only.
- No required check or branch protection.
- No tree retirement.
- No mutation of `Utility_Windows`.
- `work/` and `.tmp/` are ignored generated target areas.
