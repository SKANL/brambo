import test from 'node:test'
import assert from 'node:assert/strict'
import {findMissingPackageDocs, findUnexpectedPackageDocs} from './docs-coverage.mjs'
import {validateDocsFixture} from './docs-validation-core.mjs'
import {validateDocVersions} from './doc-versions-core.mjs'

test('reports publishable packages without a reference page', () => {
  const packages = [
    {directory: 'session', name: '@brambodev/session', publishable: true},
    {directory: 'delegation', name: '@brambodev/delegation', publishable: true},
  ]

  assert.deepEqual(findMissingPackageDocs(packages, ['session']), [
    '@brambodev/delegation (expected docs/packages/delegation.md)',
  ])
})

test('does not require docs for private or non-publishable packages', () => {
  const packages = [
    {directory: 'session', name: '@brambodev/session', publishable: true},
    {directory: 'internal-tooling', name: '@brambodev/internal-tooling', publishable: false},
    {directory: 'private-helper', name: '@brambodev/private-helper', publishable: true, private: true},
  ]

  assert.deepEqual(findMissingPackageDocs(packages, ['session']), [])
})

test('reports an unexpected page for a private or non-publishable package', () => {
  assert.deepEqual(findUnexpectedPackageDocs([{directory:'secret',name:'@brambodev/secret',publishable:false}], ['secret']), [
    'docs/packages/secret.md (package is private or not publishable)',
  ])
})

test('reports a missing English package page', () => {
  assert.throws(() => validateDocsFixture({english: {}, spanish: {'packages/public.md': valid}, packages: []}), /missing English route/)
})

test('reports a missing Spanish route', () => {
  assert.throws(() => validateDocsFixture({english: {'guides/start.md': valid}, spanish: {}, packages: []}), /missing Spanish route/)
})

test('rejects malformed required frontmatter', () => {
  assert.throws(() => validateDocsFixture({english: {'guides/start.md': '---\ntitle: Start\n---\n# Start'}, spanish: {'guides/start.md': valid}, packages: []}), /Missing frontmatter field/)
})

test('accepts valid bilingual routes and ignores private packages', () => {
  assert.doesNotThrow(() => validateDocsFixture({
    english: {'packages/public.md': valid}, spanish: {'packages/public.md': valid},
    packages: [{directory:'public',name:'@brambodev/public',publishable:true},{directory:'internal',name:'@brambodev/internal',publishable:false}],
  }))
})

test('rejects a publishable package without a bilingual package page', () => {
  assert.throws(() => validateDocsFixture({
    english: {'guides/start.md': valid}, spanish: {'guides/start.md': valid},
    packages: [{directory:'session',name:'@brambodev/session',publishable:true}],
  }), /@brambodev\/session \(expected docs\/packages\/session\.md\)/)
})

const valid = '---\ntitle: Start\naudience: Developers\nprerequisites: Node\noutcome: Ready\nscope: Public API\ncompatibility: Node 20\ntranslationStatus: translated\n---\n# Start\n'

test('matches published version snapshot files to local tag content', () => {
  const source = {'docs-site/docs/guide.md':'guide', 'docs-site/i18n/es/docusaurus-plugin-content-docs/current/guide.md':'guia'}
  const snapshot = {'docs-site/versioned_docs/version-0.3.0/guide.md':'guide', 'docs-site/i18n/es/docusaurus-plugin-content-docs/version-0.3.0/guide.md':'guia'}
  assert.deepEqual(validateDocVersions({versions:['0.3.0'], tags:['v0.3.0'], tagFiles:{'0.3.0':source}, snapshots:{'0.3.0':snapshot}}), [])
})

test('reports missing tag and mismatched snapshot with paths; Next is not a release', () => {
  const errors = validateDocVersions({versions:['0.3.0','Next'], tags:[], tagFiles:{}, snapshots:{'0.3.0':{}}})
  assert.match(errors.join('\n'), /v0\.3\.0/)
  assert.match(errors.join('\n'), /Next.*not/i)
})

test('reports byte-different snapshot paths when a matching release tag exists', () => {
  const errors = validateDocVersions({versions:['0.3.0'], tags:['v0.3.0'], tagFiles:{'0.3.0':{'docs-site/docs/guide.md':'release'}}, snapshots:{'0.3.0':{'docs-site/versioned_docs/version-0.3.0/guide.md':'newer'}}})
  assert.match(errors.join('\n'), /versioned_docs\/version-0\.3\.0\/guide\.md/)
})

test('reports missing snapshot pages', () => {
  const errors = validateDocVersions({versions:['0.3.0'], tags:['v0.3.0'], tagFiles:{'0.3.0':{'docs-site/docs/guide.md':'guide'}}, snapshots:{'0.3.0':{}}})
  assert.match(errors.join('\n'), /docs-site\/docs\/guide\.md/)
})

test('rejects a release tag with no English or Spanish docs files', () => {
  const errors = validateDocVersions({versions:['0.3.0'], tags:['v0.3.0'], tagFiles:{'0.3.0':{}}, snapshots:{'0.3.0':{}}})
  assert.match(errors.join('\n'), /v0\.3\.0.*no documentation files/i)
})

test('compares snapshot bytes including invalid UTF-8 and newline differences', () => {
  const source = Buffer.from([0xff, 0x0a])
  const sameBytes = Buffer.from([0xff, 0x0a])
  const differentNewline = Buffer.from([0xff, 0x0d, 0x0a])
  const input = (snapshotBytes) => validateDocVersions({
    versions:['0.3.0'], tags:['v0.3.0'],
    tagFiles:{'0.3.0':{'docs-site/docs/guide.md':source}},
    snapshots:{'0.3.0':{'docs-site/versioned_docs/version-0.3.0/guide.md':snapshotBytes}},
  })
  assert.deepEqual(input(sameBytes), [])
  assert.match(input(differentNewline).join('\n'), /Snapshot mismatch/)
})
