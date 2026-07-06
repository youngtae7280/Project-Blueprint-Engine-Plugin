import path from 'node:path'
import { readJsonSafe, readTextSafe, relativePath, writeJsonAtomic } from './fs.js'
import { validateRequestIrCandidateSchemaOnly } from './request-ir-candidate-validator.js'
import type { IssueSeverity } from './types.js'

const ANALYZER_NAME = 'AiRequestAnalyzerCommandSurface'
const EXPECTED_PACK_ROLE = 'ai-request-analyzer-pack'
const EXPECTED_PACK_STATUS = 'ai-request-analyzer-pack-generated'
const EXPECTED_PROVIDER_CONFIG_ROLE = 'ai-request-analyzer-provider-config-preview'
const COMPATIBLE_SCHEMA_ID = 'devview-request-ir-candidate-v0-preview'

type JsonRecord = Record<string, unknown>
type ProviderState =
  | 'not-provided'
  | 'disabled'
  | 'configured-not-invoked'
  | 'unavailable'
  | 'blocked-invalid-config'
  | 'future-invocation-allowed-only-after-explicit-config'

const PROVIDER_STATE_STATUS: Record<Exclude<ProviderState, 'not-provided'>, string> = {
  disabled: 'ai-request-analyzer-provider-config-disabled-previewed',
  unavailable: 'ai-request-analyzer-provider-config-unavailable-previewed',
  'configured-not-invoked': 'ai-request-analyzer-provider-config-configured-not-invoked-previewed',
  'blocked-invalid-config': 'ai-request-analyzer-provider-config-blocked-invalid-previewed',
  'future-invocation-allowed-only-after-explicit-config':
    'ai-request-analyzer-provider-config-future-invocation-previewed',
}

const SECRET_VALUE_PATTERNS = [
  /sk-[A-Za-z0-9_-]{12,}/,
  /ghp_[A-Za-z0-9_]{12,}/,
  /github_pat_[A-Za-z0-9_]{12,}/,
  /xox[baprs]-[A-Za-z0-9-]{12,}/,
  /AKIA[0-9A-Z]{12,}/,
  /AIza[0-9A-Za-z_-]{12,}/,
  /Bearer\s+[A-Za-z0-9._-]{12,}/i,
  /password\s*=\s*[^,\s]+/i,
  /"apiKeyValue"\s*:\s*"[^"]+"/i,
  /secretValue\s*:\s*["'][^"']+["']/i,
]

const UNSAFE_TRUE_FIELDS = new Set([
  'graphTraversalAllowed',
  'contractGenerationAllowed',
  'instructionPackGenerationAllowed',
  'providerAdapterImplemented',
  'providerInvocationImplemented',
  'hookScriptsInstalled',
  'hooksActive',
  'strictModeEnabled',
  'guidedEnforcementEnabled',
  'graphSourceMutated',
  'graphDeltaApplied',
  'humanDecisionRecorded',
  'equivalenceProven',
  'runtimeEvidenceSatisfied',
  'evidenceAccepted',
  'scopeEnforced',
  'ciEnforcementEnabled',
  'projectMemoryExtensionAuthorityGranted',
  'selectedGraphSliceGenerated',
  'contractInputGenerated',
  'contractCompilerInputGenerated',
  'instructionPackGenerated',
  'codexExecutionTriggered',
])

export interface AiRequestAnalyzerRunFinding {
  code: string
  severity: IssueSeverity
  field?: string
  message: string
  expected?: unknown
  actual?: unknown
  suggestedFix?: string
}

export interface AiRequestAnalyzerRunResult {
  schemaVersion: 1
  artifactRole: 'ai-request-analyzer-run-result'
  status:
    | 'ai-request-analyzer-provider-disabled'
    | 'ai-request-analyzer-provider-unavailable'
    | 'ai-request-analyzer-provider-configured-not-invoked'
    | 'ai-request-analyzer-provider-future-invocation-blocked'
    | 'ai-request-analyzer-provider-config-blocked'
    | 'ai-request-analyzer-external-candidate-imported'
    | 'ai-request-analyzer-external-candidate-blocked'
  analyzerName: typeof ANALYZER_NAME
  runScope: 'provider-disabled-or-external-candidate-import-no-llm'
  sourceAiRequestAnalyzerPack: string
  sourceProviderConfig: string | null
  sourceExternalCandidate: string | null
  requestText: string
  analyzerProviderStatus:
    | 'provider-disabled'
    | 'provider-unavailable'
    | 'provider-configured-not-invoked'
    | 'provider-future-invocation-blocked'
    | 'provider-config-blocked'
    | 'external-candidate-imported-provider-not-invoked'
    | 'external-candidate-blocked-provider-not-invoked'
  analyzerProviderConfigured: boolean
  providerState: ProviderState
  providerInvocationAuthority: 'none-preview-only'
  providerInvocationSkipped: boolean
  llmInvoked: false
  networkCallsAllowed: false
  runtimeAiCallsAllowed: false
  requestIrCandidateGenerated: boolean
  requestIrCandidateImported: boolean
  candidateImportRequired: boolean
  candidateOnly: true
  candidateAuthorityStatus: 'ai-generated-candidate-not-validated'
  requestIrAuthorityStatus: 'not-authoritative-until-validated'
  validationRequiredBeforeTraversal: true
  graphTraversalAllowed: false
  graphTraversalExecuted: false
  selectedGraphSliceGenerated: false
  contractInputGenerated: false
  instructionPackGenerated: false
  codexExecutionTriggered: false
  graphSourceMutated: false
  graphDeltaApplied: false
  approvalStatus: 'not-approved'
  humanDecisionRecorded: false
  runtimeEvidenceSatisfied: false
  equivalenceProven: false
  scopeEnforced: false
  ciEnforcementEnabled: false
  validationFindings: AiRequestAnalyzerRunFinding[]
  importedCandidate?: JsonRecord
  outputWritePolicy: 'explicit-output-only'
  writtenOutputPath: string | null
  writtenOutputArtifactRole: 'ai-request-analyzer-run-result' | 'request-ir-candidate' | null
  writtenOutputPathAuthorityStatus: 'not-written-stdout-only' | 'explicit-preview-output-not-source-authority'
  nonExecutionBoundary: string
}

export interface AiRequestAnalyzerRunFileResult {
  result: AiRequestAnalyzerRunResult
  outputPath?: string
}

interface AnalyzeRequestPaths {
  root?: string
  packPath?: string
  providerConfigPath?: string
  externalCandidatePath?: string
  outputPath?: string
}

interface AnalyzeRequestWithProviderConfigInput {
  externalCandidateArtifact?: unknown
  providerConfigArtifact?: unknown
  providerConfigText?: string
  paths?: AnalyzeRequestPaths
}

interface ProviderConfigAnalysis {
  providerState: ProviderState
  providerConfigured: boolean
  status:
    | 'provider-disabled'
    | 'provider-unavailable'
    | 'provider-configured-not-invoked'
    | 'provider-future-invocation-blocked'
    | 'provider-config-blocked'
  statusForNoExternal:
    | 'ai-request-analyzer-provider-disabled'
    | 'ai-request-analyzer-provider-unavailable'
    | 'ai-request-analyzer-provider-configured-not-invoked'
    | 'ai-request-analyzer-provider-future-invocation-blocked'
    | 'ai-request-analyzer-provider-config-blocked'
  noExternalFinding: AiRequestAnalyzerRunFinding
  blocksExternalImport: boolean
}

export function analyzeRequestWithDisabledProvider(
  requestText: string,
  analyzerPackArtifact: unknown,
  externalCandidateArtifact?: unknown,
  paths: AnalyzeRequestPaths = {},
): AiRequestAnalyzerRunResult {
  return analyzeRequestWithProviderConfig(requestText, analyzerPackArtifact, {
    externalCandidateArtifact,
    paths,
  })
}

export function analyzeRequestWithProviderConfig(
  requestText: string,
  analyzerPackArtifact: unknown,
  input: AnalyzeRequestWithProviderConfigInput = {},
): AiRequestAnalyzerRunResult {
  const paths = input.paths ?? {}
  const pack = asRecord(analyzerPackArtifact)
  const externalCandidate =
    input.externalCandidateArtifact === undefined ? null : asRecord(input.externalCandidateArtifact)
  const providerConfig = input.providerConfigArtifact === undefined ? null : asRecord(input.providerConfigArtifact)
  const findings: AiRequestAnalyzerRunFinding[] = []

  validateRequestText(requestText, findings)
  validateAnalyzerPack(pack, findings)
  const providerAnalysis = validateProviderConfig(providerConfig, input.providerConfigText, findings)

  if (!input.externalCandidateArtifact) {
    if (providerAnalysis.status !== 'provider-config-blocked') {
      findings.push(providerAnalysis.noExternalFinding)
    }
    return buildResult(requestText, paths, findings, undefined, providerAnalysis)
  }

  if (!externalCandidate) {
    findings.push({
      code: 'AI_REQUEST_EXTERNAL_CANDIDATE_NOT_OBJECT',
      severity: 'error',
      field: 'externalCandidate',
      message: 'External Request IR Candidate import requires a JSON object.',
    })
    return buildResult(requestText, paths, findings, undefined, providerAnalysis)
  }

  if (providerAnalysis.blocksExternalImport) {
    return buildResult(requestText, paths, findings, undefined, providerAnalysis)
  }

  validateExternalCandidateAgainstRequest(externalCandidate, requestText, pack, findings)
  validateExternalCandidateAuthority(externalCandidate, findings)
  validateExternalCandidateSchema(externalCandidate, findings)

  const blocked = findings.some((finding) => finding.severity === 'error')
  return buildResult(
    requestText,
    paths,
    findings,
    blocked ? undefined : buildImportedCandidate(requestText, pack, externalCandidate, paths, providerAnalysis),
    providerAnalysis,
  )
}

export async function analyzeRequestFile(
  root: string,
  requestText: string,
  packPath: string,
  options: { externalCandidate?: string; providerConfig?: string; output?: string } = {},
): Promise<AiRequestAnalyzerRunFileResult> {
  const resolvedPackPath = resolveRepoPath(root, packPath)
  const pack = await readJsonSafe<JsonRecord>(resolvedPackPath)
  if (!pack.ok) {
    throw new Error(`Unable to read AI Request Analyzer Pack from ${packPath}: ${pack.error}`)
  }

  let externalCandidate: JsonRecord | undefined
  let resolvedExternalCandidatePath: string | undefined
  if (options.externalCandidate) {
    resolvedExternalCandidatePath = resolveRepoPath(root, options.externalCandidate)
    const parsedCandidate = await readJsonSafe<JsonRecord>(resolvedExternalCandidatePath)
    if (!parsedCandidate.ok) {
      throw new Error(
        `Unable to read external Request IR Candidate from ${options.externalCandidate}: ${parsedCandidate.error}`,
      )
    }
    externalCandidate = parsedCandidate.value
  }

  let providerConfig: JsonRecord | undefined
  let providerConfigText: string | undefined
  let resolvedProviderConfigPath: string | undefined
  if (options.providerConfig) {
    resolvedProviderConfigPath = resolveRepoPath(root, options.providerConfig)
    const providerText = await readTextSafe(resolvedProviderConfigPath)
    if (!providerText.ok) {
      throw new Error(
        `Unable to read AI Request Analyzer provider config from ${options.providerConfig}: ${providerText.error}`,
      )
    }
    providerConfigText = providerText.value
    try {
      providerConfig = JSON.parse(providerConfigText.replace(/^\uFEFF/, '')) as JsonRecord
    } catch (error) {
      throw new Error(
        `Unable to parse AI Request Analyzer provider config from ${options.providerConfig}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      )
    }
  }

  const outputPath = options.output ? relativePath(root, resolveRepoPath(root, options.output)) : undefined
  const result = analyzeRequestWithProviderConfig(requestText, pack.value, {
    externalCandidateArtifact: externalCandidate,
    providerConfigArtifact: providerConfig,
    providerConfigText,
    paths: {
      root,
      packPath: relativePath(root, resolvedPackPath),
      providerConfigPath: resolvedProviderConfigPath ? relativePath(root, resolvedProviderConfigPath) : undefined,
      externalCandidatePath: resolvedExternalCandidatePath
        ? relativePath(root, resolvedExternalCandidatePath)
        : undefined,
      outputPath,
    },
  })

  if (options.output && shouldWriteAnalyzerRunOutput(result, Boolean(options.externalCandidate))) {
    await assertAnalyzerRunOutputAuthority(
      root,
      resolvedPackPath,
      resolvedProviderConfigPath,
      resolvedExternalCandidatePath,
      pack.value,
      providerConfig,
      externalCandidate,
      options.output,
    )
  }

  let writtenOutputPath: string | undefined
  if (options.output) {
    const resolvedOutputPath = resolveRepoPath(root, options.output)
    if (result.importedCandidate) {
      await writeJsonAtomic(resolvedOutputPath, result.importedCandidate)
      writtenOutputPath = outputPath
    } else if (shouldWriteAnalyzerRunOutput(result, Boolean(options.externalCandidate))) {
      await writeJsonAtomic(resolvedOutputPath, { ...result, writtenOutputPath: outputPath ?? null })
      writtenOutputPath = outputPath
    } else {
      result.writtenOutputPath = null
      result.writtenOutputArtifactRole = null
      result.writtenOutputPathAuthorityStatus = 'not-written-stdout-only'
    }
  }

  return { result, ...(writtenOutputPath ? { outputPath: writtenOutputPath } : {}) }
}

async function assertAnalyzerRunOutputAuthority(
  root: string,
  resolvedPackPath: string,
  resolvedProviderConfigPath: string | undefined,
  resolvedExternalCandidatePath: string | undefined,
  pack: JsonRecord,
  providerConfig: JsonRecord | undefined,
  externalCandidate: JsonRecord | undefined,
  outputPath: string,
): Promise<void> {
  const resolvedOutputPath = resolveRepoPath(root, outputPath)
  const protectedPaths = buildProtectedOutputPathMap(
    root,
    resolvedPackPath,
    resolvedProviderConfigPath,
    resolvedExternalCandidatePath,
    pack,
    providerConfig,
    externalCandidate,
  )
  const protectedReason = protectedPaths.get(pathKey(resolvedOutputPath))
  if (protectedReason) {
    throw new Error(`AI Request Analyzer output path is unsafe: ${outputPath} would overwrite ${protectedReason}.`)
  }
  const sourcePathReason = classifyReservedSourcePath(resolvedOutputPath)
  if (sourcePathReason) {
    throw new Error(`AI Request Analyzer output path is unsafe: ${outputPath} targets ${sourcePathReason}.`)
  }
  const existingAuthority = await classifyExistingSourceAuthority(resolvedOutputPath)
  if (existingAuthority) {
    throw new Error(
      `AI Request Analyzer output path is unsafe: ${outputPath} already contains ${existingAuthority}. Choose a dedicated analyzer run or candidate preview path.`,
    )
  }
}

function buildProtectedOutputPathMap(
  root: string,
  resolvedPackPath: string,
  resolvedProviderConfigPath: string | undefined,
  resolvedExternalCandidatePath: string | undefined,
  pack: JsonRecord,
  providerConfig: JsonRecord | undefined,
  externalCandidate: JsonRecord | undefined,
): Map<string, string> {
  const protectedPaths = new Map<string, string>()
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

  protectedPaths.set(pathKey(resolvedPackPath), 'the source AI Request Analyzer Pack')
  if (resolvedProviderConfigPath) {
    protectedPaths.set(pathKey(resolvedProviderConfigPath), 'the source AI Request Analyzer provider config')
  }
  if (resolvedExternalCandidatePath) {
    protectedPaths.set(pathKey(resolvedExternalCandidatePath), 'the source external Request IR Candidate')
  }
  for (const candidatePath of collectConcretePathStrings(pack)) {
    add(candidatePath, `linked analyzer pack artifact ${candidatePath}`)
  }
  for (const candidatePath of collectConcretePathStrings(providerConfig)) {
    add(candidatePath, `linked provider config artifact ${candidatePath}`)
  }
  for (const candidatePath of collectConcretePathStrings(externalCandidate)) {
    add(candidatePath, `linked external candidate artifact ${candidatePath}`)
  }
  return protectedPaths
}

function shouldWriteAnalyzerRunOutput(result: AiRequestAnalyzerRunResult, externalCandidateProvided: boolean): boolean {
  if (result.importedCandidate) {
    return true
  }
  if (externalCandidateProvided) {
    return false
  }
  return result.status !== 'ai-request-analyzer-provider-config-blocked'
}

function validateRequestText(requestText: string, findings: AiRequestAnalyzerRunFinding[]): void {
  if (normalizeRequestText(requestText).length === 0) {
    findings.push({
      code: 'AI_REQUEST_TEXT_MISSING',
      severity: 'error',
      field: 'request',
      message: 'analyze-request requires a non-empty --request value.',
    })
  }
}

function validateAnalyzerPack(pack: JsonRecord | null, findings: AiRequestAnalyzerRunFinding[]): void {
  if (!pack) {
    findings.push({
      code: 'AI_REQUEST_ANALYZER_PACK_NOT_OBJECT',
      severity: 'error',
      field: 'pack',
      message: 'analyze-request requires an AI Request Analyzer Pack JSON object.',
    })
    return
  }
  const expectedFields: Array<[string, unknown]> = [
    ['artifactRole', EXPECTED_PACK_ROLE],
    ['status', EXPECTED_PACK_STATUS],
    ['analyzerPackGenerated', true],
    ['llmInvoked', false],
    ['networkCallsAllowed', false],
    ['runtimeAiCallsAllowed', false],
    ['requestIrCandidateGenerated', false],
    ['candidateOnly', true],
    ['expectedOutputArtifactRole', 'request-ir-candidate'],
  ]
  for (const [field, expected] of expectedFields) {
    if (pack[field] !== expected) {
      findings.push({
        code: 'AI_REQUEST_ANALYZER_PACK_UNSAFE_OR_MISMATCHED',
        severity: 'error',
        field,
        message: `AI Request Analyzer Pack field "${field}" is not safe for analyze-request.`,
        expected,
        actual: pack[field],
        suggestedFix: 'Regenerate the analyzer pack before importing an external Request IR Candidate.',
      })
    }
  }
}

function validateProviderConfig(
  providerConfig: JsonRecord | null,
  providerConfigText: string | undefined,
  findings: AiRequestAnalyzerRunFinding[],
): ProviderConfigAnalysis {
  if (!providerConfig) {
    return providerConfigAnalysis('not-provided')
  }

  const providerState = stringValue(providerConfig.providerState) as ProviderState
  if (providerConfig.artifactRole !== EXPECTED_PROVIDER_CONFIG_ROLE) {
    findings.push({
      code: 'AI_REQUEST_ANALYZER_PROVIDER_CONFIG_ROLE_MISMATCH',
      severity: 'error',
      field: 'providerConfig.artifactRole',
      message: 'AI Request Analyzer provider config artifactRole is not supported.',
      expected: EXPECTED_PROVIDER_CONFIG_ROLE,
      actual: providerConfig.artifactRole,
      suggestedFix: 'Use an ai-request-analyzer-provider-config-preview artifact.',
    })
    return providerConfigAnalysis('blocked-invalid-config')
  }

  if (!isKnownProviderState(providerState)) {
    findings.push({
      code: 'AI_REQUEST_ANALYZER_PROVIDER_CONFIG_STATE_MISMATCH',
      severity: 'error',
      field: 'providerConfig.providerState',
      message: 'AI Request Analyzer provider config has an unknown providerState.',
      expected: Object.keys(PROVIDER_STATE_STATUS),
      actual: providerConfig.providerState,
      suggestedFix: 'Use a providerState from the provider config boundary taxonomy.',
    })
    return providerConfigAnalysis('blocked-invalid-config')
  }

  const expectedStatus = PROVIDER_STATE_STATUS[providerState]
  if (providerConfig.status !== expectedStatus) {
    findings.push({
      code: 'AI_REQUEST_ANALYZER_PROVIDER_CONFIG_STATUS_MISMATCH',
      severity: 'error',
      field: 'providerConfig.status',
      message: 'AI Request Analyzer provider config status does not match providerState.',
      expected: expectedStatus,
      actual: providerConfig.status,
      suggestedFix: 'Regenerate the provider config preview with a status that matches providerState.',
    })
    return providerConfigAnalysis('blocked-invalid-config')
  }

  const configText = providerConfigText ?? JSON.stringify(providerConfig)
  const secretPattern = SECRET_VALUE_PATTERNS.find((pattern) => pattern.test(configText))
  if (secretPattern) {
    findings.push({
      code: 'AI_REQUEST_ANALYZER_PROVIDER_CONFIG_SECRET_VALUE_BLOCKED',
      severity: 'error',
      field: 'providerConfig',
      message: 'AI Request Analyzer provider config appears to contain a secret-looking literal value.',
      expected: 'environment variable reference names only, never secret values',
      actual: 'secret-looking literal detected',
      suggestedFix: 'Remove secret values from the artifact and keep only environment variable reference names.',
    })
    return providerConfigAnalysis('blocked-invalid-config')
  }

  const requiredSafeFields: Array<[string, unknown]> = [
    ['providerInvocationAuthority', 'none-preview-only'],
    ['networkCallsAllowed', false],
    ['llmInvoked', false],
    ['runtimeAiCallsAllowed', false],
    ['requestIrCandidateGenerated', false],
    ['secretValueStored', false],
    ['secretValueInspected', false],
  ]
  for (const [field, expected] of requiredSafeFields) {
    if (providerConfig[field] !== expected) {
      findings.push({
        code: 'AI_REQUEST_ANALYZER_PROVIDER_CONFIG_AUTHORITY_ESCALATION',
        severity: 'error',
        field: `providerConfig.${field}`,
        message: `AI Request Analyzer provider config field "${field}" is unsafe.`,
        expected,
        actual: providerConfig[field],
        suggestedFix: 'Provider config previews must not grant invocation, network, candidate, or secret authority.',
      })
      return providerConfigAnalysis('blocked-invalid-config')
    }
  }

  const unsafe = findUnsafeAuthorityClaim(providerConfig)
  if (unsafe) {
    findings.push({
      code: 'AI_REQUEST_ANALYZER_PROVIDER_CONFIG_AUTHORITY_ESCALATION',
      severity: 'error',
      field: `providerConfig.${unsafe.field}`,
      message: `AI Request Analyzer provider config attempts to claim unsafe authority via "${unsafe.field}".`,
      expected: unsafe.expected,
      actual: unsafe.actual,
      suggestedFix:
        'Provider config must not claim traversal, contract, instruction, approval, Evidence, equivalence, graph mutation, graph apply, scope, CI, hook, or execution authority.',
    })
    return providerConfigAnalysis('blocked-invalid-config')
  }

  if (providerState === 'blocked-invalid-config') {
    findings.push({
      code: 'AI_REQUEST_ANALYZER_PROVIDER_CONFIG_BLOCKED_INVALID',
      severity: 'error',
      field: 'providerConfig.providerState',
      message: 'AI Request Analyzer provider config is explicitly blocked-invalid-config.',
      expected: 'disabled, unavailable, configured-not-invoked, or future explicit config state',
      actual: providerState,
      suggestedFix: 'Provide a safe provider config preview or remove --provider-config.',
    })
    return providerConfigAnalysis('blocked-invalid-config')
  }

  return providerConfigAnalysis(providerState)
}

function providerConfigAnalysis(providerState: ProviderState): ProviderConfigAnalysis {
  switch (providerState) {
    case 'disabled':
    case 'not-provided':
      return {
        providerState,
        providerConfigured: false,
        status: 'provider-disabled',
        statusForNoExternal: 'ai-request-analyzer-provider-disabled',
        noExternalFinding: {
          code:
            providerState === 'disabled'
              ? 'AI_REQUEST_ANALYZER_PROVIDER_CONFIG_DISABLED'
              : 'AI_REQUEST_ANALYZER_PROVIDER_DISABLED',
          severity: 'error',
          field: providerState === 'disabled' ? 'providerConfig.providerState' : 'externalCandidate',
          message:
            providerState === 'disabled'
              ? 'AI Request Analyzer provider config is disabled; import an explicit external candidate instead.'
              : 'AI Request Analyzer provider execution is disabled in this implementation; import an explicit external candidate instead.',
          expected: '--external-candidate <path>',
          actual: providerState === 'disabled' ? 'disabled' : null,
          suggestedFix:
            'Provide --external-candidate with a precomputed Request IR Candidate, or enable a future trusted provider adapter in a separate task.',
        },
        blocksExternalImport: false,
      }
    case 'unavailable':
      return {
        providerState,
        providerConfigured: false,
        status: 'provider-unavailable',
        statusForNoExternal: 'ai-request-analyzer-provider-unavailable',
        noExternalFinding: {
          code: 'AI_REQUEST_ANALYZER_PROVIDER_UNAVAILABLE',
          severity: 'error',
          field: 'providerConfig.providerState',
          message: 'AI Request Analyzer provider config is unavailable; import an explicit external candidate instead.',
          expected: '--external-candidate <path>',
          actual: providerState,
          suggestedFix:
            'Restore the provider config references in a future provider slice or import an external candidate.',
        },
        blocksExternalImport: false,
      }
    case 'configured-not-invoked':
      return {
        providerState,
        providerConfigured: true,
        status: 'provider-configured-not-invoked',
        statusForNoExternal: 'ai-request-analyzer-provider-configured-not-invoked',
        noExternalFinding: {
          code: 'AI_REQUEST_ANALYZER_PROVIDER_CONFIGURED_NOT_INVOKED',
          severity: 'error',
          field: 'providerConfig.providerState',
          message:
            'AI Request Analyzer provider config is configured-not-invoked; invocation remains future-only in this implementation.',
          expected: '--external-candidate <path> or a future explicit provider adapter',
          actual: providerState,
          suggestedFix:
            'Import an external Request IR Candidate or implement a trusted provider adapter in a future task.',
        },
        blocksExternalImport: false,
      }
    case 'future-invocation-allowed-only-after-explicit-config':
      return {
        providerState,
        providerConfigured: true,
        status: 'provider-future-invocation-blocked',
        statusForNoExternal: 'ai-request-analyzer-provider-future-invocation-blocked',
        noExternalFinding: {
          code: 'AI_REQUEST_ANALYZER_PROVIDER_INVOCATION_FUTURE_ONLY',
          severity: 'error',
          field: 'providerConfig.providerState',
          message:
            'AI Request Analyzer provider config names a future invocation state, but this implementation has no provider invocation adapter.',
          expected: '--external-candidate <path> or a future explicit provider adapter',
          actual: providerState,
          suggestedFix: 'Import an external Request IR Candidate or wait for a future provider invocation slice.',
        },
        blocksExternalImport: false,
      }
    case 'blocked-invalid-config':
      return {
        providerState,
        providerConfigured: false,
        status: 'provider-config-blocked',
        statusForNoExternal: 'ai-request-analyzer-provider-config-blocked',
        noExternalFinding: {
          code: 'AI_REQUEST_ANALYZER_PROVIDER_CONFIG_BLOCKED_INVALID',
          severity: 'error',
          field: 'providerConfig.providerState',
          message: 'AI Request Analyzer provider config is blocked-invalid-config.',
          expected: 'safe provider config preview',
          actual: providerState,
          suggestedFix: 'Fix the provider config preview before running analyze-request.',
        },
        blocksExternalImport: true,
      }
  }
}

function validateExternalCandidateAgainstRequest(
  candidate: JsonRecord,
  requestText: string,
  pack: JsonRecord | null,
  findings: AiRequestAnalyzerRunFinding[],
): void {
  const candidateRequestText = stringValue(candidate.requestText)
  if (candidateRequestText && normalizeRequestText(candidateRequestText) !== normalizeRequestText(requestText)) {
    findings.push({
      code: 'AI_REQUEST_EXTERNAL_CANDIDATE_REQUEST_MISMATCH',
      severity: 'error',
      field: 'requestText',
      message: 'External Request IR Candidate requestText does not match the CLI --request text.',
      expected: requestText,
      actual: candidateRequestText,
      suggestedFix: 'Use an external candidate generated from the exact natural-language request text.',
    })
  }
  const sourceRequestText = stringValue(asRecord(candidate.sourceNaturalLanguageRequest)?.text)
  if (sourceRequestText && normalizeRequestText(sourceRequestText) !== normalizeRequestText(requestText)) {
    findings.push({
      code: 'AI_REQUEST_EXTERNAL_CANDIDATE_REQUEST_MISMATCH',
      severity: 'error',
      field: 'sourceNaturalLanguageRequest.text',
      message: 'External Request IR Candidate sourceNaturalLanguageRequest.text does not match the CLI --request text.',
      expected: requestText,
      actual: sourceRequestText,
      suggestedFix: 'Use an external candidate generated from the exact natural-language request text.',
    })
  }
  const expectedSchemaId = stringValue(pack?.expectedOutputSchemaId)
  const candidateSchemaId = stringValue(candidate.schemaId)
  if (expectedSchemaId && candidateSchemaId && expectedSchemaId !== candidateSchemaId) {
    findings.push({
      code: 'AI_REQUEST_EXTERNAL_CANDIDATE_SCHEMA_MISMATCH',
      severity: 'error',
      field: 'schemaId',
      message: 'External Request IR Candidate schemaId does not match the analyzer pack expected schema.',
      expected: expectedSchemaId,
      actual: candidateSchemaId,
      suggestedFix:
        'Use an external candidate that conforms to the analyzer pack expected Request IR Candidate schema.',
    })
  }
}

function validateExternalCandidateAuthority(candidate: JsonRecord, findings: AiRequestAnalyzerRunFinding[]): void {
  const unsafe = findUnsafeAuthorityClaim(candidate)
  if (unsafe) {
    findings.push({
      code: 'AI_REQUEST_EXTERNAL_CANDIDATE_AUTHORITY_ESCALATION',
      severity: 'error',
      field: unsafe.field,
      message: `External Request IR Candidate attempts to claim unsafe authority via "${unsafe.field}".`,
      expected: unsafe.expected,
      actual: unsafe.actual,
      suggestedFix:
        'External candidates must remain candidate-only and must not claim traversal, contract, instruction, approval, Evidence, equivalence, graph mutation, graph apply, scope, or CI authority.',
    })
  }
}

function validateExternalCandidateSchema(candidate: JsonRecord, findings: AiRequestAnalyzerRunFinding[]): void {
  const validation = validateRequestIrCandidateSchemaOnly(candidate)
  for (const finding of validation.validationFindings.filter((entry) => entry.severity === 'error')) {
    findings.push({
      code: `AI_REQUEST_EXTERNAL_${finding.code}`,
      severity: 'error',
      field: finding.field,
      message: `External Request IR Candidate is not safe for import: ${finding.message}`,
      expected: finding.expected,
      actual: finding.actual,
      suggestedFix: finding.suggestedFix,
    })
  }
}

function buildResult(
  requestText: string,
  paths: AnalyzeRequestPaths,
  findings: AiRequestAnalyzerRunFinding[],
  importedCandidate: JsonRecord | undefined,
  providerAnalysis: ProviderConfigAnalysis,
): AiRequestAnalyzerRunResult {
  const externalMode = Boolean(paths.externalCandidatePath)
  const imported = Boolean(importedCandidate)
  const providerStatus =
    imported || (externalMode && providerAnalysis.status !== 'provider-config-blocked')
      ? imported
        ? 'external-candidate-imported-provider-not-invoked'
        : 'external-candidate-blocked-provider-not-invoked'
      : providerAnalysis.status
  return {
    schemaVersion: 1,
    artifactRole: 'ai-request-analyzer-run-result',
    status: !externalMode
      ? providerAnalysis.statusForNoExternal
      : imported
        ? 'ai-request-analyzer-external-candidate-imported'
        : providerAnalysis.status === 'provider-config-blocked'
          ? 'ai-request-analyzer-provider-config-blocked'
          : 'ai-request-analyzer-external-candidate-blocked',
    analyzerName: ANALYZER_NAME,
    runScope: 'provider-disabled-or-external-candidate-import-no-llm',
    sourceAiRequestAnalyzerPack: paths.packPath ?? '<in-memory>',
    sourceProviderConfig: paths.providerConfigPath ?? null,
    sourceExternalCandidate: paths.externalCandidatePath ?? null,
    requestText,
    analyzerProviderStatus: providerStatus,
    analyzerProviderConfigured: providerAnalysis.providerConfigured,
    providerState: providerAnalysis.providerState,
    providerInvocationAuthority: 'none-preview-only',
    providerInvocationSkipped: true,
    llmInvoked: false,
    networkCallsAllowed: false,
    runtimeAiCallsAllowed: false,
    requestIrCandidateGenerated: imported,
    requestIrCandidateImported: imported,
    candidateImportRequired: !imported,
    candidateOnly: true,
    candidateAuthorityStatus: 'ai-generated-candidate-not-validated',
    requestIrAuthorityStatus: 'not-authoritative-until-validated',
    validationRequiredBeforeTraversal: true,
    graphTraversalAllowed: false,
    graphTraversalExecuted: false,
    selectedGraphSliceGenerated: false,
    contractInputGenerated: false,
    instructionPackGenerated: false,
    codexExecutionTriggered: false,
    graphSourceMutated: false,
    graphDeltaApplied: false,
    approvalStatus: 'not-approved',
    humanDecisionRecorded: false,
    runtimeEvidenceSatisfied: false,
    equivalenceProven: false,
    scopeEnforced: false,
    ciEnforcementEnabled: false,
    validationFindings: findings,
    ...(importedCandidate ? { importedCandidate } : {}),
    outputWritePolicy: 'explicit-output-only',
    writtenOutputPath: paths.outputPath ?? null,
    writtenOutputArtifactRole: paths.outputPath
      ? imported
        ? 'request-ir-candidate'
        : 'ai-request-analyzer-run-result'
      : null,
    writtenOutputPathAuthorityStatus: paths.outputPath
      ? 'explicit-preview-output-not-source-authority'
      : 'not-written-stdout-only',
    nonExecutionBoundary:
      'This analyze-request command surface does not call an LLM, make network calls, configure an analyzer provider, validate Request IR, run graph traversal, generate selected graph slices, generate Contract Compiler Input, generate Instruction Packs, trigger Codex execution, mutate graph-source, apply graph deltas, approve work, record human decisions, satisfy runtime Evidence, prove equivalence, enforce scope, or configure CI.',
  }
}

function buildImportedCandidate(
  requestText: string,
  pack: JsonRecord | null,
  candidate: JsonRecord,
  paths: AnalyzeRequestPaths,
  providerAnalysis: ProviderConfigAnalysis,
): JsonRecord {
  const imported: JsonRecord = {
    ...structuredClone(candidate),
    artifactRole: 'request-ir-candidate',
    status: 'request-ir-candidate-external-import-previewed',
    schemaId: stringValue(candidate.schemaId) || stringValue(pack?.expectedOutputSchemaId) || COMPATIBLE_SCHEMA_ID,
    requestIrCandidateStatus: 'candidate-only',
    candidateOnly: true,
    authorityStatus: 'not-authoritative-until-validated',
    sourceAiRequestAnalyzerPack: paths.packPath ?? '<in-memory>',
    sourceProviderConfig: paths.providerConfigPath ?? null,
    sourceExternalCandidate: paths.externalCandidatePath ?? '<in-memory>',
    sourceNaturalLanguageRequest: {
      ...(asRecord(candidate.sourceNaturalLanguageRequest) ?? {}),
      sourceKind:
        stringValue(asRecord(candidate.sourceNaturalLanguageRequest)?.sourceKind) || 'human-natural-language-request',
      text: requestText,
      authorityStatus: 'raw-request-text-not-compiler-authority',
    },
    requestText,
    analyzerProviderStatus: 'external-candidate-imported-provider-not-invoked',
    analyzerProviderConfigured: providerAnalysis.providerConfigured,
    providerState: providerAnalysis.providerState,
    providerInvocationAuthority: 'none-preview-only',
    providerInvocationSkipped: true,
    llmInvoked: false,
    networkCallsAllowed: false,
    runtimeAiCallsAllowed: false,
    validationRequiredBeforeTraversal: true,
    validatedRequestIr: false,
    requestIrValidationStatus: 'not-validated-after-ai-request-analyzer-import',
    schemaOnlyValidationResult: null,
    graphAwareValidationResultStatus: 'not-run-after-ai-request-analyzer-import',
    graphAwareValidationResultArtifact: null,
    futureValidatorExpectations: {
      ...(asRecord(candidate.futureValidatorExpectations) ?? {}),
      schemaOnlyValidationResult: null,
      graphAwareValidationResult: null,
      analyzerImportValidationRequiredAgain: true,
    },
    graphTraversalAllowed: false,
    contractGenerationAllowed: false,
    instructionPackGenerationAllowed: false,
    graphTraversalAllowedFromUnvalidatedAiOutput: false,
    contractGenerationAllowedFromUnvalidatedAiOutput: false,
    instructionPackGenerationAllowedFromUnvalidatedAiOutput: false,
    selectedGraphSliceGenerated: false,
    contractInputGenerated: false,
    contractCompilerInputGenerated: false,
    instructionPackGenerated: false,
    codexExecutionTriggered: false,
    graphSourceMutated: false,
    graphDeltaApplied: false,
    approvalStatus: 'not-approved',
    humanDecisionRecorded: false,
    equivalenceProven: false,
    runtimeEvidenceSatisfied: false,
    scopeEnforced: false,
    ciEnforcementEnabled: false,
    outputWritePolicy: 'explicit-output-only',
    writtenOutputPath: paths.outputPath ?? null,
    writtenOutputPathAuthorityStatus: paths.outputPath
      ? 'explicit-preview-output-not-source-authority'
      : 'not-written-stdout-only',
    nonExecutionBoundary:
      'This Request IR Candidate was imported from an explicit external candidate without invoking an analyzer provider. It remains candidate-only and requires validate-request-ir and validate-request-ir-graph before traversal. It does not trigger Codex execution, mutate graph-source, apply graph deltas, approve work, satisfy runtime Evidence, prove equivalence, enforce scope, or configure CI.',
  }
  return imported
}

function findUnsafeAuthorityClaim(value: unknown): { field: string; expected: unknown; actual: unknown } | null {
  const visit = (entry: unknown): { field: string; expected: unknown; actual: unknown } | null => {
    if (Array.isArray(entry)) {
      for (const item of entry) {
        const found = visit(item)
        if (found) {
          return found
        }
      }
      return null
    }
    const record = asRecord(entry)
    if (!record) {
      return null
    }
    for (const [key, nested] of Object.entries(record)) {
      if (UNSAFE_TRUE_FIELDS.has(key) && nested === true) {
        return { field: key, expected: false, actual: nested }
      }
      if (key === 'approvalStatus' && typeof nested === 'string' && nested !== 'not-approved') {
        return { field: key, expected: 'not-approved', actual: nested }
      }
      const found = visit(nested)
      if (found) {
        return found
      }
    }
    return null
  }
  return visit(value)
}

function isKnownProviderState(value: string): value is Exclude<ProviderState, 'not-provided'> {
  return Object.prototype.hasOwnProperty.call(PROVIDER_STATE_STATUS, value)
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
  if (
    artifactRole === EXPECTED_PACK_ROLE ||
    artifactRole === EXPECTED_PROVIDER_CONFIG_ROLE ||
    artifactRole === 'ai-request-analyzer-provider-config-boundary-preview' ||
    artifactRole === 'ai-request-analyzer-boundary' ||
    artifactRole === 'request-ir-candidate-schema-preview' ||
    artifactRole === 'request-ir-candidate' ||
    artifactRole === 'request-ir-candidate-calibration-fixture-preview' ||
    artifactRole === 'natural-language-request-intake-boundary-preview'
  ) {
    return `source analyzer/request artifactRole "${artifactRole}"`
  }
  if (artifactRole.includes('graph-source')) {
    return `graph-source artifactRole "${artifactRole}"`
  }
  if (
    [
      'request-ir-graph-aware-validation',
      'graph-traversal-plan',
      'selected-graph-slice',
      'contract-compiler-input',
      'instruction-pack',
      'clarification-interview-pack',
      'clarification-answers-preview',
      'devview-hook-gateway-health-report',
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

function classifyReservedSourcePath(filePath: string): string | null {
  const normalized = path.resolve(filePath).replaceAll('\\', '/').toLowerCase()
  if (normalized.endsWith('/graph-source.json')) {
    return 'graph-source path'
  }
  if (normalized.includes('/.pbe/evidence/')) {
    return 'evidence authority path'
  }
  if (normalized.includes('/.pbe/control/') || normalized.includes('/.pbe/tree/')) {
    return 'PBE source/control path'
  }
  if (
    normalized.endsWith('/generated/generated-read-model.json') ||
    normalized.endsWith('/generated/graph-source-read-model-projection.json')
  ) {
    return 'generated read-model source authority path'
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

function normalizeRequestText(value: string): string {
  return value.replace(/\s+/g, ' ').trim()
}

function asRecord(value: unknown): JsonRecord | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return null
  }
  return value as JsonRecord
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
