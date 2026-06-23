import { describe, expect, it } from 'vitest'
import type { PbeAssumption, PbeUnknown } from '../graph-operation-types'
import { defaultGraphViewDefinitions } from '../graph-view-types'

describe('Graph types', () => {
  it('covers assumption status transitions', () => {
    const assumptions = [
      {
        id: 'A-1',
        summary: 'Empty search shows all records.',
        status: 'assumed',
        source: 'ai-default',
        linkedNodeIds: [],
        linkedEdgeIds: [],
        canBeChangedByUserFeedback: true,
      },
      {
        id: 'A-2',
        summary: 'User confirmed default sorting.',
        status: 'confirmed',
        source: 'user-confirmed',
        linkedNodeIds: [],
        linkedEdgeIds: [],
        canBeChangedByUserFeedback: false,
      },
      {
        id: 'A-3',
        summary: 'Legacy behavior is no longer desired.',
        status: 'rejected',
        source: 'legacy-inferred',
        linkedNodeIds: [],
        linkedEdgeIds: [],
        canBeChangedByUserFeedback: true,
      },
    ] satisfies PbeAssumption[]

    expect(assumptions.map((entry) => entry.status)).toEqual(['assumed', 'confirmed', 'rejected'])
  })

  it('covers unknown statuses', () => {
    const unknowns = [
      { id: 'U-1', summary: 'No owner found.', status: 'unknown', linkedNodeIds: [] },
      { id: 'U-2', summary: 'Owner found.', status: 'resolved', linkedNodeIds: [] },
      { id: 'U-3', summary: 'Risk accepted.', status: 'accepted-risk', linkedNodeIds: [] },
      { id: 'U-4', summary: 'Deferred for later slice.', status: 'deferred', linkedNodeIds: [] },
      { id: 'U-5', summary: 'Blocks operation.', status: 'blocked', linkedNodeIds: [], blocksOperation: true },
      { id: 'U-6', summary: 'Old unknown.', status: 'deprecated', linkedNodeIds: [] },
      { id: 'U-7', summary: 'Not applicable.', status: 'rejected', linkedNodeIds: [] },
    ] satisfies PbeUnknown[]

    expect(unknowns.map((entry) => entry.status)).toEqual([
      'unknown',
      'resolved',
      'accepted-risk',
      'deferred',
      'blocked',
      'deprecated',
      'rejected',
    ])
  })

  it('contains expected default Graph view ids', () => {
    expect(defaultGraphViewDefinitions.map((entry) => entry.id)).toEqual(
      expect.arrayContaining([
        'product-intent-view',
        'flow-behavior-view',
        'work-implementation-view',
        'test-coverage-view',
        'change-impact-view',
        'risk-unknown-view',
        'legacy-onboarding-view',
      ]),
    )
  })
})
