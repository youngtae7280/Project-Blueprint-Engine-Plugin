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

describe('security report-provenance-verification-readiness CLI', () => {
  it('reports provenance verification readiness from a valid static attestation validation source', async () => {
    const workspace = createWorkspace()
    writeJson(join(workspace, '.tmp/provenance-attestation-validation.json'), provenanceAttestationValidationReport())

    const result = await runProvenanceVerificationReadiness(
      workspace,
      ['--provenance-attestation-validation', '.tmp/provenance-attestation-validation.json'],
      '.tmp/provenance-verification-readiness.json',
      ['--markdown', '.tmp/provenance-verification-readiness.md'],
    )
    const payload = JSON.parse(result.stdout)
    const written = JSON.parse(readFileSync(join(workspace, '.tmp/provenance-verification-readiness.json'), 'utf8'))

    expect(result.exitCode).toBe(ExitCode.Success)
    expect(payload.artifactRole).toBe('devview-provenance-verification-readiness-report')
    expect(payload.status).toBe('devview-provenance-verification-readiness-reported')
    expect(payload.readinessScope).toBe('provenance-verification-readiness-report-only')
    expect(payload.provenanceVerificationReadinessStatus).toBe('not-ready-key-trust-and-signature-policy-missing')
    expect(payload.sourceProvenanceAttestationValidation).toEqual(
      expect.objectContaining({
        supplied: true,
        path: '.tmp/provenance-attestation-validation.json',
        artifactRole: 'devview-provenance-attestation-validation-report',
        status: 'devview-provenance-attestation-validation-passed',
        attestationFormat: 'devview-minimal-provenance-v1',
        attestationDigestPresent: true,
        packageDigestAlignmentStatus: 'matched',
        provenanceInputAlignmentStatus: 'matched',
        signatureValidationStatus: 'not-performed-source-fact-only',
      }),
    )
    expect(payload.verificationBoundary).toEqual(
      expect.objectContaining({
        realSlsaVerificationPerformed: false,
        realInTotoVerificationPerformed: false,
        cryptographicSignatureVerified: false,
        signatureVerificationStatus: 'not-performed-readiness-only',
        provenanceAttestationGenerated: false,
        provenanceAttestationVerified: false,
        packageSigned: false,
      }),
    )
    expect(payload.sourceSigningReadiness.supplied).toBe(false)
    expect(payload.keyTrustReadiness.keyRegistryPresent).toBe(false)
    expect(payload.signaturePolicyReadiness.allowedAlgorithmPolicyPresent).toBe(false)
    expect(payload.rbacPrerequisiteReadiness.rbacEnforced).toBe(false)
    expect(written.writtenOutputPath).toBe('.tmp/provenance-verification-readiness.json')
    expect(written.writtenMarkdownPath).toBe('.tmp/provenance-verification-readiness.md')
    expect(existsSync(join(workspace, '.tmp/provenance-verification-readiness.md'))).toBe(true)
    expectSafetyFalse(payload)
  })

  it('summarizes signing, RBAC, envelope verification, and provider/network source facts', async () => {
    const workspace = createWorkspace()
    writeJson(join(workspace, '.tmp/provenance-attestation-validation.json'), provenanceAttestationValidationReport())
    writeJson(join(workspace, '.tmp/signing-readiness.json'), signingReadinessReport())
    writeJson(join(workspace, '.tmp/rbac-policy-validation.json'), rbacPolicyValidationReport())
    writeJson(join(workspace, '.tmp/record-envelope-verification.json'), recordEnvelopeVerificationReport())
    writeJson(join(workspace, '.tmp/provider-network-policy.json'), providerNetworkPolicyReport())

    const result = await runProvenanceVerificationReadiness(
      workspace,
      [
        '--provenance-attestation-validation',
        '.tmp/provenance-attestation-validation.json',
        '--signing-readiness',
        '.tmp/signing-readiness.json',
        '--rbac-policy-validation',
        '.tmp/rbac-policy-validation.json',
        '--record-envelope-verification',
        '.tmp/record-envelope-verification.json',
        '--provider-network-policy-report',
        '.tmp/provider-network-policy.json',
      ],
      '.tmp/provenance-verification-readiness.json',
    )
    const payload = JSON.parse(result.stdout)

    expect(result.exitCode).toBe(ExitCode.Success)
    expect(payload.sourceSigningReadiness).toEqual(
      expect.objectContaining({
        supplied: true,
        signingReadinessStatus: 'not-ready-policy-and-key-governance-missing',
        keyGovernanceStatus: 'not-ready',
        keyRegistryPresent: false,
        trustRootPresent: false,
        noPrivateKeyStorageInRepo: true,
        signaturePolicyStatus: 'not-ready',
        detachedSignaturePolicyPresent: false,
        rbacActorModelPresent: true,
        rbacPermissionMatrixPresent: true,
      }),
    )
    expect(payload.sourceRbacPolicyValidation).toEqual(
      expect.objectContaining({
        supplied: true,
        rbacPolicyValidationStatus: 'passed',
        defaultDenyConfigured: true,
        actorCount: 2,
        roleAssignmentCount: 2,
        permissionGrantCount: 2,
        automationRestrictionDeclared: true,
        extensionAuthorRestrictionDeclared: true,
        noEnforcementPerformed: true,
      }),
    )
    expect(payload.sourceRecordEnvelopeVerification).toEqual(
      expect.objectContaining({
        supplied: true,
        signatureVerificationMode: 'not-performed-unsigned-preview-only',
        payloadDigestMatches: true,
        allSourceDigestsMatch: true,
        previousEnvelopeChainLinkVerified: false,
        verificationDigestPresent: true,
      }),
    )
    expect(payload.sourceProviderNetworkPolicy).toEqual(
      expect.objectContaining({
        supplied: true,
        defaultProviderPolicy: 'deny',
        defaultNetworkPolicy: 'deny',
        explicitAllowSupported: false,
        providerAllowlistCount: 0,
        networkAllowlistCount: 0,
      }),
    )
    expect(payload.networkIsolationReadiness.providerNetworkDefaultDenyRecorded).toBe(true)
    expect(payload.rbacPrerequisiteReadiness.policyValidationPresent).toBe(true)
    expect(payload.rbacPrerequisiteReadiness.defaultDenyPolicyValidated).toBe(true)
    expect(payload.provenanceVerificationFindings.map((entry: { code: string }) => entry.code)).toEqual(
      expect.arrayContaining([
        'PROVENANCE_VERIFICATION_SIGNING_READINESS_LINKED',
        'PROVENANCE_VERIFICATION_RBAC_POLICY_VALIDATION_LINKED',
        'PROVENANCE_VERIFICATION_RECORD_ENVELOPE_VERIFICATION_LINKED',
        'PROVENANCE_VERIFICATION_PROVIDER_NETWORK_POLICY_LINKED',
      ]),
    )
    expectSafetyFalse(payload)
  })

  it('blocks wrong source role/status with zero writes', async () => {
    const workspace = createWorkspace()
    writeJson(join(workspace, '.tmp/wrong-attestation-validation.json'), {
      ...provenanceAttestationValidationReport(),
      status: 'wrong',
    })

    const result = await runProvenanceVerificationReadiness(
      workspace,
      ['--provenance-attestation-validation', '.tmp/wrong-attestation-validation.json'],
      '.tmp/provenance-verification-readiness.json',
    )

    expect(result.exitCode).toBe(ExitCode.ValidationFailed)
    expect(JSON.parse(result.stderr).issues.map((entry: { code: string }) => entry.code)).toContain(
      'PROVENANCE_VERIFICATION_ATTESTATION_VALIDATION_ROLE_STATUS_INVALID',
    )
    expect(existsSync(join(workspace, '.tmp/provenance-verification-readiness.json'))).toBe(false)
  })

  it('blocks real verification, signing, key, RBAC, provider/network, and CI authority claims', async () => {
    const workspace = createWorkspace()
    writeJson(join(workspace, '.tmp/verified-attestation.json'), {
      ...provenanceAttestationValidationReport(),
      provenanceAttestationVerified: true,
    })
    writeJson(join(workspace, '.tmp/crypto-attestation.json'), {
      ...provenanceAttestationValidationReport(),
      cryptographicSignatureVerified: true,
    })
    writeJson(join(workspace, '.tmp/signed-attestation.json'), {
      ...provenanceAttestationValidationReport(),
      packageSigned: true,
    })
    writeJson(join(workspace, '.tmp/key-signing.json'), { ...signingReadinessReport(), keyGenerated: true })
    writeJson(join(workspace, '.tmp/rbac-policy.json'), { ...rbacPolicyValidationReport(), rbacEnforced: true })
    writeJson(join(workspace, '.tmp/provider-policy.json'), {
      ...providerNetworkPolicyReport(),
      providerInvoked: true,
    })
    writeJson(join(workspace, '.tmp/ci-attestation.json'), {
      ...provenanceAttestationValidationReport(),
      requiredChecksMutated: true,
    })

    const cases = [
      {
        args: ['--provenance-attestation-validation', '.tmp/verified-attestation.json'],
        output: '.tmp/verified-output.json',
        code: 'PROVENANCE_VERIFICATION_AUTHORITY_CLAIM_UNSUPPORTED',
      },
      {
        args: ['--provenance-attestation-validation', '.tmp/crypto-attestation.json'],
        output: '.tmp/crypto-output.json',
        code: 'PROVENANCE_VERIFICATION_AUTHORITY_CLAIM_UNSUPPORTED',
      },
      {
        args: ['--provenance-attestation-validation', '.tmp/signed-attestation.json'],
        output: '.tmp/signed-output.json',
        code: 'PROVENANCE_VERIFICATION_AUTHORITY_CLAIM_UNSUPPORTED',
      },
      {
        args: [
          '--provenance-attestation-validation',
          '.tmp/provenance-attestation-validation.json',
          '--signing-readiness',
          '.tmp/key-signing.json',
        ],
        setup: () =>
          writeJson(
            join(workspace, '.tmp/provenance-attestation-validation.json'),
            provenanceAttestationValidationReport(),
          ),
        output: '.tmp/key-output.json',
        code: 'PROVENANCE_VERIFICATION_AUTHORITY_CLAIM_UNSUPPORTED',
      },
      {
        args: [
          '--provenance-attestation-validation',
          '.tmp/provenance-attestation-validation.json',
          '--rbac-policy-validation',
          '.tmp/rbac-policy.json',
        ],
        output: '.tmp/rbac-output.json',
        code: 'PROVENANCE_VERIFICATION_AUTHORITY_CLAIM_UNSUPPORTED',
      },
      {
        args: [
          '--provenance-attestation-validation',
          '.tmp/provenance-attestation-validation.json',
          '--provider-network-policy-report',
          '.tmp/provider-policy.json',
        ],
        output: '.tmp/provider-output.json',
        code: 'PROVENANCE_VERIFICATION_UNSAFE_SOURCE_AUTHORITY_FLAG',
      },
      {
        args: ['--provenance-attestation-validation', '.tmp/ci-attestation.json'],
        output: '.tmp/ci-output.json',
        code: 'PROVENANCE_VERIFICATION_UNSAFE_SOURCE_AUTHORITY_FLAG',
      },
    ]

    for (const entry of cases) {
      entry.setup?.()
      const result = await runProvenanceVerificationReadiness(workspace, entry.args, entry.output)
      expect(result.exitCode).toBe(ExitCode.ValidationFailed)
      expect(JSON.parse(result.stderr).issues.map((issue: { code: string }) => issue.code)).toContain(entry.code)
      expect(existsSync(join(workspace, entry.output))).toBe(false)
    }
  })

  it('blocks unsupported signature status and provider/network allowlists with zero writes', async () => {
    const workspace = createWorkspace()
    writeJson(join(workspace, '.tmp/signed-status.json'), {
      ...provenanceAttestationValidationReport(),
      signatureValidationStatus: 'verified',
    })
    writeJson(join(workspace, '.tmp/provenance-attestation-validation.json'), provenanceAttestationValidationReport())
    writeJson(join(workspace, '.tmp/provider-policy.json'), {
      ...providerNetworkPolicyReport(),
      providerAllowlist: ['example-provider'],
    })

    const signature = await runProvenanceVerificationReadiness(
      workspace,
      ['--provenance-attestation-validation', '.tmp/signed-status.json'],
      '.tmp/signature-output.json',
    )
    const allowlist = await runProvenanceVerificationReadiness(
      workspace,
      [
        '--provenance-attestation-validation',
        '.tmp/provenance-attestation-validation.json',
        '--provider-network-policy-report',
        '.tmp/provider-policy.json',
      ],
      '.tmp/allowlist-output.json',
    )

    expect(signature.exitCode).toBe(ExitCode.ValidationFailed)
    expect(JSON.parse(signature.stderr).issues.map((entry: { code: string }) => entry.code)).toContain(
      'PROVENANCE_VERIFICATION_ATTESTATION_SIGNATURE_STATUS_UNSUPPORTED',
    )
    expect(existsSync(join(workspace, '.tmp/signature-output.json'))).toBe(false)

    expect(allowlist.exitCode).toBe(ExitCode.ValidationFailed)
    expect(JSON.parse(allowlist.stderr).issues.map((entry: { code: string }) => entry.code)).toContain(
      'PROVENANCE_VERIFICATION_PROVIDER_NETWORK_ALLOWLIST_UNSUPPORTED',
    )
    expect(existsSync(join(workspace, '.tmp/allowlist-output.json'))).toBe(false)
  })

  it('blocks output collisions, source overwrite, protected paths, and source-authority-shaped outputs', async () => {
    const workspace = createWorkspace()
    writeJson(join(workspace, '.tmp/provenance-attestation-validation.json'), provenanceAttestationValidationReport())
    const cases = [
      {
        output: '.tmp/provenance-attestation-validation.json',
        expected: 'would overwrite a source input',
      },
      {
        output: '.tmp/provenance-verification-readiness.json',
        markdown: '.tmp/provenance-verification-readiness.json',
        expected: 'must be different',
      },
      {
        output: join('.devview', 'generated', 'provenance-verification-readiness.json'),
        expected: 'inside a protected control path',
      },
      {
        output: '.tmp/provenance-attestation.json',
        expected: 'looks like a source authority artifact',
      },
    ]

    for (const entry of cases) {
      const result = await runProvenanceVerificationReadiness(
        workspace,
        ['--provenance-attestation-validation', '.tmp/provenance-attestation-validation.json'],
        entry.output,
        entry.markdown ? ['--markdown', entry.markdown] : [],
      )
      expect(result.exitCode).toBe(ExitCode.ValidationFailed)
      expect(result.stderr).toContain(entry.expected)
    }
  })
})

function runProvenanceVerificationReadiness(
  workspace: string,
  args: string[],
  output: string,
  extraArgs: string[] = [],
) {
  return runDevViewCli(
    ['security', 'report-provenance-verification-readiness', ...args, '--output', output, ...extraArgs, '--json'],
    {
      cwd: workspace,
      pluginRoot,
    },
  )
}

function provenanceAttestationValidationReport(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    schemaVersion: 1,
    artifactRole: 'devview-provenance-attestation-validation-report',
    status: 'devview-provenance-attestation-validation-passed',
    validationScope: 'provenance-attestation-validation-report-only',
    sourceFactsOnly: true,
    reportOnly: true,
    attestationValidationStatus: 'validated-structural-source-fact-only',
    signatureValidationStatus: 'not-performed-source-fact-only',
    sourceAttestationArtifact: {
      path: '.tmp/provenance-attestation.json',
      artifactRole: 'devview-provenance-attestation-artifact',
      status: 'devview-provenance-attestation-supplied',
      attestationScope: 'package-provenance-attestation-source-fact-only',
      attestationFormat: 'devview-minimal-provenance-v1',
      packageName: 'devview',
      packageVersion: '0.2.0-alpha',
      declaredPackageSha256: 'a'.repeat(64),
      byteLength: 1024,
      sha256: 'b'.repeat(64),
    },
    packageDigestAlignment: {
      declaredPackageSha256: 'a'.repeat(64),
      packageArtifactDigestSha256: 'a'.repeat(64),
      packageDigestMatches: true,
      alignmentStatus: 'matched',
    },
    provenanceInputAlignment: {
      packageNameMatches: true,
      packageVersionMatches: true,
      sourceRefMatches: true,
      buildCommandLabelMatches: true,
      alignmentStatus: 'matched',
    },
    digestSummary: {
      attestationSha256: 'b'.repeat(64),
      attestationByteLength: 1024,
      sourceArtifactDigests: [],
    },
    validationFindings: [],
    downstreamActionPlan: [],
    provenanceAttestationGeneratedByDevView: false,
    provenanceAttestationGenerated: false,
    provenanceAttestationVerified: false,
    provenanceAttestationPresent: false,
    provenanceAttested: false,
    releaseProvenanceAttested: false,
    npmProvenanceEnabled: false,
    slsaProvenanceGenerated: false,
    inTotoStatementVerified: false,
    packageSigned: false,
    packageSigningPresent: false,
    packageSignaturePresent: false,
    packageSignatureVerified: false,
    sbomGeneratedByDevView: false,
    sbomGenerated: false,
    sbomAttested: false,
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
      gaps: [],
    },
    signaturePolicyReadiness: {
      status: 'not-ready',
      detachedSignaturePolicyPresent: false,
      signatureFormatPolicyPresent: false,
      gaps: [],
    },
    rbacPrerequisiteSummary: {
      actorModelPresent: true,
      permissionMatrixPresent: true,
      artifactPermissionMappingPresent: true,
      roleAssignmentRegistryPresent: false,
      rbacEnforced: false,
      permissionVerificationEnforced: false,
      gaps: [],
    },
    futureSignedEnvelopeRequirements: ['detached signature fields'],
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
    actorSummary: { actorCount: 2, actorCountByType: { human: 1, automation: 1 } },
    roleAssignmentSummary: { assignmentCount: 2 },
    permissionGrantSummary: { grantCount: 2 },
    automationRestrictionStatus: { automationRestrictionDeclared: true },
    extensionAuthorRestrictionStatus: { extensionAuthorRestrictionDeclared: true },
    noEnforcementPerformed: true,
    rbacEnforced: false,
    permissionVerified: false,
    rbacPermissionVerified: false,
    cryptographicSignaturePresent: false,
    cryptographicSignatureVerified: false,
    keyGenerated: false,
    privateKeyStored: false,
    ...safetyFlags(),
    ...overrides,
  }
}

function recordEnvelopeVerificationReport(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    schemaVersion: 1,
    artifactRole: 'devview-record-envelope-verification-report',
    status: 'devview-record-envelope-verified',
    verificationScope: 'record-envelope-verification-report-only',
    sourceFactsOnly: true,
    reportOnly: true,
    payloadVerification: { digestMatches: true },
    sourceArtifactVerification: { allSourceDigestsMatch: true },
    previousEnvelopeVerification: { chainLinkVerified: false },
    verificationDigest: 'c'.repeat(64),
    signatureVerificationMode: 'not-performed-unsigned-preview-only',
    cryptographicSignatureVerified: false,
    rbacPermissionVerified: false,
    rbacEnforced: false,
    permissionVerified: false,
    ...safetyFlags(),
    ...overrides,
  }
}

function providerNetworkPolicyReport(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    schemaVersion: 1,
    artifactRole: 'devview-provider-network-default-deny-policy-report',
    status: 'devview-provider-network-default-deny-policy-recorded',
    policyScope: 'provider-network-default-deny-policy-report-only',
    sourceFactsOnly: true,
    reportOnly: true,
    defaultProviderPolicy: 'deny',
    defaultNetworkPolicy: 'deny',
    explicitAllowSupported: false,
    providerAllowlist: [],
    networkAllowlist: [],
    futureAllowPolicyRequirements: ['signed policy'],
    blockedCapabilities: ['provider execution', 'network access'],
    providerInvoked: false,
    networkCallMade: false,
    apiCallMade: false,
    shellCommandsExecuted: false,
    extensionExecutionAllowed: false,
    extensionsExecuted: false,
    ...safetyFlags(),
    ...overrides,
  }
}

function safetyFlags(): Record<string, unknown> {
  return {
    enterpriseGateActivated: false,
    providerInvoked: false,
    networkCallMade: false,
    apiCallMade: false,
    shellCommandExecuted: false,
    shellCommandsExecuted: false,
    extensionExecutionAllowed: false,
    extensionsExecuted: false,
    extensionCodeExecuted: false,
    graphifyExecuted: false,
    graphifyLiveRun: false,
    nativeBenchmarkExecuted: false,
    benchmarkExecuted: false,
    candidateExecuted: false,
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
  expect(payload.sourceFactsOnly).toBe(true)
  expect(payload.reportOnly).toBe(true)
  expect(payload.realSlsaVerificationPerformed).toBe(false)
  expect(payload.realInTotoVerificationPerformed).toBe(false)
  expect(payload.provenanceAttestationGeneratedByDevView).toBe(false)
  expect(payload.provenanceAttestationGenerated).toBe(false)
  expect(payload.provenanceAttestationVerified).toBe(false)
  expect(payload.provenanceAttested).toBe(false)
  expect(payload.packageSigned).toBe(false)
  expect(payload.packageSignatureVerified).toBe(false)
  expect(payload.sbomGeneratedByDevView).toBe(false)
  expect(payload.sbomGenerated).toBe(false)
  expect(payload.sbomAttested).toBe(false)
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
}
