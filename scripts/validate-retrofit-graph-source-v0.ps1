param(
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

$resolvedGraphPath = Resolve-RepoPath $GraphSourcePath
if (-not (Test-Path $resolvedGraphPath)) {
    Fail "Graph source not found: $GraphSourcePath"
}

$graph = Get-Content -LiteralPath $resolvedGraphPath -Raw | ConvertFrom-Json
$statusLabel = if ($graph.artifactRole -eq "native-graph-source-v0") {
    "native-graph-source-pass"
}
else {
    "retrofit-graph-source-pass"
}

$allowedArtifactRoles = @("retrofit-graph-source-v0", "native-graph-source-v0")
if ($allowedArtifactRoles -notcontains $graph.artifactRole) {
    Fail "Unexpected graph artifactRole: $($graph.artifactRole)"
}

$allowedStatuses = @("active-retrofit-graph-source", "active-native-graph-source")
if ($allowedStatuses -notcontains $graph.status) {
    Fail "Unexpected graph status: $($graph.status)"
}

if (-not $graph.graphPolicy -or $graph.graphPolicy.intentLocation -ne "node-and-edge-intent") {
    Fail "Graph source must declare node-and-edge-intent policy"
}

if (-not $graph.records -or @($graph.records).Count -eq 0) {
    Fail "Graph source must include records"
}

if (-not $graph.nodes -or @($graph.nodes).Count -eq 0) {
    Fail "Graph source must include nodes"
}

if (-not $graph.edges -or @($graph.edges).Count -eq 0) {
    Fail "Graph source must include edges"
}

$nodeIds = @{}
foreach ($node in $graph.nodes) {
    if (-not $node.id) {
        Fail "Node missing id"
    }
    if ($nodeIds.ContainsKey($node.id)) {
        Fail "Duplicate node id: $($node.id)"
    }
    if (-not $node.intentClaim) {
        Fail "Node missing intentClaim: $($node.id)"
    }
    $nodeIds[$node.id] = $true
}

$edgeIds = @{}
foreach ($edge in $graph.edges) {
    if (-not $edge.id) {
        Fail "Edge missing id"
    }
    if ($edgeIds.ContainsKey($edge.id)) {
        Fail "Duplicate edge id: $($edge.id)"
    }
    if (-not $nodeIds.ContainsKey($edge.from)) {
        Fail "Edge references unknown from node: $($edge.id) -> $($edge.from)"
    }
    if (-not $nodeIds.ContainsKey($edge.to)) {
        Fail "Edge references unknown to node: $($edge.id) -> $($edge.to)"
    }
    if (-not $edge.edgeIntent) {
        Fail "Edge missing edgeIntent: $($edge.id)"
    }
    if (-not $edge.edgeIntent.claim) {
        Fail "Edge missing edgeIntent.claim: $($edge.id)"
    }
    if (-not $edge.edgeIntent.classifications -or @($edge.edgeIntent.classifications).Count -eq 0) {
        Fail "Edge missing edgeIntent.classifications: $($edge.id)"
    }
    $edgeIds[$edge.id] = $true
}

$recordStatuses = @()
foreach ($recordRef in $graph.records) {
    if (-not $recordRef.id -or -not $recordRef.path) {
        Fail "Graph record reference must include id and path"
    }

    if (-not $nodeIds.ContainsKey($recordRef.id)) {
        Fail "Graph record reference has no matching node: $($recordRef.id)"
    }

    $recordPath = Resolve-RepoPath $recordRef.path
    if (-not (Test-Path $recordPath)) {
        Fail "Graph record path not found: $($recordRef.path)"
    }

    $record = Get-Content -LiteralPath $recordPath -Raw | ConvertFrom-Json
    if ($record.status -ne $recordRef.expectedStatus) {
        Fail "Record status mismatch for $($recordRef.id): expected $($recordRef.expectedStatus), got $($record.status)"
    }
    if ($record.finalState.activeCodeState -ne $recordRef.expectedActiveCodeState) {
        Fail "Record activeCodeState mismatch for $($recordRef.id): expected $($recordRef.expectedActiveCodeState), got $($record.finalState.activeCodeState)"
    }

    $matchingNode = $graph.nodes | Where-Object { $_.id -eq $recordRef.id } | Select-Object -First 1
    if ($matchingNode.recordPath -and $matchingNode.recordPath -ne $recordRef.path) {
        Fail "Record node path mismatch for $($recordRef.id)"
    }

    $recordStatuses += [PSCustomObject]@{
        id = $recordRef.id
        status = $record.status
        activeCodeState = $record.finalState.activeCodeState
    }
}

[PSCustomObject]@{
    status = $statusLabel
    graphSource = $GraphSourcePath
    nodeCount = @($graph.nodes).Count
    edgeCount = @($graph.edges).Count
    recordCount = @($graph.records).Count
    edgeIntentStatus = "present"
    records = $recordStatuses
}
