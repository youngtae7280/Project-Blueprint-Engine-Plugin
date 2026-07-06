import path from 'node:path'
import { readJsonSafe, relativePath, writeJsonAtomic, writeTextAtomic } from './fs.js'
import type { IssueSeverity } from './types.js'

const REPORTER_NAME = 'ProjectMemoryExtensionGapReporter'
const EXPECTED_PROJECT_MEMORY_ROLE = 'devview-project-memory-preview'

type JsonRecord = Record<string, unknown>

export interface ProjectMemoryExtensionGapFinding {
  code: string
  severity: IssueSeverity
  field?: string
  message: string
  expected?: unknown
  actual?: unknown
  suggestedFix?: string
}

export interface ProjectMemoryVocabularyGap {
  kind: string
  kindType: 'node' | 'edge'
  category: 'missing' | 'extra-observed' | 'deprecated-observed' | 'unapproved-extension'
  source: string
  reviewMeaning: string
}

export interface ProjectMemoryViewTreeCoverageGap {
  treeId: string
  authorityStatus: string
  coverageStatus: 'preview-only-not-authoritative' | 'missing-related-extension-kind'
  reason: string
}

export interface ProjectMemoryExtensionGapReport {
  schemaVersion: 1
  artifactRole: 'devview-project-memory-extension-gap-report'
  status:
    | 'devview-project-memory-extension-gap-report-generated'
    | 'devview-project-memory-extension-gap-report-blocked'
  reporterName: typeof REPORTER_NAME
  reportScope: 'project-memory-taxonomy-extension-gap-report-only'
  sourceProjectMemory: string
  sourceGraphSource: string
  sourceReadModel: string | null
  projectMemorySummary: {
    projectMemoryId: string
    projectId: string
    projectName: string
    devviewMode: string
    currentDirection: string
    taxonomyProfileId: string
    taxonomyAuthorityStatus: string
    viewTreeProfileId: string
    viewTreeAuthorityStatus: string
  }
  expectedVocabulary: {
    coreNodeKinds: string[]
    extensionNodeKinds: string[]
    coreEdgeKinds: string[]
    extensionEdgeKinds: string[]
    deprecatedNodeKinds: string[]
    deprecatedEdgeKinds: string[]
  }
  observedVocabulary: {
    graphSourceNodeKinds: string[]
    graphSourceEdgeKinds: string[]
    readModelNodeKinds: string[]
    readModelEdgeKinds: string[]
    combinedNodeKinds: string[]
    combinedEdgeKinds: string[]
  }
  missingKinds: ProjectMemoryVocabularyGap[]
  extraObservedKinds: ProjectMemoryVocabularyGap[]
  deprecatedKinds: ProjectMemoryVocabularyGap[]
  unapprovedExtensionKinds: ProjectMemoryVocabularyGap[]
  viewTreeCoverageGaps: ProjectMemoryViewTreeCoverageGap[]
  extensionGapDetectorImplemented: true
  reportOnly: true
  humanReviewRequired: true
  graphSourceMutated: false
  graphDeltaApplied: false
  approvedProjectMemoryStateImplemented: false
  traversalPlannerBehaviorChanged: false
  selectedSliceGenerated: false
  contractInputGenerated: false
  instructionPackGenerated: false
  runtimeEvidenceSatisfied: false
  equivalenceProven: false
  scopeEnforced: false
  ciEnforcementEnabled: false
  validationFindings: ProjectMemoryExtensionGapFinding[]
  outputWritePolicy: 'explicit-output-only'
  writtenOutputPath: string | null
  markdownReportPath: string | null
  nonAuthorityBoundary: string
}

export interface ProjectMemoryExtensionGapFileResult {
  report: ProjectMemoryExtensionGapReport
  outputPath?: string
  markdownReport?: string
}

export async function reportProjectMemoryExtensionGapsFile(
  root: string,
  input: {
    projectMemory: string
    graphSource: string
    readModel?: string
    output?: string
    markdown?: string
  },
): Promise<ProjectMemoryExtensionGapFileResult> {
  const resolvedProjectMemoryPath = resolveRepoPath(root, input.projectMemory)
  const resolvedGraphSourcePath = resolveRepoPath(root, input.graphSource)
  const resolvedReadModelPath = input.readModel ? resolveRepoPath(root, input.readModel) : undefined

  const projectMemory = await readJsonSafe<JsonRecord>(resolvedProjectMemoryPath)
  if (!projectMemory.ok) {
    throw new Error(`Unable to read DevView Project Memory from ${input.projectMemory}: ${projectMemory.error}`)
  }
  const graphSource = await readJsonSafe<JsonRecord>(resolvedGraphSourcePath)
  if (!graphSource.ok) {
    throw new Error(`Unable to read graph-source from ${input.graphSource}: ${graphSource.error}`)
  }
  const readModel = resolvedReadModelPath ? await readJsonSafe<JsonRecord>(resolvedReadModelPath) : undefined
  if (readModel && !readModel.ok) {
    throw new Error(`Unable to read generated read-model from ${input.readModel}: ${readModel.error}`)
  }

  await assertExtensionGapOutputAuthority(root, {
    projectMemory: projectMemory.value,
    graphSource: graphSource.value,
    readModel: readModel?.value,
    resolvedProjectMemoryPath,
    resolvedGraphSourcePath,
    resolvedReadModelPath,
    output: input.output,
    markdown: input.markdown,
  })

  const report = generateProjectMemoryExtensionGapReport(root, {
    projectMemory: projectMemory.value,
    graphSource: graphSource.value,
    readModel: readModel?.value,
    resolvedProjectMemoryPath,
    resolvedGraphSourcePath,
    resolvedReadModelPath,
  })

  let outputPath: string | undefined
  let markdownReport: string | undefined
  if (input.output) {
    const resolvedOutputPath = resolveRepoPath(root, input.output)
    outputPath = relativePath(root, resolvedOutputPath)
    report.writtenOutputPath = outputPath
    await writeJsonAtomic(resolvedOutputPath, report)
  }
  if (input.markdown) {
    const resolvedMarkdownPath = resolveRepoPath(root, input.markdown)
    markdownReport = relativePath(root, resolvedMarkdownPath)
    report.markdownReportPath = markdownReport
    await writeTextAtomic(resolvedMarkdownPath, renderProjectMemoryExtensionGapMarkdown(report))
    if (input.output) {
      await writeJsonAtomic(resolveRepoPath(root, input.output), report)
    }
  }

  return { report, ...(outputPath ? { outputPath } : {}), ...(markdownReport ? { markdownReport } : {}) }
}

export function generateProjectMemoryExtensionGapReport(
  root: string,
  input: {
    projectMemory: JsonRecord
    graphSource: JsonRecord
    readModel?: JsonRecord
    resolvedProjectMemoryPath: string
    resolvedGraphSourcePath: string
    resolvedReadModelPath?: string
  },
): ProjectMemoryExtensionGapReport {
  const findings = validateProjectMemoryGapInputs(input.projectMemory, input.graphSource)
  const taxonomyProfile = asRecord(input.projectMemory.taxonomyProfileRef)
  const viewTreeProfile = asRecord(input.projectMemory.viewTreeProfileRef)
  const expected = {
    coreNodeKinds: uniqueStrings([
      'requirement',
      'task',
      'change',
      'check',
      'evidence',
      'decision',
      'risk',
      ...stringArray(taxonomyProfile?.coreNodeKinds),
    ]),
    extensionNodeKinds: uniqueStrings(stringArray(taxonomyProfile?.extensionNodeKinds)),
    coreEdgeKinds: uniqueStrings([
      'depends-on',
      'touches',
      'preserves',
      'verifies',
      'reports-on',
      'blocks',
      'risks',
      ...stringArray(taxonomyProfile?.coreEdgeKinds),
    ]),
    extensionEdgeKinds: uniqueStrings(stringArray(taxonomyProfile?.extensionEdgeKinds)),
    deprecatedNodeKinds: uniqueStrings(stringArray(taxonomyProfile?.deprecatedNodeKinds)),
    deprecatedEdgeKinds: uniqueStrings(stringArray(taxonomyProfile?.deprecatedEdgeKinds)),
  }
  const observedGraphNodeKinds = observedNodeKinds(input.graphSource, 'kind')
  const observedGraphEdgeKinds = observedEdgeKinds(input.graphSource, 'kind')
  const observedReadModelNodeKinds = input.readModel ? observedNodeKinds(input.readModel, 'nodeKind') : []
  const observedReadModelEdgeKinds = input.readModel ? observedEdgeKinds(input.readModel, 'edgeType') : []
  const observed = {
    graphSourceNodeKinds: observedGraphNodeKinds,
    graphSourceEdgeKinds: observedGraphEdgeKinds,
    readModelNodeKinds: observedReadModelNodeKinds,
    readModelEdgeKinds: observedReadModelEdgeKinds,
    combinedNodeKinds: uniqueStrings([...observedGraphNodeKinds, ...observedReadModelNodeKinds]),
    combinedEdgeKinds: uniqueStrings([...observedGraphEdgeKinds, ...observedReadModelEdgeKinds]),
  }
  const approved = isApprovedAuthorityStatus(stringValue(taxonomyProfile?.authorityStatus))
  const expectedNodeKinds = new Set([...expected.coreNodeKinds, ...expected.extensionNodeKinds])
  const expectedEdgeKinds = new Set([...expected.coreEdgeKinds, ...expected.extensionEdgeKinds])

  const missingKinds = [
    ...expected.extensionNodeKinds
      .filter((kind) => !observed.combinedNodeKinds.includes(kind))
      .map((kind) => vocabularyGap(kind, 'node', 'missing', 'taxonomyProfileRef.extensionNodeKinds')),
    ...expected.extensionEdgeKinds
      .filter((kind) => !observed.combinedEdgeKinds.includes(kind))
      .map((kind) => vocabularyGap(kind, 'edge', 'missing', 'taxonomyProfileRef.extensionEdgeKinds')),
  ]
  const extraObservedKinds = [
    ...observed.combinedNodeKinds
      .filter((kind) => !expectedNodeKinds.has(kind))
      .map((kind) => vocabularyGap(kind, 'node', 'extra-observed', 'graph-source/read-model')),
    ...observed.combinedEdgeKinds
      .filter((kind) => !expectedEdgeKinds.has(kind))
      .map((kind) => vocabularyGap(kind, 'edge', 'extra-observed', 'graph-source/read-model')),
  ]
  const deprecatedKinds = [
    ...expected.deprecatedNodeKinds
      .filter((kind) => observed.combinedNodeKinds.includes(kind))
      .map((kind) => vocabularyGap(kind, 'node', 'deprecated-observed', 'taxonomyProfileRef.deprecatedNodeKinds')),
    ...expected.deprecatedEdgeKinds
      .filter((kind) => observed.combinedEdgeKinds.includes(kind))
      .map((kind) => vocabularyGap(kind, 'edge', 'deprecated-observed', 'taxonomyProfileRef.deprecatedEdgeKinds')),
  ]
  const unapprovedExtensionKinds = approved
    ? []
    : [
        ...expected.extensionNodeKinds.map((kind) =>
          vocabularyGap(kind, 'node', 'unapproved-extension', 'taxonomyProfileRef.extensionNodeKinds'),
        ),
        ...expected.extensionEdgeKinds.map((kind) =>
          vocabularyGap(kind, 'edge', 'unapproved-extension', 'taxonomyProfileRef.extensionEdgeKinds'),
        ),
      ]
  const viewTreeCoverageGaps = buildViewTreeCoverageGaps(viewTreeProfile, missingKinds)
  const blocked = findings.some((finding) => finding.severity === 'error')

  return {
    schemaVersion: 1,
    artifactRole: 'devview-project-memory-extension-gap-report',
    status: blocked
      ? 'devview-project-memory-extension-gap-report-blocked'
      : 'devview-project-memory-extension-gap-report-generated',
    reporterName: REPORTER_NAME,
    reportScope: 'project-memory-taxonomy-extension-gap-report-only',
    sourceProjectMemory: relativePath(root, input.resolvedProjectMemoryPath),
    sourceGraphSource: relativePath(root, input.resolvedGraphSourcePath),
    sourceReadModel: input.resolvedReadModelPath ? relativePath(root, input.resolvedReadModelPath) : null,
    projectMemorySummary: {
      projectMemoryId: stringValue(input.projectMemory.projectMemoryId),
      projectId: stringValue(asRecord(input.projectMemory.projectIdentity)?.projectId),
      projectName: stringValue(asRecord(input.projectMemory.projectIdentity)?.projectName),
      devviewMode: stringValue(input.projectMemory.devviewMode),
      currentDirection: stringValue(asRecord(input.projectMemory.projectDirection)?.current),
      taxonomyProfileId: stringValue(taxonomyProfile?.taxonomyProfileId),
      taxonomyAuthorityStatus: stringValue(taxonomyProfile?.authorityStatus),
      viewTreeProfileId: stringValue(viewTreeProfile?.viewTreeProfileId),
      viewTreeAuthorityStatus: stringValue(viewTreeProfile?.authorityStatus),
    },
    expectedVocabulary: expected,
    observedVocabulary: observed,
    missingKinds,
    extraObservedKinds,
    deprecatedKinds,
    unapprovedExtensionKinds,
    viewTreeCoverageGaps,
    extensionGapDetectorImplemented: true,
    reportOnly: true,
    humanReviewRequired: true,
    graphSourceMutated: false,
    graphDeltaApplied: false,
    approvedProjectMemoryStateImplemented: false,
    traversalPlannerBehaviorChanged: false,
    selectedSliceGenerated: false,
    contractInputGenerated: false,
    instructionPackGenerated: false,
    runtimeEvidenceSatisfied: false,
    equivalenceProven: false,
    scopeEnforced: false,
    ciEnforcementEnabled: false,
    validationFindings: findings,
    outputWritePolicy: 'explicit-output-only',
    writtenOutputPath: null,
    markdownReportPath: null,
    nonAuthorityBoundary:
      'This extension gap report compares Project Memory vocabulary candidates against graph/read-model observations only. It does not approve extensions, mutate graph-source, change traversal, generate selected slices or contracts, satisfy Evidence, prove equivalence, enforce scope, or configure CI.',
  }
}

export function renderProjectMemoryExtensionGapMarkdown(report: ProjectMemoryExtensionGapReport): string {
  return [
    '# DevView Project Memory Extension Gap Report',
    '',
    `Status: \`${report.status}\``,
    '',
    '| Field | Value |',
    '| --- | --- |',
    `| Project | \`${report.projectMemorySummary.projectName || report.projectMemorySummary.projectId}\` |`,
    `| Mode | \`${report.projectMemorySummary.devviewMode}\` |`,
    `| Direction | \`${report.projectMemorySummary.currentDirection}\` |`,
    `| Taxonomy profile | \`${report.projectMemorySummary.taxonomyProfileId}\` |`,
    `| Authority | \`${report.projectMemorySummary.taxonomyAuthorityStatus || 'not-approved'}\` |`,
    `| Missing kinds | \`${report.missingKinds.length}\` |`,
    `| Extra observed kinds | \`${report.extraObservedKinds.length}\` |`,
    `| Unapproved extension kinds | \`${report.unapprovedExtensionKinds.length}\` |`,
    '',
    '## Missing Kinds',
    ...markdownGapList(report.missingKinds),
    '',
    '## Extra Observed Kinds',
    ...markdownGapList(report.extraObservedKinds),
    '',
    '## View Tree Coverage',
    ...markdownViewTreeList(report.viewTreeCoverageGaps),
    '',
    '## Boundary',
    '',
    report.nonAuthorityBoundary,
    '',
  ].join('\n')
}

async function assertExtensionGapOutputAuthority(
  root: string,
  input: {
    projectMemory: JsonRecord
    graphSource: JsonRecord
    readModel?: JsonRecord
    resolvedProjectMemoryPath: string
    resolvedGraphSourcePath: string
    resolvedReadModelPath?: string
    output?: string
    markdown?: string
  },
): Promise<void> {
  if (!input.output && !input.markdown) {
    return
  }
  const targets = [
    ...(input.output
      ? [{ label: 'JSON output', requestedPath: input.output, resolvedPath: resolveRepoPath(root, input.output) }]
      : []),
    ...(input.markdown
      ? [
          {
            label: 'Markdown output',
            requestedPath: input.markdown,
            resolvedPath: resolveRepoPath(root, input.markdown),
          },
        ]
      : []),
  ]
  if (targets.length === 2 && pathKey(targets[0].resolvedPath) === pathKey(targets[1].resolvedPath)) {
    throw new Error(
      'Project Memory extension gap report output is unsafe: --output and --markdown must be different paths.',
    )
  }
  const protectedPaths = buildProtectedPathMap(root, input)
  for (const target of targets) {
    const protectedReason = protectedPaths.get(pathKey(target.resolvedPath))
    if (protectedReason) {
      throw new Error(
        `Project Memory extension gap report ${target.label} path is unsafe: ${target.requestedPath} would overwrite ${protectedReason}.`,
      )
    }
    const existingAuthority = await classifyExistingSourceAuthority(target.resolvedPath)
    if (existingAuthority) {
      throw new Error(
        `Project Memory extension gap report ${target.label} path is unsafe: ${target.requestedPath} already contains ${existingAuthority}.`,
      )
    }
  }
}

function buildProtectedPathMap(
  root: string,
  input: {
    projectMemory: JsonRecord
    graphSource: JsonRecord
    readModel?: JsonRecord
    resolvedProjectMemoryPath: string
    resolvedGraphSourcePath: string
    resolvedReadModelPath?: string
  },
): Map<string, string> {
  const protectedPaths = new Map<string, string>()
  const addResolved = (filePath: string | undefined, reason: string): void => {
    if (!filePath) return
    const key = pathKey(filePath)
    if (!protectedPaths.has(key)) protectedPaths.set(key, reason)
  }
  const add = (candidate: unknown, reason: string): void => {
    const candidatePath = stringValue(candidate)
    if (!isConcreteOutputProtectedPath(candidatePath)) return
    addResolved(resolveRepoPath(root, candidatePath), reason)
  }
  addResolved(input.resolvedProjectMemoryPath, 'the source DevView Project Memory preview')
  addResolved(input.resolvedGraphSourcePath, 'the source graph-source')
  addResolved(input.resolvedReadModelPath, 'the source generated read-model')
  for (const candidatePath of collectConcretePathStrings(input.projectMemory)) {
    add(candidatePath, `Project Memory linked artifact ${candidatePath}`)
  }
  for (const candidatePath of collectConcretePathStrings(input.graphSource)) {
    add(candidatePath, `graph-source linked artifact ${candidatePath}`)
  }
  if (input.readModel) {
    for (const candidatePath of collectConcretePathStrings(input.readModel)) {
      add(candidatePath, `read-model linked artifact ${candidatePath}`)
    }
  }
  return protectedPaths
}

function validateProjectMemoryGapInputs(
  projectMemory: JsonRecord,
  graphSource: JsonRecord,
): ProjectMemoryExtensionGapFinding[] {
  const findings: ProjectMemoryExtensionGapFinding[] = []
  if (projectMemory.artifactRole !== EXPECTED_PROJECT_MEMORY_ROLE) {
    findings.push({
      code: 'PROJECT_MEMORY_ROLE_UNSUPPORTED',
      severity: 'error',
      field: 'projectMemory.artifactRole',
      message: 'Extension gap reporting requires a DevView Project Memory preview.',
      expected: EXPECTED_PROJECT_MEMORY_ROLE,
      actual: projectMemory.artifactRole,
    })
  }
  if (!Array.isArray(graphSource.nodes) || !Array.isArray(graphSource.edges)) {
    findings.push({
      code: 'GRAPH_SOURCE_SHAPE_UNSUPPORTED',
      severity: 'error',
      field: 'graphSource',
      message: 'Extension gap reporting requires a graph-source-shaped artifact with nodes[] and edges[].',
    })
  }
  const taxonomyProfile = asRecord(projectMemory.taxonomyProfileRef)
  if (!taxonomyProfile) {
    findings.push({
      code: 'PROJECT_MEMORY_TAXONOMY_PROFILE_MISSING',
      severity: 'error',
      field: 'projectMemory.taxonomyProfileRef',
      message: 'Project Memory must reference a taxonomy profile before extension gaps can be reported.',
    })
  }
  return findings
}

function buildViewTreeCoverageGaps(
  viewTreeProfile: JsonRecord | null,
  missingKinds: ProjectMemoryVocabularyGap[],
): ProjectMemoryViewTreeCoverageGap[] {
  const authorityStatus = stringValue(viewTreeProfile?.authorityStatus)
  const missingText = new Set(missingKinds.map((gap) => gap.kind))
  return arrayRecords(viewTreeProfile?.viewpointTrees).flatMap((tree) => {
    const treeId = stringValue(tree.treeId)
    const purpose = stringValue(tree.purpose)
    const gaps: ProjectMemoryViewTreeCoverageGap[] = []
    if (!isApprovedAuthorityStatus(authorityStatus)) {
      gaps.push({
        treeId,
        authorityStatus,
        coverageStatus: 'preview-only-not-authoritative',
        reason: 'View tree profile is preview-only and cannot drive traversal or contract authority.',
      })
    }
    for (const kind of missingText) {
      const token = kind.replaceAll('-', ' ')
      if (purpose.toLowerCase().includes(token) || purpose.toLowerCase().includes(kind.toLowerCase())) {
        gaps.push({
          treeId,
          authorityStatus,
          coverageStatus: 'missing-related-extension-kind',
          reason: `View tree purpose references ${kind}, but that extension kind is not observed in the graph/read-model yet.`,
        })
      }
    }
    return gaps
  })
}

function vocabularyGap(
  kind: string,
  kindType: 'node' | 'edge',
  category: ProjectMemoryVocabularyGap['category'],
  source: string,
): ProjectMemoryVocabularyGap {
  const reviewMeaning =
    category === 'missing'
      ? 'Profile expects this extension kind, but the current graph/read-model does not observe it yet.'
      : category === 'extra-observed'
        ? 'The graph/read-model observes this kind, but the Project Memory taxonomy profile does not list it.'
        : category === 'deprecated-observed'
          ? 'The Project Memory taxonomy profile marks this kind deprecated and it is still observed.'
          : 'This extension kind is profile-listed but remains unapproved and cannot be used as authority.'
  return { kind, kindType, category, source, reviewMeaning }
}

function observedNodeKinds(source: JsonRecord, preferredField: 'kind' | 'nodeKind'): string[] {
  return uniqueStrings(
    arrayRecords(source.nodes).map((node) => stringValue(node[preferredField]) || stringValue(node.kind)),
  )
}

function observedEdgeKinds(source: JsonRecord, preferredField: 'kind' | 'edgeType'): string[] {
  return uniqueStrings(
    arrayRecords(source.edges).map((edge) => stringValue(edge[preferredField]) || stringValue(edge.kind)),
  )
}

function isApprovedAuthorityStatus(value: string): boolean {
  return ['approved', 'approved-authority', 'approved-project-memory-revision'].includes(value)
}

async function classifyExistingSourceAuthority(filePath: string): Promise<string | null> {
  const parsed = await readJsonSafe<JsonRecord>(filePath)
  if (!parsed.ok) return null
  const record = asRecord(parsed.value)
  if (!record) return null
  const artifactRole = stringValue(record.artifactRole)
  if (artifactRole === 'devview-project-memory-extension-gap-report') return null
  if (
    artifactRole.includes('graph-source') ||
    artifactRole.includes('project-memory') ||
    artifactRole.includes('instruction-pack') ||
    artifactRole.includes('boundary') ||
    artifactRole.includes('readiness') ||
    artifactRole.includes('proposal') ||
    artifactRole.includes('evidence')
  ) {
    return `source authority artifactRole "${artifactRole}"`
  }
  if (Array.isArray(record.nodes) && Array.isArray(record.edges)) {
    return 'graph/read-model-shaped source artifact'
  }
  return null
}

function markdownGapList(gaps: ProjectMemoryVocabularyGap[]): string[] {
  if (gaps.length === 0) return ['- None']
  return gaps.map((gap) => `- \`${gap.kind}\` (${gap.kindType}, ${gap.category}) - ${gap.reviewMeaning}`)
}

function markdownViewTreeList(gaps: ProjectMemoryViewTreeCoverageGap[]): string[] {
  if (gaps.length === 0) return ['- None']
  return gaps.map((gap) => `- \`${gap.treeId}\` - ${gap.coverageStatus}: ${gap.reason}`)
}

function collectConcretePathStrings(value: unknown): string[] {
  const results: string[] = []
  const visit = (entry: unknown): void => {
    if (typeof entry === 'string') {
      if (isConcreteOutputProtectedPath(entry)) results.push(entry)
      return
    }
    if (Array.isArray(entry)) {
      for (const item of entry) visit(item)
      return
    }
    const record = asRecord(entry)
    if (!record) return
    for (const item of Object.values(record)) visit(item)
  }
  visit(value)
  return uniqueStrings(results)
}

function isConcreteOutputProtectedPath(value: string): boolean {
  return (
    Boolean(value) &&
    !value.includes('\n') &&
    !value.includes('\r') &&
    (value.includes('/') || value.includes('\\')) &&
    !value.startsWith('http://') &&
    !value.startsWith('https://')
  )
}

function resolveRepoPath(root: string, candidate: string): string {
  return path.resolve(root, candidate)
}

function pathKey(filePath: string): string {
  return path.resolve(filePath).replaceAll('\\', '/').toLowerCase()
}

function asRecord(value: unknown): JsonRecord | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as JsonRecord) : null
}

function arrayRecords(value: unknown): JsonRecord[] {
  return Array.isArray(value) ? value.map(asRecord).filter((entry): entry is JsonRecord => Boolean(entry)) : []
}

function stringValue(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? uniqueStrings(value.map(stringValue)) : []
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))].sort()
}
