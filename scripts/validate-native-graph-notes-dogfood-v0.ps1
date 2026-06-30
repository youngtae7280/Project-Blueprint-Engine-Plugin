param(
    [string]$JsonOutputPath,
    [string]$MarkdownOutputPath
)

$ErrorActionPreference = "Stop"

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$targetRepo = Join-Path $repoRoot "work/native/graph-notes-demo"
$graphSourcePath = "examples/native/graph-notes-demo/graph-source.json"
$instructionPackPath = "outputs/native/graph-notes-demo/instruction-packs/add-maintenance-boundary.instruction-pack.json"
$graphDeltaPath = "outputs/native/graph-notes-demo/graph-deltas/add-maintenance-boundary.graph-delta.json"

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
    Fail "Native graph-notes target repo not found: $targetRepo"
}

$graphResult = & (Join-Path $PSScriptRoot "validate-retrofit-graph-source-v0.ps1") `
    -GraphSourcePath $graphSourcePath
if ($graphResult.status -ne "native-graph-source-pass") {
    Fail "native graph-source validation failed"
}

$packResult = & (Join-Path $PSScriptRoot "validate-retrofit-instruction-pack-v0.ps1") `
    -GraphSourcePath $graphSourcePath `
    -InstructionPackPath $instructionPackPath
if ($packResult.status -ne "native-instruction-pack-pass") {
    Fail "native instruction pack validation failed"
}

$deltaResult = & (Join-Path $PSScriptRoot "validate-retrofit-graph-delta-v0.ps1") `
    -GraphDeltaPath $graphDeltaPath `
    -InstructionPackPath $instructionPackPath `
    -TargetRepoPath "work/native/graph-notes-demo"
if ($deltaResult.status -ne "native-graph-delta-pass") {
    Fail "native graph delta validation failed"
}

$targetStatus = @(git -C $targetRepo status --short)
if ($LASTEXITCODE -ne 0) {
    Fail "git status failed for native graph-notes target repo"
}

$dirtyFiles = @(
    $targetStatus | ForEach-Object { ($_ -replace "^\s*[A-Z?]{1,2}\s+", "").Trim() } | Where-Object { $_ }
)
foreach ($dirtyFile in $dirtyFiles) {
    if ($dirtyFile -ne "README.md") {
        Fail "Unexpected native dirty file outside instruction-pack boundary: $dirtyFile"
    }
}

$instructionPack = Get-Content -LiteralPath (Resolve-RepoPath $instructionPackPath) -Raw | ConvertFrom-Json
$sourceRecord = Get-Content -LiteralPath (Resolve-RepoPath $instructionPack.sourceRecordPath) -Raw | ConvertFrom-Json
git -C $targetRepo rev-parse --is-inside-work-tree | Out-Null
if ($LASTEXITCODE -ne 0) {
    Fail "git rev-parse failed for native graph-notes target repo"
}

$summary = [PSCustomObject]@{
    status = "native-graph-notes-dogfood-pass"
    target = "work/native/graph-notes-demo"
    targetHead = "local-fixture-head"
    targetDirty = (@($targetStatus).Count -ne 0)
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
    boundary = [PSCustomObject]@{
        localSourceModified = (@($targetStatus).Count -ne 0)
        dirtyFiles = $dirtyFiles
        notesJsonModified = ($dirtyFiles -contains "notes.json")
        localDocOnlyApplied = ($sourceRecord.finalState.activeCodeState -eq "active-local-doc-only")
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
        "# Native Graph Notes Dogfood Report",
        "",
        "Status: $($summary.status)",
        "",
        "Target HEAD: $($summary.targetHead)",
        "",
        "## Checks",
        "",
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
        "## Boundary",
        "",
        "- Local target modified: $($summary.boundary.localSourceModified)",
        "- Dirty files: $($summary.boundary.dirtyFiles -join ', ')",
        "- notes.json modified: $($summary.boundary.notesJsonModified)",
        "- Local doc-only applied: $($summary.boundary.localDocOnlyApplied)"
    )

    $lines | Set-Content -LiteralPath $markdownPath -Encoding UTF8
}

$summary
