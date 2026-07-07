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

describe('DevView Work Journal renderer', () => {
  it('renders cumulative static journal data and HTML without authority promotion', async () => {
    const workspace = createWorkspace()
    writeWorkJournalSources(workspace)

    const result = await runDevViewCli(workJournalArgs(), { cwd: workspace, pluginRoot })
    const payload = JSON.parse(result.stdout)
    const data = JSON.parse(readFileSync(join(workspace, '.devview/generated/work-journal/index.data.json'), 'utf8'))
    const run = JSON.parse(
      readFileSync(join(workspace, '.devview/generated/work-journal/runs/todo-add/run.json'), 'utf8'),
    )
    const html = readFileSync(join(workspace, '.devview/generated/work-journal/index.html'), 'utf8')

    expect(result.exitCode).toBe(ExitCode.Success)
    expect(payload.ok).toBe(true)
    expect(payload.command).toBe('work-journal render')
    expect(payload.artifactRole).toBe('devview-work-journal-data-preview')
    expect(payload.htmlArtifactRole).toBe('devview-work-journal-html-preview')
    expect(data.artifactRole).toBe('devview-work-journal-data-preview')
    expect(data.htmlArtifactRole).toBe('devview-work-journal-html-preview')
    expect(data.currentRunId).toBe('todo-add')
    expect(data.runs).toHaveLength(1)
    expect(run.runId).toBe('todo-add')
    expect(run.status).toBe('blocked')
    expect(run.blockedReason).toContain('Runtime Evidence satisfaction readiness')
    expect(run.flow.map((step: { label: string }) => step.label)).toEqual([
      'Maintainability Graph',
      'View Tree',
      'Context Pack',
      'Instruction Pack',
      'Project Extensions',
      'Runtime Evidence',
      'Equivalence Proof',
      'Graph Delta',
      'Guarded Update',
      'Scope/CI',
    ])
    expect(run.artifacts.map((artifact: { sourceId: string }) => artifact.sourceId)).toEqual(
      expect.arrayContaining([
        'baseline',
        'maintainability-graph',
        'view-tree',
        'context-pack',
        'instruction-pack',
        'extension-readiness',
        'runtime-evidence-satisfaction',
        'equivalence-proof',
        'scope-ci',
        'graph-delta',
        'guarded-update',
      ]),
    )
    expect(run.auditProvenance.length).toBeGreaterThan(7)
    expect(data.outputPaths.htmlOutputPath).toBe('.devview/generated/work-journal/index.html')
    expect(data.safetyFlags.staticHtmlOnly).toBe(true)
    expect(data.safetyFlags.providerInvoked).toBe(false)
    expect(data.safetyFlags.networkCallMade).toBe(false)
    expect(data.safetyFlags.extensionExecutionAllowed).toBe(false)
    expect(data.safetyFlags.extensionsExecuted).toBe(false)
    expect(data.safetyFlags.shellCommandsExecuted).toBe(false)
    expect(data.safetyFlags.filesMutatedOutsideExplicitOutputs).toBe(false)
    expect(data.safetyFlags.graphSourceMutated).toBe(false)
    expect(data.safetyFlags.graphDeltaApplied).toBe(false)
    expect(data.safetyFlags.runtimeEvidenceSatisfied).toBe(false)
    expect(data.safetyFlags.evidenceAccepted).toBe(false)
    expect(data.safetyFlags.equivalenceProven).toBe(false)
    expect(data.safetyFlags.scopeEnforced).toBe(false)
    expect(data.safetyFlags.ciEnforcementEnabled).toBe(false)
    expect(data.safetyFlags.approvalAutomationEnabled).toBe(false)
    expect(data.safetyFlags.userAcceptanceAutomated).toBe(false)
    expect(data.safetyFlags.nonEnforcing).toBe(true)
    expect(html).toContain('DevView Work Journal')
    expect(html).toContain('Flow Timeline')
    expect(html).toContain('Artifacts / Audit Provenance')
    expect(html).toContain('static visualization/report artifact')
  })

  it('preserves previous Work Journal runs and replaces the current run deterministically', async () => {
    const workspace = createWorkspace()
    writeWorkJournalSources(workspace)
    writeJson(join(workspace, '.devview/generated/work-journal/index.data.json'), previousJournalData())

    const result = await runDevViewCli(workJournalArgs(), { cwd: workspace, pluginRoot })
    const data = JSON.parse(readFileSync(join(workspace, '.devview/generated/work-journal/index.data.json'), 'utf8'))
    const html = readFileSync(join(workspace, '.devview/generated/work-journal/index.html'), 'utf8')

    expect(result.exitCode).toBe(ExitCode.Success)
    expect(data.currentRunId).toBe('todo-add')
    expect(data.runs.map((run: { runId: string }) => run.runId)).toEqual(['previous-work', 'todo-add'])
    expect(data.runs[0].title).toBe('Previous DevView Work')
    expect(data.runs[1].title).toBe('Todo Add Calibration')
    expect(html).toContain('Previous DevView Work')
    expect(html).toContain('Todo Add Calibration')
  })

  it('requires --run-id before writing outputs', async () => {
    const workspace = createWorkspace()
    writeWorkJournalSources(workspace)

    const result = await runDevViewCli(
      [
        'work-journal',
        'render',
        '--baseline',
        'generated/baseline.json',
        '--output',
        '.tmp/work-journal.html',
        '--data-output',
        '.tmp/work-journal.data.json',
        '--run-output',
        '.tmp/run.json',
        '--json',
      ],
      { cwd: workspace, pluginRoot },
    )
    const payload = JSON.parse(result.stderr)

    expect(result.exitCode).toBe(ExitCode.InvalidArguments)
    expect(payload.issues[0].message).toContain('--run-id')
    expect(existsSync(join(workspace, '.tmp/work-journal.html'))).toBe(false)
  })

  it('blocks protected control output paths before writing paired outputs', async () => {
    const workspace = createWorkspace()
    writeWorkJournalSources(workspace)

    const result = await runDevViewCli(
      [
        ...workJournalArgs(
          '.devview/control/index.html',
          '.tmp/should-not-exist.json',
          '.tmp/should-not-exist-run.json',
        ),
      ],
      { cwd: workspace, pluginRoot },
    )
    const payload = JSON.parse(result.stderr)

    expect(result.exitCode).toBe(ExitCode.ValidationFailed)
    expect(payload.ok).toBe(false)
    expect(payload.issues[0].message).toContain('protected source/control path')
    expect(existsSync(join(workspace, '.tmp/should-not-exist.json'))).toBe(false)
    expect(existsSync(join(workspace, '.tmp/should-not-exist-run.json'))).toBe(false)
  })

  it('blocks source and public file output paths before writing paired outputs', async () => {
    const workspace = createWorkspace()
    writeWorkJournalSources(workspace)

    const result = await runDevViewCli(
      [...workJournalArgs('README.md', '.tmp/should-not-exist.json', '.tmp/should-not-exist-run.json')],
      { cwd: workspace, pluginRoot },
    )
    const payload = JSON.parse(result.stderr)

    expect(result.exitCode).toBe(ExitCode.ValidationFailed)
    expect(payload.ok).toBe(false)
    expect(payload.issues[0].message).toContain('protected source/control path')
    expect(existsSync(join(workspace, 'README.md'))).toBe(false)
    expect(existsSync(join(workspace, '.tmp/should-not-exist.json'))).toBe(false)
    expect(existsSync(join(workspace, '.tmp/should-not-exist-run.json'))).toBe(false)
  })

  it('blocks output collisions with zero writes', async () => {
    const workspace = createWorkspace()
    writeWorkJournalSources(workspace)

    const result = await runDevViewCli(
      [...workJournalArgs('.tmp/journal.html', '.tmp/journal.html', '.tmp/run.json')],
      { cwd: workspace, pluginRoot },
    )
    const payload = JSON.parse(result.stderr)

    expect(result.exitCode).toBe(ExitCode.ValidationFailed)
    expect(payload.issues[0].message).toContain('collides')
    expect(existsSync(join(workspace, '.tmp/journal.html'))).toBe(false)
    expect(existsSync(join(workspace, '.tmp/run.json'))).toBe(false)
  })

  it('blocks overwriting source artifacts with zero writes', async () => {
    const workspace = createWorkspace()
    writeWorkJournalSources(workspace)
    const baselinePath = join(workspace, 'generated/baseline.json')
    const before = readFileSync(baselinePath, 'utf8')

    const result = await runDevViewCli(
      [...workJournalArgs('generated/baseline.json', '.tmp/should-not-exist.json', '.tmp/should-not-exist-run.json')],
      { cwd: workspace, pluginRoot },
    )
    const payload = JSON.parse(result.stderr)

    expect(result.exitCode).toBe(ExitCode.ValidationFailed)
    expect(payload.issues[0].message).toContain('would overwrite source DevView baseline freeze')
    expect(readFileSync(baselinePath, 'utf8')).toBe(before)
    expect(existsSync(join(workspace, '.tmp/should-not-exist.json'))).toBe(false)
  })

  it('blocks unsafe true authority fields in source artifacts with zero writes', async () => {
    const workspace = createWorkspace()
    writeWorkJournalSources(workspace)
    const unsafeRuntimeSatisfied = Boolean(1)
    writeJson(join(workspace, 'generated/baseline.json'), {
      artifactRole: 'devview-core-baseline-freeze',
      status: 'devview-core-baseline-freeze-reported',
      runtimeEvidenceSatisfied: unsafeRuntimeSatisfied,
    })

    const result = await runDevViewCli(
      [...workJournalArgs('.tmp/journal.html', '.tmp/journal.data.json', '.tmp/run.json')],
      {
        cwd: workspace,
        pluginRoot,
      },
    )
    const payload = JSON.parse(result.stderr)

    expect(result.exitCode).toBe(ExitCode.ValidationFailed)
    expect(payload.issues[0].message).toContain('unsafe true authority field runtimeEvidenceSatisfied')
    expect(existsSync(join(workspace, '.tmp/journal.html'))).toBe(false)
    expect(existsSync(join(workspace, '.tmp/journal.data.json'))).toBe(false)
    expect(existsSync(join(workspace, '.tmp/run.json'))).toBe(false)
  })
})

function workJournalArgs(
  output = '.devview/generated/work-journal/index.html',
  dataOutput = '.devview/generated/work-journal/index.data.json',
  runOutput = '.devview/generated/work-journal/runs/todo-add/run.json',
): string[] {
  return [
    'work-journal',
    'render',
    '--run-id',
    'todo-add',
    '--title',
    'Todo Add Calibration',
    '--baseline',
    'generated/baseline.json',
    '--graph-source',
    'generated/maintainability-graph.json',
    '--view-tree',
    'generated/view-tree.json',
    '--contract-input',
    'generated/context-pack.json',
    '--instruction-pack',
    'generated/instruction-pack.json',
    '--extension-readiness',
    'generated/extension-readiness.json',
    '--runtime-evidence-satisfaction-readiness',
    'generated/runtime-readiness.json',
    '--equivalence-proof-readiness',
    'generated/equivalence-readiness.json',
    '--scope-ci-enforcement-readiness',
    'generated/scope-ci-readiness.json',
    '--proposal',
    'generated/graph-delta-proposal.json',
    '--apply-report',
    'generated/apply-report.json',
    '--output',
    output,
    '--data-output',
    dataOutput,
    '--run-output',
    runOutput,
    '--json',
  ]
}

function writeWorkJournalSources(workspace: string): void {
  writeJson(join(workspace, 'generated/baseline.json'), {
    artifactRole: 'devview-core-baseline-freeze',
    status: 'devview-core-baseline-freeze-reported',
    baselineCompletenessStatus: 'complete',
    runtimeEvidenceSatisfied: false,
    evidenceAccepted: false,
    equivalenceProven: false,
    scopeEnforced: false,
    ciEnforcementEnabled: false,
    graphSourceMutated: false,
    graphDeltaApplied: false,
  })
  writeJson(join(workspace, 'generated/maintainability-graph.json'), {
    artifactRole: 'devview-maintainability-graph-source',
    sourceRecords: [],
  })
  writeJson(join(workspace, 'generated/view-tree.json'), {
    artifactRole: 'devview-view-tree-preview',
    status: 'devview-view-tree-generated',
    includedNodeIds: ['todo.add'],
  })
  writeJson(join(workspace, 'generated/context-pack.json'), {
    artifactRole: 'contract-compiler-input-preview',
    status: 'contract-compiler-input-generated',
    boundedSubgraph: { nodeIds: ['todo.add'] },
  })
  writeJson(join(workspace, 'generated/instruction-pack.json'), {
    artifactRole: 'instruction-pack-preview',
    status: 'instruction-pack-generated',
  })
  writeJson(join(workspace, 'generated/extension-readiness.json'), {
    artifactRole: 'devview-extension-readiness-preview',
    status: 'devview-extension-readiness-ready',
    extensionExecutionAllowed: false,
    extensionsExecuted: false,
    providerInvoked: false,
    networkCallMade: false,
  })
  writeJson(join(workspace, 'generated/runtime-readiness.json'), {
    artifactRole: 'devview-runtime-evidence-satisfaction-readiness-preview',
    status: 'devview-runtime-evidence-satisfaction-readiness-blocked',
    runtimeEvidenceSatisfactionReadinessStatus: 'blocked-required-obligation-mismatch',
    sourceAcceptedEvidenceAccepted: true,
    evidenceAccepted: false,
    runtimeEvidenceSatisfied: false,
    equivalenceProven: false,
    scopeEnforced: false,
    ciEnforcementEnabled: false,
    graphSourceMutated: false,
    graphDeltaApplied: false,
    nonEnforcing: true,
  })
  writeJson(join(workspace, 'generated/equivalence-readiness.json'), {
    artifactRole: 'devview-equivalence-proof-readiness-preview',
    status: 'devview-equivalence-proof-readiness-blocked',
    equivalenceProofReadinessStatus: 'blocked-runtime-evidence-satisfaction-readiness-not-ready',
    evidenceAccepted: false,
    runtimeEvidenceSatisfied: false,
    equivalenceProven: false,
    scopeEnforced: false,
    ciEnforcementEnabled: false,
    nonEnforcing: true,
  })
  writeJson(join(workspace, 'generated/scope-ci-readiness.json'), {
    artifactRole: 'devview-scope-ci-enforcement-readiness-preview',
    status: 'devview-scope-ci-enforcement-readiness-blocked',
    scopeCiEnforcementReadinessStatus: 'blocked-equivalence-proof-readiness-not-ready',
    evidenceAccepted: false,
    runtimeEvidenceSatisfied: false,
    equivalenceProven: false,
    scopeEnforced: false,
    ciEnforcementEnabled: false,
    nonEnforcing: true,
  })
  writeJson(join(workspace, 'generated/graph-delta-proposal.json'), {
    artifactRole: 'graph-delta-proposal-only-preview',
    status: 'graph-delta-proposal-previewed',
  })
  writeJson(join(workspace, 'generated/apply-report.json'), {
    artifactRole: 'devview-graph-delta-apply-report',
    status: 'devview-graph-delta-apply-blocked',
    applyStatus: 'blocked-no-concrete-mutation-operations',
    graphSourceMutated: false,
    graphDeltaApplied: false,
  })
}

function previousJournalData(): unknown {
  return {
    schemaVersion: 1,
    artifactRole: 'devview-work-journal-data-preview',
    htmlArtifactRole: 'devview-work-journal-html-preview',
    status: 'devview-work-journal-data-generated',
    journalScope: 'cumulative-static-work-journal-preview',
    currentRunId: 'previous-work',
    runs: [
      {
        runId: 'previous-work',
        title: 'Previous DevView Work',
        status: 'ready-for-review',
        nextAction: 'Review prior work.',
        blockedReason: null,
        flow: [],
        artifacts: [],
        auditProvenance: [],
      },
      {
        runId: 'todo-add',
        title: 'Stale Todo Add Calibration',
        status: 'advisory',
        nextAction: 'This run should be replaced.',
        blockedReason: null,
        flow: [],
        artifacts: [],
        auditProvenance: [],
      },
    ],
    safetyFlags: {
      staticHtmlOnly: true,
      providerInvoked: false,
      networkCallMade: false,
      extensionExecutionAllowed: false,
      extensionsExecuted: false,
      shellCommandsExecuted: false,
      filesMutatedOutsideExplicitOutputs: false,
      graphSourceMutated: false,
      graphDeltaApplied: false,
      runtimeEvidenceSatisfied: false,
      evidenceAccepted: false,
      equivalenceProven: false,
      scopeEnforced: false,
      ciEnforcementEnabled: false,
      approvalAutomationEnabled: false,
      userAcceptanceAutomated: false,
      nonEnforcing: true,
    },
    outputPaths: {
      htmlOutputPath: '.devview/generated/work-journal/index.html',
      dataOutputPath: '.devview/generated/work-journal/index.data.json',
      runOutputPath: '.devview/generated/work-journal/runs/previous-work/run.json',
    },
    nonExecutionBoundary: 'Static previous journal.',
  }
}
