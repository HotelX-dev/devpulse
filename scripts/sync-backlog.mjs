/**
 * Sync the "Backlog" tab of the HotelX Tech Capacity Planning Google Sheet
 * into the Supabase `backlog_items` table (full replace).
 *
 *   npm run sync:backlog          # sync now
 *   npm run sync:backlog -- --dry # preview, write nothing
 *
 * Reads SUPABASE creds from .env.local. The sheet must be link-shared
 * ("anyone with the link"). No Google API key needed — we read the public
 * XLSX export and pick the Backlog sheet by name.
 */
import fs from 'fs';
import * as XLSX from 'xlsx';

const SHEET_ID = '1E0bGupG-mw9BcoE6A3AT774SdX0QsKK6DyPZB5h3RqY';
const TAB = 'Backlog';
const DRY = process.argv.includes('--dry');

// sheet App label → DevPulse products.code
const APP_TO_CODE = {
  'hotelx': 'HOTEL', 'menux': 'MENU', 'eventx': 'EVENT',
  'accountx': 'ACCOUNT_LITE', 'accountx lite': 'ACCOUNT_LITE', 'account x': 'ACCOUNT_LITE',
};

const env = {};
fs.readFileSync('.env.local', 'utf8').split(/\r?\n/).forEach(l => {
  const m = l.match(/^([A-Z0-9_]+)\s*=\s*(.*)$/); if (m) env[m[1]] = m[2];
});
const SB = env.VITE_SUPABASE_URL;
const KEY = env.SUPABASE_SERVICE_ROLE_KEY;
if (!SB || !KEY) { console.error('Missing VITE_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY in .env.local'); process.exit(1); }
const H = { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' };

const norm = s => String(s ?? '').trim().toLowerCase();
const txt = v => { const s = String(v ?? '').trim(); return s === '' ? null : s; };
const num = v => { const s = String(v ?? '').trim(); if (s === '') return null; const n = Number(s); return isNaN(n) ? null : n; };

// map header label → field
const COLS = {
  'App': 'app', 'Category': 'category', 'Outstanding Task': 'task',
  'Requested By / Customer': 'requested_by', 'Priority': 'priority', 'Status': 'status',
  '% Complete': 'pct_complete', 'Owner': 'owner', 'AI-Substitutable': 'ai_substitutable',
  'Effort w/o AI (md)': 'effort_wo_ai', 'Effort w/ AI (md)': 'effort_w_ai',
  'Productivity Gain %': 'productivity_gain', 'Delivery Bucket': 'delivery_bucket',
  'Target Start': 'target_start', 'Target End': 'target_end',
  'Date Added': 'date_added', 'Last Updated': 'last_updated', 'Remarks': 'remarks',
};
const NUMERIC = new Set(['pct_complete', 'effort_wo_ai', 'effort_w_ai', 'productivity_gain']);

async function main() {
  console.log(`${DRY ? '🔍 DRY RUN' : '⚡ SYNC'} — backlog from Google Sheet tab "${TAB}"\n`);

  // 1. products for App→product_id
  const products = await (await fetch(`${SB}/rest/v1/products?select=id,code`, { headers: H })).json();
  const codeToId = new Map(products.map(p => [p.code, p.id]));

  // 2. pull the workbook + Backlog sheet
  const res = await fetch(`https://docs.google.com/spreadsheets/d/${SHEET_ID}/export?format=xlsx`);
  if (!res.ok) { console.error(`Sheet fetch failed: HTTP ${res.status}`); process.exit(1); }
  const wb = XLSX.read(new Uint8Array(await res.arrayBuffer()), { type: 'array' });
  const ws = wb.Sheets[TAB];
  if (!ws) { console.error(`Tab "${TAB}" not found. Tabs: ${wb.SheetNames.join(', ')}`); process.exit(1); }
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, blankrows: false, defval: '' });
  const header = rows[0].map(h => String(h).trim());
  const idx = {};
  for (const [label, field] of Object.entries(COLS)) idx[field] = header.indexOf(label);

  // 3. map rows
  const records = [];
  const skippedApps = new Map();
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    const get = f => idx[f] >= 0 ? r[idx[f]] : '';
    const task = txt(get('task'));
    if (!task) continue; // skip blank/spacer rows

    const rec = { sort_index: i };
    for (const field of Object.values(COLS)) {
      rec[field] = NUMERIC.has(field) ? num(get(field)) : txt(get(field));
    }
    const code = APP_TO_CODE[norm(rec.app)];
    rec.product_id = code ? (codeToId.get(code) ?? null) : null;
    if (rec.app && !code) skippedApps.set(rec.app, (skippedApps.get(rec.app) ?? 0) + 1);
    records.push(rec);
  }

  // 4. summary
  const byApp = {};
  for (const r of records) byApp[r.app ?? '(none)'] = (byApp[r.app ?? '(none)'] ?? 0) + 1;
  console.log(`Parsed ${records.length} backlog items.`);
  console.log('By app:', JSON.stringify(byApp));
  const unmappedProduct = records.filter(r => !r.product_id).length;
  if (unmappedProduct) console.log(`(${unmappedProduct} rows have no matched product_id)`);
  if (skippedApps.size) console.log('Unrecognised app labels:', JSON.stringify(Object.fromEntries(skippedApps)));

  if (DRY) {
    console.log('\nSample:', JSON.stringify(records.slice(0, 3), null, 2));
    console.log('\n🔍 DRY RUN — nothing written. Re-run without --dry to apply.');
    return;
  }

  // 5. replace table
  const del = await fetch(`${SB}/rest/v1/backlog_items?id=neq.00000000-0000-0000-0000-000000000000`, { method: 'DELETE', headers: { ...H, Prefer: 'return=minimal' } });
  if (!del.ok) { console.error('Delete failed:', del.status, await del.text()); process.exit(1); }

  for (let i = 0; i < records.length; i += 500) {
    const chunk = records.slice(i, i + 500);
    const ins = await fetch(`${SB}/rest/v1/backlog_items`, { method: 'POST', headers: { ...H, Prefer: 'return=minimal' }, body: JSON.stringify(chunk) });
    if (!ins.ok) { console.error('Insert failed:', ins.status, await ins.text()); process.exit(1); }
  }
  console.log(`\n✓ Synced ${records.length} backlog items to Supabase.`);
}

main().catch(e => { console.error('ERR', e.message); process.exit(1); });
