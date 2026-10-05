import { validateCommand, validateRuntimeOutcome } from '@brambodev/contracts'
import type { ArtifactProvider, CommitResult, JsonValue, Lease, RunSnapshot, RunStore, RuntimeOutcome } from '@brambodev/contracts'

export interface TaskPublicationInput {
  readonly snapshot: RunSnapshot
  readonly taskId: string
  readonly result: RuntimeOutcome
  /** Engine-owned parent authority, never supplied by task workers. */
  readonly lease: Lease
  readonly store: RunStore
  readonly artifacts: ArtifactProvider
}

/** Immutable publication may orphan data on a crash; only CAS makes it progress. */
export async function publishTaskResult(input: TaskPublicationInput): Promise<CommitResult> {
  const { snapshot, taskId, lease, store, artifacts } = input
  const result = validateRuntimeOutcome(input.result)
  const task = snapshot.tasks.find((task) => task.taskId === taskId)
  if (!task || task.phase !== 'running' || result.outcome.result.status !== 'ok') throw new Error('Task not publishable')
  if (snapshot.cancelRequested || result.workspace.namespace !== snapshot.key.namespace ||
      result.workspace.workspaceId === snapshot.workspace.workspaceId ||
      (task.workspace && task.workspace.workspaceId !== result.workspace.workspaceId) ||
      result.publicationLease.token === lease.token ||
      Object.keys(result.publicationLease.epochs).some((resource) => resource.startsWith('run:')) ||
      !Object.hasOwn(result.publicationLease.epochs, `task:${snapshot.key.runId}:${taskId}`)) throw new Error('Invalid child publication scope')
  // Driver data is unknown; fail before publication if it is not durable JSON.
  const data = result.outcome.result.data as JsonValue
  validateCommand({ key: snapshot.key, clientId: 'publication', idempotencyKey: 'result', kind: 'continue', payload: data })
  if (!await store.valid(lease)) return { status: 'stale-lease' }
  await artifacts.publish(result.workspace, result.staged, result.publicationLease)
  return store.commit({ expectedRevision: snapshot.revision, lease,
    snapshot: { ...snapshot, revision: snapshot.revision + 1, tasks: snapshot.tasks.map((checkpoint) =>
      checkpoint.taskId === taskId ? { taskId, phase: 'succeeded', attempt: task.attempt, result: data, workspace: result.workspace } : checkpoint) },
    events: [{ type: 'task.succeeded', payload: { taskId, attempt: task.attempt, workspace: { ...result.workspace } } }],
  })
}
