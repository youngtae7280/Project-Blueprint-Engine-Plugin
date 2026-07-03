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

describe('Human Decision Record CLI', () => {
  it('records a defer decision without creating approved state, apply, mutation, or enforcement', async () => {
    const workspace = createWorkspace()
    writeJson(join(workspace, 'boundary.json'), validBoundary())
    writeJson(join(workspace, 'proposal.json'), validProposal())
    writeJson(join(workspace, 'review.json'), validReviewPacket())

    const result = await runPbeCli(
      [
        'graph',
        'read-model',
        'record-human-decision',
        '--boundary',
        'boundary.json',
        '--review-packet',
        'review.json',
        '--proposal',
        'proposal.json',
        '--decision',
        'defer-decision',
        '--reviewer',
        'human-reviewer',
        '--rationale',
        'Calibration defers approval.',
        '--output',
        '.tmp/decision.json',
        '--json',
      ],
      { cwd: workspace, pluginRoot },
    )

    const payload = JSON.parse(result.stdout)
    const written = JSON.parse(readFileSync(join(workspace, '.tmp/decision.json'), 'utf8'))

    expect(result.exitCode).toBe(ExitCode.Success)
    expect(payload.ok).toBe(true)
    expect(payload.artifactRole).toBe('devview-human-decision-record')
    expect(payload.decisionValue).toBe('defer-decision')
    expect(payload.approvalStatus).toBe('not-approved')
    expect(payload.humanDecisionRecorded).toBe(true)
    expect(payload.approvedProposalStateCreated).toBe(false)
    expect(payload.graphDeltaApplied).toBe(false)
    expect(payload.graphSourceMutated).toBe(false)
    expect(payload.runtimeEvidenceSatisfied).toBe(false)
    expect(payload.equivalenceProven).toBe(false)
    expect(payload.scopeEnforced).toBe(false)
    expect(payload.ciEnforcementEnabled).toBe(false)
    expect(written.writtenOutputPath).toBe('.tmp/decision.json')
  })

  it('records approval as decision metadata only', async () => {
    const workspace = createWorkspace()
    writeJson(join(workspace, 'boundary.json'), validBoundary())
    writeJson(join(workspace, 'proposal.json'), validProposal())
    writeJson(join(workspace, 'review.json'), validReviewPacket())

    const result = await runPbeCli(
      [
        'graph',
        'read-model',
        'record-human-decision',
        '--boundary',
        'boundary.json',
        '--review-packet',
        'review.json',
        '--proposal',
        'proposal.json',
        '--decision',
        'approve-proposal',
        '--reviewer',
        'human-reviewer',
        '--rationale',
        'Human approves this proposal for a later separate state command.',
        '--json',
      ],
      { cwd: workspace, pluginRoot },
    )

    const payload = JSON.parse(result.stdout)

    expect(result.exitCode).toBe(ExitCode.Success)
    expect(payload.approvalStatus).toBe('human-approved-no-approved-state-created')
    expect(payload.approvedProposalStateCreated).toBe(false)
    expect(payload.graphDeltaApplyEnabled).toBe(false)
    expect(payload.graphDeltaApplied).toBe(false)
    expect(payload.graphSourceMutated).toBe(false)
  })

  it('blocks invalid decisions outside the boundary vocabulary', async () => {
    const workspace = createWorkspace()
    writeJson(join(workspace, 'boundary.json'), validBoundary())
    writeJson(join(workspace, 'proposal.json'), validProposal())
    writeJson(join(workspace, 'review.json'), validReviewPacket())

    const result = await runPbeCli(
      [
        'graph',
        'read-model',
        'record-human-decision',
        '--boundary',
        'boundary.json',
        '--review-packet',
        'review.json',
        '--proposal',
        'proposal.json',
        '--decision',
        'auto-approve',
        '--reviewer',
        'human-reviewer',
        '--rationale',
        'No.',
        '--output',
        '.tmp/decision.json',
        '--json',
      ],
      { cwd: workspace, pluginRoot },
    )
    const payload = JSON.parse(result.stderr)

    expect(result.exitCode).toBe(ExitCode.ValidationFailed)
    expect(payload.ok).toBe(false)
    expect(payload.issues[0].message).toContain('not in the boundary allowedDecisionValues vocabulary')
    expect(existsSync(join(workspace, '.tmp/decision.json'))).toBe(false)
  })

  it('blocks Codex or AI reviewer identities', async () => {
    const workspace = createWorkspace()
    writeJson(join(workspace, 'boundary.json'), validBoundary())
    writeJson(join(workspace, 'proposal.json'), validProposal())
    writeJson(join(workspace, 'review.json'), validReviewPacket())

    const result = await runPbeCli(
      [
        'graph',
        'read-model',
        'record-human-decision',
        '--boundary',
        'boundary.json',
        '--review-packet',
        'review.json',
        '--proposal',
        'proposal.json',
        '--decision',
        'defer-decision',
        '--reviewer',
        'Codex',
        '--rationale',
        'No.',
        '--output',
        '.tmp/decision.json',
        '--json',
      ],
      { cwd: workspace, pluginRoot },
    )
    const payload = JSON.parse(result.stderr)

    expect(result.exitCode).toBe(ExitCode.ValidationFailed)
    expect(payload.issues[0].message).toContain('reviewer must be human-provided')
    expect(existsSync(join(workspace, '.tmp/decision.json'))).toBe(false)
  })

  it('blocks output overwrite of proposal and unsafe markdown before JSON write', async () => {
    const workspace = createWorkspace()
    writeJson(join(workspace, 'boundary.json'), validBoundary())
    writeJson(join(workspace, 'proposal.json'), validProposal())
    writeJson(join(workspace, 'review.json'), validReviewPacket())
    const proposalBefore = readFileSync(join(workspace, 'proposal.json'), 'utf8')

    const result = await runPbeCli(
      [
        'graph',
        'read-model',
        'record-human-decision',
        '--boundary',
        'boundary.json',
        '--review-packet',
        'review.json',
        '--proposal',
        'proposal.json',
        '--decision',
        'defer-decision',
        '--reviewer',
        'human-reviewer',
        '--rationale',
        'No write should happen.',
        '--output',
        '.tmp/decision.json',
        '--markdown',
        'proposal.json',
        '--json',
      ],
      { cwd: workspace, pluginRoot },
    )
    const payload = JSON.parse(result.stderr)

    expect(result.exitCode).toBe(ExitCode.ValidationFailed)
    expect(payload.issues[0].message).toContain('would overwrite the source Graph Delta proposal')
    expect(readFileSync(join(workspace, 'proposal.json'), 'utf8')).toBe(proposalBefore)
    expect(existsSync(join(workspace, '.tmp/decision.json'))).toBe(false)
  })
})

function validBoundary(): Record<string, unknown> {
  return {
    artifactRole: 'devview-human-decision-record-boundary-preview',
    status: 'devview-human-decision-record-boundary-previewed',
    approvedProposalStateCreated: false,
    graphDeltaApplyEnabled: false,
    graphDeltaApplied: false,
    graphSourceMutationAllowed: false,
    graphSourceMutated: false,
    runtimeEvidenceSatisfied: false,
    equivalenceProven: false,
    scopeEnforced: false,
    ciEnforcementEnabled: false,
    allowedDecisionValues: [
      { decisionValue: 'approve-proposal' },
      { decisionValue: 'reject-proposal' },
      { decisionValue: 'request-revision' },
      { decisionValue: 'defer-decision' },
    ],
  }
}

function validProposal(): Record<string, unknown> {
  return {
    schemaId: 'pbe-graph-update-proposal-v0',
    artifactRole: 'graph-delta-proposal-only-preview',
    proposalId: 'GDP-TEST',
    proposalOnly: true,
    graphSourceMutated: false,
    graphDeltaApplied: false,
    requiresHumanReview: true,
    approvalStatus: 'not-approved',
    nonEnforcing: true,
    enforcementStatus: 'not-enforced',
    sourceRecordIdCandidate: 'CH-001',
    sourceRecordIdAuthorityStatus: 'structure-only-review-candidate',
    proposalGenerationStatus: 'proposal-only-preview-generated',
    changedFiles: [],
    proposedNodeUpdates: [],
    candidateEvidenceLinks: [],
    candidateRuntimeReportLinks: [],
    humanReviewQuestions: [],
  }
}

function validReviewPacket(): Record<string, unknown> {
  return {
    artifactRole: 'graph-delta-human-review-packet',
    reviewPacketStatus: 'review-required',
    sourceProposal: 'proposal.json',
    approvalStatus: 'not-approved',
    graphSourceMutated: false,
    graphDeltaApplied: false,
    humanDecisionRecorded: false,
    candidateEvidenceAccepted: false,
    runtimeEvidenceSatisfied: false,
    equivalenceProven: false,
  }
}
