import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { openSqliteRunStore } from '../packages/workflow-store-sqlite/src/index.ts'

const [major, minor] = process.versions.node.split('.').map(Number)
assert.ok(major < 24 || major === 24 && minor < 15, 'refusal contract requires an unsupported SQLite runtime')
const directory = await mkdtemp(join(tmpdir(), 'brambo-sqlite-unavailable-'))
const path = join(directory, 'store.sqlite')
try {
  await assert.rejects(openSqliteRunStore({ path }), { code: 'BRAMBO_WORKFLOW_STORE_UNAVAILABLE' })
  assert.equal(existsSync(path), false, 'unsupported runtime must not create persistence state')
} finally {
  await rm(directory, { recursive: true, force: true })
}
