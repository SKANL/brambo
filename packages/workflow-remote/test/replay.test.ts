import { expect, it } from 'vitest'
import { createRemoteRunStore } from '../src/store.ts'
import { replayRun } from '../src/replay.ts'
import { ok, options, snapshot } from './fixtures.ts'
it.each([0, 7])('rejects denied event history at cursor %i rather than inventing an empty page', async after => {
  for (const status of [200, 403]) {
    const store = createRemoteRunStore(options((async () => new Response(
      JSON.stringify({ version: 1, status: 'denied' }), { status },
    )) as typeof fetch))
    try {
      await expect(store.events(snapshot.key, after, 1)).rejects.toThrow('Invalid remote workflow response')
      await expect(replayRun(store, snapshot.key, after, 1)).rejects.toThrow('Invalid remote workflow response')
    } finally { await store.close() }
  }
})
it.each([0, 7])('accepts genuinely authorized empty event history at cursor %i', async after => {
  const page = { status: 'empty', events: [], latestCursor: after, nextCursor: after }
  const store = createRemoteRunStore(options((async () => ok(page)) as typeof fetch))
  try {
    expect(await store.events(snapshot.key, after, 1)).toEqual(page)
    expect(await replayRun(store, snapshot.key, after, 1)).toEqual(page)
  } finally { await store.close() }
})
it('uses nextCursor rather than latestCursor so paging never skips events', async () => {
  const store = createRemoteRunStore(options((async (_url, init) => {
    const { payload: { after } } = JSON.parse(init!.body as string)
    return ok({ status: 'ok', latestCursor: 3, nextCursor: after + 1,
      events: [{ schemaVersion: 1, key: snapshot.key, cursor: after + 1, type: 'progress', payload: null, occurredAt: '2026-10-05' }] })
  }) as typeof fetch))
  const first = await replayRun(store, snapshot.key, 0, 1)
  const second = await replayRun(store, snapshot.key, first.nextCursor, 1)
  expect(second.events[0]?.cursor).toBe(2)
})
it('returns an authoritative snapshot/new cursor for explicit retention overflow', async () => {
  const retentionFloor = 3
  const store = createRemoteRunStore(options((async (_url, init) => {
    const { payload: { after } } = JSON.parse(init!.body as string)
    return ok(after < retentionFloor ? { status: 'overflow', events: [], latestCursor: 5, nextCursor: 5, snapshot } :
      { status: 'empty', events: [], latestCursor: 5, nextCursor: after })
  }) as typeof fetch))
  expect(await replayRun(store, snapshot.key, 1, 256)).toEqual({ status: 'overflow', events: [], latestCursor: 5, nextCursor: 5, snapshot })
})
it('rejects cursor skips, wrong scopes, unbounded pages and overflow without snapshot', async () => {
  for (const page of [ { status: 'overflow', events: [], latestCursor: 5, nextCursor: 5 },
    { status: 'ok', events: [], latestCursor: 5, nextCursor: 5 } ]) {
    const store = createRemoteRunStore(options((async () => ok(page)) as typeof fetch))
    await expect(replayRun(store, snapshot.key, 0, 1)).rejects.toThrow()
  }
})
it('rejects empty replay that hides an unseen latest cursor', async () => {
  const store = createRemoteRunStore(options((async () => ok({ status: 'empty', events: [], latestCursor: 5, nextCursor: 0 })) as typeof fetch))
  await expect(replayRun(store, snapshot.key, 0, 1)).rejects.toThrow('Invalid remote workflow response')
})
