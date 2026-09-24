import type { EncodedProviderToolResult } from '@brambodev/adapter-api'

export interface BramboToolDefinition {
  readonly name: string
  readonly description: string
  readonly parameters: Readonly<Record<string, unknown>>
  readonly validateArguments?: (value: unknown) => void | Promise<void>
  readonly concurrencySafe?: boolean
}
export interface AnthropicToolDefinition { readonly name: string; readonly description: string; readonly input_schema: Readonly<Record<string, unknown>> }
export interface AnthropicToolUse { readonly type: 'tool_use'; readonly id: string; readonly name: string; readonly input: Record<string, unknown> }
export interface AnthropicToolResultBlock { readonly type: 'tool_result'; readonly tool_use_id: string; readonly content: string; readonly is_error?: true }

function record(value: unknown): value is Record<string, unknown> { return value !== null && typeof value === 'object' && !Array.isArray(value) }
function safeName(value: unknown): value is string { return typeof value === 'string' && /^[A-Za-z0-9_-]{1,64}$/.test(value) }
function assertSchema(schema: unknown, root = false, depth = 0): asserts schema is Record<string, unknown> {
  if (!record(schema) || depth > 32) throw new Error('invalid Anthropic tool schema')
  const types = typeof schema.type === 'string' ? [schema.type] : Array.isArray(schema.type) ? schema.type : []
  if (root && schema.type !== 'object') throw new Error('Anthropic tool schema requires an object root')
  if (types.some((type) => typeof type !== 'string' || !['object', 'array', 'string', 'number', 'integer', 'boolean', 'null'].includes(type))) throw new Error('unsupported Anthropic tool schema type')
  if (Object.keys(schema).some((key) => !['type', 'description', 'properties', 'required', 'additionalProperties', 'items', 'enum', 'const', 'anyOf', '$defs', '$ref'].includes(key))) throw new Error('unsupported Anthropic tool schema keyword')
  if (types.includes('object')) {
    if (!record(schema.properties) || schema.additionalProperties !== false) throw new Error('Anthropic tool object schema must disallow additional properties')
    if (Object.keys(schema.properties).some((key) => ['__proto__', 'constructor', 'prototype'].includes(key))) throw new Error('unsafe Anthropic tool property')
    if (schema.required !== undefined && (!Array.isArray(schema.required) || schema.required.some((key) => typeof key !== 'string' || !Object.hasOwn(schema.properties as object, key)))) throw new Error('invalid Anthropic required properties')
    for (const child of Object.values(schema.properties)) assertSchema(child, false, depth + 1)
  }
  if (types.includes('array')) assertSchema(schema.items, false, depth + 1)
  if (Array.isArray(schema.anyOf)) for (const child of schema.anyOf) assertSchema(child, false, depth + 1)
  if (record(schema.$defs)) for (const child of Object.values(schema.$defs)) assertSchema(child, false, depth + 1)
  if (types.length === 0 && !Array.isArray(schema.anyOf) && typeof schema.$ref !== 'string' && !Array.isArray(schema.enum) && !('const' in schema)) throw new Error('unsupported Anthropic tool schema')
}

export function toAnthropicToolDefinition(tool: BramboToolDefinition): AnthropicToolDefinition {
  if (!safeName(tool.name) || typeof tool.description !== 'string') throw new Error('invalid Anthropic tool name or description')
  assertSchema(tool.parameters, true)
  return { name: tool.name, description: tool.description, input_schema: structuredClone(tool.parameters) }
}

export function parseAnthropicToolUse(value: unknown): AnthropicToolUse {
  if (!record(value) || value.type !== 'tool_use' || typeof value.id !== 'string' || value.id.length === 0 || !safeName(value.name) || !record(value.input)) throw new Error('invalid Anthropic tool_use block')
  return { type: 'tool_use', id: value.id, name: value.name, input: structuredClone(value.input) }
}

function matchesType(value: unknown, type: string): boolean {
  switch (type) {
    case 'object': return record(value)
    case 'array': return Array.isArray(value)
    case 'string': return typeof value === 'string'
    case 'number': return typeof value === 'number' && Number.isFinite(value)
    case 'integer': return typeof value === 'number' && Number.isInteger(value)
    case 'boolean': return typeof value === 'boolean'
    case 'null': return value === null
    default: return false
  }
}

export function validateAnthropicToolArguments(schema: Readonly<Record<string, unknown>>, value: unknown): void {
  const definitions = record(schema.$defs) ? schema.$defs : {}
  const validate = (node: unknown, candidate: unknown, depth: number): void => {
    if (!record(node) || depth > 32) throw new Error('unsupported Anthropic tool schema')
    if (typeof node.$ref === 'string') {
      const name = node.$ref.startsWith('#/$defs/') ? node.$ref.slice(8) : undefined
      if (name === undefined || !Object.hasOwn(definitions, name)) throw new Error('unsupported Anthropic tool schema reference')
      validate(definitions[name], candidate, depth + 1); return
    }
    if (Array.isArray(node.anyOf)) {
      if (!node.anyOf.some((branch) => { try { validate(branch, candidate, depth + 1); return true } catch { return false } })) throw new Error('Anthropic tool argument matches no schema branch')
      return
    }
    const types = typeof node.type === 'string' ? [node.type] : Array.isArray(node.type) ? node.type : []
    if (!types.some((type) => typeof type === 'string' && matchesType(candidate, type))) throw new Error('Anthropic tool argument type mismatch')
    if (Array.isArray(node.enum) && !node.enum.some((entry) => Object.is(entry, candidate))) throw new Error('Anthropic tool argument not in enum')
    if ('const' in node && !Object.is(node.const, candidate)) throw new Error('Anthropic tool argument const mismatch')
    if (record(candidate)) {
      const properties = record(node.properties) ? node.properties : {}
      for (const key of Array.isArray(node.required) ? node.required : []) if (typeof key !== 'string' || !Object.hasOwn(candidate, key)) throw new Error('missing Anthropic tool argument')
      for (const [key, child] of Object.entries(candidate)) { if (!Object.hasOwn(properties, key)) throw new Error('unknown Anthropic tool argument'); validate(properties[key], child, depth + 1) }
    }
    if (Array.isArray(candidate)) for (const item of candidate) validate(node.items, item, depth + 1)
  }
  validate(schema, value, 0)
}

export function toAnthropicToolResult(result: EncodedProviderToolResult): AnthropicToolResultBlock {
  if (typeof result.callId !== 'string' || result.callId.length === 0) throw new Error('Anthropic tool result requires tool_use_id')
  const content = typeof result.output === 'string' ? result.output : JSON.stringify(result.output)
  if (typeof content !== 'string') throw new Error('Anthropic tool result is not serializable')
  return { type: 'tool_result', tool_use_id: result.callId, content, ...(record(result.output) && result.output.status === 'error' ? { is_error: true as const } : {}) }
}
