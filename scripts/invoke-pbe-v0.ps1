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

function Format-PbeOperationOutputs {
    $repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
    Push-Location $repoRoot
    try {
        & npx prettier --write "outputs/**/*.json" "outputs/**/*.md" | Out-Null
        if ($LASTEXITCODE -ne 0) {
            throw "Prettier formatting failed for PBE operation outputs."
        }
    }
    finally {
        Pop-Location
    }
}

switch ($Command) {
    "operation-chain" {
        & (Join-Path $PSScriptRoot "validate-pbe-operation-chain-v0.ps1")
        break
    }
    "artifact-inventory" {
        & (Join-Path $PSScriptRoot "generate-pbe-artifact-inventory-v0.ps1")
        break
    }
    "core-schemas" {
        & (Join-Path $PSScriptRoot "validate-pbe-core-schemas-v0.ps1")
        break
    }
    "retrofit-smoke" {
        & (Join-Path $PSScriptRoot "validate-pbe-retrofit-smoke-v0.ps1") -SkipExternalRepo
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
        & (Join-Path $PSScriptRoot "evaluate-pbe-dogfood-v0.ps1")
        break
    }
}

Format-PbeOperationOutputs
