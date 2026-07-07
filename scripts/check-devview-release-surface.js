#!/usr/bin/env node
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'

const forbiddenPatterns = [
  { id: 'retired-product-name', pattern: literalPattern(retiredProductName()) },
  { id: 'retired-product-slug', pattern: literalPattern(retiredProductSlug()) },
  { id: 'retired-product-acronym-upper', pattern: wordPattern(retiredProductAcronymUpper()) },
  { id: 'retired-product-acronym-lower', pattern: wordPattern(retiredProductAcronymLower()) },
  { id: 'retired-storage-root', pattern: literalPattern(retiredStorageRoot()) },
  { id: 'retired-product-intake-acronym', pattern: wordPattern(retiredWorkflowToken('product-intake')) },
  { id: 'retired-work-planning-acronym', pattern: wordPattern(retiredWorkflowToken('work-planning')) },
  { id: 'retired-verification-acronym', pattern: wordPattern(retiredWorkflowToken('verification')) },
  { id: 'retired-execution-pack-acronym', pattern: wordPattern(retiredWorkflowToken('execution-pack')) },
  { id: 'retired-product-intake-state', pattern: literalPattern(`${retiredWorkflowToken('product-intake')}_`) },
  { id: 'retired-work-planning-state', pattern: literalPattern(`${retiredWorkflowToken('work-planning')}_`) },
  { id: 'retired-verification-state', pattern: literalPattern(`${retiredWorkflowToken('verification')}_`) },
  { id: 'retired-execution-pack-state', pattern: literalPattern(`${retiredWorkflowToken('execution-pack')}_`) },
]

const forbiddenPathPrefixes = [
  'docs/internal-legacy/',
  'docs/archive/',
  'examples/internal-legacy/',
  'outputs/',
  'work/',
  'cli/src/__tests__/',
  'scripts/__tests__/',
  '.github/',
]

const textExtensions = new Set(['', '.css', '.html', '.js', '.json', '.md', '.mjs', '.ts', '.txt', '.yaml', '.yml'])

function main() {
  const args = new Set(process.argv.slice(2))
  if (!args.has('--pack-dry-run')) {
    fail('Missing required --pack-dry-run. This checker only validates the local npm dry-run package surface.')
  }

  const printJson = args.has('--json')
  const pack = readPackDryRun()
  const files = Array.isArray(pack.files) ? pack.files : []
  const findings = []

  for (const entry of files) {
    const packagePath = normalize(entry.path || '')
    if (!packagePath) continue

    for (const prefix of forbiddenPathPrefixes) {
      if (packagePath === prefix.slice(0, -1) || packagePath.startsWith(prefix)) {
        findings.push({
          findingKind: 'forbidden-package-path',
          packagePath,
          patternId: prefix,
          message: `Release package includes internal path ${packagePath}.`,
        })
      }
    }

    for (const legacyPattern of forbiddenPatterns) {
      legacyPattern.pattern.lastIndex = 0
      if (legacyPattern.pattern.test(packagePath)) {
        findings.push({
          findingKind: 'forbidden-package-path-token',
          packagePath,
          patternId: legacyPattern.id,
          message: `Release package path contains legacy token ${legacyPattern.id}.`,
        })
      }
    }

    if (!shouldInspectText(packagePath)) continue
    const content = readFileSync(packagePath, 'utf8')
    const lines = content.split(/\r?\n/)
    for (const [lineIndex, line] of lines.entries()) {
      for (const legacyPattern of forbiddenPatterns) {
        legacyPattern.pattern.lastIndex = 0
        let match
        while ((match = legacyPattern.pattern.exec(line)) !== null) {
          findings.push({
            findingKind: 'forbidden-package-content-token',
            packagePath,
            line: lineIndex + 1,
            column: match.index + 1,
            patternId: legacyPattern.id,
            matchedText: match[0],
            message: `Release package content contains legacy token ${legacyPattern.id}.`,
          })
        }
      }
    }
  }

  const report = {
    schemaVersion: 1,
    artifactRole: 'devview-release-surface-validation-report',
    status:
      findings.length === 0 ? 'devview-release-surface-validation-passed' : 'devview-release-surface-validation-failed',
    packageName: pack.name,
    packageVersion: pack.version,
    dryRun: true,
    packageFileCount: files.length,
    packageFiles: files.map((entry) => normalize(entry.path || '')).filter(Boolean),
    forbiddenFindingCount: findings.length,
    forbiddenFindings: findings,
    filesMutated: false,
    graphSourceMutated: false,
    runtimeEvidenceSatisfied: false,
    evidenceAccepted: false,
    equivalenceProven: false,
    scopeEnforced: false,
    ciEnforcementEnabled: false,
    providerInvoked: false,
    networkCallMade: false,
  }

  if (printJson) {
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`)
  } else if (findings.length === 0) {
    process.stdout.write(`DevView release surface validation passed. Checked ${files.length} package files.\n`)
  } else {
    process.stderr.write(`${JSON.stringify(report, null, 2)}\n`)
  }

  if (findings.length > 0) {
    process.exitCode = 1
  }
}

function readPackDryRun() {
  const raw = execFileSync('npm', ['pack', '--dry-run', '--json'], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    shell: process.platform === 'win32',
  })
  const parsed = JSON.parse(raw)
  if (!Array.isArray(parsed) || !parsed[0]) {
    fail('npm pack --dry-run --json did not return a package summary.')
  }
  return parsed[0]
}

function shouldInspectText(packagePath) {
  const extension = path.extname(packagePath).toLowerCase()
  if (!textExtensions.has(extension)) return false
  if (!existsSync(packagePath)) return false
  try {
    const buffer = readFileSync(packagePath)
    if (buffer.length > 2_000_000) return false
    return !buffer.includes(0)
  } catch {
    return false
  }
}

function normalize(value) {
  return String(value).replace(/\\/g, '/')
}

function literalPattern(value) {
  return new RegExp(escapeRegExp(value), 'g')
}

function wordPattern(value) {
  return new RegExp(`\\b${escapeRegExp(value)}\\b`, 'g')
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function retiredStorageRoot() {
  return `.${retiredProductAcronymLower()}`
}

function retiredProductName() {
  return fromCodes([
    80, 114, 111, 106, 101, 99, 116, 32, 66, 108, 117, 101, 112, 114, 105, 110, 116, 32, 69, 110, 103, 105, 110, 101,
  ])
}

function retiredProductSlug() {
  return fromCodes([
    112, 114, 111, 106, 101, 99, 116, 45, 98, 108, 117, 101, 112, 114, 105, 110, 116, 45, 101, 110, 103, 105, 110, 101,
  ])
}

function retiredProductAcronymUpper() {
  return fromCodes([80, 66, 69])
}

function retiredProductAcronymLower() {
  return fromCodes([112, 98, 101])
}

function retiredWorkflowToken(kind) {
  const codes = {
    'product-intake': [82, 80, 68],
    'work-planning': [87, 80, 68],
    verification: [86, 68],
    'execution-pack': [65, 67, 69, 80],
  }[kind]
  return fromCodes(codes)
}

function fromCodes(codes) {
  return String.fromCharCode(...codes)
}

function fail(message) {
  process.stderr.write(`${message}\n`)
  process.exit(1)
}

main()
