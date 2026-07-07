import path from 'node:path'
import { readJsonSafe, relativePath, writeJsonAtomic } from './fs.js'
import type { IssueSeverity } from './types.js'

const PLANNER_NAME = 'GraphTraversalPlanGenerator'

type JsonRecord = Record<string, unknown>

export interface GraphTraversalPlanFinding {
  code: string
  severity: IssueSeverity
  field?: string
  message: string
  expected?: unknown
  actual?: unknown
  suggestedFix?: string
}

export interface GraphTraversalPlanAuthorityInputs {
  graphSource?: unknown
  generatedReadModel?: unknown
  graphSourcePath?: string
  generatedReadModelPath?: string
}

export interface GraphTraversalPlanResult {
  schemaVersion: 1
  artifactRole: 'graph-traversal-plan'
  status: 'graph-traversal-plan-generated' | 'graph-traversal-plan-blocked'
  plannerName: typeof PLANNER_NAME
  planningScope: 'deterministic-plan-no-selected-slice'
  sourceGraphAwareValidation: string
  graphSourcePath: string
  generatedReadModelPath: string
  traversalPlanId: string
  graphTraversalPlanGenerated: boolean
  graphTraversalPlanStatus: 'ready' | 'blocked'
  graphTraversalExecuted: false
  selectedGraphSliceGenerated: false
  contractInputGenerated: false
  instructionPackGenerated: false
  graphSourceMutated: false
  graphDeltaApplied: false
  approvalStatus: 'not-approved'
  equivalenceProven: false
  runtimeEvidenceSatisfied: false
  scopeEnforced: false
  ciEnforcementEnabled: false
  prerequisiteStatus: 'passed' | 'blocked'
  startNodeResolutionStatus: 'resolved' | 'unresolved' | 'ambiguous' | 'blocked'
  startNodeCandidates: Array<{
    nodeId: string
    nodeKind: string
    resolutionStatus: 'resolved' | 'candidate'
    sourceAuthorityStatus: string
    graphSourcePresent: boolean
    readModelPresent: boolean
  }>
  nodeKindVocabulary: string[]
  edgeTypeVocabulary: string[]
  requiredNodeTypes: string[]
  optionalNodeTypes: string[]
  excludedNodeTypes: string[]
  requiredEdgeTypes: string[]
  optionalEdgeTypes: string[]
  excludedEdgeTypes: string[]
  requiredNodeRoles: string[]
  requiredEdgeRoles: string[]
  selectionIntents: string[]
  contractInputSourceRoles: string[]
  selectionTracePolicy: {
    selectionTraceRequired: boolean
    traceMustInclude: string[]
    traceMayNotClaimApproval: boolean
  }
  ambiguityPolicy: {
    multipleStartNodesHandling: string
    missingStartNodeHandling: string
    missingGraphAuthorityHandling: string
    contractInputGeneratedWhenAmbiguous: false
  }
  selectedGraphSlicePlanningAllowed: boolean
  contractInputGenerationAllowed: false
  requiresClarification: boolean
  humanReviewRequired: boolean
  selectionTrace: unknown[]
  validationFindings: GraphTraversalPlanFinding[]
  outputWritePolicy: 'explicit-output-only'
  writtenOutputPath: string | null
  writtenOutputPathAuthorityStatus: 'not-written-stdout-only' | 'explicit-preview-output-not-graph-source'
  nonExecutionBoundary: string
}

export interface GraphTraversalPlanFileResult {
  result: GraphTraversalPlanResult
  outputPath?: string
}

export function generateGraphTraversalPlan(
  graphValidation: unknown,
  authorityInputs: GraphTraversalPlanAuthorityInputs,
  paths: {
    graphValidationPath?: string
  } = {},
): GraphTraversalPlanResult {
  const findings: GraphTraversalPlanFinding[] = []
  const validation = asRecord(graphValidation)
  const graphSource = asRecord(authorityInputs.graphSource)
  const readModel = asRecord(authorityInputs.generatedReadModel)

  const graphSourcePath =
    authorityInputs.graphSourcePath ||
    stringValue(asRecord(validation?.graphAuthorityInputs)?.graphSourcePath) ||
    'examples/valid/todo-app-devview-run/graph-source.json'
  const generatedReadModelPath =
    authorityInputs.generatedReadModelPath ||
    stringValue(asRecord(validation?.graphAuthorityInputs)?.generatedReadModelPath) ||
    'examples/valid/todo-app-devview-run/generated/generated-read-model.json'

  validateGraphAwarePrerequisites(validation, findings)

  if (!graphSource) {
    findings.push({
      code: 'GRAPH_TRAVERSAL_PLAN_GRAPH_SOURCE_MISSING',
      severity: 'error',
      field: 'graphAuthorityInputs.graphSourcePath',
      message: `Graph traversal planning requires a readable graph source at ${graphSourcePath}.`,
      suggestedFix: 'Regenerate or provide the graph source referenced by graph-aware Request IR validation.',
    })
  }

  if (!readModel) {
    findings.push({
      code: 'GRAPH_TRAVERSAL_PLAN_READ_MODEL_MISSING',
      severity: 'error',
      field: 'graphAuthorityInputs.generatedReadModelPath',
      message: `Graph traversal planning requires a readable generated read model at ${generatedReadModelPath}.`,
      suggestedFix: 'Regenerate or provide the read model referenced by graph-aware Request IR validation.',
    })
  }

  const graphNodes = arrayRecords(asRecord(graphSource?.sourceRecords)?.nodes)
  const readModelNodes = arrayRecords(readModel?.nodes)
  const readModelEdges = arrayRecords(readModel?.edges)
  const targetRecordId = stringValue(asRecord(validation?.targetRecordResolution)?.resolvedRecordId)
  const graphMatches = graphNodes.filter((node) => node.id === targetRecordId)
  const readModelMatches = readModelNodes.filter((node) => node.id === targetRecordId)
  const allMatches = [...graphMatches, ...readModelMatches]
  const uniqueMatchKeys = new Set(allMatches.map((node) => `${stringValue(node.id)}:${stringValue(node.nodeKind)}`))

  let startNodeResolutionStatus: GraphTraversalPlanResult['startNodeResolutionStatus'] = 'blocked'
  if (validation && graphSource && readModel) {
    if (!targetRecordId) {
      startNodeResolutionStatus = 'unresolved'
      findings.push({
        code: 'GRAPH_TRAVERSAL_PLAN_START_NODE_ID_MISSING',
        severity: 'error',
        field: 'targetRecordResolution.resolvedRecordId',
        message: 'Graph traversal planning requires a resolved target record id from graph-aware validation.',
      })
    } else if (allMatches.length === 0) {
      startNodeResolutionStatus = 'unresolved'
      findings.push({
        code: 'GRAPH_TRAVERSAL_PLAN_START_NODE_NOT_FOUND',
        severity: 'error',
        field: 'targetRecordResolution.resolvedRecordId',
        message: `Resolved start node "${targetRecordId}" was not found in graph source or generated read model.`,
      })
    } else if (graphMatches.length > 1 || readModelMatches.length > 1 || uniqueMatchKeys.size > 1) {
      startNodeResolutionStatus = 'ambiguous'
      findings.push({
        code: 'GRAPH_TRAVERSAL_PLAN_START_NODE_AMBIGUOUS',
        severity: 'error',
        field: 'targetRecordResolution.resolvedRecordId',
        message: `Resolved start node "${targetRecordId}" matched multiple node identities.`,
        actual: [...uniqueMatchKeys],
      })
    } else {
      startNodeResolutionStatus = 'resolved'
    }
  }

  const taxonomy = asRecord(readModel?.taxonomy)
  const nodeKindVocabulary = uniqueStrings(taxonomy?.nodeKindsUsed, [
    ...graphNodes.map((node) => stringValue(node.nodeKind)),
    ...readModelNodes.map((node) => stringValue(node.nodeKind)),
  ])
  const edgeTypeVocabulary = uniqueStrings(
    taxonomy?.edgeTypesUsed,
    readModelEdges.map((edge) => stringValue(edge.edgeType)),
  )

  const requiredNodeTypes = subset(nodeKindVocabulary, ['change', 'requirement', 'code', 'task', 'check', 'evidence'])
  const optionalNodeTypes = subset(nodeKindVocabulary, ['finding', 'decision', 'document', 'log', 'view-instance'])
  const excludedNodeTypes: string[] = []
  const requiredEdgeTypes = subset(edgeTypeVocabulary, ['targets', 'requires', 'verifies', 'evidences'])
  const optionalEdgeTypes = subset(edgeTypeVocabulary, [
    'touches',
    'satisfies',
    'preserves',
    'reports-on',
    'derives-view',
  ])
  const excludedEdgeTypes = subset(edgeTypeVocabulary, ['approves'])

  const missingVocabulary = [
    requiredNodeTypes.length === 0 ? 'requiredNodeTypes' : null,
    requiredEdgeTypes.length === 0 ? 'requiredEdgeTypes' : null,
  ].filter((entry): entry is string => Boolean(entry))
  for (const field of missingVocabulary) {
    findings.push({
      code: 'GRAPH_TRAVERSAL_PLAN_TAXONOMY_INCOMPLETE',
      severity: 'error',
      field,
      message: `Graph traversal planning could not derive ${field} from the generated read-model taxonomy.`,
      suggestedFix: 'Regenerate the read model projection before planning traversal.',
    })
  }

  const blocked = findings.some((finding) => finding.severity === 'error')
  const startNode = graphMatches[0] ?? readModelMatches[0]
  const startNodeCandidates =
    startNode && startNodeResolutionStatus === 'resolved'
      ? [
          {
            nodeId: stringValue(startNode.id),
            nodeKind: stringValue(startNode.nodeKind),
            resolutionStatus: 'resolved' as const,
            sourceAuthorityStatus: 'resolved-from-graph-aware-validation-and-graph-source',
            graphSourcePresent: graphMatches.length === 1,
            readModelPresent: readModelMatches.length === 1,
          },
        ]
      : []

  return {
    schemaVersion: 1,
    artifactRole: 'graph-traversal-plan',
    status: blocked ? 'graph-traversal-plan-blocked' : 'graph-traversal-plan-generated',
    plannerName: PLANNER_NAME,
    planningScope: 'deterministic-plan-no-selected-slice',
    sourceGraphAwareValidation: paths.graphValidationPath ?? '<in-memory>',
    graphSourcePath,
    generatedReadModelPath,
    traversalPlanId: 'graph-traversal-plan-add-todo-runtime-evidence-only',
    graphTraversalPlanGenerated: !blocked,
    graphTraversalPlanStatus: blocked ? 'blocked' : 'ready',
    graphTraversalExecuted: false,
    selectedGraphSliceGenerated: false,
    contractInputGenerated: false,
    instructionPackGenerated: false,
    graphSourceMutated: false,
    graphDeltaApplied: false,
    approvalStatus: 'not-approved',
    equivalenceProven: false,
    runtimeEvidenceSatisfied: false,
    scopeEnforced: false,
    ciEnforcementEnabled: false,
    prerequisiteStatus: blocked ? 'blocked' : 'passed',
    startNodeResolutionStatus,
    startNodeCandidates,
    nodeKindVocabulary,
    edgeTypeVocabulary,
    requiredNodeTypes,
    optionalNodeTypes,
    excludedNodeTypes,
    requiredEdgeTypes,
    optionalEdgeTypes,
    excludedEdgeTypes,
    requiredNodeRoles: [
      'target change/request node',
      'target component or implementation context node',
      'source or scope policy source node',
      'required evidence policy/check node',
      'output requirement source node',
    ],
    requiredEdgeRoles: [
      'target record to component relationship',
      'target record to scope policy relationship',
      'target record to evidence/check relationship',
      'evidence/report relationship',
    ],
    selectionIntents: [
      'confirm the future traversal start node',
      'include only graph-source/read-model vocabulary-backed node kinds and edge types',
      'collect planner semantics in role fields instead of overloading graph vocabulary fields',
      'preserve selection trace for every future selected or excluded node and edge',
    ],
    contractInputSourceRoles: [
      'target scope candidates',
      'allowed scope source',
      'forbidden scope source',
      'required evidence source',
      'stop condition source',
      'known risk source',
      'output requirement source',
    ],
    selectionTracePolicy: {
      selectionTraceRequired: true,
      traceMustInclude: [
        'start node reason',
        'selected node reason',
        'selected edge reason',
        'excluded node reason',
        'ambiguity handling',
        'contract input readiness blocker when present',
      ],
      traceMayNotClaimApproval: true,
    },
    ambiguityPolicy: {
      multipleStartNodesHandling: 'blocked-human-review-required',
      missingStartNodeHandling: 'blocked-clarification-required',
      missingGraphAuthorityHandling: 'blocked-human-review-required',
      contractInputGeneratedWhenAmbiguous: false,
    },
    selectedGraphSlicePlanningAllowed: !blocked,
    contractInputGenerationAllowed: false,
    requiresClarification: startNodeResolutionStatus === 'unresolved',
    humanReviewRequired: true,
    selectionTrace: [],
    validationFindings: findings,
    outputWritePolicy: 'explicit-output-only',
    writtenOutputPath: null,
    writtenOutputPathAuthorityStatus: 'not-written-stdout-only',
    nonExecutionBoundary:
      'This graph traversal plan generator produces a deterministic plan only. It does not execute graph traversal, does not generate a selected graph slice, does not claim selected nodes or edges as final scope, does not generate contract compiler input, does not generate instruction packs, does not call an LLM, does not mutate graph-source, does not apply graph deltas, does not approve work, does not record human decisions, does not satisfy runtime Evidence, does not prove equivalence, does not enforce scope, and does not configure CI required checks.',
  }
}

export async function generateGraphTraversalPlanFile(
  root: string,
  graphValidationPath: string,
  options: { output?: string } = {},
): Promise<GraphTraversalPlanFileResult> {
  const resolvedGraphValidationPath = resolveRepoPath(root, graphValidationPath)
  const graphValidation = await readJsonSafe<Record<string, unknown>>(resolvedGraphValidationPath)
  if (!graphValidation.ok) {
    throw new Error(
      `Unable to read graph-aware Request IR validation from ${graphValidationPath}: ${graphValidation.error}`,
    )
  }

  const graphAuthorityInputs = asRecord(graphValidation.value.graphAuthorityInputs)
  const graphSourcePath = stringValue(graphAuthorityInputs?.graphSourcePath)
  const generatedReadModelPath = stringValue(graphAuthorityInputs?.generatedReadModelPath)
  const graphSource = graphSourcePath ? await readOptionalJson(resolveRepoPath(root, graphSourcePath)) : undefined
  const generatedReadModel = generatedReadModelPath
    ? await readOptionalJson(resolveRepoPath(root, generatedReadModelPath))
    : undefined

  const result = generateGraphTraversalPlan(
    graphValidation.value,
    {
      graphSource,
      generatedReadModel,
      graphSourcePath,
      generatedReadModelPath,
    },
    {
      graphValidationPath: relativePath(root, resolvedGraphValidationPath),
    },
  )

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

function validateGraphAwarePrerequisites(validation: JsonRecord | null, findings: GraphTraversalPlanFinding[]): void {
  if (!validation) {
    findings.push({
      code: 'GRAPH_TRAVERSAL_PLAN_GRAPH_VALIDATION_NOT_OBJECT',
      severity: 'error',
      field: 'graphValidation',
      message: 'Graph traversal planning requires a graph-aware Request IR validation JSON object.',
    })
    return
  }

  const expectedFields: Array<[string, unknown]> = [
    ['artifactRole', 'request-ir-graph-aware-validation'],
    ['graphValidationStatus', 'graph-aware-valid'],
    ['graphTraversalAllowed', true],
    ['targetRecordValidationStatus', 'resolved'],
    ['targetComponentValidationStatus', 'resolved'],
    ['changeTypeCompatibilityStatus', 'compatible'],
    ['requiredEvidenceAvailabilityStatus', 'resolved'],
  ]

  for (const [field, expected] of expectedFields) {
    if (validation[field] !== expected) {
      findings.push({
        code: 'GRAPH_TRAVERSAL_PLAN_PREREQUISITE_UNSAFE',
        severity: 'error',
        field,
        message: `Graph traversal planning prerequisite "${field}" is not satisfied.`,
        expected,
        actual: validation[field],
        suggestedFix: 'Regenerate graph-aware Request IR validation and only plan traversal after it allows traversal.',
      })
    }
  }

  const targetRecordResolution = asRecord(validation.targetRecordResolution)
  if (!stringValue(targetRecordResolution?.resolvedRecordId)) {
    findings.push({
      code: 'GRAPH_TRAVERSAL_PLAN_TARGET_RECORD_ID_MISSING',
      severity: 'error',
      field: 'targetRecordResolution.resolvedRecordId',
      message: 'Graph traversal planning requires targetRecordResolution.resolvedRecordId.',
    })
  }
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

function stringValue(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

function uniqueStrings(primary: unknown, fallback: string[]): string[] {
  const values = Array.isArray(primary) ? primary : fallback
  return [...new Set(values.filter((entry): entry is string => typeof entry === 'string' && entry.length > 0))]
}

function subset(vocabulary: string[], desired: string[]): string[] {
  return desired.filter((entry) => vocabulary.includes(entry))
}

function resolveRepoPath(root: string, inputPath: string): string {
  return path.isAbsolute(inputPath) ? inputPath : path.resolve(root, inputPath)
}
