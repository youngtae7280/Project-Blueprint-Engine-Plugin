import path from 'node:path'
import { readFile } from 'node:fs/promises'
import { relativePath, writeJsonAtomic, writeTextAtomic } from './fs.js'
import {
  hasCodexControlDirectory,
  hasDevViewControlDirectory,
  hasHiddenControlDirectorySegment,
} from './path-safety.js'

type JsonRecord = Record<string, unknown>

const REPORT_ROLE = 'devview-provenance-verification-readiness-report'
const REPORTED_STATUS = 'devview-provenance-verification-readiness-reported'
const BLOCKED_STATUS = 'devview-provenance-verification-readiness-blocked'
const PROVENANCE_ATTESTATION_VALIDATION_ROLE = 'devview-provenance-attestation-validation-report'
const PROVENANCE_ATTESTATION_VALIDATION_STATUS = 'devview-provenance-attestation-validation-passed'
const SIGNING_READINESS_ROLE = 'devview-signing-readiness-report'
const SIGNING_READINESS_STATUS = 'devview-signing-readiness-reported'
const RBAC_POLICY_VALIDATION_ROLE = 'devview-rbac-policy-validation-report'
const RBAC_POLICY_VALIDATION_STATUS = 'devview-rbac-policy-validation-passed'
const RECORD_ENVELOPE_VERIFICATION_ROLE = 'devview-record-envelope-verification-report'
const RECORD_ENVELOPE_VERIFICATION_STATUS = 'devview-record-envelope-verified'
const RECORD_ENVELOPE_VERIFICATION_SIGNATURE_MODE = 'not-performed-unsigned-preview-only'
const PROVIDER_NETWORK_POLICY_ROLE = 'devview-provider-network-default-deny-policy-report'
const PROVIDER_NETWORK_POLICY_STATUS = 'devview-provider-network-default-deny-policy-recorded'
const ATTESTATION_SIGNATURE_VALIDATION_STATUS = 'not-performed-source-fact-only'

const unsafeAuthorityFields = [
  'enterpriseGateActivated',
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
]

const unsupportedVerificationAuthorityFields = [
  'provenanceAttestationGeneratedByDevView',
  'provenanceAttestationGenerated',
  'provenanceAttestationVerified',
  'provenanceAttestationPresent',
  'provenanceAttested',
  'releaseProvenanceAttested',
  'npmProvenanceEnabled',
  'slsaProvenanceGenerated',
  'slsaProvenanceVerified',
  'realSlsaVerificationPerformed',
  'realInTotoVerificationPerformed',
  'inTotoStatementVerified',
  'packagePublished',
  'publishingPerformed',
  'packageArtifactGeneratedByDevView',
  'packageArtifactGenerated',
  'packageTarballGenerated',
  'packageCreated',
  'packageFileWritten',
  'packageSigned',
  'packageSigningPresent',
  'packageSignaturePresent',
  'packageSignatureVerified',
  'sbomGeneratedByDevView',
  'sbomGenerated',
  'sbomCreated',
  'sbomFileWritten',
  'sbomAttested',
  'cryptographicSignaturePresent',
  'cryptographicSignatureVerified',
  'cryptographicSigningImplemented',
  'signedRecordEnvelopePresent',
  'keyGenerated',
  'privateKeyStored',
  'keyManagementImplemented',
  'keyRegistryPresent',
  'trustRootPresent',
  'signaturePolicyPresent',
  'signaturePolicyEnforced',
  'keyRegistryCreated',
  'trustRootCreated',
  'rbacEnforced',
  'permissionVerified',
  'rbacPermissionVerified',
]

export interface ProvenanceVerificationReadinessOptions {
  provenanceAttestationValidation?: string
  signingReadiness?: string
  rbacPolicyValidation?: string
  recordEnvelopeVerification?: string
  providerNetworkPolicyReport?: string
  output?: string
  markdown?: string
}

export interface ProvenanceVerificationReadinessFinding {
  severity: 'blocker' | 'gap' | 'advisory' | 'satisfied'
  code: string
  message: string
  path?: string
  field?: string
}

type SourceKind =
  | 'provenance-attestation-validation'
  | 'signing-readiness'
  | 'rbac-policy-validation'
  | 'record-envelope-verification'
  | 'provider-network-policy-report'

interface LoadedSource {
  requestedPath: string
  resolvedPath: string
  relativePath: string
  sourceKind: SourceKind
  record: JsonRecord | null
  readError: string | null
}

interface SourceSummary {
  supplied: boolean
  path: string | null
  artifactRole: string | null
  status: string | null
}

export interface ProvenanceVerificationReadinessReport {
  schemaVersion: 1
  artifactRole: typeof REPORT_ROLE
  status: typeof REPORTED_STATUS | typeof BLOCKED_STATUS
  readinessScope: 'provenance-verification-readiness-report-only'
  sourceFactsOnly: true
  reportOnly: true
  provenanceVerificationReadinessStatus: 'not-ready-key-trust-and-signature-policy-missing' | 'blocked'
  sourceProvenanceAttestationValidation: SourceSummary & {
    supplied: true
    attestationFormat: string | null
    attestationDigestPresent: boolean
    packageDigestAlignmentStatus: string | null
    provenanceInputAlignmentStatus: string | null
    signatureValidationStatus: string | null
    provenanceAttestationGeneratedByDevView: boolean | null
    provenanceAttestationGenerated: boolean | null
    provenanceAttestationVerified: boolean | null
    packageSigned: boolean | null
  }
  sourceSigningReadiness: SourceSummary & {
    signingReadinessStatus: string | null
    keyGovernanceStatus: string | null
    keyRegistryPresent: boolean | null
    trustRootPresent: boolean | null
    privateKeyStoragePresent: boolean | null
    noPrivateKeyStorageInRepo: boolean | null
    signaturePolicyStatus: string | null
    detachedSignaturePolicyPresent: boolean | null
    signatureFormatPolicyPresent: boolean | null
    rbacActorModelPresent: boolean | null
    rbacPermissionMatrixPresent: boolean | null
    rbacRoleAssignmentRegistryPresent: boolean | null
  }
  sourceRbacPolicyValidation: SourceSummary & {
    rbacPolicyValidationStatus: string | null
    defaultDenyConfigured: boolean | null
    actorCount: number | null
    roleAssignmentCount: number | null
    permissionGrantCount: number | null
    automationRestrictionDeclared: boolean | null
    extensionAuthorRestrictionDeclared: boolean | null
    noEnforcementPerformed: boolean | null
  }
  sourceRecordEnvelopeVerification: SourceSummary & {
    signatureVerificationMode: string | null
    payloadDigestMatches: boolean | null
    allSourceDigestsMatch: boolean | null
    previousEnvelopeChainLinkVerified: boolean | null
    verificationDigestPresent: boolean
    cryptographicSignatureVerified: boolean | null
    rbacPermissionVerified: boolean | null
    rbacEnforced: boolean | null
    permissionVerified: boolean | null
  }
  sourceProviderNetworkPolicy: SourceSummary & {
    defaultProviderPolicy: string | null
    defaultNetworkPolicy: string | null
    explicitAllowSupported: boolean | null
    providerAllowlistCount: number | null
    networkAllowlistCount: number | null
    futureAllowRequirementCount: number | null
    blockedCapabilityCount: number | null
  }
  verificationBoundary: {
    realSlsaVerificationPerformed: false
    realInTotoVerificationPerformed: false
    cryptographicSignatureVerified: false
    signatureVerificationStatus: 'not-performed-readiness-only'
    provenanceAttestationGenerated: false
    provenanceAttestationVerified: false
    provenanceAttested: false
    packageSigned: false
  }
  keyTrustReadiness: {
    status: 'not-ready'
    keyRegistryPresent: boolean
    trustRootPresent: boolean
    keyRotationPolicyPresent: false
    keyRevocationPolicyPresent: false
    timestampPolicyPresent: false
    noPrivateKeyStorageInRepo: boolean
    gaps: string[]
  }
  signaturePolicyReadiness: {
    status: 'not-ready'
    detachedSignaturePolicyPresent: boolean
    allowedAlgorithmPolicyPresent: false
    canonicalizationPolicy: 'raw-byte-digest-now-canonical-json-policy-required-before-real-verification'
    signatureVerificationReportSemanticsPresent: false
    gaps: string[]
  }
  rbacPrerequisiteReadiness: {
    actorModelPresent: boolean
    policyValidationPresent: boolean
    defaultDenyPolicyValidated: boolean
    roleAssignmentRegistryPresent: boolean
    rbacEnforced: false
    permissionVerified: false
    gaps: string[]
  }
  networkIsolationReadiness: {
    providerNetworkDefaultDenyRecorded: boolean
    defaultProviderPolicy: string | null
    defaultNetworkPolicy: string | null
    providerAllowlistEmpty: boolean | null
    networkAllowlistEmpty: boolean | null
    providerInvoked: false
    networkCallMade: false
    apiCallMade: false
    gaps: string[]
  }
  futureVerificationRequirements: string[]
  provenanceVerificationFindings: ProvenanceVerificationReadinessFinding[]
  downstreamActionPlan: string[]
  realSlsaVerificationPerformed: false
  realInTotoVerificationPerformed: false
  provenanceAttestationGeneratedByDevView: false
  provenanceAttestationGenerated: false
  provenanceAttestationVerified: false
  provenanceAttestationPresent: false
  provenanceAttested: false
  releaseProvenanceAttested: false
  npmProvenanceEnabled: false
  slsaProvenanceGenerated: false
  slsaProvenanceVerified: false
  inTotoStatementVerified: false
  packagePublished: false
  publishingPerformed: false
  packageArtifactGeneratedByDevView: false
  packageArtifactGenerated: false
  packageTarballGenerated: false
  packageSigned: false
  packageSigningPresent: false
  packageSignaturePresent: false
  packageSignatureVerified: false
  sbomGeneratedByDevView: false
  sbomGenerated: false
  sbomAttested: false
  cryptographicSigningImplemented: false
  cryptographicSignaturePresent: false
  cryptographicSignatureVerified: false
  keyGenerated: false
  privateKeyStored: false
  keyManagementImplemented: false
  keyRegistryCreated: false
  trustRootCreated: false
  rbacEnforced: false
  permissionVerified: false
  rbacPermissionVerified: false
  enterpriseGateActivated: false
  providerInvoked: false
  networkCallMade: false
  apiCallMade: false
  shellCommandsExecuted: false
  extensionExecutionAllowed: false
  extensionsExecuted: false
  benchmarkExecuted: false
  candidateExecuted: false
  graphifyExecuted: false
  nativeBenchmarkExecuted: false
  filesMutated: false
  graphSourceMutated: false
  graphDeltaApplied: false
  runtimeEvidenceSatisfied: false
  evidenceAccepted: false
  equivalenceProven: false
  scopeEnforced: false
  ciEnforcementEnabled: false
  hooksActivated: false
  branchProtectionChanged: false
  branchProtectionMutated: false
  requiredChecksConfigured: false
  requiredChecksMutated: false
  externalCiMutated: false
  diffRejectionEnabled: false
  diffRejectionActivated: false
  approvalAutomationEnabled: false
  userAcceptanceAutomated: false
  writtenOutputPath?: string
  writtenMarkdownPath?: string
}

export class ProvenanceVerificationReadinessReportValidationError extends Error {
  readonly report: ProvenanceVerificationReadinessReport

  constructor(report: ProvenanceVerificationReadinessReport) {
    super('Provenance verification readiness reporting is blocked.')
    this.report = report
  }
}

export async function reportProvenanceVerificationReadiness(
  root: string,
  options: ProvenanceVerificationReadinessOptions,
): Promise<ProvenanceVerificationReadinessReport> {
  validateRequiredOptions(options)
  const normalizedOptions = normalizeSourceOptions(options)
  const sourcePaths = [
    resolveRepoPath(root, normalizedOptions.provenanceAttestationValidation),
    normalizedOptions.signingReadiness ? resolveRepoPath(root, normalizedOptions.signingReadiness) : null,
    normalizedOptions.rbacPolicyValidation ? resolveRepoPath(root, normalizedOptions.rbacPolicyValidation) : null,
    normalizedOptions.recordEnvelopeVerification
      ? resolveRepoPath(root, normalizedOptions.recordEnvelopeVerification)
      : null,
    normalizedOptions.providerNetworkPolicyReport
      ? resolveRepoPath(root, normalizedOptions.providerNetworkPolicyReport)
      : null,
  ].filter((entry): entry is string => Boolean(entry))
  await assertOutputAuthority(root, sourcePaths, options)

  const provenanceAttestationValidation = await loadSource(
    root,
    normalizedOptions.provenanceAttestationValidation,
    'provenance-attestation-validation',
  )
  const signingReadiness = normalizedOptions.signingReadiness
    ? await loadSource(root, normalizedOptions.signingReadiness, 'signing-readiness')
    : null
  const rbacPolicyValidation = normalizedOptions.rbacPolicyValidation
    ? await loadSource(root, normalizedOptions.rbacPolicyValidation, 'rbac-policy-validation')
    : null
  const recordEnvelopeVerification = normalizedOptions.recordEnvelopeVerification
    ? await loadSource(root, normalizedOptions.recordEnvelopeVerification, 'record-envelope-verification')
    : null
  const providerNetworkPolicy = normalizedOptions.providerNetworkPolicyReport
    ? await loadSource(root, normalizedOptions.providerNetworkPolicyReport, 'provider-network-policy-report')
    : null

  const blockingFindings = validateSources(
    provenanceAttestationValidation,
    signingReadiness,
    rbacPolicyValidation,
    recordEnvelopeVerification,
    providerNetworkPolicy,
  )
  if (blockingFindings.length > 0) {
    throw new ProvenanceVerificationReadinessReportValidationError(
      buildReport(
        provenanceAttestationValidation,
        signingReadiness,
        rbacPolicyValidation,
        recordEnvelopeVerification,
        providerNetworkPolicy,
        blockingFindings,
        true,
      ),
    )
  }

  const report = buildReport(
    provenanceAttestationValidation,
    signingReadiness,
    rbacPolicyValidation,
    recordEnvelopeVerification,
    providerNetworkPolicy,
    buildFindings(
      provenanceAttestationValidation,
      signingReadiness,
      rbacPolicyValidation,
      recordEnvelopeVerification,
      providerNetworkPolicy,
    ),
  )
  const outputPath = resolveRepoPath(root, options.output ?? '')
  await writeJsonAtomic(outputPath, report)
  report.writtenOutputPath = relativePath(root, outputPath)
  if (options.markdown) {
    const markdownPath = resolveRepoPath(root, options.markdown)
    await writeTextAtomic(markdownPath, renderMarkdown(report))
    report.writtenMarkdownPath = relativePath(root, markdownPath)
    await writeJsonAtomic(outputPath, report)
  }
  return report
}

function buildReport(
  provenanceAttestationValidation: LoadedSource,
  signingReadiness: LoadedSource | null,
  rbacPolicyValidation: LoadedSource | null,
  recordEnvelopeVerification: LoadedSource | null,
  providerNetworkPolicy: LoadedSource | null,
  findings: ProvenanceVerificationReadinessFinding[],
  blocked = false,
): ProvenanceVerificationReadinessReport {
  const signingRecord = signingReadiness?.record ?? null
  const rbacPolicyRecord = rbacPolicyValidation?.record ?? null
  const providerRecord = providerNetworkPolicy?.record ?? null
  const keyGovernance = asRecord(signingRecord?.keyGovernanceReadiness)
  const signaturePolicy = asRecord(signingRecord?.signaturePolicyReadiness)
  const rbacPrerequisite = asRecord(signingRecord?.rbacPrerequisiteSummary)
  const defaultDeny = asRecord(rbacPolicyRecord?.defaultDenyStatus)
  return {
    schemaVersion: 1,
    artifactRole: REPORT_ROLE,
    status: blocked ? BLOCKED_STATUS : REPORTED_STATUS,
    readinessScope: 'provenance-verification-readiness-report-only',
    sourceFactsOnly: true,
    reportOnly: true,
    provenanceVerificationReadinessStatus: blocked ? 'blocked' : 'not-ready-key-trust-and-signature-policy-missing',
    sourceProvenanceAttestationValidation: provenanceAttestationValidationSummary(provenanceAttestationValidation),
    sourceSigningReadiness: signingReadinessSummary(signingReadiness),
    sourceRbacPolicyValidation: rbacPolicyValidationSummary(rbacPolicyValidation),
    sourceRecordEnvelopeVerification: recordEnvelopeVerificationSummary(recordEnvelopeVerification),
    sourceProviderNetworkPolicy: providerNetworkPolicySummary(providerNetworkPolicy),
    verificationBoundary: {
      realSlsaVerificationPerformed: false,
      realInTotoVerificationPerformed: false,
      cryptographicSignatureVerified: false,
      signatureVerificationStatus: 'not-performed-readiness-only',
      provenanceAttestationGenerated: false,
      provenanceAttestationVerified: false,
      provenanceAttested: false,
      packageSigned: false,
    },
    keyTrustReadiness: {
      status: 'not-ready',
      keyRegistryPresent: booleanValue(keyGovernance?.keyRegistryPresent),
      trustRootPresent: booleanValue(keyGovernance?.trustRootPresent),
      keyRotationPolicyPresent: false,
      keyRevocationPolicyPresent: false,
      timestampPolicyPresent: false,
      noPrivateKeyStorageInRepo: booleanValue(keyGovernance?.noPrivateKeyStorageInRepo),
      gaps: keyTrustGaps(signingReadiness),
    },
    signaturePolicyReadiness: {
      status: 'not-ready',
      detachedSignaturePolicyPresent: booleanValue(signaturePolicy?.detachedSignaturePolicyPresent),
      allowedAlgorithmPolicyPresent: false,
      canonicalizationPolicy: 'raw-byte-digest-now-canonical-json-policy-required-before-real-verification',
      signatureVerificationReportSemanticsPresent: false,
      gaps: signaturePolicyGaps(signingReadiness),
    },
    rbacPrerequisiteReadiness: {
      actorModelPresent:
        booleanValue(rbacPrerequisite?.actorModelPresent) ||
        (numberValue(asRecord(rbacPolicyRecord?.actorSummary)?.actorCount) ?? 0) > 0,
      policyValidationPresent: Boolean(rbacPolicyValidation),
      defaultDenyPolicyValidated: booleanValue(defaultDeny?.defaultDenyConfigured),
      roleAssignmentRegistryPresent: booleanValue(rbacPrerequisite?.roleAssignmentRegistryPresent),
      rbacEnforced: false,
      permissionVerified: false,
      gaps: rbacPrerequisiteGaps(signingReadiness, rbacPolicyValidation),
    },
    networkIsolationReadiness: {
      providerNetworkDefaultDenyRecorded: Boolean(providerNetworkPolicy),
      defaultProviderPolicy: stringValue(providerRecord?.defaultProviderPolicy),
      defaultNetworkPolicy: stringValue(providerRecord?.defaultNetworkPolicy),
      providerAllowlistEmpty: providerRecord ? arrayLength(providerRecord.providerAllowlist) === 0 : null,
      networkAllowlistEmpty: providerRecord ? arrayLength(providerRecord.networkAllowlist) === 0 : null,
      providerInvoked: false,
      networkCallMade: false,
      apiCallMade: false,
      gaps: networkIsolationGaps(providerNetworkPolicy),
    },
    futureVerificationRequirements: [
      'detached provenance attestation signature artifact or signature path',
      'keyId and signatureAlgorithm policy',
      'key registry and trust root source artifacts',
      'key rotation and revocation metadata',
      'explicit timestamp policy',
      'canonical payload or statement digest policy',
      'RBAC permission gate for provenance verification',
      'offline SLSA/in-toto verification policy before any tool execution',
      'signed provenance verification report semantics',
      'enterprise readiness visibility for verification readiness facts',
    ],
    provenanceVerificationFindings: findings,
    downstreamActionPlan: downstreamActionPlan(findings),
    realSlsaVerificationPerformed: false,
    realInTotoVerificationPerformed: false,
    provenanceAttestationGeneratedByDevView: false,
    provenanceAttestationGenerated: false,
    provenanceAttestationVerified: false,
    provenanceAttestationPresent: false,
    provenanceAttested: false,
    releaseProvenanceAttested: false,
    npmProvenanceEnabled: false,
    slsaProvenanceGenerated: false,
    slsaProvenanceVerified: false,
    inTotoStatementVerified: false,
    packagePublished: false,
    publishingPerformed: false,
    packageArtifactGeneratedByDevView: false,
    packageArtifactGenerated: false,
    packageTarballGenerated: false,
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

function validateSources(
  provenanceAttestationValidation: LoadedSource,
  signingReadiness: LoadedSource | null,
  rbacPolicyValidation: LoadedSource | null,
  recordEnvelopeVerification: LoadedSource | null,
  providerNetworkPolicy: LoadedSource | null,
): ProvenanceVerificationReadinessFinding[] {
  const findings: ProvenanceVerificationReadinessFinding[] = []
  for (const source of [
    provenanceAttestationValidation,
    signingReadiness,
    rbacPolicyValidation,
    recordEnvelopeVerification,
    providerNetworkPolicy,
  ].filter((entry): entry is LoadedSource => Boolean(entry))) {
    if (source.readError) {
      findings.push(
        blockingFinding('PROVENANCE_VERIFICATION_SOURCE_READ_FAILED', source.readError, source.relativePath),
      )
      continue
    }
    if (!source.record) {
      findings.push(
        blockingFinding(
          'PROVENANCE_VERIFICATION_SOURCE_NOT_JSON_OBJECT',
          `${source.relativePath} must be a JSON object.`,
          source.relativePath,
        ),
      )
      continue
    }
    validateRoleStatus(source, source.record, findings)
    validateSourceSpecificClaims(source, source.record, findings)
    for (const hit of collectTrueFieldHits(source.record, unsafeAuthorityFields)) {
      findings.push(
        blockingFinding(
          'PROVENANCE_VERIFICATION_UNSAFE_SOURCE_AUTHORITY_FLAG',
          `${source.relativePath} claims unsafe authority field ${hit.field}: true.`,
          source.relativePath,
          hit.path,
        ),
      )
    }
    for (const hit of collectTrueFieldHits(source.record, unsupportedVerificationAuthorityFields)) {
      findings.push(
        blockingFinding(
          'PROVENANCE_VERIFICATION_AUTHORITY_CLAIM_UNSUPPORTED',
          `${source.relativePath} claims provenance/signing/key/RBAC authority field ${hit.field}: true.`,
          source.relativePath,
          hit.path,
        ),
      )
    }
  }
  return findings
}

function validateRoleStatus(
  source: LoadedSource,
  record: JsonRecord,
  findings: ProvenanceVerificationReadinessFinding[],
): void {
  if (
    source.sourceKind === 'provenance-attestation-validation' &&
    (record.artifactRole !== PROVENANCE_ATTESTATION_VALIDATION_ROLE ||
      record.status !== PROVENANCE_ATTESTATION_VALIDATION_STATUS)
  ) {
    findings.push(
      blockingFinding(
        'PROVENANCE_VERIFICATION_ATTESTATION_VALIDATION_ROLE_STATUS_INVALID',
        `${source.relativePath} must be ${PROVENANCE_ATTESTATION_VALIDATION_ROLE} with passed status.`,
        source.relativePath,
      ),
    )
  } else if (
    source.sourceKind === 'signing-readiness' &&
    (record.artifactRole !== SIGNING_READINESS_ROLE || record.status !== SIGNING_READINESS_STATUS)
  ) {
    findings.push(
      blockingFinding(
        'PROVENANCE_VERIFICATION_SIGNING_READINESS_ROLE_STATUS_INVALID',
        `${source.relativePath} must be ${SIGNING_READINESS_ROLE} with reported status.`,
        source.relativePath,
      ),
    )
  } else if (
    source.sourceKind === 'rbac-policy-validation' &&
    (record.artifactRole !== RBAC_POLICY_VALIDATION_ROLE || record.status !== RBAC_POLICY_VALIDATION_STATUS)
  ) {
    findings.push(
      blockingFinding(
        'PROVENANCE_VERIFICATION_RBAC_POLICY_VALIDATION_ROLE_STATUS_INVALID',
        `${source.relativePath} must be ${RBAC_POLICY_VALIDATION_ROLE} with passed status.`,
        source.relativePath,
      ),
    )
  } else if (
    source.sourceKind === 'record-envelope-verification' &&
    (record.artifactRole !== RECORD_ENVELOPE_VERIFICATION_ROLE || record.status !== RECORD_ENVELOPE_VERIFICATION_STATUS)
  ) {
    findings.push(
      blockingFinding(
        'PROVENANCE_VERIFICATION_RECORD_ENVELOPE_VERIFICATION_ROLE_STATUS_INVALID',
        `${source.relativePath} must be ${RECORD_ENVELOPE_VERIFICATION_ROLE} with verified status.`,
        source.relativePath,
      ),
    )
  } else if (
    source.sourceKind === 'provider-network-policy-report' &&
    (record.artifactRole !== PROVIDER_NETWORK_POLICY_ROLE || record.status !== PROVIDER_NETWORK_POLICY_STATUS)
  ) {
    findings.push(
      blockingFinding(
        'PROVENANCE_VERIFICATION_PROVIDER_NETWORK_POLICY_ROLE_STATUS_INVALID',
        `${source.relativePath} must be ${PROVIDER_NETWORK_POLICY_ROLE} with recorded status.`,
        source.relativePath,
      ),
    )
  }
}

function validateSourceSpecificClaims(
  source: LoadedSource,
  record: JsonRecord,
  findings: ProvenanceVerificationReadinessFinding[],
): void {
  if (
    source.sourceKind === 'provenance-attestation-validation' &&
    record.signatureValidationStatus !== ATTESTATION_SIGNATURE_VALIDATION_STATUS
  ) {
    findings.push(
      blockingFinding(
        'PROVENANCE_VERIFICATION_ATTESTATION_SIGNATURE_STATUS_UNSUPPORTED',
        `${source.relativePath} must keep signatureValidationStatus as ${ATTESTATION_SIGNATURE_VALIDATION_STATUS}.`,
        source.relativePath,
        'signatureValidationStatus',
      ),
    )
  }
  if (
    source.sourceKind === 'record-envelope-verification' &&
    record.signatureVerificationMode !== RECORD_ENVELOPE_VERIFICATION_SIGNATURE_MODE
  ) {
    findings.push(
      blockingFinding(
        'PROVENANCE_VERIFICATION_RECORD_ENVELOPE_SIGNATURE_MODE_UNSUPPORTED',
        `${source.relativePath} must use unsigned preview-only signature verification mode.`,
        source.relativePath,
        'signatureVerificationMode',
      ),
    )
  }
  if (source.sourceKind === 'provider-network-policy-report') {
    if (record.defaultProviderPolicy !== 'deny' || record.defaultNetworkPolicy !== 'deny') {
      findings.push(
        blockingFinding(
          'PROVENANCE_VERIFICATION_PROVIDER_NETWORK_POLICY_NOT_DENY',
          `${source.relativePath} must keep default provider and network policies as deny.`,
          source.relativePath,
          'defaultProviderPolicy',
        ),
      )
    }
    if ((arrayLength(record.providerAllowlist) ?? 0) > 0 || (arrayLength(record.networkAllowlist) ?? 0) > 0) {
      findings.push(
        blockingFinding(
          'PROVENANCE_VERIFICATION_PROVIDER_NETWORK_ALLOWLIST_UNSUPPORTED',
          `${source.relativePath} must keep provider/network allowlists empty for v1 provenance verification readiness.`,
          source.relativePath,
          'providerAllowlist',
        ),
      )
    }
  }
}

function buildFindings(
  provenanceAttestationValidation: LoadedSource,
  signingReadiness: LoadedSource | null,
  rbacPolicyValidation: LoadedSource | null,
  recordEnvelopeVerification: LoadedSource | null,
  providerNetworkPolicy: LoadedSource | null,
): ProvenanceVerificationReadinessFinding[] {
  return [
    satisfiedFinding(
      'PROVENANCE_VERIFICATION_ATTESTATION_VALIDATION_LINKED',
      'Static provenance attestation validation is linked as a source fact.',
      provenanceAttestationValidation.relativePath,
    ),
    signingReadiness
      ? satisfiedFinding(
          'PROVENANCE_VERIFICATION_SIGNING_READINESS_LINKED',
          'Signing/key governance readiness is linked as a source fact.',
          signingReadiness.relativePath,
        )
      : gapFinding(
          'PROVENANCE_VERIFICATION_SIGNING_READINESS_NOT_SUPPLIED',
          'Signing/key governance readiness was not supplied.',
        ),
    rbacPolicyValidation
      ? satisfiedFinding(
          'PROVENANCE_VERIFICATION_RBAC_POLICY_VALIDATION_LINKED',
          'RBAC policy validation is linked as a source fact.',
          rbacPolicyValidation.relativePath,
        )
      : gapFinding(
          'PROVENANCE_VERIFICATION_RBAC_POLICY_VALIDATION_NOT_SUPPLIED',
          'RBAC policy validation was not supplied.',
        ),
    recordEnvelopeVerification
      ? satisfiedFinding(
          'PROVENANCE_VERIFICATION_RECORD_ENVELOPE_VERIFICATION_LINKED',
          'Unsigned record envelope verification is linked as a digest source fact.',
          recordEnvelopeVerification.relativePath,
        )
      : advisoryFinding(
          'PROVENANCE_VERIFICATION_RECORD_ENVELOPE_VERIFICATION_NOT_SUPPLIED',
          'Record envelope verification was not supplied.',
        ),
    providerNetworkPolicy
      ? satisfiedFinding(
          'PROVENANCE_VERIFICATION_PROVIDER_NETWORK_POLICY_LINKED',
          'Provider/network default-deny policy is linked as a source fact.',
          providerNetworkPolicy.relativePath,
        )
      : advisoryFinding(
          'PROVENANCE_VERIFICATION_PROVIDER_NETWORK_POLICY_NOT_SUPPLIED',
          'Provider/network default-deny policy was not supplied.',
        ),
    gapFinding(
      'PROVENANCE_VERIFICATION_REAL_VERIFICATION_NOT_READY',
      'Real SLSA/in-toto verification, cryptographic signature verification, key trust, RBAC enforcement, and CI governance remain absent.',
    ),
  ]
}

async function loadSource(root: string, requestedPath: string, sourceKind: SourceKind): Promise<LoadedSource> {
  const resolvedPath = resolveRepoPath(root, requestedPath)
  const base = {
    requestedPath,
    resolvedPath,
    relativePath: relativePath(root, resolvedPath),
    sourceKind,
  }
  try {
    const text = await readFile(resolvedPath, 'utf8')
    try {
      const parsed = JSON.parse(text.replace(/^\uFEFF/, '')) as unknown
      return {
        ...base,
        record: isJsonRecord(parsed) ? parsed : null,
        readError: isJsonRecord(parsed) ? null : 'JSON content is not an object.',
      }
    } catch (error) {
      return {
        ...base,
        record: null,
        readError: error instanceof Error ? error.message : String(error),
      }
    }
  } catch (error) {
    return {
      ...base,
      record: null,
      readError: error instanceof Error ? error.message : String(error),
    }
  }
}

function provenanceAttestationValidationSummary(
  source: LoadedSource,
): ProvenanceVerificationReadinessReport['sourceProvenanceAttestationValidation'] {
  const record = source.record ?? {}
  const sourceAttestation = asRecord(record.sourceAttestationArtifact)
  const digestSummary = asRecord(record.digestSummary)
  const packageDigestAlignment = asRecord(record.packageDigestAlignment)
  const provenanceInputAlignment = asRecord(record.provenanceInputAlignment)
  return {
    supplied: true,
    path: source.relativePath,
    artifactRole: stringValue(record.artifactRole),
    status: stringValue(record.status),
    attestationFormat: stringValue(sourceAttestation?.attestationFormat),
    attestationDigestPresent: Boolean(stringValue(digestSummary?.attestationSha256)),
    packageDigestAlignmentStatus: stringValue(packageDigestAlignment?.alignmentStatus),
    provenanceInputAlignmentStatus: stringValue(provenanceInputAlignment?.alignmentStatus),
    signatureValidationStatus: stringValue(record.signatureValidationStatus),
    provenanceAttestationGeneratedByDevView: booleanOrNull(record.provenanceAttestationGeneratedByDevView),
    provenanceAttestationGenerated: booleanOrNull(record.provenanceAttestationGenerated),
    provenanceAttestationVerified: booleanOrNull(record.provenanceAttestationVerified),
    packageSigned: booleanOrNull(record.packageSigned),
  }
}

function signingReadinessSummary(
  source: LoadedSource | null,
): ProvenanceVerificationReadinessReport['sourceSigningReadiness'] {
  const record = source?.record ?? null
  const keyGovernance = asRecord(record?.keyGovernanceReadiness)
  const signaturePolicy = asRecord(record?.signaturePolicyReadiness)
  const rbacPrerequisite = asRecord(record?.rbacPrerequisiteSummary)
  return {
    supplied: Boolean(source),
    path: source?.relativePath ?? null,
    artifactRole: stringValue(record?.artifactRole),
    status: stringValue(record?.status),
    signingReadinessStatus: stringValue(record?.signingReadinessStatus),
    keyGovernanceStatus: stringValue(keyGovernance?.status),
    keyRegistryPresent: booleanOrNull(keyGovernance?.keyRegistryPresent),
    trustRootPresent: booleanOrNull(keyGovernance?.trustRootPresent),
    privateKeyStoragePresent: booleanOrNull(keyGovernance?.privateKeyStoragePresent),
    noPrivateKeyStorageInRepo: booleanOrNull(keyGovernance?.noPrivateKeyStorageInRepo),
    signaturePolicyStatus: stringValue(signaturePolicy?.status),
    detachedSignaturePolicyPresent: booleanOrNull(signaturePolicy?.detachedSignaturePolicyPresent),
    signatureFormatPolicyPresent: booleanOrNull(signaturePolicy?.signatureFormatPolicyPresent),
    rbacActorModelPresent: booleanOrNull(rbacPrerequisite?.actorModelPresent),
    rbacPermissionMatrixPresent: booleanOrNull(rbacPrerequisite?.permissionMatrixPresent),
    rbacRoleAssignmentRegistryPresent: booleanOrNull(rbacPrerequisite?.roleAssignmentRegistryPresent),
  }
}

function rbacPolicyValidationSummary(
  source: LoadedSource | null,
): ProvenanceVerificationReadinessReport['sourceRbacPolicyValidation'] {
  const record = source?.record ?? null
  return {
    supplied: Boolean(source),
    path: source?.relativePath ?? null,
    artifactRole: stringValue(record?.artifactRole),
    status: stringValue(record?.status),
    rbacPolicyValidationStatus: stringValue(record?.rbacPolicyValidationStatus),
    defaultDenyConfigured: booleanOrNull(asRecord(record?.defaultDenyStatus)?.defaultDenyConfigured),
    actorCount: numberValue(asRecord(record?.actorSummary)?.actorCount),
    roleAssignmentCount: numberValue(asRecord(record?.roleAssignmentSummary)?.assignmentCount),
    permissionGrantCount: numberValue(asRecord(record?.permissionGrantSummary)?.grantCount),
    automationRestrictionDeclared: booleanOrNull(
      asRecord(record?.automationRestrictionStatus)?.automationRestrictionDeclared,
    ),
    extensionAuthorRestrictionDeclared: booleanOrNull(
      asRecord(record?.extensionAuthorRestrictionStatus)?.extensionAuthorRestrictionDeclared,
    ),
    noEnforcementPerformed: booleanOrNull(record?.noEnforcementPerformed),
  }
}

function recordEnvelopeVerificationSummary(
  source: LoadedSource | null,
): ProvenanceVerificationReadinessReport['sourceRecordEnvelopeVerification'] {
  const record = source?.record ?? null
  return {
    supplied: Boolean(source),
    path: source?.relativePath ?? null,
    artifactRole: stringValue(record?.artifactRole),
    status: stringValue(record?.status),
    signatureVerificationMode: stringValue(record?.signatureVerificationMode),
    payloadDigestMatches: booleanOrNull(asRecord(record?.payloadVerification)?.digestMatches),
    allSourceDigestsMatch: booleanOrNull(asRecord(record?.sourceArtifactVerification)?.allSourceDigestsMatch),
    previousEnvelopeChainLinkVerified: booleanOrNull(asRecord(record?.previousEnvelopeVerification)?.chainLinkVerified),
    verificationDigestPresent: Boolean(stringValue(record?.verificationDigest)),
    cryptographicSignatureVerified: booleanOrNull(record?.cryptographicSignatureVerified),
    rbacPermissionVerified: booleanOrNull(record?.rbacPermissionVerified),
    rbacEnforced: booleanOrNull(record?.rbacEnforced),
    permissionVerified: booleanOrNull(record?.permissionVerified),
  }
}

function providerNetworkPolicySummary(
  source: LoadedSource | null,
): ProvenanceVerificationReadinessReport['sourceProviderNetworkPolicy'] {
  const record = source?.record ?? null
  return {
    supplied: Boolean(source),
    path: source?.relativePath ?? null,
    artifactRole: stringValue(record?.artifactRole),
    status: stringValue(record?.status),
    defaultProviderPolicy: stringValue(record?.defaultProviderPolicy),
    defaultNetworkPolicy: stringValue(record?.defaultNetworkPolicy),
    explicitAllowSupported: booleanOrNull(record?.explicitAllowSupported),
    providerAllowlistCount: arrayLength(record?.providerAllowlist),
    networkAllowlistCount: arrayLength(record?.networkAllowlist),
    futureAllowRequirementCount: arrayLength(record?.futureAllowPolicyRequirements),
    blockedCapabilityCount: arrayLength(record?.blockedCapabilities),
  }
}

function keyTrustGaps(signingReadiness: LoadedSource | null): string[] {
  if (!signingReadiness) return ['Signing/key governance readiness report is not supplied.']
  return [
    'Key registry source artifact is not present for real provenance verification.',
    'Trust root source artifact is not present for real provenance verification.',
    'Key rotation and revocation metadata are not present.',
    'Timestamp policy remains explicit-input/readiness-only.',
  ]
}

function signaturePolicyGaps(signingReadiness: LoadedSource | null): string[] {
  const record = signingReadiness?.record ?? null
  const signaturePolicy = asRecord(record?.signaturePolicyReadiness)
  const gaps = [
    'Allowed algorithm policy is not enforced.',
    'Canonical statement payload policy is not implemented for real verification.',
    'Signature verification report semantics are future work.',
  ]
  if (!booleanValue(signaturePolicy?.detachedSignaturePolicyPresent)) {
    gaps.unshift('Detached signature policy is not present.')
  }
  return gaps
}

function rbacPrerequisiteGaps(
  signingReadiness: LoadedSource | null,
  rbacPolicyValidation: LoadedSource | null,
): string[] {
  const gaps: string[] = []
  if (!signingReadiness) gaps.push('Signing readiness source is not supplied for RBAC prerequisites.')
  if (!rbacPolicyValidation) gaps.push('RBAC policy validation source is not supplied.')
  gaps.push('RBAC enforcement and permission verification remain disabled.')
  gaps.push('Actor identity assurance provider is not implemented.')
  return gaps
}

function networkIsolationGaps(providerNetworkPolicy: LoadedSource | null): string[] {
  if (!providerNetworkPolicy) return ['Provider/network default-deny policy report is not supplied.']
  return [
    'Provider/network default-deny is recorded, but future live verification still needs sandbox and audit policy.',
  ]
}

function downstreamActionPlan(findings: ProvenanceVerificationReadinessFinding[]): string[] {
  const actions = new Set<string>()
  if (findings.some((entry) => entry.severity === 'blocker')) {
    actions.add('Fix provenance verification readiness source role/status or unsafe authority blockers.')
  }
  actions.add('Integrate this provenance verification readiness report into enterprise readiness as a source fact.')
  actions.add('Define signed provenance verification policy before any real SLSA/in-toto or crypto verification.')
  actions.add('Keep key generation, private key storage, signing, RBAC enforcement, and CI mutation disabled.')
  actions.add(
    'Plan CI/branch governance readiness as the next release-governance boundary after visibility integration.',
  )
  return [...actions]
}

function validateRequiredOptions(options: ProvenanceVerificationReadinessOptions): void {
  if (!options.provenanceAttestationValidation) {
    throw new Error(
      'security report-provenance-verification-readiness requires --provenance-attestation-validation <file>.',
    )
  }
  if (!options.output) {
    throw new Error('security report-provenance-verification-readiness requires --output <json>.')
  }
}

function normalizeSourceOptions(options: ProvenanceVerificationReadinessOptions): {
  provenanceAttestationValidation: string
  signingReadiness?: string
  rbacPolicyValidation?: string
  recordEnvelopeVerification?: string
  providerNetworkPolicyReport?: string
} {
  return {
    provenanceAttestationValidation: singlePath(
      options.provenanceAttestationValidation,
      '--provenance-attestation-validation',
    ),
    signingReadiness: singleOptionalPath(options.signingReadiness, '--signing-readiness'),
    rbacPolicyValidation: singleOptionalPath(options.rbacPolicyValidation, '--rbac-policy-validation'),
    recordEnvelopeVerification: singleOptionalPath(
      options.recordEnvelopeVerification,
      '--record-envelope-verification',
    ),
    providerNetworkPolicyReport: singleOptionalPath(
      options.providerNetworkPolicyReport,
      '--provider-network-policy-report',
    ),
  }
}

function singlePath(value: string | undefined, optionName: string): string {
  const entries = splitPathList(value)
  if (entries.length !== 1) {
    throw new Error(`${optionName} accepts exactly one file for security report-provenance-verification-readiness v1.`)
  }
  return entries[0]
}

function singleOptionalPath(value: string | undefined, optionName: string): string | undefined {
  const entries = splitPathList(value)
  if (entries.length > 1) {
    throw new Error(`${optionName} accepts one file for security report-provenance-verification-readiness v1.`)
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
  options: Pick<ProvenanceVerificationReadinessOptions, 'output' | 'markdown'>,
): Promise<void> {
  const outputPath = options.output ? resolveRepoPath(root, options.output) : null
  const markdownPath = options.markdown ? resolveRepoPath(root, options.markdown) : null
  if (!outputPath) throw new Error('security report-provenance-verification-readiness requires --output <json>.')
  if (markdownPath && path.resolve(outputPath) === path.resolve(markdownPath)) {
    throw new Error('Provenance verification readiness JSON output and Markdown output must be different paths.')
  }
  const resolvedSources = sourcePaths.map((entry) => path.resolve(entry))
  for (const target of [outputPath, markdownPath].filter((entry): entry is string => Boolean(entry))) {
    const relativeTarget = relativePath(root, target)
    if (resolvedSources.some((source) => source === path.resolve(target))) {
      throw new Error(`Provenance verification readiness output ${relativeTarget} would overwrite a source input.`)
    }
    if (
      hasDevViewControlDirectory(relativeTarget) ||
      hasCodexControlDirectory(relativeTarget) ||
      hasHiddenControlDirectorySegment(relativeTarget)
    ) {
      throw new Error(`Provenance verification readiness output ${relativeTarget} is inside a protected control path.`)
    }
    if (looksLikeSourceAuthorityPath(relativeTarget)) {
      throw new Error(
        `Provenance verification readiness output ${relativeTarget} looks like a source authority artifact.`,
      )
    }
  }
}

function renderMarkdown(report: ProvenanceVerificationReadinessReport): string {
  return [
    '# DevView Provenance Verification Readiness',
    '',
    `- status: ${report.status}`,
    `- readinessStatus: ${report.provenanceVerificationReadinessStatus}`,
    `- provenanceAttestationValidation: ${report.sourceProvenanceAttestationValidation.path}`,
    `- attestationFormat: ${report.sourceProvenanceAttestationValidation.attestationFormat ?? 'unknown'}`,
    `- packageDigestAlignment: ${report.sourceProvenanceAttestationValidation.packageDigestAlignmentStatus ?? 'unknown'}`,
    `- signatureValidationStatus: ${report.sourceProvenanceAttestationValidation.signatureValidationStatus ?? 'unknown'}`,
    `- signingReadinessSupplied: ${report.sourceSigningReadiness.supplied}`,
    `- rbacPolicyValidationSupplied: ${report.sourceRbacPolicyValidation.supplied}`,
    `- providerNetworkDefaultDenyRecorded: ${report.networkIsolationReadiness.providerNetworkDefaultDenyRecorded}`,
    '',
    '## Verification Boundary',
    '- realSlsaVerificationPerformed: false',
    '- realInTotoVerificationPerformed: false',
    '- cryptographicSignatureVerified: false',
    '- rbacEnforced: false',
    '- permissionVerified: false',
    '',
    '## Findings',
    ...report.provenanceVerificationFindings.map(
      (finding) => `- [${finding.severity}] ${finding.code}: ${finding.message}`,
    ),
    '',
  ].join('\n')
}

function blockingFinding(
  code: string,
  message: string,
  pathValue?: string,
  field?: string,
): ProvenanceVerificationReadinessFinding {
  return { severity: 'blocker', code, message, path: pathValue, field }
}

function gapFinding(
  code: string,
  message: string,
  pathValue?: string,
  field?: string,
): ProvenanceVerificationReadinessFinding {
  return { severity: 'gap', code, message, path: pathValue, field }
}

function advisoryFinding(
  code: string,
  message: string,
  pathValue?: string,
  field?: string,
): ProvenanceVerificationReadinessFinding {
  return { severity: 'advisory', code, message, path: pathValue, field }
}

function satisfiedFinding(
  code: string,
  message: string,
  pathValue?: string,
  field?: string,
): ProvenanceVerificationReadinessFinding {
  return { severity: 'satisfied', code, message, path: pathValue, field }
}

function collectTrueFieldHits(
  value: unknown,
  fieldNames: string[],
  pathParts: string[] = [],
): Array<{ field: string; path: string }> {
  if (!value || typeof value !== 'object') return []
  const hits: Array<{ field: string; path: string }> = []
  for (const [key, entry] of Object.entries(value as JsonRecord)) {
    const nextPath = [...pathParts, key]
    if (fieldNames.includes(key) && entry === true) hits.push({ field: key, path: nextPath.join('.') })
    if (entry && typeof entry === 'object') hits.push(...collectTrueFieldHits(entry, fieldNames, nextPath))
  }
  return hits
}

function asRecord(value: unknown): JsonRecord | null {
  return isJsonRecord(value) ? value : null
}

function isJsonRecord(value: unknown): value is JsonRecord {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

function stringValue(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null
}

function numberValue(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function booleanValue(value: unknown): boolean {
  return value === true
}

function booleanOrNull(value: unknown): boolean | null {
  return typeof value === 'boolean' ? value : null
}

function arrayLength(value: unknown): number | null {
  return Array.isArray(value) ? value.length : null
}

function looksLikeSourceAuthorityPath(filePath: string): boolean {
  const normalized = filePath.replaceAll('\\', '/').toLowerCase()
  return (
    normalized.includes('source-authority') ||
    normalized.includes('/source-authority') ||
    normalized.endsWith('project-profile.json') ||
    normalized.endsWith('extension-manifest.json') ||
    normalized.endsWith('package.json') ||
    normalized.endsWith('sbom-artifact.json') ||
    normalized.endsWith('provenance-attestation.json') ||
    normalized.endsWith('provenance-attestation-artifact.json')
  )
}

function resolveRepoPath(root: string, filePath: string): string {
  return path.isAbsolute(filePath) ? path.resolve(filePath) : path.resolve(root, filePath)
}
