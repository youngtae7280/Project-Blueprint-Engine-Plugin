import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { defaultArtifacts } from '../core/project.js'
import { ensureDir, writeJsonAtomic, writeTextAtomic } from '../core/fs.js'
import { DEVVIEW_STATE } from '../core/state-machine.js'
import type { CommandResult } from '../core/types.js'
import { ExitCode } from '../core/types.js'
import { type CommandContext, invalidCommand } from './shared.js'

const initDirs = [
  '.devview/graph',
  '.devview/tree',
  '.devview/execution/node-execution-contracts',
  '.devview/control',
  '.devview/evidence/screenshots',
  '.devview/evidence/review-reports',
  '.devview/evidence/test-results',
  '.devview/evidence/logs',
  '.devview/blueprint',
  '.devview/codex-execution-pack',
  '.devview/review',
  '.devview/revisions',
]

const jsonTemplateTargets: Array<{
  template: string
  target: string
  transform?: (value: Record<string, unknown>, context: CommandContext) => Record<string, unknown>
}> = [
  { template: 'product-tree.template.json', target: defaultArtifacts.productTree, transform: transformProductTree },
  { template: 'project-tree.template.json', target: defaultArtifacts.projectTree },
  { template: 'work-tree.template.json', target: defaultArtifacts.workTree },
  { template: 'test-tree.template.json', target: defaultArtifacts.testTree },
  { template: 'decision-queue.template.json', target: defaultArtifacts.decisionQueue },
  { template: 'change-tree.template.json', target: defaultArtifacts.changeTree },
  { template: 'impact-tree.template.json', target: defaultArtifacts.impactTree },
  { template: 'product-patch-tree.template.json', target: defaultArtifacts.productPatchTree },
  { template: 'acceptance-tree.template.json', target: defaultArtifacts.acceptanceTree },
  { template: 'evidence-tree.template.json', target: defaultArtifacts.evidenceTree },
  { template: 'visual-reference.template.json', target: defaultArtifacts.visualReference },
  { template: 'design-tokens.template.json', target: defaultArtifacts.designTokens },
  { template: 'component-style-contract.template.json', target: defaultArtifacts.componentStyleContract },
  { template: 'ui-surface-inventory.template.json', target: defaultArtifacts.uiSurfaceInventory },
  { template: 'component-style-inventory.template.json', target: defaultArtifacts.componentStyleInventory },
  { template: 'visual-verification-profile.template.json', target: defaultArtifacts.visualVerificationProfile },
  {
    template: 'requirement-tree.template.json',
    target: defaultArtifacts.requirementTree,
    transform: transformRequirementTree,
  },
  { template: 'devview-state.template.json', target: defaultArtifacts.devviewState, transform: transformDevViewState },
]

const textTemplateTargets: Array<{ template?: string; target: string; fallback: (context: CommandContext) => string }> =
  [
    {
      target: defaultArtifacts.projectBrief,
      fallback: (context) => `# Project Brief\n\n${context.options.brief || 'Initial DevView project brief.'}\n`,
    },
    {
      target: defaultArtifacts.requirementTreeMarkdown,
      fallback: (context) =>
        `# Requirement Tree\n\nRoot request: ${context.options.brief || 'Initial project request'}\n`,
    },
    { target: defaultArtifacts.productIntakeInterviewLog, fallback: () => '# Product Intake Interview Log\n\n' },
    {
      target: defaultArtifacts.productIntakeSummary,
      fallback: () => '# Product Intake Summary\n\nProduct Intake is not closed yet.\n',
    },
    {
      template: 'source-of-truth-matrix-template.md',
      target: defaultArtifacts.sourceOfTruthMatrix,
      fallback: () => '# Source Of Truth Matrix\n\n',
    },
    {
      template: 'devview-routing-contract-template.md',
      target: defaultArtifacts.devviewRoutingContract,
      fallback: () => '# DevView Routing Contract\n\n',
    },
    {
      template: 'devview-invariants-template.md',
      target: defaultArtifacts.devviewInvariants,
      fallback: () => '# DevView Invariants\n\n',
    },
    {
      template: 'visual-reference-template.md',
      target: defaultArtifacts.visualReferenceMarkdown,
      fallback: () => '# Visual Reference\n\nNo visual work selected yet.\n',
    },
    {
      template: 'ui-theme-spec-template.md',
      target: defaultArtifacts.uiThemeSpec,
      fallback: () => '# UI Theme Spec\n\nNo visual work selected yet.\n',
    },
    {
      template: 'visual-audit-template.md',
      target: defaultArtifacts.visualAudit,
      fallback: () => '# Visual Implementation Audit\n\nNot run yet.\n',
    },
  ]

export async function initCommand(context: CommandContext): Promise<CommandResult> {
  const profile = context.options.profile || 'full'
  if (!['full', 'lite', 'bypass'].includes(profile)) {
    return invalidCommand(`Invalid profile: ${String(profile)}`)
  }

  const created: string[] = []
  const skipped: string[] = []
  for (const dir of initDirs) {
    await ensureDir(path.join(context.options.root, dir))
  }

  for (const target of jsonTemplateTargets) {
    const resolvedTarget = target.target
    const outputPath = path.join(context.options.root, resolvedTarget)
    if (existsSync(outputPath) && !context.options.force) {
      skipped.push(resolvedTarget)
      continue
    }
    const templatePath = path.join(context.env.pluginRoot, 'templates', target.template)
    const parsed = JSON.parse(readFileSync(templatePath, 'utf8')) as Record<string, unknown>
    const value = target.transform ? target.transform(parsed, context) : parsed
    await writeJsonAtomic(outputPath, value)
    created.push(resolvedTarget)
  }

  for (const target of canonicalGraphTargets(context)) {
    const resolvedTarget = target.target
    const outputPath = path.join(context.options.root, resolvedTarget)
    if (existsSync(outputPath) && !context.options.force) {
      skipped.push(resolvedTarget)
      continue
    }
    if (target.kind === 'json') {
      await writeJsonAtomic(outputPath, target.value)
    } else {
      await writeTextAtomic(outputPath, target.value)
    }
    created.push(resolvedTarget)
  }

  for (const target of textTemplateTargets) {
    const resolvedTarget = target.target
    const outputPath = path.join(context.options.root, resolvedTarget)
    if (existsSync(outputPath) && !context.options.force) {
      skipped.push(resolvedTarget)
      continue
    }
    let value = target.fallback(context)
    if (target.template) {
      const templatePath = path.join(context.env.pluginRoot, 'templates', target.template)
      if (existsSync(templatePath)) {
        value = readFileSync(templatePath, 'utf8')
      }
    }
    await writeTextAtomic(outputPath, value)
    created.push(resolvedTarget)
  }

  return {
    ok: true,
    command: 'init',
    exitCode: ExitCode.Success,
    message: 'DevView initialized.',
    issues: [],
    data: {
      profile,
      created,
      skipped,
      state: {
        autoflow: {
          enabled: true,
          state: 'INIT',
          nextStep: 'product_intake',
        },
      },
      next: 'Run Product Intake. Use `devview product-intake check` to see what still blocks close.',
      canonicalGraph: {
        artifact: defaultArtifacts.maintainabilityGraph,
        boundary: defaultArtifacts.canonicalGraphBoundary,
        codeNodesAreFirstClass: true,
        compatibilityTreeArtifactsGenerated: true,
      },
    },
  }
}

function canonicalGraphTargets(
  context: CommandContext,
): Array<
  { kind: 'json'; target: string; value: Record<string, unknown> } | { kind: 'text'; target: string; value: string }
> {
  const brief = context.options.brief || 'Initial DevView project'
  const compatibilityArtifacts = [
    defaultArtifacts.productTree,
    defaultArtifacts.projectTree,
    defaultArtifacts.workTree,
    defaultArtifacts.testTree,
    defaultArtifacts.requirementTree,
    defaultArtifacts.changeTree,
    defaultArtifacts.impactTree,
    defaultArtifacts.evidenceTree,
  ]
  return [
    {
      kind: 'json',
      target: defaultArtifacts.maintainabilityGraph,
      value: {
        schemaVersion: 1,
        artifactRole: 'devview-maintainability-graph-source',
        status: 'devview-maintainability-graph-initialized',
        graphScope: 'unified-devview-maintainability-graph-canonical-source',
        rootNodeId: 'project.root',
        nodes: [
          {
            id: 'project.root',
            kind: 'project',
            label: brief,
            title: brief,
            sourceArtifact: defaultArtifacts.maintainabilityGraph,
            sourceAuthorityStatus: 'initialized-canonical-devview-graph-source',
            sourceLocationStatus: 'initialized-no-source-location',
          },
        ],
        edges: [],
        codeSubgraphBoundary: {
          codeNodesAreFirstClass: true,
          codeSubgraphMode: 'unified-maintainability-graph-code-subgraph',
          separateCodeGraphCreated: false,
          acceptedCodeSourceFacts: ['devview-code-subgraph', 'devview-code-symbol-links'],
          acceptedValidationReports: [
            'devview-code-subgraph-validation-report',
            'devview-code-symbol-links-validation-report',
          ],
        },
        compatibilityBoundary: {
          treeControlArtifactsGenerated: true,
          canonicalSourceOfTruth: 'devview-maintainability-graph-source',
          compatibilityArtifacts,
          productTreeCanonical: false,
          requirementTreeCanonical: false,
          workTreeCanonical: false,
          testTreeCanonical: false,
          compatibilityPurpose:
            'These tree artifacts are bootstrap and legacy compatibility views until graph-native workflows replace them.',
        },
        nonAuthorityBoundary: {
          graphSourceMutated: false,
          graphDeltaApplied: false,
          codeExtractorExecuted: false,
          providerInvoked: false,
          networkCallMade: false,
          apiCallMade: false,
          rbacEnforced: false,
          permissionVerified: false,
          enterpriseGateActivated: false,
        },
      },
    },
    {
      kind: 'text',
      target: defaultArtifacts.canonicalGraphBoundary,
      value: [
        '# DevView Canonical Graph Boundary',
        '',
        'DevView treats the Maintainability Graph as the canonical project model.',
        '',
        'Code nodes are first-class nodes inside the same graph. Files, packages, classes, functions, methods, tests, configuration, and external dependencies belong in the unified graph and are connected to requirements, tasks, changes, checks, evidence, decisions, risks, and findings by typed edges.',
        '',
        'The `.devview/tree/*` files and `.devview/blueprint/requirement-tree.*` files generated by `devview init` are compatibility and bootstrap views. They are not the canonical source of truth for the DevView model.',
        '',
        'A supplied `devview-code-subgraph` is a source fact for candidate code nodes and code-code edges. A supplied `devview-code-symbol-links` artifact links those code nodes to maintenance nodes. Validation commands may check these facts, but init does not run extractors, mutate graph sources, apply graph deltas, call providers, enforce RBAC, or activate enterprise gates.',
        '',
      ].join('\n'),
    },
  ]
}

function transformProductTree(value: Record<string, unknown>, context: CommandContext): Record<string, unknown> {
  const brief = context.options.brief
  if (brief && Array.isArray(value.nodes)) {
    const root = value.nodes.find(
      (node): node is Record<string, unknown> =>
        typeof node === 'object' && node !== null && (node as Record<string, unknown>).id === value.rootNodeId,
    )
    if (root) {
      root.title = brief
      root.why = 'Initial user brief captured by devview init.'
    }
  }
  return value
}

function transformRequirementTree(value: Record<string, unknown>, context: CommandContext): Record<string, unknown> {
  const brief = context.options.brief
  if (brief && Array.isArray(value.nodes)) {
    const root = value.nodes.find(
      (node): node is Record<string, unknown> =>
        typeof node === 'object' && node !== null && (node as Record<string, unknown>).id === value.rootNodeId,
    )
    if (root) {
      root.title = brief
      root.summary = brief
    }
  }
  return value
}

function transformDevViewState(value: Record<string, unknown>, context: CommandContext): Record<string, unknown> {
  const now = new Date().toISOString()
  value.createdAt = now
  value.updatedAt = now
  value.deliveryStatus = 'waiting_root_confirmation'
  if (typeof value.autoflow === 'object' && value.autoflow !== null) {
    const autoflow = value.autoflow as Record<string, unknown>
    autoflow.enabled = true
    autoflow.profile = context.options.profile || 'full'
    autoflow.state = DEVVIEW_STATE.INIT
    autoflow.completedSteps = ['start']
    autoflow.currentGate = null
    autoflow.nextStep = 'product_intake'
  }
  return value
}
