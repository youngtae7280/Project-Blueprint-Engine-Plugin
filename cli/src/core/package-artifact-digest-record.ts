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

const REPORT_ROLE = 'devview-package-artifact-digest-record'
const RECORDED_STATUS = 'devview-package-artifact-digest-recorded'
const BLOCKED_STATUS = 'devview-package-artifact-digest-blocked'
const PACKAGE_PROVENANCE_INPUTS_ROLE = 'devview-package-provenance-inputs-record'
const PACKAGE_PROVENANCE_INPUTS_STATUS = 'devview-package-provenance-inputs-recorded'
const RELEASE_SURFACE_ROLE = 'devview-release-surface-validation-report'
const RELEASE_SURFACE_STATUS = 'devview-release-surface-validation-passed'

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

const unsupportedProvenanceAuthorityFields = [
  'packagePublished',
  'publishingPerformed',
  'packageArtifactGeneratedByDevView',
  'packageArtifactGenerated',
  'packageTarballGenerated',
  'packageCreated',
  'packageFileWritten',
  'packageSigningPresent',
  'packageSigned',
  'packageSignaturePresent',
  'packageSignatureVerified',
  'sbomGeneratedByDevView',
  'sbomGenerated',
  'sbomCreated',
  'sbomFileWritten',
  'sbomAttested',
  'provenanceAttestationPresent',
  'provenanceAttested',
  'releaseProvenanceAttested',
  'npmProvenanceEnabled',
  'slsaProvenanceGenerated',
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
  'rbacEnforced',
  'permissionVerified',
  'rbacPermissionVerified',
]

export interface PackageArtifactDigestRecordOptions {
  packageArtifact?: string
  expectedSha256?: string
  packageProvenanceInputs?: string
  releaseSurfaceValidation?: string
  output?: string
  markdown?: string
}

export interface PackageArtifactDigestFinding {
  severity: 'blocker' | 'gap' | 'advisory' | 'satisfied'
  code: string
  message: string
  path?: string
  field?: string
}

interface LoadedPackageArtifact {
  requestedPath: string
  resolvedPath: string
  relativePath: string
  fileName: string
  extension: string
  typeHint: string
  readError: string | null
  sha256: string | null
  byteLength: number | null
}

interface LoadedSource {
  requestedPath: string
  resolvedPath: string
  relativePath: string
  sourceKind: 'package-provenance-inputs' | 'release-surface-validation'
  record: JsonRecord | null
  readError: string | null
  sha256: string | null
  byteLength: number | null
}

export interface PackageArtifactDigestRecord {
  schemaVersion: 1
  artifactRole: typeof REPORT_ROLE
  status: typeof RECORDED_STATUS | typeof BLOCKED_STATUS
  digestScope: 'package-artifact-digest-report-only'
  sourceFactsOnly: true
  reportOnly: true
  artifactDigestStatus: 'computed' | 'matched-expected' | 'mismatch-blocked' | 'blocked'
  sourcePackageArtifact: {
    path: string
    fileName: string
    byteLength: number | null
    sha256: string | null
    extension: string
    typeHint: string
    expectedSha256: string | null
    expectedSha256Supplied: boolean
    expectedSha256Match: boolean | null
  }
  sourcePackageProvenanceInputs: {
    supplied: boolean
    path: string | null
    artifactRole: string | null
    status: string | null
    packageName: string | null
    packageVersion: string | null
    sourceArtifactDigestCount: number | null
    sourceRefStatus: string | null
    buildCommandLabelStatus: string | null
    packageDigestStatus: string | null
    provenanceAttestationStatus: string | null
  }
  sourceReleaseSurfaceValidation: {
    supplied: boolean
    path: string | null
    artifactRole: string | null
    status: string | null
    packageName: string | null
    packageVersion: string | null
    packageFileCount: number | null
    forbiddenFindingCount: number | null
  }
  packageIdentitySummary: {
    packageName: string | null
    packageVersion: string | null
    packageIdentitySource: 'package-provenance-inputs' | 'release-surface-validation' | 'not-supplied'
    sourcesAgree: boolean | null
  }
  sourceArtifactDigests: Array<{
    sourceKind: string
    path: string
    artifactRole: string | null
    status: string | null
    sha256: string | null
    byteLength: number | null
  }>
  packageDigestRecordFindings: PackageArtifactDigestFinding[]
  downstreamActionPlan: string[]
  packageArtifactGeneratedByDevView: false
  packageArtifactGenerated: false
  packageTarballGenerated: false
  packagePublished: false
  publishingPerformed: false
  packageSigningPresent: false
  packageSigned: false
  packageSignaturePresent: false
  packageSignatureVerified: false
  sbomGeneratedByDevView: false
  sbomGenerated: false
  sbomAttested: false
  provenanceAttestationPresent: false
  provenanceAttested: false
  releaseProvenanceAttested: false
  npmProvenanceEnabled: false
  slsaProvenanceGenerated: false
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

export class PackageArtifactDigestRecordValidationError extends Error {
  readonly report: PackageArtifactDigestRecord

  constructor(report: PackageArtifactDigestRecord) {
    super('Package artifact digest recording is blocked.')
    this.report = report
  }
}

export async function recordPackageArtifactDigest(
  root: string,
  options: PackageArtifactDigestRecordOptions,
): Promise<PackageArtifactDigestRecord> {
  validateRequiredOptions(options)
  const packageArtifactPath = resolveRepoPath(root, options.packageArtifact ?? '')
  validateReadablePackageArtifactPath(root, packageArtifactPath)
  const sourcePaths = [
    packageArtifactPath,
    options.packageProvenanceInputs ? resolveRepoPath(root, options.packageProvenanceInputs) : null,
    options.releaseSurfaceValidation ? resolveRepoPath(root, options.releaseSurfaceValidation) : null,
  ].filter((entry): entry is string => Boolean(entry))
  await assertOutputAuthority(root, sourcePaths, options)

  const packageArtifact = await loadPackageArtifact(root, options.packageArtifact ?? '')
  const packageProvenanceInputs = options.packageProvenanceInputs
    ? await loadSource(root, options.packageProvenanceInputs, 'package-provenance-inputs')
    : null
  const releaseSurface = options.releaseSurfaceValidation
    ? await loadSource(root, options.releaseSurfaceValidation, 'release-surface-validation')
    : null

  const blockingFindings = validateInputs(packageArtifact, packageProvenanceInputs, releaseSurface, options)
  if (blockingFindings.length > 0) {
    throw new PackageArtifactDigestRecordValidationError(
      buildReport(packageArtifact, packageProvenanceInputs, releaseSurface, options, blockingFindings, true),
    )
  }

  const report = buildReport(
    packageArtifact,
    packageProvenanceInputs,
    releaseSurface,
    options,
    buildFindings(packageArtifact, packageProvenanceInputs, releaseSurface, options),
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
  packageArtifact: LoadedPackageArtifact,
  packageProvenanceInputs: LoadedSource | null,
  releaseSurface: LoadedSource | null,
  options: PackageArtifactDigestRecordOptions,
  findings: PackageArtifactDigestFinding[],
  blocked = false,
): PackageArtifactDigestRecord {
  const expectedSha = normalizeExpectedSha256(options.expectedSha256)
  const expectedMatch = expectedSha && packageArtifact.sha256 ? expectedSha === packageArtifact.sha256 : null
  return {
    schemaVersion: 1,
    artifactRole: REPORT_ROLE,
    status: blocked ? BLOCKED_STATUS : RECORDED_STATUS,
    digestScope: 'package-artifact-digest-report-only',
    sourceFactsOnly: true,
    reportOnly: true,
    artifactDigestStatus: artifactDigestStatus(packageArtifact, expectedSha, expectedMatch, blocked),
    sourcePackageArtifact: {
      path: packageArtifact.relativePath,
      fileName: packageArtifact.fileName,
      byteLength: packageArtifact.byteLength,
      sha256: packageArtifact.sha256,
      extension: packageArtifact.extension,
      typeHint: packageArtifact.typeHint,
      expectedSha256: expectedSha,
      expectedSha256Supplied: Boolean(options.expectedSha256),
      expectedSha256Match: expectedMatch,
    },
    sourcePackageProvenanceInputs: packageProvenanceInputsSummary(packageProvenanceInputs),
    sourceReleaseSurfaceValidation: releaseSurfaceSummary(releaseSurface),
    packageIdentitySummary: packageIdentitySummary(packageProvenanceInputs, releaseSurface),
    sourceArtifactDigests: sourceArtifactDigests(packageArtifact, packageProvenanceInputs, releaseSurface),
    packageDigestRecordFindings: findings,
    downstreamActionPlan: downstreamActionPlan(findings),
    packageArtifactGeneratedByDevView: false,
    packageArtifactGenerated: false,
    packageTarballGenerated: false,
    packagePublished: false,
    publishingPerformed: false,
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

function validateInputs(
  packageArtifact: LoadedPackageArtifact,
  packageProvenanceInputs: LoadedSource | null,
  releaseSurface: LoadedSource | null,
  options: PackageArtifactDigestRecordOptions,
): PackageArtifactDigestFinding[] {
  const findings: PackageArtifactDigestFinding[] = []
  if (packageArtifact.readError) {
    findings.push(
      blockingFinding(
        'PACKAGE_ARTIFACT_DIGEST_ARTIFACT_READ_FAILED',
        packageArtifact.readError,
        packageArtifact.relativePath,
      ),
    )
  }
  validateExpectedSha256(packageArtifact, options, findings)
  if (packageProvenanceInputs) validateLoadedSource(packageProvenanceInputs, findings)
  if (releaseSurface) validateLoadedSource(releaseSurface, findings)
  if (packageProvenanceInputs) validatePackageProvenanceInputsSource(packageProvenanceInputs, findings)
  if (releaseSurface) validateReleaseSurfaceSource(releaseSurface, findings)
  validatePackageIdentityAgreement(packageProvenanceInputs, releaseSurface, findings)
  for (const source of [packageProvenanceInputs, releaseSurface].filter((entry): entry is LoadedSource =>
    Boolean(entry),
  )) {
    validateUnsafeAuthorityFlags(source, findings)
    validateUnsupportedAuthorityClaims(source, findings)
  }
  return findings
}

function validateExpectedSha256(
  packageArtifact: LoadedPackageArtifact,
  options: PackageArtifactDigestRecordOptions,
  findings: PackageArtifactDigestFinding[],
): void {
  if (!options.expectedSha256) return
  const expectedSha = normalizeExpectedSha256(options.expectedSha256)
  if (!expectedSha) {
    findings.push(
      blockingFinding(
        'PACKAGE_ARTIFACT_DIGEST_EXPECTED_SHA256_INVALID',
        '--expected-sha256 must be a 64-character sha256 hex digest.',
        undefined,
        'expectedSha256',
      ),
    )
    return
  }
  if (packageArtifact.sha256 && packageArtifact.sha256 !== expectedSha) {
    findings.push(
      blockingFinding(
        'PACKAGE_ARTIFACT_DIGEST_EXPECTED_SHA256_MISMATCH',
        `${packageArtifact.relativePath} sha256 does not match --expected-sha256.`,
        packageArtifact.relativePath,
        'expectedSha256',
      ),
    )
  }
}

function validateLoadedSource(source: LoadedSource, findings: PackageArtifactDigestFinding[]): void {
  if (source.readError) {
    findings.push(blockingFinding('PACKAGE_ARTIFACT_DIGEST_SOURCE_READ_FAILED', source.readError, source.relativePath))
    return
  }
  if (!source.record) {
    findings.push(
      blockingFinding(
        'PACKAGE_ARTIFACT_DIGEST_SOURCE_NOT_JSON_OBJECT',
        `${source.relativePath} must be a JSON object.`,
        source.relativePath,
      ),
    )
  }
}

function validatePackageProvenanceInputsSource(source: LoadedSource, findings: PackageArtifactDigestFinding[]): void {
  const record = source.record ?? {}
  if (record.artifactRole !== PACKAGE_PROVENANCE_INPUTS_ROLE || record.status !== PACKAGE_PROVENANCE_INPUTS_STATUS) {
    findings.push(
      blockingFinding(
        'PACKAGE_ARTIFACT_DIGEST_PROVENANCE_INPUTS_ROLE_STATUS_INVALID',
        `${source.relativePath} must be ${PACKAGE_PROVENANCE_INPUTS_ROLE} with recorded status.`,
        source.relativePath,
      ),
    )
  }
  if (stringValue(record.packageDigestStatus) !== 'not-computed-no-package-artifact-supplied') {
    findings.push(
      blockingFinding(
        'PACKAGE_ARTIFACT_DIGEST_PROVENANCE_INPUTS_DIGEST_STATUS_UNSUPPORTED',
        `${source.relativePath} must not already claim package artifact digest computation.`,
        source.relativePath,
        'packageDigestStatus',
      ),
    )
  }
  if (stringValue(record.packageArtifactSha256)) {
    findings.push(
      blockingFinding(
        'PACKAGE_ARTIFACT_DIGEST_PROVENANCE_INPUTS_PACKAGE_DIGEST_UNSUPPORTED',
        `${source.relativePath} must not carry a package artifact sha256 before this digest record.`,
        source.relativePath,
        'packageArtifactSha256',
      ),
    )
  }
  if (stringValue(record.provenanceAttestationStatus) !== 'not-generated') {
    findings.push(
      blockingFinding(
        'PACKAGE_ARTIFACT_DIGEST_PROVENANCE_INPUTS_ATTESTATION_UNSUPPORTED',
        `${source.relativePath} must keep provenance attestation status not-generated.`,
        source.relativePath,
        'provenanceAttestationStatus',
      ),
    )
  }
}

function validateReleaseSurfaceSource(source: LoadedSource, findings: PackageArtifactDigestFinding[]): void {
  const record = source.record ?? {}
  if (record.artifactRole !== RELEASE_SURFACE_ROLE || record.status !== RELEASE_SURFACE_STATUS) {
    findings.push(
      blockingFinding(
        'PACKAGE_ARTIFACT_DIGEST_RELEASE_SURFACE_ROLE_STATUS_INVALID',
        `${source.relativePath} must be ${RELEASE_SURFACE_ROLE} with passed status.`,
        source.relativePath,
      ),
    )
  }
  if ((numberValue(record.forbiddenFindingCount) ?? 0) > 0) {
    findings.push(
      blockingFinding(
        'PACKAGE_ARTIFACT_DIGEST_RELEASE_SURFACE_FORBIDDEN_FINDINGS',
        `${source.relativePath} includes forbidden release-surface findings.`,
        source.relativePath,
        'forbiddenFindingCount',
      ),
    )
  }
}

function validatePackageIdentityAgreement(
  packageProvenanceInputs: LoadedSource | null,
  releaseSurface: LoadedSource | null,
  findings: PackageArtifactDigestFinding[],
): void {
  if (!packageProvenanceInputs?.record || !releaseSurface?.record) return
  const provenancePackage = packageIdentityFromPackageProvenanceInputs(packageProvenanceInputs.record)
  const releasePackage = packageIdentityFromReleaseSurface(releaseSurface.record)
  if (
    provenancePackage.packageName &&
    releasePackage.packageName &&
    provenancePackage.packageName !== releasePackage.packageName
  ) {
    findings.push(
      blockingFinding(
        'PACKAGE_ARTIFACT_DIGEST_PACKAGE_NAME_MISMATCH',
        `${releaseSurface.relativePath} package name ${releasePackage.packageName} does not match ${packageProvenanceInputs.relativePath} ${provenancePackage.packageName}.`,
        releaseSurface.relativePath,
        'packageName',
      ),
    )
  }
  if (
    provenancePackage.packageVersion &&
    releasePackage.packageVersion &&
    provenancePackage.packageVersion !== releasePackage.packageVersion
  ) {
    findings.push(
      blockingFinding(
        'PACKAGE_ARTIFACT_DIGEST_PACKAGE_VERSION_MISMATCH',
        `${releaseSurface.relativePath} package version ${releasePackage.packageVersion} does not match ${packageProvenanceInputs.relativePath} ${provenancePackage.packageVersion}.`,
        releaseSurface.relativePath,
        'packageVersion',
      ),
    )
  }
}

function validateUnsafeAuthorityFlags(source: LoadedSource, findings: PackageArtifactDigestFinding[]): void {
  for (const hit of collectTrueFieldHits(source.record ?? {}, unsafeAuthorityFields)) {
    findings.push(
      blockingFinding(
        'PACKAGE_ARTIFACT_DIGEST_UNSAFE_SOURCE_AUTHORITY_FLAG',
        `${source.relativePath} claims unsafe authority field ${hit.field}: true.`,
        source.relativePath,
        hit.path,
      ),
    )
  }
}

function validateUnsupportedAuthorityClaims(source: LoadedSource, findings: PackageArtifactDigestFinding[]): void {
  for (const hit of collectTrueFieldHits(source.record ?? {}, unsupportedProvenanceAuthorityFields)) {
    findings.push(
      blockingFinding(
        'PACKAGE_ARTIFACT_DIGEST_AUTHORITY_CLAIM_UNSUPPORTED',
        `${source.relativePath} claims package/SBOM/signing/provenance authority field ${hit.field}: true.`,
        source.relativePath,
        hit.path,
      ),
    )
  }
}

function buildFindings(
  packageArtifact: LoadedPackageArtifact,
  packageProvenanceInputs: LoadedSource | null,
  releaseSurface: LoadedSource | null,
  options: PackageArtifactDigestRecordOptions,
): PackageArtifactDigestFinding[] {
  const findings: PackageArtifactDigestFinding[] = [
    satisfiedFinding(
      'PACKAGE_ARTIFACT_DIGEST_RECORDED',
      'Package artifact byte digest was recorded from a preexisting artifact without creating, publishing, signing, or attesting it.',
      packageArtifact.relativePath,
    ),
    gapFinding(
      'PACKAGE_ARTIFACT_DIGEST_NO_ATTESTATION_GENERATED',
      'Package provenance attestation, package signing, and SBOM attestation remain not generated.',
    ),
  ]
  if (options.expectedSha256) {
    findings.push(
      satisfiedFinding(
        'PACKAGE_ARTIFACT_DIGEST_EXPECTED_SHA256_MATCHED',
        'Computed package artifact sha256 matched the explicit expected sha256.',
        packageArtifact.relativePath,
        'expectedSha256',
      ),
    )
  } else {
    findings.push(
      advisoryFinding(
        'PACKAGE_ARTIFACT_DIGEST_EXPECTED_SHA256_NOT_SUPPLIED',
        'No expected sha256 was supplied; digest was recorded but not compared to an external expected value.',
      ),
    )
  }
  if (packageProvenanceInputs) {
    findings.push(
      satisfiedFinding(
        'PACKAGE_ARTIFACT_DIGEST_PROVENANCE_INPUTS_LINKED',
        'Package provenance inputs record is linked as a source fact.',
        packageProvenanceInputs.relativePath,
      ),
    )
  } else {
    findings.push(
      gapFinding(
        'PACKAGE_ARTIFACT_DIGEST_PROVENANCE_INPUTS_NOT_SUPPLIED',
        'Package provenance inputs record was not supplied.',
      ),
    )
  }
  if (releaseSurface) {
    findings.push(
      satisfiedFinding(
        'PACKAGE_ARTIFACT_DIGEST_RELEASE_SURFACE_LINKED',
        'Release surface validation report is linked as a source fact.',
        releaseSurface.relativePath,
      ),
    )
  } else {
    findings.push(
      gapFinding(
        'PACKAGE_ARTIFACT_DIGEST_RELEASE_SURFACE_NOT_SUPPLIED',
        'Release surface validation was not supplied.',
      ),
    )
  }
  return findings
}

function packageProvenanceInputsSummary(
  source: LoadedSource | null,
): PackageArtifactDigestRecord['sourcePackageProvenanceInputs'] {
  const record = source?.record ?? null
  const packageSummary = asRecord(record?.packageMetadataSummary)
  const sourceRef = asRecord(record?.sourceRefSummary)
  const buildInput = asRecord(record?.buildInputSummary)
  return {
    supplied: Boolean(source),
    path: source?.relativePath ?? null,
    artifactRole: stringValue(record?.artifactRole),
    status: stringValue(record?.status),
    packageName: stringValue(packageSummary?.packageName),
    packageVersion: stringValue(packageSummary?.packageVersion),
    sourceArtifactDigestCount: arrayLength(record?.sourceArtifactDigests),
    sourceRefStatus: stringValue(sourceRef?.sourceRefStatus),
    buildCommandLabelStatus: stringValue(buildInput?.buildCommandLabelStatus),
    packageDigestStatus: stringValue(record?.packageDigestStatus),
    provenanceAttestationStatus: stringValue(record?.provenanceAttestationStatus),
  }
}

function releaseSurfaceSummary(
  source: LoadedSource | null,
): PackageArtifactDigestRecord['sourceReleaseSurfaceValidation'] {
  const record = source?.record ?? null
  return {
    supplied: Boolean(source),
    path: source?.relativePath ?? null,
    artifactRole: stringValue(record?.artifactRole),
    status: stringValue(record?.status),
    packageName: stringValue(record?.packageName),
    packageVersion: stringValue(record?.packageVersion),
    packageFileCount: numberValue(record?.packageFileCount),
    forbiddenFindingCount: numberValue(record?.forbiddenFindingCount),
  }
}

function packageIdentitySummary(
  packageProvenanceInputs: LoadedSource | null,
  releaseSurface: LoadedSource | null,
): PackageArtifactDigestRecord['packageIdentitySummary'] {
  const provenancePackage = packageProvenanceInputs?.record
    ? packageIdentityFromPackageProvenanceInputs(packageProvenanceInputs.record)
    : null
  const releasePackage = releaseSurface?.record ? packageIdentityFromReleaseSurface(releaseSurface.record) : null
  const selected =
    provenancePackage?.packageName || provenancePackage?.packageVersion ? provenancePackage : releasePackage
  return {
    packageName: selected?.packageName ?? null,
    packageVersion: selected?.packageVersion ?? null,
    packageIdentitySource:
      selected === provenancePackage && selected
        ? 'package-provenance-inputs'
        : selected
          ? 'release-surface-validation'
          : 'not-supplied',
    sourcesAgree:
      provenancePackage && releasePackage
        ? (!provenancePackage.packageName ||
            !releasePackage.packageName ||
            provenancePackage.packageName === releasePackage.packageName) &&
          (!provenancePackage.packageVersion ||
            !releasePackage.packageVersion ||
            provenancePackage.packageVersion === releasePackage.packageVersion)
        : null,
  }
}

function packageIdentityFromPackageProvenanceInputs(record: JsonRecord): {
  packageName: string | null
  packageVersion: string | null
} {
  const packageSummary = asRecord(record.packageMetadataSummary)
  return {
    packageName: stringValue(packageSummary?.packageName),
    packageVersion: stringValue(packageSummary?.packageVersion),
  }
}

function packageIdentityFromReleaseSurface(record: JsonRecord): {
  packageName: string | null
  packageVersion: string | null
} {
  return {
    packageName: stringValue(record.packageName),
    packageVersion: stringValue(record.packageVersion),
  }
}

function sourceArtifactDigests(
  packageArtifact: LoadedPackageArtifact,
  packageProvenanceInputs: LoadedSource | null,
  releaseSurface: LoadedSource | null,
): PackageArtifactDigestRecord['sourceArtifactDigests'] {
  return [
    {
      sourceKind: 'package-artifact',
      path: packageArtifact.relativePath,
      artifactRole: null,
      status: null,
      sha256: packageArtifact.sha256,
      byteLength: packageArtifact.byteLength,
    },
    ...(packageProvenanceInputs ? [sourceDigestEntry(packageProvenanceInputs)] : []),
    ...(releaseSurface ? [sourceDigestEntry(releaseSurface)] : []),
  ]
}

function sourceDigestEntry(source: LoadedSource): PackageArtifactDigestRecord['sourceArtifactDigests'][number] {
  return {
    sourceKind: source.sourceKind,
    path: source.relativePath,
    artifactRole: stringValue(source.record?.artifactRole),
    status: stringValue(source.record?.status),
    sha256: source.sha256,
    byteLength: source.byteLength,
  }
}

async function loadPackageArtifact(root: string, requestedPath: string): Promise<LoadedPackageArtifact> {
  const resolvedPath = resolveRepoPath(root, requestedPath)
  const fileName = path.basename(resolvedPath)
  const extension = path.extname(fileName).toLowerCase()
  const base = {
    requestedPath,
    resolvedPath,
    relativePath: relativePath(root, resolvedPath),
    fileName,
    extension,
    typeHint: packageTypeHint(extension),
  }
  try {
    const bytes = await readFile(resolvedPath)
    return {
      ...base,
      readError: null,
      sha256: sha256(bytes),
      byteLength: bytes.length,
    }
  } catch (error) {
    return {
      ...base,
      readError: error instanceof Error ? error.message : String(error),
      sha256: null,
      byteLength: null,
    }
  }
}

async function loadSource(
  root: string,
  requestedPath: string,
  sourceKind: LoadedSource['sourceKind'],
): Promise<LoadedSource> {
  const resolvedPath = resolveRepoPath(root, requestedPath)
  const base = {
    requestedPath,
    resolvedPath,
    relativePath: relativePath(root, resolvedPath),
    sourceKind,
  }
  try {
    const bytes = await readFile(resolvedPath)
    const raw = bytes.toString('utf8').replace(/^\uFEFF/, '')
    const parsed = JSON.parse(raw) as unknown
    return {
      ...base,
      record: isJsonRecord(parsed) ? parsed : null,
      readError: null,
      sha256: sha256(bytes),
      byteLength: bytes.length,
    }
  } catch (error) {
    return {
      ...base,
      record: null,
      readError: error instanceof Error ? error.message : String(error),
      sha256: null,
      byteLength: null,
    }
  }
}

async function assertOutputAuthority(
  root: string,
  sourcePaths: string[],
  options: Pick<PackageArtifactDigestRecordOptions, 'output' | 'markdown'>,
): Promise<void> {
  const outputPath = options.output ? resolveRepoPath(root, options.output) : null
  const markdownPath = options.markdown ? resolveRepoPath(root, options.markdown) : null
  if (!outputPath) throw new Error('security record-package-artifact-digest requires --output <json>.')
  if (markdownPath && path.resolve(outputPath) === path.resolve(markdownPath)) {
    throw new Error('Package artifact digest JSON output and Markdown output must be different paths.')
  }
  const resolvedSources = sourcePaths.map((entry) => path.resolve(entry))
  for (const candidate of [outputPath, markdownPath].filter((entry): entry is string => Boolean(entry))) {
    const resolvedCandidate = path.resolve(candidate)
    if (resolvedSources.some((source) => source === resolvedCandidate)) {
      throw new Error(`Package artifact digest output ${relativePath(root, candidate)} would overwrite a source input.`)
    }
    const relativeTarget = relativePath(root, candidate)
    if (
      hasDevViewControlDirectory(relativeTarget) ||
      hasCodexControlDirectory(relativeTarget) ||
      hasHiddenControlDirectorySegment(relativeTarget)
    ) {
      throw new Error(`Package artifact digest output ${relativeTarget} is inside a protected control path.`)
    }
    if (looksLikeSourceAuthorityPath(relativeTarget)) {
      throw new Error(`Package artifact digest output ${relativeTarget} looks like a source authority artifact.`)
    }
  }
}

function validateReadablePackageArtifactPath(root: string, artifactPath: string): void {
  const relativeTarget = relativePath(root, artifactPath)
  if (
    hasDevViewControlDirectory(relativeTarget) ||
    hasCodexControlDirectory(relativeTarget) ||
    hasHiddenControlDirectorySegment(relativeTarget)
  ) {
    throw new Error(`Package artifact ${relativeTarget} is inside a protected control path.`)
  }
  if (looksLikeSourceAuthorityPath(relativeTarget)) {
    throw new Error(`Package artifact ${relativeTarget} looks like a source authority artifact.`)
  }
}

function validateRequiredOptions(options: PackageArtifactDigestRecordOptions): void {
  if (!options.packageArtifact) {
    throw new Error('security record-package-artifact-digest requires --package-artifact <file>.')
  }
  if (!options.output) throw new Error('security record-package-artifact-digest requires --output <json>.')
}

function artifactDigestStatus(
  packageArtifact: LoadedPackageArtifact,
  expectedSha: string | null,
  expectedMatch: boolean | null,
  blocked: boolean,
): PackageArtifactDigestRecord['artifactDigestStatus'] {
  if (blocked && expectedSha && expectedMatch === false) return 'mismatch-blocked'
  if (blocked) return 'blocked'
  if (expectedSha) return 'matched-expected'
  return packageArtifact.sha256 ? 'computed' : 'blocked'
}

function downstreamActionPlan(findings: PackageArtifactDigestFinding[]): string[] {
  const actions = new Set<string>()
  if (findings.some((finding) => finding.severity === 'blocker')) {
    actions.add('Fix package artifact digest, source role/status, package identity, or unsafe authority blockers.')
  }
  actions.add('Integrate this package artifact digest record into enterprise readiness as a source fact.')
  actions.add(
    'Validate a preexisting provenance attestation artifact against this digest before any real attestation generation.',
  )
  actions.add('Keep package signing, provenance attestation, and SBOM attestation behind signing/key/RBAC governance.')
  return [...actions]
}

function renderMarkdown(report: PackageArtifactDigestRecord): string {
  return [
    '# DevView Package Artifact Digest Record',
    '',
    `- status: ${report.status}`,
    `- artifact: ${report.sourcePackageArtifact.path}`,
    `- sha256: ${report.sourcePackageArtifact.sha256 ?? 'unavailable'}`,
    `- byteLength: ${report.sourcePackageArtifact.byteLength ?? 'unavailable'}`,
    `- artifactDigestStatus: ${report.artifactDigestStatus}`,
    `- expectedSha256Match: ${report.sourcePackageArtifact.expectedSha256Match ?? 'not-supplied'}`,
    `- package: ${report.packageIdentitySummary.packageName ?? 'unknown'}@${report.packageIdentitySummary.packageVersion ?? 'unknown'}`,
    `- packageGeneratedByDevView: ${report.packageArtifactGeneratedByDevView}`,
    `- packageSigned: ${report.packageSigned}`,
    `- provenanceAttested: ${report.provenanceAttested}`,
    '',
    '## Findings',
    ...report.packageDigestRecordFindings.map(
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
): PackageArtifactDigestFinding {
  return { severity: 'blocker', code, message, path: pathValue, field }
}

function gapFinding(code: string, message: string, pathValue?: string, field?: string): PackageArtifactDigestFinding {
  return { severity: 'gap', code, message, path: pathValue, field }
}

function advisoryFinding(
  code: string,
  message: string,
  pathValue?: string,
  field?: string,
): PackageArtifactDigestFinding {
  return { severity: 'advisory', code, message, path: pathValue, field }
}

function satisfiedFinding(
  code: string,
  message: string,
  pathValue?: string,
  field?: string,
): PackageArtifactDigestFinding {
  return { severity: 'satisfied', code, message, path: pathValue, field }
}

function collectTrueFieldHits(
  record: unknown,
  fieldNames: string[],
  pathParts: string[] = [],
): Array<{ field: string; path: string }> {
  if (!record || typeof record !== 'object') return []
  const hits: Array<{ field: string; path: string }> = []
  for (const [key, entry] of Object.entries(record as JsonRecord)) {
    const nextPath = [...pathParts, key]
    if (fieldNames.includes(key) && entry === true) hits.push({ field: key, path: nextPath.join('.') })
    if (entry && typeof entry === 'object') hits.push(...collectTrueFieldHits(entry, fieldNames, nextPath))
  }
  return hits
}

function normalizeExpectedSha256(value: unknown): string | null {
  return typeof value === 'string' && /^[a-fA-F0-9]{64}$/.test(value) ? value.toLowerCase() : null
}

function arrayLength(value: unknown): number | null {
  return Array.isArray(value) ? value.length : null
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

function packageTypeHint(extension: string): string {
  if (extension === '.tgz') return 'npm-package-tarball'
  if (extension === '.tar') return 'tar-archive'
  if (extension === '.gz') return 'gzip-archive'
  if (extension === '.zip') return 'zip-archive'
  return extension ? `${extension.slice(1)}-artifact` : 'package-artifact'
}

function looksLikeSourceAuthorityPath(filePath: string): boolean {
  const normalized = filePath.replaceAll('\\', '/').toLowerCase()
  return (
    normalized.includes('source-authority') ||
    normalized.includes('/source-authority') ||
    normalized.endsWith('project-profile.json') ||
    normalized.endsWith('extension-manifest.json') ||
    normalized.endsWith('package.json') ||
    normalized.endsWith('sbom-artifact.json')
  )
}

function resolveRepoPath(root: string, filePath: string): string {
  return path.isAbsolute(filePath) ? path.resolve(filePath) : path.resolve(root, filePath)
}

function sha256(value: string | Buffer): string {
  return createHash('sha256').update(value).digest('hex')
}
