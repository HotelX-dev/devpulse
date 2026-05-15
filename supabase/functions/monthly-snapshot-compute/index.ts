import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
);

const corsHeaders: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function toDateStr(date: Date): string {
  return date.toISOString().split('T')[0];
}

function parseMonthStart(ymd: string): Date {
  const [y, m] = ymd.split('-').map(Number);
  return new Date(y, m - 1, 1);
}

function lastDayOfMonthStr(ymd: string): string {
  const [y, m] = ymd.split('-').map(Number);
  return new Date(y, m, 0).toISOString().split('T')[0];
}

function avg(arr: number[]): number {
  if (arr.length === 0) return 0;
  return arr.reduce((s, v) => s + v, 0) / arr.length;
}

async function insertAlert(
  type: string,
  memberId: string | null,
  ticketId: string | null,
  taskId: string | null,
  severity: string,
  message: string,
) {
  let query = supabase
    .from('alerts')
    .select('id')
    .eq('type', type)
    .eq('resolved', false);

  if (memberId) query = query.eq('member_id', memberId);
  else query = query.is('member_id', null);

  if (ticketId) query = query.eq('ticket_id', ticketId);
  else query = query.is('ticket_id', null);

  const { data: existing } = await query.limit(1);
  if (existing && existing.length > 0) return;

  await supabase.from('alerts').insert({
    type, member_id: memberId, ticket_id: ticketId, task_id: taskId,
    severity, message, resolved: false,
  });
}

async function computeSnapshotForProductMonth(
  productId: string,
  productName: string,
  monthStr: string,
): Promise<{ ok: boolean; skipped?: boolean; error?: string; net_velocity?: number }> {
  const monthDate = parseMonthStart(monthStr);
  const lastDayStr = lastDayOfMonthStr(monthStr);

  const { data: tickets } = await supabase
    .from('ticket_imports')
    .select('status, priority, is_bug, is_enhancement, created_ts')
    .eq('product_id', productId)
    .eq('imported_month', monthStr);

  if (!tickets || tickets.length === 0) {
    return { ok: true, skipped: true };
  }

  const counts = {
    open: 0, reopen: 0, in_progress: 0, qc: 0,
    to_deploy: 0, deployed: 0,
    p1_count: 0, p2_count: 0,
    bug_count: 0, enhancement_count: 0,
  };

  let tickets_created = 0;

  for (const t of tickets) {
    switch (t.status) {
      case 'OPEN':        counts.open++;        break;
      case 'REOPEN':      counts.reopen++;      break;
      case 'IN_PROGRESS': counts.in_progress++; break;
      case 'QC':          counts.qc++;          break;
      case 'TO_DEPLOY':   counts.to_deploy++;   break;
      case 'DEPLOYED':    counts.deployed++;    break;
    }
    if (t.priority === 1) counts.p1_count++; else counts.p2_count++;
    if (t.is_bug)         counts.bug_count++;
    if (t.is_enhancement) counts.enhancement_count++;

    const ts = t.created_ts as string | null;
    if (ts && ts >= monthStr && ts <= lastDayStr + 'T23:59:59.999Z') {
      tickets_created++;
    }
  }

  const tickets_closed = counts.deployed;
  const net_velocity   = tickets_closed - tickets_created;

  const sixMonthsAgo = toDateStr(
    new Date(monthDate.getFullYear(), monthDate.getMonth() - 5, 1),
  );

  const { data: history } = await supabase
    .from('monthly_snapshot')
    .select('tickets_created, tickets_closed, net_velocity')
    .eq('product_id', productId)
    .gte('month', sixMonthsAgo)
    .lt('month', monthStr)
    .order('month', { ascending: true });

  const last6 = [
    ...(history ?? []).map(h => ({
      tickets_created: h.tickets_created as number,
      tickets_closed:  h.tickets_closed  as number,
      net_velocity:    h.net_velocity    as number,
    })),
    { tickets_created, tickets_closed, net_velocity },
  ].slice(-6);

  const avg_inflow_6m   = avg(last6.map(m => m.tickets_created));
  const avg_outflow_6m  = avg(last6.map(m => m.tickets_closed));
  const net_velocity_6m = avg_outflow_6m - avg_inflow_6m;

  const currentActive =
    counts.open + counts.reopen + counts.in_progress + counts.qc + counts.to_deploy;

  const velocities     = last6.map(m => m.net_velocity);
  const optimisticVel  = velocities.length ? Math.max(...velocities) : 0;
  const pessimisticVel = velocities.length ? Math.min(...velocities) : 0;

  const forecast_json = Array.from({ length: 6 }, (_, i) => {
    const fMonth = new Date(
      monthDate.getFullYear(),
      monthDate.getMonth() + i + 1,
      1,
    );
    return {
      month:       toDateStr(fMonth),
      optimistic:  Math.max(0, currentActive - (i + 1) * optimisticVel),
      expected:    Math.max(0, currentActive - (i + 1) * net_velocity_6m),
      pessimistic: Math.max(0, currentActive - (i + 1) * pessimisticVel),
    };
  });

  const { error } = await supabase.from('monthly_snapshot').upsert(
    {
      month: monthStr,
      product_id: productId,
      ...counts,
      tickets_created,
      tickets_closed,
      net_velocity,
      avg_inflow_6m,
      avg_outflow_6m,
      net_velocity_6m,
      forecast_json,
    },
    { onConflict: 'month,product_id' },
  );

  if (error) {
    console.error(`Snapshot upsert failed for ${productName}:`, error);
    return { ok: false, error: error.message };
  }

  const last2 = last6.slice(-2);
  if (last2.length === 2 && last2.every(m => m.net_velocity < 0)) {
    await insertAlert(
      'BACKLOG_GROWING', null, null, null, 'HIGH',
      `${productName} backlog has been growing for 2 consecutive months`,
    );
  }

  return { ok: true, net_velocity };
}

async function runCronLastMonthAllProducts(): Promise<Record<string, unknown>[]> {
  const today = new Date();
  const lastMonthDate = new Date(today.getFullYear(), today.getMonth() - 1, 1);
  const lastMonthStr  = toDateStr(lastMonthDate);

  const { data: products } = await supabase.from('products').select('id, name');
  const results: Record<string, unknown>[] = [];

  for (const product of products ?? []) {
    const r = await computeSnapshotForProductMonth(product.id, product.name, lastMonthStr);
    if (r.skipped) results.push({ product: product.name, skipped: true });
    else if (!r.ok) results.push({ product: product.name, error: r.error });
    else results.push({ product: product.name, net_velocity: r.net_velocity, forecast_months: 6 });
  }

  return results;
}

async function verifyUserIsManager(authHeader: string): Promise<boolean> {
  const token = authHeader.replace(/^Bearer\s+/i, '');
  const url = Deno.env.get('SUPABASE_URL')!;
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const admin = createClient(url, serviceKey);
  const { data: { user }, error } = await admin.auth.getUser(token);
  if (error || !user) return false;
  const { data: row } = await admin.from('members').select('role').eq('id', user.id).maybeSingle();
  return !!(row && (row.role === 'owner' || row.role === 'admin' || row.role === 'manager'));
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization') ?? '';
    const token = authHeader.replace(/^Bearer\s+/i, '');
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const isCron = token === serviceKey;

    let body: Record<string, unknown> = {};
    if (req.method === 'POST') {
      try {
        body = await req.json();
      } catch { /* empty body */ }
    }

    if (isCron) {
      const results = await runCronLastMonthAllProducts();
      const today = new Date();
      const lastMonthDate = new Date(today.getFullYear(), today.getMonth() - 1, 1);
      const lastMonthStr = toDateStr(lastMonthDate);
      return new Response(JSON.stringify({ ok: true, mode: 'cron', month: lastMonthStr, results }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const allowed = await verifyUserIsManager(authHeader);
    if (!allowed) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const productId = body.product_id as string | undefined;
    const month = body.month as string | undefined;
    if (!productId || !month) {
      return new Response(JSON.stringify({ error: 'product_id and month are required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: product } = await supabase.from('products').select('id, name').eq('id', productId).maybeSingle();
    if (!product) {
      return new Response(JSON.stringify({ error: 'Product not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const r = await computeSnapshotForProductMonth(product.id, product.name, month);
    return new Response(JSON.stringify({ ok: r.ok, mode: 'single', month, ...r }), {
      status: r.ok ? 200 : 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error(err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
