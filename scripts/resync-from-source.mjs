/**
 * LOCAL ticket resync — office-network counterpart to the resync-tickets Edge
 * Function. Supabase's cloud can't reach the source DB (firewall/allowlist), so
 * this runs the same logic FROM your machine: it connects to the source Postgres
 * directly and writes the tickets into Supabase via the service-role key.
 *
 * Mirrors supabase/functions/resync-tickets/index.ts. Keep the two in sync.
 *
 * ── Setup (.env.local, gitignored) ──────────────────────────────────────────
 *   SOURCE_DB_HOST=119.8.185.60
 *   SOURCE_DB_PORT=1029
 *   SOURCE_DB_NAME=ifcax
 *   SOURCE_DB_USER=tech_lead_readonlyuser
 *   SOURCE_DB_PASSWORD=********
 *   VITE_SUPABASE_URL=...            (already present)
 *   SUPABASE_SERVICE_ROLE_KEY=...    (Supabase → Project Settings → API → service_role)
 *
 * ── Usage ────────────────────────────────────────────────────────────────────
 *   npm run resync              # DRY RUN — fetch + map + report, writes nothing
 *   npm run resync -- --commit  # actually REPLACE tickets in Supabase
 *
 * --commit is destructive: it deletes each synced product's existing
 * ticket_imports and re-inserts fresh (exactly like the Edge Function).
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import postgres from 'postgres';
import { createClient } from '@supabase/supabase-js';
import ws from 'ws';

// supabase-js initializes a realtime client that needs a global WebSocket.
// Node < 22 has none; provide one. (We only make REST calls — it never connects.)
globalThis.WebSocket ??= ws;

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const COMMIT = process.argv.includes('--commit');

// Optional date floor on createdTs. --year=2026 → 2026-01-01; --since=YYYY-MM-DD
// for an exact date. Without either, pulls all history.
const sinceArg = process.argv.find(a => a.startsWith('--since='))?.split('=')[1];
const yearArg = process.argv.find(a => a.startsWith('--year='))?.split('=')[1];
const SINCE = sinceArg || (yearArg ? `${yearArg}-01-01` : (process.env.SINCE || null));

/* ── .env loader (no extra dependency) ── */
for (const name of ['.env.local', '.env']) {
  try {
    for (const line of readFileSync(join(root, name), 'utf8').split(/\r?\n/)) {
      if (line.trimStart().startsWith('#')) continue;
      const m = line.match(/^\s*([\w.]+)\s*=\s*(.*)\s*$/);
      if (!m) continue;
      let v = m[2];
      if (/^".*"$/.test(v) || /^'.*'$/.test(v)) v = v.slice(1, -1);
      if (!(m[1] in process.env)) process.env[m[1]] = v;
    }
  } catch { /* file may not exist */ }
}

/* ════════════════════════════════════════════════════════════════════════
 * SOURCE VIEW CONFIG — must match supabase/functions/resync-tickets/index.ts
 * ════════════════════════════════════════════════════════════════════════ */
const VIEW = process.env.VIEW || 'issue.view_issues_v2';
const COL = {
  productCode:   'productName',
  issueNo:       'issueNo',
  assignedTo:    'assignedToName',
  customer:      'customerName',
  module:        'productModuleName',
  description:   'description',
  isBug:         'isBug',
  isEnhancement: 'isImprovement',
  priority:      'priorityLevel',
  status:        'status',
  isDeployed:    'isDeployed',
  createdTs:     'createdTs',
  modTs:         'modTs',
  expectedDate:  'expectedDate',
  targetDate:    'targetDate',
};

const VALID_STATUS = ['OPEN', 'IN_PROGRESS', 'QC', 'NO_ACTION', 'DEPLOYED', 'REOPEN', 'TO_DEPLOY'];
const STATUS_MAP = {
  open: 'OPEN', in_progress: 'IN_PROGRESS', 'in progress': 'IN_PROGRESS',
  qc: 'QC', no_action: 'NO_ACTION', 'no action': 'NO_ACTION',
  deployed: 'DEPLOYED', reopen: 'REOPEN', reopened: 'REOPEN',
  to_deploy: 'TO_DEPLOY', 'to deploy': 'TO_DEPLOY', todeploy: 'TO_DEPLOY',
};

function normalizeStatus(raw) {
  const key = String(raw ?? '').toLowerCase().trim();
  if (STATUS_MAP[key]) return STATUS_MAP[key];
  const upper = String(raw ?? '').toUpperCase().trim();
  return VALID_STATUS.includes(upper) ? upper : 'OPEN';
}
function parseBool(val) {
  if (typeof val === 'boolean') return val;
  if (val == null) return false;
  const v = String(val).trim().toLowerCase();
  return v === '1' || v === 'true' || v === 'yes' || v === 't';
}
function parsePriority(val) {
  return parseInt(String(val ?? ''), 10) === 2 ? 2 : 1;
}
function parseISODate(val) {
  if (val == null || val === '') return null;
  if (val instanceof Date) return isNaN(val.getTime()) ? null : val.toISOString();
  const d = new Date(String(val).trim());
  return isNaN(d.getTime()) ? null : d.toISOString();
}
function normalizeDash(s) {
  return s.trim().replace(/^[^\wÀ-ɏ]+/, '').replace(/[–—‒―−﹣－]/g, '-').replace(/\s+/g, ' ').trim();
}
function assigneeLookupKeys(raw) {
  const t = normalizeDash(raw);
  if (!t) return [];
  const keys = [t];
  const rnd = t.replace(/^[\w\s]*RND\s*-\s*/i, '').trim();
  if (rnd && rnd !== t) keys.push(rnd);
  const simple = t.replace(/^[\w]+\s*-\s*/, '').trim();
  if (simple && simple !== t && !keys.includes(simple)) keys.push(simple);
  const lastSeg = t.split(/\s+-\s+/).pop()?.trim();
  if (lastSeg && lastSeg !== t && !keys.includes(lastSeg)) keys.push(lastSeg);
  return [...new Set(keys)];
}
function lookupMemberId(raw, memberMap, memberNameMap) {
  for (const k of assigneeLookupKeys(raw)) { const id = memberMap.get(k); if (id) return id; }
  for (const k of assigneeLookupKeys(raw)) { const id = memberNameMap.get(k.toLowerCase()); if (id) return id; }
  return null;
}
function extractTicketRef(raw) {
  const s = String(raw ?? '');
  if (!s) return '';
  const m = s.match(/"([^"]+)"\s*\)$/);
  return m ? m[1].trim() : s.trim();
}
function firstOfCurrentMonth() {
  const d = new Date();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-01`;
}
function monthStartFromTs(iso) {
  if (!iso) return firstOfCurrentMonth();
  const d = new Date(iso);
  if (isNaN(d.getTime())) return firstOfCurrentMonth();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-01`;
}
function chunk(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

/* ── env validation ── */
function need(name, fallbackName) {
  const v = process.env[name] ?? (fallbackName ? process.env[fallbackName] : undefined);
  if (!v) { console.error(`✗ missing ${name}${fallbackName ? ` (or ${fallbackName})` : ''} in .env.local`); process.exit(1); }
  return v;
}
const SUPABASE_URL = need('SUPABASE_URL', 'VITE_SUPABASE_URL');
const SERVICE_KEY  = need('SUPABASE_SERVICE_ROLE_KEY');
const supabase = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

const sql = postgres({
  host:     need('SOURCE_DB_HOST'),
  port:     Number(process.env.SOURCE_DB_PORT || 5432),
  database: need('SOURCE_DB_NAME'),
  username: need('SOURCE_DB_USER'),
  password: need('SOURCE_DB_PASSWORD'),
  ssl: { rejectUnauthorized: false },
  max: 1,
  connect_timeout: 20,
  idle_timeout: 5,
});

/* ── main ── */
console.log(`\n${COMMIT ? '⚡ COMMIT' : '🔍 DRY RUN'} — resync from ${VIEW}${SINCE ? ` · since ${SINCE}` : ''}\n`);

try {
  // 1. Reference data from DevPulse
  const [{ data: products }, { data: mapRows }, { data: memberRows }] = await Promise.all([
    supabase.from('products').select('id, code'),
    supabase.from('member_ticket_map').select('raw_name, member_id'),
    supabase.from('members').select('id, name').eq('active', true),
  ]);

  const codeToProduct = new Map();
  for (const p of products ?? []) codeToProduct.set(String(p.code), p.id);
  const memberMap = new Map();
  for (const r of mapRows ?? []) if (r.member_id) memberMap.set(r.raw_name, r.member_id);
  const memberNameMap = new Map();
  for (const r of memberRows ?? []) memberNameMap.set(String(r.name).toLowerCase(), r.id);

  const knownCodes = [...codeToProduct.keys()];
  if (knownCodes.length === 0) { console.error('✗ No products configured in DevPulse'); process.exit(1); }
  console.log(`DevPulse products: ${knownCodes.join(', ')}`);

  // 2. Pull from source view (optionally floored by created date)
  let where = `"${COL.productCode}"::text = ANY($1)`;
  const params = [knownCodes];
  if (SINCE) { params.push(SINCE); where += ` AND "${COL.createdTs}" >= $${params.length}`; }
  const sourceRows = await sql.unsafe(`SELECT * FROM ${VIEW} WHERE ${where}`, params);
  console.log(
    `Fetched ${sourceRows.length} matching rows from source` +
    (SINCE ? ` (createdTs >= ${SINCE}).\n` : `.\n`)
  );

  // 3. Map + group by product
  const byProduct = new Map();
  const skippedCodes = new Map();
  const monthsSeen = new Set();
  let skippedNoRef = 0;

  for (const row of sourceRows) {
    const ticketRef = extractTicketRef(row[COL.issueNo]);
    if (!ticketRef) { skippedNoRef++; continue; }
    const code = String(row[COL.productCode] ?? '').trim();
    const productId = codeToProduct.get(code);
    if (!productId) { skippedCodes.set(code, (skippedCodes.get(code) ?? 0) + 1); continue; }

    const rawAssignee = String(row[COL.assignedTo] ?? '').trim();
    const primaryMemberId = lookupMemberId(rawAssignee, memberMap, memberNameMap);
    const createdTs = parseISODate(row[COL.createdTs]);
    const importedMonth = monthStartFromTs(createdTs);
    monthsSeen.add(importedMonth);

    const record = {
      product_id:          productId,
      ticket_ref:          ticketRef,
      customer_name:       String(row[COL.customer] ?? '').trim(),
      module_name:         String(row[COL.module] ?? '').trim(),
      description:         String(row[COL.description] ?? '').trim(),
      is_bug:              parseBool(row[COL.isBug]),
      is_enhancement:      parseBool(row[COL.isEnhancement]),
      priority:            parsePriority(row[COL.priority]),
      status:              normalizeStatus(row[COL.status]),
      is_deployed:         parseBool(row[COL.isDeployed]),
      raw_assignee:        rawAssignee,
      primary_member_id:   primaryMemberId,
      secondary_assignees: [],
      created_ts:          createdTs,
      mod_ts:              parseISODate(row[COL.modTs]),
      expected_date:       parseISODate(row[COL.expectedDate]),
      target_date:         parseISODate(row[COL.targetDate]),
      imported_month:      importedMonth,
    };
    if (!byProduct.has(productId)) byProduct.set(productId, []);
    byProduct.get(productId).push(record);
  }

  const productIdToCode = new Map([...codeToProduct].map(([c, id]) => [id, c]));
  const months = [...monthsSeen].sort();

  // Per-product summary (always shown)
  console.log('── per product ──');
  for (const [productId, records] of byProduct) {
    const matched = records.filter(r => r.primary_member_id).length;
    console.log(
      `  ${(productIdToCode.get(productId) ?? productId).padEnd(8)} ` +
      `${String(records.length).padStart(5)} tickets · ${matched} matched · ${records.length - matched} unmatched`
    );
  }
  console.log(`\nMonths spanned: ${months.length}${months.length ? ` (${months[0]} → ${months[months.length - 1]})` : ''}`);
  console.log(`Skipped (no ticket ref): ${skippedNoRef}`);
  if (skippedCodes.size) console.log(`Skipped (unknown codes): ${JSON.stringify(Object.fromEntries(skippedCodes))}`);

  // Optional: list the distinct assignee names that did NOT resolve to a member.
  // These are the values to add to member_ticket_map (raw_name → member_id).
  if (process.argv.includes('--unmatched')) {
    const counts = new Map();
    for (const [, records] of byProduct)
      for (const r of records)
        if (!r.primary_member_id) {
          const k = r.raw_assignee || '(blank)';
          counts.set(k, (counts.get(k) ?? 0) + 1);
        }
    const sorted = [...counts].sort((a, b) => b[1] - a[1]);
    const total = sorted.reduce((s, [, n]) => s + n, 0);
    console.log(`\n── unmatched assignees · ${sorted.length} distinct names · ${total} tickets ──`);
    console.table(sorted.map(([assignee, n]) => ({ assignee, tickets: n })));
  }

  if (!COMMIT) {
    console.log('\n🔍 DRY RUN — nothing was written. Re-run with --commit to apply:');
    console.log('   npm run resync -- --commit\n');
    process.exit(0);
  }

  // 4. Replace per product
  console.log('\n── writing to Supabase ──');
  for (const [productId, records] of byProduct) {
    const code = productIdToCode.get(productId) ?? productId;
    const { error: delErr } = await supabase.from('ticket_imports').delete().eq('product_id', productId);
    if (delErr) { console.error(`  ${code}: delete failed — ${delErr.message}`); continue; }

    let inserted = 0, insertError = null;
    for (const c of chunk(records, 500)) {
      const { error: insErr } = await supabase.from('ticket_imports').insert(c);
      if (insErr) { insertError = insErr.message; break; }
      inserted += c.length;
    }
    if (insertError) { console.error(`  ${code}: insert failed — ${insertError}`); continue; }

    const matched = records.filter(r => r.primary_member_id).length;
    await supabase.from('import_log').insert({
      product_id: productId, import_type: 'db_resync', imported_month: null,
      row_count: records.length, matched_count: matched,
      unmatched_count: records.length - matched, imported_by: null,
    });
    await supabase.from('products').update({
      last_imported_at: new Date().toISOString(), last_import_type: 'db_resync',
    }).eq('id', productId);

    console.log(`  ${String(code).padEnd(8)} ✓ inserted ${inserted}`);
  }
  console.log('\n✓ resync complete.\n');
} catch (err) {
  console.error('\n✗ resync failed:', String(err?.message ?? err));
  if (String(err).includes('CONNECT_TIMEOUT')) {
    console.error('  → cannot reach the source DB from here (not on the allowed network?).');
  }
  process.exitCode = 1;
} finally {
  await sql.end({ timeout: 5 });
}
