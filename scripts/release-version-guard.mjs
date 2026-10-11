import { execFileSync } from 'node:child_process'
import { pathToFileURL } from 'node:url'

const SEMVER = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*)(?:\.(?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*))*))?(?:\+([0-9a-zA-Z-]+(?:\.[0-9a-zA-Z-]+)*))?$/
const SHA = /^[0-9a-f]{40}$/
const git = (...args) => execFileSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim()
const read = (commit, path) => git('show', `${commit}:${path}`)
const json = (commit, path) => JSON.parse(read(commit, path))

function versionParts(version) {
  const match = typeof version === 'string' ? SEMVER.exec(version) : null
  if (!match) throw new Error('release version is not semver')
  return { numbers: match.slice(1, 4).map(BigInt), prerelease: match[4]?.split('.') }
}

function compareVersions(current, previous) {
  const a = versionParts(current)
  const b = versionParts(previous)
  for (let index = 0; index < 3; index++) {
    if (a.numbers[index] !== b.numbers[index]) return a.numbers[index] > b.numbers[index] ? 1 : -1
  }
  if (!a.prerelease || !b.prerelease) return a.prerelease ? -1 : b.prerelease ? 1 : 0
  for (let index = 0; index < Math.max(a.prerelease.length, b.prerelease.length); index++) {
    const left = a.prerelease[index]
    const right = b.prerelease[index]
    if (left === undefined || right === undefined) return left === undefined ? -1 : 1
    if (left === right) continue
    const leftNumeric = /^\d+$/.test(left)
    const rightNumeric = /^\d+$/.test(right)
    if (leftNumeric && rightNumeric) return BigInt(left) > BigInt(right) ? 1 : -1
    if (leftNumeric !== rightNumeric) return leftNumeric ? -1 : 1
    return left > right ? 1 : -1
  }
  return 0
}

function packageVersion(commit) {
  const roster = json(commit, 'scripts/publishable-packages.json')
  const fixed = json(commit, '.changeset/config.json').fixed
  if (!Array.isArray(roster) || roster.length === 0 || !roster.includes('contracts') || new Set(roster).size !== roster.length ||
      !roster.every(name => typeof name === 'string' && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(name))) {
    throw new Error('publishable package roster is invalid')
  }
  if (!Array.isArray(fixed) || fixed.length !== 1 || !Array.isArray(fixed[0])) throw new Error('fixed package set is invalid')
  const manifests = roster.map(name => json(commit, `packages/${name}/package.json`))
  const version = json(commit, 'packages/contracts/package.json').version
  versionParts(version)
  if (manifests.some((manifest, index) => manifest.name !== `@brambodev/${roster[index]}` ||
      manifest.private === true || manifest.version !== version)) throw new Error('publishable package versions disagree')
  const publicNames = git('ls-tree', '-r', '--name-only', commit, '--', 'packages').split('\n')
    .filter(path => /^packages\/[^/]+\/package\.json$/.test(path))
    .map(path => json(commit, path)).filter(manifest => manifest.private !== true).map(manifest => manifest.name).sort()
  const names = manifests.map(manifest => manifest.name).sort()
  if (JSON.stringify(publicNames) !== JSON.stringify(names)) throw new Error('publishable manifests disagree with release roster')
  if (JSON.stringify([...fixed[0]].sort()) !== JSON.stringify(names)) throw new Error('fixed package set disagrees with publishable roster')
  const literals = [...read(commit, 'packages/contracts/src/index.ts').matchAll(/export const BRAMBO_VERSION = '([^']+)'/g)]
  if (literals.length !== 1 || literals[0][1] !== version) throw new Error('BRAMBO_VERSION disagrees with manifests')
  return version
}

/** Read immutable Git objects only: Changesets deliberately leaves a different working tree. */
export function releaseVersionDecision(commit, existingTag) {
  if (!SHA.test(commit ?? '')) throw new Error('an exact main-push commit SHA is required')
  if (git('rev-parse', '--verify', `${commit}^{commit}`) !== commit) throw new Error('main-push SHA must name a commit')
  const parent = git('rev-parse', '--verify', `${commit}^1`)
  const version = packageVersion(commit)
  const previous = json(parent, 'packages/contracts/package.json').version
  versionParts(previous)
  if (version === previous) return { ready: false, reason: 'unchanged', version, commit }
  if (compareVersions(version, previous) <= 0) throw new Error('release version must advance first-parent semver precedence')
  if (existingTag !== undefined) {
    if (!SHA.test(existingTag)) throw new Error('existing release tag must be an exact Git object SHA')
    if (git('rev-parse', '--verify', `${existingTag}^{commit}`) !== commit) throw new Error('existing release tag does not match the exact release commit')
    return { ready: false, reason: 'already-tagged', version, commit }
  }
  return { ready: true, reason: 'version-advanced', version, commit }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    console.log(JSON.stringify(releaseVersionDecision(process.argv[2] ?? process.env.GITHUB_SHA, process.argv[3])))
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  }
}
