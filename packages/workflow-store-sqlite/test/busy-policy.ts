import { setTimeout } from 'node:timers/promises'

/** Test-host operation boundary; SQLite itself retains its documented BUSY contract. */
export async function withBusyPolicy<T>(operation: () => Promise<T>, onRetry?: () => void | Promise<void>): Promise<T> {
  for (let attempt = 0; ; attempt += 1) {
    try { return await operation() }
    catch (error) {
      if ((error as { code?: unknown } | null)?.code !== 'BRAMBO_WORKFLOW_STORE_BUSY' || attempt === 2) throw error
      await onRetry?.()
      await setTimeout(attempt === 0 ? 100 : 200)
    }
  }
}
