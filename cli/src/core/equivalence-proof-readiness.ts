import path from 'node:path'
import { readJsonSafe, relativePath, writeJsonAtomic, writeTextAtomic } from './fs.js'

type JsonRecord = Record<string, unknown>

const POLICY_ROLE = 'devview-equivalence-proof-policy-boundary-preview'
const POLICY_STATUS = 'devview-equivalence-proof-policy-boundary-previewed'
const EVIDENCE_ACCEPTANCE_READINESS_ROLE = 'devview-evidence-acceptance-readiness-preview'
const RUNTIME_EVIDENCE_SATISFACTION_READINESS_ROLE = 'devview-runtime-evidence-satisfaction-readiness-preview'
const READINESS_ROLE = 'devview-equivalence-proof-readiness-preview'

const unsafeAuthorityFields = [
  'equivalenceProven',
  'runtimeEvidenceSatisfied',
  'evidenceAccepted',
  'scopeEnforced',
  'ciEnforcementEnabled',
  'graphSourceMutated',
  'graphDeltaApplied',
  'approvalAutomationEnabled',
  'userAcceptanceAutomated',
  'mutationAllowed',
  'graphSourceMutationAllowed',
  'graphDeltaApplyEnabled',
  'scopeEnforcementEnabled',
  'ciEnforcementAllowed',
  'requiredChecksConfigured',
  'branchProtectionChanged',
  'diffRejectionEnabled',
]

export interface EquivalenceProofReadinessOptions {
  policy: string
  runtimeEvidenceSatisfactionReadiness: string
  evidenceAcceptanceReadiness?: string
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
  sourceRuntimeEvidenceSatisfactionReadiness: string
  sourceEvidenceAcceptanceReadiness: string | null
  sourceAcceptedEvidenceRecord: string | null
  sourceEvidenceArtifact: string | null
  sourceInstructionPack: string | null
  sourceContractInput: string | null
  sourceRuntimeEvidenceAuthority: string | null
  sourceEvidenceCheckBinding: string | null
  sourceOutputRequirement: string | null
  sourceRuntimeReport: string | null
  sourceScopeReport: string | null
  sourceGraphDeltaApplyReport: string | null
  sourceCheckReport: string | null
  sourceGraphSourceMutationReadiness: string | null
  sourceApplyReadiness: string | null
  sourceApprovedProposalState: string | null
  sourceGraphDeltaProposal: string | null
  proposalId: string
  requiredEvidenceId: string | null
  matchedRequiredEvidence: JsonRecord | null
  sourceAcceptedEvidenceAccepted: boolean
  equivalenceProofReadinessStatus:
    | 'ready-for-future-equivalence-proof-command'
    | 'blocked-runtime-evidence-satisfaction-readiness-not-ready'
    | 'blocked-runtime-evidence-satisfaction-record-missing'
    | 'blocked-runtime-evidence-satisfaction-readiness-invalid'
    | 'blocked-unsafe-authority-flag'
  runtimeEvidenceSatisfactionReadinessStatus: string
  evidenceAcceptanceReadinessStatus: string | null
  mutationReadinessStatus: string | null
  applyReadinessStatus: string | null
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
  approvalAutomationEnabled: false
  userAcceptanceAutomated: false
  nonEnforcing: true
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

  const resolvedRuntimeReadinessPath = resolveRepoPath(root, options.runtimeEvidenceSatisfactionReadiness)
  const runtimeReadiness = await readRequiredJson(
    resolvedRuntimeReadinessPath,
    'Runtime Evidence Satisfaction readiness',
  )
  validateRuntimeEvidenceSatisfactionReadiness(runtimeReadiness)

  const evidenceAcceptanceReadiness = options.evidenceAcceptanceReadiness
    ? await readRequiredJson(
        resolveRepoPath(root, options.evidenceAcceptanceReadiness),
        'Evidence Acceptance readiness',
      )
    : null
  if (evidenceAcceptanceReadiness) {
    validateEvidenceAcceptanceReadiness(evidenceAcceptanceReadiness)
  }
  const resolvedEvidenceAcceptanceReadinessPath = options.evidenceAcceptanceReadiness
    ? resolveRepoPath(root, options.evidenceAcceptanceReadiness)
    : null

  await assertOutputAuthority(root, {
    policy,
    resolvedPolicyPath,
    runtimeReadiness,
    resolvedRuntimeReadinessPath,
    evidenceAcceptanceReadiness,
    resolvedEvidenceAcceptanceReadinessPath,
    output: options.output,
    markdown: options.markdown,
  })

  const readiness = buildEquivalenceProofReadiness(root, {
    resolvedPolicyPath,
    runtimeReadiness,
    resolvedRuntimeReadinessPath,
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
    if (options.output) {
      await writeJsonAtomic(resolveRepoPath(root, options.output), readiness)
    }
  }

  return { readiness, ...(outputPath ? { outputPath } : {}), ...(markdownReport ? { markdownReport } : {}) }
}

function buildEquivalenceProofReadiness(
  root: string,
  input: {
    resolvedPolicyPath: string
    runtimeReadiness: JsonRecord
    resolvedRuntimeReadinessPath: string
    evidenceAcceptanceReadiness: JsonRecord | null
    resolvedEvidenceAcceptanceReadinessPath: string | null
  },
): EquivalenceProofReadinessPreview {
  const runtimeReady =
    input.runtimeReadiness.status === 'devview-runtime-evidence-satisfaction-readiness-ready' &&
    input.runtimeReadiness.runtimeEvidenceSatisfactionReadinessStatus ===
      'ready-accepted-evidence-linked-to-runtime-obligation'
  const readinessStatus = runtimeReady
    ? 'blocked-runtime-evidence-satisfaction-record-missing'
    : 'blocked-runtime-evidence-satisfaction-readiness-not-ready'

  return {
    schemaVersion: 1,
    artifactRole: READINESS_ROLE,
    status: 'devview-equivalence-proof-readiness-blocked',
    readinessScope: 'equivalence-proof-readiness-preview-no-proof',
    sourcePolicyBoundary: relativePath(root, input.resolvedPolicyPath),
    sourceRuntimeEvidenceSatisfactionReadiness: relativePath(root, input.resolvedRuntimeReadinessPath),
    sourceEvidenceAcceptanceReadiness: input.resolvedEvidenceAcceptanceReadinessPath
      ? relativePath(root, input.resolvedEvidenceAcceptanceReadinessPath)
      : stringValue(input.runtimeReadiness.sourceEvidenceAcceptanceReadiness) || null,
    sourceAcceptedEvidenceRecord: stringValue(input.runtimeReadiness.sourceAcceptedEvidenceRecord) || null,
    sourceEvidenceArtifact: stringValue(input.runtimeReadiness.sourceEvidenceArtifact) || null,
    sourceInstructionPack: stringValue(input.runtimeReadiness.sourceInstructionPack) || null,
    sourceContractInput: stringValue(input.runtimeReadiness.sourceContractInput) || null,
    sourceRuntimeEvidenceAuthority: stringValue(input.runtimeReadiness.sourceRuntimeEvidenceAuthority) || null,
    sourceEvidenceCheckBinding: stringValue(input.runtimeReadiness.sourceEvidenceCheckBinding) || null,
    sourceOutputRequirement: stringValue(input.runtimeReadiness.sourceOutputRequirement) || null,
    sourceRuntimeReport: stringValue(input.runtimeReadiness.sourceRuntimeReport) || null,
    sourceScopeReport: stringValue(input.runtimeReadiness.sourceScopeReport) || null,
    sourceGraphDeltaApplyReport: stringValue(input.runtimeReadiness.sourceGraphDeltaApplyReport) || null,
    sourceCheckReport: stringValue(input.runtimeReadiness.sourceCheckReport) || null,
    sourceGraphSourceMutationReadiness:
      stringValue(input.evidenceAcceptanceReadiness?.sourceGraphSourceMutationReadiness) || null,
    sourceApplyReadiness: stringValue(input.evidenceAcceptanceReadiness?.sourceApplyReadiness) || null,
    sourceApprovedProposalState: stringValue(input.evidenceAcceptanceReadiness?.sourceApprovedProposalState) || null,
    sourceGraphDeltaProposal:
      stringValue(input.evidenceAcceptanceReadiness?.sourceGraphDeltaProposal) ||
      stringValue(input.runtimeReadiness.sourceGraphDeltaProposal) ||
      null,
    proposalId:
      stringValue(input.evidenceAcceptanceReadiness?.proposalId) ||
      stringValue(input.runtimeReadiness.proposalId) ||
      'unknown-proposal',
    requiredEvidenceId: stringValue(input.runtimeReadiness.requiredEvidenceId) || null,
    matchedRequiredEvidence: asRecord(input.runtimeReadiness.matchedRequiredEvidence),
    sourceAcceptedEvidenceAccepted: input.runtimeReadiness.sourceAcceptedEvidenceAccepted === true,
    equivalenceProofReadinessStatus: readinessStatus,
    runtimeEvidenceSatisfactionReadinessStatus: stringValue(
      input.runtimeReadiness.runtimeEvidenceSatisfactionReadinessStatus,
    ),
    evidenceAcceptanceReadinessStatus: input.evidenceAcceptanceReadiness
      ? stringValue(input.evidenceAcceptanceReadiness.evidenceAcceptanceReadinessStatus)
      : null,
    mutationReadinessStatus: input.evidenceAcceptanceReadiness
      ? stringValue(input.evidenceAcceptanceReadiness.mutationReadinessStatus)
      : null,
    applyReadinessStatus: input.evidenceAcceptanceReadiness
      ? stringValue(input.evidenceAcceptanceReadiness.applyReadinessStatus)
      : null,
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
    approvedProposalStateCreated: input.evidenceAcceptanceReadiness?.approvedProposalStateCreated === true,
    humanDecisionRecorded: input.evidenceAcceptanceReadiness?.humanDecisionRecorded === true,
    humanReviewRequired: true,
    scopeEnforced: false,
    ciEnforcementEnabled: false,
    strictModeEnabled: false,
    guidedEnforcementEnabled: false,
    approvalAutomationEnabled: false,
    userAcceptanceAutomated: false,
    nonEnforcing: true,
    validationFindings: [
      runtimeReady
        ? {
            code: 'EQUIVALENCE_PROOF_RUNTIME_SATISFACTION_RECORD_MISSING',
            severity: 'warning',
            field: 'runtimeEvidenceSatisfied',
            expected: 'future-explicit-runtime-evidence-satisfaction-record',
            actual: input.runtimeReadiness.runtimeEvidenceSatisfactionReadinessStatus,
            message:
              'Equivalence proof readiness is blocked because runtime Evidence satisfaction binding readiness is not an actual satisfaction record.',
          }
        : {
            code: 'EQUIVALENCE_PROOF_RUNTIME_SATISFACTION_READINESS_NOT_READY',
            severity: 'warning',
            field: 'runtimeEvidenceSatisfactionReadinessStatus',
            expected: 'ready-accepted-evidence-linked-to-runtime-obligation',
            actual: input.runtimeReadiness.runtimeEvidenceSatisfactionReadinessStatus,
            message:
              'Equivalence proof readiness is blocked because Runtime Evidence Satisfaction readiness is not ready.',
          },
    ],
    allowedUse: [
      'document why equivalence proof readiness is blocked',
      'preserve runtime Evidence satisfaction readiness provenance for human review',
      'keep accepted Evidence and readiness-only inputs out of equivalence-proof state',
    ],
    forbiddenUse: [
      'equivalence proof',
      'Evidence acceptance',
      'runtime Evidence satisfaction',
      'runtime satisfaction record creation',
      'direct Accepted Evidence consumption for equivalence',
      'graph delta apply',
      'graph-source mutation',
      'scope enforcement',
      'CI required check',
      'branch protection mutation',
      'production source mutation',
      'Codex hook or config mutation',
      'user acceptance automation',
      'inference of equivalence from Codex, AI, validators, runtime smoke, CI, review packet, accepted Evidence, Evidence acceptance readiness, runtime satisfaction readiness, mutation readiness, or apply readiness',
    ],
    outputWritePolicy: 'explicit-output-only',
    writtenOutputPath: null,
    writtenOutputPathAuthorityStatus: 'not-written-stdout-only',
    markdownReportPath: null,
    nonExecutionBoundary:
      'This Equivalence Proof readiness command reports readiness only. It does not prove equivalence, accept Evidence, satisfy runtime Evidence, create a runtime satisfaction record, apply graph deltas, mutate graph-source, enforce scope, configure CI or required checks, change branch protection, mutate production source, mutate Codex hook/config files, or replace user acceptance.',
  }
}

export function renderEquivalenceProofReadinessMarkdown(readiness: EquivalenceProofReadinessPreview): string {
  const table = renderMarkdownTable([
    ['Field', 'Value'],
    ['Equivalence proof readiness', `\`${readiness.equivalenceProofReadinessStatus}\``],
    ['Runtime Evidence satisfaction readiness', `\`${readiness.runtimeEvidenceSatisfactionReadinessStatus}\``],
    ['Runtime readiness source', `\`${readiness.sourceRuntimeEvidenceSatisfactionReadiness}\``],
    ['Required Evidence ID', `\`${readiness.requiredEvidenceId ?? 'none'}\``],
    ['Source Accepted Evidence accepted', `\`${readiness.sourceAcceptedEvidenceAccepted}\``],
    ['Top-level Evidence accepted', `\`${readiness.evidenceAccepted}\``],
    ['Runtime Evidence satisfied', `\`${readiness.runtimeEvidenceSatisfied}\``],
    ['Equivalence allowed', `\`${readiness.equivalenceAllowed}\``],
    ['Evidence acceptance readiness source', `\`${readiness.sourceEvidenceAcceptanceReadiness ?? 'none'}\``],
  ])

  return `# DevView Equivalence Proof Readiness

Status: \`${readiness.status}\`

${table}

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

function renderMarkdownTable(rows: Array<[string, string]>): string {
  const [header, ...body] = rows
  const firstWidth = Math.max(...rows.map(([first]) => first.length))
  const secondWidth = Math.max(...rows.map(([, second]) => second.length))
  const renderRow = ([first, second]: [string, string]): string =>
    `| ${first.padEnd(firstWidth)} | ${second.padEnd(secondWidth)} |`
  return [renderRow(header), `| ${'-'.repeat(firstWidth)} | ${'-'.repeat(secondWidth)} |`, ...body.map(renderRow)].join(
    '\n',
  )
}

function validateRequiredInputs(options: EquivalenceProofReadinessOptions): void {
  if (!options.policy) {
    throw new Error('report-equivalence-proof-readiness requires --policy <policyBoundaryPath>.')
  }
  if (!options.runtimeEvidenceSatisfactionReadiness) {
    throw new Error(
      'report-equivalence-proof-readiness requires --runtime-evidence-satisfaction-readiness <readinessPath>.',
    )
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

function validateRuntimeEvidenceSatisfactionReadiness(readiness: JsonRecord): void {
  if (readiness.artifactRole !== RUNTIME_EVIDENCE_SATISFACTION_READINESS_ROLE) {
    throw new Error(
      `Unsafe Runtime Evidence Satisfaction readiness input: artifactRole must be ${JSON.stringify(
        RUNTIME_EVIDENCE_SATISFACTION_READINESS_ROLE,
      )}.`,
    )
  }
  if (
    readiness.status !== 'devview-runtime-evidence-satisfaction-readiness-ready' &&
    readiness.status !== 'devview-runtime-evidence-satisfaction-readiness-blocked'
  ) {
    throw new Error('Unsafe Runtime Evidence Satisfaction readiness input: status must be ready or blocked preview.')
  }
  if (
    readiness.readinessScope !== undefined &&
    readiness.readinessScope !== 'runtime-evidence-satisfaction-binding-readiness-preview-no-satisfaction'
  ) {
    throw new Error(
      'Unsafe Runtime Evidence Satisfaction readiness input: readinessScope must be runtime-evidence-satisfaction-binding-readiness-preview-no-satisfaction.',
    )
  }
  if (!stringValue(readiness.runtimeEvidenceSatisfactionReadinessStatus)) {
    throw new Error('Unsafe Runtime Evidence Satisfaction readiness input: readiness status is required.')
  }
  if (readiness.nonEnforcing !== true) {
    throw new Error('Unsafe Runtime Evidence Satisfaction readiness input: nonEnforcing must be true.')
  }
  for (const field of [
    'runtimeEvidenceSatisfied',
    'evidenceAccepted',
    'equivalenceProven',
    'scopeEnforced',
    'ciEnforcementEnabled',
    'graphSourceMutated',
    'graphDeltaApplied',
  ]) {
    if (readiness[field] !== false) {
      throw new Error(`Unsafe Runtime Evidence Satisfaction readiness input: ${field} must be false.`)
    }
  }
  validateNoUnsafeAuthority(
    readiness,
    'Runtime Evidence Satisfaction readiness input',
    new Set(['sourceAcceptedEvidenceAccepted']),
  )
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
  validateNoUnsafeAuthority(readiness, 'Evidence Acceptance readiness boundary')
}

function validateNoUnsafeAuthority(record: JsonRecord, label: string, allowedTrueFields = new Set<string>()): void {
  const hits = collectUnsafeAuthorityHits(record, [], new Set(), allowedTrueFields)
  if (hits.length > 0) {
    const first = hits[0]
    throw new Error(`Unsafe ${label}: ${first.field} must be false.`)
  }
}

function collectUnsafeAuthorityHits(
  value: unknown,
  pathParts: string[] = [],
  seen = new Set<unknown>(),
  allowedTrueFields = new Set<string>(),
): Array<{ field: string }> {
  if (typeof value !== 'object' || value === null || seen.has(value)) {
    return []
  }
  seen.add(value)
  if (Array.isArray(value)) {
    return value.flatMap((entry, index) =>
      collectUnsafeAuthorityHits(entry, [...pathParts, String(index)], seen, allowedTrueFields),
    )
  }
  const record = value as JsonRecord
  const hits: Array<{ field: string }> = []
  for (const [key, entry] of Object.entries(record)) {
    const nextPath = [...pathParts, key]
    if (unsafeAuthorityFields.includes(key) && entry === true && !allowedTrueFields.has(key)) {
      hits.push({ field: nextPath.join('.') })
    }
    hits.push(...collectUnsafeAuthorityHits(entry, nextPath, seen, allowedTrueFields))
  }
  return hits
}

async function assertOutputAuthority(
  root: string,
  input: {
    policy: JsonRecord
    resolvedPolicyPath: string
    runtimeReadiness: JsonRecord
    resolvedRuntimeReadinessPath: string
    evidenceAcceptanceReadiness: JsonRecord | null
    resolvedEvidenceAcceptanceReadinessPath: string | null
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
    if (isProtectedControlPath(root, resolved)) {
      throw new Error(
        `Equivalence Proof readiness ${label} path is unsafe: ${requested} is inside a protected source/control path.`,
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
    runtimeReadiness: JsonRecord
    resolvedRuntimeReadinessPath: string
    evidenceAcceptanceReadiness: JsonRecord | null
    resolvedEvidenceAcceptanceReadinessPath: string | null
  },
): Map<string, string> {
  const protectedPaths = new Map<string, string>()
  const addResolved = (candidatePath: string | undefined | null, reason: string): void => {
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
  addResolved(input.resolvedRuntimeReadinessPath, 'the source Runtime Evidence Satisfaction readiness')
  addResolved(input.resolvedEvidenceAcceptanceReadinessPath, 'the source Evidence Acceptance readiness')
  addConcrete(input.runtimeReadiness.sourceAcceptedEvidenceRecord, 'the source Accepted Evidence record')
  addConcrete(input.runtimeReadiness.sourceEvidenceArtifact, 'the source Evidence artifact')
  addConcrete(input.runtimeReadiness.sourceInstructionPack, 'the source Instruction Pack')
  addConcrete(input.runtimeReadiness.sourceContractInput, 'the source Contract Input')
  addConcrete(input.runtimeReadiness.sourceRuntimeEvidenceAuthority, 'the source Runtime Evidence Authority')
  addConcrete(input.runtimeReadiness.sourceEvidenceCheckBinding, 'the source Evidence Check Binding')
  addConcrete(input.runtimeReadiness.sourceOutputRequirement, 'the source Output Requirement')
  addConcrete(input.runtimeReadiness.sourceRuntimeReport, 'the source runtime report')
  addConcrete(input.runtimeReadiness.sourceScopeReport, 'the source scope report')
  addConcrete(input.runtimeReadiness.sourceGraphDeltaApplyReport, 'the source Graph Delta Apply report')
  addConcrete(input.runtimeReadiness.sourceCheckReport, 'the source check report')
  if (input.evidenceAcceptanceReadiness) {
    addConcrete(
      input.evidenceAcceptanceReadiness.sourceGraphSourceMutationReadiness,
      'the source Graph-source Mutation readiness',
    )
    addConcrete(input.evidenceAcceptanceReadiness.sourceApplyReadiness, 'the source Graph Delta Apply readiness')
    addConcrete(input.evidenceAcceptanceReadiness.sourceApprovedProposalState, 'the source Approved Proposal State')
    addConcrete(input.evidenceAcceptanceReadiness.sourceGraphDeltaProposal, 'the source Graph Delta proposal')
  }

  for (const source of [input.policy, input.runtimeReadiness, input.evidenceAcceptanceReadiness]) {
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
    artifactRole === RUNTIME_EVIDENCE_SATISFACTION_READINESS_ROLE ||
    artifactRole.includes('graph-source') ||
    artifactRole.includes('evidence') ||
    artifactRole.includes('read-model') ||
    artifactRole.includes('source-authority') ||
    [
      'devview-accepted-evidence-record',
      'runtime-evidence-authority-preview',
      'evidence-check-binding-preview',
      'output-requirement-for-test-evidence-preview',
      'devview-graph-delta-apply-report',
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

function isProtectedControlPath(root: string, filePath: string): boolean {
  const relative = relativePath(root, filePath)
  return (
    relative.startsWith('.pbe/') ||
    relative.startsWith('.codex/') ||
    relative.includes('/.pbe/') ||
    relative.includes('/.codex/') ||
    /\.codex\/hooks/i.test(relative) ||
    /^\.pbe\/evidence\//i.test(relative) ||
    /(^|\/)(graph-source|source-authority|project-memory)(\.|-)/i.test(relative)
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
