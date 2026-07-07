import { createHash } from 'node:crypto'
import path from 'node:path'
import { readJsonSafe, readTextSafe, relativePath, writeJsonAtomic, writeTextAtomic } from './fs.js'

type JsonRecord = Record<string, unknown>

const POLICY_ROLE = 'devview-evidence-acceptance-policy-boundary-preview'
const POLICY_STATUS = 'devview-evidence-acceptance-policy-boundary-previewed'
const EVIDENCE_DECISION_ROLE = 'devview-evidence-decision-record'
const EVIDENCE_DECISION_STATUS = 'devview-evidence-decision-recorded'
const EVIDENCE_DECISION_HARDENING_STATUS = 'hardened-human-evidence-decision-record-v1'
const ACCEPTED_EVIDENCE_ROLE = 'devview-accepted-evidence-record'

type AcceptedEvidenceTimestampAuthorityStatus = 'runtime-generated'

const unsafeInputAuthorityFields = [
  'evidenceAccepted',
  'runtimeEvidenceSatisfied',
  'equivalenceProven',
  'scopeEnforced',
  'ciEnforcementEnabled',
  'graphSourceMutated',
  'graphDeltaApplied',
  'approvalAutomationEnabled',
  'acceptedEvidence',
  'acceptedEvidenceRecordCreated',
  'candidateEvidenceAccepted',
  'codexSelfAcceptanceAllowed',
  'aiGeneratedAcceptanceAllowed',
  'validatorSelfAcceptanceAllowed',
  'ciSelfAcceptanceAllowed',
  'userAcceptanceAutomated',
]

export interface AcceptedEvidenceRecordOptions {
  evidenceDecision: string
  policy: string
  sourceEvidence: string
  readiness?: string
  applyReport?: string
  runtimeReport?: string
  scopeReport?: string
  proposal?: string
  output?: string
  markdown?: string
}

export interface AcceptedEvidenceRecordFileResult {
  record: AcceptedEvidenceRecord
  outputPath?: string
  markdownReport?: string
}

export interface AcceptedEvidenceFinding {
  code: string
  severity: 'info' | 'warning' | 'error'
  message: string
  field?: string
  expected?: unknown
  actual?: unknown
}

export interface AcceptedEvidenceRecord {
  schemaVersion: 1
  artifactRole: typeof ACCEPTED_EVIDENCE_ROLE
  status: 'devview-accepted-evidence-recorded'
  acceptedEvidenceState: 'accepted-evidence-recorded-not-runtime-satisfied'
  sourceEvidenceDecisionRecord: string
  sourceEvidenceAcceptancePolicy: string
  sourceEvidenceAcceptanceReadiness: string | null
  sourceEvidenceArtifact: string
  sourceRuntimeReport: string | null
  sourceScopeReport: string | null
  sourceGraphDeltaApplyReport: string | null
  sourceProposal: string | null
  evidenceKind: string
  evidenceClaim: string
  claimScope: 'accepted-evidence-review-record-only'
  sourceEvidenceArtifactRole: string | null
  sourceEvidenceStatus: string | null
  sourceEvidenceHash: string
  sourceEvidenceHashAlgorithm: 'sha256'
  decisionKind: 'accept'
  decisionValue: 'accept-evidence'
  decisionActorType: 'human'
  decisionActorLabel: string
  decisionSource: 'explicit-cli-input' | 'imported-human-review'
  decisionTimestamp: string
  acceptedEvidenceTimestamp: string
  acceptedEvidenceTimestampAuthorityStatus: AcceptedEvidenceTimestampAuthorityStatus
  acceptedClaims: string[]
  limitations: string[]
  acceptanceProvenanceStatus: 'human-decision-and-source-evidence-revalidated'
  evidenceAccepted: true
  runtimeEvidenceSatisfied: false
  equivalenceProven: false
  scopeEnforced: false
  ciEnforcementEnabled: false
  graphSourceMutated: false
  graphDeltaApplied: false
  approvalAutomationEnabled: false
  codexSelfAcceptanceAllowed: false
  aiGeneratedAcceptanceAllowed: false
  validatorSelfAcceptanceAllowed: false
  ciSelfAcceptanceAllowed: false
  userAcceptanceAutomated: false
  allowedUse: string[]
  forbiddenUse: string[]
  validationFindings: AcceptedEvidenceFinding[]
  outputWritePolicy: 'explicit-output-only'
  writtenOutputPath: string | null
  writtenOutputPathAuthorityStatus: 'not-written-stdout-only' | 'explicit-accepted-evidence-output-not-source-authority'
  markdownReportPath: string | null
  nonExecutionBoundary: string
}

export async function createAcceptedEvidenceRecordFile(
  root: string,
  options: AcceptedEvidenceRecordOptions,
): Promise<AcceptedEvidenceRecordFileResult> {
  validateRequiredInputs(options)

  const resolvedDecisionPath = resolveRepoPath(root, options.evidenceDecision)
  const decision = await readRequiredJson(resolvedDecisionPath, 'Evidence Decision Record')
  validateEvidenceDecision(decision)

  const resolvedPolicyPath = resolveRepoPath(root, options.policy)
  const policy = await readRequiredJson(resolvedPolicyPath, 'Evidence Acceptance Policy boundary')
  validatePolicy(policy)

  const resolvedSourceEvidencePath = resolveRepoPath(root, options.sourceEvidence)
  const sourceEvidence = await readArtifactCandidate(resolvedSourceEvidencePath, 'source evidence artifact')
  validateSourceEvidence(root, decision, sourceEvidence, resolvedSourceEvidencePath)

  const optionalSources = await readOptionalSources(root, options)

  await assertAcceptedEvidenceOutputAuthority(root, {
    decision,
    resolvedDecisionPath,
    policy,
    resolvedPolicyPath,
    sourceEvidence: sourceEvidence.record,
    resolvedSourceEvidencePath,
    optionalSources,
    output: options.output,
    markdown: options.markdown,
  })

  const record = buildAcceptedEvidenceRecord(root, {
    decision,
    resolvedDecisionPath,
    resolvedPolicyPath,
    sourceEvidence,
    resolvedSourceEvidencePath,
    optionalSources,
  })

  let outputPath: string | undefined
  let markdownReport: string | undefined
  if (options.output) {
    const resolvedOutputPath = resolveRepoPath(root, options.output)
    outputPath = relativePath(root, resolvedOutputPath)
    record.writtenOutputPath = outputPath
    record.writtenOutputPathAuthorityStatus = 'explicit-accepted-evidence-output-not-source-authority'
    await writeJsonAtomic(resolvedOutputPath, record)
  }
  if (options.markdown) {
    const resolvedMarkdownPath = resolveRepoPath(root, options.markdown)
    markdownReport = relativePath(root, resolvedMarkdownPath)
    record.markdownReportPath = markdownReport
    await writeTextAtomic(resolvedMarkdownPath, renderAcceptedEvidenceMarkdown(record))
    if (options.output) {
      await writeJsonAtomic(resolveRepoPath(root, options.output), record)
    }
  }

  return { record, ...(outputPath ? { outputPath } : {}), ...(markdownReport ? { markdownReport } : {}) }
}

function buildAcceptedEvidenceRecord(
  root: string,
  input: {
    decision: JsonRecord
    resolvedDecisionPath: string
    resolvedPolicyPath: string
    sourceEvidence: ArtifactCandidate
    resolvedSourceEvidencePath: string
    optionalSources: OptionalSourceSummary[]
  },
): AcceptedEvidenceRecord {
  const optionalPath = (kind: OptionalSourceKind): string | null =>
    input.optionalSources.find((source) => source.kind === kind)?.relativePath ?? null
  const evidenceClaim = stringValue(input.decision.evidenceClaim) || inferEvidenceClaim(input.sourceEvidence)
  const limitations = stringArray(input.decision.limitations)
  const acceptedClaims = stringArray(input.decision.acceptedClaims)

  return {
    schemaVersion: 1,
    artifactRole: ACCEPTED_EVIDENCE_ROLE,
    status: 'devview-accepted-evidence-recorded',
    acceptedEvidenceState: 'accepted-evidence-recorded-not-runtime-satisfied',
    sourceEvidenceDecisionRecord: relativePath(root, input.resolvedDecisionPath),
    sourceEvidenceAcceptancePolicy: relativePath(root, input.resolvedPolicyPath),
    sourceEvidenceAcceptanceReadiness:
      optionalPath('readiness') || stringValue(input.decision.sourceEvidenceAcceptanceReadiness) || null,
    sourceEvidenceArtifact: relativePath(root, input.resolvedSourceEvidencePath),
    sourceRuntimeReport: optionalPath('runtimeReport'),
    sourceScopeReport: optionalPath('scopeReport'),
    sourceGraphDeltaApplyReport: optionalPath('applyReport'),
    sourceProposal: optionalPath('proposal'),
    evidenceKind: stringValue(input.decision.evidenceKind) || inferEvidenceKind(input.sourceEvidence),
    evidenceClaim,
    claimScope: 'accepted-evidence-review-record-only',
    sourceEvidenceArtifactRole: input.sourceEvidence.artifactRole,
    sourceEvidenceStatus: input.sourceEvidence.status,
    sourceEvidenceHash: sha256(input.sourceEvidence.text),
    sourceEvidenceHashAlgorithm: 'sha256',
    decisionKind: 'accept',
    decisionValue: 'accept-evidence',
    decisionActorType: 'human',
    decisionActorLabel: stringValue(input.decision.decisionActorLabel) || stringValue(input.decision.reviewerIdentity),
    decisionSource: normalizeDecisionSource(input.decision.decisionSource),
    decisionTimestamp: stringValue(input.decision.decisionTimestamp) || stringValue(input.decision.reviewedAt),
    acceptedEvidenceTimestamp: new Date().toISOString(),
    acceptedEvidenceTimestampAuthorityStatus: 'runtime-generated',
    acceptedClaims: acceptedClaims.length > 0 ? acceptedClaims : [evidenceClaim],
    limitations,
    acceptanceProvenanceStatus: 'human-decision-and-source-evidence-revalidated',
    evidenceAccepted: true,
    runtimeEvidenceSatisfied: false,
    equivalenceProven: false,
    scopeEnforced: false,
    ciEnforcementEnabled: false,
    graphSourceMutated: false,
    graphDeltaApplied: false,
    approvalAutomationEnabled: false,
    codexSelfAcceptanceAllowed: false,
    aiGeneratedAcceptanceAllowed: false,
    validatorSelfAcceptanceAllowed: false,
    ciSelfAcceptanceAllowed: false,
    userAcceptanceAutomated: false,
    allowedUse: [
      'record explicitly accepted Evidence after hardened human evidence decision and source evidence revalidation',
      'serve as input to a future runtime Evidence satisfaction binding readiness command',
      'serve as input to future equivalence readiness only after runtime binding is separately handled',
    ],
    forbiddenUse: [
      'runtime Evidence satisfaction',
      'equivalence proof',
      'scope enforcement',
      'CI required check',
      'branch protection mutation',
      'graph-source mutation',
      'graph delta apply',
      'approval automation',
      'user acceptance automation',
      'inference of runtime satisfaction from accepted Evidence alone',
      'inference of equivalence from accepted Evidence alone',
    ],
    validationFindings: [
      {
        code: 'ACCEPTED_EVIDENCE_NOT_RUNTIME_SATISFACTION',
        severity: 'info',
        message:
          'Accepted Evidence was recorded, but runtime Evidence satisfaction, equivalence proof, scope enforcement, CI enforcement, graph mutation, and graph apply remain false.',
      },
    ],
    outputWritePolicy: 'explicit-output-only',
    writtenOutputPath: null,
    writtenOutputPathAuthorityStatus: 'not-written-stdout-only',
    markdownReportPath: null,
    nonExecutionBoundary:
      'This Accepted Evidence Record command records accepted Evidence only. It does not satisfy runtime Evidence, prove equivalence, enforce scope, configure CI or required checks, apply graph deltas, mutate graph-source, automate approval, or replace user acceptance.',
  }
}

function validateRequiredInputs(options: AcceptedEvidenceRecordOptions): void {
  if (!options.evidenceDecision) {
    throw new Error('create-accepted-evidence-record requires --evidence-decision <evidenceDecisionRecordPath>.')
  }
  if (!options.policy) {
    throw new Error('create-accepted-evidence-record requires --policy <policyBoundaryPath>.')
  }
  if (!options.sourceEvidence) {
    throw new Error('create-accepted-evidence-record requires --source-evidence <evidenceCandidateArtifact>.')
  }
  if (!options.output) {
    throw new Error('create-accepted-evidence-record requires --output <acceptedEvidenceJson>.')
  }
}

function validateEvidenceDecision(decision: JsonRecord): void {
  if (decision.artifactRole !== EVIDENCE_DECISION_ROLE || decision.status !== EVIDENCE_DECISION_STATUS) {
    throw new Error(`Unsafe Evidence Decision Record: expected ${EVIDENCE_DECISION_ROLE}/${EVIDENCE_DECISION_STATUS}.`)
  }
  if (decision.decisionLifecycleHardeningStatus !== EVIDENCE_DECISION_HARDENING_STATUS) {
    throw new Error('Unsafe Evidence Decision Record: decisionLifecycleHardeningStatus is not hardened v1.')
  }
  if (decision.decisionKind !== 'accept' || decision.decisionValue !== 'accept-evidence') {
    throw new Error(
      'Accepted Evidence requires an Evidence Decision Record with decisionKind accept and decisionValue accept-evidence.',
    )
  }
  if (decision.decisionActorType !== 'human') {
    throw new Error('Accepted Evidence requires decisionActorType human.')
  }
  normalizeDecisionSource(decision.decisionSource)
  if (decision.selfAcceptanceCheckStatus !== 'passed-human-actor') {
    throw new Error('Accepted Evidence requires selfAcceptanceCheckStatus passed-human-actor.')
  }
  if (decision.acceptedEvidenceRecordCreated !== false) {
    throw new Error('Accepted Evidence requires decision.acceptedEvidenceRecordCreated to be false.')
  }
  if (decision.evidenceAccepted !== false || decision.runtimeEvidenceSatisfied !== false) {
    throw new Error(
      'Accepted Evidence requires source decision record to keep evidenceAccepted/runtimeEvidenceSatisfied false.',
    )
  }
  validateNoUnsafeAuthority(decision, 'Evidence Decision Record input')
}

function validatePolicy(policy: JsonRecord): void {
  if (policy.artifactRole !== POLICY_ROLE || policy.status !== POLICY_STATUS) {
    throw new Error(`Unsafe Evidence Acceptance Policy boundary: expected ${POLICY_ROLE}/${POLICY_STATUS}.`)
  }
  validateNoTopLevelUnsafeAuthority(policy, 'Evidence Acceptance Policy boundary')
}

function validateSourceEvidence(
  root: string,
  decision: JsonRecord,
  sourceEvidence: ArtifactCandidate,
  resolvedSourceEvidencePath: string,
): void {
  const decisionSourcePath = stringValue(decision.sourceEvidenceArtifact)
  if (!decisionSourcePath) {
    throw new Error('Accepted Evidence requires decision.sourceEvidenceArtifact.')
  }
  const currentSourcePath = relativePath(root, resolvedSourceEvidencePath)
  if (normalizePath(decisionSourcePath) !== normalizePath(currentSourcePath)) {
    throw new Error(
      `Accepted Evidence source evidence mismatch: expected ${decisionSourcePath}, received ${currentSourcePath}.`,
    )
  }
  if (!sourceEvidence.record) {
    if (stringValue(decision.sourceEvidenceArtifactRole) || stringValue(decision.sourceEvidenceStatus)) {
      throw new Error('Accepted Evidence source evidence mismatch: decision expected JSON source evidence role/status.')
    }
    return
  }

  const role = sourceEvidence.artifactRole ?? ''
  if (role.includes('source-authority') || role === 'graph-source' || role === 'devview-project-memory-preview') {
    throw new Error(`Unsafe source evidence artifactRole: ${role} cannot be accepted as evidence input.`)
  }
  if (asRecord(sourceEvidence.record.sourceRecords)) {
    throw new Error('Unsafe source evidence artifact: graph-source-shaped sourceRecords cannot be evidence input.')
  }
  validateNoUnsafeAuthority(sourceEvidence.record, 'source evidence artifact')

  const decisionRole = stringValue(decision.sourceEvidenceArtifactRole)
  if (decisionRole && decisionRole !== sourceEvidence.artifactRole) {
    throw new Error(
      `Accepted Evidence source evidence role mismatch: expected ${decisionRole}, received ${sourceEvidence.artifactRole}.`,
    )
  }
  const decisionStatus = stringValue(decision.sourceEvidenceStatus)
  if (decisionStatus && decisionStatus !== sourceEvidence.status) {
    throw new Error(
      `Accepted Evidence source evidence status mismatch: expected ${decisionStatus}, received ${sourceEvidence.status}.`,
    )
  }
  const decisionClaim = stringValue(decision.evidenceClaim)
  const currentClaim = inferEvidenceClaim(sourceEvidence)
  if (decisionClaim && decisionClaim !== currentClaim) {
    throw new Error(
      'Accepted Evidence source evidence claim mismatch: current source evidence no longer matches decision claim.',
    )
  }
}

function validateNoUnsafeAuthority(record: JsonRecord, label: string): void {
  const hits = collectUnsafeAuthorityHits(record)
  if (hits.length > 0) {
    const first = hits[0]
    throw new Error(`Unsafe ${label}: ${first.field} must not be true for Accepted Evidence Record.`)
  }
}

function validateNoTopLevelUnsafeAuthority(record: JsonRecord, label: string): void {
  for (const field of unsafeInputAuthorityFields) {
    if (record[field] === true) {
      throw new Error(`Unsafe ${label}: ${field} must not be true for Accepted Evidence Record.`)
    }
  }
}

function collectUnsafeAuthorityHits(
  value: unknown,
  pathParts: string[] = [],
  seen = new Set<unknown>(),
): Array<{ field: string }> {
  if (typeof value !== 'object' || value === null || seen.has(value)) {
    return []
  }
  seen.add(value)
  if (Array.isArray(value)) {
    return value.flatMap((entry, index) => collectUnsafeAuthorityHits(entry, [...pathParts, String(index)], seen))
  }
  const record = value as JsonRecord
  const hits: Array<{ field: string }> = []
  for (const [key, entry] of Object.entries(record)) {
    const nextPath = [...pathParts, key]
    if (unsafeInputAuthorityFields.includes(key) && entry === true) {
      hits.push({ field: nextPath.join('.') })
    }
    hits.push(...collectUnsafeAuthorityHits(entry, nextPath, seen))
  }
  return hits
}

type OptionalSourceKind = 'readiness' | 'applyReport' | 'runtimeReport' | 'scopeReport' | 'proposal'

interface OptionalSourceSummary {
  kind: OptionalSourceKind
  relativePath: string
  record: JsonRecord | null
}

async function readOptionalSources(
  root: string,
  options: AcceptedEvidenceRecordOptions,
): Promise<OptionalSourceSummary[]> {
  const inputs: Array<[OptionalSourceKind, string | undefined]> = [
    ['readiness', options.readiness],
    ['applyReport', options.applyReport],
    ['runtimeReport', options.runtimeReport],
    ['scopeReport', options.scopeReport],
    ['proposal', options.proposal],
  ]
  const sources: OptionalSourceSummary[] = []
  for (const [kind, sourcePath] of inputs) {
    if (!sourcePath) {
      continue
    }
    const resolvedPath = resolveRepoPath(root, sourcePath)
    const candidate = await readArtifactCandidate(resolvedPath, `${kind} input`)
    if (candidate.record) {
      validateNoUnsafeAuthority(candidate.record, `${kind} input`)
    }
    sources.push({ kind, relativePath: relativePath(root, resolvedPath), record: candidate.record })
  }
  return sources
}

interface ArtifactCandidate {
  record: JsonRecord | null
  text: string
  artifactRole: string | null
  status: string | null
}

async function readArtifactCandidate(filePath: string, label: string): Promise<ArtifactCandidate> {
  const text = await readTextSafe(filePath)
  if (!text.ok) {
    throw new Error(`Unable to read ${label}: ${text.error}`)
  }
  const parsed = await readJsonSafe<unknown>(filePath)
  if (!parsed.ok) {
    return {
      record: null,
      text: text.value,
      artifactRole: null,
      status: null,
    }
  }
  const record = asRecord(parsed.value)
  if (!record) {
    return {
      record: null,
      text: text.value,
      artifactRole: null,
      status: null,
    }
  }
  return {
    record,
    text: text.value,
    artifactRole: stringValue(record.artifactRole) || null,
    status: stringValue(record.status) || stringValue(record.requestIrCandidateStatus) || null,
  }
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

async function assertAcceptedEvidenceOutputAuthority(
  root: string,
  input: {
    decision: JsonRecord
    resolvedDecisionPath: string
    policy: JsonRecord
    resolvedPolicyPath: string
    sourceEvidence: JsonRecord | null
    resolvedSourceEvidencePath: string
    optionalSources: OptionalSourceSummary[]
    output?: string
    markdown?: string
  },
): Promise<void> {
  const resolvedOutputPath = input.output ? resolveRepoPath(root, input.output) : undefined
  const resolvedMarkdownPath = input.markdown ? resolveRepoPath(root, input.markdown) : undefined
  if (resolvedOutputPath && resolvedMarkdownPath && pathKey(resolvedOutputPath) === pathKey(resolvedMarkdownPath)) {
    throw new Error('Accepted Evidence Record output is unsafe: --output and --markdown must be different paths.')
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
        `Accepted Evidence Record ${label} path is unsafe: ${requested} would overwrite ${protectedReason}.`,
      )
    }
    if (isProtectedControlPath(root, resolved)) {
      throw new Error(
        `Accepted Evidence Record ${label} path is unsafe: ${requested} is inside a protected source/control path.`,
      )
    }
    const existingAuthority = await classifyExistingSourceAuthority(resolved)
    if (existingAuthority) {
      throw new Error(
        `Accepted Evidence Record ${label} path is unsafe: ${requested} already contains ${existingAuthority}. Choose a dedicated accepted evidence output path.`,
      )
    }
  }
}

function buildProtectedPathMap(
  root: string,
  input: {
    decision: JsonRecord
    resolvedDecisionPath: string
    policy: JsonRecord
    resolvedPolicyPath: string
    sourceEvidence: JsonRecord | null
    resolvedSourceEvidencePath: string
    optionalSources: OptionalSourceSummary[]
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
    if (!isConcretePath(candidatePath)) {
      return
    }
    addResolved(resolveRepoPath(root, candidatePath), reason)
  }

  addResolved(input.resolvedDecisionPath, 'the source Evidence Decision Record')
  addResolved(input.resolvedPolicyPath, 'the source Evidence Acceptance Policy boundary')
  addResolved(input.resolvedSourceEvidencePath, 'the source evidence artifact')
  for (const optionalSource of input.optionalSources) {
    addResolved(resolveRepoPath(root, optionalSource.relativePath), `the source ${optionalSource.kind} artifact`)
  }
  for (const source of [
    input.decision,
    input.policy,
    input.sourceEvidence,
    ...input.optionalSources.map((entry) => entry.record),
  ]) {
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
  if (!artifactRole || artifactRole === ACCEPTED_EVIDENCE_ROLE) {
    return null
  }
  if (
    artifactRole.includes('evidence') ||
    artifactRole.includes('graph-source') ||
    artifactRole.includes('read-model') ||
    artifactRole.includes('source-authority') ||
    [
      'devview-graph-delta-apply-report',
      'devview-approved-apply-dry-run-report',
      'devview-human-decision-record',
      'devview-approved-proposal-state-preview',
      'devview-graph-source-mutation-readiness-preview',
      'graph-delta-proposal-only-preview',
      'graph-delta-human-review-packet',
      'instruction-pack',
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

function inferEvidenceKind(sourceEvidence: ArtifactCandidate): string {
  if (sourceEvidence.artifactRole) {
    return `${sourceEvidence.artifactRole}-candidate`
  }
  return sourceEvidence.record ? 'json-evidence-candidate' : 'text-evidence-candidate'
}

function inferEvidenceClaim(sourceEvidence: ArtifactCandidate): string {
  const record = sourceEvidence.record
  if (record) {
    const role = stringValue(record.artifactRole) || 'json-artifact'
    const status = stringValue(record.status) || stringValue(record.requestIrCandidateStatus) || 'status-unspecified'
    return `${role} with status ${status} is reviewed as candidate evidence only.`
  }
  const preview = sourceEvidence.text.replace(/\s+/g, ' ').trim().slice(0, 80)
  return preview ? `Text evidence candidate reviewed: ${preview}` : 'Text evidence candidate reviewed.'
}

function renderAcceptedEvidenceMarkdown(record: AcceptedEvidenceRecord): string {
  return `# DevView Accepted Evidence Record

Status: \`${record.status}\`

- Accepted evidence state: \`${record.acceptedEvidenceState}\`
- Source evidence: \`${record.sourceEvidenceArtifact}\`
- Evidence kind: \`${record.evidenceKind}\`
- Evidence accepted: \`${record.evidenceAccepted}\`
- Runtime Evidence satisfied: \`${record.runtimeEvidenceSatisfied}\`
- Equivalence proven: \`${record.equivalenceProven}\`
- Scope enforced: \`${record.scopeEnforced}\`
- CI enforcement enabled: \`${record.ciEnforcementEnabled}\`
- Graph-source mutated: \`${record.graphSourceMutated}\`
- Graph delta applied: \`${record.graphDeltaApplied}\`

## Accepted Claims

${record.acceptedClaims.map((claim) => `- ${claim}`).join('\n')}

## Safety Boundary

- This is an accepted Evidence record only.
- It does not satisfy runtime Evidence, prove equivalence, enforce scope, configure CI, apply graph deltas, mutate graph-source, automate approval, or replace user acceptance.
`
}

function collectConcretePathStrings(value: unknown, seen = new Set<unknown>()): string[] {
  if (typeof value === 'string') {
    return isConcretePath(value) ? [value] : []
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

function isConcretePath(value: string): boolean {
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
    relative.startsWith('.devview/') ||
    relative.startsWith('.codex/') ||
    relative.includes('/.pbe/') ||
    relative.includes('/.devview/') ||
    relative.includes('/.codex/') ||
    /\.codex\/hooks/i.test(relative) ||
    /^\.pbe\/evidence\//i.test(relative) ||
    /^\.devview\/evidence\//i.test(relative) ||
    /(^|\/)(graph-source|source-authority|project-memory)(\.|-)/i.test(relative)
  )
}

function normalizeDecisionSource(value: unknown): 'explicit-cli-input' | 'imported-human-review' {
  if (value === 'explicit-cli-input' || value === 'imported-human-review') {
    return value
  }
  throw new Error('Accepted Evidence requires decisionSource explicit-cli-input or imported-human-review.')
}

function stringValue(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === 'string') : []
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

function normalizePath(filePath: string): string {
  return filePath.replaceAll('\\', '/').replace(/\/+$/, '')
}

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex')
}
