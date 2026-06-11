import { createIssue } from '../validator-utils/report-utils.js'
import { fileExists, listFiles, readText } from '../validator-utils/fs-utils.js'

const validator = 'Templates'

const requiredTemplates = [
  'templates/product-tree.template.json',
  'templates/project-tree.template.json',
  'templates/work-tree.template.json',
  'templates/test-tree.template.json',
  'templates/cycle-contract-template.md',
  'templates/node-execution-contract-template.md',
  'templates/revision-manifest.template.json',
  'templates/pbe-status-card-template.md',
]

export function runTemplatesValidator({ root }) {
  const issues = []

  for (const relativePath of requiredTemplates) {
    if (!fileExists(root, relativePath)) {
      issues.push(
        createIssue({
          validator,
          file: relativePath,
          code: 'REQUIRED_TEMPLATE_MISSING',
          message: `${relativePath} is required by the PBE protocol.`,
          suggestedFix: `Restore ${relativePath}.`,
        }),
      )
    }
  }

  for (const relativePath of listFiles(root, 'templates', (file) => file.endsWith('.md') || file.endsWith('.json'))) {
    const content = readText(root, relativePath)
    if (content.includes('[TODO:')) {
      issues.push(
        createIssue({
          validator,
          file: relativePath,
          code: 'TEMPLATE_TODO_PLACEHOLDER',
          message: `${relativePath} still contains a TODO placeholder.`,
          suggestedFix: 'Replace TODO placeholders with protocol-ready text or explicit template variables.',
        }),
      )
    }
  }

  return issues
}

