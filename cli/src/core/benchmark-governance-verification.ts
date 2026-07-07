import path from 'node:path'
import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { relativePath, writeJsonAtomic, writeTextAtomic } from './fs.js'
import {
  hasCodexControlDirectory,
  hasDevViewControlDirectory,
  hasHiddenControlDirectorySegment,
} from './path-safety.js'

type JsonRecord = Record<string, unknown>

const SUITE_LOCK_ROLE = 'devview-benchmark-suite-lock-manifest'
const SUITE_LOCK_STATUS = 'devview-benchmark-suite-locked'
const POLICY_ROLE = 'devview-benchmark-governance-policy'
const POLICY_STATUS = 'devview-benchmark-governance-policy-configured'
const REPORT_ROLE = 'devview-benchmark-governance-verification-report'
const VERIFIED_STATUS = 'devview-benchmark-governance-verified'
const PARTIAL_STATUS = 'devview-benchmark-governance-partial'
const BLOCKED_STATUS = 'devview-benchmark-governance-blocked'

const comparisonArms = ['codex-only', 'codex-graphify', 'codex-devview', 'codex-graphify-devview'] as const
const unsafeAuthorityFields = [
  'providerInvoked',
  'networkCallMade',
  'shellCommandExecuted',
  'shellCommandsExecuted',
  'extensionExecutionAllowed',
  'extensionsExecuted',
  'extensionCodeExecuted',
  'graphifyExecuted',
  'graphifyLiveRun',
  'nativeBenchmarkExecuted',
  'benchmarkExecuted',
  'candidateExecuted',
  'filesMutated',
  'graphSourceMutated',
  'graphDeltaApplied',
  'runtimeEvidenceSatisfied',
  'evidenceAccepted',
  'equivalenceProven',
  'scopeEnforced',
  'ciEnforcementEnabled',
  'hooksActivated',
  'branchProtectionChanged',
  'branchProtectionMutated',
  'requiredChecksConfigured',
  'requiredChecksMutated',
  'externalCiMutated',
  'diffRejectionEnabled',
  'diffRejectionActivated',
  'approvalAutomationEnabled',
  'userAcceptanceAutomated',
]

type VerificationStatus = typeof VERIFIED_STATUS | typeof PARTIAL_STATUS | typeof BLOCKED_STATUS

export interface BenchmarkGovernanceVerificationOptions {
  suiteLock?: string
  governancePolicy?: string
  output?: string
  markdown?: string
}

export interface BenchmarkGovernanceFinding {
  severity: 'info' | 'warning' | 'error'
  findingLevel: 'blocking' | 'governance-gap' | 'policy-check' | 'info'
  code: string
  message: string
  path?: string
  field?: string
}

export interface BenchmarkGovernanceVerificationReport {
  schemaVersion: 1
  artifactRole: typeof REPORT_ROLE
  status: VerificationStatus
  verificationScope: 'benchmark-governance-verification-report-only'
  sourceSuiteLock: {
    path: string | null
    artifactRole: string | null
    status: string | null
    suiteId: string | null
    taskIds: string[]
    projectModes: string[]
    comparisonArms: string[]
    governanceCompletenessStatus: string | null
    tamperEvidenceStatus: string | null
  }
  sourceGovernancePolicy: {
    path: string | null
    artifactRole: string | null
    status: string | null
    supplied: boolean
  }
  versionVerification: {
    benchmarkEvaluatorVersion: string | null
    scoringRubricVersion: string | null
    requiredBenchmarkEvaluatorVersion: string | null
    requiredScoringRubricVersion: string | null
    evaluatorVersionStatus: 'matched' | 'mismatched' | 'missing' | 'not-required'
    scoringRubricVersionStatus: 'matched' | 'mismatched' | 'missing' | 'not-required'
  }
  sourceDigestVerificationSummary: {
    sourceArtifactDigestCount: number
    combinedDigestPresent: boolean
    combinedDigestRecomputed: string | null
    combinedDigestMatches: boolean
    invalidDigestCount: number
  }
  goldenReviewGovernanceCheck: {
    status: string | null
    requiredByPolicy: boolean
    reviewedGoldenAnswerCount: number | null
    totalGoldenAnswerCount: number | null
    missingReviewMetadataCount: number
  }
  heldOutPolicyCheck: {
    status: string | null
    requiredByPolicy: boolean
  }
  staticVsLiveBoundaryCheck: {
    storedCandidateResultsOnly: boolean
    liveExecutionPresent: boolean
    liveGraphifyRunPresent: boolean
    liveNativeBenchmarkPresent: boolean
    sourceFactsOnly: boolean
  }
  graphifyImportGovernanceCheck: {
    requiredByPolicy: boolean
    graphifyArmPresent: boolean
    validationDigestCount: number
    status: 'present' | 'missing' | 'not-required'
  }
  comparisonCoverageCheck: {
    requiredComparisonArms: string[]
    suppliedComparisonArms: string[]
    missingRequiredArms: string[]
    requiredProjectModes: string[]
    suppliedProjectModes: string[]
    missingRequiredProjectModes: string[]
  }
  enterpriseClaimReadiness: 'blocked' | 'partial' | 'not-ready' | 'verified-for-static-benchmark-only'
  governanceFindings: BenchmarkGovernanceFinding[]
  downstreamActionPlan: string[]
  benchmarkExecuted: false
  candidateExecuted: false
  graphifyExecuted: false
  nativeBenchmarkExecuted: false
  sourceFactsOnly: true
  providerInvoked: false
  networkCallMade: false
  shellCommandsExecuted: false
  extensionExecutionAllowed: false
  extensionsExecuted: false
  graphSourceMutated: false
  graphDeltaApplied: false
  runtimeEvidenceSatisfied: false
  evidenceAccepted: false
  equivalenceProven: false
  scopeEnforced: false
  ciEnforcementEnabled: false
  hooksActivated: false
  branchProtectionChanged: false
  branchProtectionMutated: false
  requiredChecksConfigured: false
  requiredChecksMutated: false
  externalCiMutated: false
  diffRejectionEnabled: false
  diffRejectionActivated: false
  approvalAutomationEnabled: false
  userAcceptanceAutomated: false
  writtenOutputPath?: string
  writtenMarkdownPath?: string
}

interface LoadedSource {
  requestedPath: string
  resolvedPath: string
  relativePath: string
  record: JsonRecord | null
  readError: string | null
}

export class BenchmarkGovernanceVerificationValidationError extends Error {
  readonly report: BenchmarkGovernanceVerificationReport

  constructor(report: BenchmarkGovernanceVerificationReport) {
    super('Benchmark governance verification is blocked.')
    this.report = report
  }
}

export async function verifyBenchmarkGovernance(
  root: string,
  options: BenchmarkGovernanceVerificationOptions,
): Promise<BenchmarkGovernanceVerificationReport> {
  validateRequiredOptions(options)
  const suiteLockPath = resolveRepoPath(root, options.suiteLock ?? '')
  const policyPath = options.governancePolicy ? resolveRepoPath(root, options.governancePolicy) : null
  await assertOutputAuthority(root, [suiteLockPath, ...(policyPath ? [policyPath] : [])], options)

  const suiteLock = await loadSource(root, options.suiteLock ?? '')
  const policy = options.governancePolicy ? await loadSource(root, options.governancePolicy) : null
  const blockingFindings = validateSourceSafety(suiteLock, policy)
  if (blockingFindings.length > 0) {
    throw new BenchmarkGovernanceVerificationValidationError(buildReport(suiteLock, policy, blockingFindings, true))
  }

  const report = buildReport(
    suiteLock,
    policy,
    buildGovernanceFindings(suiteLock.record ?? {}, policy?.record ?? null),
    false,
  )
  const outputPath = resolveRepoPath(root, options.output ?? '')
  await writeJsonAtomic(outputPath, report)
  report.writtenOutputPath = relativePath(root, outputPath)
  if (options.markdown) {
    const markdownPath = resolveRepoPath(root, options.markdown)
    await writeTextAtomic(markdownPath, renderMarkdown(report))
    report.writtenMarkdownPath = relativePath(root, markdownPath)
    await writeJsonAtomic(outputPath, report)
  }
  return report
}

function buildReport(
  suiteLock: LoadedSource,
  policy: LoadedSource | null,
  findings: BenchmarkGovernanceFinding[],
  blocked: boolean,
): BenchmarkGovernanceVerificationReport {
  const lock = suiteLock.record ?? {}
  const policyRecord = policy?.record ?? null
  const versionVerification = buildVersionVerification(lock, policyRecord)
  const digestSummary = buildDigestVerificationSummary(lock)
  const goldenReview = asRecord(lock.goldenReviewGovernance)
  const heldOutPolicyStatus = stringValue(lock.heldOutPolicyStatus)
  const staticBoundary = asRecord(lock.staticVsLiveBoundary)
  const graphifyCheck = buildGraphifyImportCheck(lock, policyRecord)
  const coverageCheck = buildComparisonCoverageCheck(lock, policyRecord)
  const status = blocked
    ? BLOCKED_STATUS
    : findings.some((entry) => entry.severity !== 'info')
      ? PARTIAL_STATUS
      : VERIFIED_STATUS

  return {
    schemaVersion: 1,
    artifactRole: REPORT_ROLE,
    status,
    verificationScope: 'benchmark-governance-verification-report-only',
    sourceSuiteLock: {
      path: suiteLock.relativePath,
      artifactRole: stringValue(lock.artifactRole),
      status: stringValue(lock.status),
      suiteId: stringValue(lock.suiteId),
      taskIds: stringArray(lock.taskIds),
      projectModes: stringArray(lock.projectModes),
      comparisonArms: stringArray(lock.comparisonArms),
      governanceCompletenessStatus: stringValue(lock.governanceCompletenessStatus),
      tamperEvidenceStatus: stringValue(lock.tamperEvidenceStatus),
    },
    sourceGovernancePolicy: {
      path: policy?.relativePath ?? null,
      artifactRole: policyRecord ? stringValue(policyRecord.artifactRole) : null,
      status: policyRecord ? stringValue(policyRecord.status) : null,
      supplied: Boolean(policyRecord),
    },
    versionVerification,
    sourceDigestVerificationSummary: digestSummary,
    goldenReviewGovernanceCheck: {
      status: stringValue(goldenReview?.status),
      requiredByPolicy: booleanValue(policyRecord?.requireGoldenReviewMetadata),
      reviewedGoldenAnswerCount: numberValue(goldenReview?.reviewedGoldenAnswerCount),
      totalGoldenAnswerCount: numberValue(goldenReview?.totalGoldenAnswerCount),
      missingReviewMetadataCount: stringArray(goldenReview?.missingReviewMetadataPaths).length,
    },
    heldOutPolicyCheck: {
      status: heldOutPolicyStatus,
      requiredByPolicy: booleanValue(policyRecord?.requireHeldOutPolicy),
    },
    staticVsLiveBoundaryCheck: {
      storedCandidateResultsOnly: staticBoundary?.storedCandidateResultsOnly === true,
      liveExecutionPresent: staticBoundary?.liveExecutionPresent === true,
      liveGraphifyRunPresent: staticBoundary?.liveGraphifyRunPresent === true,
      liveNativeBenchmarkPresent: staticBoundary?.liveNativeBenchmarkPresent === true,
      sourceFactsOnly: staticBoundary?.sourceFactsOnly === true,
    },
    graphifyImportGovernanceCheck: graphifyCheck,
    comparisonCoverageCheck: coverageCheck,
    enterpriseClaimReadiness: enterpriseClaimReadiness(blocked, findings, policyRecord),
    governanceFindings: findings,
    downstreamActionPlan: downstreamActionPlan(findings, policyRecord),
    benchmarkExecuted: false,
    candidateExecuted: false,
    graphifyExecuted: false,
    nativeBenchmarkExecuted: false,
    sourceFactsOnly: true,
    providerInvoked: false,
    networkCallMade: false,
    shellCommandsExecuted: false,
    extensionExecutionAllowed: false,
    extensionsExecuted: false,
    graphSourceMutated: false,
    graphDeltaApplied: false,
    runtimeEvidenceSatisfied: false,
    evidenceAccepted: false,
    equivalenceProven: false,
    scopeEnforced: false,
    ciEnforcementEnabled: false,
    hooksActivated: false,
    branchProtectionChanged: false,
    branchProtectionMutated: false,
    requiredChecksConfigured: false,
    requiredChecksMutated: false,
    externalCiMutated: false,
    diffRejectionEnabled: false,
    diffRejectionActivated: false,
    approvalAutomationEnabled: false,
    userAcceptanceAutomated: false,
  }
}

function validateSourceSafety(suiteLock: LoadedSource, policy: LoadedSource | null): BenchmarkGovernanceFinding[] {
  const findings: BenchmarkGovernanceFinding[] = []
  for (const source of [suiteLock, ...(policy ? [policy] : [])]) {
    if (source.readError) {
      findings.push(blockingFinding('BENCHMARK_GOVERNANCE_SOURCE_READ_FAILED', source.readError, source.relativePath))
      continue
    }
    const role = source === suiteLock ? SUITE_LOCK_ROLE : POLICY_ROLE
    const status = source === suiteLock ? SUITE_LOCK_STATUS : POLICY_STATUS
    if (source.record?.artifactRole !== role || source.record?.status !== status) {
      findings.push(
        blockingFinding(
          'BENCHMARK_GOVERNANCE_SOURCE_ROLE_STATUS_INVALID',
          `${source.relativePath} must be ${role} with status ${status}.`,
          source.relativePath,
        ),
      )
    }
    for (const hit of collectUnsafeAuthorityHits(source.record)) {
      findings.push({
        severity: 'error',
        findingLevel: 'blocking',
        code: 'BENCHMARK_GOVERNANCE_UNSAFE_SOURCE_AUTHORITY_FLAG',
        message: `${source.relativePath} contains unsafe report-only benchmark governance flag ${hit.field}: true.`,
        path: source.relativePath,
        field: hit.field,
      })
    }
  }
  if (findings.length > 0) return findings
  const digest = buildDigestVerificationSummary(suiteLock.record ?? {})
  if (!digest.combinedDigestPresent || !digest.combinedDigestMatches || digest.invalidDigestCount > 0) {
    findings.push(
      blockingFinding(
        'BENCHMARK_GOVERNANCE_SOURCE_DIGEST_INVALID',
        `${suiteLock.relativePath} has missing, invalid, or mismatched source digest metadata.`,
        suiteLock.relativePath,
        'fixtureDigestSummary.combinedSha256',
      ),
    )
  }
  return findings
}

function buildGovernanceFindings(lock: JsonRecord, policy: JsonRecord | null): BenchmarkGovernanceFinding[] {
  const findings: BenchmarkGovernanceFinding[] = []
  const version = buildVersionVerification(lock, policy)
  for (const [status, code, message, field] of [
    [
      version.evaluatorVersionStatus,
      'BENCHMARK_GOVERNANCE_EVALUATOR_VERSION_MISMATCH',
      'Benchmark evaluator version does not match governance policy.',
      'benchmarkEvaluatorVersion',
    ],
    [
      version.scoringRubricVersionStatus,
      'BENCHMARK_GOVERNANCE_RUBRIC_VERSION_MISMATCH',
      'Scoring rubric version does not match governance policy.',
      'scoringRubricVersion',
    ],
  ] as const) {
    if (status === 'mismatched' || status === 'missing') {
      findings.push({ severity: 'warning', findingLevel: 'policy-check', code, message, field })
    }
  }
  if (!policy) {
    findings.push({
      severity: 'warning',
      findingLevel: 'governance-gap',
      code: 'BENCHMARK_GOVERNANCE_POLICY_NOT_SUPPLIED',
      message: 'No benchmark governance policy was supplied; verification remains partial.',
    })
  }
  if (
    policy?.requireGoldenReviewMetadata === true &&
    stringValue(asRecord(lock.goldenReviewGovernance)?.status) !== 'present'
  ) {
    findings.push({
      severity: 'warning',
      findingLevel: 'policy-check',
      code: 'BENCHMARK_GOVERNANCE_GOLDEN_REVIEW_REQUIRED',
      message:
        'Governance policy requires golden-answer review metadata, but the suite lock reports missing or partial review metadata.',
      field: 'goldenReviewGovernance',
    })
  } else if (!policy && stringValue(asRecord(lock.goldenReviewGovernance)?.status) !== 'present') {
    findings.push({
      severity: 'warning',
      findingLevel: 'governance-gap',
      code: 'BENCHMARK_GOVERNANCE_GOLDEN_REVIEW_INCOMPLETE',
      message: 'Golden-answer review metadata is missing or partial.',
      field: 'goldenReviewGovernance',
    })
  }
  if (policy?.requireHeldOutPolicy === true && stringValue(lock.heldOutPolicyStatus) !== 'declared') {
    findings.push({
      severity: 'warning',
      findingLevel: 'policy-check',
      code: 'BENCHMARK_GOVERNANCE_HELD_OUT_POLICY_REQUIRED',
      message: 'Governance policy requires held-out benchmark metadata, but the suite lock does not declare it.',
      field: 'heldOutPolicyStatus',
    })
  } else if (!policy && stringValue(lock.heldOutPolicyStatus) !== 'declared') {
    findings.push({
      severity: 'warning',
      findingLevel: 'governance-gap',
      code: 'BENCHMARK_GOVERNANCE_HELD_OUT_POLICY_INCOMPLETE',
      message: 'Held-out benchmark policy metadata is not declared.',
      field: 'heldOutPolicyStatus',
    })
  }
  const graphifyCheck = buildGraphifyImportCheck(lock, policy)
  if (graphifyCheck.requiredByPolicy && graphifyCheck.status === 'missing') {
    findings.push({
      severity: 'warning',
      findingLevel: 'policy-check',
      code: 'BENCHMARK_GOVERNANCE_GRAPHIFY_VALIDATION_REQUIRED',
      message: 'Governance policy requires static Graphify import validation for Graphify comparison arms.',
      field: 'graphifyImportValidationDigests',
    })
  }
  const coverage = buildComparisonCoverageCheck(lock, policy)
  if (coverage.missingRequiredArms.length > 0) {
    findings.push({
      severity: 'warning',
      findingLevel: 'policy-check',
      code: 'BENCHMARK_GOVERNANCE_REQUIRED_ARMS_MISSING',
      message: `Required comparison arms are missing: ${coverage.missingRequiredArms.join(', ')}.`,
      field: 'comparisonArms',
    })
  }
  if (coverage.missingRequiredProjectModes.length > 0) {
    findings.push({
      severity: 'warning',
      findingLevel: 'policy-check',
      code: 'BENCHMARK_GOVERNANCE_REQUIRED_PROJECT_MODES_MISSING',
      message: `Required project modes are missing: ${coverage.missingRequiredProjectModes.join(', ')}.`,
      field: 'projectModes',
    })
  }
  return findings
}

function buildVersionVerification(
  lock: JsonRecord,
  policy: JsonRecord | null,
): BenchmarkGovernanceVerificationReport['versionVerification'] {
  const evaluatorVersion = stringValue(lock.benchmarkEvaluatorVersion)
  const rubricVersion = stringValue(lock.scoringRubricVersion)
  const requiredEvaluator = stringValue(policy?.requiredBenchmarkEvaluatorVersion)
  const requiredRubric = stringValue(policy?.requiredScoringRubricVersion)
  return {
    benchmarkEvaluatorVersion: evaluatorVersion,
    scoringRubricVersion: rubricVersion,
    requiredBenchmarkEvaluatorVersion: requiredEvaluator,
    requiredScoringRubricVersion: requiredRubric,
    evaluatorVersionStatus: versionStatus(evaluatorVersion, requiredEvaluator),
    scoringRubricVersionStatus: versionStatus(rubricVersion, requiredRubric),
  }
}

function buildDigestVerificationSummary(
  lock: JsonRecord,
): BenchmarkGovernanceVerificationReport['sourceDigestVerificationSummary'] {
  const digests = arrayRecords(lock.sourceArtifactDigests)
  const combined = stringValue(asRecord(lock.fixtureDigestSummary)?.combinedSha256)
  const recomputed = digests.length > 0 ? sha256(JSON.stringify(sortDigestRecords(digests))) : null
  return {
    sourceArtifactDigestCount: digests.length,
    combinedDigestPresent: Boolean(combined && isSha256(combined)),
    combinedDigestRecomputed: recomputed,
    combinedDigestMatches: Boolean(combined && recomputed && combined === recomputed),
    invalidDigestCount: digests.filter(
      (entry) => !isSha256(stringValue(entry.sha256)) || numberValue(entry.byteLength) === null,
    ).length,
  }
}

function buildGraphifyImportCheck(
  lock: JsonRecord,
  policy: JsonRecord | null,
): BenchmarkGovernanceVerificationReport['graphifyImportGovernanceCheck'] {
  const arms = stringArray(lock.comparisonArms)
  const graphifyArmPresent = arms.some((arm) => arm.includes('graphify'))
  const requiredByPolicy = booleanValue(policy?.requireGraphifyImportValidationForGraphifyArms)
  const validationDigestCount = arrayRecords(lock.graphifyImportValidationDigests).length
  return {
    requiredByPolicy,
    graphifyArmPresent,
    validationDigestCount,
    status:
      requiredByPolicy && graphifyArmPresent
        ? validationDigestCount > 0
          ? 'present'
          : 'missing'
        : validationDigestCount > 0
          ? 'present'
          : 'not-required',
  }
}

function buildComparisonCoverageCheck(
  lock: JsonRecord,
  policy: JsonRecord | null,
): BenchmarkGovernanceVerificationReport['comparisonCoverageCheck'] {
  const suppliedComparisonArms = stringArray(lock.comparisonArms)
  const suppliedProjectModes = stringArray(lock.projectModes)
  const requiredComparisonArms = stringArray(policy?.requiredComparisonArms).filter((entry) =>
    comparisonArms.includes(entry as (typeof comparisonArms)[number]),
  )
  const requiredProjectModes = stringArray(policy?.requiredProjectModes)
  return {
    requiredComparisonArms,
    suppliedComparisonArms,
    missingRequiredArms: requiredComparisonArms.filter((arm) => !suppliedComparisonArms.includes(arm)),
    requiredProjectModes,
    suppliedProjectModes,
    missingRequiredProjectModes: requiredProjectModes.filter((mode) => !suppliedProjectModes.includes(mode)),
  }
}

function versionStatus(
  actual: string | null,
  required: string | null,
): 'matched' | 'mismatched' | 'missing' | 'not-required' {
  if (!required) return actual ? 'not-required' : 'missing'
  if (!actual) return 'missing'
  return actual === required ? 'matched' : 'mismatched'
}

function enterpriseClaimReadiness(
  blocked: boolean,
  findings: BenchmarkGovernanceFinding[],
  policy: JsonRecord | null,
): BenchmarkGovernanceVerificationReport['enterpriseClaimReadiness'] {
  if (blocked) return 'blocked'
  if (findings.some((entry) => entry.findingLevel === 'policy-check' && entry.severity !== 'info')) return 'not-ready'
  if (!policy || findings.some((entry) => entry.severity !== 'info')) return 'partial'
  return 'verified-for-static-benchmark-only'
}

function downstreamActionPlan(findings: BenchmarkGovernanceFinding[], policy: JsonRecord | null): string[] {
  const actions = new Set<string>()
  if (!policy) actions.add('Define a benchmark governance policy and rerun verification.')
  if (findings.some((entry) => entry.code.includes('GOLDEN_REVIEW'))) {
    actions.add('Add reviewer metadata to golden answers before enterprise benchmark claims.')
  }
  if (findings.some((entry) => entry.code.includes('HELD_OUT_POLICY'))) {
    actions.add('Declare held-out or anti-overfitting policy metadata for benchmark tasks.')
  }
  if (findings.some((entry) => entry.code.includes('GRAPHIFY'))) {
    actions.add('Attach static Graphify import validation for Graphify comparison arms.')
  }
  if (actions.size === 0) actions.add('Proceed to enterprise readiness reporting for static benchmark governance.')
  return [...actions]
}

async function loadSource(root: string, requestedPath: string): Promise<LoadedSource> {
  const resolvedPath = resolveRepoPath(root, requestedPath)
  const relative = relativePath(root, resolvedPath)
  try {
    const text = await readFile(resolvedPath, 'utf8')
    try {
      return {
        requestedPath,
        resolvedPath,
        relativePath: relative,
        record: JSON.parse(text.replace(/^\uFEFF/, '')) as JsonRecord,
        readError: null,
      }
    } catch (error) {
      return {
        requestedPath,
        resolvedPath,
        relativePath: relative,
        record: null,
        readError: error instanceof Error ? error.message : String(error),
      }
    }
  } catch (error) {
    return {
      requestedPath,
      resolvedPath,
      relativePath: relative,
      record: null,
      readError: error instanceof Error ? error.message : String(error),
    }
  }
}

function validateRequiredOptions(options: BenchmarkGovernanceVerificationOptions): void {
  if (!options.suiteLock) throw new Error('benchmark verify-governance requires --suite-lock <file>.')
  if (!options.output) throw new Error('benchmark verify-governance requires --output <json>.')
}

async function assertOutputAuthority(
  root: string,
  sourcePaths: string[],
  options: BenchmarkGovernanceVerificationOptions,
): Promise<void> {
  const outputPath = options.output ? resolveRepoPath(root, options.output) : null
  const markdownPath = options.markdown ? resolveRepoPath(root, options.markdown) : null
  if (!outputPath) throw new Error('benchmark verify-governance requires --output <json>.')
  const sourceSet = new Set(sourcePaths.map((entry) => path.resolve(entry)))
  if (markdownPath && path.resolve(outputPath) === path.resolve(markdownPath)) {
    throw new Error('Benchmark governance verification JSON output and Markdown output must be different paths.')
  }
  for (const target of [outputPath, ...(markdownPath ? [markdownPath] : [])]) {
    const relativeTarget = relativePath(root, target)
    if (sourceSet.has(path.resolve(target))) {
      throw new Error(`Benchmark governance verification output would overwrite a source input: ${relativeTarget}.`)
    }
    if (
      hasDevViewControlDirectory(target) ||
      hasCodexControlDirectory(target) ||
      hasHiddenControlDirectorySegment(target)
    ) {
      throw new Error(`Benchmark governance verification output is inside a protected control path: ${relativeTarget}.`)
    }
    if (isSourceAuthorityShapedPath(relativeTarget)) {
      throw new Error(
        `Benchmark governance verification output would overwrite a source-authority-shaped path: ${relativeTarget}.`,
      )
    }
  }
}

function renderMarkdown(report: BenchmarkGovernanceVerificationReport): string {
  return [
    '# DevView Benchmark Governance Verification',
    '',
    `- status: ${report.status}`,
    `- suiteId: ${report.sourceSuiteLock.suiteId ?? 'unknown'}`,
    `- enterpriseClaimReadiness: ${report.enterpriseClaimReadiness}`,
    `- evaluatorVersionStatus: ${report.versionVerification.evaluatorVersionStatus}`,
    `- scoringRubricVersionStatus: ${report.versionVerification.scoringRubricVersionStatus}`,
    `- combinedDigestMatches: ${report.sourceDigestVerificationSummary.combinedDigestMatches}`,
    `- goldenReviewGovernance: ${report.goldenReviewGovernanceCheck.status ?? 'unknown'}`,
    `- heldOutPolicyStatus: ${report.heldOutPolicyCheck.status ?? 'unknown'}`,
    '',
    '## Findings',
    ...(report.governanceFindings.length === 0
      ? ['- none']
      : report.governanceFindings.map((entry) => `- [${entry.severity}] ${entry.code}: ${entry.message}`)),
    '',
    '## Downstream Actions',
    ...report.downstreamActionPlan.map((entry) => `- ${entry}`),
    '',
    '## Safety',
    '- benchmarkExecuted: false',
    '- candidateExecuted: false',
    '- graphifyExecuted: false',
    '- nativeBenchmarkExecuted: false',
    '- providerInvoked: false',
    '- networkCallMade: false',
    '- shellCommandsExecuted: false',
    '- graphSourceMutated: false',
    '- graphDeltaApplied: false',
  ].join('\n')
}

function blockingFinding(
  code: string,
  message: string,
  pathValue?: string,
  field?: string,
): BenchmarkGovernanceFinding {
  return { severity: 'error', findingLevel: 'blocking', code, message, path: pathValue, field }
}

function collectUnsafeAuthorityHits(
  value: unknown,
  pathParts: string[] = [],
  seen = new Set<unknown>(),
): Array<{ field: string }> {
  if (typeof value !== 'object' || value === null || seen.has(value)) return []
  seen.add(value)
  if (Array.isArray(value)) {
    return value.flatMap((entry, index) => collectUnsafeAuthorityHits(entry, [...pathParts, String(index)], seen))
  }
  const record = value as JsonRecord
  const hits: Array<{ field: string }> = []
  for (const [key, entry] of Object.entries(record)) {
    const nextPath = [...pathParts, key]
    if (unsafeAuthorityFields.includes(key) && entry === true) {
      hits.push({ field: nextPath.join('.') })
    }
    hits.push(...collectUnsafeAuthorityHits(entry, nextPath, seen))
  }
  return hits
}

function sortDigestRecords(digests: JsonRecord[]): JsonRecord[] {
  return [...digests].sort((a, b) => {
    const left = `${stringValue(a.sourceKind) ?? ''}:${stringValue(a.sourcePath) ?? ''}`
    const right = `${stringValue(b.sourceKind) ?? ''}:${stringValue(b.sourcePath) ?? ''}`
    return left.localeCompare(right)
  })
}

function isSourceAuthorityShapedPath(filePath: string): boolean {
  const normalized = filePath.replace(/\\/g, '/').toLowerCase()
  return (
    normalized.includes('/graph-source') ||
    normalized.includes('/source-authority') ||
    normalized.includes('/read-model') ||
    normalized.includes('/project-memory') ||
    normalized.endsWith('maintainability-graph.json')
  )
}

function resolveRepoPath(root: string, filePath: string): string {
  return path.resolve(root, filePath)
}

function isSha256(value: string | null): boolean {
  return Boolean(value && /^[a-f0-9]{64}$/i.test(value))
}

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex')
}

function arrayRecords(value: unknown): JsonRecord[] {
  return Array.isArray(value) ? value.filter((entry): entry is JsonRecord => isRecord(entry)) : []
}

function asRecord(value: unknown): JsonRecord | null {
  return isRecord(value) ? value : null
}

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === 'string' && entry.length > 0)
    : []
}

function stringValue(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null
}

function numberValue(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function booleanValue(value: unknown): boolean {
  return value === true
}
