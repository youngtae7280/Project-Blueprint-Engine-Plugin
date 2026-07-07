#!/usr/bin/env node
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'

const forbiddenPatterns = [
  { id: 'project-blueprint-engine', pattern: /Project Blueprint Engine/g },
  { id: 'uppercase-product-acronym', pattern: /\bPBE\b/g },
  { id: 'lowercase-product-acronym', pattern: /\bpbe\b/g },
  { id: 'legacy-storage-root', pattern: /\.pbe/g },
  { id: 'legacy-product-intake-acronym', pattern: /\bRPD\b/g },
  { id: 'legacy-work-planning-acronym', pattern: /\bWPD\b/g },
  { id: 'legacy-verification-acronym', pattern: /\bVD\b/g },
  { id: 'legacy-execution-pack-acronym', pattern: /\bACEP\b/g },
  { id: 'legacy-product-intake-state', pattern: /RPD_/g },
  { id: 'legacy-work-planning-state', pattern: /WPD_/g },
  { id: 'legacy-verification-state', pattern: /VD_/g },
  { id: 'legacy-execution-pack-state', pattern: /ACEP_/g },
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

function fail(message) {
  process.stderr.write(`${message}\n`)
  process.exit(1)
}

main()
