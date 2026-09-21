import { BramboError, BRAMBO_ERROR_CODES } from '@brambodev/contracts'
import type {
  OrchestrationOptions,
  OrchestrationResult,
  OrchestrationTask,
  OrchestrationTaskRecord,
} from '@brambodev/contracts'

export type { OrchestrationOptions, OrchestrationResult, OrchestrationTask, OrchestrationTaskRecord } from '@brambodev/contracts'
export type TaskId = string
export type TaskStatus = 'pending' | 'running' | 'succeeded' | 'failed' | 'cancelled' | 'blocked'
export type TaskContext = Parameters<NonNullable<OrchestrationTask['run']>>[0]
export type TaskRecord<T = unknown> = OrchestrationTaskRecord<T>

const error = (message: string): BramboError => new BramboError(BRAMBO_ERROR_CODES.orchestrationInvalid, message)

function validateTasks(tasks: readonly OrchestrationTask[]): Map<TaskId, OrchestrationTask> {
  const byId = new Map<TaskId, OrchestrationTask>()
  for (const task of tasks) {
    if (!task.id || byId.has(task.id)) throw error(`duplicate or empty task id: ${task.id}`)
    if (task.maxAttempts !== undefined && (!Number.isInteger(task.maxAttempts) || task.maxAttempts < 1)) throw error(`task ${task.id} maxAttempts must be a positive integer`)
    byId.set(task.id, task)
  }
  for (const task of tasks) {
    for (const dependency of task.dependsOn ?? []) {
      if (!byId.has(dependency)) throw error(`task ${task.id} depends on unknown task ${dependency}`)
    }
  }
  const visiting = new Set<TaskId>()
  const visited = new Set<TaskId>()
  const visit = (id: TaskId): void => {
    if (visiting.has(id)) throw error(`task graph contains a cycle at ${id}`)
    if (visited.has(id)) return
    visiting.add(id)
    for (const dependency of byId.get(id)?.dependsOn ?? []) visit(dependency)
    visiting.delete(id)
    visited.add(id)
  }
  for (const task of tasks) visit(task.id)
  return byId
}

export async function runTaskGraph(
  tasks: readonly OrchestrationTask[],
  options: OrchestrationOptions = {},
): Promise<OrchestrationResult> {
  const byId = validateTasks(tasks)
  const concurrency = Math.max(1, Math.floor(options.concurrency ?? 1))
  const controller = new AbortController()
  const onAbort = () => controller.abort(options.signal?.reason)
  if (options.signal?.aborted) onAbort()
  else options.signal?.addEventListener('abort', onAbort, { once: true })

  const records = new Map<TaskId, TaskRecord>()
  for (const task of tasks) records.set(task.id, { id: task.id, status: 'pending', attempts: 0 })
  const results = new Map<TaskId, unknown>()
  for (const record of options.initialRecords ?? []) {
    if (!byId.has(record.id)) throw error(`initial record names unknown task ${record.id}`)
    if (record.attempts < 0 || !Number.isInteger(record.attempts)) throw error(`initial record for ${record.id} has invalid attempts`)
    if (record.status === 'succeeded') {
      records.set(record.id, record)
      results.set(record.id, record.result)
    }
  }
  const running = new Set<Promise<void>>()

  const execute = async (task: OrchestrationTask): Promise<void> => {
    records.set(task.id, { id: task.id, status: 'running', attempts: 0 })
    const maxAttempts = task.maxAttempts ?? 1
    let attempts = 0
    while (attempts < maxAttempts) {
      attempts += 1
      try {
        const result = await task.run({ signal: controller.signal, getResult: (id) => results.get(id) })
        results.set(task.id, result)
        records.set(task.id, { id: task.id, status: 'succeeded', result, attempts })
        return
      } catch (caught) {
        if (controller.signal.aborted || attempts >= maxAttempts) {
          records.set(task.id, { id: task.id, status: controller.signal.aborted ? 'cancelled' : 'failed', error: caught, attempts })
          return
        }
      }
    }
  }

  try {
    while (true) {
      if (controller.signal.aborted) {
        for (const [id, record] of records) if (record.status === 'pending') records.set(id, { id, status: 'cancelled', attempts: record.attempts })
        break
      }
      const ready = tasks.filter((task) => {
        const record = records.get(task.id)
        return record?.status === 'pending' && (task.dependsOn ?? []).every((id) => records.get(id)?.status === 'succeeded')
      })
      for (const task of ready.slice(0, Math.max(0, concurrency - running.size))) {
        const promise = execute(task).finally(() => running.delete(promise))
        running.add(promise)
      }
      for (const [id, record] of records) {
        if (record.status === 'pending' && (byId.get(id)?.dependsOn ?? []).some((dependency) => {
          const status = records.get(dependency)?.status
          return status === 'failed' || status === 'cancelled' || status === 'blocked'
        })) records.set(id, { id, status: 'blocked', attempts: record.attempts })
      }
      if (running.size > 0) {
        await Promise.race(running)
        continue
      }
      if ([...records.values()].every((record) => record.status !== 'pending')) break
      throw error('task graph reached a non-terminal state')
    }
  } finally {
    options.signal?.removeEventListener('abort', onAbort)
  }

  const ordered = tasks.map((task) => records.get(task.id) as TaskRecord)
  const status = ordered.some((record) => record.status === 'failed' || record.status === 'blocked')
    ? 'failed'
    : ordered.some((record) => record.status === 'cancelled')
      ? 'cancelled'
      : 'succeeded'
  return { status, tasks: ordered }
}
