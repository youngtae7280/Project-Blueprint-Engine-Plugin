import type { PbeGraphEdge, PbeGraphNode, PbeKnowledgeGraph } from './graph-types.js'

export interface PbeGraphIssue {
  code: string
  severity: 'info' | 'warning' | 'error'
  message: string
  nodeId?: string
  edgeId?: string
  suggestedFix?: string
}

export function validatePbeKnowledgeGraph(graph: PbeKnowledgeGraph): PbeGraphIssue[] {
  const issues: PbeGraphIssue[] = []
  const nodeIds = new Set<string>()
  const duplicateNodeIds = new Set<string>()
  for (const node of graph.nodes) {
    if (nodeIds.has(node.id)) {
      duplicateNodeIds.add(node.id)
    }
    nodeIds.add(node.id)
  }
  for (const nodeId of duplicateNodeIds) {
    issues.push({
      code: 'GRAPH_DUPLICATE_NODE_ID',
      severity: 'error',
      message: `Duplicate Graph node id: ${nodeId}.`,
      nodeId,
      suggestedFix: 'Keep one canonical node per Graph id or assign stable distinct ids.',
    })
  }

  const edgeIds = new Set<string>()
  const duplicateEdgeIds = new Set<string>()
  for (const edge of graph.edges) {
    if (edgeIds.has(edge.id)) {
      duplicateEdgeIds.add(edge.id)
    }
    edgeIds.add(edge.id)
  }
  for (const edgeId of duplicateEdgeIds) {
    issues.push({
      code: 'GRAPH_DUPLICATE_EDGE_ID',
      severity: 'error',
      message: `Duplicate Graph edge id: ${edgeId}.`,
      edgeId,
      suggestedFix: 'Keep one canonical edge per Graph id or assign stable distinct ids.',
    })
  }

  for (const edge of graph.edges) {
    if (!nodeIds.has(edge.from)) {
      issues.push({
        code: 'GRAPH_EDGE_FROM_MISSING',
        severity: 'error',
        message: `Graph edge ${edge.id} references missing from node ${edge.from}.`,
        edgeId: edge.id,
        suggestedFix: 'Create the source node or remove the stale edge.',
      })
    }
    if (!nodeIds.has(edge.to)) {
      issues.push({
        code: 'GRAPH_EDGE_TO_MISSING',
        severity: 'error',
        message: `Graph edge ${edge.id} references missing to node ${edge.to}.`,
        edgeId: edge.id,
        suggestedFix: 'Create the target node or remove the stale edge.',
      })
    }
  }

  for (const product of graph.nodes.filter((node) => node.type === 'product' && node.status === 'confirmed')) {
    if (!isProductConnectedToFlowOrWork(product, graph.nodes, graph.edges)) {
      issues.push({
        code: 'GRAPH_CONFIRMED_PRODUCT_WITHOUT_FLOW_OR_WORK',
        severity: 'warning',
        message: `Confirmed Product node ${product.id} is not connected to a Flow or Work node.`,
        nodeId: product.id,
        suggestedFix: 'Link the Product node to intended/observed Flow or implementing Work before closure.',
      })
    }
  }

  for (const work of graph.nodes.filter((node) => node.type === 'work' && isCompletedOrConfirmedWork(node))) {
    if (!isNodeConnectedToType(work.id, 'test', graph.nodes, graph.edges)) {
      issues.push({
        code: 'GRAPH_WORK_WITHOUT_TEST',
        severity: 'warning',
        message: `Completed or confirmed Work node ${work.id} is not connected to a Test node.`,
        nodeId: work.id,
        suggestedFix: 'Add a verifiedBy edge to a Test node or record why verification is not applicable.',
      })
    }
  }

  for (const test of graph.nodes.filter((node) => node.type === 'test')) {
    if (!testHasEvidence(test, graph.nodes, graph.edges)) {
      issues.push({
        code: 'GRAPH_TEST_WITHOUT_EVIDENCE',
        severity: 'warning',
        message: `Test node ${test.id} is not connected to Evidence and has no evidence requirement metadata.`,
        nodeId: test.id,
        suggestedFix: 'Link the Test node to Evidence or declare the required evidence type.',
      })
    }
  }

  for (const unknown of graph.nodes.filter((node) => node.type === 'unknown' && node.status === 'blocked')) {
    const linkedWorkIds = workIdsBlockedByUnknown(unknown.id, graph.nodes, graph.edges)
    for (const workId of linkedWorkIds) {
      issues.push({
        code: 'GRAPH_WORK_BLOCKED_BY_UNKNOWN',
        severity: 'warning',
        message: `Work node ${workId} is connected to blocked Unknown node ${unknown.id}.`,
        nodeId: workId,
        suggestedFix: 'Resolve, defer, or explicitly accept the Unknown before treating the Work node as closed.',
      })
    }
  }

  return issues
}

function isProductConnectedToFlowOrWork(product: PbeGraphNode, nodes: PbeGraphNode[], edges: PbeGraphEdge[]): boolean {
  return edges.some((edge) => {
    if (edge.from !== product.id && edge.to !== product.id) {
      return false
    }
    const otherNodeId = edge.from === product.id ? edge.to : edge.from
    const otherNode = nodes.find((node) => node.id === otherNodeId)
    return Boolean(otherNode && ['flow', 'work'].includes(otherNode.type))
  })
}

function isCompletedOrConfirmedWork(node: PbeGraphNode): boolean {
  const original = node.metadata?.original
  const originalStatus =
    typeof original === 'object' && original !== null && !Array.isArray(original)
      ? String((original as Record<string, unknown>).status || '')
      : ''
  return node.status === 'confirmed' || ['completed', 'complete', 'implemented', 'verified'].includes(originalStatus)
}

function isNodeConnectedToType(
  nodeId: string,
  targetType: PbeGraphNode['type'],
  nodes: PbeGraphNode[],
  edges: PbeGraphEdge[],
): boolean {
  return edges.some((edge) => {
    if (edge.from !== nodeId && edge.to !== nodeId) {
      return false
    }
    const otherNodeId = edge.from === nodeId ? edge.to : edge.from
    return nodes.some((node) => node.id === otherNodeId && node.type === targetType)
  })
}

function testHasEvidence(test: PbeGraphNode, nodes: PbeGraphNode[], edges: PbeGraphEdge[]): boolean {
  if (isNodeConnectedToType(test.id, 'evidence', nodes, edges)) {
    return true
  }
  const original = test.metadata?.original
  if (typeof original !== 'object' || original === null || Array.isArray(original)) {
    return false
  }
  const source = original as Record<string, unknown>
  return ['evidenceRequired', 'requiredEvidence', 'evidenceType', 'evidenceTypes'].some((key) => {
    const value = source[key]
    return (typeof value === 'string' && value.length > 0) || (Array.isArray(value) && value.length > 0)
  })
}

function workIdsBlockedByUnknown(unknownId: string, nodes: PbeGraphNode[], edges: PbeGraphEdge[]): string[] {
  return edges
    .filter(
      (edge) =>
        (edge.from === unknownId || edge.to === unknownId) &&
        ['blockedBy', 'affects'].includes(edge.type) &&
        edge.status !== 'not-applicable',
    )
    .map((edge) => (edge.from === unknownId ? edge.to : edge.from))
    .filter((nodeId) => nodes.some((node) => node.id === nodeId && node.type === 'work'))
}
