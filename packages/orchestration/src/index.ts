export type TaskId = string
export type TaskStatus = 'pending' | 'running' | 'succeeded' | 'failed' | 'cancelled' | 'blocked'

export interface OrchestrationTask<T = unknown> {
  readonly id: TaskId
  readonly dependsOn?: readonly TaskId[]
  readonly run: (context: TaskContext) => Promise<T>
}

export interface TaskContext {
  readonly signal: AbortSignal
  readonly getResult: (taskId: TaskId) => unknown
}

export interface TaskRecord<T = unknown> {
  readonly id: TaskId
  readonly status: TaskStatus
  readonly result?: T
  readonly error?: unknown
}

export interface OrchestrationResult {
  readonly status: 'succeeded' | 'failed' | 'cancelled'
  readonly tasks: readonly TaskRecord[]
}

export interface OrchestrationOptions {
  readonly concurrency?: number
  readonly signal?: AbortSignal
}

const error = (message: string): Error => new Error(`BRAMBO_ORCHESTRATION_INVALID: ${message}`)

function validateTasks(tasks: readonly OrchestrationTask[]): Map<TaskId, OrchestrationTask> {
  const byId = new Map<TaskId, OrchestrationTask>()
  for (const task of tasks) {
    if (!task.id || byId.has(task.id)) throw error(`duplicate or empty task id: ${task.id}`)
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
  for (const task of tasks) records.set(task.id, { id: task.id, status: 'pending' })
  const results = new Map<TaskId, unknown>()
  const running = new Set<Promise<void>>()

  const execute = async (task: OrchestrationTask): Promise<void> => {
    records.set(task.id, { id: task.id, status: 'running' })
    try {
      const result = await task.run({ signal: controller.signal, getResult: (id) => results.get(id) })
      results.set(task.id, result)
      records.set(task.id, { id: task.id, status: 'succeeded', result })
    } catch (caught) {
      if (controller.signal.aborted) records.set(task.id, { id: task.id, status: 'cancelled', error: caught })
      else records.set(task.id, { id: task.id, status: 'failed', error: caught })
    }
  }

  try {
    while (true) {
      if (controller.signal.aborted) {
        for (const [id, record] of records) if (record.status === 'pending') records.set(id, { id, status: 'cancelled' })
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
        })) records.set(id, { id, status: 'blocked' })
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
