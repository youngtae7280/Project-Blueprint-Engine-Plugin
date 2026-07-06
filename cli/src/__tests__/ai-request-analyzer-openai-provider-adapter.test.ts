import { describe, expect, it } from 'vitest'
import { createOpenAiAnalyzerProviderAdapter } from '../core/ai-request-analyzer-openai-provider-adapter'

const requestText = 'Add Todo App runtime evidence for the add button behavior without touching production source.'

describe('OpenAI analyzer provider adapter', () => {
  it('returns candidate payload from mocked Responses API output without storing raw responses', async () => {
    let requestPayload: Record<string, unknown> | null = null
    const adapter = createOpenAiAnalyzerProviderAdapter({
      envReader: (name) => (name === 'OPENAI_API_KEY' ? 'test-runtime-key' : undefined),
      clientFactory: () => ({
        responses: {
          create: async (payload) => {
            requestPayload = payload
            return { output_text: JSON.stringify(validRequestIrCandidate()) }
          },
        },
      }),
    })

    const result = await adapter.invoke({
      requestText,
      analyzerPack: validAnalyzerPack(),
      providerConfig: validOpenAiProviderConfig(),
    })

    expect(result.adapterKind).toBe('openai')
    expect(result.status).toBe('candidate-payload-ready')
    expect(result.providerInvocationMode).toBe('openai-live')
    expect(result.providerInvocationAuthority).toBe('explicit-openai-network-gated')
    expect(result.candidatePayload?.artifactRole).toBe('request-ir-candidate')
    expect(result.findings).toEqual([])
    expect(result.diagnostics).toEqual({
      llmInvoked: true,
      networkCallsAllowed: true,
      runtimeAiCallsAllowed: true,
      secretValueRead: true,
      providerResponseStored: false,
      sdkDependencyLoaded: true,
    })
    expect(requestPayload?.store).toBe(false)
    expect(requestPayload?.max_output_tokens).toBe(1200)
  })

  it('blocks missing environment variable before constructing a client', async () => {
    let clientFactoryCalled = false
    const adapter = createOpenAiAnalyzerProviderAdapter({
      envReader: () => undefined,
      clientFactory: () => {
        clientFactoryCalled = true
        throw new Error('client factory should not be called')
      },
    })

    const result = await adapter.invoke({
      requestText,
      analyzerPack: validAnalyzerPack(),
      providerConfig: validOpenAiProviderConfig(),
    })

    expect(result.status).toBe('blocked')
    expect(result.findings.map((finding) => finding.code)).toContain('AI_REQUEST_ANALYZER_OPENAI_API_KEY_ENV_MISSING')
    expect(result.diagnostics.secretValueRead).toBe(false)
    expect(result.diagnostics.sdkDependencyLoaded).toBe(false)
    expect(clientFactoryCalled).toBe(false)
  })

  it('blocks invalid JSON provider output', async () => {
    const adapter = createOpenAiAnalyzerProviderAdapter({
      envReader: (name) => (name === 'OPENAI_API_KEY' ? 'test-runtime-key' : undefined),
      clientFactory: () => ({
        responses: {
          create: async () => ({ output_text: 'not-json' }),
        },
      }),
    })

    const result = await adapter.invoke({
      requestText,
      analyzerPack: validAnalyzerPack(),
      providerConfig: validOpenAiProviderConfig(),
    })

    expect(result.status).toBe('blocked')
    expect(result.candidatePayload).toBeUndefined()
    expect(result.findings.map((finding) => finding.code)).toContain('AI_REQUEST_ANALYZER_OPENAI_RESPONSE_INVALID_JSON')
    expect(result.diagnostics.llmInvoked).toBe(true)
  })

  it('redacts provider error messages', async () => {
    const runtimeSecretLikeValue = ['sk', 'thisisnotarealkey123456'].join('-')
    const adapter = createOpenAiAnalyzerProviderAdapter({
      envReader: (name) => (name === 'OPENAI_API_KEY' ? 'test-runtime-key' : undefined),
      clientFactory: () => ({
        responses: {
          create: async () => {
            throw new Error(`provider failed with ${runtimeSecretLikeValue}`)
          },
        },
      }),
    })

    const result = await adapter.invoke({
      requestText,
      analyzerPack: validAnalyzerPack(),
      providerConfig: validOpenAiProviderConfig(),
    })
    const rendered = JSON.stringify(result)

    expect(result.status).toBe('blocked')
    expect(result.findings.map((finding) => finding.code)).toContain('AI_REQUEST_ANALYZER_OPENAI_PROVIDER_ERROR')
    expect(rendered).not.toContain(runtimeSecretLikeValue)
    expect(rendered).toContain('<redacted-secret>')
  })
})

function validAnalyzerPack(): Record<string, unknown> {
  return {
    artifactRole: 'ai-request-analyzer-pack',
    status: 'ai-request-analyzer-pack-generated',
    expectedOutputArtifactRole: 'request-ir-candidate',
    expectedOutputSchemaId: 'devview-request-ir-candidate-v0-preview',
  }
}

function validOpenAiProviderConfig(): Record<string, unknown> {
  return {
    artifactRole: 'ai-request-analyzer-provider-config-preview',
    status: 'ai-request-analyzer-provider-config-openai-live-disabled-by-default-previewed',
    providerState: 'configured-openai-invocation-enabled',
    providerNameCandidate: 'openai',
    modelNameCandidate: 'gpt-future-preview',
    apiKeySourceRef: 'OPENAI_API_KEY',
    timeoutMs: 1000,
    maxOutputTokens: 1200,
    structuredOutputMode: 'responses-text-format-json-schema',
    storeProviderResponse: false,
    providerInvocationAuthority: 'explicit-invocation-and-network-flags-required-not-implemented',
    networkCallsAllowed: false,
    llmInvoked: false,
    runtimeAiCallsAllowed: false,
    requestIrCandidateGenerated: false,
    secretValueStored: false,
    secretValueInspected: false,
  }
}

function validRequestIrCandidate(): Record<string, unknown> {
  return {
    schemaVersion: 1,
    artifactRole: 'request-ir-candidate',
    status: 'request-ir-candidate-openai-previewed',
    schemaId: 'devview-request-ir-candidate-v0-preview',
    requestIrCandidateStatus: 'candidate-only',
    sourceNaturalLanguageRequest: {
      sourceKind: 'human-natural-language-request',
      language: 'en',
      text: requestText,
      authorityStatus: 'raw-request-text-not-compiler-authority',
    },
    requestText,
    requestLanguage: 'en',
    requestTypeCandidate: 'runtime-evidence-only',
    targetRecordIdCandidate: 'CH-001',
    targetComponentCandidate: 'Todo App',
    intentSummaryCandidate: 'Add runtime evidence for add button behavior without production source changes.',
    allowedScopeIntentCandidate: ['runtime behavior evidence'],
    forbiddenScopeIntentCandidate: ['production source changes'],
    requiredEvidenceIntentCandidate: ['add-todo behavior proof'],
    riskIntentCandidate: ['production source must remain untouched'],
    confidence: { score: 0.74, band: 'medium' },
    ambiguities: [],
    requiresClarification: false,
    humanReviewRequired: true,
    candidateOnly: true,
    authorityStatus: 'not-authoritative-until-validated',
    validatedRequestIr: false,
    graphTraversalAllowed: false,
    contractGenerationAllowed: false,
    instructionPackGenerationAllowed: false,
    graphSourceMutated: false,
    graphDeltaApplied: false,
    approvalStatus: 'not-approved',
    equivalenceProven: false,
    runtimeEvidenceSatisfied: false,
  }
}
