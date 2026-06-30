param(
    [string]$JsonOutputPath,
    [string]$MarkdownOutputPath
)

$ErrorActionPreference = "Stop"

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$targetRepo = Join-Path $repoRoot "work/native/graph-counter-demo"
$graphSourcePath = "examples/native/graph-counter-demo/graph-source.json"
$instructionPackPath = "outputs/native/graph-counter-demo/instruction-packs/counter-step-two.instruction-pack.json"
$graphDeltaPath = "outputs/native/graph-counter-demo/graph-deltas/counter-step-two.graph-delta.json"
$proposalPath = "outputs/native/graph-counter-demo/graph-update-proposals/counter-step-two.graph-update-proposal.json"

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

$graphResult = & (Join-Path $PSScriptRoot "validate-retrofit-graph-source-v0.ps1") -GraphSourcePath $graphSourcePath
if ($graphResult.status -ne "native-graph-source-pass") { Fail "counter graph-source validation failed" }

$recordResult = & (Join-Path $PSScriptRoot "validate-retrofit-change-record-v0.ps1") -RecordPath "examples/native/graph-counter-demo/records/counter-step-two.active.json"
if ($recordResult.status -ne "retrofit-change-record-pass") { Fail "counter change record validation failed" }

$packResult = & (Join-Path $PSScriptRoot "validate-retrofit-instruction-pack-v0.ps1") -GraphSourcePath $graphSourcePath -InstructionPackPath $instructionPackPath
if ($packResult.status -ne "native-instruction-pack-pass") { Fail "counter instruction pack validation failed" }

$runtimeOutput = & (Join-Path $PSScriptRoot "test-graph-counter-demo-v0.ps1")
if ($LASTEXITCODE -ne 0) { Fail "counter runtime test failed" }

$deltaResult = & (Join-Path $PSScriptRoot "validate-retrofit-graph-delta-v0.ps1") -GraphDeltaPath $graphDeltaPath -InstructionPackPath $instructionPackPath -TargetRepoPath "work/native/graph-counter-demo"
if ($deltaResult.status -ne "native-graph-delta-pass") { Fail "counter graph delta validation failed" }

$proposal = Get-Content -LiteralPath (Resolve-RepoPath $proposalPath) -Raw | ConvertFrom-Json
if ($proposal.status -ne "generated-from-graph-delta") { Fail "counter graph update proposal invalid" }
if ($proposal.boundaries.mutatesGraphSource -ne $false) { Fail "counter proposal must not mutate graph-source" }

$targetStatus = @(git -C $targetRepo status --short)
if ($LASTEXITCODE -ne 0) { Fail "git status failed for graph counter target" }
$dirtyFiles = @($targetStatus | ForEach-Object { ($_ -replace "^\s*[A-Z?]{1,2}\s+", "").Trim() } | Where-Object { $_ })
foreach ($dirtyFile in $dirtyFiles) {
    if (@("counter.ps1", "test-counter.ps1") -notcontains $dirtyFile) {
        Fail "Unexpected graph counter dirty file: $dirtyFile"
    }
}

$summary = [PSCustomObject]@{
    status = "native-graph-counter-dogfood-pass"
    target = "work/native/graph-counter-demo"
    targetDirty = (@($targetStatus).Count -ne 0)
    graphSourceValidation = $graphResult.status
    recordValidation = $recordResult.status
    instructionPackValidation = $packResult.status
    runtimeTest = @($runtimeOutput)[-1]
    graphDeltaValidation = $deltaResult.status
    graphDeltaChangedFileCount = $deltaResult.changedFileCount
    graphUpdateProposalStatus = $proposal.status
    sourceRecordStatus = $recordResult.recordStatus
    sourceRecordActiveCodeState = $recordResult.activeCodeState
    boundary = [PSCustomObject]@{
        dirtyFiles = $dirtyFiles
        behaviorFilesOnly = (@($dirtyFiles | Where-Object { @("counter.ps1", "test-counter.ps1") -notcontains $_ }).Count -eq 0)
        graphSourceMutated = $false
    }
}

if ($JsonOutputPath) {
    $jsonPath = Resolve-RepoPath $JsonOutputPath
    $jsonDir = Split-Path -Parent $jsonPath
    if ($jsonDir -and -not (Test-Path $jsonDir)) { New-Item -ItemType Directory -Path $jsonDir | Out-Null }
    $summary | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $jsonPath -Encoding UTF8
}

if ($MarkdownOutputPath) {
    $markdownPath = Resolve-RepoPath $MarkdownOutputPath
    $markdownDir = Split-Path -Parent $markdownPath
    if ($markdownDir -and -not (Test-Path $markdownDir)) { New-Item -ItemType Directory -Path $markdownDir | Out-Null }
    $lines = @(
        "# Native Graph Counter Dogfood Report",
        "",
        "Status: $($summary.status)",
        "",
        "## Checks",
        "",
        "- Graph-source: $($summary.graphSourceValidation)",
        "- Record: $($summary.recordValidation)",
        "- Instruction pack: $($summary.instructionPackValidation)",
        "- Runtime test: $($summary.runtimeTest)",
        "- Graph delta: $($summary.graphDeltaValidation)",
        "- Graph update proposal: $($summary.graphUpdateProposalStatus)",
        "",
        "## Boundary",
        "",
        "- Dirty files: $($summary.boundary.dirtyFiles -join ', ')",
        "- Behavior files only: $($summary.boundary.behaviorFilesOnly)",
        "- Graph-source mutated: $($summary.boundary.graphSourceMutated)"
    )
    $lines | Set-Content -LiteralPath $markdownPath -Encoding UTF8
}

$summary
