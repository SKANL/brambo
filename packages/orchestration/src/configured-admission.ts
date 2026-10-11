import { createHash } from 'node:crypto'
import { validateCommand, validateCommandReceipt, validateRunSnapshot } from '@brambodev/contracts'
import type { Admission, Command, ExecutionConfigurationLayers, ExecutionControlHost, JsonValue, Principal, RunSnapshot, RunStore } from '@brambodev/contracts'
import { resolveExecutionConfiguration, snapshotConfigurationLayer, validateConfiguredExecutionConfiguration } from './execution-configuration.ts'
import type { DriverRegistry } from './driver-registry.ts'
import { validateWorkflowDefinition } from './workflow-registry.ts'
import type { WorkflowDefinition, WorkflowTaskDefinition } from './workflow-registry.ts'

export interface ConfiguredAdmissionOptions {
  readonly store: RunStore
  readonly snapshot: RunSnapshot
  readonly command: Command
  readonly actor: Principal
  readonly definition: WorkflowDefinition
  readonly drivers: DriverRegistry
  readonly hostForTask: (task: WorkflowTaskDefinition) => ExecutionControlHost
  readonly layersForTask: (task: WorkflowTaskDefinition) => Omit<ExecutionConfigurationLayers, 'task'>
}

function canonical(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value)
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']'
  return '{' + Object.keys(value).sort().map(key => JSON.stringify(key) + ':' + canonical((value as Record<string, unknown>)[key])).join(',') + '}'
}
function freeze(value: unknown): void {
  if (value !== null && typeof value === 'object') {
    for (const child of Object.values(value)) freeze(child)
    Object.freeze(value)
  }
}

function dataFields(value: unknown): PropertyDescriptorMap {
  if (value === null || typeof value !== 'object' || Array.isArray(value) ||
      ![Object.prototype, null].includes(Object.getPrototypeOf(value))) throw new Error('Invalid workflow definition')
  const fields = Object.getOwnPropertyDescriptors(value)
  if (Reflect.ownKeys(fields).some(key => typeof key !== 'string' || !fields[key]!.enumerable || !('value' in fields[key]!))) {
    throw new Error('Invalid workflow definition')
  }
  return fields
}
/** Normalize only optional task-layer data; strict validation still owns all other fields. */
function normalizedDefinition(input: WorkflowDefinition, drivers: DriverRegistry): WorkflowDefinition {
  const fields = dataFields(input), source: unknown = fields['tasks']?.value
  if (!Array.isArray(source) || Object.getPrototypeOf(source) !== Array.prototype) throw new Error('Invalid workflow tasks')
  const entries = Object.getOwnPropertyDescriptors(source as object)
  const length = entries['length']!.value as number
  if (Reflect.ownKeys(entries).length !== length + 1) throw new Error('Invalid workflow tasks')
  const tasks = Array.from({ length }, (_, index) => {
    const entry = entries[String(index)]
    if (!entry?.enumerable || !('value' in entry)) throw new Error('Invalid workflow task')
    const task = dataFields(entry.value), execution = task['execution']
    if (execution) {
      if (execution.value === undefined) delete task['execution']
      else {
        const factory = drivers.resolve(task['driverId']?.value as string)
        if (!factory.manifest.configurationControls) throw new Error('Configured driver unavailable')
        execution.value = snapshotConfigurationLayer(execution.value, factory.manifest.configurationControls)
      }
    }
    return Object.defineProperties({}, task) as WorkflowTaskDefinition
  })
  fields['tasks']!.value = tasks
  return validateWorkflowDefinition(Object.defineProperties({}, fields) as WorkflowDefinition)
}

/** Resolve all controls before the store's single atomic create/admit boundary. */
export async function admitConfiguredWorkflowRun(options: ConfiguredAdmissionOptions): Promise<Admission> {
  const definition = normalizedDefinition(options.definition, options.drivers)
  const snapshot = structuredClone(validateRunSnapshot(options.snapshot))
  const command = structuredClone(validateCommand(options.command)), actor = structuredClone(options.actor)
  validateCommandReceipt({ id: 'admission-validation', command, actor, phase: 'accepted' })
  if (command.kind !== 'start' || canonical(command.key) !== canonical(snapshot.key) ||
      snapshot.workflowId !== definition.id || snapshot.workflowVersion !== definition.version ||
      snapshot.executionConfigurations !== undefined) throw new Error('Configured admission identity mismatch')
  // Begin every resolver synchronously, so host layers are owned before any await.
  const configurations = await Promise.all(definition.tasks.filter(task => task.execution !== undefined).map(async task => {
    const factory = options.drivers.resolve(task.driverId)
    if (factory.manifest.id !== task.driverId || !factory.createConfigured || !factory.manifest.configurationControls) throw new Error('Configured driver unavailable')
    if (!snapshot.tasks.some(checkpoint => checkpoint.taskId === task.id)) throw new Error('Configured task checkpoint missing')
    const host = options.hostForTask(task), layers = options.layersForTask(task)
    const resolving = resolveExecutionConfiguration({ ...layers, task: task.execution }, host)
    // Raw driver configuration stays separate; no factory is constructed here.
    const raw = (async () => {
      try {
        const result = await factory.manifest.configurationSchema['~standard'].validate(task.configuration)
        if (result !== null && typeof result === 'object' && Object.hasOwn(result, 'value') && result.issues === undefined) return
      } catch { /* Never disclose validator messages or credentials. */ }
      throw new Error('Invalid driver configuration')
    })()
    // Attach both rejection handlers immediately; a slow schema must not leave
    // an unsupported-control rejection unhandled (or delay raw-schema refusal).
    const [effective] = await Promise.all([resolving, raw])
    const configuration = await validateConfiguredExecutionConfiguration(effective, factory.manifest.configurationControls)
    return { taskId: task.id, driverId: factory.manifest.id, driverVersion: factory.manifest.version, configuration }
  }))
  const configured = configurations.length > 0
  const admitted = validateRunSnapshot({ ...snapshot, ...(configured ? { executionConfigurations: configurations } : {}) })
  const intent: Command = configured ? { ...command, payload: { intent: command.payload,
    executionConfigurationFingerprint: createHash('sha256').update(canonical({ definition, executionConfigurations: configurations })).digest('hex') } as JsonValue } : command
  freeze(admitted); freeze(intent); freeze(actor)
  return options.store.create(admitted, intent, actor)
}
