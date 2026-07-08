import { createHash } from 'node:crypto'
import path from 'node:path'
import { readFile } from 'node:fs/promises'
import { relativePath, writeJsonAtomic, writeTextAtomic } from './fs.js'
import {
  hasCodexControlDirectory,
  hasDevViewControlDirectory,
  hasHiddenControlDirectorySegment,
} from './path-safety.js'
import {
  CodeSubgraphValidationError,
  type CodeSubgraphValidationReport,
  validateCodeSubgraphRecord,
} from './code-subgraph-validation.js'

type JsonRecord = Record<string, unknown>

const REPORT_ROLE = 'devview-graphify-code-subgraph-import-report'
const PASSED_STATUS = 'devview-graphify-code-subgraph-import-passed'
const BLOCKED_STATUS = 'devview-graphify-code-subgraph-import-blocked'
const REPORT_SCOPE = 'graphify-export-to-devview-code-subgraph-static-import-report-only'
const CODE_SUBGRAPH_ROLE = 'devview-code-subgraph'
const CODE_SUBGRAPH_STATUS = 'devview-code-subgraph-supplied'
const CODE_SUBGRAPH_SCOPE = 'code-subgraph-source-fact-only'

const confidenceValues = ['extracted', 'inferred', 'ambiguous'] as const

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

const nodeKindMap: Record<string, string> = {
  file: 'file',
  source_file: 'file',
  module: 'module',
  namespace: 'module',
  package: 'package',
  class: 'class',
  interface: 'interface',
  type: 'type',
  type_alias: 'type',
  typedef: 'type',
  enum: 'type',
  function: 'function',
  fn: 'function',
  procedure: 'function',
  method: 'method',
  member_function: 'method',
  constructor: 'method',
  field: 'field',
  property: 'field',
  component: 'component',
  react_component: 'component',
  route: 'route',
  test: 'test',
  spec: 'test',
  config: 'config',
  configuration: 'config',
  external_dependency: 'external_dependency',
  dependency: 'external_dependency',
  library: 'external_dependency',
  external: 'external_dependency',
}

const edgeTypeMap: Record<string, { kind: string; invert?: true }> = {
  contains: { kind: 'contains' },
  contains_symbol: { kind: 'contains' },
  declares: { kind: 'contains' },
  parent_of: { kind: 'contains' },
  defined_in: { kind: 'contains', invert: true },
  belongs_to: { kind: 'contains', invert: true },
  member_of: { kind: 'contains', invert: true },
  imports: { kind: 'imports' },
  import: { kind: 'imports' },
  imports_from: { kind: 'imports_from' },
  re_exports: { kind: 're_exports' },
  reexports: { kind: 're_exports' },
  calls: { kind: 'calls' },
  call: { kind: 'calls' },
  references: { kind: 'references' },
  reference: { kind: 'references' },
  uses: { kind: 'references' },
  usage: { kind: 'references' },
  inherits: { kind: 'inherits' },
  extends: { kind: 'inherits' },
  implements: { kind: 'implements' },
  constructs: { kind: 'constructs' },
  instantiates: { kind: 'constructs' },
  new: { kind: 'constructs' },
  reads: { kind: 'reads' },
  read: { kind: 'reads' },
  writes: { kind: 'writes' },
  write: { kind: 'writes' },
  mutates: { kind: 'writes' },
  parameter_type: { kind: 'parameter_type' },
  param_type: { kind: 'parameter_type' },
  return_type: { kind: 'return_type' },
  returns: { kind: 'return_type' },
  tested_by: { kind: 'tested_by' },
  covers: { kind: 'covers' },
  test_covers: { kind: 'covers' },
  documents: { kind: 'documents' },
  configures: { kind: 'configures' },
  depends_on: { kind: 'depends_on' },
  dependency: { kind: 'depends_on' },
  requires: { kind: 'depends_on' },
}

export interface GraphifyCodeSubgraphImportOptions {
  graphifyExport?: string
  output?: string
  validationOutput?: string
  markdown?: string
}

export interface GraphifyCodeSubgraphImportFinding {
  severity: 'blocker' | 'warning' | 'satisfied'
  code: string
  message: string
  field?: string
  path?: string
}

export interface GraphifyCodeSubgraphImportReport extends JsonRecord {
  schemaVersion: 1
  artifactRole: typeof REPORT_ROLE
  status: typeof PASSED_STATUS | typeof BLOCKED_STATUS
  importScope: typeof REPORT_SCOPE
  sourceFactsOnly: true
  reportOnly: true
  sourceGraphifyExport: {
    path: string
    exportId: string | null
    sha256: string | null
    byteLength: number | null
    nodeCount: number
    edgeCount: number
  }
  outputCodeSubgraph: {
    path: string
    artifactRole: typeof CODE_SUBGRAPH_ROLE
    status: typeof CODE_SUBGRAPH_STATUS
    scope: typeof CODE_SUBGRAPH_SCOPE
    nodeCount: number
    edgeCount: number
  }
  validationOutput: {
    path: string
    status: string | null
    codeSubgraphValidationStatus: string | null
  }
  mappingSummary: {
    mappedNodeCount: number
    mappedEdgeCount: number
    nodeKindCounts: Record<string, number>
    edgeTypeCounts: Record<string, number>
    nodeIdMappings: Array<{ graphifyNodeId: string; devviewNodeId: string; kind: string }>
    edgeIdMappings: Array<{ graphifyEdgeId: string; devviewEdgeId: string; kind: string }>
  }
  importFindings: GraphifyCodeSubgraphImportFinding[]
  downstreamActionPlan: string[]
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
  writtenCodeSubgraphPath?: string
  writtenValidationOutputPath?: string
  writtenMarkdownPath?: string
}

interface LoadedGraphifyExport {
  requestedPath: string
  resolvedPath: string
  relativePath: string
  record: JsonRecord | null
  sha256: string | null
  byteLength: number | null
  readError: string | null
}

interface ConvertedNode {
  graphifyNodeId: string
  devviewNodeId: string
  kind: string
  sourceFile: string
  record: JsonRecord
}

interface ConvertedEdge {
  graphifyEdgeId: string
  devviewEdgeId: string
  kind: string
  record: JsonRecord
}

interface ConversionResult {
  codeSubgraph: JsonRecord
  findings: GraphifyCodeSubgraphImportFinding[]
  convertedNodes: ConvertedNode[]
  convertedEdges: ConvertedEdge[]
  sourceNodeCount: number
  sourceEdgeCount: number
}

export class GraphifyCodeSubgraphImportError extends Error {
  readonly report: GraphifyCodeSubgraphImportReport

  constructor(report: GraphifyCodeSubgraphImportReport) {
    super('Graphify code subgraph static import is blocked.')
    this.report = report
  }
}

export async function importGraphifyCodeSubgraphFile(
  root: string,
  options: GraphifyCodeSubgraphImportOptions,
): Promise<GraphifyCodeSubgraphImportReport> {
  validateRequiredOptions(options)
  const sourcePath = resolveRepoPath(root, options.graphifyExport ?? '')
  await assertOutputAuthority(root, [sourcePath], options)

  const source = await loadGraphifyExport(root, options.graphifyExport ?? '')
  const conversion = convertGraphifyExport(source)
  let blocked = conversion.findings.some((finding) => finding.severity === 'blocker')
  let validationReport: CodeSubgraphValidationReport | null = null

  if (!blocked) {
    try {
      validationReport = validateCodeSubgraphRecord(root, options.output ?? '', conversion.codeSubgraph)
    } catch (error) {
      blocked = true
      if (error instanceof CodeSubgraphValidationError) {
        conversion.findings.push(
          ...error.report.validationFindings.map((finding) =>
            blocker(
              `GRAPHIFY_CODE_SUBGRAPH_${finding.code}`,
              `Generated code subgraph failed validation: ${finding.message}`,
              finding.field,
              finding.path,
            ),
          ),
        )
        validationReport = error.report
      } else {
        conversion.findings.push(
          blocker(
            'GRAPHIFY_CODE_SUBGRAPH_VALIDATION_FAILED',
            error instanceof Error ? error.message : String(error),
            undefined,
            options.output,
          ),
        )
      }
    }
  }

  if (blocked) {
    throw new GraphifyCodeSubgraphImportError(buildReport(root, source, conversion, validationReport, true, options))
  }

  const outputPath = resolveRepoPath(root, options.output ?? '')
  const validationOutputPath = resolveRepoPath(root, options.validationOutput ?? '')
  await writeJsonAtomic(outputPath, conversion.codeSubgraph)
  if (validationReport) {
    validationReport.writtenOutputPath = relativePath(root, validationOutputPath)
    await writeJsonAtomic(validationOutputPath, validationReport)
  }

  const report = buildReport(root, source, conversion, validationReport, false, options)
  report.writtenCodeSubgraphPath = relativePath(root, outputPath)
  report.writtenValidationOutputPath = relativePath(root, validationOutputPath)
  if (options.markdown) {
    const markdownPath = resolveRepoPath(root, options.markdown)
    await writeTextAtomic(markdownPath, renderMarkdown(report))
    report.writtenMarkdownPath = relativePath(root, markdownPath)
  }
  return report
}

function validateRequiredOptions(options: GraphifyCodeSubgraphImportOptions): void {
  if (!options.graphifyExport) {
    throw new Error('graph import-graphify-code-subgraph requires --graphify <file> or --graphify-export <file>.')
  }
  if (!options.output) {
    throw new Error('graph import-graphify-code-subgraph requires --output <devview-code-subgraph.json>.')
  }
  if (!options.validationOutput) {
    throw new Error('graph import-graphify-code-subgraph requires --validation-output <validation.json>.')
  }
}

async function loadGraphifyExport(root: string, requestedPath: string): Promise<LoadedGraphifyExport> {
  const resolvedPath = resolveRepoPath(root, requestedPath)
  try {
    const bytes = await readFile(resolvedPath)
    return {
      requestedPath,
      resolvedPath,
      relativePath: relativePath(root, resolvedPath),
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
      record: null,
      sha256: null,
      byteLength: null,
      readError: error instanceof Error ? error.message : String(error),
    }
  }
}

function convertGraphifyExport(source: LoadedGraphifyExport): ConversionResult {
  const findings: GraphifyCodeSubgraphImportFinding[] = []
  const convertedNodes: ConvertedNode[] = []
  const convertedEdges: ConvertedEdge[] = []
  const record = source.record

  if (!record) {
    findings.push(
      blocker(
        'GRAPHIFY_CODE_SUBGRAPH_EXPORT_READ_FAILED',
        `Could not read Graphify export: ${source.readError}`,
        undefined,
        source.relativePath,
      ),
    )
    return emptyConversion(findings)
  }

  for (const hit of collectUnsafeAuthorityHits(record)) {
    findings.push(
      blocker(
        'GRAPHIFY_CODE_SUBGRAPH_UNSAFE_SOURCE_AUTHORITY_FLAG',
        `${source.relativePath} contains unsafe report-only flag ${hit.field}: true.`,
        hit.field,
        source.relativePath,
      ),
    )
  }
  for (const hit of collectExecutableInstructionHits(record)) {
    findings.push(
      blocker(
        'GRAPHIFY_CODE_SUBGRAPH_EXECUTABLE_INSTRUCTION_DECLARED',
        `${source.relativePath} contains executable/provider/network instruction field ${hit.field}.`,
        hit.field,
        source.relativePath,
      ),
    )
  }

  validateCollectionShape(record, source.relativePath, findings)
  const graphifyNodes = recordsFromCollection(record.nodes ?? record.graphNodes)
  const graphifyEdges = recordsFromCollection(record.edges ?? record.graphEdges)

  if (graphifyNodes.length === 0) {
    findings.push(
      blocker(
        'GRAPHIFY_CODE_SUBGRAPH_NO_NODES',
        `${source.relativePath} must contain at least one static Graphify node.`,
        'nodes',
        source.relativePath,
      ),
    )
  }

  const seenGraphifyNodeIds = new Set<string>()
  const nodeByGraphifyId = new Map<string, ConvertedNode>()
  for (const [index, entry] of graphifyNodes.entries()) {
    const prefix = `nodes[${index}]`
    const graphifyNodeId = stringValue(entry.id) ?? stringValue(entry.nodeId) ?? stringValue(entry.key)
    if (!graphifyNodeId) {
      findings.push(blocker('GRAPHIFY_CODE_SUBGRAPH_NODE_ID_MISSING', `${prefix}.id is required.`, `${prefix}.id`))
      continue
    }
    if (seenGraphifyNodeIds.has(normalize(graphifyNodeId))) {
      findings.push(
        blocker(
          'GRAPHIFY_CODE_SUBGRAPH_NODE_ID_DUPLICATE',
          `Graphify node id is duplicated: ${graphifyNodeId}.`,
          `${prefix}.id`,
          source.relativePath,
        ),
      )
      continue
    }
    seenGraphifyNodeIds.add(normalize(graphifyNodeId))

    const rawKind = graphifyKind(entry)
    const mappedKind = rawKind ? nodeKindMap[normalizeToken(rawKind)] : null
    if (!rawKind || !mappedKind) {
      findings.push(
        blocker(
          'GRAPHIFY_CODE_SUBGRAPH_NODE_KIND_UNMAPPED',
          `Graphify ${prefix}.kind could not be mapped to DevView code node vocabulary: ${rawKind || 'missing'}.`,
          `${prefix}.kind`,
          source.relativePath,
        ),
      )
      continue
    }

    const sourceFile = sourceFileFor(entry)
    if (!sourceFile) {
      findings.push(
        blocker(
          'GRAPHIFY_CODE_SUBGRAPH_NODE_SOURCE_FILE_MISSING',
          `Graphify ${prefix} cannot become a DevView code node without sourceFile/sourcePath/file provenance.`,
          `${prefix}.sourceFile`,
          source.relativePath,
        ),
      )
      continue
    }

    const devviewNodeId = `code.${sanitizeId(graphifyNodeId)}`
    const converted: ConvertedNode = {
      graphifyNodeId,
      devviewNodeId,
      kind: mappedKind,
      sourceFile,
      record: {
        id: devviewNodeId,
        kind: mappedKind,
        label:
          stringValue(entry.label) ?? stringValue(entry.name) ?? stringValue(entry.qualifiedName) ?? graphifyNodeId,
        sourceFile,
        ...locationFields(entry),
        sourceDigest: sourceDigestFor(entry, source.sha256),
        confidence: confidenceFor(entry),
        extractor: 'graphify-static-import',
        sourceGraphifyNodeId: graphifyNodeId,
        sourceGraphifyNodeKind: rawKind,
      },
    }
    convertedNodes.push(converted)
    nodeByGraphifyId.set(normalize(graphifyNodeId), converted)
  }

  const seenGraphifyEdgeIds = new Set<string>()
  const seenDevviewEdgeIds = new Set<string>()
  for (const [index, entry] of graphifyEdges.entries()) {
    const prefix = `edges[${index}]`
    const rawFrom = endpointValue(entry, ['from', 'source', 'sourceId', 'sourceNodeId', 'sourceNode'])
    const rawTo = endpointValue(entry, ['to', 'target', 'targetId', 'targetNodeId', 'targetNode'])
    const rawKind = graphifyKind(entry)
    const mapping = rawKind ? edgeTypeMap[normalizeToken(rawKind)] : null
    const baseGraphifyEdgeId =
      stringValue(entry.id) ??
      stringValue(entry.edgeId) ??
      stringValue(entry.key) ??
      [rawFrom, rawKind, rawTo].filter(Boolean).join('->')
    const graphifyEdgeId = baseGraphifyEdgeId || `edge-${index + 1}`

    if (!baseGraphifyEdgeId) {
      findings.push(
        warning(
          'GRAPHIFY_CODE_SUBGRAPH_EDGE_ID_SYNTHESIZED',
          `Graphify ${prefix}.id is missing; a deterministic import id was synthesized.`,
          `${prefix}.id`,
          source.relativePath,
        ),
      )
    }
    if (seenGraphifyEdgeIds.has(normalize(graphifyEdgeId))) {
      findings.push(
        blocker(
          'GRAPHIFY_CODE_SUBGRAPH_EDGE_ID_DUPLICATE',
          `Graphify edge id is duplicated: ${graphifyEdgeId}.`,
          `${prefix}.id`,
          source.relativePath,
        ),
      )
      continue
    }
    seenGraphifyEdgeIds.add(normalize(graphifyEdgeId))

    if (!rawFrom || !rawTo) {
      findings.push(
        blocker(
          'GRAPHIFY_CODE_SUBGRAPH_EDGE_ENDPOINT_MISSING',
          `Graphify ${prefix} must include source/from and target/to node ids.`,
          `${prefix}.source`,
          source.relativePath,
        ),
      )
      continue
    }
    if (!rawKind || !mapping) {
      findings.push(
        blocker(
          'GRAPHIFY_CODE_SUBGRAPH_EDGE_TYPE_UNMAPPED',
          `Graphify ${prefix}.relation could not be mapped to DevView code edge vocabulary: ${rawKind || 'missing'}.`,
          `${prefix}.relation`,
          source.relativePath,
        ),
      )
      continue
    }

    const sourceNode = nodeByGraphifyId.get(normalize(mapping.invert ? rawTo : rawFrom))
    const targetNode = nodeByGraphifyId.get(normalize(mapping.invert ? rawFrom : rawTo))
    if (!sourceNode || !targetNode) {
      findings.push(
        blocker(
          'GRAPHIFY_CODE_SUBGRAPH_EDGE_ENDPOINT_UNMAPPED',
          `Graphify ${prefix} references nodes that were not converted: ${rawFrom} -> ${rawTo}.`,
          `${prefix}.source`,
          source.relativePath,
        ),
      )
      continue
    }

    const sourceFile = sourceFileFor(entry) ?? sourceNode.sourceFile ?? targetNode.sourceFile
    if (!sourceFile) {
      findings.push(
        blocker(
          'GRAPHIFY_CODE_SUBGRAPH_EDGE_SOURCE_FILE_MISSING',
          `Graphify ${prefix} cannot become a DevView code edge without sourceFile/sourcePath/file provenance.`,
          `${prefix}.sourceFile`,
          source.relativePath,
        ),
      )
      continue
    }

    const devviewEdgeIdBase = `code-edge.${sanitizeId(graphifyEdgeId)}`
    const devviewEdgeId = uniqueId(devviewEdgeIdBase, seenDevviewEdgeIds)
    const converted: ConvertedEdge = {
      graphifyEdgeId,
      devviewEdgeId,
      kind: mapping.kind,
      record: {
        id: devviewEdgeId,
        from: sourceNode.devviewNodeId,
        to: targetNode.devviewNodeId,
        kind: mapping.kind,
        sourceFile,
        ...locationFields(entry),
        sourceDigest: sourceDigestFor(entry, source.sha256),
        confidence: confidenceFor(entry),
        extractor: 'graphify-static-import',
        sourceGraphifyEdgeId: graphifyEdgeId,
        sourceGraphifyEdgeKind: rawKind,
      },
    }
    convertedEdges.push(converted)
  }

  if (findings.every((finding) => finding.severity !== 'blocker')) {
    findings.push({
      severity: 'satisfied',
      code: 'GRAPHIFY_CODE_SUBGRAPH_IMPORTED',
      message: 'Static Graphify export was converted into a DevView code subgraph source fact.',
      path: source.relativePath,
    })
  }

  return {
    codeSubgraph: {
      schemaVersion: 1,
      artifactRole: CODE_SUBGRAPH_ROLE,
      status: CODE_SUBGRAPH_STATUS,
      scope: CODE_SUBGRAPH_SCOPE,
      importSource: 'graphify-static-export',
      sourceGraphifyExport: {
        path: source.relativePath,
        exportId: stringValue(record.exportId) ?? stringValue(record.id),
        sha256: source.sha256,
        byteLength: source.byteLength,
      },
      nodes: convertedNodes.map((node) => node.record),
      edges: convertedEdges.map((edge) => edge.record),
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
    },
    findings,
    convertedNodes,
    convertedEdges,
    sourceNodeCount: graphifyNodes.length,
    sourceEdgeCount: graphifyEdges.length,
  }
}

function emptyConversion(findings: GraphifyCodeSubgraphImportFinding[]): ConversionResult {
  return {
    codeSubgraph: {
      schemaVersion: 1,
      artifactRole: CODE_SUBGRAPH_ROLE,
      status: CODE_SUBGRAPH_STATUS,
      scope: CODE_SUBGRAPH_SCOPE,
      nodes: [],
      edges: [],
      graphifyExecuted: false,
      astExtractorExecuted: false,
      providerInvoked: false,
      networkCallMade: false,
      apiCallMade: false,
      shellCommandsExecuted: false,
      extensionExecutionAllowed: false,
      graphSourceMutated: false,
      graphDeltaApplied: false,
    },
    findings,
    convertedNodes: [],
    convertedEdges: [],
    sourceNodeCount: 0,
    sourceEdgeCount: 0,
  }
}

function buildReport(
  root: string,
  source: LoadedGraphifyExport,
  conversion: ConversionResult,
  validationReport: CodeSubgraphValidationReport | null,
  blocked: boolean,
  options: GraphifyCodeSubgraphImportOptions,
): GraphifyCodeSubgraphImportReport {
  const record = source.record ?? {}
  return {
    schemaVersion: 1,
    artifactRole: REPORT_ROLE,
    status: blocked ? BLOCKED_STATUS : PASSED_STATUS,
    importScope: REPORT_SCOPE,
    sourceFactsOnly: true,
    reportOnly: true,
    sourceGraphifyExport: {
      path: source.relativePath,
      exportId: stringValue(record.exportId) ?? stringValue(record.id),
      sha256: source.sha256,
      byteLength: source.byteLength,
      nodeCount: conversion.sourceNodeCount,
      edgeCount: conversion.sourceEdgeCount,
    },
    outputCodeSubgraph: {
      path: options.output ? relativePath(root, resolveRepoPath(root, options.output)) : '',
      artifactRole: CODE_SUBGRAPH_ROLE,
      status: CODE_SUBGRAPH_STATUS,
      scope: CODE_SUBGRAPH_SCOPE,
      nodeCount: conversion.convertedNodes.length,
      edgeCount: conversion.convertedEdges.length,
    },
    validationOutput: {
      path: options.validationOutput ? relativePath(root, resolveRepoPath(root, options.validationOutput)) : '',
      status: validationReport?.status ?? null,
      codeSubgraphValidationStatus: validationReport?.codeSubgraphValidationStatus ?? null,
    },
    mappingSummary: {
      mappedNodeCount: conversion.convertedNodes.length,
      mappedEdgeCount: conversion.convertedEdges.length,
      nodeKindCounts: countBy(conversion.convertedNodes, (entry) => entry.kind),
      edgeTypeCounts: countBy(conversion.convertedEdges, (entry) => entry.kind),
      nodeIdMappings: conversion.convertedNodes.map((entry) => ({
        graphifyNodeId: entry.graphifyNodeId,
        devviewNodeId: entry.devviewNodeId,
        kind: entry.kind,
      })),
      edgeIdMappings: conversion.convertedEdges.map((entry) => ({
        graphifyEdgeId: entry.graphifyEdgeId,
        devviewEdgeId: entry.devviewEdgeId,
        kind: entry.kind,
      })),
    },
    importFindings: conversion.findings,
    downstreamActionPlan: blocked
      ? [
          'Fix blocking Graphify export shape, vocabulary mapping, endpoint, provenance, or report-only safety findings, then rerun static import.',
        ]
      : [
          'Use the written devview-code-subgraph artifact and validation report as source facts for a future unified Maintainability Graph merge plan.',
          'Do not treat this import as live Graphify execution, native AST extraction, graph-source mutation, View Tree generation, or evidence acceptance.',
        ],
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

async function assertOutputAuthority(
  root: string,
  sourcePaths: string[],
  options: GraphifyCodeSubgraphImportOptions,
): Promise<void> {
  const outputPath = resolveRepoPath(root, options.output ?? '')
  const validationOutputPath = resolveRepoPath(root, options.validationOutput ?? '')
  const markdownPath = options.markdown ? resolveRepoPath(root, options.markdown) : null
  const outputs = [
    { kind: 'code subgraph output', path: outputPath },
    { kind: 'validation output', path: validationOutputPath },
    ...(markdownPath ? [{ kind: 'markdown output', path: markdownPath }] : []),
  ]
  const seenOutputs = new Set<string>()
  for (const output of outputs) {
    const key = pathKey(output.path)
    if (seenOutputs.has(key)) {
      throw new Error('Graphify code subgraph import outputs must be different paths.')
    }
    seenOutputs.add(key)
  }

  const sourceSet = new Set(sourcePaths.map(pathKey))
  for (const output of outputs) {
    const relativeTarget = relativePath(root, output.path)
    if (sourceSet.has(pathKey(output.path))) {
      throw new Error(`Graphify code subgraph import ${output.kind} would overwrite a source input: ${relativeTarget}.`)
    }
    if (isProtectedControlPath(root, output.path)) {
      throw new Error(
        `Graphify code subgraph import ${output.kind} is inside a protected control path: ${relativeTarget}.`,
      )
    }
    const existingAuthority = await classifyExistingSourceAuthority(output.path)
    if (existingAuthority) {
      throw new Error(
        `Graphify code subgraph import ${output.kind} would overwrite a source-authority-shaped path: ${relativeTarget}.`,
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
      role === CODE_SUBGRAPH_ROLE ||
      role === REPORT_ROLE ||
      role === 'devview-code-subgraph-validation-report'
    ) {
      return `artifactRole ${role}`
    }
    if (asRecord(parsed.sourceRecords)) {
      return 'source-authority-shaped sourceRecords'
    }
    if (Array.isArray(parsed.nodes) && Array.isArray(parsed.edges)) {
      return 'node-edge graph-shaped artifact'
    }
  } catch {
    return null
  }
  return null
}

function renderMarkdown(report: GraphifyCodeSubgraphImportReport): string {
  return [
    '# Graphify Code Subgraph Import',
    '',
    `Status: ${report.status}`,
    `Graphify export: \`${report.sourceGraphifyExport.path}\``,
    `Code subgraph: \`${report.writtenCodeSubgraphPath ?? report.outputCodeSubgraph.path}\``,
    `Validation output: \`${report.writtenValidationOutputPath ?? report.validationOutput.path}\``,
    '',
    '## Summary',
    '',
    `- Nodes: ${report.mappingSummary.mappedNodeCount}/${report.sourceGraphifyExport.nodeCount}`,
    `- Edges: ${report.mappingSummary.mappedEdgeCount}/${report.sourceGraphifyExport.edgeCount}`,
    `- Node kinds: ${formatCounts(report.mappingSummary.nodeKindCounts)}`,
    `- Edge types: ${formatCounts(report.mappingSummary.edgeTypeCounts)}`,
    `- Validation: ${report.validationOutput.codeSubgraphValidationStatus ?? 'not-run'}`,
    '',
    '## Findings',
    '',
    ...report.importFindings.map((finding) => `- ${finding.severity}: ${finding.code} - ${finding.message}`),
    '',
    '## Boundary',
    '',
    '- Graphify executed: false',
    '- AST extractor executed: false',
    '- Provider/API/network called: false',
    '- Graph source mutated: false',
    '- View Tree generated: false',
    '- Evidence accepted: false',
    '- RBAC enforced: false',
  ].join('\n')
}

function validateCollectionShape(
  record: JsonRecord,
  sourcePath: string,
  findings: GraphifyCodeSubgraphImportFinding[],
): void {
  if ('nodes' in record && !Array.isArray(record.nodes) && !asRecord(record.nodes)) {
    findings.push(
      blocker(
        'GRAPHIFY_CODE_SUBGRAPH_EXPORT_SHAPE_INVALID',
        `${sourcePath} nodes must be an array or object collection.`,
        'nodes',
        sourcePath,
      ),
    )
  }
  if ('graphNodes' in record && !Array.isArray(record.graphNodes) && !asRecord(record.graphNodes)) {
    findings.push(
      blocker(
        'GRAPHIFY_CODE_SUBGRAPH_EXPORT_SHAPE_INVALID',
        `${sourcePath} graphNodes must be an array or object collection.`,
        'graphNodes',
        sourcePath,
      ),
    )
  }
  if ('edges' in record && !Array.isArray(record.edges) && !asRecord(record.edges)) {
    findings.push(
      blocker(
        'GRAPHIFY_CODE_SUBGRAPH_EXPORT_SHAPE_INVALID',
        `${sourcePath} edges must be an array or object collection.`,
        'edges',
        sourcePath,
      ),
    )
  }
  if ('graphEdges' in record && !Array.isArray(record.graphEdges) && !asRecord(record.graphEdges)) {
    findings.push(
      blocker(
        'GRAPHIFY_CODE_SUBGRAPH_EXPORT_SHAPE_INVALID',
        `${sourcePath} graphEdges must be an array or object collection.`,
        'graphEdges',
        sourcePath,
      ),
    )
  }
}

function graphifyKind(record: JsonRecord): string | null {
  return (
    stringValue(record.kind) ??
    stringValue(record.nodeKind) ??
    stringValue(record.edgeType) ??
    stringValue(record.relation) ??
    stringValue(record.type) ??
    stringValue(record.category) ??
    stringValue(record.symbolKind)
  )
}

function sourceFileFor(record: JsonRecord): string | null {
  const direct =
    stringValue(record.sourceFile) ??
    stringValue(record.source_file) ??
    stringValue(record.sourcePath) ??
    stringValue(record.filePath) ??
    stringValue(record.file) ??
    stringValue(record.path) ??
    stringValue(record.relativePath)
  if (direct) return direct
  const location = asRecord(record.location) ?? asRecord(record.sourceLocation) ?? asRecord(record.range)
  const located = stringValue(location?.file) ?? stringValue(location?.path) ?? stringValue(location?.sourceFile)
  if (located) return located
  const label = stringValue(record.label) ?? stringValue(record.name)
  return label && looksLikeSourcePath(label) ? label : null
}

function locationFields(record: JsonRecord): JsonRecord {
  const sourceLocation =
    asRecord(record.sourceLocation) ??
    asRecord(record.source_location) ??
    asRecord(record.location) ??
    asRecord(record.range) ??
    lineLocation(record)
  if (sourceLocation) {
    return { sourceLocation }
  }
  return {
    sourceLocationStatus:
      stringValue(record.sourceLocationStatus) ??
      stringValue(record.locationStatus) ??
      'graphify-source-location-not-modeled',
  }
}

function lineLocation(record: JsonRecord): JsonRecord | null {
  const startLine = numberValue(record.startLine) ?? numberValue(record.line)
  if (!startLine) return null
  return {
    startLine,
    startColumn: numberValue(record.startColumn) ?? numberValue(record.column) ?? 1,
    endLine: numberValue(record.endLine) ?? startLine,
    endColumn: numberValue(record.endColumn) ?? numberValue(record.columnEnd) ?? 1,
  }
}

function sourceDigestFor(record: JsonRecord, sourceSha256: string | null): string | undefined {
  return (
    stringValue(record.sourceDigest) ??
    stringValue(record.digest) ??
    (sourceSha256 ? `sha256:${sourceSha256}` : undefined)
  )
}

function confidenceFor(record: JsonRecord): string {
  const raw = stringValue(record.confidence)?.toLowerCase()
  if (raw && confidenceValues.includes(raw as (typeof confidenceValues)[number])) {
    return raw
  }
  if (raw && ['low', 'uncertain', 'maybe'].includes(raw)) return 'ambiguous'
  if (raw && ['medium', 'derived'].includes(raw)) return 'inferred'
  return 'extracted'
}

function endpointValue(record: JsonRecord, fields: string[]): string | null {
  for (const field of fields) {
    const direct = stringValue(record[field])
    if (direct) return direct
    const nested = asRecord(record[field])
    const nestedId = stringValue(nested?.id) ?? stringValue(nested?.nodeId)
    if (nestedId) return nestedId
  }
  return null
}

function recordsFromCollection(value: unknown): JsonRecord[] {
  if (Array.isArray(value)) return value.filter((entry): entry is JsonRecord => asRecord(entry) !== null)
  const record = asRecord(value)
  if (record) return Object.values(record).filter((entry): entry is JsonRecord => asRecord(entry) !== null)
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

function blocker(code: string, message: string, field?: string, pathValue?: string): GraphifyCodeSubgraphImportFinding {
  return { severity: 'blocker', code, message, field, path: pathValue }
}

function warning(code: string, message: string, field?: string, pathValue?: string): GraphifyCodeSubgraphImportFinding {
  return { severity: 'warning', code, message, field, path: pathValue }
}

function countBy<T>(values: T[], key: (value: T) => string): Record<string, number> {
  const result: Record<string, number> = {}
  for (const value of values) {
    const name = key(value)
    result[name] = (result[name] ?? 0) + 1
  }
  return Object.fromEntries(Object.entries(result).sort(([left], [right]) => left.localeCompare(right)))
}

function uniqueId(base: string, seen: Set<string>): string {
  let candidate = base
  let suffix = 2
  while (seen.has(normalize(candidate))) {
    candidate = `${base}.${suffix}`
    suffix += 1
  }
  seen.add(normalize(candidate))
  return candidate
}

function formatCounts(counts: Record<string, number>): string {
  const entries = Object.entries(counts)
  return entries.length === 0 ? 'none' : entries.map(([kind, count]) => `${kind}:${count}`).join(', ')
}

function looksLikeSourcePath(value: string): boolean {
  return /[/\\]/.test(value) || /\.[cm]?[jt]sx?$/.test(value) || /\.(json|css|html|py|go|rs|java|cs|cpp|h)$/.test(value)
}

function asRecord(value: unknown): JsonRecord | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as JsonRecord) : null
}

function stringValue(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null
}

function numberValue(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function normalize(value: string): string {
  return value.replace(/\\/g, '/').toLowerCase()
}

function normalizeToken(value: string): string {
  return normalize(value)
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
}

function sanitizeId(value: string): string {
  return (
    normalize(value)
      .replace(/[^a-z0-9]+/g, '.')
      .replace(/^\.+|\.+$/g, '') || 'unknown'
  )
}

function resolveRepoPath(root: string, filePath: string): string {
  return path.isAbsolute(filePath) ? filePath : path.join(root, filePath)
}

function pathKey(filePath: string): string {
  return path.resolve(filePath).replaceAll('\\', '/').toLowerCase()
}

function isProtectedControlPath(root: string, filePath: string): boolean {
  const relative = relativePath(root, filePath)
  return (
    hasDevViewControlDirectory(relative) ||
    hasCodexControlDirectory(relative) ||
    hasHiddenControlDirectorySegment(relative)
  )
}
