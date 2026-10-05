import { spawnSync } from 'node:child_process'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

const root = resolve(import.meta.dirname, '..')

export async function typecheckOrchestrationExamples(examples) {
  if (examples.length === 0) throw new Error('No orchestration examples found')
  // Disposable files live beside installed type packages, never in published src.
  const directory = await mkdtemp(join(root, 'packages', 'contracts', 'node_modules', '.orchestration-examples-'))
  try {
    const files = []
    for (const [index, source] of examples.entries()) {
      const file = join(directory, `${index}.ts`)
      await writeFile(file, `export {}\n${source}\n`, 'utf8')
      files.push(file)
    }
    const packages = JSON.parse(await readFile(join(root, 'scripts', 'publishable-packages.json'), 'utf8'))
    const paths = Object.fromEntries(packages.map(name => [`@brambodev/${name}`, [join(root, 'packages', name, 'src', 'index.ts')]]))
    const config = join(directory, 'tsconfig.json')
    await writeFile(config, JSON.stringify({ extends: join(root, 'tsconfig.base.json'), files, include: [],
      compilerOptions: { paths, typeRoots: [join(root, 'packages', 'contracts', 'node_modules', '@types')] },
    }), 'utf8')
    const windows = process.platform === 'win32'
    const compiler = join(root, 'packages', 'contracts', 'node_modules', '.bin', windows ? 'tsc.CMD' : 'tsc')
    const command = windows ? process.env.ComSpec ?? 'cmd.exe' : compiler
    const args = windows ? ['/d', '/s', '/c', `""${compiler}" --noEmit -p "${config}""`] : ['--noEmit', '-p', config]
    const result = spawnSync(command, args, { cwd: root, encoding: 'utf8', windowsHide: true,
      windowsVerbatimArguments: windows, timeout: 120_000 })
    if (result.status !== 0) throw new Error(`Orchestration example typecheck failed:\n${result.stdout ?? ''}${result.stderr ?? ''}${result.error ?? ''}`)
  } finally { await rm(directory, { recursive: true, force: true, maxRetries: 3 }) }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const examples = []
  for (const name of ['durable-orchestration', 'remote-orchestration', 'custom-drivers-and-tools']) {
    const source = await readFile(join(root, 'docs-site', 'docs', 'guides', `${name}.md`), 'utf8')
    examples.push(...[...source.matchAll(/```ts\r?\n([\s\S]*?)```/g)].map(match => match[1]))
  }
  await typecheckOrchestrationExamples(examples)
  console.log(`Orchestration examples: ${examples.length} typechecked host fragments; not deployment proof`)
}
