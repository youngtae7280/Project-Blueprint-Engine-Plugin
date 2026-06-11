import { execFileSync } from 'node:child_process'
import { cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

const tempRoots: string[] = []

afterEach(() => {
  for (const root of tempRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true })
  }
})

describe('PBE v2 tree validator', () => {
  it('passes when only schemas and templates are present', () => {
    const workspace = createTreeValidatorWorkspace()

    const result = runTreeValidator(workspace)

    expect(result.status).toBe(0)
    expect(result.output).toContain('No .pbe tree artifacts found')
  })

  it('accepts a minimal linked Product and Work tree', () => {
    const workspace = createTreeValidatorWorkspace()
    writeProductTree(workspace)
    writeWorkTree(workspace, 'PT-1')

    const result = runTreeValidator(workspace)

    expect(result.status).toBe(0)
    expect(result.output).toContain('Validated 2 .pbe tree artifact')
  })

  it('rejects Work nodes that do not derive from known Product nodes', () => {
    const workspace = createTreeValidatorWorkspace()
    writeProductTree(workspace)
    writeWorkTree(workspace, 'PT-MISSING')

    const result = runTreeValidator(workspace)

    expect(result.status).toBe(1)
    expect(result.output).toContain('references missing product source')
  })
})

function createTreeValidatorWorkspace() {
  const workspace = mkdtempSync(join(tmpdir(), 'pbe-tree-validator-'))
  tempRoots.push(workspace)

  for (const entry of ['schemas', 'templates']) {
    cpSync(resolve(process.cwd(), entry), join(workspace, entry), { recursive: true })
  }

  return workspace
}

function runTreeValidator(workspace: string) {
  try {
    const output = execFileSync(
      process.execPath,
      [resolve(process.cwd(), 'scripts/validate-pbe-tree-system.js')],
      {
        cwd: workspace,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
      },
    )
    return { status: 0, output }
  } catch (error) {
    const failure = error as { status?: number; stdout?: Buffer; stderr?: Buffer }
    return {
      status: failure.status ?? 1,
      output: `${failure.stdout?.toString() || ''}${failure.stderr?.toString() || ''}`,
    }
  }
}

function writeProductTree(workspace: string) {
  writeJson(join(workspace, '.pbe', 'tree', 'product-tree.json'), {
    version: '0.2.0-tree-control',
    rootNodeId: 'PT-ROOT',
    nodes: [
      {
        id: 'PT-ROOT',
        type: 'goal',
        title: 'Product root',
        status: 'accepted',
        parent: null,
        children: ['PT-1'],
      },
      {
        id: 'PT-1',
        type: 'capability',
        title: 'Example capability',
        status: 'accepted',
        parent: 'PT-ROOT',
        children: [],
        scopeClass: 'selected',
      },
    ],
  })
}

function writeWorkTree(workspace: string, productNodeId: string) {
  writeJson(join(workspace, '.pbe', 'tree', 'work-tree.json'), {
    version: '0.2.0-tree-control',
    rootNodeId: 'WT-ROOT',
    nodes: [
      {
        id: 'WT-ROOT',
        type: 'foundation_task',
        title: 'Work root',
        status: 'ready',
        derivedFromProductNodeIds: [],
        derivedFromProjectNodeIds: [],
        scopeClass: 'foundation',
      },
      {
        id: 'WT-1',
        type: 'feature_task',
        title: 'Implement capability',
        status: 'ready',
        derivedFromProductNodeIds: [productNodeId],
        derivedFromProjectNodeIds: [],
        scopeClass: 'selected',
        expectedFiles: ['src/example.ts'],
        expectedSharedFiles: [],
        forbiddenFiles: [],
        unknownFileTouchRisk: false,
        dependencies: [],
        doneCriteria: ['Capability implemented'],
        validationHints: ['Run focused tests'],
      },
    ],
    edges: [],
  })
}

function writeJson(file: string, value: unknown) {
  mkdirSync(resolve(file, '..'), { recursive: true })
  writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
}
