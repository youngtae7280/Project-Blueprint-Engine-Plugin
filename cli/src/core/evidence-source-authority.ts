export interface ResolvedRequiredEvidence {
  id: string
  evidenceType: string
  fromCheck: string
  freshness: string
}

export interface DerivedRequiredEvidence {
  id: string
  sourceEvidenceId: string
  sourceEvidenceType: string
  compiledEvidenceType: string
  artifact: string
  fromCheck: string
  freshness: string
  derivationStatus: 'derived-required-evidence-ready'
  derivationReason: string
}

export interface UnresolvedEvidenceSource {
  id: string
  evidenceType: string
  derivationStatus: 'derived-required-evidence-unresolved'
  reason: string
}

export interface EvidenceSourceAuthorityResolution {
  requiredEvidence: ResolvedRequiredEvidence[]
  derivedRequiredEvidence: DerivedRequiredEvidence[]
  unresolvedSources: UnresolvedEvidenceSource[]
}

export function resolveRequiredEvidenceFromSourceAuthority(input: {
  evidenceEntries: unknown[]
  evidenceCheckMappings: unknown[]
  requiredCheckIds: Set<string>
}): EvidenceSourceAuthorityResolution {
  const mappingByEvidenceType = new Map<string, { requiredCheckId: string; compiledEvidenceType: string }>()
  for (const mapping of input.evidenceCheckMappings.map(asRecord)) {
    const evidenceType = stringValue(mapping.evidenceType)
    if (!evidenceType) continue
    mappingByEvidenceType.set(evidenceType, {
      requiredCheckId: stringValue(mapping.requiredCheckId),
      compiledEvidenceType: stringValue(mapping.compiledEvidenceType),
    })
  }

  const derivedRequiredEvidence: DerivedRequiredEvidence[] = []
  const unresolvedSources: UnresolvedEvidenceSource[] = []

  for (const entry of input.evidenceEntries.map(asRecord)) {
    const id = stringValue(entry.id)
    const sourceEvidenceType = stringValue(entry.evidenceType)
    const artifact = stringValue(entry.artifact)
    const freshness = stringValue(entry.freshness)
    const mapping = mappingByEvidenceType.get(sourceEvidenceType)
    const reason = unresolvedReason({
      id,
      sourceEvidenceType,
      artifact,
      freshness,
      mapping,
      requiredCheckIds: input.requiredCheckIds,
    })
    if (reason) {
      unresolvedSources.push({
        id,
        evidenceType: sourceEvidenceType,
        derivationStatus: 'derived-required-evidence-unresolved',
        reason,
      })
      continue
    }

    derivedRequiredEvidence.push({
      id,
      sourceEvidenceId: id,
      sourceEvidenceType,
      compiledEvidenceType: mapping!.compiledEvidenceType,
      artifact,
      fromCheck: mapping!.requiredCheckId,
      freshness,
      derivationStatus: 'derived-required-evidence-ready',
      derivationReason: 'derived-from-evidenceIndex-and-evidenceCheckMappings-not-hand-written-contract',
    })
  }

  return {
    requiredEvidence: uniqueRequiredEvidence(
      derivedRequiredEvidence.map((entry) => ({
        id: entry.id,
        evidenceType: entry.compiledEvidenceType,
        fromCheck: entry.fromCheck,
        freshness: entry.freshness,
      })),
    ),
    derivedRequiredEvidence,
    unresolvedSources,
  }
}

function unresolvedReason(input: {
  id: string
  sourceEvidenceType: string
  artifact: string
  freshness: string
  mapping: { requiredCheckId: string; compiledEvidenceType: string } | undefined
  requiredCheckIds: Set<string>
}): string | undefined {
  if (!input.id || !input.sourceEvidenceType || !input.artifact || !input.freshness) {
    return 'evidence-source-missing-required-fields'
  }
  if (!input.mapping) {
    return `missing-evidence-check-mapping:${input.sourceEvidenceType}`
  }
  if (!input.mapping.requiredCheckId || !input.mapping.compiledEvidenceType) {
    return `incomplete-evidence-check-mapping:${input.sourceEvidenceType}`
  }
  if (!input.requiredCheckIds.has(input.mapping.requiredCheckId)) {
    return `unknown-required-check:${input.mapping.requiredCheckId}`
  }
  return undefined
}

function uniqueRequiredEvidence(requiredEvidence: ResolvedRequiredEvidence[]): ResolvedRequiredEvidence[] {
  const seen = new Set<string>()
  const unique: ResolvedRequiredEvidence[] = []
  for (const evidence of requiredEvidence) {
    if (seen.has(evidence.id)) continue
    seen.add(evidence.id)
    unique.push(evidence)
  }
  return unique
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {}
}

function stringValue(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback
}
