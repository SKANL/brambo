import { appendFileSync, mkdirSync, readFileSync } from 'node:fs'
import { dirname } from 'node:path'
import type { OrchestrationStateStore, OrchestrationTaskRecord } from '@brambodev/contracts'

/** Append-only snapshots; the last valid snapshot is the resumable state. */
export function createJsonlOrchestrationStateStore(filePath: string): OrchestrationStateStore & { readonly filePath: string } {
  mkdirSync(dirname(filePath), { recursive: true })
  return {
    filePath,
    load(): readonly OrchestrationTaskRecord[] {
      let source: string
      try { source = readFileSync(filePath, 'utf8') } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') return []
        throw error
      }
      let latest: readonly OrchestrationTaskRecord[] = []
      for (const [index, line] of source.split(/\r?\n/).filter(Boolean).entries()) {
        try {
          const parsed: unknown = JSON.parse(line)
          if (!Array.isArray(parsed)) throw new Error('snapshot must be an array')
          latest = parsed as OrchestrationTaskRecord[]
        } catch (error) {
          throw new Error(`invalid orchestration snapshot at line ${index + 1}: ${error instanceof Error ? error.message : String(error)}`, { cause: error })
        }
      }
      return latest
    },
    save(records: readonly OrchestrationTaskRecord[]): void {
      appendFileSync(filePath, `${JSON.stringify(records)}\n`, 'utf8')
    },
  }
}
