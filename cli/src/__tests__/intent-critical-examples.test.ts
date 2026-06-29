import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

interface IntentCriticalExample {
  schemaVersion: number
  artifactRole: string
  exampleKind: 'native-pbe' | 'retrofit-pbe'
  status: string
  sourceMode: string
  sourceSlice: string
  maintenanceScenario: string
  vibeCodingRisk: string
  intentRecords: Array<{
    id: string
    intentType: string
    statement: string
    maintenanceRiskIfMissing: string
    preservationRule: string
    nonGoal: string
    fallbackReason: string
    evidenceReason: string
    compatibilityReason: string
  }>
  readModelIntentFields: {
    required: string[]
    projectionBoundary: string
  }
  boundaries: {
    sourceAuthorityBoundary: string
    nonPromotionStatement: string
    userAcceptanceBoundary: string
  }
}

async function readIntentExample(path: string): Promise<IntentCriticalExample> {
  return JSON.parse(await readFile(resolve(path), 'utf8')) as IntentCriticalExample
}

function expectIntentPreservationFixture(example: IntentCriticalExample): void {
  expect(example.schemaVersion).toBe(1)
  expect(example.artifactRole).toBe('intent-critical-graph-source-example')
  expect(example.status).toBe('intent-preservation-fixture')
  expect(example.maintenanceScenario).toMatch(/maintainer/i)
  expect(example.vibeCodingRisk).toMatch(/AI-assisted|vibe/i)
  expect(example.intentRecords).toHaveLength(1)

  const [intent] = example.intentRecords
  expect(intent.id).toMatch(/^INTENT-/)
  expect(intent.statement.length).toBeGreaterThan(40)
  expect(intent.maintenanceRiskIfMissing).toMatch(/may|might|risk|breaking|loss/i)
  expect(intent.preservationRule).toMatch(/Do not|must|unless/i)
  expect(intent.nonGoal).toMatch(/Do not/i)
  expect(intent.fallbackReason).toMatch(/fallback|reference/i)
  expect(intent.evidenceReason).toMatch(/Evidence|check|validation|review/i)
  expect(intent.compatibilityReason).toMatch(/compatibility|Task-card|Retrofit|legacy|audit/i)

  expect(example.readModelIntentFields.required).toContain('statement')
  expect(example.readModelIntentFields.required).toContain('maintenanceRiskIfMissing')
  expect(example.readModelIntentFields.required).toContain('preservationRule')
  expect(example.readModelIntentFields.projectionBoundary).toMatch(/Read-model projections/i)

  const boundaryText = [
    example.boundaries.sourceAuthorityBoundary,
    example.boundaries.nonPromotionStatement,
    example.boundaries.userAcceptanceBoundary,
  ].join(' ')
  expect(boundaryText).toMatch(/does not|not/i)
  expect(boundaryText).toMatch(/enforcement|required-check|tree retirement|retire|source authority/i)
  expect(boundaryText).toMatch(/Only the user/i)
}

describe('intent-critical Graph-source examples', () => {
  it('records native PBE intent before maintenance can erase UX acceptance meaning', async () => {
    const example = await readIntentExample('examples/intent-critical/native-pbe-maintenance/graph-source-intent.json')

    expectIntentPreservationFixture(example)
    expect(example.exampleKind).toBe('native-pbe')
    expect(example.sourceMode).toBe('graph-source-intent-first')
    expect(example.intentRecords[0].intentType).toBe('ux-acceptance-intent')
    expect(example.intentRecords[0].statement).toContain('empty')
    expect(example.intentRecords[0].statement).toContain('full list')
    expect(example.intentRecords[0].nonGoal).toContain('hides all todos')
  })

  it('records retrofit PBE recovered intent before cleanup can delete fallback compatibility evidence', async () => {
    const example = await readIntentExample(
      'examples/intent-critical/retrofit-pbe-maintenance/graph-source-intent.json',
    )

    expectIntentPreservationFixture(example)
    expect(example.exampleKind).toBe('retrofit-pbe')
    expect(example.sourceMode).toBe('retrofit-intent-recovered')
    expect(example.intentRecords[0].intentType).toBe('compatibility-rollback-intent')
    expect(example.intentRecords[0].statement).toContain('compatibility export')
    expect(example.intentRecords[0].preservationRule).toContain('explicit retirement decision')
    expect(example.intentRecords[0].nonGoal).toContain('permission to delete')
  })
})
