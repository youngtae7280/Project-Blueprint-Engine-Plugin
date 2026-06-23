import type { PbeEdgeType, PbeNodeType } from './graph-types.js'

export interface PbeGraphViewDefinition {
  id: string
  name: string
  description?: string
  rootNodeTypes: PbeNodeType[]
  traversalRules: PbeGraphViewTraversalRule[]
}

export interface PbeGraphViewTraversalRule {
  fromType: PbeNodeType
  edgeType: PbeEdgeType
  toType: PbeNodeType
}

export const defaultGraphViewDefinitions = [
  {
    id: 'product-intent-view',
    name: 'Product Intent View',
    description: 'Expands product intent into behavior flow, work, tests, and evidence.',
    rootNodeTypes: ['product'],
    traversalRules: [
      { fromType: 'product', edgeType: 'realizedBy', toType: 'flow' },
      { fromType: 'flow', edgeType: 'implementedBy', toType: 'work' },
      { fromType: 'work', edgeType: 'verifiedBy', toType: 'test' },
      { fromType: 'test', edgeType: 'evidencedBy', toType: 'evidence' },
    ],
  },
  {
    id: 'flow-behavior-view',
    name: 'Flow Behavior View',
    description: 'Shows how user/system behavior is implemented and verified.',
    rootNodeTypes: ['flow'],
    traversalRules: [
      { fromType: 'flow', edgeType: 'implementedBy', toType: 'work' },
      { fromType: 'work', edgeType: 'touches', toType: 'file' },
      { fromType: 'file', edgeType: 'verifiedBy', toType: 'test' },
    ],
  },
  {
    id: 'work-implementation-view',
    name: 'Work Implementation View',
    description: 'Shows implementation responsibility, touched files, tests, and evidence.',
    rootNodeTypes: ['work'],
    traversalRules: [
      { fromType: 'work', edgeType: 'touches', toType: 'file' },
      { fromType: 'work', edgeType: 'verifiedBy', toType: 'test' },
      { fromType: 'test', edgeType: 'evidencedBy', toType: 'evidence' },
    ],
  },
  {
    id: 'test-coverage-view',
    name: 'Test Coverage View',
    description: 'Shows test and evidence coverage for Product, Flow, and Work nodes.',
    rootNodeTypes: ['product', 'flow', 'work'],
    traversalRules: [
      { fromType: 'product', edgeType: 'verifiedBy', toType: 'test' },
      { fromType: 'flow', edgeType: 'verifiedBy', toType: 'test' },
      { fromType: 'work', edgeType: 'verifiedBy', toType: 'test' },
      { fromType: 'test', edgeType: 'evidencedBy', toType: 'evidence' },
    ],
  },
  {
    id: 'change-impact-view',
    name: 'Change Impact View',
    description: 'Expands a changed file or work node through affected intent, tests, evidence, and risks.',
    rootNodeTypes: ['file', 'work'],
    traversalRules: [
      { fromType: 'file', edgeType: 'affects', toType: 'work' },
      { fromType: 'work', edgeType: 'affects', toType: 'flow' },
      { fromType: 'flow', edgeType: 'affects', toType: 'product' },
      { fromType: 'product', edgeType: 'verifiedBy', toType: 'test' },
      { fromType: 'test', edgeType: 'evidencedBy', toType: 'evidence' },
      { fromType: 'work', edgeType: 'blockedBy', toType: 'risk' },
      { fromType: 'work', edgeType: 'blockedBy', toType: 'unknown' },
    ],
  },
  {
    id: 'risk-unknown-view',
    name: 'Risk/Unknown View',
    description: 'Shows risks and unknowns plus the Product, Flow, and Work nodes they affect.',
    rootNodeTypes: ['risk', 'unknown'],
    traversalRules: [
      { fromType: 'risk', edgeType: 'affects', toType: 'product' },
      { fromType: 'risk', edgeType: 'affects', toType: 'flow' },
      { fromType: 'risk', edgeType: 'affects', toType: 'work' },
      { fromType: 'unknown', edgeType: 'affects', toType: 'product' },
      { fromType: 'unknown', edgeType: 'affects', toType: 'flow' },
      { fromType: 'unknown', edgeType: 'affects', toType: 'work' },
    ],
  },
  {
    id: 'legacy-onboarding-view',
    name: 'Legacy Onboarding View',
    description: 'Frames baseline reconstruction from entry points and observed flows toward candidate Product truth.',
    rootNodeTypes: ['operation', 'flow'],
    traversalRules: [
      { fromType: 'operation', edgeType: 'updates', toType: 'flow' },
      { fromType: 'flow', edgeType: 'implementedBy', toType: 'work' },
      { fromType: 'work', edgeType: 'derivedFrom', toType: 'product' },
      { fromType: 'flow', edgeType: 'blockedBy', toType: 'unknown' },
      { fromType: 'flow', edgeType: 'blockedBy', toType: 'risk' },
    ],
  },
] satisfies PbeGraphViewDefinition[]

export function getDefaultGraphViewDefinition(id: string): PbeGraphViewDefinition | undefined {
  return defaultGraphViewDefinitions.find((view) => view.id === id)
}
