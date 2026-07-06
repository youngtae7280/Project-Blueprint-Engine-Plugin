import type {
  AnalyzerProviderAdapter,
  AnalyzerProviderAdapterFinding,
  AnalyzerProviderAdapterInput,
  AnalyzerProviderAdapterResult,
  JsonRecord,
} from './ai-request-analyzer-provider-adapter.js'

export interface OpenAiResponsesClient {
  responses: {
    create(request: JsonRecord): Promise<unknown>
  }
}

export interface OpenAiClientOptions {
  apiKey: string
  timeoutMs: number
  maxRetries: 0
}

export interface OpenAiAnalyzerProviderAdapterOptions {
  envReader?: (name: string) => string | undefined
  clientFactory?: (options: OpenAiClientOptions) => Promise<OpenAiResponsesClient> | OpenAiResponsesClient
}

interface OpenAiRequestConfig {
  apiKeySourceRef: string
  modelName: string
  timeoutMs: number
  maxOutputTokens: number
  structuredOutputMode: string
}

export function createOpenAiAnalyzerProviderAdapter(
  options: OpenAiAnalyzerProviderAdapterOptions = {},
): OpenAiAnalyzerProviderAdapter {
  return new OpenAiAnalyzerProviderAdapter(options)
}

export class OpenAiAnalyzerProviderAdapter implements AnalyzerProviderAdapter {
  readonly adapterKind = 'openai' as const

  private readonly envReader: (name: string) => string | undefined
  private readonly clientFactory: (
    options: OpenAiClientOptions,
  ) => Promise<OpenAiResponsesClient> | OpenAiResponsesClient

  constructor(options: OpenAiAnalyzerProviderAdapterOptions = {}) {
    this.envReader = options.envReader ?? defaultEnvReader
    this.clientFactory = options.clientFactory ?? defaultClientFactory
  }

  async invoke(input: AnalyzerProviderAdapterInput): Promise<AnalyzerProviderAdapterResult> {
    const findings: AnalyzerProviderAdapterFinding[] = []
    const config = readOpenAiRequestConfig(input.providerConfig, findings)
    if (!config) {
      return blocked(findings, false, false)
    }

    const apiKey = this.envReader(config.apiKeySourceRef)
    if (!apiKey) {
      findings.push({
        code: 'AI_REQUEST_ANALYZER_OPENAI_API_KEY_ENV_MISSING',
        severity: 'error',
        field: 'providerConfig.apiKeySourceRef',
        message: 'OpenAI provider invocation requires the configured environment variable to be present.',
        expected: 'configured environment variable with a non-empty value',
        actual: `${config.apiKeySourceRef}:<unset-or-empty>`,
        suggestedFix:
          'Set the referenced environment variable outside DevView, or omit live provider gates and use a mock/external candidate path.',
      })
      return blocked(findings, false, false)
    }

    let client: OpenAiResponsesClient
    try {
      client = await this.clientFactory({
        apiKey,
        timeoutMs: config.timeoutMs,
        maxRetries: 0,
      })
    } catch (error) {
      findings.push({
        code: 'AI_REQUEST_ANALYZER_OPENAI_SDK_UNAVAILABLE',
        severity: 'error',
        field: 'providerConfig.providerNameCandidate',
        message: 'OpenAI SDK client could not be loaded or constructed after explicit provider gates passed.',
        expected: 'available OpenAI SDK dependency and client constructor',
        actual: redactError(error),
        suggestedFix: 'Install the OpenAI SDK dependency and retry with explicit live provider gates.',
      })
      return blocked(findings, false, true)
    }

    let response: unknown
    try {
      response = await client.responses.create(buildResponsesRequest(input, config))
    } catch (error) {
      findings.push({
        code: 'AI_REQUEST_ANALYZER_OPENAI_PROVIDER_ERROR',
        severity: 'error',
        field: 'openAiProvider.responses.create',
        message: 'OpenAI provider request failed after explicit live provider gates passed.',
        expected: 'successful redacted provider response containing Request IR Candidate JSON',
        actual: redactError(error),
        suggestedFix:
          'Inspect provider availability, authentication, rate limits, or timeout settings outside persisted artifacts.',
      })
      return blocked(findings, true, true)
    }

    const candidate = extractCandidatePayload(response)
    if (!candidate) {
      findings.push({
        code: 'AI_REQUEST_ANALYZER_OPENAI_RESPONSE_INVALID_JSON',
        severity: 'error',
        field: 'openAiProvider.response',
        message: 'OpenAI provider response did not contain a strict JSON object candidate payload.',
        expected: 'Request IR Candidate JSON object',
        actual: 'redacted non-candidate response',
        suggestedFix: 'Adjust the analyzer pack prompt/structured output contract and retry explicitly.',
      })
      return blocked(findings, true, true)
    }

    return {
      adapterKind: 'openai',
      status: 'candidate-payload-ready',
      providerInvocationMode: 'openai-live',
      providerInvocationAuthority: 'explicit-openai-network-gated',
      candidatePayload: candidate,
      findings,
      diagnostics: liveDiagnostics(true, true),
    }
  }
}

async function defaultClientFactory(options: OpenAiClientOptions): Promise<OpenAiResponsesClient> {
  const sdk = (await import('openai')) as {
    default?: new (clientOptions: JsonRecord) => OpenAiResponsesClient
    OpenAI?: new (clientOptions: JsonRecord) => OpenAiResponsesClient
  }
  const Client = sdk.default ?? sdk.OpenAI
  if (!Client) {
    throw new Error('OpenAI SDK client export unavailable')
  }
  return new Client({
    apiKey: options.apiKey,
    timeout: options.timeoutMs,
    maxRetries: options.maxRetries,
  })
}

function defaultEnvReader(name: string): string | undefined {
  const env = globalThis.process?.env as Record<string, string | undefined> | undefined
  return env?.[name]
}

function readOpenAiRequestConfig(
  providerConfig: JsonRecord | null,
  findings: AnalyzerProviderAdapterFinding[],
): OpenAiRequestConfig | null {
  const apiKeySourceRef = stringValue(providerConfig?.apiKeySourceRef)
  const modelName = stringValue(providerConfig?.modelNameCandidate)
  const timeoutMs = numberValue(providerConfig?.timeoutMs)
  const maxOutputTokens = numberValue(providerConfig?.maxOutputTokens)
  const structuredOutputMode = stringValue(providerConfig?.structuredOutputMode)

  if (!apiKeySourceRef || !/^[A-Z_][A-Z0-9_]*$/.test(apiKeySourceRef)) {
    findings.push({
      code: 'AI_REQUEST_ANALYZER_OPENAI_API_KEY_REF_INVALID',
      severity: 'error',
      field: 'providerConfig.apiKeySourceRef',
      message: 'OpenAI provider config must name an environment variable, not an API key value.',
      expected: 'uppercase environment variable name reference',
      actual: apiKeySourceRef || null,
      suggestedFix: 'Use an environment variable name such as OPENAI_API_KEY without storing its value.',
    })
  }
  if (!modelName) {
    findings.push({
      code: 'AI_REQUEST_ANALYZER_OPENAI_MODEL_MISSING',
      severity: 'error',
      field: 'providerConfig.modelNameCandidate',
      message: 'OpenAI provider config must specify a model name candidate.',
    })
  }
  if (!timeoutMs || timeoutMs <= 0) {
    findings.push({
      code: 'AI_REQUEST_ANALYZER_OPENAI_TIMEOUT_INVALID',
      severity: 'error',
      field: 'providerConfig.timeoutMs',
      message: 'OpenAI provider config timeoutMs must be a positive number.',
    })
  }
  if (!maxOutputTokens || maxOutputTokens <= 0) {
    findings.push({
      code: 'AI_REQUEST_ANALYZER_OPENAI_MAX_OUTPUT_TOKENS_INVALID',
      severity: 'error',
      field: 'providerConfig.maxOutputTokens',
      message: 'OpenAI provider config maxOutputTokens must be a positive number.',
    })
  }
  if (!structuredOutputMode) {
    findings.push({
      code: 'AI_REQUEST_ANALYZER_OPENAI_STRUCTURED_OUTPUT_MODE_MISSING',
      severity: 'error',
      field: 'providerConfig.structuredOutputMode',
      message: 'OpenAI provider config must describe its structured output mode.',
    })
  }

  if (findings.some((finding) => finding.severity === 'error')) {
    return null
  }

  return {
    apiKeySourceRef,
    modelName,
    timeoutMs: timeoutMs ?? 0,
    maxOutputTokens: maxOutputTokens ?? 0,
    structuredOutputMode,
  }
}

function buildResponsesRequest(input: AnalyzerProviderAdapterInput, config: OpenAiRequestConfig): JsonRecord {
  return {
    model: config.modelName,
    input: [
      {
        role: 'system',
        content:
          'You produce DevView Request IR Candidate JSON only. Never claim validation, traversal, contract, instruction pack, approval, evidence, equivalence, scope, or CI authority.',
      },
      {
        role: 'user',
        content: JSON.stringify({
          requestText: input.requestText,
          analyzerPack: input.analyzerPack,
          outputContract:
            'Return one Request IR Candidate JSON object. Set candidateOnly true and all downstream authority flags false.',
        }),
      },
    ],
    text: {
      format: {
        type: 'json_schema',
        name: 'devview_request_ir_candidate',
        strict: true,
        schema: requestIrCandidateSchema(),
      },
    },
    max_output_tokens: config.maxOutputTokens,
    store: false,
    metadata: {
      devviewProviderInvocationMode: 'openai-live',
      devviewStructuredOutputMode: config.structuredOutputMode,
    },
  }
}

function requestIrCandidateSchema(): JsonRecord {
  return {
    type: 'object',
    additionalProperties: true,
    required: [
      'artifactRole',
      'requestIrCandidateStatus',
      'candidateOnly',
      'authorityStatus',
      'requestTypeCandidate',
      'targetComponentCandidate',
      'graphTraversalAllowed',
      'contractGenerationAllowed',
      'instructionPackGenerationAllowed',
    ],
    properties: {
      artifactRole: { const: 'request-ir-candidate' },
      requestIrCandidateStatus: { const: 'candidate-only' },
      candidateOnly: { const: true },
      authorityStatus: { const: 'not-authoritative-until-validated' },
      requestTypeCandidate: { type: 'string' },
      targetRecordIdCandidate: { type: 'string' },
      targetComponentCandidate: { type: 'string' },
      allowedScopeIntentCandidate: { type: 'array', items: { type: 'string' } },
      forbiddenScopeIntentCandidate: { type: 'array', items: { type: 'string' } },
      requiredEvidenceIntentCandidate: { type: 'array', items: { type: 'string' } },
      riskIntentCandidate: { type: 'array', items: { type: 'string' } },
      requiresClarification: { type: 'boolean' },
      humanReviewRequired: { type: 'boolean' },
      graphTraversalAllowed: { const: false },
      contractGenerationAllowed: { const: false },
      instructionPackGenerationAllowed: { const: false },
    },
  }
}

function extractCandidatePayload(response: unknown): JsonRecord | null {
  const record = asRecord(response)
  const directParsed = asRecord(record?.output_parsed) ?? asRecord(record?.parsed)
  if (directParsed) {
    return directParsed
  }

  const outputText = stringValue(record?.output_text) || extractNestedOutputText(record)
  if (!outputText) {
    return null
  }
  try {
    return asRecord(JSON.parse(outputText.replace(/^\uFEFF/, '')))
  } catch {
    return null
  }
}

function extractNestedOutputText(record: JsonRecord | null): string {
  const output = Array.isArray(record?.output) ? record.output : []
  for (const outputItem of output) {
    const outputRecord = asRecord(outputItem)
    const content = Array.isArray(outputRecord?.content) ? outputRecord.content : []
    for (const contentItem of content) {
      const contentRecord = asRecord(contentItem)
      const text = stringValue(contentRecord?.text)
      if (text) {
        return text
      }
    }
  }
  return ''
}

function blocked(
  findings: AnalyzerProviderAdapterFinding[],
  providerRequestAttempted: boolean,
  secretValueRead: boolean,
): AnalyzerProviderAdapterResult {
  return {
    adapterKind: 'openai',
    status: 'blocked',
    providerInvocationMode: 'openai-live',
    providerInvocationAuthority: 'explicit-openai-network-gated',
    findings,
    diagnostics: liveDiagnostics(providerRequestAttempted, secretValueRead),
  }
}

function liveDiagnostics(
  providerRequestAttempted: boolean,
  secretValueRead: boolean,
): AnalyzerProviderAdapterResult['diagnostics'] {
  return {
    llmInvoked: providerRequestAttempted,
    networkCallsAllowed: providerRequestAttempted,
    runtimeAiCallsAllowed: providerRequestAttempted,
    secretValueRead,
    providerResponseStored: false,
    sdkDependencyLoaded: providerRequestAttempted,
  }
}

function redactError(error: unknown): JsonRecord {
  if (!(error instanceof Error)) {
    return { name: 'NonError', message: 'redacted provider error' }
  }
  return {
    name: error.name || 'Error',
    message: error.message ? redactMessage(error.message) : 'redacted provider error',
  }
}

function redactMessage(message: string): string {
  const secretPrefix = ['s', 'k'].join('')
  return message
    .replace(new RegExp(`${secretPrefix}-[A-Za-z0-9_-]{12,}`, 'g'), '<redacted-secret>')
    .replace(new RegExp('Bearer\\s+[A-Za-z0-9._-]{12,}', 'gi'), 'Bearer <redacted-secret>')
}

function numberValue(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function stringValue(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

function asRecord(value: unknown): JsonRecord | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return null
  }
  return value as JsonRecord
}
