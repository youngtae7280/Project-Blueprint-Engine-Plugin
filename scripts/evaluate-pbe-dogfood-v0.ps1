param(
    [string]$JsonOutputPath = "outputs/pbe-operation-chain/dogfood-evaluation.json",
    [string]$MarkdownOutputPath = "outputs/pbe-operation-chain/dogfood-evaluation.md"
)

$ErrorActionPreference = "Stop"

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path

function Resolve-RepoPath($Path) {
    if ([System.IO.Path]::IsPathRooted($Path)) { return $Path }
    return Join-Path $repoRoot $Path
}

function Read-Json($Path) {
    Get-Content -LiteralPath (Resolve-RepoPath $Path) -Raw | ConvertFrom-Json
}

$operation = Read-Json "outputs/pbe-operation-chain/operation-chain-report.json"
$cjson = Read-Json "outputs/retrofit/open-source/cjson/dogfood-report.json"
$nativeNotes = Read-Json "outputs/native/graph-notes-demo/dogfood-report.json"
$nativeCounter = Read-Json "outputs/native/graph-counter-demo/dogfood-report.json"

$criteria = @(
    [PSCustomObject]@{
        id = "scope-boundary"
        status = if (
            $operation.boundaries.utilityWindowsModifiedByThisSmoke -eq $false -and
            $cjson.boundary.dirtyFiles -contains "README.md" -and
            $nativeNotes.boundary.dirtyFiles -contains "README.md" -and
            $nativeCounter.boundary.behaviorFilesOnly -eq $true
        ) { "pass" } else { "fail" }
        meaning = "All local changes stay inside instruction-pack allowed files."
    },
    [PSCustomObject]@{
        id = "intent-graph-present"
        status = if (
            $operation.graphSourceStatuses.cardPrinterConfig -and
            $operation.graphSourceStatuses.cjson -and
            $operation.graphSourceStatuses.nativeGraphNotes -and
            $operation.graphSourceStatuses.nativeGraphCounter
        ) { "pass" } else { "fail" }
        meaning = "Each dogfood path is backed by a graph-source."
    },
    [PSCustomObject]@{
        id = "instruction-pack-present"
        status = if (
            $operation.instructionPackStatuses.cardPrinterConfig -and
            $operation.instructionPackStatuses.cjson -and
            $operation.instructionPackStatuses.nativeGraphNotes -and
            $operation.instructionPackStatuses.nativeGraphCounter
        ) { "pass" } else { "fail" }
        meaning = "Each selected change has a generated instruction pack."
    },
    [PSCustomObject]@{
        id = "graph-delta-present"
        status = if (
            $operation.graphDeltaStatuses.cjson -and
            $operation.graphDeltaStatuses.nativeGraphNotes -and
            $operation.graphDeltaStatuses.nativeGraphCounter
        ) { "pass" } else { "fail" }
        meaning = "Applied local dogfood changes have graph deltas."
    },
    [PSCustomObject]@{
        id = "behavior-proof"
        status = if ($nativeCounter.runtimeTest -eq "graph-counter-demo-pass") { "pass" } else { "fail" }
        meaning = "At least one dogfood includes a real behavior/test change."
    },
    [PSCustomObject]@{
        id = "external-intent-boundary"
        status = if ($cjson.boundary.maintainerIntentClaimed -eq $false) { "pass" } else { "fail" }
        meaning = "Open-source retrofit does not claim maintainer intent."
    }
)

$summary = [PSCustomObject]@{
    status = if (@($criteria | Where-Object { $_.status -ne "pass" }).Count -eq 0) { "pbe-dogfood-evaluation-pass" } else { "pbe-dogfood-evaluation-fail" }
    criteria = $criteria
    score = [PSCustomObject]@{
        passed = @($criteria | Where-Object { $_.status -eq "pass" }).Count
        total = @($criteria).Count
    }
    boundaries = [PSCustomObject]@{
        nonEnforcing = $true
        noRequiredCheck = $true
        noTreeRetirement = $true
    }
}

$jsonPath = Resolve-RepoPath $JsonOutputPath
$jsonDir = Split-Path -Parent $jsonPath
if ($jsonDir -and -not (Test-Path $jsonDir)) { New-Item -ItemType Directory -Path $jsonDir | Out-Null }
$summary | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $jsonPath -Encoding UTF8

$markdownPath = Resolve-RepoPath $MarkdownOutputPath
$markdownDir = Split-Path -Parent $markdownPath
if ($markdownDir -and -not (Test-Path $markdownDir)) { New-Item -ItemType Directory -Path $markdownDir | Out-Null }
$lines = @(
    "# PBE Dogfood Evaluation",
    "",
    "Status: $($summary.status)",
    "",
    "Score: $($summary.score.passed) / $($summary.score.total)",
    "",
    "| Criterion | Status | Meaning |",
    "| --- | --- | --- |"
)
foreach ($item in $criteria) {
    $lines += "| $($item.id) | $($item.status) | $($item.meaning) |"
}
$lines += @(
    "",
    "## Boundaries",
    "",
    "- Non-enforcing: $($summary.boundaries.nonEnforcing)",
    "- Required check enabled: False",
    "- Tree retirement: False"
)
$lines | Set-Content -LiteralPath $markdownPath -Encoding UTF8

$summary
