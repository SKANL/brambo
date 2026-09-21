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
  let published = false;
  for (let attempt = 1; attempt <= 6; attempt += 1) {
    const {stdout} = await run('npm', ['view', spec, '--json'], {maxBuffer: 64 * 1024 * 1024})
      .catch((error) => ({stdout: typeof error?.stdout === 'string' ? error.stdout : ''}));
    try {
      const manifest = JSON.parse(stdout);
      if (!manifest?.error && manifest) {
        console.log(`published: ${spec}`);
        published = true;
        break;
      }
    } catch {}
    if (attempt < 6) await new Promise((resolve) => setTimeout(resolve, 5000));
  }
  if (!published) {
    missing.push(`${spec}: not visible on npm after 6 attempts`);
  }
}

if (missing.length > 0) {
  console.error(`\n${missing.length} package(s) were not published:`);
  for (const problem of missing) console.error(`  ${problem}`);
  process.exit(1);
}
console.log(`all ${targets.length} publishable packages are on npm`);
