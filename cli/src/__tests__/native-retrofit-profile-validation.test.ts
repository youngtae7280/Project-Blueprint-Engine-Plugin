import { existsSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { runDevViewCli } from '../app'
import { ExitCode } from '../core/types'
import { cleanupWorkspaces, createWorkspace, writeJson } from './fixtures/workspace'

const pluginRoot = resolve(process.cwd())

afterEach(() => {
  cleanupWorkspaces()
})

describe('Native/Retrofit profile validation report', () => {
  it('validates native profile coverage from catalog and adapter source facts without authority', async () => {
    const workspace = createWorkspace()
    writeNativeRetrofitSources(workspace)

    const result = await runDevViewCli(
      [...validationArgs(), '--markdown', join('.tmp', 'native-retrofit.md'), '--json'],
      {
        cwd: workspace,
        pluginRoot,
      },
    )
    const payload = JSON.parse(result.stdout)
    const written = JSON.parse(readFileSync(join(workspace, '.tmp', 'native-retrofit.json'), 'utf8'))

    expect(result.exitCode).toBe(ExitCode.Success)
    expect(payload.artifactRole).toBe('devview-native-retrofit-profile-validation-report')
    expect(payload.status).toBe('devview-native-retrofit-profile-validation-passed')
    expect(payload.validationScope).toBe('native-retrofit-profile-validation-report-only')
    expect(payload.nativeRetrofitModeSummary).toEqual(
      expect.objectContaining({
        mode: 'native',
        modeInferenceStatus: 'mode-declared-in-project-profile',
        declaredMode: 'native',
      }),
    )
    expect(payload.sourceChainComparison).toEqual(
      expect.objectContaining({
        projectProfileComparisonStatus: 'matched-profile-source',
        catalogAdapterComparisonStatus: 'matched-adapter-catalog-source',
        contextPlanComparisonStatus: 'matched-context-plan-source',
      }),
    )
    expect(payload.profileCoverage).toEqual(
      expect.objectContaining({
        evidenceAdapterCoverage: expect.objectContaining({ coverageStatus: 'covered' }),
        policyScopeCoverage: expect.objectContaining({ coverageStatus: 'covered' }),
        graphIngestionCoverage: expect.objectContaining({ coverageStatus: 'covered' }),
        nativeBoundaryCoverage: expect.objectContaining({ coverageStatus: 'covered' }),
      }),
    )
    expect(payload.downstreamActionPlan.length).toBeGreaterThan(0)
    expectSafetyFalse(payload)
    expect(written.writtenOutputPath).toBe('.tmp/native-retrofit.json')
    expect(existsSync(join(workspace, '.tmp', 'native-retrofit.md'))).toBe(true)
  })

  it('infers native mode from profile signals when mode is not declared', async () => {
    const workspace = createWorkspace()
    writeNativeRetrofitSources(workspace, {
      profile: projectProfile({
        devviewMode: undefined,
        domain: 'windows desktop utility',
        stack: ['typescript', 'native'],
        platforms: ['windows'],
      }),
    })

    const result = await runDevViewCli([...validationArgs(), '--json'], { cwd: workspace, pluginRoot })
    const payload = JSON.parse(result.stdout)

    expect(result.exitCode).toBe(ExitCode.Success)
    expect(payload.nativeRetrofitModeSummary).toEqual(
      expect.objectContaining({
        mode: 'native',
        modeInferenceStatus: 'mode-inferred-from-profile-signals',
        declaredMode: null,
      }),
    )
  })

  it('covers retrofit, hybrid, and unknown mode paths without creating authority', async () => {
    const cases = [
      {
        profile: projectProfile({
          devviewMode: 'retrofit',
          stack: ['legacy migration'],
          retrofitBoundaries: ['classic-to-devview-adapter'],
          legacyParityTargets: ['existing behavior contract'],
        }),
        expectedMode: 'retrofit',
        expectedCoverage: 'covered',
      },
      {
        profile: projectProfile({
          devviewMode: undefined,
          domain: 'windows native retrofit',
          stack: ['native', 'migration'],
        }),
        expectedMode: 'hybrid',
        expectedCoverage: 'covered',
      },
      {
        profile: projectProfile({
          devviewMode: undefined,
          domain: 'todo application',
          stack: ['typescript'],
          platforms: [],
          sourceBoundaries: [],
          nativeBoundaries: [],
          retrofitBoundaries: [],
        }),
        catalog: extensionProfileCatalog({
          nativeRetrofitProfileHints: { mode: 'unknown', hintStatus: 'profile-mode-unknown' },
        }),
        adapter: adapterCompatibility({
          nativeRetrofitAdapterHints: { mode: 'unknown', hintStatus: 'profile-mode-unknown' },
        }),
        context: extensionContextPlan({
          nativeRetrofitPlanning: { mode: 'unknown', hintStatus: 'profile-mode-unknown' },
        }),
        expectedMode: 'unknown',
        expectedCoverage: 'future-only',
      },
    ] as const

    for (const entry of cases) {
      const workspace = createWorkspace()
      writeNativeRetrofitSources(workspace, {
        profile: entry.profile,
        catalog: 'catalog' in entry ? entry.catalog : undefined,
        adapter: 'adapter' in entry ? entry.adapter : undefined,
        context: 'context' in entry ? entry.context : undefined,
      })

      const result = await runDevViewCli([...validationArgs(), '--json'], { cwd: workspace, pluginRoot })
      const payload = JSON.parse(result.stdout)

      expect(result.exitCode).toBe(ExitCode.Success)
      expect(payload.nativeRetrofitModeSummary.mode).toBe(entry.expectedMode)
      expect(payload.profileCoverage.retrofitParityCoverage.coverageStatus).toBe(entry.expectedCoverage)
      if (entry.expectedMode === 'unknown') {
        expect(payload.validationFindings.map((finding: { code: string }) => finding.code)).toContain(
          'NATIVE_RETROFIT_MODE_NOT_DECLARED',
        )
      }
      expectSafetyFalse(payload)
    }
  })

  it('blocks wrong source role/status and source chain mismatch before writing outputs', async () => {
    const cases = [
      {
        files: {
          catalog: {
            artifactRole: 'devview-extension-context-plan',
            status: 'devview-extension-context-plan-generated',
          },
        },
        expectedCode: 'NATIVE_RETROFIT_EXTENSION_CATALOG_ROLE_STATUS_INVALID',
      },
      {
        files: { adapter: { ...adapterCompatibility(), sourceExtensionProfileCatalog: 'other-catalog.json' } },
        expectedCode: 'NATIVE_RETROFIT_SOURCE_CHAIN_ADAPTER_CATALOG_MISMATCH',
      },
    ]

    for (const entry of cases) {
      const workspace = createWorkspace()
      writeNativeRetrofitSources(workspace, entry.files)

      const result = await runDevViewCli([...validationArgs(), '--json'], { cwd: workspace, pluginRoot })
      const payload = JSON.parse(result.stderr)

      expect(result.exitCode).toBe(ExitCode.ValidationFailed)
      expect(payload.validationFindings.map((finding: { code: string }) => finding.code)).toContain(entry.expectedCode)
      expect(existsSync(join(workspace, '.tmp', 'native-retrofit.json'))).toBe(false)
    }
  })

  it('blocks unsafe execution/provider/network/shell and authority flags before writing outputs', async () => {
    const workspace = createWorkspace()
    const unsafeAdapter = adapterCompatibility()
    unsafeAdapter.providerInvoked = true
    unsafeAdapter.networkCallMade = true
    unsafeAdapter.shellCommandsExecuted = true
    ;(unsafeAdapter.evidenceAdapterCompatibility as Record<string, unknown>).runtimeEvidenceSatisfied = true
    writeNativeRetrofitSources(workspace, { adapter: unsafeAdapter })

    const result = await runDevViewCli([...validationArgs(), '--json'], { cwd: workspace, pluginRoot })
    const payload = JSON.parse(result.stderr)

    expect(result.exitCode).toBe(ExitCode.ValidationFailed)
    expect(payload.nativeRetrofitValidationStatus).toBe('blocked-unsafe-authority-flag')
    expect(payload.validationFindings.map((finding: { code: string }) => finding.code)).toContain(
      'NATIVE_RETROFIT_UNSAFE_SOURCE_AUTHORITY_FLAG',
    )
    expect(existsSync(join(workspace, '.tmp', 'native-retrofit.json'))).toBe(false)
  })

  it('blocks source overwrite, protected outputs, and output collisions with zero writes', async () => {
    const cases = [
      {
        output: 'profile.json',
        expected: 'would overwrite a source input',
      },
      {
        output: join('.devview', 'generated', 'native-retrofit.json'),
        expected: 'inside a protected control path',
      },
      {
        output: join('.tmp', 'native-retrofit.json'),
        markdown: join('.tmp', 'native-retrofit.json'),
        expected: 'must be different',
      },
    ]

    for (const entry of cases) {
      const workspace = createWorkspace()
      writeNativeRetrofitSources(workspace)

      const result = await runDevViewCli(
        [...validationArgs(entry.output), ...(entry.markdown ? ['--markdown', entry.markdown] : []), '--json'],
        { cwd: workspace, pluginRoot },
      )

      expect(result.exitCode).toBe(ExitCode.ValidationFailed)
      expect(result.stderr).toContain(entry.expected)
    }
  })
})

function validationArgs(output = join('.tmp', 'native-retrofit.json')): string[] {
  return [
    'extensions',
    'validate-native-retrofit-profile',
    '--project-profile',
    'profile.json',
    '--extension-profile-catalog',
    'catalog.json',
    '--extension-adapter-compatibility-report',
    'adapter-compatibility.json',
    '--extension-context-plan',
    'context-plan.json',
    '--output',
    output,
  ]
}

function writeNativeRetrofitSources(
  workspace: string,
  overrides: {
    profile?: Record<string, unknown>
    catalog?: Record<string, unknown>
    adapter?: Record<string, unknown>
    context?: Record<string, unknown>
  } = {},
): void {
  writeJson(join(workspace, 'profile.json'), overrides.profile ?? projectProfile())
  writeJson(join(workspace, 'catalog.json'), overrides.catalog ?? extensionProfileCatalog())
  writeJson(join(workspace, 'adapter-compatibility.json'), overrides.adapter ?? adapterCompatibility())
  writeJson(join(workspace, 'context-plan.json'), overrides.context ?? extensionContextPlan())
}

function projectProfile(
  overrides: {
    devviewMode?: string
    domain?: string
    stack?: string[]
    platforms?: string[]
    sourceBoundaries?: string[]
    nativeBoundaries?: string[]
    retrofitBoundaries?: string[]
    legacyParityTargets?: string[]
  } = {},
): Record<string, unknown> {
  const profile: Record<string, unknown> = {
    schemaVersion: 1,
    artifactRole: 'devview-project-profile',
    status: 'devview-project-profile-configured',
    projectProfileId: 'native-retrofit-fixture',
    projectName: 'Native Retrofit Fixture',
    domain: overrides.domain ?? 'desktop native utility',
    stack: overrides.stack ?? ['typescript', 'native'],
    platforms: overrides.platforms ?? ['windows'],
    sourceBoundaries: overrides.sourceBoundaries ?? ['src/native'],
    protectedPaths: ['.devview/**'],
    nativeBoundaries: overrides.nativeBoundaries ?? ['native-interop'],
    retrofitBoundaries: overrides.retrofitBoundaries ?? [],
    legacyParityTargets: overrides.legacyParityTargets ?? [],
    extensionExecutionAllowed: false,
    extensionsExecuted: false,
    providerInvoked: false,
    networkCallMade: false,
    shellCommandsExecuted: false,
    filesMutated: false,
    graphSourceMutated: false,
    graphDeltaApplied: false,
    runtimeEvidenceSatisfied: false,
    evidenceAccepted: false,
    equivalenceProven: false,
    scopeEnforced: false,
    ciEnforcementEnabled: false,
    hooksActivated: false,
    branchProtectionChanged: false,
    branchProtectionMutated: false,
    requiredChecksConfigured: false,
    requiredChecksMutated: false,
    externalCiMutated: false,
    diffRejectionEnabled: false,
    diffRejectionActivated: false,
    approvalAutomationEnabled: false,
    userAcceptanceAutomated: false,
  }
  if (overrides.devviewMode !== undefined) {
    profile.devviewMode = overrides.devviewMode
  } else if (!Object.prototype.hasOwnProperty.call(overrides, 'devviewMode')) {
    profile.devviewMode = 'native'
  }
  return profile
}

function extensionProfileCatalog(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    artifactRole: 'devview-extension-profile-catalog',
    status: 'devview-extension-profile-catalog-compiled',
    extensionCatalogStatus: 'compiled-declarative-capabilities-only',
    sourceProjectProfile: 'profile.json',
    catalogEntryCount: 3,
    extensionCatalogEntries: [],
    capabilityCatalog: {
      analyzerExtensions: ['graphify-protocol'],
      viewTreeExtractorExtensions: ['native-view-tree'],
      contextPackExtensions: ['native-context-pack'],
      evidenceAdapters: ['native-evidence'],
      policyExtensions: ['native-policy'],
      skillWorkflowExtensions: [],
      graphIngestionCandidates: ['graphify-protocol'],
    },
    graphIngestionCandidates: [
      {
        extensionId: 'graphify-protocol',
        graphProviderKind: 'graphify',
        protocolStatus: 'protocol-only-not-executed',
        executionAllowed: false,
        providerInvoked: false,
        networkCallMade: false,
        shellCommandsExecuted: false,
      },
    ],
    nativeRetrofitProfileHints: {
      mode: 'native',
      hintStatus: 'profile-mode-declared',
      nativeSignals: ['native'],
      retrofitSignals: [],
    },
    downstreamCompatibility: {
      canInformViewTree: true,
      canInformContextPack: true,
      canInformEvidenceAdapterValidation: true,
      canInformPolicyValidation: true,
      canInformGraphIngestionPlanning: true,
      canExecuteExtensionCode: false,
      canSatisfyEvidence: false,
      canProveEquivalence: false,
      canEnforceScope: false,
    },
    extensionExecutionAllowed: false,
    extensionsExecuted: false,
    providerInvoked: false,
    networkCallMade: false,
    shellCommandsExecuted: false,
    filesMutated: false,
    graphSourceMutated: false,
    graphDeltaApplied: false,
    runtimeEvidenceSatisfied: false,
    evidenceAccepted: false,
    equivalenceProven: false,
    scopeEnforced: false,
    ciEnforcementEnabled: false,
    hooksActivated: false,
    branchProtectionChanged: false,
    branchProtectionMutated: false,
    requiredChecksConfigured: false,
    requiredChecksMutated: false,
    externalCiMutated: false,
    diffRejectionEnabled: false,
    diffRejectionActivated: false,
    approvalAutomationEnabled: false,
    userAcceptanceAutomated: false,
    ...overrides,
  }
}

function adapterCompatibility(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    artifactRole: 'devview-extension-adapter-compatibility-report',
    status: 'devview-extension-adapter-compatibility-validated',
    compatibilityScope: 'extension-adapter-compatibility-report-only',
    adapterCompatibilityStatus: 'validated-report-only-compatibility',
    sourceExtensionProfileCatalog: 'catalog.json',
    sourceExtensionContextPlan: 'context-plan.json',
    evidenceAdapterCompatibility: {
      compatibilityStatus: 'compatible',
      extensionIds: ['native-evidence'],
      adapterExecuted: false,
      runtimeEvidenceSatisfied: false,
      evidenceAccepted: false,
    },
    policyExtensionCompatibility: {
      compatibilityStatus: 'compatible',
      extensionIds: ['native-policy'],
      policyEnforced: false,
      scopeEnforced: false,
      ciEnforcementEnabled: false,
    },
    proofLifecycleCompatibility: {
      compatibilityStatus: 'compatible',
      extensionIds: ['native-evidence'],
      equivalenceProven: false,
    },
    graphIngestionPlanningContext: {
      candidateCount: 1,
      graphifyCandidateCount: 1,
      protocolStatus: 'protocol-only-not-executed',
      providerInvoked: false,
      networkCallMade: false,
      shellCommandsExecuted: false,
      executionAllowed: false,
    },
    nativeRetrofitAdapterHints: {
      mode: 'native',
      hintStatus: 'profile-mode-declared',
      nativeSignals: ['native'],
      retrofitSignals: [],
      adapterRelevanceStatus: 'native-retrofit-hints-available',
    },
    extensionExecutionAllowed: false,
    extensionsExecuted: false,
    providerInvoked: false,
    networkCallMade: false,
    shellCommandsExecuted: false,
    filesMutated: false,
    graphSourceMutated: false,
    graphDeltaApplied: false,
    runtimeEvidenceSatisfied: false,
    evidenceAccepted: false,
    equivalenceProven: false,
    scopeEnforced: false,
    ciEnforcementEnabled: false,
    hooksActivated: false,
    branchProtectionChanged: false,
    branchProtectionMutated: false,
    requiredChecksConfigured: false,
    requiredChecksMutated: false,
    externalCiMutated: false,
    diffRejectionEnabled: false,
    diffRejectionActivated: false,
    approvalAutomationEnabled: false,
    userAcceptanceAutomated: false,
    adapterExecuted: false,
    policyEnforced: false,
    ...overrides,
  }
}

function extensionContextPlan(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    artifactRole: 'devview-extension-context-plan',
    status: 'devview-extension-context-plan-generated',
    planningScope: 'extension-context-planning-report-only',
    extensionContextPlanStatus: 'generated-report-only-hints',
    sourceExtensionProfileCatalog: 'catalog.json',
    viewTreeHintPlan: {
      alignmentStatus: 'view-tree-extension-hints-available-for-source-view-tree',
    },
    contextPackHintPlan: {
      alignmentStatus: 'context-pack-extension-hints-available-for-source-context-pack',
    },
    graphIngestionPlanning: {
      candidateCount: 1,
      graphifyCandidateCount: 1,
      providerInvoked: false,
      networkCallMade: false,
      shellCommandsExecuted: false,
      executionAllowed: false,
    },
    nativeRetrofitPlanning: {
      mode: 'native',
      hintStatus: 'profile-mode-declared',
      nativeSignals: ['native'],
      retrofitSignals: [],
    },
    extensionExecutionAllowed: false,
    extensionsExecuted: false,
    providerInvoked: false,
    networkCallMade: false,
    shellCommandsExecuted: false,
    filesMutated: false,
    graphSourceMutated: false,
    graphDeltaApplied: false,
    runtimeEvidenceSatisfied: false,
    evidenceAccepted: false,
    equivalenceProven: false,
    scopeEnforced: false,
    ciEnforcementEnabled: false,
    hooksActivated: false,
    branchProtectionChanged: false,
    branchProtectionMutated: false,
    requiredChecksConfigured: false,
    requiredChecksMutated: false,
    externalCiMutated: false,
    diffRejectionEnabled: false,
    diffRejectionActivated: false,
    approvalAutomationEnabled: false,
    userAcceptanceAutomated: false,
    traversalAuthorityGranted: false,
    contextPackMutated: false,
    viewTreeMutated: false,
    ...overrides,
  }
}

function expectSafetyFalse(payload: Record<string, unknown>): void {
  for (const field of [
    'extensionExecutionAllowed',
    'extensionsExecuted',
    'providerInvoked',
    'networkCallMade',
    'shellCommandsExecuted',
    'filesMutated',
    'graphSourceMutated',
    'graphDeltaApplied',
    'runtimeEvidenceSatisfied',
    'evidenceAccepted',
    'equivalenceProven',
    'scopeEnforced',
    'ciEnforcementEnabled',
    'hooksActivated',
    'branchProtectionChanged',
    'branchProtectionMutated',
    'requiredChecksConfigured',
    'requiredChecksMutated',
    'externalCiMutated',
    'diffRejectionEnabled',
    'diffRejectionActivated',
    'approvalAutomationEnabled',
    'userAcceptanceAutomated',
    'adapterExecuted',
    'policyEnforced',
    'traversalAuthorityGranted',
    'contextPackMutated',
    'viewTreeMutated',
  ]) {
    expect(payload[field], field).toBe(false)
  }
}
