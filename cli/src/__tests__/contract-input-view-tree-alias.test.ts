import { existsSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { runDevViewCli } from '../app'
import { ExitCode } from '../core/types'
import { cleanupWorkspaces, createWorkspace, writeJson } from './fixtures/workspace'

const pluginRoot = resolve(process.cwd())

afterEach(() => {
  cleanupWorkspaces()
})

describe('Contract compiler input View Tree CLI alias', () => {
  it('accepts canonical --view-tree and records the source View Tree input', async () => {
    const workspace = createWorkspace()
    writeFixtureFiles(workspace)
    const outputPath = join('.tmp', 'contract-compiler-input.view-tree.json')

    const result = await runDevViewCli(
      [
        'graph',
        'read-model',
        'generate-contract-input',
        '--view-tree',
        'view-tree.json',
        '--output',
        outputPath,
        '--json',
      ],
      { cwd: workspace, pluginRoot },
    )
    const payload = JSON.parse(result.stdout)
    const written = JSON.parse(readFileSync(join(workspace, outputPath), 'utf8'))

    expect(result.exitCode).toBe(ExitCode.Success)
    expect(payload.ok).toBe(true)
    expect(payload.sourceViewTreeInput).toBe('view-tree.json')
    expect(payload.sourceViewTreeArtifactRole).toBe('devview-view-tree-preview')
    expect(payload.contractInputGenerated).toBe(true)
    expect(payload.instructionPackGenerated).toBe(false)
    expect(payload.runtimeEvidenceSatisfied).toBe(false)
    expect(payload.equivalenceProven).toBe(false)
    expect(payload.scopeEnforced).toBe(false)
    expect(written.sourceViewTree).toBe('view-tree.json')
    expect(written.sourceViewTreeArtifactRole).toBe('devview-view-tree-preview')
  })

  it('blocks when canonical --view-tree and compatibility --selected-slice disagree', async () => {
    const workspace = createWorkspace()
    writeFixtureFiles(workspace)

    const result = await runDevViewCli(
      [
        'graph',
        'read-model',
        'generate-contract-input',
        '--view-tree',
        'view-tree.json',
        '--selected-slice',
        'other-view-tree.json',
        '--output',
        join('.tmp', 'contract-compiler-input.json'),
        '--json',
      ],
      { cwd: workspace, pluginRoot },
    )

    expect(result.exitCode).toBe(ExitCode.InvalidArguments)
    expect(result.stderr).toContain('different --view-tree and --selected-slice paths')
    expect(existsSync(join(workspace, '.tmp', 'contract-compiler-input.json'))).toBe(false)
  })
})

function writeFixtureFiles(workspace: string): void {
  writeJson(join(workspace, 'view-tree.json'), validViewTree())
  writeJson(join(workspace, 'request-ir-graph-validation.json'), validGraphAwareValidation())
  writeJson(join(workspace, 'request-ir-candidate.json'), validRequestIrCandidate())
  writeJson(join(workspace, 'graph-source.json'), { sourceRecords: { nodes: [], edges: [] } })
  writeJson(join(workspace, 'generated-read-model.json'), { nodes: [], edges: [] })
}

function validViewTree(): Record<string, unknown> {
  const scopeNodes = [node('CH-001', 'change', 'Preserve completed add-todo behavior.', ['target-change'])]
  const evidenceNodes = [
    node('TT-1', 'check', 'Add todo acceptance check', ['evidence-or-check-source']),
    node('EV-1', 'evidence', '.devview/evidence/test-results/todo-add.txt', ['evidence-or-check-source']),
  ]

  return {
    schemaVersion: 1,
    artifactRole: 'selected-graph-slice',
    status: 'selected-graph-slice-generated',
    viewTreeArtifactRole: 'devview-view-tree-preview',
    viewTreeStatus: 'devview-view-tree-preview-generated',
    sourceMaintainabilityGraph: 'examples/valid/todo-app-devview-run/graph-source.json',
    sourceTraversalPlan: 'graph-traversal-plan.json',
    sourceGraphAwareValidation: 'request-ir-graph-validation.json',
    graphSourcePath: 'examples/valid/todo-app-devview-run/graph-source.json',
    generatedReadModelPath: 'generated-read-model.json',
    selectedGraphSliceStatus: 'generated',
    graphTraversalExecuted: true,
    selectedGraphSliceGenerated: true,
    contractInputGenerated: false,
    instructionPackGenerated: false,
    selectedNodes: [...scopeNodes, ...evidenceNodes],
    selectedEdges: [
      edge('E-CH-001-PRESERVES-TT-1', 'CH-001', 'TT-1', 'preserves'),
      edge('E-CH-001-PRESERVES-EV-1', 'CH-001', 'EV-1', 'preserves'),
    ],
    includedScopeNodes: scopeNodes,
    includedEvidenceNodes: evidenceNodes,
    includedRiskNodes: [],
    validationFindings: [],
  }
}

function validGraphAwareValidation(): Record<string, unknown> {
  return {
    artifactRole: 'request-ir-graph-aware-validation',
    candidatePath: 'request-ir-candidate.json',
    scopeIntentResolution: {
      forbiddenScopeIntentCandidate: ['production source changes', 'graph-source mutation'],
    },
  }
}

function validRequestIrCandidate(): Record<string, unknown> {
  return {
    artifactRole: 'request-ir-candidate',
    requestId: 'request-todo-app-runtime-evidence-only',
    requestTitle: 'Preserve add todo runtime evidence',
    requestSummary: 'Preserve add todo behavior while evidence is checked.',
    targetChangeIds: ['CH-001'],
  }
}

function node(id: string, type: string, summary: string, roles: string[]): Record<string, unknown> {
  return { nodeId: id, nodeType: type, summary, selectionRoles: roles }
}

function edge(id: string, from: string, to: string, relation: string): Record<string, unknown> {
  return { edgeId: id, from, to, relationType: relation }
}
