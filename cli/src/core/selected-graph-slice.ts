import path from 'node:path'
import { readJsonSafe, relativePath, writeJsonAtomic } from './fs.js'
import type { IssueSeverity } from './types.js'

const SELECTOR_NAME = 'SelectedGraphSliceGenerator'

type JsonRecord = Record<string, unknown>

export interface SelectedGraphSliceFinding {
  code: string
  severity: IssueSeverity
  field?: string
  message: string
  expected?: unknown
  actual?: unknown
  suggestedFix?: string
}

export interface SelectedGraphSliceAuthorityInputs {
  graphSource?: unknown
  generatedReadModel?: unknown
  graphSourcePath?: string
  generatedReadModelPath?: string
}

export interface SelectedGraphSliceNode {
  nodeId: string
  nodeKind: string
  title?: string
  sourceArtifact?: string
  selectionReason: string
  selectedAs: string[]
  sourceAuthorityStatus: string
}

export interface SelectedGraphSliceEdge {
  edgeId: string
  from: string
  to: string
  edgeType: string
  selectionReason: string
  sourceAuthorityStatus: string
}

export interface ExcludedGraphSliceNode {
  nodeId: string
  nodeKind: string
  exclusionReason: string
}

export interface ExcludedGraphSliceEdge {
  edgeId: string
  from: string
  to: string
  edgeType: string
  exclusionReason: string
}

export interface SelectedGraphSliceTraceEntry {
  action: 'selected-node' | 'selected-edge' | 'excluded-node' | 'excluded-edge' | 'blocked'
  nodeId?: string
  edgeId?: string
  reason: string
  source: string
}

export interface SelectedGraphSliceResult {
  schemaVersion: 1
  artifactRole: 'selected-graph-slice'
  status: 'selected-graph-slice-generated' | 'selected-graph-slice-blocked' | 'selected-graph-slice-incomplete'
  selectorName: typeof SELECTOR_NAME
  selectionScope: 'deterministic-selected-slice-no-contract-input'
  sourceTraversalPlan: string
  sourceGraphAwareValidation: string
  graphSourcePath: string
  generatedReadModelPath: string
  selectedGraphSliceId: string
  selectedGraphSliceStatus: 'generated' | 'blocked' | 'incomplete'
  graphTraversalExecuted: boolean
  selectedGraphSliceGenerated: boolean
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
  selectedNodes: SelectedGraphSliceNode[]
  selectedEdges: SelectedGraphSliceEdge[]
  includedPolicyNodes: SelectedGraphSliceNode[]
  includedScopeNodes: SelectedGraphSliceNode[]
  includedEvidenceNodes: SelectedGraphSliceNode[]
  includedRiskNodes: SelectedGraphSliceNode[]
  excludedNodes: ExcludedGraphSliceNode[]
  excludedEdges: ExcludedGraphSliceEdge[]
  selectionTrace: SelectedGraphSliceTraceEntry[]
  sliceCompletenessStatus: 'complete' | 'incomplete' | 'ambiguous' | 'review-required' | 'blocked'
  contractInputReadinessStatus: 'ready' | 'not-ready' | 'review-required'
  contractInputGenerationAllowed: false
  requiresClarification: boolean
  humanReviewRequired: boolean
  validationFindings: SelectedGraphSliceFinding[]
  outputWritePolicy: 'explicit-output-only'
  writtenOutputPath: string | null
  writtenOutputPathAuthorityStatus: 'not-written-stdout-only' | 'explicit-preview-output-not-graph-source'
  nonExecutionBoundary: string
}

export interface SelectedGraphSliceFileResult {
  result: SelectedGraphSliceResult
  outputPath?: string
}

export function generateSelectedGraphSlice(
  traversalPlan: unknown,
  authorityInputs: SelectedGraphSliceAuthorityInputs,
  paths: {
    traversalPlanPath?: string
  } = {},
): SelectedGraphSliceResult {
  const findings: SelectedGraphSliceFinding[] = []
  const selectionTrace: SelectedGraphSliceTraceEntry[] = []
  const plan = asRecord(traversalPlan)
  const graphSource = asRecord(authorityInputs.graphSource)
  const readModel = asRecord(authorityInputs.generatedReadModel)

  const graphSourcePath =
    authorityInputs.graphSourcePath ||
    stringValue(plan?.graphSourcePath) ||
    'examples/valid/todo-app-pbe-run/graph-source.json'
  const generatedReadModelPath =
    authorityInputs.generatedReadModelPath ||
    stringValue(plan?.generatedReadModelPath) ||
    'examples/valid/todo-app-pbe-run/generated/generated-read-model.json'

  validateTraversalPlanPrerequisites(plan, findings)

  if (!graphSource) {
    findings.push({
      code: 'SELECTED_GRAPH_SLICE_GRAPH_SOURCE_MISSING',
      severity: 'error',
      field: 'graphSourcePath',
      message: `Selected graph slice generation requires a readable graph source at ${graphSourcePath}.`,
      suggestedFix: 'Regenerate or provide the graph source referenced by the traversal plan.',
    })
  }

  if (!readModel) {
    findings.push({
      code: 'SELECTED_GRAPH_SLICE_READ_MODEL_MISSING',
      severity: 'error',
      field: 'generatedReadModelPath',
      message: `Selected graph slice generation requires a readable generated read model at ${generatedReadModelPath}.`,
      suggestedFix: 'Regenerate or provide the generated read model referenced by the traversal plan.',
    })
  }

  const graphNodes = arrayRecords(asRecord(graphSource?.sourceRecords)?.nodes)
  const graphEdges = arrayRecords(asRecord(graphSource?.sourceRecords)?.edges)
  const readModelNodes = arrayRecords(readModel?.nodes)
  const readModelEdges = arrayRecords(readModel?.edges)
  const taxonomy = asRecord(readModel?.taxonomy)
  const nodeKindVocabulary = uniqueStrings(taxonomy?.nodeKindsUsed, [
    ...graphNodes.map((node) => stringValue(node.nodeKind)),
    ...readModelNodes.map((node) => stringValue(node.nodeKind)),
  ])
  const edgeTypeVocabulary = uniqueStrings(taxonomy?.edgeTypesUsed, [
    ...graphEdges.map((edge) => stringValue(edge.edgeType)),
    ...readModelEdges.map((edge) => stringValue(edge.edgeType)),
  ])

  validatePlanVocabulary(plan, nodeKindVocabulary, edgeTypeVocabulary, findings)

  const startNodeCandidates = arrayRecords(plan?.startNodeCandidates)
  const startNodeCandidate = startNodeCandidates.length === 1 ? startNodeCandidates[0] : null
  const startNodeId = stringValue(startNodeCandidate?.nodeId)
  const graphNodeById = mapById(graphNodes)
  const readModelNodeById = mapById(readModelNodes)
  const graphEdgeById = mapById(graphEdges)
  const readModelEdgeById = mapById(readModelEdges)
  const startNode = graphNodeById.get(startNodeId) ?? readModelNodeById.get(startNodeId) ?? null

  let startNodeResolutionStatus: SelectedGraphSliceResult['startNodeResolutionStatus'] = 'blocked'
  if (plan && graphSource && readModel) {
    if (startNodeCandidates.length !== 1) {
      startNodeResolutionStatus = startNodeCandidates.length === 0 ? 'unresolved' : 'ambiguous'
      findings.push({
        code: 'SELECTED_GRAPH_SLICE_START_NODE_CANDIDATE_COUNT_INVALID',
        severity: 'error',
        field: 'startNodeCandidates',
        message: 'Selected graph slice generation requires exactly one resolved start node candidate.',
        expected: 1,
        actual: startNodeCandidates.length,
      })
    } else if (!startNodeId) {
      startNodeResolutionStatus = 'unresolved'
      findings.push({
        code: 'SELECTED_GRAPH_SLICE_START_NODE_ID_MISSING',
        severity: 'error',
        field: 'startNodeCandidates[0].nodeId',
        message: 'Selected graph slice generation requires startNodeCandidates[0].nodeId.',
      })
    } else if (!startNode) {
      startNodeResolutionStatus = 'unresolved'
      findings.push({
        code: 'SELECTED_GRAPH_SLICE_START_NODE_NOT_FOUND',
        severity: 'error',
        field: 'startNodeCandidates[0].nodeId',
        message: `Start node "${startNodeId}" was not found in graph source or generated read model.`,
      })
    } else {
      startNodeResolutionStatus = 'resolved'
    }
  }

  const blocked = findings.some((finding) => finding.severity === 'error')
  const selectedNodes = new Map<string, SelectedGraphSliceNode>()
  const selectedEdges = new Map<string, SelectedGraphSliceEdge>()
  const excludedNodes: ExcludedGraphSliceNode[] = []
  const excludedEdges: ExcludedGraphSliceEdge[] = []

  if (!blocked && startNode) {
    const startNodeSlice = toSelectedNode(
      startNode,
      'start node selected from traversal plan startNodeCandidates[0]',
      ['start-node', 'target-change'],
      sourceAuthorityForNode(startNodeId, graphNodeById, readModelNodeById),
    )
    selectedNodes.set(startNodeSlice.nodeId, startNodeSlice)
    selectionTrace.push({
      action: 'selected-node',
      nodeId: startNodeSlice.nodeId,
      reason: startNodeSlice.selectionReason,
      source: 'traversal-plan',
    })

    const requiredEdgeTypes = stringArray(plan?.requiredEdgeTypes)
    const optionalEdgeTypes = stringArray(plan?.optionalEdgeTypes)
    const excludedEdgeTypes = new Set(stringArray(plan?.excludedEdgeTypes))
    const requiredNodeTypes = stringArray(plan?.requiredNodeTypes)
    const optionalNodeTypes = stringArray(plan?.optionalNodeTypes)
    const excludedNodeTypes = new Set(stringArray(plan?.excludedNodeTypes))
    const allowedEdgeTypes = new Set([...requiredEdgeTypes, ...optionalEdgeTypes])
    const allowedNodeTypes = new Set([...requiredNodeTypes, ...optionalNodeTypes])
    const directEdges = graphEdges.filter((edge) => edge.from === startNodeId || edge.to === startNodeId)

    for (const edge of directEdges) {
      const edgeId = stringValue(edge.id)
      const edgeType = stringValue(edge.edgeType)
      const from = stringValue(edge.from)
      const to = stringValue(edge.to)
      const neighborId = from === startNodeId ? to : from
      const neighbor = graphNodeById.get(neighborId) ?? readModelNodeById.get(neighborId)
      const neighborKind = stringValue(neighbor?.nodeKind)

      if (excludedEdgeTypes.has(edgeType) || edgeType === 'approves') {
        excludedEdges.push({
          edgeId,
          from,
          to,
          edgeType,
          exclusionReason:
            edgeType === 'approves'
              ? 'approval edge excluded by MVP selection policy'
              : 'edge type excluded by traversal plan',
        })
        selectionTrace.push({
          action: 'excluded-edge',
          edgeId,
          reason: excludedEdges[excludedEdges.length - 1]?.exclusionReason ?? 'edge excluded',
          source: 'graph-source',
        })
        continue
      }

      if (!allowedEdgeTypes.has(edgeType)) {
        excludedEdges.push({
          edgeId,
          from,
          to,
          edgeType,
          exclusionReason: 'edge type is not required or optional in traversal plan',
        })
        selectionTrace.push({
          action: 'excluded-edge',
          edgeId,
          reason: 'edge type is not required or optional in traversal plan',
          source: 'graph-source',
        })
        continue
      }

      if (!neighbor) {
        excludedEdges.push({
          edgeId,
          from,
          to,
          edgeType,
          exclusionReason: `neighbor node "${neighborId}" was not found in graph source or generated read model`,
        })
        selectionTrace.push({
          action: 'excluded-edge',
          edgeId,
          reason: `neighbor node "${neighborId}" missing`,
          source: 'graph-source',
        })
        continue
      }

      if (excludedNodeTypes.has(neighborKind) || !allowedNodeTypes.has(neighborKind)) {
        excludedNodes.push({
          nodeId: neighborId,
          nodeKind: neighborKind,
          exclusionReason: excludedNodeTypes.has(neighborKind)
            ? 'node kind excluded by traversal plan'
            : 'node kind is not required or optional in traversal plan',
        })
        excludedEdges.push({
          edgeId,
          from,
          to,
          edgeType,
          exclusionReason: `neighbor node kind "${neighborKind}" is outside selected traversal plan node kinds`,
        })
        selectionTrace.push({
          action: 'excluded-node',
          nodeId: neighborId,
          reason: excludedNodes[excludedNodes.length - 1]?.exclusionReason ?? 'node excluded',
          source: 'graph-source',
        })
        selectionTrace.push({
          action: 'excluded-edge',
          edgeId,
          reason: `neighbor node kind "${neighborKind}" not allowed`,
          source: 'graph-source',
        })
        continue
      }

      const selectedEdge = toSelectedEdge(edge, 'direct edge connected to resolved traversal start node')
      selectedEdges.set(selectedEdge.edgeId, selectedEdge)
      selectionTrace.push({
        action: 'selected-edge',
        edgeId: selectedEdge.edgeId,
        reason: selectedEdge.selectionReason,
        source: 'graph-source',
      })

      if (!selectedNodes.has(neighborId)) {
        const selectedNeighbor = toSelectedNode(
          neighbor,
          `direct neighbor selected through ${edgeType} edge ${edgeId}`,
          selectedAsForNodeKind(neighborKind),
          sourceAuthorityForNode(neighborId, graphNodeById, readModelNodeById),
        )
        selectedNodes.set(selectedNeighbor.nodeId, selectedNeighbor)
        selectionTrace.push({
          action: 'selected-node',
          nodeId: selectedNeighbor.nodeId,
          reason: selectedNeighbor.selectionReason,
          source: 'graph-source',
        })
      }

      if (!graphEdgeById.has(edgeId) && !readModelEdgeById.has(edgeId)) {
        findings.push({
          code: 'SELECTED_GRAPH_SLICE_EDGE_SOURCE_AUTHORITY_MISSING',
          severity: 'warning',
          field: 'selectedEdges',
          message: `Selected edge "${edgeId}" was not found in graph-source or generated read-model edge maps.`,
        })
      }
    }
  } else if (blocked) {
    selectionTrace.push({
      action: 'blocked',
      reason: 'selected graph slice prerequisites failed',
      source: 'traversal-plan',
    })
  }

  const selectedNodeValues = [...selectedNodes.values()]
  const selectedEdgeValues = [...selectedEdges.values()]
  const includedEvidenceNodes = selectedNodeValues.filter((node) =>
    ['evidence', 'check', 'log'].includes(node.nodeKind),
  )
  const includedScopeNodes = selectedNodeValues.filter((node) =>
    ['task', 'code', 'requirement', 'change'].includes(node.nodeKind),
  )
  const includedRiskNodes = selectedNodeValues.filter((node) => node.nodeKind === 'finding')
  const includedPolicyNodes = selectedNodeValues.filter((node) => node.nodeKind === 'document')
  const hasEvidenceOrCheck = includedEvidenceNodes.length > 0
  const incomplete = !blocked && !hasEvidenceOrCheck
  if (incomplete) {
    findings.push({
      code: 'SELECTED_GRAPH_SLICE_REQUIRED_EVIDENCE_OR_CHECK_MISSING',
      severity: 'warning',
      field: 'includedEvidenceNodes',
      message:
        'Selected graph slice did not include an evidence or check node, so contract input readiness remains review-required.',
    })
  }
  const status = blocked
    ? 'selected-graph-slice-blocked'
    : incomplete
      ? 'selected-graph-slice-incomplete'
      : 'selected-graph-slice-generated'
  const sliceCompletenessStatus = blocked ? 'blocked' : incomplete ? 'incomplete' : 'complete'

  return {
    schemaVersion: 1,
    artifactRole: 'selected-graph-slice',
    status,
    selectorName: SELECTOR_NAME,
    selectionScope: 'deterministic-selected-slice-no-contract-input',
    sourceTraversalPlan: paths.traversalPlanPath ?? '<in-memory>',
    sourceGraphAwareValidation: stringValue(plan?.sourceGraphAwareValidation) || '<unknown>',
    graphSourcePath,
    generatedReadModelPath,
    selectedGraphSliceId: 'selected-graph-slice-add-todo-runtime-evidence-only',
    selectedGraphSliceStatus: blocked ? 'blocked' : incomplete ? 'incomplete' : 'generated',
    graphTraversalExecuted: !blocked,
    selectedGraphSliceGenerated: !blocked && !incomplete,
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
    selectedNodes: selectedNodeValues,
    selectedEdges: selectedEdgeValues,
    includedPolicyNodes,
    includedScopeNodes,
    includedEvidenceNodes,
    includedRiskNodes,
    excludedNodes,
    excludedEdges,
    selectionTrace,
    sliceCompletenessStatus,
    contractInputReadinessStatus: blocked || incomplete ? 'review-required' : 'not-ready',
    contractInputGenerationAllowed: false,
    requiresClarification: startNodeResolutionStatus === 'unresolved',
    humanReviewRequired: true,
    validationFindings: findings,
    outputWritePolicy: 'explicit-output-only',
    writtenOutputPath: null,
    writtenOutputPathAuthorityStatus: 'not-written-stdout-only',
    nonExecutionBoundary:
      'This selected graph slice generator executes deterministic graph slice selection only. It does not generate contract compiler input, does not generate instruction packs, does not call an LLM, does not mutate graph-source, does not apply graph deltas, does not approve work, does not record human decisions, does not satisfy runtime Evidence, does not prove equivalence, does not enforce scope, and does not configure CI required checks.',
  }
}

export async function generateSelectedGraphSliceFile(
  root: string,
  traversalPlanPath: string,
  options: { output?: string } = {},
): Promise<SelectedGraphSliceFileResult> {
  const resolvedTraversalPlanPath = resolveRepoPath(root, traversalPlanPath)
  const traversalPlan = await readJsonSafe<Record<string, unknown>>(resolvedTraversalPlanPath)
  if (!traversalPlan.ok) {
    throw new Error(`Unable to read Graph Traversal Plan from ${traversalPlanPath}: ${traversalPlan.error}`)
  }

  const graphSourcePath = stringValue(traversalPlan.value.graphSourcePath)
  const generatedReadModelPath = stringValue(traversalPlan.value.generatedReadModelPath)
  const graphSource = graphSourcePath ? await readOptionalJson(resolveRepoPath(root, graphSourcePath)) : undefined
  const generatedReadModel = generatedReadModelPath
    ? await readOptionalJson(resolveRepoPath(root, generatedReadModelPath))
    : undefined

  const result = generateSelectedGraphSlice(
    traversalPlan.value,
    {
      graphSource,
      generatedReadModel,
      graphSourcePath,
      generatedReadModelPath,
    },
    {
      traversalPlanPath: relativePath(root, resolvedTraversalPlanPath),
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

function validateTraversalPlanPrerequisites(plan: JsonRecord | null, findings: SelectedGraphSliceFinding[]): void {
  if (!plan) {
    findings.push({
      code: 'SELECTED_GRAPH_SLICE_TRAVERSAL_PLAN_NOT_OBJECT',
      severity: 'error',
      field: 'traversalPlan',
      message: 'Selected graph slice generation requires a Graph Traversal Plan JSON object.',
    })
    return
  }

  const expectedFields: Array<[string, unknown]> = [
    ['artifactRole', 'graph-traversal-plan'],
    ['graphTraversalPlanStatus', 'ready'],
    ['graphTraversalPlanGenerated', true],
    ['selectedGraphSlicePlanningAllowed', true],
    ['startNodeResolutionStatus', 'resolved'],
  ]

  for (const [field, expected] of expectedFields) {
    if (plan[field] !== expected) {
      findings.push({
        code: 'SELECTED_GRAPH_SLICE_PREREQUISITE_UNSAFE',
        severity: 'error',
        field,
        message: `Selected graph slice prerequisite "${field}" is not satisfied.`,
        expected,
        actual: plan[field],
        suggestedFix: 'Regenerate a ready Graph Traversal Plan before selecting a graph slice.',
      })
    }
  }
}

function validatePlanVocabulary(
  plan: JsonRecord | null,
  nodeKindVocabulary: string[],
  edgeTypeVocabulary: string[],
  findings: SelectedGraphSliceFinding[],
): void {
  if (!plan) {
    return
  }

  const nodeVocabulary = new Set(nodeKindVocabulary)
  const edgeVocabulary = new Set(edgeTypeVocabulary)
  for (const field of ['requiredNodeTypes', 'optionalNodeTypes', 'excludedNodeTypes']) {
    for (const value of stringArray(plan[field])) {
      if (!nodeVocabulary.has(value)) {
        findings.push({
          code: 'SELECTED_GRAPH_SLICE_NODE_VOCABULARY_INVALID',
          severity: 'error',
          field,
          message: `Traversal plan field "${field}" contains node kind "${value}" outside generated read-model taxonomy.`,
          actual: value,
        })
      }
    }
  }
  for (const field of ['requiredEdgeTypes', 'optionalEdgeTypes', 'excludedEdgeTypes']) {
    for (const value of stringArray(plan[field])) {
      if (!edgeVocabulary.has(value)) {
        findings.push({
          code: 'SELECTED_GRAPH_SLICE_EDGE_VOCABULARY_INVALID',
          severity: 'error',
          field,
          message: `Traversal plan field "${field}" contains edge type "${value}" outside generated read-model taxonomy.`,
          actual: value,
        })
      }
    }
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

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === 'string') : []
}

function stringValue(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

function uniqueStrings(primary: unknown, fallback: string[]): string[] {
  const values = Array.isArray(primary) ? primary : fallback
  return [...new Set(values.filter((entry): entry is string => typeof entry === 'string' && entry.length > 0))]
}

function mapById(records: JsonRecord[]): Map<string, JsonRecord> {
  const entries: Array<[string, JsonRecord]> = []
  for (const record of records) {
    const id = stringValue(record.id)
    if (id.length > 0) {
      entries.push([id, record])
    }
  }
  return new Map(entries)
}

function toSelectedNode(
  node: JsonRecord,
  selectionReason: string,
  selectedAs: string[],
  sourceAuthorityStatus: string,
): SelectedGraphSliceNode {
  return {
    nodeId: stringValue(node.id),
    nodeKind: stringValue(node.nodeKind),
    ...(stringValue(node.title) ? { title: stringValue(node.title) } : {}),
    ...(stringValue(node.sourceArtifact) ? { sourceArtifact: stringValue(node.sourceArtifact) } : {}),
    selectionReason,
    selectedAs,
    sourceAuthorityStatus,
  }
}

function toSelectedEdge(edge: JsonRecord, selectionReason: string): SelectedGraphSliceEdge {
  return {
    edgeId: stringValue(edge.id),
    from: stringValue(edge.from),
    to: stringValue(edge.to),
    edgeType: stringValue(edge.edgeType),
    selectionReason,
    sourceAuthorityStatus: 'selected-from-graph-source-and-read-model-vocabulary',
  }
}

function selectedAsForNodeKind(nodeKind: string): string[] {
  if (['evidence', 'check', 'log'].includes(nodeKind)) {
    return ['evidence-or-check-source']
  }
  if (nodeKind === 'finding') {
    return ['risk-or-impact-source']
  }
  if (nodeKind === 'document') {
    return ['policy-source']
  }
  return ['scope-source']
}

function sourceAuthorityForNode(
  nodeId: string,
  graphNodeById: Map<string, JsonRecord>,
  readModelNodeById: Map<string, JsonRecord>,
): string {
  const graphSourcePresent = graphNodeById.has(nodeId)
  const readModelPresent = readModelNodeById.has(nodeId)
  if (graphSourcePresent && readModelPresent) {
    return 'selected-from-graph-source-and-generated-read-model'
  }
  if (graphSourcePresent) {
    return 'selected-from-graph-source'
  }
  if (readModelPresent) {
    return 'selected-from-generated-read-model'
  }
  return 'source-authority-missing'
}

function resolveRepoPath(root: string, inputPath: string): string {
  return path.isAbsolute(inputPath) ? inputPath : path.resolve(root, inputPath)
}
