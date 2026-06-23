import type { PbeEdgeType, PbeGraphNode, PbeKnowledgeGraph, PbeNodeStatus, PbeNodeType } from './graph-types.js'

type JsonObject = Record<string, unknown>

type TreeInputKey = 'productTree' | 'projectTree' | 'workTree' | 'testTree' | 'evidence'

interface TreeDescriptor {
  key: TreeInputKey
  nodeType: PbeNodeType
  source: string
}

const treeDescriptors: TreeDescriptor[] = [
  { key: 'productTree', nodeType: 'product', source: '.pbe/tree/product-tree.json' },
  { key: 'projectTree', nodeType: 'project', source: '.pbe/tree/project-tree.json' },
  { key: 'workTree', nodeType: 'work', source: '.pbe/tree/work-tree.json' },
  { key: 'testTree', nodeType: 'test', source: '.pbe/tree/test-tree.json' },
  { key: 'evidence', nodeType: 'evidence', source: '.pbe/evidence/evidence-tree.json' },
]

export function createGraphFromBlueprint(input: {
  productTree?: unknown
  projectTree?: unknown
  workTree?: unknown
  testTree?: unknown
  evidence?: unknown
}): PbeKnowledgeGraph {
  const graph: PbeKnowledgeGraph = {
    nodes: [],
    edges: [],
    meta: {
      schemaVersion: '0.1.0-experimental-graph-snapshot',
      generatedAt: new Date().toISOString(),
      source: 'tree-first-blueprint-adapter',
    },
  }
  const edgeKeys = new Map<string, number>()

  for (const descriptor of treeDescriptors) {
    const root = input[descriptor.key]
    for (const node of nodesFrom(root, descriptor.key)) {
      const id = stringValue(node.id)
      if (!id) {
        continue
      }
      graph.nodes.push(toGraphNode(node, descriptor.nodeType, descriptor.source))
    }
  }

  for (const descriptor of treeDescriptors) {
    const root = input[descriptor.key]
    for (const node of nodesFrom(root, descriptor.key)) {
      const id = stringValue(node.id)
      if (!id) {
        continue
      }
      addStructuralEdges(graph, edgeKeys, id, descriptor.nodeType, node, descriptor.source)
      addTraceEdges(graph, edgeKeys, id, descriptor.nodeType, node, descriptor.source)
      addGenericTraceFieldEdges(graph, edgeKeys, id, descriptor.nodeType, node, descriptor.source)
    }
  }

  return graph
}

function toGraphNode(node: JsonObject, type: PbeNodeType, source: string): PbeGraphNode {
  return {
    id: stringValue(node.id),
    type,
    title: firstString(node.title, node.name, node.summary, node.id),
    summary: firstString(node.summary, node.description, node.why),
    status: normalizeNodeStatus(firstString(node.status, node.scopeClass, node.deliveryStatus)),
    source: [source],
    confidence: confidenceOf(node),
    metadata: {
      original: node,
      adapterNote: 'Experimental Graph-first snapshot of existing Tree-first PBE artifact.',
    },
  }
}

function addStructuralEdges(
  graph: PbeKnowledgeGraph,
  edgeKeys: Map<string, number>,
  nodeId: string,
  nodeType: PbeNodeType,
  node: JsonObject,
  source: string,
): void {
  for (const childId of stringsFromUnknown(node.children)) {
    addEdge(graph, edgeKeys, {
      from: nodeId,
      to: childId,
      type: 'decomposesTo',
      source,
      metadata: { relationField: 'children', fromNodeType: nodeType, toNodeType: nodeType },
    })
  }

  const parentId = firstString(node.parentId, node.parentNodeId)
  if (parentId) {
    addEdge(graph, edgeKeys, {
      from: nodeId,
      to: parentId,
      type: 'belongsTo',
      source,
      metadata: { relationField: 'parentId', fromNodeType: nodeType, toNodeType: nodeType },
    })
  }
}

function addGenericTraceFieldEdges(
  graph: PbeKnowledgeGraph,
  edgeKeys: Map<string, number>,
  nodeId: string,
  nodeType: PbeNodeType,
  node: JsonObject,
  source: string,
): void {
  for (const field of ['references', 'referenceNodeIds', 'links', 'linkNodeIds', 'linkedNodeIds']) {
    for (const targetId of idsFromFields(node, [field])) {
      addEdge(graph, edgeKeys, {
        from: nodeId,
        to: targetId,
        type: 'derivedFrom',
        source,
        metadata: { relationField: field, conversionNote: 'Generic reference/link field mapped as derivedFrom.' },
      })
    }
  }

  for (const field of ['affectsNodeIds', 'affectedNodeIds']) {
    for (const targetId of idsFromFields(node, [field])) {
      addEdge(graph, edgeKeys, {
        from: nodeId,
        to: targetId,
        type: 'affects',
        source,
        metadata: { relationField: field },
      })
    }
  }

  for (const field of ['blockedByNodeIds', 'blockedByIds', 'riskNodeIds', 'unknownNodeIds']) {
    for (const targetId of idsFromFields(node, [field])) {
      addEdge(graph, edgeKeys, {
        from: nodeId,
        to: targetId,
        type: 'blockedBy',
        source,
        metadata: { relationField: field },
      })
    }
  }

  for (const field of ['verifies', 'verifiesNodeIds', 'verifiedNodeIds']) {
    for (const targetId of idsFromFields(node, [field])) {
      addEdge(graph, edgeKeys, {
        from: nodeType === 'test' ? targetId : nodeId,
        to: nodeType === 'test' ? nodeId : targetId,
        type: 'verifiedBy',
        source,
        metadata: { relationField: field },
      })
    }
  }

  for (const field of ['evidencedBy', 'evidencedByNodeIds']) {
    for (const targetId of idsFromFields(node, [field])) {
      addEdge(graph, edgeKeys, {
        from: nodeId,
        to: targetId,
        type: 'evidencedBy',
        source,
        metadata: { relationField: field },
      })
    }
  }
}

function addTraceEdges(
  graph: PbeKnowledgeGraph,
  edgeKeys: Map<string, number>,
  nodeId: string,
  nodeType: PbeNodeType,
  node: JsonObject,
  source: string,
): void {
  if (nodeType === 'product') {
    for (const flowId of idsFromFields(node, ['flowNodeIds', 'flowIds', 'realizedByFlowNodeIds'])) {
      addEdge(graph, edgeKeys, { from: nodeId, to: flowId, type: 'realizedBy', source })
    }
    for (const workId of idsFromFields(node, ['workNodeIds', 'workIds', 'implementedByWorkNodeIds'])) {
      addEdge(graph, edgeKeys, { from: nodeId, to: workId, type: 'implementedBy', source })
    }
    for (const testId of idsFromFields(node, ['testNodeIds', 'testIds', 'verificationNodeIds'])) {
      addEdge(graph, edgeKeys, { from: nodeId, to: testId, type: 'verifiedBy', source })
    }
  }

  if (nodeType === 'project') {
    for (const productId of idsFromFields(node, ['productNodeIds', 'productIds', 'requirementNodeIds'])) {
      addEdge(graph, edgeKeys, { from: nodeId, to: productId, type: 'derivedFrom', source })
    }
  }

  if (nodeType === 'work') {
    for (const productId of idsFromFields(node, ['productNodeIds', 'productIds', 'requirementNodeIds'])) {
      addEdge(graph, edgeKeys, { from: productId, to: nodeId, type: 'implementedBy', source })
    }
    for (const projectId of idsFromFields(node, ['projectNodeIds', 'projectIds'])) {
      addEdge(graph, edgeKeys, { from: nodeId, to: projectId, type: 'derivedFrom', source })
    }
    for (const flowId of idsFromFields(node, ['flowNodeIds', 'flowIds'])) {
      addEdge(graph, edgeKeys, { from: flowId, to: nodeId, type: 'implementedBy', source })
    }
    for (const testId of idsFromFields(node, ['testNodeIds', 'testIds', 'verificationNodeIds'])) {
      addEdge(graph, edgeKeys, { from: nodeId, to: testId, type: 'verifiedBy', source })
    }
    for (const filePath of idsFromFields(node, [
      'expectedFiles',
      'expectedSharedFiles',
      'allowedFiles',
      'files',
      'touchedFiles',
    ])) {
      const fileId = fileNodeId(filePath)
      ensureFileNode(graph, fileId, filePath, source)
      addEdge(graph, edgeKeys, { from: nodeId, to: fileId, type: 'touches', source })
    }
  }

  if (nodeType === 'test') {
    for (const productId of idsFromFields(node, ['productNodeIds', 'productIds', 'requirementNodeIds'])) {
      addEdge(graph, edgeKeys, { from: productId, to: nodeId, type: 'verifiedBy', source })
    }
    for (const flowId of idsFromFields(node, ['flowNodeIds', 'flowIds'])) {
      addEdge(graph, edgeKeys, { from: flowId, to: nodeId, type: 'verifiedBy', source })
    }
    for (const workId of idsFromFields(node, ['workNodeIds', 'workIds'])) {
      addEdge(graph, edgeKeys, { from: workId, to: nodeId, type: 'verifiedBy', source })
    }
    for (const evidenceId of idsFromFields(node, ['evidenceNodeIds', 'evidenceIds'])) {
      addEdge(graph, edgeKeys, { from: nodeId, to: evidenceId, type: 'evidencedBy', source })
    }
  }

  if (nodeType === 'evidence') {
    for (const testId of idsFromFields(node, ['testNodeIds', 'testIds', 'verificationNodeIds'])) {
      addEdge(graph, edgeKeys, { from: testId, to: nodeId, type: 'evidencedBy', source })
    }
    for (const productId of idsFromFields(node, ['productNodeIds', 'productIds', 'requirementNodeIds'])) {
      addEdge(graph, edgeKeys, { from: productId, to: nodeId, type: 'evidencedBy', source })
    }
    for (const workId of idsFromFields(node, ['workNodeIds', 'workIds'])) {
      addEdge(graph, edgeKeys, { from: workId, to: nodeId, type: 'evidencedBy', source })
    }
  }
}

function addEdge(
  graph: PbeKnowledgeGraph,
  edgeKeys: Map<string, number>,
  input: {
    from: string
    to: string
    type: PbeEdgeType
    source: string
    metadata?: Record<string, unknown>
  },
): void {
  if (!input.from || !input.to) {
    return
  }
  const baseId = `edge:${input.from}:${input.type}:${input.to}`
  const count = edgeKeys.get(baseId) || 0
  edgeKeys.set(baseId, count + 1)
  const id = count === 0 ? baseId : `${baseId}:${count + 1}`
  graph.edges.push({
    id,
    from: input.from,
    to: input.to,
    type: input.type,
    status: 'inferred',
    source: [input.source],
    confidence: 'medium',
    metadata: {
      adapterNote: 'Inferred from existing Tree-first trace fields. Review before treating as confirmed Graph truth.',
      ...input.metadata,
    },
  })
}

function ensureFileNode(graph: PbeKnowledgeGraph, id: string, filePath: string, source: string): void {
  if (graph.nodes.some((node) => node.id === id)) {
    return
  }
  graph.nodes.push({
    id,
    type: 'file',
    title: filePath,
    status: 'inferred',
    source: [source],
    confidence: 'medium',
    metadata: {
      path: filePath,
      adapterNote: 'Synthetic File node derived from Work file-scope metadata.',
    },
  })
}

function nodesFrom(root: unknown, key: TreeInputKey): JsonObject[] {
  if (!isObject(root)) {
    return []
  }

  const candidates = [
    root.nodes,
    root.items,
    root.entries,
    key === 'evidence' ? root.evidence : undefined,
    key === 'testTree' ? root.tests : undefined,
  ]

  for (const candidate of candidates) {
    if (Array.isArray(candidate)) {
      return candidate.filter(isObject)
    }
  }
  return []
}

function normalizeNodeStatus(value: string): PbeNodeStatus {
  if (
    [
      'confirmed',
      'accepted',
      'accepted_done',
      'current',
      'passed',
      'complete',
      'completed',
      'implemented',
      'verified',
    ].includes(value)
  ) {
    return 'confirmed'
  }
  if (['observed', 'runtime_observed'].includes(value)) {
    return 'observed'
  }
  if (['candidate', 'proposed'].includes(value)) {
    return 'candidate'
  }
  if (['assumed', 'assumption'].includes(value)) {
    return 'assumed'
  }
  if (['rejected', 'invalid'].includes(value)) {
    return 'rejected'
  }
  if (['deprecated', 'superseded'].includes(value)) {
    return 'deprecated'
  }
  if (['blocked'].includes(value)) {
    return 'blocked'
  }
  if (['resolved'].includes(value)) {
    return 'resolved'
  }
  if (['stale', 'invalidated', 'stale_evidence'].includes(value)) {
    return 'stale'
  }
  if (['draft', 'needs_clarification', 'open'].includes(value)) {
    return 'draft'
  }
  return value ? 'inferred' : 'draft'
}

function confidenceOf(node: JsonObject): 'low' | 'medium' | 'high' {
  const confidence = stringValue(node.confidence)
  if (confidence === 'low' || confidence === 'medium' || confidence === 'high') {
    return confidence
  }
  return normalizeNodeStatus(stringValue(node.status)) === 'confirmed' ? 'high' : 'medium'
}

function idsFromFields(node: JsonObject, fields: string[]): string[] {
  return [
    ...new Set(
      fields
        .flatMap((field) => stringsFromUnknown(node[field]))
        .map((entry) => entry.trim())
        .filter(Boolean),
    ),
  ]
}

function stringsFromUnknown(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map(stringValue).filter(Boolean)
  }
  const scalar = stringValue(value)
  return scalar ? [scalar] : []
}

function fileNodeId(filePath: string): string {
  return `file:${filePath.replaceAll('\\', '/')}`
}

function firstString(...values: unknown[]): string {
  return values.map(stringValue).find(Boolean) || ''
}

function stringValue(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

function isObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
