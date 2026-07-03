import path from 'node:path'
import { readJsonSafe, relativePath, writeJsonAtomic, writeTextAtomic } from './fs.js'
import type { IssueSeverity } from './types.js'

const GENERATOR_NAME = 'ClarificationInterviewPackGenerator'
const EXPECTED_BOUNDARY_ROLE = 'clarification-interview-boundary-preview'
const EXPECTED_BOUNDARY_STATUS = 'clarification-interview-boundary-previewed'
const DEFAULT_ALLOWED_QUESTION_FIELDS = new Set([
  'requestTypeCandidate',
  'targetRecordIdCandidate',
  'targetComponentCandidate',
  'allowedScopeIntentCandidate',
  'forbiddenScopeIntentCandidate',
  'requiredEvidenceIntentCandidate',
  'riskIntentCandidate',
])
const REQUEST_IR_CANDIDATE_ROLES = new Set(['request-ir-candidate', 'request-ir-candidate-calibration-fixture-preview'])

type JsonRecord = Record<string, unknown>

export interface ClarificationInterviewPackFinding {
  code: string
  severity: IssueSeverity
  field?: string
  message: string
  expected?: unknown
  actual?: unknown
  suggestedFix?: string
}

export interface ClarificationInterviewQuestion {
  questionId: string
  mapsToRequestIrField: string
  prompt: string
  choices: JsonRecord[]
  freeformAllowed: boolean
  answerAuthorityStatus: 'clarification-answer-not-approval'
  sourceTriggerId?: string
}

export interface ClarificationInterviewPack {
  schemaVersion: 1
  artifactRole: 'clarification-interview-pack'
  status: 'clarification-interview-pack-generated' | 'clarification-interview-pack-blocked'
  generatorName: typeof GENERATOR_NAME
  packScope: 'request-ir-candidate-to-clarification-question-plan-preview-no-interview'
  sourceClarificationBoundary: string
  sourceRequestIrCandidate: string
  clarificationInterviewPackGenerated: boolean
  questionPlanStatus:
    | 'no-questions-required-for-current-calibration-candidate'
    | 'questions-planned-for-ambiguous-candidate'
    | 'blocked'
  questionCount: number
  plannedQuestions: ClarificationInterviewQuestion[]
  triggerFindings: JsonRecord[]
  carriedAmbiguities: JsonRecord[]
  clarificationTriggerPolicy: JsonRecord
  questionModel: JsonRecord
  revisedRequestIrCandidateBoundary: JsonRecord
  validationChainRequiredAgain: JsonRecord[]
  interviewImplemented: false
  interactiveInterviewImplemented: false
  interactiveUiImplemented: false
  llmInvoked: false
  networkCallsAllowed: false
  requestIrCandidateRevised: false
  candidateOnly: true
  candidateAuthorityStatus: 'request-ir-candidate-not-validated'
  revisedCandidateAuthorityStatus: 'clarification-derived-candidate-not-validated'
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
  validationFindings: ClarificationInterviewPackFinding[]
  outputWritePolicy: 'explicit-output-only'
  writtenOutputPath: string | null
  markdownReportPath: string | null
  writtenOutputPathAuthorityStatus: 'not-written-stdout-only' | 'explicit-preview-output-not-source-authority'
  markdownReportAuthorityStatus: 'not-written' | 'explicit-preview-output-not-source-authority'
  nonExecutionBoundary: string
}

export interface ClarificationInterviewPackFileResult {
  pack: ClarificationInterviewPack
  outputPath?: string
  markdownReport?: string
}

export function generateClarificationInterviewPack(
  boundaryArtifact: unknown,
  candidateArtifact: unknown,
  paths: { boundaryPath?: string; candidatePath?: string } = {},
): ClarificationInterviewPack {
  const boundary = asRecord(boundaryArtifact)
  const candidate = asRecord(candidateArtifact)
  const findings: ClarificationInterviewPackFinding[] = []
  validateClarificationBoundary(boundary, findings)
  validateRequestIrCandidate(candidate, findings)

  const prerequisiteBlocked = findings.some((finding) => finding.severity === 'error')
  const triggerFindings = prerequisiteBlocked ? [] : detectClarificationTriggers(candidate)
  const plannedQuestions = prerequisiteBlocked ? [] : buildPlannedQuestions(boundary, triggerFindings)
  validatePlannedQuestionVocabulary(boundary, plannedQuestions, findings)
  const blocked = findings.some((finding) => finding.severity === 'error')
  const revisedBoundary = asRecord(boundary?.revisedRequestIrCandidateBoundary) ?? {}
  const validationChainRequiredAgain = arrayRecords(revisedBoundary.validationChainRequiredAgain)

  return {
    schemaVersion: 1,
    artifactRole: 'clarification-interview-pack',
    status: blocked ? 'clarification-interview-pack-blocked' : 'clarification-interview-pack-generated',
    generatorName: GENERATOR_NAME,
    packScope: 'request-ir-candidate-to-clarification-question-plan-preview-no-interview',
    sourceClarificationBoundary: paths.boundaryPath ?? '<in-memory>',
    sourceRequestIrCandidate: paths.candidatePath ?? '<in-memory>',
    clarificationInterviewPackGenerated: !blocked,
    questionPlanStatus: blocked
      ? 'blocked'
      : plannedQuestions.length > 0
        ? 'questions-planned-for-ambiguous-candidate'
        : 'no-questions-required-for-current-calibration-candidate',
    questionCount: plannedQuestions.length,
    plannedQuestions,
    triggerFindings,
    carriedAmbiguities: arrayRecords(candidate?.ambiguities),
    clarificationTriggerPolicy: asRecord(boundary?.clarificationTriggerPolicy) ?? {},
    questionModel: asRecord(boundary?.interviewQuestionModel) ?? {},
    revisedRequestIrCandidateBoundary: revisedBoundary,
    validationChainRequiredAgain,
    interviewImplemented: false,
    interactiveInterviewImplemented: false,
    interactiveUiImplemented: false,
    llmInvoked: false,
    networkCallsAllowed: false,
    requestIrCandidateRevised: false,
    candidateOnly: true,
    candidateAuthorityStatus: 'request-ir-candidate-not-validated',
    revisedCandidateAuthorityStatus: 'clarification-derived-candidate-not-validated',
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
    outputWritePolicy: 'explicit-output-only',
    writtenOutputPath: null,
    markdownReportPath: null,
    writtenOutputPathAuthorityStatus: 'not-written-stdout-only',
    markdownReportAuthorityStatus: 'not-written',
    nonExecutionBoundary:
      'This Clarification Interview Pack is a deterministic question-plan preview only. It does not implement an interview UI, call an LLM, make network calls, revise a Request IR Candidate, run Request IR validation, run graph traversal, generate selected graph slices, generate Contract Compiler Input, generate Instruction Packs, trigger Codex execution, mutate graph-source, apply graph deltas, approve work, record human decisions, satisfy runtime Evidence, prove equivalence, enforce scope, or configure CI.',
  }
}

export function renderClarificationInterviewPackMarkdown(pack: ClarificationInterviewPack): string {
  return [
    '# Clarification Interview Pack',
    '',
    `Status: ${pack.status}`,
    `Question plan: ${pack.questionPlanStatus}`,
    '',
    '## Question Plan',
    '',
    ...renderQuestions(pack.plannedQuestions),
    '',
    '## Trigger Findings',
    '',
    ...renderTriggerFindings(pack.triggerFindings),
    '',
    '## Revised Candidate Boundary',
    '',
    '- Clarification answers may create only a revised Request IR Candidate.',
    '- Revised candidates remain candidate-only and must rerun schema-only and graph-aware validation.',
    '- Clarification answers are not approval, acceptance, runtime Evidence satisfaction, or graph-source authority.',
    '',
    '## Boundary',
    '',
    '- This pack does not implement an interview UI.',
    '- This pack does not call an LLM or API.',
    '- This pack does not revise a Request IR Candidate.',
    '- This pack does not run graph traversal, generate selected graph slices, generate Contract Compiler Input, generate Instruction Packs, or trigger Codex execution.',
    '- This pack does not mutate graph-source, apply graph deltas, approve work, record human decisions, satisfy runtime Evidence, prove equivalence, enforce scope, or configure CI.',
    `- ${pack.nonExecutionBoundary}`,
    '',
  ].join('\n')
}

export async function generateClarificationInterviewPackFile(
  root: string,
  boundaryPath: string,
  candidatePath: string,
  options: { output?: string; markdown?: string } = {},
): Promise<ClarificationInterviewPackFileResult> {
  const resolvedBoundaryPath = resolveRepoPath(root, boundaryPath)
  const resolvedCandidatePath = resolveRepoPath(root, candidatePath)
  const boundary = await readJsonSafe<JsonRecord>(resolvedBoundaryPath)
  if (!boundary.ok) {
    throw new Error(`Unable to read Clarification Interview boundary from ${boundaryPath}: ${boundary.error}`)
  }
  const candidate = await readJsonSafe<JsonRecord>(resolvedCandidatePath)
  if (!candidate.ok) {
    throw new Error(`Unable to read Request IR Candidate from ${candidatePath}: ${candidate.error}`)
  }

  await assertPackOutputAuthority(
    root,
    resolvedBoundaryPath,
    resolvedCandidatePath,
    boundary.value,
    candidate.value,
    options,
  )
  const pack = generateClarificationInterviewPack(boundary.value, candidate.value, {
    boundaryPath: relativePath(root, resolvedBoundaryPath),
    candidatePath: relativePath(root, resolvedCandidatePath),
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
    await writeTextAtomic(resolvedMarkdownPath, renderClarificationInterviewPackMarkdown(pack))
    if (options.output && outputPath) {
      await writeJsonAtomic(resolveRepoPath(root, options.output), pack)
    }
  }

  return { pack, ...(outputPath ? { outputPath } : {}), ...(markdownReport ? { markdownReport } : {}) }
}

async function assertPackOutputAuthority(
  root: string,
  resolvedBoundaryPath: string,
  resolvedCandidatePath: string,
  boundary: JsonRecord,
  candidate: JsonRecord,
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
      `Clarification Interview Pack preview output is unsafe: --output and --markdown resolve to the same path (${requestedTargets[0].requestedPath}).`,
    )
  }

  const protectedPaths = buildProtectedOutputPathMap(
    root,
    resolvedBoundaryPath,
    resolvedCandidatePath,
    boundary,
    candidate,
  )
  for (const target of requestedTargets) {
    const protectedReason = protectedPaths.get(pathKey(target.resolvedPath))
    if (protectedReason) {
      throw new Error(
        `Clarification Interview Pack preview ${target.kind} path is unsafe: ${target.requestedPath} would overwrite ${protectedReason}.`,
      )
    }
    const existingAuthority = await classifyExistingSourceAuthority(target.resolvedPath)
    if (existingAuthority) {
      throw new Error(
        `Clarification Interview Pack preview ${target.kind} path is unsafe: ${target.requestedPath} already contains ${existingAuthority}. Choose a dedicated clarification-pack preview output path.`,
      )
    }
  }
}

function buildProtectedOutputPathMap(
  root: string,
  resolvedBoundaryPath: string,
  resolvedCandidatePath: string,
  boundary: JsonRecord,
  candidate: JsonRecord,
): Map<string, string> {
  const protectedPaths = new Map<string, string>()
  const add = (candidatePath: unknown, reason: string): void => {
    const value = stringValue(candidatePath)
    if (!isConcreteOutputProtectedPath(value)) {
      return
    }
    const key = pathKey(resolveRepoPath(root, value))
    if (!protectedPaths.has(key)) {
      protectedPaths.set(key, reason)
    }
  }

  protectedPaths.set(pathKey(resolvedBoundaryPath), 'the source Clarification Interview boundary')
  protectedPaths.set(pathKey(resolvedCandidatePath), 'the source Request IR Candidate')
  for (const linkedPath of collectConcretePathStrings(boundary)) {
    add(linkedPath, `linked Clarification Interview boundary artifact ${linkedPath}`)
  }
  for (const linkedPath of collectConcretePathStrings(candidate)) {
    add(linkedPath, `linked Request IR Candidate artifact ${linkedPath}`)
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
  if (artifactRole.includes('graph-source')) {
    return `graph-source artifactRole "${artifactRole}"`
  }
  if (
    artifactRole.includes('boundary') ||
    artifactRole.includes('request-ir') ||
    artifactRole.includes('analyzer') ||
    artifactRole === 'graph-traversal-plan' ||
    artifactRole === 'selected-graph-slice' ||
    artifactRole === 'contract-compiler-input' ||
    artifactRole === 'instruction-pack' ||
    artifactRole === 'devview-frontend-chain-report'
  ) {
    return `selected frontend/source artifactRole "${artifactRole}"`
  }
  if (asRecord(record.sourceRecords)) {
    return 'graph-source-shaped sourceRecords'
  }
  if (asRecord(record.taxonomy) && (Array.isArray(record.nodes) || Array.isArray(record.edges))) {
    return 'generated read-model source-authority projection'
  }
  return null
}

function validateClarificationBoundary(
  boundary: JsonRecord | null,
  findings: ClarificationInterviewPackFinding[],
): void {
  if (!boundary) {
    findings.push({
      code: 'CLARIFICATION_BOUNDARY_NOT_OBJECT',
      severity: 'error',
      field: 'boundary',
      message: 'Clarification Interview Pack generation requires a boundary JSON object.',
    })
    return
  }

  const expectedFields: Array<[string, unknown]> = [
    ['artifactRole', EXPECTED_BOUNDARY_ROLE],
    ['status', EXPECTED_BOUNDARY_STATUS],
    ['interviewImplemented', false],
    ['llmInvoked', false],
    ['networkCallsAllowed', false],
    ['requestIrCandidateRevised', false],
    ['candidateOnly', true],
    ['graphTraversalAllowed', false],
    ['selectedGraphSliceGenerated', false],
    ['contractInputGenerated', false],
    ['instructionPackGenerated', false],
    ['codexExecutionTriggered', false],
  ]

  for (const [field, expected] of expectedFields) {
    if (boundary[field] !== expected) {
      findings.push({
        code: 'CLARIFICATION_BOUNDARY_UNSAFE_OR_MISMATCHED',
        severity: 'error',
        field,
        message: `Clarification Interview boundary field "${field}" is not safe for question-plan generation.`,
        expected,
        actual: boundary[field],
        suggestedFix: 'Restore the Clarification Interview boundary preview before generating a question plan.',
      })
    }
  }
}

function validateRequestIrCandidate(candidate: JsonRecord | null, findings: ClarificationInterviewPackFinding[]): void {
  if (!candidate) {
    findings.push({
      code: 'REQUEST_IR_CANDIDATE_NOT_OBJECT',
      severity: 'error',
      field: 'candidate',
      message: 'Clarification Interview Pack generation requires a Request IR Candidate JSON object.',
    })
    return
  }

  const artifactRole = stringValue(candidate.artifactRole)
  if (!REQUEST_IR_CANDIDATE_ROLES.has(artifactRole)) {
    findings.push({
      code: 'REQUEST_IR_CANDIDATE_ROLE_UNSUPPORTED',
      severity: 'error',
      field: 'artifactRole',
      message: 'Clarification Interview Pack generation requires a Request IR Candidate artifact.',
      expected: [...REQUEST_IR_CANDIDATE_ROLES],
      actual: candidate.artifactRole,
    })
  }

  const expectedFields: Array<[string, unknown]> = [
    ['requestIrCandidateStatus', 'candidate-only'],
    ['candidateOnly', true],
    ['authorityStatus', 'not-authoritative-until-validated'],
    ['graphTraversalAllowed', false],
    ['contractGenerationAllowed', false],
    ['instructionPackGenerationAllowed', false],
  ]

  for (const [field, expected] of expectedFields) {
    if (candidate[field] !== expected) {
      findings.push({
        code: 'REQUEST_IR_CANDIDATE_AUTHORITY_UNSAFE',
        severity: 'error',
        field,
        message: `Request IR Candidate field "${field}" is unsafe for clarification question-plan generation.`,
        expected,
        actual: candidate[field],
        suggestedFix:
          'Use candidate-only analyzer output or a calibration Request IR Candidate. Do not feed traversal or contract authority into the clarification pack generator.',
      })
    }
  }
}

function detectClarificationTriggers(candidate: JsonRecord | null): JsonRecord[] {
  if (!candidate) {
    return []
  }
  const triggers: JsonRecord[] = []
  const confidence = asRecord(candidate.confidence)
  const confidenceBand = stringValue(confidence?.band).toLowerCase()
  const confidenceScore = typeof confidence?.score === 'number' ? confidence.score : null

  if (candidate.requiresClarification === true) {
    triggers.push({
      triggerId: 'candidate-requires-clarification',
      mapsToRequestIrField: 'riskIntentCandidate',
      reason: 'Request IR Candidate explicitly requires clarification.',
      result: 'clarification-required',
    })
  }
  if (confidenceBand === 'low' || (confidenceScore !== null && confidenceScore < 0.5)) {
    triggers.push({
      triggerId: 'low-confidence',
      mapsToRequestIrField: 'requestTypeCandidate',
      reason: 'Request IR Candidate confidence is below the clarification threshold.',
      result: 'clarification-required',
    })
  }
  if (stringValue(candidate.requestTypeCandidate) === 'unknown') {
    triggers.push({
      triggerId: 'unknown-request-type',
      mapsToRequestIrField: 'requestTypeCandidate',
      reason: 'Request IR Candidate has unknown request type.',
      result: 'clarification-required',
    })
  }
  if (!stringValue(candidate.targetRecordIdCandidate) || !stringValue(candidate.targetComponentCandidate)) {
    triggers.push({
      triggerId: 'missing-target-record-or-component',
      mapsToRequestIrField: !stringValue(candidate.targetRecordIdCandidate)
        ? 'targetRecordIdCandidate'
        : 'targetComponentCandidate',
      reason: 'Target record or component candidate is missing.',
      result: 'clarification-required',
    })
  }
  if (!hasUsefulValue(candidate.requiredEvidenceIntentCandidate)) {
    triggers.push({
      triggerId: 'missing-evidence-requirement',
      mapsToRequestIrField: 'requiredEvidenceIntentCandidate',
      reason: 'Required evidence intent is missing or empty.',
      result: 'clarification-required',
    })
  }
  if (impliesApprovalApplyOrEnforcement(candidate)) {
    triggers.push({
      triggerId: 'implicit-approval-apply-or-enforcement',
      mapsToRequestIrField: 'forbiddenScopeIntentCandidate',
      reason: 'Request text or intent appears to ask for approval, apply, acceptance, enforcement, or CI authority.',
      result: 'human-review-required',
    })
  }

  return uniqueTriggerFindings(triggers)
}

function buildPlannedQuestions(
  boundary: JsonRecord | null,
  triggerFindings: JsonRecord[],
): ClarificationInterviewQuestion[] {
  if (triggerFindings.length === 0) {
    return []
  }
  const examples = arrayRecords(asRecord(boundary?.interviewQuestionModel)?.exampleQuestions)
  const allowedFields = getAllowedQuestionFields(boundary)
  const maxQuestions = Math.max(
    1,
    Math.min(3, numberValue(asRecord(asRecord(boundary?.interviewQuestionModel)?.questionCountPerTurn)?.maximum) || 3),
  )
  const questions: ClarificationInterviewQuestion[] = []

  for (const trigger of triggerFindings) {
    if (questions.length >= maxQuestions) {
      break
    }
    const mappedField = normalizeQuestionField(stringValue(trigger.mapsToRequestIrField), allowedFields)
    const example = examples.find((entry) => stringValue(entry.mapsToRequestIrField) === mappedField)
    const question = normalizeQuestion(example, trigger, allowedFields) ?? questionFromTrigger(trigger, allowedFields)
    if (!questions.some((entry) => entry.mapsToRequestIrField === question.mapsToRequestIrField)) {
      questions.push(question)
    }
  }

  while (questions.length === 0 && examples.length > 0) {
    const example = examples[0]
    const question = normalizeQuestion(example, { triggerId: 'boundary-example-question' }, allowedFields)
    if (question) {
      questions.push(question)
    }
    break
  }

  return questions.slice(0, maxQuestions)
}

function normalizeQuestion(
  question: JsonRecord | undefined,
  trigger: JsonRecord,
  allowedFields: Set<string>,
): ClarificationInterviewQuestion | null {
  if (!question) {
    return null
  }
  const questionId = stringValue(question.questionId)
  const mapsToRequestIrField = stringValue(question.mapsToRequestIrField)
  const prompt = stringValue(question.prompt)
  if (!questionId || !mapsToRequestIrField || !prompt || !allowedFields.has(mapsToRequestIrField)) {
    return null
  }
  return {
    questionId,
    mapsToRequestIrField,
    prompt,
    choices: arrayRecords(question.choices),
    freeformAllowed: question.freeformAllowed !== false,
    answerAuthorityStatus: 'clarification-answer-not-approval',
    sourceTriggerId: stringValue(trigger.triggerId) || undefined,
  }
}

function questionFromTrigger(trigger: JsonRecord, allowedFields: Set<string>): ClarificationInterviewQuestion {
  const triggerId = stringValue(trigger.triggerId) || 'clarification-required'
  const field = normalizeQuestionField(stringValue(trigger.mapsToRequestIrField), allowedFields)
  return {
    questionId: `clarify-${field.replaceAll(/[^a-zA-Z0-9]+/g, '-').toLowerCase()}`,
    mapsToRequestIrField: field,
    prompt: promptForField(field),
    choices: [
      {
        label: 'Keep unknown',
        candidateValue: 'unknown',
        authorityStatus: 'answer-candidate-not-validated',
      },
    ],
    freeformAllowed: true,
    answerAuthorityStatus: 'clarification-answer-not-approval',
    sourceTriggerId: triggerId,
  }
}

function promptForField(field: string): string {
  switch (field) {
    case 'requestTypeCandidate':
      return 'Which request type best describes this change?'
    case 'targetRecordIdCandidate':
      return 'Which graph record should this request target?'
    case 'targetComponentCandidate':
      return 'Which component should this request target?'
    case 'allowedScopeIntentCandidate':
      return 'What scope may be changed or reported for this request?'
    case 'forbiddenScopeIntentCandidate':
      return 'What scope must remain forbidden for this request?'
    case 'requiredEvidenceIntentCandidate':
      return 'What evidence should be produced or reviewed for this request?'
    case 'riskIntentCandidate':
      return 'What risk or impact should DevView account for?'
    default:
      return 'What clarification should DevView use before revising the Request IR Candidate?'
  }
}

function normalizeQuestionField(field: string, allowedFields: Set<string>): string {
  if (allowedFields.has(field)) {
    return field
  }
  if (field === 'ambiguities' && allowedFields.has('riskIntentCandidate')) {
    return 'riskIntentCandidate'
  }
  if (field === 'confidence' && allowedFields.has('requestTypeCandidate')) {
    return 'requestTypeCandidate'
  }
  if (allowedFields.has('riskIntentCandidate')) {
    return 'riskIntentCandidate'
  }
  return [...allowedFields][0] ?? 'riskIntentCandidate'
}

function validatePlannedQuestionVocabulary(
  boundary: JsonRecord | null,
  questions: ClarificationInterviewQuestion[],
  findings: ClarificationInterviewPackFinding[],
): void {
  const allowedFields = getAllowedQuestionFields(boundary)
  for (const question of questions) {
    if (!allowedFields.has(question.mapsToRequestIrField)) {
      findings.push({
        code: 'CLARIFICATION_QUESTION_FIELD_OUTSIDE_BOUNDARY_VOCABULARY',
        severity: 'error',
        field: 'plannedQuestions[].mapsToRequestIrField',
        message:
          'Clarification Interview Pack generated a question mapped to a field outside the boundary question vocabulary.',
        expected: [...allowedFields],
        actual: question.mapsToRequestIrField,
        suggestedFix:
          'Map clarification triggers to requestTypeCandidate, targetRecordIdCandidate, targetComponentCandidate, allowedScopeIntentCandidate, forbiddenScopeIntentCandidate, requiredEvidenceIntentCandidate, or riskIntentCandidate only.',
      })
    }
  }
}

function getAllowedQuestionFields(boundary: JsonRecord | null): Set<string> {
  const questionShape = asRecord(asRecord(boundary?.interviewQuestionModel)?.questionShape)
  const fieldVocabulary = stringValue(questionShape?.mapsToRequestIrField)
  const parsedFields = fieldVocabulary
    .split('|')
    .map((entry) => entry.trim())
    .filter((entry) => DEFAULT_ALLOWED_QUESTION_FIELDS.has(entry))
  return parsedFields.length > 0 ? new Set(parsedFields) : new Set(DEFAULT_ALLOWED_QUESTION_FIELDS)
}

function hasUsefulValue(value: unknown): boolean {
  if (typeof value === 'string') {
    return value.trim().length > 0
  }
  if (Array.isArray(value)) {
    return value.length > 0
  }
  if (asRecord(value)) {
    return Object.keys(value as JsonRecord).length > 0
  }
  return value !== null && value !== undefined
}

function impliesApprovalApplyOrEnforcement(candidate: JsonRecord): boolean {
  const haystack = [
    stringValue(candidate.requestText),
    stringValue(candidate.intentSummaryCandidate),
    stringValue(candidate.allowedScopeIntentCandidate),
  ]
    .join(' ')
    .toLowerCase()
  return /\b(approve|approval|apply|accept|acceptance|enforce|enforcement|ci|required check|satisfy evidence|equivalence)\b/.test(
    haystack,
  )
}

function uniqueTriggerFindings(findings: JsonRecord[]): JsonRecord[] {
  const seen = new Set<string>()
  const unique: JsonRecord[] = []
  for (const finding of findings) {
    const key = stringValue(finding.triggerId) || JSON.stringify(finding)
    if (!seen.has(key)) {
      seen.add(key)
      unique.push(finding)
    }
  }
  return unique
}

function renderQuestions(questions: ClarificationInterviewQuestion[]): string[] {
  if (questions.length === 0) {
    return ['- No clarification questions are required for the current calibration candidate.']
  }
  return questions.flatMap((question, index) => [
    `${index + 1}. ${question.prompt}`,
    `   - mapsToRequestIrField: ${question.mapsToRequestIrField}`,
    `   - freeformAllowed: ${question.freeformAllowed}`,
    `   - answerAuthorityStatus: ${question.answerAuthorityStatus}`,
  ])
}

function renderTriggerFindings(findings: JsonRecord[]): string[] {
  if (findings.length === 0) {
    return ['- none']
  }
  return findings.map(
    (finding) =>
      `- ${stringValue(finding.triggerId) || 'clarification-trigger'}: ${stringValue(finding.reason) || 'clarification required'}`,
  )
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

function stringValue(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

function numberValue(value: unknown): number {
  return typeof value === 'number' ? value : 0
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
