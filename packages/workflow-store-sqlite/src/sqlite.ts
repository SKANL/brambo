import type { DatabaseSync } from 'node:sqlite'

export class WorkflowStoreError extends Error {
  readonly code: string
  constructor(code: string, message: string) { super(message); this.name = 'WorkflowStoreError'; this.code = code }
}

/** Optional runtime dependency: importing the package never opens or loads SQLite. */
export async function openDatabase(path: string): Promise<DatabaseSync> {
  const [major = 0, minor = 0] = process.versions.node.split('.').map(Number)
  if (major < 24 || major === 24 && minor < 15) {
    throw new WorkflowStoreError('BRAMBO_WORKFLOW_STORE_UNAVAILABLE', 'SQLite workflow storage requires Node >=24.15.0')
  }
  try {
    const { DatabaseSync } = await import('node:sqlite')
    const db = new DatabaseSync(path)
    try { db.exec('PRAGMA busy_timeout = 100; PRAGMA foreign_keys = ON; PRAGMA synchronous = FULL') }
    catch (error) { db.close(); throw error }
    return db
  } catch {
    throw new WorkflowStoreError('BRAMBO_WORKFLOW_STORE_UNAVAILABLE', 'SQLite workflow storage could not be opened')
  }
}

/** One translation boundary for SQL reads, replay and write transactions. */
export function sqliteOperation<T>(operation: () => T): T {
  try { return operation() }
  catch (error) {
    const code = (error as { errcode?: number } | null)?.errcode
    if (code !== undefined && [5, 6].includes(code & 255)) {
      throw new WorkflowStoreError('BRAMBO_WORKFLOW_STORE_BUSY', 'SQLite workflow storage is busy; operation did not complete')
    }
    throw error
  }
}

export function transaction<T>(db: DatabaseSync, operation: () => T): T {
  return sqliteOperation(() => {
    let begun = false
    try {
      db.exec('BEGIN IMMEDIATE'); begun = true
      const result = operation()
      db.exec('COMMIT'); begun = false
      return result
    } catch (error) {
      if (begun) db.exec('ROLLBACK')
      throw error
    }
  })
}
