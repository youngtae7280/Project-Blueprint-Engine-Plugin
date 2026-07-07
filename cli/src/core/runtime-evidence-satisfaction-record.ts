import { createHash } from 'node:crypto'
import path from 'node:path'
import { readJsonSafe, readTextSafe, relativePath, writeJsonAtomic, writeTextAtomic } from './fs.js'
import {
  hasCodexControlDirectory,
  hasDevViewControlDirectory,
  hasHiddenControlDirectorySegment,
} from './path-safety.js'

type JsonRecord = Record<string, unknown>

const READINESS_ROLE = 'devview-runtime-evidence-satisfaction-readiness-preview'
const READINESS_READY_STATUS = 'devview-runtime-evidence-satisfaction-readiness-ready'
const RECORD_ROLE = 'devview-runtime-evidence-satisfaction-record'

const unsafeInputAuthorityFields = [
  'runtimeEvidenceSatisfied',
  'evidenceAccepted',
  'equivalenceProven',
  'scopeEnforced',
  'ciEnforcementEnabled',
  'graphSourceMutated',
  'graphDeltaApplied',
  'approvalAutomationEnabled',
  'userAcceptanceAutomated',
  'providerInvoked',
  'networkCallMade',
  'extensionExecutionAllowed',
  'extensionsExecuted',
  'shellCommandsExecuted',
  'filesMutated',
]

export interface RuntimeEvidenceSatisfactionRecordOptions {
  runtimeEvidenceSatisfactionReadiness: string
  sourceEvidence: string
  output?: string
  markdown?: string
}

export interface RuntimeEvidenceSatisfactionRecordFileResult {
  record: RuntimeEvidenceSatisfactionRecord
  outputPath?: string
  markdownReport?: string
}

export interface RuntimeEvidenceSatisfactionRecordFinding {
  code: string
  severity: 'info' | 'warning' | 'error'
  message: string
  field?: string
  expected?: unknown
  actual?: unknown
}

export interface RuntimeEvidenceSatisfactionRecord {
  schemaVersion: 1
  artifactRole: typeof RECORD_ROLE
  status: 'devview-runtime-evidence-satisfaction-recorded'
  runtimeEvidenceSatisfactionState: 'runtime-evidence-satisfied-for-explicit-obligation'
  sourceRuntimeEvidenceSatisfactionReadiness: string
  sourceAcceptedEvidenceRecord: string
  sourceInstructionPack: string
  sourceContractInput: string | null
  sourceEvidenceArtifact: string
  sourceRuntimeEvidenceAuthority: string | null
  sourceEvidenceCheckBinding: string | null
  sourceOutputRequirement: string | null
  sourceRuntimeReport: string | null
  sourceScopeReport: string | null
  sourceGraphDeltaApplyReport: string | null
  sourceCheckReport: string | null
  requiredEvidenceId: string
  matchedRequiredEvidence: JsonRecord
  acceptedEvidenceClaim: string
  acceptedEvidenceKind: string
  sourceAcceptedEvidenceAccepted: true
  sourceEvidenceHash: string
  sourceEvidenceHashAlgorithm: 'sha256'
  satisfactionProvenanceStatus: 'ready-binding-and-source-evidence-revalidated'
  runtimeEvidenceSatisfied: true
  evidenceAccepted: false
  equivalenceProven: false
  scopeEnforced: false
  ciEnforcementEnabled: false
  graphSourceMutated: false
  graphDeltaApplied: false
  approvalAutomationEnabled: false
  userAcceptanceAutomated: false
  providerInvoked: false
  networkCallMade: false
  extensionExecutionAllowed: false
  extensionsExecuted: false
  shellCommandsExecuted: false
  nonEnforcing: true
  allowedUse: string[]
  forbiddenUse: string[]
  validationFindings: RuntimeEvidenceSatisfactionRecordFinding[]
  outputWritePolicy: 'explicit-output-only'
  writtenOutputPath: string | null
  writtenOutputPathAuthorityStatus:
    | 'not-written-stdout-only'
    | 'explicit-runtime-evidence-satisfaction-record-output-not-source-authority'
  markdownReportPath: string | null
  nonExecutionBoundary: string
}

export async function recordRuntimeEvidenceSatisfactionFile(
  root: string,
  options: RuntimeEvidenceSatisfactionRecordOptions,
): Promise<RuntimeEvidenceSatisfactionRecordFileResult> {
  validateRequiredInputs(options)

  const resolvedReadinessPath = resolveRepoPath(root, options.runtimeEvidenceSatisfactionReadiness)
  const readiness = await readRequiredJson(resolvedReadinessPath, 'Runtime Evidence Satisfaction readiness')
  validateReadiness(readiness)

  const resolvedSourceEvidencePath = resolveRepoPath(root, options.sourceEvidence)
  const sourceEvidence = await readTextArtifact(resolvedSourceEvidencePath, 'source evidence artifact')
  validateSourceEvidence(root, readiness, sourceEvidence, resolvedSourceEvidencePath)

  await assertRuntimeEvidenceSatisfactionRecordOutputAuthority(root, {
    readiness,
    resolvedReadinessPath,
    sourceEvidenceRecord: sourceEvidence.record,
    resolvedSourceEvidencePath,
    output: options.output,
    markdown: options.markdown,
  })

  const record = buildRuntimeEvidenceSatisfactionRecord(root, {
    readiness,
    resolvedReadinessPath,
    resolvedSourceEvidencePath,
    sourceEvidenceText: sourceEvidence.text,
  })

  let outputPath: string | undefined
  let markdownReport: string | undefined
  if (options.output) {
    const resolvedOutputPath = resolveRepoPath(root, options.output)
    outputPath = relativePath(root, resolvedOutputPath)
    record.writtenOutputPath = outputPath
    record.writtenOutputPathAuthorityStatus =
      'explicit-runtime-evidence-satisfaction-record-output-not-source-authority'
    await writeJsonAtomic(resolvedOutputPath, record)
  }
  if (options.markdown) {
    const resolvedMarkdownPath = resolveRepoPath(root, options.markdown)
    markdownReport = relativePath(root, resolvedMarkdownPath)
    record.markdownReportPath = markdownReport
    await writeTextAtomic(resolvedMarkdownPath, renderRuntimeEvidenceSatisfactionRecordMarkdown(record))
    if (options.output) {
      await writeJsonAtomic(resolveRepoPath(root, options.output), record)
    }
  }

  return { record, ...(outputPath ? { outputPath } : {}), ...(markdownReport ? { markdownReport } : {}) }
}

function buildRuntimeEvidenceSatisfactionRecord(
  root: string,
  input: {
    readiness: JsonRecord
    resolvedReadinessPath: string
    resolvedSourceEvidencePath: string
    sourceEvidenceText: string
  },
): RuntimeEvidenceSatisfactionRecord {
  return {
    schemaVersion: 1,
    artifactRole: RECORD_ROLE,
    status: 'devview-runtime-evidence-satisfaction-recorded',
    runtimeEvidenceSatisfactionState: 'runtime-evidence-satisfied-for-explicit-obligation',
    sourceRuntimeEvidenceSatisfactionReadiness: relativePath(root, input.resolvedReadinessPath),
    sourceAcceptedEvidenceRecord: stringValue(input.readiness.sourceAcceptedEvidenceRecord),
    sourceInstructionPack: stringValue(input.readiness.sourceInstructionPack),
    sourceContractInput: nullableString(input.readiness.sourceContractInput),
    sourceEvidenceArtifact: relativePath(root, input.resolvedSourceEvidencePath),
    sourceRuntimeEvidenceAuthority: nullableString(input.readiness.sourceRuntimeEvidenceAuthority),
    sourceEvidenceCheckBinding: nullableString(input.readiness.sourceEvidenceCheckBinding),
    sourceOutputRequirement: nullableString(input.readiness.sourceOutputRequirement),
    sourceRuntimeReport: nullableString(input.readiness.sourceRuntimeReport),
    sourceScopeReport: nullableString(input.readiness.sourceScopeReport),
    sourceGraphDeltaApplyReport: nullableString(input.readiness.sourceGraphDeltaApplyReport),
    sourceCheckReport: nullableString(input.readiness.sourceCheckReport),
    requiredEvidenceId: stringValue(input.readiness.requiredEvidenceId),
    matchedRequiredEvidence: asRecord(input.readiness.matchedRequiredEvidence) ?? {},
    acceptedEvidenceClaim: stringValue(input.readiness.acceptedEvidenceClaim),
    acceptedEvidenceKind: stringValue(input.readiness.acceptedEvidenceKind),
    sourceAcceptedEvidenceAccepted: true,
    sourceEvidenceHash: sha256(input.sourceEvidenceText),
    sourceEvidenceHashAlgorithm: 'sha256',
    satisfactionProvenanceStatus: 'ready-binding-and-source-evidence-revalidated',
    runtimeEvidenceSatisfied: true,
    evidenceAccepted: false,
    equivalenceProven: false,
    scopeEnforced: false,
    ciEnforcementEnabled: false,
    graphSourceMutated: false,
    graphDeltaApplied: false,
    approvalAutomationEnabled: false,
    userAcceptanceAutomated: false,
    providerInvoked: false,
    networkCallMade: false,
    extensionExecutionAllowed: false,
    extensionsExecuted: false,
    shellCommandsExecuted: false,
    nonEnforcing: true,
    allowedUse: [
      'serve as deterministic input to future equivalence proof readiness and proof commands',
      'document that one explicit runtime Evidence obligation is satisfied by revalidated accepted Evidence',
      'preserve source evidence hash and readiness provenance for audit',
    ],
    forbiddenUse: [
      'accepted Evidence creation',
      'equivalence proof by itself',
      'scope enforcement',
      'CI required check',
      'branch protection mutation',
      'graph-source mutation',
      'graph delta apply',
      'approval automation',
      'user acceptance automation',
      'extension execution',
      'provider or network invocation',
    ],
    validationFindings: [
      {
        code: 'RUNTIME_EVIDENCE_SATISFACTION_REVALIDATED',
        severity: 'info',
        message:
          'Ready runtime Evidence satisfaction binding and source Evidence path/hash were revalidated before recording runtime satisfaction.',
      },
    ],
    outputWritePolicy: 'explicit-output-only',
    writtenOutputPath: null,
    writtenOutputPathAuthorityStatus: 'not-written-stdout-only',
    markdownReportPath: null,
    nonExecutionBoundary:
      'This runtime Evidence satisfaction record records one explicit obligation as satisfied after deterministic readiness and source Evidence revalidation. It does not accept Evidence, prove equivalence, enforce scope, configure CI, apply graph deltas, mutate graph-source, execute extensions, call providers or networks, automate approval, or replace user acceptance.',
  }
}

function validateRequiredInputs(options: RuntimeEvidenceSatisfactionRecordOptions): void {
  if (!options.runtimeEvidenceSatisfactionReadiness) {
    throw new Error(
      'record-runtime-evidence-satisfaction requires --runtime-evidence-satisfaction-readiness <readinessJson>.',
    )
  }
  if (!options.sourceEvidence) {
    throw new Error('record-runtime-evidence-satisfaction requires --source-evidence <sourceEvidenceArtifact>.')
  }
  if (!options.output) {
    throw new Error('record-runtime-evidence-satisfaction requires --output <satisfactionRecordJson>.')
  }
}

function validateReadiness(record: JsonRecord): void {
  if (record.artifactRole !== READINESS_ROLE || record.status !== READINESS_READY_STATUS) {
    throw new Error(`Runtime Evidence satisfaction requires ready ${READINESS_ROLE}/${READINESS_READY_STATUS}.`)
  }
  if (record.readinessScope !== 'runtime-evidence-satisfaction-binding-readiness-preview-no-satisfaction') {
    throw new Error('Runtime Evidence satisfaction readiness has unsupported readinessScope.')
  }
  if (record.runtimeEvidenceSatisfactionReadinessStatus !== 'ready-accepted-evidence-linked-to-runtime-obligation') {
    throw new Error('Runtime Evidence satisfaction readiness is not ready.')
  }
  if (record.bindingMatchStatus !== 'matched') {
    throw new Error('Runtime Evidence satisfaction readiness bindingMatchStatus must be matched.')
  }
  if (!asRecord(record.matchedRequiredEvidence)) {
    throw new Error('Runtime Evidence satisfaction readiness must include matchedRequiredEvidence.')
  }
  if (record.sourceAcceptedEvidenceAccepted !== true) {
    throw new Error('Runtime Evidence satisfaction readiness must carry accepted Evidence source fact.')
  }
  if (record.runtimeEvidenceSatisfied !== false) {
    throw new Error('Runtime Evidence satisfaction readiness must not already be runtime satisfied.')
  }
  if (record.evidenceAccepted !== false) {
    throw new Error('Runtime Evidence satisfaction readiness must not be an accepted Evidence artifact.')
  }
  validateNoUnsafeAuthority(
    record,
    'Runtime Evidence satisfaction readiness',
    new Set(['sourceAcceptedEvidenceAccepted']),
  )
  for (const requiredField of [
    'sourceAcceptedEvidenceRecord',
    'sourceInstructionPack',
    'sourceEvidenceArtifact',
    'requiredEvidenceId',
    'acceptedEvidenceClaim',
    'acceptedEvidenceKind',
    'sourceEvidenceHash',
  ]) {
    if (!stringValue(record[requiredField])) {
      throw new Error(`Runtime Evidence satisfaction readiness is missing ${requiredField}.`)
    }
  }
  if (
    record.sourceEvidenceHashAlgorithm !== 'sha256' ||
    !/^[a-f0-9]{64}$/.test(stringValue(record.sourceEvidenceHash))
  ) {
    throw new Error('Runtime Evidence satisfaction readiness must include a sha256 sourceEvidenceHash.')
  }
}

function validateSourceEvidence(
  root: string,
  readiness: JsonRecord,
  sourceEvidence: TextArtifactCandidate,
  resolvedSourceEvidencePath: string,
): void {
  const expectedPath = stringValue(readiness.sourceEvidenceArtifact)
  const actualPath = relativePath(root, resolvedSourceEvidencePath)
  if (normalizePath(expectedPath) !== normalizePath(actualPath)) {
    throw new Error(`Runtime Evidence source evidence path mismatch: expected ${expectedPath}, received ${actualPath}.`)
  }
  const expectedHash = stringValue(readiness.sourceEvidenceHash)
  const actualHash = sha256(sourceEvidence.text)
  if (actualHash !== expectedHash) {
    throw new Error('Runtime Evidence source evidence hash mismatch: recomputed sha256 does not match readiness.')
  }
  if (sourceEvidence.record) {
    validateNoUnsafeAuthority(sourceEvidence.record, 'source evidence artifact')
  }
}

async function assertRuntimeEvidenceSatisfactionRecordOutputAuthority(
  root: string,
  input: {
    readiness: JsonRecord
    resolvedReadinessPath: string
    sourceEvidenceRecord: JsonRecord | null
    resolvedSourceEvidencePath: string
    output?: string
    markdown?: string
  },
): Promise<void> {
  const resolvedOutputPath = input.output ? resolveRepoPath(root, input.output) : undefined
  const resolvedMarkdownPath = input.markdown ? resolveRepoPath(root, input.markdown) : undefined
  if (resolvedOutputPath && resolvedMarkdownPath && pathKey(resolvedOutputPath) === pathKey(resolvedMarkdownPath)) {
    throw new Error('Runtime Evidence satisfaction record output is unsafe: --output and --markdown must differ.')
  }

  const protectedPaths = buildProtectedPathMap(root, input)
  for (const [label, requested, resolved] of [
    ['JSON output', input.output, resolvedOutputPath],
    ['Markdown output', input.markdown, resolvedMarkdownPath],
  ] as const) {
    if (!requested || !resolved) continue
    const protectedReason = protectedPaths.get(pathKey(resolved))
    if (protectedReason) {
      throw new Error(
        `Runtime Evidence satisfaction record ${label} path is unsafe: ${requested} would overwrite ${protectedReason}.`,
      )
    }
    if (isProtectedControlPath(root, resolved)) {
      throw new Error(
        `Runtime Evidence satisfaction record ${label} path is unsafe: ${requested} is inside a protected source/control path.`,
      )
    }
    const existingAuthority = await classifyExistingSourceAuthority(resolved)
    if (existingAuthority) {
      throw new Error(
        `Runtime Evidence satisfaction record ${label} path is unsafe: ${requested} already contains ${existingAuthority}.`,
      )
    }
  }
}

function buildProtectedPathMap(
  root: string,
  input: {
    readiness: JsonRecord
    resolvedReadinessPath: string
    sourceEvidenceRecord: JsonRecord | null
    resolvedSourceEvidencePath: string
  },
): Map<string, string> {
  const protectedPaths = new Map<string, string>()
  const addResolved = (candidatePath: string | undefined, reason: string): void => {
    if (candidatePath && !protectedPaths.has(pathKey(candidatePath))) {
      protectedPaths.set(pathKey(candidatePath), reason)
    }
  }
  addResolved(input.resolvedReadinessPath, 'the source Runtime Evidence satisfaction readiness')
  addResolved(input.resolvedSourceEvidencePath, 'the source Evidence artifact')
  for (const source of [input.readiness, input.sourceEvidenceRecord]) {
    for (const candidatePath of collectConcretePathStrings(source)) {
      addResolved(resolveRepoPath(root, candidatePath), `linked source artifact ${candidatePath}`)
    }
  }
  return protectedPaths
}

async function classifyExistingSourceAuthority(filePath: string): Promise<string | null> {
  const parsed = await readJsonSafe<JsonRecord>(filePath)
  if (!parsed.ok) return null
  const record = asRecord(parsed.value)
  const artifactRole = stringValue(record?.artifactRole)
  if (!artifactRole) return null
  if (
    artifactRole.startsWith('devview-') ||
    artifactRole.includes('evidence') ||
    artifactRole.includes('graph-source')
  ) {
    return `source artifactRole "${artifactRole}"`
  }
  if (asRecord(record?.sourceRecords)) {
    return 'graph-source-shaped sourceRecords'
  }
  return null
}

function renderRuntimeEvidenceSatisfactionRecordMarkdown(record: RuntimeEvidenceSatisfactionRecord): string {
  return `# DevView Runtime Evidence Satisfaction Record

Status: \`${record.status}\`

| Field | Value |
| --- | --- |
| Required Evidence ID | \`${record.requiredEvidenceId}\` |
| Runtime Evidence satisfied | \`${record.runtimeEvidenceSatisfied}\` |
| Evidence accepted by this record | \`${record.evidenceAccepted}\` |
| Equivalence proven | \`${record.equivalenceProven}\` |
| Scope enforced | \`${record.scopeEnforced}\` |
| CI enforcement enabled | \`${record.ciEnforcementEnabled}\` |

## Boundary

${record.nonExecutionBoundary}
`
}

function validateNoUnsafeAuthority(record: JsonRecord, label: string, allowedTrueFields = new Set<string>()): void {
  const hits = collectUnsafeAuthorityHits(record, [], new Set(), allowedTrueFields)
  if (hits.length > 0) {
    throw new Error(`Unsafe ${label}: ${hits[0].field} must not be true for runtime Evidence satisfaction.`)
  }
}

function collectUnsafeAuthorityHits(
  value: unknown,
  pathParts: string[] = [],
  seen = new Set<unknown>(),
  allowedTrueFields = new Set<string>(),
): Array<{ field: string }> {
  if (typeof value !== 'object' || value === null || seen.has(value)) return []
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
    if (unsafeInputAuthorityFields.includes(key) && entry === true && !allowedTrueFields.has(key)) {
      hits.push({ field: nextPath.join('.') })
    }
    hits.push(...collectUnsafeAuthorityHits(entry, nextPath, seen, allowedTrueFields))
  }
  return hits
}

function collectConcretePathStrings(value: unknown, seen = new Set<unknown>()): string[] {
  if (typeof value === 'string') return isConcretePath(value) ? [value] : []
  if (typeof value !== 'object' || value === null || seen.has(value)) return []
  seen.add(value)
  if (Array.isArray(value)) return value.flatMap((entry) => collectConcretePathStrings(entry, seen))
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
    hasDevViewControlDirectory(relative) ||
    hasCodexControlDirectory(relative) ||
    hasHiddenControlDirectorySegment(relative) ||
    /\.codex\/hooks/i.test(relative) ||
    /(^|\/)(graph-source|source-authority|project-memory)(\.|-)/i.test(relative)
  )
}

interface TextArtifactCandidate {
  text: string
  record: JsonRecord | null
}

async function readTextArtifact(filePath: string, label: string): Promise<TextArtifactCandidate> {
  const text = await readTextSafe(filePath)
  if (!text.ok) {
    throw new Error(`Unable to read ${label}: ${text.error}`)
  }
  const parsed = await readJsonSafe<unknown>(filePath)
  return {
    text: text.value,
    record: parsed.ok ? asRecord(parsed.value) : null,
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

function stringValue(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

function nullableString(value: unknown): string | null {
  const text = stringValue(value)
  return text || null
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
