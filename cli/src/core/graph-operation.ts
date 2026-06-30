import { spawn } from 'node:child_process'
import path from 'node:path'
import { relativePath, readJsonSafe, writeJsonAtomic, writeTextAtomic } from './fs.js'

type JsonObject = Record<string, any>

interface GraphUpdateProposal extends JsonObject {
  artifactRole: string
  status: string
  graphDeltaPath: string
  sourceRecordId: string
  proposedRecordState?: {
    status?: string
    activeCodeState?: string
  }
  proposedNodeUpdates?: Array<{
    id: string
    currentState?: string
    proposedState?: string
    intentClaim?: string
  }>
  changedFiles?: Array<{
    path: string
    additions?: string | number
    deletions?: string | number
  }>
  boundaries?: {
    mutatesGraphSource?: boolean
    appliesPatch?: boolean
    requiresReviewBeforeApply?: boolean
    maintainerIntentClaimed?: boolean
  }
}

interface GraphDelta extends JsonObject {
  artifactRole: string
  status: string
  graphSourcePath: string
  sourceRecordId: string
}

interface GraphSource extends JsonObject {
  records?: Array<{
    id: string
    path: string
    expectedStatus?: string
    expectedActiveCodeState?: string
  }>
  nodes?: Array<{
    id: string
    state?: string
    intentClaim?: string
  }>
}

export interface GraphOperationApplyProposalOptions {
  apply?: boolean
  output?: string
  markdown?: string
}

export interface GraphOperationApplyProposalResult {
  status: 'graph-update-proposal-preview-pass' | 'graph-update-proposal-apply-pass'
  applied: boolean
  proposalPath: string
  graphDeltaPath: string
  graphSourcePath: string
  sourceRecordId: string
  changedFiles: Array<{ path: string; additions?: string | number; deletions?: string | number }>
  plannedChanges: Array<{
    target: 'node' | 'record'
    id: string
    field: string
    before: string | undefined
    after: string | undefined
  }>
  changeCount: number
  outputPath?: string
  markdownPath?: string
  boundaries: {
    mutatesGraphSource: false
    appliesPatch: false
    maintainerIntentClaimed: false
    requiresReviewBeforeApply: true
    graphSourceWritten: boolean
  }
}

export type GraphOperationChainCommand =
  | 'operation-chain'
  | 'artifact-inventory'
  | 'core-schemas'
  | 'retrofit-smoke'
  | 'evaluate-dogfood'

export interface GraphOperationRunChainOptions {
  command?: string
  dryRun?: boolean
  output?: string
}

export interface GraphOperationRunChainResult {
  status: 'pbe-operation-chain-plan-pass' | 'pbe-operation-chain-pass' | 'pbe-dogfood-evaluation-pass'
  chainCommand: GraphOperationChainCommand
  dryRun: boolean
  scriptPath: string
  shell: string
  args: string[]
  cwd: string
  stdout?: string
  stderr?: string
  outputPath?: string
  boundaries: {
    wrapsExistingScript: true
    mutatesSourceCode: false
    appliesGraphProposal: false
    enablesEnforcement: false
    retiresTreeArtifacts: false
  }
}

export async function applyGraphUpdateProposal(
  root: string,
  proposalPath: string,
  options: GraphOperationApplyProposalOptions = {},
): Promise<GraphOperationApplyProposalResult> {
  const resolvedProposalPath = resolveRepoPath(root, proposalPath)
  const proposal = await loadJson<GraphUpdateProposal>(resolvedProposalPath)
  validateProposal(proposal, proposalPath)

  const resolvedDeltaPath = resolveRepoPath(root, proposal.graphDeltaPath)
  const delta = await loadJson<GraphDelta>(resolvedDeltaPath)
  validateDelta(delta, proposal)

  const resolvedGraphSourcePath = resolveRepoPath(root, delta.graphSourcePath)
  const graphSource = await loadJson<GraphSource>(resolvedGraphSourcePath)
  validateGraphSource(graphSource, delta.graphSourcePath)

  const plannedChanges = buildPlannedChanges(graphSource, proposal)
  const applied = Boolean(options.apply)

  if (applied && plannedChanges.length > 0) {
    applyPlannedChanges(graphSource, plannedChanges)
    await writeJsonAtomic(resolvedGraphSourcePath, graphSource)
  }

  const result: GraphOperationApplyProposalResult = {
    status: applied ? 'graph-update-proposal-apply-pass' : 'graph-update-proposal-preview-pass',
    applied,
    proposalPath: relativePath(root, resolvedProposalPath),
    graphDeltaPath: relativePath(root, resolvedDeltaPath),
    graphSourcePath: relativePath(root, resolvedGraphSourcePath),
    sourceRecordId: proposal.sourceRecordId,
    changedFiles: proposal.changedFiles || [],
    plannedChanges,
    changeCount: plannedChanges.length,
    boundaries: {
      mutatesGraphSource: false,
      appliesPatch: false,
      maintainerIntentClaimed: false,
      requiresReviewBeforeApply: true,
      graphSourceWritten: applied && plannedChanges.length > 0,
    },
  }

  if (options.output) {
    const outputPath = resolveRepoPath(root, options.output)
    await writeJsonAtomic(outputPath, result)
    result.outputPath = relativePath(root, outputPath)
  }

  if (options.markdown) {
    const markdownPath = resolveRepoPath(root, options.markdown)
    await writeTextAtomic(markdownPath, renderGraphOperationProposalMarkdown(result))
    result.markdownPath = relativePath(root, markdownPath)
  }

  return result
}

export async function runGraphOperationChain(
  root: string,
  pluginRoot: string,
  options: GraphOperationRunChainOptions = {},
): Promise<GraphOperationRunChainResult> {
  const command = normalizeChainCommand(options.command)
  const scriptPath = path.join(pluginRoot, 'scripts', 'invoke-pbe-v0.ps1')
  const shell = process.platform === 'win32' ? 'powershell' : 'pwsh'
  const args =
    process.platform === 'win32'
      ? ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', scriptPath, '-Command', command]
      : ['-NoProfile', '-File', scriptPath, '-Command', command]

  const baseResult: GraphOperationRunChainResult = {
    status: options.dryRun ? 'pbe-operation-chain-plan-pass' : chainStatusFor(command),
    chainCommand: command,
    dryRun: Boolean(options.dryRun),
    scriptPath: relativePath(root, scriptPath),
    shell,
    args,
    cwd: relativePath(root, pluginRoot) || '.',
    boundaries: {
      wrapsExistingScript: true,
      mutatesSourceCode: false,
      appliesGraphProposal: false,
      enablesEnforcement: false,
      retiresTreeArtifacts: false,
    },
  }

  if (!options.dryRun) {
    const execution = await runProcess(shell, args, pluginRoot)
    baseResult.stdout = execution.stdout
    baseResult.stderr = execution.stderr
  }

  if (options.output) {
    const outputPath = resolveRepoPath(root, options.output)
    await writeJsonAtomic(outputPath, baseResult)
    baseResult.outputPath = relativePath(root, outputPath)
  }

  return baseResult
}

function resolveRepoPath(root: string, filePath: string): string {
  return path.isAbsolute(filePath) ? filePath : path.join(root, filePath)
}

function normalizeChainCommand(value?: string): GraphOperationChainCommand {
  const command = value || 'operation-chain'
  const allowed: GraphOperationChainCommand[] = [
    'operation-chain',
    'artifact-inventory',
    'core-schemas',
    'retrofit-smoke',
    'evaluate-dogfood',
  ]
  if (!allowed.includes(command as GraphOperationChainCommand)) {
    throw new Error(`Unsupported graph operation chain command: ${command}. Allowed: ${allowed.join(', ')}`)
  }
  return command as GraphOperationChainCommand
}

function chainStatusFor(
  command: GraphOperationChainCommand,
): 'pbe-operation-chain-pass' | 'pbe-dogfood-evaluation-pass' {
  if (command === 'evaluate-dogfood') {
    return 'pbe-dogfood-evaluation-pass'
  }
  return 'pbe-operation-chain-pass'
}

function runProcess(command: string, args: string[], cwd: string): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd, windowsHide: true })
    let stdout = ''
    let stderr = ''

    child.stdout.on('data', (chunk) => {
      stdout += String(chunk)
    })
    child.stderr.on('data', (chunk) => {
      stderr += String(chunk)
    })
    child.on('error', (error) => {
      reject(new Error(`Could not start ${command}: ${error.message}`))
    })
    child.on('close', (code) => {
      if (code === 0) {
        resolve({ stdout, stderr })
      } else {
        reject(new Error(`${command} exited with code ${code}.\n${stderr || stdout}`.trim()))
      }
    })
  })
}

async function loadJson<T>(filePath: string): Promise<T> {
  const result = await readJsonSafe<T>(filePath)
  if (!result.ok) {
    throw new Error(`Could not read JSON: ${filePath}: ${result.error}`)
  }
  return result.value
}

function validateProposal(proposal: GraphUpdateProposal, proposalPath: string): void {
  if (proposal.artifactRole !== 'pbe-graph-update-proposal-v0') {
    throw new Error(`Proposal has unexpected artifactRole in ${proposalPath}: ${proposal.artifactRole}`)
  }
  if (proposal.status !== 'generated-from-graph-delta') {
    throw new Error(`Proposal has unexpected status in ${proposalPath}: ${proposal.status}`)
  }
  if (!proposal.graphDeltaPath) {
    throw new Error(`Proposal is missing graphDeltaPath: ${proposalPath}`)
  }
  if (!proposal.sourceRecordId) {
    throw new Error(`Proposal is missing sourceRecordId: ${proposalPath}`)
  }
  if (proposal.boundaries?.mutatesGraphSource !== false) {
    throw new Error('Proposal must declare boundaries.mutatesGraphSource=false before it can be applied.')
  }
  if (proposal.boundaries?.appliesPatch !== false) {
    throw new Error('Proposal must declare boundaries.appliesPatch=false before it can be applied.')
  }
  if (proposal.boundaries?.maintainerIntentClaimed !== false) {
    throw new Error('Proposal must declare boundaries.maintainerIntentClaimed=false before it can be applied.')
  }
}

function validateDelta(delta: GraphDelta, proposal: GraphUpdateProposal): void {
  if (!['retrofit-graph-delta-v0', 'native-graph-delta-v0'].includes(delta.artifactRole)) {
    throw new Error(`Graph delta has unexpected artifactRole: ${delta.artifactRole}`)
  }
  if (delta.status !== 'generated-from-target-diff') {
    throw new Error(`Graph delta has unexpected status: ${delta.status}`)
  }
  if (!delta.graphSourcePath) {
    throw new Error('Graph delta is missing graphSourcePath.')
  }
  if (delta.sourceRecordId !== proposal.sourceRecordId) {
    throw new Error(`Proposal/delta sourceRecordId mismatch: ${proposal.sourceRecordId} vs ${delta.sourceRecordId}`)
  }
}

function validateGraphSource(graphSource: GraphSource, graphSourcePath: string): void {
  if (!Array.isArray(graphSource.nodes)) {
    throw new Error(`Graph source nodes must be an array: ${graphSourcePath}`)
  }
  if (!Array.isArray(graphSource.records)) {
    throw new Error(`Graph source records must be an array: ${graphSourcePath}`)
  }
}

function buildPlannedChanges(
  graphSource: GraphSource,
  proposal: GraphUpdateProposal,
): GraphOperationApplyProposalResult['plannedChanges'] {
  const plannedChanges: GraphOperationApplyProposalResult['plannedChanges'] = []

  for (const update of proposal.proposedNodeUpdates || []) {
    const node = graphSource.nodes?.find((entry) => entry.id === update.id)
    if (!node) {
      throw new Error(`Proposal references missing graph-source node: ${update.id}`)
    }
    if (update.currentState !== undefined && node.state !== update.currentState) {
      throw new Error(
        `Stale proposal for node ${update.id}: expected currentState ${update.currentState}, found ${node.state}`,
      )
    }
    if (update.proposedState !== undefined && node.state !== update.proposedState) {
      plannedChanges.push({
        target: 'node',
        id: update.id,
        field: 'state',
        before: node.state,
        after: update.proposedState,
      })
    }
  }

  const record = graphSource.records?.find((entry) => entry.id === proposal.sourceRecordId)
  if (!record) {
    throw new Error(`Proposal references missing graph-source record: ${proposal.sourceRecordId}`)
  }
  if (proposal.proposedRecordState?.status && record.expectedStatus !== proposal.proposedRecordState.status) {
    plannedChanges.push({
      target: 'record',
      id: record.id,
      field: 'expectedStatus',
      before: record.expectedStatus,
      after: proposal.proposedRecordState.status,
    })
  }
  if (
    proposal.proposedRecordState?.activeCodeState &&
    record.expectedActiveCodeState !== proposal.proposedRecordState.activeCodeState
  ) {
    plannedChanges.push({
      target: 'record',
      id: record.id,
      field: 'expectedActiveCodeState',
      before: record.expectedActiveCodeState,
      after: proposal.proposedRecordState.activeCodeState,
    })
  }

  return plannedChanges
}

function applyPlannedChanges(
  graphSource: GraphSource,
  plannedChanges: GraphOperationApplyProposalResult['plannedChanges'],
): void {
  for (const change of plannedChanges) {
    if (change.target === 'node') {
      const node = graphSource.nodes?.find((entry) => entry.id === change.id)
      if (node) {
        node.state = change.after
      }
    } else {
      const record = graphSource.records?.find((entry) => entry.id === change.id)
      if (record && change.field === 'expectedStatus') {
        record.expectedStatus = change.after
      }
      if (record && change.field === 'expectedActiveCodeState') {
        record.expectedActiveCodeState = change.after
      }
    }
  }
}

function renderGraphOperationProposalMarkdown(result: GraphOperationApplyProposalResult): string {
  const lines = [
    '# Graph Update Proposal Application Report',
    '',
    `Status: ${result.status}`,
    '',
    `Applied: ${result.applied}`,
    '',
    `Graph source: \`${result.graphSourcePath}\``,
    `Proposal: \`${result.proposalPath}\``,
    `Graph delta: \`${result.graphDeltaPath}\``,
    '',
    '## Changed Files',
    '',
    '| File | Additions | Deletions |',
    '| --- | ---: | ---: |',
  ]

  for (const file of result.changedFiles) {
    lines.push(`| ${file.path} | ${file.additions ?? ''} | ${file.deletions ?? ''} |`)
  }

  lines.push(
    '',
    '## Planned Graph-Source Changes',
    '',
    '| Target | ID | Field | Before | After |',
    '| --- | --- | --- | --- | --- |',
  )
  for (const change of result.plannedChanges) {
    lines.push(`| ${change.target} | ${change.id} | ${change.field} | ${change.before ?? ''} | ${change.after ?? ''} |`)
  }
  if (result.plannedChanges.length === 0) {
    lines.push('| none | - | - | - | - |')
  }

  lines.push(
    '',
    '## Boundaries',
    '',
    `- Mutates graph-source by proposal: ${result.boundaries.mutatesGraphSource}`,
    `- Applies target patch: ${result.boundaries.appliesPatch}`,
    `- Maintainer intent claimed: ${result.boundaries.maintainerIntentClaimed}`,
    `- Graph source written by this command: ${result.boundaries.graphSourceWritten}`,
  )

  return `${lines.join('\n')}\n`
}
