import { useEffect, useRef, useState } from 'react';
import { Plus, X, Trash2, ChevronLeft, ChevronRight, Plane } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../hooks/useAuth';
import Avatar from '../../components/UI/Avatar';
import type { Member, LeaveLog as LeaveLogType, LeaveType } from '../../types';

/* ── constants ── */
const LEAVE_TYPES: LeaveType[] = ['Annual Leave', 'MC', 'Emergency'];

const LEAVE_COLOR: Record<LeaveType, string> = {
  'Annual Leave': 'var(--accent)',
  'MC':           'var(--amber)',
  'Emergency':    'var(--red)',
};

/* ── helpers ── */
function localToday(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function monthStart(offset = 0): string {
  const d = new Date();
  d.setDate(1);
  d.setMonth(d.getMonth() + offset);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
}

function monthEnd(offset = 0): string {
  const d = new Date();
  d.setMonth(d.getMonth() + offset + 1);
  d.setDate(0);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function fmtDateRange(start: string, end: string): string {
  const s = new Date(start + 'T00:00:00');
  const e = new Date(end   + 'T00:00:00');
  if (start === end) {
    return s.toLocaleDateString('en-MY', { day: 'numeric', month: 'short', year: 'numeric' });
  }
  if (s.getMonth() === e.getMonth() && s.getFullYear() === e.getFullYear()) {
    return `${s.toLocaleDateString('en-MY', { day: 'numeric' })} – ${e.toLocaleDateString('en-MY', { day: 'numeric', month: 'short', year: 'numeric' })}`;
  }
  return `${s.toLocaleDateString('en-MY', { day: 'numeric', month: 'short' })} – ${e.toLocaleDateString('en-MY', { day: 'numeric', month: 'short', year: 'numeric' })}`;
}

function countDays(start: string, end: string, isHalfDay = false): number {
  if (isHalfDay) return 0.5;
  const s = new Date(start + 'T00:00:00');
  const e = new Date(end   + 'T00:00:00');
  return Math.max(1, Math.round((e.getTime() - s.getTime()) / 86400000) + 1);
}

function isOnLeaveToday(row: LeaveLogType): boolean {
  const today = localToday();
  return row.start_date <= today && row.end_date >= today;
}

function monthLabel(offset: number): string {
  const d = new Date();
  d.setMonth(d.getMonth() + offset);
  return d.toLocaleDateString('en-MY', { month: 'long', year: 'numeric' });
}

/* ── shared input style ── */
const inp: React.CSSProperties = {
  padding: '8px 10px', borderRadius: 7,
  border: '1px solid var(--border2)', background: 'var(--bg3)',
  color: 'var(--text)', fontSize: 13, outline: 'none',
  fontFamily: 'var(--font-sans)', width: '100%',
};

const labelStyle: React.CSSProperties = {
  display: 'block', fontSize: 11, fontWeight: 600,
  color: 'var(--text2)', marginBottom: 5, textTransform: 'uppercase', letterSpacing: '0.04em',
};

/* ── Leave type badge ── */
function LeaveBadge({ type }: { type: LeaveType }) {
  const color = LEAVE_COLOR[type];
  return (
    <span style={{
      fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 5,
      background: `${color}18`, border: `1px solid ${color}33`,
      color, whiteSpace: 'nowrap',
    }}>
      {type}
    </span>
  );
}

/* ── Modal ── */
type LeaveInsert = Omit<LeaveLogType, 'id' | 'created_at'>;

interface LeaveFormProps {
  members: Member[];
  managerId: string;
  onSave: (row: LeaveInsert) => Promise<void>;
  onClose: () => void;
}

function LeaveModal({ members, managerId, onSave, onClose }: LeaveFormProps) {
  const [form, setForm] = useState({
    member_id:       '',
    type:            'Annual Leave' as LeaveType,
    start_date:      localToday(),
    end_date:        localToday(),
    reason:          '',
    submitted_by:    managerId,
    is_half_day:     false,
    half_day_period: 'AM' as 'AM' | 'PM',
  });

  const isSameDay = form.start_date === form.end_date;
  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState('');

  function patch(p: Partial<typeof form>) { setForm(f => ({ ...f, ...p })); }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.member_id)                 { setError('Select a team member.'); return; }
    if (form.end_date < form.start_date) { setError('End date must be on or after start date.'); return; }
    setSaving(true); setError('');
    const isHalf = isSameDay && form.is_half_day;
    await onSave({
      ...form,
      is_half_day:     isHalf,
      half_day_period: isHalf ? form.half_day_period : null,
    });
    setSaving(false);
  }

  const memberRef = useRef<HTMLSelectElement>(null);
  useEffect(() => { memberRef.current?.focus(); }, []);

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 200,
      background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(3px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24,
    }} onClick={onClose}>
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: 'var(--bg2)', border: '1px solid var(--border)',
          borderRadius: 14, padding: 28, width: '100%', maxWidth: 480,
          display: 'flex', flexDirection: 'column', gap: 18,
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text)', display: 'flex', alignItems: 'center', gap: 8 }}>
            <Plane size={16} color="var(--accent)" /> Log leave
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text3)', display: 'flex' }}>
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Member */}
          <div>
            <label style={labelStyle}>Team member <span style={{ color: 'var(--red)' }}>*</span></label>
            <select
              ref={memberRef}
              value={form.member_id}
              onChange={e => patch({ member_id: e.target.value })}
              style={{ ...inp, cursor: 'pointer', colorScheme: 'dark' }}
            >
              <option value="">— Select member —</option>
              {members.map(m => (
                <option key={m.id} value={m.id}>{m.name}</option>
              ))}
            </select>
          </div>

          {/* Leave type */}
          <div>
            <label style={labelStyle}>Leave type <span style={{ color: 'var(--red)' }}>*</span></label>
            <div style={{ display: 'flex', gap: 8 }}>
              {LEAVE_TYPES.map(t => {
                const active = form.type === t;
                const color  = LEAVE_COLOR[t];
                return (
                  <button
                    key={t} type="button"
                    onClick={() => patch({ type: t })}
                    style={{
                      flex: 1, padding: '8px 4px', borderRadius: 8,
                      border: `1px solid ${active ? color : 'var(--border2)'}`,
                      background: active ? `${color}18` : 'transparent',
                      color: active ? color : 'var(--text3)',
                      fontSize: 12, fontWeight: active ? 700 : 400,
                      cursor: 'pointer', fontFamily: 'var(--font-sans)',
                      transition: 'all 0.1s',
                    }}
                  >
                    {t}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Date range */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <label style={labelStyle}>Start date <span style={{ color: 'var(--red)' }}>*</span></label>
              <input
                type="date"
                value={form.start_date}
                onChange={e => {
                  const v = e.target.value;
                  patch({ start_date: v, end_date: v > form.end_date ? v : form.end_date });
                }}
                style={{ ...inp, colorScheme: 'dark' }}
              />
            </div>
            <div>
              <label style={labelStyle}>End date <span style={{ color: 'var(--red)' }}>*</span></label>
              <input
                type="date"
                value={form.end_date}
                min={form.start_date}
                onChange={e => patch({ end_date: e.target.value })}
                style={{ ...inp, colorScheme: 'dark' }}
              />
            </div>
          </div>

          {/* Half-day toggle — only shown when start = end */}
          {isSameDay && (
            <div>
              <label style={labelStyle}>Duration</label>
              <div style={{ display: 'flex', gap: 8 }}>
                {([false, true] as const).map(half => (
                  <button
                    key={String(half)}
                    type="button"
                    onClick={() => patch({ is_half_day: half })}
                    style={{
                      flex: 1, padding: '8px 4px', borderRadius: 8,
                      border: `1px solid ${form.is_half_day === half ? 'var(--accent)' : 'var(--border2)'}`,
                      background: form.is_half_day === half ? 'var(--accent-dim)' : 'transparent',
                      color: form.is_half_day === half ? 'var(--accent)' : 'var(--text3)',
                      fontSize: 13, fontWeight: form.is_half_day === half ? 700 : 400,
                      cursor: 'pointer', fontFamily: 'var(--font-sans)', transition: 'all 0.1s',
                    }}
                  >
                    {half ? 'Half day (0.5)' : 'Full day (1)'}
                  </button>
                ))}
              </div>
              {form.is_half_day && (
                <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                  {(['AM', 'PM'] as const).map(p => (
                    <button
                      key={p}
                      type="button"
                      onClick={() => patch({ half_day_period: p })}
                      style={{
                        flex: 1, padding: '7px 4px', borderRadius: 8,
                        border: `1px solid ${form.half_day_period === p ? 'var(--pink)' : 'var(--border2)'}`,
                        background: form.half_day_period === p ? 'var(--pink-dim)' : 'transparent',
                        color: form.half_day_period === p ? 'var(--pink)' : 'var(--text3)',
                        fontSize: 13, fontWeight: form.half_day_period === p ? 700 : 400,
                        cursor: 'pointer', fontFamily: 'var(--font-sans)', transition: 'all 0.1s',
                      }}
                    >
                      {p === 'AM' ? 'AM (morning)' : 'PM (afternoon)'}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Day count preview */}
          {form.start_date && form.end_date && form.start_date <= form.end_date && (
            <div style={{
              fontSize: 12, color: 'var(--text2)', background: 'var(--bg3)',
              borderRadius: 7, padding: '6px 12px', border: '1px solid var(--border)',
            }}>
              {(() => {
                const d = countDays(form.start_date, form.end_date, isSameDay && form.is_half_day);
                return `${d} day${d !== 1 ? 's' : ''}`;
              })()}
              {' '}· {fmtDateRange(form.start_date, form.end_date)}
              {isSameDay && form.is_half_day && (
                <span style={{ color: 'var(--pink)', fontWeight: 600 }}> · {form.half_day_period}</span>
              )}
            </div>
          )}

          {/* Reason */}
          <div>
            <label style={labelStyle}>Reason <span style={{ color: 'var(--text3)', fontWeight: 400 }}>(optional)</span></label>
            <textarea
              rows={2}
              value={form.reason}
              onChange={e => patch({ reason: e.target.value })}
              placeholder="e.g. Medical appointment, family emergency…"
              style={{ ...inp, resize: 'vertical' }}
            />
          </div>

          {error && (
            <div style={{
              fontSize: 12, color: 'var(--red)', background: 'var(--red-dim)',
              padding: '8px 12px', borderRadius: 7, border: '1px solid var(--red)33',
            }}>
              {error}
            </div>
          )}

          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', paddingTop: 4 }}>
            <button type="button" onClick={onClose} style={{
              padding: '9px 20px', borderRadius: 8, border: '1px solid var(--border2)',
              background: 'transparent', color: 'var(--text2)', fontSize: 13, fontWeight: 600,
              cursor: 'pointer', fontFamily: 'var(--font-sans)',
            }}>Cancel</button>
            <button type="submit" disabled={saving} style={{
              padding: '9px 24px', borderRadius: 8, border: 'none',
              background: 'var(--accent)', color: '#fff', fontSize: 13, fontWeight: 600,
              cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.6 : 1,
              fontFamily: 'var(--font-sans)',
            }}>
              {saving ? 'Saving…' : 'Log leave'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/* ── Leave row card ── */
function LeaveCard({
  row, member, onDelete,
}: {
  row: LeaveLogType;
  member: Member | undefined;
  onDelete: () => void;
}) {
  const today   = isOnLeaveToday(row);
  const days    = countDays(row.start_date, row.end_date, row.is_half_day);
  const isPast  = row.end_date < localToday();

  return (
    <div style={{
      background: 'var(--bg2)',
      border: `1px solid ${today ? 'var(--amber)33' : isPast ? 'var(--border)' : 'var(--accent)22'}`,
      borderRadius: 10, padding: '12px 16px',
      display: 'flex', alignItems: 'center', gap: 14,
      opacity: isPast ? 0.75 : 1,
    }}>
      {member ? (
        <Avatar name={member.name} color={member.avatar_color} size="sm" />
      ) : (
        <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'var(--bg3)' }} />
      )}

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)' }}>
            {member?.name ?? '—'}
          </span>
          <LeaveBadge type={row.type as LeaveType} />
          {row.is_half_day && row.half_day_period && (
            <span style={{
              fontSize: 10, fontWeight: 700, color: 'var(--pink)',
              background: 'var(--pink-dim)', borderRadius: 4, padding: '2px 6px',
            }}>
              ½ {row.half_day_period}
            </span>
          )}
          {today && (
            <span style={{
              fontSize: 10, fontWeight: 700, color: 'var(--amber)',
              background: 'var(--amber-dim)', borderRadius: 4, padding: '2px 6px',
            }}>ON LEAVE TODAY</span>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 12, color: 'var(--text2)' }}>
            {fmtDateRange(row.start_date, row.end_date)}
          </span>
          <span style={{ fontSize: 11, color: 'var(--text3)' }}>
            {days} day{days !== 1 ? 's' : ''}
          </span>
          {row.reason && (
            <span style={{ fontSize: 12, color: 'var(--text3)' }}>· {row.reason}</span>
          )}
        </div>
      </div>

      <button
        onClick={onDelete}
        title="Remove leave record"
        style={{
          background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text3)',
          display: 'flex', padding: 6, borderRadius: 6, flexShrink: 0,
          transition: 'color 0.1s',
        }}
        onMouseEnter={e => (e.currentTarget.style.color = 'var(--red)')}
        onMouseLeave={e => (e.currentTarget.style.color = 'var(--text3)')}
      >
        <Trash2 size={14} />
      </button>
    </div>
  );
}

/* ── Main ── */
export default function LeaveLog() {
  const { member: me } = useAuth();

  const [leaves, setLeaves]   = useState<LeaveLogType[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [monthOffset, setMonthOffset] = useState(0);
  const [memberFilter, setMemberFilter] = useState('');

  const memberMap = new Map(members.map(m => [m.id, m]));

  useEffect(() => {
    supabase
      .from('members')
      .select('*')
      .eq('active', true)
      .in('role', ['manager', 'member'])
      .order('name')
      .then(({ data }) => setMembers(data ?? []));
  }, []);

  useEffect(() => {
    loadLeaves();
  }, [monthOffset]);

  async function loadLeaves() {
    setLoading(true);
    const start = monthStart(monthOffset);
    const end   = monthEnd(monthOffset);

    const { data } = await supabase
      .from('leave_log')
      .select('*')
      .or(`and(start_date.lte.${end},end_date.gte.${start})`)
      .order('start_date', { ascending: false });

    setLeaves(data ?? []);
    setLoading(false);
  }

  async function handleSave(row: LeaveInsert) {
    await supabase.from('leave_log').insert(row);
    setShowModal(false);
    loadLeaves();
  }

  async function handleDelete(id: string) {
    if (!confirm('Remove this leave record?')) return;
    await supabase.from('leave_log').delete().eq('id', id);
    setLeaves(prev => prev.filter(l => l.id !== id));
  }

  const filtered = memberFilter
    ? leaves.filter(l => l.member_id === memberFilter)
    : leaves;

  const today      = localToday();
  const onLeaveNow = leaves.filter(l => l.start_date <= today && l.end_date >= today);

  return (
    <div style={{ padding: '24px 32px', maxWidth: 880, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 20 }}>

      {/* ── Header ── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--text)' }}>Leave Log</div>
          <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 2 }}>
            Manager-submitted only · {onLeaveNow.length > 0 ? `${onLeaveNow.length} on leave today` : 'No one on leave today'}
          </div>
        </div>
        <button
          onClick={() => setShowModal(true)}
          style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '9px 18px', borderRadius: 8, border: 'none',
            background: 'var(--accent)', color: '#fff', fontSize: 13, fontWeight: 600,
            cursor: 'pointer', fontFamily: 'var(--font-sans)',
          }}
        >
          <Plus size={15} /> Log leave
        </button>
      </div>

      {/* ── On leave today summary ── */}
      {onLeaveNow.length > 0 && (
        <div style={{
          background: 'var(--amber-dim)', border: '1px solid var(--amber)33',
          borderRadius: 10, padding: '10px 16px',
          display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
        }}>
          <Plane size={14} color="var(--amber)" />
          <span style={{ fontSize: 13, color: 'var(--amber)', fontWeight: 600 }}>
            On leave today:
          </span>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {onLeaveNow.map(l => {
              const m = memberMap.get(l.member_id);
              return (
                <span key={l.id} style={{
                  fontSize: 12, color: 'var(--text)', fontWeight: 600,
                  background: 'var(--bg2)', border: '1px solid var(--border)',
                  borderRadius: 99, padding: '2px 10px',
                }}>
                  {m?.name ?? '—'}
                </span>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Month navigation + filter ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <button onClick={() => setMonthOffset(o => o - 1)} style={{
          background: 'none', border: '1px solid var(--border2)', borderRadius: 6,
          padding: '5px 8px', cursor: 'pointer', color: 'var(--text2)', display: 'flex',
        }}>
          <ChevronLeft size={14} />
        </button>
        <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', minWidth: 140, textAlign: 'center' }}>
          {monthLabel(monthOffset)}
        </span>
        <button onClick={() => setMonthOffset(o => o + 1)} style={{
          background: 'none', border: '1px solid var(--border2)', borderRadius: 6,
          padding: '5px 8px', cursor: 'pointer', color: 'var(--text2)', display: 'flex',
        }}>
          <ChevronRight size={14} />
        </button>
        {monthOffset !== 0 && (
          <button onClick={() => setMonthOffset(0)} style={{
            padding: '4px 12px', borderRadius: 99, border: '1px solid var(--border2)',
            background: 'transparent', color: 'var(--accent)', fontSize: 12, fontWeight: 600,
            cursor: 'pointer', fontFamily: 'var(--font-sans)',
          }}>This month</button>
        )}

        {/* Member filter */}
        <div style={{ marginLeft: 'auto' }}>
          <select
            value={memberFilter}
            onChange={e => setMemberFilter(e.target.value)}
            style={{
              padding: '6px 10px', borderRadius: 7, border: '1px solid var(--border2)',
              background: 'var(--bg2)', color: 'var(--text)', fontSize: 12,
              outline: 'none', fontFamily: 'var(--font-sans)', cursor: 'pointer',
              colorScheme: 'dark',
            }}
          >
            <option value="">All members</option>
            {members.map(m => (
              <option key={m.id} value={m.id}>{m.name}</option>
            ))}
          </select>
        </div>
      </div>

      {/* ── Leave type legend ── */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {LEAVE_TYPES.map(t => {
          const count = filtered.filter(l => l.type === t).length;
          return (
            <div key={t} style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '4px 12px', borderRadius: 8,
              background: `${LEAVE_COLOR[t]}10`, border: `1px solid ${LEAVE_COLOR[t]}33`,
            }}>
              <span style={{ fontSize: 15, fontWeight: 700, color: LEAVE_COLOR[t] }}>{count}</span>
              <span style={{ fontSize: 11, color: 'var(--text3)' }}>{t}</span>
            </div>
          );
        })}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 6,
          padding: '4px 12px', borderRadius: 8,
          background: 'var(--bg2)', border: '1px solid var(--border)',
        }}>
          <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)' }}>{filtered.length}</span>
          <span style={{ fontSize: 11, color: 'var(--text3)' }}>total records</span>
        </div>
      </div>

      {/* ── List ── */}
      {loading ? (
        <div style={{ color: 'var(--text3)', fontSize: 13 }}>Loading…</div>
      ) : filtered.length === 0 ? (
        <div style={{
          background: 'var(--bg2)', border: '1px dashed var(--border2)',
          borderRadius: 12, padding: '48px 32px', textAlign: 'center', color: 'var(--text3)',
        }}>
          <div style={{ fontSize: 28, marginBottom: 10 }}>🏖️</div>
          <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text)', marginBottom: 6 }}>
            No leave records for {monthLabel(monthOffset)}
          </div>
          <div style={{ fontSize: 13 }}>
            {memberFilter ? 'Try clearing the member filter.' : 'Click "Log leave" to add one.'}
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {filtered.map(row => (
            <LeaveCard
              key={row.id}
              row={row}
              member={memberMap.get(row.member_id)}
              onDelete={() => handleDelete(row.id)}
            />
          ))}
        </div>
      )}

      {/* ── Modal ── */}
      {showModal && me && (
        <LeaveModal
          members={members}
          managerId={me.id}
          onSave={handleSave}
          onClose={() => setShowModal(false)}
        />
      )}
    </div>
  );
}
