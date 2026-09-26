import type { EncodedProviderToolResult } from '@brambodev/adapter-api'

export interface BramboToolDefinition {
  readonly name: string
  readonly description: string
  readonly parameters: Readonly<Record<string, unknown>>
  /** Additional host validator; the adapter always validates the advertised schema first. */
  readonly validateArguments?: (value: unknown) => void | Promise<void>
  readonly concurrencySafe?: boolean
}

export interface OpenAIToolDefinition {
  readonly type: 'function'
  readonly name: string
  readonly description: string
  readonly strict: true
  readonly parameters: Readonly<Record<string, unknown>>
}

export interface OpenAIFunctionCall {
  readonly type: 'function_call'
  readonly call_id: string
  readonly name: string
  readonly arguments: string
  readonly id?: string
}

export interface OpenAIFunctionCallOutput {
  readonly type: 'function_call_output'
  readonly call_id: string
  readonly output: string
}

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function assertStrictSchema(schema: unknown, nested = false): asserts schema is Record<string, unknown> {
  if (!record(schema)) throw new Error('function parameters must be a JSON schema object')
  if (!nested && schema.type !== 'object') throw new Error('strict function parameters require an object root')
  const supported = new Set(['type', 'description', 'properties', 'required', 'additionalProperties', 'items', 'enum', 'const', 'anyOf', '$defs', '$ref'])
  if (Object.keys(schema).some((key) => !supported.has(key))) throw new Error('unsupported strict function schema keyword')
  const types = typeof schema.type === 'string' ? [schema.type] : Array.isArray(schema.type) ? schema.type : []
  if (types.some((type) => typeof type !== 'string' || !['object', 'array', 'string', 'number', 'integer', 'boolean', 'null'].includes(type))) throw new Error('unsupported strict function schema type')
  if (types.includes('object')) {
    if (!record(schema.properties) || schema.additionalProperties !== false) throw new Error('strict function objects require properties and additionalProperties: false')
    const propertyNames = Object.keys(schema.properties)
    if (propertyNames.some((key) => key === '__proto__' || key === 'constructor' || key === 'prototype')) throw new Error('unsafe function property name')
    if (!Array.isArray(schema.required) || schema.required.length !== propertyNames.length || propertyNames.some((key) => !(schema.required as unknown[]).includes(key))) {
      throw new Error('strict function objects require every property')
    }
    for (const child of Object.values(schema.properties)) assertStrictSchema(child, true)
  } else if (types.includes('array')) {
    assertStrictSchema(schema.items, true)
  } else if (Array.isArray(schema.anyOf)) {
    for (const child of schema.anyOf) assertStrictSchema(child, true)
  } else if (!nested || (types.length === 0 && !Array.isArray(schema.enum) && !('const' in schema) && typeof schema.$ref !== 'string')) {
    throw new Error('unsupported strict function parameter schema')
  }
  if (record(schema.$defs)) for (const child of Object.values(schema.$defs)) assertStrictSchema(child, true)
}

export function toOpenAIToolDefinition(tool: BramboToolDefinition): OpenAIToolDefinition {
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(tool.name) || typeof tool.description !== 'string') throw new Error('invalid function name or description')
  assertStrictSchema(tool.parameters)
  return { type: 'function', name: tool.name, description: tool.description, strict: true, parameters: structuredClone(tool.parameters) }
}

export function parseOpenAIFunctionCall(value: unknown): OpenAIFunctionCall & { readonly parsedArguments: Record<string, unknown> } {
  if (!record(value) || value.type !== 'function_call' || typeof value.call_id !== 'string' || value.call_id.length === 0 || typeof value.name !== 'string' || value.name.length === 0 || typeof value.arguments !== 'string') throw new Error('invalid OpenAI function call')
  let parsed: unknown
  try { parsed = JSON.parse(value.arguments) } catch { throw new Error('malformed OpenAI function arguments') }
  if (!record(parsed)) throw new Error('OpenAI function arguments must be an object')
  return { type: 'function_call', call_id: value.call_id, name: value.name, arguments: value.arguments, ...(typeof value.id === 'string' ? { id: value.id } : {}), parsedArguments: parsed }
}

function matchesType(value: unknown, type: string): boolean {
  switch (type) {
    case 'object': return record(value)
    case 'array': return Array.isArray(value)
    case 'string': return typeof value === 'string'
    case 'integer': return typeof value === 'number' && Number.isInteger(value)
    case 'number': return typeof value === 'number' && Number.isFinite(value)
    case 'boolean': return typeof value === 'boolean'
    case 'null': return value === null
    default: return false
  }
}

/** Fail-closed validator for the strict schema subset emitted by this adapter. */
export function validateOpenAIToolArguments(schema: Readonly<Record<string, unknown>>, value: unknown): void {
  const definitions = record(schema.$defs) ? schema.$defs : {}
  const validate = (node: unknown, candidate: unknown, depth: number): void => {
    if (depth > 32 || !record(node)) throw new Error('unsupported function schema')
    if (typeof node.$ref === 'string') {
      const name = node.$ref.startsWith('#/$defs/') ? node.$ref.slice(8) : undefined
      if (name === undefined || !(name in definitions)) throw new Error('unsupported function schema reference')
      validate(definitions[name], candidate, depth + 1)
      return
    }
    if (Array.isArray(node.anyOf)) {
      if (!node.anyOf.some((branch) => { try { validate(branch, candidate, depth + 1); return true } catch { return false } })) throw new Error('function argument does not match any schema branch')
      return
    }
    const types = typeof node.type === 'string' ? [node.type] : Array.isArray(node.type) ? node.type : []
    if (types.length === 0 || !types.some((type) => typeof type === 'string' && matchesType(candidate, type))) throw new Error('function argument type does not match schema')
    if (Array.isArray(node.enum) && !node.enum.some((entry) => Object.is(entry, candidate))) throw new Error('function argument is not in enum')
    if ('const' in node && !Object.is(node.const, candidate)) throw new Error('function argument does not match const')
    if (record(candidate)) {
      const properties = record(node.properties) ? node.properties : {}
      for (const key of node.required as string[] ?? []) if (!Object.hasOwn(candidate, key)) throw new Error('required function argument is missing')
      for (const [key, child] of Object.entries(candidate)) {
        if (!Object.hasOwn(properties, key)) throw new Error('unknown function argument')
        validate(properties[key], child, depth + 1)
      }
    }
    if (Array.isArray(candidate)) for (const item of candidate) validate(node.items, item, depth + 1)
  }
  validate(schema, value, 0)
}

export function toOpenAIToolOutput(result: EncodedProviderToolResult): OpenAIFunctionCallOutput {
  if (typeof result.callId !== 'string' || result.callId.length === 0) throw new Error('function output requires call_id')
  const output = typeof result.output === 'string' ? result.output : JSON.stringify(result.output)
  if (typeof output !== 'string') throw new Error('function output must be serializable')
  return { type: 'function_call_output', call_id: result.callId, output }
}
