import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'

export function resolvePath(root, relativePath) {
  return path.join(root, relativePath)
}

export function pathExists(root, relativePath) {
  return existsSync(resolvePath(root, relativePath))
}

export function fileExists(root, relativePath) {
  const absolutePath = resolvePath(root, relativePath)
  return existsSync(absolutePath) && statSync(absolutePath).isFile()
}

export function dirExists(root, relativePath) {
  const absolutePath = resolvePath(root, relativePath)
  return existsSync(absolutePath) && statSync(absolutePath).isDirectory()
}

export function readText(root, relativePath) {
  return readFileSync(resolvePath(root, relativePath), 'utf8')
}

export function listDirNames(root, relativePath) {
  const absolutePath = resolvePath(root, relativePath)
  if (!existsSync(absolutePath)) {
    return []
  }

  return readdirSync(absolutePath)
    .filter((entry) => statSync(path.join(absolutePath, entry)).isDirectory())
    .sort()
}

export function listFiles(root, relativePath, predicate = () => true) {
  const startPath = resolvePath(root, relativePath)
  if (!existsSync(startPath)) {
    return []
  }

  const files = []
  visit(startPath)
  return files.sort()

  function visit(currentPath) {
    for (const entry of readdirSync(currentPath)) {
      const entryPath = path.join(currentPath, entry)
      const stat = statSync(entryPath)
      if (stat.isDirectory()) {
        visit(entryPath)
        continue
      }

      const relativeFile = path.relative(root, entryPath).replaceAll(path.sep, '/')
      if (predicate(relativeFile)) {
        files.push(relativeFile)
      }
    }
  }
}

