import type { PbeGraphEdge, PbeGraphNode } from './graph-types.js'

export interface PbeGraphOperationPlan {
  id: string
  summary: string
  operationKind: PbeOperationKind
  requestedBy: 'user' | 'assistant' | 'system'
  createNodes: PbeGraphNode[]
  updateNodes: PbeGraphNodeUpdate[]
  createEdges: PbeGraphEdge[]
  updateEdges: PbeGraphEdgeUpdate[]
  affectedNodeIds: string[]
  requiredViewIds: string[]
  assumptions: PbeAssumption[]
  unknowns: PbeUnknown[]
  risks: PbeRisk[]
  requiredEvidence: PbeEvidenceRequirement[]
  scope?: PbeOperationScope
}

export type PbeOperationKind =
  | 'feature-addition'
  | 'bug-fix'
  | 'behavior-change'
  | 'refactor'
  | 'ui-change'
  | 'test-hardening'
  | 'doc-sync'
  | 'risk-change'
  | 'baseline-reconstruction'
  | 'impact-detection'
  | 'sync-diff'
  | 'unknown'

export interface PbeGraphNodeUpdate {
  nodeId: string
  patch: Partial<PbeGraphNode>
}

export interface PbeGraphEdgeUpdate {
  edgeId: string
  patch: Partial<PbeGraphEdge>
}

export interface PbeAssumption {
  id: string
  summary: string
  status: 'assumed' | 'confirmed' | 'rejected'
  source: 'ai-default' | 'user-confirmed' | 'legacy-inferred'
  linkedNodeIds: string[]
  linkedEdgeIds: string[]
  canBeChangedByUserFeedback: boolean
}

export interface PbeUnknown {
  id: string
  summary: string
  status: 'unknown' | 'resolved' | 'accepted-risk' | 'deferred' | 'blocked' | 'deprecated' | 'rejected'
  linkedNodeIds: string[]
  blocksOperation?: boolean
}

export interface PbeRisk {
  id: string
  summary: string
  severity: 'low' | 'medium' | 'high'
  linkedNodeIds: string[]
  requiresHumanConfirmation?: boolean
}

export interface PbeEvidenceRequirement {
  id: string
  summary: string
  evidenceType: 'test-result' | 'cli-output' | 'screenshot' | 'manual-review' | 'log' | 'other'
  requiredForNodeIds: string[]
}

export interface PbeOperationScope {
  allowedNodeIds?: string[]
  forbiddenNodeIds?: string[]
  allowedFiles?: string[]
  forbiddenFiles?: string[]
}
