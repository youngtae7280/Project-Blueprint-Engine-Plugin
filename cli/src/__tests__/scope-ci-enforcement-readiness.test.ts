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

describe('Scope/CI Enforcement readiness CLI', () => {
  it('writes blocked disabled readiness for blocked Equivalence Proof readiness without enforcement', async () => {
    const workspace = createWorkspace()
    writeJson(join(workspace, 'policy.json'), validPolicy())
    writeJson(join(workspace, 'equivalence-readiness.json'), validEquivalenceReadiness({ ready: false }))

    const result = await runPbeCli(
      [
        'graph',
        'read-model',
        'report-scope-ci-enforcement-readiness',
        '--policy',
        'policy.json',
        '--equivalence-proof-readiness',
        'equivalence-readiness.json',
        '--output',
        '.tmp/scope-ci-readiness.json',
        '--json',
      ],
      { cwd: workspace, pluginRoot },
    )
    const payload = JSON.parse(result.stdout)
    const written = JSON.parse(readFileSync(join(workspace, '.tmp/scope-ci-readiness.json'), 'utf8'))

    expect(result.exitCode).toBe(ExitCode.Success)
    expect(payload.status).toBe('devview-scope-ci-enforcement-readiness-blocked')
    expect(payload.scopeCiEnforcementReadinessStatus).toBe('blocked-equivalence-proof-readiness-not-ready')
    expectDisabled(payload)
    expect(written.validationFindings.map((finding: { code: string }) => finding.code)).toContain(
      'SCOPE_CI_ENFORCEMENT_EQUIVALENCE_PROOF_READINESS_NOT_READY',
    )
  })

  it('reports ready-shaped disabled context without enabling enforcement', async () => {
    const workspace = createWorkspace()
    writeJson(join(workspace, 'policy.json'), validPolicy())
    writeJson(join(workspace, 'equivalence-readiness.json'), validEquivalenceReadiness({ ready: true }))

    const result = await runPbeCli(
      [
        'graph',
        'read-model',
        'report-scope-ci-enforcement-readiness',
        '--policy',
        'policy.json',
        '--equivalence-proof-readiness',
        'equivalence-readiness.json',
        '--json',
      ],
      { cwd: workspace, pluginRoot },
    )
    const payload = JSON.parse(result.stdout)

    expect(result.exitCode).toBe(ExitCode.Success)
    expect(payload.status).toBe('devview-scope-ci-enforcement-readiness-ready')
    expect(payload.scopeCiEnforcementReadinessStatus).toBe('dry-run-ready-equivalence-proof-readiness-present')
    expectDisabled(payload)
  })

  it('fails unsafe Equivalence Proof readiness flags before writing output', async () => {
    const workspace = createWorkspace()
    writeJson(join(workspace, 'policy.json'), validPolicy())
    writeJson(join(workspace, 'equivalence-readiness.json'), {
      ...validEquivalenceReadiness({ ready: true }),
      ciEnforcementEnabled: true,
    })

    const result = await runPbeCli(
      [
        'graph',
        'read-model',
        'report-scope-ci-enforcement-readiness',
        '--policy',
        'policy.json',
        '--equivalence-proof-readiness',
        'equivalence-readiness.json',
        '--output',
        '.tmp/scope-ci-readiness.json',
        '--json',
      ],
      { cwd: workspace, pluginRoot },
    )
    const payload = JSON.parse(result.stderr)

    expect(result.exitCode).toBe(ExitCode.ValidationFailed)
    expect(payload.issues[0].message).toContain('ciEnforcementEnabled')
    expect(existsSync(join(workspace, '.tmp/scope-ci-readiness.json'))).toBe(false)
  })

  it('fails unsafe policy boundary fields', async () => {
    const workspace = createWorkspace()
    writeJson(join(workspace, 'policy.json'), { ...validPolicy(), scopeEnforced: true })
    writeJson(join(workspace, 'equivalence-readiness.json'), validEquivalenceReadiness({ ready: true }))

    const result = await runPbeCli(
      [
        'graph',
        'read-model',
        'report-scope-ci-enforcement-readiness',
        '--policy',
        'policy.json',
        '--equivalence-proof-readiness',
        'equivalence-readiness.json',
        '--output',
        '.tmp/scope-ci-readiness.json',
        '--json',
      ],
      { cwd: workspace, pluginRoot },
    )
    const payload = JSON.parse(result.stderr)

    expect(result.exitCode).toBe(ExitCode.ValidationFailed)
    expect(payload.issues[0].message).toContain('scopeEnforced')
    expect(existsSync(join(workspace, '.tmp/scope-ci-readiness.json'))).toBe(false)
  })

  it('blocks unsafe markdown before JSON output is written', async () => {
    const workspace = createWorkspace()
    writeJson(join(workspace, 'policy.json'), validPolicy())
    writeJson(join(workspace, 'equivalence-readiness.json'), validEquivalenceReadiness({ ready: true }))
    const sourceBefore = readFileSync(join(workspace, 'equivalence-readiness.json'), 'utf8')

    const result = await runPbeCli(
      [
        'graph',
        'read-model',
        'report-scope-ci-enforcement-readiness',
        '--policy',
        'policy.json',
        '--equivalence-proof-readiness',
        'equivalence-readiness.json',
        '--output',
        '.tmp/scope-ci-readiness.json',
        '--markdown',
        'equivalence-readiness.json',
        '--json',
      ],
      { cwd: workspace, pluginRoot },
    )
    const payload = JSON.parse(result.stderr)

    expect(result.exitCode).toBe(ExitCode.ValidationFailed)
    expect(payload.issues[0].message).toContain('would overwrite the source Equivalence Proof readiness')
    expect(readFileSync(join(workspace, 'equivalence-readiness.json'), 'utf8')).toBe(sourceBefore)
    expect(existsSync(join(workspace, '.tmp/scope-ci-readiness.json'))).toBe(false)
  })
})

function expectDisabled(payload: Record<string, unknown>): void {
  expect(payload.scopeEnforcementAllowed).toBe(false)
  expect(payload.ciEnforcementAllowed).toBe(false)
  expect(payload.scopeEnforcementCommandImplemented).toBe(false)
  expect(payload.ciEnforcementCommandImplemented).toBe(false)
  expect(payload.scopeEnforced).toBe(false)
  expect(payload.ciEnforcementEnabled).toBe(false)
  expect(payload.requiredChecksConfigured).toBe(false)
  expect(payload.branchProtectionChanged).toBe(false)
  expect(payload.diffRejectionEnabled).toBe(false)
  expect(payload.strictModeEnabled).toBe(false)
  expect(payload.guidedEnforcementEnabled).toBe(false)
  expect(payload.equivalenceProven).toBe(false)
  expect(payload.evidenceAccepted).toBe(false)
  expect(payload.runtimeEvidenceSatisfied).toBe(false)
  expect(payload.graphDeltaApplied).toBe(false)
  expect(payload.graphSourceMutated).toBe(false)
}

function validPolicy(): Record<string, unknown> {
  return {
    artifactRole: 'devview-scope-ci-enforcement-policy-boundary-preview',
    status: 'devview-scope-ci-enforcement-policy-boundary-previewed',
    scopeEnforced: false,
    ciEnforcementEnabled: false,
    requiredChecksConfigured: false,
    branchProtectionChanged: false,
    diffRejectionEnabled: false,
    strictModeEnabled: false,
    guidedEnforcementEnabled: false,
    equivalenceProven: false,
    runtimeEvidenceSatisfied: false,
    evidenceAccepted: false,
    graphDeltaApplied: false,
    graphSourceMutated: false,
  }
}

function validEquivalenceReadiness(input: { ready: boolean }): Record<string, unknown> {
  return {
    artifactRole: 'devview-equivalence-proof-readiness-preview',
    status: input.ready ? 'devview-equivalence-proof-readiness-ready' : 'devview-equivalence-proof-readiness-blocked',
    sourceEvidenceAcceptanceReadiness: 'evidence-readiness.json',
    sourceGraphSourceMutationReadiness: 'mutation-readiness.json',
    sourceApplyReadiness: 'apply-readiness.json',
    sourceApprovedProposalState: 'approved-state.json',
    sourceGraphDeltaProposal: 'proposal.json',
    proposalId: 'GDP-TEST',
    equivalenceProofReadinessStatus: input.ready
      ? 'dry-run-ready-evidence-acceptance-readiness-present'
      : 'blocked-evidence-acceptance-readiness-not-ready',
    evidenceAcceptanceReadinessStatus: input.ready
      ? 'dry-run-ready-mutation-readiness-present'
      : 'blocked-mutation-readiness-not-ready',
    mutationReadinessStatus: input.ready
      ? 'dry-run-ready-apply-readiness-present'
      : 'blocked-apply-readiness-not-ready',
    applyReadinessStatus: input.ready ? 'dry-run-ready-approved-state-present' : 'blocked-approved-state-not-created',
    equivalenceAllowed: false,
    equivalenceProven: false,
    evidenceAccepted: false,
    runtimeEvidenceSatisfied: false,
    graphDeltaApplyEnabled: false,
    graphDeltaApplied: false,
    graphSourceMutationAllowed: false,
    graphSourceMutated: false,
    mutationAllowed: false,
    acceptanceAllowed: false,
    approvedProposalStateCreated: input.ready,
    humanDecisionRecorded: true,
    scopeEnforced: false,
    ciEnforcementEnabled: false,
  }
}
