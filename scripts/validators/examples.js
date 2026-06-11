import { createIssue } from '../validator-utils/report-utils.js'
import { fileExists, readText } from '../validator-utils/fs-utils.js'
import { missingTerms } from '../validator-utils/markdown-utils.js'

const validator = 'Examples'

const requiredExampleFiles = [
  'examples/todo-app-pbe-run/README.md',
  'examples/todo-app-pbe-run/00-before.md',
  'examples/todo-app-pbe-run/01-user-request.md',
  'examples/todo-app-pbe-run/02-project-brief.md',
  'examples/todo-app-pbe-run/03-product-tree.md',
  'examples/todo-app-pbe-run/04-project-tree.md',
  'examples/todo-app-pbe-run/05-work-tree.md',
  'examples/todo-app-pbe-run/06-test-tree.md',
  'examples/todo-app-pbe-run/07-human-gate-uiux.md',
  'examples/todo-app-pbe-run/08-workgraph.md',
  'examples/todo-app-pbe-run/09-verification-design.md',
  'examples/todo-app-pbe-run/10-acep-manifest.md',
  'examples/todo-app-pbe-run/11-review-result.md',
  'examples/todo-app-pbe-run/12-revision-request.md',
  'examples/todo-app-pbe-run/13-revision-pack.md',
  'examples/todo-app-pbe-run/14-final-state.md',
]

const requiredReadmeTerms = [
  'Product',
  'Work',
  'Test',
  'Evidence',
  'Change',
  'Revision',
]

export function runExamplesValidator({ root }) {
  const issues = []

  for (const relativePath of requiredExampleFiles) {
    if (!fileExists(root, relativePath)) {
      issues.push(
        createIssue({
          validator,
          file: relativePath,
          code: 'EXAMPLE_FILE_MISSING',
          message: `${relativePath} is required by the onboarding example.`,
          suggestedFix: `Restore ${relativePath}.`,
        }),
      )
    }
  }

  const readmePath = 'examples/todo-app-pbe-run/README.md'
  if (fileExists(root, readmePath)) {
    const readme = readText(root, readmePath)
    for (const term of missingTerms(readme, requiredReadmeTerms)) {
      issues.push(
        createIssue({
          validator,
          file: readmePath,
          code: 'EXAMPLE_TRACEABILITY_TERM_MISSING',
          message: `Todo example README does not mention ${term}.`,
          suggestedFix: `Document ${term} linkage in the Todo example README.`,
        }),
      )
    }
  }

  return issues
}

