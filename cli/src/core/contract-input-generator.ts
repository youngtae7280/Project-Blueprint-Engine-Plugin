import path from 'node:path'
import { readJsonSafe, relativePath, writeJsonAtomic } from './fs.js'
import type { IssueSeverity } from './types.js'

const GENERATOR_NAME = 'ContractCompilerInputGenerator'
const COMPILER_INPUT_SCHEMA_PATH = 'examples/read-model-aggregate/compiler-input-model-schema.json'
const REQUIRED_INPUT_GROUPS = [
  'humanRequest',
  'graphSnapshot',
  'packSchema',
  'policySnapshot',
  'evidenceIndex',
  'targetScopeCandidates',
  'outputRequirementSources',
  'stopConditionSources',
  'riskSources',
]

type JsonRecord = Record<string, unknown>

export interface ContractInputGeneratorFinding {
  code: string
  severity: IssueSeverity
  field?: string
  message: string
  expected?: unknown
  actual?: unknown
  suggestedFix?: string
}

export interface ContractInputGeneratorContext {
  graphAwareValidation?: unknown
  requestIrCandidate?: unknown
  selectedSlicePath?: string
}

export interface ContractCompilerInputResult {
  schemaVersion: 1
  artifactRole: 'contract-compiler-input'
  status: 'contract-compiler-input-generated' | 'contract-compiler-input-blocked'
  generatorName: typeof GENERATOR_NAME
  generationScope: 'selected-slice-to-contract-input-no-instruction-pack'
  sourceSelectedGraphSlice: string
  sourceTraversalPlan: string
  sourceGraphAwareValidation: string
  sourceRequestIrCandidate: string | null
  graphSourcePath: string
  generatedReadModelPath: string
  compatibleInputModelSchema: string
  sourceMode: 'selected-graph-slice-contract-input-preview'
  changeId: string
  contractInputGenerated: boolean
  instructionPackGenerated: false
  graphSourceMutated: false
  graphDeltaApplied: false
  approvalStatus: 'not-approved'
  humanDecisionRecorded: false
  equivalenceProven: false
  runtimeEvidenceSatisfied: false
  scopeEnforced: false
  ciEnforcementEnabled: false
  humanRequest: JsonRecord
  graphSnapshot: JsonRecord
  packSchema: JsonRecord
  policySnapshot: JsonRecord
  evidenceIndex: JsonRecord
  targetScopeCandidates: JsonRecord[]
  allowedScope: JsonRecord[]
  forbiddenScope: JsonRecord[]
  requiredEvidence: JsonRecord[]
  outputRequirementSources: JsonRecord[]
  outputRequirements: JsonRecord[]
  stopConditionSources: JsonRecord[]
  stopConditions: JsonRecord[]
  riskSources: JsonRecord[]
  knownRisks: JsonRecord[]
  compilerInputModelCompatibility: {
    requiredInputGroups: string[]
    requiredInputGroupsPresent: string[]
    missingRequiredInputGroups: string[]
    compatibilityStatus: 'frontend-field-compatible-with-compiler-input-model-groups' | 'blocked'
    backendDryRunValidationStatus: 'not-run-not-same-artifact-role'
    backendDryRunInvoked: false
    backendInstructionPackGenerated: false
  }
  mappingTrace: JsonRecord[]
  validationFindings: ContractInputGeneratorFinding[]
  contractCompilerReadinessStatus: 'ready' | 'not-ready' | 'review-required' | 'blocked'
  requiresClarification: boolean
  humanReviewRequired: boolean
  outputWritePolicy: 'explicit-output-only'
  writtenOutputPath: string | null
  writtenOutputPathAuthorityStatus: 'not-written-stdout-only' | 'explicit-preview-output-not-graph-source'
  nonExecutionStatement: string
  nonExecutionBoundary: string
}

export interface ContractCompilerInputFileResult {
  result: ContractCompilerInputResult
  outputPath?: string
}

export function generateContractCompilerInput(
  selectedSlice: unknown,
  context: ContractInputGeneratorContext = {},
): ContractCompilerInputResult {
  const findings: ContractInputGeneratorFinding[] = []
  const slice = asRecord(selectedSlice)
  const graphAwareValidation = asRecord(context.graphAwareValidation)
  const requestIrCandidate = asRecord(context.requestIrCandidate)

  validateSelectedSlicePrerequisites(slice, findings)

  const selectedNodes = arrayRecords(slice?.selectedNodes)
  const selectedEdges = arrayRecords(slice?.selectedEdges)
  const includedScopeNodes = arrayRecords(slice?.includedScopeNodes)
  const includedEvidenceNodes = arrayRecords(slice?.includedEvidenceNodes)
  const includedRiskNodes = arrayRecords(slice?.includedRiskNodes)
  const validationFindings = arrayRecords(slice?.validationFindings)
  for (const finding of validationFindings) {
    if (finding.severity === 'error') {
      findings.push({
        code: 'CONTRACT_INPUT_SELECTED_SLICE_HAS_ERROR_FINDING',
        severity: 'error',
        field: 'validationFindings',
        message: `Selected slice contains an error finding: ${stringValue(finding.code) || 'unknown'}.`,
      })
    }
  }

  if (selectedNodes.length === 0) {
    findings.push({
      code: 'CONTRACT_INPUT_SELECTED_NODES_MISSING',
      severity: 'error',
      field: 'selectedNodes',
      message: 'Contract input generation requires selectedNodes from the selected graph slice.',
    })
  }
  if (selectedEdges.length === 0) {
    findings.push({
      code: 'CONTRACT_INPUT_SELECTED_EDGES_MISSING',
      severity: 'error',
      field: 'selectedEdges',
      message: 'Contract input generation requires selectedEdges from the selected graph slice.',
    })
  }
  if (includedScopeNodes.length === 0) {
    findings.push({
      code: 'CONTRACT_INPUT_SCOPE_NODES_MISSING',
      severity: 'error',
      field: 'includedScopeNodes',
      message: 'Contract input generation requires at least one target/scope node.',
    })
  }
  if (includedEvidenceNodes.length === 0) {
    findings.push({
      code: 'CONTRACT_INPUT_EVIDENCE_NODES_MISSING',
      severity: 'error',
      field: 'includedEvidenceNodes',
      message: 'Contract input generation requires at least one evidence or check node.',
    })
  }

  const sourceSelectedGraphSlice = context.selectedSlicePath ?? '<in-memory>'
  const sourceTraversalPlan = stringValue(slice?.sourceTraversalPlan)
  const sourceGraphAwareValidation = stringValue(slice?.sourceGraphAwareValidation)
  const graphSourcePath = stringValue(slice?.graphSourcePath)
  const generatedReadModelPath = stringValue(slice?.generatedReadModelPath)
  const sourceRequestIrCandidate = stringValue(graphAwareValidation?.candidatePath) || null
  const fixtureRoot = inferFixtureRoot(sourceSelectedGraphSlice, graphSourcePath)
  for (const [field, value] of [
    ['sourceTraversalPlan', sourceTraversalPlan],
    ['sourceGraphAwareValidation', sourceGraphAwareValidation],
    ['graphSourcePath', graphSourcePath],
    ['generatedReadModelPath', generatedReadModelPath],
  ] as const) {
    if (!value) {
      findings.push({
        code: 'CONTRACT_INPUT_SOURCE_AUTHORITY_FIELD_MISSING',
        severity: 'error',
        field,
        message: `Contract input generation requires selected slice source authority field ${field}.`,
      })
    }
  }

  const blocked = findings.some((finding) => finding.severity === 'error')
  const targetNode = selectedNodes.find((node) => node.nodeId === 'CH-001') ?? selectedNodes[0]
  const changeId = `change-${slug(stringValue(targetNode?.nodeId) || 'selected-slice')}-contract-input-preview`
  const requestText =
    stringValue(requestIrCandidate?.intentSummaryCandidate) ||
    stringValue(requestIrCandidate?.requestText) ||
    stringValue(targetNode?.title) ||
    'Selected graph slice contract input preview.'
  const requestType = stringValue(asRecord(graphAwareValidation?.changeTypeCompatibility)?.requestTypeCandidate)
  const changeType =
    stringValue(asRecord(graphAwareValidation?.changeTypeCompatibility)?.changeTypeCandidate) ||
    'selected-slice-preview'
  const mappingTrace: JsonRecord[] = []

  const targetScopeCandidates = buildTargetScopeCandidates({
    includedScopeNodes,
    includedEvidenceNodes,
    selectedNodes,
    fixtureRoot,
    mappingTrace,
  })
  const allowedScope = buildAllowedScope(targetScopeCandidates, mappingTrace)
  const forbiddenScope = buildForbiddenScope(
    graphAwareValidation,
    requestIrCandidate,
    graphSourcePath,
    findings,
    mappingTrace,
  )
  const evidenceIndex = buildEvidenceIndex(includedEvidenceNodes, fixtureRoot, mappingTrace)
  const requiredEvidence = arrayRecords(evidenceIndex.entries).map((entry) => ({
    id: `required-${stringValue(entry.id)}`,
    sourceEvidenceId: entry.id,
    evidenceType: entry.evidenceType,
    artifact: entry.artifact,
    sourceStatus: 'derived-from-selected-graph-slice',
    runtimeEvidenceSatisfied: false,
    acceptedEvidence: false,
  }))
  const policySnapshot = buildPolicySnapshot(forbiddenScope)
  const outputRequirementSources = buildOutputRequirementSources(evidenceIndex, mappingTrace)
  const outputRequirements = outputRequirementSources.map((entry) => ({
    id: stringValue(entry.derivedOutputRequirementId),
    sourceId: entry.sourceId,
    obligationType: entry.obligationType,
    requiredReportTarget: entry.requiredReportTarget,
    sourceStatus: 'derived-from-selected-slice-contract-input-mapping',
  }))
  const stopConditionSources = buildStopConditionSources()
  const stopConditions = stopConditionSources.map((entry) => ({
    id: stringValue(entry.derivedStopConditionId),
    sourceId: entry.sourceId,
    triggerType: entry.triggerType,
    condition: entry.condition,
    action: entry.action,
  }))
  const riskSources = buildRiskSources(includedRiskNodes, targetScopeCandidates, evidenceIndex, mappingTrace)
  const knownRisks = riskSources.map((entry) => ({
    id: stringValue(entry.derivedRiskId),
    sourceId: entry.sourceId,
    riskType: entry.riskType,
    severity: entry.severity,
    status: entry.status,
    mitigation: entry.mitigation,
    sourceStatus: 'derived-from-selected-graph-slice-risk-node',
  }))
  const graphSnapshot = buildGraphSnapshot({
    sourceSelectedGraphSlice,
    sourceTraversalPlan,
    sourceGraphAwareValidation,
    sourceRequestIrCandidate,
    graphSourcePath,
    generatedReadModelPath,
    selectedNodes,
  })
  const humanRequest = {
    id: 'request-todo-app-runtime-evidence-only-contract-input-preview',
    source: sourceRequestIrCandidate
      ? 'request-ir-candidate-linked-from-graph-aware-validation'
      : 'selected-graph-slice',
    text: requestText,
    requestType,
    authorityStatus: 'trace-context-not-approval',
  }
  const packSchema = {
    id: 'pack-schema-test-only-behavior-proof-selected-slice-preview',
    changeType,
    changeTypeSupportStatus: 'frontend-contract-input-preview-only',
    requiredInputGroups: REQUIRED_INPUT_GROUPS,
    boundary:
      'This selected-slice frontend input may feed a future contract mapper, but it does not generate instruction packs.',
  }
  const missingRequiredInputGroups = REQUIRED_INPUT_GROUPS.filter((group) => {
    const value = {
      humanRequest,
      graphSnapshot,
      packSchema,
      policySnapshot,
      evidenceIndex,
      targetScopeCandidates,
      outputRequirementSources,
      stopConditionSources,
      riskSources,
    }[group] as unknown
    if (Array.isArray(value)) {
      return value.length === 0
    }
    const record = asRecord(value)
    return !record || Object.keys(record).length === 0
  })
  const compatibilityStatus =
    !blocked && missingRequiredInputGroups.length === 0
      ? 'frontend-field-compatible-with-compiler-input-model-groups'
      : 'blocked'

  return {
    schemaVersion: 1,
    artifactRole: 'contract-compiler-input',
    status: blocked ? 'contract-compiler-input-blocked' : 'contract-compiler-input-generated',
    generatorName: GENERATOR_NAME,
    generationScope: 'selected-slice-to-contract-input-no-instruction-pack',
    sourceSelectedGraphSlice,
    sourceTraversalPlan,
    sourceGraphAwareValidation,
    sourceRequestIrCandidate,
    graphSourcePath,
    generatedReadModelPath,
    compatibleInputModelSchema: COMPILER_INPUT_SCHEMA_PATH,
    sourceMode: 'selected-graph-slice-contract-input-preview',
    changeId,
    contractInputGenerated: !blocked,
    instructionPackGenerated: false,
    graphSourceMutated: false,
    graphDeltaApplied: false,
    approvalStatus: 'not-approved',
    humanDecisionRecorded: false,
    equivalenceProven: false,
    runtimeEvidenceSatisfied: false,
    scopeEnforced: false,
    ciEnforcementEnabled: false,
    humanRequest,
    graphSnapshot,
    packSchema,
    policySnapshot,
    evidenceIndex,
    targetScopeCandidates,
    allowedScope,
    forbiddenScope,
    requiredEvidence,
    outputRequirementSources,
    outputRequirements,
    stopConditionSources,
    stopConditions,
    riskSources,
    knownRisks,
    compilerInputModelCompatibility: {
      requiredInputGroups: REQUIRED_INPUT_GROUPS,
      requiredInputGroupsPresent: REQUIRED_INPUT_GROUPS.filter((group) => !missingRequiredInputGroups.includes(group)),
      missingRequiredInputGroups,
      compatibilityStatus,
      backendDryRunValidationStatus: 'not-run-not-same-artifact-role',
      backendDryRunInvoked: false,
      backendInstructionPackGenerated: false,
    },
    mappingTrace,
    validationFindings: findings,
    contractCompilerReadinessStatus: blocked ? 'blocked' : 'ready',
    requiresClarification: blocked,
    humanReviewRequired: true,
    outputWritePolicy: 'explicit-output-only',
    writtenOutputPath: null,
    writtenOutputPathAuthorityStatus: 'not-written-stdout-only',
    nonExecutionStatement:
      'This frontend Contract Compiler Input does not compile contracts, invoke backend dry-run validation, generate instruction packs, or execute Codex.',
    nonExecutionBoundary:
      'This selected-slice contract input generator creates deterministic Contract Compiler Input only. It does not generate instruction packs, does not invoke Codex execution, does not call an LLM, does not mutate graph-source, does not apply graph deltas, does not approve work, does not record human decisions, does not satisfy runtime Evidence, does not prove equivalence, does not enforce scope, and does not configure CI required checks.',
  }
}

export async function generateContractCompilerInputFile(
  root: string,
  selectedSlicePath: string,
  options: { output?: string } = {},
): Promise<ContractCompilerInputFileResult> {
  const resolvedSelectedSlicePath = resolveRepoPath(root, selectedSlicePath)
  const selectedSlice = await readJsonSafe<Record<string, unknown>>(resolvedSelectedSlicePath)
  if (!selectedSlice.ok) {
    throw new Error(`Unable to read Selected Graph Slice from ${selectedSlicePath}: ${selectedSlice.error}`)
  }

  const graphAwareValidationPath = stringValue(selectedSlice.value.sourceGraphAwareValidation)
  const graphAwareValidation = graphAwareValidationPath
    ? await readOptionalJson(resolveRepoPath(root, graphAwareValidationPath))
    : undefined
  const requestIrCandidatePath = stringValue(asRecord(graphAwareValidation)?.candidatePath)
  const requestIrCandidate = requestIrCandidatePath
    ? await readOptionalJson(resolveRepoPath(root, requestIrCandidatePath))
    : undefined

  const result = generateContractCompilerInput(selectedSlice.value, {
    graphAwareValidation,
    requestIrCandidate,
    selectedSlicePath: relativePath(root, resolvedSelectedSlicePath),
  })

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

function validateSelectedSlicePrerequisites(slice: JsonRecord | null, findings: ContractInputGeneratorFinding[]): void {
  if (!slice) {
    findings.push({
      code: 'CONTRACT_INPUT_SELECTED_SLICE_NOT_OBJECT',
      severity: 'error',
      field: 'selectedSlice',
      message: 'Contract input generation requires a Selected Graph Slice JSON object.',
    })
    return
  }

  const expectedFields: Array<[string, unknown]> = [
    ['artifactRole', 'selected-graph-slice'],
    ['selectedGraphSliceGenerated', true],
    ['selectedGraphSliceStatus', 'generated'],
    ['graphTraversalExecuted', true],
    ['contractInputGenerated', false],
    ['instructionPackGenerated', false],
  ]

  for (const [field, expected] of expectedFields) {
    if (slice[field] !== expected) {
      findings.push({
        code: 'CONTRACT_INPUT_SELECTED_SLICE_PREREQUISITE_UNSAFE',
        severity: 'error',
        field,
        message: `Contract input generation prerequisite "${field}" is not satisfied.`,
        expected,
        actual: slice[field],
        suggestedFix: 'Regenerate a selected graph slice before mapping contract compiler input.',
      })
    }
  }
}

function buildTargetScopeCandidates(input: {
  includedScopeNodes: JsonRecord[]
  includedEvidenceNodes: JsonRecord[]
  selectedNodes: JsonRecord[]
  fixtureRoot: string | null
  mappingTrace: JsonRecord[]
}): JsonRecord[] {
  const scopeNodes = [...input.includedScopeNodes, ...input.includedEvidenceNodes]
  const candidates = scopeNodes.map((node) => {
    const nodeId = stringValue(node.nodeId)
    const nodeKind = stringValue(node.nodeKind)
    const scopeKind = scopeKindForNodeKind(nodeKind)
    const paths = pathsForNode(node, input.fixtureRoot)
    const id = `scope-${slug(nodeId)}`
    input.mappingTrace.push({
      targetField: 'targetScopeCandidates',
      sourceNodeId: nodeId,
      sourceNodeKind: nodeKind,
      mappedId: id,
      reason: 'selected node mapped to target scope candidate',
    })
    return {
      id,
      scopeKind,
      paths,
      derivedFrom: [`graph-source:node:${nodeId}`],
      contractDerivedFrom: [`selected-slice:node:${nodeId}`],
      confidence: 'graph-backed-candidate',
      sourceStatus: 'derived-from-selected-graph-slice',
      contextOnly: nodeKind === 'change' || nodeKind === 'task',
    }
  })
  return uniqueById(candidates)
}

function buildAllowedScope(targetScopeCandidates: JsonRecord[], mappingTrace: JsonRecord[]): JsonRecord[] {
  const allowed = targetScopeCandidates
    .filter((entry) => ['test', 'evidence'].includes(stringValue(entry.scopeKind)))
    .map((entry) => {
      const id = `allowed-${stringValue(entry.id)}`
      const paths = stringArray(entry.paths)
      mappingTrace.push({
        targetField: 'allowedScope',
        sourceTargetScopeCandidate: entry.id,
        mappedId: id,
        reason: 'runtime-evidence-only allowed scope narrowed to selected check/evidence/report context',
      })
      return {
        id,
        scopeKind: entry.scopeKind,
        paths,
        sourceTargetScopeCandidate: entry.id,
        sourceStatus: 'derived-from-selected-graph-slice-check-or-evidence-context',
        allowedUse: ['review-selected-check-or-evidence', 'report-selected-evidence-status'],
        modificationAuthority: paths.some((entryPath) => entryPath.includes('/.pbe/evidence/test-results/'))
          ? 'evidence-artifact-or-report-only'
          : 'context-only-no-modification',
      }
    })
  return uniqueById(allowed)
}

function buildEvidenceIndex(
  includedEvidenceNodes: JsonRecord[],
  fixtureRoot: string | null,
  mappingTrace: JsonRecord[],
): JsonRecord {
  const entries = includedEvidenceNodes.map((node) => {
    const nodeId = stringValue(node.nodeId)
    const nodeKind = stringValue(node.nodeKind)
    const artifact = evidenceArtifactForNode(node, fixtureRoot)
    const id = `evidence-${slug(nodeId)}`
    mappingTrace.push({
      targetField: 'evidenceIndex.entries',
      sourceNodeId: nodeId,
      sourceNodeKind: nodeKind,
      mappedId: id,
      reason: 'selected evidence/check node mapped to evidence index entry',
    })
    return {
      id,
      artifact,
      evidenceType: nodeKind === 'check' ? 'selected_check_context' : 'selected_evidence_artifact',
      freshness: 'required-after-graph-or-artifact-change',
      sourceNodeId: nodeId,
      runtimeEvidenceSatisfied: false,
      acceptedEvidence: false,
    }
  })
  return {
    id: 'evidence-index-selected-graph-slice-runtime-evidence-only',
    entries,
  }
}

function buildPolicySnapshot(forbiddenScope: JsonRecord[]): JsonRecord {
  return {
    id: 'policy-snapshot-selected-graph-slice-runtime-evidence-only',
    policies: [
      {
        id: 'selected-graph-slice-non-execution-boundary',
        authority: 'validator',
        status: 'non-enforcing',
      },
      {
        id: 'runtime-evidence-only-no-production-source',
        authority: 'policy',
        status: 'policy-active',
      },
      {
        id: 'human-review-required-before-approval',
        authority: 'policy',
        status: 'policy-active',
      },
    ],
    evidenceCheckMappings: [
      {
        evidenceType: 'selected_check_context',
        requiredCheckId: 'check-todo-app-selected-check-review',
        compiledEvidenceType: 'validator_output',
      },
      {
        evidenceType: 'selected_evidence_artifact',
        requiredCheckId: 'check-todo-app-selected-evidence-review',
        compiledEvidenceType: 'validator_output',
      },
    ],
    forbiddenScopeRules: forbiddenScope.map((entry) => ({
      id: entry.id,
      scopeKind: entry.scopeKind,
      paths: entry.paths,
      derivedFrom: entry.derivedFrom,
      sourceStatus: entry.sourceStatus,
    })),
  }
}

function buildForbiddenScope(
  graphAwareValidation: JsonRecord | null,
  requestIrCandidate: JsonRecord | null,
  graphSourcePath: string,
  findings: ContractInputGeneratorFinding[],
  mappingTrace: JsonRecord[],
): JsonRecord[] {
  const intentCandidates = stringArray(
    asRecord(graphAwareValidation?.scopeIntentResolution)?.forbiddenScopeIntentCandidate,
  )
  const fallbackCandidates = stringArray(requestIrCandidate?.forbiddenScopeIntentCandidate)
  const intents = intentCandidates.length > 0 ? intentCandidates : fallbackCandidates
  const defaults = intents.length > 0 ? intents : ['production source changes', 'graph-source mutation']
  const entries = defaults.map((intent) => {
    const normalized = intent.toLowerCase()
    const id = `forbidden-${slug(intent)}`
    const productionSourceUnresolved = normalized.includes('production')
    const paths = productionSourceUnresolved
      ? ['unresolved:production-source-changes']
      : normalized.includes('graph')
        ? [graphSourcePath || 'unresolved:graph-source-mutation']
        : ['examples/valid/todo-app-pbe-run/.pbe/control/acceptance-tree.json']
    const scopeKind = normalized.includes('production') ? 'code' : normalized.includes('graph') ? 'graph' : 'product'
    if (productionSourceUnresolved) {
      findings.push({
        code: 'CONTRACT_INPUT_FORBIDDEN_SCOPE_PATH_UNRESOLVED',
        severity: 'warning',
        field: 'forbiddenScope.production-source-changes.paths',
        message:
          'Production source changes are forbidden by request intent, but no production source file path was derived from the selected graph slice.',
        actual: paths,
        suggestedFix:
          'Keep the unresolved marker until graph/source authority provides a concrete production source path.',
      })
    }
    mappingTrace.push({
      targetField: 'forbiddenScope',
      sourceIntent: intent,
      mappedId: id,
      reason: 'forbidden scope intent preserved from Request IR/graph-aware validation context',
    })
    return {
      id,
      scopeKind,
      paths,
      derivedFrom: ['request-ir-graph-aware-validation:scopeIntentResolution'],
      sourceStatus: productionSourceUnresolved
        ? 'unresolved-from-request-intent-not-derived-from-selected-slice'
        : 'derived-from-graph-aware-validation-context',
      boundary: 'forbidden scope is advisory contract-input context and not enforcement',
    }
  })
  return uniqueById(entries)
}

function buildOutputRequirementSources(evidenceIndex: JsonRecord, mappingTrace: JsonRecord[]): JsonRecord[] {
  const entries = arrayRecords(evidenceIndex.entries)
  const sources: JsonRecord[] = entries.map((entry) => {
    const id = `output-${slug(stringValue(entry.id))}`
    mappingTrace.push({
      targetField: 'outputRequirementSources',
      sourceEvidenceId: entry.id,
      mappedId: id,
      reason: 'evidence index entry mapped to output reporting obligation',
    })
    return {
      sourceId: id,
      sourceType: 'evidence',
      derivedOutputRequirementId: `${id}-status`,
      obligationType: 'command-output-evidence-status',
      requiredReportTarget: `Report selected evidence/check status for ${stringValue(entry.sourceNodeId)}.`,
      evidenceBinding: {
        evidenceId: entry.id,
      },
    }
  })
  sources.push({
    sourceId: 'output-selected-slice-non-execution-boundary',
    sourceType: 'boundary',
    derivedOutputRequirementId: 'output-report-selected-slice-non-execution-boundary',
    obligationType: 'non-execution-boundary-statement',
    requiredReportTarget:
      'Report that selected-slice contract input is not instruction pack generation, approval, runtime Evidence satisfaction, or enforcement.',
  })
  return sources
}

function buildStopConditionSources(): JsonRecord[] {
  return [
    {
      sourceId: 'stop-selected-slice-scope-expands',
      sourceType: 'policy',
      derivedStopConditionId: 'stop-if-selected-slice-scope-expands',
      triggerType: 'scope-expansion',
      condition: 'Contract input mapping requires nodes, edges, files, or product meaning outside the selected slice.',
      action: 'stop-and-request-human-decision',
      policyBinding: {
        policyId: 'selected-graph-slice-non-execution-boundary',
      },
      relatedFields: ['targetScopeCandidates', 'allowedScope', 'forbiddenScope'],
    },
    {
      sourceId: 'stop-selected-slice-evidence-unavailable',
      sourceType: 'validator',
      derivedStopConditionId: 'stop-if-selected-evidence-unavailable',
      triggerType: 'required-check-unavailable',
      condition: 'Selected evidence/check nodes cannot be reviewed or linked to command output.',
      action: 'stop-and-record-missing-evidence',
      commandBinding: {
        requiredCheckIds: ['check-todo-app-selected-check-review', 'check-todo-app-selected-evidence-review'],
      },
      relatedFields: ['requiredEvidence', 'outputRequirements'],
    },
    {
      sourceId: 'stop-selected-slice-source-authority-loss',
      sourceType: 'boundary',
      derivedStopConditionId: 'stop-if-selected-slice-source-authority-loss',
      triggerType: 'source-authority-loss',
      condition: 'Selected graph slice source authority cannot be traced back to graph-source/read-model nodes.',
      action: 'stop-and-request-human-decision',
      relatedFields: ['graphSnapshot', 'mappingTrace'],
    },
  ]
}

function buildRiskSources(
  includedRiskNodes: JsonRecord[],
  targetScopeCandidates: JsonRecord[],
  evidenceIndex: JsonRecord,
  mappingTrace: JsonRecord[],
): JsonRecord[] {
  const evidenceIds = arrayRecords(evidenceIndex.entries).map((entry) => stringValue(entry.id))
  const scopeIds = targetScopeCandidates.map((entry) => stringValue(entry.id))
  return includedRiskNodes.map((node) => {
    const nodeId = stringValue(node.nodeId)
    const id = `risk-${slug(nodeId)}`
    mappingTrace.push({
      targetField: 'riskSources',
      sourceNodeId: nodeId,
      mappedId: id,
      reason: 'selected finding node mapped to known risk source',
    })
    return {
      sourceId: id,
      sourceType: 'scope',
      derivedRiskId: `${id}-scope-drift`,
      riskType: 'scope-drift',
      severity: 'warning',
      status: 'tracked',
      mitigation: stringValue(node.title) || 'Review selected slice finding before contract generation.',
      scopeBinding: {
        targetScopeCandidateIds: scopeIds,
      },
      evidenceBinding: {
        evidenceIds,
      },
      selectedRiskNodeId: nodeId,
    }
  })
}

function buildGraphSnapshot(input: {
  sourceSelectedGraphSlice: string
  sourceTraversalPlan: string
  sourceGraphAwareValidation: string
  sourceRequestIrCandidate: string | null
  graphSourcePath: string
  generatedReadModelPath: string
  selectedNodes: JsonRecord[]
}): JsonRecord {
  const sourceArtifacts = uniqueStrings(
    input.selectedNodes.map((node) => stringValue(node.sourceArtifact)).filter((entry) => entry.length > 0),
  )
  return {
    id: 'graph-snapshot-selected-graph-slice-runtime-evidence-only',
    artifacts: [
      {
        id: 'selected-graph-slice',
        path: input.sourceSelectedGraphSlice,
        role: 'selected graph slice input',
      },
      {
        id: 'graph-traversal-plan',
        path: input.sourceTraversalPlan,
        role: 'traversal plan source',
      },
      {
        id: 'request-ir-graph-aware-validation',
        path: input.sourceGraphAwareValidation,
        role: 'graph-aware validation context',
      },
      ...(input.sourceRequestIrCandidate
        ? [
            {
              id: 'request-ir-candidate',
              path: input.sourceRequestIrCandidate,
              role: 'human request candidate context',
            },
          ]
        : []),
      {
        id: 'todo-app-graph-source',
        path: input.graphSourcePath,
        role: 'graph source authority',
      },
      {
        id: 'todo-app-generated-read-model',
        path: input.generatedReadModelPath,
        role: 'generated read-model authority',
      },
      ...sourceArtifacts.map((artifactPath, index) => ({
        id: `selected-node-source-artifact-${index + 1}`,
        path: artifactPath,
        role: 'selected node source artifact',
      })),
    ],
  }
}

function pathsForNode(node: JsonRecord, fixtureRoot: string | null): string[] {
  const sourceArtifact = stringValue(node.sourceArtifact)
  const title = stringValue(node.title)
  return uniqueStrings(
    [sourceArtifact, normalizePathCandidate(title, fixtureRoot)].filter(
      (entry) => entry.includes('/') || entry.includes('\\'),
    ),
  )
}

function evidenceArtifactForNode(node: JsonRecord, fixtureRoot: string | null): string {
  const title = stringValue(node.title)
  const normalizedTitle = normalizePathCandidate(title, fixtureRoot)
  if (isResolvablePath(normalizedTitle)) {
    return normalizedTitle
  }
  return stringValue(node.sourceArtifact)
}

function scopeKindForNodeKind(nodeKind: string): string {
  if (nodeKind === 'check') return 'test'
  if (nodeKind === 'evidence') return 'evidence'
  if (nodeKind === 'task') return 'workflow'
  if (nodeKind === 'code') return 'code'
  if (nodeKind === 'requirement' || nodeKind === 'change') return 'product'
  return 'graph'
}

async function readOptionalJson(filePath: string): Promise<unknown> {
  const parsed = await readJsonSafe(filePath)
  return parsed.ok ? parsed.value : undefined
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

function inferFixtureRoot(sourceSelectedGraphSlice: string, graphSourcePath: string): string | null {
  const normalizedGraphSource = normalizeSlashes(graphSourcePath)
  if (normalizedGraphSource.endsWith('/graph-source.json')) {
    return normalizedGraphSource.slice(0, -'/graph-source.json'.length)
  }
  const normalizedSlice = normalizeSlashes(sourceSelectedGraphSlice)
  const generatedIndex = normalizedSlice.lastIndexOf('/generated/')
  if (generatedIndex > 0) {
    return normalizedSlice.slice(0, generatedIndex)
  }
  return null
}

function normalizePathCandidate(candidate: string, fixtureRoot: string | null): string {
  const normalized = normalizeSlashes(candidate)
  if (!normalized) {
    return ''
  }
  if (normalized.startsWith('.pbe/')) {
    return fixtureRoot ? `${fixtureRoot}/${normalized}` : ''
  }
  return normalized
}

function isResolvablePath(candidate: string): boolean {
  return candidate.includes('/') || candidate.includes('\\')
}

function normalizeSlashes(value: string): string {
  return value.replaceAll('\\', '/')
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values.filter((entry) => entry.length > 0))]
}

function uniqueById(entries: JsonRecord[]): JsonRecord[] {
  const seen = new Set<string>()
  const unique: JsonRecord[] = []
  for (const entry of entries) {
    const id = stringValue(entry.id)
    if (!id || seen.has(id)) {
      continue
    }
    seen.add(id)
    unique.push(entry)
  }
  return unique
}

function slug(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function resolveRepoPath(root: string, inputPath: string): string {
  return path.isAbsolute(inputPath) ? inputPath : path.resolve(root, inputPath)
}
