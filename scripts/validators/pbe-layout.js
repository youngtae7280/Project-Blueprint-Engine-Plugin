import { createIssue } from '../validator-utils/report-utils.js'
import { dirExists, fileExists, readText } from '../validator-utils/fs-utils.js'
import { missingTerms } from '../validator-utils/markdown-utils.js'

const validator = 'PBE layout'

const requiredReadmeTerms = [
  '.pbe/tree/',
  '.pbe/execution/',
  '.pbe/control/',
  '.pbe/evidence/',
  '.pbe/blueprint/',
  'RPD',
  'WPD',
  'VD',
  'ACEP',
]

export function runPbeLayoutValidator({ root, requireReadmeTerms = true }) {
  const issues = []

  if (requireReadmeTerms && fileExists(root, 'README.md')) {
    const readme = readText(root, 'README.md')
    for (const term of missingTerms(readme, requiredReadmeTerms)) {
      issues.push(
        createIssue({
          validator,
          file: 'README.md',
          code: 'README_LAYOUT_TERM_MISSING',
          message: `README.md does not mention ${term}.`,
          suggestedFix: `Document ${term} in the official .pbe layout or compatibility section.`,
        }),
      )
    }
  }

  if (!dirExists(root, '.pbe')) {
    return issues
  }

  if (dirExists(root, '.pbe/blueprint') && !dirExists(root, '.pbe/tree')) {
    return issues
  }

  for (const relativePath of ['.pbe/tree', '.pbe/execution', '.pbe/control', '.pbe/evidence']) {
    if (!dirExists(root, relativePath)) {
      issues.push(
        createIssue({
          validator,
          file: relativePath,
          code: 'PBE_TARGET_DIR_MISSING',
          message: `${relativePath}/ is missing from an existing .pbe workspace.`,
          suggestedFix: `Create ${relativePath}/ or repair the PBE initialization.`,
        }),
      )
    }
  }

  return issues
}
