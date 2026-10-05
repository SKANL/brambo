import { defineStandardSchema, validateToolCall, validateToolExecutionContext, validateToolInvocation, validateToolResult } from '@brambodev/contracts'
import type { DriverServices, EffectJournal, JsonObject, JsonValue, Principal, RegisteredTool, RunKey, ToolCall, ToolDispatcher, ToolExecutionContext, ToolInvocation, ToolResult } from '@brambodev/contracts'
import type { ExecuteToolOptions, ToolCompositionOptions } from './run-session.ts'

/** Host configuration only. Secrets never become model arguments or journal data. */
export interface WorkflowSecretBinding {
  readonly references: Readonly<Record<string, string>>
  /** Invocation-local authority; recheck after any internal awaited approval. */
  execute(argumentsValue: JsonObject, secrets: Readonly<Record<string, string>>, signal: AbortSignal, reauthorize: () => Promise<void>): Promise<JsonValue>
}
export interface WorkflowToolRegistration extends RegisteredTool {
  readonly secretBinding?: WorkflowSecretBinding
  /** Additional host approval, checked before effect admission and secret lookup. */
  readonly approveInvocation?: (argumentsValue: JsonObject, signal: AbortSignal) => Promise<void>
}
export interface WorkflowToolDispatcherOptions {
  readonly principal: Principal
  readonly key: RunKey
  readonly taskId: string
  readonly tools: readonly WorkflowToolRegistration[]
  readonly authorize: (principal: Principal, tool: RegisteredTool, call: ToolCall) => Promise<boolean>
  readonly resolveSecret: DriverServices['resolveSecret']
  readonly journal: EffectJournal
}
export interface ExistingToolBridgeOptions extends Omit<ToolCompositionOptions, 'permissionAuthorizer' | 'onSandboxEvent'> {
  readonly id: string
  readonly invocation: ToolInvocation
  readonly context: ToolExecutionContext
  readonly execute: (options: ExecuteToolOptions) => Promise<ToolResult>
  /** Conservative default; only the host may declare a weaker effect. */
  readonly effect?: RegisteredTool['effect']
  readonly secretEnvironment?: Readonly<Record<string, string>>
}

type Prepare = (args: JsonObject, signal: AbortSignal) => Promise<void>

function json(value: unknown): JsonValue {
  // Reuse the public strict durable validator rather than a lossy stringify gate.
  validateToolCall({ id: 'output', toolId: 'output', arguments: { value } })
  return freeze(JSON.parse(JSON.stringify(value)) as JsonValue)
}
function freeze<T>(value: T): T {
  if (value !== null && typeof value === 'object') {
    Object.values(value).forEach(freeze)
    Object.freeze(value)
  }
  return value
}
function redact(value: JsonValue, secrets: Readonly<Record<string, string>>): JsonValue {
  const values = Object.values(secrets).filter(Boolean).sort((a, b) => b.length - a.length)
  const text = (input: string): string => values.reduce((result, secret) => result.split(secret).join('[REDACTED]'), input)
  const visit = (item: JsonValue): JsonValue => {
    if (typeof item === 'string') return text(item)
    if (item === null || typeof item !== 'object') return item
    if (Array.isArray(item)) return item.map(visit)
    const output: Record<string, JsonValue> = Object.create(null) as Record<string, JsonValue>
    for (const [key, child] of Object.entries(item)) {
      const safeKey = text(key)
      // Refuse rather than silently merge two redacted keys.
      if (Object.hasOwn(output, safeKey)) throw new Error('output redaction collision')
      output[safeKey] = visit(child)
    }
    return output
  }
  return freeze(visit(value))
}
function cancelled(signal: AbortSignal): void {
  if (signal.aborted) throw new Error('tool dispatch cancelled')
}

/** Custom executables are host-trusted code, NOT an OS/container sandbox. */
export function createWorkflowToolDispatcher(options: WorkflowToolDispatcherOptions): ToolDispatcher {
  const { authorize, journal, resolveSecret } = options
  const principal = freeze({ ...options.principal })
  if (principal.namespace !== options.key.namespace || !options.taskId) throw new Error('invalid tool scope')
  const tools = new Map<string, WorkflowToolRegistration>()
  const approvals = new Map<string, Prepare>()
  for (const registration of options.tools) {
    validateToolCall({ id: 'registration', toolId: registration.id, arguments: {} })
    if (tools.has(registration.id)) throw new Error('duplicate tool registration')
    if (!['read-only', 'idempotent', 'non-idempotent'].includes(registration.effect)) throw new Error('invalid tool effect')
    const binding = registration.secretBinding
    const snapshot = Object.freeze({ id: registration.id, effect: registration.effect, inputSchema: registration.inputSchema,
      execute: registration.execute.bind(registration), ...(binding ? { secretBinding: Object.freeze({ references: Object.freeze({ ...binding.references }), execute: binding.execute.bind(binding) }) } : {}) })
    tools.set(registration.id, snapshot)
    const approval = registration.approveInvocation?.bind(registration)
    if (approval) approvals.set(registration.id, approval)
  }
  return async (untrustedCall, signal) => {
    let stage = 'arguments validation'
    try {
      validateToolCall(untrustedCall)
      const call = json(untrustedCall) as unknown as ToolCall
      const tool = tools.get(call.toolId)
      if (!tool) { stage = 'unknown tool'; throw new Error() }
      const validated = await tool.inputSchema['~standard'].validate(call.arguments)
      if (validated.issues !== undefined) throw new Error('invalid arguments')
      validateToolCall({ ...call, arguments: validated.value })
      const args = json(validated.value) as JsonObject
      // Policy sees what will execute; the journal retains original correlation/payload.
      const effectiveCall = freeze({ ...call, arguments: args })
      const authority = async (): Promise<void> => {
        stage = 'authorization'
        cancelled(signal)
        if (typeof authorize !== 'function' || await authorize(principal, tool, effectiveCall) !== true) throw new Error('authorization denied')
        cancelled(signal)
      }
      const guard = async (): Promise<void> => {
        await authority()
        stage = 'approval'
        await approvals.get(tool.id)?.(args, signal)
        await authority()
      }
      await guard()
      stage = 'effect admission conflict'
      const admission = await journal.begin(call, tool.effect)
      await guard()
      if (admission === 'completed') {
        stage = 'output validation'
        const saved = json(await journal.result(call.id))
        await authority()
        return saved
      }
      if (admission !== 'new') { stage = 'uncertain effect; reconciliation required'; throw new Error() }
      const secrets: Record<string, string> = Object.create(null) as Record<string, string>
      stage = 'secret resolution'
      for (const [name, reference] of Object.entries(tool.secretBinding?.references ?? {})) {
        await guard()
        stage = 'secret resolution'
        if (typeof reference !== 'string' || !reference) throw new Error('invalid secret reference')
        const value = await resolveSecret(reference, signal)
        if (typeof value !== 'string' || !value) throw new Error('invalid secret value')
        secrets[name] = value
        await authority()
        stage = 'secret resolution'
      }
      await guard()
      stage = 'tool execution'
      const result = tool.secretBinding
        ? await tool.secretBinding.execute(args, Object.freeze(secrets), signal, authority)
        : await tool.execute(args, signal)
      stage = 'output validation'
      const safeResult = redact(json(result), secrets)
      await authority()
      stage = 'effect completion'
      cancelled(signal)
      await journal.finish(call.id, safeResult)
      await authority()
      return safeResult
    } catch {
      // Callback errors can contain unknown secrets (including resolver failures).
      // Do not expose their message, stack, cause, or arbitrary properties.
      if (signal.aborted) throw new Error('tool dispatch cancelled')
      throw new Error(`workflow tool ${stage} failed`)
    }
  }
}

/** The legacy permissive approval default is deliberately unavailable here. */
export function createExistingToolBridge(options: ExistingToolBridgeOptions): WorkflowToolRegistration {
  const invocation = validateToolInvocation(options.invocation)
  const context = validateToolExecutionContext(options.context)
  const { execute, approveTool, onToolExecution, effect = 'non-idempotent', id, toolExecutor, sandboxProvider, toolPolicy, permissionContext } = options
  const references = Object.freeze({ ...options.secretEnvironment })
  const invocationFor = (args: JsonObject): ToolInvocation => validateToolInvocation({ tool: invocation.tool,
    arguments: invocation.tool.kind === 'local' ? args['argv'] : args })
  const inputSchema = defineStandardSchema<JsonObject>((value) => {
    try {
      validateToolCall({ id: 'input', toolId: id, arguments: value })
      const args = value as JsonObject
      if (invocation.tool.kind === 'local' && (Object.keys(args).length !== 1 || !Object.hasOwn(args, 'argv'))) throw new Error('invalid argv envelope')
      invocationFor(args)
      return { value: args }
    } catch { return { issues: [{ message: 'invalid existing tool arguments' }] } }
  })
  const approve: Prepare = async (args, signal) => {
    cancelled(signal)
    if (typeof approveTool !== 'function' || await approveTool({ invocation: invocationFor(args), context: { ...context, signal }, ...(permissionContext ? { permissionContext } : {}) }) !== true) {
      throw new Error('required tool approval denied')
    }
    cancelled(signal)
  }
  const run = async (args: JsonObject, secrets: Readonly<Record<string, string>>, signal: AbortSignal, reauthorize: () => Promise<void>): Promise<JsonValue> => {
    await approve(args, signal)
    await reauthorize()
    const result = await execute({ invocation: invocationFor(args), context: { ...context, environment: { ...context.environment, ...secrets }, signal },
      ...(toolExecutor ? { toolExecutor } : {}), ...(sandboxProvider ? { sandboxProvider } : {}), ...(toolPolicy ? { toolPolicy } : {}),
      ...(permissionContext ? { permissionContext } : {}),
      // Recheck live approval if the legacy composition invokes it after awaits.
      approveTool: async () => { await approve(args, signal); await reauthorize(); return true },
      ...(onToolExecution ? { onToolExecution: (event) => {
        // Signals are transient, not JSON. Project only the observer's data.
        const eventContext = { ...event.context }
        delete eventContext.signal
        onToolExecution(redact(json({ ...event, context: eventContext }), secrets) as unknown as typeof event)
      } } : {}),
    })
    return redact(json(validateToolResult(result)), secrets)
  }
  const registration: WorkflowToolRegistration = Object.freeze({ id, effect, inputSchema, approveInvocation: approve,
    execute: async () => { throw new Error('bridge requires workflow dispatcher authorization') },
    secretBinding: Object.freeze({ references, execute: run }),
  })

  return registration
}
