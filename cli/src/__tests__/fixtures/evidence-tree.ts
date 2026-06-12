import { join } from 'node:path'
import { writeJson, writeText } from './workspace'

export function writeEvidenceTree(
  workspace: string,
  options: {
    path?: string
    status?: string
    omitTimestamp?: boolean
    createdAt?: string
    updatedAt?: string
    recordedAt?: string
    timestamp?: string
    verifiedAt?: string
    supersededByEvidenceId?: string | null
    supersedesEvidenceIds?: string[]
    provesNodeIds?: string[]
    provesProductNodeIds?: string[]
    provesWorkNodeIds?: string[]
    provesTestNodeIds?: string[]
    evidenceForTestNodeIds?: string[]
    extraEvidence?: Array<Record<string, unknown>>
  } = {},
): void {
  writeJson(join(workspace, '.pbe', 'evidence', 'evidence-tree.json'), {
    version: '0.2.0-tree-control',
    evidence: [
      {
        id: 'EV-1',
        type: 'test_output',
        status: options.status || 'current',
        path: options.path,
        createdAt: options.omitTimestamp ? undefined : (options.createdAt ?? '2026-06-12T12:00:00.000Z'),
        updatedAt: options.updatedAt,
        recordedAt: options.recordedAt,
        timestamp: options.timestamp,
        verifiedAt: options.verifiedAt,
        supersededByEvidenceId: options.supersededByEvidenceId,
        supersedesEvidenceIds: options.supersedesEvidenceIds || [],
        provesNodeIds: options.provesNodeIds || ['TT-1'],
        provesProductNodeIds: options.provesProductNodeIds || [],
        provesWorkNodeIds: options.provesWorkNodeIds || [],
        provesTestNodeIds: options.provesTestNodeIds || [],
        evidenceForTestNodeIds: options.evidenceForTestNodeIds || ['TT-1'],
        evidenceForAcceptanceCriteriaIds: ['AC-PT-1-1'],
      },
      ...(options.extraEvidence || []),
    ],
  })
}

export function writeVisualScreenshotEvidence(workspace: string): void {
  const screenshotPath = join(workspace, '.pbe', 'evidence', 'screenshots', 'surface-1-default.png')
  writeText(screenshotPath, 'fake screenshot bytes')
  writeJson(join(workspace, '.pbe', 'evidence', 'evidence-tree.json'), {
    version: '0.2.0-tree-control',
    evidence: [
      {
        id: 'EV-VISUAL-1',
        type: 'screenshot',
        status: 'current',
        path: '.pbe/evidence/screenshots/surface-1-default.png',
        createdAt: '2026-06-12T12:00:00.000Z',
        provesNodeIds: ['TT-1'],
        evidenceForTestNodeIds: ['TT-1'],
        evidenceForAcceptanceCriteriaIds: ['AC-PT-1-1'],
      },
    ],
  })
}
