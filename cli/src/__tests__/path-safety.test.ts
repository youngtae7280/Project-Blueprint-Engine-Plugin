import { describe, expect, it } from 'vitest'
import {
  hasHiddenControlDirectorySegment,
  isCodexHookOrConfigPath,
  isDevViewEvidencePath,
  isDevViewSourceControlPath,
} from '../core/path-safety'

describe('path-safety helpers', () => {
  it('protects DevView and Codex control paths', () => {
    expect(isDevViewSourceControlPath('.devview/control/decision-queue.json')).toBe(true)
    expect(isDevViewSourceControlPath('project/.devview/tree/product-tree.json')).toBe(true)
    expect(isDevViewEvidencePath('.devview/evidence/test-results/report.json')).toBe(true)
    expect(isCodexHookOrConfigPath('.codex/hooks/pre-commit.ps1')).toBe(true)
    expect(isCodexHookOrConfigPath('.codex/config.json')).toBe(true)
  })

  it('treats hidden control directories as protected while allowing temporary reports', () => {
    expect(hasHiddenControlDirectorySegment('.devview/blueprint/devview-state.json')).toBe(true)
    expect(hasHiddenControlDirectorySegment('workspace/.secret/config.json')).toBe(true)
    expect(hasHiddenControlDirectorySegment('.tmp/review-devview-baseline.json')).toBe(false)
  })
})
