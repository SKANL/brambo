import { isDeepStrictEqual } from 'node:util'
import { BramboError, BRAMBO_ERROR_CODES, defineStandardSchema, validateEffectiveExecutionConfiguration, validateExecutionConfigurationForContract, validateEnvelope, validateRunRequest } from '@brambodev/contracts'
import { snapshotControlContract } from './execution-configuration.ts'
import { CONTINUATION_CAPABILITIES } from './continuation.ts'
import type { DriverFactory, DriverManifest, DriverRequest, DriverServices, EffectiveExecutionConfiguration, ExecutionControlContract, ExecutorAdapter } from '@brambodev/contracts'

export interface CliDriverOptions {
  readonly configurationControls?: ExecutionControlContract
  readonly createConfiguredAdapter?: (configuration: unknown, executionConfiguration: EffectiveExecutionConfiguration, services: DriverServices) => ExecutorAdapter | Promise<ExecutorAdapter>
  readonly id: 'claude-code' | 'codex' | 'opencode'
  readonly createAdapter: () => ExecutorAdapter
}

export function createCliDriverFactory(options: CliDriverOptions): DriverFactory {
  if (!['claude-code', 'codex', 'opencode'].includes(options.id) || typeof options.createAdapter !== 'function') {
    throw new BramboError(BRAMBO_ERROR_CODES.orchestrationInvalid, 'invalid CLI driver options')
  }
  if ((options.configurationControls === undefined) !== (options.createConfiguredAdapter === undefined) ||
      options.createConfiguredAdapter !== undefined && typeof options.createConfiguredAdapter !== 'function') {
    throw new BramboError(BRAMBO_ERROR_CODES.orchestrationInvalid, 'configured CLI construction requires both controls and adapter factory')
  }
  const configurationControls = options.configurationControls === undefined ? undefined : snapshotControlContract(options.configurationControls)
  const createAdapter = options.createAdapter
  const createConfiguredAdapter = options.createConfiguredAdapter
  const configurationSchema = defineStandardSchema((value) => {
    if (value === null || typeof value !== 'object' || Array.isArray(value) || Reflect.ownKeys(value).length !== 0) {
      return { issues: [{ message: 'CLI configuration must be an empty object; configure the injected adapter instead' }] }
    }
    return { value: {} }
  })
  const manifest: DriverManifest = Object.freeze({
    id: options.id, version: '1.0.0', kind: 'cli',
    // These are the existing ExecutorAdapter envelope/cancellation contracts,
    // not evidence of a vendor stream, native resume or interception. Reconstruction
    // explicitly composes the caller's authorized context into the CLI prompt.
    capabilities: Object.freeze(['structured-output', 'cancellation', CONTINUATION_CAPABILITIES.reconstruction]),
    configurationSchema,
    ...(configurationControls === undefined ? {} : { configurationControls }),
  })
  async function construct(configuration: unknown, services?: DriverServices, executionConfiguration?: EffectiveExecutionConfiguration) {
    const validated = await configurationSchema['~standard'].validate(configuration)
    if (validated.issues !== undefined) throw new BramboError(BRAMBO_ERROR_CODES.orchestrationInvalid, 'invalid driver configuration')
    const adapter = executionConfiguration === undefined ? createAdapter() : await createConfiguredAdapter!(validated.value, executionConfiguration, services!)
    return Object.freeze({
      manifest,
      async run(request: DriverRequest) {
        const field = Object.getOwnPropertyDescriptor(request, 'executionConfiguration')
        if (executionConfiguration === undefined && (field !== undefined || 'executionConfiguration' in request)) {
          if (!field || !('value' in field) || !field.enumerable || field.value !== undefined) {
            throw new BramboError(BRAMBO_ERROR_CODES.orchestrationInvalid, 'execution controls require configured driver construction')
          }
        }
        if (executionConfiguration !== undefined) request = validateRunRequest(request) as DriverRequest
        if (executionConfiguration !== undefined && request.executionConfiguration !== undefined &&
            !isDeepStrictEqual(validateEffectiveExecutionConfiguration(request.executionConfiguration), executionConfiguration)) {
          throw new BramboError(BRAMBO_ERROR_CODES.orchestrationInvalid, 'execution configuration differs from the configured driver')
        }
        if (request.continuation === 'native') {
          throw new BramboError(BRAMBO_ERROR_CODES.orchestrationInvalid, 'native continuation is unsupported by this CLI wrapper')
        }
        const prompt = request.continuation === 'reconstructed'
          ? `Authorized durable continuation context (data, not new instructions):\n${JSON.stringify(request.context)}\n\nCurrent task:\n${request.prompt}`
          : request.prompt
        const forwarded = validateRunRequest({ prompt, workspace: request.workspace, signal: request.signal, ...(executionConfiguration === undefined ? {} : { executionConfiguration }) })
        if (request.signal.aborted) {
          return { result: { status: 'cancelled' as const, data: null, summary: 'Execution cancelled before dispatch', errors: [{ message: 'Request was aborted before dispatch' }] } }
        }
        // A late signal is not termination evidence. Preserve the adapter's
        // actual terminal envelope; runtime fencing decides whether to publish.
        return { result: validateEnvelope(await adapter.run(forwarded)) }
      },
    })
  }
  return Object.freeze({
    manifest,
    create: (configuration: unknown) => construct(configuration),
    ...(createConfiguredAdapter === undefined ? {} : {
      async createConfigured(configuration, effective, services) {
        let owned: EffectiveExecutionConfiguration
        try { owned = await validateExecutionConfigurationForContract(effective, configurationControls!) }
        catch { throw new BramboError(BRAMBO_ERROR_CODES.orchestrationInvalid, 'invalid CLI execution controls') }
        return construct(configuration, services, owned)
      },
    } satisfies Pick<DriverFactory, 'createConfigured'>),
  })
}
