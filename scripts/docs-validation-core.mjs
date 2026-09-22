import {findMissingPackageDocs, findUnexpectedPackageDocs} from './docs-coverage.mjs'

const required = ['title', 'audience', 'prerequisites', 'outcome', 'scope', 'compatibility', 'translationStatus']

export function validateDocsFixture({english, spanish, packages}) {
  const errors = []
  const enRoutes = Object.keys(english).sort()
  const esRoutes = Object.keys(spanish).sort()
  for (const route of enRoutes.filter((value) => !Object.hasOwn(spanish, value))) errors.push(`missing Spanish route: ${route}`)
  for (const route of esRoutes.filter((value) => !Object.hasOwn(english, value))) errors.push(`missing English route: ${route}`)
  for (const [locale, contents] of [['English', english], ['Spanish', spanish]]) {
    for (const [route, text] of Object.entries(contents)) {
      const match = text.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/)
      if (!match) { errors.push(`missing frontmatter: ${locale} ${route}`); continue }
      const fields = new Map(match[1].split(/\r?\n/).flatMap((line) => {
        const entry = line.match(/^([A-Za-z][\w-]*):\s*(.*?)\s*$/)
        return entry ? [[entry[1], entry[2]]] : []
      }))
      for (const field of required) if (!fields.get(field)) errors.push(`Missing frontmatter field '${field}': ${locale} ${route}`)
    }
  }
  const documented = enRoutes.filter((route) => route.startsWith('packages/')).map((route) => route.slice('packages/'.length, -3))
  errors.push(...findMissingPackageDocs(packages, documented))
  errors.push(...findUnexpectedPackageDocs(packages, documented))
  if (errors.length) throw new Error(errors.join('\n'))
}
