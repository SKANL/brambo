// Synthetic local integration authority. No ambient authentication or external listener.
import { createServer } from 'node:http'
import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { createWorkflowCoordinator } from '@brambodev/workflow-coordinator'
import { openSqliteRunStore } from '@brambodev/workflow-store-sqlite'
import { createLocalArtifactProvider } from '@brambodev/workspace-artifacts-local'

const root = process.argv[2]!
const store = await openSqliteRunStore({ path: join(root, 'run.sqlite') })
const artifacts = createLocalArtifactProvider({ rootDir: join(root, 'artifacts'), store })
const source = join(root, 'source')
await mkdir(source)
const staged = await artifacts.stage('tenant', source)
const claimed = await store.claim('tenant', ['workspace:parent'], 'bootstrap', 10_000)
if (claimed.status !== 'acquired') throw new Error('bootstrap claim')
await artifacts.publish({ namespace: 'tenant', workspaceId: 'parent', revision: staged.revision }, staged, claimed.lease)
await store.release(claimed.lease)
const credentials = new Map([
  ['synthetic-alice', { namespace: 'tenant', subject: 'alice' }],
  ['synthetic-bob', { namespace: 'tenant', subject: 'bob' }],
  ['synthetic-worker-a', { namespace: 'tenant', subject: 'worker-a' }],
  ['synthetic-worker-b', { namespace: 'tenant', subject: 'worker-b' }],
])
const coordinator = createWorkflowCoordinator({ store, artifacts,
  authenticate: async request => credentials.get(String(request.headers.authorization)),
  authorize: async () => true,
  workerAllowed: async principal => principal.subject.startsWith('worker-'),
})
const server = createServer(coordinator.handler)
await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
const address = server.address()
if (!address || typeof address === 'string') throw new Error('listener')
process.send?.({ type: 'ready', endpoint: 'http://127.0.0.1:' + address.port + '/v1/workflow', revision: staged.revision, controlPlaneTools: [] })
process.on('message', message => {
  if ((message as { type: string }).type === 'close') {
    server.closeAllConnections()
    server.close(() => { void store.close().then(() => process.exit(0)) })
  }
})
