import path from 'node:path'
import { readJsonSafe, relativePath, writeJsonAtomic, writeTextAtomic } from './fs.js'
import {
  hasCodexControlDirectory,
  hasDevViewControlDirectory,
  hasHiddenControlDirectorySegment,
} from './path-safety.js'

type JsonRecord = Record<string, unknown>

const REPORT_ROLE = 'devview-extension-adapter-compatibility-report'
const REPORT_STATUS = 'devview-extension-adapter-compatibility-validated'
const BLOCKED_STATUS = 'devview-extension-adapter-compatibility-blocked'
const CATALOG_ROLE = 'devview-extension-profile-catalog'
const CATALOG_STATUS = 'devview-extension-profile-catalog-compiled'
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

interface ReadinessSourceDef {
  key: 'runtimeEvidenceSatisfactionReadiness' | 'equivalenceProofReadiness' | 'scopeCiEnforcementReadiness'
  sourceId: string
  label: string
  role: string
  statusPrefix: string
}

const readinessSourceDefs: ReadinessSourceDef[] = [
  {
    key: 'runtimeEvidenceSatisfactionReadiness',
    sourceId: 'runtime-evidence-satisfaction-readiness',
    label: 'Runtime Evidence satisfaction readiness',
    role: 'devview-runtime-evidence-satisfaction-readiness-preview',
    statusPrefix: 'devview-runtime-evidence-satisfaction-readiness-',
  },
  {
    key: 'equivalenceProofReadiness',
    sourceId: 'equivalence-proof-readiness',
    label: 'Equivalence proof readiness',
    role: 'devview-equivalence-proof-readiness-preview',
    statusPrefix: 'devview-equivalence-proof-readiness-',
  },
  {
    key: 'scopeCiEnforcementReadiness',
    sourceId: 'scope-ci-enforcement-readiness',
    label: 'Scope/CI enforcement readiness',
    role: 'devview-scope-ci-enforcement-readiness-preview',
    statusPrefix: 'devview-scope-ci-enforcement-readiness-',
  },
]

export interface ExtensionAdapterCompatibilityOptions {
  extensionProfileCatalog?: string
  extensionContextPlan?: string
  runtimeEvidenceSatisfactionReadiness?: string
  equivalenceProofReadiness?: string
  scopeCiEnforcementReadiness?: string
  output?: string
  markdown?: string
}

export interface ExtensionAdapterCompatibilityReport {
  schemaVersion: 1
  artifactRole: typeof REPORT_ROLE
  status: typeof REPORT_STATUS | typeof BLOCKED_STATUS
  compatibilityScope: 'extension-adapter-compatibility-report-only'
  adapterCompatibilityStatus:
    | 'validated-report-only-compatibility'
    | 'blocked-extension-profile-catalog-invalid'
    | 'blocked-extension-context-plan-invalid'
    | 'blocked-source-chain-mismatch'
    | 'blocked-readiness-source-invalid'
    | 'blocked-unsafe-authority-flag'
  sourceExtensionProfileCatalog: string
  sourceExtensionContextPlan: string
  sourceRuntimeEvidenceSatisfactionReadiness: string | null
  sourceEquivalenceProofReadiness: string | null
  sourceScopeCiEnforcementReadiness: string | null
  sourceExtensionProfileCatalogSummary: {
    catalogStatus: string | null
    catalogEntryCount: number
    evidenceAdapterCount: number
    policyExtensionCount: number
    graphIngestionCandidateCount: number
    nativeRetrofitHintStatus: string | null
    nativeRetrofitMode: string | null
  }
  sourceExtensionContextPlanSummary: {
    extensionContextPlanStatus: string | null
    planningScope: string | null
    viewTreeAlignmentStatus: string | null
    contextPackAlignmentStatus: string | null
    evidenceAdapterHintCount: number
    policyExtensionHintCount: number
    graphIngestionCandidateCount: number
    nativeRetrofitHintStatus: string | null
    nativeRetrofitMode: string | null
  }
  sourceChainComparison: {
    catalogContextPlanComparisonStatus: 'matched-catalog-source' | 'mismatch-catalog-source' | 'not-modeled'
    expectedCatalogSource: string
    actualContextPlanCatalogSource: string | null
    limitations: string[]
  }
  evidenceAdapterCompatibility: AdapterCompatibilitySection
  policyExtensionCompatibility: AdapterCompatibilitySection
  proofLifecycleCompatibility: AdapterCompatibilitySection
  readinessSourceComparisons: Record<string, JsonRecord>
  graphIngestionPlanningContext: {
    candidateCount: number
    graphifyCandidateCount: number
    protocolStatus: 'protocol-only-not-executed'
    providerInvoked: false
    networkCallMade: false
    shellCommandsExecuted: false
    executionAllowed: false
  }
  nativeRetrofitAdapterHints: {
    mode: string
    hintStatus: string
    nativeSignals: string[]
    retrofitSignals: string[]
    adapterRelevanceStatus: 'native-retrofit-hints-carried' | 'native-retrofit-hints-unknown'
  }
  unsupportedFutureOnlyAdapterCapabilities: Array<{
    capability: string
    status: 'future-only' | 'missing-required-mapping'
    reason: string
  }>
  downstreamActionPlan: Array<{
    actionId: string
    recommendedAction: string
    reason: string
    authorityBoundary: string
  }>
  findings: ExtensionAdapterCompatibilityFinding[]
  extensionExecutionAllowed: false
  extensionsExecuted: false
  adapterExecuted: false
  policyEnforced: false
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
  traversalAuthorityGranted: false
  contextPackMutated: false
  viewTreeMutated: false
  nonEnforcing: true
  writtenOutputPath?: string
  writtenMarkdownPath?: string
}

export interface AdapterCompatibilitySection {
  compatibilityStatus: 'compatible' | 'missing-required-mapping' | 'future-only' | 'not-applicable'
  extensionIds: string[]
  sourceReadinessStatus: string | null
  requiredMappingId: string | null
  compatibilityBasis: string
  adapterExecuted?: false
  policyEnforced?: false
  runtimeEvidenceSatisfied: false
  equivalenceProven: false
  scopeEnforced: false
  ciEnforcementEnabled: false
  authorityStatus: 'source-fact-only-not-lifecycle-authority'
}

export interface ExtensionAdapterCompatibilityFinding {
  severity: 'info' | 'warning' | 'error'
  code: string
  path?: string
  field?: string
  message: string
}

interface LoadedSource {
  key: string
  sourceId: string
  label: string
  path: string
  record: JsonRecord | null
}

export class ExtensionAdapterCompatibilityValidationError extends Error {
  readonly report: ExtensionAdapterCompatibilityReport

  constructor(report: ExtensionAdapterCompatibilityReport) {
    super('Extension adapter compatibility validation is blocked.')
    this.report = report
  }
}

export async function validateExtensionAdapterCompatibility(
  root: string,
  options: ExtensionAdapterCompatibilityOptions = {},
): Promise<ExtensionAdapterCompatibilityReport> {
  if (!options.extensionProfileCatalog) {
    throw new Error('extensions validate-adapters requires --extension-profile-catalog <file>.')
  }
  if (!options.extensionContextPlan) {
    throw new Error('extensions validate-adapters requires --extension-context-plan <file>.')
  }

  const catalogPath = resolveRepoPath(root, options.extensionProfileCatalog)
  const contextPlanPath = resolveRepoPath(root, options.extensionContextPlan)
  const sourceExtensionProfileCatalog = relativePath(root, catalogPath)
  const sourceExtensionContextPlan = relativePath(root, contextPlanPath)
  const findings: ExtensionAdapterCompatibilityFinding[] = []

  const catalog = await loadRequiredSource(
    catalogPath,
    sourceExtensionProfileCatalog,
    'extensionProfileCatalog',
    'Extension Profile Catalog',
    findings,
  )
  const contextPlan = await loadRequiredSource(
    contextPlanPath,
    sourceExtensionContextPlan,
    'extensionContextPlan',
    'Extension Context Plan',
    findings,
  )
  const readinessSources = await loadOptionalReadinessSources(root, options, findings)

  validateCatalog(catalog, findings)
  validateContextPlan(contextPlan, findings)
  for (const source of readinessSources) validateReadinessSource(source, findings)
  validateSourceChain(root, sourceExtensionProfileCatalog, contextPlan.record, findings)

  const catalogInfo = buildCatalogInfo(catalog.record)
  const contextInfo = buildContextPlanInfo(contextPlan.record)
  const readinessByKey = new Map(readinessSources.map((source) => [source.key, source.record] as const))
  const status = chooseStatus(findings)
  const report: ExtensionAdapterCompatibilityReport = {
    schemaVersion: 1,
    artifactRole: REPORT_ROLE,
    status: status === 'validated-report-only-compatibility' ? REPORT_STATUS : BLOCKED_STATUS,
    compatibilityScope: 'extension-adapter-compatibility-report-only',
    adapterCompatibilityStatus: status,
    sourceExtensionProfileCatalog,
    sourceExtensionContextPlan,
    sourceRuntimeEvidenceSatisfactionReadiness: sourcePathFor(readinessSources, 'runtimeEvidenceSatisfactionReadiness'),
    sourceEquivalenceProofReadiness: sourcePathFor(readinessSources, 'equivalenceProofReadiness'),
    sourceScopeCiEnforcementReadiness: sourcePathFor(readinessSources, 'scopeCiEnforcementReadiness'),
    sourceExtensionProfileCatalogSummary: catalogInfo.summary,
    sourceExtensionContextPlanSummary: contextInfo.summary,
    sourceChainComparison: buildSourceChainComparison(root, sourceExtensionProfileCatalog, contextPlan.record),
    evidenceAdapterCompatibility: buildEvidenceAdapterCompatibility(
      catalogInfo.evidenceAdapterIds,
      contextInfo.evidenceAdapterHintIds,
      readinessByKey.get('runtimeEvidenceSatisfactionReadiness') ?? null,
    ),
    policyExtensionCompatibility: buildPolicyExtensionCompatibility(
      catalogInfo.policyExtensionIds,
      contextInfo.policyExtensionHintIds,
      readinessByKey.get('scopeCiEnforcementReadiness') ?? null,
    ),
    proofLifecycleCompatibility: buildProofLifecycleCompatibility(
      catalogInfo.evidenceAdapterIds,
      contextInfo.evidenceAdapterHintIds,
      contextInfo.policyExtensionHintIds,
      readinessByKey.get('equivalenceProofReadiness') ?? null,
    ),
    readinessSourceComparisons: buildReadinessSourceComparisons(readinessSources),
    graphIngestionPlanningContext: {
      candidateCount: contextInfo.graphIngestionCandidateCount,
      graphifyCandidateCount: contextInfo.graphifyCandidateCount,
      protocolStatus: 'protocol-only-not-executed',
      providerInvoked: false,
      networkCallMade: false,
      shellCommandsExecuted: false,
      executionAllowed: false,
    },
    nativeRetrofitAdapterHints: {
      mode: contextInfo.nativeRetrofitMode,
      hintStatus: contextInfo.nativeRetrofitHintStatus,
      nativeSignals: contextInfo.nativeSignals,
      retrofitSignals: contextInfo.retrofitSignals,
      adapterRelevanceStatus:
        contextInfo.nativeRetrofitHintStatus === 'profile-mode-unknown'
          ? 'native-retrofit-hints-unknown'
          : 'native-retrofit-hints-carried',
    },
    unsupportedFutureOnlyAdapterCapabilities: buildFutureOnlyCapabilities(catalogInfo, contextInfo, readinessByKey),
    downstreamActionPlan: buildDownstreamActionPlan(catalogInfo, contextInfo, readinessByKey),
    findings,
    extensionExecutionAllowed: false,
    extensionsExecuted: false,
    adapterExecuted: false,
    policyEnforced: false,
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
    traversalAuthorityGranted: false,
    contextPackMutated: false,
    viewTreeMutated: false,
    nonEnforcing: true,
  }

  await assertOutputAuthority(root, {
    sourcePaths: [
      catalogPath,
      contextPlanPath,
      ...readinessSources.map((source) => resolveRepoPath(root, source.path)),
    ],
    output: options.output,
    markdown: options.markdown,
  })

  if (report.status === BLOCKED_STATUS) {
    throw new ExtensionAdapterCompatibilityValidationError(report)
  }

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

async function loadOptionalReadinessSources(
  root: string,
  options: ExtensionAdapterCompatibilityOptions,
  findings: ExtensionAdapterCompatibilityFinding[],
): Promise<LoadedSource[]> {
  const loaded: LoadedSource[] = []
  for (const def of readinessSourceDefs) {
    const requested = options[def.key]
    if (!requested) continue
    const resolved = resolveRepoPath(root, requested)
    loaded.push(await loadRequiredSource(resolved, relativePath(root, resolved), def.key, def.label, findings))
  }
  return loaded
}

async function loadRequiredSource(
  filePath: string,
  sourcePath: string,
  key: string,
  label: string,
  findings: ExtensionAdapterCompatibilityFinding[],
): Promise<LoadedSource> {
  const parsed = await readJsonSafe<JsonRecord>(filePath)
  if (!parsed.ok) {
    findings.push({
      severity: 'error',
      code: `EXTENSION_ADAPTER_COMPATIBILITY_${slugCode(key)}_UNREADABLE`,
      path: sourcePath,
      message: `Unable to read ${label}: ${parsed.error}`,
    })
    return { key, sourceId: key, label, path: sourcePath, record: null }
  }
  const record = asRecord(parsed.value)
  if (!record) {
    findings.push({
      severity: 'error',
      code: `EXTENSION_ADAPTER_COMPATIBILITY_${slugCode(key)}_INVALID_JSON`,
      path: sourcePath,
      message: `${label} must be a JSON object.`,
    })
    return { key, sourceId: key, label, path: sourcePath, record: null }
  }
  return { key, sourceId: key, label, path: sourcePath, record }
}

function validateCatalog(source: LoadedSource, findings: ExtensionAdapterCompatibilityFinding[]): void {
  const record = source.record
  if (!record) return
  if (record.artifactRole !== CATALOG_ROLE || record.status !== CATALOG_STATUS) {
    findings.push({
      severity: 'error',
      code: 'EXTENSION_ADAPTER_COMPATIBILITY_CATALOG_ROLE_STATUS_INVALID',
      path: source.path,
      message: 'Adapter compatibility validation requires a compiled DevView extension profile catalog.',
    })
  }
  pushUnsafeFindings(source, record, findings)
}

function validateContextPlan(source: LoadedSource, findings: ExtensionAdapterCompatibilityFinding[]): void {
  const record = source.record
  if (!record) return
  if (record.artifactRole !== CONTEXT_PLAN_ROLE || record.status !== CONTEXT_PLAN_STATUS) {
    findings.push({
      severity: 'error',
      code: 'EXTENSION_ADAPTER_COMPATIBILITY_CONTEXT_PLAN_ROLE_STATUS_INVALID',
      path: source.path,
      message: 'Adapter compatibility validation requires a generated DevView extension context plan.',
    })
  }
  pushUnsafeFindings(source, record, findings)
}

function validateReadinessSource(source: LoadedSource, findings: ExtensionAdapterCompatibilityFinding[]): void {
  const record = source.record
  if (!record) return
  const def = readinessSourceDefs.find((entry) => entry.key === source.key)
  if (!def) return
  const role = stringValue(record.artifactRole)
  const status = stringValue(record.status)
  if (role !== def.role || !status.startsWith(def.statusPrefix)) {
    findings.push({
      severity: 'error',
      code: 'EXTENSION_ADAPTER_COMPATIBILITY_READINESS_ROLE_STATUS_INVALID',
      path: source.path,
      message: `${def.label} must use ${def.role} and a recognized readiness status.`,
    })
  }
  pushUnsafeFindings(source, record, findings)
}

function validateSourceChain(
  root: string,
  catalogPath: string,
  contextPlan: JsonRecord | null,
  findings: ExtensionAdapterCompatibilityFinding[],
): void {
  if (!contextPlan) return
  const expected = normalizePath(catalogPath)
  const actual = stringValue(contextPlan.sourceExtensionProfileCatalog)
  if (!actual) {
    findings.push({
      severity: 'error',
      code: 'EXTENSION_ADAPTER_COMPATIBILITY_CONTEXT_PLAN_CATALOG_SOURCE_MISSING',
      field: 'sourceExtensionProfileCatalog',
      message: 'Extension Context Plan must record the Extension Profile Catalog source path.',
    })
    return
  }
  if (
    normalizePath(actual) !== expected &&
    normalizePath(relativePath(root, resolveRepoPath(root, actual))) !== expected
  ) {
    findings.push({
      severity: 'error',
      code: 'EXTENSION_ADAPTER_COMPATIBILITY_CONTEXT_PLAN_CATALOG_SOURCE_MISMATCH',
      field: 'sourceExtensionProfileCatalog',
      message: 'Extension Context Plan source catalog path does not match the supplied Extension Profile Catalog.',
    })
  }
}

function pushUnsafeFindings(
  source: LoadedSource,
  record: JsonRecord,
  findings: ExtensionAdapterCompatibilityFinding[],
): void {
  for (const field of collectUnsafeAuthorityFields(record)) {
    findings.push({
      severity: 'error',
      code: 'EXTENSION_ADAPTER_COMPATIBILITY_UNSAFE_AUTHORITY_FLAG',
      path: source.path,
      field,
      message: `${source.label} must not assert authority flag ${field}.`,
    })
  }
}

function buildCatalogInfo(catalog: JsonRecord | null): {
  summary: ExtensionAdapterCompatibilityReport['sourceExtensionProfileCatalogSummary']
  evidenceAdapterIds: string[]
  policyExtensionIds: string[]
  graphIngestionCandidateCount: number
} {
  const capabilityCatalog = asRecord(catalog?.capabilityCatalog)
  const nativeRetrofitHints = asRecord(catalog?.nativeRetrofitProfileHints)
  const evidenceAdapterIds = uniqueStrings([
    ...arrayStrings(capabilityCatalog?.evidenceAdapters),
    ...catalogEntryIdsWithConnection(catalog, 'evidence'),
  ])
  const policyExtensionIds = uniqueStrings([
    ...arrayStrings(capabilityCatalog?.policyExtensions),
    ...catalogEntryIdsWithConnection(catalog, 'policy'),
  ])
  const graphIngestionCandidateCount = arrayRecords(catalog?.graphIngestionCandidates).length
  return {
    summary: {
      catalogStatus: stringValue(catalog?.extensionCatalogStatus) || null,
      catalogEntryCount:
        numberValue(catalog?.catalogEntryCount) ?? arrayRecords(catalog?.extensionCatalogEntries).length,
      evidenceAdapterCount: evidenceAdapterIds.length,
      policyExtensionCount: policyExtensionIds.length,
      graphIngestionCandidateCount,
      nativeRetrofitHintStatus: stringValue(nativeRetrofitHints?.hintStatus) || null,
      nativeRetrofitMode: stringValue(nativeRetrofitHints?.mode) || null,
    },
    evidenceAdapterIds,
    policyExtensionIds,
    graphIngestionCandidateCount,
  }
}

function buildContextPlanInfo(contextPlan: JsonRecord | null): {
  summary: ExtensionAdapterCompatibilityReport['sourceExtensionContextPlanSummary']
  evidenceAdapterHintIds: string[]
  policyExtensionHintIds: string[]
  graphIngestionCandidateCount: number
  graphifyCandidateCount: number
  nativeRetrofitMode: string
  nativeRetrofitHintStatus: string
  nativeSignals: string[]
  retrofitSignals: string[]
} {
  const evidencePolicy = asRecord(contextPlan?.evidencePolicyHintPlan)
  const graphIngestion = asRecord(contextPlan?.graphIngestionPlanning)
  const nativeRetrofit = asRecord(contextPlan?.nativeRetrofitPlanning)
  const viewTreeHintPlan = asRecord(contextPlan?.viewTreeHintPlan)
  const contextPackHintPlan = asRecord(contextPlan?.contextPackHintPlan)
  const evidenceAdapterHintIds = arrayStrings(evidencePolicy?.evidenceAdapters)
  const policyExtensionHintIds = arrayStrings(evidencePolicy?.policyExtensions)
  const graphIngestionCandidateCount =
    numberValue(graphIngestion?.candidateCount) ?? arrayRecords(graphIngestion?.candidates).length
  const graphifyCandidateCount =
    numberValue(graphIngestion?.graphifyCandidateCount) ??
    arrayRecords(graphIngestion?.candidates).filter((entry) => stringValue(entry.graphProviderKind) === 'graphify')
      .length
  return {
    summary: {
      extensionContextPlanStatus: stringValue(contextPlan?.extensionContextPlanStatus) || null,
      planningScope: stringValue(contextPlan?.planningScope) || null,
      viewTreeAlignmentStatus: stringValue(viewTreeHintPlan?.alignmentStatus) || null,
      contextPackAlignmentStatus: stringValue(contextPackHintPlan?.alignmentStatus) || null,
      evidenceAdapterHintCount: evidenceAdapterHintIds.length,
      policyExtensionHintCount: policyExtensionHintIds.length,
      graphIngestionCandidateCount,
      nativeRetrofitHintStatus: stringValue(nativeRetrofit?.hintStatus) || null,
      nativeRetrofitMode: stringValue(nativeRetrofit?.mode) || null,
    },
    evidenceAdapterHintIds,
    policyExtensionHintIds,
    graphIngestionCandidateCount,
    graphifyCandidateCount,
    nativeRetrofitMode: stringValue(nativeRetrofit?.mode) || 'unknown',
    nativeRetrofitHintStatus: stringValue(nativeRetrofit?.hintStatus) || 'profile-mode-unknown',
    nativeSignals: arrayStrings(nativeRetrofit?.nativeSignals),
    retrofitSignals: arrayStrings(nativeRetrofit?.retrofitSignals),
  }
}

function buildEvidenceAdapterCompatibility(
  catalogEvidenceAdapterIds: string[],
  contextEvidenceAdapterIds: string[],
  runtimeReadiness: JsonRecord | null,
): AdapterCompatibilitySection {
  const extensionIds = uniqueStrings([...catalogEvidenceAdapterIds, ...contextEvidenceAdapterIds])
  const requiredMappingId = findRequiredMappingId(runtimeReadiness)
  return {
    compatibilityStatus: readinessCompatibilityStatus(Boolean(runtimeReadiness), extensionIds.length > 0),
    extensionIds,
    sourceReadinessStatus: runtimeReadiness ? stringValue(runtimeReadiness.status) || null : null,
    requiredMappingId,
    compatibilityBasis: runtimeReadiness
      ? requiredMappingId
        ? 'Compared declared evidence adapters to Runtime Evidence readiness required evidence.'
        : 'Runtime Evidence readiness was supplied, but no concrete required evidence id was modeled.'
      : 'No Runtime Evidence readiness input supplied; compatibility remains future-only source fact.',
    adapterExecuted: false,
    runtimeEvidenceSatisfied: false,
    equivalenceProven: false,
    scopeEnforced: false,
    ciEnforcementEnabled: false,
    authorityStatus: 'source-fact-only-not-lifecycle-authority',
  }
}

function buildPolicyExtensionCompatibility(
  catalogPolicyIds: string[],
  contextPolicyIds: string[],
  scopeReadiness: JsonRecord | null,
): AdapterCompatibilitySection {
  const extensionIds = uniqueStrings([...catalogPolicyIds, ...contextPolicyIds])
  return {
    compatibilityStatus: readinessCompatibilityStatus(Boolean(scopeReadiness), extensionIds.length > 0),
    extensionIds,
    sourceReadinessStatus: scopeReadiness ? stringValue(scopeReadiness.status) || null : null,
    requiredMappingId: findRequiredMappingId(scopeReadiness),
    compatibilityBasis: scopeReadiness
      ? 'Compared declared policy extensions to Scope/CI readiness source facts.'
      : 'No Scope/CI readiness input supplied; policy compatibility remains future-only source fact.',
    policyEnforced: false,
    runtimeEvidenceSatisfied: false,
    equivalenceProven: false,
    scopeEnforced: false,
    ciEnforcementEnabled: false,
    authorityStatus: 'source-fact-only-not-lifecycle-authority',
  }
}

function buildProofLifecycleCompatibility(
  catalogEvidenceAdapterIds: string[],
  contextEvidenceAdapterIds: string[],
  contextPolicyIds: string[],
  equivalenceReadiness: JsonRecord | null,
): AdapterCompatibilitySection {
  const extensionIds = uniqueStrings([...catalogEvidenceAdapterIds, ...contextEvidenceAdapterIds, ...contextPolicyIds])
  return {
    compatibilityStatus: readinessCompatibilityStatus(Boolean(equivalenceReadiness), extensionIds.length > 0),
    extensionIds,
    sourceReadinessStatus: equivalenceReadiness ? stringValue(equivalenceReadiness.status) || null : null,
    requiredMappingId: findRequiredMappingId(equivalenceReadiness),
    compatibilityBasis: equivalenceReadiness
      ? 'Compared declared evidence/policy hints to Equivalence Proof readiness source facts.'
      : 'No Equivalence Proof readiness input supplied; proof lifecycle compatibility remains future-only source fact.',
    runtimeEvidenceSatisfied: false,
    equivalenceProven: false,
    scopeEnforced: false,
    ciEnforcementEnabled: false,
    authorityStatus: 'source-fact-only-not-lifecycle-authority',
  }
}

function readinessCompatibilityStatus(
  readinessProvided: boolean,
  hasExtensions: boolean,
): AdapterCompatibilitySection['compatibilityStatus'] {
  if (readinessProvided && hasExtensions) return 'compatible'
  if (readinessProvided && !hasExtensions) return 'missing-required-mapping'
  if (!readinessProvided && hasExtensions) return 'future-only'
  return 'not-applicable'
}

function buildReadinessSourceComparisons(sources: LoadedSource[]): Record<string, JsonRecord> {
  const comparisons: Record<string, JsonRecord> = {}
  for (const source of sources) {
    comparisons[source.sourceId] = {
      sourcePath: source.path,
      artifactRole: stringValue(source.record?.artifactRole) || null,
      status: stringValue(source.record?.status) || null,
      requiredMappingId: findRequiredMappingId(source.record),
      comparisonStatus: 'source-summarized-no-authority',
    }
  }
  return comparisons
}

function buildSourceChainComparison(
  root: string,
  catalogPath: string,
  contextPlan: JsonRecord | null,
): ExtensionAdapterCompatibilityReport['sourceChainComparison'] {
  const actual = stringValue(contextPlan?.sourceExtensionProfileCatalog) || null
  const expected = normalizePath(catalogPath)
  const actualNormalized = actual ? normalizePath(actual) : ''
  const actualResolved = actual ? normalizePath(relativePath(root, resolveRepoPath(root, actual))) : ''
  const matched = Boolean(actual && (actualNormalized === expected || actualResolved === expected))
  return {
    catalogContextPlanComparisonStatus: actual
      ? matched
        ? 'matched-catalog-source'
        : 'mismatch-catalog-source'
      : 'not-modeled',
    expectedCatalogSource: catalogPath,
    actualContextPlanCatalogSource: actual,
    limitations: matched
      ? []
      : ['Only path equality is modeled in this report-only slice; no source hash or signed chain is required yet.'],
  }
}

function buildFutureOnlyCapabilities(
  catalogInfo: ReturnType<typeof buildCatalogInfo>,
  contextInfo: ReturnType<typeof buildContextPlanInfo>,
  readinessByKey: Map<string, JsonRecord | null>,
): ExtensionAdapterCompatibilityReport['unsupportedFutureOnlyAdapterCapabilities'] {
  const entries: ExtensionAdapterCompatibilityReport['unsupportedFutureOnlyAdapterCapabilities'] = []
  if (contextInfo.graphIngestionCandidateCount > 0 || catalogInfo.graphIngestionCandidateCount > 0) {
    entries.push({
      capability: 'graph-ingestion-protocol',
      status: 'future-only',
      reason: 'Graph ingestion candidates are protocol-only; no Graphify or external graph provider is executed.',
    })
  }
  if (readinessByKey.has('runtimeEvidenceSatisfactionReadiness') && catalogInfo.evidenceAdapterIds.length === 0) {
    entries.push({
      capability: 'evidence-adapter',
      status: 'missing-required-mapping',
      reason: 'Runtime Evidence readiness was supplied but no evidence adapter extension is declared.',
    })
  }
  if (readinessByKey.has('scopeCiEnforcementReadiness') && catalogInfo.policyExtensionIds.length === 0) {
    entries.push({
      capability: 'policy-extension',
      status: 'missing-required-mapping',
      reason: 'Scope/CI readiness was supplied but no policy extension is declared.',
    })
  }
  return entries
}

function buildDownstreamActionPlan(
  catalogInfo: ReturnType<typeof buildCatalogInfo>,
  contextInfo: ReturnType<typeof buildContextPlanInfo>,
  readinessByKey: Map<string, JsonRecord | null>,
): ExtensionAdapterCompatibilityReport['downstreamActionPlan'] {
  const actions: ExtensionAdapterCompatibilityReport['downstreamActionPlan'] = []
  if (catalogInfo.evidenceAdapterIds.length > 0 || contextInfo.evidenceAdapterHintIds.length > 0) {
    actions.push({
      actionId: 'connect-evidence-adapter-validation',
      recommendedAction:
        'Use declared evidence adapters as non-executing compatibility hints before future runtime Evidence satisfaction records.',
      reason: readinessByKey.has('runtimeEvidenceSatisfactionReadiness')
        ? 'Runtime Evidence readiness was supplied for comparison.'
        : 'Runtime Evidence readiness was not supplied yet.',
      authorityBoundary: 'Adapters are not executed and cannot satisfy Evidence in this report.',
    })
  }
  if (catalogInfo.policyExtensionIds.length > 0 || contextInfo.policyExtensionHintIds.length > 0) {
    actions.push({
      actionId: 'connect-policy-extension-validation',
      recommendedAction:
        'Use declared policy extensions as non-executing compatibility hints before future Scope/CI checks.',
      reason: readinessByKey.has('scopeCiEnforcementReadiness')
        ? 'Scope/CI readiness was supplied for comparison.'
        : 'Scope/CI readiness was not supplied yet.',
      authorityBoundary: 'Policy extensions are not enforced and cannot mutate CI or branch protection.',
    })
  }
  if (contextInfo.graphIngestionCandidateCount > 0) {
    actions.push({
      actionId: 'keep-graph-ingestion-protocol-only',
      recommendedAction: 'Design a separate protocol validation slice before any graph ingestion adapter execution.',
      reason: 'Graph ingestion candidates exist as protocol-only context.',
      authorityBoundary: 'No Graphify installation, provider call, network call, or graph-source mutation occurs here.',
    })
  }
  if (actions.length === 0) {
    actions.push({
      actionId: 'declare-adapter-capabilities',
      recommendedAction:
        'Declare evidence adapter or policy extension capabilities before lifecycle compatibility checks.',
      reason: 'No adapter or policy capability was declared.',
      authorityBoundary:
        'Capability declaration remains report-only until a later execution and authorization model exists.',
    })
  }
  return actions
}

function chooseStatus(
  findings: ExtensionAdapterCompatibilityFinding[],
): ExtensionAdapterCompatibilityReport['adapterCompatibilityStatus'] {
  const errors = findings.filter((finding) => finding.severity === 'error')
  if (errors.length === 0) return 'validated-report-only-compatibility'
  if (errors.some((finding) => finding.code.includes('UNSAFE_AUTHORITY_FLAG'))) return 'blocked-unsafe-authority-flag'
  if (errors.some((finding) => finding.code.includes('CATALOG_SOURCE'))) return 'blocked-source-chain-mismatch'
  if (errors.some((finding) => finding.code.includes('CONTEXT_PLAN'))) return 'blocked-extension-context-plan-invalid'
  if (errors.some((finding) => finding.code.includes('READINESS'))) return 'blocked-readiness-source-invalid'
  return 'blocked-extension-profile-catalog-invalid'
}

async function assertOutputAuthority(
  root: string,
  input: {
    sourcePaths: string[]
    output?: string
    markdown?: string
  },
): Promise<void> {
  const outputPath = input.output ? resolveRepoPath(root, input.output) : undefined
  const markdownPath = input.markdown ? resolveRepoPath(root, input.markdown) : undefined
  if (outputPath && markdownPath && pathKey(outputPath) === pathKey(markdownPath)) {
    throw new Error(
      'Extension adapter compatibility output is unsafe: --output and --markdown must be different paths.',
    )
  }
  const protectedPaths = new Set(input.sourcePaths.map((entry) => pathKey(entry)))
  for (const [label, requested, resolved] of [
    ['JSON output', input.output, outputPath],
    ['Markdown output', input.markdown, markdownPath],
  ] as const) {
    if (!requested || !resolved) continue
    if (protectedPaths.has(pathKey(resolved))) {
      throw new Error(
        `Extension adapter compatibility ${label} path is unsafe: ${requested} would overwrite a source input.`,
      )
    }
    if (isProtectedControlPath(root, resolved)) {
      throw new Error(
        `Extension adapter compatibility ${label} path is unsafe: ${requested} is inside a protected control path.`,
      )
    }
    const existingAuthority = await classifyExistingSourceAuthority(resolved)
    if (existingAuthority) {
      throw new Error(
        `Extension adapter compatibility ${label} path is unsafe: ${requested} already contains ${existingAuthority}. Choose a dedicated adapter compatibility output path.`,
      )
    }
  }
}

function renderMarkdown(report: ExtensionAdapterCompatibilityReport): string {
  return [
    '# DevView Extension Adapter Compatibility',
    '',
    `- status: ${report.status}`,
    `- adapterCompatibilityStatus: ${report.adapterCompatibilityStatus}`,
    `- catalog: ${report.sourceExtensionProfileCatalog}`,
    `- contextPlan: ${report.sourceExtensionContextPlan}`,
    `- runtimeReadiness: ${report.sourceRuntimeEvidenceSatisfactionReadiness ?? 'not provided'}`,
    `- equivalenceReadiness: ${report.sourceEquivalenceProofReadiness ?? 'not provided'}`,
    `- scopeReadiness: ${report.sourceScopeCiEnforcementReadiness ?? 'not provided'}`,
    '',
    '## Compatibility',
    '',
    `- Evidence adapters: ${report.evidenceAdapterCompatibility.compatibilityStatus}`,
    `- Policy extensions: ${report.policyExtensionCompatibility.compatibilityStatus}`,
    `- Proof lifecycle: ${report.proofLifecycleCompatibility.compatibilityStatus}`,
    `- Graph ingestion candidates: ${report.graphIngestionPlanningContext.candidateCount}`,
    '',
    '## Safety',
    '',
    `- adapterExecuted: ${report.adapterExecuted}`,
    `- policyEnforced: ${report.policyEnforced}`,
    `- providerInvoked: ${report.providerInvoked}`,
    `- networkCallMade: ${report.networkCallMade}`,
    `- shellCommandsExecuted: ${report.shellCommandsExecuted}`,
    '',
    '## Findings',
    '',
    ...(report.findings.length
      ? report.findings.map((entry) => `- [${entry.severity}] ${entry.code}: ${entry.message}`)
      : ['- none']),
  ].join('\n')
}

async function classifyExistingSourceAuthority(filePath: string): Promise<string | null> {
  const parsed = await readJsonSafe<JsonRecord>(filePath)
  if (!parsed.ok) return null
  const record = asRecord(parsed.value)
  if (!record) return null
  const artifactRole = stringValue(record.artifactRole)
  if (!artifactRole || artifactRole === REPORT_ROLE) return null
  if (
    artifactRole.includes('graph-source') ||
    artifactRole.includes('read-model') ||
    artifactRole.includes('evidence') ||
    artifactRole.includes('policy') ||
    artifactRole.includes('proposal') ||
    artifactRole.includes('decision') ||
    artifactRole.includes('view-tree') ||
    artifactRole.includes('context-pack') ||
    artifactRole === 'selected-graph-slice' ||
    artifactRole === 'contract-compiler-input' ||
    artifactRole === CATALOG_ROLE ||
    artifactRole === CONTEXT_PLAN_ROLE
  ) {
    return `source artifactRole "${artifactRole}"`
  }
  if (asRecord(record.sourceRecords)) return 'graph-source-shaped sourceRecords'
  if (Array.isArray(record.nodes) || Array.isArray(record.edges)) return 'read-model-shaped nodes/edges'
  return null
}

function collectUnsafeAuthorityFields(value: unknown, pathParts: string[] = [], seen = new Set<unknown>()): string[] {
  if (typeof value !== 'object' || value === null) return []
  if (seen.has(value)) return []
  seen.add(value)
  if (Array.isArray(value)) {
    return value.flatMap((entry, index) => collectUnsafeAuthorityFields(entry, [...pathParts, String(index)], seen))
  }
  const fields: string[] = []
  for (const [key, entry] of Object.entries(value as JsonRecord)) {
    const nextPath = [...pathParts, key]
    if (unsafeAuthorityFields.includes(key) && entry === true) fields.push(nextPath.join('.'))
    fields.push(...collectUnsafeAuthorityFields(entry, nextPath, seen))
  }
  return fields
}

function catalogEntryIdsWithConnection(catalog: JsonRecord | null, connection: 'evidence' | 'policy'): string[] {
  return arrayRecords(catalog?.extensionCatalogEntries)
    .filter((entry) => {
      const lifecycleConnections = asRecord(entry.lifecycleConnections)
      const capabilities = arrayStrings(entry.capabilities)
      return (
        lifecycleConnections?.[connection] === true ||
        capabilities.includes(`${connection}-extension`) ||
        (connection === 'evidence' && capabilities.includes('evidence-adapter'))
      )
    })
    .map((entry) => stringValue(entry.extensionId))
    .filter(Boolean)
}

function sourcePathFor(sources: LoadedSource[], key: string): string | null {
  return sources.find((source) => source.key === key)?.path ?? null
}

function findRequiredMappingId(record: JsonRecord | null): string | null {
  if (!record) return null
  const requiredEvidence = asRecord(record.requiredEvidence)
  return (
    stringValue(record.requiredEvidenceId) ||
    stringValue(requiredEvidence?.id) ||
    stringValue(requiredEvidence?.evidenceId) ||
    stringValue(record.evidenceRequirementId) ||
    stringValue(record.scopePolicyId) ||
    stringValue(record.policyId) ||
    stringValue(record.equivalenceProofReadinessId) ||
    null
  )
}

function isProtectedControlPath(root: string, resolvedPath: string): boolean {
  const relative = relativePath(root, resolvedPath)
  return (
    hasDevViewControlDirectory(relative) ||
    hasCodexControlDirectory(relative) ||
    hasHiddenControlDirectorySegment(relative)
  )
}

function resolveRepoPath(root: string, filePath: string): string {
  return path.isAbsolute(filePath) ? filePath : path.resolve(root, filePath)
}

function normalizePath(filePath: string): string {
  return filePath.replaceAll('\\', '/').toLowerCase()
}

function pathKey(filePath: string): string {
  return path.resolve(filePath).replaceAll('\\', '/').toLowerCase()
}

function asRecord(value: unknown): JsonRecord | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as JsonRecord) : null
}

function stringValue(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

function numberValue(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function arrayRecords(value: unknown): JsonRecord[] {
  return Array.isArray(value)
    ? value.map((entry) => asRecord(entry)).filter((entry): entry is JsonRecord => Boolean(entry))
    : []
}

function arrayStrings(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === 'string') : []
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))]
}

function slugCode(value: string): string {
  return value
    .replace(/([a-z])([A-Z])/g, '$1_$2')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
}
