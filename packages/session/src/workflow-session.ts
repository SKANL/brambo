import { BramboError, BRAMBO_ERROR_CODES, validateRunSnapshot } from '@brambodev/contracts'
import type { ExecutionDriver, ExecutionRuntime, Lease, RunSnapshot, RuntimeOutcome } from '@brambodev/contracts'
import { CONTINUATION_CAPABILITIES, continuationIdentity, sameContinuationEvidence } from '@brambodev/orchestration'
import type { selectContinuation } from '@brambodev/orchestration'

export interface WorkflowSessionOptions {
  readonly snapshot: RunSnapshot
  readonly taskId: string
  readonly prompt: string
  readonly driver: ExecutionDriver
  readonly runtime: ExecutionRuntime
  readonly lease: Lease
  readonly continuation: ReturnType<typeof selectContinuation>
  readonly signal: AbortSignal
}
/** Composes a single execution only. The host owns storage, leases, publication and disposal. */
export async function runWorkflowSession(options: WorkflowSessionOptions): Promise<RuntimeOutcome> {
  const selection = options.continuation
  const refuse = (message: string): never => { throw new BramboError(BRAMBO_ERROR_CODES.orchestrationInvalid, message) }
  if (selection.mode === 'blocked') return refuse(`Continuation blocked (${selection.reason}): ${selection.message}`)
  // Snapshot/selection are copied before handing control to an asynchronous runtime.
  const snapshot = JSON.parse(JSON.stringify(validateRunSnapshot(options.snapshot))) as RunSnapshot
  if (!sameContinuationEvidence(selection.identity, continuationIdentity(snapshot))) refuse('Continuation identity does not match the current durable snapshot; select again.')
  if (!snapshot.tasks.some(task => task.taskId === options.taskId)) refuse('Workflow session task is absent from the durable snapshot.')
  if (!['fresh', 'native', 'reconstructed'].includes(selection.mode)) refuse('Invalid continuation mode.')
  if (selection.mode === 'native' && (!selection.binding?.nativeSessionId || !options.driver.manifest.capabilities.includes(CONTINUATION_CAPABILITIES.native) || !options.runtime.capabilities.includes(CONTINUATION_CAPABILITIES.native))) refuse('Native continuation is unavailable at the execution boundary; select again.')
  if (selection.mode === 'native' && (selection.binding?.driverId !== options.driver.manifest.id || selection.binding.driverVersion !== options.driver.manifest.version)) refuse('Native continuation binding does not match the execution driver; select again.')
  const context = JSON.parse(JSON.stringify(selection.context)) as typeof selection.context
  const binding = selection.mode === 'native' && selection.binding ? JSON.parse(JSON.stringify(selection.binding)) as typeof selection.binding : undefined
  return options.runtime.execute(options.driver, {
    key: snapshot.key, sessionId: snapshot.sessionId, taskId: options.taskId, prompt: options.prompt,
    workspace: snapshot.workspace, context, continuation: selection.mode,
    ...(binding ? { binding } : {}), signal: options.signal,
  }, options.lease)
}
