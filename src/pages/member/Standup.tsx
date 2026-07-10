import { useEffect, useRef, useState } from 'react';
import { Check, ChevronLeft, ChevronRight, Edit2, Plus, X } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../hooks/useAuth';
import { usePageShellStyle } from '../../hooks/usePageShellStyle';
import type { Product } from '../../types';
import Loader from '../../components/UI/Loader';

/* ── constants ── */
const CODE_ORDER = ['HOTEL', 'MENU', 'EVENT', 'ACCOUNT', 'ACCOUNT_LITE'];
const TASK_TYPES = ['Ticket', 'Adhoc', 'Migration', 'Bug fix', 'Performance', 'Integration', 'Enhancement', 'Other'] as const;

const PREFIX_TO_CODE: Record<string, string> = {
  HX: 'HOTEL',
  MX: 'MENU',
  EX: 'EVENT',
};
type TType = typeof TASK_TYPES[number];

/* ── task entry shape ── */
interface TaskEntry {
  type: TType;
  ticket_ref: string;   // empty unless type === 'Ticket'
  desc: string;
}

function emptyTask(type: TType = 'Ticket'): TaskEntry {
  return { type, ticket_ref: '', desc: '' };
}

function serializeTasks(tasks: TaskEntry[]): string | null {
  const valid = tasks.filter(t => t.desc.trim());
  return valid.length > 0 ? JSON.stringify(valid) : null;
}

function parseTasks(raw: string | null | undefined): TaskEntry[] {
  if (!raw) return [emptyTask()];
  try {
    const arr = JSON.parse(raw);
    if (Array.isArray(arr) && arr.length > 0) return arr;
  } catch {
    // legacy plain text → wrap as single entry
    return [{ type: 'Other', ticket_ref: '', desc: raw }];
  }
  return [emptyTask()];
}

function localToday(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function productIdFromRef(ticketRef: string, products: Product[]): string | null {
  const prefix = ticketRef.split('-')[0];
  const code = PREFIX_TO_CODE[prefix];
  if (!code) return null;
  return products.find(p => p.code === code)?.id ?? null;
}

/* ── styles ── */
const inputStyle: React.CSSProperties = {
  padding: '8px 10px', borderRadius: 7,
  border: '1px solid var(--border2)', background: 'var(--bg3)',
  color: 'var(--text)', fontSize: 13, outline: 'none',
  fontFamily: 'var(--font-sans)',
};

/* ── TaskRow ── */
interface TaskRowProps {
  task: TaskEntry;
  onChange: (patch: Partial<TaskEntry>) => void;
  onRemove: () => void;
  canRemove: boolean;
  products: Product[];
}

function TaskRow({ task, onChange, onRemove, canRemove, products }: TaskRowProps) {
  const [hint, setHint] = useState('');
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  function handleTicketRef(val: string) {
    const upper = val.toUpperCase();
    onChange({ ticket_ref: upper });
    setHint('');

    if (debounce.current) clearTimeout(debounce.current);
    if (upper.match(/^[A-Z]{2,5}-\d+$/)) {
      debounce.current = setTimeout(async () => {
        const inferredProductId = productIdFromRef(upper, products);
        const query = supabase
          .from('ticket_imports')
          .select('description, module_name, status')
          .eq('ticket_ref', upper);
        if (inferredProductId) query.eq('product_id', inferredProductId);
        const { data } = await query.order('imported_at', { ascending: false }).limit(1).maybeSingle();
        if (data) {
          const label = data.description || data.module_name || '';
          setHint(label);
          if (!task.desc.trim()) onChange({ desc: label });
        } else {
          setHint('Ticket not found in imports');
        }
      }, 400);
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
        {/* Type */}
        <select
          value={task.type}
          onChange={e => {
            const t = e.target.value as TType;
            onChange({ type: t, ticket_ref: t !== 'Ticket' ? '' : task.ticket_ref });
            setHint('');
          }}
          style={{
            ...inputStyle, cursor: 'pointer', colorScheme: 'dark',
            width: 120, flexShrink: 0,
          }}
        >
          {TASK_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
        </select>

        {/* Ticket ref — only for Ticket type */}
        {task.type === 'Ticket' && (
          <input
            value={task.ticket_ref}
            onChange={e => handleTicketRef(e.target.value)}
            placeholder="HX-1234"
            style={{
              ...inputStyle,
              width: 100, flexShrink: 0,
              fontFamily: 'var(--font-mono)', fontSize: 12,
              borderColor: hint === 'Ticket not found in imports' ? 'var(--amber)' : 'var(--border2)',
            }}
          />
        )}

        {/* Description */}
        <input
          value={task.desc}
          onChange={e => onChange({ desc: e.target.value })}
          placeholder={task.type === 'Ticket' ? 'What was done on this ticket…' : 'Describe the task…'}
          style={{ ...inputStyle, flex: 1 }}
        />

        {/* Remove */}
        {canRemove && (
          <button
            type="button"
            onClick={onRemove}
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              color: 'var(--text3)', display: 'flex', padding: 4, borderRadius: 4, flexShrink: 0,
            }}
          >
            <X size={14} />
          </button>
        )}
      </div>

      {/* Ticket hint */}
      {hint && task.type === 'Ticket' && (
        <div style={{
          marginLeft: 126, fontSize: 11,
          color: hint === 'Ticket not found in imports' ? 'var(--amber)' : 'var(--green)',
          fontStyle: hint === 'Ticket not found in imports' ? 'normal' : 'italic',
        }}>
          {hint === 'Ticket not found in imports' ? '⚠ ' : '✓ '}{hint}
        </div>
      )}
    </div>
  );
}

/* ── TaskList ── */
function TaskList({
  label, tasks, onChange, products, required,
}: {
  label: string;
  tasks: TaskEntry[];
  onChange: (tasks: TaskEntry[]) => void;
  products: Product[];
  required?: boolean;
}) {
  function update(i: number, patch: Partial<TaskEntry>) {
    onChange(tasks.map((t, idx) => idx === i ? { ...t, ...patch } : t));
  }
  function remove(i: number) {
    onChange(tasks.filter((_, idx) => idx !== i));
  }
  function add() {
    onChange([...tasks, emptyTask()]);
  }

  return (
    <div>
      <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--text2)', marginBottom: 8 }}>
        {label}
        {required && <span style={{ color: 'var(--red)', marginLeft: 3 }}>*</span>}
      </div>
      <div style={{
        background: 'var(--bg3)', border: '1px solid var(--border2)',
        borderRadius: 9, padding: '12px 14px',
        display: 'flex', flexDirection: 'column', gap: 10,
      }}>
        {tasks.map((task, i) => (
          <TaskRow
            key={i}
            task={task}
            onChange={patch => update(i, patch)}
            onRemove={() => remove(i)}
            canRemove={tasks.length > 1}
            products={products}
          />
        ))}
        <button
          type="button"
          onClick={add}
          style={{
            display: 'flex', alignItems: 'center', gap: 5,
            background: 'none', border: 'none', cursor: 'pointer',
            color: 'var(--accent)', fontSize: 12, fontWeight: 600,
            padding: '2px 0', fontFamily: 'var(--font-sans)',
            alignSelf: 'flex-start',
          }}
        >
          <Plus size={13} /> Add task
        </button>
      </div>
    </div>
  );
}

/* ── read-only task display ── */
function TaskDisplay({ raw }: { raw: string | null }) {
  const tasks = parseTasks(raw);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {tasks.map((t, i) => (
        <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
          <span style={{
            fontSize: 10, fontWeight: 600, padding: '2px 7px', borderRadius: 3,
            background: 'var(--bg4)', color: 'var(--text3)', flexShrink: 0, marginTop: 2,
          }}>
            {t.type}
          </span>
          {t.ticket_ref && (
            <span style={{
              fontSize: 11, color: 'var(--accent)', fontFamily: 'var(--font-mono)',
              background: 'var(--accent-dim)', borderRadius: 3, padding: '2px 7px',
              flexShrink: 0, marginTop: 1,
            }}>
              {t.ticket_ref}
            </span>
          )}
          <span style={{ fontSize: 13, color: 'var(--text)', lineHeight: 1.5 }}>{t.desc}</span>
        </div>
      ))}
    </div>
  );
}

/* ── LogEntry ── */
interface LogEntry {
  id: string;
  product_id: string | null;
  date: string;
  yesterday: string | null;
  today: string | null;
  blockers: string | null;
  ticket_ref: string | null;
}

function addDays(dateStr: string, n: number): string {
  const d = new Date(dateStr + 'T00:00:00');
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/* ── Main component ── */
export default function MemberStandup() {
  const { member } = useAuth();
  const today = localToday();
  const pageStyle = usePageShellStyle({ maxWidth: 760, gap: 24 });

  const [selectedDate, setSelectedDate] = useState(today);
  const isToday = selectedDate === today;

  const [products, setProducts] = useState<Product[]>([]);
  const [existing, setExisting] = useState<LogEntry | null>(null);
  const [history, setHistory]   = useState<LogEntry[]>([]);
  const [editing, setEditing]   = useState(false);
  const [loading, setLoading]   = useState(true);

  const [yesterdayTasks, setYesterday]  = useState<TaskEntry[]>([emptyTask()]);
  const [todayTasks, setToday]          = useState<TaskEntry[]>([emptyTask()]);
  const [blockers, setBlockers]         = useState('');

  const [saving, setSaving] = useState(false);
  const [saved, setSaved]   = useState(false);
  const [error, setError]   = useState('');

  function fillForm(log: LogEntry) {
    setYesterday(parseTasks(log.yesterday));
    setToday(parseTasks(log.today));
    setBlockers(log.blockers ?? '');
  }

  function resetForm() {
    setYesterday([emptyTask()]);
    setToday([emptyTask()]);
    setBlockers('');
    setExisting(null);
    setEditing(false);
    setSaved(false);
    setError('');
  }

  // Load products once
  useEffect(() => {
    supabase.from('products').select('*').then(({ data: prods }) => {
      const sorted = (prods ?? []).sort((a, b) => CODE_ORDER.indexOf(a.code) - CODE_ORDER.indexOf(b.code));
      setProducts(sorted);
    });
  }, []);

  // Reload standup log + history when date or member changes
  useEffect(() => {
    if (!member) return;
    setLoading(true);
    resetForm();
    const prevDate = addDays(selectedDate, -1);
    Promise.all([
      supabase.from('standup_logs')
        .select('id, product_id, date, yesterday, today, blockers, ticket_ref')
        .eq('member_id', member.id).eq('date', selectedDate).maybeSingle(),
      supabase.from('standup_logs')
        .select('id, product_id, date, yesterday, today, blockers, ticket_ref')
        .eq('member_id', member.id)
        .order('date', { ascending: false }).limit(11),
      supabase.from('standup_logs')
        .select('today')
        .eq('member_id', member.id).eq('date', prevDate).maybeSingle(),
    ]).then(([{ data: log }, { data: hist }, { data: prevLog }]) => {
      if (log) {
        setExisting(log);
        fillForm(log);
      } else if (prevLog?.today) {
        // Pre-fill yesterday section from previous day's "today" tasks
        const prevTasks = parseTasks(prevLog.today);
        if (prevTasks.length > 0 && prevTasks[0].desc.trim()) {
          setYesterday(prevTasks);
        }
      }
      setHistory((hist ?? []).filter(h => h.date !== selectedDate).slice(0, 7));
      setLoading(false);
    });
  }, [member, selectedDate]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!member) return;
    const todaySerialized = serializeTasks(todayTasks);
    if (!todaySerialized) { setError('Please add at least one task for today.'); return; }

    setSaving(true); setError('');

    // First ticket ref found across today + yesterday (for auto-link trigger)
    const allRefs = [...todayTasks, ...yesterdayTasks]
      .map(t => t.ticket_ref)
      .filter(Boolean);
    const primaryRef = allRefs[0] || null;

    // Infer primary product from first recognized ticket prefix
    const derivedProductId = allRefs.map(ref => productIdFromRef(ref, products)).find(id => id !== null) ?? null;

    // Primary task type (first today task)
    const primaryType = todayTasks[0]?.type ?? 'Other';

    const { error: err } = await supabase.from('standup_logs').upsert({
      member_id:  member.id,
      product_id: derivedProductId,
      date:       selectedDate,
      task_type:  primaryType,
      yesterday:  serializeTasks(yesterdayTasks),
      today:      todaySerialized,
      blockers:   blockers.trim() || null,
      ticket_ref: primaryRef,
    }, { onConflict: 'member_id,date' });

    setSaving(false);
    if (err) { setError(err.message); return; }

    // Only send Discord notification for same-day submissions
    if (isToday) {
      const productCode = products.find(p => p.id === derivedProductId)?.code ?? null;
      supabase.functions.invoke('notify-discord', {
        body: {
          member_name: member.name,
          product_code: productCode,
          date:         selectedDate,
          task_type:    primaryType,
          today:        todaySerialized,
          yesterday:    serializeTasks(yesterdayTasks),
          blockers:     blockers.trim() || null,
        },
      }).catch(() => {/* ignore notification errors */});
    }

    const updated: LogEntry = {
      id: existing?.id ?? '',
      product_id: derivedProductId,
      date: selectedDate,
      yesterday: serializeTasks(yesterdayTasks),
      today: todaySerialized,
      blockers: blockers.trim() || null,
      ticket_ref: primaryRef,
    };
    setExisting(updated);
    setEditing(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  }

  const showForm = !existing || editing;

  if (loading) return <Loader label="Loading…" padding={64} />;

  return (
    <div style={pageStyle}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
        {/* Date navigation */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button onClick={() => setSelectedDate(d => addDays(d, -1))} style={{
            background: 'none', border: '1px solid var(--border2)', borderRadius: 6,
            padding: '6px 9px', cursor: 'pointer', color: 'var(--text2)', display: 'flex',
          }}>
            <ChevronLeft size={15} />
          </button>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text)' }}>
              {isToday ? 'Today' : new Date(selectedDate + 'T00:00:00').toLocaleDateString('en-MY', { weekday: 'short', day: 'numeric', month: 'short' })}
            </div>
            <div style={{ fontSize: 11, color: 'var(--text3)' }}>
              {new Date(selectedDate + 'T00:00:00').toLocaleDateString('en-MY', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
            </div>
          </div>
          <button onClick={() => setSelectedDate(d => addDays(d, 1))} disabled={isToday} style={{
            background: 'none', border: '1px solid var(--border2)', borderRadius: 6,
            padding: '6px 9px', cursor: isToday ? 'not-allowed' : 'pointer',
            color: 'var(--text2)', display: 'flex', opacity: isToday ? 0.35 : 1,
          }}>
            <ChevronRight size={15} />
          </button>
          {!isToday && (
            <button onClick={() => setSelectedDate(today)} style={{
              padding: '5px 12px', borderRadius: 99, border: '1px solid var(--border2)',
              background: 'transparent', color: 'var(--accent)', fontSize: 12, fontWeight: 600,
              cursor: 'pointer', fontFamily: 'var(--font-sans)',
            }}>Today</button>
          )}
        </div>

        {existing && !editing && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{
              display: 'flex', alignItems: 'center', gap: 6, padding: '6px 14px',
              borderRadius: 99, background: 'var(--green-dim)', border: '1px solid var(--green)33',
              fontSize: 12, fontWeight: 600, color: 'var(--green)',
            }}>
              <Check size={13} /> Submitted
            </div>
            <button onClick={() => setEditing(true)} style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '6px 14px', borderRadius: 99, border: '1px solid var(--border2)',
              background: 'transparent', color: 'var(--text2)', fontSize: 12, fontWeight: 500,
              cursor: 'pointer', fontFamily: 'var(--font-sans)',
            }}>
              <Edit2 size={12} /> Edit
            </button>
          </div>
        )}
      </div>

      {/* Back-date notice */}
      {!isToday && (
        <div style={{
          padding: '10px 14px', borderRadius: 8,
          border: '1px solid var(--accent)33', background: 'var(--accent-dim)',
          fontSize: 12, color: 'var(--text2)',
        }}>
          Submitting standup for a past date — this will appear in the team standup log for that day.
        </div>
      )}

      {saved && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8, padding: '10px 16px',
          borderRadius: 8, background: 'var(--green-dim)', border: '1px solid var(--green)33',
          fontSize: 13, color: 'var(--green)', fontWeight: 500,
        }}>
          <Check size={14} /> Standup {existing ? 'updated' : 'submitted'}{isToday ? ' — have a productive day!' : ` for ${new Date(selectedDate + 'T00:00:00').toLocaleDateString('en-MY', { day: 'numeric', month: 'short' })}.`}
        </div>
      )}

      {/* Read-only view */}
      {existing && !editing && (
        <div style={{
          background: 'var(--bg2)', border: '1px solid var(--border)',
          borderRadius: 12, padding: 24, display: 'flex', flexDirection: 'column', gap: 18,
        }}>
          {[
            { label: 'Yesterday', raw: existing.yesterday },
            { label: 'Today',     raw: existing.today },
          ].map(f => (
            <div key={f.label}>
              <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>
                {f.label}
              </div>
              <TaskDisplay raw={f.raw} />
            </div>
          ))}
          {existing.blockers && (
            <div>
              <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--red)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 5 }}>
                Blockers
              </div>
              <div style={{ fontSize: 13, color: 'var(--text)', lineHeight: 1.6 }}>{existing.blockers}</div>
            </div>
          )}
        </div>
      )}

      {/* Form */}
      {showForm && (
        <form onSubmit={handleSubmit} style={{
          background: 'var(--bg2)', border: '1px solid var(--border)',
          borderRadius: 12, padding: 24, display: 'flex', flexDirection: 'column', gap: 20,
        }}>
          <TaskList
            label="What did you do yesterday?"
            tasks={yesterdayTasks}
            onChange={setYesterday}
            products={products}
          />

          <TaskList
            label="What will you do today?"
            tasks={todayTasks}
            onChange={setToday}
            products={products}
            required
          />

          {/* Blockers */}
          <div>
            <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--text2)', marginBottom: 6 }}>
              Blockers <span style={{ color: 'var(--text3)', fontWeight: 400 }}>(optional)</span>
            </div>
            <textarea
              value={blockers}
              onChange={e => setBlockers(e.target.value)}
              rows={2}
              placeholder="None  /  Waiting for vendor reply on API docs"
              style={{
                ...inputStyle, width: '100%', resize: 'vertical',
                border: '1px solid var(--border2)',
              }}
            />
          </div>

          {error && (
            <div style={{ fontSize: 13, color: 'var(--red)', background: 'var(--red-dim)', padding: '8px 12px', borderRadius: 8, border: '1px solid var(--red)33' }}>
              {error}
            </div>
          )}

          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
            {editing && (
              <button type="button" onClick={() => { setEditing(false); fillForm(existing!); }} style={{
                padding: '10px 20px', borderRadius: 8, border: '1px solid var(--border2)',
                background: 'transparent', color: 'var(--text2)', fontSize: 13, fontWeight: 600,
                cursor: 'pointer', fontFamily: 'var(--font-sans)',
              }}>Cancel</button>
            )}
            <button type="submit" disabled={saving} style={{
              padding: '10px 28px', borderRadius: 8, border: 'none',
              background: 'var(--accent)', color: '#fff', fontSize: 13, fontWeight: 600,
              cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.6 : 1,
              fontFamily: 'var(--font-sans)', display: 'flex', alignItems: 'center', gap: 7,
              transition: 'opacity 0.15s',
            }}>
              {saving ? 'Saving…' : <><Check size={14} />{existing ? 'Update standup' : 'Submit standup'}</>}
            </button>
          </div>
        </form>
      )}

      {/* History */}
      {history.length > 0 && (
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text3)', marginBottom: 12, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            Recent history
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {history.map(log => (
              <div key={log.id} style={{
                background: 'var(--bg2)', border: '1px solid var(--border)',
                borderRadius: 10, padding: '12px 16px',
                display: 'flex', gap: 14, alignItems: 'flex-start',
              }}>
                <div style={{ flexShrink: 0, width: 36, textAlign: 'center' }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--accent)' }}>
                    {new Date(log.date + 'T00:00:00').getDate()}
                  </div>
                  <div style={{ fontSize: 10, color: 'var(--text3)' }}>
                    {new Date(log.date + 'T00:00:00').toLocaleDateString('en-MY', { month: 'short' })}
                  </div>
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <TaskDisplay raw={log.today} />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
