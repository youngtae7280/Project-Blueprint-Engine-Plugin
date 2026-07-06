import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const boundaryPath = resolve(
  process.cwd(),
  'examples/valid/todo-app-pbe-run/generated/ai-request-analyzer-provider-config-boundary.runtime-evidence-only.preview.json',
)
const disabledConfigPath = resolve(
  process.cwd(),
  'examples/valid/todo-app-pbe-run/generated/ai-request-analyzer-provider-config.disabled.runtime-evidence-only.preview.json',
)
const invocationEnabledConfigPath = resolve(
  process.cwd(),
  'examples/valid/todo-app-pbe-run/generated/ai-request-analyzer-provider-config.invocation-enabled.runtime-evidence-only.preview.json',
)

const expectedProviderStates = [
  'disabled',
  'configured-not-invoked',
  'configured-invocation-enabled-preview',
  'unavailable',
  'blocked-invalid-config',
  'future-invocation-allowed-only-after-explicit-config',
]

const unsafeSecretPatterns = [
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

describe('AI Request Analyzer provider config boundary previews', () => {
  it('parses both provider config artifacts', () => {
    const boundary = readJson(boundaryPath)
    const disabledConfig = readJson(disabledConfigPath)
    const invocationEnabledConfig = readJson(invocationEnabledConfigPath)

    expect(boundary.artifactRole).toBe('ai-request-analyzer-provider-config-boundary-preview')
    expect(boundary.status).toBe('ai-request-analyzer-provider-config-boundary-previewed')
    expect(disabledConfig.artifactRole).toBe('ai-request-analyzer-provider-config-preview')
    expect(disabledConfig.status).toBe('ai-request-analyzer-provider-config-disabled-previewed')
    expect(disabledConfig.providerState).toBe('disabled')
    expect(invocationEnabledConfig.artifactRole).toBe('ai-request-analyzer-provider-config-preview')
    expect(invocationEnabledConfig.status).toBe('ai-request-analyzer-provider-config-invocation-enabled-previewed')
    expect(invocationEnabledConfig.providerState).toBe('configured-invocation-enabled-preview')
  })

  it('defines the provider state taxonomy', () => {
    const boundary = readJson(boundaryPath)
    const states = (boundary.providerStateTaxonomy as Array<{ providerState: string }>).map(
      (entry) => entry.providerState,
    )

    expect(states).toEqual(expectedProviderStates)
  })

  it('keeps disabled provider config from granting invocation authority', () => {
    const disabledConfig = readJson(disabledConfigPath)

    expect(disabledConfig.providerState).toBe('disabled')
    expect(disabledConfig.providerInvocationAuthority).toBe('none-preview-only')
    expect(disabledConfig.providerConfigReaderImplemented).toBe(false)
    expect(disabledConfig.providerAdapterImplemented).toBe(false)
    expect(disabledConfig.providerInvocationImplemented).toBe(false)
    expect(disabledConfig.networkCallsAllowed).toBe(false)
    expect(disabledConfig.llmInvoked).toBe(false)
    expect(disabledConfig.runtimeAiCallsAllowed).toBe(false)
    expect(disabledConfig.requestIrCandidateGenerated).toBe(false)
    expect(disabledConfig.candidateOnly).toBe(true)
  })

  it('keeps invocation-enabled preview from granting current invocation authority', () => {
    const invocationEnabledConfig = readJson(invocationEnabledConfigPath)

    expect(invocationEnabledConfig.providerState).toBe('configured-invocation-enabled-preview')
    expect(invocationEnabledConfig.providerInvocationAuthority).toBe('explicit-future-flag-required-not-implemented')
    expect(invocationEnabledConfig.explicitInvocationFlagRequired).toBe('--invoke-provider')
    expect(invocationEnabledConfig.externalCandidateWithInvokeProviderPolicy).toBe('blocked-future-policy')
    expect(invocationEnabledConfig.providerAdapterImplemented).toBe(false)
    expect(invocationEnabledConfig.providerInvocationImplemented).toBe(false)
    expect(invocationEnabledConfig.explicitInvocationFlagImplemented).toBe(false)
    expect(invocationEnabledConfig.networkCallsAllowed).toBe(false)
    expect(invocationEnabledConfig.llmInvoked).toBe(false)
    expect(invocationEnabledConfig.runtimeAiCallsAllowed).toBe(false)
    expect(invocationEnabledConfig.requestIrCandidateGenerated).toBe(false)
    expect(invocationEnabledConfig.candidateOnly).toBe(true)
  })

  it('does not store secret-looking literal values while allowing env var references', () => {
    const boundaryText = readFileSync(boundaryPath, 'utf8')
    const disabledConfigText = readFileSync(disabledConfigPath, 'utf8')
    const invocationEnabledConfigText = readFileSync(invocationEnabledConfigPath, 'utf8')
    const testSourceText = readFileSync(new URL(import.meta.url), 'utf8')

    expect(boundaryText).toContain('OPENAI_API_KEY')
    expect(invocationEnabledConfigText).toContain('OPENAI_API_KEY')
    expect(readJson(boundaryPath).secretPolicy).toMatchObject({
      secretValueStored: false,
      secretValueInspected: false,
      secretValuesAllowedInArtifacts: false,
    })
    for (const pattern of unsafeSecretPatterns) {
      expect(boundaryText).not.toMatch(pattern)
      expect(disabledConfigText).not.toMatch(pattern)
      expect(invocationEnabledConfigText).not.toMatch(pattern)
      expect(testSourceText).not.toMatch(pattern)
    }
  })

  it('keeps downstream safety and authority flags false or disabled', () => {
    const boundary = readJson(boundaryPath)
    const disabledConfig = readJson(disabledConfigPath)
    const invocationEnabledConfig = readJson(invocationEnabledConfigPath)

    expectFalseFlags(boundary.currentBoundaryFlags as Record<string, unknown>)
    expectFalseFlags(disabledConfig.currentBoundaryFlags as Record<string, unknown>)
    expectFalseFlags(disabledConfig.downstreamAuthorityBoundaries as Record<string, unknown>)
    expectFalseFlags(invocationEnabledConfig.currentBoundaryFlags as Record<string, unknown>)
    expectFalseFlags(invocationEnabledConfig.downstreamAuthorityBoundaries as Record<string, unknown>)
    expect(boundary.currentBoundaryFlags).toMatchObject({
      approvalStatus: 'not-approved',
      candidateOnly: true,
      projectMemoryExtensionAuthorityGranted: false,
    })
    expect(disabledConfig.currentBoundaryFlags).toMatchObject({
      approvalStatus: 'not-approved',
      projectMemoryExtensionAuthorityGranted: false,
    })
    expect(invocationEnabledConfig.currentBoundaryFlags).toMatchObject({
      approvalStatus: 'not-approved',
      projectMemoryExtensionAuthorityGranted: false,
    })
  })
})

function readJson(filePath: string): Record<string, unknown> {
  return JSON.parse(readFileSync(filePath, 'utf8')) as Record<string, unknown>
}

function expectFalseFlags(flags: Record<string, unknown>): void {
  for (const [key, value] of Object.entries(flags)) {
    if (key === 'approvalStatus') {
      expect(value).toBe('not-approved')
    } else if (key === 'candidateOnly') {
      expect(value).toBe(true)
    } else {
      expect(value, key).toBe(false)
    }
  }
}
