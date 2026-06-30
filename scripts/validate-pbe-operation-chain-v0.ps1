param(
    [string]$JsonOutputPath = "outputs/pbe-operation-chain/operation-chain-report.json",
    [string]$MarkdownOutputPath = "outputs/pbe-operation-chain/operation-chain-report.md"
)

$ErrorActionPreference = "Stop"

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path

function Resolve-RepoPath($Path) {
    if ([System.IO.Path]::IsPathRooted($Path)) {
        return $Path
    }

    return Join-Path $repoRoot $Path
}

function Fail($Message) {
    Write-Error $Message
    exit 1
}

$targetSetup = & (Join-Path $PSScriptRoot "setup-pbe-operation-chain-targets-v0.ps1")
if ($targetSetup.status -ne "pbe-operation-chain-targets-ready") {
    Fail "operation-chain target setup failed"
}

$retrofitSmoke = & (Join-Path $PSScriptRoot "validate-pbe-retrofit-smoke-v0.ps1") `
    -SkipExternalRepo `
    -JsonOutputPath "outputs/retrofit/pbe-retrofit-smoke-report.fixture-only.json" `
    -MarkdownOutputPath "outputs/retrofit/pbe-retrofit-smoke-report.fixture-only.md"
if ($retrofitSmoke.status -ne "pbe-retrofit-smoke-pass") {
    Fail "retrofit CardPrinterConfig fixture smoke failed"
}

$cjsonDogfood = & (Join-Path $PSScriptRoot "validate-open-source-cjson-dogfood-v0.ps1") `
    -JsonOutputPath "outputs/retrofit/open-source/cjson/dogfood-report.json" `
    -MarkdownOutputPath "outputs/retrofit/open-source/cjson/dogfood-report.md"
if ($cjsonDogfood.status -ne "open-source-cjson-dogfood-pass") {
    Fail "open-source cJSON dogfood failed"
}

$nativeDogfood = & (Join-Path $PSScriptRoot "validate-native-graph-notes-dogfood-v0.ps1") `
    -JsonOutputPath "outputs/native/graph-notes-demo/dogfood-report.json" `
    -MarkdownOutputPath "outputs/native/graph-notes-demo/dogfood-report.md"
if ($nativeDogfood.status -ne "native-graph-notes-dogfood-pass") {
    Fail "native graph-notes dogfood failed"
}

$nativeBehaviorDogfood = & (Join-Path $PSScriptRoot "validate-native-graph-counter-dogfood-v0.ps1") `
    -JsonOutputPath "outputs/native/graph-counter-demo/dogfood-report.json" `
    -MarkdownOutputPath "outputs/native/graph-counter-demo/dogfood-report.md"
if ($nativeBehaviorDogfood.status -ne "native-graph-counter-dogfood-pass") {
    Fail "native graph-counter behavior dogfood failed"
}

$summary = [PSCustomObject]@{
    status = "pbe-operation-chain-pass"
    operationChain = "graph-source -> instruction pack -> local change -> graph delta"
    repoRoot = $repoRoot
    checks = [PSCustomObject]@{
        cardPrinterConfigRetrofit = $retrofitSmoke.status
        openSourceCjsonRetrofit = $cjsonDogfood.status
        nativeGraphNotes = $nativeDogfood.status
        nativeGraphCounterBehavior = $nativeBehaviorDogfood.status
    }
    graphSourceStatuses = [PSCustomObject]@{
        cardPrinterConfig = $retrofitSmoke.graphSourceValidation
        cjson = $cjsonDogfood.graphSourceValidation
        nativeGraphNotes = $nativeDogfood.graphSourceValidation
        nativeGraphCounter = $nativeBehaviorDogfood.graphSourceValidation
    }
    instructionPackStatuses = [PSCustomObject]@{
        cardPrinterConfig = $retrofitSmoke.instructionPackValidation
        cjson = $cjsonDogfood.instructionPackValidation
        nativeGraphNotes = $nativeDogfood.instructionPackValidation
        nativeGraphCounter = $nativeBehaviorDogfood.instructionPackValidation
    }
    graphDeltaStatuses = [PSCustomObject]@{
        cjson = $cjsonDogfood.graphDeltaValidation
        nativeGraphNotes = $nativeDogfood.graphDeltaValidation
        nativeGraphCounter = $nativeBehaviorDogfood.graphDeltaValidation
    }
    boundaries = [PSCustomObject]@{
        utilityWindowsModifiedByThisSmoke = $false
        utilityWindowsMode = "fixture-only"
        cjsonDirtyFiles = @($cjsonDogfood.boundary.dirtyFiles)
        nativeDirtyFiles = @($nativeDogfood.boundary.dirtyFiles)
        nativeBehaviorDirtyFiles = @($nativeBehaviorDogfood.boundary.dirtyFiles)
        enforcement = "non-enforcing-local-smoke"
        maintainerIntentClaimed = $false
    }
}

if ($JsonOutputPath) {
    $jsonPath = Resolve-RepoPath $JsonOutputPath
    $jsonDir = Split-Path -Parent $jsonPath
    if ($jsonDir -and -not (Test-Path $jsonDir)) {
        New-Item -ItemType Directory -Path $jsonDir | Out-Null
    }
    $summary | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $jsonPath -Encoding UTF8
}

if ($MarkdownOutputPath) {
    $markdownPath = Resolve-RepoPath $MarkdownOutputPath
    $markdownDir = Split-Path -Parent $markdownPath
    if ($markdownDir -and -not (Test-Path $markdownDir)) {
        New-Item -ItemType Directory -Path $markdownDir | Out-Null
    }

    $lines = @(
        "# PBE Operation Chain Report",
        "",
        "Status: $($summary.status)",
        "",
        "Operation chain:",
        "",
        '```text',
        $summary.operationChain,
        '```',
        "",
        "## Checks",
        "",
        "- CardPrinterConfig retrofit fixture smoke: $($summary.checks.cardPrinterConfigRetrofit)",
        "- Open-source cJSON retrofit dogfood: $($summary.checks.openSourceCjsonRetrofit)",
        "- Native graph-notes dogfood: $($summary.checks.nativeGraphNotes)",
        "- Native graph-counter behavior dogfood: $($summary.checks.nativeGraphCounterBehavior)",
        "",
        "## Graph Sources",
        "",
        "- CardPrinterConfig: $($summary.graphSourceStatuses.cardPrinterConfig)",
        "- cJSON: $($summary.graphSourceStatuses.cjson)",
        "- Native graph-notes: $($summary.graphSourceStatuses.nativeGraphNotes)",
        "- Native graph-counter: $($summary.graphSourceStatuses.nativeGraphCounter)",
        "",
        "## Instruction Packs",
        "",
        "- CardPrinterConfig: $($summary.instructionPackStatuses.cardPrinterConfig)",
        "- cJSON: $($summary.instructionPackStatuses.cjson)",
        "- Native graph-notes: $($summary.instructionPackStatuses.nativeGraphNotes)",
        "- Native graph-counter: $($summary.instructionPackStatuses.nativeGraphCounter)",
        "",
        "## Graph Deltas",
        "",
        "- cJSON: $($summary.graphDeltaStatuses.cjson)",
        "- Native graph-notes: $($summary.graphDeltaStatuses.nativeGraphNotes)",
        "- Native graph-counter: $($summary.graphDeltaStatuses.nativeGraphCounter)",
        "",
        "## Boundaries",
        "",
        "- Utility_Windows modified by this smoke: $($summary.boundaries.utilityWindowsModifiedByThisSmoke)",
        "- Utility_Windows mode: $($summary.boundaries.utilityWindowsMode)",
        "- cJSON dirty files: $($summary.boundaries.cjsonDirtyFiles -join ', ')",
        "- Native dirty files: $($summary.boundaries.nativeDirtyFiles -join ', ')",
        "- Native behavior dirty files: $($summary.boundaries.nativeBehaviorDirtyFiles -join ', ')",
        "- Enforcement: $($summary.boundaries.enforcement)",
        "- Maintainer intent claimed: $($summary.boundaries.maintainerIntentClaimed)"
    )

    $lines | Set-Content -LiteralPath $markdownPath -Encoding UTF8
}

$summary
