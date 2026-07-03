import path from 'node:path'
import { readJsonSafe, relativePath, writeJsonAtomic, writeTextAtomic } from './fs.js'
import type { IssueSeverity } from './types.js'

const GENERATOR_NAME = 'AiRequestAnalyzerPackGenerator'
const EXPECTED_BOUNDARY_ROLE = 'ai-request-analyzer-boundary'
const EXPECTED_BOUNDARY_STATUS = 'ai-request-analyzer-boundary-previewed'
const EXPECTED_SCHEMA_ROLE = 'request-ir-candidate-schema-preview'
const EXPECTED_SCHEMA_STATUS = 'request-ir-candidate-schema-previewed'

type JsonRecord = Record<string, unknown>

export interface AiRequestAnalyzerPackFinding {
  code: string
  severity: IssueSeverity
  field?: string
  message: string
  expected?: unknown
  actual?: unknown
  suggestedFix?: string
}

export interface AiRequestAnalyzerPack {
  schemaVersion: 1
  artifactRole: 'ai-request-analyzer-pack'
  status: 'ai-request-analyzer-pack-generated' | 'ai-request-analyzer-pack-blocked'
  generatorName: typeof GENERATOR_NAME
  packScope: 'natural-language-to-request-ir-candidate-prompt-preview-no-llm'
  sourceAnalyzerBoundary: string
  sourceRequestIrCandidateSchema: string
  analyzerPackGenerated: boolean
  analyzerImplemented: false
  llmInvoked: false
  networkCallsAllowed: false
  runtimeAiCallsAllowed: false
  requestIrCandidateGenerated: false
  candidateOnly: true
  candidateAuthorityStatus: 'ai-generated-candidate-not-validated'
  requestIrAuthorityStatus: 'not-authoritative-until-validated'
  expectedOutputArtifactRole: 'request-ir-candidate'
  expectedOutputSchemaId: string
  expectedOutputSchemaArtifact: string
  requiredOutputFields: string[]
  requiredCandidateBoundaryFields: JsonRecord
  requestTypeTaxonomy: JsonRecord
  confidenceAndAmbiguityPolicy: JsonRecord
  inputContract: JsonRecord
  outputContract: JsonRecord
  validationChainRequiredBeforeTraversal: JsonRecord[]
  promptSections: JsonRecord[]
  safetyInstructions: string[]
  forbiddenUse: string[]
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
  equivalenceProven: false
  runtimeEvidenceSatisfied: false
  scopeEnforced: false
  ciEnforcementEnabled: false
  validationFindings: AiRequestAnalyzerPackFinding[]
  outputWritePolicy: 'explicit-output-only'
  writtenOutputPath: string | null
  markdownReportPath: string | null
  writtenOutputPathAuthorityStatus: 'not-written-stdout-only' | 'explicit-preview-output-not-source-authority'
  markdownReportAuthorityStatus: 'not-written' | 'explicit-preview-output-not-source-authority'
  nonExecutionBoundary: string
}

export interface AiRequestAnalyzerPackFileResult {
  pack: AiRequestAnalyzerPack
  outputPath?: string
  markdownReport?: string
}

export function generateAiRequestAnalyzerPack(
  analyzerBoundary: unknown,
  requestIrCandidateSchema: unknown,
  paths: { analyzerBoundaryPath?: string; schemaPath?: string } = {},
): AiRequestAnalyzerPack {
  const boundary = asRecord(analyzerBoundary)
  const schema = asRecord(requestIrCandidateSchema)
  const findings: AiRequestAnalyzerPackFinding[] = []
  validateAnalyzerBoundary(boundary, findings)
  validateRequestIrCandidateSchema(schema, boundary, findings)

  const blocked = findings.some((finding) => finding.severity === 'error')
  const outputContract = asRecord(boundary?.outputContract)
  const requiredBoundaryFields = asRecord(outputContract?.requiredBoundaryFields) ?? {
    requestIrCandidateStatus: 'candidate-only',
    candidateOnly: true,
    authorityStatus: 'not-authoritative-until-validated',
    graphTraversalAllowed: false,
    contractGenerationAllowed: false,
    instructionPackGenerationAllowed: false,
  }
  const requiredOutputFields = stringArray(schema?.requiredFields)
  const requestTypeTaxonomy = buildRequestTypeTaxonomy(boundary, schema)
  const forbiddenUse = uniqueStrings([
    ...stringArray(boundary?.forbiddenUse),
    'call an LLM or API from this deterministic pack generator',
    'treat prompt-pack output as a Request IR Candidate',
    'claim validation, graph traversal authority, contract authority, execution authority, approval, or Evidence satisfaction',
  ])

  return {
    schemaVersion: 1,
    artifactRole: 'ai-request-analyzer-pack',
    status: blocked ? 'ai-request-analyzer-pack-blocked' : 'ai-request-analyzer-pack-generated',
    generatorName: GENERATOR_NAME,
    packScope: 'natural-language-to-request-ir-candidate-prompt-preview-no-llm',
    sourceAnalyzerBoundary: paths.analyzerBoundaryPath ?? '<in-memory>',
    sourceRequestIrCandidateSchema: paths.schemaPath ?? '<in-memory>',
    analyzerPackGenerated: !blocked,
    analyzerImplemented: false,
    llmInvoked: false,
    networkCallsAllowed: false,
    runtimeAiCallsAllowed: false,
    requestIrCandidateGenerated: false,
    candidateOnly: true,
    candidateAuthorityStatus: 'ai-generated-candidate-not-validated',
    requestIrAuthorityStatus: 'not-authoritative-until-validated',
    expectedOutputArtifactRole: 'request-ir-candidate',
    expectedOutputSchemaId: stringValue(schema?.schemaId) || stringValue(boundary?.expectedOutputSchemaId),
    expectedOutputSchemaArtifact:
      stringValue(boundary?.expectedOutputSchemaArtifact) || paths.schemaPath || '<in-memory>',
    requiredOutputFields,
    requiredCandidateBoundaryFields: requiredBoundaryFields,
    requestTypeTaxonomy,
    confidenceAndAmbiguityPolicy: asRecord(schema?.confidenceAndAmbiguityPolicy) ?? {},
    inputContract: asRecord(boundary?.inputContract) ?? {},
    outputContract: outputContract ?? {},
    validationChainRequiredBeforeTraversal: arrayRecords(boundary?.validationChainRequiredBeforeTraversal),
    promptSections: buildPromptSections(boundary, schema, requiredOutputFields, requestTypeTaxonomy),
    safetyInstructions: buildSafetyInstructions(requiredBoundaryFields),
    forbiddenUse,
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
    equivalenceProven: false,
    runtimeEvidenceSatisfied: false,
    scopeEnforced: false,
    ciEnforcementEnabled: false,
    validationFindings: findings,
    outputWritePolicy: 'explicit-output-only',
    writtenOutputPath: null,
    markdownReportPath: null,
    writtenOutputPathAuthorityStatus: 'not-written-stdout-only',
    markdownReportAuthorityStatus: 'not-written',
    nonExecutionBoundary:
      'This AI Request Analyzer Prompt Pack is deterministic prompt/input contract preview only. It does not call an LLM, make network calls, generate a Request IR Candidate, validate Request IR, run graph traversal, generate selected graph slices, generate Contract Compiler Input, generate execution Instruction Packs, trigger Codex execution, mutate graph-source, apply graph deltas, approve work, record human decisions, satisfy runtime Evidence, prove equivalence, enforce scope, or configure CI.',
  }
}

export function renderAiRequestAnalyzerPackMarkdown(pack: AiRequestAnalyzerPack): string {
  return [
    '# AI Request Analyzer Prompt Pack',
    '',
    `Status: ${pack.status}`,
    '',
    '## Role',
    '',
    'Produce Request IR Candidate JSON only. Do not validate it, execute it, or turn it into graph traversal, contract input, instruction packs, or Codex execution.',
    '',
    '## Required Output Fields',
    '',
    ...renderList(pack.requiredOutputFields),
    '',
    '## Allowed Request Types',
    '',
    ...renderList(stringArray(pack.requestTypeTaxonomy.allowedValues)),
    '',
    '## Candidate Boundary Fields',
    '',
    ...Object.entries(pack.requiredCandidateBoundaryFields).map(
      ([field, value]) => `- ${field}: ${JSON.stringify(value)}`,
    ),
    '',
    '## Confidence And Ambiguity',
    '',
    `- ${JSON.stringify(pack.confidenceAndAmbiguityPolicy)}`,
    '',
    '## Safety Instructions',
    '',
    ...pack.safetyInstructions.map((entry) => `- ${entry}`),
    '',
    '## Forbidden Use',
    '',
    ...pack.forbiddenUse.map((entry) => `- ${entry}`),
    '',
    '## Boundary',
    '',
    '- This pack is not a Request IR Candidate.',
    '- This pack does not call an LLM or API.',
    '- This pack does not claim validation, approval, runtime Evidence satisfaction, equivalence proof, or enforcement.',
    '- This pack does not trigger Codex execution.',
    `- ${pack.nonExecutionBoundary}`,
    '',
  ].join('\n')
}

export async function generateAiRequestAnalyzerPackFile(
  root: string,
  analyzerBoundaryPath: string,
  schemaPath: string,
  options: { output?: string; markdown?: string } = {},
): Promise<AiRequestAnalyzerPackFileResult> {
  const resolvedBoundaryPath = resolveRepoPath(root, analyzerBoundaryPath)
  const resolvedSchemaPath = resolveRepoPath(root, schemaPath)
  const analyzerBoundary = await readJsonSafe<Record<string, unknown>>(resolvedBoundaryPath)
  if (!analyzerBoundary.ok) {
    throw new Error(
      `Unable to read AI Request Analyzer boundary from ${analyzerBoundaryPath}: ${analyzerBoundary.error}`,
    )
  }
  const schema = await readJsonSafe<Record<string, unknown>>(resolvedSchemaPath)
  if (!schema.ok) {
    throw new Error(`Unable to read Request IR Candidate schema from ${schemaPath}: ${schema.error}`)
  }

  await assertPackOutputAuthority(
    root,
    resolvedBoundaryPath,
    resolvedSchemaPath,
    analyzerBoundary.value,
    schema.value,
    options,
  )
  const pack = generateAiRequestAnalyzerPack(analyzerBoundary.value, schema.value, {
    analyzerBoundaryPath: relativePath(root, resolvedBoundaryPath),
    schemaPath: relativePath(root, resolvedSchemaPath),
  })

  let outputPath: string | undefined
  let markdownReport: string | undefined
  if (options.output) {
    const resolvedOutputPath = resolveRepoPath(root, options.output)
    outputPath = relativePath(root, resolvedOutputPath)
    pack.writtenOutputPath = outputPath
    pack.writtenOutputPathAuthorityStatus = 'explicit-preview-output-not-source-authority'
    await writeJsonAtomic(resolvedOutputPath, pack)
  }

  if (options.markdown) {
    const resolvedMarkdownPath = resolveRepoPath(root, options.markdown)
    markdownReport = relativePath(root, resolvedMarkdownPath)
    pack.markdownReportPath = markdownReport
    pack.markdownReportAuthorityStatus = 'explicit-preview-output-not-source-authority'
    await writeTextAtomic(resolvedMarkdownPath, renderAiRequestAnalyzerPackMarkdown(pack))
    if (options.output && outputPath) {
      await writeJsonAtomic(resolveRepoPath(root, options.output), pack)
    }
  }

  return { pack, ...(outputPath ? { outputPath } : {}), ...(markdownReport ? { markdownReport } : {}) }
}

async function assertPackOutputAuthority(
  root: string,
  resolvedBoundaryPath: string,
  resolvedSchemaPath: string,
  analyzerBoundary: JsonRecord,
  schema: JsonRecord,
  options: { output?: string; markdown?: string },
): Promise<void> {
  const requestedTargets = [
    ...(options.output
      ? [{ kind: 'output', requestedPath: options.output, resolvedPath: resolveRepoPath(root, options.output) }]
      : []),
    ...(options.markdown
      ? [{ kind: 'markdown', requestedPath: options.markdown, resolvedPath: resolveRepoPath(root, options.markdown) }]
      : []),
  ]
  if (requestedTargets.length === 0) {
    return
  }

  if (
    requestedTargets.length === 2 &&
    pathKey(requestedTargets[0].resolvedPath) === pathKey(requestedTargets[1].resolvedPath)
  ) {
    throw new Error(
      `AI Request Analyzer pack preview output is unsafe: --output and --markdown resolve to the same path (${requestedTargets[0].requestedPath}).`,
    )
  }

  const protectedPaths = buildProtectedOutputPathMap(
    root,
    resolvedBoundaryPath,
    resolvedSchemaPath,
    analyzerBoundary,
    schema,
  )
  for (const target of requestedTargets) {
    const protectedReason = protectedPaths.get(pathKey(target.resolvedPath))
    if (protectedReason) {
      throw new Error(
        `AI Request Analyzer pack preview ${target.kind} path is unsafe: ${target.requestedPath} would overwrite ${protectedReason}.`,
      )
    }
    const existingAuthority = await classifyExistingSourceAuthority(target.resolvedPath)
    if (existingAuthority) {
      throw new Error(
        `AI Request Analyzer pack preview ${target.kind} path is unsafe: ${target.requestedPath} already contains ${existingAuthority}. Choose a dedicated prompt-pack preview output path.`,
      )
    }
  }
}

function buildProtectedOutputPathMap(
  root: string,
  resolvedBoundaryPath: string,
  resolvedSchemaPath: string,
  analyzerBoundary: JsonRecord,
  schema: JsonRecord,
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

  protectedPaths.set(pathKey(resolvedBoundaryPath), 'the source AI Request Analyzer boundary')
  protectedPaths.set(pathKey(resolvedSchemaPath), 'the source Request IR Candidate schema')
  for (const candidatePath of collectConcretePathStrings(analyzerBoundary)) {
    add(candidatePath, `linked analyzer boundary artifact ${candidatePath}`)
  }
  for (const candidatePath of collectConcretePathStrings(schema)) {
    add(candidatePath, `linked Request IR schema artifact ${candidatePath}`)
  }
  return protectedPaths
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
    artifactRole === EXPECTED_BOUNDARY_ROLE ||
    artifactRole === EXPECTED_SCHEMA_ROLE ||
    artifactRole === 'request-ir-candidate' ||
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

function validateAnalyzerBoundary(boundary: JsonRecord | null, findings: AiRequestAnalyzerPackFinding[]): void {
  if (!boundary) {
    findings.push({
      code: 'AI_REQUEST_ANALYZER_BOUNDARY_NOT_OBJECT',
      severity: 'error',
      field: 'analyzerBoundary',
      message: 'AI Request Analyzer pack generation requires an analyzer boundary JSON object.',
    })
    return
  }

  const expectedFields: Array<[string, unknown]> = [
    ['artifactRole', EXPECTED_BOUNDARY_ROLE],
    ['status', EXPECTED_BOUNDARY_STATUS],
    ['analyzerImplemented', false],
    ['llmInvoked', false],
    ['networkCallsAllowed', false],
    ['runtimeAiCallsAllowed', false],
    ['requestIrCandidateGenerated', false],
    ['candidateOnly', true],
    ['candidateAuthorityStatus', 'ai-generated-candidate-not-validated'],
    ['requestIrAuthorityStatus', 'not-authoritative-until-validated'],
    ['expectedOutputArtifactRole', 'request-ir-candidate'],
  ]

  for (const [field, expected] of expectedFields) {
    if (boundary[field] !== expected) {
      findings.push({
        code: 'AI_REQUEST_ANALYZER_BOUNDARY_UNSAFE_OR_MISMATCHED',
        severity: 'error',
        field,
        message: `AI Request Analyzer boundary field "${field}" is not safe for prompt-pack generation.`,
        expected,
        actual: boundary[field],
        suggestedFix: 'Restore the AI Request Analyzer boundary preview before generating a prompt pack.',
      })
    }
  }
}

function validateRequestIrCandidateSchema(
  schema: JsonRecord | null,
  boundary: JsonRecord | null,
  findings: AiRequestAnalyzerPackFinding[],
): void {
  if (!schema) {
    findings.push({
      code: 'REQUEST_IR_CANDIDATE_SCHEMA_NOT_OBJECT',
      severity: 'error',
      field: 'requestIrCandidateSchema',
      message: 'AI Request Analyzer pack generation requires a Request IR Candidate schema preview JSON object.',
    })
    return
  }

  const expectedFields: Array<[string, unknown]> = [
    ['artifactRole', EXPECTED_SCHEMA_ROLE],
    ['status', EXPECTED_SCHEMA_STATUS],
    ['requestIrCandidateStatus', 'candidate-only'],
    ['candidateOnly', true],
    ['authorityStatus', 'not-authoritative-until-validated'],
    ['validatedRequestIr', false],
    ['graphTraversalAllowed', false],
    ['contractGenerationAllowed', false],
    ['instructionPackGenerationAllowed', false],
    ['aiClassifierImplemented', false],
    ['llmCallsIntroduced', false],
  ]

  for (const [field, expected] of expectedFields) {
    if (schema[field] !== expected) {
      findings.push({
        code: 'REQUEST_IR_CANDIDATE_SCHEMA_UNSAFE_OR_MISMATCHED',
        severity: 'error',
        field,
        message: `Request IR Candidate schema field "${field}" is not safe for prompt-pack generation.`,
        expected,
        actual: schema[field],
        suggestedFix: 'Restore the Request IR Candidate schema preview before generating a prompt pack.',
      })
    }
  }

  const boundarySchemaId = stringValue(boundary?.expectedOutputSchemaId)
  const schemaId = stringValue(schema.schemaId)
  if (boundarySchemaId && schemaId && boundarySchemaId !== schemaId) {
    findings.push({
      code: 'AI_REQUEST_ANALYZER_SCHEMA_ID_MISMATCH',
      severity: 'error',
      field: 'schemaId',
      message:
        'AI Request Analyzer boundary expected schema id does not match the provided Request IR Candidate schema.',
      expected: boundarySchemaId,
      actual: schemaId,
      suggestedFix: 'Use the Request IR Candidate schema artifact referenced by the AI Request Analyzer boundary.',
    })
  }

  if (stringArray(schema.requiredFields).length === 0) {
    findings.push({
      code: 'REQUEST_IR_CANDIDATE_SCHEMA_REQUIRED_FIELDS_MISSING',
      severity: 'error',
      field: 'requiredFields',
      message: 'Request IR Candidate schema preview must list required fields for prompt-pack generation.',
      suggestedFix: 'Restore requiredFields in the Request IR Candidate schema preview.',
    })
  }
}

function buildRequestTypeTaxonomy(boundary: JsonRecord | null, schema: JsonRecord | null): JsonRecord {
  const schemaTaxonomy = asRecord(schema?.requestTypeTaxonomy)
  if (schemaTaxonomy) {
    return schemaTaxonomy
  }
  return {
    taxonomyStatus: 'boundary-derived',
    allowedValues: stringArray(asRecord(boundary?.outputContract)?.allowedRequestTypes),
    arbitraryRequestTypesAllowed: false,
    unknownHandling: stringValue(asRecord(boundary?.outputContract)?.unknownOrLowConfidencePolicy),
  }
}

function buildPromptSections(
  boundary: JsonRecord | null,
  schema: JsonRecord | null,
  requiredOutputFields: string[],
  requestTypeTaxonomy: JsonRecord,
): JsonRecord[] {
  return [
    {
      id: 'role',
      title: 'Role',
      content:
        'Convert one raw natural-language request into Request IR Candidate JSON only. Do not validate, traverse, generate contracts, generate instruction packs, execute Codex, or approve work.',
    },
    {
      id: 'inputs',
      title: 'Inputs',
      content: asRecord(boundary?.inputContract) ?? {},
    },
    {
      id: 'required-output-fields',
      title: 'Required output fields',
      content: requiredOutputFields,
    },
    {
      id: 'field-definitions',
      title: 'Field definitions',
      content: asRecord(schema?.fieldDefinitions) ?? {},
    },
    {
      id: 'request-type-taxonomy',
      title: 'Allowed request types',
      content: requestTypeTaxonomy,
    },
    {
      id: 'validation-chain',
      title: 'Required deterministic validation chain',
      content: arrayRecords(boundary?.validationChainRequiredBeforeTraversal),
    },
  ]
}

function buildSafetyInstructions(requiredBoundaryFields: JsonRecord): string[] {
  return [
    'Return Request IR Candidate JSON only; no prose and no execution instructions.',
    'Mark all analyzer-produced fields as candidate-only.',
    `Set requestIrCandidateStatus to ${JSON.stringify(requiredBoundaryFields.requestIrCandidateStatus ?? 'candidate-only')}.`,
    `Set candidateOnly to ${JSON.stringify(requiredBoundaryFields.candidateOnly ?? true)}.`,
    `Set authorityStatus to ${JSON.stringify(requiredBoundaryFields.authorityStatus ?? 'not-authoritative-until-validated')}.`,
    'Set graphTraversalAllowed, contractGenerationAllowed, and instructionPackGenerationAllowed to false.',
    'Use only the allowed request type taxonomy; use unknown plus clarification/human-review state for uncertainty.',
    'Never claim validation, graph authority, approval, runtime Evidence satisfaction, equivalence proof, scope enforcement, or CI enforcement.',
  ]
}

function renderList(entries: string[]): string[] {
  return entries.length > 0 ? entries.map((entry) => `- ${entry}`) : ['- none']
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

function asRecord(value: unknown): JsonRecord | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return null
  }
  return value as JsonRecord
}

function arrayRecords(value: unknown): JsonRecord[] {
  return Array.isArray(value) ? value.flatMap((entry) => (asRecord(entry) ? [entry as JsonRecord] : [])) : []
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === 'string') : []
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
