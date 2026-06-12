import { existsSync } from 'node:fs'
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'

export interface JsonArtifactWrite {
  filePath: string
  value: unknown
}

interface PreparedWrite {
  filePath: string
  tempPath: string
  originalText: string | null
  committed: boolean
}

export async function writeJsonArtifactTransaction(writes: JsonArtifactWrite[]): Promise<void> {
  const prepared: PreparedWrite[] = []
  const stamp = `${process.pid}.${Date.now()}`

  try {
    for (const [index, write] of writes.entries()) {
      const text = `${JSON.stringify(write.value, null, 2)}\n`
      await mkdir(path.dirname(write.filePath), { recursive: true })
      const originalText = existsSync(write.filePath) ? await readFile(write.filePath, 'utf8') : null
      const tempPath = `${write.filePath}.${stamp}.${index}.tmp`
      await writeFile(tempPath, text, 'utf8')
      prepared.push({
        filePath: write.filePath,
        tempPath,
        originalText,
        committed: false,
      })
    }

    for (const write of prepared) {
      await rename(write.tempPath, write.filePath)
      write.committed = true
    }
  } catch (error) {
    const rollbackErrors: string[] = []
    for (const write of prepared.toReversed()) {
      try {
        if (write.committed) {
          if (write.originalText === null) {
            await rm(write.filePath, { force: true })
          } else {
            await writeFile(write.filePath, write.originalText, 'utf8')
          }
        } else {
          await rm(write.tempPath, { force: true })
        }
      } catch (rollbackError) {
        rollbackErrors.push(rollbackError instanceof Error ? rollbackError.message : String(rollbackError))
      }
    }
    const message = error instanceof Error ? error.message : String(error)
    const rollbackMessage = rollbackErrors.length > 0 ? ` Rollback errors: ${rollbackErrors.join('; ')}` : ''
    throw new Error(`Artifact transaction failed: ${message}.${rollbackMessage}`)
  }
}
