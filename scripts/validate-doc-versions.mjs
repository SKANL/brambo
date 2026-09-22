import {execFileSync} from 'node:child_process'
import {readFileSync, readdirSync, statSync} from 'node:fs'
import {join, relative, resolve} from 'node:path'
import {validateDocVersions} from './doc-versions-core.mjs'

const root = resolve(import.meta.dirname, '..')
const docsRoot = join(root, 'docs-site')
const versions = JSON.parse(readFileSync(join(docsRoot, 'versions.json'), 'utf8'))
const tags = execFileSync('git', ['tag', '--list', 'v*'], {cwd: root, encoding: 'utf8'}).trim().split(/\r?\n/).filter(Boolean)
const sourcePaths = ['docs-site/docs', 'docs-site/i18n/es/docusaurus-plugin-content-docs/current']

function gitFiles(tag) {
  const paths = execFileSync('git', ['ls-tree', '-r', '--name-only', tag, '--', ...sourcePaths], {cwd: root, encoding: 'utf8'})
    .trim().split(/\r?\n/).filter(Boolean)
  return Object.fromEntries(paths.map((path) => [path, execFileSync('git', ['show', `${tag}:${path}`], {cwd: root})]))
}

function walkFiles(directory) {
  if (!statSync(directory, {throwIfNoEntry: false})?.isDirectory()) return []
  return readdirSync(directory, {withFileTypes: true}).flatMap((entry) => {
    const path = join(directory, entry.name)
    return entry.isDirectory() ? walkFiles(path) : [path]
  })
}

const tagFiles = {}
const snapshots = {}
for (const version of versions) {
  if (version === 'Next') continue
  const tag = `v${version}`
  if (!tags.includes(tag)) continue
  tagFiles[version] = gitFiles(tag)
  const snapshotRoots = [
    join(docsRoot, 'versioned_docs', `version-${version}`),
    join(docsRoot, 'i18n', 'es', 'docusaurus-plugin-content-docs', `version-${version}`),
  ]
  snapshots[version] = Object.fromEntries(snapshotRoots.flatMap(walkFiles).map((path) => [relative(root, path).replaceAll('\\', '/'), readFileSync(path)]))
}

const errors = validateDocVersions({versions, tags, tagFiles, snapshots})
if (errors.length > 0) {
  console.error(`Documentation release snapshot validation failed:\n- ${errors.join('\n- ')}`)
  process.exitCode = 1
} else {
  console.log(`Documentation snapshots match local release tags: ${versions.join(', ')}`)
}
