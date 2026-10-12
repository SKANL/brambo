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

// Voseo (Rioplatense) forms rejected in the neutral Spanish mirror. Accented words cannot use `\b`
// (an accented letter is not a JS "word" character), so boundaries are Unicode-letter lookarounds.
// ponytail: explicit word list, not a morphology rule; a generic "-á/-é/-í" rule would flag
// neutral futures and adverbs (será, podrá, aquí, también). Extend the list when a new form slips through.
const VOSEO_WORDS = [
  'vos', 'vosotros', 'vosotras', 'sos',
  // present indicative
  'tenés', 'podés', 'querés', 'sabés', 'hacés', 'ponés', 'conocés', 'necesitás', 'usás', 'ejecutás', 'instalás', 'creás', 'pasás',
  'decís', 'elegís', 'escribís', 'venís', 'seguís', 'preferís',
  // -ar imperatives
  'usá', 'ejecutá', 'instalá', 'creá', 'empezá', 'pasá', 'reportá', 'tomá', 'mirá', 'configurá', 'agregá', 'borrá', 'revisá', 'probá',
  'cambiá', 'llamá', 'registrá', 'guardá', 'cargá', 'copiá', 'pegá', 'buscá', 'dejá', 'esperá', 'activá', 'desactivá', 'importá',
  'exportá', 'actualizá', 'verificá', 'comprobá', 'validá', 'ajustá', 'consultá', 'implementá', 'evitá', 'pensá', 'fijá', 'asegurá',
  // -er/-ir imperatives
  'hacé', 'poné', 'mantené', 'tené', 'leé', 'corré', 'volvé', 'resolvé', 'devolvé', 'protegé', 'escogé', 'definí', 'escribí', 'elegí',
  'incluí', 'restringí', 'abrí', 'seguí', 'decidí', 'añadí', 'decí', 'vení', 'salí',
  // enclitic imperatives
  'fijate', 'asegurate', 'acordate', 'decime', 'avisame', 'mandame', 'probalo', 'etiquetala', 'usalo', 'instalalo', 'configuralo',
]
const VOSEO = new RegExp(String.raw`(?<!\p{L})(${VOSEO_WORDS.join('|')})(?!\p{L})`, 'iu')

/** Returns the first voseo form found in `text`, or undefined. */
export function findVoseo(text) {
  return text.match(VOSEO)?.[0]
}
