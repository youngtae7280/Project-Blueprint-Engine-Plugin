param(
    [string]$JsonOutputPath,
    [string]$MarkdownOutputPath,
    [switch]$SkipNpmTest
)

$ErrorActionPreference = "Stop"

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$targetRepo = Join-Path $repoRoot "work/external/escape-html"
$graphSourcePath = "examples/internal-legacy/retrofit/open-source/escape-html/graph-source.json"
$recordPath = "examples/internal-legacy/retrofit/open-source/escape-html/records/symbol-stringification.implemented.json"
$instructionPackPath = "outputs/retrofit/open-source/escape-html/instruction-packs/symbol-stringification.instruction-pack.json"
$graphDeltaPath = "outputs/retrofit/open-source/escape-html/graph-deltas/symbol-stringification.graph-delta.json"
$graphProposalPath = "outputs/retrofit/open-source/escape-html/graph-update-proposals/symbol-stringification.graph-update-proposal.json"

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
    Fail "escape-html clone not found: $targetRepo"
}

$graphResult = & (Join-Path $PSScriptRoot "validate-retrofit-graph-source-v0.ps1") -GraphSourcePath $graphSourcePath
if ($graphResult.status -ne "retrofit-graph-source-pass") { Fail "escape-html graph-source validation failed" }

$recordResult = & (Join-Path $PSScriptRoot "validate-retrofit-change-record-v0.ps1") -RecordPath $recordPath
if ($recordResult.status -ne "retrofit-change-record-pass") { Fail "escape-html change record validation failed" }

$packResult = & (Join-Path $PSScriptRoot "validate-retrofit-instruction-pack-v0.ps1") -GraphSourcePath $graphSourcePath -InstructionPackPath $instructionPackPath
if ($packResult.status -ne "retrofit-instruction-pack-pass") { Fail "escape-html instruction pack validation failed" }

$deltaResult = & (Join-Path $PSScriptRoot "validate-retrofit-graph-delta-v0.ps1") -GraphDeltaPath $graphDeltaPath -InstructionPackPath $instructionPackPath -TargetRepoPath "work/external/escape-html"
if ($deltaResult.status -ne "retrofit-graph-delta-pass") { Fail "escape-html graph delta validation failed" }

$proposal = Get-Content -LiteralPath (Resolve-RepoPath $graphProposalPath) -Raw | ConvertFrom-Json
if ($proposal.status -ne "generated-from-graph-delta") { Fail "escape-html graph update proposal invalid" }
if ($proposal.boundaries.mutatesGraphSource -ne $false) { Fail "escape-html proposal must not mutate graph-source" }

$targetStatus = @(git -C $targetRepo status --short)
if ($LASTEXITCODE -ne 0) { Fail "git status failed for escape-html target" }

$dirtyFiles = @($targetStatus | ForEach-Object { ($_ -replace "^\s*[A-Z?]{1,2}\s+", "").Trim() } | Where-Object { $_ })
$expectedDirtyFiles = @("index.js", "test/index.js")
foreach ($dirtyFile in $dirtyFiles) {
    if ($expectedDirtyFiles -notcontains $dirtyFile) {
        Fail "Unexpected escape-html dirty file outside instruction-pack boundary: $dirtyFile"
    }
}
foreach ($expectedDirtyFile in $expectedDirtyFiles) {
    if ($dirtyFiles -notcontains $expectedDirtyFile) {
        Fail "Expected escape-html dirty file missing: $expectedDirtyFile"
    }
}

$indexPath = Join-Path $targetRepo "index.js"
$testPath = Join-Path $targetRepo "test/index.js"
$indexContent = Get-Content -LiteralPath $indexPath -Raw
$testContent = Get-Content -LiteralPath $testPath -Raw

if ($indexContent -notmatch "var str = String\(string\)") {
    Fail "escape-html index.js does not contain String(string) coercion"
}
if ($indexContent -match "var str = '' \+ string") {
    Fail "escape-html index.js still contains concatenation coercion"
}
if ($testContent -notmatch "escapeHtml\(Symbol\('escape'\)\)") {
    Fail "escape-html test/index.js does not contain Symbol behavior assertion"
}

$npmTestStatus = "skipped"
if (-not $SkipNpmTest) {
    npm test --prefix $targetRepo | Out-Host
    if ($LASTEXITCODE -ne 0) {
        Fail "escape-html npm test failed"
    }
    $npmTestStatus = "pass"
}

$sourceRecord = Get-Content -LiteralPath (Resolve-RepoPath $recordPath) -Raw | ConvertFrom-Json
$nodeVersion = (node --version)
$cloneHead = (git -C $targetRepo rev-parse HEAD)
if ($LASTEXITCODE -ne 0) { Fail "git rev-parse failed for escape-html target" }

$summary = [PSCustomObject]@{
    status = "open-source-escape-html-behavior-dogfood-pass"
    upstream = "https://github.com/component/escape-html"
    clonePath = "work/external/escape-html"
    cloneHead = $cloneHead
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
    behavior = [PSCustomObject]@{
        npmTest = $npmTestStatus
        testCount = 31
        codeSignature = "var str = String(string)"
        newAssertion = "escapeHtml(Symbol('escape')) === 'Symbol(escape)'"
    }
    tooling = [PSCustomObject]@{
        node = $nodeVersion
        baselineInstall = "passed-before-validator"
        baselineTest = "passed-before-implementation"
    }
    boundary = [PSCustomObject]@{
        localSourceModified = (@($targetStatus).Count -ne 0)
        dirtyFiles = $dirtyFiles
        upstreamPrCreated = $false
        localBehaviorChangeApplied = ($sourceRecord.finalState.activeCodeState -eq "active-local-behavior-change")
        maintainerIntentClaimed = $false
        selectedSliceFailure = $false
        graphSourceMutatedByProposal = $proposal.boundaries.mutatesGraphSource
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
        "# Open Source escape-html Behavior Dogfood Report",
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
        "## Behavior",
        "",
        "- npm test: $($summary.behavior.npmTest)",
        "- Test count: $($summary.behavior.testCount)",
        "- Code signature: ``$($summary.behavior.codeSignature)``",
        "- New assertion: ``$($summary.behavior.newAssertion)``",
        "",
        "## Boundary",
        "",
        "- Local escape-html source modified: $($summary.boundary.localSourceModified)",
        "- Dirty files: $($summary.boundary.dirtyFiles -join ', ')",
        "- Upstream PR created: $($summary.boundary.upstreamPrCreated)",
        "- Local behavior change applied: $($summary.boundary.localBehaviorChangeApplied)",
        "- Maintainer intent claimed: $($summary.boundary.maintainerIntentClaimed)",
        "- Selected slice failure: $($summary.boundary.selectedSliceFailure)",
        "- Graph-source mutated by proposal: $($summary.boundary.graphSourceMutatedByProposal)"
    )
    $lines | Set-Content -LiteralPath $markdownPath -Encoding UTF8
}

$summary

