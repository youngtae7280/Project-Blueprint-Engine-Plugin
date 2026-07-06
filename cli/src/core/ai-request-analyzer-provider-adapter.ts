import type { IssueSeverity } from './types.js'

export type AnalyzerProviderAdapterKind = 'mock' | 'openai-unavailable' | 'openai'
export type AnalyzerProviderInvocationMode = 'mock-no-network' | 'openai-live' | 'none'
export type AnalyzerProviderInvocationAuthority =
  | 'mock-only-no-network'
  | 'explicit-openai-network-gated'
  | 'none-preview-only'

export type JsonRecord = Record<string, unknown>

export interface AnalyzerProviderAdapterFinding {
  code: string
  severity: IssueSeverity
  field?: string
  message: string
  expected?: unknown
  actual?: unknown
  suggestedFix?: string
}

export interface AnalyzerProviderAdapterInput {
  requestText: string
  analyzerPack: JsonRecord | null
  providerConfig: JsonRecord | null
  providerConfigPath?: string
  mockProviderResponse?: JsonRecord | null
  mockProviderResponseText?: string
  mockProviderResponsePath?: string
  outputPath?: string
}

export interface AnalyzerProviderAdapterResult {
  adapterKind: AnalyzerProviderAdapterKind
  status: 'candidate-payload-ready' | 'blocked'
  providerInvocationMode: AnalyzerProviderInvocationMode
  providerInvocationAuthority: AnalyzerProviderInvocationAuthority
  candidatePayload?: JsonRecord
  findings: AnalyzerProviderAdapterFinding[]
  diagnostics: {
    llmInvoked: boolean
    networkCallsAllowed: boolean
    runtimeAiCallsAllowed: boolean
    secretValueRead: boolean
    providerResponseStored: boolean
    sdkDependencyLoaded: boolean
  }
}

export interface AnalyzerProviderAdapter {
  readonly adapterKind: AnalyzerProviderAdapterKind
  invoke(input: AnalyzerProviderAdapterInput): AnalyzerProviderAdapterResult | Promise<AnalyzerProviderAdapterResult>
}

const EXPECTED_MOCK_PROVIDER_RESPONSE_ROLE = 'ai-request-analyzer-mock-provider-response-preview'
const EXPECTED_MOCK_PROVIDER_RESPONSE_STATUS = 'ai-request-analyzer-mock-provider-response-previewed'

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

export function createMockAnalyzerProviderAdapter(): MockAnalyzerProviderAdapter {
  return new MockAnalyzerProviderAdapter()
}

export function createUnavailableOpenAiAnalyzerProviderAdapter(): UnavailableOpenAiAnalyzerProviderAdapter {
  return new UnavailableOpenAiAnalyzerProviderAdapter()
}

export class MockAnalyzerProviderAdapter implements AnalyzerProviderAdapter {
  readonly adapterKind = 'mock' as const

  invoke(input: AnalyzerProviderAdapterInput): AnalyzerProviderAdapterResult {
    const findings: AnalyzerProviderAdapterFinding[] = []
    const mockProviderResponse = input.mockProviderResponse

    if (!mockProviderResponse) {
      findings.push({
        code: 'AI_REQUEST_ANALYZER_MOCK_PROVIDER_RESPONSE_NOT_OBJECT',
        severity: 'error',
        field: 'mockProviderResponse',
        message: 'Mock provider response must be a JSON object.',
        expected: EXPECTED_MOCK_PROVIDER_RESPONSE_ROLE,
        actual: typeof mockProviderResponse,
        suggestedFix: 'Provide a mock provider response preview artifact.',
      })
      return blocked('mock', 'mock-no-network', 'mock-only-no-network', findings)
    }

    const expectedFields: Array<[string, unknown]> = [
      ['artifactRole', EXPECTED_MOCK_PROVIDER_RESPONSE_ROLE],
      ['status', EXPECTED_MOCK_PROVIDER_RESPONSE_STATUS],
      ['providerInvocationMode', 'mock-no-network'],
      ['networkCallsAllowed', false],
      ['llmInvoked', false],
      ['runtimeAiCallsAllowed', false],
      ['secretValueStored', false],
      ['secretValueInspected', false],
    ]
    for (const [field, expected] of expectedFields) {
      if (mockProviderResponse[field] !== expected) {
        findings.push({
          code: 'AI_REQUEST_ANALYZER_MOCK_PROVIDER_RESPONSE_MISMATCH',
          severity: 'error',
          field: `mockProviderResponse.${field}`,
          message: `Mock provider response field "${field}" is not safe for candidate generation.`,
          expected,
          actual: mockProviderResponse[field],
          suggestedFix:
            'Regenerate the mock provider response preview without network, LLM, secret, or authority claims.',
        })
        return blocked('mock', 'mock-no-network', 'mock-only-no-network', findings)
      }
    }

    const responseText = input.mockProviderResponseText ?? JSON.stringify(mockProviderResponse)
    const secretPattern = SECRET_VALUE_PATTERNS.find((pattern) => pattern.test(responseText))
    if (secretPattern) {
      findings.push({
        code: 'AI_REQUEST_ANALYZER_MOCK_PROVIDER_RESPONSE_SECRET_VALUE_BLOCKED',
        severity: 'error',
        field: 'mockProviderResponse',
        message: 'Mock provider response appears to contain a secret-looking literal value.',
        expected: 'mock response without API key, token, or bearer values',
        actual: 'secret-looking literal detected',
        suggestedFix: 'Remove secret values from the mock provider response fixture.',
      })
      return blocked('mock', 'mock-no-network', 'mock-only-no-network', findings)
    }

    const candidate = asRecord(mockProviderResponse.candidate)
    if (!candidate) {
      findings.push({
        code: 'AI_REQUEST_ANALYZER_MOCK_PROVIDER_CANDIDATE_MISSING',
        severity: 'error',
        field: 'mockProviderResponse.candidate',
        message: 'Mock provider response must contain a candidate JSON object.',
        expected: 'request-ir-candidate object',
        actual: mockProviderResponse.candidate,
        suggestedFix: 'Include candidate as a JSON object in the mock provider response preview.',
      })
      return blocked('mock', 'mock-no-network', 'mock-only-no-network', findings)
    }

    return {
      adapterKind: 'mock',
      status: 'candidate-payload-ready',
      providerInvocationMode: 'mock-no-network',
      providerInvocationAuthority: 'mock-only-no-network',
      candidatePayload: candidate,
      findings,
      diagnostics: noNetworkDiagnostics(),
    }
  }
}

export class UnavailableOpenAiAnalyzerProviderAdapter implements AnalyzerProviderAdapter {
  readonly adapterKind = 'openai-unavailable' as const

  invoke(input: AnalyzerProviderAdapterInput): AnalyzerProviderAdapterResult {
    return blocked('openai-unavailable', 'none', 'none-preview-only', [
      {
        code: 'AI_REQUEST_ANALYZER_OPENAI_PROVIDER_ADAPTER_UNAVAILABLE',
        severity: 'error',
        field: 'providerConfig.providerState',
        message:
          'OpenAI provider live config was supplied, but this slice implements only the adapter interface and no OpenAI SDK, network gate, or live adapter.',
        expected: 'future OpenAI adapter slice with explicit network gate',
        actual: input.providerConfig?.providerState ?? null,
        suggestedFix:
          'Use the mock provider response path for deterministic testing, import an external Request IR Candidate, or wait for the future OpenAI adapter implementation slice.',
      },
    ])
  }
}

function blocked(
  adapterKind: AnalyzerProviderAdapterKind,
  providerInvocationMode: AnalyzerProviderInvocationMode,
  providerInvocationAuthority: AnalyzerProviderInvocationAuthority,
  findings: AnalyzerProviderAdapterFinding[],
): AnalyzerProviderAdapterResult {
  return {
    adapterKind,
    status: 'blocked',
    providerInvocationMode,
    providerInvocationAuthority,
    findings,
    diagnostics: noNetworkDiagnostics(),
  }
}

function noNetworkDiagnostics(): AnalyzerProviderAdapterResult['diagnostics'] {
  return {
    llmInvoked: false,
    networkCallsAllowed: false,
    runtimeAiCallsAllowed: false,
    secretValueRead: false,
    providerResponseStored: false,
    sdkDependencyLoaded: false,
  }
}

function asRecord(value: unknown): JsonRecord | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return null
  }
  return value as JsonRecord
}
