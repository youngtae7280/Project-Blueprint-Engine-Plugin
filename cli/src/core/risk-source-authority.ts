export interface ResolvedKnownRisk {
  id: string
  severity: string
  status: string
  mitigation: string
}

export interface DerivedKnownRisk {
  id: string
  sourceId: string
  sourceType: string
  riskType: string
  severity: string
  status: string
  mitigation: string
  relatedContextIds: string[]
  relatedEvidenceIds: string[]
  relatedPolicyIds: string[]
  relatedScopeCandidateIds: string[]
  derivationStatus: 'derived-known-risk-ready'
  derivationReason: string
}

export interface UnresolvedRiskSource {
  id: string
  riskType: string
  derivationStatus: 'derived-known-risk-unresolved'
  reason: string
}

export interface RiskSourceAuthorityResolution {
  knownRisks: ResolvedKnownRisk[]
  derivedKnownRisks: DerivedKnownRisk[]
  unresolvedSources: UnresolvedRiskSource[]
}

const allowedRiskSourceTypes = ['graph', 'policy', 'evidence', 'context', 'scope', 'boundary']
const allowedRiskTypes = ['query-tokenization-regression', 'source-authority-loss', 'scope-drift']
const allowedRiskSeverities = ['info', 'warning', 'high', 'critical', 'blocking']
const allowedRiskStatuses = ['open', 'tracked', 'mitigated']

export function resolveKnownRisksFromSourceAuthority(input: {
  riskSources: unknown[]
  requiredContextIds: Set<string>
  requiredEvidenceIds: Set<string>
  policyIds: Set<string>
  targetScopeCandidateIds: Set<string>
}): RiskSourceAuthorityResolution {
  const derivedKnownRisks: DerivedKnownRisk[] = []
  const unresolvedSources: UnresolvedRiskSource[] = []

  for (const source of input.riskSources.map(asRecord)) {
    const id = stringValue(source.derivedRiskId)
    const sourceId = stringValue(source.sourceId)
    const sourceType = stringValue(source.sourceType)
    const riskType = stringValue(source.riskType)
    const severity = stringValue(source.severity)
    const status = stringValue(source.status)
    const mitigation = stringValue(source.mitigation)
    const relatedContextIds = stringArrayValue(asRecord(source.contextBinding).requiredContextIds)
    const relatedEvidenceIds = stringArrayValue(asRecord(source.evidenceBinding).evidenceIds)
    const relatedPolicyIds = stringArrayValue(asRecord(source.policyBinding).policyIds)
    const relatedScopeCandidateIds = stringArrayValue(asRecord(source.scopeBinding).targetScopeCandidateIds)
    const reason = unresolvedReason({
      id,
      sourceId,
      sourceType,
      riskType,
      severity,
      status,
      mitigation,
      relatedContextIds,
      relatedEvidenceIds,
      relatedPolicyIds,
      relatedScopeCandidateIds,
      requiredContextIds: input.requiredContextIds,
      requiredEvidenceIds: input.requiredEvidenceIds,
      policyIds: input.policyIds,
      targetScopeCandidateIds: input.targetScopeCandidateIds,
    })

    if (reason) {
      unresolvedSources.push({
        id,
        riskType,
        derivationStatus: 'derived-known-risk-unresolved',
        reason,
      })
      continue
    }

    derivedKnownRisks.push({
      id,
      sourceId,
      sourceType,
      riskType,
      severity,
      status,
      mitigation,
      relatedContextIds,
      relatedEvidenceIds,
      relatedPolicyIds,
      relatedScopeCandidateIds,
      derivationStatus: 'derived-known-risk-ready',
      derivationReason: 'derived-from-riskSources-not-hand-written-contract',
    })
  }

  return {
    knownRisks: uniqueKnownRisks(
      derivedKnownRisks.map((entry) => ({
        id: entry.id,
        severity: entry.severity,
        status: entry.status,
        mitigation: entry.mitigation,
      })),
    ),
    derivedKnownRisks,
    unresolvedSources,
  }
}

function unresolvedReason(input: {
  id: string
  sourceId: string
  sourceType: string
  riskType: string
  severity: string
  status: string
  mitigation: string
  relatedContextIds: string[]
  relatedEvidenceIds: string[]
  relatedPolicyIds: string[]
  relatedScopeCandidateIds: string[]
  requiredContextIds: Set<string>
  requiredEvidenceIds: Set<string>
  policyIds: Set<string>
  targetScopeCandidateIds: Set<string>
}): string | undefined {
  if (
    !input.id ||
    !input.sourceId ||
    !input.sourceType ||
    !input.riskType ||
    !input.severity ||
    !input.status ||
    !input.mitigation
  ) {
    return 'risk-source-missing-required-fields'
  }
  if (!allowedRiskSourceTypes.includes(input.sourceType)) {
    return `unsupported-risk-source-type:${input.sourceType}`
  }
  if (!allowedRiskTypes.includes(input.riskType)) {
    return `unsupported-risk-type:${input.riskType}`
  }
  if (!allowedRiskSeverities.includes(input.severity)) {
    return `unsupported-risk-severity:${input.severity}`
  }
  if (!allowedRiskStatuses.includes(input.status)) {
    return `unsupported-risk-status:${input.status}`
  }
  const missingContextId = input.relatedContextIds.find((id) => !input.requiredContextIds.has(id))
  if (missingContextId) {
    return `unknown-required-context:${missingContextId}`
  }
  const missingEvidenceId = input.relatedEvidenceIds.find((id) => !input.requiredEvidenceIds.has(id))
  if (missingEvidenceId) {
    return `unknown-required-evidence:${missingEvidenceId}`
  }
  const missingPolicyId = input.relatedPolicyIds.find((id) => !input.policyIds.has(id))
  if (missingPolicyId) {
    return `unknown-policy:${missingPolicyId}`
  }
  const missingScopeCandidateId = input.relatedScopeCandidateIds.find((id) => !input.targetScopeCandidateIds.has(id))
  if (missingScopeCandidateId) {
    return `unknown-target-scope-candidate:${missingScopeCandidateId}`
  }
  return undefined
}

function uniqueKnownRisks(knownRisks: ResolvedKnownRisk[]): ResolvedKnownRisk[] {
  const seen = new Set<string>()
  const unique: ResolvedKnownRisk[] = []
  for (const risk of knownRisks) {
    if (seen.has(risk.id)) continue
    seen.add(risk.id)
    unique.push(risk)
  }
  return unique
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {}
}

function stringArrayValue(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === 'string' && entry.length > 0)
    : []
}

function stringValue(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback
}
