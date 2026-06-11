import { execFileSync } from 'node:child_process'
import { cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

const tempRoots: string[] = []

afterEach(() => {
  for (const root of tempRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true })
  }
})

describe('PBE v2 tree validator', () => {
  it('passes when only schemas and templates are present', () => {
    const workspace = createTreeValidatorWorkspace()

    const result = runTreeValidator(workspace)

    expect(result.status).toBe(0)
    expect(result.output).toContain('No .pbe tree artifacts found')
  })

  it('accepts a minimal linked Product and Work tree', () => {
    const workspace = createTreeValidatorWorkspace()
    writeProductTree(workspace)
    writeWorkTree(workspace, 'PT-1')

    const result = runTreeValidator(workspace)

    expect(result.status).toBe(0)
    expect(result.output).toContain('Validated 2 .pbe tree artifact')
  })

  it('rejects Work nodes that do not derive from known Product nodes', () => {
    const workspace = createTreeValidatorWorkspace()
    writeProductTree(workspace)
    writeWorkTree(workspace, 'PT-MISSING')

    const result = runTreeValidator(workspace)

    expect(result.status).toBe(1)
    expect(result.output).toContain('references missing product source')
  })

  it('rejects submitted cycles that include work without test coverage', () => {
    const workspace = createTreeValidatorWorkspace()
    writeProductTree(workspace)
    writeWorkTree(workspace, 'PT-1')
    writeCycleTree(workspace, {
      status: 'submitted_for_review',
      includedWorkNodeIds: ['WT-1'],
      includedTestNodeIds: [],
    })

    const result = runTreeValidator(workspace)

    expect(result.status).toBe(1)
    expect(result.output).toContain('has no included Test Tree nodes')
    expect(result.output).toContain('included work WT-1 lacks included Test Tree coverage')
  })

  it('rejects submitted cycles whose included tests lack attached evidence', () => {
    const workspace = createTreeValidatorWorkspace()
    writeProductTree(workspace)
    writeWorkTree(workspace, 'PT-1')
    writeTestTree(workspace, 'PT-1', 'WT-1', 'passed')
    writeCycleTree(workspace, {
      status: 'submitted_for_review',
      includedWorkNodeIds: ['WT-1'],
      includedTestNodeIds: ['TT-1'],
    })

    const result = runTreeValidator(workspace)

    expect(result.status).toBe(1)
    expect(result.output).toContain('included test TT-1 lacks attached Evidence Tree evidence')
  })

  it('rejects accepted branches that use stale evidence', () => {
    const workspace = createTreeValidatorWorkspace()
    writeProductTree(workspace)
    writeEvidenceTree(workspace, [
      {
        id: 'EV-1',
        type: 'test_output',
        status: 'stale_evidence',
        provesNodeIds: ['PT-1'],
      },
    ])
    writeAcceptanceTree(workspace, 'PT-1', 'EV-1')

    const result = runTreeValidator(workspace)

    expect(result.status).toBe(1)
    expect(result.output).toContain('uses non-current evidence EV-1 with status stale_evidence')
  })

  it('rejects parity-reviewed surfaces without legacy inventory links', () => {
    const workspace = createTreeValidatorWorkspace()
    writeProductTree(workspace)
    writeWorkTree(workspace, 'PT-1')
    writeTestTree(workspace, 'PT-1', 'WT-1', 'passed')
    writeEvidenceTree(workspace, [
      {
        id: 'EV-1',
        type: 'manual_note',
        status: 'attached',
        provesNodeIds: ['TT-1'],
      },
    ])
    writeSurfaceCompletionLedger(workspace)

    const result = runTreeValidator(workspace)

    expect(result.status).toBe(1)
    expect(result.output).toContain('claims parity_reviewed but lacks legacyInventoryIds')
  })

  it('rejects hardware certification without certification evidence', () => {
    const workspace = createTreeValidatorWorkspace()
    writeProductTree(workspace)
    writeWorkTree(workspace, 'PT-1')
    writeTestTree(workspace, 'PT-1', 'WT-1', 'passed')
    writeHardwareReadinessLedger(workspace)

    const result = runTreeValidator(workspace)

    expect(result.status).toBe(1)
    expect(result.output).toContain('is hardware_certified but lacks certification evidence')
  })

  it('rejects repeated verification misses resolved without promotion', () => {
    const workspace = createTreeValidatorWorkspace()
    writeProductTree(workspace)
    writeVerificationMissLog(workspace)

    const result = runTreeValidator(workspace)

    expect(result.status).toBe(1)
    expect(result.output).toContain('repeated 2 times but was resolved without promotion or blocking')
  })
})

function createTreeValidatorWorkspace() {
  const workspace = mkdtempSync(join(tmpdir(), 'pbe-tree-validator-'))
  tempRoots.push(workspace)

  for (const entry of ['schemas', 'templates']) {
    cpSync(resolve(process.cwd(), entry), join(workspace, entry), { recursive: true })
  }

  return workspace
}

function runTreeValidator(workspace: string) {
  try {
    const output = execFileSync(
      process.execPath,
      [resolve(process.cwd(), 'scripts/validate-pbe-tree-system.js')],
      {
        cwd: workspace,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
      },
    )
    return { status: 0, output }
  } catch (error) {
    const failure = error as { status?: number; stdout?: Buffer; stderr?: Buffer }
    return {
      status: failure.status ?? 1,
      output: `${failure.stdout?.toString() || ''}${failure.stderr?.toString() || ''}`,
    }
  }
}

function writeProductTree(workspace: string) {
  writeJson(join(workspace, '.pbe', 'tree', 'product-tree.json'), {
    version: '0.2.0-tree-control',
    rootNodeId: 'PT-ROOT',
    nodes: [
      {
        id: 'PT-ROOT',
        type: 'goal',
        title: 'Product root',
        status: 'accepted',
        parent: null,
        children: ['PT-1'],
      },
      {
        id: 'PT-1',
        type: 'capability',
        title: 'Example capability',
        status: 'accepted',
        parent: 'PT-ROOT',
        children: [],
        scopeClass: 'selected',
      },
    ],
  })
}

function writeWorkTree(workspace: string, productNodeId: string) {
  writeJson(join(workspace, '.pbe', 'tree', 'work-tree.json'), {
    version: '0.2.0-tree-control',
    rootNodeId: 'WT-ROOT',
    nodes: [
      {
        id: 'WT-ROOT',
        type: 'foundation_task',
        title: 'Work root',
        status: 'ready',
        derivedFromProductNodeIds: [],
        derivedFromProjectNodeIds: [],
        scopeClass: 'foundation',
      },
      {
        id: 'WT-1',
        type: 'feature_task',
        title: 'Implement capability',
        status: 'ready',
        derivedFromProductNodeIds: [productNodeId],
        derivedFromProjectNodeIds: [],
        scopeClass: 'selected',
        expectedFiles: ['src/example.ts'],
        expectedSharedFiles: [],
        forbiddenFiles: [],
        unknownFileTouchRisk: false,
        dependencies: [],
        doneCriteria: ['Capability implemented'],
        validationHints: ['Run focused tests'],
      },
    ],
    edges: [],
  })
}

function writeTestTree(workspace: string, productNodeId: string, workNodeId: string, status: string) {
  writeJson(join(workspace, '.pbe', 'tree', 'test-tree.json'), {
    version: '0.2.0-tree-control',
    rootNodeId: 'TT-ROOT',
    nodes: [
      {
        id: 'TT-ROOT',
        type: 'acceptance_check',
        title: 'Test root',
        status: 'planned',
        verifiesProductNodeIds: [],
        verifiesProjectNodeIds: [],
        verifiesWorkNodeIds: [],
        evidenceRequired: [],
      },
      {
        id: 'TT-1',
        type: 'unit_test',
        title: 'Verify capability',
        status,
        verifiesProductNodeIds: [productNodeId],
        verifiesProjectNodeIds: [],
        verifiesWorkNodeIds: [workNodeId],
        validationCommands: ['npm test'],
        manualChecks: [],
        passCriteria: ['Capability is verified'],
        evidenceRequired: ['test output'],
      },
    ],
  })
}

function writeCycleTree(
  workspace: string,
  options: {
    status: string
    includedWorkNodeIds: string[]
    includedTestNodeIds: string[]
  },
) {
  writeJson(join(workspace, '.pbe', 'execution', 'cycle-tree.json'), {
    version: '0.2.0-tree-control',
    activeCycleId: 'CYCLE-1',
    cycles: [
      {
        id: 'CYCLE-1',
        goal: 'Implement capability',
        status: options.status,
        includedProductNodeIds: ['PT-1'],
        includedProjectNodeIds: [],
        includedWorkNodeIds: options.includedWorkNodeIds,
        includedTestNodeIds: options.includedTestNodeIds,
        explicitlyExcludedNodeIds: [],
        requiresChangeNode: [],
        requiredEvidence: ['test output'],
        closeCriteria: ['Included work and tests are complete'],
      },
    ],
  })
}

function writeEvidenceTree(
  workspace: string,
  evidence: Array<{
    id: string
    type: string
    status: string
    provesNodeIds: string[]
  }>,
) {
  writeJson(join(workspace, '.pbe', 'evidence', 'evidence-tree.json'), {
    version: '0.2.0-tree-control',
    evidence,
  })
}

function writeAcceptanceTree(workspace: string, productNodeId: string, evidenceNodeId: string) {
  writeJson(join(workspace, '.pbe', 'control', 'acceptance-tree.json'), {
    version: '0.2.0-tree-control',
    branches: [
      {
        productNodeId,
        status: 'accepted_done',
        cycleIds: ['CYCLE-1'],
        evidenceNodeIds: [evidenceNodeId],
        userAcceptedAt: '2026-06-11T00:00:00.000Z',
        notes: 'User accepted the branch.',
      },
    ],
  })
}

function writeSurfaceCompletionLedger(workspace: string) {
  writeJson(join(workspace, '.pbe', 'control', 'surface-completion-ledger.json'), {
    version: '0.2.1-parity-completeness',
    surfaces: [
      {
        id: 'SURFACE-1',
        title: 'Parity surface',
        scopeClass: 'selected',
        completionLayer: 'parity_reviewed',
        parityClaim: 'parity_reviewed',
        productNodeIds: ['PT-1'],
        projectNodeIds: [],
        workNodeIds: ['WT-1'],
        testNodeIds: ['TT-1'],
        evidenceNodeIds: ['EV-1'],
        legacyInventoryIds: [],
        visualProfileIds: [],
        hardwareReadinessIds: [],
        acceptanceBranchIds: [],
        items: [],
      },
    ],
  })
}

function writeHardwareReadinessLedger(workspace: string) {
  writeJson(join(workspace, '.pbe', 'control', 'hardware-readiness-ledger.json'), {
    version: '0.2.1-parity-completeness',
    features: [
      {
        id: 'HR-1',
        title: 'Certified hardware feature',
        state: 'hardware_certified',
        productNodeIds: ['PT-1'],
        workNodeIds: ['WT-1'],
        testNodeIds: ['TT-1'],
        evidenceNodeIds: [],
        certificationEvidenceNodeIds: [],
      },
    ],
  })
}

function writeVerificationMissLog(workspace: string) {
  writeJson(join(workspace, '.pbe', 'control', 'verification-miss-log.json'), {
    version: '0.2.1-parity-completeness',
    misses: [
      {
        id: 'VML-1',
        feedbackItemIds: ['FB-1'],
        affectedNodeIds: ['PT-1'],
        missType: 'visual_runtime_gap',
        occurrenceCount: 2,
        whyPreviousVerificationMissedThis: 'The previous validation did not inspect runtime coordinates.',
        promotionDecision: 'not_required',
        promotedTestNodeIds: [],
        promotedEvidenceNodeIds: [],
        promotedContractRefs: [],
        status: 'resolved',
      },
    ],
  })
}

function writeJson(file: string, value: unknown) {
  mkdirSync(resolve(file, '..'), { recursive: true })
  writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
}
