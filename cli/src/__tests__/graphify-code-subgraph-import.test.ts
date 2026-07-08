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

describe('graph import-graphify-code-subgraph CLI', () => {
  it('converts a static Graphify export into a validated DevView code subgraph without live activity', async () => {
    const workspace = createWorkspace()
    writeJson(join(workspace, 'graphify-export.json'), graphifyExport())

    const result = await runDevViewCli(
      [
        'graph',
        'import-graphify-code-subgraph',
        '--graphify',
        'graphify-export.json',
        '--output',
        '.tmp/devview-code-subgraph.json',
        '--validation-output',
        '.tmp/devview-code-subgraph-validation.json',
        '--markdown',
        '.tmp/graphify-code-subgraph-import.md',
        '--json',
      ],
      { cwd: workspace, pluginRoot },
    )
    const payload = JSON.parse(result.stdout)
    const codeSubgraph = JSON.parse(readFileSync(join(workspace, '.tmp/devview-code-subgraph.json'), 'utf8'))
    const validation = JSON.parse(readFileSync(join(workspace, '.tmp/devview-code-subgraph-validation.json'), 'utf8'))

    expect(result.exitCode).toBe(ExitCode.Success)
    expect(payload.artifactRole).toBe('devview-graphify-code-subgraph-import-report')
    expect(payload.status).toBe('devview-graphify-code-subgraph-import-passed')
    expect(payload.outputCodeSubgraph.nodeCount).toBe(5)
    expect(payload.outputCodeSubgraph.edgeCount).toBe(5)
    expect(payload.mappingSummary.nodeKindCounts.file).toBe(1)
    expect(payload.mappingSummary.nodeKindCounts.class).toBe(1)
    expect(payload.mappingSummary.nodeKindCounts.method).toBe(1)
    expect(payload.mappingSummary.edgeTypeCounts.calls).toBe(1)
    expect(payload.mappingSummary.edgeTypeCounts.imports).toBe(1)
    expect(payload.mappingSummary.edgeTypeCounts.references).toBe(1)
    expect(payload.graphifyExecuted).toBe(false)
    expect(payload.astExtractorExecuted).toBe(false)
    expect(payload.providerInvoked).toBe(false)
    expect(payload.graphSourceMutated).toBe(false)
    expect(payload.viewTreeGenerated).toBe(false)

    expect(codeSubgraph.artifactRole).toBe('devview-code-subgraph')
    expect(codeSubgraph.nodes.map((entry: { id: string }) => entry.id)).toContain('code.g.method.add')
    expect(codeSubgraph.edges.map((entry: { kind: string }) => entry.kind)).toEqual(
      expect.arrayContaining(['contains', 'imports', 'calls', 'references']),
    )
    expect(codeSubgraph.nodes.every((entry: { sourceFile?: string }) => Boolean(entry.sourceFile))).toBe(true)
    expect(
      codeSubgraph.edges.every((entry: { sourceLocationStatus?: string }) => Boolean(entry.sourceLocationStatus)),
    ).toBe(true)
    expect(validation.status).toBe('devview-code-subgraph-validation-passed')
    expect(validation.sourceCodeSubgraph.path).toBe('.tmp/devview-code-subgraph.json')
    expect(existsSync(join(workspace, '.tmp/graphify-code-subgraph-import.md'))).toBe(true)
  })

  it('imports real Graphify-shaped graph.json nodes without kind and preserves supported relations', async () => {
    const workspace = createWorkspace()
    writeJson(join(workspace, 'graphify-real', 'graphify-out', 'graph.json'), realGraphifyExport(workspace))

    const result = await runDevViewCli(
      [
        'graph',
        'import-graphify-code-subgraph',
        '--graphify',
        join('graphify-real', 'graphify-out', 'graph.json'),
        '--output',
        '.tmp/real-code-subgraph.json',
        '--validation-output',
        '.tmp/real-code-subgraph-validation.json',
        '--json',
      ],
      { cwd: workspace, pluginRoot },
    )
    const payload = JSON.parse(result.stdout)
    const codeSubgraph = JSON.parse(readFileSync(join(workspace, '.tmp/real-code-subgraph.json'), 'utf8'))
    const validation = JSON.parse(readFileSync(join(workspace, '.tmp/real-code-subgraph-validation.json'), 'utf8'))

    expect(result.exitCode).toBe(ExitCode.Success)
    expect(payload.sourceGraphifyExport.nodeCount).toBe(7)
    expect(payload.sourceGraphifyExport.edgeCount).toBe(10)
    expect(payload.outputCodeSubgraph.nodeCount).toBe(8)
    expect(payload.outputCodeSubgraph.edgeCount).toBe(10)
    expect(payload.mappingSummary.edgeTypeCounts).toMatchObject({
      calls: 2,
      contains: 1,
      imports: 1,
      imports_from: 1,
      inherits: 1,
      implements: 1,
      method: 1,
      references: 1,
      re_exports: 1,
    })

    const nodes = codeSubgraph.nodes as Array<Record<string, unknown>>
    const edges = codeSubgraph.edges as Array<Record<string, unknown>>
    expect(
      nodes.some((entry) => entry.sourceGraphifyNodeSynthetic === true && entry.kind === 'external_dependency'),
    ).toBe(true)
    expect(nodes.find((entry) => entry.sourceGraphifyNodeId === 'g.file.app')?.sourceFile).toBe('src/app.ts')
    expect(nodes.find((entry) => entry.sourceGraphifyNodeId === 'g.file.app')?.originalSourceFile).toContain('src')
    expect(nodes.find((entry) => entry.sourceGraphifyNodeId === 'g.fn.main')?.kind).toBe('function')
    expect(nodes.find((entry) => entry.sourceGraphifyNodeId === 'g.class.service')?.kind).toBe('class')
    expect(nodes.find((entry) => entry.sourceGraphifyNodeId === 'g.interface.port')?.kind).toBe('interface')
    expect(nodes.find((entry) => entry.sourceGraphifyNodeId === 'g.method.run')?.kind).toBe('method')
    expect(edges.find((entry) => entry.sourceGraphifyEdgeKind === 'indirect_call')?.kind).toBe('calls')
    expect(edges.every((entry) => entry.sourceLocation && typeof entry.sourceLocation === 'object')).toBe(true)
    expect(validation.status).toBe('devview-code-subgraph-validation-passed')
    expect(validation.vocabulary.allowedEdgeTypes).toContain('method')
  })

  it('imports Graphify external symbol nodes that omit source_file by using edge provenance', async () => {
    const workspace = createWorkspace()
    const sourceFile = join(workspace, 'src', 'app.ts')
    writeJson(join(workspace, 'graphify-external-symbol.json'), {
      nodes: [
        realGraphifyNode('g.file.app', 'app.ts', sourceFile, 'L1'),
        realGraphifyNode('g.fn.main', 'main()', sourceFile, 'L10'),
        {
          id: 'task',
          label: 'Task',
          file_type: 'code',
          source_location: '',
          _origin: 'ast',
        },
      ],
      links: [realGraphifyEdge('g.fn.main', 'task', 'references', sourceFile, 'L11')],
    })

    const result = await runDevViewCli(
      [
        'graph',
        'import-graphify-code-subgraph',
        '--graphify',
        'graphify-external-symbol.json',
        '--output',
        '.tmp/external-symbol-code-subgraph.json',
        '--validation-output',
        '.tmp/external-symbol-validation.json',
        '--json',
      ],
      { cwd: workspace, pluginRoot },
    )
    const payload = JSON.parse(result.stdout)
    const codeSubgraph = JSON.parse(readFileSync(join(workspace, '.tmp/external-symbol-code-subgraph.json'), 'utf8'))

    expect(result.exitCode).toBe(ExitCode.Success)
    expect(payload.importFindings.map((entry: { code: string }) => entry.code)).toContain(
      'GRAPHIFY_CODE_SUBGRAPH_NODE_SOURCE_FILE_INFERRED_FROM_EDGE',
    )
    const externalTaskNode = codeSubgraph.nodes.find(
      (entry: { sourceGraphifyNodeId?: string }) => entry.sourceGraphifyNodeId === 'task',
    )
    expect(externalTaskNode.kind).toBe('external_dependency')
    expect(externalTaskNode.sourceFile).toBe('src/app.ts')
    expect(externalTaskNode.sourceFileInferredFromGraphifyEdge).toBe(true)
    expect(externalTaskNode.sourceLocationStatus).toBe('graphify-node-source-file-inferred-from-edge-provenance')
  })

  it('blocks unsupported Graphify vocabulary with zero writes', async () => {
    const workspace = createWorkspace()
    writeJson(join(workspace, 'bad-graphify-export.json'), {
      ...graphifyExport(),
      nodes: [
        graphifyNode('g.file.todo', 'file', 'src/todo-service.ts'),
        graphifyNode('g.screen.todo', 'screen', 'src/todo-service.ts'),
      ],
      edges: [
        {
          id: 'g.edge.magic',
          source: 'g.file.todo',
          target: 'g.screen.todo',
          relation: 'magically_related',
          sourceFile: 'src/todo-service.ts',
          sourceLocationStatus: 'graphify-fixture',
        },
      ],
    })

    const result = await runDevViewCli(
      [
        'graph',
        'import-graphify-code-subgraph',
        '--graphify',
        'bad-graphify-export.json',
        '--output',
        '.tmp/bad-code-subgraph.json',
        '--validation-output',
        '.tmp/bad-validation.json',
        '--json',
      ],
      { cwd: workspace, pluginRoot },
    )
    const payload = JSON.parse(result.stderr)

    expect(result.exitCode).toBe(ExitCode.ValidationFailed)
    expect(payload.issues.map((entry: { code: string }) => entry.code)).toEqual(
      expect.arrayContaining([
        'GRAPHIFY_CODE_SUBGRAPH_NODE_KIND_UNMAPPED',
        'GRAPHIFY_CODE_SUBGRAPH_EDGE_TYPE_UNMAPPED',
      ]),
    )
    expect(existsSync(join(workspace, '.tmp/bad-code-subgraph.json'))).toBe(false)
    expect(existsSync(join(workspace, '.tmp/bad-validation.json'))).toBe(false)
  })

  it('blocks unsafe authority and executable/provider fields before writing outputs', async () => {
    const workspace = createWorkspace()
    writeJson(join(workspace, 'unsafe-graphify-export.json'), {
      ...graphifyExport(),
      graphifyExecuted: true,
      providerInvoked: true,
      nodes: [
        {
          ...graphifyNode('g.file.todo', 'file', 'src/todo-service.ts'),
          command: 'graphify live-export',
        },
      ],
      edges: [],
    })

    const result = await runDevViewCli(
      [
        'graph',
        'import-graphify-code-subgraph',
        '--graphify',
        'unsafe-graphify-export.json',
        '--output',
        '.tmp/unsafe-code-subgraph.json',
        '--validation-output',
        '.tmp/unsafe-validation.json',
        '--json',
      ],
      { cwd: workspace, pluginRoot },
    )
    const payload = JSON.parse(result.stderr)

    expect(result.exitCode).toBe(ExitCode.ValidationFailed)
    expect(payload.issues.map((entry: { code: string }) => entry.code)).toEqual(
      expect.arrayContaining([
        'GRAPHIFY_CODE_SUBGRAPH_UNSAFE_SOURCE_AUTHORITY_FLAG',
        'GRAPHIFY_CODE_SUBGRAPH_EXECUTABLE_INSTRUCTION_DECLARED',
      ]),
    )
    expect(existsSync(join(workspace, '.tmp/unsafe-code-subgraph.json'))).toBe(false)
    expect(existsSync(join(workspace, '.tmp/unsafe-validation.json'))).toBe(false)
  })

  it('blocks source overwrite, output collisions, protected paths, and source-authority-shaped outputs', async () => {
    const cases = [
      {
        output: 'graphify-export.json',
        validationOutput: '.tmp/validation.json',
        expected: 'would overwrite a source input',
      },
      {
        output: '.tmp/same.json',
        validationOutput: '.tmp/same.json',
        expected: 'must be different paths',
      },
      {
        output: join('.devview', 'generated', 'code-subgraph.json'),
        validationOutput: '.tmp/validation.json',
        expected: 'inside a protected control path',
      },
      {
        output: '.tmp/existing-code-subgraph.json',
        validationOutput: '.tmp/validation.json',
        existing: {
          artifactRole: 'devview-code-subgraph',
          status: 'devview-code-subgraph-supplied',
          nodes: [],
          edges: [],
        },
        expected: 'would overwrite a source-authority-shaped path',
      },
    ]

    for (const entry of cases) {
      const workspace = createWorkspace()
      writeJson(join(workspace, 'graphify-export.json'), graphifyExport())
      if (entry.existing) {
        writeJson(join(workspace, entry.output), entry.existing)
      }

      const result = await runDevViewCli(
        [
          'graph',
          'import-graphify-code-subgraph',
          '--graphify',
          'graphify-export.json',
          '--output',
          entry.output,
          '--validation-output',
          entry.validationOutput,
          '--json',
        ],
        { cwd: workspace, pluginRoot },
      )

      expect(result.exitCode).toBe(ExitCode.ValidationFailed)
      expect(result.stderr).toContain(entry.expected)
    }
  })
})

function graphifyExport(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    exportId: 'graphify-static-ts-fixture',
    nodes: [
      graphifyNode('g.file.todo', 'file', 'src/todo-service.ts', 'Todo service file'),
      graphifyNode('g.class.service', 'class', 'src/todo-service.ts', 'TodoService'),
      graphifyNode('g.method.add', 'method', 'src/todo-service.ts', 'TodoService.addTodo'),
      graphifyNode('g.function.normalize', 'function', 'src/todo-service.ts', 'normalizeTodo'),
      graphifyNode('g.dependency.store', 'external', 'package.json', '@fixture/todo-store'),
    ],
    edges: [
      graphifyEdge('g.edge.file-class', 'g.file.todo', 'g.class.service', 'contains', 'src/todo-service.ts'),
      graphifyEdge('g.edge.class-method', 'g.class.service', 'g.method.add', 'contains', 'src/todo-service.ts'),
      graphifyEdge('g.edge.file-imports-store', 'g.file.todo', 'g.dependency.store', 'imports', 'src/todo-service.ts'),
      graphifyEdge(
        'g.edge.add-calls-normalize',
        'g.method.add',
        'g.function.normalize',
        'calls',
        'src/todo-service.ts',
      ),
      graphifyEdge(
        'g.edge.add-references-service',
        'g.method.add',
        'g.class.service',
        'references',
        'src/todo-service.ts',
      ),
    ],
    graphifyExecuted: false,
    providerInvoked: false,
    networkCallMade: false,
    apiCallMade: false,
    shellCommandsExecuted: false,
    extensionExecutionAllowed: false,
    graphSourceMutated: false,
    graphDeltaApplied: false,
    ...overrides,
  }
}

function graphifyNode(id: string, kind: string, sourceFile: string, label = id): Record<string, unknown> {
  return {
    id,
    kind,
    label,
    sourceFile,
    sourceLocationStatus: 'graphify-fixture',
    confidence: 'extracted',
  }
}

function graphifyEdge(
  id: string,
  source: string,
  target: string,
  relation: string,
  sourceFile: string,
): Record<string, unknown> {
  return {
    id,
    source,
    target,
    relation,
    sourceFile,
    sourceLocationStatus: 'graphify-fixture',
    confidence: 'extracted',
  }
}

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
    context: relation === 'method' ? undefined : 'fixture',
    confidence: 'EXTRACTED',
    source_file: sourceFile,
    source_location: sourceLocation,
    weight: 1,
  }
}
