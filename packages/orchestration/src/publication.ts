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

function publication(input: TaskPublicationInput) {
  const { snapshot, taskId, lease } = input
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
  return { result, data, task }
}

/** @internal External immutable I/O: callers must not hold the parent CAS queue. */
export async function publishTaskArtifacts(input: TaskPublicationInput): Promise<'published' | 'stale-lease'> {
  const { result } = publication(input)
  if (!await input.store.valid(input.lease)) return 'stale-lease'
  await input.artifacts.publish(result.workspace, result.staged, result.publicationLease)
  return 'published'
}

/** @internal Commit references using a freshly captured parent boundary/lease. */
export async function commitPublishedTaskResult(input: TaskPublicationInput): Promise<CommitResult> {
  const { snapshot, taskId, lease, store } = input
  const { result, data, task } = publication(input)
  return store.commit({ expectedRevision: snapshot.revision, lease,
    snapshot: { ...snapshot, revision: snapshot.revision + 1, tasks: snapshot.tasks.map((checkpoint) =>
      checkpoint.taskId === taskId ? { taskId, phase: 'succeeded', attempt: task.attempt, result: data, workspace: result.workspace } : checkpoint) },
    events: [{ type: 'task.succeeded', payload: { taskId, attempt: task.attempt, workspace: { ...result.workspace } } }],
  })
}

/** Immutable publication may orphan data on a crash; only CAS makes it progress.
 * Standalone callers own CAS conflicts. The engine splits these phases and
 * refreshes its parent boundary/authority only after immutable I/O completes.
 */
export async function publishTaskResult(input: TaskPublicationInput): Promise<CommitResult> {
  if (await publishTaskArtifacts(input) === 'stale-lease') return { status: 'stale-lease' }
  return commitPublishedTaskResult(input)
}
