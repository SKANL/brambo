import { spawn } from 'node:child_process'
import { mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

const repoRoot = join(import.meta.dirname, '..', '..', '..')
const temporaryRoot = await mkdtemp(join(tmpdir(), 'brambo-adapter-api-consumer-'))
let setupError: string | undefined

interface CommandResult { readonly code: number | null; readonly output: string }
interface PackageManifest { readonly name: string; readonly version: string; readonly dependencies?: Readonly<Record<string, string>> }

function run(command: string, args: readonly string[], cwd: string): Promise<CommandResult> {
  return new Promise((resolve) => {
    const child = spawn([command, ...args].map((value) => /\s/.test(value) ? `"${value}"` : value).join(' '), {
      cwd,
      shell: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    let output = ''
    child.stdout?.on('data', (chunk: Buffer) => { output += chunk.toString() })
    child.stderr?.on('data', (chunk: Buffer) => { output += chunk.toString() })
    child.on('close', (code) => resolve({ code, output }))
    child.on('error', (error) => resolve({ code: null, output: `${output}${String(error)}` }))
  })
}

function tarballName(manifest: PackageManifest): string {
  return `${manifest.name.replace('@', '').replace('/', '-')}-${manifest.version}.tgz`
}

async function runtimeClosure(): Promise<readonly [string, PackageManifest][]> {
  const packageDirs = [
    'adapter-api',
    ...(JSON.parse(await readFile(join(repoRoot, 'scripts', 'publishable-packages.json'), 'utf8')) as readonly string[]),
  ]
  const manifests = new Map<string, [string, PackageManifest]>()
  for (const directory of packageDirs) {
    const manifest = JSON.parse(await readFile(join(repoRoot, 'packages', directory, 'package.json'), 'utf8')) as PackageManifest
    manifests.set(manifest.name, [directory, manifest])
  }

  const selected = new Map<string, [string, PackageManifest]>()
  const visit = (name: string): void => {
    if (selected.has(name)) return
    const entry = manifests.get(name)
    if (entry === undefined) return
    selected.set(name, entry)
    for (const dependency of Object.keys(entry[1].dependencies ?? {})) visit(dependency)
  }
  visit('@brambodev/adapter-api')
  return [...selected.values()]
}

describe('packed @brambodev/adapter-api testing consumer', () => {
  beforeAll(async () => {
    const closure = await runtimeClosure()
    for (const [directory] of closure) {
      const packed = await run('pnpm', ['pack', '--pack-destination', temporaryRoot], join(repoRoot, 'packages', directory))
      if (packed.code !== 0) {
        setupError = `packing ${directory} failed:\n${packed.output}`
        return
      }
    }

    const dependencies = Object.fromEntries(closure.map(([, manifest]) => [
      manifest.name,
      `file:${join(temporaryRoot, tarballName(manifest)).replaceAll('\\', '/')}`,
    ]))
    const consumerManifest = {
      name: 'adapter-api-consumer',
      version: '0.0.0',
      private: true,
      type: 'module',
      dependencies,
      devDependencies: {
        vitest: `file:${(await realpath(join(repoRoot, 'packages', 'adapter-api', 'node_modules', 'vitest'))).replaceAll('\\', '/')}`,
        typescript: `file:${(await realpath(join(repoRoot, 'packages', 'adapter-api', 'node_modules', 'typescript'))).replaceAll('\\', '/')}`,
      },
    }
    await writeFile(join(temporaryRoot, 'package.json'), `${JSON.stringify(consumerManifest, null, 2)}\n`, 'utf8')
    const installed = await run('npm', ['install', '--offline', '--ignore-scripts'], temporaryRoot)
    if (installed.code !== 0) setupError = `offline consumer install failed:\n${installed.output}`
  }, 300_000)

  afterAll(async () => { await rm(temporaryRoot, { recursive: true, force: true }) })

  it('runs the conformance suite and resolves its public declarations from packed tarballs', async () => {
    expect(setupError).toBeUndefined()
    await writeFile(join(temporaryRoot, 'consumer.test.ts'), await readFile(join(import.meta.dirname, 'consumer-conformance.fixture.ts'), 'utf8'), 'utf8')
    await writeFile(join(temporaryRoot, 'tsconfig.json'), JSON.stringify({
      compilerOptions: { module: 'NodeNext', moduleResolution: 'NodeNext', target: 'ES2022', strict: true, noEmit: true, skipLibCheck: true },
      include: ['consumer.test.ts'],
    }), 'utf8')
    const declarations = await run(join('node_modules', '.bin', 'tsc'), ['--noEmit'], temporaryRoot)
    expect(declarations.code, declarations.output).toBe(0)
    const imported = await run(join('node_modules', '.bin', 'vitest'), ['run', 'consumer.test.ts'], temporaryRoot)
    expect(imported.code, imported.output).toBe(0)
  })
})
