import { createHash } from 'node:crypto'
import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import { relativePath, writeJsonAtomic, writeTextAtomic } from './fs.js'
import {
  hasCodexControlDirectory,
  hasDevViewControlDirectory,
  hasHiddenControlDirectorySegment,
} from './path-safety.js'
import {
  CodeSubgraphValidationError,
  type CodeSubgraphValidationReport,
  validateCodeSubgraphRecord,
} from './code-subgraph-validation.js'
import { matchScopeCompliancePathPattern } from './scope-compliance-path-pattern.js'

type JsonRecord = Record<string, unknown>

const REPORT_ROLE = 'devview-native-code-subgraph-extraction-report'
const PASSED_STATUS = 'devview-native-code-subgraph-extraction-passed'
const BLOCKED_STATUS = 'devview-native-code-subgraph-extraction-blocked'
const REPORT_SCOPE = 'native-js-ts-code-subgraph-static-extraction-report-only'
const CODE_SUBGRAPH_ROLE = 'devview-code-subgraph'
const CODE_SUBGRAPH_STATUS = 'devview-code-subgraph-supplied'
const CODE_SUBGRAPH_SCOPE = 'code-subgraph-source-fact-only'
const EXTRACTOR_ID = 'native-static-js-ts-text-scan'

const supportedExtensions = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs'])
const skippedDirectories = new Set([
  '.git',
  '.devview',
  '.codex',
  '.tmp',
  'node_modules',
  'dist',
  'build',
  'coverage',
  '.next',
  '.turbo',
])
const maxFileBytes = 1_000_000
const maxSupportedFiles = 1_000
const callKeywordExclusions = new Set([
  'if',
  'for',
  'while',
  'switch',
  'catch',
  'function',
  'return',
  'typeof',
  'new',
  'super',
  'import',
  'require',
  'describe',
  'it',
  'test',
  'expect',
])
const methodKeywordExclusions = new Set(['if', 'for', 'while', 'switch', 'catch', 'function', 'constructor', 'return'])

export interface NativeCodeSubgraphExtractorOptions {
  targetRepo?: string
  include?: string[]
  output?: string
  validationOutput?: string
  markdown?: string
}

export interface NativeCodeSubgraphExtractionFinding {
  severity: 'blocker' | 'warning' | 'satisfied'
  code: string
  message: string
  field?: string
  path?: string
}

export interface NativeCodeSubgraphExtractionReport extends JsonRecord {
  schemaVersion: 1
  artifactRole: typeof REPORT_ROLE
  status: typeof PASSED_STATUS | typeof BLOCKED_STATUS
  extractionScope: typeof REPORT_SCOPE
  sourceFactsOnly: true
  reportOnly: true
  extractionMode: typeof EXTRACTOR_ID
  targetRepo: {
    path: string
    supportedFileCount: number
    unsupportedFileCount: number
    skippedLargeFileCount: number
    scannedByteCount: number
  }
  outputCodeSubgraph: {
    path: string
    artifactRole: typeof CODE_SUBGRAPH_ROLE
    status: typeof CODE_SUBGRAPH_STATUS
    scope: typeof CODE_SUBGRAPH_SCOPE
    nodeCount: number
    edgeCount: number
  }
  validationOutput: {
    path: string
    status: string | null
    codeSubgraphValidationStatus: string | null
  }
  extractionSummary: {
    fileNodeCount: number
    classNodeCount: number
    functionNodeCount: number
    methodNodeCount: number
    externalDependencyNodeCount: number
    importEdgeCount: number
    callEdgeCount: number
    containsEdgeCount: number
    unsupportedExtensions: Record<string, number>
    includePatterns: string[]
    ambiguousCallCount: number
    ambiguousCallNames: string[]
  }
  extractionFindings: NativeCodeSubgraphExtractionFinding[]
  downstreamActionPlan: string[]
  graphifyExecuted: false
  astExtractorExecuted: false
  providerInvoked: false
  networkCallMade: false
  apiCallMade: false
  shellCommandsExecuted: false
  extensionExecutionAllowed: false
  graphSourceMutated: false
  graphDeltaApplied: false
  viewTreeGenerated: false
  contextPackGenerated: false
  runtimeEvidenceSatisfied: false
  evidenceAccepted: false
  equivalenceProven: false
  scopeEnforced: false
  ciEnforcementEnabled: false
  rbacEnforced: false
  permissionVerified: false
  cryptographicSignatureVerified: false
  enterpriseGateActivated: false
  writtenCodeSubgraphPath?: string
  writtenValidationOutputPath?: string
  writtenMarkdownPath?: string
}

interface SourceFile {
  relativePath: string
  absolutePath: string
  content: string
  digest: string
  byteLength: number
  lineStarts: number[]
}

interface SymbolRecord {
  id: string
  name: string
  kind: 'class' | 'function' | 'method'
  sourceFile: string
  bodyText: string
  bodyStartIndex: number
}

interface ExtractionState {
  findings: NativeCodeSubgraphExtractionFinding[]
  nodes: JsonRecord[]
  edges: JsonRecord[]
  symbols: SymbolRecord[]
  fileNodesByRelativePath: Map<string, string>
  externalNodeIdsBySpecifier: Map<string, string>
  seenNodeIds: Set<string>
  seenEdgeIds: Set<string>
  unsupportedExtensions: Record<string, number>
  includePatterns: string[]
  includedSourcePaths: string[]
  supportedFileCount: number
  unsupportedFileCount: number
  skippedLargeFileCount: number
  scannedByteCount: number
  ambiguousCallNames: Set<string>
}

export class NativeCodeSubgraphExtractionError extends Error {
  readonly report: NativeCodeSubgraphExtractionReport

  constructor(report: NativeCodeSubgraphExtractionReport) {
    super('Native code subgraph static extraction is blocked.')
    this.report = report
  }
}

export async function extractNativeCodeSubgraphFile(
  root: string,
  options: NativeCodeSubgraphExtractorOptions,
): Promise<NativeCodeSubgraphExtractionReport> {
  validateRequiredOptions(options)
  const targetRepoPath = resolveRepoPath(root, options.targetRepo ?? '')
  await assertOutputAuthority(root, targetRepoPath, [], options)

  const includePatterns = parseIncludePatterns(options.include)
  const state = await extractCodeSubgraph(targetRepoPath, includePatterns)
  let blocked = state.findings.some((finding) => finding.severity === 'blocker')
  await assertOutputAuthority(root, targetRepoPath, state.includedSourcePaths, options)
  const codeSubgraph = buildCodeSubgraph(root, targetRepoPath, state)
  let validationReport: CodeSubgraphValidationReport | null = null

  if (!blocked) {
    try {
      validationReport = validateCodeSubgraphRecord(root, options.output ?? '', codeSubgraph)
    } catch (error) {
      blocked = true
      if (error instanceof CodeSubgraphValidationError) {
        validationReport = error.report
        state.findings.push(
          ...error.report.validationFindings.map((finding) =>
            blocker(
              `NATIVE_CODE_SUBGRAPH_${finding.code}`,
              `Generated native code subgraph failed validation: ${finding.message}`,
              finding.field,
              finding.path,
            ),
          ),
        )
      } else {
        state.findings.push(
          blocker(
            'NATIVE_CODE_SUBGRAPH_VALIDATION_FAILED',
            error instanceof Error ? error.message : String(error),
            undefined,
            options.output,
          ),
        )
      }
    }
  }

  if (blocked) {
    throw new NativeCodeSubgraphExtractionError(
      buildReport(root, targetRepoPath, state, validationReport, true, options),
    )
  }

  const outputPath = resolveRepoPath(root, options.output ?? '')
  const validationOutputPath = resolveRepoPath(root, options.validationOutput ?? '')
  await writeJsonAtomic(outputPath, codeSubgraph)
  if (validationReport) {
    validationReport.writtenOutputPath = relativePath(root, validationOutputPath)
    await writeJsonAtomic(validationOutputPath, validationReport)
  }

  const report = buildReport(root, targetRepoPath, state, validationReport, false, options)
  report.writtenCodeSubgraphPath = relativePath(root, outputPath)
  report.writtenValidationOutputPath = relativePath(root, validationOutputPath)
  if (options.markdown) {
    const markdownPath = resolveRepoPath(root, options.markdown)
    await writeTextAtomic(markdownPath, renderMarkdown(report))
    report.writtenMarkdownPath = relativePath(root, markdownPath)
  }
  return report
}

function validateRequiredOptions(options: NativeCodeSubgraphExtractorOptions): void {
  if (!options.targetRepo) {
    throw new Error('graph extract-code-subgraph requires --target-repo <path>.')
  }
  if (!options.output) {
    throw new Error('graph extract-code-subgraph requires --output <devview-code-subgraph.json>.')
  }
  if (!options.validationOutput) {
    throw new Error('graph extract-code-subgraph requires --validation-output <validation.json>.')
  }
}

function parseIncludePatterns(include: string[] | undefined): string[] {
  const values = (include && include.length > 0 ? include : ['**/*'])
    .flatMap((entry) => entry.split(','))
    .map((entry) => entry.trim())
    .filter(Boolean)
  return values.length > 0 ? [...new Set(values)] : ['**/*']
}

async function extractCodeSubgraph(targetRepoPath: string, includePatterns: string[]): Promise<ExtractionState> {
  const state: ExtractionState = {
    findings: [],
    nodes: [],
    edges: [],
    symbols: [],
    fileNodesByRelativePath: new Map(),
    externalNodeIdsBySpecifier: new Map(),
    seenNodeIds: new Set(),
    seenEdgeIds: new Set(),
    unsupportedExtensions: {},
    includePatterns,
    includedSourcePaths: [],
    supportedFileCount: 0,
    unsupportedFileCount: 0,
    skippedLargeFileCount: 0,
    scannedByteCount: 0,
    ambiguousCallNames: new Set(),
  }

  const invalidInclude = includePatterns
    .map((pattern) => ({ pattern, result: matchScopeCompliancePathPattern(pattern, 'placeholder.ts') }))
    .filter((entry) => !entry.result.patternValid)
  if (invalidInclude.length > 0) {
    state.findings.push(
      ...invalidInclude.map((entry) =>
        blocker(
          'NATIVE_CODE_SUBGRAPH_INCLUDE_PATTERN_INVALID',
          `Include pattern is invalid or unsupported: ${entry.pattern} (${entry.result.reason}).`,
          'include',
          targetRepoPath,
        ),
      ),
    )
    return state
  }

  const discovered = await discoverFiles(targetRepoPath, state, includePatterns)
  const supported = discovered.filter((entry) => supportedExtensions.has(path.extname(entry).toLowerCase()))
  if (supported.length === 0) {
    state.findings.push(
      blocker(
        'NATIVE_CODE_SUBGRAPH_NO_SUPPORTED_FILES',
        'No JavaScript or TypeScript source files were found for static code subgraph extraction.',
        'targetRepo',
        targetRepoPath,
      ),
    )
    return state
  }
  if (supported.length > maxSupportedFiles) {
    state.findings.push(
      blocker(
        'NATIVE_CODE_SUBGRAPH_FILE_LIMIT_EXCEEDED',
        `Static extraction supports up to ${maxSupportedFiles} JS/TS files in one report-only run; found ${supported.length}.`,
        'targetRepo',
        targetRepoPath,
      ),
    )
    return state
  }

  const sourceFiles: SourceFile[] = []
  for (const absolutePath of supported.sort()) {
    const bytes = await readFile(absolutePath)
    if (bytes.byteLength > maxFileBytes) {
      state.skippedLargeFileCount += 1
      state.findings.push(
        warning(
          'NATIVE_CODE_SUBGRAPH_LARGE_FILE_SKIPPED',
          `Skipped large JS/TS file over ${maxFileBytes} bytes: ${relativePath(targetRepoPath, absolutePath)}.`,
          undefined,
          relativePath(targetRepoPath, absolutePath),
        ),
      )
      continue
    }
    const content = bytes.toString('utf8').replace(/^\uFEFF/, '')
    const relative = relativePath(targetRepoPath, absolutePath)
    sourceFiles.push({
      relativePath: relative,
      absolutePath,
      content,
      digest: `sha256:${createHash('sha256').update(bytes).digest('hex')}`,
      byteLength: bytes.byteLength,
      lineStarts: lineStarts(content),
    })
    state.includedSourcePaths.push(absolutePath)
    state.scannedByteCount += bytes.byteLength
  }

  for (const sourceFile of sourceFiles) {
    addFileNode(state, sourceFile)
  }
  for (const sourceFile of sourceFiles) {
    extractImports(state, targetRepoPath, sourceFile)
    extractSymbols(state, sourceFile)
  }
  addCallEdges(state)

  if (Object.keys(state.unsupportedExtensions).length > 0) {
    state.findings.push(
      warning(
        'NATIVE_CODE_SUBGRAPH_UNSUPPORTED_EXTENSIONS',
        `Unsupported file extensions were observed but not parsed: ${formatCounts(state.unsupportedExtensions)}.`,
        'targetRepo',
        targetRepoPath,
      ),
    )
  }
  if (state.ambiguousCallNames.size > 0) {
    state.findings.push(
      warning(
        'NATIVE_CODE_SUBGRAPH_AMBIGUOUS_CALLS_SKIPPED',
        `Skipped call edges for ambiguous callee names: ${[...state.ambiguousCallNames].sort().join(', ')}.`,
        'calls',
        targetRepoPath,
      ),
    )
  }
  if (state.findings.every((finding) => finding.severity !== 'blocker')) {
    state.findings.push({
      severity: 'satisfied',
      code: 'NATIVE_CODE_SUBGRAPH_EXTRACTED',
      message: 'JavaScript/TypeScript files were statically extracted into a DevView code subgraph source fact.',
      path: targetRepoPath,
    })
  }
  return state
}

async function discoverFiles(
  targetRepoPath: string,
  state: ExtractionState,
  includePatterns: string[],
): Promise<string[]> {
  const files: string[] = []
  async function visit(dirPath: string): Promise<void> {
    let entries
    try {
      entries = await readdir(dirPath, { withFileTypes: true })
    } catch (error) {
      state.findings.push(
        blocker(
          'NATIVE_CODE_SUBGRAPH_TARGET_READ_FAILED',
          error instanceof Error ? error.message : String(error),
          'targetRepo',
          dirPath,
        ),
      )
      return
    }
    for (const entry of entries) {
      const absolute = path.join(dirPath, entry.name)
      if (entry.isDirectory()) {
        if (!skippedDirectories.has(entry.name)) {
          await visit(absolute)
        }
        continue
      }
      if (!entry.isFile()) continue
      const relative = relativePath(targetRepoPath, absolute)
      if (!matchesInclude(relative, includePatterns)) continue
      const ext = path.extname(entry.name).toLowerCase()
      if (supportedExtensions.has(ext)) {
        files.push(absolute)
        state.supportedFileCount += 1
      } else {
        state.unsupportedFileCount += 1
        const key = ext || '[no-extension]'
        state.unsupportedExtensions[key] = (state.unsupportedExtensions[key] ?? 0) + 1
      }
    }
  }
  await visit(targetRepoPath)
  return files
}

function addFileNode(state: ExtractionState, sourceFile: SourceFile): void {
  const id = uniqueNodeId(state, `code.file.${sanitizeId(sourceFile.relativePath)}`)
  state.fileNodesByRelativePath.set(normalizePath(sourceFile.relativePath), id)
  state.nodes.push({
    id,
    kind: 'file',
    label: sourceFile.relativePath,
    sourceFile: sourceFile.relativePath,
    sourceLocationStatus: 'file-node',
    sourceDigest: sourceFile.digest,
    confidence: 'extracted',
    extractor: EXTRACTOR_ID,
  })
}

function extractImports(state: ExtractionState, targetRepoPath: string, sourceFile: SourceFile): void {
  const fileNodeId = state.fileNodesByRelativePath.get(normalizePath(sourceFile.relativePath))
  if (!fileNodeId) return
  const importRegex =
    /\b(?:import\s+(?:[^'"]+?\s+from\s+)?|export\s+[^'"]+?\s+from\s+|require\s*\(\s*|import\s*\(\s*)['"]([^'"]+)['"]/g
  for (const match of sourceFile.content.matchAll(importRegex)) {
    const specifier = match[1]
    if (!specifier) continue
    const targetFile = resolveLocalImport(
      targetRepoPath,
      sourceFile.relativePath,
      specifier,
      state.fileNodesByRelativePath,
    )
    const targetNodeId = targetFile ? state.fileNodesByRelativePath.get(normalizePath(targetFile)) : null
    const to = targetNodeId ?? externalDependencyNode(state, sourceFile, specifier)
    addEdge(state, {
      from: fileNodeId,
      to,
      kind: 'imports',
      sourceFile: sourceFile.relativePath,
      sourceDigest: sourceFile.digest,
      sourceLocation: locationAt(sourceFile, match.index ?? 0),
      confidence: targetNodeId ? 'extracted' : 'inferred',
    })
  }
}

function extractSymbols(state: ExtractionState, sourceFile: SourceFile): void {
  const fileNodeId = state.fileNodesByRelativePath.get(normalizePath(sourceFile.relativePath))
  if (!fileNodeId) return

  const classRegex = /\b(?:export\s+)?(?:abstract\s+)?class\s+([A-Za-z_$][\w$]*)([^{]*)\{/g
  for (const match of sourceFile.content.matchAll(classRegex)) {
    const name = match[1]
    const braceIndex = (match.index ?? 0) + match[0].lastIndexOf('{')
    const endIndex = findMatchingBrace(sourceFile.content, braceIndex)
    const classId = uniqueNodeId(state, `code.class.${sanitizeId(sourceFile.relativePath)}.${sanitizeId(name)}`)
    state.nodes.push(symbolNode(classId, 'class', name, sourceFile, braceIndex, endIndex))
    state.symbols.push({
      id: classId,
      name,
      kind: 'class',
      sourceFile: sourceFile.relativePath,
      bodyText: endIndex > braceIndex ? sourceFile.content.slice(braceIndex + 1, endIndex) : '',
      bodyStartIndex: braceIndex + 1,
    })
    addEdge(state, {
      from: fileNodeId,
      to: classId,
      kind: 'contains',
      sourceFile: sourceFile.relativePath,
      sourceDigest: sourceFile.digest,
      sourceLocation: locationAt(sourceFile, match.index ?? 0),
      confidence: 'extracted',
    })
    extractMethods(state, sourceFile, classId, name, braceIndex + 1, endIndex)
  }

  const functionRegex = /\b(?:export\s+)?(?:async\s+)?function\s+([A-Za-z_$][\w$]*)\s*\([^)]*\)\s*\{/g
  for (const match of sourceFile.content.matchAll(functionRegex)) {
    const name = match[1]
    const braceIndex = (match.index ?? 0) + match[0].lastIndexOf('{')
    addFunctionSymbol(state, sourceFile, fileNodeId, name, match.index ?? 0, braceIndex)
  }

  const arrowRegex =
    /\b(?:export\s+)?(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?(?:\([^)]*\)|[A-Za-z_$][\w$]*)\s*=>\s*\{/g
  for (const match of sourceFile.content.matchAll(arrowRegex)) {
    const name = match[1]
    const braceIndex = (match.index ?? 0) + match[0].lastIndexOf('{')
    addFunctionSymbol(state, sourceFile, fileNodeId, name, match.index ?? 0, braceIndex)
  }
}

function extractMethods(
  state: ExtractionState,
  sourceFile: SourceFile,
  classId: string,
  className: string,
  classBodyStart: number,
  classBodyEnd: number,
): void {
  if (classBodyEnd <= classBodyStart) return
  const body = sourceFile.content.slice(classBodyStart, classBodyEnd)
  const methodRegex =
    /(?:^|\n)\s*(?:(?:public|private|protected|static|async|get|set|override|readonly)\s+)*([A-Za-z_$][\w$]*)\s*\([^)]*\)\s*\{/g
  for (const match of body.matchAll(methodRegex)) {
    const name = match[1]
    if (methodKeywordExclusions.has(name)) continue
    const globalMatchIndex = classBodyStart + (match.index ?? 0)
    const braceIndex = globalMatchIndex + match[0].lastIndexOf('{')
    const endIndex = findMatchingBrace(sourceFile.content, braceIndex)
    const methodId = uniqueNodeId(
      state,
      `code.method.${sanitizeId(sourceFile.relativePath)}.${sanitizeId(className)}.${sanitizeId(name)}`,
    )
    state.nodes.push(symbolNode(methodId, 'method', `${className}.${name}`, sourceFile, braceIndex, endIndex))
    state.symbols.push({
      id: methodId,
      name,
      kind: 'method',
      sourceFile: sourceFile.relativePath,
      bodyText: endIndex > braceIndex ? sourceFile.content.slice(braceIndex + 1, endIndex) : '',
      bodyStartIndex: braceIndex + 1,
    })
    addEdge(state, {
      from: classId,
      to: methodId,
      kind: 'contains',
      sourceFile: sourceFile.relativePath,
      sourceDigest: sourceFile.digest,
      sourceLocation: locationAt(sourceFile, globalMatchIndex),
      confidence: 'extracted',
    })
  }
}

function addFunctionSymbol(
  state: ExtractionState,
  sourceFile: SourceFile,
  fileNodeId: string,
  name: string,
  matchIndex: number,
  braceIndex: number,
): void {
  const endIndex = findMatchingBrace(sourceFile.content, braceIndex)
  const functionId = uniqueNodeId(state, `code.function.${sanitizeId(sourceFile.relativePath)}.${sanitizeId(name)}`)
  state.nodes.push(symbolNode(functionId, 'function', name, sourceFile, braceIndex, endIndex))
  state.symbols.push({
    id: functionId,
    name,
    kind: 'function',
    sourceFile: sourceFile.relativePath,
    bodyText: endIndex > braceIndex ? sourceFile.content.slice(braceIndex + 1, endIndex) : '',
    bodyStartIndex: braceIndex + 1,
  })
  addEdge(state, {
    from: fileNodeId,
    to: functionId,
    kind: 'contains',
    sourceFile: sourceFile.relativePath,
    sourceDigest: sourceFile.digest,
    sourceLocation: locationAt(sourceFile, matchIndex),
    confidence: 'extracted',
  })
}

function addCallEdges(state: ExtractionState): void {
  const symbolsByName = new Map<string, SymbolRecord[]>()
  for (const symbol of state.symbols) {
    const key = normalizeToken(symbol.name)
    symbolsByName.set(key, [...(symbolsByName.get(key) ?? []), symbol])
  }

  for (const symbol of state.symbols.filter((entry) => entry.kind !== 'class')) {
    const callRegex = /\b([A-Za-z_$][\w$]*)\s*\(/g
    for (const match of symbol.bodyText.matchAll(callRegex)) {
      const callName = match[1]
      if (callKeywordExclusions.has(callName)) continue
      const targets = symbolsByName.get(normalizeToken(callName)) ?? []
      const nonSelfTargets = targets.filter((target) => target.id !== symbol.id)
      if (nonSelfTargets.length > 1) {
        state.ambiguousCallNames.add(callName)
        continue
      }
      const target = nonSelfTargets[0]
      if (target) {
        addEdge(state, {
          from: symbol.id,
          to: target.id,
          kind: 'calls',
          sourceFile: symbol.sourceFile,
          sourceLocationStatus: 'call-site-static-text-scan',
          confidence: 'inferred',
        })
      }
    }
  }
}

function symbolNode(
  id: string,
  kind: 'class' | 'function' | 'method',
  label: string,
  sourceFile: SourceFile,
  startIndex: number,
  endIndex: number,
): JsonRecord {
  return {
    id,
    kind,
    label,
    sourceFile: sourceFile.relativePath,
    sourceLocation: locationRange(sourceFile, startIndex, endIndex > startIndex ? endIndex : startIndex),
    sourceDigest: sourceFile.digest,
    confidence: 'extracted',
    extractor: EXTRACTOR_ID,
  }
}

function externalDependencyNode(state: ExtractionState, sourceFile: SourceFile, specifier: string): string {
  const existing = state.externalNodeIdsBySpecifier.get(specifier)
  if (existing) return existing
  const id = uniqueNodeId(state, `code.external.${sanitizeId(specifier)}`)
  state.externalNodeIdsBySpecifier.set(specifier, id)
  state.nodes.push({
    id,
    kind: 'external_dependency',
    label: specifier,
    sourceFile: sourceFile.relativePath,
    sourceLocationStatus: 'external-import-specifier',
    sourceDigest: sourceFile.digest,
    confidence: 'inferred',
    extractor: EXTRACTOR_ID,
  })
  return id
}

function addEdge(
  state: ExtractionState,
  input: {
    from: string
    to: string
    kind: string
    sourceFile: string
    sourceDigest?: string
    sourceLocation?: JsonRecord
    sourceLocationStatus?: string
    confidence: string
  },
): void {
  const id = uniqueEdgeId(state, `code-edge.${sanitizeId(input.from)}.${input.kind}.${sanitizeId(input.to)}`)
  state.edges.push({
    id,
    from: input.from,
    to: input.to,
    kind: input.kind,
    sourceFile: input.sourceFile,
    ...(input.sourceLocation ? { sourceLocation: input.sourceLocation } : {}),
    ...(!input.sourceLocation ? { sourceLocationStatus: input.sourceLocationStatus ?? 'native-static-text-scan' } : {}),
    ...(input.sourceDigest ? { sourceDigest: input.sourceDigest } : {}),
    confidence: input.confidence,
    extractor: EXTRACTOR_ID,
  })
}

function buildCodeSubgraph(root: string, targetRepoPath: string, state: ExtractionState): JsonRecord {
  return {
    schemaVersion: 1,
    artifactRole: CODE_SUBGRAPH_ROLE,
    status: CODE_SUBGRAPH_STATUS,
    scope: CODE_SUBGRAPH_SCOPE,
    importSource: EXTRACTOR_ID,
    extractionSource: {
      targetRepoPath: relativePath(root, targetRepoPath),
      supportedExtensions: [...supportedExtensions].sort(),
      skippedDirectories: [...skippedDirectories].sort(),
      includePatterns: state.includePatterns,
    },
    nodes: state.nodes,
    edges: state.edges,
    graphifyExecuted: false,
    astExtractorExecuted: false,
    providerInvoked: false,
    networkCallMade: false,
    apiCallMade: false,
    shellCommandsExecuted: false,
    extensionExecutionAllowed: false,
    graphSourceMutated: false,
    graphDeltaApplied: false,
    viewTreeGenerated: false,
    contextPackGenerated: false,
    runtimeEvidenceSatisfied: false,
    evidenceAccepted: false,
    equivalenceProven: false,
    scopeEnforced: false,
    ciEnforcementEnabled: false,
    rbacEnforced: false,
    permissionVerified: false,
    cryptographicSignatureVerified: false,
    enterpriseGateActivated: false,
  }
}

function buildReport(
  root: string,
  targetRepoPath: string,
  state: ExtractionState,
  validationReport: CodeSubgraphValidationReport | null,
  blocked: boolean,
  options: NativeCodeSubgraphExtractorOptions,
): NativeCodeSubgraphExtractionReport {
  return {
    schemaVersion: 1,
    artifactRole: REPORT_ROLE,
    status: blocked ? BLOCKED_STATUS : PASSED_STATUS,
    extractionScope: REPORT_SCOPE,
    sourceFactsOnly: true,
    reportOnly: true,
    extractionMode: EXTRACTOR_ID,
    targetRepo: {
      path: relativePath(root, targetRepoPath),
      supportedFileCount: state.supportedFileCount,
      unsupportedFileCount: state.unsupportedFileCount,
      skippedLargeFileCount: state.skippedLargeFileCount,
      scannedByteCount: state.scannedByteCount,
    },
    outputCodeSubgraph: {
      path: options.output ? relativePath(root, resolveRepoPath(root, options.output)) : '',
      artifactRole: CODE_SUBGRAPH_ROLE,
      status: CODE_SUBGRAPH_STATUS,
      scope: CODE_SUBGRAPH_SCOPE,
      nodeCount: state.nodes.length,
      edgeCount: state.edges.length,
    },
    validationOutput: {
      path: options.validationOutput ? relativePath(root, resolveRepoPath(root, options.validationOutput)) : '',
      status: validationReport?.status ?? null,
      codeSubgraphValidationStatus: validationReport?.codeSubgraphValidationStatus ?? null,
    },
    extractionSummary: {
      fileNodeCount: state.nodes.filter((entry) => entry.kind === 'file').length,
      classNodeCount: state.nodes.filter((entry) => entry.kind === 'class').length,
      functionNodeCount: state.nodes.filter((entry) => entry.kind === 'function').length,
      methodNodeCount: state.nodes.filter((entry) => entry.kind === 'method').length,
      externalDependencyNodeCount: state.nodes.filter((entry) => entry.kind === 'external_dependency').length,
      importEdgeCount: state.edges.filter((entry) => entry.kind === 'imports').length,
      callEdgeCount: state.edges.filter((entry) => entry.kind === 'calls').length,
      containsEdgeCount: state.edges.filter((entry) => entry.kind === 'contains').length,
      unsupportedExtensions: state.unsupportedExtensions,
      includePatterns: state.includePatterns,
      ambiguousCallCount: state.ambiguousCallNames.size,
      ambiguousCallNames: [...state.ambiguousCallNames].sort(),
    },
    extractionFindings: state.findings,
    downstreamActionPlan: blocked
      ? ['Fix blocking target-repo, source file limit, output authority, or generated validation findings, then rerun.']
      : [
          'Use the written devview-code-subgraph artifact and validation report as source facts for a future unified Maintainability Graph merge plan.',
          'Unsupported language extraction, richer TypeScript type references, and watch activation remain future report-only slices.',
        ],
    graphifyExecuted: false,
    astExtractorExecuted: false,
    providerInvoked: false,
    networkCallMade: false,
    apiCallMade: false,
    shellCommandsExecuted: false,
    extensionExecutionAllowed: false,
    graphSourceMutated: false,
    graphDeltaApplied: false,
    viewTreeGenerated: false,
    contextPackGenerated: false,
    runtimeEvidenceSatisfied: false,
    evidenceAccepted: false,
    equivalenceProven: false,
    scopeEnforced: false,
    ciEnforcementEnabled: false,
    rbacEnforced: false,
    permissionVerified: false,
    cryptographicSignatureVerified: false,
    enterpriseGateActivated: false,
  }
}

async function assertOutputAuthority(
  root: string,
  targetRepoPath: string,
  includedSourcePaths: string[],
  options: NativeCodeSubgraphExtractorOptions,
): Promise<void> {
  const outputPath = resolveRepoPath(root, options.output ?? '')
  const validationOutputPath = resolveRepoPath(root, options.validationOutput ?? '')
  const markdownPath = options.markdown ? resolveRepoPath(root, options.markdown) : null
  const outputs = [
    { kind: 'code subgraph output', path: outputPath },
    { kind: 'validation output', path: validationOutputPath },
    ...(markdownPath ? [{ kind: 'markdown output', path: markdownPath }] : []),
  ]
  const seenOutputs = new Set<string>()
  for (const output of outputs) {
    const key = pathKey(output.path)
    if (seenOutputs.has(key)) {
      throw new Error('Native code subgraph extraction outputs must be different paths.')
    }
    seenOutputs.add(key)
  }

  const includedSourceSet = new Set(includedSourcePaths.map(pathKey))
  for (const output of outputs) {
    const relativeTarget = relativePath(root, output.path)
    if (pathKey(output.path) === pathKey(targetRepoPath)) {
      throw new Error(`Native code subgraph extraction ${output.kind} would overwrite the target repo path.`)
    }
    if (includedSourceSet.has(pathKey(output.path))) {
      throw new Error(`Native code subgraph extraction ${output.kind} would overwrite an included source file.`)
    }
    if (isProtectedControlPath(root, output.path)) {
      throw new Error(
        `Native code subgraph extraction ${output.kind} is inside a protected control path: ${relativeTarget}.`,
      )
    }
    const existingAuthority = await classifyExistingSourceAuthority(output.path)
    if (existingAuthority) {
      throw new Error(
        `Native code subgraph extraction ${output.kind} would overwrite a source-authority-shaped path: ${relativeTarget}.`,
      )
    }
    if (isSourceAuthorityShapedPath(relativeTarget)) {
      throw new Error(
        `Native code subgraph extraction ${output.kind} would overwrite a source-authority-shaped path: ${relativeTarget}.`,
      )
    }
  }
}

async function classifyExistingSourceAuthority(filePath: string): Promise<string | null> {
  try {
    const bytes = await readFile(filePath)
    const parsed = JSON.parse(bytes.toString('utf8').replace(/^\uFEFF/, '')) as JsonRecord
    const role = stringValue(parsed.artifactRole)
    if (
      role?.includes('graph-source') ||
      role === CODE_SUBGRAPH_ROLE ||
      role === REPORT_ROLE ||
      role === 'devview-code-subgraph-validation-report'
    ) {
      return `artifactRole ${role}`
    }
    if (asRecord(parsed.sourceRecords)) {
      return 'source-authority-shaped sourceRecords'
    }
    if (Array.isArray(parsed.nodes) && Array.isArray(parsed.edges)) {
      return 'node-edge graph-shaped artifact'
    }
  } catch {
    return null
  }
  return null
}

function renderMarkdown(report: NativeCodeSubgraphExtractionReport): string {
  return [
    '# Native Code Subgraph Extraction',
    '',
    `Status: ${report.status}`,
    `Target repo: \`${report.targetRepo.path}\``,
    `Code subgraph: \`${report.writtenCodeSubgraphPath ?? report.outputCodeSubgraph.path}\``,
    `Validation output: \`${report.writtenValidationOutputPath ?? report.validationOutput.path}\``,
    '',
    '## Summary',
    '',
    `- Supported JS/TS files: ${report.targetRepo.supportedFileCount}`,
    `- Nodes: ${report.outputCodeSubgraph.nodeCount}`,
    `- Edges: ${report.outputCodeSubgraph.edgeCount}`,
    `- Files/classes/functions/methods: ${report.extractionSummary.fileNodeCount}/${report.extractionSummary.classNodeCount}/${report.extractionSummary.functionNodeCount}/${report.extractionSummary.methodNodeCount}`,
    `- Imports/calls/contains: ${report.extractionSummary.importEdgeCount}/${report.extractionSummary.callEdgeCount}/${report.extractionSummary.containsEdgeCount}`,
    `- Validation: ${report.validationOutput.codeSubgraphValidationStatus ?? 'not-run'}`,
    '',
    '## Findings',
    '',
    ...report.extractionFindings.map((finding) => `- ${finding.severity}: ${finding.code} - ${finding.message}`),
    '',
    '## Boundary',
    '',
    '- Graphify executed: false',
    '- AST extractor executed: false',
    '- Provider/API/network called: false',
    '- Shell/project code executed: false',
    '- Graph source mutated: false',
    '- View Tree generated: false',
    '- Evidence accepted: false',
    '- RBAC enforced: false',
  ].join('\n')
}

function resolveLocalImport(
  targetRepoPath: string,
  fromRelativePath: string,
  specifier: string,
  fileNodesByRelativePath: Map<string, string>,
): string | null {
  if (!specifier.startsWith('.')) return null
  const fromDir = path.dirname(path.join(targetRepoPath, fromRelativePath))
  const baseAbsolute = path.resolve(fromDir, specifier)
  const candidates = [
    baseAbsolute,
    ...[...supportedExtensions].map((ext) => `${baseAbsolute}${ext}`),
    ...[...supportedExtensions].map((ext) => path.join(baseAbsolute, `index${ext}`)),
  ]
  for (const candidate of candidates) {
    const relative = relativePath(targetRepoPath, candidate)
    if (fileNodesByRelativePath.has(normalizePath(relative))) {
      return relative
    }
  }
  return null
}

function matchesInclude(relativeFilePath: string, includePatterns: string[]): boolean {
  return includePatterns.some((pattern) => matchScopeCompliancePathPattern(pattern, relativeFilePath).matched)
}

function findMatchingBrace(text: string, openBraceIndex: number): number {
  let depth = 0
  for (let index = openBraceIndex; index < text.length; index += 1) {
    const char = text[index]
    if (char === '{') depth += 1
    if (char === '}') {
      depth -= 1
      if (depth === 0) return index
    }
  }
  return openBraceIndex
}

function lineStarts(text: string): number[] {
  const starts = [0]
  for (let index = 0; index < text.length; index += 1) {
    if (text[index] === '\n') starts.push(index + 1)
  }
  return starts
}

function locationAt(sourceFile: SourceFile, index: number): JsonRecord {
  const line = lineColumnAt(sourceFile.lineStarts, index)
  return {
    startLine: line.line,
    startColumn: line.column,
    endLine: line.line,
    endColumn: line.column + 1,
  }
}

function locationRange(sourceFile: SourceFile, startIndex: number, endIndex: number): JsonRecord {
  const start = lineColumnAt(sourceFile.lineStarts, startIndex)
  const end = lineColumnAt(sourceFile.lineStarts, endIndex)
  return {
    startLine: start.line,
    startColumn: start.column,
    endLine: end.line,
    endColumn: end.column,
  }
}

function lineColumnAt(starts: number[], index: number): { line: number; column: number } {
  let low = 0
  let high = starts.length - 1
  while (low <= high) {
    const mid = Math.floor((low + high) / 2)
    if (starts[mid] <= index) low = mid + 1
    else high = mid - 1
  }
  const lineIndex = Math.max(0, high)
  return { line: lineIndex + 1, column: index - starts[lineIndex] + 1 }
}

function blocker(
  code: string,
  message: string,
  field?: string,
  pathValue?: string,
): NativeCodeSubgraphExtractionFinding {
  return { severity: 'blocker', code, message, field, path: pathValue }
}

function warning(
  code: string,
  message: string,
  field?: string,
  pathValue?: string,
): NativeCodeSubgraphExtractionFinding {
  return { severity: 'warning', code, message, field, path: pathValue }
}

function uniqueNodeId(state: ExtractionState, base: string): string {
  return uniqueId(base, state.seenNodeIds)
}

function uniqueEdgeId(state: ExtractionState, base: string): string {
  return uniqueId(base, state.seenEdgeIds)
}

function uniqueId(base: string, seen: Set<string>): string {
  let candidate = base
  let suffix = 2
  while (seen.has(normalizeToken(candidate))) {
    candidate = `${base}.${suffix}`
    suffix += 1
  }
  seen.add(normalizeToken(candidate))
  return candidate
}

function formatCounts(counts: Record<string, number>): string {
  const entries = Object.entries(counts).sort(([left], [right]) => left.localeCompare(right))
  return entries.length === 0 ? 'none' : entries.map(([kind, count]) => `${kind}:${count}`).join(', ')
}

function asRecord(value: unknown): JsonRecord | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as JsonRecord) : null
}

function stringValue(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null
}

function sanitizeId(value: string): string {
  return (
    normalizePath(value)
      .replace(/[^a-z0-9]+/g, '.')
      .replace(/^\.+|\.+$/g, '') || 'unknown'
  )
}

function normalizePath(value: string): string {
  return value.replace(/\\/g, '/').toLowerCase()
}

function normalizeToken(value: string): string {
  return normalizePath(value)
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
}

function resolveRepoPath(root: string, filePath: string): string {
  return path.isAbsolute(filePath) ? filePath : path.join(root, filePath)
}

function pathKey(filePath: string): string {
  return path.resolve(filePath).replaceAll('\\', '/').toLowerCase()
}

function isSourceAuthorityShapedPath(filePath: string): boolean {
  const normalized = normalizePath(filePath)
  return (
    normalized.includes('/graph-source') ||
    normalized.includes('/source-authority') ||
    normalized.includes('/read-model') ||
    normalized.endsWith('maintainability-graph.json')
  )
}

function isProtectedControlPath(root: string, filePath: string): boolean {
  const relative = relativePath(root, filePath)
  return (
    hasDevViewControlDirectory(relative) ||
    hasCodexControlDirectory(relative) ||
    hasHiddenControlDirectorySegment(relative)
  )
}
