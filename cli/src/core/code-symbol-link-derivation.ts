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

const LINKS_ROLE = 'devview-code-symbol-links'
const LINKS_STATUS = 'devview-code-symbol-links-supplied'
const LINKS_SCOPE = 'code-symbol-link-source-fact-only'
const DERIVATION_SCOPE = 'code-symbol-link-derivation-report-only'
const CODE_SUBGRAPH_ROLE = 'devview-code-subgraph'
const CODE_SUBGRAPH_STATUS = 'devview-code-subgraph-supplied'
const CODE_SUBGRAPH_SCOPE = 'code-subgraph-source-fact-only'

const codeNodeKinds = [
  'file',
  'module',
  'package',
  'class',
  'interface',
  'type',
  'function',
  'method',
  'field',
  'component',
  'route',
  'test',
  'config',
  'external_dependency',
] as const

const sourceNodeKinds = [
  'task',
  'change',
  'check',
  'evidence',
  'requirement',
  'decision',
  'finding',
  'risk',
  'test',
  'document',
  'module',
  'project',
] as const

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
  'installCommand',
  'shellCommand',
  'shellCommands',
]

const commonTokens = new Set([
  'the',
  'and',
  'for',
  'from',
  'with',
  'this',
  'that',
  'node',
  'graph',
  'view',
  'views',
  'tree',
  'code',
  'file',
  'source',
  'task',
  'change',
  'check',
  'test',
  'tests',
  'step',
  'request',
  'src',
  'work',
  'devview',
  'windowsutility',
  'windows',
  'utility',
  'utilities',
  'legacy',
  'integrated',
  'integration',
  'module',
  'modules',
  'binding',
  'target',
  'validate',
  'only',
])

const minimumScore = 12
const maxLinksPerMaintenanceNode = 12

export interface CodeSymbolLinkDerivationOptions {
  codeSubgraph?: string
  graphSource?: string
  devviewGraphData?: string
  output?: string
  markdown?: string
}

interface LoadedSource {
  requestedPath: string
  resolvedPath: string
  relativePath: string
  record: JsonRecord | null
  sha256: string | null
  byteLength: number | null
  readError: string | null
}

interface CodeCandidate {
  id: string
  kind: string
  label: string
  sourceFile: string | null
  text: string
  tokens: Set<string>
}

interface MaintenanceCandidate {
  id: string
  kind: string
  label: string
  text: string
  fileHints: string[]
  source: 'graph-source' | 'devview-graph-data'
}

interface DerivedLink {
  id: string
  sourceNodeId: string
  targetCodeNodeId: string
  linkType: string
  sourceNodeKind: string
  targetCodeNodeKind: string
  sourceFile?: string
  sourceLocationStatus: string
  confidence: 'extracted' | 'inferred' | 'ambiguous'
  derivation: {
    score: number
    matchedFileHints: string[]
    tokenOverlap: string[]
    source: string
  }
}

export interface CodeSymbolLinkDerivationFinding {
  severity: 'blocker' | 'warning' | 'satisfied'
  code: string
  message: string
  field?: string
  path?: string
}

export interface CodeSymbolLinkDerivationArtifact extends JsonRecord {
  schemaVersion: 1
  artifactRole: typeof LINKS_ROLE
  status: typeof LINKS_STATUS
  scope: typeof LINKS_SCOPE
  derivationScope: typeof DERIVATION_SCOPE
  sourceFactsOnly: true
  reportOnly: true
  sourceCodeSubgraph: {
    path: string
    artifactRole: string | null
    status: string | null
    scope: string | null
    sha256: string | null
    byteLength: number | null
  }
  sourceGraphSource?: {
    path: string
    sha256: string | null
    byteLength: number | null
  }
  sourceDevViewGraphData?: {
    path: string
    sha256: string | null
    byteLength: number | null
  }
  derivationSummary: {
    codeCandidateCount: number
    maintenanceCandidateCount: number
    linkCount: number
    sourceNodeCount: number
    targetCodeNodeCount: number
    linkTypeCounts: Record<string, number>
    targetCodeNodeKindCounts: Record<string, number>
  }
  links: DerivedLink[]
  derivationFindings: CodeSymbolLinkDerivationFinding[]
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
  rbacEnforced: false
  permissionVerified: false
  cryptographicSignatureVerified: false
  enterpriseGateActivated: false
  writtenOutputPath?: string
  writtenMarkdownPath?: string
}

export class CodeSymbolLinkDerivationError extends Error {
  readonly artifact: CodeSymbolLinkDerivationArtifact

  constructor(artifact: CodeSymbolLinkDerivationArtifact) {
    super('Code symbol link derivation is blocked.')
    this.artifact = artifact
  }
}

export async function deriveCodeSymbolLinksFile(
  root: string,
  options: CodeSymbolLinkDerivationOptions,
): Promise<CodeSymbolLinkDerivationArtifact> {
  validateRequiredOptions(options)

  const sourcePaths = [
    resolveRepoPath(root, options.codeSubgraph ?? ''),
    ...(options.graphSource ? [resolveRepoPath(root, options.graphSource)] : []),
    ...(options.devviewGraphData ? [resolveRepoPath(root, options.devviewGraphData)] : []),
  ]
  await assertOutputAuthority(root, sourcePaths, options)

  const codeSubgraph = await loadSource(root, options.codeSubgraph ?? '')
  const graphSource = options.graphSource ? await loadSource(root, options.graphSource) : null
  const devviewGraphData = options.devviewGraphData ? await loadSource(root, options.devviewGraphData) : null
  const findings: CodeSymbolLinkDerivationFinding[] = []

  validateCodeSubgraphSource(root, codeSubgraph, findings)
  for (const source of [graphSource, devviewGraphData].filter((entry): entry is LoadedSource => Boolean(entry))) {
    validateGenericSourceFacts(source, findings)
  }

  const blocked = findings.some((finding) => finding.severity === 'blocker')
  let links: DerivedLink[] = []
  const codeCandidates = codeSubgraph.record ? collectCodeCandidates(codeSubgraph.record) : []
  const maintenanceCandidates = dedupeMaintenanceCandidates([
    ...(graphSource?.record ? collectGraphSourceCandidates(graphSource.record) : []),
    ...(devviewGraphData?.record ? collectDevViewGraphDataCandidates(devviewGraphData.record) : []),
  ])

  if (!blocked) {
    if (maintenanceCandidates.length === 0) {
      findings.push(
        warning(
          'NO_MAINTENANCE_CANDIDATES',
          'No maintenance graph candidates were supplied, so no code-symbol links could be derived.',
        ),
      )
    }
    links = deriveLinks(maintenanceCandidates, codeCandidates)
    if (links.length === 0) {
      findings.push(
        warning(
          'NO_CODE_SYMBOL_LINKS_DERIVED',
          'No code-symbol links met the deterministic file/token match threshold.',
        ),
      )
    } else {
      findings.push(satisfied('CODE_SYMBOL_LINKS_DERIVED', `Derived ${links.length} code-symbol links.`))
    }
  }

  const artifact = buildArtifact(
    codeSubgraph,
    graphSource,
    devviewGraphData,
    codeCandidates,
    maintenanceCandidates,
    links,
    findings,
  )
  if (artifact.derivationFindings.some((finding) => finding.severity === 'blocker')) {
    throw new CodeSymbolLinkDerivationError(artifact)
  }

  const outputPath = resolveRepoPath(root, options.output ?? '')
  await writeJsonAtomic(outputPath, artifact)
  artifact.writtenOutputPath = relativePath(root, outputPath)
  if (options.markdown) {
    const markdownPath = resolveRepoPath(root, options.markdown)
    await writeTextAtomic(markdownPath, renderMarkdown(artifact))
    artifact.writtenMarkdownPath = relativePath(root, markdownPath)
    await writeJsonAtomic(outputPath, artifact)
  }
  return artifact
}

function validateRequiredOptions(options: CodeSymbolLinkDerivationOptions): void {
  if (!options.codeSubgraph) {
    throw new Error('graph derive-code-symbol-links requires --code-subgraph <devview-code-subgraph.json>.')
  }
  if (!options.graphSource && !options.devviewGraphData) {
    throw new Error('graph derive-code-symbol-links requires --graph-source or --devview-graph-data.')
  }
  if (!options.output) {
    throw new Error('graph derive-code-symbol-links requires --output <code-symbol-links.json>.')
  }
}

async function loadSource(root: string, requestedPath: string): Promise<LoadedSource> {
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

function validateCodeSubgraphSource(
  root: string,
  source: LoadedSource,
  findings: CodeSymbolLinkDerivationFinding[],
): void {
  if (source.readError || !source.record) {
    findings.push(
      blocker(
        'CODE_SUBGRAPH_READ_FAILED',
        `Could not read code subgraph: ${source.readError}`,
        undefined,
        source.relativePath,
      ),
    )
    return
  }
  const role = stringValue(source.record.artifactRole)
  const status = stringValue(source.record.status)
  const scope = stringValue(source.record.scope)
  if (role !== CODE_SUBGRAPH_ROLE || status !== CODE_SUBGRAPH_STATUS || scope !== CODE_SUBGRAPH_SCOPE) {
    findings.push(
      blocker(
        'CODE_SUBGRAPH_ROLE_STATUS_SCOPE_INVALID',
        'Code subgraph must be devview-code-subgraph / devview-code-subgraph-supplied / code-subgraph-source-fact-only.',
        'artifactRole/status/scope',
        source.relativePath,
      ),
    )
    return
  }
  try {
    validateCodeSubgraphRecord(root, source.requestedPath, source.record)
  } catch (error) {
    const report = error instanceof CodeSubgraphValidationError ? error.report : null
    const details = report?.validationFindings
      ?.filter((finding) => finding.severity === 'blocker')
      .map((finding) => finding.message)
      .join('; ')
    findings.push(
      blocker(
        'CODE_SUBGRAPH_VALIDATION_FAILED',
        details || 'Code subgraph did not pass validation.',
        undefined,
        source.relativePath,
      ),
    )
  }
}

function validateGenericSourceFacts(source: LoadedSource, findings: CodeSymbolLinkDerivationFinding[]): void {
  if (source.readError || !source.record) {
    findings.push(
      blocker('SOURCE_READ_FAILED', `Could not read source fact: ${source.readError}`, undefined, source.relativePath),
    )
    return
  }
  for (const hit of collectUnsafeAuthorityHits(source.record)) {
    findings.push(
      blocker(
        'UNSAFE_AUTHORITY_CLAIM',
        `Source fact claims unsafe authority through ${hit}.`,
        hit,
        source.relativePath,
      ),
    )
  }
  for (const hit of collectExecutableInstructionHits(source.record)) {
    findings.push(
      blocker(
        'EXECUTABLE_INSTRUCTION_FIELD',
        `Source fact contains executable/provider/network instruction field ${hit}.`,
        hit,
        source.relativePath,
      ),
    )
  }
}

function collectCodeCandidates(record: JsonRecord): CodeCandidate[] {
  const nodes = arrayRecords(record.nodes)
  return nodes
    .map((node) => {
      const id = stringValue(node.id)
      const kind = stringValue(node.kind)
      if (!id || !kind || !includesString(codeNodeKinds, kind)) return null
      const label = stringValue(node.label) ?? stringValue(node.name) ?? stringValue(node.title) ?? id
      const sourceFile = stringValue(node.sourceFile) ?? stringValue(node.path) ?? null
      const text = [
        id,
        kind,
        label,
        sourceFile,
        stringValue(node.qualifiedName),
        stringValue(node.symbolName),
        stringValue(node.sourceLocation),
      ]
        .filter((value): value is string => Boolean(value))
        .join(' ')
      return {
        id,
        kind,
        label,
        sourceFile,
        text,
        tokens: tokenize(text),
      }
    })
    .filter((candidate): candidate is CodeCandidate => Boolean(candidate))
}

function collectGraphSourceCandidates(record: JsonRecord): MaintenanceCandidate[] {
  const rawNodes = [
    ...arrayRecords(record.nodes),
    ...arrayRecords(asRecord(record.graph)?.nodes),
    ...arrayRecords(asRecord(record.sourceRecords)?.nodes),
    ...arrayRecords(record.records),
  ]
  return rawNodes
    .map((node) => maintenanceCandidateFromRecord(node, 'graph-source'))
    .filter((candidate): candidate is MaintenanceCandidate => Boolean(candidate))
}

function collectDevViewGraphDataCandidates(record: JsonRecord): MaintenanceCandidate[] {
  const candidates: MaintenanceCandidate[] = []
  for (const node of arrayRecords(asRecord(record.graph)?.nodes)) {
    const candidate = maintenanceCandidateFromRecord(node, 'devview-graph-data')
    if (candidate) candidates.push(candidate)
  }
  for (const subgraph of arrayRecords(record.subgraphs)) {
    const id = stringValue(subgraph.startNodeId) ?? stringValue(subgraph.id)
    if (!id) continue
    candidates.push({
      id,
      kind: inferSourceKind(subgraph.kind, id),
      label: stringValue(subgraph.label) ?? stringValue(subgraph.title) ?? id,
      text: collectText(subgraph),
      fileHints: collectFileHints(subgraph),
      source: 'devview-graph-data',
    })
  }
  for (const step of arrayRecords(record.workflowSteps)) {
    const nodeIds = stringArray(step.nodeIds)
    const id = stringValue(step.nodeId) ?? nodeIds[0] ?? stringValue(step.id)
    if (!id) continue
    candidates.push({
      id,
      kind: inferSourceKind(step.kind, id),
      label: stringValue(step.label) ?? stringValue(step.title) ?? id,
      text: collectText(step),
      fileHints: collectFileHints(step),
      source: 'devview-graph-data',
    })
  }
  for (const entry of arrayRecords(record.workHistory)) {
    const id = stringValue(entry.nodeId) ?? stringValue(entry.id)
    if (!id) continue
    candidates.push({
      id,
      kind: inferSourceKind(entry.kind, id),
      label: stringValue(entry.label) ?? stringValue(entry.title) ?? id,
      text: collectText(entry),
      fileHints: collectFileHints(entry),
      source: 'devview-graph-data',
    })
  }
  for (const entry of arrayRecords(record.packMapping)) {
    const id = stringValue(entry.nodeId) ?? stringValue(entry.id)
    if (!id) continue
    candidates.push({
      id,
      kind: inferSourceKind(entry.kind, id),
      label: stringValue(entry.label) ?? stringValue(entry.title) ?? id,
      text: collectText(entry),
      fileHints: collectFileHints(entry),
      source: 'devview-graph-data',
    })
  }
  return candidates
}

function maintenanceCandidateFromRecord(
  record: JsonRecord,
  source: MaintenanceCandidate['source'],
): MaintenanceCandidate | null {
  const id = stringValue(record.id) ?? stringValue(record.nodeId)
  if (!id) return null
  const kind = inferSourceKind(record.kind ?? record.type, id)
  if (!includesString(sourceNodeKinds, kind)) return null
  return {
    id,
    kind,
    label: stringValue(record.label) ?? stringValue(record.title) ?? stringValue(record.name) ?? id,
    text: collectText(record),
    fileHints: collectFileHints(record),
    source,
  }
}

function deriveLinks(maintenanceCandidates: MaintenanceCandidate[], codeCandidates: CodeCandidate[]): DerivedLink[] {
  const links: DerivedLink[] = []
  for (const source of maintenanceCandidates) {
    const scored = codeCandidates
      .map((target) => scoreCandidate(source, target))
      .filter((entry) => entry.score >= minimumScore)
      .sort((a, b) => b.score - a.score || rankCodeKind(a.target.kind) - rankCodeKind(b.target.kind))
      .slice(0, maxLinksPerMaintenanceNode)
    for (const entry of scored) {
      const linkType = linkTypeForSourceKind(source.kind)
      links.push({
        id: `link.${sanitizeId(source.id)}.${sanitizeId(entry.target.id)}.${shortHash(entry.target.id)}.${linkType}`,
        sourceNodeId: source.id,
        targetCodeNodeId: entry.target.id,
        linkType,
        sourceNodeKind: source.kind,
        targetCodeNodeKind: entry.target.kind,
        ...(entry.target.sourceFile ? { sourceFile: entry.target.sourceFile } : {}),
        sourceLocationStatus: 'derived-from-devview-source-file-and-token-hints',
        confidence: entry.score >= 60 ? 'extracted' : entry.score >= 24 ? 'inferred' : 'ambiguous',
        derivation: {
          score: entry.score,
          matchedFileHints: entry.matchedFileHints,
          tokenOverlap: entry.tokenOverlap,
          source: source.source,
        },
      })
    }
  }
  return dedupeLinks(links)
}

function scoreCandidate(
  source: MaintenanceCandidate,
  target: CodeCandidate,
): {
  target: CodeCandidate
  score: number
  matchedFileHints: string[]
  tokenOverlap: string[]
} {
  let score = 0
  const matchedFileHints: string[] = []
  const targetFile = target.sourceFile ? normalizePath(target.sourceFile) : null
  for (const hint of source.fileHints) {
    const normalizedHint = normalizePath(hint)
    if (!targetFile || !normalizedHint) continue
    if (
      targetFile === normalizedHint ||
      targetFile.endsWith(`/${normalizedHint}`) ||
      normalizedHint.endsWith(`/${targetFile}`)
    ) {
      score += target.kind === 'file' ? 70 : 55
      matchedFileHints.push(hint)
    } else if (path.posix.basename(targetFile) === path.posix.basename(normalizedHint)) {
      score += target.kind === 'file' ? 45 : 25
      matchedFileHints.push(hint)
    }
  }

  const sourceTokens = tokenize(`${source.id} ${source.label} ${source.text} ${source.fileHints.join(' ')}`)
  const overlap = [...target.tokens].filter((token) => sourceTokens.has(token))
  if (overlap.length > 0) {
    const strongOverlap = overlap.filter((token) => token.length >= 4)
    score += Math.min(30, strongOverlap.length * 6 + (overlap.length - strongOverlap.length) * 2)
  }

  const targetName = normalizeComparable(target.label)
  const normalizedSourceText = normalizeComparable(source.text)
  const targetNameIsCommon = commonTokens.has(targetName) || targetName.length < 4
  const hasStrongSymbolMatch =
    !targetNameIsCommon && normalizedSourceText.includes(targetName) && targetName !== normalizeComparable(source.label)
  if (hasStrongSymbolMatch) {
    score += 20
  }
  if (target.kind === 'function' || target.kind === 'method' || target.kind === 'class' || target.kind === 'test') {
    score += matchedFileHints.length > 0 ? 8 : 0
  }
  if (source.kind === 'project' && matchedFileHints.length === 0) {
    score = Math.min(score, minimumScore - 1)
  }
  if (source.kind === 'module' && matchedFileHints.length === 0 && !hasStrongSymbolMatch) {
    score = Math.min(score, minimumScore - 1)
  }
  if (target.kind === 'external_dependency' && matchedFileHints.length === 0) {
    score = Math.min(score, minimumScore - 1)
  }
  return {
    target,
    score,
    matchedFileHints: uniqueStrings(matchedFileHints),
    tokenOverlap: overlap.slice(0, 12),
  }
}

function buildArtifact(
  codeSubgraph: LoadedSource,
  graphSource: LoadedSource | null,
  devviewGraphData: LoadedSource | null,
  codeCandidates: CodeCandidate[],
  maintenanceCandidates: MaintenanceCandidate[],
  links: DerivedLink[],
  findings: CodeSymbolLinkDerivationFinding[],
): CodeSymbolLinkDerivationArtifact {
  const sourceNodeIds = new Set(links.map((link) => link.sourceNodeId))
  const targetCodeNodeIds = new Set(links.map((link) => link.targetCodeNodeId))
  return {
    schemaVersion: 1,
    artifactRole: LINKS_ROLE,
    status: LINKS_STATUS,
    scope: LINKS_SCOPE,
    derivationScope: DERIVATION_SCOPE,
    sourceFactsOnly: true,
    reportOnly: true,
    sourceCodeSubgraph: {
      path: codeSubgraph.relativePath,
      artifactRole: stringValue(codeSubgraph.record?.artifactRole) ?? null,
      status: stringValue(codeSubgraph.record?.status) ?? null,
      scope: stringValue(codeSubgraph.record?.scope) ?? null,
      sha256: codeSubgraph.sha256,
      byteLength: codeSubgraph.byteLength,
    },
    ...(graphSource
      ? {
          sourceGraphSource: {
            path: graphSource.relativePath,
            sha256: graphSource.sha256,
            byteLength: graphSource.byteLength,
          },
        }
      : {}),
    ...(devviewGraphData
      ? {
          sourceDevViewGraphData: {
            path: devviewGraphData.relativePath,
            sha256: devviewGraphData.sha256,
            byteLength: devviewGraphData.byteLength,
          },
        }
      : {}),
    derivationSummary: {
      codeCandidateCount: codeCandidates.length,
      maintenanceCandidateCount: maintenanceCandidates.length,
      linkCount: links.length,
      sourceNodeCount: sourceNodeIds.size,
      targetCodeNodeCount: targetCodeNodeIds.size,
      linkTypeCounts: countBy(links, (link) => link.linkType),
      targetCodeNodeKindCounts: countBy(links, (link) => link.targetCodeNodeKind),
    },
    links,
    derivationFindings: findings,
    downstreamActionPlan: [
      'Validate this source fact with graph validate-code-symbol-links before using it for View Tree or Context Pack selection.',
      'Use validated links with graph generate-selected-graph-slice, graph report-code-impact, and graph query-unified.',
      'Treat these links as deterministic source facts, not graph-source mutation or authority-bearing apply records.',
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
    rbacEnforced: false,
    permissionVerified: false,
    cryptographicSignatureVerified: false,
    enterpriseGateActivated: false,
  }
}

function renderMarkdown(artifact: CodeSymbolLinkDerivationArtifact): string {
  return [
    '# Code Symbol Link Derivation',
    '',
    `Status: ${artifact.status}`,
    `Code candidates: ${artifact.derivationSummary.codeCandidateCount}`,
    `Maintenance candidates: ${artifact.derivationSummary.maintenanceCandidateCount}`,
    `Derived links: ${artifact.derivationSummary.linkCount}`,
    `Linked maintenance nodes: ${artifact.derivationSummary.sourceNodeCount}`,
    `Linked code nodes: ${artifact.derivationSummary.targetCodeNodeCount}`,
    '',
    '## Findings',
    ...artifact.derivationFindings.map((finding) => `- ${finding.severity}: ${finding.code} - ${finding.message}`),
    '',
  ].join('\n')
}

async function assertOutputAuthority(
  root: string,
  sourcePaths: string[],
  options: CodeSymbolLinkDerivationOptions,
): Promise<void> {
  const outputPath = resolveRepoPath(root, options.output ?? '')
  const markdownPath = options.markdown ? resolveRepoPath(root, options.markdown) : null
  const outputs = [
    { kind: 'output', path: outputPath },
    ...(markdownPath ? [{ kind: 'markdown output', path: markdownPath }] : []),
  ]
  const seen = new Set<string>()
  for (const output of outputs) {
    const key = pathKey(output.path)
    if (seen.has(key)) {
      throw new Error('Code symbol link derivation output and markdown paths must be different.')
    }
    seen.add(key)
  }
  const sourceSet = new Set(sourcePaths.map(pathKey))
  for (const output of outputs) {
    const relativeTarget = relativePath(root, output.path)
    if (sourceSet.has(pathKey(output.path))) {
      throw new Error(`Code symbol link derivation ${output.kind} would overwrite a source input: ${relativeTarget}.`)
    }
    if (isProtectedControlPath(root, output.path)) {
      throw new Error(
        `Code symbol link derivation ${output.kind} is inside a protected control path: ${relativeTarget}.`,
      )
    }
    const existingAuthority = await classifyExistingSourceAuthority(output.path)
    if (existingAuthority) {
      throw new Error(
        `Code symbol link derivation ${output.kind} would overwrite a source-authority-shaped path: ${relativeTarget}.`,
      )
    }
    if (isSourceAuthorityShapedPath(relativeTarget)) {
      throw new Error(
        `Code symbol link derivation ${output.kind} would write to a source-authority-shaped path: ${relativeTarget}.`,
      )
    }
  }
}

async function classifyExistingSourceAuthority(filePath: string): Promise<string | null> {
  try {
    const bytes = await readFile(filePath)
    const parsed = JSON.parse(bytes.toString('utf8').replace(/^\uFEFF/, '')) as JsonRecord
    const role = stringValue(parsed.artifactRole)
    if (role?.includes('graph-source') || role === CODE_SUBGRAPH_ROLE) return `artifactRole ${role}`
    if (asRecord(parsed.sourceRecords)) return 'sourceRecords'
    if (Array.isArray(parsed.nodes) && Array.isArray(parsed.edges)) return 'node-edge artifact'
  } catch {
    return null
  }
  return null
}

function collectUnsafeAuthorityHits(value: unknown, pathSegments: string[] = []): string[] {
  if (Array.isArray(value)) {
    return value.flatMap((entry, index) => collectUnsafeAuthorityHits(entry, [...pathSegments, String(index)]))
  }
  if (!isRecord(value)) return []
  const hits: string[] = []
  for (const [key, nested] of Object.entries(value)) {
    const next = [...pathSegments, key]
    if (unsafeAuthorityFields.includes(key) && nested === true) hits.push(next.join('.'))
    hits.push(...collectUnsafeAuthorityHits(nested, next))
  }
  return hits
}

function collectExecutableInstructionHits(value: unknown, pathSegments: string[] = []): string[] {
  if (Array.isArray(value)) {
    return value.flatMap((entry, index) => collectExecutableInstructionHits(entry, [...pathSegments, String(index)]))
  }
  if (!isRecord(value)) return []
  const hits: string[] = []
  for (const [key, nested] of Object.entries(value)) {
    const next = [...pathSegments, key]
    if (executableInstructionFields.includes(key)) hits.push(next.join('.'))
    hits.push(...collectExecutableInstructionHits(nested, next))
  }
  return hits
}

function collectText(record: JsonRecord): string {
  const pieces: string[] = []
  for (const key of [
    'id',
    'nodeId',
    'kind',
    'type',
    'label',
    'title',
    'name',
    'summary',
    'description',
    'requestSummary',
    'goal',
    'why',
  ]) {
    const value = stringValue(record[key])
    if (value) pieces.push(value)
  }
  for (const key of ['allowedFiles', 'sourceFiles', 'files', 'changedFiles', 'paths', 'nodeIds']) {
    pieces.push(...stringArray(record[key]))
  }
  return pieces.join(' ')
}

function collectFileHints(record: JsonRecord): string[] {
  const hints: string[] = []
  for (const key of [
    'sourceFile',
    'sourceArtifact',
    'recordPath',
    'packPath',
    'path',
    'file',
    'targetFile',
    'changedFile',
  ]) {
    const value = stringValue(record[key])
    if (looksLikePath(value)) hints.push(value)
  }
  for (const key of ['allowedFiles', 'sourceFiles', 'files', 'changedFiles', 'paths', 'sourceArtifacts']) {
    for (const value of stringArray(record[key])) {
      if (looksLikePath(value)) hints.push(value)
    }
  }
  return uniqueStrings(hints)
}

function looksLikePath(value: string | null): value is string {
  return Boolean(value && (value.includes('/') || value.includes('\\') || /\.[a-z0-9]{1,8}$/i.test(value)))
}

function dedupeMaintenanceCandidates(candidates: MaintenanceCandidate[]): MaintenanceCandidate[] {
  const byId = new Map<string, MaintenanceCandidate>()
  for (const candidate of candidates) {
    const existing = byId.get(candidate.id)
    if (!existing) {
      byId.set(candidate.id, candidate)
      continue
    }
    byId.set(candidate.id, {
      ...existing,
      text: `${existing.text} ${candidate.text}`,
      fileHints: uniqueStrings([...existing.fileHints, ...candidate.fileHints]),
    })
  }
  return [...byId.values()]
}

function dedupeLinks(links: DerivedLink[]): DerivedLink[] {
  const byKey = new Map<string, DerivedLink>()
  for (const link of links) {
    const key = `${link.sourceNodeId}\0${link.targetCodeNodeId}\0${link.linkType}`
    const existing = byKey.get(key)
    if (!existing || link.derivation.score > existing.derivation.score) byKey.set(key, link)
  }
  return [...byKey.values()]
}

function linkTypeForSourceKind(kind: string): string {
  if (kind === 'check' || kind === 'test') return 'covers'
  if (kind === 'evidence') return 'verifies'
  if (kind === 'requirement') return 'implements_requirement'
  if (kind === 'decision' || kind === 'finding' || kind === 'risk') return 'constrains'
  if (kind === 'document') return 'documents'
  if (kind === 'module' || kind === 'project') return 'depends_on'
  return 'touches'
}

function inferSourceKind(value: unknown, id: string): string {
  const explicit = stringValue(value)
  if (explicit && includesString(sourceNodeKinds, explicit)) return explicit
  const normalized = id.toLowerCase()
  if (normalized.includes('check') || normalized.startsWith('chk')) return 'check'
  if (normalized.includes('evid')) return 'evidence'
  if (normalized.includes('req')) return 'requirement'
  if (normalized.includes('dec')) return 'decision'
  if (normalized.includes('risk')) return 'risk'
  if (normalized.includes('find')) return 'finding'
  if (normalized.includes('test')) return 'test'
  if (normalized.includes('doc')) return 'document'
  if (normalized.includes('module') || normalized.startsWith('mod')) return 'module'
  if (normalized.includes('project') || normalized.startsWith('pj') || normalized.startsWith('product'))
    return 'project'
  if (normalized.includes('change') || normalized.startsWith('ch')) return 'change'
  return 'task'
}

function rankCodeKind(kind: string): number {
  const order = ['function', 'method', 'class', 'interface', 'type', 'test', 'file', 'module', 'package']
  const index = order.indexOf(kind)
  return index === -1 ? 999 : index
}

function tokenize(value: string): Set<string> {
  const expanded = value
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[^a-zA-Z0-9_./\\-]+/g, ' ')
    .split(/\s+/)
    .flatMap((part) => part.split(/[./\\_\-]+/))
    .map((part) => part.toLowerCase())
    .filter((part) => part.length >= 2 && !commonTokens.has(part))
  return new Set(expanded)
}

function countBy<T>(items: T[], getKey: (item: T) => string): Record<string, number> {
  const counts: Record<string, number> = {}
  for (const item of items) {
    const key = getKey(item)
    counts[key] = (counts[key] ?? 0) + 1
  }
  return counts
}

function blocker(code: string, message: string, field?: string, pathValue?: string): CodeSymbolLinkDerivationFinding {
  return { severity: 'blocker', code, message, ...(field ? { field } : {}), ...(pathValue ? { path: pathValue } : {}) }
}

function warning(code: string, message: string): CodeSymbolLinkDerivationFinding {
  return { severity: 'warning', code, message }
}

function satisfied(code: string, message: string): CodeSymbolLinkDerivationFinding {
  return { severity: 'satisfied', code, message }
}

function normalizeComparable(value: string): string {
  return value
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '')
}

function normalizePath(value: string): string {
  return value.replace(/\\/g, '/').toLowerCase().replace(/^\.\//, '')
}

function sanitizeId(value: string): string {
  return (
    value
      .replace(/[^a-zA-Z0-9_.-]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 120) || 'node'
  )
}

function shortHash(value: string): string {
  return createHash('sha256').update(value).digest('hex').slice(0, 10)
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))]
}

function arrayRecords(value: unknown): JsonRecord[] {
  return Array.isArray(value) ? value.filter(isRecord) : []
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.map((entry) => stringValue(entry)).filter((entry): entry is string => Boolean(entry))
    : []
}

function asRecord(value: unknown): JsonRecord | null {
  return isRecord(value) ? value : null
}

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function stringValue(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null
}

function includesString(values: readonly string[], value: string): boolean {
  return values.includes(value)
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

function isSourceAuthorityShapedPath(filePath: string): boolean {
  const normalized = normalizePath(filePath)
  return (
    normalized.includes('/graph-source') ||
    normalized.includes('/source-authority') ||
    normalized.includes('/read-model') ||
    normalized.endsWith('maintainability-graph.json')
  )
}
