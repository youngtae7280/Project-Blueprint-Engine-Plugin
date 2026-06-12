import { createIssue } from '../validator-utils/report-utils.js'
import { readOptionalJson } from '../validator-utils/json-utils.js'

const validator = 'Autoflow state'

export function runAutoflowStateValidator({ root }) {
  const issues = []
  const { data: state, issue } = readOptionalJson(root, '.pbe/blueprint/pbe-state.json', validator)
  if (issue) {
    issues.push(issue)
  }
  if (!state) {
    return issues
  }

  if (!state.autoflow || typeof state.autoflow !== 'object') {
    issues.push(
      createIssue({
        validator,
        file: '.pbe/blueprint/pbe-state.json',
        code: 'AUTOFLOW_MISSING',
        message: 'pbe-state.json exists but lacks an autoflow object.',
        suggestedFix: 'Add autoflow.profile, autoflow.state, completedSteps, currentGate, nextStep, and lastFailure.',
      }),
    )
    return issues
  }

  if (!state.autoflow.state) {
    issues.push(
      createIssue({
        validator,
        file: '.pbe/blueprint/pbe-state.json',
        code: 'AUTOFLOW_STATE_MISSING',
        message: 'autoflow.state is missing.',
        suggestedFix: 'Set autoflow.state to the current PBE state.',
      }),
    )
  }

  if (!Array.isArray(state.autoflow.completedSteps)) {
    issues.push(
      createIssue({
        validator,
        file: '.pbe/blueprint/pbe-state.json',
        code: 'AUTOFLOW_COMPLETED_STEPS_INVALID',
        message: 'autoflow.completedSteps must be an array.',
        suggestedFix: 'Store completed deterministic steps as an array.',
      }),
    )
  }

  return issues
}
