param(
    [string]$InstructionPackPath,
    [string]$GraphSourcePath = "examples/retrofit/cardprinterconfig/graph-source.json"
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

function Normalize-RepoPathText($Path) {
    return ($Path -replace "\\", "/")
}

if (-not $InstructionPackPath) {
    Fail "InstructionPackPath is required"
}

$packPath = Resolve-RepoPath $InstructionPackPath
if (-not (Test-Path $packPath)) {
    Fail "Instruction pack not found: $InstructionPackPath"
}

$graphPath = Resolve-RepoPath $GraphSourcePath
if (-not (Test-Path $graphPath)) {
    Fail "Graph source not found: $GraphSourcePath"
}

$pack = Get-Content -LiteralPath $packPath -Raw | ConvertFrom-Json
$graph = Get-Content -LiteralPath $graphPath -Raw | ConvertFrom-Json
$statusLabel = if ($pack.artifactRole -eq "native-instruction-pack-v0") {
    "native-instruction-pack-pass"
}
else {
    "retrofit-instruction-pack-pass"
}

$allowedArtifactRoles = @("retrofit-instruction-pack-v0", "native-instruction-pack-v0")
if ($allowedArtifactRoles -notcontains $pack.artifactRole) {
    Fail "Unexpected instruction pack artifactRole: $($pack.artifactRole)"
}

if ((Normalize-RepoPathText $pack.graphSourcePath) -ne (Normalize-RepoPathText $GraphSourcePath)) {
    Fail "Instruction pack graphSourcePath mismatch"
}

$recordRef = $graph.records | Where-Object { $_.id -eq $pack.sourceRecordId } | Select-Object -First 1
if (-not $recordRef) {
    Fail "Instruction pack sourceRecordId not found in graph: $($pack.sourceRecordId)"
}

if ($pack.sourceRecordPath -ne $recordRef.path) {
    Fail "Instruction pack sourceRecordPath mismatch"
}

$record = Get-Content -LiteralPath (Resolve-RepoPath $recordRef.path) -Raw | ConvertFrom-Json

$packAllowedFiles = @($pack.allowedScope.files)
$recordAllowedFiles = @($record.implementationPlan.expectedFiles)
foreach ($file in $recordAllowedFiles) {
    if ($packAllowedFiles -notcontains $file) {
        Fail "Instruction pack missing allowed file from record: $file"
    }
}

if (@($pack.forbiddenScope.flows).Count -lt @($record.forbiddenFlows).Count) {
    Fail "Instruction pack has fewer forbidden flows than source record"
}

if (-not $pack.graphContext.edgeIntents -or @($pack.graphContext.edgeIntents).Count -eq 0) {
    Fail "Instruction pack must include graph edge intents"
}

foreach ($edge in $pack.graphContext.edgeIntents) {
    if (-not $edge.claim) {
        Fail "Instruction pack edge intent missing claim: $($edge.id)"
    }
    if (-not $edge.classifications -or @($edge.classifications).Count -eq 0) {
        Fail "Instruction pack edge intent missing classifications: $($edge.id)"
    }
}

if ($pack.executionBoundary.mayModifyExternalProject -ne $false) {
    Fail "Instruction pack must not allow automatic external project modification"
}

if ($pack.executionBoundary.requiresUserApprovalBeforeApplying -ne $true) {
    Fail "Instruction pack must require user approval before applying"
}

[PSCustomObject]@{
    status = $statusLabel
    instructionPack = $InstructionPackPath
    sourceRecordId = $pack.sourceRecordId
    allowedFileCount = @($pack.allowedScope.files).Count
    forbiddenFlowCount = @($pack.forbiddenScope.flows).Count
    edgeIntentCount = @($pack.graphContext.edgeIntents).Count
}
