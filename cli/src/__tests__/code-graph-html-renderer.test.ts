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

describe('graph render-code-graph-html CLI', () => {
  it('renders a selectable zoomable code graph HTML inspector without graph-source mutation', async () => {
    const workspace = createWorkspace()
    writeJson(join(workspace, 'code-subgraph.json'), codeSubgraph())

    const validation = await runDevViewCli(
      [
        'graph',
        'validate-code-subgraph',
        '--code-subgraph',
        'code-subgraph.json',
        '--output',
        '.tmp/code-subgraph-validation.json',
        '--json',
      ],
      { cwd: workspace, pluginRoot },
    )
    expect(validation.exitCode).toBe(ExitCode.Success)

    const result = await runDevViewCli(
      [
        'graph',
        'render-code-graph-html',
        '--code-subgraph',
        'code-subgraph.json',
        '--code-subgraph-validation',
        '.tmp/code-subgraph-validation.json',
        '--output',
        '.tmp/code-graph.html',
        '--markdown',
        '.tmp/code-graph-render.md',
        '--json',
      ],
      { cwd: workspace, pluginRoot },
    )
    const payload = JSON.parse(result.stdout)
    const html = readFileSync(join(workspace, '.tmp/code-graph.html'), 'utf8')

    expect(result.exitCode).toBe(ExitCode.Success)
    expect(payload.artifactRole).toBe('devview-code-graph-html-render-report')
    expect(payload.status).toBe('devview-code-graph-html-rendered')
    expect(payload.htmlSummary.nodeCount).toBe(3)
    expect(payload.htmlSummary.edgeCount).toBe(2)
    expect(payload.htmlSummary.hasZoomControls).toBe(true)
    expect(payload.htmlSummary.hasSelectionInspector).toBe(true)
    expect(payload.htmlSummary.nonScalingEdgeStroke).toBe(true)
    expect(payload.htmlSummary.inverseScaledNodeGlyphs).toBe(true)
    expect(payload.graphSourceMutated).toBe(false)
    expect(payload.viewTreeGenerated).toBe(false)
    expect(existsSync(join(workspace, '.tmp/code-graph-render.md'))).toBe(true)

    expect(html).toContain('DevView Code Graph')
    expect(html).toContain('Selection Details')
    expect(html).toContain('id="zoomIn"')
    expect(html).toContain('id="zoomOut"')
    expect(html).toContain('vector-effect:non-scaling-stroke')
    expect(html).toContain("circle.setAttribute('r', String(7 / scale))")
    expect(html).toContain("label.setAttribute('font-size', String(11 / scale))")
    expect(html).toContain('function selectNode')
    expect(html).toContain('function selectEdge')
    expect(html).toContain('devview-code-subgraph-html-preview')
  })

  it('blocks unsafe sources, output collisions, protected outputs, and non-html output paths with zero writes', async () => {
    const cases = [
      {
        name: 'source overwrite',
        graph: codeSubgraph(),
        output: 'code-subgraph.json',
        expected: 'would overwrite supplied source',
      },
      {
        name: 'markdown collision',
        graph: codeSubgraph(),
        output: '.tmp/code-graph.html',
        markdown: '.tmp/code-graph.html',
        expected: 'must be different',
      },
      {
        name: 'protected output',
        graph: codeSubgraph(),
        output: join('.devview', 'generated', 'code-graph.html'),
        expected: 'protected control path',
      },
      {
        name: 'extension guard',
        graph: codeSubgraph(),
        output: '.tmp/code-graph.json',
        expected: 'must end with .html or .htm',
      },
      {
        name: 'unsafe authority',
        graph: { ...codeSubgraph(), graphSourceMutated: true },
        output: '.tmp/unsafe.html',
        expected: 'CODE_SUBGRAPH_UNSAFE_AUTHORITY_FLAG',
      },
    ]

    for (const entry of cases) {
      const workspace = createWorkspace()
      writeJson(join(workspace, 'code-subgraph.json'), entry.graph)

      const result = await runDevViewCli(
        [
          'graph',
          'render-code-graph-html',
          '--code-subgraph',
          'code-subgraph.json',
          '--output',
          entry.output,
          ...(entry.markdown ? ['--markdown', entry.markdown] : []),
          '--json',
        ],
        { cwd: workspace, pluginRoot },
      )

      expect(result.exitCode, entry.name).toBe(ExitCode.ValidationFailed)
      expect(result.stderr, entry.name).toContain(entry.expected)
      if (entry.output !== 'code-subgraph.json') {
        expect(existsSync(join(workspace, entry.output)), entry.name).toBe(false)
      }
    }
  })
})

function codeSubgraph(): Record<string, unknown> {
  return {
    schemaVersion: 1,
    artifactRole: 'devview-code-subgraph',
    status: 'devview-code-subgraph-supplied',
    scope: 'code-subgraph-source-fact-only',
    nodes: [
      codeNode('file.app', 'file', 'src/app.ts'),
      codeNode('function.open', 'function', 'src/app.ts'),
      codeNode('function.save', 'function', 'src/save.ts'),
    ],
    edges: [
      codeEdge('edge.file-open', 'file.app', 'function.open', 'contains', 'src/app.ts'),
      codeEdge('edge.open-save', 'function.open', 'function.save', 'calls', 'src/app.ts'),
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
    rbacEnforced: false,
    permissionVerified: false,
    cryptographicSignatureVerified: false,
    enterpriseGateActivated: false,
  }
}

function codeNode(id: string, kind: string, sourceFile: string): Record<string, unknown> {
  return {
    id,
    kind,
    label: id,
    sourceFile,
    sourceLocation: { startLine: 1, startColumn: 1, endLine: 1, endColumn: 12 },
    sourceDigest: 'sha256:test-digest',
    confidence: 'extracted',
    extractor: 'static-test-fixture',
  }
}

function codeEdge(id: string, from: string, to: string, kind: string, sourceFile: string): Record<string, unknown> {
  return {
    id,
    from,
    to,
    kind,
    sourceFile,
    sourceLocation: { startLine: 1, startColumn: 1, endLine: 1, endColumn: 12 },
    sourceDigest: 'sha256:test-digest',
    confidence: 'extracted',
    extractor: 'static-test-fixture',
  }
}
