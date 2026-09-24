import { describe, expect, it } from 'vitest'
import { toOpenAIToolDefinition, toOpenAIToolOutput, parseOpenAIFunctionCall } from '../src/openai-tools.ts'

describe('OpenAI function tools', () => {
  it('emits flat strict function definitions and rejects non-strict schemas', () => {
    expect(toOpenAIToolDefinition({ name: 'read_file', description: 'Read a file', parameters: { type: 'object', properties: { path: { type: 'string' } }, required: ['path'], additionalProperties: false } })).toEqual({ type: 'function', name: 'read_file', description: 'Read a file', strict: true, parameters: { type: 'object', properties: { path: { type: 'string' } }, required: ['path'], additionalProperties: false } })
    expect(() => toOpenAIToolDefinition({ name: 'unsafe', description: '', parameters: { type: 'object', properties: {} } })).toThrow()
  })
  it('correlates function outputs by call_id rather than output item id', () => {
    expect(toOpenAIToolOutput({ callId: 'call-1', output: { status: 'ok' } })).toEqual({ type: 'function_call_output', call_id: 'call-1', output: '{"status":"ok"}' })
  })
  it('rejects malformed function arguments before host execution', () => {
    expect(() => parseOpenAIFunctionCall({ type: 'function_call', call_id: 'call-1', name: 'read_file', arguments: '{bad' })).toThrow()
  })
  it('rejects schema constraints the local validator cannot enforce', () => {
    expect(() => toOpenAIToolDefinition({ name: 'patterned', description: 'Read', parameters: { type: 'object', properties: { path: { type: 'string', pattern: '^safe/' } }, required: ['path'], additionalProperties: false } })).toThrow()
  })
})
