import path from 'node:path'
import { readJsonSafe, relativePath, writeJsonAtomic, writeTextAtomic } from './fs.js'
import {
  hasCodexControlDirectory,
  hasDevViewControlDirectory,
  hasHiddenControlDirectorySegment,
} from './path-safety.js'

type JsonRecord = Record<string, unknown>

const TASK_ROLE = 'devview-benchmark-task-spec'
const TASK_STATUS = 'devview-benchmark-task-configured'
const GOLDEN_ROLE = 'devview-benchmark-golden-answer'
const GOLDEN_STATUS = 'devview-benchmark-golden-answer-ready'
const REPORT_ROLE = 'devview-graphify-import-validation-report'
const PASSED_STATUS = 'devview-graphify-import-validation-passed'
const BLOCKED_STATUS = 'devview-graphify-import-validation-blocked'

const unsafeAuthorityFields = [
  'providerInvoked',
  'networkCallMade',
  'shellCommandExecuted',
  'shellCommandsExecuted',
  'extensionExecutionAllowed',
  'extensionsExecuted',
  'extensionCodeExecuted',
  'graphifyExecuted',
  'graphifyLiveRun',
  'nativeBenchmarkExecuted',
  'benchmarkExecuted',
  'candidateExecuted',
  'filesMutated',
  'graphSourceMutated',
  'graphDeltaApplied',
  'runtimeEvidenceSatisfied',
  'evidenceAccepted',
  'equivalenceProven',
  'scopeEnforced',
  'ciEnforcementEnabled',
  'hooksActivated',
  'branchProtectionChanged',
  'branchProtectionMutated',
  'requiredChecksConfigured',
  'requiredChecksMutated',
  'externalCiMutated',
  'diffRejectionEnabled',
  'diffRejectionActivated',
  'approvalAutomationEnabled',
  'userAcceptanceAutomated',
]

const executableInstructionFields = [
  'command',
  'commands',
  'script',
  'scripts',
  'entrypoint',
  'executablePath',
  'execution',
  'providerEndpoint',
  'networkEndpoint',
  'networkUrl',
  'url',
  'installCommand',
]

export interface GraphifyImportValidationOptions {
  graphifyExport?: string
  mapping?: string
  benchmarkTask?: string
  goldenAnswer?: string
  output?: string
  markdown?: string
}

export interface GraphifyImportFinding {
  severity: 'info' | 'warning' | 'error'
  findingLevel: 'blocking' | 'protocol' | 'coverage' | 'info'
  code: string
  message: string
  path?: string
  field?: string
}

export interface GraphifyImportValidationReport {
  schemaVersion: 1
  artifactRole: typeof REPORT_ROLE
  status: typeof PASSED_STATUS | typeof BLOCKED_STATUS
  validationScope: 'graphify-import-protocol-validation-report-only'
  sourceGraphifyExport: {
    path: string
    exportId: string | null
    nodeCount: number
    edgeCount: number
    sourceMetadataPresent: boolean
  }
  sourceMapping: {
    path: string
    mappingId: string | null
    nodeMappingCount: number
    edgeMappingCount: number
  }
  taskGoldenAlignment: {
    benchmarkTaskProvided: boolean
    goldenAnswerProvided: boolean
    taskIdStatus: 'matched' | 'not-modeled' | 'mismatched'
    projectModeStatus: 'matched' | 'not-modeled' | 'mismatched'
  }
  nodeMappingCoverage: {
    graphifyNodeCount: number
    mappedNodeCount: number
    unmappedNodeCount: number
    unmappedGraphifyNodeIds: string[]
    duplicateDevViewNodeIds: string[]
    conflictingGraphifyNodeIds: string[]
    coverageRatio: number
  }
  edgeMappingCoverage: {
    graphifyEdgeCount: number
    mappedEdgeCount: number
    unmappedEdgeCount: number
    unmappedGraphifyEdgeIds: string[]
    duplicateDevViewEdgeIds: string[]
    conflictingGraphifyEdgeIds: string[]
    coverageRatio: number
  }
  contextRelevanceCoverage: {
    goldenProvided: boolean
    expectedContextCount: number
    mappedExpectedContextCount: number
    missingExpectedContext: string[]
    forbiddenContextHitCount: number
    forbiddenContextHits: string[]
    contextRecallHint: number | null
    contextPrecisionHint: number | null
  }
  protocolFindings: GraphifyImportFinding[]
  downstreamActionPlan: string[]
  graphifyExecuted: false
  providerInvoked: false
  networkCallMade: false
  shellCommandsExecuted: false
  extensionExecutionAllowed: false
  benchmarkExecuted: false
  candidateExecuted: false
  nativeBenchmarkExecuted: false
  sourceFactsOnly: true
  graphSourceMutated: false
  graphDeltaApplied: false
  runtimeEvidenceSatisfied: false
  evidenceAccepted: false
  equivalenceProven: false
  scopeEnforced: false
  ciEnforcementEnabled: false
  hooksActivated: false
  branchProtectionChanged: false
  branchProtectionMutated: false
  requiredChecksConfigured: false
  requiredChecksMutated: false
  externalCiMutated: false
  diffRejectionEnabled: false
  diffRejectionActivated: false
  approvalAutomationEnabled: false
  userAcceptanceAutomated: false
  writtenOutputPath?: string
  writtenMarkdownPath?: string
}

interface LoadedSource {
  requestedPath: string
  resolvedPath: string
  relativePath: string
  record: JsonRecord | null
  readError: string | null
}

interface LoadedInputs {
  graphifyExport: LoadedSource
  mapping: LoadedSource
  benchmarkTask?: LoadedSource
  goldenAnswer?: LoadedSource
}

interface GraphifyNode {
  id: string
  contextIds: string[]
}

interface GraphifyEdge {
  id: string
}

interface NodeMapping {
  graphifyNodeId: string
  devviewNodeId: string | null
  sourcePath: string | null
  contextIds: string[]
}

interface EdgeMapping {
  graphifyEdgeId: string
  devviewEdgeId: string | null
  contextIds: string[]
}

export class GraphifyImportValidationError extends Error {
  readonly report: GraphifyImportValidationReport

  constructor(report: GraphifyImportValidationReport) {
    super('Graphify import validation is blocked.')
    this.report = report
  }
}

export async function validateGraphifyImport(
  root: string,
  options: GraphifyImportValidationOptions,
): Promise<GraphifyImportValidationReport> {
  validateRequiredOptions(options)
  const sourcePaths = [
    resolveRepoPath(root, options.graphifyExport ?? ''),
    resolveRepoPath(root, options.mapping ?? ''),
    ...(options.benchmarkTask ? [resolveRepoPath(root, options.benchmarkTask)] : []),
    ...(options.goldenAnswer ? [resolveRepoPath(root, options.goldenAnswer)] : []),
  ]
  await assertOutputAuthority(root, sourcePaths, options)

  const inputs: LoadedInputs = {
    graphifyExport: await loadSource(root, options.graphifyExport ?? ''),
    mapping: await loadSource(root, options.mapping ?? ''),
    benchmarkTask: options.benchmarkTask ? await loadSource(root, options.benchmarkTask) : undefined,
    goldenAnswer: options.goldenAnswer ? await loadSource(root, options.goldenAnswer) : undefined,
  }

  const blockingFindings = validateSources(inputs)
  if (blockingFindings.length > 0) {
    throw new GraphifyImportValidationError(buildReport(inputs, blockingFindings, true))
  }

  const report = buildReport(inputs, [], false)
  const outputPath = resolveRepoPath(root, options.output ?? '')
  await writeJsonAtomic(outputPath, report)
  report.writtenOutputPath = relativePath(root, outputPath)
  if (options.markdown) {
    const markdownPath = resolveRepoPath(root, options.markdown)
    await writeTextAtomic(markdownPath, renderMarkdown(report))
    report.writtenMarkdownPath = relativePath(root, markdownPath)
    await writeJsonAtomic(outputPath, report)
  }
  return report
}

function buildReport(
  inputs: LoadedInputs,
  blockingFindings: GraphifyImportFinding[],
  blocked: boolean,
): GraphifyImportValidationReport {
  const graphifyExport = inputs.graphifyExport.record ?? {}
  const mapping = inputs.mapping.record ?? {}
  const task = inputs.benchmarkTask?.record ?? {}
  const golden = inputs.goldenAnswer?.record ?? {}
  const nodes = blocked ? [] : graphifyNodes(graphifyExport)
  const edges = blocked ? [] : graphifyEdges(graphifyExport)
  const nodeMappings = blocked ? [] : parseNodeMappings(mapping)
  const edgeMappings = blocked ? [] : parseEdgeMappings(mapping)
  const protocolFindings = blocked ? blockingFindings : protocolFindingsFor(nodes, edges, nodeMappings, edgeMappings)

  return {
    schemaVersion: 1,
    artifactRole: REPORT_ROLE,
    status: blocked ? BLOCKED_STATUS : PASSED_STATUS,
    validationScope: 'graphify-import-protocol-validation-report-only',
    sourceGraphifyExport: {
      path: inputs.graphifyExport.relativePath,
      exportId: stringValue(graphifyExport.exportId) ?? stringValue(graphifyExport.id),
      nodeCount: nodes.length,
      edgeCount: edges.length,
      sourceMetadataPresent: Boolean(asRecord(graphifyExport.sourceMetadata) ?? asRecord(graphifyExport.metadata)),
    },
    sourceMapping: {
      path: inputs.mapping.relativePath,
      mappingId: stringValue(mapping.mappingId) ?? stringValue(mapping.id),
      nodeMappingCount: nodeMappings.length,
      edgeMappingCount: edgeMappings.length,
    },
    taskGoldenAlignment: blocked
      ? emptyAlignment(Boolean(inputs.benchmarkTask), Boolean(inputs.goldenAnswer))
      : compareTaskGolden(
          task,
          golden,
          graphifyExport,
          mapping,
          Boolean(inputs.benchmarkTask),
          Boolean(inputs.goldenAnswer),
        ),
    nodeMappingCoverage: blocked ? emptyNodeCoverage() : nodeCoverage(nodes, nodeMappings),
    edgeMappingCoverage: blocked ? emptyEdgeCoverage() : edgeCoverage(edges, edgeMappings),
    contextRelevanceCoverage: blocked
      ? emptyContextCoverage(Boolean(inputs.goldenAnswer))
      : contextCoverage(golden, nodeMappings, edgeMappings, Boolean(inputs.goldenAnswer)),
    protocolFindings,
    downstreamActionPlan: blocked
      ? ['Fix blocking source shape or safety findings, then rerun static Graphify import validation.']
      : downstreamActionPlan(protocolFindings, Boolean(inputs.goldenAnswer)),
    graphifyExecuted: false,
    providerInvoked: false,
    networkCallMade: false,
    shellCommandsExecuted: false,
    extensionExecutionAllowed: false,
    benchmarkExecuted: false,
    candidateExecuted: false,
    nativeBenchmarkExecuted: false,
    sourceFactsOnly: true,
    graphSourceMutated: false,
    graphDeltaApplied: false,
    runtimeEvidenceSatisfied: false,
    evidenceAccepted: false,
    equivalenceProven: false,
    scopeEnforced: false,
    ciEnforcementEnabled: false,
    hooksActivated: false,
    branchProtectionChanged: false,
    branchProtectionMutated: false,
    requiredChecksConfigured: false,
    requiredChecksMutated: false,
    externalCiMutated: false,
    diffRejectionEnabled: false,
    diffRejectionActivated: false,
    approvalAutomationEnabled: false,
    userAcceptanceAutomated: false,
  }
}

function validateSources(inputs: LoadedInputs): GraphifyImportFinding[] {
  const findings: GraphifyImportFinding[] = []
  validateRead(inputs.graphifyExport, 'GRAPHIFY_IMPORT_EXPORT_READ_FAILED', findings)
  validateRead(inputs.mapping, 'GRAPHIFY_IMPORT_MAPPING_READ_FAILED', findings)
  if (inputs.benchmarkTask) validateRead(inputs.benchmarkTask, 'GRAPHIFY_IMPORT_TASK_READ_FAILED', findings)
  if (inputs.goldenAnswer) validateRead(inputs.goldenAnswer, 'GRAPHIFY_IMPORT_GOLDEN_READ_FAILED', findings)

  for (const input of [inputs.graphifyExport, inputs.mapping, inputs.benchmarkTask, inputs.goldenAnswer].filter(
    (entry): entry is LoadedSource => Boolean(entry),
  )) {
    for (const hit of collectUnsafeAuthorityHits(input.record)) {
      findings.push({
        severity: 'error',
        findingLevel: 'blocking',
        code: 'GRAPHIFY_IMPORT_UNSAFE_SOURCE_AUTHORITY_FLAG',
        message: `${input.relativePath} contains unsafe report-only flag ${hit.field}: true.`,
        path: input.relativePath,
        field: hit.field,
      })
    }
    for (const hit of collectExecutableInstructionHits(input.record)) {
      findings.push({
        severity: 'error',
        findingLevel: 'blocking',
        code: 'GRAPHIFY_IMPORT_EXECUTABLE_INSTRUCTION_DECLARED',
        message: `${input.relativePath} contains executable/provider/network instruction field ${hit.field}.`,
        path: input.relativePath,
        field: hit.field,
      })
    }
  }

  const exportRecord = inputs.graphifyExport.record
  if (exportRecord && graphifyNodes(exportRecord).length === 0 && graphifyEdges(exportRecord).length === 0) {
    findings.push({
      severity: 'error',
      findingLevel: 'blocking',
      code: 'GRAPHIFY_IMPORT_EXPORT_SHAPE_INVALID',
      message: `${inputs.graphifyExport.relativePath} must contain a static Graphify nodes or edges collection.`,
      path: inputs.graphifyExport.relativePath,
    })
  }
  if (
    exportRecord &&
    !hasValidCollectionShape(exportRecord, 'nodes') &&
    !hasValidCollectionShape(exportRecord, 'graphNodes')
  ) {
    findings.push({
      severity: 'error',
      findingLevel: 'blocking',
      code: 'GRAPHIFY_IMPORT_EXPORT_SHAPE_INVALID',
      message: `${inputs.graphifyExport.relativePath} has an invalid nodes collection shape.`,
      path: inputs.graphifyExport.relativePath,
      field: 'nodes',
    })
  }
  if (
    exportRecord &&
    !hasValidCollectionShape(exportRecord, 'edges') &&
    !hasValidCollectionShape(exportRecord, 'graphEdges')
  ) {
    findings.push({
      severity: 'error',
      findingLevel: 'blocking',
      code: 'GRAPHIFY_IMPORT_EXPORT_SHAPE_INVALID',
      message: `${inputs.graphifyExport.relativePath} has an invalid edges collection shape.`,
      path: inputs.graphifyExport.relativePath,
      field: 'edges',
    })
  }

  const mapping = inputs.mapping.record
  if (mapping && parseNodeMappings(mapping).length === 0 && parseEdgeMappings(mapping).length === 0) {
    findings.push({
      severity: 'error',
      findingLevel: 'blocking',
      code: 'GRAPHIFY_IMPORT_MAPPING_SHAPE_INVALID',
      message: `${inputs.mapping.relativePath} must contain nodeMappings or edgeMappings.`,
      path: inputs.mapping.relativePath,
    })
  }

  if (inputs.benchmarkTask?.record) {
    validateRoleStatus(
      inputs.benchmarkTask,
      TASK_ROLE,
      TASK_STATUS,
      'GRAPHIFY_IMPORT_TASK_ROLE_STATUS_INVALID',
      findings,
    )
  }
  if (inputs.goldenAnswer?.record) {
    validateRoleStatus(
      inputs.goldenAnswer,
      GOLDEN_ROLE,
      GOLDEN_STATUS,
      'GRAPHIFY_IMPORT_GOLDEN_ROLE_STATUS_INVALID',
      findings,
    )
  }
  return findings
}

function protocolFindingsFor(
  nodes: GraphifyNode[],
  edges: GraphifyEdge[],
  nodeMappings: NodeMapping[],
  edgeMappings: EdgeMapping[],
): GraphifyImportFinding[] {
  const findings: GraphifyImportFinding[] = []
  const nodeCoverageResult = nodeCoverage(nodes, nodeMappings)
  const edgeCoverageResult = edgeCoverage(edges, edgeMappings)
  if (nodeCoverageResult.unmappedNodeCount > 0) {
    findings.push({
      severity: 'warning',
      findingLevel: 'coverage',
      code: 'GRAPHIFY_IMPORT_UNMAPPED_NODES',
      message: `Unmapped Graphify nodes: ${nodeCoverageResult.unmappedGraphifyNodeIds.join(', ')}.`,
      field: 'nodeMappings',
    })
  }
  if (edgeCoverageResult.unmappedEdgeCount > 0) {
    findings.push({
      severity: 'warning',
      findingLevel: 'coverage',
      code: 'GRAPHIFY_IMPORT_UNMAPPED_EDGES',
      message: `Unmapped Graphify edges: ${edgeCoverageResult.unmappedGraphifyEdgeIds.join(', ')}.`,
      field: 'edgeMappings',
    })
  }
  if (
    nodeCoverageResult.duplicateDevViewNodeIds.length > 0 ||
    nodeCoverageResult.conflictingGraphifyNodeIds.length > 0
  ) {
    findings.push({
      severity: 'warning',
      findingLevel: 'protocol',
      code: 'GRAPHIFY_IMPORT_NODE_MAPPING_CONFLICT',
      message: 'Node mapping includes duplicate DevView ids or conflicting Graphify node mappings.',
      field: 'nodeMappings',
    })
  }
  if (
    edgeCoverageResult.duplicateDevViewEdgeIds.length > 0 ||
    edgeCoverageResult.conflictingGraphifyEdgeIds.length > 0
  ) {
    findings.push({
      severity: 'warning',
      findingLevel: 'protocol',
      code: 'GRAPHIFY_IMPORT_EDGE_MAPPING_CONFLICT',
      message: 'Edge mapping includes duplicate DevView ids or conflicting Graphify edge mappings.',
      field: 'edgeMappings',
    })
  }
  return findings
}

function graphifyNodes(record: JsonRecord): GraphifyNode[] {
  return recordsFromCollection(record.nodes ?? record.graphNodes).flatMap((entry) => {
    const id = stringValue(entry.id) ?? stringValue(entry.nodeId)
    if (!id) return []
    return [{ id, contextIds: contextIdsFromRecord(entry) }]
  })
}

function graphifyEdges(record: JsonRecord): GraphifyEdge[] {
  return recordsFromCollection(record.edges ?? record.graphEdges).flatMap((entry) => {
    const id =
      stringValue(entry.id) ??
      stringValue(entry.edgeId) ??
      [stringValue(entry.source) ?? stringValue(entry.from), stringValue(entry.target) ?? stringValue(entry.to)]
        .filter(Boolean)
        .join('->')
    if (!id) return []
    return [{ id }]
  })
}

function parseNodeMappings(record: JsonRecord): NodeMapping[] {
  return recordsFromCollection(record.nodeMappings ?? record.nodes).flatMap((entry) => {
    const graphifyNodeId =
      stringValue(entry.graphifyNodeId) ?? stringValue(entry.graphifyId) ?? stringValue(entry.sourceId)
    if (!graphifyNodeId) return []
    return [
      {
        graphifyNodeId,
        devviewNodeId:
          stringValue(entry.devviewNodeId) ?? stringValue(entry.devViewNodeId) ?? stringValue(entry.targetId),
        sourcePath: stringValue(entry.sourcePath) ?? stringValue(entry.filePath) ?? stringValue(entry.path),
        contextIds: contextIdsFromRecord(entry),
      },
    ]
  })
}

function parseEdgeMappings(record: JsonRecord): EdgeMapping[] {
  return recordsFromCollection(record.edgeMappings ?? record.edges).flatMap((entry) => {
    const graphifyEdgeId =
      stringValue(entry.graphifyEdgeId) ?? stringValue(entry.graphifyId) ?? stringValue(entry.sourceId)
    if (!graphifyEdgeId) return []
    return [
      {
        graphifyEdgeId,
        devviewEdgeId:
          stringValue(entry.devviewEdgeId) ?? stringValue(entry.devViewEdgeId) ?? stringValue(entry.targetId),
        contextIds: contextIdsFromRecord(entry),
      },
    ]
  })
}

function nodeCoverage(
  nodes: GraphifyNode[],
  mappings: NodeMapping[],
): GraphifyImportValidationReport['nodeMappingCoverage'] {
  const nodeIds = new Set(nodes.map((entry) => normalize(entry.id)))
  const mappedGraphifyIds = new Set(
    mappings.map((entry) => normalize(entry.graphifyNodeId)).filter((entry) => nodeIds.has(entry)),
  )
  const unmapped = nodes.map((entry) => entry.id).filter((id) => !mappedGraphifyIds.has(normalize(id)))
  const devviewIds = mappings.map((entry) => entry.devviewNodeId).filter((entry): entry is string => Boolean(entry))
  return {
    graphifyNodeCount: nodes.length,
    mappedNodeCount: mappedGraphifyIds.size,
    unmappedNodeCount: unmapped.length,
    unmappedGraphifyNodeIds: unmapped,
    duplicateDevViewNodeIds: duplicateValues(devviewIds),
    conflictingGraphifyNodeIds: conflictingMappings(
      mappings.map((entry) => ({ sourceId: entry.graphifyNodeId, targetId: entry.devviewNodeId ?? '' })),
    ),
    coverageRatio: nodes.length === 0 ? 1 : roundScore(mappedGraphifyIds.size / nodes.length),
  }
}

function edgeCoverage(
  edges: GraphifyEdge[],
  mappings: EdgeMapping[],
): GraphifyImportValidationReport['edgeMappingCoverage'] {
  const edgeIds = new Set(edges.map((entry) => normalize(entry.id)))
  const mappedGraphifyIds = new Set(
    mappings.map((entry) => normalize(entry.graphifyEdgeId)).filter((entry) => edgeIds.has(entry)),
  )
  const unmapped = edges.map((entry) => entry.id).filter((id) => !mappedGraphifyIds.has(normalize(id)))
  const devviewIds = mappings.map((entry) => entry.devviewEdgeId).filter((entry): entry is string => Boolean(entry))
  return {
    graphifyEdgeCount: edges.length,
    mappedEdgeCount: mappedGraphifyIds.size,
    unmappedEdgeCount: unmapped.length,
    unmappedGraphifyEdgeIds: unmapped,
    duplicateDevViewEdgeIds: duplicateValues(devviewIds),
    conflictingGraphifyEdgeIds: conflictingMappings(
      mappings.map((entry) => ({ sourceId: entry.graphifyEdgeId, targetId: entry.devviewEdgeId ?? '' })),
    ),
    coverageRatio: edges.length === 0 ? 1 : roundScore(mappedGraphifyIds.size / edges.length),
  }
}

function contextCoverage(
  golden: JsonRecord,
  nodeMappings: NodeMapping[],
  edgeMappings: EdgeMapping[],
  goldenProvided: boolean,
): GraphifyImportValidationReport['contextRelevanceCoverage'] {
  if (!goldenProvided) return emptyContextCoverage(false)
  const expected = selectedContextSet(golden.expectedContext)
  const forbidden = selectedContextSet(golden.forbiddenContext)
  const mapped = mappedContextSet(nodeMappings, edgeMappings)
  const mappedExpected = [...expected].filter((entry) => mapped.has(entry))
  const missingExpected = [...expected].filter((entry) => !mapped.has(entry))
  const forbiddenHits = [...forbidden].filter((entry) => mapped.has(entry))
  return {
    goldenProvided: true,
    expectedContextCount: expected.size,
    mappedExpectedContextCount: mappedExpected.length,
    missingExpectedContext: missingExpected,
    forbiddenContextHitCount: forbiddenHits.length,
    forbiddenContextHits: forbiddenHits,
    contextRecallHint: expected.size === 0 ? 1 : roundScore(mappedExpected.length / expected.size),
    contextPrecisionHint:
      mapped.size === 0 ? null : roundScore(Math.max(0, (mapped.size - forbiddenHits.length) / mapped.size)),
  }
}

function mappedContextSet(nodeMappings: NodeMapping[], edgeMappings: EdgeMapping[]): Set<string> {
  return normalizedSet([
    ...nodeMappings.flatMap((entry) => [
      ...(entry.devviewNodeId ? [`node:${entry.devviewNodeId}`] : []),
      ...(entry.sourcePath ? [`file:${entry.sourcePath}`] : []),
      ...entry.contextIds,
    ]),
    ...edgeMappings.flatMap((entry) => [
      ...(entry.devviewEdgeId ? [`edge:${entry.devviewEdgeId}`] : []),
      ...entry.contextIds,
    ]),
  ])
}

function compareTaskGolden(
  task: JsonRecord,
  golden: JsonRecord,
  graphifyExport: JsonRecord,
  mapping: JsonRecord,
  benchmarkTaskProvided: boolean,
  goldenAnswerProvided: boolean,
): GraphifyImportValidationReport['taskGoldenAlignment'] {
  const ids = uniqueStrings([task.taskId, golden.taskId, graphifyExport.taskId, mapping.taskId].map(stringValue))
  const modes = uniqueStrings(
    [task.projectMode, golden.projectMode, graphifyExport.projectMode, mapping.projectMode].map(stringValue),
  )
  return {
    benchmarkTaskProvided,
    goldenAnswerProvided,
    taskIdStatus: ids.length === 0 ? 'not-modeled' : ids.length === 1 ? 'matched' : 'mismatched',
    projectModeStatus: modes.length === 0 ? 'not-modeled' : modes.length === 1 ? 'matched' : 'mismatched',
  }
}

function downstreamActionPlan(findings: GraphifyImportFinding[], goldenProvided: boolean): string[] {
  const actions = ['Use this validation report as a source fact for future codex-graphify fixture generation.']
  if (!goldenProvided) actions.push('Add a golden answer input to compute expected context coverage.')
  if (findings.some((entry) => entry.code === 'GRAPHIFY_IMPORT_UNMAPPED_NODES')) {
    actions.push('Map remaining Graphify nodes before treating the import as comparison-ready.')
  }
  if (findings.some((entry) => entry.code === 'GRAPHIFY_IMPORT_UNMAPPED_EDGES')) {
    actions.push('Map remaining Graphify edges before graph-update comparison fixtures depend on this import.')
  }
  return actions
}

function emptyAlignment(
  benchmarkTaskProvided: boolean,
  goldenAnswerProvided: boolean,
): GraphifyImportValidationReport['taskGoldenAlignment'] {
  return {
    benchmarkTaskProvided,
    goldenAnswerProvided,
    taskIdStatus: 'not-modeled',
    projectModeStatus: 'not-modeled',
  }
}

function emptyNodeCoverage(): GraphifyImportValidationReport['nodeMappingCoverage'] {
  return {
    graphifyNodeCount: 0,
    mappedNodeCount: 0,
    unmappedNodeCount: 0,
    unmappedGraphifyNodeIds: [],
    duplicateDevViewNodeIds: [],
    conflictingGraphifyNodeIds: [],
    coverageRatio: 0,
  }
}

function emptyEdgeCoverage(): GraphifyImportValidationReport['edgeMappingCoverage'] {
  return {
    graphifyEdgeCount: 0,
    mappedEdgeCount: 0,
    unmappedEdgeCount: 0,
    unmappedGraphifyEdgeIds: [],
    duplicateDevViewEdgeIds: [],
    conflictingGraphifyEdgeIds: [],
    coverageRatio: 0,
  }
}

function emptyContextCoverage(goldenProvided: boolean): GraphifyImportValidationReport['contextRelevanceCoverage'] {
  return {
    goldenProvided,
    expectedContextCount: 0,
    mappedExpectedContextCount: 0,
    missingExpectedContext: [],
    forbiddenContextHitCount: 0,
    forbiddenContextHits: [],
    contextRecallHint: goldenProvided ? 0 : null,
    contextPrecisionHint: null,
  }
}

function renderMarkdown(report: GraphifyImportValidationReport): string {
  return [
    '# DevView Graphify Import Validation',
    '',
    `- status: ${report.status}`,
    `- graphifyExport: ${report.sourceGraphifyExport.path}`,
    `- mapping: ${report.sourceMapping.path}`,
    `- nodes: ${report.nodeMappingCoverage.mappedNodeCount}/${report.nodeMappingCoverage.graphifyNodeCount}`,
    `- edges: ${report.edgeMappingCoverage.mappedEdgeCount}/${report.edgeMappingCoverage.graphifyEdgeCount}`,
    `- expectedContextCoverage: ${report.contextRelevanceCoverage.mappedExpectedContextCount}/${report.contextRelevanceCoverage.expectedContextCount}`,
    '',
    '## Findings',
    ...(report.protocolFindings.length === 0
      ? ['- none']
      : report.protocolFindings.map((entry) => `- ${entry.severity} ${entry.code}: ${entry.message}`)),
    '',
    '## Safety',
    '- graphifyExecuted: false',
    '- providerInvoked: false',
    '- networkCallMade: false',
    '- shellCommandsExecuted: false',
    '- benchmarkExecuted: false',
    '- graphSourceMutated: false',
    '- graphDeltaApplied: false',
  ].join('\n')
}

async function loadSource(root: string, requestedPath: string): Promise<LoadedSource> {
  const resolvedPath = resolveRepoPath(root, requestedPath)
  const relative = relativePath(root, resolvedPath)
  const result = await readJsonSafe<JsonRecord>(resolvedPath)
  if (!result.ok) {
    return { requestedPath, resolvedPath, relativePath: relative, record: null, readError: result.error }
  }
  return { requestedPath, resolvedPath, relativePath: relative, record: result.value, readError: null }
}

function validateRequiredOptions(options: GraphifyImportValidationOptions): void {
  if (!options.graphifyExport) throw new Error('benchmark validate-graphify-import requires --graphify-export <file>.')
  if (!options.mapping) throw new Error('benchmark validate-graphify-import requires --mapping <file>.')
  if (!options.output) throw new Error('benchmark validate-graphify-import requires --output <json>.')
}

async function assertOutputAuthority(
  root: string,
  sourcePaths: string[],
  options: GraphifyImportValidationOptions,
): Promise<void> {
  const outputPath = options.output ? resolveRepoPath(root, options.output) : null
  const markdownPath = options.markdown ? resolveRepoPath(root, options.markdown) : null
  if (!outputPath) throw new Error('benchmark validate-graphify-import requires --output <json>.')
  const sourceSet = new Set(sourcePaths.map((entry) => path.resolve(entry)))
  if (markdownPath && path.resolve(outputPath) === path.resolve(markdownPath)) {
    throw new Error('Graphify import validation JSON output and Markdown output must be different paths.')
  }
  for (const target of [outputPath, ...(markdownPath ? [markdownPath] : [])]) {
    const relativeTarget = relativePath(root, target)
    if (sourceSet.has(path.resolve(target))) {
      throw new Error(`Graphify import validation output would overwrite a source input: ${relativeTarget}.`)
    }
    if (
      hasDevViewControlDirectory(target) ||
      hasCodexControlDirectory(target) ||
      hasHiddenControlDirectorySegment(target)
    ) {
      throw new Error(`Graphify import validation output is inside a protected control path: ${relativeTarget}.`)
    }
    if (isSourceAuthorityShapedPath(relativeTarget)) {
      throw new Error(
        `Graphify import validation output would overwrite a source-authority-shaped path: ${relativeTarget}.`,
      )
    }
  }
}

function validateRead(source: LoadedSource, code: string, findings: GraphifyImportFinding[]): void {
  if (source.readError) {
    findings.push({
      severity: 'error',
      findingLevel: 'blocking',
      code,
      message: source.readError,
      path: source.relativePath,
    })
  }
}

function validateRoleStatus(
  source: LoadedSource,
  role: string,
  status: string,
  code: string,
  findings: GraphifyImportFinding[],
): void {
  if (!source.record) return
  if (source.record.artifactRole !== role || source.record.status !== status) {
    findings.push({
      severity: 'error',
      findingLevel: 'blocking',
      code,
      message: `${source.relativePath} must be ${role} with status ${status}.`,
      path: source.relativePath,
    })
  }
}

function recordsFromCollection(value: unknown): JsonRecord[] {
  if (Array.isArray(value)) return value.filter((entry): entry is JsonRecord => isRecord(entry))
  if (isRecord(value)) return Object.values(value).filter((entry): entry is JsonRecord => isRecord(entry))
  return []
}

function hasValidCollectionShape(record: JsonRecord, key: string): boolean {
  if (!(key in record)) return true
  return Array.isArray(record[key]) || isRecord(record[key])
}

function contextIdsFromRecord(record: JsonRecord): string[] {
  return uniqueStrings([
    ...stringArray(record.contextIds),
    ...stringArray(record.devviewContextIds),
    ...stringArray(record.devViewContextIds),
  ])
}

function selectedContextSet(value: unknown): Set<string> {
  const record = asRecord(value)
  if (!record) return new Set()
  return normalizedSet([
    ...stringArray(record.files).map((entry) => `file:${entry}`),
    ...stringArray(record.nodeIds).map((entry) => `node:${entry}`),
    ...stringArray(record.edgeIds).map((entry) => `edge:${entry}`),
    ...stringArray(record.evidenceIds).map((entry) => `evidence:${entry}`),
  ])
}

function duplicateValues(values: string[]): string[] {
  const counts = new Map<string, number>()
  for (const value of values.map(normalize)) counts.set(value, (counts.get(value) ?? 0) + 1)
  return [...counts.entries()].filter(([, count]) => count > 1).map(([value]) => value)
}

function conflictingMappings(mappings: Array<{ sourceId: string; targetId: string }>): string[] {
  const targetsBySource = new Map<string, Set<string>>()
  for (const mapping of mappings) {
    const source = normalize(mapping.sourceId)
    const target = normalize(mapping.targetId)
    targetsBySource.set(source, new Set([...(targetsBySource.get(source) ?? []), target]))
  }
  return [...targetsBySource.entries()].filter(([, targets]) => targets.size > 1).map(([source]) => source)
}

function collectUnsafeAuthorityHits(
  value: unknown,
  pathParts: string[] = [],
  seen = new Set<unknown>(),
): Array<{ field: string }> {
  if (typeof value !== 'object' || value === null || seen.has(value)) return []
  seen.add(value)
  if (Array.isArray(value)) {
    return value.flatMap((entry, index) => collectUnsafeAuthorityHits(entry, [...pathParts, String(index)], seen))
  }
  const record = value as JsonRecord
  const hits: Array<{ field: string }> = []
  for (const [key, entry] of Object.entries(record)) {
    const nextPath = [...pathParts, key]
    if (unsafeAuthorityFields.includes(key) && entry === true) {
      hits.push({ field: nextPath.join('.') })
    }
    hits.push(...collectUnsafeAuthorityHits(entry, nextPath, seen))
  }
  return hits
}

function collectExecutableInstructionHits(
  value: unknown,
  pathParts: string[] = [],
  seen = new Set<unknown>(),
): Array<{ field: string }> {
  if (typeof value !== 'object' || value === null || seen.has(value)) return []
  seen.add(value)
  if (Array.isArray(value)) {
    return value.flatMap((entry, index) => collectExecutableInstructionHits(entry, [...pathParts, String(index)], seen))
  }
  const record = value as JsonRecord
  const hits: Array<{ field: string }> = []
  for (const [key, entry] of Object.entries(record)) {
    const nextPath = [...pathParts, key]
    if (executableInstructionFields.includes(key) && isExecutableInstructionValue(entry)) {
      hits.push({ field: nextPath.join('.') })
    }
    hits.push(...collectExecutableInstructionHits(entry, nextPath, seen))
  }
  return hits
}

function isExecutableInstructionValue(value: unknown): boolean {
  if (typeof value === 'string') return value.trim().length > 0
  if (Array.isArray(value)) return value.length > 0
  if (isRecord(value)) return Object.keys(value).length > 0
  return value === true
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === 'string' && entry.length > 0)
    : []
}

function asRecord(value: unknown): JsonRecord | null {
  return isRecord(value) ? value : null
}

function stringValue(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null
}

function uniqueStrings(values: Array<string | null | undefined>): string[] {
  return [...new Set(values.filter((entry): entry is string => Boolean(entry)))]
}

function normalizedSet(values: string[]): Set<string> {
  return new Set(values.map(normalize))
}

function normalize(value: string): string {
  return value.replace(/\\/g, '/').toLowerCase()
}

function roundScore(value: number): number {
  return Math.round(value * 100) / 100
}

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function resolveRepoPath(root: string, filePath: string): string {
  return path.resolve(root, filePath)
}

function isSourceAuthorityShapedPath(filePath: string): boolean {
  const normalized = filePath.replace(/\\/g, '/').toLowerCase()
  return (
    normalized.includes('/graph-source') ||
    normalized.includes('/source-authority') ||
    normalized.includes('/read-model') ||
    normalized.includes('/project-memory') ||
    normalized.endsWith('maintainability-graph.json')
  )
}
