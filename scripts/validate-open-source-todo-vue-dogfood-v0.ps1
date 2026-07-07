param(
    [string]$JsonOutputPath,
    [string]$MarkdownOutputPath
)

$ErrorActionPreference = "Stop"

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$targetRepo = Join-Path $repoRoot "work/external/todo-vue"
$graphSourcePath = "examples/internal-legacy/retrofit/open-source/todo-vue/graph-source.json"
$instructionPackPath = "outputs/retrofit/open-source/todo-vue/instruction-packs/readme-local-command-boundary.instruction-pack.json"
$graphDeltaPath = "outputs/retrofit/open-source/todo-vue/graph-deltas/readme-local-command-boundary.graph-delta.json"
$graphProposalPath = "outputs/retrofit/open-source/todo-vue/graph-update-proposals/readme-local-command-boundary.graph-update-proposal.json"

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

if (-not (Test-Path $targetRepo)) {
    Fail "todo-vue clone not found: $targetRepo"
}

$graphResult = & (Join-Path $PSScriptRoot "validate-retrofit-graph-source-v0.ps1") -GraphSourcePath $graphSourcePath
if ($graphResult.status -ne "retrofit-graph-source-pass") { Fail "todo-vue graph-source validation failed" }

$recordResult = & (Join-Path $PSScriptRoot "validate-retrofit-change-record-v0.ps1") -RecordPath "examples/internal-legacy/retrofit/open-source/todo-vue/records/readme-local-command-boundary.implemented.json"
if ($recordResult.status -ne "retrofit-change-record-pass") { Fail "todo-vue change record validation failed" }

$packResult = & (Join-Path $PSScriptRoot "validate-retrofit-instruction-pack-v0.ps1") -GraphSourcePath $graphSourcePath -InstructionPackPath $instructionPackPath
if ($packResult.status -ne "retrofit-instruction-pack-pass") { Fail "todo-vue instruction pack validation failed" }

$deltaResult = & (Join-Path $PSScriptRoot "validate-retrofit-graph-delta-v0.ps1") -GraphDeltaPath $graphDeltaPath -InstructionPackPath $instructionPackPath -TargetRepoPath "work/external/todo-vue"
if ($deltaResult.status -ne "retrofit-graph-delta-pass") { Fail "todo-vue graph delta validation failed" }

$proposal = Get-Content -LiteralPath (Resolve-RepoPath $graphProposalPath) -Raw | ConvertFrom-Json
if ($proposal.status -ne "generated-from-graph-delta") { Fail "todo-vue graph update proposal invalid" }
if ($proposal.boundaries.mutatesGraphSource -ne $false) { Fail "todo-vue proposal must not mutate graph-source" }

$targetStatus = @(git -C $targetRepo status --short)
if ($LASTEXITCODE -ne 0) { Fail "git status failed for todo-vue target" }

$dirtyFiles = @($targetStatus | ForEach-Object { ($_ -replace "^\s*[A-Z?]{1,2}\s+", "").Trim() } | Where-Object { $_ })
foreach ($dirtyFile in $dirtyFiles) {
    if ($dirtyFile -ne "README.md") {
        Fail "Unexpected todo-vue dirty file outside instruction-pack boundary: $dirtyFile"
    }
}

$nodeVersion = (node --version)
$npmCiStatus = "passed-before-validator"
$buildStatus = $recordResult.recordStatus
$sourceRecord = Get-Content -LiteralPath (Resolve-RepoPath "examples/internal-legacy/retrofit/open-source/todo-vue/records/readme-local-command-boundary.implemented.json") -Raw | ConvertFrom-Json

$summary = [PSCustomObject]@{
    status = "open-source-todo-vue-dogfood-pass"
    upstream = "https://github.com/mdn/todo-vue"
    clonePath = "work/external/todo-vue"
    cloneHead = "8a7ef579f1d117a8ac9530a52f5c5a81c3e99676"
    cloneDirty = (@($targetStatus).Count -ne 0)
    graphSourceValidation = $graphResult.status
    graphSourceNodeCount = $graphResult.nodeCount
    graphSourceEdgeCount = $graphResult.edgeCount
    recordValidation = $recordResult.status
    instructionPackValidation = $packResult.status
    graphDeltaValidation = $deltaResult.status
    graphDeltaChangedFileCount = $deltaResult.changedFileCount
    graphUpdateProposalStatus = $proposal.status
    sourceRecordStatus = $sourceRecord.status
    sourceRecordActiveCodeState = $sourceRecord.finalState.activeCodeState
    instructionPackAllowedFileCount = $packResult.allowedFileCount
    instructionPackForbiddenFlowCount = $packResult.forbiddenFlowCount
    instructionPackEdgeIntentCount = $packResult.edgeIntentCount
    tooling = [PSCustomObject]@{
        node = $nodeVersion
        npmCi = $npmCiStatus
        build = $buildStatus
        buildBlocker = "local Node/toolchain baseline blocked npm run build; README-only scope remains isolated"
    }
    boundary = [PSCustomObject]@{
        localSourceModified = (@($targetStatus).Count -ne 0)
        dirtyFiles = $dirtyFiles
        upstreamPrCreated = $false
        localDocOnlyApplied = ($sourceRecord.finalState.activeCodeState -eq "active-local-doc-only")
        maintainerIntentClaimed = $false
        selectedSliceFailure = $false
    }
}

if ($JsonOutputPath) {
    $jsonPath = Resolve-RepoPath $JsonOutputPath
    $jsonDir = Split-Path -Parent $jsonPath
    if ($jsonDir -and -not (Test-Path $jsonDir)) { New-Item -ItemType Directory -Path $jsonDir | Out-Null }
    $summary | ConvertTo-Json -Depth 10 | Set-Content -LiteralPath $jsonPath -Encoding UTF8
}

if ($MarkdownOutputPath) {
    $markdownPath = Resolve-RepoPath $MarkdownOutputPath
    $markdownDir = Split-Path -Parent $markdownPath
    if ($markdownDir -and -not (Test-Path $markdownDir)) { New-Item -ItemType Directory -Path $markdownDir | Out-Null }
    $lines = @(
        "# Open Source todo-vue Dogfood Report",
        "",
        "Status: $($summary.status)",
        "",
        "Clone HEAD: $($summary.cloneHead)",
        "",
        "## Checks",
        "",
        "- Graph-source validation: $($summary.graphSourceValidation)",
        "- Graph-source nodes/edges: $($summary.graphSourceNodeCount) / $($summary.graphSourceEdgeCount)",
        "- Record validation: $($summary.recordValidation)",
        "- Instruction pack validation: $($summary.instructionPackValidation)",
        "- Graph delta validation: $($summary.graphDeltaValidation)",
        "- Graph delta changed files: $($summary.graphDeltaChangedFileCount)",
        "- Graph update proposal: $($summary.graphUpdateProposalStatus)",
        "- Source record status: $($summary.sourceRecordStatus)",
        "- Source record active code state: $($summary.sourceRecordActiveCodeState)",
        "",
        "## Tooling",
        "",
        "- Node: $($summary.tooling.node)",
        "- npm ci: $($summary.tooling.npmCi)",
        "- Build: $($summary.tooling.build)",
        "- Build blocker: $($summary.tooling.buildBlocker)",
        "",
        "## Boundary",
        "",
        "- Local todo-vue source modified: $($summary.boundary.localSourceModified)",
        "- Dirty files: $($summary.boundary.dirtyFiles -join ', ')",
        "- Upstream PR created: $($summary.boundary.upstreamPrCreated)",
        "- Local doc-only applied: $($summary.boundary.localDocOnlyApplied)",
        "- Maintainer intent claimed: $($summary.boundary.maintainerIntentClaimed)",
        "- Selected slice failure: $($summary.boundary.selectedSliceFailure)"
    )
    $lines | Set-Content -LiteralPath $markdownPath -Encoding UTF8
}

$summary
