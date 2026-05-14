import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronLeft, ChevronRight, CheckCircle, XCircle, Plane } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import Avatar from '../../components/UI/Avatar';
import { usePageShellStyle } from '../../hooks/usePageShellStyle';
import { useAuth } from '../../hooks/useAuth';
import type { Member } from '../../types';

type TType = 'Ticket' | 'Adhoc' | 'Migration' | 'Bug fix' | 'Performance' | 'Other';

interface TaskEntry {
  type: TType;
  ticket_ref: string;
  desc: string;
}

const TYPE_COLOR: Record<TType, string> = {
  Ticket:      'var(--accent)',
  Adhoc:       'var(--amber)',
  Migration:   'var(--purple)',
  'Bug fix':   'var(--red)',
  Performance: 'var(--blue)',
  Other:       'var(--text3)',
};

function parseTasks(raw: string | null): TaskEntry[] | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed as TaskEntry[];
    return null;
  } catch {
    return null;
  }
}

function TaskDisplay({ tasks, plain }: { tasks: TaskEntry[] | null; plain: string | null }) {
  if (tasks && tasks.length > 0) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {tasks.map((t, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
            <span style={{
              fontSize: 10, fontWeight: 700, color: TYPE_COLOR[t.type] ?? 'var(--text3)',
              background: `${TYPE_COLOR[t.type] ?? 'var(--text3)'}18`,
              borderRadius: 4, padding: '2px 6px', flexShrink: 0, marginTop: 1,
              textTransform: 'uppercase', letterSpacing: '0.04em',
            }}>{t.type}</span>
            {t.ticket_ref && (
              <span style={{
                fontSize: 10, fontWeight: 600, color: 'var(--accent)',
                fontFamily: 'var(--font-mono)', background: 'var(--accent-dim)',
                borderRadius: 4, padding: '2px 6px', flexShrink: 0, marginTop: 1,
              }}>{t.ticket_ref}</span>
            )}
            <span style={{ fontSize: 13, color: 'var(--text)', lineHeight: 1.5 }}>{t.desc}</span>
          </div>
        ))}
      </div>
    );
  }
  if (plain) {
    return <div style={{ fontSize: 13, color: 'var(--text)', lineHeight: 1.6 }}>{plain}</div>;
  }
  return null;
}

function localToday(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function fmtDate(dateStr: string): string {
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-MY', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  });
}

function addDays(dateStr: string, n: number): string {
  const d = new Date(dateStr + 'T00:00:00');
  d.setDate(d.getDate() + n);
  return d.toISOString().split('T')[0];
}

interface StandupRow {
  id: string;
  member_id: string;
  product_id: string | null;
  date: string;
  task_type: string;
  yesterday: string | null;
  today: string | null;
  blockers: string | null;
  hours_spent: number;
  ticket_ref: string | null;
}

interface LeaveRow {
  member_id: string;
  start_date: string;
  end_date: string;
  type: string;
}

interface ProductMap {
  [id: string]: string;
}

function StatusChip({ label, count, color, icon }: { label: string; count: number; color: string; icon: React.ReactNode }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 6,
      padding: '6px 14px', borderRadius: 99,
      background: 'var(--bg2)', border: '1px solid var(--border)',
      fontSize: 13, color,
    }}>
      {icon}
      <span style={{ fontWeight: 700 }}>{count}</span>
      <span style={{ color: 'var(--text2)', fontWeight: 400 }}>{label}</span>
    </div>
  );
}

export default function ManagerStandup() {
  const { member: me } = useAuth();
  const today = localToday();
  const pageStyle = usePageShellStyle({ maxWidth: 880, gap: 24 });
  const [date, setDate]           = useState(today);
  const [members, setMembers]     = useState<Member[]>([]);
  const [standups, setStandups]   = useState<StandupRow[]>([]);
  const [leaves, setLeaves]       = useState<LeaveRow[]>([]);
  const [products, setProducts]   = useState<ProductMap>({});
  const [loading, setLoading]     = useState(true);
  const [expanded, setExpanded]   = useState<Set<string>>(new Set());

  /* Load members + products once */
  useEffect(() => {
    Promise.all([
      supabase.from('members').select('*').eq('active', true).in('role', ['owner', 'admin', 'member']).order('name'),
      supabase.from('products').select('id, name'),
    ]).then(([{ data: mems }, { data: prods }]) => {
      setMembers(mems ?? []);
      const pm: ProductMap = {};
      (prods ?? []).forEach(p => { pm[p.id] = p.name; });
      setProducts(pm);
    });
  }, []);

  /* Load standups + leaves when date changes */
  useEffect(() => {
    setLoading(true);
    Promise.all([
      supabase.from('standup_logs').select('*').eq('date', date),
      supabase.from('leave_log').select('member_id, start_date, end_date, type')
        .lte('start_date', date).gte('end_date', date),
    ]).then(([{ data: slog }, { data: llog }]) => {
      setStandups(slog ?? []);
      setLeaves(llog ?? []);
      setLoading(false);
    });
  }, [date]);

  const standupMap = new Map<string, StandupRow>(standups.map(s => [s.member_id, s]));
  const leaveSet   = new Set<string>(leaves.map(l => l.member_id));

  const submitted = members.filter(m => standupMap.has(m.id)).length;
  const onLeave   = members.filter(m => leaveSet.has(m.id) && !standupMap.has(m.id)).length;
  const missing   = members.length - submitted - onLeave;

  // Count task types across all today fields for the day
  const typeCounts = (() => {
    const counts: Partial<Record<TType, number>> = {};
    for (const s of standups) {
      const tasks = parseTasks(s.today);
      if (tasks) {
        for (const t of tasks) {
          counts[t.type] = (counts[t.type] ?? 0) + 1;
        }
      } else if (s.task_type) {
        // legacy fallback
        const tt = s.task_type as TType;
        counts[tt] = (counts[tt] ?? 0) + 1;
      }
    }
    return counts;
  })();

  const TYPE_ORDER: TType[] = ['Ticket', 'Bug fix', 'Adhoc', 'Migration', 'Performance', 'Other'];
  const activeTypeCounts = TYPE_ORDER.filter(t => (typeCounts[t] ?? 0) > 0);

  function toggleExpand(id: string) {
    setExpanded(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  const isToday = date === today;

  return (
    <div style={pageStyle}>

      {/* ── Date navigation ── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button onClick={() => setDate(d => addDays(d, -1))} style={{
            background: 'none', border: '1px solid var(--border2)', borderRadius: 6,
            padding: '6px 9px', cursor: 'pointer', color: 'var(--text2)', display: 'flex',
          }}>
            <ChevronLeft size={15} />
          </button>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text)' }}>
              {isToday ? 'Today' : new Date(date + 'T00:00:00').toLocaleDateString('en-MY', { weekday: 'short', day: 'numeric', month: 'short' })}
            </div>
            <div style={{ fontSize: 11, color: 'var(--text3)' }}>{fmtDate(date)}</div>
          </div>
          <button onClick={() => setDate(d => addDays(d, 1))} disabled={date >= today} style={{
            background: 'none', border: '1px solid var(--border2)', borderRadius: 6,
            padding: '6px 9px', cursor: date >= today ? 'not-allowed' : 'pointer',
            color: 'var(--text2)', display: 'flex', opacity: date >= today ? 0.4 : 1,
          }}>
            <ChevronRight size={15} />
          </button>
          {!isToday && (
            <button onClick={() => setDate(today)} style={{
              padding: '5px 12px', borderRadius: 99, border: '1px solid var(--border2)',
              background: 'transparent', color: 'var(--accent)', fontSize: 12, fontWeight: 600,
              cursor: 'pointer', fontFamily: 'var(--font-sans)',
            }}>Today</button>
          )}
        </div>

        {/* Summary chips */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'flex-end' }}>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
            <StatusChip label="submitted"  count={submitted} color="var(--green)"  icon={<CheckCircle size={14} />} />
            <StatusChip label="missing"    count={missing}   color="var(--red)"    icon={<XCircle size={14} />} />
            {onLeave > 0 && (
              <StatusChip label="on leave" count={onLeave}   color="var(--amber)"  icon={<Plane size={14} />} />
            )}
          </div>
          {/* Task type breakdown */}
          {activeTypeCounts.length > 0 && (
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
              {activeTypeCounts.map(type => (
                <div key={type} style={{
                  display: 'flex', alignItems: 'center', gap: 5,
                  padding: '3px 10px', borderRadius: 99,
                  background: `${TYPE_COLOR[type]}14`,
                  border: `1px solid ${TYPE_COLOR[type]}33`,
                  fontSize: 11,
                }}>
                  <span style={{ fontWeight: 700, color: TYPE_COLOR[type] }}>{typeCounts[type]}</span>
                  <span style={{ color: 'var(--text3)' }}>{type}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {isToday && me && !loading && !leaveSet.has(me.id) && !standupMap.has(me.id) && (
        <div style={{
          padding: '12px 14px',
          borderRadius: 10,
          border: '1px solid var(--amber)44',
          background: 'var(--amber-dim)',
          fontSize: 13,
          color: 'var(--text)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
          flexWrap: 'wrap',
        }}>
          <span>You have not submitted standup for today yet.</span>
          <Link
            to="/manager/my-standup"
            style={{
              fontWeight: 600,
              color: 'var(--accent)',
              textDecoration: 'none',
              whiteSpace: 'nowrap',
            }}
          >
            Fill my standup →
          </Link>
        </div>
      )}

      {/* ── Member list ── */}
      {loading ? (
        <div style={{ color: 'var(--text3)', fontSize: 13 }}>Loading…</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {members.map(member => {
            const log       = standupMap.get(member.id);
            const isOnLeave = leaveSet.has(member.id) && !log;
            const isOpen    = expanded.has(member.id);

            return (
              <div
                key={member.id}
                style={{
                  background: 'var(--bg2)',
                  border: `1px solid ${log ? 'var(--green)22' : isOnLeave ? 'var(--amber)22' : 'var(--border)'}`,
                  borderRadius: 10,
                  overflow: 'hidden',
                }}
              >
                {/* Header row */}
                <div
                  onClick={() => log && toggleExpand(member.id)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 12,
                    padding: '12px 16px',
                    cursor: log ? 'pointer' : 'default',
                  }}
                >
                  <Avatar name={member.name} color={member.avatar_color} size="sm" />

                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)' }}>{member.name}</div>
                    <div style={{ fontSize: 11, color: 'var(--text3)', textTransform: 'capitalize' }}>{member.role}</div>
                  </div>

                  {log ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                      {/* Task type pills from today's tasks */}
                      {(() => {
                        const tasks = parseTasks(log.today);
                        if (!tasks) return null;
                        const seen = new Set<string>();
                        return tasks
                          .filter(t => { if (seen.has(t.type)) return false; seen.add(t.type); return true; })
                          .map(t => (
                            <span key={t.type} style={{
                              fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 3,
                              color: TYPE_COLOR[t.type] ?? 'var(--text3)',
                              background: `${TYPE_COLOR[t.type] ?? 'var(--text3)'}18`,
                              textTransform: 'uppercase', letterSpacing: '0.04em',
                            }}>{t.type}</span>
                          ));
                      })()}
                      {log.product_id && products[log.product_id] && (
                        <span style={{ fontSize: 11, color: 'var(--text3)' }}>{products[log.product_id]}</span>
                      )}
                      <span style={{
                        display: 'flex', alignItems: 'center', gap: 4,
                        fontSize: 11, fontWeight: 600, color: 'var(--green)',
                      }}>
                        <CheckCircle size={13} /> Submitted
                      </span>
                      <ChevronRight size={14} color="var(--text3)" style={{ transform: isOpen ? 'rotate(90deg)' : undefined, transition: 'transform 0.15s' }} />
                    </div>
                  ) : isOnLeave ? (
                    <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, color: 'var(--amber)' }}>
                      <Plane size={13} /> On leave
                    </span>
                  ) : (
                    <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, color: 'var(--red)' }}>
                      <XCircle size={13} /> No standup
                    </span>
                  )}
                </div>

                {/* Expanded detail */}
                {log && isOpen && (
                  <div style={{
                    borderTop: '1px solid var(--border)',
                    padding: '14px 16px 16px',
                    display: 'flex', flexDirection: 'column', gap: 14,
                  }}>
                    {([
                      { label: 'Yesterday', tasks: parseTasks(log.yesterday), plain: log.yesterday },
                      { label: 'Today',     tasks: parseTasks(log.today),     plain: log.today },
                    ] as const).map(f => {
                      const isJson = f.tasks !== null;
                      const hasContent = isJson ? f.tasks!.length > 0 : !!f.plain;
                      if (!hasContent) return null;
                      return (
                        <div key={f.label}>
                          <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>
                            {f.label}
                          </div>
                          <TaskDisplay tasks={isJson ? f.tasks : null} plain={isJson ? null : f.plain} />
                        </div>
                      );
                    })}
                    {log.blockers && (
                      <div>
                        <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--red)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>
                          Blockers
                        </div>
                        <div style={{ fontSize: 13, color: 'var(--text)', lineHeight: 1.6 }}>{log.blockers}</div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
