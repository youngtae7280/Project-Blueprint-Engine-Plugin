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

describe('Extension profile catalog', () => {
  it('compiles ready Project Profile and Extension Manifests into a report-only catalog', async () => {
    const workspace = createWorkspace()
    writeProjectProfile(workspace, { devviewMode: 'retrofit', stack: ['typescript', 'legacy-adapter'] })
    writeJson(join(workspace, '.devview', 'extensions', 'view-tree.manifest.json'), viewTreeManifest())
    writeJson(join(workspace, '.devview', 'extensions', 'evidence.manifest.json'), evidenceManifest())
    writeJson(join(workspace, 'generated', 'extension-readiness.json'), readyReadiness())

    const result = await runDevViewCli([...compileArgs(), '--markdown', join('.tmp', 'catalog.md'), '--json'], {
      cwd: workspace,
      pluginRoot,
    })
    const payload = JSON.parse(result.stdout)
    const written = JSON.parse(readFileSync(join(workspace, '.tmp', 'catalog.json'), 'utf8'))

    expect(result.exitCode).toBe(ExitCode.Success)
    expect(payload.artifactRole).toBe('devview-extension-profile-catalog')
    expect(payload.status).toBe('devview-extension-profile-catalog-compiled')
    expect(payload.extensionCatalogStatus).toBe('compiled-declarative-capabilities-only')
    expect(payload.catalogScope).toBe('project-specific-extension-catalog-report-only')
    expect(payload.capabilityCatalog.viewTreeExtractorExtensions).toEqual(['fixture-view-tree-extractor'])
    expect(payload.capabilityCatalog.contextPackExtensions).toEqual(['fixture-view-tree-extractor'])
    expect(payload.capabilityCatalog.evidenceAdapters).toEqual(['fixture-runtime-evidence-adapter'])
    expect(payload.capabilityCatalog.policyExtensions).toEqual(['fixture-runtime-evidence-adapter'])
    expect(payload.downstreamCompatibility).toEqual(
      expect.objectContaining({
        canInformViewTree: true,
        canInformContextPack: true,
        canInformEvidenceAdapterValidation: true,
        canInformPolicyValidation: true,
        canExecuteExtensionCode: false,
        canSatisfyEvidence: false,
        canProveEquivalence: false,
        canEnforceScope: false,
      }),
    )
    expect(payload.nativeRetrofitProfileHints).toEqual(
      expect.objectContaining({
        mode: 'retrofit',
        hintStatus: 'profile-mode-declared',
      }),
    )
    expect(payload.extensionCatalogEntries[0]).toEqual(
      expect.objectContaining({
        executionModel: 'declarative-manifest-only',
        executionAllowed: false,
        providerInvoked: false,
        networkCallMade: false,
        shellCommandsExecuted: false,
        authorityStatus: 'source-fact-only-not-traversal-authority',
      }),
    )
    expectSafetyFalse(payload)
    expect(written.writtenOutputPath).toBe('.tmp/catalog.json')
    expect(existsSync(join(workspace, '.tmp', 'catalog.md'))).toBe(true)
  })

  it('classifies Graphify-like manifests as protocol-only graph ingestion candidates', async () => {
    const workspace = createWorkspace()
    writeProjectProfile(workspace)
    writeJson(join(workspace, '.devview', 'extensions', 'graphify.manifest.json'), {
      ...analyzerManifest(),
      extensionId: 'fixture-graphify-protocol',
      displayName: 'Fixture Graphify Protocol',
      capabilities: ['analyzer-extension', 'graphify-protocol'],
      externalGraphProvider: 'graphify',
    })
    writeJson(join(workspace, 'generated', 'extension-readiness.json'), readyReadiness())

    const result = await runDevViewCli([...compileArgs(), '--json'], { cwd: workspace, pluginRoot })
    const payload = JSON.parse(result.stdout)

    expect(result.exitCode).toBe(ExitCode.Success)
    expect(payload.capabilityCatalog.graphIngestionCandidates).toEqual(['fixture-graphify-protocol'])
    expect(payload.graphIngestionCandidates).toEqual([
      expect.objectContaining({
        extensionId: 'fixture-graphify-protocol',
        graphProviderKind: 'graphify',
        protocolStatus: 'protocol-only-not-executed',
        executionAllowed: false,
        providerInvoked: false,
        networkCallMade: false,
        shellCommandsExecuted: false,
      }),
    ])
    expect(payload.downstreamCompatibility.canInformGraphIngestionPlanning).toBe(true)
    expectSafetyFalse(payload)
  })

  it('reports unknown native/retrofit hints when the Project Profile has no mode fields', async () => {
    const workspace = createWorkspace()
    writeProjectProfile(workspace, { domain: 'todo-application', stack: ['typescript'] })
    writeJson(join(workspace, '.devview', 'extensions', 'view-tree.manifest.json'), viewTreeManifest())
    writeJson(join(workspace, 'generated', 'extension-readiness.json'), readyReadiness())

    const result = await runDevViewCli([...compileArgs(), '--json'], { cwd: workspace, pluginRoot })
    const payload = JSON.parse(result.stdout)

    expect(result.exitCode).toBe(ExitCode.Success)
    expect(payload.nativeRetrofitProfileHints).toEqual(
      expect.objectContaining({
        mode: 'unknown',
        hintStatus: 'profile-mode-unknown',
      }),
    )
  })

  it('blocks wrong readiness role/status before writing outputs', async () => {
    const workspace = createWorkspace()
    writeProjectProfile(workspace)
    writeJson(join(workspace, '.devview', 'extensions', 'view-tree.manifest.json'), viewTreeManifest())
    writeJson(join(workspace, 'generated', 'extension-readiness.json'), {
      ...readyReadiness(),
      artifactRole: 'devview-extension-readiness-preview',
      status: 'devview-extension-readiness-blocked',
    })

    const result = await runDevViewCli([...compileArgs(), '--json'], { cwd: workspace, pluginRoot })
    const payload = JSON.parse(result.stderr)

    expect(result.exitCode).toBe(ExitCode.ValidationFailed)
    expect(payload.status).toBe('devview-extension-profile-catalog-blocked')
    expect(payload.extensionCatalogStatus).toBe('blocked-extension-readiness-not-ready')
    expect(existsSync(join(workspace, '.tmp', 'catalog.json'))).toBe(false)
  })

  it('blocks readiness with unsafe execution/provider/network source facts before writing outputs', async () => {
    const workspace = createWorkspace()
    writeProjectProfile(workspace)
    writeJson(join(workspace, '.devview', 'extensions', 'view-tree.manifest.json'), viewTreeManifest())
    writeJson(join(workspace, 'generated', 'extension-readiness.json'), {
      ...readyReadiness(),
      providerInvoked: true,
      networkCallMade: true,
    })

    const result = await runDevViewCli([...compileArgs(), '--json'], { cwd: workspace, pluginRoot })
    const payload = JSON.parse(result.stderr)

    expect(result.exitCode).toBe(ExitCode.ValidationFailed)
    expect(payload.findings.map((entry: { code: string }) => entry.code)).toContain(
      'EXTENSION_CATALOG_UNSAFE_AUTHORITY_FLAG',
    )
    expect(existsSync(join(workspace, '.tmp', 'catalog.json'))).toBe(false)
  })

  it('blocks executable manifest declarations and unsupported permissions before writing outputs', async () => {
    const workspace = createWorkspace()
    writeProjectProfile(workspace)
    writeJson(join(workspace, '.devview', 'extensions', 'unsafe.manifest.json'), {
      ...viewTreeManifest(),
      requiredPermissions: ['read-view-tree', 'run-shell-command'],
      execution: {
        executionKind: 'local-command',
        command: 'node adapter.js',
      },
    })
    writeJson(join(workspace, 'generated', 'extension-readiness.json'), readyReadiness())

    const result = await runDevViewCli([...compileArgs(), '--json'], { cwd: workspace, pluginRoot })
    const payload = JSON.parse(result.stderr)

    expect(result.exitCode).toBe(ExitCode.ValidationFailed)
    expect(payload.findings.map((entry: { code: string }) => entry.code)).toEqual(
      expect.arrayContaining([
        'EXTENSION_CATALOG_PERMISSION_UNSUPPORTED',
        'EXTENSION_CATALOG_EXECUTION_DECLARATION_UNSUPPORTED',
      ]),
    )
    expect(existsSync(join(workspace, '.tmp', 'catalog.json'))).toBe(false)
  })

  it('blocks output overwrite of profile, manifests, readiness, protected paths, and output collisions', async () => {
    const cases = [
      { output: join('.devview', 'project-profile.json'), expected: 'would overwrite the source Project Profile' },
      {
        output: join('.devview', 'extensions', 'view-tree.manifest.json'),
        expected: 'would overwrite a source Extension Manifest',
      },
      {
        output: join('generated', 'extension-readiness.json'),
        expected: 'would overwrite the source Extension readiness report',
      },
      { output: join('.devview', 'generated', 'catalog.json'), expected: 'inside a protected control path' },
      { output: join('.tmp', 'catalog.json'), markdown: join('.tmp', 'catalog.json'), expected: 'must be different' },
    ]

    for (const entry of cases) {
      const workspace = createWorkspace()
      writeProjectProfile(workspace)
      writeJson(join(workspace, '.devview', 'extensions', 'view-tree.manifest.json'), viewTreeManifest())
      writeJson(join(workspace, 'generated', 'extension-readiness.json'), readyReadiness())
      const result = await runDevViewCli(
        [...compileArgs(entry.output), ...(entry.markdown ? ['--markdown', entry.markdown] : []), '--json'],
        { cwd: workspace, pluginRoot },
      )

      expect(result.exitCode).toBe(ExitCode.ValidationFailed)
      expect(result.stderr).toContain(entry.expected)
    }
  })
})

function compileArgs(output = join('.tmp', 'catalog.json')): string[] {
  return [
    'extensions',
    'compile-profile',
    '--project-profile',
    join('.devview', 'project-profile.json'),
    '--extensions-dir',
    join('.devview', 'extensions'),
    '--extension-readiness',
    join('generated', 'extension-readiness.json'),
    '--output',
    output,
  ]
}

function writeProjectProfile(
  workspace: string,
  overrides: {
    devviewMode?: string
    domain?: string
    stack?: string[]
  } = {},
): void {
  const profile: Record<string, unknown> = {
    schemaVersion: 1,
    artifactRole: 'devview-project-profile',
    status: 'devview-project-profile-configured',
    projectProfileId: 'fixture-profile',
    projectName: 'Fixture Project',
    domain: 'fixture-domain',
    stack: ['typescript'],
    extensionManifestLocations: ['.devview/extensions'],
    extensionPolicy: {
      executionAllowed: false,
      networkAllowed: false,
      providerInvocationAllowed: false,
    },
    runtimeEvidenceSatisfied: false,
    evidenceAccepted: false,
    equivalenceProven: false,
    scopeEnforced: false,
    ciEnforcementEnabled: false,
    graphSourceMutated: false,
    graphDeltaApplied: false,
    ...overrides,
  }
  if (!overrides.devviewMode) {
    delete profile.devviewMode
  }
  writeJson(join(workspace, '.devview', 'project-profile.json'), profile)
}

function readyReadiness(): Record<string, unknown> {
  return {
    schemaVersion: 1,
    artifactRole: 'devview-extension-readiness-report',
    status: 'devview-extension-readiness-ready',
    extensionReadinessStatus: 'ready-extension-manifests-validated',
    readinessScope: 'project-specific-extension-system-foundation-report-only',
    sourceProjectProfile: '.devview/project-profile.json',
    sourceExtensionsDir: '.devview/extensions',
    projectProfilePresent: true,
    projectProfileStatus: 'devview-project-profile-configured',
    projectProfileId: 'fixture-profile',
    projectStack: ['typescript'],
    projectDomain: 'fixture-domain',
    discoveredManifestCount: 1,
    validManifestCount: 1,
    invalidManifestCount: 0,
    manifests: [],
    capabilities: {},
    requiredPermissions: ['read-project-profile', 'write-report-output'],
    findings: [],
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
    approvalAutomationEnabled: false,
    userAcceptanceAutomated: false,
    nonEnforcing: true,
  }
}

function viewTreeManifest(): Record<string, unknown> {
  return {
    schemaVersion: 1,
    artifactRole: 'devview-extension-manifest',
    status: 'devview-extension-manifest-declared',
    extensionId: 'fixture-view-tree-extractor',
    displayName: 'Fixture View Tree Extractor',
    extensionKind: 'view-tree-extractor',
    capabilities: ['view-tree-extractor-extension', 'context-pack-extension'],
    requiredPermissions: [
      'read-project-profile',
      'read-maintainability-graph',
      'read-view-tree',
      'write-report-output',
    ],
    execution: {
      executionKind: 'declarative-manifest-only',
      entrypoint: null,
      command: null,
      script: null,
      module: null,
    },
    runtimeEvidenceSatisfied: false,
    evidenceAccepted: false,
    equivalenceProven: false,
    scopeEnforced: false,
    ciEnforcementEnabled: false,
    graphSourceMutated: false,
    graphDeltaApplied: false,
  }
}

function evidenceManifest(): Record<string, unknown> {
  return {
    ...viewTreeManifest(),
    extensionId: 'fixture-runtime-evidence-adapter',
    displayName: 'Fixture Runtime Evidence Adapter',
    extensionKind: 'evidence-adapter',
    capabilities: ['evidence-adapter', 'policy-extension'],
    requiredPermissions: ['read-project-profile', 'read-evidence', 'read-policy', 'write-report-output'],
  }
}

function analyzerManifest(): Record<string, unknown> {
  return {
    ...viewTreeManifest(),
    extensionId: 'fixture-analyzer',
    displayName: 'Fixture Analyzer',
    extensionKind: 'analyzer',
    capabilities: ['analyzer-extension'],
    requiredPermissions: ['read-project-profile', 'read-maintainability-graph', 'write-report-output'],
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
  ]) {
    expect(payload[field]).toBe(false)
  }
}
