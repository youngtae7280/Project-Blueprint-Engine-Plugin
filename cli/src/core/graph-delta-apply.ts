import { constants } from 'node:fs'
import { copyFile, mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import path from 'node:path'
import { readJsonSafe, relativePath, writeJsonAtomic, writeTextAtomic } from './fs.js'
import {
  hasCodexControlDirectory,
  hasDevViewControlDirectory,
  hasHiddenControlDirectorySegment,
} from './path-safety.js'
import { projectGraphSourceReadModelToFile } from './read-model-evidence.js'

type JsonRecord = Record<string, unknown>

const REPORT_ROLE = 'devview-graph-delta-apply-report'
const DRY_RUN_ROLE = 'devview-approved-apply-dry-run-report'
const PROPOSAL_ROLE = 'graph-delta-proposal-only-preview'
const MUTATION_POLICY_ROLE = 'devview-graph-source-mutation-policy-boundary-preview'
const MUTATION_POLICY_STATUS = 'devview-graph-source-mutation-policy-boundary-previewed'

type ApplyReportStatus =
  | 'devview-graph-delta-apply-applied'
  | 'devview-graph-delta-apply-blocked'
  | 'devview-graph-delta-apply-rolled-back'

type ApplyStatus =
  | 'applied-graph-source-mutated'
  | 'blocked-dry-run-not-ready'
  | 'blocked-proposal-mismatch'
  | 'blocked-graph-source-target-invalid'
  | 'blocked-protected-target'
  | 'blocked-no-concrete-mutation-operations'
  | 'blocked-unsupported-operation-shape'
  | 'blocked-backup-unavailable'
  | 'blocked-mutated-graph-invalid'
  | 'blocked-read-model-regeneration-failed'
  | 'rolled-back-post-validation-failed'

type FindingSeverity = 'info' | 'warning' | 'error'

export interface GraphDeltaApplyOptions {
  dryRunReport: string
  proposal: string
  graphSource: string
  mutationPolicy: string
  backupDir: string
  readModelOutput: string
  validationOutput: string
  output: string
  markdown?: string
}

export interface GraphDeltaApplyFinding {
  code: string
  severity: FindingSeverity
  message: string
  field?: string
  expected?: unknown
  actual?: unknown
}

export interface GraphDeltaApplyReport {
  schemaVersion: 1
  artifactRole: typeof REPORT_ROLE
  status: ApplyReportStatus
  applyStatus: ApplyStatus
  sourceDryRunReport: string
  sourceGraphDeltaProposal: string
  sourceGraphSource: string
  sourceMutationPolicy: string
  proposalId: string
  graphSourceOriginalHash: string
  graphSourceMutatedHash: string | null
  backupDir: string
  backupCreated: boolean
  backupPath: string | null
  rollbackAvailable: boolean
  rollbackAttempted: boolean
  rollbackStatus: 'not-needed' | 'not-attempted' | 'restored-from-backup' | 'restore-failed'
  mutationApplied: boolean
  graphSourceMutated: boolean
  graphDeltaApplied: boolean
  concreteOperationCount: number
  appliedOperationIds: string[]
  readModelRegenerated: boolean
  readModelOutputPath: string
  validationOutputPath: string
  consistencyCheckStatus: 'not-run-blocked-before-mutation' | 'pass' | 'failed-post-mutation' | 'failed-rolled-back'
  humanDecisionRevalidated: boolean
  validationFindings: GraphDeltaApplyFinding[]
  evidenceAccepted: false
  runtimeEvidenceSatisfied: false
  equivalenceProven: false
  scopeEnforced: false
  ciEnforcementEnabled: false
  approvalAutomationEnabled: false
  codexSelfApprovalAllowed: false
  userAcceptanceAutomated: false
  writtenOutputPath: string | null
  markdownReportPath: string | null
  nonExecutionBoundary: string
}

export interface GraphDeltaApplyFileResult {
  report: GraphDeltaApplyReport
  outputPath: string
  markdownReport?: string
}

interface LoadedInputs {
  resolvedDryRunPath: string
  resolvedProposalPath: string
  resolvedGraphSourcePath: string
  resolvedMutationPolicyPath: string
  resolvedBackupDir: string
  resolvedReadModelOutputPath: string
  resolvedValidationOutputPath: string
  resolvedOutputPath: string
  resolvedMarkdownPath?: string
  dryRun: JsonRecord
  proposal: JsonRecord
  graphSource: JsonRecord
  mutationPolicy: JsonRecord
  originalGraphSourceText: string
  originalGraphSourceHash: string
  backupPath: string
}

interface GraphDeltaOperation {
  operationId: string
  targetKind: 'record' | 'node' | 'edge'
  action: 'replace-field'
  targetId: string
  fieldPath: string[]
  expectedBeforeValue: unknown
  afterValue: unknown
}

interface BlockedReportInput {
  inputs: LoadedInputs
  applyStatus: ApplyStatus
  findings: GraphDeltaApplyFinding[]
  concreteOperationCount?: number
  backupCreated?: boolean
  backupPath?: string | null
  rollbackAvailable?: boolean
  rollbackAttempted?: boolean
  rollbackStatus?: GraphDeltaApplyReport['rollbackStatus']
  graphSourceMutatedHash?: string | null
  readModelRegenerated?: boolean
  consistencyCheckStatus?: GraphDeltaApplyReport['consistencyCheckStatus']
}

export async function applyGraphDeltaFile(
  root: string,
  options: GraphDeltaApplyOptions,
): Promise<GraphDeltaApplyFileResult> {
  validateRequiredOptions(options)
  const inputs = await loadInputs(root, options)
  await validateAllOutputTargets(root, inputs)

  const preflightFindings = [
    ...validateDryRun(inputs.dryRun),
    ...validateProposal(inputs.proposal, root, inputs),
    ...validateMutationPolicy(inputs.mutationPolicy),
    ...validateGraphSourceTarget(root, inputs),
  ]
  const firstPreflightError = preflightFindings.find((finding) => finding.severity === 'error')
  if (firstPreflightError) {
    return writeReport(
      root,
      inputs,
      buildBlockedReport(root, {
        inputs,
        applyStatus: statusForFinding(firstPreflightError.code),
        findings: preflightFindings,
      }),
    )
  }

  const operationsResult = parseGraphDeltaOperations(inputs.proposal, inputs.graphSource)
  if (operationsResult.findings.length > 0) {
    return writeReport(
      root,
      inputs,
      buildBlockedReport(root, {
        inputs,
        applyStatus: operationsResult.findings.some(
          (findingEntry) => findingEntry.code === 'GRAPH_DELTA_APPLY_NO_CONCRETE_MUTATION_OPERATIONS',
        )
          ? 'blocked-no-concrete-mutation-operations'
          : 'blocked-unsupported-operation-shape',
        findings: operationsResult.findings,
        concreteOperationCount: operationsResult.operations.length,
      }),
    )
  }

  let backupCreated = false
  try {
    await mkdir(inputs.resolvedBackupDir, { recursive: true })
    await copyFile(inputs.resolvedGraphSourcePath, inputs.backupPath, constants.COPYFILE_EXCL)
    backupCreated = true
    await validateBackup(inputs)
  } catch (error) {
    return writeReport(
      root,
      inputs,
      buildBlockedReport(root, {
        inputs,
        applyStatus: 'blocked-backup-unavailable',
        findings: [
          finding('GRAPH_DELTA_APPLY_BACKUP_UNAVAILABLE', 'error', 'backupDir', {
            message: `Could not create or verify graph-source backup: ${errorMessage(error)}`,
          }),
        ],
        concreteOperationCount: operationsResult.operations.length,
        backupCreated,
        backupPath: backupCreated ? relativePath(root, inputs.backupPath) : null,
        rollbackAvailable: backupCreated,
      }),
    )
  }

  const mutatedGraphSource = deepClone(inputs.graphSource)
  applyOperations(mutatedGraphSource, operationsResult.operations)
  const tempGraphSourcePath = `${inputs.resolvedGraphSourcePath}.${process.pid}.${Date.now()}.apply.tmp`
  try {
    await writeFile(tempGraphSourcePath, `${JSON.stringify(mutatedGraphSource, null, 2)}\n`, 'utf8')
    await validateGraphSourceShapeFromFile(tempGraphSourcePath)
  } catch (error) {
    await rm(tempGraphSourcePath, { force: true })
    return writeReport(
      root,
      inputs,
      buildBlockedReport(root, {
        inputs,
        applyStatus: 'blocked-mutated-graph-invalid',
        findings: [
          finding('GRAPH_DELTA_APPLY_MUTATED_GRAPH_INVALID', 'error', 'graphSource', {
            message: `Mutated graph-source did not pass pre-replace JSON/shape validation: ${errorMessage(error)}`,
          }),
        ],
        concreteOperationCount: operationsResult.operations.length,
        backupCreated,
        backupPath: relativePath(root, inputs.backupPath),
        rollbackAvailable: true,
      }),
    )
  }

  let graphSourceMutatedHash: string | null = null
  try {
    await rename(tempGraphSourcePath, inputs.resolvedGraphSourcePath)
    const mutatedText = await readFile(inputs.resolvedGraphSourcePath, 'utf8')
    graphSourceMutatedHash = sha256(mutatedText)
    const validation = await writePostMutationValidation(root, inputs)
    const report = buildAppliedReport(root, inputs, operationsResult.operations, graphSourceMutatedHash, validation)
    return writeReport(root, inputs, report)
  } catch (error) {
    const rollbackStatus = await restoreBackup(inputs)
    const validation = {
      status: 'failed-rolled-back' as const,
      error: errorMessage(error),
      rollbackStatus,
    }
    await writeJsonAtomic(inputs.resolvedValidationOutputPath, validation)
    return writeReport(
      root,
      inputs,
      buildBlockedReport(root, {
        inputs,
        applyStatus: 'rolled-back-post-validation-failed',
        findings: [
          finding('GRAPH_DELTA_APPLY_POST_VALIDATION_FAILED', 'error', 'readModelOutput', {
            message: `Post-mutation validation failed after replace: ${errorMessage(error)}`,
          }),
        ],
        concreteOperationCount: operationsResult.operations.length,
        backupCreated,
        backupPath: relativePath(root, inputs.backupPath),
        rollbackAvailable: true,
        rollbackAttempted: true,
        rollbackStatus,
        graphSourceMutatedHash,
        readModelRegenerated: false,
        consistencyCheckStatus: 'failed-rolled-back',
      }),
    )
  } finally {
    await rm(tempGraphSourcePath, { force: true })
  }
}

function validateRequiredOptions(options: GraphDeltaApplyOptions): void {
  const required: Array<[keyof GraphDeltaApplyOptions, string]> = [
    ['dryRunReport', '--dry-run-report <file>'],
    ['proposal', '--proposal <file>'],
    ['graphSource', '--graph-source <file>'],
    ['mutationPolicy', '--mutation-policy <file>'],
    ['backupDir', '--backup-dir <dir>'],
    ['readModelOutput', '--read-model-output <file>'],
    ['validationOutput', '--validation-output <file>'],
    ['output', '--output <file>'],
  ]
  for (const [key, label] of required) {
    if (!options[key]) {
      throw new Error(`graph read-model apply-graph-delta requires ${label}.`)
    }
  }
}

async function loadInputs(root: string, options: GraphDeltaApplyOptions): Promise<LoadedInputs> {
  const resolvedDryRunPath = resolveRepoPath(root, options.dryRunReport)
  const resolvedProposalPath = resolveRepoPath(root, options.proposal)
  const resolvedGraphSourcePath = resolveRepoPath(root, options.graphSource)
  const resolvedMutationPolicyPath = resolveRepoPath(root, options.mutationPolicy)
  const resolvedBackupDir = resolveRepoPath(root, options.backupDir)
  const resolvedReadModelOutputPath = resolveRepoPath(root, options.readModelOutput)
  const resolvedValidationOutputPath = resolveRepoPath(root, options.validationOutput)
  const resolvedOutputPath = resolveRepoPath(root, options.output)
  const resolvedMarkdownPath = options.markdown ? resolveRepoPath(root, options.markdown) : undefined
  const originalGraphSourceText = await readFile(resolvedGraphSourcePath, 'utf8')
  const originalGraphSourceHash = sha256(originalGraphSourceText)
  const backupPath = path.join(
    resolvedBackupDir,
    `${path.basename(resolvedGraphSourcePath)}.${originalGraphSourceHash.slice(0, 16)}.backup.json`,
  )

  return {
    resolvedDryRunPath,
    resolvedProposalPath,
    resolvedGraphSourcePath,
    resolvedMutationPolicyPath,
    resolvedBackupDir,
    resolvedReadModelOutputPath,
    resolvedValidationOutputPath,
    resolvedOutputPath,
    ...(resolvedMarkdownPath ? { resolvedMarkdownPath } : {}),
    dryRun: await readRequiredJson(resolvedDryRunPath, 'Approved Apply Dry Run report'),
    proposal: await readRequiredJson(resolvedProposalPath, 'Graph Delta proposal'),
    graphSource: await readRequiredJson(resolvedGraphSourcePath, 'Graph source'),
    mutationPolicy: await readRequiredJson(resolvedMutationPolicyPath, 'Graph-source Mutation Policy boundary'),
    originalGraphSourceText,
    originalGraphSourceHash,
    backupPath,
  }
}

async function readRequiredJson(filePath: string, label: string): Promise<JsonRecord> {
  const parsed = await readJsonSafe<unknown>(filePath)
  if (!parsed.ok) {
    throw new Error(`Could not read ${label}: ${parsed.error}`)
  }
  const record = asRecord(parsed.value)
  if (!record) {
    throw new Error(`${label} must be a JSON object.`)
  }
  return record
}

async function validateAllOutputTargets(root: string, inputs: LoadedInputs): Promise<void> {
  const outputTargets = [
    inputs.resolvedOutputPath,
    inputs.resolvedReadModelOutputPath,
    inputs.resolvedValidationOutputPath,
    inputs.backupPath,
    ...(inputs.resolvedMarkdownPath ? [inputs.resolvedMarkdownPath] : []),
  ]
  const unique = new Set(outputTargets.map((entry) => normalizeResolvedPath(entry)))
  if (unique.size !== outputTargets.length) {
    throw new Error(
      'Unsafe Graph Delta Apply output paths: output, markdown, backup, read-model, and validation paths must be distinct.',
    )
  }

  const protectedPaths = collectProtectedPaths(root, inputs)
  for (const [label, target] of [
    ['output', inputs.resolvedOutputPath],
    ['markdown', inputs.resolvedMarkdownPath],
    ['read-model-output', inputs.resolvedReadModelOutputPath],
    ['validation-output', inputs.resolvedValidationOutputPath],
    ['backup', inputs.backupPath],
  ] as const) {
    if (!target) {
      continue
    }
    validateWritableTarget(root, target, label, protectedPaths)
  }
  validateBackupDir(root, inputs.resolvedBackupDir, protectedPaths)
}

function validateWritableTarget(
  root: string,
  target: string,
  label: string,
  protectedPaths: Map<string, string>,
): void {
  const normalized = normalizeResolvedPath(target)
  const protectedReason = protectedPaths.get(normalized)
  if (protectedReason) {
    throw new Error(
      `Unsafe Graph Delta Apply ${label} path: ${relativePath(root, target)} would overwrite ${protectedReason}.`,
    )
  }
  if (isProtectedOutputPath(root, target)) {
    throw new Error(
      `Unsafe Graph Delta Apply ${label} path: ${relativePath(root, target)} is inside a protected source/control path.`,
    )
  }
}

function validateBackupDir(root: string, backupDir: string, protectedPaths: Map<string, string>): void {
  if (isProtectedOutputPath(root, backupDir)) {
    throw new Error(
      `Unsafe Graph Delta Apply backup-dir: ${relativePath(root, backupDir)} is inside a protected source/control path.`,
    )
  }
  for (const [protectedPath, reason] of protectedPaths) {
    if (isSubpath(backupDir, protectedPath) || isSubpath(protectedPath, backupDir)) {
      throw new Error(`Unsafe Graph Delta Apply backup-dir: ${relativePath(root, backupDir)} overlaps ${reason}.`)
    }
  }
}

function collectProtectedPaths(root: string, inputs: LoadedInputs): Map<string, string> {
  const protectedPaths = new Map<string, string>()
  const add = (filePath: string | undefined, reason: string): void => {
    if (!filePath) {
      return
    }
    protectedPaths.set(normalizeResolvedPath(filePath), reason)
  }
  add(inputs.resolvedDryRunPath, 'the source Approved Apply Dry Run report')
  add(inputs.resolvedProposalPath, 'the source Graph Delta proposal')
  add(inputs.resolvedGraphSourcePath, 'the target graph-source input')
  add(inputs.resolvedMutationPolicyPath, 'the source Graph-source Mutation Policy boundary')

  for (const source of [inputs.dryRun, inputs.proposal, inputs.mutationPolicy]) {
    for (const candidate of collectConcretePathStrings(source)) {
      add(resolveRepoPath(root, candidate), `linked source path ${candidate}`)
    }
  }
  return protectedPaths
}

function validateDryRun(dryRun: JsonRecord): GraphDeltaApplyFinding[] {
  const findings: GraphDeltaApplyFinding[] = []
  expectString(dryRun, 'artifactRole', DRY_RUN_ROLE, findings, 'GRAPH_DELTA_APPLY_DRY_RUN_ROLE_INVALID')
  expectString(
    dryRun,
    'status',
    'devview-approved-apply-dry-run-ready',
    findings,
    'GRAPH_DELTA_APPLY_DRY_RUN_NOT_READY',
  )
  expectString(
    dryRun,
    'dryRunReadinessStatus',
    'dry-run-ready-for-future-apply-command',
    findings,
    'GRAPH_DELTA_APPLY_DRY_RUN_READINESS_NOT_READY',
  )
  for (const field of [
    'graphDeltaApplyEnabled',
    'graphDeltaApplied',
    'graphSourceMutationAllowed',
    'graphSourceMutated',
    'mutationAllowed',
    'runtimeEvidenceSatisfied',
    'evidenceAccepted',
    'equivalenceProven',
    'scopeEnforced',
    'ciEnforcementEnabled',
  ]) {
    expectFalse(dryRun, field, findings, 'GRAPH_DELTA_APPLY_DRY_RUN_UNSAFE_AUTHORITY_FLAG')
  }
  return findings
}

function validateProposal(proposal: JsonRecord, root: string, inputs: LoadedInputs): GraphDeltaApplyFinding[] {
  const findings: GraphDeltaApplyFinding[] = []
  expectString(proposal, 'artifactRole', PROPOSAL_ROLE, findings, 'GRAPH_DELTA_APPLY_PROPOSAL_ROLE_INVALID')
  const actualProposalPath = relativePath(root, inputs.resolvedProposalPath)
  if (stringValue(inputs.dryRun.sourceGraphDeltaProposal) !== actualProposalPath) {
    findings.push(
      finding('GRAPH_DELTA_APPLY_PROPOSAL_PATH_MISMATCH', 'error', 'sourceGraphDeltaProposal', {
        expected: inputs.dryRun.sourceGraphDeltaProposal,
        actual: actualProposalPath,
        message: 'Dry-run sourceGraphDeltaProposal does not match the proposal input path.',
      }),
    )
  }
  const proposalId = stringValue(proposal.proposalId)
  if (proposalId !== stringValue(inputs.dryRun.proposalId)) {
    findings.push(
      finding('GRAPH_DELTA_APPLY_PROPOSAL_ID_MISMATCH', 'error', 'proposalId', {
        expected: inputs.dryRun.proposalId,
        actual: proposalId,
        message: 'Proposal id does not match the Approved Apply Dry Run report.',
      }),
    )
  }
  for (const field of ['graphDeltaApplied', 'graphSourceMutated']) {
    const value = proposalFlagValue(proposal, field)
    if (value !== undefined && value !== false) {
      findings.push(
        finding('GRAPH_DELTA_APPLY_PROPOSAL_ALREADY_APPLIED_OR_MUTATED', 'error', field, {
          expected: false,
          actual: value,
          message: `Proposal must not already set ${field}.`,
        }),
      )
    }
  }
  for (const field of [
    'runtimeEvidenceSatisfied',
    'evidenceAccepted',
    'equivalenceProven',
    'scopeEnforced',
    'ciEnforcementEnabled',
  ]) {
    const value = proposalFlagValue(proposal, field)
    if (value !== undefined && value !== false) {
      findings.push(unsafeFlagFinding('proposal', field, value))
    }
  }
  return findings
}

function validateMutationPolicy(policy: JsonRecord): GraphDeltaApplyFinding[] {
  const findings: GraphDeltaApplyFinding[] = []
  expectString(policy, 'artifactRole', MUTATION_POLICY_ROLE, findings, 'GRAPH_DELTA_APPLY_MUTATION_POLICY_ROLE_INVALID')
  expectString(policy, 'status', MUTATION_POLICY_STATUS, findings, 'GRAPH_DELTA_APPLY_MUTATION_POLICY_STATUS_INVALID')
  const targetPolicy = asRecord(policy.futureMutationTargetPolicy)
  if (stringValue(targetPolicy?.futureAllowedTarget) !== 'explicit-current-graph-source-only') {
    findings.push(
      finding(
        'GRAPH_DELTA_APPLY_MUTATION_POLICY_TARGET_INVALID',
        'error',
        'futureMutationTargetPolicy.futureAllowedTarget',
        {
          expected: 'explicit-current-graph-source-only',
          actual: targetPolicy?.futureAllowedTarget,
          message: 'Mutation policy must require an explicit current graph-source target.',
        },
      ),
    )
  }
  for (const field of [
    'graphSourceMutationAllowed',
    'graphSourceMutated',
    'graphDeltaApplyEnabled',
    'graphDeltaApplied',
    'runtimeEvidenceSatisfied',
    'evidenceAccepted',
    'equivalenceProven',
    'scopeEnforced',
    'ciEnforcementEnabled',
  ]) {
    expectFalse(policy, field, findings, 'GRAPH_DELTA_APPLY_MUTATION_POLICY_UNSAFE_AUTHORITY_FLAG')
  }
  for (const requirementId of [
    'backup-or-reversible-patch',
    'fallback-plan',
    'regenerate-read-model',
    'consistency-check',
    'mutation-report',
    'rollback-on-failure-policy',
  ]) {
    requireMutationPolicyRequirement(policy, requirementId, findings)
  }
  return findings
}

function validateGraphSourceTarget(root: string, inputs: LoadedInputs): GraphDeltaApplyFinding[] {
  const findings: GraphDeltaApplyFinding[] = []
  if (isProtectedGraphSourceTargetPath(root, inputs.resolvedGraphSourcePath)) {
    findings.push(
      finding('GRAPH_DELTA_APPLY_PROTECTED_TARGET', 'error', 'graphSource', {
        actual: relativePath(root, inputs.resolvedGraphSourcePath),
        message:
          'Graph Delta Apply target must be an explicit graph-source file, not generated/protected source authority.',
      }),
    )
    return findings
  }
  try {
    validateGraphSourceShape(inputs.graphSource)
  } catch (error) {
    findings.push(
      finding('GRAPH_DELTA_APPLY_GRAPH_SOURCE_TARGET_INVALID', 'error', 'graphSource', {
        message: `Graph-source target failed parse/shape validation: ${errorMessage(error)}`,
      }),
    )
  }
  return findings
}

function parseGraphDeltaOperations(
  proposal: JsonRecord,
  graphSource: JsonRecord,
): { operations: GraphDeltaOperation[]; findings: GraphDeltaApplyFinding[] } {
  const rawOperations = proposal.graphDeltaOperations
  if (!Array.isArray(rawOperations) || rawOperations.length === 0) {
    return {
      operations: [],
      findings: [
        finding('GRAPH_DELTA_APPLY_NO_CONCRETE_MUTATION_OPERATIONS', 'error', 'graphDeltaOperations', {
          expected: 'non-empty supported graphDeltaOperations array',
          actual: Array.isArray(rawOperations) ? rawOperations.length : typeof rawOperations,
          message:
            'Proposal has no concrete deterministic mutation operations. Current proposal-only previews must not mutate graph-source.',
        }),
      ],
    }
  }

  const operations: GraphDeltaOperation[] = []
  const findings: GraphDeltaApplyFinding[] = []
  for (const [index, rawOperation] of rawOperations.entries()) {
    const operation = asRecord(rawOperation)
    if (!operation) {
      findings.push(unsupportedOperationFinding(index, 'operation must be an object'))
      continue
    }
    const parsed = parseOperation(index, operation, graphSource)
    if ('finding' in parsed) {
      findings.push(parsed.finding)
    } else {
      operations.push(parsed.operation)
    }
  }
  return { operations, findings }
}

function parseOperation(
  index: number,
  operation: JsonRecord,
  graphSource: JsonRecord,
): { operation: GraphDeltaOperation } | { finding: GraphDeltaApplyFinding } {
  const operationId = stringValue(operation.operationId)
  const targetKind = stringValue(operation.targetKind)
  const action = stringValue(operation.action)
  const targetId = stringValue(operation.targetId)
  const fieldPath = operation.fieldPath
  if (!operationId) {
    return { finding: unsupportedOperationFinding(index, 'operationId must be a non-empty string') }
  }
  if (!['record', 'node', 'edge'].includes(targetKind)) {
    return { finding: unsupportedOperationFinding(index, 'targetKind must be record, node, or edge') }
  }
  if (action !== 'replace-field') {
    return { finding: unsupportedOperationFinding(index, 'only action replace-field is supported in v1') }
  }
  if (!targetId) {
    return { finding: unsupportedOperationFinding(index, 'targetId must be a non-empty string') }
  }
  if (!isSafeFieldPath(fieldPath)) {
    return { finding: unsupportedOperationFinding(index, 'fieldPath must be a non-empty array of safe property names') }
  }
  if (!Object.hasOwn(operation, 'expectedBeforeValue')) {
    return { finding: unsupportedOperationFinding(index, 'expectedBeforeValue is required') }
  }
  if (!Object.hasOwn(operation, 'afterValue')) {
    return { finding: unsupportedOperationFinding(index, 'afterValue is required') }
  }
  if (deepEqual(operation.expectedBeforeValue, operation.afterValue)) {
    return { finding: unsupportedOperationFinding(index, 'afterValue must differ from expectedBeforeValue') }
  }
  const target = findTarget(graphSource, targetKind as GraphDeltaOperation['targetKind'], targetId)
  if (!target) {
    return { finding: unsupportedOperationFinding(index, `target ${targetId} was not found`) }
  }
  const actualBefore = getPath(target, fieldPath)
  if (!deepEqual(actualBefore, operation.expectedBeforeValue)) {
    return {
      finding: finding('GRAPH_DELTA_APPLY_EXPECTED_BEFORE_MISMATCH', 'error', `graphDeltaOperations[${index}]`, {
        expected: operation.expectedBeforeValue,
        actual: actualBefore,
        message: `Operation ${operationId} expectedBeforeValue does not match current graph-source.`,
      }),
    }
  }
  return {
    operation: {
      operationId,
      targetKind: targetKind as GraphDeltaOperation['targetKind'],
      action: 'replace-field',
      targetId,
      fieldPath,
      expectedBeforeValue: operation.expectedBeforeValue,
      afterValue: operation.afterValue,
    },
  }
}

function applyOperations(graphSource: JsonRecord, operations: GraphDeltaOperation[]): void {
  for (const operation of operations) {
    const target = findTarget(graphSource, operation.targetKind, operation.targetId)
    if (!target) {
      throw new Error(`Operation target disappeared before apply: ${operation.targetId}`)
    }
    setPath(target, operation.fieldPath, operation.afterValue)
  }
}

function buildAppliedReport(
  root: string,
  inputs: LoadedInputs,
  operations: GraphDeltaOperation[],
  graphSourceMutatedHash: string,
  validation: { status: 'pass'; projectionPath: string },
): GraphDeltaApplyReport {
  return {
    ...baseReport(root, inputs),
    status: 'devview-graph-delta-apply-applied',
    applyStatus: 'applied-graph-source-mutated',
    graphSourceMutatedHash,
    backupCreated: true,
    backupPath: relativePath(root, inputs.backupPath),
    rollbackAvailable: true,
    rollbackAttempted: false,
    rollbackStatus: 'not-needed',
    mutationApplied: true,
    graphSourceMutated: true,
    graphDeltaApplied: true,
    concreteOperationCount: operations.length,
    appliedOperationIds: operations.map((operation) => operation.operationId),
    readModelRegenerated: true,
    readModelOutputPath: validation.projectionPath,
    consistencyCheckStatus: 'pass',
    validationFindings: [],
  }
}

function buildBlockedReport(root: string, input: BlockedReportInput): GraphDeltaApplyReport {
  return {
    ...baseReport(root, input.inputs),
    status:
      input.applyStatus === 'rolled-back-post-validation-failed'
        ? 'devview-graph-delta-apply-rolled-back'
        : 'devview-graph-delta-apply-blocked',
    applyStatus: input.applyStatus,
    graphSourceMutatedHash: input.graphSourceMutatedHash ?? null,
    backupCreated: input.backupCreated ?? false,
    backupPath: input.backupPath ?? null,
    rollbackAvailable: input.rollbackAvailable ?? false,
    rollbackAttempted: input.rollbackAttempted ?? false,
    rollbackStatus: input.rollbackStatus ?? 'not-attempted',
    mutationApplied: false,
    graphSourceMutated: false,
    graphDeltaApplied: false,
    concreteOperationCount: input.concreteOperationCount ?? 0,
    appliedOperationIds: [],
    readModelRegenerated: input.readModelRegenerated ?? false,
    consistencyCheckStatus: input.consistencyCheckStatus ?? 'not-run-blocked-before-mutation',
    validationFindings: input.findings,
  }
}

function baseReport(
  root: string,
  inputs: LoadedInputs,
): Omit<
  GraphDeltaApplyReport,
  | 'status'
  | 'applyStatus'
  | 'graphSourceMutatedHash'
  | 'backupCreated'
  | 'backupPath'
  | 'rollbackAvailable'
  | 'rollbackAttempted'
  | 'rollbackStatus'
  | 'mutationApplied'
  | 'graphSourceMutated'
  | 'graphDeltaApplied'
  | 'concreteOperationCount'
  | 'appliedOperationIds'
  | 'readModelRegenerated'
  | 'consistencyCheckStatus'
  | 'validationFindings'
> {
  return {
    schemaVersion: 1,
    artifactRole: REPORT_ROLE,
    sourceDryRunReport: relativePath(root, inputs.resolvedDryRunPath),
    sourceGraphDeltaProposal: relativePath(root, inputs.resolvedProposalPath),
    sourceGraphSource: relativePath(root, inputs.resolvedGraphSourcePath),
    sourceMutationPolicy: relativePath(root, inputs.resolvedMutationPolicyPath),
    proposalId: stringValue(inputs.proposal.proposalId) || stringValue(inputs.dryRun.proposalId) || 'unknown-proposal',
    graphSourceOriginalHash: inputs.originalGraphSourceHash,
    backupDir: relativePath(root, inputs.resolvedBackupDir),
    readModelOutputPath: relativePath(root, inputs.resolvedReadModelOutputPath),
    validationOutputPath: relativePath(root, inputs.resolvedValidationOutputPath),
    humanDecisionRevalidated:
      inputs.dryRun.status === 'devview-approved-apply-dry-run-ready' &&
      inputs.dryRun.dryRunReadinessStatus === 'dry-run-ready-for-future-apply-command',
    evidenceAccepted: false,
    runtimeEvidenceSatisfied: false,
    equivalenceProven: false,
    scopeEnforced: false,
    ciEnforcementEnabled: false,
    approvalAutomationEnabled: false,
    codexSelfApprovalAllowed: false,
    userAcceptanceAutomated: false,
    writtenOutputPath: null,
    markdownReportPath: null,
    nonExecutionBoundary:
      'Graph Delta Apply mutates only an explicit graph-source target after hardened human approval, dry-run readiness, concrete mutation operations, backup, rollback, and post-mutation read-model validation. It does not accept Evidence, satisfy runtime Evidence, prove equivalence, enforce scope, configure CI, or automate approval/user acceptance.',
  }
}

async function writeReport(
  root: string,
  inputs: LoadedInputs,
  report: GraphDeltaApplyReport,
): Promise<GraphDeltaApplyFileResult> {
  report.writtenOutputPath = relativePath(root, inputs.resolvedOutputPath)
  await writeJsonAtomic(inputs.resolvedOutputPath, report)
  if (inputs.resolvedMarkdownPath) {
    report.markdownReportPath = relativePath(root, inputs.resolvedMarkdownPath)
    await writeTextAtomic(inputs.resolvedMarkdownPath, renderGraphDeltaApplyMarkdown(report))
    await writeJsonAtomic(inputs.resolvedOutputPath, report)
  }
  return {
    report,
    outputPath: relativePath(root, inputs.resolvedOutputPath),
    ...(inputs.resolvedMarkdownPath ? { markdownReport: relativePath(root, inputs.resolvedMarkdownPath) } : {}),
  }
}

async function validateBackup(inputs: LoadedInputs): Promise<void> {
  const backupText = await readFile(inputs.backupPath, 'utf8')
  if (sha256(backupText) !== inputs.originalGraphSourceHash) {
    throw new Error('backup hash does not match original graph-source')
  }
  JSON.parse(backupText)
}

async function validateGraphSourceShapeFromFile(filePath: string): Promise<void> {
  const text = await readFile(filePath, 'utf8')
  validateGraphSourceShape(JSON.parse(text))
}

function validateGraphSourceShape(value: unknown): void {
  const source = asRecord(value)
  if (!source) {
    throw new Error('graph-source must be a JSON object')
  }
  const sourceRecords = asRecord(source.sourceRecords)
  if (sourceRecords) {
    if (!Array.isArray(sourceRecords.nodes) || !Array.isArray(sourceRecords.edges)) {
      throw new Error('graph-source sourceRecords.nodes and sourceRecords.edges must be arrays')
    }
    return
  }
  if (Array.isArray(source.nodes) && Array.isArray(source.edges)) {
    return
  }
  if (Array.isArray(source.records) && Array.isArray(source.nodes)) {
    return
  }
  throw new Error('graph-source must expose sourceRecords or top-level graph arrays')
}

async function writePostMutationValidation(
  root: string,
  inputs: LoadedInputs,
): Promise<{ status: 'pass'; projectionPath: string }> {
  const projection = await projectGraphSourceReadModelToFile(
    root,
    relativePath(root, inputs.resolvedGraphSourcePath),
    relativePath(root, inputs.resolvedReadModelOutputPath),
  )
  const validation = {
    schemaVersion: 1,
    artifactRole: 'devview-graph-delta-apply-post-mutation-validation',
    status: 'post-mutation-consistency-pass',
    sourceGraphSource: relativePath(root, inputs.resolvedGraphSourcePath),
    readModelOutputPath: relativePath(root, projection.projectionJsonPath),
    projectionArtifactRole: stringValue(asRecord(projection.projection.metadata)?.artifactRole),
    projectedNodeCount: Array.isArray(projection.projection.nodes) ? projection.projection.nodes.length : 0,
    projectedEdgeCount: Array.isArray(projection.projection.edges) ? projection.projection.edges.length : 0,
    evidenceAccepted: false,
    runtimeEvidenceSatisfied: false,
    equivalenceProven: false,
    scopeEnforced: false,
    ciEnforcementEnabled: false,
  }
  await writeJsonAtomic(inputs.resolvedValidationOutputPath, validation)
  return { status: 'pass', projectionPath: relativePath(root, projection.projectionJsonPath) }
}

async function restoreBackup(inputs: LoadedInputs): Promise<GraphDeltaApplyReport['rollbackStatus']> {
  try {
    await copyFile(inputs.backupPath, inputs.resolvedGraphSourcePath)
    await validateGraphSourceShapeFromFile(inputs.resolvedGraphSourcePath)
    return 'restored-from-backup'
  } catch {
    return 'restore-failed'
  }
}

function findTarget(
  graphSource: JsonRecord,
  targetKind: GraphDeltaOperation['targetKind'],
  targetId: string,
): JsonRecord | null {
  const sourceRecords = asRecord(graphSource.sourceRecords)
  const collection =
    targetKind === 'record'
      ? firstArray(graphSource.records, sourceRecords?.records)
      : targetKind === 'node'
        ? firstArray(graphSource.nodes, sourceRecords?.nodes)
        : firstArray(graphSource.edges, sourceRecords?.edges)
  const target = collection.find((entry) => asRecord(entry)?.id === targetId)
  return asRecord(target)
}

function firstArray(...values: unknown[]): unknown[] {
  return values.find((value): value is unknown[] => Array.isArray(value)) ?? []
}

function getPath(source: JsonRecord, fieldPath: string[]): unknown {
  let cursor: unknown = source
  for (const part of fieldPath) {
    const record = asRecord(cursor)
    if (!record) {
      return undefined
    }
    cursor = record[part]
  }
  return cursor
}

function setPath(source: JsonRecord, fieldPath: string[], value: unknown): void {
  let cursor: JsonRecord = source
  for (const part of fieldPath.slice(0, -1)) {
    const next = asRecord(cursor[part])
    if (!next) {
      throw new Error(`Cannot traverse non-object fieldPath segment ${part}`)
    }
    cursor = next
  }
  cursor[fieldPath[fieldPath.length - 1]] = value
}

function isSafeFieldPath(value: unknown): value is string[] {
  const forbidden = new Set(['__proto__', 'prototype', 'constructor'])
  return (
    Array.isArray(value) &&
    value.length > 0 &&
    value.length <= 4 &&
    value.every((part) => typeof part === 'string' && /^[A-Za-z0-9_-]+$/.test(part) && !forbidden.has(part))
  )
}

function statusForFinding(code: string): ApplyStatus {
  if (code.includes('DRY_RUN')) {
    return 'blocked-dry-run-not-ready'
  }
  if (code.includes('PROPOSAL')) {
    return 'blocked-proposal-mismatch'
  }
  if (code.includes('PROTECTED_TARGET')) {
    return 'blocked-protected-target'
  }
  if (code.includes('GRAPH_SOURCE')) {
    return 'blocked-graph-source-target-invalid'
  }
  return 'blocked-unsupported-operation-shape'
}

function proposalFlagValue(proposal: JsonRecord, field: string): unknown {
  const boundaries = asRecord(proposal.boundaries)
  if (field in proposal) {
    return proposal[field]
  }
  if (boundaries && field in boundaries) {
    return boundaries[field]
  }
  if (boundaries && field === 'evidenceAccepted' && 'acceptedEvidence' in boundaries) {
    return boundaries.acceptedEvidence
  }
  return undefined
}

function requireMutationPolicyRequirement(
  policy: JsonRecord,
  requirementId: string,
  findings: GraphDeltaApplyFinding[],
): void {
  const value = policy.mutationPolicyRequirements
  const allRequirements = [
    ...(Array.isArray(value) ? value : []),
    ...(Array.isArray(policy.futurePreMutationRequirements) ? policy.futurePreMutationRequirements : []),
    ...(Array.isArray(policy.futureMutationRequirements) ? policy.futureMutationRequirements : []),
    ...(Array.isArray(policy.futurePostMutationRequirements) ? policy.futurePostMutationRequirements : []),
  ]
  if (allRequirements.length === 0) {
    findings.push(
      finding('GRAPH_DELTA_APPLY_MUTATION_POLICY_REQUIREMENTS_MISSING', 'error', 'mutationPolicyRequirements', {
        expected: requirementId,
        actual: 'missing-list',
        message: `Mutation policy must include future requirement ${requirementId}.`,
      }),
    )
    return
  }
  const present = allRequirements.some((entry) => asRecord(entry)?.requirementId === requirementId)
  if (!present) {
    findings.push(
      finding('GRAPH_DELTA_APPLY_MUTATION_POLICY_REQUIREMENT_MISSING', 'error', 'mutationPolicyRequirements', {
        expected: requirementId,
        actual: allRequirements.map((entry) => asRecord(entry)?.requirementId).filter(Boolean),
        message: `Mutation policy must include future requirement ${requirementId}.`,
      }),
    )
  }
}

function expectString(
  record: JsonRecord,
  field: string,
  expected: string,
  findings: GraphDeltaApplyFinding[],
  code: string,
): void {
  if (record[field] !== expected) {
    findings.push(
      finding(code, 'error', field, {
        expected,
        actual: record[field],
        message: `${field} must be ${expected}.`,
      }),
    )
  }
}

function expectFalse(record: JsonRecord, field: string, findings: GraphDeltaApplyFinding[], code: string): void {
  if (record[field] !== false) {
    findings.push(unsafeFlagFinding('input', field, record[field], code))
  }
}

function unsafeFlagFinding(
  label: string,
  field: string,
  actual: unknown,
  code = 'GRAPH_DELTA_APPLY_UNSAFE_AUTHORITY_FLAG',
): GraphDeltaApplyFinding {
  return finding(code, 'error', field, {
    expected: false,
    actual,
    message: `Unsafe ${label} authority flag ${field} must be false before Graph Delta Apply.`,
  })
}

function unsupportedOperationFinding(index: number, message: string): GraphDeltaApplyFinding {
  return finding('GRAPH_DELTA_APPLY_UNSUPPORTED_OPERATION_SHAPE', 'error', `graphDeltaOperations[${index}]`, {
    message,
  })
}

function finding(
  code: string,
  severity: FindingSeverity,
  field: string,
  input: { message: string; expected?: unknown; actual?: unknown },
): GraphDeltaApplyFinding {
  return {
    code,
    severity,
    message: input.message,
    field,
    ...(input.expected !== undefined ? { expected: input.expected } : {}),
    ...(input.actual !== undefined ? { actual: input.actual } : {}),
  }
}

function renderGraphDeltaApplyMarkdown(report: GraphDeltaApplyReport): string {
  const findings = report.validationFindings.length
    ? report.validationFindings.map((entry) => `- ${entry.code}: ${entry.message}`).join('\n')
    : '- None.'
  const tableRows = [
    ['Apply status', `\`${report.applyStatus}\``],
    ['Proposal', `\`${report.sourceGraphDeltaProposal}\``],
    ['Graph-source', `\`${report.sourceGraphSource}\``],
    ['Mutation applied', `\`${report.mutationApplied}\``],
    ['Graph-source mutated', `\`${report.graphSourceMutated}\``],
    ['Graph delta applied', `\`${report.graphDeltaApplied}\``],
    ['Backup created', `\`${report.backupCreated}\``],
    ['Rollback status', `\`${report.rollbackStatus}\``],
    ['Read-model regenerated', `\`${report.readModelRegenerated}\``],
    ['Consistency check', `\`${report.consistencyCheckStatus}\``],
  ]
  const table = renderMarkdownTable(['Field', 'Value'], tableRows)

  return `# DevView Graph Delta Apply

Status: \`${report.status}\`

${table}

## Findings

${findings}

## Safety Boundary

- Evidence accepted: \`${report.evidenceAccepted}\`
- Runtime Evidence satisfied: \`${report.runtimeEvidenceSatisfied}\`
- Equivalence proven: \`${report.equivalenceProven}\`
- Scope enforced: \`${report.scopeEnforced}\`
- CI enforcement enabled: \`${report.ciEnforcementEnabled}\`
- Approval automation enabled: \`${report.approvalAutomationEnabled}\`
`
}

function renderMarkdownTable(header: [string, string], rows: string[][]): string {
  const widths = header.map((value, index) => Math.max(value.length, ...rows.map((row) => row[index]?.length ?? 0)))
  const renderRow = (row: string[]) => `| ${row[0].padEnd(widths[0])} | ${row[1].padEnd(widths[1])} |`
  return [renderRow(header), `| ${'-'.repeat(widths[0])} | ${'-'.repeat(widths[1])} |`, ...rows.map(renderRow)].join(
    '\n',
  )
}

function isProtectedGraphSourceTargetPath(root: string, filePath: string): boolean {
  const relative = relativePath(root, filePath)
  return (
    hasDevViewControlDirectory(relative) ||
    hasCodexControlDirectory(relative) ||
    hasHiddenControlDirectorySegment(relative) ||
    relative.includes('/generated/') ||
    /(^|\/)(evidence|proposal|review|decision|hook|config)(-|\/|\.)/i.test(relative) ||
    /read-model|runtime-report|source-authority|project-memory/i.test(relative)
  )
}

function isProtectedOutputPath(root: string, filePath: string): boolean {
  const relative = relativePath(root, filePath)
  return (
    hasDevViewControlDirectory(relative) ||
    hasCodexControlDirectory(relative) ||
    hasHiddenControlDirectorySegment(relative) ||
    /(^|\/)graph-source\.json$/i.test(relative)
  )
}

function collectConcretePathStrings(value: unknown): string[] {
  const output: string[] = []
  const visit = (entry: unknown): void => {
    if (typeof entry === 'string') {
      if (looksLikePath(entry)) {
        output.push(entry)
      }
      return
    }
    if (Array.isArray(entry)) {
      entry.forEach(visit)
      return
    }
    const record = asRecord(entry)
    if (record) {
      Object.values(record).forEach(visit)
    }
  }
  visit(value)
  return output
}

function looksLikePath(value: string): boolean {
  return (
    /[\\/]/.test(value) ||
    /\.(json|md|txt|html|yml|yaml)$/i.test(value) ||
    value.startsWith('.devview/') ||
    value.startsWith('.codex/')
  )
}

function resolveRepoPath(root: string, inputPath: string): string {
  return path.resolve(root, inputPath)
}

function normalizeResolvedPath(filePath: string): string {
  return path.resolve(filePath).toLowerCase()
}

function isSubpath(parent: string, candidate: string): boolean {
  const relative = path.relative(path.resolve(parent), path.resolve(candidate))
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative))
}

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex')
}

function asRecord(value: unknown): JsonRecord | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as JsonRecord) : null
}

function stringValue(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

function deepClone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

function deepEqual(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right)
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
