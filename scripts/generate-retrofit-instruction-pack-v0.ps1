param(
    [string]$GraphSourcePath = "examples/retrofit/cardprinterconfig/graph-source.json",
    [string]$RecordId = "change.laminator-tag-layout",
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

function Get-ObjectPropertyValue($Object, $Name) {
    $property = $Object.PSObject.Properties[$Name]
    if ($property) {
        return $property.Value
    }

    return $null
}

$resolvedGraphPath = Resolve-RepoPath $GraphSourcePath
if (-not (Test-Path $resolvedGraphPath)) {
    Fail "Graph source not found: $GraphSourcePath"
}

$graph = Get-Content -LiteralPath $resolvedGraphPath -Raw | ConvertFrom-Json
$packArtifactRole = if ($graph.artifactRole -eq "native-graph-source-v0") {
    "native-instruction-pack-v0"
}
else {
    "retrofit-instruction-pack-v0"
}
$packLabel = if ($graph.artifactRole -eq "native-graph-source-v0") {
    "Native"
}
else {
    "Retrofit"
}

$recordRef = $graph.records | Where-Object { $_.id -eq $RecordId } | Select-Object -First 1
if (-not $recordRef) {
    Fail "Record id not found in graph source: $RecordId"
}

$recordPath = Resolve-RepoPath $recordRef.path
if (-not (Test-Path $recordPath)) {
    Fail "Record path not found: $($recordRef.path)"
}

$record = Get-Content -LiteralPath $recordPath -Raw | ConvertFrom-Json
if ($record.status -ne $recordRef.expectedStatus) {
    Fail "Record status mismatch: expected $($recordRef.expectedStatus), got $($record.status)"
}
if ($record.finalState.activeCodeState -ne $recordRef.expectedActiveCodeState) {
    Fail "Record activeCodeState mismatch: expected $($recordRef.expectedActiveCodeState), got $($record.finalState.activeCodeState)"
}

$directEdges = @(
    $graph.edges | Where-Object { $_.from -eq $RecordId -or $_.to -eq $RecordId }
)

$relatedNodeIds = @{}
$relatedNodeIds[$RecordId] = $true
foreach ($edge in $directEdges) {
    $relatedNodeIds[$edge.from] = $true
    $relatedNodeIds[$edge.to] = $true
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

$edgeIntentSummaries = @(
    $directEdges | ForEach-Object {
        [PSCustomObject]@{
            id = $_.id
            from = $_.from
            to = $_.to
            kind = $_.kind
            classifications = @($_.edgeIntent.classifications)
            claim = $_.edgeIntent.claim
            confidence = $_.edgeIntent.confidence
        }
    }
)

$allowedFiles = @()
if ($record.implementationPlan.expectedFiles) {
    $allowedFiles = @($record.implementationPlan.expectedFiles)
}

$forbiddenFlows = @()
if ($record.forbiddenFlows) {
    $forbiddenFlows = @(
        $record.forbiddenFlows | ForEach-Object {
            [PSCustomObject]@{
                flow = $_.flow
                reason = $_.reason
            }
        }
    )
}

$excludedBehavior = @()
if ($record.userConfirmedIntent.excludedBehavior) {
    $excludedBehavior = @($record.userConfirmedIntent.excludedBehavior)
}
elseif ($record.userConfirmedIntent.nonGoals) {
    $excludedBehavior = @($record.userConfirmedIntent.nonGoals)
}

$requiredVerification = [PSCustomObject]@{
    build = $record.evidence.build.status
    runtime = $record.evidence.runtime.status
    hardware = $record.evidence.hardware.status
}

$intentSummary = $record.userConfirmedIntent.summary
if (-not $intentSummary) {
    $intentParts = @()
    foreach ($field in @("settingName", "uiLabel", "module", "operation", "readIndex", "setBehavior", "saveLoadBehavior", "otherFeatures")) {
        $value = Get-ObjectPropertyValue $record.userConfirmedIntent $field
        if ($value -ne $null) {
            $intentParts += ("{0}: {1}" -f $field, $value)
        }
    }
    $intentSummary = $intentParts -join "; "
}
if (-not $intentSummary) {
    $intentSummary = "No single summary field is present; inspect userConfirmedIntent in the JSON pack."
}

$pack = [PSCustomObject]@{
    schemaVersion = 1
    artifactRole = $packArtifactRole
    status = "generated-from-graph-source"
    graphSourcePath = $GraphSourcePath
    sourceRecordId = $RecordId
    sourceRecordPath = $recordRef.path
    target = $record.target
    userConfirmedIntent = $record.userConfirmedIntent
    allowedScope = [PSCustomObject]@{
        files = $allowedFiles
        expectedFlow = $record.implementationPlan.expectedFlow
        includedBehavior = @($record.userConfirmedIntent.includedBehavior)
    }
    forbiddenScope = [PSCustomObject]@{
        flows = $forbiddenFlows
        excludedBehavior = $excludedBehavior
        nonGoals = @($record.implementationPlan.nonGoals)
    }
    graphContext = [PSCustomObject]@{
        nodes = $relatedNodes
        edgeIntents = $edgeIntentSummaries
    }
    verification = [PSCustomObject]@{
        required = $requiredVerification
        finalState = $record.finalState
    }
    executionBoundary = [PSCustomObject]@{
        mayModifyExternalProject = $false
        requiresUserApprovalBeforeApplying = $true
        sourceOfTruth = "graph-source plus user-confirmed change record"
    }
}

if ($JsonOutputPath) {
    $jsonPath = Resolve-RepoPath $JsonOutputPath
    $jsonDir = Split-Path -Parent $jsonPath
    if ($jsonDir -and -not (Test-Path $jsonDir)) {
        New-Item -ItemType Directory -Path $jsonDir | Out-Null
    }
    $pack | ConvertTo-Json -Depth 12 | Set-Content -LiteralPath $jsonPath -Encoding UTF8
}

if ($MarkdownOutputPath) {
    $markdownPath = Resolve-RepoPath $MarkdownOutputPath
    $markdownDir = Split-Path -Parent $markdownPath
    if ($markdownDir -and -not (Test-Path $markdownDir)) {
        New-Item -ItemType Directory -Path $markdownDir | Out-Null
    }

    $lines = @(
        "# $packLabel Instruction Pack",
        "",
        "Status: $($pack.status)",
        "",
        "Record: $RecordId",
        "",
        "## User Intent",
        "",
        "$intentSummary",
        "",
        "## Allowed Files",
        ""
    )

    foreach ($file in $allowedFiles) {
        $lines += ("- ``{0}``" -f $file)
    }

    $lines += @(
        "",
        "## Forbidden Flows",
        ""
    )

    foreach ($flow in $forbiddenFlows) {
        $lines += "- $($flow.flow): $($flow.reason)"
    }

    $lines += @(
        "",
        "## Graph Edge Intent",
        ""
    )

    foreach ($edge in $edgeIntentSummaries) {
        $classes = $edge.classifications -join ", "
        $lines += ("- ``{0}`` [{1}]: {2}" -f $edge.id, $classes, $edge.claim)
    }

    $lines += @(
        "",
        "## Verification",
        "",
        "- Build: $($requiredVerification.build)",
        "- Runtime/UI: $($requiredVerification.runtime)",
        "- Hardware: $($requiredVerification.hardware)",
        "",
        "## Boundary",
        "",
        "- This pack does not apply changes by itself.",
        "- External project modification requires explicit user approval."
    )

    $lines | Set-Content -LiteralPath $markdownPath -Encoding UTF8
}

$pack
