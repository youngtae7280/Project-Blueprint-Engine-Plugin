import { execFile } from 'node:child_process'
import path from 'node:path'
import { promisify } from 'node:util'
import { relativePath, writeJsonAtomic } from './fs.js'

const execFileAsync = promisify(execFile)

export const defaultGitDerivedChangedFileCollectionPath =
  'examples/valid/todo-app-devview-run/generated/git-derived-changed-file-collection.runtime-evidence-only.preview.json'

export interface GitDerivedCollectionOptions {
  baseRef?: string
  headRef?: string
  workingTree?: boolean
  staged?: boolean
  untracked?: boolean
  output?: string
}

export type GitDerivedCollectionMode =
  | 'explicit-base-head'
  | 'working-tree-tracked-unstaged'
  | 'staged-index'
  | 'untracked-files'

export type GitDerivedSourceMode = 'explicit-base-head' | 'working-tree' | 'staged-index' | 'untracked-files'

export interface ParsedNameStatusEntry {
  status: string
  statusCode: string
  path?: string
  oldPath?: string
  newPath?: string
}

export interface NormalizedChangedFileEntry {
  status: string
  statusCode: string
  changeType: string
  path?: string
  oldPath?: string
  newPath?: string
  generatedPath: boolean
}

export interface GitDerivedChangedFileCollectionArtifact {
  schemaVersion: 1
  artifactRole: 'git-derived-changed-file-collection-preview'
  status: 'git-derived-changed-files-collected'
  fixtureId: 'calibration-fixture-todo-app-runtime-evidence-only'
  fixtureShape: 'test-only-behavior-proof'
  checkerAxis: 'scope-compliance-preview'
  collectionStatus: 'git-derived-changed-files-collected'
  scopeComplianceCollectionInputConsumptionStatus: 'scope-compliance-collection-input-consumption-previewed'
  scopeComplianceScopeInputBindingStatus: 'scope-compliance-scope-input-binding-previewed'
  scopeCompliancePathPatternPolicyStatus: 'scope-compliance-path-pattern-policy-previewed'
  scopeCompliancePathMatchingHelperStatus: 'helper-implemented-not-consumed-for-evaluation'
  scopeComplianceViolationCategorySchemaStatus: 'scope-compliance-violation-category-schema-previewed'
  scopeComplianceEvaluationResultShapeStatus: 'scope-compliance-evaluation-result-shape-previewed'
  authorityClass: 'git-derived-changed-files'
  collectionMode: GitDerivedCollectionMode
  sourceMode: GitDerivedSourceMode
  baseRef?: string
  headRef?: string
  resolvedBaseRef?: string
  resolvedHeadRef?: string
  workingTreeMode?: 'tracked-unstaged-only'
  stagedMode?: 'staged-index-only'
  untrackedMode?: 'ls-files-others-exclude-standard'
  gitCommandMode:
    | 'diff-name-status-explicit-base-head-with-renames'
    | 'diff-name-status-working-tree-with-renames'
    | 'diff-cached-name-status-with-renames'
    | 'ls-files-others-exclude-standard'
  changedFilesCollected: true
  checkerRun: false
  scopeComplianceEvaluationStatus: 'not-evaluated'
  evaluatedViolations: []
  actualDiffInspected: false
  patchContentsInspected: false
  gitNameStatusCollected: true
  changedFileNameStatusCollected: true
  stagedChangesIncluded: boolean
  unstagedTrackedChangesIncluded: boolean
  untrackedFilesIncluded: boolean
  scopeEnforced: false
  diffRejected: false
  cleanClaimed: false
  actualViolationClaimed: false
  sourceArtifacts: {
    scopeComplianceCollectionInputConsumption: string
    scopeComplianceScopeInputBinding: string
    scopeCompliancePathPatternPolicy: string
    scopeCompliancePathMatchingHelper: string
    scopeComplianceViolationCategorySchema: string
    scopeComplianceEvaluationResultShape: string
    scopeComplianceResultPreview: string
    scopeComplianceCheckerPreview: string
    scopeComplianceNotRunReport: string
  }
  changedFiles: ParsedNameStatusEntry[]
  normalizedChangedFiles: NormalizedChangedFileEntry[]
  pathNormalization: {
    policy: 'repository-root-relative-posix-paths'
    windowsBackslashNormalization: 'replace-backslash-with-forward-slash'
    absoluteLocalPathsAllowed: false
    emittedAbsoluteLocalPaths: false
    repositoryRootRelative: true
    caseSensitivity: 'repository-policy-unresolved'
  }
  renameDeleteHandling: {
    commandMode: 'name-status-with-renames'
    renameStatusPreserved: boolean
    deletedStatusPreserved: boolean
    copiedStatusPreserved: boolean
  }
  generatedFileHandling: {
    policy: 'report-generated-files-honestly'
    generatedFilesExcluded: false
    generatedFilesPresent: boolean
    generatedFiles: string[]
    suppressionPolicy: 'not-applied-separate-policy-required'
  }
  collectionWarnings: string[]
  allowedUse: string[]
  forbiddenUse: string[]
  nonEvaluationBoundary: string
}

export interface GitDerivedChangedFileCollectionResult {
  artifact: GitDerivedChangedFileCollectionArtifact
  outputPath: string
}

export function validateExplicitGitRef(label: 'base' | 'head', value: string | undefined): string[] {
  const problems: string[] = []
  if (!value || value.trim().length === 0) {
    return [`${label} ref is required.`]
  }
  if (value !== value.trim()) {
    problems.push(`${label} ref must not include leading or trailing whitespace.`)
  }
  if (value.startsWith('-')) {
    problems.push(`${label} ref must not start with "-".`)
  }
  if (/\s/.test(value)) {
    problems.push(`${label} ref must not include whitespace.`)
  }
  if (value.includes('\0')) {
    problems.push(`${label} ref must not include NUL bytes.`)
  }
  if (value.length > 256) {
    problems.push(`${label} ref is unexpectedly long.`)
  }
  return problems
}

export function parseNameStatusZ(output: string): ParsedNameStatusEntry[] {
  const tokens = output.split('\0').filter((entry) => entry.length > 0)
  const entries: ParsedNameStatusEntry[] = []
  for (let index = 0; index < tokens.length; index += 1) {
    const status = tokens[index]
    const statusCode = status.slice(0, 1)
    if (statusCode === 'R' || statusCode === 'C') {
      const oldPath = tokens[index + 1]
      const newPath = tokens[index + 2]
      if (oldPath && newPath) {
        entries.push({ status, statusCode, oldPath, newPath })
      }
      index += 2
    } else {
      const filePath = tokens[index + 1]
      if (filePath) {
        entries.push({ status, statusCode, path: filePath })
      }
      index += 1
    }
  }
  return entries
}

export function normalizeRepositoryRelativePath(filePath: string): { path: string; warnings: string[] } {
  const warnings: string[] = []
  let normalized = filePath.replaceAll('\\', '/').replace(/^\.\/+/, '')
  const windowsAbsolute = /^[A-Za-z]:\//.test(normalized)
  const posixAbsolute = normalized.startsWith('/')
  if (windowsAbsolute || posixAbsolute) {
    warnings.push(`Changed-file path was absolute and was stripped to avoid local path authority: ${filePath}`)
    normalized = normalized.replace(/^[A-Za-z]:\//, '').replace(/^\/+/, '')
  }
  while (normalized.includes('//')) {
    normalized = normalized.replaceAll('//', '/')
  }
  if (normalized === '..' || normalized.startsWith('../')) {
    warnings.push(`Changed-file path escapes the repository root and cannot be authoritative: ${filePath}`)
    normalized = normalized.replace(/^(\.\.\/)+/, '')
  }
  return { path: normalized, warnings }
}

export function buildGitDerivedChangedFileCollectionArtifact(input: {
  collectionMode?: GitDerivedCollectionMode
  baseRef?: string
  headRef?: string
  resolvedBaseRef?: string
  resolvedHeadRef?: string
  nameStatusOutput?: string
  parsedEntries?: ParsedNameStatusEntry[]
}): GitDerivedChangedFileCollectionArtifact {
  const collectionMode = input.collectionMode || 'explicit-base-head'
  const isWorkingTreeMode = collectionMode === 'working-tree-tracked-unstaged'
  const isStagedMode = collectionMode === 'staged-index'
  const isUntrackedMode = collectionMode === 'untracked-files'
  const sourceMode: GitDerivedSourceMode = isWorkingTreeMode
    ? 'working-tree'
    : isStagedMode
      ? 'staged-index'
      : isUntrackedMode
        ? 'untracked-files'
        : 'explicit-base-head'
  const parsed = input.parsedEntries ?? parseNameStatusZ(input.nameStatusOutput || '')
  const collectionWarnings: string[] = []
  const normalizedChangedFiles = parsed.map((entry): NormalizedChangedFileEntry => {
    const normalizedPath = entry.path ? normalizeRepositoryRelativePath(entry.path) : undefined
    const normalizedOldPath = entry.oldPath ? normalizeRepositoryRelativePath(entry.oldPath) : undefined
    const normalizedNewPath = entry.newPath ? normalizeRepositoryRelativePath(entry.newPath) : undefined
    for (const normalization of [normalizedPath, normalizedOldPath, normalizedNewPath]) {
      if (normalization) {
        collectionWarnings.push(...normalization.warnings)
      }
    }
    const pathForGeneratedCheck = normalizedPath?.path || normalizedNewPath?.path || normalizedOldPath?.path || ''
    return {
      status: entry.status,
      statusCode: entry.statusCode,
      changeType: changeTypeForStatus(entry.statusCode),
      ...(normalizedPath ? { path: normalizedPath.path } : {}),
      ...(normalizedOldPath ? { oldPath: normalizedOldPath.path } : {}),
      ...(normalizedNewPath ? { newPath: normalizedNewPath.path } : {}),
      generatedPath: isGeneratedPath(pathForGeneratedCheck),
    }
  })
  const generatedFiles = normalizedChangedFiles
    .flatMap((entry) => [entry.path, entry.oldPath, entry.newPath].filter((value): value is string => Boolean(value)))
    .filter(isGeneratedPath)
  if (isUntrackedMode && generatedFiles.length > 0) {
    collectionWarnings.push(
      'Untracked generated-looking files were collected as advisory input only; this warning does not approve, reject, enforce, or satisfy Evidence.',
    )
  }

  return {
    schemaVersion: 1,
    artifactRole: 'git-derived-changed-file-collection-preview',
    status: 'git-derived-changed-files-collected',
    fixtureId: 'calibration-fixture-todo-app-runtime-evidence-only',
    fixtureShape: 'test-only-behavior-proof',
    checkerAxis: 'scope-compliance-preview',
    collectionStatus: 'git-derived-changed-files-collected',
    scopeComplianceCollectionInputConsumptionStatus: 'scope-compliance-collection-input-consumption-previewed',
    scopeComplianceScopeInputBindingStatus: 'scope-compliance-scope-input-binding-previewed',
    scopeCompliancePathPatternPolicyStatus: 'scope-compliance-path-pattern-policy-previewed',
    scopeCompliancePathMatchingHelperStatus: 'helper-implemented-not-consumed-for-evaluation',
    scopeComplianceViolationCategorySchemaStatus: 'scope-compliance-violation-category-schema-previewed',
    scopeComplianceEvaluationResultShapeStatus: 'scope-compliance-evaluation-result-shape-previewed',
    authorityClass: 'git-derived-changed-files',
    collectionMode,
    sourceMode,
    ...(input.baseRef ? { baseRef: input.baseRef } : {}),
    ...(input.headRef ? { headRef: input.headRef } : {}),
    ...(input.resolvedBaseRef ? { resolvedBaseRef: input.resolvedBaseRef } : {}),
    ...(input.resolvedHeadRef ? { resolvedHeadRef: input.resolvedHeadRef } : {}),
    ...(isWorkingTreeMode ? { workingTreeMode: 'tracked-unstaged-only' as const } : {}),
    ...(isStagedMode ? { stagedMode: 'staged-index-only' as const } : {}),
    ...(isUntrackedMode ? { untrackedMode: 'ls-files-others-exclude-standard' as const } : {}),
    gitCommandMode: gitCommandModeForCollection(collectionMode),
    changedFilesCollected: true,
    checkerRun: false,
    scopeComplianceEvaluationStatus: 'not-evaluated',
    evaluatedViolations: [],
    actualDiffInspected: false,
    patchContentsInspected: false,
    gitNameStatusCollected: true,
    changedFileNameStatusCollected: true,
    stagedChangesIncluded: isStagedMode,
    unstagedTrackedChangesIncluded: isWorkingTreeMode,
    untrackedFilesIncluded: isUntrackedMode,
    scopeEnforced: false,
    diffRejected: false,
    cleanClaimed: false,
    actualViolationClaimed: false,
    sourceArtifacts: {
      scopeComplianceCollectionInputConsumption:
        'examples/valid/todo-app-devview-run/generated/scope-compliance-collection-input-consumption.runtime-evidence-only.preview.json',
      scopeComplianceScopeInputBinding:
        'examples/valid/todo-app-devview-run/generated/scope-compliance-scope-input-binding.runtime-evidence-only.preview.json',
      scopeCompliancePathPatternPolicy:
        'examples/valid/todo-app-devview-run/generated/scope-compliance-path-pattern-policy.runtime-evidence-only.preview.json',
      scopeCompliancePathMatchingHelper: 'cli/src/core/scope-compliance-path-pattern.ts',
      scopeComplianceViolationCategorySchema:
        'examples/valid/todo-app-devview-run/generated/scope-compliance-violation-category-schema.runtime-evidence-only.preview.json',
      scopeComplianceEvaluationResultShape:
        'examples/valid/todo-app-devview-run/generated/scope-compliance-evaluation-result-shape.runtime-evidence-only.preview.json',
      scopeComplianceResultPreview:
        'examples/valid/todo-app-devview-run/generated/scope-compliance-result.runtime-evidence-only.preview.json',
      scopeComplianceCheckerPreview:
        'examples/valid/todo-app-devview-run/generated/scope-compliance-checker.runtime-evidence-only.preview.json',
      scopeComplianceNotRunReport:
        'examples/valid/todo-app-devview-run/generated/scope-compliance-not-run-report.runtime-evidence-only.preview.json',
    },
    changedFiles: parsed,
    normalizedChangedFiles,
    pathNormalization: {
      policy: 'repository-root-relative-posix-paths',
      windowsBackslashNormalization: 'replace-backslash-with-forward-slash',
      absoluteLocalPathsAllowed: false,
      emittedAbsoluteLocalPaths: false,
      repositoryRootRelative: true,
      caseSensitivity: 'repository-policy-unresolved',
    },
    renameDeleteHandling: {
      commandMode: 'name-status-with-renames',
      renameStatusPreserved: parsed.some((entry) => entry.statusCode === 'R'),
      deletedStatusPreserved: parsed.some((entry) => entry.statusCode === 'D'),
      copiedStatusPreserved: parsed.some((entry) => entry.statusCode === 'C'),
    },
    generatedFileHandling: {
      policy: 'report-generated-files-honestly',
      generatedFilesExcluded: false,
      generatedFilesPresent: generatedFiles.length > 0,
      generatedFiles: [...new Set(generatedFiles)],
      suppressionPolicy: 'not-applied-separate-policy-required',
    },
    collectionWarnings: [...new Set(collectionWarnings)],
    allowedUse: [
      collectionAllowedUse(collectionMode),
      'review normalized repository-root-relative paths',
      'confirm that collection-only output keeps checkerRun false',
      'prepare a later non-enforcing scope evaluation slice',
    ],
    forbiddenUse: [
      'scope compliance evaluation',
      'allowedScope comparison',
      'forbiddenScope comparison',
      'no-violation claim',
      'actual violation claim',
      'diff rejection',
      'scope enforcement',
      'CI enforcement',
      'required check configuration',
      'fixture approval',
      'runtime Evidence satisfaction',
      'equivalence proof',
      'user acceptance',
    ],
    nonEvaluationBoundary: collectionBoundary(collectionMode),
  }
}

function gitCommandModeForCollection(
  collectionMode: GitDerivedCollectionMode,
): GitDerivedChangedFileCollectionArtifact['gitCommandMode'] {
  if (collectionMode === 'working-tree-tracked-unstaged') {
    return 'diff-name-status-working-tree-with-renames'
  }
  if (collectionMode === 'staged-index') {
    return 'diff-cached-name-status-with-renames'
  }
  if (collectionMode === 'untracked-files') {
    return 'ls-files-others-exclude-standard'
  }
  return 'diff-name-status-explicit-base-head-with-renames'
}

function collectionAllowedUse(collectionMode: GitDerivedCollectionMode): string {
  if (collectionMode === 'working-tree-tracked-unstaged') {
    return 'collect tracked unstaged working tree changed-file names and status for a later scope compliance input'
  }
  if (collectionMode === 'staged-index') {
    return 'collect staged index changed-file names and status for a later scope compliance input'
  }
  if (collectionMode === 'untracked-files') {
    return 'collect untracked file paths for a later scope compliance input'
  }
  return 'collect git-derived changed-file names and status for a later scope compliance input'
}

function collectionBoundary(collectionMode: GitDerivedCollectionMode): string {
  if (collectionMode === 'working-tree-tracked-unstaged') {
    return 'This artifact is collection-only. It records tracked unstaged working tree changed-file names/status, but it does not include staged changes, include untracked files, inspect patch contents, evaluate allowedScope or forbiddenScope, run the compliance checker, report clean or violation results, reject diffs, enforce scope, approve fixtures, satisfy runtime Evidence, or prove equivalence.'
  }
  if (collectionMode === 'staged-index') {
    return 'This artifact is collection-only. It records staged index changed-file names/status, but it does not include unstaged tracked changes, include untracked files, inspect patch contents, evaluate allowedScope or forbiddenScope, run the compliance checker, report clean or violation results, reject diffs, enforce scope, approve fixtures, satisfy runtime Evidence, or prove equivalence.'
  }
  if (collectionMode === 'untracked-files') {
    return 'This artifact is collection-only. It records untracked file paths, but it does not include staged changes, include unstaged tracked changes, inspect patch contents or full file contents, evaluate allowedScope or forbiddenScope, run the compliance checker, report clean or violation results, reject diffs, enforce scope, approve fixtures, satisfy runtime Evidence, or prove equivalence.'
  }
  return 'This artifact is collection-only. It records git-derived changed-file names/status between explicit refs, but it does not inspect patch contents, evaluate allowedScope or forbiddenScope, run the compliance checker, report clean or violation results, reject diffs, enforce scope, approve fixtures, satisfy runtime Evidence, or prove equivalence.'
}

export async function collectGitDerivedChangedFiles(
  root: string,
  options: GitDerivedCollectionOptions,
): Promise<GitDerivedChangedFileCollectionResult> {
  const artifact = await collectGitDerivedChangedFileArtifact(root, options)
  const outputPath = path.resolve(root, options.output || defaultGitDerivedChangedFileCollectionPath)
  await writeJsonAtomic(outputPath, artifact)
  return {
    artifact,
    outputPath: relativePath(root, outputPath),
  }
}

export async function collectGitDerivedChangedFileArtifact(
  root: string,
  options: Pick<GitDerivedCollectionOptions, 'baseRef' | 'headRef' | 'workingTree' | 'staged' | 'untracked'>,
): Promise<GitDerivedChangedFileCollectionArtifact> {
  if (options.workingTree) {
    return collectWorkingTreeChangedFileArtifact(root)
  }
  if (options.staged) {
    return collectStagedChangedFileArtifact(root)
  }
  if (options.untracked) {
    return collectUntrackedChangedFileArtifact(root)
  }
  const validationProblems = [
    ...validateExplicitGitRef('base', options.baseRef),
    ...validateExplicitGitRef('head', options.headRef),
  ]
  if (validationProblems.length > 0) {
    throw new Error(validationProblems.join(' '))
  }

  const [resolvedBaseRef, resolvedHeadRef, nameStatusOutput] = await Promise.all([
    resolveCommitRef(root, options.baseRef || ''),
    resolveCommitRef(root, options.headRef || ''),
    readGitNameStatus(root, options.baseRef || '', options.headRef || ''),
  ])
  const artifact = buildGitDerivedChangedFileCollectionArtifact({
    baseRef: options.baseRef,
    headRef: options.headRef,
    resolvedBaseRef,
    resolvedHeadRef,
    nameStatusOutput,
  })
  return artifact
}

export async function collectWorkingTreeChangedFileArtifact(
  root: string,
): Promise<GitDerivedChangedFileCollectionArtifact> {
  const nameStatusOutput = await readGitWorkingTreeNameStatus(root)
  return buildGitDerivedChangedFileCollectionArtifact({
    collectionMode: 'working-tree-tracked-unstaged',
    nameStatusOutput,
  })
}

export async function collectStagedChangedFileArtifact(root: string): Promise<GitDerivedChangedFileCollectionArtifact> {
  const nameStatusOutput = await readGitStagedNameStatus(root)
  return buildGitDerivedChangedFileCollectionArtifact({
    collectionMode: 'staged-index',
    nameStatusOutput,
  })
}

export async function collectUntrackedChangedFileArtifact(
  root: string,
): Promise<GitDerivedChangedFileCollectionArtifact> {
  const untrackedOutput = await readGitUntrackedFiles(root)
  return buildGitDerivedChangedFileCollectionArtifact({
    collectionMode: 'untracked-files',
    parsedEntries: parseUntrackedFilesZ(untrackedOutput),
  })
}

async function resolveCommitRef(root: string, ref: string): Promise<string> {
  const { stdout } = await execFileAsync('git', ['-C', root, 'rev-parse', '--verify', `${ref}^{commit}`], {
    encoding: 'utf8',
    maxBuffer: 1024 * 1024,
  })
  return stdout.trim()
}

async function readGitNameStatus(root: string, baseRef: string, headRef: string): Promise<string> {
  const { stdout } = await execFileAsync(
    'git',
    ['-C', root, 'diff', '--name-status', '--find-renames', '-z', baseRef, headRef, '--'],
    {
      encoding: 'utf8',
      maxBuffer: 1024 * 1024 * 10,
    },
  )
  return stdout
}

async function readGitWorkingTreeNameStatus(root: string): Promise<string> {
  const { stdout } = await execFileAsync('git', ['-C', root, 'diff', '--name-status', '--find-renames', '-z', '--'], {
    encoding: 'utf8',
    maxBuffer: 1024 * 1024 * 10,
  })
  return stdout
}

async function readGitStagedNameStatus(root: string): Promise<string> {
  const { stdout } = await execFileAsync(
    'git',
    ['-C', root, 'diff', '--cached', '--name-status', '--find-renames', '-z', '--'],
    {
      encoding: 'utf8',
      maxBuffer: 1024 * 1024 * 10,
    },
  )
  return stdout
}

async function readGitUntrackedFiles(root: string): Promise<string> {
  const { stdout } = await execFileAsync('git', ['-C', root, 'ls-files', '--others', '--exclude-standard', '-z'], {
    encoding: 'utf8',
    maxBuffer: 1024 * 1024 * 10,
  })
  return stdout
}

function parseUntrackedFilesZ(output: string): ParsedNameStatusEntry[] {
  return output
    .split('\0')
    .filter((entry) => entry.length > 0)
    .map((filePath) => ({
      status: '??',
      statusCode: '??',
      path: filePath,
    }))
}

function changeTypeForStatus(statusCode: string): string {
  const map: Record<string, string> = {
    '??': 'untracked',
    A: 'added',
    C: 'copied',
    D: 'deleted',
    M: 'modified',
    R: 'renamed',
    T: 'type-changed',
    U: 'unmerged',
    X: 'unknown',
  }
  return map[statusCode] || 'other'
}

function isGeneratedPath(filePath: string): boolean {
  return filePath.split('/').includes('generated')
}
