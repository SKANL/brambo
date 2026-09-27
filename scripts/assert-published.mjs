#!/usr/bin/env node
import {execFile} from 'node:child_process';
import {readdirSync, readFileSync} from 'node:fs';
import {join} from 'node:path';
import {promisify} from 'node:util';

const run = promisify(execFile);

export async function waitForPublished(spec, options = {}) {
  const maxAttempts = options.maxAttempts ?? 8;
  const delays = options.delays ?? [1000, 2000, 4000, 8000, 10000, 10000, 10000];
  const query = options.query ?? (async () => {
    const {stdout} = await run('npm', ['view', spec, '--json'], {maxBuffer: 64 * 1024 * 1024});
    return stdout;
  });
  const sleep = options.sleep ?? ((delay) => new Promise((resolve) => setTimeout(resolve, delay)));

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const stdout = await query().catch((error) => (typeof error?.stdout === 'string' ? error.stdout : ''));
    try {
      const manifest = JSON.parse(stdout);
      if (!manifest?.error && manifest) return {published: true, attempts: attempt};
    } catch {
      // npm may return an empty or transient response while the package propagates.
    }
    if (attempt < maxAttempts) await sleep(delays[Math.min(attempt - 1, delays.length - 1)]);
  }
  return {published: false, attempts: maxAttempts};
}

async function main() {
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
    const result = await waitForPublished(spec);
    if (result.published) console.log(`published: ${spec}`);
    else missing.push(`${spec}: not visible on npm after ${result.attempts} attempts`);
  }
  if (missing.length > 0) {
    console.error(`\n${missing.length} package(s) were not published:`);
    for (const problem of missing) console.error(`  ${problem}`);
    process.exit(1);
  }
  console.log(`all ${targets.length} publishable packages are on npm`);
}

if (import.meta.main) await main();
