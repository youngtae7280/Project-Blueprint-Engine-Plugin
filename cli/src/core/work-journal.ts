import { existsSync } from 'node:fs'
import path from 'node:path'
import { mkdir } from 'node:fs/promises'
import { readJsonSafe, relativePath, writeJsonAtomic, writeTextAtomic } from './fs.js'
import {
  hasCodexControlDirectory,
  hasDevViewControlDirectory,
  hasHiddenControlDirectorySegment,
} from './path-safety.js'

type JsonRecord = Record<string, unknown>

const DATA_ROLE = 'devview-work-journal-data-preview'
const HTML_ROLE = 'devview-work-journal-html-preview'

const unsafeAuthorityFields = [
  'runtimeEvidenceSatisfied',
  'evidenceAccepted',
  'equivalenceProven',
  'scopeEnforced',
  'ciEnforcementEnabled',
  'graphSourceMutated',
  'graphDeltaApplied',
  'approvalAutomationEnabled',
  'userAcceptanceAutomated',
  'providerInvoked',
  'networkCallMade',
  'extensionExecutionAllowed',
  'extensionsExecuted',
  'shellCommandsExecuted',
  'filesMutated',
]

export interface WorkJournalRenderOptions {
  runId: string
  title?: string
  baseline: string
  graphSource?: string
  viewTree?: string
  contractInput?: string
  instructionPack?: string
  extensionReadiness?: string
  runtimeEvidenceSatisfactionReadiness?: string
  equivalenceProofReadiness?: string
  scopeCiEnforcementReadiness?: string
  proposal?: string
  applyReport?: string
  output?: string
  dataOutput?: string
  runOutput?: string
}

export interface WorkJournalRenderFileResult {
  journal: WorkJournalDataPreview
  outputPath: string
  dataOutputPath: string
  runOutputPath: string
}

export interface WorkJournalArtifactSummary {
  sourceId: string
  label: string
  path: string | null
  artifactRole: string | null
  status: string | null
  authorityStatus: 'source-summary-only-no-new-authority'
  classification: 'completed' | 'advisory' | 'blocked' | 'not-provided'
}

export interface WorkJournalFlowStep {
  stepId: string
  label: string
  summary: string
  sourceId: string
  status: string
  authority: 'preview-only' | 'source-summary-only' | 'blocked' | 'not-provided'
}

export interface WorkJournalRunPreview {
  runId: string
  title: string
  status: 'ready-for-review' | 'blocked' | 'advisory'
  nextAction: string
  blockedReason: string | null
  flow: WorkJournalFlowStep[]
  artifacts: WorkJournalArtifactSummary[]
  auditProvenance: Array<{ sourceId: string; path: string; artifactRole: string | null; status: string | null }>
}

export interface WorkJournalDataPreview {
  schemaVersion: 1
  artifactRole: typeof DATA_ROLE
  htmlArtifactRole: typeof HTML_ROLE
  status: 'devview-work-journal-data-generated'
  journalScope: 'cumulative-static-work-journal-preview'
  currentRunId: string
  runs: WorkJournalRunPreview[]
  safetyFlags: {
    staticHtmlOnly: true
    providerInvoked: false
    networkCallMade: false
    extensionExecutionAllowed: false
    extensionsExecuted: false
    shellCommandsExecuted: false
    filesMutatedOutsideExplicitOutputs: false
    graphSourceMutated: false
    graphDeltaApplied: false
    runtimeEvidenceSatisfied: false
    evidenceAccepted: false
    equivalenceProven: false
    scopeEnforced: false
    ciEnforcementEnabled: false
    approvalAutomationEnabled: false
    userAcceptanceAutomated: false
    nonEnforcing: true
  }
  outputPaths: {
    htmlOutputPath: string
    dataOutputPath: string
    runOutputPath: string
  }
  nonExecutionBoundary: string
}

interface LoadedArtifact {
  sourceId: string
  label: string
  path: string | null
  resolvedPath: string | null
  record: JsonRecord | null
}

const SOURCE_DEFS = [
  { sourceId: 'baseline', label: 'DevView baseline freeze', optionKey: 'baseline' },
  { sourceId: 'maintainability-graph', label: 'Maintainability Graph', optionKey: 'graphSource' },
  { sourceId: 'view-tree', label: 'View Tree', optionKey: 'viewTree' },
  { sourceId: 'context-pack', label: 'Context Pack / Contract Input', optionKey: 'contractInput' },
  { sourceId: 'instruction-pack', label: 'Instruction Pack', optionKey: 'instructionPack' },
  { sourceId: 'extension-readiness', label: 'Extension readiness', optionKey: 'extensionReadiness' },
  {
    sourceId: 'runtime-evidence-satisfaction',
    label: 'Runtime Evidence satisfaction readiness',
    optionKey: 'runtimeEvidenceSatisfactionReadiness',
  },
  { sourceId: 'equivalence-proof', label: 'Equivalence proof readiness', optionKey: 'equivalenceProofReadiness' },
  { sourceId: 'scope-ci', label: 'Scope/CI readiness', optionKey: 'scopeCiEnforcementReadiness' },
  { sourceId: 'graph-delta', label: 'Graph Delta proposal', optionKey: 'proposal' },
  { sourceId: 'guarded-update', label: 'Guarded graph update status', optionKey: 'applyReport' },
] as const

export async function renderWorkJournalFile(
  root: string,
  options: WorkJournalRenderOptions,
): Promise<WorkJournalRenderFileResult> {
  validateOptions(options)
  const sources = await loadSources(root, options)
  validateSources(sources)

  const outputPath = resolveRepoPath(root, options.output ?? '')
  const dataOutputPath = resolveRepoPath(root, options.dataOutput ?? '')
  const runOutputPath = resolveRepoPath(root, options.runOutput ?? '')
  await assertWorkJournalOutputAuthority(root, sources, { outputPath, dataOutputPath, runOutputPath })

  const previousJournal = await loadPreviousWorkJournalData(dataOutputPath)
  const journal = buildWorkJournalData(
    root,
    options,
    sources,
    { outputPath, dataOutputPath, runOutputPath },
    previousJournal,
  )
  await mkdir(path.dirname(outputPath), { recursive: true })
  await mkdir(path.dirname(dataOutputPath), { recursive: true })
  await mkdir(path.dirname(runOutputPath), { recursive: true })
  await writeTextAtomic(outputPath, renderWorkJournalHtml(journal))
  await writeJsonAtomic(dataOutputPath, journal)
  await writeJsonAtomic(runOutputPath, journal.runs[0])

  return {
    journal,
    outputPath: relativePath(root, outputPath),
    dataOutputPath: relativePath(root, dataOutputPath),
    runOutputPath: relativePath(root, runOutputPath),
  }
}

function validateOptions(options: WorkJournalRenderOptions): void {
  if (!options.runId) throw new Error('work-journal render requires --run-id <id>.')
  if (!/^[a-z0-9][a-z0-9._-]*$/i.test(options.runId)) {
    throw new Error('work-journal render requires --run-id to be a simple stable identifier.')
  }
  if (!options.baseline) throw new Error('work-journal render requires --baseline <baselineFreezeJson>.')
  if (!options.output) throw new Error('work-journal render requires --output <indexHtml>.')
  if (!options.dataOutput) throw new Error('work-journal render requires --data-output <indexDataJson>.')
  if (!options.runOutput) throw new Error('work-journal render requires --run-output <runJson>.')
}

async function loadSources(root: string, options: WorkJournalRenderOptions): Promise<LoadedArtifact[]> {
  const loaded: LoadedArtifact[] = []
  for (const def of SOURCE_DEFS) {
    const requested = options[def.optionKey]
    if (!requested) {
      loaded.push({ sourceId: def.sourceId, label: def.label, path: null, resolvedPath: null, record: null })
      continue
    }
    const resolvedPath = resolveRepoPath(root, requested)
    const parsed = await readJsonSafe<JsonRecord>(resolvedPath)
    if (!parsed.ok) {
      throw new Error(`Unable to read ${def.label}: ${parsed.error}`)
    }
    const record = asRecord(parsed.value)
    if (!record) {
      throw new Error(`Unable to read ${def.label}: expected JSON object.`)
    }
    loaded.push({
      sourceId: def.sourceId,
      label: def.label,
      path: relativePath(root, resolvedPath),
      resolvedPath,
      record,
    })
  }
  return loaded
}

function validateSources(sources: LoadedArtifact[]): void {
  for (const source of sources) {
    if (!source.record) continue
    const allowAcceptedEvidenceSourceFact = source.sourceId === 'runtime-evidence-satisfaction'
    const unsafe = collectUnsafeAuthorityHits(source.record, [], new Set(), allowAcceptedEvidenceSourceFact)
    if (unsafe.length > 0) {
      throw new Error(`Work Journal source ${source.label} has unsafe true authority field ${unsafe[0].field}.`)
    }
  }
}

function buildWorkJournalData(
  root: string,
  options: WorkJournalRenderOptions,
  sources: LoadedArtifact[],
  outputs: { outputPath: string; dataOutputPath: string; runOutputPath: string },
  previousJournal: WorkJournalDataPreview | null,
): WorkJournalDataPreview {
  const artifacts = sources.map((source) => summarizeArtifact(source))
  const blocked = artifacts.find((artifact) => artifact.classification === 'blocked')
  const run: WorkJournalRunPreview = {
    runId: options.runId,
    title: options.title || options.runId,
    status: blocked ? 'blocked' : 'ready-for-review',
    nextAction: blocked
      ? `Review blocked stage: ${blocked.label}.`
      : 'Review the work journal and decide the next human action.',
    blockedReason: blocked ? `${blocked.label} is ${blocked.status ?? 'blocked'}.` : null,
    flow: buildFlow(artifacts),
    artifacts,
    auditProvenance: artifacts
      .filter((artifact) => artifact.path)
      .map((artifact) => ({
        sourceId: artifact.sourceId,
        path: artifact.path ?? '',
        artifactRole: artifact.artifactRole,
        status: artifact.status,
      })),
  }
  const runs = mergeWorkJournalRuns(previousJournal, run)
  return {
    schemaVersion: 1,
    artifactRole: DATA_ROLE,
    htmlArtifactRole: HTML_ROLE,
    status: 'devview-work-journal-data-generated',
    journalScope: 'cumulative-static-work-journal-preview',
    currentRunId: options.runId,
    runs,
    safetyFlags: {
      staticHtmlOnly: true,
      providerInvoked: false,
      networkCallMade: false,
      extensionExecutionAllowed: false,
      extensionsExecuted: false,
      shellCommandsExecuted: false,
      filesMutatedOutsideExplicitOutputs: false,
      graphSourceMutated: false,
      graphDeltaApplied: false,
      runtimeEvidenceSatisfied: false,
      evidenceAccepted: false,
      equivalenceProven: false,
      scopeEnforced: false,
      ciEnforcementEnabled: false,
      approvalAutomationEnabled: false,
      userAcceptanceAutomated: false,
      nonEnforcing: true,
    },
    outputPaths: {
      htmlOutputPath: relativePath(root, outputs.outputPath),
      dataOutputPath: relativePath(root, outputs.dataOutputPath),
      runOutputPath: relativePath(root, outputs.runOutputPath),
    },
    nonExecutionBoundary:
      'This DevView Work Journal is a static visualization/report artifact. It does not execute extension code, call providers or networks, mutate graph-source, apply graph deltas, satisfy runtime Evidence, accept Evidence, prove equivalence, enforce scope, configure CI, activate hooks, automate approval, or replace user acceptance.',
  }
}

async function loadPreviousWorkJournalData(dataOutputPath: string): Promise<WorkJournalDataPreview | null> {
  if (!existsSync(dataOutputPath)) return null
  const parsed = await readJsonSafe<JsonRecord>(dataOutputPath)
  if (!parsed.ok) {
    throw new Error(`Existing Work Journal data output is not readable JSON: ${parsed.error}`)
  }
  const record = asRecord(parsed.value)
  if (!record || record.artifactRole !== DATA_ROLE || !Array.isArray(record.runs)) {
    throw new Error('Existing Work Journal data output must be a devview-work-journal-data-preview artifact.')
  }
  const unsafe = collectUnsafeAuthorityHits(record)
  if (unsafe.length > 0) {
    throw new Error(`Existing Work Journal data output has unsafe true authority field ${unsafe[0].field}.`)
  }
  return record as unknown as WorkJournalDataPreview
}

function mergeWorkJournalRuns(
  previousJournal: WorkJournalDataPreview | null,
  currentRun: WorkJournalRunPreview,
): WorkJournalRunPreview[] {
  const previousRuns = previousJournal?.runs ?? []
  const retainedRuns = previousRuns.filter(
    (run) => isWorkJournalRunPreview(run) && run.runId !== currentRun.runId,
  ) as WorkJournalRunPreview[]
  return [...retainedRuns, currentRun]
}

function isWorkJournalRunPreview(value: unknown): value is WorkJournalRunPreview {
  const record = asRecord(value)
  return Boolean(record && typeof record.runId === 'string' && typeof record.title === 'string')
}

function summarizeArtifact(source: LoadedArtifact): WorkJournalArtifactSummary {
  if (!source.record) {
    return {
      sourceId: source.sourceId,
      label: source.label,
      path: null,
      artifactRole: null,
      status: null,
      authorityStatus: 'source-summary-only-no-new-authority',
      classification: 'not-provided',
    }
  }
  const status = stringValue(source.record.status)
  return {
    sourceId: source.sourceId,
    label: source.label,
    path: source.path,
    artifactRole: stringValue(source.record.artifactRole) || null,
    status: status || null,
    authorityStatus: 'source-summary-only-no-new-authority',
    classification: classifyArtifact(source.sourceId, status),
  }
}

function classifyArtifact(sourceId: string, status: string): WorkJournalArtifactSummary['classification'] {
  const normalized = status.toLowerCase()
  if (normalized.includes('blocked')) return 'blocked'
  if (sourceId === 'baseline') return 'completed'
  if (sourceId === 'runtime-evidence-satisfaction') return normalized.includes('ready') ? 'advisory' : 'blocked'
  if (sourceId === 'equivalence-proof' || sourceId === 'scope-ci')
    return normalized.includes('ready') ? 'advisory' : 'blocked'
  if (sourceId === 'guarded-update')
    return normalized.includes('applied') ? 'advisory' : normalized.includes('blocked') ? 'blocked' : 'advisory'
  return 'advisory'
}

function buildFlow(artifacts: WorkJournalArtifactSummary[]): WorkJournalFlowStep[] {
  const labels: Array<[string, string, string]> = [
    ['maintainability-graph', 'Maintainability Graph', 'Source model for project structure and change context.'],
    ['view-tree', 'View Tree', 'Task-shaped projection from the Maintainability Graph.'],
    ['context-pack', 'Context Pack', 'Bounded subgraph package with scope and constraints.'],
    ['instruction-pack', 'Instruction Pack', 'AI/Codex-facing instruction artifact.'],
    ['extension-readiness', 'Project Extensions', 'Project profile and extension manifest readiness.'],
    [
      'runtime-evidence-satisfaction',
      'Runtime Evidence',
      'Runtime obligation binding readiness or future satisfaction.',
    ],
    ['equivalence-proof', 'Equivalence Proof', 'Proof/readiness state for semantic equivalence.'],
    ['graph-delta', 'Graph Delta', 'Proposed Maintainability Graph update.'],
    ['guarded-update', 'Guarded Update', 'Apply/blocked graph update status.'],
    ['scope-ci', 'Scope/CI', 'Scope and CI enforcement readiness state.'],
  ]
  return labels.map(([sourceId, label, summary]) => {
    const artifact = artifacts.find((entry) => entry.sourceId === sourceId)
    const classification = artifact?.classification ?? 'not-provided'
    return {
      stepId: sourceId,
      label,
      summary,
      sourceId,
      status: artifact?.status ?? classification,
      authority:
        classification === 'blocked'
          ? 'blocked'
          : classification === 'not-provided'
            ? 'not-provided'
            : sourceId === 'baseline'
              ? 'source-summary-only'
              : 'preview-only',
    }
  })
}

async function assertWorkJournalOutputAuthority(
  root: string,
  sources: LoadedArtifact[],
  outputs: { outputPath: string; dataOutputPath: string; runOutputPath: string },
): Promise<void> {
  const targets = [
    ['HTML output', outputs.outputPath],
    ['data output', outputs.dataOutputPath],
    ['run output', outputs.runOutputPath],
  ] as const
  const seen = new Map<string, string>()
  for (const [label, resolvedPath] of targets) {
    const key = pathKey(resolvedPath)
    const previous = seen.get(key)
    if (previous) {
      throw new Error(`Work Journal output is unsafe: ${label} collides with ${previous}.`)
    }
    seen.set(key, label)
  }

  const protectedPaths = buildProtectedPathMap(root, sources)
  for (const [label, resolvedPath] of targets) {
    const protectedReason = protectedPaths.get(pathKey(resolvedPath))
    if (protectedReason) {
      throw new Error(
        `Work Journal ${label} path is unsafe: ${relativePath(root, resolvedPath)} would overwrite ${protectedReason}.`,
      )
    }
    if (isProtectedControlPath(root, resolvedPath)) {
      throw new Error(
        `Work Journal ${label} path is unsafe: ${relativePath(root, resolvedPath)} is inside a protected source/control path.`,
      )
    }
    const existingAuthority = await classifyExistingSourceAuthority(resolvedPath)
    if (existingAuthority) {
      throw new Error(
        `Work Journal ${label} path is unsafe: ${relativePath(root, resolvedPath)} already contains ${existingAuthority}.`,
      )
    }
  }
}

function buildProtectedPathMap(root: string, sources: LoadedArtifact[]): Map<string, string> {
  const protectedPaths = new Map<string, string>()
  const addResolved = (candidatePath: string | null, reason: string): void => {
    if (candidatePath) protectedPaths.set(pathKey(candidatePath), reason)
  }
  for (const source of sources) {
    addResolved(source.resolvedPath, `source ${source.label}`)
    if (source.record) {
      for (const candidatePath of collectConcretePathStrings(source.record)) {
        addResolved(resolveRepoPath(root, candidatePath), `linked source artifact ${candidatePath}`)
      }
    }
  }
  return protectedPaths
}

function isProtectedControlPath(root: string, filePath: string): boolean {
  const relative = relativePath(root, filePath)
  if (isAllowedWorkJournalOutput(relative)) return false
  return (
    hasDevViewControlDirectory(relative) ||
    hasCodexControlDirectory(relative) ||
    hasHiddenControlDirectorySegment(relative) ||
    isProtectedRepoSourcePath(relative)
  )
}

function isAllowedWorkJournalOutput(filePath: string): boolean {
  const normalized = filePath.replaceAll('\\', '/').toLowerCase()
  return (
    normalized.startsWith('.devview/generated/work-journal/') ||
    normalized.includes('/.devview/generated/work-journal/')
  )
}

function isProtectedRepoSourcePath(filePath: string): boolean {
  const normalized = filePath.replaceAll('\\', '/').toLowerCase()
  if (
    [
      'readme.md',
      'agents.md',
      'changelog.md',
      'release.md',
      'package.json',
      'package-lock.json',
      'tsconfig.cli.json',
    ].includes(normalized)
  ) {
    return true
  }
  return ['.github/', 'cli/src/', 'docs/', 'examples/', 'schemas/', 'scripts/', 'skills/', 'templates/'].some(
    (prefix) => normalized.startsWith(prefix),
  )
}

async function classifyExistingSourceAuthority(filePath: string): Promise<string | null> {
  const parsed = await readJsonSafe<JsonRecord>(filePath)
  if (!parsed.ok) return null
  const record = asRecord(parsed.value)
  const artifactRole = stringValue(record?.artifactRole)
  if (!artifactRole || artifactRole === DATA_ROLE) return null
  if (
    artifactRole.includes('graph-source') ||
    artifactRole.includes('read-model') ||
    artifactRole.includes('evidence')
  ) {
    return `source artifactRole "${artifactRole}"`
  }
  if (artifactRole.startsWith('devview-')) return `generated DevView artifactRole "${artifactRole}"`
  if (asRecord(record?.sourceRecords)) return 'source-authority-shaped sourceRecords'
  return null
}

function renderWorkJournalHtml(journal: WorkJournalDataPreview): string {
  const dataJson = JSON.stringify(journal, null, 2)
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>DevView Work Journal</title>
  <style>
    :root { color-scheme: light; font-family: Inter, Segoe UI, Arial, sans-serif; background: #f6f7f9; color: #20242c; }
    body { margin: 0; }
    header { padding: 28px 32px 18px; background: #ffffff; border-bottom: 1px solid #d7dce3; }
    h1 { margin: 0; font-size: 26px; letter-spacing: 0; }
    .sub { margin-top: 8px; color: #5b6472; max-width: 880px; line-height: 1.5; }
    main { display: grid; grid-template-columns: minmax(260px, 330px) 1fr; gap: 18px; padding: 18px; }
    aside, section { background: #ffffff; border: 1px solid #d7dce3; border-radius: 8px; }
    aside { padding: 14px; }
    section { padding: 18px; }
    button { width: 100%; text-align: left; border: 1px solid #cbd2dc; background: #fbfcfd; border-radius: 6px; padding: 10px; cursor: pointer; }
    button.active { border-color: #2364aa; background: #eef5ff; }
    .status { display: inline-block; padding: 3px 7px; border-radius: 999px; background: #edf0f4; font-size: 12px; }
    .blocked { background: #fff0ed; color: #9b2f1f; }
    .advisory { background: #eef5ff; color: #174f8c; }
    .timeline { display: grid; gap: 10px; margin-top: 16px; }
    .step { border: 1px solid #d7dce3; border-radius: 6px; padding: 12px; }
    .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(230px, 1fr)); gap: 10px; margin-top: 14px; }
    .artifact { border: 1px solid #d7dce3; border-radius: 6px; padding: 10px; overflow-wrap: anywhere; }
    code { font-family: Consolas, monospace; font-size: 12px; }
    @media (max-width: 820px) { main { grid-template-columns: 1fr; } }
  </style>
</head>
<body>
  <header>
    <h1>DevView Work Journal</h1>
    <div class="sub">A static, cumulative journal of DevView work. It summarizes Maintainability Graph context, View Tree, Context Pack, Instruction Pack, Evidence, proof/readiness, Graph Delta, guarded update, and audit provenance without creating authority.</div>
  </header>
  <main>
    <aside>
      <h2>Works</h2>
      <div id="run-list"></div>
    </aside>
    <section>
      <div id="detail"></div>
    </section>
  </main>
  <script type="application/json" id="journal-data">${escapeHtml(dataJson)}</script>
  <script>
    const data = JSON.parse(document.getElementById('journal-data').textContent);
    let selected = data.currentRunId;
    function esc(value) {
      return String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
    }
    function render() {
      const runs = data.runs || [];
      document.getElementById('run-list').innerHTML = runs.map((run) => '<button class="' + (run.runId === selected ? 'active' : '') + '" data-run="' + esc(run.runId) + '"><strong>' + esc(run.title) + '</strong><br><span class="status ' + esc(run.status) + '">' + esc(run.status) + '</span></button>').join('');
      document.querySelectorAll('[data-run]').forEach((button) => button.addEventListener('click', () => { selected = button.getAttribute('data-run'); render(); }));
      const run = runs.find((entry) => entry.runId === selected) || runs[0];
      if (!run) return;
      document.getElementById('detail').innerHTML = '<h2>' + esc(run.title) + '</h2><p><span class="status ' + esc(run.status) + '">' + esc(run.status) + '</span></p><p><strong>Next action:</strong> ' + esc(run.nextAction) + '</p>' + (run.blockedReason ? '<p><strong>Blocked reason:</strong> ' + esc(run.blockedReason) + '</p>' : '') + '<h3>Flow Timeline</h3><div class="timeline">' + run.flow.map((step) => '<div class="step"><strong>' + esc(step.label) + '</strong><br>' + esc(step.summary) + '<br><code>' + esc(step.status) + '</code></div>').join('') + '</div><h3>Artifacts / Audit Provenance</h3><div class="grid">' + run.artifacts.map((artifact) => '<div class="artifact"><strong>' + esc(artifact.label) + '</strong><br><code>' + esc(artifact.path || 'not provided') + '</code><br>' + esc(artifact.artifactRole || 'no role') + '<br><span class="status ' + esc(artifact.classification) + '">' + esc(artifact.classification) + '</span></div>').join('') + '</div><h3>Safety</h3><p>' + esc(data.nonExecutionBoundary) + '</p>';
    }
    render();
  </script>
</body>
</html>
`
}

function collectUnsafeAuthorityHits(
  value: unknown,
  pathParts: string[] = [],
  seen = new Set<unknown>(),
  allowAcceptedEvidenceSourceFact = false,
): Array<{ field: string }> {
  if (typeof value !== 'object' || value === null || seen.has(value)) return []
  seen.add(value)
  if (Array.isArray(value)) {
    return value.flatMap((entry, index) =>
      collectUnsafeAuthorityHits(entry, [...pathParts, String(index)], seen, allowAcceptedEvidenceSourceFact),
    )
  }
  const record = value as JsonRecord
  const hits: Array<{ field: string }> = []
  for (const [key, entry] of Object.entries(record)) {
    const nextPath = [...pathParts, key]
    if (
      unsafeAuthorityFields.includes(key) &&
      entry === true &&
      !(allowAcceptedEvidenceSourceFact && key === 'sourceAcceptedEvidenceAccepted')
    ) {
      hits.push({ field: nextPath.join('.') })
    }
    hits.push(...collectUnsafeAuthorityHits(entry, nextPath, seen, allowAcceptedEvidenceSourceFact))
  }
  return hits
}

function collectConcretePathStrings(value: unknown, seen = new Set<unknown>()): string[] {
  if (typeof value === 'string') return isConcretePath(value) ? [value] : []
  if (typeof value !== 'object' || value === null || seen.has(value)) return []
  seen.add(value)
  if (Array.isArray(value)) return value.flatMap((entry) => collectConcretePathStrings(entry, seen))
  return Object.values(value as JsonRecord).flatMap((entry) => collectConcretePathStrings(entry, seen))
}

function isConcretePath(value: string): boolean {
  return (
    (value.includes('/') || value.includes('\\') || value.startsWith('.')) &&
    /\.(json|md|html|txt|js|ts|yaml|yml)$/i.test(value)
  )
}

function resolveRepoPath(root: string, filePath: string): string {
  return path.isAbsolute(filePath) ? filePath : path.resolve(root, filePath)
}

function pathKey(filePath: string): string {
  return path.resolve(filePath).replaceAll('\\', '/').toLowerCase()
}

function asRecord(value: unknown): JsonRecord | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as JsonRecord) : null
}

function stringValue(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => {
    const escaped: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }
    return escaped[char] ?? char
  })
}
