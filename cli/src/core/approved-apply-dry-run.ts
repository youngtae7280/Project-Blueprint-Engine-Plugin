import path from 'node:path'
import { readJsonSafe, relativePath, writeJsonAtomic, writeTextAtomic } from './fs.js'

type JsonRecord = Record<string, unknown>

const REPORT_ROLE = 'devview-approved-apply-dry-run-report'
const DECISION_RECORD_ROLE = 'devview-human-decision-record'
const PROPOSAL_ROLE = 'graph-delta-proposal-only-preview'
const REVIEW_PACKET_ROLE = 'graph-delta-human-review-packet'
const APPROVED_STATE_BOUNDARY_ROLE = 'devview-approved-proposal-state-boundary-preview'
const APPROVED_STATE_BOUNDARY_STATUS = 'devview-approved-proposal-state-boundary-previewed'
const APPLY_BOUNDARY_ROLE = 'devview-graph-delta-apply-boundary-preview'
const APPLY_BOUNDARY_STATUS = 'devview-graph-delta-apply-boundary-previewed'
const MUTATION_POLICY_ROLE = 'devview-graph-source-mutation-policy-boundary-preview'
const MUTATION_POLICY_STATUS = 'devview-graph-source-mutation-policy-boundary-previewed'
const HARDENED_DECISION_STATUS = 'hardened-human-decision-record-v1'

type DryRunStatus = 'devview-approved-apply-dry-run-ready' | 'devview-approved-apply-dry-run-blocked'
type DryRunReadinessStatus =
  | 'dry-run-ready-for-future-apply-command'
  | 'blocked-missing-approved-state'
  | 'blocked-unhardened-decision'
  | 'blocked-decision-not-approve'
  | 'blocked-review-packet-incomplete'
  | 'blocked-proposal-mismatch'
  | 'blocked-apply-boundary-invalid'
  | 'blocked-mutation-policy-missing'
  | 'blocked-mutation-policy-invalid'
  | 'blocked-already-applied-or-mutated'
  | 'blocked-unsafe-authority-flag'
type StageStatus = 'passed' | 'blocked' | 'not-run'

export interface ApprovedApplyDryRunOptions {
  decisionRecord: string
  proposal: string
  approvedStateBoundary: string
  applyBoundary: string
  mutationPolicy?: string
  reviewPacket?: string
  output: string
  markdown?: string
}

export interface ApprovedApplyDryRunFileResult {
  report: ApprovedApplyDryRunReport
  outputPath: string
  markdownReport?: string
}

export interface ApprovedApplyDryRunFinding {
  code: string
  severity: 'info' | 'warning' | 'error'
  message: string
  field?: string
  expected?: unknown
  actual?: unknown
  suggestedFix?: string
}

export interface ApprovedApplyDryRunStageSummary {
  stage: string
  status: StageStatus
  artifactPath?: string | null
  artifactRole?: string
  artifactStatus?: string
  importantFlags: Record<string, unknown>
  findingCodes: string[]
}

export interface ApprovedApplyDryRunReport {
  schemaVersion: 1
  artifactRole: typeof REPORT_ROLE
  status: DryRunStatus
  sourceHumanDecisionRecord: string
  sourceGraphDeltaProposal: string
  sourceApprovedStateBoundary: string
  sourceApplyBoundary: string
  sourceMutationPolicyBoundary: string | null
  sourceReviewPacket: string | null
  proposalId: string
  decisionKind: string
  decisionValue: string
  decisionLifecycleHardeningStatus: string
  approvedStateDryRunStatus: 'approved-state-created-preview-in-memory' | 'approved-state-blocked'
  applyReadinessDryRunStatus: 'dry-run-ready-approved-state-present' | 'blocked-approved-state-not-created'
  mutationPolicyStatus: 'mutation-policy-valid' | 'mutation-policy-missing' | 'mutation-policy-invalid'
  dryRunReadinessStatus: DryRunReadinessStatus
  terminalStage:
    | 'human-decision'
    | 'proposal'
    | 'approved-state-boundary'
    | 'apply-boundary'
    | 'mutation-policy'
    | 'ready'
  validationFindings: ApprovedApplyDryRunFinding[]
  stageSummaries: ApprovedApplyDryRunStageSummary[]
  approvedProposalStateCreatedPreview: boolean
  graphDeltaApplyEnabled: false
  graphDeltaApplied: false
  graphSourceMutationAllowed: false
  graphSourceMutated: false
  mutationAllowed: false
  runtimeEvidenceSatisfied: false
  evidenceAccepted: false
  equivalenceProven: false
  scopeEnforced: false
  ciEnforcementEnabled: false
  strictModeEnabled: false
  guidedEnforcementEnabled: false
  approvalAutomationEnabled: false
  codexSelfApprovalAllowed: false
  userAcceptanceAutomated: false
  nonEnforcing: true
  allowedUse: string[]
  forbiddenUse: string[]
  outputWritePolicy: 'explicit-output-only'
  writtenOutputPath: string | null
  writtenOutputPathAuthorityStatus: 'explicit-approved-apply-dry-run-output-not-source-authority'
  markdownReportPath: string | null
  nonExecutionBoundary: string
}

interface LoadedInputs {
  decisionRecord: JsonRecord
  resolvedDecisionRecordPath: string
  proposal: JsonRecord
  resolvedProposalPath: string
  approvedStateBoundary: JsonRecord
  resolvedApprovedStateBoundaryPath: string
  applyBoundary: JsonRecord
  resolvedApplyBoundaryPath: string
  mutationPolicy: JsonRecord | null
  resolvedMutationPolicyPath?: string
  reviewPacket: JsonRecord | null
  resolvedReviewPacketPath?: string
}

export async function reportApprovedApplyDryRunFile(
  root: string,
  options: ApprovedApplyDryRunOptions,
): Promise<ApprovedApplyDryRunFileResult> {
  validateRequiredInputs(options)

  const inputs = await loadInputs(root, options)
  await assertOutputAuthority(root, {
    ...inputs,
    output: options.output,
    markdown: options.markdown,
  })

  const outputPath = relativePath(root, resolveRepoPath(root, options.output))
  const markdownPath = options.markdown ? relativePath(root, resolveRepoPath(root, options.markdown)) : null
  const report = buildReport(root, inputs)
  report.writtenOutputPath = outputPath
  report.markdownReportPath = markdownPath

  const resolvedOutputPath = resolveRepoPath(root, options.output)
  await writeJsonAtomic(resolvedOutputPath, report)
  let markdownReport: string | undefined
  if (options.markdown) {
    const resolvedMarkdownPath = resolveRepoPath(root, options.markdown)
    markdownReport = relativePath(root, resolvedMarkdownPath)
    await writeTextAtomic(resolvedMarkdownPath, renderApprovedApplyDryRunMarkdown(report))
  }

  return { report, outputPath, ...(markdownReport ? { markdownReport } : {}) }
}

function buildReport(root: string, inputs: LoadedInputs): ApprovedApplyDryRunReport {
  const findings: ApprovedApplyDryRunFinding[] = []
  const stageSummaries: ApprovedApplyDryRunStageSummary[] = []

  const decisionStage = validateHumanDecision(inputs.decisionRecord, inputs.reviewPacket, root, inputs)
  findings.push(...decisionStage.findings)
  stageSummaries.push(
    stageSummary('human-decision', decisionStage.findings.length === 0 ? 'passed' : 'blocked', {
      artifactPath: relativePath(root, inputs.resolvedDecisionRecordPath),
      artifactRole: stringValue(inputs.decisionRecord.artifactRole),
      artifactStatus: stringValue(inputs.decisionRecord.status),
      importantFlags: {
        decisionLifecycleHardeningStatus: stringValue(inputs.decisionRecord.decisionLifecycleHardeningStatus),
        decisionKind: stringValue(inputs.decisionRecord.decisionKind),
        decisionActorType: stringValue(inputs.decisionRecord.decisionActorType),
        decisionSource: stringValue(inputs.decisionRecord.decisionSource),
        reviewPacketCompletenessStatus: stringValue(inputs.decisionRecord.reviewPacketCompletenessStatus),
        approvedProposalStateCreated: inputs.decisionRecord.approvedProposalStateCreated,
        graphDeltaApplied: inputs.decisionRecord.graphDeltaApplied,
        graphSourceMutated: inputs.decisionRecord.graphSourceMutated,
      },
      findings: decisionStage.findings,
    }),
  )

  const proposalStage = validateProposal(inputs.proposal, root, inputs)
  findings.push(...proposalStage.findings)
  stageSummaries.push(
    stageSummary('proposal', proposalStage.findings.length === 0 ? 'passed' : 'blocked', {
      artifactPath: relativePath(root, inputs.resolvedProposalPath),
      artifactRole: stringValue(inputs.proposal.artifactRole),
      artifactStatus: stringValue(inputs.proposal.proposalGenerationStatus) || stringValue(inputs.proposal.status),
      importantFlags: {
        proposalOnly: proposalFlagValue(inputs.proposal, 'proposalOnly'),
        approvalStatus: proposalFlagValue(inputs.proposal, 'approvalStatus'),
        graphDeltaApplied: proposalFlagValue(inputs.proposal, 'graphDeltaApplied'),
        graphSourceMutated: proposalFlagValue(inputs.proposal, 'graphSourceMutated'),
        runtimeEvidenceSatisfied: proposalFlagValue(inputs.proposal, 'runtimeEvidenceSatisfied'),
        evidenceAccepted: proposalFlagValue(inputs.proposal, 'evidenceAccepted'),
        equivalenceProven: proposalFlagValue(inputs.proposal, 'equivalenceProven'),
        scopeEnforced: proposalFlagValue(inputs.proposal, 'scopeEnforced'),
        ciEnforcementEnabled: proposalFlagValue(inputs.proposal, 'ciEnforcementEnabled'),
      },
      findings: proposalStage.findings,
    }),
  )

  const approvedBoundaryStage = validateApprovedStateBoundary(inputs.approvedStateBoundary)
  findings.push(...approvedBoundaryStage.findings)
  stageSummaries.push(
    stageSummary('approved-state-boundary', approvedBoundaryStage.findings.length === 0 ? 'passed' : 'blocked', {
      artifactPath: relativePath(root, inputs.resolvedApprovedStateBoundaryPath),
      artifactRole: stringValue(inputs.approvedStateBoundary.artifactRole),
      artifactStatus: stringValue(inputs.approvedStateBoundary.status),
      importantFlags: pickFlags(inputs.approvedStateBoundary, [
        'approvedProposalStateCreated',
        'graphDeltaApplyEnabled',
        'graphDeltaApplied',
        'graphSourceMutationAllowed',
        'graphSourceMutated',
        'runtimeEvidenceSatisfied',
        'equivalenceProven',
        'scopeEnforced',
        'ciEnforcementEnabled',
      ]),
      findings: approvedBoundaryStage.findings,
    }),
  )

  const applyBoundaryStage = validateApplyBoundary(inputs.applyBoundary)
  findings.push(...applyBoundaryStage.findings)
  stageSummaries.push(
    stageSummary('apply-boundary', applyBoundaryStage.findings.length === 0 ? 'passed' : 'blocked', {
      artifactPath: relativePath(root, inputs.resolvedApplyBoundaryPath),
      artifactRole: stringValue(inputs.applyBoundary.artifactRole),
      artifactStatus: stringValue(inputs.applyBoundary.status),
      importantFlags: pickFlags(inputs.applyBoundary, [
        'applyCommandImplemented',
        'graphDeltaApplyEnabled',
        'graphDeltaApplied',
        'graphSourceMutationAllowed',
        'graphSourceMutated',
        'runtimeEvidenceSatisfied',
        'equivalenceProven',
        'scopeEnforced',
        'ciEnforcementEnabled',
      ]),
      findings: applyBoundaryStage.findings,
    }),
  )

  const mutationPolicyStage = validateMutationPolicy(inputs.mutationPolicy)
  findings.push(...mutationPolicyStage.findings)
  stageSummaries.push(
    stageSummary('mutation-policy', mutationPolicyStage.findings.length === 0 ? 'passed' : 'blocked', {
      artifactPath: inputs.resolvedMutationPolicyPath ? relativePath(root, inputs.resolvedMutationPolicyPath) : null,
      artifactRole: inputs.mutationPolicy ? stringValue(inputs.mutationPolicy.artifactRole) : '',
      artifactStatus: inputs.mutationPolicy ? stringValue(inputs.mutationPolicy.status) : '',
      importantFlags: inputs.mutationPolicy
        ? {
            ...pickFlags(inputs.mutationPolicy, [
              'mutationCommandImplemented',
              'graphSourceMutationAllowed',
              'graphSourceMutated',
              'graphDeltaApplyEnabled',
              'graphDeltaApplied',
              'runtimeEvidenceSatisfied',
              'evidenceAccepted',
              'equivalenceProven',
              'scopeEnforced',
              'ciEnforcementEnabled',
            ]),
            futureAllowedTarget: stringValue(
              asRecord(inputs.mutationPolicy.futureMutationTargetPolicy)?.futureAllowedTarget,
            ),
          }
        : {},
      findings: mutationPolicyStage.findings,
    }),
  )

  const firstError = findings.find((finding) => finding.severity === 'error')
  const ready = !firstError
  const dryRunReadinessStatus = firstError
    ? statusForFinding(firstError.code)
    : 'dry-run-ready-for-future-apply-command'
  const terminalStage = terminalStageForStatus(dryRunReadinessStatus)
  const approvedStateCreatedPreview =
    decisionStage.findings.length === 0 &&
    proposalStage.findings.length === 0 &&
    approvedBoundaryStage.findings.length === 0

  return {
    schemaVersion: 1,
    artifactRole: REPORT_ROLE,
    status: ready ? 'devview-approved-apply-dry-run-ready' : 'devview-approved-apply-dry-run-blocked',
    sourceHumanDecisionRecord: relativePath(root, inputs.resolvedDecisionRecordPath),
    sourceGraphDeltaProposal: relativePath(root, inputs.resolvedProposalPath),
    sourceApprovedStateBoundary: relativePath(root, inputs.resolvedApprovedStateBoundaryPath),
    sourceApplyBoundary: relativePath(root, inputs.resolvedApplyBoundaryPath),
    sourceMutationPolicyBoundary: inputs.resolvedMutationPolicyPath
      ? relativePath(root, inputs.resolvedMutationPolicyPath)
      : null,
    sourceReviewPacket: stringValue(inputs.decisionRecord.sourceReviewPacket) || null,
    proposalId: stringValue(inputs.proposal.proposalId) || stringValue(inputs.decisionRecord.proposalId),
    decisionKind: stringValue(inputs.decisionRecord.decisionKind),
    decisionValue: stringValue(inputs.decisionRecord.decisionValue),
    decisionLifecycleHardeningStatus: stringValue(inputs.decisionRecord.decisionLifecycleHardeningStatus),
    approvedStateDryRunStatus: approvedStateCreatedPreview
      ? 'approved-state-created-preview-in-memory'
      : 'approved-state-blocked',
    applyReadinessDryRunStatus: ready ? 'dry-run-ready-approved-state-present' : 'blocked-approved-state-not-created',
    mutationPolicyStatus: !inputs.mutationPolicy
      ? 'mutation-policy-missing'
      : mutationPolicyStage.findings.length === 0
        ? 'mutation-policy-valid'
        : 'mutation-policy-invalid',
    dryRunReadinessStatus,
    terminalStage,
    validationFindings: findings,
    stageSummaries,
    approvedProposalStateCreatedPreview: approvedStateCreatedPreview,
    graphDeltaApplyEnabled: false,
    graphDeltaApplied: false,
    graphSourceMutationAllowed: false,
    graphSourceMutated: false,
    mutationAllowed: false,
    runtimeEvidenceSatisfied: false,
    evidenceAccepted: false,
    equivalenceProven: false,
    scopeEnforced: false,
    ciEnforcementEnabled: false,
    strictModeEnabled: false,
    guidedEnforcementEnabled: false,
    approvalAutomationEnabled: false,
    codexSelfApprovalAllowed: false,
    userAcceptanceAutomated: false,
    nonEnforcing: true,
    allowedUse: ready
      ? [
          'review apply dry-run readiness before a separate future graph delta apply command',
          'confirm hardened human approval, proposal, apply boundary, and mutation policy provenance',
          'serve as report-only context; future apply must revalidate current graph-source identity and rollback requirements',
        ]
      : [
          'document why approved apply dry-run readiness is blocked',
          'preserve decision/proposal/boundary provenance for human review',
          'keep blocked inputs out of any future apply path',
        ],
    forbiddenUse: [
      'graph delta apply',
      'graph-source mutation',
      'approval automation',
      'Codex self-approval',
      'runtime Evidence satisfaction',
      'Evidence acceptance',
      'equivalence proof',
      'scope enforcement',
      'CI required check or branch protection mutation',
      'user acceptance automation',
      'provider invocation or network call',
    ],
    outputWritePolicy: 'explicit-output-only',
    writtenOutputPath: null,
    writtenOutputPathAuthorityStatus: 'explicit-approved-apply-dry-run-output-not-source-authority',
    markdownReportPath: null,
    nonExecutionBoundary:
      'This Approved Apply Dry Run report checks readiness only. It does not apply graph deltas, mutate graph-source, accept or satisfy Evidence, prove equivalence, enforce scope, configure CI or required checks, change branch protection, invoke providers, or automate approval/user acceptance.',
  }
}

export function renderApprovedApplyDryRunMarkdown(report: ApprovedApplyDryRunReport): string {
  const findingRows =
    report.validationFindings.length === 0
      ? 'None.'
      : report.validationFindings
          .map((finding) => `- [${finding.severity}] ${finding.code}: ${finding.message}`)
          .join('\n')
  const fieldTable = markdownTable(
    ['Field', 'Value'],
    [
      ['Readiness', `\`${report.dryRunReadinessStatus}\``],
      ['Terminal stage', `\`${report.terminalStage}\``],
      ['Decision', `\`${report.decisionValue}\``],
      ['Decision kind', `\`${report.decisionKind}\``],
      ['Proposal ID', `\`${report.proposalId}\``],
      ['Approved state preview created', `\`${report.approvedProposalStateCreatedPreview}\``],
      ['Mutation policy', `\`${report.mutationPolicyStatus}\``],
    ],
  )
  const stageTable = markdownTable(
    ['Stage', 'Status', 'Findings'],
    report.stageSummaries.map((stage) => [
      stage.stage,
      `\`${stage.status}\``,
      `\`${stage.findingCodes.join(', ') || 'none'}\``,
    ]),
  )

  return `# DevView Approved Apply Dry Run

Status: \`${report.status}\`

${fieldTable}

## Stage Summary

${stageTable}

## Findings

${findingRows}

## Safety Boundary

- Graph delta apply enabled: \`${report.graphDeltaApplyEnabled}\`
- Graph delta applied: \`${report.graphDeltaApplied}\`
- Graph-source mutation allowed: \`${report.graphSourceMutationAllowed}\`
- Graph-source mutated: \`${report.graphSourceMutated}\`
- Mutation allowed: \`${report.mutationAllowed}\`
- Runtime Evidence satisfied: \`${report.runtimeEvidenceSatisfied}\`
- Evidence accepted: \`${report.evidenceAccepted}\`
- Equivalence proven: \`${report.equivalenceProven}\`
- Scope enforced: \`${report.scopeEnforced}\`
- CI enforcement enabled: \`${report.ciEnforcementEnabled}\`
- Approval automation enabled: \`${report.approvalAutomationEnabled}\`
`
}

function markdownTable(headers: string[], rows: string[][]): string {
  const widths = headers.map((header, index) =>
    Math.max(header.length, ...rows.map((row) => (row[index] ?? '').length)),
  )
  const renderRow = (cells: string[]): string =>
    `| ${cells.map((cell, index) => cell.padEnd(widths[index] ?? cell.length)).join(' | ')} |`
  const separator = `| ${widths.map((width) => '-'.repeat(width)).join(' | ')} |`
  return [renderRow(headers), separator, ...rows.map((row) => renderRow(row))].join('\n')
}

function validateHumanDecision(
  decisionRecord: JsonRecord,
  reviewPacket: JsonRecord | null,
  root: string,
  inputs: LoadedInputs,
): { findings: ApprovedApplyDryRunFinding[] } {
  const findings: ApprovedApplyDryRunFinding[] = []
  expectString(decisionRecord, 'artifactRole', DECISION_RECORD_ROLE, findings, 'APPROVED_APPLY_DECISION_ROLE_INVALID')
  expectString(
    decisionRecord,
    'status',
    'devview-human-decision-record-created',
    findings,
    'APPROVED_APPLY_DECISION_STATUS_INVALID',
  )
  expectString(
    decisionRecord,
    'decisionLifecycleHardeningStatus',
    HARDENED_DECISION_STATUS,
    findings,
    'APPROVED_APPLY_DECISION_NOT_HARDENED',
  )
  expectString(decisionRecord, 'decisionValue', 'approve-proposal', findings, 'APPROVED_APPLY_DECISION_NOT_APPROVE')
  expectString(decisionRecord, 'decisionKind', 'approve', findings, 'APPROVED_APPLY_DECISION_KIND_NOT_APPROVE')
  expectString(decisionRecord, 'decisionActorType', 'human', findings, 'APPROVED_APPLY_DECISION_ACTOR_NOT_HUMAN')
  if (!['explicit-cli-input', 'imported-human-review'].includes(stringValue(decisionRecord.decisionSource))) {
    findings.push(
      errorFinding('APPROVED_APPLY_DECISION_SOURCE_INVALID', 'decisionSource', {
        expected: ['explicit-cli-input', 'imported-human-review'],
        actual: decisionRecord.decisionSource,
        message: 'Approved apply dry-run requires an explicit human decision source.',
      }),
    )
  }
  expectString(
    decisionRecord,
    'decisionProvenance',
    'human-authored-explicit-decision',
    findings,
    'APPROVED_APPLY_DECISION_PROVENANCE_INVALID',
  )
  expectString(
    decisionRecord,
    'reviewPacketCompletenessStatus',
    'complete',
    findings,
    'APPROVED_APPLY_REVIEW_PACKET_INCOMPLETE',
  )
  expectString(
    decisionRecord,
    'selfApprovalCheckStatus',
    'passed-human-actor',
    findings,
    'APPROVED_APPLY_SELF_APPROVAL_CHECK_INVALID',
  )
  if (!stringValue(decisionRecord.sourceReviewPacket)) {
    findings.push(
      errorFinding('APPROVED_APPLY_REVIEW_PACKET_MISSING', 'sourceReviewPacket', {
        expected: 'non-empty review packet path',
        actual: decisionRecord.sourceReviewPacket,
        message: 'Approved apply dry-run requires the hardened decision record to reference a Human Review Packet.',
      }),
    )
  }
  if (reviewPacket) {
    expectString(
      reviewPacket,
      'artifactRole',
      REVIEW_PACKET_ROLE,
      findings,
      'APPROVED_APPLY_REVIEW_PACKET_ROLE_INVALID',
    )
    const expectedReviewPath = stringValue(decisionRecord.sourceReviewPacket)
    const actualReviewPath = inputs.resolvedReviewPacketPath ? relativePath(root, inputs.resolvedReviewPacketPath) : ''
    if (expectedReviewPath && actualReviewPath && expectedReviewPath !== actualReviewPath) {
      findings.push(
        errorFinding('APPROVED_APPLY_REVIEW_PACKET_PATH_MISMATCH', 'sourceReviewPacket', {
          expected: expectedReviewPath,
          actual: actualReviewPath,
          message: 'Optional review packet input does not match the decision record sourceReviewPacket path.',
        }),
      )
    }
    const reviewSourceProposal = stringValue(reviewPacket.sourceProposal)
    const proposalPath = relativePath(root, inputs.resolvedProposalPath)
    if (reviewSourceProposal && reviewSourceProposal !== proposalPath) {
      findings.push(
        errorFinding('APPROVED_APPLY_REVIEW_PACKET_PROPOSAL_MISMATCH', 'reviewPacket.sourceProposal', {
          expected: proposalPath,
          actual: reviewSourceProposal,
          message: 'Human Review Packet sourceProposal does not match the proposal input path.',
        }),
      )
    }
  }
  for (const field of [
    'approvedProposalStateCreated',
    'graphDeltaApplyEnabled',
    'graphDeltaApplied',
    'graphSourceMutationAllowed',
    'graphSourceMutated',
    'runtimeEvidenceSatisfied',
    'evidenceAccepted',
    'equivalenceProven',
    'scopeEnforced',
    'ciEnforcementEnabled',
    'approvalAutomationEnabled',
    'graphDeltaApplyTriggered',
    'selfApprovalRejected',
    'aiGeneratedDecisionAllowed',
    'codexSelfApprovalAllowed',
    'approvalAutomationAllowed',
    'userAcceptanceAutomated',
  ]) {
    if (field in decisionRecord && decisionRecord[field] !== false) {
      findings.push(unsafeFalseFinding('Human Decision Record', field, decisionRecord[field]))
    }
  }
  if (decisionRecord.humanDecisionRecorded !== true) {
    findings.push(
      errorFinding('APPROVED_APPLY_HUMAN_DECISION_NOT_RECORDED', 'humanDecisionRecorded', {
        expected: true,
        actual: decisionRecord.humanDecisionRecorded,
        message: 'Approved apply dry-run requires humanDecisionRecorded true.',
      }),
    )
  }
  return { findings }
}

function validateProposal(
  proposal: JsonRecord,
  root: string,
  inputs: LoadedInputs,
): { findings: ApprovedApplyDryRunFinding[] } {
  const findings: ApprovedApplyDryRunFinding[] = []
  expectString(proposal, 'artifactRole', PROPOSAL_ROLE, findings, 'APPROVED_APPLY_PROPOSAL_ROLE_INVALID')
  if (proposal.proposalOnly !== true) {
    findings.push(
      errorFinding('APPROVED_APPLY_PROPOSAL_NOT_PROPOSAL_ONLY', 'proposalOnly', {
        expected: true,
        actual: proposal.proposalOnly,
        message: 'Approved apply dry-run requires a proposal-only preview.',
      }),
    )
  }
  const decisionProposalId = stringValue(inputs.decisionRecord.proposalId)
  const proposalId = stringValue(proposal.proposalId)
  if (decisionProposalId !== proposalId) {
    findings.push(
      errorFinding('APPROVED_APPLY_PROPOSAL_ID_MISMATCH', 'proposalId', {
        expected: decisionProposalId,
        actual: proposalId,
        message: 'Human Decision Record proposalId does not match the proposal input.',
      }),
    )
  }
  const proposalPath = relativePath(root, inputs.resolvedProposalPath)
  for (const field of ['sourceGraphDeltaProposal', 'sourceProposal']) {
    const sourcePath = stringValue(inputs.decisionRecord[field])
    if (sourcePath && sourcePath !== proposalPath) {
      findings.push(
        errorFinding('APPROVED_APPLY_PROPOSAL_PATH_MISMATCH', field, {
          expected: sourcePath,
          actual: proposalPath,
          message: `Human Decision Record ${field} does not match the proposal input path.`,
        }),
      )
    }
  }
  for (const field of ['graphDeltaApplied', 'graphSourceMutated']) {
    const value = proposalFlagValue(proposal, field)
    if (value !== false) {
      findings.push(
        errorFinding('APPROVED_APPLY_PROPOSAL_ALREADY_APPLIED_OR_MUTATED', field, {
          expected: false,
          actual: value,
          message: `Proposal input is not dry-run safe because ${field} is not false.`,
        }),
      )
    }
  }
  for (const field of [
    'graphDeltaApplyEnabled',
    'graphSourceMutationAllowed',
    'runtimeEvidenceSatisfied',
    'evidenceAccepted',
    'equivalenceProven',
    'scopeEnforced',
    'ciEnforcementEnabled',
  ]) {
    const value = proposalFlagValue(proposal, field)
    if (value !== undefined && value !== false) {
      findings.push(unsafeFalseFinding('proposal', field, value))
    }
  }
  return { findings }
}

function proposalFlagValue(proposal: JsonRecord, field: string): unknown {
  if (field in proposal) {
    return proposal[field]
  }
  const boundaries = asRecord(proposal.boundaries)
  if (boundaries && field in boundaries) {
    return boundaries[field]
  }
  if (boundaries && field === 'evidenceAccepted' && 'acceptedEvidence' in boundaries) {
    return boundaries.acceptedEvidence
  }
  return undefined
}

function validateApprovedStateBoundary(boundary: JsonRecord): { findings: ApprovedApplyDryRunFinding[] } {
  const findings: ApprovedApplyDryRunFinding[] = []
  expectString(
    boundary,
    'artifactRole',
    APPROVED_STATE_BOUNDARY_ROLE,
    findings,
    'APPROVED_APPLY_APPROVED_STATE_BOUNDARY_ROLE_INVALID',
  )
  expectString(
    boundary,
    'status',
    APPROVED_STATE_BOUNDARY_STATUS,
    findings,
    'APPROVED_APPLY_APPROVED_STATE_BOUNDARY_STATUS_INVALID',
  )
  for (const field of [
    'approvedProposalStateCreated',
    'graphDeltaApplyEnabled',
    'graphDeltaApplied',
    'graphSourceMutationAllowed',
    'graphSourceMutated',
    'runtimeEvidenceSatisfied',
    'equivalenceProven',
    'scopeEnforced',
    'ciEnforcementEnabled',
  ]) {
    if (boundary[field] !== false) {
      findings.push(unsafeFalseFinding('Approved Proposal State boundary', field, boundary[field]))
    }
  }
  return { findings }
}

function validateApplyBoundary(boundary: JsonRecord): { findings: ApprovedApplyDryRunFinding[] } {
  const findings: ApprovedApplyDryRunFinding[] = []
  expectString(boundary, 'artifactRole', APPLY_BOUNDARY_ROLE, findings, 'APPROVED_APPLY_APPLY_BOUNDARY_ROLE_INVALID')
  expectString(boundary, 'status', APPLY_BOUNDARY_STATUS, findings, 'APPROVED_APPLY_APPLY_BOUNDARY_STATUS_INVALID')
  for (const field of [
    'graphDeltaApplyEnabled',
    'graphDeltaApplied',
    'graphSourceMutationAllowed',
    'graphSourceMutated',
    'runtimeEvidenceSatisfied',
    'equivalenceProven',
    'scopeEnforced',
    'ciEnforcementEnabled',
  ]) {
    if (boundary[field] !== false) {
      findings.push(unsafeFalseFinding('Graph Delta Apply boundary', field, boundary[field]))
    }
  }
  return { findings }
}

function validateMutationPolicy(policy: JsonRecord | null): { findings: ApprovedApplyDryRunFinding[] } {
  const findings: ApprovedApplyDryRunFinding[] = []
  if (!policy) {
    findings.push(
      errorFinding('APPROVED_APPLY_MUTATION_POLICY_MISSING', 'mutationPolicy', {
        expected: 'devview-graph-source-mutation-policy-boundary-preview',
        actual: null,
        message: 'Approved apply dry-run requires --mutation-policy before any ready status can be reported.',
      }),
    )
    return { findings }
  }
  expectString(policy, 'artifactRole', MUTATION_POLICY_ROLE, findings, 'APPROVED_APPLY_MUTATION_POLICY_ROLE_INVALID')
  expectString(policy, 'status', MUTATION_POLICY_STATUS, findings, 'APPROVED_APPLY_MUTATION_POLICY_STATUS_INVALID')
  for (const field of [
    'graphSourceMutationAllowed',
    'graphSourceMutated',
    'graphDeltaApplyEnabled',
    'graphDeltaApplied',
    'runtimeEvidenceSatisfied',
    'evidenceAccepted',
    'equivalenceProven',
    'scopeEnforced',
    'ciEnforcementEnabled',
  ]) {
    if (policy[field] !== false) {
      findings.push(
        errorFinding('APPROVED_APPLY_MUTATION_POLICY_UNSAFE_AUTHORITY_FLAG', field, {
          expected: false,
          actual: policy[field],
          message: `Graph-source Mutation Policy boundary has unsafe authority flag ${field}; it must be false.`,
        }),
      )
    }
  }
  const targetPolicy = asRecord(policy.futureMutationTargetPolicy)
  if (targetPolicy?.futureAllowedTarget !== 'explicit-current-graph-source-only') {
    findings.push(
      errorFinding('APPROVED_APPLY_MUTATION_POLICY_TARGET_INVALID', 'futureMutationTargetPolicy.futureAllowedTarget', {
        expected: 'explicit-current-graph-source-only',
        actual: targetPolicy?.futureAllowedTarget,
        message: 'Mutation policy must constrain future mutation to the explicit current graph-source only.',
      }),
    )
  }
  for (const field of [
    'requiresResolvedAbsolutePathCheck',
    'requiresRepoRootContainmentCheck',
    'requiresCurrentGraphSourceIdentityCheck',
    'requiresApprovedProposalState',
    'requiresDryRunReview',
    'requiresRollbackFallbackPlan',
    'requiresPostMutationValidationPlan',
  ]) {
    if (field in (targetPolicy ?? {}) && targetPolicy?.[field] !== true) {
      findings.push(
        errorFinding('APPROVED_APPLY_MUTATION_POLICY_REQUIREMENT_INVALID', `futureMutationTargetPolicy.${field}`, {
          expected: true,
          actual: targetPolicy?.[field],
          message: `Mutation policy future target requirement ${field} must be true when present.`,
        }),
      )
    }
  }
  requireRequirement(policy.futurePreMutationRequirements, 'backup-or-reversible-patch', findings)
  requireRequirement(policy.futurePreMutationRequirements, 'fallback-plan', findings)
  requireRequirement(policy.futurePostMutationRequirements, 'regenerate-read-model', findings)
  requireRequirement(policy.futurePostMutationRequirements, 'consistency-check', findings)
  return { findings }
}

function requireRequirement(value: unknown, requirementId: string, findings: ApprovedApplyDryRunFinding[]): void {
  if (!Array.isArray(value)) {
    findings.push(
      errorFinding('APPROVED_APPLY_MUTATION_POLICY_REQUIREMENTS_MISSING', 'mutationPolicyRequirements', {
        expected: requirementId,
        actual: 'missing-list',
        message: `Mutation policy must include future requirement ${requirementId}.`,
      }),
    )
    return
  }
  const present = value.some((entry) => asRecord(entry)?.requirementId === requirementId)
  if (!present) {
    findings.push(
      errorFinding('APPROVED_APPLY_MUTATION_POLICY_REQUIREMENT_MISSING', 'mutationPolicyRequirements', {
        expected: requirementId,
        actual: value.map((entry) => asRecord(entry)?.requirementId).filter(Boolean),
        message: `Mutation policy must include future requirement ${requirementId}.`,
      }),
    )
  }
}

function statusForFinding(code: string): DryRunReadinessStatus {
  if (code.includes('MUTATION_POLICY_MISSING')) {
    return 'blocked-mutation-policy-missing'
  }
  if (code.includes('MUTATION_POLICY')) {
    return 'blocked-mutation-policy-invalid'
  }
  if (code.includes('DECISION_NOT_HARDENED')) {
    return 'blocked-unhardened-decision'
  }
  if (code.includes('DECISION_NOT_APPROVE') || code.includes('DECISION_KIND_NOT_APPROVE')) {
    return 'blocked-decision-not-approve'
  }
  if (code.includes('REVIEW_PACKET')) {
    return 'blocked-review-packet-incomplete'
  }
  if (code.includes('PROPOSAL_ID_MISMATCH') || code.includes('PROPOSAL_PATH_MISMATCH')) {
    return 'blocked-proposal-mismatch'
  }
  if (code.includes('ALREADY_APPLIED_OR_MUTATED')) {
    return 'blocked-already-applied-or-mutated'
  }
  if (code.includes('APPLY_BOUNDARY')) {
    return 'blocked-apply-boundary-invalid'
  }
  if (code.includes('APPROVED_STATE_BOUNDARY')) {
    return 'blocked-missing-approved-state'
  }
  return 'blocked-unsafe-authority-flag'
}

function terminalStageForStatus(status: DryRunReadinessStatus): ApprovedApplyDryRunReport['terminalStage'] {
  if (
    status === 'blocked-unhardened-decision' ||
    status === 'blocked-decision-not-approve' ||
    status === 'blocked-review-packet-incomplete'
  ) {
    return 'human-decision'
  }
  if (status === 'blocked-proposal-mismatch' || status === 'blocked-already-applied-or-mutated') {
    return 'proposal'
  }
  if (status === 'blocked-missing-approved-state') {
    return 'approved-state-boundary'
  }
  if (status === 'blocked-apply-boundary-invalid') {
    return 'apply-boundary'
  }
  if (status === 'blocked-mutation-policy-missing' || status === 'blocked-mutation-policy-invalid') {
    return 'mutation-policy'
  }
  if (status === 'dry-run-ready-for-future-apply-command') {
    return 'ready'
  }
  return 'human-decision'
}

function stageSummary(
  stage: string,
  status: StageStatus,
  input: {
    artifactPath?: string | null
    artifactRole?: string
    artifactStatus?: string
    importantFlags: Record<string, unknown>
    findings: ApprovedApplyDryRunFinding[]
  },
): ApprovedApplyDryRunStageSummary {
  return {
    stage,
    status,
    ...(input.artifactPath !== undefined ? { artifactPath: input.artifactPath } : {}),
    ...(input.artifactRole ? { artifactRole: input.artifactRole } : {}),
    ...(input.artifactStatus ? { artifactStatus: input.artifactStatus } : {}),
    importantFlags: input.importantFlags,
    findingCodes: input.findings.map((finding) => finding.code),
  }
}

async function loadInputs(root: string, options: ApprovedApplyDryRunOptions): Promise<LoadedInputs> {
  const resolvedDecisionRecordPath = resolveRepoPath(root, options.decisionRecord)
  const decisionRecord = await readRequiredJson(resolvedDecisionRecordPath, 'Human Decision Record')
  const resolvedProposalPath = resolveRepoPath(root, options.proposal)
  const proposal = await readRequiredJson(resolvedProposalPath, 'proposal-only Graph Delta preview')
  const resolvedApprovedStateBoundaryPath = resolveRepoPath(root, options.approvedStateBoundary)
  const approvedStateBoundary = await readRequiredJson(
    resolvedApprovedStateBoundaryPath,
    'Approved Proposal State boundary',
  )
  const resolvedApplyBoundaryPath = resolveRepoPath(root, options.applyBoundary)
  const applyBoundary = await readRequiredJson(resolvedApplyBoundaryPath, 'Graph Delta Apply boundary')
  const resolvedMutationPolicyPath = options.mutationPolicy ? resolveRepoPath(root, options.mutationPolicy) : undefined
  const mutationPolicy = resolvedMutationPolicyPath
    ? await readRequiredJson(resolvedMutationPolicyPath, 'Graph-source Mutation Policy boundary')
    : null
  const resolvedReviewPacketPath = options.reviewPacket ? resolveRepoPath(root, options.reviewPacket) : undefined
  const reviewPacket = resolvedReviewPacketPath
    ? await readRequiredJson(resolvedReviewPacketPath, 'Human Review Packet')
    : null

  return {
    decisionRecord,
    resolvedDecisionRecordPath,
    proposal,
    resolvedProposalPath,
    approvedStateBoundary,
    resolvedApprovedStateBoundaryPath,
    applyBoundary,
    resolvedApplyBoundaryPath,
    mutationPolicy,
    ...(resolvedMutationPolicyPath ? { resolvedMutationPolicyPath } : {}),
    reviewPacket,
    ...(resolvedReviewPacketPath ? { resolvedReviewPacketPath } : {}),
  }
}

function validateRequiredInputs(options: ApprovedApplyDryRunOptions): void {
  if (!options.decisionRecord) {
    throw new Error('report-approved-apply-dry-run requires --decision-record <file>.')
  }
  if (!options.proposal) {
    throw new Error('report-approved-apply-dry-run requires --proposal <file>.')
  }
  if (!options.approvedStateBoundary) {
    throw new Error('report-approved-apply-dry-run requires --approved-state-boundary <file>.')
  }
  if (!options.applyBoundary) {
    throw new Error('report-approved-apply-dry-run requires --apply-boundary <file>.')
  }
  if (!options.output) {
    throw new Error('report-approved-apply-dry-run requires --output <file>.')
  }
}

async function assertOutputAuthority(
  root: string,
  input: LoadedInputs & { output: string; markdown?: string },
): Promise<void> {
  const resolvedOutputPath = resolveRepoPath(root, input.output)
  const resolvedMarkdownPath = input.markdown ? resolveRepoPath(root, input.markdown) : undefined
  if (resolvedMarkdownPath && pathKey(resolvedOutputPath) === pathKey(resolvedMarkdownPath)) {
    throw new Error('Approved Apply Dry Run output is unsafe: --output and --markdown must be different paths.')
  }
  const protectedPaths = buildProtectedPathMap(root, input)
  for (const [label, requested, resolved] of [
    ['JSON output', input.output, resolvedOutputPath],
    ['Markdown output', input.markdown, resolvedMarkdownPath],
  ] as const) {
    if (!requested || !resolved) {
      continue
    }
    const protectedLocation = classifyProtectedLocation(root, resolved)
    if (protectedLocation) {
      throw new Error(`Approved Apply Dry Run ${label} path is unsafe: ${requested} targets ${protectedLocation}.`)
    }
    const protectedReason = protectedPaths.get(pathKey(resolved))
    if (protectedReason) {
      throw new Error(
        `Approved Apply Dry Run ${label} path is unsafe: ${requested} would overwrite ${protectedReason}.`,
      )
    }
    const existingAuthority = await classifyExistingSourceAuthority(resolved)
    if (existingAuthority) {
      throw new Error(
        `Approved Apply Dry Run ${label} path is unsafe: ${requested} already contains ${existingAuthority}. Choose a dedicated dry-run output path.`,
      )
    }
  }
}

function buildProtectedPathMap(root: string, input: LoadedInputs): Map<string, string> {
  const protectedPaths = new Map<string, string>()
  const addResolved = (candidatePath: string | undefined, reason: string): void => {
    if (candidatePath && !protectedPaths.has(pathKey(candidatePath))) {
      protectedPaths.set(pathKey(candidatePath), reason)
    }
  }
  const addConcrete = (candidate: unknown, reason: string): void => {
    const candidatePath = stringValue(candidate)
    if (!isConcreteOutputProtectedPath(candidatePath)) {
      return
    }
    addResolved(resolveRepoPath(root, candidatePath), reason)
  }

  addResolved(input.resolvedDecisionRecordPath, 'the source Human Decision Record')
  addResolved(input.resolvedProposalPath, 'the source Graph Delta proposal')
  addResolved(input.resolvedApprovedStateBoundaryPath, 'the source Approved Proposal State boundary')
  addResolved(input.resolvedApplyBoundaryPath, 'the source Graph Delta Apply boundary')
  addResolved(input.resolvedMutationPolicyPath, 'the source Graph-source Mutation Policy boundary')
  addResolved(input.resolvedReviewPacketPath, 'the optional Human Review Packet input')
  addConcrete(input.decisionRecord.sourceReviewPacket, 'the decision-record source Human Review Packet')
  addConcrete(input.decisionRecord.sourceRuntimeReport, 'the decision-record source runtime report')

  for (const source of [
    input.decisionRecord,
    input.proposal,
    input.approvedStateBoundary,
    input.applyBoundary,
    input.mutationPolicy,
    input.reviewPacket,
  ]) {
    if (!source) {
      continue
    }
    for (const candidatePath of collectConcretePathStrings(source)) {
      addConcrete(candidatePath, `linked source artifact ${candidatePath}`)
    }
  }

  return protectedPaths
}

function classifyProtectedLocation(root: string, resolvedPath: string): string | null {
  const relative = relativePath(root, resolvedPath)
  if (relative === '.codex/config.json' || relative.startsWith('.codex/hooks/')) {
    return 'Codex hook/config path'
  }
  if (relative === '.pbe' || relative.startsWith('.pbe/')) {
    return '.pbe source/control path'
  }
  return null
}

async function classifyExistingSourceAuthority(filePath: string): Promise<string | null> {
  const parsed = await readJsonSafe<JsonRecord>(filePath)
  if (!parsed.ok) {
    return null
  }
  const record = asRecord(parsed.value)
  const artifactRole = stringValue(record?.artifactRole)
  if (!artifactRole || artifactRole === REPORT_ROLE) {
    return null
  }
  if (
    artifactRole === DECISION_RECORD_ROLE ||
    artifactRole === PROPOSAL_ROLE ||
    artifactRole === REVIEW_PACKET_ROLE ||
    artifactRole === APPROVED_STATE_BOUNDARY_ROLE ||
    artifactRole === APPLY_BOUNDARY_ROLE ||
    artifactRole === MUTATION_POLICY_ROLE ||
    artifactRole.includes('graph-source') ||
    artifactRole.includes('read-model') ||
    artifactRole.includes('evidence') ||
    artifactRole.includes('runtime') ||
    artifactRole.includes('hook') ||
    artifactRole.includes('project-memory') ||
    [
      'contract-compiler-input',
      'instruction-pack',
      'selected-graph-slice',
      'graph-traversal-plan',
      'request-ir-graph-aware-validation',
      'request-ir-candidate',
      'devview-approved-proposal-state-preview',
      'devview-graph-delta-apply-readiness-preview',
    ].includes(artifactRole)
  ) {
    return `source artifactRole "${artifactRole}"`
  }
  if (asRecord(record?.sourceRecords)) {
    return 'graph-source-shaped sourceRecords'
  }
  return null
}

async function readRequiredJson(filePath: string, label: string): Promise<JsonRecord> {
  const parsed = await readJsonSafe<JsonRecord>(filePath)
  if (!parsed.ok) {
    throw new Error(`Unable to read ${label}: ${parsed.error}`)
  }
  const record = asRecord(parsed.value)
  if (!record) {
    throw new Error(`Unable to read ${label}: expected JSON object.`)
  }
  return record
}

function expectString(
  record: JsonRecord,
  field: string,
  expected: string,
  findings: ApprovedApplyDryRunFinding[],
  code: string,
): void {
  if (record[field] !== expected) {
    findings.push(
      errorFinding(code, field, {
        expected,
        actual: record[field],
        message: `${field} must be ${JSON.stringify(expected)} for approved apply dry-run readiness.`,
      }),
    )
  }
}

function unsafeFalseFinding(source: string, field: string, actual: unknown): ApprovedApplyDryRunFinding {
  return errorFinding('APPROVED_APPLY_UNSAFE_AUTHORITY_FLAG', field, {
    expected: false,
    actual,
    message: `${source} has unsafe authority flag ${field}; it must be false for approved apply dry-run readiness.`,
  })
}

function errorFinding(
  code: string,
  field: string,
  input: { expected: unknown; actual: unknown; message: string },
): ApprovedApplyDryRunFinding {
  return {
    code,
    severity: 'error',
    field,
    expected: input.expected,
    actual: input.actual,
    message: input.message,
  }
}

function pickFlags(record: JsonRecord, fields: string[]): Record<string, unknown> {
  const result: Record<string, unknown> = {}
  for (const field of fields) {
    if (field in record) {
      result[field] = record[field]
    }
  }
  return result
}

function collectConcretePathStrings(value: unknown, seen = new Set<unknown>()): string[] {
  if (typeof value === 'string') {
    return isConcreteOutputProtectedPath(value) ? [value] : []
  }
  if (typeof value !== 'object' || value === null || seen.has(value)) {
    return []
  }
  seen.add(value)
  if (Array.isArray(value)) {
    return value.flatMap((entry) => collectConcretePathStrings(entry, seen))
  }
  return Object.values(value as JsonRecord).flatMap((entry) => collectConcretePathStrings(entry, seen))
}

function isConcreteOutputProtectedPath(value: string): boolean {
  return (
    value.includes('/') ||
    value.includes('\\') ||
    value.startsWith('.') ||
    value.endsWith('.json') ||
    value.endsWith('.md') ||
    value.endsWith('.txt')
  )
}

function stringValue(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

function asRecord(value: unknown): JsonRecord | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as JsonRecord) : null
}

function resolveRepoPath(root: string, filePath: string): string {
  return path.isAbsolute(filePath) ? filePath : path.resolve(root, filePath)
}

function pathKey(filePath: string): string {
  return path.resolve(filePath).replaceAll('\\', '/').toLowerCase()
}
