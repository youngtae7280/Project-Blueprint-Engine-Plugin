param(
    [string]$RecordPath,
    [string]$SchemaPath = "schemas/retrofit/change-record-v0.json",
    [switch]$CheckExternalRepo
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

if (-not $RecordPath) {
    Fail "RecordPath is required"
}

$resolvedSchemaPath = Resolve-RepoPath $SchemaPath
$resolvedRecordPath = Resolve-RepoPath $RecordPath

if (-not (Test-Path $resolvedSchemaPath)) {
    Fail "Schema not found: $SchemaPath"
}

if (-not (Test-Path $resolvedRecordPath)) {
    Fail "Record not found: $RecordPath"
}

$schema = Get-Content $resolvedSchemaPath -Raw | ConvertFrom-Json
$record = Get-Content $resolvedRecordPath -Raw | ConvertFrom-Json

$recordProps = @($record.PSObject.Properties.Name)

foreach ($field in $schema.requiredTopLevelFields) {
    if ($recordProps -notcontains $field) {
        Fail "Missing required top-level field: $field"
    }
}

if ($schema.statusVocabulary -notcontains $record.status) {
    Fail "Unknown record status: $($record.status)"
}

if (-not $record.observedAnchors -or $record.observedAnchors.Count -eq 0) {
    Fail "observedAnchors must not be empty"
}

foreach ($anchor in $record.observedAnchors) {
    foreach ($field in $schema.fieldContracts.observedAnchors.itemRequired) {
        if (-not $anchor.$field) {
            Fail "observedAnchors item missing field: $field"
        }
    }
}

if (-not $record.forbiddenFlows -or $record.forbiddenFlows.Count -eq 0) {
    Fail "forbiddenFlows must not be empty"
}

foreach ($flow in $record.forbiddenFlows) {
    foreach ($field in $schema.fieldContracts.forbiddenFlows.itemRequired) {
        if (-not $flow.$field) {
            Fail "forbiddenFlows item missing field: $field"
        }
    }
}

foreach ($evidenceName in @("build", "runtime", "hardware")) {
    $entry = $record.evidence.$evidenceName
    if (-not $entry) {
        Fail "Missing evidence entry: $evidenceName"
    }
    if ($schema.evidenceStatusVocabulary -notcontains $entry.status) {
        Fail "Unknown $evidenceName evidence status: $($entry.status)"
    }
}

if ($record.status -eq "validated-then-reverted") {
    if (-not $record.rollback) {
        Fail "validated-then-reverted records must include rollback"
    }
    if ($record.finalState.activeCodeState -ne "reverted") {
        Fail "validated-then-reverted records must set finalState.activeCodeState to reverted"
    }
}

$externalRepoStatus = "not-checked"

if ($CheckExternalRepo) {
    if (-not $record.target.repoPath) {
        Fail "CheckExternalRepo requires target.repoPath"
    }
    if (-not (Test-Path $record.target.repoPath)) {
        Fail "target.repoPath not found: $($record.target.repoPath)"
    }

    if ($record.finalState.activeCodeState -eq "reverted") {
        if (-not $record.rollback.revertedFiles -or $record.rollback.revertedFiles.Count -eq 0) {
            Fail "Reverted records must list rollback.revertedFiles for external repo checks"
        }

        if ($record.rollback.revertedSignatures -and $record.rollback.revertedSignatures.Count -gt 0) {
            foreach ($file in $record.rollback.revertedFiles) {
                $fullPath = Join-Path $record.target.repoPath $file
                if (-not (Test-Path $fullPath)) {
                    Fail "rollback.revertedFiles path not found: $file"
                }

                foreach ($signature in $record.rollback.revertedSignatures) {
                    $matches = Select-String -Path $fullPath -SimpleMatch $signature -ErrorAction SilentlyContinue
                    if ($matches) {
                        Fail "Reverted signature still present in external repo: $signature in $file"
                    }
                }
            }

            $externalRepoStatus = "reverted-signatures-absent"
        }
        else {
            $gitArgs = @(
                "-c",
                "safe.directory=$($record.target.repoPath)",
                "-C",
                $record.target.repoPath,
                "status",
                "--short",
                "--"
            ) + @($record.rollback.revertedFiles)

            $statusLines = & git @gitArgs
            if ($LASTEXITCODE -ne 0) {
                Fail "git status failed for target.repoPath"
            }

            if (@($statusLines).Count -ne 0) {
                Fail "External repo reverted files are still dirty: $($statusLines -join '; ')"
            }

            $externalRepoStatus = "reverted-files-clean"
        }
    }
}

[PSCustomObject]@{
    status = "retrofit-change-record-pass"
    record = $RecordPath
    schema = $SchemaPath
    recordStatus = $record.status
    activeCodeState = $record.finalState.activeCodeState
    observedAnchorCount = @($record.observedAnchors).Count
    forbiddenFlowCount = @($record.forbiddenFlows).Count
    externalRepoStatus = $externalRepoStatus
}
