import test from 'node:test'
import assert from 'node:assert/strict'
import {waitForPublished} from './assert-published.mjs'

test('waits through transient registry absence before succeeding', async () => {
  const responses = ['', '{"error":"E404"}', '{"name":"pkg","version":"1.0.0"}']
  const waits = []
  const result = await waitForPublished('pkg@1.0.0', {
    maxAttempts: 3,
    delays: [100, 200],
    query: async () => responses.shift(),
    sleep: async (delay) => waits.push(delay),
  })
  assert.equal(result.published, true)
  assert.equal(result.attempts, 3)
  assert.deepEqual(waits, [100, 200])
})

test('returns package-specific timeout evidence after bounded polling', async () => {
  const result = await waitForPublished('@scope/pkg@2.0.0', {
    maxAttempts: 3,
    delays: [10, 20],
    query: async () => '',
    sleep: async () => {},
  })
  assert.deepEqual(result, {published: false, attempts: 3})
})
