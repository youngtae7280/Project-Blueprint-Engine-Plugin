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
    edgeIntent: {
      edgeType: string
      intentKind: string
      riskKind: string
      claim: string
      confidence: string
      enforcement: string
      anchors: Array<{
        signalKind: string
        sourceRole: string
        artifact: string
      }>
    }
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

interface EdgeIntentProjection {
  schemaVersion: number
  artifactRole: string
  projectionStatus: string
  sourceArtifact: string
  sourceExampleKind: 'native-pbe' | 'retrofit-pbe'
  projectionBoundary: string
  edgeIntentProjections: Array<{
    sourceIntentRecordId: string
    edgeType: string
    intentKind: string
    riskKind: string
    claim: string
    confidence: string
    enforcement: string
    anchors: Array<{
      signalKind: string
      sourceRole: string
      artifact: string
    }>
    humanReadableSummary: string
  }>
  vocabularyBoundary: {
    classificationFields: string[]
    projectSpecificClaimField: string
    claimBoundary: string
  }
}

async function readIntentExample(path: string): Promise<IntentCriticalExample> {
  return JSON.parse(await readFile(resolve(path), 'utf8')) as IntentCriticalExample
}

async function readProjection(path: string): Promise<EdgeIntentProjection> {
  return JSON.parse(await readFile(resolve(path), 'utf8')) as EdgeIntentProjection
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
  expect(intent.edgeIntent.edgeType).toBe('preserves-intent')
  expect(intent.edgeIntent.intentKind).toMatch(/^[a-z-]+$/)
  expect(intent.edgeIntent.riskKind).toMatch(/^[a-z-]+$/)
  expect(intent.edgeIntent.claim.length).toBeGreaterThan(20)
  expect(intent.edgeIntent.claim).not.toBe(intent.statement)
  expect(intent.edgeIntent.confidence).toMatch(/user-confirmed|history-derived/)
  expect(intent.edgeIntent.enforcement).toMatch(/validation-evidence|review-required/)
  expect(intent.edgeIntent.anchors.length).toBeGreaterThanOrEqual(2)
  for (const anchor of intent.edgeIntent.anchors) {
    expect(anchor.signalKind).toMatch(/acceptance|evidence|compatibility|fallback/)
    expect(anchor.sourceRole).toMatch(/signal/)
    expect(anchor.artifact.length).toBeGreaterThan(5)
  }

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

function expectProjectionPreservesEdgeIntent(
  example: IntentCriticalExample,
  projection: EdgeIntentProjection,
  sourceArtifact: string,
): void {
  const [intent] = example.intentRecords
  const [projected] = projection.edgeIntentProjections

  expect(projection.schemaVersion).toBe(1)
  expect(projection.artifactRole).toBe('edge-intent-read-model-projection')
  expect(projection.projectionStatus).toBe('intent-projection-pass')
  expect(projection.sourceArtifact).toBe(sourceArtifact)
  expect(projection.sourceExampleKind).toBe(example.exampleKind)
  expect(projection.projectionBoundary).toContain('does not')
  expect(projection.edgeIntentProjections).toHaveLength(1)

  expect(projected.sourceIntentRecordId).toBe(intent.id)
  expect(projected.edgeType).toBe(intent.edgeIntent.edgeType)
  expect(projected.intentKind).toBe(intent.edgeIntent.intentKind)
  expect(projected.riskKind).toBe(intent.edgeIntent.riskKind)
  expect(projected.claim).toBe(intent.edgeIntent.claim)
  expect(projected.claim).not.toBe(projected.intentKind)
  expect(projected.claim).not.toBe(projected.riskKind)
  expect(projected.confidence).toBe(intent.edgeIntent.confidence)
  expect(projected.enforcement).toBe(intent.edgeIntent.enforcement)
  expect(projected.anchors).toEqual(intent.edgeIntent.anchors)
  expect(projected.humanReadableSummary).toContain(projected.claim)
  expect(projected.humanReadableSummary).toContain(projected.riskKind)
  expect(projected.humanReadableSummary).toContain(projected.confidence)
  expect(projected.humanReadableSummary).toContain(projected.enforcement)

  expect(projection.vocabularyBoundary.classificationFields).toEqual([
    'edgeType',
    'intentKind',
    'riskKind',
    'confidence',
    'enforcement',
    'anchors.signalKind',
  ])
  expect(projection.vocabularyBoundary.projectSpecificClaimField).toBe('claim')
  expect(projection.vocabularyBoundary.claimBoundary).toContain('not replaced by a global enum')
}

describe('intent-critical Graph-source examples', () => {
  it('records native PBE intent before maintenance can erase UX acceptance meaning', async () => {
    const example = await readIntentExample('examples/intent-critical/native-pbe-maintenance/graph-source-intent.json')
    const projection = await readProjection(
      'examples/intent-critical/native-pbe-maintenance/generated/edge-intent-read-model-projection.json',
    )

    expectIntentPreservationFixture(example)
    expectProjectionPreservesEdgeIntent(
      example,
      projection,
      'examples/intent-critical/native-pbe-maintenance/graph-source-intent.json',
    )
    expect(example.exampleKind).toBe('native-pbe')
    expect(example.sourceMode).toBe('graph-source-intent-first')
    expect(example.intentRecords[0].intentType).toBe('ux-acceptance-intent')
    expect(example.intentRecords[0].edgeIntent.intentKind).toBe('ux-acceptance')
    expect(example.intentRecords[0].edgeIntent.riskKind).toBe('behavior-regression')
    expect(example.intentRecords[0].edgeIntent.confidence).toBe('user-confirmed')
    expect(example.intentRecords[0].edgeIntent.enforcement).toBe('validation-evidence')
    expect(example.intentRecords[0].statement).toContain('empty')
    expect(example.intentRecords[0].statement).toContain('full list')
    expect(example.intentRecords[0].nonGoal).toContain('hides all todos')
  })

  it('records retrofit PBE recovered intent before cleanup can delete fallback compatibility evidence', async () => {
    const example = await readIntentExample(
      'examples/intent-critical/retrofit-pbe-maintenance/graph-source-intent.json',
    )
    const projection = await readProjection(
      'examples/intent-critical/retrofit-pbe-maintenance/generated/edge-intent-read-model-projection.json',
    )

    expectIntentPreservationFixture(example)
    expectProjectionPreservesEdgeIntent(
      example,
      projection,
      'examples/intent-critical/retrofit-pbe-maintenance/graph-source-intent.json',
    )
    expect(example.exampleKind).toBe('retrofit-pbe')
    expect(example.sourceMode).toBe('retrofit-intent-recovered')
    expect(example.intentRecords[0].intentType).toBe('compatibility-rollback-intent')
    expect(example.intentRecords[0].edgeIntent.intentKind).toBe('compatibility-retention')
    expect(example.intentRecords[0].edgeIntent.riskKind).toBe('fallback-loss')
    expect(example.intentRecords[0].edgeIntent.confidence).toBe('history-derived')
    expect(example.intentRecords[0].edgeIntent.enforcement).toBe('review-required')
    expect(example.intentRecords[0].statement).toContain('compatibility export')
    expect(example.intentRecords[0].preservationRule).toContain('explicit retirement decision')
    expect(example.intentRecords[0].nonGoal).toContain('permission to delete')
  })
})
