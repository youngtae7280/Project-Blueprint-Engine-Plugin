import { existsSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { runDevViewCli } from '../app'
import { ExitCode } from '../core/types'
import { cleanupWorkspaces, createWorkspace, writeJson, writeText } from './fixtures/workspace'

const pluginRoot = resolve(process.cwd())

afterEach(() => {
  cleanupWorkspaces()
})

describe('graph extract-code-subgraph CLI', () => {
  it('extracts JS/TS file, class, function, method, import, and safe call facts into a validated code subgraph', async () => {
    const workspace = createWorkspace()
    writeFixtureProject(workspace)

    const result = await runDevViewCli(
      [
        'graph',
        'extract-code-subgraph',
        '--target-repo',
        'target',
        '--include',
        'src/**/*.ts',
        '--output',
        '.tmp/native-code-subgraph.json',
        '--validation-output',
        '.tmp/native-code-subgraph-validation.json',
        '--markdown',
        '.tmp/native-code-subgraph.md',
        '--json',
      ],
      { cwd: workspace, pluginRoot },
    )
    const payload = JSON.parse(result.stdout)
    const codeSubgraph = JSON.parse(readFileSync(join(workspace, '.tmp/native-code-subgraph.json'), 'utf8'))
    const validation = JSON.parse(readFileSync(join(workspace, '.tmp/native-code-subgraph-validation.json'), 'utf8'))

    expect(result.exitCode).toBe(ExitCode.Success)
    expect(payload.artifactRole).toBe('devview-native-code-subgraph-extraction-report')
    expect(payload.status).toBe('devview-native-code-subgraph-extraction-passed')
    expect(payload.extractionSummary.fileNodeCount).toBe(3)
    expect(payload.extractionSummary.classNodeCount).toBe(1)
    expect(payload.extractionSummary.functionNodeCount).toBeGreaterThanOrEqual(2)
    expect(payload.extractionSummary.methodNodeCount).toBe(1)
    expect(payload.extractionSummary.importEdgeCount).toBeGreaterThanOrEqual(2)
    expect(payload.extractionSummary.callEdgeCount).toBeGreaterThanOrEqual(1)
    expectSafetyFalse(payload)

    expect(codeSubgraph.artifactRole).toBe('devview-code-subgraph')
    expect(codeSubgraph.status).toBe('devview-code-subgraph-supplied')
    expect(codeSubgraph.scope).toBe('code-subgraph-source-fact-only')
    expect(codeSubgraph.nodes.map((entry: { kind: string }) => entry.kind)).toEqual(
      expect.arrayContaining(['file', 'class', 'function', 'method', 'external_dependency']),
    )
    expect(codeSubgraph.edges.map((entry: { kind: string }) => entry.kind)).toEqual(
      expect.arrayContaining(['contains', 'imports', 'calls']),
    )
    expect(codeSubgraph.nodes.every((entry: { sourceFile?: string }) => Boolean(entry.sourceFile))).toBe(true)
    expect(
      codeSubgraph.edges.every((entry: { sourceLocation?: unknown; sourceLocationStatus?: string }) =>
        Boolean(entry.sourceLocation ?? entry.sourceLocationStatus),
      ),
    ).toBe(true)
    expect(codeSubgraph.nodes.every((entry: { confidence?: string }) => Boolean(entry.confidence))).toBe(true)
    expect(codeSubgraph.edges.every((entry: { confidence?: string }) => Boolean(entry.confidence))).toBe(true)
    expect(validation.status).toBe('devview-code-subgraph-validation-passed')
    expect(existsSync(join(workspace, '.tmp/native-code-subgraph.md'))).toBe(true)

    const revalidation = await runDevViewCli(
      [
        'graph',
        'validate-code-subgraph',
        '--code-subgraph',
        '.tmp/native-code-subgraph.json',
        '--output',
        '.tmp/native-code-subgraph-revalidation.json',
        '--json',
      ],
      { cwd: workspace, pluginRoot },
    )
    expect(revalidation.exitCode).toBe(ExitCode.Success)
  })

  it('respects include filtering and reports unsupported included extensions as limitations', async () => {
    const workspace = createWorkspace()
    writeFixtureProject(workspace)
    writeText(join(workspace, 'target/src/notes.py'), 'def helper(): pass\n')
    writeText(join(workspace, 'target/scripts/excluded.ts'), 'export function outside() { return true }\n')

    const result = await runDevViewCli(
      [
        'graph',
        'extract-code-subgraph',
        '--target-repo',
        'target',
        '--include',
        'src/**/*',
        '--output',
        '.tmp/include-code-subgraph.json',
        '--validation-output',
        '.tmp/include-validation.json',
        '--json',
      ],
      { cwd: workspace, pluginRoot },
    )
    const payload = JSON.parse(result.stdout)
    const codeSubgraph = JSON.parse(readFileSync(join(workspace, '.tmp/include-code-subgraph.json'), 'utf8'))

    expect(result.exitCode).toBe(ExitCode.Success)
    expect(payload.extractionSummary.unsupportedExtensions['.py']).toBe(1)
    expect(payload.extractionFindings.map((entry: { code: string }) => entry.code)).toContain(
      'NATIVE_CODE_SUBGRAPH_UNSUPPORTED_EXTENSIONS',
    )
    expect(codeSubgraph.nodes.some((entry: { sourceFile: string }) => entry.sourceFile === 'scripts/excluded.ts')).toBe(
      false,
    )
  })

  it('skips ambiguous call edges deterministically instead of guessing', async () => {
    const workspace = createWorkspace()
    writeText(
      join(workspace, 'target/src/ambiguous.ts'),
      [
        'export function duplicate() { return 1 }',
        'export const duplicate = () => { return 2 }',
        'export function caller() { return duplicate() }',
        '',
      ].join('\n'),
    )

    const result = await runDevViewCli(
      [
        'graph',
        'extract-code-subgraph',
        '--target-repo',
        'target',
        '--include',
        'src/**/*.ts',
        '--output',
        '.tmp/ambiguous-code-subgraph.json',
        '--validation-output',
        '.tmp/ambiguous-validation.json',
        '--json',
      ],
      { cwd: workspace, pluginRoot },
    )
    const payload = JSON.parse(result.stdout)

    expect(result.exitCode).toBe(ExitCode.Success)
    expect(payload.extractionSummary.ambiguousCallNames).toContain('duplicate')
    expect(payload.extractionFindings.map((entry: { code: string }) => entry.code)).toContain(
      'NATIVE_CODE_SUBGRAPH_AMBIGUOUS_CALLS_SKIPPED',
    )
  })

  it('blocks output collisions, protected paths, included source overwrite, and source-authority-shaped outputs', async () => {
    const cases = [
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
        output: join('target', 'src', 'todo-service.ts'),
        validationOutput: '.tmp/validation.json',
        expected: 'would overwrite an included source file',
      },
      {
        output: '.tmp/graph-source-code-subgraph.json',
        validationOutput: '.tmp/validation.json',
        expected: 'would overwrite a source-authority-shaped path',
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
      writeFixtureProject(workspace)
      if (entry.existing) {
        writeJson(join(workspace, entry.output), entry.existing)
      }

      const result = await runDevViewCli(
        [
          'graph',
          'extract-code-subgraph',
          '--target-repo',
          'target',
          '--include',
          'src/**/*.ts',
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
      if (!entry.output.endsWith('todo-service.ts')) {
        expect(existsSync(join(workspace, entry.output))).toBe(Boolean(entry.existing))
      }
    }
  })

  it('produces deterministic code subgraph output across repeated runs', async () => {
    const workspace = createWorkspace()
    writeFixtureProject(workspace)

    const first = await runExtract(workspace, '.tmp/first-code-subgraph.json', '.tmp/first-validation.json')
    const second = await runExtract(workspace, '.tmp/second-code-subgraph.json', '.tmp/second-validation.json')
    const firstCodeSubgraph = JSON.parse(readFileSync(join(workspace, '.tmp/first-code-subgraph.json'), 'utf8'))
    const secondCodeSubgraph = JSON.parse(readFileSync(join(workspace, '.tmp/second-code-subgraph.json'), 'utf8'))

    expect(first.exitCode).toBe(ExitCode.Success)
    expect(second.exitCode).toBe(ExitCode.Success)
    expect(secondCodeSubgraph).toEqual(firstCodeSubgraph)
  })
})

async function runExtract(workspace: string, output: string, validationOutput: string) {
  return await runDevViewCli(
    [
      'graph',
      'extract-code-subgraph',
      '--target-repo',
      'target',
      '--include',
      'src/**/*.ts',
      '--output',
      output,
      '--validation-output',
      validationOutput,
      '--json',
    ],
    { cwd: workspace, pluginRoot },
  )
}

function writeFixtureProject(workspace: string): void {
  writeText(
    join(workspace, 'target/src/todo-service.ts'),
    [
      "import { saveTodo } from './todo-store'",
      "import externalThing from 'external-lib'",
      '',
      'export class TodoService {',
      '  addTodo(label: string) {',
      '    const normalized = normalizeTodo(label)',
      '    saveTodo(normalized)',
      '    return externalThing(normalized)',
      '  }',
      '}',
      '',
      'export function normalizeTodo(label: string) {',
      '  return label.trim()',
      '}',
      '',
    ].join('\n'),
  )
  writeText(
    join(workspace, 'target/src/todo-store.ts'),
    ['export function saveTodo(label: string) {', '  return label', '}', ''].join('\n'),
  )
  writeText(join(workspace, 'target/src/unused.ts'), 'export const unused = () => { return true }\n')
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
