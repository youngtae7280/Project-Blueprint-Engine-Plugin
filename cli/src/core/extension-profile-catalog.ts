import { existsSync } from 'node:fs'
import { readdir, stat } from 'node:fs/promises'
import path from 'node:path'
import { readJsonSafe, relativePath, writeJsonAtomic, writeTextAtomic } from './fs.js'
import {
  EXTENSION_MANIFEST_ROLE,
  EXTENSION_MANIFEST_STATUS,
  EXTENSION_READINESS_ROLE,
  PROJECT_PROFILE_ROLE,
  PROJECT_PROFILE_STATUS,
} from './extension-readiness.js'

type JsonRecord = Record<string, unknown>

export const EXTENSION_PROFILE_CATALOG_ROLE = 'devview-extension-profile-catalog'
const EXTENSION_PROFILE_CATALOG_STATUS = 'devview-extension-profile-catalog-compiled'
const EXTENSION_PROFILE_CATALOG_BLOCKED_STATUS = 'devview-extension-profile-catalog-blocked'

const allowedExtensionKinds = [
  'analyzer',
  'view-tree-extractor',
  'context-pack',
  'evidence-adapter',
  'policy',
  'skill-workflow',
] as const

const capabilityByKind: Record<string, string> = {
  analyzer: 'analyzer-extension',
  'view-tree-extractor': 'view-tree-extractor-extension',
  'context-pack': 'context-pack-extension',
  'evidence-adapter': 'evidence-adapter',
  policy: 'policy-extension',
  'skill-workflow': 'skill-workflow-extension',
}

const allowedPermissions = new Set([
  'read-project-profile',
  'read-maintainability-graph',
  'read-view-tree',
  'read-context-pack',
  'read-evidence',
  'read-policy',
  'write-report-output',
])

const unsafeAuthorityFields = [
  'extensionExecutionAllowed',
  'extensionsExecuted',
  'extensionCodeExecuted',
  'providerInvoked',
  'networkCallMade',
  'shellCommandExecuted',
  'shellCommandsExecuted',
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

export interface ExtensionProfileCatalogOptions {
  projectProfile?: string
  extensionsDir?: string
  extensionReadiness?: string
  output?: string
  markdown?: string
}

export interface ExtensionProfileCatalogReport {
  schemaVersion: 1
  artifactRole: typeof EXTENSION_PROFILE_CATALOG_ROLE
  status: typeof EXTENSION_PROFILE_CATALOG_STATUS | typeof EXTENSION_PROFILE_CATALOG_BLOCKED_STATUS
  catalogScope: 'project-specific-extension-catalog-report-only'
  extensionCatalogStatus:
    | 'compiled-declarative-capabilities-only'
    | 'blocked-extension-readiness-missing'
    | 'blocked-extension-readiness-not-ready'
    | 'blocked-project-profile-invalid'
    | 'blocked-invalid-extension-manifest'
    | 'blocked-unsafe-authority-flag'
  sourceProjectProfile: string
  sourceExtensionsDir: string
  sourceExtensionReadiness: string
  projectProfileId: string | null
  projectName: string | null
  projectDomain: string | null
  projectStack: string[]
  projectMode: string | null
  readinessStatus: string | null
  readinessSourceStatus: string | null
  discoveredManifestCount: number
  catalogEntryCount: number
  extensionCatalogEntries: ExtensionCatalogEntry[]
  capabilityCatalog: {
    analyzerExtensions: string[]
    viewTreeExtractorExtensions: string[]
    contextPackExtensions: string[]
    evidenceAdapters: string[]
    policyExtensions: string[]
    skillWorkflowExtensions: string[]
    graphIngestionCandidates: string[]
  }
  graphIngestionCandidates: GraphIngestionCandidate[]
  nativeRetrofitProfileHints: NativeRetrofitProfileHints
  downstreamCompatibility: DownstreamCompatibility
  requiredPermissions: string[]
  findings: ExtensionProfileCatalogFinding[]
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
  nonEnforcing: true
  writtenOutputPath?: string
  writtenMarkdownPath?: string
}

export interface ExtensionCatalogEntry {
  extensionId: string
  displayName: string | null
  extensionKind: string
  capabilities: string[]
  permissions: string[]
  sourceManifest: string
  executionModel: 'declarative-manifest-only'
  executionAllowed: false
  providerInvoked: false
  networkCallMade: false
  shellCommandsExecuted: false
  lifecycleConnections: {
    analyzer: boolean
    viewTree: boolean
    contextPack: boolean
    evidence: boolean
    policy: boolean
    scope: boolean
    workflow: boolean
    graphIngestion: boolean
  }
  authorityStatus: 'source-fact-only-not-traversal-authority'
}

export interface GraphIngestionCandidate {
  extensionId: string
  sourceManifest: string
  protocolStatus: 'protocol-only-not-executed'
  graphProviderKind: string | null
  executionAllowed: false
  providerInvoked: false
  networkCallMade: false
  shellCommandsExecuted: false
}

export interface NativeRetrofitProfileHints {
  mode: 'native' | 'retrofit' | 'hybrid' | 'unknown'
  hintStatus: 'profile-mode-declared' | 'profile-mode-inferred' | 'profile-mode-unknown'
  nativeSignals: string[]
  retrofitSignals: string[]
  sourceFields: string[]
  futureFieldCandidates: string[]
}

export interface DownstreamCompatibility {
  canInformViewTree: boolean
  canInformContextPack: boolean
  canInformEvidenceAdapterValidation: boolean
  canInformPolicyValidation: boolean
  canInformGraphIngestionPlanning: boolean
  canExecuteExtensionCode: false
  canSatisfyEvidence: false
  canProveEquivalence: false
  canEnforceScope: false
}

export interface ExtensionProfileCatalogFinding {
  severity: 'info' | 'warning' | 'error'
  code: string
  path?: string
  field?: string
  message: string
}

interface LoadedManifest {
  path: string
  record: JsonRecord | null
  findings: ExtensionProfileCatalogFinding[]
}

export class ExtensionProfileCatalogValidationError extends Error {
  readonly report: ExtensionProfileCatalogReport

  constructor(report: ExtensionProfileCatalogReport) {
    super('Extension profile catalog is blocked.')
    this.report = report
  }
}

export async function compileExtensionProfileCatalog(
  root: string,
  options: ExtensionProfileCatalogOptions = {},
): Promise<ExtensionProfileCatalogReport> {
  if (!options.extensionReadiness) {
    throw new Error('extensions compile-profile requires --extension-readiness <file>.')
  }

  const projectProfilePath = resolveRepoPath(root, options.projectProfile || '.devview/project-profile.json')
  const extensionsDir = resolveRepoPath(root, options.extensionsDir || '.devview/extensions')
  const extensionReadinessPath = resolveRepoPath(root, options.extensionReadiness)
  const sourceProjectProfile = relativePath(root, projectProfilePath)
  const sourceExtensionsDir = relativePath(root, extensionsDir)
  const sourceExtensionReadiness = relativePath(root, extensionReadinessPath)

  const findings: ExtensionProfileCatalogFinding[] = []
  const projectProfile = await loadProjectProfile(projectProfilePath, sourceProjectProfile, findings)
  const readiness = await loadExtensionReadiness(extensionReadinessPath, sourceExtensionReadiness, findings)
  const manifests = await loadManifests(extensionsDir, sourceExtensionsDir)
  findings.push(...manifests.flatMap((entry) => entry.findings))
  validateReadiness(readiness, {
    sourceExtensionReadiness,
    sourceProjectProfile,
    sourceExtensionsDir,
    findings,
  })
  const catalogEntries = buildCatalogEntries(manifests, findings)
  const graphIngestionCandidates = catalogEntries
    .filter((entry) => entry.lifecycleConnections.graphIngestion)
    .map((entry) => ({
      extensionId: entry.extensionId,
      sourceManifest: entry.sourceManifest,
      protocolStatus: 'protocol-only-not-executed' as const,
      graphProviderKind: inferGraphProviderKind(
        manifests.find((manifest) => manifest.path === entry.sourceManifest)?.record,
      ),
      executionAllowed: false as const,
      providerInvoked: false as const,
      networkCallMade: false as const,
      shellCommandsExecuted: false as const,
    }))

  const errorCode = chooseErrorStatus(findings)
  const report: ExtensionProfileCatalogReport = {
    schemaVersion: 1,
    artifactRole: EXTENSION_PROFILE_CATALOG_ROLE,
    status: errorCode ? EXTENSION_PROFILE_CATALOG_BLOCKED_STATUS : EXTENSION_PROFILE_CATALOG_STATUS,
    catalogScope: 'project-specific-extension-catalog-report-only',
    extensionCatalogStatus: errorCode ?? 'compiled-declarative-capabilities-only',
    sourceProjectProfile,
    sourceExtensionsDir,
    sourceExtensionReadiness,
    projectProfileId: stringValue(projectProfile?.projectProfileId) || null,
    projectName: stringValue(projectProfile?.projectName) || null,
    projectDomain: stringValue(projectProfile?.domain) || null,
    projectStack: stringArray(projectProfile?.stack),
    projectMode:
      stringValue(projectProfile?.devviewMode || projectProfile?.projectMode || projectProfile?.mode) || null,
    readinessStatus: stringValue(readiness?.extensionReadinessStatus) || null,
    readinessSourceStatus: stringValue(readiness?.status) || null,
    discoveredManifestCount: manifests.length,
    catalogEntryCount: catalogEntries.length,
    extensionCatalogEntries: catalogEntries,
    capabilityCatalog: buildCapabilityCatalog(catalogEntries),
    graphIngestionCandidates,
    nativeRetrofitProfileHints: buildNativeRetrofitHints(projectProfile),
    downstreamCompatibility: buildDownstreamCompatibility(catalogEntries),
    requiredPermissions: uniqueSorted(catalogEntries.flatMap((entry) => entry.permissions)),
    findings,
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
    nonEnforcing: true,
  }

  await assertCatalogOutputAuthority(root, {
    projectProfilePath,
    extensionReadinessPath,
    manifests,
    output: options.output,
    markdown: options.markdown,
  })

  if (report.status === EXTENSION_PROFILE_CATALOG_BLOCKED_STATUS) {
    throw new ExtensionProfileCatalogValidationError(report)
  }

  if (options.output) {
    const outputPath = resolveRepoPath(root, options.output)
    report.writtenOutputPath = relativePath(root, outputPath)
    await writeJsonAtomic(outputPath, report)
  }
  if (options.markdown) {
    const markdownPath = resolveRepoPath(root, options.markdown)
    report.writtenMarkdownPath = relativePath(root, markdownPath)
    await writeTextAtomic(markdownPath, renderExtensionProfileCatalogMarkdown(report))
    if (options.output) {
      await writeJsonAtomic(resolveRepoPath(root, options.output), report)
    }
  }

  return report
}

async function loadProjectProfile(
  filePath: string,
  relativeFilePath: string,
  findings: ExtensionProfileCatalogFinding[],
): Promise<JsonRecord | null> {
  const parsed = await readJsonSafe<JsonRecord>(filePath)
  if (!parsed.ok) {
    findings.push({
      severity: 'error',
      code: 'EXTENSION_CATALOG_PROJECT_PROFILE_MISSING',
      path: relativeFilePath,
      message: `Unable to read Project Profile: ${parsed.error}`,
    })
    return null
  }
  const profile = asRecord(parsed.value)
  if (!profile || profile.artifactRole !== PROJECT_PROFILE_ROLE || profile.status !== PROJECT_PROFILE_STATUS) {
    findings.push({
      severity: 'error',
      code: 'EXTENSION_CATALOG_PROJECT_PROFILE_INVALID',
      path: relativeFilePath,
      message: `Project Profile must use artifactRole ${PROJECT_PROFILE_ROLE} and status ${PROJECT_PROFILE_STATUS}.`,
    })
  }
  for (const field of collectUnsafeAuthorityFields(profile)) {
    findings.push({
      severity: 'error',
      code: 'EXTENSION_CATALOG_UNSAFE_AUTHORITY_FLAG',
      path: relativeFilePath,
      field,
      message: `Project Profile must not assert authority flag ${field}.`,
    })
  }
  return profile
}

async function loadExtensionReadiness(
  filePath: string,
  relativeFilePath: string,
  findings: ExtensionProfileCatalogFinding[],
): Promise<JsonRecord | null> {
  const parsed = await readJsonSafe<JsonRecord>(filePath)
  if (!parsed.ok) {
    findings.push({
      severity: 'error',
      code: 'EXTENSION_CATALOG_READINESS_UNREADABLE',
      path: relativeFilePath,
      message: `Unable to read Extension readiness report: ${parsed.error}`,
    })
    return null
  }
  const readiness = asRecord(parsed.value)
  if (!readiness) {
    findings.push({
      severity: 'error',
      code: 'EXTENSION_CATALOG_READINESS_INVALID',
      path: relativeFilePath,
      message: 'Extension readiness report must be a JSON object.',
    })
    return null
  }
  return readiness
}

function validateReadiness(
  readiness: JsonRecord | null,
  input: {
    sourceExtensionReadiness: string
    sourceProjectProfile: string
    sourceExtensionsDir: string
    findings: ExtensionProfileCatalogFinding[]
  },
): void {
  if (!readiness) {
    return
  }
  if (
    readiness.artifactRole !== EXTENSION_READINESS_ROLE ||
    readiness.status !== 'devview-extension-readiness-ready' ||
    !String(readiness.extensionReadinessStatus ?? '').startsWith('ready-')
  ) {
    input.findings.push({
      severity: 'error',
      code: 'EXTENSION_CATALOG_READINESS_NOT_READY',
      path: input.sourceExtensionReadiness,
      message:
        'Extension profile catalog requires a ready devview-extension-readiness-report before compiling a catalog.',
    })
  }
  if (stringValue(readiness.sourceProjectProfile) !== input.sourceProjectProfile) {
    input.findings.push({
      severity: 'error',
      code: 'EXTENSION_CATALOG_READINESS_PROJECT_PROFILE_MISMATCH',
      path: input.sourceExtensionReadiness,
      field: 'sourceProjectProfile',
      message: 'Extension readiness sourceProjectProfile does not match --project-profile.',
    })
  }
  if (stringValue(readiness.sourceExtensionsDir) !== input.sourceExtensionsDir) {
    input.findings.push({
      severity: 'error',
      code: 'EXTENSION_CATALOG_READINESS_EXTENSIONS_DIR_MISMATCH',
      path: input.sourceExtensionReadiness,
      field: 'sourceExtensionsDir',
      message: 'Extension readiness sourceExtensionsDir does not match --extensions-dir.',
    })
  }
  for (const field of collectUnsafeAuthorityFields(readiness)) {
    input.findings.push({
      severity: 'error',
      code: 'EXTENSION_CATALOG_UNSAFE_AUTHORITY_FLAG',
      path: input.sourceExtensionReadiness,
      field,
      message: `Extension readiness report must not assert authority flag ${field}.`,
    })
  }
}

async function loadManifests(extensionsDir: string, relativeExtensionsDir: string): Promise<LoadedManifest[]> {
  if (!existsSync(extensionsDir)) {
    return []
  }
  const entries = await readdir(extensionsDir)
  const manifests: LoadedManifest[] = []
  for (const entry of entries.sort()) {
    const absolutePath = path.join(extensionsDir, entry)
    const entryStat = await stat(absolutePath)
    if (!entryStat.isFile() || !entry.endsWith('.json')) {
      continue
    }
    manifests.push(await loadManifest(absolutePath, `${relativeExtensionsDir}/${entry}`))
  }
  return manifests
}

async function loadManifest(absolutePath: string, relativeManifestPath: string): Promise<LoadedManifest> {
  const findings: ExtensionProfileCatalogFinding[] = []
  const parsed = await readJsonSafe<JsonRecord>(absolutePath)
  const manifest = parsed.ok ? asRecord(parsed.value) : null
  if (!parsed.ok || !manifest) {
    findings.push({
      severity: 'error',
      code: 'EXTENSION_CATALOG_MANIFEST_INVALID_JSON',
      path: relativeManifestPath,
      message: parsed.ok ? 'Extension manifest must be a JSON object.' : parsed.error,
    })
    return { path: relativeManifestPath, record: null, findings }
  }
  return { path: relativeManifestPath, record: manifest, findings }
}

function buildCatalogEntries(
  manifests: LoadedManifest[],
  findings: ExtensionProfileCatalogFinding[],
): ExtensionCatalogEntry[] {
  const entries: ExtensionCatalogEntry[] = []
  for (const manifest of manifests) {
    const record = manifest.record
    if (!record) {
      continue
    }
    const extensionId = stringValue(record.extensionId)
    const extensionKind = stringValue(record.extensionKind)
    if (record.artifactRole !== EXTENSION_MANIFEST_ROLE || record.status !== EXTENSION_MANIFEST_STATUS) {
      findings.push({
        severity: 'error',
        code: 'EXTENSION_CATALOG_MANIFEST_ROLE_INVALID',
        path: manifest.path,
        message: `Extension Manifest must use artifactRole ${EXTENSION_MANIFEST_ROLE} and status ${EXTENSION_MANIFEST_STATUS}.`,
      })
    }
    if (!extensionId) {
      findings.push({
        severity: 'error',
        code: 'EXTENSION_CATALOG_MANIFEST_ID_MISSING',
        path: manifest.path,
        field: 'extensionId',
        message: 'Extension Manifest requires extensionId.',
      })
    }
    if (!extensionKind || !allowedExtensionKinds.includes(extensionKind as (typeof allowedExtensionKinds)[number])) {
      findings.push({
        severity: 'error',
        code: 'EXTENSION_CATALOG_MANIFEST_KIND_UNSUPPORTED',
        path: manifest.path,
        field: 'extensionKind',
        message: `Extension Manifest extensionKind must be one of: ${allowedExtensionKinds.join(', ')}.`,
      })
    }
    const permissions = stringArray(record.requiredPermissions)
    for (const permission of permissions) {
      if (!allowedPermissions.has(permission)) {
        findings.push({
          severity: 'error',
          code: 'EXTENSION_CATALOG_PERMISSION_UNSUPPORTED',
          path: manifest.path,
          field: 'requiredPermissions',
          message: `Extension permission is not supported in report-only catalog compilation: ${permission}.`,
        })
      }
    }
    if (hasExecutableDeclaration(record)) {
      findings.push({
        severity: 'error',
        code: 'EXTENSION_CATALOG_EXECUTION_DECLARATION_UNSUPPORTED',
        path: manifest.path,
        message: 'Extension execution entrypoints, commands, scripts, modules, or executable paths are not supported.',
      })
    }
    for (const field of collectUnsafeAuthorityFields(record)) {
      findings.push({
        severity: 'error',
        code: 'EXTENSION_CATALOG_UNSAFE_AUTHORITY_FLAG',
        path: manifest.path,
        field,
        message: `Extension Manifest must not assert authority flag ${field}.`,
      })
    }
    if (!extensionId || !extensionKind) {
      continue
    }
    const capabilities = normalizeCapabilities(record, extensionKind)
    entries.push({
      extensionId,
      displayName: stringValue(record.displayName || record.name) || null,
      extensionKind,
      capabilities,
      permissions,
      sourceManifest: manifest.path,
      executionModel: 'declarative-manifest-only',
      executionAllowed: false,
      providerInvoked: false,
      networkCallMade: false,
      shellCommandsExecuted: false,
      lifecycleConnections: lifecycleConnectionsFor(capabilities),
      authorityStatus: 'source-fact-only-not-traversal-authority',
    })
  }
  return entries.sort((left, right) => left.extensionId.localeCompare(right.extensionId))
}

function lifecycleConnectionsFor(capabilities: string[]): ExtensionCatalogEntry['lifecycleConnections'] {
  const has = (patterns: string[]): boolean => capabilities.some((capability) => patterns.includes(capability))
  const graphIngestion = capabilities.some((capability) =>
    ['graph-ingestion-candidate', 'external-graph-provider-protocol', 'graphify-protocol'].includes(capability),
  )
  return {
    analyzer: has(['analyzer-extension']),
    viewTree: has(['view-tree-extractor-extension']),
    contextPack: has(['context-pack-extension']),
    evidence: has(['evidence-adapter']),
    policy: has(['policy-extension']),
    scope: has(['policy-extension']),
    workflow: has(['skill-workflow-extension']),
    graphIngestion,
  }
}

function buildCapabilityCatalog(entries: ExtensionCatalogEntry[]): ExtensionProfileCatalogReport['capabilityCatalog'] {
  return {
    analyzerExtensions: idsFor(entries, (entry) => entry.lifecycleConnections.analyzer),
    viewTreeExtractorExtensions: idsFor(entries, (entry) => entry.lifecycleConnections.viewTree),
    contextPackExtensions: idsFor(entries, (entry) => entry.lifecycleConnections.contextPack),
    evidenceAdapters: idsFor(entries, (entry) => entry.lifecycleConnections.evidence),
    policyExtensions: idsFor(entries, (entry) => entry.lifecycleConnections.policy),
    skillWorkflowExtensions: idsFor(entries, (entry) => entry.lifecycleConnections.workflow),
    graphIngestionCandidates: idsFor(entries, (entry) => entry.lifecycleConnections.graphIngestion),
  }
}

function buildDownstreamCompatibility(entries: ExtensionCatalogEntry[]): DownstreamCompatibility {
  return {
    canInformViewTree: entries.some((entry) => entry.lifecycleConnections.viewTree),
    canInformContextPack: entries.some((entry) => entry.lifecycleConnections.contextPack),
    canInformEvidenceAdapterValidation: entries.some((entry) => entry.lifecycleConnections.evidence),
    canInformPolicyValidation: entries.some((entry) => entry.lifecycleConnections.policy),
    canInformGraphIngestionPlanning: entries.some((entry) => entry.lifecycleConnections.graphIngestion),
    canExecuteExtensionCode: false,
    canSatisfyEvidence: false,
    canProveEquivalence: false,
    canEnforceScope: false,
  }
}

function buildNativeRetrofitHints(profile: JsonRecord | null): NativeRetrofitProfileHints {
  const sourceFields: string[] = []
  const rawMode = stringValue(profile?.devviewMode || profile?.projectMode || profile?.mode)
  if (rawMode)
    sourceFields.push(
      rawMode === profile?.devviewMode ? 'devviewMode' : rawMode === profile?.projectMode ? 'projectMode' : 'mode',
    )
  const stack = stringArray(profile?.stack)
  const domain = stringValue(profile?.domain)
  const searchable = uniqueSorted([rawMode, domain, ...stack].filter(Boolean).map((entry) => entry.toLowerCase()))
  const nativeSignals = searchable.filter((entry) => entry.includes('native') || entry.includes('desktop'))
  const retrofitSignals = searchable.filter(
    (entry) => entry.includes('retrofit') || entry.includes('legacy') || entry.includes('migration'),
  )
  const declaredMode = ['native', 'retrofit', 'hybrid'].includes(rawMode)
    ? (rawMode as 'native' | 'retrofit' | 'hybrid')
    : null
  const inferredMode =
    !declaredMode && nativeSignals.length > 0 && retrofitSignals.length > 0
      ? 'hybrid'
      : !declaredMode && retrofitSignals.length > 0
        ? 'retrofit'
        : !declaredMode && nativeSignals.length > 0
          ? 'native'
          : null
  return {
    mode: declaredMode ?? inferredMode ?? 'unknown',
    hintStatus: declaredMode
      ? 'profile-mode-declared'
      : inferredMode
        ? 'profile-mode-inferred'
        : 'profile-mode-unknown',
    nativeSignals,
    retrofitSignals,
    sourceFields,
    futureFieldCandidates: ['devviewMode', 'projectType', 'nativeBoundaries', 'retrofitBoundaries'],
  }
}

function normalizeCapabilities(manifest: JsonRecord, extensionKind: string): string[] {
  const declared = stringArray(manifest.capabilities)
  const derived = capabilityByKind[extensionKind]
  return uniqueSorted([...declared, ...(derived ? [derived] : [])])
}

function idsFor(entries: ExtensionCatalogEntry[], predicate: (entry: ExtensionCatalogEntry) => boolean): string[] {
  return entries
    .filter(predicate)
    .map((entry) => entry.extensionId)
    .sort()
}

function chooseErrorStatus(
  findings: ExtensionProfileCatalogFinding[],
): ExtensionProfileCatalogReport['extensionCatalogStatus'] | null {
  if (!findings.some((finding) => finding.severity === 'error')) {
    return null
  }
  if (findings.some((finding) => finding.code === 'EXTENSION_CATALOG_READINESS_UNREADABLE')) {
    return 'blocked-extension-readiness-missing'
  }
  if (findings.some((finding) => finding.code.includes('READINESS'))) {
    return 'blocked-extension-readiness-not-ready'
  }
  if (findings.some((finding) => finding.code.includes('PROJECT_PROFILE'))) {
    return 'blocked-project-profile-invalid'
  }
  if (findings.some((finding) => finding.code === 'EXTENSION_CATALOG_UNSAFE_AUTHORITY_FLAG')) {
    return 'blocked-unsafe-authority-flag'
  }
  return 'blocked-invalid-extension-manifest'
}

async function assertCatalogOutputAuthority(
  root: string,
  input: {
    projectProfilePath: string
    extensionReadinessPath: string
    manifests: LoadedManifest[]
    output?: string
    markdown?: string
  },
): Promise<void> {
  const outputPath = input.output ? resolveRepoPath(root, input.output) : undefined
  const markdownPath = input.markdown ? resolveRepoPath(root, input.markdown) : undefined
  if (outputPath && markdownPath && pathKey(outputPath) === pathKey(markdownPath)) {
    throw new Error('Extension profile catalog output is unsafe: --output and --markdown must be different paths.')
  }
  const protectedPaths = new Map<string, string>()
  protectedPaths.set(pathKey(input.projectProfilePath), 'the source Project Profile')
  protectedPaths.set(pathKey(input.extensionReadinessPath), 'the source Extension readiness report')
  for (const manifest of input.manifests) {
    protectedPaths.set(pathKey(resolveRepoPath(root, manifest.path)), 'a source Extension Manifest')
  }
  for (const [label, requested, resolved] of [
    ['JSON output', input.output, outputPath],
    ['Markdown output', input.markdown, markdownPath],
  ] as const) {
    if (!requested || !resolved) continue
    const protectedReason = protectedPaths.get(pathKey(resolved))
    if (protectedReason) {
      throw new Error(
        `Extension profile catalog ${label} path is unsafe: ${requested} would overwrite ${protectedReason}.`,
      )
    }
    if (isProtectedControlPath(root, resolved)) {
      throw new Error(
        `Extension profile catalog ${label} path is unsafe: ${requested} is inside a protected control path.`,
      )
    }
    const existingAuthority = await classifyExistingSourceAuthority(resolved)
    if (existingAuthority) {
      throw new Error(
        `Extension profile catalog ${label} path is unsafe: ${requested} already contains ${existingAuthority}. Choose a dedicated catalog output path.`,
      )
    }
  }
}

function renderExtensionProfileCatalogMarkdown(report: ExtensionProfileCatalogReport): string {
  return [
    '# DevView Extension Profile Catalog',
    '',
    `- status: ${report.status}`,
    `- catalogStatus: ${report.extensionCatalogStatus}`,
    `- projectProfile: ${report.sourceProjectProfile}`,
    `- extensionReadiness: ${report.sourceExtensionReadiness}`,
    `- catalogEntries: ${report.catalogEntryCount}`,
    `- extensionExecutionAllowed: ${report.extensionExecutionAllowed}`,
    `- providerInvoked: ${report.providerInvoked}`,
    `- networkCallMade: ${report.networkCallMade}`,
    `- shellCommandsExecuted: ${report.shellCommandsExecuted}`,
    '',
    '## Capability Catalog',
    '',
    ...Object.entries(report.capabilityCatalog).map(
      ([key, values]) => `- ${key}: ${values.length ? values.join(', ') : 'none'}`,
    ),
    '',
    '## Native/Retrofit Hints',
    '',
    `- mode: ${report.nativeRetrofitProfileHints.mode}`,
    `- hintStatus: ${report.nativeRetrofitProfileHints.hintStatus}`,
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
  if (!artifactRole || artifactRole === EXTENSION_PROFILE_CATALOG_ROLE) return null
  if (
    artifactRole.includes('graph-source') ||
    artifactRole.includes('read-model') ||
    artifactRole.includes('evidence') ||
    artifactRole.includes('policy') ||
    artifactRole.includes('proposal') ||
    artifactRole.includes('decision') ||
    artifactRole === PROJECT_PROFILE_ROLE ||
    artifactRole === EXTENSION_MANIFEST_ROLE ||
    artifactRole === EXTENSION_READINESS_ROLE
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
    if (unsafeAuthorityFields.includes(key) && entry === true) {
      fields.push(nextPath.join('.'))
    }
    fields.push(...collectUnsafeAuthorityFields(entry, nextPath, seen))
  }
  return fields
}

function hasExecutableDeclaration(manifest: JsonRecord): boolean {
  const directKeys = ['entrypoint', 'command', 'script', 'module', 'executablePath']
  if (directKeys.some((key) => manifest[key] !== undefined && manifest[key] !== null && manifest[key] !== false)) {
    return true
  }
  const execution = asRecord(manifest.execution)
  if (!execution) return false
  return directKeys.some((key) => execution[key] !== undefined && execution[key] !== null && execution[key] !== false)
}

function inferGraphProviderKind(manifest: JsonRecord | null | undefined): string | null {
  return stringValue(manifest?.graphProviderKind || manifest?.providerKind || manifest?.externalGraphProvider) || null
}

function asRecord(value: unknown): JsonRecord | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as JsonRecord) : null
}

function stringValue(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === 'string') : []
}

function uniqueSorted(values: string[]): string[] {
  return [...new Set(values)].sort()
}

function resolveRepoPath(root: string, filePath: string): string {
  return path.isAbsolute(filePath) ? path.resolve(filePath) : path.resolve(root, filePath)
}

function isProtectedControlPath(root: string, filePath: string): boolean {
  const relative = relativePath(root, filePath)
  const firstSegment = relative.split('/')[0]
  return ['.devview', '.codex', '.git', '.github'].includes(firstSegment)
}

function pathKey(filePath: string): string {
  return path.resolve(filePath).toLowerCase()
}
