import path from 'node:path'
import { readJsonSafe, relativePath, writeJsonAtomic, writeTextAtomic } from './fs.js'
import type { IssueSeverity } from './types.js'

const GENERATOR_NAME = 'HookSessionManifestPreviewGenerator'
const REQUIRED_HOOK_EVENTS = ['SessionStart', 'UserPromptSubmit', 'PreToolUse', 'PostToolUse', 'Stop']

type JsonRecord = Record<string, unknown>

export interface HookSessionManifestFinding {
  code: string
  severity: IssueSeverity
  field?: string
  message: string
  expected?: unknown
  actual?: unknown
  suggestedFix?: string
}

export interface HookSessionManifestPreview {
  schemaVersion: 1
  artifactRole: 'devview-hook-session-manifest-preview'
  status: 'devview-hook-session-manifest-preview-generated' | 'devview-hook-session-manifest-preview-blocked'
  generatorName: typeof GENERATOR_NAME
  manifestScope: 'advisory-hook-session-preview-no-start'
  sessionStatus: 'not-started-preview-only'
  hooksActive: false
  hookScriptsInstalled: false
  hookGatewayActive: 'not-checked-preview-only'
  sourceHookGatewayHealth: string
  sourceUserPromptSubmitContextPreview: string
  sourceHookScriptScaffold: string
  sourceHookScriptTemplatePreview: string
  devviewMode: 'advisory'
  strictModeEnabled: false
  guidedEnforcementEnabled: false
  actualBlockingHookBehaviorImplemented: false
  codexExecutionTriggered: false
  graphSourceMutated: false
  graphDeltaApplied: false
  approvalStatus: 'not-approved'
  humanDecisionRecorded: false
  runtimeEvidenceSatisfied: false
  equivalenceProven: false
  scopeEnforced: false
  ciEnforcementEnabled: false
  humanReviewRequired: true
  nonEnforcing: true
  runtimeBudgetEnforced: false
  sessionArtifactCandidates: JsonRecord[]
  hookEventReadiness: JsonRecord[]
  bypassDetectionStatus: 'preview-only-non-enforcing'
  validationFindings: HookSessionManifestFinding[]
  outputWritePolicy: 'explicit-output-only'
  writtenOutputPath: string | null
  markdownReportPath: string | null
  writtenOutputPathAuthorityStatus: 'not-written-stdout-only' | 'explicit-preview-output-not-source-authority'
  markdownReportAuthorityStatus: 'not-written' | 'explicit-preview-output-not-source-authority'
  nonExecutionBoundary: string
}

export interface HookSessionManifestFileResult {
  manifest: HookSessionManifestPreview
  outputPath?: string
  markdownReport?: string
}

interface LoadedInputs {
  hookHealth: JsonRecord
  userPromptContext: JsonRecord
  scriptScaffold: JsonRecord
  scriptTemplates: JsonRecord
  sourceHookGatewayHealth: string
  sourceUserPromptSubmitContextPreview: string
  sourceHookScriptScaffold: string
  sourceHookScriptTemplatePreview: string
  resolvedHookHealthPath: string
  resolvedUserPromptContextPath: string
  resolvedScriptScaffoldPath: string
  resolvedScriptTemplatesPath: string
}

export async function generateHookSessionManifestFile(
  root: string,
  options: {
    hookHealth: string
    userPromptContext: string
    scriptScaffold: string
    scriptTemplates: string
    output?: string
    markdown?: string
  },
): Promise<HookSessionManifestFileResult> {
  const loaded = await loadInputs(root, options)
  await assertHookSessionManifestOutputAuthority(root, loaded, options)
  const manifest = buildHookSessionManifestPreview(loaded)

  let outputPath: string | undefined
  let markdownReport: string | undefined
  if (options.output) {
    const resolvedOutputPath = resolveRepoPath(root, options.output)
    outputPath = relativePath(root, resolvedOutputPath)
    manifest.writtenOutputPath = outputPath
    manifest.writtenOutputPathAuthorityStatus = 'explicit-preview-output-not-source-authority'
    await writeJsonAtomic(resolvedOutputPath, manifest)
  }
  if (options.markdown) {
    const resolvedMarkdownPath = resolveRepoPath(root, options.markdown)
    markdownReport = relativePath(root, resolvedMarkdownPath)
    manifest.markdownReportPath = markdownReport
    manifest.markdownReportAuthorityStatus = 'explicit-preview-output-not-source-authority'
    await writeTextAtomic(resolvedMarkdownPath, renderHookSessionManifestMarkdown(manifest))
    if (options.output && outputPath) {
      await writeJsonAtomic(resolveRepoPath(root, options.output), manifest)
    }
  }

  return { manifest, ...(outputPath ? { outputPath } : {}), ...(markdownReport ? { markdownReport } : {}) }
}

function buildHookSessionManifestPreview(inputs: LoadedInputs): HookSessionManifestPreview {
  const findings = validateInputs(inputs)
  const blocked = findings.some((finding) => finding.severity === 'error')
  return {
    schemaVersion: 1,
    artifactRole: 'devview-hook-session-manifest-preview',
    status: blocked
      ? 'devview-hook-session-manifest-preview-blocked'
      : 'devview-hook-session-manifest-preview-generated',
    generatorName: GENERATOR_NAME,
    manifestScope: 'advisory-hook-session-preview-no-start',
    sessionStatus: 'not-started-preview-only',
    hooksActive: false,
    hookScriptsInstalled: false,
    hookGatewayActive: 'not-checked-preview-only',
    sourceHookGatewayHealth: inputs.sourceHookGatewayHealth,
    sourceUserPromptSubmitContextPreview: inputs.sourceUserPromptSubmitContextPreview,
    sourceHookScriptScaffold: inputs.sourceHookScriptScaffold,
    sourceHookScriptTemplatePreview: inputs.sourceHookScriptTemplatePreview,
    devviewMode: 'advisory',
    strictModeEnabled: false,
    guidedEnforcementEnabled: false,
    actualBlockingHookBehaviorImplemented: false,
    codexExecutionTriggered: false,
    graphSourceMutated: false,
    graphDeltaApplied: false,
    approvalStatus: 'not-approved',
    humanDecisionRecorded: false,
    runtimeEvidenceSatisfied: false,
    equivalenceProven: false,
    scopeEnforced: false,
    ciEnforcementEnabled: false,
    humanReviewRequired: true,
    nonEnforcing: true,
    runtimeBudgetEnforced: false,
    sessionArtifactCandidates: buildSessionArtifactCandidates(),
    hookEventReadiness: buildHookEventReadiness(inputs, blocked),
    bypassDetectionStatus: 'preview-only-non-enforcing',
    validationFindings: findings,
    outputWritePolicy: 'explicit-output-only',
    writtenOutputPath: null,
    markdownReportPath: null,
    writtenOutputPathAuthorityStatus: 'not-written-stdout-only',
    markdownReportAuthorityStatus: 'not-written',
    nonExecutionBoundary:
      'This Hook Gateway session manifest is a preview-only bundle of existing readiness/context/script preview artifacts. It does not start a hook session, install hooks, activate hooks, trust repositories, configure Codex, block Codex execution, call an LLM, make network calls, run validation or traversal, mutate graph-source, apply graph deltas, approve work, record human decisions, satisfy runtime Evidence, prove equivalence, enforce scope, or configure CI.',
  }
}

export function renderHookSessionManifestMarkdown(manifest: HookSessionManifestPreview): string {
  return [
    '# DevView Hook Session Manifest Preview',
    '',
    `Status: ${manifest.status}`,
    '',
    '## Session Boundary',
    '',
    `- Session status: ${manifest.sessionStatus}`,
    '- Hooks active: false',
    '- Hook scripts installed: false',
    '- Strict/guided blocking: disabled',
    '- Bypass detection: preview-only-non-enforcing',
    '',
    '## Sources',
    '',
    `- Hook health: \`${manifest.sourceHookGatewayHealth}\``,
    `- UserPromptSubmit context: \`${manifest.sourceUserPromptSubmitContextPreview}\``,
    `- Script scaffold: \`${manifest.sourceHookScriptScaffold}\``,
    `- Script templates: \`${manifest.sourceHookScriptTemplatePreview}\``,
    '',
    '## Hook Event Readiness',
    '',
    ...manifest.hookEventReadiness.map(
      (entry) => `- ${stringValue(entry.hookEvent)}: ${stringValue(entry.readinessStatus)}`,
    ),
    '',
    '## Non-execution Statement',
    '',
    manifest.nonExecutionBoundary,
    '',
  ].join('\n')
}

async function loadInputs(
  root: string,
  options: { hookHealth: string; userPromptContext: string; scriptScaffold: string; scriptTemplates: string },
): Promise<LoadedInputs> {
  const resolvedHookHealthPath = resolveRepoPath(root, options.hookHealth)
  const resolvedUserPromptContextPath = resolveRepoPath(root, options.userPromptContext)
  const resolvedScriptScaffoldPath = resolveRepoPath(root, options.scriptScaffold)
  const resolvedScriptTemplatesPath = resolveRepoPath(root, options.scriptTemplates)
  const hookHealth = await readJsonSafe<JsonRecord>(resolvedHookHealthPath)
  if (!hookHealth.ok)
    throw new Error(`Unable to read Hook Gateway health artifact from ${options.hookHealth}: ${hookHealth.error}`)
  const userPromptContext = await readJsonSafe<JsonRecord>(resolvedUserPromptContextPath)
  if (!userPromptContext.ok)
    throw new Error(
      `Unable to read UserPromptSubmit context preview from ${options.userPromptContext}: ${userPromptContext.error}`,
    )
  const scriptScaffold = await readJsonSafe<JsonRecord>(resolvedScriptScaffoldPath)
  if (!scriptScaffold.ok)
    throw new Error(
      `Unable to read Hook script scaffold preview from ${options.scriptScaffold}: ${scriptScaffold.error}`,
    )
  const scriptTemplates = await readJsonSafe<JsonRecord>(resolvedScriptTemplatesPath)
  if (!scriptTemplates.ok)
    throw new Error(
      `Unable to read Hook script template preview from ${options.scriptTemplates}: ${scriptTemplates.error}`,
    )
  return {
    hookHealth: hookHealth.value,
    userPromptContext: userPromptContext.value,
    scriptScaffold: scriptScaffold.value,
    scriptTemplates: scriptTemplates.value,
    sourceHookGatewayHealth: relativePath(root, resolvedHookHealthPath),
    sourceUserPromptSubmitContextPreview: relativePath(root, resolvedUserPromptContextPath),
    sourceHookScriptScaffold: relativePath(root, resolvedScriptScaffoldPath),
    sourceHookScriptTemplatePreview: relativePath(root, resolvedScriptTemplatesPath),
    resolvedHookHealthPath,
    resolvedUserPromptContextPath,
    resolvedScriptScaffoldPath,
    resolvedScriptTemplatesPath,
  }
}

function validateInputs(inputs: LoadedInputs): HookSessionManifestFinding[] {
  const findings: HookSessionManifestFinding[] = []
  const healthRole = stringValue(inputs.hookHealth.artifactRole)
  const healthOk =
    (healthRole === 'devview-hook-gateway-health-report' &&
      stringValue(inputs.hookHealth.status) === 'devview-hook-gateway-health-report-generated') ||
    (healthRole === 'devview-hook-gateway-health-boundary-preview' &&
      stringValue(inputs.hookHealth.status) === 'devview-hook-gateway-health-boundary-previewed')
  if (!healthOk) {
    findings.push({
      code: 'HOOK_SESSION_MANIFEST_INPUT_PREREQUISITE_MISMATCH',
      severity: 'error',
      field: 'hookHealth',
      message: 'Hook session manifest requires a generated Hook Gateway health report or boundary preview.',
      actual: { artifactRole: healthRole, status: inputs.hookHealth.status },
    })
  }
  expectField(
    inputs.userPromptContext,
    findings,
    'userPromptContext.artifactRole',
    'artifactRole',
    'devview-user-prompt-submit-context-preview',
  )
  expectField(
    inputs.userPromptContext,
    findings,
    'userPromptContext.status',
    'status',
    'user-prompt-submit-context-preview-generated',
  )
  expectField(
    inputs.scriptScaffold,
    findings,
    'scriptScaffold.artifactRole',
    'artifactRole',
    'devview-hook-script-scaffold-preview',
  )
  expectField(
    inputs.scriptScaffold,
    findings,
    'scriptScaffold.status',
    'status',
    'devview-hook-script-scaffold-preview-generated',
  )
  expectField(
    inputs.scriptTemplates,
    findings,
    'scriptTemplates.artifactRole',
    'artifactRole',
    'devview-hook-script-template-preview',
  )
  expectField(
    inputs.scriptTemplates,
    findings,
    'scriptTemplates.status',
    'status',
    'devview-hook-script-template-preview-generated',
  )

  for (const [label, record] of [
    ['hookHealth', inputs.hookHealth],
    ['userPromptContext', inputs.userPromptContext],
    ['scriptScaffold', inputs.scriptScaffold],
    ['scriptTemplates', inputs.scriptTemplates],
  ] as Array<[string, JsonRecord]>) {
    validateUnsafeSignals(label, record, findings)
  }

  const templateEvents = arrayRecords(inputs.scriptTemplates.materializedTemplates).map((entry) =>
    stringValue(entry.hookEvent),
  )
  for (const event of REQUIRED_HOOK_EVENTS) {
    if (!templateEvents.includes(event)) {
      findings.push({
        code: 'HOOK_SESSION_MANIFEST_MISSING_HOOK_EVENT',
        severity: 'error',
        field: 'scriptTemplates.materializedTemplates',
        message: `Hook session manifest requires template readiness for ${event}.`,
        expected: event,
        actual: templateEvents,
      })
    }
  }
  return findings
}

function expectField(
  record: JsonRecord,
  findings: HookSessionManifestFinding[],
  displayField: string,
  field: string,
  expected: unknown,
): void {
  if (record[field] !== expected) {
    findings.push({
      code: 'HOOK_SESSION_MANIFEST_INPUT_PREREQUISITE_MISMATCH',
      severity: 'error',
      field: displayField,
      message: `Hook session manifest input field "${displayField}" has an unsafe or unexpected value.`,
      expected,
      actual: record[field],
    })
  }
}

function validateUnsafeSignals(label: string, record: JsonRecord, findings: HookSessionManifestFinding[]): void {
  const unsafeFalseFields = [
    'hooksActive',
    'hookScriptsImplemented',
    'hookScriptsInstalled',
    'installTrustDecisionImplemented',
    'actualInstallOrTrustMutationImplemented',
    'strictModeEnabled',
    'guidedEnforcementEnabled',
    'actualBlockingHookBehaviorImplemented',
    'codexExecutionTriggered',
    'graphSourceMutated',
    'graphDeltaApplied',
    'humanDecisionRecorded',
    'runtimeEvidenceSatisfied',
    'equivalenceProven',
    'scopeEnforced',
    'ciEnforcementEnabled',
    'graphApplyEnabled',
    'approvalAutomationEnabled',
  ]
  for (const field of unsafeFalseFields) {
    if (record[field] === true) {
      findings.push({
        code: 'HOOK_SESSION_MANIFEST_UNSAFE_AUTHORITY_SIGNAL',
        severity: 'error',
        field: `${label}.${field}`,
        message: `Hook session manifest input "${label}" claims unsafe authority "${field}".`,
        expected: false,
        actual: true,
      })
    }
  }
  if (record.approvalStatus && record.approvalStatus !== 'not-approved') {
    findings.push({
      code: 'HOOK_SESSION_MANIFEST_UNSAFE_APPROVAL_SIGNAL',
      severity: 'error',
      field: `${label}.approvalStatus`,
      message: `Hook session manifest input "${label}" claims approval status.`,
      expected: 'not-approved',
      actual: record.approvalStatus,
    })
  }
}

function buildSessionArtifactCandidates(): JsonRecord[] {
  return [
    {
      id: 'session-manifest-candidate',
      pathPattern: '.tmp/devview/sessions/<sessionId>/session-manifest.json',
      authorityStatus: 'future-transient-preview-only',
    },
    {
      id: 'user-prompt-context-candidate',
      pathPattern: '.tmp/devview/sessions/<sessionId>/user-prompt-context.md',
      authorityStatus: 'future-transient-preview-only',
    },
    {
      id: 'hook-observation-candidate',
      pathPattern: '.tmp/devview/sessions/<sessionId>/hook-observations.jsonl',
      authorityStatus: 'future-transient-preview-only',
    },
  ]
}

function buildHookEventReadiness(inputs: LoadedInputs, blocked: boolean): JsonRecord[] {
  const templateEvents = arrayRecords(inputs.scriptTemplates.materializedTemplates).map((entry) =>
    stringValue(entry.hookEvent),
  )
  const scaffoldEvents = arrayRecords(inputs.scriptScaffold.scaffoldTemplates).map((entry) =>
    stringValue(entry.hookEvent),
  )
  return REQUIRED_HOOK_EVENTS.map((event) => ({
    hookEvent: event,
    readinessStatus:
      !blocked && templateEvents.includes(event) && scaffoldEvents.includes(event)
        ? 'preview-ready-not-active'
        : 'blocked-or-missing-preview',
    hookActive: false,
    blockingEnabled: false,
    sourceTemplateAvailable: templateEvents.includes(event),
    sourceScaffoldAvailable: scaffoldEvents.includes(event),
  }))
}

async function assertHookSessionManifestOutputAuthority(
  root: string,
  inputs: LoadedInputs,
  options: { output?: string; markdown?: string },
): Promise<void> {
  const targets = [
    ...(options.output
      ? [{ kind: 'output', requestedPath: options.output, resolvedPath: resolveRepoPath(root, options.output) }]
      : []),
    ...(options.markdown
      ? [{ kind: 'markdown', requestedPath: options.markdown, resolvedPath: resolveRepoPath(root, options.markdown) }]
      : []),
  ]
  if (targets.length === 0) return
  if (targets.length === 2 && pathKey(targets[0].resolvedPath) === pathKey(targets[1].resolvedPath)) {
    throw new Error(
      `Hook session manifest output is unsafe: --output and --markdown resolve to the same path (${targets[0].requestedPath}).`,
    )
  }
  const protectedPaths = buildProtectedOutputPathMap(root, inputs)
  for (const target of targets) {
    const normalizedTarget = relativePath(root, target.resolvedPath)
    if (isActiveHookLocation(normalizedTarget)) {
      throw new Error(
        `Hook session manifest ${target.kind} path is unsafe: ${target.requestedPath} targets an active hook/config location.`,
      )
    }
    const protectedReason = protectedPaths.get(pathKey(target.resolvedPath))
    if (protectedReason) {
      throw new Error(
        `Hook session manifest ${target.kind} path is unsafe: ${target.requestedPath} would overwrite ${protectedReason}.`,
      )
    }
    const existingAuthority = await classifyExistingSourceAuthority(target.resolvedPath)
    if (existingAuthority) {
      throw new Error(
        `Hook session manifest ${target.kind} path is unsafe: ${target.requestedPath} already contains ${existingAuthority}. Choose a dedicated preview output path.`,
      )
    }
  }
}

function buildProtectedOutputPathMap(root: string, inputs: LoadedInputs): Map<string, string> {
  const protectedPaths = new Map<string, string>()
  protectedPaths.set(pathKey(inputs.resolvedHookHealthPath), 'the source Hook Gateway health artifact')
  protectedPaths.set(pathKey(inputs.resolvedUserPromptContextPath), 'the source UserPromptSubmit context preview')
  protectedPaths.set(pathKey(inputs.resolvedScriptScaffoldPath), 'the source Hook script scaffold preview')
  protectedPaths.set(pathKey(inputs.resolvedScriptTemplatesPath), 'the source Hook script template preview')
  for (const record of [inputs.hookHealth, inputs.userPromptContext, inputs.scriptScaffold, inputs.scriptTemplates]) {
    for (const candidatePath of collectConcretePathStrings(record)) {
      const key = pathKey(resolveRepoPath(root, candidatePath))
      if (!protectedPaths.has(key)) protectedPaths.set(key, `linked source artifact ${candidatePath}`)
    }
  }
  return protectedPaths
}

async function classifyExistingSourceAuthority(filePath: string): Promise<string | null> {
  const parsed = await readJsonSafe<JsonRecord>(filePath)
  if (!parsed.ok) return null
  const record = asRecord(parsed.value)
  if (!record) return null
  const artifactRole = stringValue(record.artifactRole)
  if (artifactRole.includes('graph-source')) return `graph-source artifactRole "${artifactRole}"`
  if (
    [
      'devview-hook-gateway-health-report',
      'devview-hook-gateway-health-boundary-preview',
      'devview-user-prompt-submit-context-preview',
      'devview-hook-script-scaffold-preview',
      'devview-hook-script-template-preview',
      'instruction-pack',
      'contract-compiler-input',
      'selected-graph-slice',
      'graph-traversal-plan',
    ].includes(artifactRole)
  )
    return `selected/source artifactRole "${artifactRole}"`
  if (asRecord(record.sourceRecords)) return 'graph-source-shaped sourceRecords'
  if (asRecord(record.taxonomy) && (Array.isArray(record.nodes) || Array.isArray(record.edges)))
    return 'generated read-model source-authority projection'
  return null
}

function collectConcretePathStrings(value: unknown): string[] {
  const paths: string[] = []
  const visit = (entry: unknown): void => {
    if (typeof entry === 'string') {
      if (isConcreteOutputProtectedPath(entry)) paths.push(entry)
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
  return Array.from(new Set(paths))
}

function isConcreteOutputProtectedPath(candidatePath: string): boolean {
  const normalized = candidatePath.replaceAll('\\', '/')
  return (
    Boolean(normalized) &&
    !normalized.startsWith('unresolved:') &&
    normalized !== '<in-memory>' &&
    !normalized.includes('<') &&
    !normalized.includes('\n') &&
    (normalized.includes('/') || normalized.startsWith('.')) &&
    /\.(json|md|txt|ps1|sh|js|ts|yaml|yml)$/i.test(normalized)
  )
}

function isActiveHookLocation(candidatePath: string): boolean {
  const normalized = candidatePath.replaceAll('\\', '/').toLowerCase()
  return normalized.startsWith('.codex/hooks/') || normalized === '.codex/config.json'
}

function arrayRecords(value: unknown): JsonRecord[] {
  return Array.isArray(value)
    ? value.map((entry) => asRecord(entry)).filter((entry): entry is JsonRecord => Boolean(entry))
    : []
}

function asRecord(value: unknown): JsonRecord | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null
  return value as JsonRecord
}

function stringValue(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

function resolveRepoPath(root: string, candidatePath: string): string {
  return path.resolve(root, candidatePath)
}

function pathKey(filePath: string): string {
  return path.resolve(filePath).replaceAll('\\', '/').toLowerCase()
}
