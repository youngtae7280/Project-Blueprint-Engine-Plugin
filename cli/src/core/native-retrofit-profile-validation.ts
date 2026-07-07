import path from 'node:path'
import { readJsonSafe, relativePath, writeJsonAtomic, writeTextAtomic } from './fs.js'
import {
  hasCodexControlDirectory,
  hasDevViewControlDirectory,
  hasHiddenControlDirectorySegment,
} from './path-safety.js'

type JsonRecord = Record<string, unknown>

const REPORT_ROLE = 'devview-native-retrofit-profile-validation-report'
const PASSED_STATUS = 'devview-native-retrofit-profile-validation-passed'
const BLOCKED_STATUS = 'devview-native-retrofit-profile-validation-blocked'
const PROJECT_PROFILE_ROLE = 'devview-project-profile'
const PROJECT_PROFILE_STATUS = 'devview-project-profile-configured'
const CATALOG_ROLE = 'devview-extension-profile-catalog'
const CATALOG_STATUS = 'devview-extension-profile-catalog-compiled'
const ADAPTER_ROLE = 'devview-extension-adapter-compatibility-report'
const ADAPTER_STATUS = 'devview-extension-adapter-compatibility-validated'
const CONTEXT_PLAN_ROLE = 'devview-extension-context-plan'
const CONTEXT_PLAN_STATUS = 'devview-extension-context-plan-generated'

const unsafeAuthorityFields = [
  'extensionExecutionAllowed',
  'extensionsExecuted',
  'extensionCodeExecuted',
  'executionAllowed',
  'canExecuteExtensionCode',
  'adapterExecuted',
  'policyEnforced',
  'providerInvoked',
  'networkCallMade',
  'shellCommandExecuted',
  'shellCommandsExecuted',
  'filesMutated',
  'graphSourceMutated',
  'graphDeltaApplied',
  'runtimeEvidenceSatisfied',
  'evidenceAccepted',
  'canSatisfyEvidence',
  'equivalenceProven',
  'canProveEquivalence',
  'scopeEnforced',
  'ciEnforcementEnabled',
  'canEnforceScope',
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
  'traversalAuthorityGranted',
  'contextPackMutated',
  'viewTreeMutated',
]

export interface NativeRetrofitProfileValidationOptions {
  projectProfile?: string
  extensionProfileCatalog?: string
  extensionAdapterCompatibilityReport?: string
  extensionContextPlan?: string
  output?: string
  markdown?: string
}

export interface NativeRetrofitProfileValidationReport {
  schemaVersion: 1
  artifactRole: typeof REPORT_ROLE
  status: typeof PASSED_STATUS | typeof BLOCKED_STATUS
  validationScope: 'native-retrofit-profile-validation-report-only'
  nativeRetrofitValidationStatus:
    | 'passed-report-only-profile-validation'
    | 'blocked-project-profile-invalid'
    | 'blocked-extension-profile-catalog-invalid'
    | 'blocked-extension-adapter-compatibility-invalid'
    | 'blocked-extension-context-plan-invalid'
    | 'blocked-source-chain-mismatch'
    | 'blocked-unsafe-authority-flag'
  sourceProjectProfile: string
  sourceExtensionProfileCatalog: string
  sourceExtensionAdapterCompatibilityReport: string
  sourceExtensionContextPlan: string | null
  sourceProjectProfileSummary: {
    projectProfileId: string | null
    projectName: string | null
    domain: string | null
    stack: string[]
    platformHints: string[]
  }
  sourceExtensionProfileCatalogSummary: {
    catalogStatus: string | null
    catalogEntryCount: number
    evidenceAdapterCount: number
    policyExtensionCount: number
    graphIngestionCandidateCount: number
    nativeRetrofitHintStatus: string | null
    nativeRetrofitMode: string | null
  }
  sourceAdapterCompatibilitySummary: {
    adapterCompatibilityStatus: string | null
    evidenceAdapterCompatibilityStatus: string | null
    policyExtensionCompatibilityStatus: string | null
    proofLifecycleCompatibilityStatus: string | null
    graphIngestionCandidateCount: number
    nativeRetrofitHintStatus: string | null
    nativeRetrofitMode: string | null
  }
  sourceExtensionContextPlanSummary: {
    extensionContextPlanStatus: string | null
    viewTreeAlignmentStatus: string | null
    contextPackAlignmentStatus: string | null
    graphIngestionCandidateCount: number | null
    nativeRetrofitHintStatus: string | null
    nativeRetrofitMode: string | null
  } | null
  sourceChainComparison: {
    projectProfileComparisonStatus: 'matched-profile-source' | 'mismatched-profile-source' | 'not-modeled'
    catalogAdapterComparisonStatus:
      | 'matched-adapter-catalog-source'
      | 'mismatched-adapter-catalog-source'
      | 'not-modeled'
    contextPlanComparisonStatus:
      | 'matched-context-plan-source'
      | 'mismatched-context-plan-source'
      | 'not-provided'
      | 'not-modeled'
    limitations: string[]
  }
  nativeRetrofitModeSummary: {
    mode: 'native' | 'retrofit' | 'hybrid' | 'unknown'
    modeInferenceStatus:
      | 'mode-declared-in-project-profile'
      | 'mode-inferred-from-profile-signals'
      | 'mode-unknown-profile-fields-missing'
      | 'mode-declared-but-unsupported'
    declaredMode: string | null
    inferredMode: 'native' | 'retrofit' | 'hybrid' | null
    nativeSignals: string[]
    retrofitSignals: string[]
    sourceFields: string[]
    modeInferenceLimitations: string[]
  }
  profileCoverage: {
    mode: CoverageSection
    stackDomainPlatform: CoverageSection
    sourceBoundaryProtectedPaths: CoverageSection
    evidenceAdapterCoverage: CoverageSection
    policyScopeCoverage: CoverageSection
    graphIngestionCoverage: CoverageSection
    nativeBoundaryCoverage: CoverageSection
    retrofitParityCoverage: CoverageSection
  }
  validationFindings: NativeRetrofitProfileFinding[]
  downstreamActionPlan: Array<{
    actionId: string
    recommendedAction: string
    reason: string
    authorityBoundary: string
  }>
  extensionExecutionAllowed: false
  extensionsExecuted: false
  providerInvoked: false
  networkCallMade: false
  shellCommandsExecuted: false
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
  adapterExecuted: false
  policyEnforced: false
  traversalAuthorityGranted: false
  contextPackMutated: false
  viewTreeMutated: false
  nonEnforcing: true
  writtenOutputPath?: string
  writtenMarkdownPath?: string
}

export interface CoverageSection {
  coverageStatus: 'covered' | 'partial' | 'missing' | 'future-only'
  summary: string
  signals: string[]
  gaps: string[]
}

export interface NativeRetrofitProfileFinding {
  severity: 'info' | 'warning' | 'error'
  findingLevel: 'advisory' | 'blocking' | 'future-only'
  code: string
  path?: string
  field?: string
  message: string
}

interface LoadedSource {
  path: string
  resolvedPath: string
  record: JsonRecord | null
  readError: string | null
}

export class NativeRetrofitProfileValidationError extends Error {
  readonly report: NativeRetrofitProfileValidationReport

  constructor(report: NativeRetrofitProfileValidationReport) {
    super('Native/Retrofit profile validation is blocked.')
    this.report = report
  }
}

export async function validateNativeRetrofitProfile(
  root: string,
  options: NativeRetrofitProfileValidationOptions,
): Promise<NativeRetrofitProfileValidationReport> {
  validateRequiredOptions(options)

  const projectProfilePath = resolveRepoPath(root, options.projectProfile ?? '')
  const catalogPath = resolveRepoPath(root, options.extensionProfileCatalog ?? '')
  const adapterPath = resolveRepoPath(root, options.extensionAdapterCompatibilityReport ?? '')
  const contextPlanPath = options.extensionContextPlan ? resolveRepoPath(root, options.extensionContextPlan) : null

  const sourceProjectProfile = relativePath(root, projectProfilePath)
  const sourceExtensionProfileCatalog = relativePath(root, catalogPath)
  const sourceExtensionAdapterCompatibilityReport = relativePath(root, adapterPath)
  const sourceExtensionContextPlan = contextPlanPath ? relativePath(root, contextPlanPath) : null

  const findings: NativeRetrofitProfileFinding[] = []
  const projectProfile = await loadSource(projectProfilePath, sourceProjectProfile)
  const catalog = await loadSource(catalogPath, sourceExtensionProfileCatalog)
  const adapter = await loadSource(adapterPath, sourceExtensionAdapterCompatibilityReport)
  const contextPlan = contextPlanPath ? await loadSource(contextPlanPath, sourceExtensionContextPlan ?? '') : null

  validateSourceShape({
    label: 'Project profile',
    source: projectProfile,
    role: PROJECT_PROFILE_ROLE,
    status: PROJECT_PROFILE_STATUS,
    roleStatusCode: 'NATIVE_RETROFIT_PROJECT_PROFILE_ROLE_STATUS_INVALID',
    invalidStatus: 'blocked-project-profile-invalid',
    findings,
  })
  validateSourceShape({
    label: 'Extension profile catalog',
    source: catalog,
    role: CATALOG_ROLE,
    status: CATALOG_STATUS,
    roleStatusCode: 'NATIVE_RETROFIT_EXTENSION_CATALOG_ROLE_STATUS_INVALID',
    invalidStatus: 'blocked-extension-profile-catalog-invalid',
    findings,
  })
  validateSourceShape({
    label: 'Extension adapter compatibility report',
    source: adapter,
    role: ADAPTER_ROLE,
    status: ADAPTER_STATUS,
    roleStatusCode: 'NATIVE_RETROFIT_ADAPTER_COMPATIBILITY_ROLE_STATUS_INVALID',
    invalidStatus: 'blocked-extension-adapter-compatibility-invalid',
    findings,
  })
  if (contextPlan) {
    validateSourceShape({
      label: 'Extension context plan',
      source: contextPlan,
      role: CONTEXT_PLAN_ROLE,
      status: CONTEXT_PLAN_STATUS,
      roleStatusCode: 'NATIVE_RETROFIT_CONTEXT_PLAN_ROLE_STATUS_INVALID',
      invalidStatus: 'blocked-extension-context-plan-invalid',
      findings,
    })
  }

  const projectProfileRecord = projectProfile.record
  const catalogRecord = catalog.record
  const adapterRecord = adapter.record
  const contextPlanRecord = contextPlan?.record ?? null
  const modeSummary = buildModeSummary(projectProfileRecord, catalogRecord, adapterRecord, contextPlanRecord)
  const sourceChainComparison = buildSourceChainComparison({
    sourceProjectProfile,
    sourceExtensionProfileCatalog,
    sourceExtensionAdapterCompatibilityReport,
    sourceExtensionContextPlan,
    catalogRecord,
    adapterRecord,
    contextPlanRecord,
  })
  findings.push(...buildSourceChainFindings(sourceChainComparison))
  const profileCoverage = buildProfileCoverage(
    projectProfileRecord,
    catalogRecord,
    adapterRecord,
    contextPlanRecord,
    modeSummary,
  )
  findings.push(...buildAdvisoryFindings(profileCoverage, modeSummary))
  const downstreamActionPlan = buildDownstreamActionPlan(profileCoverage, modeSummary)
  const blocking = findings.find((finding) => finding.severity === 'error')
  const report: NativeRetrofitProfileValidationReport = {
    schemaVersion: 1,
    artifactRole: REPORT_ROLE,
    status: blocking ? BLOCKED_STATUS : PASSED_STATUS,
    validationScope: 'native-retrofit-profile-validation-report-only',
    nativeRetrofitValidationStatus: blocking
      ? blockingStatusForFinding(blocking)
      : 'passed-report-only-profile-validation',
    sourceProjectProfile,
    sourceExtensionProfileCatalog,
    sourceExtensionAdapterCompatibilityReport,
    sourceExtensionContextPlan,
    sourceProjectProfileSummary: {
      projectProfileId: stringValue(projectProfileRecord?.projectProfileId) || null,
      projectName: stringValue(projectProfileRecord?.projectName) || null,
      domain: stringValue(projectProfileRecord?.domain) || null,
      stack: stringArray(projectProfileRecord?.stack),
      platformHints: uniqueSorted([
        ...stringArray(projectProfileRecord?.platforms),
        ...stringArray(projectProfileRecord?.platformHints),
        stringValue(projectProfileRecord?.platform),
      ]),
    },
    sourceExtensionProfileCatalogSummary: buildCatalogSummary(catalogRecord),
    sourceAdapterCompatibilitySummary: buildAdapterSummary(adapterRecord),
    sourceExtensionContextPlanSummary: contextPlanRecord ? buildContextPlanSummary(contextPlanRecord) : null,
    sourceChainComparison,
    nativeRetrofitModeSummary: modeSummary,
    profileCoverage,
    validationFindings: findings,
    downstreamActionPlan,
    extensionExecutionAllowed: false,
    extensionsExecuted: false,
    providerInvoked: false,
    networkCallMade: false,
    shellCommandsExecuted: false,
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
    adapterExecuted: false,
    policyEnforced: false,
    traversalAuthorityGranted: false,
    contextPackMutated: false,
    viewTreeMutated: false,
    nonEnforcing: true,
  }

  if (report.status === BLOCKED_STATUS) {
    throw new NativeRetrofitProfileValidationError(report)
  }

  await assertOutputAuthority(
    root,
    [projectProfilePath, catalogPath, adapterPath, ...(contextPlanPath ? [contextPlanPath] : [])],
    options,
  )

  if (options.output) {
    const outputPath = resolveRepoPath(root, options.output)
    report.writtenOutputPath = relativePath(root, outputPath)
    await writeJsonAtomic(outputPath, report)
  }
  if (options.markdown) {
    const markdownPath = resolveRepoPath(root, options.markdown)
    report.writtenMarkdownPath = relativePath(root, markdownPath)
    await writeTextAtomic(markdownPath, renderMarkdown(report))
    if (options.output) {
      await writeJsonAtomic(resolveRepoPath(root, options.output), report)
    }
  }

  return report
}

function validateRequiredOptions(options: NativeRetrofitProfileValidationOptions): void {
  if (!options.projectProfile) {
    throw new Error('extensions validate-native-retrofit-profile requires --project-profile <file>.')
  }
  if (!options.extensionProfileCatalog) {
    throw new Error('extensions validate-native-retrofit-profile requires --extension-profile-catalog <file>.')
  }
  if (!options.extensionAdapterCompatibilityReport) {
    throw new Error(
      'extensions validate-native-retrofit-profile requires --extension-adapter-compatibility-report <file>.',
    )
  }
  if (!options.output) {
    throw new Error('extensions validate-native-retrofit-profile requires --output <json>.')
  }
}

async function loadSource(resolvedPath: string, relativeSourcePath: string): Promise<LoadedSource> {
  const parsed = await readJsonSafe<JsonRecord>(resolvedPath)
  if (!parsed.ok) {
    return { path: relativeSourcePath, resolvedPath, record: null, readError: parsed.error }
  }
  const record = asRecord(parsed.value)
  if (!record) {
    return { path: relativeSourcePath, resolvedPath, record: null, readError: 'expected JSON object' }
  }
  return { path: relativeSourcePath, resolvedPath, record, readError: null }
}

function validateSourceShape(input: {
  label: string
  source: LoadedSource
  role: string
  status: string
  roleStatusCode: string
  invalidStatus: NativeRetrofitProfileValidationReport['nativeRetrofitValidationStatus']
  findings: NativeRetrofitProfileFinding[]
}): void {
  const { label, source, role, status, roleStatusCode, findings } = input
  if (!source.record) {
    findings.push({
      severity: 'error',
      findingLevel: 'blocking',
      code: roleStatusCode,
      path: source.path,
      message: `${label} could not be read: ${source.readError ?? 'unknown read error'}.`,
    })
    return
  }
  if (source.record.artifactRole !== role || source.record.status !== status) {
    findings.push({
      severity: 'error',
      findingLevel: 'blocking',
      code: roleStatusCode,
      path: source.path,
      field: 'artifactRole/status',
      message: `${label} must use role ${role} and status ${status}.`,
    })
  }
  const unsafe = collectUnsafeAuthorityHits(source.record)
  for (const hit of unsafe) {
    findings.push({
      severity: 'error',
      findingLevel: 'blocking',
      code: 'NATIVE_RETROFIT_UNSAFE_SOURCE_AUTHORITY_FLAG',
      path: source.path,
      field: hit.field,
      message: `${label} must keep ${hit.field}:false for report-only Native/Retrofit profile validation.`,
    })
  }
}

function buildModeSummary(
  profile: JsonRecord | null,
  catalog: JsonRecord | null,
  adapter: JsonRecord | null,
  contextPlan: JsonRecord | null,
): NativeRetrofitProfileValidationReport['nativeRetrofitModeSummary'] {
  const sourceFields: string[] = []
  const rawMode = stringValue(profile?.devviewMode ?? profile?.projectMode ?? profile?.mode)
  if (rawMode) {
    sourceFields.push(
      rawMode === profile?.devviewMode ? 'devviewMode' : rawMode === profile?.projectMode ? 'projectMode' : 'mode',
    )
  }
  const signals = uniqueSorted([
    rawMode,
    stringValue(profile?.domain),
    stringValue(profile?.projectType),
    stringValue(profile?.platform),
    ...stringArray(profile?.stack),
    ...stringArray(profile?.platforms),
    ...stringArray(profile?.platformHints),
    ...stringArray(profile?.sourceBoundaries),
    ...stringArray(profile?.nativeBoundaries),
    ...stringArray(profile?.retrofitBoundaries),
    stringValue(asRecord(catalog?.nativeRetrofitProfileHints)?.mode),
    stringValue(asRecord(adapter?.nativeRetrofitAdapterHints)?.mode),
    stringValue(asRecord(contextPlan?.nativeRetrofitPlanning)?.mode),
  ])
    .filter(Boolean)
    .map((entry) => entry.toLowerCase())
  const nativeSignals = signals.filter(
    (entry) =>
      entry.includes('native') || entry.includes('desktop') || entry.includes('windows') || entry.includes('hardware'),
  )
  const retrofitSignals = signals.filter(
    (entry) =>
      entry.includes('retrofit') || entry.includes('legacy') || entry.includes('migration') || entry.includes('parity'),
  )
  const declaredMode = rawMode && ['native', 'retrofit', 'hybrid'].includes(rawMode) ? rawMode : null
  const unsupportedDeclared = rawMode && !declaredMode
  const inferredMode =
    !declaredMode && nativeSignals.length > 0 && retrofitSignals.length > 0
      ? 'hybrid'
      : !declaredMode && retrofitSignals.length > 0
        ? 'retrofit'
        : !declaredMode && nativeSignals.length > 0
          ? 'native'
          : null
  const limitations: string[] = []
  if (!declaredMode) {
    limitations.push('Project profile has no explicit devviewMode/projectMode/mode value in native|retrofit|hybrid.')
  }
  if (unsupportedDeclared) {
    limitations.push(`Declared project mode "${rawMode}" is not a supported Native/Retrofit mode.`)
  }
  if (!declaredMode && !inferredMode) {
    limitations.push(
      'Mode inference had no strong native, retrofit, legacy, migration, parity, hardware, or desktop signals.',
    )
  }
  return {
    mode: (declaredMode ?? inferredMode ?? 'unknown') as 'native' | 'retrofit' | 'hybrid' | 'unknown',
    modeInferenceStatus: declaredMode
      ? 'mode-declared-in-project-profile'
      : unsupportedDeclared
        ? 'mode-declared-but-unsupported'
        : inferredMode
          ? 'mode-inferred-from-profile-signals'
          : 'mode-unknown-profile-fields-missing',
    declaredMode: rawMode || null,
    inferredMode: inferredMode as 'native' | 'retrofit' | 'hybrid' | null,
    nativeSignals,
    retrofitSignals,
    sourceFields,
    modeInferenceLimitations: limitations,
  }
}

function buildSourceChainComparison(input: {
  sourceProjectProfile: string
  sourceExtensionProfileCatalog: string
  sourceExtensionAdapterCompatibilityReport: string
  sourceExtensionContextPlan: string | null
  catalogRecord: JsonRecord | null
  adapterRecord: JsonRecord | null
  contextPlanRecord: JsonRecord | null
}): NativeRetrofitProfileValidationReport['sourceChainComparison'] {
  const limitations: string[] = []
  const catalogProfileSource = stringValue(input.catalogRecord?.sourceProjectProfile)
  const adapterCatalogSource = stringValue(input.adapterRecord?.sourceExtensionProfileCatalog)
  const adapterContextSource = stringValue(input.adapterRecord?.sourceExtensionContextPlan)
  const contextSourceCatalog = stringValue(input.contextPlanRecord?.sourceExtensionProfileCatalog)
  if (!catalogProfileSource) {
    limitations.push('Catalog sourceProjectProfile field is not modeled; project profile comparison is path-limited.')
  }
  if (!adapterCatalogSource) {
    limitations.push('Adapter compatibility sourceExtensionProfileCatalog field is not modeled.')
  }
  if (input.sourceExtensionContextPlan && !adapterContextSource) {
    limitations.push('Adapter compatibility sourceExtensionContextPlan field is not modeled.')
  }
  if (input.sourceExtensionContextPlan && !contextSourceCatalog) {
    limitations.push('Context plan sourceExtensionProfileCatalog field is not modeled.')
  }
  return {
    projectProfileComparisonStatus:
      catalogProfileSource && normalizePath(catalogProfileSource) === normalizePath(input.sourceProjectProfile)
        ? 'matched-profile-source'
        : catalogProfileSource
          ? 'mismatched-profile-source'
          : 'not-modeled',
    catalogAdapterComparisonStatus:
      adapterCatalogSource && normalizePath(adapterCatalogSource) === normalizePath(input.sourceExtensionProfileCatalog)
        ? 'matched-adapter-catalog-source'
        : adapterCatalogSource
          ? 'mismatched-adapter-catalog-source'
          : 'not-modeled',
    contextPlanComparisonStatus: !input.sourceExtensionContextPlan
      ? 'not-provided'
      : adapterContextSource && normalizePath(adapterContextSource) === normalizePath(input.sourceExtensionContextPlan)
        ? 'matched-context-plan-source'
        : adapterContextSource
          ? 'mismatched-context-plan-source'
          : 'not-modeled',
    limitations,
  }
}

function buildCatalogSummary(
  catalog: JsonRecord | null,
): NativeRetrofitProfileValidationReport['sourceExtensionProfileCatalogSummary'] {
  const capabilityCatalog = asRecord(catalog?.capabilityCatalog)
  const hints = asRecord(catalog?.nativeRetrofitProfileHints)
  return {
    catalogStatus: stringValue(catalog?.extensionCatalogStatus) || null,
    catalogEntryCount: numberValue(catalog?.catalogEntryCount) ?? arrayRecords(catalog?.extensionCatalogEntries).length,
    evidenceAdapterCount: arrayStrings(capabilityCatalog?.evidenceAdapters).length,
    policyExtensionCount: arrayStrings(capabilityCatalog?.policyExtensions).length,
    graphIngestionCandidateCount: arrayRecords(catalog?.graphIngestionCandidates).length,
    nativeRetrofitHintStatus: stringValue(hints?.hintStatus) || null,
    nativeRetrofitMode: stringValue(hints?.mode) || null,
  }
}

function buildAdapterSummary(
  adapter: JsonRecord | null,
): NativeRetrofitProfileValidationReport['sourceAdapterCompatibilitySummary'] {
  const evidence = asRecord(adapter?.evidenceAdapterCompatibility)
  const policy = asRecord(adapter?.policyExtensionCompatibility)
  const proof = asRecord(adapter?.proofLifecycleCompatibility)
  const graphIngestion = asRecord(adapter?.graphIngestionPlanningContext)
  const hints = asRecord(adapter?.nativeRetrofitAdapterHints)
  return {
    adapterCompatibilityStatus: stringValue(adapter?.adapterCompatibilityStatus) || null,
    evidenceAdapterCompatibilityStatus: stringValue(evidence?.compatibilityStatus) || null,
    policyExtensionCompatibilityStatus: stringValue(policy?.compatibilityStatus) || null,
    proofLifecycleCompatibilityStatus: stringValue(proof?.compatibilityStatus) || null,
    graphIngestionCandidateCount: numberValue(graphIngestion?.candidateCount) ?? 0,
    nativeRetrofitHintStatus: stringValue(hints?.hintStatus) || null,
    nativeRetrofitMode: stringValue(hints?.mode) || null,
  }
}

function buildContextPlanSummary(
  contextPlan: JsonRecord,
): NonNullable<NativeRetrofitProfileValidationReport['sourceExtensionContextPlanSummary']> {
  const viewTreeHintPlan = asRecord(contextPlan.viewTreeHintPlan)
  const contextPackHintPlan = asRecord(contextPlan.contextPackHintPlan)
  const graphIngestion = asRecord(contextPlan.graphIngestionPlanning)
  const hints = asRecord(contextPlan.nativeRetrofitPlanning)
  return {
    extensionContextPlanStatus: stringValue(contextPlan.extensionContextPlanStatus) || null,
    viewTreeAlignmentStatus: stringValue(viewTreeHintPlan?.alignmentStatus) || null,
    contextPackAlignmentStatus: stringValue(contextPackHintPlan?.alignmentStatus) || null,
    graphIngestionCandidateCount: numberValue(graphIngestion?.candidateCount),
    nativeRetrofitHintStatus: stringValue(hints?.hintStatus) || null,
    nativeRetrofitMode: stringValue(hints?.mode) || null,
  }
}

function buildProfileCoverage(
  profile: JsonRecord | null,
  catalog: JsonRecord | null,
  adapter: JsonRecord | null,
  contextPlan: JsonRecord | null,
  modeSummary: NativeRetrofitProfileValidationReport['nativeRetrofitModeSummary'],
): NativeRetrofitProfileValidationReport['profileCoverage'] {
  const catalogSummary = buildCatalogSummary(catalog)
  const adapterSummary = buildAdapterSummary(adapter)
  const sourceBoundarySignals = uniqueSorted([
    ...stringArray(profile?.sourceBoundaries),
    ...stringArray(profile?.protectedPaths),
    ...stringArray(profile?.nativeBoundaries),
    ...stringArray(profile?.retrofitBoundaries),
  ])
  const platformSignals = uniqueSorted([
    stringValue(profile?.domain),
    stringValue(profile?.platform),
    ...stringArray(profile?.stack),
    ...stringArray(profile?.platforms),
    ...stringArray(profile?.platformHints),
  ])
  const nativeBoundarySignals = uniqueSorted([
    ...stringArray(profile?.nativeBoundaries),
    ...stringArray(profile?.hardwareBoundaries),
    ...modeSummary.nativeSignals,
  ])
  const retrofitParitySignals = uniqueSorted([
    ...stringArray(profile?.retrofitBoundaries),
    ...stringArray(profile?.legacyParityTargets),
    ...stringArray(profile?.parityContracts),
    ...modeSummary.retrofitSignals,
  ])
  const contextGraphIngestionCount = numberValue(asRecord(contextPlan?.graphIngestionPlanning)?.candidateCount) ?? 0
  return {
    mode: {
      coverageStatus: modeSummary.mode === 'unknown' ? 'partial' : 'covered',
      summary: modeSummary.mode === 'unknown' ? 'Mode is not explicit yet.' : `Mode resolved as ${modeSummary.mode}.`,
      signals: [...modeSummary.nativeSignals, ...modeSummary.retrofitSignals],
      gaps: modeSummary.modeInferenceLimitations,
    },
    stackDomainPlatform: {
      coverageStatus: platformSignals.length >= 2 ? 'covered' : platformSignals.length > 0 ? 'partial' : 'missing',
      summary:
        platformSignals.length > 0
          ? 'Project stack/domain/platform hints are present.'
          : 'No stack/domain/platform hints found.',
      signals: platformSignals,
      gaps: platformSignals.length > 0 ? [] : ['Add stack, domain, and platform hints to the Project Profile.'],
    },
    sourceBoundaryProtectedPaths: {
      coverageStatus: sourceBoundarySignals.length > 0 ? 'covered' : 'future-only',
      summary:
        sourceBoundarySignals.length > 0
          ? 'Source boundary or protected path hints are declared.'
          : 'Source boundary/protected path hints are not declared yet.',
      signals: sourceBoundarySignals,
      gaps:
        sourceBoundarySignals.length > 0
          ? []
          : ['Add sourceBoundaries, protectedPaths, nativeBoundaries, or retrofitBoundaries.'],
    },
    evidenceAdapterCoverage: {
      coverageStatus: catalogSummary.evidenceAdapterCount > 0 ? 'covered' : 'missing',
      summary: adapterSummary.evidenceAdapterCompatibilityStatus ?? 'No Evidence Adapter compatibility status.',
      signals:
        catalogSummary.evidenceAdapterCount > 0 ? [`${catalogSummary.evidenceAdapterCount} evidence adapter(s)`] : [],
      gaps:
        catalogSummary.evidenceAdapterCount > 0
          ? []
          : ['Add an Evidence Adapter manifest for Native/Retrofit validation.'],
    },
    policyScopeCoverage: {
      coverageStatus: catalogSummary.policyExtensionCount > 0 ? 'covered' : 'missing',
      summary: adapterSummary.policyExtensionCompatibilityStatus ?? 'No Policy Extension compatibility status.',
      signals:
        catalogSummary.policyExtensionCount > 0 ? [`${catalogSummary.policyExtensionCount} policy extension(s)`] : [],
      gaps:
        catalogSummary.policyExtensionCount > 0 ? [] : ['Add a Policy Extension manifest for scope/policy validation.'],
    },
    graphIngestionCoverage: {
      coverageStatus:
        catalogSummary.graphIngestionCandidateCount > 0 ||
        adapterSummary.graphIngestionCandidateCount > 0 ||
        contextGraphIngestionCount > 0
          ? 'covered'
          : 'future-only',
      summary:
        catalogSummary.graphIngestionCandidateCount > 0 ||
        adapterSummary.graphIngestionCandidateCount > 0 ||
        contextGraphIngestionCount > 0
          ? 'Protocol-only graph ingestion hints are present.'
          : 'Graph ingestion protocol hints are not declared yet.',
      signals:
        catalogSummary.graphIngestionCandidateCount > 0
          ? [`${catalogSummary.graphIngestionCandidateCount} catalog graph ingestion candidate(s)`]
          : adapterSummary.graphIngestionCandidateCount > 0
            ? [`${adapterSummary.graphIngestionCandidateCount} adapter graph ingestion candidate(s)`]
            : contextGraphIngestionCount > 0
              ? [`${contextGraphIngestionCount} context plan graph ingestion candidate(s)`]
              : [],
      gaps:
        catalogSummary.graphIngestionCandidateCount > 0 ||
        adapterSummary.graphIngestionCandidateCount > 0 ||
        contextGraphIngestionCount > 0
          ? []
          : ['Add a protocol-only graph ingestion manifest if Graphify or another graph provider should be planned.'],
    },
    nativeBoundaryCoverage: {
      coverageStatus:
        nativeBoundarySignals.length > 0 ? 'covered' : modeSummary.mode === 'native' ? 'partial' : 'future-only',
      summary:
        nativeBoundarySignals.length > 0
          ? 'Native/hardware/platform boundary hints are present.'
          : 'Native boundary hints are not declared yet.',
      signals: nativeBoundarySignals,
      gaps: nativeBoundarySignals.length > 0 ? [] : ['Add nativeBoundaries or hardwareBoundaries for native projects.'],
    },
    retrofitParityCoverage: {
      coverageStatus:
        retrofitParitySignals.length > 0 ? 'covered' : modeSummary.mode === 'retrofit' ? 'partial' : 'future-only',
      summary:
        retrofitParitySignals.length > 0
          ? 'Retrofit or legacy parity hints are present.'
          : 'Retrofit parity hints are not declared yet.',
      signals: retrofitParitySignals,
      gaps:
        retrofitParitySignals.length > 0
          ? []
          : ['Add retrofitBoundaries, legacyParityTargets, or parityContracts for retrofit projects.'],
    },
  }
}

function buildAdvisoryFindings(
  coverage: NativeRetrofitProfileValidationReport['profileCoverage'],
  modeSummary: NativeRetrofitProfileValidationReport['nativeRetrofitModeSummary'],
): NativeRetrofitProfileFinding[] {
  const findings: NativeRetrofitProfileFinding[] = []
  if (modeSummary.modeInferenceStatus === 'mode-unknown-profile-fields-missing') {
    findings.push({
      severity: 'warning',
      findingLevel: 'advisory',
      code: 'NATIVE_RETROFIT_MODE_NOT_DECLARED',
      field: 'projectProfile.mode',
      message: 'Project Profile does not declare or strongly imply native, retrofit, or hybrid mode.',
    })
  }
  if (coverage.sourceBoundaryProtectedPaths.coverageStatus === 'future-only') {
    findings.push({
      severity: 'warning',
      findingLevel: 'future-only',
      code: 'NATIVE_RETROFIT_SOURCE_BOUNDARIES_NOT_DECLARED',
      field: 'projectProfile.sourceBoundaries',
      message: 'Source boundary and protected path hints are not declared yet.',
    })
  }
  if (coverage.graphIngestionCoverage.coverageStatus === 'future-only') {
    findings.push({
      severity: 'warning',
      findingLevel: 'future-only',
      code: 'NATIVE_RETROFIT_GRAPH_INGESTION_PROTOCOL_NOT_DECLARED',
      field: 'extensionCatalog.graphIngestionCandidates',
      message: 'Graph ingestion protocol candidates are not declared yet.',
    })
  }
  return findings
}

function buildSourceChainFindings(
  comparison: NativeRetrofitProfileValidationReport['sourceChainComparison'],
): NativeRetrofitProfileFinding[] {
  const findings: NativeRetrofitProfileFinding[] = []
  if (comparison.projectProfileComparisonStatus === 'mismatched-profile-source') {
    findings.push({
      severity: 'error',
      findingLevel: 'blocking',
      code: 'NATIVE_RETROFIT_SOURCE_CHAIN_PROFILE_MISMATCH',
      field: 'sourceExtensionProfileCatalog.sourceProjectProfile',
      message: 'Extension catalog sourceProjectProfile does not match the supplied Project Profile.',
    })
  }
  if (comparison.catalogAdapterComparisonStatus === 'mismatched-adapter-catalog-source') {
    findings.push({
      severity: 'error',
      findingLevel: 'blocking',
      code: 'NATIVE_RETROFIT_SOURCE_CHAIN_ADAPTER_CATALOG_MISMATCH',
      field: 'sourceExtensionAdapterCompatibilityReport.sourceExtensionProfileCatalog',
      message: 'Adapter compatibility report sourceExtensionProfileCatalog does not match the supplied catalog.',
    })
  }
  if (comparison.contextPlanComparisonStatus === 'mismatched-context-plan-source') {
    findings.push({
      severity: 'error',
      findingLevel: 'blocking',
      code: 'NATIVE_RETROFIT_SOURCE_CHAIN_ADAPTER_CONTEXT_PLAN_MISMATCH',
      field: 'sourceExtensionAdapterCompatibilityReport.sourceExtensionContextPlan',
      message: 'Adapter compatibility report sourceExtensionContextPlan does not match the supplied context plan.',
    })
  }
  return findings
}

function buildDownstreamActionPlan(
  coverage: NativeRetrofitProfileValidationReport['profileCoverage'],
  modeSummary: NativeRetrofitProfileValidationReport['nativeRetrofitModeSummary'],
): NativeRetrofitProfileValidationReport['downstreamActionPlan'] {
  const actions: NativeRetrofitProfileValidationReport['downstreamActionPlan'] = []
  if (modeSummary.mode === 'unknown') {
    actions.push({
      actionId: 'declare-project-mode',
      recommendedAction: 'Add devviewMode, projectMode, or mode with native, retrofit, or hybrid.',
      reason: 'Mode-specific validation remains advisory until the project mode is explicit or strongly inferred.',
      authorityBoundary: 'This report does not mutate the Project Profile.',
    })
  }
  for (const [sectionId, section] of Object.entries(coverage)) {
    if (section.gaps.length === 0) continue
    actions.push({
      actionId: `close-${kebabCase(sectionId)}-gap`,
      recommendedAction: section.gaps[0],
      reason: section.summary,
      authorityBoundary: 'This report only recommends future profile or manifest changes.',
    })
  }
  if (actions.length === 0) {
    actions.push({
      actionId: 'plan-native-retrofit-fixture',
      recommendedAction: 'Plan a Native/Retrofit benchmark fixture or profile-specific validation fixture next.',
      reason:
        'Profile, extension catalog, and adapter compatibility hints are sufficient for the next report-only bridge.',
      authorityBoundary: 'Fixture creation is deferred to a separate explicit implementation slice.',
    })
  }
  return actions
}

function blockingStatusForFinding(
  finding: NativeRetrofitProfileFinding,
): NativeRetrofitProfileValidationReport['nativeRetrofitValidationStatus'] {
  if (finding.code.includes('SOURCE_CHAIN')) return 'blocked-source-chain-mismatch'
  if (finding.code.includes('PROJECT_PROFILE')) return 'blocked-project-profile-invalid'
  if (finding.code.includes('CATALOG')) return 'blocked-extension-profile-catalog-invalid'
  if (finding.code.includes('ADAPTER')) return 'blocked-extension-adapter-compatibility-invalid'
  if (finding.code.includes('CONTEXT')) return 'blocked-extension-context-plan-invalid'
  return 'blocked-unsafe-authority-flag'
}

function renderMarkdown(report: NativeRetrofitProfileValidationReport): string {
  return [
    '# DevView Native/Retrofit Profile Validation',
    '',
    `- status: ${report.status}`,
    `- mode: ${report.nativeRetrofitModeSummary.mode}`,
    `- modeInferenceStatus: ${report.nativeRetrofitModeSummary.modeInferenceStatus}`,
    `- findings: ${report.validationFindings.length}`,
    '',
    '## Coverage',
    ...Object.entries(report.profileCoverage).map(
      ([key, section]) => `- ${key}: ${section.coverageStatus} - ${section.summary}`,
    ),
    '',
    '## Downstream Actions',
    ...report.downstreamActionPlan.map((action) => `- ${action.actionId}: ${action.recommendedAction}`),
    '',
    '## Safety',
    '- extensionExecutionAllowed: false',
    '- providerInvoked: false',
    '- networkCallMade: false',
    '- shellCommandsExecuted: false',
    '- graphSourceMutated: false',
    '- graphDeltaApplied: false',
    '- runtimeEvidenceSatisfied: false',
    '- equivalenceProven: false',
    '- scopeEnforced: false',
  ].join('\n')
}

async function assertOutputAuthority(
  root: string,
  sourcePaths: string[],
  options: NativeRetrofitProfileValidationOptions,
): Promise<void> {
  const outputPath = options.output ? resolveRepoPath(root, options.output) : null
  const markdownPath = options.markdown ? resolveRepoPath(root, options.markdown) : null
  if (!outputPath) throw new Error('extensions validate-native-retrofit-profile requires --output <json>.')
  const sourceSet = new Set(sourcePaths.map((entry) => path.resolve(entry)))
  if (markdownPath && path.resolve(outputPath) === path.resolve(markdownPath)) {
    throw new Error('Native/Retrofit validation JSON output and Markdown output must be different paths.')
  }
  for (const target of [outputPath, ...(markdownPath ? [markdownPath] : [])]) {
    const relativeTarget = relativePath(root, target)
    if (sourceSet.has(path.resolve(target))) {
      throw new Error(`Native/Retrofit validation output would overwrite a source input: ${relativeTarget}.`)
    }
    if (
      hasDevViewControlDirectory(target) ||
      hasCodexControlDirectory(target) ||
      hasHiddenControlDirectorySegment(target)
    ) {
      throw new Error(`Native/Retrofit validation output is inside a protected control path: ${relativeTarget}.`)
    }
    if (isSourceAuthorityShapedPath(relativeTarget)) {
      throw new Error(
        `Native/Retrofit validation output would overwrite a source-authority-shaped path: ${relativeTarget}.`,
      )
    }
  }
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

function normalizePath(value: string): string {
  return value.replace(/\\/g, '/').toLowerCase()
}

function kebabCase(value: string): string {
  return value.replace(/[A-Z]/g, (entry) => `-${entry.toLowerCase()}`).replace(/^-/, '')
}

function uniqueSorted(values: Array<string | null | undefined>): string[] {
  return [...new Set(values.filter((value): value is string => Boolean(value)))].sort()
}

function stringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value.filter((entry): entry is string => typeof entry === 'string')
}

function arrayStrings(value: unknown): string[] {
  return stringArray(value)
}

function arrayRecords(value: unknown): JsonRecord[] {
  if (!Array.isArray(value)) return []
  return value.filter((entry): entry is JsonRecord => Boolean(asRecord(entry)))
}

function stringValue(value: unknown): string | null {
  return typeof value === 'string' ? value : null
}

function numberValue(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function asRecord(value: unknown): JsonRecord | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as JsonRecord) : null
}

function resolveRepoPath(root: string, filePath: string): string {
  return path.isAbsolute(filePath) ? filePath : path.resolve(root, filePath)
}
