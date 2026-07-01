import path from 'node:path'
import { format } from 'prettier'
import { readJsonSafe, relativePath, writeTextAtomic } from './fs.js'
import { validateExecutionContract } from './compiler-boundary.js'
import { validateCompilerInputDryRun, validateCompilerInputSchema } from './compiler-input-model.js'

export type ContractCompilerDryRunStatus = 'contract-compiler-dry-run-pass' | 'contract-compiler-dry-run-blocked'

export interface ContractCompilerDryRunReport {
  status: ContractCompilerDryRunStatus
  inputModelStatus: 'compiler-input-model-pass' | 'compiler-input-model-blocked'
  candidateStatus: 'contract-candidate-pass' | 'contract-candidate-blocked'
  paths: {
    inputSchema: string
    dryRunInput: string
    outputCandidate: string
  }
  candidate: {
    changeId: string
    changeType: string
    goal: string
    allowedScopeCount: number
    forbiddenScopeCount: number
    requiredCheckCount: number
    requiredEvidenceCount: number
    stopConditionCount: number
  }
  blockingReasons: string[]
  warnings: string[]
  nonExecutionStatement: string
  compilerBoundary: string
}

const inputSchemaPath = 'examples/read-model-aggregate/compiler-input-model-schema.json'
const dryRunInputPath = 'examples/read-model-aggregate/generated/compiler-input-model-dry-run.json'
const defaultOutputCandidatePath = 'examples/read-model-aggregate/generated/execution-contract-dry-run.generated.json'

export async function compileExecutionContractDryRun(
  root: string,
  options: { output?: string; writeOutput?: boolean } = {},
): Promise<ContractCompilerDryRunReport> {
  const outputCandidatePath = options.output || defaultOutputCandidatePath
  const schemaResult = await readJsonSafe<unknown>(path.resolve(root, inputSchemaPath))
  const inputResult = await readJsonSafe<unknown>(path.resolve(root, dryRunInputPath))

  const blockingReasons: string[] = []
  const warnings: string[] = []

  if (!schemaResult.ok) {
    blockingReasons.push(`Unable to read compiler input schema: ${schemaResult.error}`)
  } else {
    const schemaIssues = validateCompilerInputSchema(schemaResult.value)
    blockingReasons.push(...schemaIssues.blocking.map((reason) => `compiler input schema: ${reason}`))
    warnings.push(...schemaIssues.warnings.map((reason) => `compiler input schema: ${reason}`))
  }

  let candidate: Record<string, unknown> | undefined
  if (!inputResult.ok) {
    blockingReasons.push(`Unable to read compiler input dry-run input: ${inputResult.error}`)
  } else {
    const inputIssues = await validateCompilerInputDryRun(inputResult.value, root)
    blockingReasons.push(...inputIssues.blocking.map((reason) => `compiler input dry-run: ${reason}`))
    warnings.push(...inputIssues.warnings.map((reason) => `compiler input dry-run: ${reason}`))
    if (inputIssues.blocking.length === 0) {
      const input = asRecord(inputResult.value)
      const unsupported = validateSupportedInput(input)
      blockingReasons.push(...unsupported)
      if (unsupported.length === 0) {
        candidate = compileBugFixContractCandidate(input)
        const candidateIssues = validateExecutionContract(candidate)
        blockingReasons.push(...candidateIssues.blocking.map((reason) => `compiled contract candidate: ${reason}`))
        warnings.push(...candidateIssues.warnings.map((reason) => `compiled contract candidate: ${reason}`))
      }
    }
  }

  const candidateStatus = blockingReasons.some((reason) => reason.startsWith('compiled contract candidate:'))
    ? 'contract-candidate-blocked'
    : 'contract-candidate-pass'
  const inputModelStatus = blockingReasons.some((reason) => reason.startsWith('compiler input'))
    ? 'compiler-input-model-blocked'
    : 'compiler-input-model-pass'
  const status = blockingReasons.length === 0 ? 'contract-compiler-dry-run-pass' : 'contract-compiler-dry-run-blocked'

  if (status === 'contract-compiler-dry-run-pass' && candidate && options.writeOutput !== false) {
    await writeFormattedJson(path.resolve(root, outputCandidatePath), candidate)
  }

  return {
    status,
    inputModelStatus,
    candidateStatus,
    paths: {
      inputSchema: inputSchemaPath,
      dryRunInput: dryRunInputPath,
      outputCandidate: relativePath(root, path.resolve(root, outputCandidatePath)),
    },
    candidate: summarizeCandidate(candidate),
    blockingReasons,
    warnings,
    nonExecutionStatement:
      'Contract Compiler Dry-Run v0 is local/non-enforcing Evidence only. It compiles a deterministic candidate from committed input fixtures and does not execute AI, apply graph deltas, accept work, enable required checks, or retire tree-native artifacts.',
    compilerBoundary:
      'Compiler Dry-Run v0 supports only the current bug_fix compiler input fixture and must feed its candidate back through the Contract Fixture Validator.',
  }
}

function validateSupportedInput(input: Record<string, unknown>): string[] {
  const blocking: string[] = []
  const packSchema = asRecord(input.packSchema)
  if (packSchema.id !== 'pack-schema-bug-fix') {
    blocking.push(`Contract Compiler Dry-Run v0 only supports pack-schema-bug-fix; got ${String(packSchema.id)}.`)
  }
  if (packSchema.changeType !== 'bug_fix') {
    blocking.push(
      `Contract Compiler Dry-Run v0 only supports bug_fix changeType; got ${String(packSchema.changeType)}.`,
    )
  }
  return blocking
}

function compileBugFixContractCandidate(input: Record<string, unknown>): Record<string, unknown> {
  const humanRequest = asRecord(input.humanRequest)
  const graphSnapshot = asRecord(input.graphSnapshot)
  const evidenceIndex = asRecord(input.evidenceIndex)
  const targetScopes = arrayValue(input.targetScopeCandidates)

  const allowedScope = targetScopes.map((scope) => ({
    id: stringValue(scope.id),
    scopeKind: stringValue(scope.scopeKind),
    paths: stringArrayValue(scope.paths),
    derivedFrom: stringArrayValue(scope.derivedFrom),
  }))
  const runtimeFixtureDir = findRuntimeFixtureDir(allowedScope)
  const requiredChecks = [
    ...(runtimeFixtureDir
      ? [
          {
            id: 'check-todo-search-runtime-fixture',
            command: `npx vitest run ${runtimeFixtureDir}`,
            validates: allowedScope.flatMap((scope) => scope.paths),
          },
        ]
      : []),
    {
      id: 'check-read-model-validate-all',
      command: 'node dist/cli/index.js graph read-model validate --all --json',
      validates: ['examples/read-model-aggregate/read-model-slices.json'],
    },
    {
      id: 'check-read-model-health-report',
      command: 'node dist/cli/index.js graph read-model report-health --json',
      validates: ['examples/read-model-aggregate/generated/read-model-health-report-output.json'],
    },
    {
      id: 'check-read-model-e2e',
      command: 'npm run test:read-model:e2e',
      validates: ['examples/read-model-aggregate/graph-source-transition-status.json'],
    },
  ]
  const requiredCheckIds = new Set(requiredChecks.map((check) => check.id))

  return {
    schemaVersion: 1,
    artifactRole: 'execution-contract-dry-run',
    status: 'contract-dry-run-valid',
    sourceMode: 'compiler-boundary-mvp-dry-run',
    changeId: stringValue(input.changeId),
    changeType: 'bug_fix',
    goal: stringValue(humanRequest.text),
    allowedScope,
    forbiddenScope: [
      {
        id: 'scope-no-ci-enforcement',
        scopeKind: 'workflow',
        paths: ['.github/workflows/read-model-evidence.yml'],
        derivedFrom: ['policy:non-enforcement-policy'],
      },
      {
        id: 'scope-no-tree-retirement',
        scopeKind: 'graph',
        paths: ['examples/read-model-aggregate/graph-source-transition-status.json'],
        derivedFrom: ['policy:non-enforcement-policy'],
      },
    ],
    requiredContext: arrayValue(graphSnapshot.artifacts).map((artifact) => ({
      id: `context-${stringValue(artifact.id)}`,
      artifact: stringValue(artifact.path),
      role: stringValue(artifact.role),
    })),
    requiredChecks,
    requiredEvidence: arrayValue(evidenceIndex.entries).map((entry) => {
      const evidenceType = stringValue(entry.evidenceType)
      const fromCheck =
        evidenceType === 'runtime_fixture_result'
          ? 'check-todo-search-runtime-fixture'
          : evidenceType === 'health_report'
            ? 'check-read-model-health-report'
            : 'check-read-model-validate-all'
      return {
        id: stringValue(entry.id),
        evidenceType: evidenceType === 'runtime_fixture_result' ? 'unit_test_result' : evidenceType,
        fromCheck: requiredCheckIds.has(fromCheck) ? fromCheck : 'check-read-model-validate-all',
        freshness: stringValue(entry.freshness),
      }
    }),
    knownRisks: [
      {
        id: 'risk-compiler-dry-run-scope-drift',
        severity: 'warning',
        status: 'tracked',
        mitigation: 'Compiled candidate must pass Contract Fixture Validator before it can be reviewed.',
      },
    ],
    openUnknowns: [],
    humanDecisions: [],
    stopConditions: [
      {
        id: 'stop-if-input-model-drifts',
        condition: 'Compiler input model validation or graph-source cross-reference validation blocks.',
        action: 'stop-and-request-human-decision',
      },
      {
        id: 'stop-if-required-check-unavailable',
        condition: 'Required runtime, health, validate-all, or E2E checks cannot be executed.',
        action: 'stop-and-record-missing-evidence',
      },
    ],
    outputRequirements: [
      'Report compiler input status from graph read-model report-compiler-input only.',
      'Report compiled contract candidate status from Contract Fixture Validator output only.',
      'Do not treat this dry-run candidate as execution, user acceptance, required check, or branch protection.',
    ],
    nonExecutionStatement:
      'This compiler-produced execution contract candidate is dry-run only. It does not execute work, enable required checks, apply graph deltas, or accept the change.',
  }
}

function summarizeCandidate(candidate: Record<string, unknown> | undefined): ContractCompilerDryRunReport['candidate'] {
  const record = candidate || {}
  return {
    changeId: stringValue(record.changeId, 'missing'),
    changeType: stringValue(record.changeType, 'missing'),
    goal: stringValue(record.goal, 'missing'),
    allowedScopeCount: arrayValue(record.allowedScope).length,
    forbiddenScopeCount: arrayValue(record.forbiddenScope).length,
    requiredCheckCount: arrayValue(record.requiredChecks).length,
    requiredEvidenceCount: arrayValue(record.requiredEvidence).length,
    stopConditionCount: arrayValue(record.stopConditions).length,
  }
}

function findRuntimeFixtureDir(scopes: Array<{ paths: string[] }>): string | undefined {
  const fixturePath = scopes.flatMap((scope) => scope.paths).find((entry) => entry.includes('/runtime-fixture/'))
  if (!fixturePath) return undefined
  return fixturePath.slice(0, fixturePath.indexOf('/runtime-fixture/') + '/runtime-fixture'.length)
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {}
}

function arrayValue(value: unknown): Array<Record<string, unknown>> {
  return Array.isArray(value) ? value.filter((entry) => entry && typeof entry === 'object') : []
}

function stringArrayValue(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === 'string' && entry.length > 0)
    : []
}

function stringValue(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback
}

async function writeFormattedJson(filePath: string, value: unknown): Promise<void> {
  const formatted = await format(JSON.stringify(value), { parser: 'json', printWidth: 120, trailingComma: 'all' })
  await writeTextAtomic(filePath, formatted)
}
