param(
    [string]$GraphDeltaPath,
    [string]$InstructionPackPath,
    [string]$TargetRepoPath
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

if (-not $GraphDeltaPath) { Fail "GraphDeltaPath is required" }
if (-not $InstructionPackPath) { Fail "InstructionPackPath is required" }
if (-not $TargetRepoPath) { Fail "TargetRepoPath is required" }

$deltaPath = Resolve-RepoPath $GraphDeltaPath
$packPath = Resolve-RepoPath $InstructionPackPath
$targetPath = Resolve-RepoPath $TargetRepoPath

if (-not (Test-Path $deltaPath)) { Fail "Graph delta not found: $GraphDeltaPath" }
if (-not (Test-Path $packPath)) { Fail "Instruction pack not found: $InstructionPackPath" }
if (-not (Test-Path $targetPath)) { Fail "Target repo not found: $TargetRepoPath" }

$delta = Get-Content -LiteralPath $deltaPath -Raw | ConvertFrom-Json
$pack = Get-Content -LiteralPath $packPath -Raw | ConvertFrom-Json
$statusLabel = if ($delta.artifactRole -eq "native-graph-delta-v0") {
    "native-graph-delta-pass"
}
else {
    "retrofit-graph-delta-pass"
}

$allowedArtifactRoles = @("retrofit-graph-delta-v0", "native-graph-delta-v0")
if ($allowedArtifactRoles -notcontains $delta.artifactRole) {
    Fail "Unexpected graph delta artifactRole: $($delta.artifactRole)"
}

if (($delta.instructionPackPath -replace "\\", "/") -ne ($InstructionPackPath -replace "\\", "/")) {
    Fail "Graph delta instructionPackPath mismatch"
}

if ($delta.sourceRecordId -ne $pack.sourceRecordId) {
    Fail "Graph delta sourceRecordId mismatch"
}

$dirtyFiles = @(
    git -C $targetPath diff --name-only |
        ForEach-Object { $_.Trim() } |
        Where-Object { $_ }
)
if ($LASTEXITCODE -ne 0) {
    Fail "git diff --name-only failed for target repo"
}

$deltaFiles = @($delta.changedFiles | ForEach-Object { $_.path })
foreach ($file in $dirtyFiles) {
    if ($deltaFiles -notcontains $file) {
        Fail "Graph delta missing dirty file: $file"
    }
}

$allowedFiles = @($pack.allowedScope.files)
foreach ($file in $deltaFiles) {
    if ($allowedFiles -notcontains $file) {
        Fail "Graph delta file outside allowed scope: $file"
    }
}

if (-not $delta.graphUpdate.relatedEdgeIntents -or @($delta.graphUpdate.relatedEdgeIntents).Count -eq 0) {
    Fail "Graph delta must include related edge intents"
}

if ($delta.boundaries.appliesPatch -ne $false) {
    Fail "Graph delta must not apply patch by itself"
}

if ($delta.boundaries.maintainerIntentClaimed -ne $false) {
    Fail "Graph delta must not claim maintainer intent"
}

[PSCustomObject]@{
    status = $statusLabel
    graphDelta = $GraphDeltaPath
    sourceRecordId = $delta.sourceRecordId
    changedFileCount = @($delta.changedFiles).Count
    relatedEdgeIntentCount = @($delta.graphUpdate.relatedEdgeIntents).Count
    allowedFileStatus = $delta.allowedFileStatus
}
