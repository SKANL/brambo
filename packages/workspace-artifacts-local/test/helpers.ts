import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createHash } from 'node:crypto'
import type { Lease, RunStore, WorkspaceRef } from '@brambodev/contracts'
import { afterEach } from 'vitest'
import { createLocalArtifactProvider } from '../src/provider.ts'
import type { ArtifactLimits } from '../src/manifest.ts'

const roots: string[] = []
export const namespaceDirectory = (root: string, namespace = 'tenant') => join(root, 'artifacts', 'namespaces', createHash('sha256').update(namespace).digest('hex'))
afterEach(async () => {
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true })
})

// The provider only consumes valid(). Keep this authority fake local to tests;
// importing the concrete SQLite implementation would impose its Node floor.
export async function fixture(limits?: Partial<ArtifactLimits>) {
  const root = await mkdtemp(join(tmpdir(), 'brambo-artifact-'))
  roots.push(root)
  const source = join(root, 'source')
  await mkdir(source)
  const lease: Lease = { namespace: 'tenant', ownerId: 'worker', token: 'secret', expiresAt: Date.now() + 60_000, epochs: { 'workspace:ws': 1 } }
  let live = true
  const store = { valid: async (candidate: Lease) => live && candidate.token === lease.token && candidate.expiresAt > Date.now(), commit: async () => { throw new Error('publication must not advance progress') } } as unknown as RunStore
  const provider = createLocalArtifactProvider({ rootDir: join(root, 'artifacts'), store, limits })
  const ref = (revision: string): WorkspaceRef => ({ namespace: 'tenant', workspaceId: 'ws', revision })
  const file = async (path: string, bytes = 'old') => { await writeFile(join(source, path), bytes) }
  return { root, source, provider, lease, ref, file, invalidate: () => { live = false }, store }
}
