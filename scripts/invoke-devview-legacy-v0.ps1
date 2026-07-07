param(
    [ValidateSet(
        "operation-chain",
        "artifact-inventory",
        "core-schemas",
        "retrofit-smoke",
        "cjson-dogfood",
        "native-notes-dogfood",
        "native-counter-dogfood",
        "evaluate-dogfood"
    )]
    [string]$Command = "operation-chain"
)

$ErrorActionPreference = "Stop"

function Format-DevViewLegacyOperationOutputs {
    $repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
    Push-Location $repoRoot
    try {
        & npx prettier --write "outputs/**/*.json" "outputs/**/*.md" | Out-Null
        if ($LASTEXITCODE -ne 0) {
            throw "Prettier formatting failed for DevView legacy operation outputs."
        }
    }
    finally {
        Pop-Location
    }
}

switch ($Command) {
    "operation-chain" {
        & (Join-Path $PSScriptRoot "validate-devview-legacy-operation-chain-v0.ps1")
        break
    }
    "artifact-inventory" {
        & (Join-Path $PSScriptRoot "generate-devview-legacy-artifact-inventory-v0.ps1")
        break
    }
    "core-schemas" {
        & (Join-Path $PSScriptRoot "validate-devview-legacy-core-schemas-v0.ps1")
        break
    }
    "retrofit-smoke" {
        & (Join-Path $PSScriptRoot "validate-devview-legacy-retrofit-smoke-v0.ps1") -SkipExternalRepo
        break
    }
    "cjson-dogfood" {
        & (Join-Path $PSScriptRoot "validate-open-source-cjson-dogfood-v0.ps1")
        break
    }
    "native-notes-dogfood" {
        & (Join-Path $PSScriptRoot "validate-native-graph-notes-dogfood-v0.ps1")
        break
    }
    "native-counter-dogfood" {
        & (Join-Path $PSScriptRoot "validate-native-graph-counter-dogfood-v0.ps1")
        break
    }
    "evaluate-dogfood" {
        & (Join-Path $PSScriptRoot "evaluate-devview-legacy-dogfood-v0.ps1")
        break
    }
}

Format-DevViewLegacyOperationOutputs
