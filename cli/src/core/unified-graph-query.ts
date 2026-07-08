import { createHash } from 'node:crypto'
import path from 'node:path'
import { readFile } from 'node:fs/promises'
import { relativePath, writeJsonAtomic, writeTextAtomic } from './fs.js'
import {
  hasCodexControlDirectory,
  hasDevViewControlDirectory,
  hasHiddenControlDirectorySegment,
} from './path-safety.js'
import { CodeSubgraphValidationError, validateCodeSubgraphRecord } from './code-subgraph-validation.js'

type JsonRecord = Record<string, unknown>
type QueryMode = 'neighbors' | 'path' | 'explain'
type NodeDomain = 'code' | 'maintenance'
type SourceKind = 'code-subgraph' | 'code-symbol-links-validation' | 'graph-source'

const REPORT_ROLE = 'devview-unified-graph-query-report'
const PASSED_STATUS = 'devview-unified-graph-query-reported'
const BLOCKED_STATUS = 'devview-unified-graph-query-blocked'
const REPORT_SCOPE = 'unified-graph-query-report-only'
const CODE_SUBGRAPH_ROLE = 'devview-code-subgraph'
const CODE_SUBGRAPH_STATUS = 'devview-code-subgraph-supplied'
const CODE_SUBGRAPH_SCOPE = 'code-subgraph-source-fact-only'
const CODE_SYMBOL_LINK_VALIDATION_ROLE = 'devview-code-symbol-link-validation-report'
const CODE_SYMBOL_LINK_VALIDATION_STATUS = 'devview-code-symbol-link-validation-passed'
const CODE_SYMBOL_LINK_VALIDATION_SCOPE = 'code-symbol-link-validation-report-only'
const DEFAULT_MAX_DEPTH = 4
const MAX_ALLOWED_DEPTH = 8

const unsafeAuthorityFields = [
  'providerInvoked',
  'networkCallMade',
  'apiCallMade',
  'shellCommandExecuted',
  'shellCommandsExecuted',
  'extensionExecutionAllowed',
  'extensionsExecuted',
  'extensionCodeExecuted',
  'graphifyExecuted',
  'graphifyLiveRun',
  'astExtractorExecuted',
  'nativeBenchmarkExecuted',
  'benchmarkExecuted',
  'candidateExecuted',
  'filesMutated',
  'graphSourceMutated',
  'maintainabilityGraphMutationPlanned',
  'mutationApplied',
  'graphDeltaApplied',
  'viewTreeGenerated',
  'contextPackGenerated',
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
  'approvalAutomationEnabled',
  'userAcceptanceAutomated',
  'enterpriseGateActivated',
  'cryptographicSignaturePresent',
  'cryptographicSignatureVerified',
  'cryptographicSigningImplemented',
  'keyGenerated',
  'privateKeyStored',
  'keyManagementImplemented',
  'keyRegistryCreated',
  'trustRootCreated',
  'rbacEnforced',
  'permissionVerified',
  'rbacPermissionVerified',
  'providerGrantPresent',
  'providerGrantVerified',
  'providerGrantActive',
  'providerAllowlistActive',
  'networkAllowlistActive',
  'packagePublished',
  'packageArtifactGenerated',
  'packageSigned',
  'sbomGenerated',
  'sbomAttested',
  'provenanceAttested',
  'provenanceAttestationGenerated',
  'provenanceAttestationVerified',
  'realSlsaVerificationPerformed',
  'realInTotoVerificationPerformed',
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
  'apiEndpoint',
  'url',
  'installCommand',
  'shellCommand',
  'shellCommands',
]

export interface UnifiedGraphQueryOptions {
  codeSubgraph?: string
  codeSymbolLinksValidation?: string
  graphSource?: string
  mode?: string
  node?: string
  sourceNode?: string
  targetNode?: string
  maxDepth?: number
  output?: string
  markdown?: string
}

export interface UnifiedGraphQueryFinding {
  severity: 'blocker' | 'warning' | 'satisfied'
  code: string
  message: string
  field?: string
  path?: string
}

interface LoadedArtifact {
  requestedPath: string
  resolvedPath: string
  relativePath: string
  sourceKind: SourceKind
  record: JsonRecord | null
  sha256: string | null
  byteLength: number | null
  readError: string | null
}

interface UnifiedNode {
  id: string
  kind: string
  domain: NodeDomain
  label: string | null
  sourceFile: string | null
  sourceLocation: unknown
  sourceLocationStatus: string | null
  confidence: string | null
  sourceArtifact: SourceKind
}

interface UnifiedEdge {
  id: string
  from: string
  to: string
  edgeType: string
  sourceArtifact: SourceKind
  linkType: string | null
  confidence: string | null
  sourceFile: string | null
  sourceLocationStatus: string | null
}

interface UnifiedGraph {
  nodes: UnifiedNode[]
  edges: UnifiedEdge[]
  nodesById: Map<string, UnifiedNode>
  incomingByNode: Map<string, UnifiedEdge[]>
  outgoingByNode: Map<string, UnifiedEdge[]>
  codeNodeCount: number
  maintenanceNodeCount: number
  linkEdgeCount: number
}

interface NodeSummary {
  nodeId: string
  nodeKind: string
  domain: NodeDomain
  label: string | null
  sourceFile: string | null
  sourceLocation: unknown
  sourceLocationStatus: string | null
  confidence: string | null
  sourceArtifact: SourceKind
}

interface NeighborResult {
  direction: 'incoming' | 'outgoing'
  edgeId: string
  edgeType: string
  sourceNodeId: string
  targetNodeId: string
  neighborNodeId: string
  neighborNodeKind: string
  neighborDomain: NodeDomain
  sourceArtifact: SourceKind
  linkType: string | null
  confidence: string | null
}

interface PathResultEdge {
  edgeId: string
  edgeType: string
  from: string
  to: string
  sourceArtifact: SourceKind
  linkType: string | null
}

type QueryResult =
  | {
      neighbors: {
        node: NodeSummary | null
        incoming: NeighborResult[]
        outgoing: NeighborResult[]
      }
    }
  | {
      path: {
        pathFound: boolean
        pathLength: number
        nodes: NodeSummary[]
        edges: PathResultEdge[]
      }
    }
  | {
      explain: {
        nodeSummary: NodeSummary | null
        whyRelevant: string[]
        incomingCount: number
        outgoingCount: number
        incomingByEdgeType: Record<string, number>
        outgoingByEdgeType: Record<string, number>
        relatedMaintenanceNodes: NeighborResult[]
        relatedCodeNodes: NeighborResult[]
        limitations: string[]
      }
    }

export interface UnifiedGraphQueryReport extends JsonRecord {
  schemaVersion: 1
  artifactRole: typeof REPORT_ROLE
  status: typeof PASSED_STATUS | typeof BLOCKED_STATUS
  scope: typeof REPORT_SCOPE
  reportOnly: true
  sourceFactsOnly: true
  queryMode: QueryMode | string | null
  queryParameters: {
    node: string | null
    sourceNode: string | null
    targetNode: string | null
    maxDepth: number
  }
  sourceCodeSubgraph: SourceSummary
  sourceCodeSymbolLinksValidation: SourceSummary & { validatedLinkCount: number }
  sourceGraph: SourceSummary
  assembledGraphSummary: {
    nodeCount: number
    edgeCount: number
    codeNodeCount: number
    maintenanceNodeCount: number
    linkEdgeCount: number
    nodeKinds: Record<string, number>
    edgeTypes: Record<string, number>
  }
  result: QueryResult
  unifiedGraphBoundary: {
    separateCodeGraphCreated: false
    maintainabilityGraphMutationPlanned: false
    mutationApplied: false
    graphSourceMutated: false
    graphDeltaApplied: false
    viewTreeGenerated: false
    contextPackGenerated: false
  }
  validationFindings: UnifiedGraphQueryFinding[]
  sourceArtifactDigests: Array<{
    sourceKind: SourceKind
    sourcePath: string
    sha256: string | null
    byteLength: number | null
  }>
  graphifyExecuted: false
  astExtractorExecuted: false
  providerInvoked: false
  networkCallMade: false
  apiCallMade: false
  shellCommandsExecuted: false
  extensionExecutionAllowed: false
  graphSourceMutated: false
  graphDeltaApplied: false
  viewTreeGenerated: false
  contextPackGenerated: false
  runtimeEvidenceSatisfied: false
  evidenceAccepted: false
  equivalenceProven: false
  scopeEnforced: false
  ciEnforcementEnabled: false
  rbacEnforced: false
  permissionVerified: false
  cryptographicSignatureVerified: false
  enterpriseGateActivated: false
  writtenOutputPath?: string
  writtenMarkdownPath?: string
}

interface SourceSummary {
  path: string | null
  artifactRole: string | null
  status: string | null
  scope: string | null
  sha256: string | null
  byteLength: number | null
  nodeCount: number
  edgeCount: number
}

export class UnifiedGraphQueryError extends Error {
  readonly report: UnifiedGraphQueryReport

  constructor(report: UnifiedGraphQueryReport) {
    super('Unified graph query report is blocked.')
    this.report = report
  }
}

export async function queryUnifiedGraphFile(
  root: string,
  options: UnifiedGraphQueryOptions,
): Promise<UnifiedGraphQueryReport> {
  validateRequiredOptions(options)
  const sourcePaths = sourceInputPaths(root, options)
  await assertOutputAuthority(root, sourcePaths, options)

  const codeSubgraph = await loadArtifact(root, options.codeSubgraph ?? '', 'code-subgraph')
  const linksValidation = options.codeSymbolLinksValidation
    ? await loadArtifact(root, options.codeSymbolLinksValidation, 'code-symbol-links-validation')
    : null
  const graphSource = options.graphSource ? await loadArtifact(root, options.graphSource, 'graph-source') : null
  const queryMode = normalizeMode(options.mode)
  const maxDepth = normalizeMaxDepth(options.maxDepth)

  const findings: UnifiedGraphQueryFinding[] = []
  for (const artifact of [codeSubgraph, linksValidation, graphSource]) {
    validateLoadedArtifact(artifact, findings)
  }
  if (codeSubgraph.record) {
    validateCodeSubgraphSource(root, codeSubgraph, findings)
  }
  if (linksValidation?.record) {
    validateCodeSymbolLinksValidationReport(linksValidation, findings)
  }
  validateQueryParameters(queryMode, options, maxDepth, findings)

  const graph =
    findings.some((finding) => finding.severity === 'blocker') && !codeSubgraph.record
      ? emptyGraph()
      : assembleUnifiedGraph(
          codeSubgraph.record,
          linksValidation?.record ?? null,
          graphSource?.record ?? null,
          findings,
        )
  validateQueryNodes(queryMode, options, graph, findings)

  const blocked = findings.some((finding) => finding.severity === 'blocker')
  const result = blocked ? emptyResult(queryMode) : runQuery(queryMode as QueryMode, options, graph, maxDepth)

  if (!blocked) {
    findings.push({
      severity: 'satisfied',
      code: 'UNIFIED_GRAPH_QUERY_REPORTED',
      message:
        'Unified graph query was computed from supplied source facts without code execution or graph-source mutation.',
      path: options.output ? relativePath(root, resolveRepoPath(root, options.output)) : undefined,
    })
  }

  const report = buildReport(
    codeSubgraph,
    linksValidation,
    graphSource,
    graph,
    queryMode,
    options,
    maxDepth,
    result,
    findings,
    blocked,
  )
  if (blocked) {
    throw new UnifiedGraphQueryError(report)
  }

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

function validateRequiredOptions(options: UnifiedGraphQueryOptions): void {
  if (!options.codeSubgraph) {
    throw new Error('graph query-unified requires --code-subgraph <devview-code-subgraph.json>.')
  }
  if (!options.mode) {
    throw new Error('graph query-unified requires --mode <neighbors|path|explain>.')
  }
  if (!options.output) {
    throw new Error('graph query-unified requires --output <unified-graph-query-report.json>.')
  }
}

async function loadArtifact(root: string, requestedPath: string, sourceKind: SourceKind): Promise<LoadedArtifact> {
  const resolvedPath = resolveRepoPath(root, requestedPath)
  try {
    const bytes = await readFile(resolvedPath)
    return {
      requestedPath,
      resolvedPath,
      relativePath: relativePath(root, resolvedPath),
      sourceKind,
      record: JSON.parse(bytes.toString('utf8').replace(/^\uFEFF/, '')) as JsonRecord,
      sha256: createHash('sha256').update(bytes).digest('hex'),
      byteLength: bytes.byteLength,
      readError: null,
    }
  } catch (error) {
    return {
      requestedPath,
      resolvedPath,
      relativePath: relativePath(root, resolvedPath),
      sourceKind,
      record: null,
      sha256: null,
      byteLength: null,
      readError: error instanceof Error ? error.message : String(error),
    }
  }
}

function validateLoadedArtifact(artifact: LoadedArtifact | null, findings: UnifiedGraphQueryFinding[]): void {
  if (!artifact) return
  if (!artifact.record) {
    findings.push(
      blocker(
        'UNIFIED_GRAPH_QUERY_SOURCE_READ_FAILED',
        `Could not read ${artifact.sourceKind}: ${artifact.readError}`,
        artifact.sourceKind,
        artifact.relativePath,
      ),
    )
    return
  }
  for (const hit of collectUnsafeAuthorityHits(artifact.record)) {
    findings.push(
      blocker(
        'UNIFIED_GRAPH_QUERY_UNSAFE_AUTHORITY_FLAG',
        `${artifact.relativePath} contains unsafe report-only flag ${hit.field}: true.`,
        hit.field,
        artifact.relativePath,
      ),
    )
  }
  for (const hit of collectExecutableInstructionHits(artifact.record)) {
    findings.push(
      blocker(
        'UNIFIED_GRAPH_QUERY_EXECUTABLE_INSTRUCTION_DECLARED',
        `${artifact.relativePath} contains executable/provider/network instruction field ${hit.field}.`,
        hit.field,
        artifact.relativePath,
      ),
    )
  }
}

function validateCodeSubgraphSource(root: string, source: LoadedArtifact, findings: UnifiedGraphQueryFinding[]): void {
  const record = source.record
  if (!record) return
  if (record.artifactRole !== CODE_SUBGRAPH_ROLE) {
    findings.push(
      blocker(
        'UNIFIED_GRAPH_QUERY_CODE_SUBGRAPH_ROLE_INVALID',
        `Code subgraph artifactRole must be ${CODE_SUBGRAPH_ROLE}.`,
        'artifactRole',
        source.relativePath,
      ),
    )
  }
  if (record.status !== CODE_SUBGRAPH_STATUS) {
    findings.push(
      blocker(
        'UNIFIED_GRAPH_QUERY_CODE_SUBGRAPH_STATUS_INVALID',
        `Code subgraph status must be ${CODE_SUBGRAPH_STATUS}.`,
        'status',
        source.relativePath,
      ),
    )
  }
  if ((record.scope ?? record.codeSubgraphScope) !== CODE_SUBGRAPH_SCOPE) {
    findings.push(
      blocker(
        'UNIFIED_GRAPH_QUERY_CODE_SUBGRAPH_SCOPE_INVALID',
        `Code subgraph scope must be ${CODE_SUBGRAPH_SCOPE}.`,
        'scope',
        source.relativePath,
      ),
    )
  }
  try {
    validateCodeSubgraphRecord(root, source.requestedPath, record)
  } catch (error) {
    if (error instanceof CodeSubgraphValidationError) {
      for (const finding of error.report.validationFindings.filter((entry) => entry.severity === 'blocker')) {
        findings.push(
          blocker(
            'UNIFIED_GRAPH_QUERY_CODE_SUBGRAPH_VALIDATION_FAILED',
            finding.message,
            finding.field,
            finding.path ?? source.relativePath,
          ),
        )
      }
    } else {
      findings.push(
        blocker(
          'UNIFIED_GRAPH_QUERY_CODE_SUBGRAPH_VALIDATION_FAILED',
          error instanceof Error ? error.message : String(error),
          'codeSubgraph',
          source.relativePath,
        ),
      )
    }
  }
}

function validateCodeSymbolLinksValidationReport(source: LoadedArtifact, findings: UnifiedGraphQueryFinding[]): void {
  const record = source.record
  if (!record) return
  if (record.artifactRole !== CODE_SYMBOL_LINK_VALIDATION_ROLE) {
    findings.push(
      blocker(
        'UNIFIED_GRAPH_QUERY_LINK_VALIDATION_ROLE_INVALID',
        `Code symbol links validation artifactRole must be ${CODE_SYMBOL_LINK_VALIDATION_ROLE}.`,
        'artifactRole',
        source.relativePath,
      ),
    )
  }
  if (record.status !== CODE_SYMBOL_LINK_VALIDATION_STATUS) {
    findings.push(
      blocker(
        'UNIFIED_GRAPH_QUERY_LINK_VALIDATION_STATUS_INVALID',
        `Code symbol links validation status must be ${CODE_SYMBOL_LINK_VALIDATION_STATUS}.`,
        'status',
        source.relativePath,
      ),
    )
  }
  if ((record.scope ?? record.validationScope) !== CODE_SYMBOL_LINK_VALIDATION_SCOPE) {
    findings.push(
      blocker(
        'UNIFIED_GRAPH_QUERY_LINK_VALIDATION_SCOPE_INVALID',
        `Code symbol links validation scope must be ${CODE_SYMBOL_LINK_VALIDATION_SCOPE}.`,
        'scope',
        source.relativePath,
      ),
    )
  }
  if (!Array.isArray(record.validatedLinks)) {
    findings.push(
      warning(
        'UNIFIED_GRAPH_QUERY_LINK_VALIDATION_LINKS_NOT_SUMMARIZED',
        'Code symbol links validation did not expose validatedLinks; maintenance link edges will be empty.',
        'validatedLinks',
        source.relativePath,
      ),
    )
  }
}

function validateQueryParameters(
  mode: string | null,
  options: UnifiedGraphQueryOptions,
  maxDepth: number,
  findings: UnifiedGraphQueryFinding[],
): void {
  if (!mode || !['neighbors', 'path', 'explain'].includes(mode)) {
    findings.push(
      blocker('UNIFIED_GRAPH_QUERY_MODE_INVALID', 'Query mode must be one of neighbors, path, or explain.', 'mode'),
    )
    return
  }
  if (maxDepth < 1 || maxDepth > MAX_ALLOWED_DEPTH) {
    findings.push(
      blocker(
        'UNIFIED_GRAPH_QUERY_MAX_DEPTH_INVALID',
        `Path max depth must be between 1 and ${MAX_ALLOWED_DEPTH}.`,
        'maxDepth',
      ),
    )
  }
  if ((mode === 'neighbors' || mode === 'explain') && !stringValue(options.node)) {
    findings.push(blocker('UNIFIED_GRAPH_QUERY_NODE_REQUIRED', `${mode} mode requires --node <node-id>.`, 'node'))
  }
  if (mode === 'path') {
    if (!stringValue(options.sourceNode)) {
      findings.push(
        blocker(
          'UNIFIED_GRAPH_QUERY_SOURCE_NODE_REQUIRED',
          'path mode requires --source-node <node-id>.',
          'sourceNode',
        ),
      )
    }
    if (!stringValue(options.targetNode)) {
      findings.push(
        blocker(
          'UNIFIED_GRAPH_QUERY_TARGET_NODE_REQUIRED',
          'path mode requires --target-node <node-id>.',
          'targetNode',
        ),
      )
    }
  }
}

function validateQueryNodes(
  mode: string | null,
  options: UnifiedGraphQueryOptions,
  graph: UnifiedGraph,
  findings: UnifiedGraphQueryFinding[],
): void {
  if (!mode || !['neighbors', 'path', 'explain'].includes(mode)) return
  const required =
    mode === 'path'
      ? [
          { field: 'sourceNode', id: stringValue(options.sourceNode) },
          { field: 'targetNode', id: stringValue(options.targetNode) },
        ]
      : [{ field: 'node', id: stringValue(options.node) }]
  for (const entry of required) {
    if (!entry.id) continue
    if (!graph.nodesById.has(entry.id)) {
      findings.push(
        blocker(
          'UNIFIED_GRAPH_QUERY_NODE_MISSING',
          `Query node ${entry.id} was not found in the assembled unified graph view.`,
          entry.field,
        ),
      )
    }
  }
}

function assembleUnifiedGraph(
  codeSubgraph: JsonRecord | null,
  linksValidation: JsonRecord | null,
  graphSource: JsonRecord | null,
  findings: UnifiedGraphQueryFinding[],
): UnifiedGraph {
  const nodesById = new Map<string, UnifiedNode>()
  const edges: UnifiedEdge[] = []

  for (const node of arrayRecords(codeSubgraph?.nodes)) {
    const unified = codeNode(node)
    if (unified) nodesById.set(unified.id, unified)
  }
  for (const node of graphNodeRecords(graphSource)) {
    const unified = maintenanceNode(node, 'graph-source')
    if (unified && !nodesById.has(unified.id)) nodesById.set(unified.id, unified)
  }
  for (const link of arrayRecords(linksValidation?.validatedLinks)) {
    const sourceNodeId = stringValue(link.sourceNodeId)
    const sourceNodeKind = stringValue(link.sourceNodeKind) ?? 'maintenance'
    if (sourceNodeId && !nodesById.has(sourceNodeId)) {
      nodesById.set(sourceNodeId, {
        id: sourceNodeId,
        kind: sourceNodeKind,
        domain: 'maintenance',
        label: sourceNodeId,
        sourceFile: stringValue(link.sourceFile),
        sourceLocation: link.sourceLocation ?? null,
        sourceLocationStatus: stringValue(link.sourceLocationStatus),
        confidence: stringValue(link.confidence),
        sourceArtifact: 'code-symbol-links-validation',
      })
    }
  }

  for (const edge of arrayRecords(codeSubgraph?.edges)) {
    const unified = codeEdge(edge)
    if (unified && nodesById.has(unified.from) && nodesById.has(unified.to)) edges.push(unified)
  }
  for (const edge of graphEdgeRecords(graphSource)) {
    const unified = graphSourceEdge(edge)
    if (unified && nodesById.has(unified.from) && nodesById.has(unified.to)) edges.push(unified)
  }
  for (const link of arrayRecords(linksValidation?.validatedLinks)) {
    const unified = linkEdge(link)
    if (!unified) continue
    if (!nodesById.has(unified.from) || !nodesById.has(unified.to)) {
      findings.push(
        blocker(
          'UNIFIED_GRAPH_QUERY_LINK_ENDPOINT_MISSING',
          `Validated code symbol link ${unified.id} references an endpoint missing from the assembled graph.`,
          'validatedLinks',
        ),
      )
      continue
    }
    edges.push(unified)
  }

  const sortedNodes = [...nodesById.values()].sort(compareNodes)
  const sortedEdges = edges.sort(compareEdges)
  const incomingByNode = new Map<string, UnifiedEdge[]>()
  const outgoingByNode = new Map<string, UnifiedEdge[]>()
  for (const edge of sortedEdges) {
    const outgoing = outgoingByNode.get(edge.from) ?? []
    outgoing.push(edge)
    outgoingByNode.set(edge.from, outgoing)
    const incoming = incomingByNode.get(edge.to) ?? []
    incoming.push(edge)
    incomingByNode.set(edge.to, incoming)
  }
  return {
    nodes: sortedNodes,
    edges: sortedEdges,
    nodesById,
    incomingByNode,
    outgoingByNode,
    codeNodeCount: sortedNodes.filter((node) => node.domain === 'code').length,
    maintenanceNodeCount: sortedNodes.filter((node) => node.domain === 'maintenance').length,
    linkEdgeCount: sortedEdges.filter((edge) => edge.sourceArtifact === 'code-symbol-links-validation').length,
  }
}

function runQuery(
  mode: QueryMode,
  options: UnifiedGraphQueryOptions,
  graph: UnifiedGraph,
  maxDepth: number,
): QueryResult {
  if (mode === 'neighbors') {
    const nodeId = stringValue(options.node) ?? ''
    return { neighbors: neighborsResult(nodeId, graph) }
  }
  if (mode === 'path') {
    return {
      path: pathResult(stringValue(options.sourceNode) ?? '', stringValue(options.targetNode) ?? '', graph, maxDepth),
    }
  }
  const nodeId = stringValue(options.node) ?? ''
  return { explain: explainResult(nodeId, graph) }
}

function neighborsResult(
  nodeId: string,
  graph: UnifiedGraph,
): { node: NodeSummary | null; incoming: NeighborResult[]; outgoing: NeighborResult[] } {
  return {
    node: summarizeNode(graph.nodesById.get(nodeId) ?? null),
    incoming: (graph.incomingByNode.get(nodeId) ?? []).map((edge) => neighbor(edge, graph, 'incoming')),
    outgoing: (graph.outgoingByNode.get(nodeId) ?? []).map((edge) => neighbor(edge, graph, 'outgoing')),
  }
}

function pathResult(
  sourceNodeId: string,
  targetNodeId: string,
  graph: UnifiedGraph,
  maxDepth: number,
): { pathFound: boolean; pathLength: number; nodes: NodeSummary[]; edges: PathResultEdge[] } {
  if (sourceNodeId === targetNodeId) {
    return {
      pathFound: true,
      pathLength: 0,
      nodes: [summarizeNode(graph.nodesById.get(sourceNodeId) ?? null)].filter((node): node is NodeSummary =>
        Boolean(node),
      ),
      edges: [],
    }
  }

  const queue: Array<{ nodeId: string; edges: UnifiedEdge[] }> = [{ nodeId: sourceNodeId, edges: [] }]
  const visited = new Set<string>([sourceNodeId])
  while (queue.length > 0) {
    const current = queue.shift()
    if (!current || current.edges.length >= maxDepth) continue
    const outgoing = graph.outgoingByNode.get(current.nodeId) ?? []
    for (const edge of outgoing) {
      if (visited.has(edge.to)) continue
      const nextEdges = [...current.edges, edge]
      if (edge.to === targetNodeId) {
        const nodeIds = [sourceNodeId, ...nextEdges.map((entry) => entry.to)]
        return {
          pathFound: true,
          pathLength: nextEdges.length,
          nodes: nodeIds
            .map((nodeId) => summarizeNode(graph.nodesById.get(nodeId) ?? null))
            .filter((node): node is NodeSummary => Boolean(node)),
          edges: nextEdges.map(pathEdge),
        }
      }
      visited.add(edge.to)
      queue.push({ nodeId: edge.to, edges: nextEdges })
    }
  }
  return { pathFound: false, pathLength: 0, nodes: [], edges: [] }
}

function explainResult(nodeId: string, graph: UnifiedGraph): QueryResult extends { explain: infer T } ? T : never {
  const node = graph.nodesById.get(nodeId) ?? null
  const incoming = (graph.incomingByNode.get(nodeId) ?? []).map((edge) => neighbor(edge, graph, 'incoming'))
  const outgoing = (graph.outgoingByNode.get(nodeId) ?? []).map((edge) => neighbor(edge, graph, 'outgoing'))
  const all = [...incoming, ...outgoing]
  const relatedMaintenanceNodes = all.filter((entry) => entry.neighborDomain === 'maintenance')
  const relatedCodeNodes = all.filter((entry) => entry.neighborDomain === 'code')
  const whyRelevant = whyRelevantForNode(node, incoming, outgoing)
  return {
    nodeSummary: summarizeNode(node),
    whyRelevant,
    incomingCount: incoming.length,
    outgoingCount: outgoing.length,
    incomingByEdgeType: countBy(incoming, (entry) => entry.edgeType),
    outgoingByEdgeType: countBy(outgoing, (entry) => entry.edgeType),
    relatedMaintenanceNodes,
    relatedCodeNodes,
    limitations: [
      'Explain mode summarizes supplied source facts only.',
      'No runtime behavior, source execution, dynamic dispatch, or authority decision is proven.',
      'Edges are bounded to immediate incoming and outgoing relationships in v1.',
    ],
  } as QueryResult extends { explain: infer T } ? T : never
}

function whyRelevantForNode(
  node: UnifiedNode | null,
  incoming: NeighborResult[],
  outgoing: NeighborResult[],
): string[] {
  if (!node) return []
  const reasons = [`${node.id} is a ${node.domain} node of kind ${node.kind}.`]
  if (node.sourceFile) reasons.push(`It is grounded in source file ${node.sourceFile}.`)
  const linkedMaintenance = [...incoming, ...outgoing].filter(
    (entry) => entry.sourceArtifact === 'code-symbol-links-validation',
  )
  if (linkedMaintenance.length > 0) {
    reasons.push(`It has ${linkedMaintenance.length} validated maintenance-to-code link(s).`)
  }
  const callers = incoming.filter((entry) => entry.edgeType === 'calls').length
  const callees = outgoing.filter((entry) => entry.edgeType === 'calls').length
  if (callers > 0) reasons.push(`It has ${callers} caller relationship(s).`)
  if (callees > 0) reasons.push(`It calls ${callees} code node(s).`)
  const containers = incoming.filter((entry) => entry.edgeType === 'contains').length
  if (containers > 0) reasons.push('It has parent containment context.')
  return reasons
}

function buildReport(
  codeSubgraph: LoadedArtifact,
  linksValidation: LoadedArtifact | null,
  graphSource: LoadedArtifact | null,
  graph: UnifiedGraph,
  queryMode: string | null,
  options: UnifiedGraphQueryOptions,
  maxDepth: number,
  result: QueryResult,
  findings: UnifiedGraphQueryFinding[],
  blocked: boolean,
): UnifiedGraphQueryReport {
  return {
    schemaVersion: 1,
    artifactRole: REPORT_ROLE,
    status: blocked ? BLOCKED_STATUS : PASSED_STATUS,
    scope: REPORT_SCOPE,
    reportOnly: true,
    sourceFactsOnly: true,
    queryMode,
    queryParameters: {
      node: stringValue(options.node),
      sourceNode: stringValue(options.sourceNode),
      targetNode: stringValue(options.targetNode),
      maxDepth,
    },
    sourceCodeSubgraph: summarizeSource(codeSubgraph),
    sourceCodeSymbolLinksValidation: {
      ...summarizeSource(linksValidation),
      validatedLinkCount: arrayRecords(linksValidation?.record?.validatedLinks).length,
    },
    sourceGraph: summarizeSource(graphSource),
    assembledGraphSummary: {
      nodeCount: graph.nodes.length,
      edgeCount: graph.edges.length,
      codeNodeCount: graph.codeNodeCount,
      maintenanceNodeCount: graph.maintenanceNodeCount,
      linkEdgeCount: graph.linkEdgeCount,
      nodeKinds: countBy(graph.nodes, (node) => node.kind),
      edgeTypes: countBy(graph.edges, (edge) => edge.edgeType),
    },
    result,
    unifiedGraphBoundary: {
      separateCodeGraphCreated: false,
      maintainabilityGraphMutationPlanned: false,
      mutationApplied: false,
      graphSourceMutated: false,
      graphDeltaApplied: false,
      viewTreeGenerated: false,
      contextPackGenerated: false,
    },
    validationFindings: findings,
    sourceArtifactDigests: [codeSubgraph, linksValidation, graphSource]
      .filter((entry): entry is LoadedArtifact => Boolean(entry))
      .map(digestEntry),
    graphifyExecuted: false,
    astExtractorExecuted: false,
    providerInvoked: false,
    networkCallMade: false,
    apiCallMade: false,
    shellCommandsExecuted: false,
    extensionExecutionAllowed: false,
    graphSourceMutated: false,
    graphDeltaApplied: false,
    viewTreeGenerated: false,
    contextPackGenerated: false,
    runtimeEvidenceSatisfied: false,
    evidenceAccepted: false,
    equivalenceProven: false,
    scopeEnforced: false,
    ciEnforcementEnabled: false,
    rbacEnforced: false,
    permissionVerified: false,
    cryptographicSignatureVerified: false,
    enterpriseGateActivated: false,
  }
}

function summarizeSource(source: LoadedArtifact | null): SourceSummary {
  if (!source?.record) {
    return {
      path: null,
      artifactRole: null,
      status: null,
      scope: null,
      sha256: source?.sha256 ?? null,
      byteLength: source?.byteLength ?? null,
      nodeCount: 0,
      edgeCount: 0,
    }
  }
  return {
    path: source.relativePath,
    artifactRole: stringValue(source.record.artifactRole),
    status: stringValue(source.record.status),
    scope: stringValue(source.record.scope ?? source.record.validationScope ?? source.record.codeSubgraphScope),
    sha256: source.sha256,
    byteLength: source.byteLength,
    nodeCount:
      source.sourceKind === 'graph-source'
        ? graphNodeRecords(source.record).length
        : arrayRecords(source.record.nodes).length,
    edgeCount:
      source.sourceKind === 'graph-source'
        ? graphEdgeRecords(source.record).length
        : arrayRecords(source.record.edges).length,
  }
}

async function assertOutputAuthority(
  root: string,
  sourcePaths: string[],
  options: UnifiedGraphQueryOptions,
): Promise<void> {
  const outputPath = resolveRepoPath(root, options.output ?? '')
  const markdownPath = options.markdown ? resolveRepoPath(root, options.markdown) : null
  const outputs = [
    { kind: 'query output', path: outputPath },
    ...(markdownPath ? [{ kind: 'markdown output', path: markdownPath }] : []),
  ]
  const seenOutputs = new Set<string>()
  for (const output of outputs) {
    const key = pathKey(output.path)
    if (seenOutputs.has(key)) {
      throw new Error('Unified graph query output and markdown paths must be different.')
    }
    seenOutputs.add(key)
  }

  const sourceSet = new Set(sourcePaths.map(pathKey))
  for (const output of outputs) {
    const relativeTarget = relativePath(root, output.path)
    if (sourceSet.has(pathKey(output.path))) {
      throw new Error(`Unified graph query ${output.kind} would overwrite a source input: ${relativeTarget}.`)
    }
    if (isProtectedControlPath(root, output.path)) {
      throw new Error(`Unified graph query ${output.kind} is inside a protected control path: ${relativeTarget}.`)
    }
    const existingAuthority = await classifyExistingSourceAuthority(output.path)
    if (existingAuthority) {
      throw new Error(
        `Unified graph query ${output.kind} would overwrite a source-authority-shaped path: ${relativeTarget}.`,
      )
    }
    if (isSourceAuthorityShapedPath(relativeTarget)) {
      throw new Error(
        `Unified graph query ${output.kind} would overwrite a source-authority-shaped path: ${relativeTarget}.`,
      )
    }
  }
}

async function classifyExistingSourceAuthority(filePath: string): Promise<string | null> {
  try {
    const bytes = await readFile(filePath)
    const parsed = JSON.parse(bytes.toString('utf8').replace(/^\uFEFF/, '')) as JsonRecord
    const role = stringValue(parsed.artifactRole)
    if (
      role?.includes('graph-source') ||
      role === REPORT_ROLE ||
      role === CODE_SUBGRAPH_ROLE ||
      role === CODE_SYMBOL_LINK_VALIDATION_ROLE
    ) {
      return `artifactRole ${role}`
    }
    if (asRecord(parsed.sourceRecords)) return 'source-authority-shaped sourceRecords'
    if (Array.isArray(parsed.nodes) && Array.isArray(parsed.edges)) return 'node-edge graph-shaped artifact'
  } catch {
    return null
  }
  return null
}

function renderMarkdown(report: UnifiedGraphQueryReport): string {
  const resultLines =
    'neighbors' in report.result
      ? [
          `- Incoming neighbors: ${report.result.neighbors.incoming.length}`,
          `- Outgoing neighbors: ${report.result.neighbors.outgoing.length}`,
        ]
      : 'path' in report.result
        ? [`- Path found: ${report.result.path.pathFound}`, `- Path length: ${report.result.path.pathLength}`]
        : [
            `- Incoming edges: ${report.result.explain.incomingCount}`,
            `- Outgoing edges: ${report.result.explain.outgoingCount}`,
          ]
  return [
    '# Unified Graph Query',
    '',
    `Status: ${report.status}`,
    `Mode: ${report.queryMode}`,
    `Code subgraph: \`${report.sourceCodeSubgraph.path}\``,
    `Code symbol links validation: \`${report.sourceCodeSymbolLinksValidation.path ?? 'not-supplied'}\``,
    `Graph source: \`${report.sourceGraph.path ?? 'not-supplied'}\``,
    '',
    '## Assembled Graph',
    '',
    `- Nodes: ${report.assembledGraphSummary.nodeCount}`,
    `- Edges: ${report.assembledGraphSummary.edgeCount}`,
    `- Code nodes: ${report.assembledGraphSummary.codeNodeCount}`,
    `- Maintenance nodes: ${report.assembledGraphSummary.maintenanceNodeCount}`,
    `- Link edges: ${report.assembledGraphSummary.linkEdgeCount}`,
    '',
    '## Result',
    '',
    ...resultLines,
    '',
    '## Boundary',
    '',
    '- Separate code graph created: false',
    '- Graph source mutated: false',
    '- Graph delta applied: false',
    '- View Tree generated: false',
    '- Context Pack generated: false',
    '- Provider/network/API called: false',
  ].join('\n')
}

function codeNode(node: JsonRecord): UnifiedNode | null {
  const id = stringValue(node.id ?? node.nodeId)
  const kind = stringValue(node.kind ?? node.nodeKind)
  if (!id || !kind) return null
  return {
    id,
    kind,
    domain: 'code',
    label: stringValue(node.label ?? node.name),
    sourceFile: stringValue(node.sourceFile ?? node.source_file),
    sourceLocation: node.sourceLocation ?? node.source_location ?? null,
    sourceLocationStatus: stringValue(node.sourceLocationStatus),
    confidence: stringValue(node.confidence),
    sourceArtifact: 'code-subgraph',
  }
}

function maintenanceNode(node: JsonRecord, sourceArtifact: SourceKind): UnifiedNode | null {
  const id = stringValue(node.id ?? node.nodeId)
  const kind = stringValue(node.kind ?? node.nodeKind ?? node.type) ?? 'maintenance'
  if (!id) return null
  return {
    id,
    kind,
    domain: 'maintenance',
    label: stringValue(node.label ?? node.name ?? node.title),
    sourceFile: stringValue(node.sourceFile ?? node.source_file),
    sourceLocation: node.sourceLocation ?? node.source_location ?? null,
    sourceLocationStatus: stringValue(node.sourceLocationStatus),
    confidence: stringValue(node.confidence),
    sourceArtifact,
  }
}

function codeEdge(edge: JsonRecord): UnifiedEdge | null {
  const id = stringValue(edge.id ?? edge.edgeId) ?? stableEdgeId(edge)
  const from = stringValue(edge.from ?? edge.source ?? edge.sourceNodeId)
  const to = stringValue(edge.to ?? edge.target ?? edge.targetNodeId)
  const edgeType = stringValue(edge.kind ?? edge.edgeType ?? edge.relation ?? edge.type)
  if (!id || !from || !to || !edgeType) return null
  return {
    id,
    from,
    to,
    edgeType,
    sourceArtifact: 'code-subgraph',
    linkType: null,
    confidence: stringValue(edge.confidence),
    sourceFile: stringValue(edge.sourceFile ?? edge.source_file),
    sourceLocationStatus: stringValue(edge.sourceLocationStatus),
  }
}

function graphSourceEdge(edge: JsonRecord): UnifiedEdge | null {
  const id = stringValue(edge.id ?? edge.edgeId) ?? stableEdgeId(edge)
  const from = stringValue(edge.from ?? edge.source ?? edge.sourceNodeId)
  const to = stringValue(edge.to ?? edge.target ?? edge.targetNodeId)
  const edgeType = stringValue(edge.kind ?? edge.edgeType ?? edge.relation ?? edge.type) ?? 'relates_to'
  if (!id || !from || !to) return null
  return {
    id,
    from,
    to,
    edgeType,
    sourceArtifact: 'graph-source',
    linkType: null,
    confidence: stringValue(edge.confidence),
    sourceFile: stringValue(edge.sourceFile ?? edge.source_file),
    sourceLocationStatus: stringValue(edge.sourceLocationStatus),
  }
}

function linkEdge(link: JsonRecord): UnifiedEdge | null {
  const id = stringValue(link.id)
  const from = stringValue(link.sourceNodeId)
  const to = stringValue(link.targetCodeNodeId)
  const linkType = stringValue(link.linkType)
  if (!id || !from || !to || !linkType) return null
  return {
    id: `code-symbol-link:${id}`,
    from,
    to,
    edgeType: linkType,
    sourceArtifact: 'code-symbol-links-validation',
    linkType,
    confidence: stringValue(link.confidence),
    sourceFile: stringValue(link.sourceFile ?? link.source_file),
    sourceLocationStatus: stringValue(link.sourceLocationStatus),
  }
}

function neighbor(edge: UnifiedEdge, graph: UnifiedGraph, direction: 'incoming' | 'outgoing'): NeighborResult {
  const neighborNodeId = direction === 'incoming' ? edge.from : edge.to
  const neighborNode = graph.nodesById.get(neighborNodeId)
  return {
    direction,
    edgeId: edge.id,
    edgeType: edge.edgeType,
    sourceNodeId: edge.from,
    targetNodeId: edge.to,
    neighborNodeId,
    neighborNodeKind: neighborNode?.kind ?? 'unknown',
    neighborDomain: neighborNode?.domain ?? 'maintenance',
    sourceArtifact: edge.sourceArtifact,
    linkType: edge.linkType,
    confidence: edge.confidence,
  }
}

function summarizeNode(node: UnifiedNode | null): NodeSummary | null {
  if (!node) return null
  return {
    nodeId: node.id,
    nodeKind: node.kind,
    domain: node.domain,
    label: node.label,
    sourceFile: node.sourceFile,
    sourceLocation: node.sourceLocation,
    sourceLocationStatus: node.sourceLocationStatus,
    confidence: node.confidence,
    sourceArtifact: node.sourceArtifact,
  }
}

function pathEdge(edge: UnifiedEdge): PathResultEdge {
  return {
    edgeId: edge.id,
    edgeType: edge.edgeType,
    from: edge.from,
    to: edge.to,
    sourceArtifact: edge.sourceArtifact,
    linkType: edge.linkType,
  }
}

function emptyResult(mode: string | null): QueryResult {
  if (mode === 'path') return { path: { pathFound: false, pathLength: 0, nodes: [], edges: [] } }
  if (mode === 'explain') {
    return {
      explain: {
        nodeSummary: null,
        whyRelevant: [],
        incomingCount: 0,
        outgoingCount: 0,
        incomingByEdgeType: {},
        outgoingByEdgeType: {},
        relatedMaintenanceNodes: [],
        relatedCodeNodes: [],
        limitations: [],
      },
    }
  }
  return { neighbors: { node: null, incoming: [], outgoing: [] } }
}

function emptyGraph(): UnifiedGraph {
  return {
    nodes: [],
    edges: [],
    nodesById: new Map(),
    incomingByNode: new Map(),
    outgoingByNode: new Map(),
    codeNodeCount: 0,
    maintenanceNodeCount: 0,
    linkEdgeCount: 0,
  }
}

function graphNodeRecords(record: JsonRecord | null): JsonRecord[] {
  if (!record) return []
  const sourceRecords = asRecord(record.sourceRecords)
  const graph = asRecord(record.graph)
  return firstNonEmptyRecords(record.nodes, sourceRecords?.nodes, graph?.nodes, record.records)
}

function graphEdgeRecords(record: JsonRecord | null): JsonRecord[] {
  if (!record) return []
  const sourceRecords = asRecord(record.sourceRecords)
  const graph = asRecord(record.graph)
  return firstNonEmptyRecords(record.edges, sourceRecords?.edges, graph?.edges)
}

function firstNonEmptyRecords(...values: unknown[]): JsonRecord[] {
  for (const value of values) {
    const records = arrayRecords(value)
    if (records.length > 0) return records
  }
  return []
}

function collectUnsafeAuthorityHits(
  value: unknown,
  pathParts: string[] = [],
  seen = new Set<unknown>(),
): Array<{ field: string }> {
  if (!value || typeof value !== 'object') return []
  if (seen.has(value)) return []
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
  if (!value || typeof value !== 'object') return []
  if (seen.has(value)) return []
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
  const record = asRecord(value)
  if (record) return Object.keys(record).length > 0
  return value === true
}

function sourceInputPaths(root: string, options: UnifiedGraphQueryOptions): string[] {
  return [options.codeSubgraph, options.codeSymbolLinksValidation, options.graphSource]
    .filter((entry): entry is string => Boolean(entry))
    .map((entry) => resolveRepoPath(root, entry))
}

function normalizeMode(mode: string | undefined): string | null {
  return mode?.trim().toLowerCase() || null
}

function normalizeMaxDepth(maxDepth: number | undefined): number {
  if (typeof maxDepth !== 'number' || !Number.isFinite(maxDepth)) return DEFAULT_MAX_DEPTH
  return Math.trunc(maxDepth)
}

function stableEdgeId(edge: JsonRecord): string {
  const from = stringValue(edge.from ?? edge.source ?? edge.sourceNodeId) ?? 'unknown-source'
  const to = stringValue(edge.to ?? edge.target ?? edge.targetNodeId) ?? 'unknown-target'
  const kind = stringValue(edge.kind ?? edge.edgeType ?? edge.relation ?? edge.type) ?? 'unknown-edge'
  return `edge:${kind}:${from}->${to}`
}

function digestEntry(source: LoadedArtifact): UnifiedGraphQueryReport['sourceArtifactDigests'][number] {
  return {
    sourceKind: source.sourceKind,
    sourcePath: source.relativePath,
    sha256: source.sha256,
    byteLength: source.byteLength,
  }
}

function blocker(code: string, message: string, field?: string, pathValue?: string): UnifiedGraphQueryFinding {
  return { severity: 'blocker', code, message, field, path: pathValue }
}

function warning(code: string, message: string, field?: string, pathValue?: string): UnifiedGraphQueryFinding {
  return { severity: 'warning', code, message, field, path: pathValue }
}

function arrayRecords(value: unknown): JsonRecord[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is JsonRecord => Boolean(entry) && typeof entry === 'object' && !Array.isArray(entry))
    : []
}

function asRecord(value: unknown): JsonRecord | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as JsonRecord) : null
}

function stringValue(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null
}

function countBy<T>(values: T[], key: (value: T) => string): Record<string, number> {
  const result: Record<string, number> = {}
  for (const value of values) {
    const name = key(value)
    result[name] = (result[name] ?? 0) + 1
  }
  return Object.fromEntries(Object.entries(result).sort(([left], [right]) => left.localeCompare(right)))
}

function compareNodes(left: UnifiedNode, right: UnifiedNode): number {
  return left.id.localeCompare(right.id)
}

function compareEdges(left: UnifiedEdge, right: UnifiedEdge): number {
  return (
    left.from.localeCompare(right.from) ||
    left.to.localeCompare(right.to) ||
    left.edgeType.localeCompare(right.edgeType) ||
    left.id.localeCompare(right.id)
  )
}

function resolveRepoPath(root: string, filePath: string): string {
  return path.isAbsolute(filePath) ? filePath : path.join(root, filePath)
}

function pathKey(filePath: string): string {
  return path.resolve(filePath).replaceAll('\\', '/').toLowerCase()
}

function normalizePath(value: string): string {
  return value.replace(/\\/g, '/').toLowerCase()
}

function isSourceAuthorityShapedPath(filePath: string): boolean {
  const normalized = normalizePath(filePath)
  return (
    normalized.includes('/graph-source') ||
    normalized.includes('/source-authority') ||
    normalized.includes('/read-model') ||
    normalized.endsWith('maintainability-graph.json')
  )
}

function isProtectedControlPath(root: string, filePath: string): boolean {
  const relative = relativePath(root, filePath)
  return (
    hasDevViewControlDirectory(relative) ||
    hasCodexControlDirectory(relative) ||
    hasHiddenControlDirectorySegment(relative)
  )
}
