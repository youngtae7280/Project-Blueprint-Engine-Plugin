export type PbeNodeType =
  | 'product'
  | 'project'
  | 'flow'
  | 'work'
  | 'test'
  | 'evidence'
  | 'risk'
  | 'unknown'
  | 'assumption'
  | 'decision'
  | 'file'
  | 'operation'

export type PbeEdgeType =
  | 'decomposesTo'
  | 'belongsTo'
  | 'realizedBy'
  | 'implementedBy'
  | 'touches'
  | 'verifiedBy'
  | 'evidencedBy'
  | 'affects'
  | 'blockedBy'
  | 'protectedBy'
  | 'assumes'
  | 'resolves'
  | 'rejects'
  | 'derivedFrom'
  | 'updates'

export type PbeNodeStatus =
  | 'draft'
  | 'inferred'
  | 'observed'
  | 'candidate'
  | 'assumed'
  | 'confirmed'
  | 'rejected'
  | 'deprecated'
  | 'blocked'
  | 'resolved'
  | 'stale'

export type PbeEdgeStatus =
  | 'inferred'
  | 'assumed'
  | 'confirmed'
  | 'missing'
  | 'ambiguous'
  | 'conflict'
  | 'blocked'
  | 'not-applicable'

export type PbeGraphConfidence = 'low' | 'medium' | 'high'

export interface PbeGraphNode {
  id: string
  type: PbeNodeType
  title: string
  summary?: string
  status: PbeNodeStatus
  source?: string[]
  confidence?: PbeGraphConfidence
  metadata?: Record<string, unknown>
}

export interface PbeGraphEdge {
  id: string
  from: string
  to: string
  type: PbeEdgeType
  status: PbeEdgeStatus
  source?: string[]
  confidence?: PbeGraphConfidence
  metadata?: Record<string, unknown>
}

export interface PbeKnowledgeGraph {
  nodes: PbeGraphNode[]
  edges: PbeGraphEdge[]
  meta?: {
    schemaVersion: string
    generatedAt?: string
    source?: string
  }
}
