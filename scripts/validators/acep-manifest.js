import { createIssue } from '../validator-utils/report-utils.js'
import { readOptionalJson } from '../validator-utils/json-utils.js'

const validator = 'ACEP manifest'

export function runAcepManifestValidator({ root }) {
  const issues = []
  const { data: manifest, issue } = readOptionalJson(
    root,
    '.pbe/codex-execution-pack/execution-manifest.json',
    validator,
  )
  if (issue) {
    issues.push(issue)
  }
  if (!manifest) {
    return issues
  }

  if (!Array.isArray(manifest.phases)) {
    issues.push(
      createIssue({
        validator,
        file: '.pbe/codex-execution-pack/execution-manifest.json',
        code: 'ACEP_MANIFEST_FIELD_INVALID',
        message: 'phases must be an array.',
        suggestedFix: 'Regenerate ACEP manifest with phases[].',
      }),
    )
  }

  if (manifest.validationCommands !== undefined && !Array.isArray(manifest.validationCommands)) {
    issues.push(
      createIssue({
        validator,
        file: '.pbe/codex-execution-pack/execution-manifest.json',
        code: 'ACEP_MANIFEST_FIELD_INVALID',
        message: 'validationCommands must be an array when present.',
        suggestedFix: 'Regenerate ACEP manifest with validationCommands[] or omit it for legacy ACEP.',
      }),
    )
  }

  if (manifest.finalState === 'accepted') {
    issues.push(
      createIssue({
        validator,
        file: '.pbe/codex-execution-pack/execution-manifest.json',
        code: 'CODEX_SELF_ACCEPTANCE',
        message: 'ACEP manifest cannot end in accepted because only the user can accept results.',
        suggestedFix: 'Use submitted_for_review and wait for the review result gate.',
      }),
    )
  }

  return issues
}
