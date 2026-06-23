import type { PbeGraphOperationPlan, PbeOperationKind } from '../core/graph/index.js'
import type { CommandResult } from '../core/types.js'
import { ExitCode, issue } from '../core/types.js'
import type { CommandContext } from './shared.js'

export async function operationPlanCommand(context: CommandContext): Promise<CommandResult> {
  const text = context.options.text?.trim()
  if (!text) {
    return {
      ok: false,
      command: 'operation plan',
      exitCode: ExitCode.InvalidArguments,
      message: 'Missing required option: --text',
      issues: [
        issue({
          validator: 'CLI',
          code: 'OPERATION_PLAN_TEXT_REQUIRED',
          severity: 'error',
          message: 'Missing required option: --text',
          suggestedFix: 'Run `pbe operation plan --text "..."` with the user request to interpret.',
        }),
      ],
    }
  }

  const plan: PbeGraphOperationPlan = {
    id: `GOP-${Date.now()}`,
    summary: text,
    operationKind: inferOperationKind(text),
    requestedBy: 'user',
    createNodes: [],
    updateNodes: [],
    createEdges: [],
    updateEdges: [],
    affectedNodeIds: [],
    requiredViewIds: ['product-intent-view', 'work-implementation-view', 'test-coverage-view'],
    assumptions: [],
    unknowns: [],
    risks: [],
    requiredEvidence: [],
    scope: {
      allowedNodeIds: [],
      forbiddenNodeIds: [],
      allowedFiles: [],
      forbiddenFiles: [],
    },
  }

  return {
    ok: true,
    command: 'operation plan',
    exitCode: ExitCode.Success,
    message: formatOperationPlan(plan),
    issues: [],
    data: {
      experimental: true,
      plan,
      automaticPlanningImplemented: false,
      note: 'This is a typed Graph Operation Plan skeleton. Automatic plan generation is intentionally deferred.',
    },
  }
}

function inferOperationKind(text: string): PbeOperationKind {
  const lower = text.toLowerCase()
  if (/\b(bug|fix|defect|error|crash)\b/.test(lower)) {
    return 'bug-fix'
  }
  if (/\b(refactor|cleanup|restructure)\b/.test(lower)) {
    return 'refactor'
  }
  if (/\b(ui|ux|screen|layout|visual)\b/.test(lower)) {
    return 'ui-change'
  }
  if (/\b(test|coverage|verification)\b/.test(lower)) {
    return 'test-hardening'
  }
  if (/\b(doc|readme|documentation)\b/.test(lower)) {
    return 'doc-sync'
  }
  if (/\b(diff|sync)\b/.test(lower)) {
    return 'sync-diff'
  }
  if (/\b(baseline|ingest|existing project|legacy)\b/.test(lower)) {
    return 'baseline-reconstruction'
  }
  if (/\b(add|create|new feature)\b/.test(lower)) {
    return 'feature-addition'
  }
  return 'unknown'
}

function formatOperationPlan(plan: PbeGraphOperationPlan): string {
  return [
    'Experimental Graph Operation Plan',
    '',
    `ID: ${plan.id}`,
    `Kind: ${plan.operationKind}`,
    `Summary: ${plan.summary}`,
    '',
    'Required views:',
    ...plan.requiredViewIds.map((viewId) => `- ${viewId}`),
    '',
    'Automatic node/edge delta generation is not implemented in this first foundation pass.',
  ].join('\n')
}
