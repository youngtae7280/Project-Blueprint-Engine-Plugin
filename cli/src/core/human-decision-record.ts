import path from 'node:path'
import { readJsonSafe, relativePath, writeJsonAtomic, writeTextAtomic } from './fs.js'
import { validateProposalOnlyGraphDeltaPreview } from './graph-delta-human-review-packet.js'

type JsonRecord = Record<string, unknown>

const BOUNDARY_ROLE = 'devview-human-decision-record-boundary-preview'
const BOUNDARY_STATUS = 'devview-human-decision-record-boundary-previewed'
const COMMAND_BOUNDARY_ROLE = 'devview-human-decision-record-command-boundary-preview'
const COMMAND_BOUNDARY_STATUS = 'devview-human-decision-record-command-boundary-previewed'
const REVIEW_PACKET_ROLE = 'graph-delta-human-review-packet'
const DECISION_RECORD_ROLE = 'devview-human-decision-record'

export interface HumanDecisionRecordOptions {
  boundary?: string
  reviewPacket: string
  proposal: string
  decision: string
  reviewer: string
  rationale: string
  runtimeReport?: string
  output?: string
  markdown?: string
}

export interface HumanDecisionRecordFileResult {
  record: HumanDecisionRecord
  outputPath?: string
  markdownReport?: string
}

export interface HumanDecisionRecord {
  schemaVersion: 1
  artifactRole: typeof DECISION_RECORD_ROLE
  status: 'devview-human-decision-record-created'
  recordScope: 'explicit-human-decision-record-preview-no-apply'
  sourceBoundary: string | null
  sourceBoundaryArtifactRole: string | null
  sourceBoundaryStatus: string | null
  sourceReviewPacket: string
  sourceReviewPacketAuthorityStatus: string
  sourceGraphDeltaProposal: string
  sourceRuntimeReport: string | null
  proposalId: string
  proposalSchemaId: string
  decisionValue: string
  decisionSummary: string
  decisionRationale: string
  reviewerIdentity: string
  reviewedAt: string
  decisionProvenance: 'human-authored-explicit-decision'
  humanDecisionRecorded: true
  approvalStatus: 'human-approved-no-approved-state-created' | 'not-approved'
  approvedProposalStateCreated: false
  graphDeltaApplyEnabled: false
  graphDeltaApplied: false
  graphSourceMutationAllowed: false
  graphSourceMutated: false
  runtimeEvidenceSatisfied: false
  equivalenceProven: false
  scopeEnforced: false
  ciEnforcementEnabled: false
  strictModeEnabled: false
  guidedEnforcementEnabled: false
  userAcceptanceAutomated: false
  aiGeneratedDecisionAllowed: false
  codexSelfApprovalAllowed: false
  approvalAutomationAllowed: false
  allowedUse: string[]
  forbiddenUse: string[]
  outputWritePolicy: 'explicit-output-only'
  writtenOutputPath: string | null
  writtenOutputPathAuthorityStatus: 'not-written-stdout-only' | 'explicit-decision-record-output-not-source-authority'
  markdownReportPath: string | null
  nonExecutionBoundary: string
}

export async function recordHumanDecisionFile(
  root: string,
  options: HumanDecisionRecordOptions,
): Promise<HumanDecisionRecordFileResult> {
  validateRequiredInputs(options)

  const resolvedBoundaryPath = options.boundary ? resolveRepoPath(root, options.boundary) : undefined
  const boundary = resolvedBoundaryPath
    ? await readRequiredJson(resolvedBoundaryPath, 'Human Decision Record boundary')
    : null
  validateBoundary(boundary)

  const resolvedProposalPath = resolveRepoPath(root, options.proposal)
  const proposal = await readRequiredJson(resolvedProposalPath, 'proposal-only Graph Delta preview')
  validateProposalOnlyGraphDeltaPreview(proposal)

  const resolvedReviewPacketPath = resolveRepoPath(root, options.reviewPacket)
  const reviewPacket = await readOptionalJson(resolvedReviewPacketPath)
  validateReviewPacket(reviewPacket, relativePath(root, resolvedProposalPath))

  const resolvedRuntimeReportPath = options.runtimeReport ? resolveRepoPath(root, options.runtimeReport) : undefined
  if (resolvedRuntimeReportPath) {
    await ensureReadableFile(resolvedRuntimeReportPath, 'runtime report')
  }

  await assertDecisionRecordOutputAuthority(root, {
    boundary,
    resolvedBoundaryPath,
    reviewPacket,
    resolvedReviewPacketPath,
    proposal,
    resolvedProposalPath,
    resolvedRuntimeReportPath,
    output: options.output,
    markdown: options.markdown,
  })

  const decisionValues = allowedDecisionValues(boundary)
  if (!decisionValues.has(options.decision)) {
    throw new Error(
      `Unsafe human decision value: ${JSON.stringify(options.decision)} is not in the boundary allowedDecisionValues vocabulary.`,
    )
  }

  const record = buildHumanDecisionRecord(root, options, {
    boundary,
    resolvedBoundaryPath,
    reviewPacket,
    resolvedReviewPacketPath,
    proposal,
    resolvedProposalPath,
    resolvedRuntimeReportPath,
  })

  let outputPath: string | undefined
  let markdownReport: string | undefined
  if (options.output) {
    const resolvedOutputPath = resolveRepoPath(root, options.output)
    outputPath = relativePath(root, resolvedOutputPath)
    record.writtenOutputPath = outputPath
    record.writtenOutputPathAuthorityStatus = 'explicit-decision-record-output-not-source-authority'
    await writeJsonAtomic(resolvedOutputPath, record)
  }
  if (options.markdown) {
    const resolvedMarkdownPath = resolveRepoPath(root, options.markdown)
    markdownReport = relativePath(root, resolvedMarkdownPath)
    record.markdownReportPath = markdownReport
    await writeTextAtomic(resolvedMarkdownPath, renderHumanDecisionRecordMarkdown(record))
  }

  return { record, ...(outputPath ? { outputPath } : {}), ...(markdownReport ? { markdownReport } : {}) }
}

function buildHumanDecisionRecord(
  root: string,
  options: HumanDecisionRecordOptions,
  sources: {
    boundary: JsonRecord | null
    resolvedBoundaryPath?: string
    reviewPacket: JsonRecord | null
    resolvedReviewPacketPath: string
    proposal: JsonRecord
    resolvedProposalPath: string
    resolvedRuntimeReportPath?: string
  },
): HumanDecisionRecord {
  const proposalId = stringValue(sources.proposal.proposalId) || 'unknown-proposal'
  const decisionSummary =
    options.decision === 'approve-proposal'
      ? 'Human approval decision recorded; approved proposal state was not created.'
      : `Human decision recorded as ${options.decision}; proposal remains unapproved.`

  return {
    schemaVersion: 1,
    artifactRole: DECISION_RECORD_ROLE,
    status: 'devview-human-decision-record-created',
    recordScope: 'explicit-human-decision-record-preview-no-apply',
    sourceBoundary: sources.resolvedBoundaryPath ? relativePath(root, sources.resolvedBoundaryPath) : null,
    sourceBoundaryArtifactRole: sources.boundary ? stringValue(sources.boundary.artifactRole) : null,
    sourceBoundaryStatus: sources.boundary ? stringValue(sources.boundary.status) : null,
    sourceReviewPacket: relativePath(root, sources.resolvedReviewPacketPath),
    sourceReviewPacketAuthorityStatus: sources.reviewPacket
      ? 'json-human-review-packet-validated'
      : 'review-packet-path-readable-not-json-parsed',
    sourceGraphDeltaProposal: relativePath(root, sources.resolvedProposalPath),
    sourceRuntimeReport: sources.resolvedRuntimeReportPath
      ? relativePath(root, sources.resolvedRuntimeReportPath)
      : null,
    proposalId,
    proposalSchemaId: stringValue(sources.proposal.schemaId) || 'pbe-graph-update-proposal-v0',
    decisionValue: options.decision,
    decisionSummary,
    decisionRationale: options.rationale.trim(),
    reviewerIdentity: options.reviewer.trim(),
    reviewedAt: new Date().toISOString(),
    decisionProvenance: 'human-authored-explicit-decision',
    humanDecisionRecorded: true,
    approvalStatus:
      options.decision === 'approve-proposal' ? 'human-approved-no-approved-state-created' : 'not-approved',
    approvedProposalStateCreated: false,
    graphDeltaApplyEnabled: false,
    graphDeltaApplied: false,
    graphSourceMutationAllowed: false,
    graphSourceMutated: false,
    runtimeEvidenceSatisfied: false,
    equivalenceProven: false,
    scopeEnforced: false,
    ciEnforcementEnabled: false,
    strictModeEnabled: false,
    guidedEnforcementEnabled: false,
    userAcceptanceAutomated: false,
    aiGeneratedDecisionAllowed: false,
    codexSelfApprovalAllowed: false,
    approvalAutomationAllowed: false,
    allowedUse: [
      'record an explicit human-authored proposal decision for review traceability',
      'feed a future approved proposal state command only when decisionValue is approve-proposal',
      'preserve review packet, proposal, runtime report, and rationale provenance',
    ],
    forbiddenUse: [
      'approved proposal state creation',
      'graph delta apply',
      'graph-source mutation',
      'runtime Evidence satisfaction',
      'equivalence proof',
      'scope enforcement',
      'CI required check',
      'user acceptance automation',
      'approval inference from Codex, validators, runtime smoke, or CI',
    ],
    outputWritePolicy: 'explicit-output-only',
    writtenOutputPath: null,
    writtenOutputPathAuthorityStatus: 'not-written-stdout-only',
    markdownReportPath: null,
    nonExecutionBoundary:
      'This Human Decision Record command records explicit human decision metadata only. It does not create approved proposal state, apply graph deltas, mutate graph-source, satisfy runtime Evidence, prove equivalence, enforce scope, configure CI or required checks, change branch protection, or replace user acceptance.',
  }
}

export function renderHumanDecisionRecordMarkdown(record: HumanDecisionRecord): string {
  return `# DevView Human Decision Record

Status: \`${record.status}\`

| Field | Value |
| --- | --- |
| Decision | \`${record.decisionValue}\` |
| Approval status | \`${record.approvalStatus}\` |
| Proposal | \`${record.sourceGraphDeltaProposal}\` |
| Proposal ID | \`${record.proposalId}\` |
| Review packet | \`${record.sourceReviewPacket}\` |
| Reviewer | \`${record.reviewerIdentity}\` |

## Rationale

${record.decisionRationale}

## Non-Execution Boundary

- Approved proposal state created: \`${record.approvedProposalStateCreated}\`
- Graph delta applied: \`${record.graphDeltaApplied}\`
- Graph-source mutated: \`${record.graphSourceMutated}\`
- Runtime Evidence satisfied: \`${record.runtimeEvidenceSatisfied}\`
- Equivalence proven: \`${record.equivalenceProven}\`
- Scope enforced: \`${record.scopeEnforced}\`
- CI enforcement enabled: \`${record.ciEnforcementEnabled}\`
`
}

function validateRequiredInputs(options: HumanDecisionRecordOptions): void {
  if (!options.reviewPacket) {
    throw new Error('record-human-decision requires --review-packet <packetPath>.')
  }
  if (!options.proposal) {
    throw new Error('record-human-decision requires --proposal <proposalPath>.')
  }
  if (!options.decision) {
    throw new Error('record-human-decision requires --decision <value>.')
  }
  if (!options.reviewer || options.reviewer.trim().length === 0) {
    throw new Error('record-human-decision requires --reviewer <humanReviewerIdentity>.')
  }
  if (!options.rationale || options.rationale.trim().length === 0) {
    throw new Error('record-human-decision requires --rationale <humanAuthoredRationale>.')
  }
  const reviewer = options.reviewer.toLowerCase()
  for (const forbidden of ['codex', 'ai', 'assistant', 'bot', 'automation']) {
    if (reviewer.includes(forbidden)) {
      throw new Error(`Unsafe reviewer identity: reviewer must be human-provided and cannot contain "${forbidden}".`)
    }
  }
}

function validateBoundary(boundary: JsonRecord | null): void {
  if (!boundary) {
    return
  }
  const role = stringValue(boundary.artifactRole)
  const status = stringValue(boundary.status)
  const validHumanBoundary = role === BOUNDARY_ROLE && status === BOUNDARY_STATUS
  const validCommandBoundary = role === COMMAND_BOUNDARY_ROLE && status === COMMAND_BOUNDARY_STATUS
  if (!validHumanBoundary && !validCommandBoundary) {
    throw new Error(
      `Unsafe Human Decision Record boundary: expected ${BOUNDARY_ROLE}/${BOUNDARY_STATUS} or ${COMMAND_BOUNDARY_ROLE}/${COMMAND_BOUNDARY_STATUS}.`,
    )
  }
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
    if (boundaryValue(boundary, field) !== false) {
      throw new Error(`Unsafe Human Decision Record boundary: ${field} must be false.`)
    }
  }
}

function validateReviewPacket(reviewPacket: JsonRecord | null, sourceProposal: string): void {
  if (!reviewPacket) {
    return
  }
  if (reviewPacket.artifactRole !== REVIEW_PACKET_ROLE) {
    throw new Error(`Unsafe review packet input: artifactRole must be ${JSON.stringify(REVIEW_PACKET_ROLE)}.`)
  }
  if (reviewPacket.reviewPacketStatus !== 'review-required') {
    throw new Error('Unsafe review packet input: reviewPacketStatus must be "review-required".')
  }
  if (reviewPacket.sourceProposal !== sourceProposal) {
    throw new Error('Unsafe review packet provenance: sourceProposal does not match the proposal under decision.')
  }
  for (const field of [
    'graphSourceMutated',
    'graphDeltaApplied',
    'humanDecisionRecorded',
    'candidateEvidenceAccepted',
    'runtimeEvidenceSatisfied',
    'equivalenceProven',
  ]) {
    if (reviewPacket[field] !== false) {
      throw new Error(`Unsafe review packet boundary: ${field} must be false.`)
    }
  }
  if (reviewPacket.approvalStatus !== 'not-approved') {
    throw new Error('Unsafe review packet boundary: approvalStatus must be "not-approved".')
  }
}

function allowedDecisionValues(boundary: JsonRecord | null): Set<string> {
  const values = new Set<string>()
  const raw = Array.isArray(boundary?.allowedDecisionValues)
    ? boundary?.allowedDecisionValues
    : Array.isArray(boundary?.futureRequiredInputs)
      ? boundary?.futureRequiredInputs
      : []
  for (const entry of raw) {
    if (!asRecord(entry)) {
      continue
    }
    if (typeof entry.decisionValue === 'string') {
      values.add(entry.decisionValue)
    }
    if (Array.isArray(entry.allowedValues)) {
      for (const value of entry.allowedValues) {
        if (typeof value === 'string') {
          values.add(value)
        }
      }
    }
  }
  if (values.size === 0) {
    for (const fallback of ['approve-proposal', 'reject-proposal', 'request-revision', 'defer-decision']) {
      values.add(fallback)
    }
  }
  return values
}

async function assertDecisionRecordOutputAuthority(
  root: string,
  input: {
    boundary: JsonRecord | null
    resolvedBoundaryPath?: string
    reviewPacket: JsonRecord | null
    resolvedReviewPacketPath: string
    proposal: JsonRecord
    resolvedProposalPath: string
    resolvedRuntimeReportPath?: string
    output?: string
    markdown?: string
  },
): Promise<void> {
  if (!input.output && !input.markdown) {
    return
  }

  const protectedPaths = buildProtectedPathMap(root, input)
  const resolvedOutputPath = input.output ? resolveRepoPath(root, input.output) : undefined
  const resolvedMarkdownPath = input.markdown ? resolveRepoPath(root, input.markdown) : undefined

  if (resolvedOutputPath && resolvedMarkdownPath && pathKey(resolvedOutputPath) === pathKey(resolvedMarkdownPath)) {
    throw new Error('Human Decision Record output is unsafe: --output and --markdown must be different paths.')
  }

  for (const [label, requested, resolved] of [
    ['JSON output', input.output, resolvedOutputPath],
    ['Markdown output', input.markdown, resolvedMarkdownPath],
  ] as const) {
    if (!requested || !resolved) {
      continue
    }
    const protectedReason = protectedPaths.get(pathKey(resolved))
    if (protectedReason) {
      throw new Error(`Human Decision Record ${label} path is unsafe: ${requested} would overwrite ${protectedReason}.`)
    }
    const existingAuthority = await classifyExistingSourceAuthority(resolved)
    if (existingAuthority) {
      throw new Error(
        `Human Decision Record ${label} path is unsafe: ${requested} already contains ${existingAuthority}. Choose a dedicated decision-record output path.`,
      )
    }
  }
}

function buildProtectedPathMap(
  root: string,
  input: {
    boundary: JsonRecord | null
    resolvedBoundaryPath?: string
    reviewPacket: JsonRecord | null
    resolvedReviewPacketPath: string
    proposal: JsonRecord
    resolvedProposalPath: string
    resolvedRuntimeReportPath?: string
  },
): Map<string, string> {
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

  addResolved(input.resolvedBoundaryPath, 'the source Human Decision Record boundary')
  addResolved(input.resolvedReviewPacketPath, 'the source Human Review Packet')
  addResolved(input.resolvedProposalPath, 'the source Graph Delta proposal')
  addResolved(input.resolvedRuntimeReportPath, 'the source runtime report')

  for (const source of [input.boundary, input.reviewPacket, input.proposal]) {
    if (!source) {
      continue
    }
    for (const candidatePath of collectConcretePathStrings(source)) {
      addConcrete(candidatePath, `linked source artifact ${candidatePath}`)
    }
  }
  return protectedPaths
}

async function classifyExistingSourceAuthority(filePath: string): Promise<string | null> {
  const parsed = await readJsonSafe<JsonRecord>(filePath)
  if (!parsed.ok) {
    return null
  }
  const record = asRecord(parsed.value)
  const artifactRole = stringValue(record?.artifactRole)
  if (!artifactRole) {
    return null
  }
  if (artifactRole === DECISION_RECORD_ROLE) {
    return null
  }
  if (
    artifactRole.includes('graph-source') ||
    artifactRole.includes('evidence') ||
    artifactRole.includes('read-model') ||
    [
      BOUNDARY_ROLE,
      COMMAND_BOUNDARY_ROLE,
      REVIEW_PACKET_ROLE,
      'graph-delta-proposal-only-preview',
      'contract-compiler-input',
      'instruction-pack',
      'selected-graph-slice',
      'graph-traversal-plan',
      'request-ir-graph-aware-validation',
      'request-ir-candidate',
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

async function readOptionalJson(filePath: string): Promise<JsonRecord | null> {
  const parsed = await readJsonSafe<JsonRecord>(filePath)
  return parsed.ok && asRecord(parsed.value) ? parsed.value : null
}

async function ensureReadableFile(filePath: string, label: string): Promise<void> {
  const parsed = await readJsonSafe<JsonRecord>(filePath)
  if (!parsed.ok) {
    throw new Error(`Unable to read ${label}: ${parsed.error}`)
  }
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

function boundaryValue(record: JsonRecord, field: string): unknown {
  if (field in record) {
    return record[field]
  }
  const nested = asRecord(record.futureDecisionRecordOutputPreview) ?? asRecord(record.futureApprovedProposalBoundary)
  return nested?.[field]
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
