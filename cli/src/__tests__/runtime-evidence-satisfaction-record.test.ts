import { createHash } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { runDevViewCli } from '../app'
import { ExitCode } from '../core/types'
import { cleanupWorkspaces, createWorkspace, writeJson } from './fixtures/workspace'

const pluginRoot = resolve(process.cwd())

afterEach(() => {
  cleanupWorkspaces()
})

describe('Runtime Evidence Satisfaction Record CLI', () => {
  it('records runtime Evidence satisfaction only from ready binding and matching source Evidence', async () => {
    const workspace = createWorkspace()
    writeJson(join(workspace, 'runtime-output.json'), validSourceEvidence())
    const sourceHash = sha256(readFileSync(join(workspace, 'runtime-output.json'), 'utf8'))
    writeJson(join(workspace, 'runtime-readiness.json'), validReadiness({ sourceEvidenceHash: sourceHash }))

    const result = await runDevViewCli(
      [
        'graph',
        'read-model',
        'record-runtime-evidence-satisfaction',
        '--runtime-evidence-satisfaction-readiness',
        'runtime-readiness.json',
        '--source-evidence',
        'runtime-output.json',
        '--output',
        '.tmp/runtime-satisfaction-record.json',
        '--markdown',
        '.tmp/runtime-satisfaction-record.md',
        '--json',
      ],
      { cwd: workspace, pluginRoot },
    )

    const payload = JSON.parse(result.stdout)
    const written = JSON.parse(readFileSync(join(workspace, '.tmp/runtime-satisfaction-record.json'), 'utf8'))

    expect(result.exitCode).toBe(ExitCode.Success)
    expect(payload.artifactRole).toBe('devview-runtime-evidence-satisfaction-record')
    expect(payload.status).toBe('devview-runtime-evidence-satisfaction-recorded')
    expect(payload.runtimeEvidenceSatisfactionState).toBe('runtime-evidence-satisfied-for-explicit-obligation')
    expect(payload.runtimeEvidenceSatisfied).toBe(true)
    expect(payload.evidenceAccepted).toBe(false)
    expect(payload.equivalenceProven).toBe(false)
    expect(payload.scopeEnforced).toBe(false)
    expect(payload.ciEnforcementEnabled).toBe(false)
    expect(payload.graphSourceMutated).toBe(false)
    expect(payload.graphDeltaApplied).toBe(false)
    expect(payload.providerInvoked).toBe(false)
    expect(payload.networkCallMade).toBe(false)
    expect(payload.extensionExecutionAllowed).toBe(false)
    expect(payload.nonEnforcing).toBe(true)
    expect(payload.sourceEvidenceHash).toBe(sourceHash)
    expect(payload.sourceEvidenceArtifact).toBe('runtime-output.json')
    expect(written.runtimeEvidenceSatisfied).toBe(true)
    expect(existsSync(join(workspace, '.tmp/runtime-satisfaction-record.md'))).toBe(true)
  })

  it('blocks the current tracked blocked readiness calibration without writing a satisfaction record', async () => {
    const workspace = createWorkspace()
    writeJson(join(workspace, 'runtime-output.json'), validSourceEvidence())
    const readinessPath = join(
      pluginRoot,
      'examples/valid/todo-app-devview-run/generated/devview-runtime-evidence-satisfaction-readiness.blocked-obligation-mismatch.runtime-evidence-only.preview.json',
    )

    const result = await runDevViewCli(
      [
        'graph',
        'read-model',
        'record-runtime-evidence-satisfaction',
        '--runtime-evidence-satisfaction-readiness',
        readinessPath,
        '--source-evidence',
        'runtime-output.json',
        '--output',
        '.tmp/runtime-satisfaction-record.json',
        '--json',
      ],
      { cwd: workspace, pluginRoot },
    )

    expect(result.exitCode).toBe(ExitCode.ValidationFailed)
    expect(JSON.parse(result.stderr).issues[0].message).toContain('requires ready')
    expect(existsSync(join(workspace, '.tmp/runtime-satisfaction-record.json'))).toBe(false)
  })

  it('blocks missing or wrong readiness role and status', async () => {
    for (const readinessOverride of [
      { artifactRole: 'devview-runtime-evidence-satisfaction-readiness-draft' },
      { status: 'devview-runtime-evidence-satisfaction-readiness-blocked' },
    ]) {
      const workspace = createWorkspace()
      writeJson(join(workspace, 'runtime-output.json'), validSourceEvidence())
      const sourceHash = sha256(readFileSync(join(workspace, 'runtime-output.json'), 'utf8'))
      writeJson(
        join(workspace, 'runtime-readiness.json'),
        validReadiness({ sourceEvidenceHash: sourceHash, ...readinessOverride }),
      )

      const result = await runDevViewCli(
        [
          'graph',
          'read-model',
          'record-runtime-evidence-satisfaction',
          '--runtime-evidence-satisfaction-readiness',
          'runtime-readiness.json',
          '--source-evidence',
          'runtime-output.json',
          '--output',
          '.tmp/runtime-satisfaction-record.json',
          '--json',
        ],
        { cwd: workspace, pluginRoot },
      )

      expect(result.exitCode).toBe(ExitCode.ValidationFailed)
      expect(JSON.parse(result.stderr).issues[0].message).toContain('requires ready')
      expect(existsSync(join(workspace, '.tmp/runtime-satisfaction-record.json'))).toBe(false)
    }
  })

  it('blocks unsafe authority flags on readiness before recording satisfaction', async () => {
    for (const flag of [
      'equivalenceProven',
      'scopeEnforced',
      'ciEnforcementEnabled',
      'graphSourceMutated',
      'graphDeltaApplied',
    ]) {
      const workspace = createWorkspace()
      writeJson(join(workspace, 'runtime-output.json'), validSourceEvidence())
      const sourceHash = sha256(readFileSync(join(workspace, 'runtime-output.json'), 'utf8'))
      writeJson(
        join(workspace, 'runtime-readiness.json'),
        validReadiness({ sourceEvidenceHash: sourceHash, [flag]: true }),
      )

      const result = await runDevViewCli(
        [
          'graph',
          'read-model',
          'record-runtime-evidence-satisfaction',
          '--runtime-evidence-satisfaction-readiness',
          'runtime-readiness.json',
          '--source-evidence',
          'runtime-output.json',
          '--output',
          '.tmp/runtime-satisfaction-record.json',
          '--json',
        ],
        { cwd: workspace, pluginRoot },
      )

      expect(result.exitCode).toBe(ExitCode.ValidationFailed)
      expect(JSON.parse(result.stderr).issues[0].message).toContain(flag)
      expect(existsSync(join(workspace, '.tmp/runtime-satisfaction-record.json'))).toBe(false)
    }
  })

  it('blocks source Evidence path and hash mismatches', async () => {
    const pathMismatchWorkspace = createWorkspace()
    writeJson(join(pathMismatchWorkspace, 'runtime-output.json'), validSourceEvidence())
    writeJson(join(pathMismatchWorkspace, 'other-output.json'), validSourceEvidence())
    const sourceHash = sha256(readFileSync(join(pathMismatchWorkspace, 'runtime-output.json'), 'utf8'))
    writeJson(join(pathMismatchWorkspace, 'runtime-readiness.json'), validReadiness({ sourceEvidenceHash: sourceHash }))

    const pathMismatch = await runDevViewCli(
      [
        'graph',
        'read-model',
        'record-runtime-evidence-satisfaction',
        '--runtime-evidence-satisfaction-readiness',
        'runtime-readiness.json',
        '--source-evidence',
        'other-output.json',
        '--output',
        '.tmp/runtime-satisfaction-record.json',
        '--json',
      ],
      { cwd: pathMismatchWorkspace, pluginRoot },
    )

    expect(pathMismatch.exitCode).toBe(ExitCode.ValidationFailed)
    expect(JSON.parse(pathMismatch.stderr).issues[0].message).toContain('path mismatch')
    expect(existsSync(join(pathMismatchWorkspace, '.tmp/runtime-satisfaction-record.json'))).toBe(false)

    const hashMismatchWorkspace = createWorkspace()
    writeJson(join(hashMismatchWorkspace, 'runtime-output.json'), validSourceEvidence())
    writeJson(
      join(hashMismatchWorkspace, 'runtime-readiness.json'),
      validReadiness({ sourceEvidenceHash: '0'.repeat(64) }),
    )

    const hashMismatch = await runDevViewCli(
      [
        'graph',
        'read-model',
        'record-runtime-evidence-satisfaction',
        '--runtime-evidence-satisfaction-readiness',
        'runtime-readiness.json',
        '--source-evidence',
        'runtime-output.json',
        '--output',
        '.tmp/runtime-satisfaction-record.json',
        '--json',
      ],
      { cwd: hashMismatchWorkspace, pluginRoot },
    )

    expect(hashMismatch.exitCode).toBe(ExitCode.ValidationFailed)
    expect(JSON.parse(hashMismatch.stderr).issues[0].message).toContain('hash mismatch')
    expect(existsSync(join(hashMismatchWorkspace, '.tmp/runtime-satisfaction-record.json'))).toBe(false)
  })

  it('blocks source Evidence unsafe authority flags after path and hash revalidation', async () => {
    const workspace = createWorkspace()
    writeJson(join(workspace, 'runtime-output.json'), validSourceEvidence({ equivalenceProven: true }))
    const sourceHash = sha256(readFileSync(join(workspace, 'runtime-output.json'), 'utf8'))
    writeJson(join(workspace, 'runtime-readiness.json'), validReadiness({ sourceEvidenceHash: sourceHash }))

    const result = await runDevViewCli(
      [
        'graph',
        'read-model',
        'record-runtime-evidence-satisfaction',
        '--runtime-evidence-satisfaction-readiness',
        'runtime-readiness.json',
        '--source-evidence',
        'runtime-output.json',
        '--output',
        '.tmp/runtime-satisfaction-record.json',
        '--json',
      ],
      { cwd: workspace, pluginRoot },
    )

    expect(result.exitCode).toBe(ExitCode.ValidationFailed)
    expect(JSON.parse(result.stderr).issues[0].message).toContain('equivalenceProven')
    expect(existsSync(join(workspace, '.tmp/runtime-satisfaction-record.json'))).toBe(false)
  })

  it('blocks unsafe output paths with zero writes', async () => {
    const workspace = createWorkspace()
    writeJson(join(workspace, 'runtime-output.json'), validSourceEvidence())
    const sourceHash = sha256(readFileSync(join(workspace, 'runtime-output.json'), 'utf8'))
    writeJson(join(workspace, 'runtime-readiness.json'), validReadiness({ sourceEvidenceHash: sourceHash }))
    const readinessBefore = readFileSync(join(workspace, 'runtime-readiness.json'), 'utf8')

    const overwriteReadiness = await runDevViewCli(
      [
        'graph',
        'read-model',
        'record-runtime-evidence-satisfaction',
        '--runtime-evidence-satisfaction-readiness',
        'runtime-readiness.json',
        '--source-evidence',
        'runtime-output.json',
        '--output',
        'runtime-readiness.json',
        '--json',
      ],
      { cwd: workspace, pluginRoot },
    )

    expect(overwriteReadiness.exitCode).toBe(ExitCode.ValidationFailed)
    expect(JSON.parse(overwriteReadiness.stderr).issues[0].message).toContain('would overwrite')
    expect(readFileSync(join(workspace, 'runtime-readiness.json'), 'utf8')).toBe(readinessBefore)

    const markdownCollision = await runDevViewCli(
      [
        'graph',
        'read-model',
        'record-runtime-evidence-satisfaction',
        '--runtime-evidence-satisfaction-readiness',
        'runtime-readiness.json',
        '--source-evidence',
        'runtime-output.json',
        '--output',
        '.tmp/runtime-satisfaction-record.json',
        '--markdown',
        '.tmp/runtime-satisfaction-record.json',
        '--json',
      ],
      { cwd: workspace, pluginRoot },
    )

    expect(markdownCollision.exitCode).toBe(ExitCode.ValidationFailed)
    expect(JSON.parse(markdownCollision.stderr).issues[0].message).toContain('--output and --markdown must differ')
    expect(existsSync(join(workspace, '.tmp/runtime-satisfaction-record.json'))).toBe(false)
  })
})

function validReadiness(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    schemaVersion: 1,
    artifactRole: 'devview-runtime-evidence-satisfaction-readiness-preview',
    status: 'devview-runtime-evidence-satisfaction-readiness-ready',
    readinessScope: 'runtime-evidence-satisfaction-binding-readiness-preview-no-satisfaction',
    sourceAcceptedEvidenceRecord: 'accepted-evidence.json',
    sourceInstructionPack: 'instruction-pack.json',
    sourceContractInput: null,
    sourceEvidenceArtifact: 'runtime-output.json',
    sourceRuntimeEvidenceAuthority: null,
    sourceEvidenceCheckBinding: null,
    sourceOutputRequirement: null,
    sourceRuntimeReport: null,
    sourceScopeReport: null,
    sourceGraphDeltaApplyReport: null,
    sourceCheckReport: null,
    requiredEvidenceId: 'required-evidence-tt-1',
    matchedRequiredEvidence: {
      id: 'required-evidence-tt-1',
      sourceEvidenceId: 'evidence-tt-1',
      evidenceType: 'selected_check_context',
      artifact: 'runtime-output.json',
      sourceStatus: 'derived-from-selected-graph-slice',
      runtimeEvidenceSatisfied: false,
      acceptedEvidence: false,
    },
    acceptedEvidenceRecordStatus: 'devview-accepted-evidence-recorded',
    acceptedEvidenceState: 'accepted-evidence-recorded-not-runtime-satisfied',
    sourceAcceptedEvidenceAccepted: true,
    acceptedEvidenceClaim:
      'Accepted evidence explicitly covers required-evidence-tt-1, evidence-tt-1, and runtime-output.json.',
    acceptedEvidenceKind: 'selected_check_context-candidate',
    sourceEvidenceHash: sha256(`${JSON.stringify(validSourceEvidence(), null, 2)}\n`),
    sourceEvidenceHashAlgorithm: 'sha256',
    bindingMatchStatus: 'matched',
    runtimeEvidenceSatisfactionReadinessStatus: 'ready-accepted-evidence-linked-to-runtime-obligation',
    terminalStage: 'ready-accepted-evidence-linked-to-runtime-obligation',
    runtimeEvidenceSatisfactionAllowed: false,
    runtimeEvidenceSatisfied: false,
    evidenceAccepted: false,
    equivalenceProven: false,
    scopeEnforced: false,
    ciEnforcementEnabled: false,
    graphSourceMutated: false,
    graphDeltaApplied: false,
    approvalAutomationEnabled: false,
    userAcceptanceAutomated: false,
    nonEnforcing: true,
    validationFindings: [],
    nextRequiredCommand: 'Future command: record runtime Evidence satisfaction.',
    allowedUse: [],
    forbiddenUse: [],
    outputWritePolicy: 'explicit-output-only',
    writtenOutputPath: null,
    writtenOutputPathAuthorityStatus: 'not-written-stdout-only',
    markdownReportPath: null,
    nonExecutionBoundary: 'Readiness only.',
    ...overrides,
  }
}

function validSourceEvidence(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    schemaVersion: 1,
    artifactRole: 'runtime-check-report',
    status: 'runtime-check-report-produced',
    evidenceAccepted: false,
    runtimeEvidenceSatisfied: false,
    equivalenceProven: false,
    scopeEnforced: false,
    ciEnforcementEnabled: false,
    graphSourceMutated: false,
    graphDeltaApplied: false,
    ...overrides,
  }
}

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex')
}
