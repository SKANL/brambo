import { describe, expect, it } from 'vitest'
import { validateToolCall, TOOL_CALL_SCHEMA } from '../src/workflow-tools.ts'

const call = { id: 'call-1', toolId: 'read-file', arguments: { path: 'README.md' } }

describe('workflow tool calls', () => {
  it('preserves explicit JSON-object arguments', () => {
    expect(validateToolCall(call)).toEqual(call)
    expect(TOOL_CALL_SCHEMA['~standard'].validate(call)).toEqual({ value: call })
  })
  it.each([null, [], 'text', { n: Infinity }, { value: undefined }, new Date(), Object.create({ inherited: true })])('rejects nonportable arguments %s', (argumentsValue) => {
    expect(() => validateToolCall({ ...call, arguments: argumentsValue })).toThrow()
  })
  it('rejects unsafe call/tool IDs and unexpected fields', () => {
    expect(() => validateToolCall({ ...call, id: '../call' })).toThrow()
    expect(() => validateToolCall({ ...call, toolId: '' })).toThrow()
    expect(() => validateToolCall({ ...call, secret: 'body-supplied' })).toThrow()
  })
})
