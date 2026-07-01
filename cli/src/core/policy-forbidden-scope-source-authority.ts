export interface ResolvedForbiddenScope {
  id: string
  scopeKind: string
  paths: string[]
  derivedFrom: string[]
}

export interface UnresolvedForbiddenScopeRule {
  id: string
  reason: string
}

export interface PolicyForbiddenScopeResolution {
  forbiddenScope: ResolvedForbiddenScope[]
  unresolvedRules: UnresolvedForbiddenScopeRule[]
}

export function resolveForbiddenScopeFromPolicySourceAuthority(
  policySnapshot: Record<string, unknown>,
): PolicyForbiddenScopeResolution {
  const forbiddenScope: ResolvedForbiddenScope[] = []
  const unresolvedRules: UnresolvedForbiddenScopeRule[] = []

  for (const rule of arrayValue(policySnapshot.forbiddenScopeRules)) {
    const id = stringValue(rule.id)
    const scopeKind = stringValue(rule.scopeKind)
    const paths = stringArrayValue(rule.paths)
    const derivedFrom = stringArrayValue(rule.derivedFrom)

    if (!id || !scopeKind || paths.length === 0 || derivedFrom.length === 0) {
      unresolvedRules.push({
        id: id || 'missing',
        reason: 'policy-forbidden-scope-rule-missing-required-fields',
      })
      continue
    }

    forbiddenScope.push({ id, scopeKind, paths, derivedFrom })
  }

  return { forbiddenScope, unresolvedRules }
}

function arrayValue(value: unknown): Array<Record<string, unknown>> {
  return Array.isArray(value)
    ? value.filter((entry): entry is Record<string, unknown> => Boolean(entry) && typeof entry === 'object')
    : []
}

function stringArrayValue(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === 'string') : []
}

function stringValue(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback
}
