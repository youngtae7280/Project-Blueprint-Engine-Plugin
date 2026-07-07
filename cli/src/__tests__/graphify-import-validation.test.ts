import { existsSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { runDevViewCli } from '../app'
import { ExitCode } from '../core/types'
import { cleanupWorkspaces, createWorkspace, writeJson } from './fixtures/workspace'

const pluginRoot = resolve(process.cwd())

afterEach(() => {
  cleanupWorkspaces()
})

describe('benchmark validate-graphify-import CLI', () => {
  it('validates a static Graphify export and mapping fixture against benchmark context without live activity', async () => {
    const workspace = createWorkspace()
    const result = await runDevViewCli(
      [
        ...graphifyImportArgs('.tmp/graphify-import-validation.json'),
        '--markdown',
        '.tmp/graphify-import-validation.md',
        '--json',
      ],
      { cwd: workspace, pluginRoot },
    )
    const payload = JSON.parse(result.stdout)

    expect(result.exitCode).toBe(ExitCode.Success)
    expect(payload.artifactRole).toBe('devview-graphify-import-validation-report')
    expect(payload.status).toBe('devview-graphify-import-validation-passed')
    expect(payload.sourceGraphifyExport.nodeCount).toBe(3)
    expect(payload.sourceMapping.nodeMappingCount).toBe(2)
    expect(payload.nodeMappingCoverage.mappedNodeCount).toBe(2)
    expect(payload.nodeMappingCoverage.unmappedGraphifyNodeIds).toContain('g.unmapped-helper')
    expect(payload.edgeMappingCoverage.unmappedGraphifyEdgeIds).toContain('g.edge.unmapped-helper')
    expect(payload.contextRelevanceCoverage.expectedContextCount).toBe(6)
    expect(payload.contextRelevanceCoverage.mappedExpectedContextCount).toBe(6)
    expect(payload.contextRelevanceCoverage.contextRecallHint).toBe(1)
    expect(payload.taskGoldenAlignment.taskIdStatus).toBe('matched')
    expect(payload.protocolFindings.map((entry: { code: string }) => entry.code)).toEqual(
      expect.arrayContaining(['GRAPHIFY_IMPORT_UNMAPPED_NODES', 'GRAPHIFY_IMPORT_UNMAPPED_EDGES']),
    )
    expect(existsSync(join(workspace, '.tmp/graphify-import-validation.md'))).toBe(true)
    expectSafetyFalse(payload)
  })

  it('reports conflicting mappings as protocol findings without blocking report creation', async () => {
    const workspace = createWorkspace()
    writeJson(join(workspace, 'export.json'), graphifyExport())
    writeJson(
      join(workspace, 'mapping.json'),
      graphifyMapping({
        nodeMappings: [
          { graphifyNodeId: 'g.todo-filter', devviewNodeId: 'node.todo-filter' },
          { graphifyNodeId: 'g.todo-filter', devviewNodeId: 'node.other-filter' },
          { graphifyNodeId: 'g.empty-state', devviewNodeId: 'node.todo-filter' },
        ],
      }),
    )

    const result = await runDevViewCli(
      [
        'benchmark',
        'validate-graphify-import',
        '--graphify-export',
        'export.json',
        '--mapping',
        'mapping.json',
        '--output',
        '.tmp/conflict-report.json',
        '--json',
      ],
      { cwd: workspace, pluginRoot },
    )
    const payload = JSON.parse(result.stdout)

    expect(result.exitCode).toBe(ExitCode.Success)
    expect(payload.protocolFindings.map((entry: { code: string }) => entry.code)).toContain(
      'GRAPHIFY_IMPORT_NODE_MAPPING_CONFLICT',
    )
    expect(payload.nodeMappingCoverage.duplicateDevViewNodeIds).toContain('node.todo-filter')
    expect(payload.nodeMappingCoverage.conflictingGraphifyNodeIds).toContain('g.todo-filter')
    expectSafetyFalse(payload)
  })

  it('blocks wrong or missing Graphify export shape with zero-write behavior', async () => {
    const workspace = createWorkspace()
    writeJson(join(workspace, 'bad-export.json'), { nodes: 'not-a-node-list', edges: [] })
    writeJson(join(workspace, 'mapping.json'), graphifyMapping())

    const result = await runDevViewCli(
      [
        'benchmark',
        'validate-graphify-import',
        '--graphify-export',
        'bad-export.json',
        '--mapping',
        'mapping.json',
        '--output',
        '.tmp/bad-shape-report.json',
        '--json',
      ],
      { cwd: workspace, pluginRoot },
    )
    const payload = JSON.parse(result.stderr)

    expect(result.exitCode).toBe(ExitCode.ValidationFailed)
    expect(payload.issues.map((entry: { code: string }) => entry.code)).toContain(
      'GRAPHIFY_IMPORT_EXPORT_SHAPE_INVALID',
    )
    expect(existsSync(join(workspace, '.tmp/bad-shape-report.json'))).toBe(false)
  })

  it('blocks unsafe execution/provider fields in export or mapping before writing outputs', async () => {
    const workspace = createWorkspace()
    writeJson(join(workspace, 'unsafe-export.json'), {
      ...graphifyExport(),
      graphifyExecuted: true,
      providerInvoked: true,
    })
    writeJson(join(workspace, 'unsafe-mapping.json'), {
      ...graphifyMapping(),
      entrypoint: 'graphify live-export',
    })

    const result = await runDevViewCli(
      [
        'benchmark',
        'validate-graphify-import',
        '--graphify-export',
        'unsafe-export.json',
        '--mapping',
        'unsafe-mapping.json',
        '--output',
        '.tmp/unsafe-report.json',
        '--json',
      ],
      { cwd: workspace, pluginRoot },
    )
    const payload = JSON.parse(result.stderr)

    expect(result.exitCode).toBe(ExitCode.ValidationFailed)
    expect(payload.issues.map((entry: { code: string }) => entry.code)).toEqual(
      expect.arrayContaining([
        'GRAPHIFY_IMPORT_UNSAFE_SOURCE_AUTHORITY_FLAG',
        'GRAPHIFY_IMPORT_EXECUTABLE_INSTRUCTION_DECLARED',
      ]),
    )
    expect(existsSync(join(workspace, '.tmp/unsafe-report.json'))).toBe(false)
  })

  it('blocks output collisions, source overwrite, and protected paths with zero writes', async () => {
    const cases = [
      {
        output: 'export.json',
        expected: 'would overwrite a source input',
      },
      {
        output: '.tmp/graphify-report.json',
        markdown: '.tmp/graphify-report.json',
        expected: 'must be different',
      },
      {
        output: join('.devview', 'generated', 'graphify-report.json'),
        expected: 'inside a protected control path',
      },
    ]

    for (const entry of cases) {
      const workspace = createWorkspace()
      writeJson(join(workspace, 'export.json'), graphifyExport())
      writeJson(join(workspace, 'mapping.json'), graphifyMapping())

      const result = await runDevViewCli(
        [
          'benchmark',
          'validate-graphify-import',
          '--graphify-export',
          'export.json',
          '--mapping',
          'mapping.json',
          '--output',
          entry.output,
          ...(entry.markdown ? ['--markdown', entry.markdown] : []),
          '--json',
        ],
        { cwd: workspace, pluginRoot },
      )

      expect(result.exitCode).toBe(ExitCode.ValidationFailed)
      expect(result.stderr).toContain(entry.expected)
    }
  })
})

function graphifyImportArgs(output: string): string[] {
  const fixtureRoot = join(pluginRoot, 'cli/src/__tests__/fixtures/benchmarks')
  return [
    'benchmark',
    'validate-graphify-import',
    '--graphify-export',
    join(fixtureRoot, 'graphify-import-minimal/graphify-export.fixture.json'),
    '--mapping',
    join(fixtureRoot, 'graphify-import-minimal/graphify-to-devview-mapping.json'),
    '--benchmark-task',
    join(fixtureRoot, 'native-minimal/task.json'),
    '--golden-answer',
    join(fixtureRoot, 'native-minimal/golden-answer.json'),
    '--output',
    output,
  ]
}

function graphifyExport(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    exportId: 'test-static-export',
    taskId: 'test-task',
    projectMode: 'native',
    nodes: [
      { id: 'g.todo-filter', label: 'Todo filter' },
      { id: 'g.empty-state', label: 'Empty state' },
    ],
    edges: [{ id: 'g.edge.filter-empty-state', source: 'g.todo-filter', target: 'g.empty-state' }],
    graphifyExecuted: false,
    providerInvoked: false,
    networkCallMade: false,
    shellCommandsExecuted: false,
    benchmarkExecuted: false,
    candidateExecuted: false,
    nativeBenchmarkExecuted: false,
    extensionExecutionAllowed: false,
    extensionsExecuted: false,
    graphSourceMutated: false,
    graphDeltaApplied: false,
    ...overrides,
  }
}

function graphifyMapping(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    mappingId: 'test-static-mapping',
    taskId: 'test-task',
    projectMode: 'native',
    nodeMappings: [
      { graphifyNodeId: 'g.todo-filter', devviewNodeId: 'node.todo-filter' },
      { graphifyNodeId: 'g.empty-state', devviewNodeId: 'node.empty-state' },
    ],
    edgeMappings: [{ graphifyEdgeId: 'g.edge.filter-empty-state', devviewEdgeId: 'edge.filter-empty-state' }],
    graphifyExecuted: false,
    providerInvoked: false,
    networkCallMade: false,
    shellCommandsExecuted: false,
    benchmarkExecuted: false,
    candidateExecuted: false,
    nativeBenchmarkExecuted: false,
    extensionExecutionAllowed: false,
    extensionsExecuted: false,
    graphSourceMutated: false,
    graphDeltaApplied: false,
    ...overrides,
  }
}

function expectSafetyFalse(payload: Record<string, unknown>): void {
  expect(payload.graphifyExecuted).toBe(false)
  expect(payload.providerInvoked).toBe(false)
  expect(payload.networkCallMade).toBe(false)
  expect(payload.shellCommandsExecuted).toBe(false)
  expect(payload.extensionExecutionAllowed).toBe(false)
  expect(payload.benchmarkExecuted).toBe(false)
  expect(payload.candidateExecuted).toBe(false)
  expect(payload.nativeBenchmarkExecuted).toBe(false)
  expect(payload.graphSourceMutated).toBe(false)
  expect(payload.graphDeltaApplied).toBe(false)
  expect(payload.runtimeEvidenceSatisfied).toBe(false)
  expect(payload.evidenceAccepted).toBe(false)
  expect(payload.equivalenceProven).toBe(false)
  expect(payload.scopeEnforced).toBe(false)
  expect(payload.ciEnforcementEnabled).toBe(false)
  expect(payload.hooksActivated).toBe(false)
  expect(payload.approvalAutomationEnabled).toBe(false)
  expect(payload.userAcceptanceAutomated).toBe(false)
  expect(payload.sourceFactsOnly).toBe(true)
}
