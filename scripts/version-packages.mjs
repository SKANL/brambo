import {readFileSync, writeFileSync} from 'node:fs'
import {execFileSync} from 'node:child_process'

const changesets = process.platform === 'win32' ? 'node_modules/.bin/changeset.cmd' : 'node_modules/.bin/changeset'
execFileSync(changesets, ['version'], {stdio: 'inherit'})
const manifest = JSON.parse(readFileSync('packages/contracts/package.json', 'utf8'))
const file = 'packages/contracts/src/index.ts'
const source = readFileSync(file, 'utf8')
const updated = source.replace(/export const PANDA_VERSION = '[^']+'/, `export const PANDA_VERSION = '${manifest.version}'`)
if (updated === source) throw new Error('Could not update PANDA_VERSION')
writeFileSync(file, updated)
