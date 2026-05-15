import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const __dirname = dirname(fileURLToPath(import.meta.url));

/** GitHub project pages live at /<repo>/; set VITE_BASE_PATH in CI (see .github/workflows). */
function normalizeBase(raw: string | undefined): string {
  if (!raw?.trim()) return '/';
  const withLeading = raw.startsWith('/') ? raw : `/${raw}`;
  return withLeading.endsWith('/') ? withLeading : `${withLeading}/`;
}
const base = normalizeBase(process.env.VITE_BASE_PATH);

/** Must match `public/version.json` after `prebuild` (`scripts/write-version.mjs`). */
function readAppBuildId(): string {
  const p = join(__dirname, 'public', 'version.json');
  if (!existsSync(p)) return 'dev';
  try {
    const j = JSON.parse(readFileSync(p, 'utf8')) as { build?: unknown };
    return typeof j.build === 'string' && j.build ? j.build : 'dev';
  } catch {
    return 'dev';
  }
}

export default defineConfig({
  base,
  plugins: [react()],
  define: {
    __APP_BUILD_ID__: JSON.stringify(readAppBuildId()),
  },
});
