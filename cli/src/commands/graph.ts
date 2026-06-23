import { existsSync } from 'node:fs'
import { artifactPath } from '../core/project.js'
import { readJsonSafe } from '../core/fs.js'
import {
  createGraphFromBlueprint,
  defaultGraphViewDefinitions,
  getDefaultGraphViewDefinition,
  validatePbeKnowledgeGraph,
  type PbeGraphViewDefinition,
} from '../core/graph/index.js'
import type { CommandResult, ValidationIssue } from '../core/types.js'
import { ExitCode, hasErrors, issue } from '../core/types.js'
import type { CommandContext } from './shared.js'

export async function graphValidateCommand(context: CommandContext): Promise<CommandResult> {
  const input = {
    productTree: await readArtifact(context.options.root, 'productTree'),
    projectTree: await readArtifact(context.options.root, 'projectTree'),
    workTree: await readArtifact(context.options.root, 'workTree'),
    testTree: await readArtifact(context.options.root, 'testTree'),
    evidence: await readArtifact(context.options.root, 'evidenceTree'),
  }
  const graph = createGraphFromBlueprint(input)
  const issues = validatePbeKnowledgeGraph(graph).map(
    (entry): ValidationIssue =>
      issue({
        validator: 'Graph',
        code: entry.code,
        severity: entry.severity,
        message: entry.message,
        nodeId: entry.nodeId,
        suggestedFix: entry.suggestedFix,
      }),
  )

  return {
    ok: !hasErrors(issues),
    command: 'graph validate',
    exitCode: hasErrors(issues) ? ExitCode.ValidationFailed : ExitCode.Success,
    message: hasErrors(issues)
      ? 'Experimental Graph validation failed.'
      : `Experimental Graph validation passed. Nodes: ${graph.nodes.length}. Edges: ${graph.edges.length}.`,
    issues,
    data: {
      experimental: true,
      graphSummary: {
        nodes: graph.nodes.length,
        edges: graph.edges.length,
        schemaVersion: graph.meta?.schemaVersion,
      },
    },
  }
}

export async function graphViewCommand(context: CommandContext): Promise<CommandResult> {
  const requestedType = context.options.type?.trim()
  if (!requestedType) {
    return {
      ok: true,
      command: 'graph view',
      exitCode: ExitCode.Success,
      message: formatViewList(),
      issues: [],
      data: {
        experimental: true,
        views: defaultGraphViewDefinitions,
      },
    }
  }

  const view = getDefaultGraphViewDefinition(normalizeViewId(requestedType))
  if (!view) {
    return {
      ok: false,
      command: 'graph view',
      exitCode: ExitCode.InvalidArguments,
      message: `Unknown Graph view type: ${requestedType}.`,
      issues: [
        issue({
          validator: 'CLI',
          code: 'GRAPH_VIEW_UNKNOWN',
          severity: 'error',
          message: `Unknown Graph view type: ${requestedType}.`,
          suggestedFix: `Use one of: ${defaultGraphViewDefinitions.map((entry) => entry.id).join(', ')}.`,
        }),
      ],
    }
  }

  return {
    ok: true,
    command: 'graph view',
    exitCode: ExitCode.Success,
    message: formatView(view),
    issues: [],
    data: {
      experimental: true,
      view,
      renderingImplemented: false,
      note: 'This command exposes the View Definition skeleton. Graph view rendering is intentionally not implemented yet.',
    },
  }
}

type ArtifactKey = Parameters<typeof artifactPath>[1]

async function readArtifact(root: string, key: ArtifactKey): Promise<unknown> {
  const filePath = artifactPath(root, key)
  if (!existsSync(filePath)) {
    return undefined
  }
  const parsed = await readJsonSafe(filePath)
  return parsed.ok ? parsed.value : undefined
}

function normalizeViewId(value: string): string {
  const normalized = value.endsWith('-view') ? value : `${value}-view`
  return normalized.replace('product-intent-view-view', 'product-intent-view')
}

function formatViewList(): string {
  return [
    'Experimental Graph views',
    '',
    ...defaultGraphViewDefinitions.map((view) => `- ${view.id}: ${view.name}`),
    '',
    'Rendering is not implemented in this first Graph-first foundation pass.',
  ].join('\n')
}

function formatView(view: PbeGraphViewDefinition): string {
  return [
    `Experimental Graph view: ${view.id}`,
    '',
    view.description || '',
    '',
    'Root node types:',
    ...view.rootNodeTypes.map((entry) => `- ${entry}`),
    '',
    'Traversal rules:',
    ...view.traversalRules.map((rule) => `- ${rule.fromType} --${rule.edgeType}--> ${rule.toType}`),
  ].join('\n')
}
