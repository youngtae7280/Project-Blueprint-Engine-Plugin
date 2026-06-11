import type { ValidationIssue } from './types.js'
import { issue } from './types.js'

export const pbeStates = [
  'UNINITIALIZED',
  'STARTED',
  'WAITING_ROOT_CONFIRMATION',
  'RPD_IN_PROGRESS',
  'WAITING_RPD_DECISION',
  'RPD_DONE',
  'WAITING_UI_UX_CONFIRMATION',
  'UI_UX_CONFIRMED',
  'WPD_IN_PROGRESS',
  'WPD_DONE',
  'VD_IN_PROGRESS',
  'VD_DONE',
  'WAITING_IMPLEMENTATION_SCOPE_CONFIRMATION',
  'IMPLEMENTATION_SCOPE_CONFIRMED',
  'ACEP_GENERATED',
  'ACEP_VALIDATED',
  'EXECUTION_IN_PROGRESS',
  'EXECUTION_DONE',
  'WAITING_REVIEW',
  'REVISION_REQUESTED',
  'ACCEPTED',
  'CLOSED',
] as const

export type PbeState = typeof pbeStates[number]

export const transitions: Record<PbeState, PbeState[]> = {
  UNINITIALIZED: ['STARTED'],
  STARTED: ['WAITING_ROOT_CONFIRMATION', 'RPD_IN_PROGRESS'],
  WAITING_ROOT_CONFIRMATION: ['RPD_IN_PROGRESS', 'WAITING_RPD_DECISION'],
  RPD_IN_PROGRESS: ['WAITING_RPD_DECISION', 'RPD_DONE'],
  WAITING_RPD_DECISION: ['RPD_IN_PROGRESS', 'RPD_DONE'],
  RPD_DONE: ['WAITING_UI_UX_CONFIRMATION', 'UI_UX_CONFIRMED', 'WPD_IN_PROGRESS'],
  WAITING_UI_UX_CONFIRMATION: ['UI_UX_CONFIRMED'],
  UI_UX_CONFIRMED: ['WPD_IN_PROGRESS'],
  WPD_IN_PROGRESS: ['WPD_DONE'],
  WPD_DONE: ['VD_IN_PROGRESS'],
  VD_IN_PROGRESS: ['VD_DONE'],
  VD_DONE: ['WAITING_IMPLEMENTATION_SCOPE_CONFIRMATION', 'IMPLEMENTATION_SCOPE_CONFIRMED', 'ACEP_GENERATED'],
  WAITING_IMPLEMENTATION_SCOPE_CONFIRMATION: ['IMPLEMENTATION_SCOPE_CONFIRMED'],
  IMPLEMENTATION_SCOPE_CONFIRMED: ['ACEP_GENERATED'],
  ACEP_GENERATED: ['ACEP_VALIDATED'],
  ACEP_VALIDATED: ['EXECUTION_IN_PROGRESS'],
  EXECUTION_IN_PROGRESS: ['EXECUTION_DONE'],
  EXECUTION_DONE: ['WAITING_REVIEW'],
  WAITING_REVIEW: ['REVISION_REQUESTED', 'ACCEPTED'],
  REVISION_REQUESTED: ['RPD_IN_PROGRESS', 'WPD_IN_PROGRESS', 'VD_IN_PROGRESS', 'ACEP_GENERATED'],
  ACCEPTED: ['CLOSED'],
  CLOSED: [],
}

export function isPbeState(value: unknown): value is PbeState {
  return typeof value === 'string' && (pbeStates as readonly string[]).includes(value)
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
