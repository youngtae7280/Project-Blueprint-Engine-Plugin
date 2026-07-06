import path from 'node:path'
import { readJsonSafe, readTextSafe, relativePath, writeJsonAtomic, writeTextAtomic } from './fs.js'
import type { IssueSeverity } from './types.js'

const REPORTER_NAME = 'StopPostRunAdvisoryReporter'
const REPORT_ROLE = 'devview-stop-post-run-advisory-report'

type JsonRecord = Record<string, unknown>

type PostRunCompletenessStatus =
  | 'preflight-context-not-ready'
  | 'missing-changed-files'
  | 'clean-no-changes-observed'
  | 'missing-instruction-pack'
  | 'missing-scope-report'
  | 'missing-proposal'
  | 'missing-review-packet'
  | 'review-ready-not-approved'
  | 'input-safety-findings-reported'

export interface StopPostRunAdvisoryOptions {
  userPromptAdvisory: string
  hookHealth: string
  preflightSession?: string
  instructionPack?: string
  instructionMarkdown?: string
  changedFiles?: string
  scopeReport?: string
  runtimeReport?: string
  proposal?: string
  reviewPacket?: string
  output: string
  markdown?: string
}

export interface StopPostRunAdvisoryFinding {
  code: string
  severity: IssueSeverity
  field?: string
  message: string
  expected?: unknown
  actual?: unknown
  suggestedFix?: string
}

export interface StopPostRunAdvisoryReport {
  schemaVersion: 1
  artifactRole: typeof REPORT_ROLE
  status:
    | 'stop-post-run-advisory-generated'
    | 'stop-post-run-advisory-clean-no-op'
    | 'stop-post-run-advisory-missing-artifacts'
    | 'stop-post-run-advisory-review-ready-not-approved'
    | 'stop-post-run-advisory-input-findings-reported'
  reporterName: typeof REPORTER_NAME
  lifecycleEvent: 'Stop/PostRun'
  sourceUserPromptSubmitAdvisory: string
  sourceHookGatewayHealth: string
  sourcePreflightSessionChain: string | null
  sourceInstructionPack: string | null
  sourceInstructionMarkdown: string | null
  sourceChangedFiles: string | null
  sourceScopeReport: string | null
  sourceRuntimeReport: string | null
  sourceGraphDeltaProposal: string | null
  sourceHumanReviewPacket: string | null
  postRunCompletenessStatus: PostRunCompletenessStatus
  userPromptSubmitContextReady: boolean
  preflightTerminalStage: string | null
  changedFileSummary: {
    changedFilesStatus: 'missing' | 'clean-no-changes-observed' | 'changes-present'
    changedFileCount: number
    generatedFileCount: number
    changedFiles: Array<{ path: string; status: string }>
    authorityClass: string
    collectionMode: string
    sourceMode: string
  }
  instructionSummary: {
    instructionPackStatus: 'missing' | 'present'
    taskSummary: string
    allowedScopeCount: number
    forbiddenScopeCount: number
    requiredEvidenceCount: number
    outputRequirementCount: number
    stopConditionCount: number
    knownRiskCount: number
  }
  scopeSummary: {
    scopeReportStatus: 'missing' | 'present'
    scopeComplianceResult: string
    scopeComplianceEvaluationStatus: string
    evaluatedViolationCount: number
    blockingFindingCount: number
    reviewRequiredFindingCount: number
    advisoryFindingCount: number
    forbiddenScopeIndicated: boolean
    nonEnforcing: boolean
  }
  runtimeReportSummary: {
    runtimeReportStatus: 'missing' | 'linked-report-only'
    runtimeReportKind: 'json' | 'markdown-or-text' | 'unknown'
  }
  proposalReviewSummary: {
    proposalStatus: 'missing' | 'present'
    reviewPacketStatus: 'missing' | 'present'
    proposalOnly: boolean
    reviewReadyNotApproved: boolean
    approvalStatus: 'not-approved'
    reviewQuestionCount: number
    blockingReviewItemCount: number
    reviewRequiredItemCount: number
  }
  nextRequiredCommands: string[]
  validationFindings: StopPostRunAdvisoryFinding[]
  advisoryFindings: StopPostRunAdvisoryFinding[]
  codexExecutionControlled: false
  toolBlockingEnabled: false
  preToolUseBlockingEnabled: false
  postToolUseBlockingEnabled: false
  hookScriptsInstalled: false
  hookGatewayActive: 'not-checked-preview-only'
  strictModeEnabled: false
  guidedEnforcementEnabled: false
  changedFilesModified: false
  changedFilesReverted: false
  graphSourceMutated: false
  graphDeltaApplied: false
  approvalStatus: 'not-approved'
  humanDecisionRecorded: false
  runtimeEvidenceSatisfied: false
  evidenceAccepted: false
  equivalenceProven: false
  scopeEnforced: false
  ciEnforcementEnabled: false
  humanReviewRequired: true
  nonEnforcing: true
  outputWritePolicy: 'explicit-output-only'
  writtenOutputPath: string
  markdownReportPath: string | null
  writtenOutputPathAuthorityStatus: 'explicit-preview-output-not-source-authority'
  markdownReportAuthorityStatus: 'not-written' | 'explicit-preview-output-not-source-authority'
  nonExecutionBoundary: string
}

export interface StopPostRunAdvisoryFileResult {
  report: StopPostRunAdvisoryReport
  outputPath: string
  markdownReport?: string
}

interface LoadedJsonSource {
  label: string
  sourcePath: string
  resolvedPath: string
  artifact: JsonRecord
}

interface LoadedTextOrJsonSource {
  label: string
  sourcePath: string
  resolvedPath: string
  artifact: JsonRecord | null
  text: string | null
  kind: 'json' | 'markdown-or-text'
}

interface LoadedInputs {
  userPromptAdvisory: LoadedJsonSource
  hookHealth: LoadedJsonSource
  preflightSession: LoadedJsonSource | null
  instructionPack: LoadedJsonSource | null
  instructionMarkdown: LoadedTextOrJsonSource | null
  changedFiles: LoadedJsonSource | null
  scopeReport: LoadedJsonSource | null
  runtimeReport: LoadedTextOrJsonSource | null
  proposal: LoadedJsonSource | null
  reviewPacket: LoadedTextOrJsonSource | null
}

export async function reportStopPostRunAdvisoryFile(
  root: string,
  options: StopPostRunAdvisoryOptions,
): Promise<StopPostRunAdvisoryFileResult> {
  validateRequiredOptions(options)
  const inputs = await loadInputs(root, options)
  await assertOutputAuthority(root, options, inputs)

  const report = buildReport(root, inputs, options)
  const resolvedOutputPath = resolveRepoPath(root, options.output)
  const resolvedMarkdownPath = options.markdown ? resolveRepoPath(root, options.markdown) : null
  report.markdownReportPath = resolvedMarkdownPath ? relativePath(root, resolvedMarkdownPath) : null
  report.markdownReportAuthorityStatus = resolvedMarkdownPath
    ? 'explicit-preview-output-not-source-authority'
    : 'not-written'

  await writeJsonAtomic(resolvedOutputPath, report)
  if (resolvedMarkdownPath) {
    await writeTextAtomic(resolvedMarkdownPath, renderStopPostRunAdvisoryMarkdown(report))
  }

  return {
    report,
    outputPath: relativePath(root, resolvedOutputPath),
    ...(resolvedMarkdownPath ? { markdownReport: relativePath(root, resolvedMarkdownPath) } : {}),
  }
}

function validateRequiredOptions(options: StopPostRunAdvisoryOptions): void {
  const missing: string[] = []
  if (!options.userPromptAdvisory) missing.push('--user-prompt-advisory')
  if (!options.hookHealth) missing.push('--hook-health')
  if (!options.output) missing.push('--output')
  if (missing.length > 0) {
    throw new Error(`Missing required Stop/Post Run advisory options: ${missing.join(', ')}.`)
  }
}

async function loadInputs(root: string, options: StopPostRunAdvisoryOptions): Promise<LoadedInputs> {
  return {
    userPromptAdvisory: await loadJsonSource(root, 'userPromptAdvisory', options.userPromptAdvisory),
    hookHealth: await loadJsonSource(root, 'hookHealth', options.hookHealth),
    preflightSession: options.preflightSession
      ? await loadJsonSource(root, 'preflightSession', options.preflightSession)
      : null,
    instructionPack: options.instructionPack
      ? await loadJsonSource(root, 'instructionPack', options.instructionPack)
      : null,
    instructionMarkdown: options.instructionMarkdown
      ? await loadTextOrJsonSource(root, 'instructionMarkdown', options.instructionMarkdown)
      : null,
    changedFiles: options.changedFiles ? await loadJsonSource(root, 'changedFiles', options.changedFiles) : null,
    scopeReport: options.scopeReport ? await loadJsonSource(root, 'scopeReport', options.scopeReport) : null,
    runtimeReport: options.runtimeReport
      ? await loadTextOrJsonSource(root, 'runtimeReport', options.runtimeReport)
      : null,
    proposal: options.proposal ? await loadJsonSource(root, 'proposal', options.proposal) : null,
    reviewPacket: options.reviewPacket ? await loadTextOrJsonSource(root, 'reviewPacket', options.reviewPacket) : null,
  }
}

async function loadJsonSource(root: string, label: string, sourcePath: string): Promise<LoadedJsonSource> {
  const resolvedPath = resolveRepoPath(root, sourcePath)
  const result = await readJsonSafe<JsonRecord>(resolvedPath)
  if (!result.ok) {
    throw new Error(`Could not read ${label}: ${result.error}`)
  }
  return {
    label,
    sourcePath: relativePath(root, resolvedPath),
    resolvedPath,
    artifact: requireRecord(result.value, label),
  }
}

async function loadTextOrJsonSource(root: string, label: string, sourcePath: string): Promise<LoadedTextOrJsonSource> {
  const resolvedPath = resolveRepoPath(root, sourcePath)
  const jsonResult = await readJsonSafe<JsonRecord>(resolvedPath)
  if (jsonResult.ok) {
    return {
      label,
      sourcePath: relativePath(root, resolvedPath),
      resolvedPath,
      artifact: requireRecord(jsonResult.value, label),
      text: null,
      kind: 'json',
    }
  }

  const textResult = await readTextSafe(resolvedPath)
  if (!textResult.ok) {
    throw new Error(`Could not read ${label}: ${textResult.error}`)
  }
  return {
    label,
    sourcePath: relativePath(root, resolvedPath),
    resolvedPath,
    artifact: null,
    text: textResult.value,
    kind: 'markdown-or-text',
  }
}

function buildReport(
  root: string,
  inputs: LoadedInputs,
  options: StopPostRunAdvisoryOptions,
): StopPostRunAdvisoryReport {
  const validationFindings = validateInputs(inputs)
  const changedFileSummary = summarizeChangedFiles(inputs.changedFiles?.artifact ?? null)
  const instructionSummary = summarizeInstructionPack(inputs.instructionPack?.artifact ?? null)
  const scopeSummary = summarizeScopeReport(inputs.scopeReport?.artifact ?? null)
  const runtimeReportSummary = summarizeRuntimeReport(inputs.runtimeReport)
  const proposalReviewSummary = summarizeProposalReview(inputs.proposal?.artifact ?? null, inputs.reviewPacket)
  const postRunCompletenessStatus = determineCompletenessStatus(
    inputs,
    validationFindings,
    changedFileSummary,
    instructionSummary,
    scopeSummary,
    proposalReviewSummary,
  )
  const advisoryFindings = buildAdvisoryFindings(
    postRunCompletenessStatus,
    changedFileSummary,
    instructionSummary,
    scopeSummary,
    proposalReviewSummary,
  )

  return {
    schemaVersion: 1,
    artifactRole: REPORT_ROLE,
    status: statusForCompleteness(postRunCompletenessStatus),
    reporterName: REPORTER_NAME,
    lifecycleEvent: 'Stop/PostRun',
    sourceUserPromptSubmitAdvisory: inputs.userPromptAdvisory.sourcePath,
    sourceHookGatewayHealth: inputs.hookHealth.sourcePath,
    sourcePreflightSessionChain: inputs.preflightSession?.sourcePath ?? null,
    sourceInstructionPack: inputs.instructionPack?.sourcePath ?? null,
    sourceInstructionMarkdown: inputs.instructionMarkdown?.sourcePath ?? null,
    sourceChangedFiles: inputs.changedFiles?.sourcePath ?? null,
    sourceScopeReport: inputs.scopeReport?.sourcePath ?? null,
    sourceRuntimeReport: inputs.runtimeReport?.sourcePath ?? null,
    sourceGraphDeltaProposal: inputs.proposal?.sourcePath ?? null,
    sourceHumanReviewPacket: inputs.reviewPacket?.sourcePath ?? null,
    postRunCompletenessStatus,
    userPromptSubmitContextReady: inputs.userPromptAdvisory.artifact.additionalContextInjectionReady === true,
    preflightTerminalStage: stringValue(
      inputs.preflightSession?.artifact.terminalStage ?? inputs.userPromptAdvisory.artifact.preflightTerminalStage,
    ),
    changedFileSummary,
    instructionSummary,
    scopeSummary,
    runtimeReportSummary,
    proposalReviewSummary,
    nextRequiredCommands: nextRequiredCommands(inputs, postRunCompletenessStatus, changedFileSummary),
    validationFindings,
    advisoryFindings,
    codexExecutionControlled: false,
    toolBlockingEnabled: false,
    preToolUseBlockingEnabled: false,
    postToolUseBlockingEnabled: false,
    hookScriptsInstalled: false,
    hookGatewayActive: 'not-checked-preview-only',
    strictModeEnabled: false,
    guidedEnforcementEnabled: false,
    changedFilesModified: false,
    changedFilesReverted: false,
    graphSourceMutated: false,
    graphDeltaApplied: false,
    approvalStatus: 'not-approved',
    humanDecisionRecorded: false,
    runtimeEvidenceSatisfied: false,
    evidenceAccepted: false,
    equivalenceProven: false,
    scopeEnforced: false,
    ciEnforcementEnabled: false,
    humanReviewRequired: true,
    nonEnforcing: true,
    outputWritePolicy: 'explicit-output-only',
    writtenOutputPath: relativePath(root, resolveRepoPath(root, options.output)),
    markdownReportPath: null,
    writtenOutputPathAuthorityStatus: 'explicit-preview-output-not-source-authority',
    markdownReportAuthorityStatus: 'not-written',
    nonExecutionBoundary:
      'This Stop/Post Run advisory report summarizes post-run artifact completeness only. It does not install hooks, trust repositories, start active hook sessions, control or block Codex execution, collect Git changes, run scope checks, generate proposals or review packets, modify or revert changed files, call an LLM/API, invoke providers, mutate graph-source, apply graph deltas, automate approval or human decisions, accept or satisfy Evidence, prove equivalence, enforce scope, or configure CI.',
  }
}

function validateInputs(inputs: LoadedInputs): StopPostRunAdvisoryFinding[] {
  const findings: StopPostRunAdvisoryFinding[] = []
  expectRole(
    inputs.userPromptAdvisory.artifact,
    'userPromptAdvisory',
    'devview-user-prompt-submit-advisory-report',
    findings,
  )
  expectHookHealth(inputs.hookHealth.artifact, findings)
  if (inputs.preflightSession) {
    expectRole(inputs.preflightSession.artifact, 'preflightSession', 'devview-preflight-session-chain-report', findings)
  }
  if (inputs.instructionPack) {
    expectRole(inputs.instructionPack.artifact, 'instructionPack', 'instruction-pack', findings)
    if (inputs.instructionPack.artifact.status !== 'instruction-pack-generated') {
      findings.push({
        code: 'STOP_POST_RUN_ADVISORY_INPUT_STATUS_MISMATCH',
        severity: 'error',
        field: 'instructionPack.status',
        message: 'Instruction Pack must be generated before Stop/Post Run advisory can summarize it.',
        expected: 'instruction-pack-generated',
        actual: inputs.instructionPack.artifact.status,
      })
    }
  }
  if (inputs.changedFiles) {
    expectRole(inputs.changedFiles.artifact, 'changedFiles', 'git-derived-changed-file-collection-preview', findings)
  }
  if (inputs.scopeReport) {
    expectRole(inputs.scopeReport.artifact, 'scopeReport', 'scope-compliance-advisory-evaluation', findings)
  }
  if (inputs.proposal) {
    expectRole(inputs.proposal.artifact, 'proposal', 'graph-delta-proposal-only-preview', findings)
  }
  if (inputs.reviewPacket?.artifact) {
    expectRole(inputs.reviewPacket.artifact, 'reviewPacket', 'graph-delta-human-review-packet', findings)
  }

  for (const source of [
    inputs.userPromptAdvisory,
    inputs.hookHealth,
    inputs.preflightSession,
    inputs.instructionPack,
    inputs.changedFiles,
    inputs.scopeReport,
    inputs.proposal,
    inputs.reviewPacket?.artifact
      ? {
          label: inputs.reviewPacket.label,
          sourcePath: inputs.reviewPacket.sourcePath,
          resolvedPath: inputs.reviewPacket.resolvedPath,
          artifact: inputs.reviewPacket.artifact,
        }
      : null,
  ].filter((source): source is LoadedJsonSource => Boolean(source))) {
    validateUnsafeSignals(source.label, source.artifact, findings)
  }

  return findings
}

function expectRole(
  artifact: JsonRecord,
  label: string,
  expectedRole: string,
  findings: StopPostRunAdvisoryFinding[],
): void {
  if (artifact.artifactRole !== expectedRole) {
    findings.push({
      code: 'STOP_POST_RUN_ADVISORY_INPUT_ROLE_MISMATCH',
      severity: 'error',
      field: `${label}.artifactRole`,
      message: `${label} has the wrong artifactRole for Stop/Post Run advisory reporting.`,
      expected: expectedRole,
      actual: artifact.artifactRole,
    })
  }
}

function expectHookHealth(artifact: JsonRecord, findings: StopPostRunAdvisoryFinding[]): void {
  const role = stringValue(artifact.artifactRole)
  const status = stringValue(artifact.status)
  const ok =
    (role === 'devview-hook-gateway-health-report' && status === 'devview-hook-gateway-health-report-generated') ||
    (role === 'devview-hook-gateway-health-boundary-preview' &&
      status === 'devview-hook-gateway-health-boundary-previewed')
  if (!ok) {
    findings.push({
      code: 'STOP_POST_RUN_ADVISORY_HOOK_HEALTH_MISMATCH',
      severity: 'error',
      field: 'hookHealth',
      message: 'Hook health input must be a Hook Gateway health report or health boundary preview.',
      expected:
        'devview-hook-gateway-health-report/generated or devview-hook-gateway-health-boundary-preview/previewed',
      actual: { artifactRole: artifact.artifactRole, status: artifact.status },
    })
  }
}

function validateUnsafeSignals(label: string, artifact: JsonRecord, findings: StopPostRunAdvisoryFinding[]): void {
  const unsafeTrueFields = [
    'codexExecutionTriggered',
    'codexExecutionControlled',
    'toolBlockingEnabled',
    'preToolUseBlockingEnabled',
    'postToolUseBlockingEnabled',
    'hookScriptsInstalled',
    'actualBlockingHookBehaviorImplemented',
    'strictModeEnabled',
    'guidedEnforcementEnabled',
    'changedFilesModified',
    'changedFilesReverted',
    'graphSourceMutated',
    'graphDeltaApplied',
    'humanDecisionRecorded',
    'runtimeEvidenceSatisfied',
    'evidenceAccepted',
    'acceptedEvidence',
    'candidateEvidenceAccepted',
    'equivalenceProven',
    'scopeEnforced',
    'ciEnforcementEnabled',
    'diffRejected',
    'requiredChecksConfigured',
    'branchProtectionChanged',
  ]
  const visit = (value: unknown, pathParts: string[]): void => {
    if (Array.isArray(value)) {
      value.forEach((entry, index) => visit(entry, [...pathParts, String(index)]))
      return
    }
    const record = asRecord(value)
    if (!record) {
      return
    }
    for (const [key, entry] of Object.entries(record)) {
      const nextPath = [...pathParts, key]
      if (unsafeTrueFields.includes(key) && entry === true) {
        findings.push({
          code: 'STOP_POST_RUN_ADVISORY_UNSAFE_AUTHORITY_SIGNAL',
          severity: 'error',
          field: `${label}.${nextPath.join('.')}`,
          message:
            'Stop/Post Run advisory inputs must not claim execution, mutation, approval, evidence, proof, or enforcement authority.',
          expected: false,
          actual: true,
        })
      }
      if (key === 'approvalStatus' && entry !== undefined && entry !== 'not-approved') {
        findings.push({
          code: 'STOP_POST_RUN_ADVISORY_UNSAFE_APPROVAL_STATUS',
          severity: 'error',
          field: `${label}.${nextPath.join('.')}`,
          message: 'Stop/Post Run advisory inputs must not claim approval.',
          expected: 'not-approved',
          actual: entry,
        })
      }
      visit(entry, nextPath)
    }
  }
  visit(artifact, [])
}

function summarizeChangedFiles(artifact: JsonRecord | null): StopPostRunAdvisoryReport['changedFileSummary'] {
  if (!artifact) {
    return {
      changedFilesStatus: 'missing',
      changedFileCount: 0,
      generatedFileCount: 0,
      changedFiles: [],
      authorityClass: 'missing',
      collectionMode: 'missing',
      sourceMode: 'missing',
    }
  }
  const entries = changedFileEntries(artifact)
  return {
    changedFilesStatus: entries.length === 0 ? 'clean-no-changes-observed' : 'changes-present',
    changedFileCount: entries.length,
    generatedFileCount: entries.filter((entry) => entry.generatedPath === true).length,
    changedFiles: entries.slice(0, 20).map((entry) => ({
      path: stringValue(entry.path ?? entry.newPath ?? entry.oldPath),
      status: stringValue(entry.status ?? entry.statusCode ?? entry.changeType),
    })),
    authorityClass: stringValue(artifact.authorityClass) || 'git-derived-changed-files',
    collectionMode: stringValue(artifact.collectionMode) || 'explicit-base-head',
    sourceMode: stringValue(artifact.sourceMode) || 'explicit-base-head',
  }
}

function changedFileEntries(artifact: JsonRecord): JsonRecord[] {
  const normalized = arrayRecords(artifact.normalizedChangedFiles)
  if (normalized.length > 0) {
    return normalized
  }
  return arrayRecords(artifact.changedFiles)
}

function summarizeInstructionPack(artifact: JsonRecord | null): StopPostRunAdvisoryReport['instructionSummary'] {
  if (!artifact) {
    return {
      instructionPackStatus: 'missing',
      taskSummary: '',
      allowedScopeCount: 0,
      forbiddenScopeCount: 0,
      requiredEvidenceCount: 0,
      outputRequirementCount: 0,
      stopConditionCount: 0,
      knownRiskCount: 0,
    }
  }
  return {
    instructionPackStatus: 'present',
    taskSummary: stringValue(artifact.taskSummary),
    allowedScopeCount: arrayRecords(artifact.allowedScope).length,
    forbiddenScopeCount: arrayRecords(artifact.forbiddenScope).length,
    requiredEvidenceCount: arrayRecords(artifact.requiredEvidence).length,
    outputRequirementCount: arrayRecords(artifact.outputRequirements).length,
    stopConditionCount: arrayRecords(artifact.stopConditions).length,
    knownRiskCount: arrayRecords(artifact.knownRisks).length,
  }
}

function summarizeScopeReport(artifact: JsonRecord | null): StopPostRunAdvisoryReport['scopeSummary'] {
  if (!artifact) {
    return {
      scopeReportStatus: 'missing',
      scopeComplianceResult: 'missing',
      scopeComplianceEvaluationStatus: 'missing',
      evaluatedViolationCount: 0,
      blockingFindingCount: 0,
      reviewRequiredFindingCount: 0,
      advisoryFindingCount: 0,
      forbiddenScopeIndicated: false,
      nonEnforcing: true,
    }
  }
  const findings = arrayRecords(artifact.findings ?? artifact.evaluatedFindings ?? artifact.scopeFindings)
  return {
    scopeReportStatus: 'present',
    scopeComplianceResult: stringValue(artifact.scopeComplianceResult),
    scopeComplianceEvaluationStatus: stringValue(artifact.scopeComplianceEvaluationStatus),
    evaluatedViolationCount: numberValue(artifact.evaluatedViolationCount),
    blockingFindingCount: numberValue(artifact.blockingFindingCount),
    reviewRequiredFindingCount: numberValue(artifact.reviewRequiredFindingCount),
    advisoryFindingCount: numberValue(artifact.advisoryFindingCount),
    forbiddenScopeIndicated:
      numberValue(artifact.evaluatedViolationCount) > 0 ||
      findings.some((entry) => /forbidden|violation|out-of-scope/iu.test(JSON.stringify(entry))),
    nonEnforcing: artifact.nonEnforcing !== false,
  }
}

function summarizeRuntimeReport(
  source: LoadedTextOrJsonSource | null,
): StopPostRunAdvisoryReport['runtimeReportSummary'] {
  return {
    runtimeReportStatus: source ? 'linked-report-only' : 'missing',
    runtimeReportKind: source ? source.kind : 'unknown',
  }
}

function summarizeProposalReview(
  proposal: JsonRecord | null,
  reviewPacket: LoadedTextOrJsonSource | null,
): StopPostRunAdvisoryReport['proposalReviewSummary'] {
  const reviewArtifact = reviewPacket?.artifact
  return {
    proposalStatus: proposal ? 'present' : 'missing',
    reviewPacketStatus: reviewPacket ? 'present' : 'missing',
    proposalOnly: proposal ? proposal.proposalOnly === true : false,
    reviewReadyNotApproved: Boolean(proposal && reviewPacket),
    approvalStatus: 'not-approved',
    reviewQuestionCount: arrayRecords(reviewArtifact?.humanReviewQuestions ?? proposal?.humanReviewQuestions).length,
    blockingReviewItemCount: arrayRecords(reviewArtifact?.blockingReviewItems).length,
    reviewRequiredItemCount: arrayRecords(reviewArtifact?.reviewRequiredItems).length,
  }
}

function determineCompletenessStatus(
  inputs: LoadedInputs,
  validationFindings: StopPostRunAdvisoryFinding[],
  changedFiles: StopPostRunAdvisoryReport['changedFileSummary'],
  instruction: StopPostRunAdvisoryReport['instructionSummary'],
  scope: StopPostRunAdvisoryReport['scopeSummary'],
  proposalReview: StopPostRunAdvisoryReport['proposalReviewSummary'],
): PostRunCompletenessStatus {
  if (validationFindings.some((finding) => finding.severity === 'error')) {
    return 'input-safety-findings-reported'
  }
  if (inputs.userPromptAdvisory.artifact.additionalContextInjectionReady !== true) {
    return 'preflight-context-not-ready'
  }
  if (changedFiles.changedFilesStatus === 'missing') {
    return 'missing-changed-files'
  }
  if (changedFiles.changedFilesStatus === 'clean-no-changes-observed') {
    return 'clean-no-changes-observed'
  }
  if (instruction.instructionPackStatus === 'missing') {
    return 'missing-instruction-pack'
  }
  if (scope.scopeReportStatus === 'missing') {
    return 'missing-scope-report'
  }
  if (proposalReview.proposalStatus === 'missing') {
    return 'missing-proposal'
  }
  if (proposalReview.reviewPacketStatus === 'missing') {
    return 'missing-review-packet'
  }
  return 'review-ready-not-approved'
}

function statusForCompleteness(status: PostRunCompletenessStatus): StopPostRunAdvisoryReport['status'] {
  if (status === 'input-safety-findings-reported') {
    return 'stop-post-run-advisory-input-findings-reported'
  }
  if (status === 'clean-no-changes-observed') {
    return 'stop-post-run-advisory-clean-no-op'
  }
  if (status === 'review-ready-not-approved') {
    return 'stop-post-run-advisory-review-ready-not-approved'
  }
  if (status.startsWith('missing-') || status === 'preflight-context-not-ready') {
    return 'stop-post-run-advisory-missing-artifacts'
  }
  return 'stop-post-run-advisory-generated'
}

function buildAdvisoryFindings(
  status: PostRunCompletenessStatus,
  changedFiles: StopPostRunAdvisoryReport['changedFileSummary'],
  instruction: StopPostRunAdvisoryReport['instructionSummary'],
  scope: StopPostRunAdvisoryReport['scopeSummary'],
  proposalReview: StopPostRunAdvisoryReport['proposalReviewSummary'],
): StopPostRunAdvisoryFinding[] {
  const findings: StopPostRunAdvisoryFinding[] = []
  if (status === 'preflight-context-not-ready') {
    findings.push({
      code: 'STOP_POST_RUN_PREFLIGHT_CONTEXT_NOT_READY',
      severity: 'warning',
      message:
        'UserPromptSubmit advisory context is not ready; Stop/Post Run report can only point to preflight repair.',
    })
  }
  if (status === 'missing-changed-files') {
    findings.push({
      code: 'STOP_POST_RUN_CHANGED_FILES_MISSING',
      severity: 'warning',
      message: 'No changed-file artifact was provided; Stop/Post Run cannot summarize file changes.',
    })
  }
  if (status === 'clean-no-changes-observed') {
    findings.push({
      code: 'STOP_POST_RUN_NO_CHANGED_FILES_OBSERVED',
      severity: 'info',
      message: 'Changed-file artifact reports no changed files. This is not approval or Evidence satisfaction.',
    })
  }
  if (changedFiles.changedFileCount > 0 && instruction.instructionPackStatus === 'missing') {
    findings.push({
      code: 'STOP_POST_RUN_INSTRUCTION_PACK_MISSING',
      severity: 'warning',
      message: 'Changed files are present, but no Instruction Pack was provided for advisory context.',
    })
  }
  if (changedFiles.changedFileCount > 0 && scope.scopeReportStatus === 'missing') {
    findings.push({
      code: 'STOP_POST_RUN_SCOPE_REPORT_MISSING',
      severity: 'warning',
      message: 'Changed files are present, but no advisory scope report was provided.',
    })
  }
  if (scope.forbiddenScopeIndicated) {
    findings.push({
      code: 'STOP_POST_RUN_FORBIDDEN_SCOPE_ADVISORY',
      severity: 'warning',
      message: 'Scope report indicates forbidden-scope or violation findings. This report remains non-enforcing.',
    })
  }
  if (scope.scopeReportStatus === 'present' && proposalReview.proposalStatus === 'missing') {
    findings.push({
      code: 'STOP_POST_RUN_PROPOSAL_MISSING',
      severity: 'warning',
      message: 'Scope report is present, but no proposal-only Graph Delta preview was provided.',
    })
  }
  if (proposalReview.proposalStatus === 'present' && proposalReview.reviewPacketStatus === 'missing') {
    findings.push({
      code: 'STOP_POST_RUN_REVIEW_PACKET_MISSING',
      severity: 'warning',
      message: 'Proposal-only Graph Delta preview is present, but no Human Review Packet was provided.',
    })
  }
  return findings
}

function nextRequiredCommands(
  inputs: LoadedInputs,
  status: PostRunCompletenessStatus,
  changedFiles: StopPostRunAdvisoryReport['changedFileSummary'],
): string[] {
  if (status === 'input-safety-findings-reported') {
    return ['Repair unsafe or mismatched Stop/Post Run advisory inputs, then rerun this report.']
  }
  if (status === 'preflight-context-not-ready') {
    const candidate = stringValue(inputs.userPromptAdvisory.artifact.sourceRequestIrCandidate) || '<candidatePath>'
    return [
      `graph read-model run-preflight-session --candidate ${candidate} --output-dir <preflightOutputDir> --json`,
      'graph read-model report-user-prompt-submit-advisory --prompt <promptText> --hook-health <hookHealth> --preflight-session <preflightSessionChain> --output <userPromptAdvisory> --json',
    ]
  }
  if (status === 'missing-changed-files') {
    return ['graph read-model collect-changed-files --working-tree --output <changedFiles> --json']
  }
  if (status === 'clean-no-changes-observed') {
    return [
      'No post-run file-change follow-up is required by this advisory report. Human review may still be required.',
    ]
  }
  if (status === 'missing-instruction-pack') {
    return [
      'graph read-model run-preflight-session --candidate <candidatePath> --output-dir <preflightOutputDir> --json',
    ]
  }
  if (status === 'missing-scope-report' && changedFiles.changedFileCount > 0) {
    if (changedFiles.collectionMode === 'working-tree-tracked-unstaged') {
      return ['graph read-model check-scope --working-tree --output <scopeReport> --markdown <runtimeReport> --json']
    }
    return [
      'graph read-model check-scope --base <baseRef> --head <headRef> --output <scopeReport> --markdown <runtimeReport> --json',
    ]
  }
  if (status === 'missing-proposal') {
    return ['graph read-model propose-graph-delta --source <graphDeltaCompatibleSource> --output <proposal> --json']
  }
  if (status === 'missing-review-packet') {
    const proposal = inputs.proposal?.sourcePath ?? '<proposal>'
    return [`graph read-model review-graph-delta --proposal ${proposal} --markdown <reviewPacketMarkdown> --json`]
  }
  if (status === 'review-ready-not-approved') {
    return ['Human review is required before any decision record, approval state, graph delta apply, or mutation step.']
  }
  return []
}

export function renderStopPostRunAdvisoryMarkdown(report: StopPostRunAdvisoryReport): string {
  return [
    '# DevView Stop/Post Run Advisory',
    '',
    `Status: ${report.status}`,
    `Completeness: ${report.postRunCompletenessStatus}`,
    `Non-enforcing: ${report.nonEnforcing}`,
    '',
    '## DevView Stop/Post Run Status',
    '',
    `- UserPromptSubmit context ready: ${report.userPromptSubmitContextReady}`,
    `- Preflight terminal stage: ${report.preflightTerminalStage || 'not provided'}`,
    '- Codex execution control: disabled.',
    '- Tool blocking: disabled.',
    '- Strict/guided enforcement: disabled.',
    '',
    '## Changed Files',
    '',
    `- Status: ${report.changedFileSummary.changedFilesStatus}`,
    `- Source mode: ${report.changedFileSummary.sourceMode}`,
    `- Collection mode: ${report.changedFileSummary.collectionMode}`,
    `- Count: ${report.changedFileSummary.changedFileCount}`,
    ...renderChangedFileRows(report.changedFileSummary.changedFiles),
    '',
    '## Instruction And Preflight Context',
    '',
    `- Instruction Pack: ${report.instructionSummary.instructionPackStatus}`,
    `- Task: ${report.instructionSummary.taskSummary || 'not available'}`,
    `- Allowed scope count: ${report.instructionSummary.allowedScopeCount}`,
    `- Forbidden scope count: ${report.instructionSummary.forbiddenScopeCount}`,
    `- Required evidence count: ${report.instructionSummary.requiredEvidenceCount}`,
    '',
    '## Scope Advisory State',
    '',
    `- Scope report: ${report.scopeSummary.scopeReportStatus}`,
    `- Scope result: ${report.scopeSummary.scopeComplianceResult || 'not available'}`,
    `- Forbidden scope indicated: ${report.scopeSummary.forbiddenScopeIndicated}`,
    '- Scope enforcement: disabled.',
    '',
    '## Proposal And Review',
    '',
    `- Proposal: ${report.proposalReviewSummary.proposalStatus}`,
    `- Review packet: ${report.proposalReviewSummary.reviewPacketStatus}`,
    `- Approval status: ${report.approvalStatus}`,
    `- Human review required: ${report.humanReviewRequired}`,
    '',
    '## Missing Artifacts And Next Commands',
    '',
    ...renderNextCommandRows(report.nextRequiredCommands),
    '',
    '## Safety Boundary',
    '',
    `- ${report.nonExecutionBoundary}`,
    '',
  ].join('\n')
}

function renderChangedFileRows(entries: Array<{ path: string; status: string }>): string[] {
  if (entries.length === 0) {
    return ['- No changed files listed.']
  }
  return entries.map((entry) => `- ${entry.status || 'changed'}: \`${entry.path || 'unknown'}\``)
}

function renderNextCommandRows(commands: string[]): string[] {
  if (commands.length === 0) {
    return ['- none']
  }
  return commands.map((command) => `- \`${command}\``)
}

async function assertOutputAuthority(
  root: string,
  options: StopPostRunAdvisoryOptions,
  inputs: LoadedInputs,
): Promise<void> {
  const resolvedOutputPath = resolveRepoPath(root, options.output)
  const resolvedMarkdownPath = options.markdown ? resolveRepoPath(root, options.markdown) : null
  if (resolvedMarkdownPath && pathKey(resolvedMarkdownPath) === pathKey(resolvedOutputPath)) {
    throw new Error('Stop/Post Run advisory JSON output and Markdown output must use different paths.')
  }

  const protectedPaths = new Map<string, string>()
  for (const source of allSourceArtifacts(inputs)) {
    protectedPaths.set(pathKey(source.resolvedPath), `${source.label} source artifact`)
    if (source.artifact) {
      for (const linkedPath of collectConcretePathStrings(source.artifact)) {
        protectedPaths.set(pathKey(resolveRepoPath(root, linkedPath)), `${source.label} linked source artifact`)
      }
    }
  }

  for (const [label, outputPath] of [
    ['output', resolvedOutputPath],
    ['markdown', resolvedMarkdownPath],
  ] as Array<[string, string | null]>) {
    if (!outputPath) continue
    const protectedReason = protectedPaths.get(pathKey(outputPath))
    if (protectedReason) {
      throw new Error(
        `Stop/Post Run advisory ${label} path cannot overwrite ${protectedReason}: ${relativePath(root, outputPath)}`,
      )
    }
    const reserved = classifyReservedOutputPath(root, outputPath)
    if (reserved) {
      throw new Error(`Stop/Post Run advisory ${label} path is reserved: ${reserved}`)
    }
    const existing = await readJsonSafe<JsonRecord>(outputPath)
    if (existing.ok && existing.value.artifactRole && existing.value.artifactRole !== REPORT_ROLE) {
      throw new Error(
        `Stop/Post Run advisory ${label} path already contains source-shaped JSON with artifactRole ${String(existing.value.artifactRole)}.`,
      )
    }
  }
}

function allSourceArtifacts(inputs: LoadedInputs): Array<{
  label: string
  resolvedPath: string
  artifact: JsonRecord | null
}> {
  return [
    inputs.userPromptAdvisory,
    inputs.hookHealth,
    inputs.preflightSession,
    inputs.instructionPack,
    inputs.instructionMarkdown,
    inputs.changedFiles,
    inputs.scopeReport,
    inputs.runtimeReport,
    inputs.proposal,
    inputs.reviewPacket,
  ]
    .filter((source): source is LoadedJsonSource | LoadedTextOrJsonSource => Boolean(source))
    .map((source) => ({
      label: source.label,
      resolvedPath: source.resolvedPath,
      artifact: 'artifact' in source ? source.artifact : null,
    }))
}

function classifyReservedOutputPath(root: string, outputPath: string): string | null {
  const relative = relativePath(root, outputPath).replaceAll('\\', '/')
  if (relative === '.codex/config.json') {
    return 'active Codex config path'
  }
  if (relative.startsWith('.codex/hooks/')) {
    return 'active Codex hook script path'
  }
  if (relative === '.pbe' || relative.startsWith('.pbe/')) {
    return 'PBE source/control/evidence path'
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
      for (const item of entry) visit(item)
      return
    }
    const record = asRecord(entry)
    if (!record) return
    for (const item of Object.values(record)) visit(item)
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
    /\.(json|md|txt)$/iu.test(normalized)
  )
}

function requireRecord(value: unknown, label: string): JsonRecord {
  const record = asRecord(value)
  if (!record) {
    throw new Error(`${label} must be a JSON object.`)
  }
  return record
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
  return typeof value === 'number' && Number.isFinite(value) ? value : 0
}

function resolveRepoPath(root: string, inputPath: string): string {
  return path.isAbsolute(inputPath) ? inputPath : path.resolve(root, inputPath)
}

function pathKey(filePath: string): string {
  return path.resolve(filePath).replaceAll('\\', '/').toLowerCase()
}
