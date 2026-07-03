import path from 'node:path'
import { readJsonSafe, relativePath, writeJsonAtomic } from './fs.js'
import { validateRequestIrCandidateSchemaOnly } from './request-ir-candidate-validator.js'
import type { IssueSeverity } from './types.js'

const ANALYZER_NAME = 'AiRequestAnalyzerCommandSurface'
const EXPECTED_PACK_ROLE = 'ai-request-analyzer-pack'
const EXPECTED_PACK_STATUS = 'ai-request-analyzer-pack-generated'
const COMPATIBLE_SCHEMA_ID = 'devview-request-ir-candidate-v0-preview'

type JsonRecord = Record<string, unknown>

const UNSAFE_TRUE_FIELDS = new Set([
  'graphTraversalAllowed',
  'contractGenerationAllowed',
  'instructionPackGenerationAllowed',
  'graphSourceMutated',
  'graphDeltaApplied',
  'humanDecisionRecorded',
  'equivalenceProven',
  'runtimeEvidenceSatisfied',
  'scopeEnforced',
  'ciEnforcementEnabled',
  'selectedGraphSliceGenerated',
  'contractInputGenerated',
  'contractCompilerInputGenerated',
  'instructionPackGenerated',
  'codexExecutionTriggered',
])

export interface AiRequestAnalyzerRunFinding {
  code: string
  severity: IssueSeverity
  field?: string
  message: string
  expected?: unknown
  actual?: unknown
  suggestedFix?: string
}

export interface AiRequestAnalyzerRunResult {
  schemaVersion: 1
  artifactRole: 'ai-request-analyzer-run-result'
  status:
    | 'ai-request-analyzer-provider-disabled'
    | 'ai-request-analyzer-external-candidate-imported'
    | 'ai-request-analyzer-external-candidate-blocked'
  analyzerName: typeof ANALYZER_NAME
  runScope: 'provider-disabled-or-external-candidate-import-no-llm'
  sourceAiRequestAnalyzerPack: string
  sourceExternalCandidate: string | null
  requestText: string
  analyzerProviderStatus:
    | 'provider-disabled'
    | 'external-candidate-imported-provider-not-invoked'
    | 'external-candidate-blocked-provider-not-invoked'
  analyzerProviderConfigured: false
  llmInvoked: false
  networkCallsAllowed: false
  runtimeAiCallsAllowed: false
  requestIrCandidateGenerated: boolean
  requestIrCandidateImported: boolean
  candidateImportRequired: boolean
  candidateOnly: true
  candidateAuthorityStatus: 'ai-generated-candidate-not-validated'
  requestIrAuthorityStatus: 'not-authoritative-until-validated'
  validationRequiredBeforeTraversal: true
  graphTraversalAllowed: false
  graphTraversalExecuted: false
  selectedGraphSliceGenerated: false
  contractInputGenerated: false
  instructionPackGenerated: false
  codexExecutionTriggered: false
  graphSourceMutated: false
  graphDeltaApplied: false
  approvalStatus: 'not-approved'
  humanDecisionRecorded: false
  runtimeEvidenceSatisfied: false
  equivalenceProven: false
  scopeEnforced: false
  ciEnforcementEnabled: false
  validationFindings: AiRequestAnalyzerRunFinding[]
  importedCandidate?: JsonRecord
  outputWritePolicy: 'explicit-output-only'
  writtenOutputPath: string | null
  writtenOutputArtifactRole: 'ai-request-analyzer-run-result' | 'request-ir-candidate' | null
  writtenOutputPathAuthorityStatus: 'not-written-stdout-only' | 'explicit-preview-output-not-source-authority'
  nonExecutionBoundary: string
}

export interface AiRequestAnalyzerRunFileResult {
  result: AiRequestAnalyzerRunResult
  outputPath?: string
}

interface AnalyzeRequestPaths {
  root?: string
  packPath?: string
  externalCandidatePath?: string
  outputPath?: string
}

export function analyzeRequestWithDisabledProvider(
  requestText: string,
  analyzerPackArtifact: unknown,
  externalCandidateArtifact?: unknown,
  paths: AnalyzeRequestPaths = {},
): AiRequestAnalyzerRunResult {
  const pack = asRecord(analyzerPackArtifact)
  const externalCandidate = externalCandidateArtifact === undefined ? null : asRecord(externalCandidateArtifact)
  const findings: AiRequestAnalyzerRunFinding[] = []

  validateRequestText(requestText, findings)
  validateAnalyzerPack(pack, findings)

  if (!externalCandidateArtifact) {
    findings.push({
      code: 'AI_REQUEST_ANALYZER_PROVIDER_DISABLED',
      severity: 'error',
      field: 'externalCandidate',
      message:
        'AI Request Analyzer provider execution is disabled in this implementation; import an explicit external candidate instead.',
      expected: '--external-candidate <path>',
      actual: null,
      suggestedFix:
        'Provide --external-candidate with a precomputed Request IR Candidate, or enable a future trusted provider adapter in a separate task.',
    })
    return buildResult(requestText, paths, findings, undefined)
  }

  if (!externalCandidate) {
    findings.push({
      code: 'AI_REQUEST_EXTERNAL_CANDIDATE_NOT_OBJECT',
      severity: 'error',
      field: 'externalCandidate',
      message: 'External Request IR Candidate import requires a JSON object.',
    })
    return buildResult(requestText, paths, findings, undefined)
  }

  validateExternalCandidateAgainstRequest(externalCandidate, requestText, pack, findings)
  validateExternalCandidateAuthority(externalCandidate, findings)
  validateExternalCandidateSchema(externalCandidate, findings)

  const blocked = findings.some((finding) => finding.severity === 'error')
  return buildResult(
    requestText,
    paths,
    findings,
    blocked ? undefined : buildImportedCandidate(requestText, pack, externalCandidate, paths),
  )
}

export async function analyzeRequestFile(
  root: string,
  requestText: string,
  packPath: string,
  options: { externalCandidate?: string; output?: string } = {},
): Promise<AiRequestAnalyzerRunFileResult> {
  const resolvedPackPath = resolveRepoPath(root, packPath)
  const pack = await readJsonSafe<JsonRecord>(resolvedPackPath)
  if (!pack.ok) {
    throw new Error(`Unable to read AI Request Analyzer Pack from ${packPath}: ${pack.error}`)
  }

  let externalCandidate: JsonRecord | undefined
  let resolvedExternalCandidatePath: string | undefined
  if (options.externalCandidate) {
    resolvedExternalCandidatePath = resolveRepoPath(root, options.externalCandidate)
    const parsedCandidate = await readJsonSafe<JsonRecord>(resolvedExternalCandidatePath)
    if (!parsedCandidate.ok) {
      throw new Error(
        `Unable to read external Request IR Candidate from ${options.externalCandidate}: ${parsedCandidate.error}`,
      )
    }
    externalCandidate = parsedCandidate.value
  }

  if (options.output) {
    await assertAnalyzerRunOutputAuthority(
      root,
      resolvedPackPath,
      resolvedExternalCandidatePath,
      pack.value,
      externalCandidate,
      options.output,
    )
  }

  const outputPath = options.output ? relativePath(root, resolveRepoPath(root, options.output)) : undefined
  const result = analyzeRequestWithDisabledProvider(requestText, pack.value, externalCandidate, {
    root,
    packPath: relativePath(root, resolvedPackPath),
    externalCandidatePath: resolvedExternalCandidatePath
      ? relativePath(root, resolvedExternalCandidatePath)
      : undefined,
    outputPath,
  })

  let writtenOutputPath: string | undefined
  if (options.output) {
    const resolvedOutputPath = resolveRepoPath(root, options.output)
    if (result.importedCandidate) {
      await writeJsonAtomic(resolvedOutputPath, result.importedCandidate)
      writtenOutputPath = outputPath
    } else if (!options.externalCandidate) {
      await writeJsonAtomic(resolvedOutputPath, { ...result, writtenOutputPath: outputPath ?? null })
      writtenOutputPath = outputPath
    } else {
      result.writtenOutputPath = null
      result.writtenOutputArtifactRole = null
      result.writtenOutputPathAuthorityStatus = 'not-written-stdout-only'
    }
  }

  return { result, ...(writtenOutputPath ? { outputPath: writtenOutputPath } : {}) }
}

async function assertAnalyzerRunOutputAuthority(
  root: string,
  resolvedPackPath: string,
  resolvedExternalCandidatePath: string | undefined,
  pack: JsonRecord,
  externalCandidate: JsonRecord | undefined,
  outputPath: string,
): Promise<void> {
  const resolvedOutputPath = resolveRepoPath(root, outputPath)
  const protectedPaths = buildProtectedOutputPathMap(
    root,
    resolvedPackPath,
    resolvedExternalCandidatePath,
    pack,
    externalCandidate,
  )
  const protectedReason = protectedPaths.get(pathKey(resolvedOutputPath))
  if (protectedReason) {
    throw new Error(`AI Request Analyzer output path is unsafe: ${outputPath} would overwrite ${protectedReason}.`)
  }
  const sourcePathReason = classifyReservedSourcePath(resolvedOutputPath)
  if (sourcePathReason) {
    throw new Error(`AI Request Analyzer output path is unsafe: ${outputPath} targets ${sourcePathReason}.`)
  }
  const existingAuthority = await classifyExistingSourceAuthority(resolvedOutputPath)
  if (existingAuthority) {
    throw new Error(
      `AI Request Analyzer output path is unsafe: ${outputPath} already contains ${existingAuthority}. Choose a dedicated analyzer run or candidate preview path.`,
    )
  }
}

function buildProtectedOutputPathMap(
  root: string,
  resolvedPackPath: string,
  resolvedExternalCandidatePath: string | undefined,
  pack: JsonRecord,
  externalCandidate: JsonRecord | undefined,
): Map<string, string> {
  const protectedPaths = new Map<string, string>()
  const add = (candidate: unknown, reason: string): void => {
    const candidatePath = stringValue(candidate)
    if (!isConcreteOutputProtectedPath(candidatePath)) {
      return
    }
    const key = pathKey(resolveRepoPath(root, candidatePath))
    if (!protectedPaths.has(key)) {
      protectedPaths.set(key, reason)
    }
  }

  protectedPaths.set(pathKey(resolvedPackPath), 'the source AI Request Analyzer Pack')
  if (resolvedExternalCandidatePath) {
    protectedPaths.set(pathKey(resolvedExternalCandidatePath), 'the source external Request IR Candidate')
  }
  for (const candidatePath of collectConcretePathStrings(pack)) {
    add(candidatePath, `linked analyzer pack artifact ${candidatePath}`)
  }
  for (const candidatePath of collectConcretePathStrings(externalCandidate)) {
    add(candidatePath, `linked external candidate artifact ${candidatePath}`)
  }
  return protectedPaths
}

function validateRequestText(requestText: string, findings: AiRequestAnalyzerRunFinding[]): void {
  if (normalizeRequestText(requestText).length === 0) {
    findings.push({
      code: 'AI_REQUEST_TEXT_MISSING',
      severity: 'error',
      field: 'request',
      message: 'analyze-request requires a non-empty --request value.',
    })
  }
}

function validateAnalyzerPack(pack: JsonRecord | null, findings: AiRequestAnalyzerRunFinding[]): void {
  if (!pack) {
    findings.push({
      code: 'AI_REQUEST_ANALYZER_PACK_NOT_OBJECT',
      severity: 'error',
      field: 'pack',
      message: 'analyze-request requires an AI Request Analyzer Pack JSON object.',
    })
    return
  }
  const expectedFields: Array<[string, unknown]> = [
    ['artifactRole', EXPECTED_PACK_ROLE],
    ['status', EXPECTED_PACK_STATUS],
    ['analyzerPackGenerated', true],
    ['llmInvoked', false],
    ['networkCallsAllowed', false],
    ['runtimeAiCallsAllowed', false],
    ['requestIrCandidateGenerated', false],
    ['candidateOnly', true],
    ['expectedOutputArtifactRole', 'request-ir-candidate'],
  ]
  for (const [field, expected] of expectedFields) {
    if (pack[field] !== expected) {
      findings.push({
        code: 'AI_REQUEST_ANALYZER_PACK_UNSAFE_OR_MISMATCHED',
        severity: 'error',
        field,
        message: `AI Request Analyzer Pack field "${field}" is not safe for analyze-request.`,
        expected,
        actual: pack[field],
        suggestedFix: 'Regenerate the analyzer pack before importing an external Request IR Candidate.',
      })
    }
  }
}

function validateExternalCandidateAgainstRequest(
  candidate: JsonRecord,
  requestText: string,
  pack: JsonRecord | null,
  findings: AiRequestAnalyzerRunFinding[],
): void {
  const candidateRequestText = stringValue(candidate.requestText)
  if (candidateRequestText && normalizeRequestText(candidateRequestText) !== normalizeRequestText(requestText)) {
    findings.push({
      code: 'AI_REQUEST_EXTERNAL_CANDIDATE_REQUEST_MISMATCH',
      severity: 'error',
      field: 'requestText',
      message: 'External Request IR Candidate requestText does not match the CLI --request text.',
      expected: requestText,
      actual: candidateRequestText,
      suggestedFix: 'Use an external candidate generated from the exact natural-language request text.',
    })
  }
  const sourceRequestText = stringValue(asRecord(candidate.sourceNaturalLanguageRequest)?.text)
  if (sourceRequestText && normalizeRequestText(sourceRequestText) !== normalizeRequestText(requestText)) {
    findings.push({
      code: 'AI_REQUEST_EXTERNAL_CANDIDATE_REQUEST_MISMATCH',
      severity: 'error',
      field: 'sourceNaturalLanguageRequest.text',
      message: 'External Request IR Candidate sourceNaturalLanguageRequest.text does not match the CLI --request text.',
      expected: requestText,
      actual: sourceRequestText,
      suggestedFix: 'Use an external candidate generated from the exact natural-language request text.',
    })
  }
  const expectedSchemaId = stringValue(pack?.expectedOutputSchemaId)
  const candidateSchemaId = stringValue(candidate.schemaId)
  if (expectedSchemaId && candidateSchemaId && expectedSchemaId !== candidateSchemaId) {
    findings.push({
      code: 'AI_REQUEST_EXTERNAL_CANDIDATE_SCHEMA_MISMATCH',
      severity: 'error',
      field: 'schemaId',
      message: 'External Request IR Candidate schemaId does not match the analyzer pack expected schema.',
      expected: expectedSchemaId,
      actual: candidateSchemaId,
      suggestedFix:
        'Use an external candidate that conforms to the analyzer pack expected Request IR Candidate schema.',
    })
  }
}

function validateExternalCandidateAuthority(candidate: JsonRecord, findings: AiRequestAnalyzerRunFinding[]): void {
  const unsafe = findUnsafeAuthorityClaim(candidate)
  if (unsafe) {
    findings.push({
      code: 'AI_REQUEST_EXTERNAL_CANDIDATE_AUTHORITY_ESCALATION',
      severity: 'error',
      field: unsafe.field,
      message: `External Request IR Candidate attempts to claim unsafe authority via "${unsafe.field}".`,
      expected: unsafe.expected,
      actual: unsafe.actual,
      suggestedFix:
        'External candidates must remain candidate-only and must not claim traversal, contract, instruction, approval, Evidence, equivalence, graph mutation, graph apply, scope, or CI authority.',
    })
  }
}

function validateExternalCandidateSchema(candidate: JsonRecord, findings: AiRequestAnalyzerRunFinding[]): void {
  const validation = validateRequestIrCandidateSchemaOnly(candidate)
  for (const finding of validation.validationFindings.filter((entry) => entry.severity === 'error')) {
    findings.push({
      code: `AI_REQUEST_EXTERNAL_${finding.code}`,
      severity: 'error',
      field: finding.field,
      message: `External Request IR Candidate is not safe for import: ${finding.message}`,
      expected: finding.expected,
      actual: finding.actual,
      suggestedFix: finding.suggestedFix,
    })
  }
}

function buildResult(
  requestText: string,
  paths: AnalyzeRequestPaths,
  findings: AiRequestAnalyzerRunFinding[],
  importedCandidate: JsonRecord | undefined,
): AiRequestAnalyzerRunResult {
  const externalMode = Boolean(paths.externalCandidatePath)
  const providerDisabled = !externalMode
  const imported = Boolean(importedCandidate)
  return {
    schemaVersion: 1,
    artifactRole: 'ai-request-analyzer-run-result',
    status: providerDisabled
      ? 'ai-request-analyzer-provider-disabled'
      : imported
        ? 'ai-request-analyzer-external-candidate-imported'
        : 'ai-request-analyzer-external-candidate-blocked',
    analyzerName: ANALYZER_NAME,
    runScope: 'provider-disabled-or-external-candidate-import-no-llm',
    sourceAiRequestAnalyzerPack: paths.packPath ?? '<in-memory>',
    sourceExternalCandidate: paths.externalCandidatePath ?? null,
    requestText,
    analyzerProviderStatus: providerDisabled
      ? 'provider-disabled'
      : imported
        ? 'external-candidate-imported-provider-not-invoked'
        : 'external-candidate-blocked-provider-not-invoked',
    analyzerProviderConfigured: false,
    llmInvoked: false,
    networkCallsAllowed: false,
    runtimeAiCallsAllowed: false,
    requestIrCandidateGenerated: imported,
    requestIrCandidateImported: imported,
    candidateImportRequired: !imported,
    candidateOnly: true,
    candidateAuthorityStatus: 'ai-generated-candidate-not-validated',
    requestIrAuthorityStatus: 'not-authoritative-until-validated',
    validationRequiredBeforeTraversal: true,
    graphTraversalAllowed: false,
    graphTraversalExecuted: false,
    selectedGraphSliceGenerated: false,
    contractInputGenerated: false,
    instructionPackGenerated: false,
    codexExecutionTriggered: false,
    graphSourceMutated: false,
    graphDeltaApplied: false,
    approvalStatus: 'not-approved',
    humanDecisionRecorded: false,
    runtimeEvidenceSatisfied: false,
    equivalenceProven: false,
    scopeEnforced: false,
    ciEnforcementEnabled: false,
    validationFindings: findings,
    ...(importedCandidate ? { importedCandidate } : {}),
    outputWritePolicy: 'explicit-output-only',
    writtenOutputPath: paths.outputPath ?? null,
    writtenOutputArtifactRole: paths.outputPath
      ? imported
        ? 'request-ir-candidate'
        : 'ai-request-analyzer-run-result'
      : null,
    writtenOutputPathAuthorityStatus: paths.outputPath
      ? 'explicit-preview-output-not-source-authority'
      : 'not-written-stdout-only',
    nonExecutionBoundary:
      'This analyze-request command surface does not call an LLM, make network calls, configure an analyzer provider, validate Request IR, run graph traversal, generate selected graph slices, generate Contract Compiler Input, generate Instruction Packs, trigger Codex execution, mutate graph-source, apply graph deltas, approve work, record human decisions, satisfy runtime Evidence, prove equivalence, enforce scope, or configure CI.',
  }
}

function buildImportedCandidate(
  requestText: string,
  pack: JsonRecord | null,
  candidate: JsonRecord,
  paths: AnalyzeRequestPaths,
): JsonRecord {
  const imported: JsonRecord = {
    ...structuredClone(candidate),
    artifactRole: 'request-ir-candidate',
    status: 'request-ir-candidate-external-import-previewed',
    schemaId: stringValue(candidate.schemaId) || stringValue(pack?.expectedOutputSchemaId) || COMPATIBLE_SCHEMA_ID,
    requestIrCandidateStatus: 'candidate-only',
    candidateOnly: true,
    authorityStatus: 'not-authoritative-until-validated',
    sourceAiRequestAnalyzerPack: paths.packPath ?? '<in-memory>',
    sourceExternalCandidate: paths.externalCandidatePath ?? '<in-memory>',
    sourceNaturalLanguageRequest: {
      ...(asRecord(candidate.sourceNaturalLanguageRequest) ?? {}),
      sourceKind:
        stringValue(asRecord(candidate.sourceNaturalLanguageRequest)?.sourceKind) || 'human-natural-language-request',
      text: requestText,
      authorityStatus: 'raw-request-text-not-compiler-authority',
    },
    requestText,
    analyzerProviderStatus: 'external-candidate-imported-provider-not-invoked',
    llmInvoked: false,
    networkCallsAllowed: false,
    runtimeAiCallsAllowed: false,
    validationRequiredBeforeTraversal: true,
    validatedRequestIr: false,
    requestIrValidationStatus: 'not-validated-after-ai-request-analyzer-import',
    schemaOnlyValidationResult: null,
    graphAwareValidationResultStatus: 'not-run-after-ai-request-analyzer-import',
    graphAwareValidationResultArtifact: null,
    futureValidatorExpectations: {
      ...(asRecord(candidate.futureValidatorExpectations) ?? {}),
      schemaOnlyValidationResult: null,
      graphAwareValidationResult: null,
      analyzerImportValidationRequiredAgain: true,
    },
    graphTraversalAllowed: false,
    contractGenerationAllowed: false,
    instructionPackGenerationAllowed: false,
    graphTraversalAllowedFromUnvalidatedAiOutput: false,
    contractGenerationAllowedFromUnvalidatedAiOutput: false,
    instructionPackGenerationAllowedFromUnvalidatedAiOutput: false,
    selectedGraphSliceGenerated: false,
    contractInputGenerated: false,
    contractCompilerInputGenerated: false,
    instructionPackGenerated: false,
    codexExecutionTriggered: false,
    graphSourceMutated: false,
    graphDeltaApplied: false,
    approvalStatus: 'not-approved',
    humanDecisionRecorded: false,
    equivalenceProven: false,
    runtimeEvidenceSatisfied: false,
    scopeEnforced: false,
    ciEnforcementEnabled: false,
    outputWritePolicy: 'explicit-output-only',
    writtenOutputPath: paths.outputPath ?? null,
    writtenOutputPathAuthorityStatus: paths.outputPath
      ? 'explicit-preview-output-not-source-authority'
      : 'not-written-stdout-only',
    nonExecutionBoundary:
      'This Request IR Candidate was imported from an explicit external candidate without invoking an analyzer provider. It remains candidate-only and requires validate-request-ir and validate-request-ir-graph before traversal. It does not trigger Codex execution, mutate graph-source, apply graph deltas, approve work, satisfy runtime Evidence, prove equivalence, enforce scope, or configure CI.',
  }
  return imported
}

function findUnsafeAuthorityClaim(value: unknown): { field: string; expected: unknown; actual: unknown } | null {
  const visit = (entry: unknown): { field: string; expected: unknown; actual: unknown } | null => {
    if (Array.isArray(entry)) {
      for (const item of entry) {
        const found = visit(item)
        if (found) {
          return found
        }
      }
      return null
    }
    const record = asRecord(entry)
    if (!record) {
      return null
    }
    for (const [key, nested] of Object.entries(record)) {
      if (UNSAFE_TRUE_FIELDS.has(key) && nested === true) {
        return { field: key, expected: false, actual: nested }
      }
      if (key === 'approvalStatus' && typeof nested === 'string' && nested !== 'not-approved') {
        return { field: key, expected: 'not-approved', actual: nested }
      }
      const found = visit(nested)
      if (found) {
        return found
      }
    }
    return null
  }
  return visit(value)
}

async function classifyExistingSourceAuthority(filePath: string): Promise<string | null> {
  const parsed = await readJsonSafe<JsonRecord>(filePath)
  if (!parsed.ok) {
    return null
  }
  const record = asRecord(parsed.value)
  if (!record) {
    return null
  }
  const artifactRole = stringValue(record.artifactRole)
  if (
    artifactRole === EXPECTED_PACK_ROLE ||
    artifactRole === 'ai-request-analyzer-boundary' ||
    artifactRole === 'request-ir-candidate-schema-preview' ||
    artifactRole === 'request-ir-candidate' ||
    artifactRole === 'request-ir-candidate-calibration-fixture-preview' ||
    artifactRole === 'natural-language-request-intake-boundary-preview'
  ) {
    return `source analyzer/request artifactRole "${artifactRole}"`
  }
  if (artifactRole.includes('graph-source')) {
    return `graph-source artifactRole "${artifactRole}"`
  }
  if (
    [
      'request-ir-graph-aware-validation',
      'graph-traversal-plan',
      'selected-graph-slice',
      'contract-compiler-input',
      'instruction-pack',
      'clarification-interview-pack',
      'clarification-answers-preview',
      'devview-hook-gateway-health-report',
    ].includes(artifactRole)
  ) {
    return `selected/source artifactRole "${artifactRole}"`
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
  return uniqueStrings(paths)
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

function normalizeRequestText(value: string): string {
  return value.replace(/\s+/g, ' ').trim()
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

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values.filter((entry) => entry.length > 0))]
}

function resolveRepoPath(root: string, inputPath: string): string {
  return path.isAbsolute(inputPath) ? inputPath : path.resolve(root, inputPath)
}

function pathKey(filePath: string): string {
  return path.resolve(filePath).replaceAll('\\', '/').toLowerCase()
}
