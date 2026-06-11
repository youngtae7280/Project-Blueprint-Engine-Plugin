import { existsSync } from 'node:fs'
import { artifactPath, defaultArtifacts, getOpenBlockingDecisions } from '../core/project.js'
import { readJsonSafe } from '../core/fs.js'
import type { ValidationIssue } from '../core/types.js'
import { issue } from '../core/types.js'

type JsonObject = Record<string, unknown>

const terminalRpdStatuses = new Set(['confirmed', 'deferred', 'out_of_scope'])
const executableScopes = new Set(['selected', 'foundation'])
const nonExecutableTypes = new Set(['non_goal', 'risk', 'assumption', 'decision'])
const abstractQualityTerms = [
  '깔끔하게',
  '보기 좋게',
  '빠르게',
  '안정적으로',
  '사용하기 쉽게',
  '직관적으로',
  '현대적으로',
  '효율적으로',
  '유연하게',
  '확장 가능하게',
  '문제 없게',
  '좋게',
  '더 좋게',
  '간단하게',
  '편하게',
  '부드럽게',
  'clean',
  'nice',
  'modern',
  'intuitive',
  'fast',
  'stable',
  'easy',
  'easy to use',
  'efficient',
  'flexible',
  'scalable',
  'problem-free',
  'good',
  'better',
  'simple',
  'smooth',
  'comfortable',
  'user-friendly',
]

export interface RpdCheckOptions {
  completionMode: boolean
}

export async function validateRpd(root: string, options: RpdCheckOptions): Promise<ValidationIssue[]> {
  const issues: ValidationIssue[] = []
  const productPath = artifactPath(root, 'productTree')
  const requirementPath = artifactPath(root, 'requirementTree')
  const decisionQueuePath = artifactPath(root, 'decisionQueue')

  if (!existsSync(productPath)) {
    return [
      issue({
        validator: 'RPD',
        code: 'PRODUCT_TREE_MISSING',
        severity: 'error',
        file: defaultArtifacts.productTree,
        message: 'Product Tree is missing.',
        suggestedFix: 'Run `pbe init` or create .pbe/tree/product-tree.json before running RPD checks.',
      }),
    ]
  }

  const product = await readJsonSafe<JsonObject>(productPath)
  if (!product.ok) {
    return [
      issue({
        validator: 'RPD',
        code: 'JSON_INVALID',
        severity: 'error',
        file: defaultArtifacts.productTree,
        message: `Could not parse Product Tree: ${product.error}`,
        suggestedFix: 'Fix product-tree.json syntax before continuing.',
      }),
    ]
  }

  if (!existsSync(requirementPath)) {
    issues.push(issue({
      validator: 'RPD',
      code: 'COMPAT_REQUIREMENT_TREE_MISSING',
      severity: 'error',
      file: defaultArtifacts.requirementTree,
      message: 'Backward-compatible requirement-tree.json is missing.',
      suggestedFix: 'Regenerate the compatibility requirement-tree view from the Product Tree.',
    }))
  }

  const rootNode = findRootNode(product.value)
  if (!rootNode) {
    issues.push(issue({
      validator: 'RPD',
      code: 'PRODUCT_ROOT_MISSING',
      severity: 'error',
      file: defaultArtifacts.productTree,
      message: 'Product Tree rootNodeId does not resolve to a node.',
      suggestedFix: 'Set rootNodeId to an existing Product node id.',
    }))
  }

  if (options.completionMode && rootNode && !hasUserConfirmationEvidence(rootNode)) {
    issues.push(issue({
      validator: 'RPD',
      code: 'ROOT_NOT_CONFIRMED_BY_USER',
      severity: 'error',
      file: defaultArtifacts.productTree,
      nodeId: stringValue(rootNode.id),
      message: `Product root ${String(rootNode.id)} has no explicit user confirmation evidence.`,
      suggestedFix: 'Ask the user to confirm the root summary or revise it, then record user confirmation metadata on the Product root.',
    }))
  }

  for (const node of nodesOf(product.value)) {
    const nodeId = stringValue(node.id)
    const isLeaf = childrenOf(node).length === 0
    const status = stringValue(node.status)
    const executable = isExecutableProductNode(node)

    if (options.completionMode && isLeaf && !terminalRpdStatuses.has(status)) {
      issues.push(issue({
        validator: 'RPD',
        code: status === 'blocked' ? 'NODE_BLOCKED' : 'LEAF_NOT_TERMINAL',
        severity: 'error',
        file: defaultArtifacts.productTree,
        nodeId,
        message: `Product leaf ${nodeId} is ${status || 'missing status'}, not confirmed/deferred/out_of_scope.`,
        suggestedFix: 'Continue RPD for this node or explicitly mark it confirmed, deferred, or out_of_scope with user-backed rationale.',
      }))
    }

    if (executable && ['partial', 'ambiguous'].includes(getNestedString(node, ['ambiguity', 'status']))) {
      issues.push(issue({
        validator: 'RPD',
        code: 'AMBIGUITY_UNRESOLVED',
        severity: 'error',
        file: defaultArtifacts.productTree,
        nodeId,
        message: `Selected executable Product node ${nodeId} still has unresolved ambiguity.`,
        suggestedFix: 'Ask exactly one focused RPD question and resolve ambiguity into concrete acceptance criteria before WPD.',
      }))
    }

    if (executable && status === 'needs_clarification') {
      issues.push(issue({
        validator: 'RPD',
        code: 'NODE_NEEDS_CLARIFICATION',
        severity: 'error',
        file: defaultArtifacts.productTree,
        nodeId,
        message: `Selected Product node ${nodeId} still needs clarification.`,
        suggestedFix: 'Resolve the open clarification before deriving Work Tree nodes.',
      }))
    }

    if (executable && status === 'confirmed' && acceptanceCriteriaOf(node).length === 0 && !stringValue(node.acceptanceNotRequiredReason)) {
      issues.push(issue({
        validator: 'RPD',
        code: 'ACCEPTANCE_CRITERIA_MISSING',
        severity: 'error',
        file: defaultArtifacts.productTree,
        nodeId,
        message: `Confirmed executable Product node ${nodeId} lacks acceptanceCriteria or acceptanceNotRequiredReason.`,
        suggestedFix: 'Write structured EARS acceptance criteria, or record why criteria are not required for this node.',
      }))
    }

    const unresolvedTerms = collectUnresolvedAbstractTerms(node)
    if (executable && unresolvedTerms.length > 0) {
      issues.push(issue({
        validator: 'RPD',
        code: 'ABSTRACT_QUALITY_TERM',
        severity: 'error',
        file: defaultArtifacts.productTree,
        nodeId,
        message: `Product node ${nodeId} contains unresolved abstract quality term(s): ${unresolvedTerms.join(', ')}.`,
        suggestedFix: 'Resolve target, condition, expected behavior, completion criteria, exception behavior, and verification method.',
      }))
    }

    for (const criterion of acceptanceCriteriaOf(node)) {
      issues.push(...validateAcceptanceCriterion(node, criterion))
    }
  }

  if (existsSync(decisionQueuePath)) {
    const queue = await readJsonSafe<JsonObject>(decisionQueuePath)
    if (queue.ok) {
      for (const decision of getOpenBlockingDecisions(queue.value)) {
        issues.push(issue({
          validator: 'RPD',
          code: 'BLOCKING_DECISION_OPEN',
          severity: 'error',
          file: defaultArtifacts.decisionQueue,
          nodeId: stringValue(decision.targetNodeId),
          message: `Blocking decision ${String(decision.id)} is still open: ${String(decision.question || decision.reason || '')}`,
          suggestedFix: 'Ask the user to resolve this decision before closing RPD or entering downstream stages.',
        }))
      }
    }
  }

  return issues
}

export async function validateAcceptedActors(root: string): Promise<ValidationIssue[]> {
  const issues: ValidationIssue[] = []
  const product = await readJsonIfExists(root, 'productTree')
  const acceptance = await readJsonIfExists(root, 'acceptanceTree')
  const state = await readJsonIfExists(root, 'pbeState')

  for (const node of nodesOf(product)) {
    const status = stringValue(node.status)
    if (['accepted', 'accepted_done'].includes(status) && !hasUserConfirmationEvidence(node)) {
      issues.push(issue({
        validator: 'Acceptance',
        code: 'ASSISTANT_ACCEPTED_STATUS',
        severity: 'error',
        file: defaultArtifacts.productTree,
        nodeId: stringValue(node.id),
        message: `Product node ${String(node.id)} is ${status} without explicit user approval metadata.`,
        suggestedFix: 'Codex may submit for review, but only user approval may set accepted state.',
      }))
    }
  }

  for (const branch of arrayObjects(acceptance?.branches)) {
    if (branch.status === 'accepted_done' && getNestedString(branch, ['decisionSource', 'actor']) !== 'user') {
      issues.push(issue({
        validator: 'Acceptance',
        code: 'ASSISTANT_ACCEPTED_STATUS',
        severity: 'error',
        file: defaultArtifacts.acceptanceTree,
        nodeId: stringValue(branch.productNodeId),
        message: `Acceptance branch ${String(branch.productNodeId)} is accepted_done without user decisionSource.`,
        suggestedFix: 'Record explicit user approval before marking a branch accepted.',
      }))
    }
  }

  const deliveryStatus = stringValue(state?.deliveryStatus)
  if (deliveryStatus === 'accepted' && getNestedString(state, ['autoflow', 'lastUserAction', 'actor']) !== 'user') {
    issues.push(issue({
      validator: 'Acceptance',
      code: 'ASSISTANT_ACCEPTED_STATUS',
      severity: 'error',
      file: defaultArtifacts.pbeState,
      message: 'pbe-state deliveryStatus is accepted without a user lastUserAction actor.',
      suggestedFix: 'Use submitted_for_review until the user explicitly accepts the result.',
    }))
  }

  return issues
}

export async function validateTraceability(root: string): Promise<ValidationIssue[]> {
  const issues: ValidationIssue[] = []
  const product = await readJsonIfExists(root, 'productTree')
  const work = await readJsonIfExists(root, 'workTree')
  const test = await readJsonIfExists(root, 'testTree')
  const evidence = await readJsonIfExists(root, 'evidenceTree')
  const cycle = await readJsonIfExists(root, 'cycleTree')

  const productNodes = nodesOf(product)
  const activeProductIds = new Set(productNodes.filter(isExecutableProductNode).map((node) => stringValue(node.id)).filter(Boolean))
  const inactiveProductIds = new Set(productNodes
    .filter((node) => ['deferred', 'out_of_scope'].includes(stringValue(node.scopeClass)) || ['deferred', 'out_of_scope'].includes(stringValue(node.status)))
    .map((node) => stringValue(node.id))
    .filter(Boolean))

  const workNodes = nodesOf(work)
  const nonRootWork = workNodes.filter((node) => stringValue(node.id) !== stringValue(work?.rootNodeId))
  for (const productId of activeProductIds) {
    const hasWork = nonRootWork.some((node) => arrayStrings(node.derivedFromProductNodeIds).includes(productId))
    if (work && !hasWork) {
      issues.push(issue({
        validator: 'Traceability',
        code: 'PRODUCT_NOT_DERIVED',
        severity: 'error',
        file: defaultArtifacts.workTree,
        nodeId: productId,
        message: `Selected Product node ${productId} has no Work Tree coverage.`,
        suggestedFix: 'Create Work Tree coverage or explicitly defer/out_of_scope the Product node.',
      }))
    }
  }

  for (const workNode of nonRootWork) {
    const workId = stringValue(workNode.id)
    const sourceIds = arrayStrings(workNode.derivedFromProductNodeIds)
    if (['selected', 'foundation'].includes(stringValue(workNode.scopeClass)) && sourceIds.length === 0) {
      issues.push(issue({
        validator: 'Traceability',
        code: 'WORK_WITHOUT_PRODUCT',
        severity: 'error',
        file: defaultArtifacts.workTree,
        nodeId: workId,
        message: `Work node ${workId} has no Product Tree source.`,
        suggestedFix: 'Link Work nodes to Product nodes or record a foundation reason.',
      }))
    }
    for (const productId of sourceIds) {
      if (inactiveProductIds.has(productId)) {
        issues.push(scopeLeakIssue('Traceability', 'DEFERRED_SCOPE_LEAK', defaultArtifacts.workTree, workId, productId))
      }
    }
  }

  const testNodes = nodesOf(test).filter((node) => stringValue(node.id) !== stringValue(test?.rootNodeId))
  for (const testNode of testNodes) {
    if (arrayStrings(testNode.verifiesWorkNodeIds).length === 0 && arrayStrings(testNode.verifiesAcceptanceCriteriaIds).length === 0 && arrayStrings(testNode.verifiesProductNodeIds).length === 0) {
      issues.push(issue({
        validator: 'Traceability',
        code: 'TEST_WITHOUT_WORK_OR_AC',
        severity: 'error',
        file: defaultArtifacts.testTree,
        nodeId: stringValue(testNode.id),
        message: `Test node ${String(testNode.id)} does not verify Product, Work, or Acceptance Criteria nodes.`,
        suggestedFix: 'Link this Test node to the Work or acceptance criteria it verifies.',
      }))
    }
  }

  for (const evidenceNode of arrayObjects(evidence?.evidence)) {
    if (arrayStrings(evidenceNode.evidenceForTestNodeIds).length === 0 && arrayStrings(evidenceNode.provesNodeIds).length === 0) {
      issues.push(issue({
        validator: 'Traceability',
        code: 'EVIDENCE_WITHOUT_TEST',
        severity: 'error',
        file: defaultArtifacts.evidenceTree,
        nodeId: stringValue(evidenceNode.id),
        message: `Evidence node ${String(evidenceNode.id)} is not linked to Test/Product/Work nodes.`,
        suggestedFix: 'Attach evidence to the Test node, Product node, Work node, or acceptance criteria it proves.',
      }))
    }
  }

  for (const cycleEntry of arrayObjects(cycle?.cycles)) {
    for (const productId of arrayStrings(cycleEntry.includedProductNodeIds)) {
      if (inactiveProductIds.has(productId)) {
        issues.push(scopeLeakIssue('Traceability', 'DEFERRED_SCOPE_LEAK', defaultArtifacts.cycleTree, stringValue(cycleEntry.id), productId))
      }
    }
  }

  return issues
}

export async function validateWpd(root: string): Promise<ValidationIssue[]> {
  const workPath = artifactPath(root, 'workTree')
  if (!existsSync(workPath)) {
    return [missingIssue('WPD', 'WORK_TREE_MISSING', defaultArtifacts.workTree, 'Work Tree is missing.')]
  }
  const work = await readJsonIfExists(root, 'workTree')
  const issues: ValidationIssue[] = []
  for (const node of nodesOf(work).filter((entry) => stringValue(entry.id) !== stringValue(work?.rootNodeId))) {
    if (['selected', 'foundation'].includes(stringValue(node.scopeClass)) && arrayStrings(node.expectedFiles).length === 0 && !node.unknownFileTouchRisk) {
      issues.push(issue({
        validator: 'WPD',
        code: 'EXPECTED_FILES_MISSING',
        severity: 'error',
        file: defaultArtifacts.workTree,
        nodeId: stringValue(node.id),
        message: `Work node ${String(node.id)} has no expectedFiles and is not marked unknownFileTouchRisk.`,
        suggestedFix: 'Declare expectedFiles or mark unknownFileTouchRisk before planning parallel execution.',
      }))
    }
  }
  issues.push(...await validateTraceability(root))
  return issues
}

export async function validateVd(root: string): Promise<ValidationIssue[]> {
  const testPath = artifactPath(root, 'testTree')
  if (!existsSync(testPath)) {
    return [missingIssue('VD', 'TEST_TREE_MISSING', defaultArtifacts.testTree, 'Test Tree is missing.')]
  }
  const product = await readJsonIfExists(root, 'productTree')
  const work = await readJsonIfExists(root, 'workTree')
  const test = await readJsonIfExists(root, 'testTree')
  const issues: ValidationIssue[] = []
  const testNodes = nodesOf(test)
  for (const workNode of nodesOf(work).filter((entry) => stringValue(entry.id) !== stringValue(work?.rootNodeId))) {
    if (!['selected', 'foundation'].includes(stringValue(workNode.scopeClass))) {
      continue
    }
    const workId = stringValue(workNode.id)
    const covered = testNodes.some((testNode) => arrayStrings(testNode.verifiesWorkNodeIds).includes(workId))
    if (!covered) {
      issues.push(issue({
        validator: 'VD',
        code: 'WORK_NOT_TESTED',
        severity: 'error',
        file: defaultArtifacts.testTree,
        nodeId: workId,
        message: `Selected/foundation Work node ${workId} has no Test Tree coverage.`,
        suggestedFix: 'Create a Test Tree node that verifies this Work node.',
      }))
    }
  }

  const verifiedCriteria = new Set(testNodes.flatMap((node) => arrayStrings(node.verifiesAcceptanceCriteriaIds)))
  for (const productNode of nodesOf(product)) {
    for (const criterion of acceptanceCriteriaOf(productNode)) {
      if (getNestedBoolean(criterion, ['verification', 'required']) === true && !verifiedCriteria.has(stringValue(criterion.id))) {
        issues.push(issue({
          validator: 'VD',
          code: 'ACCEPTANCE_NOT_COVERED',
          severity: 'error',
          file: defaultArtifacts.testTree,
          nodeId: stringValue(criterion.id),
          message: `Required acceptance criterion ${String(criterion.id)} has no Test Tree coverage.`,
          suggestedFix: 'Create or link a Test Tree node with verifiesAcceptanceCriteriaIds.',
        }))
      }
    }
  }
  return issues
}

export async function validateAcep(root: string): Promise<ValidationIssue[]> {
  const manifestPath = artifactPath(root, 'executionManifest')
  if (!existsSync(manifestPath)) {
    return [missingIssue('ACEP', 'ACEP_MANIFEST_MISSING', defaultArtifacts.executionManifest, 'ACEP execution manifest is missing.')]
  }
  const issues = await validateAcceptedActors(root)
  if (!existsSync(artifactPath(root, 'finalCoverageCheck'))) {
    issues.push(missingIssue('ACEP', 'FINAL_COVERAGE_MISSING', defaultArtifacts.finalCoverageCheck, 'ACEP final coverage check is missing.'))
  }
  return issues
}

export async function validateEvidence(root: string): Promise<ValidationIssue[]> {
  const evidencePath = artifactPath(root, 'evidenceTree')
  if (!existsSync(evidencePath)) {
    return [missingIssue('Evidence', 'EVIDENCE_TREE_MISSING', defaultArtifacts.evidenceTree, 'Evidence Tree is missing.')]
  }
  const test = await readJsonIfExists(root, 'testTree')
  const evidence = await readJsonIfExists(root, 'evidenceTree')
  const issues: ValidationIssue[] = []
  const evidenceNodes = arrayObjects(evidence?.evidence)
  for (const testNode of nodesOf(test)) {
    if (stringValue(testNode.id) === stringValue(test?.rootNodeId)) {
      continue
    }
    const required = arrayStrings(testNode.evidenceRequired)
    if (required.length === 0) {
      continue
    }
    const testId = stringValue(testNode.id)
    const hasEvidence = evidenceNodes.some((entry) =>
      arrayStrings(entry.evidenceForTestNodeIds).includes(testId) ||
      arrayStrings(entry.provesNodeIds).includes(testId),
    )
    if (!hasEvidence) {
      issues.push(issue({
        validator: 'Evidence',
        code: 'REQUIRED_TEST_NO_EVIDENCE',
        severity: 'error',
        file: defaultArtifacts.evidenceTree,
        nodeId: testId,
        message: `Required Test node ${testId} has no linked evidence.`,
        suggestedFix: 'Attach test logs, screenshots, manual notes, or other required evidence before review.',
      }))
    }
  }
  return issues
}

async function readJsonIfExists(root: string, key: Parameters<typeof artifactPath>[1]): Promise<JsonObject | null> {
  const filePath = artifactPath(root, key)
  if (!existsSync(filePath)) {
    return null
  }
  const parsed = await readJsonSafe<JsonObject>(filePath)
  return parsed.ok ? parsed.value : null
}

function missingIssue(validator: string, code: string, file: string, message: string): ValidationIssue {
  return issue({
    validator,
    code,
    severity: 'error',
    file,
    message,
    suggestedFix: 'Generate or restore the missing PBE artifact before entering this stage.',
  })
}

function scopeLeakIssue(validator: string, code: string, file: string, nodeId: string, productId: string): ValidationIssue {
  return issue({
    validator,
    code,
    severity: 'error',
    file,
    nodeId,
    message: `Deferred/out_of_scope Product node ${productId} appears in active scope ${nodeId}.`,
    suggestedFix: 'Remove inactive Product scope from active Work/Test/ACEP scope or explicitly reopen it through a Change Node and human gate.',
  })
}

function validateAcceptanceCriterion(productNode: JsonObject, criterion: JsonObject): ValidationIssue[] {
  const issues: ValidationIssue[] = []
  const criterionId = stringValue(criterion.id)
  const productId = stringValue(productNode.id)
  const hasCondition = Boolean(stringValue(criterion.condition) || stringValue(criterion.trigger))
  const hasBehavior = Boolean(stringValue(criterion.systemResponse) || stringValue(criterion.shall) || stringValue(criterion.expectedBehavior))
  const hasEvidence = arrayStrings(criterion.requiredEvidence).length > 0 ||
    arrayStrings(getNestedValue(criterion, ['verification', 'evidenceTypes'])).length > 0
  const hasVerification = Boolean(stringValue(criterion.verificationMethod) || getNestedBoolean(criterion, ['verification', 'required']) === true)

  if (!criterionId) {
    issues.push(criteriaIssue('AC_ID_MISSING', criterionId, productId, 'Acceptance criterion is missing id.', 'Assign a stable AC-* id.'))
  }
  if (stringValue(criterion.status) === 'confirmed' && !hasCondition) {
    issues.push(criteriaIssue('AC_CONDITION_MISSING', criterionId, productId, `Acceptance criterion ${criterionId} lacks condition/trigger.`, 'Add WHEN/IF/WHILE/WHERE condition or explicit trigger.'))
  }
  if (stringValue(criterion.status) === 'confirmed' && !hasBehavior) {
    issues.push(criteriaIssue('AC_BEHAVIOR_MISSING', criterionId, productId, `Acceptance criterion ${criterionId} lacks expected observable behavior.`, 'Add systemResponse, shall, or expectedBehavior.'))
  }
  if (stringValue(criterion.status) === 'confirmed' && !hasVerification) {
    issues.push(criteriaIssue('AC_VERIFICATION_METHOD_MISSING', criterionId, productId, `Acceptance criterion ${criterionId} lacks verification method.`, 'Add verificationMethod or verification.required metadata.'))
  }
  if (stringValue(criterion.status) === 'confirmed' && !hasEvidence) {
    issues.push(criteriaIssue('AC_EVIDENCE_REQUIREMENT_MISSING', criterionId, productId, `Acceptance criterion ${criterionId} lacks required evidence metadata.`, 'Add requiredEvidence or verification.evidenceTypes.'))
  }

  const abstractTerms = collectTextAbstractTerms(criterionText(criterion))
  if (abstractTerms.length > 0) {
    issues.push(criteriaIssue('AC_ABSTRACT_TERM', criterionId, productId, `Acceptance criterion ${criterionId} contains abstract term(s): ${abstractTerms.join(', ')}.`, 'Replace subjective language with observable pass/fail criteria.'))
  }

  return issues
}

function criteriaIssue(code: string, criterionId: string, productId: string, message: string, suggestedFix: string): ValidationIssue {
  return issue({
    validator: 'AcceptanceCriteria',
    code,
    severity: 'error',
    file: defaultArtifacts.productTree,
    nodeId: criterionId || productId,
    message,
    suggestedFix,
  })
}

function findRootNode(product: JsonObject): JsonObject | null {
  const rootNodeId = stringValue(product.rootNodeId)
  return nodesOf(product).find((node) => stringValue(node.id) === rootNodeId) || null
}

function nodesOf(tree: JsonObject | null): JsonObject[] {
  return arrayObjects(tree?.nodes)
}

function acceptanceCriteriaOf(node: JsonObject): JsonObject[] {
  return arrayObjects(node.acceptanceCriteria)
}

function childrenOf(node: JsonObject): string[] {
  return arrayStrings(node.children)
}

function isExecutableProductNode(node: JsonObject): boolean {
  const scope = stringValue(node.scopeClass)
  const type = stringValue(node.type)
  const status = stringValue(node.status)
  return executableScopes.has(scope) &&
    !nonExecutableTypes.has(type) &&
    !['deferred', 'out_of_scope', 'blocked'].includes(status)
}

function hasUserConfirmationEvidence(node: JsonObject): boolean {
  return stringValue(node.confirmedBy) === 'user' ||
    Boolean(node.userConfirmedAt) ||
    getNestedString(node, ['source', 'actor']) === 'user' ||
    getNestedString(node, ['source', 'type']) === 'user_interview' ||
    getNestedString(node, ['decisionSource', 'actor']) === 'user'
}

function collectUnresolvedAbstractTerms(node: JsonObject): string[] {
  if (getNestedString(node, ['ambiguityResolution', 'status']) === 'resolved') {
    return []
  }
  const explicitTerms = [
    ...arrayStrings(getNestedValue(node, ['ambiguity', 'terms'])),
    ...arrayStrings(getNestedValue(node, ['ambiguity', 'abstractTerms'])),
  ]
  const textTerms = collectTextAbstractTerms([
    stringValue(node.title),
    stringValue(node.why),
    ...arrayStrings(node.acceptance),
  ].join(' '))
  return [...new Set([...explicitTerms, ...textTerms])]
}

function collectTextAbstractTerms(text: string): string[] {
  const haystack = text.toLowerCase()
  return abstractQualityTerms.filter((term) => haystack.includes(term.toLowerCase()))
}

function criterionText(criterion: JsonObject): string {
  return [
    criterion.statement,
    criterion.condition,
    criterion.systemResponse,
    criterion.shall,
    criterion.expectedBehavior,
    criterion.observableResult,
  ].map(stringValue).join(' ')
}

function getNestedString(value: unknown, keys: string[]): string {
  return stringValue(getNestedValue(value, keys))
}

function getNestedBoolean(value: unknown, keys: string[]): boolean | null {
  const nested = getNestedValue(value, keys)
  return typeof nested === 'boolean' ? nested : null
}

function getNestedValue(value: unknown, keys: string[]): unknown {
  let cursor = value
  for (const key of keys) {
    if (!isObject(cursor)) {
      return undefined
    }
    cursor = cursor[key]
  }
  return cursor
}

function arrayObjects(value: unknown): JsonObject[] {
  if (!Array.isArray(value)) {
    return []
  }
  return value.filter(isObject)
}

function arrayStrings(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return []
  }
  return value.map(stringValue).filter(Boolean)
}

function stringValue(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

function isObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
