import type { JsonValue } from './tool-execution.ts'
import type { ResultEnvelope } from './executor.ts'
import type { StandardSchemaV1 } from './standard-schema.ts'
import type { WorkspaceHandle } from './workspace.ts'
import type { ProviderBinding, RunKey } from './workflow-run.ts'
import type { ToolDispatcher } from './workflow-tools.ts'
import { durableId, durableJson, durableRecord, durableReject, durableSchema, durableString } from './workflow-run.ts'

/** Core IDs or vendor-namespaced extension IDs. Unknown IDs remain visible. */
export type CapabilityId = string
export interface DriverManifest {
  readonly id: string
  readonly version: string
  readonly kind: 'cli' | 'api' | 'custom'
  readonly capabilities: readonly CapabilityId[]
  readonly configurationSchema: StandardSchemaV1<unknown>
}
export interface DriverRequest {
  readonly key: RunKey
  readonly sessionId: string
  readonly taskId: string
  readonly prompt: string
  readonly workspace: WorkspaceHandle
  readonly context: JsonValue
  readonly continuation: 'fresh' | 'native' | 'reconstructed'
  readonly binding?: ProviderBinding
  readonly signal: AbortSignal
}
export interface DriverOutcome { readonly result: ResultEnvelope; readonly binding?: ProviderBinding }
export interface ExecutionDriver {
  readonly manifest: DriverManifest
  run(request: DriverRequest): Promise<DriverOutcome>
}
export interface DriverFactory {
  readonly manifest: DriverManifest
  /** Registries await schema validation before passing its output here. */
  create(configuration: unknown, services: DriverServices): Promise<ExecutionDriver>
}
/** Host-created services must reauthorize current actor/run/workspace policy. */
export interface DriverServices {
  readonly dispatchTool: ToolDispatcher
  readonly resolveSecret: (reference: string, signal: AbortSignal) => Promise<string>
}

export function validateDriverManifest(value: unknown): DriverManifest {
  const record = durableRecord(value, ['id', 'version', 'kind', 'capabilities', 'configurationSchema'])
  durableId(record['id']); durableString(record['version'])
  if (!['cli', 'api', 'custom'].includes(record['kind'] as string)) durableReject('invalid driver kind')
  if (!Array.isArray(record['capabilities'])) durableReject('capabilities must be an array')
  const capabilities = record['capabilities']
  durableJson(capabilities)
  const seen = new Set<string>()
  for (const capability of capabilities) {
    if (typeof capability !== 'string' || capability.split(':').length > 2) durableReject('invalid capability ID')
    capability.split(':').forEach(durableId)
    if (seen.has(capability)) durableReject('duplicate capability ID')
    seen.add(capability)
  }
  // This is a runtime schema port, not persisted JSON: accept conforming third-
  // party schema instances without attempting to serialize their functions.
  const schema = record['configurationSchema'] as StandardSchemaV1 | null | undefined
  if (schema === null || typeof schema !== 'object' || !schema['~standard'] ||
      schema['~standard'].version !== 1 || typeof schema['~standard'].validate !== 'function') {
    durableReject('configurationSchema must implement Standard Schema version 1')
  }
  return value as DriverManifest
}
export const DRIVER_MANIFEST_SCHEMA = durableSchema(validateDriverManifest)
