import path from 'node:path'
import { existsSync, readFileSync } from 'node:fs'
import { readJsonSafe } from './fs.js'

export type CompilerInputModelStatus = 'compiler-input-model-pass' | 'compiler-input-model-blocked'

export interface CompilerInputModelReport {
  status: CompilerInputModelStatus
  inputSchemaStatus: 'compiler-input-schema-pass' | 'compiler-input-schema-blocked'
  dryRunInputStatus: 'compiler-input-dry-run-pass' | 'compiler-input-dry-run-blocked'
  paths: {
    inputSchema: string
    dryRunInput: string
  }
  dryRunInput: {
    changeId: string
    humanRequestId: string
    graphSnapshotArtifactCount: number
    policyCount: number
    evidenceEntryCount: number
    targetScopeCandidateCount: number
    outputRequirementSourceCount: number
  }
  blockingReasons: string[]
  warnings: string[]
  nonExecutionStatement: string
  compilerInputBoundary: string
}

const inputSchemaPath = 'examples/read-model-aggregate/compiler-input-model-schema.json'
const dryRunInputPath = 'examples/read-model-aggregate/generated/compiler-input-model-dry-run.json'

const requiredInputGroups = [
  'humanRequest',
  'graphSnapshot',
  'packSchema',
  'policySnapshot',
  'evidenceIndex',
  'targetScopeCandidates',
  'outputRequirementSources',
]

const allowedInputAuthorities = ['human', 'graph', 'policy', 'validator', 'evidence-index']
const allowedPolicyAuthorities = ['compiler-boundary-validator', 'contract-fixture-validator', 'policy', 'validator']
const allowedPolicyStatuses = ['compiler-boundary-mvp-pass', 'contract-schema-pass', 'non-enforcing', 'policy-active']
const allowedEvidenceFreshness = [
  'required-after-source-change',
  'required-after-graph-or-artifact-change',
  'required-after-policy-change',
  'required-after-contract-change',
  'required-before-acceptance',
]
const allowedScopeKinds = ['code', 'test', 'docs', 'evidence', 'workflow', 'product', 'graph']
const allowedScopeConfidence = ['graph-backed-candidate', 'policy-backed-candidate', 'human-seeded-candidate']
const allowedOutputRequirementSourceTypes = ['graph', 'policy', 'evidence', 'check', 'git-diff', 'boundary']
const allowedOutputObligationTypes = [
  'changed-files-report',
  'git-diff-summary',
  'command-output-evidence-status',
  'validation-result-summary',
  'non-execution-boundary-statement',
]

export async function reportCompilerInputModel(root: string): Promise<CompilerInputModelReport> {
  const schemaResult = await readJsonSafe<unknown>(path.resolve(root, inputSchemaPath))
  const inputResult = await readJsonSafe<unknown>(path.resolve(root, dryRunInputPath))

  const schemaIssues = schemaResult.ok
    ? validateCompilerInputSchema(schemaResult.value)
    : { blocking: [`Unable to read compiler input model schema: ${schemaResult.error}`], warnings: [] }
  const inputIssues = inputResult.ok
    ? await validateCompilerInputDryRun(inputResult.value, root)
    : { blocking: [`Unable to read compiler input model dry-run input: ${inputResult.error}`], warnings: [] }
  const blockingReasons = [...schemaIssues.blocking, ...inputIssues.blocking]
  const warnings = [...schemaIssues.warnings, ...inputIssues.warnings]

  const input = inputResult.ok ? asRecord(inputResult.value) : {}
  const humanRequest = asRecord(input.humanRequest)
  const graphSnapshot = asRecord(input.graphSnapshot)
  const policySnapshot = asRecord(input.policySnapshot)
  const evidenceIndex = asRecord(input.evidenceIndex)

  return {
    status: blockingReasons.length === 0 ? 'compiler-input-model-pass' : 'compiler-input-model-blocked',
    inputSchemaStatus:
      schemaIssues.blocking.length === 0 ? 'compiler-input-schema-pass' : 'compiler-input-schema-blocked',
    dryRunInputStatus:
      inputIssues.blocking.length === 0 ? 'compiler-input-dry-run-pass' : 'compiler-input-dry-run-blocked',
    paths: {
      inputSchema: inputSchemaPath,
      dryRunInput: dryRunInputPath,
    },
    dryRunInput: {
      changeId: stringValue(input.changeId, 'missing'),
      humanRequestId: stringValue(humanRequest.id, 'missing'),
      graphSnapshotArtifactCount: arrayValue(graphSnapshot.artifacts).length,
      policyCount: arrayValue(policySnapshot.policies).length,
      evidenceEntryCount: arrayValue(evidenceIndex.entries).length,
      targetScopeCandidateCount: arrayValue(input.targetScopeCandidates).length,
      outputRequirementSourceCount: arrayValue(input.outputRequirementSources).length,
    },
    blockingReasons,
    warnings,
    nonExecutionStatement:
      'Compiler Input Model MVP is local/non-enforcing Evidence only. It does not compile an execution contract, execute AI, apply graph deltas, accept work, or enable required checks.',
    compilerInputBoundary:
      'Actual Contract Compiler inputs must be machine-readable request, graph snapshot, pack schema, policy snapshot, evidence index, and target-scope candidate facts.',
  }
}

export function validateCompilerInputSchema(schema: unknown): { blocking: string[]; warnings: string[] } {
  const blocking: string[] = []
  const warnings: string[] = []
  const record = asRecord(schema)
  if (record.schemaVersion !== 1) {
    blocking.push('Compiler input schema schemaVersion must be 1.')
  }
  if (record.artifactRole !== 'compiler-input-model-schema') {
    blocking.push('Compiler input schema artifactRole must be compiler-input-model-schema.')
  }
  if (record.status !== 'compiler-input-model-mvp') {
    blocking.push('Compiler input schema status must be compiler-input-model-mvp.')
  }
  const requiredGroups = stringArrayValue(record.requiredInputGroups)
  const missingGroups = requiredInputGroups.filter((group) => !requiredGroups.includes(group))
  if (missingGroups.length > 0) {
    blocking.push(`Compiler input schema missing required input groups: ${missingGroups.join(', ')}.`)
  }
  const definitions = asRecord(record.inputDefinitions)
  for (const group of requiredInputGroups) {
    const definition = asRecord(definitions[group])
    if (Object.keys(definition).length === 0) {
      blocking.push(`Compiler input schema inputDefinitions missing ${group}.`)
      continue
    }
    if (!stringValue(definition.source, '')) {
      blocking.push(`Compiler input schema inputDefinitions.${group}.source is required.`)
    }
    const authority = stringValue(definition.authority, '')
    if (!authority) {
      blocking.push(`Compiler input schema inputDefinitions.${group}.authority is required.`)
    } else if (!allowedInputAuthorities.includes(authority)) {
      blocking.push(
        `Compiler input schema inputDefinitions.${group}.authority must be one of: ${allowedInputAuthorities.join(
          ', ',
        )}.`,
      )
    }
  }
  if (!stringValue(record.nonExecutionStatement, '').includes('does not compile')) {
    blocking.push('Compiler input schema nonExecutionStatement must preserve the no-compile boundary.')
  }
  if (requiredGroups.length > requiredInputGroups.length) {
    warnings.push('Compiler input schema includes groups beyond MVP; ensure future validators own any added input.')
  }
  return { blocking, warnings }
}

export async function validateCompilerInputDryRun(
  inputModel: unknown,
  root = process.cwd(),
): Promise<{ blocking: string[]; warnings: string[] }> {
  const blocking: string[] = []
  const warnings: string[] = []
  const record = asRecord(inputModel)
  if (record.schemaVersion !== 1) {
    blocking.push('Compiler input dry-run schemaVersion must be 1.')
  }
  if (record.artifactRole !== 'compiler-input-model-dry-run') {
    blocking.push('Compiler input dry-run artifactRole must be compiler-input-model-dry-run.')
  }
  if (record.status !== 'compiler-input-model-dry-run-valid') {
    blocking.push('Compiler input dry-run status must be compiler-input-model-dry-run-valid.')
  }
  if (record.sourceMode !== 'compiler-input-model-mvp-dry-run') {
    blocking.push('Compiler input dry-run sourceMode must be compiler-input-model-mvp-dry-run.')
  }
  if (!stringValue(record.changeId, '')) {
    blocking.push('Compiler input dry-run changeId is required.')
  }

  validateHumanRequest(asRecord(record.humanRequest), blocking)
  const graphSnapshot = asRecord(record.graphSnapshot)
  validateGraphSnapshot(graphSnapshot, root, blocking)
  validatePackSchema(asRecord(record.packSchema), blocking)
  validatePolicySnapshot(asRecord(record.policySnapshot), root, blocking)
  validateEvidenceIndex(asRecord(record.evidenceIndex), root, blocking)
  validateTargetScopeCandidates(arrayValue(record.targetScopeCandidates), root, graphSnapshot, blocking)
  validateOutputRequirementSources(record, blocking)

  if ('compiledExecutionContract' in record) {
    blocking.push('Compiler input dry-run must not contain compiledExecutionContract; this MVP validates inputs only.')
  }
  if (!stringValue(record.nonExecutionStatement, '').includes('does not compile')) {
    blocking.push('Compiler input dry-run nonExecutionStatement must state that this MVP does not compile contracts.')
  }
  return { blocking, warnings }
}

function validateOutputRequirementSources(record: Record<string, unknown>, blocking: string[]): void {
  const sources = arrayValue(record.outputRequirementSources)
  if (sources.length === 0) {
    blocking.push('Compiler input dry-run outputRequirementSources is required.')
  }
  const evidenceIds = new Set(arrayValue(asRecord(record.evidenceIndex).entries).map((entry) => stringValue(entry.id)))
  const policySnapshot = asRecord(record.policySnapshot)
  const checkIds = new Set([
    ...arrayValue(policySnapshot.evidenceCheckMappings).map((mapping) => stringValue(mapping.requiredCheckId)),
    'check-todo-search-runtime-fixture',
    'check-read-model-validate-all',
    'check-read-model-health-report',
    'check-read-model-e2e',
  ])
  for (const [index, source] of sources.entries()) {
    const label = `Compiler input dry-run outputRequirementSources[${index}]`
    validateRequiredStringFields(
      label,
      source,
      ['sourceId', 'sourceType', 'derivedOutputRequirementId', 'obligationType', 'requiredReportTarget'],
      blocking,
    )
    const sourceType = stringValue(source.sourceType, '')
    if (sourceType && !allowedOutputRequirementSourceTypes.includes(sourceType)) {
      blocking.push(`${label}.sourceType must be one of: ${allowedOutputRequirementSourceTypes.join(', ')}.`)
    }
    const obligationType = stringValue(source.obligationType, '')
    if (obligationType && !allowedOutputObligationTypes.includes(obligationType)) {
      blocking.push(`${label}.obligationType must be one of: ${allowedOutputObligationTypes.join(', ')}.`)
    }
    const evidenceBinding = asRecord(source.evidenceBinding)
    const evidenceId = stringValue(evidenceBinding.evidenceId, '')
    if (evidenceId && !evidenceIds.has(evidenceId)) {
      blocking.push(`${label}.evidenceBinding.evidenceId references unknown evidence id: ${evidenceId}.`)
    }
    const commandBinding = asRecord(source.commandBinding)
    const requiredCheckId = stringValue(commandBinding.requiredCheckId, '')
    if (requiredCheckId && !checkIds.has(requiredCheckId)) {
      blocking.push(`${label}.commandBinding.requiredCheckId references unknown required check id: ${requiredCheckId}.`)
    }
    const diffBinding = asRecord(source.diffBinding)
    if ((obligationType === 'changed-files-report' || obligationType === 'git-diff-summary') && !diffBinding.mode) {
      blocking.push(`${label}.diffBinding.mode is required for ${obligationType}.`)
    }
  }
}

function validateHumanRequest(record: Record<string, unknown>, blocking: string[]): void {
  validateRequiredStringFields('Compiler input dry-run humanRequest', record, ['id', 'source', 'text'], blocking)
}

function validateGraphSnapshot(record: Record<string, unknown>, root: string, blocking: string[]): void {
  validateRequiredStringFields('Compiler input dry-run graphSnapshot', record, ['id'], blocking)
  validateArtifactEntries('Compiler input dry-run graphSnapshot.artifacts', arrayValue(record.artifacts), blocking)
  for (const [index, artifact] of arrayValue(record.artifacts).entries()) {
    const artifactPath = stringValue(artifact.path, '')
    if (artifactPath && !fileExists(root, artifactPath)) {
      blocking.push(`Compiler input dry-run graphSnapshot.artifacts[${index}].path does not exist: ${artifactPath}.`)
    }
  }
}

function validatePackSchema(record: Record<string, unknown>, blocking: string[]): void {
  validateRequiredStringFields('Compiler input dry-run packSchema', record, ['id', 'changeType'], blocking)
  const requiredGroups = stringArrayValue(record.requiredInputGroups)
  if (requiredGroups.length === 0) {
    blocking.push('Compiler input dry-run packSchema.requiredInputGroups must be a non-empty string array.')
  }
  const unknownGroups = requiredGroups.filter((group) => !requiredInputGroups.includes(group))
  if (unknownGroups.length > 0) {
    blocking.push(
      `Compiler input dry-run packSchema.requiredInputGroups contains unknown groups: ${unknownGroups.join(', ')}.`,
    )
  }
}

function validatePolicySnapshot(record: Record<string, unknown>, root: string, blocking: string[]): void {
  validateRequiredStringFields('Compiler input dry-run policySnapshot', record, ['id'], blocking)
  const policies = arrayValue(record.policies)
  const policyIds = new Set<string>()
  if (policies.length === 0) {
    blocking.push('Compiler input dry-run policySnapshot.policies is required.')
  }
  for (const [index, policy] of policies.entries()) {
    validateRequiredStringFields(
      `Compiler input dry-run policySnapshot.policies[${index}]`,
      policy,
      ['id', 'authority', 'status'],
      blocking,
    )
    const id = stringValue(policy.id, '')
    if (id) {
      policyIds.add(id)
    }
    const authority = stringValue(policy.authority, '')
    if (authority && !allowedPolicyAuthorities.includes(authority)) {
      blocking.push(
        `Compiler input dry-run policySnapshot.policies[${index}].authority must be one of: ${allowedPolicyAuthorities.join(
          ', ',
        )}.`,
      )
    }
    const status = stringValue(policy.status, '')
    if (status && !allowedPolicyStatuses.includes(status)) {
      blocking.push(
        `Compiler input dry-run policySnapshot.policies[${index}].status must be one of: ${allowedPolicyStatuses.join(
          ', ',
        )}.`,
      )
    }
  }
  validateEvidenceCheckMappings(record, blocking)
  validateForbiddenScopeRules(record, root, policyIds, blocking)
}

function validateEvidenceCheckMappings(record: Record<string, unknown>, blocking: string[]): void {
  const mappings = arrayValue(record.evidenceCheckMappings)
  if (mappings.length === 0) {
    blocking.push('Compiler input dry-run policySnapshot.evidenceCheckMappings is required.')
  }
  const seen = new Set<string>()
  for (const [index, mapping] of mappings.entries()) {
    const label = `Compiler input dry-run policySnapshot.evidenceCheckMappings[${index}]`
    validateRequiredStringFields(label, mapping, ['evidenceType', 'requiredCheckId', 'compiledEvidenceType'], blocking)
    const evidenceType = stringValue(mapping.evidenceType, '')
    if (evidenceType && seen.has(evidenceType)) {
      blocking.push(`${label}.evidenceType duplicates an earlier mapping: ${evidenceType}.`)
    }
    seen.add(evidenceType)
  }
}

function validateForbiddenScopeRules(
  record: Record<string, unknown>,
  root: string,
  policyIds: Set<string>,
  blocking: string[],
): void {
  const rules = arrayValue(record.forbiddenScopeRules)
  if (rules.length === 0) {
    blocking.push('Compiler input dry-run policySnapshot.forbiddenScopeRules is required.')
  }
  for (const [index, rule] of rules.entries()) {
    const label = `Compiler input dry-run policySnapshot.forbiddenScopeRules[${index}]`
    validateRequiredStringFields(label, rule, ['id', 'scopeKind'], blocking)
    const scopeKind = stringValue(rule.scopeKind, '')
    if (scopeKind && !allowedScopeKinds.includes(scopeKind)) {
      blocking.push(`${label}.scopeKind must be one of: ${allowedScopeKinds.join(', ')}.`)
    }
    const paths = stringArrayValue(rule.paths)
    if (paths.length === 0) {
      blocking.push(`${label}.paths must be a non-empty string array.`)
    }
    for (const rulePath of paths) {
      if (!fileExists(root, rulePath)) {
        blocking.push(`${label}.paths references missing file or artifact: ${rulePath}.`)
      }
    }
    const derivedFrom = stringArrayValue(rule.derivedFrom)
    if (derivedFrom.length === 0) {
      blocking.push(`${label}.derivedFrom must be a non-empty string array.`)
    }
    for (const reference of derivedFrom) {
      const policyReference = /^policy:(.+)$/.exec(reference)
      if (policyReference && !policyIds.has(policyReference[1])) {
        blocking.push(`${label}.derivedFrom references unknown policy id: ${reference}.`)
      }
    }
  }
}

function validateEvidenceIndex(record: Record<string, unknown>, root: string, blocking: string[]): void {
  validateRequiredStringFields('Compiler input dry-run evidenceIndex', record, ['id'], blocking)
  const entries = arrayValue(record.entries)
  if (entries.length === 0) {
    blocking.push('Compiler input dry-run evidenceIndex.entries is required.')
  }
  for (const [index, entry] of entries.entries()) {
    validateRequiredStringFields(
      `Compiler input dry-run evidenceIndex.entries[${index}]`,
      entry,
      ['id', 'artifact', 'evidenceType', 'freshness'],
      blocking,
    )
    const artifact = stringValue(entry.artifact, '')
    if (artifact && !fileExists(root, artifact)) {
      blocking.push(`Compiler input dry-run evidenceIndex.entries[${index}].artifact does not exist: ${artifact}.`)
    }
    const freshness = stringValue(entry.freshness, '')
    if (freshness && !allowedEvidenceFreshness.includes(freshness)) {
      blocking.push(
        `Compiler input dry-run evidenceIndex.entries[${index}].freshness must be one of: ${allowedEvidenceFreshness.join(
          ', ',
        )}.`,
      )
    }
  }
}

function validateTargetScopeCandidates(
  scopes: Array<Record<string, unknown>>,
  root: string,
  graphSnapshot: Record<string, unknown>,
  blocking: string[],
): void {
  if (scopes.length === 0) {
    blocking.push('Compiler input dry-run targetScopeCandidates is required.')
  }
  for (const [index, scope] of scopes.entries()) {
    const label = `Compiler input dry-run targetScopeCandidates[${index}]`
    validateRequiredStringFields(label, scope, ['id', 'scopeKind', 'confidence'], blocking)
    const scopeKind = stringValue(scope.scopeKind, '')
    if (scopeKind && !allowedScopeKinds.includes(scopeKind)) {
      blocking.push(`${label}.scopeKind must be one of: ${allowedScopeKinds.join(', ')}.`)
    }
    const confidence = stringValue(scope.confidence, '')
    if (confidence && !allowedScopeConfidence.includes(confidence)) {
      blocking.push(`${label}.confidence must be one of: ${allowedScopeConfidence.join(', ')}.`)
    }
    const paths = stringArrayValue(scope.paths)
    if (paths.length === 0) {
      blocking.push(`${label}.paths must be a non-empty string array.`)
    }
    for (const scopePath of paths) {
      if (!fileExists(root, scopePath)) {
        blocking.push(`${label}.paths references missing file or artifact: ${scopePath}.`)
      }
    }
    const derivedFrom = stringArrayValue(scope.derivedFrom)
    if (derivedFrom.length === 0) {
      blocking.push(`${label}.derivedFrom must be a non-empty string array.`)
    }
    for (const ref of derivedFrom) {
      if (!isKnownGraphReference(root, graphSnapshot, ref)) {
        blocking.push(`${label}.derivedFrom references unknown graph node: ${ref}.`)
      }
    }
  }
}

function validateArtifactEntries(label: string, artifacts: Array<Record<string, unknown>>, blocking: string[]): void {
  if (artifacts.length === 0) {
    blocking.push(`${label} is required.`)
  }
  for (const [index, artifact] of artifacts.entries()) {
    validateRequiredStringFields(`${label}[${index}]`, artifact, ['id', 'path', 'role'], blocking)
  }
}

function isKnownGraphReference(root: string, graphSnapshot: Record<string, unknown>, reference: string): boolean {
  const match = /^graph-source:node:(.+)$/.exec(reference)
  if (!match) return false
  const nodeId = match[1]
  for (const artifact of arrayValue(graphSnapshot.artifacts)) {
    const artifactPath = stringValue(artifact.path, '')
    if (!artifactPath.endsWith('graph-source.json')) continue
    const graphSource = readGraphSourceNodeIds(root, artifactPath)
    if (graphSource.has(nodeId)) return true
  }
  return false
}

function readGraphSourceNodeIds(root: string, artifactPath: string): Set<string> {
  try {
    const artifact = readFileSync(path.resolve(root, artifactPath), 'utf8')
    const parsed = JSON.parse(artifact) as Record<string, unknown>
    const sourceRecords = asRecord(parsed.sourceRecords)
    return new Set(
      arrayValue(sourceRecords.nodes)
        .map((node) => stringValue(node.id, ''))
        .filter(Boolean),
    )
  } catch {
    return new Set()
  }
}

function fileExists(root: string, relativePath: string): boolean {
  return existsSync(path.resolve(root, relativePath))
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

function validateRequiredStringFields(
  label: string,
  record: Record<string, unknown>,
  fields: string[],
  blocking: string[],
): void {
  for (const field of fields) {
    if (!stringValue(record[field], '')) {
      blocking.push(`${label}.${field} is required.`)
    }
  }
}
