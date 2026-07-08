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

describe('benchmark compare-code-graph-parity CLI', () => {
  it('reports DevView imported code subgraph parity against raw Graphify graph.json counts', async () => {
    const workspace = createWorkspace()
    writeJson(join(workspace, 'graphify-out', 'graph.json'), realGraphifyExport(workspace))

    const importResult = await runDevViewCli(
      [
        'graph',
        'import-graphify-code-subgraph',
        '--graphify',
        join('graphify-out', 'graph.json'),
        '--output',
        '.tmp/code-subgraph.json',
        '--validation-output',
        '.tmp/code-subgraph-validation.json',
        '--json',
      ],
      { cwd: workspace, pluginRoot },
    )
    expect(importResult.exitCode).toBe(ExitCode.Success)

    const result = await runDevViewCli(
      [
        'benchmark',
        'compare-code-graph-parity',
        '--code-subgraph',
        '.tmp/code-subgraph.json',
        '--graphify',
        join('graphify-out', 'graph.json'),
        '--output',
        '.tmp/code-graph-parity.json',
        '--markdown',
        '.tmp/code-graph-parity.md',
        '--json',
      ],
      { cwd: workspace, pluginRoot },
    )
    const payload = JSON.parse(result.stdout)

    expect(result.exitCode).toBe(ExitCode.Success)
    expect(payload.artifactRole).toBe('devview-code-graph-parity-benchmark-report')
    expect(payload.status).toBe('devview-code-graph-parity-benchmark-passed')
    expect(payload.rawGraphifySummary.nodeCount).toBe(7)
    expect(payload.rawGraphifySummary.edgeCount).toBe(10)
    expect(payload.rawGraphifySummary.missingEndpointNodeCount).toBe(1)
    expect(payload.devviewSummary.nodeCount).toBe(8)
    expect(payload.devviewSummary.edgeCount).toBe(10)
    expect(payload.devviewSummary.sourceGraphifyNodeBackedCount).toBe(7)
    expect(payload.devviewSummary.syntheticGraphifyNodeCount).toBe(1)
    expect(payload.devviewSummary.sourceGraphifyEdgeBackedCount).toBe(10)
    expect(payload.devviewSummary.callsEdgeCount).toBe(2)
    expect(payload.parity.achieved).toBe(true)
    expect(payload.parity.graphifyBackedNodeRatio).toBe(1)
    expect(payload.parity.graphifyBackedEdgeRatio).toBe(1)
    expect(payload.parity.callLikeRatio).toBe(1)
    expect(payload.parity.nodeGap).toBe(1)
    expect(payload.parity.graphifyBackedNodeGap).toBe(0)
    expect(
      payload.parity.relationParity.find((entry: { relation: string }) => entry.relation === 'indirect_call'),
    ).toMatchObject({
      graphifyCount: 1,
      mappedDevviewEdgeKind: 'calls',
      devviewSourceGraphifyEdgeKindCount: 1,
    })
    expect(payload.benchmarkExecuted).toBe(false)
    expect(payload.graphifyExecuted).toBe(false)
    expect(payload.astExtractorExecuted).toBe(false)
    expect(payload.graphSourceMutated).toBe(false)
    expect(existsSync(join(workspace, '.tmp/code-graph-parity.md'))).toBe(true)
  })
})

function realGraphifyExport(workspace: string): Record<string, unknown> {
  const sourceFile = join(workspace, 'src', 'app.ts')
  return {
    nodes: [
      realGraphifyNode('g.file.app', 'app.ts', sourceFile, 'L1'),
      realGraphifyNode('g.fn.main', 'main()', sourceFile, 'L10'),
      realGraphifyNode('g.fn.helper', 'helper()', sourceFile, 'L14'),
      realGraphifyNode('g.class.service', 'Service', sourceFile, 'L20'),
      realGraphifyNode('g.method.run', '.run()', sourceFile, 'L22'),
      realGraphifyNode('g.interface.port', 'Port', sourceFile, 'L5'),
      realGraphifyNode('g.type.base', 'BaseType', sourceFile, 'L3'),
    ],
    edges: [
      realGraphifyEdge('g.file.app', 'g.fn.main', 'contains', sourceFile, 'L10'),
      realGraphifyEdge('g.file.app', 'ref_vitest', 'imports_from', sourceFile, 'L1'),
      realGraphifyEdge('g.file.app', 'g.fn.helper', 'imports', sourceFile, 'L2'),
      realGraphifyEdge('g.file.app', 'g.fn.helper', 're_exports', sourceFile, 'L3'),
      realGraphifyEdge('g.fn.main', 'g.fn.helper', 'calls', sourceFile, 'L11'),
      realGraphifyEdge('g.fn.main', 'g.class.service', 'references', sourceFile, 'L12'),
      realGraphifyEdge('g.class.service', 'g.type.base', 'inherits', sourceFile, 'L20'),
      realGraphifyEdge('g.class.service', 'g.interface.port', 'implements', sourceFile, 'L20'),
      realGraphifyEdge('g.class.service', 'g.method.run', 'method', sourceFile, 'L22'),
      realGraphifyEdge('g.fn.main', 'g.method.run', 'indirect_call', sourceFile, 'L13'),
    ],
  }
}

function realGraphifyNode(
  id: string,
  label: string,
  sourceFile: string,
  sourceLocation: string,
): Record<string, unknown> {
  return {
    id,
    label,
    file_type: 'code',
    source_file: sourceFile,
    source_location: sourceLocation,
    _origin: 'ast',
  }
}

function realGraphifyEdge(
  source: string,
  target: string,
  relation: string,
  sourceFile: string,
  sourceLocation: string,
): Record<string, unknown> {
  return {
    source,
    target,
    relation,
    context: 'fixture',
    confidence: 'EXTRACTED',
    source_file: sourceFile,
    source_location: sourceLocation,
    weight: 1,
  }
}
