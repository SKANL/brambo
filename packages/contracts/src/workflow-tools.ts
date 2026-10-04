import type { StandardSchemaV1 } from './standard-schema.ts'
import type { JsonObject, JsonValue } from './tool-execution.ts'
import { durableId, durableJson, durableRecord, durableReject, durableSchema } from './workflow-run.ts'

export interface ToolCall { readonly id: string; readonly toolId: string; readonly arguments: JsonObject }
export type ToolDispatcher = (call: ToolCall, signal: AbortSignal) => Promise<JsonValue>
export interface RegisteredTool {
  readonly id: string
  readonly inputSchema: StandardSchemaV1<JsonObject>
  readonly effect: 'read-only' | 'idempotent' | 'non-idempotent'
  execute(argumentsValue: JsonObject, signal: AbortSignal): Promise<JsonValue>
}
/**
 * Injected knowledge-free effect evidence, not a tool executor or session API.
 * The host binds actor/run/task/call scope, payload fingerprint, current parent
 * lease and ownership-loss abort. Every call has its own validated durable
 * record/event; TaskCheckpoint.effectId is not a multi-effect history.
 */
export interface EffectJournal {
  begin(call: ToolCall, effect: RegisteredTool['effect']): Promise<'new' | 'completed' | 'uncertain'>
  result(callId: string): Promise<JsonValue>
  finish(callId: string, result: JsonValue): Promise<void>
}

export function validateToolCall(value: unknown): ToolCall {
  durableJson(value)
  const record = durableRecord(value, ['id', 'toolId', 'arguments'])
  durableId(record['id']); durableId(record['toolId'])
  if (record['arguments'] === null || typeof record['arguments'] !== 'object' || Array.isArray(record['arguments'])) {
    durableReject('tool arguments must be a JSON object')
  }
  return value as unknown as ToolCall
}
export const TOOL_CALL_SCHEMA = durableSchema(validateToolCall)
