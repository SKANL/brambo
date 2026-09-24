import type { ProviderToolCall, EncodedProviderToolResult, LocalToolLoopLimits, LocalToolLoopOptions, LocalToolLoopResult } from './types.ts'

function cancelled<TState>(state: TState, results: readonly EncodedProviderToolResult[]): LocalToolLoopResult<TState> {
  return { status: 'cancelled', state, results }
}

function validateLimits(limits: LocalToolLoopLimits): void {
  if (!Number.isSafeInteger(limits.maxSteps) || limits.maxSteps < 1) throw new Error('maxSteps must be a positive integer')
  if (!Number.isSafeInteger(limits.maxConcurrentCalls) || limits.maxConcurrentCalls < 1) throw new Error('maxConcurrentCalls must be a positive integer')
}

function validateCalls(calls: readonly ProviderToolCall[], seenIds: ReadonlySet<string>): void {
  const turnIds = new Set<string>()
  for (const call of calls) {
    if (typeof call.id !== 'string' || call.id.length === 0) throw new Error('provider tool call ID must be a non-empty string')
    if (seenIds.has(call.id) || turnIds.has(call.id)) throw new Error(`duplicate tool call ID '${call.id}'`)
    turnIds.add(call.id)
  }

  // All validation completes before createExecution/executeTool can request approval.
  for (const call of calls) call.validateArguments(call.arguments)
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

async function dispatchCall<TState>(
  call: ProviderToolCall,
  options: LocalToolLoopOptions<TState>,
): Promise<EncodedProviderToolResult> {
  let outcome: Parameters<LocalToolLoopOptions<TState>['encodeResult']>[1]
  try {
    outcome = { kind: 'result', result: await options.executeTool(options.createExecution(call, options.signal)) }
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
  const workers = Array.from({ length: Math.min(options.limits.maxConcurrentCalls, calls.length) }, async () => {
    while (!options.signal.aborted) {
      const index = nextIndex++
      if (index >= calls.length) return
      const call = calls[index]
      if (call === undefined) return
      encoded[index] = await dispatchCall(call, options)
    }
  })

  await Promise.all(workers)
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

    const calls = turn.calls ?? []
    if (calls.length === 0) throw new Error('provider turn must be complete or contain tool calls')
    if (steps >= options.limits.maxSteps) return { status: 'max-steps', state, results: priorResults }
    validateCalls(calls, seenIds)
    for (const call of calls) seenIds.add(call.id)
    steps += 1

    const dispatched = turn.parallel === true && isParallel(calls, options)
      ? await dispatchParallel(calls, state, priorResults, options)
      : await dispatchSequential(calls, state, priorResults, options)
    if (isLoopResult(dispatched)) return dispatched
    priorResults = dispatched
  }
}