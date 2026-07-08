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

describe('graph derive-code-symbol-links CLI', () => {
  it('derives minimal task-to-symbol links from DevView graph data and validates the output', async () => {
    const workspace = createWorkspace()
    writeJson(join(workspace, 'code-subgraph.json'), codeSubgraph())
    writeJson(join(workspace, 'devviewgraph.data.json'), devviewGraphData())

    const result = await runDevViewCli(
      [
        'graph',
        'derive-code-symbol-links',
        '--code-subgraph',
        'code-subgraph.json',
        '--devview-graph-data',
        'devviewgraph.data.json',
        '--output',
        '.tmp/derived-code-symbol-links.json',
        '--markdown',
        '.tmp/derived-code-symbol-links.md',
        '--json',
      ],
      { cwd: workspace, pluginRoot },
    )
    const payload = JSON.parse(result.stdout)

    expect(result.exitCode).toBe(ExitCode.Success)
    expect(payload.artifactRole).toBe('devview-code-symbol-links')
    expect(payload.status).toBe('devview-code-symbol-links-supplied')
    expect(payload.scope).toBe('code-symbol-link-source-fact-only')
    expect(payload.derivationSummary.linkCount).toBeGreaterThanOrEqual(2)
    expect(payload.links).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          sourceNodeId: 'TASK-1',
          targetCodeNodeId: 'code:function:src/todo-service.ts#normalizeTodo',
          linkType: 'touches',
          sourceNodeKind: 'task',
          targetCodeNodeKind: 'function',
        }),
      ]),
    )
    expect(payload.graphSourceMutated).toBe(false)
    expect(existsSync(join(workspace, '.tmp/derived-code-symbol-links.md'))).toBe(true)

    const validation = await runDevViewCli(
      [
        'graph',
        'validate-code-symbol-links',
        '--links',
        '.tmp/derived-code-symbol-links.json',
        '--code-subgraph',
        'code-subgraph.json',
        '--output',
        '.tmp/code-symbol-links-validation.json',
        '--json',
      ],
      { cwd: workspace, pluginRoot },
    )
    expect(validation.exitCode).toBe(ExitCode.Success)
    const validationPayload = JSON.parse(validation.stdout)
    expect(validationPayload.status).toBe('devview-code-symbol-link-validation-passed')
    expect(validationPayload.linkValidationSummary.verifiedCodeEndpointCount).toBeGreaterThanOrEqual(2)
  })

  it('derives richer task, check, and evidence links from workflow and subgraph file hints', async () => {
    const workspace = createWorkspace()
    writeJson(join(workspace, 'code-subgraph.json'), richCodeSubgraph())
    writeJson(
      join(workspace, 'devviewgraph.data.json'),
      devviewGraphData({
        subgraphs: [
          {
            id: 'subgraph.task-printer',
            startNodeId: 'TASK-PRINTER',
            label: 'Refactor PrinterConfigViewModel and CardPrinterService integration',
            allowedFiles: ['src/Printer/PrinterConfigViewModel.cs', 'src/Printer/CardPrinterService.cs'],
          },
        ],
        workflowSteps: [
          {
            id: 'step-check',
            nodeIds: ['CHECK-PRINTER'],
            label: 'Verify PrinterConfigViewModel smoke tests',
            files: ['tests/Printer/PrinterConfigViewModelTests.cs'],
          },
        ],
        workHistory: [
          {
            id: 'evidence-printer',
            nodeId: 'EVID-PRINTER',
            label: 'Evidence for CardPrinterService behavior',
            sourceFiles: ['src/Printer/CardPrinterService.cs'],
          },
        ],
      }),
    )

    const result = await runDevViewCli(
      [
        'graph',
        'derive-code-symbol-links',
        '--code-subgraph',
        'code-subgraph.json',
        '--devview-graph-data',
        'devviewgraph.data.json',
        '--output',
        '.tmp/derived-links.json',
        '--json',
      ],
      { cwd: workspace, pluginRoot },
    )
    const payload = JSON.parse(result.stdout)

    expect(result.exitCode).toBe(ExitCode.Success)
    expect(payload.derivationSummary.linkCount).toBeGreaterThanOrEqual(5)
    expect(payload.derivationSummary.linkTypeCounts.touches).toBeGreaterThanOrEqual(1)
    expect(payload.derivationSummary.linkTypeCounts.covers).toBeGreaterThanOrEqual(1)
    expect(payload.derivationSummary.linkTypeCounts.verifies).toBeGreaterThanOrEqual(1)
    expect(payload.links.some((link: { targetCodeNodeKind: string }) => link.targetCodeNodeKind === 'method')).toBe(
      true,
    )
  })

  it('blocks unsafe source authority claims with zero-write behavior', async () => {
    const workspace = createWorkspace()
    writeJson(join(workspace, 'code-subgraph.json'), codeSubgraph())
    writeJson(join(workspace, 'devviewgraph.data.json'), {
      ...devviewGraphData(),
      providerInvoked: true,
    })

    const result = await runDevViewCli(
      [
        'graph',
        'derive-code-symbol-links',
        '--code-subgraph',
        'code-subgraph.json',
        '--devview-graph-data',
        'devviewgraph.data.json',
        '--output',
        '.tmp/derived-links.json',
        '--json',
      ],
      { cwd: workspace, pluginRoot },
    )

    expect(result.exitCode).toBe(ExitCode.ValidationFailed)
    expect(result.stderr).toContain('UNSAFE_AUTHORITY_CLAIM')
    expect(existsSync(join(workspace, '.tmp/derived-links.json'))).toBe(false)
  })

  it('blocks output collisions and source overwrite attempts', async () => {
    const workspace = createWorkspace()
    writeJson(join(workspace, 'code-subgraph.json'), codeSubgraph())
    writeJson(join(workspace, 'devviewgraph.data.json'), devviewGraphData())

    const collision = await runDevViewCli(
      [
        'graph',
        'derive-code-symbol-links',
        '--code-subgraph',
        'code-subgraph.json',
        '--devview-graph-data',
        'devviewgraph.data.json',
        '--output',
        '.tmp/same.json',
        '--markdown',
        '.tmp/same.json',
        '--json',
      ],
      { cwd: workspace, pluginRoot },
    )
    expect(collision.exitCode).toBe(ExitCode.ValidationFailed)
    expect(collision.stderr).toContain('paths must be different')

    const overwrite = await runDevViewCli(
      [
        'graph',
        'derive-code-symbol-links',
        '--code-subgraph',
        'code-subgraph.json',
        '--devview-graph-data',
        'devviewgraph.data.json',
        '--output',
        'code-subgraph.json',
        '--json',
      ],
      { cwd: workspace, pluginRoot },
    )
    expect(overwrite.exitCode).toBe(ExitCode.ValidationFailed)
    expect(overwrite.stderr).toContain('would overwrite a source input')
  })

  it('blocks executable instruction fields before writing output', async () => {
    const workspace = createWorkspace()
    writeJson(join(workspace, 'code-subgraph.json'), codeSubgraph())
    writeJson(join(workspace, 'devviewgraph.data.json'), {
      ...devviewGraphData(),
      workflowSteps: [{ id: 'step-1', nodeIds: ['TASK-1'], command: 'dotnet test' }],
    })

    const result = await runDevViewCli(
      [
        'graph',
        'derive-code-symbol-links',
        '--code-subgraph',
        'code-subgraph.json',
        '--devview-graph-data',
        'devviewgraph.data.json',
        '--output',
        '.tmp/derived-links.json',
        '--json',
      ],
      { cwd: workspace, pluginRoot },
    )

    expect(result.exitCode).toBe(ExitCode.ValidationFailed)
    expect(result.stderr).toContain('EXECUTABLE_INSTRUCTION_FIELD')
    expect(existsSync(join(workspace, '.tmp/derived-links.json'))).toBe(false)
  })

  it('writes deterministic JSON that can be read from disk', async () => {
    const workspace = createWorkspace()
    writeJson(join(workspace, 'code-subgraph.json'), codeSubgraph())
    writeJson(join(workspace, 'devviewgraph.data.json'), devviewGraphData())

    const result = await runDevViewCli(
      [
        'graph',
        'derive-code-symbol-links',
        '--code-subgraph',
        'code-subgraph.json',
        '--devview-graph-data',
        'devviewgraph.data.json',
        '--output',
        '.tmp/derived-links.json',
        '--json',
      ],
      { cwd: workspace, pluginRoot },
    )

    expect(result.exitCode).toBe(ExitCode.Success)
    const written = JSON.parse(readFileSync(join(workspace, '.tmp/derived-links.json'), 'utf8'))
    const payload = JSON.parse(result.stdout)
    expect(written).toMatchObject({
      artifactRole: payload.artifactRole,
      status: payload.status,
      scope: payload.scope,
      derivationSummary: payload.derivationSummary,
      links: payload.links,
    })
  })
})

function codeSubgraph() {
  return {
    schemaVersion: 1,
    artifactRole: 'devview-code-subgraph',
    status: 'devview-code-subgraph-supplied',
    scope: 'code-subgraph-source-fact-only',
    nodes: [
      node('code:file:src/todo-service.ts', 'file', 'src/todo-service.ts', 'src/todo-service.ts'),
      node('code:function:src/todo-service.ts#normalizeTodo', 'function', 'normalizeTodo', 'src/todo-service.ts'),
    ],
    edges: [
      edge(
        'edge:file-contains-normalize',
        'contains',
        'code:file:src/todo-service.ts',
        'code:function:src/todo-service.ts#normalizeTodo',
        'src/todo-service.ts',
      ),
    ],
  }
}

function richCodeSubgraph() {
  return {
    schemaVersion: 1,
    artifactRole: 'devview-code-subgraph',
    status: 'devview-code-subgraph-supplied',
    scope: 'code-subgraph-source-fact-only',
    nodes: [
      node(
        'code:file:src/Printer/PrinterConfigViewModel.cs',
        'file',
        'PrinterConfigViewModel.cs',
        'src/Printer/PrinterConfigViewModel.cs',
      ),
      node(
        'code:class:src/Printer/PrinterConfigViewModel.cs#PrinterConfigViewModel',
        'class',
        'PrinterConfigViewModel',
        'src/Printer/PrinterConfigViewModel.cs',
      ),
      node(
        'code:method:src/Printer/PrinterConfigViewModel.cs#Save',
        'method',
        'Save',
        'src/Printer/PrinterConfigViewModel.cs',
      ),
      node(
        'code:file:src/Printer/CardPrinterService.cs',
        'file',
        'CardPrinterService.cs',
        'src/Printer/CardPrinterService.cs',
      ),
      node(
        'code:class:src/Printer/CardPrinterService.cs#CardPrinterService',
        'class',
        'CardPrinterService',
        'src/Printer/CardPrinterService.cs',
      ),
      node(
        'code:method:src/Printer/CardPrinterService.cs#Print',
        'method',
        'Print',
        'src/Printer/CardPrinterService.cs',
      ),
      node(
        'code:file:tests/Printer/PrinterConfigViewModelTests.cs',
        'file',
        'PrinterConfigViewModelTests.cs',
        'tests/Printer/PrinterConfigViewModelTests.cs',
      ),
      node(
        'code:test:tests/Printer/PrinterConfigViewModelTests.cs#SaveTest',
        'test',
        'PrinterConfigViewModel SaveTest',
        'tests/Printer/PrinterConfigViewModelTests.cs',
      ),
    ],
    edges: [
      edge(
        'edge:vm-file-class',
        'contains',
        'code:file:src/Printer/PrinterConfigViewModel.cs',
        'code:class:src/Printer/PrinterConfigViewModel.cs#PrinterConfigViewModel',
        'src/Printer/PrinterConfigViewModel.cs',
      ),
      edge(
        'edge:vm-class-save',
        'contains',
        'code:class:src/Printer/PrinterConfigViewModel.cs#PrinterConfigViewModel',
        'code:method:src/Printer/PrinterConfigViewModel.cs#Save',
        'src/Printer/PrinterConfigViewModel.cs',
      ),
      edge(
        'edge:svc-file-class',
        'contains',
        'code:file:src/Printer/CardPrinterService.cs',
        'code:class:src/Printer/CardPrinterService.cs#CardPrinterService',
        'src/Printer/CardPrinterService.cs',
      ),
      edge(
        'edge:svc-class-print',
        'contains',
        'code:class:src/Printer/CardPrinterService.cs#CardPrinterService',
        'code:method:src/Printer/CardPrinterService.cs#Print',
        'src/Printer/CardPrinterService.cs',
      ),
      edge(
        'edge:test-file-test',
        'contains',
        'code:file:tests/Printer/PrinterConfigViewModelTests.cs',
        'code:test:tests/Printer/PrinterConfigViewModelTests.cs#SaveTest',
        'tests/Printer/PrinterConfigViewModelTests.cs',
      ),
    ],
  }
}

function devviewGraphData(overrides: Record<string, unknown> = {}) {
  return {
    schemaVersion: 1,
    artifactRole: 'devview-code-graph-html-data',
    status: 'devview-code-graph-html-data-rendered',
    graph: {
      nodes: [
        {
          id: 'TASK-1',
          kind: 'task',
          label: 'Normalize Todo service',
          summary: 'Update normalizeTodo in src/todo-service.ts',
          sourceArtifact: '.devview/tree/work-tree.json',
        },
      ],
    },
    subgraphs: [
      {
        id: 'subgraph.task-1',
        startNodeId: 'TASK-1',
        label: 'Normalize todo behavior',
        allowedFiles: ['src/todo-service.ts'],
      },
    ],
    workflowSteps: [],
    workHistory: [],
    packMapping: [],
    ...overrides,
  }
}

function node(id: string, kind: string, label: string, sourceFile: string) {
  return {
    id,
    kind,
    label,
    sourceFile,
    sourceLocationStatus: 'fixture-source-location',
    confidence: 'extracted',
  }
}

function edge(id: string, kind: string, source: string, target: string, sourceFile: string) {
  return {
    id,
    kind,
    source,
    target,
    sourceFile,
    sourceLocationStatus: 'fixture-source-location',
    confidence: 'extracted',
  }
}
