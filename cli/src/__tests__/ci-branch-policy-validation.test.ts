import { existsSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { runDevViewCli } from '../app'
import { ExitCode } from '../core/types'
import { cleanupWorkspaces, createWorkspace, writeJson } from './fixtures/workspace'

const pluginRoot = resolve(process.cwd())

afterEach(() => {
  cleanupWorkspaces()
})

describe('security validate-ci-branch-policy CLI', () => {
  it('validates a minimal default-deny CI/branch policy without source facts', async () => {
    const workspace = createWorkspace()
    writeJson(join(workspace, '.tmp/ci-branch-policy.json'), ciBranchPolicy())

    const result = await runCiBranchPolicyValidation(
      workspace,
      ['--policy', '.tmp/ci-branch-policy.json'],
      '.tmp/ci-branch-policy-validation.json',
      ['--markdown', '.tmp/ci-branch-policy-validation.md'],
    )
    const payload = JSON.parse(result.stdout)

    expect(result.exitCode).toBe(ExitCode.Success)
    expect(payload.artifactRole).toBe('devview-ci-branch-policy-validation-report')
    expect(payload.status).toBe('devview-ci-branch-policy-validation-passed')
    expect(payload.validationScope).toBe('ci-branch-policy-validation-report-only')
    expect(payload.ciBranchPolicyValidationStatus).toBe('partial-readiness-policy-needs-source-linkage')
    expect(payload.sourcePolicy).toEqual(
      expect.objectContaining({
        path: '.tmp/ci-branch-policy.json',
        artifactRole: 'devview-ci-branch-policy',
        status: 'devview-ci-branch-policy-configured',
        policyScope: 'ci-branch-policy-validation-report-only',
        defaultExternalCiPolicy: 'deny',
        defaultBranchMutationPolicy: 'deny',
        activationMode: 'report-only-no-mutation',
      }),
    )
    expect(payload.sourcePolicy.sha256).toMatch(/^[0-9a-f]{64}$/)
    expect(payload.requiredChecksPolicyValidation.declaredCheckCount).toBe(1)
    expect(payload.requiredChecksPolicyValidation.workflowCandidateMatchCount).toBe(0)
    expect(payload.branchProtectionPolicyValidation.branchProtectionPolicyPresent).toBe(true)
    expect(payload.actorRbacPrerequisiteValidation.rbacEnforced).toBe(false)
    expect(payload.providerNetworkPrerequisiteValidation.providerInvoked).toBe(false)
    expect(existsSync(join(workspace, '.tmp/ci-branch-policy-validation.md'))).toBe(true)
    expectSafetyFalse(payload)
  })

  it('aligns declared checks with CI/branch governance readiness workflow inventory', async () => {
    const workspace = createWorkspace()
    writeJson(join(workspace, '.tmp/ci-branch-policy.json'), ciBranchPolicy())
    writeJson(join(workspace, '.tmp/ci-branch-governance-readiness.json'), ciBranchGovernanceReadiness())

    const result = await runCiBranchPolicyValidation(
      workspace,
      [
        '--policy',
        '.tmp/ci-branch-policy.json',
        '--ci-branch-governance-readiness',
        '.tmp/ci-branch-governance-readiness.json',
      ],
      '.tmp/ci-branch-policy-validation.json',
    )
    const payload = JSON.parse(result.stdout)

    expect(result.exitCode).toBe(ExitCode.Success)
    expect(payload.requiredChecksPolicyValidation.workflowCandidateMatchCount).toBe(1)
    expect(payload.requiredChecksPolicyValidation.matchedChecks).toEqual(['validate'])
    expect(payload.requiredChecksPolicyValidation.unmappedDeclaredChecks).toEqual([])
    expect(payload.requiredChecksPolicyValidation.extraWorkflowCandidateChecks).toEqual(['Quality Gate'])
    expect(payload.sourceCiBranchGovernanceReadiness).toEqual(
      expect.objectContaining({
        supplied: true,
        artifactRole: 'devview-ci-branch-governance-readiness-report',
        status: 'devview-ci-branch-governance-readiness-reported',
        workflowInventoryFileCount: 1,
        candidateRequiredCheckCount: 2,
      }),
    )
    expect(payload.policyFindings.map((entry: { code: string }) => entry.code)).toContain(
      'CI_BRANCH_POLICY_GOVERNANCE_READINESS_LINKED',
    )
    expectSafetyFalse(payload)
  })

  it('reports unmapped declared checks as partial readiness without mutation', async () => {
    const workspace = createWorkspace()
    writeJson(
      join(workspace, '.tmp/ci-branch-policy.json'),
      ciBranchPolicy({
        requiredChecksPolicy: {
          requiredChecksPolicyPresent: true,
          requiredChecksConfigured: false,
          requiredChecksMutated: false,
          checks: [{ checkName: 'not-in-workflow', futureRequired: true }],
        },
      }),
    )
    writeJson(join(workspace, '.tmp/ci-branch-governance-readiness.json'), ciBranchGovernanceReadiness())

    const result = await runCiBranchPolicyValidation(
      workspace,
      [
        '--policy',
        '.tmp/ci-branch-policy.json',
        '--ci-branch-governance-readiness',
        '.tmp/ci-branch-governance-readiness.json',
      ],
      '.tmp/ci-branch-policy-validation.json',
    )
    const payload = JSON.parse(result.stdout)

    expect(result.exitCode).toBe(ExitCode.Success)
    expect(payload.ciBranchPolicyValidationStatus).toBe('partial-readiness-policy-needs-source-linkage')
    expect(payload.requiredChecksPolicyValidation.unmappedDeclaredChecks).toEqual(['not-in-workflow'])
    expect(payload.requiredChecksPolicyValidation.requiredChecksMutated).toBe(false)
    expect(payload.requiredChecksMutated).toBe(false)
    expect(payload.policyFindings.map((entry: { code: string }) => entry.code)).toContain(
      'CI_BRANCH_POLICY_DECLARED_CHECK_NOT_IN_WORKFLOW_INVENTORY',
    )
  })

  it('summarizes provider, RBAC, signing, and provenance prerequisite sources', async () => {
    const workspace = createWorkspace()
    writeJson(join(workspace, '.tmp/ci-branch-policy.json'), ciBranchPolicy())
    writeJson(join(workspace, '.tmp/provider-network-policy.json'), providerNetworkPolicyReport())
    writeJson(join(workspace, '.tmp/rbac-policy-validation.json'), rbacPolicyValidationReport())
    writeJson(join(workspace, '.tmp/signing-readiness.json'), signingReadinessReport())
    writeJson(join(workspace, '.tmp/provenance-verification-readiness.json'), provenanceVerificationReadinessReport())

    const result = await runCiBranchPolicyValidation(
      workspace,
      [
        '--policy',
        '.tmp/ci-branch-policy.json',
        '--provider-network-policy-report',
        '.tmp/provider-network-policy.json',
        '--rbac-policy-validation',
        '.tmp/rbac-policy-validation.json',
        '--signing-readiness',
        '.tmp/signing-readiness.json',
        '--provenance-verification-readiness',
        '.tmp/provenance-verification-readiness.json',
      ],
      '.tmp/ci-branch-policy-validation.json',
    )
    const payload = JSON.parse(result.stdout)

    expect(result.exitCode).toBe(ExitCode.Success)
    expect(payload.sourceProviderNetworkPolicy.defaultProviderPolicy).toBe('deny')
    expect(payload.sourceRbacPolicyValidation.actorCount).toBe(2)
    expect(payload.sourceSigningReadiness.signingReadinessStatus).toBe('not-ready-policy-and-key-governance-missing')
    expect(payload.sourceProvenanceVerificationReadiness.cryptographicSignatureVerified).toBe(false)
    expect(payload.providerNetworkPrerequisiteValidation.providerNetworkPolicyLinked).toBe(true)
    expect(payload.actorRbacPrerequisiteValidation.rbacPolicyValidationLinked).toBe(true)
    expectSafetyFalse(payload)
  })

  it('blocks wrong policy role/status and default allow policy with zero writes', async () => {
    const workspace = createWorkspace()
    writeJson(join(workspace, '.tmp/wrong-policy.json'), {
      ...ciBranchPolicy(),
      artifactRole: 'wrong',
    })
    writeJson(join(workspace, '.tmp/default-allow-policy.json'), {
      ...ciBranchPolicy(),
      defaultExternalCiPolicy: 'allow',
    })

    const wrong = await runCiBranchPolicyValidation(
      workspace,
      ['--policy', '.tmp/wrong-policy.json'],
      '.tmp/wrong-policy-validation.json',
    )
    const allow = await runCiBranchPolicyValidation(
      workspace,
      ['--policy', '.tmp/default-allow-policy.json'],
      '.tmp/default-allow-validation.json',
    )

    expect(wrong.exitCode).toBe(ExitCode.ValidationFailed)
    expect(JSON.parse(wrong.stderr).issues.map((entry: { code: string }) => entry.code)).toContain(
      'CI_BRANCH_POLICY_ROLE_STATUS_INVALID',
    )
    expect(existsSync(join(workspace, '.tmp/wrong-policy-validation.json'))).toBe(false)
    expect(allow.exitCode).toBe(ExitCode.ValidationFailed)
    expect(JSON.parse(allow.stderr).issues.map((entry: { code: string }) => entry.code)).toContain(
      'CI_BRANCH_POLICY_DEFAULT_EXTERNAL_CI_NOT_DENY',
    )
    expect(existsSync(join(workspace, '.tmp/default-allow-validation.json'))).toBe(false)
  })

  it('blocks mutation and authority claims with zero writes', async () => {
    const workspace = createWorkspace()
    const cases: Array<[string, Record<string, unknown>]> = [
      ['required-checks-configured', { requiredChecksPolicy: { requiredChecksConfigured: true } }],
      ['required-checks-mutated', { requiredChecksMutated: true }],
      ['branch-mutated', { branchProtectionPolicy: { branchProtectionMutated: true } }],
      ['external-ci', { externalCiMutated: true }],
      ['hooks', { hooksActivated: true }],
      ['provider', { providerInvoked: true }],
      ['rbac', { actorRequirements: { rbacEnforced: true } }],
      ['signing', { cryptographicSignatureVerified: true }],
      ['key', { keyGenerated: true }],
      ['provenance', { provenanceAttestationVerified: true }],
      ['gate', { enterpriseGateActivated: true }],
    ]

    for (const [name, override] of cases) {
      writeJson(join(workspace, `.tmp/${name}-policy.json`), ciBranchPolicy(override))
      const result = await runCiBranchPolicyValidation(
        workspace,
        ['--policy', `.tmp/${name}-policy.json`],
        `.tmp/${name}-policy-validation.json`,
      )
      expect(result.exitCode).toBe(ExitCode.ValidationFailed)
      const codes = JSON.parse(result.stderr).issues.map((entry: { code: string }) => entry.code)
      expect(codes.some((code: string) => code.startsWith('CI_BRANCH_POLICY_'))).toBe(true)
      expect(existsSync(join(workspace, `.tmp/${name}-policy-validation.json`))).toBe(false)
    }
  })

  it('blocks allowlists, executable instructions, key material, and wrong source role/status with zero writes', async () => {
    const workspace = createWorkspace()
    writeJson(join(workspace, '.tmp/allowlist-policy.json'), {
      ...ciBranchPolicy(),
      providerNetworkRequirements: { providerAllowlist: ['github'] },
    })
    writeJson(join(workspace, '.tmp/script-policy.json'), {
      ...ciBranchPolicy(),
      requiredChecksPolicy: {
        requiredChecksPolicyPresent: true,
        requiredChecksConfigured: false,
        requiredChecksMutated: false,
        checks: [{ checkName: 'validate', futureRequired: true, script: 'npm test' }],
      },
    })
    writeJson(join(workspace, '.tmp/key-policy.json'), { ...ciBranchPolicy(), privateKey: 'secret' })
    writeJson(join(workspace, '.tmp/ci-branch-policy.json'), ciBranchPolicy())
    writeJson(join(workspace, '.tmp/wrong-provider.json'), {
      ...providerNetworkPolicyReport(),
      status: 'wrong',
    })

    const allowlist = await runCiBranchPolicyValidation(
      workspace,
      ['--policy', '.tmp/allowlist-policy.json'],
      '.tmp/allowlist-validation.json',
    )
    const script = await runCiBranchPolicyValidation(
      workspace,
      ['--policy', '.tmp/script-policy.json'],
      '.tmp/script-validation.json',
    )
    const key = await runCiBranchPolicyValidation(
      workspace,
      ['--policy', '.tmp/key-policy.json'],
      '.tmp/key-validation.json',
    )
    const wrongSource = await runCiBranchPolicyValidation(
      workspace,
      ['--policy', '.tmp/ci-branch-policy.json', '--provider-network-policy-report', '.tmp/wrong-provider.json'],
      '.tmp/wrong-source-validation.json',
    )

    expect(allowlist.exitCode).toBe(ExitCode.ValidationFailed)
    expect(JSON.parse(allowlist.stderr).issues.map((entry: { code: string }) => entry.code)).toContain(
      'CI_BRANCH_POLICY_ALLOWLIST_UNSUPPORTED',
    )
    expect(script.exitCode).toBe(ExitCode.ValidationFailed)
    expect(JSON.parse(script.stderr).issues.map((entry: { code: string }) => entry.code)).toContain(
      'CI_BRANCH_POLICY_EXECUTABLE_INSTRUCTION_UNSUPPORTED',
    )
    expect(key.exitCode).toBe(ExitCode.ValidationFailed)
    expect(JSON.parse(key.stderr).issues.map((entry: { code: string }) => entry.code)).toContain(
      'CI_BRANCH_POLICY_KEY_OR_SIGNATURE_MATERIAL_UNSUPPORTED',
    )
    expect(wrongSource.exitCode).toBe(ExitCode.ValidationFailed)
    expect(JSON.parse(wrongSource.stderr).issues.map((entry: { code: string }) => entry.code)).toContain(
      'CI_BRANCH_POLICY_PROVIDER_NETWORK_SOURCE_ROLE_STATUS_INVALID',
    )
    expect(existsSync(join(workspace, '.tmp/allowlist-validation.json'))).toBe(false)
    expect(existsSync(join(workspace, '.tmp/script-validation.json'))).toBe(false)
    expect(existsSync(join(workspace, '.tmp/key-validation.json'))).toBe(false)
    expect(existsSync(join(workspace, '.tmp/wrong-source-validation.json'))).toBe(false)
  })

  it('blocks output collisions, source overwrite, policy overwrite, and protected paths', async () => {
    const workspace = createWorkspace()
    writeJson(join(workspace, '.tmp/ci-branch-policy.json'), ciBranchPolicy())

    const cases = [
      {
        output: '.tmp/collision.json',
        extra: ['--markdown', '.tmp/collision.json'],
      },
      {
        output: '.tmp/ci-branch-policy.json',
        extra: [],
      },
      {
        output: join('.devview', 'generated', 'ci-branch-policy-validation.json'),
        extra: [],
      },
      {
        output: 'ci-branch-policy.json',
        extra: [],
      },
    ]

    for (const entry of cases) {
      const result = await runCiBranchPolicyValidation(
        workspace,
        ['--policy', '.tmp/ci-branch-policy.json'],
        entry.output,
        entry.extra,
      )
      expect(result.exitCode).toBe(ExitCode.ValidationFailed)
    }
  })
})

function runCiBranchPolicyValidation(workspace: string, args: string[], output: string, extraArgs: string[] = []) {
  return runDevViewCli(['security', 'validate-ci-branch-policy', ...args, '--output', output, ...extraArgs, '--json'], {
    cwd: workspace,
    pluginRoot,
  })
}

function ciBranchPolicy(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    artifactRole: 'devview-ci-branch-policy',
    status: 'devview-ci-branch-policy-configured',
    policyScope: 'ci-branch-policy-validation-report-only',
    defaultExternalCiPolicy: 'deny',
    defaultBranchMutationPolicy: 'deny',
    activationMode: 'report-only-no-mutation',
    requiredChecksPolicy: {
      requiredChecksPolicyPresent: true,
      requiredChecksConfigured: false,
      requiredChecksMutated: false,
      checks: [
        {
          checkName: 'validate',
          sourceWorkflowPath: '.github/workflows/ci.yml',
          sourceJobId: 'validate',
          futureRequired: true,
          activationPrerequisite: 'future-explicit-provider-branch-protection-approval',
        },
      ],
    },
    branchProtectionPolicy: {
      branchProtectionPolicyPresent: true,
      branchProtectionChanged: false,
      branchProtectionMutated: false,
      targetBranches: ['main'],
      desiredRules: {
        requirePullRequestReviewsFutureOnly: true,
        requireStatusChecksFutureOnly: true,
      },
    },
    actorRequirements: {
      requiredRoles: ['maintainer', 'security-admin', 'auditor'],
      requiredFuturePermissions: ['external-ci.activation.approve'],
      rbacEnforced: false,
      permissionVerified: false,
    },
    providerNetworkRequirements: {
      defaultProviderPolicy: 'deny',
      defaultNetworkPolicy: 'deny',
      providerAllowlist: [],
      networkAllowlist: [],
    },
    futureActivationPrerequisites: [
      'signed CI/branch policy',
      'RBAC permission verification',
      'provider/network allow policy',
      'explicit branch protection approval',
      'audit record',
      'enterprise gate policy',
    ],
    requiredChecksConfigured: false,
    requiredChecksMutated: false,
    branchProtectionChanged: false,
    branchProtectionMutated: false,
    externalCiMutated: false,
    hooksActivated: false,
    providerInvoked: false,
    networkCallMade: false,
    apiCallMade: false,
    enterpriseGateActivated: false,
    ...overrides,
  }
}

function ciBranchGovernanceReadiness(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    artifactRole: 'devview-ci-branch-governance-readiness-report',
    status: 'devview-ci-branch-governance-readiness-reported',
    readinessScope: 'ci-branch-governance-readiness-report-only',
    ciBranchGovernanceReadinessStatus: 'report-only-readiness-recorded-not-enforced',
    workflowInventory: {
      sourceCount: 1,
      workflows: [],
      candidateRequiredChecks: ['validate', 'Quality Gate'],
      limitations: [],
    },
    requiredChecksGovernanceReadiness: {
      requiredChecksPolicyPresent: false,
      requiredChecksConfigured: false,
      requiredChecksMutated: false,
    },
    branchProtectionGovernanceReadiness: {
      branchProtectionPolicyPresent: false,
      branchProtectionChanged: false,
      branchProtectionMutated: false,
    },
    ciProviderGovernanceReadiness: {
      providerNetworkDefaultDenyLinked: true,
      providerInvoked: false,
      networkCallMade: false,
      apiCallMade: false,
    },
    scopeCiLifecycleBoundary: {
      externalCiMutation: false,
      requiredChecksConfigured: false,
      branchProtectionMutated: false,
      hooksActivated: false,
    },
    rbacPrerequisiteReadiness: {
      policyValidationLinked: true,
      rbacEnforced: false,
      permissionVerified: false,
    },
    signingAndProvenancePrerequisiteReadiness: {
      signingReadinessLinked: true,
      provenanceVerificationReadinessLinked: true,
      cryptographicSignatureVerified: false,
      realSlsaVerificationPerformed: false,
      realInTotoVerificationPerformed: false,
    },
    governanceFindings: [],
    downstreamActionPlan: [],
    ...safetyFlags(),
    ...overrides,
  }
}

function providerNetworkPolicyReport(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    artifactRole: 'devview-provider-network-default-deny-policy-report',
    status: 'devview-provider-network-default-deny-policy-recorded',
    defaultProviderPolicy: 'deny',
    defaultNetworkPolicy: 'deny',
    explicitAllowSupported: false,
    providerAllowlist: [],
    networkAllowlist: [],
    ...safetyFlags(),
    ...overrides,
  }
}

function rbacPolicyValidationReport(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    artifactRole: 'devview-rbac-policy-validation-report',
    status: 'devview-rbac-policy-validation-passed',
    rbacPolicyValidationStatus: 'passed',
    defaultDenyStatus: { defaultAuthorityPolicyDeny: true },
    actorSummary: { actorCount: 2 },
    roleAssignmentSummary: { assignmentCount: 2 },
    permissionGrantSummary: { grantCount: 2 },
    rbacEnforced: false,
    permissionVerified: false,
    ...safetyFlags(),
    ...overrides,
  }
}

function signingReadinessReport(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    artifactRole: 'devview-signing-readiness-report',
    status: 'devview-signing-readiness-reported',
    signingReadinessStatus: 'not-ready-policy-and-key-governance-missing',
    keyGovernanceReadiness: {
      keyRegistryPresent: false,
      trustRootPresent: false,
      privateKeyStoragePresent: false,
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

function provenanceVerificationReadinessReport(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    artifactRole: 'devview-provenance-verification-readiness-report',
    status: 'devview-provenance-verification-readiness-reported',
    provenanceVerificationReadinessStatus: 'not-ready-key-trust-and-signature-policy-missing',
    verificationBoundary: {
      realSlsaVerificationPerformed: false,
      realInTotoVerificationPerformed: false,
      cryptographicSignatureVerified: false,
      provenanceAttestationGenerated: false,
      provenanceAttestationVerified: false,
    },
    ...safetyFlags(),
    ...overrides,
  }
}

function safetyFlags(): Record<string, unknown> {
  return {
    githubMutated: false,
    githubWorkflowMutated: false,
    workflowExecuted: false,
    workflowsExecuted: false,
    branchProtectionChanged: false,
    branchProtectionMutated: false,
    requiredChecksConfigured: false,
    requiredChecksMutated: false,
    externalCiMutated: false,
    hooksActivated: false,
    ciProviderCalled: false,
    providerInvoked: false,
    networkCallMade: false,
    apiCallMade: false,
    shellCommandsExecuted: false,
    extensionExecutionAllowed: false,
    extensionsExecuted: false,
    cryptographicSignatureVerified: false,
    cryptographicSigningImplemented: false,
    keyGenerated: false,
    privateKeyStored: false,
    keyRegistryCreated: false,
    trustRootCreated: false,
    rbacEnforced: false,
    permissionVerified: false,
    rbacPermissionVerified: false,
    graphSourceMutated: false,
    graphDeltaApplied: false,
    runtimeEvidenceSatisfied: false,
    evidenceAccepted: false,
    equivalenceProven: false,
    scopeEnforced: false,
    ciEnforcementEnabled: false,
    approvalAutomationEnabled: false,
    userAcceptanceAutomated: false,
    enterpriseGateActivated: false,
  }
}

function expectSafetyFalse(payload: Record<string, unknown>): void {
  expect(payload.githubMutated).toBe(false)
  expect(payload.branchProtectionMutated).toBe(false)
  expect(payload.requiredChecksConfigured).toBe(false)
  expect(payload.requiredChecksMutated).toBe(false)
  expect(payload.externalCiMutated).toBe(false)
  expect(payload.hooksActivated).toBe(false)
  expect(payload.providerInvoked).toBe(false)
  expect(payload.networkCallMade).toBe(false)
  expect(payload.apiCallMade).toBe(false)
  expect(payload.rbacEnforced).toBe(false)
  expect(payload.permissionVerified).toBe(false)
  expect(payload.cryptographicSignatureVerified).toBe(false)
  expect(payload.enterpriseGateActivated).toBe(false)
}
