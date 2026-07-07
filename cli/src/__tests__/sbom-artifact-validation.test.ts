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

describe('security validate-sbom-artifact CLI', () => {
  it('validates a minimal wrapped SBOM source fact without generating or attesting an SBOM', async () => {
    const workspace = createWorkspace()
    writeJson(join(workspace, '.tmp/sbom-artifact.json'), sbomArtifact())

    const result = await runSbomValidation(workspace, ['--sbom', '.tmp/sbom-artifact.json'], '.tmp/sbom-report.json', [
      '--markdown',
      '.tmp/sbom-report.md',
    ])
    const payload = JSON.parse(result.stdout)
    const written = JSON.parse(readFileSync(join(workspace, '.tmp/sbom-report.json'), 'utf8'))

    expect(result.exitCode).toBe(ExitCode.Success)
    expect(payload.artifactRole).toBe('devview-sbom-validation-report')
    expect(payload.status).toBe('devview-sbom-validation-passed')
    expect(payload.validationScope).toBe('sbom-artifact-validation-report-only')
    expect(payload.sbomValidationStatus).toBe('validated-structural-source-fact-only')
    expect(payload.sourceSbomArtifact).toEqual(
      expect.objectContaining({
        path: '.tmp/sbom-artifact.json',
        artifactRole: 'devview-sbom-artifact',
        status: 'devview-sbom-artifact-supplied',
        sbomScope: 'package-sbom-source-fact-only',
        sbomFormat: 'devview-minimal-sbom-v1',
        packageName: 'devview',
        packageVersion: '0.2.0-alpha',
        componentCount: 2,
        externalReferenceCount: 1,
      }),
    )
    expect(payload.packageJsonSummary).toEqual(
      expect.objectContaining({
        supplied: true,
        packageName: 'devview',
        packageVersion: '0.2.0-alpha',
        packageFilesAllowlistPresent: true,
      }),
    )
    expect(payload.sbomStructuralValidation).toEqual(
      expect.objectContaining({
        formatRecognized: true,
        requiredFieldsPresent: true,
        componentListPresent: true,
        duplicateComponentIds: [],
        unsupportedInstructionFieldCount: 0,
      }),
    )
    expect(payload.packageIdentityAlignment.alignmentStatus).toBe('matched')
    expect(payload.componentCoverageSummary.packageRootComponentPresent).toBe(true)
    expect(payload.digestSummary.sbomSha256).toMatch(/^[a-f0-9]{64}$/)
    expect(payload.digestSummary.sbomByteLength).toBeGreaterThan(0)
    expect(
      payload.digestSummary.sourceArtifactDigests.map((entry: { sourceKind: string }) => entry.sourceKind),
    ).toEqual(['sbom', 'package-json'])
    expect(written.writtenMarkdownPath).toBe('.tmp/sbom-report.md')
    expect(existsSync(join(workspace, '.tmp/sbom-report.md'))).toBe(true)
    expectSafetyFalse(payload)
  })

  it('summarizes release provenance readiness and release-surface validation sources', async () => {
    const workspace = createWorkspace()
    writeJson(join(workspace, '.tmp/sbom-artifact.json'), sbomArtifact())
    writeJson(join(workspace, '.tmp/release-provenance-readiness.json'), releaseProvenanceReadinessReport())
    writeJson(join(workspace, '.tmp/release-surface.json'), releaseSurfaceValidationReport())

    const result = await runSbomValidation(
      workspace,
      [
        '--sbom',
        '.tmp/sbom-artifact.json',
        '--release-provenance-readiness',
        '.tmp/release-provenance-readiness.json',
        '--release-surface-validation',
        '.tmp/release-surface.json',
      ],
      '.tmp/sbom-report.json',
    )
    const payload = JSON.parse(result.stdout)

    expect(result.exitCode).toBe(ExitCode.Success)
    expect(payload.sourceReleaseProvenanceReadiness).toEqual(
      expect.objectContaining({
        supplied: true,
        path: '.tmp/release-provenance-readiness.json',
        artifactRole: 'devview-release-provenance-readiness-report',
        status: 'devview-release-provenance-readiness-reported',
        releaseProvenanceReadinessStatus: 'not-ready-sbom-and-signing-missing',
        sbomGenerated: false,
        sbomAttested: false,
      }),
    )
    expect(payload.sourceReleaseSurfaceValidation).toEqual(
      expect.objectContaining({
        supplied: true,
        path: '.tmp/release-surface.json',
        artifactRole: 'devview-release-surface-validation-report',
        status: 'devview-release-surface-validation-passed',
        packageName: 'devview',
        packageVersion: '0.2.0-alpha',
        packageFileCount: 14,
        forbiddenFindingCount: 0,
      }),
    )
    expect(
      payload.digestSummary.sourceArtifactDigests.map((entry: { sourceKind: string }) => entry.sourceKind),
    ).toEqual(['sbom', 'package-json', 'release-provenance-readiness', 'release-surface-validation'])
    expect(payload.validationFindings.map((entry: { code: string }) => entry.code)).toEqual(
      expect.arrayContaining([
        'SBOM_VALIDATION_RELEASE_PROVENANCE_READINESS_LINKED',
        'SBOM_VALIDATION_RELEASE_SURFACE_LINKED',
        'SBOM_VALIDATION_NOT_ATTESTED',
      ]),
    )
    expectSafetyFalse(payload)
  })

  it('blocks invalid SBOM role/status, unsupported format, package mismatch, and bad release-surface source', async () => {
    const workspace = createWorkspace()
    writeJson(join(workspace, '.tmp/wrong-role.json'), { ...sbomArtifact(), status: 'wrong' })
    writeJson(join(workspace, '.tmp/unknown-format.json'), { ...sbomArtifact(), sbomFormat: 'unknown' })
    writeJson(join(workspace, '.tmp/package-mismatch.json'), sbomArtifact())
    writeJson(join(workspace, '.tmp/package.json'), { name: 'other', version: '0.2.0-alpha', files: ['skills/**'] })
    writeJson(join(workspace, '.tmp/release-surface-failed.json'), {
      ...releaseSurfaceValidationReport(),
      status: 'devview-release-surface-validation-failed',
    })
    writeJson(join(workspace, '.tmp/release-surface-sbom.json'), sbomArtifact())

    const cases = [
      {
        args: ['--sbom', '.tmp/wrong-role.json'],
        output: '.tmp/wrong-role-output.json',
        code: 'SBOM_VALIDATION_SBOM_ROLE_STATUS_INVALID',
      },
      {
        args: ['--sbom', '.tmp/unknown-format.json'],
        output: '.tmp/unknown-format-output.json',
        code: 'SBOM_VALIDATION_SBOM_FORMAT_UNSUPPORTED',
      },
      {
        args: ['--sbom', '.tmp/package-mismatch.json', '--package-json', '.tmp/package.json'],
        output: '.tmp/package-mismatch-output.json',
        code: 'SBOM_VALIDATION_PACKAGE_NAME_MISMATCH',
      },
      {
        args: [
          '--sbom',
          '.tmp/release-surface-sbom.json',
          '--release-surface-validation',
          '.tmp/release-surface-failed.json',
        ],
        output: '.tmp/release-surface-output.json',
        code: 'SBOM_VALIDATION_RELEASE_SURFACE_SOURCE_ROLE_STATUS_INVALID',
      },
    ]

    for (const entry of cases) {
      const result = await runSbomValidation(workspace, entry.args, entry.output)
      expect(result.exitCode).toBe(ExitCode.ValidationFailed)
      expect(JSON.parse(result.stderr).issues.map((issue: { code: string }) => issue.code)).toContain(entry.code)
      expect(existsSync(join(workspace, entry.output))).toBe(false)
    }
  })

  it('blocks unsafe release provenance source claims with zero writes', async () => {
    const workspace = createWorkspace()
    writeJson(join(workspace, '.tmp/sbom-artifact.json'), sbomArtifact())
    writeJson(join(workspace, '.tmp/release-provenance-readiness.json'), {
      ...releaseProvenanceReadinessReport(),
      sbomReadiness: {
        sbomGenerated: true,
        sbomAttested: false,
      },
    })

    const result = await runSbomValidation(
      workspace,
      ['--sbom', '.tmp/sbom-artifact.json', '--release-provenance-readiness', '.tmp/release-provenance-readiness.json'],
      '.tmp/sbom-report.json',
    )

    expect(result.exitCode).toBe(ExitCode.ValidationFailed)
    expect(JSON.parse(result.stderr).issues.map((issue: { code: string }) => issue.code)).toContain(
      'SBOM_VALIDATION_AUTHORITY_CLAIM_UNSUPPORTED',
    )
    expect(existsSync(join(workspace, '.tmp/sbom-report.json'))).toBe(false)
  })

  it('blocks SBOM authority and executable/provider/network instruction claims with zero writes', async () => {
    const workspace = createWorkspace()
    writeJson(join(workspace, '.tmp/generated.json'), { ...sbomArtifact(), sbomGeneratedByDevView: true })
    writeJson(join(workspace, '.tmp/signed.json'), { ...sbomArtifact(), packageSigned: true })
    writeJson(join(workspace, '.tmp/crypto.json'), { ...sbomArtifact(), cryptographicSignatureVerified: true })
    writeJson(join(workspace, '.tmp/provider.json'), { ...sbomArtifact(), providerInvoked: true })
    writeJson(join(workspace, '.tmp/execution.json'), {
      ...sbomArtifact(),
      metadata: { command: 'generate-sbom' },
    })

    const cases = [
      {
        sbom: '.tmp/generated.json',
        output: '.tmp/generated-output.json',
        code: 'SBOM_VALIDATION_AUTHORITY_CLAIM_UNSUPPORTED',
      },
      {
        sbom: '.tmp/signed.json',
        output: '.tmp/signed-output.json',
        code: 'SBOM_VALIDATION_AUTHORITY_CLAIM_UNSUPPORTED',
      },
      {
        sbom: '.tmp/crypto.json',
        output: '.tmp/crypto-output.json',
        code: 'SBOM_VALIDATION_AUTHORITY_CLAIM_UNSUPPORTED',
      },
      {
        sbom: '.tmp/provider.json',
        output: '.tmp/provider-output.json',
        code: 'SBOM_VALIDATION_UNSAFE_SOURCE_AUTHORITY_FLAG',
      },
      {
        sbom: '.tmp/execution.json',
        output: '.tmp/execution-output.json',
        code: 'SBOM_VALIDATION_EXECUTION_INSTRUCTION_UNSUPPORTED',
      },
    ]

    for (const entry of cases) {
      const result = await runSbomValidation(workspace, ['--sbom', entry.sbom], entry.output)
      expect(result.exitCode).toBe(ExitCode.ValidationFailed)
      expect(JSON.parse(result.stderr).issues.map((issue: { code: string }) => issue.code)).toContain(entry.code)
      expect(existsSync(join(workspace, entry.output))).toBe(false)
    }
  })

  it('blocks output collisions, source overwrites, package.json overwrite, and protected paths', async () => {
    const workspace = createWorkspace()
    writeJson(join(workspace, '.tmp/sbom-artifact.json'), sbomArtifact())
    writeJson(join(workspace, '.tmp/package.json'), { name: 'devview', version: '0.2.0-alpha', files: ['skills/**'] })

    const cases = [
      {
        args: ['--sbom', '.tmp/sbom-artifact.json'],
        output: '.tmp/sbom-artifact.json',
        expected: 'would overwrite a source input',
      },
      {
        args: ['--sbom', '.tmp/sbom-artifact.json', '--package-json', '.tmp/package.json'],
        output: '.tmp/package.json',
        expected: 'would overwrite a source input',
      },
      {
        args: ['--sbom', '.tmp/sbom-artifact.json'],
        output: '.tmp/sbom-report.json',
        markdown: '.tmp/sbom-report.json',
        expected: 'must be different',
      },
      {
        args: ['--sbom', '.tmp/sbom-artifact.json'],
        output: join('.devview', 'generated', 'sbom-report.json'),
        expected: 'inside a protected control path',
      },
    ]

    for (const entry of cases) {
      const result = await runSbomValidation(
        workspace,
        entry.args,
        entry.output,
        entry.markdown ? ['--markdown', entry.markdown] : [],
      )
      expect(result.exitCode).toBe(ExitCode.ValidationFailed)
      expect(result.stderr).toContain(entry.expected)
    }
  })

  it('emits deterministic report content across repeated runs to the same path', async () => {
    const workspace = createWorkspace()
    writeJson(join(workspace, '.tmp/sbom-artifact.json'), sbomArtifact())

    const first = await runSbomValidation(workspace, ['--sbom', '.tmp/sbom-artifact.json'], '.tmp/sbom-report.json')
    const firstContent = readFileSync(join(workspace, '.tmp/sbom-report.json'), 'utf8')
    const second = await runSbomValidation(workspace, ['--sbom', '.tmp/sbom-artifact.json'], '.tmp/sbom-report.json')
    const secondContent = readFileSync(join(workspace, '.tmp/sbom-report.json'), 'utf8')

    expect(first.exitCode).toBe(ExitCode.Success)
    expect(second.exitCode).toBe(ExitCode.Success)
    expect(secondContent).toBe(firstContent)
  })
})

function runSbomValidation(workspace: string, args: string[], output: string, extraArgs: string[] = []) {
  return runDevViewCli(['security', 'validate-sbom-artifact', ...args, '--output', output, ...extraArgs, '--json'], {
    cwd: workspace,
    pluginRoot,
  })
}

function sbomArtifact(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    schemaVersion: 1,
    artifactRole: 'devview-sbom-artifact',
    status: 'devview-sbom-artifact-supplied',
    sbomScope: 'package-sbom-source-fact-only',
    sourceFactsOnly: true,
    reportOnly: true,
    sbomFormat: 'devview-minimal-sbom-v1',
    document: {
      name: 'DevView minimal SBOM',
      version: '1',
    },
    packageIdentity: {
      name: 'devview',
      version: '0.2.0-alpha',
      packageDigest: 'sha256:package-digest-placeholder',
    },
    components: [
      {
        componentId: 'pkg:devview',
        name: 'devview',
        version: '0.2.0-alpha',
        type: 'application',
        root: true,
        fileReferences: ['package.json'],
        externalReferences: [{ type: 'purl', locator: 'pkg:npm/devview@0.2.0-alpha' }],
      },
      {
        componentId: 'pkg:npm/typescript',
        name: 'typescript',
        version: '5.7.2',
        type: 'library',
      },
    ],
    sbomGeneratedByDevView: false,
    sbomGenerated: false,
    sbomAttested: false,
    packageSigned: false,
    provenanceAttested: false,
    providerInvoked: false,
    networkCallMade: false,
    shellCommandsExecuted: false,
    extensionExecutionAllowed: false,
    extensionsExecuted: false,
    rbacEnforced: false,
    permissionVerified: false,
    cryptographicSignatureVerified: false,
    keyGenerated: false,
    privateKeyStored: false,
    ciEnforcementEnabled: false,
    hooksActivated: false,
    approvalAutomationEnabled: false,
    userAcceptanceAutomated: false,
    ...overrides,
  }
}

function releaseProvenanceReadinessReport(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    artifactRole: 'devview-release-provenance-readiness-report',
    status: 'devview-release-provenance-readiness-reported',
    releaseProvenanceReadinessStatus: 'not-ready-sbom-and-signing-missing',
    sbomReadiness: {
      sbomGenerated: false,
      sbomAttested: false,
    },
    providerInvoked: false,
    networkCallMade: false,
    shellCommandsExecuted: false,
    graphSourceMutated: false,
    graphDeltaApplied: false,
    cryptographicSignatureVerified: false,
    keyGenerated: false,
    privateKeyStored: false,
    rbacEnforced: false,
    permissionVerified: false,
    ...overrides,
  }
}

function releaseSurfaceValidationReport(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    artifactRole: 'devview-release-surface-validation-report',
    status: 'devview-release-surface-validation-passed',
    packageName: 'devview',
    packageVersion: '0.2.0-alpha',
    dryRun: true,
    packageFileCount: 14,
    packageFiles: ['package.json', 'skills/devview-start/SKILL.md'],
    forbiddenFindingCount: 0,
    forbiddenFindings: [],
    filesMutated: false,
    graphSourceMutated: false,
    runtimeEvidenceSatisfied: false,
    evidenceAccepted: false,
    equivalenceProven: false,
    scopeEnforced: false,
    ciEnforcementEnabled: false,
    providerInvoked: false,
    networkCallMade: false,
    ...overrides,
  }
}

function expectSafetyFalse(payload: Record<string, unknown>) {
  expect(payload.sbomGeneratedByDevView).toBe(false)
  expect(payload.sbomGenerated).toBe(false)
  expect(payload.sbomAttested).toBe(false)
  expect(payload.packageSigned).toBe(false)
  expect(payload.packageSigningPresent).toBe(false)
  expect(payload.packageSignaturePresent).toBe(false)
  expect(payload.packageSignatureVerified).toBe(false)
  expect(payload.provenanceAttestationPresent).toBe(false)
  expect(payload.provenanceAttested).toBe(false)
  expect(payload.cryptographicSignaturePresent).toBe(false)
  expect(payload.cryptographicSignatureVerified).toBe(false)
  expect(payload.keyGenerated).toBe(false)
  expect(payload.privateKeyStored).toBe(false)
  expect(payload.rbacEnforced).toBe(false)
  expect(payload.permissionVerified).toBe(false)
  expect(payload.enterpriseGateActivated).toBe(false)
  expect(payload.providerInvoked).toBe(false)
  expect(payload.networkCallMade).toBe(false)
  expect(payload.apiCallMade).toBe(false)
  expect(payload.shellCommandsExecuted).toBe(false)
  expect(payload.extensionExecutionAllowed).toBe(false)
  expect(payload.extensionsExecuted).toBe(false)
  expect(payload.filesMutated).toBe(false)
  expect(payload.graphSourceMutated).toBe(false)
  expect(payload.graphDeltaApplied).toBe(false)
  expect(payload.runtimeEvidenceSatisfied).toBe(false)
  expect(payload.evidenceAccepted).toBe(false)
  expect(payload.equivalenceProven).toBe(false)
  expect(payload.scopeEnforced).toBe(false)
  expect(payload.ciEnforcementEnabled).toBe(false)
  expect(payload.hooksActivated).toBe(false)
  expect(payload.approvalAutomationEnabled).toBe(false)
  expect(payload.userAcceptanceAutomated).toBe(false)
}
