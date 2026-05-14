import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { supabase } from '../_shared/supabase.ts';

/* ── helpers ── */

function isWeekend(date: Date): boolean {
  const d = date.getDay();
  return d === 0 || d === 6;
}

function subDays(date: Date, days: number): Date {
  const r = new Date(date);
  r.setDate(r.getDate() - days);
  return r;
}

function addDays(date: Date, days: number): Date {
  const r = new Date(date);
  r.setDate(r.getDate() + days);
  return r;
}

function toDateStr(date: Date): string {
  return date.toISOString().split('T')[0];
}

/* Count consecutive working days with no standup going back from yesterday */
async function getMissingStreak(memberId: string, today: string): Promise<number> {
  let streak = 0;
  const cur = subDays(new Date(today), 1);

  for (let i = 0; i < 14; i++) {
    if (isWeekend(cur)) { cur.setDate(cur.getDate() - 1); continue; }

    const dateStr = toDateStr(cur);

    const { data: leave } = await supabase
      .from('leave_log')
      .select('id')
      .eq('member_id', memberId)
      .lte('start_date', dateStr)
      .gte('end_date', dateStr)
      .limit(1);

    if (leave && leave.length > 0) { cur.setDate(cur.getDate() - 1); continue; }

    const { data: standup } = await supabase
      .from('standup_logs')
      .select('id')
      .eq('member_id', memberId)
      .eq('date', dateStr)
      .limit(1);

    if (standup && standup.length > 0) break;

    streak++;
    cur.setDate(cur.getDate() - 1);
  }

  return streak;
}

/* Insert alert only if no unresolved duplicate exists */
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
    const todayStr = toDateStr(today);
    const monthStart = toDateStr(new Date(today.getFullYear(), today.getMonth(), 1));

    // ── 1. Standup check (working days only) ──────────────────────────────────
    if (!isWeekend(today)) {
      const { data: members } = await supabase
        .from('members')
        .select('id, name')
        .eq('active', true)
        .in('role', ['owner', 'admin', 'member']);

      for (const member of members ?? []) {
        const { data: standup } = await supabase
          .from('standup_logs')
          .select('id, hours_spent')
          .eq('member_id', member.id)
          .eq('date', todayStr)
          .limit(1);

        const submitted = (standup?.length ?? 0) > 0;
        const hours = submitted ? (standup![0].hours_spent ?? 0) : 0;

        const { data: leave } = await supabase
          .from('leave_log')
          .select('id')
          .eq('member_id', member.id)
          .lte('start_date', todayStr)
          .gte('end_date', todayStr)
          .limit(1);

        const onLeave = (leave?.length ?? 0) > 0;

        await supabase.from('daily_summary').upsert(
          { date: todayStr, member_id: member.id, submitted, on_leave: onLeave, hours },
          { onConflict: 'date,member_id' },
        );

        if (!submitted && !onLeave) {
          const streak = await getMissingStreak(member.id, todayStr);
          if (streak >= 2) {
            await insertAlert(
              'MISSING_STANDUP', member.id, null, null,
              streak >= 3 ? 'HIGH' : 'MEDIUM',
              `${member.name} has not submitted standup for ${streak} consecutive working day${streak !== 1 ? 's' : ''}`,
            );
          }
        }
      }
    }

    // ── 2. Stale tickets (mod_ts unchanged 7+ days, still active) ────────────
    const sevenDaysAgo = subDays(today, 7).toISOString();
    const { data: staleTickets } = await supabase
      .from('ticket_imports')
      .select('id, ticket_ref, customer_name, primary_member_id')
      .in('status', ['OPEN', 'IN_PROGRESS'])
      .lt('mod_ts', sevenDaysAgo);

    for (const t of staleTickets ?? []) {
      await insertAlert(
        'STALE_TICKET', t.primary_member_id, t.id, null, 'MEDIUM',
        `${t.ticket_ref} has had no activity for 7+ days — ${t.customer_name}`,
      );
    }

    // ── 3. Critically aged tickets (> 30 days, not deployed/no_action) ───────
    const thirtyDaysAgo = subDays(today, 30).toISOString();
    const { data: agedTickets } = await supabase
      .from('ticket_imports')
      .select('id, ticket_ref, customer_name, primary_member_id, created_ts')
      .not('status', 'in', '("DEPLOYED","NO_ACTION")')
      .lt('created_ts', thirtyDaysAgo);

    for (const t of agedTickets ?? []) {
      const ageDays = Math.floor(
        (today.getTime() - new Date(t.created_ts).getTime()) / 86_400_000,
      );
      await insertAlert(
        'TICKET_AGED_CRITICAL', t.primary_member_id, t.id, null, 'HIGH',
        `${t.ticket_ref} has been open for ${ageDays} days — ${t.customer_name}`,
      );
    }

    // ── 4. Delivery at risk (due within 2 days, not Done) ────────────────────
    const twoDaysFromNowStr = toDateStr(addDays(today, 2));
    const { data: atRiskTasks } = await supabase
      .from('tasks')
      .select('id, title, due_date, assignees')
      .not('status', 'eq', 'Done')
      .lte('due_date', twoDaysFromNowStr)
      .gte('due_date', todayStr);

    for (const task of atRiskTasks ?? []) {
      const daysLeft = Math.ceil(
        (new Date(task.due_date).getTime() - today.getTime()) / 86_400_000,
      );
      const primaryAssignee = task.assignees?.[0] ?? null;
      await insertAlert(
        'DELIVERY_AT_RISK', primaryAssignee, null, task.id,
        daysLeft <= 0 ? 'HIGH' : 'MEDIUM',
        `"${task.title}" is due ${daysLeft <= 0 ? 'today' : `in ${daysLeft} day${daysLeft !== 1 ? 's' : ''}`}`,
      );
    }

    // ── 5. Stale blockers (open/in-progress, 3+ days old) ────────────────────
    const threeDaysAgoStr = toDateStr(subDays(today, 3));
    const { data: staleBlockers } = await supabase
      .from('blockers')
      .select('id, member_id, description, raised_at')
      .in('status', ['Open', 'In Progress'])
      .lte('raised_at', threeDaysAgoStr);

    for (const b of staleBlockers ?? []) {
      const daysOpen = Math.floor(
        (today.getTime() - new Date(b.raised_at).getTime()) / 86_400_000,
      );
      await insertAlert(
        'STALE_BLOCKER', b.member_id, null, null, 'HIGH',
        `Blocker unresolved for ${daysOpen} day${daysOpen !== 1 ? 's' : ''} — ${b.description}`,
      );
    }

    // ── 6. Adhoc overload (this month) ───────────────────────────────────────
    const { data: logs } = await supabase
      .from('standup_logs')
      .select('member_id, task_type, hours_spent')
      .gte('date', monthStart)
      .lte('date', todayStr);

    const memberHours = new Map<string, { adhoc: number; ticket: number }>();
    for (const log of logs ?? []) {
      if (!memberHours.has(log.member_id)) {
        memberHours.set(log.member_id, { adhoc: 0, ticket: 0 });
      }
      const h = memberHours.get(log.member_id)!;
      if (log.task_type === 'Adhoc') h.adhoc += log.hours_spent ?? 0;
      else if (log.task_type === 'Ticket') h.ticket += log.hours_spent ?? 0;
    }

    for (const [memberId, h] of memberHours.entries()) {
      if (h.ticket > 0 && h.adhoc > h.ticket) {
        await insertAlert(
          'ADHOC_OVERLOAD', memberId, null, null, 'LOW',
          `Adhoc hours (${h.adhoc}h) exceed ticket hours (${h.ticket}h) this month`,
        );
      }
    }

    return new Response(JSON.stringify({ ok: true, date: todayStr }), {
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
