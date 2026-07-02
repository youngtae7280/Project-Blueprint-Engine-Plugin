import { matchScopeCompliancePathPattern, normalizeScopeCompliancePathInput } from './scope-compliance-path-pattern.js'

export type ScopeComplianceFindingCategory =
  | 'forbidden-scope-match'
  | 'allowed-scope-match'
  | 'scope-unmatched-path'
  | 'unknown-pattern'
  | 'unparsable-pattern'
  | 'invalid-changed-path'

export type ScopeComplianceResultState =
  | 'evaluation-blocked'
  | 'evaluated-clean'
  | 'evaluated-with-review-required'
  | 'evaluated-with-blocking-violations'

export interface ScopeComplianceChangedFileInput {
  path?: string
  oldPath?: string
  newPath?: string
  status?: string
  statusCode?: string
  changeType?: string
  generatedPath?: boolean
}

export interface ScopeComplianceFinding {
  category: ScopeComplianceFindingCategory
  path?: string
  pattern?: string
  status?: string
  statusCode?: string
  severity: 'blocking' | 'review-required' | 'informational'
  reason: string
}

export interface ScopeComplianceEvaluatedFile {
  path: string
  status?: string
  statusCode?: string
  allowedMatched: boolean
  forbiddenMatched: boolean
  matchedAllowedPatterns: string[]
  matchedForbiddenPatterns: string[]
}

export interface ScopeComplianceEvaluatorInput {
  changedFiles: ScopeComplianceChangedFileInput[]
  allowedScopePatterns: string[]
  forbiddenScopePatterns: string[]
}

export interface ScopeComplianceEvaluationResult {
  checkerRun: true
  nonEnforcing: true
  scopeComplianceEvaluationStatus: 'evaluated' | 'evaluation-blocked'
  scopeComplianceResult: ScopeComplianceResultState
  evaluatedFiles: ScopeComplianceEvaluatedFile[]
  evaluatedViolations: ScopeComplianceFinding[]
  reviewRequiredFindings: ScopeComplianceFinding[]
  blockingFindings: ScopeComplianceFinding[]
  unknownFindings: ScopeComplianceFinding[]
  resultConfidence: 'advisory-non-enforcing'
  enforcementStatus: 'not-enforced'
  scopeEnforced: false
  diffRejected: false
  approvalStatus: 'not-approved'
  equivalenceProven: false
}

export function evaluateScopeCompliance(input: ScopeComplianceEvaluatorInput): ScopeComplianceEvaluationResult {
  const evaluatedFiles: ScopeComplianceEvaluatedFile[] = []
  const evaluatedViolations: ScopeComplianceFinding[] = []
  const reviewRequiredFindings: ScopeComplianceFinding[] = []
  const blockingFindings: ScopeComplianceFinding[] = []
  const unknownFindings: ScopeComplianceFinding[] = []

  const changedPathEntries = input.changedFiles.flatMap(expandChangedFilePaths)
  for (const entry of changedPathEntries) {
    const normalized = normalizeScopeCompliancePathInput(entry.path)
    if (!normalized.valid) {
      const invalidPathFinding = createFinding(
        'invalid-changed-path',
        'blocking',
        entry.path,
        undefined,
        entry,
        normalized.reason,
      )
      blockingFindings.push(invalidPathFinding)
      unknownFindings.push(invalidPathFinding)
      continue
    }

    const matchedForbiddenPatterns: string[] = []
    const matchedAllowedPatterns: string[] = []
    const forbiddenPatternErrors = evaluatePatterns(
      input.forbiddenScopePatterns,
      normalized.normalizedPath,
      entry,
      matchedForbiddenPatterns,
    )
    const allowedPatternErrors = evaluatePatterns(
      input.allowedScopePatterns,
      normalized.normalizedPath,
      entry,
      matchedAllowedPatterns,
    )

    for (const patternError of [...forbiddenPatternErrors, ...allowedPatternErrors]) {
      blockingFindings.push(patternError)
      unknownFindings.push(patternError)
    }

    if (matchedForbiddenPatterns.length > 0) {
      const violation = createFinding(
        'forbidden-scope-match',
        'blocking',
        normalized.normalizedPath,
        matchedForbiddenPatterns[0],
        entry,
        'forbidden-match-wins-over-allowed-match',
      )
      evaluatedViolations.push(violation)
      blockingFindings.push(violation)
    } else if (matchedAllowedPatterns.length === 0) {
      reviewRequiredFindings.push(
        createFinding(
          'scope-unmatched-path',
          'review-required',
          normalized.normalizedPath,
          undefined,
          entry,
          'path-matched-no-allowed-or-forbidden-pattern',
        ),
      )
    }

    evaluatedFiles.push({
      path: normalized.normalizedPath,
      status: entry.status,
      statusCode: entry.statusCode,
      allowedMatched: matchedAllowedPatterns.length > 0,
      forbiddenMatched: matchedForbiddenPatterns.length > 0,
      matchedAllowedPatterns,
      matchedForbiddenPatterns,
    })
  }

  const scopeComplianceEvaluationStatus = unknownFindings.length > 0 ? 'evaluation-blocked' : 'evaluated'
  const scopeComplianceResult =
    unknownFindings.length > 0
      ? 'evaluation-blocked'
      : blockingFindings.length > 0
        ? 'evaluated-with-blocking-violations'
        : reviewRequiredFindings.length > 0
          ? 'evaluated-with-review-required'
          : 'evaluated-clean'

  return {
    checkerRun: true,
    nonEnforcing: true,
    scopeComplianceEvaluationStatus,
    scopeComplianceResult,
    evaluatedFiles,
    evaluatedViolations,
    reviewRequiredFindings,
    blockingFindings,
    unknownFindings,
    resultConfidence: 'advisory-non-enforcing',
    enforcementStatus: 'not-enforced',
    scopeEnforced: false,
    diffRejected: false,
    approvalStatus: 'not-approved',
    equivalenceProven: false,
  }
}

function evaluatePatterns(
  patterns: string[],
  normalizedPath: string,
  entry: ExpandedChangedPath,
  matchedPatterns: string[],
): ScopeComplianceFinding[] {
  const errors: ScopeComplianceFinding[] = []
  for (const pattern of patterns) {
    const match = matchScopeCompliancePathPattern(pattern, normalizedPath)
    if (!match.patternValid) {
      errors.push(
        createFinding(
          match.matchKind === 'invalid-pattern' ? 'unparsable-pattern' : 'unknown-pattern',
          'blocking',
          normalizedPath,
          pattern,
          entry,
          match.reason,
        ),
      )
      continue
    }
    if (match.matched) {
      matchedPatterns.push(pattern)
    }
  }
  return errors
}

interface ExpandedChangedPath {
  path: string
  status?: string
  statusCode?: string
  changeType?: string
  generatedPath?: boolean
}

function expandChangedFilePaths(entry: ScopeComplianceChangedFileInput): ExpandedChangedPath[] {
  const paths = [entry.path, entry.oldPath, entry.newPath].filter((value): value is string => Boolean(value))
  return [...new Set(paths)].map((path) => ({
    path,
    status: entry.status,
    statusCode: entry.statusCode,
    changeType: entry.changeType,
    generatedPath: entry.generatedPath,
  }))
}

function createFinding(
  category: ScopeComplianceFindingCategory,
  severity: ScopeComplianceFinding['severity'],
  path: string | undefined,
  pattern: string | undefined,
  entry: ExpandedChangedPath,
  reason: string,
): ScopeComplianceFinding {
  return {
    category,
    ...(path ? { path } : {}),
    ...(pattern ? { pattern } : {}),
    status: entry.status,
    statusCode: entry.statusCode,
    severity,
    reason,
  }
}
