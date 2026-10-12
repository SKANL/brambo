#!/usr/bin/env node
import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'

const exec = promisify(execFile)
const registry = 'https://registry.npmjs.org'

export function validateRegistryManifest(packument, expected) {
  assert.equal(packument.name, expected.name)
  assert.equal(packument['dist-tags']?.latest, expected.version)
  const manifest = packument.versions?.[expected.version]
  assert.equal(manifest?.name, expected.name)
  assert.equal(manifest?.version, expected.version)
  assert.match(manifest.dist?.integrity ?? '', /^sha512-[A-Za-z0-9+/]+={0,2}$/)
  assert.equal(new URL(manifest.dist.tarball).origin, registry)
  return manifest
}

export async function readRegistry(name, options = {}) {
  const query = options.query ?? (async () => {
    const response = await fetch(`${registry}/${encodeURIComponent(name)}?finalize=${Date.now()}`, {
      headers: { 'cache-control': 'no-cache' }, signal: AbortSignal.timeout(30000),
    })
    if (!response.ok) throw new Error(`${name}: HTTP ${response.status}`)
    return response.json()
  })
  const sleep = options.sleep ?? (delay => new Promise(resolve => setTimeout(resolve, delay)))
  const attempts = options.attempts ?? 4
  for (let attempt = 1; ; attempt++) {
    try { return await query() } catch (error) {
      if (attempt >= attempts) throw error
      await sleep(attempt * 2000)
    }
  }
}

async function main(tag) {
  assert.match(tag ?? '', /^v\d+\.\d+\.\d+$/)
  const version = tag.slice(1)
  const dirs = JSON.parse(await readFile('scripts/publishable-packages.json', 'utf8'))
  assert.equal(dirs.length, 28)
  const manifests = await Promise.all(dirs.map(async dir => {
    const expected = JSON.parse(await readFile(`packages/${dir}/package.json`, 'utf8'))
    assert.notEqual(expected.private, true)
    assert.equal(expected.version, version)
    const manifest = validateRegistryManifest(await readRegistry(expected.name), expected)
    const response = await fetch(manifest.dist.tarball, { signal: AbortSignal.timeout(60000) })
    assert.ok(response.ok, `${expected.name}: tarball HTTP ${response.status}`)
    const bytes = Buffer.from(await response.arrayBuffer())
    assert.equal(`sha512-${createHash('sha512').update(bytes).digest('base64')}`, manifest.dist.integrity)
    console.log(`registry identity/latest/integrity verified: ${manifest.name}@${version}`)
    return manifest
  }))
  const destination = await mkdtemp(join(tmpdir(), 'brambo-registry-finalize-'))
  const dependencies = Object.fromEntries(manifests.map(m => [m.name, m.dist.tarball]))
  await writeFile(join(destination, 'package.json'), JSON.stringify({ private: true, type: 'module', dependencies }))
  await exec(process.platform === 'win32' ? 'npm.cmd' : 'npm', [
    'install', '--ignore-scripts', '--no-audit', '--no-fund', '--registry', registry,
    '--cache', join(destination, 'cache'),
  ], { cwd: destination, shell: process.platform === 'win32', maxBuffer: 16 * 1024 * 1024, windowsHide: true })
  const lock = JSON.parse(await readFile(join(destination, 'package-lock.json'), 'utf8'))
  for (const manifest of manifests) {
    const installed = JSON.parse(await readFile(join(destination, 'node_modules', manifest.name, 'package.json'), 'utf8'))
    assert.equal(installed.name, manifest.name)
    assert.equal(installed.version, version)
    assert.equal(lock.packages[`node_modules/${manifest.name}`].integrity, manifest.dist.integrity)
  }
  const smoke = `for (const name of ${JSON.stringify(manifests.map(m => m.name))}) await import(name); console.log('all 28 registry imports passed')`
  await writeFile(join(destination, 'smoke.mjs'), smoke)
  const { stdout } = await exec(process.execPath, ['smoke.mjs'], { cwd: destination })
  console.log(stdout.trim())
  const cli = await exec(process.execPath, ['node_modules/@brambodev/cli/dist/bin/brambo.js', '--version'], { cwd: destination })
  assert.ok(cli.stdout.includes(version), cli.stdout)
  console.log(`All 28 public registry installations verified; CLI ${version}. Evidence: ${destination}`)
}

if (import.meta.main) await main(process.argv[2])
