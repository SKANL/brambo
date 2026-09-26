import type { ProviderToolCall, EncodedProviderToolResult, LocalToolLoopLimits, LocalToolLoopOptions, LocalToolLoopResult } from './types.ts'

function cancelled<TState>(state: TState, results: readonly EncodedProviderToolResult[]): LocalToolLoopResult<TState> {
  return { status: 'cancelled', state, results }
}

function validateLimits(limits: LocalToolLoopLimits): void {
  if (!Number.isSafeInteger(limits.maxSteps) || limits.maxSteps < 1) throw new Error('maxSteps must be a positive integer')
  if (!Number.isSafeInteger(limits.maxConcurrentCalls) || limits.maxConcurrentCalls < 1) throw new Error('maxConcurrentCalls must be a positive integer')
}

function failInvalidCorrelation(message: string): never {
  throw new Error(`provider tool call correlation context ${message}`)
}

function validateCorrelation(call: ProviderToolCall): void {
  const correlation = call.correlation
  if (correlation === null || typeof correlation !== 'object') failInvalidCorrelation('is required')
  for (const key of ['sessionId', 'turnId', 'workspaceId'] as const) {
    if (typeof correlation[key] !== 'string' || correlation[key].length === 0) failInvalidCorrelation(`${key} must be a non-empty string`)
  }
  for (const key of ['providerRequestId', 'providerResponseId'] as const) {
    if (correlation[key] !== undefined && (typeof correlation[key] !== 'string' || correlation[key].length === 0)) failInvalidCorrelation(`${key} must be a non-empty string when provided`)
  }
  for (const key of ['attempt', 'step'] as const) {
    if (!Number.isSafeInteger(correlation[key]) || correlation[key] < 1) failInvalidCorrelation(`${key} must be a positive integer`)
  }
}

function freezeRecursively(value: unknown, seen = new Set<object>()): unknown {
  if (value === null || typeof value !== 'object') return value
  if (seen.has(value)) return value
  seen.add(value)
  for (const child of Object.values(value)) freezeRecursively(child, seen)
  return Object.freeze(value)
}

function snapshotCall(call: ProviderToolCall): ProviderToolCall {
  if (call === null || typeof call !== 'object') throw new Error('provider tool call must be an object')
  if (typeof call.id !== 'string' || call.id.length === 0) throw new Error('provider tool call ID must be a non-empty string')
  if (typeof call.validateArguments !== 'function') throw new Error('provider tool call validator must be a function')
  if (typeof call.concurrencySafe !== 'boolean') throw new Error('provider tool call concurrencySafe must be a boolean')
  let argumentsSnapshot: unknown
  let correlationSnapshot: ProviderToolCall['correlation']
  try {
    argumentsSnapshot = structuredClone(call.arguments)
    correlationSnapshot = structuredClone(call.correlation)
  } catch {
    throw new Error(`provider tool call '${call.id}' must contain cloneable arguments and correlation context`)
  }
  const snapshot: ProviderToolCall = {
    id: call.id,
    arguments: argumentsSnapshot,
    validateArguments: call.validateArguments,
    concurrencySafe: call.concurrencySafe,
    correlation: correlationSnapshot,
  }
  validateCorrelation(snapshot)
  return freezeRecursively(snapshot) as ProviderToolCall
}

async function validateCalls(calls: readonly ProviderToolCall[], seenIds: ReadonlySet<string>): Promise<readonly ProviderToolCall[]> {
  const snapshots = calls.map(snapshotCall)
  const turnIds = new Set<string>()
  for (const call of snapshots) {
    if (seenIds.has(call.id) || turnIds.has(call.id)) throw new Error(`duplicate tool call ID '${call.id}'`)
    turnIds.add(call.id)
  }

  // All validation completes before createExecution/executeTool can request approval.
  for (const call of snapshots) await call.validateArguments(call.arguments)
  return snapshots
}

function isParallel<TState>(calls: readonly ProviderToolCall[], options: LocalToolLoopOptions<TState>): boolean {
  return calls.length > 1
    && options.limits.maxConcurrentCalls > 1
    && calls.every((call) => call.concurrencySafe)
}

function isLoopResult<TState>(
  value: readonly EncodedProviderToolResult[] | LocalToolLoopResult<TState>,
): value is LocalToolLoopResult<TState> {
  return !Array.isArray(value)
}

function encodeResult<TState>(
  call: ProviderToolCall,
  outcome: Parameters<LocalToolLoopOptions<TState>['encodeResult']>[1],
  options: LocalToolLoopOptions<TState>,
): EncodedProviderToolResult {
  const encoded = options.encodeResult(call, outcome)
  if (encoded.callId !== call.id) throw new Error(`provider tool result ID '${encoded.callId}' does not match call ID '${call.id}'`)
  return encoded
}

function assertExecutionBoundary<TState>(call: ProviderToolCall, execution: ReturnType<LocalToolLoopOptions<TState>['createExecution']>, signal: AbortSignal): void {
  if (execution.permissionAuthorizer === undefined && execution.approveTool === undefined) {
    throw new Error('provider tool execution requires a Brambo authorization or approval hook')
  }
  if (execution.context.signal !== signal) failInvalidCorrelation('must retain the loop abort signal')
  const permissionContext = execution.permissionContext
  const correlation = call.correlation
  const metadata = permissionContext?.metadata
  if (
    permissionContext?.sessionId !== correlation.sessionId
    || permissionContext.turnId !== correlation.turnId
    || permissionContext.workspaceId !== correlation.workspaceId
    || metadata?.providerToolCallId !== call.id
    || metadata?.attempt !== correlation.attempt
    || metadata?.step !== correlation.step
    || (correlation.providerRequestId !== undefined && metadata?.providerRequestId !== correlation.providerRequestId)
    || (correlation.providerResponseId !== undefined && metadata?.providerResponseId !== correlation.providerResponseId)
  ) failInvalidCorrelation('must bind the captured provider request/response, session, turn, workspace, call, attempt, and step IDs before approval')
}

async function dispatchCall<TState>(
  call: ProviderToolCall,
  options: LocalToolLoopOptions<TState>,
): Promise<EncodedProviderToolResult> {
  const execution = options.createExecution(call, options.signal)
  assertExecutionBoundary(call, execution, options.signal)
  let outcome: Parameters<LocalToolLoopOptions<TState>['encodeResult']>[1]
  try {
    outcome = { kind: 'result', result: await options.executeTool(execution) }
  } catch (error) {
    outcome = { kind: 'error', error }
  }
  return encodeResult(call, outcome, options)
}

async function dispatchSequential<TState>(
  calls: readonly ProviderToolCall[],
  state: TState,
  results: readonly EncodedProviderToolResult[],
  options: LocalToolLoopOptions<TState>,
): Promise<readonly EncodedProviderToolResult[] | LocalToolLoopResult<TState>> {
  const encoded: EncodedProviderToolResult[] = []
  for (const call of calls) {
    if (options.signal.aborted) return cancelled(state, [...results, ...encoded])
    encoded.push(await dispatchCall(call, options))
    if (options.signal.aborted) return cancelled(state, [...results, ...encoded])
  }
  return encoded
}

async function dispatchParallel<TState>(
  calls: readonly ProviderToolCall[],
  state: TState,
  results: readonly EncodedProviderToolResult[],
  options: LocalToolLoopOptions<TState>,
): Promise<readonly EncodedProviderToolResult[] | LocalToolLoopResult<TState>> {
  const encoded = new Array<EncodedProviderToolResult | undefined>(calls.length)
  let nextIndex = 0
  let terminalError: unknown
  const workers = Array.from({ length: Math.min(options.limits.maxConcurrentCalls, calls.length) }, async () => {
    while (!options.signal.aborted && terminalError === undefined) {
      const index = nextIndex++
      if (index >= calls.length) return
      const call = calls[index]
      if (call === undefined) return
      try {
        encoded[index] = await dispatchCall(call, options)
      } catch (error) {
        terminalError = error
        return
      }
    }
  })

  // Await every worker so a terminal failure cannot leave an in-flight tool or a queued worker behind.
  await Promise.all(workers)
  if (terminalError !== undefined) throw terminalError
  const completed = encoded.filter((result): result is EncodedProviderToolResult => result !== undefined)
  return options.signal.aborted ? cancelled(state, [...results, ...completed]) : completed
}

/**
 * Runs a provider's local-tool turn through the supplied host authorization boundary.
 * It neither constructs a bypass executor nor retries a tool invocation.
 */
export async function runLocalToolLoop<TState>(options: LocalToolLoopOptions<TState>): Promise<LocalToolLoopResult<TState>> {
  validateLimits(options.limits)
  let state = options.state
  let priorResults: readonly EncodedProviderToolResult[] = []
  const seenIds = new Set<string>()
  let steps = 0

  while (true) {
    if (options.signal.aborted) return cancelled(state, priorResults)
    const turn = await options.next(state, priorResults)
    state = turn.state
    if (options.signal.aborted) return cancelled(state, priorResults)
    if (turn.complete === true) return { status: 'completed', state, results: priorResults }

    const providerCalls = turn.calls ?? []
    if (providerCalls.length === 0) throw new Error('provider turn must be complete or contain tool calls')
    if (steps >= options.limits.maxSteps) return { status: 'max-steps', state, results: priorResults }
    const calls = await validateCalls(providerCalls, seenIds)
    for (const call of calls) seenIds.add(call.id)
    steps += 1

    const dispatched = turn.parallel === true && isParallel(calls, options)
      ? await dispatchParallel(calls, state, priorResults, options)
      : await dispatchSequential(calls, state, priorResults, options)
    if (isLoopResult(dispatched)) return dispatched
    priorResults = dispatched
  }
}
