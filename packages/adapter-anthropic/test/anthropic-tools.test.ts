import { describe, expect, it } from 'vitest'
import { parseAnthropicToolUse, toAnthropicToolDefinition, toAnthropicToolResult, validateAnthropicToolArguments } from '../src/index.ts'

const tool = { name: 'read_file', description: 'Read a file', parameters: { type: 'object', properties: { path: { type: 'string' } }, required: ['path'], additionalProperties: false } } as const

describe('Anthropic local tool translation', () => {
  it('maps the host schema to input_schema without changing it', () => {
    expect(toAnthropicToolDefinition(tool)).toEqual({ name: 'read_file', description: 'Read a file', input_schema: tool.parameters })
  })
  it('rejects undeclared arguments before approval', () => {
    expect(() => validateAnthropicToolArguments(tool.parameters, { path: 'a', shell: 'rm' })).toThrow()
    expect(() => validateAnthropicToolArguments(tool.parameters, { path: 3 })).toThrow()
    expect(() => validateAnthropicToolArguments(tool.parameters, { path: 'a' })).not.toThrow()
  })
  it('parses provider tool IDs and emits correlated user tool_result blocks', () => {
    expect(parseAnthropicToolUse({ type: 'tool_use', id: 'toolu-1', name: 'read_file', input: { path: 'a' } })).toMatchObject({ id: 'toolu-1', input: { path: 'a' } })
    expect(toAnthropicToolResult({ callId: 'toolu-1', output: { status: 'ok' } })).toEqual({ type: 'tool_result', tool_use_id: 'toolu-1', content: '{"status":"ok"}' })
    expect(toAnthropicToolResult({ callId: 'toolu-2', output: { status: 'error' } })).toMatchObject({ tool_use_id: 'toolu-2', is_error: true })
  })
})
