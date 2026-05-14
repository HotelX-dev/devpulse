/**
 * Writes public/version.json for deploy / cache-bust checks.
 * Prefers GITHUB_SHA (GitHub Actions), then VITE_BUILD_ID, then git HEAD, else "dev".
 */
import { execSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

let build =
  (process.env.GITHUB_SHA && String(process.env.GITHUB_SHA).trim()) ||
  (process.env.VITE_BUILD_ID && String(process.env.VITE_BUILD_ID).trim()) ||
  '';

if (!build) {
  try {
    build = execSync('git rev-parse HEAD', { encoding: 'utf8', cwd: root }).trim();
  } catch {
    build = 'dev';
  }
}

const outDir = join(root, 'public');
mkdirSync(outDir, { recursive: true });
const file = join(outDir, 'version.json');
writeFileSync(file, `${JSON.stringify({ build }, null, 0)}\n`, 'utf8');
console.log('[write-version]', build.slice(0, 7), '→', file);
