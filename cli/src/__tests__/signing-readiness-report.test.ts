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

describe('security report-signing-readiness CLI', () => {
  it('emits a default report-only signing and key governance gap summary', async () => {
    const workspace = createWorkspace()

    const result = await runSigningReadiness(workspace, [], '.tmp/signing-readiness.json', [
      '--markdown',
      '.tmp/signing-readiness.md',
    ])
    const payload = JSON.parse(result.stdout)
    const written = JSON.parse(readFileSync(join(workspace, '.tmp/signing-readiness.json'), 'utf8'))

    expect(result.exitCode).toBe(ExitCode.Success)
    expect(payload.artifactRole).toBe('devview-signing-readiness-report')
    expect(payload.status).toBe('devview-signing-readiness-reported')
    expect(payload.readinessScope).toBe('signing-key-governance-readiness-report-only')
    expect(payload.signingReadinessStatus).toBe('not-ready-policy-and-key-governance-missing')
    expect(payload.sourceRbacReadiness.supplied).toBe(false)
    expect(payload.sourceRecordEnvelopePreviews).toHaveLength(0)
    expect(payload.sourceRecordEnvelopeVerifications).toHaveLength(0)
    expect(payload.sourceEnterpriseReadiness.supplied).toBe(false)
    expect(payload.envelopePrerequisiteSummary.previewCount).toBe(0)
    expect(payload.envelopePrerequisiteSummary.verificationCount).toBe(0)
    expect(payload.envelopePrerequisiteSummary.signedEnvelopeCount).toBe(0)
    expect(payload.keyGovernanceReadiness.keyRegistryPresent).toBe(false)
    expect(payload.keyGovernanceReadiness.trustRootPresent).toBe(false)
    expect(payload.keyGovernanceReadiness.noPrivateKeyStorageInRepo).toBe(true)
    expect(payload.signaturePolicyReadiness.detachedSignaturePolicyRequired).toBe(true)
    expect(payload.signaturePolicyReadiness.detachedSignaturePolicyPresent).toBe(false)
    expect(payload.rbacPrerequisiteSummary.rbacEnforced).toBe(false)
    expect(payload.signingReadinessFindings.map((entry: { code: string }) => entry.code)).toEqual(
      expect.arrayContaining([
        'SIGNING_READINESS_NOT_READY',
        'SIGNING_READINESS_KEY_GOVERNANCE_MISSING',
        'SIGNING_READINESS_POLICY_MISSING',
      ]),
    )
    expect(written.writtenOutputPath).toBe('.tmp/signing-readiness.json')
    expect(written.writtenMarkdownPath).toBe('.tmp/signing-readiness.md')
    expect(existsSync(join(workspace, '.tmp/signing-readiness.md'))).toBe(true)
    expectSafetyFalse(payload)
  })

  it('summarizes valid RBAC readiness as a source fact without enforcing RBAC', async () => {
    const workspace = createWorkspace()
    writeJson(join(workspace, '.tmp/rbac-readiness.json'), rbacReadinessReport())

    const result = await runSigningReadiness(
      workspace,
      ['--rbac-readiness', '.tmp/rbac-readiness.json'],
      '.tmp/signing-readiness.json',
    )
    const payload = JSON.parse(result.stdout)

    expect(result.exitCode).toBe(ExitCode.Success)
    expect(payload.sourceRbacReadiness).toEqual(
      expect.objectContaining({
        supplied: true,
        path: '.tmp/rbac-readiness.json',
        artifactRole: 'devview-rbac-readiness-report',
        status: 'devview-rbac-readiness-reported',
        actorModelPresent: true,
        rolePermissionMatrixPresent: true,
        artifactPermissionMappingPresent: true,
        rbacEnforced: false,
        signedRecordEnvelopePresent: false,
        cryptographicSigningImplemented: false,
        keyManagementImplemented: false,
      }),
    )
    expect(payload.rbacPrerequisiteSummary.actorModelPresent).toBe(true)
    expect(payload.rbacPrerequisiteSummary.permissionMatrixPresent).toBe(true)
    expect(payload.rbacPrerequisiteSummary.roleAssignmentRegistryPresent).toBe(false)
    expect(payload.rbacPrerequisiteSummary.permissionVerificationEnforced).toBe(false)
    expect(payload.signingReadinessFindings.map((entry: { code: string }) => entry.code)).toContain(
      'SIGNING_READINESS_RBAC_SOURCE_LINKED',
    )
    expectSafetyFalse(payload)
  })

  it('summarizes valid envelope preview and verification sources with digest verification counts', async () => {
    const workspace = createWorkspace()
    writeJson(join(workspace, '.tmp/preview.json'), recordEnvelopePreview())
    writeJson(join(workspace, '.tmp/verification.json'), recordEnvelopeVerification())

    const result = await runSigningReadiness(
      workspace,
      ['--record-envelope-preview', '.tmp/preview.json', '--record-envelope-verification', '.tmp/verification.json'],
      '.tmp/signing-readiness.json',
    )
    const payload = JSON.parse(result.stdout)

    expect(result.exitCode).toBe(ExitCode.Success)
    expect(payload.sourceRecordEnvelopePreviews).toHaveLength(1)
    expect(payload.sourceRecordEnvelopePreviews[0]).toEqual(
      expect.objectContaining({
        path: '.tmp/preview.json',
        signatureMode: 'unsigned-deterministic-preview',
        payloadSha256Present: true,
        sourceArtifactDigestCount: 1,
        actorIdentityRecorded: true,
        requiredPermission: 'audit.verify',
        cryptographicSignaturePresent: false,
        cryptographicSignatureVerified: false,
        rbacEnforced: false,
        permissionVerified: false,
      }),
    )
    expect(payload.sourceRecordEnvelopeVerifications).toHaveLength(1)
    expect(payload.sourceRecordEnvelopeVerifications[0]).toEqual(
      expect.objectContaining({
        path: '.tmp/verification.json',
        sourcePreviewPath: '.tmp/preview.json',
        payloadDigestMatches: true,
        allSourceDigestsMatch: true,
        previousEnvelopeChainLinkVerified: false,
        signatureVerificationMode: 'not-performed-unsigned-preview-only',
        cryptographicSignatureVerified: false,
        rbacPermissionVerified: false,
      }),
    )
    expect(payload.envelopePrerequisiteSummary.previewCount).toBe(1)
    expect(payload.envelopePrerequisiteSummary.verificationCount).toBe(1)
    expect(payload.envelopePrerequisiteSummary.payloadDigestVerifiedCount).toBe(1)
    expect(payload.envelopePrerequisiteSummary.sourceDigestVerifiedCount).toBe(1)
    expect(payload.envelopePrerequisiteSummary.previousChainVerifiedCount).toBe(0)
    expect(payload.envelopePrerequisiteSummary.cryptographicSignatureVerifiedCount).toBe(0)
    expectSafetyFalse(payload)
  })

  it('summarizes valid enterprise readiness as a source fact', async () => {
    const workspace = createWorkspace()
    writeJson(join(workspace, '.tmp/enterprise-readiness.json'), enterpriseReadinessReport())

    const result = await runSigningReadiness(
      workspace,
      ['--enterprise-readiness', '.tmp/enterprise-readiness.json'],
      '.tmp/signing-readiness.json',
    )
    const payload = JSON.parse(result.stdout)

    expect(result.exitCode).toBe(ExitCode.Success)
    expect(payload.sourceEnterpriseReadiness).toEqual(
      expect.objectContaining({
        supplied: true,
        path: '.tmp/enterprise-readiness.json',
        artifactRole: 'devview-enterprise-readiness-report',
        status: 'devview-enterprise-readiness-report-generated',
        readinessLevel: 'not-ready',
        signingReadinessStatus: 'gap',
        envelopePreviewCount: 1,
        envelopeVerificationCount: 1,
        signedRecordEnvelopePresent: false,
      }),
    )
    expect(payload.signingReadinessFindings.map((entry: { code: string }) => entry.code)).toContain(
      'SIGNING_READINESS_ENTERPRISE_SOURCE_LINKED',
    )
    expectSafetyFalse(payload)
  })

  it('supports comma-separated and repeated preview and verification source inputs', async () => {
    const workspace = createWorkspace()
    writeJson(join(workspace, '.tmp/preview-a.json'), recordEnvelopePreview())
    writeJson(join(workspace, '.tmp/preview-b.json'), recordEnvelopePreview({ envelopeSha256: 'f'.repeat(64) }))
    writeJson(join(workspace, '.tmp/verification-a.json'), recordEnvelopeVerification())
    writeJson(
      join(workspace, '.tmp/verification-b.json'),
      recordEnvelopeVerification({
        previousEnvelopeVerification: {
          required: true,
          supplied: true,
          expectedSha256: 'e'.repeat(64),
          actualSha256: 'e'.repeat(64),
          digestMatches: true,
          chainLinkVerified: true,
          expectedPath: '.tmp/previous.envelope.json',
          actualPath: '.tmp/previous.envelope.json',
          pathMatches: true,
        },
      }),
    )

    const result = await runSigningReadiness(
      workspace,
      [
        '--record-envelope-preview',
        '.tmp/preview-a.json,.tmp/preview-b.json',
        '--record-envelope-verification',
        '.tmp/verification-a.json',
        '--record-envelope-verification',
        '.tmp/verification-b.json',
      ],
      '.tmp/signing-readiness.json',
    )
    const payload = JSON.parse(result.stdout)

    expect(result.exitCode).toBe(ExitCode.Success)
    expect(payload.sourceRecordEnvelopePreviews).toHaveLength(2)
    expect(payload.sourceRecordEnvelopeVerifications).toHaveLength(2)
    expect(payload.envelopePrerequisiteSummary.previewCount).toBe(2)
    expect(payload.envelopePrerequisiteSummary.verificationCount).toBe(2)
    expect(payload.envelopePrerequisiteSummary.payloadDigestVerifiedCount).toBe(2)
    expect(payload.envelopePrerequisiteSummary.sourceDigestVerifiedCount).toBe(2)
    expect(payload.envelopePrerequisiteSummary.previousChainVerifiedCount).toBe(1)
    expectSafetyFalse(payload)
  })

  it('blocks wrong source role/status with zero writes', async () => {
    const workspace = createWorkspace()
    writeJson(join(workspace, '.tmp/wrong-rbac.json'), {
      ...rbacReadinessReport(),
      status: 'wrong',
    })

    const result = await runSigningReadiness(
      workspace,
      ['--rbac-readiness', '.tmp/wrong-rbac.json'],
      '.tmp/signing-readiness.json',
    )

    expect(result.exitCode).toBe(ExitCode.ValidationFailed)
    expect(JSON.parse(result.stderr).issues.map((entry: { code: string }) => entry.code)).toContain(
      'SIGNING_READINESS_RBAC_SOURCE_ROLE_STATUS_INVALID',
    )
    expect(existsSync(join(workspace, '.tmp/signing-readiness.json'))).toBe(false)
  })

  it('blocks signing, key, and RBAC authority claims in supplied sources with zero writes', async () => {
    const workspace = createWorkspace()
    writeJson(join(workspace, '.tmp/signed-preview.json'), {
      ...recordEnvelopePreview(),
      cryptographicSignaturePresent: true,
    })
    writeJson(join(workspace, '.tmp/crypto-verification.json'), {
      ...recordEnvelopeVerification(),
      cryptographicSignatureVerified: true,
    })
    writeJson(join(workspace, '.tmp/key-rbac.json'), {
      ...rbacReadinessReport(),
      privateKeyStored: true,
    })
    writeJson(join(workspace, '.tmp/rbac-enterprise.json'), {
      ...enterpriseReadinessReport(),
      rbacEnforced: true,
    })

    const cases = [
      {
        args: ['--record-envelope-preview', '.tmp/signed-preview.json'],
        output: '.tmp/signed-preview-readiness.json',
      },
      {
        args: ['--record-envelope-verification', '.tmp/crypto-verification.json'],
        output: '.tmp/crypto-verification-readiness.json',
      },
      { args: ['--rbac-readiness', '.tmp/key-rbac.json'], output: '.tmp/key-rbac-readiness.json' },
      {
        args: ['--enterprise-readiness', '.tmp/rbac-enterprise.json'],
        output: '.tmp/rbac-enterprise-readiness.json',
      },
    ]

    for (const entry of cases) {
      const result = await runSigningReadiness(workspace, entry.args, entry.output)
      expect(result.exitCode).toBe(ExitCode.ValidationFailed)
      expect(JSON.parse(result.stderr).issues.map((issue: { code: string }) => issue.code)).toContain(
        'SIGNING_READINESS_SIGNING_OR_RBAC_CLAIM_UNSUPPORTED',
      )
      expect(existsSync(join(workspace, entry.output))).toBe(false)
    }
  })

  it('blocks unsafe provider, network, graph, lifecycle, CI, hook, and approval flags with zero writes', async () => {
    const workspace = createWorkspace()
    writeJson(join(workspace, '.tmp/unsafe-rbac.json'), {
      ...rbacReadinessReport(),
      networkCallMade: true,
    })

    const result = await runSigningReadiness(
      workspace,
      ['--rbac-readiness', '.tmp/unsafe-rbac.json'],
      '.tmp/signing-readiness.json',
    )

    expect(result.exitCode).toBe(ExitCode.ValidationFailed)
    expect(JSON.parse(result.stderr).issues.map((entry: { code: string }) => entry.code)).toContain(
      'SIGNING_READINESS_UNSAFE_SOURCE_AUTHORITY_FLAG',
    )
    expect(existsSync(join(workspace, '.tmp/signing-readiness.json'))).toBe(false)
  })

  it('blocks output collisions, source overwrites, and protected output paths', async () => {
    const workspace = createWorkspace()
    writeJson(join(workspace, '.tmp/rbac-readiness.json'), rbacReadinessReport())
    const cases = [
      { output: '.tmp/rbac-readiness.json', expected: 'would overwrite a source input' },
      { output: '.tmp/signing.json', markdown: '.tmp/signing.json', expected: 'must be different' },
      { output: join('.devview', 'generated', 'signing-readiness.json'), expected: 'inside a protected control path' },
    ]

    for (const entry of cases) {
      const result = await runSigningReadiness(
        workspace,
        ['--rbac-readiness', '.tmp/rbac-readiness.json'],
        entry.output,
        entry.markdown ? ['--markdown', entry.markdown] : [],
      )
      expect(result.exitCode).toBe(ExitCode.ValidationFailed)
      expect(result.stderr).toContain(entry.expected)
    }
  })
})

function runSigningReadiness(workspace: string, args: string[], output: string, extraArgs: string[] = []) {
  return runDevViewCli(['security', 'report-signing-readiness', ...args, '--output', output, ...extraArgs, '--json'], {
    cwd: workspace,
    pluginRoot,
  })
}

function rbacReadinessReport(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    schemaVersion: 1,
    artifactRole: 'devview-rbac-readiness-report',
    status: 'devview-rbac-readiness-reported',
    readinessScope: 'rbac-actor-identity-readiness-report-only',
    sourceFactsOnly: true,
    reportOnly: true,
    actorModelSummary: [{ actorType: 'operator' }, { actorType: 'auditor' }],
    rolePermissionMatrix: [{ role: 'auditor', permissions: ['audit.verify'] }],
    artifactPermissionMapping: [
      {
        artifactRole: 'devview-record-envelope-preview',
        requiredPermission: 'audit.verify',
        signatureRequiredBeforeEnterpriseReady: true,
      },
    ],
    rbacEnforced: false,
    signedRecordEnvelopePresent: false,
    cryptographicSigningImplemented: false,
    keyManagementImplemented: false,
    ...safetyFlags(),
    ...overrides,
  }
}

function recordEnvelopePreview(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    schemaVersion: 1,
    artifactRole: 'devview-record-envelope-preview',
    status: 'devview-record-envelope-previewed',
    envelopeScope: 'signed-record-envelope-preview-report-only',
    recordEnvelopeVersion: 1,
    sourceFactsOnly: true,
    reportOnly: true,
    payloadSummary: {
      path: '.tmp/rbac-readiness.json',
      artifactRole: 'devview-rbac-readiness-report',
      status: 'devview-rbac-readiness-reported',
      sha256: 'a'.repeat(64),
      byteLength: 1024,
      payloadCanonicalization: 'raw-json-bytes-sha256',
    },
    sourceArtifactDigests: [
      {
        path: '.tmp/source.json',
        artifactRole: 'devview-provider-network-default-deny-policy-report',
        status: 'devview-provider-network-default-deny-policy-recorded',
        sha256: 'b'.repeat(64),
        byteLength: 512,
      },
    ],
    actorIdentity: {
      actorId: 'auditor.local',
      actorType: 'human',
      roleClaims: ['auditor'],
      identityProvider: 'explicit-cli-input',
      identityAssurance: 'explicit-cli-input-not-verified',
    },
    authorizationClaim: {
      requiredPermission: 'audit.verify',
      authorizationSource: 'explicit-cli-input',
      authorizationRationale: 'Review signing readiness source facts.',
      rbacEnforced: false,
      permissionVerified: false,
    },
    signatureMode: 'unsigned-deterministic-preview',
    cryptographicSignaturePresent: false,
    keyId: null,
    signatureAlgorithm: null,
    previousEnvelope: { supplied: false },
    previousEnvelopeSha256: null,
    envelopePayloadDigest: 'c'.repeat(64),
    envelopeSha256: 'd'.repeat(64),
    verificationSummary: {
      payloadHashRecorded: true,
      sourceDigestsRecorded: true,
      actorIdentityRecorded: true,
      rbacPermissionVerified: false,
      cryptographicSignatureVerified: false,
      previousEnvelopeLinked: false,
    },
    rbacEnforced: false,
    permissionVerified: false,
    ...safetyFlags(),
    ...overrides,
  }
}

function recordEnvelopeVerification(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    schemaVersion: 1,
    artifactRole: 'devview-record-envelope-verification-report',
    status: 'devview-record-envelope-verified',
    verificationScope: 'record-envelope-verification-report-only',
    sourceFactsOnly: true,
    reportOnly: true,
    sourceRecordEnvelopePreview: {
      path: '.tmp/preview.json',
      artifactRole: 'devview-record-envelope-preview',
      status: 'devview-record-envelope-previewed',
      signatureMode: 'unsigned-deterministic-preview',
      envelopeSha256Present: true,
      envelopePayloadDigestPresent: true,
    },
    payloadVerification: {
      expectedPath: '.tmp/rbac-readiness.json',
      actualPath: '.tmp/rbac-readiness.json',
      pathMatches: true,
      expectedArtifactRole: 'devview-rbac-readiness-report',
      actualArtifactRole: 'devview-rbac-readiness-report',
      artifactRoleMatches: true,
      expectedStatus: 'devview-rbac-readiness-reported',
      actualStatus: 'devview-rbac-readiness-reported',
      statusMatches: true,
      expectedSha256: 'a'.repeat(64),
      actualSha256: 'a'.repeat(64),
      digestMatches: true,
      expectedByteLength: 1024,
      actualByteLength: 1024,
      byteLengthMatches: true,
    },
    sourceArtifactVerification: {
      expectedCount: 1,
      actualCount: 1,
      allSourceDigestsMatch: true,
      missingExpectedPaths: [],
      unexpectedActualPaths: [],
      matches: [],
    },
    previousEnvelopeVerification: {
      required: false,
      supplied: false,
      expectedSha256: null,
      actualSha256: null,
      digestMatches: null,
      chainLinkVerified: false,
      expectedPath: null,
      actualPath: null,
      pathMatches: null,
    },
    envelopeStructuralChecks: {
      envelopeSha256Present: true,
      envelopePayloadDigestPresent: true,
      payloadHashRecorded: true,
      sourceDigestsRecorded: true,
      actorIdentityRecorded: true,
    },
    verificationDigest: 'e'.repeat(64),
    signatureVerificationMode: 'not-performed-unsigned-preview-only',
    cryptographicSignatureVerified: false,
    rbacPermissionVerified: false,
    rbacEnforced: false,
    permissionVerified: false,
    verificationFindings: [],
    downstreamActionPlan: [],
    ...safetyFlags(),
    ...overrides,
  }
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
    rbacAndSigningReadiness: {
      status: 'gap',
      unsignedRecordEnvelopePreviewCount: 1,
      recordEnvelopeVerificationCount: 1,
      payloadDigestVerifiedCount: 1,
      sourceDigestsVerifiedCount: 1,
      previousEnvelopeChainLinkVerifiedCount: 0,
      signedRecordEnvelopePresent: false,
      cryptographicSignatureVerified: false,
      rbacEnforced: false,
      permissionVerified: false,
    },
    auditAndTamperEvidenceReadiness: {
      status: 'unsigned-digest-verification-recorded',
      envelopePreviewCount: 1,
      envelopeVerificationCount: 1,
      envelopePayloadDigestVerifiedCount: 1,
      envelopeSourceDigestsVerifiedCount: 1,
    },
    enterpriseReadinessFindings: [],
    downstreamActionPlan: [],
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
  expect(payload.benchmarkExecuted).toBe(false)
  expect(payload.candidateExecuted).toBe(false)
  expect(payload.graphifyExecuted).toBe(false)
  expect(payload.nativeBenchmarkExecuted).toBe(false)
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
}
