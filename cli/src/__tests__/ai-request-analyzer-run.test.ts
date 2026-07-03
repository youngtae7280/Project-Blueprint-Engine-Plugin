import { existsSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { runPbeCli } from '../app'
import { analyzeRequestWithDisabledProvider } from '../core/ai-request-analyzer-run'
import { validateRequestIrCandidateSchemaOnly } from '../core/request-ir-candidate-validator'
import { ExitCode } from '../core/types'
import { cleanupWorkspaces, createWorkspace, writeJson } from './fixtures/workspace'

const pluginRoot = resolve(process.cwd())
const requestText = 'Add Todo App runtime evidence for the add button behavior without touching production source.'

afterEach(() => {
  cleanupWorkspaces()
})

describe('AI Request Analyzer command surface core', () => {
  it('returns provider-disabled blocked result without LLM calls or candidate generation', () => {
    const result = analyzeRequestWithDisabledProvider(requestText, validAnalyzerPack())

    expect(result.status).toBe('ai-request-analyzer-provider-disabled')
    expect(result.analyzerProviderStatus).toBe('provider-disabled')
    expect(result.llmInvoked).toBe(false)
    expect(result.networkCallsAllowed).toBe(false)
    expect(result.requestIrCandidateGenerated).toBe(false)
    expect(result.candidateImportRequired).toBe(true)
    expect(result.graphTraversalAllowed).toBe(false)
    expect(result.contractInputGenerated).toBe(false)
    expect(result.instructionPackGenerated).toBe(false)
    expect(result.validationFindings.map((finding) => finding.code)).toContain('AI_REQUEST_ANALYZER_PROVIDER_DISABLED')
  })

  it('imports an explicit candidate as candidate-only without provider invocation', () => {
    const result = analyzeRequestWithDisabledProvider(requestText, validAnalyzerPack(), validRequestIrCandidate(), {
      packPath: 'pack.json',
      externalCandidatePath: 'external-candidate.json',
      outputPath: '.tmp/imported-candidate.json',
    })

    expect(result.status).toBe('ai-request-analyzer-external-candidate-imported')
    expect(result.requestIrCandidateGenerated).toBe(true)
    expect(result.analyzerProviderStatus).toBe('external-candidate-imported-provider-not-invoked')
    expect(result.llmInvoked).toBe(false)
    expect(result.importedCandidate?.artifactRole).toBe('request-ir-candidate')
    expect(result.importedCandidate?.requestIrCandidateStatus).toBe('candidate-only')
    expect(result.importedCandidate?.authorityStatus).toBe('not-authoritative-until-validated')
    expect(result.importedCandidate?.graphTraversalAllowed).toBe(false)
    expect(result.importedCandidate?.contractGenerationAllowed).toBe(false)
    expect(result.importedCandidate?.instructionPackGenerationAllowed).toBe(false)
    expect(result.importedCandidate?.validationRequiredBeforeTraversal).toBe(true)

    const validation = validateRequestIrCandidateSchemaOnly(result.importedCandidate)
    expect(validation.requestIrValidationStatus).toBe('schema-valid-graph-validation-not-run')
    expect(validation.graphTraversalAllowed).toBe(false)
  })
})

describe('AI Request Analyzer command surface CLI', () => {
  it('writes a provider-disabled run report without candidate output authority', async () => {
    const workspace = createWorkspace()
    writeJson(join(workspace, 'pack.json'), validAnalyzerPack())
    const outputPath = join('.tmp', 'provider-disabled.json')

    const result = await runPbeCli(
      [
        'graph',
        'read-model',
        'analyze-request',
        '--request',
        requestText,
        '--pack',
        'pack.json',
        '--output',
        outputPath,
        '--json',
      ],
      { cwd: workspace, pluginRoot },
    )
    const payload = JSON.parse(result.stderr)
    const written = JSON.parse(readFileSync(join(workspace, outputPath), 'utf8'))

    expect(result.exitCode).toBe(ExitCode.ValidationFailed)
    expect(payload.ok).toBe(false)
    expect(payload.analyzerProviderStatus).toBe('provider-disabled')
    expect(written.artifactRole).toBe('ai-request-analyzer-run-result')
    expect(written.requestIrCandidateGenerated).toBe(false)
    expect(written.writtenOutputArtifactRole).toBe('ai-request-analyzer-run-result')
    expect(written.llmInvoked).toBe(false)
  })

  it('imports an explicit external candidate and writes a candidate-only output', async () => {
    const workspace = createWorkspace()
    writeJson(join(workspace, 'pack.json'), validAnalyzerPack())
    writeJson(join(workspace, 'external-candidate.json'), validRequestIrCandidate())
    const outputPath = join('.tmp', 'imported-candidate.json')

    const result = await runPbeCli(
      [
        'graph',
        'read-model',
        'analyze-request',
        '--request',
        requestText,
        '--pack',
        'pack.json',
        '--external-candidate',
        'external-candidate.json',
        '--output',
        outputPath,
        '--json',
      ],
      { cwd: workspace, pluginRoot },
    )
    const payload = JSON.parse(result.stdout)
    const written = JSON.parse(readFileSync(join(workspace, outputPath), 'utf8'))

    expect(result.exitCode).toBe(ExitCode.Success)
    expect(payload.ok).toBe(true)
    expect(payload.requestIrCandidateGenerated).toBe(true)
    expect(written.artifactRole).toBe('request-ir-candidate')
    expect(written.analyzerProviderStatus).toBe('external-candidate-imported-provider-not-invoked')
    expect(written.llmInvoked).toBe(false)
    expect(written.graphTraversalAllowed).toBe(false)
    expect(written.contractGenerationAllowed).toBe(false)
    expect(written.instructionPackGenerationAllowed).toBe(false)
  })

  it('blocks an external candidate whose request text differs and writes no output', async () => {
    const workspace = createWorkspace()
    writeJson(join(workspace, 'pack.json'), validAnalyzerPack())
    writeJson(join(workspace, 'external-candidate.json'), {
      ...validRequestIrCandidate(),
      requestText: 'Change production source.',
      sourceNaturalLanguageRequest: {
        sourceKind: 'human-natural-language-request',
        language: 'en',
        text: 'Change production source.',
      },
    })
    const outputPath = join('.tmp', 'imported-candidate.json')

    const result = await runPbeCli(
      [
        'graph',
        'read-model',
        'analyze-request',
        '--request',
        requestText,
        '--pack',
        'pack.json',
        '--external-candidate',
        'external-candidate.json',
        '--output',
        outputPath,
        '--json',
      ],
      { cwd: workspace, pluginRoot },
    )
    const payload = JSON.parse(result.stderr)

    expect(result.exitCode).toBe(ExitCode.ValidationFailed)
    expect(payload.ok).toBe(false)
    expect(payload.issues.map((entry: { code: string }) => entry.code)).toContain(
      'AI_REQUEST_EXTERNAL_CANDIDATE_REQUEST_MISMATCH',
    )
    expect(existsSync(join(workspace, outputPath))).toBe(false)
  })

  it('blocks external candidate authority escalation and writes no output', async () => {
    const workspace = createWorkspace()
    writeJson(join(workspace, 'pack.json'), validAnalyzerPack())
    writeJson(join(workspace, 'external-candidate.json'), {
      ...validRequestIrCandidate(),
      graphTraversalAllowed: true,
    })
    const outputPath = join('.tmp', 'imported-candidate.json')

    const result = await runPbeCli(
      [
        'graph',
        'read-model',
        'analyze-request',
        '--request',
        requestText,
        '--pack',
        'pack.json',
        '--external-candidate',
        'external-candidate.json',
        '--output',
        outputPath,
        '--json',
      ],
      { cwd: workspace, pluginRoot },
    )
    const payload = JSON.parse(result.stderr)

    expect(result.exitCode).toBe(ExitCode.ValidationFailed)
    expect(payload.ok).toBe(false)
    expect(payload.issues.map((entry: { code: string }) => entry.code)).toContain(
      'AI_REQUEST_EXTERNAL_CANDIDATE_AUTHORITY_ESCALATION',
    )
    expect(existsSync(join(workspace, outputPath))).toBe(false)
  })

  it('blocks output that would overwrite the analyzer pack and leaves it unchanged', async () => {
    const workspace = createWorkspace()
    writeJson(join(workspace, 'pack.json'), validAnalyzerPack())
    writeJson(join(workspace, 'external-candidate.json'), validRequestIrCandidate())
    const packBefore = readFileSync(join(workspace, 'pack.json'), 'utf8')

    const result = await runPbeCli(
      [
        'graph',
        'read-model',
        'analyze-request',
        '--request',
        requestText,
        '--pack',
        'pack.json',
        '--external-candidate',
        'external-candidate.json',
        '--output',
        'pack.json',
        '--json',
      ],
      { cwd: workspace, pluginRoot },
    )
    const payload = JSON.parse(result.stderr)

    expect(result.exitCode).toBe(ExitCode.ValidationFailed)
    expect(payload.ok).toBe(false)
    expect(payload.issues[0].message).toContain('would overwrite the source AI Request Analyzer Pack')
    expect(readFileSync(join(workspace, 'pack.json'), 'utf8')).toBe(packBefore)
  })
})

function validAnalyzerPack(): Record<string, unknown> {
  return {
    schemaVersion: 1,
    artifactRole: 'ai-request-analyzer-pack',
    status: 'ai-request-analyzer-pack-generated',
    analyzerPackGenerated: true,
    analyzerImplemented: false,
    llmInvoked: false,
    networkCallsAllowed: false,
    runtimeAiCallsAllowed: false,
    requestIrCandidateGenerated: false,
    candidateOnly: true,
    candidateAuthorityStatus: 'ai-generated-candidate-not-validated',
    requestIrAuthorityStatus: 'not-authoritative-until-validated',
    expectedOutputArtifactRole: 'request-ir-candidate',
    expectedOutputSchemaId: 'devview-request-ir-candidate-v0-preview',
    expectedOutputSchemaArtifact: 'schema.json',
    validationChainRequiredBeforeTraversal: [
      {
        step: 'schema-only-request-ir-validation',
        command: 'graph read-model validate-request-ir --candidate <candidatePath> --json',
      },
    ],
  }
}

function validRequestIrCandidate(): Record<string, unknown> {
  return {
    schemaVersion: 1,
    artifactRole: 'request-ir-candidate',
    status: 'request-ir-candidate-external-previewed',
    schemaId: 'devview-request-ir-candidate-v0-preview',
    requestIrCandidateStatus: 'candidate-only',
    sourceNaturalLanguageRequest: {
      sourceKind: 'human-natural-language-request',
      language: 'en',
      text: requestText,
      authorityStatus: 'raw-request-text-not-compiler-authority',
    },
    requestText,
    requestLanguage: 'en',
    requestTypeCandidate: 'runtime-evidence-only',
    changeTypeCandidate: 'test-only-behavior-proof',
    targetRecordIdCandidate: 'CH-001',
    targetComponentCandidate: 'Todo App',
    intentSummaryCandidate: 'Add runtime evidence for add button behavior without production source changes.',
    allowedScopeIntentCandidate: ['runtime behavior evidence'],
    forbiddenScopeIntentCandidate: ['production source changes'],
    requiredEvidenceIntentCandidate: ['add-todo behavior proof'],
    riskIntentCandidate: ['production source must remain untouched'],
    confidence: { score: 0.74, band: 'medium' },
    ambiguities: [],
    requiresClarification: false,
    humanReviewRequired: true,
    candidateOnly: true,
    authorityStatus: 'not-authoritative-until-validated',
    validatedRequestIr: false,
    graphTraversalAllowed: false,
    contractGenerationAllowed: false,
    instructionPackGenerationAllowed: false,
    graphSourceMutated: false,
    graphDeltaApplied: false,
    approvalStatus: 'not-approved',
    equivalenceProven: false,
    runtimeEvidenceSatisfied: false,
  }
}
