import { createHash } from 'node:crypto'
import path from 'node:path'
import { readFile } from 'node:fs/promises'
import { findPluginRoot, relativePath, writeJsonAtomic, writeTextAtomic } from './fs.js'
import {
  hasCodexControlDirectory,
  hasDevViewControlDirectory,
  hasHiddenControlDirectorySegment,
} from './path-safety.js'

type JsonRecord = Record<string, unknown>

const SBOM_ROLE = 'devview-sbom-artifact'
const SBOM_STATUS = 'devview-sbom-artifact-supplied'
const REPORT_ROLE = 'devview-sbom-validation-report'
const PASSED_STATUS = 'devview-sbom-validation-passed'
const BLOCKED_STATUS = 'devview-sbom-validation-blocked'
const RELEASE_PROVENANCE_READINESS_ROLE = 'devview-release-provenance-readiness-report'
const RELEASE_PROVENANCE_READINESS_STATUS = 'devview-release-provenance-readiness-reported'
const RELEASE_SURFACE_ROLE = 'devview-release-surface-validation-report'
const RELEASE_SURFACE_STATUS = 'devview-release-surface-validation-passed'
const VALIDATION_STATUS = 'validated-structural-source-fact-only'

const supportedFormats = ['spdx-json', 'cyclonedx-json', 'devview-minimal-sbom-v1'] as const

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

const unsupportedAuthorityFields = [
  'sbomGeneratedByDevView',
  'sbomGenerated',
  'sbomCreated',
  'sbomFileWritten',
  'sbomAttested',
  'packageSigned',
  'packageSigningPresent',
  'packageSignaturePresent',
  'packageSignatureVerified',
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

const executableInstructionFields = [
  'entrypoint',
  'entryPoint',
  'command',
  'commands',
  'script',
  'scripts',
  'module',
  'modulePath',
  'executable',
  'executablePath',
  'execution',
  'executionModel',
  'provider',
  'providerEndpoint',
  'providerUrl',
  'network',
  'networkEndpoint',
  'apiEndpoint',
  'apiCall',
  'shell',
  'shellCommand',
]

export interface SbomArtifactValidationOptions {
  sbom?: string
  releaseProvenanceReadiness?: string
  releaseSurfaceValidation?: string
  packageJson?: string
  output?: string
  markdown?: string
}

export interface SbomValidationFinding {
  severity: 'blocker' | 'gap' | 'advisory' | 'satisfied'
  code: string
  message: string
  path?: string
  field?: string
}

interface LoadedArtifact {
  requestedPath: string
  resolvedPath: string
  relativePath: string
  record: JsonRecord | null
  readError: string | null
  sha256: string | null
  byteLength: number | null
}

interface SbomAnalysis {
  packageName: string | null
  packageVersion: string | null
  documentName: string | null
  documentVersion: string | null
  components: JsonRecord[]
  componentIds: string[]
  duplicateComponentIds: string[]
  packageRootComponentPresent: boolean
  dependencyComponentCount: number
  fileReferenceCount: number
  externalReferenceCount: number
  declaredPackageDigest: string | null
  requiredFieldsMissing: string[]
  unsupportedInstructionFields: Array<{ field: string; path: string }>
}

export interface SbomValidationReport {
  schemaVersion: 1
  artifactRole: typeof REPORT_ROLE
  status: typeof PASSED_STATUS | typeof BLOCKED_STATUS
  validationScope: 'sbom-artifact-validation-report-only'
  sourceFactsOnly: true
  reportOnly: true
  sbomValidationStatus: typeof VALIDATION_STATUS | 'blocked'
  sourceSbomArtifact: {
    path: string
    artifactRole: string | null
    status: string | null
    sbomScope: string | null
    sbomFormat: string | null
    packageName: string | null
    packageVersion: string | null
    documentName: string | null
    documentVersion: string | null
    componentCount: number
    externalReferenceCount: number
  }
  sourceReleaseProvenanceReadiness: {
    supplied: boolean
    path: string | null
    artifactRole: string | null
    status: string | null
    releaseProvenanceReadinessStatus: string | null
    sbomGenerated: boolean | null
    sbomAttested: boolean | null
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
  packageJsonSummary: {
    supplied: boolean
    path: string | null
    packageName: string | null
    packageVersion: string | null
    packagePrivate: boolean | null
    packageFilesAllowlistPresent: boolean
    packageFilesAllowlistCount: number
  }
  sbomStructuralValidation: {
    formatRecognized: boolean
    requiredFieldsPresent: boolean
    componentListPresent: boolean
    duplicateComponentIds: string[]
    unsupportedInstructionFieldCount: number
    requiredFieldsMissing: string[]
  }
  packageIdentityAlignment: {
    packageJsonNameMatch: boolean | null
    packageJsonVersionMatch: boolean | null
    releaseSurfaceNameMatch: boolean | null
    releaseSurfaceVersionMatch: boolean | null
    alignmentStatus: 'matched' | 'mismatch' | 'not-supplied'
  }
  componentCoverageSummary: {
    componentCount: number
    packageRootComponentPresent: boolean
    dependencyComponentCount: number
    fileReferenceCount: number
  }
  digestSummary: {
    sbomSha256: string | null
    sbomByteLength: number | null
    declaredPackageDigest: string | null
    sourceDigestsRecorded: boolean
    sourceArtifactDigests: Array<{
      sourceKind: string
      path: string
      artifactRole: string | null
      status: string | null
      sha256: string | null
      byteLength: number | null
    }>
  }
  validationFindings: SbomValidationFinding[]
  downstreamActionPlan: string[]
  sbomGeneratedByDevView: false
  sbomGenerated: false
  sbomAttested: false
  packageSigned: false
  packageSigningPresent: false
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

export class SbomArtifactValidationError extends Error {
  readonly report: SbomValidationReport

  constructor(report: SbomValidationReport) {
    super('SBOM artifact validation is blocked.')
    this.report = report
  }
}

export async function validateSbomArtifact(
  root: string,
  options: SbomArtifactValidationOptions,
): Promise<SbomValidationReport> {
  validateRequiredOptions(options)
  const packageJsonPath = options.packageJson
    ? resolveRepoPath(root, options.packageJson)
    : path.join(findPluginRoot(import.meta.url), 'package.json')
  const sourcePaths = [
    options.sbom,
    options.releaseProvenanceReadiness,
    options.releaseSurfaceValidation,
    packageJsonPath,
  ].filter((entry): entry is string => Boolean(entry))
  await assertOutputAuthority(
    root,
    sourcePaths.map((entry) => resolveRepoPath(root, entry)),
    options,
  )

  const sbom = await loadArtifact(root, options.sbom ?? '')
  const releaseProvenance = options.releaseProvenanceReadiness
    ? await loadArtifact(root, options.releaseProvenanceReadiness)
    : null
  const releaseSurface = options.releaseSurfaceValidation
    ? await loadArtifact(root, options.releaseSurfaceValidation)
    : null
  const packageJson = await loadArtifact(root, packageJsonPath)
  const analysis = analyzeSbom(sbom.record)
  const findings = validateInputs(sbom, analysis, packageJson, releaseProvenance, releaseSurface)

  if (findings.some((entry) => entry.severity === 'blocker')) {
    throw new SbomArtifactValidationError(
      buildReport(sbom, analysis, packageJson, releaseProvenance, releaseSurface, findings, true),
    )
  }

  const report = buildReport(
    sbom,
    analysis,
    packageJson,
    releaseProvenance,
    releaseSurface,
    buildFindings(sbom, analysis, packageJson, releaseProvenance, releaseSurface),
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
  sbom: LoadedArtifact,
  analysis: SbomAnalysis,
  packageJson: LoadedArtifact,
  releaseProvenance: LoadedArtifact | null,
  releaseSurface: LoadedArtifact | null,
  findings: SbomValidationFinding[],
  blocked = false,
): SbomValidationReport {
  const sbomRecord = sbom.record ?? {}
  const packageRecord = packageJson.record ?? {}
  const packageFiles = stringArray(packageRecord.files)
  const releaseSurfaceRecord = releaseSurface?.record ?? null
  const releaseProvenanceRecord = releaseProvenance?.record ?? null
  return {
    schemaVersion: 1,
    artifactRole: REPORT_ROLE,
    status: blocked ? BLOCKED_STATUS : PASSED_STATUS,
    validationScope: 'sbom-artifact-validation-report-only',
    sourceFactsOnly: true,
    reportOnly: true,
    sbomValidationStatus: blocked ? 'blocked' : VALIDATION_STATUS,
    sourceSbomArtifact: {
      path: sbom.relativePath,
      artifactRole: stringValue(sbomRecord.artifactRole),
      status: stringValue(sbomRecord.status),
      sbomScope: stringValue(sbomRecord.sbomScope),
      sbomFormat: stringValue(sbomRecord.sbomFormat),
      packageName: analysis.packageName,
      packageVersion: analysis.packageVersion,
      documentName: analysis.documentName,
      documentVersion: analysis.documentVersion,
      componentCount: analysis.components.length,
      externalReferenceCount: analysis.externalReferenceCount,
    },
    sourceReleaseProvenanceReadiness: {
      supplied: Boolean(releaseProvenance),
      path: releaseProvenance?.relativePath ?? null,
      artifactRole: stringValue(releaseProvenanceRecord?.artifactRole),
      status: stringValue(releaseProvenanceRecord?.status),
      releaseProvenanceReadinessStatus: stringValue(releaseProvenanceRecord?.releaseProvenanceReadinessStatus),
      sbomGenerated: booleanOrNull(asRecord(releaseProvenanceRecord?.sbomReadiness)?.sbomGenerated),
      sbomAttested: booleanOrNull(asRecord(releaseProvenanceRecord?.sbomReadiness)?.sbomAttested),
    },
    sourceReleaseSurfaceValidation: {
      supplied: Boolean(releaseSurface),
      path: releaseSurface?.relativePath ?? null,
      artifactRole: stringValue(releaseSurfaceRecord?.artifactRole),
      status: stringValue(releaseSurfaceRecord?.status),
      packageName: stringValue(releaseSurfaceRecord?.packageName),
      packageVersion: stringValue(releaseSurfaceRecord?.packageVersion),
      packageFileCount: numberValue(releaseSurfaceRecord?.packageFileCount),
      forbiddenFindingCount: numberValue(releaseSurfaceRecord?.forbiddenFindingCount),
    },
    packageJsonSummary: {
      supplied: Boolean(packageJson.record),
      path: packageJson.relativePath,
      packageName: stringValue(packageRecord.name),
      packageVersion: stringValue(packageRecord.version),
      packagePrivate: booleanOrNull(packageRecord.private),
      packageFilesAllowlistPresent: packageFiles.length > 0,
      packageFilesAllowlistCount: packageFiles.length,
    },
    sbomStructuralValidation: {
      formatRecognized: supportedFormats.includes(
        stringValue(sbomRecord.sbomFormat) as (typeof supportedFormats)[number],
      ),
      requiredFieldsPresent: analysis.requiredFieldsMissing.length === 0,
      componentListPresent: analysis.components.length > 0,
      duplicateComponentIds: analysis.duplicateComponentIds,
      unsupportedInstructionFieldCount: analysis.unsupportedInstructionFields.length,
      requiredFieldsMissing: analysis.requiredFieldsMissing,
    },
    packageIdentityAlignment: packageIdentityAlignment(analysis, packageJson, releaseSurface),
    componentCoverageSummary: {
      componentCount: analysis.components.length,
      packageRootComponentPresent: analysis.packageRootComponentPresent,
      dependencyComponentCount: analysis.dependencyComponentCount,
      fileReferenceCount: analysis.fileReferenceCount,
    },
    digestSummary: {
      sbomSha256: sbom.sha256,
      sbomByteLength: sbom.byteLength,
      declaredPackageDigest: analysis.declaredPackageDigest,
      sourceDigestsRecorded: true,
      sourceArtifactDigests: sourceDigestEntries(sbom, packageJson, releaseProvenance, releaseSurface),
    },
    validationFindings: findings,
    downstreamActionPlan: downstreamActionPlan(findings),
    sbomGeneratedByDevView: false,
    sbomGenerated: false,
    sbomAttested: false,
    packageSigned: false,
    packageSigningPresent: false,
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

function validateInputs(
  sbom: LoadedArtifact,
  analysis: SbomAnalysis,
  packageJson: LoadedArtifact,
  releaseProvenance: LoadedArtifact | null,
  releaseSurface: LoadedArtifact | null,
): SbomValidationFinding[] {
  const findings: SbomValidationFinding[] = []
  validateLoadedArtifact(sbom, 'SBOM_VALIDATION_SBOM_READ_FAILED', findings)
  validateLoadedArtifact(packageJson, 'SBOM_VALIDATION_PACKAGE_JSON_READ_FAILED', findings)
  if (releaseProvenance) validateLoadedArtifact(releaseProvenance, 'SBOM_VALIDATION_SOURCE_READ_FAILED', findings)
  if (releaseSurface) validateLoadedArtifact(releaseSurface, 'SBOM_VALIDATION_SOURCE_READ_FAILED', findings)
  validateSbomSource(sbom, analysis, findings)
  validatePackageIdentity(analysis, packageJson, releaseSurface, findings)
  if (releaseProvenance) validateReleaseProvenanceSource(releaseProvenance, findings)
  if (releaseSurface) validateReleaseSurfaceSource(releaseSurface, findings)
  for (const source of [sbom, packageJson, releaseProvenance, releaseSurface].filter((entry): entry is LoadedArtifact =>
    Boolean(entry),
  )) {
    validateUnsafeAuthorityFlags(source, findings)
    validateUnsupportedAuthorityClaims(source, findings)
  }
  return findings
}

function validateLoadedArtifact(artifact: LoadedArtifact, readCode: string, findings: SbomValidationFinding[]): void {
  if (artifact.readError) {
    findings.push(blockingFinding(readCode, artifact.readError, artifact.relativePath))
    return
  }
  if (!artifact.record) {
    findings.push(
      blockingFinding(
        'SBOM_VALIDATION_SOURCE_NOT_JSON_OBJECT',
        `${artifact.relativePath} must be a JSON object.`,
        artifact.relativePath,
      ),
    )
  }
}

function validateSbomSource(sbom: LoadedArtifact, analysis: SbomAnalysis, findings: SbomValidationFinding[]): void {
  const record = sbom.record ?? {}
  if (record.artifactRole !== SBOM_ROLE || record.status !== SBOM_STATUS) {
    findings.push(
      blockingFinding(
        'SBOM_VALIDATION_SBOM_ROLE_STATUS_INVALID',
        `${sbom.relativePath} must be ${SBOM_ROLE} with supplied status.`,
        sbom.relativePath,
      ),
    )
  }
  if (record.sbomScope !== 'package-sbom-source-fact-only') {
    findings.push(
      blockingFinding(
        'SBOM_VALIDATION_SBOM_SCOPE_INVALID',
        `${sbom.relativePath} must use package-sbom-source-fact-only scope.`,
        sbom.relativePath,
        'sbomScope',
      ),
    )
  }
  if (record.sourceFactsOnly !== true || record.reportOnly !== true) {
    findings.push(
      blockingFinding(
        'SBOM_VALIDATION_SBOM_SOURCE_FACT_BOUNDARY_INVALID',
        `${sbom.relativePath} must be explicit sourceFactsOnly/reportOnly.`,
        sbom.relativePath,
      ),
    )
  }
  if (!supportedFormats.includes(stringValue(record.sbomFormat) as (typeof supportedFormats)[number])) {
    findings.push(
      blockingFinding(
        'SBOM_VALIDATION_SBOM_FORMAT_UNSUPPORTED',
        `${sbom.relativePath} uses unsupported SBOM format ${stringValue(record.sbomFormat) ?? '(missing)'}.`,
        sbom.relativePath,
        'sbomFormat',
      ),
    )
  }
  for (const field of analysis.requiredFieldsMissing) {
    findings.push(
      blockingFinding(
        'SBOM_VALIDATION_REQUIRED_FIELD_MISSING',
        `SBOM artifact is missing required field ${field}.`,
        sbom.relativePath,
        field,
      ),
    )
  }
  if (analysis.components.length === 0) {
    findings.push(
      blockingFinding(
        'SBOM_VALIDATION_COMPONENTS_MISSING',
        'SBOM artifact must include a non-empty component list.',
        sbom.relativePath,
        'components',
      ),
    )
  }
  for (const componentId of analysis.duplicateComponentIds) {
    findings.push(
      blockingFinding(
        'SBOM_VALIDATION_DUPLICATE_COMPONENT_ID',
        `SBOM component id ${componentId} is duplicated.`,
        sbom.relativePath,
        'components',
      ),
    )
  }
  for (const hit of analysis.unsupportedInstructionFields) {
    findings.push(
      blockingFinding(
        'SBOM_VALIDATION_EXECUTION_INSTRUCTION_UNSUPPORTED',
        `SBOM artifact contains executable/provider/network instruction field ${hit.field}.`,
        sbom.relativePath,
        hit.path,
      ),
    )
  }
}

function validatePackageIdentity(
  analysis: SbomAnalysis,
  packageJson: LoadedArtifact,
  releaseSurface: LoadedArtifact | null,
  findings: SbomValidationFinding[],
): void {
  const packageRecord = packageJson.record ?? {}
  const packageName = stringValue(packageRecord.name)
  const packageVersion = stringValue(packageRecord.version)
  if (packageName && analysis.packageName && packageName !== analysis.packageName) {
    findings.push(
      blockingFinding(
        'SBOM_VALIDATION_PACKAGE_NAME_MISMATCH',
        `SBOM package name ${analysis.packageName} does not match package.json ${packageName}.`,
        packageJson.relativePath,
        'name',
      ),
    )
  }
  if (packageVersion && analysis.packageVersion && packageVersion !== analysis.packageVersion) {
    findings.push(
      blockingFinding(
        'SBOM_VALIDATION_PACKAGE_VERSION_MISMATCH',
        `SBOM package version ${analysis.packageVersion} does not match package.json ${packageVersion}.`,
        packageJson.relativePath,
        'version',
      ),
    )
  }
  const releaseRecord = releaseSurface?.record ?? null
  if (releaseRecord) {
    const releaseName = stringValue(releaseRecord.packageName)
    const releaseVersion = stringValue(releaseRecord.packageVersion)
    if (releaseName && analysis.packageName && releaseName !== analysis.packageName) {
      findings.push(
        blockingFinding(
          'SBOM_VALIDATION_RELEASE_SURFACE_PACKAGE_NAME_MISMATCH',
          `SBOM package name ${analysis.packageName} does not match release surface ${releaseName}.`,
          releaseSurface?.relativePath,
          'packageName',
        ),
      )
    }
    if (releaseVersion && analysis.packageVersion && releaseVersion !== analysis.packageVersion) {
      findings.push(
        blockingFinding(
          'SBOM_VALIDATION_RELEASE_SURFACE_PACKAGE_VERSION_MISMATCH',
          `SBOM package version ${analysis.packageVersion} does not match release surface ${releaseVersion}.`,
          releaseSurface?.relativePath,
          'packageVersion',
        ),
      )
    }
  }
}

function validateReleaseProvenanceSource(source: LoadedArtifact, findings: SbomValidationFinding[]): void {
  const record = source.record ?? {}
  if (
    record.artifactRole !== RELEASE_PROVENANCE_READINESS_ROLE ||
    record.status !== RELEASE_PROVENANCE_READINESS_STATUS
  ) {
    findings.push(
      blockingFinding(
        'SBOM_VALIDATION_RELEASE_PROVENANCE_SOURCE_ROLE_STATUS_INVALID',
        `${source.relativePath} must be ${RELEASE_PROVENANCE_READINESS_ROLE} with reported status.`,
        source.relativePath,
      ),
    )
  }
}

function validateReleaseSurfaceSource(source: LoadedArtifact, findings: SbomValidationFinding[]): void {
  const record = source.record ?? {}
  if (record.artifactRole !== RELEASE_SURFACE_ROLE || record.status !== RELEASE_SURFACE_STATUS) {
    findings.push(
      blockingFinding(
        'SBOM_VALIDATION_RELEASE_SURFACE_SOURCE_ROLE_STATUS_INVALID',
        `${source.relativePath} must be ${RELEASE_SURFACE_ROLE} with passed status.`,
        source.relativePath,
      ),
    )
  }
  if ((numberValue(record.forbiddenFindingCount) ?? 0) > 0) {
    findings.push(
      blockingFinding(
        'SBOM_VALIDATION_RELEASE_SURFACE_FORBIDDEN_FINDINGS',
        `${source.relativePath} includes forbidden release-surface findings.`,
        source.relativePath,
        'forbiddenFindingCount',
      ),
    )
  }
}

function validateUnsafeAuthorityFlags(source: LoadedArtifact, findings: SbomValidationFinding[]): void {
  for (const hit of collectTrueFieldHits(source.record ?? {}, unsafeAuthorityFields)) {
    findings.push(
      blockingFinding(
        'SBOM_VALIDATION_UNSAFE_SOURCE_AUTHORITY_FLAG',
        `${source.relativePath} claims unsafe authority field ${hit.field}: true.`,
        source.relativePath,
        hit.path,
      ),
    )
  }
}

function validateUnsupportedAuthorityClaims(source: LoadedArtifact, findings: SbomValidationFinding[]): void {
  for (const hit of collectTrueFieldHits(source.record ?? {}, unsupportedAuthorityFields)) {
    findings.push(
      blockingFinding(
        'SBOM_VALIDATION_AUTHORITY_CLAIM_UNSUPPORTED',
        `${source.relativePath} claims unsupported SBOM/signing/provenance authority field ${hit.field}: true.`,
        source.relativePath,
        hit.path,
      ),
    )
  }
}

function buildFindings(
  sbom: LoadedArtifact,
  analysis: SbomAnalysis,
  packageJson: LoadedArtifact,
  releaseProvenance: LoadedArtifact | null,
  releaseSurface: LoadedArtifact | null,
): SbomValidationFinding[] {
  const findings: SbomValidationFinding[] = [
    satisfiedFinding(
      'SBOM_VALIDATION_ARTIFACT_ACCEPTED',
      'SBOM artifact wrapper has exact role/status and is accepted as a source fact only.',
      sbom.relativePath,
    ),
    satisfiedFinding(
      'SBOM_VALIDATION_DIGEST_RECORDED',
      'SBOM file byte digest and source digests were recorded without generating an SBOM.',
      sbom.relativePath,
    ),
    gapFinding(
      'SBOM_VALIDATION_NOT_ATTESTED',
      'SBOM validation is structural only; no SBOM attestation, package signing, or provenance attestation was created.',
      sbom.relativePath,
    ),
  ]
  if (analysis.packageRootComponentPresent) {
    findings.push(
      satisfiedFinding(
        'SBOM_VALIDATION_ROOT_COMPONENT_PRESENT',
        'SBOM includes a package root component.',
        sbom.relativePath,
      ),
    )
  } else {
    findings.push(
      gapFinding(
        'SBOM_VALIDATION_ROOT_COMPONENT_NOT_DECLARED',
        'SBOM does not declare a root component; future provenance should require a package-root component.',
        sbom.relativePath,
      ),
    )
  }
  if (packageJson.record) {
    findings.push(
      satisfiedFinding(
        'SBOM_VALIDATION_PACKAGE_JSON_LINKED',
        'package.json identity is linked to SBOM validation.',
        packageJson.relativePath,
      ),
    )
  }
  if (releaseProvenance?.record) {
    findings.push(
      satisfiedFinding(
        'SBOM_VALIDATION_RELEASE_PROVENANCE_READINESS_LINKED',
        'Release provenance readiness source is linked as a report-only source fact.',
        releaseProvenance.relativePath,
      ),
    )
  }
  if (releaseSurface?.record) {
    findings.push(
      satisfiedFinding(
        'SBOM_VALIDATION_RELEASE_SURFACE_LINKED',
        'Release surface validation source is linked as a report-only source fact.',
        releaseSurface.relativePath,
      ),
    )
  }
  return findings
}

function analyzeSbom(record: JsonRecord | null): SbomAnalysis {
  const packageIdentity = asRecord(record?.packageIdentity) ?? asRecord(record?.package) ?? asRecord(record?.metadata)
  const document = asRecord(record?.document) ?? asRecord(record?.sbomDocument)
  const components = extractComponents(record)
  const componentIds = components
    .map((component) => componentId(component))
    .filter((entry): entry is string => Boolean(entry))
  const duplicateComponentIds = duplicates(componentIds)
  const packageName =
    stringValue(packageIdentity?.name) ??
    stringValue(asRecord(packageIdentity?.component)?.name) ??
    stringValue(asRecord(record?.metadata)?.componentName)
  const packageVersion =
    stringValue(packageIdentity?.version) ??
    stringValue(asRecord(packageIdentity?.component)?.version) ??
    stringValue(asRecord(record?.metadata)?.componentVersion)
  const externalReferenceCount =
    (arrayLength(record?.externalReferences) ?? 0) +
    components.reduce((total, component) => total + (arrayLength(component.externalReferences) ?? 0), 0)
  const requiredFieldsMissing = [
    !packageName ? 'packageIdentity.name' : null,
    !packageVersion ? 'packageIdentity.version' : null,
    !stringValue(record?.sbomFormat) ? 'sbomFormat' : null,
  ].filter((entry): entry is string => Boolean(entry))
  return {
    packageName,
    packageVersion,
    documentName:
      stringValue(document?.name) ??
      stringValue(record?.documentName) ??
      stringValue(record?.SPDXID) ??
      stringValue(record?.serialNumber),
    documentVersion:
      stringValue(document?.version) ?? stringValue(record?.documentVersion) ?? stringValue(record?.version),
    components,
    componentIds,
    duplicateComponentIds,
    packageRootComponentPresent: components.some(isRootComponent),
    dependencyComponentCount: components.filter((component) => !isRootComponent(component)).length,
    fileReferenceCount: components.reduce(
      (total, component) => total + (arrayLength(component.fileReferences) ?? 0),
      0,
    ),
    externalReferenceCount,
    declaredPackageDigest: stringValue(record?.declaredPackageDigest) ?? stringValue(packageIdentity?.packageDigest),
    requiredFieldsMissing,
    unsupportedInstructionFields: collectNonEmptyFieldHits(record ?? {}, executableInstructionFields),
  }
}

function extractComponents(record: JsonRecord | null): JsonRecord[] {
  if (!record) return []
  const direct = recordArray(record.components)
  if (direct.length) return direct
  const sbom = asRecord(record.sbom)
  const bom = asRecord(record.bom)
  const packages = recordArray(sbom?.packages).length ? recordArray(sbom?.packages) : recordArray(record.packages)
  if (packages.length) return packages
  const cyclonedxComponents = recordArray(bom?.components)
  if (cyclonedxComponents.length) return cyclonedxComponents
  const metadataComponent =
    asRecord(asRecord(bom?.metadata)?.component) ?? asRecord(asRecord(record.metadata)?.component)
  return metadataComponent ? [metadataComponent] : []
}

function packageIdentityAlignment(
  analysis: SbomAnalysis,
  packageJson: LoadedArtifact,
  releaseSurface: LoadedArtifact | null,
): SbomValidationReport['packageIdentityAlignment'] {
  const packageRecord = packageJson.record ?? {}
  const releaseRecord = releaseSurface?.record ?? null
  const packageJsonName = stringValue(packageRecord.name)
  const packageJsonVersion = stringValue(packageRecord.version)
  const releaseName = stringValue(releaseRecord?.packageName)
  const releaseVersion = stringValue(releaseRecord?.packageVersion)
  const checks = [
    packageJsonName && analysis.packageName ? packageJsonName === analysis.packageName : null,
    packageJsonVersion && analysis.packageVersion ? packageJsonVersion === analysis.packageVersion : null,
    releaseName && analysis.packageName ? releaseName === analysis.packageName : null,
    releaseVersion && analysis.packageVersion ? releaseVersion === analysis.packageVersion : null,
  ].filter((entry): entry is boolean => entry !== null)
  return {
    packageJsonNameMatch: packageJsonName && analysis.packageName ? packageJsonName === analysis.packageName : null,
    packageJsonVersionMatch:
      packageJsonVersion && analysis.packageVersion ? packageJsonVersion === analysis.packageVersion : null,
    releaseSurfaceNameMatch: releaseName && analysis.packageName ? releaseName === analysis.packageName : null,
    releaseSurfaceVersionMatch:
      releaseVersion && analysis.packageVersion ? releaseVersion === analysis.packageVersion : null,
    alignmentStatus: checks.length === 0 ? 'not-supplied' : checks.every(Boolean) ? 'matched' : 'mismatch',
  }
}

function sourceDigestEntries(
  sbom: LoadedArtifact,
  packageJson: LoadedArtifact,
  releaseProvenance: LoadedArtifact | null,
  releaseSurface: LoadedArtifact | null,
): SbomValidationReport['digestSummary']['sourceArtifactDigests'] {
  return [
    sourceDigestEntry('sbom', sbom),
    sourceDigestEntry('package-json', packageJson),
    ...(releaseProvenance ? [sourceDigestEntry('release-provenance-readiness', releaseProvenance)] : []),
    ...(releaseSurface ? [sourceDigestEntry('release-surface-validation', releaseSurface)] : []),
  ]
}

function sourceDigestEntry(
  sourceKind: string,
  source: LoadedArtifact,
): SbomValidationReport['digestSummary']['sourceArtifactDigests'][number] {
  return {
    sourceKind,
    path: source.relativePath,
    artifactRole: stringValue(source.record?.artifactRole),
    status: stringValue(source.record?.status),
    sha256: source.sha256,
    byteLength: source.byteLength,
  }
}

async function loadArtifact(root: string, requestedPath: string): Promise<LoadedArtifact> {
  const resolvedPath = resolveRepoPath(root, requestedPath)
  const base = {
    requestedPath,
    resolvedPath,
    relativePath: relativePath(root, resolvedPath),
  }
  try {
    const bytes = await readFile(resolvedPath)
    const raw = bytes.toString('utf8').replace(/^\uFEFF/, '')
    const parsed = JSON.parse(raw) as unknown
    return {
      ...base,
      record: isJsonRecord(parsed) ? parsed : null,
      readError: null,
      sha256: createHash('sha256').update(bytes).digest('hex'),
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
  options: Pick<SbomArtifactValidationOptions, 'output' | 'markdown'>,
): Promise<void> {
  const outputPath = options.output ? resolveRepoPath(root, options.output) : null
  const markdownPath = options.markdown ? resolveRepoPath(root, options.markdown) : null
  if (!outputPath) throw new Error('security validate-sbom-artifact requires --output <json>.')
  if (markdownPath && path.resolve(outputPath) === path.resolve(markdownPath)) {
    throw new Error('SBOM validation JSON output and Markdown output must be different paths.')
  }
  const resolvedSources = sourcePaths.map((entry) => path.resolve(entry))
  for (const candidate of [outputPath, markdownPath].filter((entry): entry is string => Boolean(entry))) {
    const resolvedCandidate = path.resolve(candidate)
    if (resolvedSources.some((source) => source === resolvedCandidate)) {
      throw new Error(`SBOM validation output ${relativePath(root, candidate)} would overwrite a source input.`)
    }
    const relativeTarget = relativePath(root, candidate)
    if (
      hasDevViewControlDirectory(relativeTarget) ||
      hasCodexControlDirectory(relativeTarget) ||
      hasHiddenControlDirectorySegment(relativeTarget)
    ) {
      throw new Error(`SBOM validation output ${relativeTarget} is inside a protected control path.`)
    }
    if (looksLikeSourceAuthorityPath(relativeTarget)) {
      throw new Error(`SBOM validation output ${relativeTarget} looks like a source authority artifact.`)
    }
  }
}

function validateRequiredOptions(options: SbomArtifactValidationOptions): void {
  if (!options.sbom) throw new Error('security validate-sbom-artifact requires --sbom <json>.')
  if (!options.output) throw new Error('security validate-sbom-artifact requires --output <json>.')
}

function downstreamActionPlan(findings: SbomValidationFinding[]): string[] {
  const actions = new Set<string>()
  if (findings.some((finding) => finding.severity === 'blocker')) {
    actions.add('Fix SBOM source role/status, package identity, source role/status, or unsafe authority blockers.')
  }
  actions.add('Integrate this SBOM validation report into enterprise readiness as a source fact.')
  actions.add('Record package provenance inputs before any package provenance attestation.')
  actions.add(
    'Keep SBOM generation, package signing, and provenance attestation disabled until explicit governance exists.',
  )
  return [...actions]
}

function renderMarkdown(report: SbomValidationReport): string {
  const lines = [
    '# DevView SBOM Artifact Validation',
    '',
    `- status: ${report.status}`,
    `- sbomValidationStatus: ${report.sbomValidationStatus}`,
    `- sbomFormat: ${report.sourceSbomArtifact.sbomFormat}`,
    `- package: ${report.sourceSbomArtifact.packageName ?? 'unknown'}@${report.sourceSbomArtifact.packageVersion ?? 'unknown'}`,
    `- componentCount: ${report.componentCoverageSummary.componentCount}`,
    `- packageIdentityAlignment: ${report.packageIdentityAlignment.alignmentStatus}`,
    `- sbomGeneratedByDevView: ${report.sbomGeneratedByDevView}`,
    `- sbomAttested: ${report.sbomAttested}`,
    `- packageSigned: ${report.packageSigned}`,
    `- provenanceAttested: ${report.provenanceAttested}`,
    '',
    '## Findings',
    ...report.validationFindings.map((finding) => `- [${finding.severity}] ${finding.code}: ${finding.message}`),
  ]
  return `${lines.join('\n')}\n`
}

function blockingFinding(code: string, message: string, pathValue?: string, field?: string): SbomValidationFinding {
  return { severity: 'blocker', code, message, path: pathValue, field }
}

function gapFinding(code: string, message: string, pathValue?: string, field?: string): SbomValidationFinding {
  return { severity: 'gap', code, message, path: pathValue, field }
}

function satisfiedFinding(code: string, message: string, pathValue?: string, field?: string): SbomValidationFinding {
  return { severity: 'satisfied', code, message, path: pathValue, field }
}

function componentId(component: JsonRecord): string | null {
  return (
    stringValue(component.componentId) ??
    stringValue(component.id) ??
    stringValue(component.bomRef) ??
    stringValue(component.SPDXID) ??
    stringValue(component.purl)
  )
}

function isRootComponent(component: JsonRecord): boolean {
  return (
    component.root === true ||
    component.isRoot === true ||
    component.packageRoot === true ||
    stringValue(component.role) === 'root' ||
    stringValue(component.componentKind) === 'package-root' ||
    stringValue(component.type) === 'application'
  )
}

function duplicates(values: string[]): string[] {
  const seen = new Set<string>()
  const duplicate = new Set<string>()
  for (const value of values) {
    if (seen.has(value)) duplicate.add(value)
    seen.add(value)
  }
  return [...duplicate].sort()
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

function collectNonEmptyFieldHits(
  record: unknown,
  fieldNames: string[],
  pathParts: string[] = [],
): Array<{ field: string; path: string }> {
  if (!record || typeof record !== 'object') return []
  const hits: Array<{ field: string; path: string }> = []
  for (const [key, entry] of Object.entries(record as JsonRecord)) {
    const nextPath = [...pathParts, key]
    if (fieldNames.includes(key) && hasValue(entry)) hits.push({ field: key, path: nextPath.join('.') })
    if (entry && typeof entry === 'object') hits.push(...collectNonEmptyFieldHits(entry, fieldNames, nextPath))
  }
  return hits
}

function hasValue(value: unknown): boolean {
  if (value === null || value === undefined) return false
  if (Array.isArray(value)) return value.length > 0
  if (typeof value === 'object') return Object.keys(value as JsonRecord).length > 0
  if (typeof value === 'string') return value.trim().length > 0
  return true
}

function recordArray(value: unknown): JsonRecord[] {
  return Array.isArray(value) ? value.filter(isJsonRecord) : []
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === 'string') : []
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

function booleanOrNull(value: unknown): boolean | null {
  return typeof value === 'boolean' ? value : null
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
