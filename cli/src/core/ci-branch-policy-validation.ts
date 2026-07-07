import { createHash } from 'node:crypto'
import path from 'node:path'
import { readFile } from 'node:fs/promises'
import { relativePath, writeJsonAtomic, writeTextAtomic } from './fs.js'
import {
  hasCodexControlDirectory,
  hasDevViewControlDirectory,
  hasHiddenControlDirectorySegment,
} from './path-safety.js'

type JsonRecord = Record<string, unknown>

const POLICY_ROLE = 'devview-ci-branch-policy'
const POLICY_STATUS = 'devview-ci-branch-policy-configured'
const POLICY_SCOPE = 'ci-branch-policy-validation-report-only'
const REPORT_ROLE = 'devview-ci-branch-policy-validation-report'
const PASSED_STATUS = 'devview-ci-branch-policy-validation-passed'
const BLOCKED_STATUS = 'devview-ci-branch-policy-validation-blocked'
const CI_BRANCH_GOVERNANCE_ROLE = 'devview-ci-branch-governance-readiness-report'
const CI_BRANCH_GOVERNANCE_STATUS = 'devview-ci-branch-governance-readiness-reported'
const PROVIDER_NETWORK_ROLE = 'devview-provider-network-default-deny-policy-report'
const PROVIDER_NETWORK_STATUS = 'devview-provider-network-default-deny-policy-recorded'
const RBAC_POLICY_VALIDATION_ROLE = 'devview-rbac-policy-validation-report'
const RBAC_POLICY_VALIDATION_STATUS = 'devview-rbac-policy-validation-passed'
const SIGNING_READINESS_ROLE = 'devview-signing-readiness-report'
const SIGNING_READINESS_STATUS = 'devview-signing-readiness-reported'
const PROVENANCE_VERIFICATION_READINESS_ROLE = 'devview-provenance-verification-readiness-report'
const PROVENANCE_VERIFICATION_READINESS_STATUS = 'devview-provenance-verification-readiness-reported'

const unsafeAuthorityFields = [
  'githubMutated',
  'githubWorkflowMutated',
  'workflowExecuted',
  'workflowsExecuted',
  'branchProtectionChanged',
  'branchProtectionMutated',
  'requiredChecksConfigured',
  'requiredChecksMutated',
  'externalCiMutated',
  'hooksActivated',
  'ciProviderCalled',
  'providerInvoked',
  'networkCallMade',
  'apiCallMade',
  'shellCommandExecuted',
  'shellCommandsExecuted',
  'extensionExecutionAllowed',
  'extensionsExecuted',
  'extensionCodeExecuted',
  'graphifyExecuted',
  'graphifyLiveRun',
  'nativeBenchmarkExecuted',
  'benchmarkExecuted',
  'candidateExecuted',
  'filesMutated',
  'graphSourceMutated',
  'graphDeltaApplied',
  'runtimeEvidenceSatisfied',
  'evidenceAccepted',
  'equivalenceProven',
  'scopeEnforced',
  'ciEnforcementEnabled',
  'diffRejectionEnabled',
  'diffRejectionActivated',
  'approvalAutomationEnabled',
  'userAcceptanceAutomated',
  'enterpriseGateActivated',
  'cryptographicSignaturePresent',
  'cryptographicSignatureVerified',
  'cryptographicSigningImplemented',
  'signedRecordEnvelopePresent',
  'keyGenerated',
  'privateKeyStored',
  'keyManagementImplemented',
  'keyRegistryPresent',
  'trustRootPresent',
  'keyRegistryCreated',
  'trustRootCreated',
  'signaturePolicyPresent',
  'signaturePolicyEnforced',
  'rbacEnforced',
  'permissionVerified',
  'rbacPermissionVerified',
  'packagePublished',
  'packageGeneratedByDevView',
  'packageArtifactGeneratedByDevView',
  'packageSigned',
  'sbomGenerated',
  'sbomGeneratedByDevView',
  'sbomAttested',
  'provenanceAttested',
  'provenanceAttestationGenerated',
  'provenanceAttestationGeneratedByDevView',
  'provenanceAttestationVerified',
  'realSlsaVerificationPerformed',
  'realInTotoVerificationPerformed',
]

const allowlistFields = [
  'providerAllowlist',
  'networkAllowlist',
  'apiAllowlist',
  'allowedProviders',
  'allowedNetworkHosts',
  'allowedApiEndpoints',
  'providerGrants',
  'networkGrants',
  'apiGrants',
]

const executableInstructionFields = [
  'script',
  'scripts',
  'shellCommand',
  'shellCommands',
  'command',
  'commands',
  'providerInstruction',
  'providerInstructions',
  'networkInstruction',
  'networkInstructions',
  'apiInstruction',
  'apiInstructions',
  'execute',
  'execution',
]

const keyMaterialFields = [
  'privateKey',
  'privateKeyPem',
  'privateKeyMaterial',
  'keyMaterial',
  'secretKey',
  'keySecret',
  'signature',
  'signatureValue',
  'signaturePath',
]

export interface CiBranchPolicyValidationOptions {
  policy?: string
  ciBranchGovernanceReadiness?: string
  providerNetworkPolicyReport?: string
  rbacPolicyValidation?: string
  signingReadiness?: string
  provenanceVerificationReadiness?: string
  output?: string
  markdown?: string
}

export interface CiBranchPolicyFinding {
  severity: 'blocker' | 'gap' | 'advisory' | 'satisfied'
  code: string
  message: string
  path?: string
  field?: string
}

type SourceKind =
  | 'policy'
  | 'ci-branch-governance-readiness'
  | 'provider-network-policy-report'
  | 'rbac-policy-validation'
  | 'signing-readiness'
  | 'provenance-verification-readiness'

interface LoadedSource {
  requestedPath: string
  resolvedPath: string
  relativePath: string
  sourceKind: SourceKind
  record: JsonRecord | null
  sha256: string | null
  byteLength: number | null
  readError: string | null
}

interface SourceSummary {
  supplied: boolean
  path: string | null
  artifactRole: string | null
  status: string | null
}

interface DeclaredCheck {
  checkName: string
  sourceWorkflowPath: string | null
  sourceJobId: string | null
  futureRequired: boolean | null
}

export interface CiBranchPolicyValidationReport extends JsonRecord {
  schemaVersion: 1
  artifactRole: typeof REPORT_ROLE
  status: typeof PASSED_STATUS | typeof BLOCKED_STATUS
  validationScope: typeof POLICY_SCOPE
  sourceFactsOnly: true
  reportOnly: true
  ciBranchPolicyValidationStatus:
    | 'passed-report-only-policy-not-enforced'
    | 'partial-readiness-policy-needs-source-linkage'
    | 'blocked-unsafe-authority-claim'
  sourcePolicy: SourceSummary & {
    policyScope: string | null
    sha256: string | null
    byteLength: number | null
    defaultExternalCiPolicy: string | null
    defaultBranchMutationPolicy: string | null
    activationMode: string | null
  }
  sourceCiBranchGovernanceReadiness: SourceSummary & {
    ciBranchGovernanceReadinessStatus: string | null
    workflowInventoryFileCount: number | null
    candidateRequiredCheckCount: number | null
  }
  sourceProviderNetworkPolicy: SourceSummary & {
    defaultProviderPolicy: string | null
    defaultNetworkPolicy: string | null
    explicitAllowSupported: boolean | null
    providerAllowlistCount: number | null
    networkAllowlistCount: number | null
  }
  sourceRbacPolicyValidation: SourceSummary & {
    rbacPolicyValidationStatus: string | null
    defaultDenyConfigured: boolean | null
    actorCount: number | null
    roleAssignmentCount: number | null
    permissionGrantCount: number | null
  }
  sourceSigningReadiness: SourceSummary & {
    signingReadinessStatus: string | null
    keyRegistryPresent: boolean | null
    trustRootPresent: boolean | null
    privateKeyStoragePresent: boolean | null
  }
  sourceProvenanceVerificationReadiness: SourceSummary & {
    provenanceVerificationReadinessStatus: string | null
    realSlsaVerificationPerformed: boolean | null
    realInTotoVerificationPerformed: boolean | null
    cryptographicSignatureVerified: boolean | null
  }
  requiredChecksPolicyValidation: JsonRecord
  branchProtectionPolicyValidation: JsonRecord
  actorRbacPrerequisiteValidation: JsonRecord
  providerNetworkPrerequisiteValidation: JsonRecord
  activationBoundary: JsonRecord
  policyFindings: CiBranchPolicyFinding[]
  downstreamActionPlan: string[]
  githubMutated: false
  githubWorkflowMutated: false
  workflowExecuted: false
  workflowsExecuted: false
  branchProtectionChanged: false
  branchProtectionMutated: false
  requiredChecksConfigured: false
  requiredChecksMutated: false
  externalCiMutated: false
  hooksActivated: false
  ciProviderCalled: false
  providerInvoked: false
  networkCallMade: false
  apiCallMade: false
  shellCommandsExecuted: false
  extensionExecutionAllowed: false
  extensionsExecuted: false
  cryptographicSignatureVerified: false
  cryptographicSigningImplemented: false
  keyGenerated: false
  privateKeyStored: false
  keyRegistryCreated: false
  trustRootCreated: false
  rbacEnforced: false
  permissionVerified: false
  rbacPermissionVerified: false
  graphSourceMutated: false
  graphDeltaApplied: false
  runtimeEvidenceSatisfied: false
  evidenceAccepted: false
  equivalenceProven: false
  scopeEnforced: false
  ciEnforcementEnabled: false
  approvalAutomationEnabled: false
  userAcceptanceAutomated: false
  enterpriseGateActivated: false
}

export class CiBranchPolicyValidationError extends Error {
  readonly report: CiBranchPolicyValidationReport

  constructor(report: CiBranchPolicyValidationReport) {
    super('CI/branch policy validation is blocked.')
    this.report = report
  }
}

export async function validateCiBranchPolicy(
  root: string,
  options: CiBranchPolicyValidationOptions,
): Promise<CiBranchPolicyValidationReport> {
  validateRequiredOptions(options)
  const normalized = normalizeSourceOptions(options)
  const sourcePaths = [
    normalized.policy,
    normalized.ciBranchGovernanceReadiness,
    normalized.providerNetworkPolicyReport,
    normalized.rbacPolicyValidation,
    normalized.signingReadiness,
    normalized.provenanceVerificationReadiness,
  ].filter((entry): entry is string => Boolean(entry))
  await assertOutputAuthority(root, sourcePaths, options)

  const policy = await loadSource(root, normalized.policy, 'policy')
  const ciBranchGovernanceReadiness = normalized.ciBranchGovernanceReadiness
    ? await loadSource(root, normalized.ciBranchGovernanceReadiness, 'ci-branch-governance-readiness')
    : null
  const providerNetworkPolicy = normalized.providerNetworkPolicyReport
    ? await loadSource(root, normalized.providerNetworkPolicyReport, 'provider-network-policy-report')
    : null
  const rbacPolicyValidation = normalized.rbacPolicyValidation
    ? await loadSource(root, normalized.rbacPolicyValidation, 'rbac-policy-validation')
    : null
  const signingReadiness = normalized.signingReadiness
    ? await loadSource(root, normalized.signingReadiness, 'signing-readiness')
    : null
  const provenanceVerificationReadiness = normalized.provenanceVerificationReadiness
    ? await loadSource(root, normalized.provenanceVerificationReadiness, 'provenance-verification-readiness')
    : null

  const blockingFindings = validateInputs(
    policy,
    ciBranchGovernanceReadiness,
    providerNetworkPolicy,
    rbacPolicyValidation,
    signingReadiness,
    provenanceVerificationReadiness,
  )
  if (blockingFindings.some((finding) => finding.severity === 'blocker')) {
    throw new CiBranchPolicyValidationError(
      buildReport(
        policy,
        ciBranchGovernanceReadiness,
        providerNetworkPolicy,
        rbacPolicyValidation,
        signingReadiness,
        provenanceVerificationReadiness,
        blockingFindings,
        true,
      ),
    )
  }

  const report = buildReport(
    policy,
    ciBranchGovernanceReadiness,
    providerNetworkPolicy,
    rbacPolicyValidation,
    signingReadiness,
    provenanceVerificationReadiness,
    buildFindings(
      policy,
      ciBranchGovernanceReadiness,
      providerNetworkPolicy,
      rbacPolicyValidation,
      signingReadiness,
      provenanceVerificationReadiness,
    ),
  )
  await writeJsonAtomic(resolveRepoPath(root, options.output!), report)
  if (options.markdown) {
    await writeTextAtomic(resolveRepoPath(root, options.markdown), renderMarkdown(report))
  }
  return report
}

function buildReport(
  policy: LoadedSource,
  ciBranchGovernanceReadiness: LoadedSource | null,
  providerNetworkPolicy: LoadedSource | null,
  rbacPolicyValidation: LoadedSource | null,
  signingReadiness: LoadedSource | null,
  provenanceVerificationReadiness: LoadedSource | null,
  findings: CiBranchPolicyFinding[],
  blocked = false,
): CiBranchPolicyValidationReport {
  const policyRecord = policy.record ?? {}
  const requiredChecksPolicy = asRecord(policyRecord.requiredChecksPolicy)
  const branchProtectionPolicy = asRecord(policyRecord.branchProtectionPolicy)
  const actorRequirements = asRecord(policyRecord.actorRequirements)
  const providerRequirements = asRecord(policyRecord.providerNetworkRequirements)
  const declaredChecks = declaredPolicyChecks(requiredChecksPolicy)
  const candidateChecks = candidateRequiredChecks(ciBranchGovernanceReadiness?.record)
  const declaredCheckNames = uniqueStrings(declaredChecks.map((entry) => entry.checkName))
  const candidateCheckNames = uniqueStrings(candidateChecks)
  const matchedChecks = declaredCheckNames.filter((entry) => candidateCheckNames.includes(entry))
  const unmappedDeclaredChecks = declaredCheckNames.filter((entry) => !candidateCheckNames.includes(entry))
  const extraWorkflowCandidateChecks = candidateCheckNames.filter((entry) => !declaredCheckNames.includes(entry))
  const partial = hasSafeGaps(findings)

  return {
    schemaVersion: 1,
    artifactRole: REPORT_ROLE,
    status: blocked ? BLOCKED_STATUS : PASSED_STATUS,
    validationScope: POLICY_SCOPE,
    sourceFactsOnly: true,
    reportOnly: true,
    ciBranchPolicyValidationStatus: blocked
      ? 'blocked-unsafe-authority-claim'
      : partial
        ? 'partial-readiness-policy-needs-source-linkage'
        : 'passed-report-only-policy-not-enforced',
    sourcePolicy: {
      supplied: true,
      path: policy.relativePath,
      artifactRole: stringValue(policyRecord.artifactRole),
      status: stringValue(policyRecord.status),
      policyScope: stringValue(policyRecord.policyScope),
      sha256: policy.sha256,
      byteLength: policy.byteLength,
      defaultExternalCiPolicy: stringValue(policyRecord.defaultExternalCiPolicy),
      defaultBranchMutationPolicy: stringValue(policyRecord.defaultBranchMutationPolicy),
      activationMode: stringValue(policyRecord.activationMode),
    },
    sourceCiBranchGovernanceReadiness: ciBranchGovernanceReadinessSummary(ciBranchGovernanceReadiness),
    sourceProviderNetworkPolicy: providerNetworkPolicySummary(providerNetworkPolicy),
    sourceRbacPolicyValidation: rbacPolicyValidationSummary(rbacPolicyValidation),
    sourceSigningReadiness: signingReadinessSummary(signingReadiness),
    sourceProvenanceVerificationReadiness: provenanceVerificationReadinessSummary(provenanceVerificationReadiness),
    requiredChecksPolicyValidation: {
      requiredChecksPolicyPresent: booleanValue(requiredChecksPolicy?.requiredChecksPolicyPresent) ?? false,
      requiredChecksConfigured: false,
      requiredChecksMutated: false,
      declaredCheckCount: declaredCheckNames.length,
      declaredChecks,
      workflowCandidateCheckCount: candidateCheckNames.length,
      workflowCandidateChecks: candidateCheckNames,
      workflowCandidateMatchCount: matchedChecks.length,
      matchedChecks,
      unmappedDeclaredChecks,
      extraWorkflowCandidateChecks,
      readinessSourceLinked: Boolean(ciBranchGovernanceReadiness),
    },
    branchProtectionPolicyValidation: {
      branchProtectionPolicyPresent: booleanValue(branchProtectionPolicy?.branchProtectionPolicyPresent) ?? false,
      targetBranchCount: stringArray(branchProtectionPolicy?.targetBranches).length,
      targetBranches: stringArray(branchProtectionPolicy?.targetBranches),
      desiredFutureRuleCount: desiredFutureRuleCount(branchProtectionPolicy),
      branchProtectionChanged: false,
      branchProtectionMutated: false,
    },
    actorRbacPrerequisiteValidation: {
      requiredRoles: stringArray(actorRequirements?.requiredRoles),
      requiredFuturePermissions: stringArray(actorRequirements?.requiredFuturePermissions),
      rbacPolicyValidationLinked: Boolean(rbacPolicyValidation),
      rbacEnforced: false,
      permissionVerified: false,
    },
    providerNetworkPrerequisiteValidation: {
      providerNetworkPolicyLinked: Boolean(providerNetworkPolicy),
      defaultProviderPolicy: stringValue(providerRequirements?.defaultProviderPolicy),
      defaultNetworkPolicy: stringValue(providerRequirements?.defaultNetworkPolicy),
      providerAllowlistCount: arrayLength(providerRequirements?.providerAllowlist) ?? 0,
      networkAllowlistCount: arrayLength(providerRequirements?.networkAllowlist) ?? 0,
      providerInvoked: false,
      networkCallMade: false,
      apiCallMade: false,
    },
    activationBoundary: {
      activationMode: stringValue(policyRecord.activationMode),
      reportOnly: true,
      externalCiMutation: false,
      requiredChecksConfigured: false,
      requiredChecksMutated: false,
      branchProtectionChanged: false,
      branchProtectionMutated: false,
      hooksActivated: false,
      providerInvoked: false,
      networkCallMade: false,
      apiCallMade: false,
      enterpriseGateActivated: false,
      futureActivationPrerequisites: stringArray(policyRecord.futureActivationPrerequisites),
    },
    policyFindings: findings,
    downstreamActionPlan: downstreamActionPlan(findings),
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

function validateInputs(
  policy: LoadedSource,
  ciBranchGovernanceReadiness: LoadedSource | null,
  providerNetworkPolicy: LoadedSource | null,
  rbacPolicyValidation: LoadedSource | null,
  signingReadiness: LoadedSource | null,
  provenanceVerificationReadiness: LoadedSource | null,
): CiBranchPolicyFinding[] {
  const findings: CiBranchPolicyFinding[] = []
  for (const source of [
    policy,
    ciBranchGovernanceReadiness,
    providerNetworkPolicy,
    rbacPolicyValidation,
    signingReadiness,
    provenanceVerificationReadiness,
  ].filter((entry): entry is LoadedSource => Boolean(entry))) {
    if (source.readError) {
      findings.push(blockingFinding('CI_BRANCH_POLICY_SOURCE_READ_FAILED', source.readError, source.relativePath))
      continue
    }
    if (!source.record) {
      findings.push(
        blockingFinding(
          'CI_BRANCH_POLICY_SOURCE_NOT_JSON_OBJECT',
          `${source.relativePath} must be a JSON object.`,
          source.relativePath,
        ),
      )
      continue
    }
    validateRoleStatus(source, source.record, findings)
    validateUnsafeClaims(source, source.record, findings)
  }
  if (policy.record) validatePolicyShape(policy, policy.record, findings)
  if (providerNetworkPolicy?.record)
    validateProviderNetworkSource(providerNetworkPolicy, providerNetworkPolicy.record, findings)
  return findings
}

function validateRoleStatus(source: LoadedSource, record: JsonRecord, findings: CiBranchPolicyFinding[]): void {
  const role = stringValue(record.artifactRole)
  const status = stringValue(record.status)
  const expected = expectedRoleStatus(source.sourceKind)
  if (role !== expected.role || status !== expected.status) {
    findings.push(
      blockingFinding(
        `${findingPrefix(source.sourceKind)}_ROLE_STATUS_INVALID`,
        `${source.relativePath} must be ${expected.role} with status ${expected.status}.`,
        source.relativePath,
      ),
    )
  }
}

function validatePolicyShape(source: LoadedSource, record: JsonRecord, findings: CiBranchPolicyFinding[]): void {
  if (record.policyScope !== POLICY_SCOPE) {
    findings.push(
      blockingFinding(
        'CI_BRANCH_POLICY_SCOPE_INVALID',
        `${source.relativePath} must use policyScope ${POLICY_SCOPE}.`,
        source.relativePath,
        'policyScope',
      ),
    )
  }
  if (record.defaultExternalCiPolicy !== 'deny') {
    findings.push(
      blockingFinding(
        'CI_BRANCH_POLICY_DEFAULT_EXTERNAL_CI_NOT_DENY',
        'CI/branch policy must keep defaultExternalCiPolicy set to deny.',
        source.relativePath,
        'defaultExternalCiPolicy',
      ),
    )
  }
  if (record.defaultBranchMutationPolicy !== 'deny') {
    findings.push(
      blockingFinding(
        'CI_BRANCH_POLICY_DEFAULT_BRANCH_MUTATION_NOT_DENY',
        'CI/branch policy must keep defaultBranchMutationPolicy set to deny.',
        source.relativePath,
        'defaultBranchMutationPolicy',
      ),
    )
  }
  if (record.activationMode !== 'report-only-no-mutation') {
    findings.push(
      blockingFinding(
        'CI_BRANCH_POLICY_ACTIVATION_MODE_UNSUPPORTED',
        'CI/branch policy activationMode must be report-only-no-mutation.',
        source.relativePath,
        'activationMode',
      ),
    )
  }
}

function validateProviderNetworkSource(
  source: LoadedSource,
  record: JsonRecord,
  findings: CiBranchPolicyFinding[],
): void {
  if (record.defaultProviderPolicy !== 'deny' || record.defaultNetworkPolicy !== 'deny') {
    findings.push(
      blockingFinding(
        'CI_BRANCH_POLICY_PROVIDER_NETWORK_SOURCE_NOT_DENY',
        `${source.relativePath} must keep provider and network defaults deny.`,
        source.relativePath,
      ),
    )
  }
  for (const field of ['providerAllowlist', 'networkAllowlist']) {
    const value = record[field]
    if (Array.isArray(value) && value.length > 0) {
      findings.push(
        blockingFinding(
          'CI_BRANCH_POLICY_PROVIDER_NETWORK_ALLOWLIST_UNSUPPORTED',
          `${source.relativePath} has non-empty ${field}; CI/branch policy v1 accepts default-deny only.`,
          source.relativePath,
          field,
        ),
      )
    }
  }
}

function validateUnsafeClaims(source: LoadedSource, record: JsonRecord, findings: CiBranchPolicyFinding[]): void {
  for (const hit of collectTrueFieldHits(record, unsafeAuthorityFields)) {
    findings.push(
      blockingFinding(
        'CI_BRANCH_POLICY_UNSAFE_AUTHORITY_CLAIM',
        `${source.relativePath} claims ${hit.path}: true; CI/branch policy validation is report-only.`,
        source.relativePath,
        hit.path,
      ),
    )
  }
  for (const hit of collectNonEmptyFieldHits(record, allowlistFields)) {
    findings.push(
      blockingFinding(
        'CI_BRANCH_POLICY_ALLOWLIST_UNSUPPORTED',
        `${source.relativePath} has non-empty ${hit.path}; provider/network/API allowlists are future-only.`,
        source.relativePath,
        hit.path,
      ),
    )
  }
  for (const hit of collectPresentFieldHits(record, keyMaterialFields)) {
    findings.push(
      blockingFinding(
        'CI_BRANCH_POLICY_KEY_OR_SIGNATURE_MATERIAL_UNSUPPORTED',
        `${source.relativePath} contains ${hit.path}; key/signature material is not accepted in CI/branch policy validation.`,
        source.relativePath,
        hit.path,
      ),
    )
  }
  for (const hit of collectPresentFieldHits(record, executableInstructionFields)) {
    findings.push(
      blockingFinding(
        'CI_BRANCH_POLICY_EXECUTABLE_INSTRUCTION_UNSUPPORTED',
        `${source.relativePath} contains ${hit.path}; executable/provider/network instructions are not accepted.`,
        source.relativePath,
        hit.path,
      ),
    )
  }
}

function buildFindings(
  policy: LoadedSource,
  ciBranchGovernanceReadiness: LoadedSource | null,
  providerNetworkPolicy: LoadedSource | null,
  rbacPolicyValidation: LoadedSource | null,
  signingReadiness: LoadedSource | null,
  provenanceVerificationReadiness: LoadedSource | null,
): CiBranchPolicyFinding[] {
  const findings: CiBranchPolicyFinding[] = [
    satisfiedFinding(
      'CI_BRANCH_POLICY_DEFAULT_DENY_RECORDED',
      'CI/branch policy is recorded with default deny external CI and branch mutation posture.',
      policy.relativePath,
    ),
    satisfiedFinding(
      'CI_BRANCH_POLICY_NO_MUTATION_BOUNDARY_RECORDED',
      'CI/branch policy validation records desired policy only; no required checks, branch protection, hooks, or provider calls are performed.',
      policy.relativePath,
    ),
  ]
  const policyRecord = policy.record ?? {}
  const declaredChecks = uniqueStrings(
    declaredPolicyChecks(asRecord(policyRecord.requiredChecksPolicy)).map((entry) => entry.checkName),
  )
  const candidates = uniqueStrings(candidateRequiredChecks(ciBranchGovernanceReadiness?.record))
  if (!ciBranchGovernanceReadiness) {
    findings.push(
      gapFinding(
        'CI_BRANCH_POLICY_GOVERNANCE_READINESS_NOT_SUPPLIED',
        'CI/branch governance readiness source was not supplied; workflow candidate check alignment is limited.',
      ),
    )
  } else {
    findings.push(
      satisfiedFinding(
        'CI_BRANCH_POLICY_GOVERNANCE_READINESS_LINKED',
        'CI/branch governance readiness source is linked for workflow candidate alignment.',
        ciBranchGovernanceReadiness.relativePath,
      ),
    )
  }
  const unmapped = declaredChecks.filter((entry) => !candidates.includes(entry))
  for (const check of unmapped) {
    findings.push(
      gapFinding(
        'CI_BRANCH_POLICY_DECLARED_CHECK_NOT_IN_WORKFLOW_INVENTORY',
        `Declared required check ${check} is not present in the supplied workflow inventory.`,
        policy.relativePath,
        'requiredChecksPolicy.checks',
      ),
    )
  }
  const extras = candidates.filter((entry) => !declaredChecks.includes(entry))
  for (const check of extras) {
    findings.push(
      advisoryFinding(
        'CI_BRANCH_POLICY_WORKFLOW_CANDIDATE_NOT_REQUIRED',
        `Workflow candidate check ${check} is not declared as a future required check in policy.`,
        ciBranchGovernanceReadiness?.relativePath,
        'workflowInventory.candidateRequiredChecks',
      ),
    )
  }
  if (!providerNetworkPolicy) {
    findings.push(
      gapFinding(
        'CI_BRANCH_POLICY_PROVIDER_NETWORK_POLICY_NOT_SUPPLIED',
        'Provider/network default-deny source was not supplied; future CI activation still needs provider/network governance.',
      ),
    )
  } else {
    findings.push(
      satisfiedFinding(
        'CI_BRANCH_POLICY_PROVIDER_NETWORK_POLICY_LINKED',
        'Provider/network default-deny source is linked.',
        providerNetworkPolicy.relativePath,
      ),
    )
  }
  if (!rbacPolicyValidation) {
    findings.push(
      gapFinding(
        'CI_BRANCH_POLICY_RBAC_POLICY_VALIDATION_NOT_SUPPLIED',
        'RBAC policy validation source was not supplied; future external CI activation approval remains unverified.',
      ),
    )
  } else {
    findings.push(
      satisfiedFinding(
        'CI_BRANCH_POLICY_RBAC_POLICY_VALIDATION_LINKED',
        'RBAC policy validation source is linked without enforcement.',
        rbacPolicyValidation.relativePath,
      ),
    )
  }
  if (!signingReadiness) {
    findings.push(gapFinding('CI_BRANCH_POLICY_SIGNING_READINESS_NOT_SUPPLIED', 'Signing readiness was not supplied.'))
  }
  if (!provenanceVerificationReadiness) {
    findings.push(
      gapFinding(
        'CI_BRANCH_POLICY_PROVENANCE_VERIFICATION_READINESS_NOT_SUPPLIED',
        'Provenance verification readiness was not supplied.',
      ),
    )
  }
  return findings
}

function ciBranchGovernanceReadinessSummary(
  source: LoadedSource | null,
): CiBranchPolicyValidationReport['sourceCiBranchGovernanceReadiness'] {
  if (!source?.record) {
    return {
      supplied: false,
      path: null,
      artifactRole: null,
      status: null,
      ciBranchGovernanceReadinessStatus: null,
      workflowInventoryFileCount: null,
      candidateRequiredCheckCount: null,
    }
  }
  const workflowInventory = asRecord(source.record.workflowInventory)
  return {
    supplied: true,
    path: source.relativePath,
    artifactRole: stringValue(source.record.artifactRole),
    status: stringValue(source.record.status),
    ciBranchGovernanceReadinessStatus: stringValue(source.record.ciBranchGovernanceReadinessStatus),
    workflowInventoryFileCount: numberValue(workflowInventory?.sourceCount),
    candidateRequiredCheckCount: arrayLength(workflowInventory?.candidateRequiredChecks),
  }
}

function providerNetworkPolicySummary(
  source: LoadedSource | null,
): CiBranchPolicyValidationReport['sourceProviderNetworkPolicy'] {
  if (!source?.record) {
    return {
      supplied: false,
      path: null,
      artifactRole: null,
      status: null,
      defaultProviderPolicy: null,
      defaultNetworkPolicy: null,
      explicitAllowSupported: null,
      providerAllowlistCount: null,
      networkAllowlistCount: null,
    }
  }
  return {
    supplied: true,
    path: source.relativePath,
    artifactRole: stringValue(source.record.artifactRole),
    status: stringValue(source.record.status),
    defaultProviderPolicy: stringValue(source.record.defaultProviderPolicy),
    defaultNetworkPolicy: stringValue(source.record.defaultNetworkPolicy),
    explicitAllowSupported: booleanValue(source.record.explicitAllowSupported),
    providerAllowlistCount: arrayLength(source.record.providerAllowlist),
    networkAllowlistCount: arrayLength(source.record.networkAllowlist),
  }
}

function rbacPolicyValidationSummary(
  source: LoadedSource | null,
): CiBranchPolicyValidationReport['sourceRbacPolicyValidation'] {
  if (!source?.record) {
    return {
      supplied: false,
      path: null,
      artifactRole: null,
      status: null,
      rbacPolicyValidationStatus: null,
      defaultDenyConfigured: null,
      actorCount: null,
      roleAssignmentCount: null,
      permissionGrantCount: null,
    }
  }
  return {
    supplied: true,
    path: source.relativePath,
    artifactRole: stringValue(source.record.artifactRole),
    status: stringValue(source.record.status),
    rbacPolicyValidationStatus: stringValue(source.record.rbacPolicyValidationStatus),
    defaultDenyConfigured: booleanValue(asRecord(source.record.defaultDenyStatus)?.defaultAuthorityPolicyDeny),
    actorCount: numberValue(asRecord(source.record.actorSummary)?.actorCount),
    roleAssignmentCount: numberValue(asRecord(source.record.roleAssignmentSummary)?.assignmentCount),
    permissionGrantCount: numberValue(asRecord(source.record.permissionGrantSummary)?.grantCount),
  }
}

function signingReadinessSummary(
  source: LoadedSource | null,
): CiBranchPolicyValidationReport['sourceSigningReadiness'] {
  if (!source?.record) {
    return {
      supplied: false,
      path: null,
      artifactRole: null,
      status: null,
      signingReadinessStatus: null,
      keyRegistryPresent: null,
      trustRootPresent: null,
      privateKeyStoragePresent: null,
    }
  }
  const keyGovernance = asRecord(source.record.keyGovernanceReadiness)
  return {
    supplied: true,
    path: source.relativePath,
    artifactRole: stringValue(source.record.artifactRole),
    status: stringValue(source.record.status),
    signingReadinessStatus: stringValue(source.record.signingReadinessStatus),
    keyRegistryPresent: booleanValue(keyGovernance?.keyRegistryPresent),
    trustRootPresent: booleanValue(keyGovernance?.trustRootPresent),
    privateKeyStoragePresent: booleanValue(keyGovernance?.privateKeyStoragePresent),
  }
}

function provenanceVerificationReadinessSummary(
  source: LoadedSource | null,
): CiBranchPolicyValidationReport['sourceProvenanceVerificationReadiness'] {
  if (!source?.record) {
    return {
      supplied: false,
      path: null,
      artifactRole: null,
      status: null,
      provenanceVerificationReadinessStatus: null,
      realSlsaVerificationPerformed: null,
      realInTotoVerificationPerformed: null,
      cryptographicSignatureVerified: null,
    }
  }
  const boundary = asRecord(source.record.verificationBoundary)
  return {
    supplied: true,
    path: source.relativePath,
    artifactRole: stringValue(source.record.artifactRole),
    status: stringValue(source.record.status),
    provenanceVerificationReadinessStatus: stringValue(source.record.provenanceVerificationReadinessStatus),
    realSlsaVerificationPerformed: booleanValue(boundary?.realSlsaVerificationPerformed),
    realInTotoVerificationPerformed: booleanValue(boundary?.realInTotoVerificationPerformed),
    cryptographicSignatureVerified: booleanValue(boundary?.cryptographicSignatureVerified),
  }
}

function declaredPolicyChecks(requiredChecksPolicy: JsonRecord | null): DeclaredCheck[] {
  return recordArray(requiredChecksPolicy?.checks)
    .map((entry) => ({
      checkName: stringValue(entry.checkName) ?? '',
      sourceWorkflowPath: stringValue(entry.sourceWorkflowPath),
      sourceJobId: stringValue(entry.sourceJobId),
      futureRequired: booleanValue(entry.futureRequired),
    }))
    .filter((entry) => entry.checkName.length > 0)
}

function candidateRequiredChecks(record: JsonRecord | null | undefined): string[] {
  const inventory = asRecord(record?.workflowInventory)
  return stringArray(inventory?.candidateRequiredChecks)
}

function desiredFutureRuleCount(branchProtectionPolicy: JsonRecord | null): number {
  const desiredRules = asRecord(branchProtectionPolicy?.desiredRules)
  if (!desiredRules) return 0
  return Object.entries(desiredRules).filter(([key, value]) => key.endsWith('FutureOnly') && value === true).length
}

function hasSafeGaps(findings: CiBranchPolicyFinding[]): boolean {
  return findings.some((entry) => entry.severity === 'gap' || entry.severity === 'advisory')
}

function downstreamActionPlan(findings: CiBranchPolicyFinding[]): string[] {
  const actions = new Set<string>()
  if (findings.some((entry) => entry.severity === 'blocker')) {
    actions.add('Fix unsafe CI/branch policy role/status, default-deny, no-mutation, allowlist, or authority blockers.')
  }
  if (findings.some((entry) => entry.code.includes('GOVERNANCE_READINESS'))) {
    actions.add('Attach CI/branch governance readiness to align future required checks with workflow inventory.')
  }
  if (findings.some((entry) => entry.code.includes('PROVIDER_NETWORK'))) {
    actions.add('Attach provider/network default-deny policy before planning any external CI provider activation.')
  }
  if (findings.some((entry) => entry.code.includes('RBAC'))) {
    actions.add('Attach RBAC policy validation before future external CI activation approval.')
  }
  actions.add('Keep required checks, branch protection, hooks, provider/API calls, and enterprise gates disabled.')
  actions.add('Use this report as a source fact for a later enterprise readiness visibility slice.')
  return [...actions]
}

function expectedRoleStatus(sourceKind: SourceKind): { role: string; status: string } {
  switch (sourceKind) {
    case 'policy':
      return { role: POLICY_ROLE, status: POLICY_STATUS }
    case 'ci-branch-governance-readiness':
      return { role: CI_BRANCH_GOVERNANCE_ROLE, status: CI_BRANCH_GOVERNANCE_STATUS }
    case 'provider-network-policy-report':
      return { role: PROVIDER_NETWORK_ROLE, status: PROVIDER_NETWORK_STATUS }
    case 'rbac-policy-validation':
      return { role: RBAC_POLICY_VALIDATION_ROLE, status: RBAC_POLICY_VALIDATION_STATUS }
    case 'signing-readiness':
      return { role: SIGNING_READINESS_ROLE, status: SIGNING_READINESS_STATUS }
    case 'provenance-verification-readiness':
      return { role: PROVENANCE_VERIFICATION_READINESS_ROLE, status: PROVENANCE_VERIFICATION_READINESS_STATUS }
  }
}

function findingPrefix(sourceKind: SourceKind): string {
  switch (sourceKind) {
    case 'policy':
      return 'CI_BRANCH_POLICY'
    case 'ci-branch-governance-readiness':
      return 'CI_BRANCH_POLICY_GOVERNANCE_READINESS_SOURCE'
    case 'provider-network-policy-report':
      return 'CI_BRANCH_POLICY_PROVIDER_NETWORK_SOURCE'
    case 'rbac-policy-validation':
      return 'CI_BRANCH_POLICY_RBAC_POLICY_VALIDATION_SOURCE'
    case 'signing-readiness':
      return 'CI_BRANCH_POLICY_SIGNING_READINESS_SOURCE'
    case 'provenance-verification-readiness':
      return 'CI_BRANCH_POLICY_PROVENANCE_VERIFICATION_READINESS_SOURCE'
  }
}

async function loadSource(root: string, filePath: string, sourceKind: SourceKind): Promise<LoadedSource> {
  const resolvedPath = resolveRepoPath(root, filePath)
  const relative = relativePath(root, resolvedPath)
  try {
    const bytes = await readFile(resolvedPath)
    const text = bytes.toString('utf8')
    const parsed = JSON.parse(text.replace(/^\uFEFF/, '')) as unknown
    return {
      requestedPath: filePath,
      resolvedPath,
      relativePath: relative,
      sourceKind,
      record: isJsonRecord(parsed) ? parsed : null,
      sha256: createHash('sha256').update(bytes).digest('hex'),
      byteLength: bytes.byteLength,
      readError: null,
    }
  } catch (error) {
    return {
      requestedPath: filePath,
      resolvedPath,
      relativePath: relative,
      sourceKind,
      record: null,
      sha256: null,
      byteLength: null,
      readError: error instanceof Error ? error.message : String(error),
    }
  }
}

function validateRequiredOptions(options: CiBranchPolicyValidationOptions): void {
  if (!options.policy) {
    throw new Error('security validate-ci-branch-policy requires --policy <json>.')
  }
  if (!options.output) {
    throw new Error('security validate-ci-branch-policy requires --output <json>.')
  }
}

function normalizeSourceOptions(
  options: CiBranchPolicyValidationOptions,
): Required<Pick<CiBranchPolicyValidationOptions, 'policy'>> &
  Omit<CiBranchPolicyValidationOptions, 'policy' | 'output' | 'markdown'> {
  return {
    policy: singleRequiredPath(options.policy, '--policy'),
    ciBranchGovernanceReadiness: singleOptionalPath(
      options.ciBranchGovernanceReadiness,
      '--ci-branch-governance-readiness',
    ),
    providerNetworkPolicyReport: singleOptionalPath(
      options.providerNetworkPolicyReport,
      '--provider-network-policy-report',
    ),
    rbacPolicyValidation: singleOptionalPath(options.rbacPolicyValidation, '--rbac-policy-validation'),
    signingReadiness: singleOptionalPath(options.signingReadiness, '--signing-readiness'),
    provenanceVerificationReadiness: singleOptionalPath(
      options.provenanceVerificationReadiness,
      '--provenance-verification-readiness',
    ),
  }
}

function singleRequiredPath(value: string | undefined, optionName: string): string {
  const entry = singleOptionalPath(value, optionName)
  if (!entry) throw new Error(`${optionName} is required for security validate-ci-branch-policy.`)
  return entry
}

function singleOptionalPath(value: string | undefined, optionName: string): string | undefined {
  const entries = splitPathList(value)
  if (entries.length > 1) {
    throw new Error(`${optionName} accepts one file for security validate-ci-branch-policy v1.`)
  }
  return entries[0]
}

function splitPathList(value: string | undefined): string[] {
  if (!value) return []
  return value
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean)
}

async function assertOutputAuthority(
  root: string,
  sourcePaths: string[],
  options: Pick<CiBranchPolicyValidationOptions, 'output' | 'markdown'>,
): Promise<void> {
  const outputPath = options.output ? resolveRepoPath(root, options.output) : null
  const markdownPath = options.markdown ? resolveRepoPath(root, options.markdown) : null
  if (!outputPath) throw new Error('security validate-ci-branch-policy requires --output <json>.')
  if (markdownPath && path.resolve(outputPath) === path.resolve(markdownPath)) {
    throw new Error('CI/branch policy validation JSON output and Markdown output must be different paths.')
  }
  const resolvedSources = sourcePaths.map((entry) => path.resolve(resolveRepoPath(root, entry)))
  for (const target of [outputPath, markdownPath].filter((entry): entry is string => Boolean(entry))) {
    const relativeTarget = relativePath(root, target)
    if (resolvedSources.some((source) => source === path.resolve(target))) {
      throw new Error(`CI/branch policy validation output ${relativeTarget} would overwrite a source input.`)
    }
    if (
      hasDevViewControlDirectory(relativeTarget) ||
      hasCodexControlDirectory(relativeTarget) ||
      hasHiddenControlDirectorySegment(relativeTarget)
    ) {
      throw new Error(`CI/branch policy validation output ${relativeTarget} is inside a protected control path.`)
    }
    if (looksLikeSourceAuthorityPath(relativeTarget)) {
      throw new Error(`CI/branch policy validation output ${relativeTarget} looks like a source authority artifact.`)
    }
  }
}

function renderMarkdown(report: CiBranchPolicyValidationReport): string {
  return [
    '# DevView CI / Branch Policy Validation',
    '',
    `- status: ${report.status}`,
    `- validationStatus: ${report.ciBranchPolicyValidationStatus}`,
    `- declaredChecks: ${report.requiredChecksPolicyValidation.declaredCheckCount}`,
    `- workflowCandidateMatches: ${report.requiredChecksPolicyValidation.workflowCandidateMatchCount}`,
    `- branchProtectionPolicyPresent: ${report.branchProtectionPolicyValidation.branchProtectionPolicyPresent}`,
    `- providerNetworkPolicyLinked: ${report.providerNetworkPrerequisiteValidation.providerNetworkPolicyLinked}`,
    '',
    '## Non-Mutation Boundary',
    '- githubMutated: false',
    '- branchProtectionMutated: false',
    '- requiredChecksConfigured: false',
    '- requiredChecksMutated: false',
    '- externalCiMutated: false',
    '- hooksActivated: false',
    '- providerInvoked: false',
    '- networkCallMade: false',
    '- apiCallMade: false',
    '- rbacEnforced: false',
    '- cryptographicSignatureVerified: false',
    '',
    '## Findings',
    ...report.policyFindings.map((finding) => `- [${finding.severity}] ${finding.code}: ${finding.message}`),
    '',
  ].join('\n')
}

function blockingFinding(code: string, message: string, pathValue?: string, field?: string): CiBranchPolicyFinding {
  return { severity: 'blocker', code, message, path: pathValue, field }
}

function gapFinding(code: string, message: string, pathValue?: string, field?: string): CiBranchPolicyFinding {
  return { severity: 'gap', code, message, path: pathValue, field }
}

function advisoryFinding(code: string, message: string, pathValue?: string, field?: string): CiBranchPolicyFinding {
  return { severity: 'advisory', code, message, path: pathValue, field }
}

function satisfiedFinding(code: string, message: string, pathValue?: string, field?: string): CiBranchPolicyFinding {
  return { severity: 'satisfied', code, message, path: pathValue, field }
}

function collectTrueFieldHits(
  value: unknown,
  fieldNames: string[],
  pathParts: string[] = [],
  seen = new Set<unknown>(),
): Array<{ field: string; path: string }> {
  if (!value || typeof value !== 'object') return []
  if (seen.has(value)) return []
  seen.add(value)
  const hits: Array<{ field: string; path: string }> = []
  for (const [key, entry] of Object.entries(value as JsonRecord)) {
    const nextPath = [...pathParts, key]
    if (fieldNames.includes(key) && entry === true) {
      hits.push({ field: key, path: nextPath.join('.') })
    }
    if (entry && typeof entry === 'object') {
      hits.push(...collectTrueFieldHits(entry, fieldNames, nextPath, seen))
    }
  }
  return hits
}

function collectNonEmptyFieldHits(
  value: unknown,
  fieldNames: string[],
  pathParts: string[] = [],
  seen = new Set<unknown>(),
): Array<{ field: string; path: string }> {
  if (!value || typeof value !== 'object') return []
  if (seen.has(value)) return []
  seen.add(value)
  const hits: Array<{ field: string; path: string }> = []
  for (const [key, entry] of Object.entries(value as JsonRecord)) {
    const nextPath = [...pathParts, key]
    if (fieldNames.includes(key) && hasValue(entry)) {
      hits.push({ field: key, path: nextPath.join('.') })
    }
    if (entry && typeof entry === 'object') {
      hits.push(...collectNonEmptyFieldHits(entry, fieldNames, nextPath, seen))
    }
  }
  return hits
}

function collectPresentFieldHits(
  value: unknown,
  fieldNames: string[],
  pathParts: string[] = [],
  seen = new Set<unknown>(),
): Array<{ field: string; path: string }> {
  if (!value || typeof value !== 'object') return []
  if (seen.has(value)) return []
  seen.add(value)
  const hits: Array<{ field: string; path: string }> = []
  for (const [key, entry] of Object.entries(value as JsonRecord)) {
    const nextPath = [...pathParts, key]
    if (fieldNames.includes(key) && hasValue(entry)) {
      hits.push({ field: key, path: nextPath.join('.') })
    }
    if (entry && typeof entry === 'object') {
      hits.push(...collectPresentFieldHits(entry, fieldNames, nextPath, seen))
    }
  }
  return hits
}

function hasValue(value: unknown): boolean {
  if (value === null || value === undefined) return false
  if (Array.isArray(value)) return value.length > 0
  if (typeof value === 'object') return Object.keys(value as JsonRecord).length > 0
  if (typeof value === 'string') return value.length > 0
  return true
}

function recordArray(value: unknown): JsonRecord[] {
  return Array.isArray(value) ? value.filter(isJsonRecord) : []
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === 'string' && entry.length > 0)
    : []
}

function arrayLength(value: unknown): number | null {
  return Array.isArray(value) ? value.length : null
}

function stringValue(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null
}

function numberValue(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function booleanValue(value: unknown): boolean | null {
  return typeof value === 'boolean' ? value : null
}

function asRecord(value: unknown): JsonRecord | null {
  return isJsonRecord(value) ? value : null
}

function isJsonRecord(value: unknown): value is JsonRecord {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values.filter((entry) => entry.length > 0))]
}

function looksLikeSourceAuthorityPath(filePath: string): boolean {
  const normalized = filePath.replaceAll('\\', '/').toLowerCase()
  return (
    normalized.includes('source-authority') ||
    normalized.endsWith('ci-branch-policy.json') ||
    normalized.endsWith('ci-branch-governance-readiness.json') ||
    normalized.endsWith('provider-network-policy-report.json') ||
    normalized.endsWith('rbac-policy-validation.json') ||
    normalized.endsWith('signing-readiness.json') ||
    normalized.endsWith('provenance-verification-readiness.json') ||
    normalized.endsWith('branch-protection-policy.json') ||
    normalized.endsWith('required-checks-policy.json') ||
    normalized.endsWith('ci.yml') ||
    normalized.endsWith('ci.yaml')
  )
}

function resolveRepoPath(root: string, filePath: string): string {
  return path.isAbsolute(filePath) ? path.resolve(filePath) : path.resolve(root, filePath)
}
