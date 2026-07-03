import path from 'node:path'
import { readJsonSafe, readTextSafe, relativePath, writeJsonAtomic, writeTextAtomic } from './fs.js'
import type { IssueSeverity } from './types.js'

const GENERATOR_NAME = 'UserPromptSubmitContextPreviewGenerator'

type JsonRecord = Record<string, unknown>

export interface UserPromptContextFinding {
  code: string
  severity: IssueSeverity
  field?: string
  message: string
  expected?: unknown
  actual?: unknown
  suggestedFix?: string
}

export interface UserPromptContextPreview {
  schemaVersion: 1
  artifactRole: 'devview-user-prompt-submit-context-preview'
  status: 'user-prompt-submit-context-preview-generated' | 'user-prompt-submit-context-preview-blocked'
  generatorName: typeof GENERATOR_NAME
  contextScope: 'hook-user-prompt-submit-additional-context-preview'
  sourceFrontendChain: string
  sourceHookGatewayHealth: string
  sourceInstructionPack: string
  sourceInstructionMarkdown: string
  devviewMode: 'advisory'
  strictModeEnabled: false
  guidedEnforcementEnabled: false
  actualHookScriptsImplemented: false
  actualBlockingHookBehaviorImplemented: false
  additionalContextInjectionReady: boolean
  codexExecutionTriggered: false
  graphTraversalExecuted: false
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
  terminalFrontendStage: string
  taskSummary: string
  validationChain: string[]
  allowedScope: JsonRecord[]
  forbiddenScope: JsonRecord[]
  requiredEvidence: JsonRecord[]
  outputRequirements: JsonRecord[]
  stopConditions: JsonRecord[]
  knownRisks: JsonRecord[]
  contextSections: JsonRecord[]
  validationFindings: UserPromptContextFinding[]
  outputWritePolicy: 'explicit-output-only'
  writtenOutputPath: string | null
  markdownReportPath: string | null
  writtenOutputPathAuthorityStatus: 'not-written-stdout-only' | 'explicit-preview-output-not-source-authority'
  markdownReportAuthorityStatus: 'not-written' | 'explicit-preview-output-not-source-authority'
  nonExecutionBoundary: string
}

export interface UserPromptContextFileResult {
  context: UserPromptContextPreview
  outputPath?: string
  markdownReport?: string
}

interface LoadedInputs {
  frontendChain: JsonRecord
  hookHealth: JsonRecord
  instructionPack: JsonRecord
  instructionMarkdown: string
  sourceFrontendChain: string
  sourceHookGatewayHealth: string
  sourceInstructionPack: string
  sourceInstructionMarkdown: string
  resolvedFrontendChainPath: string
  resolvedHookHealthPath: string
  resolvedInstructionPackPath: string
  resolvedInstructionMarkdownPath: string
}

export async function prepareUserPromptContextFile(
  root: string,
  options: {
    frontendChain: string
    hookHealth: string
    instructionPack: string
    instructionMarkdown: string
    output?: string
    markdown?: string
  },
): Promise<UserPromptContextFileResult> {
  const loaded = await loadInputs(root, options)
  await assertUserPromptContextOutputAuthority(root, loaded, options)
  const context = buildUserPromptContextPreview(loaded)

  let outputPath: string | undefined
  let markdownReport: string | undefined
  if (options.output) {
    const resolvedOutputPath = resolveRepoPath(root, options.output)
    outputPath = relativePath(root, resolvedOutputPath)
    context.writtenOutputPath = outputPath
    context.writtenOutputPathAuthorityStatus = 'explicit-preview-output-not-source-authority'
    await writeJsonAtomic(resolvedOutputPath, context)
  }

  if (options.markdown) {
    const resolvedMarkdownPath = resolveRepoPath(root, options.markdown)
    markdownReport = relativePath(root, resolvedMarkdownPath)
    context.markdownReportPath = markdownReport
    context.markdownReportAuthorityStatus = 'explicit-preview-output-not-source-authority'
    await writeTextAtomic(resolvedMarkdownPath, renderUserPromptContextMarkdown(context))
    if (options.output && outputPath) {
      await writeJsonAtomic(resolveRepoPath(root, options.output), context)
    }
  }

  return { context, ...(outputPath ? { outputPath } : {}), ...(markdownReport ? { markdownReport } : {}) }
}

function buildUserPromptContextPreview(inputs: LoadedInputs): UserPromptContextPreview {
  const findings = validateInputs(inputs)
  const blocked = findings.some((finding) => finding.severity === 'error')
  const pack = inputs.instructionPack

  const context: UserPromptContextPreview = {
    schemaVersion: 1,
    artifactRole: 'devview-user-prompt-submit-context-preview',
    status: blocked ? 'user-prompt-submit-context-preview-blocked' : 'user-prompt-submit-context-preview-generated',
    generatorName: GENERATOR_NAME,
    contextScope: 'hook-user-prompt-submit-additional-context-preview',
    sourceFrontendChain: inputs.sourceFrontendChain,
    sourceHookGatewayHealth: inputs.sourceHookGatewayHealth,
    sourceInstructionPack: inputs.sourceInstructionPack,
    sourceInstructionMarkdown: inputs.sourceInstructionMarkdown,
    devviewMode: 'advisory',
    strictModeEnabled: false,
    guidedEnforcementEnabled: false,
    actualHookScriptsImplemented: false,
    actualBlockingHookBehaviorImplemented: false,
    additionalContextInjectionReady: !blocked,
    codexExecutionTriggered: false,
    graphTraversalExecuted: false,
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
    terminalFrontendStage: stringValue(inputs.frontendChain.terminalStage),
    taskSummary: stringValue(pack.taskSummary),
    validationChain: [
      'Request IR schema-only validation',
      'graph-aware Request IR validation',
      'graph traversal plan',
      'selected graph slice',
      'Contract Compiler Input',
      'Instruction Pack preview',
    ],
    allowedScope: arrayRecords(pack.allowedScope),
    forbiddenScope: arrayRecords(pack.forbiddenScope),
    requiredEvidence: arrayRecords(pack.requiredEvidence),
    outputRequirements: arrayRecords(pack.outputRequirements),
    stopConditions: arrayRecords(pack.stopConditions),
    knownRisks: arrayRecords(pack.knownRisks),
    contextSections: buildContextSections(pack),
    validationFindings: findings,
    outputWritePolicy: 'explicit-output-only',
    writtenOutputPath: null,
    markdownReportPath: null,
    writtenOutputPathAuthorityStatus: 'not-written-stdout-only',
    markdownReportAuthorityStatus: 'not-written',
    nonExecutionBoundary:
      'This UserPromptSubmit additionalContext preview summarizes existing DevView frontend artifacts only. It does not implement hook scripts, install hooks, trust repositories, block Codex execution, call an LLM, run graph traversal, mutate graph-source, apply graph deltas, approve work, record human decisions, satisfy runtime Evidence, prove equivalence, enforce scope, or configure CI.',
  }
  return context
}

export function renderUserPromptContextMarkdown(context: UserPromptContextPreview): string {
  return [
    '# DevView UserPromptSubmit Context',
    '',
    `Status: ${context.status}`,
    '',
    '## DevView Status',
    '',
    '- Mode: advisory preview.',
    '- Strict mode: disabled.',
    '- Guided enforcement: disabled.',
    '- Non-enforcing: true.',
    '- Hook scripts and blocking behavior are not implemented.',
    '',
    '## Frontend Stage',
    '',
    `- Terminal stage: ${context.terminalFrontendStage || 'unknown'}.`,
    '- Instruction Pack preview is generated; Codex execution is not triggered.',
    '',
    '## Task',
    '',
    context.taskSummary || '- no task summary',
    '',
    '## Allowed Scope',
    '',
    ...renderScopeRows(context.allowedScope),
    '',
    '## Forbidden Scope And Non-goals',
    '',
    ...renderScopeRows(context.forbiddenScope),
    '- Do not treat this context as approval.',
    '- Do not mutate graph-source or apply graph deltas.',
    '- Do not claim runtime Evidence satisfaction or equivalence proof.',
    '- Do not enforce scope or CI from this preview.',
    '',
    '## Required Evidence',
    '',
    ...renderEvidenceRows(context.requiredEvidence),
    '',
    '## Output Requirements',
    '',
    ...renderOutputRequirementRows(context.outputRequirements),
    '',
    '## Stop Conditions',
    '',
    ...renderStopConditionRows(context.stopConditions),
    '',
    '## Known Risks',
    '',
    ...renderRiskRows(context.knownRisks),
    '',
    '## Validation Chain',
    '',
    ...context.validationChain.map((entry) => `- ${entry}`),
    '',
    '## Boundary',
    '',
    '- Use this as additional context only.',
    '- This is not approval, Evidence satisfaction, equivalence proof, or enforcement.',
    `- ${context.nonExecutionBoundary}`,
    '',
  ].join('\n')
}

async function loadInputs(
  root: string,
  options: {
    frontendChain: string
    hookHealth: string
    instructionPack: string
    instructionMarkdown: string
  },
): Promise<LoadedInputs> {
  const resolvedFrontendChainPath = resolveRepoPath(root, options.frontendChain)
  const resolvedHookHealthPath = resolveRepoPath(root, options.hookHealth)
  const resolvedInstructionPackPath = resolveRepoPath(root, options.instructionPack)
  const resolvedInstructionMarkdownPath = resolveRepoPath(root, options.instructionMarkdown)

  const frontendChain = await readJsonSafe<JsonRecord>(resolvedFrontendChainPath)
  if (!frontendChain.ok) {
    throw new Error(`Unable to read frontend chain report from ${options.frontendChain}: ${frontendChain.error}`)
  }
  const hookHealth = await readJsonSafe<JsonRecord>(resolvedHookHealthPath)
  if (!hookHealth.ok) {
    throw new Error(`Unable to read Hook Gateway health artifact from ${options.hookHealth}: ${hookHealth.error}`)
  }
  const instructionPack = await readJsonSafe<JsonRecord>(resolvedInstructionPackPath)
  if (!instructionPack.ok) {
    throw new Error(`Unable to read Instruction Pack from ${options.instructionPack}: ${instructionPack.error}`)
  }
  const instructionMarkdown = await readTextSafe(resolvedInstructionMarkdownPath)
  if (!instructionMarkdown.ok) {
    throw new Error(
      `Unable to read Instruction Pack Markdown from ${options.instructionMarkdown}: ${instructionMarkdown.error}`,
    )
  }

  return {
    frontendChain: frontendChain.value,
    hookHealth: hookHealth.value,
    instructionPack: instructionPack.value,
    instructionMarkdown: instructionMarkdown.value,
    sourceFrontendChain: relativePath(root, resolvedFrontendChainPath),
    sourceHookGatewayHealth: relativePath(root, resolvedHookHealthPath),
    sourceInstructionPack: relativePath(root, resolvedInstructionPackPath),
    sourceInstructionMarkdown: relativePath(root, resolvedInstructionMarkdownPath),
    resolvedFrontendChainPath,
    resolvedHookHealthPath,
    resolvedInstructionPackPath,
    resolvedInstructionMarkdownPath,
  }
}

function validateInputs(inputs: LoadedInputs): UserPromptContextFinding[] {
  const findings: UserPromptContextFinding[] = []
  expectField(
    inputs.frontendChain,
    findings,
    'frontendChain.artifactRole',
    'artifactRole',
    'devview-frontend-chain-report',
  )
  expectField(
    inputs.frontendChain,
    findings,
    'frontendChain.status',
    'status',
    'devview-frontend-chain-report-generated',
  )
  expectField(
    inputs.frontendChain,
    findings,
    'frontendChain.terminalStage',
    'terminalStage',
    'instruction-pack-preview-generated-no-codex-execution',
  )
  expectField(inputs.instructionPack, findings, 'instructionPack.artifactRole', 'artifactRole', 'instruction-pack')
  expectField(inputs.instructionPack, findings, 'instructionPack.status', 'status', 'instruction-pack-generated')
  expectField(
    inputs.instructionPack,
    findings,
    'instructionPack.instructionPackGenerated',
    'instructionPackGenerated',
    true,
  )

  const healthRole = stringValue(inputs.hookHealth.artifactRole)
  const validHealth =
    (healthRole === 'devview-hook-gateway-health-report' &&
      stringValue(inputs.hookHealth.status) === 'devview-hook-gateway-health-report-generated') ||
    (healthRole === 'devview-hook-gateway-health-boundary-preview' &&
      stringValue(inputs.hookHealth.status) === 'devview-hook-gateway-health-boundary-previewed')
  if (!validHealth) {
    findings.push({
      code: 'USER_PROMPT_CONTEXT_HOOK_HEALTH_ROLE_OR_STATUS_MISMATCH',
      severity: 'error',
      field: 'hookHealth',
      message: 'Hook Gateway health input must be a generated health report or boundary preview.',
      actual: { artifactRole: healthRole, status: inputs.hookHealth.status },
    })
  }

  for (const [label, record] of [
    ['frontendChain', inputs.frontendChain],
    ['hookHealth', inputs.hookHealth],
    ['instructionPack', inputs.instructionPack],
  ] as Array<[string, JsonRecord]>) {
    validateUnsafeSignals(label, record, findings)
  }

  if (!inputs.instructionMarkdown.trim()) {
    findings.push({
      code: 'USER_PROMPT_CONTEXT_INSTRUCTION_MARKDOWN_EMPTY',
      severity: 'error',
      field: 'instructionMarkdown',
      message: 'Instruction Pack Markdown must be readable and non-empty for additionalContext rendering.',
    })
  }

  return findings
}

function expectField(
  record: JsonRecord,
  findings: UserPromptContextFinding[],
  displayField: string,
  field: string,
  expected: unknown,
): void {
  if (record[field] !== expected) {
    findings.push({
      code: 'USER_PROMPT_CONTEXT_INPUT_PREREQUISITE_MISMATCH',
      severity: 'error',
      field: displayField,
      message: `UserPromptSubmit context input field "${displayField}" has an unsafe or unexpected value.`,
      expected,
      actual: record[field],
      suggestedFix: 'Regenerate the source artifact chain before preparing UserPromptSubmit context.',
    })
  }
}

function validateUnsafeSignals(label: string, record: JsonRecord, findings: UserPromptContextFinding[]): void {
  const unsafeFalseFields = [
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
        code: 'USER_PROMPT_CONTEXT_UNSAFE_AUTHORITY_SIGNAL',
        severity: 'error',
        field: `${label}.${field}`,
        message: `UserPromptSubmit context input "${label}" claims unsafe authority "${field}".`,
        expected: false,
        actual: true,
        suggestedFix: 'Use only preview/non-enforcing artifacts as UserPromptSubmit context sources.',
      })
    }
  }
  if (record.approvalStatus && record.approvalStatus !== 'not-approved') {
    findings.push({
      code: 'USER_PROMPT_CONTEXT_UNSAFE_APPROVAL_SIGNAL',
      severity: 'error',
      field: `${label}.approvalStatus`,
      message: `UserPromptSubmit context input "${label}" claims approval status.`,
      expected: 'not-approved',
      actual: record.approvalStatus,
    })
  }
}

function buildContextSections(pack: JsonRecord): JsonRecord[] {
  return [
    { section: 'allowedScope', count: arrayRecords(pack.allowedScope).length },
    { section: 'forbiddenScope', count: arrayRecords(pack.forbiddenScope).length },
    { section: 'requiredEvidence', count: arrayRecords(pack.requiredEvidence).length },
    { section: 'outputRequirements', count: arrayRecords(pack.outputRequirements).length },
    { section: 'stopConditions', count: arrayRecords(pack.stopConditions).length },
    { section: 'knownRisks', count: arrayRecords(pack.knownRisks).length },
  ]
}

async function assertUserPromptContextOutputAuthority(
  root: string,
  inputs: LoadedInputs,
  options: { output?: string; markdown?: string },
): Promise<void> {
  const requestedTargets = [
    ...(options.output
      ? [{ kind: 'output', requestedPath: options.output, resolvedPath: resolveRepoPath(root, options.output) }]
      : []),
    ...(options.markdown
      ? [{ kind: 'markdown', requestedPath: options.markdown, resolvedPath: resolveRepoPath(root, options.markdown) }]
      : []),
  ]
  if (requestedTargets.length === 0) {
    return
  }
  if (
    requestedTargets.length === 2 &&
    pathKey(requestedTargets[0].resolvedPath) === pathKey(requestedTargets[1].resolvedPath)
  ) {
    throw new Error(
      `UserPromptSubmit context output is unsafe: --output and --markdown resolve to the same path (${requestedTargets[0].requestedPath}).`,
    )
  }

  const protectedPaths = buildProtectedOutputPathMap(root, inputs)
  for (const target of requestedTargets) {
    const protectedReason = protectedPaths.get(pathKey(target.resolvedPath))
    if (protectedReason) {
      throw new Error(
        `UserPromptSubmit context ${target.kind} path is unsafe: ${target.requestedPath} would overwrite ${protectedReason}.`,
      )
    }
    const existingAuthority = await classifyExistingSourceAuthority(target.resolvedPath)
    if (existingAuthority) {
      throw new Error(
        `UserPromptSubmit context ${target.kind} path is unsafe: ${target.requestedPath} already contains ${existingAuthority}. Choose a dedicated preview output path.`,
      )
    }
  }
}

function buildProtectedOutputPathMap(root: string, inputs: LoadedInputs): Map<string, string> {
  const protectedPaths = new Map<string, string>()
  const addResolved = (candidate: string, reason: string): void => {
    protectedPaths.set(pathKey(candidate), reason)
  }
  const add = (candidate: unknown, reason: string): void => {
    const candidatePath = stringValue(candidate)
    if (!isConcreteOutputProtectedPath(candidatePath)) {
      return
    }
    const key = pathKey(resolveRepoPath(root, candidatePath))
    if (!protectedPaths.has(key)) {
      protectedPaths.set(key, reason)
    }
  }

  addResolved(inputs.resolvedFrontendChainPath, 'the source frontend chain report')
  addResolved(inputs.resolvedHookHealthPath, 'the source Hook Gateway health artifact')
  addResolved(inputs.resolvedInstructionPackPath, 'the source Instruction Pack')
  addResolved(inputs.resolvedInstructionMarkdownPath, 'the source Instruction Pack Markdown')

  for (const record of [inputs.frontendChain, inputs.hookHealth, inputs.instructionPack]) {
    for (const candidatePath of collectConcretePathStrings(record)) {
      add(candidatePath, `linked source artifact ${candidatePath}`)
    }
  }
  return protectedPaths
}

async function classifyExistingSourceAuthority(filePath: string): Promise<string | null> {
  const parsed = await readJsonSafe<JsonRecord>(filePath)
  if (!parsed.ok) {
    return null
  }
  const record = asRecord(parsed.value)
  if (!record) {
    return null
  }
  const artifactRole = stringValue(record.artifactRole)
  if (artifactRole.includes('graph-source')) {
    return `graph-source artifactRole "${artifactRole}"`
  }
  if (
    [
      'devview-frontend-chain-report',
      'devview-hook-gateway-health-report',
      'devview-hook-gateway-health-boundary-preview',
      'instruction-pack',
      'contract-compiler-input',
      'selected-graph-slice',
      'graph-traversal-plan',
      'request-ir-graph-aware-validation',
      'request-ir-candidate-schema-only-validation',
      'request-ir-candidate-calibration-fixture-preview',
      'ai-request-analyzer-pack',
      'ai-request-analyzer-boundary',
    ].includes(artifactRole)
  ) {
    return `selected/source artifactRole "${artifactRole}"`
  }
  if (asRecord(record.sourceRecords)) {
    return 'graph-source-shaped sourceRecords'
  }
  if (asRecord(record.taxonomy) && (Array.isArray(record.nodes) || Array.isArray(record.edges))) {
    return 'generated read-model source-authority projection'
  }
  return null
}

function collectConcretePathStrings(value: unknown): string[] {
  const paths: string[] = []
  const visit = (entry: unknown): void => {
    if (typeof entry === 'string') {
      if (isConcreteOutputProtectedPath(entry)) {
        paths.push(entry)
      }
      return
    }
    if (Array.isArray(entry)) {
      for (const item of entry) {
        visit(item)
      }
      return
    }
    const record = asRecord(entry)
    if (!record) {
      return
    }
    for (const item of Object.values(record)) {
      visit(item)
    }
  }
  visit(value)
  return uniqueStrings(paths)
}

function renderScopeRows(entries: JsonRecord[]): string[] {
  if (entries.length === 0) {
    return ['- none']
  }
  return entries.map((entry) => {
    const paths = stringArray(entry.paths)
    const suffix = paths.length > 0 ? `: ${paths.map((scopePath) => `\`${scopePath}\``).join(', ')}` : ''
    return `- ${stringValue(entry.id) || 'scope'}${suffix}`
  })
}

function renderEvidenceRows(entries: JsonRecord[]): string[] {
  if (entries.length === 0) {
    return ['- none']
  }
  return entries.map((entry) => `- ${stringValue(entry.id) || 'evidence'}: \`${stringValue(entry.artifact)}\``)
}

function renderStopConditionRows(entries: JsonRecord[]): string[] {
  if (entries.length === 0) {
    return ['- none']
  }
  return entries.map((entry) => `- ${stringValue(entry.id) || 'stop'}: ${stringValue(entry.condition)}`)
}

function renderOutputRequirementRows(entries: JsonRecord[]): string[] {
  if (entries.length === 0) {
    return ['- none']
  }
  return entries.map((entry) => `- ${stringValue(entry.id) || 'output'}: ${stringValue(entry.requiredReportTarget)}`)
}

function renderRiskRows(entries: JsonRecord[]): string[] {
  if (entries.length === 0) {
    return ['- none']
  }
  return entries.map((entry) => `- ${stringValue(entry.id) || 'risk'}: ${stringValue(entry.mitigation)}`)
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
    /\.(json|md|txt)$/i.test(normalized)
  )
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

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values.filter((entry) => entry.length > 0))]
}

function resolveRepoPath(root: string, inputPath: string): string {
  return path.isAbsolute(inputPath) ? inputPath : path.resolve(root, inputPath)
}

function pathKey(filePath: string): string {
  return path.resolve(filePath).replaceAll('\\', '/').toLowerCase()
}
