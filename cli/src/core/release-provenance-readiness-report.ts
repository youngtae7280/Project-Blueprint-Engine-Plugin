import { existsSync } from 'node:fs'
import path from 'node:path'
import { readFile } from 'node:fs/promises'
import { findPluginRoot, relativePath, writeJsonAtomic, writeTextAtomic } from './fs.js'
import {
  hasCodexControlDirectory,
  hasDevViewControlDirectory,
  hasHiddenControlDirectorySegment,
} from './path-safety.js'

type JsonRecord = Record<string, unknown>

const REPORT_ROLE = 'devview-release-provenance-readiness-report'
const REPORTED_STATUS = 'devview-release-provenance-readiness-reported'
const BLOCKED_STATUS = 'devview-release-provenance-readiness-blocked'
const ENTERPRISE_READINESS_ROLE = 'devview-enterprise-readiness-report'
const ENTERPRISE_READINESS_STATUS = 'devview-enterprise-readiness-report-generated'
const SIGNING_READINESS_ROLE = 'devview-signing-readiness-report'
const SIGNING_READINESS_STATUS = 'devview-signing-readiness-reported'
const RBAC_POLICY_VALIDATION_ROLE = 'devview-rbac-policy-validation-report'
const RBAC_POLICY_VALIDATION_STATUS = 'devview-rbac-policy-validation-passed'

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
  'packageSigningPresent',
  'packageSigned',
  'packageSignaturePresent',
  'packageSignatureVerified',
  'packagePublished',
  'publishingPerformed',
  'sbomPresent',
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

export interface ReleaseProvenanceReadinessReportOptions {
  enterpriseReadiness?: string
  signingReadiness?: string
  rbacPolicyValidation?: string
  output?: string
  markdown?: string
}

export interface ReleaseProvenanceFinding {
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
  sourceKind: 'enterprise-readiness' | 'signing-readiness' | 'rbac-policy-validation'
  record: JsonRecord | null
  readError: string | null
}

interface PackageMetadata {
  pluginRoot: string
  packageJsonPath: string
  packageRecord: JsonRecord | null
  packageReadError: string | null
  releaseSurfaceCheckerPath: string
  releaseSurfaceCheckerPresent: boolean
}

export interface ReleaseProvenanceReadinessReport {
  schemaVersion: 1
  artifactRole: typeof REPORT_ROLE
  status: typeof REPORTED_STATUS | typeof BLOCKED_STATUS
  readinessScope: 'release-provenance-sbom-readiness-report-only'
  sourceFactsOnly: true
  reportOnly: true
  releaseProvenanceReadinessStatus: 'not-ready-sbom-and-signing-missing' | 'blocked'
  packageMetadataSummary: {
    packageName: string | null
    packageVersion: string | null
    packagePrivate: boolean | null
    packageJsonPath: string
    packageFilesAllowlistPresent: boolean
    packageFilesAllowlistCount: number
    packageFilesAllowlistEntries: string[]
    releaseSurfaceScriptPresent: boolean
    releaseSurfaceScript: string | null
    releaseSurfaceCheckerPresent: boolean
    releaseSurfaceCheckerPath: string
  }
  releaseSurfaceReadiness: {
    checkerPresent: boolean
    packageDryRunExecuted: false
    packageDryRunReadiness: 'not-executed-report-only'
    packageDryRunSourceSupplied: false
    publicIdentityScanExecuted: false
    publicIdentityScanStatus: 'not-executed-report-only'
    limitations: string[]
  }
  sbomReadiness: {
    sbomPresent: false
    sbomGenerated: false
    sbomAttested: false
    supportedFormatsFutureCandidates: string[]
    requiredFutureFields: string[]
    gaps: string[]
  }
  packageSigningReadiness: {
    packageSigningPresent: false
    packageSignatureVerified: false
    signingReadinessSourceStatus: string | null
    keyRegistryPresent: boolean | null
    trustRootPresent: boolean | null
    privateKeyStoragePresent: boolean | null
    requiredKeyTrustPolicyGaps: string[]
  }
  provenanceAttestationReadiness: {
    provenanceAttestationPresent: false
    provenanceAttested: false
    npmProvenanceEnabled: false
    slsaProvenanceGenerated: false
    requiredFutureFields: string[]
    futureOnlyPolicy: string
  }
  sourceGovernanceSummary: {
    enterpriseReadiness: SourceSummary & {
      readinessLevel: string | null
      releaseSurfaceStatus: string | null
      rbacPolicyValidationReportCount: number | null
    }
    signingReadiness: SourceSummary & {
      signingReadinessStatus: string | null
      keyGovernanceStatus: string | null
      signaturePolicyStatus: string | null
    }
    rbacPolicyValidation: SourceSummary & {
      rbacPolicyValidationStatus: string | null
      defaultDenyConfigured: boolean | null
      actorCount: number | null
      permissionGrantCount: number | null
    }
  }
  releaseProvenanceFindings: ReleaseProvenanceFinding[]
  downstreamActionPlan: string[]
  sbomGenerated: false
  sbomPresent: false
  sbomAttested: false
  packageSigningPresent: false
  packageSigned: false
  packageSignaturePresent: false
  packageSignatureVerified: false
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

export class ReleaseProvenanceReadinessReportValidationError extends Error {
  readonly report: ReleaseProvenanceReadinessReport

  constructor(report: ReleaseProvenanceReadinessReport) {
    super('Release provenance readiness reporting is blocked.')
    this.report = report
  }
}

export async function reportReleaseProvenanceReadiness(
  root: string,
  options: ReleaseProvenanceReadinessReportOptions,
): Promise<ReleaseProvenanceReadinessReport> {
  validateRequiredOptions(options)
  const packageMetadata = await loadPackageMetadata()
  const sourcePaths = [options.enterpriseReadiness, options.signingReadiness, options.rbacPolicyValidation].filter(
    (entry): entry is string => Boolean(entry),
  )
  await assertOutputAuthority(
    root,
    [
      packageMetadata.packageJsonPath,
      ...(packageMetadata.releaseSurfaceCheckerPresent ? [packageMetadata.releaseSurfaceCheckerPath] : []),
      ...sourcePaths.map((entry) => resolveRepoPath(root, entry)),
    ],
    options,
  )

  const enterpriseReadiness = options.enterpriseReadiness
    ? await loadSource(root, options.enterpriseReadiness, 'enterprise-readiness')
    : null
  const signingReadiness = options.signingReadiness
    ? await loadSource(root, options.signingReadiness, 'signing-readiness')
    : null
  const rbacPolicyValidation = options.rbacPolicyValidation
    ? await loadSource(root, options.rbacPolicyValidation, 'rbac-policy-validation')
    : null

  const blockingFindings = validateSources(packageMetadata, enterpriseReadiness, signingReadiness, rbacPolicyValidation)
  if (blockingFindings.length > 0) {
    throw new ReleaseProvenanceReadinessReportValidationError(
      buildReport(packageMetadata, enterpriseReadiness, signingReadiness, rbacPolicyValidation, blockingFindings, true),
    )
  }

  const report = buildReport(
    packageMetadata,
    enterpriseReadiness,
    signingReadiness,
    rbacPolicyValidation,
    buildFindings(packageMetadata, enterpriseReadiness, signingReadiness, rbacPolicyValidation),
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
  packageMetadata: PackageMetadata,
  enterpriseReadiness: LoadedSource | null,
  signingReadiness: LoadedSource | null,
  rbacPolicyValidation: LoadedSource | null,
  findings: ReleaseProvenanceFinding[],
  blocked = false,
): ReleaseProvenanceReadinessReport {
  const packageRecord = packageMetadata.packageRecord
  const scripts = asRecord(packageRecord?.scripts)
  const packageFiles = stringArray(packageRecord?.files)
  const releaseSurfaceScript = stringValue(scripts?.['check:release-surface'])
  const signingRecord = signingReadiness?.record ?? null
  const keyGovernance = asRecord(signingRecord?.keyGovernanceReadiness)
  return {
    schemaVersion: 1,
    artifactRole: REPORT_ROLE,
    status: blocked ? BLOCKED_STATUS : REPORTED_STATUS,
    readinessScope: 'release-provenance-sbom-readiness-report-only',
    sourceFactsOnly: true,
    reportOnly: true,
    releaseProvenanceReadinessStatus: blocked ? 'blocked' : 'not-ready-sbom-and-signing-missing',
    packageMetadataSummary: {
      packageName: stringValue(packageRecord?.name),
      packageVersion: stringValue(packageRecord?.version),
      packagePrivate: booleanOrNull(packageRecord?.private),
      packageJsonPath: path
        .relative(packageMetadata.pluginRoot, packageMetadata.packageJsonPath)
        .replaceAll(path.sep, '/'),
      packageFilesAllowlistPresent: packageFiles.length > 0,
      packageFilesAllowlistCount: packageFiles.length,
      packageFilesAllowlistEntries: packageFiles,
      releaseSurfaceScriptPresent: Boolean(releaseSurfaceScript),
      releaseSurfaceScript,
      releaseSurfaceCheckerPresent: packageMetadata.releaseSurfaceCheckerPresent,
      releaseSurfaceCheckerPath: path
        .relative(packageMetadata.pluginRoot, packageMetadata.releaseSurfaceCheckerPath)
        .replaceAll(path.sep, '/'),
    },
    releaseSurfaceReadiness: {
      checkerPresent: packageMetadata.releaseSurfaceCheckerPresent,
      packageDryRunExecuted: false,
      packageDryRunReadiness: 'not-executed-report-only',
      packageDryRunSourceSupplied: false,
      publicIdentityScanExecuted: false,
      publicIdentityScanStatus: 'not-executed-report-only',
      limitations: [
        'This command does not run npm pack or release-surface validation.',
        'Attach a release-surface validation source through enterprise readiness before enterprise release review.',
      ],
    },
    sbomReadiness: {
      sbomPresent: false,
      sbomGenerated: false,
      sbomAttested: false,
      supportedFormatsFutureCandidates: ['SPDX', 'CycloneDX'],
      requiredFutureFields: [
        'SBOM generator and version',
        'package artifact digest',
        'dependency/component list',
        'license and vulnerability policy',
        'SBOM review actor and digest',
      ],
      gaps: ['No SBOM artifact is generated, supplied, or attested in this report-only slice.'],
    },
    packageSigningReadiness: {
      packageSigningPresent: false,
      packageSignatureVerified: false,
      signingReadinessSourceStatus: stringValue(signingRecord?.signingReadinessStatus),
      keyRegistryPresent: booleanOrNull(keyGovernance?.keyRegistryPresent),
      trustRootPresent: booleanOrNull(keyGovernance?.trustRootPresent),
      privateKeyStoragePresent: booleanOrNull(keyGovernance?.privateKeyStoragePresent),
      requiredKeyTrustPolicyGaps: [
        'No package signing key registry is configured.',
        'No package signing trust root is configured.',
        'No release signing verification report is available.',
      ],
    },
    provenanceAttestationReadiness: {
      provenanceAttestationPresent: false,
      provenanceAttested: false,
      npmProvenanceEnabled: false,
      slsaProvenanceGenerated: false,
      requiredFutureFields: [
        'source repository digest/ref',
        'build command and environment',
        'package artifact digest',
        'builder identity',
        'provenance attestation signature or provider reference',
      ],
      futureOnlyPolicy:
        'SLSA/npm provenance remains future-only until explicit signed policy, CI governance, and release actor identity exist.',
    },
    sourceGovernanceSummary: {
      enterpriseReadiness: enterpriseReadinessSummary(enterpriseReadiness),
      signingReadiness: signingReadinessSummary(signingReadiness),
      rbacPolicyValidation: rbacPolicyValidationSummary(rbacPolicyValidation),
    },
    releaseProvenanceFindings: findings,
    downstreamActionPlan: downstreamActionPlan(findings),
    sbomGenerated: false,
    sbomPresent: false,
    sbomAttested: false,
    packageSigningPresent: false,
    packageSigned: false,
    packageSignaturePresent: false,
    packageSignatureVerified: false,
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

function validateSources(
  packageMetadata: PackageMetadata,
  enterpriseReadiness: LoadedSource | null,
  signingReadiness: LoadedSource | null,
  rbacPolicyValidation: LoadedSource | null,
): ReleaseProvenanceFinding[] {
  const findings: ReleaseProvenanceFinding[] = []
  if (packageMetadata.packageReadError) {
    findings.push(blockingFinding('RELEASE_PROVENANCE_PACKAGE_JSON_READ_FAILED', packageMetadata.packageReadError))
  }
  for (const source of [enterpriseReadiness, signingReadiness, rbacPolicyValidation].filter(
    (entry): entry is LoadedSource => Boolean(entry),
  )) {
    if (source.readError) {
      findings.push(blockingFinding('RELEASE_PROVENANCE_SOURCE_READ_FAILED', source.readError, source.relativePath))
      continue
    }
    const record = source.record ?? {}
    if (source.sourceKind === 'enterprise-readiness') {
      if (record.artifactRole !== ENTERPRISE_READINESS_ROLE || record.status !== ENTERPRISE_READINESS_STATUS) {
        findings.push(
          blockingFinding(
            'RELEASE_PROVENANCE_ENTERPRISE_SOURCE_ROLE_STATUS_INVALID',
            `${source.relativePath} must be ${ENTERPRISE_READINESS_ROLE} with generated status.`,
            source.relativePath,
          ),
        )
      }
    } else if (source.sourceKind === 'signing-readiness') {
      if (record.artifactRole !== SIGNING_READINESS_ROLE || record.status !== SIGNING_READINESS_STATUS) {
        findings.push(
          blockingFinding(
            'RELEASE_PROVENANCE_SIGNING_SOURCE_ROLE_STATUS_INVALID',
            `${source.relativePath} must be ${SIGNING_READINESS_ROLE} with reported status.`,
            source.relativePath,
          ),
        )
      }
    } else if (record.artifactRole !== RBAC_POLICY_VALIDATION_ROLE || record.status !== RBAC_POLICY_VALIDATION_STATUS) {
      findings.push(
        blockingFinding(
          'RELEASE_PROVENANCE_RBAC_POLICY_SOURCE_ROLE_STATUS_INVALID',
          `${source.relativePath} must be ${RBAC_POLICY_VALIDATION_ROLE} with passed status.`,
          source.relativePath,
        ),
      )
    }
    for (const hit of collectTrueFieldHits(record, unsupportedProvenanceAuthorityFields)) {
      findings.push(
        blockingFinding(
          'RELEASE_PROVENANCE_SOURCE_AUTHORITY_CLAIM_UNSUPPORTED',
          `${source.relativePath} claims release/signing/key/RBAC field ${hit.field}: true; release provenance v1 only accepts readiness source facts.`,
          source.relativePath,
          hit.field,
        ),
      )
    }
    for (const hit of collectUnsafeAuthorityHits(record)) {
      findings.push(
        blockingFinding(
          'RELEASE_PROVENANCE_UNSAFE_SOURCE_AUTHORITY_FLAG',
          `${source.relativePath} contains unsafe report-only source flag ${hit.field}: true.`,
          source.relativePath,
          hit.field,
        ),
      )
    }
  }
  return findings
}

function buildFindings(
  packageMetadata: PackageMetadata,
  enterpriseReadiness: LoadedSource | null,
  signingReadiness: LoadedSource | null,
  rbacPolicyValidation: LoadedSource | null,
): ReleaseProvenanceFinding[] {
  const findings: ReleaseProvenanceFinding[] = []
  const packageRecord = packageMetadata.packageRecord
  const scripts = asRecord(packageRecord?.scripts)
  if (stringArray(packageRecord?.files).length > 0) {
    findings.push({
      severity: 'satisfied',
      code: 'RELEASE_PROVENANCE_PACKAGE_FILES_ALLOWLIST_PRESENT',
      message: 'package.json declares a package files allowlist.',
      path: path.relative(packageMetadata.pluginRoot, packageMetadata.packageJsonPath).replaceAll(path.sep, '/'),
    })
  } else {
    findings.push({
      severity: 'gap',
      code: 'RELEASE_PROVENANCE_PACKAGE_FILES_ALLOWLIST_MISSING',
      message: 'package.json does not declare a package files allowlist.',
      path: path.relative(packageMetadata.pluginRoot, packageMetadata.packageJsonPath).replaceAll(path.sep, '/'),
    })
  }
  if (typeof scripts?.['check:release-surface'] === 'string' && packageMetadata.releaseSurfaceCheckerPresent) {
    findings.push({
      severity: 'satisfied',
      code: 'RELEASE_PROVENANCE_RELEASE_SURFACE_CHECKER_PRESENT',
      message: 'Release-surface checker script and package script are present.',
      path: path
        .relative(packageMetadata.pluginRoot, packageMetadata.releaseSurfaceCheckerPath)
        .replaceAll(path.sep, '/'),
    })
  } else {
    findings.push({
      severity: 'gap',
      code: 'RELEASE_PROVENANCE_RELEASE_SURFACE_CHECKER_NOT_CONFIRMED',
      message: 'Release-surface checker script or package script is not confirmed.',
    })
  }
  if (enterpriseReadiness) {
    findings.push({
      severity: 'satisfied',
      code: 'RELEASE_PROVENANCE_ENTERPRISE_READINESS_SOURCE_LINKED',
      message: 'Enterprise readiness report is linked as a source fact.',
      path: enterpriseReadiness.relativePath,
    })
  } else {
    findings.push({
      severity: 'gap',
      code: 'RELEASE_PROVENANCE_ENTERPRISE_READINESS_NOT_SUPPLIED',
      message: 'Enterprise readiness report was not supplied.',
    })
  }
  if (signingReadiness) {
    findings.push({
      severity: 'satisfied',
      code: 'RELEASE_PROVENANCE_SIGNING_READINESS_SOURCE_LINKED',
      message: 'Signing readiness report is linked as a source fact.',
      path: signingReadiness.relativePath,
    })
  } else {
    findings.push({
      severity: 'gap',
      code: 'RELEASE_PROVENANCE_SIGNING_READINESS_NOT_SUPPLIED',
      message: 'Signing readiness report was not supplied.',
    })
  }
  if (rbacPolicyValidation) {
    findings.push({
      severity: 'satisfied',
      code: 'RELEASE_PROVENANCE_RBAC_POLICY_VALIDATION_SOURCE_LINKED',
      message: 'RBAC policy validation report is linked as a source fact.',
      path: rbacPolicyValidation.relativePath,
    })
  } else {
    findings.push({
      severity: 'gap',
      code: 'RELEASE_PROVENANCE_RBAC_POLICY_VALIDATION_NOT_SUPPLIED',
      message: 'RBAC policy validation report was not supplied.',
    })
  }
  findings.push(
    {
      severity: 'blocker',
      code: 'RELEASE_PROVENANCE_SBOM_MISSING',
      message: 'No SBOM artifact is generated, supplied, or attested.',
    },
    {
      severity: 'blocker',
      code: 'RELEASE_PROVENANCE_PACKAGE_SIGNING_MISSING',
      message: 'No package signing or package signature verification is implemented.',
    },
    {
      severity: 'blocker',
      code: 'RELEASE_PROVENANCE_ATTESTATION_MISSING',
      message: 'No package provenance attestation is generated or verified.',
    },
  )
  return findings
}

async function loadPackageMetadata(): Promise<PackageMetadata> {
  const pluginRoot = findPluginRoot(import.meta.url)
  const packageJsonPath = path.join(pluginRoot, 'package.json')
  const releaseSurfaceCheckerPath = path.join(pluginRoot, 'scripts', 'check-devview-release-surface.js')
  try {
    const text = await readFile(packageJsonPath, 'utf8')
    return {
      pluginRoot,
      packageJsonPath,
      packageRecord: JSON.parse(text.replace(/^\uFEFF/, '')) as JsonRecord,
      packageReadError: null,
      releaseSurfaceCheckerPath,
      releaseSurfaceCheckerPresent: existsSync(releaseSurfaceCheckerPath),
    }
  } catch (error) {
    return {
      pluginRoot,
      packageJsonPath,
      packageRecord: null,
      packageReadError: error instanceof Error ? error.message : String(error),
      releaseSurfaceCheckerPath,
      releaseSurfaceCheckerPresent: existsSync(releaseSurfaceCheckerPath),
    }
  }
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
      return {
        requestedPath,
        resolvedPath,
        relativePath: relative,
        sourceKind,
        record: JSON.parse(text.replace(/^\uFEFF/, '')) as JsonRecord,
        readError: null,
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

function enterpriseReadinessSummary(
  source: LoadedSource | null,
): ReleaseProvenanceReadinessReport['sourceGovernanceSummary']['enterpriseReadiness'] {
  const record = source?.record ?? null
  return {
    supplied: Boolean(source),
    path: source?.relativePath ?? null,
    artifactRole: stringValue(record?.artifactRole),
    status: stringValue(record?.status),
    readinessLevel: stringValue(record?.readinessLevel),
    releaseSurfaceStatus: stringValue(asRecord(record?.releaseSurfaceReadiness)?.status),
    rbacPolicyValidationReportCount: numberValue(
      asRecord(record?.rbacAndSigningReadiness)?.rbacPolicyValidationReportCount,
    ),
  }
}

function signingReadinessSummary(
  source: LoadedSource | null,
): ReleaseProvenanceReadinessReport['sourceGovernanceSummary']['signingReadiness'] {
  const record = source?.record ?? null
  return {
    supplied: Boolean(source),
    path: source?.relativePath ?? null,
    artifactRole: stringValue(record?.artifactRole),
    status: stringValue(record?.status),
    signingReadinessStatus: stringValue(record?.signingReadinessStatus),
    keyGovernanceStatus: stringValue(asRecord(record?.keyGovernanceReadiness)?.status),
    signaturePolicyStatus: stringValue(asRecord(record?.signaturePolicyReadiness)?.status),
  }
}

function rbacPolicyValidationSummary(
  source: LoadedSource | null,
): ReleaseProvenanceReadinessReport['sourceGovernanceSummary']['rbacPolicyValidation'] {
  const record = source?.record ?? null
  return {
    supplied: Boolean(source),
    path: source?.relativePath ?? null,
    artifactRole: stringValue(record?.artifactRole),
    status: stringValue(record?.status),
    rbacPolicyValidationStatus: stringValue(record?.rbacPolicyValidationStatus),
    defaultDenyConfigured: booleanOrNull(asRecord(record?.defaultDenyStatus)?.defaultDenyConfigured),
    actorCount: numberValue(asRecord(record?.actorSummary)?.actorCount),
    permissionGrantCount: numberValue(asRecord(record?.permissionGrantSummary)?.grantCount),
  }
}

function validateRequiredOptions(options: ReleaseProvenanceReadinessReportOptions): void {
  if (!options.output) throw new Error('security report-release-provenance requires --output <json>.')
}

async function assertOutputAuthority(
  root: string,
  sourcePaths: string[],
  options: ReleaseProvenanceReadinessReportOptions,
): Promise<void> {
  const outputPath = options.output ? resolveRepoPath(root, options.output) : null
  const markdownPath = options.markdown ? resolveRepoPath(root, options.markdown) : null
  if (!outputPath) throw new Error('security report-release-provenance requires --output <json>.')
  const sourceSet = new Set(sourcePaths.map((entry) => path.resolve(entry)))
  if (markdownPath && path.resolve(outputPath) === path.resolve(markdownPath)) {
    throw new Error('Release provenance readiness JSON output and Markdown output must be different paths.')
  }
  for (const candidate of [outputPath, markdownPath].filter((entry): entry is string => Boolean(entry))) {
    if (sourceSet.has(path.resolve(candidate))) {
      throw new Error(
        `Release provenance readiness output ${relativePath(root, candidate)} would overwrite a source input.`,
      )
    }
    if (
      hasDevViewControlDirectory(candidate) ||
      hasCodexControlDirectory(candidate) ||
      hasHiddenControlDirectorySegment(candidate)
    ) {
      throw new Error(
        `Release provenance readiness output ${relativePath(root, candidate)} is inside a protected control path.`,
      )
    }
    if (isSourceAuthorityShapedPath(candidate)) {
      throw new Error(
        `Release provenance readiness output ${relativePath(root, candidate)} looks like a source authority artifact.`,
      )
    }
  }
}

function renderMarkdown(report: ReleaseProvenanceReadinessReport): string {
  return [
    '# DevView Release Provenance Readiness',
    '',
    `- status: ${report.status}`,
    `- readiness: ${report.releaseProvenanceReadinessStatus}`,
    `- package: ${report.packageMetadataSummary.packageName ?? 'unknown'}@${report.packageMetadataSummary.packageVersion ?? 'unknown'}`,
    `- packageFilesAllowlistCount: ${report.packageMetadataSummary.packageFilesAllowlistCount}`,
    `- releaseSurfaceCheckerPresent: ${report.releaseSurfaceReadiness.checkerPresent}`,
    `- sbomGenerated: ${report.sbomReadiness.sbomGenerated}`,
    `- packageSigningPresent: ${report.packageSigningReadiness.packageSigningPresent}`,
    `- provenanceAttested: ${report.provenanceAttestationReadiness.provenanceAttested}`,
    '',
    '## Findings',
    ...report.releaseProvenanceFindings.map((entry) => `- [${entry.severity}] ${entry.code}: ${entry.message}`),
    '',
    '## Downstream Actions',
    ...report.downstreamActionPlan.map((entry) => `- ${entry}`),
    '',
  ].join('\n')
}

function downstreamActionPlan(findings: ReleaseProvenanceFinding[]): string[] {
  const actions = new Set<string>()
  const openFindings = findings.filter((entry) => entry.severity !== 'satisfied')
  if (openFindings.some((entry) => entry.code.includes('ENTERPRISE_READINESS'))) {
    actions.add('Attach enterprise readiness source before release provenance review.')
  }
  if (openFindings.some((entry) => entry.code.includes('SIGNING_READINESS'))) {
    actions.add('Attach signing/key governance readiness before planning package signing.')
  }
  if (openFindings.some((entry) => entry.code.includes('RBAC_POLICY_VALIDATION'))) {
    actions.add('Attach RBAC policy validation before planning signed release authority.')
  }
  actions.add('Integrate this release provenance readiness report into enterprise readiness as a source fact.')
  actions.add('Plan real SBOM generation and provenance attestation only behind explicit release governance policy.')
  actions.add('Keep package signing future-only until key registry, trust root, and RBAC enforcement are designed.')
  return [...actions]
}

function blockingFinding(code: string, message: string, pathValue?: string, field?: string): ReleaseProvenanceFinding {
  return { severity: 'blocker', code, message, path: pathValue, field }
}

function collectUnsafeAuthorityHits(
  value: unknown,
  pathParts: string[] = [],
  seen = new Set<unknown>(),
): Array<{ field: string }> {
  if (typeof value !== 'object' || value === null || seen.has(value)) return []
  seen.add(value)
  if (Array.isArray(value)) {
    return value.flatMap((entry, index) => collectUnsafeAuthorityHits(entry, [...pathParts, String(index)], seen))
  }
  const record = value as JsonRecord
  const hits: Array<{ field: string }> = []
  for (const [key, entry] of Object.entries(record)) {
    const nextPath = [...pathParts, key]
    if (unsafeAuthorityFields.includes(key) && entry === true) {
      hits.push({ field: nextPath.join('.') })
    }
    hits.push(...collectUnsafeAuthorityHits(entry, nextPath, seen))
  }
  return hits
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

function asRecord(value: unknown): JsonRecord | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as JsonRecord) : null
}

function stringValue(value: unknown): string | null {
  return typeof value === 'string' ? value : null
}

function booleanOrNull(value: unknown): boolean | null {
  return typeof value === 'boolean' ? value : null
}

function numberValue(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === 'string') : []
}
