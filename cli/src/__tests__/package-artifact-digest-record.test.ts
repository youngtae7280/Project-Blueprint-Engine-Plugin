import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { runDevViewCli } from '../app'
import { ExitCode } from '../core/types'
import { cleanupWorkspaces, createWorkspace, writeJson } from './fixtures/workspace'

const pluginRoot = resolve(process.cwd())

afterEach(() => {
  cleanupWorkspaces()
})

describe('security record-package-artifact-digest CLI', () => {
  it('hashes a preexisting package artifact and matches expected sha256', async () => {
    const workspace = createWorkspace()
    const artifactPath = writePackageArtifact(workspace, '.tmp/devview-0.2.0-alpha.tgz')
    const expectedSha = sha256File(artifactPath)

    const result = await runPackageArtifactDigest(
      workspace,
      ['--package-artifact', '.tmp/devview-0.2.0-alpha.tgz', '--expected-sha256', expectedSha],
      '.tmp/package-artifact-digest.json',
      ['--markdown', '.tmp/package-artifact-digest.md'],
    )
    const payload = JSON.parse(result.stdout)
    const written = JSON.parse(readFileSync(join(workspace, '.tmp/package-artifact-digest.json'), 'utf8'))

    expect(result.exitCode).toBe(ExitCode.Success)
    expect(payload.artifactRole).toBe('devview-package-artifact-digest-record')
    expect(payload.status).toBe('devview-package-artifact-digest-recorded')
    expect(payload.digestScope).toBe('package-artifact-digest-report-only')
    expect(payload.artifactDigestStatus).toBe('matched-expected')
    expect(payload.sourcePackageArtifact).toEqual(
      expect.objectContaining({
        path: '.tmp/devview-0.2.0-alpha.tgz',
        fileName: 'devview-0.2.0-alpha.tgz',
        sha256: expectedSha,
        byteLength: 31,
        extension: '.tgz',
        typeHint: 'npm-package-tarball',
        expectedSha256: expectedSha,
        expectedSha256Supplied: true,
        expectedSha256Match: true,
      }),
    )
    expect(payload.sourceArtifactDigests.map((entry: { sourceKind: string }) => entry.sourceKind)).toEqual([
      'package-artifact',
    ])
    expect(written.writtenMarkdownPath).toBe('.tmp/package-artifact-digest.md')
    expect(existsSync(join(workspace, '.tmp/package-artifact-digest.md'))).toBe(true)
    expectSafetyFalse(payload)
  })

  it('summarizes package provenance inputs and release surface validation sources', async () => {
    const workspace = createWorkspace()
    const artifactPath = writePackageArtifact(workspace, '.tmp/devview-0.2.0-alpha.tgz')
    writeJson(join(workspace, '.tmp/package-provenance-inputs.json'), packageProvenanceInputsRecord())
    writeJson(join(workspace, '.tmp/release-surface.json'), releaseSurfaceValidationReport())

    const result = await runPackageArtifactDigest(
      workspace,
      [
        '--package-artifact',
        '.tmp/devview-0.2.0-alpha.tgz',
        '--expected-sha256',
        sha256File(artifactPath),
        '--package-provenance-inputs',
        '.tmp/package-provenance-inputs.json',
        '--release-surface-validation',
        '.tmp/release-surface.json',
      ],
      '.tmp/package-artifact-digest.json',
    )
    const payload = JSON.parse(result.stdout)

    expect(result.exitCode).toBe(ExitCode.Success)
    expect(payload.sourcePackageProvenanceInputs).toEqual(
      expect.objectContaining({
        supplied: true,
        artifactRole: 'devview-package-provenance-inputs-record',
        status: 'devview-package-provenance-inputs-recorded',
        packageName: 'devview',
        packageVersion: '0.2.0-alpha',
        sourceArtifactDigestCount: 2,
        sourceRefStatus: 'supplied-explicit-cli-input',
        buildCommandLabelStatus: 'supplied-metadata-only',
        packageDigestStatus: 'not-computed-no-package-artifact-supplied',
        provenanceAttestationStatus: 'not-generated',
      }),
    )
    expect(payload.sourceReleaseSurfaceValidation).toEqual(
      expect.objectContaining({
        supplied: true,
        artifactRole: 'devview-release-surface-validation-report',
        status: 'devview-release-surface-validation-passed',
        packageName: 'devview',
        packageVersion: '0.2.0-alpha',
        packageFileCount: 14,
        forbiddenFindingCount: 0,
      }),
    )
    expect(payload.packageIdentitySummary).toEqual(
      expect.objectContaining({
        packageName: 'devview',
        packageVersion: '0.2.0-alpha',
        packageIdentitySource: 'package-provenance-inputs',
        sourcesAgree: true,
      }),
    )
    expect(payload.sourceArtifactDigests.map((entry: { sourceKind: string }) => entry.sourceKind)).toEqual([
      'package-artifact',
      'package-provenance-inputs',
      'release-surface-validation',
    ])
    expect(payload.packageDigestRecordFindings.map((entry: { code: string }) => entry.code)).toEqual(
      expect.arrayContaining([
        'PACKAGE_ARTIFACT_DIGEST_RECORDED',
        'PACKAGE_ARTIFACT_DIGEST_EXPECTED_SHA256_MATCHED',
        'PACKAGE_ARTIFACT_DIGEST_PROVENANCE_INPUTS_LINKED',
        'PACKAGE_ARTIFACT_DIGEST_RELEASE_SURFACE_LINKED',
      ]),
    )
    expectSafetyFalse(payload)
  })

  it('blocks expected sha256 mismatch with zero writes', async () => {
    const workspace = createWorkspace()
    writePackageArtifact(workspace, '.tmp/devview-0.2.0-alpha.tgz')

    const result = await runPackageArtifactDigest(
      workspace,
      ['--package-artifact', '.tmp/devview-0.2.0-alpha.tgz', '--expected-sha256', 'f'.repeat(64)],
      '.tmp/package-artifact-digest.json',
    )

    expect(result.exitCode).toBe(ExitCode.ValidationFailed)
    expect(JSON.parse(result.stderr).issues.map((issue: { code: string }) => issue.code)).toContain(
      'PACKAGE_ARTIFACT_DIGEST_EXPECTED_SHA256_MISMATCH',
    )
    expect(existsSync(join(workspace, '.tmp/package-artifact-digest.json'))).toBe(false)
  })

  it('blocks wrong source role/status and package identity mismatches with zero writes', async () => {
    const workspace = createWorkspace()
    writePackageArtifact(workspace, '.tmp/devview-0.2.0-alpha.tgz')
    writeJson(join(workspace, '.tmp/wrong-provenance-inputs.json'), {
      ...packageProvenanceInputsRecord(),
      status: 'devview-package-provenance-inputs-blocked',
    })
    writeJson(join(workspace, '.tmp/wrong-release-surface.json'), {
      ...releaseSurfaceValidationReport(),
      status: 'devview-release-surface-validation-failed',
    })
    writeJson(join(workspace, '.tmp/mismatch-release-surface.json'), {
      ...releaseSurfaceValidationReport(),
      packageName: 'other',
    })

    const cases = [
      {
        args: ['--package-provenance-inputs', '.tmp/wrong-provenance-inputs.json'],
        output: '.tmp/wrong-provenance-inputs-output.json',
        code: 'PACKAGE_ARTIFACT_DIGEST_PROVENANCE_INPUTS_ROLE_STATUS_INVALID',
      },
      {
        args: ['--release-surface-validation', '.tmp/wrong-release-surface.json'],
        output: '.tmp/wrong-release-surface-output.json',
        code: 'PACKAGE_ARTIFACT_DIGEST_RELEASE_SURFACE_ROLE_STATUS_INVALID',
      },
      {
        args: [
          '--package-provenance-inputs',
          '.tmp/package-provenance-inputs.json',
          '--release-surface-validation',
          '.tmp/mismatch-release-surface.json',
        ],
        setup: () => writeJson(join(workspace, '.tmp/package-provenance-inputs.json'), packageProvenanceInputsRecord()),
        output: '.tmp/mismatch-release-surface-output.json',
        code: 'PACKAGE_ARTIFACT_DIGEST_PACKAGE_NAME_MISMATCH',
      },
    ]

    for (const entry of cases) {
      entry.setup?.()
      const result = await runPackageArtifactDigest(
        workspace,
        ['--package-artifact', '.tmp/devview-0.2.0-alpha.tgz', ...entry.args],
        entry.output,
      )
      expect(result.exitCode).toBe(ExitCode.ValidationFailed)
      expect(JSON.parse(result.stderr).issues.map((issue: { code: string }) => issue.code)).toContain(entry.code)
      expect(existsSync(join(workspace, entry.output))).toBe(false)
    }
  })

  it('blocks package generation, signing, provenance, SBOM, key, RBAC, provider, and network authority claims', async () => {
    const workspace = createWorkspace()
    writePackageArtifact(workspace, '.tmp/devview-0.2.0-alpha.tgz')
    writeJson(join(workspace, '.tmp/generated-package-inputs.json'), {
      ...packageProvenanceInputsRecord(),
      packageArtifactGeneratedByDevView: true,
    })
    writeJson(join(workspace, '.tmp/signed-package-inputs.json'), {
      ...packageProvenanceInputsRecord(),
      packageSigned: true,
    })
    writeJson(join(workspace, '.tmp/sbom-package-inputs.json'), {
      ...packageProvenanceInputsRecord(),
      sbomGenerated: true,
    })
    writeJson(join(workspace, '.tmp/provenance-package-inputs.json'), {
      ...packageProvenanceInputsRecord(),
      provenanceAttested: true,
    })
    writeJson(join(workspace, '.tmp/key-package-inputs.json'), {
      ...packageProvenanceInputsRecord(),
      keyGenerated: true,
    })
    writeJson(join(workspace, '.tmp/rbac-package-inputs.json'), {
      ...packageProvenanceInputsRecord(),
      rbacEnforced: true,
    })
    writeJson(join(workspace, '.tmp/network-release-surface.json'), {
      ...releaseSurfaceValidationReport(),
      networkCallMade: true,
    })

    const cases = [
      '.tmp/generated-package-inputs.json',
      '.tmp/signed-package-inputs.json',
      '.tmp/sbom-package-inputs.json',
      '.tmp/provenance-package-inputs.json',
      '.tmp/key-package-inputs.json',
      '.tmp/rbac-package-inputs.json',
    ]

    for (const [index, source] of cases.entries()) {
      const result = await runPackageArtifactDigest(
        workspace,
        ['--package-artifact', '.tmp/devview-0.2.0-alpha.tgz', '--package-provenance-inputs', source],
        `.tmp/authority-output-${index}.json`,
      )
      expect(result.exitCode).toBe(ExitCode.ValidationFailed)
      expect(JSON.parse(result.stderr).issues.map((issue: { code: string }) => issue.code)).toContain(
        'PACKAGE_ARTIFACT_DIGEST_AUTHORITY_CLAIM_UNSUPPORTED',
      )
      expect(existsSync(join(workspace, `.tmp/authority-output-${index}.json`))).toBe(false)
    }

    const networkResult = await runPackageArtifactDigest(
      workspace,
      [
        '--package-artifact',
        '.tmp/devview-0.2.0-alpha.tgz',
        '--release-surface-validation',
        '.tmp/network-release-surface.json',
      ],
      '.tmp/network-output.json',
    )
    expect(networkResult.exitCode).toBe(ExitCode.ValidationFailed)
    expect(JSON.parse(networkResult.stderr).issues.map((issue: { code: string }) => issue.code)).toContain(
      'PACKAGE_ARTIFACT_DIGEST_UNSAFE_SOURCE_AUTHORITY_FLAG',
    )
    expect(existsSync(join(workspace, '.tmp/network-output.json'))).toBe(false)
  })

  it('blocks output collisions, artifact overwrite, source overwrite, and protected paths', async () => {
    const workspace = createWorkspace()
    writePackageArtifact(workspace, '.tmp/devview-0.2.0-alpha.tgz')
    writeJson(join(workspace, '.tmp/package-provenance-inputs.json'), packageProvenanceInputsRecord())

    const cases = [
      {
        args: ['--package-artifact', '.tmp/devview-0.2.0-alpha.tgz'],
        output: '.tmp/devview-0.2.0-alpha.tgz',
        expected: 'would overwrite a source input',
      },
      {
        args: [
          '--package-artifact',
          '.tmp/devview-0.2.0-alpha.tgz',
          '--package-provenance-inputs',
          '.tmp/package-provenance-inputs.json',
        ],
        output: '.tmp/package-provenance-inputs.json',
        expected: 'would overwrite a source input',
      },
      {
        args: ['--package-artifact', '.tmp/devview-0.2.0-alpha.tgz'],
        output: '.tmp/package-artifact-digest.json',
        markdown: '.tmp/package-artifact-digest.json',
        expected: 'must be different',
      },
      {
        args: ['--package-artifact', '.tmp/devview-0.2.0-alpha.tgz'],
        output: join('.devview', 'generated', 'package-artifact-digest.json'),
        expected: 'inside a protected control path',
      },
      {
        args: ['--package-artifact', join('.devview', 'package.tgz')],
        output: '.tmp/protected-artifact-output.json',
        expected: 'inside a protected control path',
      },
    ]

    for (const entry of cases) {
      const result = await runPackageArtifactDigest(
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
    writePackageArtifact(workspace, '.tmp/devview-0.2.0-alpha.tgz')

    const first = await runPackageArtifactDigest(
      workspace,
      ['--package-artifact', '.tmp/devview-0.2.0-alpha.tgz'],
      '.tmp/package-artifact-digest.json',
    )
    const firstContent = readFileSync(join(workspace, '.tmp/package-artifact-digest.json'), 'utf8')
    const second = await runPackageArtifactDigest(
      workspace,
      ['--package-artifact', '.tmp/devview-0.2.0-alpha.tgz'],
      '.tmp/package-artifact-digest.json',
    )
    const secondContent = readFileSync(join(workspace, '.tmp/package-artifact-digest.json'), 'utf8')

    expect(first.exitCode).toBe(ExitCode.Success)
    expect(second.exitCode).toBe(ExitCode.Success)
    expect(secondContent).toBe(firstContent)
  })
})

function runPackageArtifactDigest(workspace: string, args: string[], output: string, extraArgs: string[] = []) {
  return runDevViewCli(
    ['security', 'record-package-artifact-digest', ...args, '--output', output, ...extraArgs, '--json'],
    {
      cwd: workspace,
      pluginRoot,
    },
  )
}

function writePackageArtifact(workspace: string, artifactPath: string): string {
  const absolutePath = join(workspace, artifactPath)
  mkdirSync(resolve(absolutePath, '..'), { recursive: true })
  writeFileSync(absolutePath, Buffer.from('static package artifact fixture'))
  return absolutePath
}

function packageProvenanceInputsRecord(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    schemaVersion: 1,
    artifactRole: 'devview-package-provenance-inputs-record',
    status: 'devview-package-provenance-inputs-recorded',
    provenanceInputsScope: 'package-provenance-inputs-report-only',
    sourceFactsOnly: true,
    reportOnly: true,
    packageProvenanceInputsStatus: 'recorded-source-inputs-only',
    packageMetadataSummary: {
      supplied: true,
      path: 'package.json',
      packageName: 'devview',
      packageVersion: '0.2.0-alpha',
      packagePrivate: true,
      packageFilesAllowlistPresent: true,
      packageFilesAllowlistCount: 14,
      packageJsonSha256: '1'.repeat(64),
      packageJsonByteLength: 2227,
    },
    sourceRefSummary: {
      sourceRefStatus: 'supplied-explicit-cli-input',
      value: 'cf9185403a128aebd9fb31c65e84fee39d39c632',
      sourceRefVerified: false,
      verificationMode: 'explicit-input-not-verified',
    },
    buildInputSummary: {
      buildCommandLabelStatus: 'supplied-metadata-only',
      buildCommandLabel: 'npm run build:cli',
      buildCommandExecuted: false,
    },
    sourceArtifactDigests: [
      {
        sourceKind: 'package-json',
        path: 'package.json',
        artifactRole: null,
        status: null,
        sha256: '1'.repeat(64),
        byteLength: 2227,
      },
      {
        sourceKind: 'release-surface-validation',
        path: '.tmp/release-surface.json',
        artifactRole: 'devview-release-surface-validation-report',
        status: 'devview-release-surface-validation-passed',
        sha256: '2'.repeat(64),
        byteLength: 512,
      },
    ],
    releaseSurfaceSourceSummary: {
      supplied: true,
      path: '.tmp/release-surface.json',
      artifactRole: 'devview-release-surface-validation-report',
      status: 'devview-release-surface-validation-passed',
      packageName: 'devview',
      packageVersion: '0.2.0-alpha',
      packageFileCount: 14,
      forbiddenFindingCount: 0,
    },
    packageDigestStatus: 'not-computed-no-package-artifact-supplied',
    packageArtifactSupplied: false,
    packageArtifactSha256: null,
    provenanceAttestationStatus: 'not-generated',
    packageProvenanceFindings: [{ severity: 'gap', code: 'PACKAGE_PROVENANCE_PACKAGE_DIGEST_NOT_COMPUTED' }],
    downstreamActionPlan: ['Capture package artifact digest.'],
    packagePublished: false,
    publishingPerformed: false,
    packageArtifactGeneratedByDevView: false,
    packageArtifactGenerated: false,
    packageTarballGenerated: false,
    packageSigningPresent: false,
    packageSigned: false,
    packageSignaturePresent: false,
    packageSignatureVerified: false,
    sbomGeneratedByDevView: false,
    sbomGenerated: false,
    sbomAttested: false,
    provenanceAttestationPresent: false,
    provenanceAttested: false,
    releaseProvenanceAttested: false,
    npmProvenanceEnabled: false,
    slsaProvenanceGenerated: false,
    cryptographicSigningImplemented: false,
    cryptographicSignaturePresent: false,
    cryptographicSignatureVerified: false,
    keyGenerated: false,
    privateKeyStored: false,
    keyManagementImplemented: false,
    keyRegistryCreated: false,
    trustRootCreated: false,
    rbacEnforced: false,
    permissionVerified: false,
    rbacPermissionVerified: false,
    ...safetyFlags(),
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

function safetyFlags(): Record<string, unknown> {
  return {
    enterpriseGateActivated: false,
    providerInvoked: false,
    networkCallMade: false,
    apiCallMade: false,
    shellCommandsExecuted: false,
    extensionExecutionAllowed: false,
    extensionsExecuted: false,
    benchmarkExecuted: false,
    candidateExecuted: false,
    graphifyExecuted: false,
    nativeBenchmarkExecuted: false,
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

function expectSafetyFalse(payload: Record<string, unknown>): void {
  expect(payload.packageArtifactGeneratedByDevView).toBe(false)
  expect(payload.packageArtifactGenerated).toBe(false)
  expect(payload.packageTarballGenerated).toBe(false)
  expect(payload.packagePublished).toBe(false)
  expect(payload.publishingPerformed).toBe(false)
  expect(payload.packageSigningPresent).toBe(false)
  expect(payload.packageSigned).toBe(false)
  expect(payload.packageSignaturePresent).toBe(false)
  expect(payload.packageSignatureVerified).toBe(false)
  expect(payload.sbomGeneratedByDevView).toBe(false)
  expect(payload.sbomGenerated).toBe(false)
  expect(payload.sbomAttested).toBe(false)
  expect(payload.provenanceAttestationPresent).toBe(false)
  expect(payload.provenanceAttested).toBe(false)
  expect(payload.releaseProvenanceAttested).toBe(false)
  expect(payload.npmProvenanceEnabled).toBe(false)
  expect(payload.slsaProvenanceGenerated).toBe(false)
  expect(payload.cryptographicSigningImplemented).toBe(false)
  expect(payload.cryptographicSignaturePresent).toBe(false)
  expect(payload.cryptographicSignatureVerified).toBe(false)
  expect(payload.keyGenerated).toBe(false)
  expect(payload.privateKeyStored).toBe(false)
  expect(payload.keyManagementImplemented).toBe(false)
  expect(payload.keyRegistryCreated).toBe(false)
  expect(payload.trustRootCreated).toBe(false)
  expect(payload.rbacEnforced).toBe(false)
  expect(payload.permissionVerified).toBe(false)
  expect(payload.rbacPermissionVerified).toBe(false)
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
  expect(payload.branchProtectionChanged).toBe(false)
  expect(payload.branchProtectionMutated).toBe(false)
  expect(payload.requiredChecksConfigured).toBe(false)
  expect(payload.requiredChecksMutated).toBe(false)
  expect(payload.externalCiMutated).toBe(false)
  expect(payload.diffRejectionEnabled).toBe(false)
  expect(payload.diffRejectionActivated).toBe(false)
  expect(payload.approvalAutomationEnabled).toBe(false)
  expect(payload.userAcceptanceAutomated).toBe(false)
  expect(payload.sourceFactsOnly).toBe(true)
  expect(payload.reportOnly).toBe(true)
}

function sha256File(file: string): string {
  return createHash('sha256').update(readFileSync(file)).digest('hex')
}
