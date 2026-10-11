import { BramboError, BRAMBO_ERROR_CODES, validateExecutionControlContract, validateExecutionConfigurationLayer, validateEffectiveExecutionConfiguration } from '@brambodev/contracts'
import type { ControlDescriptor, ControlSupportReceipt, EffectiveExecutionConfiguration, ExecutionConfigurationLayers, ExecutionControlContract, ExecutionControlHost, JsonObject, JsonValue, ModelControlQuery, RequestedControl, StandardSchemaV1 } from '@brambodev/contracts'

const refuse = (): BramboError => new BramboError(BRAMBO_ERROR_CODES.orchestrationInvalid, 'invalid execution controls')

/** Own the schema port and bind the original library receiver, not its wrapper. */
export function snapshotControlSchema<T>(schema: StandardSchemaV1<T>): StandardSchemaV1<T> {
  try {
    const standard = Object.getOwnPropertyDescriptor(schema, '~standard')?.value as StandardSchemaV1<T>['~standard']
    const version = Object.getOwnPropertyDescriptor(standard, 'version')?.value
    const validate = Object.getOwnPropertyDescriptor(standard, 'validate')?.value
    if (version !== 1 || typeof validate !== 'function') throw refuse()
    return Object.freeze({ '~standard': Object.freeze({ version: 1 as const, validate: validate.bind(standard) }) })
  } catch { throw refuse() }
}
export function snapshotControlContract(input: ExecutionControlContract): ExecutionControlContract {
  try {
    const contract = validateExecutionControlContract(input)
    return Object.freeze({ ...contract, configurationSchema: snapshotControlSchema(contract.configurationSchema),
      controls: Object.freeze(contract.controls.map((descriptor) => Object.freeze({ ...descriptor, schema: snapshotControlSchema(descriptor.schema) }))) })
  } catch { throw refuse() }
}
async function validated<T>(schema: StandardSchemaV1<T>, value: unknown): Promise<T> {
  try {
    const outcome = await schema['~standard'].validate(value)
    const descriptors = Object.getOwnPropertyDescriptors(outcome)
    if (!descriptors['value'] || !('value' in descriptors['value']) ||
        descriptors['issues'] && (!('value' in descriptors['issues']) || descriptors['issues'].value !== undefined)) throw refuse()
    return descriptors['value'].value as T
  } catch { throw refuse() }
}
function ownedValue(value: unknown): JsonValue {
  return validateExecutionConfigurationLayer({ extensions: [{ id: 'control:value', value }] }).extensions![0]!.value
}
function byId(contract: ExecutionControlContract): Map<string, ControlDescriptor> {
  const ids = new Map<string, ControlDescriptor>()
  for (const control of contract.controls) for (const id of [control.id, ...(control.aliases ?? [])]) ids.set(id, control)
  return ids
}
function requests(configuration: JsonObject, extensions: readonly RequestedControl[], contract: ExecutionControlContract): Map<string, RequestedControl> {
  const ids = byId(contract), result = new Map<string, RequestedControl>()
  const add = (descriptor: ControlDescriptor | undefined, request: RequestedControl): void => {
    if (!descriptor || result.has(descriptor.id)) throw refuse()
    result.set(descriptor.id, { ...request, id: descriptor.id })
  }
  for (const [key, value] of Object.entries(configuration)) {
    const descriptor = contract.controls.find((control) => control.configurationKey === key)
    add(descriptor, { id: descriptor?.id ?? '', value })
  }
  for (const request of extensions) add(ids.get(request.id), request)
  return result
}
/** @internal Apply the same registered-undefined omission before durable admission. */
export function snapshotConfigurationLayer(value: unknown, contract: ExecutionControlContract): ReturnType<typeof validateExecutionConfigurationLayer> {
  // Undefined omission applies only to optional top-level configuration fields.
  // Reflect once; nested undefined values/array holes still fail durable validation.
  if (value === null || typeof value !== 'object' || Array.isArray(value) ||
      ![Object.prototype, null].includes(Object.getPrototypeOf(value))) throw refuse()
  const fields = Object.getOwnPropertyDescriptors(value)
  const configuration = fields['configuration']
  if (configuration && 'value' in configuration && configuration.value !== undefined) {
    const source: unknown = configuration.value
    if (source === null || typeof source !== 'object' || Array.isArray(source) ||
        ![Object.prototype, null].includes(Object.getPrototypeOf(source))) throw refuse()
    const entries = Object.getOwnPropertyDescriptors(source)
    for (const key of Reflect.ownKeys(entries)) {
      const descriptor = Object.getOwnPropertyDescriptor(entries, key)!.value as PropertyDescriptor
      if ('value' in descriptor && descriptor.value === undefined && descriptor.enumerable && typeof key === 'string') {
        if (!contract.controls.some((control) => control.configurationKey === key)) throw refuse()
        delete entries[key]
      }
    }
    configuration.value = Object.defineProperties(Object.create(null), entries)
  }
  return validateExecutionConfigurationLayer(Object.defineProperties(Object.create(null), fields))
}
/** Compare JSON by value, not property insertion order or object identity. */
function sameJson(left: JsonValue, right: JsonValue): boolean {
  const pending: [JsonValue, JsonValue][] = [[left, right]]
  while (pending.length) {
    const [a, b] = pending.pop()!
    if (a === b) continue
    if (a === null || b === null || typeof a !== 'object' || typeof b !== 'object' || Array.isArray(a) !== Array.isArray(b)) return false
    const keys = Object.keys(a)
    if (keys.length !== Object.keys(b).length) return false
    for (const key of keys) {
      if (!Object.hasOwn(b, key)) return false
      pending.push([(a as JsonObject)[key]!, (b as JsonObject)[key]!])
    }
  }
  return true
}

/** Worker/registry consumption validates, but never re-normalizes, admitted data. */
export async function validateConfiguredExecutionConfiguration(input: EffectiveExecutionConfiguration, contract: ExecutionControlContract): Promise<EffectiveExecutionConfiguration> {
  try {
    const effective = validateEffectiveExecutionConfiguration(input)
    if (effective.providerId !== contract.providerId || contract.requiresModel && effective.model === undefined) throw refuse()
    const selected = requests(effective.configuration, effective.extensions, contract)
    const descriptors = byId(contract)
    const receipts = new Map(effective.support.map((receipt) => [receipt.id, receipt]))
    if (receipts.size !== selected.size) throw refuse()
    for (const request of selected.values()) {
      const descriptor = descriptors.get(request.id)!
      const receipt = receipts.get(request.id)
      if (!receipt || request.requiredSupport && receipt.status !== 'supported' ||
          !sameJson(ownedValue(await validated(descriptor.schema, request.value)), request.value)) throw refuse()
    }
    // Admitted representation must already be canonical and materialized once.
    if (effective.extensions.some((entry) => entry.id !== descriptors.get(entry.id)?.id || descriptors.get(entry.id)?.configurationKey !== undefined)) throw refuse()
    const configuration = validateExecutionConfigurationLayer({ configuration: await validated(contract.configurationSchema, effective.configuration) }).configuration!
    if (!sameJson(configuration, effective.configuration)) throw refuse()
    return effective
  } catch { throw refuse() }
}

export async function resolveExecutionConfiguration(layers: ExecutionConfigurationLayers, host: ExecutionControlHost): Promise<EffectiveExecutionConfiguration> {
  try {
    const contract = snapshotControlContract(host.contract)
    const resolver = host.resolver?.bind(host), allowUnverified = host.allowUnverified?.bind(host)
    const executorVersion = host.executorVersion
    const ordered = ['defaults', 'profile', 'task', 'run'] as const
    if (layers === null || typeof layers !== 'object' || Array.isArray(layers) ||
        ![Object.prototype, null].includes(Object.getPrototypeOf(layers))) throw refuse()
    const owned = Object.getOwnPropertyDescriptors(layers)
    if (Reflect.ownKeys(owned).some((key) => typeof key !== 'string' || !ordered.includes(key as typeof ordered[number]))) throw refuse()
    const scoped: { provider: string; layer: ReturnType<typeof validateExecutionConfigurationLayer>; explicit: boolean }[] = []
    let provider = contract.providerId, model: string | undefined
    for (const name of ordered) {
      const descriptor = owned[name]
      if (!descriptor) continue
      if (!('value' in descriptor) || !descriptor.enumerable) throw refuse()
      if (descriptor.value === undefined) continue
      const layer = snapshotConfigurationLayer(descriptor.value, contract)
      if (layer.providerId !== undefined && layer.providerId !== provider) { provider = layer.providerId; model = undefined }
      if (layer.model !== undefined) model = layer.model
      scoped.push({ provider, layer, explicit: name === 'task' || name === 'run' })
    }
    if (provider !== contract.providerId || contract.requiresModel && model === undefined) throw refuse()
    const selected = new Map<string, RequestedControl>()
    for (const scope of scoped) {
      const { layer } = scope
      if (scope.provider !== provider) {
        if (scope.explicit && (Object.keys(layer.configuration ?? {}).length || layer.extensions?.length)) throw refuse()
        continue
      }
      for (const [id, request] of requests(layer.configuration ?? {}, layer.extensions ?? [], contract)) selected.set(id, request)
    }
    const configuration: Record<string, JsonValue> = Object.create(null), extensions: RequestedControl[] = [], support: ControlSupportReceipt[] = []
    // Contract order, rather than caller insertion order, defines resolver/receipt order.
    for (const descriptor of contract.controls) {
      const request = selected.get(descriptor.id)
      if (!request) continue
      let value = ownedValue(await validated(descriptor.schema, request.value))
      const query: ModelControlQuery = Object.freeze({ providerId: provider,
        ...(model === undefined ? {} : { model }), controlId: descriptor.id,
        ...(executorVersion === undefined ? {} : { executorVersion }) })
      const outcome = resolver ? await resolver(query) : { status: 'unknown', version: 'unresolved' }
      const metadata = Object.getOwnPropertyDescriptors(outcome)
      const allowed = ['status', 'version', 'valueSchema']
      if (Reflect.ownKeys(metadata).some((key) => typeof key !== 'string' || !allowed.includes(key)) ||
          Object.values(metadata).some((field) => !('value' in field) || !field.enumerable)) throw refuse()
      const status = metadata['status']?.value, version = metadata['version']?.value
      if (status !== 'supported' && status !== 'unknown' || typeof version !== 'string' || !version.trim()) throw refuse()
      if (status === 'unknown' && (request.requiredSupport || allowUnverified?.(query) !== true)) throw refuse()
      if (metadata['valueSchema']?.value !== undefined) {
        if (status !== 'supported') throw refuse()
        value = ownedValue(await validated(snapshotControlSchema(metadata['valueSchema'].value), value))
        const providerValue = ownedValue(await validated(descriptor.schema, value))
        if (!sameJson(providerValue, value)) throw refuse()
      }
      if (descriptor.configurationKey !== undefined) configuration[descriptor.configurationKey] = value
      else extensions.push({ ...request, value })
      support.push({ id: descriptor.id, status: status === 'supported' ? 'supported' : 'unverified', version })
    }
    const frozenConfiguration = validateExecutionConfigurationLayer({ configuration }).configuration!
    const normalized = validateExecutionConfigurationLayer({ configuration: await validated(contract.configurationSchema, frozenConfiguration) }).configuration!
    // A provider-level transform cannot invalidate the model proof just collected.
    if (!sameJson(normalized, frozenConfiguration)) throw refuse()
    const effective = validateEffectiveExecutionConfiguration({ version: 1, providerId: provider,
      ...(model === undefined ? {} : { model }), ...(executorVersion === undefined ? {} : { executorVersion }),
      configuration: normalized, extensions, support })
    return await validateConfiguredExecutionConfiguration(effective, contract)
  } catch { throw refuse() }
}
