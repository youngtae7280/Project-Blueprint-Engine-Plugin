import type { CommandResult } from '../core/types.js'
import { ExitCode } from '../core/types.js'
import type { CommandContext } from './shared.js'

export async function syncDiffCommand(context: CommandContext): Promise<CommandResult> {
  const changedFiles = context.options.files || []
  return {
    ok: true,
    command: 'sync diff',
    exitCode: ExitCode.Success,
    message: formatSyncDiffSkeleton(changedFiles),
    issues: [],
    data: {
      experimental: true,
      implemented: false,
      changedFiles,
      plannedPipeline: [
        'git diff',
        'changed files',
        'file-node-index lookup',
        'affected Work',
        'affected Flow',
        'affected Product',
        'required Test',
        'stale Evidence',
        'Risk / Unknown',
        'actionable report',
      ],
    },
  }
}

function formatSyncDiffSkeleton(changedFiles: string[]): string {
  return [
    'Experimental sync diff skeleton',
    '',
    'pbe sync diff will use changed files and Graph indexes for incremental impact detection.',
    `Changed files supplied: ${changedFiles.length > 0 ? changedFiles.join(', ') : 'none'}`,
    '',
    'The file-node-index lookup and actionable report are intentionally deferred.',
  ].join('\n')
}
