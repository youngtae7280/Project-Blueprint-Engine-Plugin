import path from 'node:path'
import { readJsonSafe, relativePath, writeJsonAtomic, writeTextAtomic } from './fs.js'

type JsonRecord = Record<string, unknown>

const POLICY_ROLE = 'devview-equivalence-proof-policy-boundary-preview'
const POLICY_STATUS = 'devview-equivalence-proof-policy-boundary-previewed'
const EVIDENCE_ACCEPTANCE_READINESS_ROLE = 'devview-evidence-acceptance-readiness-preview'
const READINESS_ROLE = 'devview-equivalence-proof-readiness-preview'

export interface EquivalenceProofReadinessOptions {
  policy: string
  evidenceAcceptanceReadiness: string
  output?: string
  markdown?: string
}

export interface EquivalenceProofReadinessFileResult {
  readiness: EquivalenceProofReadinessPreview
  outputPath?: string
  markdownReport?: string
}

export interface EquivalenceProofReadinessPreview {
  schemaVersion: 1
  artifactRole: typeof READINESS_ROLE
  status: 'devview-equivalence-proof-readiness-ready' | 'devview-equivalence-proof-readiness-blocked'
  readinessScope: 'equivalence-proof-readiness-preview-no-proof'
  sourcePolicyBoundary: string
  sourceEvidenceAcceptanceReadiness: string
  sourceGraphSourceMutationReadiness: string | null
  sourceApplyReadiness: string | null
  sourceApprovedProposalState: string | null
  sourceGraphDeltaProposal: string | null
  proposalId: string
  equivalenceProofReadinessStatus:
    | 'dry-run-ready-evidence-acceptance-readiness-present'
    | 'blocked-evidence-acceptance-readiness-not-ready'
  evidenceAcceptanceReadinessStatus: string
  mutationReadinessStatus: string
  applyReadinessStatus: string
  equivalenceAllowed: false
  equivalenceProofCommandImplemented: false
  equivalenceProven: false
  evidenceAccepted: false
  runtimeEvidenceSatisfied: false
  graphDeltaApplyEnabled: false
  graphDeltaApplied: false
  graphSourceMutationAllowed: false
  graphSourceMutated: false
  mutationAllowed: false
  acceptanceAllowed: false
  approvedProposalStateCreated: boolean
  humanDecisionRecorded: boolean
  humanReviewRequired: true
  scopeEnforced: false
  ciEnforcementEnabled: false
  strictModeEnabled: false
  guidedEnforcementEnabled: false
  validationFindings: EquivalenceProofReadinessFinding[]
  allowedUse: string[]
  forbiddenUse: string[]
  outputWritePolicy: 'explicit-output-only'
  writtenOutputPath: string | null
  writtenOutputPathAuthorityStatus:
    | 'not-written-stdout-only'
    | 'explicit-equivalence-proof-readiness-output-not-source-authority'
  markdownReportPath: string | null
  nonExecutionBoundary: string
}

export interface EquivalenceProofReadinessFinding {
  code: string
  severity: 'info' | 'warning' | 'error'
  message: string
  field?: string
  expected?: unknown
  actual?: unknown
}

export async function reportEquivalenceProofReadinessFile(
  root: string,
  options: EquivalenceProofReadinessOptions,
): Promise<EquivalenceProofReadinessFileResult> {
  validateRequiredInputs(options)

  const resolvedPolicyPath = resolveRepoPath(root, options.policy)
  const policy = await readRequiredJson(resolvedPolicyPath, 'Equivalence Proof Policy boundary')
  validatePolicy(policy)

  const resolvedEvidenceAcceptanceReadinessPath = resolveRepoPath(root, options.evidenceAcceptanceReadiness)
  const evidenceAcceptanceReadiness = await readRequiredJson(
    resolvedEvidenceAcceptanceReadinessPath,
    'Evidence Acceptance readiness',
  )
  validateEvidenceAcceptanceReadiness(evidenceAcceptanceReadiness)

  await assertOutputAuthority(root, {
    policy,
    resolvedPolicyPath,
    evidenceAcceptanceReadiness,
    resolvedEvidenceAcceptanceReadinessPath,
    output: options.output,
    markdown: options.markdown,
  })

  const readiness = buildEquivalenceProofReadiness(root, {
    resolvedPolicyPath,
    evidenceAcceptanceReadiness,
    resolvedEvidenceAcceptanceReadinessPath,
  })

  let outputPath: string | undefined
  let markdownReport: string | undefined
  if (options.output) {
    const resolvedOutputPath = resolveRepoPath(root, options.output)
    outputPath = relativePath(root, resolvedOutputPath)
    readiness.writtenOutputPath = outputPath
    readiness.writtenOutputPathAuthorityStatus = 'explicit-equivalence-proof-readiness-output-not-source-authority'
    await writeJsonAtomic(resolvedOutputPath, readiness)
  }
  if (options.markdown) {
    const resolvedMarkdownPath = resolveRepoPath(root, options.markdown)
    markdownReport = relativePath(root, resolvedMarkdownPath)
    readiness.markdownReportPath = markdownReport
    await writeTextAtomic(resolvedMarkdownPath, renderEquivalenceProofReadinessMarkdown(readiness))
  }

  return { readiness, ...(outputPath ? { outputPath } : {}), ...(markdownReport ? { markdownReport } : {}) }
}

function buildEquivalenceProofReadiness(
  root: string,
  input: {
    resolvedPolicyPath: string
    evidenceAcceptanceReadiness: JsonRecord
    resolvedEvidenceAcceptanceReadinessPath: string
  },
): EquivalenceProofReadinessPreview {
  const ready = input.evidenceAcceptanceReadiness.status === 'devview-evidence-acceptance-readiness-ready'
  return {
    schemaVersion: 1,
    artifactRole: READINESS_ROLE,
    status: ready ? 'devview-equivalence-proof-readiness-ready' : 'devview-equivalence-proof-readiness-blocked',
    readinessScope: 'equivalence-proof-readiness-preview-no-proof',
    sourcePolicyBoundary: relativePath(root, input.resolvedPolicyPath),
    sourceEvidenceAcceptanceReadiness: relativePath(root, input.resolvedEvidenceAcceptanceReadinessPath),
    sourceGraphSourceMutationReadiness:
      stringValue(input.evidenceAcceptanceReadiness.sourceGraphSourceMutationReadiness) || null,
    sourceApplyReadiness: stringValue(input.evidenceAcceptanceReadiness.sourceApplyReadiness) || null,
    sourceApprovedProposalState: stringValue(input.evidenceAcceptanceReadiness.sourceApprovedProposalState) || null,
    sourceGraphDeltaProposal: stringValue(input.evidenceAcceptanceReadiness.sourceGraphDeltaProposal) || null,
    proposalId: stringValue(input.evidenceAcceptanceReadiness.proposalId) || 'unknown-proposal',
    equivalenceProofReadinessStatus: ready
      ? 'dry-run-ready-evidence-acceptance-readiness-present'
      : 'blocked-evidence-acceptance-readiness-not-ready',
    evidenceAcceptanceReadinessStatus: stringValue(input.evidenceAcceptanceReadiness.evidenceAcceptanceReadinessStatus),
    mutationReadinessStatus: stringValue(input.evidenceAcceptanceReadiness.mutationReadinessStatus),
    applyReadinessStatus: stringValue(input.evidenceAcceptanceReadiness.applyReadinessStatus),
    equivalenceAllowed: false,
    equivalenceProofCommandImplemented: false,
    equivalenceProven: false,
    evidenceAccepted: false,
    runtimeEvidenceSatisfied: false,
    graphDeltaApplyEnabled: false,
    graphDeltaApplied: false,
    graphSourceMutationAllowed: false,
    graphSourceMutated: false,
    mutationAllowed: false,
    acceptanceAllowed: false,
    approvedProposalStateCreated: input.evidenceAcceptanceReadiness.approvedProposalStateCreated === true,
    humanDecisionRecorded: input.evidenceAcceptanceReadiness.humanDecisionRecorded === true,
    humanReviewRequired: true,
    scopeEnforced: false,
    ciEnforcementEnabled: false,
    strictModeEnabled: false,
    guidedEnforcementEnabled: false,
    validationFindings: ready
      ? []
      : [
          {
            code: 'EQUIVALENCE_PROOF_EVIDENCE_ACCEPTANCE_READINESS_NOT_READY',
            severity: 'warning',
            field: 'evidenceAcceptanceReadinessStatus',
            expected: 'dry-run-ready-mutation-readiness-present',
            actual: input.evidenceAcceptanceReadiness.evidenceAcceptanceReadinessStatus,
            message: 'Equivalence proof readiness is blocked because Evidence acceptance readiness is not ready.',
          },
        ],
    allowedUse: ready
      ? [
          'review future equivalence proof readiness before a separate proof command exists',
          'preserve Evidence acceptance readiness provenance without proving equivalence',
          'serve as equivalence proof dry-run readiness context only',
        ]
      : [
          'document why equivalence proof readiness is blocked',
          'preserve Evidence acceptance readiness provenance for human review',
          'keep blocked inputs out of equivalence-ready state',
        ],
    forbiddenUse: [
      'equivalence proof',
      'Evidence acceptance',
      'runtime Evidence satisfaction',
      'graph delta apply',
      'graph-source mutation',
      'scope enforcement',
      'CI required check',
      'branch protection mutation',
      'production source mutation',
      'Codex hook or config mutation',
      'user acceptance automation',
      'inference of equivalence from Codex, AI, validators, runtime smoke, CI, review packet, Evidence acceptance readiness, mutation readiness, or apply readiness',
    ],
    outputWritePolicy: 'explicit-output-only',
    writtenOutputPath: null,
    writtenOutputPathAuthorityStatus: 'not-written-stdout-only',
    markdownReportPath: null,
    nonExecutionBoundary:
      'This Equivalence Proof readiness command reports readiness only. It does not prove equivalence, accept Evidence, satisfy runtime Evidence, apply graph deltas, mutate graph-source, enforce scope, configure CI or required checks, change branch protection, mutate production source, mutate Codex hook/config files, or replace user acceptance.',
  }
}

export function renderEquivalenceProofReadinessMarkdown(readiness: EquivalenceProofReadinessPreview): string {
  return `# DevView Equivalence Proof Readiness

Status: \`${readiness.status}\`

| Field | Value |
| --- | --- |
| Equivalence proof readiness | \`${readiness.equivalenceProofReadinessStatus}\` |
| Evidence acceptance readiness | \`${readiness.evidenceAcceptanceReadinessStatus}\` |
| Mutation readiness | \`${readiness.mutationReadinessStatus}\` |
| Apply readiness | \`${readiness.applyReadinessStatus}\` |
| Equivalence allowed | \`${readiness.equivalenceAllowed}\` |
| Proposal | \`${readiness.sourceGraphDeltaProposal ?? 'none'}\` |
| Proposal ID | \`${readiness.proposalId}\` |
| Evidence acceptance readiness source | \`${readiness.sourceEvidenceAcceptanceReadiness}\` |

## Non-Execution Boundary

- Equivalence proven: \`${readiness.equivalenceProven}\`
- Evidence accepted: \`${readiness.evidenceAccepted}\`
- Runtime Evidence satisfied: \`${readiness.runtimeEvidenceSatisfied}\`
- Graph delta applied: \`${readiness.graphDeltaApplied}\`
- Graph-source mutated: \`${readiness.graphSourceMutated}\`
- Scope enforced: \`${readiness.scopeEnforced}\`
- CI enforcement enabled: \`${readiness.ciEnforcementEnabled}\`
`
}

function validateRequiredInputs(options: EquivalenceProofReadinessOptions): void {
  if (!options.policy) {
    throw new Error('report-equivalence-proof-readiness requires --policy <policyBoundaryPath>.')
  }
  if (!options.evidenceAcceptanceReadiness) {
    throw new Error('report-equivalence-proof-readiness requires --evidence-acceptance-readiness <readinessPath>.')
  }
}

function validatePolicy(policy: JsonRecord): void {
  if (policy.artifactRole !== POLICY_ROLE || policy.status !== POLICY_STATUS) {
    throw new Error(`Unsafe Equivalence Proof Policy boundary: expected ${POLICY_ROLE}/${POLICY_STATUS}.`)
  }
  for (const field of [
    'equivalenceProven',
    'evidenceAccepted',
    'runtimeEvidenceSatisfied',
    'graphDeltaApplied',
    'graphSourceMutated',
    'scopeEnforced',
    'ciEnforcementEnabled',
  ]) {
    if (policy[field] !== false) {
      throw new Error(`Unsafe Equivalence Proof Policy boundary: ${field} must be false.`)
    }
  }
}

function validateEvidenceAcceptanceReadiness(readiness: JsonRecord): void {
  if (readiness.artifactRole !== EVIDENCE_ACCEPTANCE_READINESS_ROLE) {
    throw new Error(
      `Unsafe Evidence Acceptance readiness input: artifactRole must be ${JSON.stringify(
        EVIDENCE_ACCEPTANCE_READINESS_ROLE,
      )}.`,
    )
  }
  if (
    readiness.status !== 'devview-evidence-acceptance-readiness-ready' &&
    readiness.status !== 'devview-evidence-acceptance-readiness-blocked'
  ) {
    throw new Error('Unsafe Evidence Acceptance readiness input: status must be ready or blocked preview.')
  }
  for (const field of [
    'acceptanceAllowed',
    'evidenceAccepted',
    'runtimeEvidenceSatisfied',
    'equivalenceProven',
    'graphDeltaApplyEnabled',
    'graphDeltaApplied',
    'graphSourceMutationAllowed',
    'graphSourceMutated',
    'mutationAllowed',
    'scopeEnforced',
    'ciEnforcementEnabled',
  ]) {
    if (readiness[field] !== false) {
      throw new Error(`Unsafe Evidence Acceptance readiness boundary: ${field} must be false.`)
    }
  }
}

async function assertOutputAuthority(
  root: string,
  input: {
    policy: JsonRecord
    resolvedPolicyPath: string
    evidenceAcceptanceReadiness: JsonRecord
    resolvedEvidenceAcceptanceReadinessPath: string
    output?: string
    markdown?: string
  },
): Promise<void> {
  if (!input.output && !input.markdown) {
    return
  }
  const resolvedOutputPath = input.output ? resolveRepoPath(root, input.output) : undefined
  const resolvedMarkdownPath = input.markdown ? resolveRepoPath(root, input.markdown) : undefined
  if (resolvedOutputPath && resolvedMarkdownPath && pathKey(resolvedOutputPath) === pathKey(resolvedMarkdownPath)) {
    throw new Error('Equivalence Proof readiness output is unsafe: --output and --markdown must be different paths.')
  }

  const protectedPaths = buildProtectedPathMap(root, input)
  for (const [label, requested, resolved] of [
    ['JSON output', input.output, resolvedOutputPath],
    ['Markdown output', input.markdown, resolvedMarkdownPath],
  ] as const) {
    if (!requested || !resolved) {
      continue
    }
    const protectedReason = protectedPaths.get(pathKey(resolved))
    if (protectedReason) {
      throw new Error(
        `Equivalence Proof readiness ${label} path is unsafe: ${requested} would overwrite ${protectedReason}.`,
      )
    }
    const existingAuthority = await classifyExistingSourceAuthority(resolved)
    if (existingAuthority) {
      throw new Error(
        `Equivalence Proof readiness ${label} path is unsafe: ${requested} already contains ${existingAuthority}. Choose a dedicated equivalence-proof-readiness output path.`,
      )
    }
  }
}

function buildProtectedPathMap(
  root: string,
  input: {
    policy: JsonRecord
    resolvedPolicyPath: string
    evidenceAcceptanceReadiness: JsonRecord
    resolvedEvidenceAcceptanceReadinessPath: string
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

  addResolved(input.resolvedPolicyPath, 'the source Equivalence Proof Policy boundary')
  addResolved(input.resolvedEvidenceAcceptanceReadinessPath, 'the source Evidence Acceptance readiness')
  addConcrete(
    input.evidenceAcceptanceReadiness.sourceGraphSourceMutationReadiness,
    'the source Graph-source Mutation readiness',
  )
  addConcrete(input.evidenceAcceptanceReadiness.sourceApplyReadiness, 'the source Graph Delta Apply readiness')
  addConcrete(input.evidenceAcceptanceReadiness.sourceApprovedProposalState, 'the source Approved Proposal State')
  addConcrete(input.evidenceAcceptanceReadiness.sourceGraphDeltaProposal, 'the source Graph Delta proposal')

  for (const source of [input.policy, input.evidenceAcceptanceReadiness]) {
    for (const candidatePath of collectConcretePathStrings(source, new Set(), new Set(OWN_OUTPUT_LINK_KEYS))) {
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
  if (!artifactRole || artifactRole === READINESS_ROLE) {
    return null
  }
  if (
    artifactRole === POLICY_ROLE ||
    artifactRole === EVIDENCE_ACCEPTANCE_READINESS_ROLE ||
    artifactRole.includes('graph-source') ||
    artifactRole.includes('evidence') ||
    artifactRole.includes('read-model') ||
    [
      'devview-graph-source-mutation-readiness-preview',
      'devview-graph-delta-apply-readiness-preview',
      'devview-approved-proposal-state-preview',
      'devview-human-decision-record',
      'graph-delta-human-review-packet',
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

const OWN_OUTPUT_LINK_KEYS = [
  'firstCalibrationEquivalenceProofReadinessArtifact',
  'firstCalibrationEquivalenceProofReadinessMarkdownArtifact',
]

function collectConcretePathStrings(
  value: unknown,
  seen = new Set<unknown>(),
  skippedKeys = new Set<string>(),
): string[] {
  if (typeof value === 'string') {
    return isConcreteOutputProtectedPath(value) ? [value] : []
  }
  if (typeof value !== 'object' || value === null || seen.has(value)) {
    return []
  }
  seen.add(value)
  if (Array.isArray(value)) {
    return value.flatMap((entry) => collectConcretePathStrings(entry, seen, skippedKeys))
  }
  return Object.entries(value as JsonRecord).flatMap(([key, entry]) =>
    skippedKeys.has(key) ? [] : collectConcretePathStrings(entry, seen, skippedKeys),
  )
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
