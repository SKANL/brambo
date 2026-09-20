import {existsSync, readFileSync, readdirSync} from 'node:fs';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const errors = [];
const required = (file, label = file) => { if (!existsSync(join(root, file))) errors.push(`Missing ${label}: ${file}`); };
const parseJson = (file) => { try { return JSON.parse(readFileSync(join(root, file), 'utf8')); } catch (error) { errors.push(`Invalid JSON ${file}: ${error.message}`); return undefined; } };
const workflows = existsSync(join(root, '.github/workflows'))
  ? readdirSync(join(root, '.github/workflows')).filter((file) => /\.ya?ml$/.test(file))
  : [];

required('.github/CODEOWNERS');
required('CITATION.cff');
required('.changeset/config.json');
for (const file of ['.github/ISSUE_TEMPLATE/bug_report.yml', '.github/ISSUE_TEMPLATE/feature_request.yml', '.github/ISSUE_TEMPLATE/config.yml', '.github/DISCUSSION_TEMPLATE/ideas.yml']) required(file);

const codeowners = existsSync(join(root, '.github/CODEOWNERS')) ? readFileSync(join(root, '.github/CODEOWNERS'), 'utf8') : '';
if (codeowners && !codeowners.split(/\r?\n/).some((line) => line.trim() && !line.trim().startsWith('#') && line.trim().startsWith('* '))) errors.push('CODEOWNERS must define a default * owner');
const citation = existsSync(join(root, 'CITATION.cff')) ? readFileSync(join(root, 'CITATION.cff'), 'utf8') : '';
for (const field of ['cff-version:', 'title:', 'authors:', 'repository-code:', 'license:']) if (!new RegExp(`^${field}`, 'm').test(citation)) errors.push(`CITATION.cff missing ${field.replace(':', '')}`);
const changeset = parseJson('.changeset/config.json');
if (changeset) {
  if (changeset.access !== 'public') errors.push('.changeset/config.json must keep public access');
  if (!Array.isArray(changeset.fixed) || changeset.fixed.length === 0) errors.push('.changeset/config.json must define fixed package groups');
  if (changeset.ignore?.includes('panda-docs') !== true) errors.push('.changeset/config.json must ignore panda-docs');
}
for (const directory of ['.github/ISSUE_TEMPLATE', '.github/DISCUSSION_TEMPLATE']) {
  if (existsSync(join(root, directory)) && readdirSync(join(root, directory)).every((file) => !file.endsWith('.yml') && !file.endsWith('.yaml'))) errors.push(`${directory} must contain YAML templates`);
}
for (const file of workflows) {
  const workflow = readFileSync(join(root, '.github/workflows', file), 'utf8');
  if (!/^permissions:/m.test(workflow)) errors.push(`${file} must declare top-level permissions`);
  for (const match of workflow.matchAll(/^\s*(?:-\s*)?uses:\s*([^\s#]+).*$/gm)) {
    const reference = match[1];
    if (!reference.includes('@') || !/[0-9a-f]{40}$/i.test(reference.split('@').at(-1))) {
      errors.push(`${file} contains an action that is not pinned to a full commit SHA: ${reference}`);
    }
  }
}
if (errors.length) { console.error(errors.map((error) => `- ${error}`).join('\n')); process.exitCode = 1; }
else console.log('GitHub metadata, community templates, citation, and changeset configuration valid');
