import path from 'node:path'
import { readFile } from 'node:fs/promises'
import { relativePath, writeJsonAtomic, writeTextAtomic } from './fs.js'
import {
  hasCodexControlDirectory,
  hasDevViewControlDirectory,
  hasHiddenControlDirectorySegment,
} from './path-safety.js'

type JsonRecord = Record<string, unknown>

const REPORT_ROLE = 'devview-signing-readiness-report'
const REPORTED_STATUS = 'devview-signing-readiness-reported'
const BLOCKED_STATUS = 'devview-signing-readiness-blocked'
const RBAC_READINESS_ROLE = 'devview-rbac-readiness-report'
const RBAC_READINESS_STATUS = 'devview-rbac-readiness-reported'
const RECORD_ENVELOPE_PREVIEW_ROLE = 'devview-record-envelope-preview'
const RECORD_ENVELOPE_PREVIEW_STATUS = 'devview-record-envelope-previewed'
const RECORD_ENVELOPE_PREVIEW_SIGNATURE_MODE = 'unsigned-deterministic-preview'
const RECORD_ENVELOPE_VERIFICATION_ROLE = 'devview-record-envelope-verification-report'
const RECORD_ENVELOPE_VERIFICATION_STATUS = 'devview-record-envelope-verified'
const RECORD_ENVELOPE_VERIFICATION_SIGNATURE_MODE = 'not-performed-unsigned-preview-only'
const ENTERPRISE_READINESS_ROLE = 'devview-enterprise-readiness-report'
const ENTERPRISE_READINESS_STATUS = 'devview-enterprise-readiness-report-generated'

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

const signingAuthorityFields = [
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
  'rbacEnforced',
  'permissionVerified',
  'rbacPermissionVerified',
]

export interface SigningReadinessReportOptions {
  rbacReadiness?: string
  recordEnvelopePreview?: string
  recordEnvelopeVerification?: string
  enterpriseReadiness?: string
  output?: string
  markdown?: string
}

export interface SigningReadinessFinding {
  severity: 'blocker' | 'gap' | 'advisory' | 'satisfied'
  code: string
  message: string
  path?: string
  field?: string
}

interface SourceSummary {
  supplied: boolean
  path: string | null
  artifactRole: string | null
  status: string | null
}

interface LoadedSource {
  requestedPath: string
  resolvedPath: string
  relativePath: string
  sourceKind: 'rbac-readiness' | 'record-envelope-preview' | 'record-envelope-verification' | 'enterprise-readiness'
  record: JsonRecord | null
  readError: string | null
}

export interface SigningReadinessReport {
  schemaVersion: 1
  artifactRole: typeof REPORT_ROLE
  status: typeof REPORTED_STATUS | typeof BLOCKED_STATUS
  readinessScope: 'signing-key-governance-readiness-report-only'
  sourceFactsOnly: true
  reportOnly: true
  signingReadinessStatus: 'not-ready-policy-and-key-governance-missing'
  sourceRbacReadiness: SourceSummary & {
    actorModelPresent: boolean | null
    rolePermissionMatrixPresent: boolean | null
    artifactPermissionMappingPresent: boolean | null
    rbacEnforced: boolean | null
    signedRecordEnvelopePresent: boolean | null
    cryptographicSigningImplemented: boolean | null
    keyManagementImplemented: boolean | null
  }
  sourceRecordEnvelopePreviews: Array<
    SourceSummary & {
      supplied: true
      payloadSha256Present: boolean
      sourceArtifactDigestCount: number
      actorIdentityRecorded: boolean
      requiredPermission: string | null
      signatureMode: string | null
      cryptographicSignaturePresent: boolean | null
      cryptographicSignatureVerified: boolean | null
      rbacEnforced: boolean | null
      permissionVerified: boolean | null
      previousEnvelopeLinked: boolean | null
    }
  >
  sourceRecordEnvelopeVerifications: Array<
    SourceSummary & {
      supplied: true
      sourcePreviewPath: string | null
      payloadDigestMatches: boolean | null
      allSourceDigestsMatch: boolean | null
      previousEnvelopeChainLinkVerified: boolean | null
      verificationDigestPresent: boolean
      signatureVerificationMode: string | null
      cryptographicSignatureVerified: boolean | null
      rbacPermissionVerified: boolean | null
      rbacEnforced: boolean | null
      permissionVerified: boolean | null
    }
  >
  sourceEnterpriseReadiness: SourceSummary & {
    readinessLevel: string | null
    signingReadinessStatus: string | null
    envelopePreviewCount: number | null
    envelopeVerificationCount: number | null
    signedRecordEnvelopePresent: boolean | null
  }
  envelopePrerequisiteSummary: {
    previewCount: number
    verificationCount: number
    payloadDigestVerifiedCount: number
    sourceDigestVerifiedCount: number
    previousChainVerifiedCount: number
    signedEnvelopeCount: 0
    cryptographicSignatureVerifiedCount: 0
    rbacPermissionVerifiedCount: 0
  }
  keyGovernanceReadiness: {
    status: 'not-ready'
    keyRegistryPresent: false
    trustRootPresent: false
    privateKeyStoragePresent: false
    noPrivateKeyStorageInRepo: true
    rotationMetadataPresent: false
    revocationMetadataPresent: false
    keyOwnerRolePolicyPresent: false
    gaps: string[]
  }
  signaturePolicyReadiness: {
    status: 'not-ready'
    detachedSignaturePolicyRequired: true
    detachedSignaturePolicyPresent: false
    allowedAlgorithmsFutureCandidates: string[]
    timestampPolicy: 'explicit-input-only-no-generated-timestamps'
    payloadDigestPolicy: 'raw-json-bytes-sha256-source-facts'
    canonicalizationPolicy: 'raw-byte-digest-now-canonical-json-policy-required-before-real-signing'
    signatureFormatPolicyPresent: false
    gaps: string[]
  }
  rbacPrerequisiteSummary: {
    actorModelPresent: boolean
    permissionMatrixPresent: boolean
    artifactPermissionMappingPresent: boolean
    roleAssignmentRegistryPresent: false
    rbacEnforced: false
    permissionVerificationEnforced: false
    gaps: string[]
  }
  futureSignedEnvelopeRequirements: string[]
  signingReadinessFindings: SigningReadinessFinding[]
  downstreamActionPlan: string[]
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

export class SigningReadinessReportValidationError extends Error {
  readonly report: SigningReadinessReport

  constructor(report: SigningReadinessReport) {
    super('Signing readiness reporting is blocked.')
    this.report = report
  }
}

export async function reportSigningReadiness(
  root: string,
  options: SigningReadinessReportOptions,
): Promise<SigningReadinessReport> {
  validateRequiredOptions(options)
  const previewPaths = parseList(options.recordEnvelopePreview)
  const verificationPaths = parseList(options.recordEnvelopeVerification)
  const sourcePaths = [
    options.rbacReadiness,
    ...previewPaths,
    ...verificationPaths,
    options.enterpriseReadiness,
  ].filter((entry): entry is string => Boolean(entry))
  await assertOutputAuthority(
    root,
    sourcePaths.map((entry) => resolveRepoPath(root, entry)),
    options,
  )

  const rbacReadiness = options.rbacReadiness ? await loadSource(root, options.rbacReadiness, 'rbac-readiness') : null
  const previews = await Promise.all(previewPaths.map((entry) => loadSource(root, entry, 'record-envelope-preview')))
  const verifications = await Promise.all(
    verificationPaths.map((entry) => loadSource(root, entry, 'record-envelope-verification')),
  )
  const enterpriseReadiness = options.enterpriseReadiness
    ? await loadSource(root, options.enterpriseReadiness, 'enterprise-readiness')
    : null

  const blockingFindings = validateSources(rbacReadiness, previews, verifications, enterpriseReadiness)
  if (blockingFindings.length > 0) {
    throw new SigningReadinessReportValidationError(
      buildReport(rbacReadiness, previews, verifications, enterpriseReadiness, blockingFindings, true),
    )
  }

  const report = buildReport(
    rbacReadiness,
    previews,
    verifications,
    enterpriseReadiness,
    buildFindings(rbacReadiness, previews, verifications, enterpriseReadiness),
  )
  const outputPath = resolveRepoPath(root, options.output ?? '')
  report.writtenOutputPath = relativePath(root, outputPath)
  await writeJsonAtomic(outputPath, report)
  if (options.markdown) {
    const markdownPath = resolveRepoPath(root, options.markdown)
    report.writtenMarkdownPath = relativePath(root, markdownPath)
    await writeTextAtomic(markdownPath, renderMarkdown(report))
    await writeJsonAtomic(outputPath, report)
  }
  return report
}

function buildReport(
  rbacReadiness: LoadedSource | null,
  previews: LoadedSource[],
  verifications: LoadedSource[],
  enterpriseReadiness: LoadedSource | null,
  findings: SigningReadinessFinding[],
  blocked = false,
): SigningReadinessReport {
  const rbacRecord = rbacReadiness?.record ?? null
  const previewRecords = previews.map((entry) => entry.record).filter(isJsonRecord)
  const verificationRecords = verifications.map((entry) => entry.record).filter(isJsonRecord)
  const enterpriseRecord = enterpriseReadiness?.record ?? null
  const enterpriseRbac = asRecord(enterpriseRecord?.rbacAndSigningReadiness)
  const enterpriseAudit = asRecord(enterpriseRecord?.auditAndTamperEvidenceReadiness)

  return {
    schemaVersion: 1,
    artifactRole: REPORT_ROLE,
    status: blocked ? BLOCKED_STATUS : REPORTED_STATUS,
    readinessScope: 'signing-key-governance-readiness-report-only',
    sourceFactsOnly: true,
    reportOnly: true,
    signingReadinessStatus: 'not-ready-policy-and-key-governance-missing',
    sourceRbacReadiness: {
      supplied: Boolean(rbacReadiness),
      path: rbacReadiness?.relativePath ?? null,
      artifactRole: stringValue(rbacRecord?.artifactRole),
      status: stringValue(rbacRecord?.status),
      actorModelPresent: booleanFromArray(rbacRecord?.actorModelSummary),
      rolePermissionMatrixPresent: booleanFromArray(rbacRecord?.rolePermissionMatrix),
      artifactPermissionMappingPresent: booleanFromArray(rbacRecord?.artifactPermissionMapping),
      rbacEnforced: booleanOrNull(rbacRecord?.rbacEnforced),
      signedRecordEnvelopePresent: booleanOrNull(rbacRecord?.signedRecordEnvelopePresent),
      cryptographicSigningImplemented: booleanOrNull(rbacRecord?.cryptographicSigningImplemented),
      keyManagementImplemented: booleanOrNull(rbacRecord?.keyManagementImplemented),
    },
    sourceRecordEnvelopePreviews: previews.map((source) => previewSummary(source)),
    sourceRecordEnvelopeVerifications: verifications.map((source) => verificationSummary(source)),
    sourceEnterpriseReadiness: {
      supplied: Boolean(enterpriseReadiness),
      path: enterpriseReadiness?.relativePath ?? null,
      artifactRole: stringValue(enterpriseRecord?.artifactRole),
      status: stringValue(enterpriseRecord?.status),
      readinessLevel: stringValue(enterpriseRecord?.readinessLevel),
      signingReadinessStatus: stringValue(enterpriseRbac?.status),
      envelopePreviewCount: numberValue(enterpriseAudit?.envelopePreviewCount),
      envelopeVerificationCount: numberValue(enterpriseAudit?.envelopeVerificationCount),
      signedRecordEnvelopePresent: booleanOrNull(enterpriseRbac?.signedRecordEnvelopePresent),
    },
    envelopePrerequisiteSummary: {
      previewCount: previewRecords.length,
      verificationCount: verificationRecords.length,
      payloadDigestVerifiedCount: payloadDigestVerifiedCount(verificationRecords),
      sourceDigestVerifiedCount: sourceDigestVerifiedCount(verificationRecords),
      previousChainVerifiedCount: previousChainVerifiedCount(verificationRecords),
      signedEnvelopeCount: 0,
      cryptographicSignatureVerifiedCount: 0,
      rbacPermissionVerifiedCount: 0,
    },
    keyGovernanceReadiness: {
      status: 'not-ready',
      keyRegistryPresent: false,
      trustRootPresent: false,
      privateKeyStoragePresent: false,
      noPrivateKeyStorageInRepo: true,
      rotationMetadataPresent: false,
      revocationMetadataPresent: false,
      keyOwnerRolePolicyPresent: false,
      gaps: [
        'Key registry policy artifact is not present.',
        'Trust root policy is not present.',
        'Key rotation and revocation metadata are not present.',
        'Key owner and role policy is not present.',
      ],
    },
    signaturePolicyReadiness: {
      status: 'not-ready',
      detachedSignaturePolicyRequired: true,
      detachedSignaturePolicyPresent: false,
      allowedAlgorithmsFutureCandidates: ['Ed25519', 'ECDSA-P256-SHA256', 'RSA-PSS-SHA256'],
      timestampPolicy: 'explicit-input-only-no-generated-timestamps',
      payloadDigestPolicy: 'raw-json-bytes-sha256-source-facts',
      canonicalizationPolicy: 'raw-byte-digest-now-canonical-json-policy-required-before-real-signing',
      signatureFormatPolicyPresent: false,
      gaps: [
        'Detached signature envelope policy is not present.',
        'Allowed algorithm policy is not enforced.',
        'Canonical JSON payload policy is not implemented for real signing.',
        'Signature verification report semantics are future work.',
      ],
    },
    rbacPrerequisiteSummary: {
      actorModelPresent: Boolean(Array.isArray(rbacRecord?.actorModelSummary) && rbacRecord.actorModelSummary.length),
      permissionMatrixPresent: Boolean(
        Array.isArray(rbacRecord?.rolePermissionMatrix) && rbacRecord.rolePermissionMatrix.length,
      ),
      artifactPermissionMappingPresent: Boolean(
        Array.isArray(rbacRecord?.artifactPermissionMapping) && rbacRecord.artifactPermissionMapping.length,
      ),
      roleAssignmentRegistryPresent: false,
      rbacEnforced: false,
      permissionVerificationEnforced: false,
      gaps: [
        'Role assignment registry is not present.',
        'RBAC permission verification is not enforced.',
        'Actor identity provider and assurance policy are not implemented.',
      ],
    },
    futureSignedEnvelopeRequirements: [
      'detached signature fields',
      'keyId',
      'signatureAlgorithm',
      'signatureValue or signaturePath',
      'keyRegistryRef',
      'signature verification report',
      'previous envelope hash-chain semantics',
      'explicit timestamp policy',
      'actor identity and permission verification source',
    ],
    signingReadinessFindings: findings,
    downstreamActionPlan: downstreamActionPlan(findings),
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
  rbacReadiness: LoadedSource | null,
  previews: LoadedSource[],
  verifications: LoadedSource[],
  enterpriseReadiness: LoadedSource | null,
): SigningReadinessFinding[] {
  const findings: SigningReadinessFinding[] = []
  for (const source of [rbacReadiness, ...previews, ...verifications, enterpriseReadiness].filter(
    (entry): entry is LoadedSource => Boolean(entry),
  )) {
    if (source.readError) {
      findings.push(blockingFinding('SIGNING_READINESS_SOURCE_READ_FAILED', source.readError, source.relativePath))
      continue
    }
    const record = source.record ?? {}
    validateRoleStatus(source, record, findings)
    validateSourceSpecificClaims(source, record, findings)
    for (const hit of collectTrueFieldHits(record, unsafeAuthorityFields)) {
      findings.push({
        severity: 'blocker',
        code: 'SIGNING_READINESS_UNSAFE_SOURCE_AUTHORITY_FLAG',
        message: `${source.relativePath} contains unsafe signing readiness source flag ${hit.field}: true.`,
        path: source.relativePath,
        field: hit.field,
      })
    }
    for (const hit of collectTrueFieldHits(record, signingAuthorityFields)) {
      findings.push({
        severity: 'blocker',
        code: 'SIGNING_READINESS_SIGNING_OR_RBAC_CLAIM_UNSUPPORTED',
        message: `${source.relativePath} claims signing/key/RBAC field ${hit.field}: true.`,
        path: source.relativePath,
        field: hit.field,
      })
    }
  }
  return findings
}

function validateRoleStatus(source: LoadedSource, record: JsonRecord, findings: SigningReadinessFinding[]): void {
  if (source.sourceKind === 'rbac-readiness') {
    if (record.artifactRole !== RBAC_READINESS_ROLE || record.status !== RBAC_READINESS_STATUS) {
      findings.push(
        blockingFinding(
          'SIGNING_READINESS_RBAC_SOURCE_ROLE_STATUS_INVALID',
          `${source.relativePath} must be ${RBAC_READINESS_ROLE} with reported status.`,
          source.relativePath,
        ),
      )
    }
  } else if (source.sourceKind === 'record-envelope-preview') {
    if (record.artifactRole !== RECORD_ENVELOPE_PREVIEW_ROLE || record.status !== RECORD_ENVELOPE_PREVIEW_STATUS) {
      findings.push(
        blockingFinding(
          'SIGNING_READINESS_RECORD_ENVELOPE_PREVIEW_SOURCE_ROLE_STATUS_INVALID',
          `${source.relativePath} must be ${RECORD_ENVELOPE_PREVIEW_ROLE} with previewed status.`,
          source.relativePath,
        ),
      )
    }
  } else if (source.sourceKind === 'record-envelope-verification') {
    if (
      record.artifactRole !== RECORD_ENVELOPE_VERIFICATION_ROLE ||
      record.status !== RECORD_ENVELOPE_VERIFICATION_STATUS
    ) {
      findings.push(
        blockingFinding(
          'SIGNING_READINESS_RECORD_ENVELOPE_VERIFICATION_SOURCE_ROLE_STATUS_INVALID',
          `${source.relativePath} must be ${RECORD_ENVELOPE_VERIFICATION_ROLE} with verified status.`,
          source.relativePath,
        ),
      )
    }
  } else if (record.artifactRole !== ENTERPRISE_READINESS_ROLE || record.status !== ENTERPRISE_READINESS_STATUS) {
    findings.push(
      blockingFinding(
        'SIGNING_READINESS_ENTERPRISE_SOURCE_ROLE_STATUS_INVALID',
        `${source.relativePath} must be ${ENTERPRISE_READINESS_ROLE} with generated status.`,
        source.relativePath,
      ),
    )
  }
}

function validateSourceSpecificClaims(
  source: LoadedSource,
  record: JsonRecord,
  findings: SigningReadinessFinding[],
): void {
  if (
    source.sourceKind === 'record-envelope-preview' &&
    record.signatureMode !== RECORD_ENVELOPE_PREVIEW_SIGNATURE_MODE
  ) {
    findings.push(
      blockingFinding(
        'SIGNING_READINESS_RECORD_ENVELOPE_PREVIEW_SIGNATURE_MODE_INVALID',
        `${source.relativePath} must use unsigned deterministic preview signature mode.`,
        source.relativePath,
        'signatureMode',
      ),
    )
  }
  if (
    source.sourceKind === 'record-envelope-verification' &&
    record.signatureVerificationMode !== RECORD_ENVELOPE_VERIFICATION_SIGNATURE_MODE
  ) {
    findings.push(
      blockingFinding(
        'SIGNING_READINESS_RECORD_ENVELOPE_VERIFICATION_SIGNATURE_MODE_INVALID',
        `${source.relativePath} must use unsigned preview-only signature verification mode.`,
        source.relativePath,
        'signatureVerificationMode',
      ),
    )
  }
}

function buildFindings(
  rbacReadiness: LoadedSource | null,
  previews: LoadedSource[],
  verifications: LoadedSource[],
  enterpriseReadiness: LoadedSource | null,
): SigningReadinessFinding[] {
  const findings: SigningReadinessFinding[] = [
    {
      severity: 'gap',
      code: 'SIGNING_READINESS_NOT_READY',
      message:
        'Signing/key governance is not ready because policy, keys, trust roots, and RBAC enforcement are absent.',
    },
    {
      severity: 'gap',
      code: 'SIGNING_READINESS_KEY_GOVERNANCE_MISSING',
      message: 'Key registry, trust root, rotation, revocation, and key-owner policy are not present.',
    },
    {
      severity: 'gap',
      code: 'SIGNING_READINESS_POLICY_MISSING',
      message:
        'Detached signature policy, algorithm policy, and signed envelope verification semantics are not present.',
    },
  ]
  findings.push(
    rbacReadiness
      ? {
          severity: 'satisfied',
          code: 'SIGNING_READINESS_RBAC_SOURCE_LINKED',
          message: 'RBAC readiness source is linked as a report-only source fact.',
          path: rbacReadiness.relativePath,
        }
      : {
          severity: 'advisory',
          code: 'SIGNING_READINESS_RBAC_SOURCE_NOT_SUPPLIED',
          message: 'RBAC readiness source was not supplied.',
        },
  )
  findings.push(
    previews.length > 0
      ? {
          severity: 'satisfied',
          code: 'SIGNING_READINESS_RECORD_ENVELOPE_PREVIEWS_LINKED',
          message: 'Unsigned record envelope preview sources are linked as source facts.',
          path: previews[0]?.relativePath,
        }
      : {
          severity: 'advisory',
          code: 'SIGNING_READINESS_RECORD_ENVELOPE_PREVIEWS_NOT_SUPPLIED',
          message: 'Unsigned record envelope preview sources were not supplied.',
        },
  )
  findings.push(
    verifications.length > 0
      ? {
          severity: 'satisfied',
          code: 'SIGNING_READINESS_RECORD_ENVELOPE_VERIFICATIONS_LINKED',
          message: 'Record envelope verification sources are linked as unsigned digest verification facts.',
          path: verifications[0]?.relativePath,
        }
      : {
          severity: 'advisory',
          code: 'SIGNING_READINESS_RECORD_ENVELOPE_VERIFICATIONS_NOT_SUPPLIED',
          message: 'Record envelope verification sources were not supplied.',
        },
  )
  findings.push(
    enterpriseReadiness
      ? {
          severity: 'satisfied',
          code: 'SIGNING_READINESS_ENTERPRISE_SOURCE_LINKED',
          message: 'Enterprise readiness source is linked as a source fact.',
          path: enterpriseReadiness.relativePath,
        }
      : {
          severity: 'advisory',
          code: 'SIGNING_READINESS_ENTERPRISE_SOURCE_NOT_SUPPLIED',
          message: 'Enterprise readiness source was not supplied.',
        },
  )
  return findings
}

async function loadSource(
  root: string,
  requestedPath: string,
  sourceKind: LoadedSource['sourceKind'],
): Promise<LoadedSource> {
  const resolvedPath = resolveRepoPath(root, requestedPath)
  const relative = relativePath(root, resolvedPath)
  try {
    const text = await readFile(resolvedPath, 'utf8')
    try {
      const parsed = JSON.parse(text.replace(/^\uFEFF/, '')) as unknown
      return {
        requestedPath,
        resolvedPath,
        relativePath: relative,
        sourceKind,
        record: isJsonRecord(parsed) ? parsed : null,
        readError: isJsonRecord(parsed) ? null : 'JSON content is not an object.',
      }
    } catch (error) {
      return {
        requestedPath,
        resolvedPath,
        relativePath: relative,
        sourceKind,
        record: null,
        readError: error instanceof Error ? error.message : String(error),
      }
    }
  } catch (error) {
    return {
      requestedPath,
      resolvedPath,
      relativePath: relative,
      sourceKind,
      record: null,
      readError: error instanceof Error ? error.message : String(error),
    }
  }
}

function previewSummary(source: LoadedSource): SigningReadinessReport['sourceRecordEnvelopePreviews'][number] {
  const record = source.record ?? {}
  const payloadSummary = asRecord(record.payloadSummary)
  const verificationSummary = asRecord(record.verificationSummary)
  const authorizationClaim = asRecord(record.authorizationClaim)
  return {
    supplied: true,
    path: source.relativePath,
    artifactRole: stringValue(record.artifactRole),
    status: stringValue(record.status),
    payloadSha256Present: Boolean(stringValue(payloadSummary?.sha256)),
    sourceArtifactDigestCount: arrayLength(record.sourceArtifactDigests) ?? 0,
    actorIdentityRecorded: booleanValue(verificationSummary?.actorIdentityRecorded),
    requiredPermission: stringValue(authorizationClaim?.requiredPermission),
    signatureMode: stringValue(record.signatureMode),
    cryptographicSignaturePresent: booleanOrNull(record.cryptographicSignaturePresent),
    cryptographicSignatureVerified: booleanOrNull(verificationSummary?.cryptographicSignatureVerified),
    rbacEnforced: booleanOrNull(record.rbacEnforced),
    permissionVerified: booleanOrNull(record.permissionVerified),
    previousEnvelopeLinked: booleanOrNull(verificationSummary?.previousEnvelopeLinked),
  }
}

function verificationSummary(
  source: LoadedSource,
): SigningReadinessReport['sourceRecordEnvelopeVerifications'][number] {
  const record = source.record ?? {}
  const sourcePreview = asRecord(record.sourceRecordEnvelopePreview)
  const payloadVerification = asRecord(record.payloadVerification)
  const sourceArtifactVerification = asRecord(record.sourceArtifactVerification)
  const previousEnvelopeVerification = asRecord(record.previousEnvelopeVerification)
  return {
    supplied: true,
    path: source.relativePath,
    artifactRole: stringValue(record.artifactRole),
    status: stringValue(record.status),
    sourcePreviewPath: stringValue(sourcePreview?.path),
    payloadDigestMatches: booleanOrNull(payloadVerification?.digestMatches),
    allSourceDigestsMatch: booleanOrNull(sourceArtifactVerification?.allSourceDigestsMatch),
    previousEnvelopeChainLinkVerified: booleanOrNull(previousEnvelopeVerification?.chainLinkVerified),
    verificationDigestPresent: Boolean(stringValue(record.verificationDigest)),
    signatureVerificationMode: stringValue(record.signatureVerificationMode),
    cryptographicSignatureVerified: booleanOrNull(record.cryptographicSignatureVerified),
    rbacPermissionVerified: booleanOrNull(record.rbacPermissionVerified),
    rbacEnforced: booleanOrNull(record.rbacEnforced),
    permissionVerified: booleanOrNull(record.permissionVerified),
  }
}

function payloadDigestVerifiedCount(records: JsonRecord[]): number {
  return records.filter((record) => booleanValue(asRecord(record.payloadVerification)?.digestMatches)).length
}

function sourceDigestVerifiedCount(records: JsonRecord[]): number {
  return records.filter((record) => booleanValue(asRecord(record.sourceArtifactVerification)?.allSourceDigestsMatch))
    .length
}

function previousChainVerifiedCount(records: JsonRecord[]): number {
  return records.filter((record) => booleanValue(asRecord(record.previousEnvelopeVerification)?.chainLinkVerified))
    .length
}

function downstreamActionPlan(findings: SigningReadinessFinding[]): string[] {
  const actions = new Set<string>()
  actions.add('Create a report-only RBAC role assignment policy validator before real permission enforcement.')
  actions.add(
    'Create a detached signature policy and key registry readiness artifact before any cryptographic signing.',
  )
  actions.add('Keep key generation, private key storage, signing, RBAC enforcement, and enterprise gates disabled.')
  if (findings.some((entry) => entry.severity === 'blocker')) {
    actions.add('Fix invalid signing readiness source artifacts and rerun this report.')
  }
  return [...actions]
}

function validateRequiredOptions(options: SigningReadinessReportOptions): void {
  if (!options.output) throw new Error('security report-signing-readiness requires --output <json>.')
}

async function assertOutputAuthority(
  root: string,
  sourcePaths: string[],
  options: SigningReadinessReportOptions,
): Promise<void> {
  const outputPath = options.output ? resolveRepoPath(root, options.output) : null
  const markdownPath = options.markdown ? resolveRepoPath(root, options.markdown) : null
  if (!outputPath) throw new Error('security report-signing-readiness requires --output <json>.')
  const sourceSet = new Set(sourcePaths.map((entry) => path.resolve(entry)))
  if (markdownPath && path.resolve(outputPath) === path.resolve(markdownPath)) {
    throw new Error('Signing readiness JSON output and Markdown output must be different paths.')
  }
  for (const target of [outputPath, ...(markdownPath ? [markdownPath] : [])]) {
    const relativeTarget = relativePath(root, target)
    if (sourceSet.has(path.resolve(target))) {
      throw new Error(`Signing readiness output would overwrite a source input: ${relativeTarget}.`)
    }
    if (
      hasDevViewControlDirectory(target) ||
      hasCodexControlDirectory(target) ||
      hasHiddenControlDirectorySegment(target)
    ) {
      throw new Error(`Signing readiness output is inside a protected control path: ${relativeTarget}.`)
    }
    if (isSourceAuthorityShapedPath(relativeTarget)) {
      throw new Error(`Signing readiness output would overwrite a source-authority-shaped path: ${relativeTarget}.`)
    }
  }
}

function renderMarkdown(report: SigningReadinessReport): string {
  return [
    '# DevView Signing / Key Governance Readiness',
    '',
    `- status: ${report.status}`,
    `- signingReadinessStatus: ${report.signingReadinessStatus}`,
    `- envelopePreviews: ${report.envelopePrerequisiteSummary.previewCount}`,
    `- envelopeVerifications: ${report.envelopePrerequisiteSummary.verificationCount}`,
    `- payloadDigestVerified: ${report.envelopePrerequisiteSummary.payloadDigestVerifiedCount}`,
    `- signedEnvelopeCount: ${report.envelopePrerequisiteSummary.signedEnvelopeCount}`,
    `- keyRegistryPresent: ${report.keyGovernanceReadiness.keyRegistryPresent}`,
    `- rbacEnforced: ${report.rbacEnforced}`,
    '',
    '## Key Governance Gaps',
    ...report.keyGovernanceReadiness.gaps.map((entry) => `- ${entry}`),
    '',
    '## Signature Policy Gaps',
    ...report.signaturePolicyReadiness.gaps.map((entry) => `- ${entry}`),
    '',
    '## Findings',
    ...report.signingReadinessFindings.map((entry) => `- [${entry.severity}] ${entry.code}: ${entry.message}`),
    '',
    '## Report-Only Safety',
    '- cryptographicSigningImplemented: false',
    '- cryptographicSignaturePresent: false',
    '- cryptographicSignatureVerified: false',
    '- keyGenerated: false',
    '- privateKeyStored: false',
    '- rbacEnforced: false',
    '- permissionVerified: false',
    '- providerInvoked: false',
    '- networkCallMade: false',
    '- graphSourceMutated: false',
    '- enterpriseGateActivated: false',
    '',
  ].join('\n')
}

function collectTrueFieldHits(
  value: unknown,
  fieldNames: string[],
  pathParts: string[] = [],
  seen = new Set<unknown>(),
): Array<{ field: string }> {
  if (typeof value !== 'object' || value === null || seen.has(value)) return []
  seen.add(value)
  if (Array.isArray(value)) {
    return value.flatMap((entry, index) => collectTrueFieldHits(entry, fieldNames, [...pathParts, String(index)], seen))
  }
  const record = value as JsonRecord
  const hits: Array<{ field: string }> = []
  for (const [key, entry] of Object.entries(record)) {
    const nextPath = [...pathParts, key]
    if (fieldNames.includes(key) && entry === true) {
      hits.push({ field: nextPath.join('.') })
    }
    hits.push(...collectTrueFieldHits(entry, fieldNames, nextPath, seen))
  }
  return hits
}

function blockingFinding(code: string, message: string, pathValue?: string, field?: string): SigningReadinessFinding {
  return { severity: 'blocker', code, message, path: pathValue, field }
}

function isSourceAuthorityShapedPath(filePath: string): boolean {
  const normalized = filePath.replace(/\\/g, '/').toLowerCase()
  return (
    normalized.includes('/graph-source') ||
    normalized.includes('/source-authority') ||
    normalized.includes('/read-model') ||
    normalized.includes('/project-memory') ||
    normalized.endsWith('maintainability-graph.json')
  )
}

function resolveRepoPath(root: string, filePath: string): string {
  return path.resolve(root, filePath)
}

function parseList(value: string | undefined): string[] {
  if (!value) return []
  return value
    .split(',')
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0)
}

function isJsonRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function asRecord(value: unknown): JsonRecord | null {
  return isJsonRecord(value) ? value : null
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

function booleanFromArray(value: unknown): boolean | null {
  return Array.isArray(value) ? value.length > 0 : null
}
