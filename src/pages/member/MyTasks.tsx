import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../hooks/useAuth';
import { useIsMobile } from '../../hooks/useIsMobile';
import { usePageShellStyle } from '../../hooks/usePageShellStyle';
import type { TicketStatus, TaskStatus } from '../../types';

/* ── helpers ── */
function localToday(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/* ── colour maps ── */
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

const TICKET_STATUS_ORDER: TicketStatus[] = ['OPEN', 'IN_PROGRESS', 'QC', 'TO_DEPLOY', 'DEPLOYED', 'NO_ACTION', 'REOPEN'];
const TASK_STATUS_ORDER:   TaskStatus[]   = ['Pending', 'In Progress', 'Blocked', 'QC', 'Done'];

/* ── Pill filter ── */
function Pill({ label, active, color, onClick }: { label: string; active: boolean; color?: string; onClick: () => void }) {
  const c = color ?? 'var(--accent)';
  return (
    <button onClick={onClick} style={{
      padding: '4px 12px', borderRadius: 99,
      border: `1px solid ${active ? c : 'var(--border2)'}`,
      background: active ? `${c}18` : 'transparent',
      color: active ? c : 'var(--text2)',
      fontSize: 12, fontWeight: active ? 700 : 400,
      cursor: 'pointer', fontFamily: 'var(--font-sans)', transition: 'all 0.1s',
    }}>
      {label}
    </button>
  );
}

/* ── Tab ── */
function Tab({ label, active, count, onClick }: { label: string; active: boolean; count: number; onClick: () => void }) {
  return (
    <button onClick={onClick} style={{
      padding: '9px 20px', border: 'none', background: 'none', cursor: 'pointer',
      fontSize: 13, fontWeight: active ? 700 : 500,
      color: active ? 'var(--accent)' : 'var(--text3)',
      borderBottom: `2px solid ${active ? 'var(--accent)' : 'transparent'}`,
      fontFamily: 'var(--font-sans)', transition: 'all 0.12s',
      display: 'flex', alignItems: 'center', gap: 6,
    }}>
      {label}
      <span style={{
        fontSize: 11, fontWeight: 700, padding: '1px 6px', borderRadius: 99,
        background: active ? 'var(--accent-dim)' : 'var(--bg3)',
        color: active ? 'var(--accent)' : 'var(--text3)',
      }}>
        {count}
      </span>
    </button>
  );
}

/* ── Ticket card ── */
interface TicketRow {
  id: string;
  ticket_ref: string;
  description: string;
  status: TicketStatus;
  customer_name: string;
  module_name: string;
  is_bug: boolean;
  priority: 1 | 2;
  expected_date: string | null;
  primary_member_id: string | null;
}

function TicketCard({ ticket, myId }: { ticket: TicketRow; myId: string }) {
  const color   = TICKET_COLOR[ticket.status] ?? 'var(--text3)';
  const today   = localToday();
  const overdue = ticket.expected_date && !['DEPLOYED', 'NO_ACTION'].includes(ticket.status) && ticket.expected_date < today;
  const isSecondary = ticket.primary_member_id !== myId;

  return (
    <div style={{
      background: 'var(--bg2)',
      border: `1px solid ${ticket.status === 'OPEN' && !overdue ? 'var(--border)' : overdue ? 'var(--red)33' : 'var(--border)'}`,
      borderRadius: 10, padding: '12px 16px',
      display: 'flex', alignItems: 'center', gap: 14,
    }}>
      {/* Priority */}
      <div style={{
        width: 24, flexShrink: 0, textAlign: 'center',
        fontSize: 10, fontWeight: 800,
        color: ticket.priority === 1 ? 'var(--red)' : 'var(--text3)',
      }}>
        P{ticket.priority}
      </div>

      {/* Info */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <span style={{
            fontSize: 11, fontWeight: 700, color: 'var(--accent)',
            fontFamily: 'var(--font-mono)', background: 'var(--accent-dim)',
            borderRadius: 4, padding: '2px 7px', flexShrink: 0,
          }}>
            {ticket.ticket_ref}
          </span>
          <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {ticket.description || ticket.customer_name}
          </span>
          {ticket.is_bug && (
            <span style={{
              fontSize: 10, fontWeight: 700, padding: '1px 5px', borderRadius: 3,
              background: 'var(--red-dim)', color: 'var(--red)', flexShrink: 0,
            }}>BUG</span>
          )}
          {isSecondary && (
            <span style={{
              fontSize: 10, fontWeight: 700, padding: '1px 5px', borderRadius: 3,
              background: 'var(--bg4)', color: 'var(--text3)', flexShrink: 0,
            }}>CO-ASSIGNED</span>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 4, flexWrap: 'wrap' }}>
          {ticket.module_name && (
            <span style={{ fontSize: 11, color: 'var(--text3)' }}>{ticket.module_name}</span>
          )}
          {ticket.customer_name && ticket.description && (
            <span style={{ fontSize: 11, color: 'var(--text3)' }}>{ticket.customer_name}</span>
          )}
          {ticket.expected_date && (
            <span style={{ fontSize: 11, color: overdue ? 'var(--red)' : 'var(--text3)', fontWeight: overdue ? 600 : 400 }}>
              {overdue ? '⚠ Overdue · ' : 'Expected '}
              {new Date(ticket.expected_date + 'T00:00:00').toLocaleDateString('en-MY', { day: 'numeric', month: 'short' })}
            </span>
          )}
        </div>
      </div>

      {/* Status badge */}
      <span style={{
        fontSize: 10, fontWeight: 700, padding: '3px 9px', borderRadius: 6,
        background: `${color}18`, border: `1px solid ${color}33`, color, flexShrink: 0,
      }}>
        {ticket.status.replace('_', ' ')}
      </span>
    </div>
  );
}

/* ── Task card ── */
interface TaskRow {
  id: string;
  title: string;
  type: string;
  status: TaskStatus;
  priority: 1 | 2;
  due_date: string | null;
  est_days: number | null;
  actual_days: number | null;
  remarks: string | null;
  jira_ref: string | null;
  assignees: string[];
}

const TYPE_COLOR: Record<string, string> = {
  Migration:   'var(--purple)',
  Performance: 'var(--blue)',
  'Bug fix':   'var(--red)',
  Infra:       'var(--amber)',
  Integration: 'var(--accent)',
  Other:       'var(--text3)',
};

function TaskCard({ task }: { task: TaskRow }) {
  const isMobile = useIsMobile();
  const color   = TASK_COLOR[task.status] ?? 'var(--text3)';
  const today   = localToday();
  const overdue = task.due_date && task.status !== 'Done' && task.due_date < today;

  return (
    <div style={{
      background: 'var(--bg2)',
      border: `1px solid ${task.status === 'Blocked' ? 'var(--red)33' : overdue ? 'var(--amber)33' : 'var(--border)'}`,
      borderRadius: 10, padding: '12px 16px',
      display: 'flex',
      flexDirection: isMobile ? 'column' : 'row',
      alignItems: isMobile ? 'stretch' : 'center',
      gap: isMobile ? 10 : 14,
    }}>
      {/* Priority */}
      <div style={{
        width: isMobile ? 'auto' : 24, flexShrink: 0, textAlign: isMobile ? 'left' : 'center',
        fontSize: 10, fontWeight: 800,
        color: task.priority === 1 ? 'var(--red)' : 'var(--text3)',
      }}>
        P{task.priority}
      </div>

      {/* Info */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {task.title}
          </span>
          <span style={{
            fontSize: 10, fontWeight: 700, padding: '1px 6px', borderRadius: 3, flexShrink: 0,
            color: TYPE_COLOR[task.type] ?? 'var(--text3)',
            background: `${TYPE_COLOR[task.type] ?? 'var(--text3)'}18`,
            textTransform: 'uppercase', letterSpacing: '0.04em',
          }}>
            {task.type}
          </span>
          {task.jira_ref && (
            <span style={{
              fontSize: 10, color: 'var(--accent)', fontFamily: 'var(--font-mono)',
              background: 'var(--accent-dim)', borderRadius: 3, padding: '1px 6px', flexShrink: 0,
            }}>
              {task.jira_ref}
            </span>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 4, flexWrap: 'wrap' }}>
          {task.due_date && (
            <span style={{ fontSize: 11, color: overdue ? 'var(--red)' : 'var(--text3)', fontWeight: overdue ? 600 : 400 }}>
              {overdue ? '⚠ Overdue · ' : 'Due '}
              {new Date(task.due_date + 'T00:00:00').toLocaleDateString('en-MY', { day: 'numeric', month: 'short' })}
            </span>
          )}
          {task.est_days != null && (
            <span style={{ fontSize: 11, color: 'var(--text3)' }}>
              {task.actual_days != null ? `${task.actual_days}/${task.est_days}d` : `${task.est_days}d est`}
            </span>
          )}
          {task.remarks && (
            <span style={{ fontSize: 11, color: 'var(--text3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {task.remarks}
            </span>
          )}
        </div>
      </div>

      <span style={{
        fontSize: 10, fontWeight: 700, padding: '6px 10px', borderRadius: 6,
        background: `${color}18`, border: `1px solid ${color}33`, color, flexShrink: 0,
        alignSelf: isMobile ? 'flex-start' : 'center',
      }}>
        {task.status}
      </span>
    </div>
  );
}

/* ── Main ── */
export default function MyTasks() {
  const { member } = useAuth();
  const isMobile = useIsMobile();
  const pageStyle = usePageShellStyle({ maxWidth: 960, gap: 20 });

  const [tab, setTab]   = useState<'tickets' | 'tasks'>('tickets');
  const [loading, setLoading] = useState(true);

  const [tickets, setTickets] = useState<TicketRow[]>([]);
  const [tasks,   setTasks]   = useState<TaskRow[]>([]);

  const [ticketFilter, setTicketFilter] = useState<TicketStatus | ''>('');
  const [taskFilter,   setTaskFilter]   = useState<TaskStatus   | ''>('');
  const [search, setSearch]             = useState('');

  useEffect(() => {
    if (!member) return;
    const mid = member.id;

    Promise.all([
      supabase.from('ticket_imports')
        .select('id, ticket_ref, description, status, customer_name, module_name, is_bug, priority, expected_date, primary_member_id')
        .eq('primary_member_id', mid)
        .order('imported_at', { ascending: false }),

      supabase.from('tasks')
        .select('id, title, type, status, priority, due_date, est_days, actual_days, remarks, jira_ref, assignees')
        .contains('assignees', [mid])
        .order('due_date', { ascending: true, nullsFirst: false }),
    ]).then(([{ data: tkts }, { data: tsks }]) => {
      setTickets((tkts ?? []) as TicketRow[]);
      setTasks((tsks   ?? []) as TaskRow[]);
      setLoading(false);
    });
  }, [member]);

  /* filtered lists */
  const filteredTickets = tickets.filter(t => {
    if (ticketFilter && t.status !== ticketFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      if (!t.ticket_ref.toLowerCase().includes(q) &&
          !t.description.toLowerCase().includes(q) &&
          !t.customer_name.toLowerCase().includes(q)) return false;
    }
    return true;
  });

  const filteredTasks = tasks.filter(t => {
    if (taskFilter && t.status !== taskFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      if (!t.title.toLowerCase().includes(q) && !(t.jira_ref ?? '').toLowerCase().includes(q)) return false;
    }
    return true;
  });

  /* status counts */
  const ticketCounts = TICKET_STATUS_ORDER.reduce((acc, s) => {
    acc[s] = tickets.filter(t => t.status === s).length;
    return acc;
  }, {} as Record<TicketStatus, number>);

  const taskCounts = TASK_STATUS_ORDER.reduce((acc, s) => {
    acc[s] = tasks.filter(t => t.status === s).length;
    return acc;
  }, {} as Record<TaskStatus, number>);

  const activeTicketCount = tickets.filter(t => !['DEPLOYED', 'NO_ACTION'].includes(t.status)).length;
  const activeTaskCount   = tasks.filter(t => t.status !== 'Done').length;

  if (loading) return <div style={{ padding: 'max(24px, env(safe-area-inset-top)) 16px', color: 'var(--text3)', fontSize: 13 }}>Loading…</div>;

  return (
    <div style={pageStyle}>

      {/* ── Header ── */}
      <div>
        <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--text)' }}>My Work</div>
        <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 2 }}>
          {activeTicketCount} active ticket{activeTicketCount !== 1 ? 's' : ''} · {activeTaskCount} open task{activeTaskCount !== 1 ? 's' : ''}
        </div>
      </div>

      {/* ── Tabs ── */}
      <div style={{ display: 'flex', borderBottom: '1px solid var(--border)', gap: 0, marginBottom: -8 }}>
        <Tab label="Tickets" active={tab === 'tickets'} count={tickets.length}  onClick={() => { setTab('tickets'); setSearch(''); }} />
        <Tab label="Tasks"   active={tab === 'tasks'}   count={tasks.length}    onClick={() => { setTab('tasks');   setSearch(''); }} />
      </div>

      {/* ── Filters ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', rowGap: 10 }}>
        {tab === 'tickets' ? (
          <>
            <Pill label="All" active={!ticketFilter} onClick={() => setTicketFilter('')} />
            {TICKET_STATUS_ORDER.filter(s => (ticketCounts[s] ?? 0) > 0).map(s => (
              <Pill
                key={s}
                label={`${s.replace('_', ' ')} (${ticketCounts[s]})`}
                active={ticketFilter === s}
                color={TICKET_COLOR[s]}
                onClick={() => setTicketFilter(ticketFilter === s ? '' : s)}
              />
            ))}
          </>
        ) : (
          <>
            <Pill label="All" active={!taskFilter} onClick={() => setTaskFilter('')} />
            {TASK_STATUS_ORDER.filter(s => (taskCounts[s] ?? 0) > 0).map(s => (
              <Pill
                key={s}
                label={`${s} (${taskCounts[s]})`}
                active={taskFilter === s}
                color={TASK_COLOR[s]}
                onClick={() => setTaskFilter(taskFilter === s ? '' : s)}
              />
            ))}
          </>
        )}

        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder={tab === 'tickets' ? 'Search ref or description…' : 'Search title or ref…'}
          style={{
            marginLeft: isMobile ? 0 : 'auto',
            flex: isMobile ? '1 1 100%' : '0 0 auto',
            minWidth: isMobile ? 0 : 200,
            maxWidth: isMobile ? '100%' : 280,
            padding: '8px 12px', borderRadius: 7,
            border: '1px solid var(--border2)', background: 'var(--bg2)',
            color: 'var(--text)', fontSize: 16, outline: 'none',
            fontFamily: 'var(--font-sans)',
          }}
        />
      </div>

      {/* ── Content ── */}
      {tab === 'tickets' ? (
        filteredTickets.length === 0 ? (
          <EmptyState
            emoji="🎫"
            title={tickets.length === 0 ? 'No tickets assigned to you' : 'No tickets match filter'}
            sub={tickets.length === 0 ? 'Tickets assigned by the manager will appear here.' : 'Try clearing the filter.'}
          />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {filteredTickets.map(t => (
              <TicketCard key={t.id} ticket={t} myId={member?.id ?? ''} />
            ))}
          </div>
        )
      ) : (
        filteredTasks.length === 0 ? (
          <EmptyState
            emoji="✅"
            title={tasks.length === 0 ? 'No tasks assigned to you' : 'No tasks match filter'}
            sub={tasks.length === 0 ? 'Tasks assigned by the manager will appear here.' : 'Try clearing the filter.'}
          />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {filteredTasks.map(t => <TaskCard key={t.id} task={t} />)}
          </div>
        )
      )}
    </div>
  );
}

function EmptyState({ emoji, title, sub }: { emoji: string; title: string; sub: string }) {
  return (
    <div style={{
      background: 'var(--bg2)', border: '1px dashed var(--border2)',
      borderRadius: 12, padding: '48px 32px', textAlign: 'center', color: 'var(--text3)',
    }}>
      <div style={{ fontSize: 28, marginBottom: 10 }}>{emoji}</div>
      <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text)', marginBottom: 6 }}>{title}</div>
      <div style={{ fontSize: 13 }}>{sub}</div>
    </div>
  );
}
