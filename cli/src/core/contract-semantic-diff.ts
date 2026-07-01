export type ContractDiffStatus =
  | 'contract-diff-detected'
  | 'contract-diff-none'
  | 'contract-diff-not-run'
  | 'contract-diff-blocked'

export type ContractSemanticDiffClassification =
  | 'conservative-restriction'
  | 'policy-loss'
  | 'policy-expansion'
  | 'safe-additive'
  | 'evidence-chain-mismatch'
  | 'semantic-loss'
  | 'unknown-review-required'

export type ContractSemanticReviewSeverity = 'none' | 'low' | 'medium' | 'high'

export type ContractSemanticPromotionImpact = 'none' | 'review-required' | 'blocks-promotion'

export type ContractCompilerPromotionReadiness =
  | 'compiler-promotion-not-ready'
  | 'compiler-promotion-review-required'
  | 'compiler-promotion-equivalence-candidate'

export interface ContractIdBasedDiffSummary {
  field: string
  handWrittenCount: number
  generatedCount: number
  missingIdsInGenerated: string[]
  extraIdsInGenerated: string[]
}

export interface ContractSemanticDiff {
  field: string
  matchedRuleId: string
  classification: ContractSemanticDiffClassification
  reviewSeverity: ContractSemanticReviewSeverity
  promotionImpact: ContractSemanticPromotionImpact
  reason: string
  missingIdsInGenerated: string[]
  extraIdsInGenerated: string[]
}

export interface ContractSemanticDiffRule {
  ruleId: string
  targetField: string
  condition: 'missingIdsInGenerated' | 'extraIdsInGenerated'
  classification: ContractSemanticDiffClassification
  reviewSeverity: ContractSemanticReviewSeverity
  promotionImpact: ContractSemanticPromotionImpact
  reason: string
}

export interface ContractSemanticDiffRuleCoverage {
  totalDiffs: number
  classifiedDiffs: number
  unknownDiffs: number
  matchedRuleIds: string[]
}

export const unknownSemanticDiffRuleId = 'semantic-diff-rule-unknown'

export const contractSemanticDiffRules: readonly ContractSemanticDiffRule[] = [
  {
    ruleId: 'semantic-diff-rule-allowed-scope-missing-conservative-restriction',
    targetField: 'allowedScope',
    condition: 'missingIdsInGenerated',
    classification: 'conservative-restriction',
    reviewSeverity: 'medium',
    promotionImpact: 'review-required',
    reason:
      'The generated candidate permits less execution scope than the hand-written contract; review before relying on the candidate.',
  },
  {
    ruleId: 'semantic-diff-rule-forbidden-scope-missing-policy-loss',
    targetField: 'forbiddenScope',
    condition: 'missingIdsInGenerated',
    classification: 'policy-loss',
    reviewSeverity: 'high',
    promotionImpact: 'blocks-promotion',
    reason:
      'The generated candidate is missing a forbidden policy scope from the hand-written contract, so promotion is not ready.',
  },
  {
    ruleId: 'semantic-diff-rule-forbidden-scope-extra-policy-expansion',
    targetField: 'forbiddenScope',
    condition: 'extraIdsInGenerated',
    classification: 'policy-expansion',
    reviewSeverity: 'low',
    promotionImpact: 'review-required',
    reason:
      'The generated candidate adds a forbidden policy scope beyond the hand-written contract; review the policy expansion.',
  },
  {
    ruleId: 'semantic-diff-rule-required-checks-extra-safe-additive',
    targetField: 'requiredChecks',
    condition: 'extraIdsInGenerated',
    classification: 'safe-additive',
    reviewSeverity: 'low',
    promotionImpact: 'review-required',
    reason:
      'The generated candidate adds a required check beyond the hand-written contract; this is additive but still review-only.',
  },
  {
    ruleId: 'semantic-diff-rule-required-checks-missing-evidence-chain-mismatch',
    targetField: 'requiredChecks',
    condition: 'missingIdsInGenerated',
    classification: 'evidence-chain-mismatch',
    reviewSeverity: 'high',
    promotionImpact: 'blocks-promotion',
    reason:
      'The generated candidate is missing a required check from the hand-written contract, so its Evidence chain is incomplete.',
  },
  {
    ruleId: 'semantic-diff-rule-required-evidence-missing-semantic-loss',
    targetField: 'requiredEvidence',
    condition: 'missingIdsInGenerated',
    classification: 'semantic-loss',
    reviewSeverity: 'high',
    promotionImpact: 'blocks-promotion',
    reason:
      'The generated candidate is missing required Evidence from the hand-written contract, so semantic equivalence is not ready.',
  },
  {
    ruleId: 'semantic-diff-rule-required-evidence-extra-evidence-chain-mismatch',
    targetField: 'requiredEvidence',
    condition: 'extraIdsInGenerated',
    classification: 'evidence-chain-mismatch',
    reviewSeverity: 'medium',
    promotionImpact: 'review-required',
    reason:
      'The generated candidate adds required Evidence beyond the hand-written contract; review the Evidence chain before promotion.',
  },
]

export function classifyContractDiffSemantics(
  idBasedSummaries: ContractIdBasedDiffSummary[],
  differingFields: string[],
  status: ContractDiffStatus,
): {
  semanticDiffs: ContractSemanticDiff[]
  semanticClassificationCounts: Record<string, number>
  highestReviewSeverity: ContractSemanticReviewSeverity
  compilerPromotionReadiness: ContractCompilerPromotionReadiness
  semanticDiffRuleCoverage: ContractSemanticDiffRuleCoverage
} {
  if (status === 'contract-diff-blocked' || status === 'contract-diff-not-run') {
    return buildSemanticSummary([], 'compiler-promotion-not-ready')
  }

  if (differingFields.length === 0) {
    return buildSemanticSummary([], 'compiler-promotion-equivalence-candidate')
  }

  const semanticDiffs = idBasedSummaries.flatMap((summary) => classifyIdBasedDiffSummary(summary))
  const semanticallyCoveredFields = new Set(semanticDiffs.map((diff) => diff.field))
  const unknownFieldDiffs = differingFields
    .filter((field) => !semanticallyCoveredFields.has(field))
    .map((field) => buildUnknownSemanticDiff(field))
  const allSemanticDiffs = [...semanticDiffs, ...unknownFieldDiffs]

  return buildSemanticSummary(allSemanticDiffs, deriveCompilerPromotionReadiness(allSemanticDiffs))
}

function buildSemanticSummary(
  semanticDiffs: ContractSemanticDiff[],
  compilerPromotionReadiness: ContractCompilerPromotionReadiness,
): {
  semanticDiffs: ContractSemanticDiff[]
  semanticClassificationCounts: Record<string, number>
  highestReviewSeverity: ContractSemanticReviewSeverity
  compilerPromotionReadiness: ContractCompilerPromotionReadiness
  semanticDiffRuleCoverage: ContractSemanticDiffRuleCoverage
} {
  const semanticClassificationCounts = semanticDiffs.reduce<Record<string, number>>((counts, diff) => {
    counts[diff.classification] = (counts[diff.classification] || 0) + 1
    return counts
  }, {})
  const highestReviewSeverity = semanticDiffs.reduce<ContractSemanticReviewSeverity>(
    (highest, diff) => higherSeverity(highest, diff.reviewSeverity),
    'none',
  )
  const matchedRuleIds = Array.from(new Set(semanticDiffs.map((diff) => diff.matchedRuleId))).sort()
  const unknownDiffs = semanticDiffs.filter((diff) => diff.matchedRuleId === unknownSemanticDiffRuleId).length

  return {
    semanticDiffs,
    semanticClassificationCounts,
    highestReviewSeverity,
    compilerPromotionReadiness,
    semanticDiffRuleCoverage: {
      totalDiffs: semanticDiffs.length,
      classifiedDiffs: semanticDiffs.length - unknownDiffs,
      unknownDiffs,
      matchedRuleIds,
    },
  }
}

function classifyIdBasedDiffSummary(summary: ContractIdBasedDiffSummary): ContractSemanticDiff[] {
  const diffs: ContractSemanticDiff[] = []
  if (summary.missingIdsInGenerated.length > 0) {
    diffs.push(buildSemanticDiff(summary, 'missingIdsInGenerated'))
  }
  if (summary.extraIdsInGenerated.length > 0) {
    diffs.push(buildSemanticDiff(summary, 'extraIdsInGenerated'))
  }
  return diffs
}

function buildSemanticDiff(
  summary: ContractIdBasedDiffSummary,
  condition: ContractSemanticDiffRule['condition'],
): ContractSemanticDiff {
  const rule = contractSemanticDiffRules.find(
    (entry) => entry.targetField === summary.field && entry.condition === condition,
  )
  const missingIdsInGenerated = condition === 'missingIdsInGenerated' ? summary.missingIdsInGenerated : []
  const extraIdsInGenerated = condition === 'extraIdsInGenerated' ? summary.extraIdsInGenerated : []
  if (!rule) {
    return buildUnknownSemanticDiff(summary.field, missingIdsInGenerated, extraIdsInGenerated)
  }
  return {
    field: summary.field,
    matchedRuleId: rule.ruleId,
    classification: rule.classification,
    reviewSeverity: rule.reviewSeverity,
    promotionImpact: rule.promotionImpact,
    reason: rule.reason,
    missingIdsInGenerated,
    extraIdsInGenerated,
  }
}

function buildUnknownSemanticDiff(
  field: string,
  missingIdsInGenerated: string[] = [],
  extraIdsInGenerated: string[] = [],
): ContractSemanticDiff {
  return {
    field,
    matchedRuleId: unknownSemanticDiffRuleId,
    classification: 'unknown-review-required',
    reviewSeverity: 'medium',
    promotionImpact: 'review-required',
    reason:
      'This contract difference has no dedicated dry-run v0.1 semantic rule and requires human review before promotion.',
    missingIdsInGenerated,
    extraIdsInGenerated,
  }
}

export function deriveCompilerPromotionReadiness(
  semanticDiffs: ContractSemanticDiff[],
): ContractCompilerPromotionReadiness {
  if (semanticDiffs.length === 0) {
    return 'compiler-promotion-equivalence-candidate'
  }
  if (
    semanticDiffs.some(
      (diff) =>
        diff.classification === 'semantic-loss' ||
        diff.classification === 'policy-loss' ||
        diff.classification === 'unknown-review-required' ||
        diff.reviewSeverity === 'high' ||
        diff.promotionImpact === 'blocks-promotion',
    )
  ) {
    return 'compiler-promotion-not-ready'
  }
  return 'compiler-promotion-review-required'
}

function higherSeverity(
  left: ContractSemanticReviewSeverity,
  right: ContractSemanticReviewSeverity,
): ContractSemanticReviewSeverity {
  const order: Record<ContractSemanticReviewSeverity, number> = { none: 0, low: 1, medium: 2, high: 3 }
  return order[right] > order[left] ? right : left
}
