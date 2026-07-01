export interface ResolvedStopCondition {
  id: string
  condition: string
  action: string
}

export interface DerivedStopCondition {
  id: string
  sourceId: string
  sourceType: string
  triggerType: string
  condition: string
  action: string
  relatedFields: string[]
  derivationStatus: 'derived-stop-condition-ready'
  derivationReason: string
}

export interface UnresolvedStopConditionSource {
  id: string
  sourceId: string
  triggerType: string
  derivationStatus: 'derived-stop-condition-unresolved'
  reason: string
}

export interface StopConditionResolution {
  stopConditions: ResolvedStopCondition[]
  derivedStopConditions: DerivedStopCondition[]
  unresolvedSources: UnresolvedStopConditionSource[]
}

const allowedTriggerTypes = [
  'scope-expansion',
  'required-check-unavailable',
  'compiler-input-blocked',
  'contract-validation-blocked',
  'source-authority-loss',
]

const allowedActions = ['stop-and-request-human-decision', 'stop-and-record-missing-evidence']

export function resolveStopConditionsFromSourceAuthority(sources: unknown[]): StopConditionResolution {
  const derivedStopConditions: DerivedStopCondition[] = []
  const unresolvedSources: UnresolvedStopConditionSource[] = []

  for (const source of sources.map(asRecord)) {
    const id = stringValue(source.derivedStopConditionId)
    const sourceId = stringValue(source.sourceId)
    const triggerType = stringValue(source.triggerType)
    const condition = stringValue(source.condition)
    const action = stringValue(source.action)

    const reason = unresolvedReason({ id, sourceId, triggerType, condition, action })
    if (reason) {
      unresolvedSources.push({
        id,
        sourceId,
        triggerType,
        derivationStatus: 'derived-stop-condition-unresolved',
        reason,
      })
      continue
    }

    derivedStopConditions.push({
      id,
      sourceId,
      sourceType: stringValue(source.sourceType),
      triggerType,
      condition,
      action,
      relatedFields: stringArrayValue(source.relatedFields),
      derivationStatus: 'derived-stop-condition-ready',
      derivationReason: 'derived-from-stopConditionSources-not-hand-written-contract',
    })
  }

  return {
    stopConditions: uniqueStopConditions(
      derivedStopConditions.map((entry) => ({
        id: entry.id,
        condition: entry.condition,
        action: entry.action,
      })),
    ),
    derivedStopConditions,
    unresolvedSources,
  }
}

function unresolvedReason(input: {
  id: string
  sourceId: string
  triggerType: string
  condition: string
  action: string
}): string | undefined {
  if (!input.id || !input.sourceId || !input.triggerType || !input.condition || !input.action) {
    return 'stop-condition-source-missing-required-fields'
  }
  if (!allowedTriggerTypes.includes(input.triggerType)) {
    return `unsupported-stop-condition-trigger-type:${input.triggerType}`
  }
  if (!allowedActions.includes(input.action)) {
    return `unsupported-stop-condition-action:${input.action}`
  }
  return undefined
}

function uniqueStopConditions(stopConditions: ResolvedStopCondition[]): ResolvedStopCondition[] {
  const seen = new Set<string>()
  const unique: ResolvedStopCondition[] = []
  for (const stopCondition of stopConditions) {
    if (seen.has(stopCondition.id)) continue
    seen.add(stopCondition.id)
    unique.push(stopCondition)
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
