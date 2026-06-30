param(
    [string]$GraphSourcePath,
    [string]$InstructionPackPath,
    [string]$TargetRepoPath,
    [string]$JsonOutputPath,
    [string]$MarkdownOutputPath
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

if (-not $GraphSourcePath) { Fail "GraphSourcePath is required" }
if (-not $InstructionPackPath) { Fail "InstructionPackPath is required" }
if (-not $TargetRepoPath) { Fail "TargetRepoPath is required" }

$graphPath = Resolve-RepoPath $GraphSourcePath
$packPath = Resolve-RepoPath $InstructionPackPath
$targetPath = Resolve-RepoPath $TargetRepoPath

if (-not (Test-Path $graphPath)) { Fail "Graph source not found: $GraphSourcePath" }
if (-not (Test-Path $packPath)) { Fail "Instruction pack not found: $InstructionPackPath" }
if (-not (Test-Path $targetPath)) { Fail "Target repo not found: $TargetRepoPath" }

$graph = Get-Content -LiteralPath $graphPath -Raw | ConvertFrom-Json
$pack = Get-Content -LiteralPath $packPath -Raw | ConvertFrom-Json
$deltaArtifactRole = if ($graph.artifactRole -eq "native-graph-source-v0") {
    "native-graph-delta-v0"
}
else {
    "retrofit-graph-delta-v0"
}
$deltaLabel = if ($graph.artifactRole -eq "native-graph-source-v0") {
    "Native"
}
else {
    "Retrofit"
}

if (($pack.graphSourcePath -replace "\\", "/") -ne ($GraphSourcePath -replace "\\", "/")) {
    Fail "Instruction pack does not belong to graph source"
}

$dirtyFiles = @(
    git -C $targetPath diff --name-only |
        ForEach-Object { $_.Trim() } |
        Where-Object { $_ }
)
if ($LASTEXITCODE -ne 0) {
    Fail "git diff --name-only failed for target repo"
}

$allowedFiles = @($pack.allowedScope.files)
foreach ($file in $dirtyFiles) {
    if ($allowedFiles -notcontains $file) {
        Fail "Dirty file is outside instruction pack allowed files: $file"
    }
}

$numstatLines = @(
    git -C $targetPath diff --numstat |
        ForEach-Object { $_.Trim() } |
        Where-Object { $_ }
)
if ($LASTEXITCODE -ne 0) {
    Fail "git diff --numstat failed for target repo"
}

$changedFiles = @(
    foreach ($line in $numstatLines) {
        $parts = $line -split "\s+", 3
        if ($parts.Count -ge 3) {
            [PSCustomObject]@{
                path = $parts[2]
                additions = $parts[0]
                deletions = $parts[1]
            }
        }
    }
)

$relatedNodeIds = @{}
foreach ($edge in @($pack.graphContext.edgeIntents)) {
    $relatedEdge = $graph.edges | Where-Object { $_.id -eq $edge.id } | Select-Object -First 1
    if ($relatedEdge) {
        $relatedNodeIds[$relatedEdge.from] = $true
        $relatedNodeIds[$relatedEdge.to] = $true
    }
}

$relatedNodes = @(
    $graph.nodes | Where-Object { $relatedNodeIds.ContainsKey($_.id) } |
        ForEach-Object {
            [PSCustomObject]@{
                id = $_.id
                kind = $_.kind
                state = $_.state
                intentClaim = $_.intentClaim
            }
        }
)

$delta = [PSCustomObject]@{
    schemaVersion = 1
    artifactRole = $deltaArtifactRole
    status = "generated-from-target-diff"
    graphSourcePath = $GraphSourcePath
    instructionPackPath = $InstructionPackPath
    sourceRecordId = $pack.sourceRecordId
    targetRepoPath = $TargetRepoPath
    changedFiles = $changedFiles
    dirtyFileCount = @($dirtyFiles).Count
    allowedFileStatus = "dirty-files-within-instruction-pack"
    graphUpdate = [PSCustomObject]@{
        relatedNodes = $relatedNodes
        relatedEdgeIntents = @($pack.graphContext.edgeIntents)
        finalState = $pack.verification.finalState
    }
    boundaries = [PSCustomObject]@{
        appliesPatch = $false
        upstreamPrCreated = $false
        maintainerIntentClaimed = $false
    }
}

if ($JsonOutputPath) {
    $jsonPath = Resolve-RepoPath $JsonOutputPath
    $jsonDir = Split-Path -Parent $jsonPath
    if ($jsonDir -and -not (Test-Path $jsonDir)) {
        New-Item -ItemType Directory -Path $jsonDir | Out-Null
    }
    $delta | ConvertTo-Json -Depth 12 | Set-Content -LiteralPath $jsonPath -Encoding UTF8
}

if ($MarkdownOutputPath) {
    $markdownPath = Resolve-RepoPath $MarkdownOutputPath
    $markdownDir = Split-Path -Parent $markdownPath
    if ($markdownDir -and -not (Test-Path $markdownDir)) {
        New-Item -ItemType Directory -Path $markdownDir | Out-Null
    }

    $lines = @(
        "# $deltaLabel Graph Delta",
        "",
        "Status: $($delta.status)",
        "",
        "Record: $($delta.sourceRecordId)",
        "",
        "## Changed Files",
        "",
        "| File | Additions | Deletions |",
        "| --- | ---: | ---: |"
    )

    foreach ($file in $changedFiles) {
        $lines += "| $($file.path) | $($file.additions) | $($file.deletions) |"
    }

    $lines += @(
        "",
        "## Related Graph Context",
        ""
    )

    foreach ($node in $relatedNodes) {
        $lines += ("- ``{0}`` ({1}): {2}" -f $node.id, $node.kind, $node.intentClaim)
    }

    $lines += @(
        "",
        "## Edge Intent",
        ""
    )

    foreach ($edge in @($pack.graphContext.edgeIntents)) {
        $classes = @($edge.classifications) -join ", "
        $lines += ("- ``{0}`` [{1}]: {2}" -f $edge.id, $classes, $edge.claim)
    }

    $lines += @(
        "",
        "## Boundaries",
        "",
        "- Applies patch: $($delta.boundaries.appliesPatch)",
        "- Upstream PR created: $($delta.boundaries.upstreamPrCreated)",
        "- Maintainer intent claimed: $($delta.boundaries.maintainerIntentClaimed)"
    )

    $lines | Set-Content -LiteralPath $markdownPath -Encoding UTF8
}

$delta
