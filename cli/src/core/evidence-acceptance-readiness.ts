import path from 'node:path'
import { readJsonSafe, relativePath, writeJsonAtomic, writeTextAtomic } from './fs.js'

type JsonRecord = Record<string, unknown>

const POLICY_ROLE = 'devview-evidence-acceptance-policy-boundary-preview'
const POLICY_STATUS = 'devview-evidence-acceptance-policy-boundary-previewed'
const MUTATION_READINESS_ROLE = 'devview-graph-source-mutation-readiness-preview'
const READINESS_ROLE = 'devview-evidence-acceptance-readiness-preview'

export interface EvidenceAcceptanceReadinessOptions {
  policy: string
  mutationReadiness: string
  output?: string
  markdown?: string
}

export interface EvidenceAcceptanceReadinessFileResult {
  readiness: EvidenceAcceptanceReadinessPreview
  outputPath?: string
  markdownReport?: string
}

export interface EvidenceAcceptanceReadinessPreview {
  schemaVersion: 1
  artifactRole: typeof READINESS_ROLE
  status: 'devview-evidence-acceptance-readiness-ready' | 'devview-evidence-acceptance-readiness-blocked'
  readinessScope: 'evidence-acceptance-readiness-preview-no-acceptance'
  sourcePolicyBoundary: string
  sourceGraphSourceMutationReadiness: string
  sourceApplyReadiness: string | null
  sourceApprovedProposalState: string | null
  sourceGraphDeltaProposal: string | null
  proposalId: string
  evidenceAcceptanceReadinessStatus: 'dry-run-ready-mutation-readiness-present' | 'blocked-mutation-readiness-not-ready'
  mutationReadinessStatus: string
  applyReadinessStatus: string
  acceptanceAllowed: false
  evidenceAcceptanceCommandImplemented: false
  evidenceAccepted: false
  runtimeEvidenceSatisfied: false
  equivalenceProven: false
  graphDeltaApplyEnabled: false
  graphDeltaApplied: false
  graphSourceMutationAllowed: false
  graphSourceMutated: false
  mutationAllowed: false
  approvedProposalStateCreated: boolean
  humanDecisionRecorded: boolean
  humanReviewRequired: true
  scopeEnforced: false
  ciEnforcementEnabled: false
  strictModeEnabled: false
  guidedEnforcementEnabled: false
  validationFindings: EvidenceAcceptanceReadinessFinding[]
  allowedUse: string[]
  forbiddenUse: string[]
  outputWritePolicy: 'explicit-output-only'
  writtenOutputPath: string | null
  writtenOutputPathAuthorityStatus:
    | 'not-written-stdout-only'
    | 'explicit-evidence-acceptance-readiness-output-not-source-authority'
  markdownReportPath: string | null
  nonExecutionBoundary: string
}

export interface EvidenceAcceptanceReadinessFinding {
  code: string
  severity: 'info' | 'warning' | 'error'
  message: string
  field?: string
  expected?: unknown
  actual?: unknown
}

export async function reportEvidenceAcceptanceReadinessFile(
  root: string,
  options: EvidenceAcceptanceReadinessOptions,
): Promise<EvidenceAcceptanceReadinessFileResult> {
  validateRequiredInputs(options)

  const resolvedPolicyPath = resolveRepoPath(root, options.policy)
  const policy = await readRequiredJson(resolvedPolicyPath, 'Evidence Acceptance Policy boundary')
  validatePolicy(policy)

  const resolvedMutationReadinessPath = resolveRepoPath(root, options.mutationReadiness)
  const mutationReadiness = await readRequiredJson(resolvedMutationReadinessPath, 'Graph-source Mutation readiness')
  validateMutationReadiness(mutationReadiness)

  await assertOutputAuthority(root, {
    policy,
    resolvedPolicyPath,
    mutationReadiness,
    resolvedMutationReadinessPath,
    output: options.output,
    markdown: options.markdown,
  })

  const readiness = buildEvidenceAcceptanceReadiness(root, {
    resolvedPolicyPath,
    mutationReadiness,
    resolvedMutationReadinessPath,
  })

  let outputPath: string | undefined
  let markdownReport: string | undefined
  if (options.output) {
    const resolvedOutputPath = resolveRepoPath(root, options.output)
    outputPath = relativePath(root, resolvedOutputPath)
    readiness.writtenOutputPath = outputPath
    readiness.writtenOutputPathAuthorityStatus = 'explicit-evidence-acceptance-readiness-output-not-source-authority'
    await writeJsonAtomic(resolvedOutputPath, readiness)
  }
  if (options.markdown) {
    const resolvedMarkdownPath = resolveRepoPath(root, options.markdown)
    markdownReport = relativePath(root, resolvedMarkdownPath)
    readiness.markdownReportPath = markdownReport
    await writeTextAtomic(resolvedMarkdownPath, renderEvidenceAcceptanceReadinessMarkdown(readiness))
  }

  return { readiness, ...(outputPath ? { outputPath } : {}), ...(markdownReport ? { markdownReport } : {}) }
}

function buildEvidenceAcceptanceReadiness(
  root: string,
  input: {
    resolvedPolicyPath: string
    mutationReadiness: JsonRecord
    resolvedMutationReadinessPath: string
  },
): EvidenceAcceptanceReadinessPreview {
  const ready = input.mutationReadiness.status === 'devview-graph-source-mutation-readiness-ready'
  return {
    schemaVersion: 1,
    artifactRole: READINESS_ROLE,
    status: ready ? 'devview-evidence-acceptance-readiness-ready' : 'devview-evidence-acceptance-readiness-blocked',
    readinessScope: 'evidence-acceptance-readiness-preview-no-acceptance',
    sourcePolicyBoundary: relativePath(root, input.resolvedPolicyPath),
    sourceGraphSourceMutationReadiness: relativePath(root, input.resolvedMutationReadinessPath),
    sourceApplyReadiness: stringValue(input.mutationReadiness.sourceApplyReadiness) || null,
    sourceApprovedProposalState: stringValue(input.mutationReadiness.sourceApprovedProposalState) || null,
    sourceGraphDeltaProposal: stringValue(input.mutationReadiness.sourceGraphDeltaProposal) || null,
    proposalId: stringValue(input.mutationReadiness.proposalId) || 'unknown-proposal',
    evidenceAcceptanceReadinessStatus: ready
      ? 'dry-run-ready-mutation-readiness-present'
      : 'blocked-mutation-readiness-not-ready',
    mutationReadinessStatus: stringValue(input.mutationReadiness.mutationReadinessStatus),
    applyReadinessStatus: stringValue(input.mutationReadiness.applyReadinessStatus),
    acceptanceAllowed: false,
    evidenceAcceptanceCommandImplemented: false,
    evidenceAccepted: false,
    runtimeEvidenceSatisfied: false,
    equivalenceProven: false,
    graphDeltaApplyEnabled: false,
    graphDeltaApplied: false,
    graphSourceMutationAllowed: false,
    graphSourceMutated: false,
    mutationAllowed: false,
    approvedProposalStateCreated: input.mutationReadiness.approvedProposalStateCreated === true,
    humanDecisionRecorded: input.mutationReadiness.humanDecisionRecorded === true,
    humanReviewRequired: true,
    scopeEnforced: false,
    ciEnforcementEnabled: false,
    strictModeEnabled: false,
    guidedEnforcementEnabled: false,
    validationFindings: ready
      ? []
      : [
          {
            code: 'EVIDENCE_ACCEPTANCE_MUTATION_READINESS_NOT_READY',
            severity: 'warning',
            field: 'mutationReadinessStatus',
            expected: 'dry-run-ready-apply-readiness-present',
            actual: input.mutationReadiness.mutationReadinessStatus,
            message: 'Evidence acceptance readiness is blocked because Graph-source Mutation readiness is not ready.',
          },
        ],
    allowedUse: ready
      ? [
          'review future Evidence acceptance readiness before a separate acceptance command exists',
          'preserve mutation-readiness provenance without accepting Evidence',
          'serve as evidence-acceptance dry-run readiness context only',
        ]
      : [
          'document why Evidence acceptance readiness is blocked',
          'preserve mutation-readiness provenance for human review',
          'keep blocked inputs out of evidence-acceptance-ready state',
        ],
    forbiddenUse: [
      'Evidence acceptance',
      'runtime Evidence satisfaction',
      'equivalence proof',
      'graph delta apply',
      'graph-source mutation',
      'scope enforcement',
      'CI required check',
      'branch protection mutation',
      'production source mutation',
      'Codex hook or config mutation',
      'user acceptance automation',
      'inference of acceptance from Codex, AI, validators, runtime smoke, CI, review packet, apply readiness, or mutation readiness',
    ],
    outputWritePolicy: 'explicit-output-only',
    writtenOutputPath: null,
    writtenOutputPathAuthorityStatus: 'not-written-stdout-only',
    markdownReportPath: null,
    nonExecutionBoundary:
      'This Evidence Acceptance readiness command reports readiness only. It does not accept Evidence, satisfy runtime Evidence, prove equivalence, apply graph deltas, mutate graph-source, enforce scope, configure CI or required checks, change branch protection, mutate production source, mutate Codex hook/config files, or replace user acceptance.',
  }
}

export function renderEvidenceAcceptanceReadinessMarkdown(readiness: EvidenceAcceptanceReadinessPreview): string {
  return `# DevView Evidence Acceptance Readiness

Status: \`${readiness.status}\`

| Field | Value |
| --- | --- |
| Evidence acceptance readiness | \`${readiness.evidenceAcceptanceReadinessStatus}\` |
| Mutation readiness | \`${readiness.mutationReadinessStatus}\` |
| Apply readiness | \`${readiness.applyReadinessStatus}\` |
| Acceptance allowed | \`${readiness.acceptanceAllowed}\` |
| Proposal | \`${readiness.sourceGraphDeltaProposal ?? 'none'}\` |
| Proposal ID | \`${readiness.proposalId}\` |
| Mutation readiness source | \`${readiness.sourceGraphSourceMutationReadiness}\` |

## Non-Execution Boundary

- Evidence accepted: \`${readiness.evidenceAccepted}\`
- Runtime Evidence satisfied: \`${readiness.runtimeEvidenceSatisfied}\`
- Equivalence proven: \`${readiness.equivalenceProven}\`
- Graph delta applied: \`${readiness.graphDeltaApplied}\`
- Graph-source mutated: \`${readiness.graphSourceMutated}\`
- Scope enforced: \`${readiness.scopeEnforced}\`
- CI enforcement enabled: \`${readiness.ciEnforcementEnabled}\`
`
}

function validateRequiredInputs(options: EvidenceAcceptanceReadinessOptions): void {
  if (!options.policy) {
    throw new Error('report-evidence-acceptance-readiness requires --policy <policyBoundaryPath>.')
  }
  if (!options.mutationReadiness) {
    throw new Error('report-evidence-acceptance-readiness requires --mutation-readiness <mutationReadinessPath>.')
  }
}

function validatePolicy(policy: JsonRecord): void {
  if (policy.artifactRole !== POLICY_ROLE || policy.status !== POLICY_STATUS) {
    throw new Error(`Unsafe Evidence Acceptance Policy boundary: expected ${POLICY_ROLE}/${POLICY_STATUS}.`)
  }
  for (const field of [
    'evidenceAccepted',
    'runtimeEvidenceSatisfied',
    'equivalenceProven',
    'graphDeltaApplied',
    'graphSourceMutated',
    'scopeEnforced',
    'ciEnforcementEnabled',
  ]) {
    if (policy[field] !== false) {
      throw new Error(`Unsafe Evidence Acceptance Policy boundary: ${field} must be false.`)
    }
  }
}

function validateMutationReadiness(mutationReadiness: JsonRecord): void {
  if (mutationReadiness.artifactRole !== MUTATION_READINESS_ROLE) {
    throw new Error(
      `Unsafe Graph-source Mutation readiness input: artifactRole must be ${JSON.stringify(MUTATION_READINESS_ROLE)}.`,
    )
  }
  if (
    mutationReadiness.status !== 'devview-graph-source-mutation-readiness-ready' &&
    mutationReadiness.status !== 'devview-graph-source-mutation-readiness-blocked'
  ) {
    throw new Error('Unsafe Graph-source Mutation readiness input: status must be ready or blocked preview.')
  }
  for (const field of [
    'mutationAllowed',
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
    if (mutationReadiness[field] !== false) {
      throw new Error(`Unsafe Graph-source Mutation readiness boundary: ${field} must be false.`)
    }
  }
}

async function assertOutputAuthority(
  root: string,
  input: {
    policy: JsonRecord
    resolvedPolicyPath: string
    mutationReadiness: JsonRecord
    resolvedMutationReadinessPath: string
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
    throw new Error('Evidence Acceptance readiness output is unsafe: --output and --markdown must be different paths.')
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
        `Evidence Acceptance readiness ${label} path is unsafe: ${requested} would overwrite ${protectedReason}.`,
      )
    }
    const existingAuthority = await classifyExistingSourceAuthority(resolved)
    if (existingAuthority) {
      throw new Error(
        `Evidence Acceptance readiness ${label} path is unsafe: ${requested} already contains ${existingAuthority}. Choose a dedicated evidence-acceptance-readiness output path.`,
      )
    }
  }
}

function buildProtectedPathMap(
  root: string,
  input: {
    policy: JsonRecord
    resolvedPolicyPath: string
    mutationReadiness: JsonRecord
    resolvedMutationReadinessPath: string
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

  addResolved(input.resolvedPolicyPath, 'the source Evidence Acceptance Policy boundary')
  addResolved(input.resolvedMutationReadinessPath, 'the source Graph-source Mutation readiness')
  addConcrete(input.mutationReadiness.sourceApplyReadiness, 'the source Graph Delta Apply readiness')
  addConcrete(input.mutationReadiness.sourceApprovedProposalState, 'the source Approved Proposal State')
  addConcrete(input.mutationReadiness.sourceGraphDeltaProposal, 'the source Graph Delta proposal')

  for (const source of [input.policy, input.mutationReadiness]) {
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
  if (!artifactRole || artifactRole === READINESS_ROLE) {
    return null
  }
  if (
    artifactRole === POLICY_ROLE ||
    artifactRole === MUTATION_READINESS_ROLE ||
    artifactRole.includes('graph-source') ||
    artifactRole.includes('evidence') ||
    artifactRole.includes('read-model') ||
    [
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
