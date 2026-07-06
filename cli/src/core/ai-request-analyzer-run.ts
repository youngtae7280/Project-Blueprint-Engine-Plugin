import path from 'node:path'
import {
  createMockAnalyzerProviderAdapter,
  createUnavailableOpenAiAnalyzerProviderAdapter,
  type AnalyzerProviderAdapterResult,
} from './ai-request-analyzer-provider-adapter.js'
import {
  createOpenAiAnalyzerProviderAdapter,
  type OpenAiAnalyzerProviderAdapter,
} from './ai-request-analyzer-openai-provider-adapter.js'
import { readJsonSafe, readTextSafe, relativePath, writeJsonAtomic } from './fs.js'
import { validateRequestIrCandidateSchemaOnly } from './request-ir-candidate-validator.js'
import type { IssueSeverity } from './types.js'

const ANALYZER_NAME = 'AiRequestAnalyzerCommandSurface'
const EXPECTED_PACK_ROLE = 'ai-request-analyzer-pack'
const EXPECTED_PACK_STATUS = 'ai-request-analyzer-pack-generated'
const EXPECTED_PROVIDER_CONFIG_ROLE = 'ai-request-analyzer-provider-config-preview'
const EXPECTED_MOCK_PROVIDER_RESPONSE_ROLE = 'ai-request-analyzer-mock-provider-response-preview'
const COMPATIBLE_SCHEMA_ID = 'devview-request-ir-candidate-v0-preview'

type JsonRecord = Record<string, unknown>
type ProviderState =
  | 'not-provided'
  | 'disabled'
  | 'configured-not-invoked'
  | 'configured-invocation-enabled-preview'
  | 'configured-openai-invocation-enabled'
  | 'unavailable'
  | 'blocked-invalid-config'
  | 'future-invocation-allowed-only-after-explicit-config'
type CandidateOutputMode = 'none' | 'external-import' | 'mock-provider' | 'openai-provider'
type RunMode = 'default' | 'mock-provider' | 'openai-provider'
type ProviderInvocationAuthority = 'none-preview-only' | 'mock-only-no-network' | 'explicit-openai-network-gated'
type ProviderInvocationMode = 'none' | 'mock-no-network' | 'openai-live'

const PROVIDER_STATE_STATUS: Record<Exclude<ProviderState, 'not-provided'>, string> = {
  disabled: 'ai-request-analyzer-provider-config-disabled-previewed',
  unavailable: 'ai-request-analyzer-provider-config-unavailable-previewed',
  'configured-not-invoked': 'ai-request-analyzer-provider-config-configured-not-invoked-previewed',
  'configured-invocation-enabled-preview': 'ai-request-analyzer-provider-config-invocation-enabled-previewed',
  'configured-openai-invocation-enabled':
    'ai-request-analyzer-provider-config-openai-live-disabled-by-default-previewed',
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
    | 'ai-request-analyzer-mock-provider-candidate-generated'
    | 'ai-request-analyzer-mock-provider-blocked'
    | 'ai-request-analyzer-openai-provider-candidate-generated'
    | 'ai-request-analyzer-openai-provider-blocked'
    | 'ai-request-analyzer-external-candidate-imported'
    | 'ai-request-analyzer-external-candidate-blocked'
  analyzerName: typeof ANALYZER_NAME
  runScope:
    | 'provider-disabled-or-external-candidate-import-no-llm'
    | 'mock-provider-response-to-candidate-no-network'
    | 'openai-provider-response-to-candidate-network-gated'
  sourceAiRequestAnalyzerPack: string
  sourceProviderConfig: string | null
  sourceExternalCandidate: string | null
  sourceMockProviderResponse: string | null
  requestText: string
  analyzerProviderStatus:
    | 'provider-disabled'
    | 'provider-unavailable'
    | 'provider-configured-not-invoked'
    | 'provider-future-invocation-blocked'
    | 'provider-config-blocked'
    | 'mock-provider-candidate-generated-no-network'
    | 'mock-provider-blocked-no-network'
    | 'openai-provider-candidate-generated-live'
    | 'openai-provider-blocked-live'
    | 'external-candidate-imported-provider-not-invoked'
    | 'external-candidate-blocked-provider-not-invoked'
  analyzerProviderConfigured: boolean
  providerState: ProviderState
  providerInvocationAuthority: ProviderInvocationAuthority
  providerInvocationMode: ProviderInvocationMode
  providerInvocationSkipped: boolean
  llmInvoked: boolean
  networkCallsAllowed: boolean
  runtimeAiCallsAllowed: boolean
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
  providerGeneratedCandidate?: JsonRecord
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
  mockProviderResponsePath?: string
  outputPath?: string
}

interface AnalyzeRequestWithProviderConfigInput {
  externalCandidateArtifact?: unknown
  providerConfigArtifact?: unknown
  providerConfigText?: string
  invokeProvider?: boolean
  allowNetworkProvider?: boolean
  providerMode?: string
  mockProviderResponseArtifact?: unknown
  mockProviderResponseText?: string
  paths?: AnalyzeRequestPaths
}

interface AnalyzeRequestWithOpenAiProviderInput extends AnalyzeRequestWithProviderConfigInput {
  openAiAdapter?: OpenAiAnalyzerProviderAdapter
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

interface ProviderRunMetadata {
  providerInvocationMode: ProviderInvocationMode
  providerInvocationAuthority: ProviderInvocationAuthority
  llmInvoked: boolean
  networkCallsAllowed: boolean
  runtimeAiCallsAllowed: boolean
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
  const mockProviderResponse =
    input.mockProviderResponseArtifact === undefined ? null : asRecord(input.mockProviderResponseArtifact)
  const findings: AiRequestAnalyzerRunFinding[] = []

  validateRequestText(requestText, findings)
  validateAnalyzerPack(pack, findings)
  const providerAnalysis = validateProviderConfig(providerConfig, input.providerConfigText, findings)
  const gateStatus = validateProviderRuntimeGates(input, providerAnalysis, providerConfig, findings)
  if (gateStatus.blockBeforeExistingProviderFlow) {
    return buildResult(requestText, paths, findings, undefined, providerAnalysis, 'default', 'none')
  }

  if (input.invokeProvider && input.externalCandidateArtifact !== undefined) {
    findings.push({
      code: 'AI_REQUEST_ANALYZER_EXTERNAL_CANDIDATE_WITH_PROVIDER_INVOCATION_BLOCKED',
      severity: 'error',
      field: 'externalCandidate',
      message: 'analyze-request cannot combine --external-candidate with --invoke-provider.',
      expected: 'choose either --external-candidate or mock --invoke-provider path',
      actual: '--external-candidate and --invoke-provider',
      suggestedFix:
        'Use external candidate import without --invoke-provider, or run mock provider generation without --external-candidate.',
    })
    return buildResult(requestText, paths, findings, undefined, providerAnalysis, 'mock-provider', 'none')
  }

  if (input.invokeProvider) {
    if (providerAnalysis.providerState === 'configured-openai-invocation-enabled') {
      const adapterResult = createUnavailableOpenAiAnalyzerProviderAdapter().invoke({
        requestText,
        analyzerPack: pack,
        providerConfig,
        providerConfigPath: paths.providerConfigPath,
        outputPath: paths.outputPath,
      })
      findings.push(...adapterResult.findings)
      return buildResult(requestText, paths, findings, undefined, providerAnalysis, 'default', 'none')
    }

    if (providerAnalysis.providerState !== 'configured-invocation-enabled-preview') {
      findings.push({
        code: 'AI_REQUEST_ANALYZER_PROVIDER_INVOCATION_STATE_BLOCKED',
        severity: 'error',
        field: 'providerConfig.providerState',
        message:
          'Mock provider invocation requires providerState configured-invocation-enabled-preview and does not fall back to a real provider.',
        expected: 'configured-invocation-enabled-preview',
        actual: providerAnalysis.providerState,
        suggestedFix:
          'Use the invocation-enabled provider config preview, or omit --invoke-provider and import an external candidate.',
      })
      return buildResult(requestText, paths, findings, undefined, providerAnalysis, 'mock-provider', 'none')
    }

    if (input.mockProviderResponseArtifact === undefined) {
      findings.push({
        code: 'AI_REQUEST_ANALYZER_MOCK_PROVIDER_RESPONSE_REQUIRED',
        severity: 'error',
        field: 'mockProviderResponse',
        message:
          '--invoke-provider is mock-only in this slice and requires --mock-provider-response; no network fallback is available.',
        expected: '--mock-provider-response <path>',
        actual: null,
        suggestedFix: 'Provide a mock provider response preview artifact or omit --invoke-provider.',
      })
      return buildResult(requestText, paths, findings, undefined, providerAnalysis, 'mock-provider', 'none')
    }

    const candidateFromMock = invokeMockProviderAdapter(
      mockProviderResponse,
      input.mockProviderResponseText,
      requestText,
      pack,
      providerConfig,
      paths,
      findings,
    )
    const blocked = findings.some((finding) => finding.severity === 'error')
    return buildResult(
      requestText,
      paths,
      findings,
      blocked || !candidateFromMock
        ? undefined
        : buildMockProviderCandidate(requestText, pack, candidateFromMock, paths, providerAnalysis),
      providerAnalysis,
      'mock-provider',
      blocked || !candidateFromMock ? 'none' : 'mock-provider',
    )
  }

  if (!input.externalCandidateArtifact) {
    if (providerAnalysis.status !== 'provider-config-blocked') {
      findings.push(providerAnalysis.noExternalFinding)
    }
    return buildResult(requestText, paths, findings, undefined, providerAnalysis, 'default', 'none')
  }

  if (!externalCandidate) {
    findings.push({
      code: 'AI_REQUEST_EXTERNAL_CANDIDATE_NOT_OBJECT',
      severity: 'error',
      field: 'externalCandidate',
      message: 'External Request IR Candidate import requires a JSON object.',
    })
    return buildResult(requestText, paths, findings, undefined, providerAnalysis, 'default', 'none')
  }

  if (providerAnalysis.blocksExternalImport) {
    return buildResult(requestText, paths, findings, undefined, providerAnalysis, 'default', 'none')
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
    'default',
    blocked ? 'none' : 'external-import',
  )
}

async function analyzeRequestWithOpenAiProvider(
  requestText: string,
  analyzerPackArtifact: unknown,
  input: AnalyzeRequestWithOpenAiProviderInput,
): Promise<AiRequestAnalyzerRunResult> {
  const paths = input.paths ?? {}
  const pack = asRecord(analyzerPackArtifact)
  const providerConfig = input.providerConfigArtifact === undefined ? null : asRecord(input.providerConfigArtifact)
  const findings: AiRequestAnalyzerRunFinding[] = []

  validateRequestText(requestText, findings)
  validateAnalyzerPack(pack, findings)
  const providerAnalysis = validateProviderConfig(providerConfig, input.providerConfigText, findings)
  validateProviderRuntimeGates(input, providerAnalysis, providerConfig, findings)
  validateOpenAiProviderConfigDetails(providerConfig, findings)

  if (findings.some((finding) => finding.severity === 'error')) {
    return buildResult(requestText, paths, findings, undefined, providerAnalysis, 'openai-provider', 'none')
  }

  const adapter = input.openAiAdapter ?? createOpenAiAnalyzerProviderAdapter()
  const adapterResult = await adapter.invoke({
    requestText,
    analyzerPack: pack,
    providerConfig,
    providerConfigPath: paths.providerConfigPath,
    outputPath: paths.outputPath,
  })
  findings.push(...adapterResult.findings)

  const candidateFromProvider = adapterResult.candidatePayload
  if (candidateFromProvider) {
    validateProviderCandidateAgainstRequest(
      candidateFromProvider,
      requestText,
      pack,
      findings,
      'openAiProvider.response.candidate',
      'AI_REQUEST_ANALYZER_OPENAI_PROVIDER',
    )
  }

  const blocked = findings.some((finding) => finding.severity === 'error')
  return buildResult(
    requestText,
    paths,
    findings,
    blocked || !candidateFromProvider
      ? undefined
      : buildOpenAiProviderCandidate(requestText, pack, candidateFromProvider, paths, providerAnalysis),
    providerAnalysis,
    'openai-provider',
    blocked || !candidateFromProvider ? 'none' : 'openai-provider',
    adapterMetadata(adapterResult),
  )
}

export async function analyzeRequestFile(
  root: string,
  requestText: string,
  packPath: string,
  options: {
    externalCandidate?: string
    providerConfig?: string
    invokeProvider?: boolean
    allowNetworkProvider?: boolean
    providerMode?: string
    mockProviderResponse?: string
    output?: string
    openAiAdapter?: OpenAiAnalyzerProviderAdapter
  } = {},
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

  let mockProviderResponse: JsonRecord | undefined
  let mockProviderResponseText: string | undefined
  let resolvedMockProviderResponsePath: string | undefined
  if (options.mockProviderResponse) {
    resolvedMockProviderResponsePath = resolveRepoPath(root, options.mockProviderResponse)
    const mockResponseText = await readTextSafe(resolvedMockProviderResponsePath)
    if (!mockResponseText.ok) {
      throw new Error(
        `Unable to read AI Request Analyzer mock provider response from ${options.mockProviderResponse}: ${mockResponseText.error}`,
      )
    }
    mockProviderResponseText = mockResponseText.value
    try {
      mockProviderResponse = JSON.parse(mockProviderResponseText.replace(/^\uFEFF/, '')) as JsonRecord
    } catch (error) {
      throw new Error(
        `Unable to parse AI Request Analyzer mock provider response from ${options.mockProviderResponse}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      )
    }
  }

  const outputPath = options.output ? relativePath(root, resolveRepoPath(root, options.output)) : undefined
  const paths: AnalyzeRequestPaths = {
    root,
    packPath: relativePath(root, resolvedPackPath),
    providerConfigPath: resolvedProviderConfigPath ? relativePath(root, resolvedProviderConfigPath) : undefined,
    externalCandidatePath: resolvedExternalCandidatePath
      ? relativePath(root, resolvedExternalCandidatePath)
      : undefined,
    mockProviderResponsePath: resolvedMockProviderResponsePath
      ? relativePath(root, resolvedMockProviderResponsePath)
      : undefined,
    outputPath,
  }
  const commonInput: AnalyzeRequestWithOpenAiProviderInput = {
    externalCandidateArtifact: externalCandidate,
    providerConfigArtifact: providerConfig,
    providerConfigText,
    invokeProvider: options.invokeProvider,
    allowNetworkProvider: options.allowNetworkProvider,
    providerMode: options.providerMode,
    mockProviderResponseArtifact: mockProviderResponse,
    mockProviderResponseText,
    paths,
    openAiAdapter: options.openAiAdapter,
  }
  const result = shouldUseOpenAiProviderPath(options)
    ? await analyzeRequestWithOpenAiProvider(requestText, pack.value, commonInput)
    : analyzeRequestWithProviderConfig(requestText, pack.value, commonInput)

  if (
    options.output &&
    shouldWriteAnalyzerRunOutput(result, Boolean(options.externalCandidate), options.invokeProvider)
  ) {
    await assertAnalyzerRunOutputAuthority(
      root,
      resolvedPackPath,
      resolvedProviderConfigPath,
      resolvedExternalCandidatePath,
      resolvedMockProviderResponsePath,
      pack.value,
      providerConfig,
      externalCandidate,
      mockProviderResponse,
      options.output,
    )
  }

  let writtenOutputPath: string | undefined
  if (options.output) {
    const resolvedOutputPath = resolveRepoPath(root, options.output)
    const candidateOutput = result.importedCandidate ?? result.providerGeneratedCandidate
    if (candidateOutput) {
      await writeJsonAtomic(resolvedOutputPath, candidateOutput)
      writtenOutputPath = outputPath
    } else if (shouldWriteAnalyzerRunOutput(result, Boolean(options.externalCandidate), options.invokeProvider)) {
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
  resolvedMockProviderResponsePath: string | undefined,
  pack: JsonRecord,
  providerConfig: JsonRecord | undefined,
  externalCandidate: JsonRecord | undefined,
  mockProviderResponse: JsonRecord | undefined,
  outputPath: string,
): Promise<void> {
  const resolvedOutputPath = resolveRepoPath(root, outputPath)
  const protectedPaths = buildProtectedOutputPathMap(
    root,
    resolvedPackPath,
    resolvedProviderConfigPath,
    resolvedExternalCandidatePath,
    resolvedMockProviderResponsePath,
    pack,
    providerConfig,
    externalCandidate,
    mockProviderResponse,
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
  resolvedMockProviderResponsePath: string | undefined,
  pack: JsonRecord,
  providerConfig: JsonRecord | undefined,
  externalCandidate: JsonRecord | undefined,
  mockProviderResponse: JsonRecord | undefined,
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
  if (resolvedMockProviderResponsePath) {
    protectedPaths.set(pathKey(resolvedMockProviderResponsePath), 'the source mock provider response')
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
  for (const candidatePath of collectConcretePathStrings(mockProviderResponse)) {
    add(candidatePath, `linked mock provider response artifact ${candidatePath}`)
  }
  return protectedPaths
}

function shouldWriteAnalyzerRunOutput(
  result: AiRequestAnalyzerRunResult,
  externalCandidateProvided: boolean,
  invokeProvider = false,
): boolean {
  if (result.importedCandidate || result.providerGeneratedCandidate) {
    return true
  }
  if (externalCandidateProvided || (invokeProvider && result.status === 'ai-request-analyzer-mock-provider-blocked')) {
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

  const expectedInvocationAuthority =
    providerState === 'configured-invocation-enabled-preview'
      ? 'explicit-future-flag-required-not-implemented'
      : providerState === 'configured-openai-invocation-enabled'
        ? 'explicit-invocation-and-network-flags-required-not-implemented'
        : 'none-preview-only'
  const requiredSafeFields: Array<[string, unknown]> = [
    ['providerInvocationAuthority', expectedInvocationAuthority],
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
    case 'configured-invocation-enabled-preview':
      return {
        providerState,
        providerConfigured: true,
        status: 'provider-future-invocation-blocked',
        statusForNoExternal: 'ai-request-analyzer-provider-future-invocation-blocked',
        noExternalFinding: {
          code: 'AI_REQUEST_ANALYZER_PROVIDER_INVOCATION_FLAG_REQUIRED',
          severity: 'error',
          field: 'providerConfig.providerState',
          message:
            'AI Request Analyzer provider config is invocation-enabled-preview, but current invocation is mock-only and requires --invoke-provider with --mock-provider-response.',
          expected: '--invoke-provider --mock-provider-response <path>',
          actual: providerState,
          suggestedFix:
            'Use the mock provider response path for deterministic testing, or import an external Request IR Candidate.',
        },
        blocksExternalImport: false,
      }
    case 'configured-openai-invocation-enabled':
      return {
        providerState,
        providerConfigured: true,
        status: 'provider-future-invocation-blocked',
        statusForNoExternal: 'ai-request-analyzer-provider-future-invocation-blocked',
        noExternalFinding: {
          code: 'AI_REQUEST_ANALYZER_OPENAI_PROVIDER_ADAPTER_UNAVAILABLE',
          severity: 'error',
          field: 'providerConfig.providerState',
          message:
            'AI Request Analyzer provider config is OpenAI-live-enabled, but invocation requires --invoke-provider, --allow-network-provider, and --provider-mode openai.',
          expected: '--invoke-provider --allow-network-provider --provider-mode openai',
          actual: providerState,
          suggestedFix:
            'Use all explicit OpenAI provider gates, use the mock provider response path for deterministic testing, or import an external Request IR Candidate.',
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

function validateProviderRuntimeGates(
  input: AnalyzeRequestWithProviderConfigInput,
  providerAnalysis: ProviderConfigAnalysis,
  providerConfig: JsonRecord | null,
  findings: AiRequestAnalyzerRunFinding[],
): { blockBeforeExistingProviderFlow: boolean } {
  const providerMode = input.providerMode ?? ''
  const providerModeProvided = providerMode.length > 0
  const allowNetwork = input.allowNetworkProvider === true
  const openAiMode = providerMode === 'openai'
  const before = findings.length

  if (providerModeProvided && !openAiMode) {
    findings.push({
      code: 'AI_REQUEST_ANALYZER_PROVIDER_MODE_UNSUPPORTED',
      severity: 'error',
      field: 'providerMode',
      message: 'analyze-request supports only provider mode "openai" for live provider invocation.',
      expected: 'openai',
      actual: providerMode,
      suggestedFix: 'Use --provider-mode openai with explicit network gates, or omit --provider-mode.',
    })
  }
  if (allowNetwork && !openAiMode) {
    findings.push({
      code: 'AI_REQUEST_ANALYZER_NETWORK_GATE_WITHOUT_OPENAI_MODE_BLOCKED',
      severity: 'error',
      field: 'allowNetworkProvider',
      message: '--allow-network-provider is valid only with --provider-mode openai.',
      expected: '--provider-mode openai',
      actual: providerMode || null,
      suggestedFix: 'Pair --allow-network-provider with --provider-mode openai, or remove the network gate.',
    })
  }
  if (openAiMode && !allowNetwork) {
    findings.push({
      code: 'AI_REQUEST_ANALYZER_OPENAI_MODE_REQUIRES_NETWORK_GATE',
      severity: 'error',
      field: 'allowNetworkProvider',
      message: '--provider-mode openai requires the explicit --allow-network-provider gate.',
      expected: '--allow-network-provider',
      actual: false,
      suggestedFix: 'Add --allow-network-provider only when live provider invocation is intended.',
    })
  }
  if (openAiMode && !input.invokeProvider) {
    findings.push({
      code: 'AI_REQUEST_ANALYZER_OPENAI_MODE_REQUIRES_INVOKE_PROVIDER',
      severity: 'error',
      field: 'invokeProvider',
      message: '--provider-mode openai requires --invoke-provider.',
      expected: '--invoke-provider',
      actual: false,
      suggestedFix: 'Add --invoke-provider only when live provider invocation is intended.',
    })
  }
  if (openAiMode && input.mockProviderResponseArtifact !== undefined) {
    findings.push({
      code: 'AI_REQUEST_ANALYZER_OPENAI_MODE_WITH_MOCK_RESPONSE_BLOCKED',
      severity: 'error',
      field: 'mockProviderResponse',
      message: '--provider-mode openai cannot be combined with --mock-provider-response.',
      expected: 'choose live OpenAI mode or mock provider response mode',
      actual: '--provider-mode openai and --mock-provider-response',
      suggestedFix:
        'Remove --mock-provider-response for live OpenAI mode, or omit --provider-mode openai for mock mode.',
    })
  }
  if (openAiMode && providerAnalysis.providerState !== 'configured-openai-invocation-enabled') {
    findings.push({
      code: 'AI_REQUEST_ANALYZER_OPENAI_MODE_REQUIRES_LIVE_PROVIDER_CONFIG',
      severity: 'error',
      field: 'providerConfig.providerState',
      message: 'Live OpenAI mode requires providerState configured-openai-invocation-enabled.',
      expected: 'configured-openai-invocation-enabled',
      actual: providerAnalysis.providerState,
      suggestedFix: 'Provide the OpenAI live provider config preview artifact.',
    })
  }
  if (openAiMode && stringValue(providerConfig?.providerNameCandidate) !== 'openai') {
    findings.push({
      code: 'AI_REQUEST_ANALYZER_OPENAI_PROVIDER_NAME_MISMATCH',
      severity: 'error',
      field: 'providerConfig.providerNameCandidate',
      message: 'Live OpenAI mode requires providerNameCandidate openai.',
      expected: 'openai',
      actual: stringValue(providerConfig?.providerNameCandidate) || null,
      suggestedFix: 'Use an OpenAI provider config preview artifact.',
    })
  }

  return { blockBeforeExistingProviderFlow: findings.length > before }
}

function validateOpenAiProviderConfigDetails(
  providerConfig: JsonRecord | null,
  findings: AiRequestAnalyzerRunFinding[],
): void {
  const apiKeySourceRef = stringValue(providerConfig?.apiKeySourceRef)
  if (!apiKeySourceRef || !/^[A-Z_][A-Z0-9_]*$/.test(apiKeySourceRef)) {
    findings.push({
      code: 'AI_REQUEST_ANALYZER_OPENAI_API_KEY_REF_INVALID',
      severity: 'error',
      field: 'providerConfig.apiKeySourceRef',
      message: 'OpenAI provider config must contain an environment variable name reference only.',
      expected: 'uppercase environment variable name reference',
      actual: apiKeySourceRef || null,
      suggestedFix: 'Use apiKeySourceRef such as OPENAI_API_KEY without storing the API key value.',
    })
  }
  if (typeof providerConfig?.timeoutMs !== 'number' || providerConfig.timeoutMs <= 0) {
    findings.push({
      code: 'AI_REQUEST_ANALYZER_OPENAI_TIMEOUT_INVALID',
      severity: 'error',
      field: 'providerConfig.timeoutMs',
      message: 'OpenAI provider config timeoutMs must be a positive number.',
    })
  }
  if (typeof providerConfig?.maxOutputTokens !== 'number' || providerConfig.maxOutputTokens <= 0) {
    findings.push({
      code: 'AI_REQUEST_ANALYZER_OPENAI_MAX_OUTPUT_TOKENS_INVALID',
      severity: 'error',
      field: 'providerConfig.maxOutputTokens',
      message: 'OpenAI provider config maxOutputTokens must be a positive number.',
    })
  }
  if (!stringValue(providerConfig?.structuredOutputMode)) {
    findings.push({
      code: 'AI_REQUEST_ANALYZER_OPENAI_STRUCTURED_OUTPUT_MODE_MISSING',
      severity: 'error',
      field: 'providerConfig.structuredOutputMode',
      message: 'OpenAI provider config must specify structuredOutputMode.',
    })
  }
  if (providerConfig?.storeProviderResponse !== false) {
    findings.push({
      code: 'AI_REQUEST_ANALYZER_OPENAI_STORE_PROVIDER_RESPONSE_BLOCKED',
      severity: 'error',
      field: 'providerConfig.storeProviderResponse',
      message: 'OpenAI provider config must keep storeProviderResponse false.',
      expected: false,
      actual: providerConfig?.storeProviderResponse,
      suggestedFix: 'Do not persist raw provider responses in this slice.',
    })
  }
}

function shouldUseOpenAiProviderPath(options: {
  invokeProvider?: boolean
  allowNetworkProvider?: boolean
  providerMode?: string
  externalCandidate?: string
  mockProviderResponse?: string
}): boolean {
  return (
    options.invokeProvider === true &&
    options.allowNetworkProvider === true &&
    options.providerMode === 'openai' &&
    !options.externalCandidate &&
    !options.mockProviderResponse
  )
}

function adapterMetadata(adapterResult: AnalyzerProviderAdapterResult): ProviderRunMetadata {
  return {
    providerInvocationMode: adapterResult.providerInvocationMode,
    providerInvocationAuthority: adapterResult.providerInvocationAuthority,
    llmInvoked: adapterResult.diagnostics.llmInvoked,
    networkCallsAllowed: adapterResult.diagnostics.networkCallsAllowed,
    runtimeAiCallsAllowed: adapterResult.diagnostics.runtimeAiCallsAllowed,
  }
}

function invokeMockProviderAdapter(
  mockProviderResponse: JsonRecord | null,
  mockProviderResponseText: string | undefined,
  requestText: string,
  pack: JsonRecord | null,
  providerConfig: JsonRecord | null,
  paths: AnalyzeRequestPaths,
  findings: AiRequestAnalyzerRunFinding[],
): JsonRecord | null {
  const unsafe = findUnsafeAuthorityClaim(mockProviderResponse)
  if (unsafe) {
    findings.push({
      code: 'AI_REQUEST_ANALYZER_MOCK_PROVIDER_RESPONSE_AUTHORITY_ESCALATION',
      severity: 'error',
      field: `mockProviderResponse.${unsafe.field}`,
      message: `Mock provider response attempts to claim unsafe authority via "${unsafe.field}".`,
      expected: unsafe.expected,
      actual: unsafe.actual,
      suggestedFix:
        'Mock provider responses must not claim traversal, contract, instruction, approval, Evidence, equivalence, graph mutation, graph apply, scope, CI, hook, or execution authority.',
    })
    return null
  }

  const adapterResult = createMockAnalyzerProviderAdapter().invoke({
    requestText,
    analyzerPack: pack,
    providerConfig,
    providerConfigPath: paths.providerConfigPath,
    mockProviderResponse,
    mockProviderResponseText,
    mockProviderResponsePath: paths.mockProviderResponsePath,
    outputPath: paths.outputPath,
  })
  findings.push(...adapterResult.findings)

  const candidate = adapterResult.candidatePayload
  if (adapterResult.status !== 'candidate-payload-ready' || !candidate) {
    return null
  }

  validateMockProviderCandidateAgainstRequest(candidate, requestText, pack, findings)
  validateMockProviderCandidateAuthority(candidate, findings)
  validateMockProviderCandidateSchema(candidate, findings)
  return candidate
}

function validateMockProviderCandidateAgainstRequest(
  candidate: JsonRecord,
  requestText: string,
  pack: JsonRecord | null,
  findings: AiRequestAnalyzerRunFinding[],
): void {
  const candidateRequestText = stringValue(candidate.requestText)
  if (candidateRequestText && normalizeRequestText(candidateRequestText) !== normalizeRequestText(requestText)) {
    findings.push({
      code: 'AI_REQUEST_ANALYZER_MOCK_PROVIDER_CANDIDATE_REQUEST_MISMATCH',
      severity: 'error',
      field: 'mockProviderResponse.candidate.requestText',
      message: 'Mock provider candidate requestText does not match the CLI --request text.',
      expected: requestText,
      actual: candidateRequestText,
      suggestedFix: 'Use a mock provider candidate generated for the exact natural-language request text.',
    })
  }
  const sourceRequestText = stringValue(asRecord(candidate.sourceNaturalLanguageRequest)?.text)
  if (sourceRequestText && normalizeRequestText(sourceRequestText) !== normalizeRequestText(requestText)) {
    findings.push({
      code: 'AI_REQUEST_ANALYZER_MOCK_PROVIDER_CANDIDATE_REQUEST_MISMATCH',
      severity: 'error',
      field: 'mockProviderResponse.candidate.sourceNaturalLanguageRequest.text',
      message: 'Mock provider candidate sourceNaturalLanguageRequest.text does not match the CLI --request text.',
      expected: requestText,
      actual: sourceRequestText,
      suggestedFix: 'Use a mock provider candidate generated for the exact natural-language request text.',
    })
  }
  const expectedSchemaId = stringValue(pack?.expectedOutputSchemaId)
  const candidateSchemaId = stringValue(candidate.schemaId)
  if (expectedSchemaId && candidateSchemaId && expectedSchemaId !== candidateSchemaId) {
    findings.push({
      code: 'AI_REQUEST_ANALYZER_MOCK_PROVIDER_CANDIDATE_SCHEMA_MISMATCH',
      severity: 'error',
      field: 'mockProviderResponse.candidate.schemaId',
      message: 'Mock provider candidate schemaId does not match the analyzer pack expected schema.',
      expected: expectedSchemaId,
      actual: candidateSchemaId,
      suggestedFix:
        'Use a mock provider candidate that conforms to the analyzer pack expected Request IR Candidate schema.',
    })
  }
}

function validateMockProviderCandidateAuthority(candidate: JsonRecord, findings: AiRequestAnalyzerRunFinding[]): void {
  const unsafe = findUnsafeAuthorityClaim(candidate)
  if (unsafe) {
    findings.push({
      code: 'AI_REQUEST_ANALYZER_MOCK_PROVIDER_CANDIDATE_AUTHORITY_ESCALATION',
      severity: 'error',
      field: `mockProviderResponse.candidate.${unsafe.field}`,
      message: `Mock provider candidate attempts to claim unsafe authority via "${unsafe.field}".`,
      expected: unsafe.expected,
      actual: unsafe.actual,
      suggestedFix:
        'Mock provider candidates must remain candidate-only and must not claim traversal, contract, instruction, approval, Evidence, equivalence, graph mutation, graph apply, scope, or CI authority.',
    })
  }
}

function validateMockProviderCandidateSchema(candidate: JsonRecord, findings: AiRequestAnalyzerRunFinding[]): void {
  const validation = validateRequestIrCandidateSchemaOnly(candidate)
  for (const finding of validation.validationFindings.filter((entry) => entry.severity === 'error')) {
    findings.push({
      code: `AI_REQUEST_ANALYZER_MOCK_PROVIDER_${finding.code}`,
      severity: 'error',
      field: finding.field ? `mockProviderResponse.candidate.${finding.field}` : 'mockProviderResponse.candidate',
      message: `Mock provider candidate is not safe for generation: ${finding.message}`,
      expected: finding.expected,
      actual: finding.actual,
      suggestedFix: finding.suggestedFix,
    })
  }
}

function validateProviderCandidateAgainstRequest(
  candidate: JsonRecord,
  requestText: string,
  pack: JsonRecord | null,
  findings: AiRequestAnalyzerRunFinding[],
  fieldPrefix: string,
  codePrefix: string,
): void {
  const candidateRequestText = stringValue(candidate.requestText)
  if (candidateRequestText && normalizeRequestText(candidateRequestText) !== normalizeRequestText(requestText)) {
    findings.push({
      code: `${codePrefix}_CANDIDATE_REQUEST_MISMATCH`,
      severity: 'error',
      field: `${fieldPrefix}.requestText`,
      message: 'Provider candidate requestText does not match the CLI --request text.',
      expected: requestText,
      actual: candidateRequestText,
      suggestedFix: 'Use a provider candidate generated for the exact natural-language request text.',
    })
  }
  const sourceRequestText = stringValue(asRecord(candidate.sourceNaturalLanguageRequest)?.text)
  if (sourceRequestText && normalizeRequestText(sourceRequestText) !== normalizeRequestText(requestText)) {
    findings.push({
      code: `${codePrefix}_CANDIDATE_REQUEST_MISMATCH`,
      severity: 'error',
      field: `${fieldPrefix}.sourceNaturalLanguageRequest.text`,
      message: 'Provider candidate sourceNaturalLanguageRequest.text does not match the CLI --request text.',
      expected: requestText,
      actual: sourceRequestText,
      suggestedFix: 'Use a provider candidate generated for the exact natural-language request text.',
    })
  }
  const expectedSchemaId = stringValue(pack?.expectedOutputSchemaId)
  const candidateSchemaId = stringValue(candidate.schemaId)
  if (expectedSchemaId && candidateSchemaId && expectedSchemaId !== candidateSchemaId) {
    findings.push({
      code: `${codePrefix}_CANDIDATE_SCHEMA_MISMATCH`,
      severity: 'error',
      field: `${fieldPrefix}.schemaId`,
      message: 'Provider candidate schemaId does not match the analyzer pack expected schema.',
      expected: expectedSchemaId,
      actual: candidateSchemaId,
      suggestedFix: 'Use a provider candidate that conforms to the analyzer pack expected Request IR Candidate schema.',
    })
  }

  const unsafe = findUnsafeAuthorityClaim(candidate)
  if (unsafe) {
    findings.push({
      code: `${codePrefix}_CANDIDATE_AUTHORITY_ESCALATION`,
      severity: 'error',
      field: `${fieldPrefix}.${unsafe.field}`,
      message: `Provider candidate attempts to claim unsafe authority via "${unsafe.field}".`,
      expected: unsafe.expected,
      actual: unsafe.actual,
      suggestedFix:
        'Provider candidates must remain candidate-only and must not claim traversal, contract, instruction, approval, Evidence, equivalence, graph mutation, graph apply, scope, or CI authority.',
    })
  }

  const validation = validateRequestIrCandidateSchemaOnly(candidate)
  for (const finding of validation.validationFindings.filter((entry) => entry.severity === 'error')) {
    findings.push({
      code: `${codePrefix}_${finding.code}`,
      severity: 'error',
      field: finding.field ? `${fieldPrefix}.${finding.field}` : fieldPrefix,
      message: `Provider candidate is not safe for generation: ${finding.message}`,
      expected: finding.expected,
      actual: finding.actual,
      suggestedFix: finding.suggestedFix,
    })
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
  candidateOutput: JsonRecord | undefined,
  providerAnalysis: ProviderConfigAnalysis,
  runMode: RunMode,
  candidateOutputMode: CandidateOutputMode,
  providerRunMetadata?: ProviderRunMetadata,
): AiRequestAnalyzerRunResult {
  const externalMode = Boolean(paths.externalCandidatePath)
  const mockMode = runMode === 'mock-provider'
  const openAiMode = runMode === 'openai-provider'
  const hasCandidateOutput = Boolean(candidateOutput)
  const imported = candidateOutputMode === 'external-import' && hasCandidateOutput
  const mockGenerated = candidateOutputMode === 'mock-provider' && hasCandidateOutput
  const openAiGenerated = candidateOutputMode === 'openai-provider' && hasCandidateOutput
  const providerStatus = openAiMode
    ? openAiGenerated
      ? 'openai-provider-candidate-generated-live'
      : 'openai-provider-blocked-live'
    : mockMode
      ? mockGenerated
        ? 'mock-provider-candidate-generated-no-network'
        : 'mock-provider-blocked-no-network'
      : imported || (externalMode && providerAnalysis.status !== 'provider-config-blocked')
        ? imported
          ? 'external-candidate-imported-provider-not-invoked'
          : 'external-candidate-blocked-provider-not-invoked'
        : providerAnalysis.status
  return {
    schemaVersion: 1,
    artifactRole: 'ai-request-analyzer-run-result',
    status: openAiMode
      ? openAiGenerated
        ? 'ai-request-analyzer-openai-provider-candidate-generated'
        : 'ai-request-analyzer-openai-provider-blocked'
      : mockMode
        ? mockGenerated
          ? 'ai-request-analyzer-mock-provider-candidate-generated'
          : 'ai-request-analyzer-mock-provider-blocked'
        : !externalMode
          ? providerAnalysis.statusForNoExternal
          : imported
            ? 'ai-request-analyzer-external-candidate-imported'
            : providerAnalysis.status === 'provider-config-blocked'
              ? 'ai-request-analyzer-provider-config-blocked'
              : 'ai-request-analyzer-external-candidate-blocked',
    analyzerName: ANALYZER_NAME,
    runScope: openAiMode
      ? 'openai-provider-response-to-candidate-network-gated'
      : mockMode
        ? 'mock-provider-response-to-candidate-no-network'
        : 'provider-disabled-or-external-candidate-import-no-llm',
    sourceAiRequestAnalyzerPack: paths.packPath ?? '<in-memory>',
    sourceProviderConfig: paths.providerConfigPath ?? null,
    sourceExternalCandidate: paths.externalCandidatePath ?? null,
    sourceMockProviderResponse: paths.mockProviderResponsePath ?? null,
    requestText,
    analyzerProviderStatus: providerStatus,
    analyzerProviderConfigured: providerAnalysis.providerConfigured,
    providerState: providerAnalysis.providerState,
    providerInvocationAuthority:
      providerRunMetadata?.providerInvocationAuthority ?? (mockMode ? 'mock-only-no-network' : 'none-preview-only'),
    providerInvocationMode: providerRunMetadata?.providerInvocationMode ?? (mockMode ? 'mock-no-network' : 'none'),
    providerInvocationSkipped: providerRunMetadata ? false : !mockMode,
    llmInvoked: providerRunMetadata?.llmInvoked ?? false,
    networkCallsAllowed: providerRunMetadata?.networkCallsAllowed ?? false,
    runtimeAiCallsAllowed: providerRunMetadata?.runtimeAiCallsAllowed ?? false,
    requestIrCandidateGenerated: hasCandidateOutput,
    requestIrCandidateImported: imported,
    candidateImportRequired: !hasCandidateOutput,
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
    ...(imported ? { importedCandidate: candidateOutput } : {}),
    ...(mockGenerated || openAiGenerated ? { providerGeneratedCandidate: candidateOutput } : {}),
    outputWritePolicy: 'explicit-output-only',
    writtenOutputPath: paths.outputPath ?? null,
    writtenOutputArtifactRole: paths.outputPath
      ? hasCandidateOutput
        ? 'request-ir-candidate'
        : 'ai-request-analyzer-run-result'
      : null,
    writtenOutputPathAuthorityStatus: paths.outputPath
      ? 'explicit-preview-output-not-source-authority'
      : 'not-written-stdout-only',
    nonExecutionBoundary: openAiMode
      ? 'This analyze-request command surface may invoke a live OpenAI provider only after explicit provider, network, and mode gates. It still does not validate Request IR, run graph traversal, generate selected graph slices, generate Contract Compiler Input, generate Instruction Packs, trigger Codex execution, mutate graph-source, apply graph deltas, approve work, record human decisions, satisfy runtime Evidence, prove equivalence, enforce scope, or configure CI.'
      : 'This analyze-request command surface does not call an LLM, make network calls, configure an analyzer provider, validate Request IR, run graph traversal, generate selected graph slices, generate Contract Compiler Input, generate Instruction Packs, trigger Codex execution, mutate graph-source, apply graph deltas, approve work, record human decisions, satisfy runtime Evidence, prove equivalence, enforce scope, or configure CI.',
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

function buildMockProviderCandidate(
  requestText: string,
  pack: JsonRecord | null,
  candidate: JsonRecord,
  paths: AnalyzeRequestPaths,
  providerAnalysis: ProviderConfigAnalysis,
): JsonRecord {
  const generated: JsonRecord = {
    ...structuredClone(candidate),
    artifactRole: 'request-ir-candidate',
    status: 'request-ir-candidate-mock-provider-previewed',
    schemaId: stringValue(candidate.schemaId) || stringValue(pack?.expectedOutputSchemaId) || COMPATIBLE_SCHEMA_ID,
    requestIrCandidateStatus: 'candidate-only',
    candidateOnly: true,
    authorityStatus: 'not-authoritative-until-validated',
    sourceAiRequestAnalyzerPack: paths.packPath ?? '<in-memory>',
    sourceProviderConfig: paths.providerConfigPath ?? null,
    sourceMockProviderResponse: paths.mockProviderResponsePath ?? '<in-memory>',
    sourceExternalCandidate: null,
    sourceNaturalLanguageRequest: {
      ...(asRecord(candidate.sourceNaturalLanguageRequest) ?? {}),
      sourceKind:
        stringValue(asRecord(candidate.sourceNaturalLanguageRequest)?.sourceKind) || 'human-natural-language-request',
      text: requestText,
      authorityStatus: 'raw-request-text-not-compiler-authority',
    },
    requestText,
    analyzerProviderStatus: 'mock-provider-candidate-generated-no-network',
    analyzerProviderConfigured: providerAnalysis.providerConfigured,
    providerState: providerAnalysis.providerState,
    providerInvocationMode: 'mock-no-network',
    providerInvocationAuthority: 'mock-only-no-network',
    providerInvocationSkipped: false,
    llmInvoked: false,
    networkCallsAllowed: false,
    runtimeAiCallsAllowed: false,
    requestIrCandidateGenerated: true,
    requestIrCandidateImported: false,
    validationRequiredBeforeTraversal: true,
    validatedRequestIr: false,
    requestIrValidationStatus: 'not-validated-after-ai-request-analyzer-mock-provider',
    schemaOnlyValidationResult: null,
    graphAwareValidationResultStatus: 'not-run-after-ai-request-analyzer-mock-provider',
    graphAwareValidationResultArtifact: null,
    futureValidatorExpectations: {
      ...(asRecord(candidate.futureValidatorExpectations) ?? {}),
      schemaOnlyValidationResult: null,
      graphAwareValidationResult: null,
      analyzerMockProviderValidationRequiredAgain: true,
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
      'This Request IR Candidate was generated from a deterministic mock analyzer provider response without network calls or LLM invocation. It remains candidate-only and requires validate-request-ir and validate-request-ir-graph before traversal. It does not trigger Codex execution, mutate graph-source, apply graph deltas, approve work, satisfy runtime Evidence, prove equivalence, enforce scope, or configure CI.',
  }
  return generated
}

function buildOpenAiProviderCandidate(
  requestText: string,
  pack: JsonRecord | null,
  candidate: JsonRecord,
  paths: AnalyzeRequestPaths,
  providerAnalysis: ProviderConfigAnalysis,
): JsonRecord {
  const generated: JsonRecord = {
    ...structuredClone(candidate),
    artifactRole: 'request-ir-candidate',
    status: 'request-ir-candidate-openai-provider-previewed',
    schemaId: stringValue(candidate.schemaId) || stringValue(pack?.expectedOutputSchemaId) || COMPATIBLE_SCHEMA_ID,
    requestIrCandidateStatus: 'candidate-only',
    candidateOnly: true,
    authorityStatus: 'not-authoritative-until-validated',
    sourceAiRequestAnalyzerPack: paths.packPath ?? '<in-memory>',
    sourceProviderConfig: paths.providerConfigPath ?? null,
    sourceExternalCandidate: null,
    sourceMockProviderResponse: null,
    sourceNaturalLanguageRequest: {
      ...(asRecord(candidate.sourceNaturalLanguageRequest) ?? {}),
      sourceKind:
        stringValue(asRecord(candidate.sourceNaturalLanguageRequest)?.sourceKind) || 'human-natural-language-request',
      text: requestText,
      authorityStatus: 'raw-request-text-not-compiler-authority',
    },
    requestText,
    analyzerProviderStatus: 'openai-provider-candidate-generated-live',
    analyzerProviderConfigured: providerAnalysis.providerConfigured,
    providerState: providerAnalysis.providerState,
    providerInvocationMode: 'openai-live',
    providerInvocationAuthority: 'explicit-openai-network-gated',
    providerInvocationSkipped: false,
    providerRunProvenance: {
      llmInvoked: true,
      networkCallsAllowed: true,
      runtimeAiCallsAllowed: true,
      rawProviderResponseStored: false,
      apiKeyValueStored: false,
      apiKeyValuePrinted: false,
    },
    requestIrCandidateGenerated: true,
    requestIrCandidateImported: false,
    validationRequiredBeforeTraversal: true,
    validatedRequestIr: false,
    requestIrValidationStatus: 'not-validated-after-ai-request-analyzer-openai-provider',
    schemaOnlyValidationResult: null,
    graphAwareValidationResultStatus: 'not-run-after-ai-request-analyzer-openai-provider',
    graphAwareValidationResultArtifact: null,
    futureValidatorExpectations: {
      ...(asRecord(candidate.futureValidatorExpectations) ?? {}),
      schemaOnlyValidationResult: null,
      graphAwareValidationResult: null,
      analyzerOpenAiProviderValidationRequiredAgain: true,
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
    evidenceAccepted: false,
    scopeEnforced: false,
    ciEnforcementEnabled: false,
    outputWritePolicy: 'explicit-output-only',
    writtenOutputPath: paths.outputPath ?? null,
    writtenOutputPathAuthorityStatus: paths.outputPath
      ? 'explicit-preview-output-not-source-authority'
      : 'not-written-stdout-only',
    nonExecutionBoundary:
      'This Request IR Candidate was generated through explicit OpenAI provider gates. It remains candidate-only and requires validate-request-ir and validate-request-ir-graph before traversal. It does not trigger Codex execution, mutate graph-source, apply graph deltas, approve work, satisfy runtime Evidence, prove equivalence, enforce scope, or configure CI.',
  }
  return generated
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
    artifactRole === EXPECTED_MOCK_PROVIDER_RESPONSE_ROLE ||
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
