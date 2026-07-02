export type ScopeComplianceMatchKind =
  | 'exact'
  | 'directory-prefix'
  | 'glob'
  | 'invalid-path'
  | 'invalid-pattern'
  | 'unsupported-pattern'

export interface ScopeCompliancePathNormalizationResult {
  input: string
  normalizedPath: string
  valid: boolean
  reason: string
  warnings: string[]
}

export interface ScopeCompliancePathPatternMatchResult {
  pattern: string
  normalizedPattern: string
  normalizedPath: string
  matched: boolean
  matchKind: ScopeComplianceMatchKind
  patternValid: boolean
  pathValid: boolean
  reason: string
}

interface NormalizedPattern {
  normalizedPattern: string
  matchPattern: string
  patternValid: boolean
  matchKind: ScopeComplianceMatchKind
  reason: string
}

export function normalizeScopeCompliancePathInput(input: string): ScopeCompliancePathNormalizationResult {
  const warnings: string[] = []
  if (input.length === 0) {
    return invalidNormalization(input, 'empty-path')
  }
  if (input !== input.trim()) {
    return invalidNormalization(input, 'leading-or-trailing-whitespace')
  }
  if (input.includes('\0')) {
    return invalidNormalization(input, 'nul-byte')
  }

  let normalizedPath = input.replaceAll('\\', '/')
  const windowsAbsolute = /^[A-Za-z]:\//.test(normalizedPath)
  const posixAbsolute = normalizedPath.startsWith('/')
  if (windowsAbsolute || posixAbsolute) {
    return invalidNormalization(input, 'absolute-local-path-not-allowed')
  }

  while (normalizedPath.startsWith('./')) {
    normalizedPath = normalizedPath.slice(2)
    warnings.push('leading-dot-slash-normalized-away')
  }
  while (normalizedPath.includes('//')) {
    normalizedPath = normalizedPath.replaceAll('//', '/')
    warnings.push('duplicate-slash-normalized')
  }

  const segments = normalizedPath.split('/').filter((segment) => segment.length > 0 && segment !== '.')
  if (segments.length === 0) {
    return invalidNormalization(input, 'empty-path-after-normalization')
  }
  if (segments.includes('..')) {
    return invalidNormalization(input, 'parent-traversal-not-allowed')
  }

  return {
    input,
    normalizedPath: segments.join('/'),
    valid: true,
    reason: warnings.length > 0 ? 'normalized' : 'already-normalized',
    warnings,
  }
}

export function matchScopeCompliancePathPattern(
  pattern: string,
  candidatePath: string,
): ScopeCompliancePathPatternMatchResult {
  const pathNormalization = normalizeScopeCompliancePathInput(candidatePath)
  const patternNormalization = normalizeScopeCompliancePattern(pattern)

  if (!pathNormalization.valid) {
    return {
      pattern,
      normalizedPattern: patternNormalization.normalizedPattern,
      normalizedPath: pathNormalization.normalizedPath,
      matched: false,
      matchKind: 'invalid-path',
      patternValid: patternNormalization.patternValid,
      pathValid: false,
      reason: pathNormalization.reason,
    }
  }
  if (!patternNormalization.patternValid) {
    return {
      pattern,
      normalizedPattern: patternNormalization.normalizedPattern,
      normalizedPath: pathNormalization.normalizedPath,
      matched: false,
      matchKind: patternNormalization.matchKind,
      patternValid: false,
      pathValid: true,
      reason: patternNormalization.reason,
    }
  }

  if (patternNormalization.matchKind === 'exact') {
    const matched = pathNormalization.normalizedPath === patternNormalization.matchPattern
    return matchResult(
      pattern,
      patternNormalization,
      pathNormalization.normalizedPath,
      matched,
      matched ? 'exact-path-match' : 'exact-path-no-match',
    )
  }

  if (patternNormalization.matchKind === 'directory-prefix') {
    const matched = pathNormalization.normalizedPath.startsWith(`${patternNormalization.matchPattern}/`)
    return matchResult(
      pattern,
      patternNormalization,
      pathNormalization.normalizedPath,
      matched,
      matched ? 'directory-prefix-match' : 'directory-prefix-no-match',
    )
  }

  const matched = matchGlobSegments(
    patternNormalization.matchPattern.split('/'),
    pathNormalization.normalizedPath.split('/'),
  )
  return matchResult(
    pattern,
    patternNormalization,
    pathNormalization.normalizedPath,
    matched,
    matched ? 'glob-match' : 'glob-no-match',
  )
}

function normalizeScopeCompliancePattern(pattern: string): NormalizedPattern {
  const hadTrailingSlash = pattern.endsWith('/') || pattern.endsWith('\\')
  const normalization = normalizeScopeCompliancePathInput(pattern)
  if (!normalization.valid) {
    return {
      normalizedPattern: normalization.normalizedPath,
      matchPattern: normalization.normalizedPath,
      patternValid: false,
      matchKind: 'invalid-pattern',
      reason: normalization.reason,
    }
  }
  if (normalization.normalizedPath.startsWith('unresolved:')) {
    return invalidPattern(normalization.normalizedPath, 'unsupported-conceptual-unresolved-pattern')
  }
  if (/[()[\]{}+?|^$]/.test(normalization.normalizedPath)) {
    return invalidPattern(normalization.normalizedPath, 'unsupported-regex-like-pattern')
  }
  if (normalization.normalizedPath.includes('*')) {
    const unsupportedDoubleStar = normalization.normalizedPath
      .split('/')
      .some((segment) => segment.includes('**') && segment !== '**')
    if (unsupportedDoubleStar) {
      return invalidPattern(normalization.normalizedPath, 'unsupported-double-star-within-segment')
    }
    return {
      normalizedPattern: normalization.normalizedPath,
      matchPattern: normalization.normalizedPath,
      patternValid: true,
      matchKind: 'glob',
      reason: 'glob-like-pattern',
    }
  }
  if (hadTrailingSlash) {
    return {
      normalizedPattern: `${normalization.normalizedPath}/`,
      matchPattern: normalization.normalizedPath,
      patternValid: true,
      matchKind: 'directory-prefix',
      reason: 'directory-prefix-pattern',
    }
  }
  return {
    normalizedPattern: normalization.normalizedPath,
    matchPattern: normalization.normalizedPath,
    patternValid: true,
    matchKind: 'exact',
    reason: 'exact-path-pattern',
  }
}

function matchGlobSegments(patternSegments: string[], pathSegments: string[]): boolean {
  if (patternSegments.length === 0) {
    return pathSegments.length === 0
  }
  const [patternHead, ...patternTail] = patternSegments
  if (patternHead === '**') {
    for (let consumed = 0; consumed <= pathSegments.length; consumed += 1) {
      if (matchGlobSegments(patternTail, pathSegments.slice(consumed))) {
        return true
      }
    }
    return false
  }
  const [pathHead, ...pathTail] = pathSegments
  if (!pathHead || !matchGlobSegment(patternHead, pathHead)) {
    return false
  }
  return matchGlobSegments(patternTail, pathTail)
}

function matchGlobSegment(patternSegment: string, pathSegment: string): boolean {
  const expression = `^${escapeRegex(patternSegment).replaceAll('\\*', '[^/]*')}$`
  return new RegExp(expression).test(pathSegment)
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function matchResult(
  pattern: string,
  patternNormalization: NormalizedPattern,
  normalizedPath: string,
  matched: boolean,
  reason: string,
): ScopeCompliancePathPatternMatchResult {
  return {
    pattern,
    normalizedPattern: patternNormalization.normalizedPattern,
    normalizedPath,
    matched,
    matchKind: patternNormalization.matchKind,
    patternValid: true,
    pathValid: true,
    reason,
  }
}

function invalidPattern(normalizedPattern: string, reason: string): NormalizedPattern {
  return {
    normalizedPattern,
    matchPattern: normalizedPattern,
    patternValid: false,
    matchKind: 'unsupported-pattern',
    reason,
  }
}

function invalidNormalization(input: string, reason: string): ScopeCompliancePathNormalizationResult {
  return {
    input,
    normalizedPath: input.replaceAll('\\', '/'),
    valid: false,
    reason,
    warnings: [],
  }
}
