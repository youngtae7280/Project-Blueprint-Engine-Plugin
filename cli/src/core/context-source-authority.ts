export interface ResolvedRequiredContext {
  id: string
  artifact: string
  role: string
}

export interface DerivedRequiredContext {
  id: string
  sourceArtifactId: string
  artifact: string
  role: string
  derivationStatus: 'derived-required-context-ready'
  derivationReason: string
}

export interface UnresolvedContextSource {
  id: string
  derivationStatus: 'derived-required-context-unresolved'
  reason: string
}

export interface ContextSourceAuthorityResolution {
  requiredContext: ResolvedRequiredContext[]
  derivedRequiredContext: DerivedRequiredContext[]
  unresolvedSources: UnresolvedContextSource[]
}

export function resolveRequiredContextFromSourceAuthority(sources: unknown[]): ContextSourceAuthorityResolution {
  const derivedRequiredContext: DerivedRequiredContext[] = []
  const unresolvedSources: UnresolvedContextSource[] = []

  for (const source of sources.map(asRecord)) {
    const sourceArtifactId = stringValue(source.id)
    const artifact = stringValue(source.path)
    const role = stringValue(source.role)
    const id = sourceArtifactId ? `context-${sourceArtifactId}` : ''

    if (!sourceArtifactId || !artifact || !role) {
      unresolvedSources.push({
        id,
        derivationStatus: 'derived-required-context-unresolved',
        reason: 'context-source-missing-required-fields',
      })
      continue
    }

    derivedRequiredContext.push({
      id,
      sourceArtifactId,
      artifact,
      role,
      derivationStatus: 'derived-required-context-ready',
      derivationReason: 'derived-from-graphSnapshot-artifacts-not-hand-written-contract',
    })
  }

  return {
    requiredContext: uniqueRequiredContext(
      derivedRequiredContext.map((entry) => ({
        id: entry.id,
        artifact: entry.artifact,
        role: entry.role,
      })),
    ),
    derivedRequiredContext,
    unresolvedSources,
  }
}

function uniqueRequiredContext(requiredContext: ResolvedRequiredContext[]): ResolvedRequiredContext[] {
  const seen = new Set<string>()
  const unique: ResolvedRequiredContext[] = []
  for (const context of requiredContext) {
    if (seen.has(context.id)) continue
    seen.add(context.id)
    unique.push(context)
  }
  return unique
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {}
}

function stringValue(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback
}
