import { validateCommand } from '@brambodev/contracts'
import type { CapabilityId, ExecutionConfigurationLayer, JsonValue } from '@brambodev/contracts'

export interface WorkflowTaskDefinition {
  readonly id: string
  readonly dependsOn: readonly string[]
  readonly driverId: string
  readonly execution?: ExecutionConfigurationLayer
  readonly configuration: JsonValue
  readonly prompt: string
  readonly required: readonly CapabilityId[]
  readonly optional: readonly CapabilityId[]
  readonly maxAttempts: number
}
export interface WorkflowDefinition {
  readonly id: string
  readonly version: string
  readonly tasks: readonly WorkflowTaskDefinition[]
}
export interface WorkflowRegistry {
  register(definition: WorkflowDefinition): void
  resolve(id: string, version: string): WorkflowDefinition
}

function freeze(value: unknown): void {
  if (value !== null && typeof value === 'object') {
    for (const child of Object.values(value)) freeze(child)
    Object.freeze(value)
  }
}

/** Validate and own a copy so host mutation cannot change an admitted graph. */
export function validateWorkflowDefinition(definition: WorkflowDefinition): WorkflowDefinition {
  validateCommand({ key: { namespace: 'workflow', runId: definition.id }, clientId: 'registry',
    idempotencyKey: definition.version, kind: 'start', payload: definition as unknown as JsonValue })
  const ids = new Set<string>()
  for (const task of definition.tasks) {
    validateCommand({ key: { namespace: 'workflow', runId: task.id }, clientId: task.driverId,
      idempotencyKey: 'task', kind: 'start', payload: task.configuration })
    if (ids.has(task.id)) throw new Error('Duplicate workflow task')
    ids.add(task.id)
    if (!Number.isSafeInteger(task.maxAttempts) || task.maxAttempts < 1) throw new Error('Invalid maxAttempts')
    if (typeof task.prompt !== 'string' || !Array.isArray(task.required) || !Array.isArray(task.optional) ||
        [...task.required, ...task.optional].some((id) => typeof id !== 'string' || !id.trim())) throw new Error('Invalid task configuration')
  }
  const completed = new Set<string>()
  for (const task of definition.tasks) {
    if (!Array.isArray(task.dependsOn) || task.dependsOn.some((id) => !ids.has(id)) ||
        new Set(task.dependsOn).size !== task.dependsOn.length) throw new Error('Invalid workflow dependency')
  }
  while (completed.size < ids.size) {
    const ready = definition.tasks.filter((task) => !completed.has(task.id) && task.dependsOn.every((id) => completed.has(id)))
    if (ready.length === 0) throw new Error('Workflow dependency cycle')
    for (const task of ready) completed.add(task.id)
  }
  const copy = structuredClone(definition)
  freeze(copy)
  return copy
}

export function createWorkflowRegistry(): WorkflowRegistry {
  const definitions = new Map<string, WorkflowDefinition>()
  const key = (id: string, version: string) => JSON.stringify([id, version])
  return {
    register(definition) {
      const copy = validateWorkflowDefinition(definition)
      if (definitions.has(key(copy.id, copy.version))) throw new Error('Workflow already registered')
      definitions.set(key(copy.id, copy.version), copy)
    },
    resolve(id, version) {
      const definition = definitions.get(key(id, version))
      if (!definition) throw new Error('Workflow definition not registered')
      return definition
    },
  }
}
