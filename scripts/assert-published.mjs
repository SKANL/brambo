#!/usr/bin/env node
import {execFile} from 'node:child_process';
import {readdirSync, readFileSync} from 'node:fs';
import {join} from 'node:path';
import {promisify} from 'node:util';

const run = promisify(execFile);
const packagesDir = join(import.meta.dirname, '..', 'packages');
const targets = [];

for (const entry of readdirSync(packagesDir, {withFileTypes: true})) {
  if (!entry.isDirectory()) continue;
  try {
    const manifest = JSON.parse(readFileSync(join(packagesDir, entry.name, 'package.json'), 'utf8'));
    if (manifest.private !== true && typeof manifest.name === 'string' && typeof manifest.version === 'string') {
      targets.push({name: manifest.name, version: manifest.version});
    }
  } catch {
    continue;
  }
}

const missing = [];
for (const target of targets) {
  const spec = `${target.name}@${target.version}`;
  const {stdout} = await run('npm', ['view', spec, '--json'], {maxBuffer: 64 * 1024 * 1024})
    .catch((error) => ({stdout: typeof error?.stdout === 'string' ? error.stdout : ''}));
  try {
    const manifest = JSON.parse(stdout);
    if (manifest?.error?.code === 'E404') missing.push(`${spec}: not found on npm`);
    else if (manifest?.error) missing.push(`${spec}: npm returned ${manifest.error.code ?? 'an error'}`);
    else console.log(`published: ${spec}`);
  } catch {
    missing.push(`${spec}: npm returned invalid JSON`);
  }
}

if (missing.length > 0) {
  console.error(`\n${missing.length} package(s) were not published:`);
  for (const problem of missing) console.error(`  ${problem}`);
  process.exit(1);
}
console.log(`all ${targets.length} publishable packages are on npm`);
