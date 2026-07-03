import { existsSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { runPbeCli } from '../app'
import { ExitCode } from '../core/types'
import { cleanupWorkspaces, createWorkspace, writeJson } from './fixtures/workspace'

const pluginRoot = resolve(process.cwd())

afterEach(() => {
  cleanupWorkspaces()
})

describe('Equivalence Proof readiness CLI', () => {
  it('writes blocked equivalence proof readiness for blocked Evidence acceptance readiness without proof', async () => {
    const workspace = createWorkspace()
    writeJson(join(workspace, 'policy.json'), validPolicy())
    writeJson(join(workspace, 'evidence-acceptance-readiness.json'), validEvidenceAcceptanceReadiness({ ready: false }))

    const result = await runPbeCli(
      [
        'graph',
        'read-model',
        'report-equivalence-proof-readiness',
        '--policy',
        'policy.json',
        '--evidence-acceptance-readiness',
        'evidence-acceptance-readiness.json',
        '--output',
        '.tmp/equivalence-proof-readiness.json',
        '--json',
      ],
      { cwd: workspace, pluginRoot },
    )
    const payload = JSON.parse(result.stdout)
    const written = JSON.parse(readFileSync(join(workspace, '.tmp/equivalence-proof-readiness.json'), 'utf8'))

    expect(result.exitCode).toBe(ExitCode.Success)
    expect(payload.status).toBe('devview-equivalence-proof-readiness-blocked')
    expect(payload.equivalenceProofReadinessStatus).toBe('blocked-evidence-acceptance-readiness-not-ready')
    expect(payload.equivalenceAllowed).toBe(false)
    expect(payload.equivalenceProven).toBe(false)
    expect(payload.evidenceAccepted).toBe(false)
    expect(payload.runtimeEvidenceSatisfied).toBe(false)
    expect(payload.graphDeltaApplied).toBe(false)
    expect(payload.graphSourceMutated).toBe(false)
    expect(payload.scopeEnforced).toBe(false)
    expect(payload.ciEnforcementEnabled).toBe(false)
    expect(written.validationFindings.map((finding: { code: string }) => finding.code)).toContain(
      'EQUIVALENCE_PROOF_EVIDENCE_ACCEPTANCE_READINESS_NOT_READY',
    )
  })

  it('reports ready proof context for ready Evidence acceptance readiness without proving equivalence', async () => {
    const workspace = createWorkspace()
    writeJson(join(workspace, 'policy.json'), validPolicy())
    writeJson(join(workspace, 'evidence-acceptance-readiness.json'), validEvidenceAcceptanceReadiness({ ready: true }))

    const result = await runPbeCli(
      [
        'graph',
        'read-model',
        'report-equivalence-proof-readiness',
        '--policy',
        'policy.json',
        '--evidence-acceptance-readiness',
        'evidence-acceptance-readiness.json',
        '--json',
      ],
      { cwd: workspace, pluginRoot },
    )
    const payload = JSON.parse(result.stdout)

    expect(result.exitCode).toBe(ExitCode.Success)
    expect(payload.status).toBe('devview-equivalence-proof-readiness-ready')
    expect(payload.equivalenceProofReadinessStatus).toBe('dry-run-ready-evidence-acceptance-readiness-present')
    expect(payload.equivalenceAllowed).toBe(false)
    expect(payload.equivalenceProofCommandImplemented).toBe(false)
    expect(payload.equivalenceProven).toBe(false)
    expect(payload.evidenceAccepted).toBe(false)
    expect(payload.runtimeEvidenceSatisfied).toBe(false)
    expect(payload.graphDeltaApplied).toBe(false)
    expect(payload.graphSourceMutated).toBe(false)
    expect(payload.scopeEnforced).toBe(false)
    expect(payload.ciEnforcementEnabled).toBe(false)
  })

  it('fails unsafe Evidence acceptance readiness flags before writing output', async () => {
    const workspace = createWorkspace()
    writeJson(join(workspace, 'policy.json'), validPolicy())
    writeJson(join(workspace, 'evidence-acceptance-readiness.json'), {
      ...validEvidenceAcceptanceReadiness({ ready: true }),
      equivalenceProven: true,
    })

    const result = await runPbeCli(
      [
        'graph',
        'read-model',
        'report-equivalence-proof-readiness',
        '--policy',
        'policy.json',
        '--evidence-acceptance-readiness',
        'evidence-acceptance-readiness.json',
        '--output',
        '.tmp/equivalence-proof-readiness.json',
        '--json',
      ],
      { cwd: workspace, pluginRoot },
    )
    const payload = JSON.parse(result.stderr)

    expect(result.exitCode).toBe(ExitCode.ValidationFailed)
    expect(payload.issues[0].message).toContain('equivalenceProven')
    expect(existsSync(join(workspace, '.tmp/equivalence-proof-readiness.json'))).toBe(false)
  })

  it('fails unsafe policy boundary fields', async () => {
    const workspace = createWorkspace()
    writeJson(join(workspace, 'policy.json'), { ...validPolicy(), equivalenceProven: true })
    writeJson(join(workspace, 'evidence-acceptance-readiness.json'), validEvidenceAcceptanceReadiness({ ready: true }))

    const result = await runPbeCli(
      [
        'graph',
        'read-model',
        'report-equivalence-proof-readiness',
        '--policy',
        'policy.json',
        '--evidence-acceptance-readiness',
        'evidence-acceptance-readiness.json',
        '--output',
        '.tmp/equivalence-proof-readiness.json',
        '--json',
      ],
      { cwd: workspace, pluginRoot },
    )
    const payload = JSON.parse(result.stderr)

    expect(result.exitCode).toBe(ExitCode.ValidationFailed)
    expect(payload.issues[0].message).toContain('equivalenceProven')
    expect(existsSync(join(workspace, '.tmp/equivalence-proof-readiness.json'))).toBe(false)
  })

  it('blocks unsafe markdown before JSON output is written', async () => {
    const workspace = createWorkspace()
    writeJson(join(workspace, 'policy.json'), validPolicy())
    writeJson(join(workspace, 'evidence-acceptance-readiness.json'), validEvidenceAcceptanceReadiness({ ready: true }))
    const sourceBefore = readFileSync(join(workspace, 'evidence-acceptance-readiness.json'), 'utf8')

    const result = await runPbeCli(
      [
        'graph',
        'read-model',
        'report-equivalence-proof-readiness',
        '--policy',
        'policy.json',
        '--evidence-acceptance-readiness',
        'evidence-acceptance-readiness.json',
        '--output',
        '.tmp/equivalence-proof-readiness.json',
        '--markdown',
        'evidence-acceptance-readiness.json',
        '--json',
      ],
      { cwd: workspace, pluginRoot },
    )
    const payload = JSON.parse(result.stderr)

    expect(result.exitCode).toBe(ExitCode.ValidationFailed)
    expect(payload.issues[0].message).toContain('would overwrite the source Evidence Acceptance readiness')
    expect(readFileSync(join(workspace, 'evidence-acceptance-readiness.json'), 'utf8')).toBe(sourceBefore)
    expect(existsSync(join(workspace, '.tmp/equivalence-proof-readiness.json'))).toBe(false)
  })
})

function validPolicy(): Record<string, unknown> {
  return {
    artifactRole: 'devview-equivalence-proof-policy-boundary-preview',
    status: 'devview-equivalence-proof-policy-boundary-previewed',
    equivalenceProven: false,
    evidenceAccepted: false,
    runtimeEvidenceSatisfied: false,
    graphDeltaApplied: false,
    graphSourceMutated: false,
    scopeEnforced: false,
    ciEnforcementEnabled: false,
  }
}

function validEvidenceAcceptanceReadiness(input: { ready: boolean }): Record<string, unknown> {
  return {
    artifactRole: 'devview-evidence-acceptance-readiness-preview',
    status: input.ready
      ? 'devview-evidence-acceptance-readiness-ready'
      : 'devview-evidence-acceptance-readiness-blocked',
    sourceGraphSourceMutationReadiness: 'mutation-readiness.json',
    sourceApplyReadiness: 'apply-readiness.json',
    sourceApprovedProposalState: 'approved-state.json',
    sourceGraphDeltaProposal: 'proposal.json',
    proposalId: 'GDP-TEST',
    evidenceAcceptanceReadinessStatus: input.ready
      ? 'dry-run-ready-mutation-readiness-present'
      : 'blocked-mutation-readiness-not-ready',
    mutationReadinessStatus: input.ready
      ? 'dry-run-ready-apply-readiness-present'
      : 'blocked-apply-readiness-not-ready',
    applyReadinessStatus: input.ready ? 'dry-run-ready-approved-state-present' : 'blocked-approved-state-not-created',
    acceptanceAllowed: false,
    evidenceAccepted: false,
    runtimeEvidenceSatisfied: false,
    equivalenceProven: false,
    graphDeltaApplyEnabled: false,
    graphDeltaApplied: false,
    graphSourceMutationAllowed: false,
    graphSourceMutated: false,
    mutationAllowed: false,
    approvedProposalStateCreated: input.ready,
    humanDecisionRecorded: true,
    scopeEnforced: false,
    ciEnforcementEnabled: false,
  }
}
