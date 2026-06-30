param(
    [string]$JsonOutputPath,
    [string]$MarkdownOutputPath
)

$ErrorActionPreference = "Stop"

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$cjsonRepo = Join-Path $repoRoot "work/open-source/cJSON"
$graphSourcePath = "examples/retrofit/open-source/cjson/graph-source.json"
$instructionPackPath = "outputs/retrofit/open-source/cjson/instruction-packs/readme-build-tooling-boundary.instruction-pack.json"
$graphDeltaPath = "outputs/retrofit/open-source/cjson/graph-deltas/readme-build-tooling-boundary.graph-delta.json"

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

if (-not (Test-Path $cjsonRepo)) {
    Fail "cJSON clone not found: $cjsonRepo"
}

$fixtureResult = & (Join-Path $PSScriptRoot "validate-retrofit-fixtures-v0.ps1")
if ($fixtureResult.status -ne "retrofit-fixtures-pass") {
    Fail "retrofit fixture validation failed"
}

$graphResult = & (Join-Path $PSScriptRoot "validate-retrofit-graph-source-v0.ps1") `
    -GraphSourcePath $graphSourcePath
if ($graphResult.status -ne "retrofit-graph-source-pass") {
    Fail "cJSON graph-source validation failed"
}

$packResult = & (Join-Path $PSScriptRoot "validate-retrofit-instruction-pack-v0.ps1") `
    -GraphSourcePath $graphSourcePath `
    -InstructionPackPath $instructionPackPath
if ($packResult.status -ne "retrofit-instruction-pack-pass") {
    Fail "cJSON instruction pack validation failed"
}

$deltaResult = & (Join-Path $PSScriptRoot "validate-retrofit-graph-delta-v0.ps1") `
    -GraphDeltaPath $graphDeltaPath `
    -InstructionPackPath $instructionPackPath `
    -TargetRepoPath "work/open-source/cJSON"
if ($deltaResult.status -ne "retrofit-graph-delta-pass") {
    Fail "cJSON graph delta validation failed"
}

$cjsonStatus = @(git -C $cjsonRepo status --short)
if ($LASTEXITCODE -ne 0) {
    Fail "git status failed for cJSON clone"
}

$dirtyFiles = @(
    $cjsonStatus | ForEach-Object { ($_ -replace "^\s*[A-Z?]{1,2}\s+", "").Trim() } | Where-Object { $_ }
)
foreach ($dirtyFile in $dirtyFiles) {
    if ($dirtyFile -ne "README.md") {
        Fail "Unexpected cJSON dirty file outside instruction-pack boundary: $dirtyFile"
    }
}

$instructionPack = Get-Content -LiteralPath (Resolve-RepoPath $instructionPackPath) -Raw | ConvertFrom-Json
$sourceRecord = Get-Content -LiteralPath (Resolve-RepoPath $instructionPack.sourceRecordPath) -Raw | ConvertFrom-Json

$cmakeStatus = if (Get-Command cmake -ErrorAction SilentlyContinue) { "available" } else { "unavailable" }
$gccStatus = if (Get-Command gcc -ErrorAction SilentlyContinue) { "available" } else { "unavailable" }
$clStatus = if (Get-Command cl -ErrorAction SilentlyContinue) { "available" } else { "unavailable" }

git -C $cjsonRepo rev-parse --is-inside-work-tree | Out-Null
if ($LASTEXITCODE -ne 0) {
    Fail "git rev-parse failed for cJSON clone"
}

$summary = [PSCustomObject]@{
    status = "open-source-cjson-dogfood-pass"
    upstream = "https://github.com/DaveGamble/cJSON"
    clonePath = "work/open-source/cJSON"
    cloneHead = "local-fixture-head"
    cloneDirty = (@($cjsonStatus).Count -ne 0)
    fixtureValidation = $fixtureResult.status
    graphSourceValidation = $graphResult.status
    graphSourceNodeCount = $graphResult.nodeCount
    graphSourceEdgeCount = $graphResult.edgeCount
    instructionPackValidation = $packResult.status
    graphDeltaValidation = $deltaResult.status
    graphDeltaChangedFileCount = $deltaResult.changedFileCount
    sourceRecordStatus = $sourceRecord.status
    sourceRecordActiveCodeState = $sourceRecord.finalState.activeCodeState
    instructionPackAllowedFileCount = $packResult.allowedFileCount
    instructionPackForbiddenFlowCount = $packResult.forbiddenFlowCount
    instructionPackEdgeIntentCount = $packResult.edgeIntentCount
    toolchain = [PSCustomObject]@{
        cmake = $cmakeStatus
        gcc = $gccStatus
        cl = $clStatus
    }
    boundary = [PSCustomObject]@{
        localSourceModified = (@($cjsonStatus).Count -ne 0)
        dirtyFiles = $dirtyFiles
        upstreamPrCreated = $false
        plannedOnly = ($sourceRecord.status -eq "planned-not-implemented")
        localDocOnlyApplied = ($sourceRecord.finalState.activeCodeState -eq "active-local-doc-only")
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
        "# Open Source cJSON Dogfood Report",
        "",
        "Status: $($summary.status)",
        "",
        "Clone HEAD: $($summary.cloneHead)",
        "",
        "## Checks",
        "",
        "- Fixture validation: $($summary.fixtureValidation)",
        "- Graph-source validation: $($summary.graphSourceValidation)",
        "- Graph-source nodes/edges: $($summary.graphSourceNodeCount) / $($summary.graphSourceEdgeCount)",
        "- Instruction pack validation: $($summary.instructionPackValidation)",
        "- Graph delta validation: $($summary.graphDeltaValidation)",
        "- Graph delta changed files: $($summary.graphDeltaChangedFileCount)",
        "- Source record status: $($summary.sourceRecordStatus)",
        "- Source record active code state: $($summary.sourceRecordActiveCodeState)",
        "- Instruction pack allowed files: $($summary.instructionPackAllowedFileCount)",
        "- Instruction pack forbidden flows: $($summary.instructionPackForbiddenFlowCount)",
        "- Instruction pack edge intents: $($summary.instructionPackEdgeIntentCount)",
        "",
        "## Toolchain",
        "",
        "- cmake: $($summary.toolchain.cmake)",
        "- gcc: $($summary.toolchain.gcc)",
        "- cl: $($summary.toolchain.cl)",
        "",
        "## Boundary",
        "",
        "- Local cJSON source modified: $($summary.boundary.localSourceModified)",
        "- Dirty files: $($summary.boundary.dirtyFiles -join ', ')",
        "- Upstream PR created: $($summary.boundary.upstreamPrCreated)",
        "- Planned-only candidate: $($summary.boundary.plannedOnly)",
        "- Local doc-only applied: $($summary.boundary.localDocOnlyApplied)",
        "- Maintainer intent claimed: $($summary.boundary.maintainerIntentClaimed)"
    )

    $lines | Set-Content -LiteralPath $markdownPath -Encoding UTF8
}

$summary
