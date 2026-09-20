import {execFileSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
import {join, resolve} from 'node:path';

const root = resolve(import.meta.dirname, '..');
const packageDirs = JSON.parse(readFileSync(join(root, 'scripts', 'publishable-packages.json'), 'utf8'));

execFileSync(process.execPath, [join(root, 'scripts', 'validate-api-docs.mjs')], {cwd: root, stdio: 'inherit'});
execFileSync(process.execPath, [join(root, 'node_modules', 'typedoc', 'dist', 'cli.js'), '--options', 'typedoc.json'], {
  cwd: root,
  stdio: 'inherit',
});

console.log(`Generated TypeDoc API reference for ${packageDirs.length} publishable packages under docs-site/static/api`);
