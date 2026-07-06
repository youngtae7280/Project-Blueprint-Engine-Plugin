import path from 'node:path'
import { readJsonSafe, relativePath, writeJsonAtomic, writeTextAtomic } from './fs.js'
import type { IssueSeverity } from './types.js'

const REPORTER_NAME = 'ProjectMemoryImpactReporter'
const EXPECTED_PROJECT_MEMORY_ROLE = 'devview-project-memory-preview'
const EXPECTED_DIRECTION_CHANGE_ROLE = 'devview-project-direction-change-candidate-preview'

type JsonRecord = Record<string, unknown>

export interface ProjectMemoryImpactFinding {
  code: string
  severity: IssueSeverity
  field?: string
  message: string
  expected?: unknown
  actual?: unknown
  suggestedFix?: string
}

export interface ProjectMemoryImpactReport {
  schemaVersion: 1
  artifactRole: 'devview-project-memory-impact-report'
  status: 'devview-project-memory-impact-report-generated' | 'devview-project-memory-impact-report-blocked'
  reporterName: typeof REPORTER_NAME
  reportScope: 'project-direction-change-impact-report-only'
  sourceProjectMemory: string
  sourceDirectionChange: string
  projectMemorySummary: {
    projectMemoryId: string
    projectId: string
    projectName: string
    devviewMode: string
    currentDirection: string
    taxonomyProfileId: string
    viewTreeProfileId: string
  }
  directionChange: {
    candidateId: string
    currentDirection: string
    proposedDirection: string
    reason: string
    candidateAuthorityStatus: string
  }
  impactSummary: {
    directionChanged: boolean
    preservationPolicyImpact: string[]
    improvementPolicyImpact: string[]
    sourceAuthorityImpact: string[]
    taxonomyImpact: string[]
    viewTreeImpact: string[]
  }
  taxonomyExtensionDeltaProposalRequired: boolean
  viewTreeProfileDeltaProposalRequired: boolean
  humanReviewRequired: true
  approvedProjectMemoryRevisionImplemented: false
  approvedRevisionApplyImplemented: false
  reportOnly: true
  graphSourceMutated: false
  graphDeltaApplied: false
  traversalPlannerBehaviorChanged: false
  selectedSliceGenerated: false
  contractInputGenerated: false
  instructionPackGenerated: false
  runtimeEvidenceSatisfied: false
  equivalenceProven: false
  scopeEnforced: false
  ciEnforcementEnabled: false
  validationFindings: ProjectMemoryImpactFinding[]
  outputWritePolicy: 'explicit-output-only'
  writtenOutputPath: string | null
  markdownReportPath: string | null
  nonAuthorityBoundary: string
}

export interface ProjectMemoryImpactFileResult {
  report: ProjectMemoryImpactReport
  outputPath?: string
  markdownReport?: string
}

export async function reportProjectMemoryImpactFile(
  root: string,
  input: {
    projectMemory: string
    directionChange: string
    output?: string
    markdown?: string
  },
): Promise<ProjectMemoryImpactFileResult> {
  const resolvedProjectMemoryPath = resolveRepoPath(root, input.projectMemory)
  const resolvedDirectionChangePath = resolveRepoPath(root, input.directionChange)
  const projectMemory = await readJsonSafe<JsonRecord>(resolvedProjectMemoryPath)
  if (!projectMemory.ok) {
    throw new Error(`Unable to read DevView Project Memory from ${input.projectMemory}: ${projectMemory.error}`)
  }
  const directionChange = await readJsonSafe<JsonRecord>(resolvedDirectionChangePath)
  if (!directionChange.ok) {
    throw new Error(
      `Unable to read Project Direction Change candidate from ${input.directionChange}: ${directionChange.error}`,
    )
  }

  await assertImpactOutputAuthority(root, {
    projectMemory: projectMemory.value,
    directionChange: directionChange.value,
    resolvedProjectMemoryPath,
    resolvedDirectionChangePath,
    output: input.output,
    markdown: input.markdown,
  })

  const report = generateProjectMemoryImpactReport(root, {
    projectMemory: projectMemory.value,
    directionChange: directionChange.value,
    resolvedProjectMemoryPath,
    resolvedDirectionChangePath,
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
    await writeTextAtomic(resolvedMarkdownPath, renderProjectMemoryImpactMarkdown(report))
    if (input.output) {
      await writeJsonAtomic(resolveRepoPath(root, input.output), report)
    }
  }

  return { report, ...(outputPath ? { outputPath } : {}), ...(markdownReport ? { markdownReport } : {}) }
}

export function generateProjectMemoryImpactReport(
  root: string,
  input: {
    projectMemory: JsonRecord
    directionChange: JsonRecord
    resolvedProjectMemoryPath: string
    resolvedDirectionChangePath: string
  },
): ProjectMemoryImpactReport {
  const findings = validateImpactInputs(root, input)
  const projectDirection = asRecord(input.projectMemory.projectDirection)
  const taxonomyProfile = asRecord(input.projectMemory.taxonomyProfileRef)
  const viewTreeProfile = asRecord(input.projectMemory.viewTreeProfileRef)
  const currentDirection = stringValue(input.directionChange.currentDirection) || stringValue(projectDirection?.current)
  const proposedDirection = stringValue(input.directionChange.proposedDirection)
  const directionChanged = Boolean(proposedDirection && proposedDirection !== currentDirection)
  const blocked = findings.some((finding) => finding.severity === 'error')

  return {
    schemaVersion: 1,
    artifactRole: 'devview-project-memory-impact-report',
    status: blocked ? 'devview-project-memory-impact-report-blocked' : 'devview-project-memory-impact-report-generated',
    reporterName: REPORTER_NAME,
    reportScope: 'project-direction-change-impact-report-only',
    sourceProjectMemory: relativePath(root, input.resolvedProjectMemoryPath),
    sourceDirectionChange: relativePath(root, input.resolvedDirectionChangePath),
    projectMemorySummary: {
      projectMemoryId: stringValue(input.projectMemory.projectMemoryId),
      projectId: stringValue(asRecord(input.projectMemory.projectIdentity)?.projectId),
      projectName: stringValue(asRecord(input.projectMemory.projectIdentity)?.projectName),
      devviewMode: stringValue(input.projectMemory.devviewMode),
      currentDirection: stringValue(projectDirection?.current),
      taxonomyProfileId: stringValue(taxonomyProfile?.taxonomyProfileId),
      viewTreeProfileId: stringValue(viewTreeProfile?.viewTreeProfileId),
    },
    directionChange: {
      candidateId: stringValue(input.directionChange.candidateId),
      currentDirection,
      proposedDirection,
      reason: stringValue(input.directionChange.reason),
      candidateAuthorityStatus: stringValue(input.directionChange.candidateAuthorityStatus),
    },
    impactSummary: {
      directionChanged,
      preservationPolicyImpact: stringArray(input.directionChange.expectedPreservationPolicyImpact),
      improvementPolicyImpact: stringArray(input.directionChange.expectedImprovementPolicyImpact),
      sourceAuthorityImpact: stringArray(input.directionChange.expectedSourceAuthorityImpact),
      taxonomyImpact: stringArray(input.directionChange.expectedTaxonomyImpact),
      viewTreeImpact: stringArray(input.directionChange.expectedViewTreeImpact),
    },
    taxonomyExtensionDeltaProposalRequired: directionChanged,
    viewTreeProfileDeltaProposalRequired: directionChanged,
    humanReviewRequired: true,
    approvedProjectMemoryRevisionImplemented: false,
    approvedRevisionApplyImplemented: false,
    reportOnly: true,
    graphSourceMutated: false,
    graphDeltaApplied: false,
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
      'This Project Memory impact report reads a direction-change candidate only. It does not approve a project memory revision, apply taxonomy or view tree changes, mutate graph-source, change traversal, generate selected slices or contracts, satisfy Evidence, prove equivalence, enforce scope, or configure CI.',
  }
}

export function renderProjectMemoryImpactMarkdown(report: ProjectMemoryImpactReport): string {
  return [
    '# DevView Project Memory Impact Report',
    '',
    `Status: \`${report.status}\``,
    '',
    '| Field | Value |',
    '| --- | --- |',
    `| Project | \`${report.projectMemorySummary.projectName || report.projectMemorySummary.projectId}\` |`,
    `| Mode | \`${report.projectMemorySummary.devviewMode}\` |`,
    `| Current direction | \`${report.directionChange.currentDirection}\` |`,
    `| Proposed direction | \`${report.directionChange.proposedDirection}\` |`,
    `| Taxonomy delta proposal required | \`${report.taxonomyExtensionDeltaProposalRequired}\` |`,
    `| View tree delta proposal required | \`${report.viewTreeProfileDeltaProposalRequired}\` |`,
    `| Human review required | \`${report.humanReviewRequired}\` |`,
    '',
    '## Preservation Policy Impact',
    ...markdownList(report.impactSummary.preservationPolicyImpact),
    '',
    '## Improvement Policy Impact',
    ...markdownList(report.impactSummary.improvementPolicyImpact),
    '',
    '## Source Authority Impact',
    ...markdownList(report.impactSummary.sourceAuthorityImpact),
    '',
    '## Taxonomy Impact',
    ...markdownList(report.impactSummary.taxonomyImpact),
    '',
    '## View Tree Impact',
    ...markdownList(report.impactSummary.viewTreeImpact),
    '',
    '## Boundary',
    '',
    report.nonAuthorityBoundary,
    '',
  ].join('\n')
}

async function assertImpactOutputAuthority(
  root: string,
  input: {
    projectMemory: JsonRecord
    directionChange: JsonRecord
    resolvedProjectMemoryPath: string
    resolvedDirectionChangePath: string
    output?: string
    markdown?: string
  },
): Promise<void> {
  if (!input.output && !input.markdown) return
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
    throw new Error('Project Memory impact report output is unsafe: --output and --markdown must be different paths.')
  }
  const protectedPaths = buildProtectedPathMap(root, input)
  for (const target of targets) {
    const protectedReason = protectedPaths.get(pathKey(target.resolvedPath))
    if (protectedReason) {
      throw new Error(
        `Project Memory impact report ${target.label} path is unsafe: ${target.requestedPath} would overwrite ${protectedReason}.`,
      )
    }
    const existingAuthority = await classifyExistingSourceAuthority(target.resolvedPath)
    if (existingAuthority) {
      throw new Error(
        `Project Memory impact report ${target.label} path is unsafe: ${target.requestedPath} already contains ${existingAuthority}.`,
      )
    }
  }
}

function validateImpactInputs(
  root: string,
  input: { projectMemory: JsonRecord; directionChange: JsonRecord; resolvedProjectMemoryPath: string },
): ProjectMemoryImpactFinding[] {
  const findings: ProjectMemoryImpactFinding[] = []
  if (input.projectMemory.artifactRole !== EXPECTED_PROJECT_MEMORY_ROLE) {
    findings.push({
      code: 'PROJECT_MEMORY_ROLE_UNSUPPORTED',
      severity: 'error',
      field: 'projectMemory.artifactRole',
      message: 'Impact reporting requires a DevView Project Memory preview.',
      expected: EXPECTED_PROJECT_MEMORY_ROLE,
      actual: input.projectMemory.artifactRole,
    })
  }
  if (input.directionChange.artifactRole !== EXPECTED_DIRECTION_CHANGE_ROLE) {
    findings.push({
      code: 'DIRECTION_CHANGE_ROLE_UNSUPPORTED',
      severity: 'error',
      field: 'directionChange.artifactRole',
      message: 'Impact reporting requires a Project Direction Change candidate preview.',
      expected: EXPECTED_DIRECTION_CHANGE_ROLE,
      actual: input.directionChange.artifactRole,
    })
  }
  const sourceProjectMemory = stringValue(input.directionChange.sourceProjectMemory)
  if (
    sourceProjectMemory &&
    pathKey(resolveRepoPath(root, sourceProjectMemory)) !== pathKey(input.resolvedProjectMemoryPath)
  ) {
    findings.push({
      code: 'DIRECTION_CHANGE_PROJECT_MEMORY_PROVENANCE_MISMATCH',
      severity: 'error',
      field: 'directionChange.sourceProjectMemory',
      message: 'Direction change candidate sourceProjectMemory must match the CLI --project-memory input.',
      expected: relativePath(root, input.resolvedProjectMemoryPath),
      actual: sourceProjectMemory,
    })
  }
  const currentDirection = stringValue(asRecord(input.projectMemory.projectDirection)?.current)
  if (stringValue(input.directionChange.currentDirection) !== currentDirection) {
    findings.push({
      code: 'DIRECTION_CHANGE_CURRENT_DIRECTION_MISMATCH',
      severity: 'error',
      field: 'directionChange.currentDirection',
      message: 'Direction change candidate currentDirection must match Project Memory current direction.',
      expected: currentDirection,
      actual: input.directionChange.currentDirection,
    })
  }
  for (const field of [
    'approved',
    'applied',
    'graphTraversalAllowed',
    'contractGenerationAllowed',
    'instructionPackGenerationAllowed',
    'runtimeEvidenceSatisfied',
    'equivalenceProven',
  ]) {
    if (input.directionChange[field] === true) {
      findings.push({
        code: 'DIRECTION_CHANGE_AUTHORITY_ESCALATION_FORBIDDEN',
        severity: 'error',
        field: `directionChange.${field}`,
        message: `Direction change candidates cannot set ${field}: true.`,
        expected: false,
        actual: true,
      })
    }
  }
  return findings
}

function buildProtectedPathMap(
  root: string,
  input: {
    projectMemory: JsonRecord
    directionChange: JsonRecord
    resolvedProjectMemoryPath: string
    resolvedDirectionChangePath: string
  },
): Map<string, string> {
  const protectedPaths = new Map<string, string>()
  const addResolved = (filePath: string, reason: string): void => {
    const key = pathKey(filePath)
    if (!protectedPaths.has(key)) protectedPaths.set(key, reason)
  }
  const add = (candidate: unknown, reason: string): void => {
    const candidatePath = stringValue(candidate)
    if (!isConcreteOutputProtectedPath(candidatePath)) return
    addResolved(resolveRepoPath(root, candidatePath), reason)
  }
  addResolved(input.resolvedProjectMemoryPath, 'the source DevView Project Memory preview')
  addResolved(input.resolvedDirectionChangePath, 'the source Project Direction Change candidate')
  for (const candidatePath of collectConcretePathStrings(input.projectMemory)) {
    add(candidatePath, `Project Memory linked artifact ${candidatePath}`)
  }
  for (const candidatePath of collectConcretePathStrings(input.directionChange)) {
    add(candidatePath, `Direction Change linked artifact ${candidatePath}`)
  }
  return protectedPaths
}

async function classifyExistingSourceAuthority(filePath: string): Promise<string | null> {
  const parsed = await readJsonSafe<JsonRecord>(filePath)
  if (!parsed.ok) return null
  const record = asRecord(parsed.value)
  if (!record) return null
  const artifactRole = stringValue(record.artifactRole)
  if (artifactRole === 'devview-project-memory-impact-report') return null
  if (
    artifactRole.includes('graph-source') ||
    artifactRole.includes('project-memory') ||
    artifactRole.includes('direction-change') ||
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

function markdownList(values: string[]): string[] {
  return values.length > 0 ? values.map((value) => `- ${value}`) : ['- None']
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

function stringValue(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? uniqueStrings(value.map(stringValue)) : []
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))].sort()
}
