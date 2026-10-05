import { defineStandardSchema, type EffectJournal, type JsonObject, type JsonValue, type RegisteredTool, type ToolCall } from '@brambodev/contracts'
export function journalHarness() {
  const records = new Map<string, { payload: string; result?: JsonValue }>()
  const journal: EffectJournal = {
    async begin(call) {
      const payload = JSON.stringify(call)
      const old = records.get(call.id)
      if (old && old.payload !== payload) throw new Error('payload conflict')
      if (old) return Object.hasOwn(old, 'result') ? 'completed' : 'uncertain'
      records.set(call.id, { payload })
      return 'new'
    },
    async result(id) { return records.get(id)!.result! },
    async finish(id, result) { records.get(id)!.result = result },
  }
  return { journal, records }
}
export const call: ToolCall = { id: 'call-1', toolId: 'write', arguments: {} }
export const signal = new AbortController().signal
export function tool(execute: RegisteredTool['execute'] = async () => ({ done: true })): RegisteredTool {
  return { id: 'write', effect: 'non-idempotent', inputSchema: defineStandardSchema<JsonObject>((value) => ({ value: value as JsonObject })), execute }
}
export function options(tools: readonly RegisteredTool[] = [tool()]) {
  return { principal: { namespace: 'tenant', subject: 'alice' }, key: { namespace: 'tenant', runId: 'run' }, taskId: 'task', tools,
    authorize: async () => true, resolveSecret: async () => 'secret-canary', ...journalHarness() }
}
