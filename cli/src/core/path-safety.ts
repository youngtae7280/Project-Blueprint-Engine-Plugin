export function normalizePolicyPath(filePath: string): string {
  return filePath.replaceAll('\\', '/').toLowerCase()
}

export function pathSegmentsForPolicy(filePath: string): string[] {
  return normalizePolicyPath(filePath)
    .split('/')
    .filter((segment) => segment.length > 0)
}

export function hasHiddenControlDirectorySegment(filePath: string): boolean {
  return pathSegmentsForPolicy(filePath).some(
    (segment) => segment.startsWith('.') && segment !== '.' && segment !== '..' && segment !== '.tmp',
  )
}

export function hasDevViewControlDirectory(filePath: string): boolean {
  return pathSegmentsForPolicy(filePath).includes('.devview')
}

export function hasCodexControlDirectory(filePath: string): boolean {
  return pathSegmentsForPolicy(filePath).includes('.codex')
}

export function isCodexHookOrConfigPath(filePath: string): boolean {
  const segments = pathSegmentsForPolicy(filePath)
  const codexIndex = segments.indexOf('.codex')
  if (codexIndex === -1) {
    return false
  }
  const afterCodex = segments.slice(codexIndex + 1).join('/')
  return afterCodex === 'config.json' || afterCodex.startsWith('hooks/')
}

export function isDevViewEvidencePath(filePath: string): boolean {
  return hasDevViewSubPath(filePath, ['evidence'])
}

export function isDevViewSourceControlPath(filePath: string): boolean {
  return hasDevViewSubPath(filePath, ['control', 'tree', 'evidence'])
}

function hasDevViewSubPath(filePath: string, allowedSubdirs: string[]): boolean {
  const segments = pathSegmentsForPolicy(filePath)
  const devviewIndex = segments.indexOf('.devview')
  return devviewIndex !== -1 && allowedSubdirs.includes(segments[devviewIndex + 1] ?? '')
}
