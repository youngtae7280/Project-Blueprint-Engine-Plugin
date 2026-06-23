import { describe, expect, it } from 'vitest'
import type { PbeKnowledgeGraph } from '../graph-types'
import { validatePbeKnowledgeGraph } from '../graph-validator'

describe('Graph validator', () => {
  it('passes a basic connected Graph snapshot', () => {
    const graph = connectedGraph()

    expect(validatePbeKnowledgeGraph(graph)).toEqual([])
  })

  it('detects duplicate node ids', () => {
    const graph = connectedGraph()
    graph.nodes.push({ ...graph.nodes[0] })

    expect(validatePbeKnowledgeGraph(graph).map((entry) => entry.code)).toContain('GRAPH_DUPLICATE_NODE_ID')
  })

  it('detects missing edge endpoints', () => {
    const graph = connectedGraph()
    graph.edges.push({
      id: 'edge:missing',
      from: 'missing-from',
      to: 'missing-to',
      type: 'affects',
      status: 'inferred',
    })

    const codes = validatePbeKnowledgeGraph(graph).map((entry) => entry.code)
    expect(codes).toContain('GRAPH_EDGE_FROM_MISSING')
    expect(codes).toContain('GRAPH_EDGE_TO_MISSING')
  })

  it('warns when confirmed product has no Flow or Work link', () => {
    const issues = validatePbeKnowledgeGraph({
      nodes: [{ id: 'P-1', type: 'product', title: 'Product', status: 'confirmed' }],
      edges: [],
    })

    expect(issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'GRAPH_CONFIRMED_PRODUCT_WITHOUT_FLOW_OR_WORK',
          severity: 'warning',
        }),
      ]),
    )
  })

  it('warns when confirmed Work has no Test link', () => {
    const issues = validatePbeKnowledgeGraph({
      nodes: [{ id: 'W-1', type: 'work', title: 'Work', status: 'confirmed' }],
      edges: [],
    })

    expect(issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'GRAPH_WORK_WITHOUT_TEST',
          severity: 'warning',
        }),
      ]),
    )
  })

  it('warns when Test has no Evidence or evidence requirement metadata', () => {
    const issues = validatePbeKnowledgeGraph({
      nodes: [{ id: 'T-1', type: 'test', title: 'Test', status: 'confirmed' }],
      edges: [],
    })

    expect(issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'GRAPH_TEST_WITHOUT_EVIDENCE',
          severity: 'warning',
        }),
      ]),
    )
  })

  it('warns when blocked Unknown affects Work', () => {
    const issues = validatePbeKnowledgeGraph({
      nodes: [
        { id: 'U-1', type: 'unknown', title: 'Unknown', status: 'blocked' },
        { id: 'W-1', type: 'work', title: 'Work', status: 'draft' },
      ],
      edges: [{ id: 'E-1', from: 'U-1', to: 'W-1', type: 'affects', status: 'confirmed' }],
    })

    expect(issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'GRAPH_WORK_BLOCKED_BY_UNKNOWN',
          severity: 'warning',
          nodeId: 'W-1',
        }),
      ]),
    )
  })
})

function connectedGraph(): PbeKnowledgeGraph {
  return {
    nodes: [
      { id: 'P-1', type: 'product', title: 'Product', status: 'confirmed' },
      { id: 'F-1', type: 'flow', title: 'Flow', status: 'confirmed' },
      { id: 'W-1', type: 'work', title: 'Work', status: 'confirmed' },
      { id: 'T-1', type: 'test', title: 'Test', status: 'confirmed' },
      { id: 'EV-1', type: 'evidence', title: 'Evidence', status: 'confirmed' },
    ],
    edges: [
      { id: 'E-1', from: 'P-1', to: 'F-1', type: 'realizedBy', status: 'confirmed' },
      { id: 'E-2', from: 'F-1', to: 'W-1', type: 'implementedBy', status: 'confirmed' },
      { id: 'E-3', from: 'W-1', to: 'T-1', type: 'verifiedBy', status: 'confirmed' },
      { id: 'E-4', from: 'T-1', to: 'EV-1', type: 'evidencedBy', status: 'confirmed' },
    ],
  }
}
