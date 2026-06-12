import type { ValidationIssue } from './types.js'
import { issue } from './types.js'

export const pbeStates = [
  'INIT',
  'RPD_DONE',
  'WAITING_UI_UX_CONFIRM',
  'UI_UX_APPROVED',
  'VISUAL_CONTRACT_READY',
  'WPD_DONE',
  'UI_SURFACE_INVENTORY_DONE',
  'VD_DONE',
  'WAITING_IMPLEMENTATION_SCOPE',
  'SCOPE_SELECTED',
  'ACEP_READY',
  'ACEP_RUN_DONE',
  'VISUAL_AUDIT_DONE',
  'WAITING_REVIEW_RESULT',
  'DONE',
] as const

export type PbeState = typeof pbeStates[number]

export const stateAliases: Record<string, PbeState> = {
  IDLE: 'INIT',
  STARTED: 'INIT',
  WAITING_ROOT_CONFIRMATION: 'INIT',
  DRAFT_CREATED_FROM_ASSUMPTIONS: 'INIT',
  RPD_IN_PROGRESS: 'INIT',
  WAITING_RPD_DECISION: 'INIT',
  WAITING_UI_UX_CONFIRMATION: 'WAITING_UI_UX_CONFIRM',
  UI_UX_CONFIRMED: 'UI_UX_APPROVED',
  WPD_IN_PROGRESS: 'UI_UX_APPROVED',
  VD_IN_PROGRESS: 'WPD_DONE',
  DEPENDENCY_IMPACT_AUDITED: 'VD_DONE',
  WAITING_IMPLEMENTATION_SCOPE_CONFIRMATION: 'WAITING_IMPLEMENTATION_SCOPE',
  IMPLEMENTATION_SCOPE_CONFIRMED: 'SCOPE_SELECTED',
  WAITING_ARCHITECTURE_RUNWAY_CONFIRM: 'SCOPE_SELECTED',
  ARCHITECTURE_RUNWAY_APPROVED: 'SCOPE_SELECTED',
  PLAN_EXECUTED: 'SCOPE_SELECTED',
  COVERAGE_AUDITED: 'SCOPE_SELECTED',
  UX_AUDITED: 'SCOPE_SELECTED',
  ACEP_GENERATED: 'ACEP_READY',
  ACEP_VALIDATED: 'ACEP_READY',
  EXECUTION_IN_PROGRESS: 'ACEP_READY',
  EXECUTION_DONE: 'ACEP_RUN_DONE',
  WAITING_REVIEW: 'WAITING_REVIEW_RESULT',
  REVISION_REQUESTED: 'WAITING_REVIEW_RESULT',
  WAITING_NEXT_SLICE_DECISION: 'DONE',
  SLICE_ACCEPTED: 'DONE',
  COMPLETED: 'DONE',
  ACCEPTED: 'DONE',
  CLOSED: 'DONE',
} as const

export const transitions: Record<PbeState, PbeState[]> = {
  INIT: ['RPD_DONE'],
  RPD_DONE: ['WAITING_UI_UX_CONFIRM', 'UI_UX_APPROVED', 'WPD_DONE'],
  WAITING_UI_UX_CONFIRM: ['UI_UX_APPROVED'],
  UI_UX_APPROVED: ['VISUAL_CONTRACT_READY', 'WPD_DONE'],
  VISUAL_CONTRACT_READY: ['WPD_DONE'],
  WPD_DONE: ['UI_SURFACE_INVENTORY_DONE', 'VD_DONE'],
  UI_SURFACE_INVENTORY_DONE: ['VD_DONE'],
  VD_DONE: ['WAITING_IMPLEMENTATION_SCOPE', 'SCOPE_SELECTED'],
  WAITING_IMPLEMENTATION_SCOPE: ['SCOPE_SELECTED'],
  SCOPE_SELECTED: ['ACEP_READY'],
  ACEP_READY: ['ACEP_RUN_DONE'],
  ACEP_RUN_DONE: ['VISUAL_AUDIT_DONE', 'WAITING_REVIEW_RESULT'],
  VISUAL_AUDIT_DONE: ['WAITING_REVIEW_RESULT'],
  WAITING_REVIEW_RESULT: ['DONE'],
  DONE: [],
}

export function isPbeState(value: unknown): value is PbeState {
  return typeof value === 'string' && (isCanonicalPbeState(value) || value in stateAliases)
}

export function isCanonicalPbeState(value: unknown): value is PbeState {
  return typeof value === 'string' && (pbeStates as readonly string[]).includes(value)
}

export function normalizePbeState(value: unknown): PbeState | null {
  if (typeof value !== 'string' || value.length === 0) {
    return null
  }
  if (isCanonicalPbeState(value)) {
    return value
  }
  return stateAliases[value] ?? null
}

export function canTransition(from: PbeState, to: PbeState): boolean {
  return transitions[from].includes(to)
}

export function assertTransition(from: PbeState, to: PbeState): ValidationIssue[] {
  if (canTransition(from, to)) {
    return []
  }
  return [
    issue({
      validator: 'StateMachine',
      code: 'INVALID_TRANSITION',
      severity: 'error',
      message: `State transition ${from} -> ${to} is not allowed.`,
      suggestedFix: 'Return to the previous required PBE gate and complete its validator before advancing.',
    }),
  ]
}
