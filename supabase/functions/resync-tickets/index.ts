import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import postgres from 'https://deno.land/x/postgresjs@v3.4.5/mod.js';

/* ════════════════════════════════════════════════════════════════════════
 * ⚠️  SOURCE VIEW CONFIG — ADJUST THESE TO MATCH YOUR ACTUAL VIEW
 * ────────────────────────────────────────────────────────────────────────
 * VIEW   — fully-qualified name of the view you were granted (schema.view).
 * COL    — maps each ticket_imports field to the column name in YOUR view.
 *          Defaults below use the field names from the Excel/CSV export;
 *          a Postgres view very likely uses snake_case instead (e.g.
 *          issue_no, assigned_to_name, product_module_name, priority_level).
 *          Change the right-hand strings only.
 * COL.productCode must resolve to a value that matches products.code.
 * ════════════════════════════════════════════════════════════════════════ */
const VIEW = 'issue.view_issues_v2';

// Source view uses camelCase quoted identifiers; SELECT * preserves the case,
// so row keys are e.g. row["issueNo"]. productName (enum) equals products.code
// exactly: HOTEL / MENU / EVENT (issueNo prefixes HX / MX / EX).
const COL = {
  productCode:   'productName',           // enum → matches products.code (HOTEL/MENU/EVENT)
  issueNo:       'issueNo',               // → ticket_ref (e.g. HX-1913)
  assignedTo:    'assignedToName',        // → raw_assignee (then resolved)
  customer:      'customerName',
  module:        'productModuleName',
  description:   'description',
  isBug:         'isBug',
  isEnhancement: 'isImprovement',         // source calls enhancements "isImprovement"
  priority:      'priorityLevel',         // 2 → 2, anything else → 1
  status:        'status',                // enum: OPEN/IN_PROGRESS/QC/NO_ACTION/DEPLOYED/TO_DEPLOY/REOPENED
  isDeployed:    'isDeployed',
  createdTs:     'createdTs',
  modTs:         'modTs',
  expectedDate:  'expectedDate',
  targetDate:    'targetDate',
} as const;
/* ════════════════════════════════════════════════════════════════════════ */

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
);

const corsHeaders: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const VALID_STATUS = ['OPEN', 'IN_PROGRESS', 'QC', 'NO_ACTION', 'DEPLOYED', 'REOPEN', 'TO_DEPLOY'] as const;
type TicketStatus = (typeof VALID_STATUS)[number];

/* ── parsing helpers (ported from src/lib/csvParser.ts) ── */

const STATUS_MAP: Record<string, TicketStatus> = {
  open: 'OPEN', in_progress: 'IN_PROGRESS', 'in progress': 'IN_PROGRESS',
  qc: 'QC', no_action: 'NO_ACTION', 'no action': 'NO_ACTION',
  deployed: 'DEPLOYED', reopen: 'REOPEN', reopened: 'REOPEN',
  to_deploy: 'TO_DEPLOY', 'to deploy': 'TO_DEPLOY', todeploy: 'TO_DEPLOY',
};

function normalizeStatus(raw: unknown): TicketStatus {
  const key = String(raw ?? '').toLowerCase().trim();
  if (STATUS_MAP[key]) return STATUS_MAP[key];
  const upper = String(raw ?? '').toUpperCase().trim() as TicketStatus;
  return VALID_STATUS.includes(upper) ? upper : 'OPEN';
}

function parseBool(val: unknown): boolean {
  if (typeof val === 'boolean') return val;
  if (val == null) return false;
  const v = String(val).trim().toLowerCase();
  return v === '1' || v === 'true' || v === 'yes' || v === 't';
}

function parsePriority(val: unknown): 1 | 2 {
  return parseInt(String(val ?? ''), 10) === 2 ? 2 : 1;
}

/** Accepts Date (from postgres.js) or string; returns ISO string or null. */
function parseISODate(val: unknown): string | null {
  if (val == null || val === '') return null;
  if (val instanceof Date) return isNaN(val.getTime()) ? null : val.toISOString();
  const d = new Date(String(val).trim());
  return isNaN(d.getTime()) ? null : d.toISOString();
}

function normalizeDash(s: string): string {
  return s
    .trim()
    .replace(/^[^\wÀ-ɏ]+/, '')
    .replace(/[–—‒―−﹣－]/g, '-')
    .replace(/\s+/g, ' ')
    .trim();
}

function assigneeLookupKeys(raw: string): string[] {
  const t = normalizeDash(raw);
  if (!t) return [];
  const keys: string[] = [t];
  const rnd = t.replace(/^[\w\s]*RND\s*-\s*/i, '').trim();
  if (rnd && rnd !== t) keys.push(rnd);
  const simple = t.replace(/^[\w]+\s*-\s*/, '').trim();
  if (simple && simple !== t && !keys.includes(simple)) keys.push(simple);
  const lastSeg = t.split(/\s+-\s+/).pop()?.trim();
  if (lastSeg && lastSeg !== t && !keys.includes(lastSeg)) keys.push(lastSeg);
  return [...new Set(keys)];
}

function lookupMemberId(
  raw: string,
  memberMap: Map<string, string>,
  memberNameMap: Map<string, string>,
): string | null {
  for (const k of assigneeLookupKeys(raw)) {
    const id = memberMap.get(k);
    if (id) return id;
  }
  for (const k of assigneeLookupKeys(raw)) {
    const id = memberNameMap.get(k.toLowerCase());
    if (id) return id;
  }
  return null;
}

/** =HYPERLINK("https://…","HX-4161") | "HX-4161" → "HX-4161" */
function extractTicketRef(raw: unknown): string {
  const s = String(raw ?? '');
  if (!s) return '';
  const m = s.match(/"([^"]+)"\s*\)$/);
  return m ? m[1].trim() : s.trim();
}

function firstOfCurrentMonth(): string {
  const d = new Date();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-01`;
}

/** imported_month = first day of the ticket's created-month (UTC). Falls back
 *  to the current month if created_ts is missing. */
function monthStartFromTs(iso: string | null): string {
  if (!iso) return firstOfCurrentMonth();
  const d = new Date(iso);
  if (isNaN(d.getTime())) return firstOfCurrentMonth();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-01`;
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

async function verifyManager(authHeader: string): Promise<{ id: string } | null> {
  const token = authHeader.replace(/^Bearer\s+/i, '');
  const { data: { user }, error } = await supabase.auth.getUser(token);
  if (error || !user) return null;
  const { data: row } = await supabase
    .from('members').select('role').eq('id', user.id).maybeSingle();
  const ok = row && ['owner', 'admin', 'manager'].includes(row.role);
  return ok ? { id: user.id } : null;
}

/* ── main ── */

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  try {
    // Accept either a manager's JWT (from the app) or the service-role key
    // (automation / scheduled invocation), mirroring monthly-snapshot-compute.
    const authHeader = req.headers.get('Authorization') ?? '';
    const token = authHeader.replace(/^Bearer\s+/i, '');
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    let callerId: string | null;
    if (token && token === serviceKey) {
      callerId = null; // service-role / automation
    } else {
      const caller = await verifyManager(authHeader);
      if (!caller) return json({ error: 'Unauthorized' }, 401);
      callerId = caller.id;
    }

    const connStr = Deno.env.get('SOURCE_DB_URL');
    if (!connStr) return json({ error: 'SOURCE_DB_URL secret is not set' }, 500);

    // 1. Reference data from DevPulse
    const [{ data: products }, { data: mapRows }, { data: memberRows }] = await Promise.all([
      supabase.from('products').select('id, code'),
      supabase.from('member_ticket_map').select('raw_name, member_id'),
      supabase.from('members').select('id, name').eq('active', true),
    ]);

    const codeToProduct = new Map<string, string>();
    for (const p of products ?? []) codeToProduct.set(String(p.code), p.id);

    const memberMap = new Map<string, string>();
    for (const r of mapRows ?? []) if (r.member_id) memberMap.set(r.raw_name, r.member_id);
    const memberNameMap = new Map<string, string>();
    for (const r of memberRows ?? []) memberNameMap.set(String(r.name).toLowerCase(), r.id);

    // 2. Pull tickets from the source view — only products DevPulse knows about
    const knownCodes = [...codeToProduct.keys()];
    if (knownCodes.length === 0) return json({ error: 'No products configured in DevPulse' }, 400);

    // Encrypted, but tolerant of the source's self-signed cert.
    const sql = postgres(connStr, { ssl: { rejectUnauthorized: false }, max: 1 });
    let sourceRows: Record<string, unknown>[];
    try {
      sourceRows = await sql.unsafe(
        `SELECT * FROM ${VIEW} WHERE "${COL.productCode}"::text = ANY($1)`,
        [knownCodes],
      );
    } finally {
      await sql.end({ timeout: 5 });
    }

    // 3. Map + group by product. imported_month is derived per-row from the
    //    ticket's created date, so tickets land in their real months.
    const byProduct = new Map<string, Record<string, unknown>[]>();
    const skippedCodes = new Map<string, number>(); // unknown product code → count
    const monthsSeen = new Set<string>();
    let skippedNoRef = 0;

    for (const row of sourceRows) {
      const ticketRef = extractTicketRef(row[COL.issueNo]);
      if (!ticketRef) { skippedNoRef++; continue; }

      const code = String(row[COL.productCode] ?? '').trim();
      const productId = codeToProduct.get(code);
      if (!productId) {
        skippedCodes.set(code, (skippedCodes.get(code) ?? 0) + 1);
        continue;
      }

      const rawAssignee = String(row[COL.assignedTo] ?? '').trim();
      const primaryMemberId = lookupMemberId(rawAssignee, memberMap, memberNameMap);
      const createdTs = parseISODate(row[COL.createdTs]);
      const importedMonth = monthStartFromTs(createdTs);
      monthsSeen.add(importedMonth);

      const record: Record<string, unknown> = {
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
      byProduct.get(productId)!.push(record);
    }

    // 4. Replace per product (all months) → insert fresh, each row tagged with
    //    its own created-month.
    const results: Record<string, unknown>[] = [];
    for (const [productId, records] of byProduct) {
      const { error: delErr } = await supabase
        .from('ticket_imports').delete().eq('product_id', productId);
      if (delErr) { results.push({ product_id: productId, error: `delete: ${delErr.message}` }); continue; }

      let inserted = 0;
      let insertError: string | null = null;
      for (const c of chunk(records, 500)) {
        const { error: insErr } = await supabase.from('ticket_imports').insert(c);
        if (insErr) { insertError = insErr.message; break; }
        inserted += c.length;
      }
      if (insertError) { results.push({ product_id: productId, error: `insert: ${insertError}` }); continue; }

      const matched = records.filter(r => r.primary_member_id).length;

      await supabase.from('import_log').insert({
        product_id:      productId,
        import_type:     'db_resync',
        imported_month:  null, // resync spans many months; not a single-month close
        row_count:       records.length,
        matched_count:   matched,
        unmatched_count: records.length - matched,
        imported_by:     callerId,
      });
      await supabase.from('products').update({
        last_imported_at: new Date().toISOString(),
        last_import_type: 'db_resync',
      }).eq('id', productId);

      results.push({
        product_id: productId,
        inserted,
        matched,
        unmatched: records.length - matched,
      });
    }

    const months = [...monthsSeen].sort();
    return json({
      ok: true,
      month_range: months.length ? { from: months[0], to: months[months.length - 1] } : null,
      months_spanned: months.length,
      total_source_rows: sourceRows.length,
      products_synced: results.length,
      results,
      skipped_no_ref: skippedNoRef,
      skipped_unknown_codes: Object.fromEntries(skippedCodes),
    });
  } catch (err) {
    console.error('resync-tickets:', err);
    return json({ error: String(err) }, 500);
  }
});
