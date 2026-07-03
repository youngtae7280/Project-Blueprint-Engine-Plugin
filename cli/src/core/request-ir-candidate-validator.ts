import path from 'node:path'
import { readJsonSafe, relativePath, writeJsonAtomic } from './fs.js'
import type { IssueSeverity } from './types.js'

const VALIDATOR_NAME = 'RequestIrCandidateSchemaOnlyValidator'
const COMPATIBLE_SCHEMA_ID = 'devview-request-ir-candidate-v0-preview'
const ALLOWED_REQUEST_TYPES = [
  'runtime-evidence-only',
  'behavior-change',
  'bug-fix',
  'refactor',
  'documentation-only',
  'investigation-only',
  'unknown',
] as const

const REQUIRED_FIELDS = [
  'schemaId',
  'requestIrCandidateStatus',
  'sourceNaturalLanguageRequest',
  'requestText',
  'requestLanguage',
  'requestTypeCandidate',
  'changeTypeCandidate',
  'targetRecordIdCandidate',
  'targetComponentCandidate',
  'intentSummaryCandidate',
  'allowedScopeIntentCandidate',
  'forbiddenScopeIntentCandidate',
  'requiredEvidenceIntentCandidate',
  'riskIntentCandidate',
  'confidence',
  'ambiguities',
  'requiresClarification',
  'humanReviewRequired',
  'candidateOnly',
  'authorityStatus',
  'graphTraversalAllowed',
  'contractGenerationAllowed',
  'instructionPackGenerationAllowed',
] as const

export interface RequestIrCandidateValidationFinding {
  code: string
  severity: IssueSeverity
  field?: string
  message: string
  expected?: unknown
  actual?: unknown
  suggestedFix?: string
}

export interface RequestIrCandidateValidationResult {
  schemaVersion: 1
  artifactRole: 'request-ir-candidate-schema-only-validation'
  status: 'request-ir-candidate-schema-only-validation-complete' | 'request-ir-candidate-schema-only-validation-blocked'
  validatorName: typeof VALIDATOR_NAME
  validationScope: 'schema-and-boundary-only'
  candidatePath: string
  schemaValidationStatus: 'schema-valid' | 'schema-invalid'
  requestIrValidationStatus: 'schema-valid-graph-validation-not-run' | 'validation-blocked'
  allowedEnumValidationStatus: 'valid' | 'invalid' | 'unknown-request-type-clarification-required'
  candidateBoundaryValidationStatus: 'valid' | 'invalid'
  confidenceValidationStatus: 'valid' | 'clarification-required' | 'invalid'
  ambiguityValidationStatus: 'no-unresolved-ambiguity' | 'human-review-required' | 'invalid'
  graphAuthorityValidationStatus: 'not-run'
  graphTraversalAllowed: false
  contractGenerationAllowed: false
  instructionPackGenerationAllowed: false
  requiresClarification: boolean
  humanReviewRequired: boolean
  graphValidationRequired: true
  selectedGraphSliceGenerated: false
  contractCompilerInputGenerated: false
  instructionPackGenerated: false
  aiClassifierImplemented: false
  llmCallsIntroduced: false
  graphSourceInspected: false
  graphNodeExistenceValidated: false
  graphEdgeExistenceValidated: false
  graphSourceMutated: false
  graphDeltaApplied: false
  approvalStatus: 'not-approved'
  equivalenceProven: false
  runtimeEvidenceSatisfied: false
  outputWritePolicy: 'explicit-output-only'
  writtenOutputPath: string | null
  writtenOutputPathAuthorityStatus: 'not-written-stdout-only' | 'explicit-preview-output-not-graph-source'
  validationFindings: RequestIrCandidateValidationFinding[]
  nonExecutionBoundary: string
}

export interface RequestIrCandidateValidationFileResult {
  result: RequestIrCandidateValidationResult
  outputPath?: string
}

type JsonRecord = Record<string, unknown>

export function validateRequestIrCandidateSchemaOnly(
  candidate: unknown,
  candidatePath = '<in-memory>',
): RequestIrCandidateValidationResult {
  const findings: RequestIrCandidateValidationFinding[] = []
  const record = asRecord(candidate)

  if (!record) {
    findings.push({
      code: 'REQUEST_IR_CANDIDATE_NOT_OBJECT',
      severity: 'error',
      message: 'Request IR Candidate must be a JSON object.',
      suggestedFix: 'Provide a candidate object using the devview-request-ir-candidate-v0-preview shape.',
    })
    return buildResult(candidatePath, findings, {
      allowedEnumValidationStatus: 'invalid',
      candidateBoundaryValidationStatus: 'invalid',
      confidenceValidationStatus: 'invalid',
      ambiguityValidationStatus: 'invalid',
      requiresClarification: true,
      humanReviewRequired: true,
    })
  }

  for (const field of REQUIRED_FIELDS) {
    if (!(field in record)) {
      findings.push({
        code: 'REQUEST_IR_CANDIDATE_REQUIRED_FIELD_MISSING',
        severity: 'error',
        field,
        message: `Request IR Candidate is missing required field "${field}".`,
        suggestedFix: `Add "${field}" to the candidate artifact before running graph-aware validation.`,
      })
    }
  }

  if (record.schemaId !== COMPATIBLE_SCHEMA_ID) {
    findings.push({
      code: 'REQUEST_IR_CANDIDATE_SCHEMA_ID_UNSUPPORTED',
      severity: 'error',
      field: 'schemaId',
      message: `Request IR Candidate schemaId must be "${COMPATIBLE_SCHEMA_ID}".`,
      expected: COMPATIBLE_SCHEMA_ID,
      actual: record.schemaId,
      suggestedFix: 'Regenerate the candidate using the preview Request IR Candidate schema.',
    })
  }

  const allowedEnumValidationStatus = validateRequestType(record, findings)
  const candidateBoundaryValidationStatus = validateCandidateOnlyBoundaries(record, findings)
  const confidenceValidationStatus = validateConfidence(record, findings)
  const ambiguityValidationStatus = validateAmbiguities(record, findings)

  const requiresClarification =
    record.requiresClarification === true ||
    allowedEnumValidationStatus === 'unknown-request-type-clarification-required' ||
    confidenceValidationStatus === 'clarification-required' ||
    findings.some((finding) => finding.severity === 'error')

  const humanReviewRequired =
    record.humanReviewRequired === true ||
    requiresClarification ||
    ambiguityValidationStatus === 'human-review-required' ||
    findings.some((finding) => finding.severity === 'error')

  return buildResult(candidatePath, findings, {
    allowedEnumValidationStatus,
    candidateBoundaryValidationStatus,
    confidenceValidationStatus,
    ambiguityValidationStatus,
    requiresClarification,
    humanReviewRequired,
  })
}

export async function validateRequestIrCandidateFile(
  root: string,
  candidatePath: string,
  options: { output?: string } = {},
): Promise<RequestIrCandidateValidationFileResult> {
  const resolvedCandidatePath = resolveRepoPath(root, candidatePath)
  const candidate = await readJsonSafe(resolvedCandidatePath)
  if (!candidate.ok) {
    throw new Error(`Unable to read Request IR Candidate from ${candidatePath}: ${candidate.error}`)
  }

  const result = validateRequestIrCandidateSchemaOnly(candidate.value, relativePath(root, resolvedCandidatePath))
  let outputPath: string | undefined

  if (options.output) {
    const resolvedOutputPath = resolveRepoPath(root, options.output)
    outputPath = relativePath(root, resolvedOutputPath)
    result.writtenOutputPath = outputPath
    result.writtenOutputPathAuthorityStatus = 'explicit-preview-output-not-graph-source'
    await writeJsonAtomic(resolvedOutputPath, result)
  }

  return { result, ...(outputPath ? { outputPath } : {}) }
}

function validateRequestType(
  record: JsonRecord,
  findings: RequestIrCandidateValidationFinding[],
): RequestIrCandidateValidationResult['allowedEnumValidationStatus'] {
  const requestType = record.requestTypeCandidate
  if (
    typeof requestType !== 'string' ||
    !ALLOWED_REQUEST_TYPES.includes(requestType as (typeof ALLOWED_REQUEST_TYPES)[number])
  ) {
    findings.push({
      code: 'REQUEST_IR_CANDIDATE_REQUEST_TYPE_INVALID',
      severity: 'error',
      field: 'requestTypeCandidate',
      message: 'requestTypeCandidate must be one of the narrow DevView request type enum values.',
      expected: [...ALLOWED_REQUEST_TYPES],
      actual: requestType,
      suggestedFix: 'Use one of the preview enum values, or use "unknown" when the request needs clarification.',
    })
    return 'invalid'
  }

  if (requestType === 'unknown') {
    findings.push({
      code: 'REQUEST_IR_CANDIDATE_REQUEST_TYPE_UNKNOWN',
      severity: 'warning',
      field: 'requestTypeCandidate',
      message: 'Unknown request type is schema-valid but requires clarification or human review.',
      expected: 'A deterministic validator-visible request type before traversal.',
      actual: requestType,
      suggestedFix: 'Ask for clarification or rerun the future AI analyzer with more context before graph traversal.',
    })
    return 'unknown-request-type-clarification-required'
  }

  return 'valid'
}

function validateCandidateOnlyBoundaries(
  record: JsonRecord,
  findings: RequestIrCandidateValidationFinding[],
): RequestIrCandidateValidationResult['candidateBoundaryValidationStatus'] {
  const before = findings.length
  expectField(record, findings, 'requestIrCandidateStatus', 'candidate-only')
  expectField(record, findings, 'candidateOnly', true)
  expectField(record, findings, 'authorityStatus', 'not-authoritative-until-validated')
  expectField(record, findings, 'graphTraversalAllowed', false)
  expectField(record, findings, 'contractGenerationAllowed', false)
  expectField(record, findings, 'instructionPackGenerationAllowed', false)
  expectField(record, findings, 'validatedRequestIr', false, { optional: true })
  expectField(record, findings, 'graphSourceMutated', false, { optional: true })
  expectField(record, findings, 'graphDeltaApplied', false, { optional: true })
  expectField(record, findings, 'equivalenceProven', false, { optional: true })
  expectField(record, findings, 'runtimeEvidenceSatisfied', false, { optional: true })
  expectField(record, findings, 'approvalStatus', 'not-approved', { optional: true })
  return findings.length === before ? 'valid' : 'invalid'
}

function validateConfidence(
  record: JsonRecord,
  findings: RequestIrCandidateValidationFinding[],
): RequestIrCandidateValidationResult['confidenceValidationStatus'] {
  const confidence = asRecord(record.confidence)
  if (!confidence) {
    findings.push({
      code: 'REQUEST_IR_CANDIDATE_CONFIDENCE_INVALID',
      severity: 'error',
      field: 'confidence',
      message: 'confidence must be an object with a numeric score and a band.',
      suggestedFix: 'Provide confidence.score and confidence.band before schema-only validation can pass.',
    })
    return 'invalid'
  }

  if (typeof confidence.score !== 'number' || Number.isNaN(confidence.score)) {
    findings.push({
      code: 'REQUEST_IR_CANDIDATE_CONFIDENCE_SCORE_INVALID',
      severity: 'error',
      field: 'confidence.score',
      message: 'confidence.score must be a number.',
      actual: confidence.score,
    })
    return 'invalid'
  }
  if (confidence.score < 0 || confidence.score > 1) {
    findings.push({
      code: 'REQUEST_IR_CANDIDATE_CONFIDENCE_SCORE_OUT_OF_RANGE',
      severity: 'error',
      field: 'confidence.score',
      message: 'confidence.score must be between 0 and 1.',
      actual: confidence.score,
    })
    return 'invalid'
  }

  if (!['low', 'medium', 'high', 'unknown'].includes(String(confidence.band))) {
    findings.push({
      code: 'REQUEST_IR_CANDIDATE_CONFIDENCE_BAND_INVALID',
      severity: 'error',
      field: 'confidence.band',
      message: 'confidence.band must be one of low, medium, high, or unknown.',
      actual: confidence.band,
    })
    return 'invalid'
  }

  if (confidence.band === 'low' || confidence.band === 'unknown') {
    findings.push({
      code: 'REQUEST_IR_CANDIDATE_CONFIDENCE_REQUIRES_CLARIFICATION',
      severity: 'warning',
      field: 'confidence.band',
      message:
        'Low or unknown confidence may proceed only to clarification or human review; graph traversal remains disallowed.',
      actual: confidence.band,
    })
    return 'clarification-required'
  }

  return 'valid'
}

function validateAmbiguities(
  record: JsonRecord,
  findings: RequestIrCandidateValidationFinding[],
): RequestIrCandidateValidationResult['ambiguityValidationStatus'] {
  if (!Array.isArray(record.ambiguities)) {
    findings.push({
      code: 'REQUEST_IR_CANDIDATE_AMBIGUITIES_INVALID',
      severity: 'error',
      field: 'ambiguities',
      message: 'ambiguities must be an array.',
      actual: record.ambiguities,
    })
    return 'invalid'
  }

  const unresolvedAmbiguities = record.ambiguities.filter((entry) => {
    const ambiguity = asRecord(entry)
    return !ambiguity || ambiguity.status !== 'resolved'
  })

  if (unresolvedAmbiguities.length > 0) {
    findings.push({
      code: 'REQUEST_IR_CANDIDATE_UNRESOLVED_AMBIGUITY',
      severity: 'warning',
      field: 'ambiguities',
      message: 'One or more candidate ambiguities remain unresolved; human review remains required.',
      actual: unresolvedAmbiguities.length,
      suggestedFix: 'Resolve ambiguity through deterministic validation or human clarification before traversal.',
    })
    return 'human-review-required'
  }

  return 'no-unresolved-ambiguity'
}

function expectField(
  record: JsonRecord,
  findings: RequestIrCandidateValidationFinding[],
  field: string,
  expected: unknown,
  options: { optional?: boolean } = {},
): void {
  if (options.optional && !(field in record)) {
    return
  }
  if (record[field] !== expected) {
    findings.push({
      code: 'REQUEST_IR_CANDIDATE_BOUNDARY_UNSAFE',
      severity: 'error',
      field,
      message: `${field} must be ${JSON.stringify(expected)} for schema-only Request IR Candidate validation.`,
      expected,
      actual: record[field],
      suggestedFix:
        'Keep AI analyzer output candidate-only. Do not mark graph traversal, contract generation, approval, graph mutation, or Evidence satisfaction as complete in the candidate artifact.',
    })
  }
}

function buildResult(
  candidatePath: string,
  findings: RequestIrCandidateValidationFinding[],
  options: {
    allowedEnumValidationStatus: RequestIrCandidateValidationResult['allowedEnumValidationStatus']
    candidateBoundaryValidationStatus: RequestIrCandidateValidationResult['candidateBoundaryValidationStatus']
    confidenceValidationStatus: RequestIrCandidateValidationResult['confidenceValidationStatus']
    ambiguityValidationStatus: RequestIrCandidateValidationResult['ambiguityValidationStatus']
    requiresClarification: boolean
    humanReviewRequired: boolean
  },
): RequestIrCandidateValidationResult {
  const blocked = findings.some((finding) => finding.severity === 'error')
  return {
    schemaVersion: 1,
    artifactRole: 'request-ir-candidate-schema-only-validation',
    status: blocked
      ? 'request-ir-candidate-schema-only-validation-blocked'
      : 'request-ir-candidate-schema-only-validation-complete',
    validatorName: VALIDATOR_NAME,
    validationScope: 'schema-and-boundary-only',
    candidatePath,
    schemaValidationStatus: blocked ? 'schema-invalid' : 'schema-valid',
    requestIrValidationStatus: blocked ? 'validation-blocked' : 'schema-valid-graph-validation-not-run',
    allowedEnumValidationStatus: options.allowedEnumValidationStatus,
    candidateBoundaryValidationStatus: options.candidateBoundaryValidationStatus,
    confidenceValidationStatus: options.confidenceValidationStatus,
    ambiguityValidationStatus: options.ambiguityValidationStatus,
    graphAuthorityValidationStatus: 'not-run',
    graphTraversalAllowed: false,
    contractGenerationAllowed: false,
    instructionPackGenerationAllowed: false,
    requiresClarification: options.requiresClarification,
    humanReviewRequired: options.humanReviewRequired,
    graphValidationRequired: true,
    selectedGraphSliceGenerated: false,
    contractCompilerInputGenerated: false,
    instructionPackGenerated: false,
    aiClassifierImplemented: false,
    llmCallsIntroduced: false,
    graphSourceInspected: false,
    graphNodeExistenceValidated: false,
    graphEdgeExistenceValidated: false,
    graphSourceMutated: false,
    graphDeltaApplied: false,
    approvalStatus: 'not-approved',
    equivalenceProven: false,
    runtimeEvidenceSatisfied: false,
    outputWritePolicy: 'explicit-output-only',
    writtenOutputPath: null,
    writtenOutputPathAuthorityStatus: 'not-written-stdout-only',
    validationFindings: findings,
    nonExecutionBoundary:
      'This schema-only Request IR Candidate validator checks candidate structure and safety boundaries only. It does not call an LLM, inspect graph-source, validate graph node or edge existence, run graph traversal, select graph slices, generate contract compiler input, generate instruction packs, mutate graph-source, apply graph deltas, approve work, satisfy runtime Evidence, prove equivalence, enforce scope, reject diffs, or configure required checks.',
  }
}

function asRecord(value: unknown): JsonRecord | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return null
  }
  return value as JsonRecord
}

function resolveRepoPath(root: string, inputPath: string): string {
  return path.isAbsolute(inputPath) ? inputPath : path.resolve(root, inputPath)
}
