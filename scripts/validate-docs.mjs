import {readdirSync, readFileSync} from 'node:fs';
import {join, relative} from 'node:path';
import {fileURLToPath} from 'node:url';
import {validateDocsFixture} from './docs-validation-core.mjs';

const root = fileURLToPath(new URL('../docs-site/', import.meta.url));
const docs = join(root, 'docs');
const es = join(root, 'i18n', 'es', 'docusaurus-plugin-content-docs', 'current');
const repositoryRoot = fileURLToPath(new URL('../', import.meta.url));
const packageDirectories = JSON.parse(readFileSync(join(repositoryRoot, 'scripts', 'publishable-packages.json'), 'utf8'));
const required = ['title', 'audience', 'prerequisites', 'outcome', 'scope', 'compatibility', 'translationStatus'];
const regionalisms = [
  /\bvos\b/i,
  /\b(vosotros|vosotras)\b/i,
  /\b(querés|podés|tenés|necesitás|usá|ejecutá|instalá|creá|mantené|empezá|pasá|leé|incluí|restringí|reportá)\b/i,
];

function walk(dir) {
  return readdirSync(dir, {withFileTypes: true}).flatMap((entry) =>
    entry.isDirectory() ? walk(join(dir, entry.name)) : entry.name.endsWith('.md') ? [join(dir, entry.name)] : [],
  );
}

function route(file, base) {
  return relative(base, file).replaceAll('\\', '/');
}

function parseFrontmatter(file) {
  const text = readFileSync(file, 'utf8').replace(/^\uFEFF/, '');
  const match = text.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
  if (!match) throw new Error(`Missing frontmatter: ${file}`);
  const values = new Map();
  for (const line of match[1].split(/\r?\n/)) {
    const field = line.match(/^([A-Za-z][\w-]*):\s*(.*?)\s*$/);
    if (field) values.set(field[1], field[2]);
  }
  for (const field of required) {
    if (!values.has(field) || values.get(field) === '') throw new Error(`Missing frontmatter field '${field}': ${file}`);
  }
  return {text, values};
}

function structure(text) {
  const body = text.replace(/^---\r?\n[\s\S]*?\r?\n---(?:\r?\n|$)/, '');
  const headings = [...body.matchAll(/^#{1,6}\s+(.+?)\s*#*\s*$/gm)].map((match) => `${match[0].match(/^#+/)[0].length}:${match[1].trim()}`);
  const fences = [...body.matchAll(/^\s*(```+|~~~+)([^\n]*)$/gm)].map((match) => `${match[1][0]}:${match[2].trim()}`);
  return {headings, fences};
}

function prose(text) {
  return text
    .replace(/^---\r?\n[\s\S]*?\r?\n---(?:\r?\n|$)/, '')
    .replace(/^\s*(```+|~~~+)[\s\S]*?^\s*\1\s*$/gm, '');
}

const englishFiles = walk(docs);
const spanishFiles = walk(es);
const routes = englishFiles.map((file) => route(file, docs)).sort();
const translations = spanishFiles.map((file) => route(file, es)).sort();
if (routes.join('\n') !== translations.join('\n')) throw new Error(`Spanish docs must mirror every English route. English=${routes.length}, Spanish=${translations.length}`);

const publishablePackages = packageDirectories.map((directory) => {
  const manifest = JSON.parse(readFileSync(join(repositoryRoot, 'packages', directory, 'package.json'), 'utf8'));
  return {directory, name: manifest.name, publishable: manifest.private !== true};
});
validateDocsFixture({
  english: Object.fromEntries(routes.map((route) => [route, readFileSync(join(docs, route), 'utf8')])),
  spanish: Object.fromEntries(translations.map((route) => [route, readFileSync(join(es, route), 'utf8')])),
  packages: publishablePackages,
});

for (const file of englishFiles.concat(spanishFiles)) parseFrontmatter(file);
for (const file of spanishFiles) {
  const match = regionalisms.find((pattern) => pattern.test(prose(readFileSync(file, 'utf8'))));
  if (match) throw new Error(`Regional Spanish detected (${match}): ${file}`);
}
for (const relativeRoute of routes) {
  const english = parseFrontmatter(join(docs, relativeRoute));
  const spanish = parseFrontmatter(join(es, relativeRoute));
  if (spanish.text.includes('Sección adicional')) throw new Error(`Placeholder heading remains in Spanish translation: ${relativeRoute}`);
  const left = structure(english.text);
  const right = structure(spanish.text);
  if (left.headings.length !== right.headings.length || left.headings.map((value) => value.split(':')[0]).join() !== right.headings.map((value) => value.split(':')[0]).join()) {
    throw new Error(`Heading structure mismatch: ${relativeRoute}`);
  }
  if (left.fences.join('\n') !== right.fences.join('\n')) throw new Error(`Code fence structure mismatch: ${relativeRoute}`);
}
console.log(`docs routes: ${routes.length} English + ${translations.length} Spanish; frontmatter and structure valid`);
