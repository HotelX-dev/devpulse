import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Check, AlertTriangle, Clock, Ticket, ListTodo, Flame, Plane } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../hooks/useAuth';
import { usePageShellStyle } from '../../hooks/usePageShellStyle';
import type { TicketStatus, TaskStatus } from '../../types';

/* ── helpers ── */
function localToday(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function monthStart(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
}

function greet(): string {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

function fmtDate(dateStr: string): string {
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-MY', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  });
}

/* ── status colours ── */
const TICKET_COLOR: Record<TicketStatus, string> = {
  OPEN:        'var(--red)',
  IN_PROGRESS: 'var(--blue)',
  QC:          'var(--purple)',
  NO_ACTION:   'var(--text3)',
  DEPLOYED:    'var(--green)',
  REOPEN:      'var(--amber)',
  TO_DEPLOY:   'var(--amber)',
};

const TASK_COLOR: Record<TaskStatus, string> = {
  Pending:      'var(--text3)',
  'In Progress':'var(--blue)',
  Blocked:      'var(--red)',
  QC:           'var(--purple)',
  Done:         'var(--green)',
};

/* ── KPI card ── */
function StatCard({
  icon, label, value, sub, accent, onClick,
}: {
  icon: React.ReactNode;
  label: string;
  value: string | number;
  sub?: string;
  accent?: string;
  onClick?: () => void;
}) {
  return (
    <div
      onClick={onClick}
      style={{
        background: 'var(--bg2)', border: '1px solid var(--border)',
        borderRadius: 12, padding: '18px 20px',
        display: 'flex', flexDirection: 'column', gap: 10,
        cursor: onClick ? 'pointer' : 'default',
        transition: 'border-color 0.15s',
        flex: 1, minWidth: 140,
      }}
      onMouseEnter={e => onClick && ((e.currentTarget as HTMLElement).style.borderColor = 'var(--border2)')}
      onMouseLeave={e => onClick && ((e.currentTarget as HTMLElement).style.borderColor = 'var(--border)')}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          {label}
        </span>
        <span style={{ color: accent ?? 'var(--text3)' }}>{icon}</span>
      </div>
      <div style={{ fontSize: 28, fontWeight: 800, color: accent ?? 'var(--text)', lineHeight: 1 }}>
        {value}
      </div>
      {sub && <div style={{ fontSize: 11, color: 'var(--text3)' }}>{sub}</div>}
    </div>
  );
}

/* ── Ticket mini row ── */
function TicketRow({ ticket }: { ticket: { ticket_ref: string; description: string; status: TicketStatus; customer_name: string } }) {
  const color = TICKET_COLOR[ticket.status] ?? 'var(--text3)';
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 12,
      padding: '10px 14px', borderRadius: 8,
      background: 'var(--bg3)', border: '1px solid var(--border)',
    }}>
      <span style={{
        fontSize: 11, fontWeight: 700, color: 'var(--accent)',
        fontFamily: 'var(--font-mono)', background: 'var(--accent-dim)',
        borderRadius: 4, padding: '2px 7px', flexShrink: 0,
      }}>
        {ticket.ticket_ref}
      </span>
      <span style={{ flex: 1, fontSize: 13, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {ticket.description || ticket.customer_name}
      </span>
      <span style={{
        fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 4,
        background: `${color}18`, border: `1px solid ${color}33`, color, flexShrink: 0,
      }}>
        {ticket.status.replace('_', ' ')}
      </span>
    </div>
  );
}

/* ── Task mini row ── */
function TaskRow({ task }: { task: { id: string; title: string; status: TaskStatus; due_date: string | null } }) {
  const color   = TASK_COLOR[task.status] ?? 'var(--text3)';
  const today   = localToday();
  const overdue = task.due_date && task.status !== 'Done' && task.due_date < today;
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 12,
      padding: '10px 14px', borderRadius: 8,
      background: 'var(--bg3)', border: `1px solid ${overdue ? 'var(--red)33' : 'var(--border)'}`,
    }}>
      <span style={{ flex: 1, fontSize: 13, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {task.title}
      </span>
      {task.due_date && (
        <span style={{ fontSize: 11, color: overdue ? 'var(--red)' : 'var(--text3)', fontWeight: overdue ? 600 : 400, flexShrink: 0 }}>
          {overdue ? '⚠ ' : ''}Due {new Date(task.due_date + 'T00:00:00').toLocaleDateString('en-MY', { day: 'numeric', month: 'short' })}
        </span>
      )}
      <span style={{
        fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 4,
        background: `${color}18`, border: `1px solid ${color}33`, color, flexShrink: 0,
      }}>
        {task.status}
      </span>
    </div>
  );
}

/* ── Blocker mini ── */
function BlockerRow({ date, text }: { date: string; text: string }) {
  const ageDays = Math.round((Date.now() - new Date(date + 'T00:00:00').getTime()) / 86400000);
  const color   = ageDays >= 3 ? 'var(--red)' : 'var(--amber)';
  return (
    <div style={{
      display: 'flex', alignItems: 'flex-start', gap: 10,
      padding: '10px 14px', borderRadius: 8,
      background: `${color}08`, border: `1px solid ${color}33`,
    }}>
      <AlertTriangle size={14} color={color} style={{ flexShrink: 0, marginTop: 2 }} />
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 13, color: 'var(--text)', lineHeight: 1.5 }}>{text}</div>
        <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 3 }}>
          {ageDays === 0 ? 'Today' : ageDays === 1 ? 'Yesterday' : `${ageDays} days ago`}
        </div>
      </div>
    </div>
  );
}

/* ── Section header ── */
function SectionHeader({ title, action, onAction }: { title: string; action?: string; onAction?: () => void }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
        {title}
      </div>
      {action && onAction && (
        <button onClick={onAction} style={{
          background: 'none', border: 'none', cursor: 'pointer',
          fontSize: 12, color: 'var(--accent)', fontWeight: 600,
          fontFamily: 'var(--font-sans)', padding: 0,
        }}>
          {action}
        </button>
      )}
    </div>
  );
}

/* ── Main ── */
export default function MyDashboard() {
  const { member } = useAuth();
  const navigate   = useNavigate();
  const today      = localToday();
  const pageStyle  = usePageShellStyle({ maxWidth: 880, gap: 24 });

  const [loading, setLoading] = useState(true);

  /* today standup */
  const [submittedToday, setSubmittedToday] = useState(false);

  /* leave */
  const [onLeaveToday, setOnLeaveToday] = useState(false);

  /* stats */
  const [activeTickets, setActiveTickets] = useState(0);
  const [activeTasks,   setActiveTasks]   = useState(0);
  const [hoursMonth,    setHoursMonth]    = useState(0);
  const [streak,        setStreak]        = useState(0);

  /* lists */
  const [tickets,  setTickets]  = useState<{ ticket_ref: string; description: string; status: TicketStatus; customer_name: string }[]>([]);
  const [tasks,    setTasks]    = useState<{ id: string; title: string; status: TaskStatus; due_date: string | null }[]>([]);
  const [blockers, setBlockers] = useState<{ date: string; text: string }[]>([]);

  useEffect(() => {
    if (!member) return;
    const mid = member.id;

    Promise.all([
      /* today standup */
      supabase.from('standup_logs').select('id').eq('member_id', mid).eq('date', today).maybeSingle(),

      /* on leave today */
      supabase.from('leave_log').select('id').eq('member_id', mid)
        .lte('start_date', today).gte('end_date', today).maybeSingle(),

      /* active tickets — primary or secondary assignee */
      supabase.from('ticket_imports').select('ticket_ref, description, status, customer_name')
        .eq('primary_member_id', mid)
        .not('status', 'in', '("DEPLOYED","NO_ACTION")')
        .order('imported_at', { ascending: false })
        .limit(5),

      /* active tasks */
      supabase.from('tasks').select('id, title, status, due_date')
        .contains('assignees', [mid])
        .not('status', 'eq', 'Done')
        .order('due_date', { ascending: true, nullsFirst: false })
        .limit(5),

      /* hours this month */
      supabase.from('standup_logs').select('hours_spent').eq('member_id', mid)
        .gte('date', monthStart()),

      /* standup history for streak */
      supabase.from('standup_logs').select('date').eq('member_id', mid)
        .order('date', { ascending: false }).limit(60),

      /* recent blockers */
      supabase.from('standup_logs').select('date, blockers')
        .eq('member_id', mid)
        .not('blockers', 'is', null)
        .gte('date', (() => {
          const d = new Date(); d.setDate(d.getDate() - 7);
          return d.toISOString().split('T')[0];
        })())
        .order('date', { ascending: false }).limit(5),
    ]).then(([
      { data: todayLog },
      { data: leaveRow },
      { data: tkts },
      { data: tsks },
      { data: hours },
      { data: histDates },
      { data: bRows },
    ]) => {
      setSubmittedToday(!!todayLog);
      setOnLeaveToday(!!leaveRow);

      const tkList = (tkts ?? []) as typeof tickets;
      setTickets(tkList);
      setActiveTickets(tkList.length);

      const tsList = (tsks ?? []) as typeof tasks;
      setTasks(tsList);
      setActiveTasks(tsList.length);

      const totalHours = (hours ?? []).reduce((s, r) => s + (r.hours_spent ?? 0), 0);
      setHoursMonth(Math.round(totalHours * 10) / 10);

      /* streak: count consecutive days from today backwards */
      const dates = new Set((histDates ?? []).map(r => r.date));
      let s = 0;
      const cur = new Date(today + 'T00:00:00');
      while (true) {
        const key = cur.toISOString().split('T')[0];
        if (dates.has(key)) { s++; cur.setDate(cur.getDate() - 1); }
        else break;
      }
      setStreak(s);

      const bList = (bRows ?? [])
        .filter(r => r.blockers)
        .map(r => ({ date: r.date, text: r.blockers as string }));
      setBlockers(bList);

      setLoading(false);
    });
  }, [member]);

  if (loading) return <div style={{ padding: 32, color: 'var(--text3)', fontSize: 13 }}>Loading…</div>;

  return (
    <div style={pageStyle}>

      {/* ── Greeting ── */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--text)' }}>
            {greet()}, {member?.name.split(' ')[0]} 👋
          </div>
          <div style={{ fontSize: 13, color: 'var(--text3)', marginTop: 3 }}>{fmtDate(today)}</div>
        </div>

        {/* Standup CTA */}
        {onLeaveToday ? (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '8px 16px', borderRadius: 99,
            background: 'var(--amber-dim)', border: '1px solid var(--amber)33',
            fontSize: 12, fontWeight: 600, color: 'var(--amber)',
          }}>
            <Plane size={13} /> On leave today
          </div>
        ) : submittedToday ? (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '8px 16px', borderRadius: 99,
            background: 'var(--green-dim)', border: '1px solid var(--green)33',
            fontSize: 12, fontWeight: 600, color: 'var(--green)',
          }}>
            <Check size={13} /> Standup submitted
          </div>
        ) : (
          <button
            onClick={() => navigate('/member/standup')}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '9px 18px', borderRadius: 8, border: 'none',
              background: 'var(--accent)', color: '#fff', fontSize: 13, fontWeight: 600,
              cursor: 'pointer', fontFamily: 'var(--font-sans)',
            }}
          >
            <Check size={14} /> Submit standup
          </button>
        )}
      </div>

      {/* ── KPI strip ── */}
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        <StatCard
          icon={<Ticket size={15} />}
          label="Active tickets"
          value={activeTickets}
          sub="assigned to you"
          accent="var(--blue)"
          onClick={() => navigate('/member/tasks')}
        />
        <StatCard
          icon={<ListTodo size={15} />}
          label="Open tasks"
          value={activeTasks}
          sub="pending or in progress"
          accent="var(--accent)"
          onClick={() => navigate('/member/tasks')}
        />
        <StatCard
          icon={<Clock size={15} />}
          label="Hours this month"
          value={hoursMonth}
          sub="logged via standup"
          accent="var(--purple)"
        />
        <StatCard
          icon={<Flame size={15} />}
          label="Standup streak"
          value={streak}
          sub={streak === 1 ? 'day in a row' : 'days in a row'}
          accent={streak >= 5 ? 'var(--green)' : streak >= 2 ? 'var(--amber)' : 'var(--text3)'}
        />
      </div>

      {/* ── Open blockers ── */}
      {blockers.length > 0 && (
        <div>
          <SectionHeader title="Open blockers" action="Log standup" onAction={() => navigate('/member/standup')} />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {blockers.map((b, i) => <BlockerRow key={i} date={b.date} text={b.text} />)}
          </div>
        </div>
      )}

      {/* ── My tickets ── */}
      <div>
        <SectionHeader title="My tickets" action="See all" onAction={() => navigate('/member/tasks')} />
        {tickets.length === 0 ? (
          <div style={{
            padding: '24px 20px', borderRadius: 10, textAlign: 'center',
            background: 'var(--bg2)', border: '1px dashed var(--border2)',
            fontSize: 13, color: 'var(--text3)',
          }}>
            No active tickets assigned to you.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {tickets.map(t => <TicketRow key={t.ticket_ref} ticket={t} />)}
          </div>
        )}
      </div>

      {/* ── My tasks ── */}
      <div>
        <SectionHeader title="My tasks" action="See all" onAction={() => navigate('/member/tasks')} />
        {tasks.length === 0 ? (
          <div style={{
            padding: '24px 20px', borderRadius: 10, textAlign: 'center',
            background: 'var(--bg2)', border: '1px dashed var(--border2)',
            fontSize: 13, color: 'var(--text3)',
          }}>
            No open tasks assigned to you.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {tasks.map(t => <TaskRow key={t.id} task={t} />)}
          </div>
        )}
      </div>

    </div>
  );
}
