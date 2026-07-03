import path from 'node:path'
import { readJsonSafe, relativePath, writeJsonAtomic, writeTextAtomic } from './fs.js'

type JsonRecord = Record<string, unknown>

const POLICY_ROLE = 'devview-scope-ci-enforcement-policy-boundary-preview'
const POLICY_STATUS = 'devview-scope-ci-enforcement-policy-boundary-previewed'
const EQUIVALENCE_READINESS_ROLE = 'devview-equivalence-proof-readiness-preview'
const READINESS_ROLE = 'devview-scope-ci-enforcement-readiness-preview'

export interface ScopeCiEnforcementReadinessOptions {
  policy: string
  equivalenceProofReadiness: string
  output?: string
  markdown?: string
}

export interface ScopeCiEnforcementReadinessFileResult {
  readiness: ScopeCiEnforcementReadinessPreview
  outputPath?: string
  markdownReport?: string
}

export interface ScopeCiEnforcementReadinessPreview {
  schemaVersion: 1
  artifactRole: typeof READINESS_ROLE
  status: 'devview-scope-ci-enforcement-readiness-ready' | 'devview-scope-ci-enforcement-readiness-blocked'
  readinessScope: 'scope-ci-enforcement-readiness-preview-disabled-no-enforcement'
  sourcePolicyBoundary: string
  sourceEquivalenceProofReadiness: string
  sourceEvidenceAcceptanceReadiness: string | null
  sourceGraphSourceMutationReadiness: string | null
  sourceApplyReadiness: string | null
  sourceApprovedProposalState: string | null
  sourceGraphDeltaProposal: string | null
  proposalId: string
  scopeCiEnforcementReadinessStatus:
    | 'dry-run-ready-equivalence-proof-readiness-present'
    | 'blocked-equivalence-proof-readiness-not-ready'
  equivalenceProofReadinessStatus: string
  evidenceAcceptanceReadinessStatus: string
  mutationReadinessStatus: string
  applyReadinessStatus: string
  scopeEnforcementAllowed: false
  ciEnforcementAllowed: false
  scopeEnforcementCommandImplemented: false
  ciEnforcementCommandImplemented: false
  scopeEnforced: false
  ciEnforcementEnabled: false
  requiredChecksConfigured: false
  branchProtectionChanged: false
  diffRejectionEnabled: false
  strictModeEnabled: false
  guidedEnforcementEnabled: false
  equivalenceProven: false
  evidenceAccepted: false
  runtimeEvidenceSatisfied: false
  graphDeltaApplyEnabled: false
  graphDeltaApplied: false
  graphSourceMutationAllowed: false
  graphSourceMutated: false
  mutationAllowed: false
  acceptanceAllowed: false
  equivalenceAllowed: false
  approvedProposalStateCreated: boolean
  humanDecisionRecorded: boolean
  humanReviewRequired: true
  validationFindings: ScopeCiEnforcementReadinessFinding[]
  allowedUse: string[]
  forbiddenUse: string[]
  outputWritePolicy: 'explicit-output-only'
  writtenOutputPath: string | null
  writtenOutputPathAuthorityStatus:
    | 'not-written-stdout-only'
    | 'explicit-scope-ci-enforcement-readiness-output-not-source-authority'
  markdownReportPath: string | null
  nonExecutionBoundary: string
}

export interface ScopeCiEnforcementReadinessFinding {
  code: string
  severity: 'info' | 'warning' | 'error'
  message: string
  field?: string
  expected?: unknown
  actual?: unknown
}

export async function reportScopeCiEnforcementReadinessFile(
  root: string,
  options: ScopeCiEnforcementReadinessOptions,
): Promise<ScopeCiEnforcementReadinessFileResult> {
  validateRequiredInputs(options)

  const resolvedPolicyPath = resolveRepoPath(root, options.policy)
  const policy = await readRequiredJson(resolvedPolicyPath, 'Scope/CI Enforcement Policy boundary')
  validatePolicy(policy)

  const resolvedEquivalenceReadinessPath = resolveRepoPath(root, options.equivalenceProofReadiness)
  const equivalenceReadiness = await readRequiredJson(resolvedEquivalenceReadinessPath, 'Equivalence Proof readiness')
  validateEquivalenceReadiness(equivalenceReadiness)

  await assertOutputAuthority(root, {
    policy,
    resolvedPolicyPath,
    equivalenceReadiness,
    resolvedEquivalenceReadinessPath,
    output: options.output,
    markdown: options.markdown,
  })

  const readiness = buildScopeCiReadiness(root, {
    resolvedPolicyPath,
    equivalenceReadiness,
    resolvedEquivalenceReadinessPath,
  })

  let outputPath: string | undefined
  let markdownReport: string | undefined
  if (options.output) {
    const resolvedOutputPath = resolveRepoPath(root, options.output)
    outputPath = relativePath(root, resolvedOutputPath)
    readiness.writtenOutputPath = outputPath
    readiness.writtenOutputPathAuthorityStatus = 'explicit-scope-ci-enforcement-readiness-output-not-source-authority'
    await writeJsonAtomic(resolvedOutputPath, readiness)
  }
  if (options.markdown) {
    const resolvedMarkdownPath = resolveRepoPath(root, options.markdown)
    markdownReport = relativePath(root, resolvedMarkdownPath)
    readiness.markdownReportPath = markdownReport
    await writeTextAtomic(resolvedMarkdownPath, renderScopeCiEnforcementReadinessMarkdown(readiness))
  }

  return { readiness, ...(outputPath ? { outputPath } : {}), ...(markdownReport ? { markdownReport } : {}) }
}

function buildScopeCiReadiness(
  root: string,
  input: {
    resolvedPolicyPath: string
    equivalenceReadiness: JsonRecord
    resolvedEquivalenceReadinessPath: string
  },
): ScopeCiEnforcementReadinessPreview {
  const ready = input.equivalenceReadiness.status === 'devview-equivalence-proof-readiness-ready'
  return {
    schemaVersion: 1,
    artifactRole: READINESS_ROLE,
    status: ready ? 'devview-scope-ci-enforcement-readiness-ready' : 'devview-scope-ci-enforcement-readiness-blocked',
    readinessScope: 'scope-ci-enforcement-readiness-preview-disabled-no-enforcement',
    sourcePolicyBoundary: relativePath(root, input.resolvedPolicyPath),
    sourceEquivalenceProofReadiness: relativePath(root, input.resolvedEquivalenceReadinessPath),
    sourceEvidenceAcceptanceReadiness:
      stringValue(input.equivalenceReadiness.sourceEvidenceAcceptanceReadiness) || null,
    sourceGraphSourceMutationReadiness:
      stringValue(input.equivalenceReadiness.sourceGraphSourceMutationReadiness) || null,
    sourceApplyReadiness: stringValue(input.equivalenceReadiness.sourceApplyReadiness) || null,
    sourceApprovedProposalState: stringValue(input.equivalenceReadiness.sourceApprovedProposalState) || null,
    sourceGraphDeltaProposal: stringValue(input.equivalenceReadiness.sourceGraphDeltaProposal) || null,
    proposalId: stringValue(input.equivalenceReadiness.proposalId) || 'unknown-proposal',
    scopeCiEnforcementReadinessStatus: ready
      ? 'dry-run-ready-equivalence-proof-readiness-present'
      : 'blocked-equivalence-proof-readiness-not-ready',
    equivalenceProofReadinessStatus: stringValue(input.equivalenceReadiness.equivalenceProofReadinessStatus),
    evidenceAcceptanceReadinessStatus: stringValue(input.equivalenceReadiness.evidenceAcceptanceReadinessStatus),
    mutationReadinessStatus: stringValue(input.equivalenceReadiness.mutationReadinessStatus),
    applyReadinessStatus: stringValue(input.equivalenceReadiness.applyReadinessStatus),
    scopeEnforcementAllowed: false,
    ciEnforcementAllowed: false,
    scopeEnforcementCommandImplemented: false,
    ciEnforcementCommandImplemented: false,
    scopeEnforced: false,
    ciEnforcementEnabled: false,
    requiredChecksConfigured: false,
    branchProtectionChanged: false,
    diffRejectionEnabled: false,
    strictModeEnabled: false,
    guidedEnforcementEnabled: false,
    equivalenceProven: false,
    evidenceAccepted: false,
    runtimeEvidenceSatisfied: false,
    graphDeltaApplyEnabled: false,
    graphDeltaApplied: false,
    graphSourceMutationAllowed: false,
    graphSourceMutated: false,
    mutationAllowed: false,
    acceptanceAllowed: false,
    equivalenceAllowed: false,
    approvedProposalStateCreated: input.equivalenceReadiness.approvedProposalStateCreated === true,
    humanDecisionRecorded: input.equivalenceReadiness.humanDecisionRecorded === true,
    humanReviewRequired: true,
    validationFindings: ready
      ? []
      : [
          {
            code: 'SCOPE_CI_ENFORCEMENT_EQUIVALENCE_PROOF_READINESS_NOT_READY',
            severity: 'warning',
            field: 'equivalenceProofReadinessStatus',
            expected: 'dry-run-ready-evidence-acceptance-readiness-present',
            actual: input.equivalenceReadiness.equivalenceProofReadinessStatus,
            message: 'Scope/CI enforcement readiness is blocked because Equivalence Proof readiness is not ready.',
          },
        ],
    allowedUse: ready
      ? [
          'review future scope/CI enforcement readiness before separate enforcement commands exist',
          'preserve equivalence proof readiness provenance without enabling enforcement',
          'serve as disabled enforcement readiness context only',
        ]
      : [
          'document why scope/CI enforcement readiness is blocked',
          'preserve equivalence proof readiness provenance for human review',
          'keep blocked inputs out of enforcement-ready state',
        ],
    forbiddenUse: [
      'scope enforcement',
      'CI required check',
      'branch protection mutation',
      'diff rejection',
      'strict or guided blocking activation',
      'equivalence proof',
      'Evidence acceptance',
      'runtime Evidence satisfaction',
      'graph delta apply',
      'graph-source mutation',
      'production source mutation',
      'Codex hook or config mutation',
      'approval automation',
      'user acceptance automation',
      'inference of enforcement from Codex, AI, validators, runtime smoke, CI, review packet, equivalence readiness, Evidence readiness, mutation readiness, or apply readiness',
    ],
    outputWritePolicy: 'explicit-output-only',
    writtenOutputPath: null,
    writtenOutputPathAuthorityStatus: 'not-written-stdout-only',
    markdownReportPath: null,
    nonExecutionBoundary:
      'This Scope/CI Enforcement readiness command reports disabled readiness only. It does not enforce scope, enable CI enforcement, configure required checks, change branch protection, reject diffs, activate strict or guided blocking, prove equivalence, accept Evidence, satisfy runtime Evidence, apply graph deltas, mutate graph-source, mutate production source, mutate Codex hook/config files, automate approval, or replace user acceptance.',
  }
}

export function renderScopeCiEnforcementReadinessMarkdown(readiness: ScopeCiEnforcementReadinessPreview): string {
  return `# DevView Scope/CI Enforcement Readiness

Status: \`${readiness.status}\`

| Field | Value |
| --- | --- |
| Scope/CI enforcement readiness | \`${readiness.scopeCiEnforcementReadinessStatus}\` |
| Equivalence proof readiness | \`${readiness.equivalenceProofReadinessStatus}\` |
| Evidence acceptance readiness | \`${readiness.evidenceAcceptanceReadinessStatus}\` |
| Scope enforcement allowed | \`${readiness.scopeEnforcementAllowed}\` |
| CI enforcement allowed | \`${readiness.ciEnforcementAllowed}\` |
| Proposal | \`${readiness.sourceGraphDeltaProposal ?? 'none'}\` |
| Proposal ID | \`${readiness.proposalId}\` |
| Equivalence readiness source | \`${readiness.sourceEquivalenceProofReadiness}\` |

## Non-Execution Boundary

- Scope enforced: \`${readiness.scopeEnforced}\`
- CI enforcement enabled: \`${readiness.ciEnforcementEnabled}\`
- Required checks configured: \`${readiness.requiredChecksConfigured}\`
- Branch protection changed: \`${readiness.branchProtectionChanged}\`
- Diff rejection enabled: \`${readiness.diffRejectionEnabled}\`
- Strict mode enabled: \`${readiness.strictModeEnabled}\`
- Guided enforcement enabled: \`${readiness.guidedEnforcementEnabled}\`
- Equivalence proven: \`${readiness.equivalenceProven}\`
- Evidence accepted: \`${readiness.evidenceAccepted}\`
- Runtime Evidence satisfied: \`${readiness.runtimeEvidenceSatisfied}\`
- Graph delta applied: \`${readiness.graphDeltaApplied}\`
- Graph-source mutated: \`${readiness.graphSourceMutated}\`
`
}

function validateRequiredInputs(options: ScopeCiEnforcementReadinessOptions): void {
  if (!options.policy) {
    throw new Error('report-scope-ci-enforcement-readiness requires --policy <policyBoundaryPath>.')
  }
  if (!options.equivalenceProofReadiness) {
    throw new Error('report-scope-ci-enforcement-readiness requires --equivalence-proof-readiness <readinessPath>.')
  }
}

function validatePolicy(policy: JsonRecord): void {
  if (policy.artifactRole !== POLICY_ROLE || policy.status !== POLICY_STATUS) {
    throw new Error(`Unsafe Scope/CI Enforcement Policy boundary: expected ${POLICY_ROLE}/${POLICY_STATUS}.`)
  }
  for (const field of DISABLED_ENFORCEMENT_FIELDS) {
    if (policy[field] !== false) {
      throw new Error(`Unsafe Scope/CI Enforcement Policy boundary: ${field} must be false.`)
    }
  }
}

function validateEquivalenceReadiness(readiness: JsonRecord): void {
  if (readiness.artifactRole !== EQUIVALENCE_READINESS_ROLE) {
    throw new Error(
      `Unsafe Equivalence Proof readiness input: artifactRole must be ${JSON.stringify(EQUIVALENCE_READINESS_ROLE)}.`,
    )
  }
  if (
    readiness.status !== 'devview-equivalence-proof-readiness-ready' &&
    readiness.status !== 'devview-equivalence-proof-readiness-blocked'
  ) {
    throw new Error('Unsafe Equivalence Proof readiness input: status must be ready or blocked preview.')
  }
  for (const field of [
    'equivalenceAllowed',
    'equivalenceProven',
    'evidenceAccepted',
    'runtimeEvidenceSatisfied',
    'graphDeltaApplyEnabled',
    'graphDeltaApplied',
    'graphSourceMutationAllowed',
    'graphSourceMutated',
    'mutationAllowed',
    'acceptanceAllowed',
    'scopeEnforced',
    'ciEnforcementEnabled',
  ]) {
    if (readiness[field] !== false) {
      throw new Error(`Unsafe Equivalence Proof readiness boundary: ${field} must be false.`)
    }
  }
}

async function assertOutputAuthority(
  root: string,
  input: {
    policy: JsonRecord
    resolvedPolicyPath: string
    equivalenceReadiness: JsonRecord
    resolvedEquivalenceReadinessPath: string
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
    throw new Error('Scope/CI Enforcement readiness output is unsafe: --output and --markdown must be different paths.')
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
        `Scope/CI Enforcement readiness ${label} path is unsafe: ${requested} would overwrite ${protectedReason}.`,
      )
    }
    const existingAuthority = await classifyExistingSourceAuthority(resolved)
    if (existingAuthority) {
      throw new Error(
        `Scope/CI Enforcement readiness ${label} path is unsafe: ${requested} already contains ${existingAuthority}. Choose a dedicated scope-ci-enforcement-readiness output path.`,
      )
    }
  }
}

function buildProtectedPathMap(
  root: string,
  input: {
    policy: JsonRecord
    resolvedPolicyPath: string
    equivalenceReadiness: JsonRecord
    resolvedEquivalenceReadinessPath: string
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

  addResolved(input.resolvedPolicyPath, 'the source Scope/CI Enforcement Policy boundary')
  addResolved(input.resolvedEquivalenceReadinessPath, 'the source Equivalence Proof readiness')
  addConcrete(input.equivalenceReadiness.sourceEvidenceAcceptanceReadiness, 'the source Evidence Acceptance readiness')
  addConcrete(
    input.equivalenceReadiness.sourceGraphSourceMutationReadiness,
    'the source Graph-source Mutation readiness',
  )
  addConcrete(input.equivalenceReadiness.sourceApplyReadiness, 'the source Graph Delta Apply readiness')
  addConcrete(input.equivalenceReadiness.sourceApprovedProposalState, 'the source Approved Proposal State')
  addConcrete(input.equivalenceReadiness.sourceGraphDeltaProposal, 'the source Graph Delta proposal')

  for (const source of [input.policy, input.equivalenceReadiness]) {
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
    artifactRole === EQUIVALENCE_READINESS_ROLE ||
    artifactRole.includes('graph-source') ||
    artifactRole.includes('evidence') ||
    artifactRole.includes('read-model') ||
    artifactRole.includes('scope') ||
    [
      'devview-equivalence-proof-readiness-preview',
      'devview-evidence-acceptance-readiness-preview',
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

const DISABLED_ENFORCEMENT_FIELDS = [
  'scopeEnforced',
  'ciEnforcementEnabled',
  'requiredChecksConfigured',
  'branchProtectionChanged',
  'diffRejectionEnabled',
  'strictModeEnabled',
  'guidedEnforcementEnabled',
  'equivalenceProven',
  'runtimeEvidenceSatisfied',
  'evidenceAccepted',
  'graphDeltaApplied',
  'graphSourceMutated',
]

const OWN_OUTPUT_LINK_KEYS = [
  'firstCalibrationScopeCiEnforcementReadinessArtifact',
  'firstCalibrationScopeCiEnforcementReadinessMarkdownArtifact',
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
