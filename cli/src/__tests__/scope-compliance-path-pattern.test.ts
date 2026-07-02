import { describe, expect, it } from 'vitest'
import {
  matchScopeCompliancePathPattern,
  normalizeScopeCompliancePathInput,
} from '../core/scope-compliance-path-pattern'

describe('scope compliance path pattern helper', () => {
  it('normalizes Windows separators and leading dot slash without evaluating scope', () => {
    expect(normalizeScopeCompliancePathInput('.\\examples\\valid\\todo-app-pbe-run\\src\\App.tsx')).toEqual({
      input: '.\\examples\\valid\\todo-app-pbe-run\\src\\App.tsx',
      normalizedPath: 'examples/valid/todo-app-pbe-run/src/App.tsx',
      valid: true,
      reason: 'normalized',
      warnings: ['leading-dot-slash-normalized-away'],
    })
  })

  it('marks absolute paths invalid instead of using local path authority', () => {
    const result = matchScopeCompliancePathPattern('examples/valid/todo-app-pbe-run/src/**', 'C:\\repo\\src\\App.tsx')

    expect(result).toMatchObject({
      matched: false,
      matchKind: 'invalid-path',
      patternValid: true,
      pathValid: false,
      reason: 'absolute-local-path-not-allowed',
    })
  })

  it('matches exact repository-relative POSIX paths', () => {
    const result = matchScopeCompliancePathPattern(
      'examples/valid/todo-app-pbe-run/.pbe/tree/test-tree.json',
      'examples/valid/todo-app-pbe-run/.pbe/tree/test-tree.json',
    )

    expect(result).toMatchObject({
      matched: true,
      matchKind: 'exact',
      patternValid: true,
      pathValid: true,
      reason: 'exact-path-match',
    })
  })

  it('matches directory-prefix patterns without treating the directory itself as a descendant', () => {
    expect(
      matchScopeCompliancePathPattern(
        'examples/valid/todo-app-pbe-run/.pbe/evidence/',
        'examples/valid/todo-app-pbe-run/.pbe/evidence/test-results/todo-add.txt',
      ),
    ).toMatchObject({
      matched: true,
      matchKind: 'directory-prefix',
      reason: 'directory-prefix-match',
    })
    expect(
      matchScopeCompliancePathPattern(
        'examples/valid/todo-app-pbe-run/.pbe/evidence/',
        'examples/valid/todo-app-pbe-run/.pbe/evidence',
      ),
    ).toMatchObject({
      matched: false,
      matchKind: 'directory-prefix',
      reason: 'directory-prefix-no-match',
    })
  })

  it('matches first-slice glob-like patterns only', () => {
    expect(
      matchScopeCompliancePathPattern(
        'examples/valid/todo-app-pbe-run/.pbe/evidence/**',
        'examples/valid/todo-app-pbe-run/.pbe/evidence',
      ),
    ).toMatchObject({
      matched: true,
      matchKind: 'glob',
      reason: 'glob-match',
    })
    expect(
      matchScopeCompliancePathPattern(
        'examples/valid/todo-app-pbe-run/**/*.json',
        'examples/valid/todo-app-pbe-run/generated/result.json',
      ),
    ).toMatchObject({
      matched: true,
      matchKind: 'glob',
      reason: 'glob-match',
    })
  })

  it('marks regex-like or unresolved patterns unsupported', () => {
    expect(
      matchScopeCompliancePathPattern(
        'examples/(valid)/todo-app-pbe-run/**',
        'examples/valid/todo-app-pbe-run/src/App.tsx',
      ),
    ).toMatchObject({
      matched: false,
      matchKind: 'unsupported-pattern',
      patternValid: false,
      pathValid: true,
      reason: 'unsupported-regex-like-pattern',
    })
    expect(
      matchScopeCompliancePathPattern(
        'unresolved:todo-app-runtime-proof-report',
        'examples/valid/todo-app-pbe-run/generated/report.json',
      ),
    ).toMatchObject({
      matched: false,
      matchKind: 'unsupported-pattern',
      patternValid: false,
      pathValid: true,
      reason: 'unsupported-conceptual-unresolved-pattern',
    })
  })

  it('returns helper-level match results without scope compliance conclusions', () => {
    const result = matchScopeCompliancePathPattern(
      'examples/valid/todo-app-pbe-run/generated/**',
      'examples/valid/todo-app-pbe-run/generated/report.json',
    )

    expect(result).not.toHaveProperty('checkerRun')
    expect(result).not.toHaveProperty('scopeComplianceResult')
    expect(result).not.toHaveProperty('evaluatedViolations')
    expect(result).not.toHaveProperty('forbidden-scope-match')
    expect(result).not.toHaveProperty('allowed-scope-match')
    expect(result).toMatchObject({
      matched: true,
      matchKind: 'glob',
      patternValid: true,
      pathValid: true,
    })
  })
})
