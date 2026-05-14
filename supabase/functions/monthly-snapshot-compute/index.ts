import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { supabase } from '../_shared/supabase.ts';

/* ── helpers ── */

function toDateStr(date: Date): string {
  return date.toISOString().split('T')[0];
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

/* ── main handler ── */

serve(async () => {
  try {
    const today = new Date();

    // We compute the snapshot for the month that just ended
    const lastMonthDate = new Date(today.getFullYear(), today.getMonth() - 1, 1);
    const lastMonthStr  = toDateStr(lastMonthDate); // "YYYY-MM-01"
    const lastMonthEnd  = toDateStr(new Date(today.getFullYear(), today.getMonth(), 0));

    const { data: products } = await supabase.from('products').select('id, name');
    const results: Record<string, unknown>[] = [];

    for (const product of products ?? []) {
      // Tickets for last month's import
      const { data: tickets } = await supabase
        .from('ticket_imports')
        .select('status, priority, is_bug, is_enhancement, created_ts')
        .eq('product_id', product.id)
        .eq('imported_month', lastMonthStr);

      if (!tickets || tickets.length === 0) {
        results.push({ product: product.name, skipped: true });
        continue;
      }

      // Count by status / type
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

        // Inflow: ticket created during this month
        if (t.created_ts >= lastMonthStr && t.created_ts <= lastMonthEnd + 'T23:59:59Z') {
          tickets_created++;
        }
      }

      const tickets_closed = counts.deployed;
      const net_velocity   = tickets_closed - tickets_created;

      // Get last 6 months of snapshots for rolling averages
      const sixMonthsAgo = toDateStr(
        new Date(lastMonthDate.getFullYear(), lastMonthDate.getMonth() - 5, 1),
      );

      const { data: history } = await supabase
        .from('monthly_snapshot')
        .select('tickets_created, tickets_closed, net_velocity')
        .eq('product_id', product.id)
        .gte('month', sixMonthsAgo)
        .lt('month', lastMonthStr)
        .order('month', { ascending: true });

      const last6 = [
        ...(history ?? []).map(h => ({
          tickets_created: h.tickets_created as number,
          tickets_closed:  h.tickets_closed  as number,
          net_velocity:    h.net_velocity    as number,
        })),
        { tickets_created, tickets_closed, net_velocity },
      ].slice(-6);

      const avg_inflow_6m  = avg(last6.map(m => m.tickets_created));
      const avg_outflow_6m = avg(last6.map(m => m.tickets_closed));
      const net_velocity_6m = avg_outflow_6m - avg_inflow_6m;

      // Forecast next 6 months
      const currentActive =
        counts.open + counts.reopen + counts.in_progress + counts.qc + counts.to_deploy;

      const velocities     = last6.map(m => m.net_velocity);
      const optimisticVel  = Math.max(...velocities);
      const pessimisticVel = Math.min(...velocities);

      const forecast_json = Array.from({ length: 6 }, (_, i) => {
        const fMonth = new Date(
          lastMonthDate.getFullYear(),
          lastMonthDate.getMonth() + i + 1,
          1,
        );
        return {
          month:       toDateStr(fMonth),
          optimistic:  Math.max(0, currentActive - (i + 1) * optimisticVel),
          expected:    Math.max(0, currentActive - (i + 1) * net_velocity_6m),
          pessimistic: Math.max(0, currentActive - (i + 1) * pessimisticVel),
        };
      });

      // Upsert snapshot
      const { error } = await supabase.from('monthly_snapshot').upsert(
        {
          month: lastMonthStr,
          product_id: product.id,
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
        console.error(`Snapshot upsert failed for ${product.name}:`, error);
        continue;
      }

      // BACKLOG_GROWING: 2 consecutive months of negative velocity
      const last2 = last6.slice(-2);
      if (last2.length === 2 && last2.every(m => m.net_velocity < 0)) {
        await insertAlert(
          'BACKLOG_GROWING', null, null, null, 'HIGH',
          `${product.name} backlog has been growing for 2 consecutive months`,
        );
      }

      results.push({ product: product.name, net_velocity, forecast_months: 6 });
    }

    return new Response(JSON.stringify({ ok: true, month: lastMonthStr, results }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error(err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
});
