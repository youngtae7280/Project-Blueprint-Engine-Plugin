import path from 'node:path'
import { readJsonSafe, relativePath, writeJsonAtomic, writeTextAtomic } from './fs.js'
import {
  validateRequestIrCandidateFile,
  type RequestIrCandidateValidationFileResult,
} from './request-ir-candidate-validator.js'
import {
  validateRequestIrGraphAwareFile,
  type RequestIrGraphAwareValidationFileResult,
} from './request-ir-graph-aware-validator.js'
import { generateGraphTraversalPlanFile, type GraphTraversalPlanFileResult } from './graph-traversal-plan.js'
import { generateSelectedGraphSliceFile, type SelectedGraphSliceFileResult } from './selected-graph-slice.js'
import { generateContractCompilerInputFile, type ContractCompilerInputFileResult } from './contract-input-generator.js'
import { generateInstructionPackFile, type InstructionPackFileResult } from './instruction-pack-generator.js'
import type { IssueSeverity } from './types.js'

const REPORTER_NAME = 'PreflightSessionChainReporter'
const REPORT_ROLE = 'devview-preflight-session-chain-report'
const REPORT_STATUS = 'devview-preflight-session-chain-report-generated'
const REPORT_BLOCKED_STATUS = 'devview-preflight-session-chain-report-blocked'

type JsonRecord = Record<string, unknown>

type StageId =
  | 'schema-validation'
  | 'graph-aware-validation'
  | 'graph-traversal-plan'
  | 'selected-graph-slice'
  | 'contract-compiler-input'
  | 'instruction-pack'

type PreflightStageStatus = 'stage-not-run' | 'stage-generated' | 'stage-blocked' | 'stage-failed' | 'stage-incomplete'

export interface PreflightSessionChainOptions {
  candidate: string
  outputDir: string
  sessionId?: string
  markdown?: string
}

export interface PreflightSessionChainFinding {
  code: string
  severity: IssueSeverity
  stage?: string
  field?: string
  message: string
  expected?: unknown
  actual?: unknown
  suggestedFix?: string
}

export interface PreflightSessionStageReport {
  stage: StageId
  label: string
  artifactPath: string
  executed: boolean
  status: PreflightStageStatus
  sourceStatus: string
  generated: boolean
  importantFlags: Record<string, unknown>
  findingSummary: {
    errors: number
    warnings: number
    infos: number
  }
  validationFindings: PreflightSessionChainFinding[]
  skippedReason?: string
}

export interface PreflightSessionChainReport {
  schemaVersion: 1
  artifactRole: typeof REPORT_ROLE
  status: typeof REPORT_STATUS | typeof REPORT_BLOCKED_STATUS
  reporterName: typeof REPORTER_NAME
  chainScope: 'request-ir-candidate-to-instruction-pack-preflight-no-codex-execution'
  sessionId: string
  sourceRequestIrCandidate: string
  outputDir: string
  terminalStage:
    | 'instruction-pack-preview-generated-no-codex-execution'
    | 'schema-validation-blocked'
    | 'graph-aware-validation-blocked'
    | 'graph-traversal-plan-blocked'
    | 'selected-graph-slice-blocked'
    | 'contract-compiler-input-blocked'
    | 'instruction-pack-blocked'
    | 'stage-failed'
  stoppedBeforeStage: StageId | null
  stageArtifacts: Record<string, string>
  stages: PreflightSessionStageReport[]
  schemaValidationExecuted: boolean
  schemaValidationStatus: string
  requestIrValidationStatus: string
  graphAwareValidationExecuted: boolean
  graphValidationStatus: string
  graphTraversalPlanGenerated: boolean
  selectedGraphSliceGenerated: boolean
  contractInputGenerated: boolean
  instructionPackGenerated: boolean
  codexExecutionTriggered: false
  graphSourceMutated: false
  graphDeltaApplied: false
  approvalStatus: 'not-approved'
  humanDecisionRecorded: false
  runtimeEvidenceSatisfied: false
  evidenceAccepted: false
  equivalenceProven: false
  scopeEnforced: false
  ciEnforcementEnabled: false
  strictModeEnabled: false
  guidedEnforcementEnabled: false
  humanReviewRequired: true
  validationFindings: PreflightSessionChainFinding[]
  outputWritePolicy: 'explicit-output-dir-only'
  writtenOutputPath: string
  markdownReportPath: string | null
  writtenOutputPathAuthorityStatus: 'explicit-chain-output-not-source-authority'
  markdownReportAuthorityStatus: 'not-written' | 'explicit-chain-output-not-source-authority'
  nonExecutionBoundary: string
}

export interface PreflightSessionChainFileResult {
  report: PreflightSessionChainReport
  outputDir: string
  outputPath: string
  markdownReport?: string
}

export interface PreflightSessionStageExecutors {
  validateRequestIrCandidateFile: typeof validateRequestIrCandidateFile
  validateRequestIrGraphAwareFile: typeof validateRequestIrGraphAwareFile
  generateGraphTraversalPlanFile: typeof generateGraphTraversalPlanFile
  generateSelectedGraphSliceFile: typeof generateSelectedGraphSliceFile
  generateContractCompilerInputFile: typeof generateContractCompilerInputFile
  generateInstructionPackFile: typeof generateInstructionPackFile
}

interface StagePaths {
  schemaValidation: string
  graphValidation: string
  traversalPlan: string
  selectedSlice: string
  contractInput: string
  instructionPack: string
  instructionMarkdown: string
  chainReport: string
}

interface LoadedInputs {
  candidate: JsonRecord
  resolvedCandidatePath: string
}

const DEFAULT_EXECUTORS: PreflightSessionStageExecutors = {
  validateRequestIrCandidateFile,
  validateRequestIrGraphAwareFile,
  generateGraphTraversalPlanFile,
  generateSelectedGraphSliceFile,
  generateContractCompilerInputFile,
  generateInstructionPackFile,
}

export async function runPreflightSessionChainFile(
  root: string,
  options: PreflightSessionChainOptions,
  executors: PreflightSessionStageExecutors = DEFAULT_EXECUTORS,
): Promise<PreflightSessionChainFileResult> {
  validateRequiredOptions(options)
  const inputs = await loadInputs(root, options)
  const paths = buildStagePaths(root, options.outputDir)
  await assertOutputAuthority(root, inputs, options, paths)

  const outputDir = relativePath(root, resolveRepoPath(root, options.outputDir))
  const stages: PreflightSessionStageReport[] = []
  const findings: PreflightSessionChainFinding[] = []

  let terminalStage: PreflightSessionChainReport['terminalStage'] =
    'instruction-pack-preview-generated-no-codex-execution'
  let stoppedBeforeStage: StageId | null = null

  const schemaStage = await runStage({
    stage: 'schema-validation',
    label: 'Schema-only Request IR validation',
    artifactPath: paths.schemaValidation,
    action: () =>
      executors.validateRequestIrCandidateFile(root, relativePath(root, inputs.resolvedCandidatePath), {
        output: paths.schemaValidation,
      }),
    extract: (result) => {
      const record = (result as RequestIrCandidateValidationFileResult).result as unknown as JsonRecord
      return {
        record,
        sourceStatus: stringValue(record.requestIrValidationStatus) || stringValue(record.status),
        generated: stringValue(record.requestIrValidationStatus) !== 'validation-blocked',
        blocked: stringValue(record.requestIrValidationStatus) === 'validation-blocked',
      }
    },
  })
  stages.push(schemaStage)
  findings.push(...schemaStage.validationFindings)
  if (schemaStage.status !== 'stage-generated') {
    terminalStage = schemaStage.status === 'stage-failed' ? 'stage-failed' : 'schema-validation-blocked'
    stoppedBeforeStage = 'graph-aware-validation'
    appendSkippedStages(stages, paths, stoppedBeforeStage, 'Schema-only Request IR validation did not pass.')
    return await writeReport(
      root,
      options,
      inputs,
      paths,
      stages,
      findings,
      terminalStage,
      stoppedBeforeStage,
      outputDir,
    )
  }

  const graphAwareStage = await runStage({
    stage: 'graph-aware-validation',
    label: 'Graph-aware Request IR validation',
    artifactPath: paths.graphValidation,
    action: () =>
      executors.validateRequestIrGraphAwareFile(
        root,
        relativePath(root, inputs.resolvedCandidatePath),
        paths.schemaValidation,
        { output: paths.graphValidation },
      ),
    extract: (result) => {
      const record = (result as RequestIrGraphAwareValidationFileResult).result as unknown as JsonRecord
      return {
        record,
        sourceStatus: stringValue(record.graphValidationStatus) || stringValue(record.status),
        generated: stringValue(record.graphValidationStatus) === 'graph-aware-valid',
        blocked: stringValue(record.graphValidationStatus) === 'validation-blocked',
      }
    },
  })
  stages.push(graphAwareStage)
  findings.push(...graphAwareStage.validationFindings)
  if (graphAwareStage.status !== 'stage-generated') {
    terminalStage = graphAwareStage.status === 'stage-failed' ? 'stage-failed' : 'graph-aware-validation-blocked'
    stoppedBeforeStage = 'graph-traversal-plan'
    appendSkippedStages(stages, paths, stoppedBeforeStage, 'Graph-aware Request IR validation did not pass.')
    return await writeReport(
      root,
      options,
      inputs,
      paths,
      stages,
      findings,
      terminalStage,
      stoppedBeforeStage,
      outputDir,
    )
  }

  const traversalStage = await runStage({
    stage: 'graph-traversal-plan',
    label: 'Graph traversal plan',
    artifactPath: paths.traversalPlan,
    action: () =>
      executors.generateGraphTraversalPlanFile(root, paths.graphValidation, { output: paths.traversalPlan }),
    extract: (result) => {
      const record = (result as GraphTraversalPlanFileResult).result as unknown as JsonRecord
      return {
        record,
        sourceStatus: stringValue(record.graphTraversalPlanStatus) || stringValue(record.status),
        generated:
          record.graphTraversalPlanGenerated === true && stringValue(record.graphTraversalPlanStatus) === 'ready',
        blocked: stringValue(record.graphTraversalPlanStatus) === 'blocked',
      }
    },
  })
  stages.push(traversalStage)
  findings.push(...traversalStage.validationFindings)
  if (traversalStage.status !== 'stage-generated') {
    terminalStage = traversalStage.status === 'stage-failed' ? 'stage-failed' : 'graph-traversal-plan-blocked'
    stoppedBeforeStage = 'selected-graph-slice'
    appendSkippedStages(stages, paths, stoppedBeforeStage, 'Graph traversal plan was not ready.')
    return await writeReport(
      root,
      options,
      inputs,
      paths,
      stages,
      findings,
      terminalStage,
      stoppedBeforeStage,
      outputDir,
    )
  }

  const sliceStage = await runStage({
    stage: 'selected-graph-slice',
    label: 'Selected graph slice',
    artifactPath: paths.selectedSlice,
    action: () => executors.generateSelectedGraphSliceFile(root, paths.traversalPlan, { output: paths.selectedSlice }),
    extract: (result) => {
      const record = (result as SelectedGraphSliceFileResult).result as unknown as JsonRecord
      return {
        record,
        sourceStatus: stringValue(record.selectedGraphSliceStatus) || stringValue(record.status),
        generated:
          record.selectedGraphSliceGenerated === true && stringValue(record.selectedGraphSliceStatus) === 'generated',
        blocked: stringValue(record.selectedGraphSliceStatus) !== 'generated',
      }
    },
  })
  stages.push(sliceStage)
  findings.push(...sliceStage.validationFindings)
  if (sliceStage.status !== 'stage-generated') {
    terminalStage = sliceStage.status === 'stage-failed' ? 'stage-failed' : 'selected-graph-slice-blocked'
    stoppedBeforeStage = 'contract-compiler-input'
    appendSkippedStages(stages, paths, stoppedBeforeStage, 'Selected graph slice was not generated.')
    return await writeReport(
      root,
      options,
      inputs,
      paths,
      stages,
      findings,
      terminalStage,
      stoppedBeforeStage,
      outputDir,
    )
  }

  const contractStage = await runStage({
    stage: 'contract-compiler-input',
    label: 'Contract Compiler Input',
    artifactPath: paths.contractInput,
    action: () =>
      executors.generateContractCompilerInputFile(root, paths.selectedSlice, { output: paths.contractInput }),
    extract: (result) => {
      const record = (result as ContractCompilerInputFileResult).result as unknown as JsonRecord
      return {
        record,
        sourceStatus: stringValue(record.status),
        generated:
          record.contractInputGenerated === true && stringValue(record.status) === 'contract-compiler-input-generated',
        blocked: stringValue(record.status) !== 'contract-compiler-input-generated',
      }
    },
  })
  stages.push(contractStage)
  findings.push(...contractStage.validationFindings)
  if (contractStage.status !== 'stage-generated') {
    terminalStage = contractStage.status === 'stage-failed' ? 'stage-failed' : 'contract-compiler-input-blocked'
    stoppedBeforeStage = 'instruction-pack'
    appendSkippedStages(stages, paths, stoppedBeforeStage, 'Contract Compiler Input was not generated.')
    return await writeReport(
      root,
      options,
      inputs,
      paths,
      stages,
      findings,
      terminalStage,
      stoppedBeforeStage,
      outputDir,
    )
  }

  const instructionStage = await runStage({
    stage: 'instruction-pack',
    label: 'Instruction Pack',
    artifactPath: paths.instructionPack,
    action: () =>
      executors.generateInstructionPackFile(root, paths.contractInput, {
        output: paths.instructionPack,
        markdown: paths.instructionMarkdown,
      }),
    extract: (result) => {
      const record = (result as InstructionPackFileResult).pack as unknown as JsonRecord
      return {
        record,
        sourceStatus: stringValue(record.status),
        generated:
          record.instructionPackGenerated === true && stringValue(record.status) === 'instruction-pack-generated',
        blocked: stringValue(record.status) !== 'instruction-pack-generated',
      }
    },
  })
  stages.push(instructionStage)
  findings.push(...instructionStage.validationFindings)
  if (instructionStage.status !== 'stage-generated') {
    terminalStage = instructionStage.status === 'stage-failed' ? 'stage-failed' : 'instruction-pack-blocked'
    stoppedBeforeStage = null
  }

  return await writeReport(root, options, inputs, paths, stages, findings, terminalStage, stoppedBeforeStage, outputDir)
}

function validateRequiredOptions(options: PreflightSessionChainOptions): void {
  if (!options.candidate) {
    throw new Error('run-preflight-session requires --candidate <candidatePath>.')
  }
  if (!options.outputDir) {
    throw new Error('run-preflight-session requires --output-dir <directoryPath>.')
  }
  if (options.sessionId && !/^[A-Za-z0-9._-]+$/.test(options.sessionId)) {
    throw new Error('run-preflight-session --session-id may contain only letters, numbers, dot, underscore, or dash.')
  }
}

async function loadInputs(root: string, options: PreflightSessionChainOptions): Promise<LoadedInputs> {
  const resolvedCandidatePath = resolveRepoPath(root, options.candidate)
  const candidate = await readJsonSafe<JsonRecord>(resolvedCandidatePath)
  if (!candidate.ok) {
    throw new Error(`Unable to read Request IR Candidate from ${options.candidate}: ${candidate.error}`)
  }
  const record = asRecord(candidate.value)
  if (!record) {
    throw new Error('Request IR Candidate must be a JSON object.')
  }
  return { candidate: record, resolvedCandidatePath }
}

function buildStagePaths(root: string, outputDir: string): StagePaths {
  const resolvedOutputDir = resolveRepoPath(root, outputDir)
  const child = (filename: string): string => relativePath(root, path.join(resolvedOutputDir, filename))
  return {
    schemaValidation: child('request-ir-validation.json'),
    graphValidation: child('request-ir-graph-validation.json'),
    traversalPlan: child('graph-traversal-plan.json'),
    selectedSlice: child('selected-graph-slice.json'),
    contractInput: child('contract-compiler-input.json'),
    instructionPack: child('instruction-pack.json'),
    instructionMarkdown: child('instruction-pack.md'),
    chainReport: child('preflight-session-chain.json'),
  }
}

async function assertOutputAuthority(
  root: string,
  inputs: LoadedInputs,
  options: PreflightSessionChainOptions,
  paths: StagePaths,
): Promise<void> {
  const protectedPaths = buildProtectedOutputPathMap(root, inputs)
  const resolvedOutputDir = resolveRepoPath(root, options.outputDir)
  const outputDirKey = pathKey(resolvedOutputDir)
  const outputDirReserved = classifyReservedSourcePath(resolvedOutputDir)
  if (outputDirReserved) {
    throw new Error(`Preflight session output directory is unsafe: ${options.outputDir} targets ${outputDirReserved}.`)
  }
  const outputDirAuthority = await classifyExistingSourceAuthority(resolvedOutputDir, null)
  if (outputDirAuthority) {
    throw new Error(
      `Preflight session output directory is unsafe: ${options.outputDir} already contains ${outputDirAuthority}.`,
    )
  }
  for (const [protectedKey, reason] of protectedPaths.entries()) {
    if (outputDirKey === protectedKey || isAncestorPath(outputDirKey, protectedKey)) {
      throw new Error(`Preflight session output directory is unsafe: ${options.outputDir} would contain ${reason}.`)
    }
    if (isAncestorPath(protectedKey, outputDirKey)) {
      throw new Error(`Preflight session output directory is unsafe: ${options.outputDir} is inside ${reason}.`)
    }
  }

  const outputs = [
    {
      label: 'schema validation output',
      path: paths.schemaValidation,
      allowedRole: 'request-ir-candidate-schema-only-validation',
    },
    {
      label: 'graph-aware validation output',
      path: paths.graphValidation,
      allowedRole: 'request-ir-graph-aware-validation',
    },
    { label: 'graph traversal plan output', path: paths.traversalPlan, allowedRole: 'graph-traversal-plan' },
    { label: 'selected graph slice output', path: paths.selectedSlice, allowedRole: 'selected-graph-slice' },
    { label: 'contract input output', path: paths.contractInput, allowedRole: 'contract-compiler-input' },
    { label: 'instruction pack output', path: paths.instructionPack, allowedRole: 'instruction-pack' },
    { label: 'instruction pack Markdown output', path: paths.instructionMarkdown, allowedRole: null },
    { label: 'preflight session chain output', path: paths.chainReport, allowedRole: REPORT_ROLE },
    ...(options.markdown
      ? [{ label: 'preflight session Markdown report', path: options.markdown, allowedRole: null }]
      : []),
  ]

  const seen = new Map<string, string>()
  for (const output of outputs) {
    const resolved = resolveRepoPath(root, output.path)
    const key = pathKey(resolved)
    const existing = seen.get(key)
    if (existing) {
      throw new Error(`Preflight session output path is unsafe: ${output.path} collides with ${existing}.`)
    }
    seen.set(key, output.label)
  }

  for (const output of outputs) {
    const resolved = resolveRepoPath(root, output.path)
    const protectedReason = protectedPaths.get(pathKey(resolved))
    if (protectedReason) {
      throw new Error(`Preflight session output path is unsafe: ${output.path} would overwrite ${protectedReason}.`)
    }
    const reservedReason = classifyReservedSourcePath(resolved)
    if (reservedReason) {
      throw new Error(`Preflight session output path is unsafe: ${output.path} targets ${reservedReason}.`)
    }
    const existingAuthority = await classifyExistingSourceAuthority(resolved, output.allowedRole)
    if (existingAuthority) {
      throw new Error(`Preflight session output path is unsafe: ${output.path} already contains ${existingAuthority}.`)
    }
  }
}

async function runStage<T>(options: {
  stage: StageId
  label: string
  artifactPath: string
  action: () => Promise<T>
  extract: (result: T) => {
    record: JsonRecord
    sourceStatus: string
    generated: boolean
    blocked: boolean
  }
}): Promise<PreflightSessionStageReport> {
  try {
    const result = await options.action()
    const extracted = options.extract(result)
    const validationFindings = normalizeFindings(options.stage, extracted.record.validationFindings)
    return {
      stage: options.stage,
      label: options.label,
      artifactPath: options.artifactPath,
      executed: true,
      status: extracted.generated ? 'stage-generated' : extracted.blocked ? 'stage-blocked' : 'stage-incomplete',
      sourceStatus: extracted.sourceStatus,
      generated: extracted.generated,
      importantFlags: extractImportantFlags(extracted.record),
      findingSummary: summarizeFindings(validationFindings),
      validationFindings,
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    const validationFindings: PreflightSessionChainFinding[] = [
      {
        code: `PREFLIGHT_${stageCode(options.stage)}_FAILED`,
        severity: 'error',
        stage: options.stage,
        message,
        suggestedFix: 'Fix the source artifact for this stage and rerun the preflight session chain.',
      },
    ]
    return {
      stage: options.stage,
      label: options.label,
      artifactPath: options.artifactPath,
      executed: true,
      status: 'stage-failed',
      sourceStatus: 'stage-failed',
      generated: false,
      importantFlags: {},
      findingSummary: summarizeFindings(validationFindings),
      validationFindings,
    }
  }
}

function appendSkippedStages(
  stages: PreflightSessionStageReport[],
  paths: StagePaths,
  firstSkipped: StageId,
  reason: string,
): void {
  const order: StageId[] = [
    'schema-validation',
    'graph-aware-validation',
    'graph-traversal-plan',
    'selected-graph-slice',
    'contract-compiler-input',
    'instruction-pack',
  ]
  const start = order.indexOf(firstSkipped)
  if (start < 0) {
    return
  }
  for (const stage of order.slice(start)) {
    stages.push({
      stage,
      label: stageLabel(stage),
      artifactPath: pathForStage(paths, stage),
      executed: false,
      status: 'stage-not-run',
      sourceStatus: 'not-run',
      generated: false,
      importantFlags: {},
      findingSummary: { errors: 0, warnings: 0, infos: 0 },
      validationFindings: [],
      skippedReason: reason,
    })
  }
}

async function writeReport(
  root: string,
  options: PreflightSessionChainOptions,
  inputs: LoadedInputs,
  paths: StagePaths,
  stages: PreflightSessionStageReport[],
  findings: PreflightSessionChainFinding[],
  terminalStage: PreflightSessionChainReport['terminalStage'],
  stoppedBeforeStage: StageId | null,
  outputDir: string,
): Promise<PreflightSessionChainFileResult> {
  const outputPath = paths.chainReport
  const markdownReport = options.markdown ? relativePath(root, resolveRepoPath(root, options.markdown)) : undefined
  const report = buildReport({
    root,
    options,
    inputs,
    paths,
    stages,
    findings,
    terminalStage,
    stoppedBeforeStage,
    outputDir,
    outputPath,
    markdownReport: markdownReport ?? null,
  })

  await writeJsonAtomic(resolveRepoPath(root, paths.chainReport), report)
  if (options.markdown) {
    await writeTextAtomic(resolveRepoPath(root, options.markdown), renderPreflightSessionChainMarkdown(report))
  }
  return { report, outputDir, outputPath, ...(markdownReport ? { markdownReport } : {}) }
}

function buildReport(options: {
  root: string
  options: PreflightSessionChainOptions
  inputs: LoadedInputs
  paths: StagePaths
  stages: PreflightSessionStageReport[]
  findings: PreflightSessionChainFinding[]
  terminalStage: PreflightSessionChainReport['terminalStage']
  stoppedBeforeStage: StageId | null
  outputDir: string
  outputPath: string
  markdownReport: string | null
}): PreflightSessionChainReport {
  const status =
    options.terminalStage === 'instruction-pack-preview-generated-no-codex-execution'
      ? REPORT_STATUS
      : REPORT_BLOCKED_STATUS
  const stageArtifacts = {
    schemaValidation: options.paths.schemaValidation,
    graphAwareValidation: options.paths.graphValidation,
    graphTraversalPlan: options.paths.traversalPlan,
    selectedGraphSlice: options.paths.selectedSlice,
    contractCompilerInput: options.paths.contractInput,
    instructionPack: options.paths.instructionPack,
    instructionMarkdown: options.paths.instructionMarkdown,
    preflightSessionChain: options.paths.chainReport,
  }
  const sourceStatus = (stage: StageId): string =>
    options.stages.find((entry) => entry.stage === stage)?.sourceStatus ?? 'not-run'
  const generated = (stage: StageId): boolean =>
    options.stages.find((entry) => entry.stage === stage)?.generated === true
  const stageFlag = (stage: StageId, key: string): string =>
    stringValue(options.stages.find((entry) => entry.stage === stage)?.importantFlags[key])
  return {
    schemaVersion: 1,
    artifactRole: REPORT_ROLE,
    status,
    reporterName: REPORTER_NAME,
    chainScope: 'request-ir-candidate-to-instruction-pack-preflight-no-codex-execution',
    sessionId: options.options.sessionId ?? 'default-preflight-session',
    sourceRequestIrCandidate: relativePath(options.root, options.inputs.resolvedCandidatePath),
    outputDir: options.outputDir,
    terminalStage: options.terminalStage,
    stoppedBeforeStage: options.stoppedBeforeStage,
    stageArtifacts,
    stages: options.stages,
    schemaValidationExecuted: options.stages.some((stage) => stage.stage === 'schema-validation' && stage.executed),
    schemaValidationStatus:
      stageFlag('schema-validation', 'schemaValidationStatus') || sourceStatus('schema-validation'),
    requestIrValidationStatus:
      stageFlag('schema-validation', 'requestIrValidationStatus') || sourceStatus('schema-validation'),
    graphAwareValidationExecuted: options.stages.some(
      (stage) => stage.stage === 'graph-aware-validation' && stage.executed,
    ),
    graphValidationStatus:
      stageFlag('graph-aware-validation', 'graphValidationStatus') || sourceStatus('graph-aware-validation'),
    graphTraversalPlanGenerated: generated('graph-traversal-plan'),
    selectedGraphSliceGenerated: generated('selected-graph-slice'),
    contractInputGenerated: generated('contract-compiler-input'),
    instructionPackGenerated: generated('instruction-pack'),
    codexExecutionTriggered: false,
    graphSourceMutated: false,
    graphDeltaApplied: false,
    approvalStatus: 'not-approved',
    humanDecisionRecorded: false,
    runtimeEvidenceSatisfied: false,
    evidenceAccepted: false,
    equivalenceProven: false,
    scopeEnforced: false,
    ciEnforcementEnabled: false,
    strictModeEnabled: false,
    guidedEnforcementEnabled: false,
    humanReviewRequired: true,
    validationFindings: options.findings,
    outputWritePolicy: 'explicit-output-dir-only',
    writtenOutputPath: options.outputPath,
    markdownReportPath: options.markdownReport,
    writtenOutputPathAuthorityStatus: 'explicit-chain-output-not-source-authority',
    markdownReportAuthorityStatus: options.markdownReport
      ? 'explicit-chain-output-not-source-authority'
      : 'not-written',
    nonExecutionBoundary:
      'This preflight session chain runs deterministic frontend read-model commands from Request IR Candidate validation through Instruction Pack preview generation. It does not call an LLM/API, trigger Codex execution, mutate graph-source, apply graph deltas, automate approval or human decisions, accept or satisfy Evidence, prove equivalence, enforce scope, enable strict/guided blocking, reject diffs, or configure CI.',
  }
}

export function renderPreflightSessionChainMarkdown(report: PreflightSessionChainReport): string {
  const lines = [
    '# DevView Preflight Session Chain',
    '',
    `Status: ${report.status}`,
    `Terminal stage: ${report.terminalStage}`,
    `Candidate: ${report.sourceRequestIrCandidate}`,
    `Output directory: ${report.outputDir}`,
    '',
    '## Stages',
    '',
    ...renderMarkdownTable(
      ['Stage', 'Artifact', 'Status', 'Generated'],
      report.stages.map((stage) => [
        stage.label,
        stage.artifactPath,
        stage.sourceStatus,
        stage.generated ? 'yes' : 'no',
      ]),
    ),
    '',
    '## Boundaries',
    '',
    '- Instruction Pack generation is a preview artifact only; Codex execution was not triggered.',
    '- Graph-source mutation, graph delta apply, approval automation, Evidence acceptance, runtime Evidence satisfaction, equivalence proof, scope enforcement, strict/guided blocking, and CI enforcement remain disabled.',
    '- Human review remains required before any future execution or authority-bearing action.',
  ]
  if (report.validationFindings.length > 0) {
    lines.push('', '## Findings', '')
    for (const finding of report.validationFindings) {
      lines.push(`- ${finding.severity}: ${finding.code} - ${finding.message}`)
    }
  }
  return `${lines.join('\n')}\n`
}

function buildProtectedOutputPathMap(root: string, inputs: LoadedInputs): Map<string, string> {
  const protectedPaths = new Map<string, string>()
  protectedPaths.set(pathKey(inputs.resolvedCandidatePath), 'the source Request IR Candidate')
  const add = (candidatePath: string, reason: string): void => {
    if (!isConcreteOutputProtectedPath(candidatePath)) {
      return
    }
    const key = pathKey(resolveRepoPath(root, candidatePath))
    if (!protectedPaths.has(key)) {
      protectedPaths.set(key, reason)
    }
  }
  for (const linkedPath of collectConcretePathStrings(inputs.candidate)) {
    add(linkedPath, `linked Request IR Candidate artifact ${linkedPath}`)
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
    'request-ir-candidate',
    'request-ir-candidate-calibration-fixture-preview',
    'request-ir-candidate-schema-preview',
    'natural-language-request-intake-boundary-preview',
    'ai-request-analyzer-boundary',
    'ai-request-analyzer-pack',
    'clarification-interview-pack',
    'clarification-answers-preview',
    'graph-delta-proposal-preview',
    'graph-delta-human-review-packet-preview',
  ])
  if (blockedRoles.has(artifactRole)) {
    return `source/input artifactRole "${artifactRole}"`
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
  if (normalized.includes('/.codex/hooks/') || normalized.endsWith('/.codex/config.json')) {
    return 'active hook/config path'
  }
  if (
    normalized.endsWith('/generated/generated-read-model.json') ||
    normalized.endsWith('/generated/graph-source-read-model-projection.json')
  ) {
    return 'generated read-model source authority path'
  }
  return null
}

function normalizeFindings(stage: StageId, findings: unknown): PreflightSessionChainFinding[] {
  if (!Array.isArray(findings)) {
    return []
  }
  return findings
    .map((finding) => asRecord(finding))
    .filter((finding): finding is JsonRecord => Boolean(finding))
    .map((finding) => ({
      code: stringValue(finding.code) || `PREFLIGHT_${stageCode(stage)}_FINDING`,
      severity: severityValue(finding.severity),
      stage,
      field: stringValue(finding.field) || undefined,
      message: stringValue(finding.message) || 'Preflight stage finding.',
      expected: finding.expected,
      actual: finding.actual,
      suggestedFix: stringValue(finding.suggestedFix) || undefined,
    }))
}

function summarizeFindings(findings: PreflightSessionChainFinding[]): PreflightSessionStageReport['findingSummary'] {
  return {
    errors: findings.filter((finding) => finding.severity === 'error').length,
    warnings: findings.filter((finding) => finding.severity === 'warning').length,
    infos: findings.filter((finding) => finding.severity === 'info').length,
  }
}

function extractImportantFlags(record: JsonRecord): Record<string, unknown> {
  const keys = [
    'artifactRole',
    'status',
    'schemaValidationStatus',
    'requestIrValidationStatus',
    'graphValidationStatus',
    'graphTraversalAllowed',
    'graphTraversalPlanGenerated',
    'graphTraversalPlanStatus',
    'selectedGraphSliceGenerated',
    'selectedGraphSliceStatus',
    'contractInputGenerated',
    'instructionPackGenerated',
    'graphSourceMutated',
    'graphDeltaApplied',
    'runtimeEvidenceSatisfied',
    'evidenceAccepted',
    'equivalenceProven',
    'scopeEnforced',
    'ciEnforcementEnabled',
    'codexExecutionTriggered',
  ]
  return Object.fromEntries(keys.filter((key) => key in record).map((key) => [key, record[key]]))
}

function pathForStage(paths: StagePaths, stage: StageId): string {
  if (stage === 'schema-validation') {
    return paths.schemaValidation
  }
  if (stage === 'graph-aware-validation') {
    return paths.graphValidation
  }
  if (stage === 'graph-traversal-plan') {
    return paths.traversalPlan
  }
  if (stage === 'selected-graph-slice') {
    return paths.selectedSlice
  }
  if (stage === 'contract-compiler-input') {
    return paths.contractInput
  }
  return paths.instructionPack
}

function stageLabel(stage: StageId): string {
  return {
    'schema-validation': 'Schema-only Request IR validation',
    'graph-aware-validation': 'Graph-aware Request IR validation',
    'graph-traversal-plan': 'Graph traversal plan',
    'selected-graph-slice': 'Selected graph slice',
    'contract-compiler-input': 'Contract Compiler Input',
    'instruction-pack': 'Instruction Pack',
  }[stage]
}

function stageCode(stage: StageId): string {
  return stage.toUpperCase().replace(/-/g, '_')
}

function renderMarkdownTable(headers: string[], rows: string[][]): string[] {
  const widths = headers.map((header, index) =>
    Math.max(header.length, ...rows.map((row) => (row[index] ?? '').length)),
  )
  const renderRow = (row: string[]): string =>
    `| ${row.map((cell, index) => cell.padEnd(widths[index] ?? cell.length)).join(' | ')} |`
  return [renderRow(headers), `| ${widths.map((width) => '-'.repeat(width)).join(' | ')} |`, ...rows.map(renderRow)]
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

function severityValue(value: unknown): IssueSeverity {
  return value === 'warning' || value === 'info' || value === 'error' ? value : 'error'
}

function resolveRepoPath(root: string, inputPath: string): string {
  return path.isAbsolute(inputPath) ? inputPath : path.resolve(root, inputPath)
}

function pathKey(filePath: string): string {
  return path.resolve(filePath).replaceAll('\\', '/').toLowerCase()
}

function isAncestorPath(parentKey: string, childKey: string): boolean {
  return childKey.startsWith(parentKey.endsWith('/') ? parentKey : `${parentKey}/`)
}
