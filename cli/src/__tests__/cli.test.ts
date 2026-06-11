import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { runPbeCli } from '../app'
import { ExitCode } from '../core/types'

const pluginRoot = resolve(process.cwd())
const tempRoots: string[] = []

afterEach(() => {
  for (const root of tempRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true })
  }
})

describe('PBE CLI', () => {
  it('prints help', async () => {
    const result = await runPbeCli(['--help'], { cwd: pluginRoot, pluginRoot })

    expect(result.exitCode).toBe(ExitCode.Success)
    expect(result.stdout).toContain('Project Blueprint Engine CLI')
    expect(result.stdout).toContain('rpd close')
  })

  it('reports status as not initialized when .pbe is missing', async () => {
    const workspace = createWorkspace()

    const result = await runPbeCli(['status', '--json'], { cwd: workspace, pluginRoot })

    expect(result.exitCode).toBe(ExitCode.NotInitialized)
    const payload = JSON.parse(result.stderr)
    expect(payload.ok).toBe(false)
    expect(payload.issues[0].code).toBe('PBE_NOT_INITIALIZED')
  })

  it('initializes .pbe artifacts without overwriting existing files', async () => {
    const workspace = createWorkspace()

    const init = await runPbeCli(['init', '--profile', 'full', '--brief', 'Build a printer setup flow', '--json'], {
      cwd: workspace,
      pluginRoot,
    })
    const secondInit = await runPbeCli(['init', '--profile', 'full', '--brief', 'Changed brief', '--json'], {
      cwd: workspace,
      pluginRoot,
    })
    const status = await runPbeCli(['status', '--json'], { cwd: workspace, pluginRoot })

    expect(init.exitCode).toBe(ExitCode.Success)
    expect(JSON.parse(init.stdout).created).toContain('.pbe/tree/product-tree.json')
    expect(secondInit.exitCode).toBe(ExitCode.Success)
    expect(JSON.parse(secondInit.stdout).skipped).toContain('.pbe/tree/product-tree.json')
    expect(status.exitCode).toBe(ExitCode.Success)
    expect(JSON.parse(status.stdout).state).toBe('STARTED')
  })

  it('blocks WPD gate before RPD can close', async () => {
    const workspace = createWorkspace()
    await runPbeCli(['init', '--brief', 'Make the UI clean'], { cwd: workspace, pluginRoot })

    const result = await runPbeCli(['gate', 'wpd', '--json'], { cwd: workspace, pluginRoot })

    expect(result.exitCode).toBe(ExitCode.TransitionBlocked)
    const payload = JSON.parse(result.stderr)
    expect(payload.issues.map((entry: { code: string }) => entry.code)).toContain('ROOT_NOT_CONFIRMED_BY_USER')
  })

  it('rejects RPD close when selected Product has unresolved abstract quality terms', async () => {
    const workspace = createWorkspace()
    writeMinimalPbe(workspace, {
      productTitle: '화면을 깔끔하게 만든다',
      ambiguityResolved: false,
      includeAcceptanceCriteria: true,
      rootUserConfirmed: true,
    })

    const result = await runPbeCli(['rpd', 'close', '--json'], { cwd: workspace, pluginRoot })

    expect(result.exitCode).toBe(ExitCode.ValidationFailed)
    const payload = JSON.parse(result.stderr)
    expect(payload.issues.map((entry: { code: string }) => entry.code)).toContain('ABSTRACT_QUALITY_TERM')
  })

  it('closes RPD and updates state when root and leaf are user-confirmed', async () => {
    const workspace = createWorkspace()
    writeMinimalPbe(workspace, {
      productTitle: 'Show connected status',
      ambiguityResolved: true,
      includeAcceptanceCriteria: true,
      rootUserConfirmed: true,
    })

    const result = await runPbeCli(['rpd', 'close', '--json'], { cwd: workspace, pluginRoot })
    const status = await runPbeCli(['status', '--json'], { cwd: workspace, pluginRoot })

    expect(result.exitCode).toBe(ExitCode.Success)
    expect(JSON.parse(result.stdout).state).toBe('RPD_DONE')
    expect(JSON.parse(status.stdout).state).toBe('RPD_DONE')
  })

  it('blocks accept gate without user approval', async () => {
    const workspace = createWorkspace()
    writeMinimalPbe(workspace, {
      productTitle: 'Show connected status',
      ambiguityResolved: true,
      includeAcceptanceCriteria: true,
      rootUserConfirmed: true,
      acceptedByAssistant: true,
    })

    const result = await runPbeCli(['gate', 'accept', '--json'], { cwd: workspace, pluginRoot })

    expect(result.exitCode).toBe(ExitCode.TransitionBlocked)
    const payload = JSON.parse(result.stderr)
    expect(payload.issues.map((entry: { code: string }) => entry.code)).toContain('ASSISTANT_ACCEPTED_STATUS')
    expect(payload.issues.map((entry: { code: string }) => entry.code)).toContain('USER_APPROVAL_REQUIRED')
  })
})

function createWorkspace(): string {
  const workspace = mkdtempSync(join(tmpdir(), 'pbe-cli-'))
  tempRoots.push(workspace)
  return workspace
}

function writeMinimalPbe(
  workspace: string,
  options: {
    productTitle: string
    ambiguityResolved: boolean
    includeAcceptanceCriteria: boolean
    rootUserConfirmed: boolean
    acceptedByAssistant?: boolean
  },
) {
  const productStatus = options.acceptedByAssistant ? 'accepted' : 'confirmed'
  writeJson(join(workspace, '.pbe', 'tree', 'product-tree.json'), {
    version: '0.2.0-tree-control',
    rootNodeId: 'PT-ROOT',
    nodes: [
      {
        id: 'PT-ROOT',
        type: 'goal',
        title: options.productTitle,
        status: productStatus,
        parent: null,
        children: [],
        source: options.rootUserConfirmed ? { actor: options.acceptedByAssistant ? 'assistant' : 'user', type: 'user_interview' } : {},
        why: '',
        scopeClass: 'selected',
        acceptance: [],
        acceptanceCriteria: options.includeAcceptanceCriteria
          ? [
              {
                id: 'AC-PT-ROOT-1',
                format: 'EARS',
                type: 'event_driven',
                condition: 'The status changes',
                systemResponse: 'The system shows the updated status text',
                statement: 'WHEN the status changes, THE SYSTEM SHALL show the updated status text.',
                status: 'confirmed',
                source: {
                  type: 'user_interview',
                  sourceNodeId: 'PT-ROOT',
                },
                verification: {
                  required: true,
                  suggestedTestNodeIds: [],
                  evidenceTypes: ['test_log'],
                },
              },
            ]
          : [],
        ambiguity: {
          status: options.ambiguityResolved ? 'clear' : 'partial',
          type: options.ambiguityResolved ? 'none' : 'abstract_quality',
          terms: options.ambiguityResolved ? [] : ['깔끔하게'],
          missing: options.ambiguityResolved ? [] : ['completion_criteria'],
        },
        ambiguityResolution: {
          status: options.ambiguityResolved ? 'resolved' : 'pending',
          resolvedTerms: options.ambiguityResolved ? ['status text is observable'] : [],
        },
        derivedTo: [],
        evidence: [],
      },
    ],
  })
  writeJson(join(workspace, '.pbe', 'blueprint', 'requirement-tree.json'), {
    schemaVersion: 1,
    rootNodeId: 'req-root',
    traversal: 'breadth_first',
    nodes: [
      {
        id: 'req-root',
        parentId: null,
        title: options.productTitle,
        summary: options.productTitle,
        status: 'confirmed',
        depth: 0,
        children: [],
        facts: [],
        openQuestions: [],
        decisions: [],
        scope: [],
        nonScope: [],
      },
    ],
  })
  writeJson(join(workspace, '.pbe', 'control', 'decision-queue.json'), {
    version: '0.2.0-tree-control',
    decisions: [],
  })
  writeJson(join(workspace, '.pbe', 'control', 'acceptance-tree.json'), {
    version: '0.2.0-tree-control',
    branches: options.acceptedByAssistant
      ? [
          {
            productNodeId: 'PT-ROOT',
            status: 'accepted_done',
            decisionSource: {
              actor: 'assistant',
            },
            evidenceNodeIds: [],
          },
        ]
      : [],
  })
  writeJson(join(workspace, '.pbe', 'blueprint', 'pbe-state.json'), {
    version: '0.2.0-alpha',
    autoflow: {
      enabled: true,
      profile: 'full',
      state: 'RPD_IN_PROGRESS',
      completedSteps: ['start'],
      currentGate: null,
      nextStep: 'rpd',
      lastUserAction: options.acceptedByAssistant ? { actor: 'assistant' } : { actor: 'user' },
    },
    artifacts: {
      productTree: '.pbe/tree/product-tree.json',
      decisionQueue: '.pbe/control/decision-queue.json',
      acceptanceTree: '.pbe/control/acceptance-tree.json',
      requirementTree: '.pbe/blueprint/requirement-tree.json',
    },
    deliveryStatus: options.acceptedByAssistant ? 'accepted' : 'waiting_root_confirmation',
  })
}

function writeJson(file: string, value: unknown) {
  mkdirSync(resolve(file, '..'), { recursive: true })
  writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
}
