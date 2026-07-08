import { createHash } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { relativePath, writeTextAtomic } from './fs.js'
import {
  hasCodexControlDirectory,
  hasDevViewControlDirectory,
  hasHiddenControlDirectorySegment,
} from './path-safety.js'
import { CodeSubgraphValidationError, validateCodeSubgraphRecord } from './code-subgraph-validation.js'

type JsonRecord = Record<string, unknown>

const REPORT_ROLE = 'devview-code-graph-html-render-report'
const REPORT_STATUS = 'devview-code-graph-html-rendered'
const REPORT_SCOPE = 'code-subgraph-readonly-html-render-report-only'
const HTML_ROLE = 'devview-code-subgraph-html-preview'
const VALIDATION_REPORT_ROLE = 'devview-code-subgraph-validation-report'
const VALIDATION_REPORT_STATUS = 'devview-code-subgraph-validation-passed'

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
  'filesMutated',
  'graphSourceMutated',
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

export interface CodeGraphHtmlRenderOptions {
  codeSubgraph?: string
  codeSubgraphValidation?: string
  output?: string
  markdown?: string
}

export interface CodeGraphHtmlRenderFinding {
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
  sourceKind: 'code-subgraph' | 'code-subgraph-validation'
  record: JsonRecord | null
  sha256: string | null
  byteLength: number | null
  readError: string | null
}

interface RenderNode {
  id: string
  label: string
  kind: string
  sourceFile: string | null
  sourceLocation: unknown
  sourceLocationStatus: string | null
  confidence: string | null
  extractor: string | null
  sourceGraphifyNodeId: string | null
  degree: number
  x: number
  y: number
}

interface RenderEdge {
  id: string
  from: string
  to: string
  kind: string
  sourceFile: string | null
  sourceLocation: unknown
  sourceLocationStatus: string | null
  confidence: string | null
  sourceGraphifyEdgeKind: string | null
}

interface RenderGraphData {
  artifactRole: typeof HTML_ROLE
  status: 'devview-code-subgraph-html-preview-rendered'
  renderScope: 'code-subgraph-readonly-html-inspector'
  sourceCodeSubgraph: {
    path: string
    sha256: string | null
    byteLength: number | null
  }
  sourceCodeSubgraphValidation: {
    path: string | null
    status: string | null
  }
  summary: {
    nodeCount: number
    edgeCount: number
    nodeKindCounts: Record<string, number>
    edgeTypeCounts: Record<string, number>
    graphWidth: number
    graphHeight: number
  }
  nodes: RenderNode[]
  edges: RenderEdge[]
  safetyFlags: {
    readOnlyVisualizationOnly: true
    graphSourceMutated: false
    graphDeltaApplied: false
    viewTreeGenerated: false
    contextPackGenerated: false
    providerInvoked: false
    networkCallMade: false
    apiCallMade: false
    shellCommandsExecuted: false
    rbacEnforced: false
    permissionVerified: false
    cryptographicSignatureVerified: false
    enterpriseGateActivated: false
  }
}

export interface CodeGraphHtmlRenderReport extends JsonRecord {
  schemaVersion: 1
  artifactRole: typeof REPORT_ROLE
  status: typeof REPORT_STATUS | 'devview-code-graph-html-render-blocked'
  renderScope: typeof REPORT_SCOPE
  reportOnly: true
  sourceFactsOnly: true
  sourceCodeSubgraph: {
    path: string | null
    artifactRole: string | null
    status: string | null
    scope: string | null
    sha256: string | null
    byteLength: number | null
    nodeCount: number
    edgeCount: number
  }
  sourceCodeSubgraphValidation: {
    path: string | null
    artifactRole: string | null
    status: string | null
    sha256: string | null
    byteLength: number | null
  }
  htmlSummary: {
    nodeCount: number
    edgeCount: number
    nodeKindCounts: Record<string, number>
    edgeTypeCounts: Record<string, number>
    graphWidth: number
    graphHeight: number
    hasZoomControls: boolean
    hasPanControls: boolean
    hasSelectionInspector: boolean
    nonScalingEdgeStroke: boolean
    inverseScaledNodeGlyphs: boolean
  }
  renderFindings: CodeGraphHtmlRenderFinding[]
  graphifyExecuted: false
  astExtractorExecuted: false
  providerInvoked: false
  networkCallMade: false
  apiCallMade: false
  shellCommandsExecuted: false
  graphSourceMutated: false
  graphDeltaApplied: false
  viewTreeGenerated: false
  contextPackGenerated: false
  rbacEnforced: false
  permissionVerified: false
  cryptographicSignatureVerified: false
  enterpriseGateActivated: false
  writtenHtmlOutputPath?: string
  writtenMarkdownPath?: string
}

export class CodeGraphHtmlRendererError extends Error {
  readonly report: CodeGraphHtmlRenderReport

  constructor(report: CodeGraphHtmlRenderReport) {
    super('Code graph HTML rendering is blocked.')
    this.report = report
  }
}

export async function renderCodeGraphHtmlFile(
  root: string,
  options: CodeGraphHtmlRenderOptions,
): Promise<CodeGraphHtmlRenderReport> {
  validateRequiredOptions(options)
  const codeSubgraph = await loadArtifact(root, options.codeSubgraph ?? '', 'code-subgraph')
  const codeSubgraphValidation = options.codeSubgraphValidation
    ? await loadArtifact(root, options.codeSubgraphValidation, 'code-subgraph-validation')
    : null
  const findings: CodeGraphHtmlRenderFinding[] = []

  validateOutputPaths(
    root,
    options,
    [codeSubgraph, codeSubgraphValidation].filter(Boolean) as LoadedArtifact[],
    findings,
  )
  if (!codeSubgraph.record) {
    findings.push(
      blocker(
        'CODE_GRAPH_HTML_CODE_SUBGRAPH_READ_FAILED',
        `Could not read --code-subgraph: ${codeSubgraph.readError}`,
        'codeSubgraph',
        codeSubgraph.relativePath,
      ),
    )
  } else {
    try {
      validateCodeSubgraphRecord(root, codeSubgraph.requestedPath, codeSubgraph.record)
    } catch (error) {
      if (error instanceof CodeSubgraphValidationError) {
        for (const finding of error.report.validationFindings) {
          if (finding.severity === 'blocker') {
            findings.push(blocker(finding.code, finding.message, finding.field, finding.path))
          }
        }
      } else {
        findings.push(
          blocker(
            'CODE_GRAPH_HTML_CODE_SUBGRAPH_INVALID',
            error instanceof Error ? error.message : String(error),
            'codeSubgraph',
            codeSubgraph.relativePath,
          ),
        )
      }
    }
  }

  if (codeSubgraphValidation) {
    validateCodeSubgraphValidation(codeSubgraphValidation, findings)
  }
  for (const source of [codeSubgraph, codeSubgraphValidation].filter(Boolean) as LoadedArtifact[]) {
    if (!source.record) continue
    for (const hit of collectUnsafeAuthorityHits(source.record)) {
      findings.push(
        blocker(
          'CODE_GRAPH_HTML_UNSAFE_SOURCE_AUTHORITY_FLAG',
          `${source.relativePath} contains unsafe report-only flag ${hit.field}: true.`,
          hit.field,
          source.relativePath,
        ),
      )
    }
    for (const hit of collectExecutableInstructionHits(source.record)) {
      findings.push(
        blocker(
          'CODE_GRAPH_HTML_EXECUTABLE_INSTRUCTION_DECLARED',
          `${source.relativePath} contains executable/provider/network instruction field ${hit.field}.`,
          hit.field,
          source.relativePath,
        ),
      )
    }
  }

  const report = buildReport(root, codeSubgraph, codeSubgraphValidation, findings, null, options)
  if (findings.some((finding) => finding.severity === 'blocker')) {
    report.status = 'devview-code-graph-html-render-blocked'
    throw new CodeGraphHtmlRendererError(report)
  }

  const renderData = buildRenderGraphData(codeSubgraph, codeSubgraphValidation)
  const outputPath = resolveRepoPath(root, options.output ?? '')
  await writeTextAtomic(outputPath, renderHtml(renderData))
  report.writtenHtmlOutputPath = relativePath(root, outputPath)
  report.htmlSummary = renderSummary(renderData)
  if (options.markdown) {
    const markdownPath = resolveRepoPath(root, options.markdown)
    await writeTextAtomic(markdownPath, renderMarkdown(report))
    report.writtenMarkdownPath = relativePath(root, markdownPath)
  }
  return report
}

function validateRequiredOptions(options: CodeGraphHtmlRenderOptions): void {
  if (!options.codeSubgraph) throw new Error('graph render-code-graph-html requires --code-subgraph <file>.')
  if (!options.output) throw new Error('graph render-code-graph-html requires --output <htmlOutputPath>.')
}

async function loadArtifact(
  root: string,
  requestedPath: string,
  sourceKind: LoadedArtifact['sourceKind'],
): Promise<LoadedArtifact> {
  const resolvedPath = resolveRepoPath(root, requestedPath)
  try {
    const bytes = await readFile(resolvedPath)
    const parsed = JSON.parse(bytes.toString('utf8').replace(/^\uFEFF/, '')) as JsonRecord
    return {
      requestedPath,
      resolvedPath,
      relativePath: relativePath(root, resolvedPath),
      sourceKind,
      record: parsed,
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

function validateOutputPaths(
  root: string,
  options: CodeGraphHtmlRenderOptions,
  sources: LoadedArtifact[],
  findings: CodeGraphHtmlRenderFinding[],
): void {
  const outputPath = resolveRepoPath(root, options.output ?? '')
  const outputRelative = relativePath(root, outputPath)
  if (!/\.html?$/i.test(outputPath)) {
    findings.push(
      blocker(
        'CODE_GRAPH_HTML_OUTPUT_EXTENSION_UNSUPPORTED',
        '--output for graph render-code-graph-html must end with .html or .htm.',
        'output',
        outputRelative,
      ),
    )
  }
  for (const source of sources) {
    if (samePath(outputPath, source.resolvedPath)) {
      findings.push(
        blocker(
          'CODE_GRAPH_HTML_OUTPUT_OVERWRITES_SOURCE',
          `--output would overwrite supplied source ${source.relativePath}.`,
          'output',
          outputRelative,
        ),
      )
    }
  }
  if (options.markdown) {
    const markdownPath = resolveRepoPath(root, options.markdown)
    if (samePath(outputPath, markdownPath)) {
      findings.push(
        blocker(
          'CODE_GRAPH_HTML_OUTPUT_MARKDOWN_COLLISION',
          '--output and --markdown must be different files.',
          'markdown',
          relativePath(root, markdownPath),
        ),
      )
    }
  }
  for (const candidate of [outputPath, options.markdown ? resolveRepoPath(root, options.markdown) : null].filter(
    Boolean,
  ) as string[]) {
    const candidateRelative = relativePath(root, candidate)
    if (
      hasDevViewControlDirectory(candidateRelative) ||
      hasCodexControlDirectory(candidateRelative) ||
      hasHiddenControlDirectorySegment(candidateRelative)
    ) {
      findings.push(
        blocker(
          'CODE_GRAPH_HTML_PROTECTED_OUTPUT_PATH',
          `Output path ${candidateRelative} is inside a protected control path.`,
          'output',
          candidateRelative,
        ),
      )
    }
    if (existsSync(candidate)) {
      const existing = readJsonSafeSync(candidate)
      const role = existing ? stringValue(existing.artifactRole) : null
      if (role && (role.includes('graph-source') || role === 'devview-code-subgraph')) {
        findings.push(
          blocker(
            'CODE_GRAPH_HTML_SOURCE_AUTHORITY_SHAPED_OUTPUT',
            `Output path ${candidateRelative} already contains source-authority-shaped JSON.`,
            'output',
            candidateRelative,
          ),
        )
      }
    }
  }
}

function validateCodeSubgraphValidation(source: LoadedArtifact, findings: CodeGraphHtmlRenderFinding[]): void {
  if (!source.record) {
    findings.push(
      blocker(
        'CODE_GRAPH_HTML_VALIDATION_REPORT_READ_FAILED',
        `Could not read --code-subgraph-validation: ${source.readError}`,
        'codeSubgraphValidation',
        source.relativePath,
      ),
    )
    return
  }
  if (stringValue(source.record.artifactRole) !== VALIDATION_REPORT_ROLE) {
    findings.push(
      blocker(
        'CODE_GRAPH_HTML_VALIDATION_REPORT_ROLE_INVALID',
        '--code-subgraph-validation must be a devview-code-subgraph-validation-report.',
        'artifactRole',
        source.relativePath,
      ),
    )
  }
  if (stringValue(source.record.status) !== VALIDATION_REPORT_STATUS) {
    findings.push(
      blocker(
        'CODE_GRAPH_HTML_VALIDATION_REPORT_STATUS_INVALID',
        '--code-subgraph-validation must have status devview-code-subgraph-validation-passed.',
        'status',
        source.relativePath,
      ),
    )
  }
}

function buildRenderGraphData(source: LoadedArtifact, validation: LoadedArtifact | null): RenderGraphData {
  const record = source.record ?? {}
  const rawNodes = arrayOfRecords(record.nodes)
  const rawEdges = arrayOfRecords(record.edges)
  const degreeByNode = new Map<string, number>()
  for (const node of rawNodes) {
    const id = stringValue(node.id)
    if (id) degreeByNode.set(id, 0)
  }
  for (const edge of rawEdges) {
    const from = stringValue(edge.from)
    const to = stringValue(edge.to)
    if (from) degreeByNode.set(from, (degreeByNode.get(from) ?? 0) + 1)
    if (to) degreeByNode.set(to, (degreeByNode.get(to) ?? 0) + 1)
  }

  const kindOrder = sortedUnique(rawNodes.map((node) => stringValue(node.kind) ?? 'unknown'))
  const laneByKind = new Map(kindOrder.map((kind, index) => [kind, index]))
  const indexByKind = new Map<string, number>()
  const laneWidth = 240
  const rowHeight = 52
  const margin = 90
  const nodes: RenderNode[] = rawNodes.map((node) => {
    const id = stringValue(node.id) ?? 'unknown'
    const kind = stringValue(node.kind) ?? 'unknown'
    const lane = laneByKind.get(kind) ?? 0
    const row = indexByKind.get(kind) ?? 0
    indexByKind.set(kind, row + 1)
    return {
      id,
      label: stringValue(node.label) ?? id,
      kind,
      sourceFile: stringValue(node.sourceFile),
      sourceLocation: asRecord(node.sourceLocation) ?? stringValue(node.sourceLocation),
      sourceLocationStatus: stringValue(node.sourceLocationStatus),
      confidence: stringValue(node.confidence),
      extractor: stringValue(node.extractor),
      sourceGraphifyNodeId: stringValue(node.sourceGraphifyNodeId),
      degree: degreeByNode.get(id) ?? 0,
      x: margin + lane * laneWidth,
      y: margin + row * rowHeight,
    }
  })
  const nodeById = new Map(nodes.map((node) => [node.id, node]))
  const edges: RenderEdge[] = rawEdges.map((edge, index) => ({
    id: stringValue(edge.id) ?? `edge-${index + 1}`,
    from: stringValue(edge.from) ?? '',
    to: stringValue(edge.to) ?? '',
    kind: stringValue(edge.kind) ?? 'unknown',
    sourceFile: stringValue(edge.sourceFile),
    sourceLocation: asRecord(edge.sourceLocation) ?? stringValue(edge.sourceLocation),
    sourceLocationStatus: stringValue(edge.sourceLocationStatus),
    confidence: stringValue(edge.confidence),
    sourceGraphifyEdgeKind: stringValue(edge.sourceGraphifyEdgeKind),
  }))
  const maxRows = Math.max(...Array.from(indexByKind.values()), 1)
  const width = Math.max(960, margin * 2 + Math.max(kindOrder.length, 1) * laneWidth)
  const height = Math.max(640, margin * 2 + maxRows * rowHeight)
  return {
    artifactRole: HTML_ROLE,
    status: 'devview-code-subgraph-html-preview-rendered',
    renderScope: 'code-subgraph-readonly-html-inspector',
    sourceCodeSubgraph: {
      path: source.relativePath,
      sha256: source.sha256,
      byteLength: source.byteLength,
    },
    sourceCodeSubgraphValidation: {
      path: validation?.relativePath ?? null,
      status: validation?.record ? stringValue(validation.record.status) : null,
    },
    summary: {
      nodeCount: nodes.length,
      edgeCount: edges.length,
      nodeKindCounts: countBy(nodes, (node) => node.kind),
      edgeTypeCounts: countBy(edges, (edge) => edge.kind),
      graphWidth: width,
      graphHeight: height,
    },
    nodes,
    edges: edges.filter((edge) => nodeById.has(edge.from) && nodeById.has(edge.to)),
    safetyFlags: {
      readOnlyVisualizationOnly: true,
      graphSourceMutated: false,
      graphDeltaApplied: false,
      viewTreeGenerated: false,
      contextPackGenerated: false,
      providerInvoked: false,
      networkCallMade: false,
      apiCallMade: false,
      shellCommandsExecuted: false,
      rbacEnforced: false,
      permissionVerified: false,
      cryptographicSignatureVerified: false,
      enterpriseGateActivated: false,
    },
  }
}

function buildReport(
  root: string,
  codeSubgraph: LoadedArtifact,
  validation: LoadedArtifact | null,
  findings: CodeGraphHtmlRenderFinding[],
  renderData: RenderGraphData | null,
  options: CodeGraphHtmlRenderOptions,
): CodeGraphHtmlRenderReport {
  const record = codeSubgraph.record ?? {}
  const nodes = arrayOfRecords(record.nodes)
  const edges = arrayOfRecords(record.edges)
  return {
    schemaVersion: 1,
    artifactRole: REPORT_ROLE,
    status: REPORT_STATUS,
    renderScope: REPORT_SCOPE,
    reportOnly: true,
    sourceFactsOnly: true,
    sourceCodeSubgraph: {
      path: codeSubgraph.record ? codeSubgraph.relativePath : null,
      artifactRole: stringValue(record.artifactRole),
      status: stringValue(record.status),
      scope: stringValue(record.scope),
      sha256: codeSubgraph.sha256,
      byteLength: codeSubgraph.byteLength,
      nodeCount: nodes.length,
      edgeCount: edges.length,
    },
    sourceCodeSubgraphValidation: {
      path: validation?.record ? validation.relativePath : null,
      artifactRole: validation?.record ? stringValue(validation.record.artifactRole) : null,
      status: validation?.record ? stringValue(validation.record.status) : null,
      sha256: validation?.sha256 ?? null,
      byteLength: validation?.byteLength ?? null,
    },
    htmlSummary: renderData
      ? renderSummary(renderData)
      : {
          nodeCount: nodes.length,
          edgeCount: edges.length,
          nodeKindCounts: countBy(nodes, (node) => stringValue(node.kind) ?? 'unknown'),
          edgeTypeCounts: countBy(edges, (edge) => stringValue(edge.kind) ?? 'unknown'),
          graphWidth: 0,
          graphHeight: 0,
          hasZoomControls: true,
          hasPanControls: true,
          hasSelectionInspector: true,
          nonScalingEdgeStroke: true,
          inverseScaledNodeGlyphs: true,
        },
    renderFindings:
      findings.length > 0
        ? findings
        : [satisfied('CODE_GRAPH_HTML_RENDER_READY', 'Code graph HTML render inputs are valid.')],
    graphifyExecuted: false,
    astExtractorExecuted: false,
    providerInvoked: false,
    networkCallMade: false,
    apiCallMade: false,
    shellCommandsExecuted: false,
    graphSourceMutated: false,
    graphDeltaApplied: false,
    viewTreeGenerated: false,
    contextPackGenerated: false,
    rbacEnforced: false,
    permissionVerified: false,
    cryptographicSignatureVerified: false,
    enterpriseGateActivated: false,
    ...(options.output ? { writtenHtmlOutputPath: relativePath(root, resolveRepoPath(root, options.output)) } : {}),
  }
}

function renderSummary(data: RenderGraphData): CodeGraphHtmlRenderReport['htmlSummary'] {
  return {
    nodeCount: data.summary.nodeCount,
    edgeCount: data.summary.edgeCount,
    nodeKindCounts: data.summary.nodeKindCounts,
    edgeTypeCounts: data.summary.edgeTypeCounts,
    graphWidth: data.summary.graphWidth,
    graphHeight: data.summary.graphHeight,
    hasZoomControls: true,
    hasPanControls: true,
    hasSelectionInspector: true,
    nonScalingEdgeStroke: true,
    inverseScaledNodeGlyphs: true,
  }
}

function renderHtml(data: RenderGraphData): string {
  const json = JSON.stringify(data).replace(/</g, '\\u003c')
  const initialScale = 0.03
  const initialCircleRadius = 7 / initialScale
  const initialLabelX = 11 / initialScale
  const initialLabelY = 4 / initialScale
  const initialLabelSize = 11 / initialScale
  const palette = [
    '#60a5fa',
    '#34d399',
    '#f59e0b',
    '#f472b6',
    '#a78bfa',
    '#2dd4bf',
    '#f87171',
    '#84cc16',
    '#38bdf8',
    '#fb7185',
    '#c084fc',
  ]
  const kindColors = new Map<string, string>()
  const colorForKind = (kind: string): string => {
    if (!kindColors.has(kind)) {
      kindColors.set(kind, palette[kindColors.size % palette.length])
    }
    return kindColors.get(kind) ?? palette[0]
  }
  const nodeById = new Map(data.nodes.map((node) => [node.id, node]))
  const staticEdges = data.edges
    .map((edge) => {
      const from = nodeById.get(edge.from)
      const to = nodeById.get(edge.to)
      if (!from || !to) return ''
      const attrs = `x1="${from.x}" y1="${from.y}" x2="${to.x}" y2="${to.y}" data-id="${escapeAttribute(edge.id)}"`
      return `<line ${attrs} class="edge"></line><line ${attrs} class="edge-hit"></line>`
    })
    .join('')
  const staticNodes = data.nodes
    .map(
      (node) =>
        `<g class="node" transform="translate(${node.x} ${node.y})" data-id="${escapeAttribute(node.id)}">` +
        `<circle r="${initialCircleRadius}" fill="${escapeAttribute(colorForKind(node.kind))}"></circle>` +
        `<text x="${initialLabelX}" y="${initialLabelY}" font-size="${initialLabelSize}">${escapeText(
          shortStaticLabel(node.label),
        )}</text>` +
        `</g>`,
    )
    .join('')
  const kindPills = Object.entries(data.summary.nodeKindCounts)
    .sort()
    .map(([kind, count]) => `<span class="pill">${escapeText(kind)}: ${count}</span>`)
    .join('')
  const kindOptions = Object.entries(data.summary.nodeKindCounts)
    .sort()
    .map(([kind, count]) => `<option value="${escapeAttribute(kind)}">${escapeText(kind)} (${count})</option>`)
    .join('')
  const resultRows = data.nodes
    .slice(0, 200)
    .map(
      (node) =>
        `<button class="row" type="button" data-node-id="${escapeAttribute(node.id)}">${escapeText(
          node.label,
        )}<small>${escapeText(`${node.kind} - ${node.sourceFile || 'n/a'}`)}</small></button>`,
    )
    .join('')
  const graphWidth = Math.max(data.summary.graphWidth, 1)
  const graphHeight = Math.max(data.summary.graphHeight, 1)
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>DevView Code Graph</title>
  <style>
    :root { color-scheme: light; font-family: Inter, Segoe UI, Arial, sans-serif; --ink:#17202a; --muted:#697586; --line:#a5b4c3; --panel:#f7f9fb; --accent:#2563eb; }
    body { margin:0; height:100vh; overflow:hidden; color:var(--ink); background:#eef3f8; }
    .shell { display:grid; grid-template-columns:minmax(0,1fr) 360px; height:100vh; }
    .stage { position:relative; min-width:0; background:#e6edf5; }
    .toolbar { position:absolute; top:12px; left:12px; z-index:2; display:flex; gap:6px; align-items:center; padding:6px; background:rgba(255,255,255,.94); border:1px solid #d5dee8; border-radius:8px; box-shadow:0 6px 18px rgba(31,41,55,.12); }
    button { height:30px; min-width:32px; border:1px solid #c4cfdb; background:#fff; color:#1f2937; border-radius:6px; cursor:pointer; font-weight:700; }
    button:hover { border-color:#2563eb; color:#1d4ed8; }
    input, select { height:30px; border:1px solid #c4cfdb; border-radius:6px; padding:0 8px; background:#fff; color:#1f2937; }
    #graphSvg { width:100%; height:100%; display:block; cursor:grab; user-select:none; }
    #graphSvg.dragging { cursor:grabbing; }
    .edge { stroke:#93a4b7; stroke-width:1.4; vector-effect:non-scaling-stroke; opacity:.42; }
    .edge-hit { stroke:transparent; stroke-width:12; vector-effect:non-scaling-stroke; cursor:pointer; }
    .edge.selected { stroke:#ef4444; stroke-width:2.4; opacity:.95; }
    .node circle { stroke:#17202a; stroke-width:1.2; vector-effect:non-scaling-stroke; cursor:pointer; }
    .node text { fill:#111827; paint-order:stroke; stroke:#eef3f8; stroke-width:3px; stroke-linejoin:round; pointer-events:none; }
    .node.selected circle { stroke:#ef4444; stroke-width:2.2; }
    .lane-label { fill:#4b5563; font-weight:700; letter-spacing:0; }
    .panel { display:flex; flex-direction:column; min-width:0; border-left:1px solid #d5dee8; background:#fff; }
    .panel header { padding:16px 16px 12px; border-bottom:1px solid #e5ebf2; }
    .panel h1 { margin:0; font-size:18px; line-height:1.25; }
    .summary { display:grid; grid-template-columns:1fr 1fr; gap:8px; padding:12px 16px; border-bottom:1px solid #e5ebf2; }
    .metric { background:var(--panel); border:1px solid #e5ebf2; border-radius:8px; padding:10px; }
    .metric b { display:block; font-size:20px; }
    .section { padding:14px 16px; border-bottom:1px solid #e5ebf2; overflow:auto; }
    .section h2 { margin:0 0 8px; font-size:13px; text-transform:uppercase; color:#536174; letter-spacing:.04em; }
    .kv { display:grid; grid-template-columns:96px minmax(0,1fr); gap:6px 10px; font-size:12px; line-height:1.35; }
    .kv .k { color:var(--muted); }
    .mono { font-family:Consolas, Menlo, monospace; overflow-wrap:anywhere; }
    .list { display:flex; flex-wrap:wrap; gap:6px; }
    .pill { font-size:12px; border:1px solid #d5dee8; background:#f8fafc; border-radius:999px; padding:4px 7px; }
    .results { flex:1; overflow:auto; }
    .row { display:block; width:100%; text-align:left; border:0; border-bottom:1px solid #eef2f6; border-radius:0; padding:9px 16px; height:auto; background:#fff; font-weight:500; }
    .row:hover { background:#f3f7fb; }
    .row small { display:block; color:var(--muted); font-weight:400; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
  </style>
</head>
<body>
  <div class="shell" data-artifact-role="${HTML_ROLE}">
    <main class="stage">
      <div class="toolbar" aria-label="Graph controls">
        <button id="zoomOut" title="Zoom out">-</button>
        <button id="zoomIn" title="Zoom in">+</button>
        <button id="fit" title="Fit graph">Fit</button>
        <button id="reset" title="Reset zoom">1:1</button>
        <input id="search" type="search" placeholder="Search nodes">
        <select id="kindFilter" title="Node kind filter"><option value="">All kinds</option>${kindOptions}</select>
      </div>
      <svg id="graphSvg" role="img" aria-label="DevView code graph" viewBox="0 0 ${graphWidth} ${graphHeight}" preserveAspectRatio="xMidYMin meet">
        <g id="graphRoot">
          <g id="edgeLayer">${staticEdges}</g>
          <g id="nodeLayer">${staticNodes}</g>
        </g>
      </svg>
    </main>
    <aside class="panel">
      <header>
        <h1>DevView Code Graph</h1>
        <div class="mono" id="sourcePath">${escapeText(data.sourceCodeSubgraph.path)}</div>
      </header>
      <section class="summary">
        <div class="metric"><b id="nodeCount">${data.summary.nodeCount}</b><span>nodes</span></div>
        <div class="metric"><b id="edgeCount">${data.summary.edgeCount}</b><span>edges</span></div>
      </section>
      <section class="section">
        <h2>Selection Details</h2>
        <div id="selectionDetails" class="kv"><span class="k">Status</span><span>Click a node or edge.</span></div>
      </section>
      <section class="section">
        <h2>Kinds</h2>
        <div id="kindList" class="list">${kindPills}</div>
      </section>
      <section class="results" id="results">${resultRows}</section>
    </aside>
  </div>
  <script id="graph-data" type="application/json">${json}</script>
  <script>
    const data = JSON.parse(document.getElementById('graph-data').textContent);
    const svg = document.getElementById('graphSvg');
    const ns = 'http://www.w3.org/2000/svg';
    const nodeById = new Map(data.nodes.map(node => [node.id, node]));
    let scale = 1;
    let tx = 0;
    let ty = 0;
    let selected = null;
    let dragging = false;
    let last = null;
    const viewport = { width: data.summary.graphWidth, height: data.summary.graphHeight };
    const root = document.getElementById('graphRoot');
    svg.setAttribute('viewBox', '0 0 1200 800');

    function init() {
      document.getElementById('sourcePath').textContent = data.sourceCodeSubgraph.path;
      document.getElementById('nodeCount').textContent = data.summary.nodeCount;
      document.getElementById('edgeCount').textContent = data.summary.edgeCount;
      renderFilters();
      attachGraphInteractions();
      renderResults(data.nodes.slice(0, 200));
      fitGraph();
    }
    function renderFilters() {
      const kindList = document.getElementById('kindList');
      const filter = document.getElementById('kindFilter');
      kindList.innerHTML = '';
      filter.innerHTML = '<option value="">All kinds</option>';
      Object.entries(data.summary.nodeKindCounts).sort().forEach(([kind, count]) => {
        const option = document.createElement('option');
        option.value = kind;
        option.textContent = kind + ' (' + count + ')';
        filter.appendChild(option);
        const pill = document.createElement('span');
        pill.className = 'pill';
        pill.textContent = kind + ': ' + count;
        kindList.appendChild(pill);
      });
    }
    function attachGraphInteractions() {
      document.querySelectorAll('.edge-hit').forEach(hit => {
        hit.addEventListener('click', event => { event.stopPropagation(); selectEdge(hit.getAttribute('data-id')); });
      });
      document.querySelectorAll('.node').forEach(group => {
        group.addEventListener('click', event => { event.stopPropagation(); selectNode(group.getAttribute('data-id')); });
      });
    }
    function applyTransform() {
      root.setAttribute('transform', 'translate(' + tx + ' ' + ty + ') scale(' + scale + ')');
      document.querySelectorAll('.node circle').forEach(circle => circle.setAttribute('r', String(7 / scale)));
      document.querySelectorAll('.node text').forEach(label => {
        label.setAttribute('font-size', String(11 / scale));
        label.setAttribute('x', String(11 / scale));
        label.setAttribute('y', String(4 / scale));
      });
    }
    function zoomAt(factor, cx = 600, cy = 400) {
      const before = screenToGraph(cx, cy);
      scale = Math.max(0.03, Math.min(8, scale * factor));
      tx = cx - before.x * scale;
      ty = cy - before.y * scale;
      applyTransform();
    }
    function screenToGraph(x, y) {
      const point = svg.createSVGPoint();
      point.x = x;
      point.y = y;
      const ctm = svg.getScreenCTM();
      const svgPoint = ctm ? point.matrixTransform(ctm.inverse()) : { x, y };
      return { x: (svgPoint.x - tx) / scale, y: (svgPoint.y - ty) / scale };
    }
    function fitGraph() {
      const box = svg.getBoundingClientRect();
      const sx = box.width / Math.max(viewport.width, 1);
      const sy = box.height / Math.max(viewport.height, 1);
      scale = Math.max(0.03, Math.min(sx, sy) * 0.92);
      tx = (box.width - viewport.width * scale) / 2;
      ty = 24;
      applyTransform();
    }
    function selectNode(id) {
      selected = { type: 'node', id };
      document.querySelectorAll('.selected').forEach(entry => entry.classList.remove('selected'));
      document.querySelector('.node[data-id="' + cssEscape(id) + '"]')?.classList.add('selected');
      showDetails('node', nodeById.get(id));
    }
    function selectEdge(id) {
      selected = { type: 'edge', id };
      const edge = data.edges.find(entry => entry.id === id);
      document.querySelectorAll('.selected').forEach(entry => entry.classList.remove('selected'));
      document.querySelectorAll('.edge[data-id="' + cssEscape(id) + '"]').forEach(entry => entry.classList.add('selected'));
      showDetails('edge', edge);
    }
    function showDetails(type, item) {
      const details = document.getElementById('selectionDetails');
      if (!item) return;
      if (type === 'empty') {
        details.innerHTML = '<span class="k">Status</span><span>Click a node or edge.</span>';
        return;
      }
      const rows = type === 'node'
        ? [
            ['Type', 'node'], ['Id', item.id], ['Label', item.label], ['Kind', item.kind], ['Degree', item.degree],
            ['Source file', item.sourceFile], ['Location', formatLocation(item.sourceLocation) || item.sourceLocationStatus],
            ['Confidence', item.confidence], ['Extractor', item.extractor], ['Graphify id', item.sourceGraphifyNodeId],
          ]
        : [
            ['Type', 'edge'], ['Id', item.id], ['Relation', item.kind], ['From', item.from], ['To', item.to],
            ['Source file', item.sourceFile], ['Location', formatLocation(item.sourceLocation) || item.sourceLocationStatus],
            ['Confidence', item.confidence], ['Graphify relation', item.sourceGraphifyEdgeKind],
          ];
      details.innerHTML = rows.map(([k,v]) => '<span class="k">' + escapeHtml(k) + '</span><span class="mono">' + escapeHtml(v ?? 'n/a') + '</span>').join('');
    }
    function renderResults(nodes) {
      const results = document.getElementById('results');
      results.innerHTML = '';
      nodes.forEach(node => {
        const row = document.createElement('button');
        row.className = 'row';
        row.innerHTML = escapeHtml(node.label) + '<small>' + escapeHtml(node.kind + ' - ' + (node.sourceFile || 'n/a')) + '</small>';
        row.addEventListener('click', () => selectNode(node.id));
        results.appendChild(row);
      });
    }
    function applySearch() {
      const query = document.getElementById('search').value.toLowerCase();
      const kind = document.getElementById('kindFilter').value;
      const matches = data.nodes.filter(node => (!kind || node.kind === kind) && (!query || (node.label + ' ' + node.id + ' ' + (node.sourceFile || '')).toLowerCase().includes(query)));
      renderResults(matches.slice(0, 300));
    }
    function shortLabel(value) { return value.length > 34 ? value.slice(0, 31) + '...' : value; }
    function formatLocation(value) { return value && typeof value === 'object' ? JSON.stringify(value) : value; }
    function escapeHtml(value) { return String(value ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch])); }
    function cssEscape(value) { return window.CSS && CSS.escape ? CSS.escape(value) : String(value).replace(/"/g, '\\\\"'); }
    document.getElementById('zoomIn').addEventListener('click', () => zoomAt(1.25));
    document.getElementById('zoomOut').addEventListener('click', () => zoomAt(0.8));
    document.getElementById('fit').addEventListener('click', fitGraph);
    document.getElementById('reset').addEventListener('click', () => { scale = 1; tx = 0; ty = 0; applyTransform(); });
    document.getElementById('search').addEventListener('input', applySearch);
    document.getElementById('kindFilter').addEventListener('change', applySearch);
    svg.addEventListener('click', () => { selected = null; document.querySelectorAll('.selected').forEach(entry => entry.classList.remove('selected')); showDetails('empty', { id:'Click a node or edge.' }); });
    svg.addEventListener('wheel', event => { event.preventDefault(); zoomAt(event.deltaY < 0 ? 1.12 : 0.89, event.clientX, event.clientY); }, { passive:false });
    svg.addEventListener('pointerdown', event => { dragging = true; last = { x:event.clientX, y:event.clientY }; svg.classList.add('dragging'); });
    window.addEventListener('pointermove', event => { if (!dragging || !last) return; tx += event.clientX - last.x; ty += event.clientY - last.y; last = { x:event.clientX, y:event.clientY }; applyTransform(); });
    window.addEventListener('pointerup', () => { dragging = false; last = null; svg.classList.remove('dragging'); });
    window.addEventListener('resize', fitGraph);
    init();
  </script>
</body>
</html>
`
}

function shortStaticLabel(value: string): string {
  return value.length > 34 ? `${value.slice(0, 31)}...` : value
}

function escapeText(value: unknown): string {
  return String(value ?? '').replace(/[&<>"']/g, (character) => {
    const replacements: Record<string, string> = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;',
    }
    return replacements[character] ?? character
  })
}

function escapeAttribute(value: unknown): string {
  return escapeText(value)
}

function renderMarkdown(report: CodeGraphHtmlRenderReport): string {
  return [
    '# DevView Code Graph HTML Render',
    '',
    `- status: ${report.status}`,
    `- code subgraph: ${report.sourceCodeSubgraph.path ?? 'not-read'}`,
    `- nodes: ${report.htmlSummary.nodeCount}`,
    `- edges: ${report.htmlSummary.edgeCount}`,
    `- html output: ${report.writtenHtmlOutputPath ?? 'not-written'}`,
    '',
    '## Safety',
    '',
    '- graphSourceMutated: false',
    '- graphDeltaApplied: false',
    '- viewTreeGenerated: false',
    '- providerInvoked: false',
    '- networkCallMade: false',
    '- shellCommandsExecuted: false',
  ].join('\n')
}

function collectUnsafeAuthorityHits(value: unknown, prefix = ''): Array<{ field: string }> {
  const hits: Array<{ field: string }> = []
  if (Array.isArray(value)) {
    value.forEach((entry, index) => hits.push(...collectUnsafeAuthorityHits(entry, `${prefix}[${index}]`)))
    return hits
  }
  const record = asRecord(value)
  if (!record) return hits
  for (const [key, entry] of Object.entries(record)) {
    const field = prefix ? `${prefix}.${key}` : key
    if (unsafeAuthorityFields.includes(key) && entry === true) hits.push({ field })
    hits.push(...collectUnsafeAuthorityHits(entry, field))
  }
  return hits
}

function collectExecutableInstructionHits(value: unknown, prefix = ''): Array<{ field: string }> {
  const hits: Array<{ field: string }> = []
  if (Array.isArray(value)) {
    value.forEach((entry, index) => hits.push(...collectExecutableInstructionHits(entry, `${prefix}[${index}]`)))
    return hits
  }
  const record = asRecord(value)
  if (!record) return hits
  for (const [key, entry] of Object.entries(record)) {
    const field = prefix ? `${prefix}.${key}` : key
    if (executableInstructionFields.includes(key) && typeof entry === 'string' && entry.trim().length > 0) {
      hits.push({ field })
    }
    hits.push(...collectExecutableInstructionHits(entry, field))
  }
  return hits
}

function readJsonSafeSync(filePath: string): JsonRecord | null {
  try {
    const text = readFileSync(filePath, 'utf8')
    return JSON.parse(text.replace(/^\uFEFF/, '')) as JsonRecord
  } catch {
    return null
  }
}

function blocker(code: string, message: string, field?: string, filePath?: string): CodeGraphHtmlRenderFinding {
  return { severity: 'blocker', code, message, field, path: filePath }
}

function satisfied(code: string, message: string): CodeGraphHtmlRenderFinding {
  return { severity: 'satisfied', code, message }
}

function resolveRepoPath(root: string, filePath: string): string {
  return path.isAbsolute(filePath) ? filePath : path.join(root, filePath)
}

function samePath(left: string, right: string): boolean {
  return path.resolve(left).toLowerCase() === path.resolve(right).toLowerCase()
}

function arrayOfRecords(value: unknown): JsonRecord[] {
  return Array.isArray(value) ? value.filter((entry): entry is JsonRecord => Boolean(asRecord(entry))) : []
}

function asRecord(value: unknown): JsonRecord | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as JsonRecord) : null
}

function stringValue(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null
}

function sortedUnique(values: string[]): string[] {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right))
}

function countBy<T>(entries: T[], select: (entry: T) => string): Record<string, number> {
  const counts: Record<string, number> = {}
  for (const entry of entries) {
    const key = select(entry)
    counts[key] = (counts[key] ?? 0) + 1
  }
  return counts
}
