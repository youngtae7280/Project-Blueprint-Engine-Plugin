import { createHash } from 'node:crypto'
import path from 'node:path'
import { readJsonSafe, readTextSafe, relativePath, writeJsonAtomic, writeTextAtomic } from './fs.js'
import {
  hasCodexControlDirectory,
  hasDevViewControlDirectory,
  hasHiddenControlDirectorySegment,
} from './path-safety.js'

type JsonRecord = Record<string, unknown>

const ACCEPTED_EVIDENCE_ROLE = 'devview-accepted-evidence-record'
const ACCEPTED_EVIDENCE_STATUS = 'devview-accepted-evidence-recorded'
const INSTRUCTION_PACK_ROLE = 'instruction-pack'
const INSTRUCTION_PACK_STATUS = 'instruction-pack-generated'
const CONTRACT_INPUT_ROLE = 'contract-compiler-input'
const CONTRACT_INPUT_STATUS = 'contract-compiler-input-generated'
const RUNTIME_AUTHORITY_ROLE = 'runtime-evidence-authority-preview'
const RUNTIME_AUTHORITY_STATUS = 'runtime-evidence-authority-previewed'
const EVIDENCE_CHECK_BINDING_ROLE = 'evidence-check-binding-preview'
const EVIDENCE_CHECK_BINDING_STATUS = 'evidence-check-binding-previewed'
const OUTPUT_REQUIREMENT_ROLE = 'output-requirement-for-test-evidence-preview'
const OUTPUT_REQUIREMENT_STATUS = 'output-requirement-for-test-evidence-previewed'
const READINESS_ROLE = 'devview-runtime-evidence-satisfaction-readiness-preview'

const unsafeAuthorityFields = [
  'runtimeEvidenceSatisfied',
  'equivalenceProven',
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
]

export interface RuntimeEvidenceSatisfactionReadinessOptions {
  acceptedEvidence: string
  instructionPack: string
  requiredEvidenceId: string
  contractInput?: string
  sourceEvidence?: string
  runtimeEvidenceAuthority?: string
  evidenceCheckBinding?: string
  outputRequirement?: string
  runtimeReport?: string
  scopeReport?: string
  applyReport?: string
  checkReport?: string
  output?: string
  markdown?: string
}

export interface RuntimeEvidenceSatisfactionReadinessFileResult {
  readiness: RuntimeEvidenceSatisfactionReadinessPreview
  outputPath?: string
  markdownReport?: string
}

export interface RuntimeEvidenceSatisfactionReadinessFinding {
  code: string
  severity: 'info' | 'warning' | 'error'
  message: string
  field?: string
  expected?: unknown
  actual?: unknown
}

export interface RuntimeEvidenceSatisfactionReadinessPreview {
  schemaVersion: 1
  artifactRole: typeof READINESS_ROLE
  status:
    | 'devview-runtime-evidence-satisfaction-readiness-ready'
    | 'devview-runtime-evidence-satisfaction-readiness-blocked'
  readinessScope: 'runtime-evidence-satisfaction-binding-readiness-preview-no-satisfaction'
  sourceAcceptedEvidenceRecord: string
  sourceInstructionPack: string
  sourceContractInput: string | null
  sourceEvidenceArtifact: string | null
  sourceRuntimeEvidenceAuthority: string | null
  sourceEvidenceCheckBinding: string | null
  sourceOutputRequirement: string | null
  sourceRuntimeReport: string | null
  sourceScopeReport: string | null
  sourceGraphDeltaApplyReport: string | null
  sourceCheckReport: string | null
  requiredEvidenceId: string
  matchedRequiredEvidence: RuntimeEvidenceRequirementSummary | null
  acceptedEvidenceRecordStatus: string
  acceptedEvidenceState: string
  sourceAcceptedEvidenceAccepted: true
  acceptedEvidenceClaim: string
  acceptedEvidenceKind: string
  sourceEvidenceHash: string
  sourceEvidenceHashAlgorithm: 'sha256'
  bindingMatchStatus: 'matched' | 'not-matched'
  runtimeEvidenceSatisfactionReadinessStatus: RuntimeEvidenceSatisfactionReadinessStatus
  terminalStage: RuntimeEvidenceSatisfactionReadinessStatus
  runtimeEvidenceSatisfactionAllowed: false
  runtimeEvidenceSatisfied: false
  evidenceAccepted: false
  equivalenceProven: false
  scopeEnforced: false
  ciEnforcementEnabled: false
  graphSourceMutated: false
  graphDeltaApplied: false
  approvalAutomationEnabled: false
  userAcceptanceAutomated: false
  nonEnforcing: true
  validationFindings: RuntimeEvidenceSatisfactionReadinessFinding[]
  nextRequiredCommand: string
  allowedUse: string[]
  forbiddenUse: string[]
  outputWritePolicy: 'explicit-output-only'
  writtenOutputPath: string | null
  writtenOutputPathAuthorityStatus:
    | 'not-written-stdout-only'
    | 'explicit-runtime-evidence-satisfaction-readiness-output-not-source-authority'
  markdownReportPath: string | null
  nonExecutionBoundary: string
}

export type RuntimeEvidenceSatisfactionReadinessStatus =
  | 'ready-accepted-evidence-linked-to-runtime-obligation'
  | 'blocked-accepted-evidence-missing'
  | 'blocked-accepted-evidence-invalid'
  | 'blocked-accepted-evidence-already-runtime-satisfied'
  | 'blocked-required-obligation-missing'
  | 'blocked-required-obligation-mismatch'
  | 'blocked-source-evidence-missing'
  | 'blocked-source-evidence-mismatch'
  | 'blocked-source-evidence-hash-mismatch'
  | 'blocked-runtime-authority-invalid'
  | 'blocked-evidence-check-binding-mismatch'
  | 'blocked-output-requirement-mismatch'
  | 'blocked-unsafe-authority-flag'
  | 'blocked-unsupported-obligation-source'

export interface RuntimeEvidenceRequirementSummary {
  id: string
  sourceEvidenceId: string | null
  evidenceType: string | null
  artifact: string | null
  sourceStatus: string | null
  runtimeEvidenceSatisfied: false
  acceptedEvidence: false
}

interface OptionalSourceSummary {
  kind:
    | 'contractInput'
    | 'sourceEvidence'
    | 'runtimeEvidenceAuthority'
    | 'evidenceCheckBinding'
    | 'outputRequirement'
    | 'runtimeReport'
    | 'scopeReport'
    | 'applyReport'
    | 'checkReport'
  relativePath: string
  record: JsonRecord | null
  text: string | null
}

export async function reportRuntimeEvidenceSatisfactionReadinessFile(
  root: string,
  options: RuntimeEvidenceSatisfactionReadinessOptions,
): Promise<RuntimeEvidenceSatisfactionReadinessFileResult> {
  validateRequiredInputs(options)

  const resolvedAcceptedEvidencePath = resolveRepoPath(root, options.acceptedEvidence)
  const acceptedEvidence = await readRequiredJson(resolvedAcceptedEvidencePath, 'Accepted Evidence Record')
  validateAcceptedEvidence(acceptedEvidence)

  const resolvedInstructionPackPath = resolveRepoPath(root, options.instructionPack)
  const instructionPack = await readRequiredJson(resolvedInstructionPackPath, 'Instruction Pack')
  validateInstructionPack(instructionPack)

  const optionalSources = await readOptionalSources(root, options)
  validateOptionalSources(options, acceptedEvidence, instructionPack, optionalSources)

  await assertRuntimeEvidenceSatisfactionOutputAuthority(root, {
    acceptedEvidence,
    resolvedAcceptedEvidencePath,
    instructionPack,
    resolvedInstructionPackPath,
    optionalSources,
    output: options.output,
    markdown: options.markdown,
  })

  const readiness = buildRuntimeEvidenceSatisfactionReadiness(root, {
    acceptedEvidence,
    resolvedAcceptedEvidencePath,
    instructionPack,
    resolvedInstructionPackPath,
    requiredEvidenceId: options.requiredEvidenceId,
    optionalSources,
  })

  let outputPath: string | undefined
  let markdownReport: string | undefined
  if (options.output) {
    const resolvedOutputPath = resolveRepoPath(root, options.output)
    outputPath = relativePath(root, resolvedOutputPath)
    readiness.writtenOutputPath = outputPath
    readiness.writtenOutputPathAuthorityStatus =
      'explicit-runtime-evidence-satisfaction-readiness-output-not-source-authority'
    await writeJsonAtomic(resolvedOutputPath, readiness)
  }
  if (options.markdown) {
    const resolvedMarkdownPath = resolveRepoPath(root, options.markdown)
    markdownReport = relativePath(root, resolvedMarkdownPath)
    readiness.markdownReportPath = markdownReport
    await writeTextAtomic(resolvedMarkdownPath, renderRuntimeEvidenceSatisfactionReadinessMarkdown(readiness))
    if (options.output) {
      await writeJsonAtomic(resolveRepoPath(root, options.output), readiness)
    }
  }

  return { readiness, ...(outputPath ? { outputPath } : {}), ...(markdownReport ? { markdownReport } : {}) }
}

function buildRuntimeEvidenceSatisfactionReadiness(
  root: string,
  input: {
    acceptedEvidence: JsonRecord
    resolvedAcceptedEvidencePath: string
    instructionPack: JsonRecord
    resolvedInstructionPackPath: string
    requiredEvidenceId: string
    optionalSources: OptionalSourceSummary[]
  },
): RuntimeEvidenceSatisfactionReadinessPreview {
  const requirement = findRequiredEvidence(input.instructionPack, input.requiredEvidenceId)
  const requirementSummary = requirement ? summarizeRequirement(requirement) : null
  const match = requirementSummary
    ? matchAcceptedEvidenceToRequirement(input.acceptedEvidence, requirementSummary)
    : { matched: false, finding: missingRequirementFinding(input.requiredEvidenceId) }
  const readinessStatus: RuntimeEvidenceSatisfactionReadinessStatus = requirementSummary
    ? match.matched
      ? 'ready-accepted-evidence-linked-to-runtime-obligation'
      : 'blocked-required-obligation-mismatch'
    : 'blocked-required-obligation-missing'
  const ready = readinessStatus === 'ready-accepted-evidence-linked-to-runtime-obligation'
  const optionalPath = (kind: OptionalSourceSummary['kind']): string | null =>
    input.optionalSources.find((source) => source.kind === kind)?.relativePath ?? null

  return {
    schemaVersion: 1,
    artifactRole: READINESS_ROLE,
    status: ready
      ? 'devview-runtime-evidence-satisfaction-readiness-ready'
      : 'devview-runtime-evidence-satisfaction-readiness-blocked',
    readinessScope: 'runtime-evidence-satisfaction-binding-readiness-preview-no-satisfaction',
    sourceAcceptedEvidenceRecord: relativePath(root, input.resolvedAcceptedEvidencePath),
    sourceInstructionPack: relativePath(root, input.resolvedInstructionPackPath),
    sourceContractInput: optionalPath('contractInput'),
    sourceEvidenceArtifact:
      stringValue(input.acceptedEvidence.sourceEvidenceArtifact) || optionalPath('sourceEvidence'),
    sourceRuntimeEvidenceAuthority: optionalPath('runtimeEvidenceAuthority'),
    sourceEvidenceCheckBinding: optionalPath('evidenceCheckBinding'),
    sourceOutputRequirement: optionalPath('outputRequirement'),
    sourceRuntimeReport: optionalPath('runtimeReport'),
    sourceScopeReport: optionalPath('scopeReport'),
    sourceGraphDeltaApplyReport: optionalPath('applyReport'),
    sourceCheckReport: optionalPath('checkReport'),
    requiredEvidenceId: input.requiredEvidenceId,
    matchedRequiredEvidence: requirementSummary,
    acceptedEvidenceRecordStatus: stringValue(input.acceptedEvidence.status),
    acceptedEvidenceState: stringValue(input.acceptedEvidence.acceptedEvidenceState),
    sourceAcceptedEvidenceAccepted: true,
    acceptedEvidenceClaim: stringValue(input.acceptedEvidence.evidenceClaim),
    acceptedEvidenceKind: stringValue(input.acceptedEvidence.evidenceKind),
    sourceEvidenceHash: stringValue(input.acceptedEvidence.sourceEvidenceHash),
    sourceEvidenceHashAlgorithm: 'sha256',
    bindingMatchStatus: ready ? 'matched' : 'not-matched',
    runtimeEvidenceSatisfactionReadinessStatus: readinessStatus,
    terminalStage: readinessStatus,
    runtimeEvidenceSatisfactionAllowed: false,
    runtimeEvidenceSatisfied: false,
    evidenceAccepted: false,
    equivalenceProven: false,
    scopeEnforced: false,
    ciEnforcementEnabled: false,
    graphSourceMutated: false,
    graphDeltaApplied: false,
    approvalAutomationEnabled: false,
    userAcceptanceAutomated: false,
    nonEnforcing: true,
    validationFindings: ready
      ? [
          {
            code: 'RUNTIME_EVIDENCE_SATISFACTION_READINESS_MATCHED',
            severity: 'info',
            message:
              'Accepted Evidence is linked to the selected runtime obligation, but this readiness report does not satisfy runtime Evidence.',
          },
        ]
      : [match.finding ?? missingRequirementFinding(input.requiredEvidenceId)],
    nextRequiredCommand: ready
      ? 'Future command: create a runtime Evidence satisfaction record after revalidating this readiness, source evidence, and obligation. This command did not promote runtime Evidence to satisfied.'
      : 'Resolve the accepted Evidence and runtime obligation mismatch before any future runtime Evidence satisfaction record can be created.',
    allowedUse: ready
      ? [
          'serve as readiness context for a future runtime Evidence satisfaction binding command',
          'document that accepted Evidence maps to an explicit runtime obligation',
          'preserve accepted Evidence and obligation provenance without satisfying runtime Evidence',
        ]
      : [
          'document why runtime Evidence satisfaction binding is not ready',
          'preserve accepted Evidence and runtime obligation provenance for human review',
          'keep mismatched accepted Evidence out of runtime satisfaction state',
        ],
    forbiddenUse: [
      'runtime Evidence satisfaction',
      'accepted Evidence creation',
      'equivalence proof',
      'scope enforcement',
      'CI required check',
      'branch protection mutation',
      'graph-source mutation',
      'graph delta apply',
      'approval automation',
      'user acceptance automation',
      'inference of runtime satisfaction from accepted Evidence alone',
      'inference of equivalence from readiness alone',
    ],
    outputWritePolicy: 'explicit-output-only',
    writtenOutputPath: null,
    writtenOutputPathAuthorityStatus: 'not-written-stdout-only',
    markdownReportPath: null,
    nonExecutionBoundary:
      'This Runtime Evidence Satisfaction Binding readiness command reports readiness only. It does not set runtimeEvidenceSatisfied true, create a satisfaction record, prove equivalence, enforce scope, configure CI or required checks, apply graph deltas, mutate graph-source, automate approval, or replace user acceptance.',
  }
}

function validateRequiredInputs(options: RuntimeEvidenceSatisfactionReadinessOptions): void {
  if (!options.acceptedEvidence) {
    throw new Error(
      'report-runtime-evidence-satisfaction-readiness requires --accepted-evidence <acceptedEvidenceRecordPath>.',
    )
  }
  if (!options.instructionPack) {
    throw new Error('report-runtime-evidence-satisfaction-readiness requires --instruction-pack <instructionPackPath>.')
  }
  if (!options.requiredEvidenceId) {
    throw new Error('report-runtime-evidence-satisfaction-readiness requires --required-evidence-id <id>.')
  }
  if (!options.output) {
    throw new Error('report-runtime-evidence-satisfaction-readiness requires --output <readinessJson>.')
  }
}

function validateAcceptedEvidence(record: JsonRecord): void {
  if (record.artifactRole !== ACCEPTED_EVIDENCE_ROLE || record.status !== ACCEPTED_EVIDENCE_STATUS) {
    throw new Error(`Unsafe Accepted Evidence input: expected ${ACCEPTED_EVIDENCE_ROLE}/${ACCEPTED_EVIDENCE_STATUS}.`)
  }
  if (record.acceptedEvidenceState !== 'accepted-evidence-recorded-not-runtime-satisfied') {
    throw new Error('Unsafe Accepted Evidence input: acceptedEvidenceState must be not-runtime-satisfied.')
  }
  if (record.evidenceAccepted !== true) {
    throw new Error('Unsafe Accepted Evidence input: evidenceAccepted must be true only on the accepted record input.')
  }
  if (record.runtimeEvidenceSatisfied !== false) {
    throw new Error('Unsafe Accepted Evidence input: runtimeEvidenceSatisfied must be false.')
  }
  if (
    record.sourceEvidenceHashAlgorithm !== 'sha256' ||
    !/^[a-f0-9]{64}$/.test(stringValue(record.sourceEvidenceHash))
  ) {
    throw new Error('Unsafe Accepted Evidence input: sourceEvidenceHash must be sha256.')
  }
  validateNoUnsafeAuthority(record, 'Accepted Evidence input', new Set(['evidenceAccepted']))
}

function validateInstructionPack(record: JsonRecord): void {
  if (record.artifactRole !== INSTRUCTION_PACK_ROLE || record.status !== INSTRUCTION_PACK_STATUS) {
    throw new Error(`Unsafe Instruction Pack input: expected ${INSTRUCTION_PACK_ROLE}/${INSTRUCTION_PACK_STATUS}.`)
  }
  if (!Array.isArray(record.requiredEvidence)) {
    throw new Error('Unsafe Instruction Pack input: requiredEvidence must be an array.')
  }
  validateNoUnsafeAuthority(record, 'Instruction Pack input')
}

async function readOptionalSources(
  root: string,
  options: RuntimeEvidenceSatisfactionReadinessOptions,
): Promise<OptionalSourceSummary[]> {
  const inputs: Array<[OptionalSourceSummary['kind'], string | undefined]> = [
    ['contractInput', options.contractInput],
    ['sourceEvidence', options.sourceEvidence],
    ['runtimeEvidenceAuthority', options.runtimeEvidenceAuthority],
    ['evidenceCheckBinding', options.evidenceCheckBinding],
    ['outputRequirement', options.outputRequirement],
    ['runtimeReport', options.runtimeReport],
    ['scopeReport', options.scopeReport],
    ['applyReport', options.applyReport],
    ['checkReport', options.checkReport],
  ]
  const sources: OptionalSourceSummary[] = []
  for (const [kind, sourcePath] of inputs) {
    if (!sourcePath) {
      continue
    }
    const resolvedPath = resolveRepoPath(root, sourcePath)
    const text = await readTextSafe(resolvedPath)
    if (!text.ok) {
      throw new Error(`Unable to read ${kind} input: ${text.error}`)
    }
    const parsed = await readJsonSafe<unknown>(resolvedPath)
    const record = parsed.ok ? asRecord(parsed.value) : null
    sources.push({
      kind,
      relativePath: relativePath(root, resolvedPath),
      record,
      text: text.value,
    })
  }
  return sources
}

function validateOptionalSources(
  options: RuntimeEvidenceSatisfactionReadinessOptions,
  acceptedEvidence: JsonRecord,
  instructionPack: JsonRecord,
  optionalSources: OptionalSourceSummary[],
): void {
  for (const source of optionalSources) {
    if (source.record) {
      validateNoUnsafeAuthority(source.record, `${source.kind} input`)
    }
  }

  const sourceEvidence = optionalSources.find((entry) => entry.kind === 'sourceEvidence')
  if (sourceEvidence) {
    const expectedPath = stringValue(acceptedEvidence.sourceEvidenceArtifact)
    if (!expectedPath) {
      throw new Error('Runtime Evidence satisfaction readiness requires acceptedEvidence.sourceEvidenceArtifact.')
    }
    if (normalizePath(expectedPath) !== normalizePath(sourceEvidence.relativePath)) {
      throw new Error(
        `Runtime Evidence source evidence mismatch: expected ${expectedPath}, received ${sourceEvidence.relativePath}.`,
      )
    }
    const expectedHash = stringValue(acceptedEvidence.sourceEvidenceHash)
    if (sha256(sourceEvidence.text ?? '') !== expectedHash) {
      throw new Error(
        'Runtime Evidence source evidence hash mismatch: recomputed sha256 does not match accepted record.',
      )
    }
  } else if (options.sourceEvidence) {
    throw new Error('Runtime Evidence source evidence is missing.')
  }

  const contractInput = optionalSources.find((entry) => entry.kind === 'contractInput')?.record
  if (contractInput) {
    validateRoleStatus(contractInput, CONTRACT_INPUT_ROLE, CONTRACT_INPUT_STATUS, 'Contract Input')
    const packRequirement = findRequiredEvidence(instructionPack, options.requiredEvidenceId)
    const contractRequirement = findRequiredEvidence(contractInput, options.requiredEvidenceId)
    if (!contractRequirement || !packRequirement) {
      throw new Error('Runtime Evidence contract input mismatch: required evidence id is missing.')
    }
    const packSummary = summarizeRequirement(packRequirement)
    const contractSummary = summarizeRequirement(contractRequirement)
    if (
      packSummary.sourceEvidenceId !== contractSummary.sourceEvidenceId ||
      packSummary.evidenceType !== contractSummary.evidenceType ||
      packSummary.artifact !== contractSummary.artifact
    ) {
      throw new Error(
        'Runtime Evidence contract input mismatch: required evidence fields differ from instruction pack.',
      )
    }
  }

  const runtimeAuthority = optionalSources.find((entry) => entry.kind === 'runtimeEvidenceAuthority')?.record
  if (runtimeAuthority) {
    validateRoleStatus(runtimeAuthority, RUNTIME_AUTHORITY_ROLE, RUNTIME_AUTHORITY_STATUS, 'Runtime Evidence Authority')
    if (runtimeAuthority.runtimeEvidenceAuthorityStatus !== 'preview-only-not-satisfied') {
      throw new Error('Runtime Evidence Authority input must be preview-only-not-satisfied.')
    }
  }

  const evidenceCheckBinding = optionalSources.find((entry) => entry.kind === 'evidenceCheckBinding')?.record
  if (evidenceCheckBinding) {
    validateRoleStatus(
      evidenceCheckBinding,
      EVIDENCE_CHECK_BINDING_ROLE,
      EVIDENCE_CHECK_BINDING_STATUS,
      'Evidence Check Binding',
    )
    if (evidenceCheckBinding.evidenceCheckBindingStatus !== 'preview-only-not-satisfied') {
      throw new Error('Evidence Check Binding input must be preview-only-not-satisfied.')
    }
  }

  const outputRequirement = optionalSources.find((entry) => entry.kind === 'outputRequirement')?.record
  if (outputRequirement) {
    validateRoleStatus(outputRequirement, OUTPUT_REQUIREMENT_ROLE, OUTPUT_REQUIREMENT_STATUS, 'Output Requirement')
    if (outputRequirement.outputRequirementStatus !== 'preview-only-not-satisfied') {
      throw new Error('Output Requirement input must be preview-only-not-satisfied.')
    }
  }
}

function validateRoleStatus(record: JsonRecord, role: string, status: string, label: string): void {
  if (record.artifactRole !== role || record.status !== status) {
    throw new Error(`Unsafe ${label} input: expected ${role}/${status}.`)
  }
}

function findRequiredEvidence(record: JsonRecord, id: string): JsonRecord | null {
  const entries = Array.isArray(record.requiredEvidence) ? record.requiredEvidence : []
  return entries.find((entry): entry is JsonRecord => asRecord(entry)?.id === id) as JsonRecord | null
}

function summarizeRequirement(requirement: JsonRecord): RuntimeEvidenceRequirementSummary {
  if (requirement.runtimeEvidenceSatisfied !== false) {
    throw new Error('Runtime Evidence obligation is unsafe: runtimeEvidenceSatisfied must be false.')
  }
  if (requirement.acceptedEvidence === true || requirement.evidenceAccepted === true) {
    throw new Error('Runtime Evidence obligation is unsafe: accepted/evidence flags must not be true.')
  }
  return {
    id: stringValue(requirement.id),
    sourceEvidenceId: stringValue(requirement.sourceEvidenceId) || null,
    evidenceType: stringValue(requirement.evidenceType) || null,
    artifact: stringValue(requirement.artifact) || null,
    sourceStatus: stringValue(requirement.sourceStatus) || null,
    runtimeEvidenceSatisfied: false,
    acceptedEvidence: false,
  }
}

function matchAcceptedEvidenceToRequirement(
  acceptedEvidence: JsonRecord,
  requirement: RuntimeEvidenceRequirementSummary,
): { matched: boolean; finding?: RuntimeEvidenceSatisfactionReadinessFinding } {
  const sourcePath = stringValue(acceptedEvidence.sourceEvidenceArtifact)
  const evidenceKind = stringValue(acceptedEvidence.evidenceKind)
  const claimText = [stringValue(acceptedEvidence.evidenceClaim), ...stringArray(acceptedEvidence.acceptedClaims)].join(
    '\n',
  )

  const sourcePathMatches = Boolean(
    requirement.artifact && normalizePath(sourcePath) === normalizePath(requirement.artifact),
  )
  const kindMatches = Boolean(
    requirement.evidenceType &&
      (evidenceKind === requirement.evidenceType || evidenceKind === `${requirement.evidenceType}-candidate`),
  )
  const claimMentionsRequirement =
    claimText.includes(requirement.id) ||
    Boolean(requirement.sourceEvidenceId && claimText.includes(requirement.sourceEvidenceId)) ||
    Boolean(requirement.artifact && claimText.includes(requirement.artifact))

  if (sourcePathMatches || (kindMatches && claimMentionsRequirement) || (sourcePathMatches && kindMatches)) {
    return { matched: true }
  }
  return {
    matched: false,
    finding: {
      code: 'RUNTIME_EVIDENCE_OBLIGATION_MISMATCH',
      severity: 'warning',
      field: 'requiredEvidence',
      expected: {
        id: requirement.id,
        sourceEvidenceId: requirement.sourceEvidenceId,
        evidenceType: requirement.evidenceType,
        artifact: requirement.artifact,
      },
      actual: {
        evidenceKind,
        sourceEvidenceArtifact: sourcePath,
        evidenceClaim: stringValue(acceptedEvidence.evidenceClaim),
      },
      message:
        'Accepted Evidence does not conservatively match the selected runtime Evidence obligation. This report remains readiness-blocked and does not satisfy runtime Evidence.',
    },
  }
}

function missingRequirementFinding(requiredEvidenceId: string): RuntimeEvidenceSatisfactionReadinessFinding {
  return {
    code: 'RUNTIME_EVIDENCE_OBLIGATION_MISSING',
    severity: 'error',
    field: 'requiredEvidenceId',
    expected: requiredEvidenceId,
    message: 'Instruction Pack does not contain the requested required Evidence obligation.',
  }
}

function validateNoUnsafeAuthority(record: JsonRecord, label: string, allowedTrueFields = new Set<string>()): void {
  const hits = collectUnsafeAuthorityHits(record, [], new Set(), allowedTrueFields)
  if (hits.length > 0) {
    const first = hits[0]
    throw new Error(`Unsafe ${label}: ${first.field} must not be true for runtime Evidence satisfaction readiness.`)
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

async function assertRuntimeEvidenceSatisfactionOutputAuthority(
  root: string,
  input: {
    acceptedEvidence: JsonRecord
    resolvedAcceptedEvidencePath: string
    instructionPack: JsonRecord
    resolvedInstructionPackPath: string
    optionalSources: OptionalSourceSummary[]
    output?: string
    markdown?: string
  },
): Promise<void> {
  const resolvedOutputPath = input.output ? resolveRepoPath(root, input.output) : undefined
  const resolvedMarkdownPath = input.markdown ? resolveRepoPath(root, input.markdown) : undefined
  if (resolvedOutputPath && resolvedMarkdownPath && pathKey(resolvedOutputPath) === pathKey(resolvedMarkdownPath)) {
    throw new Error(
      'Runtime Evidence satisfaction readiness output is unsafe: --output and --markdown must be different paths.',
    )
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
        `Runtime Evidence satisfaction readiness ${label} path is unsafe: ${requested} would overwrite ${protectedReason}.`,
      )
    }
    if (isProtectedControlPath(root, resolved)) {
      throw new Error(
        `Runtime Evidence satisfaction readiness ${label} path is unsafe: ${requested} is inside a protected source/control path.`,
      )
    }
    const existingAuthority = await classifyExistingSourceAuthority(resolved)
    if (existingAuthority) {
      throw new Error(
        `Runtime Evidence satisfaction readiness ${label} path is unsafe: ${requested} already contains ${existingAuthority}. Choose a dedicated readiness output path.`,
      )
    }
  }
}

function buildProtectedPathMap(
  root: string,
  input: {
    acceptedEvidence: JsonRecord
    resolvedAcceptedEvidencePath: string
    instructionPack: JsonRecord
    resolvedInstructionPackPath: string
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

  addResolved(input.resolvedAcceptedEvidencePath, 'the source Accepted Evidence Record')
  addResolved(input.resolvedInstructionPackPath, 'the source Instruction Pack')
  for (const optionalSource of input.optionalSources) {
    addResolved(resolveRepoPath(root, optionalSource.relativePath), `the source ${optionalSource.kind} artifact`)
  }
  for (const source of [
    input.acceptedEvidence,
    input.instructionPack,
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
  if (!artifactRole || artifactRole === READINESS_ROLE) {
    return null
  }
  if (
    artifactRole.includes('evidence') ||
    artifactRole.includes('graph-source') ||
    artifactRole.includes('read-model') ||
    artifactRole.includes('source-authority') ||
    [
      'instruction-pack',
      'contract-compiler-input',
      'devview-accepted-evidence-record',
      'runtime-evidence-authority-preview',
      'evidence-check-binding-preview',
      'output-requirement-for-test-evidence-preview',
      'devview-graph-delta-apply-report',
      'graph-delta-proposal-only-preview',
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

export function renderRuntimeEvidenceSatisfactionReadinessMarkdown(
  readiness: RuntimeEvidenceSatisfactionReadinessPreview,
): string {
  return `# DevView Runtime Evidence Satisfaction Binding Readiness

Status: \`${readiness.status}\`

| Field                             | Value                                  |
| --------------------------------- | -------------------------------------- |
| Readiness                         | \`${readiness.runtimeEvidenceSatisfactionReadinessStatus}\` |
| Required Evidence ID              | \`${readiness.requiredEvidenceId}\`               |
| Binding match                     | \`${readiness.bindingMatchStatus}\`                          |
| Source Accepted Evidence accepted | \`${readiness.sourceAcceptedEvidenceAccepted}\`                                 |
| Top-level evidence accepted       | \`${readiness.evidenceAccepted}\`                                |
| Runtime Evidence satisfied        | \`${readiness.runtimeEvidenceSatisfied}\`                                |
| Equivalence proven                | \`${readiness.equivalenceProven}\`                                |
| Scope enforced                    | \`${readiness.scopeEnforced}\`                                |
| CI enforcement enabled            | \`${readiness.ciEnforcementEnabled}\`                                |

## Matched Obligation

${readiness.matchedRequiredEvidence ? `- ${readiness.matchedRequiredEvidence.id}: ${readiness.matchedRequiredEvidence.artifact ?? 'no artifact'}` : '- None'}

## Safety Boundary

- This is readiness-only.
- It does not promote runtime Evidence to satisfied.
- It does not create a satisfaction record, prove equivalence, enforce scope, configure CI, apply graph deltas, mutate graph-source, automate approval, or replace user acceptance.
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
    hasDevViewControlDirectory(relative) ||
    hasCodexControlDirectory(relative) ||
    hasHiddenControlDirectorySegment(relative) ||
    /\.codex\/hooks/i.test(relative) ||
    /(^|\/)(graph-source|source-authority|project-memory)(\.|-)/i.test(relative)
  )
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
