import type { CapabilityId } from './execution-driver.ts'
import type { StandardSchemaV1 } from './standard-schema.ts'
import type { JsonObject, JsonValue } from './tool-execution.ts'
import { durableId, durableJson, durableRecord, durableReject, durableSchema, durableString } from './workflow-run.ts'

export interface RequestedControl {
  readonly id: CapabilityId
  readonly value: JsonValue
  readonly requiredSupport?: boolean
}
export interface ExecutionConfigurationLayer {
  readonly providerId?: string
  readonly model?: string
  readonly configuration?: JsonObject
  readonly extensions?: readonly RequestedControl[]
}
/** Executable schemas stay in trusted host composition, never durable JSON. */
export interface ControlDescriptor {
  readonly id: CapabilityId
  readonly configurationKey?: string
  readonly aliases?: readonly CapabilityId[]
  readonly schema: StandardSchemaV1<JsonValue>
}
export interface ExecutionControlContract {
  readonly providerId: string
  readonly requiresModel: boolean
  readonly configurationSchema: StandardSchemaV1<JsonObject>
  readonly controls: readonly ControlDescriptor[]
}
export type ModelControlSupport =
  | { readonly status: 'supported'; readonly version: string; readonly valueSchema?: StandardSchemaV1<JsonValue> }
  | { readonly status: 'unsupported'; readonly version: string }
  | { readonly status: 'unknown'; readonly version: string }
export interface ModelControlQuery {
  readonly providerId: string
  readonly model?: string
  readonly controlId: CapabilityId
  readonly executorVersion?: string
}
export type ModelCapabilityResolver = (query: ModelControlQuery) => ModelControlSupport | Promise<ModelControlSupport>
export interface ControlSupportReceipt {
  readonly id: CapabilityId
  readonly status: 'supported' | 'unverified'
  readonly version: string
}
export interface EffectiveExecutionConfiguration {
  readonly version: 1
  readonly providerId: string
  readonly model?: string
  readonly executorVersion?: string
  readonly configuration: JsonObject
  readonly extensions: readonly RequestedControl[]
  readonly support: readonly ControlSupportReceipt[]
}
export interface ExecutionControlHost {
  readonly contract: ExecutionControlContract
  readonly resolver?: ModelCapabilityResolver
  readonly executorVersion?: string
  readonly allowUnverified?: (query: ModelControlQuery) => boolean
}
export interface ExecutionConfigurationLayers {
  readonly defaults?: ExecutionConfigurationLayer
  readonly profile?: ExecutionConfigurationLayer
  readonly task?: ExecutionConfigurationLayer
  readonly run?: ExecutionConfigurationLayer
}

// Reflection can throw arbitrary proxy errors. Never expose their text or read
// user properties through getters; validate and return owned data instead.
function safe<T>(validate: () => T): T {
  try { return validate() } catch { durableReject('invalid execution configuration') }
}
/** @internal Own one descriptor snapshot without evaluating input properties. */
export function ownedExecutionRecord(value: object): Record<string, unknown> {
  return safe(() => {
    const descriptors = Object.getOwnPropertyDescriptors(value)
    const result: Record<string, unknown> = Object.create(null)
    for (const key of Reflect.ownKeys(descriptors)) {
      const descriptor = Object.getOwnPropertyDescriptor(descriptors, key)!.value as PropertyDescriptor
      if (!('value' in descriptor)) durableReject('fields must be data properties')
      Object.defineProperty(result, key, descriptor)
    }
    return result
  })
}
function record(value: unknown, required: readonly string[], optional: readonly string[] = []): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value) ||
      ![Object.prototype, null].includes(Object.getPrototypeOf(value))) durableReject('expected a plain object')
  return durableRecord(ownedExecutionRecord(value), required, optional)
}
function controlId(value: unknown): asserts value is string {
  if (typeof value !== 'string' || value.split(':').length > 2) durableReject('invalid control ID')
  value.split(':').forEach(durableId)
}
/** Iterative descriptor copy keeps deeply nested JSON off the call stack. */
function json(value: unknown): JsonValue {
  if (value === null || typeof value !== 'object') { durableJson(value); return value }
  const root: JsonObject | JsonValue[] = Array.isArray(value) ? [] : Object.create(null)
  const stack = [{ source: value, target: root }]
  const copies = new Map<object, JsonObject | JsonValue[]>([[value, root]])
  while (stack.length) {
    const { source, target } = stack.pop()!
    const array = Array.isArray(source)
    if (array ? Object.getPrototypeOf(source) !== Array.prototype :
        ![Object.prototype, null].includes(Object.getPrototypeOf(source))) durableReject('prototype-bearing JSON value')
    const owned = ownedExecutionRecord(source)
    for (const key of Reflect.ownKeys(owned)) {
      const descriptor = Object.getOwnPropertyDescriptor(owned, key)!
      const child = descriptor.value
      let copy = child
      if (child !== null && typeof child === 'object') {
        copy = copies.get(child)
        if (copy === undefined) {
          copy = Array.isArray(child) ? [] : Object.create(null)
          copies.set(child, copy)
          stack.push({ source: child, target: copy })
        }
      }
      Object.defineProperty(target, key, { ...descriptor, value: copy })
    }
  }
  // Validate only owned plain data. Proxy state cannot change this evidence,
  // and retained cycles are rejected before freezing or returning anything.
  durableJson(root)
  copies.forEach(Object.freeze)
  return root
}
function configuration(value: unknown): JsonObject {
  const result = json(value)
  if (result === null || typeof result !== 'object' || Array.isArray(result)) durableReject('configuration must be a JSON object')
  return result as JsonObject
}
function extensions(value: unknown): readonly RequestedControl[] {
  const array = json(value)
  if (!Array.isArray(array)) durableReject('extensions must be an array')
  const ids = new Set<string>()
  for (const entry of array) {
    const item = record(entry, ['id', 'value'], ['requiredSupport'])
    controlId(item['id'])
    if (ids.has(item['id'])) durableReject('duplicate control ID')
    ids.add(item['id'])
    if (Object.hasOwn(item, 'requiredSupport') && typeof item['requiredSupport'] !== 'boolean') durableReject('requiredSupport must be boolean')
  }
  return array as unknown as readonly RequestedControl[]
}
function support(value: unknown): readonly ControlSupportReceipt[] {
  const array = json(value)
  if (!Array.isArray(array)) durableReject('support must be an array')
  const ids = new Set<string>()
  for (const entry of array) {
    const item = record(entry, ['id', 'status', 'version'])
    controlId(item['id']); durableString(item['version'])
    if (ids.has(item['id'])) durableReject('duplicate support ID')
    ids.add(item['id'])
    if (item['status'] !== 'supported' && item['status'] !== 'unverified') durableReject('invalid support status')
  }
  return array as unknown as readonly ControlSupportReceipt[]
}
export function validateExecutionConfigurationLayer(value: unknown): ExecutionConfigurationLayer {
  return safe(() => {
    const item = record(value, [], ['providerId', 'model', 'configuration', 'extensions'])
    const result: ExecutionConfigurationLayer = {
      ...(item['providerId'] === undefined ? {} : { providerId: item['providerId'] as string }),
      ...(item['model'] === undefined ? {} : { model: item['model'] as string }),
      ...(item['configuration'] === undefined ? {} : { configuration: configuration(item['configuration']) }),
      ...(item['extensions'] === undefined ? {} : { extensions: extensions(item['extensions']) }),
    }
    if (result.providerId !== undefined) durableId(result.providerId)
    if (result.model !== undefined) durableString(result.model)
    return Object.freeze(result)
  })
}
export function validateEffectiveExecutionConfiguration(value: unknown): EffectiveExecutionConfiguration {
  return safe(() => {
    const item = record(value, ['version', 'providerId', 'configuration', 'extensions', 'support'], ['model', 'executorVersion'])
    if (item['version'] !== 1) durableReject('unsupported configuration version')
    durableId(item['providerId'])
    if (item['model'] !== undefined) durableString(item['model'])
    if (item['executorVersion'] !== undefined) durableString(item['executorVersion'])
    return Object.freeze({ version: 1, providerId: item['providerId'],
      ...(item['model'] === undefined ? {} : { model: item['model'] }),
      ...(item['executorVersion'] === undefined ? {} : { executorVersion: item['executorVersion'] }),
      configuration: configuration(item['configuration']), extensions: extensions(item['extensions']), support: support(item['support']),
    })
  })
}

function schema(value: unknown): void {
  if (value === null || typeof value !== 'object') durableReject('invalid control schema')
  const standard = Object.getOwnPropertyDescriptor(value, '~standard')
  if (!standard || !('value' in standard)) durableReject('invalid control schema')
  const port = standard.value
  if (port === null || typeof port !== 'object') durableReject('invalid control schema')
  const version = Object.getOwnPropertyDescriptor(port, 'version')
  const validate = Object.getOwnPropertyDescriptor(port, 'validate')
  if (!version || !('value' in version) || version.value !== 1 ||
      !validate || !('value' in validate) || typeof validate.value !== 'function') durableReject('invalid control schema')
}
/** @internal Host-only validation; schemas are inspected, never executed. */
export function validateExecutionControlContract(value: unknown): ExecutionControlContract {
  return safe(() => {
    const item = record(value, ['providerId', 'requiresModel', 'configurationSchema', 'controls'])
    durableId(item['providerId'])
    if (typeof item['requiresModel'] !== 'boolean') durableReject('requiresModel must be boolean')
    schema(item['configurationSchema'])
    const declared = item['controls']
    if (!Array.isArray(declared)) durableReject('controls must be an array')
    const descriptors: Record<string, PropertyDescriptor> = Object.getOwnPropertyDescriptors(declared)
    const length = descriptors['length']?.value as number
    if (Reflect.ownKeys(declared).length !== length + 1) durableReject('invalid controls array')
    const ids = new Set<string>(), keys = new Set<string>()
    const controls: ControlDescriptor[] = []
    for (let index = 0; index < length; index++) {
      const descriptor = descriptors[String(index)]
      if (!descriptor || !('value' in descriptor) || !descriptor.enumerable) durableReject('invalid control descriptor')
      const control = record(descriptor.value, ['id', 'schema'], ['configurationKey', 'aliases'])
      controlId(control['id']); schema(control['schema'])
      const aliases = control['aliases'] === undefined ? undefined : json(control['aliases'])
      if (aliases !== undefined && !Array.isArray(aliases)) durableReject('aliases must be an array')
      for (const id of [control['id'], ...(aliases ?? [])]) {
        controlId(id)
        if (ids.has(id)) durableReject('duplicate control or alias ID')
        ids.add(id)
      }
      if (control['configurationKey'] !== undefined) {
        durableId(control['configurationKey'])
        if (keys.has(control['configurationKey'])) durableReject('duplicate configuration key')
        keys.add(control['configurationKey'])
      }
      controls.push(Object.freeze({ id: control['id'], schema: control['schema'] as StandardSchemaV1<JsonValue>,
        ...(control['configurationKey'] === undefined ? {} : { configurationKey: control['configurationKey'] }),
        ...(aliases === undefined ? {} : { aliases: aliases as string[] }),
      }))
    }
    return Object.freeze({ providerId: item['providerId'], requiresModel: item['requiresModel'],
      configurationSchema: item['configurationSchema'] as StandardSchemaV1<JsonObject>, controls: Object.freeze(controls) })
  })
}

/** Capture a validated trusted host schema port without losing its callback receiver. */
export function snapshotExecutionControlSchema<T>(schema: StandardSchemaV1<T>): StandardSchemaV1<T> {
  const port = Object.getOwnPropertyDescriptor(schema, '~standard')?.value as StandardSchemaV1<T>['~standard']
  const validate = Object.getOwnPropertyDescriptor(port, 'validate')?.value as StandardSchemaV1<T>['~standard']['validate']
  return Object.freeze({ '~standard': Object.freeze({ version: 1 as const, validate: validate.bind(port) }) })
}

// Compare owned JSON structurally: object insertion order is not semantics.
function sameControlValue(left: JsonValue, right: JsonValue): boolean {
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
/** Revalidate an owned effective envelope against a validated trusted host contract before invocation.
 * Receipts remain host evidence; this consumer neither resolves support nor normalizes admitted values.
 */
export async function validateExecutionConfigurationForContract(input: EffectiveExecutionConfiguration, contract: ExecutionControlContract): Promise<EffectiveExecutionConfiguration> {
  const effective = validateEffectiveExecutionConfiguration(input)
  if (effective.providerId !== contract.providerId || (contract.requiresModel && effective.model === undefined)) durableReject('invalid control provider/model')
  const requested = new Map<string, { value: JsonValue; requiredSupport?: boolean }>()
  for (const [key, value] of Object.entries(effective.configuration)) {
    const descriptor = contract.controls.find((entry) => entry.configurationKey === key)
    if (!descriptor) durableReject('unknown configuration control')
    requested.set(descriptor.id, { value })
  }
  for (const extension of effective.extensions) {
    const descriptor = contract.controls.find((entry) => entry.id === extension.id)
    if (!descriptor || descriptor.configurationKey !== undefined || requested.has(extension.id)) durableReject('unknown extension control')
    requested.set(extension.id, extension)
  }
  if (effective.support.length !== requested.size) durableReject('invalid control receipts')
  for (const [id, request] of requested) {
    const receipt = effective.support.find((entry) => entry.id === id)
    const descriptor = contract.controls.find((entry) => entry.id === id)!
    const validated = await mappedSchema(descriptor.schema, request.value)
    if (!receipt || request.requiredSupport && receipt.status !== 'supported' ||
        !sameControlValue(validateExecutionConfigurationLayer({ extensions: [{ id, value: validated }] }).extensions![0]!.value, request.value)) durableReject('invalid control value/support')
  }
  const validated = await mappedSchema(contract.configurationSchema, effective.configuration)
  if (!sameControlValue(validateExecutionConfigurationLayer({ configuration: validated }).configuration!, effective.configuration)) durableReject('invalid control configuration')
  return effective
}

/** @internal Read an additive field without evaluating accessors. */
export function optionalExecutionConfiguration(value: object): EffectiveExecutionConfiguration | undefined {
  return safe(() => {
    const descriptor = Object.getOwnPropertyDescriptor(value, 'executionConfiguration')
    if (!descriptor) {
      if ('executionConfiguration' in value) durableReject('inherited execution configuration')
      return undefined
    }
    if (!('value' in descriptor) || !descriptor.enumerable) durableReject('invalid execution configuration field')
    return descriptor.value === undefined ? undefined : validateEffectiveExecutionConfiguration(descriptor.value)
  })
}
export const EXECUTION_CONFIGURATION_LAYER_SCHEMA = durableSchema(validateExecutionConfigurationLayer)
export const EFFECTIVE_EXECUTION_CONFIGURATION_SCHEMA = durableSchema(validateEffectiveExecutionConfiguration)

/** Trusted registrations map model behavior only, never a mutable native request. */
export interface ControlExtension<T extends JsonObject> {
  readonly descriptor: ControlDescriptor
  readonly map: (value: JsonValue) => T
}

const reservedNativeFields = new Set([
  'model', 'modelid', 'provider', 'providerid', 'prompt', 'prompts', 'messages', 'input', 'instructions', 'system',
  'tools', 'tooldefinitions', 'tooldispatch', 'dispatchtool', 'capabilities', 'policy', 'permissions',
  'approval', 'approvals', 'approvalpolicy', 'sandbox', 'storage', 'store', 'egress', 'network',
  'headers', 'auth', 'authorization', 'authentication', 'credentials', 'apikey', 'token', 'secret',
  'endpoint', 'url', 'baseurl', 'extraargs', 'argv', 'command', 'env', 'cwd', 'workspace',
])
function checkDestinations(value: JsonObject, occupied: ReadonlySet<string>): void {
  for (const key of Object.keys(value)) {
    if (reservedNativeFields.has(key.replace(/[-_]/g, '').toLowerCase()) || occupied.has(key)) {
      durableReject('conflicting or reserved native control field')
    }
  }
}
async function mappedSchema<T>(port: StandardSchemaV1<T>, value: unknown): Promise<T> {
  try {
    const result = ownedExecutionRecord(await port['~standard'].validate(value))
    if (!Object.hasOwn(result, 'value') || result['issues'] !== undefined) durableReject('invalid control value')
    return result['value'] as T
  } catch { durableReject('invalid control value') }
}
/** Registration conflicts throw synchronously; execution failures reject safely. */
export function mapControlExtensions<T extends JsonObject>(
  requested: readonly RequestedControl[], registrations: readonly ControlExtension<T>[],
  nativeSchema: StandardSchemaV1<T>, occupiedNativeFields: readonly string[] = [],
): Promise<T> {
  const contract = validateExecutionControlContract({ providerId: 'extension-mapper', requiresModel: false,
    configurationSchema: nativeSchema, controls: registrations.map((entry) => entry.descriptor) })
  const registered = new Map<string, { descriptor: ControlDescriptor; map: (value: JsonValue) => T }>()
  contract.controls.forEach((descriptor, index) => {
    const registration = registrations[index]!
    if (typeof registration.map !== 'function') durableReject('invalid control mapper')
    const entry = { descriptor, map: registration.map.bind(registration) }
    for (const id of [descriptor.id, ...(descriptor.aliases ?? [])]) registered.set(id, entry)
  })
  return (async () => {
    try {
      const controls = extensions(requested), seen = new Set<string>()
      const occupied = new Set(occupiedNativeFields), destinations = new Set(occupied)
      const result: Record<string, JsonValue> = Object.create(null)
      for (const request of controls) {
        const entry = registered.get(request.id)
        if (!entry || seen.has(entry.descriptor.id)) durableReject('unknown or duplicate control')
        seen.add(entry.descriptor.id)
        const value = json(await mappedSchema(entry.descriptor.schema, request.value))
        const mapped = configuration(entry.map(value))
        checkDestinations(mapped, destinations)
        for (const [key, value] of Object.entries(mapped)) { result[key] = value; destinations.add(key) }
      }
      const validated = configuration(await mappedSchema(nativeSchema, result))
      checkDestinations(validated, occupied)
      return validated as T
    } catch { durableReject('invalid control extension mapping') }
  })()
}
