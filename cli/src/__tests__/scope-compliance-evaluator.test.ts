import { describe, expect, it } from 'vitest'
import { evaluateScopeCompliance } from '../core/scope-compliance-evaluator'

describe('scope compliance evaluator', () => {
  it('lets forbidden scope win over allowed scope without enforcing the result', () => {
    const result = evaluateScopeCompliance({
      changedFiles: [{ path: 'src/todos.ts', status: 'M', statusCode: 'M' }],
      allowedScopePatterns: ['src/**'],
      forbiddenScopePatterns: ['src/todos.ts'],
    })

    expect(result.checkerRun).toBe(true)
    expect(result.nonEnforcing).toBe(true)
    expect(result.enforcementStatus).toBe('not-enforced')
    expect(result.scopeComplianceEvaluationStatus).toBe('evaluated')
    expect(result.scopeComplianceResult).toBe('evaluated-with-blocking-violations')
    expect(result.evaluatedViolations).toEqual([
      expect.objectContaining({
        category: 'forbidden-scope-match',
        pattern: 'src/todos.ts',
        reason: 'forbidden-match-wins-over-allowed-match',
      }),
    ])
    expect(result.blockingFindings).toEqual([expect.objectContaining({ category: 'forbidden-scope-match' })])
    expect(result.scopeEnforced).toBe(false)
    expect(result.diffRejected).toBe(false)
    expect(result.equivalenceProven).toBe(false)
  })

  it('allows matching allowed scope without blocking findings', () => {
    const result = evaluateScopeCompliance({
      changedFiles: [{ path: 'examples/valid/todo-app-devview-run/.devview/evidence/test-results/todo-add.txt' }],
      allowedScopePatterns: ['examples/valid/todo-app-devview-run/.devview/evidence/**'],
      forbiddenScopePatterns: ['src/todos.ts'],
    })

    expect(result.scopeComplianceEvaluationStatus).toBe('evaluated')
    expect(result.scopeComplianceResult).toBe('evaluated-clean')
    expect(result.evaluatedViolations).toEqual([])
    expect(result.blockingFindings).toEqual([])
    expect(result.reviewRequiredFindings).toEqual([])
  })

  it('marks unmatched changed paths review-required instead of silently clean', () => {
    const result = evaluateScopeCompliance({
      changedFiles: [{ path: 'docs/concept/scope-compliance.md' }],
      allowedScopePatterns: ['examples/valid/todo-app-devview-run/.devview/evidence/**'],
      forbiddenScopePatterns: ['src/todos.ts'],
    })

    expect(result.scopeComplianceEvaluationStatus).toBe('evaluated')
    expect(result.scopeComplianceResult).toBe('evaluated-with-review-required')
    expect(result.reviewRequiredFindings).toEqual([expect.objectContaining({ category: 'scope-unmatched-path' })])
    expect(result.evaluatedViolations).toEqual([])
  })

  it('blocks evaluation for invalid absolute changed paths', () => {
    const result = evaluateScopeCompliance({
      changedFiles: [{ path: 'C:\\repo\\src\\todos.ts' }],
      allowedScopePatterns: ['src/**'],
      forbiddenScopePatterns: [],
    })

    expect(result.scopeComplianceEvaluationStatus).toBe('evaluation-blocked')
    expect(result.scopeComplianceResult).toBe('evaluation-blocked')
    expect(result.unknownFindings).toEqual([
      expect.objectContaining({
        category: 'invalid-changed-path',
        reason: 'absolute-local-path-not-allowed',
      }),
    ])
  })

  it('blocks evaluation for unsupported patterns', () => {
    const result = evaluateScopeCompliance({
      changedFiles: [{ path: 'src/todos.ts' }],
      allowedScopePatterns: ['src/(.*).ts'],
      forbiddenScopePatterns: [],
    })

    expect(result.scopeComplianceEvaluationStatus).toBe('evaluation-blocked')
    expect(result.scopeComplianceResult).toBe('evaluation-blocked')
    expect(result.unknownFindings).toEqual([
      expect.objectContaining({
        category: 'unknown-pattern',
        pattern: 'src/(.*).ts',
        reason: 'unsupported-regex-like-pattern',
      }),
    ])
  })

  it('always returns non-enforcing result fields', () => {
    const result = evaluateScopeCompliance({
      changedFiles: [{ path: 'src/todos.ts' }],
      allowedScopePatterns: ['src/**'],
      forbiddenScopePatterns: ['src/todos.ts'],
    })

    expect(result).toMatchObject({
      checkerRun: true,
      nonEnforcing: true,
      resultConfidence: 'advisory-non-enforcing',
      enforcementStatus: 'not-enforced',
      scopeEnforced: false,
      diffRejected: false,
      approvalStatus: 'not-approved',
      equivalenceProven: false,
    })
  })

  it('handles many files and patterns without async or external work', () => {
    const changedFiles = Array.from({ length: 200 }, (_, index) => ({
      path: `examples/valid/todo-app-devview-run/.devview/evidence/test-results/${index}.txt`,
    }))
    const allowedScopePatterns = [
      'examples/valid/todo-app-devview-run/.devview/evidence/**',
      ...Array.from({ length: 20 }, (_, index) => `unused/${index}/**`),
    ]

    const result = evaluateScopeCompliance({
      changedFiles,
      allowedScopePatterns,
      forbiddenScopePatterns: ['src/todos.ts'],
    })

    expect(result.scopeComplianceResult).toBe('evaluated-clean')
    expect(result.evaluatedFiles).toHaveLength(200)
  })
})
