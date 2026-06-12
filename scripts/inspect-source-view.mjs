/**
 * READ-ONLY probe for the source ticket view.
 *
 * Connects to the external Postgres (SOURCE_DB_URL) from THIS machine — so it
 * only works from a network the source DB allows (e.g. the office network).
 * It runs SELECTs only: a row count, the column list, a few sample rows, and a
 * per-product breakdown. It never writes anything, and never touches Supabase.
 *
 * Usage (from the office network):
 *   1. Put the connection string in .env.local (gitignored):
 *        SOURCE_DB_URL=postgres://USER:PASSWORD@119.8.185.60:1029/DBNAME
 *   2. node scripts/inspect-source-view.mjs
 *
 * Optional env overrides:
 *   VIEW=issue.view_issues_v1   SAMPLE=5
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import postgres from 'postgres';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

// Tiny .env loader (no extra dependency). Later files do not override earlier.
for (const name of ['.env.local', '.env']) {
  try {
    const text = readFileSync(join(root, name), 'utf8');
    for (const line of text.split(/\r?\n/)) {
      const m = line.match(/^\s*([\w.]+)\s*=\s*(.*)\s*$/);
      if (!m || line.trimStart().startsWith('#')) continue;
      const key = m[1];
      let val = m[2];
      if (/^".*"$/.test(val) || /^'.*'$/.test(val)) val = val.slice(1, -1);
      if (!(key in process.env)) process.env[key] = val;
    }
  } catch { /* file may not exist */ }
}

const VIEW = process.env.VIEW || 'issue.view_issues_v2';
const SAMPLE = Number(process.env.SAMPLE || 5);

const host = process.env.SOURCE_DB_HOST;
if (!host) {
  console.error(
    '\n✗ SOURCE_DB_HOST is not set.\n' +
    '  Add the SOURCE_DB_* values to .env.local (gitignored):\n' +
    '    SOURCE_DB_HOST=119.8.185.60\n    SOURCE_DB_PORT=1029\n' +
    '    SOURCE_DB_NAME=ifcax\n    SOURCE_DB_USER=...\n    SOURCE_DB_PASSWORD=...\n'
  );
  process.exit(1);
}

// Encrypted but tolerant of a self-signed cert, matching the Edge Function.
// connect_timeout fails fast (15s) instead of hanging if the IP is blocked.
const sql = postgres({
  host,
  port: Number(process.env.SOURCE_DB_PORT || 5432),
  database: process.env.SOURCE_DB_NAME,
  username: process.env.SOURCE_DB_USER,
  password: process.env.SOURCE_DB_PASSWORD,
  ssl: { rejectUnauthorized: false },
  max: 1,
  connect_timeout: 15,
  idle_timeout: 5,
});

console.log(`\n→ connecting to ${host}:${process.env.SOURCE_DB_PORT || 5432}/${process.env.SOURCE_DB_NAME} …`);

try {
  const [{ count }] = await sql.unsafe(`SELECT count(*)::int AS count FROM ${VIEW}`);
  console.log(`✓ connected. ${VIEW} has ${count} rows.\n`);

  const rows = await sql.unsafe(`SELECT * FROM ${VIEW} LIMIT ${SAMPLE}`);

  if (rows.length === 0) {
    console.log('(view returned no rows)');
  } else {
    console.log('── columns ──');
    console.log(Object.keys(rows[0]).join(', '));
    console.log(`\n── first ${rows.length} row(s) ──`);
    console.dir(rows, { depth: null, maxArrayLength: null });
  }

  // Per-product breakdown helps verify the codes line up with products.code
  // (HOTEL / MENU / EVENT / ACCOUNT) used by the resync.
  try {
    const byProduct = await sql.unsafe(
      `SELECT "productName"::text AS product, count(*)::int AS n
         FROM ${VIEW} GROUP BY "productName" ORDER BY n DESC`
    );
    console.log('\n── rows per productName ──');
    console.table(byProduct);
  } catch (e) {
    console.log('\n(could not group by "productName": ' + String(e?.message ?? e) + ')');
  }
} catch (err) {
  console.error('\n✗ query failed:', String(err?.message ?? err));
  if (String(err).includes('CONNECT_TIMEOUT')) {
    console.error(
      '  → TCP connect timed out. This machine cannot reach the DB on that ' +
      'host:port (firewall / not on the allowed network).'
    );
  }
  process.exitCode = 1;
} finally {
  await sql.end({ timeout: 5 });
}
