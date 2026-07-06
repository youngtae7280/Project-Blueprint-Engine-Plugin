import { describe, expect, it } from 'vitest'
import {
  createMockAnalyzerProviderAdapter,
  createUnavailableOpenAiAnalyzerProviderAdapter,
} from '../core/ai-request-analyzer-provider-adapter'

const requestText = 'Add Todo App runtime evidence for the add button behavior without touching production source.'

describe('AI Request Analyzer provider adapter interface', () => {
  it('returns mock candidate payload with no-network diagnostics', () => {
    const result = createMockAnalyzerProviderAdapter().invoke({
      requestText,
      analyzerPack: validAnalyzerPack(),
      providerConfig: validProviderConfig('configured-invocation-enabled-preview'),
      mockProviderResponse: validMockProviderResponse(),
      mockProviderResponseText: JSON.stringify(validMockProviderResponse()),
    })

    expect(result.adapterKind).toBe('mock')
    expect(result.status).toBe('candidate-payload-ready')
    expect(result.providerInvocationMode).toBe('mock-no-network')
    expect(result.providerInvocationAuthority).toBe('mock-only-no-network')
    expect(result.candidatePayload?.artifactRole).toBe('request-ir-candidate')
    expect(result.findings).toEqual([])
    expect(result.diagnostics).toEqual({
      llmInvoked: false,
      networkCallsAllowed: false,
      runtimeAiCallsAllowed: false,
      secretValueRead: false,
      providerResponseStored: false,
      sdkDependencyLoaded: false,
    })
  })

  it('blocks invalid mock response before returning a candidate payload', () => {
    const result = createMockAnalyzerProviderAdapter().invoke({
      requestText,
      analyzerPack: validAnalyzerPack(),
      providerConfig: validProviderConfig('configured-invocation-enabled-preview'),
      mockProviderResponse: {
        ...validMockProviderResponse(),
        status: 'wrong-status',
      },
      mockProviderResponseText: JSON.stringify({ status: 'wrong-status' }),
    })

    expect(result.status).toBe('blocked')
    expect(result.candidatePayload).toBeUndefined()
    expect(result.findings.map((finding) => finding.code)).toContain(
      'AI_REQUEST_ANALYZER_MOCK_PROVIDER_RESPONSE_MISMATCH',
    )
    expect(result.diagnostics.networkCallsAllowed).toBe(false)
    expect(result.diagnostics.llmInvoked).toBe(false)
  })

  it('blocks mock response with secret-looking runtime value', () => {
    const runtimeSecretLikeValue = ['sk', 'thisisnotarealkey123456'].join('-')
    const response = validMockProviderResponse()
    const result = createMockAnalyzerProviderAdapter().invoke({
      requestText,
      analyzerPack: validAnalyzerPack(),
      providerConfig: validProviderConfig('configured-invocation-enabled-preview'),
      mockProviderResponse: response,
      mockProviderResponseText: JSON.stringify({ ...response, redactedExample: runtimeSecretLikeValue }),
    })

    expect(result.status).toBe('blocked')
    expect(result.candidatePayload).toBeUndefined()
    expect(result.findings.map((finding) => finding.code)).toContain(
      'AI_REQUEST_ANALYZER_MOCK_PROVIDER_RESPONSE_SECRET_VALUE_BLOCKED',
    )
    expect(result.diagnostics.secretValueRead).toBe(false)
  })

  it('keeps OpenAI placeholder unavailable without SDK, network, or secret reads', () => {
    const result = createUnavailableOpenAiAnalyzerProviderAdapter().invoke({
      requestText,
      analyzerPack: validAnalyzerPack(),
      providerConfig: validProviderConfig('configured-openai-invocation-enabled'),
    })

    expect(result.adapterKind).toBe('openai-unavailable')
    expect(result.status).toBe('blocked')
    expect(result.providerInvocationMode).toBe('none')
    expect(result.providerInvocationAuthority).toBe('none-preview-only')
    expect(result.candidatePayload).toBeUndefined()
    expect(result.findings.map((finding) => finding.code)).toContain(
      'AI_REQUEST_ANALYZER_OPENAI_PROVIDER_ADAPTER_UNAVAILABLE',
    )
    expect(result.diagnostics).toEqual({
      llmInvoked: false,
      networkCallsAllowed: false,
      runtimeAiCallsAllowed: false,
      secretValueRead: false,
      providerResponseStored: false,
      sdkDependencyLoaded: false,
    })
  })

  it('does not keep tracked direct secret-looking values in this test source', async () => {
    const sourceText = await import('node:fs').then(({ readFileSync }) =>
      readFileSync(new URL(import.meta.url), 'utf8'),
    )

    expect(sourceText).not.toMatch(/sk-[A-Za-z0-9_-]{12,}/)
  })
})

function validAnalyzerPack(): Record<string, unknown> {
  return {
    artifactRole: 'ai-request-analyzer-pack',
    status: 'ai-request-analyzer-pack-generated',
    expectedOutputArtifactRole: 'request-ir-candidate',
    expectedOutputSchemaId: 'devview-request-ir-candidate-v0-preview',
    llmInvoked: false,
    networkCallsAllowed: false,
    requestIrCandidateGenerated: false,
  }
}

function validProviderConfig(providerState: string): Record<string, unknown> {
  return {
    artifactRole: 'ai-request-analyzer-provider-config-preview',
    providerState,
    networkCallsAllowed: false,
    llmInvoked: false,
    runtimeAiCallsAllowed: false,
    requestIrCandidateGenerated: false,
    secretValueStored: false,
    secretValueInspected: false,
  }
}

function validMockProviderResponse(): Record<string, unknown> {
  return {
    schemaVersion: 1,
    artifactRole: 'ai-request-analyzer-mock-provider-response-preview',
    status: 'ai-request-analyzer-mock-provider-response-previewed',
    providerInvocationMode: 'mock-no-network',
    networkCallsAllowed: false,
    llmInvoked: false,
    runtimeAiCallsAllowed: false,
    secretValueStored: false,
    secretValueInspected: false,
    candidate: validRequestIrCandidate(),
  }
}

function validRequestIrCandidate(): Record<string, unknown> {
  return {
    schemaVersion: 1,
    artifactRole: 'request-ir-candidate',
    status: 'request-ir-candidate-previewed',
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
