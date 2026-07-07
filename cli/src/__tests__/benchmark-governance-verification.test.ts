import { existsSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { runDevViewCli } from '../app'
import { ExitCode } from '../core/types'
import { cleanupWorkspaces, createWorkspace, writeJson } from './fixtures/workspace'

const pluginRoot = resolve(process.cwd())
const benchmarkFixtureRoot = join(pluginRoot, 'cli/src/__tests__/fixtures/benchmarks')

afterEach(() => {
  cleanupWorkspaces()
})

describe('benchmark verify-governance CLI', () => {
  it('verifies a valid suite lock and reports partial governance without a policy', async () => {
    const workspace = createWorkspace()
    const suiteLock = await createNativeSuiteLock(workspace)

    const result = await runDevViewCli(
      [
        'benchmark',
        'verify-governance',
        '--suite-lock',
        suiteLock,
        '--output',
        '.tmp/native-governance-verification.json',
        '--markdown',
        '.tmp/native-governance-verification.md',
        '--json',
      ],
      { cwd: workspace, pluginRoot },
    )
    const payload = JSON.parse(result.stdout)
    const written = JSON.parse(readFileSync(join(workspace, '.tmp/native-governance-verification.json'), 'utf8'))

    expect(result.exitCode).toBe(ExitCode.Success)
    expect(payload.artifactRole).toBe('devview-benchmark-governance-verification-report')
    expect(payload.status).toBe('devview-benchmark-governance-partial')
    expect(payload.enterpriseClaimReadiness).toBe('partial')
    expect(payload.sourceSuiteLock.status).toBe('devview-benchmark-suite-locked')
    expect(payload.sourceDigestVerificationSummary.combinedDigestMatches).toBe(true)
    expect(payload.versionVerification.evaluatorVersionStatus).toBe('not-required')
    expect(payload.versionVerification.scoringRubricVersionStatus).toBe('not-required')
    expect(payload.governanceFindings.map((entry: { code: string }) => entry.code)).toEqual(
      expect.arrayContaining([
        'BENCHMARK_GOVERNANCE_POLICY_NOT_SUPPLIED',
        'BENCHMARK_GOVERNANCE_GOLDEN_REVIEW_INCOMPLETE',
        'BENCHMARK_GOVERNANCE_HELD_OUT_POLICY_INCOMPLETE',
      ]),
    )
    expect(written.writtenMarkdownPath).toBe('.tmp/native-governance-verification.md')
    expect(existsSync(join(workspace, '.tmp/native-governance-verification.md'))).toBe(true)
    expectSafetyFalse(payload)
  })

  it('passes version checks with a minimal governance policy', async () => {
    const workspace = createWorkspace()
    const suiteLock = await createNativeSuiteLock(workspace)
    writeJson(join(workspace, '.tmp/governance-policy.json'), governancePolicy())

    const result = await runDevViewCli(
      [
        'benchmark',
        'verify-governance',
        '--suite-lock',
        suiteLock,
        '--governance-policy',
        '.tmp/governance-policy.json',
        '--output',
        '.tmp/governance-policy-verification.json',
        '--json',
      ],
      { cwd: workspace, pluginRoot },
    )
    const payload = JSON.parse(result.stdout)

    expect(result.exitCode).toBe(ExitCode.Success)
    expect(payload.status).toBe('devview-benchmark-governance-verified')
    expect(payload.enterpriseClaimReadiness).toBe('verified-for-static-benchmark-only')
    expect(payload.versionVerification.evaluatorVersionStatus).toBe('matched')
    expect(payload.versionVerification.scoringRubricVersionStatus).toBe('matched')
    expect(payload.governanceFindings).toEqual([])
    expectSafetyFalse(payload)
  })

  it('reports not-ready when policy requires golden review and held-out metadata absent from the lock', async () => {
    const workspace = createWorkspace()
    const suiteLock = await createNativeSuiteLock(workspace)
    writeJson(
      join(workspace, '.tmp/strict-governance-policy.json'),
      governancePolicy({
        requireGoldenReviewMetadata: true,
        requireHeldOutPolicy: true,
        requireGraphifyImportValidationForGraphifyArms: true,
        requiredComparisonArms: ['codex-only', 'codex-graphify', 'codex-devview', 'codex-graphify-devview'],
        requiredProjectModes: ['native'],
      }),
    )

    const result = await runDevViewCli(
      [
        'benchmark',
        'verify-governance',
        '--suite-lock',
        suiteLock,
        '--governance-policy',
        '.tmp/strict-governance-policy.json',
        '--output',
        '.tmp/strict-governance-verification.json',
        '--json',
      ],
      { cwd: workspace, pluginRoot },
    )
    const payload = JSON.parse(result.stdout)

    expect(result.exitCode).toBe(ExitCode.Success)
    expect(payload.status).toBe('devview-benchmark-governance-partial')
    expect(payload.enterpriseClaimReadiness).toBe('not-ready')
    expect(payload.graphifyImportGovernanceCheck.status).toBe('present')
    expect(payload.governanceFindings.map((entry: { code: string }) => entry.code)).toEqual(
      expect.arrayContaining([
        'BENCHMARK_GOVERNANCE_GOLDEN_REVIEW_REQUIRED',
        'BENCHMARK_GOVERNANCE_HELD_OUT_POLICY_REQUIRED',
      ]),
    )
    expectSafetyFalse(payload)
  })

  it('blocks wrong lock role/status and unsafe source flags with zero writes', async () => {
    const workspace = createWorkspace()
    const suiteLock = await createNativeSuiteLock(workspace)
    const lockPayload = JSON.parse(readFileSync(join(workspace, suiteLock), 'utf8'))
    const unsafeFlag = 'graphifyExecuted'
    writeJson(join(workspace, '.tmp/bad-lock.json'), { ...lockPayload, status: 'wrong' })
    writeJson(join(workspace, '.tmp/unsafe-lock.json'), { ...lockPayload, [unsafeFlag]: true })

    const badRole = await runDevViewCli(
      [
        'benchmark',
        'verify-governance',
        '--suite-lock',
        '.tmp/bad-lock.json',
        '--output',
        '.tmp/bad-role-verification.json',
        '--json',
      ],
      { cwd: workspace, pluginRoot },
    )
    const unsafe = await runDevViewCli(
      [
        'benchmark',
        'verify-governance',
        '--suite-lock',
        '.tmp/unsafe-lock.json',
        '--output',
        '.tmp/unsafe-verification.json',
        '--json',
      ],
      { cwd: workspace, pluginRoot },
    )

    expect(badRole.exitCode).toBe(ExitCode.ValidationFailed)
    expect(JSON.parse(badRole.stderr).issues.map((entry: { code: string }) => entry.code)).toContain(
      'BENCHMARK_GOVERNANCE_SOURCE_ROLE_STATUS_INVALID',
    )
    expect(existsSync(join(workspace, '.tmp/bad-role-verification.json'))).toBe(false)

    expect(unsafe.exitCode).toBe(ExitCode.ValidationFailed)
    expect(JSON.parse(unsafe.stderr).issues.map((entry: { code: string }) => entry.code)).toContain(
      'BENCHMARK_GOVERNANCE_UNSAFE_SOURCE_AUTHORITY_FLAG',
    )
    expect(existsSync(join(workspace, '.tmp/unsafe-verification.json'))).toBe(false)
  })

  it('blocks output collisions, source overwrite, and protected output paths', async () => {
    const workspace = createWorkspace()
    const suiteLock = await createNativeSuiteLock(workspace)
    const cases = [
      { output: suiteLock, expected: 'would overwrite a source input' },
      { output: '.tmp/governance.json', markdown: '.tmp/governance.json', expected: 'must be different' },
      { output: join('.devview', 'generated', 'governance.json'), expected: 'inside a protected control path' },
    ]

    for (const entry of cases) {
      const result = await runDevViewCli(
        [
          'benchmark',
          'verify-governance',
          '--suite-lock',
          suiteLock,
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

async function createNativeSuiteLock(workspace: string): Promise<string> {
  const graphifyValidation = await validateGraphifyImport(workspace)
  const evaluations = await Promise.all(
    [
      ['candidate.codex-devview.json', '.tmp/native-devview-evaluation.json'],
      ['candidate.codex-graphify.json', '.tmp/native-graphify-evaluation.json'],
      ['candidate.codex-graphify-devview.json', '.tmp/native-graphify-devview-evaluation.json'],
      ['candidate.codex-only.json', '.tmp/native-codex-only-evaluation.json'],
    ].map(([candidate, output]) => evaluateFixture(workspace, candidate, output)),
  )
  const comparison = await summarizeComparison(workspace, evaluations)
  const output = '.tmp/native-suite-lock.json'
  const result = await runDevViewCli(
    [
      'benchmark',
      'lock-suite',
      '--benchmark-suite',
      fixturePath('native-minimal', 'suite.json'),
      '--tasks',
      fixturePath('native-minimal', 'task.json'),
      '--golden-answers',
      fixturePath('native-minimal', 'golden-answer.json'),
      '--candidate-results',
      [
        'candidate.codex-devview.json',
        'candidate.codex-graphify.json',
        'candidate.codex-graphify-devview.json',
        'candidate.codex-only.json',
      ]
        .map((candidate) => fixturePath('native-minimal', candidate))
        .join(','),
      '--evaluations',
      evaluations.join(','),
      '--comparison-summary',
      comparison,
      '--graphify-import-validations',
      graphifyValidation,
      '--output',
      output,
      '--json',
    ],
    { cwd: workspace, pluginRoot },
  )
  expect(result.exitCode).toBe(ExitCode.Success)
  return output
}

async function evaluateFixture(workspace: string, candidateFile: string, output: string): Promise<string> {
  const result = await runDevViewCli(
    [
      'benchmark',
      'evaluate-result',
      '--benchmark-suite',
      fixturePath('native-minimal', 'suite.json'),
      '--task',
      fixturePath('native-minimal', 'task.json'),
      '--golden-answer',
      fixturePath('native-minimal', 'golden-answer.json'),
      '--candidate-result',
      fixturePath('native-minimal', candidateFile),
      '--output',
      output,
      '--json',
    ],
    { cwd: workspace, pluginRoot },
  )
  expect(result.exitCode).toBe(ExitCode.Success)
  return output
}

async function summarizeComparison(workspace: string, evaluations: string[]): Promise<string> {
  const output = '.tmp/native-comparison-summary.json'
  const result = await runDevViewCli(
    ['benchmark', 'summarize-comparison', '--evaluations', evaluations.join(','), '--output', output, '--json'],
    { cwd: workspace, pluginRoot },
  )
  expect(result.exitCode).toBe(ExitCode.Success)
  return output
}

async function validateGraphifyImport(workspace: string): Promise<string> {
  const output = '.tmp/graphify-import-validation.json'
  const result = await runDevViewCli(
    [
      'benchmark',
      'validate-graphify-import',
      '--graphify-export',
      fixturePath('graphify-import-minimal', 'graphify-export.fixture.json'),
      '--mapping',
      fixturePath('graphify-import-minimal', 'graphify-to-devview-mapping.json'),
      '--benchmark-task',
      fixturePath('native-minimal', 'task.json'),
      '--golden-answer',
      fixturePath('native-minimal', 'golden-answer.json'),
      '--output',
      output,
      '--json',
    ],
    { cwd: workspace, pluginRoot },
  )
  expect(result.exitCode).toBe(ExitCode.Success)
  return output
}

function governancePolicy(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    schemaVersion: 1,
    artifactRole: 'devview-benchmark-governance-policy',
    status: 'devview-benchmark-governance-policy-configured',
    requiredBenchmarkEvaluatorVersion: 'devview-benchmark-evaluator-v1',
    requiredScoringRubricVersion: 'devview-benchmark-rubric-v1',
    requireGoldenReviewMetadata: false,
    requireHeldOutPolicy: false,
    requireGraphifyImportValidationForGraphifyArms: false,
    ...overrides,
  }
}

function fixturePath(fixtureName: string, fileName: string): string {
  return join(benchmarkFixtureRoot, fixtureName, fileName)
}

function expectSafetyFalse(payload: Record<string, unknown>): void {
  expect(payload.benchmarkExecuted).toBe(false)
  expect(payload.candidateExecuted).toBe(false)
  expect(payload.graphifyExecuted).toBe(false)
  expect(payload.nativeBenchmarkExecuted).toBe(false)
  expect(payload.providerInvoked).toBe(false)
  expect(payload.networkCallMade).toBe(false)
  expect(payload.shellCommandsExecuted).toBe(false)
  expect(payload.extensionExecutionAllowed).toBe(false)
  expect(payload.extensionsExecuted).toBe(false)
  expect(payload.graphSourceMutated).toBe(false)
  expect(payload.graphDeltaApplied).toBe(false)
  expect(payload.runtimeEvidenceSatisfied).toBe(false)
  expect(payload.evidenceAccepted).toBe(false)
  expect(payload.equivalenceProven).toBe(false)
  expect(payload.scopeEnforced).toBe(false)
  expect(payload.ciEnforcementEnabled).toBe(false)
  expect(payload.hooksActivated).toBe(false)
  expect(payload.branchProtectionChanged).toBe(false)
  expect(payload.branchProtectionMutated).toBe(false)
  expect(payload.requiredChecksConfigured).toBe(false)
  expect(payload.requiredChecksMutated).toBe(false)
  expect(payload.externalCiMutated).toBe(false)
  expect(payload.diffRejectionEnabled).toBe(false)
  expect(payload.diffRejectionActivated).toBe(false)
  expect(payload.approvalAutomationEnabled).toBe(false)
  expect(payload.userAcceptanceAutomated).toBe(false)
  expect(payload.sourceFactsOnly).toBe(true)
}
