import path from 'node:path'
import { readJsonSafe, relativePath, writeJsonAtomic, writeTextAtomic } from './fs.js'
import {
  reviseRequestIrCandidateFromClarificationAnswers,
  type RequestIrCandidateRevisionFinding,
  type RequestIrCandidateRevisionResult,
} from './request-ir-candidate-reviser.js'
import {
  validateRequestIrCandidateSchemaOnly,
  type RequestIrCandidateValidationFinding,
  type RequestIrCandidateValidationResult,
} from './request-ir-candidate-validator.js'
import type { IssueSeverity } from './types.js'

const REPORTER_NAME = 'ClarificationRuntimeChainReporter'
const REPORT_ROLE = 'devview-clarification-runtime-chain-report'
const REPORT_STATUS = 'devview-clarification-runtime-chain-report-generated'

type JsonRecord = Record<string, unknown>

export interface ClarificationRuntimeChainOptions {
  clarificationPack: string
  answers: string
  revisedCandidateOutput: string
  validationOutput: string
  output: string
  markdown?: string
}

export interface ClarificationRuntimeChainFinding {
  code: string
  severity: IssueSeverity
  field?: string
  message: string
  expected?: unknown
  actual?: unknown
  suggestedFix?: string
}

export interface ClarificationRuntimeChainReport {
  schemaVersion: 1
  artifactRole: typeof REPORT_ROLE
  status: typeof REPORT_STATUS | 'devview-clarification-runtime-chain-report-blocked'
  reporterName: typeof REPORTER_NAME
  chainScope: 'clarification-answers-to-revised-request-ir-schema-validation-only'
  sourceClarificationInterviewPack: string
  sourceClarificationAnswers: string
  sourceOriginalRequestIrCandidate: string
  revisedCandidateOutputPath: string
  schemaValidationOutputPath: string
  questionCount: number
  revisionMode: 'no-op-revision' | 'answer-applied-revision' | 'revision-blocked'
  revisionStatus: RequestIrCandidateRevisionResult['revisionStatus']
  revisedCandidateGenerated: boolean
  schemaValidationExecuted: boolean
  schemaValidationStatus: RequestIrCandidateValidationResult['schemaValidationStatus'] | 'not-run'
  requestIrValidationStatus: RequestIrCandidateValidationResult['requestIrValidationStatus'] | 'not-run'
  graphAwareValidationExecuted: false
  graphTraversalExecuted: false
  selectedGraphSliceGenerated: false
  contractInputGenerated: false
  instructionPackGenerated: false
  codexExecutionTriggered: false
  graphSourceMutated: false
  graphDeltaApplied: false
  approvalRecorded: false
  approvalStatus: 'not-approved'
  humanDecisionRecorded: false
  runtimeEvidenceSatisfied: false
  evidenceAccepted: false
  equivalenceProven: false
  scopeEnforced: false
  ciEnforcementEnabled: false
  humanReviewRequired: true
  revisionFindings: RequestIrCandidateRevisionFinding[]
  schemaValidationFindings: RequestIrCandidateValidationFinding[]
  validationFindings: ClarificationRuntimeChainFinding[]
  outputWritePolicy: 'explicit-output-only'
  writtenOutputPath: string | null
  markdownReportPath: string | null
  writtenOutputPathAuthorityStatus: 'not-written' | 'explicit-chain-output-not-source-authority'
  markdownReportAuthorityStatus: 'not-written' | 'explicit-chain-output-not-source-authority'
  nonExecutionBoundary: string
}

export interface ClarificationRuntimeChainFileResult {
  report: ClarificationRuntimeChainReport
  revisedCandidateOutput?: string
  validationOutput?: string
  outputPath?: string
  markdownReport?: string
}

interface LoadedInputs {
  pack: JsonRecord
  answers: JsonRecord
  originalCandidate: JsonRecord
  resolvedPackPath: string
  resolvedAnswersPath: string
  resolvedOriginalCandidatePath: string
}

export async function runClarificationRuntimeChainFile(
  root: string,
  options: ClarificationRuntimeChainOptions,
): Promise<ClarificationRuntimeChainFileResult> {
  validateRequiredOptions(options)
  const inputs = await loadInputs(root, options)
  await assertOutputAuthority(root, inputs, options)

  const revisedCandidateOutput = relativePath(root, resolveRepoPath(root, options.revisedCandidateOutput))
  const validationOutput = relativePath(root, resolveRepoPath(root, options.validationOutput))
  const outputPath = relativePath(root, resolveRepoPath(root, options.output))
  const markdownReport = options.markdown ? relativePath(root, resolveRepoPath(root, options.markdown)) : undefined

  const revision = reviseRequestIrCandidateFromClarificationAnswers(
    inputs.pack,
    inputs.answers,
    inputs.originalCandidate,
    {
      root,
      packPath: relativePath(root, inputs.resolvedPackPath),
      answersPath: relativePath(root, inputs.resolvedAnswersPath),
      originalCandidatePath: relativePath(root, inputs.resolvedOriginalCandidatePath),
      outputPath: revisedCandidateOutput,
    },
  )

  const questionCount = numberValue(inputs.pack.questionCount)
  const revisionBlocked =
    revision.status !== 'request-ir-candidate-revision-generated' ||
    !revision.revisedCandidateGenerated ||
    !revision.revisedCandidate
  if (revisionBlocked) {
    return {
      report: buildReport({
        root,
        inputs,
        revision,
        questionCount,
        revisedCandidateOutput,
        validationOutput,
        outputPath: null,
        markdownReport: null,
        validation: null,
      }),
    }
  }

  const validation = validateRequestIrCandidateSchemaOnly(revision.revisedCandidate, revisedCandidateOutput)
  validation.writtenOutputPath = validationOutput
  validation.writtenOutputPathAuthorityStatus = 'explicit-preview-output-not-graph-source'

  await writeJsonAtomic(resolveRepoPath(root, options.revisedCandidateOutput), revision.revisedCandidate)
  await writeJsonAtomic(resolveRepoPath(root, options.validationOutput), validation)

  const report = buildReport({
    root,
    inputs,
    revision,
    questionCount,
    revisedCandidateOutput,
    validationOutput,
    outputPath,
    markdownReport: null,
    validation,
  })

  await writeJsonAtomic(resolveRepoPath(root, options.output), report)

  if (options.markdown) {
    report.markdownReportPath = markdownReport ?? null
    report.markdownReportAuthorityStatus = 'explicit-chain-output-not-source-authority'
    await writeTextAtomic(resolveRepoPath(root, options.markdown), renderClarificationRuntimeChainMarkdown(report))
    await writeJsonAtomic(resolveRepoPath(root, options.output), report)
  }

  return {
    report,
    revisedCandidateOutput,
    validationOutput,
    outputPath,
    ...(markdownReport ? { markdownReport } : {}),
  }
}

function validateRequiredOptions(options: ClarificationRuntimeChainOptions): void {
  if (!options.clarificationPack) {
    throw new Error('run-clarification-chain requires --clarification-pack <packPath>.')
  }
  if (!options.answers) {
    throw new Error('run-clarification-chain requires --answers <answersPath>.')
  }
  if (!options.revisedCandidateOutput) {
    throw new Error('run-clarification-chain requires --revised-candidate-output <candidatePath>.')
  }
  if (!options.validationOutput) {
    throw new Error('run-clarification-chain requires --validation-output <validationPath>.')
  }
  if (!options.output) {
    throw new Error('run-clarification-chain requires --output <chainReportPath>.')
  }
}

async function loadInputs(root: string, options: ClarificationRuntimeChainOptions): Promise<LoadedInputs> {
  const resolvedPackPath = resolveRepoPath(root, options.clarificationPack)
  const pack = await readJsonSafe<JsonRecord>(resolvedPackPath)
  if (!pack.ok) {
    throw new Error(`Unable to read Clarification Interview Pack from ${options.clarificationPack}: ${pack.error}`)
  }
  const packRecord = requireRecord(pack.value, 'Clarification Interview Pack')

  const resolvedAnswersPath = resolveRepoPath(root, options.answers)
  const answers = await readJsonSafe<JsonRecord>(resolvedAnswersPath)
  if (!answers.ok) {
    throw new Error(`Unable to read clarification answers from ${options.answers}: ${answers.error}`)
  }
  const answersRecord = requireRecord(answers.value, 'clarification answers')

  const sourceCandidatePath = stringValue(packRecord.sourceRequestIrCandidate)
  if (!sourceCandidatePath) {
    throw new Error('Clarification Interview Pack does not include sourceRequestIrCandidate.')
  }
  const resolvedOriginalCandidatePath = resolveRepoPath(root, sourceCandidatePath)
  const originalCandidate = await readJsonSafe<JsonRecord>(resolvedOriginalCandidatePath)
  if (!originalCandidate.ok) {
    throw new Error(
      `Unable to read original Request IR Candidate from ${sourceCandidatePath}: ${originalCandidate.error}`,
    )
  }

  return {
    pack: packRecord,
    answers: answersRecord,
    originalCandidate: requireRecord(originalCandidate.value, 'original Request IR Candidate'),
    resolvedPackPath,
    resolvedAnswersPath,
    resolvedOriginalCandidatePath,
  }
}

async function assertOutputAuthority(
  root: string,
  inputs: LoadedInputs,
  options: ClarificationRuntimeChainOptions,
): Promise<void> {
  const outputs = [
    { label: 'revised candidate output', path: options.revisedCandidateOutput, allowedRole: 'request-ir-candidate' },
    {
      label: 'schema validation output',
      path: options.validationOutput,
      allowedRole: 'request-ir-candidate-schema-only-validation',
    },
    { label: 'chain report output', path: options.output, allowedRole: REPORT_ROLE },
    ...(options.markdown ? [{ label: 'chain Markdown report', path: options.markdown, allowedRole: null }] : []),
  ]
  const seen = new Map<string, string>()
  for (const output of outputs) {
    const resolved = resolveRepoPath(root, output.path)
    const key = pathKey(resolved)
    const existing = seen.get(key)
    if (existing) {
      throw new Error(`Clarification runtime chain output path is unsafe: ${output.path} collides with ${existing}.`)
    }
    seen.set(key, output.label)
  }

  const protectedPaths = buildProtectedOutputPathMap(root, inputs)
  for (const output of outputs) {
    const resolved = resolveRepoPath(root, output.path)
    const protectedReason = protectedPaths.get(pathKey(resolved))
    if (protectedReason) {
      throw new Error(
        `Clarification runtime chain output path is unsafe: ${output.path} would overwrite ${protectedReason}.`,
      )
    }
    const sourcePathReason = classifyReservedSourcePath(resolved)
    if (sourcePathReason) {
      throw new Error(`Clarification runtime chain output path is unsafe: ${output.path} targets ${sourcePathReason}.`)
    }
    const existingAuthority = await classifyExistingSourceAuthority(resolved, output.allowedRole)
    if (existingAuthority) {
      throw new Error(
        `Clarification runtime chain output path is unsafe: ${output.path} already contains ${existingAuthority}.`,
      )
    }
  }
}

function buildProtectedOutputPathMap(root: string, inputs: LoadedInputs): Map<string, string> {
  const protectedPaths = new Map<string, string>()
  protectedPaths.set(pathKey(inputs.resolvedPackPath), 'the source Clarification Interview Pack')
  protectedPaths.set(pathKey(inputs.resolvedAnswersPath), 'the source clarification answers artifact')
  protectedPaths.set(pathKey(inputs.resolvedOriginalCandidatePath), 'the source original Request IR Candidate')

  const add = (candidatePath: string, reason: string): void => {
    if (!isConcreteOutputProtectedPath(candidatePath)) {
      return
    }
    const key = pathKey(resolveRepoPath(root, candidatePath))
    if (!protectedPaths.has(key)) {
      protectedPaths.set(key, reason)
    }
  }

  for (const linkedPath of collectConcretePathStrings(inputs.pack)) {
    add(linkedPath, `linked Clarification Interview Pack artifact ${linkedPath}`)
  }
  for (const linkedPath of collectConcretePathStrings(inputs.answers)) {
    add(linkedPath, `linked clarification answers artifact ${linkedPath}`)
  }
  for (const linkedPath of collectConcretePathStrings(inputs.originalCandidate)) {
    add(linkedPath, `linked original Request IR Candidate artifact ${linkedPath}`)
  }
  return protectedPaths
}

async function classifyExistingSourceAuthority(filePath: string, allowedRole: string | null): Promise<string | null> {
  const parsed = await readJsonSafe<JsonRecord>(filePath)
  if (!parsed.ok) {
    return null
  }
  const record = asRecord(parsed.value)
  if (!record) {
    return null
  }
  const artifactRole = stringValue(record.artifactRole)
  if (allowedRole && artifactRole === allowedRole) {
    return null
  }
  if (artifactRole.includes('graph-source')) {
    return `graph-source artifactRole "${artifactRole}"`
  }
  const blockedRoles = new Set([
    'clarification-interview-pack',
    'clarification-answers-preview',
    'request-ir-candidate-calibration-fixture-preview',
    'request-ir-candidate-schema-preview',
    'selected-graph-slice',
    'graph-traversal-plan',
    'contract-compiler-input',
    'instruction-pack',
  ])
  if (blockedRoles.has(artifactRole)) {
    return `selected source/frontend artifactRole "${artifactRole}"`
  }
  if (asRecord(record.sourceRecords)) {
    return 'graph-source-shaped sourceRecords'
  }
  if (asRecord(record.taxonomy) && (Array.isArray(record.nodes) || Array.isArray(record.edges))) {
    return 'generated read-model source-authority projection'
  }
  return null
}

function classifyReservedSourcePath(filePath: string): string | null {
  const normalized = path.resolve(filePath).replaceAll('\\', '/').toLowerCase()
  if (normalized.endsWith('/graph-source.json')) {
    return 'graph-source path'
  }
  if (normalized.includes('/.pbe/evidence/')) {
    return 'evidence authority path'
  }
  if (normalized.includes('/.pbe/control/') || normalized.includes('/.pbe/tree/')) {
    return 'PBE source/control path'
  }
  if (
    normalized.endsWith('/generated/generated-read-model.json') ||
    normalized.endsWith('/generated/graph-source-read-model-projection.json')
  ) {
    return 'generated read-model source authority path'
  }
  return null
}

function buildReport(options: {
  root: string
  inputs: LoadedInputs
  revision: RequestIrCandidateRevisionResult
  questionCount: number
  revisedCandidateOutput: string
  validationOutput: string
  outputPath: string | null
  markdownReport: string | null
  validation: RequestIrCandidateValidationResult | null
}): ClarificationRuntimeChainReport {
  const schemaBlocked =
    options.validation?.requestIrValidationStatus === 'validation-blocked' ||
    options.revision.status === 'request-ir-candidate-revision-blocked'
  const chainFindings: ClarificationRuntimeChainFinding[] = [
    ...options.revision.validationFindings.map((finding) => ({
      code: finding.code,
      severity: finding.severity,
      field: finding.field,
      message: finding.message,
      expected: finding.expected,
      actual: finding.actual,
      suggestedFix: finding.suggestedFix,
    })),
    ...(options.validation?.validationFindings.map((finding) => ({
      code: finding.code,
      severity: finding.severity,
      field: finding.field,
      message: finding.message,
      expected: finding.expected,
      actual: finding.actual,
      suggestedFix: finding.suggestedFix,
    })) ?? []),
  ]
  const revisionMode =
    options.revision.revisionStatus === 'revision-blocked'
      ? 'revision-blocked'
      : options.revision.appliedAnswerCount > 0
        ? 'answer-applied-revision'
        : 'no-op-revision'

  return {
    schemaVersion: 1,
    artifactRole: REPORT_ROLE,
    status: schemaBlocked ? 'devview-clarification-runtime-chain-report-blocked' : REPORT_STATUS,
    reporterName: REPORTER_NAME,
    chainScope: 'clarification-answers-to-revised-request-ir-schema-validation-only',
    sourceClarificationInterviewPack: relativePath(options.root, options.inputs.resolvedPackPath),
    sourceClarificationAnswers: relativePath(options.root, options.inputs.resolvedAnswersPath),
    sourceOriginalRequestIrCandidate: relativePath(options.root, options.inputs.resolvedOriginalCandidatePath),
    revisedCandidateOutputPath: options.revisedCandidateOutput,
    schemaValidationOutputPath: options.validationOutput,
    questionCount: options.questionCount,
    revisionMode,
    revisionStatus: options.revision.revisionStatus,
    revisedCandidateGenerated: options.revision.revisedCandidateGenerated,
    schemaValidationExecuted: options.validation !== null,
    schemaValidationStatus: options.validation?.schemaValidationStatus ?? 'not-run',
    requestIrValidationStatus: options.validation?.requestIrValidationStatus ?? 'not-run',
    graphAwareValidationExecuted: false,
    graphTraversalExecuted: false,
    selectedGraphSliceGenerated: false,
    contractInputGenerated: false,
    instructionPackGenerated: false,
    codexExecutionTriggered: false,
    graphSourceMutated: false,
    graphDeltaApplied: false,
    approvalRecorded: false,
    approvalStatus: 'not-approved',
    humanDecisionRecorded: false,
    runtimeEvidenceSatisfied: false,
    evidenceAccepted: false,
    equivalenceProven: false,
    scopeEnforced: false,
    ciEnforcementEnabled: false,
    humanReviewRequired: true,
    revisionFindings: options.revision.validationFindings,
    schemaValidationFindings: options.validation?.validationFindings ?? [],
    validationFindings: chainFindings,
    outputWritePolicy: 'explicit-output-only',
    writtenOutputPath: options.outputPath,
    markdownReportPath: options.markdownReport,
    writtenOutputPathAuthorityStatus: options.outputPath ? 'explicit-chain-output-not-source-authority' : 'not-written',
    markdownReportAuthorityStatus: options.markdownReport
      ? 'explicit-chain-output-not-source-authority'
      : 'not-written',
    nonExecutionBoundary:
      'This clarification runtime chain runs only deterministic clarification revision and schema-only Request IR validation. It does not call an LLM/API, run graph-aware validation, run graph traversal, generate selected slices, generate contract input, generate instruction packs, trigger Codex execution, mutate graph-source, apply graph deltas, record approval, satisfy or accept Evidence, prove equivalence, enforce scope, or configure CI.',
  }
}

export function renderClarificationRuntimeChainMarkdown(report: ClarificationRuntimeChainReport): string {
  const lines = [
    '# Clarification Runtime Chain',
    '',
    `Status: ${report.status}`,
    `Revision mode: ${report.revisionMode}`,
    `Questions: ${report.questionCount}`,
    `Schema validation: ${report.requestIrValidationStatus}`,
    '',
    '## Artifacts',
    '',
    ...renderMarkdownTable(
      ['Stage', 'Artifact', 'Status', 'Authority'],
      [
        ['Clarification pack', report.sourceClarificationInterviewPack, 'source', 'question-plan only'],
        ['Answers', report.sourceClarificationAnswers, 'source', 'clarification answer only, not approval'],
        ['Revised candidate', report.revisedCandidateOutputPath, report.revisionStatus, 'candidate-only'],
        [
          'Schema validation',
          report.schemaValidationOutputPath,
          report.requestIrValidationStatus,
          'graph validation not run',
        ],
      ],
    ),
    '',
    '## Boundaries',
    '',
    '- Graph-aware validation was not run.',
    '- Graph traversal, selected slice generation, contract input generation, and instruction pack generation were not run.',
    '- Codex execution, graph-source mutation, graph delta apply, approval, Evidence acceptance, runtime Evidence satisfaction, equivalence proof, scope enforcement, and CI enforcement remain disabled.',
    '- Human review remains required before any future graph-aware validation or downstream action.',
  ]
  if (report.validationFindings.length > 0) {
    lines.push('', '## Findings', '')
    for (const finding of report.validationFindings) {
      lines.push(`- ${finding.severity}: ${finding.code} - ${finding.message}`)
    }
  }
  return `${lines.join('\n')}\n`
}

function renderMarkdownTable(headers: string[], rows: string[][]): string[] {
  const widths = headers.map((header, index) =>
    Math.max(header.length, ...rows.map((row) => (row[index] ?? '').length)),
  )
  const renderRow = (row: string[]): string =>
    `| ${row.map((cell, index) => cell.padEnd(widths[index] ?? cell.length)).join(' | ')} |`
  return [renderRow(headers), `| ${widths.map((width) => '-'.repeat(width)).join(' | ')} |`, ...rows.map(renderRow)]
}

function requireRecord(value: unknown, label: string): JsonRecord {
  const record = asRecord(value)
  if (!record) {
    throw new Error(`${label} must be a JSON object.`)
  }
  return record
}

function collectConcretePathStrings(value: unknown): string[] {
  const paths: string[] = []
  const visit = (entry: unknown): void => {
    if (typeof entry === 'string') {
      if (isConcreteOutputProtectedPath(entry)) {
        paths.push(entry)
      }
      return
    }
    if (Array.isArray(entry)) {
      for (const item of entry) {
        visit(item)
      }
      return
    }
    const record = asRecord(entry)
    if (!record) {
      return
    }
    for (const item of Object.values(record)) {
      visit(item)
    }
  }
  visit(value)
  return [...new Set(paths)]
}

function isConcreteOutputProtectedPath(candidatePath: string): boolean {
  const normalized = candidatePath.replaceAll('\\', '/')
  return (
    Boolean(normalized) &&
    !normalized.startsWith('unresolved:') &&
    normalized !== '<in-memory>' &&
    !normalized.includes('<') &&
    !normalized.includes('\n') &&
    (normalized.includes('/') || normalized.startsWith('.')) &&
    /\.(json|md|txt)$/i.test(normalized)
  )
}

function asRecord(value: unknown): JsonRecord | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return null
  }
  return value as JsonRecord
}

function stringValue(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

function numberValue(value: unknown): number {
  return typeof value === 'number' ? value : 0
}

function resolveRepoPath(root: string, inputPath: string): string {
  return path.isAbsolute(inputPath) ? inputPath : path.resolve(root, inputPath)
}

function pathKey(filePath: string): string {
  return path.resolve(filePath).replaceAll('\\', '/').toLowerCase()
}
