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

describe('security report-release-provenance CLI', () => {
  it('reports package metadata and release provenance gaps without sources or release artifact creation', async () => {
    const workspace = createWorkspace()

    const result = await runReleaseProvenance(workspace, [], '.tmp/release-provenance.json', [
      '--markdown',
      '.tmp/release-provenance.md',
    ])
    const payload = JSON.parse(result.stdout)
    const written = JSON.parse(readFileSync(join(workspace, '.tmp/release-provenance.json'), 'utf8'))

    expect(result.exitCode).toBe(ExitCode.Success)
    expect(payload.artifactRole).toBe('devview-release-provenance-readiness-report')
    expect(payload.status).toBe('devview-release-provenance-readiness-reported')
    expect(payload.readinessScope).toBe('release-provenance-sbom-readiness-report-only')
    expect(payload.releaseProvenanceReadinessStatus).toBe('not-ready-sbom-and-signing-missing')
    expect(payload.packageMetadataSummary.packageName).toBe('devview')
    expect(payload.packageMetadataSummary.packageVersion).toBe('0.2.0-alpha')
    expect(payload.packageMetadataSummary.packageFilesAllowlistPresent).toBe(true)
    expect(payload.packageMetadataSummary.packageFilesAllowlistCount).toBeGreaterThan(0)
    expect(payload.packageMetadataSummary.packageFilesAllowlistEntries).toContain('skills/**')
    expect(payload.packageMetadataSummary.releaseSurfaceScriptPresent).toBe(true)
    expect(payload.packageMetadataSummary.releaseSurfaceCheckerPresent).toBe(true)
    expect(payload.releaseSurfaceReadiness.packageDryRunExecuted).toBe(false)
    expect(payload.releaseSurfaceReadiness.packageDryRunReadiness).toBe('not-executed-report-only')
    expect(payload.releaseSurfaceReadiness.publicIdentityScanExecuted).toBe(false)
    expect(payload.sbomReadiness.sbomGenerated).toBe(false)
    expect(payload.packageSigningReadiness.packageSigningPresent).toBe(false)
    expect(payload.provenanceAttestationReadiness.provenanceAttested).toBe(false)
    expect(payload.sourceGovernanceSummary.enterpriseReadiness.supplied).toBe(false)
    expect(payload.sourceGovernanceSummary.signingReadiness.supplied).toBe(false)
    expect(payload.sourceGovernanceSummary.rbacPolicyValidation.supplied).toBe(false)
    expect(payload.releaseProvenanceFindings.map((entry: { code: string }) => entry.code)).toEqual(
      expect.arrayContaining([
        'RELEASE_PROVENANCE_PACKAGE_FILES_ALLOWLIST_PRESENT',
        'RELEASE_PROVENANCE_RELEASE_SURFACE_CHECKER_PRESENT',
        'RELEASE_PROVENANCE_SBOM_MISSING',
        'RELEASE_PROVENANCE_PACKAGE_SIGNING_MISSING',
        'RELEASE_PROVENANCE_ATTESTATION_MISSING',
      ]),
    )
    expect(written.writtenMarkdownPath).toBe('.tmp/release-provenance.md')
    expect(existsSync(join(workspace, '.tmp/release-provenance.md'))).toBe(true)
    expectSafetyFalse(payload)
  })

  it('summarizes enterprise, signing, and RBAC policy validation source facts', async () => {
    const workspace = createWorkspace()
    writeJson(join(workspace, '.tmp/enterprise-readiness.json'), enterpriseReadinessReport())
    writeJson(join(workspace, '.tmp/signing-readiness.json'), signingReadinessReport())
    writeJson(join(workspace, '.tmp/rbac-policy-validation.json'), rbacPolicyValidationReport())

    const result = await runReleaseProvenance(
      workspace,
      [
        '--enterprise-readiness',
        '.tmp/enterprise-readiness.json',
        '--signing-readiness',
        '.tmp/signing-readiness.json',
        '--rbac-policy-validation',
        '.tmp/rbac-policy-validation.json',
      ],
      '.tmp/release-provenance.json',
    )
    const payload = JSON.parse(result.stdout)

    expect(result.exitCode).toBe(ExitCode.Success)
    expect(payload.sourceGovernanceSummary.enterpriseReadiness).toEqual(
      expect.objectContaining({
        supplied: true,
        path: '.tmp/enterprise-readiness.json',
        artifactRole: 'devview-enterprise-readiness-report',
        status: 'devview-enterprise-readiness-report-generated',
        readinessLevel: 'not-ready',
        releaseSurfaceStatus: 'satisfied',
        rbacPolicyValidationReportCount: 1,
      }),
    )
    expect(payload.sourceGovernanceSummary.signingReadiness).toEqual(
      expect.objectContaining({
        supplied: true,
        path: '.tmp/signing-readiness.json',
        artifactRole: 'devview-signing-readiness-report',
        status: 'devview-signing-readiness-reported',
        signingReadinessStatus: 'not-ready-policy-and-key-governance-missing',
        keyGovernanceStatus: 'not-ready',
        signaturePolicyStatus: 'not-ready',
      }),
    )
    expect(payload.sourceGovernanceSummary.rbacPolicyValidation).toEqual(
      expect.objectContaining({
        supplied: true,
        path: '.tmp/rbac-policy-validation.json',
        artifactRole: 'devview-rbac-policy-validation-report',
        status: 'devview-rbac-policy-validation-passed',
        rbacPolicyValidationStatus: 'passed',
        defaultDenyConfigured: true,
        actorCount: 2,
        permissionGrantCount: 2,
      }),
    )
    expect(payload.packageSigningReadiness.signingReadinessSourceStatus).toBe(
      'not-ready-policy-and-key-governance-missing',
    )
    expect(payload.releaseProvenanceFindings.map((entry: { code: string }) => entry.code)).toEqual(
      expect.arrayContaining([
        'RELEASE_PROVENANCE_ENTERPRISE_READINESS_SOURCE_LINKED',
        'RELEASE_PROVENANCE_SIGNING_READINESS_SOURCE_LINKED',
        'RELEASE_PROVENANCE_RBAC_POLICY_VALIDATION_SOURCE_LINKED',
      ]),
    )
    expectSafetyFalse(payload)
  })

  it('blocks wrong role/status sources with zero-write behavior', async () => {
    const workspace = createWorkspace()
    writeJson(join(workspace, '.tmp/wrong-enterprise.json'), { ...enterpriseReadinessReport(), status: 'wrong' })
    writeJson(join(workspace, '.tmp/wrong-signing.json'), { ...signingReadinessReport(), status: 'wrong' })
    writeJson(join(workspace, '.tmp/wrong-rbac-policy.json'), {
      ...rbacPolicyValidationReport(),
      status: 'wrong',
    })

    const enterprise = await runReleaseProvenance(
      workspace,
      ['--enterprise-readiness', '.tmp/wrong-enterprise.json'],
      '.tmp/wrong-enterprise-output.json',
    )
    const signing = await runReleaseProvenance(
      workspace,
      ['--signing-readiness', '.tmp/wrong-signing.json'],
      '.tmp/wrong-signing-output.json',
    )
    const rbac = await runReleaseProvenance(
      workspace,
      ['--rbac-policy-validation', '.tmp/wrong-rbac-policy.json'],
      '.tmp/wrong-rbac-output.json',
    )

    expect(enterprise.exitCode).toBe(ExitCode.ValidationFailed)
    expect(JSON.parse(enterprise.stderr).issues.map((entry: { code: string }) => entry.code)).toContain(
      'RELEASE_PROVENANCE_ENTERPRISE_SOURCE_ROLE_STATUS_INVALID',
    )
    expect(existsSync(join(workspace, '.tmp/wrong-enterprise-output.json'))).toBe(false)

    expect(signing.exitCode).toBe(ExitCode.ValidationFailed)
    expect(JSON.parse(signing.stderr).issues.map((entry: { code: string }) => entry.code)).toContain(
      'RELEASE_PROVENANCE_SIGNING_SOURCE_ROLE_STATUS_INVALID',
    )
    expect(existsSync(join(workspace, '.tmp/wrong-signing-output.json'))).toBe(false)

    expect(rbac.exitCode).toBe(ExitCode.ValidationFailed)
    expect(JSON.parse(rbac.stderr).issues.map((entry: { code: string }) => entry.code)).toContain(
      'RELEASE_PROVENANCE_RBAC_POLICY_SOURCE_ROLE_STATUS_INVALID',
    )
    expect(existsSync(join(workspace, '.tmp/wrong-rbac-output.json'))).toBe(false)
  })

  it('blocks release, signing, key, RBAC, provider, and lifecycle authority claims with zero writes', async () => {
    const workspace = createWorkspace()
    writeJson(join(workspace, '.tmp/sbom-source.json'), { ...enterpriseReadinessReport(), sbomGenerated: true })
    writeJson(join(workspace, '.tmp/provenance-source.json'), {
      ...enterpriseReadinessReport(),
      provenanceAttested: true,
    })
    writeJson(join(workspace, '.tmp/signature-source.json'), {
      ...signingReadinessReport(),
      cryptographicSignatureVerified: true,
    })
    writeJson(join(workspace, '.tmp/key-source.json'), { ...signingReadinessReport(), keyGenerated: true })
    writeJson(join(workspace, '.tmp/rbac-source.json'), { ...rbacPolicyValidationReport(), rbacEnforced: true })
    writeJson(join(workspace, '.tmp/network-source.json'), { ...enterpriseReadinessReport(), networkCallMade: true })

    const cases = [
      {
        args: ['--enterprise-readiness', '.tmp/sbom-source.json'],
        output: '.tmp/sbom-output.json',
        code: 'RELEASE_PROVENANCE_SOURCE_AUTHORITY_CLAIM_UNSUPPORTED',
      },
      {
        args: ['--enterprise-readiness', '.tmp/provenance-source.json'],
        output: '.tmp/provenance-output.json',
        code: 'RELEASE_PROVENANCE_SOURCE_AUTHORITY_CLAIM_UNSUPPORTED',
      },
      {
        args: ['--signing-readiness', '.tmp/signature-source.json'],
        output: '.tmp/signature-output.json',
        code: 'RELEASE_PROVENANCE_SOURCE_AUTHORITY_CLAIM_UNSUPPORTED',
      },
      {
        args: ['--signing-readiness', '.tmp/key-source.json'],
        output: '.tmp/key-output.json',
        code: 'RELEASE_PROVENANCE_SOURCE_AUTHORITY_CLAIM_UNSUPPORTED',
      },
      {
        args: ['--rbac-policy-validation', '.tmp/rbac-source.json'],
        output: '.tmp/rbac-output.json',
        code: 'RELEASE_PROVENANCE_SOURCE_AUTHORITY_CLAIM_UNSUPPORTED',
      },
      {
        args: ['--enterprise-readiness', '.tmp/network-source.json'],
        output: '.tmp/network-output.json',
        code: 'RELEASE_PROVENANCE_UNSAFE_SOURCE_AUTHORITY_FLAG',
      },
    ]

    for (const entry of cases) {
      const result = await runReleaseProvenance(workspace, entry.args, entry.output)
      expect(result.exitCode).toBe(ExitCode.ValidationFailed)
      expect(JSON.parse(result.stderr).issues.map((issue: { code: string }) => issue.code)).toContain(entry.code)
      expect(existsSync(join(workspace, entry.output))).toBe(false)
    }
  })

  it('blocks output collisions, source overwrites, protected paths, and package metadata overwrite', async () => {
    const workspace = createWorkspace()
    writeJson(join(workspace, '.tmp/signing-readiness.json'), signingReadinessReport())

    const cases = [
      {
        args: ['--signing-readiness', '.tmp/signing-readiness.json'],
        output: '.tmp/signing-readiness.json',
        expected: 'would overwrite a source input',
      },
      {
        args: [],
        output: resolve(pluginRoot, 'package.json'),
        expected: 'would overwrite a source input',
      },
      {
        args: [],
        output: '.tmp/release-provenance.json',
        markdown: '.tmp/release-provenance.json',
        expected: 'must be different',
      },
      {
        args: [],
        output: join('.devview', 'generated', 'release-provenance.json'),
        expected: 'inside a protected control path',
      },
    ]

    for (const entry of cases) {
      const result = await runReleaseProvenance(
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

    const first = await runReleaseProvenance(workspace, [], '.tmp/release-provenance.json')
    const firstContent = readFileSync(join(workspace, '.tmp/release-provenance.json'), 'utf8')
    const second = await runReleaseProvenance(workspace, [], '.tmp/release-provenance.json')
    const secondContent = readFileSync(join(workspace, '.tmp/release-provenance.json'), 'utf8')

    expect(first.exitCode).toBe(ExitCode.Success)
    expect(second.exitCode).toBe(ExitCode.Success)
    expect(secondContent).toBe(firstContent)
  })
})

function runReleaseProvenance(workspace: string, args: string[], output: string, extraArgs: string[] = []) {
  return runDevViewCli(['security', 'report-release-provenance', ...args, '--output', output, ...extraArgs, '--json'], {
    cwd: workspace,
    pluginRoot,
  })
}

function enterpriseReadinessReport(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    schemaVersion: 1,
    artifactRole: 'devview-enterprise-readiness-report',
    status: 'devview-enterprise-readiness-report-generated',
    readinessScope: 'enterprise-hardening-readiness-report-only',
    readinessLevel: 'not-ready',
    sourceFactsOnly: true,
    reportOnly: true,
    releaseSurfaceReadiness: { status: 'satisfied' },
    rbacAndSigningReadiness: {
      signingReadinessReportCount: 1,
      rbacPolicyValidationReportCount: 1,
      signedRecordEnvelopePresent: false,
    },
    enterpriseReadinessFindings: [],
    downstreamActionPlan: [],
    enterpriseGateActivated: false,
    cryptographicSignaturePresent: false,
    cryptographicSignatureVerified: false,
    keyGenerated: false,
    privateKeyStored: false,
    rbacEnforced: false,
    permissionVerified: false,
    ...safetyFlags(),
    ...overrides,
  }
}

function signingReadinessReport(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    schemaVersion: 1,
    artifactRole: 'devview-signing-readiness-report',
    status: 'devview-signing-readiness-reported',
    readinessScope: 'signing-key-governance-readiness-report-only',
    sourceFactsOnly: true,
    reportOnly: true,
    signingReadinessStatus: 'not-ready-policy-and-key-governance-missing',
    keyGovernanceReadiness: {
      status: 'not-ready',
      keyRegistryPresent: false,
      trustRootPresent: false,
      privateKeyStoragePresent: false,
      noPrivateKeyStorageInRepo: true,
    },
    signaturePolicyReadiness: {
      status: 'not-ready',
      detachedSignaturePolicyPresent: false,
      signatureFormatPolicyPresent: false,
    },
    cryptographicSignaturePresent: false,
    cryptographicSignatureVerified: false,
    keyGenerated: false,
    privateKeyStored: false,
    rbacEnforced: false,
    permissionVerified: false,
    ...safetyFlags(),
    ...overrides,
  }
}

function rbacPolicyValidationReport(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    schemaVersion: 1,
    artifactRole: 'devview-rbac-policy-validation-report',
    status: 'devview-rbac-policy-validation-passed',
    validationScope: 'rbac-policy-validation-report-only',
    sourceFactsOnly: true,
    reportOnly: true,
    rbacPolicyValidationStatus: 'passed',
    defaultDenyStatus: {
      defaultAuthorityPolicy: 'deny',
      defaultDenyConfigured: true,
    },
    actorSummary: { actorCount: 2 },
    permissionGrantSummary: { grantCount: 2 },
    rbacEnforced: false,
    permissionVerified: false,
    cryptographicSignaturePresent: false,
    cryptographicSignatureVerified: false,
    keyGenerated: false,
    privateKeyStored: false,
    ...safetyFlags(),
    ...overrides,
  }
}

function safetyFlags(): Record<string, unknown> {
  return {
    providerInvoked: false,
    networkCallMade: false,
    apiCallMade: false,
    shellCommandsExecuted: false,
    extensionExecutionAllowed: false,
    extensionsExecuted: false,
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
    benchmarkExecuted: false,
    candidateExecuted: false,
    graphifyExecuted: false,
    nativeBenchmarkExecuted: false,
  }
}

function expectSafetyFalse(payload: Record<string, unknown>): void {
  expect(payload.sbomGenerated).toBe(false)
  expect(payload.sbomPresent).toBe(false)
  expect(payload.sbomAttested).toBe(false)
  expect(payload.packageSigningPresent).toBe(false)
  expect(payload.packageSigned).toBe(false)
  expect(payload.packageSignaturePresent).toBe(false)
  expect(payload.packageSignatureVerified).toBe(false)
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
