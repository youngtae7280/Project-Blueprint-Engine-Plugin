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

describe('Extension adapter compatibility report', () => {
  it('validates catalog and context plan adapter hints against optional readiness sources without authority', async () => {
    const workspace = createWorkspace()
    writeCompatibilitySources(workspace)

    const result = await runDevViewCli(
      [
        ...compatibilityArgs(),
        '--runtime-evidence-satisfaction-readiness',
        join('generated', 'runtime-readiness.json'),
        '--equivalence-proof-readiness',
        join('generated', 'equivalence-readiness.json'),
        '--scope-ci-enforcement-readiness',
        join('generated', 'scope-ci-readiness.json'),
        '--markdown',
        join('.tmp', 'adapter-compatibility.md'),
        '--json',
      ],
      { cwd: workspace, pluginRoot },
    )
    const payload = JSON.parse(result.stdout)
    const written = JSON.parse(readFileSync(join(workspace, '.tmp', 'adapter-compatibility.json'), 'utf8'))

    expect(result.exitCode).toBe(ExitCode.Success)
    expect(payload.artifactRole).toBe('devview-extension-adapter-compatibility-report')
    expect(payload.status).toBe('devview-extension-adapter-compatibility-validated')
    expect(payload.compatibilityScope).toBe('extension-adapter-compatibility-report-only')
    expect(payload.sourceChainComparison.catalogContextPlanComparisonStatus).toBe('matched-catalog-source')
    expect(payload.evidenceAdapterCompatibility).toEqual(
      expect.objectContaining({
        compatibilityStatus: 'compatible',
        extensionIds: ['todo-evidence-adapter'],
        sourceReadinessStatus: 'devview-runtime-evidence-satisfaction-readiness-blocked',
        requiredMappingId: 'required-evidence-1',
        adapterExecuted: false,
        runtimeEvidenceSatisfied: false,
      }),
    )
    expect(payload.policyExtensionCompatibility).toEqual(
      expect.objectContaining({
        compatibilityStatus: 'compatible',
        extensionIds: ['todo-policy-extension'],
        sourceReadinessStatus: 'devview-scope-ci-enforcement-readiness-blocked',
        policyEnforced: false,
        scopeEnforced: false,
        ciEnforcementEnabled: false,
      }),
    )
    expect(payload.proofLifecycleCompatibility).toEqual(
      expect.objectContaining({
        compatibilityStatus: 'compatible',
        sourceReadinessStatus: 'devview-equivalence-proof-readiness-blocked',
        equivalenceProven: false,
      }),
    )
    expect(payload.graphIngestionPlanningContext).toEqual(
      expect.objectContaining({
        candidateCount: 1,
        graphifyCandidateCount: 1,
        protocolStatus: 'protocol-only-not-executed',
        providerInvoked: false,
        networkCallMade: false,
        shellCommandsExecuted: false,
        executionAllowed: false,
      }),
    )
    expect(payload.nativeRetrofitAdapterHints).toEqual(
      expect.objectContaining({
        mode: 'native',
        hintStatus: 'profile-mode-declared',
        adapterRelevanceStatus: 'native-retrofit-hints-carried',
      }),
    )
    expect(payload.unsupportedFutureOnlyAdapterCapabilities).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          capability: 'graph-ingestion-protocol',
          status: 'future-only',
        }),
      ]),
    )
    expect(payload.downstreamActionPlan.map((entry: { actionId: string }) => entry.actionId)).toEqual(
      expect.arrayContaining([
        'connect-evidence-adapter-validation',
        'connect-policy-extension-validation',
        'keep-graph-ingestion-protocol-only',
      ]),
    )
    expectSafetyFalse(payload)
    expect(written.writtenOutputPath).toBe('.tmp/adapter-compatibility.json')
    expect(existsSync(join(workspace, '.tmp', 'adapter-compatibility.md'))).toBe(true)
  })

  it('reports missing adapter mappings without blocking when source shapes are valid', async () => {
    const workspace = createWorkspace()
    writeCompatibilitySources(workspace, {
      catalog: extensionProfileCatalog({ evidenceAdapters: [], policyExtensions: [] }),
      contextPlan: extensionContextPlan({ evidenceAdapters: [], policyExtensions: [] }),
    })

    const result = await runDevViewCli(
      [
        ...compatibilityArgs(),
        '--runtime-evidence-satisfaction-readiness',
        join('generated', 'runtime-readiness.json'),
        '--scope-ci-enforcement-readiness',
        join('generated', 'scope-ci-readiness.json'),
        '--json',
      ],
      { cwd: workspace, pluginRoot },
    )
    const payload = JSON.parse(result.stdout)

    expect(result.exitCode).toBe(ExitCode.Success)
    expect(payload.evidenceAdapterCompatibility.compatibilityStatus).toBe('missing-required-mapping')
    expect(payload.policyExtensionCompatibility.compatibilityStatus).toBe('missing-required-mapping')
    expect(payload.status).toBe('devview-extension-adapter-compatibility-validated')
    expectSafetyFalse(payload)
  })

  it('blocks wrong catalog or context plan role/status before writing outputs', async () => {
    const cases = [
      {
        file: join('generated', 'catalog.json'),
        replacement: {
          artifactRole: 'devview-extension-context-plan',
          status: 'devview-extension-context-plan-generated',
        },
        expected: 'CATALOG_ROLE_STATUS_INVALID',
      },
      {
        file: join('generated', 'context-plan.json'),
        replacement: {
          artifactRole: 'devview-extension-profile-catalog',
          status: 'devview-extension-profile-catalog-compiled',
        },
        expected: 'CONTEXT_PLAN_ROLE_STATUS_INVALID',
      },
    ]

    for (const entry of cases) {
      const workspace = createWorkspace()
      writeCompatibilitySources(workspace)
      writeJson(join(workspace, entry.file), entry.replacement)

      const result = await runDevViewCli([...compatibilityArgs(), '--json'], { cwd: workspace, pluginRoot })
      const payload = JSON.parse(result.stderr)

      expect(result.exitCode).toBe(ExitCode.ValidationFailed)
      expect(payload.issues.map((issue: { code: string }) => issue.code).join(',')).toContain(entry.expected)
      expect(existsSync(join(workspace, '.tmp', 'adapter-compatibility.json'))).toBe(false)
    }
  })

  it('blocks catalog and context plan source chain mismatch before writing outputs', async () => {
    const workspace = createWorkspace()
    writeCompatibilitySources(workspace, {
      contextPlan: extensionContextPlan({ catalogSource: 'generated/other-catalog.json' }),
    })

    const result = await runDevViewCli([...compatibilityArgs(), '--json'], { cwd: workspace, pluginRoot })
    const payload = JSON.parse(result.stderr)

    expect(result.exitCode).toBe(ExitCode.ValidationFailed)
    expect(payload.adapterCompatibilityStatus).toBe('blocked-source-chain-mismatch')
    expect(payload.findings.map((entry: { code: string }) => entry.code)).toContain(
      'EXTENSION_ADAPTER_COMPATIBILITY_CONTEXT_PLAN_CATALOG_SOURCE_MISMATCH',
    )
    expect(existsSync(join(workspace, '.tmp', 'adapter-compatibility.json'))).toBe(false)
  })

  it('blocks unsafe execution/provider/network/shell authority flags before writing outputs', async () => {
    const workspace = createWorkspace()
    const unsafeContext = extensionContextPlan()
    unsafeContext.extensionExecutionAllowed = true
    unsafeContext.providerInvoked = true
    unsafeContext.networkCallMade = true
    unsafeContext.shellCommandsExecuted = true
    unsafeContext.traversalAuthorityGranted = true
    ;(unsafeContext.evidencePolicyHintPlan as Record<string, unknown>).canSatisfyEvidence = true
    writeCompatibilitySources(workspace, { contextPlan: unsafeContext })

    const result = await runDevViewCli([...compatibilityArgs(), '--json'], { cwd: workspace, pluginRoot })
    const payload = JSON.parse(result.stderr)

    expect(result.exitCode).toBe(ExitCode.ValidationFailed)
    expect(payload.adapterCompatibilityStatus).toBe('blocked-unsafe-authority-flag')
    expect(payload.findings.map((entry: { code: string }) => entry.code)).toContain(
      'EXTENSION_ADAPTER_COMPATIBILITY_UNSAFE_AUTHORITY_FLAG',
    )
    expect(existsSync(join(workspace, '.tmp', 'adapter-compatibility.json'))).toBe(false)
  })

  it('blocks optional readiness inputs with unsafe authority flags before writing outputs', async () => {
    const workspace = createWorkspace()
    writeCompatibilitySources(workspace)
    writeJson(join(workspace, 'generated/runtime-readiness.json'), {
      ...runtimeReadiness(),
      runtimeEvidenceSatisfied: true,
    })

    const result = await runDevViewCli(
      [
        ...compatibilityArgs(),
        '--runtime-evidence-satisfaction-readiness',
        join('generated', 'runtime-readiness.json'),
        '--json',
      ],
      { cwd: workspace, pluginRoot },
    )
    const payload = JSON.parse(result.stderr)

    expect(result.exitCode).toBe(ExitCode.ValidationFailed)
    expect(payload.adapterCompatibilityStatus).toBe('blocked-unsafe-authority-flag')
    expect(existsSync(join(workspace, '.tmp', 'adapter-compatibility.json'))).toBe(false)
  })

  it('blocks source overwrite, protected outputs, and output collisions with zero writes', async () => {
    const cases = [
      {
        output: join('generated', 'catalog.json'),
        expected: 'would overwrite a source input',
      },
      {
        output: join('.devview', 'generated', 'adapter-compatibility.json'),
        expected: 'inside a protected control path',
      },
      {
        output: join('.tmp', 'adapter-compatibility.json'),
        markdown: join('.tmp', 'adapter-compatibility.json'),
        expected: 'must be different',
      },
    ]

    for (const entry of cases) {
      const workspace = createWorkspace()
      writeCompatibilitySources(workspace)
      const result = await runDevViewCli(
        [...compatibilityArgs(entry.output), ...(entry.markdown ? ['--markdown', entry.markdown] : []), '--json'],
        { cwd: workspace, pluginRoot },
      )

      expect(result.exitCode).toBe(ExitCode.ValidationFailed)
      expect(result.stderr).toContain(entry.expected)
    }
  })
})

function compatibilityArgs(output = join('.tmp', 'adapter-compatibility.json')): string[] {
  return [
    'extensions',
    'validate-adapters',
    '--extension-profile-catalog',
    join('generated', 'catalog.json'),
    '--extension-context-plan',
    join('generated', 'context-plan.json'),
    '--output',
    output,
  ]
}

function writeCompatibilitySources(
  workspace: string,
  overrides: {
    catalog?: Record<string, unknown>
    contextPlan?: Record<string, unknown>
  } = {},
): void {
  writeJson(join(workspace, 'generated', 'catalog.json'), overrides.catalog ?? extensionProfileCatalog())
  writeJson(join(workspace, 'generated', 'context-plan.json'), overrides.contextPlan ?? extensionContextPlan())
  writeJson(join(workspace, 'generated', 'runtime-readiness.json'), runtimeReadiness())
  writeJson(join(workspace, 'generated', 'equivalence-readiness.json'), equivalenceReadiness())
  writeJson(join(workspace, 'generated', 'scope-ci-readiness.json'), scopeCiReadiness())
}

function extensionProfileCatalog(
  options: {
    evidenceAdapters?: string[]
    policyExtensions?: string[]
  } = {},
): Record<string, unknown> {
  const evidenceAdapters = options.evidenceAdapters ?? ['todo-evidence-adapter']
  const policyExtensions = options.policyExtensions ?? ['todo-policy-extension']
  return {
    artifactRole: 'devview-extension-profile-catalog',
    status: 'devview-extension-profile-catalog-compiled',
    extensionCatalogStatus: 'compiled-declarative-capabilities-only',
    catalogEntryCount: evidenceAdapters.length + policyExtensions.length + 1,
    extensionCatalogEntries: [
      ...evidenceAdapters.map((extensionId) => ({
        extensionId,
        extensionKind: 'evidence-adapter',
        capabilities: ['evidence-adapter'],
        lifecycleConnections: { evidence: true, policy: false, graphIngestion: false },
      })),
      ...policyExtensions.map((extensionId) => ({
        extensionId,
        extensionKind: 'policy',
        capabilities: ['policy-extension'],
        lifecycleConnections: { evidence: false, policy: true, graphIngestion: false },
      })),
      {
        extensionId: 'todo-graphify-protocol',
        extensionKind: 'analyzer',
        capabilities: ['analyzer-extension', 'graphify-protocol'],
        lifecycleConnections: { evidence: false, policy: false, graphIngestion: true },
      },
    ],
    capabilityCatalog: {
      analyzerExtensions: ['todo-graphify-protocol'],
      viewTreeExtractorExtensions: ['todo-view-tree'],
      contextPackExtensions: ['todo-view-tree'],
      evidenceAdapters,
      policyExtensions,
      skillWorkflowExtensions: [],
      graphIngestionCandidates: ['todo-graphify-protocol'],
    },
    graphIngestionCandidates: [
      {
        extensionId: 'todo-graphify-protocol',
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
  }
}

function extensionContextPlan(
  options: {
    evidenceAdapters?: string[]
    policyExtensions?: string[]
    catalogSource?: string
  } = {},
): Record<string, unknown> {
  const evidenceAdapters = options.evidenceAdapters ?? ['todo-evidence-adapter']
  const policyExtensions = options.policyExtensions ?? ['todo-policy-extension']
  return {
    artifactRole: 'devview-extension-context-plan',
    status: 'devview-extension-context-plan-generated',
    planningScope: 'extension-context-planning-report-only',
    extensionContextPlanStatus: 'generated-report-only-hints',
    sourceExtensionProfileCatalog: options.catalogSource ?? 'generated/catalog.json',
    viewTreeHintPlan: {
      applicableViewTreeExtractorExtensions: ['todo-view-tree'],
      analyzerExtensions: ['todo-graphify-protocol'],
      graphIngestionCandidates: ['todo-graphify-protocol'],
      canInformViewTree: true,
      alignmentStatus: 'view-tree-extension-hints-available-for-source-view-tree',
    },
    contextPackHintPlan: {
      contextPackExtensions: ['todo-view-tree'],
      analyzerExtensions: ['todo-graphify-protocol'],
      canInformContextPack: true,
      alignmentStatus: 'context-pack-extension-hints-available-for-source-context-pack',
    },
    evidencePolicyHintPlan: {
      evidenceAdapters,
      policyExtensions,
      canInformEvidenceAdapterValidation: true,
      canInformPolicyValidation: true,
      canSatisfyEvidence: false,
      canProveEquivalence: false,
      canEnforceScope: false,
    },
    graphIngestionPlanning: {
      candidates: [{ extensionId: 'todo-graphify-protocol', graphProviderKind: 'graphify' }],
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
    downstreamActionPlan: [{ actionId: 'connect-evidence-adapter-validation' }],
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
    viewTreeMutated: false,
    contextPackMutated: false,
  }
}

function runtimeReadiness(): Record<string, unknown> {
  return {
    artifactRole: 'devview-runtime-evidence-satisfaction-readiness-preview',
    status: 'devview-runtime-evidence-satisfaction-readiness-blocked',
    requiredEvidenceId: 'required-evidence-1',
    runtimeEvidenceSatisfied: false,
    evidenceAccepted: false,
    equivalenceProven: false,
    scopeEnforced: false,
    ciEnforcementEnabled: false,
    graphSourceMutated: false,
    graphDeltaApplied: false,
  }
}

function equivalenceReadiness(): Record<string, unknown> {
  return {
    artifactRole: 'devview-equivalence-proof-readiness-preview',
    status: 'devview-equivalence-proof-readiness-blocked',
    equivalenceProofReadinessId: 'equivalence-readiness-1',
    runtimeEvidenceSatisfied: false,
    evidenceAccepted: false,
    equivalenceProven: false,
    scopeEnforced: false,
    ciEnforcementEnabled: false,
    graphSourceMutated: false,
    graphDeltaApplied: false,
  }
}

function scopeCiReadiness(): Record<string, unknown> {
  return {
    artifactRole: 'devview-scope-ci-enforcement-readiness-preview',
    status: 'devview-scope-ci-enforcement-readiness-blocked',
    scopePolicyId: 'scope-policy-1',
    runtimeEvidenceSatisfied: false,
    evidenceAccepted: false,
    equivalenceProven: false,
    scopeEnforced: false,
    ciEnforcementEnabled: false,
    graphSourceMutated: false,
    graphDeltaApplied: false,
  }
}

function expectSafetyFalse(payload: Record<string, unknown>): void {
  for (const field of [
    'extensionExecutionAllowed',
    'extensionsExecuted',
    'adapterExecuted',
    'policyEnforced',
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
    'traversalAuthorityGranted',
    'contextPackMutated',
    'viewTreeMutated',
  ]) {
    expect(payload[field], field).toBe(false)
  }
}
