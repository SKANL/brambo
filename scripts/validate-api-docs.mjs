import {readFileSync, existsSync} from 'node:fs';
import {join, resolve} from 'node:path';

const root = resolve(import.meta.dirname, '..');
const packageDirs = JSON.parse(readFileSync(join(root, 'scripts', 'publishable-packages.json'), 'utf8'));
const missing = [];

for (const packageDir of packageDirs) {
  const packageRoot = join(root, 'packages', packageDir);
  const manifestPath = join(packageRoot, 'package.json');
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  const rootExport = manifest.exports?.['.'] ?? manifest.exports;
  const sourceEntry = typeof rootExport === 'string' ? rootExport : rootExport?.['brambo-source'];
  const entryPath = sourceEntry?.startsWith('./') ? join(packageRoot, sourceEntry) : undefined;

  if (!entryPath || !existsSync(entryPath)) {
    missing.push(`${manifest.name}: ${sourceEntry ?? 'exports["."]["brambo-source"]'} (missing source entrypoint)`);
  }
}

if (missing.length > 0) {
  throw new Error(`Publishable packages without a TypeDoc API entrypoint:\n- ${missing.join('\n- ')}`);
}

console.log(`API entrypoints valid: ${packageDirs.length} publishable packages`);
