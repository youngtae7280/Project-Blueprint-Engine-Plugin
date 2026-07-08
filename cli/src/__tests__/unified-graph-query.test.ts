import { existsSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { runDevViewCli } from '../app'
import { ExitCode } from '../core/types'
import { cleanupWorkspaces, createWorkspace, writeJson } from './fixtures/workspace'

const pluginRoot = resolve(process.cwd())

const fileId = 'code.file.src.query.ts'
const callerId = 'code.function.src.query.ts.caller'
const targetId = 'code.function.src.query.ts.target'
const calleeId = 'code.function.src.query.ts.callee'

afterEach(() => {
  cleanupWorkspaces()
})

describe('graph query-unified CLI', () => {
  it('reports neighbors across code edges and validated maintenance links', async () => {
    const workspace = createWorkspace()
    writeJson(join(workspace, 'code-subgraph.json'), codeSubgraph())
    writeJson(join(workspace, 'code-symbol-links-validation.json'), codeSymbolLinksValidation())
    writeJson(join(workspace, 'graph-source.json'), graphSource())

    const result = await runQuery(
      workspace,
      [
        '--mode',
        'neighbors',
        '--node',
        targetId,
        '--code-symbol-links-validation',
        'code-symbol-links-validation.json',
        '--graph-source',
        'graph-source.json',
        '--markdown',
        '.tmp/query-neighbors.md',
      ],
      '.tmp/query-neighbors.json',
    )
    const payload = JSON.parse(result.stdout)
    const written = JSON.parse(readFileSync(join(workspace, '.tmp/query-neighbors.json'), 'utf8'))

    expect(result.exitCode).toBe(ExitCode.Success)
    expect(payload.artifactRole).toBe('devview-unified-graph-query-report')
    expect(payload.status).toBe('devview-unified-graph-query-reported')
    expect(payload.scope).toBe('unified-graph-query-report-only')
    expect(payload.queryMode).toBe('neighbors')
    expect(payload.assembledGraphSummary.codeNodeCount).toBe(4)
    expect(payload.assembledGraphSummary.maintenanceNodeCount).toBe(2)
    expect(payload.assembledGraphSummary.linkEdgeCount).toBe(2)
    expect(payload.result.neighbors.incoming).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ neighborNodeId: callerId, edgeType: 'calls', sourceArtifact: 'code-subgraph' }),
        expect.objectContaining({
          neighborNodeId: 'TASK-1',
          edgeType: 'touches',
          sourceArtifact: 'code-symbol-links-validation',
        }),
        expect.objectContaining({
          neighborNodeId: 'EVIDENCE-1',
          edgeType: 'verifies',
          sourceArtifact: 'code-symbol-links-validation',
        }),
      ]),
    )
    expect(payload.result.neighbors.outgoing).toContainEqual(
      expect.objectContaining({ neighborNodeId: calleeId, edgeType: 'calls' }),
    )
    expect(payload.unifiedGraphBoundary.graphSourceMutated).toBe(false)
    expect(payload.unifiedGraphBoundary.graphDeltaApplied).toBe(false)
    expectSafetyFalse(payload)
    expect(written.writtenMarkdownPath).toBe('.tmp/query-neighbors.md')
    expect(existsSync(join(workspace, '.tmp/query-neighbors.md'))).toBe(true)
  })

  it('finds a bounded directed path from a maintenance task to a called function', async () => {
    const workspace = createWorkspace()
    writeJson(join(workspace, 'code-subgraph.json'), codeSubgraph())
    writeJson(join(workspace, 'code-symbol-links-validation.json'), codeSymbolLinksValidation())

    const result = await runQuery(
      workspace,
      [
        '--mode',
        'path',
        '--from',
        'TASK-1',
        '--to',
        calleeId,
        '--max-depth',
        '4',
        '--code-symbol-links-validation',
        'code-symbol-links-validation.json',
      ],
      '.tmp/query-path.json',
    )
    const payload = JSON.parse(result.stdout)

    expect(result.exitCode).toBe(ExitCode.Success)
    expect(payload.result.path.pathFound).toBe(true)
    expect(payload.result.path.pathLength).toBe(2)
    expect(payload.result.path.nodes.map((node: { nodeId: string }) => node.nodeId)).toEqual([
      'TASK-1',
      targetId,
      calleeId,
    ])
    expect(payload.result.path.edges.map((edge: { edgeType: string }) => edge.edgeType)).toEqual(['touches', 'calls'])
  })

  it('explains a function with source, caller/callee, and maintenance-link context', async () => {
    const workspace = createWorkspace()
    writeJson(join(workspace, 'code-subgraph.json'), codeSubgraph())
    writeJson(join(workspace, 'code-symbol-links-validation.json'), codeSymbolLinksValidation())

    const result = await runQuery(
      workspace,
      ['--mode', 'explain', '--node', targetId, '--code-symbol-links-validation', 'code-symbol-links-validation.json'],
      '.tmp/query-explain.json',
    )
    const payload = JSON.parse(result.stdout)

    expect(result.exitCode).toBe(ExitCode.Success)
    expect(payload.result.explain.nodeSummary).toMatchObject({
      nodeId: targetId,
      nodeKind: 'function',
      domain: 'code',
      sourceFile: 'src/query.ts',
    })
    expect(payload.result.explain.whyRelevant.join('\n')).toContain('validated maintenance-to-code link')
    expect(payload.result.explain.whyRelevant.join('\n')).toContain('caller relationship')
    expect(payload.result.explain.whyRelevant.join('\n')).toContain('calls 1 code node')
    expect(
      payload.result.explain.relatedMaintenanceNodes.map((node: { neighborNodeId: string }) => node.neighborNodeId),
    ).toEqual(expect.arrayContaining(['TASK-1', 'EVIDENCE-1']))
    expect(
      payload.result.explain.relatedCodeNodes.map((node: { neighborNodeId: string }) => node.neighborNodeId),
    ).toEqual(expect.arrayContaining([callerId, calleeId, fileId]))
  })

  it('blocks missing query nodes with zero writes', async () => {
    const workspace = createWorkspace()
    writeJson(join(workspace, 'code-subgraph.json'), codeSubgraph())

    const result = await runQuery(
      workspace,
      ['--mode', 'neighbors', '--node', 'code.function.missing'],
      '.tmp/query-missing.json',
    )
    const payload = JSON.parse(result.stderr)

    expect(result.exitCode).toBe(ExitCode.ValidationFailed)
    expect(payload.issues.map((issue: { code: string }) => issue.code)).toContain('UNIFIED_GRAPH_QUERY_NODE_MISSING')
    expect(existsSync(join(workspace, '.tmp/query-missing.json'))).toBe(false)
  })

  it('blocks invalid modes and missing mode-specific arguments with zero writes', async () => {
    const cases = [
      {
        args: ['--mode', 'wander', '--node', targetId],
        output: '.tmp/query-invalid-mode.json',
        expected: 'UNIFIED_GRAPH_QUERY_MODE_INVALID',
      },
      {
        args: ['--mode', 'path', '--source-node', 'TASK-1'],
        output: '.tmp/query-missing-target.json',
        expected: 'UNIFIED_GRAPH_QUERY_TARGET_NODE_REQUIRED',
      },
    ]

    for (const entry of cases) {
      const workspace = createWorkspace()
      writeJson(join(workspace, 'code-subgraph.json'), codeSubgraph())

      const result = await runQuery(workspace, entry.args, entry.output)
      const payload = JSON.parse(result.stderr)

      expect(result.exitCode).toBe(ExitCode.ValidationFailed)
      expect(payload.issues.map((issue: { code: string }) => issue.code)).toContain(entry.expected)
      expect(existsSync(join(workspace, entry.output))).toBe(false)
    }
  })

  it('blocks wrong source roles or statuses with zero writes', async () => {
    const cases = [
      {
        codeSubgraphOverride: { artifactRole: 'not-code-subgraph' },
        expected: 'UNIFIED_GRAPH_QUERY_CODE_SUBGRAPH_ROLE_INVALID',
      },
      {
        linksValidationOverride: { status: 'devview-code-symbol-link-validation-blocked' },
        expected: 'UNIFIED_GRAPH_QUERY_LINK_VALIDATION_STATUS_INVALID',
      },
    ]

    for (const entry of cases) {
      const workspace = createWorkspace()
      writeJson(join(workspace, 'code-subgraph.json'), codeSubgraph(entry.codeSubgraphOverride))
      writeJson(
        join(workspace, 'code-symbol-links-validation.json'),
        codeSymbolLinksValidation(entry.linksValidationOverride),
      )

      const result = await runQuery(
        workspace,
        [
          '--mode',
          'neighbors',
          '--node',
          targetId,
          '--code-symbol-links-validation',
          'code-symbol-links-validation.json',
        ],
        '.tmp/query-wrong-source.json',
      )
      const payload = JSON.parse(result.stderr)

      expect(result.exitCode).toBe(ExitCode.ValidationFailed)
      expect(payload.issues.map((issue: { code: string }) => issue.code)).toContain(entry.expected)
      expect(existsSync(join(workspace, '.tmp/query-wrong-source.json'))).toBe(false)
    }
  })

  it('blocks unsafe authority flags before writing outputs', async () => {
    const workspace = createWorkspace()
    writeJson(
      join(workspace, 'code-subgraph.json'),
      codeSubgraph({
        graphSourceMutated: true,
        providerInvoked: true,
      }),
    )

    const result = await runQuery(workspace, ['--mode', 'neighbors', '--node', targetId], '.tmp/query-unsafe.json')
    const payload = JSON.parse(result.stderr)

    expect(result.exitCode).toBe(ExitCode.ValidationFailed)
    expect(payload.issues.map((issue: { code: string }) => issue.code)).toContain(
      'UNIFIED_GRAPH_QUERY_UNSAFE_AUTHORITY_FLAG',
    )
    expect(existsSync(join(workspace, '.tmp/query-unsafe.json'))).toBe(false)
  })

  it('blocks output collisions, source overwrite, protected paths, and source-authority-shaped outputs', async () => {
    const cases = [
      {
        output: '.tmp/same.json',
        markdown: '.tmp/same.json',
        expected: 'must be different',
      },
      {
        output: 'code-subgraph.json',
        expected: 'would overwrite a source input',
      },
      {
        output: join('.devview', 'generated', 'query.json'),
        expected: 'inside a protected control path',
      },
      {
        output: '.tmp/graph-source-query.json',
        expected: 'would overwrite a source-authority-shaped path',
      },
      {
        output: '.tmp/existing-node-edge.json',
        existing: { nodes: [], edges: [] },
        expected: 'would overwrite a source-authority-shaped path',
      },
    ]

    for (const entry of cases) {
      const workspace = createWorkspace()
      writeJson(join(workspace, 'code-subgraph.json'), codeSubgraph())
      if (entry.existing) {
        writeJson(join(workspace, entry.output), entry.existing)
      }

      const result = await runQuery(
        workspace,
        ['--mode', 'neighbors', '--node', targetId, ...(entry.markdown ? ['--markdown', entry.markdown] : [])],
        entry.output,
      )

      expect(result.exitCode).toBe(ExitCode.ValidationFailed)
      expect(result.stderr).toContain(entry.expected)
      expect(existsSync(join(workspace, entry.output))).toBe(
        Boolean(entry.existing || entry.output === 'code-subgraph.json'),
      )
    }
  })
})

async function runQuery(workspace: string, extraArgs: string[], output: string) {
  return await runDevViewCli(
    ['graph', 'query-unified', '--code-subgraph', 'code-subgraph.json', ...extraArgs, '--output', output, '--json'],
    { cwd: workspace, pluginRoot },
  )
}

function codeSubgraph(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    schemaVersion: 1,
    artifactRole: 'devview-code-subgraph',
    status: 'devview-code-subgraph-supplied',
    scope: 'code-subgraph-source-fact-only',
    nodes: [
      codeNode(fileId, 'file', 'src/query.ts', 'file-node'),
      codeNode(callerId, 'function', 'src/query.ts', undefined, {
        startLine: 1,
        startColumn: 1,
        endLine: 3,
        endColumn: 2,
      }),
      codeNode(targetId, 'function', 'src/query.ts', undefined, {
        startLine: 5,
        startColumn: 1,
        endLine: 7,
        endColumn: 2,
      }),
      codeNode(calleeId, 'function', 'src/query.ts', undefined, {
        startLine: 9,
        startColumn: 1,
        endLine: 11,
        endColumn: 2,
      }),
    ],
    edges: [
      codeEdge('edge.file-caller', fileId, callerId, 'contains'),
      codeEdge('edge.file-target', fileId, targetId, 'contains'),
      codeEdge('edge.file-callee', fileId, calleeId, 'contains'),
      codeEdge('edge.caller-target', callerId, targetId, 'calls'),
      codeEdge('edge.target-callee', targetId, calleeId, 'calls'),
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
    ...overrides,
  }
}

function codeNode(
  id: string,
  kind: string,
  sourceFile: string,
  sourceLocationStatus?: string,
  sourceLocation?: Record<string, number>,
): Record<string, unknown> {
  return {
    id,
    kind,
    label: id,
    sourceFile,
    ...(sourceLocation ? { sourceLocation } : { sourceLocationStatus }),
    sourceDigest: 'sha256:fixture',
    confidence: 'extracted',
  }
}

function codeEdge(id: string, from: string, to: string, kind: string): Record<string, unknown> {
  return {
    id,
    from,
    to,
    kind,
    sourceFile: 'src/query.ts',
    sourceLocationStatus: 'fixture-edge',
    sourceDigest: 'sha256:fixture',
    confidence: 'extracted',
  }
}

function codeSymbolLinksValidation(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    schemaVersion: 1,
    artifactRole: 'devview-code-symbol-link-validation-report',
    status: 'devview-code-symbol-link-validation-passed',
    scope: 'code-symbol-link-validation-report-only',
    validatedLinks: [
      validatedLink('link-task-target', 'TASK-1', 'task', targetId, 'function', 'touches'),
      validatedLink('link-evidence-target', 'EVIDENCE-1', 'evidence', targetId, 'function', 'verifies'),
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
    ...overrides,
  }
}

function validatedLink(
  id: string,
  sourceNodeId: string,
  sourceNodeKind: string,
  targetCodeNodeId: string,
  targetCodeNodeKind: string,
  linkType: string,
): Record<string, unknown> {
  return {
    id,
    sourceNodeId,
    sourceNodeKind,
    targetCodeNodeId,
    targetCodeNodeKind,
    linkType,
    sourceLocationStatus: 'fixture-link',
    confidence: 'inferred',
  }
}

function graphSource(): Record<string, unknown> {
  return {
    artifactRole: 'devview-maintainability-graph-source-fixture',
    status: 'fixture-current',
    sourceRecords: {
      nodes: [
        { id: 'TASK-1', kind: 'task', label: 'Task 1' },
        { id: 'EVIDENCE-1', kind: 'evidence', label: 'Evidence 1' },
      ],
      edges: [{ id: 'edge.task-evidence', from: 'TASK-1', to: 'EVIDENCE-1', kind: 'reports_on' }],
    },
    graphSourceMutated: false,
    graphDeltaApplied: false,
  }
}

function expectSafetyFalse(payload: Record<string, unknown>): void {
  expect(payload.graphifyExecuted).toBe(false)
  expect(payload.astExtractorExecuted).toBe(false)
  expect(payload.providerInvoked).toBe(false)
  expect(payload.networkCallMade).toBe(false)
  expect(payload.apiCallMade).toBe(false)
  expect(payload.shellCommandsExecuted).toBe(false)
  expect(payload.extensionExecutionAllowed).toBe(false)
  expect(payload.graphSourceMutated).toBe(false)
  expect(payload.graphDeltaApplied).toBe(false)
  expect(payload.viewTreeGenerated).toBe(false)
  expect(payload.contextPackGenerated).toBe(false)
  expect(payload.runtimeEvidenceSatisfied).toBe(false)
  expect(payload.evidenceAccepted).toBe(false)
  expect(payload.equivalenceProven).toBe(false)
  expect(payload.scopeEnforced).toBe(false)
  expect(payload.ciEnforcementEnabled).toBe(false)
  expect(payload.rbacEnforced).toBe(false)
  expect(payload.permissionVerified).toBe(false)
  expect(payload.cryptographicSignatureVerified).toBe(false)
  expect(payload.enterpriseGateActivated).toBe(false)
}
