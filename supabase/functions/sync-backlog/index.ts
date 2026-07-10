import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import * as XLSX from 'https://esm.sh/xlsx@0.18.5';

/* Google Sheet: "HotelX Tech Capacity Planning" → Backlog tab (public XLSX export). */
const SHEET_ID = '1E0bGupG-mw9BcoE6A3AT774SdX0QsKK6DyPZB5h3RqY';
const TAB = 'Backlog';

const APP_TO_CODE: Record<string, string> = {
  'hotelx': 'HOTEL', 'menux': 'MENU', 'eventx': 'EVENT',
  'accountx': 'ACCOUNT_LITE', 'accountx lite': 'ACCOUNT_LITE', 'account x': 'ACCOUNT_LITE',
};

const COLS: Record<string, string> = {
  'App': 'app', 'Category': 'category', 'Outstanding Task': 'task',
  'Requested By / Customer': 'requested_by', 'Priority': 'priority', 'Status': 'status',
  '% Complete': 'pct_complete', 'Owner': 'owner', 'AI-Substitutable': 'ai_substitutable',
  'Effort w/o AI (md)': 'effort_wo_ai', 'Effort w/ AI (md)': 'effort_w_ai',
  'Productivity Gain %': 'productivity_gain', 'Delivery Bucket': 'delivery_bucket',
  'Target Start': 'target_start', 'Target End': 'target_end',
  'Date Added': 'date_added', 'Last Updated': 'last_updated', 'Remarks': 'remarks',
};
const NUMERIC = new Set(['pct_complete', 'effort_wo_ai', 'effort_w_ai', 'productivity_gain']);

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
);

const corsHeaders: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const norm = (s: unknown) => String(s ?? '').trim().toLowerCase();
const txt = (v: unknown) => { const s = String(v ?? '').trim(); return s === '' ? null : s; };
const num = (v: unknown) => { const s = String(v ?? '').trim(); if (s === '') return null; const n = Number(s); return isNaN(n) ? null : n; };

async function verifyManager(authHeader: string): Promise<boolean> {
  const token = authHeader.replace(/^Bearer\s+/i, '');
  if (token && token === Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')) return true; // automation
  const { data: { user }, error } = await supabase.auth.getUser(token);
  if (error || !user) return false;
  const { data: row } = await supabase.from('members').select('role').eq('id', user.id).maybeSingle();
  return !!(row && ['owner', 'admin', 'manager'].includes(row.role));
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  const json = (b: unknown, s = 200) =>
    new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  try {
    if (!(await verifyManager(req.headers.get('Authorization') ?? ''))) return json({ error: 'Unauthorized' }, 401);

    // products for App → product_id
    const { data: products } = await supabase.from('products').select('id, code');
    const codeToId = new Map<string, string>((products ?? []).map((p) => [p.code, p.id]));

    // fetch + parse the Backlog tab
    const res = await fetch(`https://docs.google.com/spreadsheets/d/${SHEET_ID}/export?format=xlsx`);
    if (!res.ok) return json({ error: `Sheet fetch failed: HTTP ${res.status}` }, 502);
    const wb = XLSX.read(new Uint8Array(await res.arrayBuffer()), { type: 'array' });
    const ws = wb.Sheets[TAB];
    if (!ws) return json({ error: `Tab "${TAB}" not found (${wb.SheetNames.join(', ')})` }, 500);
    const rows = XLSX.utils.sheet_to_json(ws, { header: 1, blankrows: false, defval: '' }) as unknown[][];
    const header = (rows[0] ?? []).map((h) => String(h).trim());
    const idx: Record<string, number> = {};
    for (const [label, field] of Object.entries(COLS)) idx[field] = header.indexOf(label);

    const records: Record<string, unknown>[] = [];
    const byApp: Record<string, number> = {};
    for (let i = 1; i < rows.length; i++) {
      const r = rows[i];
      const get = (f: string) => (idx[f] >= 0 ? r[idx[f]] : '');
      const task = txt(get('task'));
      if (!task) continue;

      const rec: Record<string, unknown> = { sort_index: i };
      for (const field of Object.values(COLS)) rec[field] = NUMERIC.has(field) ? num(get(field)) : txt(get(field));
      const code = APP_TO_CODE[norm(rec.app)];
      rec.product_id = code ? (codeToId.get(code) ?? null) : null;
      records.push(rec);
      byApp[String(rec.app ?? '?')] = (byApp[String(rec.app ?? '?')] ?? 0) + 1;
    }

    // full replace
    const { error: delErr } = await supabase.from('backlog_items').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    if (delErr) return json({ error: `delete: ${delErr.message}` }, 500);
    for (let i = 0; i < records.length; i += 500) {
      const { error: insErr } = await supabase.from('backlog_items').insert(records.slice(i, i + 500));
      if (insErr) return json({ error: `insert: ${insErr.message}` }, 500);
    }

    return json({ ok: true, count: records.length, by_app: byApp });
  } catch (err) {
    console.error('sync-backlog:', err);
    return json({ error: String(err) }, 500);
  }
});
